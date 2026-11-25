import { CsgNodeSpec, PartMaterialSpec } from '../types/blueprint';

/**
 * 18D Parametric Engineering Component Library
 *
 * Reusable, watertight Manifold-3D CSG builders for standardized industrial steel structures
 * (OSHA 1910.25 / NAAMM MBG 531 / ASTM A786 / AISC SHS columns, bolted X-braces, hollow
 * C-channel deck subframes, open welded bar grating, diamond checker plate, mandrel-bent
 * tubular guardrails, double-bolt pipe coupler clamps, folded stair stringers, open bar
 * grating & diamond-plate stair treads, grooved anti-slip nosings, and gooseneck handrails).
 */

export type IndustrialFinishId = 'painted' | 'galvanized' | 'stainless';
export type DeckSurfaceId = 'barGrating' | 'diamondPlate';
export type GuardrailLayoutId = 'backAndLeft' | 'enclosedFront';

export interface WorkPlatformConfig {
  finish: IndustrialFinishId;
  deckSurface: DeckSurfaceId;
  bayCount: 1 | 2 | 3;
  deckHeightMm: 720 | 900 | 1080;
  deckWidthMm: 760 | 860 | 1000;
  guardrailLayout: GuardrailLayoutId;
}

export const DEFAULT_WORK_PLATFORM_CONFIG: WorkPlatformConfig = {
  finish: 'painted',
  deckSurface: 'barGrating',
  bayCount: 2,
  deckHeightMm: 900,
  deckWidthMm: 860,
  guardrailLayout: 'backAndLeft',
};

export interface IndustrialMaterialPalette {
  label: string;
  structural: PartMaterialSpec;
  bracing: PartMaterialSpec;
  guardrail: PartMaterialSpec;
  toeBoard: PartMaterialSpec;
  barGrating: PartMaterialSpec;
  diamondPlate: PartMaterialSpec;
  stairNosing: PartMaterialSpec;
  hardware: PartMaterialSpec;
}

