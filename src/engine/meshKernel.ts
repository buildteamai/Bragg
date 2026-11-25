import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import {
  BlueprintPart,
  GeometryAuditReport,
  MeshBlueprint,
  MetrologyStats,
  PartMetrology,
  SolvedJointRecord,
  TessellationDensity,
} from '../types/blueprint';
import {
  applyPhotoCropTextureToMaterial,
  getProceduralTextureSet,
} from './proceduralTextures';
import { buildCsgSolidGeometry } from './manifoldKernel';
import {
  MeasuredPartBounds,
  measureOrientedBoundsMm,
  solveAssemblyConstraints,
} from './constraintSolver';
import { compileAssemblyBlueprint } from './assemblyCompiler';
import { runGeometryAudit } from './geometryLinter';
import { computeAssemblyMassProperties } from './massProperties';

export const MM_TO_SCENE = 0.001; // 1.0 Three.js unit = 1000 mm (1 meter)

function densityMultiplier(density: TessellationDensity): number {
  if (density === 'ultra') return 2.0;
  if (density === 'high') return 1.35;
  return 1.0;
}

function normalizeUVs(geo: THREE.BufferGeometry): void {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  const size = new THREE.Vector3();
  box.getSize(size);
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  if (!pos || !norm) return;

  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));

    let u = 0;
    let v = 0;
    if (nz >= nx && nz >= ny) {
      u = size.x > 1e-5 ? (x - box.min.x) / size.x : 0.5;
      v = size.y > 1e-5 ? (y - box.min.y) / size.y : 0.5;
    } else if (nx >= ny && nx >= nz) {
      u = size.z > 1e-5 ? (z - box.min.z) / size.z : 0.5;
      v = size.y > 1e-5 ? (y - box.min.y) / size.y : 0.5;
    } else {
      u = size.x > 1e-5 ? (x - box.min.x) / size.x : 0.5;
      v = size.z > 1e-5 ? (z - box.min.z) / size.z : 0.5;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function createRoundedBoxGeometry(
  wMm: number,
  hMm: number,
  dMm: number,
  bevelRadiusMm: number,
  density: TessellationDensity
): THREE.BufferGeometry {
  const w = Math.max(0.0002, wMm * MM_TO_SCENE);
  const h = Math.max(0.0002, hMm * MM_TO_SCENE);
  const d = Math.max(0.0002, dMm * MM_TO_SCENE);

  const maxCornerR = Math.min(w, h) * 0.42;
  const r = Math.max(0.0001, Math.min(bevelRadiusMm * MM_TO_SCENE, maxCornerR));
  const bevel = Math.min(r * 0.55, d * 0.28, 0.032);
  const innerW = Math.max(0.0002, w - bevel * 2);
  const innerH = Math.max(0.0002, h - bevel * 2);
  const innerR = Math.min(r, Math.min(innerW, innerH) * 0.45);
  const extrudeDepth = Math.max(0.0002, d - bevel * 2);

  const hw = innerW / 2;
  const hh = innerH / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-hw + innerR, -hh);
  shape.lineTo(hw - innerR, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + innerR);
  shape.lineTo(hw, hh - innerR);
  shape.quadraticCurveTo(hw, hh, hw - innerR, hh);
  shape.lineTo(-hw + innerR, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - innerR);
  shape.lineTo(-hw, -hh + innerR);
  shape.quadraticCurveTo(-hw, -hh, -hw + innerR, -hh);

  const mult = densityMultiplier(density);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    steps: 1,
    curveSegments: Math.round(8 * mult),
    bevelEnabled: bevel > 0.0005,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: Math.max(2, Math.round(3 * mult)),
  });

  geo.center();
  geo.computeVertexNormals();
  normalizeUVs(geo);
  return geo;
}

function createExtrudePolygonGeometry(
  pointsMm: [number, number][],
  depthMm: number,
  bevelMm: number,
  density: TessellationDensity,
  holesMm?: [number, number][][]
): THREE.BufferGeometry {
  if (!pointsMm || pointsMm.length < 3) {
    return createRoundedBoxGeometry(100, 100, depthMm || 50, 8, density);
  }

  const shape = new THREE.Shape();
  pointsMm.forEach(([x, y], idx) => {
    const sx = x * MM_TO_SCENE;
    const sy = y * MM_TO_SCENE;
    if (idx === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  });
  shape.closePath();

  if (Array.isArray(holesMm)) {
    for (const holeLoop of holesMm) {
      if (!Array.isArray(holeLoop) || holeLoop.length < 3) continue;
      const holePath = new THREE.Path();
      holeLoop.forEach(([hx, hy], idx) => {
        const sx = hx * MM_TO_SCENE;
        const sy = hy * MM_TO_SCENE;
        if (idx === 0) holePath.moveTo(sx, sy);
        else holePath.lineTo(sx, sy);
      });
      holePath.closePath();
      shape.holes.push(holePath);
    }
  }

  const d = Math.max(0.0002, (depthMm || 40) * MM_TO_SCENE);
  const b = Math.max(0, Math.min((bevelMm || 4) * MM_TO_SCENE, d * 0.25));
  const mult = densityMultiplier(density);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0002, d - b * 2),
    steps: 1,
    curveSegments: Math.round(10 * mult),
    bevelEnabled: b > 0.0005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: Math.max(2, Math.round(3 * mult)),
  });

  geo.center();
  geo.computeVertexNormals();
  normalizeUVs(geo);
  return geo;
}

function createHollowBoxGeometry(
  wMm: number,
  hMm: number,
  dMm: number,
  wallMm: number,
  openFace: 'front' | 'back' | 'top' | 'left' | 'right' | 'none' | undefined,
  windowWidthMm: number | undefined,
  windowHeightMm: number | undefined,
  windowOffsetXMm: number | undefined,
  windowOffsetYMm: number | undefined,
  density: TessellationDensity
): THREE.BufferGeometry {
  const w = Math.max(0.04, (wMm || 400) * MM_TO_SCENE);
  const h = Math.max(0.04, (hMm || 400) * MM_TO_SCENE);
  const d = Math.max(0.04, (dMm || 400) * MM_TO_SCENE);
  const t = Math.max(0.006, Math.min((wallMm || 35) * MM_TO_SCENE, Math.min(w, h, d) * 0.25));
  const open = openFace ?? 'front';

  const pieces: THREE.BufferGeometry[] = [];
  const addSlab = (sw: number, sh: number, sd: number, tx: number, ty: number, tz: number) => {
    if (sw <= 0.001 || sh <= 0.001 || sd <= 0.001) return;
    const g = new THREE.BoxGeometry(sw, sh, sd);
    g.translate(tx, ty, tz);
    pieces.push(g.index ? g.toNonIndexed() : g);
  };

  // Bottom slab
  addSlab(w, t, d, 0, -h / 2 + t / 2, 0);
  // Top slab
  if (open !== 'top') {
    addSlab(w, t, d, 0, h / 2 - t / 2, 0);
  }
  const innerH = open === 'top' ? h - t : Math.max(0.004, h - t * 2);
  const innerCenterY = open === 'top' ? t / 2 : 0;

  // Left & Right walls
  if (open !== 'left') {
    addSlab(t, innerH, d, -w / 2 + t / 2, innerCenterY, 0);
  }
  if (open !== 'right') {
    addSlab(t, innerH, d, w / 2 - t / 2, innerCenterY, 0);
  }
  const innerW = Math.max(
    0.004,
    w - (open === 'left' ? 0 : t) - (open === 'right' ? 0 : t)
  );
  const innerCenterX =
    open === 'left' ? -t / 2 : open === 'right' ? t / 2 : 0;

  // Back wall
  if (open !== 'back') {
    addSlab(innerW, innerH, t, innerCenterX, innerCenterY, -d / 2 + t / 2);
  }

  // Front wall (if not fully open, optionally with a rectangular window/door cutout)
  const hasCutout = (windowWidthMm || 0) > 10 && (windowHeightMm || 0) > 10;
  if (open !== 'front' || hasCutout) {
    if (hasCutout) {
      const ww = Math.min(w - t * 2, Math.max(0.02, (windowWidthMm || 0) * MM_TO_SCENE));
      const wh = Math.min(h - t * 2, Math.max(0.02, (windowHeightMm || 0) * MM_TO_SCENE));
      const ox = Math.max(
        -(w - t * 2 - ww) / 2,
        Math.min((w - t * 2 - ww) / 2, (windowOffsetXMm || 0) * MM_TO_SCENE)
      );
      const oy = Math.max(
        -(h - t * 2 - wh) / 2,
        Math.min((h - t * 2 - wh) / 2, (windowOffsetYMm || 0) * MM_TO_SCENE)
      );

      const hw = w / 2;
      const hh = h / 2;
      const outer = new THREE.Shape();
      outer.moveTo(-hw, -hh);
      outer.lineTo(hw, -hh);
      outer.lineTo(hw, hh);
      outer.lineTo(-hw, hh);
      outer.closePath();

      const hole = new THREE.Path();
      hole.moveTo(ox - ww / 2, oy - wh / 2);
      hole.lineTo(ox + ww / 2, oy - wh / 2);
      hole.lineTo(ox + ww / 2, oy + wh / 2);
      hole.lineTo(ox - ww / 2, oy + wh / 2);
      hole.closePath();
      outer.holes.push(hole);

      const frontFace = new THREE.ExtrudeGeometry(outer, {
        depth: t,
        steps: 1,
        curveSegments: Math.round(6 * densityMultiplier(density)),
        bevelEnabled: false,
      });
      frontFace.translate(0, 0, d / 2 - t);
      pieces.push(frontFace.index ? frontFace.toNonIndexed() : frontFace);
    } else if (open !== 'front') {
      addSlab(innerW, innerH, t, innerCenterX, innerCenterY, d / 2 - t / 2);
    }
  }

  const normalized = pieces.map((g) => {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) normalizeUVs(g);
    return g;
  });
  const merged = mergeGeometries(normalized, false);
  pieces.forEach((g) => g.dispose());
  if (!merged) return new THREE.BoxGeometry(w, h, d);
  merged.computeVertexNormals();
  normalizeUVs(merged);
  return merged;
}

