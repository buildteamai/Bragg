import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * HAIMER Microset UNO 20|70 Optical Tool Presetter
 * 100% Watertight Manifold-3D CAD Reconstruction from /assets/aistudio/IMG_2748_1b6ff553.webp.
 *
 * Mechanical & Industrial-Design Architecture:
 * - 100% watertight Manifold-3D CSG solids (0 primitive fallbacks)
 * - Rounded-corner white powder-coated base cabinet on recessed charcoal steel plinth,
 *   3 left storage drawers, right swing cabinet door with chrome-framed HAIMER badge,
 *   dual right-side cam key locks, and white/black edge-banded precision countertop
 * - Left cantilevered tool-holder storage rack with 3 Boolean-cut Ø64 mm tapered pockets
 *   holding 3 distinct SK50 steep-taper CNC tool assemblies protruding below the shelf
 * - Right cantilevered operator workstation with folded sheet-metal under-shelf printer cradle
 *   (`sheetMetalFold` with exact K-factor flat pattern), compact thermal label printer,
 *   low-profile keyboard, ergonomic optical mouse, riser post, and 21.5" angled industrial monitor
 *   displaying the live HAIMER Microset optical crosshair metrology UI (`haimerScreen`)
 * - Aerodynamic multi-station `superellipseLoft` UNO 20|70 machine base on 3 kinematic leveling feet,
 *   with pleated X-axis bellows cover, left HAIMER shoulder badge, and front "premium" control fascia
 * - Concentric high-precision ISS rotary spindle (`revolute` joint) carrying a brushed-steel
 *   SK50 collet chuck and gold TiN-coated carbide end mill positioned at the optical crosshair focus
 * - Sculpted vertical Z-axis column (`superellipseLoft`) with curved dark UNO 20|70 MICROSET emblem,
 *   recessed guideway track, and sliding Z-axis Y-fork optical measurement carrier (`prismatic` joint)
 *   featuring telecentric camera lens, collimated LED backlight, and brushed-aluminum release handle
 *
 * Master Envelope: 1850 (X) × 1860 (Y) × 740 (Z) mm, grounded flush at Y = 0.0 mm.
 * Coordinate Frame: -X left (tool rack), +X right (workstation/monitor), +Y up, +Z operator front.
 */

// ============================================================================
// PBR ENGINEERING MATERIALS
// ============================================================================

const MAT_GLOSS_WHITE_BODY: PartMaterialSpec = {
  colorHex: '#f1f3f6',
  metalness: 0.08,
  roughness: 0.24,
  clearcoat: 0.55,
  clearcoatRoughness: 0.16,
  densityGPerCm3: 2.7,
  textureKind: 'none',
  finishName: 'RAL 9003 Gloss Powder-Coated Steel / Housing',
};

const MAT_SATIN_WHITE_PANEL: PartMaterialSpec = {
  colorHex: '#ebeff4',
  metalness: 0.06,
  roughness: 0.28,
  clearcoat: 0.35,
  clearcoatRoughness: 0.22,
  densityGPerCm3: 7.85,
  textureKind: 'none',
  finishName: 'Satin White Powder-Coated Cabinet Panel',
};

const MAT_WORKTOP_LAMINATE: PartMaterialSpec = {
  colorHex: '#eff2f5',
  metalness: 0.04,
  roughness: 0.3,
  clearcoat: 0.28,
  densityGPerCm3: 1.4,
  textureKind: 'none',
  finishName: 'High-Pressure White Worktop Laminate',
};

const MAT_CHARCOAL_PLINTH: PartMaterialSpec = {
  colorHex: '#2c3138',
  metalness: 0.35,
  roughness: 0.5,
  densityGPerCm3: 7.85,
  textureKind: 'paintedIndustrialSteel',
  finishName: 'RAL 7021 Charcoal Structural Steel',
};

const MAT_DARK_EDGE_BAND: PartMaterialSpec = {
  colorHex: '#1e2228',
  metalness: 0.14,
  roughness: 0.44,
  clearcoat: 0.15,
  densityGPerCm3: 1.35,
  textureKind: 'none',
  finishName: 'Matte Anthracite ABS Edge Band / Trim',
};

const MAT_BLACK_ANODIZED_POST: PartMaterialSpec = {
  colorHex: '#252930',
  metalness: 0.62,
  roughness: 0.34,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Black Powder-Coated Steel Support Tube',
};

const MAT_BLACK_OXIDE_SPINDLE: PartMaterialSpec = {
  colorHex: '#22262d',
  metalness: 0.78,
  roughness: 0.3,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Hardened Black-Oxide ISS Spindle Steel',
};

const MAT_MACHINED_STEEL: PartMaterialSpec = {
  colorHex: '#bcc4ce',
  metalness: 0.9,
  roughness: 0.2,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Precision Ground Tool Steel',
};

const MAT_BRUSHED_ALUMINUM: PartMaterialSpec = {
  colorHex: '#cfd6df',
  metalness: 0.85,
  roughness: 0.24,
  densityGPerCm3: 2.7,
  textureKind: 'brushedMetal',
  finishName: 'Bead-Blasted Anodized Aluminum',
};

const MAT_TIN_GOLD_CARBIDE: PartMaterialSpec = {
  colorHex: '#d4a644',
  metalness: 0.92,
  roughness: 0.18,
  densityGPerCm3: 14.5,
  textureKind: 'brushedMetal',
  finishName: 'TiN-Coated Solid Carbide End Mill',
};

const MAT_DARK_GRAPHITE_TRIM: PartMaterialSpec = {
  colorHex: '#181c22',
  metalness: 0.18,
  roughness: 0.42,
  clearcoat: 0.22,
  densityGPerCm3: 1.25,
  textureKind: 'none',
  finishName: 'Matte Graphite Instrument Fascia',
};

const MAT_OPTICAL_GLASS: PartMaterialSpec = {
  colorHex: '#0b1017',
  metalness: 0.15,
  roughness: 0.06,
  clearcoat: 0.95,
  clearcoatRoughness: 0.05,
  densityGPerCm3: 2.5,
  textureKind: 'none',
  finishName: 'Anti-Reflective Telecentric Optical Glass',
};

const MAT_HAIMER_CABINET_BADGE: PartMaterialSpec = {
  colorHex: '#20242b',
  metalness: 0.45,
  roughness: 0.28,
  clearcoat: 0.3,
  densityGPerCm3: 2.7,
  textureKind: 'silkscreenLabel',
  labelText: 'HAIMER',
  finishName: 'Brushed Anodized HAIMER Nameplate',
};

const MAT_CAUTION_LABEL: PartMaterialSpec = {
  colorHex: '#facc15',
  metalness: 0.05,
  roughness: 0.3,
  clearcoat: 0.25,
  clearcoatRoughness: 0.2,
  densityGPerCm3: 1.35,
  textureKind: 'silkscreenLabel',
  labelText: 'CAUTION',
  finishName: 'Printed Safety Yellow CAUTION Label',
};