export function getIndustrialMaterialPalette(finish: IndustrialFinishId): IndustrialMaterialPalette {
  switch (finish) {
    case 'galvanized':
      return {
        label: 'Hot-Dip Galvanized Steel',
        structural: {
          colorHex: '#96938d',
          metalness: 0.72,
          roughness: 0.44,
          clearcoat: 0.08,
          clearcoatRoughness: 0.42,
          textureKind: 'galvanizedSteel',
          finishName: 'Hot-Dip Galvanized Structural Steel (ASTM A123)',
        },
        bracing: {
          colorHex: '#84817b',
          metalness: 0.7,
          roughness: 0.48,
          clearcoat: 0.06,
          clearcoatRoughness: 0.46,
          textureKind: 'galvanizedSteel',
          finishName: 'Hot-Dip Galvanized Flat-Bar Cross Bracing',
        },
        guardrail: {
          colorHex: '#9c9993',
          metalness: 0.74,
          roughness: 0.4,
          clearcoat: 0.1,
          clearcoatRoughness: 0.36,
          textureKind: 'galvanizedSteel',
          finishName: 'Hot-Dip Galvanized Schedule-40 Pipe',
        },
        toeBoard: {
          colorHex: '#9e9b95',
          metalness: 0.72,
          roughness: 0.42,
          clearcoat: 0.08,
          clearcoatRoughness: 0.4,
          textureKind: 'galvanizedDiamondPlate',
          finishName: 'Hot-Dip Galvanized Diamond-Plate Kick Plate',
        },
        barGrating: {
          colorHex: '#82807a',
          metalness: 0.74,
          roughness: 0.44,
          clearcoat: 0.08,
          clearcoatRoughness: 0.4,
          textureKind: 'galvanizedSteel',
          finishName: 'Hot-Dip Galvanized Welded Bar Grating (NAAMM 19-W-4)',
        },
        diamondPlate: {
          colorHex: '#a3a09a',
          metalness: 0.72,
          roughness: 0.42,
          clearcoat: 0.1,
          clearcoatRoughness: 0.38,
          textureKind: 'galvanizedDiamondPlate',
          finishName: 'Hot-Dip Galvanized ASTM A786 Diamond Floor Plate',
        },
        stairNosing: {
          colorHex: '#b4b1aa',
          metalness: 0.76,
          roughness: 0.36,
          clearcoat: 0.12,
          clearcoatRoughness: 0.32,
          textureKind: 'galvanizedSteel',
          finishName: 'Galvanized Extruded Anti-Slip Stair Nosing',
        },
        hardware: {
          colorHex: '#76746e',
          metalness: 0.8,
          roughness: 0.38,
          clearcoat: 0.08,
          clearcoatRoughness: 0.34,
          textureKind: 'galvanizedSteel',
          finishName: 'Zinc-Plated Structural Clamps & Hex Fasteners',
        },
      };

    case 'stainless':
      return {
        label: 'Brushed 304 Stainless Steel',
        structural: {
          colorHex: '#c6cdd6',
          metalness: 0.88,
          roughness: 0.28,
          clearcoat: 0.14,
          clearcoatRoughness: 0.26,
          textureKind: 'brushedMetal',
          finishName: 'Brushed 304 Stainless Steel (No. 4 Sanitary Finish)',
        },
        bracing: {
          colorHex: '#b4bcc6',
          metalness: 0.86,
          roughness: 0.32,
          clearcoat: 0.1,
          clearcoatRoughness: 0.3,
          textureKind: 'brushedMetal',
          finishName: 'Brushed 304 Stainless Flat-Bar Bracing',
        },
        guardrail: {
          colorHex: '#cfd6df',
          metalness: 0.9,
          roughness: 0.24,
          clearcoat: 0.18,
          clearcoatRoughness: 0.22,
          textureKind: 'brushedMetal',
          finishName: 'Sanitary Satin-Polished 304 Stainless Tubing',
        },
        toeBoard: {
          colorHex: '#c0c8d2',
          metalness: 0.88,
          roughness: 0.28,
          clearcoat: 0.12,
          clearcoatRoughness: 0.26,
          textureKind: 'brushedMetal',
          finishName: '304 Stainless Flat-Bar Kick Plate',
        },
        barGrating: {
          colorHex: '#aeb6c1',
          metalness: 0.86,
          roughness: 0.32,
          clearcoat: 0.12,
          clearcoatRoughness: 0.28,
          textureKind: 'brushedMetal',
          finishName: 'Electro-Polished 304 Stainless Bar Grating (NAAMM 19-W-4)',
        },
        diamondPlate: {
          colorHex: '#c4cbd4',
          metalness: 0.86,
          roughness: 0.3,
          clearcoat: 0.14,
          clearcoatRoughness: 0.26,
          textureKind: 'galvanizedDiamondPlate',
          finishName: '304 Stainless Rolled Diamond Tread Plate',
        },
        stairNosing: {
          colorHex: '#d7dde6',
          metalness: 0.9,
          roughness: 0.22,
          clearcoat: 0.2,
          clearcoatRoughness: 0.2,
          textureKind: 'brushedMetal',
          finishName: 'Machined 304 Stainless Grooved Stair Nosing',
        },
        hardware: {
          colorHex: '#9aa3ae',
          metalness: 0.9,
          roughness: 0.28,
          clearcoat: 0.12,
          clearcoatRoughness: 0.26,
          textureKind: 'brushedMetal',
          finishName: 'A4-80 Stainless Clamps & Structural Hex Bolts',
        },
      };

    case 'painted':
    default:
      return {
        label: 'Painted Steel (Slate + Safety Yellow)',
        structural: {
          colorHex: '#4c5661',
          metalness: 0.08,
          roughness: 0.32,
          clearcoat: 0.46,
          clearcoatRoughness: 0.2,
          textureKind: 'paintedIndustrialSteel',
          finishName: 'Machinery Slate Gray Two-Part Industrial Epoxy',
        },
        bracing: {
          colorHex: '#3f4852',
          metalness: 0.08,
          roughness: 0.34,
          clearcoat: 0.4,
          clearcoatRoughness: 0.22,
          textureKind: 'paintedIndustrialSteel',
          finishName: 'Deep Structural Slate Gray Industrial Epoxy',
        },
        guardrail: {
          colorHex: '#e6a814',
          metalness: 0.05,
          roughness: 0.26,
          clearcoat: 0.58,
          clearcoatRoughness: 0.16,
          textureKind: 'paintedIndustrialSteel',
          finishName: 'OSHA Safety Yellow Polyurethane Epoxy Coating',
        },
        toeBoard: {
          colorHex: '#e6a814',
          metalness: 0.05,
          roughness: 0.26,
          clearcoat: 0.58,
          clearcoatRoughness: 0.16,
          textureKind: 'paintedIndustrialSteel',
          finishName: 'OSHA Safety Yellow Epoxy Kick-Plate',
        },
        barGrating: {
          colorHex: '#2c323a',
          metalness: 0.14,
          roughness: 0.36,
          clearcoat: 0.32,
          clearcoatRoughness: 0.26,
          textureKind: 'paintedIndustrialSteel',
          finishName: 'Satin Black Epoxy-Coated Welded Bar Grating (NAAMM 19-W-4)',
        },
        diamondPlate: {
          colorHex: '#454e59',
          metalness: 0.12,
          roughness: 0.34,
          clearcoat: 0.38,
          clearcoatRoughness: 0.22,
          textureKind: 'galvanizedDiamondPlate',
          finishName: 'Slate Gray Epoxy-Coated Diamond Floor Plate (ASTM A786)',
        },
        stairNosing: {
          colorHex: '#e6a814',
          metalness: 0.05,
          roughness: 0.28,
          clearcoat: 0.52,
          clearcoatRoughness: 0.18,
          textureKind: 'paintedIndustrialSteel',
          finishName: 'OSHA Safety Yellow Epoxy Abrasive Stair Nosing',
        },
        hardware: {
          colorHex: '#343a42',
          metalness: 0.62,
          roughness: 0.32,
          clearcoat: 0.18,
          clearcoatRoughness: 0.28,
          textureKind: 'paintedIndustrialSteel',
          finishName: 'Black-Oxide Structural Clamps & Grade-8 Hex Hardware',
        },
      };
  }
}

export function circleProfile2D(radiusMm: number, segments = 16): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([
      Number((Math.cos(a) * radiusMm).toFixed(3)),
      Number((Math.sin(a) * radiusMm).toFixed(3)),
    ]);
  }
  return pts;
}

/**
 * 1. Welded SHS Structural Support Column + 4-Hole 166×166 mm Anchor Baseplate + Top Flange.
 *    Local origin sits on the floor at Y = 0.0 mm.
 */
