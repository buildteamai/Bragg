#!/usr/bin/env node
/**
 * One-Shot CAD Photo-to-Millimeter Silhouette & Color-Band Extractor
 *
 * Usage:
 *   npm run cad:trace -- <imagePath> [widthMm] [heightMm] [--rows 40] [--rotate <deg>] [--crop x0,y0,x1,y1] [--camera <camera.json> --face FRONT|TOP|SIDE --bounds x0,y0,z0,x1,y1,z1] [--out-poly] [--json]
 *
 * Reads any reference photo via ImageMagick (`magick` / POSIX `convert`) or Python Pillow fallback,
 * optionally rectifies perspective distortion via Architekton Constellation `ortho.glass_box` (`--camera`),
 * optionally rotates it upright (`--rotate <deg>`) and crops a sub-assembly (`--crop x0,y0,x1,y1`
 * in normalized 0..1 coordinates), detects the foreground bounding box, converts pixels to centered
 * world millimeters (X in [-W/2, +W/2], Y in [0, H]), and prints:
 *   1. Exact envelope & natural aspect ratio
 *   2. Left/right outer silhouette profile at regular Y slices
 *   3. Top/bottom outer silhouette profile at regular X slices
 *   4. Optional ready-to-paste CCW `polygonPoints` array (`--out-poly`)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const outPolyMode = args.includes('--out-poly');

function getFlagValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const rowsRaw = getFlagValue('--rows');
const sliceCount = rowsRaw ? Math.max(8, parseInt(rowsRaw, 10) || 36) : 36;
const rotateRaw = getFlagValue('--rotate');
const rotateDeg = rotateRaw ? parseFloat(rotateRaw) || 0 : 0;
const cropRaw = getFlagValue('--crop');
let cropBox = null;
if (cropRaw) {
  const parts = cropRaw.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    cropBox = parts.map((n) => Math.max(0, Math.min(1, n)));
  }
}

const cameraPathRaw = getFlagValue('--camera');
const faceName = (getFlagValue('--face') || 'FRONT').toUpperCase();
const boundsRaw = getFlagValue('--bounds');
const resRaw = getFlagValue('--res');

const valueFlags = new Set(['--rows', '--rotate', '--crop', '--camera', '--face', '--bounds', '--res']);
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (valueFlags.has(args[i])) {
    i++;
    continue;
  }
  if (args[i].startsWith('--')) continue;
  positional.push(args[i]);
}

if (positional.length < 1) {
  console.error(
    'Usage: npm run cad:trace -- <imagePath> [widthMm] [heightMm] [--rows 36] [--rotate <deg>] [--crop x0,y0,x1,y1] [--out-poly] [--json]'
  );
  process.exit(1);
}

const imagePath = path.resolve(positional[0]);
if (!fs.existsSync(imagePath)) {
  console.error(`Image not found: ${imagePath}`);
  process.exit(1);
}

/**
 * Decode image to binary PPM (P6) with optional rotation & normalized crop.
 * Tries ImageMagick 7 (`magick`), POSIX `convert`, then Python Pillow (`python`/`py`).
 */
