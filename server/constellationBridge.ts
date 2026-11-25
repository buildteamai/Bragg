/**
 * Node-to-Python bridge calling SOT's `architekton_engine.constellation` directly.
 * Keeps `apps/architekton` as the single source of truth for constellation math
 * (single_view, ortho.glass_box, sections.check_points, coverage).
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { MeshBlueprint } from '../src/types/blueprint';
import type {
  ConstellationCameraJson,
  ConstellationCheckPointInput,
  ConstellationCoverageRow,
  ConstellationDimensionCI,
  ConstellationFaceId,
  ConstellationGlassBoxResult,
  ConstellationInventory,
  ConstellationPointCheckResult,
  ConstellationQaGateReport,
  ConstellationSpec,
} from '../src/types/constellation';
import {
  parseConstellationCameraJson,
  project18dMmToPhotoPx,
} from '../src/engine/constellationCamera';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveArchitektonRoot(): string {
  if (process.env.ARCHITEKTON_ROOT && fs.existsSync(process.env.ARCHITEKTON_ROOT)) {
    return process.env.ARCHITEKTON_ROOT;
  }
  const sotRoot = process.env.SOT_ROOT || path.resolve(__dirname, '..', '..', '..');
  const candidate = path.join(sotRoot, 'apps', 'architekton');
  return candidate;
}

function buildArchitektonEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const archRoot = resolveArchitektonRoot();
  if (!env.UV_PROJECT_ENVIRONMENT && env.LOCALAPPDATA) {
    env.UV_PROJECT_ENVIRONMENT = path.join(env.LOCALAPPDATA, 'sot', 'venvs', 'architekton');
  }
  env.PYTHONPATH = env.PYTHONPATH ? `${archRoot}${path.delimiter}${env.PYTHONPATH}` : archRoot;
  return env;
}

async function runArchitektonPython(
  scriptSource: string,
  payload: Record<string, any>,
  timeoutMs = 45_000
): Promise<any> {
  const archRoot = resolveArchitektonRoot();
  if (!fs.existsSync(path.join(archRoot, 'architekton_engine', 'constellation', '__init__.py'))) {
    throw new Error(`architekton_engine.constellation not found under ${archRoot}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '18d-constellation-'));
  const inPath = path.join(tmpDir, 'input.json');
  const outPath = path.join(tmpDir, 'output.json');
  const pyPath = path.join(tmpDir, 'runner.py');

  try {
    fs.writeFileSync(inPath, JSON.stringify(payload), 'utf-8');
    fs.writeFileSync(pyPath, scriptSource, 'utf-8');

    const env = buildArchitektonEnv();
    const candidates: Array<{ cmd: string; args: string[] }> = [
      {
        cmd: 'uv',
        args: ['run', '--quiet', '--no-sync', '--directory', archRoot, 'python', pyPath, inPath, outPath],
      },
      { cmd: 'python', args: [pyPath, inPath, outPath] },
      { cmd: 'py', args: ['-3', pyPath, inPath, outPath] },
    ];

    let lastErr: unknown = null;
    for (const c of candidates) {
      try {
        await execFileAsync(c.cmd, c.args, {
          env,
          timeout: timeoutMs,
          maxBuffer: 40 * 1024 * 1024,
          windowsHide: true,
        });
        if (fs.existsSync(outPath)) {
          return JSON.parse(fs.readFileSync(outPath, 'utf-8'));
        }
      } catch (err) {
        lastErr = err;
      }
    }

    const msg =
      lastErr instanceof Error
        ? (lastErr as any)?.stderr?.toString?.() || lastErr.message
        : String(lastErr);
    throw new Error(`Constellation Python execution failed: ${msg.slice(0, 600)}`);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function checkConstellationStatus(): Promise<{
  available: boolean;
  architektonRoot: string;
  error?: string;
}> {
  const archRoot = resolveArchitektonRoot();
  const initFile = path.join(archRoot, 'architekton_engine', 'constellation', '__init__.py');
  if (!fs.existsSync(initFile)) {
    return {
      available: false,
      architektonRoot: archRoot,
      error: `Missing ${initFile}`,
    };
  }
  return { available: true, architektonRoot: archRoot };
}

/**
 * Integration 2: Run `architekton_engine.constellation.single_view.solve(marks)`
 * (and optional `camera_to_model` if modelPoints are provided) -> ConstellationSpec + camera.json.
 */
