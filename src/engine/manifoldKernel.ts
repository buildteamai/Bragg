import * as THREE from 'three';
import Module, {
  CrossSection,
  Manifold,
  ManifoldToplevel,
  Mat4,
  SimplePolygon,
} from 'manifold-3d';
import {
  BlueprintPart,
  CsgNodeSpec,
  CurvedLoftStationSpec,
  SweepSolidDiagnostic,
  TessellationDensity,
} from '../types/blueprint';
import {
  computeSheetMetalFoldLayout,
  ResolvedFoldFlange,
} from './planarDevelopment';
import {
  computeBishopFrames,
  monotoneCubicInterp,
  sampleAsymmetricSuperellipse,
} from './spineMath';
import { buildSmoothBooleanManifold } from './sdfSmoothBoolean';

const MM_TO_SCENE = 0.001;

let manifoldInstance: ManifoldToplevel | null = null;
let initPromise: Promise<ManifoldToplevel | null> | null = null;
let customWasmPath: string | null = null;

/**
 * Optional override for server/CLI callers that want to specify an explicit manifold.wasm disk path.
 */
export function setManifoldWasmPath(wasmPath: string): void {
  customWasmPath = wasmPath;
}

async function resolveManifoldWasmLocation(): Promise<string> {
  if (customWasmPath) return customWasmPath;
  const mod = await import('manifold-3d/manifold.wasm?url');
  return mod.default;
}

/**
 * Initializes the manifold-3d WebAssembly solid CAD kernel once and caches the module.
 */
export function ensureManifoldReady(): Promise<boolean> {
  if (manifoldInstance) return Promise.resolve(true);
  if (!initPromise) {
    initPromise = resolveManifoldWasmLocation()
      .then((wasmLoc) =>
        Module({
          locateFile: () => wasmLoc,
        })
      )
      .then((wasm) => {
        wasm.setup();
        manifoldInstance = wasm;
        return wasm;
      })
      .catch((err) => {
        console.warn('[ManifoldKernel] Failed to initialize manifold-3d WASM:', err);
        return null;
      });
  }
  return initPromise.then((m) => m !== null);
}

export function isManifoldReady(): boolean {
  return manifoldInstance !== null;
}

function densitySegments(base: number, density: TessellationDensity): number {
  const mult = density === 'ultra' ? 1.65 : density === 'high' ? 1.25 : 1.0;
  return Math.max(8, Math.round((base * mult) / 4) * 4);
}

function applyNodeTransform(m: Manifold, node: CsgNodeSpec): Manifold {
  let cur = m;
  if (node.scale) {
    const next = cur.scale([
      node.scale[0] || 1,
      node.scale[1] || 1,
      node.scale[2] || 1,
    ]);
    cur.delete();
    cur = next;
  }
  if (node.mirrorAxis === 'x' || node.mirrorAxis === 'y' || node.mirrorAxis === 'z') {
    const mirrorNormal: [number, number, number] =
      node.mirrorAxis === 'x'
        ? [1, 0, 0]
        : node.mirrorAxis === 'y'
          ? [0, 1, 0]
          : [0, 0, 1];
    const next = cur.mirror(mirrorNormal);
    cur.delete();
    cur = next;
  }
  if (
    node.rotateDeg &&
    (node.rotateDeg[0] !== 0 || node.rotateDeg[1] !== 0 || node.rotateDeg[2] !== 0)
  ) {
    const next = cur.rotate([
      node.rotateDeg[0] || 0,
      node.rotateDeg[1] || 0,
      node.rotateDeg[2] || 0,
    ]);
    cur.delete();
    cur = next;
  }
  if (
    node.translateMm &&
    (node.translateMm[0] !== 0 || node.translateMm[1] !== 0 || node.translateMm[2] !== 0)
  ) {
    const next = cur.translate([
      node.translateMm[0] || 0,
      node.translateMm[1] || 0,
      node.translateMm[2] || 0,
    ]);
    cur.delete();
    cur = next;
  }
  return cur;
}

/**
 * Builds a true hollow Unistrut P1000T slotted C-channel in millimeters using real
 * manifold-3d Boolean subtraction for both the C-profile cavity and every punched oblong slot.
 * Oriented vertically along Y (-height/2 .. +height/2), open lip facing -Z, punched back on +Z.
 */
function buildSlottedChannelManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const w = Math.max(12, node.width ?? 41.3);
  const h = Math.max(40, node.height ?? 1400);
  const d = Math.max(12, node.depth ?? 41.3);
  const t = Math.max(1.8, Math.min(node.wallThickness ?? 3.2, Math.min(w, d) * 0.22));
  const lip = Math.max(4, Math.min(node.lipWidthMm ?? 9.5, w * 0.28));
  const hw = w / 2;
  const hd = d / 2;
  const openGapHalf = Math.max(3, hw - t - lip);

  // 2D C-channel cross-section in XZ (extruded along Z in Manifold, then rotated to Y)
  const profile: SimplePolygon = [
    [-hw, hd],
    [hw, hd],
    [hw, -hd],
    [openGapHalf, -hd],
    [openGapHalf, -hd + t * 2.2],
    [openGapHalf + t, -hd + t * 2.2],
    [openGapHalf + t, -hd + t],
    [hw - t, -hd + t],
    [hw - t, hd - t],
    [-hw + t, hd - t],
    [-hw + t, -hd + t],
    [-openGapHalf - t, -hd + t],
    [-openGapHalf - t, -hd + t * 2.2],
    [-openGapHalf, -hd + t * 2.2],
    [-openGapHalf, -hd],
    [-hw, -hd],
  ];

  const cs = new CS([ensureCCW2D(profile) as SimplePolygon]);
  let channel: Manifold;
  try {
    const rawExtrude = cs.extrude(h, 0, 0, [1, 1], true);
    // Rotate so extrusion axis (Z) becomes vertical Y axis, solid slotted face at +Z, open lip at -Z
    channel = rawExtrude.rotate([90, 0, 0]);
    rawExtrude.delete();
  } finally {
    cs.delete();
  }

  // Real subtracted oblong through-slots punched cleanly through the +Z wall only
  const pitch = Math.max(24, node.slotPitchMm ?? 54);
  const slotW = Math.max(4, Math.min(node.slotWidthMm ?? 14, w - t * 4));
  const slotL = Math.max(slotW + 2, Math.min(node.slotLengthMm ?? 30, pitch - 10));
  const segs = densitySegments(12, density);

  const slotCutters: Manifold[] = [];
  const halfSpan = h / 2 - pitch * 0.65;
  const r = slotW / 2;
  const straightHalf = Math.max(0.5, (slotL - slotW) / 2);
  const cutDepthZ = Math.max(t * 4, d * 0.55);

  // Create one reusable stadium/oblong slot cutter oriented along Z
  let protoSlot: Manifold | null = null;
  try {
    const topCyl = M.cylinder(cutDepthZ, r, r, segs, true).translate([0, straightHalf, 0]);
    const botCyl = M.cylinder(cutDepthZ, r, r, segs, true).translate([0, -straightHalf, 0]);
    const midBox = M.cube([slotW, straightHalf * 2, cutDepthZ], true);
    protoSlot = M.union([topCyl, botCyl, midBox]);
    topCyl.delete();
    botCyl.delete();
    midBox.delete();

    for (let y = -halfSpan; y <= halfSpan; y += pitch) {
      slotCutters.push(protoSlot.translate([0, y, hd]));
    }
  } finally {
    protoSlot?.delete();
  }

  if (slotCutters.length === 0) {
    return channel;
  }

  const allSlots = M.union(slotCutters);
  slotCutters.forEach((s) => s.delete());
  try {
    const punched = channel.subtract(allSlots);
    channel.delete();
    return punched;
  } finally {
    allSlots.delete();
  }
}

/**
 * Builds a true ANSI/ASME 150# circular flange with a real Boolean-subtracted center bore
 * and radially drilled through-bolt holes. Aligned along Y (same as Three.js CylinderGeometry).
 */
function buildBoltedFlangeManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M } = wasm;
  const outerR = Math.max(12, node.radius ?? 92);
  const thickness = Math.max(4, node.height ?? 22);
  const boreR = Math.max(4, Math.min(node.boreRadiusMm ?? outerR * 0.42, outerR * 0.72));
  const boltCount = Math.max(4, Math.min(16, node.boltCount ?? 8));
  const boltCircleR = Math.max(
    boreR + 8,
    Math.min(node.boltCircleRadiusMm ?? outerR - 15, outerR - 8)
  );
  const boltHoleR = Math.max(2.5, Math.min(node.boltHoleRadiusMm ?? 7.2, 16));
  const segs = densitySegments(node.radialSegments ?? 32, density);
  const holeSegs = densitySegments(12, density);

  const discZ = M.cylinder(thickness, outerR, outerR, segs, true);
  const cutters: Manifold[] = [M.cylinder(thickness * 1.6, boreR, boreR, segs, true)];

  for (let i = 0; i < boltCount; i++) {
    const angle = (i / boltCount) * Math.PI * 2 + Math.PI / boltCount;
    const hx = Math.cos(angle) * boltCircleR;
    const hy = Math.sin(angle) * boltCircleR;
    const hole = M.cylinder(thickness * 1.6, boltHoleR, boltHoleR, holeSegs, true).translate([
      hx,
      hy,
      0,
    ]);
    cutters.push(hole);
  }

  const allCutters = M.union(cutters);
  cutters.forEach((c) => c.delete());

  let flangeZ: Manifold;
  try {
    flangeZ = discZ.subtract(allCutters);
  } finally {
    discZ.delete();
    allCutters.delete();
  }

  // Rotate from Manifold Z-up cylinder to Three.js Y-up cylinder convention
  const flangeY = flangeZ.rotate([90, 0, 0]);
  flangeZ.delete();
  return flangeY;
}

/**
 * Cleans a 2D polygon by removing consecutive duplicate vertices (and duplicate closing point),
 * then ensures counter-clockwise winding (positive signed area) so extruded and swept shells
 * always have valid outward normals for manifold-3d watertightness.
 */
function ensureCCW2D(pts: [number, number][]): [number, number][] {
  const cleaned: [number, number][] = [];
  for (const pt of pts) {
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 1e-3) continue;
    }
    cleaned.push([pt[0], pt[1]]);
  }
  while (
    cleaned.length > 2 &&
    Math.hypot(
      cleaned[cleaned.length - 1][0] - cleaned[0][0],
      cleaned[cleaned.length - 1][1] - cleaned[0][1]
    ) < 1e-3
  ) {
    cleaned.pop();
  }
  if (cleaned.length < 3) return cleaned;

  let area2 = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const [x0, y0] = cleaned[i];
    const [x1, y1] = cleaned[(i + 1) % cleaned.length];
    area2 += x0 * y1 - x1 * y0;
  }
  return area2 >= 0 ? cleaned : cleaned.reverse();
}

/**
 * Prepares a 2D radial [r, y] profile for manifold-3d CrossSection.revolve().
 * If the caller passed an open Three.js-style LatheGeometry profile (monotone in Y with r > 0
 * at both ends), automatically closes it cleanly back to the spin axis r = 0 so it forms a
 * true solid revolved body instead of a collapsed chord.
 */
function prepareRevolvePolygon(rawPts: [number, number][]): [number, number][] {
  const clamped: [number, number][] = [];
  for (const [rawR, rawY] of rawPts) {
    if (!Number.isFinite(rawR) || !Number.isFinite(rawY)) continue;
    const r = Math.max(0, rawR);
    if (clamped.length > 0) {
      const prev = clamped[clamped.length - 1];
      if (Math.hypot(r - prev[0], rawY - prev[1]) < 1e-3) continue;
    }
    clamped.push([r, rawY]);
  }
  if (clamped.length < 2) return clamped;

  const first = clamped[0];
  const last = clamped[clamped.length - 1];
  const isClosedLoop = Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5 && clamped.length >= 4;

  if (!isClosedLoop && (first[0] > 0.25 || last[0] > 0.25)) {
    // Check if profile is monotone in Y (standard open lathe profile)
    let nonDecreasing = true;
    let nonIncreasing = true;
    for (let i = 1; i < clamped.length; i++) {
      if (clamped[i][1] < clamped[i - 1][1] - 1e-3) nonDecreasing = false;
      if (clamped[i][1] > clamped[i - 1][1] + 1e-3) nonIncreasing = false;
    }
    if (nonDecreasing || nonIncreasing) {
      const closed: [number, number][] = [];
      if (first[0] > 0.25) closed.push([0, first[1]]);
      closed.push(...clamped);
      if (last[0] > 0.25) closed.push([0, last[1]]);
      return ensureCCW2D(closed);
    }
  }

  return ensureCCW2D(clamped);
}

/**
 * Expands a 3D polyline with smooth circular fillet bends at interior corners when cornerMode='bend'.
 */
function expandBentPath(
  rawPoints: THREE.Vector3[],
  bendRadiusMm: number,
  bendSegments: number,
  closedLoop: boolean
): { points: THREE.Vector3[]; isCornerStation: boolean[] } {
  const n = rawPoints.length;
  if (n < 3 || bendRadiusMm <= 0.5) {
    return {
      points: rawPoints.map((p) => p.clone()),
      isCornerStation: rawPoints.map(() => false),
    };
  }

  const out: THREE.Vector3[] = [];
  const flags: boolean[] = [];

  if (!closedLoop) {
    out.push(rawPoints[0].clone());
    flags.push(false);
  }

  const startIdx = closedLoop ? 0 : 1;
  const endIdx = closedLoop ? n : n - 1;

  for (let i = startIdx; i < endIdx; i++) {
    const prev = rawPoints[(i - 1 + n) % n];
    const curr = rawPoints[i];
    const next = rawPoints[(i + 1) % n];

    const vIn = new THREE.Vector3().subVectors(curr, prev);
    const vOut = new THREE.Vector3().subVectors(next, curr);
    const lenIn = vIn.length();
    const lenOut = vOut.length();
    if (lenIn < 1e-4 || lenOut < 1e-4) continue;

    const dIn = vIn.clone().divideScalar(lenIn);
    const dOut = vOut.clone().divideScalar(lenOut);
    const cosTurn = THREE.MathUtils.clamp(dIn.dot(dOut), -0.9999, 0.9999);
    const turnAngle = Math.acos(cosTurn);

    // Nearly collinear segment — keep single station
    if (turnAngle < 0.04) {
      out.push(curr.clone());
      flags.push(false);
      continue;
    }

    // Distance along each leg from corner to tangent point: d = R * tan(turnAngle / 2)
    const tanHalf = Math.tan(turnAngle / 2);
    const maxCut = Math.min(lenIn, lenOut) * 0.45;
    const cutDist = Math.min(bendRadiusMm * tanHalf, maxCut);
    const effR = cutDist / Math.max(1e-4, tanHalf);

    const tStart = curr.clone().addScaledVector(dIn, -cutDist);
    const tEnd = curr.clone().addScaledVector(dOut, cutDist);

    // Bisector inward normal in bend plane
    const bisector = new THREE.Vector3().subVectors(dOut, dIn);
    if (bisector.lengthSq() < 1e-8) {
      out.push(curr.clone());
      flags.push(false);
      continue;
    }
    bisector.normalize();
    const centerDist = effR / Math.max(1e-4, Math.cos(turnAngle / 2));
    const arcCenter = curr.clone().addScaledVector(bisector, centerDist);

    const rStart = new THREE.Vector3().subVectors(tStart, arcCenter);
    const rEnd = new THREE.Vector3().subVectors(tEnd, arcCenter);
    const rotAxis = new THREE.Vector3().crossVectors(rStart, rEnd);
    if (rotAxis.lengthSq() < 1e-8) {
      out.push(curr.clone());
      flags.push(false);
      continue;
    }
    rotAxis.normalize();

    const segs = Math.max(3, Math.round(bendSegments * (turnAngle / (Math.PI / 2))));
    const q = new THREE.Quaternion();
    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      q.setFromAxisAngle(rotAxis, turnAngle * f);
      const pt = rStart.clone().applyQuaternion(q).add(arcCenter);
      if (out.length === 0 || out[out.length - 1].distanceToSquared(pt) > 1e-4) {
        out.push(pt);
        flags.push(false);
      }
    }
  }

  if (!closedLoop) {
    const last = rawPoints[n - 1];
    if (out.length === 0 || out[out.length - 1].distanceToSquared(last) > 1e-4) {
      out.push(last.clone());
      flags.push(false);
    }
  }

  return { points: out, isCornerStation: flags };
}

export interface SweepCenterlineResult {
  stations: THREE.Vector3[];
  pathLengthMm: number;
  evaluatedPathMm: [number, number, number][];
}

/**
 * Evaluates a 3D sweep centerline from raw control points (mm) into ordered 3D stations.
 * Supports both piecewise-linear Polylines (with exact tangent fillet bends or sharp miters)
 * and smooth 3D Catmull-Rom Splines (continuous bent curvature or mitred chord segments).
 */
