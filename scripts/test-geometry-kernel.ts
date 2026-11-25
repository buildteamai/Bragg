import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  buildCsgSolidGeometry,
  ensureManifoldReady,
  setManifoldWasmPath,
} from '../src/engine/manifoldKernel';
import {
  computeBishopFrames,
  evaluateCurvedLoftDatum,
  monotoneCubicInterp,
  resampleClosedPolygon2D,
} from '../src/engine/spineMath';
import { serializeGroupToSotUsda } from '../src/engine/sotUsdExporter';
import { auditUnblendedCsgSeams } from '../src/engine/geometryLinter';
import {
  applySimCommand,
  createInitialSimState,
  stepSimState,
} from '../src/engine/machineSimEngine';
import { AMADA_H1000_REFERENCE_BLUEPRINT } from '../src/data/amadaH1000Blueprint';
import { BANWOOD_CRUISER_SKATEBOARD_BLUEPRINT } from '../src/data/banwoodCruiserSkateboardBlueprint';
import { COPPER_PRV_MANIFOLD_BLUEPRINT } from '../src/data/copperPrvManifoldBlueprint';
import { CRAFTSMAN_V20_DRILL_BLUEPRINT } from '../src/data/craftsmanV20DrillBlueprint';
import { DMU_125_REFERENCE_BLUEPRINT } from '../src/data/dmu125Blueprint';
import { ESTWING_SURE_STRIKE_HAMMER_BLUEPRINT } from '../src/data/estwingSureStrikeHammerBlueprint';
import { FIREPLACE_MANTEL_REFERENCE_BLUEPRINT } from '../src/data/fireplaceMantelBlueprint';
import { FLOW_MACH500_WATERJET_BLUEPRINT } from '../src/data/flowMach500WaterjetBlueprint';
import {
  createWorkPlatformBlueprint,
  DEFAULT_WORK_PLATFORM_CONFIG,
  GALVANIZED_WORK_PLATFORM_BLUEPRINT,
} from '../src/data/galvanizedWorkPlatformBlueprint';
import { HAIMER_UNO_2070_BLUEPRINT } from '../src/data/haimerUnoBlueprint';
import { INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT } from '../src/data/industrialPipingSystemBlueprint';
import { ORIGAMI_DIAGRID_VASE_BLUEPRINT } from '../src/data/origamiDiagridVaseBlueprint';
import { PRECISION_GEARBOX_BLUEPRINT } from '../src/data/precisionGearboxBlueprint';
import { RYOBI_RECIPROCATING_SAW_BLUEPRINT } from '../src/data/ryobiReciprocatingSawBlueprint';
import { STEEL_COLUMN_CONNECTION_BLUEPRINT } from '../src/data/steelColumnConnectionBlueprint';
import { ULINE_CLAW_HAMMER_BLUEPRINT } from '../src/data/ulineClawHammerBlueprint';
import { UNITREE_GO2_QUADRUPED_BLUEPRINT } from '../src/data/unitreeGo2Blueprint';
import { WELDING_TABLE_SYSTEM28_BLUEPRINT } from '../src/data/weldingTableBlueprint';
import type { CsgNodeSpec, MeshBlueprint } from '../src/types/blueprint';

