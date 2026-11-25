import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * Banwood Classic Cruiser Skateboard (Natural Maple / Cream Wheels)
 * 100% Watertight Manifold-3D CAD Reconstruction from reference photo.
 *
 * Calibrated Master Coordinate System (mm, Y-up, Y = 0 ground):
 * - Ground plane: Y = 0.0 mm (all 4 Ø58 mm cruiser wheels resting flush on Y = 0)
 * - Overall Length (X): -259.5 mm (kicktail tip) .. +259.5 mm (cruiser nose tip) = 519.0 mm (51.9 cm)
 * - Overall Width  (Z): -85.0 mm .. +85.0 mm = 170.0 mm (17.0 cm)
 * - Overall Height (Y): 0.0 mm .. 109.0 mm (kicktail apex); flat deck top at Y = 91.5 mm
 * - Wheelbase: Rear truck X = -140.0 mm, Front truck X = +162.0 mm (302.0 mm C-to-C)
 * - Wheels: Ø58.0 mm × 45.0 mm wide SHR80A cream urethane cruiser wheels, axle at Y = 29.0 mm
 * - Trucks: 3.25" cast satin aluminum trucks with cream-taupe 90A barrel/cone bushings
 *
 * Sub-Assemblies:
 * 1. 8-Ply Laminated Canadian Maple Cruiser Deck (3-layer curved maple veneer + darker mid-ply core,
 *    smooth 11° rear kicktail, subtle nose rise, beveled rails, and engraved 'BANWOOD' deck wordmark)
 * 2. Mounting Hardware (8 flush black countersunk Phillips deck bolts + underside nyloc hex nuts)
 * 3. Front & Rear 3.25" Cast Aluminum Trucks (baseplates, pivot cups, sculpted hangers, inclined
 *    steel kingpins, chrome cup washers, cream-taupe barrel & cone bushings, and hardened steel axles)
 * 4. 4 Wide Cream Cruiser Wheels (revolved radiused tread & recessed bearing bore, circular
 *    'BANWOOD · BANWOOD ·' sidewall markings, 8 ABEC-7 black-sealed bearings, speed rings & hex axle nuts)
 */

// ============================================================================
// PBR ENGINEERING MATERIALS
// ============================================================================

const MAT_MAPLE_TOP_BOTTOM: PartMaterialSpec = {
  colorHex: '#dbc09d',
  metalness: 0.02,
  roughness: 0.56,
  clearcoat: 0.14,
  clearcoatRoughness: 0.42,
  densityGPerCm3: 0.71,
  textureKind: 'woodGrain',
  finishName: 'Natural Canadian Maple Outer Veneer (Clear Soft Grip)',
};

const MAT_MAPLE_CORE_PLY: PartMaterialSpec = {
  colorHex: '#b38b62',
  metalness: 0.02,
  roughness: 0.62,
  clearcoat: 0.08,
  clearcoatRoughness: 0.5,
  densityGPerCm3: 0.71,
  textureKind: 'woodGrain',
  finishName: 'Laminated 8-Ply Canadian Maple Cross-Band Core',
};

const MAT_CAST_ALUMINUM_TRUCK: PartMaterialSpec = {
  colorHex: '#c2c7cc',
  metalness: 0.86,
  roughness: 0.32,
  clearcoat: 0.08,
  clearcoatRoughness: 0.35,
  densityGPerCm3: 2.7,
  textureKind: 'brushedMetal',
  finishName: 'Raw Cast Satin 356-T6 Aluminum Truck Alloy',
};

const MAT_POLISHED_STEEL: PartMaterialSpec = {
  colorHex: '#d5dbe2',
  metalness: 0.94,
  roughness: 0.18,
  clearcoat: 0.15,
  clearcoatRoughness: 0.18,
  densityGPerCm3: 7.85,
  textureKind: 'brushedMetal',
  finishName: 'Zinc-Plated Hardened Chromoly Steel Hardware',
};

const MAT_BLACK_HARDWARE: PartMaterialSpec = {
  colorHex: '#1f2227',
  metalness: 0.55,
  roughness: 0.38,
  clearcoat: 0.12,
  clearcoatRoughness: 0.35,
  densityGPerCm3: 7.85,
  textureKind: 'none',
  finishName: 'Black-Oxide Steel Countersunk Phillips Hardware',
};

const MAT_CREAM_WHEEL: PartMaterialSpec = {
  colorHex: '#dad1bc',
  metalness: 0.02,
  roughness: 0.48,
  clearcoat: 0.14,
  clearcoatRoughness: 0.38,
  densityGPerCm3: 1.15,
  textureKind: 'none',
  finishName: 'High-Rebound SHR80A Cream Polyurethane Wheel',
};

const MAT_CREAM_BUSHING: PartMaterialSpec = {
  colorHex: '#c8bfb0',
  metalness: 0.02,
  roughness: 0.42,
  clearcoat: 0.16,
  clearcoatRoughness: 0.34,
  densityGPerCm3: 1.18,
  textureKind: 'none',
  finishName: '90A High-Rebound Sand-Cream Urethane Bushing',
};

const MAT_PIVOT_CUP: PartMaterialSpec = {
  colorHex: '#353432',
  metalness: 0.03,
  roughness: 0.72,
  densityGPerCm3: 1.18,
  textureKind: 'none',
  finishName: 'Dark Charcoal Urethane Truck Pivot Cup',
};