export function evaluateSweepCenterline(
  rawPointsMm: [number, number, number][],
  options: {
    pathMode?: 'polyline' | 'spline';
    cornerMode?: 'miter' | 'bend';
    bendRadiusMm?: number;
    bendSegments?: number;
    splineSamples?: number;
    splineTension?: number;
    closedLoop?: boolean;
    density?: TessellationDensity;
  }
): SweepCenterlineResult {
  const density = options.density ?? 'high';
  const rawPath = (rawPointsMm || []).map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const cleanPath: THREE.Vector3[] = [];
  for (const pt of rawPath) {
    if (cleanPath.length === 0 || pt.distanceToSquared(cleanPath[cleanPath.length - 1]) > 1e-4) {
      cleanPath.push(pt);
    }
  }
  const closedLoop = Boolean(options.closedLoop && cleanPath.length >= 3);
  if (closedLoop && cleanPath.length >= 2) {
    if (cleanPath[cleanPath.length - 1].distanceToSquared(cleanPath[0]) <= 1e-4) {
      cleanPath.pop();
    }
  }

  if (cleanPath.length < 2) {
    return {
      stations: cleanPath,
      pathLengthMm: 0,
      evaluatedPathMm: cleanPath.map((p) => [p.x, p.y, p.z]),
    };
  }

  const pathMode = options.pathMode ?? 'polyline';
  const cornerMode = options.cornerMode ?? 'bend';
  let stations: THREE.Vector3[];

  if (pathMode === 'spline' && cleanPath.length >= 3) {
    const tension = THREE.MathUtils.clamp(options.splineTension ?? 0.5, 0, 1);
    const curve = new THREE.CatmullRomCurve3(cleanPath, closedLoop, 'centripetal', tension);
    const baseSamples = Math.max(12, Math.min(180, options.splineSamples ?? 48));
    const densMult = density === 'ultra' ? 1.45 : density === 'high' ? 1.15 : 0.9;

    // In 'miter' corner mode on a 3D spline, discretize into crisp mitred lobster-back chords;
    // in 'bend' corner mode, sample densely for smooth continuous spline curvature.
    const sampleCount =
      cornerMode === 'miter'
        ? Math.max(cleanPath.length * 2, Math.min(20, Math.round(baseSamples / 3.5)))
        : Math.max(18, Math.round(baseSamples * densMult));

    const sampled = curve.getSpacedPoints(sampleCount);
    // For closed loops, getSpacedPoints repeats point 0 at the end — strip the duplicate
    if (closedLoop && sampled.length > 2) {
      sampled.pop();
    }
    stations = [];
    for (const pt of sampled) {
      if (stations.length === 0 || pt.distanceToSquared(stations[stations.length - 1]) > 1e-4) {
        stations.push(pt);
      }
    }
  } else {
    const bendRadius = options.bendRadiusMm ?? 45;
    const bendSegs = densitySegments(options.bendSegments ?? 8, density);
    stations =
      cornerMode === 'bend'
        ? expandBentPath(cleanPath, bendRadius, bendSegs, closedLoop).points
        : cleanPath;
  }

  let pathLengthMm = 0;
  const segCount = closedLoop ? stations.length : Math.max(0, stations.length - 1);
  for (let i = 0; i < segCount; i++) {
    pathLengthMm += stations[i].distanceTo(stations[(i + 1) % stations.length]);
  }

  return {
    stations,
    pathLengthMm,
    evaluatedPathMm: stations.map((p) => [
      Math.round(p.x * 100) / 100,
      Math.round(p.y * 100) / 100,
      Math.round(p.z * 100) / 100,
    ]),
  };
}

/**
 * Helper: sweeps a single CCW 2D polygon along pre-evaluated 3D stations using twist-free
 * parallel-transport (Bishop) frames (with closed-loop twist closure and exact miter planes)
 * and returns a closed manifold-3d solid.
 */
function buildSingleProfileSweepManifold(
  wasm: ManifoldToplevel,
  profile2D: [number, number][],
  stations: THREE.Vector3[],
  closedLoop: boolean,
  profileTwistDeg = 0
): Manifold {
  const { Manifold: M, Mesh: ManifoldMesh, triangulate } = wasm;
  const numStations = stations.length;
  const numProf = profile2D.length;
  if (numStations < 2 || numProf < 3) {
    return M.cube([30, 30, 30], true);
  }

  // Compute segment unit tangents
  const segCount = closedLoop ? numStations : numStations - 1;
  const segTangents: THREE.Vector3[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = stations[i];
    const b = stations[(i + 1) % numStations];
    const dir = new THREE.Vector3().subVectors(b, a);
    if (dir.lengthSq() < 1e-10) {
      segTangents.push(segTangents.length > 0 ? segTangents[segTangents.length - 1].clone() : new THREE.Vector3(0, 0, 1));
    } else {
      segTangents.push(dir.normalize());
    }
  }

  // Build twist-free parallel-transport (Bishop) frames along segments
  const segNormals: THREE.Vector3[] = [];
  const segBinormals: THREE.Vector3[] = [];

  const t0 = segTangents[0];
  const refUp = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const n0 = new THREE.Vector3().crossVectors(refUp, t0).normalize();
  const b0 = new THREE.Vector3().crossVectors(t0, n0).normalize();
  segNormals.push(n0);
  segBinormals.push(b0);

  const qStep = new THREE.Quaternion();
  for (let i = 1; i < segCount; i++) {
    const prevT = segTangents[i - 1];
    const curT = segTangents[i];
    if (prevT.dot(curT) < -0.9995) {
      // 180-degree reversal safeguard
      const curN = segNormals[i - 1].clone().negate();
      curN.addScaledVector(curT, -curN.dot(curT)).normalize();
      segNormals.push(curN);
      segBinormals.push(new THREE.Vector3().crossVectors(curT, curN).normalize());
      continue;
    }
    qStep.setFromUnitVectors(prevT, curT);
    const curN = segNormals[i - 1].clone().applyQuaternion(qStep).normalize();
    curN.addScaledVector(curT, -curN.dot(curT)).normalize();
    const curB = new THREE.Vector3().crossVectors(curT, curN).normalize();
    segNormals.push(curN);
    segBinormals.push(curB);
  }

  // Closed-loop Bishop frame twist-closure correction so the seam aligns with zero twist
  if (closedLoop && segCount >= 3) {
    const tLast = segTangents[segCount - 1];
    qStep.setFromUnitVectors(tLast, t0);
    const closedN = segNormals[segCount - 1].clone().applyQuaternion(qStep).normalize();
    closedN.addScaledVector(t0, -closedN.dot(t0)).normalize();
    const cosErr = THREE.MathUtils.clamp(closedN.dot(n0), -1, 1);
    const sinErr = closedN.dot(b0);
    const twistErrRad = Math.atan2(sinErr, cosErr);
    if (Math.abs(twistErrRad) > 1e-4) {
      const qFix = new THREE.Quaternion();
      for (let i = 1; i < segCount; i++) {
        const angle = -twistErrRad * (i / segCount);
        qFix.setFromAxisAngle(segTangents[i], angle);
        segNormals[i].applyQuaternion(qFix).normalize();
        segBinormals[i].crossVectors(segTangents[i], segNormals[i]).normalize();
      }
    }
  } else if (Math.abs(profileTwistDeg) > 1e-3 && segCount > 1) {
    const totalTwistRad = THREE.MathUtils.degToRad(profileTwistDeg);
    const qTwist = new THREE.Quaternion();
    for (let i = 1; i < segCount; i++) {
      qTwist.setFromAxisAngle(segTangents[i], totalTwistRad * (i / (segCount - 1)));
      segNormals[i].applyQuaternion(qTwist).normalize();
      segBinormals[i].crossVectors(segTangents[i], segNormals[i]).normalize();
    }
  }

  // Generate 3D ring vertices at each station (with exact miter-plane projection at interior joints)
  const ringVerts: number[] = [];
  const MITER_LIMIT = 2.6;

  for (let s = 0; s < numStations; s++) {
    const p = stations[s];
    const isInterior = closedLoop || (s > 0 && s < numStations - 1);

    if (!isInterior) {
      const segIdx = s === 0 ? 0 : segCount - 1;
      const N = segNormals[segIdx];
      const B = segBinormals[segIdx];
      for (let k = 0; k < numProf; k++) {
        const [u, v] = profile2D[k];
        ringVerts.push(
          p.x + N.x * u + B.x * v,
          p.y + N.y * u + B.y * v,
          p.z + N.z * u + B.z * v
        );
      }
    } else {
      const prevSeg = (s - 1 + segCount) % segCount;
      const nextSeg = s % segCount;
      const tIn = segTangents[prevSeg];
      const tOut = segTangents[nextSeg];
      const nIn = segNormals[prevSeg];
      const bIn = segBinormals[prevSeg];

      // Miter plane normal = average of incoming and outgoing tangents
      const miterNormal = new THREE.Vector3().addVectors(tIn, tOut);
      if (miterNormal.lengthSq() < 1e-6) {
        miterNormal.copy(tIn);
      } else {
        miterNormal.normalize();
      }
      const denom = Math.max(1 / MITER_LIMIT, tIn.dot(miterNormal));

      for (let k = 0; k < numProf; k++) {
        const [u, v] = profile2D[k];
        const offset = new THREE.Vector3(
          nIn.x * u + bIn.x * v,
          nIn.y * u + bIn.y * v,
          nIn.z * u + bIn.z * v
        );
        const shiftAlongT = -offset.dot(miterNormal) / denom;
        const clampedShift = THREE.MathUtils.clamp(
          shiftAlongT,
          -offset.length() * MITER_LIMIT,
          offset.length() * MITER_LIMIT
        );
        ringVerts.push(
          p.x + offset.x + tIn.x * clampedShift,
          p.y + offset.y + tIn.y * clampedShift,
          p.z + offset.z + tIn.z * clampedShift
        );
      }
    }
  }

  // Stitch side quads (two triangles per quad, outward CCW winding)
  const triIndices: number[] = [];
  for (let s = 0; s < segCount; s++) {
    const sNext = (s + 1) % numStations;
    const baseA = s * numProf;
    const baseB = sNext * numProf;
    for (let k = 0; k < numProf; k++) {
      const kNext = (k + 1) % numProf;
      const a0 = baseA + k;
      const a1 = baseA + kNext;
      const b0 = baseB + k;
      const b1 = baseB + kNext;
      triIndices.push(a0, a1, b1);
      triIndices.push(a0, b1, b0);
    }
  }

  // Triangulate watertight start & end caps for open paths using manifold-3d's ear-clipper
  if (!closedLoop) {
    const capTris = triangulate([profile2D]);
    const endBase = (numStations - 1) * numProf;
    for (const tri of capTris) {
      const i0 = Math.round(tri[0]);
      const i1 = Math.round(tri[1]);
      const i2 = Math.round(tri[2]);
      // Start cap faces -T (reverse winding)
      triIndices.push(i0, i2, i1);
      // End cap faces +T (CCW winding)
      triIndices.push(endBase + i0, endBase + i1, endBase + i2);
    }
  }

  // Feed closed mesh directly into manifold-3d to guarantee topological watertightness
  const mMesh = new ManifoldMesh({
    numProp: 3,
    vertProperties: new Float32Array(ringVerts),
    triVerts: new Uint32Array(triIndices),
  });
  mMesh.merge();

  let swept = M.ofMesh(mMesh);
  if (swept.status() !== 'NoError' || swept.isEmpty()) {
    swept.delete();
    for (let i = 0; i < triIndices.length; i += 3) {
      const tmp = triIndices[i + 1];
      triIndices[i + 1] = triIndices[i + 2];
      triIndices[i + 2] = tmp;
    }
    const flippedMesh = new ManifoldMesh({
      numProp: 3,
      vertProperties: new Float32Array(ringVerts),
      triVerts: new Uint32Array(triIndices),
    });
    flippedMesh.merge();
    swept = M.ofMesh(flippedMesh);
  }

  return swept;
}

/**
 * General 3D profile sweep: sweeps an arbitrary 2D cross-section polygon (solid or hollow)
 * along any 3D spline or polyline path using twist-free parallel-transport (Bishop) frames,
 * with either sharp mitered corners or smooth bent arcs/splines, processed through manifold-3d
 * for guaranteed watertight solid output.
 */
function buildGeneralSweepManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const rawPts = node.pathPoints || [];
  if (rawPts.length < 2) {
    return M.cube([40, 40, 40], true);
  }

  const closedLoop = Boolean(node.closedLoop && rawPts.length >= 3);

  // Build 2D cross-section polygon (CCW)
  let profile2D: [number, number][];
  if (Array.isArray(node.profilePoints) && node.profilePoints.length >= 3) {
    profile2D = ensureCCW2D(node.profilePoints);
  } else if ((node.width ?? 0) > 0 && (node.height ?? 0) > 0) {
    const hw = (node.width ?? 24) / 2;
    const hh = (node.height ?? 24) / 2;
    profile2D = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
  } else {
    const r = Math.max(1.5, node.radius ?? 14);
    const segs = densitySegments(node.radialSegments ?? 16, density);
    profile2D = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      profile2D.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  const { stations } = evaluateSweepCenterline(rawPts, {
    pathMode: node.pathMode ?? 'polyline',
    cornerMode: node.cornerMode ?? 'bend',
    bendRadiusMm: node.bendRadiusMm ?? 45,
    bendSegments: node.bendSegments ?? 8,
    splineSamples: node.splineSamples ?? 48,
    splineTension: node.splineTension ?? 0.5,
    closedLoop,
    density,
  });

  if (stations.length < 2 || profile2D.length < 3) {
    return M.cube([30, 30, 30], true);
  }

  let swept = buildSingleProfileSweepManifold(
    wasm,
    profile2D,
    stations,
    closedLoop,
    node.profileTwistDeg ?? 0
  );

  // Resolve hollow inner bore loops: explicit profileHoles or automatic wallThickness inset
  const holeLoops: [number, number][][] = [];
  if (Array.isArray(node.profileHoles) && node.profileHoles.length > 0) {
    for (const h of node.profileHoles) {
      if (h.length >= 3) holeLoops.push(ensureCCW2D(h));
    }
  } else if ((node.wallThickness ?? 0) > 0.4) {
    const wall = node.wallThickness ?? 0;
    if (!Array.isArray(node.profilePoints) && (node.radius ?? 0) > wall + 1.2 && !(node.width && node.height)) {
      const innerR = (node.radius ?? 14) - wall;
      const segs = densitySegments(node.radialSegments ?? 16, density);
      const innerCircle: [number, number][] = [];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        innerCircle.push([Math.cos(a) * innerR, Math.sin(a) * innerR]);
      }
      holeLoops.push(innerCircle);
    } else {
      // General polygon inset via manifold-3d CrossSection.offset(-wall)
      const cs = new CS([profile2D as SimplePolygon]);
      let inset: CrossSection | null = null;
      try {
        inset = cs.offset(-wall, 'Miter');
        const polys = inset.toPolygons();
        for (const poly of polys) {
          if (poly.length >= 3) {
            holeLoops.push(ensureCCW2D(poly.map(([x, y]) => [x, y])));
          }
        }
      } catch {
        // Wall thicker than section — stay solid
      } finally {
        inset?.delete();
        cs.delete();
      }
    }
  }

  // Subtract extended inner bore sweep(s) through manifold-3d for guaranteed watertight hollow tubes/ducts
  if (holeLoops.length > 0 && swept.status() === 'NoError' && !swept.isEmpty()) {
    const holeStations = stations.map((p) => p.clone());
    if (!closedLoop && holeStations.length >= 2) {
      const startDir = new THREE.Vector3().subVectors(holeStations[1], holeStations[0]).normalize();
      const endDir = new THREE.Vector3()
        .subVectors(holeStations[holeStations.length - 1], holeStations[holeStations.length - 2])
        .normalize();
      holeStations[0].addScaledVector(startDir, -1.5);
      holeStations[holeStations.length - 1].addScaledVector(endDir, 1.5);
    }

    for (const loop of holeLoops) {
      const innerSolid = buildSingleProfileSweepManifold(
        wasm,
        loop,
        holeStations,
        closedLoop,
        node.profileTwistDeg ?? 0
      );
      try {
        if (innerSolid.status() === 'NoError' && !innerSolid.isEmpty()) {
          const hollowed = swept.subtract(innerSolid);
          if (hollowed.status() === 'NoError' && !hollowed.isEmpty()) {
            swept.delete();
            swept = hollowed;
          } else {
            hollowed.delete();
          }
        }
      } finally {
        innerSolid.delete();
      }
    }
  }

  return swept;
}

/**
 * Evaluates a sweep CSG node directly inside manifold-3d WASM and returns exact watertightness,
 * volume, surface area, topological genus, triangle count, and evaluated 3D centerline points.
 */
export function inspectSweepManifold(
  node: CsgNodeSpec,
  density: TessellationDensity = 'high'
): SweepSolidDiagnostic {
  const centerline = evaluateSweepCenterline(node.pathPoints || [], {
    pathMode: node.pathMode ?? 'polyline',
    cornerMode: node.cornerMode ?? 'bend',
    bendRadiusMm: node.bendRadiusMm ?? 45,
    bendSegments: node.bendSegments ?? 8,
    splineSamples: node.splineSamples ?? 48,
    splineTension: node.splineTension ?? 0.5,
    closedLoop: Boolean(node.closedLoop && (node.pathPoints?.length ?? 0) >= 3),
    density,
  });

  if (!manifoldInstance) {
    return {
      manifoldReady: false,
      status: 'Initializing WASM',
      isWatertight: false,
      volumeCm3: 0,
      surfaceAreaCm2: 0,
      genus: 0,
      triangles: 0,
      vertices: 0,
      pathLengthMm: Math.round(centerline.pathLengthMm * 10) / 10,
      stationCount: centerline.stations.length,
      evaluatedPathMm: centerline.evaluatedPathMm,
    };
  }

  let solid: Manifold | null = null;
  try {
    solid = buildGeneralSweepManifold(manifoldInstance, node, density);
    const status = String(solid.status());
    const empty = solid.isEmpty();
    const volMm3 = empty ? 0 : solid.volume();
    const areaMm2 = empty ? 0 : solid.surfaceArea();
    const genus = empty ? 0 : solid.genus();
    const mesh = solid.getMesh();
    const triangles = mesh.numTri;
    const vertices = mesh.numVert;

    return {
      manifoldReady: true,
      status,
      isWatertight: status === 'NoError' && !empty && volMm3 > 0,
      volumeCm3: Math.round((volMm3 / 1000) * 100) / 100,
      surfaceAreaCm2: Math.round((areaMm2 / 100) * 100) / 100,
      genus,
      triangles,
      vertices,
      pathLengthMm: Math.round(centerline.pathLengthMm * 10) / 10,
      stationCount: centerline.stations.length,
      evaluatedPathMm: centerline.evaluatedPathMm,
    };
  } catch (err) {
    return {
      manifoldReady: true,
      status: err instanceof Error ? err.message : 'Manifold build failed',
      isWatertight: false,
      volumeCm3: 0,
      surfaceAreaCm2: 0,
      genus: 0,
      triangles: 0,
      vertices: 0,
      pathLengthMm: Math.round(centerline.pathLengthMm * 10) / 10,
      stationCount: centerline.stations.length,
      evaluatedPathMm: centerline.evaluatedPathMm,
    };
  } finally {
    solid?.delete();
  }
}

