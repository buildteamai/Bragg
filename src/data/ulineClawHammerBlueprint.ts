import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * ULINE 16 oz Fiberglass-Handle Curved Claw Hammer
 * 100% Watertight Manifold-3D CAD Reconstruction from reference photo.
 *
 * Calibrated Master Coordinate System (mm, Y-up, Y = 0 ground):
 * - Ground plane: Y = 0.0 mm (flared rubber pommel heel seated flush on Y = 0)
 * - Total Height (Y): 0.0 mm .. 330.0 mm (~13.0 in overall hammer length)
 * - Total Width  (X): -68.0 mm (curved claw tips) .. +66.0 mm (striking face) = 134.0 mm
 * - Total Depth  (Z): -14.5 mm .. +14.5 mm = 29.0 mm (poll diameter / ergonomic grip thickness)
 *
 * Sub-Assemblies:
 * 1. Forged Brushed-Steel Head (cheeks, arched crown, V-slotted curved claw, hourglass neck,
 *    cylindrical poll & chamfered Ø29 mm striking face, plus etched '16oz' cheek decals)
 * 2. Black Epoxy Eye Collar & Faceted Charcoal Fiberglass Shaft
 * 3. Signature Red Elastomer Transition Collar Band
 * 4. Contoured Matte-Black TPE Ergonomic Rubber Grip with back-spine finger relief grooves,
 *    textured palm-side honeycomb overmold pad, red oval lanyard plug, and vertical red 'ULINE' branding
 */

// ============================================================================
// PBR ENGINEERING MATERIALS
// ============================================================================

const MAT_FORGED_STEEL: PartMaterialSpec = {
  colorHex: '#cfd6de',
  metalness: 0.92,
  roughness: 0.22,
  clearcoat: 0.14,
  clearcoatRoughness: 0.2,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Drop-Forged Polished & Brushed Carbon Steel',
};

const MAT_STRIKING_FACE: PartMaterialSpec = {
  colorHex: '#dce2e8',
  metalness: 0.95,
  roughness: 0.14,
  clearcoat: 0.2,
  clearcoatRoughness: 0.15,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Induction-Hardened Ground Steel Striking Face',
};

const MAT_FIBERGLASS_SHAFT: PartMaterialSpec = {
  colorHex: '#2c3036',
  metalness: 0.08,
  roughness: 0.56,
  clearcoat: 0.1,
  clearcoatRoughness: 0.45,
  densityGPerCm3: 1.85,
  textureKind: 'none',
  finishName: 'Pultruded Matte-Black Fiberglass Composite',
};

const MAT_EPOXY_COLLAR: PartMaterialSpec = {
  colorHex: '#181b20',
  metalness: 0.06,
  roughness: 0.42,
  clearcoat: 0.25,
  densityGPerCm3: 1.35,
  textureKind: 'none',
  finishName: 'Structural Two-Part Black Epoxy Eye Seal',
};

const MAT_ULINE_RED: PartMaterialSpec = {
  colorHex: '#e1251b',
  metalness: 0.04,
  roughness: 0.36,
  clearcoat: 0.22,
  clearcoatRoughness: 0.28,
  densityGPerCm3: 1.18,
  textureKind: 'none',
  finishName: 'ULINE Signal-Red Molded Elastomer Accent',
};

const MAT_RUBBER_GRIP: PartMaterialSpec = {
  colorHex: '#25282e',
  metalness: 0.03,
  roughness: 0.78,
  densityGPerCm3: 1.15,
  textureKind: 'none',
  finishName: 'Matte Charcoal Soft-Touch TPE Grip Overmold',
};

const MAT_TEXTURED_PALM_PAD: PartMaterialSpec = {
  colorHex: '#1e2126',
  metalness: 0.03,
  roughness: 0.88,
  densityGPerCm3: 1.15,
  textureKind: 'rubberOvermold',
  finishName: 'Honeycomb-Textured Anti-Slip TPE Palm Pad',
};

// ============================================================================
// GEOMETRY BUILDERS (100% WATERTIGHT MANIFOLD-3D CSG)
// ============================================================================

