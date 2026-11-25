/**
 * Global SDF Smooth-Boolean Engine for watertight Manifold-3D solids.
 *
 * Solves C0 seam defects when blending multi-plane, multi-feature geometry
 * (revolve + extrude + sweep/loft) on forged, cast, and molded parts:
 *   - `smoothUnion`:     polynomial cubic smin (real fillet radius along intersections)
 *   - `smoothSubtract`:  smooth filleted subtraction (`-smin(-dBase, dCutter, k)`)
 *   - `smoothIntersect`: smooth rounded multi-plane intersection (`-smin(-dA, -dB, k)`)
 *
 * Uses a compact AABB BVH over each child Manifold's triangle mesh for fast exact
 * point-to-triangle distance + BVH-accelerated ray-parity sign, then extracts a
 * guaranteed watertight Manifold via `Manifold.levelSet` (Marching Tetrahedra).
 */
import type { Box, Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d';
import type { TessellationDensity } from '../types/blueprint';

export type SmoothBooleanKind = 'smoothUnion' | 'smoothSubtract' | 'smoothIntersect';

interface BvhNode {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** If >= 0, leaf node starting at `triStart` with `triCount` triangles; else internal node */
  triStart: number;
  triCount: number;
  left: number;
  right: number;
}

interface MeshSdfAccelerator {
  /** Flat triangle vertices: 9 floats per triangle (ax,ay,az, bx,by,bz, cx,cy,cz) */
  tris: Float64Array;
  triOrder: Int32Array;
  nodes: BvhNode[];
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Exact squared distance from point P to triangle ABC (Ericson, Real-Time Collision Detection). */
function pointTriangleDistSq(
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
  cz: number
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;

  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const dx = apx - abx * v, dy = apy - aby * v, dz = apz - abz * v;
    return dx * dx + dy * dy + dz * dz;
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const dx = apx - acx * w, dy = apy - acy * w, dz = apz - acz * w;
    return dx * dx + dy * dy + dz * dz;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const dx = bpx - (cx - bx) * w;
    const dy = bpy - (cy - by) * w;
    const dz = bpz - (cz - bz) * w;
    return dx * dx + dy * dy + dz * dz;
  }

  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const dx = apx - abx * v - acx * w;
  const dy = apy - aby * v - acy * w;
  const dz = apz - abz * v - acz * w;
  return dx * dx + dy * dy + dz * dz;
}

/** Squared distance from point P to an AABB (0 if inside). */
function pointBoxDistSq(
  px: number,
  py: number,
  pz: number,
  n: BvhNode
): number {
  let dx = 0;
  if (px < n.minX) dx = n.minX - px;
  else if (px > n.maxX) dx = px - n.maxX;
  let dy = 0;
  if (py < n.minY) dy = n.minY - py;
  else if (py > n.maxY) dy = py - n.maxY;
  let dz = 0;
  if (pz < n.minZ) dz = n.minZ - pz;
  else if (pz > n.maxZ) dz = pz - n.maxZ;
  return dx * dx + dy * dy + dz * dz;
}

// Slightly skewed unit ray direction to avoid hitting axis-aligned triangle edges/vertices
const RAY_DX = 0.9863939238321437;
const RAY_DY = 0.1352346069573869;
const RAY_DZ = 0.0900577652458747;
const INV_RAY_DX = 1 / RAY_DX;
const INV_RAY_DY = 1 / RAY_DY;
const INV_RAY_DZ = 1 / RAY_DZ;

/** Fast ray-AABB intersection for our fixed positive-octant ray (t >= 0). */
function rayHitsBox(px: number, py: number, pz: number, n: BvhNode): boolean {
  const tx1 = (n.minX - px) * INV_RAY_DX;
  const tx2 = (n.maxX - px) * INV_RAY_DX;
  let tmin = tx1 < tx2 ? tx1 : tx2;
  let tmax = tx1 > tx2 ? tx1 : tx2;

  const ty1 = (n.minY - py) * INV_RAY_DY;
  const ty2 = (n.maxY - py) * INV_RAY_DY;
  const tyMin = ty1 < ty2 ? ty1 : ty2;
  const tyMax = ty1 > ty2 ? ty1 : ty2;
  if (tyMin > tmin) tmin = tyMin;
  if (tyMax < tmax) tmax = tyMax;

  const tz1 = (n.minZ - pz) * INV_RAY_DZ;
  const tz2 = (n.maxZ - pz) * INV_RAY_DZ;
  const tzMin = tz1 < tz2 ? tz1 : tz2;
  const tzMax = tz1 > tz2 ? tz1 : tz2;
  if (tzMin > tmin) tmin = tzMin;
  if (tzMax < tmax) tmax = tzMax;

  return tmax >= 0 && tmax >= tmin;
}

/** Möller-Trumbore ray-triangle hit test along our fixed ray (returns true if t > 0). */
function rayHitsTriangle(
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
  cz: number
): boolean {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const hx = RAY_DY * e2z - RAY_DZ * e2y;
  const hy = RAY_DZ * e2x - RAY_DX * e2z;
  const hz = RAY_DX * e2y - RAY_DY * e2x;
  const a = e1x * hx + e1y * hy + e1z * hz;
  if (a > -1e-10 && a < 1e-10) return false;
  const f = 1.0 / a;
  const sx = px - ax, sy = py - ay, sz = pz - az;
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0.0 || u > 1.0) return false;
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (RAY_DX * qx + RAY_DY * qy + RAY_DZ * qz);
  if (v < 0.0 || u + v > 1.0) return false;
  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  return t > 1e-8;
}