export async function runConstellationSingleView(params: {
  marks: Record<string, any>;
  modelPoints?: Record<string, [number, number, number]>;
  units?: 'mm' | 'in';
  sigmaPx?: number;
  trials?: number;
}): Promise<ConstellationSpec> {
  const pyScript = `
import json, sys
from architekton_engine.constellation import single_view

with open(sys.argv[1], "r", encoding="utf-8") as fh:
    req = json.load(fh)

marks = req["marks"]
sigma_px = float(req.get("sigmaPx", 1.5))
trials = int(req.get("trials", 200))
spec, gaps, report = single_view.solve(marks, sigma_px=sigma_px, trials=trials)

cam_dict = None
model_points = req.get("modelPoints")
if isinstance(model_points, dict) and len(model_points) >= 2:
    cam_out = single_view.camera_to_model(report, model_points, units=req.get("units", "mm"))
    if isinstance(cam_out, dict):
        cam_dict = cam_out
elif isinstance(report, dict) and isinstance(report.get("camera"), dict):
    cam_dict = report["camera"]

with open(sys.argv[2], "w", encoding="utf-8") as fh:
    json.dump({"spec": spec, "gaps": gaps, "report": report, "camera": cam_dict}, fh)
`;

  const result = await runArchitektonPython(pyScript, {
    marks: params.marks,
    modelPoints: params.modelPoints,
    units: params.units || 'mm',
    sigmaPx: params.sigmaPx ?? 1.5,
    trials: params.trials ?? 200,
  });

  return normalizeSingleViewOutput(result.spec, result.gaps, result.report, result.camera);
}

/** Normalize raw `single_view.solve()` output (in inches or mm) into 18D's mm ConstellationSpec. */
export function normalizeSingleViewOutput(
  spec: any,
  gaps: any,
  report: any,
  rawCam?: any
): ConstellationSpec {
  const IN_TO_MM = 25.4;
  const dimensions: ConstellationDimensionCI[] = [];
  const pointsMm: Record<string, [number, number, number]> = {};

  const rawDims = spec?.dims || spec?.dimensions || report?.dims || {};
  if (rawDims && typeof rawDims === 'object') {
    for (const [name, entry] of Object.entries<any>(rawDims)) {
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        dimensions.push({
          name,
          valueIn: entry,
          valueMm: Math.round(entry * IN_TO_MM * 10) / 10,
        });
      } else if (entry && typeof entry === 'object') {
        const valIn = Number(entry.value ?? entry.mean ?? entry.median ?? entry.in ?? entry.inches);
        const valMmRaw = Number(entry.mm ?? entry.value_mm);
        const ci = Array.isArray(entry.ci95) ? entry.ci95 : Array.isArray(entry.range95) ? entry.range95 : null;
        if (Number.isFinite(valMmRaw)) {
          dimensions.push({
            name,
            valueMm: Math.round(valMmRaw * 10) / 10,
            lo95Mm: ci ? Math.round(Number(ci[0]) * 10) / 10 : undefined,
            hi95Mm: ci ? Math.round(Number(ci[1]) * 10) / 10 : undefined,
            source: typeof entry.source === 'string' ? entry.source : undefined,
            note: typeof entry.note === 'string' ? entry.note : undefined,
          });
        } else if (Number.isFinite(valIn)) {
          dimensions.push({
            name,
            valueIn: Math.round(valIn * 100) / 100,
            valueMm: Math.round(valIn * IN_TO_MM * 10) / 10,
            lo95In: ci ? Math.round(Number(ci[0]) * 100) / 100 : undefined,
            hi95In: ci ? Math.round(Number(ci[1]) * 100) / 100 : undefined,
            lo95Mm: ci ? Math.round(Number(ci[0]) * IN_TO_MM * 10) / 10 : undefined,
            hi95Mm: ci ? Math.round(Number(ci[1]) * IN_TO_MM * 10) / 10 : undefined,
            source: typeof entry.source === 'string' ? entry.source : undefined,
            note: typeof entry.note === 'string' ? entry.note : undefined,
          });
        }
      }
    }
  }

  const rawPts = spec?.points || report?.points || {};
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  if (rawPts && typeof rawPts === 'object') {
    for (const [name, p] of Object.entries<any>(rawPts)) {
      const arr = Array.isArray(p) ? p : Array.isArray(p?.xyz) ? p.xyz : null;
      if (arr && arr.length >= 3 && arr.every((n: any) => Number.isFinite(Number(n)))) {
        // single_view points are in inches (Z-up) unless spec.units === 'mm'
        const scale = spec?.units === 'mm' ? 1.0 : IN_TO_MM;
        const x = Math.round(Number(arr[0]) * scale * 10) / 10;
        const y = Math.round(Number(arr[1]) * scale * 10) / 10;
        const z = Math.round(Number(arr[2]) * scale * 10) / 10;
        pointsMm[name] = [x, y, z];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
    }
  }

  // Derive envelope (18D Y-up: width=X, height=Z_zup, depth=Y_zup)
  let envelopeMm: { width: number; height: number; depth: number } | undefined;
  if (Number.isFinite(minX) && maxX > minX) {
    envelopeMm = {
      width: Math.max(10, Math.round(maxX - minX)),
      depth: Math.max(10, Math.round(maxY - minY)),
      height: Math.max(10, Math.round(maxZ - minZ)),
    };
  }

  const gapList: string[] = Array.isArray(gaps)
    ? gaps.map((g: any) => (typeof g === 'string' ? g : JSON.stringify(g)))
    : [];

  const parsedCam = parseConstellationCameraJson(rawCam || report?.camera || spec?.camera);

  return {
    envelopeMm,
    dimensions,
    pointsMm,
    gaps: gapList,
    scaleCheck:
      typeof report?.scale_check === 'string'
        ? report.scale_check
        : typeof report?.priors?.verdict === 'string'
          ? report.priors.verdict
          : undefined,
    focalObsSdPct: Number.isFinite(Number(report?.focal_obs_sd_pct))
      ? Number(report.focal_obs_sd_pct)
      : undefined,
    focalTensionSigma: Number.isFinite(Number(report?.focal_tension_sigma))
      ? Number(report.focal_tension_sigma)
      : undefined,
    camera: parsedCam || undefined,
    rawSpec: spec,
    rawReport: report,
  };
}

