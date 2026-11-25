import * as THREE from 'three';
import {
  AssemblyInterfaceSpec,
  BlueprintPart,
  CompiledInterfaceRecord,
  CsgNodeSpec,
  MeshBlueprint,
  PartMaterialSpec,
} from '../types/blueprint';

const MAT_BOLT_STEEL: PartMaterialSpec = {
  colorHex: '#d4dce6',
  metalness: 0.9,
  roughness: 0.22,
  textureKind: 'brushedMetal',
  finishName: 'ISO 4762 Grade 12.9 Socket Cap Steel',
};

const MAT_BEARING_STEEL: PartMaterialSpec = {
  colorHex: '#c8d1dc',
  metalness: 0.92,
  roughness: 0.18,
  textureKind: 'brushedMetal',
  finishName: '52100 Chrome Bearing Steel',
};

export interface CoupledJointLink {
  driverPartId: string;
  drivenPartId: string;
  ratio: number;
}

export interface CompiledBlueprintResult {
  parts: BlueprintPart[];
  compiledInterfaces: CompiledInterfaceRecord[];
  /** Sorted pair keys "idA::idB" validated by an explicit mechanical interface contract */
  fitExemptPairs: Set<string>;
  /** Explicit mechanical load-path links (bolted, bearing-supported, coped, geared) */
  loadPathEdges: [string, string][];
  /** Mechanical kinematic couplings (e.g. gear mesh ratio) */
  coupledJointLinks: CoupledJointLink[];
}

export function makePairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

function axisRotationDeg(axis: 'x' | 'y' | 'z'): [number, number, number] {
  if (axis === 'x') return [0, 0, 90];
  if (axis === 'z') return [90, 0, 0];
  return [0, 0, 0];
}

function csgAxisRotationDeg(axis: 'x' | 'y' | 'z'): [number, number, number] {
  // CsgNodeSpec 'cylinder' is Y-up (same as Three.js)
  if (axis === 'x') return [0, 0, 90];
  if (axis === 'z') return [90, 0, 0];
  return [0, 0, 0];
}

/**
 * Converts a world-space point (mm) into a part's local coordinate frame (mm).
 */
function worldToPartLocalMm(
  worldPt: [number, number, number],
  part: BlueprintPart
): [number, number, number] {
  const degToRad = Math.PI / 180;
  const partPos = new THREE.Vector3(part.positionMm[0], part.positionMm[1], part.positionMm[2]);
  const euler = new THREE.Euler(
    part.rotationDeg[0] * degToRad,
    part.rotationDeg[1] * degToRad,
    part.rotationDeg[2] * degToRad,
    'YXZ'
  );
  const invQ = new THREE.Quaternion().setFromEuler(euler).invert();
  const local = new THREE.Vector3(worldPt[0], worldPt[1], worldPt[2])
    .sub(partPos)
    .applyQuaternion(invQ);
  return [local.x, local.y, local.z];
}

/**
 * Converts a world-space 'YXZ' Euler rotation (degrees) into a CSG node's local 'ZYX'
 * Euler rotation (degrees) inside `part`'s coordinate frame (matching manifold-3d rotate()).
 */
function worldToPartLocalCsgRotDeg(
  worldRotDeg: [number, number, number],
  part: BlueprintPart
): [number, number, number] {
  const degToRad = Math.PI / 180;
  const radToDeg = 180 / Math.PI;
  const qWorld = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      worldRotDeg[0] * degToRad,
      worldRotDeg[1] * degToRad,
      worldRotDeg[2] * degToRad,
      'YXZ'
    )
  );
  const qPart = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      part.rotationDeg[0] * degToRad,
      part.rotationDeg[1] * degToRad,
      part.rotationDeg[2] * degToRad,
      'YXZ'
    )
  );
  const qLocal = qPart.invert().multiply(qWorld);
  const csgEuler = new THREE.Euler().setFromQuaternion(qLocal, 'ZYX');
  return [
    Number((csgEuler.x * radToDeg).toFixed(3)),
    Number((csgEuler.y * radToDeg).toFixed(3)),
    Number((csgEuler.z * radToDeg).toFixed(3)),
  ];
}

/**
 * Ensures a BlueprintPart has a CSG root so Boolean interface cuts (holes, bearing bores, coping)
 * can be applied directly to it without losing its geometry.
 */
function ensurePartCsgRoot(part: BlueprintPart): CsgNodeSpec | null {
  if (part.geometry.kind === 'csgSolid' && part.geometry.csgRoot) {
    return part.geometry.csgRoot;
  }
  const g = part.geometry;
  let root: CsgNodeSpec | null = null;
  if (g.kind === 'box' || g.kind === 'roundedBox') {
    root = {
      op: 'machinedBlock',
      width: g.width ?? 100,
      height: g.height ?? 100,
      depth: g.depth ?? 100,
      chamferMm: g.kind === 'roundedBox' ? Math.min(4, g.bevelRadius ?? 3) : 0,
    };
  } else if (g.kind === 'cylinder') {
    root = {
      op: 'cylinder',
      radiusTop: g.radiusTop ?? g.radius ?? 40,
      radiusBottom: g.radiusBottom ?? g.radius ?? 40,
      height: g.height ?? 100,
      radialSegments: g.radialSegments ?? 28,
    };
  }
  if (root) {
    part.geometry = {
      kind: 'csgSolid',
      csgRoot: root,
      smoothSharpAngleDeg: 42,
    };
  }
  return root;
}

