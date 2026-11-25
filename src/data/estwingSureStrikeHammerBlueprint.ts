import {
  BlueprintPart,
  CsgNodeSpec,
  CurvedLoftStationSpec,
  MeshBlueprint,
  PartMaterialSpec,
  ProjectedDecalSpec,
} from '../types/blueprint';
import { evaluateCurvedLoftDatum } from '../engine/spineMath';

/**
 * Estwing Sure Strike 16 oz Curved Claw Hickory Handle Hammer (Model MRW16C)
 * 100% Watertight Manifold-3D CAD Reconstruction from reference photo.
 *
 * Calibrated Master Coordinate System (mm, Y-up, Y = 0 ground):
 * - Ground plane: Y = 0.0 mm (beveled American hickory butt seated flush on Y = 0)
 * - Total Height (Y): 0.0 mm .. 327.6 mm (~13.0 in overall length)
 * - Total Width  (X): -66.4 mm (striking face, left) .. +67.8 mm (curved claw tips, right) = 134.2 mm
 * - Total Depth  (Z): -15.0 mm .. +15.0 mm = 30.0 mm (Ø30 mm forged poll)
 *
 * Sub-Assemblies:
 * 1. Drop-Forged Polished & Brushed Carbon Steel Head:
 *    - Flat-forged parallel cheeks with 3D perimeter bevels & lower eye skirt
 *    - C1 filleted junction transitioning cheek to waisted hourglass neck & Ø30 mm cylindrical poll
 *    - Curved-spine tapered ripping claw with Boolean-subtracted V-shaped nail slot
 *    - True through-eye oval opening exposing the seated hickory tenon & crossed steel wedges
 * 2. Induction-Hardened Ground Steel Striking Face Cap (crowned & chamfered Ø30 mm)
 * 3. Genuine American Hickory Curved Handle (PCHIP C1 curvedLoft with beveled butt & through-tenon)
 * 4. Toasted End-Grain Hickory Eye Crown & Crossed Forged Steel Eye Wedges
 */

// ============================================================================
// PBR ENGINEERING MATERIALS
// ============================================================================

const MAT_FORGED_STEEL: PartMaterialSpec = {
  colorHex: '#d3d9e1',
  metalness: 0.93,
  roughness: 0.2,
  clearcoat: 0.16,
  clearcoatRoughness: 0.18,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Drop-Forged Polished & Brushed Carbon Steel',
};

const MAT_STRIKING_FACE: PartMaterialSpec = {
  colorHex: '#e5ebf1',
  metalness: 0.96,
  roughness: 0.11,
  clearcoat: 0.24,
  clearcoatRoughness: 0.12,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Induction-Hardened Ground Steel Striking Face',
};

const MAT_HICKORY_HANDLE: PartMaterialSpec = {
  colorHex: '#dfb98b',
  metalness: 0.02,
  roughness: 0.46,
  clearcoat: 0.2,
  clearcoatRoughness: 0.34,
  densityGPerCm3: 0.81,
  textureKind: 'woodGrain',
  finishName: 'Satin-Lacquered Genuine American Hickory',
};

const MAT_HICKORY_ENDGRAIN: PartMaterialSpec = {
  colorHex: '#b98956',
  metalness: 0.02,
  roughness: 0.62,
  clearcoat: 0.1,
  clearcoatRoughness: 0.48,
  densityGPerCm3: 0.81,
  textureKind: 'woodGrain',
  finishName: 'Compressed End-Grain Hickory Eye Tenon',
};

const MAT_EYE_WEDGES: PartMaterialSpec = {
  colorHex: '#4f5761',
  metalness: 0.86,
  roughness: 0.36,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Barbed Forged Steel Eye Wedges',
};

// ============================================================================
// MASTER SPINE STATIONS (SHARED BY HANDLE GEOMETRY & EXACT DECAL DATUMS)
// ============================================================================

/**
 * Ergonomic American hickory shaft stations from beveled butt (Y = 0) up to
 * the forged eye collar shoulder (Y = 278.5 mm).
 * With upHint = [0, 0, 1], Bishop binormal B = +Z (thickness halfB), normal N = -X (width halfA).
 */