/**
 * Integration 3: Run `architekton_engine.constellation.ortho.glass_box`
 * to rectify perspective photo faces into true-scale orthographic PNGs (FRONT, TOP, SIDE).
 */
export async function runConstellationGlassBox(params: {
  imageBase64: string;
  camera: ConstellationCameraJson;
  boundsMm: { min: [number, number, number]; max: [number, number, number] };
  axes?: [[number, number, number], [number, number, number], [number, number, number]];
  origin?: [number, number, number];
  res?: number;
}): Promise<ConstellationGlassBoxResult> {
  const cleanB64 = params.imageBase64.includes(',')
    ? params.imageBase64.split(',').pop() || ''
    : params.imageBase64;

  const pyScript = `
import base64, io, json, sys
import numpy as np
from PIL import Image
from architekton_engine.constellation import Camera, glass_box

with open(sys.argv[1], "r", encoding="utf-8") as fh:
    req = json.load(fh)

img_bytes = base64.b64decode(req["imageBase64"])
im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
arr = np.asarray(im, dtype=float)

cam = Camera.from_dict(req["camera"])
lo = np.asarray(req["lo"], dtype=float)
hi = np.asarray(req["hi"], dtype=float)
axes = np.asarray(req.get("axes", [[1, 0, 0], [0, 1, 0], [0, 0, 1]]), dtype=float)
origin = np.asarray(req.get("origin", [0, 0, 0]), dtype=float)
res = req.get("res", None)

views = glass_box(arr, cam, axes, origin, lo, hi, res=res)
faces_out = {}
for name, v in views.items():
    img_f = v["image"]
    valid = ~np.isnan(img_f[..., 0])
    rgb = np.where(np.isnan(img_f), 255.0, np.clip(img_f, 0.0, 255.0)).astype(np.uint8)
    alpha = (valid.astype(np.uint8) * 255)[..., None]
    rgba = np.concatenate([rgb, alpha], axis=-1)
    pil_out = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    pil_out.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    ext = v.get("extent")
    if isinstance(ext, (list, tuple)) and len(ext) >= 2:
        ext_mm = [float(ext[0]), float(ext[1])]
    else:
        ext_mm = [float(pil_out.width) / max(1e-6, float(v["scale"])), float(pil_out.height) / max(1e-6, float(v["scale"]))]
    faces_out[name] = {
        "face": name,
        "imageDataUrl": "data:image/png;base64," + b64,
        "widthPx": int(pil_out.width),
        "heightPx": int(pil_out.height),
        "scalePxPerMm": float(v["scale"]),
        "extentMm": ext_mm,
    }

with open(sys.argv[2], "w", encoding="utf-8") as fh:
    json.dump({"faces": faces_out, "camera": cam.to_dict()}, fh)
`;

  // Convert 18D Y-up mm bounds to camera frame (zup or yup)
  const frame = params.camera.frame ?? 'zup';
  const bMin = params.boundsMm.min;
  const bMax = params.boundsMm.max;
  const lo = frame === 'yup' ? bMin : [bMin[0], -bMax[2], bMin[1]];
  const hi = frame === 'yup' ? bMax : [bMax[0], -bMin[2], bMax[1]];

  const out = await runArchitektonPython(pyScript, {
    imageBase64: cleanB64,
    camera: params.camera,
    lo,
    hi,
    axes: params.axes,
    origin: params.origin,
    res: params.res,
  });

  return {
    faces: out.faces as Partial<Record<ConstellationFaceId, any>>,
    camera: params.camera,
    engine: 'architekton-constellation',
  };
}