export function buildAnchoredShsColumnCsg(
  deckFrameBotYMm: number,
  legWidthMm = 76
): CsgNodeSpec {
  const baseW = 166;
  const baseT = 12;
  const holeOff = 58;
  const colH = deckFrameBotYMm - baseT - 0.2;

  const weldedColumn: CsgNodeSpec = {
    op: 'union',
    children: [
      { op: 'box', width: baseW, height: baseT, depth: baseW, translateMm: [0, baseT / 2, 0] },
      {
        op: 'hull',
        children: [
          { op: 'box', width: legWidthMm + 14, height: 2, depth: legWidthMm + 14, translateMm: [0, baseT + 1, 0] },
          { op: 'box', width: legWidthMm, height: 2, depth: legWidthMm, translateMm: [0, baseT + 9, 0] },
        ],
      },
      { op: 'box', width: legWidthMm, height: colH, depth: legWidthMm, translateMm: [0, baseT + colH / 2, 0] },
      { op: 'box', width: 110, height: 10, depth: 110, translateMm: [0, deckFrameBotYMm - 5.2, 0] },
    ],
  };

  return {
    op: 'subtract',
    children: [
      weldedColumn,
      { op: 'cylinder', radius: 7.2, height: 24, radialSegments: 16, translateMm: [holeOff, 6, holeOff] },
      { op: 'cylinder', radius: 7.2, height: 24, radialSegments: 16, translateMm: [-holeOff, 6, holeOff] },
      { op: 'cylinder', radius: 7.2, height: 24, radialSegments: 16, translateMm: [holeOff, 6, -holeOff] },
      { op: 'cylinder', radius: 7.2, height: 24, radialSegments: 16, translateMm: [-holeOff, 6, -holeOff] },
    ],
  };
}

/**
 * 2. Transverse Bolted Diagonal X-Brace Assembly (Y-Z plane inside each bent).
 *    Automatically scales gussets, straps, and slope to any platform height & width with 0.5 mm leg clearance.
 */
export function buildDiagonalXBraceCsg(
  legZMm: number,
  legWidthMm: number,
  deckFrameBotYMm: number,
  deckHeightMm: number
): CsgNodeSpec {
  const zInner = legZMm - legWidthMm / 2 - 0.5;
  const yLow = Math.max(142, Math.round(deckHeightMm * 0.205));
  const yHigh = deckFrameBotYMm - 60;
  const yMid = (yLow + yHigh) / 2;
  const dz = zInner * 2;
  const dy = yHigh - yLow;
  const diagLen = Math.hypot(dz, dy) - 10;
  const angleDeg = (Math.atan2(dy, dz) * 180) / Math.PI;

  return {
    op: 'union',
    children: [
      {
        op: 'box',
        width: 11.5,
        height: 52,
        depth: diagLen,
        rotateDeg: [-angleDeg, 0, 0],
        translateMm: [-6.5, yMid, 0],
      },
      {
        op: 'box',
        width: 11.5,
        height: 52,
        depth: diagLen,
        rotateDeg: [angleDeg, 0, 0],
        translateMm: [6.5, yMid, 0],
      },
      { op: 'box', width: 24, height: 64, depth: 22, translateMm: [0, yLow + 14, -zInner + 11] },
      { op: 'box', width: 24, height: 64, depth: 22, translateMm: [0, yHigh - 14, zInner - 11] },
      { op: 'box', width: 24, height: 64, depth: 22, translateMm: [0, yLow + 14, zInner - 11] },
      { op: 'box', width: 24, height: 64, depth: 22, translateMm: [0, yHigh - 14, -zInner + 11] },
      {
        op: 'cylinder',
        radius: 10.5,
        height: 36,
        radialSegments: 6,
        rotateDeg: [0, 0, 90],
        translateMm: [0, yMid, 0],
      },
      { op: 'cylinder', radius: 8.5, height: 32, radialSegments: 6, rotateDeg: [0, 0, 90], translateMm: [0, yLow + 14, -zInner + 14] },
      { op: 'cylinder', radius: 8.5, height: 32, radialSegments: 6, rotateDeg: [0, 0, 90], translateMm: [0, yHigh - 14, zInner - 14] },
      { op: 'cylinder', radius: 8.5, height: 32, radialSegments: 6, rotateDeg: [0, 0, 90], translateMm: [0, yLow + 14, zInner - 14] },
      { op: 'cylinder', radius: 8.5, height: 32, radialSegments: 6, rotateDeg: [0, 0, 90], translateMm: [0, yHigh - 14, -zInner + 14] },
    ],
  };
}

/**
 * 3. Hollow Folded C-Channel Structural Deck Perimeter Frame + 3 Internal Cross-Joists.
 */
export function buildHollowCChannelSubframeCsg(
  lengthXMm: number,
  deckWidthMm: number,
  frameBotYMm: number,
  frameTopYMm: number
): CsgNodeSpec {
  const frameH = frameTopYMm - frameBotYMm - 0.2;
  const yCenter = frameBotYMm + frameH / 2;
  const wallT = 12;
  const flangeW = 36;

  const outerBox: CsgNodeSpec = {
    op: 'box',
    width: lengthXMm,
    height: frameH,
    depth: deckWidthMm,
    translateMm: [0, yCenter, 0],
  };

  const innerCut: CsgNodeSpec = {
    op: 'box',
    width: lengthXMm - wallT * 2,
    height: frameH - 12,
    depth: deckWidthMm - wallT * 2,
    translateMm: [0, yCenter - 6, 0],
  };
  const bottomOpening: CsgNodeSpec = {
    op: 'box',
    width: lengthXMm - flangeW * 2,
    height: 22,
    depth: deckWidthMm - flangeW * 2,
    translateMm: [0, frameBotYMm + 6, 0],
  };

  const hollowFrame: CsgNodeSpec = {
    op: 'subtract',
    children: [outerBox, innerCut, bottomOpening],
  };

  return {
    op: 'union',
    children: [
      hollowFrame,
      { op: 'box', width: 22, height: frameH - 6, depth: deckWidthMm - wallT * 2, translateMm: [-lengthXMm * 0.25, yCenter + 2, 0] },
      { op: 'box', width: 22, height: frameH - 6, depth: deckWidthMm - wallT * 2, translateMm: [0, yCenter + 2, 0] },
      { op: 'box', width: 22, height: frameH - 6, depth: deckWidthMm - wallT * 2, translateMm: [lengthXMm * 0.25, yCenter + 2, 0] },
    ],
  };
}