const MAT_HAIMER_BASE_BADGE: PartMaterialSpec = {
  colorHex: '#252a32',
  metalness: 0.32,
  roughness: 0.34,
  densityGPerCm3: 2.7,
  textureKind: 'silkscreenLabel',
  labelText: 'HAIMER',
  finishName: 'HAIMER Side Housing Emblem',
};

const MAT_HAIMER_PREMIUM_FASCIA: PartMaterialSpec = {
  colorHex: '#242931',
  metalness: 0.25,
  roughness: 0.32,
  clearcoat: 0.3,
  densityGPerCm3: 1.2,
  textureKind: 'silkscreenLabel',
  labelText: 'premium',
  finishName: 'Membrane Control Fascia',
};

const MAT_HAIMER_SCREEN: PartMaterialSpec = {
  colorHex: '#ffffff',
  metalness: 0.05,
  roughness: 0.16,
  clearcoat: 0.4,
  emissiveHex: '#ffffff',
  emissiveIntensity: 0.26,
  densityGPerCm3: 2.5,
  textureKind: 'haimerScreen',
  finishName: '21.5" HAIMER Microvision III Touch Display',
};

// ============================================================================
// GEOMETRY BUILDERS (100% WATERTIGHT MANIFOLD-3D CSG)
// ============================================================================

function makeRoundedRectPts(
  width: number,
  depth: number,
  radius: number,
  segsPerCorner = 6
): [number, number][] {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.max(0.5, Math.min(radius, hw - 1, hd - 1));
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [
    [hw - r, -hd + r, -Math.PI / 2],
    [hw - r, hd - r, 0],
    [-hw + r, hd - r, Math.PI / 2],
    [-hw + r, -hd + r, Math.PI],
  ];
  for (const [cx, cy, startA] of corners) {
    for (let i = 0; i <= segsPerCorner; i++) {
      const a = startA + (i / segsPerCorner) * (Math.PI / 2);
      pts.push([Number((cx + Math.cos(a) * r).toFixed(2)), Number((cy + Math.sin(a) * r).toFixed(2))]);
    }
  }
  return pts;
}

/**
 * Watertight rounded-corner prism along Y: spans X ∈ [-w/2, +w/2], Y ∈ [-h/2, +h/2], Z ∈ [-d/2, +d/2].
 */
function roundedPrismY(
  width: number,
  height: number,
  depth: number,
  cornerRadius: number,
  segsPerCorner = 6
): CsgNodeSpec {
  return {
    op: 'polygonExtrude',
    polygonPoints: makeRoundedRectPts(width, depth, cornerRadius, segsPerCorner),
    depth: height,
    rotateDeg: [-90, 0, 0],
  };
}

/**
 * Builds a vertical SK50 steep-taper CNC tool holder assembly centered at its flange base (local Y = 0),
 * with the steep taper descending to Y = -92 mm (passing cleanly through a Ø64 mm rack hole)
 * and distinct machined milling/boring head rising above Y = 0.
 */
function buildSteepTaperToolHolderCsg(variant: 1 | 2 | 3): CsgNodeSpec {
  // Common SK50 steep-taper shank (below tray) + V-flange collar seated at local Y = 0
  const shankAndCollar: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 28,
    lathePoints: [
      [0, -92],
      [11, -92],
      [13, -86],
      [13, -76],
      [15, -74],
      [22.5, -4],
      [35, -4],
      [37, 0],
      [37, 14],
      [34, 17],
      [28, 17],
      [28, 28],
      [0, 28],
    ],
  };

  if (variant === 1) {
    // Tall indexable arbor / end-mill holder
    const head: CsgNodeSpec = {
      op: 'revolve',
      radialSegments: 24,
      lathePoints: [
        [0, 26],
        [24, 26],
        [24, 64],
        [18, 72],
        [18, 108],
        [11, 114],
        [11, 144],
        [5, 150],
        [0, 150],
      ],
    };
    const cutterTab: CsgNodeSpec = {
      op: 'machinedBlock',
      width: 10,
      height: 36,
      depth: 18,
      chamferMm: 1.5,
      translateMm: [8, 134, 0],
    };
    return { op: 'union', children: [shankAndCollar, head, cutterTab] };
  }

  if (variant === 2) {
    // Stepped indexable shell / face mill cutter with fluted body
    const body: CsgNodeSpec = {
      op: 'revolve',
      radialSegments: 26,
      lathePoints: [
        [0, 26],
        [29, 26],
        [29, 76],
        [23, 82],
        [23, 122],
        [17, 132],
        [17, 152],
        [0, 156],
      ],
    };
    const cartridgeA: CsgNodeSpec = {
      op: 'machinedBlock',
      width: 16,
      height: 44,
      depth: 16,
      chamferMm: 2,
      translateMm: [-18, 92, 10],
    };
    const cartridgeB: CsgNodeSpec = {
      op: 'machinedBlock',
      width: 14,
      height: 52,
      depth: 16,
      chamferMm: 2,
      translateMm: [14, 126, -8],
    };
    return { op: 'union', children: [shankAndCollar, body, cartridgeA, cartridgeB] };
  }

  // Variant 3: Angled fine-boring cartridge head
  const baseBody: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 24,
    lathePoints: [
      [0, 26],
      [26, 26],
      [26, 62],
      [21, 68],
      [21, 88],
      [0, 92],
    ],
  };
  const angledCartridge: CsgNodeSpec = {
    op: 'machinedBlock',
    width: 30,
    height: 54,
    depth: 26,
    chamferMm: 3,
    translateMm: [-4, 106, 0],
    rotateDeg: [0, 0, 24],
  };
  return { op: 'union', children: [shankAndCollar, baseBody, angledCartridge] };
}

/**
 * Builds the aerodynamic sculpted UNO 20|70 machine base housing via multi-station superellipseLoft
 * along X, capturing the sweeping rear overhang (-X), flat X-axis saddle top, and rounded spindle nose (+X).
 * Local origin at center: X ∈ [-350, +345], Y ∈ [-93, +93], Z ∈ [-205, +205].
 */