const MAT_BEARING_SEAL: PartMaterialSpec = {
  colorHex: '#1c1f24',
  metalness: 0.08,
  roughness: 0.58,
  densityGPerCm3: 1.25,
  textureKind: 'none',
  finishName: 'ABEC-7 Nitrile Rubber Bearing Shield (Black)',
};

// ============================================================================
// MASTER PARAMETRIC DIMENSIONS (MM)
// ============================================================================

const WHEEL_RADIUS = 29.0; // Ø58 mm Banwood cruiser wheel
const WHEEL_WIDTH = 45.0; // 45 mm wide soft cruiser wheel
const WHEEL_OUTER_Z = 83.0; // Overall track = 166 mm (slightly proud of tapered deck rails)
const WHEEL_INNER_Z = WHEEL_OUTER_Z - WHEEL_WIDTH; // 38.0 mm
const WHEEL_CENTER_Z = (WHEEL_OUTER_Z + WHEEL_INNER_Z) * 0.5; // 60.5 mm
const HANGER_HALF_Z = 37.0; // 74 mm hanger + 1 mm speed ring each side

const AXLE_Y = WHEEL_RADIUS; // 29.0 mm (wheels sit flush on Y = 0)
const DECK_BOT_Y = 81.0; // 52 mm truck height (23 mm wheelbite clearance)
const DECK_THICK = 10.5; // 8-ply Canadian maple thickness
const DECK_TOP_Y = DECK_BOT_Y + DECK_THICK; // 91.5 mm

const FRONT_TRUCK_X = 162.0;
const REAR_TRUCK_X = -140.0;

// Standard skateboard truck bolt pattern: 2.125" (54 mm) × 1.625" (41.3 mm)
const BOLT_HALF_X = 27.0;
const BOLT_HALF_Z = 20.65;

// ============================================================================
// 1. LAMINATED 8-PLY CANADIAN MAPLE CRUISER DECK
// ============================================================================

/**
 * Generates the symmetric 2D cruiser deck planform [x, z] in mm.
 * `insetMm` shrinks the perimeter slightly on the top & bottom outer veneers
 * to form authentic rounded/beveled laminated maple rails.
 */
function buildDeckPlanform2D(insetMm: number): [number, number][] {
  // Half-profile from nose (+X) to tail (-X) along +Z, then mirrored along -Z
  const rawUpper: [number, number][] = [
    [259.5, 0.0],
    [256.0, 24.0],
    [244.0, 48.0],
    [222.0, 68.0],
    [188.0, 79.5],
    [140.0, 84.0],
    [80.0, 85.0],
    [10.0, 84.0],
    [-65.0, 81.0],
    [-130.0, 76.5],
    [-185.0, 70.0],
    [-226.0, 58.0],
    [-248.0, 39.0],
    [-257.0, 18.0],
    [-259.5, 0.0],
  ];

  // Apply inward normal-ish inset for rail chamfer
  const insetPoint = ([x, z]: [number, number]): [number, number] => {
    const sx = x >= 0 ? Math.max(0, x - insetMm * (Math.abs(x) / 259.5)) : Math.min(0, x + insetMm * (Math.abs(x) / 259.5));
    const sz = z === 0 ? 0 : Math.max(0, z - insetMm);
    return [Number(sx.toFixed(2)), Number(sz.toFixed(2))];
  };

  const upper = rawUpper.map(insetPoint);
  const lower: [number, number][] = [];
  for (let i = upper.length - 2; i >= 1; i--) {
    lower.push([upper[i][0], -upper[i][1]]);
  }
  return [...upper, ...lower];
}

/**
 * Evaluates the deck's underside Y elevation along X (flat wheelbase + smooth 11° kicktail + subtle nose lip).
 */
function deckBottomYAtX(x: number): number {
  if (x < -140.0) {
    // Smooth quadratic-to-linear kicktail rising 17.5 mm over 119.5 mm
    const t = Math.min(1, (-140.0 - x) / 119.5);
    return DECK_BOT_Y + 17.5 * (0.38 * t * t + 0.62 * Math.pow(t, 1.55));
  }
  if (x > 175.0) {
    // Subtle 2.4 mm cruiser nose upturn
    const t = Math.min(1, (x - 175.0) / 84.5);
    return DECK_BOT_Y + 2.4 * t * t;
  }
  return DECK_BOT_Y;
}

/**
 * Builds one laminated curved deck ply layer via exact CSG intersection of:
 * - Planform extrusion along Y (with spline-smoothed cruiser silhouette)
 * - Curved side-elevation extrusion along Z (spanning full width)
 */