function createTaperedBoxGeometry(
  bottomWMm: number,
  hMm: number,
  bottomDMm: number,
  topWMm: number | undefined,
  topDMm: number | undefined,
  topOffsetXMm: number | undefined,
  topOffsetZMm: number | undefined
): THREE.BufferGeometry {
  const bw = Math.max(0.008, (bottomWMm || 200) * MM_TO_SCENE) / 2;
  const bd = Math.max(0.008, (bottomDMm || 200) * MM_TO_SCENE) / 2;
  const hh = Math.max(0.008, (hMm || 200) * MM_TO_SCENE) / 2;
  const tw = Math.max(0.004, (topWMm ?? bottomWMm * 0.75) * MM_TO_SCENE) / 2;
  const td = Math.max(0.004, (topDMm ?? bottomDMm * 0.75) * MM_TO_SCENE) / 2;
  const ox = (topOffsetXMm || 0) * MM_TO_SCENE;
  const oz = (topOffsetZMm || 0) * MM_TO_SCENE;

  // 8 corners: bottom 0..3, top 4..7
  const v: [number, number, number][] = [
    [-bw, -hh, bd],       // 0 front-left-bottom
    [bw, -hh, bd],        // 1 front-right-bottom
    [bw, -hh, -bd],       // 2 back-right-bottom
    [-bw, -hh, -bd],      // 3 back-left-bottom
    [ox - tw, hh, oz + td], // 4 front-left-top
    [ox + tw, hh, oz + td], // 5 front-right-top
    [ox + tw, hh, oz - td], // 6 back-right-top
    [ox - tw, hh, oz - td], // 7 back-left-top
  ];

  const quads: [number, number, number, number][] = [
    [0, 1, 5, 4], // front (+Z)
    [1, 2, 6, 5], // right (+X)
    [2, 3, 7, 6], // back (-Z)
    [3, 0, 4, 7], // left (-X)
    [4, 5, 6, 7], // top (+Y)
    [3, 2, 1, 0], // bottom (-Y)
  ];

  const positions: number[] = [];
  for (const [a, b, c, d] of quads) {
    positions.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  normalizeUVs(geo);
  return geo;
}

function createCurvedPanelGeometry(
  radiusMm: number,
  heightMm: number,
  thicknessMm: number,
  arcDeg: number | undefined,
  density: TessellationDensity
): THREE.BufferGeometry {
  const outerR = Math.max(0.02, (radiusMm || 300) * MM_TO_SCENE);
  const thick = Math.max(0.004, Math.min((thicknessMm || 28) * MM_TO_SCENE, outerR * 0.6));
  const innerR = Math.max(0.005, outerR - thick);
  const h = Math.max(0.01, (heightMm || 400) * MM_TO_SCENE);
  const arcRad = Math.max(0.15, Math.min(Math.PI * 1.95, ((arcDeg || 90) * Math.PI) / 180));
  const startA = -arcRad / 2;
  const endA = arcRad / 2;
  const segs = Math.max(12, Math.round(24 * densityMultiplier(density)));

  const shape = new THREE.Shape();
  for (let i = 0; i <= segs; i++) {
    const a = startA + (i / segs) * (endA - startA);
    const x = Math.sin(a) * outerR;
    const y = Math.cos(a) * outerR;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = segs; i >= 0; i--) {
    const a = startA + (i / segs) * (endA - startA);
    const x = Math.sin(a) * innerR;
    const y = Math.cos(a) * innerR;
    shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    steps: 1,
    curveSegments: segs,
    bevelEnabled: false,
  });

  // Rotate so the extruded depth runs vertically along Y and the convex arc faces +Z
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  normalizeUVs(geo);
  return geo;
}

function createLatheGeometry(
  lathePointsMm: [number, number][],
  radialSegments: number | undefined,
  density: TessellationDensity
): THREE.BufferGeometry {
  if (!lathePointsMm || lathePointsMm.length < 2) {
    return new THREE.CylinderGeometry(0.1, 0.1, 0.2, 32);
  }
  const pts = lathePointsMm.map(
    ([r, y]) => new THREE.Vector2(Math.max(0, r * MM_TO_SCENE), y * MM_TO_SCENE)
  );
  const segs = Math.round((radialSegments || 36) * densityMultiplier(density));
  const geo = new THREE.LatheGeometry(pts, Math.min(96, Math.max(16, segs)));
  geo.computeVertexNormals();
  return geo;
}

function createTubeGeometry(
  pathPointsMm: [number, number, number][],
  tubeRadiusMm: number,
  density: TessellationDensity
): THREE.BufferGeometry {
  if (!pathPointsMm || pathPointsMm.length < 2) {
    return new THREE.CylinderGeometry(0.02, 0.02, 0.3, 16);
  }
  const vectors = pathPointsMm.map(
    ([x, y, z]) => new THREE.Vector3(x * MM_TO_SCENE, y * MM_TO_SCENE, z * MM_TO_SCENE)
  );
  const curve = new THREE.CatmullRomCurve3(vectors, false, 'catmullrom', 0.35);
  const mult = densityMultiplier(density);
  const radius = Math.max(0.003, (tubeRadiusMm || 20) * MM_TO_SCENE);
  const tube = new THREE.TubeGeometry(
    curve,
    Math.round(36 * mult),
    radius,
    Math.round(14 * mult),
    false
  );

  // Add spherical caps at both ends so the tube mesh is cleanly manifold
  const capStart = new THREE.SphereGeometry(radius, Math.round(12 * mult), Math.round(10 * mult));
  capStart.translate(vectors[0].x, vectors[0].y, vectors[0].z);
  const last = vectors[vectors.length - 1];
  const capEnd = new THREE.SphereGeometry(radius, Math.round(12 * mult), Math.round(10 * mult));
  capEnd.translate(last.x, last.y, last.z);

  const nonIndexed = [tube, capStart, capEnd].map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    if (!ni.attributes.uv) normalizeUVs(ni);
    return ni;
  });

  const merged = mergeGeometries(nonIndexed, false);
  tube.dispose();
  capStart.dispose();
  capEnd.dispose();
  if (!merged) {
    return new THREE.TubeGeometry(curve, 32, radius, 12, false);
  }
  merged.computeVertexNormals();
  return merged;
}

function createImpellerGeometry(
  radiusMm: number,
  heightMm: number,
  bladeCount: number,
  density: TessellationDensity
): THREE.BufferGeometry {
  const r = Math.max(0.04, (radiusMm || 200) * MM_TO_SCENE);
  const h = Math.max(0.03, (heightMm || 150) * MM_TO_SCENE);
  const mult = densityMultiplier(density);
  const parts: THREE.BufferGeometry[] = [];

  // Base flange & contoured conical hub
  const hubPts = [
    new THREE.Vector2(0, -h * 0.45),
    new THREE.Vector2(r, -h * 0.45),
    new THREE.Vector2(r, -h * 0.28),
    new THREE.Vector2(r * 0.72, -h * 0.12),
    new THREE.Vector2(r * 0.42, h * 0.25),
    new THREE.Vector2(r * 0.26, h * 0.5),
    new THREE.Vector2(0, h * 0.5),
  ];
  const hub = new THREE.LatheGeometry(hubPts, Math.round(36 * mult));
  parts.push(hub.index ? hub.toNonIndexed() : hub);

  // Swept curved 5-axis impeller blades
  const count = Math.max(5, Math.min(18, bladeCount || 11));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(r * 0.72, h * 0.64, r * 0.055, 6, 4, 1);
    const pos = blade.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const bx = pos.getX(v);
      const by = pos.getY(v);
      const bz = pos.getZ(v);
      const tRadial = (bx / (r * 0.72)) + 0.5; // 0 inner to 1 outer
      const tHeight = (by / (h * 0.64)) + 0.5;
      // Curve and taper toward outer rim
      const twist = Math.sin(tRadial * 1.45) * r * 0.22 + tHeight * r * 0.14;
      const taperY = by * (1.0 - tRadial * 0.42) - tRadial * h * 0.12;
      pos.setXYZ(v, bx, taperY, bz + twist);
    }
    blade.computeVertexNormals();
    blade.translate(r * 0.54, h * 0.02, 0);
    blade.rotateY(angle);
    parts.push(blade.index ? blade.toNonIndexed() : blade);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) return new THREE.CylinderGeometry(r * 0.3, r, h, 32);
  merged.computeVertexNormals();
  return merged;
}

