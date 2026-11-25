import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';
import {
  BlueprintPart,
  CompiledInterfaceRecord,
  ConstraintSolveEntry,
  CsgNodeSpec,
  DynamicClashIssue,
  FloatingPartIssue,
  GeometryAuditReport,
  GeometryClashIssue,
  OccludedPartIssue,
  SolvedJointRecord,
  UnblendedCsgSeamIssue,
} from '../types/blueprint';
import {
  buildPartWorldManifold,
  computeExactManifoldOverlap,
  isManifoldReady,
} from './manifoldKernel';
import { makePairKey } from './assemblyCompiler';
import {
  auditCurvedSurfaceMounts,
  computeBidirectionalSurfaceGapMm,
  isSculptedCurvedHost,
  WorldMeshTriangles,
} from './surfaceBlend';

const BLENDED_PROCESSES = new Set(['forged', 'cast', 'molded']);
const REVOLVED_OPS = new Set(['revolve', 'cylinder', 'sphere', 'turnedShaft']);
const PRISMATIC_OPS = new Set(['box', 'polygonExtrude', 'machinedBlock', 'sheetMetal', 'sheetMetalFold']);
const SWEPT_LOFTED_OPS = new Set(['sweep', 'curvedLoft', 'superellipseLoft', 'sculptedProfile', 'filletedJunction']);

function classifyPrimitiveFamily(op: string): 'revolved' | 'prismatic' | 'swept_lofted' | null {
  if (REVOLVED_OPS.has(op)) return 'revolved';
  if (PRISMATIC_OPS.has(op)) return 'prismatic';
  if (SWEPT_LOFTED_OPS.has(op)) return 'swept_lofted';
  return null;
}

function collectImmediateFamilies(node: CsgNodeSpec, out: Set<string>): void {
  const fam = classifyPrimitiveFamily(node.op);
  if (fam) {
    out.add(fam);
    return;
  }
  if (node.op === 'subtract' || node.op === 'intersect') {
    if (node.children && node.children.length > 0) {
      collectImmediateFamilies(node.children[0], out);
    }
    return;
  }
  if (node.op === 'union' && node.children) {
    for (const c of node.children) collectImmediateFamilies(c, out);
  }
}

/**
 * SOT Rule GB-04 (`Setups/rules/geometry_blending.json`):
 * Flags raw C0 `union` nodes combining dissimilar geometry families (revolved vs prismatic vs swept/lofted)
 * on forged, cast, or molded parts unless explicitly marked `intentionalSharpSeam: true` or bridged via
 * `smoothUnion` / `filletedJunction`.
 */
export function auditUnblendedCsgSeams(parts: BlueprintPart[]): UnblendedCsgSeamIssue[] {
  const issues: UnblendedCsgSeamIssue[] = [];

  for (const part of parts) {
    if (part.geometry?.kind !== 'csgSolid' || !part.geometry.csgRoot) continue;
    const inferredProcess =
      part.manufacturingProcess ||
      (/\b(forged|cast|casting|molded|moulded|die[- ]?cast)\b/i.test(`${part.name} ${part.notes || ''}`)
        ? 'forged'
        : undefined);
    if (!inferredProcess || !BLENDED_PROCESSES.has(inferredProcess)) continue;

    const visit = (node: CsgNodeSpec): void => {
      if (node.op === 'union' && !node.intentionalSharpSeam && Array.isArray(node.children) && node.children.length >= 2) {
        const fams = new Set<string>();
        for (const child of node.children) {
          collectImmediateFamilies(child, fams);
        }
        if (fams.size >= 2) {
          const famList = Array.from(fams).sort();
          issues.push({
            partId: part.id,
            partName: part.name,
            process: inferredProcess,
            families: famList,
            reason: `SOT GB-04: raw C0 union mixes [${famList.join(' + ')}] on ${inferredProcess} part — use smoothUnion (filletRadiusMm) or single-spine curvedLoft + subtractive flats.`,
          });
          return;
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child);
      }
    };

    visit(part.geometry.csgRoot);
  }

  return issues;
}

