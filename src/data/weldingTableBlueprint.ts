import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * Generates a closed 2D circular polygon (CCW) for watertight Manifold-3D CrossSection hole cutouts.
 */
function circlePoly2D(cx: number, cy: number, radius: number, segments = 16): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([
      Number((cx + Math.cos(a) * radius).toFixed(3)),
      Number((cy + Math.sin(a) * radius).toFixed(3)),
    ]);
  }
  return pts;
}

/**
 * Generates a closed 2D stadium / oblong slot polygon (CCW) centered at (cx, cy).
 */
function stadiumSlot2D(
  cx: number,
  cy: number,
  length: number,
  width: number,
  horizontal = true,
  arcSegs = 8
): [number, number][] {
  const r = width / 2;
  const halfStraight = Math.max(0.5, length / 2 - r);
  const pts: [number, number][] = [];
  if (horizontal) {
    for (let i = 0; i <= arcSegs; i++) {
      const a = -Math.PI / 2 + (i / arcSegs) * Math.PI;
      pts.push([
        Number((cx + halfStraight + Math.cos(a) * r).toFixed(3)),
        Number((cy + Math.sin(a) * r).toFixed(3)),
      ]);
    }
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI / 2 + (i / arcSegs) * Math.PI;
      pts.push([
        Number((cx - halfStraight + Math.cos(a) * r).toFixed(3)),
        Number((cy + Math.sin(a) * r).toFixed(3)),
      ]);
    }
  } else {
    for (let i = 0; i <= arcSegs; i++) {
      const a = (i / arcSegs) * Math.PI;
      pts.push([
        Number((cx + Math.cos(a) * r).toFixed(3)),
        Number((cy + halfStraight + Math.sin(a) * r).toFixed(3)),
      ]);
    }
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI + (i / arcSegs) * Math.PI;
      pts.push([
        Number((cx + Math.cos(a) * r).toFixed(3)),
        Number((cy - halfStraight + Math.sin(a) * r).toFixed(3)),
      ]);
    }
  }
  return pts;
}

/**
 * Generates a chamfered rectangle 2D polygon (CCW) centered at (0, 0).
 */
function chamferedRect2D(w: number, h: number, c = 2.5): [number, number][] {
  const hw = w / 2;
  const hh = h / 2;
  return [
    [-hw + c, -hh],
    [hw - c, -hh],
    [hw, -hh + c],
    [hw, hh - c],
    [hw - c, hh],
    [-hw + c, hh],
    [-hw, hh - c],
    [-hw, -hh + c],
  ];
}

// --- PHOTOREALISTIC STUDIO PBR MATERIALS (Zero Coarse Noise / Authentic Industrial Finishes) ---

const MAT_TOP_PLATE: PartMaterialSpec = {
  colorHex: '#636c77',
  metalness: 0.84,
  roughness: 0.27,
  clearcoat: 0.08,
  clearcoatRoughness: 0.35,
  textureKind: 'weldingTableGrid',
  finishName: 'Plasma-Nitrided Tool Steel (100 mm Laser Grid)',
};

const MAT_SIDE_APRON: PartMaterialSpec = {
  colorHex: '#565f6a',
  metalness: 0.84,
  roughness: 0.29,
  clearcoat: 0.06,
  clearcoatRoughness: 0.36,
  textureKind: 'none',
  finishName: 'Plasma-Nitrided Side Apron Steel (S355J2+N)',
};

const MAT_UNDER_RIBS: PartMaterialSpec = {
  colorHex: '#3f464f',
  metalness: 0.78,
  roughness: 0.38,
  textureKind: 'none',
  finishName: 'Structural Under-Deck Ribbing Steel',
};

const MAT_RED_LEG: PartMaterialSpec = {
  colorHex: '#c41424',
  metalness: 0.06,
  roughness: 0.22,
  clearcoat: 0.56,
  clearcoatRoughness: 0.14,
  textureKind: 'none',
  finishName: 'RAL 3020 Crimson Powder-Coated Steel Leg',
};

const MAT_BLACK_FOOT: PartMaterialSpec = {
  colorHex: '#1b1f25',
  metalness: 0.22,
  roughness: 0.44,
  textureKind: 'none',
  finishName: 'Black-Oxide Steel & Vulcanized Leveling Pad',
};

const MAT_CAST_FIXTURE: PartMaterialSpec = {
  colorHex: '#2f353e',
  metalness: 0.74,
  roughness: 0.34,
  clearcoat: 0.06,
  clearcoatRoughness: 0.38,
  textureKind: 'none',
  finishName: 'Plasma-Nitrided GGG40 Cast Fixture Steel',
};

const MAT_BLACK_OXIDE: PartMaterialSpec = {
  colorHex: '#232830',
  metalness: 0.68,
  roughness: 0.36,
  textureKind: 'none',
  finishName: 'Hardened Black-Oxide Tool Steel',
};

const MAT_CHROME_PIN: PartMaterialSpec = {
  colorHex: '#dce3ec',
  metalness: 0.94,
  roughness: 0.16,
  textureKind: 'none',
  finishName: 'Precision-Turned Hard Chrome Stainless Steel',
};

const MAT_CLAMP_STEEL: PartMaterialSpec = {
  colorHex: '#645e55',
  metalness: 0.82,
  roughness: 0.3,
  textureKind: 'none',
  finishName: 'Burnished Forged Chromoly Clamp Steel',
};

const MAT_HANDLE_CHARCOAL: PartMaterialSpec = {
  colorHex: '#252930',
  metalness: 0.04,
  roughness: 0.54,
  textureKind: 'none',
  finishName: 'Charcoal 2K Elastomer Grip Core',
};

const MAT_HANDLE_RED: PartMaterialSpec = {
  colorHex: '#e03424',
  metalness: 0.04,
  roughness: 0.44,
  clearcoat: 0.12,
  clearcoatRoughness: 0.32,
  textureKind: 'none',
  finishName: 'High-Visibility Crimson Soft-Grip Overmold',
};

const MAT_ANODIZED_RED_RING: PartMaterialSpec = {
  colorHex: '#c81d26',
  metalness: 0.78,
  roughness: 0.24,
  textureKind: 'none',
  finishName: 'Crimson Anodized Retaining Band',
};

// --- DIMENSION CONSTANTS (SIEGMUND SYSTEM 28 — 2000 x 1000 x 850 mm) ---
const TABLE_LEN = 2000;
const TABLE_WID = 1000;
const TABLE_TOP_Y = 850;
const TOP_THICK = 25;
const SKIRT_BOT_Y = 650;
const SKIRT_TOP_Y = 824.8; // 0.2 mm clean weld-seam clearance beneath top plate (Y=825)
const SKIRT_H = SKIRT_TOP_Y - SKIRT_BOT_Y; // 174.8 mm
const SKIRT_CY = (SKIRT_BOT_Y + SKIRT_TOP_Y) / 2; // 737.4 mm
const SKIRT_THICK = 25;
const HOLE_R = 14; // System 28: Ø28.0 mm bores