function buildDeckPlyLayerCsg(
  yOffsetStartMm: number,
  yOffsetEndMm: number,
  perimeterInsetMm: number
): CsgNodeSpec {
  const xSamples = [
    -262, -248, -230, -210, -188, -165, -140, -100, -40, 40, 120, 175, 205, 232, 262,
  ];
  const sidePoly: [number, number][] = [];
  for (const x of xSamples) {
    sidePoly.push([x, Number((deckBottomYAtX(x) + yOffsetStartMm).toFixed(2))]);
  }
  for (let i = xSamples.length - 1; i >= 0; i--) {
    const x = xSamples[i];
    sidePoly.push([x, Number((deckBottomYAtX(x) + yOffsetEndMm).toFixed(2))]);
  }

  // Planform in local XY -> rotated -90° around X maps local +X -> +X, local +Y -> -Z, extrude Z -> +Y
  const planformPoly = buildDeckPlanform2D(perimeterInsetMm);
  const planformExtrude: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 65.0,
    polygonPoints: planformPoly,
    splineSubdivisions: 5,
    sharpCornerAngleDeg: 85,
    rotateDeg: [-90, 0, 0],
    translateMm: [0, 96.0, 0],
  };

  const sideExtrude: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 190.0,
    polygonPoints: sidePoly,
  };

  return {
    op: 'intersect',
    children: [planformExtrude, sideExtrude],
  };
}

// ============================================================================
// 2. MOUNTING HARDWARE (BLACK COUNTERSUNK PHILLIPS BOLTS + NYLOC NUTS)
// ============================================================================

function buildDeckBoltsSetCsg(truckX: number): CsgNodeSpec {
  const bolts: CsgNodeSpec[] = [];
  const offsets: [number, number][] = [
    [-BOLT_HALF_X, -BOLT_HALF_Z],
    [-BOLT_HALF_X, BOLT_HALF_Z],
    [BOLT_HALF_X, -BOLT_HALF_Z],
    [BOLT_HALF_X, BOLT_HALF_Z],
  ];

  for (const [dx, dz] of offsets) {
    const bx = truckX + dx;
    const bz = dz;
    // Countersunk flat head flush with top maple veneer (Y = 91.6 mm) + real Phillips cross recess
    const headAndShank: CsgNodeSpec = {
      op: 'subtract',
      children: [
        {
          op: 'union',
          children: [
            // Countersunk conical head
            {
              op: 'cylinder',
              radiusTop: 4.8,
              radiusBottom: 2.3,
              height: 2.6,
              radialSegments: 20,
              translateMm: [bx, DECK_TOP_Y - 1.2, bz],
            },
            // Threaded bolt shank passing through deck & baseplate
            {
              op: 'cylinder',
              radius: 2.25,
              height: 21.5,
              radialSegments: 14,
              translateMm: [bx, DECK_TOP_Y - 11.2, bz],
            },
            // Underside black nyloc hex nut seated against baseplate bottom (Y = 74.5 mm)
            {
              op: 'cylinder',
              radius: 4.3,
              height: 4.2,
              radialSegments: 6,
              translateMm: [bx, 72.4, bz],
            },
          ],
        },
        // Phillips '+' cross recess slot X-bar
        {
          op: 'box',
          width: 5.4,
          height: 2.4,
          depth: 1.35,
          translateMm: [bx, DECK_TOP_Y + 0.1, bz],
        },
        // Phillips '+' cross recess slot Z-bar
        {
          op: 'box',
          width: 1.35,
          height: 2.4,
          depth: 5.4,
          translateMm: [bx, DECK_TOP_Y + 0.1, bz],
        },
      ],
    };
    bolts.push(headAndShank);
  }

  return {
    op: 'union',
    children: bolts,
  };
}

// ============================================================================
// 3. 3.25" CAST ALUMINUM SKATEBOARD TRUCKS (FRONT & REAR)
// ============================================================================

/**
 * Helper: returns a local coordinate point along the truck's inclined kingpin axis.
 * `dir`: +1 for front truck (pivot toward +X nose, kingpin leans toward -X center),
 *        -1 for rear truck (pivot toward -X tail, kingpin leans toward +X center).
 */
function kingpinPoint(xCenter: number, dir: 1 | -1, distFromBaseMm: number): [number, number, number] {
  // Kingpin originates inside baseplate at (xCenter - dir * 6, 77.0, 0)
  // and extends downward & slightly inward at 20° from vertical (-Y, -dir * X)
  const rad = (20 * Math.PI) / 180;
  const kx = xCenter - dir * (6.0 + Math.sin(rad) * distFromBaseMm);
  const ky = 77.0 - Math.cos(rad) * distFromBaseMm;
  return [Number(kx.toFixed(2)), Number(ky.toFixed(2)), 0];
}

