import * as THREE from 'three';
import {
  BlueprintPart,
  CsgNodeSpec,
  UnblendedMountIssue,
} from '../types/blueprint';

const SCENE_TO_MM = 1000;
const RAD_TO_DEG = 180 / Math.PI;

// ============================================================================
// 1. RIGHT-HANDED SURFACE SLOPE & LOFT TANGENT CALCULATORS
//    Eliminates manual sign-flip errors (e.g. -9° vs +8.5° on curved brows).
// ============================================================================

/**
 * Computes exact right-handed Z rotation (degrees) for a surface profile rising/falling
 * in the XY plane from pStart [x1, y1] to pEnd [x2, y2].
 *
 * Right-hand rule (+X right, +Y up, +Z out of screen):
 *   - Rotating local +Y by +theta around +Z maps (0,1,0) -> (-sin(theta), cos(theta), 0)
 *     and local +X (1,0,0) -> (cos(theta), sin(theta), 0), matching a surface with dy/dx > 0.
 *   - Therefore a top surface rising toward +X ALWAYS has POSITIVE rotateDeg[2] = +atan2(dy, dx).
 */
export function computeSlopeTangentAngleDeg(
  pStartXY: [number, number],
  pEndXY: [number, number]
): number {
  const dx = pEndXY[0] - pStartXY[0];
  const dy = pEndXY[1] - pStartXY[1];
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 0;
  // Normalize direction so dx >= 0 for top-surface tangent convention
  const ndx = dx < 0 ? -dx : dx;
  const ndy = dx < 0 ? -dy : dy;
  return Number((Math.atan2(ndy, ndx) * RAD_TO_DEG).toFixed(2));
}

/**
 * Computes exact right-handed X rotation (degrees) for a surface profile in the YZ plane
 * from pStart [z1, y1] to pEnd [z2, y2].
 *
 * Right-hand rule: rotating local +Z by +rx around +X maps (0,0,1) -> (0, -sin(rx), cos(rx)),
 * so a top surface rising toward +Z (dy/dz > 0) requires NEGATIVE rotateDeg[0] = -atan2(dy, dz).
 */
export function computeSlopeRotationXDeg(
  pStartZY: [number, number],
  pEndZY: [number, number]
): number {
  const dz = pEndZY[0] - pStartZY[0];
  const dy = pEndZY[1] - pStartZY[1];
  if (Math.abs(dz) < 1e-6 && Math.abs(dy) < 1e-6) return 0;
  const ndz = dz < 0 ? -dz : dz;
  const ndy = dz < 0 ? -dy : dy;
  return Number((-Math.atan2(ndy, ndz) * RAD_TO_DEG).toFixed(2));
}

export interface LoftProfileStation {
  x: number;
  yCenter: number;
  halfY: number;
}

/**
 * Evaluates exact top or bottom surface height and tangent Z-rotation along an X-axis loft.
 */
export function computeLoftSurfaceDatumAtX(
  stations: LoftProfileStation[],
  targetX: number,
  side: 'top' | 'bottom' = 'top'
): { surfaceYMm: number; tiltZDeg: number } {
  if (stations.length === 0) return { surfaceYMm: 0, tiltZDeg: 0 };
  const sorted = [...stations].sort((a, b) => a.x - b.x);
  const yOf = (s: LoftProfileStation) => (side === 'top' ? s.yCenter + s.halfY : s.yCenter - s.halfY);

  if (sorted.length === 1) {
    return { surfaceYMm: Number(yOf(sorted[0]).toFixed(2)), tiltZDeg: 0 };
  }

  let idx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (targetX >= sorted[i].x && targetX <= sorted[i + 1].x) {
      idx = i;
      break;
    }
    if (targetX > sorted[i + 1].x) {
      idx = i;
    }
  }

  const a = sorted[idx];
  const b = sorted[Math.min(sorted.length - 1, idx + 1)];
  const ya = yOf(a);
  const yb = yOf(b);
  const span = Math.max(1e-6, b.x - a.x);
  const t = Math.max(0, Math.min(1, (targetX - a.x) / span));
  const surfaceYMm = Number((ya + (yb - ya) * t).toFixed(2));
  const tiltZDeg = computeSlopeTangentAngleDeg([a.x, ya], [b.x, yb]);
  return { surfaceYMm, tiltZDeg };
}

// ============================================================================
// 2. REUSABLE BLENDED BOSS & COWL CSG PRIMITIVE BUILDERS
//    Guarantees concentric filleted host landings + hairline parting seams.
// ============================================================================

export interface BlendedCircularBossSpec {
  /** World datum [x, y, z] on the host curved surface where the boss emerges */
  centerMm: [number, number, number];
  /** Right-handed Euler rotation [rx, ry, rz] aligned with host surface normal */
  rotationDeg: [number, number, number];
  /** Outer radius of the mounted circular cap/puck/dome in mm */
  capRadiusMm: number;
  /** Height of the flat boss landing above the datum point along local +Y (default 4.0 mm) */
  bossHeightMm?: number;
  /** How far the flared boss base sinks into the host shell for a watertight union (default 14.0 mm) */
  sinkDepthMm?: number;
  /** Extra radial flare at the sunk base for a smooth fillet transition (default 12.8 mm) */
  baseFlareMm?: number;
  /** Radial ledge margin beyond capRadiusMm at the boss top landing (default 0.8 mm) */
  rimMarginMm?: number;
  /** Clean hairline parting seam between boss landing and mounted cap (default 0.5 mm) */
  seamGapMm?: number;
  /** Height of the mounted cap rim before crown taper (default 1.5 mm) */
  capSideHeightMm?: number;
  /** Total height of the mounted cap above its base (default 5.0 mm) */
  capTotalHeightMm?: number;
  /** Cutter clearance height above the boss landing to trim protruding curved loft (default 14.0 mm) */
  landingCutHeightMm?: number;
  radialSegments?: number;
}