// --- CSG BUILDERS ---

/**
 * 2000 x 1000 x 25 mm perforated System 28 top plate with 371 real Ø28 mm boreholes
 * (20x10 primary 100 mm grid + 19x9 diagonal 50 mm offset grid).
 */
function buildTopPlateCsg(): CsgNodeSpec {
  const holes: [number, number][][] = [];
  // Primary 20 x 10 grid (100 mm pitch)
  for (let ix = 0; ix < 20; ix++) {
    const x = -950 + ix * 100;
    for (let iz = 0; iz < 10; iz++) {
      const y = -450 + iz * 100;
      holes.push(circlePoly2D(x, y, HOLE_R, 14));
    }
  }
  // Diagonal 19 x 9 staggered grid (at exact 100 mm laser-etched intersections)
  for (let ix = 0; ix < 19; ix++) {
    const x = -900 + ix * 100;
    for (let iz = 0; iz < 9; iz++) {
      const y = -400 + iz * 100;
      holes.push(circlePoly2D(x, y, HOLE_R, 14));
    }
  }

  return {
    op: 'polygonExtrude',
    depth: TOP_THICK,
    polygonPoints: chamferedRect2D(TABLE_LEN, TABLE_WID, 3),
    polygonHoles: holes,
    rotateDeg: [-90, 0, 0],
  };
}

/**
 * 2000 x 174.8 x 25 mm front/back perforated side apron with 59 real Ø28 mm holes
 * arranged in the signature 3-row staggered diagonal grid (20 + 19 + 20).
 */
function buildLongSkirtCsg(): CsgNodeSpec {
  const holes: [number, number][][] = [];
  const yTop = 800 - SKIRT_CY; // +62.6 mm (world Y = 800)
  const yMid = 750 - SKIRT_CY; // +12.6 mm (world Y = 750)
  const yBot = 700 - SKIRT_CY; // -37.4 mm (world Y = 700)

  for (let i = 0; i < 20; i++) {
    const x = -950 + i * 100;
    holes.push(circlePoly2D(x, yTop, HOLE_R, 14));
    holes.push(circlePoly2D(x, yBot, HOLE_R, 14));
  }
  for (let i = 0; i < 19; i++) {
    const x = -900 + i * 100;
    holes.push(circlePoly2D(x, yMid, HOLE_R, 14));
  }

  return {
    op: 'polygonExtrude',
    depth: SKIRT_THICK,
    polygonPoints: chamferedRect2D(TABLE_LEN, SKIRT_H, 2),
    polygonHoles: holes,
  };
}

/**
 * 949.6 x 174.8 x 25 mm left/right perforated end apron with 29 real Ø28 mm holes
 * (10 + 9 + 10 staggered diagonal grid), fitting cleanly between front and back skirts.
 */
function buildShortSkirtCsg(): CsgNodeSpec {
  const holes: [number, number][][] = [];
  const yTop = 800 - SKIRT_CY;
  const yMid = 750 - SKIRT_CY;
  const yBot = 700 - SKIRT_CY;

  for (let j = 0; j < 10; j++) {
    const x = -450 + j * 100;
    holes.push(circlePoly2D(x, yTop, HOLE_R, 14));
    holes.push(circlePoly2D(x, yBot, HOLE_R, 14));
  }
  for (let j = 0; j < 9; j++) {
    const x = -400 + j * 100;
    holes.push(circlePoly2D(x, yMid, HOLE_R, 14));
  }

  return {
    op: 'polygonExtrude',
    depth: SKIRT_THICK,
    polygonPoints: chamferedRect2D(TABLE_WID - SKIRT_THICK * 2 - 0.4, SKIRT_H, 2),
    polygonHoles: holes,
    rotateDeg: [0, 90, 0],
  };
}

/**
 * Welded under-table structural stiffening rib grid + 4 corner leg mounting plates.
 */
function buildUnderRibsCsg(): CsgNodeSpec {
  const children: CsgNodeSpec[] = [];
  const ribH = 152;
  const ribCy = SKIRT_TOP_Y - ribH / 2 - 0.2; // Y ∈ [672.6, 824.6]
  const innerLen = TABLE_LEN - SKIRT_THICK * 2 - 1;
  const innerWid = TABLE_WID - SKIRT_THICK * 2 - 1;

  // 3 longitudinal ribs along X
  for (const rz of [-200, 0, 200]) {
    children.push({
      op: 'box',
      width: innerLen,
      height: ribH,
      depth: 12,
      translateMm: [0, ribCy, rz],
    });
  }
  // 5 transverse ribs along Z
  for (const rx of [-600, -300, 0, 300, 600]) {
    children.push({
      op: 'box',
      width: 12,
      height: ribH,
      depth: innerWid,
      translateMm: [rx, ribCy, 0],
    });
  }
  // 4 heavy corner leg-mounting gusset plates welded inside the skirt corners (Y ∈ [650.2, 666.2])
  // Tie back into longitudinal/transverse ribs via short vertical gusset webs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      children.push(
        {
          op: 'box',
          width: 162,
          height: 16,
          depth: 162,
          translateMm: [sx * 892, 658.2, sz * 392],
        },
        {
          op: 'box',
          width: 12,
          height: 158,
          depth: 160,
          translateMm: [sx * 816, 745, sz * 392],
        },
        {
          op: 'box',
          width: 160,
          height: 158,
          depth: 12,
          translateMm: [sx * 892, 745, sz * 316],
        }
      );
    }
  }
  return { op: 'union', children };
}

/**
 * Heavy crimson-red Ø90 mm cylindrical tubular steel leg with chamfered bottom rim and top flange collar.
 * Local Y ∈ [48, 650].
 */
function buildRedLegTubeCsg(): CsgNodeSpec {
  return {
    op: 'revolve',
    radialSegments: 36,
    lathePoints: [
      [0, 48],
      [41, 48],
      [45, 52],
      [45, 636],
      [54, 638],
      [54, 650],
      [0, 650],
    ],
  };
}

/**
 * Heavy-duty black leveling foot + spindle + hex adjustment collar.
 * Local Y ∈ [0, 47.8] (grounded flush at Y = 0.0 mm).
 */
function buildLevelingFootCsg(): CsgNodeSpec {
  return {
    op: 'revolve',
    radialSegments: 36,
    lathePoints: [
      [0, 0],
      [47, 0],
      [50, 3],
      [50, 22],
      [45, 27],
      [28, 27],
      [28, 36],
      [21, 38],
      [21, 47.8],
      [0, 47.8],
    ],
  };
}