function buildMeshSdfAccelerator(manifold: Manifold): MeshSdfAccelerator {
  const mesh = manifold.getMesh();
  const numProp = mesh.numProp;
  const vp = mesh.vertProperties;
  const tv = mesh.triVerts;
  const triCount = Math.floor(tv.length / 3);

  const tris = new Float64Array(triCount * 9);
  const centroids = new Float64Array(triCount * 3);
  const triOrder = new Int32Array(triCount);

  let gMinX = Infinity, gMinY = Infinity, gMinZ = Infinity;
  let gMaxX = -Infinity, gMaxY = -Infinity, gMaxZ = -Infinity;

  for (let i = 0; i < triCount; i++) {
    triOrder[i] = i;
    const i0 = tv[i * 3] * numProp;
    const i1 = tv[i * 3 + 1] * numProp;
    const i2 = tv[i * 3 + 2] * numProp;
    const ax = vp[i0], ay = vp[i0 + 1], az = vp[i0 + 2];
    const bx = vp[i1], by = vp[i1 + 1], bz = vp[i1 + 2];
    const cx = vp[i2], cy = vp[i2 + 1], cz = vp[i2 + 2];

    const o = i * 9;
    tris[o] = ax; tris[o + 1] = ay; tris[o + 2] = az;
    tris[o + 3] = bx; tris[o + 4] = by; tris[o + 5] = bz;
    tris[o + 6] = cx; tris[o + 7] = cy; tris[o + 8] = cz;

    centroids[i * 3] = (ax + bx + cx) / 3;
    centroids[i * 3 + 1] = (ay + by + cy) / 3;
    centroids[i * 3 + 2] = (az + bz + cz) / 3;

    gMinX = Math.min(gMinX, ax, bx, cx);
    gMinY = Math.min(gMinY, ay, by, cy);
    gMinZ = Math.min(gMinZ, az, bz, cz);
    gMaxX = Math.max(gMaxX, ax, bx, cx);
    gMaxY = Math.max(gMaxY, ay, by, cy);
    gMaxZ = Math.max(gMaxZ, az, bz, cz);
  }

  const nodes: BvhNode[] = [];

  function buildNode(start: number, count: number): number {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
    let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;

    for (let k = start; k < start + count; k++) {
      const ti = triOrder[k];
      const o = ti * 9;
      for (let v = 0; v < 9; v += 3) {
        const vx = tris[o + v], vy = tris[o + v + 1], vz = tris[o + v + 2];
        if (vx < minX) minX = vx;
        if (vy < minY) minY = vy;
        if (vz < minZ) minZ = vz;
        if (vx > maxX) maxX = vx;
        if (vy > maxY) maxY = vy;
        if (vz > maxZ) maxZ = vz;
      }
      const cx = centroids[ti * 3], cy = centroids[ti * 3 + 1], cz = centroids[ti * 3 + 2];
      if (cx < cMinX) cMinX = cx;
      if (cy < cMinY) cMinY = cy;
      if (cz < cMinZ) cMinZ = cz;
      if (cx > cMaxX) cMaxX = cx;
      if (cy > cMaxY) cMaxY = cy;
      if (cz > cMaxZ) cMaxZ = cz;
    }

    const nodeIdx = nodes.length;
    if (count <= 4) {
      nodes.push({ minX, minY, minZ, maxX, maxY, maxZ, triStart: start, triCount: count, left: -1, right: -1 });
      return nodeIdx;
    }

    const ex = cMaxX - cMinX;
    const ey = cMaxY - cMinY;
    const ez = cMaxZ - cMinZ;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const midVal = axis === 0 ? (cMinX + cMaxX) * 0.5 : axis === 1 ? (cMinY + cMaxY) * 0.5 : (cMinZ + cMaxZ) * 0.5;

    // Partition triOrder[start..start+count) around midVal
    let i = start;
    let j = start + count - 1;
    while (i <= j) {
      if (centroids[triOrder[i] * 3 + axis] < midVal) {
        i++;
      } else {
        const tmp = triOrder[i];
        triOrder[i] = triOrder[j];
        triOrder[j] = tmp;
        j--;
      }
    }

    let leftCount = i - start;
    if (leftCount === 0 || leftCount === count) {
      leftCount = count >> 1;
    }

    nodes.push({ minX, minY, minZ, maxX, maxY, maxZ, triStart: -1, triCount: 0, left: -1, right: -1 });
    const left = buildNode(start, leftCount);
    const right = buildNode(start + leftCount, count - leftCount);
    nodes[nodeIdx].left = left;
    nodes[nodeIdx].right = right;
    return nodeIdx;
  }

  if (triCount > 0) {
    buildNode(0, triCount);
  }

  return {
    tris,
    triOrder,
    nodes,
    minX: gMinX,
    minY: gMinY,
    minZ: gMinZ,
    maxX: gMaxX,
    maxY: gMaxY,
    maxZ: gMaxZ,
  };
}