/** Simple wildcard/glob matcher for part names & IDs (matches Constellation prim_globs). */
function matchesGlob(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value) || value.toLowerCase().includes(pattern.toLowerCase().replace(/\*/g, ''));
}

function boxIoU(a: [number, number, number, number], b: [number, number, number, number]): number {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const denom = areaA + areaB - inter;
  return denom > 1e-6 ? inter / denom : 0;
}

/** Estimate an axis-aligned 3D bounding box (mm, 18D Y-up) for a BlueprintPart. */
function estimatePartBoundsMm(part: any): { min: [number, number, number]; max: [number, number, number] } {
  const pos: [number, number, number] = Array.isArray(part.positionMm) ? part.positionMm : [0, 0, 0];
  const dims = part.geometry?.dimensionsMm || part.dimensionsMm || {};
  const w = Number(dims.width ?? (dims.outerRadius != null ? dims.outerRadius * 2 : undefined) ?? (dims.radius != null ? dims.radius * 2 : undefined) ?? 100);
  const h = Number(dims.height ?? dims.length ?? (dims.radius != null ? dims.radius * 2 : undefined) ?? 100);
  const d = Number(dims.depth ?? (dims.outerRadius != null ? dims.outerRadius * 2 : undefined) ?? (dims.radius != null ? dims.radius * 2 : undefined) ?? 100);
  return {
    min: [pos[0] - w * 0.5, pos[1] - h * 0.5, pos[2] - d * 0.5],
    max: [pos[0] + w * 0.5, pos[1] + h * 0.5, pos[2] + d * 0.5],
  };
}

function projectBoundsToPhotoBox(
  bounds: { min: [number, number, number]; max: [number, number, number] },
  cam: ConstellationCameraJson
): [number, number, number, number] | null {
  const xs = [bounds.min[0], bounds.max[0]];
  const ys = [bounds.min[1], bounds.max[1]];
  const zs = [bounds.min[2], bounds.max[2]];
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  let valid = 0;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const p = project18dMmToPhotoPx([x, y, z], cam);
        if (p.inFront && Number.isFinite(p.uv[0]) && Number.isFinite(p.uv[1])) {
          u0 = Math.min(u0, p.uv[0]);
          v0 = Math.min(v0, p.uv[1]);
          u1 = Math.max(u1, p.uv[0]);
          v1 = Math.max(v1, p.uv[1]);
          valid++;
        }
      }
    }
  }
  if (valid < 2) return null;
  return [Math.round(u0), Math.round(v0), Math.round(u1), Math.round(v1)];
}

/**
 * Integration 4: Quantitative Constellation QA Gate (`coverage` + `check_points`)
 * runs alongside `cadKernelGate` to verify photo-space object coverage % and keypoint RMS px.
 */
