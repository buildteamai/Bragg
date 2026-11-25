#!/usr/bin/env tsx
/**
 * 18D -> SOT Complete Operable Package Transfer CLI
 *
 * Compiles any 18D blueprint headless (watertight manifold-3d CSG + Installation
 * FloorMarks + 3D Utility Stub-Ups + Simulation Workpiece/JetBeam + kit_runtime
 * live launcher + Edge HMI) into a self-contained SOT equipment package and
 * runs SOT verification gates (uv_check.py + machine_install.py).
 *
 * Usage:
 *   npm run sot:transfer -- flow-mach500-4020-waterjet-v1
 *   npm run sot:transfer -- amada-h1000-ii-reference --out C:\path\to\dir
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { ensureManifoldReady, setManifoldWasmPath } from '../src/engine/manifoldKernel';
import { buildBlueprintAssembly, disposeAssembly } from '../src/engine/meshKernel';
import { serializeGroupToSotUsda } from '../src/engine/sotUsdExporter';
import { buildSotSimManifest } from '../src/engine/machineSimEngine';
import type { MeshBlueprint } from '../src/types/blueprint';

import { FLOW_MACH500_WATERJET_BLUEPRINT } from '../src/data/flowMach500WaterjetBlueprint';
import { AMADA_H1000_REFERENCE_BLUEPRINT } from '../src/data/amadaH1000Blueprint';
import { DMU_125_REFERENCE_BLUEPRINT } from '../src/data/dmu125Blueprint';
import { HAIMER_UNO_2070_BLUEPRINT } from '../src/data/haimerUnoBlueprint';
import { WELDING_TABLE_SYSTEM28_BLUEPRINT } from '../src/data/weldingTableBlueprint';
import { GALVANIZED_WORK_PLATFORM_BLUEPRINT } from '../src/data/galvanizedWorkPlatformBlueprint';
import { PRECISION_GEARBOX_BLUEPRINT } from '../src/data/precisionGearboxBlueprint';
import { INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT } from '../src/data/industrialPipingSystemBlueprint';
import { COPPER_PRV_MANIFOLD_BLUEPRINT } from '../src/data/copperPrvManifoldBlueprint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const SOT_ROOT = process.env.SOT_ROOT || path.resolve(APP_ROOT, '..', '..');

const REGISTRY: MeshBlueprint[] = [
  FLOW_MACH500_WATERJET_BLUEPRINT,
  AMADA_H1000_REFERENCE_BLUEPRINT,
  DMU_125_REFERENCE_BLUEPRINT,
  HAIMER_UNO_2070_BLUEPRINT,
  WELDING_TABLE_SYSTEM28_BLUEPRINT,
  GALVANIZED_WORK_PLATFORM_BLUEPRINT,
  PRECISION_GEARBOX_BLUEPRINT,
  INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT,
  COPPER_PRV_MANIFOLD_BLUEPRINT,
];

function parseArgs(argv: string[]) {
  let target = '';
  let outDir = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      outDir = argv[++i];
    } else if (!argv[i].startsWith('-') && !target) {
      target = argv[i];
    }
  }
  return { target, outDir };
}

function findBlueprint(query: string): MeshBlueprint | undefined {
  const q = query.trim().toLowerCase();
  return (
    REGISTRY.find((b) => b.id.toLowerCase() === q) ||
    REGISTRY.find((b) => b.id.toLowerCase().includes(q) || b.name.toLowerCase().includes(q))
  );
}

async function main() {
  const { target, outDir } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.log('Usage: npm run sot:transfer -- <model-id-or-name> [--out <dir>]');
    console.log('Available models:');
    REGISTRY.forEach((b) => console.log(`  - ${b.id} (${b.name})`));
    process.exit(1);
  }

  const bp = findBlueprint(target);
  if (!bp) {
    console.error(`No blueprint matched "${target}".`);
    process.exit(1);
  }

  const wasmPath = path.join(APP_ROOT, 'node_modules', 'manifold-3d', 'manifold.wasm');
  setManifoldWasmPath(wasmPath);
  const ready = await ensureManifoldReady();
  if (!ready) throw new Error('manifold-3d WASM failed to initialize.');

  const safeFolder = bp.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const pkgDir = outDir
    ? path.resolve(outDir)
    : path.join(SOT_ROOT, '_library', 'equipment', safeFolder);
  const runtimeDir = path.join(pkgDir, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  console.log(`\n=== 18D -> SOT Package Transfer: ${bp.name} ===`);
  console.log(`Target package: ${pkgDir}`);

  // 1. Build clean un-exploded assembly at ultra (100%) tessellation fidelity in mm
  const built = buildBlueprintAssembly(bp, 'ultra', 4, false, [], new Set());
  const exportGroup = new THREE.Group();
  exportGroup.name = bp.name;
  built.rootGroup.updateMatrixWorld(true);
  const clonedGeos: THREE.BufferGeometry[] = [];

  for (const child of built.partMeshes) {
    if (!child.visible) continue;
    const geo = child.geometry.clone();
    geo.applyMatrix4(child.matrixWorld);
    geo.scale(1000, 1000, 1000);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    clonedGeos.push(geo);
    const mesh = new THREE.Mesh(
      geo,
      (child.userData.originalMaterial as THREE.Material) || child.material
    );
    mesh.name = child.name;
    mesh.userData = {
      partId: child.userData.partId,
      finishName: child.userData.finishName,
      isDecal: child.userData.isDecal,
    };
    exportGroup.add(mesh);
  }

  // 2. Write SOT OpenUSD (.usda)
  const usdaPath = path.join(pkgDir, `${safeFolder}.usda`);
  const usdaText = serializeGroupToSotUsda(exportGroup, bp, 1);
  fs.writeFileSync(usdaPath, usdaText, 'utf-8');
  console.log(`  [1/5] Wrote OpenUSD stage: ${usdaPath} (${(usdaText.length / 1024).toFixed(1)} KB)`);

  clonedGeos.forEach((g) => g.dispose());
  disposeAssembly(built);

  // 3. Write SOT kit_runtime manifest.json
  const manifestPath = path.join(pkgDir, 'manifest.json');
  const manifest = buildSotSimManifest(bp);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`  [2/5] Wrote kit_runtime manifest: ${manifestPath}`);

  // 4. Write runtime\model_runtime.py + copy kit_runtime templates
  const templatesDir = path.join(SOT_ROOT, '_library', '_lib', 'kit_runtime', 'templates');
  const modelRuntimePy = `"""Live Omniverse Kit runtime for ${bp.name} (transferred from 18D)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG_DIR = os.path.dirname(HERE)
STAGE_PATH = os.path.join(PKG_DIR, "${safeFolder}.usda")
MANIFEST_PATH = os.path.join(PKG_DIR, "manifest.json")
HMI_HTML = os.path.join(HERE, "hmi_index.html")


def start(stage_path=None):
    from kit_runtime import sim_18d
    return sim_18d.start(
        stage_path=stage_path or STAGE_PATH,
        manifest_path=MANIFEST_PATH,
        hmi_html=HMI_HTML,
    )
`;
  fs.writeFileSync(path.join(runtimeDir, 'model_runtime.py'), modelRuntimePy, 'utf-8');

  if (fs.existsSync(templatesDir)) {
    const bootSrc = fs.readFileSync(path.join(templatesDir, 'kit_boot.py'), 'utf-8');
    fs.writeFileSync(
      path.join(runtimeDir, 'kit_boot.py'),
      bootSrc.replace('{{RUNTIME_MODULE}}', 'model_runtime'),
      'utf-8'
    );
    for (const f of ['LAUNCH_OMNIVERSE.cmd', 'HMI.cmd', 'hmi_index.html']) {
      const src = path.join(templatesDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(runtimeDir, f));
      }
    }
  }
  console.log(`  [3/5] Wrote Kit live runtime & Edge HMI launchers in ${runtimeDir}`);

  // 5. Run SOT verification gates & export facility schedule.json
  const uvCheckPy = path.join(SOT_ROOT, 'Setups', 'lib', 'uv_check.py');
  const instPy = path.join(SOT_ROOT, 'Setups', 'lib', 'machine_install.py');
  const schedulePath = path.join(pkgDir, 'schedule.json');

  console.log('  [4/5] Running SOT gates (uv_check.py + machine_install.py)...');
  execFileSync('python', [uvCheckPy, usdaPath], { stdio: 'inherit' });
  execFileSync('python', [instPy, 'check', usdaPath], { stdio: 'inherit' });
  execFileSync('python', [instPy, 'export-schedule', usdaPath, '--out', schedulePath], {
    stdio: 'inherit',
  });
  console.log(`  [5/5] Complete! Launch in Kit via: ${path.join(runtimeDir, 'LAUNCH_OMNIVERSE.cmd')}\n`);
}

main().catch((err) => {
  console.error('Transfer failed:', err);
  process.exit(1);
});