/**
 * 4a. Real 3D Open Welded Steel Bar Grating Deck Panel (NAAMM 19-W-4).
 *     Fully see-through rectangular mesh with perimeter banding, parallel vertical bearing bars,
 *     flush-welded transverse cross-bars, and welded hold-down saddle clips.
 */
export function buildNaammBarGratingDeckCsg(
  lengthXMm: number,
  deckWidthMm: number,
  frameTopYMm: number,
  barHeightMm: number,
  holdDownLocalXs: number[],
  holdDownZMm: number
): CsgNodeSpec {
  const halfZ = deckWidthMm / 2;
  const deckTopY = frameTopYMm + barHeightMm;
  const yCenter = frameTopYMm + barHeightMm / 2;
  const bandT = 6;
  const bearingBarW = 4.5;
  const crossBarW = 5;
  const crossBarH = 6;

  const children: CsgNodeSpec[] = [
    { op: 'box', width: lengthXMm, height: barHeightMm, depth: bandT, translateMm: [0, yCenter, halfZ - bandT / 2] },
    { op: 'box', width: lengthXMm, height: barHeightMm, depth: bandT, translateMm: [0, yCenter, -halfZ + bandT / 2] },
    { op: 'box', width: bandT, height: barHeightMm, depth: deckWidthMm, translateMm: [-lengthXMm / 2 + bandT / 2, yCenter, 0] },
    { op: 'box', width: bandT, height: barHeightMm, depth: deckWidthMm, translateMm: [lengthXMm / 2 - bandT / 2, yCenter, 0] },
  ];

  // Dynamic bearing bar pitch (~34 mm centers)
  const innerSpanX = lengthXMm - bandT * 2;
  const bearingCount = Math.max(24, Math.round(innerSpanX / 34.5));
  const stepX = innerSpanX / (bearingCount + 1);
  for (let i = 1; i <= bearingCount; i++) {
    const bx = -innerSpanX / 2 + i * stepX;
    children.push({
      op: 'box',
      width: bearingBarW,
      height: barHeightMm,
      depth: deckWidthMm - bandT * 1.5,
      translateMm: [Number(bx.toFixed(2)), yCenter, 0],
    });
  }

  // Dynamic transverse cross-bars (~90 mm centers across deckWidthMm)
  const usableZ = deckWidthMm - 110;
  const crossCount = Math.max(7, Math.round(usableZ / 92) | 1); // odd count so center Z=0 has a cross-bar
  const stepZ = usableZ / (crossCount - 1);
  for (let i = 0; i < crossCount; i++) {
    const cz = -usableZ / 2 + i * stepZ;
    children.push({
      op: 'box',
      width: lengthXMm - bandT * 1.5,
      height: crossBarH,
      depth: crossBarW,
      translateMm: [0, deckTopY - crossBarH / 2, Number(cz.toFixed(2))],
    });
  }

  for (const hx of holdDownLocalXs) {
    children.push({
      op: 'box',
      width: 36,
      height: barHeightMm,
      depth: 38,
      translateMm: [hx, yCenter, holdDownZMm],
    });
  }

  return { op: 'union', children };
}

/**
 * 4b. Heavy ASTM A786 Solid Diamond-Plate Deck Panel with Welded Edge Return Trim.
 */
export function buildDiamondPlateDeckCsg(
  lengthXMm: number,
  deckWidthMm: number,
  frameTopYMm: number,
  plateThicknessMm: number
): CsgNodeSpec {
  const yCenter = frameTopYMm + plateThicknessMm / 2;
  return {
    op: 'box',
    width: lengthXMm,
    height: plateThicknessMm,
    depth: deckWidthMm,
    translateMm: [0, yCenter, 0],
  };
}

/**
 * 5. Left-End Mandrel-Bent Tubular Guardrail Frame (Ø40 mm outer inverted-U pipe, R=90 mm bends,
 *    dual Ø35 mm mid-rails, OSHA 1910.29(b)(1) 1067 mm top-rail height, bolted deck shoes + hex nuts).
 */
export function buildEndGuardrailFrameCsg(
  deckWidthMm: number,
  deckTopYMm: number,
  enclosedFront: boolean
): CsgNodeSpec {
  const halfZ = deckWidthMm / 2;
  const zFront = enclosedFront ? halfZ - 58 : halfZ - 42;
  const zBack = -(halfZ - 58);
  const yBase = deckTopYMm + 0.2;
  const yTop = deckTopYMm + 1047; // Ø40 pipe top surface = 1067 mm (42.0 in, OSHA 1910.29(b)(1))
  const yMid1 = deckTopYMm + 395;
  const yMid2 = deckTopYMm + 720;
  const outerR = 20;
  const midR = 17.5;

  return {
    op: 'union',
    children: [
      {
        op: 'sweep',
        profilePoints: circleProfile2D(outerR, 16),
        pathPoints: [
          [0, yBase + 8, zFront],
          [0, yTop, zFront],
          [0, yTop, zBack],
          [0, yBase + 8, zBack],
        ],
        pathMode: 'polyline',
        cornerMode: 'bend',
        bendRadiusMm: 90,
        bendSegments: 10,
      },
      {
        op: 'cylinder',
        radius: midR,
        height: zFront - zBack,
        radialSegments: 16,
        rotateDeg: [90, 0, 0],
        translateMm: [0, yMid1, (zFront + zBack) / 2],
      },
      {
        op: 'cylinder',
        radius: midR,
        height: zFront - zBack,
        radialSegments: 16,
        rotateDeg: [90, 0, 0],
        translateMm: [0, yMid2, (zFront + zBack) / 2],
      },
      // 50×64 mm shoes keep ≥ 1 mm clearance from adjacent side-panel shoes and ≥ 11 mm from left toe-board
      { op: 'box', width: 50, height: 10, depth: 64, translateMm: [0, yBase + 5, zFront] },
      { op: 'box', width: 50, height: 10, depth: 64, translateMm: [0, yBase + 5, zBack] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [17, yBase + 13.5, zFront + 21] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [17, yBase + 13.5, zFront - 21] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [17, yBase + 13.5, zBack + 21] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [17, yBase + 13.5, zBack - 21] },
    ],
  };
}