/**
 * Heavy cast-iron / plasma-nitrided 3D Universal Cradle Clamping Angle (300 x 290 x 140 mm),
 * featuring tall slotted tower on one end, swooping concave inner arch, shorter tower on the opposite end,
 * 4 Ø28 bores along the lower twin webs, and a slotted mounting base.
 * Sits on local Y = 0..290.
 */
function buildHeavyCradleAngleCsg(mirrorX = false): CsgNodeSpec {
  const s = mirrorX ? -1 : 1;
  const xPt = (v: number) => Number((v * s).toFixed(2));

  // Side elevation profile of the cradle wall in XY (width 300 mm: X ∈ [-150, +150], Y ∈ [0, 290])
  const wallProfile: [number, number][] = [
    [xPt(-150), 0],
    [xPt(150), 0],
    [xPt(150), 160],
    [xPt(146), 165],
    [xPt(104), 165],
    [xPt(100), 160],
    [xPt(96), 124],
    [xPt(76), 102],
    [xPt(45), 92],
    [xPt(-10), 92],
    [xPt(-48), 104],
    [xPt(-72), 134],
    [xPt(-84), 178],
    [xPt(-88), 284],
    [xPt(-94), 290],
    [xPt(-146), 290],
    [xPt(-150), 284],
  ];

  // 4 circular Ø28 bores along lower web + 1 vertical slot in tall tower + 1 circular hole in short tower
  const wallHoles: [number, number][][] = [
    circlePoly2D(xPt(-95), 50, 14, 14),
    circlePoly2D(xPt(-32), 50, 14, 14),
    circlePoly2D(xPt(32), 50, 14, 14),
    circlePoly2D(xPt(95), 50, 14, 14),
    stadiumSlot2D(xPt(-119), 205, 92, 26, false, 8),
    circlePoly2D(xPt(125), 126, 13, 12),
  ];

  // Tall end-face machined flange (at X = s * -139, facing outward along -s*X) with vertical oval slots
  const tallEndFace: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 22,
    polygonPoints: chamferedRect2D(138, 290, 3),
    polygonHoles: [
      stadiumSlot2D(-30, 50, 96, 24, false, 8),
      stadiumSlot2D(30, 50, 96, 24, false, 8),
      circlePoly2D(-30, -68, 13, 12),
      circlePoly2D(30, -68, 13, 12),
    ],
    rotateDeg: [0, 90, 0],
    translateMm: [xPt(-139), 145, 0],
  };

  // Short end-face machined flange (at X = s * +139)
  const shortEndFace: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 22,
    polygonPoints: chamferedRect2D(138, 165, 3),
    polygonHoles: [
      circlePoly2D(-32, 16, 13, 12),
      circlePoly2D(32, 16, 13, 12),
    ],
    rotateDeg: [0, 90, 0],
    translateMm: [xPt(139), 82.5, 0],
  };

  // Slotted horizontal base plate sitting flush at Y ∈ [0, 24]
  const basePlate: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 24,
    polygonPoints: chamferedRect2D(300, 138, 3),
    polygonHoles: [
      stadiumSlot2D(-40, 0, 88, 26, true, 8),
      stadiumSlot2D(62, 0, 74, 26, true, 8),
    ],
    rotateDeg: [-90, 0, 0],
    translateMm: [0, 12, 0],
  };

  return {
    op: 'union',
    children: [
      basePlate,
      tallEndFace,
      shortEndFace,
      {
        op: 'polygonExtrude',
        depth: 20,
        polygonPoints: wallProfile,
        polygonHoles: wallHoles,
        translateMm: [0, 0, 59],
      },
      {
        op: 'polygonExtrude',
        depth: 20,
        polygonPoints: wallProfile,
        polygonHoles: wallHoles,
        translateMm: [0, 0, -59],
      },
    ],
  };
}

/**
 * Flat slotted Universal Stop Bar (240 x 22 x 58 mm) lying flat on the table.
 */
function buildFlatSlottedStopCsg(length = 240, width = 58, height = 22): CsgNodeSpec {
  return {
    op: 'polygonExtrude',
    depth: height,
    polygonPoints: chamferedRect2D(length, width, 4),
    polygonHoles: [
      stadiumSlot2D(-28, 0, length * 0.48, 26, true, 8),
      circlePoly2D(length * 0.34, 0, 13.5, 14),
    ],
    rotateDeg: [-90, 0, 0],
  };
}

/**
 * Medium 90° Slotted Clamping Square (L-bracket, 175 mm tall x 170 mm deep x 50 mm wide).
 * Local Y ∈ [0, 175], base sits flush on Y = 0, upright stands along -Z edge.
 */
function buildMediumLSquareCsg(): CsgNodeSpec {
  const w = 50;
  const h = 175;
  const d = 168;
  const t = 22;

  // Vertical slotted leg at Z ∈ [-d/2, -d/2 + t]
  const vertLeg: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: t,
    polygonPoints: chamferedRect2D(w, h, 3),
    polygonHoles: [
      stadiumSlot2D(0, 18, 86, 22, false, 8),
      circlePoly2D(0, -48, 11, 12),
    ],
    translateMm: [0, h / 2, -d / 2 + t / 2],
  };

  // Horizontal slotted base leg at Y ∈ [0, t]
  const horizLeg: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: t,
    polygonPoints: chamferedRect2D(w, d, 3),
    polygonHoles: [
      stadiumSlot2D(0, -14, 82, 22, false, 8),
      circlePoly2D(0, 50, 11, 12),
    ],
    rotateDeg: [-90, 0, 0],
    translateMm: [0, t / 2, 0],
  };

  // Twin triangular side stiffening gussets on ±X faces
  const gussetPoly: [number, number][] = [
    [-d / 2 + t - 2, t - 2],
    [-d / 2 + t + 72, t - 2],
    [-d / 2 + t - 2, t + 92],
  ];
  const leftGusset: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 10,
    polygonPoints: gussetPoly,
    rotateDeg: [0, -90, 0],
    translateMm: [-w / 2 + 5, 0, 0],
  };
  const rightGusset: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 10,
    polygonPoints: gussetPoly,
    rotateDeg: [0, -90, 0],
    translateMm: [w / 2 - 5, 0, 0],
  };

  return {
    op: 'union',
    children: [vertLeg, horizLeg, leftGusset, rightGusset],
  };
}

/**
 * Turned black-oxide eccentric clamping disc / stop puck (Ø56 x 36 mm, local Y ∈ [0, 36]).
 */