/**
 * Appends one or more Boolean cutter nodes to a part's CSG solid via `op: 'subtract'`.
 */
function subtractCuttersFromPart(part: BlueprintPart, cutters: CsgNodeSpec[]): boolean {
  if (cutters.length === 0) return false;
  const existing = ensurePartCsgRoot(part);
  if (!existing) return false;

  if (existing.op === 'subtract' && Array.isArray(existing.children) && existing.children.length > 0) {
    existing.children = [...existing.children, ...cutters];
  } else {
    part.geometry = {
      kind: 'csgSolid',
      csgRoot: {
        op: 'subtract',
        children: [existing, ...cutters],
      },
      smoothSharpAngleDeg: part.geometry.smoothSharpAngleDeg ?? 42,
    };
  }
  return true;
}

/**
 * Appends one or more Boolean union nodes to a part's CSG solid via `op: 'union'`.
 */
function unionNodesIntoPart(part: BlueprintPart, nodes: CsgNodeSpec[]): boolean {
  if (nodes.length === 0) return false;
  const existing = ensurePartCsgRoot(part);
  if (!existing) return false;

  if (existing.op === 'union' && Array.isArray(existing.children) && !existing.rotateDeg && !existing.translateMm && !existing.mirrorAxis) {
    existing.children = [...existing.children, ...nodes];
  } else {
    part.geometry = {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [existing, ...nodes],
      },
      smoothSharpAngleDeg: part.geometry.smoothSharpAngleDeg ?? 42,
    };
  }
  return true;
}

/**
 * Shallow-clones a BlueprintPart and deep-clones its CSG tree so compiling interfaces
 * never mutates the static blueprint source module.
 */
function clonePart(part: BlueprintPart): BlueprintPart {
  return {
    ...part,
    positionMm: [...part.positionMm],
    rotationDeg: [...part.rotationDeg],
    explodeOffsetMm: [...part.explodeOffsetMm],
    geometry: part.geometry.csgRoot
      ? {
          ...part.geometry,
          csgRoot: structuredClone(part.geometry.csgRoot),
        }
      : { ...part.geometry },
    material: { ...part.material },
    mirrorAcross: part.mirrorAcross ? { ...part.mirrorAcross } : undefined,
    pattern: part.pattern ? structuredClone(part.pattern) : undefined,
  };
}

function mirrorEulerYxzDeg(
  rotDeg: [number, number, number],
  axis: 'x' | 'z'
): [number, number, number] {
  const degToRad = Math.PI / 180;
  const radToDeg = 180 / Math.PI;
  const euler = new THREE.Euler(
    rotDeg[0] * degToRad,
    rotDeg[1] * degToRad,
    rotDeg[2] * degToRad,
    'YXZ'
  );
  const rMat = new THREE.Matrix4().makeRotationFromEuler(euler);
  const sMat = new THREE.Matrix4().makeScale(
    axis === 'x' ? -1 : 1,
    1,
    axis === 'z' ? -1 : 1
  );
  // Similarity transform S * R * S preserves det = +1 (proper right-handed rotation)
  const mirroredMat = sMat.clone().multiply(rMat).multiply(sMat);
  const outEuler = new THREE.Euler().setFromRotationMatrix(mirroredMat, 'YXZ');
  return [
    Number((outEuler.x * radToDeg).toFixed(3)),
    Number((outEuler.y * radToDeg).toFixed(3)),
    Number((outEuler.z * radToDeg).toFixed(3)),
  ];
}

function buildMirroredPartId(
  baseId: string,
  axis: 'x' | 'z',
  idSuffix: string | undefined,
  usedIds: Set<string>
): string {
  let candidate: string;
  if (idSuffix) {
    candidate = `${baseId}${idSuffix}`;
  } else if (/_left\b/i.test(baseId)) {
    candidate = baseId.replace(/_left\b/i, '_right');
  } else if (/_right\b/i.test(baseId)) {
    candidate = baseId.replace(/_right\b/i, '_left');
  } else if (/_l$/i.test(baseId)) {
    candidate = baseId.replace(/_l$/i, '_r');
  } else if (/_r$/i.test(baseId)) {
    candidate = baseId.replace(/_r$/i, '_l');
  } else if (/_lh\b/i.test(baseId)) {
    candidate = baseId.replace(/_lh\b/i, '_rh');
  } else if (/_rh\b/i.test(baseId)) {
    candidate = baseId.replace(/_rh\b/i, '_lh');
  } else {
    candidate = `${baseId}_mirror_${axis}`;
  }
  let unique = candidate;
  let k = 2;
  while (usedIds.has(unique)) {
    unique = `${candidate}_${k++}`;
  }
  usedIds.add(unique);
  return unique;
}

function buildMirroredPartName(baseName: string, swapLeftRight: boolean): string {
  if (swapLeftRight) {
    if (/\bLeft\b/.test(baseName)) return baseName.replace(/\bLeft\b/g, 'Right');
    if (/\bRight\b/.test(baseName)) return baseName.replace(/\bRight\b/g, 'Left');
    if (/\bLH\b/.test(baseName)) return baseName.replace(/\bLH\b/g, 'RH');
    if (/\bRH\b/.test(baseName)) return baseName.replace(/\bRH\b/g, 'LH');
  }
  return `${baseName} (Mirrored)`;
}

