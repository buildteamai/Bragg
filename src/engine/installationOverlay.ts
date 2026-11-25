import * as THREE from 'three';
import {
  FloorZoneKind,
  FloorZoneSpec,
  MachineInstallationSpec,
  MeshBlueprint,
  UtilityConnectionSpec,
  UtilityKind,
} from '../types/blueprint';

const MM_TO_SCENE = 0.001;

export interface InstallationVisibilityOptions {
  showZones: boolean;
  showDoorSwings: boolean;
  showUtilities: boolean;
}

export const UTILITY_STYLE: Record<
  UtilityKind,
  { color: string; shortCode: string; label: string }
> = {
  electrical: { color: '#dc2626', shortCode: 'ELEC', label: 'Electrical' },
  pneumatic: { color: '#0284c7', shortCode: 'AIR', label: 'Pneumatic / Air' },
  gas: { color: '#d97706', shortCode: 'GAS', label: 'Process Gas' },
  exhaust: { color: '#7c3aed', shortCode: 'EXH', label: 'Exhaust / Mist' },
  water_supply: { color: '#059669', shortCode: 'H2O IN', label: 'Water / Coolant Supply' },
  water_return: { color: '#0d9488', shortCode: 'H2O OUT', label: 'Water / Coolant Return' },
  drain: { color: '#475569', shortCode: 'DRAIN', label: 'Drain / Waste' },
  network: { color: '#4f46e5', shortCode: 'NET', label: 'Network / PLC' },
};

export const FLOOR_ZONE_STYLE: Record<
  FloorZoneKind,
  { border: string; fill: string; hatch?: string; labelBg: string; labelText: string }
> = {
  operator: {
    border: '#10b981',
    fill: 'rgba(16, 185, 129, 0.14)',
    labelBg: '#065f46',
    labelText: '#ffffff',
  },
  electrical_clearance: {
    border: '#eab308',
    fill: 'rgba(234, 179, 8, 0.16)',
    hatch: 'rgba(15, 23, 42, 0.34)',
    labelBg: '#eab308',
    labelText: '#0f172a',
  },
  door_swing: {
    border: '#f59e0b',
    fill: 'rgba(245, 158, 11, 0.16)',
    labelBg: '#b45309',
    labelText: '#ffffff',
  },
  service_access: {
    border: '#f59e0b',
    fill: 'rgba(245, 158, 11, 0.10)',
    hatch: 'rgba(245, 158, 11, 0.24)',
    labelBg: '#92400e',
    labelText: '#ffffff',
  },
  material_flow: {
    border: '#2563eb',
    fill: 'rgba(37, 99, 235, 0.10)',
    labelBg: '#1d4ed8',
    labelText: '#ffffff',
  },
};

/**
 * Returns the blueprint's explicit installation spec, or derives a sensible
 * baseline operator + NEC 110.26 electrical clearance envelope from envelopeMm
 * so the Floor & Utilities overlay works meaningfully on every model.
 */
export function resolveInstallationSpec(blueprint: MeshBlueprint): {
  spec: MachineInstallationSpec;
  isDerived: boolean;
} {
  if (blueprint.installation) {
    return { spec: blueprint.installation, isDerived: false };
  }
  const { width, depth, height } = blueprint.envelopeMm;
  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const opDepth = Math.min(1220, Math.max(762, depth * 0.45)); // 30"–48" operator zone
  const opWidth = Math.max(width * 0.75, 914);
  const necDepth = 914.4; // NEC 110.26(A)(1): 36" min working space
  const necWidth = Math.max(762, Math.min(1067, depth * 0.5)); // 30" min width

  return {
    isDerived: true,
    spec: {
      operatorSide: '+z',
      floorZones: [
        {
          id: 'auto-operator-zone',
          kind: 'operator',
          label: 'Operator Zone',
          citation: 'Assumed baseline · front (+Z) working envelope',
          rectMm: {
            centerX: 0,
            centerZ: halfD + opDepth * 0.5 + 40,
            widthX: opWidth,
            depthZ: opDepth,
          },
        },
        {
          id: 'auto-nec-clearance',
          kind: 'electrical_clearance',
          label: 'NEC 110.26 Panel Clearance',
          citation: 'NEC 110.26(A)(1) · 36 in × 30 in min keep-clear',
          rectMm: {
            centerX: -halfW - necDepth * 0.5 - 40,
            centerZ: 0,
            widthX: necDepth,
            depthZ: necWidth,
          },
        },
      ],
      utilities: [
        {
          id: 'auto-elec-stub',
          kind: 'electrical',
          label: 'Main Power Feed',
          spec: 'Assumed · Verify OEM FLA/Voltage',
          positionMm: [-halfW, Math.min(1200, height * 0.55), -halfD * 0.4],
          floorPointMm: [-halfW - 140, -halfD * 0.4],
          routing: 'floor_stub',
          pipeOrConduitSize: '1" EMT',
        },
      ],
      notes: 'Auto-derived baseline envelope. Author blueprint.installation for OEM-exact zones & utility ports.',
    },
  };
}