export interface BlendedCircularBossPair {
  /** Union this node into the host CSG shell */
  hostBossUnion: CsgNodeSpec;
  /** Subtract this node from the host CSG shell so the landing plane is razor-flat */
  hostLandingCut: CsgNodeSpec;
  /** Exact concentric position for the mounted cap part */
  capPositionMm: [number, number, number];
  /** Exact matched rotation for the mounted cap part */
  capRotationDeg: [number, number, number];
  /** Watertight crowned circular cap CSG matching the boss with hairline parting seam */
  capCsgRoot: CsgNodeSpec;
  /** Local Y of the boss landing plane and cap base */
  bossLandingLocalYMm: number;
  capBaseLocalYMm: number;
}

/**
 * Generates a mathematically matched (host pedestal + flat landing cutter + concentric cap)
 * CSG assembly pair for mounting GPS pucks, IMU domes, caps, bezels, or flush buttons on
 * curved/sloped host shells with zero air-gap and zero rim-skew.
 */
export function buildBlendedCircularBossPair(
  spec: BlendedCircularBossSpec
): BlendedCircularBossPair {
  const segs = spec.radialSegments ?? 32;
  const bossH = spec.bossHeightMm ?? 4.0;
  const sinkD = Math.abs(spec.sinkDepthMm ?? 14.0);
  const rimMargin = spec.rimMarginMm ?? 0.8;
  const topR = Number((spec.capRadiusMm + rimMargin).toFixed(2));
  const baseR = Number((topR + (spec.baseFlareMm ?? 12.8)).toFixed(2));
  const seam = spec.seamGapMm ?? 0.5;
  const sideH = spec.capSideHeightMm ?? 1.5;
  const totalCapH = Math.max(sideH + 1.0, spec.capTotalHeightMm ?? 5.0);
  const cutH = spec.landingCutHeightMm ?? 14.0;

  const r1 = Number((baseR - (baseR - topR) * 0.08).toFixed(2));
  const r2 = Number((baseR - (baseR - topR) * 0.35).toFixed(2));
  const r3 = Number((baseR - (baseR - topR) * 0.66).toFixed(2));
  const r4 = Number((topR + (baseR - topR) * 0.08).toFixed(2));

  const hostBossUnion: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: segs,
    lathePoints: [
      [0, -sinkD],
      [baseR, -sinkD],
      [r1, Number((-sinkD * 0.43).toFixed(2))],
      [r2, Number((-sinkD * 0.11).toFixed(2))],
      [r3, Number((bossH * 0.38).toFixed(2))],
      [r4, Number((bossH * 0.85).toFixed(2))],
      [topR, bossH],
      [0, bossH],
    ],
    rotateDeg: [...spec.rotationDeg],
    translateMm: [...spec.centerMm],
  };

  const cutR = Number((topR + 4.8).toFixed(2));
  const hostLandingCut: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: segs,
    lathePoints: [
      [0, bossH],
      [cutR, bossH],
      [cutR, Number((bossH + cutH).toFixed(2))],
      [0, Number((bossH + cutH).toFixed(2))],
    ],
    rotateDeg: [...spec.rotationDeg],
    translateMm: [...spec.centerMm],
  };

  const capBaseY = Number((bossH + seam).toFixed(2));
  const capShoulderY = Number((capBaseY + sideH).toFixed(2));
  const capMidCrownY = Number((capBaseY + sideH + (totalCapH - sideH) * 0.52).toFixed(2));
  const capHighCrownY = Number((capBaseY + sideH + (totalCapH - sideH) * 0.86).toFixed(2));
  const capPeakY = Number((capBaseY + totalCapH).toFixed(2));

  const capCsgRoot: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: segs,
    lathePoints: [
      [0, capBaseY],
      [spec.capRadiusMm, capBaseY],
      [spec.capRadiusMm, capShoulderY],
      [Number((spec.capRadiusMm * 0.91).toFixed(2)), capMidCrownY],
      [Number((spec.capRadiusMm * 0.67).toFixed(2)), capHighCrownY],
      [0, capPeakY],
    ],
  };

  return {
    hostBossUnion,
    hostLandingCut,
    capPositionMm: [...spec.centerMm],
    capRotationDeg: [...spec.rotationDeg],
    capCsgRoot,
    bossLandingLocalYMm: bossH,
    capBaseLocalYMm: capBaseY,
  };
}

// ============================================================================
// 3. EXACT TRIANGLE-SURFACE PROXIMITY & RIM-SKEW METROLOGY
//    Defeats the AABB Contact Illusion on curved/lofted host shells.
// ============================================================================

export interface WorldMeshTriangles {
  /** Flat array of 9 floats per triangle (ax,ay,az, bx,by,bz, cx,cy,cz) in millimeters */
  coordsMm: Float32Array;
  /** Flat array of 6 floats per triangle (minX,minY,minZ, maxX,maxY,maxZ) in millimeters */
  triBoundsMm: Float32Array;
  triCount: number;
  meshMinMm: [number, number, number];
  meshMaxMm: [number, number, number];
}