/**
 * Drop-forged 16 oz steel claw hammer head:
 * - Side silhouette of cheek + arched spine + curved claw intersected with contoured Z-taper envelope
 * - Smooth revolved hourglass neck, cylindrical bell/poll, and chamfered Ø29 mm striking face (+X)
 * - Real Boolean-subtracted V-shaped nail-pulling slot through the curved claw (-X)
 * - Real Boolean-subtracted oval eye pocket on the underside (Y = 284..294 mm) for shaft seating
 */
function buildForgedHammerHeadCsg(): CsgNodeSpec {
  // 1. Flat-forged cheek & eye body with spline-smoothed crown and crisp 3D forged perimeter bevels
  const forgedCheek: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 26.2,
    bevelMm: 2.1,
    bevelSegments: 2,
    splineSubdivisions: 4,
    sharpCornerAngleDeg: 62,
    polygonPoints: [
      [-14.5, 285.0],
      [16.5, 285.0],
      [20.2, 293.0],
      [21.8, 299.5],
      [21.8, 314.5],
      [17.5, 320.8],
      [7.5, 325.4],
      [-5.5, 328.2],
      [-17.5, 327.2],
      [-21.0, 316.0],
      [-16.2, 304.5],
      [-15.4, 295.0],
    ],
  };

  // 2. Curved-spine tapered forged claw (true Z-taper + smooth arched spine + forged chamfered flanks)
  const curvedClaw: CsgNodeSpec = {
    op: 'curvedLoft',
    radialSegments: 32,
    splineSamples: 32,
    upHint: [0, 0, 1],
    curvedLoftStations: [
      { posMm: [2.0, 316.5, 0], halfA: 10.2, halfB: 12.6, exponent: 4.2 },
      { posMm: [-12.0, 321.2, 0], halfA: 8.6, halfB: 12.4, exponent: 4.4 },
      { posMm: [-27.0, 321.0, 0], halfA: 7.4, halfB: 12.0, exponent: 4.6 },
      { posMm: [-41.5, 316.2, 0], halfA: 6.0, halfB: 11.4, exponent: 4.8 },
      { posMm: [-54.5, 307.2, 0], halfA: 4.3, halfB: 10.6, exponent: 5.0 },
      { posMm: [-63.5, 297.5, 0], halfA: 2.6, halfB: 9.8, exponent: 5.2 },
      { posMm: [-68.0, 290.6, 0], halfA: 1.35, halfB: 9.2, exponent: 5.4 },
    ],
  };

  // 3. Forged cheek-to-neck shoulder transition (bridges flat-sided cheek into round hourglass neck)
  const cheekToNeckShoulder: CsgNodeSpec = {
    op: 'curvedLoft',
    radialSegments: 36,
    splineSamples: 18,
    upHint: [0, 0, 1],
    curvedLoftStations: [
      { posMm: [11.0, 306.8, 0], halfA: 13.8, halfB: 12.4, exponent: 4.4 },
      { posMm: [17.5, 306.8, 0], halfA: 12.4, halfB: 11.6, exponent: 3.4 },
      { posMm: [23.0, 306.8, 0], halfA: 10.8, halfB: 10.6, exponent: 2.4 },
      { posMm: [28.0, 306.8, 0], halfA: 9.8, halfB: 9.8, exponent: 2.0 },
    ],
  };

  // 4. Revolved hourglass neck, bell shoulder & cylindrical poll along +X (centered at Y = 306.8 mm)
  const neckAndPoll: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 44,
    lathePoints: [
      [0.0, 18.0],
      [11.4, 18.0],
      [10.4, 23.0],
      [9.6, 27.5],
      [9.5, 32.0],
      [10.3, 37.0],
      [12.1, 42.5],
      [14.0, 47.0],
      [14.5, 50.0],
      [14.5, 62.5],
      [13.2, 65.0],
      [0.0, 65.0],
    ],
    rotateDeg: [0, 0, -90],
    translateMm: [0, 306.8, 0],
  };

  // V-shaped nail-pulling claw slot cutter (extruded vertically in Y, rotated to slice cleanly through claw)
  // In X-Z plane: narrow 1.4 mm root at X = -25 mm, widening to 10.6 mm at X = -72 mm
  const clawSlotCutter: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 58,
    polygonPoints: [
      [-74.0, -5.4],
      [-74.0, 5.4],
      [-26.0, 0.7],
      [-26.0, -0.7],
    ],
    rotateDeg: [-90, 0, 0],
    translateMm: [0, 306.0, 0],
  };

  // Underside oval eye pocket so the fiberglass shaft seats cleanly inside the head with zero clash
  const eyeSocketCutter: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 20,
    superellipseStations: [
      { posMm: 282.0, offsetU: 1.0, offsetV: 0, halfA: 12.4, halfB: 8.6, exponent: 3.0 },
      { posMm: 296.0, offsetU: 1.0, offsetV: 0, halfA: 12.4, halfB: 8.6, exponent: 3.0 },
    ],
  };

  return {
    op: 'subtract',
    children: [
      {
        op: 'union',
        children: [forgedCheek, curvedClaw, cheekToNeckShoulder, neckAndPoll],
      },
      clawSlotCutter,
      eyeSocketCutter,
    ],
  };
}