/**
 * 6. Modular Longitudinal Mandrel-Bent Tubular Guardrail Panel (for back -Z or enclosed front +Z).
 *    End-post base shoes are offset 10 mm inward so adjacent bay & corner shoes maintain clean clearance.
 */
export function buildSideGuardrailPanelCsg(
  xMinMm: number,
  xMaxMm: number,
  deckTopYMm: number,
  nutZSign: 1 | -1 = 1
): CsgNodeSpec {
  const xMid = (xMinMm + xMaxMm) / 2;
  const span = xMaxMm - xMinMm;
  const yBase = deckTopYMm + 0.2;
  const yTop = deckTopYMm + 1047; // Ø40 pipe top surface = 1067 mm (42.0 in, OSHA 1910.29(b)(1))
  const yMid1 = deckTopYMm + 395;
  const yMid2 = deckTopYMm + 720;
  const outerR = 20;
  const midR = 17.5;
  const nutZ = 20 * nutZSign;

  return {
    op: 'union',
    children: [
      {
        op: 'sweep',
        profilePoints: circleProfile2D(outerR, 16),
        pathPoints: [
          [xMinMm, yBase + 8, 0],
          [xMinMm, yTop, 0],
          [xMaxMm, yTop, 0],
          [xMaxMm, yBase + 8, 0],
        ],
        pathMode: 'polyline',
        cornerMode: 'bend',
        bendRadiusMm: 90,
        bendSegments: 10,
      },
      {
        op: 'cylinder',
        radius: outerR,
        height: yTop - yBase - 8,
        radialSegments: 16,
        translateMm: [xMid, (yTop + yBase + 8) / 2, 0],
      },
      {
        op: 'cylinder',
        radius: midR,
        height: span,
        radialSegments: 16,
        rotateDeg: [0, 0, 90],
        translateMm: [xMid, yMid1, 0],
      },
      {
        op: 'cylinder',
        radius: midR,
        height: span,
        radialSegments: 16,
        rotateDeg: [0, 0, 90],
        translateMm: [xMid, yMid2, 0],
      },
      // End shoes offset 10 mm inward (60 mm wide -> ±20 outer / +40 inner) for zero splice/corner clash
      { op: 'box', width: 60, height: 10, depth: 64, translateMm: [xMinMm + 10, yBase + 5, 0] },
      { op: 'box', width: 64, height: 10, depth: 64, translateMm: [xMid, yBase + 5, 0] },
      { op: 'box', width: 60, height: 10, depth: 64, translateMm: [xMaxMm - 10, yBase + 5, 0] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [xMinMm + 24, yBase + 13.5, nutZ] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [xMinMm + 24, yBase + 13.5, -nutZ] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [xMid - 18, yBase + 13.5, nutZ] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [xMid + 18, yBase + 13.5, nutZ] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [xMaxMm - 24, yBase + 13.5, nutZ] },
      { op: 'cylinder', radius: 5.5, height: 7, radialSegments: 6, translateMm: [xMaxMm - 24, yBase + 13.5, -nutZ] },
    ],
  };
}

/**
 * 7. Heavy Double-Bolt Pipe Coupler Clamp with exact Ø41 mm CSG-subtracted saddles (0.5 mm clearance).
 */
export function buildPipeCouplerClampCsg(
  pipeAOffset: [number, number],
  pipeBOffset: [number, number],
  clampW: number,
  clampH: number,
  clampD: number
): CsgNodeSpec {
  const clampBody: CsgNodeSpec = {
    op: 'union',
    children: [
      { op: 'box', width: clampW, height: clampH, depth: clampD },
      { op: 'cylinder', radius: 7.5, height: clampD + 10, radialSegments: 6, rotateDeg: [90, 0, 0], translateMm: [0, 17, 0] },
      { op: 'cylinder', radius: 7.5, height: clampD + 10, radialSegments: 6, rotateDeg: [90, 0, 0], translateMm: [0, -17, 0] },
    ],
  };

  return {
    op: 'subtract',
    children: [
      clampBody,
      { op: 'cylinder', radius: 20.5, height: clampH + 20, radialSegments: 18, translateMm: [pipeAOffset[0], 0, pipeAOffset[1]] },
      { op: 'cylinder', radius: 20.5, height: clampH + 20, radialSegments: 18, translateMm: [pipeBOffset[0], 0, pipeBOffset[1]] },
    ],
  };
}

export interface StairGeometryMetrics {
  deckTopYMm: number;
  stepCount: number;
  stepRiseMm: number;
  stepGoingMm: number;
  slope: number;
  xStart: number;
  xKnee: number;
  xEnd: number;
  botStartY: number;
  floorBackX: number;
  topYAt: (x: number) => number;
}