const HICKORY_SHAFT_STATIONS: CurvedLoftStationSpec[] = [
  { posMm: [0.0, 0.0, 0], halfA: 17.6, halfB: 12.1, exponent: 2.25 },
  { posMm: [0.2, 26.0, 0], halfA: 17.1, halfB: 11.9, exponent: 2.2 },
  { posMm: [0.6, 72.0, 0], halfA: 15.7, halfB: 11.1, exponent: 2.2 },
  { posMm: [0.8, 132.0, 0], halfA: 14.1, halfB: 10.2, exponent: 2.25 },
  { posMm: [0.5, 194.0, 0], halfA: 12.9, halfB: 9.5, exponent: 2.3 },
  { posMm: [0.1, 246.0, 0], halfA: 13.7, halfB: 9.9, exponent: 2.4 },
  { posMm: [0.0, 278.5, 0], halfA: 14.3, halfB: 10.3, exponent: 2.5 },
];

// ============================================================================
// GEOMETRY BUILDERS (100% WATERTIGHT MANIFOLD-3D CSG)
// ============================================================================

/**
 * Drop-forged 16 oz Estwing Sure Strike steel curved claw head:
 * - Flat parallel cheeks with lower eye skirt (Y = 278.5 mm) and arched top crown (Y = 327 mm)
 * - C1 tangent-continuous filletedJunction bridging cheek to hourglass neck (-X)
 * - Revolved hourglass neck, flared bell shoulder, and Ø30 mm chamfered poll (-X)
 * - Curved-spine tapered ripping claw (+X) with Boolean-subtracted V-shaped nail slot
 * - True through-eye oval socket (Y = 276..332 mm) so the hickory tenon & wedges seat cleanly
 */