export function extractWorldTrianglesMm(mesh: THREE.Mesh): WorldMeshTriangles | null {
  const posAttr = mesh.geometry.attributes.position;
  if (!posAttr || posAttr.count < 3) return null;
  const index = mesh.geometry.index;
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);
  if (triCount <= 0) return null;

  const coordsMm = new Float32Array(triCount * 9);
  const triBoundsMm = new Float32Array(triCount * 6);
  const m = mesh.matrixWorld;
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  let gMinX = Infinity;
  let gMinY = Infinity;
  let gMinZ = Infinity;
  let gMaxX = -Infinity;
  let gMaxY = -Infinity;
  let gMaxZ = -Infinity;

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    vA.fromBufferAttribute(posAttr, i0).applyMatrix4(m).multiplyScalar(SCENE_TO_MM);
    vB.fromBufferAttribute(posAttr, i1).applyMatrix4(m).multiplyScalar(SCENE_TO_MM);
    vC.fromBufferAttribute(posAttr, i2).applyMatrix4(m).multiplyScalar(SCENE_TO_MM);

    const o = t * 9;
    coordsMm[o] = vA.x;
    coordsMm[o + 1] = vA.y;
    coordsMm[o + 2] = vA.z;
    coordsMm[o + 3] = vB.x;
    coordsMm[o + 4] = vB.y;
    coordsMm[o + 5] = vB.z;
    coordsMm[o + 6] = vC.x;
    coordsMm[o + 7] = vC.y;
    coordsMm[o + 8] = vC.z;

    const minX = Math.min(vA.x, vB.x, vC.x);
    const minY = Math.min(vA.y, vB.y, vC.y);
    const minZ = Math.min(vA.z, vB.z, vC.z);
    const maxX = Math.max(vA.x, vB.x, vC.x);
    const maxY = Math.max(vA.y, vB.y, vC.y);
    const maxZ = Math.max(vA.z, vB.z, vC.z);

    const b = t * 6;
    triBoundsMm[b] = minX;
    triBoundsMm[b + 1] = minY;
    triBoundsMm[b + 2] = minZ;
    triBoundsMm[b + 3] = maxX;
    triBoundsMm[b + 4] = maxY;
    triBoundsMm[b + 5] = maxZ;

    if (minX < gMinX) gMinX = minX;
    if (minY < gMinY) gMinY = minY;
    if (minZ < gMinZ) gMinZ = minZ;
    if (maxX > gMaxX) gMaxX = maxX;
    if (maxY > gMaxY) gMaxY = maxY;
    if (maxZ > gMaxZ) gMaxZ = maxZ;
  }

  return {
    coordsMm,
    triBoundsMm,
    triCount,
    meshMinMm: [gMinX, gMinY, gMinZ],
    meshMaxMm: [gMaxX, gMaxY, gMaxZ],
  };
}

/**
 * Exact Voronoi-region closest point on 3D triangle (Christer Ericson, Real-Time Collision Detection).
 * Returns squared Euclidean distance in mm² and writes closest point to `out`.
 */
function closestPointOnTriangleSq(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  out: [number, number, number]
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    out[0] = ax;
    out[1] = ay;
    out[2] = az;
    return apx * apx + apy * apy + apz * apz;
  }

  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    out[0] = bx;
    out[1] = by;
    out[2] = bz;
    return bpx * bpx + bpy * bpy + bpz * bpz;
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = ax + v * abx;
    const qy = ay + v * aby;
    const qz = az + v * abz;
    out[0] = qx;
    out[1] = qy;
    out[2] = qz;
    const dx = px - qx;
    const dy = py - qy;
    const dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    out[0] = cx;
    out[1] = cy;
    out[2] = cz;
    return cpx * cpx + cpy * cpy + cpz * cpz;
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = ax + w * acx;
    const qy = ay + w * acy;
    const qz = az + w * acz;
    out[0] = qx;
    out[1] = qy;
    out[2] = qz;
    const dx = px - qx;
    const dy = py - qy;
    const dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const qx = bx + w * (cx - bx);
    const qy = by + w * (cy - by);
    const qz = bz + w * (cz - bz);
    out[0] = qx;
    out[1] = qy;
    out[2] = qz;
    const dx = px - qx;
    const dy = py - qy;
    const dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const qx = ax + abx * v + acx * w;
  const qy = ay + aby * v + acy * w;
  const qz = az + abz * v + acz * w;
  out[0] = qx;
  out[1] = qy;
  out[2] = qz;
  const dx = px - qx;
  const dy = py - qy;
  const dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

export interface PointToMeshHit {
  distanceMm: number;
  closestPointMm: [number, number, number];
  triangleNormal: [number, number, number];
}