export function computeStairMetrics(
  deckHeightMm: 720 | 900 | 1080,
  rightDeckEdgeXMm = 900
): StairGeometryMetrics {
  const stepRiseMm = 180;
  const stepGoingMm = 185;
  const slope = stepRiseMm / stepGoingMm;
  const stepCount = Math.round(deckHeightMm / stepRiseMm) - 1; // 3, 4, or 5 treads
  const xStart = rightDeckEdgeXMm + 2;
  const xKnee = xStart + 28;
  // Exact invariant: keeps lowest tread clearance & 136.2 mm bottom stringer nose constant across all heights
  const xEnd = xStart + 73 + stepCount * stepGoingMm;
  const botStartY = deckHeightMm - 275;
  const floorBackX = xStart + botStartY / slope;
  const topYAt = (x: number): number =>
    x <= xKnee ? deckHeightMm : deckHeightMm - slope * (x - xKnee);

  return {
    deckTopYMm: deckHeightMm,
    stepCount,
    stepRiseMm,
    stepGoingMm,
    slope,
    xStart,
    xKnee,
    xEnd,
    botStartY,
    floorBackX,
    topYAt,
  };
}

/**
 * 8. Folded-Steel C-Channel Stair Stringer with inward flanges & slotted 2-hole floor anchor foot.
 */
export function buildFoldedStairStringerCsg(
  zSign: 1 | -1,
  deckWidthMm: number,
  m: StairGeometryMetrics
): CsgNodeSpec {
  const halfZ = deckWidthMm / 2;
  const webT = 10;
  const flangeDepth = 36;
  const webZCenter = zSign * (halfZ - webT / 2);
  const flangeZCenter = zSign * (halfZ - flangeDepth / 2);
  const footDepth = 68;
  const footZCenter = zSign * (halfZ - footDepth / 2);

  const yTopEnd = m.topYAt(m.xEnd);

  const webPoly: [number, number][] = [
    [m.xStart, m.botStartY],
    [m.xStart, m.deckTopYMm],
    [m.xKnee, m.deckTopYMm],
    [m.xEnd, Number(yTopEnd.toFixed(2))],
    [m.xEnd, 0],
    [Number(m.floorBackX.toFixed(2)), 0],
  ];

  const topFlangePoly: [number, number][] = [
    [m.xStart, m.deckTopYMm - 10],
    [m.xStart, m.deckTopYMm],
    [m.xKnee, m.deckTopYMm],
    [m.xEnd, Number(yTopEnd.toFixed(2))],
    [m.xEnd, Number((yTopEnd - 10).toFixed(2))],
    [m.xKnee, m.deckTopYMm - 10],
  ];

  const botFlangePoly: [number, number][] = [
    [m.xStart, m.botStartY],
    [m.xStart, m.botStartY + 10],
    [Number((m.floorBackX + 10).toFixed(2)), 10],
    [Number(m.floorBackX.toFixed(2)), 0],
  ];

  const frontLip: CsgNodeSpec = {
    op: 'box',
    width: 10,
    height: yTopEnd,
    depth: flangeDepth,
    translateMm: [m.xEnd - 5, yTopEnd / 2, flangeZCenter],
  };

  const footLenX = m.xEnd - m.floorBackX;
  const footCenterX = (m.xEnd + m.floorBackX) / 2;
  const floorFoot: CsgNodeSpec = {
    op: 'box',
    width: footLenX,
    height: 10,
    depth: footDepth,
    translateMm: [footCenterX, 5, footZCenter],
  };

  const topMountFlange: CsgNodeSpec = {
    op: 'box',
    width: 10,
    height: m.deckTopYMm - m.botStartY,
    depth: flangeDepth,
    translateMm: [m.xStart + 5, (m.deckTopYMm + m.botStartY) / 2, flangeZCenter],
  };

  const solidStringer: CsgNodeSpec = {
    op: 'union',
    children: [
      { op: 'polygonExtrude', depth: webT, polygonPoints: webPoly, translateMm: [0, 0, webZCenter] },
      { op: 'polygonExtrude', depth: flangeDepth, polygonPoints: topFlangePoly, translateMm: [0, 0, flangeZCenter] },
      { op: 'polygonExtrude', depth: flangeDepth, polygonPoints: botFlangePoly, translateMm: [0, 0, flangeZCenter] },
      frontLip,
      floorFoot,
      topMountFlange,
    ],
  };

  const slotZ = zSign * (halfZ - footDepth + 20);
  return {
    op: 'subtract',
    children: [
      solidStringer,
      { op: 'box', width: 28, height: 24, depth: 14, translateMm: [footCenterX - 38, 5, slotZ] },
      { op: 'box', width: 28, height: 24, depth: 14, translateMm: [footCenterX + 38, 5, slotZ] },
    ],
  };
}

/**
 * 9a. Real 3D Open Welded Bar Grating Stair Tread (local X = 0 .. 151.5 mm, leaves 0.5 mm seam for front nosing).
 */
export function buildBarGratingStairTreadCsg(deckWidthMm: number): CsgNodeSpec {
  const gratingDepthX = 151.5;
  const widthZ = deckWidthMm - 22; // 1 mm clearance inside each 10 mm stringer web
  const halfZ = widthZ / 2;
  const barH = 24;
  const plateT = 6.5;

  const children: CsgNodeSpec[] = [
    { op: 'box', width: gratingDepthX, height: 40, depth: plateT, translateMm: [gratingDepthX / 2, -20, halfZ - plateT / 2] },
    { op: 'box', width: gratingDepthX, height: 40, depth: plateT, translateMm: [gratingDepthX / 2, -20, -halfZ + plateT / 2] },
    { op: 'box', width: 5, height: barH, depth: widthZ, translateMm: [2.5, -barH / 2, 0] },
    { op: 'box', width: 5, height: barH, depth: widthZ, translateMm: [gratingDepthX - 2.5, -barH / 2, 0] },
    { op: 'box', width: 4.5, height: barH, depth: widthZ - plateT, translateMm: [31.5, -barH / 2, 0] },
    { op: 'box', width: 4.5, height: barH, depth: widthZ - plateT, translateMm: [60.5, -barH / 2, 0] },
    { op: 'box', width: 4.5, height: barH, depth: widthZ - plateT, translateMm: [89.5, -barH / 2, 0] },
    { op: 'box', width: 4.5, height: barH, depth: widthZ - plateT, translateMm: [118.5, -barH / 2, 0] },
  ];

  const usableZ = widthZ - 102;
  const crossCount = Math.max(7, Math.round(usableZ / 92) | 1);
  const stepZ = usableZ / (crossCount - 1);
  for (let i = 0; i < crossCount; i++) {
    const cz = -usableZ / 2 + i * stepZ;
    children.push({
      op: 'box',
      width: gratingDepthX - 4,
      height: 6,
      depth: 5,
      translateMm: [gratingDepthX / 2, -3, Number(cz.toFixed(2))],
    });
  }

  return { op: 'union', children };
}