function createStaircaseGeometry(
  wMm: number,
  hMm: number,
  dMm: number,
  stepCount: number | undefined,
  hasHandrails: boolean | undefined,
  density: TessellationDensity
): THREE.BufferGeometry {
  const w = Math.max(0.2, (wMm || 620) * MM_TO_SCENE);
  const h = Math.max(0.25, (hMm || 860) * MM_TO_SCENE);
  const d = Math.max(0.3, (dMm || 1100) * MM_TO_SCENE);
  const steps = Math.max(2, Math.min(12, stepCount || 4));
  const landingD = d * 0.34;
  const runD = d - landingD;
  const stepRise = h / steps;
  const stepRun = runD / steps;
  const pieces: THREE.BufferGeometry[] = [];

  const pushGeo = (g: THREE.BufferGeometry) => {
    const ni = g.index ? g.toNonIndexed() : g;
    if (!ni.attributes.normal) ni.computeVertexNormals();
    if (!ni.attributes.uv) normalizeUVs(ni);
    pieces.push(ni);
  };

  // Top landing deck (at -Z end, top surface at +h/2)
  const deck = new THREE.BoxGeometry(w, 0.036, landingD);
  deck.translate(0, h / 2 - 0.018, -d / 2 + landingD / 2);
  pushGeo(deck);

  // Rear support legs under top landing
  for (const sx of [-w / 2 + 0.028, w / 2 - 0.028]) {
    for (const sz of [-d / 2 + 0.028, -d / 2 + landingD - 0.028]) {
      const leg = new THREE.BoxGeometry(0.044, h, 0.044);
      leg.translate(sx, 0, sz);
      pushGeo(leg);
    }
    // Cross-brace bar
    const brace = new THREE.BoxGeometry(0.032, 0.032, landingD - 0.04);
    brace.translate(sx, -h * 0.14, -d / 2 + landingD / 2);
    pushGeo(brace);
  }
  const backBar = new THREE.BoxGeometry(w - 0.04, 0.032, 0.032);
  backBar.translate(0, -h * 0.14, -d / 2 + 0.028);
  pushGeo(backBar);

  // Open-riser steps descending toward +Z
  for (let i = 0; i < steps; i++) {
    const y = h / 2 - stepRise * (i + 1) + 0.018;
    const z = -d / 2 + landingD + stepRun * (i + 0.5);
    const tread = new THREE.BoxGeometry(w - 0.04, 0.034, stepRun * 0.94);
    tread.translate(0, y, z);
    pushGeo(tread);
  }

  // Twin sloped side stringer beams
  const stringerLen = Math.hypot(runD, h);
  const stringerAngle = Math.atan2(h, runD);
  for (const sx of [-w / 2 + 0.022, w / 2 - 0.022]) {
    const str = new THREE.BoxGeometry(0.038, 0.095, stringerLen);
    str.rotateX(stringerAngle);
    str.translate(sx, 0, -d / 2 + landingD + runD / 2);
    pushGeo(str);

    // Bottom leveling feet
    const foot = new THREE.CylinderGeometry(0.028, 0.034, 0.02, 12);
    foot.translate(sx, -h / 2 + 0.01, d / 2 - 0.03);
    pushGeo(foot);
  }

  // Twin tubular safety handrails (left and right sides) matching industrial maintenance stairs
  if (hasHandrails !== false) {
    const railH = Math.min(0.86, Math.max(0.64, h * 0.88));
    const railR = 0.016;
    const segMult = densityMultiplier(density);
    const frontLandingZ = -d / 2 + landingD;
    for (const sx of [-w / 2 + 0.022, w / 2 - 0.022]) {
      // Continuous tubular rail rising vertically from landing front corner, curving over top,
      // sloping parallel to stringers down to bottom step
      const pts = [
        new THREE.Vector3(sx, h / 2, frontLandingZ),
        new THREE.Vector3(sx, h / 2 + railH * 0.92, frontLandingZ),
        new THREE.Vector3(sx, h / 2 + railH, frontLandingZ + stepRun * 0.22),
        new THREE.Vector3(sx, h / 2 + railH * 0.82, frontLandingZ + stepRun * 0.55),
        new THREE.Vector3(sx, -h / 2 + railH * 0.55, d / 2 - 0.06),
        new THREE.Vector3(sx, -h / 2 + 0.04, d / 2 - 0.03),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.18);
      pushGeo(
        new THREE.TubeGeometry(curve, Math.round(34 * segMult), railR, Math.round(10 * segMult), false)
      );

      // Parallel mid knee-rail connecting vertical stanchion to lower stringer
      const kneePts = [
        new THREE.Vector3(sx, h / 2 + railH * 0.48, frontLandingZ),
        new THREE.Vector3(sx, -h / 2 + railH * 0.34, d / 2 - 0.12),
      ];
      const kneeCurve = new THREE.LineCurve3(kneePts[0], kneePts[1]);
      pushGeo(new THREE.TubeGeometry(kneeCurve, 8, railR * 0.72, 8, false));

      // Mid vertical stanchion post
      const midZ = frontLandingZ + runD * 0.52;
      const midTopY = (h / 2 + railH * 0.82) * 0.45 + (-h / 2 + railH * 0.55) * 0.55;
      const midBotY = 0;
      const postH = Math.max(0.25, midTopY - midBotY);
      const midPost = new THREE.CylinderGeometry(railR * 0.82, railR * 0.82, postH, 10);
      midPost.translate(sx, midBotY + postH * 0.5, midZ);
      pushGeo(midPost);
    }
  }

  const merged = mergeGeometries(pieces, false);
  pieces.forEach((g) => g.dispose());
  if (!merged) return new THREE.BoxGeometry(w, h, d);
  merged.computeVertexNormals();
  normalizeUVs(merged);
  return merged;
}

function createRollerBedGeometry(
  wMm: number,
  hMm: number,
  dMm: number,
  rollerCount: number | undefined,
  density: TessellationDensity
): THREE.BufferGeometry {
  const w = Math.max(0.15, (wMm || 1100) * MM_TO_SCENE);
  const h = Math.max(0.05, (hMm || 140) * MM_TO_SCENE);
  const d = Math.max(0.15, (dMm || 1200) * MM_TO_SCENE);
  const count = Math.max(4, Math.min(20, rollerCount || 11));
  const railW = Math.min(0.075, w * 0.08);
  const rollerLen = Math.max(0.06, w - railW * 2);
  const spacing = (d - 0.08) / Math.max(1, count - 1);
  const rollerR = Math.min(h * 0.36, spacing * 0.34, 0.036);
  const segs = Math.round(14 * densityMultiplier(density));

  const pieces: THREE.BufferGeometry[] = [];
  const pushGeo = (g: THREE.BufferGeometry) => {
    const ni = g.index ? g.toNonIndexed() : g;
    if (!ni.attributes.normal) ni.computeVertexNormals();
    if (!ni.attributes.uv) normalizeUVs(ni);
    pieces.push(ni);
  };

  // Side support rails + bottom deck plate
  for (const sx of [-w / 2 + railW / 2, w / 2 - railW / 2]) {
    const rail = new THREE.BoxGeometry(railW, h, d);
    rail.translate(sx, 0, 0);
    pushGeo(rail);
  }
  const subDeck = new THREE.BoxGeometry(rollerLen, h * 0.48, d - 0.04);
  subDeck.translate(0, -h * 0.24, 0);
  pushGeo(subDeck);

  // Parallel cylindrical steel worktable rollers
  for (let i = 0; i < count; i++) {
    const z = -d / 2 + 0.04 + i * spacing;
    const cyl = new THREE.CylinderGeometry(rollerR, rollerR, rollerLen, segs);
    cyl.rotateZ(Math.PI / 2);
    cyl.translate(0, h / 2 - rollerR * 0.65, z);
    pushGeo(cyl);
  }

  const merged = mergeGeometries(pieces, false);
  pieces.forEach((g) => g.dispose());
  if (!merged) return new THREE.BoxGeometry(w, h, d);
  merged.computeVertexNormals();
  normalizeUVs(merged);
  return merged;
}