export function queryPointToMeshDistanceMm(
  pointMm: [number, number, number],
  meshTris: WorldMeshTriangles,
  maxSearchMm = Infinity
): PointToMeshHit {
  const px = pointMm[0];
  const py = pointMm[1];
  const pz = pointMm[2];
  let bestDistSq = maxSearchMm * maxSearchMm;
  let bestDist = maxSearchMm;
  let bestTri = -1;
  const bestClosest: [number, number, number] = [px, py, pz];
  const tmpClosest: [number, number, number] = [0, 0, 0];

  const coords = meshTris.coordsMm;
  const bounds = meshTris.triBoundsMm;
  const triCount = meshTris.triCount;

  for (let t = 0; t < triCount; t++) {
    const b = t * 6;
    // Fast triangle AABB distance rejection
    let dx = 0;
    if (px < bounds[b]) dx = bounds[b] - px;
    else if (px > bounds[b + 3]) dx = px - bounds[b + 3];
    if (dx > bestDist) continue;

    let dy = 0;
    if (py < bounds[b + 1]) dy = bounds[b + 1] - py;
    else if (py > bounds[b + 4]) dy = py - bounds[b + 4];
    if (dy > bestDist) continue;

    let dz = 0;
    if (pz < bounds[b + 2]) dz = bounds[b + 2] - pz;
    else if (pz > bounds[b + 5]) dz = pz - bounds[b + 5];
    if (dx * dx + dy * dy + dz * dz >= bestDistSq) continue;

    const o = t * 9;
    const dSq = closestPointOnTriangleSq(
      px,
      py,
      pz,
      coords[o],
      coords[o + 1],
      coords[o + 2],
      coords[o + 3],
      coords[o + 4],
      coords[o + 5],
      coords[o + 6],
      coords[o + 7],
      coords[o + 8],
      tmpClosest
    );

    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestDist = Math.sqrt(dSq);
      bestTri = t;
      bestClosest[0] = tmpClosest[0];
      bestClosest[1] = tmpClosest[1];
      bestClosest[2] = tmpClosest[2];
      if (bestDistSq <= 1e-6) break;
    }
  }

  let normal: [number, number, number] = [0, 1, 0];
  if (bestTri >= 0) {
    const o = bestTri * 9;
    const e1x = coords[o + 3] - coords[o];
    const e1y = coords[o + 4] - coords[o + 1];
    const e1z = coords[o + 5] - coords[o + 2];
    const e2x = coords[o + 6] - coords[o];
    const e2y = coords[o + 7] - coords[o + 1];
    const e2z = coords[o + 8] - coords[o + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-6) {
      normal = [
        Number((nx / len).toFixed(3)),
        Number((ny / len).toFixed(3)),
        Number((nz / len).toFixed(3)),
      ];
    }
  }

  return {
    distanceMm: Number.isFinite(bestDist) ? bestDist : Infinity,
    closestPointMm: bestClosest,
    triangleNormal: normal,
  };
}

export interface SurfaceAuditRecord {
  part: BlueprintPart;
  mesh: THREE.Mesh;
  worldBox: THREE.Box3;
  sizeMm: [number, number, number];
  volumeCm3: number;
  isCurvedOrHollow: boolean;
}

const INTERNAL_OR_FASTENER_RE =
  /\b(internal|stator|rotor|core|bearing|shaft|pin|bushing|washer|bolt|nut|screw|gear|spacer|spring|seal|gasket|sleeve|liner|rod|piston|blade|ribbon|glass|pane|hose|cable|wire|pipe|tube|conduit)\b/i;

const SURFACE_MOUNTED_PART_RE =
  /\b(gps|imu|puck|dome|lidar|sensor|cap|bezel|camera|lens|headlamp|led|badge|logo|emblem|button|switch|dial|knob|pod|turret|antenna|radar|vent|louver|cheek|flank)\b/i;

function boxGapMm(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * SCENE_TO_MM;
}

/**
 * Checks whether a CSG tree contains curved/sculpted lofted surfaces (hull, revolve, sphere)
 * whose real surface curves away from its 3D bounding box (the root cause of AABB contact illusions).
 */
function hasSculptedCurvedCsg(node: CsgNodeSpec | undefined): boolean {
  if (!node) return false;
  if (
    node.op === 'hull' ||
    node.op === 'revolve' ||
    node.op === 'sphere' ||
    node.op === 'superellipseLoft' ||
    node.op === 'blendedBoss' ||
    node.op === 'blendedCowl' ||
    node.op === 'conformalPatch' ||
    node.op === 'shellWall' ||
    node.op === 'panelSeam'
  ) {
    return true;
  }
  if (Array.isArray(node.children)) {
    for (const ch of node.children) {
      if (hasSculptedCurvedCsg(ch)) return true;
    }
  }
  return false;
}

/**
 * Returns true when `rec` is a sculpted/curved body shell (fuselage, housing, cowling, handle)
 * as opposed to a flat planar box or slender pipe/hose.
 */
export function isSculptedCurvedHost(rec: SurfaceAuditRecord): boolean {
  const g = rec.part.geometry;
  const [sx, sy, sz] = rec.sizeMm;
  const maxDim = Math.max(sx, sy, sz);
  const minDim = Math.max(1, Math.min(sx, sy, sz));
  // Exclude slender pipes, tubes, wires, and thin arms (high aspect ratio & narrow section)
  if (minDim < 50 && maxDim / minDim > 5.5) return false;
  if (/\b(pipe|tube|hose|arm|bar|rod|rail|blade|cable|wire|header|manifold)\b/i.test(rec.part.id)) {
    return false;
  }

  if (
    g.kind === 'organicLoft' ||
    g.kind === 'curvedPanel' ||
    g.kind === 'latheProfile' ||
    g.kind === 'sphere'
  ) {
    return true;
  }
  if (g.kind === 'csgSolid' && g.csgRoot) {
    return hasSculptedCurvedCsg(g.csgRoot);
  }
  return false;
}

/**
 * Computes exact bidirectional triangle-surface gap (mm) between a mounted child part and a
 * sculpted curved host shell. Used by geometryLinter.ts load-path BFS to eliminate fake AABB
 * support edges where a single part OR multi-part sub-assembly (e.g. LiDAR + guard cage) hovers
 * inside a curved host's AABB corner void.
 */