const ALL_BLUEPRINTS: MeshBlueprint[] = [
  AMADA_H1000_REFERENCE_BLUEPRINT,
  BANWOOD_CRUISER_SKATEBOARD_BLUEPRINT,
  COPPER_PRV_MANIFOLD_BLUEPRINT,
  CRAFTSMAN_V20_DRILL_BLUEPRINT,
  DMU_125_REFERENCE_BLUEPRINT,
  ESTWING_SURE_STRIKE_HAMMER_BLUEPRINT,
  FIREPLACE_MANTEL_REFERENCE_BLUEPRINT,
  FLOW_MACH500_WATERJET_BLUEPRINT,
  GALVANIZED_WORK_PLATFORM_BLUEPRINT,
  HAIMER_UNO_2070_BLUEPRINT,
  INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT,
  ORIGAMI_DIAGRID_VASE_BLUEPRINT,
  PRECISION_GEARBOX_BLUEPRINT,
  RYOBI_RECIPROCATING_SAW_BLUEPRINT,
  STEEL_COLUMN_CONNECTION_BLUEPRINT,
  ULINE_CLAW_HAMMER_BLUEPRINT,
  UNITREE_GO2_QUADRUPED_BLUEPRINT,
  WELDING_TABLE_SYSTEM28_BLUEPRINT,
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wasmDiskPath = path.resolve(__dirname, '../node_modules/manifold-3d/manifold.wasm');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  FAIL  ${name}\n        ${err?.message || err}`);
    failed++;
  }
}

function measureBufferGeometry(geom: THREE.BufferGeometry) {
  const pos = geom.getAttribute('position');
  const idx = geom.getIndex();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let signedVol = 0;

  for (let i = 0; i < triCount; i++) {
    const i0 = idx ? idx.getX(i * 3) : i * 3;
    const i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    ab.crossVectors(b, c);
    signedVol += a.dot(ab) / 6;
  }

  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  // manifoldKernel outputs scene units (1 unit = 1000 mm -> volume in m^3, convert to mm^3)
  return {
    vertCount: pos.count,
    triCount,
    volumeMm3: Math.abs(signedVol) * 1e9,
    sizeMm: [size.x * 1000, size.y * 1000, size.z * 1000] as [number, number, number],
  };
}

async function main() {
  console.log('\n=== 18D Deterministic Geometry Verification Suite ===\n');

  setManifoldWasmPath(wasmDiskPath);
  const ready = await ensureManifoldReady();
  assert.equal(ready, true, 'manifold-3d WASM failed to initialize');

  // 1. PCHIP Monotonicity & Zero-Overshoot
  test('PCHIP monotoneCubicInterp: zero overshoot on non-uniform step', () => {
    const knots = [0, 0.15, 0.35, 0.85, 1.0];
    const vals = [10, 10, 30, 30, 5];
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const y = monotoneCubicInterp(knots, vals, t);
      assert.ok(y >= 5 - 1e-9 && y <= 30 + 1e-9, `Overshoot at t=${t}: y=${y}`);
      if (t <= 0.15) assert.ok(Math.abs(y - 10) < 1e-6, `Flat region drift at t=${t}: y=${y}`);
      if (t >= 0.35 && t <= 0.85) {
        assert.ok(Math.abs(y - 30) < 1e-6, `Plateau overshoot at t=${t}: y=${y}`);
      }
    }
  });

  // 2. Bishop Frames Orthonormality & Right-Handedness
  test('Bishop frames: orthonormal right-handed (T x N = B) on 3D helix', () => {
    const tangents: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      tangents.push(new THREE.Vector3(-Math.sin(a), Math.cos(a), 0.35));
    }
    const frames = computeBishopFrames(tangents, [0, 0, 1]);
    assert.equal(frames.length, tangents.length);
    for (const f of frames) {
      assert.ok(Math.abs(f.tangent.length() - 1) < 1e-6);
      assert.ok(Math.abs(f.normal.length() - 1) < 1e-6);
      assert.ok(Math.abs(f.binormal.length() - 1) < 1e-6);
      assert.ok(Math.abs(f.tangent.dot(f.normal)) < 1e-6);
      assert.ok(Math.abs(f.tangent.dot(f.binormal)) < 1e-6);
      const cross = new THREE.Vector3().crossVectors(f.tangent, f.normal);
      assert.ok(Math.abs(cross.dot(f.binormal) - 1) < 1e-6, 'Frame is not right-handed');
    }
  });

  // 3. Polygon uniform arc-length resampling
  test('resampleClosedPolygon2D: preserves closed square perimeter uniformly', () => {
    const sq: [number, number][] = [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
    ];
    const resampled = resampleClosedPolygon2D(sq, 16);
    assert.equal(resampled.length, 16);
    const step = Math.hypot(resampled[1][0] - resampled[0][0], resampled[1][1] - resampled[0][1]);
    assert.ok(Math.abs(step - 5.0) < 1e-6, `Expected 5mm step, got ${step}`);
  });

  // 4. Analytic volume & determinism of curvedLoft (cylinder R=15mm, L=100mm)
  test('curvedLoft: analytic cylinder volume within 1% & bit-for-bit deterministic', () => {
    const csg: CsgNodeSpec = {
      op: 'curvedLoft',
      radialSegments: 48,
      splineSamples: 20,
      curvedLoftStations: [
        { posMm: [0, 0, 0], halfA: 15, halfB: 15, exponent: 2.0 },
        { posMm: [50, 0, 0], halfA: 15, halfB: 15, exponent: 2.0 },
        { posMm: [100, 0, 0], halfA: 15, halfB: 15, exponent: 2.0 },
      ],
    };
    const r1 = buildCsgSolidGeometry(csg, 'high');
    const r2 = buildCsgSolidGeometry(csg, 'high');
    assert.equal(r1.isWatertightManifold, true, 'curvedLoft is not watertight manifold');
    assert.equal(r2.isWatertightManifold, true, 'curvedLoft run 2 is not watertight manifold');
    const m1 = measureBufferGeometry(r1.geometry);
    const m2 = measureBufferGeometry(r2.geometry);
    const exactVol = Math.PI * 15 * 15 * 100;
    const relErr = Math.abs(m1.volumeMm3 - exactVol) / exactVol;
    assert.ok(relErr < 0.01, `Volume error ${(relErr * 100).toFixed(3)}% exceeds 1%`);
    assert.equal(m1.vertCount, m2.vertCount, 'Non-deterministic vertex count');
    assert.equal(m1.triCount, m2.triCount, 'Non-deterministic triangle count');
    assert.ok(Math.abs(m1.volumeMm3 - m2.volumeMm3) < 1e-6, 'Non-deterministic volume');
    r1.geometry.dispose();
    r2.geometry.dispose();
  });

  // 5. Asymmetric D-section curvedLoft with domed & beveled watertight end-caps
  test('curvedLoft: asymmetric D-section + domed/beveled caps produce watertight solid', () => {
    const csg: CsgNodeSpec = {
      op: 'curvedLoft',
      startCapStyle: 'beveled',
      endCapStyle: 'domed',
      capDepthMm: 6,
      curvedLoftStations: [
        { posMm: [0, 0, 0], halfA: 12, halfB: 10, halfAPos: 16, halfANeg: 8, exponent: 3.0 },
        { posMm: [40, 18, 0], halfA: 10, halfB: 9, halfAPos: 14, halfANeg: 6, exponent: 2.6 },
        { posMm: [85, 10, 0], halfA: 7, halfB: 6, halfAPos: 9, halfANeg: 5, exponent: 2.2 },
      ],
    };
    const res = buildCsgSolidGeometry(csg, 'standard');
    assert.equal(res.isWatertightManifold, true, 'Asymmetric domed curvedLoft is not watertight');
    const m = measureBufferGeometry(res.geometry);
    assert.ok(m.volumeMm3 > 10000, `Unexpectedly small volume: ${m.volumeMm3}`);
    assert.ok(m.triCount > 200);
    res.geometry.dispose();
  });

  // 5b. Pillar 3: filletedJunction + taperedSlotCutter Boolean subtract
  test('filletedJunction: watertight C1 flared transition solid', () => {
    const csg: CsgNodeSpec = {
      op: 'filletedJunction',
      height: 28,
      sinkDepthMm: 5,
      topHalfA: 10,
      topHalfB: 8,
      baseHalfA: 18,
      baseHalfB: 14,
      junctionAxis: 'y',
    };
    const res = buildCsgSolidGeometry(csg, 'standard');
    assert.equal(res.isWatertightManifold, true, 'filletedJunction is not watertight');
    const m = measureBufferGeometry(res.geometry);
    assert.ok(m.volumeMm3 > 8000 && m.triCount > 100);
    res.geometry.dispose();
  });

  test('taperedSlotCutter: Boolean subtract removes exact chamfered V-slot cleanly', () => {
    const host: CsgNodeSpec = { op: 'box', width: 60, height: 20, depth: 30 };
    const slot: CsgNodeSpec = {
      op: 'taperedSlotCutter',
      slotLengthMm: 40,
      depth: 14,
      slotWidthStartMm: 12,
      slotWidthEndMm: 4,
      slotBottomWidthMm: 1.0,
      slotTopChamferMm: 2.0,
      translateMm: [12, -2, 0],
    };
    const hostRes = buildCsgSolidGeometry(host, 'standard');
    const subRes = buildCsgSolidGeometry({ op: 'subtract', children: [host, slot] }, 'standard');
    assert.equal(subRes.isWatertightManifold, true, 'subtract(host, taperedSlotCutter) not watertight');
    const hostVol = measureBufferGeometry(hostRes.geometry).volumeMm3;
    const subVol = measureBufferGeometry(subRes.geometry).volumeMm3;
    assert.ok(subVol < hostVol - 500 && subVol > hostVol * 0.5, `Unexpected post-slot volume: ${subVol} vs ${hostVol}`);
    hostRes.geometry.dispose();
    subRes.geometry.dispose();
  });

  // 5c. Pillar 4: evaluateCurvedLoftDatum surface point lies on loft surface & outward normal is unit
  test('evaluateCurvedLoftDatum: exact surface point & unit outward normal on curved spine', () => {
    const stations = [
      { posMm: [0, 0, 0] as [number, number, number], halfA: 15, halfB: 10, exponent: 2.0 },
      { posMm: [50, 20, 0] as [number, number, number], halfA: 12, halfB: 9, exponent: 2.4 },
      { posMm: [100, 10, 0] as [number, number, number], halfA: 8, halfB: 6, exponent: 2.0 },
    ];
    const datum = evaluateCurvedLoftDatum(stations, 0.5, Math.PI / 2, [0, 0, 1], 0);
    const nLen = Math.hypot(datum.normal[0], datum.normal[1], datum.normal[2]);
    assert.ok(Math.abs(nLen - 1) < 1e-6, `Normal not unit length: ${nLen}`);
    // At angle pi/2 (+B = +Z), surface point Z should be ~ +halfB (~9mm)
    assert.ok(datum.positionMm[2] > 7.5 && datum.positionMm[2] < 10.5, `Unexpected Z on +B face: ${datum.positionMm[2]}`);
    assert.ok(datum.normal[2] > 0.9, `Expected outward +Z normal, got ${datum.normal}`);
  });

  // 6. Full-library CSG regression audit across ALL 15 blueprints
  for (const bp of ALL_BLUEPRINTS) {
    const csgParts = bp.parts.filter((p) => p.geometry.kind === 'csgSolid' && p.geometry.csgRoot);
    if (csgParts.length === 0) continue;
    test(`Blueprint CSG watertight audit: ${bp.name} (${csgParts.length} CSG parts)`, () => {
      for (const part of csgParts) {
        const res = buildCsgSolidGeometry(part.geometry.csgRoot, 'standard');
        assert.equal(res.isWatertightManifold, true, `Part '${part.id}' is not watertight manifold`);
        const m = measureBufferGeometry(res.geometry);
        assert.ok(m.triCount > 0 && m.volumeMm3 > 0, `Part '${part.id}' has zero volume/tris`);
        res.geometry.dispose();
      }
    });
  }

  // 6b. Modular stair handrail permutation check across all 3 deck heights (720/900/1080 mm) + enclosedFront
  test('Modular stair handrail: watertight & bounded within Post 1..Post 3 across 720/900/1080 mm heights', () => {
    for (const deckHeightMm of [720, 900, 1080] as const) {
      const bp = createWorkPlatformBlueprint({
        ...DEFAULT_WORK_PLATFORM_CONFIG,
        deckHeightMm,
        guardrailLayout: 'enclosedFront',
      });
      const hr = bp.parts.find((p) => p.id === 'platform_stair_handrail_back');
      assert.ok(hr && hr.geometry.kind === 'csgSolid', `Missing stair handrail at h=${deckHeightMm}`);
      const res = buildCsgSolidGeometry(hr.geometry.csgRoot, 'standard');
      assert.equal(res.isWatertightManifold, true, `Stair handrail not watertight at h=${deckHeightMm}`);
      const m = measureBufferGeometry(res.geometry);
      assert.ok(m.volumeMm3 > 1e6, `Unexpectedly small handrail volume at h=${deckHeightMm}: ${m.volumeMm3}`);
      assert.ok(m.sizeMm[2] <= 36.1, `Handrail Z width ${m.sizeMm[2].toFixed(1)} mm exceeds 36 mm stringer flange`);
      res.geometry.dispose();
    }
  });

  // 7. SOT Z-up / inch USD exporter invariant check
  test('SOT USD export: Z-up, metersPerUnit 0.0254, minZ = 0, primvars:st', () => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(254, 508, 127),
      new THREE.MeshStandardMaterial({ color: '#445566', metalness: 0.3, roughness: 0.4 })
    );
    box.name = 'TestBody';
    box.position.set(0, 254, 0);
    g.add(box);
    const usda = serializeGroupToSotUsda(g, { id: 'verify-unit', name: 'Verify Unit' } as any, 1);
    assert.ok(usda.includes('upAxis = "Z"'), 'Missing upAxis = "Z"');
    assert.ok(usda.includes('metersPerUnit = 0.0254'), 'Missing metersPerUnit = 0.0254');
    assert.ok(usda.includes('primvars:st'), 'Missing primvars:st UVs');
    assert.ok(usda.includes('UsdPreviewSurface') && usda.includes('OmniPBR'), 'Missing dual shaders');
  });

  // 7b. SOT USD Installation Envelope export check (FloorMarks + floor_tape_* Looks + 3D Utilities)
  test('SOT USD installation export: FloorMarks, floor_tape_* looks, 3D utility stubs & customData', () => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1000, 1000, 1000),
      new THREE.MeshStandardMaterial({ color: '#eef1f5', metalness: 0.1, roughness: 0.3 })
    );
    box.name = 'WaterjetFrame';
    box.position.set(0, 500, 0);
    g.add(box);
    const usda = serializeGroupToSotUsda(g, FLOW_MACH500_WATERJET_BLUEPRINT, 1);
    assert.ok(usda.includes('def Scope "Installation"'), 'Missing Installation scope');
    assert.ok(usda.includes('def Scope "FloorMarks"'), 'Missing FloorMarks scope');
    assert.ok(usda.includes('def Scope "Utilities"'), 'Missing Utilities scope');
    assert.ok(usda.includes('def Material "floor_tape_hazard"'), 'Missing floor_tape_hazard look');
    assert.ok(usda.includes('def Material "floor_tape_operator"'), 'Missing floor_tape_operator look');
    assert.ok(usda.includes('def Mesh "PortMarker"'), 'Missing 3D utility PortMarker mesh');
    assert.ok(usda.includes('def Mesh "FloorStub"'), 'Missing 3D utility FloorStub mesh');
    assert.ok(usda.includes('def Mesh "Riser"'), 'Missing 3D utility Riser mesh');
    assert.ok(usda.includes('string spec = "480 VAC'), 'Missing utility spec customData');
    assert.ok(usda.includes('def Scope "Simulation"'), 'Missing Simulation USD scope');
  });

  // 7c. Event-sourced Machine Simulation HMI state machine test (START / STOP / E-STOP / RESET / HOME)
  test('Machine simulation HMI: START -> RUNNING -> ESTOP lockout -> RESET -> HOME -> STOP (HOLD)', () => {
    const spec = FLOW_MACH500_WATERJET_BLUEPRINT.simulation;
    assert.ok(spec, 'Flow Mach 500 missing simulation spec');
    let s = createInitialSimState(spec);
    assert.equal(s.state, 'IDLE');
    s = applySimCommand(s, spec, 'start');
    assert.equal(s.state, 'RUNNING');
    for (let i = 0; i < 40; i++) s = stepSimState(s, spec, 0.1);
    assert.equal(s.state, 'RUNNING');
    // E-STOP must freeze motion, kill jet, and block START until RESET
    s = applySimCommand(s, spec, 'estop');
    assert.equal(s.state, 'ESTOP');
    assert.equal(s.jetActive, false);
    assert.equal(s.eStopLatched, true);
    s = applySimCommand(s, spec, 'start');
    assert.equal(s.state, 'ESTOP', 'START must be blocked while E-STOP is latched');
    // RESET -> HOME -> IDLE -> START -> STOP (HOLD)
    s = applySimCommand(s, spec, 'reset');
    assert.equal(s.state, 'IDLE');
    assert.equal(s.eStopLatched, false);
    s = applySimCommand(s, spec, 'home');
    assert.equal(s.state, 'HOMING');
    for (let i = 0; i < 80; i++) s = stepSimState(s, spec, 0.1);
    assert.equal(s.state, 'IDLE');
    assert.equal(s.homed, true);
    s = applySimCommand(s, spec, 'start');
    assert.equal(s.state, 'RUNNING');
    s = applySimCommand(s, spec, 'stop');
    assert.equal(s.state, 'HOLD');
    assert.equal(s.jetActive, false);
  });

  // 8. Global SDF Smooth Booleans (smoothUnion / smoothSubtract / smoothIntersect — SOT Rule GB-04)
  test('SDF smoothUnion: blends box + cylinder into watertight Manifold with real fillet volume', () => {
    const sharpUnion: CsgNodeSpec = {
      op: 'union',
      children: [
        { op: 'box', width: 28, height: 28, depth: 28 },
        { op: 'cylinder', radius: 10, height: 50, rotateDeg: [0, 0, 90] },
      ],
    };
    const blendedUnion: CsgNodeSpec = {
      op: 'smoothUnion',
      filletRadiusMm: 5,
      voxelSizeMm: 2.0,
      children: sharpUnion.children,
    };
    const sharpRes = buildCsgSolidGeometry(sharpUnion, 'standard');
    const blendRes = buildCsgSolidGeometry(blendedUnion, 'standard');
    const sharpM = measureBufferGeometry(sharpRes.geometry);
    const blendM = measureBufferGeometry(blendRes.geometry);
    assert.ok(sharpRes.isWatertightManifold, 'Sharp union must be watertight');
    assert.ok(blendRes.isWatertightManifold, 'SDF smoothUnion must be watertight');
    assert.ok(blendM.triCount > 100, 'SDF smoothUnion must produce non-empty mesh');
    assert.ok(
      blendM.volumeMm3 > sharpM.volumeMm3,
      `Expected smoothUnion fillet to add volume (${blendM.volumeMm3.toFixed(0)} > ${sharpM.volumeMm3.toFixed(0)} mm³)`
    );
  });

  test('SDF smoothSubtract & smoothIntersect: produce watertight Manifold solids', () => {
    const subNode: CsgNodeSpec = {
      op: 'smoothSubtract',
      filletRadiusMm: 3,
      voxelSizeMm: 2.0,
      children: [
        { op: 'box', width: 32, height: 32, depth: 32 },
        { op: 'cylinder', radius: 9, height: 44 },
      ],
    };
    const intNode: CsgNodeSpec = {
      op: 'smoothIntersect',
      filletRadiusMm: 3,
      voxelSizeMm: 2.0,
      children: [
        { op: 'box', width: 30, height: 30, depth: 30 },
        { op: 'sphere', radius: 19 },
      ],
    };
    const subRes = buildCsgSolidGeometry(subNode, 'standard');
    const intRes = buildCsgSolidGeometry(intNode, 'standard');
    const subM = measureBufferGeometry(subRes.geometry);
    const intM = measureBufferGeometry(intRes.geometry);
    assert.ok(subRes.isWatertightManifold && subM.volumeMm3 > 1000, 'smoothSubtract must be watertight');
    assert.ok(intRes.isWatertightManifold && intM.volumeMm3 > 1000, 'smoothIntersect must be watertight');
  });

  test('SOT Rule GB-04 linter: flags raw C0 dissimilar union on forged part & passes smoothUnion', () => {
    const basePart: any = {
      id: 'forged-test',
      name: 'Forged Multi-Plane Head',
      group: 'Head',
      manufacturingProcess: 'forged',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      material: { colorHex: '#888', metalness: 0.8, roughness: 0.3, finishName: 'Forged Steel' },
      explodeOffsetMm: [0, 0, 0],
      toleranceMm: 0.2,
    };
    const bad = {
      ...basePart,
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            { op: 'cylinder', radius: 12, height: 30 },
            { op: 'box', width: 25, height: 25, depth: 25 },
          ],
        },
      },
    };
    const good = {
      ...basePart,
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'smoothUnion',
          filletRadiusMm: 4,
          children: bad.geometry.csgRoot.children,
        },
      },
    };
    assert.equal(auditUnblendedCsgSeams([bad]).length, 1, 'Raw C0 dissimilar union must be flagged');
    assert.equal(auditUnblendedCsgSeams([good]).length, 0, 'smoothUnion must pass GB-04 linter');
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