function buildEccentricStopDiscCsg(cx: number, cz: number): CsgNodeSpec {
  return {
    op: 'subtract',
    children: [
      {
        op: 'revolve',
        radialSegments: 28,
        lathePoints: [
          [0, 0],
          [26.5, 0],
          [28, 2],
          [28, 33],
          [25.5, 36],
          [0, 36],
        ],
        translateMm: [cx, 0, cz],
      },
      {
        op: 'cylinder',
        radius: 11,
        height: 44,
        radialSegments: 16,
        translateMm: [cx + 5, 18, cz],
      },
    ],
  };
}

/**
 * Precision-turned bright chrome System 28 upright Quick-Lock Clamping Bolt (92 mm tall, local Y ∈ [0, 92]).
 */
function buildUprightQuickLockPinCsg(cx: number, cz: number): CsgNodeSpec {
  return {
    op: 'revolve',
    radialSegments: 24,
    lathePoints: [
      [0, 0],
      [13, 0],
      [14, 2],
      [14, 12],
      [12.5, 13.5],
      [12.5, 16.5],
      [14, 18],
      [14, 34],
      [18.5, 36],
      [19.5, 38],
      [19.5, 50],
      [17.5, 52],
      [12.5, 54],
      [12.5, 70],
      [19, 73],
      [20.5, 76],
      [20.5, 88],
      [18, 92],
      [0, 92],
    ],
    translateMm: [cx, 0, cz],
  };
}

/**
 * Horizontal heavy-duty System 28 Quick-Lock Bolts (6 pieces lying along Z in front-right echelon).
 * Split into 3 zero-overlap multi-material CSG unions: bright stainless sleeves, black-oxide collars, and crimson retaining bands.
 */
interface HorizBoltSpec {
  x: number;
  z: number;
}

const HORIZ_BOLT_POSITIONS: HorizBoltSpec[] = [
  { x: 230, z: 150 },
  { x: 330, z: 182 },
  { x: 430, z: 214 },
  { x: 530, z: 246 },
  { x: 630, z: 278 },
  { x: 730, z: 310 },
];

function buildHorizBoltsMultiMaterialCsg(centerY: number): {
  chrome: CsgNodeSpec;
  black: CsgNodeSpec;
  redRings: CsgNodeSpec;
} {
  const chromeChildren: CsgNodeSpec[] = [];
  const blackChildren: CsgNodeSpec[] = [];
  const redChildren: CsgNodeSpec[] = [];

  // Bolt spans local Z ∈ [-82, +82] (164 mm total length), max outer radius = 21.5 mm (sits on table at centerY = 871.7)
  // Axial bands with 0.25 mm gaps between different material parts -> guaranteed 0.000 cm³ overlap!
  for (const b of HORIZ_BOLT_POSITIONS) {
    // 1. Matte black-oxide head cap (-82..-50), central collar (-10..+24), and front nose cap (+60..+82)
    blackChildren.push(
      {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, -82],
          [18, -82],
          [21.5, -79],
          [21.5, -53],
          [19, -50.2],
          [0, -50.2],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [b.x, centerY, b.z],
      },
      {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, -10],
          [19, -10],
          [21.5, -7.5],
          [21.5, 21.5],
          [19, 24],
          [0, 24],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [b.x, centerY, b.z],
      },
      {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, 60.2],
          [18.5, 60.2],
          [21.5, 63],
          [21.5, 79],
          [18, 82],
          [0, 82],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [b.x, centerY, b.z],
      }
    );

    // 2. Crimson anodized retaining rings (-49.9..-44.1 and +24.3..+30.1)
    redChildren.push(
      {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, -49.9],
          [18.5, -49.9],
          [18.5, -44.1],
          [0, -44.1],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [b.x, centerY, b.z],
      },
      {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, 24.3],
          [18.5, 24.3],
          [18.5, 30.1],
          [0, 30.1],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [b.x, centerY, b.z],
      }
    );

    // 3. Bright turned chrome ball-lock sleeves (-43.8..-10.3 and +30.4..+59.9)
    chromeChildren.push(
      {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, -43.8],
          [17, -43.8],
          [18, -42],
          [18, -12],
          [17, -10.3],
          [0, -10.3],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [b.x, centerY, b.z],
      },
      {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, 30.4],
          [17, 30.4],
          [18, 32],
          [18, 58],
          [17, 59.9],
          [0, 59.9],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [b.x, centerY, b.z],
      }
    );
  }

  return {
    chrome: { op: 'union', children: chromeChildren },
    black: { op: 'union', children: blackChildren },
    redRings: { op: 'union', children: redChildren },
  };
}

/**
 * Builds the ergonomic 2-component Bessey/Siegmund clamp handle in local coordinates
 * (base sits at Y = 0, top dome at Y = 116 mm, max radius = 15.5 mm).
 * Returns ZERO-OVERLAP charcoal core and crimson side soft-grip inlays via exact CSG complement!
 */
function buildErgonomicClampHandlePair(): {
  charcoalLocal: CsgNodeSpec;
  redLocal: CsgNodeSpec;
} {
  // Smooth revolved teardrop grip profile (102 mm tall, matches real Bessey/Siegmund 2K handle ratio)
  const handleShell: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 22,
    lathePoints: [
      [0, 0],
      [9.0, 0],
      [10.0, 7],
      [11.0, 20],
      [13.0, 38],
      [14.6, 58],
      [15.0, 76],
      [13.8, 90],
      [10.6, 98],
      [5.8, 101],
      [0, 102],
    ],
  };

  // Sculpted side soft-grip windows on +X and -X flanks
  // Core subtracts cutters expanded by 0.25 mm; red inlays intersect unexpanded cutters -> 0.000 cm³ overlap!
  const makeSidePadCutters = (expand: number): CsgNodeSpec[] => [
    {
      op: 'box',
      width: 10.5 + expand * 2,
      height: 66 + expand * 2,
      depth: 21 + expand * 2,
      translateMm: [11.0, 55, 0],
    },
    {
      op: 'box',
      width: 10.5 + expand * 2,
      height: 66 + expand * 2,
      depth: 21 + expand * 2,
      translateMm: [-11.0, 55, 0],
    },
  ];

  const charcoalLocal: CsgNodeSpec = {
    op: 'subtract',
    children: [handleShell, ...makeSidePadCutters(0.25)],
  };

  const redLocal: CsgNodeSpec = {
    op: 'intersect',
    children: [
      handleShell,
      { op: 'union', children: makeSidePadCutters(0) },
    ],
  };

  return { charcoalLocal, redLocal };
}

/**
 * Builds a vertical System 28 Screw Clamp metal frame (post seated on Y=0, forged arm extending -X,
 * Acme ribbed threaded spindle + swiveling round pressure pad + top steel ferrule).
 * Returns both the metal frame CSG and the exact local anchor [x, y, z] where the handle starts.
 */