function buildUnoMachineBaseCsg(): CsgNodeSpec {
  const outerHull: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'x',
    radialSegments: 36,
    superellipseStations: [
      // Swept-up left prow (-X overhang visible in photo)
      { posMm: -350, offsetU: 26, offsetV: 0, halfA: 34, halfB: 142, exponent: 2.9 },
      { posMm: -315, offsetU: 16, offsetV: 0, halfA: 58, halfB: 176, exponent: 3.1 },
      { posMm: -250, offsetU: 4, offsetV: 0, halfA: 82, halfB: 196, exponent: 3.3 },
      // Main central casting body (flat bottom at -93, flat top at +93)
      { posMm: -140, offsetU: 0, offsetV: 0, halfA: 93, halfB: 204, exponent: 3.6 },
      { posMm: 20, offsetU: 0, offsetV: 0, halfA: 93, halfB: 206, exponent: 3.6 },
      { posMm: 165, offsetU: 0, offsetV: 0, halfA: 93, halfB: 204, exponent: 3.5 },
      // Rounded front-right spindle nose (+X)
      { posMm: 265, offsetU: -2, offsetV: 0, halfA: 88, halfB: 186, exponent: 3.1 },
      { posMm: 320, offsetU: -6, offsetV: 0, halfA: 72, halfB: 146, exponent: 2.8 },
      { posMm: 345, offsetU: -10, offsetV: 0, halfA: 46, halfB: 96, exponent: 2.5 },
    ],
  };

  // Flat-machined top deck & flat bottom pad pads unioned cleanly inside the sculpted profile
  // so column, bellows, spindle, and leveling feet seat 100% flush with zero curvature rock
  const topSpindleDeck: CsgNodeSpec = {
    op: 'cylinder',
    radius: 82,
    height: 16,
    radialSegments: 32,
    translateMm: [207, 85, 40],
  };
  const bottomFootPadRear: CsgNodeSpec = {
    op: 'machinedBlock',
    width: 140,
    height: 20,
    depth: 260,
    chamferMm: 4,
    translateMm: [-200, -83, 0],
  };
  const bottomFootPadFront: CsgNodeSpec = {
    op: 'cylinder',
    radius: 64,
    height: 20,
    radialSegments: 24,
    translateMm: [205, -83, 15],
  };
  // Flush blended shoulder landing pad under the left HAIMER nameplate (local [-203, +84..+93, +121])
  const leftBadgeShoulderPad: CsgNodeSpec = {
    op: 'machinedBlock',
    width: 162,
    height: 28,
    depth: 48,
    chamferMm: 5,
    translateMm: [-203, 79, 121],
  };
  // Flush blended front console landing pad under the "premium" operator fascia (local [+17, +84..+93, +131])
  const frontConsoleLandingPad: CsgNodeSpec = {
    op: 'machinedBlock',
    width: 214,
    height: 28,
    depth: 70,
    chamferMm: 6,
    translateMm: [17, 79, 131],
  };

  return {
    op: 'panelSeam',
    seamAxis: 'y',
    seamOffsetMm: -22,
    seamWidthMm: 2.2,
    seamDepthMm: 2.5,
    children: [
      {
        op: 'union',
        children: [
          outerHull,
          topSpindleDeck,
          bottomFootPadRear,
          bottomFootPadFront,
          leftBadgeShoulderPad,
          frontConsoleLandingPad,
        ],
      },
    ],
  };
}

/**
 * Builds the tall sculpted white UNO 20|70 vertical Z-axis column with chamfered crown,
 * subtle rear taper, and a Boolean-subtracted vertical guideway channel along the +X face.
 * Local origin at bottom center: Y ∈ [0, 838], X ∈ [-112, +112], Z ∈ [-110, +110].
 */
function buildZColumnCsg(): CsgNodeSpec {
  const columnBody: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 36,
    superellipseStations: [
      { posMm: 0, offsetU: 0, offsetV: 0, halfA: 112, halfB: 110, exponent: 3.8 },
      { posMm: 40, offsetU: 0, offsetV: 0, halfA: 112, halfB: 110, exponent: 3.8 },
      { posMm: 420, offsetU: 0, offsetV: -2, halfA: 108, halfB: 106, exponent: 3.6 },
      { posMm: 790, offsetU: 0, offsetV: -5, halfA: 104, halfB: 102, exponent: 3.4 },
      { posMm: 822, offsetU: 0, offsetV: -5, halfA: 96, halfB: 94, exponent: 3.1 },
      { posMm: 838, offsetU: 0, offsetV: -5, halfA: 72, halfB: 70, exponent: 2.8 },
    ],
  };

  // Vertical linear guideway slot cut cleanly along the front-right face (+X)
  const guidewaySlot: CsgNodeSpec = {
    op: 'box',
    width: 24,
    height: 700,
    depth: 36,
    translateMm: [106, 420, 26],
  };

  // Small dark sensor/USB port recess near lower front face (visible in photo!)
  const lowerPortPocket: CsgNodeSpec = {
    op: 'box',
    width: 24,
    height: 30,
    depth: 18,
    translateMm: [-48, 128, 106],
  };

  return {
    op: 'subtract',
    children: [columnBody, guidewaySlot, lowerPortPocket],
  };
}

/**
 * Builds the Y-shaped cantilevered glossy white optical measurement carrier bridge
 * that slides vertically along the Z-column and frames the cutting tool tip between
 * the rear telecentric camera pod and front LED backlight illuminator pod.
 * Local origin at carriage hub center (world X = +24, Y = 1345, Z = +45):
 *   - Carriage hub: X ∈ [0, +46], Y ∈ [-36, +36], Z ∈ [-64, +64]
 *   - Rear camera arm (-Z): extends to X = +196, Z ∈ [-82, -52] (world Z = -37..-7)
 *   - Front illuminator arm (+Z): extends to X = +216, Z ∈ [+42, +74] (world Z = +87..+119)
 * Leaves a wide 94 mm optical throat around the spindle centerline at local (X = +148, Z = 0)!
 */
function buildOpticalCarrierCsg(): CsgNodeSpec {
  // Carriage slide hub riding on the Z-column +X face
  const slideHub: CsgNodeSpec = {
    op: 'machinedBlock',
    width: 52,
    height: 68,
    depth: 152,
    chamferMm: 8,
    translateMm: [26, 0, -4],
  };

  // Sculpted rear camera yoke arm (-Z side of cutting tool)
  const rearArm: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'x',
    radialSegments: 24,
    superellipseStations: [
      { posMm: 36, offsetU: 2, offsetV: -66, halfA: 30, halfB: 22, exponent: 3.0 },
      { posMm: 115, offsetU: 4, offsetV: -68, halfA: 24, halfB: 18, exponent: 3.0 },
      { posMm: 188, offsetU: 0, offsetV: -66, halfA: 22, halfB: 18, exponent: 2.8 },
      { posMm: 204, offsetU: 0, offsetV: -66, halfA: 14, halfB: 12, exponent: 2.4 },
    ],
  };

  // Sculpted front backlight illuminator yoke arm (+Z side of cutting tool)
  const frontArm: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'x',
    radialSegments: 24,
    superellipseStations: [
      { posMm: 36, offsetU: 2, offsetV: 58, halfA: 30, halfB: 22, exponent: 3.0 },
      { posMm: 125, offsetU: 2, offsetV: 62, halfA: 25, halfB: 19, exponent: 3.0 },
      { posMm: 202, offsetU: 0, offsetV: 62, halfA: 23, halfB: 19, exponent: 2.8 },
      { posMm: 220, offsetU: 0, offsetV: 62, halfA: 15, halfB: 13, exponent: 2.4 },
    ],
  };

  // Handle mounting knuckle boss on front-left of hub
  const handleBoss: CsgNodeSpec = {
    op: 'cylinder',
    radius: 20,
    height: 36,
    radialSegments: 24,
    rotateDeg: [0, 0, 90],
    translateMm: [14, -4, 62],
  };

  return {
    op: 'union',
    children: [slideHub, rearArm, frontArm, handleBoss],
  };
}