/**
 * Polished crowned striking face cap (subtle bright steel finish at the very tip of the poll, X = 64.5..66.2 mm).
 */
function buildStrikingFaceCsg(): CsgNodeSpec {
  return {
    op: 'revolve',
    radialSegments: 36,
    lathePoints: [
      [0.0, 64.6],
      [13.1, 64.6],
      [12.7, 65.6],
      [11.0, 66.0],
      [0.0, 66.2],
    ],
    rotateDeg: [0, 0, -90],
    translateMm: [0, 306.8, 0],
  };
}

/**
 * Faceted matte-black fiberglass composite shaft emerging from the head eye (Y = 200..294 mm).
 * Features the flat beveled octagonal-oval cross-section clearly visible in the photo.
 */
function buildFiberglassShaftCsg(): CsgNodeSpec {
  return {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 24,
    superellipseStations: [
      { posMm: 199.5, offsetU: 0.0, offsetV: 0, halfA: 13.4, halfB: 9.6, exponent: 3.4 },
      { posMm: 220.0, offsetU: 0.2, offsetV: 0, halfA: 13.7, halfB: 9.8, exponent: 3.6 },
      { posMm: 252.0, offsetU: 0.6, offsetV: 0, halfA: 14.1, halfB: 10.1, exponent: 3.6 },
      { posMm: 282.0, offsetU: 1.0, offsetV: 0, halfA: 14.3, halfB: 10.3, exponent: 3.5 },
      { posMm: 285.5, offsetU: 1.0, offsetV: 0, halfA: 12.1, halfB: 8.4, exponent: 3.0 },
      { posMm: 294.5, offsetU: 1.0, offsetV: 0, halfA: 12.0, halfB: 8.3, exponent: 3.0 },
    ],
  };
}

/**
 * Thin structural black epoxy eye collar right under the forged steel cheek (Y = 282.5..285.5 mm).
 */
function buildEpoxyEyeCollarCsg(): CsgNodeSpec {
  return {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 24,
    superellipseStations: [
      { posMm: 282.2, offsetU: 1.0, offsetV: 0, halfA: 14.6, halfB: 10.7, exponent: 3.4 },
      { posMm: 285.2, offsetU: 1.0, offsetV: 0, halfA: 14.8, halfB: 11.0, exponent: 3.4 },
    ],
  };
}

/**
 * Bright ULINE red molded elastomer transition ring separating fiberglass shaft and rubber grip
 * (Y = 188.0..200.5 mm).
 */
function buildRedCollarBandCsg(): CsgNodeSpec {
  return {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 28,
    superellipseStations: [
      { posMm: 187.8, offsetU: 0.0, offsetV: 0, halfA: 15.2, halfB: 11.2, exponent: 2.8 },
      { posMm: 190.0, offsetU: 0.0, offsetV: 0, halfA: 15.5, halfB: 11.4, exponent: 2.9 },
      { posMm: 198.5, offsetU: 0.0, offsetV: 0, halfA: 15.2, halfB: 11.2, exponent: 3.0 },
      { posMm: 200.5, offsetU: 0.0, offsetV: 0, halfA: 14.3, halfB: 10.4, exponent: 3.2 },
    ],
  };
}