function buildVerticalScrewClampFrameCsg(
  postHeightMm: number,
  armReachMm = 105
): { frameCsg: CsgNodeSpec; handleAnchorLocalMm: [number, number, number] } {
  const armY = postHeightMm - 42;
  const spindleX = -armReachMm;
  const spindleTopY = postHeightMm + 36;
  const padTopY = 26;

  const children: CsgNodeSpec[] = [
    // Vertical Ø28 mm clamping post with stepped base shoulder seating flush at Y = 0
    {
      op: 'revolve',
      radialSegments: 22,
      lathePoints: [
        [0, 0],
        [17, 0],
        [18, 2],
        [18, 12],
        [14, 15],
        [14, postHeightMm - 6],
        [16, postHeightMm - 4],
        [16, postHeightMm],
        [0, postHeightMm],
      ],
    },
    // Sliding forged boss collar around the vertical post
    {
      op: 'cylinder',
      radius: 21,
      height: 44,
      radialSegments: 20,
      translateMm: [0, armY, 0],
    },
    // Horizontal forged clamp arm extending from post (0) to spindle (-armReachMm)
    {
      op: 'box',
      width: armReachMm,
      height: 24,
      depth: 22,
      translateMm: [-armReachMm / 2, armY, 0],
    },
    // Heavy threaded spindle boss nut at the left end of the arm
    {
      op: 'cylinder',
      radius: 17.5,
      height: 46,
      radialSegments: 20,
      translateMm: [spindleX, armY, 0],
    },
    // Swivel pressure foot pad at bottom of spindle (hovers 4 mm above table Y=0)
    {
      op: 'revolve',
      radialSegments: 22,
      lathePoints: [
        [0, 4],
        [18, 4],
        [19.5, 6.5],
        [19.5, 13],
        [14, 18],
        [11, 24],
        [0, 24],
      ],
      translateMm: [spindleX, 0, 0],
    },
    // Acme threaded spindle shaft + ferrule collar up to spindleTopY
    {
      op: 'revolve',
      radialSegments: 18,
      lathePoints: [
        [0, padTopY - 4],
        [8, padTopY - 4],
        [8, spindleTopY - 12],
        [11, spindleTopY - 10],
        [11, spindleTopY],
        [0, spindleTopY],
      ],
      translateMm: [spindleX, 0, 0],
    },
  ];

  // Crisp machined Acme thread rings along exposed spindle below & above boss
  for (let ty = 34; ty <= spindleTopY - 18; ty += 9) {
    if (Math.abs(ty - armY) < 25) continue;
    children.push({
      op: 'cylinder',
      radius: 9.4,
      height: 3.6,
      radialSegments: 16,
      translateMm: [spindleX, ty, 0],
    });
  }

  return {
    frameCsg: { op: 'union', children },
    handleAnchorLocalMm: [spindleX, spindleTopY + 0.25, 0],
  };
}

/**
 * Builds the signature 45° / Variable-Angle System 28 Screw Clamp (Clamps #9 & #10 at back-right):
 * Vertical post seated on Y=0, swivel collar boss, inclined sliding cross-tube tilted +16° up-right,
 * angled spindle nut yoke at the left end, tilted Acme threaded spindle + swivel pad pointing down-left,
 * and angled handle pointing up-right (~26° from vertical).
 */
function buildAngledScrewClampFrameCsg(): {
  frameCsg: CsgNodeSpec;
  handleAnchorLocalMm: [number, number, number];
  handleRotateDeg: [number, number, number];
} {
  const postH = 204;
  const pivotY = 176;
  const barAngleDeg = 16; // +Z rotation lifts +X end upward, lowers -X end downward
  const barRad = (barAngleDeg * Math.PI) / 180;

  // Yoke center sits 84 mm along the -X side of the inclined sliding bar
  const yokeDist = -84;
  const yokeX = Math.cos(barRad) * yokeDist;
  const yokeY = pivotY + Math.sin(barRad) * yokeDist;

  // Spindle leans +26° toward +X (top handle leans right, bottom pressure pad points down-left)
  const spindleTiltDeg = -26;
  const tiltRad = (26 * Math.PI) / 180;
  const spHalfBelow = 104;
  const spAbove = 40;

  // Handle starts right on top of the tilted spindle ferrule (+0.25 mm clear)
  const hDist = spAbove + 0.25;
  const handleX = yokeX + Math.sin(tiltRad) * hDist;
  const handleY = yokeY + Math.cos(tiltRad) * hDist;

  // Build tilted spindle + swivel pressure pad in spindle-local coords, then rotate & translate to yoke
  const spindleSubChildren: CsgNodeSpec[] = [
    {
      op: 'revolve',
      radialSegments: 18,
      lathePoints: [
        [0, -spHalfBelow + 18],
        [8, -spHalfBelow + 18],
        [8, spAbove - 12],
        [11, spAbove - 10],
        [11, spAbove],
        [0, spAbove],
      ],
    },
    // Swivel pressure foot pad at bottom of tilted spindle
    {
      op: 'revolve',
      radialSegments: 22,
      lathePoints: [
        [0, -spHalfBelow],
        [18, -spHalfBelow],
        [19.5, -spHalfBelow + 3],
        [19.5, -spHalfBelow + 9],
        [14, -spHalfBelow + 14],
        [11, -spHalfBelow + 20],
        [0, -spHalfBelow + 20],
      ],
    },
    // Heavy threaded yoke boss collar
    {
      op: 'cylinder',
      radius: 18.5,
      height: 44,
      radialSegments: 20,
      translateMm: [0, 0, 0],
    },
  ];
  for (let ty = -spHalfBelow + 28; ty <= spAbove - 18; ty += 9) {
    if (Math.abs(ty) < 24) continue;
    spindleSubChildren.push({
      op: 'cylinder',
      radius: 9.4,
      height: 3.6,
      radialSegments: 16,
      translateMm: [0, ty, 0],
    });
  }

  const tiltedSpindleAssembly: CsgNodeSpec = {
    op: 'union',
    children: spindleSubChildren,
    rotateDeg: [0, 0, spindleTiltDeg],
    translateMm: [yokeX, yokeY, 0],
  };

  // Inclined round sliding cross-bar passing through the post's swivel boss (from -96 to +112 along bar axis)
  const crossBar: CsgNodeSpec = {
    op: 'cylinder',
    radius: 12.5,
    height: 208,
    radialSegments: 20,
    rotateDeg: [0, 0, 90 + barAngleDeg],
    translateMm: [Math.cos(barRad) * 8, pivotY + Math.sin(barRad) * 8, 0],
  };

  const frameCsg: CsgNodeSpec = {
    op: 'union',
    children: [
      // Vertical post seated on Y = 0
      {
        op: 'revolve',
        radialSegments: 22,
        lathePoints: [
          [0, 0],
          [17, 0],
          [18, 2],
          [18, 12],
          [14, 15],
          [14, postH - 6],
          [16, postH - 4],
          [16, postH],
          [0, postH],
        ],
      },
      // Swivel collar boss at pivotY
      {
        op: 'cylinder',
        radius: 22,
        height: 44,
        radialSegments: 20,
        translateMm: [0, pivotY, 0],
      },
      crossBar,
      tiltedSpindleAssembly,
    ],
  };

  return {
    frameCsg,
    handleAnchorLocalMm: [handleX, handleY, 0],
    handleRotateDeg: [0, 0, spindleTiltDeg],
  };
}