/**
 * 9b. Extruded Abrasive Stair Tread Front Nosing Angle (local X = 152 .. 180 mm) with 3 real traction grooves.
 */
export function buildGroovedStairNosingCsg(deckWidthMm: number): CsgNodeSpec {
  const widthZ = deckWidthMm - 22;
  const x0 = 152;
  const x1 = 180;
  const nosingProfile: [number, number][] = [
    [x0, -8],
    [x0, 0],
    [x0 + 5, 0],
    [x0 + 6.5, -2],
    [x0 + 8, 0],
    [x0 + 12.5, 0],
    [x0 + 14, -2],
    [x0 + 15.5, 0],
    [x0 + 20, 0],
    [x0 + 21.5, -2],
    [x0 + 23, 0],
    [x1, 0],
    [x1, -36],
    [x1 - 8, -36],
    [x1 - 8, -8],
  ];

  return {
    op: 'polygonExtrude',
    depth: widthZ,
    polygonPoints: nosingProfile,
  };
}

/**
 * 9c. Folded ASTM A786 Diamond-Plate Stair Tread (local X = 0 .. 180 mm, full tread with front lip & carrier cheeks).
 */
export function buildDiamondPlateStairTreadCsg(deckWidthMm: number): CsgNodeSpec {
  const widthZ = deckWidthMm - 22;
  const halfZ = widthZ / 2;
  const plateT = 6.5;

  const treadProfile: [number, number][] = [
    [0, -28],
    [0, 0],
    [180, 0],
    [180, -36],
    [172, -36],
    [172, -9],
    [8, -9],
    [8, -28],
  ];

  return {
    op: 'union',
    children: [
      { op: 'polygonExtrude', depth: widthZ, polygonPoints: treadProfile },
      { op: 'box', width: 176, height: 38, depth: plateT, translateMm: [90, -19, halfZ - plateT / 2] },
      { op: 'box', width: 176, height: 38, depth: plateT, translateMm: [90, -19, -halfZ + plateT / 2] },
    ],
  };
}

export interface StairHandrailSpec {
  /** Outer stanchion & top-rail tube radius in mm (default 17.5 = Ø35 mm, fits 36 mm stringer flange). */
  outerRadiusMm?: number;
  /** Intermediate mid-rail tube radius in mm (default 15.0 = Ø30 mm, copes cleanly inside Ø35 posts). */
  midRadiusMm?: number;
  /** Top-rail centerline height above stringer top flange in mm (default 920 -> ~961 mm / 37.8 in above nosings). */
  railHeightAboveStringerMm?: number;
  /** Normalized heights (0..1) of intermediate rails between stringer top and top-rail centerline (default [0.5] per OSHA 1910.29(b)(2)). */
  midRailFractions?: number[];
  /** Mandrel bend radius at top & bottom corners in mm (default 55). */
  bendRadiusMm?: number;
}

/**
 * 10. Modular Mandrel-Bent Tubular Stair Handrail (OSHA 1910.29(f) / NAAMM AMP 521).
 *     - Continuous mandrel-bent Ø35 mm outer perimeter loop (Post 1 -> sloped top rail -> Post 3)
 *       with zero protruding spears or open pipe ends.
 *     - Intermediate rail(s) cleanly coped post-to-post from Post 1 to Post 3 through Post 2
 *       at exact OSHA-compliant mid-height (all clear openings < 19 in / 483 mm) with zero stubs.
 *     - Sloped welded baseplates offset along the stringer surface normal and Boolean-mitered post
 *       bottoms eliminate all stringer penetration and downhill floating gaps.
 */
