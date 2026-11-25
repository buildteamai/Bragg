import * as THREE from 'three';
import {
  BlueprintPart,
  ConstraintSolveEntry,
  MateConstraintStatus,
  MateJointKind,
  PartConstraintSpec,
  SolvedJointRecord,
} from '../types/blueprint';

const SCENE_TO_MM = 1000;
const POS_CONFLICT_TOL_MM = 0.35;
const ANG_CONFLICT_TOL_DEG = 0.6;

export interface MeasuredPartBounds {
  minMm: [number, number, number];
  maxMm: [number, number, number];
}

export interface ConstraintSolveResult {
  resolvedPositionsMm: Map<string, [number, number, number]>;
  resolvedRotationsDeg: Map<string, [number, number, number]>;
  entries: ConstraintSolveEntry[];
  joints: SolvedJointRecord[];
}

interface DofLockState {
  tx: number | null;
  ty: number | null;
  tz: number | null;
  rx: number | null;
  ry: number | null;
  rz: number | null;
  axisLockDir: THREE.Vector3 | null;
}

/**
 * Measures the exact oriented bounding box of a BufferGeometry in millimeters
 * after applying the part's Euler rotation (XYZ degrees).
 */
export function measureOrientedBoundsMm(
  geometry: THREE.BufferGeometry,
  rotationDeg: [number, number, number]
): MeasuredPartBounds {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotationDeg[0] || 0),
    THREE.MathUtils.degToRad(rotationDeg[1] || 0),
    THREE.MathUtils.degToRad(rotationDeg[2] || 0),
    'XYZ'
  );
  const rotMat = new THREE.Matrix4().makeRotationFromEuler(euler);

  geometry.computeBoundingBox();
  const posAttr = geometry.attributes.position;
  if (!posAttr || posAttr.count === 0) {
    return { minMm: [-10, -10, -10], maxMm: [10, 10, 10] };
  }

  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(rotMat);
    box.expandByPoint(v);
  }

  return {
    minMm: [box.min.x * SCENE_TO_MM, box.min.y * SCENE_TO_MM, box.min.z * SCENE_TO_MM],
    maxMm: [box.max.x * SCENE_TO_MM, box.max.y * SCENE_TO_MM, box.max.z * SCENE_TO_MM],
  };
}

function getAllMatesForPart(part: BlueprintPart): PartConstraintSpec[] {
  const list: PartConstraintSpec[] = [];
  if (part.constraint) list.push(part.constraint);
  if (Array.isArray(part.mates)) {
    for (const m of part.mates) {
      if (m) list.push(m);
    }
  }
  return list;
}

function eulerFromDeg(rotDeg: [number, number, number]): THREE.Euler {
  return new THREE.Euler(
    THREE.MathUtils.degToRad(rotDeg[0] || 0),
    THREE.MathUtils.degToRad(rotDeg[1] || 0),
    THREE.MathUtils.degToRad(rotDeg[2] || 0),
    'XYZ'
  );
}

function degFromQuat(q: THREE.Quaternion): [number, number, number] {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [
    round3(THREE.MathUtils.radToDeg(e.x)),
    round3(THREE.MathUtils.radToDeg(e.y)),
    round3(THREE.MathUtils.radToDeg(e.z)),
  ];
}

function rotateVecByDeg(
  vec: [number, number, number],
  rotDeg: [number, number, number]
): THREE.Vector3 {
  return new THREE.Vector3(vec[0], vec[1], vec[2]).applyEuler(eulerFromDeg(rotDeg));
}

function normalizeAngleDeltaDeg(a: number, b: number): number {
  let d = ((a - b + 180) % 360 + 360) % 360 - 180;
  if (d < -180) d += 360;
  return Math.abs(d);
}

