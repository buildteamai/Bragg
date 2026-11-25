import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import {
  ensureManifoldReady,
  setManifoldWasmPath,
} from '../src/engine/manifoldKernel';
import {
  buildBlueprintAssembly,
  disposeAssembly,
  MM_TO_SCENE,
} from '../src/engine/meshKernel';
import {
  serializeGroupToSotUsda,
  SotMeshTextureBindings,
} from '../src/engine/sotUsdExporter';
import type {
  MeshBlueprint,
  ProjectedDecalSpec,
  TessellationDensity,
} from '../src/types/blueprint';

import { AMADA_H1000_REFERENCE_BLUEPRINT } from '../src/data/amadaH1000Blueprint';
import { BANWOOD_CRUISER_SKATEBOARD_BLUEPRINT } from '../src/data/banwoodCruiserSkateboardBlueprint';
import { COPPER_PRV_MANIFOLD_BLUEPRINT } from '../src/data/copperPrvManifoldBlueprint';
import { CRAFTSMAN_V20_DRILL_BLUEPRINT } from '../src/data/craftsmanV20DrillBlueprint';
import { DMU_125_REFERENCE_BLUEPRINT } from '../src/data/dmu125Blueprint';
import { FIREPLACE_MANTEL_REFERENCE_BLUEPRINT } from '../src/data/fireplaceMantelBlueprint';
import { FLOW_MACH500_WATERJET_BLUEPRINT } from '../src/data/flowMach500WaterjetBlueprint';
import { GALVANIZED_WORK_PLATFORM_BLUEPRINT } from '../src/data/galvanizedWorkPlatformBlueprint';
import { HAIMER_UNO_2070_BLUEPRINT } from '../src/data/haimerUnoBlueprint';
import { INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT } from '../src/data/industrialPipingSystemBlueprint';
import { ORIGAMI_DIAGRID_VASE_BLUEPRINT } from '../src/data/origamiDiagridVaseBlueprint';
import { PRECISION_GEARBOX_BLUEPRINT } from '../src/data/precisionGearboxBlueprint';
import { RYOBI_RECIPROCATING_SAW_BLUEPRINT } from '../src/data/ryobiReciprocatingSawBlueprint';
import { STEEL_COLUMN_CONNECTION_BLUEPRINT } from '../src/data/steelColumnConnectionBlueprint';
import { ULINE_CLAW_HAMMER_BLUEPRINT } from '../src/data/ulineClawHammerBlueprint';
import { UNITREE_GO2_QUADRUPED_BLUEPRINT } from '../src/data/unitreeGo2Blueprint';
import { WELDING_TABLE_SYSTEM28_BLUEPRINT } from '../src/data/weldingTableBlueprint';

const ALL_BLUEPRINTS: MeshBlueprint[] = [
  AMADA_H1000_REFERENCE_BLUEPRINT,
  BANWOOD_CRUISER_SKATEBOARD_BLUEPRINT,
  COPPER_PRV_MANIFOLD_BLUEPRINT,
  CRAFTSMAN_V20_DRILL_BLUEPRINT,
  DMU_125_REFERENCE_BLUEPRINT,
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
const SOT_ROOT = process.env.SOT_ROOT || path.resolve(__dirname, '../../..');

function escXml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFileKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'tex';
}

/**
 * Generates crisp high-res SVG for a ProjectedDecalSpec (branding or SOT signage).
 * Uses SOT Setups/lib/signage.py for standards-compliant signage when spec.signage is present.
 */
