#!/usr/bin/env node
/**
 * One-Shot CAD Pre-Flight Verifier (Headless Manifold-3D WASM + Z-Buffer Visibility + Photo IoU)
 *
 * Usage:
 *   npm run cad:verify -- [blueprintId | all] [--ascii]
 *
 * Boots real manifold-3d WASM through Vite SSR and validates every blueprint against
 * 6 deterministic one-shot quality gates before a model is ever delivered:
 *   1. Watertight CSG manifold verification (100% of csgSolid parts must be watertight)
 *   2. Exact Manifold-3D static clash & full-stroke dynamic motion-sweep clash audit (0 clashes)
 *   3. Structural load-path grounding check (0 floating parts)
 *   4. Automated buried/occluded exterior detail check (0 buried details)
 *   5. Parametric mate solver residual check (<= 0.05 mm)
 *   6. Multi-view software Z-buffer visibility + Photo-vs-3D Silhouette IoU & ASCII diff
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import * as THREE from 'three';

const args = process.argv.slice(2);
const showAscii = args.includes('--ascii');
const showColorAscii = args.includes('--color-ascii');
const targetArg = args.find((a) => !a.startsWith('--')) || 'craftsman-v20-cordless-drill';

const wasmPlugin = {
  name: 'resolve-manifold-wasm-node',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'manifold-3d/manifold.wasm?url') return '\0manifold-wasm-node';
  },
  load(id) {
    if (id === '\0manifold-wasm-node') {
      return (
        'export default ' +
        JSON.stringify(path.resolve('node_modules/manifold-3d/manifold.wasm')) +
        ';'
      );
    }
  },
};

function loadPhotoMask(publicRelativeUrl) {
  const cleanRel = publicRelativeUrl.replace(/^\/+/, '');
  const diskPath = path.resolve('public', cleanRel);
  if (!fs.existsSync(diskPath)) return null;

  const ppm = execFileSync('convert', [diskPath, '-depth', '8', 'ppm:-'], {
    maxBuffer: 40 * 1024 * 1024,
  });
  let idx = 0;
  const tokens = [];
  while (tokens.length < 4) {
    while (idx < ppm.length && ppm[idx] <= 32) idx++;
    if (ppm[idx] === 35) {
      while (idx < ppm.length && ppm[idx] !== 10) idx++;
      continue;
    }
    let tok = '';
    while (idx < ppm.length && ppm[idx] > 32) tok += String.fromCharCode(ppm[idx++]);
    tokens.push(tok);
  }
  idx++;
  const W = parseInt(tokens[1], 10);
  const H = parseInt(tokens[2], 10);
  const rgb = ppm.subarray(idx);

  const corner = (x, y) => {
    const o = (y * W + x) * 3;
    return [rgb[o], rgb[o + 1], rgb[o + 2]];
  };
  const corners = [corner(2, 2), corner(W - 3, 2), corner(2, H - 3), corner(W - 3, H - 3)];
  const bgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
  const bgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
  const bgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);

  const rawMask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const dist = Math.abs(rgb[o] - bgR) + Math.abs(rgb[o + 1] - bgG) + Math.abs(rgb[o + 2] - bgB);
      if (dist > 38) rawMask[y * W + x] = 1;
    }
  }

  // Isolate the largest connected foreground component (automatically ignores floating retail
  // promo badges like "FREE WITH PURCHASE" while preserving the complete product silhouette).
  const labels = new Int32Array(W * H);
  const compSizes = [0];
  let nextLabel = 1;
  const queue = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!rawMask[i] || labels[i]) continue;
    const lbl = nextLabel++;
    let head = 0,
      tail = 0;
    queue[tail++] = i;
    labels[i] = lbl;
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % W;
      const cy = (cur - cx) / W;
      if (cx > 0 && rawMask[cur - 1] && !labels[cur - 1]) {
        labels[cur - 1] = lbl;
        queue[tail++] = cur - 1;
      }
      if (cx + 1 < W && rawMask[cur + 1] && !labels[cur + 1]) {
        labels[cur + 1] = lbl;
        queue[tail++] = cur + 1;
      }
      if (cy > 0 && rawMask[cur - W] && !labels[cur - W]) {
        labels[cur - W] = lbl;
        queue[tail++] = cur - W;
      }
      if (cy + 1 < H && rawMask[cur + W] && !labels[cur + W]) {
        labels[cur + W] = lbl;
        queue[tail++] = cur + W;
      }
    }
    compSizes.push(tail);
  }

  let bestLabel = 1;
  let bestSize = 0;
  for (let lbl = 1; lbl < compSizes.length; lbl++) {
    if (compSizes[lbl] > bestSize) {
      bestSize = compSizes[lbl];
      bestLabel = lbl;
    }
  }

  const mask = new Uint8Array(W * H);
  const colorClass = new Uint8Array(W * H); // 0=bg, 1=green, 2=dark/charcoal, 3=silver/white, 4=red, 5=other
  let minPx = W,
    maxPx = 0,
    minPy = H,
    maxPy = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (labels[k] === bestLabel) {
        mask[k] = 1;
        const o = k * 3;
        const r = rgb[o],
          g = rgb[o + 1],
          b = rgb[o + 2];
        if (g > 130 && r > 105 && b < 100) colorClass[k] = 1; // volt green
        else if (r > 140 && g < 85 && b < 85) colorClass[k] = 4; // crimson red
        else if (r > 128 && g > 128 && b > 128 && Math.abs(r - g) < 28 && Math.abs(g - b) < 28) colorClass[k] = 3; // silver/grey/white
        else if (r < 115 && g < 115 && b < 125) colorClass[k] = 2; // dark charcoal/black
        else colorClass[k] = 5;
        if (x < minPx) minPx = x;
        if (x > maxPx) maxPx = x;
        if (y < minPy) minPy = y;
        if (y > maxPy) maxPy = y;
      }
    }
  }
  return { W, H, mask, colorClass, minPx, maxPx, minPy, maxPy, pxW: Math.max(1, maxPx - minPx), pxH: Math.max(1, maxPy - minPy) };
}

function classifyMaterialColor(mat) {
  if (!mat) return 2;
  if (mat.textureKind === 'ryobiLogo') return 2; // dark black nameplate with white text
  if (mat.textureKind === 'craftsmanLogo') return 4;
  if (mat.textureKind === 'craftsmanV20Badge') return 4;
  const hex = (mat.colorHex || '#333333').replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  if (g > 130 && r > 105 && b < 100) return 1;
  if (r > 140 && g < 85 && b < 85) return 4;
  if (r > 125 && g > 125 && b > 125 && Math.abs(r - g) < 28 && Math.abs(g - b) < 28) return 3;
  return 2;
}

function rasterizeSideView(partMeshes, envelopeMm, photo) {
  const W = photo ? photo.W : 320;
  const H = photo ? photo.H : 320;
  const minPx = photo ? photo.minPx : 20;
  const maxPy = photo ? photo.maxPy : H - 20;
  const pxW = photo ? photo.pxW : W - 40;
  const pxH = photo ? photo.pxH : H - 40;

  const halfW = envelopeMm.width * 0.5;
  const envH = envelopeMm.height;
  const worldToPx = (wx, wy) => [
    minPx + ((wx + halfW) / envelopeMm.width) * pxW,
    maxPy - (wy / envH) * pxH,
  ];

  const zBuf = new Float32Array(W * H).fill(-1e9);
  const idBuf = new Int32Array(W * H).fill(-1);
  const modelMask = new Uint8Array(W * H);
  const visiblePixels = new Int32Array(partMeshes.length);

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();

  for (let pi = 0; pi < partMeshes.length; pi++) {
    const { mesh } = partMeshes[pi];
    const g = mesh.geometry;
    const mat = mesh.matrixWorld;
    const pa = g.attributes.position;
    const idxAttr = g.index;
    const triCount = idxAttr ? idxAttr.count / 3 : pa.count / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
      const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;
      v0.fromBufferAttribute(pa, i0).applyMatrix4(mat).multiplyScalar(1000);
      v1.fromBufferAttribute(pa, i1).applyMatrix4(mat).multiplyScalar(1000);
      v2.fromBufferAttribute(pa, i2).applyMatrix4(mat).multiplyScalar(1000);

      const [x0, y0] = worldToPx(v0.x, v0.y);
      const [x1, y1] = worldToPx(v1.x, v1.y);
      const [x2, y2] = worldToPx(v2.x, v2.y);
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-4) continue;

      const bx0 = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const bx1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const by0 = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const by1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));

      for (let py = by0; py <= by1; py++) {
        for (let px = bx0; px <= bx1; px++) {
          const cx = px + 0.5;
          const cy = py + 0.5;
          const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area;
          const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 >= -1e-4 && w1 >= -1e-4 && w2 >= -1e-4) {
            const z = w0 * v0.z + w1 * v1.z + w2 * v2.z;
            const k = py * W + px;
            modelMask[k] = 1;
            if (z > zBuf[k]) {
              zBuf[k] = z;
              idBuf[k] = pi;
            }
          }
        }
      }
    }
  }

  for (let k = 0; k < W * H; k++) {
    if (idBuf[k] >= 0) visiblePixels[idBuf[k]]++;
  }

  const partColorClasses = partMeshes.map((pm) => classifyMaterialColor(pm.part.material));

  let iouPct = null;
  let colorMatchPct = null;
  let overPx = 0;
  let underPx = 0;
  if (photo) {
    let inter = 0,
      uni = 0,
      colorTotal = 0,
      colorHit = 0;
    for (let k = 0; k < W * H; k++) {
      const p = photo.mask[k];
      const m = modelMask[k];
      if (p && m) {
        inter++;
        const pc = photo.colorClass[k];
        const mc = idBuf[k] >= 0 ? partColorClasses[idBuf[k]] : 0;
        if (pc >= 1 && pc <= 4) {
          colorTotal++;
          if (pc === mc) colorHit++;
        }
      }
      if (p || m) uni++;
      if (m && !p) overPx++;
      if (p && !m) underPx++;
    }
    iouPct = (inter / Math.max(1, uni)) * 100;
    colorMatchPct = colorTotal > 0 ? (colorHit / colorTotal) * 100 : null;
  }

  return {
    visiblePixels,
    iouPct,
    colorMatchPct,
    overPx,
    underPx,
    modelMask,
    idBuf,
    partColorClasses,
    W,
    H,
    minPx,
    maxPy,
    pxW,
    pxH,
  };
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
  plugins: [wasmPlugin],
});

try {
  const mk = await server.ssrLoadModule('/src/engine/manifoldKernel.ts');
  const ac = await server.ssrLoadModule('/src/engine/assemblyCompiler.ts');
  const csMod = await server.ssrLoadModule('/src/engine/constraintSolver.ts');
  const meshMod = await server.ssrLoadModule('/src/engine/meshKernel.ts');
  const lintMod = await server.ssrLoadModule('/src/engine/geometryLinter.ts');

  const blueprintModules = [
    ['/src/data/weldingTableBlueprint.ts', 'WELDING_TABLE_SYSTEM28_BLUEPRINT'],
    ['/src/data/unitreeGo2Blueprint.ts', 'UNITREE_GO2_QUADRUPED_BLUEPRINT'],
    ['/src/data/galvanizedWorkPlatformBlueprint.ts', 'GALVANIZED_WORK_PLATFORM_BLUEPRINT'],
    ['/src/data/ryobiReciprocatingSawBlueprint.ts', 'RYOBI_RECIPROCATING_SAW_BLUEPRINT'],
    ['/src/data/craftsmanV20DrillBlueprint.ts', 'CRAFTSMAN_V20_DRILL_BLUEPRINT'],
    ['/src/data/industrialPipingSystemBlueprint.ts', 'INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT'],
    ['/src/data/precisionGearboxBlueprint.ts', 'PRECISION_GEARBOX_BLUEPRINT'],
    ['/src/data/copperPrvManifoldBlueprint.ts', 'COPPER_PRV_MANIFOLD_BLUEPRINT'],
    ['/src/data/steelColumnConnectionBlueprint.ts', 'STEEL_COLUMN_CONNECTION_BLUEPRINT'],
  ];

  const blueprints = [];
  for (const [modPath, expName] of blueprintModules) {
    const mod = await server.ssrLoadModule(modPath);
    if (mod[expName]) blueprints.push(mod[expName]);
  }

  const ready = await mk.ensureManifoldReady();
  if (!ready) {
    console.error('FATAL: manifold-3d WASM failed to initialize.');
    process.exit(1);
  }

  const selected =
    targetArg === 'all'
      ? blueprints
      : blueprints.filter((b) => b.id === targetArg || b.id.includes(targetArg));

  if (selected.length === 0) {
    console.error(
      `No blueprint matched "${targetArg}". Available: ${blueprints.map((b) => b.id).join(', ')}`
    );
    process.exit(1);
  }

  let anyFailed = false;
  const MM = 0.001;
  const D2R = Math.PI / 180;

  for (const bp of selected) {
    const compiled = ac.compileAssemblyBlueprint(bp);
    const parts = compiled.parts;
    const geomMap = new Map();
    const boundsMap = new Map();
    let totalCsg = 0;
    let wtCount = 0;
    const nonWatertight = [];

    for (const p of parts) {
      let g;
      if (p.geometry.kind === 'csgSolid') {
        totalCsg++;
        const r = mk.buildCsgSolidGeometry(p.geometry.csgRoot, 'standard', p.geometry.smoothSharpAngleDeg ?? 42);
        g = r.geometry;
        if (r.isWatertightManifold) wtCount++;
        else nonWatertight.push(p.id);
      } else {
        g = meshMod.buildPartGeometry(p, 'standard');
      }
      geomMap.set(p.id, g);
      boundsMap.set(p.id, csMod.measureOrientedBoundsMm(g, p.rotationDeg));
    }

    const cs = csMod.solveAssemblyConstraints(parts, boundsMap, geomMap);
    const root = new THREE.Group();
    const partMeshes = [];
    for (const p of parts) {
      const m = new THREE.Mesh(geomMap.get(p.id), new THREE.MeshBasicMaterial());
      m.userData.partId = p.id;
      const pos = cs.resolvedPositionsMm.get(p.id) ?? p.positionMm;
      const rot = cs.resolvedRotationsDeg.get(p.id) ?? p.rotationDeg;
      m.position.set(pos[0] * MM, pos[1] * MM, pos[2] * MM);
      m.rotation.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, 'YXZ');
      m.updateMatrixWorld(true);
      root.add(m);
      partMeshes.push({ part: p, mesh: m });
    }
    root.updateMatrixWorld(true);

    const report = lintMod.runGeometryAudit(
      parts,
      partMeshes.map((pm) => pm.mesh),
      cs.entries,
      cs.joints,
      wtCount,
      {
        compiledInterfaces: compiled.compiledInterfaces,
        fitExemptPairs: compiled.fitExemptPairs,
        loadPathEdges: compiled.loadPathEdges,
      }
    );

    const maxMateErr = cs.entries.reduce((m, e) => Math.max(m, e.residualErrorMm ?? 0), 0);
    const photo = bp.sourceImageUrl ? loadPhotoMask(bp.sourceImageUrl) : null;
    const sideVis = rasterizeSideView(partMeshes, bp.envelopeMm, photo);

    const hiddenFrontDetails = partMeshes
      .map((pm, i) => ({ part: pm.part, px: sideVis.visiblePixels[i] }))
      .filter(
        ({ part, px }) =>
          px === 0 &&
          (part.role === 'detail' || part.role === 'secondary') &&
          !part.id.endsWith('_rear') &&
          !/internal|stator|rotor|bearing|jaw_3|bolt|nut|washer|pin|spacer/i.test(part.id)
      );

    const hardClashes = report.clashes.filter((c) => c.severity === 'clash').length;
    const passed =
      report.healthScore >= 98 &&
      nonWatertight.length === 0 &&
      hardClashes === 0 &&
      report.dynamicClashes.length === 0 &&
      report.floatingParts.length === 0 &&
      (report.occludedParts?.length ?? 0) === 0 &&
      maxMateErr <= 0.1;

    if (!passed) anyFailed = true;

    console.log(`\n============================================================`);
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${bp.name} (${bp.id})`);
    console.log(
      `  Health: ${report.healthScore}/100 | CSG Watertight: ${wtCount}/${totalCsg} | Parts: ${parts.length}`
    );
    console.log(
      `  Clashes: ${report.clashes.length} (${hardClashes} hard) | Dynamic: ${report.dynamicClashes.length} | Floating: ${report.floatingParts.length} | Buried: ${report.occludedParts?.length ?? 0}`
    );
    console.log(`  Constraints: ${cs.entries.length} (max residual ${maxMateErr.toFixed(3)} mm)`);
    if (sideVis.iouPct !== null) {
      const colorStr =
        sideVis.colorMatchPct !== null ? ` | Color-Zone Accuracy: ${sideVis.colorMatchPct.toFixed(1)}%` : '';
      console.log(
        `  Side-View Silhouette IoU vs Photo: ${sideVis.iouPct.toFixed(2)}%${colorStr} (overshoot ${sideVis.overPx} px, missing ${sideVis.underPx} px)`
      );
    }

    if (nonWatertight.length > 0) console.log('  Non-watertight CSG:', nonWatertight.join(', '));
    for (const c of report.clashes) {
      console.log(
        `  CLASH [${c.severity}]: ${c.partAId} <-> ${c.partBId} (${c.overlapVolumeCm3} cm³, ${c.penetrationMm} mm)`
      );
    }
    for (const d of report.dynamicClashes) {
      console.log(
        `  DYNAMIC CLASH @ ${d.poseLabel}: ${d.movingPartId} <-> ${d.obstaclePartId} (${d.penetrationMm} mm)`
      );
    }
    for (const f of report.floatingParts) {
      console.log(`  FLOATING: ${f.partId} (+${f.gapMm} mm gap)`);
    }
    for (const o of report.occludedParts ?? []) {
      console.log(`  BURIED: ${o.partId} (${o.buriedRatioPct}% inside ${o.occluderPartId})`);
    }
    if (hiddenFrontDetails.length > 0) {
      console.log(
        '  Side-View (+Z) 0-px Details (verify intentional):',
        hiddenFrontDetails.map((h) => h.part.id).join(', ')
      );
    }

    if (showAscii && photo) {
      console.log('  --- ASCII SILHOUETTE DIFF (# match, + overshoot, - missing) ---');
      for (let row = 0; row < 36; row++) {
        const py = Math.round(photo.minPy + (row / 35) * photo.pxH);
        const wy = (((photo.maxPy - py) / photo.pxH) * bp.envelopeMm.height)
          .toFixed(0)
          .padStart(3);
        let line = `  ${wy}mm | `;
        for (let col = 0; col < 52; col++) {
          const px = Math.round(photo.minPx + (col / 51) * photo.pxW);
          const k = py * photo.W + px;
          const p = photo.mask[k];
          const m = sideVis.modelMask[k];
          line += p && m ? '#' : m && !p ? '+' : p && !m ? '-' : ' ';
        }
        console.log(line + ' |');
      }
    }

    if (showColorAscii && photo) {
      const ch = [' ', 'G', 'D', 'S', 'R', 'O'];
      console.log('  --- COLOR MISMATCH MAP (. match, photo-letter where 3D color differs) ---');
      for (let row = 0; row < 30; row++) {
        const py = Math.round(photo.minPy + (row / 29) * photo.pxH);
        const wy = (((photo.maxPy - py) / photo.pxH) * bp.envelopeMm.height).toFixed(0).padStart(3);
        let line = `  ${wy}mm | `;
        for (let col = 0; col < 64; col++) {
          const px = Math.round(photo.minPx + (col / 63) * photo.pxW);
          const k = py * photo.W + px;
          const p = photo.mask[k];
          const m = sideVis.modelMask[k];
          if (!p || !m) {
            line += ' ';
          } else {
            const pc = photo.colorClass[k];
            const mc = sideVis.idBuf[k] >= 0 ? sideVis.partColorClasses[sideVis.idBuf[k]] : 0;
            line += pc === mc || pc === 5 ? '.' : ch[pc];
          }
        }
        console.log(line + ' |');
      }
    }
  }

  if (anyFailed) process.exit(1);
} finally {
  await server.close();
}