function computeFreeDofs(lock: DofLockState, axisLabel?: string): string[] {
  const free: string[] = [];
  if (lock.tx === null) free.push('tx');
  if (lock.ty === null) free.push('ty');
  if (lock.tz === null) free.push('tz');
  if (lock.rx === null) free.push(axisLabel ? `spin_${axisLabel}` : 'rx');
  if (lock.ry === null && !axisLabel) free.push('ry');
  if (lock.rz === null && !axisLabel) free.push('rz');
  return free;
}

function dominantAxisName(dir: THREE.Vector3): 'X' | 'Y' | 'Z' {
  const ax = Math.abs(dir.x);
  const ay = Math.abs(dir.y);
  const az = Math.abs(dir.z);
  if (ax >= ay && ax >= az) return 'X';
  if (ay >= ax && ay >= az) return 'Y';
  return 'Z';
}

/**
 * Multi-link CAD Mate & Kinematic Joint Solver.
 *
 * Capabilities:
 *  - Arbitrary chains of mates (e.g. motor -> coupling -> gearbox -> shaft -> impeller)
 *  - Full engineering mate types: coincident, concentric, offset, angle, sitOnGround, sitOnTopOf, matePort, alignCenter
 *  - Explicit DOF tracking with diagnostic reports for conflicting (over-constrained / cyclic) and under-constrained mates
 *  - Persistent kinematic joint graph (`SolvedJointRecord[]`) with downstream chain propagation for live motion rigging
 */