const SCENE_TO_MM = 1000;
const MM_TO_SCENE = 0.001;

interface PartSpatialRecord {
  part: BlueprintPart;
  mesh: THREE.Mesh;
  worldBox: THREE.Box3;
  sizeMm: [number, number, number];
  volumeCm3: number;
  isCurvedOrHollow: boolean;
}

/**
 * Computes minimum Euclidean gap in millimeters between two 3D bounding boxes (0 if touching/overlapping).
 */
function boxGapMm(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * SCENE_TO_MM;
}

const _probeMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const _probeMesh = new THREE.Mesh(new THREE.BufferGeometry(), _probeMat);
const _raycaster = new THREE.Raycaster();
const _rayDir = new THREE.Vector3(0.57735027, 0.57735027, 0.57735027);
const _sampleWorld = new THREE.Vector3();

/**
 * Fallback exact 3D DoubleSide ray-triangle parity test for legacy non-manifold meshes.
 */
function isPointInsideMeshWorld(pointWorld: THREE.Vector3, target: PartSpatialRecord): boolean {
  if (!target.worldBox.containsPoint(pointWorld)) return false;
  _probeMesh.geometry = target.mesh.geometry;
  _probeMesh.matrixWorld.copy(target.mesh.matrixWorld);
  _probeMesh.matrixAutoUpdate = false;
  _raycaster.set(pointWorld, _rayDir);
  const hits = _raycaster.intersectObject(_probeMesh, false);
  let uniqueHits = 0;
  let lastDist = -1;
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].distance < 0.002) continue;
    if (Math.abs(hits[i].distance - lastDist) > 0.00025) {
      uniqueHits++;
      lastDist = hits[i].distance;
    }
  }
  return uniqueHits % 2 === 1;
}

function estimateTruePenetrationRatio(
  a: PartSpatialRecord,
  b: PartSpatialRecord,
  interBox: THREE.Box3
): number {
  const posAttr = a.mesh.geometry.attributes.position;
  if (!posAttr || posAttr.count === 0) return 0;

  const shrunk = interBox.clone();
  shrunk.min.addScalar(0.0045);
  shrunk.max.subScalar(0.0045);
  if (shrunk.isEmpty()) return 0;

  const step = Math.max(1, Math.floor(posAttr.count / 2400));
  let candidates = 0;
  let inside = 0;

  for (let i = 0; i < posAttr.count; i += step) {
    _sampleWorld.fromBufferAttribute(posAttr, i).applyMatrix4(a.mesh.matrixWorld);
    if (!shrunk.containsPoint(_sampleWorld)) continue;
    candidates++;
    if (isPointInsideMeshWorld(_sampleWorld, b)) {
      inside++;
    }
    if (candidates >= 40) break;
  }

  if (candidates === 0) return 0;
  return inside / Math.max(candidates, 12);
}

/**
 * Computes a world-space AABB for a mesh transformed by a delta rigid-body matrix.
 */
function computeTransformedWorldBox(
  mesh: THREE.Mesh,
  deltaMatrix: THREE.Matrix4
): THREE.Box3 {
  const localBox = mesh.geometry.boundingBox;
  if (!localBox) return new THREE.Box3();
  const posedWorld = new THREE.Matrix4().multiplyMatrices(deltaMatrix, mesh.matrixWorld);
  const corners = [
    new THREE.Vector3(localBox.min.x, localBox.min.y, localBox.min.z),
    new THREE.Vector3(localBox.min.x, localBox.min.y, localBox.max.z),
    new THREE.Vector3(localBox.min.x, localBox.max.y, localBox.min.z),
    new THREE.Vector3(localBox.min.x, localBox.max.y, localBox.max.z),
    new THREE.Vector3(localBox.max.x, localBox.min.y, localBox.min.z),
    new THREE.Vector3(localBox.max.x, localBox.min.y, localBox.max.z),
    new THREE.Vector3(localBox.max.x, localBox.max.y, localBox.min.z),
    new THREE.Vector3(localBox.max.x, localBox.max.y, localBox.max.z),
  ];
  const out = new THREE.Box3();
  for (const c of corners) {
    c.applyMatrix4(posedWorld);
    out.expandByPoint(c);
  }
  return out;
}