// ============================================================================
// PARTS ARRAY — PRECISION COORDINATE TABLE (ZERO GAPS, ZERO CLASHES)
// ============================================================================

const COUNTERTOP_TOP_Y = 811.6;
const BASE_BOTTOM_Y = 840.0;
const BASE_TOP_Y = 1026.0;
const SPINDLE_X = 172;
const SPINDLE_Z = 45;
const COLUMN_X = -88;
const COLUMN_Z = -28;
const CARRIER_HOME_Y = 1345;

const PARTS: BlueprintPart[] = [
  // --------------------------------------------------------------------------
  // 1. BASE CABINET & COUNTERTOP (Grounded flush at Y = 0.0 mm)
  // --------------------------------------------------------------------------
  {
    id: 'haimer-cabinet-plinth',
    name: 'Recessed Steel Toe-Kick Plinth',
    group: 'Base Cabinet',
    role: 'primary',
    anchorKind: 'floor',
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    positionMm: [0, 41, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, -60, 0],
    toleranceMm: 0.25,
    material: MAT_CHARCOAL_PLINTH,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: roundedPrismY(1036, 82, 596, 38, 6),
    },
  },
  {
    id: 'haimer-cabinet-body',
    name: 'Rounded Gloss-White Cabinet Chassis',
    group: 'Base Cabinet',
    role: 'primary',
    positionMm: [0, 432, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, -25, 0],
    toleranceMm: 0.2,
    material: MAT_GLOSS_WHITE_BODY,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: roundedPrismY(1076, 700.6, 636, 48, 8),
    },
  },
  {
    id: 'haimer-drawer-bottom',
    name: 'Lower Left Tool Storage Drawer Front',
    group: 'Base Cabinet',
    role: 'secondary',
    positionMm: [-277, 207, 321.8],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-35, -15, 95],
    toleranceMm: 0.15,
    material: MAT_SATIN_WHITE_PANEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 360,
        height: 212,
        depth: 8,
        chamferMm: 2,
      },
    },
  },
  {
    id: 'haimer-drawer-middle',
    name: 'Middle Left Tool Storage Drawer Front',
    group: 'Base Cabinet',
    role: 'secondary',
    positionMm: [-277, 427, 321.8],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-35, 0, 115],
    toleranceMm: 0.15,
    material: MAT_SATIN_WHITE_PANEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 360,
        height: 212,
        depth: 8,
        chamferMm: 2,
      },
    },
  },
  {
    id: 'haimer-drawer-top',
    name: 'Upper Left Tool Storage Drawer Front',
    group: 'Base Cabinet',
    role: 'secondary',
    positionMm: [-277, 653, 321.8],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-35, 15, 135],
    toleranceMm: 0.15,
    material: MAT_SATIN_WHITE_PANEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 360,
        height: 224,
        depth: 8,
        chamferMm: 2,
      },
    },
  },
  {
    id: 'haimer-cabinet-door',
    name: 'Right Electronics & Storage Swing Door',
    group: 'Base Cabinet',
    role: 'secondary',
    positionMm: [142, 433, 321.8],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [35, 0, 110],
    toleranceMm: 0.15,
    material: MAT_SATIN_WHITE_PANEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 462,
        height: 664,
        depth: 8,
        chamferMm: 2,
      },
    },
  },
  {
    id: 'haimer-cabinet-badge-frame',
    name: 'Chrome-Beveled HAIMER Cabinet Nameplate',
    group: 'Base Cabinet',
    role: 'detail',
    positionMm: [142, 678, 328.8],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [35, 15, 155],
    toleranceMm: 0.1,
    material: MAT_HAIMER_CABINET_BADGE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 172,
        height: 36,
        depth: 6.4,
        chamferMm: 2.2,
      },
    },
  },
  {
    id: 'haimer-cabinet-caution-label',
    name: 'Cabinet Front Door CAUTION Safety Label',
    group: 'Base Cabinet',
    role: 'detail',
    positionMm: [142, 520, 326.8],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [35, 5, 150],
    toleranceMm: 0.1,
    material: MAT_CAUTION_LABEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 144,
        height: 36,
        depth: 2.4,
        chamferMm: 0.6,
      },
    },
  },
  {
    id: 'haimer-side-cam-locks',
    name: 'Right Side Panel Cam Key Lock',
    group: 'Base Cabinet',
    role: 'detail',
    positionMm: [540.3, 232, 60],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [65, 0, 0],
    toleranceMm: 0.1,
    pattern: {
      kind: 'linear',
      count: 2,
      stepMm: [0, 488, 0],
    },
    material: MAT_MACHINED_STEEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'revolve',
        radialSegments: 24,
        rotateDeg: [0, 0, -90],
        lathePoints: [
          [0, -2.7],
          [11.5, -2.7],
          [11.5, 0.8],
          [9.5, 2.5],
          [7.0, 2.5],
          [7.0, 1.4],
          [0, 1.4],
        ],
      },
    },
  },
  {
    id: 'haimer-countertop-band',
    name: 'Countertop Anthracite Edge-Banded Core',
    group: 'Base Cabinet',
    role: 'primary',
    positionMm: [0, 795, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 25, 0],
    toleranceMm: 0.2,
    material: MAT_DARK_EDGE_BAND,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: roundedPrismY(1106, 26.6, 666, 52, 8),
    },
  },
  {
    id: 'haimer-countertop-surface',
    name: 'Countertop White High-Pressure Laminate Plate',
    group: 'Base Cabinet',
    role: 'primary',
    positionMm: [0, 809.6, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 35, 0],
    toleranceMm: 0.15,
    material: MAT_WORKTOP_LAMINATE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: roundedPrismY(1096, 4.0, 656, 48, 8),
    },
  },

  // --------------------------------------------------------------------------
  // 2. LEFT TOOL-HOLDER STORAGE RACK & 3 SK50 TOOL HOLDERS
  // --------------------------------------------------------------------------
  {
    id: 'haimer-left-post',
    name: 'Left Tool-Rack Support Column & Base Flange',
    group: 'Left Tool Storage',
    role: 'secondary',
    positionMm: [-456, COUNTERTOP_TOP_Y - 0.4, 10],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-90, 55, 0],
    toleranceMm: 0.15,
    material: MAT_BLACK_ANODIZED_POST,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'revolve',
        radialSegments: 28,
        lathePoints: [
          [0, 0],
          [46, 0],
          [46, 12],
          [42, 16],
          [29, 16],
          [29, 194.2],
          [0, 194.2],
        ],
      },
    },
  },
  {
    id: 'haimer-left-tray-edge',
    name: 'Left Tool-Holder Shelf Anthracite Core (3× Ø64 mm Bores)',
    group: 'Left Tool Storage',
    role: 'secondary',
    positionMm: [-650, 1015, 10],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-125, 85, 0],
    toleranceMm: 0.15,
    material: MAT_DARK_EDGE_BAND,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'subtract',
        children: [
          roundedPrismY(474, 20.4, 236, 36, 6),
          { op: 'cylinder', radius: 32, height: 34, radialSegments: 28, translateMm: [-135, 0, 0] },
          { op: 'cylinder', radius: 32, height: 34, radialSegments: 28, translateMm: [-15, 0, 0] },
          { op: 'cylinder', radius: 32, height: 34, radialSegments: 28, translateMm: [105, 0, 0] },
        ],
      },
    },
  },
  {
    id: 'haimer-left-tray-top',
    name: 'Left Tool-Holder Shelf White Laminate Top (3× Ø64 mm Bores)',
    group: 'Left Tool Storage',
    role: 'secondary',
    positionMm: [-650, 1027, 10],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-125, 98, 0],
    toleranceMm: 0.15,
    material: MAT_WORKTOP_LAMINATE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'subtract',
        children: [
          roundedPrismY(466, 4.4, 228, 32, 6),
          { op: 'cylinder', radius: 32, height: 18, radialSegments: 28, translateMm: [-135, 0, 0] },
          { op: 'cylinder', radius: 32, height: 18, radialSegments: 28, translateMm: [-15, 0, 0] },
          { op: 'cylinder', radius: 32, height: 18, radialSegments: 28, translateMm: [105, 0, 0] },
        ],
      },
    },
  },
  {
    id: 'haimer-tool-holder-1',
    name: 'SK50 Indexable Milling Arbor (Bay 1)',
    group: 'Left Tool Storage',
    role: 'detail',
    positionMm: [-785, 1029.0, 10],
    rotationDeg: [0, 12, 0],
    explodeOffsetMm: [-160, 165, 0],
    toleranceMm: 0.1,
    material: MAT_BLACK_OXIDE_SPINDLE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: buildSteepTaperToolHolderCsg(1),
    },
  },
  {
    id: 'haimer-tool-holder-2',
    name: 'SK50 Fluted Shell Mill Assembly (Bay 2)',
    group: 'Left Tool Storage',
    role: 'detail',
    positionMm: [-665, 1029.0, 10],
    rotationDeg: [0, -18, 0],
    explodeOffsetMm: [-140, 180, 0],
    toleranceMm: 0.1,
    material: MAT_BLACK_OXIDE_SPINDLE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: buildSteepTaperToolHolderCsg(2),
    },
  },
  {
    id: 'haimer-tool-holder-3',
    name: 'SK50 Angled Fine-Boring Head (Bay 3)',
    group: 'Left Tool Storage',
    role: 'detail',
    positionMm: [-545, 1029.0, 10],
    rotationDeg: [0, 8, 0],
    explodeOffsetMm: [-120, 165, 0],
    toleranceMm: 0.1,
    material: MAT_BLACK_OXIDE_SPINDLE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: buildSteepTaperToolHolderCsg(3),
    },
  },

  // --------------------------------------------------------------------------
  // 3. RIGHT WORKSTATION WING: POST, TRAY, SHEET-METAL PRINTER CRADLE,
  //    THERMAL LABEL PRINTER, KEYBOARD, MOUSE & 21.5" MONITOR
  // --------------------------------------------------------------------------
  {
    id: 'haimer-right-post',
    name: 'Right Workstation Support Column & Base Flange',
    group: 'Operator Workstation',
    role: 'secondary',
    positionMm: [448, COUNTERTOP_TOP_Y - 0.4, 15],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [90, 55, 0],
    toleranceMm: 0.15,
    material: MAT_BLACK_ANODIZED_POST,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'revolve',
        radialSegments: 28,
        lathePoints: [
          [0, 0],
          [48, 0],
          [48, 12],
          [44, 16],
          [31, 16],
          [31, 194.2],
          [0, 194.2],
        ],
      },
    },
  },
  {
    id: 'haimer-right-tray-edge',
    name: 'Keyboard & Mouse Shelf Anthracite Core',
    group: 'Operator Workstation',
    role: 'secondary',
    positionMm: [625, 1015, 55],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [130, 85, 25],
    toleranceMm: 0.15,
    material: MAT_DARK_EDGE_BAND,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: roundedPrismY(600, 20.4, 296, 42, 6),
    },
  },
  {
    id: 'haimer-right-tray-top',
    name: 'Keyboard & Mouse Shelf White Laminate Surface',
    group: 'Operator Workstation',
    role: 'secondary',
    positionMm: [625, 1027, 55],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [130, 98, 25],
    toleranceMm: 0.15,
    material: MAT_WORKTOP_LAMINATE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: roundedPrismY(592, 4.4, 288, 38, 6),
    },
  },
  {
    id: 'haimer-printer-cradle',
    name: 'Folded Sheet-Metal Under-Shelf Label Printer Cradle',
    group: 'Operator Workstation',
    role: 'secondary',
    positionMm: [576, 860, 35],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [135, 35, 30],
    toleranceMm: 0.2,
    material: MAT_SATIN_WHITE_PANEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'sheetMetalFold',
        width: 172,
        depth: 190,
        thicknessMm: 3.0,
        kFactor: 0.42,
        foldFlanges: [
          {
            edge: '-x',
            flangeLengthMm: 146.5,
            angleDeg: 90,
            bendRadiusMm: 4.0,
            returnFlange: { flangeLengthMm: 22, angleDeg: 90, bendRadiusMm: 4.0 },
          },
          {
            edge: '-z',
            flangeLengthMm: 146.5,
            angleDeg: 90,
            bendRadiusMm: 4.0,
            returnFlange: { flangeLengthMm: 22, angleDeg: 90, bendRadiusMm: 4.0 },
          },
        ],
        baseHoles: [
          { x: -45, z: -45, diameterMm: 8 },
          { x: 45, z: 45, diameterMm: 8 },
        ],
      },
    },
  },
  {
    id: 'haimer-label-printer-body',
    name: 'Thermal Tool-ID Label Printer Housing',
    group: 'Operator Workstation',
    role: 'detail',
    positionMm: [578, 922, 46],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [155, 55, 75],
    toleranceMm: 0.15,
    material: MAT_GLOSS_WHITE_BODY,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'superellipseLoft',
        loftAxis: 'z',
        radialSegments: 28,
        superellipseStations: [
          { posMm: -76, offsetU: 0, offsetV: 0, halfA: 56, halfB: 54, exponent: 3.0 },
          { posMm: -10, offsetU: 0, offsetV: 4, halfA: 64, halfB: 61, exponent: 3.2 },
          { posMm: 48, offsetU: 0, offsetV: -4, halfA: 62, halfB: 54, exponent: 3.0 },
          { posMm: 76, offsetU: 0, offsetV: -18, halfA: 56, halfB: 38, exponent: 2.8 },
        ],
      },
    },
  },
  {
    id: 'haimer-label-printer-lid',
    name: 'Thermal Label Printer Dark Front Feed Lid',
    group: 'Operator Workstation',
    role: 'detail',
    positionMm: [578, 938, 108],
    rotationDeg: [-24, 0, 0],
    explodeOffsetMm: [160, 62, 115],
    toleranceMm: 0.1,
    material: MAT_DARK_GRAPHITE_TRIM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 96,
        height: 52,
        depth: 18,
        chamferMm: 4,
      },
    },
  },
  {
    id: 'haimer-keyboard',
    name: 'Low-Profile Industrial Keyboard',
    group: 'Operator Workstation',
    role: 'detail',
    positionMm: [558, 1037.2, 106],
    rotationDeg: [3, 0, 0],
    explodeOffsetMm: [130, 145, 70],
    toleranceMm: 0.15,
    material: MAT_DARK_GRAPHITE_TRIM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'union',
        children: [
          { op: 'machinedBlock', width: 416, height: 12, depth: 136, chamferMm: 3 },
          { op: 'machinedBlock', width: 258, height: 6, depth: 92, chamferMm: 1.5, translateMm: [-66, 7, 4] },
          { op: 'machinedBlock', width: 48, height: 6, depth: 92, chamferMm: 1.5, translateMm: [94, 7, 4] },
          { op: 'machinedBlock', width: 64, height: 6, depth: 92, chamferMm: 1.5, translateMm: [158, 7, 4] },
        ],
      },
    },
  },
  {
    id: 'haimer-mouse',
    name: 'Ergonomic Optical Mouse',
    group: 'Operator Workstation',
    role: 'detail',
    positionMm: [824, 1044.5, 108],
    rotationDeg: [0, -8, 0],
    explodeOffsetMm: [185, 145, 70],
    toleranceMm: 0.15,
    material: MAT_DARK_GRAPHITE_TRIM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'superellipseLoft',
        loftAxis: 'z',
        radialSegments: 24,
        superellipseStations: [
          { posMm: -52, offsetU: 0, offsetV: -5, halfA: 24, halfB: 10, exponent: 2.4 },
          { posMm: -10, offsetU: 0, offsetV: 0, halfA: 31, halfB: 16, exponent: 2.6 },
          { posMm: 28, offsetU: 0, offsetV: -2, halfA: 30, halfB: 14, exponent: 2.6 },
          { posMm: 52, offsetU: 0, offsetV: -7, halfA: 22, halfB: 8, exponent: 2.3 },
        ],
      },
    },
  },
  {
    id: 'haimer-monitor-stand',
    name: 'Articulated Monitor Riser Column & VESA Bracket',
    group: 'Operator Workstation',
    role: 'secondary',
    positionMm: [652, 1174, -56],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [155, 140, -50],
    toleranceMm: 0.15,
    material: MAT_BLACK_ANODIZED_POST,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'union',
        children: [
          { op: 'machinedBlock', width: 92, height: 14, depth: 74, chamferMm: 3, translateMm: [0, -138, 0] },
          { op: 'cylinder', radius: 22, height: 292, radialSegments: 24, translateMm: [0, 4, 0] },
          { op: 'machinedBlock', width: 112, height: 112, depth: 22, chamferMm: 4, translateMm: [0, 144, 15] },
        ],
      },
    },
  },
  {
    id: 'haimer-monitor-chassis',
    name: '21.5" Industrial Widescreen Touch Monitor Chassis',
    group: 'Operator Workstation',
    role: 'primary',
    positionMm: [652, 1318, -19],
    rotationDeg: [0, -6, 0],
    explodeOffsetMm: [185, 165, 25],
    toleranceMm: 0.15,
    material: MAT_DARK_GRAPHITE_TRIM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 512,
        height: 316,
        depth: 28,
        chamferMm: 4,
      },
    },
  },
  {
    id: 'haimer-monitor-display',
    name: 'HAIMER Microvision III Live Optical Metrology Screen',
    group: 'Operator Workstation',
    role: 'detail',
    positionMm: [650.4, 1318, -3.2],
    rotationDeg: [0, -6, 0],
    explodeOffsetMm: [195, 165, 65],
    toleranceMm: 0.1,
    material: MAT_HAIMER_SCREEN,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 478,
        height: 282,
        depth: 4,
        chamferMm: 0.6,
      },
    },
  },

  // --------------------------------------------------------------------------
  // 4. UNO 20|70 SCULPTED MACHINE BASE, FEET, BELLOWS & CONTROL CONSOLE
  // --------------------------------------------------------------------------
  {
    id: 'haimer-base-feet',
    name: '3-Point Kinematic Vibration-Damping Base Feet',
    group: 'Machine Base',
    role: 'secondary',
    positionMm: [-35, 825.8, 5],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 65, 0],
    toleranceMm: 0.15,
    material: MAT_MACHINED_STEEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'union',
        children: [
          { op: 'cylinder', radius: 24, height: 29.4, radialSegments: 24, translateMm: [-200, 0, -100] },
          { op: 'cylinder', radius: 24, height: 29.4, radialSegments: 24, translateMm: [-200, 0, 100] },
          { op: 'cylinder', radius: 26, height: 29.4, radialSegments: 24, translateMm: [205, 0, 15] },
        ],
      },
    },
  },
  {
    id: 'haimer-machine-base',
    name: 'UNO 20|70 Sculpted Monolithic Machine Base',
    group: 'Machine Base',
    role: 'primary',
    positionMm: [-35, 933, 5],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 95, 0],
    toleranceMm: 0.15,
    material: MAT_GLOSS_WHITE_BODY,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: buildUnoMachineBaseCsg(),
    },
  },
  {
    id: 'haimer-base-bellows',
    name: 'X-Axis Linear Guideway Pleated Bellows Cover',
    group: 'Machine Base',
    role: 'secondary',
    positionMm: [-95, 1031.2, 5],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-20, 130, 0],
    toleranceMm: 0.15,
    material: MAT_DARK_GRAPHITE_TRIM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 280,
        height: 11.2,
        depth: 102,
        chamferMm: 2.5,
      },
    },
  },
  {
    id: 'haimer-base-left-badge',
    name: 'HAIMER Machine Base Left Shoulder Plate',
    group: 'Machine Base',
    role: 'detail',
    positionMm: [-238, 1029.8, 126],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-55, 140, 40],
    toleranceMm: 0.1,
    material: MAT_HAIMER_BASE_BADGE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 146,
        height: 8.6,
        depth: 36,
        chamferMm: 2,
      },
    },
  },
  {
    id: 'haimer-base-console',
    name: 'UNO Premium Front Operator Membrane Console',
    group: 'Machine Base',
    role: 'detail',
    positionMm: [-18, 1031.0, 136],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 140, 50],
    toleranceMm: 0.1,
    material: MAT_HAIMER_PREMIUM_FASCIA,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 196,
        height: 10.6,
        depth: 58,
        chamferMm: 3,
      },
    },
  },

  // --------------------------------------------------------------------------
  // 5. HIGH-PRECISION ISS ROTARY SPINDLE & CARBIDE END MILL (Revolute Joint)
  // --------------------------------------------------------------------------
  {
    id: 'haimer-spindle-housing',
    name: 'ISS Precision Spindle Stator Flange',
    group: 'Tool Spindle',
    role: 'primary',
    positionMm: [SPINDLE_X, BASE_TOP_Y - 0.4, SPINDLE_Z],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [60, 130, 20],
    toleranceMm: 0.05,
    ports: {
      spindleAxisTop: { localOffsetMm: [0, 79.4, 0], normal: [0, 1, 0] },
    },
    material: MAT_BLACK_OXIDE_SPINDLE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'revolve',
        radialSegments: 36,
        lathePoints: [
          [0, 0],
          [73, 0],
          [73, 18],
          [68, 22],
          [64, 22],
          [64, 52],
          [68, 56],
          [68, 70],
          [60, 74],
          [60, 79.4],
          [0, 79.4],
        ],
      },
    },
  },
  {
    id: 'haimer-spindle-rotor',
    name: 'ISS Rotating Spindle Barrel & Indexing Ring',
    group: 'Tool Spindle',
    role: 'primary',
    positionMm: [SPINDLE_X, 1105.0, SPINDLE_Z],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [60, 175, 20],
    toleranceMm: 0.02,
    motionLimits: { minAngleDeg: -180, maxAngleDeg: 180 },
    ports: {
      rotorBase: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
      chuckSeat: { localOffsetMm: [0, 82, 0], normal: [0, 1, 0] },
    },
    constraint: {
      kind: 'concentric',
      selfPort: 'rotorBase',
      targetPartId: 'haimer-spindle-housing',
      targetPort: 'spindleAxisTop',
      axialOffsetMm: 0,
      lockAxial: true,
      lockSpin: false,
    },
    material: MAT_BLACK_OXIDE_SPINDLE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'revolve',
        radialSegments: 36,
        lathePoints: [
          [0, -0.2],
          [55, -0.2],
          [55, 26],
          [48, 30],
          [48, 54],
          [43, 58],
          [43, 74],
          [35, 82],
          [0, 82],
        ],
      },
    },
  },
  {
    id: 'haimer-tool-chuck',
    name: 'SK50 Precision Collet Chuck & Nut',
    group: 'Tool Spindle',
    role: 'secondary',
    positionMm: [SPINDLE_X, 1187.0, SPINDLE_Z],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [60, 225, 20],
    toleranceMm: 0.02,
    ports: {
      spindleMount: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
      colletTip: { localOffsetMm: [0, 88, 0], normal: [0, 1, 0] },
    },
    constraint: {
      kind: 'coincident',
      selfPort: 'spindleMount',
      targetPartId: 'haimer-spindle-rotor',
      targetPort: 'chuckSeat',
      flipNormal: false,
      jointKind: 'fixed',
    },
    material: MAT_MACHINED_STEEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'revolve',
        radialSegments: 32,
        lathePoints: [
          [0, -0.2],
          [26, -0.2],
          [26, 20],
          [22, 24],
          [22, 54],
          [18, 60],
          [18, 82],
          [14, 88],
          [0, 88],
        ],
      },
    },
  },
  {
    id: 'haimer-carbide-endmill',
    name: 'TiN-Coated Solid Carbide End Mill (Measured Tool)',
    group: 'Tool Spindle',
    role: 'detail',
    positionMm: [SPINDLE_X, 1275.0, SPINDLE_Z],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [60, 280, 20],
    toleranceMm: 0.01,
    ports: {
      shankBase: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
    },
    constraint: {
      kind: 'coincident',
      selfPort: 'shankBase',
      targetPartId: 'haimer-tool-chuck',
      targetPort: 'colletTip',
      flipNormal: false,
      jointKind: 'fixed',
    },
    material: MAT_TIN_GOLD_CARBIDE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, -0.2],
          [8.2, -0.2],
          [8.2, 58],
          [7.4, 66],
          [4.2, 71],
          [0, 72],
        ],
      },
    },
  },

  // --------------------------------------------------------------------------
  // 6. VERTICAL Z-AXIS COLUMN & SLIDING OPTICAL CARRIER (Prismatic Z Joint)
  // --------------------------------------------------------------------------
  {
    id: 'haimer-z-column',
    name: 'Sculpted Vertical Z-Axis Metrology Column',
    group: 'Z-Axis Column & Optics',
    role: 'primary',
    positionMm: [COLUMN_X, BASE_TOP_Y - 0.4, COLUMN_Z],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-45, 160, -30],
    toleranceMm: 0.05,
    ports: {
      zGuidewayHome: { localOffsetMm: [112, CARRIER_HOME_Y - (BASE_TOP_Y - 0.4), SPINDLE_Z - COLUMN_Z], normal: [0, 1, 0] },
    },
    material: MAT_GLOSS_WHITE_BODY,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: buildZColumnCsg(),
    },
  },
  {
    id: 'haimer-column-fascia-band',
    name: 'UNO 20|70 MICROSET Curved Dark Column Emblem',
    group: 'Z-Axis Column & Optics',
    role: 'detail',
    positionMm: [COLUMN_X - 6, 1655, COLUMN_Z + 104.5],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-45, 210, 45],
    toleranceMm: 0.1,
    material: MAT_DARK_GRAPHITE_TRIM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'polygonExtrude',
        depth: 7,
        polygonPoints: [
          [-38, -180],
          [26, -125],
          [36, 168],
          [-44, 168],
        ],
      },
    },
  },
  {
    id: 'haimer-column-guideway-rail',
    name: 'Hardened Z-Axis Linear Guideway Rail Strip',
    group: 'Z-Axis Column & Optics',
    role: 'secondary',
    positionMm: [COLUMN_X + 100, 1446, COLUMN_Z + 26],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-10, 160, 0],
    toleranceMm: 0.02,
    material: MAT_DARK_GRAPHITE_TRIM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'machinedBlock',
        width: 14,
        height: 694,
        depth: 26,
        chamferMm: 2,
      },
    },
  },
  {
    id: 'haimer-optical-carrier',
    name: 'Z-Axis Y-Bridge Optical Measurement Carrier',
    group: 'Z-Axis Column & Optics',
    role: 'primary',
    fitClass: 'sliding',
    positionMm: [COLUMN_X + 112, CARRIER_HOME_Y, SPINDLE_Z],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [55, 200, 40],
    toleranceMm: 0.02,
    motionLimits: { minSlideMm: -80, maxSlideMm: 220 },
    ports: {
      columnSlide: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
      handleMount: { localOffsetMm: [-6, -4, 62], normal: [-1, 0, 0] },
      opticsCenter: { localOffsetMm: [148, 0, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'coincident',
      selfPort: 'columnSlide',
      targetPartId: 'haimer-z-column',
      targetPort: 'zGuidewayHome',
      flipNormal: false,
      jointKind: 'prismatic',
    },
    material: MAT_GLOSS_WHITE_BODY,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: buildOpticalCarrierCsg(),
    },
  },
  {
    id: 'haimer-release-handle',
    name: 'One-Hand Pneumatic Axis-Release Grip Handle',
    group: 'Z-Axis Column & Optics',
    role: 'detail',
    positionMm: [COLUMN_X + 106, CARRIER_HOME_Y - 4, SPINDLE_Z + 62],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-40, 200, 115],
    toleranceMm: 0.1,
    ports: {
      mountFlange: { localOffsetMm: [0, 0, 0], normal: [-1, 0, 0] },
    },
    constraint: {
      kind: 'coincident',
      selfPort: 'mountFlange',
      targetPartId: 'haimer-optical-carrier',
      targetPort: 'handleMount',
      flipNormal: false,
      jointKind: 'fixed',
    },
    material: MAT_BRUSHED_ALUMINUM,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'union',
        children: [
          // Brushed aluminum horizontal grip tube extending cleanly across front of column
          {
            op: 'cylinder',
            radius: 13.5,
            height: 175,
            radialSegments: 24,
            rotateDeg: [0, 0, 90],
            translateMm: [-86, 0, 0],
          },
          // End cap dome
          {
            op: 'sphere',
            radius: 13.5,
            radialSegments: 20,
            translateMm: [-173, 0, 0],
          },
          // Pneumatic brake release ring collar
          {
            op: 'cylinder',
            radius: 16.5,
            height: 24,
            radialSegments: 24,
            rotateDeg: [0, 0, 90],
            translateMm: [-12, 0, 0],
          },
        ],
      },
    },
  },
  {
    id: 'haimer-telecentric-optics',
    name: '20× Telecentric CMOS Lens & LED Backlight Collimator',
    group: 'Z-Axis Column & Optics',
    role: 'detail',
    positionMm: [SPINDLE_X, CARRIER_HOME_Y, SPINDLE_Z],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [95, 220, 45],
    toleranceMm: 0.02,
    ports: {
      bridgeDatum: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'coincident',
      selfPort: 'bridgeDatum',
      targetPartId: 'haimer-optical-carrier',
      targetPort: 'opticsCenter',
      flipNormal: false,
      jointKind: 'fixed',
    },
    material: MAT_OPTICAL_GLASS,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: {
        op: 'union',
        children: [
          // Rear telecentric camera lens barrel (-Z side aimed at tool tip)
          {
            op: 'cylinder',
            radius: 13,
            height: 20,
            radialSegments: 24,
            rotateDeg: [90, 0, 0],
            translateMm: [0, 0, -44],
          },
          // Front LED backlight illuminator lens (+Z side aimed at camera)
          {
            op: 'cylinder',
            radius: 12,
            height: 16,
            radialSegments: 24,
            rotateDeg: [90, 0, 0],
            translateMm: [0, 0, 40],
          },
          // Front status indicator bezel
          {
            op: 'cylinder',
            radius: 7,
            height: 8,
            radialSegments: 20,
            rotateDeg: [90, 0, 0],
            translateMm: [18, 0, 80],
          },
        ],
      },
    },
  },
];