function createFloorZoneTexture(zone: FloorZoneSpec, widthMm: number, depthMm: number): THREE.CanvasTexture {
  const style = FLOOR_ZONE_STYLE[zone.kind];
  const aspect = Math.max(0.25, Math.min(4, widthMm / Math.max(1, depthMm)));
  const h = 512;
  const w = Math.max(256, Math.min(1024, Math.round(h * aspect)));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, w, h);

  // Fill
  ctx.fillStyle = style.fill;
  ctx.fillRect(0, 0, w, h);

  // Diagonal safety hatch for electrical clearance & service access
  if (style.hatch) {
    ctx.save();
    ctx.strokeStyle = style.hatch;
    ctx.lineWidth = zone.kind === 'electrical_clearance' ? 18 : 10;
    const step = zone.kind === 'electrical_clearance' ? 54 : 64;
    for (let x = -h; x < w + h; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Perimeter safety tape (scaled ~50mm / 2" house tape look)
  const borderPx = Math.max(10, Math.min(22, Math.round(Math.min(w, h) * 0.045)));
  ctx.save();
  ctx.strokeStyle = style.border;
  ctx.lineWidth = borderPx;
  if (zone.kind === 'material_flow') {
    ctx.setLineDash([borderPx * 2.2, borderPx * 1.4]);
  }
  ctx.strokeRect(borderPx / 2, borderPx / 2, w - borderPx, h - borderPx);
  ctx.restore();

  // Centered floor stencil badge
  const label = zone.label.toUpperCase();
  const fontSize = Math.max(22, Math.min(40, Math.round(Math.min(w, h) * 0.11)));
  ctx.font = `700 ${fontSize}px "Outfit", "Segoe UI", sans-serif`;
  const textW = ctx.measureText(label).width;
  const padX = 22;
  const padY = 12;
  const pillW = Math.min(w - borderPx * 3, textW + padX * 2);
  const pillH = fontSize + padY * 2;
  const px = (w - pillW) / 2;
  const py = (h - pillH) / 2;

  ctx.save();
  ctx.fillStyle = style.labelBg;
  ctx.beginPath();
  ctx.roundRect(px, py, pillW, pillH, 10);
  ctx.fill();

  ctx.fillStyle = style.labelText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 1, pillW - 16);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function createUtilityCalloutSprite(utility: UtilityConnectionSpec): THREE.Sprite {
  const style = UTILITY_STYLE[utility.kind];
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Card background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(6, 10, canvas.width - 12, canvas.height - 20, 22);
    ctx.fill();
    ctx.stroke();

    // Left colored code pill
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.roundRect(18, 24, 126, canvas.height - 48, 14);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.shortCode, 18 + 63, canvas.height / 2 + 1);

    // Title & spec
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 26px "Outfit", "Segoe UI", sans-serif';
    ctx.fillText(utility.label, 162, 48, 326);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText(utility.spec, 162, 86, 326);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 15;
  return sprite;
}

function addRectFloorZone(group: THREE.Group, zone: FloorZoneSpec) {
  if (!zone.rectMm) return;
  const { centerX, centerZ, widthX, depthZ, rotationDeg = 0 } = zone.rectMm;
  const wM = Math.max(0.05, widthX * MM_TO_SCENE);
  const dM = Math.max(0.05, depthZ * MM_TO_SCENE);

  const tex = createFloorZoneTexture(zone, widthX, depthZ);
  const geo = new THREE.PlaneGeometry(wM, dM);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(centerX * MM_TO_SCENE, 0.003, centerZ * MM_TO_SCENE);
  mesh.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
  mesh.renderOrder = 3;
  mesh.name = `floor_zone_${zone.id}`;
  group.add(mesh);
}

function addPolygonFloorZone(group: THREE.Group, zone: FloorZoneSpec) {
  if (!zone.polygonMm || zone.polygonMm.length < 3) return;
  const style = FLOOR_ZONE_STYLE[zone.kind];

  // THREE.Shape is in XY; after rotateX(Math.PI/2), shape (x, y) maps to world (x, 0, y)
  const shape = new THREE.Shape();
  zone.polygonMm.forEach(([x, z], i) => {
    const xm = x * MM_TO_SCENE;
    const zm = z * MM_TO_SCENE;
    if (i === 0) shape.moveTo(xm, zm);
    else shape.lineTo(xm, zm);
  });
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: style.border,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.003;
  mesh.renderOrder = 3;
  group.add(mesh);

  const pts = zone.polygonMm.map(([x, z]) => new THREE.Vector3(x * MM_TO_SCENE, 0.005, z * MM_TO_SCENE));
  pts.push(pts[0].clone());
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const lineMat = new THREE.LineBasicMaterial({ color: style.border });
  group.add(new THREE.Line(lineGeo, lineMat));
}

function addDoorSwingZone(group: THREE.Group, zone: FloorZoneSpec) {
  if (!zone.doorSwingMm) return;
  const { hingeXZ, radiusMm, startAngleDeg, sweepAngleDeg } = zone.doorSwingMm;
  const style = FLOOR_ZONE_STYLE.door_swing;
  const rM = Math.max(0.05, radiusMm * MM_TO_SCENE);
  const hx = hingeXZ[0] * MM_TO_SCENE;
  const hz = hingeXZ[1] * MM_TO_SCENE;
  const segs = Math.max(18, Math.round(Math.abs(sweepAngleDeg) / 4));

  const startRad = THREE.MathUtils.degToRad(startAngleDeg);
  const sweepRad = THREE.MathUtils.degToRad(sweepAngleDeg);

  // Swept sector mesh on Y = 0
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i <= segs; i++) {
    const a = startRad + (sweepRad * i) / segs;
    shape.lineTo(Math.cos(a) * rM, Math.sin(a) * rM);
  }
  shape.closePath();

  const sectorGeo = new THREE.ShapeGeometry(shape);
  sectorGeo.rotateX(Math.PI / 2);
  const sectorMat = new THREE.MeshBasicMaterial({
    color: style.border,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sector = new THREE.Mesh(sectorGeo, sectorMat);
  sector.position.set(hx, 0.004, hz);
  sector.renderOrder = 4;
  group.add(sector);

  // Dashed outer arc
  const arcPts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = startRad + (sweepRad * i) / segs;
    arcPts.push(new THREE.Vector3(hx + Math.cos(a) * rM, 0.006, hz + Math.sin(a) * rM));
  }
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
  const arcLine = new THREE.Line(
    arcGeo,
    new THREE.LineDashedMaterial({
      color: style.border,
      dashSize: 0.06,
      gapSize: 0.04,
    })
  );
  arcLine.computeLineDistances();
  group.add(arcLine);

  // Door leaf lines at closed & open angles
  const endRad = startRad + sweepRad;
  const leafPts = [
    new THREE.Vector3(hx, 0.007, hz),
    new THREE.Vector3(hx + Math.cos(startRad) * rM, 0.007, hz + Math.sin(startRad) * rM),
    new THREE.Vector3(hx, 0.007, hz),
    new THREE.Vector3(hx + Math.cos(endRad) * rM, 0.007, hz + Math.sin(endRad) * rM),
  ];
  const leafGeo = new THREE.BufferGeometry().setFromPoints(leafPts);
  group.add(new THREE.LineSegments(leafGeo, new THREE.LineBasicMaterial({ color: '#d97706' })));

  // Hinge pin disc
  const hingeMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.015, 16),
    new THREE.MeshBasicMaterial({ color: '#d97706' })
  );
  hingeMesh.position.set(hx, 0.008, hz);
  group.add(hingeMesh);
}