function buildTruckBaseplateCsg(xCenter: number, dir: 1 | -1): CsgNodeSpec {
  // Rounded rectangular baseplate flange seated flush against deck underside (Y = 74.5 .. 81.0 mm)
  const platePoly: [number, number][] = [
    [-33.5, -24.0],
    [33.5, -24.0],
    [35.5, -21.5],
    [35.5, 21.5],
    [33.5, 24.0],
    [-33.5, 24.0],
    [-35.5, 21.5],
    [-35.5, -21.5],
  ];
  const plate: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 6.5,
    bevelMm: 0.9,
    bevelSegments: 2,
    splineSubdivisions: 2,
    polygonPoints: platePoly,
    rotateDeg: [-90, 0, 0],
    translateMm: [xCenter, 77.75, 0],
  };

  // Sculpted cast rib bridge connecting pivot cup boss & kingpin boss
  const centerBridge: CsgNodeSpec = {
    op: 'curvedLoft',
    radialSegments: 24,
    splineSamples: 14,
    upHint: [0, 0, 1],
    curvedLoftStations: [
      { posMm: [xCenter - dir * 16.0, 74.5, 0], halfA: 5.0, halfB: 13.5, exponent: 3.0 },
      { posMm: [xCenter - dir * 4.0, 70.5, 0], halfA: 6.8, halfB: 14.5, exponent: 2.6 },
      { posMm: [xCenter + dir * 12.0, 69.0, 0], halfA: 7.2, halfB: 13.5, exponent: 2.4 },
      { posMm: [xCenter + dir * 23.0, 67.5, 0], halfA: 8.5, halfB: 10.5, exponent: 2.0 },
    ],
  };

  // Outer pivot cup housing boss (angled cylinder pointing toward axle/hanger)
  const pivotBoss: CsgNodeSpec = {
    op: 'cylinder',
    radiusTop: 10.2,
    radiusBottom: 9.0,
    height: 15.0,
    radialSegments: 28,
    rotateDeg: [0, 0, dir * -26],
    translateMm: [xCenter + dir * 23.5, 68.0, 0],
  };

  // Pivot cup bore cavity
  const pivotBore: CsgNodeSpec = {
    op: 'cylinder',
    radius: 6.6,
    height: 13.0,
    radialSegments: 24,
    rotateDeg: [0, 0, dir * -26],
    translateMm: [xCenter + dir * 21.8, 64.5, 0],
  };

  // Angled kingpin collar boss on inner side of baseplate
  const kpPos = kingpinPoint(xCenter, dir, 6.0);
  const kingpinBoss: CsgNodeSpec = {
    op: 'cylinder',
    radiusTop: 11.5,
    radiusBottom: 10.2,
    height: 11.0,
    radialSegments: 24,
    rotateDeg: [0, 0, dir * -20],
    translateMm: kpPos,
  };

  return {
    op: 'subtract',
    children: [
      {
        op: 'union',
        children: [plate, centerBridge, pivotBoss, kingpinBoss],
      },
      pivotBore,
    ],
  };
}

function buildTruckHangerCsg(xCenter: number, dir: 1 | -1): CsgNodeSpec {
  const axleX = xCenter + dir * 2.0;

  // 1. Horizontal sculpted cast aluminum axle beam (Z = -37 .. +37 mm)
  // Tapered classic skateboard hanger with thicker faceted center yoke tapering to round axle ends
  const axleBeam: CsgNodeSpec = {
    op: 'curvedLoft',
    radialSegments: 28,
    splineSamples: 22,
    upHint: [0, 1, 0],
    curvedLoftStations: [
      { posMm: [axleX, AXLE_Y, -HANGER_HALF_Z], halfA: 7.4, halfB: 7.4, exponent: 2.0 },
      { posMm: [axleX, AXLE_Y, -28.0], halfA: 8.2, halfB: 8.4, exponent: 2.4 },
      { posMm: [axleX, AXLE_Y, -14.0], halfA: 9.8, halfB: 10.4, exponent: 2.8 },
      { posMm: [axleX, AXLE_Y, 0.0], halfA: 11.5, halfB: 12.2, exponent: 3.0 },
      { posMm: [axleX, AXLE_Y, 14.0], halfA: 9.8, halfB: 10.4, exponent: 2.8 },
      { posMm: [axleX, AXLE_Y, 28.0], halfA: 8.2, halfB: 8.4, exponent: 2.4 },
      { posMm: [axleX, AXLE_Y, HANGER_HALF_Z], halfA: 7.4, halfB: 7.4, exponent: 2.0 },
    ],
  };

  // 2. Sculpted triangular cast web sweeping up from axle center to the pivot pin inside pivot cup
  const pivotArm: CsgNodeSpec = {
    op: 'curvedLoft',
    radialSegments: 24,
    splineSamples: 18,
    upHint: [0, 0, 1],
    curvedLoftStations: [
      { posMm: [axleX - dir * 3.0, AXLE_Y + 2.0, 0], halfA: 9.5, halfB: 15.0, exponent: 3.0 },
      { posMm: [axleX + dir * 4.5, 41.0, 0], halfA: 8.4, halfB: 12.8, exponent: 2.8 },
      { posMm: [axleX + dir * 12.0, 52.5, 0], halfA: 7.0, halfB: 9.2, exponent: 2.4 },
      { posMm: [xCenter + dir * 20.5, 61.5, 0], halfA: 5.2, halfB: 5.2, exponent: 2.0 },
      { posMm: [xCenter + dir * 23.0, 66.5, 0], halfA: 4.5, halfB: 4.5, exponent: 2.0 },
    ],
  };

  // 3. Cast kingpin seat ring wrapping around the kingpin between barrel & cone bushings
  const kpRingPos = kingpinPoint(xCenter, dir, 27.5);
  const kingpinRing: CsgNodeSpec = {
    op: 'cylinder',
    radius: 11.8,
    height: 7.5,
    radialSegments: 28,
    rotateDeg: [0, 0, dir * -20],
    translateMm: kpRingPos,
  };

  // Cast bridge connecting axle center to kingpin seat ring
  const kingpinBridge: CsgNodeSpec = {
    op: 'curvedLoft',
    radialSegments: 20,
    splineSamples: 10,
    upHint: [0, 0, 1],
    curvedLoftStations: [
      { posMm: [axleX, AXLE_Y + 4.0, 0], halfA: 7.8, halfB: 12.5, exponent: 2.6 },
      { posMm: [(axleX + kpRingPos[0]) * 0.5, (AXLE_Y + 4.0 + kpRingPos[1]) * 0.5, 0], halfA: 6.5, halfB: 10.8, exponent: 2.4 },
      { posMm: kpRingPos, halfA: 5.5, halfB: 9.5, exponent: 2.2 },
    ],
  };

  // Bore through kingpin ring so kingpin & bushing shoulders seat cleanly
  const kingpinHole: CsgNodeSpec = {
    op: 'cylinder',
    radius: 6.2,
    height: 16.0,
    radialSegments: 20,
    rotateDeg: [0, 0, dir * -20],
    translateMm: kpRingPos,
  };

  return {
    op: 'subtract',
    children: [
      {
        op: 'union',
        children: [axleBeam, pivotArm, kingpinRing, kingpinBridge],
      },
      kingpinHole,
    ],
  };
}