export function solveAssemblyConstraints(
  parts: BlueprintPart[],
  boundsByPartId: Map<string, MeasuredPartBounds>,
  geometryByPartId?: Map<string, THREE.BufferGeometry>
): ConstraintSolveResult {
  const partMap = new Map<string, BlueprintPart>();
  const resolvedPos = new Map<string, [number, number, number]>();
  const resolvedRot = new Map<string, [number, number, number]>();

  for (const p of parts) {
    partMap.set(p.id, p);
    resolvedPos.set(p.id, [
      Number(p.positionMm?.[0]) || 0,
      Number(p.positionMm?.[1]) || 0,
      Number(p.positionMm?.[2]) || 0,
    ]);
    resolvedRot.set(p.id, [
      Number(p.rotationDeg?.[0]) || 0,
      Number(p.rotationDeg?.[1]) || 0,
      Number(p.rotationDeg?.[2]) || 0,
    ]);
  }

  // Topological sort with explicit cycle detection (never silently breaks circular mates!)
  const state = new Map<string, 'unvisited' | 'visiting' | 'visited'>();
  const order: BlueprintPart[] = [];
  const cyclicPartIds = new Set<string>();

  const visit = (part: BlueprintPart) => {
    const st = state.get(part.id);
    if (st === 'visited') return;
    if (st === 'visiting') {
      cyclicPartIds.add(part.id);
      return;
    }
    state.set(part.id, 'visiting');
    const mates = getAllMatesForPart(part);
    for (const m of mates) {
      if ('targetPartId' in m) {
        const target = partMap.get(m.targetPartId);
        if (target) visit(target);
      }
    }
    state.set(part.id, 'visited');
    order.push(part);
  };

  for (const p of parts) {
    visit(p);
  }

  const entries: ConstraintSolveEntry[] = [];
  const rawJoints: Omit<SolvedJointRecord, 'chainPartIds'>[] = [];
  const childrenByParent = new Map<string, Set<string>>();

  const recordEdge = (parentId: string, childId: string) => {
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, new Set());
    childrenByParent.get(parentId)!.add(childId);
  };

  const getBounds = (partId: string): MeasuredPartBounds | undefined => {
    const geo = geometryByPartId?.get(partId);
    const rot = resolvedRot.get(partId);
    if (geo && rot) {
      return measureOrientedBoundsMm(geo, rot);
    }
    return boundsByPartId.get(partId);
  };

  for (const part of order) {
    const mates = getAllMatesForPart(part);
    if (mates.length === 0) continue;

    if (cyclicPartIds.has(part.id)) {
      entries.push({
        partId: part.id,
        partName: part.name,
        constraintKind: mates[0].kind,
        deltaAppliedMm: [0, 0, 0],
        residualErrorMm: 999,
        status: 'conflicting',
        freeDofs: [],
        conflictDetail: 'Circular mate dependency loop detected in kinematic chain.',
        note: `Circular mate cycle involving ${part.name} — break loop to solve.`,
      });
      continue;
    }

    const origPos = resolvedPos.get(part.id)!;
    const curPos: [number, number, number] = [origPos[0], origPos[1], origPos[2]];
    const curRot: [number, number, number] = [...resolvedRot.get(part.id)!];

    const dofLock: DofLockState = {
      tx: null,
      ty: null,
      tz: null,
      rx: null,
      ry: null,
      rz: null,
      axisLockDir: null,
    };

    const tryLockAxis = (
      axis: 'tx' | 'ty' | 'tz',
      desiredValue: number,
      conflicts: string[]
    ): number => {
      const existing = dofLock[axis];
      if (existing !== null) {
        const diff = Math.abs(existing - desiredValue);
        if (diff > POS_CONFLICT_TOL_MM) {
          conflicts.push(
            `${axis.toUpperCase()} conflict: ${round2(existing)} mm vs ${round2(desiredValue)} mm (Δ${round2(diff)} mm)`
          );
          return diff;
        }
        return diff;
      }
      dofLock[axis] = desiredValue;
      return 0;
    };

    const tryLockAngle = (
      axis: 'rx' | 'ry' | 'rz',
      desiredDeg: number,
      conflicts: string[]
    ): number => {
      const existing = dofLock[axis];
      if (existing !== null) {
        const diff = normalizeAngleDeltaDeg(existing, desiredDeg);
        if (diff > ANG_CONFLICT_TOL_DEG) {
          conflicts.push(
            `${axis.toUpperCase()} angle conflict: ${round1(existing)}° vs ${round1(desiredDeg)}° (Δ${round1(diff)}°)`
          );
          return diff;
        }
        return diff;
      }
      dofLock[axis] = desiredDeg;
      return 0;
    };

    for (let mIdx = 0; mIdx < mates.length; mIdx++) {
      const c = mates[mIdx];
      const conflicts: string[] = [];
      let residualMm = 0;
      let residualAngleDeg = 0;

      if (c.kind === 'sitOnGround') {
        const groundY = c.groundYMm ?? 0;
        const selfBounds = getBounds(part.id);
        if (selfBounds) {
          const desiredY = groundY - selfBounds.minMm[1];
          residualMm = Math.max(residualMm, tryLockAxis('ty', desiredY, conflicts));
          curPos[1] = dofLock.ty ?? desiredY;
        }
        resolvedPos.set(part.id, [...curPos]);
        entries.push({
          partId: part.id,
          partName: part.name,
          constraintKind: c.kind,
          deltaAppliedMm: [
            round3(curPos[0] - origPos[0]),
            round3(curPos[1] - origPos[1]),
            round3(curPos[2] - origPos[2]),
          ],
          residualErrorMm: round3(residualMm),
          status: conflicts.length > 0 ? 'conflicting' : 'solved',
          freeDofs: [],
          conflictDetail: conflicts.join('; ') || undefined,
          note: `Bottom face grounded flush at Y = ${groundY.toFixed(1)} mm`,
        });
        continue;
      }

      const targetPart = partMap.get(c.targetPartId);
      const targetPos = targetPart ? resolvedPos.get(targetPart.id) : undefined;
      const targetRot = targetPart ? resolvedRot.get(targetPart.id) : undefined;
      if (!targetPart || !targetPos || !targetRot) {
        entries.push({
          partId: part.id,
          partName: part.name,
          constraintKind: c.kind,
          targetPartId: c.targetPartId,
          deltaAppliedMm: [0, 0, 0],
          residualErrorMm: 999,
          status: 'unresolved',
          freeDofs: ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'],
          note: `Target part "${c.targetPartId}" not found.`,
        });
        continue;
      }

      if (c.kind === 'sitOnTopOf') {
        const selfBounds = getBounds(part.id);
        const targetBounds = getBounds(targetPart.id);
        if (selfBounds && targetBounds) {
          const offset = c.offsetMm ?? [0, 0, 0];
          const targetTopY = targetPos[1] + targetBounds.maxMm[1];
          const dx = targetPos[0] + offset[0];
          const dy = targetTopY - selfBounds.minMm[1] + offset[1];
          const dz = targetPos[2] + offset[2];

          residualMm = Math.max(
            tryLockAxis('tx', dx, conflicts),
            tryLockAxis('ty', dy, conflicts),
            tryLockAxis('tz', dz, conflicts)
          );
          curPos[0] = dofLock.tx ?? dx;
          curPos[1] = dofLock.ty ?? dy;
          curPos[2] = dofLock.tz ?? dz;
          resolvedPos.set(part.id, [...curPos]);
          recordEdge(targetPart.id, part.id);

          rawJoints.push({
            id: `joint_${part.id}_${mIdx}`,
            label: `${part.name} on ${targetPart.name}`,
            parentPartId: targetPart.id,
            childPartId: part.id,
            childPartName: part.name,
            mateKind: c.kind,
            jointKind: 'fixed',
            anchorWorldMm: [round1(curPos[0]), round1(targetTopY), round1(curPos[2])],
            axisWorld: [0, 1, 0],
            freeDofs: [],
          });

          entries.push({
            partId: part.id,
            partName: part.name,
            constraintKind: c.kind,
            targetPartId: targetPart.id,
            deltaAppliedMm: [
              round3(curPos[0] - origPos[0]),
              round3(curPos[1] - origPos[1]),
              round3(curPos[2] - origPos[2]),
            ],
            residualErrorMm: round3(residualMm),
            status: conflicts.length > 0 ? 'conflicting' : 'solved',
            freeDofs: [],
            conflictDetail: conflicts.join('; ') || undefined,
            note: `Mated flush atop ${targetPart.name} (Y = ${round1(targetTopY + offset[1])} mm)`,
          });
        }
        continue;
      }

      if (c.kind === 'matePort' || c.kind === 'coincident') {
        const selfPortSpec = part.ports?.[c.selfPort];
        const targetPortSpec = targetPart.ports?.[c.targetPort];
        if (!selfPortSpec || !targetPortSpec) {
          entries.push({
            partId: part.id,
            partName: part.name,
            constraintKind: c.kind,
            targetPartId: targetPart.id,
            deltaAppliedMm: [0, 0, 0],
            residualErrorMm: 999,
            status: 'unresolved',
            freeDofs: ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'],
            note: `Missing datum port "${c.selfPort}" or "${c.targetPort}".`,
          });
          continue;
        }

        // For coincident mates with port normals, align orientation quaternion first
        let worldNormal = new THREE.Vector3(0, 1, 0);
        if (c.kind === 'coincident' && selfPortSpec.normal && targetPortSpec.normal) {
          const targetWorldN = rotateVecByDeg(targetPortSpec.normal, targetRot).normalize();
          worldNormal.copy(targetWorldN);
          const desiredSelfWorldN =
            c.flipNormal !== false ? targetWorldN.clone().negate() : targetWorldN.clone();
          const currentSelfWorldN = rotateVecByDeg(selfPortSpec.normal, curRot).normalize();
          const qCur = new THREE.Quaternion().setFromEuler(eulerFromDeg(curRot));
          const qAlign = new THREE.Quaternion().setFromUnitVectors(
            currentSelfWorldN,
            desiredSelfWorldN
          );
          const qNext = qAlign.multiply(qCur);
          const nextRot = degFromQuat(qNext);

          residualAngleDeg = Math.max(
            tryLockAngle('rx', nextRot[0], conflicts),
            tryLockAngle('ry', nextRot[1], conflicts),
            tryLockAngle('rz', nextRot[2], conflicts)
          );
          if (conflicts.length === 0) {
            curRot[0] = nextRot[0];
            curRot[1] = nextRot[1];
            curRot[2] = nextRot[2];
            resolvedRot.set(part.id, [...curRot]);
          }
        }

        const selfWorldPort = rotateVecByDeg(selfPortSpec.localOffsetMm, curRot);
        const targetWorldPort = rotateVecByDeg(targetPortSpec.localOffsetMm, targetRot);
        const offset = c.offsetMm ?? [0, 0, 0];

        const dx = targetPos[0] + targetWorldPort.x - selfWorldPort.x + offset[0];
        const dy = targetPos[1] + targetWorldPort.y - selfWorldPort.y + offset[1];
        const dz = targetPos[2] + targetWorldPort.z - selfWorldPort.z + offset[2];

        residualMm = Math.max(
          tryLockAxis('tx', dx, conflicts),
          tryLockAxis('ty', dy, conflicts),
          tryLockAxis('tz', dz, conflicts)
        );
        curPos[0] = dofLock.tx ?? dx;
        curPos[1] = dofLock.ty ?? dy;
        curPos[2] = dofLock.tz ?? dz;
        resolvedPos.set(part.id, [...curPos]);
        recordEdge(targetPart.id, part.id);

        const jointKind: MateJointKind =
          c.kind === 'coincident' && c.jointKind ? c.jointKind : 'fixed';
        const anchorWorld: [number, number, number] = [
          round1(targetPos[0] + targetWorldPort.x),
          round1(targetPos[1] + targetWorldPort.y),
          round1(targetPos[2] + targetWorldPort.z),
        ];

        const jointFreeDofs =
          jointKind === 'revolute' ? [`spin_${dominantAxisName(worldNormal)}`] : [];

        rawJoints.push({
          id: `joint_${part.id}_${mIdx}`,
          label: `${part.name} ⇄ ${targetPart.name}`,
          parentPartId: targetPart.id,
          childPartId: part.id,
          childPartName: part.name,
          mateKind: c.kind,
          jointKind,
          anchorWorldMm: anchorWorld,
          axisWorld: [round3(worldNormal.x), round3(worldNormal.y), round3(worldNormal.z)],
          freeDofs: jointFreeDofs,
        });

        entries.push({
          partId: part.id,
          partName: part.name,
          constraintKind: c.kind,
          targetPartId: targetPart.id,
          deltaAppliedMm: [
            round3(curPos[0] - origPos[0]),
            round3(curPos[1] - origPos[1]),
            round3(curPos[2] - origPos[2]),
          ],
          residualErrorMm: round3(residualMm),
          residualAngleDeg: round3(residualAngleDeg),
          status:
            conflicts.length > 0
              ? 'conflicting'
              : jointFreeDofs.length > 0
                ? 'underConstrained'
                : 'solved',
          freeDofs: jointFreeDofs,
          conflictDetail: conflicts.join('; ') || undefined,
          note:
            c.kind === 'coincident'
              ? `Coincident mate: ${c.selfPort} flush to ${targetPart.name}.${c.targetPort} (${jointKind})`
              : `Port "${c.selfPort}" snapped flush to ${targetPart.name}.${c.targetPort}`,
        });
        continue;
      }

      if (c.kind === 'concentric') {
        const selfPortSpec = part.ports?.[c.selfPort];
        const targetPortSpec = targetPart.ports?.[c.targetPort];
        if (!selfPortSpec || !targetPortSpec) {
          entries.push({
            partId: part.id,
            partName: part.name,
            constraintKind: c.kind,
            targetPartId: targetPart.id,
            deltaAppliedMm: [0, 0, 0],
            residualErrorMm: 999,
            status: 'unresolved',
            freeDofs: ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'],
            note: `Missing concentric datum port "${c.selfPort}" or "${c.targetPort}".`,
          });
          continue;
        }

        // Align axis vectors collinearly
        const targetAxisWorld = rotateVecByDeg(
          targetPortSpec.normal ?? [0, 1, 0],
          targetRot
        ).normalize();
        const selfAxisWorld = rotateVecByDeg(
          selfPortSpec.normal ?? [0, 1, 0],
          curRot
        ).normalize();

        const dot = selfAxisWorld.dot(targetAxisWorld);
        const alignDir = dot >= 0 ? targetAxisWorld : targetAxisWorld.clone().negate();
        if (Math.abs(Math.abs(dot) - 1) > 1e-4) {
          const qCur = new THREE.Quaternion().setFromEuler(eulerFromDeg(curRot));
          const qAlign = new THREE.Quaternion().setFromUnitVectors(selfAxisWorld, alignDir);
          const nextRot = degFromQuat(qAlign.multiply(qCur));
          curRot[0] = nextRot[0];
          curRot[1] = nextRot[1];
          curRot[2] = nextRot[2];
          resolvedRot.set(part.id, [...curRot]);
        }

        const targetPortWorld = new THREE.Vector3(
          targetPos[0],
          targetPos[1],
          targetPos[2]
        ).add(rotateVecByDeg(targetPortSpec.localOffsetMm, targetRot));
        const selfPortOffset = rotateVecByDeg(selfPortSpec.localOffsetMm, curRot);
        const currentSelfPortWorld = new THREE.Vector3(
          curPos[0],
          curPos[1],
          curPos[2]
        ).add(selfPortOffset);

        // Project self port onto the target axis line (locks the 2 radial DOFs perpendicular to axis)
        const rel = new THREE.Vector3().subVectors(currentSelfPortWorld, targetPortWorld);
        const currentAxial = rel.dot(targetAxisWorld);
        const axialTarget =
          c.lockAxial || c.axialOffsetMm !== undefined ? (c.axialOffsetMm ?? 0) : currentAxial;

        const desiredPortWorld = targetPortWorld
          .clone()
          .addScaledVector(targetAxisWorld, axialTarget);
        const desiredCenter = desiredPortWorld.clone().sub(selfPortOffset);

        const domAxis = dominantAxisName(targetAxisWorld);
        if (domAxis !== 'X' || c.lockAxial || c.axialOffsetMm !== undefined) {
          residualMm = Math.max(residualMm, tryLockAxis('tx', desiredCenter.x, conflicts));
          curPos[0] = dofLock.tx ?? desiredCenter.x;
        }
        if (domAxis !== 'Y' || c.lockAxial || c.axialOffsetMm !== undefined) {
          residualMm = Math.max(residualMm, tryLockAxis('ty', desiredCenter.y, conflicts));
          curPos[1] = dofLock.ty ?? desiredCenter.y;
        }
        if (domAxis !== 'Z' || c.lockAxial || c.axialOffsetMm !== undefined) {
          residualMm = Math.max(residualMm, tryLockAxis('tz', desiredCenter.z, conflicts));
          curPos[2] = dofLock.tz ?? desiredCenter.z;
        }

        resolvedPos.set(part.id, [...curPos]);
        recordEdge(targetPart.id, part.id);

        const freeDofs: string[] = [];
        const axialLocked = Boolean(c.lockAxial || c.axialOffsetMm !== undefined);
        const spinLocked = Boolean(c.lockSpin);
        if (!axialLocked) freeDofs.push(`slide_${domAxis}`);
        if (!spinLocked) freeDofs.push(`spin_${domAxis}`);

        const jointKind: MateJointKind =
          axialLocked && spinLocked
            ? 'fixed'
            : axialLocked && !spinLocked
              ? 'revolute'
              : !axialLocked && spinLocked
                ? 'prismatic'
                : 'cylindrical';

        rawJoints.push({
          id: `joint_${part.id}_${mIdx}`,
          label: `${part.name} (${jointKind} on ${domAxis})`,
          parentPartId: targetPart.id,
          childPartId: part.id,
          childPartName: part.name,
          mateKind: c.kind,
          jointKind,
          anchorWorldMm: [
            round1(desiredPortWorld.x),
            round1(desiredPortWorld.y),
            round1(desiredPortWorld.z),
          ],
          axisWorld: [
            round3(targetAxisWorld.x),
            round3(targetAxisWorld.y),
            round3(targetAxisWorld.z),
          ],
          freeDofs,
        });

        const status: MateConstraintStatus =
          conflicts.length > 0
            ? 'conflicting'
            : freeDofs.length > 0 && mates.length === 1
              ? 'underConstrained'
              : 'solved';

        entries.push({
          partId: part.id,
          partName: part.name,
          constraintKind: c.kind,
          targetPartId: targetPart.id,
          deltaAppliedMm: [
            round3(curPos[0] - origPos[0]),
            round3(curPos[1] - origPos[1]),
            round3(curPos[2] - origPos[2]),
          ],
          residualErrorMm: round3(residualMm),
          status,
          freeDofs,
          conflictDetail: conflicts.join('; ') || undefined,
          note: `Concentric ${domAxis}-axis with ${targetPart.name} (${jointKind}${freeDofs.length ? ` · free: ${freeDofs.join(', ')}` : ''})`,
        });
        continue;
      }

      if (c.kind === 'offset') {
        const axis = c.axis ?? 'y';
        const selfOff =
          c.selfPort && part.ports?.[c.selfPort]
            ? rotateVecByDeg(part.ports[c.selfPort].localOffsetMm, curRot)
            : new THREE.Vector3();
        const targetOff =
          c.targetPort && targetPart.ports?.[c.targetPort]
            ? rotateVecByDeg(targetPart.ports[c.targetPort].localOffsetMm, targetRot)
            : new THREE.Vector3();

        let dir = new THREE.Vector3(0, 1, 0);
        if (axis === 'x') dir.set(1, 0, 0);
        else if (axis === 'z') dir.set(0, 0, 1);
        else if (axis === 'portNormal' && c.targetPort && targetPart.ports?.[c.targetPort]?.normal) {
          dir = rotateVecByDeg(targetPart.ports[c.targetPort].normal!, targetRot).normalize();
        }

        const domAxis = dominantAxisName(dir);
        const targetAnchor = new THREE.Vector3(
          targetPos[0],
          targetPos[1],
          targetPos[2]
        )
          .add(targetOff)
          .addScaledVector(dir, c.distanceMm);
        const desiredCenter = targetAnchor.clone().sub(selfOff);

        if (domAxis === 'X') {
          residualMm = Math.max(residualMm, tryLockAxis('tx', desiredCenter.x, conflicts));
          curPos[0] = dofLock.tx ?? desiredCenter.x;
        } else if (domAxis === 'Y') {
          residualMm = Math.max(residualMm, tryLockAxis('ty', desiredCenter.y, conflicts));
          curPos[1] = dofLock.ty ?? desiredCenter.y;
        } else {
          residualMm = Math.max(residualMm, tryLockAxis('tz', desiredCenter.z, conflicts));
          curPos[2] = dofLock.tz ?? desiredCenter.z;
        }
        resolvedPos.set(part.id, [...curPos]);
        recordEdge(targetPart.id, part.id);

        const freeDofs = computeFreeDofs(dofLock);
        const status: MateConstraintStatus =
          conflicts.length > 0
            ? 'conflicting'
            : freeDofs.length > 0 && mIdx === mates.length - 1
              ? 'underConstrained'
              : 'solved';

        entries.push({
          partId: part.id,
          partName: part.name,
          constraintKind: c.kind,
          targetPartId: targetPart.id,
          deltaAppliedMm: [
            round3(curPos[0] - origPos[0]),
            round3(curPos[1] - origPos[1]),
            round3(curPos[2] - origPos[2]),
          ],
          residualErrorMm: round3(residualMm),
          status,
          freeDofs,
          conflictDetail: conflicts.join('; ') || undefined,
          note: `Offset ${c.distanceMm >= 0 ? '+' : ''}${c.distanceMm} mm along ${domAxis} from ${targetPart.name}`,
        });
        continue;
      }

      if (c.kind === 'angle') {
        const axisIdx = c.axis === 'x' ? 0 : c.axis === 'y' ? 1 : 2;
        const lockKey = c.axis === 'x' ? 'rx' : c.axis === 'y' ? 'ry' : 'rz';
        const desiredDeg = targetRot[axisIdx] + c.angleDeg;
        residualAngleDeg = tryLockAngle(lockKey, desiredDeg, conflicts);
        if (conflicts.length === 0) {
          curRot[axisIdx] = desiredDeg;
          resolvedRot.set(part.id, [...curRot]);
        }
        recordEdge(targetPart.id, part.id);

        const freeDofs = computeFreeDofs(dofLock);
        entries.push({
          partId: part.id,
          partName: part.name,
          constraintKind: c.kind,
          targetPartId: targetPart.id,
          deltaAppliedMm: [0, 0, 0],
          residualErrorMm: 0,
          residualAngleDeg: round3(residualAngleDeg),
          status:
            conflicts.length > 0
              ? 'conflicting'
              : freeDofs.length > 0 && mIdx === mates.length - 1
                ? 'underConstrained'
                : 'solved',
          freeDofs,
          conflictDetail: conflicts.join('; ') || undefined,
          note: `Angle locked at ${c.angleDeg}° about ${c.axis.toUpperCase()} relative to ${targetPart.name}`,
        });
        continue;
      }

      if (c.kind === 'alignCenter') {
        const offset = c.offsetMm ?? [0, 0, 0];
        if (c.axes.includes('x')) {
          residualMm = Math.max(residualMm, tryLockAxis('tx', targetPos[0] + offset[0], conflicts));
          curPos[0] = dofLock.tx ?? targetPos[0] + offset[0];
        }
        if (c.axes.includes('y')) {
          residualMm = Math.max(residualMm, tryLockAxis('ty', targetPos[1] + offset[1], conflicts));
          curPos[1] = dofLock.ty ?? targetPos[1] + offset[1];
        }
        if (c.axes.includes('z')) {
          residualMm = Math.max(residualMm, tryLockAxis('tz', targetPos[2] + offset[2], conflicts));
          curPos[2] = dofLock.tz ?? targetPos[2] + offset[2];
        }
        resolvedPos.set(part.id, [...curPos]);
        recordEdge(targetPart.id, part.id);

        const freeDofs = computeFreeDofs(dofLock);
        entries.push({
          partId: part.id,
          partName: part.name,
          constraintKind: c.kind,
          targetPartId: targetPart.id,
          deltaAppliedMm: [
            round3(curPos[0] - origPos[0]),
            round3(curPos[1] - origPos[1]),
            round3(curPos[2] - origPos[2]),
          ],
          residualErrorMm: round3(residualMm),
          status: conflicts.length > 0 ? 'conflicting' : 'solved',
          freeDofs,
          conflictDetail: conflicts.join('; ') || undefined,
          note: `Aligned ${c.axes.join('/').toUpperCase()} center to ${targetPart.name}`,
        });
      }
    }
  }

  // Compute full downstream kinematic chain (descendantPartIds) for every remembered joint
  // so driving any joint (e.g. valve stem / handwheel / motor coupling) moves its entire mated chain!
  const collectDescendants = (rootChildId: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    const q: string[] = [rootChildId];
    while (q.length > 0) {
      const id = q.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      const kids = childrenByParent.get(id);
      if (kids) {
        for (const k of kids) {
          if (!seen.has(k)) q.push(k);
        }
      }
    }
    return out;
  };

  const joints: SolvedJointRecord[] = rawJoints.map((j) => ({
    ...j,
    chainPartIds: collectDescendants(j.childPartId),
    motionLimits: parts.find((p) => p.id === j.childPartId)?.motionLimits,
  }));

  return {
    resolvedPositionsMm: resolvedPos,
    resolvedRotationsDeg: resolvedRot,
    entries,
    joints,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