// --- ASSEMBLE COMPLETE BLUEPRINT ---

export function createWeldingTableBlueprint(): MeshBlueprint {
  const parts: BlueprintPart[] = [];

  // 1. FIVE-SIDED PERFORATED WELDING TABLE BOX (371 Top Holes + 176 Side Apron Holes = 547 Real Boreholes!)
  parts.push(
    {
      id: 'wt_top_plate',
      name: 'System 28 Perforated Top Plate (2000×1000×25 mm, 371×Ø28 Bores)',
      group: '5-Sided Welding Table Chassis',
      role: 'primary',
      positionMm: [0, TABLE_TOP_Y - TOP_THICK / 2, 0],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: buildTopPlateCsg(), smoothSharpAngleDeg: 35 },
      material: MAT_TOP_PLATE,
      explodeOffsetMm: [0, 120, 0],
      toleranceMm: 0.1,
    },
    {
      id: 'wt_skirt_front',
      name: 'Front Perforated Side Apron (+Z, 59×Ø28 Bores)',
      group: '5-Sided Welding Table Chassis',
      role: 'primary',
      positionMm: [0, SKIRT_CY, TABLE_WID / 2 - SKIRT_THICK / 2],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: buildLongSkirtCsg(), smoothSharpAngleDeg: 35 },
      material: MAT_SIDE_APRON,
      explodeOffsetMm: [0, 0, 160],
      toleranceMm: 0.1,
    },
    {
      id: 'wt_skirt_back',
      name: 'Back Perforated Side Apron (-Z, 59×Ø28 Bores)',
      group: '5-Sided Welding Table Chassis',
      role: 'primary',
      positionMm: [0, SKIRT_CY, -(TABLE_WID / 2 - SKIRT_THICK / 2)],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: buildLongSkirtCsg(), smoothSharpAngleDeg: 35 },
      material: MAT_SIDE_APRON,
      explodeOffsetMm: [0, 0, -160],
      toleranceMm: 0.1,
    },
    {
      id: 'wt_skirt_right',
      name: 'Right Perforated End Apron (+X, 29×Ø28 Bores)',
      group: '5-Sided Welding Table Chassis',
      role: 'primary',
      positionMm: [TABLE_LEN / 2 - SKIRT_THICK / 2, SKIRT_CY, 0],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: buildShortSkirtCsg(), smoothSharpAngleDeg: 35 },
      material: MAT_SIDE_APRON,
      explodeOffsetMm: [180, 0, 0],
      toleranceMm: 0.1,
    },
    {
      id: 'wt_skirt_left',
      name: 'Left Perforated End Apron (-X, 29×Ø28 Bores)',
      group: '5-Sided Welding Table Chassis',
      role: 'primary',
      positionMm: [-(TABLE_LEN / 2 - SKIRT_THICK / 2), SKIRT_CY, 0],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: buildShortSkirtCsg(), smoothSharpAngleDeg: 35 },
      material: MAT_SIDE_APRON,
      explodeOffsetMm: [-180, 0, 0],
      toleranceMm: 0.1,
    },
    {
      id: 'wt_under_ribs',
      name: 'Under-Deck Welded Stiffening Rib Grid & Leg Gussets',
      group: '5-Sided Welding Table Chassis',
      role: 'secondary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: buildUnderRibsCsg(), smoothSharpAngleDeg: 35 },
      material: MAT_UNDER_RIBS,
      explodeOffsetMm: [0, -60, 0],
      toleranceMm: 0.2,
    }
  );

  // 2. FOUR CRIMSON-RED CYLINDRICAL STEEL LEGS + BLACK LEVELING FEET (Y = 0 .. 650 mm)
  const legTubeCsg = buildRedLegTubeCsg();
  const legFootCsg = buildLevelingFootCsg();
  const legCorners: { id: string; label: string; x: number; z: number }[] = [
    { id: 'fr', label: 'Front-Right', x: 892, z: 392 },
    { id: 'fl', label: 'Front-Left', x: -892, z: 392 },
    { id: 'br', label: 'Back-Right', x: 892, z: -392 },
    { id: 'bl', label: 'Back-Left', x: -892, z: -392 },
  ];

  for (const leg of legCorners) {
    const sx = Math.sign(leg.x);
    const sz = Math.sign(leg.z);
    parts.push(
      {
        id: `wt_leg_tube_${leg.id}`,
        name: `${leg.label} Crimson Tubular Steel Leg (Ø90 mm)`,
        group: 'Support Legs & Leveling Feet',
        role: 'primary',
        positionMm: [leg.x, 0, leg.z],
        rotationDeg: [0, 0, 0],
        geometry: { kind: 'csgSolid', csgRoot: legTubeCsg, smoothSharpAngleDeg: 45 },
        material: MAT_RED_LEG,
        explodeOffsetMm: [sx * 110, -140, sz * 100],
        toleranceMm: 0.2,
      },
      {
        id: `wt_leg_foot_${leg.id}`,
        name: `${leg.label} Heavy-Duty Leveling Foot (Ø100 mm)`,
        group: 'Support Legs & Leveling Feet',
        role: 'secondary',
        anchorKind: 'floor',
        positionMm: [leg.x, 0, leg.z],
        rotationDeg: [0, 0, 0],
        geometry: { kind: 'csgSolid', csgRoot: legFootCsg, smoothSharpAngleDeg: 40 },
        material: MAT_BLACK_FOOT,
        explodeOffsetMm: [sx * 110, -230, sz * 100],
        toleranceMm: 0.2,
        constraint: { kind: 'sitOnGround', groundYMm: 0 },
      }
    );
  }

  // 3. HEAVY CAST-IRON CRADLE CLAMPING ANGLES (Far-Left & Back-Left)
  const DECK_SEAT_Y = TABLE_TOP_Y + 0.2; // 850.2 mm -> zero overlap, flush visual seating
  parts.push(
    {
      id: 'wt_heavy_angle_1',
      name: 'Universal 3D Cradle Clamping Angle #1 (Far-Left, 300×290 mm)',
      group: 'Clamping Angles & Stops',
      role: 'primary',
      positionMm: [-845, DECK_SEAT_Y, -195],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildHeavyCradleAngleCsg(false),
        smoothSharpAngleDeg: 35,
      },
      material: MAT_CAST_FIXTURE,
      explodeOffsetMm: [-220, 200, -80],
      toleranceMm: 0.15,
    },
    {
      id: 'wt_heavy_angle_2',
      name: 'Universal 3D Cradle Clamping Angle #2 (Back-Left, 300×290 mm)',
      group: 'Clamping Angles & Stops',
      role: 'primary',
      positionMm: [-535, DECK_SEAT_Y, -328],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildHeavyCradleAngleCsg(true),
        smoothSharpAngleDeg: 35,
      },
      material: MAT_CAST_FIXTURE,
      explodeOffsetMm: [-140, 220, -140],
      toleranceMm: 0.15,
    }
  );

  // 4. FLAT SLOTTED UNIVERSAL STOP BARS (Front-Left)
  const flatStopCsg = buildFlatSlottedStopCsg(240, 58, 22);
  parts.push(
    {
      id: 'wt_flat_stop_1',
      name: 'Universal Slotted Flat Stop Bar #1 (240×58×22 mm)',
      group: 'Clamping Angles & Stops',
      role: 'secondary',
      positionMm: [-660, DECK_SEAT_Y + 11, -55],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: flatStopCsg, smoothSharpAngleDeg: 35 },
      material: MAT_BLACK_OXIDE,
      explodeOffsetMm: [-180, 170, 50],
      toleranceMm: 0.15,
    },
    {
      id: 'wt_flat_stop_2',
      name: 'Universal Slotted Flat Stop Bar #2 (240×58×22 mm)',
      group: 'Clamping Angles & Stops',
      role: 'secondary',
      positionMm: [-610, DECK_SEAT_Y + 11, 52],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: flatStopCsg, smoothSharpAngleDeg: 35 },
      material: MAT_BLACK_OXIDE,
      explodeOffsetMm: [-160, 170, 110],
      toleranceMm: 0.15,
    },
    {
      id: 'wt_flat_stop_3',
      name: 'Compact Slotted Stop Key Bar (145×32×16 mm)',
      group: 'Clamping Angles & Stops',
      role: 'detail',
      positionMm: [-395, DECK_SEAT_Y + 8, 155],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildFlatSlottedStopCsg(145, 32, 16),
        smoothSharpAngleDeg: 35,
      },
      material: MAT_BLACK_OXIDE,
      explodeOffsetMm: [-110, 165, 140],
      toleranceMm: 0.15,
    }
  );

  // 5. FOUR MEDIUM 90° SLOTTED L-SHAPED CLAMPING SQUARES (Center-Left Row)
  const lSquareCsg = buildMediumLSquareCsg();
  const lSquareCoords: [number, number][] = [
    [-405, -145],
    [-330, -125],
    [-255, -105],
    [-180, -85],
  ];
  lSquareCoords.forEach(([lx, lz], idx) => {
    parts.push({
      id: `wt_l_square_${idx + 1}`,
      name: `90° Slotted Clamping Square #${idx + 1} (175×168 mm)`,
      group: 'Clamping Angles & Stops',
      role: 'secondary',
      positionMm: [lx, DECK_SEAT_Y, lz],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: lSquareCsg, smoothSharpAngleDeg: 35 },
      material: MAT_CAST_FIXTURE,
      explodeOffsetMm: [-80 + idx * 25, 210, -40],
      toleranceMm: 0.15,
    });
  });

  // 6. FOUR DARK ECCENTRIC CLAMPING DISCS / STOP PUCKS (Mid-Left 2x2 Cluster)
  const eccentricDiscCoords: [number, number][] = [
    [-185, 45],
    [-105, 45],
    [-185, 118],
    [-105, 118],
  ];
  parts.push({
    id: 'wt_eccentric_stops_set',
    name: 'Eccentric Clamping Disc Stops (Set of 4, Ø56 mm)',
    group: 'Quick-Lock Pins & Stops',
    role: 'secondary',
    positionMm: [0, DECK_SEAT_Y, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: eccentricDiscCoords.map(([ex, ez]) => buildEccentricStopDiscCsg(ex, ez)),
      },
      smoothSharpAngleDeg: 35,
    },
    material: MAT_BLACK_OXIDE,
    explodeOffsetMm: [-40, 175, 80],
    toleranceMm: 0.15,
  });

  // 7. EIGHT BRIGHT CHROME UPRIGHT QUICK-LOCK CLAMPING PINS (Front-Center)
  const uprightPinCoords: [number, number][] = [
    [-205, 195],
    [-105, 195],
    [-5, 195],
    [95, 195],
    [-185, 305],
    [-85, 305],
    [15, 305],
    [115, 305],
  ];
  parts.push({
    id: 'wt_upright_quicklock_pins',
    name: 'System 28 Upright Quick-Lock Clamping Pins (Set of 8)',
    group: 'Quick-Lock Pins & Stops',
    role: 'secondary',
    positionMm: [0, DECK_SEAT_Y, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: uprightPinCoords.map(([px, pz]) => buildUprightQuickLockPinCsg(px, pz)),
      },
      smoothSharpAngleDeg: 40,
    },
    material: MAT_CHROME_PIN,
    explodeOffsetMm: [0, 210, 150],
    toleranceMm: 0.1,
  });

  // 8. SIX HORIZONTAL HEAVY-DUTY QUICK-LOCK CLAMPING BOLTS (Front-Right Diagonal Echelon)
  const horizBolts = buildHorizBoltsMultiMaterialCsg(DECK_SEAT_Y + 21.5);
  parts.push(
    {
      id: 'wt_horiz_bolts_black',
      name: 'Heavy Quick-Lock Bolt Black-Oxide Collars (Set of 6)',
      group: 'Quick-Lock Pins & Stops',
      role: 'secondary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: horizBolts.black, smoothSharpAngleDeg: 40 },
      material: MAT_BLACK_OXIDE,
      explodeOffsetMm: [140, 180, 170],
      toleranceMm: 0.1,
    },
    {
      id: 'wt_horiz_bolts_chrome',
      name: 'Heavy Quick-Lock Bolt Turned Chrome Sleeves (Set of 6)',
      group: 'Quick-Lock Pins & Stops',
      role: 'detail',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: horizBolts.chrome, smoothSharpAngleDeg: 40 },
      material: MAT_CHROME_PIN,
      explodeOffsetMm: [140, 215, 170],
      toleranceMm: 0.1,
    },
    {
      id: 'wt_horiz_bolts_red_rings',
      name: 'Heavy Quick-Lock Bolt Crimson Retaining Bands (Set of 12)',
      group: 'Quick-Lock Pins & Stops',
      role: 'detail',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: horizBolts.redRings, smoothSharpAngleDeg: 40 },
      material: MAT_ANODIZED_RED_RING,
      explodeOffsetMm: [140, 240, 170],
      toleranceMm: 0.1,
    }
  );

  // 9. TEN HEAVY-DUTY SYSTEM 28 SCREW CLAMPS ALONG BACK ROW (7 Standard + 1 Tall + 2 Tilted Variable-Angle)
  const handlePair = buildErgonomicClampHandlePair();
  const handleCharcoalInstances: CsgNodeSpec[] = [];
  const handleRedInstances: CsgNodeSpec[] = [];

  const stdClamp = buildVerticalScrewClampFrameCsg(150, 102);
  const tallClamp = buildVerticalScrewClampFrameCsg(220, 102);
  const angledClamp = buildAngledScrewClampFrameCsg();

  const verticalClampConfigs: {
    index: number;
    postX: number;
    postZ: number;
    tall?: boolean;
  }[] = [
    { index: 1, postX: -410, postZ: -458 },
    { index: 2, postX: -260, postZ: -435 },
    { index: 3, postX: -110, postZ: -410 },
    { index: 4, postX: 40, postZ: -385 },
    { index: 5, postX: 190, postZ: -360 },
    { index: 6, postX: 340, postZ: -335 },
    { index: 7, postX: 490, postZ: -310 },
    { index: 8, postX: 625, postZ: -285, tall: true },
  ];

  for (const cfg of verticalClampConfigs) {
    const built = cfg.tall ? tallClamp : stdClamp;
    const [hx, hy, hz] = built.handleAnchorLocalMm;
    const exX = Math.round(((cfg.index - 5.5) / 4.5) * 160);

    parts.push({
      id: `wt_screw_clamp_${cfg.index}`,
      name: cfg.tall
        ? `High-Reach Vertical Screw Clamp #${cfg.index} (System 28)`
        : `Vertical Screw Clamp #${cfg.index} (System 28)`,
      group: 'System 28 Screw Clamps',
      role: 'primary',
      positionMm: [cfg.postX, DECK_SEAT_Y, cfg.postZ],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: built.frameCsg, smoothSharpAngleDeg: 40 },
      material: MAT_CLAMP_STEEL,
      explodeOffsetMm: [exX, 240, -170],
      toleranceMm: 0.15,
    });

    handleCharcoalInstances.push({
      ...handlePair.charcoalLocal,
      translateMm: [cfg.postX + hx, DECK_SEAT_Y + hy, cfg.postZ + hz],
    });
    handleRedInstances.push({
      ...handlePair.redLocal,
      translateMm: [cfg.postX + hx, DECK_SEAT_Y + hy, cfg.postZ + hz],
    });
  }

  const angledClampConfigs: { index: number; postX: number; postZ: number }[] = [
    { index: 9, postX: 745, postZ: -230 },
    { index: 10, postX: 880, postZ: -172 },
  ];

  for (const cfg of angledClampConfigs) {
    const [hx, hy, hz] = angledClamp.handleAnchorLocalMm;
    const exX = cfg.index === 9 ? 190 : 240;

    parts.push({
      id: `wt_screw_clamp_${cfg.index}`,
      name: `45° Variable-Angle Screw Clamp #${cfg.index} (System 28)`,
      group: 'System 28 Screw Clamps',
      role: 'primary',
      positionMm: [cfg.postX, DECK_SEAT_Y, cfg.postZ],
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'csgSolid', csgRoot: angledClamp.frameCsg, smoothSharpAngleDeg: 40 },
      material: MAT_CLAMP_STEEL,
      explodeOffsetMm: [exX, 250, -150],
      toleranceMm: 0.15,
    });

    handleCharcoalInstances.push({
      ...handlePair.charcoalLocal,
      rotateDeg: angledClamp.handleRotateDeg,
      translateMm: [cfg.postX + hx, DECK_SEAT_Y + hy, cfg.postZ + hz],
    });
    handleRedInstances.push({
      ...handlePair.redLocal,
      rotateDeg: angledClamp.handleRotateDeg,
      translateMm: [cfg.postX + hx, DECK_SEAT_Y + hy, cfg.postZ + hz],
    });
  }

  // Ergonomic 2K Charcoal & Crimson Handle Sets (10 handles, zero-overlap complementary CSG)
  parts.push(
    {
      id: 'wt_clamp_handles_charcoal',
      name: '2K Ergonomic Clamp Handle Cores (Set of 10, Charcoal)',
      group: 'System 28 Screw Clamps',
      role: 'secondary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: { op: 'union', children: handleCharcoalInstances },
        smoothSharpAngleDeg: 45,
      },
      material: MAT_HANDLE_CHARCOAL,
      explodeOffsetMm: [40, 350, -170],
      toleranceMm: 0.15,
    },
    {
      id: 'wt_clamp_handles_red',
      name: '2K Ergonomic Clamp Soft-Grip Side Inlays (Set of 10, Crimson)',
      group: 'System 28 Screw Clamps',
      role: 'detail',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: { op: 'union', children: handleRedInstances },
        smoothSharpAngleDeg: 45,
      },
      material: MAT_HANDLE_RED,
      explodeOffsetMm: [40, 385, -170],
      toleranceMm: 0.15,
    }
  );

  return {
    id: 'welding-table-system28',
    name: 'System 28 3D Modular Welding Table & Fixture Kit',
    category: 'Industrial Fixturing & Fabrication',
    summary:
      'Watertight Manifold-3D CAD assembly of a 5-sided plasma-nitrided System 28 modular welding table (2000×1000×850 mm, 547 real Ø28 mm boreholes across diagonal top & 3-row side aprons, 100 mm laser-etched coordinate grid, crimson Ø90 mm legs with black leveling feet) outfitted with a full 29-piece professional fixturing kit: 2 heavy cradle clamping angles, 4 slotted L-squares, 3 flat stops, 4 eccentric discs, 8 upright chrome quick-lock pins, 6 horizontal multi-tone quick-lock bolts, and 10 2K-handle screw clamps (7 standard, 1 high-reach, 2 variable-angle).',
    sourceImageUrl: '/assets/aistudio/image_aa616a4f.png',
    envelopeMm: {
      width: 2000,
      height: 1260,
      depth: 1000,
    },
    toleranceSpecMm: 0.15,
    symmetryPlane: 'none',
    photoMatchCamera: {
      positionMm: [1480, 1520, 1890],
      targetMm: [-20, 520, 80],
      fov: 40,
    },
    parts,
    reconstructedAt: '2026-11-22T17:25:00.000Z',
  };
}

export const WELDING_TABLE_SYSTEM28_BLUEPRINT: MeshBlueprint = createWeldingTableBlueprint();