function addUtilityConnection(group: THREE.Group, utility: UtilityConnectionSpec, spanM: number) {
  const style = UTILITY_STYLE[utility.kind];
  const color = new THREE.Color(style.color);

  const px = utility.positionMm[0] * MM_TO_SCENE;
  const py = utility.positionMm[1] * MM_TO_SCENE;
  const pz = utility.positionMm[2] * MM_TO_SCENE;

  const fx = (utility.floorPointMm?.[0] ?? utility.positionMm[0]) * MM_TO_SCENE;
  const fz = (utility.floorPointMm?.[1] ?? utility.positionMm[2]) * MM_TO_SCENE;

  const portRadius = Math.max(0.028, Math.min(0.055, spanM * 0.014));

  // 1. 3D Machine Connection Port Sphere / Collar
  const portMesh = new THREE.Mesh(
    new THREE.SphereGeometry(portRadius, 16, 12),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.4,
    })
  );
  portMesh.position.set(px, py, pz);
  group.add(portMesh);

  // 2. Floor Stub-Up / Drop Bullseye Ring on Y = 0
  const ringOuter = portRadius * 2.4;
  const ringInner = portRadius * 1.45;
  const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
  );
  ringMesh.position.set(fx, 0.006, fz);
  group.add(ringMesh);

  const dotGeo = new THREE.CircleGeometry(ringInner * 0.55, 20);
  dotGeo.rotateX(-Math.PI / 2);
  const dotMesh = new THREE.Mesh(
    dotGeo,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
  );
  dotMesh.position.set(fx, 0.005, fz);
  group.add(dotMesh);

  // 3. Routing Line / Riser Conduit
  if (utility.routing === 'overhead_drop') {
    const dropTopY = Math.max(py + 0.65, spanM * 0.72);
    const pts = [
      new THREE.Vector3(px, py, pz),
      new THREE.Vector3(fx, py, fz),
      new THREE.Vector3(fx, dropTopY, fz),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      lineGeo,
      new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.05 })
    );
    line.computeLineDistances();
    group.add(line);

    // Upward arrow cone at top of drop
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(portRadius * 1.1, portRadius * 2.6, 12),
      new THREE.MeshBasicMaterial({ color })
    );
    cone.position.set(fx, dropTopY, fz);
    group.add(cone);
  } else {
    // floor_stub / rear_manifold / side_panel: riser from floor stub-up to machine port
    const pts = [
      new THREE.Vector3(fx, 0.008, fz),
      new THREE.Vector3(fx, py, fz),
      new THREE.Vector3(px, py, pz),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color })));
  }

  // 4. Crisp Floating Callout Sprite
  const sprite = createUtilityCalloutSprite(utility);
  const spriteW = Math.max(0.42, Math.min(0.88, spanM * 0.22));
  const spriteH = spriteW * 0.25;
  sprite.scale.set(spriteW, spriteH, 1);
  sprite.position.set(
    fx,
    Math.max(py + spriteH * 0.85, 0.28),
    fz
  );
  group.add(sprite);
}

