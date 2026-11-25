import * as THREE from 'three';
import {
  AssemblyMassProperties,
  BlueprintPart,
  PartMassProperty,
  PartMaterialSpec,
} from '../types/blueprint';

const SCENE_TO_MM = 1000;
const MM3_TO_CM3 = 1 / 1000;

/**
 * Infers realistic physical material density (g/cm³) from explicit override,
 * finishName keywords, textureKind, or PBR metalness.
 */
export function inferMaterialDensityGPerCm3(mat: PartMaterialSpec): number {
  if (typeof mat.densityGPerCm3 === 'number' && Number.isFinite(mat.densityGPerCm3) && mat.densityGPerCm3 > 0.05) {
    return Number(mat.densityGPerCm3.toFixed(2));
  }

  const label = `${mat.finishName || ''} ${mat.textureKind || ''}`.toLowerCase();

  if (/\b(tungsten|lead|ballast)\b/.test(label)) return 11.3;
  if (/\b(copper|brass|bronze)\b/.test(label)) return 8.92;
  if (/\b(stainless|304|316|chrome|chromed)\b/.test(label)) return 7.93;
  if (/\b(steel|iron|cast iron|galvanized|forged|tool steel|hardened|bearing|bolt|hex|fastener|grating|welding)\b/.test(label)) {
    return 7.85;
  }
  if (/\b(titanium|ti-6al)\b/.test(label)) return 4.43;
  if (/\b(aluminum|aluminium|alloy|anodized|billet|6061|7075|die-cast)\b/.test(label)) {
    return 2.7;
  }
  if (/\b(marble|granite|stone|slate|quartz)\b/.test(label)) return 2.65;
  if (/\b(glass|crystal|lens|optic|ceramic|porcelain)\b/.test(label)) return 2.5;
  if (/\b(concrete|cement|brick)\b/.test(label)) return 2.35;
  if (/\b(carbon|cfrp|fiberglass|composite)\b/.test(label)) return 1.55;
  if (/\b(rubber|tpu|elastomer|overmold|grip|tire|tread|gasket|silicone|neoprene)\b/.test(label)) {
    return 1.2;
  }
  if (/\b(abs|polycarbonate|nylon|delrin|acetal|pom|polymer|plastic|shell|housing|enclosure|molded|matte|satin|resin)\b/.test(label)) {
    return 1.14;
  }
  if (/\b(wood|oak|walnut|maple|plywood|mdf|timber|pine|mahogany)\b/.test(label)) {
    return 0.68;
  }
  if (/\b(fabric|cloth|foam|upholstery|felt)\b/.test(label)) return 0.35;

  // Fallback by PBR metalness
  if (mat.metalness >= 0.72) return 7.85;
  if (mat.metalness >= 0.42) return 2.7;
  if (mat.transparent && (mat.transmission ?? 0) > 0.25) return 2.5;
  return 1.18;
}

/**
 * Computes exact signed-tetrahedron mesh volume (cm³) and volume-weighted 3D centroid
 * in world millimeters for any triangle mesh (accurate on watertight CSG solids,
 * hollow shells, and sculpted lofts).
 */