/**
 * Compiler-level bilateral symmetry (`mirrorAcross`) and linear/polar instancing (`pattern`).
 * Expands declaratively BEFORE interface contracts so mirrored & patterned parts participate
 * identically in Boolean interfaces, constraint solving, and Manifold-3D auditing.
 */
function expandMirrorsAndPatterns(initialParts: BlueprintPart[]): BlueprintPart[] {
  const usedIds = new Set<string>(initialParts.map((p) => p.id));

  // Pass 1: Bilateral mirroring (`mirrorAcross`)
  const afterMirror: BlueprintPart[] = [];
  for (const part of initialParts) {
    afterMirror.push(part);
    const mir = part.mirrorAcross;
    if (!mir) continue;

    const axis = mir.axis;
    const plane = mir.planeOffsetMm ?? 0;
    const clone = clonePart(part);
    clone.id = buildMirroredPartId(part.id, axis, mir.idSuffix, usedIds);
    clone.name = buildMirroredPartName(part.name, mir.swapLeftRightName !== false);
    clone.mirrorAcross = undefined;

    if (axis === 'z') {
      clone.positionMm = [
        clone.positionMm[0],
        clone.positionMm[1],
        Number((2 * plane - clone.positionMm[2]).toFixed(3)),
      ];
      clone.explodeOffsetMm = [
        clone.explodeOffsetMm[0],
        clone.explodeOffsetMm[1],
        -clone.explodeOffsetMm[2],
      ];
    } else {
      clone.positionMm = [
        Number((2 * plane - clone.positionMm[0]).toFixed(3)),
        clone.positionMm[1],
        clone.positionMm[2],
      ];
      clone.explodeOffsetMm = [
        -clone.explodeOffsetMm[0],
        clone.explodeOffsetMm[1],
        clone.explodeOffsetMm[2],
      ];
    }

    clone.rotationDeg = mirrorEulerYxzDeg(part.rotationDeg, axis);

    // If the source part also carries a pattern, reflect the pattern datum across the same plane
    if (clone.pattern) {
      if (clone.pattern.kind === 'linear') {
        if (axis === 'z') clone.pattern.stepMm = [clone.pattern.stepMm[0], clone.pattern.stepMm[1], -clone.pattern.stepMm[2]];
        else clone.pattern.stepMm = [-clone.pattern.stepMm[0], clone.pattern.stepMm[1], clone.pattern.stepMm[2]];
      } else if (clone.pattern.kind === 'polar') {
        const c = clone.pattern.centerMm;
        clone.pattern.centerMm =
          axis === 'z'
            ? [c[0], c[1], Number((2 * plane - c[2]).toFixed(3))]
            : [Number((2 * plane - c[0]).toFixed(3)), c[1], c[2]];
      }
    }

    // Native watertight Manifold-3D mirror for asymmetric local CSG geometry
    if (mir.mirrorGeometry) {
      const root = ensurePartCsgRoot(clone);
      if (root) {
        clone.geometry = {
          kind: 'csgSolid',
          csgRoot: {
            op: 'union',
            children: [root],
            mirrorAxis: axis,
          },
          smoothSharpAngleDeg: clone.geometry.smoothSharpAngleDeg ?? 42,
        };
      }
    }

    afterMirror.push(clone);
  }

  // Pass 2: Linear & polar instancing (`pattern`)
  const expanded: BlueprintPart[] = [];
  const degToRad = Math.PI / 180;
  const radToDeg = 180 / Math.PI;

  for (const part of afterMirror) {
    expanded.push(part);
    const pat = part.pattern;
    if (!pat) continue;
    const count = Math.max(1, Math.min(64, Math.round(pat.count)));
    if (count <= 1) continue;

    if (pat.kind === 'linear') {
      const [sx, sy, sz] = pat.stepMm;
      for (let k = 1; k < count; k++) {
        const inst = clonePart(part);
        const basePrefix = pat.idPrefix ?? part.id;
        let candId = `${basePrefix}_p${k + 1}`;
        let suffix = 2;
        while (usedIds.has(candId)) candId = `${basePrefix}_p${k + 1}_${suffix++}`;
        usedIds.add(candId);

        inst.id = candId;
        inst.name = `${part.name} #${k + 1}`;
        inst.pattern = undefined;
        inst.mirrorAcross = undefined;
        inst.positionMm = [
          Number((part.positionMm[0] + sx * k).toFixed(3)),
          Number((part.positionMm[1] + sy * k).toFixed(3)),
          Number((part.positionMm[2] + sz * k).toFixed(3)),
        ];
        expanded.push(inst);
      }
    } else if (pat.kind === 'polar') {
      const totalAngleDeg = pat.totalAngleDeg ?? 360;
      const isFullCircle = Math.abs(Math.abs(totalAngleDeg) - 360) < 0.01;
      const stepDeg = isFullCircle
        ? totalAngleDeg / count
        : totalAngleDeg / Math.max(1, count - 1);
      const axisVec = new THREE.Vector3(
        pat.axis === 'x' ? 1 : 0,
        pat.axis === 'y' ? 1 : 0,
        pat.axis === 'z' ? 1 : 0
      );
      const center = new THREE.Vector3(pat.centerMm[0], pat.centerMm[1], pat.centerMm[2]);
      const basePos = new THREE.Vector3(part.positionMm[0], part.positionMm[1], part.positionMm[2]);
      const baseOffset = basePos.clone().sub(center);
      const baseExplode = new THREE.Vector3(
        part.explodeOffsetMm[0],
        part.explodeOffsetMm[1],
        part.explodeOffsetMm[2]
      );
      const baseQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          part.rotationDeg[0] * degToRad,
          part.rotationDeg[1] * degToRad,
          part.rotationDeg[2] * degToRad,
          'YXZ'
        )
      );

      for (let k = 1; k < count; k++) {
        const thetaRad = stepDeg * k * degToRad;
        const qStep = new THREE.Quaternion().setFromAxisAngle(axisVec, thetaRad);
        const pos = baseOffset.clone().applyQuaternion(qStep).add(center);
        const exp = baseExplode.clone().applyQuaternion(qStep);

        const inst = clonePart(part);
        let candId = `${part.id}_p${k + 1}`;
        let suffix = 2;
        while (usedIds.has(candId)) candId = `${part.id}_p${k + 1}_${suffix++}`;
        usedIds.add(candId);

        inst.id = candId;
        inst.name = `${part.name} #${k + 1}`;
        inst.pattern = undefined;
        inst.mirrorAcross = undefined;
        inst.positionMm = [
          Number(pos.x.toFixed(3)),
          Number(pos.y.toFixed(3)),
          Number(pos.z.toFixed(3)),
        ];
        inst.explodeOffsetMm = [
          Number(exp.x.toFixed(3)),
          Number(exp.y.toFixed(3)),
          Number(exp.z.toFixed(3)),
        ];

        if (pat.rotateInstances !== false) {
          const qInst = qStep.clone().multiply(baseQuat);
          const eInst = new THREE.Euler().setFromQuaternion(qInst, 'YXZ');
          inst.rotationDeg = [
            Number((eInst.x * radToDeg).toFixed(3)),
            Number((eInst.y * radToDeg).toFixed(3)),
            Number((eInst.z * radToDeg).toFixed(3)),
          ];
        }
        expanded.push(inst);
      }
    }
  }

  return expanded;
}