function buildTruckBushingsCsg(xCenter: number, dir: 1 | -1): CsgNodeSpec {
  // Boardside barrel bushing (Ø24 mm × 13.5 mm) between baseplate cup washer and hanger ring
  const barrelPos = kingpinPoint(xCenter, dir, 17.0);
  const barrel: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 32,
    lathePoints: [
      [5.2, -6.75],
      [11.4, -6.75],
      [12.0, -5.8],
      [12.0, 5.8],
      [11.4, 6.75],
      [5.2, 6.75],
    ],
    rotateDeg: [0, 0, dir * -20],
    translateMm: barrelPos,
  };

  // Roadside cone bushing (Ø22.5 mm -> Ø16.8 mm × 10.5 mm) between hanger ring and top washer
  const conePos = kingpinPoint(xCenter, dir, 36.2);
  const cone: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 32,
    lathePoints: [
      [5.2, -5.25],
      [8.4, -5.25],
      [11.2, 4.6],
      [10.8, 5.25],
      [5.2, 5.25],
    ],
    rotateDeg: [0, 0, dir * -20],
    translateMm: conePos,
  };

  return {
    op: 'union',
    children: [barrel, cone],
  };
}

function buildTruckKingpinAndAxleHardwareCsg(xCenter: number, dir: 1 | -1): CsgNodeSpec {
  const axleX = xCenter + dir * 2.0;

  // Kingpin bolt shaft (Ø9.5 mm) along inclined 20° axis
  const kpShaftPos = kingpinPoint(xCenter, dir, 24.5);
  const kpShaft: CsgNodeSpec = {
    op: 'cylinder',
    radius: 4.75,
    height: 46.0,
    radialSegments: 20,
    rotateDeg: [0, 0, dir * -20],
    translateMm: kpShaftPos,
  };

  // Boardside chrome cup washer (above barrel bushing)
  const botWasherPos = kingpinPoint(xCenter, dir, 9.6);
  const botWasher: CsgNodeSpec = {
    op: 'cylinder',
    radius: 12.8,
    height: 1.8,
    radialSegments: 28,
    rotateDeg: [0, 0, dir * -20],
    translateMm: botWasherPos,
  };

  // Roadside chrome cup washer (below cone bushing)
  const topWasherPos = kingpinPoint(xCenter, dir, 42.2);
  const topWasher: CsgNodeSpec = {
    op: 'cylinder',
    radius: 10.2,
    height: 1.8,
    radialSegments: 28,
    rotateDeg: [0, 0, dir * -20],
    translateMm: topWasherPos,
  };

  // Kingpin hex locknut (14 mm AF)
  const kpNutPos = kingpinPoint(xCenter, dir, 46.2);
  const kpNut: CsgNodeSpec = {
    op: 'cylinder',
    radius: 7.8,
    height: 6.4,
    radialSegments: 6,
    rotateDeg: [0, 0, dir * -20],
    translateMm: kpNutPos,
  };

  // Hardened steel Ø8 mm axle shaft spanning full wheel track
  const axleShaft: CsgNodeSpec = {
    op: 'cylinder',
    radius: 4.0,
    height: 164.0,
    radialSegments: 20,
    rotateDeg: [90, 0, 0],
    translateMm: [axleX, AXLE_Y, 0],
  };

  // Inner & outer speed rings + outer hex axle locknuts on both +Z and -Z sides
  const sideHardware: CsgNodeSpec[] = [];
  for (const s of [-1, 1] as const) {
    // Inner speed ring (between hanger face Z = 37 and wheel inner bearing Z = 38)
    sideHardware.push({
      op: 'cylinder',
      radius: 6.0,
      height: 1.0,
      radialSegments: 20,
      rotateDeg: [90, 0, 0],
      translateMm: [axleX, AXLE_Y, s * 37.5],
    });
    // Outer speed ring (seated against outer bearing inner race at Z = 74.5)
    sideHardware.push({
      op: 'cylinder',
      radius: 6.0,
      height: 1.0,
      radialSegments: 20,
      rotateDeg: [90, 0, 0],
      translateMm: [axleX, AXLE_Y, s * 74.0],
    });
    // Outer chromed hex axle locknut (seated cleanly inside the wheel hub recess)
    sideHardware.push({
      op: 'cylinder',
      radius: 6.9,
      height: 5.8,
      radialSegments: 6,
      rotateDeg: [90, 0, 0],
      translateMm: [axleX, AXLE_Y, s * 77.4],
    });
  }

  return {
    op: 'union',
    children: [kpShaft, botWasher, topWasher, kpNut, axleShaft, ...sideHardware],
  };
}