export interface GeometryAuditOptions {
  compiledInterfaces?: CompiledInterfaceRecord[];
  fitExemptPairs?: Set<string>;
  loadPathEdges?: [string, string][];
}

/**
 * Runs a full deterministic fit-aware & motion-swept 3D geometry audit:
 *  1. Exact C++ WASM Manifold Boolean volume intersection (`solidA.intersect(solidB).volume()`)
 *     on overlapping pairs, with semantic mechanical Fit-Class validation (`fastener`, `bearing`,
 *     `gearMesh`, `weld`) and ray-parity fallback for legacy organic meshes.
 *  2. Full-stroke kinematic motion-sweep collision checking across movable revolute/prismatic joints.
 *  3. Structural load-path graph (floor anchors, wall/chassis anchors, contact edges, and compiled
 *     interface/mate edges) to verify zero floating or unsupported components.
 */
export function runGeometryAudit(
  compiledParts: BlueprintPart[],
  partMeshes: THREE.Mesh[],
  solvedConstraints: ConstraintSolveEntry[],
  joints: SolvedJointRecord[],
  watertightCsgCount: number,
  options?: GeometryAuditOptions
): GeometryAuditReport {
  const partById = new Map<string, BlueprintPart>();
  for (const p of compiledParts) {
    partById.set(p.id, p);
  }

  const fitExemptPairs = options?.fitExemptPairs ?? new Set<string>();
  const compiledInterfaces = options?.compiledInterfaces ?? [];
  const loadPathEdges = options?.loadPathEdges ?? [];
  const manifoldActive = isManifoldReady();

  const records: PartSpatialRecord[] = [];
  const indexByPartId = new Map<string, number>();

  for (const mesh of partMeshes) {
    if (!mesh.visible) continue;
    const pid = mesh.userData.partId as string;
    const part = partById.get(pid);
    if (!part) continue;

    mesh.updateMatrixWorld(true);
    mesh.geometry.computeBoundingBox();
    const worldBox = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    worldBox.getSize(size);
    const sizeMm: [number, number, number] = [
      size.x * SCENE_TO_MM,
      size.y * SCENE_TO_MM,
      size.z * SCENE_TO_MM,
    ];
    const volumeCm3 = (sizeMm[0] * sizeMm[1] * sizeMm[2]) / 1000;
    const isCurvedOrHollow =
      part.geometry.kind === 'tubePath' ||
      part.geometry.kind === 'taperedTube' ||
      part.geometry.kind === 'hollowBox' ||
      part.geometry.kind === 'torus' ||
      part.geometry.kind === 'csgSolid' ||
      part.geometry.kind === 'staircase' ||
      part.geometry.kind === 'dragChain';

    indexByPartId.set(pid, records.length);
    records.push({
      part,
      mesh,
      worldBox,
      sizeMm,
      volumeCm3,
      isCurvedOrHollow,
    });
  }

  const CONTACT_TOLERANCE_MM = 8.0;
  const GROUND_TOLERANCE_MM = 16.0;
  const n = records.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const groundedIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    const rec = records[i];
    const minYMm = rec.worldBox.min.y * SCENE_TO_MM;
    if (
      minYMm <= GROUND_TOLERANCE_MM ||
      rec.part.anchorKind === 'floor' ||
      rec.part.anchorKind === 'wall' ||
      rec.part.anchorKind === 'chassis'
    ) {
      groundedIndices.push(i);
    }
  }

  // Add compiled mechanical load-path edges (bolted joints, bearings, coped welds, gear meshes)
  for (const [idA, idB] of loadPathEdges) {
    const ia = indexByPartId.get(idA);
    const ib = indexByPartId.get(idB);
    if (ia !== undefined && ib !== undefined && ia !== ib) {
      adj[ia].push(ib);
      adj[ib].push(ia);
    }
  }

  // Add kinematic mate parent-child edges to structural load-path graph
  for (const j of joints) {
    const ip = indexByPartId.get(j.parentPartId);
    const ic = indexByPartId.get(j.childPartId);
    if (ip !== undefined && ic !== undefined && ip !== ic) {
      adj[ip].push(ic);
      adj[ic].push(ip);
    }
  }

  const clashes: GeometryClashIssue[] = [];
  const dynamicClashes: DynamicClashIssue[] = [];
  let seatingContactCount = 0;
  let verifiedFitCount = 0;
  let motionSweepPosesChecked = 0;

  // Lazy world-space Manifold solid cache (freed deterministically in finally block)
  const manifoldCache = new Map<string, Manifold | null>();
  const getWorldManifold = (rec: PartSpatialRecord): Manifold | null => {
    if (!manifoldActive) return null;
    if (manifoldCache.has(rec.part.id)) {
      return manifoldCache.get(rec.part.id) ?? null;
    }
    const solid = buildPartWorldManifold(rec.part, rec.mesh.matrixWorld, 'standard');
    manifoldCache.set(rec.part.id, solid);
    return solid;
  };

  const interBox = new THREE.Box3();
  const interSize = new THREE.Vector3();
  const interCenter = new THREE.Vector3();
  const sculptedHostFlags = records.map((r) => isSculptedCurvedHost(r));
  const surfaceTriCache = new Map<string, WorldMeshTriangles | null>();

  try {
    // 1. Static Fit-Aware Exact Boolean Clash Check + True-Surface Spatial Contact Graph
    for (let i = 0; i < n; i++) {
      const a = records[i];
      for (let j = i + 1; j < n; j++) {
        const b = records[j];
        const gap = boxGapMm(a.worldBox, b.worldBox);

        if (gap <= CONTACT_TOLERANCE_MM) {
          let trueContact = true;
          const pairKeyPre = makePairKey(a.part.id, b.part.id);
          const isExemptOrFastener =
            fitExemptPairs.has(pairKeyPre) ||
            a.part.fitClass === 'fastener' ||
            b.part.fitClass === 'fastener' ||
            a.part.fitClass === 'bearing' ||
            b.part.fitClass === 'bearing' ||
            a.part.fitClass === 'weld' ||
            b.part.fitClass === 'weld';
          // Defeat AABB Contact Illusion on sculpted CSG hosts: verify real triangle-surface contact
          if (!isExemptOrFastener) {
            if (
              sculptedHostFlags[i] &&
              a.part.geometry.kind === 'csgSolid' &&
              a.volumeCm3 >= b.volumeCm3 * 3.0
            ) {
              trueContact = computeBidirectionalSurfaceGapMm(b, a, surfaceTriCache) <= 3.2;
            } else if (
              sculptedHostFlags[j] &&
              b.part.geometry.kind === 'csgSolid' &&
              b.volumeCm3 >= a.volumeCm3 * 3.0
            ) {
              trueContact = computeBidirectionalSurfaceGapMm(a, b, surfaceTriCache) <= 3.2;
            }
          }
          if (trueContact) {
            adj[i].push(j);
            adj[j].push(i);
          }
        }

        if (gap > 0) continue;

        interBox.copy(a.worldBox).intersect(b.worldBox);
        if (interBox.isEmpty()) continue;

        interBox.getSize(interSize);
        const oxMm = interSize.x * SCENE_TO_MM;
        const oyMm = interSize.y * SCENE_TO_MM;
        const ozMm = interSize.z * SCENE_TO_MM;
        const minPenMm = Math.min(oxMm, oyMm, ozMm);
        const overlapVolCm3 = (oxMm * oyMm * ozMm) / 1000;

        if (minPenMm < 4.0) {
          seatingContactCount++;
          continue;
        }

        // Semantic Mechanical Fit-Class & Interface Contract validation
        const pairKey = makePairKey(a.part.id, b.part.id);
        const fitA = a.part.fitClass ?? 'standard';
        const fitB = b.part.fitClass ?? 'standard';
        if (
          fitExemptPairs.has(pairKey) ||
          fitA === 'fastener' ||
          fitB === 'fastener' ||
          fitA === 'bearing' ||
          fitB === 'bearing' ||
          fitA === 'weld' ||
          fitB === 'weld' ||
          (fitA === 'gearMesh' && fitB === 'gearMesh')
        ) {
          verifiedFitCount++;
          seatingContactCount++;
          continue;
        }

        const roleA = a.part.role ?? 'primary';
        const roleB = b.part.role ?? 'primary';
        const bothPrimary = roleA === 'primary' && roleB === 'primary';
        const sameGroup = a.part.group === b.part.group;

        if (!bothPrimary || sameGroup) {
          seatingContactCount++;
          continue;
        }

        // Primary-vs-Primary across different groups: run EXACT C++ WASM Manifold Boolean intersection!
        const solidA = getWorldManifold(a);
        const solidB = getWorldManifold(b);

        if (solidA && solidB) {
          const exact = computeExactManifoldOverlap(solidA, solidB);
          // Ignore zero-volume air-gap AABB overlaps & tiny (< 4.5 mm / < 1.2 cm³) flush weld fillets
          if (exact.volumeCm3 < 1.2 || exact.minPenMm < 4.5) {
            seatingContactCount++;
            continue;
          }

          const minPartVol = Math.max(1, Math.min(a.volumeCm3, b.volumeCm3));
          const exactFrac = exact.volumeCm3 / minPartVol;
          clashes.push({
            id: `${a.part.id}__${b.part.id}`,
            partAId: a.part.id,
            partAName: a.part.name,
            partBId: b.part.id,
            partBName: b.part.name,
            overlapVolumeCm3: Math.round(exact.volumeCm3 * 10) / 10,
            penetrationMm: Math.round(exact.minPenMm * 10) / 10,
            severity: exact.volumeCm3 > 12 || (exactFrac > 0.08 && exact.minPenMm > 14) ? 'clash' : 'warning',
            centerMm: [
              Math.round(exact.centerMm[0] * 10) / 10,
              Math.round(exact.centerMm[1] * 10) / 10,
              Math.round(exact.centerMm[2] * 10) / 10,
            ],
            verificationMethod: 'exactBoolean',
          });
          continue;
        }

        // Fallback ray-parity check for non-manifold legacy geometry
        if (a.isCurvedOrHollow || b.isCurvedOrHollow) {
          const penAB = estimateTruePenetrationRatio(a, b, interBox);
          const penBA = estimateTruePenetrationRatio(b, a, interBox);
          if (Math.max(penAB, penBA) < 0.14) {
            seatingContactCount++;
            continue;
          }
        }

        const minPartVol = Math.max(1, Math.min(a.volumeCm3, b.volumeCm3));
        const overlapFraction = overlapVolCm3 / minPartVol;
        if (overlapFraction < 0.04 || minPenMm < 12) {
          seatingContactCount++;
          continue;
        }

        interBox.getCenter(interCenter);
        clashes.push({
          id: `${a.part.id}__${b.part.id}`,
          partAId: a.part.id,
          partAName: a.part.name,
          partBId: b.part.id,
          partBName: b.part.name,
          overlapVolumeCm3: Math.round(overlapVolCm3 * 10) / 10,
          penetrationMm: Math.round(minPenMm * 10) / 10,
          severity: overlapFraction > 0.15 && minPenMm > 22 ? 'clash' : 'warning',
          centerMm: [
            Math.round(interCenter.x * SCENE_TO_MM * 10) / 10,
            Math.round(interCenter.y * SCENE_TO_MM * 10) / 10,
            Math.round(interCenter.z * SCENE_TO_MM * 10) / 10,
          ],
          verificationMethod: a.isCurvedOrHollow || b.isCurvedOrHollow ? 'rayParity' : 'aabb',
        });
      }
    }

    // 2. Full-Stroke Kinematic Motion-Sweep Collision Audit across movable joints
    const movableJoints = joints.filter((j) => j.jointKind !== 'fixed');
    const seenDynamicKeys = new Set<string>();

    for (const joint of movableJoints) {
      const chainSet = new Set(joint.chainPartIds);
      const movingRecords = joint.chainPartIds
        .map((pid) => {
          const idx = indexByPartId.get(pid);
          return idx !== undefined ? records[idx] : undefined;
        })
        .filter((r): r is PartSpatialRecord => Boolean(r && (r.part.role ?? 'primary') !== 'detail'));

      if (movingRecords.length === 0) continue;

      const anchor = new THREE.Vector3(
        joint.anchorWorldMm[0] * MM_TO_SCENE,
        joint.anchorWorldMm[1] * MM_TO_SCENE,
        joint.anchorWorldMm[2] * MM_TO_SCENE
      );
      const axis = new THREE.Vector3(
        joint.axisWorld[0],
        joint.axisWorld[1],
        joint.axisWorld[2]
      ).normalize();

      const poses: { angleDeg: number; slideMm: number; label: string }[] = [];
      if (joint.jointKind === 'revolute' || joint.jointKind === 'cylindrical') {
        const minA = joint.motionLimits?.minAngleDeg ?? -90;
        const maxA = joint.motionLimits?.maxAngleDeg ?? 90;
        poses.push(
          { angleDeg: minA, slideMm: 0, label: `${Math.round(minA)}°` },
          { angleDeg: minA * 0.5, slideMm: 0, label: `${Math.round(minA * 0.5)}°` },
          { angleDeg: maxA * 0.5, slideMm: 0, label: `+${Math.round(maxA * 0.5)}°` },
          { angleDeg: maxA, slideMm: 0, label: `+${Math.round(maxA)}°` }
        );
      } else if (joint.jointKind === 'prismatic') {
        const minS = joint.motionLimits?.minSlideMm ?? -40;
        const maxS = joint.motionLimits?.maxSlideMm ?? 40;
        poses.push(
          { angleDeg: 0, slideMm: minS, label: `${Math.round(minS)} mm` },
          { angleDeg: 0, slideMm: maxS, label: `+${Math.round(maxS)} mm` }
        );
      }

      const toOrigin = new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z);
      const fromOrigin = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z);

      for (const pose of poses) {
        motionSweepPosesChecked++;
        const rotM = new THREE.Matrix4().makeRotationAxis(
          axis,
          THREE.MathUtils.degToRad(pose.angleDeg)
        );
        const slideM = new THREE.Matrix4().makeTranslation(
          axis.x * pose.slideMm * MM_TO_SCENE,
          axis.y * pose.slideMm * MM_TO_SCENE,
          axis.z * pose.slideMm * MM_TO_SCENE
        );
        const deltaM = new THREE.Matrix4()
          .multiplyMatrices(slideM, fromOrigin)
          .multiply(rotM)
          .multiply(toOrigin);

        for (const mov of movingRecords) {
          const posedBox = computeTransformedWorldBox(mov.mesh, deltaM);
          let posedManifold: Manifold | null | undefined = undefined;

          try {
            for (const obs of records) {
              if (chainSet.has(obs.part.id)) continue;
              if ((obs.part.role ?? 'primary') !== 'primary') continue;
              if (obs.part.group === mov.part.group) continue;
              const pairKey = makePairKey(mov.part.id, obs.part.id);
              if (fitExemptPairs.has(pairKey)) continue;
              if (
                obs.part.fitClass === 'bearing' ||
                obs.part.fitClass === 'fastener' ||
                (mov.part.fitClass === 'gearMesh' && obs.part.fitClass === 'gearMesh')
              ) {
                continue;
              }
              if (boxGapMm(posedBox, obs.worldBox) > 0) continue;

              const dynKey = `${joint.id}::${mov.part.id}::${obs.part.id}`;
              if (seenDynamicKeys.has(dynKey)) continue;

              // Confirm dynamic clash via exact Manifold Boolean intersection!
              if (manifoldActive) {
                if (posedManifold === undefined) {
                  const posedWorld = new THREE.Matrix4().multiplyMatrices(
                    deltaM,
                    mov.mesh.matrixWorld
                  );
                  posedManifold = buildPartWorldManifold(mov.part, posedWorld, 'standard');
                }
                const obsSolid = getWorldManifold(obs);
                if (posedManifold && obsSolid) {
                  const exact = computeExactManifoldOverlap(posedManifold, obsSolid);
                  if (exact.volumeCm3 >= 1.5 && exact.minPenMm >= 4.5) {
                    seenDynamicKeys.add(dynKey);
                    dynamicClashes.push({
                      id: dynKey,
                      jointId: joint.id,
                      jointLabel: joint.childPartName,
                      poseLabel: pose.label,
                      movingPartId: mov.part.id,
                      movingPartName: mov.part.name,
                      obstaclePartId: obs.part.id,
                      obstaclePartName: obs.part.name,
                      overlapVolumeCm3: Math.round(exact.volumeCm3 * 10) / 10,
                      penetrationMm: Math.round(exact.minPenMm * 10) / 10,
                    });
                  }
                }
              }
            }
          } finally {
            if (posedManifold) posedManifold.delete();
          }
        }
      }
    }

    // 2c. Buried / Occluded Exterior Detail Detection (catches logos, buttons, bezels, or trim
    // accidentally swallowed inside a thicker primary housing before Build 1 is ever presented).
    const INTERNAL_PART_RE =
      /internal|stator|rotor|core|bearing|shaft|pin|bushing|washer|bolt|nut|screw|gear|spacer|spring|seal|gasket|sleeve|liner|rod|piston/i;
    const occludedParts: OccludedPartIssue[] = [];
    if (manifoldActive) {
      for (let i = 0; i < n; i++) {
        const rec = records[i];
        const role = rec.part.role ?? 'primary';
        if (role === 'primary') continue;
        if (
          rec.part.fitClass === 'fastener' ||
          rec.part.fitClass === 'bearing' ||
          rec.part.fitClass === 'gearMesh'
        ) {
          continue;
        }
        if (INTERNAL_PART_RE.test(rec.part.id) || INTERNAL_PART_RE.test(rec.part.name)) continue;
        const partSolid = getWorldManifold(rec);
        if (!partSolid) continue;
        const partVol = Math.abs(partSolid.volume());
        if (partVol <= 1e-4) continue;

        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const occ = records[j];
          if ((occ.part.role ?? 'primary') !== 'primary') continue;
          if (occ.isCurvedOrHollow) continue;
          if (boxGapMm(rec.worldBox, occ.worldBox) > 0) continue;
          // Quick AABB containment pre-check (within 0.2 mm margin)
          const eps = 0.0002;
          if (
            rec.worldBox.min.x < occ.worldBox.min.x - eps ||
            rec.worldBox.max.x > occ.worldBox.max.x + eps ||
            rec.worldBox.min.y < occ.worldBox.min.y - eps ||
            rec.worldBox.max.y > occ.worldBox.max.y + eps ||
            rec.worldBox.min.z < occ.worldBox.min.z - eps ||
            rec.worldBox.max.z > occ.worldBox.max.z + eps
          ) {
            continue;
          }
          const occSolid = getWorldManifold(occ);
          if (!occSolid) continue;
          const inter = partSolid.intersect(occSolid);
          const interVol = Math.abs(inter.volume());
          inter.delete();
          const buriedRatio = interVol / partVol;
          if (buriedRatio >= 0.98) {
            occludedParts.push({
              partId: rec.part.id,
              partName: rec.part.name,
              group: rec.part.group,
              occluderPartId: occ.part.id,
              occluderPartName: occ.part.name,
              buriedRatioPct: Math.min(100, Math.round(buriedRatio * 1000) / 10),
            });
            break;
          }
        }
      }
    }

    // 3. Structural Load-Path BFS from grounded & wall/chassis-anchored components
    const connected = new Uint8Array(n);
    const queue: number[] = [...groundedIndices];
    for (const idx of groundedIndices) {
      connected[idx] = 1;
    }

    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const nxt of adj[cur]) {
        if (!connected[nxt]) {
          connected[nxt] = 1;
          queue.push(nxt);
        }
      }
    }

    const floatingParts: FloatingPartIssue[] = [];
    let connectedCount = 0;
    for (let i = 0; i < n; i++) {
      if (connected[i]) {
        connectedCount++;
        continue;
      }
      const rec = records[i];
      let bestGap = Infinity;
      let nearestName: string | null = null;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const g = boxGapMm(rec.worldBox, records[j].worldBox);
        if (g < bestGap) {
          bestGap = g;
          nearestName = records[j].part.name;
        }
      }
      floatingParts.push({
        partId: rec.part.id,
        partName: rec.part.name,
        group: rec.part.group,
        minYMm: Math.round(rec.worldBox.min.y * SCENE_TO_MM * 10) / 10,
        nearestPartName: nearestName,
        gapMm: Number.isFinite(bestGap) ? Math.round(bestGap * 10) / 10 : 0,
      });
    }

    // 3b. True Triangle-Surface Curved-Host Mount & Rim-Skew Audit
    // Defeats the AABB contact illusion where a sensor pod, LiDAR dome, or GPS cap sits inside
    // a curved host's AABB corner void while hovering in air or tilted at the wrong slope sign.
    const jointPartIds = new Set<string>();
    for (const j of joints) {
      jointPartIds.add(j.childPartId);
    }
    const unblendedMounts = auditCurvedSurfaceMounts(records, {
      fitExemptPairs,
      makePairKey,
      jointPartIds,
    });

    // 3c. SOT Rule GB-04: Audit raw C0 CSG unions across dissimilar primitive families
    // on forged/cast/molded parts (recommends smoothUnion or filletedJunction).
    const unblendedCsgSeams = auditUnblendedCsgSeams(records.map((r) => r.part));

    clashes.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'clash' ? -1 : 1;
      return b.overlapVolumeCm3 - a.overlapVolumeCm3;
    });

    // 4. Deterministic Health Score (0-100)
    const hardClashes = clashes.filter((c) => c.severity === 'clash').length;
    const warnings = clashes.filter((c) => c.severity === 'warning').length;
    const conflictingMateCount = solvedConstraints.filter((c) => c.status === 'conflicting').length;
    const underConstrainedMateCount = solvedConstraints.filter(
      (c) => c.status === 'underConstrained'
    ).length;
    const unresolvedConstraints = solvedConstraints.filter((c) => c.status === 'unresolved').length;
    const penalty =
      hardClashes * 12 +
      warnings * 4 +
      dynamicClashes.length * 10 +
      floatingParts.length * 8 +
      occludedParts.length * 6 +
      unblendedMounts.length * 10 +
      conflictingMateCount * 14 +
      unresolvedConstraints * 10;
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));

    return {
      auditedAt: new Date().toISOString(),
      manifoldWasmActive: manifoldActive,
      exactBooleanAuditActive: manifoldActive,
      watertightCsgCount,
      totalPartCount: n,
      groundedCount: groundedIndices.length,
      connectedCount,
      solvedConstraints,
      joints,
      conflictingMateCount,
      underConstrainedMateCount,
      floatingParts: floatingParts.slice(0, 24),
      occludedParts: occludedParts.slice(0, 24),
      unblendedMounts: unblendedMounts.slice(0, 24),
      ...(unblendedCsgSeams.length > 0 ? { unblendedCsgSeams: unblendedCsgSeams.slice(0, 24) } : {}),
      clashes: clashes.slice(0, 24),
      dynamicClashes: dynamicClashes.slice(0, 16),
      motionSweepPosesChecked,
      compiledInterfaces,
      verifiedFitCount,
      seatingContactCount,
      healthScore,
    };
  } finally {
    manifoldCache.forEach((solid) => {
      if (solid) solid.delete();
    });
    manifoldCache.clear();
  }
}