function renderDecalSvg(spec: ProjectedDecalSpec): string {
  const aspect =
    spec.sizeMm && spec.sizeMm[1] > 0
      ? Math.max(0.4, Math.min(8, spec.sizeMm[0] / spec.sizeMm[1]))
      : 2.0;

  if (spec.signage) {
    const signageScript = path.join(SOT_ROOT, 'Setups', 'lib', 'signage.py');
    if (fs.existsSync(signageScript)) {
      const tmpSpecPath = path.join(__dirname, `.tmp-signage-${sanitizeFileKey(spec.id)}.json`);
      const tmpSvgPath = path.join(__dirname, `.tmp-signage-${sanitizeFileKey(spec.id)}.svg`);
      try {
        const wIn = Math.max(2, Number((spec.sizeMm[0] / 25.4).toFixed(2)));
        const hIn = Math.max(1.5, Number((spec.sizeMm[1] / 25.4).toFixed(2)));
        const payload = { ...spec.signage, width_in: wIn, height_in: hIn };
        fs.writeFileSync(tmpSpecPath, JSON.stringify(payload, null, 2), 'utf8');
        execFileSync('python', [signageScript, 'render', '--spec', tmpSpecPath, '--out', tmpSvgPath], {
          stdio: 'pipe',
        });
        return fs.readFileSync(tmpSvgPath, 'utf8');
      } finally {
        if (fs.existsSync(tmpSpecPath)) fs.unlinkSync(tmpSpecPath);
        if (fs.existsSync(tmpSvgPath)) fs.unlinkSync(tmpSvgPath);
      }
    }
  }

  // Branding / text decal SVG
  const h = 320;
  const w = Math.round(h * aspect);
  const bg = spec.bgHex || 'none';
  const fg = spec.colorHex || '#0093b8';
  const mainSize = Math.round(h * (spec.subtext ? 0.36 : 0.48));
  const subSize = Math.round(h * 0.17);
  const mainY = spec.subtext ? Math.round(h * 0.44) : Math.round(h * 0.62);
  const subY = Math.round(h * 0.78);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    bg !== 'none'
      ? `  <rect x="0" y="0" width="${w}" height="${h}" rx="12" fill="${escXml(bg)}" stroke="${escXml(fg)}" stroke-width="6"/>`
      : '',
    `  <rect x="24" y="${Math.round(h * 0.16)}" width="14" height="${Math.round(h * 0.68)}" rx="4" fill="${escXml(fg)}"/>`,
    `  <text x="${Math.round(w / 2)}" y="${mainY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${mainSize}" fill="${escXml(fg)}">${escXml(spec.text)}</text>`,
    spec.subtext
      ? `  <text x="${Math.round(w / 2)}" y="${subY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="${subSize}" letter-spacing="2" fill="#252a32">${escXml(spec.subtext)}</text>`
      : '',
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Generates a high-res FlowMaster CNC Waterjet HMI touchscreen SVG (1024x640).
 */
function renderIndustrialConsoleSvg(blueprintName: string): string {
  const isWaterjet = /waterjet|flow|mach\s*500/i.test(blueprintName);
  const title = isWaterjet ? 'FlowMaster®  |  MACH 500 4020 XD' : 'CNC INDUSTRIAL HMI CONTROLLER';
  const pressure = isWaterjet ? '94,000 PSI' : '68 m/min';
  const pressureLabel = isWaterjet ? 'HYPERJET 50HP INTENSIFIER' : 'SPINDLE / BLADE SPEED';
  const feed = isWaterjet ? '1,240 mm/min' : '14 mm/min';
  const abrasive = isWaterjet ? '0.85 lb/min (80 Mesh)' : 'AUTO COOLANT ON';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640" viewBox="0 0 1024 640">
  <rect width="1024" height="640" fill="#0d131a"/>
  <rect x="10" y="10" width="1004" height="620" rx="12" fill="#121b24" stroke="#0093b8" stroke-width="4"/>
  <!-- Top Status Bar -->
  <rect x="14" y="14" width="996" height="58" rx="8" fill="#0093b8"/>
  <text x="36" y="51" font-family="Arial, sans-serif" font-weight="800" font-size="26" fill="#ffffff">${escXml(title)}</text>
  <rect x="820" y="24" width="170" height="38" rx="6" fill="#059669"/>
  <text x="905" y="49" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="20" fill="#ffffff">SYSTEM READY</text>

  <!-- Left CAD Toolpath Viewport -->
  <rect x="30" y="92" width="560" height="390" rx="8" fill="#080d12" stroke="#1e293b" stroke-width="3"/>
  <g stroke="#132233" stroke-width="1">
    <line x1="30" y1="170" x2="590" y2="170"/><line x1="30" y1="248" x2="590" y2="248"/>
    <line x1="30" y1="326" x2="590" y2="326"/><line x1="30" y1="404" x2="590" y2="404"/>
    <line x1="142" y1="92" x2="142" y2="482"/><line x1="254" y1="92" x2="254" y2="482"/>
    <line x1="366" y1="92" x2="366" y2="482"/><line x1="478" y1="92" x2="478" y2="482"/>
  </g>
  <rect x="85" y="145" width="450" height="280" rx="18" fill="none" stroke="#38bdf8" stroke-width="4"/>
  <circle cx="205" cy="285" r="78" fill="none" stroke="#00e5ff" stroke-width="4"/>
  <circle cx="415" cy="285" r="56" fill="none" stroke="#22c55e" stroke-width="4" stroke-dasharray="10,6"/>
  <line x1="205" y1="285" x2="415" y2="285" stroke="#f59e0b" stroke-width="3" stroke-dasharray="8,6"/>
  <circle cx="310" cy="285" r="10" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
  <text x="48" y="122" font-family="Consolas, monospace" font-size="16" fill="#38bdf8">TOOLPATH: PART_4020_NEST.ORD  |  6061-T6 12.7mm</text>

  <!-- Right Telemetry Cards -->
  <rect x="614" y="92" width="380" height="122" rx="8" fill="#0b1117" stroke="#1e293b" stroke-width="2"/>
  <text x="634" y="124" font-family="Arial, sans-serif" font-weight="700" font-size="15" fill="#94a3b8">${escXml(pressureLabel)}</text>
  <text x="634" y="186" font-family="Consolas, monospace" font-weight="800" font-size="50" fill="#00e5ff">${escXml(pressure)}</text>

  <rect x="614" y="232" width="380" height="114" rx="8" fill="#0b1117" stroke="#1e293b" stroke-width="2"/>
  <text x="634" y="264" font-family="Arial, sans-serif" font-weight="700" font-size="15" fill="#94a3b8">CUTTING FEED / ABRASIVE</text>
  <text x="634" y="302" font-family="Consolas, monospace" font-weight="700" font-size="26" fill="#e2e8f0">FEED: ${escXml(feed)}</text>
  <text x="634" y="332" font-family="Consolas, monospace" font-weight="600" font-size="20" fill="#38bdf8">ABT:  ${escXml(abrasive)}</text>

  <rect x="614" y="364" width="380" height="118" rx="8" fill="#0b1117" stroke="#1e293b" stroke-width="2"/>
  <text x="634" y="394" font-family="Arial, sans-serif" font-weight="700" font-size="15" fill="#94a3b8">MACHINE AXIS DRO (MM)</text>
  <text x="634" y="428" font-family="Consolas, monospace" font-weight="700" font-size="24" fill="#22c55e">X: 2040.00   Y: 1015.40</text>
  <text x="634" y="462" font-family="Consolas, monospace" font-weight="700" font-size="24" fill="#eab308">Z:  142.50   A/B: 0.00°</text>

  <!-- Bottom Softkey Row -->
  <rect x="30" y="508" width="180" height="92" rx="8" fill="#16a34a"/>
  <text x="120" y="563" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#ffffff">CYCLE START</text>

  <rect x="228" y="508" width="180" height="92" rx="8" fill="#d97706"/>
  <text x="318" y="563" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#ffffff">FEED HOLD</text>

  <rect x="426" y="508" width="180" height="92" rx="8" fill="#0284c7"/>
  <text x="516" y="563" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#ffffff">PUMP ON</text>

  <rect x="624" y="508" width="175" height="92" rx="8" fill="#334155"/>
  <text x="711" y="563" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#e2e8f0">HOME ALL</text>

  <rect x="817" y="508" width="177" height="92" rx="8" fill="#dc2626"/>
  <text x="905" y="563" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#ffffff">STOP</text>
</svg>`;
}

/**
 * Generates a tileable subtle brushed-metal diffuse/roughness texture PNG.
 */
async function writeBrushedMetalTextures(
  texDir: string,
  prefix: string,
  baseHex: string,
  roughBase: number
): Promise<{ diffuse: string; roughness: string }> {
  const w = 512;
  const h = 512;
  const col = new THREE.Color(baseHex);
  const r0 = Math.round(Math.pow(col.r, 1 / 2.2) * 255);
  const g0 = Math.round(Math.pow(col.g, 1 / 2.2) * 255);
  const b0 = Math.round(Math.pow(col.b, 1 / 2.2) * 255);

  const diffBuf = Buffer.alloc(w * h * 4);
  const roughBuf = Buffer.alloc(w * h * 4);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let y = 0; y < h; y++) {
    const streak = (rand() - 0.5) * 18;
    for (let x = 0; x < w; x++) {
      const grain = (rand() - 0.5) * 6;
      const delta = streak + grain;
      const idx = (y * w + x) * 4;
      diffBuf[idx] = Math.max(0, Math.min(255, Math.round(r0 + delta)));
      diffBuf[idx + 1] = Math.max(0, Math.min(255, Math.round(g0 + delta)));
      diffBuf[idx + 2] = Math.max(0, Math.min(255, Math.round(b0 + delta)));
      diffBuf[idx + 3] = 255;

      const rv = Math.max(
        20,
        Math.min(245, Math.round(roughBase * 255 + (streak * 0.6 + grain) * 1.4))
      );
      roughBuf[idx] = rv;
      roughBuf[idx + 1] = rv;
      roughBuf[idx + 2] = rv;
      roughBuf[idx + 3] = 255;
    }
  }

  const diffName = `${prefix}_diffuse.png`;
  const roughName = `${prefix}_roughness.png`;
  await sharp(diffBuf, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(path.join(texDir, diffName));
  await sharp(roughBuf, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(path.join(texDir, roughName));

  return {
    diffuse: `./textures/${diffName}`,
    roughness: `./textures/${roughName}`,
  };
}

function parseArgs(argv: string[]) {
  let modelId = 'flow-mach500-4020-waterjet';
  let outDir = '';
  let density: TessellationDensity = 'standard';
  let packageUsdz = true;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' && argv[i + 1]) modelId = argv[++i];
    else if (a === '--out' && argv[i + 1]) outDir = argv[++i];
    else if (a === '--density' && argv[i + 1]) density = argv[++i] as TessellationDensity;
    else if (a === '--no-usdz') packageUsdz = false;
  }

  if (!outDir) {
    throw new Error('Missing required --out <directory> argument');
  }
  return { modelId, outDir, density, packageUsdz };
}

async function main() {
  const { modelId, outDir, density, packageUsdz } = parseArgs(process.argv.slice(2));
  const blueprint = ALL_BLUEPRINTS.find((b) => b.id === modelId);
  if (!blueprint) {
    throw new Error(
      `Unknown model '${modelId}'. Available: ${ALL_BLUEPRINTS.map((b) => b.id).join(', ')}`
    );
  }

  const wasmDiskPath = path.resolve(__dirname, '../node_modules/manifold-3d/manifold.wasm');
  setManifoldWasmPath(wasmDiskPath);
  await ensureManifoldReady();

  console.log(`[18D SOT Export] Building '${blueprint.name}' (${blueprint.id}) at density=${density}...`);
  const built = buildBlueprintAssembly(blueprint, density, 4, false, [], new Set());
  built.rootGroup.updateMatrixWorld(true);

  const pkgDir = path.join(outDir, blueprint.id);
  const texDir = path.join(pkgDir, 'textures');
  fs.mkdirSync(texDir, { recursive: true });

  // Generate procedural metallic textures for brushed stainless & galvanized slats
  const stainlessTex = await writeBrushedMetalTextures(texDir, 'stainless_304', '#aeb6bf', 0.34);
  const galvTex = await writeBrushedMetalTextures(texDir, 'galvanized_slat', '#7f8791', 0.48);

  const exportGroup = new THREE.Group();
  exportGroup.name = blueprint.name || '18D';
  const clonedGeometries: THREE.BufferGeometry[] = [];
  const meshByPartId = new Map<string, THREE.Mesh>();

  // 1. Add all solid assembly meshes (scaled to mm for serializeGroupToSotUsda)
  for (const child of built.partMeshes) {
    if (!child.visible) continue;
    const partId = child.userData.partId as string;
    meshByPartId.set(partId, child);

    const clonedGeo = child.geometry.clone();
    clonedGeo.applyMatrix4(child.matrixWorld);
    clonedGeo.scale(1000, 1000, 1000);
    if (!clonedGeo.attributes.normal) {
      clonedGeo.computeVertexNormals();
    }
    clonedGeometries.push(clonedGeo);

    const origMat = ((child.userData.originalMaterial as THREE.Material) || child.material) as THREE.MeshPhysicalMaterial;
    const finishName = (child.userData.finishName as string) || '';
    const mesh = new THREE.Mesh(clonedGeo, origMat);
    mesh.name = child.name;
    mesh.userData = {
      partId,
      finishName,
    };

    // Attach procedural textures to brushed stainless and galvanized slats
    if (/stainless.*tank/i.test(finishName)) {
      mesh.userData.sotTextures = {
        diffuse: stainlessTex.diffuse,
        roughness: stainlessTex.roughness,
        wrapMode: 'repeat',
      } satisfies SotMeshTextureBindings;
    } else if (/galvanized.*slat/i.test(finishName)) {
      mesh.userData.sotTextures = {
        diffuse: galvTex.diffuse,
        roughness: galvTex.roughness,
        wrapMode: 'repeat',
      } satisfies SotMeshTextureBindings;
    }

    exportGroup.add(mesh);

    // If this part has textureKind === 'industrialConsole', add a crisp front-face HMI screen overlay
    const partSpec = blueprint.parts.find((p) => p.id === partId);
    if (partSpec?.material?.textureKind === 'industrialConsole') {
      const hmiFile = `hmi_console_${sanitizeFileKey(partId)}.png`;
      const hmiSvg = renderIndustrialConsoleSvg(blueprint.name);
      await sharp(Buffer.from(hmiSvg)).png().toFile(path.join(texDir, hmiFile));

      child.geometry.computeBoundingBox();
      const bb = child.geometry.boundingBox!;
      const sz = new THREE.Vector3();
      const ctr = new THREE.Vector3();
      bb.getSize(sz);
      bb.getCenter(ctr);

      const screenGeo = new THREE.PlaneGeometry(sz.x * 0.90, sz.y * 0.86);
      screenGeo.translate(ctr.x, ctr.y, bb.max.z + 0.0012);
      screenGeo.applyMatrix4(child.matrixWorld);
      screenGeo.scale(1000, 1000, 1000);
      clonedGeometries.push(screenGeo);

      const screenMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#ffffff'),
        metalness: 0.05,
        roughness: 0.14,
        clearcoat: 0.85,
        clearcoatRoughness: 0.08,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.45,
      });
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.name = `${child.name} Screen`;
      screenMesh.userData = {
        partId: `${partId}-screen`,
        finishName: 'FlowMaster HMI Screen Display',
        sotTextures: {
          diffuse: `./textures/${hmiFile}`,
          emissive: `./textures/${hmiFile}`,
          wrapMode: 'clamp',
        } satisfies SotMeshTextureBindings,
      };
      exportGroup.add(screenMesh);
    }
  }

  // 2. Project all blueprint decals & SOT signage plates onto their target meshes
  let decalCount = 0;
  if (Array.isArray(blueprint.decals) && blueprint.decals.length > 0) {
    for (const spec of blueprint.decals) {
      const target = meshByPartId.get(spec.targetPartId);
      if (!target || !target.geometry) {
        console.warn(`  [decal] Skipping '${spec.id}' — target part '${spec.targetPartId}' not found`);
        continue;
      }

      const pos = new THREE.Vector3(
        spec.positionMm[0] * MM_TO_SCENE,
        spec.positionMm[1] * MM_TO_SCENE + built.groundOffsetY,
        spec.positionMm[2] * MM_TO_SCENE
      );
      const orient = new THREE.Euler(
        THREE.MathUtils.degToRad(spec.rotationDeg[0]),
        THREE.MathUtils.degToRad(spec.rotationDeg[1]),
        THREE.MathUtils.degToRad(spec.rotationDeg[2]),
        'XYZ'
      );
      const size = new THREE.Vector3(
        Math.max(0.005, spec.sizeMm[0] * MM_TO_SCENE),
        Math.max(0.005, spec.sizeMm[1] * MM_TO_SCENE),
        Math.max(0.004, spec.sizeMm[2] * MM_TO_SCENE)
      );

      let decalGeo: THREE.BufferGeometry;
      try {
        decalGeo = new DecalGeometry(target, pos, orient, size);
      } catch (err) {
        console.warn(`  [decal] DecalGeometry failed for '${spec.id}':`, err);
        continue;
      }

      if (!decalGeo.attributes.position || decalGeo.attributes.position.count === 0) {
        decalGeo.dispose();
        console.warn(`  [decal] Empty projection for '${spec.id}' on '${spec.targetPartId}'`);
        continue;
      }

      // Offset vertices 1.2 mm along their outward normal to prevent Z-fighting in USD renderers
      const posAttr = decalGeo.attributes.position;
      const normAttr = decalGeo.attributes.normal;
      if (normAttr) {
        for (let i = 0; i < posAttr.count; i++) {
          posAttr.setXYZ(
            i,
            posAttr.getX(i) + normAttr.getX(i) * 0.0012,
            posAttr.getY(i) + normAttr.getY(i) * 0.0012,
            posAttr.getZ(i) + normAttr.getZ(i) * 0.0012
          );
        }
        posAttr.needsUpdate = true;
      }

      // Scale decal geometry from scene meters to mm for serializeGroupToSotUsda
      decalGeo.scale(1000, 1000, 1000);
      clonedGeometries.push(decalGeo);

      const decalFile = `decal_${sanitizeFileKey(spec.id)}.png`;
      const svg = renderDecalSvg(spec);
      await sharp(Buffer.from(svg)).png().toFile(path.join(texDir, decalFile));

      const decalMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#ffffff'),
        metalness: spec.signage?.template === 'rating_nameplate' ? 0.35 : 0.05,
        roughness: 0.32,
        clearcoat: 0.25,
        opacity: spec.opacity ?? 1.0,
      });

      const decalMesh = new THREE.Mesh(decalGeo, decalMat);
      decalMesh.name = `Decal_${spec.id}`;
      decalMesh.userData = {
        partId: `decal-${spec.id}`,
        finishName: `Decal_${spec.id}`,
        isDecal: true,
        sotTextures: {
          diffuse: `./textures/${decalFile}`,
          useAlphaOpacity: !spec.bgHex && !spec.signage,
          wrapMode: 'clamp',
        } satisfies SotMeshTextureBindings,
      };
      exportGroup.add(decalMesh);
      decalCount++;
    }
  }

  const usdaText = serializeGroupToSotUsda(exportGroup, blueprint, 1);
  const usdaPath = path.join(pkgDir, `${blueprint.id}.usda`);
  fs.writeFileSync(usdaPath, usdaText, 'utf8');

  for (const g of clonedGeometries) g.dispose();
  disposeAssembly(built);

  const texFiles = fs.readdirSync(texDir);
  console.log(`[18D SOT Export] Wrote ${usdaPath} (${(usdaText.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`[18D SOT Export] Parts: ${built.partMeshes.length}, Decals: ${decalCount}, Textures: ${texFiles.length}`);

  // 3. Run SOT uv_check.py to guarantee 0 textured meshes without primvars:st
  const uvCheckScript = path.join(SOT_ROOT, 'Setups', 'lib', 'uv_check.py');
  if (fs.existsSync(uvCheckScript)) {
    const out = execFileSync('python', [uvCheckScript, usdaPath], { encoding: 'utf8' });
    console.log(`[SOT uv_check] ${out.trim()}`);
  }

  // 4. Package self-contained .usdz via OpenUSD Sdf.ZipFileWriter (64-byte aligned, no OmniPBR.mdl localization error)
  if (packageUsdz) {
    const usdzPath = path.join(outDir, `${blueprint.id}.usdz`);
    const pyCode = [
      'import sys, os',
      'from pxr import Usd, UsdGeom, Sdf',
      'src, dst = sys.argv[1], sys.argv[2]',
      'pkg_dir = os.path.dirname(os.path.abspath(src))',
      'stage = Usd.Stage.Open(src)',
      'assert stage is not None, f"Failed to open {src}"',
      'z = Usd.ZipFileWriter.CreateNew(dst)',
      'z.AddFile(src, os.path.basename(src))',
      'tex_dir = os.path.join(pkg_dir, "textures")',
      'if os.path.isdir(tex_dir):',
      '    for fn in sorted(os.listdir(tex_dir)):',
      '        fp = os.path.join(tex_dir, fn)',
      '        if os.path.isfile(fp):',
      '            z.AddFile(fp, f"textures/{fn}")',
      'z.Save()',
      'st2 = Usd.Stage.Open(dst)',
      'assert st2 is not None and st2.GetDefaultPrim().IsValid(), f"Failed to validate {dst}"',
      'meshes = sum(1 for p in st2.Traverse() if p.IsA(UsdGeom.Mesh))',
      'print(f"USDZ ok: {dst} ({os.path.getsize(dst) / (1024*1024):.2f} MB, {meshes} meshes, upAxis={UsdGeom.GetStageUpAxis(st2)}, mpu={UsdGeom.GetStageMetersPerUnit(st2)})")',
    ].join('\n');
    const out = execFileSync('python', ['-c', pyCode, usdaPath, usdzPath], { encoding: 'utf8' });
    console.log(`[OpenUSD USDZ] ${out.trim()}`);
  }
}

main().catch((err) => {
  console.error('[18D SOT Export] ERROR:', err);
  process.exit(1);
});