// ============================================================================
// 4. WIDE CREAM CRUISER WHEELS (Ø58 mm × 45 mm) & ABEC-7 BEARINGS
// ============================================================================

/**
 * Builds one revolved Ø58 mm × 45 mm cream urethane cruiser wheel centered at local origin
 * with rotational axis along Z. `side`: +1 for +Z wheel (recessed hub faces +Z), -1 for -Z wheel.
 */
function buildCruiserWheelCsg(side: 1 | -1): CsgNodeSpec {
  const halfW = WHEEL_WIDTH * 0.5; // 22.5 mm
  // Lathe profile in (radius, yLocal) where yLocal = +halfW is the OUTER sidewall face
  // and yLocal = -halfW is the INNER sidewall face.
  const lathePoints: [number, number][] = [
    // Inner bearing seat & inner lip (yLocal = -22.5 .. -18.5)
    [11.0, -halfW + 7.2],
    [11.0, -halfW + 0.5],
    [14.2, -halfW],
    [25.6, -halfW],
    [27.4, -halfW + 0.9],
    [28.5, -halfW + 2.4],
    [WHEEL_RADIUS, -halfW + 4.4],
    // Flat wide cruiser contact patch tread (R = 29.0 mm)
    [WHEEL_RADIUS, halfW - 4.4],
    // Outer softly radiused cruiser lip
    [28.5, halfW - 2.4],
    [27.4, halfW - 0.9],
    [25.6, halfW],
    // Flat outer sidewall ring (R = 14.5 .. 25.6 mm) carrying 'BANWOOD · BANWOOD ·' ring print
    [14.6, halfW],
    // Crisp beveled conical outer hub recess down to outer bearing seat
    [13.4, halfW - 1.2],
    [11.6, halfW - 8.2],
    [11.0, halfW - 9.0],
    // Central bearing spacer step (R = 7.4 mm bore between inner & outer bearings)
    [11.0, halfW - 15.8],
    [7.4, halfW - 15.8],
    [7.4, -halfW + 7.2],
  ];

  // revolve axis is local +Y -> rotate +90° around X maps +Y -> +Z (outer face at +Z)
  // rotate -90° around X maps +Y -> -Z (outer face at -Z)
  return {
    op: 'revolve',
    radialSegments: 48,
    lathePoints,
    rotateDeg: [side > 0 ? 90 : -90, 0, 0],
  };
}

/**
 * Builds the chrome steel outer & inner races for the outer + inner ABEC-7 608 bearings of one wheel.
 */