/**
 * Contoured matte-black TPE rubber ergonomic grip (Y = 0.0..188.2 mm):
 * - Flared pommel heel seated cleanly on Y = 0
 * - Narrowed wrist neck, subtle ergonomic palm swell, tapering smoothly into the red collar
 * - 4 subtle transverse finger-relief grooves subtracted along the -X back spine
 * - Oval through-pocket near the pommel (Y = 23 mm) for the red lanyard insert
 */
function buildErgonomicRubberGripCsg(): CsgNodeSpec {
  const gripBody: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 32,
    superellipseStations: [
      // Grounded pommel base (Y = 0)
      { posMm: 0.0, offsetU: -1.8, offsetV: 0, halfA: 16.5, halfB: 10.5, exponent: 2.2 },
      { posMm: 3.5, offsetU: -2.0, offsetV: 0, halfA: 20.6, halfB: 13.4, exponent: 2.3 },
      { posMm: 10.0, offsetU: -2.2, offsetV: 0, halfA: 21.4, halfB: 14.0, exponent: 2.4 },
      { posMm: 20.0, offsetU: -1.6, offsetV: 0, halfA: 18.6, halfB: 13.2, exponent: 2.4 },
      { posMm: 34.0, offsetU: -0.8, offsetV: 0, halfA: 16.8, halfB: 12.6, exponent: 2.4 },
      // Ergonomic palm swell
      { posMm: 62.0, offsetU: -0.3, offsetV: 0, halfA: 17.6, halfB: 13.2, exponent: 2.4 },
      { posMm: 95.0, offsetU: 0.0, offsetV: 0, halfA: 18.2, halfB: 13.5, exponent: 2.4 },
      { posMm: 132.0, offsetU: 0.0, offsetV: 0, halfA: 17.5, halfB: 13.0, exponent: 2.5 },
      { posMm: 162.0, offsetU: 0.0, offsetV: 0, halfA: 16.4, halfB: 12.1, exponent: 2.6 },
      { posMm: 188.2, offsetU: 0.0, offsetV: 0, halfA: 15.1, halfB: 11.1, exponent: 2.8 },
    ],
  };

  // Subtle transverse finger relief grooves along the -X back spine (matching photo)
  const grooveYs = [62, 86, 110, 134];
  const grooveCutters: CsgNodeSpec[] = grooveYs.map((y) => ({
    op: 'cylinder',
    radius: 2.1,
    height: 30,
    radialSegments: 14,
    rotateDeg: [90, 0, 0],
    translateMm: [-18.4, y, 0],
  }));

  // Oval pocket for the red lanyard plug near the pommel (Y = 23 mm, X = -3.0 mm)
  const lanyardPocket: CsgNodeSpec = {
    op: 'hull',
    children: [
      {
        op: 'cylinder',
        radius: 4.5,
        height: 32,
        radialSegments: 18,
        rotateDeg: [90, 0, 0],
        translateMm: [-3.2, 26.5, 0],
      },
      {
        op: 'cylinder',
        radius: 4.5,
        height: 32,
        radialSegments: 18,
        rotateDeg: [90, 0, 0],
        translateMm: [-2.6, 19.5, 0],
      },
    ],
  };

  return {
    op: 'subtract',
    children: [gripBody, ...grooveCutters, lanyardPocket],
  };
}

/**
 * Textured anti-slip honeycomb TPE palm grip inlay wrapping the +X front palm curve
 * (Y = 24..156 mm), proud by ~0.5 mm so the contrasting rubber texture reads crisply.
 */
