#!/usr/bin/env tsx
/**
 * 18D Lightweight CAD Agent Orchestrator CLI
 *
 * Usage:
 *   npm run cad:orchestrate -- --verify amada-h1000-ii-reference
 *   npm run cad:orchestrate -- --repair amada-h1000-ii-reference --repairs 3 --out /tmp/amada-repaired.json
 *   npm run cad:orchestrate -- --prompt "50-ton hydraulic C-frame press" --workers 3 --repairs 3 --out /tmp/press.json
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  applyDeterministicGeometryFixes,
  evaluateBlueprintInKernel,
} from '../server/cadKernelGate';
import { getOrchestratorJob, startOrchestratorJob } from '../server/cadOrchestrator';
import { buildCsgSolidGeometry } from '../src/engine/manifoldKernel';
import { computeMeshVolumeAndCentroidMm } from '../src/engine/massProperties';
import { buildBlueprintAssembly, disposeAssembly } from '../src/engine/meshKernel';
import { collectBlueprintFlatPatterns } from '../src/engine/planarDevelopment';
import type { CsgNodeSpec, MeshBlueprint } from '../src/types/blueprint';
import { HAIMER_UNO_2070_BLUEPRINT } from '../src/data/haimerUnoBlueprint';
import { UNITREE_GO2_QUADRUPED_BLUEPRINT } from '../src/data/unitreeGo2Blueprint';
import { AMADA_H1000_REFERENCE_BLUEPRINT } from '../src/data/amadaH1000Blueprint';
import { WELDING_TABLE_SYSTEM28_BLUEPRINT } from '../src/data/weldingTableBlueprint';
import { GALVANIZED_WORK_PLATFORM_BLUEPRINT } from '../src/data/galvanizedWorkPlatformBlueprint';
import { RYOBI_RECIPROCATING_SAW_BLUEPRINT } from '../src/data/ryobiReciprocatingSawBlueprint';
import { CRAFTSMAN_V20_DRILL_BLUEPRINT } from '../src/data/craftsmanV20DrillBlueprint';
import { INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT } from '../src/data/industrialPipingSystemBlueprint';
import { PRECISION_GEARBOX_BLUEPRINT } from '../src/data/precisionGearboxBlueprint';
import { COPPER_PRV_MANIFOLD_BLUEPRINT } from '../src/data/copperPrvManifoldBlueprint';
import { STEEL_COLUMN_CONNECTION_BLUEPRINT } from '../src/data/steelColumnConnectionBlueprint';
import { DMU_125_REFERENCE_BLUEPRINT } from '../src/data/dmu125Blueprint';
import { FIREPLACE_MANTEL_REFERENCE_BLUEPRINT } from '../src/data/fireplaceMantelBlueprint';

const BLUEPRINTS = [
  HAIMER_UNO_2070_BLUEPRINT,
  UNITREE_GO2_QUADRUPED_BLUEPRINT,
  WELDING_TABLE_SYSTEM28_BLUEPRINT,
  GALVANIZED_WORK_PLATFORM_BLUEPRINT,
  RYOBI_RECIPROCATING_SAW_BLUEPRINT,
  CRAFTSMAN_V20_DRILL_BLUEPRINT,
  INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT,
  PRECISION_GEARBOX_BLUEPRINT,
  COPPER_PRV_MANIFOLD_BLUEPRINT,
  STEEL_COLUMN_CONNECTION_BLUEPRINT,
  AMADA_H1000_REFERENCE_BLUEPRINT,
  DMU_125_REFERENCE_BLUEPRINT,
  FIREPLACE_MANTEL_REFERENCE_BLUEPRINT,
];

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function findBlueprint(query: string) {
  return BLUEPRINTS.find((b) => b.id === query || b.id.includes(query));
}

async function main() {
  const verifyTarget = getArg('--verify');
  const verifyBlendingGuards = process.argv.includes('--verify-blending-guards');
  const flatPatternTarget = getArg('--flat-pattern');
  const repairTarget = getArg('--repair');
  const prompt = getArg('--prompt');
  const imagePath = getArg('--image');
  const widthStr = getArg('--width');
  const workers = Number(getArg('--workers') || 3);
  const repairs = Number(getArg('--repairs') || 3);
  const outPath = getArg('--out');

  if (verifyBlendingGuards) {
    // Adversarial self-test: inject BOTH real first-pass failure modes and assert the kernel gate REJECTS them
    const badGps = structuredClone(UNITREE_GO2_QUADRUPED_BLUEPRINT);
    const puck = badGps.parts.find((p) => p.id === 'go2-brow-gps-puck')!;
    puck.rotationDeg = [0, 0, -9];
    puck.positionMm = [puck.positionMm[0], puck.positionMm[1] + 2.5, 0];
    const r1 = await evaluateBlueprintInKernel(badGps, 0, 'Guard Test: Wrong-Sign GPS Cap');

    const badLidar = structuredClone(UNITREE_GO2_QUADRUPED_BLUEPRINT);
    const lidar = badLidar.parts.find((p) => p.id === 'go2-lidar-l1-dome')!;
    const cage = badLidar.parts.find((p) => p.id === 'go2-lidar-guard-cage')!;
    lidar.positionMm = [lidar.positionMm[0], lidar.positionMm[1] - 10, 0];
    cage.positionMm = [cage.positionMm[0], cage.positionMm[1] - 10, 0];
    const r2 = await evaluateBlueprintInKernel(badLidar, 0, 'Guard Test: Hovering LiDAR Pod');

    const caughtGps = (r1.report.unblendedMounts ?? []).some(
      (m) => m.partId === 'go2-brow-gps-puck'
    );
    const caughtLidar =
      (r2.report.unblendedMounts ?? []).some((m) => m.partId === 'go2-lidar-l1-dome') ||
      r2.report.floatingParts.some((f) => f.partId === 'go2-lidar-l1-dome');

    // Guard 3: Remove chinCowl from fuselage so LiDAR sits INSIDE fuselage AABB while hovering under sloped snout!
    const noCowl = structuredClone(UNITREE_GO2_QUADRUPED_BLUEPRINT);
    const fuselage = noCowl.parts.find((p) => p.id === 'go2-main-fuselage')!;
    const subRoot = fuselage.geometry.csgRoot;
    if (subRoot?.op === 'subtract' && subRoot.children?.[0]?.op === 'union' && subRoot.children[0].children) {
      // Drop index 1 (chinCowl) while keeping mainLoft & browBoss
      subRoot.children[0].children = subRoot.children[0].children.filter((_, idx) => idx !== 1);
    }
    const r3 = await evaluateBlueprintInKernel(noCowl, 0, 'Guard Test: Unblended Sloped Snout (No Chin Cowl)');
    const caughtNoCowl =
      (r3.report.unblendedMounts ?? []).some((m) => m.partId === 'go2-lidar-l1-dome') ||
      r3.report.floatingParts.some((f) => f.partId === 'go2-lidar-l1-dome');

    // Guard 4: Feed the broken -9° GPS cap into applyDeterministicGeometryFixes() -> zero-token auto-tilt to 100/100 PASS!
    const autoTiltRes = await applyDeterministicGeometryFixes(
      badGps,
      r1,
      1,
      'Guard 4: Zero-Token Auto-Tilt'
    );
    const fixedPuck = autoTiltRes.blueprint.parts.find((p) => p.id === 'go2-brow-gps-puck')!;
    const guard4Passed =
      autoTiltRes.improved &&
      autoTiltRes.evaluation.gateSnapshot.passed &&
      autoTiltRes.evaluation.gateSnapshot.healthScore === 100 &&
      (autoTiltRes.evaluation.gateSnapshot.unblendedMountCount ?? 0) === 0;

    // Guard 5: Synthetic assembly exercising Pillar 1 (superellipseLoft, blendedBoss, blendedCowl, conformalPatch, blendedMount),
    // and Pillar 3 (mirrorAcross with watertight mirrorGeometry + linear & polar pattern)
    const upgradeTestBp: MeshBlueprint = {
      id: 'global-upgrades-selftest',
      name: 'Global Upgrades Integration Assembly',
      category: 'Test Harness',
      summary: 'Verifies superellipseLoft, blendedBoss, blendedCowl, conformalPatch, blendedMount, mirrorAcross, and linear/polar pattern.',
      sourceImageUrl: '',
      envelopeMm: { width: 300, height: 175, depth: 205 },
      toleranceSpecMm: 0.2,
      symmetryPlane: 'Z',
      photoMatchCamera: { positionMm: [420, 260, 420], targetMm: [0, 85, 0], fov: 35 },
      interfaces: [
        {
          id: 'iface-top-gps-mount',
          kind: 'blendedMount',
          label: 'Sloped Brow GPS Blended Boss',
          hostPartId: 'sculpted-hull',
          childPartId: 'top-gps-cap',
          style: 'boss',
          centerMm: [-70, 151, 0],
          rotationDeg: [0, 0, 8.93],
          radiusMm: 18,
          bossHeightMm: 4,
          sinkDepthMm: 12,
          baseFlareMm: 10,
          rimMarginMm: 0.8,
          seamGapMm: 0.6,
          autoAlignChild: true,
        },
      ],
      parts: [
        {
          id: 'sculpted-hull',
          name: 'Sculpted Superellipse Hull with Chin Cowl',
          group: 'Chassis',
          role: 'primary',
          positionMm: [0, 90, 0],
          rotationDeg: [0, 0, 0],
          explodeOffsetMm: [0, 40, 0],
          toleranceMm: 0.2,
          material: {
            colorHex: '#cfd6df',
            metalness: 0.1,
            roughness: 0.3,
            clearcoat: 0.45,
            textureKind: 'none',
            finishName: 'Satin Shell Finish',
          },
          geometry: {
            kind: 'csgSolid',
            smoothSharpAngleDeg: 42,
            csgRoot: {
              op: 'union',
              children: [
                {
                  op: 'superellipseLoft',
                  loftAxis: 'x',
                  radialSegments: 28,
                  superellipseStations: [
                    { posMm: -140, offsetU: -10, halfA: 60, halfB: 85, exponent: 2.8 },
                    { posMm: 0, offsetU: 0, halfA: 72, halfB: 98, exponent: 3.0 },
                    { posMm: 140, offsetU: 0, halfA: 60, halfB: 85, exponent: 2.8 },
                  ],
                },
                {
                  op: 'blendedBoss',
                  radius: 34,
                  height: 3,
                  sinkDepthMm: 10,
                  baseFlareMm: 8,
                  rimMarginMm: 1.0,
                  translateMm: [0, 72, 0],
                },
                {
                  op: 'blendedCowl',
                  radius: 24,
                  height: 20,
                  baseFlareMm: 8,
                  cowlDirection: 'down',
                  throatOffsetMm: [-24, 18, 0],
                  throatHalfWidthMm: 22,
                  throatHalfHeightMm: 14,
                  translateMm: [95, -62, 0],
                },
              ],
            },
          },
        },
        {
          id: 'top-gps-cap',
          name: 'GPS Dome Cap',
          group: 'Sensors',
          role: 'detail',
          positionMm: [0, 160, 0],
          rotationDeg: [0, 0, 0],
          explodeOffsetMm: [0, 60, 0],
          toleranceMm: 0.15,
          material: {
            colorHex: '#252a32',
            metalness: 0.12,
            roughness: 0.36,
            textureKind: 'none',
            finishName: 'Matte Sensor Polymer',
          },
          geometry: {
            kind: 'csgSolid',
            smoothSharpAngleDeg: 42,
            csgRoot: {
              op: 'revolve',
              radialSegments: 28,
              lathePoints: [
                [0, 0],
                [18, 0],
                [18, 2.0],
                [15, 4.6],
                [0, 6.2],
              ],
            },
          },
        },
        {
          id: 'support_leg_left',
          name: 'Left Support Foot',
          group: 'Landing Gear',
          role: 'secondary',
          anchorKind: 'floor',
          constraint: { kind: 'sitOnGround', groundYMm: 0 },
          positionMm: [-65, 16, 68],
          rotationDeg: [0, 0, 0],
          explodeOffsetMm: [0, -30, 35],
          toleranceMm: 0.2,
          mirrorAcross: {
            axis: 'z',
            planeOffsetMm: 0,
            swapLeftRightName: true,
            mirrorGeometry: true,
          },
          pattern: {
            kind: 'linear',
            count: 2,
            stepMm: [130, 0, 0],
          },
          material: {
            colorHex: '#1f2329',
            metalness: 0.15,
            roughness: 0.72,
            textureKind: 'rubberOvermold',
            finishName: 'TPU Foot Pad',
          },
          geometry: {
            kind: 'csgSolid',
            smoothSharpAngleDeg: 42,
            csgRoot: {
              op: 'machinedBlock',
              width: 26,
              height: 32,
              depth: 22,
              chamferMm: 2.5,
            },
          },
        },
        {
          id: 'flank_badge_left',
          name: 'Left Conformal Flank Badge',
          group: 'Trim',
          role: 'detail',
          positionMm: [0, 90, 99.6],
          rotationDeg: [0, 0, 0],
          explodeOffsetMm: [0, 0, 45],
          toleranceMm: 0.15,
          mirrorAcross: {
            axis: 'z',
            planeOffsetMm: 0,
            swapLeftRightName: true,
            mirrorGeometry: true,
          },
          material: {
            colorHex: '#e2e8f0',
            metalness: 0.85,
            roughness: 0.22,
            textureKind: 'brushedMetal',
            finishName: 'Brushed Aluminum Badge',
          },
          geometry: {
            kind: 'csgSolid',
            smoothSharpAngleDeg: 42,
            csgRoot: {
              op: 'conformalPatch',
              width: 48,
              height: 18,
              thicknessMm: 2.2,
              curveRadiusUMm: 220,
              curveRadiusVMm: 260,
            },
          },
        },
        {
          id: 'deck_fastener_lug',
          name: 'Deck Sensor Lug',
          group: 'Trim',
          role: 'detail',
          positionMm: [22, 167.5, 0],
          rotationDeg: [0, 0, 0],
          explodeOffsetMm: [20, 45, 0],
          toleranceMm: 0.15,
          pattern: {
            kind: 'polar',
            count: 4,
            axis: 'y',
            centerMm: [0, 167.5, 0],
            totalAngleDeg: 360,
            rotateInstances: true,
          },
          material: {
            colorHex: '#94a3b8',
            metalness: 0.88,
            roughness: 0.25,
            textureKind: 'brushedMetal',
            finishName: 'Machined Stainless Lug',
          },
          geometry: {
            kind: 'csgSolid',
            smoothSharpAngleDeg: 42,
            csgRoot: {
              op: 'cylinder',
              radius: 5.5,
              height: 4.0,
              radialSegments: 18,
            },
          },
        },
      ],
      reconstructedAt: new Date().toISOString(),
    };

    const r5 = await evaluateBlueprintInKernel(
      upgradeTestBp,
      0,
      'Guard 5: Global Upgrades Integration'
    );
    const guard5Passed =
      r5.gateSnapshot.passed &&
      r5.gateSnapshot.healthScore === 100 &&
      r5.gateSnapshot.totalPartCount === 12 &&
      r5.gateSnapshot.watertightCsgCount === 12 &&
      (r5.gateSnapshot.unblendedMountCount ?? 0) === 0;

    // Guard 6: Verify true hollow shelling (shellWall), curved parting-line grooves (panelSeam),
    // and exact signed-tetrahedron mass properties / CoG / static tip-over stability engine.
    const solidLoftNode: CsgNodeSpec = {
      op: 'superellipseLoft',
      loftAxis: 'x',
      radialSegments: 28,
      superellipseStations: [
        { posMm: -100, offsetU: 0, halfA: 50, halfB: 65, exponent: 2.8 },
        { posMm: 0, offsetU: 0, halfA: 60, halfB: 78, exponent: 3.0 },
        { posMm: 100, offsetU: 0, halfA: 50, halfB: 65, exponent: 2.8 },
      ],
    };
    const solidRes = buildCsgSolidGeometry(solidLoftNode, 'standard', 42);
    const hollowRes = buildCsgSolidGeometry(
      { op: 'shellWall', wallThickness: 4, shellOpenFace: '-y', children: [solidLoftNode] },
      'standard',
      42
    );
    const seamRes = buildCsgSolidGeometry(
      { op: 'panelSeam', seamAxis: 'y', seamOffsetMm: 0, seamWidthMm: 1.5, seamDepthMm: 2.0, children: [solidLoftNode] },
      'standard',
      42
    );

    const solidMesh = new THREE.Mesh(solidRes.geometry);
    const hollowMesh = new THREE.Mesh(hollowRes.geometry);
    const seamMesh = new THREE.Mesh(seamRes.geometry);
    const solidVolCm3 = computeMeshVolumeAndCentroidMm(solidMesh).volumeCm3;
    const hollowVolCm3 = computeMeshVolumeAndCentroidMm(hollowMesh).volumeCm3;
    const seamVolCm3 = computeMeshVolumeAndCentroidMm(seamMesh).volumeCm3;
    solidRes.geometry.dispose();
    hollowRes.geometry.dispose();
    seamRes.geometry.dispose();

    const go2Built = buildBlueprintAssembly(UNITREE_GO2_QUADRUPED_BLUEPRINT, 'standard', 4, false, [], new Set());
    const go2Mass = go2Built.metrology.massProperties;
    disposeAssembly(go2Built);

    const shellPassed =
      solidRes.isWatertightManifold &&
      hollowRes.isWatertightManifold &&
      solidVolCm3 > 100 &&
      hollowVolCm3 > 10 &&
      hollowVolCm3 < solidVolCm3 * 0.7;
    const seamPassed =
      seamRes.isWatertightManifold &&
      seamVolCm3 > 100 &&
      seamVolCm3 < solidVolCm3 - 1.0;
    const massPassed =
      Boolean(go2Mass) &&
      (go2Mass?.totalMassKg ?? 0) > 5 &&
      (go2Mass?.supportPolygonXZMm.length ?? 0) >= 4 &&
      go2Mass?.stabilityStatus === 'stable' &&
      (go2Mass?.stabilityMarginMm ?? 0) > 20;
    const guard6Passed = shellPassed && seamPassed && massPassed;

    console.log(
      `GUARD 1 (Mis-Tilted -9° GPS Cap): ${caughtGps && !r1.gateSnapshot.passed ? 'CAUGHT & REJECTED' : 'MISSED'} | ` +
        JSON.stringify(
          (r1.report.unblendedMounts ?? [])
            .filter((m) => m.partId === 'go2-brow-gps-puck')
            .map((m) => ({ reason: m.reason, minGap: m.minSurfaceGapMm, maxRimGap: m.maxRimGapMm }))
        )
    );
    console.log(
      `GUARD 2 (Dropped -10mm LiDAR+Cage Cluster): ${caughtLidar && !r2.gateSnapshot.passed ? 'CAUGHT & REJECTED' : 'MISSED'} | floating=${r2.gateSnapshot.floatingCount} unblended=${r2.gateSnapshot.unblendedMountCount}`
    );
    console.log(
      `GUARD 3 (Unblended Sloped Snout — Original LiDAR Defect Inside Host AABB): ${caughtNoCowl && !r3.gateSnapshot.passed ? 'CAUGHT & REJECTED' : 'MISSED'} | floating=${r3.gateSnapshot.floatingCount} unblended=${r3.gateSnapshot.unblendedMountCount}`
    );
    console.log(
      `GUARD 4 (Zero-Token Auto-Tilt Recovery of -9° GPS Cap): ${guard4Passed ? 'AUTO-FIXED TO 100/100 PASS' : 'FAILED'} | ` +
        `H:${autoTiltRes.evaluation.gateSnapshot.healthScore} rot:[${fixedPuck.rotationDeg.join(', ')}]° Mnt:${autoTiltRes.evaluation.gateSnapshot.unblendedMountCount ?? 0} fixes:${autoTiltRes.appliedFixes.length}`
    );
    if (!guard4Passed) {
      console.log('   Guard 4 defects:', autoTiltRes.evaluation.gateSnapshot.topDefects);
      console.log('   Guard 4 appliedFixes:', autoTiltRes.appliedFixes);
    }
    console.log(
      `GUARD 5 (Sculptural Ops + blendedMount + mirrorAcross + Linear/Polar Pattern): ${guard5Passed ? '12/12 WATERTIGHT 100/100 PASS' : 'FAILED'} | ` +
        `H:${r5.gateSnapshot.healthScore} CSG:${r5.gateSnapshot.watertightCsgCount}/${r5.gateSnapshot.totalPartCount} C:${r5.gateSnapshot.hardClashCount}H/${r5.gateSnapshot.warningClashCount}W Flt:${r5.gateSnapshot.floatingCount} Mnt:${r5.gateSnapshot.unblendedMountCount ?? 0}`
    );
    if (!guard5Passed) {
      console.log('   Guard 5 defects:', r5.gateSnapshot.topDefects);
    }
    console.log(
      `GUARD 6 (shellWall + panelSeam + Mass/CoG/Stability Engine): ${guard6Passed ? 'WATERTIGHT & STABLE PASS' : 'FAILED'} | ` +
        `solid=${solidVolCm3.toFixed(1)}cm³ hollow=${hollowVolCm3.toFixed(1)}cm³(${((hollowVolCm3 / Math.max(1, solidVolCm3)) * 100).toFixed(0)}%) ` +
        `seam=${seamVolCm3.toFixed(1)}cm³ Go2=${go2Mass?.totalMassKg.toFixed(2)}kg hull=${go2Mass?.supportPolygonXZMm.length}pts margin=${go2Mass?.stabilityMarginMm}mm(${go2Mass?.stabilityStatus})`
    );

    process.exit(
      caughtGps &&
        !r1.gateSnapshot.passed &&
        caughtLidar &&
        !r2.gateSnapshot.passed &&
        caughtNoCowl &&
        !r3.gateSnapshot.passed &&
        guard4Passed &&
        guard5Passed &&
        guard6Passed
        ? 0
        : 1
    );
  }

  if (flatPatternTarget) {
    const targets =
      flatPatternTarget === 'all' ? BLUEPRINTS : [findBlueprint(flatPatternTarget)].filter(Boolean);
    if (targets.length === 0) {
      console.error(`No blueprint matched "${flatPatternTarget}".`);
      process.exit(1);
    }
    const output = targets.map((bp) => ({
      blueprintId: bp!.id,
      flatPatterns: collectBlueprintFlatPatterns(bp!),
    }));
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }

  if (verifyTarget) {
    const targets = verifyTarget === 'all' ? BLUEPRINTS : [findBlueprint(verifyTarget)].filter(Boolean);
    if (targets.length === 0) {
      console.error(`No blueprint matched "${verifyTarget}". Available: ${BLUEPRINTS.map((b) => b.id).join(', ')}`);
      process.exit(1);
    }
    if (verifyTarget === 'all') {
      let anyFailed = false;
      for (const bp of targets) {
        if (!bp) continue;
        const res = await evaluateBlueprintInKernel(bp, 0, 'CLI Kernel Gate');
        const g = res.gateSnapshot;
        if (!g.passed) anyFailed = true;
        const acc = g.accuracyMetrics;
        const fpCount = collectBlueprintFlatPatterns(bp).length;
        console.log(
          [
            g.passed ? 'PASS' : 'FAIL',
            bp.id.padEnd(34),
            `H:${g.healthScore}`.padEnd(6),
            `Acc:${acc?.accuracyScore ?? 0}`.padEnd(7),
            `Env:${acc ? `${acc.envelopeErrorPct}%` : '-'}`.padEnd(10),
            `Feat:${acc ? `${Math.round(acc.featureRichnessPct)}%` : '-'}`.padEnd(9),
            `CSG:${g.watertightCsgCount}/${g.totalCsgCount}/${g.totalPartCount}`.padEnd(13),
            `C:${g.hardClashCount}H/${g.warningClashCount}W`.padEnd(9),
            `Flt:${g.floatingCount}`.padEnd(6),
            `Bur:${g.occludedCount}`.padEnd(6),
            `Mnt:${g.unblendedMountCount ?? 0}`.padEnd(6),
            `FP:${fpCount}`.padEnd(5),
            `J:${res.report.joints.length}`,
          ].join(' | ')
        );
        if (!g.passed) {
          for (const d of g.topDefects.slice(0, 8)) console.log(`    -> ${d}`);
          for (const m of (g.mtvFixes ?? []).slice(0, 4)) console.log(`       ${m}`);
        }
      }
      process.exit(anyFailed ? 1 : 0);
    }
    const bp = targets[0]!;
    const res = await evaluateBlueprintInKernel(bp, 0, 'CLI Kernel Gate');
    console.log(JSON.stringify({ blueprintId: bp.id, gate: res.gateSnapshot, failingPartIds: res.failingPartIds }, null, 2));
    process.exit(res.gateSnapshot.passed ? 0 : 1);
  }

  let imageBase64: string | undefined;
  let mimeType: string | undefined;
  if (imagePath && fs.existsSync(imagePath)) {
    const ext = path.extname(imagePath).toLowerCase();
    mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    imageBase64 = `data:${mimeType};base64,${fs.readFileSync(imagePath).toString('base64')}`;
  }

  if (!repairTarget && !prompt && !imageBase64) {
    console.log(`18D Lightweight CAD Orchestrator CLI
Examples:
  npm run cad:orchestrate -- --verify amada-h1000-ii-reference
  npm run cad:orchestrate -- --repair amada-h1000-ii-reference --repairs 3 --out /tmp/amada.json
  npm run cad:orchestrate -- --prompt "50-ton hydraulic C-frame press" --workers 3 --repairs 3 --out /tmp/press.json`);
    process.exit(0);
  }

  let job;
  if (repairTarget) {
    const bp = findBlueprint(repairTarget);
    if (!bp) {
      console.error(`No blueprint matched "${repairTarget}".`);
      process.exit(1);
    }
    job = startOrchestratorJob({
      mode: 'auditAndUpgrade',
      currentBlueprint: bp,
      prompt,
      maxRepairIterations: repairs,
    });
  } else {
    job = startOrchestratorJob({
      mode: 'build',
      prompt,
      imageBase64,
      mimeType,
      targetWidthMm: widthStr ? Number(widthStr) : undefined,
      workerCount: workers,
      maxRepairIterations: repairs,
    });
  }

  let printedEvents = 0;
  while (true) {
    const snap = getOrchestratorJob(job.jobId);
    if (!snap) break;
    while (printedEvents < snap.events.length) {
      const ev = snap.events[printedEvents++];
      const dur = ev.durationMs !== undefined ? ` (${(ev.durationMs / 1000).toFixed(1)}s)` : '';
      console.log(`[${ev.stage.toUpperCase()} · ${ev.status.toUpperCase()}] ${ev.title}${dur} — ${ev.detail}`);
    }
    if (snap.status !== 'running') {
      if (snap.status === 'failed') {
        console.error(`FAILED: ${snap.error}`);
        process.exit(1);
      }
      if (outPath && snap.blueprint) {
        fs.writeFileSync(outPath, JSON.stringify(snap.blueprint, null, 2), 'utf8');
        console.log(`Saved orchestrated blueprint to ${outPath}`);
      }
      const lastGate = snap.gateHistory[snap.gateHistory.length - 1];
      console.log(`\nFINAL VERDICT: ${lastGate?.healthScore ?? 0}/100 (${lastGate?.passed ? 'PASS' : 'NEEDS REVIEW'})`);
      process.exit(lastGate?.passed ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 750));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