/**
 * Populates a Three.js Group with the machine's floor markings, NEC clearances,
 * door-swing arcs, and color-coded 3D utility connection markers.
 */
export function populateInstallationOverlayGroup(
  group: THREE.Group,
  blueprint: MeshBlueprint,
  spanM: number,
  options: InstallationVisibilityOptions
) {
  const { spec } = resolveInstallationSpec(blueprint);

  for (const zone of spec.floorZones) {
    if (zone.kind === 'door_swing') {
      if (options.showDoorSwings) addDoorSwingZone(group, zone);
    } else if (options.showZones) {
      if (zone.rectMm) addRectFloorZone(group, zone);
      else if (zone.polygonMm) addPolygonFloorZone(group, zone);
    }
  }

  if (options.showUtilities) {
    for (const u of spec.utilities) {
      addUtilityConnection(group, u, spanM);
    }
  }
}

/**
 * Serializes the machine's installation floor zones & utility connection ports
 * into SOT-compliant OpenUSD (.usda) child scopes (Z-up, inches, front -Y, z = 0)
 * with bound UsdPreviewSurface + OmniPBR materials (`floor_tape_*` exempt looks
 * per Setups/rules/floor_style.json), primvars:st UVs, and visible 3D utility
 * port/stub-up markers so Kit, Unreal, Architekton, and Setups/lib/machine_install.py
 * pick them up directly.
 */