function buildForgedHeadCsg(): CsgNodeSpec {
  // 1. Flat-forged cheek & eye block with lower eye skirt and smooth arched crown
  const forgedCheek: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 26.8,
    bevelMm: 2.1,
    bevelSegments: 3,
    splineSubdivisions: 4,
    sharpCornerAngleDeg: 60,
    polygonPoints: [
      [-16.2, 278.5],
      [15.6, 278.5],
      [16.8, 290.0],
      [18.2, 302.5],
      [21.2, 315.5],
      [17.0, 326.8],
      [5.5, 327.6],
      [-7.5, 325.8],
      [-17.5, 321.2],
      [-21.4, 314.8],
      [-21.4, 298.8],
      [-19.2, 290.5],
    ],
  };

  // 2. C1 filleted junction transitioning flat-sided cheek into round hourglass neck (-X)
  const cheekToNeckJunction: CsgNodeSpec = {
    op: 'filletedJunction',
    junctionAxis: 'x',
    height: 14.5,
    sinkDepthMm: 6.5,
    baseHalfA: 13.6,
    baseHalfB: 12.6,
    baseExponent: 4.2,
    topHalfA: 9.7,
    topHalfB: 9.7,
    topExponent: 2.0,
    radialSegments: 36,
    rotateDeg: [0, 180, 0],
    translateMm: [-14.0, 306.5, 0],
  };

  // 3. Revolved hourglass neck, curved bell shoulder & Ø30 mm cylindrical poll along -X
  const neckAndPoll: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 48,
    lathePoints: [
      [0.0, 21.0],
      [10.8, 21.0],
      [9.9, 26.0],
      [9.5, 31.5],
      [9.8, 36.5],
      [11.2, 42.0],
      [13.4, 46.8],
      [14.7, 50.0],
      [15.0, 52.5],
      [15.0, 62.2],
      [13.4, 64.8],
      [0.0, 64.8],
    ],
    rotateDeg: [0, 0, 90],
    translateMm: [0, 306.5, 0],
  };

  // 4. Curved-spine tapered forged ripping claw sweeping smoothly to +X
  const curvedClaw: CsgNodeSpec = {
    op: 'curvedLoft',
    radialSegments: 32,
    splineSamples: 36,
    upHint: [0, 0, 1],
    curvedLoftStations: [
      { posMm: [-2.0, 316.5, 0], halfA: 10.6, halfB: 13.0, exponent: 4.2 },
      { posMm: [12.0, 321.6, 0], halfA: 8.8, halfB: 12.7, exponent: 4.4 },
      { posMm: [27.5, 321.2, 0], halfA: 7.4, halfB: 12.2, exponent: 4.6 },
      { posMm: [42.0, 316.0, 0], halfA: 5.9, halfB: 11.5, exponent: 4.8 },
      { posMm: [54.5, 306.8, 0], halfA: 4.2, halfB: 10.7, exponent: 5.0 },
      { posMm: [63.5, 297.0, 0], halfA: 2.4, halfB: 9.9, exponent: 5.2 },
      { posMm: [67.8, 289.8, 0], halfA: 1.15, halfB: 9.3, exponent: 5.4 },
    ],
  };

  // V-shaped nail-pulling claw through-slot cutter (narrow 1.4 mm root at X=+25 -> 10.8 mm mouth at X=+73)
  const clawThroughSlotCutter: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 58,
    polygonPoints: [
      [25.0, -0.7],
      [25.0, 0.7],
      [73.0, 5.4],
      [73.0, -5.4],
    ],
    rotateDeg: [-90, 0, 0],
    translateMm: [0, 306.0, 0],
  };

  // Subtle chamfered upper bevel on the claw nail slot via taperedSlotCutter
  const clawSlotBevelCutter: CsgNodeSpec = {
    op: 'taperedSlotCutter',
    slotLengthMm: 46.0,
    depth: 18.0,
    slotWidthStartMm: 2.2,
    slotWidthEndMm: 11.4,
    slotBottomWidthMm: 1.2,
    slotTopChamferMm: 1.0,
    rotateDeg: [0, 0, -24],
    translateMm: [48.5, 302.0, 0],
  };

  // True through-eye oval socket (Y = 276..332 mm) with 0.3 mm radial clearance around hickory tenon
  const throughEyeCutter: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 28,
    superellipseStations: [
      { posMm: 276.0, offsetU: 0.0, offsetV: 0, halfA: 12.85, halfB: 8.85, exponent: 2.5 },
      { posMm: 304.0, offsetU: 0.0, offsetV: 0, halfA: 12.85, halfB: 8.85, exponent: 2.5 },
      { posMm: 332.0, offsetU: 0.0, offsetV: 0, halfA: 12.85, halfB: 8.85, exponent: 2.5 },
    ],
  };

  // Subtractive ground cheek flats (SOT Rule GB-02: flats are machined off the smooth-blended blank,
  // producing natural sweeping runout transitions into the rounded crown, neck, and claw)
  const frontCheekFlatCutter: CsgNodeSpec = {
    op: 'box',
    width: 44.0,
    height: 52.0,
    depth: 12.0,
    translateMm: [0.0, 303.0, 19.4], // cuts Z > +13.4 mm across the cheek zone only
  };

  const backCheekFlatCutter: CsgNodeSpec = {
    op: 'box',
    width: 44.0,
    height: 52.0,
    depth: 12.0,
    translateMm: [0.0, 303.0, -19.4], // cuts Z < -13.4 mm across the cheek zone only
  };

  // SOT Rule GB-01 / GB-04: Blank -> SDF smoothUnion (real 4.5 mm drop-forged fillets) -> Subtractive machining
  return {
    op: 'subtract',
    children: [
      {
        op: 'smoothUnion',
        filletRadiusMm: 4.5,
        voxelSizeMm: 1.5,
        children: [forgedCheek, cheekToNeckJunction, neckAndPoll, curvedClaw],
      },
      frontCheekFlatCutter,
      backCheekFlatCutter,
      clawThroughSlotCutter,
      clawSlotBevelCutter,
      throughEyeCutter,
    ],
  };
}

/**
 * Bright mirror-ground crowned striking face cap on the -X end of the poll (X = -64.85..-66.4 mm).
 */
function buildStrikingFaceCsg(): CsgNodeSpec {
  return {
    op: 'revolve',
    radialSegments: 44,
    lathePoints: [
      [0.0, 64.85],
      [13.35, 64.85],
      [12.9, 65.75],
      [11.2, 66.2],
      [0.0, 66.4],
    ],
    rotateDeg: [0, 0, 90],
    translateMm: [0, 306.5, 0],
  };
}