export function buildModularStairHandrailCsg(
  m: StairGeometryMetrics,
  spec: StairHandrailSpec = {}
): CsgNodeSpec {
  const outerR = spec.outerRadiusMm ?? 17.5; // Ø35 mm fits inside 36 mm stringer top flange with 0.5 mm margin/side
  const midR = spec.midRadiusMm ?? 15.0; // Ø30 mm copes cleanly inside Ø35 posts with 2.5 mm/side weld margin
  const railHeightAboveStringer = spec.railHeightAboveStringerMm ?? 920; // ~961 mm (37.8 in) top surface above tread nosings
  const midRailFractions = spec.midRailFractions ?? [0.5]; // exact midway: 427.5 mm above, 445 mm below (< 483 mm OSHA max)
  const bendRadiusMm = spec.bendRadiusMm ?? 55;

  const xP1 = m.xStart + 52;
  const xP3 = m.xEnd - 33;
  const xP2 = Math.round((xP1 + xP3) / 2);

  // Pure linear slope functions so top rail and intermediate rails stay strictly parallel to the stringer
  const slopedTopY = (x: number): number =>
    m.deckTopYMm - m.slope * (x - m.xKnee) + railHeightAboveStringer;
  const slopedMidYAtFraction = (x: number, frac: number): number =>
    m.deckTopYMm - m.slope * (x - m.xKnee) + railHeightAboveStringer * frac;

  const alphaRad = Math.atan(m.slope);
  const slopeDeg = -Number(((alphaRad * 180) / Math.PI).toFixed(2));
  const nx = Math.sin(alphaRad);
  const ny = Math.cos(alphaRad);
  const plateT = 10;
  const plateClearance = 0.3;

  // Extend post bottoms below stringer centerline so sloped Boolean cut produces exact flush miter
  const postOvercut = outerR * m.slope + 12;
  const yP1Cut = m.topYAt(xP1) - postOvercut;
  const yP2Cut = m.topYAt(xP2) - postOvercut;
  const yP3Cut = m.topYAt(xP3) - postOvercut;

  const buildBasePlate = (xPos: number): CsgNodeSpec => ({
    op: 'box',
    width: 52,
    height: plateT,
    depth: 34,
    rotateDeg: [0, 0, slopeDeg],
    translateMm: [
      Number((xPos + nx * (plateT / 2 + plateClearance)).toFixed(2)),
      Number((m.topYAt(xPos) + ny * (plateT / 2 + plateClearance)).toFixed(2)),
      0,
    ],
  });

  // Sloped half-space cutter flush with stringer top surface (+0.3 mm clearance) to trim post bottoms cleanly
  const cutterLen = (m.xEnd - m.xStart) * 1.8;
  const cutterDepthY = 120;
  const xRef = (xP1 + xP3) / 2;
  const yRef = m.topYAt(xRef) + plateClearance;
  const stringerFlushCutter: CsgNodeSpec = {
    op: 'box',
    width: cutterLen,
    height: cutterDepthY,
    depth: 60,
    rotateDeg: [0, 0, slopeDeg],
    translateMm: [
      Number((xRef - nx * (cutterDepthY / 2)).toFixed(2)),
      Number((yRef - ny * (cutterDepthY / 2)).toFixed(2)),
      0,
    ],
  };

  const midRailNodes: CsgNodeSpec[] = midRailFractions.map((frac) => ({
    op: 'sweep',
    profilePoints: circleProfile2D(midR, 16),
    pathPoints: [
      [xP1, slopedMidYAtFraction(xP1, frac), 0],
      [xP3, slopedMidYAtFraction(xP3, frac), 0],
    ],
    pathMode: 'polyline',
  }));

  const handrailBody: CsgNodeSpec = {
    op: 'union',
    children: [
      // Continuous mandrel-bent outer frame: Post 1 -> upper bend -> sloped top rail -> lower bend -> Post 3
      {
        op: 'sweep',
        profilePoints: circleProfile2D(outerR, 16),
        pathPoints: [
          [xP1, yP1Cut, 0],
          [xP1, slopedTopY(xP1), 0],
          [xP3, slopedTopY(xP3), 0],
          [xP3, yP3Cut, 0],
        ],
        pathMode: 'polyline',
        cornerMode: 'bend',
        bendRadiusMm,
        bendSegments: 10,
      },
      // Center vertical stanchion (Post 2), coped cleanly into the underside of the sloped top rail
      {
        op: 'cylinder',
        radius: outerR,
        height: slopedTopY(xP2) - yP2Cut,
        radialSegments: 16,
        translateMm: [xP2, (slopedTopY(xP2) + yP2Cut) / 2, 0],
      },
      // Post-to-post intermediate rail(s), strictly coped between Post 1 and Post 3
      ...midRailNodes,
      buildBasePlate(xP1),
      buildBasePlate(xP2),
      buildBasePlate(xP3),
    ],
  };

  return {
    op: 'subtract',
    children: [handrailBody, stringerFlushCutter],
  };
}

/**
 * 10b. Default 3-Post Mandrel-Bent Tubular Stair Handrail wrapper (backwards-compatible entry point).
 */
export function buildGooseneckStairHandrailCsg(m: StairGeometryMetrics): CsgNodeSpec {
  return buildModularStairHandrailCsg(m);
}

/**
 * 11. Upper Stair-to-Guardrail Tie-In Coupler Clamp joining Guardrail right upright (Ø40) to Stair Post 1 (Ø35).
 */
export function buildStairGuardrailTieClampCsg(
  backRailRightX: number,
  stairPost1X: number,
  backRailZ: number,
  stairHandrailZ: number
): CsgNodeSpec {
  const cx = (backRailRightX + stairPost1X) / 2;
  const cz = (backRailZ + stairHandrailZ) / 2;
  const dx = stairPost1X - backRailRightX;
  const dz = stairHandrailZ - backRailZ;
  const yawDeg = Number(((-Math.atan2(dz, dx) * 180) / Math.PI).toFixed(2));
  const barLen = Math.hypot(dx, dz) + 42;

  const bar: CsgNodeSpec = {
    op: 'union',
    children: [
      { op: 'box', width: barLen, height: 64, depth: 56, rotateDeg: [0, yawDeg, 0] },
      { op: 'cylinder', radius: 7.5, height: 68, radialSegments: 6, rotateDeg: [90, yawDeg, 0], translateMm: [0, 15, 0] },
      { op: 'cylinder', radius: 7.5, height: 68, radialSegments: 6, rotateDeg: [90, yawDeg, 0], translateMm: [0, -15, 0] },
    ],
  };

  return {
    op: 'subtract',
    children: [
      bar,
      { op: 'cylinder', radius: 20.5, height: 90, radialSegments: 18, translateMm: [backRailRightX - cx, 0, backRailZ - cz] },
      { op: 'cylinder', radius: 18.0, height: 90, radialSegments: 18, translateMm: [stairPost1X - cx, 0, stairHandrailZ - cz] },
    ],
  };
}