/**
 * Generates a 2D rounded-rectangle CCW polygon in mm centered at (0, 0).
 */
function makeRoundedRect2D(w: number, h: number, r: number, cornerSegs = 4): SimplePolygon {
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.max(0, Math.min(r, hw * 0.48, hh * 0.48));
  if (cr < 0.25) {
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
  }
  const pts: SimplePolygon = [];
  const corners: [number, number, number][] = [
    [hw - cr, -hh + cr, -Math.PI / 2],
    [hw - cr, hh - cr, 0],
    [-hw + cr, hh - cr, Math.PI / 2],
    [-hw + cr, -hh + cr, Math.PI],
  ];
  for (const [cx, cy, startA] of corners) {
    for (let i = 0; i <= cornerSegs; i++) {
      const a = startA + (i / cornerSegs) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * cr, cy + Math.sin(a) * cr]);
    }
  }
  return ensureCCW2D(pts) as SimplePolygon;
}

/**
 * FABRICATION ENGINE 1 — CNC / Prismatic Machined Block:
 * Outer stock with true chamfered vertical/top/bottom edges, milled recessed pockets,
 * and counterbored / through holes subtracted watertight via manifold-3d.
 */
function buildMachinedBlockManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const w = Math.max(8, node.width ?? 140);
  const h = Math.max(6, node.height ?? 80);
  const d = Math.max(8, node.depth ?? 120);
  const ch = Math.max(0, Math.min(node.chamferMm ?? 3.5, Math.min(w, h, d) * 0.22));
  const segs = densitySegments(node.radialSegments ?? 20, density);

  let block: Manifold;
  if (ch >= 0.4) {
    // True 3D chamfered prism via hull of three slightly inset orthogonal slabs
    const bX = M.cube([w, Math.max(1, h - ch * 2), Math.max(1, d - ch * 2)], true);
    const bY = M.cube([Math.max(1, w - ch * 2), h, Math.max(1, d - ch * 2)], true);
    const bZ = M.cube([Math.max(1, w - ch * 2), Math.max(1, h - ch * 2), d], true);
    block = M.hull([bX, bY, bZ]);
    bX.delete();
    bY.delete();
    bZ.delete();
  } else {
    block = M.cube([w, h, d], true);
  }

  const cutters: Manifold[] = [];

  // Recessed CNC milled pockets
  if (Array.isArray(node.pockets)) {
    for (const pkt of node.pockets) {
      const pw = Math.max(2, pkt.width);
      const ph = Math.max(2, pkt.height);
      const pd = Math.max(2, pkt.depth);
      const cr = Math.max(0, pkt.cornerRadius ?? 4);
      let pocketSolid: Manifold;
      if (cr >= 0.5) {
        const cs = new CS([makeRoundedRect2D(pw, pd, cr, 4)]);
        try {
          const extZ = cs.extrude(ph, 0, 0, [1, 1], true);
          pocketSolid = extZ.rotate([-90, 0, 0]);
          extZ.delete();
        } finally {
          cs.delete();
        }
      } else {
        pocketSolid = M.cube([pw, ph, pd], true);
      }
      const moved = pocketSolid.translate([pkt.x, pkt.y, pkt.z]);
      pocketSolid.delete();
      cutters.push(moved);
    }
  }

  // Drilled / Counterbored holes
  if (Array.isArray(node.holes)) {
    for (const hole of node.holes) {
      const r = Math.max(0.8, hole.diameterMm / 2);
      const len = Math.max(2, hole.depthMm);
      const cylZ = M.cylinder(len, r, r, segs, true);
      let oriented: Manifold;
      if (hole.axis === 'y') {
        oriented = cylZ.rotate([-90, 0, 0]);
        cylZ.delete();
      } else if (hole.axis === 'x') {
        oriented = cylZ.rotate([0, 90, 0]);
        cylZ.delete();
      } else {
        oriented = cylZ;
      }
      const placed = oriented.translate([hole.x, hole.y, hole.z]);
      oriented.delete();
      cutters.push(placed);

      if (hole.counterboreDiaMm && hole.counterboreDepthMm) {
        const cbR = Math.max(r + 0.5, hole.counterboreDiaMm / 2);
        const cbD = Math.max(1, hole.counterboreDepthMm);
        const cbZ = M.cylinder(cbD, cbR, cbR, segs, true);
        let cbOri: Manifold;
        let offset: [number, number, number] = [0, 0, 0];
        if (hole.axis === 'y') {
          cbOri = cbZ.rotate([-90, 0, 0]);
          cbZ.delete();
          offset = [0, len / 2 - cbD / 2, 0];
        } else if (hole.axis === 'x') {
          cbOri = cbZ.rotate([0, 90, 0]);
          cbZ.delete();
          offset = [len / 2 - cbD / 2, 0, 0];
        } else {
          cbOri = cbZ;
          offset = [0, 0, len / 2 - cbD / 2];
        }
        const cbPlaced = cbOri.translate([
          hole.x + offset[0],
          hole.y + offset[1],
          hole.z + offset[2],
        ]);
        cbOri.delete();
        cutters.push(cbPlaced);
      }
    }
  }

  if (cutters.length === 0) return block;
  const cutterUnion = cutters.length === 1 ? cutters[0] : M.union(cutters);
  if (cutters.length > 1) cutters.forEach((c) => c.delete());
  try {
    const milled = block.subtract(cutterUnion);
    block.delete();
    return milled;
  } finally {
    cutterUnion.delete();
  }
}

/**
 * FABRICATION ENGINE 2 — Sheet Metal Enclosure / Bent Bracket:
 * Base gauge plate + 90° folded flanges with real cylindrical outer bend radii,
 * corner relief clearances, and optional punched ventilation louver slots.
 */
function buildSheetMetalManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M } = wasm;
  const w = Math.max(16, node.width ?? 220);
  const d = Math.max(16, node.depth ?? 160);
  const t = Math.max(1.2, Math.min(node.thicknessMm ?? 3.0, 12));
  const bendR = Math.max(t, node.bendRadiusMm ?? t * 1.5);
  const segs = densitySegments(12, density);

  const pieces: Manifold[] = [M.cube([w, t, d], true)];

  if (Array.isArray(node.flanges)) {
    for (const fl of node.flanges) {
      const fh = Math.max(t * 2, fl.heightMm);
      const relief = Math.max(0, fl.reliefWidthMm ?? bendR);
      if (fl.edge === '+x' || fl.edge === '-x') {
        const sx = fl.edge === '+x' ? 1 : -1;
        const spanZ = Math.max(4, d - relief * 2);
        const wall = M.cube([t, fh, spanZ], true).translate([
          sx * (w / 2 - t / 2),
          fh / 2 - t / 2,
          0,
        ]);
        // Cylindrical outer bend knuckle smoothing the 90° seam
        const knuckle = M.cylinder(spanZ, t * 0.72, t * 0.72, segs, true).translate([
          sx * (w / 2 - t * 0.5),
          0,
          0,
        ]);
        pieces.push(wall, knuckle);
      } else {
        const sz = fl.edge === '+z' ? 1 : -1;
        const spanX = Math.max(4, w - relief * 2);
        const wall = M.cube([spanX, fh, t], true).translate([
          0,
          fh / 2 - t / 2,
          sz * (d / 2 - t / 2),
        ]);
        const knuckleRaw = M.cylinder(spanX, t * 0.72, t * 0.72, segs, true);
        const knuckle = knuckleRaw.rotate([0, 90, 0]).translate([
          0,
          0,
          sz * (d / 2 - t * 0.5),
        ]);
        knuckleRaw.delete();
        pieces.push(wall, knuckle);
      }
    }
  }

  let sheet = pieces.length === 1 ? pieces[0] : M.union(pieces);
  if (pieces.length > 1) pieces.forEach((p) => p.delete());

  // Optional punched ventilation louver slots
  if (node.louverSlots && node.louverSlots.count > 0) {
    const { count, widthMm, heightMm, pitchMm, face } = node.louverSlots;
    const slots: Manifold[] = [];
    const totalSpan = (count - 1) * pitchMm;
    for (let i = 0; i < count; i++) {
      const off = -totalSpan / 2 + i * pitchMm;
      if (face === 'top') {
        slots.push(M.cube([widthMm, t * 3, heightMm], true).translate([0, 0, off]));
      } else {
        const sz = face === '+z' ? 1 : -1;
        const flH =
          node.flanges?.find((f) => f.edge === face)?.heightMm ?? Math.max(30, heightMm * 4);
        slots.push(
          M.cube([widthMm, heightMm, t * 3], true).translate([
            off,
            flH * 0.55,
            sz * (d / 2 - t / 2),
          ])
        );
      }
    }
    if (slots.length > 0) {
      const slotUnion = slots.length === 1 ? slots[0] : M.union(slots);
      if (slots.length > 1) slots.forEach((s) => s.delete());
      try {
        const vented = sheet.subtract(slotUnion);
        sheet.delete();
        sheet = vented;
      } finally {
        slotUnion.delete();
      }
    }
  }

  return sheet;
}

function buildFoldFlangeRibbonPolygon(
  fl: ResolvedFoldFlange,
  t: number,
  arcSegs: number
): [number, number][] {
  const overlap = Math.min(2.0, t * 0.65);
  const { sign, absRad, bendRadiusMm: rIn1, outerRadiusMm: rOut1, straightLegMm: L1 } = fl;

  const sideA: [number, number][] = [[-overlap, sign * (t / 2)]];
  const sideB: [number, number][] = [[-overlap, -sign * (t / 2)]];

  const c1y = sign * (t / 2 + rIn1);
  for (let i = 0; i <= arcSegs; i++) {
    const a = (i / arcSegs) * absRad;
    const rx = Math.sin(a);
    const ry = -sign * Math.cos(a);
    sideA.push([rIn1 * rx, c1y + rIn1 * ry]);
    sideB.push([rOut1 * rx, c1y + rOut1 * ry]);
  }

  const ux = Math.cos(absRad);
  const uy = sign * Math.sin(absRad);
  const nx = -Math.sin(absRad);
  const ny = sign * Math.cos(absRad);

  const bendEndA = sideA[sideA.length - 1];
  const bendEndB = sideB[sideB.length - 1];
  const pA1: [number, number] = [bendEndA[0] + ux * L1, bendEndA[1] + uy * L1];
  const pB1: [number, number] = [bendEndB[0] + ux * L1, bendEndB[1] + uy * L1];
  sideA.push(pA1);
  sideB.push(pB1);

  if (fl.returnFlange) {
    const ret = fl.returnFlange;
    const { bendRadiusMm: rIn2, outerRadiusMm: rOut2, absRad: absRad2, sign: retSign, straightLegMm: L2 } = ret;
    if (retSign === 1) {
      const c2x = pA1[0] + rIn2 * nx;
      const c2y = pA1[1] + rIn2 * ny;
      for (let i = 1; i <= arcSegs; i++) {
        const b = (i / arcSegs) * absRad2;
        const rx2 = Math.sin(b) * ux - Math.cos(b) * nx;
        const ry2 = Math.sin(b) * uy - Math.cos(b) * ny;
        sideA.push([c2x + rIn2 * rx2, c2y + rIn2 * ry2]);
        sideB.push([c2x + rOut2 * rx2, c2y + rOut2 * ry2]);
      }
      const u2x = Math.cos(absRad2) * ux + Math.sin(absRad2) * nx;
      const u2y = Math.cos(absRad2) * uy + Math.sin(absRad2) * ny;
      const lastA2 = sideA[sideA.length - 1];
      const lastB2 = sideB[sideB.length - 1];
      sideA.push([lastA2[0] + u2x * L2, lastA2[1] + u2y * L2]);
      sideB.push([lastB2[0] + u2x * L2, lastB2[1] + u2y * L2]);
    } else {
      const c2x = pB1[0] - rIn2 * nx;
      const c2y = pB1[1] - rIn2 * ny;
      for (let i = 1; i <= arcSegs; i++) {
        const b = (i / arcSegs) * absRad2;
        const rx2 = Math.sin(b) * ux + Math.cos(b) * nx;
        const ry2 = Math.sin(b) * uy + Math.cos(b) * ny;
        sideA.push([c2x + rOut2 * rx2, c2y + rOut2 * ry2]);
        sideB.push([c2x + rIn2 * rx2, c2y + rIn2 * ry2]);
      }
      const u2x = Math.cos(absRad2) * ux - Math.sin(absRad2) * nx;
      const u2y = Math.cos(absRad2) * uy - Math.sin(absRad2) * ny;
      const lastA2 = sideA[sideA.length - 1];
      const lastB2 = sideB[sideB.length - 1];
      sideA.push([lastA2[0] + u2x * L2, lastA2[1] + u2y * L2]);
      sideB.push([lastB2[0] + u2x * L2, lastB2[1] + u2y * L2]);
    }
  }

  // Deduplicate adjacent nearly identical vertices and ensure CCW winding
  const rawLoop: [number, number][] = [...sideB, ...sideA.slice().reverse()];
  const pts: [number, number][] = [];
  for (const p of rawLoop) {
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-4) {
      pts.push(p);
    }
  }
  if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-4) {
    pts.pop();
  }

  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    area2 += x0 * y1 - x1 * y0;
  }
  if (area2 < 0) pts.reverse();
  return pts;
}

/**
 * FABRICATION ENGINE 2B — True Planar-Development Sheet Metal Folder (`sheetMetalFold`):
 * Folds a 2D planar blank along arbitrary-angle flanges (-165°..+165°) with exact
 * cylindrical inner/outer bend arcs, corner reliefs, secondary return hems/Z-flanges,
 * punched base holes, flange holes, and optional louvers — synchronized 1:1 with
 * `developSheetMetalFlatPattern()` K-factor flat-pattern unfolding.
 */
function buildSheetMetalFoldManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const layout = computeSheetMetalFoldLayout(node);
  const t = layout.thicknessMm;
  const arcSegs = Math.max(5, Math.round(densitySegments(8, density)));
  const holeSegs = densitySegments(16, density);

  // 1. Base planar blank (XZ plane, centered vertically at Y = 0 -> [-t/2, +t/2])
  let basePlate: Manifold;
  if (Array.isArray(node.polygonPoints) && node.polygonPoints.length >= 3) {
    const outer = ensureCCW2D(node.polygonPoints);
    const loops: SimplePolygon[] = [outer as SimplePolygon];
    if (Array.isArray(node.polygonHoles)) {
      for (const hole of node.polygonHoles) {
        if (hole.length >= 3) {
          const cw = ensureCCW2D(hole).slice().reverse();
          loops.push(cw as SimplePolygon);
        }
      }
    }
    const csBase = new CS(loops);
    try {
      const extZ = csBase.extrude(t, 1, 0, [1, 1], true);
      basePlate = extZ.rotate([90, 0, 0]);
      extZ.delete();
    } finally {
      csBase.delete();
    }
  } else {
    const rawCube = M.cube([layout.baseWidthMm, t, layout.baseDepthMm], true);
    if (Math.abs(layout.baseCenterX) > 1e-4 || Math.abs(layout.baseCenterZ) > 1e-4) {
      basePlate = rawCube.translate([layout.baseCenterX, 0, layout.baseCenterZ]);
      rawCube.delete();
    } else {
      basePlate = rawCube;
    }
  }

  if (layout.baseHoles.length > 0) {
    const holeCutters: Manifold[] = [];
    for (const h of layout.baseHoles) {
      const r = h.diameterMm * 0.5;
      const cylZ = M.cylinder(t * 3.2, r, r, holeSegs, true);
      const cylY = cylZ.rotate([90, 0, 0]);
      cylZ.delete();
      const placed = cylY.translate([h.x, 0, h.z]);
      cylY.delete();
      holeCutters.push(placed);
    }
    const cutterUnion = holeCutters.length === 1 ? holeCutters[0] : M.union(holeCutters);
    if (holeCutters.length > 1) holeCutters.forEach((c) => c.delete());
    try {
      const punched = basePlate.subtract(cutterUnion);
      basePlate.delete();
      basePlate = punched;
    } finally {
      cutterUnion.delete();
    }
  }

  // 2. Folded flanges with true cylindrical inner/outer bend arcs + optional return hem
  const pieces: Manifold[] = [basePlate];

  for (const fl of layout.flanges) {
    const ribbonPts = buildFoldFlangeRibbonPolygon(fl, t, arcSegs);
    if (ribbonPts.length < 3) continue;

    const cs = new CS([ribbonPts as SimplePolygon]);
    let flSolid: Manifold;
    try {
      flSolid = cs.extrude(fl.spanMm, 1, 0, [1, 1], true);
    } finally {
      cs.delete();
    }

    // Punch flange holes perpendicular to the Stage-1 straight leg
    if (fl.holes.length > 0) {
      const rMid = fl.bendRadiusMm + t * 0.5;
      const c1y = fl.sign * (t / 2 + fl.bendRadiusMm);
      const midEndS = rMid * Math.sin(fl.absRad);
      const midEndY = c1y - fl.sign * rMid * Math.cos(fl.absRad);
      const ux = Math.cos(fl.absRad);
      const uy = fl.sign * Math.sin(fl.absRad);
      const flipU = fl.edge === '-x' || fl.edge === '+z' ? -1 : 1;

      const flCutters: Manifold[] = [];
      for (const h of fl.holes) {
        const legPos = Math.max(0, h.vMm - fl.setbackMm);
        const hcS = midEndS + ux * legPos;
        const hcY = midEndY + uy * legPos;
        const hcZ = flipU * h.uMm;
        const r = h.diameterMm * 0.5;
        const cylRaw = M.cylinder(t * 3.2, r, r, holeSegs, true);
        const cylRot = cylRaw.rotate([90, 0, fl.angleDeg]);
        cylRaw.delete();
        const placed = cylRot.translate([hcS, hcY, hcZ]);
        cylRot.delete();
        flCutters.push(placed);
      }
      const flCutUnion = flCutters.length === 1 ? flCutters[0] : M.union(flCutters);
      if (flCutters.length > 1) flCutters.forEach((c) => c.delete());
      try {
        const punched = flSolid.subtract(flCutUnion);
        flSolid.delete();
        flSolid = punched;
      } finally {
        flCutUnion.delete();
      }
    }

    // Orient flange from +X ribbon space to its target base edge
    let oriented: Manifold;
    if (fl.edge === '+x') {
      oriented = flSolid.translate([layout.baseXMax, 0, layout.baseCenterZ + fl.offsetMm]);
      flSolid.delete();
    } else if (fl.edge === '-x') {
      const rot = flSolid.rotate([0, 180, 0]);
      flSolid.delete();
      oriented = rot.translate([layout.baseXMin, 0, layout.baseCenterZ + fl.offsetMm]);
      rot.delete();
    } else if (fl.edge === '+z') {
      const rot = flSolid.rotate([0, -90, 0]);
      flSolid.delete();
      oriented = rot.translate([layout.baseCenterX + fl.offsetMm, 0, layout.baseZMax]);
      rot.delete();
    } else {
      const rot = flSolid.rotate([0, 90, 0]);
      flSolid.delete();
      oriented = rot.translate([layout.baseCenterX + fl.offsetMm, 0, layout.baseZMin]);
      rot.delete();
    }

    pieces.push(oriented);
  }

  let sheet = pieces.length === 1 ? pieces[0] : M.union(pieces);
  if (pieces.length > 1) pieces.forEach((p) => p.delete());

  // 3. Optional punched ventilation louver slots
  if (node.louverSlots && node.louverSlots.count > 0) {
    const { count, widthMm, heightMm, pitchMm, face } = node.louverSlots;
    const slots: Manifold[] = [];
    const totalSpan = (count - 1) * pitchMm;
    for (let i = 0; i < count; i++) {
      const off = -totalSpan / 2 + i * pitchMm;
      if (face === 'top') {
        slots.push(M.cube([widthMm, t * 3.2, heightMm], true).translate([layout.baseCenterX, 0, layout.baseCenterZ + off]));
      } else {
        const sz = face === '+z' ? 1 : -1;
        const matchFl = layout.flanges.find((f) => f.edge === face);
        const flH = matchFl?.flangeLengthMm ?? Math.max(30, heightMm * 4);
        slots.push(
          M.cube([widthMm, heightMm, t * 3.5], true).translate([
            layout.baseCenterX + off,
            (matchFl?.sign ?? 1) * flH * 0.52,
            sz * (layout.outerDepthMm / 2 - t / 2),
          ])
        );
      }
    }
    if (slots.length > 0) {
      const slotUnion = slots.length === 1 ? slots[0] : M.union(slots);
      if (slots.length > 1) slots.forEach((s) => s.delete());
      try {
        const vented = sheet.subtract(slotUnion);
        sheet.delete();
        sheet = vented;
      } finally {
        slotUnion.delete();
      }
    }
  }

  return sheet;
}

/**
 * FABRICATION ENGINE 3 — CNC Turned Stepped Shaft:
 * Revolved multi-diameter shaft centered along `shaftAxis` ('x' | 'y' | 'z') with
 * 45° end/shoulder chamfers, retaining-ring grooves, and milled keyway slot.
 */
function buildTurnedShaftManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const sections =
    Array.isArray(node.shaftSections) && node.shaftSections.length > 0
      ? node.shaftSections
      : [{ lengthMm: node.height ?? 160, diameterMm: (node.radius ?? 16) * 2 }];
  const segs = densitySegments(node.radialSegments ?? 32, density);
  const totalLen = sections.reduce((acc, s) => acc + Math.max(1, s.lengthMm), 0);

  // Build 2D revolve half-profile [r, z] centered at z = 0
  const profile: [number, number][] = [[0, -totalLen / 2]];
  let cursor = -totalLen / 2;
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const len = Math.max(1, sec.lengthMm);
    const r = Math.max(1, sec.diameterMm / 2);
    const chS = Math.max(0, Math.min(sec.chamferStartMm ?? 0, len * 0.35, r * 0.4));
    const chE = Math.max(0, Math.min(sec.chamferEndMm ?? 0, len * 0.35, r * 0.4));
    const z0 = cursor;
    const z1 = cursor + len;

    if (chS > 0.1) {
      profile.push([Math.max(0.5, r - chS), z0]);
      profile.push([r, z0 + chS]);
    } else {
      profile.push([r, z0]);
    }
    if (chE > 0.1) {
      profile.push([r, z1 - chE]);
      profile.push([Math.max(0.5, r - chE), z1]);
    } else {
      profile.push([r, z1]);
    }
    cursor = z1;
  }
  profile.push([0, totalLen / 2]);

  const cs = new CS([ensureCCW2D(profile) as SimplePolygon]);
  let shaftZ: Manifold;
  try {
    shaftZ = cs.revolve(segs, 360);
  } finally {
    cs.delete();
  }

  // Subtract optional snap-ring grooves & milled keyway along +Y top of Z-axis shaft
  const cutters: Manifold[] = [];
  const maxR = Math.max(...sections.map((s) => s.diameterMm / 2));

  if (Array.isArray(node.grooves)) {
    for (const gr of node.grooves) {
      // Find local section radius at gr.posMm (measured from -totalLen/2)
      const zLocal = gr.posMm - totalLen / 2;
      let acc = -totalLen / 2;
      let localR = maxR;
      for (const sec of sections) {
        if (zLocal >= acc && zLocal <= acc + sec.lengthMm) {
          localR = sec.diameterMm / 2;
          break;
        }
        acc += sec.lengthMm;
      }
      const innerR = Math.max(1, localR - gr.depthMm);
      const outerCut = M.cylinder(gr.widthMm, localR + 2, localR + 2, segs, true);
      const innerKeep = M.cylinder(gr.widthMm + 2, innerR, innerR, segs, true);
      const ring = outerCut.subtract(innerKeep).translate([0, 0, zLocal]);
      outerCut.delete();
      innerKeep.delete();
      cutters.push(ring);
    }
  }

  if (node.keyway) {
    const kw = node.keyway;
    const zCenter = kw.startMm + kw.lengthMm / 2 - totalLen / 2;
    // Find radius at keyway center
    let acc = -totalLen / 2;
    let localR = maxR;
    for (const sec of sections) {
      if (zCenter >= acc && zCenter <= acc + sec.lengthMm) {
        localR = sec.diameterMm / 2;
        break;
      }
      acc += sec.lengthMm;
    }
    const slot = M.cube([kw.widthMm, kw.depthMm * 2, kw.lengthMm], true).translate([
      0,
      localR,
      zCenter,
    ]);
    cutters.push(slot);
  }

  if (cutters.length > 0) {
    const cutUnion = cutters.length === 1 ? cutters[0] : M.union(cutters);
    if (cutters.length > 1) cutters.forEach((c) => c.delete());
    try {
      const cutShaft = shaftZ.subtract(cutUnion);
      shaftZ.delete();
      shaftZ = cutShaft;
    } finally {
      cutUnion.delete();
    }
  }

  const axis = node.shaftAxis ?? 'z';
  if (axis === 'z') return shaftZ;
  const oriented = axis === 'x' ? shaftZ.rotate([0, 90, 0]) : shaftZ.rotate([-90, 0, 0]);
  shaftZ.delete();
  return oriented;
}

/**
 * FABRICATION ENGINE 4 — Precision Involute Spur Gear:
 * Generates an exact involute tooth profile (pitch radius = m*z/2, pressure angle 20°),
 * extruded face width, integral hub boss, center bore, keyway, and optional lightening holes.
 * Default gear axis = Z (rotatable via `gearAxis`).
 */
function buildInvoluteGearManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const m = Math.max(0.8, node.moduleMm ?? 4);
  const z = Math.max(8, Math.min(96, Math.round(node.teeth ?? 24)));
  const faceW = Math.max(4, node.faceWidthMm ?? 24);
  const alpha = ((node.pressureAngleDeg ?? 20) * Math.PI) / 180;

  const rp = (m * z) / 2; // Pitch radius
  const rb = rp * Math.cos(alpha); // Base circle radius
  const ra = rp + m * 0.96; // Tip (addendum) radius with tiny tip relief
  const rd = Math.max(2, rp - m * 1.25); // Root (dedendum) radius

  const invAlpha = Math.tan(alpha) - alpha;
  // Half angular tooth thickness at pitch circle (slight 2% backlash for zero-interference meshing)
  const halfPitchAngle = (Math.PI / (2 * z)) * 0.975;
  const halfBaseAngle = halfPitchAngle + invAlpha;

  const tMax = ra > rb ? Math.sqrt((ra / rb) ** 2 - 1) : 0.01;
  const tMin = rd > rb ? Math.sqrt((rd / rb) ** 2 - 1) : 0;
  const flankSteps = density === 'ultra' ? 5 : 4;

  const poly: SimplePolygon = [];
  const pitchStep = (Math.PI * 2) / z;

  for (let i = 0; i < z; i++) {
    const toothCenter = i * pitchStep;

    // Root fillet start (between previous tooth and this tooth)
    const rootAngleStart = toothCenter - halfBaseAngle - pitchStep * 0.14;
    poly.push([Math.cos(rootAngleStart) * rd, Math.sin(rootAngleStart) * rd]);

    // Right-hand (ascending) involute flank
    for (let s = 0; s <= flankSteps; s++) {
      const t = tMin + (s / flankSteps) * (tMax - tMin);
      const r = rb * Math.sqrt(1 + t * t);
      const phi = t - Math.atan(t);
      const a = toothCenter - halfBaseAngle + phi;
      poly.push([Math.cos(a) * r, Math.sin(a) * r]);
    }

    // Left-hand (descending) involute flank
    for (let s = flankSteps; s >= 0; s--) {
      const t = tMin + (s / flankSteps) * (tMax - tMin);
      const r = rb * Math.sqrt(1 + t * t);
      const phi = t - Math.atan(t);
      const a = toothCenter + halfBaseAngle - phi;
      poly.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  const cs = new CS([ensureCCW2D(poly) as SimplePolygon]);
  let gearZ: Manifold;
  try {
    gearZ = cs.extrude(faceW, 0, 0, [1, 1], true);
  } finally {
    cs.delete();
  }

  const segs = densitySegments(28, density);
  const boreR = Math.max(0, (node.boreDiameterMm ?? rp * 0.45) / 2);

  // Optional integral cylindrical hub boss
  if (node.hubDiameterMm && node.hubDiameterMm > boreR * 2 + 2) {
    const hubR = Math.min(rd - 1.5, node.hubDiameterMm / 2);
    const hubL = Math.max(faceW, node.hubLengthMm ?? faceW * 1.45);
    const hub = M.cylinder(hubL, hubR, hubR, segs, true);
    const merged = M.union([gearZ, hub]);
    gearZ.delete();
    hub.delete();
    gearZ = merged;
  }

  // Bore + Keyway + Optional Lightening Holes
  const cutters: Manifold[] = [];
  const cutLen = Math.max(faceW, node.hubLengthMm ?? faceW) + 16;
  if (boreR >= 1) {
    cutters.push(M.cylinder(cutLen, boreR, boreR, segs, true));
    if (node.keywayWidthMm && node.keywayDepthMm) {
      cutters.push(
        M.cube([node.keywayWidthMm, node.keywayDepthMm * 2, cutLen], true).translate([
          0,
          boreR,
          0,
        ])
      );
    }
  }

  const lightCount = node.lighteningHoleCount ?? 0;
  if (lightCount >= 3 && rd > boreR + 24) {
    const hubOuter = (node.hubDiameterMm ?? boreR * 3) / 2;
    const webMidR = (hubOuter + rd) * 0.5;
    const holeR = Math.min((rd - hubOuter) * 0.3, (Math.PI * webMidR) / (lightCount * 1.8));
    if (holeR >= 4) {
      for (let i = 0; i < lightCount; i++) {
        const a = (i / lightCount) * Math.PI * 2;
        cutters.push(
          M.cylinder(cutLen, holeR, holeR, densitySegments(16, density), true).translate([
            Math.cos(a) * webMidR,
            Math.sin(a) * webMidR,
            0,
          ])
        );
      }
    }
  }

  if (cutters.length > 0) {
    const cutUnion = cutters.length === 1 ? cutters[0] : M.union(cutters);
    if (cutters.length > 1) cutters.forEach((c) => c.delete());
    try {
      const bored = gearZ.subtract(cutUnion);
      gearZ.delete();
      gearZ = bored;
    } finally {
      cutUnion.delete();
    }
  }

  const axis = node.gearAxis ?? 'z';
  if (axis === 'z') return gearZ;
  const oriented = axis === 'x' ? gearZ.rotate([0, 90, 0]) : gearZ.rotate([-90, 0, 0]);
  gearZ.delete();
  return oriented;
}

/**
 * FABRICATION ENGINE 5 — Structural Beams & 80/20 T-Slot Extrusions:
 * Generates accurate standard structural profiles ('iBeam' | 'cChannel' | 'tSlot8020' |
 * 'angleIron' | 'squareTube' | 'roundTube') either extruded straight or swept along 3D `pathPoints`.
 */
function buildStructuralBeamManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const pType = node.profileType ?? 'tSlot8020';
  const w = Math.max(10, node.width ?? 40);
  const h = Math.max(10, node.height ?? 40);
  const tf = Math.max(2, Math.min(node.flangeThicknessMm ?? 6, h * 0.3));
  const tw = Math.max(2, Math.min(node.webThicknessMm ?? 5, w * 0.3));
  const hw = w / 2;
  const hh = h / 2;

  let profile: SimplePolygon;
  if (pType === 'iBeam') {
    const htw = tw / 2;
    profile = [
      [-hw, -hh],
      [hw, -hh],
      [hw, -hh + tf],
      [htw, -hh + tf],
      [htw, hh - tf],
      [hw, hh - tf],
      [hw, hh],
      [-hw, hh],
      [-hw, hh - tf],
      [-htw, hh - tf],
      [-htw, -hh + tf],
      [-hw, -hh + tf],
    ];
  } else if (pType === 'cChannel') {
    profile = [
      [-hw, -hh],
      [hw, -hh],
      [hw, -hh + tf],
      [-hw + tw, -hh + tf],
      [-hw + tw, hh - tf],
      [hw, hh - tf],
      [hw, hh],
      [-hw, hh],
    ];
  } else if (pType === 'angleIron') {
    profile = [
      [-hw, -hh],
      [hw, -hh],
      [hw, -hh + tf],
      [-hw + tw, -hh + tf],
      [-hw + tw, hh],
      [-hw, hh],
    ];
  } else if (pType === 'tSlot8020') {
    // True 4-sided 80/20 aluminum T-slot extrusion profile
    const s = Math.min(w, h) / 2;
    const slotOpen = s * 0.24;
    const lipT = s * 0.18;
    const slotInnerW = s * 0.46;
    const slotDepth = s * 0.42;
    const c = s * 0.92;
    // Build 1 quadrant edge and mirror 4x around 90° rotations
    const sidePts: [number, number][] = [
      [c, -s],
      [s, -c],
      [s, -slotOpen],
      [s - lipT, -slotOpen],
      [s - lipT, -slotInnerW],
      [s - slotDepth, -slotInnerW],
      [s - slotDepth, slotInnerW],
      [s - lipT, slotInnerW],
      [s - lipT, slotOpen],
      [s, slotOpen],
    ];
    const full: SimplePolygon = [];
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (const [px, py] of sidePts) {
        full.push([px * ca - py * sa, px * sa + py * ca]);
      }
    }
    profile = ensureCCW2D(full) as SimplePolygon;
  } else {
    profile = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
  }

  // If 3D pathPoints are provided, sweep this profile along the path with mitered/bent corners!
  if (Array.isArray(node.pathPoints) && node.pathPoints.length >= 2) {
    return buildGeneralSweepManifold(
      wasm,
      {
        ...node,
        op: 'sweep',
        profilePoints: profile,
        cornerMode: node.cornerMode ?? 'miter',
      },
      density
    );
  }

  // Otherwise extrude straight along Z (beamLengthMm or depth)
  const len = Math.max(10, node.beamLengthMm ?? node.depth ?? 300);
  const cs = new CS([ensureCCW2D(profile) as SimplePolygon]);
  let beam: Manifold;
  try {
    beam = cs.extrude(len, 0, 0, [1, 1], true);
  } finally {
    cs.delete();
  }

  // Hollow out squareTube or center bore on tSlot8020
  if (pType === 'squareTube' && w > tw * 2.5 && h > tf * 2.5) {
    const inner = M.cube([w - tw * 2, h - tf * 2, len + 8], true);
    const hollow = beam.subtract(inner);
    beam.delete();
    inner.delete();
    beam = hollow;
  } else if (pType === 'tSlot8020') {
    const boreR = Math.min(w, h) * 0.11;
    const bore = M.cylinder(len + 8, boreR, boreR, densitySegments(16, density), true);
    const bored = beam.subtract(bore);
    beam.delete();
    bore.delete();
    beam = bored;
  }

  return beam;
}