/**
 * Genuine American hickory curved handle (Y = 0.0..278.5 mm) unioned with the oval
 * through-eye tenon (Y = 277.0..324.6 mm) that seats cleanly inside the forged head eye.
 */
function buildHickoryHandleCsg(): CsgNodeSpec {
  const shaft: CsgNodeSpec = {
    op: 'curvedLoft',
    radialSegments: 36,
    splineSamples: 40,
    upHint: [0, 0, 1],
    startCapStyle: 'beveled',
    endCapStyle: 'flat',
    capDepthMm: 2.0,
    curvedLoftStations: HICKORY_SHAFT_STATIONS,
  };

  // Oval through-eye tenon passing up into the forged steel head (0.3 mm radial clearance)
  const eyeTenon: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 28,
    superellipseStations: [
      { posMm: 277.0, offsetU: 0.0, offsetV: 0, halfA: 12.55, halfB: 8.55, exponent: 2.5 },
      { posMm: 302.0, offsetU: 0.0, offsetV: 0, halfA: 12.55, halfB: 8.55, exponent: 2.5 },
      { posMm: 324.6, offsetU: 0.0, offsetV: 0, halfA: 12.55, halfB: 8.55, exponent: 2.5 },
    ],
  };

  return {
    op: 'union',
    children: [shaft, eyeTenon],
  };
}

/**
 * End-grain hickory wood crown seated flush at the top of the oval eye (Y = 324.6..326.5 mm),
 * with crossed wedge kerfs subtracted so the forged steel wedges seat cleanly with zero clash.
 */
function buildEyeWoodCapCsg(): CsgNodeSpec {
  const woodCap: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 28,
    superellipseStations: [
      { posMm: 324.6, offsetU: 0.0, offsetV: 0, halfA: 12.5, halfB: 8.5, exponent: 2.5 },
      { posMm: 325.8, offsetU: 0.0, offsetV: 0, halfA: 12.3, halfB: 8.3, exponent: 2.5 },
      { posMm: 326.5, offsetU: 0.0, offsetV: 0, halfA: 11.4, halfB: 7.6, exponent: 2.4 },
    ],
  };

  const kerfA: CsgNodeSpec = {
    op: 'box',
    width: 14.4,
    height: 3.0,
    depth: 2.0,
    rotateDeg: [0, 32, 0],
    translateMm: [-3.2, 325.9, 0],
  };

  const kerfB: CsgNodeSpec = {
    op: 'box',
    width: 14.4,
    height: 3.0,
    depth: 2.0,
    rotateDeg: [0, -32, 0],
    translateMm: [3.2, 325.9, 0],
  };

  return {
    op: 'subtract',
    children: [woodCap, kerfA, kerfB],
  };
}

/**
 * Two diagonal barbed forged steel eye wedges driven into the top of the hickory tenon,
 * visibly locking the head to the handle at the crown of the eye.
 */
function buildEyeWedgesCsg(): CsgNodeSpec {
  const wedgeA: CsgNodeSpec = {
    op: 'box',
    width: 13.8,
    height: 2.0,
    depth: 1.65,
    rotateDeg: [0, 32, 0],
    translateMm: [-3.2, 325.85, 0],
  };

  const wedgeB: CsgNodeSpec = {
    op: 'box',
    width: 13.8,
    height: 2.0,
    depth: 1.65,
    rotateDeg: [0, -32, 0],
    translateMm: [3.2, 325.85, 0],
  };

  return {
    op: 'union',
    children: [wedgeA, wedgeB],
  };
}

// ============================================================================
// EXACT SURFACE-MOUNTED BRANDING DECALS (VIA evaluateCurvedLoftDatum)
// ============================================================================