export function computeBidirectionalSurfaceGapMm(
  child: SurfaceAuditRecord,
  host: SurfaceAuditRecord,
  triCache: Map<string, WorldMeshTriangles | null>
): number {
  const getTris = (rec: SurfaceAuditRecord): WorldMeshTriangles | null => {
    if (triCache.has(rec.part.id)) return triCache.get(rec.part.id)!;
    const tris = extractWorldTrianglesMm(rec.mesh);
    triCache.set(rec.part.id, tris);
    return tris;
  };
  const childTris = getTris(child);
  const hostTris = getTris(host);
  if (!childTris || !hostTris) return 0;

  const samples = sampleWorldSurfacePointsMm(child.mesh, childTris, 72);
  let minDist = Infinity;
  for (const pt of samples) {
    const hit = queryPointToMeshDistanceMm(pt, hostTris, minDist);
    if (hit.distanceMm < minDist) minDist = hit.distanceMm;
    if (minDist <= 0.3) return minDist;
  }

  if (minDist > 3.2) {
    const revPts = sampleNeighborPointsNearBoxMm(
      host.mesh,
      childTris.meshMinMm,
      childTris.meshMaxMm,
      6,
      48
    );
    for (const rpt of revPts) {
      const hit = queryPointToMeshDistanceMm(rpt, childTris, minDist);
      if (hit.distanceMm < minDist) minDist = hit.distanceMm;
      if (minDist <= 0.3) return minDist;
    }
  }
  return minDist;
}

/**
 * Samples well-distributed world-space surface points (mm) of a mesh:
 * combines vertices AND triangle centroids so large planar faces resting on curved pipes/bosses
 * never miss interior face contacts.
 */
function sampleWorldSurfacePointsMm(
  mesh: THREE.Mesh,
  tris: WorldMeshTriangles | null,
  maxSamples = 72
): [number, number, number][] {
  const posAttr = mesh.geometry.attributes.position;
  if (!posAttr || posAttr.count === 0) return [];
  const count = posAttr.count;
  const m = mesh.matrixWorld;
  const v = new THREE.Vector3();
  const pts: [number, number, number][] = [];

  const vertBudget = Math.floor(maxSamples * 0.65);
  const step = Math.max(1, Math.floor(count / vertBudget));
  for (let i = 0; i < count && pts.length < vertBudget; i += step) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(m).multiplyScalar(SCENE_TO_MM);
    pts.push([v.x, v.y, v.z]);
  }

  if (tris && tris.triCount > 0) {
    const centBudget = maxSamples - pts.length;
    const tStep = Math.max(1, Math.floor(tris.triCount / Math.max(1, centBudget)));
    const c = tris.coordsMm;
    for (let t = 0; t < tris.triCount && pts.length < maxSamples; t += tStep) {
      const o = t * 9;
      pts.push([
        (c[o] + c[o + 3] + c[o + 6]) / 3,
        (c[o + 1] + c[o + 4] + c[o + 7]) / 3,
        (c[o + 2] + c[o + 5] + c[o + 8]) / 3,
      ]);
    }
  }
  return pts;
}

/**
 * Samples vertices of `neighbor` that lie inside `childBoxMm` (padded by `padMm`),
 * used for reverse point-to-mesh distance so face-to-curved-side contacts resolve to 0.0 mm.
 */
function sampleNeighborPointsNearBoxMm(
  neighborMesh: THREE.Mesh,
  boxMinMm: [number, number, number],
  boxMaxMm: [number, number, number],
  padMm = 6,
  maxSamples = 48
): [number, number, number][] {
  const posAttr = neighborMesh.geometry.attributes.position;
  if (!posAttr || posAttr.count === 0) return [];
  const m = neighborMesh.matrixWorld;
  const v = new THREE.Vector3();
  const pts: [number, number, number][] = [];
  const minX = boxMinMm[0] - padMm;
  const minY = boxMinMm[1] - padMm;
  const minZ = boxMinMm[2] - padMm;
  const maxX = boxMaxMm[0] + padMm;
  const maxY = boxMaxMm[1] + padMm;
  const maxZ = boxMaxMm[2] + padMm;

  const step = Math.max(1, Math.floor(posAttr.count / 900));
  for (let i = 0; i < posAttr.count && pts.length < maxSamples; i += step) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(m).multiplyScalar(SCENE_TO_MM);
    if (v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY && v.z >= minZ && v.z <= maxZ) {
      pts.push([v.x, v.y, v.z]);
    }
  }
  return pts;
}

/**
 * Samples vertices lying on a specific local bounding-box face of `mesh`
 * (axis 0=X, 1=Y, 2=Z; sign -1=min, +1=max) and transforms them into world mm.
 * Using actual mesh vertices yields the EXACT circular rim of revolved domes/pucks
 * and exact rectangular perimeter of bezels without synthetic corner overshoot.
 */