function createDragChainGeometry(
  pathPointsMm: [number, number, number][],
  chainWidthMm: number | undefined,
  chainHeightMm: number | undefined,
  linkCount: number | undefined
): THREE.BufferGeometry {
  if (!pathPointsMm || pathPointsMm.length < 2) {
    return new THREE.BoxGeometry(0.12, 0.06, 0.4);
  }
  const vectors = pathPointsMm.map(
    ([x, y, z]) => new THREE.Vector3(x * MM_TO_SCENE, y * MM_TO_SCENE, z * MM_TO_SCENE)
  );
  const curve = new THREE.CatmullRomCurve3(vectors, false, 'catmullrom', 0.35);
  const cw = Math.max(0.025, (chainWidthMm || 95) * MM_TO_SCENE);
  const ch = Math.max(0.02, (chainHeightMm || 52) * MM_TO_SCENE);
  const count = Math.max(8, Math.min(48, linkCount || 22));
  const linkLen = Math.max(0.018, (curve.getLength() / count) * 0.82);

  const pieces: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4();

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const refUp = Math.abs(tangent.dot(up)) > 0.92 ? new THREE.Vector3(1, 0, 0) : up;
    const right = new THREE.Vector3().crossVectors(refUp, tangent).normalize();
    const localUp = new THREE.Vector3().crossVectors(tangent, right).normalize();

    m4.makeBasis(right, localUp, tangent);
    m4.setPosition(pos);

    const link = new THREE.BoxGeometry(cw, ch, linkLen);
    link.applyMatrix4(m4);
    const ni = link.index ? link.toNonIndexed() : link;
    if (!ni.attributes.normal) ni.computeVertexNormals();
    if (!ni.attributes.uv) normalizeUVs(ni);
    pieces.push(ni);
  }

  const merged = mergeGeometries(pieces, false);
  pieces.forEach((g) => g.dispose());
  if (!merged) return new THREE.BoxGeometry(cw, ch, 0.4);
  merged.computeVertexNormals();
  normalizeUVs(merged);
  return merged;
}

function createWayCoverSlatsGeometry(
  wMm: number,
  hMm: number,
  dMm: number,
  slatCount: number
): THREE.BufferGeometry {
  const w = Math.max(0.05, (wMm || 240) * MM_TO_SCENE);
  const h = Math.max(0.1, (hMm || 900) * MM_TO_SCENE);
  const d = Math.max(0.02, (dMm || 70) * MM_TO_SCENE);
  const count = Math.max(4, Math.min(32, slatCount || 14));
  const slatH = h / count;
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const slat = new THREE.BoxGeometry(w, slatH * 0.88, d);
    slat.rotateX(0.16);
    const y = -h / 2 + slatH * (i + 0.5);
    slat.translate(0, y, (i % 2 === 0 ? 0.004 : -0.004));
    parts.push(slat.index ? slat.toNonIndexed() : slat);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) return new THREE.BoxGeometry(w, h, d);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Stepped architectural crown molding, plinth base, or beveled mantel cap.
 * Builds multi-tier mitered/stepped overhangs that wrap front + left + right cleanly.
 */
function createMoldedProfileGeometry(
  wMm: number,
  hMm: number,
  dMm: number,
  moldingStyle: 'crown' | 'plinth' | 'bevelCap' = 'crown',
  stepCount = 4,
  density: TessellationDensity = 'high'
): THREE.BufferGeometry {
  const w = Math.max(0.03, wMm * MM_TO_SCENE);
  const h = Math.max(0.015, hMm * MM_TO_SCENE);
  const d = Math.max(0.03, dMm * MM_TO_SCENE);
  const tiers = Math.max(2, Math.min(7, Math.round(stepCount || 4)));

  const parts: THREE.BufferGeometry[] = [];
  const tierH = h / tiers;
  const maxOverhang = Math.min(w * 0.14, d * 0.24, h * 0.85);

  for (let i = 0; i < tiers; i++) {
    const t = tiers === 1 ? 1 : i / (tiers - 1);
    let factor = 1;
    if (moldingStyle === 'crown') {
      // Flaring outward gracefully toward the top (cove + fascia profile)
      factor = Math.pow(t, 0.72);
    } else if (moldingStyle === 'plinth') {
      // Flaring outward toward the bottom floor base
      factor = Math.pow(1 - t, 0.75);
    } else {
      // BevelCap: slightly wider middle/top lip
      factor = 0.55 + 0.45 * Math.sin(t * Math.PI * 0.75);
    }

    const extra = maxOverhang * factor;
    const tw = w - maxOverhang * 2 + extra * 2;
    const td = d - maxOverhang + extra;
    const ty = -h / 2 + tierH * (i + 0.5);
    const tz = (td - d) * 0.5; // Flush along back (-Z), overhanging on front (+Z)

    const g = createRoundedBoxGeometry(
      tw / MM_TO_SCENE,
      (tierH * 1.04) / MM_TO_SCENE,
      td / MM_TO_SCENE,
      Math.max(2, (tierH * 0.22) / MM_TO_SCENE),
      density
    );
    g.translate(0, ty, tz);
    parts.push(g.index ? g.toNonIndexed() : g);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) return new THREE.BoxGeometry(w, h, d);
  merged.computeVertexNormals();
  normalizeUVs(merged);
  return merged;
}

/**
 * Architectural fluted pilaster / grooved wood trim column with top & bottom stop blocks
 * and real 3D vertical ribs across the front (+Z) face.
 */
function createFlutedPanelGeometry(
  wMm: number,
  hMm: number,
  dMm: number,
  fluteCount = 4,
  density: TessellationDensity = 'high'
): THREE.BufferGeometry {
  const w = Math.max(0.02, wMm * MM_TO_SCENE);
  const h = Math.max(0.04, hMm * MM_TO_SCENE);
  const d = Math.max(0.015, dMm * MM_TO_SCENE);
  const flutes = Math.max(2, Math.min(10, Math.round(fluteCount || 4)));

  const parts: THREE.BufferGeometry[] = [];
  const capH = Math.min(h * 0.08, w * 0.65);
  const coreD = d * 0.72;
  const ribD = d * 0.34;

  // Solid recessed backing column
  const back = new THREE.BoxGeometry(w, h, coreD);
  back.translate(0, 0, -d / 2 + coreD / 2);
  parts.push(back);

  // Top and bottom un-fluted plinth/capital stop blocks
  const topCap = new THREE.BoxGeometry(w * 1.04, capH, d);
  topCap.translate(0, h / 2 - capH / 2, 0);
  parts.push(topCap);

  const botCap = new THREE.BoxGeometry(w * 1.04, capH, d);
  botCap.translate(0, -h / 2 + capH / 2, 0);
  parts.push(botCap);

  // Raised vertical reeds / fillets creating deep shadow flutes between them
  const ribCount = flutes + 1;
  const usableW = w * 0.94;
  const pitch = usableW / flutes;
  const ribW = Math.max(0.004, pitch * 0.44);
  const shaftH = Math.max(0.01, h - capH * 2);
  const ribSegs = density === 'ultra' ? 10 : 6;

  for (let i = 0; i < ribCount; i++) {
    const rx = -usableW / 2 + i * pitch;
    const rib = new THREE.CylinderGeometry(ribW * 0.48, ribW * 0.48, shaftH, ribSegs);
    rib.scale(1, 1, Math.max(0.5, ribD / Math.max(0.004, ribW)));
    rib.translate(rx, 0, d / 2 - ribD * 0.42);
    parts.push(rib);
  }

  const normalized = parts.map((p) => {
    const ni = p.index ? p.toNonIndexed() : p;
    if (!ni.attributes.normal) ni.computeVertexNormals();
    if (!ni.attributes.uv) normalizeUVs(ni);
    return ni;
  });
  const merged = mergeGeometries(normalized, false);
  parts.forEach((p) => p.dispose());
  if (!merged) return new THREE.BoxGeometry(w, h, d);
  merged.computeVertexNormals();
  normalizeUVs(merged);
  return merged;
}

/**
 * Smoothly tapering curved 3D spline tube (for organic legs, branching antlers, horns, stems, handles).
 */
function createTaperedTubeGeometry(
  pathPoints: [number, number, number][],
  radiusStartMm = 20,
  radiusEndMm = 8,
  density: TessellationDensity = 'high'
): THREE.BufferGeometry {
  if (!pathPoints || pathPoints.length < 2) {
    return new THREE.CylinderGeometry(
      Math.max(0.002, radiusEndMm * MM_TO_SCENE),
      Math.max(0.002, radiusStartMm * MM_TO_SCENE),
      0.16,
      16
    );
  }
  const stations: [number, number, number, number, number][] = pathPoints.map((pt, idx) => {
    const t = pathPoints.length === 1 ? 0 : idx / (pathPoints.length - 1);
    const r = radiusStartMm + (radiusEndMm - radiusStartMm) * t;
    return [pt[0], pt[1], pt[2], r, r];
  });
  return createOrganicLoftGeometry(stations, density);
}

/**
 * Smooth Catmull-Rom parallel-transport 3D loft with variable elliptical cross-sections
 * and rounded end caps. Builds sculpted organic torsos, necks, heads, lamps, bows, and curved shells.
 */