export function computeMeshVolumeAndCentroidMm(mesh: THREE.Mesh): {
  volumeCm3: number;
  centroidWorldMm: [number, number, number];
} {
  const geo = mesh.geometry;
  const posAttr = geo.attributes.position;
  if (!posAttr || posAttr.count < 3) {
    return { volumeCm3: 0, centroidWorldMm: [0, 0, 0] };
  }

  mesh.updateMatrixWorld(true);
  const m = mesh.matrixWorld;
  const idx = geo.index;

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const cross = new THREE.Vector3();

  // Compute reference origin near the mesh center to preserve floating-point precision
  if (!geo.boundingBox) geo.computeBoundingBox();
  const refWorld = new THREE.Vector3();
  if (geo.boundingBox && !geo.boundingBox.isEmpty()) {
    geo.boundingBox.getCenter(refWorld).applyMatrix4(m).multiplyScalar(SCENE_TO_MM);
  }

  let totalSignedVol6 = 0;
  let cxSum = 0;
  let cySum = 0;
  let czSum = 0;

  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(posAttr.count / 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

    v0.fromBufferAttribute(posAttr, i0).applyMatrix4(m).multiplyScalar(SCENE_TO_MM).sub(refWorld);
    v1.fromBufferAttribute(posAttr, i1).applyMatrix4(m).multiplyScalar(SCENE_TO_MM).sub(refWorld);
    v2.fromBufferAttribute(posAttr, i2).applyMatrix4(m).multiplyScalar(SCENE_TO_MM).sub(refWorld);

    cross.crossVectors(v1, v2);
    const vol6 = v0.dot(cross); // 6 * signed tetrahedron volume in mm³
    totalSignedVol6 += vol6;

    cxSum += vol6 * (v0.x + v1.x + v2.x);
    cySum += vol6 * (v0.y + v1.y + v2.y);
    czSum += vol6 * (v0.z + v1.z + v2.z);
  }

  const absVolMm3 = Math.abs(totalSignedVol6) / 6;
  if (absVolMm3 < 1e-4) {
    // Fallback to thin-shell bounding estimate if degenerate/open sheet
    const box = new THREE.Box3().setFromObject(mesh);
    const sz = new THREE.Vector3();
    const ctr = new THREE.Vector3();
    box.getSize(sz).multiplyScalar(SCENE_TO_MM);
    box.getCenter(ctr).multiplyScalar(SCENE_TO_MM);
    const approxVolCm3 = Math.max(0.01, sz.x * sz.y * sz.z * 0.25 * MM3_TO_CM3);
    return {
      volumeCm3: approxVolCm3,
      centroidWorldMm: [ctr.x, ctr.y, ctr.z],
    };
  }

  const inv = 1 / (4 * totalSignedVol6);
  return {
    volumeCm3: absVolMm3 * MM3_TO_CM3,
    centroidWorldMm: [
      refWorld.x + cxSum * inv,
      refWorld.y + cySum * inv,
      refWorld.z + czSum * inv,
    ],
  };
}

/**
 * Andrew's Monotone Chain 2D Convex Hull on XZ points (returns CCW hull vertices).
 */