function sampleMatingFaceRimWorldMm(
  mesh: THREE.Mesh,
  axis: 0 | 1 | 2,
  sign: -1 | 1,
  maxRimSamples = 28
): [number, number, number][] {
  const posAttr = mesh.geometry.attributes.position;
  if (!posAttr || posAttr.count === 0) return [];
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const lb = mesh.geometry.boundingBox;
  if (!lb) return [];

  const faceCoord =
    axis === 0
      ? sign < 0
        ? lb.min.x
        : lb.max.x
      : axis === 1
        ? sign < 0
          ? lb.min.y
          : lb.max.y
        : sign < 0
          ? lb.min.z
          : lb.max.z;

  const span =
    axis === 0
      ? lb.max.x - lb.min.x
      : axis === 1
        ? lb.max.y - lb.min.y
        : lb.max.z - lb.min.z;

  // Keep vertices within 1.5 mm (or 12% of thickness) of the mating face plane
  const band = Math.min(0.0015, Math.max(0.0004, span * 0.12));
  const candidates: number[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    const c = axis === 0 ? posAttr.getX(i) : axis === 1 ? posAttr.getY(i) : posAttr.getZ(i);
    if (Math.abs(c - faceCoord) <= band) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return [];

  // Deduplicate close vertices & prioritize outer perimeter vertices on the mating face
  const m = mesh.matrixWorld;
  const v = new THREE.Vector3();
  const step = Math.max(1, Math.floor(candidates.length / (maxRimSamples * 2)));
  const rawPts: [number, number, number][] = [];
  for (let k = 0; k < candidates.length; k += step) {
    v.fromBufferAttribute(posAttr, candidates[k]).applyMatrix4(m).multiplyScalar(SCENE_TO_MM);
    rawPts.push([v.x, v.y, v.z]);
  }

  // Deduplicate within 1.0 mm
  const unique: [number, number, number][] = [];
  for (const p of rawPts) {
    let dup = false;
    for (const u of unique) {
      const dx = p[0] - u[0];
      const dy = p[1] - u[1];
      const dz = p[2] - u[2];
      if (dx * dx + dy * dy + dz * dz < 1.0) {
        dup = true;
        break;
      }
    }
    if (!dup) unique.push(p);
    if (unique.length >= maxRimSamples) break;
  }
  return unique;
}

/**
 * Deterministic True-Surface Mount Seating & Blend Auditor.
 *
 * Catches BOTH generalized first-pass CAD failure classes that bypass AABB grounding checks:
 *  1. `hoveringAirGap`: A non-grounded part sits inside a curved/sculpted host's AABB corner void
 *     (AABB gap = 0 mm) while actually hovering > 3.2 mm in empty air off ALL neighboring triangles
 *     (verified bidirectionally across vertices + triangle centroids).
 *     (Example: unblended 4D LiDAR hanging under a sloping robot snout, or floating GPS cap.)
 *  2. `cantileveredRimSkew`: A compact surface-mounted cap/dome/puck/pod/bezel/badge touches a
 *     sculpted curved host on one edge (`minRimGap <= 3.0 mm`) while its opposite mating rim lifts
 *     > 4.8 mm into air due to wrong-sign slope rotation or missing molded landing boss/cowl.
 *     (Example: GPS dome cap tilted -9° on a +8.5° sloped brow, or unrotated flat badge on tapered cheek.)
 */
export function auditCurvedSurfaceMounts(
  records: SurfaceAuditRecord[],
  options: {
    fitExemptPairs: Set<string>;
    makePairKey: (a: string, b: string) => string;
    jointPartIds: Set<string>;
  }
): UnblendedMountIssue[] {
  const n = records.length;
  if (n < 2) return [];

  const triCache = new Map<string, WorldMeshTriangles | null>();
  const getTris = (rec: SurfaceAuditRecord): WorldMeshTriangles | null => {
    if (triCache.has(rec.part.id)) return triCache.get(rec.part.id)!;
    const tris = extractWorldTrianglesMm(rec.mesh);
    triCache.set(rec.part.id, tris);
    return tris;
  };

  const issues: UnblendedMountIssue[] = [];
  const seenParts = new Set<string>();

  for (let i = 0; i < n; i++) {
    const child = records[i];
    const cp = child.part;

    // Skip floor-grounded parts, fasteners/bearings/gears, internal hardware, and kinematic joints
    const minYMm = child.worldBox.min.y * SCENE_TO_MM;
    if (minYMm <= 3.0 || cp.anchorKind === 'floor' || cp.constraint?.kind === 'sitOnGround') {
      continue;
    }
    if (
      cp.fitClass === 'fastener' ||
      cp.fitClass === 'bearing' ||
      cp.fitClass === 'gearMesh'
    ) {
      continue;
    }
    if (INTERNAL_OR_FASTENER_RE.test(cp.id) || INTERNAL_OR_FASTENER_RE.test(cp.name)) {
      continue;
    }
    if (options.jointPartIds.has(cp.id)) continue;

    // Find all neighboring parts whose AABB is within 3.5 mm of `child`
    const aabbNeighbors: SurfaceAuditRecord[] = [];
    let primaryHost: SurfaceAuditRecord | null = null;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const other = records[j];
      const gap = boxGapMm(child.worldBox, other.worldBox);
      if (gap <= 3.5) {
        aabbNeighbors.push(other);
        const isLargerSculptedHost =
          other.volumeCm3 >= child.volumeCm3 * 3.0 && isSculptedCurvedHost(other);
        if (
          isLargerSculptedHost &&
          (!primaryHost || other.volumeCm3 > primaryHost.volumeCm3)
        ) {
          primaryHost = other;
        }
      }
    }

    // Only audit parts whose AABB relies on a larger sculpted/curved host shell
    if (!primaryHost) continue;
    if (options.fitExemptPairs.has(options.makePairKey(cp.id, primaryHost.part.id))) {
      continue;
    }

    const childTris = getTris(child);
    const hostTris = getTris(primaryHost);
    if (!childTris || !hostTris) continue;

    const neighborTris: { rec: SurfaceAuditRecord; tris: WorldMeshTriangles }[] = [];
    for (const nb of aabbNeighbors) {
      const tris = getTris(nb);
      if (tris) neighborTris.push({ rec: nb, tris });
    }
    if (neighborTris.length === 0) continue;

    // ------------------------------------------------------------------------
    // CHECK A: Bidirectional True-Surface Hovering Air-Gap
    // ------------------------------------------------------------------------
    const surfaceSamples = sampleWorldSurfacePointsMm(child.mesh, childTris, 72);
    if (surfaceSamples.length === 0) continue;

    let minAnyDist = Infinity;
    let closestHostDist = Infinity;
    let closestChildPt: [number, number, number] = surfaceSamples[0];
    let closestHostPt: [number, number, number] = surfaceSamples[0];
    let closestHostNormal: [number, number, number] = [0, 1, 0];

    // Forward pass: child surface points -> all neighbor triangles
    for (const pt of surfaceSamples) {
      for (const nb of neighborTris) {
        const searchCap = nb.rec.part.id === primaryHost.part.id
          ? Math.max(minAnyDist, closestHostDist)
          : minAnyDist;
        const hit = queryPointToMeshDistanceMm(pt, nb.tris, searchCap);
        if (hit.distanceMm < minAnyDist) {
          minAnyDist = hit.distanceMm;
        }
        if (nb.rec.part.id === primaryHost.part.id && hit.distanceMm < closestHostDist) {
          closestHostDist = hit.distanceMm;
          closestChildPt = pt;
          closestHostPt = hit.closestPointMm;
          closestHostNormal = hit.triangleNormal;
        }
      }
      if (minAnyDist <= 0.3) break;
    }

    // Reverse pass: neighbor vertices inside child's padded AABB -> child triangles
    // Eliminates false positives when a broad face touches a curved boss/pipe between sparse vertices.
    if (minAnyDist > 3.2) {
      for (const nb of neighborTris) {
        const revPts = sampleNeighborPointsNearBoxMm(
          nb.rec.mesh,
          childTris.meshMinMm,
          childTris.meshMaxMm,
          6,
          48
        );
        for (const rpt of revPts) {
          const hit = queryPointToMeshDistanceMm(rpt, childTris, minAnyDist);
          if (hit.distanceMm < minAnyDist) {
            minAnyDist = hit.distanceMm;
          }
          if (nb.rec.part.id === primaryHost.part.id && hit.distanceMm < closestHostDist) {
            closestHostDist = hit.distanceMm;
            closestChildPt = hit.closestPointMm;
            closestHostPt = rpt;
            closestHostNormal = hit.triangleNormal;
          }
          if (minAnyDist <= 0.3) break;
        }
        if (minAnyDist <= 0.3) break;
      }
    }

    // If `child` hovers > 3.2 mm away from EVERY neighboring mesh's actual triangles,
    // its AABB contact with the curved host was a false-positive air-gap!
    if (minAnyDist > 3.2 && Number.isFinite(closestHostDist)) {
      const dropVec: [number, number, number] = [
        Number((closestHostPt[0] - closestChildPt[0]).toFixed(1)),
        Number((closestHostPt[1] - closestChildPt[1]).toFixed(1)),
        Number((closestHostPt[2] - closestChildPt[2]).toFixed(1)),
      ];
      seenParts.add(cp.id);
      issues.push({
        partId: cp.id,
        partName: cp.name,
        group: cp.group,
        hostPartId: primaryHost.part.id,
        hostPartName: primaryHost.part.name,
        minSurfaceGapMm: Number(minAnyDist.toFixed(1)),
        maxRimGapMm: Number(minAnyDist.toFixed(1)),
        reason: 'hoveringAirGap',
        recommendedShiftMm: dropVec,
        hostNormal: closestHostNormal,
        hint: `Part hovers ${minAnyDist.toFixed(1)} mm off "${primaryHost.part.id}" surface despite AABB overlap. Mold a concentric boss/cowl into "${primaryHost.part.id}" or seat "${cp.id}" by [${dropVec.join(', ')}] mm.`,
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // CHECK B: Cantilevered Rim-Skew / Wrong-Sign Slope Audit
    // Applies to compact surface-mounted exterior pods, caps, domes, pucks, bezels, badges
    // ------------------------------------------------------------------------
    const maxSpanMm = Math.max(child.sizeMm[0], child.sizeMm[1], child.sizeMm[2]);
    const isCompactSurfaceMount =
      maxSpanMm <= 260 &&
      child.volumeCm3 < primaryHost.volumeCm3 * 0.15 &&
      (SURFACE_MOUNTED_PART_RE.test(cp.id) || SURFACE_MOUNTED_PART_RE.test(cp.name));
    if (!isCompactSurfaceMount) continue;
    if (seenParts.has(cp.id)) continue;

    if (!child.mesh.geometry.boundingBox) child.mesh.geometry.computeBoundingBox();
    const lb = child.mesh.geometry.boundingBox;
    if (!lb) continue;

    const faceSpecs: { axis: 0 | 1 | 2; sign: -1 | 1 }[] = [
      { axis: 0, sign: -1 },
      { axis: 0, sign: 1 },
      { axis: 1, sign: -1 },
      { axis: 1, sign: 1 },
      { axis: 2, sign: -1 },
      { axis: 2, sign: 1 },
    ];

    // Pick the oriented local face whose rim sits closest to `primaryHost`
    let bestFace: { axis: 0 | 1 | 2; sign: -1 | 1 } | null = null;
    let bestFaceMinDist = Infinity;
    let bestFaceRimPts: [number, number, number][] = [];
    let bestFaceNormal: [number, number, number] = [0, 1, 0];

    for (const fs of faceSpecs) {
      const rimPts = sampleMatingFaceRimWorldMm(child.mesh, fs.axis, fs.sign, 28);
      if (rimPts.length < 4) continue;
      let faceMin = Infinity;
      let faceNorm: [number, number, number] = [0, 1, 0];
      for (const p of rimPts) {
        const hit = queryPointToMeshDistanceMm(p, hostTris, 25);
        if (hit.distanceMm < faceMin) {
          faceMin = hit.distanceMm;
          faceNorm = hit.triangleNormal;
        }
      }
      if (faceMin < bestFaceMinDist) {
        bestFaceMinDist = faceMin;
        bestFace = { axis: fs.axis, sign: fs.sign };
        bestFaceRimPts = rimPts;
        bestFaceNormal = faceNorm;
      }
    }

    if (!bestFace || bestFaceMinDist > 3.0 || bestFaceRimPts.length < 4) continue;

    // Measure every mating-rim vertex's distance to the nearest supporting mesh
    const rimDists: number[] = [];
    for (const p of bestFaceRimPts) {
      let best = Infinity;
      for (const nb of neighborTris) {
        const hit = queryPointToMeshDistanceMm(p, nb.tris, best);
        if (hit.distanceMm < best) best = hit.distanceMm;
        if (best <= 0.25) break;
      }
      if (Number.isFinite(best)) rimDists.push(best);
    }
    if (rimDists.length < 4) continue;

    rimDists.sort((a, b) => a - b);
    const minRim = rimDists[0];
    // Use 90th-percentile rim distance to ignore single chamfer outliers while catching true tilt/unblended overhangs
    const p90Idx = Math.min(rimDists.length - 1, Math.floor((rimDists.length - 1) * 0.9));
    const maxRim = rimDists[p90Idx];
    const rimSkew = maxRim - minRim;

    if (maxRim > 4.8 && rimSkew > 3.2) {
      // Compute exact world mating-face normal & center for zero-token deterministic auto-tilt
      const localFaceNormal = new THREE.Vector3(
        bestFace.axis === 0 ? bestFace.sign : 0,
        bestFace.axis === 1 ? bestFace.sign : 0,
        bestFace.axis === 2 ? bestFace.sign : 0
      );
      const childPosTmp = new THREE.Vector3();
      const childQuatTmp = new THREE.Quaternion();
      const childScaleTmp = new THREE.Vector3();
      child.mesh.matrixWorld.decompose(childPosTmp, childQuatTmp, childScaleTmp);
      const worldChildMateNormal = localFaceNormal.applyQuaternion(childQuatTmp).normalize();

      const lbCenter = new THREE.Vector3();
      lb.getCenter(lbCenter);
      const worldPartCenterMm = lbCenter
        .clone()
        .applyMatrix4(child.mesh.matrixWorld)
        .multiplyScalar(SCENE_TO_MM);

      const localFaceCenter = lbCenter.clone();
      if (bestFace.axis === 0) localFaceCenter.x = bestFace.sign < 0 ? lb.min.x : lb.max.x;
      else if (bestFace.axis === 1) localFaceCenter.y = bestFace.sign < 0 ? lb.min.y : lb.max.y;
      else localFaceCenter.z = bestFace.sign < 0 ? lb.min.z : lb.max.z;

      const worldFaceCenterMmVec = localFaceCenter
        .applyMatrix4(child.mesh.matrixWorld)
        .multiplyScalar(SCENE_TO_MM);
      const matingFaceCenterWorldMm: [number, number, number] = [
        Number(worldFaceCenterMmVec.x.toFixed(2)),
        Number(worldFaceCenterMmVec.y.toFixed(2)),
        Number(worldFaceCenterMmVec.z.toFixed(2)),
      ];

      // Query host surface directly beneath the child's mating-face center
      const centerHit = queryPointToMeshDistanceMm(matingFaceCenterWorldMm, hostTris, 40);
      const resolvedHostNormalVec = new THREE.Vector3(
        ...(centerHit.distanceMm < 35 ? centerHit.triangleNormal : bestFaceNormal)
      ).normalize();
      // Guarantee outward host normal orientation (pointing from mating face toward child body)
      const awayFromHost = worldPartCenterMm.clone().sub(worldFaceCenterMmVec);
      if (awayFromHost.lengthSq() > 1e-4 && resolvedHostNormalVec.dot(awayFromHost) < 0) {
        resolvedHostNormalVec.negate();
      }
      const resolvedHostNormal: [number, number, number] = [
        Number(resolvedHostNormalVec.x.toFixed(4)),
        Number(resolvedHostNormalVec.y.toFixed(4)),
        Number(resolvedHostNormalVec.z.toFixed(4)),
      ];

      seenParts.add(cp.id);
      issues.push({
        partId: cp.id,
        partName: cp.name,
        group: cp.group,
        hostPartId: primaryHost.part.id,
        hostPartName: primaryHost.part.name,
        minSurfaceGapMm: Number(minRim.toFixed(1)),
        maxRimGapMm: Number(maxRim.toFixed(1)),
        reason: 'cantileveredRimSkew',
        recommendedShiftMm: [0, 0, 0],
        hostNormal: resolvedHostNormal,
        childMatingNormalWorld: [
          Number(worldChildMateNormal.x.toFixed(4)),
          Number(worldChildMateNormal.y.toFixed(4)),
          Number(worldChildMateNormal.z.toFixed(4)),
        ],
        matingFaceCenterWorldMm,
        nearestHostAtCenterMm:
          centerHit.distanceMm < 35
            ? [
                Number(centerHit.closestPointMm[0].toFixed(2)),
                Number(centerHit.closestPointMm[1].toFixed(2)),
                Number(centerHit.closestPointMm[2].toFixed(2)),
              ]
            : undefined,
        hint: `Mating rim of "${cp.id}" touches at ${minRim.toFixed(1)} mm but lifts ${maxRim.toFixed(1)} mm off curved host "${primaryHost.part.id}" (skew ${rimSkew.toFixed(1)} mm). Mold a concentric filleted landing boss/cowl into "${primaryHost.part.id}" and match surface slope rotation (+atan2(dy, dx)).`,
      });
    }
  }

  return issues;
}