// ============================================================================
// EXPORTED BLUEPRINT
// ============================================================================

export const HAIMER_UNO_2070_BLUEPRINT: MeshBlueprint = {
  id: 'haimer-microset-uno-2070',
  name: 'HAIMER Microset UNO 20|70 Optical Tool Presetter',
  category: 'Optical Tool Presetting & Metrology',
  summary:
    'Watertight Manifold-3D CAD assembly of the HAIMER Microset UNO 20|70 optical tool presetter with rounded steel cabinet, 3-bay SK50 tool storage rack, cantilevered Microvision III workstation with folded sheet-metal label printer cradle, articulated Z-axis optical bridge, and rotary ISS tool spindle.',
  sourceImageUrl: '/assets/aistudio/IMG_2748_1b6ff553.webp',
  isReferencePreset: true,
  envelopeMm: {
    width: 1812,
    height: 1864,
    depth: 666,
  },
  toleranceSpecMm: 0.02,
  symmetryPlane: 'none',
  photoMatchCamera: {
    positionMm: [1120, 1260, 2980],
    targetMm: [25, 925, 10],
    fov: 32,
  },
  posePresets: [
    {
      id: 'uno-home-measure',
      label: 'Measurement Focus (Photo Match)',
      jointTargets: {
        'haimer-optical-carrier': { slideMm: 0 },
        'haimer-spindle-rotor': { angleDeg: 0 },
      },
    },
    {
      id: 'uno-long-tool-clearance',
      label: 'High Clearance (+200 mm Z)',
      jointTargets: {
        'haimer-optical-carrier': { slideMm: 200 },
        'haimer-spindle-rotor': { angleDeg: 90 },
      },
    },
    {
      id: 'uno-runout-sweep',
      label: 'Flute Runout Inspection (180°)',
      jointTargets: {
        'haimer-optical-carrier': { slideMm: -35 },
        'haimer-spindle-rotor': { angleDeg: 180 },
      },
    },
  ],
  decals: [
    {
      id: 'uno-column-vertical-decal',
      targetPartId: 'haimer-column-fascia-band',
      positionMm: [COLUMN_X - 8, 1690, COLUMN_Z + 109],
      rotationDeg: [0, 0, 90],
      sizeMm: [220, 56, 24],
      text: 'UNO 20|70',
      subtext: 'MICROSET',
      colorHex: '#f8fafc',
      opacity: 0.96,
      fontWeight: 'bold',
    },
  ],
  parts: PARTS,
  reconstructedAt: new Date().toISOString(),
};