function createOrganicLoftGeometry(
  loftStations: [number, number, number, number, number][],
  density: TessellationDensity = 'high'
): THREE.BufferGeometry {
  if (!loftStations || loftStations.length < 2) {
    return new THREE.SphereGeometry(0.08, 24, 18);
  }

  const mult = densityMultiplier(density);
  const rawPts = loftStations.map(
    (s) => new THREE.Vector3(s[0] * MM_TO_SCENE, s[1] * MM_TO_SCENE, s[2] * MM_TO_SCENE)
  );
  const rawRx = loftStations.map((s) => Math.max(0.0015, (Number(s[3]) || 20) * MM_TO_SCENE));
  const rawRy = loftStations.map((s) => Math.max(0.0015, (Number(s[4]) || Number(s[3]) || 20) * MM_TO_SCENE));

  const curve = new THREE.CatmullRomCurve3(rawPts, false, 'centripetal', 0.5);
  const steps = Math.max(12, Math.min(72, Math.round((loftStations.length - 1) * 7 * mult)));
  const radialSegs = Math.max(12, Math.min(36, Math.round(16 * mult)));

  // Sample spline positions, tangents, and linearly/smoothly interpolated radii
  const ringCenters: THREE.Vector3[] = [];
  const ringTangents: THREE.Vector3[] = [];
  const ringRx: number[] = [];
  const ringRy: number[] = [];

  const sampleRadius = (arr: number[], u: number) => {
    const scaled = u * (arr.length - 1);
    const i0 = Math.floor(scaled);
    const i1 = Math.min(arr.length - 1, i0 + 1);
    const f = scaled - i0;
    const smoothF = f * f * (3 - 2 * f);
    return arr[i0] + (arr[i1] - arr[i0]) * smoothF;
  };

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    ringCenters.push(curve.getPoint(u));
    const tan = curve.getTangent(u).normalize();
    if (tan.lengthSq() < 1e-6) tan.set(0, 1, 0);
    ringTangents.push(tan);
    ringRx.push(sampleRadius(rawRx, u));
    ringRy.push(sampleRadius(rawRy, u));
  }

  // Parallel-transport frame along the curve:
  // When nearly vertical (|tan.y| > 0.92), use +Z as refUp so prevN = (+Z) x (+Y) = (-1,0,0),
  // keeping rx aligned front-to-back along X and ry aligned left-to-right along Z (never 90° swapped).
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  const refUp = Math.abs(ringTangents[0].y) > 0.92
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);
  let prevN = new THREE.Vector3().crossVectors(refUp, ringTangents[0]).normalize();
  if (prevN.lengthSq() < 1e-6) prevN.set(1, 0, 0);
  normals.push(prevN.clone());
  binormals.push(new THREE.Vector3().crossVectors(ringTangents[0], prevN).normalize());

  const rotQ = new THREE.Quaternion();
  for (let i = 1; i <= steps; i++) {
    rotQ.setFromUnitVectors(ringTangents[i - 1], ringTangents[i]);
    const nextN = prevN.clone().applyQuaternion(rotQ).normalize();
    const nextB = new THREE.Vector3().crossVectors(ringTangents[i], nextN).normalize();
    normals.push(nextN);
    binormals.push(nextB);
    prevN = nextN;
  }

  // Add subtle rounded start/end dome rings
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const totalRings = steps + 3; // start pole + (steps+1) body rings + end pole
  const pushRing = (
    center: THREE.Vector3,
    nVec: THREE.Vector3,
    bVec: THREE.Vector3,
    rx: number,
    ry: number,
    vCoord: number
  ) => {
    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      const ca = Math.cos(a) * rx;
      const sa = Math.sin(a) * ry;
      positions.push(
        center.x + nVec.x * ca + bVec.x * sa,
        center.y + nVec.y * ca + bVec.y * sa,
        center.z + nVec.z * ca + bVec.z * sa
      );
      uvs.push(j / radialSegs, vCoord);
    }
  };

  // Start dome cap center
  const startCapCenter = ringCenters[0]
    .clone()
    .addScaledVector(ringTangents[0], -Math.min(ringRx[0], ringRy[0]) * 0.45);
  pushRing(startCapCenter, normals[0], binormals[0], 0.0002, 0.0002, 0);

  for (let i = 0; i <= steps; i++) {
    pushRing(ringCenters[i], normals[i], binormals[i], ringRx[i], ringRy[i], (i + 1) / (totalRings - 1));
  }

  // End dome cap center
  const endCapCenter = ringCenters[steps]
    .clone()
    .addScaledVector(ringTangents[steps], Math.min(ringRx[steps], ringRy[steps]) * 0.45);
  pushRing(endCapCenter, normals[steps], binormals[steps], 0.0002, 0.0002, 1);

  const stride = radialSegs + 1;
  for (let r = 0; r < totalRings - 1; r++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = r * stride + j;
      const b = (r + 1) * stride + j;
      const c = (r + 1) * stride + (j + 1);
      const d = r * stride + (j + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildPartGeometry(
  part: BlueprintPart,
  density: TessellationDensity
): THREE.BufferGeometry {
  const g = part.geometry;
  const mult = densityMultiplier(density);

  switch (g.kind) {
    case 'roundedBox':
      return createRoundedBoxGeometry(
        g.width || 200,
        g.height || 200,
        g.depth || 200,
        g.bevelRadius ?? 14,
        density
      );
    case 'box': {
      const seg = density === 'ultra' ? 4 : density === 'high' ? 2 : 1;
      return new THREE.BoxGeometry(
        Math.max(0.0002, (g.width || 100) * MM_TO_SCENE),
        Math.max(0.0002, (g.height || 100) * MM_TO_SCENE),
        Math.max(0.0002, (g.depth || 100) * MM_TO_SCENE),
        seg,
        seg,
        seg
      );
    }
    case 'cylinder': {
      const rTop = Math.max(0.0002, (g.radiusTop ?? g.radius ?? 50) * MM_TO_SCENE);
      const rBot = Math.max(0.0002, (g.radiusBottom ?? g.radius ?? 50) * MM_TO_SCENE);
      const h = Math.max(0.0002, (g.height || 100) * MM_TO_SCENE);
      const segs = Math.min(96, Math.max(16, Math.round((g.radialSegments || 32) * mult)));
      return new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, false);
    }
    case 'sphere': {
      const r = Math.max(0.0005, (g.radius || 80) * MM_TO_SCENE);
      const segs = Math.min(64, Math.max(16, Math.round(28 * mult)));
      return new THREE.SphereGeometry(r, segs, segs);
    }
    case 'capsule': {
      const r = Math.max(0.0005, (g.radius || 40) * MM_TO_SCENE);
      const len = Math.max(0.0005, (g.height || 140) * MM_TO_SCENE);
      return new THREE.CapsuleGeometry(r, len, Math.round(8 * mult), Math.round(20 * mult));
    }
    case 'torus': {
      const r = Math.max(0.001, (g.radius || 100) * MM_TO_SCENE);
      const tr = Math.max(0.0003, (g.tubeRadius || 16) * MM_TO_SCENE);
      return new THREE.TorusGeometry(
        r,
        tr,
        Math.round(16 * mult),
        Math.round(44 * mult),
        g.arc ?? Math.PI * 2
      );
    }
    case 'extrudePolygon':
      return createExtrudePolygonGeometry(
        g.polygonPoints || [],
        g.depth || 60,
        g.bevelThickness ?? g.bevelRadius ?? 6,
        density,
        g.polygonHoles
      );
    case 'hollowBox':
      return createHollowBoxGeometry(
        g.width || 400,
        g.height || 400,
        g.depth || 400,
        g.wallThickness || 35,
        g.openFace,
        g.windowWidth,
        g.windowHeight,
        g.windowOffsetX,
        g.windowOffsetY,
        density
      );
    case 'taperedBox':
      return createTaperedBoxGeometry(
        g.width || 240,
        g.height || 200,
        g.depth || 240,
        g.topWidth,
        g.topDepth,
        g.topOffsetX,
        g.topOffsetZ
      );
    case 'curvedPanel':
      return createCurvedPanelGeometry(
        g.radius || 300,
        g.height || 400,
        g.thickness || 28,
        g.arcDeg,
        density
      );
    case 'staircase':
      return createStaircaseGeometry(
        g.width || 620,
        g.height || 860,
        g.depth || 1100,
        g.stepCount,
        g.hasHandrails,
        density
      );
    case 'rollerBed':
      return createRollerBedGeometry(
        g.width || 1100,
        g.height || 140,
        g.depth || 1200,
        g.rollerCount,
        density
      );
    case 'dragChain':
      return createDragChainGeometry(
        g.pathPoints || [],
        g.chainWidth,
        g.chainHeight,
        g.linkCount
      );
    case 'latheProfile':
      return createLatheGeometry(g.lathePoints || [], g.radialSegments, density);
    case 'tubePath':
      return createTubeGeometry(g.pathPoints || [], g.tubeRadius || 20, density);
    case 'taperedTube':
      return createTaperedTubeGeometry(
        g.pathPoints || [],
        g.radiusStart ?? g.tubeRadius ?? 20,
        g.radiusEnd ?? Math.max(3, (g.tubeRadius ?? 20) * 0.4),
        density
      );
    case 'organicLoft':
      return createOrganicLoftGeometry(g.loftStations || [], density);
    case 'moldedProfile':
      return createMoldedProfileGeometry(
        g.width || 600,
        g.height || 80,
        g.depth || 400,
        g.moldingStyle || 'crown',
        g.stepCount || 4,
        density
      );
    case 'flutedPanel':
      return createFlutedPanelGeometry(
        g.width || 110,
        g.height || 800,
        g.depth || 55,
        g.fluteCount || 4,
        density
      );
    case 'impellerWorkpiece':
      return createImpellerGeometry(
        g.radius || 200,
        g.height || 160,
        g.bladeCount || 11,
        density
      );
    case 'wayCoverSlats':
      return createWayCoverSlatsGeometry(
        g.width || 240,
        g.height || 1000,
        g.depth || 70,
        g.slatCount || 16
      );
    case 'csgSolid':
      return buildCsgSolidGeometry(
        g.csgRoot,
        density,
        g.smoothSharpAngleDeg ?? 42
      ).geometry;
    case 'importedAsset':
      return new THREE.BufferGeometry();
    default:
      return createRoundedBoxGeometry(
        g.width || 160,
        g.height || 160,
        g.depth || 160,
        12,
        density
      );
  }
}

export function buildPartMaterial(
  part: BlueprintPart,
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  clippingPlanes: THREE.Plane[],
  sourceImageUrl?: string,
  onTextureLoaded?: () => void,
  rectifiedFaces?: MeshBlueprint['rectifiedFaces']
): THREE.MeshPhysicalMaterial {
  const m = part.material;
  const textures = getProceduralTextureSet(
    m.textureKind,
    m.colorHex,
    maxAnisotropy,
    m.labelText,
    m.labelSubtext
  );

  const isGlass = Boolean(m.transparent) || (m.transmission ?? 0) > 0.1 || (m.opacity ?? 1) < 0.96;
  const hasEmissiveMap = Boolean(textures.emissiveMap);

  const hasNormalMap = Boolean(textures.normalMap);
  const normalStrength =
    m.textureKind === 'galvanizedDiamondPlate'
      ? 0.48
      : m.textureKind === 'diamondPlate'
        ? 0.45
        : m.textureKind === 'galvanizedSteel'
          ? 0.18
          : m.textureKind === 'paintedIndustrialSteel'
            ? 0.08
            : m.textureKind === 'brushedMetal'
              ? 0.14
              : 0.35;

  const mat = new THREE.MeshPhysicalMaterial({
    color: textures.map ? new THREE.Color('#ffffff') : new THREE.Color(m.colorHex),
    map: textures.map || null,
    normalMap: textures.normalMap || null,
    normalScale: hasNormalMap ? new THREE.Vector2(normalStrength, normalStrength) : new THREE.Vector2(1, 1),
    bumpMap: hasNormalMap ? null : (textures.bumpMap || null),
    bumpScale:
      m.textureKind === 'stackedStone'
        ? 0.012
        : m.textureKind === 'galvanizedDiamondPlate'
          ? 0.0085
          : m.textureKind === 'diamondPlate'
            ? 0.008
            : m.textureKind === 'glitterFinish'
              ? 0.006
              : m.textureKind === 'galvanizedSteel'
                ? 0.0022
                : m.textureKind === 'paintedIndustrialSteel'
                  ? 0.0014
                  : 0.0035,
    roughnessMap: textures.roughnessMap || null,
    metalness: m.metalness,
    roughness: textures.roughnessMap ? 1.0 : m.roughness,
    clearcoat: m.clearcoat ?? 0,
    clearcoatRoughness: m.clearcoatRoughness ?? 0.15,
    transparent: isGlass,
    opacity: isGlass ? (isSoftwareGl ? Math.max(0.18, m.opacity ?? 0.25) : m.opacity ?? 0.24) : 1.0,
    transmission: isGlass && !isSoftwareGl ? m.transmission ?? 0.78 : 0,
    ior: m.ior ?? 1.52,
    thickness: isGlass ? 0.04 : 0,
    depthWrite: !isGlass,
    emissive: hasEmissiveMap
      ? new THREE.Color('#ffffff')
      : m.emissiveHex
        ? new THREE.Color(m.emissiveHex)
        : new THREE.Color(0x000000),
    emissiveMap: textures.emissiveMap || null,
    emissiveIntensity: hasEmissiveMap
      ? Math.max(1.1, m.emissiveIntensity ?? 1.35)
      : (m.emissiveIntensity ?? 0),
    clippingPlanes,
    clipShadows: true,
    side: THREE.DoubleSide,
  });

  const effectivePhotoUrl =
    (m.photoFace && rectifiedFaces?.[m.photoFace]) || sourceImageUrl;

  if (
    effectivePhotoUrl &&
    Array.isArray(m.photoCrop) &&
    m.photoCrop.length === 4 &&
    !isGlass
  ) {
    applyPhotoCropTextureToMaterial(
      effectivePhotoUrl,
      m.photoCrop,
      mat,
      maxAnisotropy,
      onTextureLoaded
    );
  }

  return mat;
}

/**
 * Generates seamless metric world-scale triplanar UVs (in meters per texture tile) so
 * tileable metallurgical finishes (galvanized zinc spangle & diamond-plate tread lugs)
 * maintain identical physical scale across large deck plates, narrow stair treads, and tubes.
 */
function applyMetricTriplanarUVs(
  geo: THREE.BufferGeometry,
  tileMeters: number,
  partId: string,
  phaseOffset = true
): void {
  const posAttr = geo.attributes.position;
  if (!posAttr) return;
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  const normAttr = geo.attributes.normal;
  let hash = 2166136261;
  for (let i = 0; i < partId.length; i++) {
    hash ^= partId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const offU = phaseOffset ? ((hash >>> 0) % 997) / 997 : 0;
  const offV = phaseOffset ? (((hash >>> 11) ^ hash) >>> 0) % 991 / 991 : 0;
  const invTile = 1 / Math.max(0.02, tileMeters);
  const uvs = new Float32Array(posAttr.count * 2);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = normAttr ? Math.abs(normAttr.getX(i)) : 0;
    const ny = normAttr ? Math.abs(normAttr.getY(i)) : 1;
    const nz = normAttr ? Math.abs(normAttr.getZ(i)) : 0;

    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x * invTile + offU;
      v = z * invTile + offV;
    } else if (nz >= nx && nz >= ny) {
      u = x * invTile + offU;
      v = y * invTile + offV;
    } else {
      u = z * invTile + offU;
      v = y * invTile + offV;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function computeGeometrySurfaceAreaM2(geo: THREE.BufferGeometry): number {
  const pos = geo.attributes.position;
  if (!pos) return 0;
  const index = geo.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let area = 0;

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(pos, index.getX(i));
      b.fromBufferAttribute(pos, index.getX(i + 1));
      c.fromBufferAttribute(pos, index.getX(i + 2));
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      cross.crossVectors(ab, ac);
      area += cross.length() * 0.5;
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      cross.crossVectors(ab, ac);
      area += cross.length() * 0.5;
    }
  }
  return area;
}

export interface BuiltAssembly {
  rootGroup: THREE.Group;
  partMeshes: THREE.Mesh[];
  edgeLines: THREE.LineSegments[];
  lights: THREE.PointLight[];
  metrology: MetrologyStats;
  audit: GeometryAuditReport;
  joints: SolvedJointRecord[];
  groundOffsetY: number;
}

export function buildBlueprintAssembly(
  blueprint: MeshBlueprint,
  density: TessellationDensity,
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  clippingPlanes: THREE.Plane[],
  hiddenPartIds: Set<string>,
  onTextureLoaded?: () => void
): BuiltAssembly {
  const rootGroup = new THREE.Group();
  rootGroup.name = blueprint.name;

  const partMeshes: THREE.Mesh[] = [];
  const edgeLines: THREE.LineSegments[] = [];
  const lights: THREE.PointLight[] = [];
  const partMetrologyList: PartMetrology[] = [];

  let totalTriangles = 0;
  let totalVertices = 0;
  let totalAreaM2 = 0;
  let watertightCsgCount = 0;

  const degToRad = Math.PI / 180;

  // Phase 0: Compile Top-Down Master Skeleton & Bidirectional Interface Contracts
  // (boltedJoint hole cutting & fasteners, bearingSeat boring, gearMesh auto-phasing, copeJoint, portRoute)
  const compiled = compileAssemblyBlueprint(blueprint);
  const activeParts = compiled.parts;

  // Phase 1: Build geometry for all compiled parts and measure exact oriented local bounds for mate solver
  const geometryByPartId = new Map<string, THREE.BufferGeometry>();
  const watertightByPartId = new Map<string, boolean>();
  const boundsByPartId = new Map<string, MeasuredPartBounds>();

  for (const part of activeParts) {
    let geometry: THREE.BufferGeometry;
    let isWatertightCsg = false;
    if (part.geometry.kind === 'csgSolid') {
      const res = buildCsgSolidGeometry(
        part.geometry.csgRoot,
        density,
        part.geometry.smoothSharpAngleDeg ?? 42
      );
      geometry = res.geometry;
      isWatertightCsg = res.isWatertightManifold;
      if (isWatertightCsg) watertightCsgCount++;
    } else {
      geometry = buildPartGeometry(part, density);
    }
    if (part.material.textureKind === 'galvanizedSteel') {
      applyMetricTriplanarUVs(geometry, 0.65, part.id, true);
    } else if (part.material.textureKind === 'galvanizedDiamondPlate') {
      applyMetricTriplanarUVs(geometry, 0.25, part.id, false);
    } else if (part.material.textureKind === 'paintedIndustrialSteel') {
      applyMetricTriplanarUVs(geometry, 0.62, part.id, true);
    } else if (part.material.textureKind === 'brushedMetal' && part.geometry.kind === 'csgSolid') {
      applyMetricTriplanarUVs(geometry, 0.42, part.id, true);
    } else if (part.material.textureKind === 'weldingTableGrid') {
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      const posAttr = geometry.attributes.position;
      if (bb && posAttr) {
        const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
        const spanZ = Math.max(1e-4, bb.max.z - bb.min.z);
        const uvs = new Float32Array(posAttr.count * 2);
        for (let i = 0; i < posAttr.count; i++) {
          const x = posAttr.getX(i);
          const z = posAttr.getZ(i);
          uvs[i * 2] = (x - bb.min.x) / spanX;
          // Three.js CanvasTexture flipY=true maps canvas bottom (y=h) to v=0 and top (y=0) to v=1.
          // Map +Z (front edge) -> v=0 (canvas bottom) and -Z (back edge) -> v=1 (canvas top).
          uvs[i * 2 + 1] = 1.0 - (z - bb.min.z) / spanZ;
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      }
    }
    geometryByPartId.set(part.id, geometry);
    watertightByPartId.set(part.id, isWatertightCsg);
    boundsByPartId.set(part.id, measureOrientedBoundsMm(geometry, part.rotationDeg));
  }

  // Phase 2: Deterministically solve all parametric mate chains (coincident, concentric, offset, angle, sitOnTopOf, sitOnGround)
  const constraintSolve = solveAssemblyConstraints(
    activeParts,
    boundsByPartId,
    geometryByPartId
  );
  const solvedPartIds = new Set(
    constraintSolve.entries
      .filter((e) => e.status === 'solved' || e.status === 'underConstrained')
      .map((e) => e.partId)
  );

  // Phase 3: Instantiate meshes at solved world positions & rotations
  for (const part of activeParts) {
    const geometry = geometryByPartId.get(part.id)!;
    const isWatertightCsg = watertightByPartId.get(part.id) ?? false;
    const material = buildPartMaterial(
      part,
      maxAnisotropy,
      isSoftwareGl,
      clippingPlanes,
      blueprint.sourceImageUrl,
      onTextureLoaded,
      blueprint.rectifiedFaces
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name;
    mesh.castShadow = !material.transparent;
    mesh.receiveShadow = true;
    mesh.renderOrder = material.transparent ? 4 : 1;

    const solvedPosMm = constraintSolve.resolvedPositionsMm.get(part.id) ?? part.positionMm;
    const solvedRotDeg = constraintSolve.resolvedRotationsDeg.get(part.id) ?? part.rotationDeg;

    const basePos = new THREE.Vector3(
      solvedPosMm[0] * MM_TO_SCENE,
      solvedPosMm[1] * MM_TO_SCENE,
      solvedPosMm[2] * MM_TO_SCENE
    );
    const explodeVec = new THREE.Vector3(
      part.explodeOffsetMm[0] * MM_TO_SCENE,
      part.explodeOffsetMm[1] * MM_TO_SCENE,
      part.explodeOffsetMm[2] * MM_TO_SCENE
    );

    mesh.position.copy(basePos);
    const hasRotationMate =
      part.constraint?.kind === 'coincident' ||
      part.constraint?.kind === 'concentric' ||
      part.constraint?.kind === 'angle' ||
      (part.mates?.some(
        (m) => m.kind === 'coincident' || m.kind === 'concentric' || m.kind === 'angle'
      ) ??
        false);
    mesh.rotation.order = hasRotationMate ? 'XYZ' : 'YXZ';
    mesh.rotation.set(
      solvedRotDeg[0] * degToRad,
      solvedRotDeg[1] * degToRad,
      solvedRotDeg[2] * degToRad
    );
    mesh.visible = !hiddenPartIds.has(part.id);

    // Build CAD sharp crease edge lines overlay (toggleable in CAD+Edges mode)
    const hasPositions = Boolean(
      geometry.attributes.position && geometry.attributes.position.count > 0
    );
    const edgesGeo = hasPositions
      ? new THREE.EdgesGeometry(geometry, 24)
      : new THREE.BufferGeometry();
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.45,
      clippingPlanes,
    });
    const edgeSegs = new THREE.LineSegments(edgesGeo, edgesMat);
    edgeSegs.visible = false;
    edgeSegs.raycast = () => {};
    mesh.add(edgeSegs);
    edgeLines.push(edgeSegs);

    // Compute exact per-part metrology
    const triCount = geometry.index
      ? Math.floor(geometry.index.count / 3)
      : Math.floor((geometry.attributes.position?.count || 0) / 3);
    const vertCount = geometry.attributes.position?.count || 0;
    const areaM2 = hasPositions ? computeGeometrySurfaceAreaM2(geometry) : 0;

    if (hasPositions) geometry.computeBoundingBox();
    const pSize = new THREE.Vector3();
    geometry.boundingBox?.getSize(pSize);

    mesh.userData = {
      partId: part.id,
      partName: part.name,
      group: part.group,
      finishName: part.material.finishName,
      toleranceMm: part.toleranceMm,
      triangles: triCount,
      sizeMm: [
        Math.round(pSize.x * 10000) / 10,
        Math.round(pSize.y * 10000) / 10,
        Math.round(pSize.z * 10000) / 10,
      ] as [number, number, number],
      basePosition: basePos,
      baseQuaternion: mesh.quaternion.clone(),
      explodeOffset: explodeVec,
      originalMaterial: material,
      isGlass: material.transparent,
      isWatertightCsg,
      hasSolvedConstraint: solvedPartIds.has(part.id),
    };

    totalTriangles += triCount;
    totalVertices += vertCount;
    totalAreaM2 += areaM2;

    partMetrologyList.push({
      id: part.id,
      name: part.name,
      group: part.group,
      finishName: part.material.finishName,
      triangles: triCount,
      sizeMm: mesh.userData.sizeMm,
      toleranceMm: part.toleranceMm,
      visible: mesh.visible,
      isWatertightCsg,
      hasSolvedConstraint: solvedPartIds.has(part.id),
    });

    rootGroup.add(mesh);
    partMeshes.push(mesh);
  }

  // Ground assembly cleanly so minY = 0 on the metrology floor plane
  rootGroup.updateMatrixWorld(true);
  const fullBox = new THREE.Box3().setFromObject(rootGroup);
  const groundOffsetY = isFinite(fullBox.min.y) ? -fullBox.min.y : 0;
  rootGroup.position.y = groundOffsetY;
  rootGroup.updateMatrixWorld(true);

  const groundedBox = new THREE.Box3().setFromObject(rootGroup);
  const totalSize = new THREE.Vector3();
  groundedBox.getSize(totalSize);

  // Shift remembered joint anchors by groundOffsetY, attach part motionLimits & compiled gear couplings
  const activePartMap = new Map<string, BlueprintPart>();
  for (const p of activeParts) activePartMap.set(p.id, p);

  const jointByChildPartId = new Map<string, SolvedJointRecord>();
  const groundedJoints: SolvedJointRecord[] = constraintSolve.joints.map((j) => {
    const childPart = activePartMap.get(j.childPartId);
    const next: SolvedJointRecord = {
      ...j,
      anchorWorldMm: [
        j.anchorWorldMm[0],
        Math.round((j.anchorWorldMm[1] + groundOffsetY * 1000) * 10) / 10,
        j.anchorWorldMm[2],
      ],
      motionLimits: childPart?.motionLimits,
    };
    if (next.jointKind !== 'fixed') {
      jointByChildPartId.set(next.childPartId, next);
    }
    return next;
  });

  // Wire mechanical couplings (e.g. gearMesh ratio) between movable joints
  for (const link of compiled.coupledJointLinks) {
    const driverJoint = jointByChildPartId.get(link.driverPartId);
    const drivenJoint = jointByChildPartId.get(link.drivenPartId);
    if (driverJoint && drivenJoint) {
      driverJoint.coupledTargets = [
        ...(driverJoint.coupledTargets || []),
        {
          targetJointId: drivenJoint.id,
          targetChildPartId: drivenJoint.childPartId,
          ratio: link.ratio,
        },
      ];
    }
  }

  // Phase 4: Fit-Aware Exact Manifold Boolean + Full-Stroke Motion-Sweep + Load-Path Audit
  const audit = runGeometryAudit(
    activeParts,
    partMeshes,
    constraintSolve.entries,
    groundedJoints,
    watertightCsgCount,
    {
      compiledInterfaces: compiled.compiledInterfaces,
      fitExemptPairs: compiled.fitExemptPairs,
      loadPathEdges: compiled.loadPathEdges,
    }
  );

  // Mount real embedded blueprint lights (LED alcoves, fireboxes, accent lamps) AFTER computing bbox
  if (Array.isArray(blueprint.lights)) {
    for (const spec of blueprint.lights.slice(0, 12)) {
      const ptLight = new THREE.PointLight(
        new THREE.Color(spec.colorHex || '#ffffff'),
        Math.max(0.1, Math.min(12, Number(spec.intensity) || 2.0)),
        Math.max(0.25, Math.min(12, (Number(spec.distanceMm) || 1200) * MM_TO_SCENE)),
        Math.max(0.8, Math.min(3.0, Number(spec.decay) || 1.6))
      );
      ptLight.name = spec.name || spec.id;
      ptLight.position.set(
        (Number(spec.positionMm?.[0]) || 0) * MM_TO_SCENE,
        (Number(spec.positionMm?.[1]) || 500) * MM_TO_SCENE,
        (Number(spec.positionMm?.[2]) || 0) * MM_TO_SCENE
      );
      rootGroup.add(ptLight);
      lights.push(ptLight);
    }
  }

  // Phase 4B: Exact Mass Properties, 3D CoG & Floor Support Polygon Stability
  const massProperties = computeAssemblyMassProperties(activeParts, partMeshes);

  return {
    rootGroup,
    partMeshes,
    edgeLines,
    lights,
    groundOffsetY,
    audit,
    joints: groundedJoints,
    metrology: {
      totalTriangles,
      totalVertices,
      partCount: activeParts.length,
      surfaceAreaM2: Math.round(totalAreaM2 * 1000) / 1000,
      boundingMm: [
        Math.round(totalSize.x * 10000) / 10,
        Math.round(totalSize.y * 10000) / 10,
        Math.round(totalSize.z * 10000) / 10,
      ],
      parts: partMetrologyList,
      watertightCsgCount,
      solvedConstraintCount: constraintSolve.entries.length,
      massProperties,
    },
  };
}

export function disposeAssembly(assembly: BuiltAssembly | null): void {
  if (!assembly) return;
  assembly.partMeshes.forEach((mesh) => {
    mesh.geometry.dispose();
    const origMat = mesh.userData.originalMaterial as THREE.Material | undefined;
    if (origMat) origMat.dispose();
  });
  assembly.edgeLines.forEach((line) => {
    line.geometry.dispose();
    if (Array.isArray(line.material)) {
      line.material.forEach((m) => m.dispose());
    } else {
      line.material.dispose();
    }
  });
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export function formatExportFilename(
  baseName: string,
  suffix: string,
  buildRevision?: number
): string {
  const safe =
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || '18d';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStamp = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const revTag = buildRevision && buildRevision > 0 ? `r${buildRevision}-` : '';
  return `${safe}-${revTag}${timeStamp}-${suffix}`;
}

/**
 * Builds a brand-new, grounded, un-exploded, un-clipped, un-selected export group
 * directly from the latest in-session MeshBlueprint so exports can never pull stale
 * or viewport-mutated WebGL scene state.
 */
function buildCleanExportGroupFromBlueprint(
  blueprint: MeshBlueprint,
  density: TessellationDensity,
  hiddenPartIds: Set<string>,
  scaleToMillimeters: boolean
): { exportGroup: THREE.Group; dispose: () => void } {
  const built = buildBlueprintAssembly(
    blueprint,
    density,
    4,
    false,
    [],
    hiddenPartIds
  );

  const exportGroup = new THREE.Group();
  exportGroup.name = blueprint.name || '18D';
  built.rootGroup.updateMatrixWorld(true);

  const clonedGeometries: THREE.BufferGeometry[] = [];

  for (const child of built.partMeshes) {
    if (!child.visible) continue;
    const clonedGeo = child.geometry.clone();
    clonedGeo.applyMatrix4(child.matrixWorld);
    if (scaleToMillimeters) {
      clonedGeo.scale(1000, 1000, 1000);
    }
    if (!clonedGeo.attributes.normal) {
      clonedGeo.computeVertexNormals();
    }
    clonedGeometries.push(clonedGeo);

    const mesh = new THREE.Mesh(
      clonedGeo,
      (child.userData.originalMaterial as THREE.Material) || child.material
    );
    mesh.name = child.name;
    exportGroup.add(mesh);
  }

  return {
    exportGroup,
    dispose: () => {
      for (const geo of clonedGeometries) {
        geo.dispose();
      }
      disposeAssembly(built);
    },
  };
}

export function exportBlueprintAsSTL(
  blueprint: MeshBlueprint,
  density: TessellationDensity,
  hiddenPartIds: Set<string>,
  buildRevision?: number
): string {
  const { exportGroup, dispose } = buildCleanExportGroupFromBlueprint(
    blueprint,
    density,
    hiddenPartIds,
    true
  );
  try {
    const exporter = new STLExporter();
    const result = exporter.parse(exportGroup, { binary: true });
    const blob = new Blob([result], { type: 'application/octet-stream' });
    const filename = formatExportFilename(blueprint.name, 'submm.stl', buildRevision);
    triggerBlobDownload(blob, filename);
    return filename;
  } finally {
    dispose();
  }
}

export function exportBlueprintAsOBJ(
  blueprint: MeshBlueprint,
  density: TessellationDensity,
  hiddenPartIds: Set<string>,
  buildRevision?: number
): string {
  const { exportGroup, dispose } = buildCleanExportGroupFromBlueprint(
    blueprint,
    density,
    hiddenPartIds,
    true
  );
  try {
    const exporter = new OBJExporter();
    const objText = exporter.parse(exportGroup);
    const header = `# 18D CAD Export\n# Units: Millimeters (mm)\n# Object: ${blueprint.name}\n# Build Revision: r${buildRevision ?? 1}\n# Reconstructed At: ${blueprint.reconstructedAt}\n`;
    const blob = new Blob([header + objText], { type: 'text/plain;charset=utf-8' });
    const filename = formatExportFilename(blueprint.name, 'submm.obj', buildRevision);
    triggerBlobDownload(blob, filename);
    return filename;
  } finally {
    dispose();
  }
}

export function exportBlueprintAsGLB(
  blueprint: MeshBlueprint,
  density: TessellationDensity,
  hiddenPartIds: Set<string>,
  buildRevision?: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { exportGroup, dispose } = buildCleanExportGroupFromBlueprint(
      blueprint,
      density,
      hiddenPartIds,
      false
    );

    const exporter = new GLTFExporter();
    exporter.parse(
      exportGroup,
      (result) => {
        try {
          const blob =
            result instanceof ArrayBuffer
              ? new Blob([result], { type: 'model/gltf-binary' })
              : new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
          const filename = formatExportFilename(blueprint.name, 'mesh.glb', buildRevision);
          triggerBlobDownload(blob, filename);
          resolve(filename);
        } catch (err) {
          reject(err);
        } finally {
          dispose();
        }
      },
      (err) => {
        dispose();
        reject(err);
      },
      { binary: true }
    );
  });
}