/**
 * Splits a 3D polyline cleanly around inline components (valves, couplers, sensors)
 * so zero routed runs pass through solid component bodies.
 */
function splitWaypointsAroundInlineComponents(
  waypoints: [number, number, number][],
  inlineComponents: {
    partId: string;
    centerMm: [number, number, number];
    halfLengthMm: number;
    axis: 'x' | 'y' | 'z';
  }[]
): [number, number, number][][] {
  if (!inlineComponents || inlineComponents.length === 0 || waypoints.length < 2) {
    return [waypoints];
  }

  let chains: [number, number, number][][] = [waypoints.map((p) => [...p] as [number, number, number])];

  for (const comp of inlineComponents) {
    const axisIdx = comp.axis === 'x' ? 0 : comp.axis === 'y' ? 1 : 2;
    const cPos = comp.centerMm;
    const nextChains: [number, number, number][][] = [];

    for (const chain of chains) {
      let splitHappened = false;
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i];
        const b = chain[i + 1];
        // Check if segment [a, b] runs along comp.axis and passes through comp.centerMm
        const otherAxes = [0, 1, 2].filter((k) => k !== axisIdx);
        const aligned = otherAxes.every(
          (k) => Math.abs(a[k] - cPos[k]) < 6 && Math.abs(b[k] - cPos[k]) < 6
        );
        if (!aligned) continue;

        const lo = Math.min(a[axisIdx], b[axisIdx]);
        const hi = Math.max(a[axisIdx], b[axisIdx]);
        if (cPos[axisIdx] > lo + 5 && cPos[axisIdx] < hi - 5) {
          const dir = b[axisIdx] >= a[axisIdx] ? 1 : -1;
          const pBefore: [number, number, number] = [...cPos];
          const pAfter: [number, number, number] = [...cPos];
          pBefore[axisIdx] = cPos[axisIdx] - dir * comp.halfLengthMm;
          pAfter[axisIdx] = cPos[axisIdx] + dir * comp.halfLengthMm;

          const leftChain = [...chain.slice(0, i + 1), pBefore];
          const rightChain = [pAfter, ...chain.slice(i + 1)];
          if (leftChain.length >= 2) nextChains.push(leftChain);
          if (rightChain.length >= 2) nextChains.push(rightChain);
          splitHappened = true;
          break;
        }
      }
      if (!splitHappened) {
        nextChains.push(chain);
      }
    }
    chains = nextChains;
  }

  return chains;
}

/**
 * Top-Down Master Skeleton & Bidirectional Interface Contract Compiler.
 * Runs deterministically BEFORE Phase 1 geometry building so:
 *  - `boltedJoint` cuts clearance + tapped holes in BOTH parts and spawns exact fasteners
 *  - `bearingSeat` bores the housing and seats watertight COTS bearings with fit contracts
 *  - `gearMesh` validates pitch-circle center distance, auto-phases tooth mesh, and registers coupled drive ratios
 *  - `copeJoint` Boolean-copes branch tubes/beams cleanly against parent solids
 *  - `portRoute` auto-splits swept runs flange-to-flange around inline components
 */