/**
 * FABRICATION ENGINE 6 — COTS Rolling-Element Ball Bearing:
 * Watertight outer race, inner race, brass/steel cage ring, and spherical ball complement.
 */
function buildBallBearingManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M } = wasm;
  const rIn = Math.max(3, (node.innerDiaMm ?? 20) / 2);
  const rOut = Math.max(rIn + 6, (node.outerDiaMm ?? 47) / 2);
  const w = Math.max(5, node.width ?? 14);
  const segs = densitySegments(node.radialSegments ?? 28, density);

  const radialSpan = rOut - rIn;
  const rPitch = (rIn + rOut) / 2;
  const raceThick = radialSpan * 0.24;
  const ballR = Math.max(2, Math.min(radialSpan * 0.28, w * 0.38));
  const ballCount = Math.max(6, Math.min(16, node.ballCount ?? 9));

  // Outer race ring
  const outerCyl = M.cylinder(w, rOut, rOut, segs, true);
  const outerHole = M.cylinder(w + 4, rOut - raceThick, rOut - raceThick, segs, true);
  const outerRace = outerCyl.subtract(outerHole);
  outerCyl.delete();
  outerHole.delete();

  // Inner race ring
  const innerCyl = M.cylinder(w, rIn + raceThick, rIn + raceThick, segs, true);
  const innerHole = M.cylinder(w + 4, rIn, rIn, segs, true);
  const innerRace = innerCyl.subtract(innerHole);
  innerCyl.delete();
  innerHole.delete();

  // Recessed shield / retainer web so the bearing reads cleanly as a single solid unit
  const shieldOuter = M.cylinder(w * 0.42, rOut - raceThick + 0.6, rOut - raceThick + 0.6, segs, true);
  const shieldInner = M.cylinder(w * 0.5, rIn + raceThick - 0.6, rIn + raceThick - 0.6, segs, true);
  const cage = shieldOuter.subtract(shieldInner);
  shieldOuter.delete();
  shieldInner.delete();

  const pieces: Manifold[] = [outerRace, innerRace, cage];
  const ballSegs = densitySegments(12, density);
  const protoBall = M.sphere(ballR, ballSegs);
  for (let i = 0; i < ballCount; i++) {
    const a = (i / ballCount) * Math.PI * 2;
    pieces.push(protoBall.translate([Math.cos(a) * rPitch, Math.sin(a) * rPitch, 0]));
  }
  protoBall.delete();

  let bearingZ = M.union(pieces);
  pieces.forEach((p) => p.delete());

  const axis = node.bearingAxis ?? 'z';
  if (axis === 'z') return bearingZ;
  const oriented = axis === 'x' ? bearingZ.rotate([0, 90, 0]) : bearingZ.rotate([-90, 0, 0]);
  bearingZ.delete();
  return oriented;
}

/**
 * SCULPTURAL ENGINE 1 — Multi-Station Superellipse Loft (`superellipseLoft`):
 * Builds a watertight aerodynamic fuselage, housing, or limb shell by generating
 * superellipse cross-section disks at each station along `loftAxis` ('x'|'y'|'z'),
 * taking pairwise convex hulls between consecutive stations, and unioning them.
 */
function buildSuperellipseLoftManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const rawStations = node.superellipseStations || [];
  const axis = node.loftAxis ?? 'x';
  const segs = densitySegments(node.radialSegments ?? 28, density);

  if (rawStations.length === 0) {
    return M.cube([120, 60, 60], true);
  }

  const sorted = [...rawStations].sort((a, b) => a.posMm - b.posMm);

  const makeStationDisk = (st: (typeof sorted)[number], thickMm: number): Manifold => {
    const ha = Math.max(0.5, st.halfA);
    const hb = Math.max(0.5, st.halfB);
    const exp = Math.max(1.2, Math.min(8.0, st.exponent ?? 2.6));
    const power = 2 / exp;
    const uOff = st.offsetU ?? 0;
    const vOff = st.offsetV ?? 0;

    // Cross-section polygon in XY (extruded along local Z, then rotated onto loftAxis)
    const poly: [number, number][] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const uVal = Math.sign(ca) * Math.pow(Math.abs(ca), power);
      const vVal = Math.sign(sa) * Math.pow(Math.abs(sa), power);
      if (axis === 'x') {
        // rotate([0, 90, 0]) maps local (x, y, z) -> (z, y, -x), so x_poly -> -Z (halfB), y_poly -> Y (halfA)
        poly.push([uVal * hb, vVal * ha]);
      } else {
        poly.push([uVal * ha, vVal * hb]);
      }
    }

    const cs = new CS([ensureCCW2D(poly) as SimplePolygon]);
    let disk: Manifold;
    try {
      disk = cs.extrude(thickMm, 0, 0, [1, 1], true);
    } finally {
      cs.delete();
    }

    let oriented: Manifold;
    if (axis === 'x') {
      oriented = disk.rotate([0, 90, 0]);
      disk.delete();
      const placed = oriented.translate([st.posMm, uOff, vOff]);
      oriented.delete();
      return placed;
    } else if (axis === 'y') {
      oriented = disk.rotate([-90, 0, 0]);
      disk.delete();
      const placed = oriented.translate([uOff, st.posMm, vOff]);
      oriented.delete();
      return placed;
    } else {
      const placed = disk.translate([uOff, vOff, st.posMm]);
      disk.delete();
      return placed;
    }
  };

  if (sorted.length === 1) {
    return makeStationDisk(sorted[0], Math.max(4, node.depth ?? 20));
  }

  const disks = sorted.map((st) => makeStationDisk(st, 0.4));
  const segments: Manifold[] = [];
  try {
    for (let i = 0; i < disks.length - 1; i++) {
      segments.push(M.hull([disks[i], disks[i + 1]]));
    }
  } finally {
    disks.forEach((d) => d.delete());
  }

  if (segments.length === 1) return segments[0];
  const loft = M.union(segments);
  segments.forEach((s) => s.delete());
  return loft;
}

/**
 * Corner-preserving closed Catmull-Rom spline resampler for 2D contours.
 * Smooths gentle curves into dense segments while keeping sharp corners (> sharpCornerAngleDeg) crisp.
 */
function resamplePolygonCatmullRom(
  pts: [number, number][],
  subdivisions: number,
  sharpCornerAngleDeg = 68,
  tension = 0.5
): [number, number][] {
  const n = pts.length;
  const subs = Math.max(1, Math.min(12, Math.round(subdivisions)));
  if (n < 3 || subs <= 1) return pts;

  const sharpCos = Math.cos(THREE.MathUtils.degToRad(Math.max(5, Math.min(175, sharpCornerAngleDeg))));
  const isSharp = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const dx1 = curr[0] - prev[0];
    const dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0];
    const dy2 = next[1] - curr[1];
    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    if (len1 < 1e-5 || len2 < 1e-5) {
      isSharp[i] = true;
      continue;
    }
    const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    if (dot < sharpCos) {
      isSharp[i] = true;
    }
  }

  const out: [number, number][] = [];
  const tScale = Math.max(0.05, Math.min(1.0, tension));

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    // If both endpoints are sharp corners, keep the straight edge directly
    if (isSharp[i] && isSharp[(i + 1) % n]) {
      out.push([p1[0], p1[1]]);
      continue;
    }

    // Hermite tangents at p1 and p2 (clamped to chord direction at sharp vertices)
    const chordX = p2[0] - p1[0];
    const chordY = p2[1] - p1[1];
    const m1x = isSharp[i] ? chordX * tScale : (p2[0] - p0[0]) * tScale;
    const m1y = isSharp[i] ? chordY * tScale : (p2[1] - p0[1]) * tScale;
    const m2x = isSharp[(i + 1) % n] ? chordX * tScale : (p3[0] - p1[0]) * tScale;
    const m2y = isSharp[(i + 1) % n] ? chordY * tScale : (p3[1] - p1[1]) * tScale;

    for (let s = 0; s < subs; s++) {
      const t = s / subs;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      const x = h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x;
      const y = h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y;
      if (out.length === 0 || Math.hypot(x - out[out.length - 1][0], y - out[out.length - 1][1]) > 1e-3) {
        out.push([x, y]);
      }
    }
  }

  return out.length >= 3 ? out : pts;
}

/**
 * Sweeps a 2D bevel-cutter cross-section around a closed 2D loop in the Z = +halfDepth plane.
 * Cutter profile coordinates are [inwardMm, zOffsetMm] relative to the loop edge.
 */
function buildClosedLoopBevelCutter(
  wasm: ManifoldToplevel,
  loop: [number, number][],
  halfDepth: number,
  bevelMm: number,
  bevelSegments: number
): Manifold | null {
  const { Manifold: M, Mesh: ManifoldMesh } = wasm;
  // Clean near-duplicate consecutive vertices
  const pts: [number, number][] = [];
  for (const p of loop) {
    if (pts.length === 0 || Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 0.05) {
      pts.push([p[0], p[1]]);
    }
  }
  if (pts.length >= 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 0.05) {
    pts.pop();
  }
  const n = pts.length;
  if (n < 3) return null;

  const segs = Math.max(1, Math.min(8, Math.round(bevelSegments)));
  const margin = Math.max(0.4, bevelMm * 0.45);
  // 2D cutter profile in (u = inward normal into solid, v = +Z above top face)
  // CCW in (u, v) plane
  const profile: [number, number][] = [
    [-margin, margin],
    [-margin, -bevelMm],
  ];
  if (segs === 1) {
    profile.push([0, -bevelMm]);
    profile.push([bevelMm, 0]);
  } else {
    for (let s = 0; s <= segs; s++) {
      const theta = (s / segs) * (Math.PI * 0.5);
      const u = bevelMm * (1 - Math.cos(theta));
      const v = -bevelMm * (1 - Math.sin(theta));
      profile.push([u, v]);
    }
  }
  profile.push([bevelMm, margin]);

  const numProf = profile.length;
  const ringVerts: number[] = [];
  const MITER_LIMIT = 2.2;

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    let tInX = curr[0] - prev[0];
    let tInY = curr[1] - prev[1];
    const lenIn = Math.hypot(tInX, tInY) || 1;
    tInX /= lenIn;
    tInY /= lenIn;

    let tOutX = next[0] - curr[0];
    let tOutY = next[1] - curr[1];
    const lenOut = Math.hypot(tOutX, tOutY) || 1;
    tOutX /= lenOut;
    tOutY /= lenOut;

    // Inward normals (Z x T = (-ty, tx)) work identically for CCW outer loops and CW holes
    const nInX = -tInY;
    const nInY = tInX;
    const nOutX = -tOutY;
    const nOutY = tOutX;

    let miterX = nInX + nOutX;
    let miterY = nInY + nOutY;
    const miterLen = Math.hypot(miterX, miterY);
    let miterScale = 1.0;
    if (miterLen < 1e-4) {
      miterX = nInX;
      miterY = nInY;
    } else {
      miterX /= miterLen;
      miterY /= miterLen;
      const denom = miterX * nInX + miterY * nInY;
      miterScale = Math.min(MITER_LIMIT, 1 / Math.max(0.25, Math.abs(denom)));
    }

    for (let k = 0; k < numProf; k++) {
      const [u, v] = profile[k];
      ringVerts.push(
        curr[0] + miterX * u * miterScale,
        curr[1] + miterY * u * miterScale,
        halfDepth + v
      );
    }
  }

  const triIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const iNext = (i + 1) % n;
    const baseA = i * numProf;
    const baseB = iNext * numProf;
    for (let k = 0; k < numProf; k++) {
      const kNext = (k + 1) % numProf;
      const a0 = baseA + k;
      const a1 = baseA + kNext;
      const b0 = baseB + k;
      const b1 = baseB + kNext;
      triIndices.push(a0, a1, b1);
      triIndices.push(a0, b1, b0);
    }
  }

  const mMesh = new ManifoldMesh({
    numProp: 3,
    vertProperties: new Float32Array(ringVerts),
    triVerts: new Uint32Array(triIndices),
  });
  mMesh.merge();
  let cutter = M.ofMesh(mMesh);
  if (cutter.status() !== 'NoError' || cutter.isEmpty()) {
    cutter.delete();
    for (let i = 0; i < triIndices.length; i += 3) {
      const tmp = triIndices[i + 1];
      triIndices[i + 1] = triIndices[i + 2];
      triIndices[i + 2] = tmp;
    }
    const flipped = new ManifoldMesh({
      numProp: 3,
      vertProperties: new Float32Array(ringVerts),
      triVerts: new Uint32Array(triIndices),
    });
    flipped.merge();
    cutter = M.ofMesh(flipped);
  }
  if (cutter.status() !== 'NoError' || cutter.isEmpty()) {
    cutter.delete();
    return null;
  }
  return cutter;
}

/**
 * Watertight 3D beveled/chamfered extrusion for any 2D CrossSection (convex, concave, or with holes).
 */
function buildBeveledPolygonExtrudeManifold(
  wasm: ManifoldToplevel,
  shape: CrossSection,
  depth: number,
  bevelMm: number,
  bevelSegments: number
): Manifold {
  const { Manifold: M } = wasm;
  const fullPrism = shape.extrude(depth, 0, 0, [1, 1], true);
  const bevel = Math.min(Math.max(0, bevelMm), depth * 0.45);
  if (bevel <= 0.05) return fullPrism;

  const loops = shape.toPolygons();
  const halfDepth = depth * 0.5;
  const topCutters: Manifold[] = [];
  for (const poly of loops) {
    if (poly.length < 3) continue;
    const pts: [number, number][] = poly.map(([x, y]) => [x, y]);
    const cutter = buildClosedLoopBevelCutter(wasm, pts, halfDepth, bevel, bevelSegments);
    if (cutter) topCutters.push(cutter);
  }

  if (topCutters.length === 0) {
    return fullPrism;
  }

  const topUnion = topCutters.length === 1 ? topCutters[0] : M.union(topCutters);
  if (topCutters.length > 1) topCutters.forEach((c) => c.delete());
  const botUnion = topUnion.mirror([0, 0, 1]);
  const bothCutters = M.union([topUnion, botUnion]);
  topUnion.delete();
  botUnion.delete();

  try {
    const beveled = fullPrism.subtract(bothCutters);
    if (beveled.status() === 'NoError' && !beveled.isEmpty()) {
      fullPrism.delete();
      return beveled;
    }
    beveled.delete();
    return fullPrism;
  } finally {
    bothCutters.delete();
  }
}

/**
 * SCULPTURAL ENGINE 5 — Curved-Spine Tapered Superellipse Loft (`curvedLoft`):
 * Sweeps smoothly varying (optionally asymmetric) superellipse cross-sections along a
 * 3D centripetal Catmull-Rom spline (or polyline) using:
 *   - Fritsch-Carlson Monotone Cubic Hermite (PCHIP) scalar interpolation (zero overshoot)
 *   - Exact analytical spline tangents + twist-free Bishop (parallel-transport) frames
 *   - Watertight 'flat', 'domed' (superellipsoidal), or 'beveled' end-caps
 */
function buildCurvedLoftManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, Mesh: ManifoldMesh } = wasm;
  const rawStations = node.curvedLoftStations || [];
  if (rawStations.length < 2) {
    return M.cube([40, 20, 20], true);
  }

  const radialSegs = densitySegments(node.radialSegments ?? 28, density);
  const useSpline = node.pathMode !== 'polyline' && rawStations.length >= 3;
  const defaultSamples = Math.max(12, (rawStations.length - 1) * 6);
  const numSamples = Math.max(
    rawStations.length,
    Math.min(180, node.splineSamples ?? densitySegments(defaultSamples, density))
  );

  // Build 3D spine curve & non-uniform cumulative arc-length knots
  const ctrlVecs = rawStations.map((st) => new THREE.Vector3(st.posMm[0], st.posMm[1], st.posMm[2]));
  const cumLen: number[] = [0];
  for (let i = 1; i < ctrlVecs.length; i++) {
    cumLen.push(cumLen[i - 1] + Math.max(1e-4, ctrlVecs[i].distanceTo(ctrlVecs[i - 1])));
  }
  const totalCtrlLen = Math.max(1e-4, cumLen[cumLen.length - 1]);
  const stationT = cumLen.map((l) => l / totalCtrlLen);

  const curve = useSpline
    ? new THREE.CatmullRomCurve3(ctrlVecs, false, 'centripetal', node.splineTension ?? 0.5)
    : null;

  // Pre-extract station scalar arrays for Fritsch-Carlson PCHIP (C1, strictly zero overshoot)
  const arrHalfAPos = rawStations.map((s) => s.halfAPos ?? s.halfA);
  const arrHalfANeg = rawStations.map((s) => s.halfANeg ?? s.halfA);
  const arrHalfBPos = rawStations.map((s) => s.halfBPos ?? s.halfB);
  const arrHalfBNeg = rawStations.map((s) => s.halfBNeg ?? s.halfB);
  const arrOffsetN = rawStations.map((s) => s.offsetN ?? 0);
  const arrOffsetB = rawStations.map((s) => s.offsetB ?? 0);
  const arrExp = rawStations.map((s) => s.exponent ?? 2.6);
  const arrTwist = rawStations.map((s) => s.twistDeg ?? 0);

  const interp = (arr: number[], t: number, minVal: number, maxVal: number): number => {
    if (!useSpline || rawStations.length < 3) {
      if (t <= 0) return THREE.MathUtils.clamp(arr[0], minVal, maxVal);
      if (t >= 1) return THREE.MathUtils.clamp(arr[arr.length - 1], minVal, maxVal);
      let idx = 0;
      for (let i = 0; i < stationT.length - 1; i++) {
        if (t >= stationT[i] && t <= stationT[i + 1]) {
          idx = i;
          break;
        }
      }
      const span = Math.max(1e-6, stationT[idx + 1] - stationT[idx]);
      const u = THREE.MathUtils.clamp((t - stationT[idx]) / span, 0, 1);
      return THREE.MathUtils.clamp(THREE.MathUtils.lerp(arr[idx], arr[idx + 1], u), minVal, maxVal);
    }
    return THREE.MathUtils.clamp(monotoneCubicInterp(stationT, arr, t), minVal, maxVal);
  };

  interface SampledRing {
    pos: THREE.Vector3;
    halfAPos: number;
    halfANeg: number;
    halfBPos: number;
    halfBNeg: number;
    offsetN: number;
    offsetB: number;
    exponent: number;
    twistRad: number;
  }

  const samples: SampledRing[] = [];
  const rawTangents: THREE.Vector3[] = [];

  for (let i = 0; i < numSamples; i++) {
    const t = i / (numSamples - 1);
    let pos: THREE.Vector3;
    let tan: THREE.Vector3;
    if (curve) {
      pos = curve.getPointAt(t);
      tan = curve.getTangentAt(t);
    } else {
      let idx = 0;
      for (let j = 0; j < stationT.length - 1; j++) {
        if (t >= stationT[j] && t <= stationT[j + 1]) {
          idx = j;
          break;
        }
      }
      const span = Math.max(1e-6, stationT[idx + 1] - stationT[idx]);
      const u = THREE.MathUtils.clamp((t - stationT[idx]) / span, 0, 1);
      pos = new THREE.Vector3().lerpVectors(ctrlVecs[idx], ctrlVecs[idx + 1], u);
      tan = new THREE.Vector3().subVectors(ctrlVecs[idx + 1], ctrlVecs[idx]);
    }
    rawTangents.push(tan);
    samples.push({
      pos,
      halfAPos: interp(arrHalfAPos, t, 0.25, 5000),
      halfANeg: interp(arrHalfANeg, t, 0.25, 5000),
      halfBPos: interp(arrHalfBPos, t, 0.25, 5000),
      halfBNeg: interp(arrHalfBNeg, t, 0.25, 5000),
      offsetN: interp(arrOffsetN, t, -2000, 2000),
      offsetB: interp(arrOffsetB, t, -2000, 2000),
      exponent: interp(arrExp, t, 1.2, 10.0),
      twistRad: THREE.MathUtils.degToRad(interp(arrTwist, t, -360, 360)),
    });
  }

  // Twist-free orthonormal right-handed Bishop frames
  const frames = computeBishopFrames(rawTangents, node.upHint);

  // Optionally prepend/append domed or beveled cap rings
  const startCapStyle = node.startCapStyle ?? 'flat';
  const endCapStyle = node.endCapStyle ?? 'flat';

  interface RingSpec {
    pos: THREE.Vector3;
    N: THREE.Vector3;
    B: THREE.Vector3;
    halfAPos: number;
    halfANeg: number;
    halfBPos: number;
    halfBNeg: number;
    offsetN: number;
    offsetB: number;
    exponent: number;
  }

  const qTwist = new THREE.Quaternion();
  const baseRings: RingSpec[] = samples.map((st, s) => {
    let N = frames[s].normal;
    let B = frames[s].binormal;
    if (Math.abs(st.twistRad) > 1e-4) {
      qTwist.setFromAxisAngle(frames[s].tangent, st.twistRad);
      N = N.clone().applyQuaternion(qTwist).normalize();
      B = B.clone().applyQuaternion(qTwist).normalize();
    }
    return {
      pos: st.pos,
      N,
      B,
      halfAPos: st.halfAPos,
      halfANeg: st.halfANeg,
      halfBPos: st.halfBPos,
      halfBNeg: st.halfBNeg,
      offsetN: st.offsetN,
      offsetB: st.offsetB,
      exponent: st.exponent,
    };
  });

  const makeCapRings = (
    endRing: RingSpec,
    outwardDir: THREE.Vector3,
    style: 'flat' | 'domed' | 'beveled'
  ): { rings: RingSpec[]; pole: THREE.Vector3 } => {
    const minHalf = Math.min(endRing.halfAPos, endRing.halfANeg, endRing.halfBPos, endRing.halfBNeg);
    const capDepth = Math.max(0.25, node.capDepthMm ?? minHalf * (style === 'domed' ? 0.55 : 0.25));
    const centerAt = (d: number) =>
      endRing.pos
        .clone()
        .addScaledVector(outwardDir, d)
        .addScaledVector(endRing.N, endRing.offsetN)
        .addScaledVector(endRing.B, endRing.offsetB);

    if (style === 'flat') {
      return { rings: [], pole: centerAt(0) };
    }
    if (style === 'beveled') {
      const bevelScale = 0.72;
      return {
        rings: [
          {
            ...endRing,
            pos: endRing.pos.clone().addScaledVector(outwardDir, capDepth),
            halfAPos: Math.max(0.15, endRing.halfAPos * bevelScale),
            halfANeg: Math.max(0.15, endRing.halfANeg * bevelScale),
            halfBPos: Math.max(0.15, endRing.halfBPos * bevelScale),
            halfBNeg: Math.max(0.15, endRing.halfBNeg * bevelScale),
          },
        ],
        pole: centerAt(capDepth),
      };
    }
    // Domed superellipsoidal cap (4 smooth latitude rings)
    const domeSteps = 4;
    const rings: RingSpec[] = [];
    for (let i = 1; i <= domeSteps; i++) {
      const phi = (i / (domeSteps + 1)) * (Math.PI * 0.5);
      const radialScale = Math.cos(phi);
      const axialDist = Math.sin(phi) * capDepth;
      rings.push({
        ...endRing,
        pos: endRing.pos.clone().addScaledVector(outwardDir, axialDist),
        halfAPos: Math.max(0.15, endRing.halfAPos * radialScale),
        halfANeg: Math.max(0.15, endRing.halfANeg * radialScale),
        halfBPos: Math.max(0.15, endRing.halfBPos * radialScale),
        halfBNeg: Math.max(0.15, endRing.halfBNeg * radialScale),
      });
    }
    return { rings, pole: centerAt(capDepth) };
  };

  const startCap = makeCapRings(baseRings[0], frames[0].tangent.clone().negate(), startCapStyle);
  const endCap = makeCapRings(
    baseRings[baseRings.length - 1],
    frames[frames.length - 1].tangent.clone(),
    endCapStyle
  );

  const allRings: RingSpec[] = [...startCap.rings.reverse(), ...baseRings, ...endCap.rings];
  const totalRings = allRings.length;

  // Build ring vertices + start/end pole cap vertices
  const verts: number[] = [];
  for (let s = 0; s < totalRings; s++) {
    const r = allRings[s];
    const profile2D = sampleAsymmetricSuperellipse(
      radialSegs,
      r.halfAPos,
      r.halfANeg,
      r.halfBPos,
      r.halfBNeg,
      r.exponent,
      r.offsetN,
      r.offsetB
    );
    for (let k = 0; k < radialSegs; k++) {
      const [u, v] = profile2D[k];
      verts.push(
        r.pos.x + r.N.x * u + r.B.x * v,
        r.pos.y + r.N.y * u + r.B.y * v,
        r.pos.z + r.N.z * u + r.B.z * v
      );
    }
  }

  const startCenterIdx = totalRings * radialSegs;
  verts.push(startCap.pole.x, startCap.pole.y, startCap.pole.z);
  const endCenterIdx = startCenterIdx + 1;
  verts.push(endCap.pole.x, endCap.pole.y, endCap.pole.z);

  const triIndices: number[] = [];
  for (let s = 0; s < totalRings - 1; s++) {
    const baseA = s * radialSegs;
    const baseB = (s + 1) * radialSegs;
    for (let k = 0; k < radialSegs; k++) {
      const kNext = (k + 1) % radialSegs;
      const a0 = baseA + k;
      const a1 = baseA + kNext;
      const b0 = baseB + k;
      const b1 = baseB + kNext;
      triIndices.push(a0, a1, b1);
      triIndices.push(a0, b1, b0);
    }
  }

  const endBase = (totalRings - 1) * radialSegs;
  for (let k = 0; k < radialSegs; k++) {
    const kNext = (k + 1) % radialSegs;
    triIndices.push(startCenterIdx, kNext, k);
    triIndices.push(endCenterIdx, endBase + k, endBase + kNext);
  }

  const mMesh = new ManifoldMesh({
    numProp: 3,
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(triIndices),
  });
  mMesh.merge();
  let solid = M.ofMesh(mMesh);
  if (solid.status() !== 'NoError' || solid.isEmpty()) {
    solid.delete();
    for (let i = 0; i < triIndices.length; i += 3) {
      const tmp = triIndices[i + 1];
      triIndices[i + 1] = triIndices[i + 2];
      triIndices[i + 2] = tmp;
    }
    const flipped = new ManifoldMesh({
      numProp: 3,
      vertProperties: new Float32Array(verts),
      triVerts: new Uint32Array(triIndices),
    });
    flipped.merge();
    solid = M.ofMesh(flipped);
  }
  return solid;
}

/**
 * SCULPTURAL ENGINE 6 — Generalized Filleted Junction (`filletedJunction`):
 * C1 tangent-continuous flared transition between two superellipse sections (base -> top)
 * along any axis ('x' | 'y' | 'z') with optional sinkDepthMm into host solid for zero-gap unions.
 */
function buildFilletedJunctionManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const height = Math.max(1.0, node.height ?? 24.0);
  const sinkD = Math.max(0, Math.abs(node.sinkDepthMm ?? 4.0));
  const topA = Math.max(0.5, node.topHalfA ?? node.radius ?? 10.0);
  const topB = Math.max(0.5, node.topHalfB ?? topA);
  const flare = Math.max(0, node.filletFlareMm ?? Math.min(topA, topB) * 0.45);
  const baseA = Math.max(topA, node.baseHalfA ?? topA + flare);
  const baseB = Math.max(topB, node.baseHalfB ?? topB + flare);
  const baseExp = node.baseExponent ?? 2.6;
  const topExp = node.topExponent ?? 2.2;
  const axis = node.junctionAxis ?? 'y';

  const makePos = (s: number): [number, number, number] =>
    axis === 'x' ? [s, 0, 0] : axis === 'z' ? [0, 0, s] : [0, s, 0];

  // Concave quarter-arc fillet blend stations from -sinkD .. +height
  const stations: CurvedLoftStationSpec[] = [];
  if (sinkD > 0.05) {
    stations.push({ posMm: makePos(-sinkD), halfA: baseA, halfB: baseB, exponent: baseExp });
  }
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    // Concave quarter-ellipse blend: fast flare at base (u=0), tangent-vertical at top (u=1)
    const blend = 1 - Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
    const a = THREE.MathUtils.lerp(baseA, topA, blend);
    const b = THREE.MathUtils.lerp(baseB, topB, blend);
    const exp = THREE.MathUtils.lerp(baseExp, topExp, u);
    stations.push({ posMm: makePos(u * height), halfA: a, halfB: b, exponent: exp });
  }

  return buildCurvedLoftManifold(
    wasm,
    {
      ...node,
      op: 'curvedLoft',
      pathMode: 'polyline',
      curvedLoftStations: stations,
      upHint: axis === 'z' ? [0, 1, 0] : [0, 0, 1],
      splineSamples: Math.max(12, stations.length * 2),
    },
    density
  );
}

/**
 * SCULPTURAL ENGINE 7 — Parametric Tapered Slot / V-Notch / Keyway Cutter (`taperedSlotCutter`):
 * Watertight solid cutter centered on X in [-length/2, +length/2], Y in [0, depth] (top at Y=depth),
 * with independent start/end mouth widths, bottom width (0 = sharp V-bottom), and optional top chamfer.
 */
function buildTaperedSlotCutterManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec
): Manifold {
  const { Manifold: M, Mesh: ManifoldMesh } = wasm;
  const length = Math.max(1.0, node.slotLengthMm ?? node.width ?? 40.0);
  const depth = Math.max(1.0, node.depth ?? node.height ?? 16.0);
  const wStart = Math.max(0.4, node.slotWidthStartMm ?? 10.0);
  const wEnd = Math.max(0.2, node.slotWidthEndMm ?? wStart);
  const wBot = Math.max(0.15, Math.min(wStart, wEnd, node.slotBottomWidthMm ?? 0.3));
  const chamfer = Math.max(0, Math.min(depth * 0.45, node.slotTopChamferMm ?? 0));

  const x0 = -length * 0.5;
  const x1 = length * 0.5;

  // Build 2D cross-section rings at x0 and x1 in (Y, Z) plane (6-vertex chamfered U/V profile)
  const makeRing = (x: number, wTop: number): [number, number, number][] => {
    const hBot = wBot * 0.5;
    const hMid = wTop * 0.5;
    const hTop = hMid + chamfer;
    const yCham = depth - chamfer;
    if (chamfer > 0.05) {
      return [
        [x, 0, -hBot],
        [x, 0, hBot],
        [x, yCham, hMid],
        [x, depth, hTop],
        [x, depth, -hTop],
        [x, yCham, -hMid],
      ];
    }
    return [
      [x, 0, -hBot],
      [x, 0, hBot],
      [x, depth, hMid],
      [x, depth, -hMid],
    ];
  };

  const r0 = makeRing(x0, wStart);
  const r1 = makeRing(x1, wEnd);
  const kCount = r0.length;
  const verts: number[] = [];
  for (const p of r0) verts.push(p[0], p[1], p[2]);
  for (const p of r1) verts.push(p[0], p[1], p[2]);

  // Centroids for start/end caps
  const c0Idx = kCount * 2;
  const c1Idx = c0Idx + 1;
  verts.push(x0, depth * 0.5, 0);
  verts.push(x1, depth * 0.5, 0);

  const tris: number[] = [];
  for (let k = 0; k < kCount; k++) {
    const kn = (k + 1) % kCount;
    const a0 = k;
    const a1 = kn;
    const b0 = kCount + k;
    const b1 = kCount + kn;
    tris.push(a0, b1, a1);
    tris.push(a0, b0, b1);
    tris.push(c0Idx, a0, a1);
    tris.push(c1Idx, b1, b0);
  }

  const mMesh = new ManifoldMesh({
    numProp: 3,
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
  });
  mMesh.merge();
  let solid = M.ofMesh(mMesh);
  if (solid.status() !== 'NoError' || solid.isEmpty()) {
    solid.delete();
    for (let i = 0; i < tris.length; i += 3) {
      const tmp = tris[i + 1];
      tris[i + 1] = tris[i + 2];
      tris[i + 2] = tmp;
    }
    const flipped = new ManifoldMesh({
      numProp: 3,
      vertProperties: new Float32Array(verts),
      triVerts: new Uint32Array(tris),
    });
    flipped.merge();
    solid = M.ofMesh(flipped);
  }
  return solid;
}

/**
 * SCULPTURAL ENGINE 2 — Blended Filleted Boss (`blendedBoss`):
 * Revolved circular landing pedestal (y = -sinkDepthMm .. +height) with flared concave
 * fillet root for seamless, zero-air-gap mounting of domes, caps, and pucks on curved hosts.
 */
function buildBlendedBossManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const segs = densitySegments(node.radialSegments ?? 32, density);
  const capR = Math.max(2, node.radius ?? 22);
  const rimMargin = Math.max(0, node.rimMarginMm ?? 0.8);
  const topR = capR + rimMargin;
  const bossH = Math.max(0.8, node.height ?? 4.0);
  const sinkD = Math.max(1.0, Math.abs(node.sinkDepthMm ?? 14.0));
  const flare = Math.max(1.0, node.baseFlareMm ?? 12.0);
  const baseR = topR + flare;

  const r1 = baseR - (baseR - topR) * 0.08;
  const r2 = baseR - (baseR - topR) * 0.35;
  const r3 = baseR - (baseR - topR) * 0.66;
  const r4 = topR + (baseR - topR) * 0.08;

  const rawPts: [number, number][] = [
    [0, -sinkD],
    [baseR, -sinkD],
    [r1, -sinkD * 0.43],
    [r2, -sinkD * 0.11],
    [r3, bossH * 0.38],
    [r4, bossH * 0.85],
    [topR, bossH],
    [0, bossH],
  ];
  const poly = prepareRevolvePolygon(rawPts);
  const cs = new CS([poly as SimplePolygon]);
  try {
    const revZ = cs.revolve(segs, 360);
    const boss = revZ.rotate([-90, 0, 0]);
    revZ.delete();
    return boss;
  } finally {
    cs.delete();
  }
}

/**
 * SCULPTURAL ENGINE 3 — Blended Sensor Cowl / Shroud (`blendedCowl`):
 * Vertical flared collar with a razor-flat mating rim at local y = 0 and flared skirt
 * extending into the host (`+Y` for `cowlDirection: 'down'`, `-Y` for `cowlDirection: 'up'`),
 * with optional convex-hulled aerodynamic throat fillet back into `throatOffsetMm`.
 */
function buildBlendedCowlManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  const segs = densitySegments(node.radialSegments ?? 32, density);
  const rimR = Math.max(3, node.radius ?? 36);
  const cowlH = Math.max(4, node.height ?? 24);
  const flare = Math.max(1.2, node.baseFlareMm ?? 9.5);
  const isDown = (node.cowlDirection ?? 'down') === 'down';
  const ySign = isDown ? 1 : -1;

  // Profile runs from flat rim (y=0, r=rimR) into host (y=ySign*cowlH, r=rimR+flare)
  const rawPts: [number, number][] = isDown
    ? [
        [0, 0],
        [rimR, 0],
        [rimR + flare * 0.18, cowlH * 0.28],
        [rimR + flare * 0.58, cowlH * 0.65],
        [rimR + flare, cowlH],
        [0, cowlH],
      ]
    : [
        [0, -cowlH],
        [rimR + flare, -cowlH],
        [rimR + flare * 0.58, -cowlH * 0.65],
        [rimR + flare * 0.18, -cowlH * 0.28],
        [rimR, 0],
        [0, 0],
      ];

  const poly = prepareRevolvePolygon(rawPts);
  const cs = new CS([poly as SimplePolygon]);
  let cowl: Manifold;
  try {
    const revZ = cs.revolve(segs, 360);
    cowl = revZ.rotate([-90, 0, 0]);
    revZ.delete();
  } finally {
    cs.delete();
  }

  if (node.throatOffsetMm) {
    const [tx, ty, tz] = node.throatOffsetMm;
    const tw = Math.max(6, (node.throatHalfWidthMm ?? rimR * 0.85) * 2);
    const th = Math.max(6, (node.throatHalfHeightMm ?? cowlH * 0.6) * 2);
    const td = Math.max(6, (node.depth ?? rimR * 1.35));

    const collarCylRaw = M.cylinder(Math.max(4, cowlH * 0.35), rimR + flare * 0.45, rimR + flare * 0.45, segs, true);
    const collarCyl = collarCylRaw.rotate([-90, 0, 0]).translate([0, ySign * cowlH * 0.45, 0]);
    collarCylRaw.delete();

    const throatAnchorRaw = M.cube([tw, th, td], true);
    const throatAnchor = throatAnchorRaw.translate([tx, ty, tz]);
    throatAnchorRaw.delete();

    const throatHull = M.hull([collarCyl, throatAnchor]);
    collarCyl.delete();
    throatAnchor.delete();

    const joined = M.union([cowl, throatHull]);
    cowl.delete();
    throatHull.delete();

    // Trim strictly past local y = 0 so the flat sensor landing rim stays completely crisp
    const trimSize = Math.max(rimR * 4, Math.abs(tx) * 3 + tw * 2, cowlH * 4);
    const trimCube = M.cube([trimSize, trimSize, trimSize], true);
    const trimPlaced = trimCube.translate([0, -ySign * (trimSize * 0.5), 0]);
    trimCube.delete();
    cowl = joined.subtract(trimPlaced);
    joined.delete();
    trimPlaced.delete();
  }

  return cowl;
}

/**
 * SCULPTURAL ENGINE 4 — Bi-Curved Conformal Surface Patch (`conformalPatch`):
 * Watertight genus-0 thin curved shell (`width` × `height` × `thicknessMm`) that bends
 * cleanly along X (`curveRadiusUMm`) and Y (`curveRadiusVMm`) to hug convex curved flanks
 * without lifted corners.
 */
function buildConformalPatchManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, Mesh: ManifoldMesh } = wasm;
  const w = Math.max(2, node.width ?? 40);
  const h = Math.max(2, node.height ?? 16);
  const t = Math.max(0.6, node.thicknessMm ?? node.depth ?? 2.0);
  const rU = node.curveRadiusUMm ?? 0;
  const rV = node.curveRadiusVMm ?? 0;

  const baseSeg = density === 'ultra' ? 14 : density === 'high' ? 10 : 8;
  const nu = Math.abs(rU) > w * 0.55 ? baseSeg : 1;
  const nv = Math.abs(rV) > h * 0.55 ? Math.max(4, Math.round(baseSeg * 0.75)) : 1;

  const zSurface = (x: number, y: number): number => {
    let dz = 0;
    if (Math.abs(rU) > w * 0.55) {
      const ar = Math.abs(rU);
      const rad = Math.max(0, ar * ar - x * x);
      dz += Math.sign(rU) * (Math.sqrt(rad) - ar);
    }
    if (Math.abs(rV) > h * 0.55) {
      const ar = Math.abs(rV);
      const rad = Math.max(0, ar * ar - y * y);
      dz += Math.sign(rV) * (Math.sqrt(rad) - ar);
    }
    return dz;
  };

  const cols = nu + 1;
  const rows = nv + 1;
  const frontCount = cols * rows;
  const verts = new Float32Array(frontCount * 2 * 3);
  const halfT = t * 0.5;

  for (let j = 0; j < rows; j++) {
    const y = -h * 0.5 + (j / nv) * h;
    for (let i = 0; i < cols; i++) {
      const x = -w * 0.5 + (i / nu) * w;
      const z0 = zSurface(x, y);
      const fi = (j * cols + i) * 3;
      verts[fi] = x;
      verts[fi + 1] = y;
      verts[fi + 2] = z0 + halfT;

      const bi = (frontCount + j * cols + i) * 3;
      verts[bi] = x;
      verts[bi + 1] = y;
      verts[bi + 2] = z0 - halfT;
    }
  }

  const tris: number[] = [];
  const fIdx = (i: number, j: number) => j * cols + i;
  const bIdx = (i: number, j: number) => frontCount + j * cols + i;

  // Front (+Z) & Back (-Z) grids
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const f00 = fIdx(i, j);
      const f10 = fIdx(i + 1, j);
      const f11 = fIdx(i + 1, j + 1);
      const f01 = fIdx(i, j + 1);
      tris.push(f00, f10, f11, f00, f11, f01);

      const b00 = bIdx(i, j);
      const b10 = bIdx(i + 1, j);
      const b11 = bIdx(i + 1, j + 1);
      const b01 = bIdx(i, j + 1);
      tris.push(b00, b11, b10, b00, b01, b11);
    }
  }

  // Bottom (-Y, j=0) & Top (+Y, j=nv) perimeter skirts
  for (let i = 0; i < nu; i++) {
    tris.push(bIdx(i, 0), bIdx(i + 1, 0), fIdx(i + 1, 0));
    tris.push(bIdx(i, 0), fIdx(i + 1, 0), fIdx(i, 0));

    tris.push(fIdx(i, nv), fIdx(i + 1, nv), bIdx(i + 1, nv));
    tris.push(fIdx(i, nv), bIdx(i + 1, nv), bIdx(i, nv));
  }

  // Left (-X, i=0) & Right (+X, i=nu) perimeter skirts
  for (let j = 0; j < nv; j++) {
    tris.push(bIdx(0, j), fIdx(0, j), fIdx(0, j + 1));
    tris.push(bIdx(0, j), fIdx(0, j + 1), bIdx(0, j + 1));

    tris.push(fIdx(nu, j), bIdx(nu, j), bIdx(nu, j + 1));
    tris.push(fIdx(nu, j), bIdx(nu, j + 1), fIdx(nu, j + 1));
  }

  const mMesh = new ManifoldMesh({
    numProp: 3,
    vertProperties: verts,
    triVerts: new Uint32Array(tris),
  });
  mMesh.merge();
  const patch = M.ofMesh(mMesh);
  if (patch.status() === 'NoError' && !patch.isEmpty()) {
    return patch;
  }
  patch.delete();
  return M.cube([w, h, t], true);
}

/**
 * SCULPTURAL ENGINE 5 — True Watertight Hollow Shelling (`shellWall`):
 * Hollows any watertight child CSG solid (superellipseLoft, revolve, machinedBlock, union)
 * to uniform wall thickness `wallThickness` (mm), with optional `shellOpenFace` opening.
 * Reveals realistic engineering wall thickness under Section Cut inspection!
 */
function buildShellWallManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M } = wasm;
  const childSpec = node.children?.[0];
  if (!childSpec) {
    return M.cube([node.width ?? 80, node.height ?? 60, node.depth ?? 60], true);
  }

  const outer = evaluateCsgNode(wasm, childSpec, density);
  if (outer.isEmpty()) return outer;

  const bb = outer.boundingBox();
  const sxMm = bb.max[0] - bb.min[0];
  const syMm = bb.max[1] - bb.min[1];
  const szMm = bb.max[2] - bb.min[2];
  const minDim = Math.min(sxMm, syMm, szMm);

  const wall = Math.max(0.8, Math.min(minDim * 0.35, node.wallThickness ?? 3.0));
  if (minDim <= wall * 2.2) {
    return outer;
  }

  const cx = (bb.min[0] + bb.max[0]) * 0.5;
  const cy = (bb.min[1] + bb.max[1]) * 0.5;
  const cz = (bb.min[2] + bb.max[2]) * 0.5;

  const scaleX = Math.max(0.15, (sxMm - 2 * wall) / sxMm);
  const scaleY = Math.max(0.15, (syMm - 2 * wall) / syMm);
  const scaleZ = Math.max(0.15, (szMm - 2 * wall) / szMm);

  const openFace = node.shellOpenFace ?? 'none';
  let shiftX = 0;
  let shiftY = 0;
  let shiftZ = 0;
  if (openFace === '+x') shiftX = wall * 1.45;
  else if (openFace === '-x') shiftX = -wall * 1.45;
  else if (openFace === '+y') shiftY = wall * 1.45;
  else if (openFace === '-y') shiftY = -wall * 1.45;
  else if (openFace === '+z') shiftZ = wall * 1.45;
  else if (openFace === '-z') shiftZ = -wall * 1.45;

  const centered = outer.translate([-cx, -cy, -cz]);
  const shrunk = centered.scale([scaleX, scaleY, scaleZ]);
  centered.delete();
  const cavity = shrunk.translate([cx + shiftX, cy + shiftY, cz + shiftZ]);
  shrunk.delete();

  try {
    const shelled = outer.subtract(cavity);
    if (shelled.status() === 'NoError' && !shelled.isEmpty()) {
      outer.delete();
      return shelled;
    }
    shelled.delete();
    return outer;
  } finally {
    cavity.delete();
  }
}

/**
 * SCULPTURAL ENGINE 6 — Curved Clamshell Parting-Line Groove (`panelSeam`):
 * Carves a crisp uniform-depth parting seam groove (`seamWidthMm` × `seamDepthMm`)
 * cleanly around the full curved contour of any child CSG solid along `seamAxis` at `seamOffsetMm`.
 */
function buildPanelSeamManifold(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M } = wasm;
  const childSpec = node.children?.[0];
  if (!childSpec) {
    return M.cube([node.width ?? 80, node.height ?? 60, node.depth ?? 60], true);
  }

  const outer = evaluateCsgNode(wasm, childSpec, density);
  if (outer.isEmpty()) return outer;

  const bb = outer.boundingBox();
  const sxMm = bb.max[0] - bb.min[0];
  const syMm = bb.max[1] - bb.min[1];
  const szMm = bb.max[2] - bb.min[2];
  const cx = (bb.min[0] + bb.max[0]) * 0.5;
  const cy = (bb.min[1] + bb.max[1]) * 0.5;
  const cz = (bb.min[2] + bb.max[2]) * 0.5;

  const axis = node.seamAxis ?? 'y';
  const seamWidth = Math.max(0.6, Math.min(8.0, node.seamWidthMm ?? 1.4));
  const seamDepth = Math.max(0.5, Math.min(10.0, node.seamDepthMm ?? 1.6));

  const shrinkX = axis === 'x' ? 1.04 : Math.max(0.25, (sxMm - 2 * seamDepth) / Math.max(1, sxMm));
  const shrinkY = axis === 'y' ? 1.04 : Math.max(0.25, (syMm - 2 * seamDepth) / Math.max(1, syMm));
  const shrinkZ = axis === 'z' ? 1.04 : Math.max(0.25, (szMm - 2 * seamDepth) / Math.max(1, szMm));

  const centered = outer.translate([-cx, -cy, -cz]);
  const shrunk = centered.scale([shrinkX, shrinkY, shrinkZ]);
  centered.delete();
  const innerCore = shrunk.translate([cx, cy, cz]);
  shrunk.delete();

  const pad = 24;
  let slabRaw: Manifold;
  let slab: Manifold;
  if (axis === 'x') {
    const off = node.seamOffsetMm ?? cx;
    slabRaw = M.cube([seamWidth, syMm + pad, szMm + pad], true);
    slab = slabRaw.translate([off, cy, cz]);
  } else if (axis === 'z') {
    const off = node.seamOffsetMm ?? cz;
    slabRaw = M.cube([sxMm + pad, syMm + pad, seamWidth], true);
    slab = slabRaw.translate([cx, cy, off]);
  } else {
    const off = node.seamOffsetMm ?? cy;
    slabRaw = M.cube([sxMm + pad, seamWidth, szMm + pad], true);
    slab = slabRaw.translate([cx, off, cz]);
  }
  slabRaw.delete();

  const grooveBlade = slab.subtract(innerCore);
  slab.delete();
  innerCore.delete();

  try {
    const grooved = outer.subtract(grooveBlade);
    if (grooved.status() === 'NoError' && !grooved.isEmpty()) {
      outer.delete();
      return grooved;
    }
    grooved.delete();
    return outer;
  } finally {
    grooveBlade.delete();
  }
}