export async function runConstellationQaGate(params: {
  blueprint: MeshBlueprint;
  camera: ConstellationCameraJson;
  inventory?: ConstellationInventory;
  checkPoints?: ConstellationCheckPointInput[];
  tolPx?: number;
  iouOk?: number;
  iouGood?: number;
}): Promise<ConstellationQaGateReport> {
  const tolPx = params.tolPx ?? 4.0;
  const iouOk = params.iouOk ?? 0.3;
  const iouGood = params.iouGood ?? 0.7;
  const parts = Array.isArray(params.blueprint?.parts) ? params.blueprint.parts : [];

  // 1. Point reprojection checks (constellation sections.check_points semantics)
  const pointChecks: ConstellationPointCheckResult[] = [];
  const sqErrs: number[] = [];
  let maxErrPx = 0;
  let withinTolCount = 0;

  for (const pt of params.checkPoints || []) {
    let target3d = pt.modelMm;
    if (!target3d && pt.partGlobs && pt.partGlobs.length > 0) {
      const match = parts.find((p) =>
        pt.partGlobs!.some((g) => matchesGlob(p.id, g) || matchesGlob(p.name || '', g))
      );
      if (match && Array.isArray(match.positionMm)) {
        target3d = match.positionMm as [number, number, number];
      }
    }
    if (!target3d) {
      pointChecks.push({
        label: pt.label,
        uvPhoto: pt.uv,
        uvProjected: null,
        errPx: null,
        withinTol: false,
        status: 'unmatched',
        note: 'No 3D model coordinate or matching part',
      });
      continue;
    }

    const proj = project18dMmToPhotoPx(target3d, params.camera);
    if (!proj.inFront) {
      pointChecks.push({
        label: pt.label,
        uvPhoto: pt.uv,
        uvProjected: null,
        errPx: null,
        withinTol: false,
        status: 'occluded',
        note: 'Projected point is behind camera',
      });
      continue;
    }

    const du = proj.uv[0] - pt.uv[0];
    const dv = proj.uv[1] - pt.uv[1];
    const err = Math.hypot(du, dv);
    sqErrs.push(err * err);
    maxErrPx = Math.max(maxErrPx, err);
    const ok = err <= tolPx;
    if (ok) withinTolCount++;

    pointChecks.push({
      label: pt.label,
      uvPhoto: pt.uv,
      uvProjected: [Math.round(proj.uv[0] * 10) / 10, Math.round(proj.uv[1] * 10) / 10],
      errPx: Math.round(err * 100) / 100,
      withinTol: ok,
      status: ok ? 'ok' : 'miss',
    });
  }

  const rmsPx =
    sqErrs.length > 0
      ? Math.round(Math.sqrt(sqErrs.reduce((a, b) => a + b, 0) / sqErrs.length) * 100) / 100
      : null;
  const withinTolPct =
    sqErrs.length > 0 ? Math.round((withinTolCount / sqErrs.length) * 1000) / 10 : null;

  // 2. Coverage inventory audit (constellation coverage.py thresholds: >=0.7 ok, 0.3-0.7 rough, <0.3 misplaced)
  const objects: ConstellationCoverageRow[] = [];
  let toModelCount = 0;
  let okCount = 0;
  let roughCount = 0;
  let misplacedCount = 0;
  let missingCount = 0;
  let wrongCount = 0;
  let gapCount = 0;

  for (const item of params.inventory?.objects || []) {
    const kind = item.kind ?? 'model';
    if (kind === 'art' || kind === 'background' || kind === 'out_of_scope') {
      objects.push({
        id: item.id,
        cls: item.cls || kind,
        status: 'ignored',
        iou: 0,
        expectedBox: item.box,
        matchedParts: [],
        note: item.note,
      });
      continue;
    }
    if (kind === 'gap') {
      gapCount++;
      objects.push({
        id: item.id,
        cls: item.cls || 'gap',
        status: 'gap',
        iou: 0,
        expectedBox: item.box,
        matchedParts: [],
        note: item.note || 'Declared gap (not yet sourced)',
      });
      continue;
    }

    toModelCount++;
    const globs = item.partGlobs || item.prim_globs || [item.id];
    const matched = parts.filter((p) =>
      globs.some((g) => matchesGlob(p.id, g) || matchesGlob(p.name || '', g) || matchesGlob(p.group || '', g))
    );
    const matchedIds = matched.map((p) => p.id);

    if (matched.length === 0) {
      missingCount++;
      objects.push({
        id: item.id,
        cls: item.cls || 'part',
        status: 'missing',
        iou: 0,
        expectedBox: item.box,
        projectedBox: null,
        matchedParts: [],
        note: `No blueprint parts matched [${globs.join(', ')}]`,
      });
      continue;
    }

    // Union projected box of matched parts
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const p of matched) {
      const pb = projectBoundsToPhotoBox(estimatePartBoundsMm(p), params.camera);
      if (pb) {
        u0 = Math.min(u0, pb[0]);
        v0 = Math.min(v0, pb[1]);
        u1 = Math.max(u1, pb[2]);
        v1 = Math.max(v1, pb[3]);
      }
    }
    const projBox: [number, number, number, number] | null =
      Number.isFinite(u0) ? [u0, v0, u1, v1] : null;
    const iou = projBox ? Math.round(boxIoU(item.box, projBox) * 1000) / 1000 : 0;

    const expCenter: [number, number] = [(item.box[0] + item.box[2]) * 0.5, (item.box[1] + item.box[3]) * 0.5];
    const offsetPx: [number, number] | undefined = projBox
      ? [
          Math.round(((projBox[0] + projBox[2]) * 0.5 - expCenter[0]) * 10) / 10,
          Math.round(((projBox[1] + projBox[3]) * 0.5 - expCenter[1]) * 10) / 10,
        ]
      : undefined;

    const expectedCount = item.expectedCount ?? item.count;
    let status: ConstellationCoverageRow['status'];
    if (expectedCount !== undefined && matched.length !== expectedCount) {
      status = 'count';
      wrongCount++;
    } else if (iou >= iouGood) {
      status = 'ok';
      okCount++;
    } else if (iou >= iouOk) {
      status = 'rough';
      roughCount++;
    } else {
      status = 'misplaced';
      misplacedCount++;
    }

    objects.push({
      id: item.id,
      cls: item.cls || 'part',
      status,
      iou,
      offsetPx,
      expectedBox: item.box,
      projectedBox: projBox,
      matchedParts: matchedIds,
      note:
        status === 'count'
          ? `Expected ${expectedCount} parts, found ${matched.length}`
          : item.note,
    });
  }

  const coveragePct =
    toModelCount > 0 ? Math.round((okCount / toModelCount) * 1000) / 10 : 100;

  // Worst-first todo list matching `constellation.coverage.todo()`
  const order: Record<string, number> = {
    missing: 0,
    count: 1,
    misplaced: 2,
    rough: 3,
    gap: 4,
  };
  const todo = objects
    .filter((o) => o.status in order)
    .sort((a, b) => order[a.status] - order[b.status] || a.iou - b.iou);

  const covPassed = toModelCount === 0 || (missingCount === 0 && misplacedCount === 0 && wrongCount === 0 && coveragePct >= 70);
  const ptsPassed = rmsPx === null || rmsPx <= tolPx;
  const passed = covPassed && ptsPassed;

  const summaryParts: string[] = [];
  if (toModelCount > 0) {
    summaryParts.push(
      `coverage ${Math.round(coveragePct)}% (${okCount}/${toModelCount} ok: ${missingCount} missing, ${misplacedCount} misplaced, ${roughCount} rough, ${wrongCount} count, ${gapCount} gap)`
    );
  }
  if (rmsPx !== null) {
    summaryParts.push(
      `points RMS ${rmsPx.toFixed(2)} px (max ${maxErrPx.toFixed(2)} px, ${withinTolPct}% <= ${tolPx} px)`
    );
  }
  if (summaryParts.length === 0) {
    summaryParts.push('Solved camera active; load inventory.json or check points to score photo coverage & RMS.');
  }

  return {
    checkedAt: new Date().toISOString(),
    engine: 'constellation-ts-projection',
    passed,
    coveragePct,
    toModelCount,
    okCount,
    roughCount,
    misplacedCount,
    missingCount,
    wrongCount,
    gapCount,
    rmsPx,
    maxErrPx: sqErrs.length > 0 ? Math.round(maxErrPx * 100) / 100 : null,
    withinTolPct,
    tolPx,
    summary: summaryParts.join(' | '),
    objects,
    todo,
    pointChecks,
  };
}