// Reusable traversal stack (single-threaded synchronous levelSet callback -> zero GC)
const _stack = new Int32Array(256);

/** Evaluate exact signed distance (negative inside, positive outside) to a watertight mesh. */
function evalMeshSdf(acc: MeshSdfAccelerator, px: number, py: number, pz: number): number {
  const nodes = acc.nodes;
  if (nodes.length === 0) return 1e6;
  const tris = acc.tris;
  const triOrder = acc.triOrder;

  // 1. Exact unsigned distance via branch-and-bound BVH traversal
  let bestDistSq = Infinity;
  let sp = 0;
  _stack[sp++] = 0;

  while (sp > 0) {
    const ni = _stack[--sp];
    const n = nodes[ni];
    if (pointBoxDistSq(px, py, pz, n) >= bestDistSq) continue;

    if (n.triStart >= 0) {
      const end = n.triStart + n.triCount;
      for (let k = n.triStart; k < end; k++) {
        const o = triOrder[k] * 9;
        const dSq = pointTriangleDistSq(
          px, py, pz,
          tris[o], tris[o + 1], tris[o + 2],
          tris[o + 3], tris[o + 4], tris[o + 5],
          tris[o + 6], tris[o + 7], tris[o + 8]
        );
        if (dSq < bestDistSq) bestDistSq = dSq;
      }
    } else {
      const dL = pointBoxDistSq(px, py, pz, nodes[n.left]);
      const dR = pointBoxDistSq(px, py, pz, nodes[n.right]);
      // Push farther child first so nearer child is popped first (tighter pruning)
      if (dL < dR) {
        if (dR < bestDistSq) _stack[sp++] = n.right;
        if (dL < bestDistSq) _stack[sp++] = n.left;
      } else {
        if (dL < bestDistSq) _stack[sp++] = n.left;
        if (dR < bestDistSq) _stack[sp++] = n.right;
      }
    }
  }

  const dist = Math.sqrt(bestDistSq);

  // Fast reject: points strictly outside AABB cannot be inside the mesh
  if (
    px < acc.minX || px > acc.maxX ||
    py < acc.minY || py > acc.maxY ||
    pz < acc.minZ || pz > acc.maxZ
  ) {
    return dist;
  }

  // 2. Inside/outside sign via BVH-accelerated ray-parity
  let hits = 0;
  sp = 0;
  _stack[sp++] = 0;
  while (sp > 0) {
    const ni = _stack[--sp];
    const n = nodes[ni];
    if (!rayHitsBox(px, py, pz, n)) continue;
    if (n.triStart >= 0) {
      const end = n.triStart + n.triCount;
      for (let k = n.triStart; k < end; k++) {
        const o = triOrder[k] * 9;
        if (
          rayHitsTriangle(
            px, py, pz,
            tris[o], tris[o + 1], tris[o + 2],
            tris[o + 3], tris[o + 4], tris[o + 5],
            tris[o + 6], tris[o + 7], tris[o + 8]
          )
        ) {
          hits++;
        }
      }
    } else {
      _stack[sp++] = n.left;
      _stack[sp++] = n.right;
    }
  }

  return (hits & 1) === 1 ? -dist : dist;
}

/** C2-continuous cubic polynomial smooth minimum (negative = inside). */
export function sminCubic(a: number, b: number, k: number): number {
  if (k <= 1e-6) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0.0) / k;
  return (a < b ? a : b) - (h * h * h * k) / 6.0;
}