function buildWheelBearingRacesCsg(side: 1 | -1): CsgNodeSpec {
  const halfW = WHEEL_WIDTH * 0.5; // 22.5 mm
  // Outer bearing sits from yLocal = +halfW - 15.8 to +halfW - 8.8 (center = +halfW - 12.3 = +10.2 mm)
  // Inner bearing sits from yLocal = -halfW + 0.4 to -halfW + 7.4 (center = -halfW + 3.9 = -18.6 mm)
  const makeRaceSet = (zLocal: number): CsgNodeSpec => ({
    op: 'union',
    children: [
      // Outer bearing steel race (R = 9.4 .. 11.0 mm)
      {
        op: 'revolve',
        radialSegments: 32,
        lathePoints: [
          [9.4, -3.4],
          [11.0, -3.4],
          [11.0, 3.4],
          [9.4, 3.4],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [0, 0, zLocal],
      },
      // Inner bearing steel race (R = 4.05 .. 5.8 mm)
      {
        op: 'revolve',
        radialSegments: 32,
        lathePoints: [
          [4.05, -3.4],
          [5.8, -3.4],
          [5.8, 3.4],
          [4.05, 3.4],
        ],
        rotateDeg: [90, 0, 0],
        translateMm: [0, 0, zLocal],
      },
    ],
  });

  return {
    op: 'union',
    children: [
      makeRaceSet(side * (halfW - 12.3)),
      makeRaceSet(side * (-halfW + 3.9)),
    ],
  };
}

/**
 * Builds the matte-black rubber ABEC-7 bearing shields visible inside the outer wheel hub recess.
 */
function buildWheelBearingShieldsCsg(side: 1 | -1): CsgNodeSpec {
  const halfW = WHEEL_WIDTH * 0.5;
  const makeShield = (zLocal: number): CsgNodeSpec => ({
    op: 'revolve',
    radialSegments: 32,
    lathePoints: [
      [5.8, -2.8],
      [9.4, -2.8],
      [9.4, 2.8],
      [5.8, 2.8],
    ],
    rotateDeg: [90, 0, 0],
    translateMm: [0, 0, zLocal],
  });

  return {
    op: 'union',
    children: [
      makeShield(side * (halfW - 12.3)),
      makeShield(side * (-halfW + 3.9)),
    ],
  };
}

// ============================================================================
// ASSEMBLE COMPLETE BLUEPRINT PARTS
// ============================================================================

function buildTruckParts(prefix: 'front' | 'rear', xCenter: number, dir: 1 | -1): BlueprintPart[] {
  const label = prefix === 'front' ? 'Front' : 'Rear';
  const group = `${label} Truck Assembly`;
  const axleX = xCenter + dir * 2.0;

  const truckParts: BlueprintPart[] = [
    {
      id: `${prefix}-truck-baseplate`,
      name: `${label} 3.25" Cast Aluminum Baseplate`,
      group,
      role: 'primary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildTruckBaseplateCsg(xCenter, dir),
      },
      material: MAT_CAST_ALUMINUM_TRUCK,
      explodeOffsetMm: [dir * 12, -18, 0],
      toleranceMm: 0.15,
    },
    {
      id: `${prefix}-truck-pivot-cup`,
      name: `${label} Urethane Pivot Cup`,
      group,
      role: 'detail',
      positionMm: [xCenter + dir * 22.4, 65.5, 0],
      rotationDeg: [0, 0, dir * -26],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'revolve',
          radialSegments: 24,
          lathePoints: [
            [4.55, -5.0],
            [6.55, -5.0],
            [6.55, 5.0],
            [0.0, 5.0],
            [0.0, 3.2],
            [4.55, 3.2],
          ],
        },
      },
      material: MAT_PIVOT_CUP,
      explodeOffsetMm: [dir * 16, -24, 0],
      toleranceMm: 0.1,
    },
    {
      id: `${prefix}-truck-hanger`,
      name: `${label} Cast Aluminum Hanger`,
      group,
      role: 'primary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildTruckHangerCsg(xCenter, dir),
      },
      material: MAT_CAST_ALUMINUM_TRUCK,
      explodeOffsetMm: [dir * 18, -36, 0],
      toleranceMm: 0.15,
    },
    {
      id: `${prefix}-truck-bushings`,
      name: `${label} 90A Cream Barrel & Cone Bushings`,
      group,
      role: 'secondary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildTruckBushingsCsg(xCenter, dir),
      },
      material: MAT_CREAM_BUSHING,
      explodeOffsetMm: [dir * 8, -32, 0],
      toleranceMm: 0.1,
    },
    {
      id: `${prefix}-truck-kingpin-axle`,
      name: `${label} Steel Kingpin, Washers, Axle & Locknuts`,
      group,
      role: 'secondary',
      fitClass: 'fastener',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildTruckKingpinAndAxleHardwareCsg(xCenter, dir),
      },
      material: MAT_POLISHED_STEEL,
      explodeOffsetMm: [dir * 18, -42, 0],
      toleranceMm: 0.1,
    },
    {
      id: `${prefix}-deck-bolts`,
      name: `${label} 4× Black Countersunk Phillips Bolts & Nuts`,
      group: 'Mounting Hardware',
      role: 'detail',
      fitClass: 'fastener',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: buildDeckBoltsSetCsg(xCenter),
      },
      material: MAT_BLACK_HARDWARE,
      explodeOffsetMm: [0, 28, 0],
      toleranceMm: 0.1,
    },
  ];

  // Add Left (-Z) and Right (+Z) Cruiser Wheels + ABEC-7 Bearings
  for (const side of [1, -1] as const) {
    const sideKey = side > 0 ? 'right' : 'left';
    const sideLabel = side > 0 ? 'Right' : 'Left';
    const wz = side * WHEEL_CENTER_Z;

    truckParts.push(
      {
        id: `${prefix}-${sideKey}-wheel`,
        name: `${label} ${sideLabel} Ø58×45 mm Cream Cruiser Wheel`,
        group: 'Cruiser Wheels & Bearings',
        role: 'primary',
        anchorKind: 'floor',
        positionMm: [axleX, AXLE_Y, wz],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: buildCruiserWheelCsg(side),
        },
        material: MAT_CREAM_WHEEL,
        explodeOffsetMm: [dir * 18, -36, side * 42],
        toleranceMm: 0.15,
      },
      {
        id: `${prefix}-${sideKey}-bearing-races`,
        name: `${label} ${sideLabel} ABEC-7 Bearing Steel Races`,
        group: 'Cruiser Wheels & Bearings',
        role: 'detail',
        fitClass: 'bearing',
        positionMm: [axleX, AXLE_Y, wz],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: buildWheelBearingRacesCsg(side),
        },
        material: MAT_POLISHED_STEEL,
        explodeOffsetMm: [dir * 18, -36, side * 52],
        toleranceMm: 0.08,
      },
      {
        id: `${prefix}-${sideKey}-bearing-shields`,
        name: `${label} ${sideLabel} ABEC-7 Black Bearing Seals`,
        group: 'Cruiser Wheels & Bearings',
        role: 'detail',
        fitClass: 'bearing',
        positionMm: [axleX, AXLE_Y, wz],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'csgSolid',
          csgRoot: buildWheelBearingShieldsCsg(side),
        },
        material: MAT_BEARING_SEAL,
        explodeOffsetMm: [dir * 18, -36, side * 56],
        toleranceMm: 0.08,
      }
    );
  }

  return truckParts;
}