function buildHandleBrandingDecals(): ProjectedDecalSpec[] {
  // Exact front (+Z -> angleRad = +pi/2) and back (-Z -> angleRad = -pi/2) datums on the lower hickory handle
  const estwingFront = evaluateCurvedLoftDatum(HICKORY_SHAFT_STATIONS, 0.31, Math.PI / 2, [0, 0, 1], 0.0);
  const sureStrikeFront = evaluateCurvedLoftDatum(HICKORY_SHAFT_STATIONS, 0.17, Math.PI / 2, [0, 0, 1], 0.0);
  const hickorySubFront = evaluateCurvedLoftDatum(HICKORY_SHAFT_STATIONS, 0.24, Math.PI / 2 - 0.36, [0, 0, 1], 0.0);

  const estwingBack = evaluateCurvedLoftDatum(HICKORY_SHAFT_STATIONS, 0.31, -Math.PI / 2, [0, 0, 1], 0.0);
  const sureStrikeBack = evaluateCurvedLoftDatum(HICKORY_SHAFT_STATIONS, 0.17, -Math.PI / 2, [0, 0, 1], 0.0);

  return [
    // Forged steel cheek stamp (front +Z and back -Z)
    {
      id: 'estwing-cheek-stamp-front',
      targetPartId: 'estwing-forged-head',
      positionMm: [-0.5, 305.5, 13.5],
      rotationDeg: [0, 0, 0],
      sizeMm: [25, 13, 8],
      text: 'Sure Strike',
      subtext: '16 OZ',
      colorHex: '#3b424c',
      opacity: 0.64,
      fontWeight: 'semibold',
    },
    {
      id: 'estwing-cheek-stamp-back',
      targetPartId: 'estwing-forged-head',
      positionMm: [-0.5, 305.5, -13.5],
      rotationDeg: [0, 180, 0],
      sizeMm: [25, 13, 8],
      text: 'Sure Strike',
      subtext: '16 OZ',
      colorHex: '#3b424c',
      opacity: 0.64,
      fontWeight: 'semibold',
    },
    // Lower hickory handle: ESTWING black-boxed logo (front +Z)
    {
      id: 'estwing-handle-logo-front',
      targetPartId: 'estwing-hickory-handle',
      positionMm: [estwingFront.positionMm[0] + 2.2, estwingFront.positionMm[1], estwingFront.positionMm[2]],
      rotationDeg: [0, 0, -90],
      sizeMm: [30, 8.2, 8],
      text: 'ESTWING',
      colorHex: '#f5efe4',
      bgHex: '#18191c',
      opacity: 0.94,
      fontWeight: 'bold',
    },
    // Lower hickory handle: Sure Strike® in signature Estwing red (front +Z)
    {
      id: 'estwing-handle-surestrike-front',
      targetPartId: 'estwing-hickory-handle',
      positionMm: [sureStrikeFront.positionMm[0] + 2.2, sureStrikeFront.positionMm[1], sureStrikeFront.positionMm[2]],
      rotationDeg: [0, 0, -90],
      sizeMm: [32, 7.6, 8],
      text: 'Sure Strike',
      colorHex: '#b91c1c',
      opacity: 0.92,
      fontWeight: 'bold',
    },
    // Lower hickory handle: Hickory Handle Hammer subtitle beside logo (front +Z)
    {
      id: 'estwing-handle-subtitle-front',
      targetPartId: 'estwing-hickory-handle',
      positionMm: [hickorySubFront.positionMm[0], hickorySubFront.positionMm[1], hickorySubFront.positionMm[2]],
      rotationDeg: [0, -14, -90],
      sizeMm: [42, 4.6, 8],
      text: 'Hickory Handle Hammer',
      colorHex: '#231f1b',
      opacity: 0.85,
      fontWeight: 'semibold',
    },
    // Back face (-Z) subtle matching ESTWING & Sure Strike branding
    {
      id: 'estwing-handle-logo-back',
      targetPartId: 'estwing-hickory-handle',
      positionMm: [estwingBack.positionMm[0] + 2.2, estwingBack.positionMm[1], estwingBack.positionMm[2]],
      rotationDeg: [0, 180, -90],
      sizeMm: [30, 8.2, 8],
      text: 'ESTWING',
      colorHex: '#f5efe4',
      bgHex: '#18191c',
      opacity: 0.94,
      fontWeight: 'bold',
    },
    {
      id: 'estwing-handle-surestrike-back',
      targetPartId: 'estwing-hickory-handle',
      positionMm: [sureStrikeBack.positionMm[0] + 2.2, sureStrikeBack.positionMm[1], sureStrikeBack.positionMm[2]],
      rotationDeg: [0, 180, -90],
      sizeMm: [32, 7.6, 8],
      text: 'Sure Strike',
      colorHex: '#b91c1c',
      opacity: 0.92,
      fontWeight: 'bold',
    },
  ];
}