export function computeConvexHull2D(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;

  // Deduplicate on 0.5 mm grid for stability and speed
  const seen = new Set<string>();
  const uniq: [number, number][] = [];
  for (const [x, z] of points) {
    const key = `${Math.round(x * 2)}_${Math.round(z * 2)}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniq.push([x, z]);
    }
  }
  if (uniq.length <= 2) return uniq;

  uniq.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Signed distance (mm) from 2D point (px, pz) to a CCW convex polygon.
 * Positive = strictly inside polygon (distance to nearest tip-over edge).
 * Negative = outside polygon (negative distance to nearest edge).
 */
export function computePointToConvexPolygonMarginMm(
  px: number,
  pz: number,
  hull: [number, number][]
): number {
  if (hull.length < 3) return 0;

  let inside = true;
  let minEdgeDist = Infinity;

  for (let i = 0; i < hull.length; i++) {
    const [ax, az] = hull[i];
    const [bx, bz] = hull[(i + 1) % hull.length];
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez);
    if (len < 1e-6) continue;

    // For CCW polygon, inward normal is (-ez/len, ex/len)
    const crossVal = ex * (pz - az) - ez * (px - ax);
    if (crossVal < 0) inside = false;

    // Distance from point to segment AB
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (len * len)));
    const projX = ax + t * ex;
    const projZ = az + t * ez;
    const d = Math.hypot(px - projX, pz - projZ);
    if (d < minEdgeDist) minEdgeDist = d;
  }

  if (!Number.isFinite(minEdgeDist)) return 0;
  return inside ? minEdgeDist : -minEdgeDist;
}

/**
 * Computes exact assembly mass properties, 3D Center of Gravity, XZ floor support polygon,
 * and static tip-over stability margin across all parts.
 */
export function computeAssemblyMassProperties(
  parts: BlueprintPart[],
  partMeshes: THREE.Mesh[]
): AssemblyMassProperties {
  const meshById = new Map<string, THREE.Mesh>();
  for (const m of partMeshes) {
    const pid = m.userData?.partId as string | undefined;
    if (pid) meshById.set(pid, m);
  }

  let totalMassKg = 0;
  let totalVolumeCm3 = 0;
  let cogXSum = 0;
  let cogYSum = 0;
  let cogZSum = 0;

  let minYMm = Infinity;
  let maxYMm = -Infinity;

  const partProps: PartMassProperty[] = [];
  const tempBox = new THREE.Box3();

  for (const part of parts) {
    const mesh = meshById.get(part.id);
    if (!mesh) continue;

    tempBox.setFromObject(mesh);
    if (!tempBox.isEmpty()) {
      minYMm = Math.min(minYMm, tempBox.min.y * SCENE_TO_MM);
      maxYMm = Math.max(maxYMm, tempBox.max.y * SCENE_TO_MM);
    }

    const density = inferMaterialDensityGPerCm3(part.material);
    const { volumeCm3, centroidWorldMm } = computeMeshVolumeAndCentroidMm(mesh);
    const massKg = (volumeCm3 * density) / 1000;

    totalVolumeCm3 += volumeCm3;
    totalMassKg += massKg;
    cogXSum += massKg * centroidWorldMm[0];
    cogYSum += massKg * centroidWorldMm[1];
    cogZSum += massKg * centroidWorldMm[2];

    partProps.push({
      partId: part.id,
      partName: part.name,
      group: part.group,
      finishName: part.material.finishName,
      densityGPerCm3: density,
      volumeCm3: Number(volumeCm3.toFixed(2)),
      massKg: Number(massKg.toFixed(4)),
      centerOfGravityMm: [
        Number(centroidWorldMm[0].toFixed(1)),
        Number(centroidWorldMm[1].toFixed(1)),
        Number(centroidWorldMm[2].toFixed(1)),
      ],
    });
  }

  const floorYMm = Number.isFinite(minYMm) ? minYMm : 0;
  const heightMm = Number.isFinite(maxYMm) ? Math.max(1, maxYMm - floorYMm) : 100;

  const cogMm: [number, number, number] =
    totalMassKg > 1e-6
      ? [
          Number((cogXSum / totalMassKg).toFixed(1)),
          Number((cogYSum / totalMassKg).toFixed(1)),
          Number((cogZSum / totalMassKg).toFixed(1)),
        ]
      : [0, Number((heightMm * 0.5).toFixed(1)), 0];

  // Collect floor-contacting XZ points (within 14 mm of assembly lowest Y)
  const floorBandMm = Math.min(18, Math.max(8, heightMm * 0.035));
  const floorThresholdY = floorYMm + floorBandMm;
  const contactPtsXZ: [number, number][] = [];
  const v = new THREE.Vector3();

  for (const mesh of partMeshes) {
    tempBox.setFromObject(mesh);
    if (tempBox.isEmpty() || tempBox.min.y * SCENE_TO_MM > floorThresholdY) continue;

    const posAttr = mesh.geometry.attributes.position;
    if (!posAttr) continue;
    const step = Math.max(1, Math.floor(posAttr.count / 360));
    const m = mesh.matrixWorld;
    for (let i = 0; i < posAttr.count; i += step) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(m).multiplyScalar(SCENE_TO_MM);
      if (v.y <= floorThresholdY) {
        contactPtsXZ.push([v.x, v.z]);
      }
    }
  }

  const supportHull = computeConvexHull2D(contactPtsXZ).map(
    ([x, z]) => [Number(x.toFixed(1)), Number(z.toFixed(1))] as [number, number]
  );

  const stabilityMarginMm =
    supportHull.length >= 3
      ? Number(computePointToConvexPolygonMarginMm(cogMm[0], cogMm[2], supportHull).toFixed(1))
      : 0;

  const stabilityStatus: AssemblyMassProperties['stabilityStatus'] =
    stabilityMarginMm >= 15
      ? 'stable'
      : stabilityMarginMm >= 0
        ? 'marginal'
        : 'unstable';

  const topHeavinessRatio = Number(
    Math.max(0, Math.min(1, (cogMm[1] - floorYMm) / heightMm)).toFixed(3)
  );

  // Sort parts heaviest-first for quick engineering inspection
  partProps.sort((a, b) => b.massKg - a.massKg);

  return {
    totalMassKg: Number(totalMassKg.toFixed(3)),
    totalVolumeCm3: Number(totalVolumeCm3.toFixed(1)),
    centerOfGravityMm: cogMm,
    supportPolygonXZMm: supportHull,
    stabilityMarginMm,
    stabilityStatus,
    topHeavinessRatio,
    floorYMm: Number(floorYMm.toFixed(1)),
    parts: partProps,
  };
}