/**
 * Combines child Manifold solids using an SDF smooth boolean (`smoothUnion`,
 * `smoothSubtract`, or `smoothIntersect`) and extracts a guaranteed watertight
 * Manifold via `Manifold.levelSet`.
 */
export function buildSmoothBooleanManifold(
  wasm: ManifoldToplevel,
  op: SmoothBooleanKind,
  children: Manifold[],
  options: {
    filletRadiusMm?: number;
    voxelSizeMm?: number;
    toleranceMm?: number;
    density?: TessellationDensity;
  } = {}
): Manifold {
  const { Manifold: M } = wasm;
  if (children.length === 0) return M.cube([10, 10, 10], true);
  if (children.length === 1) return children[0];

  const k = Math.max(0.25, Math.min(40, options.filletRadiusMm ?? 4.0));
  const accs = children.map((c) => buildMeshSdfAccelerator(c));

  // Compute combined bounds in mm
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  if (op === 'smoothSubtract') {
    // Result cannot exceed base AABB
    minX = accs[0].minX; minY = accs[0].minY; minZ = accs[0].minZ;
    maxX = accs[0].maxX; maxY = accs[0].maxY; maxZ = accs[0].maxZ;
  } else if (op === 'smoothIntersect') {
    // Result is inside intersection of AABBs
    minX = Math.max(...accs.map((a) => a.minX));
    minY = Math.max(...accs.map((a) => a.minY));
    minZ = Math.max(...accs.map((a) => a.minZ));
    maxX = Math.min(...accs.map((a) => a.maxX));
    maxY = Math.min(...accs.map((a) => a.maxY));
    maxZ = Math.min(...accs.map((a) => a.maxZ));
    if (minX >= maxX || minY >= maxY || minZ >= maxZ) {
      return M.cube([0.5, 0.5, 0.5], true);
    }
  } else {
    for (const a of accs) {
      if (a.minX < minX) minX = a.minX;
      if (a.minY < minY) minY = a.minY;
      if (a.minZ < minZ) minZ = a.minZ;
      if (a.maxX > maxX) maxX = a.maxX;
      if (a.maxY > maxY) maxY = a.maxY;
      if (a.maxZ > maxZ) maxZ = a.maxZ;
    }
  }

  const maxSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 10);
  const densityScale = options.density === 'ultra' ? 0.72 : 1.0;

  // Choose voxel edge length that resolves the fillet cleanly while keeping evaluation interactive
  const autoEdge = Math.max(
    maxSpan / 52,
    Math.min(k * 0.55, maxSpan / 26)
  ) * densityScale;
  const edgeLength = Math.max(
    0.5,
    Math.min(maxSpan / 8, options.voxelSizeMm ?? autoEdge)
  );

  // Pad bounds so Marching Tetrahedra never clips the smooth fillet bulge
  const pad = (op === 'smoothUnion' ? k * 0.65 : 0) + edgeLength * 2.5;
  const bounds: Box = {
    min: [minX - pad, minY - pad, minZ - pad],
    max: [maxX + pad, maxY + pad, maxZ + pad],
  };

  // Manifold.levelSet treats positive values as INSIDE, negative as OUTSIDE -> return -d
  const sdf = (pt: Vec3): number => {
    const px = pt[0], py = pt[1], pz = pt[2];
    if (op === 'smoothUnion') {
      let d = evalMeshSdf(accs[0], px, py, pz);
      for (let i = 1; i < accs.length; i++) {
        d = sminCubic(d, evalMeshSdf(accs[i], px, py, pz), k);
      }
      return -d;
    }
    if (op === 'smoothSubtract') {
      let dBase = evalMeshSdf(accs[0], px, py, pz);
      let dCut = evalMeshSdf(accs[1], px, py, pz);
      for (let i = 2; i < accs.length; i++) {
        const di = evalMeshSdf(accs[i], px, py, pz);
        if (di < dCut) dCut = di;
      }
      // Smooth subtraction: -smin(-dBase, dCut, k) = smax(dBase, -dCut, k)
      const d = -sminCubic(-dBase, dCut, k);
      return -d;
    }
    // smoothIntersect: -smin(-dA, -dB, k) = smax(dA, dB, k)
    let d = evalMeshSdf(accs[0], px, py, pz);
    for (let i = 1; i < accs.length; i++) {
      d = -sminCubic(-d, -evalMeshSdf(accs[i], px, py, pz), k);
    }
    return -d;
  };

  const tol = options.toleranceMm ?? -1;
  return M.levelSet(sdf, bounds, edgeLength, 0, tol);
}