export function serializeInstallationUsdaScope(
  blueprint: MeshBlueprint,
  indent = '    ',
  rootPrimPath?: string
): string[] {
  if (!blueprint.installation) return [];
  const { floorZones, utilities, operatorSide, underCrane } = blueprint.installation;
  if (floorZones.length === 0 && utilities.length === 0) return [];

  const MM_TO_IN = 1 / 25.4;
  const fmt = (n: number) => (Math.abs(n) < 1e-6 ? '0' : Number(n.toFixed(4)).toString());
  const sanitize = (raw: string, fallback: string) => {
    const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');
    if (!cleaned) return fallback;
    return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
  };
  const hexToRgb = (hex: string): string => {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return `(${fmt(r)}, ${fmt(g)}, ${fmt(b)})`;
  };
  // 18D (x, y, z)_mm -> SOT USD (x, -z, y)_in
  const toUsdNum = (xMm: number, yMm: number, zMm: number): [number, number, number] => [
    xMm * MM_TO_IN,
    -zMm * MM_TO_IN,
    yMm * MM_TO_IN,
  ];
  const toUsd = (xMm: number, yMm: number, zMm: number): [string, string, string] => {
    const [ux, uy, uz] = toUsdNum(xMm, yMm, zMm);
    return [fmt(ux), fmt(uy), fmt(uz)];
  };

  const looksPrefix = rootPrimPath ? `${rootPrimPath}/Installation/Looks` : '../Looks';

  const zoneMatMap: Record<FloorZoneKind, { matName: string; hex: string; opacity: number; prefix: string }> = {
    operator: { matName: 'floor_tape_operator', hex: '#10b981', opacity: 0.32, prefix: 'fm_operator_' },
    electrical_clearance: { matName: 'floor_tape_hazard', hex: '#eab308', opacity: 0.44, prefix: 'kc_hazard_' },
    door_swing: { matName: 'floor_tape_door', hex: '#f59e0b', opacity: 0.34, prefix: 'fm_door_' },
    service_access: { matName: 'floor_tape_hatch', hex: '#f59e0b', opacity: 0.28, prefix: 'fm_hatch_' },
    material_flow: { matName: 'floor_tape_material', hex: '#2563eb', opacity: 0.28, prefix: 'fm_material_' },
  };

  // Collect only the materials actually used by this machine's installation envelope
  const usedLooks = new Map<string, { hex: string; opacity: number; emissive: number }>();
  for (const z of floorZones) {
    const cfg = zoneMatMap[z.kind];
    usedLooks.set(cfg.matName, { hex: cfg.hex, opacity: cfg.opacity, emissive: 0 });
  }
  for (const u of utilities) {
    const matName = `util_${u.kind}`;
    usedLooks.set(matName, { hex: UTILITY_STYLE[u.kind].color, opacity: 0.92, emissive: 0.25 });
  }

  // Helper to emit a watertight 8-sided vertical cylinder/prism mesh in local inches
  const emitCylinderMesh = (
    name: string,
    matName: string,
    cx: number,
    cy: number,
    z0: number,
    z1: number,
    radiusIn: number,
    meshIndent: string
  ): string[] => {
    const segs = 8;
    const pts: [number, number, number][] = [];
    const uvs: [number, number][] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = cx + Math.cos(a) * radiusIn;
      const y = cy + Math.sin(a) * radiusIn;
      pts.push([x, y, z0]);
      uvs.push([i / segs, 0]);
    }
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = cx + Math.cos(a) * radiusIn;
      const y = cy + Math.sin(a) * radiusIn;
      pts.push([x, y, z1]);
      uvs.push([i / segs, 1]);
    }
    const fvc: number[] = [];
    const fvi: number[] = [];
    // Sides
    for (let i = 0; i < segs; i++) {
      const ni = (i + 1) % segs;
      fvc.push(3, 3);
      fvi.push(i, ni, segs + ni, i, segs + ni, segs + i);
    }
    // Top & bottom caps
    for (let i = 1; i < segs - 1; i++) {
      fvc.push(3, 3);
      fvi.push(0, i + 1, i);
      fvi.push(segs, segs + i, segs + i + 1);
    }
    const ptsStr = pts.map(([x, y, z]) => `(${fmt(x)}, ${fmt(y)}, ${fmt(z)})`).join(', ');
    const uvsStr = uvs.map(([u, v]) => `(${fmt(u)}, ${fmt(v)})`).join(', ');
    return [
      `${meshIndent}def Mesh "${name}" (`,
      `${meshIndent}    prepend apiSchemas = ["MaterialBindingAPI"]`,
      `${meshIndent})`,
      `${meshIndent}{`,
      `${meshIndent}    rel material:binding = <${looksPrefix}/${matName}>`,
      `${meshIndent}    int[] faceVertexCounts = [${fvc.join(', ')}]`,
      `${meshIndent}    int[] faceVertexIndices = [${fvi.join(', ')}]`,
      `${meshIndent}    point3f[] points = [${ptsStr}]`,
      `${meshIndent}    texCoord2f[] primvars:st = [${uvsStr}] (`,
      `${meshIndent}        interpolation = "vertex"`,
      `${meshIndent}    )`,
      `${meshIndent}}`,
    ];
  };

  const out: string[] = [
    '',
    `${indent}def Scope "Installation" (`,
    `${indent}    customData = {`,
    `${indent}        string operatorSide = "${operatorSide || '+z'}"`,
    `${indent}        bool underCrane = ${underCrane ? 'true' : 'false'}`,
    `${indent}    }`,
    `${indent})`,
    `${indent}{`,
  ];

  // 1. Installation/Looks — SOT-exempt floor_tape_* & utility marker materials (UsdPreviewSurface + OmniPBR)
  if (usedLooks.size > 0) {
    out.push(`${indent}    def Scope "Looks"`);
    out.push(`${indent}    {`);
    for (const [matName, cfg] of usedLooks.entries()) {
      const rgb = hexToRgb(cfg.hex);
      const absMat = rootPrimPath ? `${rootPrimPath}/Installation/Looks/${matName}` : matName;
      out.push(`${indent}        def Material "${matName}"`);
      out.push(`${indent}        {`);
      out.push(`${indent}            token outputs:surface.connect = <${absMat}/PreviewSurface.outputs:surface>`);
      out.push(`${indent}            token outputs:mdl:surface.connect = <${absMat}/OmniPBR.outputs:out>`);
      out.push(`${indent}            def Shader "PreviewSurface"`);
      out.push(`${indent}            {`);
      out.push(`${indent}                uniform token info:id = "UsdPreviewSurface"`);
      out.push(`${indent}                color3f inputs:diffuseColor = ${rgb}`);
      out.push(`${indent}                float inputs:roughness = 0.55`);
      out.push(`${indent}                float inputs:metallic = 0.05`);
      if (cfg.opacity < 0.999) {
        out.push(`${indent}                float inputs:opacity = ${fmt(cfg.opacity)}`);
      }
      if (cfg.emissive > 0) {
        out.push(`${indent}                color3f inputs:emissiveColor = ${rgb}`);
      }
      out.push(`${indent}                token outputs:surface`);
      out.push(`${indent}            }`);
      out.push(`${indent}            def Shader "OmniPBR"`);
      out.push(`${indent}            {`);
      out.push(`${indent}                uniform token info:implementationSource = "sourceAsset"`);
      out.push(`${indent}                uniform asset info:mdl:sourceAsset = @OmniPBR.mdl@`);
      out.push(`${indent}                uniform token info:mdl:sourceAsset:subIdentifier = "OmniPBR"`);
      out.push(`${indent}                color3f inputs:diffuse_color_constant = ${rgb}`);
      out.push(`${indent}                float inputs:reflection_roughness_constant = 0.55`);
      out.push(`${indent}                float inputs:metallic_constant = 0.05`);
      if (cfg.opacity < 0.999) {
        out.push(`${indent}                bool inputs:enable_opacity = 1`);
        out.push(`${indent}                float inputs:opacity_constant = ${fmt(cfg.opacity)}`);
      }
      if (cfg.emissive > 0) {
        out.push(`${indent}                bool inputs:enable_emission = 1`);
        out.push(`${indent}                color3f inputs:emissive_color = ${rgb}`);
        out.push(`${indent}                float inputs:emissive_intensity = ${fmt(cfg.emissive)}`);
      }
      out.push(`${indent}                token outputs:out`);
      out.push(`${indent}            }`);
      out.push(`${indent}        }`);
    }
    out.push(`${indent}    }`);
  }

  // 2. Installation/FloorMarks — bound to floor_tape_* looks with primvars:st UVs
  if (floorZones.length > 0) {
    out.push(`${indent}    def Scope "FloorMarks"`);
    out.push(`${indent}    {`);
    floorZones.forEach((zone, idx) => {
      const cfg = zoneMatMap[zone.kind];
      const primName = sanitize(`${cfg.prefix}${zone.id}`, `fm_zone_${idx}`);
      let vertsMm: [number, number][] = [];
      if (zone.rectMm) {
        const { centerX, centerZ, widthX, depthZ, rotationDeg = 0 } = zone.rectMm;
        const hw = widthX * 0.5;
        const hd = depthZ * 0.5;
        const rad = (rotationDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const corners: [number, number][] = [
          [-hw, -hd],
          [hw, -hd],
          [hw, hd],
          [-hw, hd],
        ];
        vertsMm = corners.map(([lx, lz]) => [
          centerX + lx * cos - lz * sin,
          centerZ + lx * sin + lz * cos,
        ]);
      } else if (zone.polygonMm && zone.polygonMm.length >= 3) {
        vertsMm = zone.polygonMm;
      } else if (zone.doorSwingMm) {
        const { hingeXZ, radiusMm, startAngleDeg, sweepAngleDeg } = zone.doorSwingMm;
        const segs = 12;
        vertsMm.push([hingeXZ[0], hingeXZ[1]]);
        for (let i = 0; i <= segs; i++) {
          const a = ((startAngleDeg + (sweepAngleDeg * i) / segs) * Math.PI) / 180;
          vertsMm.push([hingeXZ[0] + Math.cos(a) * radiusMm, hingeXZ[1] + Math.sin(a) * radiusMm]);
        }
      }
      if (vertsMm.length < 3) return;

      const ptsStr = vertsMm
        .map(([x, z]) => {
          const [ux, uy, uz] = toUsd(x, 2, z);
          return `(${ux}, ${uy}, ${uz})`;
        })
        .join(', ');
      const triIndices: number[] = [];
      const triCounts: number[] = [];
      for (let i = 1; i < vertsMm.length - 1; i++) {
        triCounts.push(3);
        triIndices.push(0, i, i + 1);
      }
      const uvsStr = vertsMm.map((_v, i) => `(${i % 2}, ${i < 2 ? 0 : 1})`).join(', ');
      const nrmsStr = vertsMm.map(() => '(0, 0, 1)').join(', ');

      out.push(`${indent}        def Mesh "${primName}" (`);
      out.push(`${indent}            prepend apiSchemas = ["MaterialBindingAPI"]`);
      out.push(`${indent}            customData = {`);
      out.push(`${indent}                string zoneKind = "${zone.kind}"`);
      out.push(`${indent}                string label = "${zone.label.replace(/"/g, "'")}"`);
      if (zone.citation) {
        out.push(`${indent}                string citation = "${zone.citation.replace(/"/g, "'")}"`);
      }
      out.push(`${indent}            }`);
      out.push(`${indent}        )`);
      out.push(`${indent}        {`);
      out.push(`${indent}            uniform bool doubleSided = 1`);
      out.push(`${indent}            rel material:binding = <${looksPrefix}/${cfg.matName}>`);
      out.push(`${indent}            int[] faceVertexCounts = [${triCounts.join(', ')}]`);
      out.push(`${indent}            int[] faceVertexIndices = [${triIndices.join(', ')}]`);
      out.push(`${indent}            point3f[] points = [${ptsStr}]`);
      out.push(`${indent}            normal3f[] normals = [${nrmsStr}] (`);
      out.push(`${indent}                interpolation = "vertex"`);
      out.push(`${indent}            )`);
      out.push(`${indent}            texCoord2f[] primvars:st = [${uvsStr}] (`);
      out.push(`${indent}                interpolation = "vertex"`);
      out.push(`${indent}            )`);
      out.push(`${indent}        }`);
    });
    out.push(`${indent}    }`);
  }

  // 3. Installation/Utilities — anchor Xforms with customData + visible 3D port, riser & floor-stub meshes
  if (utilities.length > 0) {
    out.push(`${indent}    def Scope "Utilities"`);
    out.push(`${indent}    {`);
    utilities.forEach((u, idx) => {
      const primName = sanitize(`${u.kind}_${u.id}`, `util_${idx}`);
      const matName = `util_${u.kind}`;
      const [px, py, pz] = toUsdNum(u.positionMm[0], u.positionMm[1], u.positionMm[2]);
      const floorXmm = u.floorPointMm?.[0] ?? u.positionMm[0];
      const floorZmm = u.floorPointMm?.[1] ?? u.positionMm[2];
      const [fx, fy] = toUsdNum(floorXmm, 0, floorZmm);
      // Local offset of floor stub relative to port Xform origin
      const dfx = fx - px;
      const dfy = fy - py;
      const dfz = -pz;

      out.push(`${indent}        def Xform "${primName}" (`);
      out.push(`${indent}            customData = {`);
      out.push(`${indent}                string utilityKind = "${u.kind}"`);
      out.push(`${indent}                string label = "${u.label.replace(/"/g, "'")}"`);
      out.push(`${indent}                string spec = "${u.spec.replace(/"/g, "'")}"`);
      out.push(`${indent}                string routing = "${u.routing}"`);
      out.push(`${indent}                double3 portIn = (${fmt(px)}, ${fmt(py)}, ${fmt(pz)})`);
      out.push(`${indent}                double2 floorStubIn = (${fmt(fx)}, ${fmt(fy)})`);
      if (u.pipeOrConduitSize) {
        out.push(`${indent}                string size = "${u.pipeOrConduitSize.replace(/"/g, "'")}"`);
      }
      out.push(`${indent}            }`);
      out.push(`${indent}        )`);
      out.push(`${indent}        {`);
      out.push(`${indent}            double3 xformOp:translate = (${fmt(px)}, ${fmt(py)}, ${fmt(pz)})`);
      out.push(`${indent}            uniform token[] xformOpOrder = ["xformOp:translate"]`);
      // Visible 3D port collar at machine connection point
      out.push(...emitCylinderMesh('PortMarker', matName, 0, 0, -1.5, 1.5, 2.0, `${indent}            `));
      // Visible 3D floor stub-up / drop landing pad at z = 0..0.35 in
      out.push(...emitCylinderMesh('FloorStub', matName, dfx, dfy, dfz + 0.05, dfz + 0.35, 3.2, `${indent}            `));
      // Visible 3D vertical riser (floor -> port) or overhead drop stem (port -> +36 in)
      if (u.routing === 'overhead_drop') {
        out.push(...emitCylinderMesh('OverheadDrop', matName, dfx, dfy, 0, 36.0, 0.75, `${indent}            `));
      } else {
        out.push(...emitCylinderMesh('Riser', matName, dfx, dfy, dfz + 0.35, 0, 0.75, `${indent}            `));
      }
      out.push(`${indent}        }`);
    });
    out.push(`${indent}    }`);
  }

  out.push(`${indent}}`);
  return out;
}