import { serializeGroupToSotUsda } from './sotUsdExporter';

export function exportBlueprintAsSOTUSD(
  blueprint: MeshBlueprint,
  density: TessellationDensity,
  hiddenPartIds: Set<string>,
  buildRevision?: number
): string {
  const { exportGroup, dispose } = buildCleanExportGroupFromBlueprint(
    blueprint,
    density,
    hiddenPartIds,
    true
  );

  try {
    const usdaText = serializeGroupToSotUsda(exportGroup, blueprint, buildRevision);
    const blob = new Blob([usdaText], { type: 'text/plain;charset=utf-8' });
    const filename = formatExportFilename(blueprint.name, 'sot-zup-in.usda', buildRevision);
    triggerBlobDownload(blob, filename);
    return filename;
  } finally {
    dispose();
  }
}

export async function exportBlueprintAsUSDZ(
  blueprint: MeshBlueprint,
  density: TessellationDensity,
  hiddenPartIds: Set<string>,
  buildRevision?: number
): Promise<string> {
  const { exportGroup, dispose } = buildCleanExportGroupFromBlueprint(
    blueprint,
    density,
    hiddenPartIds,
    false
  );

  try {
    const exporter = new USDZExporter();
    const arraybuffer = await exporter.parseAsync(exportGroup, {
      includeAnchoringProperties: true,
      onlyVisible: true,
      maxTextureSize: 1024,
    });
    const blob = new Blob([arraybuffer], { type: 'model/vnd.usdz+zip' });
    const filename = formatExportFilename(blueprint.name, 'mesh.usdz', buildRevision);
    triggerBlobDownload(blob, filename);
    return filename;
  } finally {
    dispose();
  }
}

export function exportBlueprintAsJSON(
  blueprint: MeshBlueprint,
  buildRevision?: number
): string {
  const clean = {
    ...blueprint,
    buildRevision: buildRevision ?? 1,
    exportedAt: new Date().toISOString(),
    sourceImageUrl: blueprint.sourceImageUrl.startsWith('data:')
      ? '[embedded-source-image-omitted]'
      : blueprint.sourceImageUrl,
  };
  const blob = new Blob([JSON.stringify(clean, null, 2)], {
    type: 'application/json',
  });
  const filename = formatExportFilename(blueprint.name, 'blueprint.json', buildRevision);
  triggerBlobDownload(blob, filename);
  return filename;
}