function loadImageAsPpm(imgPath, rotDeg, cropNorm) {
  const imArgs = [imgPath];
  if (Math.abs(rotDeg) > 1e-3) {
    imArgs.push('-background', 'white', '-rotate', String(rotDeg));
  }
  if (cropNorm) {
    const [x0, y0, x1, y1] = cropNorm;
    const wPct = Math.max(1, (x1 - x0) * 100);
    const hPct = Math.max(1, (y1 - y0) * 100);
    imArgs.push('-crop', `${wPct.toFixed(2)}%x${hPct.toFixed(2)}%+0+0`);
  }
  imArgs.push('-depth', '8', 'ppm:-');

  // 1. Try ImageMagick 7 (`magick`)
  try {
    return execFileSync('magick', imArgs, { maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    // ignore
  }

  // 2. Try POSIX ImageMagick (`convert`) on non-Windows only (Windows convert.exe is NTFS utility)
  if (process.platform !== 'win32') {
    try {
      return execFileSync('convert', imArgs, { maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      // ignore
    }
  }

  // 3. Fallback: Python + Pillow (supports exact rotation with corner bg fill + normalized crop)
  const pyScript = `
import sys, io
from PIL import Image
img = Image.open(sys.argv[1]).convert('RGB')
rot = float(sys.argv[2])
if abs(rot) > 1e-3:
    w, h = img.size
    corners = [img.getpixel((2,2)), img.getpixel((w-3,2)), img.getpixel((2,h-3)), img.getpixel((w-3,h-3))]
    bg = tuple(int(sum(c[i] for c in corners)/4) for i in range(3))
    img = img.rotate(-rot, resample=Image.BICUBIC, expand=True, fillcolor=bg)
crop_str = sys.argv[3]
if crop_str:
    x0, y0, x1, y1 = [float(v) for v in crop_str.split(',')]
    w, h = img.size
    img = img.crop((int(x0*w), int(y0*h), max(int(x0*w)+1, int(x1*w)), max(int(y0*h)+1, int(y1*h))))
buf = io.BytesIO()
img.save(buf, format='PPM')
sys.stdout.buffer.write(buf.getvalue())
`;
  const cropArg = cropNorm ? cropNorm.join(',') : '';
  for (const pyBin of ['python', 'py', 'python3']) {
    try {
      return execFileSync(pyBin, ['-c', pyScript, imgPath, String(rotDeg), cropArg], {
        maxBuffer: 40 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      // try next python binary
    }
  }

  throw new Error(
    'Unable to decode image: neither ImageMagick (`magick`) nor Python Pillow (`python`/`py` with PIL) is available.'
  );
}

let activeImagePath = imagePath;
let rectifiedExtentMm = null;
let tempRectifiedDir = null;

if (cameraPathRaw) {
  const camFile = path.resolve(cameraPathRaw);
  if (!fs.existsSync(camFile)) {
    console.error(`Camera JSON not found: ${camFile}`);
    process.exit(1);
  }
  const archRoot =
    process.env.ARCHITEKTON_ROOT || path.resolve(__dirname, '..', '..', 'architekton');
  tempRectifiedDir = fs.mkdtempSync(path.join(os.tmpdir(), '18d-glassbox-'));
  const rectPngPath = path.join(tempRectifiedDir, `${faceName}.png`);
  const metaJsonPath = path.join(tempRectifiedDir, 'meta.json');
  const pyRectify = `
import json, sys
import numpy as np
from PIL import Image
from architekton_engine.constellation import Camera, glass_box

img_path, cam_path, face_name, bounds_str, res_str, out_png, out_meta = sys.argv[1:8]
with open(cam_path, "r", encoding="utf-8") as fh:
    raw = json.load(fh)
cam_dict = raw["camera"] if isinstance(raw, dict) and "camera" in raw else raw
cam = Camera.from_dict(cam_dict)
im = Image.open(img_path).convert("RGB")
arr = np.asarray(im, dtype=float)
if bounds_str:
    b = [float(v) for v in bounds_str.split(",")]
    lo, hi = np.asarray(b[:3], float), np.asarray(b[3:6], float)
else:
    lo, hi = np.asarray([-500.0, -500.0, 0.0]), np.asarray([500.0, 500.0, 1000.0])
res = float(res_str) if res_str else None
views = glass_box(arr, cam, np.eye(3), np.zeros(3), lo, hi, res=res)
chosen = views.get(face_name) or next(iter(views.values()))
img_f = chosen["image"]
rgb = np.where(np.isnan(img_f), 255.0, np.clip(img_f, 0.0, 255.0)).astype(np.uint8)
pil_out = Image.fromarray(rgb, mode="RGB")
pil_out.save(out_png, format="PNG")
scale = float(chosen.get("scale", 1.0))
ext = chosen.get("extent")
if isinstance(ext, (list, tuple)) and len(ext) >= 2:
    ext_mm = [float(ext[0]), float(ext[1])]
else:
    ext_mm = [pil_out.width / max(1e-6, scale), pil_out.height / max(1e-6, scale)]
with open(out_meta, "w", encoding="utf-8") as fh:
    json.dump({"face": face_name, "extentMm": ext_mm, "scalePxPerMm": scale}, fh)
`;
  const env = {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${archRoot}${path.delimiter}${process.env.PYTHONPATH}`
      : archRoot,
  };
  const candidates = [
    {
      cmd: 'uv',
      args: [
        'run', '--quiet', '--no-sync', '--directory', archRoot,
        'python', '-c', pyRectify, imagePath, camFile, faceName, boundsRaw || '', resRaw || '', rectPngPath, metaJsonPath,
      ],
    },
    { cmd: 'python', args: ['-c', pyRectify, imagePath, camFile, faceName, boundsRaw || '', resRaw || '', rectPngPath, metaJsonPath] },
    { cmd: 'py', args: ['-3', '-c', pyRectify, imagePath, camFile, faceName, boundsRaw || '', resRaw || '', rectPngPath, metaJsonPath] },
  ];
  let rectified = false;
  for (const c of candidates) {
    try {
      execFileSync(c.cmd, c.args, { env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 40 * 1024 * 1024 });
      if (fs.existsSync(rectPngPath) && fs.existsSync(metaJsonPath)) {
        activeImagePath = rectPngPath;
        const meta = JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8'));
        rectifiedExtentMm = meta.extentMm;
        rectified = true;
        break;
      }
    } catch {
      // try next runner
    }
  }
  if (!rectified) {
    console.error('Failed to rectify photo with architekton_engine.constellation.ortho.glass_box.');
    process.exit(1);
  }
}

const ppm = loadImageAsPpm(activeImagePath, rotateDeg, cropBox);
if (tempRectifiedDir) {
  try {
    fs.rmSync(tempRectifiedDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup error
  }
}

let idx = 0;
const tokens = [];
while (tokens.length < 4) {
  while (idx < ppm.length && ppm[idx] <= 32) idx++;
  if (ppm[idx] === 35) {
    while (idx < ppm.length && ppm[idx] !== 10) idx++;
    continue;
  }
  let tok = '';
  while (idx < ppm.length && ppm[idx] > 32) tok += String.fromCharCode(ppm[idx++]);
  tokens.push(tok);
}
idx++;
const W = parseInt(tokens[1], 10);
const H = parseInt(tokens[2], 10);
const rgb = ppm.subarray(idx);

// Estimate background color from the 4 image corners
const sampleCorner = (x, y) => {
  const cx = Math.max(0, Math.min(W - 1, x));
  const cy = Math.max(0, Math.min(H - 1, y));
  const o = (cy * W + cx) * 3;
  return [rgb[o], rgb[o + 1], rgb[o + 2]];
};
const corners = [
  sampleCorner(2, 2),
  sampleCorner(W - 3, 2),
  sampleCorner(2, H - 3),
  sampleCorner(W - 3, H - 3),
];
const bgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
const bgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
const bgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);

const isForeground = (r, g, b) => {
  const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
  return dist > 38;
};

let minPx = W,
  maxPx = 0,
  minPy = H,
  maxPy = 0;
const fgMask = new Uint8Array(W * H);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3;
    if (isForeground(rgb[o], rgb[o + 1], rgb[o + 2])) {
      fgMask[y * W + x] = 1;
      if (x < minPx) minPx = x;
      if (x > maxPx) maxPx = x;
      if (y < minPy) minPy = y;
      if (y > maxPy) maxPy = y;
    }
  }
}

const pxW = Math.max(1, maxPx - minPx);
const pxH = Math.max(1, maxPy - minPy);
const naturalAspect = pxW / pxH;

const targetH = positional[2]
  ? parseFloat(positional[2])
  : rectifiedExtentMm
    ? Math.round(rectifiedExtentMm[1] * 10) / 10
    : 225;
const targetW = positional[1]
  ? parseFloat(positional[1])
  : rectifiedExtentMm
    ? Math.round(rectifiedExtentMm[0] * 10) / 10
    : Math.round(targetH * naturalAspect * 10) / 10;

const pxToWorld = (px, py) => [
  ((px - minPx) / pxW) * targetW - targetW * 0.5,
  ((maxPy - py) / pxH) * targetH,
];
const worldToPx = (wx, wy) => [
  Math.round(minPx + ((wx + targetW * 0.5) / targetW) * pxW),
  Math.round(maxPy - (wy / targetH) * pxH),
];

// Classify pixel material/color family
const classifyColor = (r, g, b) => {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const sat = maxC - minC;
  if (r > 130 && r - g > 42 && r - b > 42) return 'red';
  if (r > 165 && g > 125 && b < 90) return 'yellowOrange';
  if (b > 110 && b - r > 30 && b - g > 15) return 'blue';
  if (sat < 22 && maxC > 95 && maxC < 215) return 'metallicGrey';
  if (maxC <= 95) return 'dark';
  return 'light';
};

// Horizontal silhouette scan at regular Y levels
const yProfile = [];
for (let i = 0; i <= sliceCount; i++) {
  const wy = (i / sliceCount) * targetH;
  const py = Math.max(0, Math.min(H - 1, worldToPx(0, wy)[1]));
  let leftPx = -1,
    rightPx = -1;
  const spans = [];
  let inSpan = false,
    spanStart = 0;
  const colorCounts = { red: 0, yellowOrange: 0, blue: 0, metallicGrey: 0, dark: 0, light: 0 };

  for (let px = minPx; px <= maxPx; px++) {
    const fg = fgMask[py * W + px] === 1;
    if (fg) {
      if (leftPx < 0) leftPx = px;
      rightPx = px;
      const o = (py * W + px) * 3;
      colorCounts[classifyColor(rgb[o], rgb[o + 1], rgb[o + 2])]++;
      if (!inSpan) {
        inSpan = true;
        spanStart = px;
      }
    } else if (inSpan) {
      inSpan = false;
      spans.push([
        Number(pxToWorld(spanStart, py)[0].toFixed(1)),
        Number(pxToWorld(px - 1, py)[0].toFixed(1)),
      ]);
    }
  }
  if (inSpan) {
    spans.push([
      Number(pxToWorld(spanStart, py)[0].toFixed(1)),
      Number(pxToWorld(maxPx, py)[0].toFixed(1)),
    ]);
  }
  if (leftPx >= 0) {
    const dominant = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0][0];
    yProfile.push({
      yMm: Number(wy.toFixed(1)),
      xMinMm: Number(pxToWorld(leftPx, py)[0].toFixed(1)),
      xMaxMm: Number(pxToWorld(rightPx, py)[0].toFixed(1)),
      spans,
      dominantColor: dominant,
    });
  }
}

// Vertical silhouette scan at regular X levels
const xProfile = [];
const xSteps = Math.max(16, Math.round(sliceCount * naturalAspect));
for (let i = 0; i <= xSteps; i++) {
  const wx = -targetW * 0.5 + (i / xSteps) * targetW;
  const px = Math.max(0, Math.min(W - 1, worldToPx(wx, 0)[0]));
  let topPy = -1,
    botPy = -1;
  for (let py = minPy; py <= maxPy; py++) {
    if (fgMask[py * W + px]) {
      if (topPy < 0) topPy = py;
      botPy = py;
    }
  }
  if (topPy >= 0) {
    xProfile.push({
      xMm: Number(wx.toFixed(1)),
      yMinMm: Number(pxToWorld(px, botPy)[1].toFixed(1)),
      yMaxMm: Number(pxToWorld(px, topPy)[1].toFixed(1)),
    });
  }
}

// Build CCW outer polygon from X-profile (bottom sweep left->right, top sweep right->left)
const outerPolygonMm = [
  ...xProfile.map((c) => [c.xMm, c.yMinMm]),
  ...[...xProfile].reverse().map((c) => [c.xMm, c.yMaxMm]),
];

const summary = {
  image: path.relative(process.cwd(), imagePath),
  rotateDeg,
  cropBox,
  imageSizePx: [W, H],
  backgroundRgb: [bgR, bgG, bgB],
  foregroundBboxPx: { minPx, maxPx, minPy, maxPy, widthPx: pxW, heightPx: pxH },
  naturalAspect: Number(naturalAspect.toFixed(4)),
  calibratedEnvelopeMm: { widthMm: targetW, heightMm: targetH },
  yProfile,
  xProfile,
  ...(outPolyMode ? { outerPolygonMm } : {}),
};

if (jsonMode) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('=== CAD PHOTO-TO-MM SILHOUETTE TRACE ===');
  console.log(
    `Image: ${summary.image} (${W}x${H}px) | Rotate: ${rotateDeg} deg | Crop: ${cropBox ? cropBox.join(',') : 'none'}`
  );
  console.log(
    `FG bbox: ${pxW}x${pxH}px | Aspect: ${summary.naturalAspect} | Envelope: W=${targetW} mm (X=[${(-targetW / 2).toFixed(1)}..+${(targetW / 2).toFixed(1)}]), H=${targetH} mm (Y=[0..${targetH}])`
  );
  console.log('\n--- HORIZONTAL SLICES (Y -> X spans, dominant color) ---');
  for (const row of yProfile) {
    const spanStr = row.spans.map(([a, b]) => `[${a}..${b}]`).join('  ');
    console.log(
      `Y=${row.yMm.toFixed(1).padStart(6)} mm | X=[${row.xMinMm.toFixed(1).padStart(6)}..${row.xMaxMm.toFixed(1).padStart(6)}] | ${row.dominantColor.padEnd(12)} | spans: ${spanStr}`
    );
  }
  console.log('\n--- VERTICAL SLICES (X -> Y min..max) ---');
  for (const col of xProfile) {
    console.log(
      `X=${col.xMm.toFixed(1).padStart(6)} mm | Y=[${col.yMinMm.toFixed(1).padStart(5)}..${col.yMaxMm.toFixed(1).padStart(5)}]`
    );
  }
  if (outPolyMode) {
    console.log('\n--- CCW OUTER POLYGON (ready for polygonExtrude) ---');
    console.log(JSON.stringify(outerPolygonMm));
  }
}