function buildTexturedPalmPadCsg(): CsgNodeSpec {
  const outerShell: CsgNodeSpec = {
    op: 'superellipseLoft',
    loftAxis: 'y',
    radialSegments: 32,
    superellipseStations: [
      { posMm: 24.0, offsetU: -1.4, offsetV: 0, halfA: 18.4, halfB: 13.3, exponent: 2.4 },
      { posMm: 42.0, offsetU: -0.6, offsetV: 0, halfA: 17.5, halfB: 13.1, exponent: 2.4 },
      { posMm: 76.0, offsetU: -0.2, offsetV: 0, halfA: 18.4, halfB: 13.7, exponent: 2.4 },
      { posMm: 112.0, offsetU: 0.0, offsetV: 0, halfA: 18.5, halfB: 13.7, exponent: 2.4 },
      { posMm: 144.0, offsetU: 0.0, offsetV: 0, halfA: 17.4, halfB: 12.9, exponent: 2.5 },
      { posMm: 158.0, offsetU: 0.0, offsetV: 0, halfA: 16.2, halfB: 11.9, exponent: 2.5 },
    ],
  };

  // Clip to the +X palm side (X > +4.5 mm) with arched top & bottom taper
  const palmClipMask: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 36,
    polygonPoints: [
      [8.5, 25.0],
      [22.0, 25.0],
      [22.0, 157.0],
      [13.0, 157.0],
      [7.5, 146.0],
      [5.0, 120.0],
      [4.5, 85.0],
      [5.5, 50.0],
    ],
  };

  return {
    op: 'intersect',
    children: [outerShell, palmClipMask],
  };
}

/**
 * Bright red pill-shaped lanyard insert plug seated cleanly in the pommel pocket (Y = 19.5..26.5 mm).
 */
function buildRedLanyardPlugCsg(): CsgNodeSpec {
  return {
    op: 'hull',
    children: [
      {
        op: 'cylinder',
        radius: 4.35,
        height: 27.6,
        radialSegments: 20,
        rotateDeg: [90, 0, 0],
        translateMm: [-3.2, 26.5, 0],
      },
      {
        op: 'cylinder',
        radius: 4.35,
        height: 27.6,
        radialSegments: 20,
        rotateDeg: [90, 0, 0],
        translateMm: [-2.6, 19.5, 0],
      },
    ],
  };
}

// ============================================================================
// ASSEMBLY PARTS
// ============================================================================