const PARTS: BlueprintPart[] = [
  // 1. 8-Ply Laminated Canadian Maple Deck (3 precision-mated curved ply layers)
  {
    id: 'deck-maple-top-veneer',
    name: 'Canadian Maple Deck — Top Natural Veneer',
    group: '8-Ply Maple Deck',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildDeckPlyLayerCsg(7.5, 10.5, 1.3),
    },
    material: MAT_MAPLE_TOP_BOTTOM,
    explodeOffsetMm: [0, 18, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'deck-maple-core-plies',
    name: 'Canadian Maple Deck — Laminated Core Plies',
    group: '8-Ply Maple Deck',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildDeckPlyLayerCsg(3.0, 7.5, 0.0),
    },
    material: MAT_MAPLE_CORE_PLY,
    explodeOffsetMm: [0, 10, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'deck-maple-bottom-veneer',
    name: 'Canadian Maple Deck — Bottom Natural Veneer',
    group: '8-Ply Maple Deck',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildDeckPlyLayerCsg(0.0, 3.0, 1.3),
    },
    material: MAT_MAPLE_TOP_BOTTOM,
    explodeOffsetMm: [0, 2, 0],
    toleranceMm: 0.15,
  },

  // 2. Front & Rear Trucks, Mounting Bolts, Wide Cream Cruiser Wheels & ABEC-7 Bearings
  ...buildTruckParts('front', FRONT_TRUCK_X, 1),
  ...buildTruckParts('rear', REAR_TRUCK_X, -1),
];

// ============================================================================
// EXPORTED BLUEPRINT
// ============================================================================

export const BANWOOD_CRUISER_SKATEBOARD_BLUEPRINT: MeshBlueprint = {
  id: 'banwood-cruiser-skateboard',
  name: 'Banwood Classic Cruiser Skateboard',
  category: 'Consumer Products & Sports Equipment',
  summary:
    '100% watertight Manifold-3D CAD reconstruction of the Banwood Classic Cruiser Skateboard featuring an 8-ply laminated Canadian maple deck (519 × 170 mm) with smooth 11° rear kicktail, beveled rails, and engraved BANWOOD deck branding, 8 flush black countersunk Phillips bolts, dual 3.25" cast aluminum trucks with cream-taupe 90A barrel/cone bushings, and four Ø58 × 45 mm SHR80A cream urethane cruiser wheels with ABEC-7 black-sealed bearings and circular BANWOOD sidewall markings.',
  sourceImageUrl: '/assets/aistudio/banwood_cruiser_skateboard.png',
  isReferencePreset: true,
  envelopeMm: {
    width: 519,
    height: 109,
    depth: 170,
  },
  toleranceSpecMm: 0.15,
  symmetryPlane: 'Z',
  photoMatchCamera: {
    positionMm: [305, 295, 495],
    targetMm: [4, 48, 0],
    fov: 32,
  },
  decals: [
    // Subtle laser-engraved 'BANWOOD' wordmark across the maple deck behind the rear truck bolts
    {
      id: 'deck-banwood-engraved-logo',
      targetPartId: 'deck-maple-top-veneer',
      positionMm: [-82, DECK_TOP_Y + 0.1, 0],
      rotationDeg: [-90, 0, -90],
      sizeMm: [108, 30, 8],
      text: 'BANWOOD',
      colorHex: '#9d7952',
      opacity: 0.56,
      fontWeight: 'normal',
    },
    // Circular 'BANWOOD · BANWOOD ·' markings on all 4 outer cream wheel sidewalls
    {
      id: 'wheel-logo-front-right',
      targetPartId: 'front-right-wheel',
      positionMm: [FRONT_TRUCK_X + 2.0, AXLE_Y, WHEEL_OUTER_Z],
      rotationDeg: [0, 0, 0],
      sizeMm: [48, 48, 8],
      text: 'BANWOOD · BANWOOD · ',
      colorHex: '#2b2824',
      opacity: 0.88,
      fontWeight: 'normal',
      circularRing: true,
    },
    {
      id: 'wheel-logo-front-left',
      targetPartId: 'front-left-wheel',
      positionMm: [FRONT_TRUCK_X + 2.0, AXLE_Y, -WHEEL_OUTER_Z],
      rotationDeg: [0, 180, 0],
      sizeMm: [48, 48, 8],
      text: 'BANWOOD · BANWOOD · ',
      colorHex: '#2b2824',
      opacity: 0.88,
      fontWeight: 'normal',
      circularRing: true,
    },
    {
      id: 'wheel-logo-rear-right',
      targetPartId: 'rear-right-wheel',
      positionMm: [REAR_TRUCK_X - 2.0, AXLE_Y, WHEEL_OUTER_Z],
      rotationDeg: [0, 0, 0],
      sizeMm: [48, 48, 8],
      text: 'BANWOOD · BANWOOD · ',
      colorHex: '#2b2824',
      opacity: 0.88,
      fontWeight: 'normal',
      circularRing: true,
    },
    {
      id: 'wheel-logo-rear-left',
      targetPartId: 'rear-left-wheel',
      positionMm: [REAR_TRUCK_X - 2.0, AXLE_Y, -WHEEL_OUTER_Z],
      rotationDeg: [0, 180, 0],
      sizeMm: [48, 48, 8],
      text: 'BANWOOD · BANWOOD · ',
      colorHex: '#2b2824',
      opacity: 0.88,
      fontWeight: 'normal',
      circularRing: true,
    },
  ],
  parts: PARTS,
  reconstructedAt: new Date().toISOString(),
};