// ============================================================================
// ASSEMBLY PARTS
// ============================================================================

const PARTS: BlueprintPart[] = [
  {
    id: 'estwing-hickory-handle',
    name: 'Genuine American Hickory Handle',
    group: 'Hickory Handle',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, -48, 0],
    toleranceMm: 0.15,
    notes: 'Contoured American hickory handle with beveled butt seated on Y=0 and full oval through-eye tenon.',
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    material: MAT_HICKORY_HANDLE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 42,
      csgRoot: buildHickoryHandleCsg(),
    },
  },
  {
    id: 'estwing-eye-wood-cap',
    name: 'End-Grain Hickory Eye Crown',
    group: 'Hickory Handle',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 90, 0],
    toleranceMm: 0.1,
    notes: 'Compressed end-grain hickory top crown flush inside the forged steel eye with wedge kerfs.',
    material: MAT_HICKORY_ENDGRAIN,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 40,
      csgRoot: buildEyeWoodCapCsg(),
    },
  },
  {
    id: 'estwing-eye-wedges',
    name: 'Crossed Forged Steel Eye Wedges',
    group: 'Forged Steel Head',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 118, 0],
    toleranceMm: 0.08,
    notes: 'Twin diagonal forged steel wedges locking the hickory tenon tightly into the hammer eye.',
    material: MAT_EYE_WEDGES,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 35,
      csgRoot: buildEyeWedgesCsg(),
    },
  },
  {
    id: 'estwing-forged-head',
    name: 'Drop-Forged 16 oz Curved Claw Head',
    group: 'Forged Steel Head',
    role: 'primary',
    manufacturingProcess: 'forged',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 58, 0],
    toleranceMm: 0.1,
    notes: 'Drop-forged brushed steel head: SDF smoothUnion (4.5 mm fillets) across cheek/neck/poll/claw + subtractive ground cheek flats, V-slot, and through-eye (SOT GB-01..GB-04).',
    material: MAT_FORGED_STEEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 38,
      csgRoot: buildForgedHeadCsg(),
    },
  },
  {
    id: 'estwing-striking-face',
    name: 'Ground Hardened Striking Face',
    group: 'Forged Steel Head',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-28, 58, 0],
    toleranceMm: 0.05,
    notes: 'Induction-hardened crowned and chamfered Ø30 mm polished steel striking face.',
    material: MAT_STRIKING_FACE,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 38,
      csgRoot: buildStrikingFaceCsg(),
    },
  },
];

// ============================================================================
// EXPORTED BLUEPRINT
// ============================================================================

export const ESTWING_SURE_STRIKE_HAMMER_BLUEPRINT: MeshBlueprint = {
  id: 'estwing-sure-strike-hammer-v1',
  name: 'Estwing Sure Strike 16 oz Hickory Claw Hammer',
  category: 'Hand Tools & Shop Equipment',
  summary:
    '100% watertight Manifold-3D CAD reconstruction of the Estwing Sure Strike 16 oz curved claw hammer featuring a drop-forged brushed steel head with C1 filleted hourglass neck, Ø30 mm ground striking face, V-slotted curved claw, true through-eye with exposed hickory end-grain and crossed steel wedges, genuine American hickory curved handle, and authentic ESTWING Sure Strike markings.',
  sourceImageUrl: '/assets/aistudio/estwing_sure_strike_hammer.png',
  isReferencePreset: true,
  envelopeMm: {
    width: 134.2,
    height: 327.6,
    depth: 30.0,
  },
  toleranceSpecMm: 0.1,
  symmetryPlane: 'Z',
  photoMatchCamera: {
    positionMm: [-42, 215, 455],
    targetMm: [-2, 168, 0],
    fov: 38,
  },
  decals: buildHandleBrandingDecals(),
  parts: PARTS,
  reconstructedAt: new Date().toISOString(),
};