const PARTS: BlueprintPart[] = [
  {
    id: 'hammer-rubber-grip',
    name: 'Ergonomic TPE Rubber Grip',
    group: 'Handle & Grip',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, -45, 0],
    toleranceMm: 0.15,
    notes: 'Flared pommel seated flush on Y=0 with back-spine finger relief grooves and lanyard recess.',
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    material: MAT_RUBBER_GRIP,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 45,
      csgRoot: buildErgonomicRubberGripCsg(),
    },
  },
  {
    id: 'hammer-palm-pad',
    name: 'Textured Honeycomb Palm Pad',
    group: 'Handle & Grip',
    role: 'secondary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [24, -45, 0],
    toleranceMm: 0.15,
    notes: 'Overmolded anti-slip honeycomb TPE pad hugging the front (+X) palm curve.',
    material: MAT_TEXTURED_PALM_PAD,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 45,
      csgRoot: buildTexturedPalmPadCsg(),
    },
  },
  {
    id: 'hammer-red-lanyard-plug',
    name: 'Red Pommel Lanyard Insert',
    group: 'Handle & Grip',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [-22, -55, 0],
    toleranceMm: 0.1,
    notes: 'Pill-shaped ULINE red molded elastomer insert near the flared handle heel.',
    material: MAT_ULINE_RED,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 45,
      csgRoot: buildRedLanyardPlugCsg(),
    },
  },
  {
    id: 'hammer-red-collar',
    name: 'Red Elastomer Transition Collar',
    group: 'Handle & Grip',
    role: 'secondary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, -10, 0],
    toleranceMm: 0.12,
    notes: 'Signature ULINE red collar ring between the rubber grip and fiberglass shaft.',
    material: MAT_ULINE_RED,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 45,
      csgRoot: buildRedCollarBandCsg(),
    },
  },
  {
    id: 'hammer-fiberglass-shaft',
    name: 'Faceted Fiberglass Composite Shaft',
    group: 'Handle & Grip',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 15, 0],
    toleranceMm: 0.15,
    notes: 'Pultruded matte-black fiberglass core with flat beveled sides seated into the steel eye.',
    material: MAT_FIBERGLASS_SHAFT,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 35,
      csgRoot: buildFiberglassShaftCsg(),
    },
  },
  {
    id: 'hammer-epoxy-collar',
    name: 'Epoxy Eye Seal Collar',
    group: 'Forged Steel Head',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 35, 0],
    toleranceMm: 0.1,
    notes: 'Black structural epoxy bond seal at the steel head eye throat.',
    material: MAT_EPOXY_COLLAR,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 40,
      csgRoot: buildEpoxyEyeCollarCsg(),
    },
  },
  {
    id: 'hammer-forged-head',
    name: 'Drop-Forged 16 oz Curved Claw Head',
    group: 'Forged Steel Head',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [0, 62, 0],
    toleranceMm: 0.1,
    notes: 'Drop-forged brushed steel head with V-slotted curved claw, flat cheeks, hourglass neck, and Ø29 mm poll.',
    material: MAT_FORGED_STEEL,
    geometry: {
      kind: 'csgSolid',
      smoothSharpAngleDeg: 30,
      csgRoot: buildForgedHammerHeadCsg(),
    },
  },
  {
    id: 'hammer-striking-face',
    name: 'Hardened Striking Face Cap',
    group: 'Forged Steel Head',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    explodeOffsetMm: [28, 62, 0],
    toleranceMm: 0.05,
    notes: 'Induction-hardened chamfered circular striking face (Ø29 mm nominal).',
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

export const ULINE_CLAW_HAMMER_BLUEPRINT: MeshBlueprint = {
  id: 'uline-16oz-claw-hammer',
  name: 'ULINE 16 oz Fiberglass Curved Claw Hammer',
  category: 'Hand Tools & Shop Equipment',
  summary:
    '100% watertight Manifold-3D CAD reconstruction of the ULINE 16 oz curved claw hammer featuring a drop-forged brushed steel head with V-slotted nail claw and Ø29 mm striking poll, faceted matte-black fiberglass shaft, signal-red transition collar, contoured TPE rubber grip with honeycomb palm pad, red pommel lanyard insert, and ULINE / 16oz markings.',
  sourceImageUrl: '/assets/aistudio/uline_16oz_claw_hammer.png',
  isReferencePreset: true,
  envelopeMm: {
    width: 134,
    height: 330,
    depth: 29,
  },
  toleranceSpecMm: 0.1,
  symmetryPlane: 'Z',
  photoMatchCamera: {
    positionMm: [18, 178, 470],
    targetMm: [-2, 168, 0],
    fov: 38,
  },
  decals: [
    {
      id: 'hammer-16oz-stamp-front',
      targetPartId: 'hammer-forged-head',
      positionMm: [2, 306, 13.3],
      rotationDeg: [0, 0, 0],
      sizeMm: [22, 11, 8],
      text: '16oz',
      colorHex: '#2b3038',
      opacity: 0.86,
      fontWeight: 'semibold',
    },
    {
      id: 'hammer-16oz-stamp-back',
      targetPartId: 'hammer-forged-head',
      positionMm: [2, 306, -13.3],
      rotationDeg: [0, 180, 0],
      sizeMm: [22, 11, 8],
      text: '16oz',
      colorHex: '#2b3038',
      opacity: 0.86,
      fontWeight: 'semibold',
    },
    {
      id: 'hammer-uline-logo-front',
      targetPartId: 'hammer-rubber-grip',
      positionMm: [-2.5, 86, 13.5],
      rotationDeg: [0, 0, 90],
      sizeMm: [34, 11, 10],
      text: 'ULINE',
      colorHex: '#e1251b',
      opacity: 0.96,
      fontWeight: 'bold',
    },
    {
      id: 'hammer-uline-logo-back',
      targetPartId: 'hammer-rubber-grip',
      positionMm: [-2.5, 86, -13.5],
      rotationDeg: [0, 180, 90],
      sizeMm: [34, 11, 10],
      text: 'ULINE',
      colorHex: '#e1251b',
      opacity: 0.96,
      fontWeight: 'bold',
    },
  ],
  parts: PARTS,
  reconstructedAt: new Date().toISOString(),
};