function evaluateCsgNode(
  wasm: ManifoldToplevel,
  node: CsgNodeSpec,
  density: TessellationDensity
): Manifold {
  const { Manifold: M, CrossSection: CS } = wasm;
  let result: Manifold;

  switch (node.op) {
    case 'box': {
      const w = Math.max(0.2, node.width ?? 100);
      const h = Math.max(0.2, node.height ?? 100);
      const d = Math.max(0.2, node.depth ?? 100);
      if (node.chamferMm && node.chamferMm > 0.2 && Math.min(w, h, d) > node.chamferMm * 2.5) {
        result = buildMachinedBlockManifold(wasm, { ...node, width: w, height: h, depth: d }, density);
      } else {
        result = M.cube([w, h, d], true);
      }
      break;
    }

    case 'cylinder': {
      const rTop = Math.max(0.2, node.radiusTop ?? node.radius ?? 40);
      const rBot = Math.max(0.2, node.radiusBottom ?? node.radius ?? 40);
      const h = Math.max(0.2, node.height ?? 100);
      const segs = densitySegments(node.radialSegments ?? 28, density);
      const cylZ = M.cylinder(h, rBot, rTop, segs, true);
      // Match Three.js Y-up CylinderGeometry axis
      result = cylZ.rotate([-90, 0, 0]);
      cylZ.delete();
      break;
    }

    case 'sphere': {
      const r = Math.max(0.2, node.radius ?? 50);
      const segs = densitySegments(node.radialSegments ?? 24, density);
      result = M.sphere(r, segs);
      break;
    }

    case 'polygonExtrude': {
      const depth = Math.max(0.2, node.depth ?? 40);
      const rawOuter = node.polygonPoints ? ensureCCW2D(node.polygonPoints) : [];
      const cleanOuter =
        rawOuter.length >= 3 && (node.splineSubdivisions ?? 1) > 1
          ? ensureCCW2D(
              resamplePolygonCatmullRom(
                rawOuter,
                node.splineSubdivisions!,
                node.sharpCornerAngleDeg ?? 68,
                node.splineTension ?? 0.5
              )
            )
          : rawOuter;
      if (cleanOuter.length < 3) {
        result = M.cube([100, 100, depth], true);
      } else {
        const outer = new CS([cleanOuter as SimplePolygon]);
        let shape = outer;
        if (Array.isArray(node.polygonHoles) && node.polygonHoles.length > 0) {
          const validPolys = node.polygonHoles
            .map((h) => ensureCCW2D(h))
            .filter((h) => h.length >= 3) as SimplePolygon[];
          if (validPolys.length === 1) {
            const holeCs = new CS([validPolys[0]]);
            const next = shape.subtract(holeCs);
            shape.delete();
            holeCs.delete();
            shape = next;
          } else if (validPolys.length > 1) {
            const holeList = validPolys.map((p) => new CS([p]));
            const mergedHoles = CS.union(holeList);
            holeList.forEach((hc) => hc.delete());
            const next = shape.subtract(mergedHoles);
            shape.delete();
            mergedHoles.delete();
            shape = next;
          }
        }
        try {
          if (node.bevelMm && node.bevelMm > 0.05) {
            result = buildBeveledPolygonExtrudeManifold(
              wasm,
              shape,
              depth,
              node.bevelMm,
              node.bevelSegments ?? 1
            );
          } else {
            result = shape.extrude(depth, 0, 0, [1, 1], true);
          }
        } finally {
          shape.delete();
        }
      }
      break;
    }

    case 'sculptedProfile': {
      // Watertight 3D sculpted solid: intersects an exact 2D (X, Y) side silhouette with a
      // smooth multi-station 3D Z-thickness envelope (handles, triggers, bezels, housings).
      const pts = node.polygonPoints;
      const stations = node.zStations || [];
      if (!pts || pts.length < 3) {
        result = M.cube([node.width ?? 60, node.height ?? 60, node.depth ?? 30], true);
        break;
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [px, py] of pts) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      const polySpanX = Math.max(2, maxX - minX);
      const polyMidX = (minX + maxX) * 0.5;
      const maxDepth = Math.max(
        node.depth ?? 20,
        ...stations.map((s) => Math.max(1, s.depthMm))
      );

      const rawPoly = ensureCCW2D(pts);
      const poly = (
        (node.splineSubdivisions ?? 1) > 1
          ? ensureCCW2D(
              resamplePolygonCatmullRom(
                rawPoly,
                node.splineSubdivisions!,
                node.sharpCornerAngleDeg ?? 68,
                node.splineTension ?? 0.5
              )
            )
          : rawPoly
      ) as SimplePolygon;
      let shape = new CS([poly]);
      if (Array.isArray(node.polygonHoles)) {
        for (const hole of node.polygonHoles) {
          if (hole.length >= 3) {
            const holeCs = new CS([ensureCCW2D(hole) as SimplePolygon]);
            const next = shape.subtract(holeCs);
            shape.delete();
            holeCs.delete();
            shape = next;
          }
        }
      }
      let sideSolid: Manifold;
      try {
        sideSolid = shape.extrude(maxDepth + 12, 0, 0, [1, 1], true);
      } finally {
        shape.delete();
      }

      if (stations.length === 0) {
        result = sideSolid;
        break;
      }

      const sorted = [...stations].sort((a, b) => a.yMm - b.yMm);
      const segs = densitySegments(node.radialSegments ?? 24, density);
      const envPieces: Manifold[] = [];

      const makeStationSolid = (st: (typeof sorted)[number], fallbackH: number): Manifold => {
        const sx = st.xCenterMm ?? polyMidX;
        const sw = Math.max(2, st.widthMm ?? polySpanX + 8);
        const sh = Math.max(2, st.heightMm ?? fallbackH);
        const sd = Math.max(0.4, st.depthMm);
        const baseBox = M.cube([sw, sh, sd], true);
        const placedBox = baseBox.translate([sx, st.yMm, 0]);
        baseBox.delete();
        if (!st.rounded) return placedBox;
        const cylRaw = M.cylinder(sh, sd * 0.5, sd * 0.5, segs, true);
        const cylY = cylRaw.rotate([-90, 0, 0]);
        cylRaw.delete();
        const placedCyl = cylY.translate([sx, st.yMm, 0]);
        cylY.delete();
        const combined = M.union([placedBox, placedCyl]);
        placedBox.delete();
        placedCyl.delete();
        return combined;
      };

      if (sorted.length === 1) {
        const s0 = makeStationSolid(sorted[0], Math.max(4, maxY - minY + 8));
        envPieces.push(s0);
      } else {
        for (let i = 0; i < sorted.length - 1; i++) {
          const a = sorted[i];
          const b = sorted[i + 1];
          const gap = Math.max(4, Math.abs(b.yMm - a.yMm) * 0.35);
          const sa = makeStationSolid(a, gap);
          const sb = makeStationSolid(b, gap);
          const pairHull = M.hull([sa, sb]);
          sa.delete();
          sb.delete();
          envPieces.push(pairHull);
        }
      }

      const zEnvelope = envPieces.length === 1 ? envPieces[0] : M.union(envPieces);
      if (envPieces.length > 1) envPieces.forEach((p) => p.delete());
      try {
        result = sideSolid.intersect(zEnvelope);
      } finally {
        sideSolid.delete();
        zEnvelope.delete();
      }
      break;
    }

    case 'revolve': {
      const pts = node.lathePoints;
      const segs = densitySegments(node.radialSegments ?? 28, density);
      const poly = pts && pts.length >= 2 ? prepareRevolvePolygon(pts) : [];
      if (poly.length < 3) {
        const fallback = M.cylinder(100, 40, 40, segs, true);
        result = fallback.rotate([-90, 0, 0]);
        fallback.delete();
      } else {
        const cs = new CS([poly as SimplePolygon]);
        try {
          const revZ = cs.revolve(segs, node.arcDeg ?? 360);
          result = revZ.rotate([-90, 0, 0]);
          revZ.delete();
        } finally {
          cs.delete();
        }
      }
      break;
    }

    case 'superellipseLoft': {
      result = buildSuperellipseLoftManifold(wasm, node, density);
      break;
    }

    case 'curvedLoft': {
      result = buildCurvedLoftManifold(wasm, node, density);
      break;
    }

    case 'blendedBoss': {
      result = buildBlendedBossManifold(wasm, node, density);
      break;
    }

    case 'blendedCowl': {
      result = buildBlendedCowlManifold(wasm, node, density);
      break;
    }

    case 'conformalPatch': {
      result = buildConformalPatchManifold(wasm, node, density);
      break;
    }

    case 'sweep': {
      result = buildGeneralSweepManifold(wasm, node, density);
      break;
    }

    case 'slottedChannel': {
      result = buildSlottedChannelManifold(wasm, node, density);
      break;
    }

    case 'boltedFlange': {
      result = buildBoltedFlangeManifold(wasm, node, density);
      break;
    }

    case 'machinedBlock': {
      result = buildMachinedBlockManifold(wasm, node, density);
      break;
    }

    case 'sheetMetal': {
      result = buildSheetMetalManifold(wasm, node, density);
      break;
    }

    case 'sheetMetalFold': {
      result = buildSheetMetalFoldManifold(wasm, node, density);
      break;
    }

    case 'turnedShaft': {
      result = buildTurnedShaftManifold(wasm, node, density);
      break;
    }

    case 'involuteGear': {
      result = buildInvoluteGearManifold(wasm, node, density);
      break;
    }

    case 'structuralBeam': {
      result = buildStructuralBeamManifold(wasm, node, density);
      break;
    }

    case 'ballBearing': {
      result = buildBallBearingManifold(wasm, node, density);
      break;
    }

    case 'union': {
      const children = (node.children || []).map((c) => evaluateCsgNode(wasm, c, density));
      if (children.length === 0) {
        result = M.cube([10, 10, 10], true);
      } else if (children.length === 1) {
        result = children[0];
      } else {
        result = M.union(children);
        children.forEach((c) => c.delete());
      }
      break;
    }

    case 'subtract': {
      const children = (node.children || []).map((c) => evaluateCsgNode(wasm, c, density));
      if (children.length === 0) {
        result = M.cube([10, 10, 10], true);
      } else if (children.length === 1) {
        result = children[0];
      } else {
        const [base, ...cutters] = children;
        const cutterUnion = cutters.length === 1 ? cutters[0] : M.union(cutters);
        if (cutters.length > 1) cutters.forEach((c) => c.delete());
        try {
          result = base.subtract(cutterUnion);
        } finally {
          base.delete();
          cutterUnion.delete();
        }
      }
      break;
    }

    case 'intersect': {
      const children = (node.children || []).map((c) => evaluateCsgNode(wasm, c, density));
      if (children.length === 0) {
        result = M.cube([10, 10, 10], true);
      } else if (children.length === 1) {
        result = children[0];
      } else {
        result = M.intersection(children);
        children.forEach((c) => c.delete());
      }
      break;
    }

    case 'smoothUnion':
    case 'smoothSubtract':
    case 'smoothIntersect': {
      const children = (node.children || []).map((c) => evaluateCsgNode(wasm, c, density));
      if (children.length === 0) {
        result = M.cube([10, 10, 10], true);
      } else if (children.length === 1) {
        result = children[0];
      } else {
        try {
          result = buildSmoothBooleanManifold(wasm, node.op, children, {
            filletRadiusMm: node.filletRadiusMm,
            voxelSizeMm: node.voxelSizeMm,
            toleranceMm: node.levelSetToleranceMm,
            density,
          });
        } finally {
          children.forEach((c) => c.delete());
        }
      }
      break;
    }

    case 'hull': {
      const children = (node.children || []).map((c) => evaluateCsgNode(wasm, c, density));
      if (children.length === 0) {
        result = M.cube([10, 10, 10], true);
      } else {
        result = M.hull(children);
        children.forEach((c) => c.delete());
      }
      break;
    }

    case 'shellWall': {
      result = buildShellWallManifold(wasm, node, density);
      break;
    }

    case 'panelSeam': {
      result = buildPanelSeamManifold(wasm, node, density);
      break;
    }

    case 'filletedJunction': {
      result = buildFilletedJunctionManifold(wasm, node, density);
      break;
    }

    case 'taperedSlotCutter': {
      result = buildTaperedSlotCutterManifold(wasm, node);
      break;
    }

    default: {
      result = M.cube([60, 60, 60], true);
      break;
    }
  }

  return applyNodeTransform(result, node);
}

function manifoldToBufferGeometry(
  manifold: Manifold,
  smoothSharpAngleDeg = 42
): THREE.BufferGeometry {
  const withNormals = manifold.calculateNormals(0, smoothSharpAngleDeg);
  try {
    const mesh = withNormals.getMesh();
    const numProp = mesh.numProp;
    const vertCount = Math.floor(mesh.vertProperties.length / numProp);

    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const hasNormals = numProp >= 6;

    for (let i = 0; i < vertCount; i++) {
      const base = i * numProp;
      positions[i * 3] = mesh.vertProperties[base] * MM_TO_SCENE;
      positions[i * 3 + 1] = mesh.vertProperties[base + 1] * MM_TO_SCENE;
      positions[i * 3 + 2] = mesh.vertProperties[base + 2] * MM_TO_SCENE;
      if (hasNormals) {
        normals[i * 3] = mesh.vertProperties[base + 3];
        normals[i * 3 + 1] = mesh.vertProperties[base + 4];
        normals[i * 3 + 2] = mesh.vertProperties[base + 5];
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (hasNormals) {
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    }
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));

    if (!hasNormals) {
      geo.computeVertexNormals();
    }

    // Generate clean triplanar UVs for PBR procedural textures
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    if (box) {
      const size = new THREE.Vector3();
      box.getSize(size);
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const uvs = new Float32Array(posAttr.count * 2);
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const nx = normAttr ? Math.abs(normAttr.getX(i)) : 0;
        const ny = normAttr ? Math.abs(normAttr.getY(i)) : 0;
        const nz = normAttr ? Math.abs(normAttr.getZ(i)) : 1;
        let u = 0;
        let v = 0;
        if (nz >= nx && nz >= ny) {
          u = size.x > 1e-5 ? (x - box.min.x) / size.x : 0.5;
          v = size.y > 1e-5 ? (y - box.min.y) / size.y : 0.5;
        } else if (nx >= ny && nx >= nz) {
          u = size.z > 1e-5 ? (z - box.min.z) / size.z : 0.5;
          v = size.y > 1e-5 ? (y - box.min.y) / size.y : 0.5;
        } else {
          u = size.x > 1e-5 ? (x - box.min.x) / size.x : 0.5;
          v = size.z > 1e-5 ? (z - box.min.z) / size.z : 0.5;
        }
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }

    return geo;
  } finally {
    withNormals.delete();
  }
}

/**
 * Evaluates a recursive CsgNodeSpec tree via manifold-3d WASM and returns a watertight
 * Three.js BufferGeometry in meters (MM_TO_SCENE). Falls back gracefully if WASM is warming up.
 */
export function buildCsgSolidGeometry(
  csgRoot: CsgNodeSpec | undefined,
  density: TessellationDensity,
  smoothSharpAngleDeg = 42
): { geometry: THREE.BufferGeometry; isWatertightManifold: boolean } {
  if (!csgRoot || !manifoldInstance) {
    // Graceful synchronous fallback while WASM finishes initializing
    const w = ((csgRoot?.width ?? csgRoot?.children?.[0]?.width ?? 100) * MM_TO_SCENE);
    const h = ((csgRoot?.height ?? csgRoot?.children?.[0]?.height ?? 100) * MM_TO_SCENE);
    const d = ((csgRoot?.depth ?? csgRoot?.children?.[0]?.depth ?? 100) * MM_TO_SCENE);
    const fallback =
      csgRoot?.op === 'boltedFlange'
        ? new THREE.CylinderGeometry(
            (csgRoot.radius ?? 90) * MM_TO_SCENE,
            (csgRoot.radius ?? 90) * MM_TO_SCENE,
            (csgRoot.height ?? 22) * MM_TO_SCENE,
            28
          )
        : new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d));
    fallback.computeVertexNormals();
    return { geometry: fallback, isWatertightManifold: false };
  }

  let solid: Manifold;
  try {
    solid = evaluateCsgNode(manifoldInstance, csgRoot, density);
  } catch (err) {
    console.warn('[ManifoldKernel] CSG evaluation threw, using fallback box:', csgRoot.op, err);
    const w = (csgRoot.width ?? csgRoot.children?.[0]?.width ?? 100) * MM_TO_SCENE;
    const h = (csgRoot.height ?? csgRoot.children?.[0]?.height ?? 100) * MM_TO_SCENE;
    const d = (csgRoot.depth ?? csgRoot.children?.[0]?.depth ?? 100) * MM_TO_SCENE;
    const fallback = new THREE.BoxGeometry(Math.max(0.002, w), Math.max(0.002, h), Math.max(0.002, d));
    fallback.computeVertexNormals();
    return { geometry: fallback, isWatertightManifold: false };
  }
  try {
    const status = solid.status();
    if (status !== 'NoError' || solid.isEmpty() || solid.numTri() === 0 || solid.numVert() === 0) {
      console.warn('[ManifoldKernel] CSG node produced empty/invalid solid, using fallback box:', csgRoot.op, status);
      const w = (csgRoot.width ?? csgRoot.children?.[0]?.width ?? 100) * MM_TO_SCENE;
      const h = (csgRoot.height ?? csgRoot.children?.[0]?.height ?? 100) * MM_TO_SCENE;
      const d = (csgRoot.depth ?? csgRoot.children?.[0]?.depth ?? 100) * MM_TO_SCENE;
      const fallback = new THREE.BoxGeometry(Math.max(0.002, w), Math.max(0.002, h), Math.max(0.002, d));
      fallback.computeVertexNormals();
      return { geometry: fallback, isWatertightManifold: false };
    }
    const geo = manifoldToBufferGeometry(solid, smoothSharpAngleDeg);
    return {
      geometry: geo,
      isWatertightManifold: status === 'NoError' && !solid.isEmpty(),
    };
  } finally {
    solid.delete();
  }
}

/**
 * Converts a Three.js world matrix (meters) into a Manifold Mat4 (millimeters).
 */
function threeMatrixWorldToManifoldMat4Mm(matrixWorld: THREE.Matrix4): Mat4 {
  const e = matrixWorld.elements;
  return [
    e[0],
    e[1],
    e[2],
    e[3],
    e[4],
    e[5],
    e[6],
    e[7],
    e[8],
    e[9],
    e[10],
    e[11],
    e[12] * 1000,
    e[13] * 1000,
    e[14] * 1000,
    e[15],
  ];
}

/**
 * Builds an exact world-space Manifold solid (in millimeters) for a BlueprintPart + its
 * world transform matrix so the geometry auditor can run exact C++ Boolean volume clash checks.
 * Caller MUST call `.delete()` on the returned Manifold when done.
 */
export function buildPartWorldManifold(
  part: BlueprintPart,
  matrixWorld: THREE.Matrix4,
  density: TessellationDensity = 'standard'
): Manifold | null {
  if (!manifoldInstance) return null;
  const wasm = manifoldInstance;
  const { Manifold: M } = wasm;
  const g = part.geometry;

  let localSolid: Manifold | null = null;
  try {
    switch (g.kind) {
      case 'csgSolid':
        if (g.csgRoot) {
          localSolid = evaluateCsgNode(wasm, g.csgRoot, density);
        }
        break;
      case 'box':
      case 'roundedBox':
        localSolid = M.cube(
          [Math.max(0.2, g.width ?? 100), Math.max(0.2, g.height ?? 100), Math.max(0.2, g.depth ?? 100)],
          true
        );
        break;
      case 'cylinder': {
        const rTop = Math.max(0.2, g.radiusTop ?? g.radius ?? 40);
        const rBot = Math.max(0.2, g.radiusBottom ?? g.radius ?? 40);
        const h = Math.max(0.2, g.height ?? 100);
        const cylZ = M.cylinder(h, rBot, rTop, 20, true);
        localSolid = cylZ.rotate([-90, 0, 0]);
        cylZ.delete();
        break;
      }
      case 'sphere':
        localSolid = M.sphere(Math.max(0.2, g.radius ?? 50), 18);
        break;
      case 'torus': {
        const majorR = Math.max(2, g.radius ?? 100);
        const tubeR = Math.max(0.5, g.tubeRadius ?? 14);
        const pts: [number, number][] = [];
        const segs = 12;
        for (let i = 0; i < segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          pts.push([majorR + Math.cos(a) * tubeR, Math.sin(a) * tubeR]);
        }
        const cs = new wasm.CrossSection([ensureCCW2D(pts) as SimplePolygon]);
        try {
          localSolid = cs.revolve(20, 360);
        } finally {
          cs.delete();
        }
        break;
      }
      default:
        return null;
    }

    if (!localSolid || localSolid.status() !== 'NoError' || localSolid.isEmpty()) {
      localSolid?.delete();
      return null;
    }

    const worldSolid = localSolid.transform(threeMatrixWorldToManifoldMat4Mm(matrixWorld));
    localSolid.delete();
    if (worldSolid.status() !== 'NoError' || worldSolid.isEmpty()) {
      worldSolid.delete();
      return null;
    }
    return worldSolid;
  } catch {
    localSolid?.delete();
    return null;
  }
}

/**
 * Computes the EXACT 3D solid intersection volume (cm³), minimum penetration thickness (mm),
 * per-axis overlap extents (mm), and overlap centroid (mm) between two world-space Manifold solids.
 */
export function computeExactManifoldOverlap(
  solidA: Manifold,
  solidB: Manifold
): {
  volumeCm3: number;
  minPenMm: number;
  centerMm: [number, number, number];
  overlapExtentMm: [number, number, number];
} {
  const inter = solidA.intersect(solidB);
  try {
    if (inter.status() !== 'NoError' || inter.isEmpty()) {
      return { volumeCm3: 0, minPenMm: 0, centerMm: [0, 0, 0], overlapExtentMm: [0, 0, 0] };
    }
    const volMm3 = inter.volume();
    if (!Number.isFinite(volMm3) || volMm3 <= 0.1) {
      return { volumeCm3: 0, minPenMm: 0, centerMm: [0, 0, 0], overlapExtentMm: [0, 0, 0] };
    }
    const bbox = inter.boundingBox();
    const dx = Math.max(0, bbox.max[0] - bbox.min[0]);
    const dy = Math.max(0, bbox.max[1] - bbox.min[1]);
    const dz = Math.max(0, bbox.max[2] - bbox.min[2]);
    return {
      volumeCm3: volMm3 / 1000,
      minPenMm: Math.min(dx, dy, dz),
      centerMm: [
        (bbox.min[0] + bbox.max[0]) * 0.5,
        (bbox.min[1] + bbox.max[1]) * 0.5,
        (bbox.min[2] + bbox.max[2]) * 0.5,
      ],
      overlapExtentMm: [dx, dy, dz],
    };
  } finally {
    inter.delete();
  }
}