export function compileAssemblyBlueprint(blueprint: MeshBlueprint): CompiledBlueprintResult {
  const clonedParts = expandMirrorsAndPatterns(blueprint.parts.map(clonePart));
  const partMap = new Map<string, BlueprintPart>();
  for (const p of clonedParts) {
    partMap.set(p.id, p);
  }

  const generatedParts: BlueprintPart[] = [];
  const compiledInterfaces: CompiledInterfaceRecord[] = [];
  const fitExemptPairs = new Set<string>();
  const loadPathEdges: [string, string][] = [];
  const coupledJointLinks: CoupledJointLink[] = [];

  const interfaces: AssemblyInterfaceSpec[] = blueprint.interfaces || [];

  for (const iface of interfaces) {
    if (iface.kind === 'boltedJoint') {
      const partA = partMap.get(iface.partAId);
      const partB = partMap.get(iface.partBId);
      if (!partA || !partB) {
        compiledInterfaces.push({
          id: iface.id,
          kind: iface.kind,
          label: iface.label,
          status: 'warning',
          holesCut: 0,
          partsGenerated: 0,
          summary: `Missing target part "${iface.partAId}" or "${iface.partBId}".`,
          partIds: [],
        });
        continue;
      }

      const positions: [number, number, number][] = [];
      if (Array.isArray(iface.positionsMm)) {
        positions.push(...iface.positionsMm);
      }
      if (iface.boltCircle) {
        const { centerMm, radiusMm, count, startAngleDeg = 0 } = iface.boltCircle;
        for (let i = 0; i < count; i++) {
          const a = ((startAngleDeg + (i / count) * 360) * Math.PI) / 180;
          const c = Math.cos(a) * radiusMm;
          const s = Math.sin(a) * radiusMm;
          if (iface.axis === 'y') {
            positions.push([centerMm[0] + c, centerMm[1], centerMm[2] + s]);
          } else if (iface.axis === 'x') {
            positions.push([centerMm[0], centerMm[1] + c, centerMm[2] + s]);
          } else {
            positions.push([centerMm[0] + c, centerMm[1] + s, centerMm[2]]);
          }
        }
      }

      const axisIdx = iface.axis === 'x' ? 0 : iface.axis === 'y' ? 1 : 2;
      const cuttersA: CsgNodeSpec[] = [];
      const cuttersB: CsgNodeSpec[] = [];
      const createdIds: string[] = [partA.id, partB.id];

      const headDia = iface.boltDiameterMm * 1.62;
      const headH = iface.boltDiameterMm * 0.85;
      const washerDia = iface.boltDiameterMm * 2.05;
      const washerH = Math.max(1.4, iface.boltDiameterMm * 0.22);

      positions.forEach((rawPos, idx) => {
        const boltPos: [number, number, number] = [...rawPos];
        // Center shank extending from headPlaneMm inward along -axis
        const shankCenter: [number, number, number] = [...boltPos];
        shankCenter[axisIdx] = iface.headPlaneMm - iface.boltLengthMm * 0.48;

        const headCenter: [number, number, number] = [...boltPos];
        headCenter[axisIdx] =
          iface.headPlaneMm + (iface.includeWasher ? washerH : 0) + headH * 0.5;

        if (iface.cutHoles !== false) {
          const locA = worldToPartLocalMm(shankCenter, partA);
          const locB = worldToPartLocalMm(shankCenter, partB);
          cuttersA.push({
            op: 'cylinder',
            radius: (iface.boltDiameterMm + 0.8) / 2,
            height: iface.boltLengthMm + 16,
            radialSegments: 16,
            rotateDeg: csgAxisRotationDeg(iface.axis),
            translateMm: locA,
          });
          cuttersB.push({
            op: 'cylinder',
            radius: (iface.boltDiameterMm + 0.3) / 2,
            height: iface.boltLengthMm + 16,
            radialSegments: 16,
            rotateDeg: csgAxisRotationDeg(iface.axis),
            translateMm: locB,
          });
        }

        const boltId = `${iface.id}_bolt_${idx + 1}`;
        const boltPart: BlueprintPart = {
          id: boltId,
          name: `${iface.label} M${Math.round(iface.boltDiameterMm)} Bolt #${idx + 1}`,
          group: iface.group,
          role: 'detail',
          fitClass: 'fastener',
          positionMm: shankCenter,
          rotationDeg: axisRotationDeg(iface.axis),
          geometry: {
            kind: 'csgSolid',
            csgRoot: {
              op: 'union',
              children: [
                {
                  op: 'cylinder',
                  radius: iface.boltDiameterMm / 2,
                  height: iface.boltLengthMm,
                  radialSegments: 14,
                },
                {
                  op: 'cylinder',
                  radius: headDia / 2,
                  height: headH,
                  radialSegments: 6,
                  translateMm: [
                    0,
                    iface.boltLengthMm * 0.48 + (iface.includeWasher ? washerH : 0) + headH * 0.5,
                    0,
                  ],
                },
                ...(iface.includeWasher
                  ? [
                      {
                        op: 'cylinder' as const,
                        radius: washerDia / 2,
                        height: washerH,
                        radialSegments: 18,
                        translateMm: [0, iface.boltLengthMm * 0.48 + washerH * 0.5, 0] as [
                          number,
                          number,
                          number,
                        ],
                      },
                    ]
                  : []),
                ...(iface.includeNut
                  ? [
                      {
                        op: 'cylinder' as const,
                        radius: headDia / 2,
                        height: headH * 0.9,
                        radialSegments: 6,
                        translateMm: [0, -iface.boltLengthMm * 0.42, 0] as [
                          number,
                          number,
                          number,
                        ],
                      },
                    ]
                  : []),
              ],
            },
          },
          material: MAT_BOLT_STEEL,
          explodeOffsetMm: [
            iface.axis === 'x' ? 45 : 0,
            iface.axis === 'y' ? 45 : 0,
            iface.axis === 'z' ? 45 : 0,
          ],
          toleranceMm: 0.15,
        };

        generatedParts.push(boltPart);
        createdIds.push(boltId);
        fitExemptPairs.add(makePairKey(boltId, partA.id));
        fitExemptPairs.add(makePairKey(boltId, partB.id));
        loadPathEdges.push([partA.id, boltId], [boltId, partB.id]);
      });

      let holesCut = 0;
      if (iface.cutHoles !== false) {
        if (subtractCuttersFromPart(partA, cuttersA)) holesCut += cuttersA.length;
        if (subtractCuttersFromPart(partB, cuttersB)) holesCut += cuttersB.length;
      }
      loadPathEdges.push([partA.id, partB.id]);

      compiledInterfaces.push({
        id: iface.id,
        kind: iface.kind,
        label: iface.label,
        status: 'compiled',
        holesCut,
        partsGenerated: positions.length,
        summary: `Cut ${holesCut} aligned bores & seated ${positions.length} M${Math.round(iface.boltDiameterMm)} fasteners across ${partA.name} ↔ ${partB.name}.`,
        partIds: createdIds,
      });
    } else if (iface.kind === 'bearingSeat') {
      const housing = partMap.get(iface.housingPartId);
      const shaft = partMap.get(iface.shaftPartId);
      if (!housing || !shaft) {
        compiledInterfaces.push({
          id: iface.id,
          kind: iface.kind,
          label: iface.label,
          status: 'warning',
          holesCut: 0,
          partsGenerated: 0,
          summary: `Missing housing "${iface.housingPartId}" or shaft "${iface.shaftPartId}".`,
          partIds: [],
        });
        continue;
      }

      let holesCut = 0;
      if (iface.cutHousingBore !== false) {
        const localCenter = worldToPartLocalMm(iface.centerMm, housing);
        const boreCutter: CsgNodeSpec = {
          op: 'cylinder',
          radius: (iface.outerDiaMm + 0.3) / 2,
          height: iface.widthMm + 16,
          radialSegments: 28,
          rotateDeg: csgAxisRotationDeg(iface.axis),
          translateMm: localCenter,
        };
        if (subtractCuttersFromPart(housing, [boreCutter])) {
          holesCut = 1;
        }
      }

      const bearingId = `${iface.id}_bearing`;
      const bearingPart: BlueprintPart = {
        id: bearingId,
        name: `${iface.label} (${Math.round(iface.innerDiaMm)}×${Math.round(iface.outerDiaMm)}×${Math.round(iface.widthMm)} Bearing)`,
        group: iface.group,
        role: 'secondary',
        fitClass: 'bearing',
        positionMm: [...iface.centerMm],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: {
            op: 'ballBearing',
            innerDiaMm: iface.innerDiaMm,
            outerDiaMm: iface.outerDiaMm,
            width: iface.widthMm,
            ballCount: iface.ballCount ?? 9,
            bearingAxis: iface.axis,
          },
        },
        material: MAT_BEARING_STEEL,
        explodeOffsetMm: [
          iface.axis === 'x' ? 40 : 0,
          iface.axis === 'y' ? 40 : 0,
          iface.axis === 'z' ? 40 : 0,
        ],
        toleranceMm: 0.05,
      };

      generatedParts.push(bearingPart);
      fitExemptPairs.add(makePairKey(bearingId, housing.id));
      fitExemptPairs.add(makePairKey(bearingId, shaft.id));
      fitExemptPairs.add(makePairKey(housing.id, shaft.id));
      loadPathEdges.push([housing.id, bearingId], [bearingId, shaft.id]);

      compiledInterfaces.push({
        id: iface.id,
        kind: iface.kind,
        label: iface.label,
        status: 'compiled',
        holesCut,
        partsGenerated: 1,
        summary: `Bored Ø${iface.outerDiaMm.toFixed(1)} mm seat in ${housing.name} & seated Ø${iface.innerDiaMm}/${iface.outerDiaMm} mm ball bearing on ${shaft.name}.`,
        partIds: [housing.id, bearingId, shaft.id],
      });
    } else if (iface.kind === 'gearMesh') {
      const gearA = partMap.get(iface.gearAPartId);
      const gearB = partMap.get(iface.gearBPartId);
      if (!gearA || !gearB) {
        compiledInterfaces.push({
          id: iface.id,
          kind: iface.kind,
          label: iface.label,
          status: 'warning',
          holesCut: 0,
          partsGenerated: 0,
          summary: `Missing gear "${iface.gearAPartId}" or "${iface.gearBPartId}".`,
          partIds: [],
        });
        continue;
      }

      const nominalCenterDist = (iface.moduleMm * (iface.teethA + iface.teethB)) / 2;
      const dx = gearB.positionMm[0] - gearA.positionMm[0];
      const dy = gearB.positionMm[1] - gearA.positionMm[1];
      const dz = gearB.positionMm[2] - gearA.positionMm[2];
      const actualDist =
        iface.axis === 'z'
          ? Math.hypot(dx, dy)
          : iface.axis === 'y'
            ? Math.hypot(dx, dz)
            : Math.hypot(dy, dz);
      const distErr = Math.abs(actualDist - nominalCenterDist);

      // Auto-phase Gear B so its teeth drop into the exact valleys of Gear A
      if (iface.autoPhaseB !== false) {
        const meshAngleRad =
          iface.axis === 'z'
            ? Math.atan2(dy, dx)
            : iface.axis === 'y'
              ? Math.atan2(dz, dx)
              : Math.atan2(dz, dy);
        const meshAngleDeg = (meshAngleRad * 180) / Math.PI;
        const halfToothStepB = 180 / iface.teethB;
        const phaseDeg = meshAngleDeg + 180 + halfToothStepB;
        if (iface.axis === 'z') {
          gearB.rotationDeg = [gearB.rotationDeg[0], gearB.rotationDeg[1], phaseDeg];
        } else if (iface.axis === 'y') {
          gearB.rotationDeg = [gearB.rotationDeg[0], phaseDeg, gearB.rotationDeg[2]];
        } else {
          gearB.rotationDeg = [phaseDeg, gearB.rotationDeg[1], gearB.rotationDeg[2]];
        }
      }

      gearA.fitClass = 'gearMesh';
      gearB.fitClass = 'gearMesh';
      fitExemptPairs.add(makePairKey(gearA.id, gearB.id));
      loadPathEdges.push([gearA.id, gearB.id]);

      // Register mechanical gear ratio coupling for live viewport motion rigging
      const ratio = -(iface.teethA / iface.teethB);
      coupledJointLinks.push({
        driverPartId: iface.driverJointPartId ?? gearA.id,
        drivenPartId: iface.drivenJointPartId ?? gearB.id,
        ratio,
      });

      compiledInterfaces.push({
        id: iface.id,
        kind: iface.kind,
        label: iface.label,
        status: distErr <= 1.2 ? 'compiled' : 'warning',
        holesCut: 0,
        partsGenerated: 0,
        summary: `m=${iface.moduleMm} (${iface.teethA}T:${iface.teethB}T, ratio ${Math.abs(ratio).toFixed(2)}:1) · CD ${actualDist.toFixed(1)}/${nominalCenterDist.toFixed(1)} mm · auto-phased.`,
        partIds: [gearA.id, gearB.id],
      });
    } else if (iface.kind === 'copeJoint') {
      const branch = partMap.get(iface.branchPartId);
      const parent = partMap.get(iface.parentPartId);
      if (!branch || !parent) {
        compiledInterfaces.push({
          id: iface.id,
          kind: iface.kind,
          label: iface.label,
          status: 'warning',
          holesCut: 0,
          partsGenerated: 0,
          summary: `Missing branch "${iface.branchPartId}" or parent "${iface.parentPartId}".`,
          partIds: [],
        });
        continue;
      }

      const parentCsg = ensurePartCsgRoot(parent);
      let coped = false;
      if (parentCsg) {
        const localOffset = worldToPartLocalMm(parent.positionMm, branch);
        const cutterNode: CsgNodeSpec = {
          ...structuredClone(parentCsg),
          translateMm: [
            (parentCsg.translateMm?.[0] ?? 0) + localOffset[0],
            (parentCsg.translateMm?.[1] ?? 0) + localOffset[1],
            (parentCsg.translateMm?.[2] ?? 0) + localOffset[2],
          ],
        };
        coped = subtractCuttersFromPart(branch, [cutterNode]);
      }

      fitExemptPairs.add(makePairKey(branch.id, parent.id));
      loadPathEdges.push([branch.id, parent.id]);

      compiledInterfaces.push({
        id: iface.id,
        kind: iface.kind,
        label: iface.label,
        status: coped ? 'compiled' : 'warning',
        holesCut: coped ? 1 : 0,
        partsGenerated: 0,
        summary: coped
          ? `Boolean-coped ${branch.name} cleanly against ${parent.name} (0.00 mm saddle fit).`
          : `Registered weld contract between ${branch.name} and ${parent.name}.`,
        partIds: [branch.id, parent.id],
      });
    } else if (iface.kind === 'portRoute') {
      const chains = splitWaypointsAroundInlineComponents(
        iface.waypointsMm,
        iface.inlineComponents || []
      );
      const createdIds: string[] = [];
      chains.forEach((pts, idx) => {
        const spoolId = `${iface.id}_spool_${idx + 1}`;
        generatedParts.push({
          id: spoolId,
          name: `${iface.label} Spool #${idx + 1}`,
          group: iface.group,
          role: 'primary',
          positionMm: [0, 0, 0],
          rotationDeg: [0, 0, 0],
          geometry: {
            kind: 'csgSolid',
            csgRoot: {
              op: 'sweep',
              radius: iface.radiusMm,
              radialSegments: 22,
              cornerMode: 'bend',
              bendRadiusMm: iface.bendRadiusMm ?? iface.radiusMm * 2.2,
              bendSegments: 9,
              pathPoints: pts,
            },
          },
          material: iface.material,
          explodeOffsetMm: [0, 20, 0],
          toleranceMm: 0.25,
        });
        createdIds.push(spoolId);
      });

      for (const comp of iface.inlineComponents || []) {
        for (const sid of createdIds) {
          loadPathEdges.push([sid, comp.partId]);
        }
      }

      compiledInterfaces.push({
        id: iface.id,
        kind: iface.kind,
        label: iface.label,
        status: 'compiled',
        holesCut: 0,
        partsGenerated: createdIds.length,
        summary: `Auto-routed & split into ${createdIds.length} flange-to-flange spool(s) across ${(iface.inlineComponents || []).length} inline component(s).`,
        partIds: [...createdIds, ...(iface.inlineComponents || []).map((c) => c.partId)],
      });
    } else if (iface.kind === 'blendedMount') {
      const host = partMap.get(iface.hostPartId);
      const child = partMap.get(iface.childPartId);
      if (!host || !child) {
        compiledInterfaces.push({
          id: iface.id,
          kind: iface.kind,
          label: iface.label,
          status: 'warning',
          holesCut: 0,
          partsGenerated: 0,
          summary: `Missing host "${iface.hostPartId}" or child "${iface.childPartId}".`,
          partIds: [],
        });
        continue;
      }

      const style = iface.style ?? 'boss';
      const bossH = iface.bossHeightMm ?? (style === 'cowl' ? 24 : 4.0);
      const sinkD = iface.sinkDepthMm ?? 14.0;
      const flare = iface.baseFlareMm ?? (style === 'cowl' ? 9.5 : 12.0);
      const rimMargin = iface.rimMarginMm ?? 0.8;
      const seamGap = iface.seamGapMm ?? 0.5;
      const localCenter = worldToPartLocalMm(iface.centerMm, host);
      const localRotDeg = worldToPartLocalCsgRotDeg(iface.rotationDeg, host);

      let molded = false;
      let trimmed = false;

      if (style === 'boss') {
        const bossNode: CsgNodeSpec = {
          op: 'blendedBoss',
          radius: iface.radiusMm,
          height: bossH,
          sinkDepthMm: sinkD,
          baseFlareMm: flare,
          rimMarginMm: rimMargin,
          radialSegments: 32,
          rotateDeg: localRotDeg,
          translateMm: localCenter,
        };
        molded = unionNodesIntoPart(host, [bossNode]);

        const cutR = iface.radiusMm + rimMargin + 4.8;
        const cutH = 14;
        const landingCutter: CsgNodeSpec = {
          op: 'union',
          children: [
            {
              op: 'cylinder',
              radius: cutR,
              height: cutH,
              radialSegments: 32,
              translateMm: [0, bossH + cutH * 0.5, 0],
            },
          ],
          rotateDeg: localRotDeg,
          translateMm: localCenter,
        };
        trimmed = subtractCuttersFromPart(host, [landingCutter]);

        if (iface.autoAlignChild) {
          const degToRad = Math.PI / 180;
          const qWorld = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              iface.rotationDeg[0] * degToRad,
              iface.rotationDeg[1] * degToRad,
              iface.rotationDeg[2] * degToRad,
              'YXZ'
            )
          );
          const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(qWorld);
          child.rotationDeg = [...iface.rotationDeg];
          child.positionMm = [
            Number((iface.centerMm[0] + upWorld.x * (bossH + seamGap)).toFixed(2)),
            Number((iface.centerMm[1] + upWorld.y * (bossH + seamGap)).toFixed(2)),
            Number((iface.centerMm[2] + upWorld.z * (bossH + seamGap)).toFixed(2)),
          ];
        }
      } else {
        const cowlNode: CsgNodeSpec = {
          op: 'blendedCowl',
          radius: iface.radiusMm + rimMargin,
          height: bossH,
          baseFlareMm: flare,
          cowlDirection: 'down',
          radialSegments: 32,
          rotateDeg: localRotDeg,
          translateMm: localCenter,
        };
        molded = unionNodesIntoPart(host, [cowlNode]);

        const cutR = iface.radiusMm + rimMargin + flare + 4;
        const cutH = 14;
        const rimCutter: CsgNodeSpec = {
          op: 'union',
          children: [
            {
              op: 'cylinder',
              radius: cutR,
              height: cutH,
              radialSegments: 32,
              translateMm: [0, -cutH * 0.5, 0],
            },
          ],
          rotateDeg: localRotDeg,
          translateMm: localCenter,
        };
        trimmed = subtractCuttersFromPart(host, [rimCutter]);

        if (iface.autoAlignChild) {
          const degToRad = Math.PI / 180;
          const qWorld = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              iface.rotationDeg[0] * degToRad,
              iface.rotationDeg[1] * degToRad,
              iface.rotationDeg[2] * degToRad,
              'YXZ'
            )
          );
          const downWorld = new THREE.Vector3(0, -1, 0).applyQuaternion(qWorld);
          child.rotationDeg = [...iface.rotationDeg];
          child.positionMm = [
            Number((iface.centerMm[0] + downWorld.x * seamGap).toFixed(2)),
            Number((iface.centerMm[1] + downWorld.y * seamGap).toFixed(2)),
            Number((iface.centerMm[2] + downWorld.z * seamGap).toFixed(2)),
          ];
        }
      }

      loadPathEdges.push([child.id, host.id]);
      compiledInterfaces.push({
        id: iface.id,
        kind: iface.kind,
        label: iface.label,
        status: molded ? 'compiled' : 'warning',
        holesCut: trimmed ? 1 : 0,
        partsGenerated: 0,
        summary: `Molded Ø${(iface.radiusMm * 2).toFixed(1)} mm ${style} landing into ${host.name} & seated ${child.name} (${seamGap.toFixed(1)} mm hairline seam).`,
        partIds: [host.id, child.id],
      });
    }
  }

  return {
    parts: [...clonedParts, ...generatedParts],
    compiledInterfaces,
    fitExemptPairs,
    loadPathEdges,
    coupledJointLinks,
  };
}
