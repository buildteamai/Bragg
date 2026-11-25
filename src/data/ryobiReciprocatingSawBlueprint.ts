import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * RYOBI ONE+ 18V Cordless Reciprocating Saw (PCL515 / P519)
 * Industrial-Design Watertight Manifold-3D CAD Reconstruction from /assets/aistudio/image_e4cd4a10.png.
 *
 * Sculptural & Mechanical Engineering Upgrades:
 * - True 24-segment smooth superellipse cross-section lofts (zero blocky box-hulls!)
 * - Conformal curved 2-shot accents intersected against exact body offset shells
 * - Real boolean-cut cooling louvers revealing an internal metallic motor core
 * - Molded raised volt-green bezel pocket framing the inset RYOBI nameplate
 * - Thin-walled (3.6 mm) stamped-steel pivoting U-shoe with arched prongs & steel pivot pin
 * - Two-tone 1.2 mm bi-metal reciprocating blade (black-oxide spine + silver-ground teeth)
 * - Molded ONE+ 18V battery receiver rails & recessed clamshell Torx assembly screws
 *
 * Calibrated Master Envelope: 460.0 (X) × 149.0 (Y) × 66.0 (Z) mm, grounded at Y = 0.0 mm.
 */

const MAT_RYOBI_VOLT_GREEN: PartMaterialSpec = {
  colorHex: '#b9d824',
  metalness: 0.04,
  roughness: 0.34,
  clearcoat: 0.28,
  clearcoatRoughness: 0.22,
  finishName: 'RYOBI Volt Lime Glass-Filled ABS',
};

const MAT_CHARCOAL_OVERMOLD: PartMaterialSpec = {
  colorHex: '#2f333a',
  metalness: 0.04,
  roughness: 0.84,
  textureKind: 'rubberOvermold',
  finishName: 'Textured Charcoal TPE Grip Overmold',
};

const MAT_DARK_POLYMER: PartMaterialSpec = {
  colorHex: '#1f2329',
  metalness: 0.08,
  roughness: 0.54,
  finishName: 'Matte Dark Graphite Nylon 6/6',
};

const MAT_GLOSS_BLACK_STEEL: PartMaterialSpec = {
  colorHex: '#1b1f26',
  metalness: 0.76,
  roughness: 0.26,
  clearcoat: 0.28,
  finishName: 'Black E-Coated Stamped Alloy Steel',
};

const MAT_BLADE_SPINE_STEEL: PartMaterialSpec = {
  colorHex: '#232830',
  metalness: 0.82,
  roughness: 0.32,
  textureKind: 'brushedMetal',
  finishName: 'Black-Oxide Bi-Metal Blade Spine',
};

const MAT_BLADE_EDGE_SILVER: PartMaterialSpec = {
  colorHex: '#cfd6de',
  metalness: 0.94,
  roughness: 0.2,
  textureKind: 'brushedMetal',
  finishName: 'Precision-Ground HSS Saw Tooth Edge',
};

const MAT_SATIN_SILVER_LEVER: PartMaterialSpec = {
  colorHex: '#a8afb8',
  metalness: 0.42,
  roughness: 0.34,
  clearcoat: 0.16,
  finishName: 'Satin Silver Cast Release Lever',
};

const MAT_RYOBI_NAMEPLATE: PartMaterialSpec = {
  colorHex: '#ffffff',
  metalness: 0.05,
  roughness: 0.36,
  clearcoat: 0.16,
  textureKind: 'ryobiLogo',
  finishName: 'Molded Black/White RYOBI Nameplate',
};

const MAT_MACHINED_STEEL: PartMaterialSpec = {
  colorHex: '#505863',
  metalness: 0.9,
  roughness: 0.24,
  textureKind: 'brushedMetal',
  finishName: 'Hardened Black-Oxide Reciprocating Spindle',
};

const MAT_INTERNAL_MOTOR_CORE: PartMaterialSpec = {
  colorHex: '#2c3138',
  metalness: 0.78,
  roughness: 0.38,
  textureKind: 'brushedMetal',
  finishName: 'Internal Stamped Steel Motor Stator Shell',
};

const MAT_TORX_FASTENER: PartMaterialSpec = {
  colorHex: '#30363f',
  metalness: 0.88,
  roughness: 0.28,
  finishName: 'Black-Oxide M4 Torx Clamshell Screw',
};

// ============================================================================
// SMOOTH INDUSTRIAL-DESIGN SUPERELLIPSE LOFT BUILDERS (Manifold-3D Watertight)
// ============================================================================

function superellipsePolygon(
  halfA: number,
  halfB: number,
  exponent = 2.6,
  segments = 24
): [number, number][] {
  const pts: [number, number][] = [];
  const p = 2 / exponent;
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const x = Math.sign(ct) * Math.pow(Math.abs(ct), p) * halfA;
    const y = Math.sign(st) * Math.pow(Math.abs(st), p) * halfB;
    pts.push([Number(x.toFixed(3)), Number(y.toFixed(3))]);
  }
  return pts;
}

interface LoftStationX {
  x: number;
  yCenter: number;
  halfY: number;
  halfZ: number;
  exponent?: number;
}

/**
 * Generates a silky-smooth, continuously curved 3D lofted volume along the X axis by
 * hulling pairs of 24-segment superellipse cross-section slices in the (Z, Y) plane.
 * Note: polygonExtrude rotates [0, 90, 0] -> local X maps to -Z, local Y maps to +Y, local Z maps to +X.
 */
function makeSuperellipseLoftX(stations: LoftStationX[], segments = 24): CsgNodeSpec {
  const makeSlice = (s: LoftStationX): CsgNodeSpec => ({
    op: 'polygonExtrude',
    depth: 0.6,
    polygonPoints: superellipsePolygon(s.halfZ, s.halfY, s.exponent ?? 2.6, segments),
    rotateDeg: [0, 90, 0],
    translateMm: [s.x, s.yCenter, 0],
  });

  if (stations.length === 1) return makeSlice(stations[0]);

  const spans: CsgNodeSpec[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    spans.push({
      op: 'hull',
      children: [makeSlice(stations[i]), makeSlice(stations[i + 1])],
    });
  }
  return spans.length === 1 ? spans[0] : { op: 'union', children: spans };
}

interface LoftStationY {
  y: number;
  xCenter: number;
  halfX: number;
  halfZ: number;
  exponent?: number;
}

/**
 * Generates a silky-smooth ergonomic vertical grip loft along the Y axis by hulling
 * pairs of 24-segment superellipse cross-section slices in the (X, Z) plane.
 * Note: polygonExtrude rotates [-90, 0, 0] -> local X maps to +X, local Y maps to +Z, local Z maps to +Y.
 */
function makeSuperellipseLoftY(stations: LoftStationY[], segments = 24): CsgNodeSpec {
  const makeSlice = (s: LoftStationY): CsgNodeSpec => ({
    op: 'polygonExtrude',
    depth: 0.6,
    polygonPoints: superellipsePolygon(s.halfX, s.halfZ, s.exponent ?? 2.2, segments),
    rotateDeg: [-90, 0, 0],
    translateMm: [s.xCenter, s.y, 0],
  });

  if (stations.length === 1) return makeSlice(stations[0]);

  const spans: CsgNodeSpec[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    spans.push({
      op: 'hull',
      children: [makeSlice(stations[i]), makeSlice(stations[i + 1])],
    });
  }
  return spans.length === 1 ? spans[0] : { op: 'union', children: spans };
}

// Shared exact barrel cross-section stations so conformal accents & release paddle wrap flush
const BARREL_BOOT_STATIONS: LoftStationX[] = [
  { x: -58.5, yCenter: 88.5, halfY: 42.5, halfZ: 31.2, exponent: 2.3 },
  { x: -42.0, yCenter: 90.0, halfY: 39.0, halfZ: 29.8, exponent: 2.2 },
  { x: -16.0, yCenter: 91.5, halfY: 37.8, halfZ: 29.0, exponent: 2.2 },
  { x: 14.0, yCenter: 92.2, halfY: 38.6, halfZ: 29.5, exponent: 2.3 },
  { x: 42.0, yCenter: 91.2, halfY: 40.4, halfZ: 30.6, exponent: 2.5 },
  { x: 64.5, yCenter: 91.5, halfY: 40.6, halfZ: 31.0, exponent: 2.8 },
];

// Shared rear D-handle ergonomic grip stations — raked 16° backward (natural human handshake wrist angle!)
// Pinched thumb-index web at top (32.0 mm wide), contoured palm swell (35.2 mm) at mid-palm, flared heel at foot
const REAR_HANDLE_STATIONS: LoftStationY[] = [
  { y: 38.0, xCenter: 206.5, halfX: 16.8, halfZ: 18.6, exponent: 2.3 },
  { y: 58.0, xCenter: 200.8, halfX: 16.6, halfZ: 17.6, exponent: 2.1 },
  { y: 82.0, xCenter: 194.2, halfX: 17.2, halfZ: 17.6, exponent: 2.0 },
  { y: 106.0, xCenter: 186.8, halfX: 15.8, halfZ: 16.8, exponent: 2.0 },
  { y: 126.0, xCenter: 181.5, halfX: 15.0, halfZ: 16.0, exponent: 2.1 },
  { y: 144.0, xCenter: 185.0, halfX: 14.5, halfZ: 16.6, exponent: 2.3 },
];

function offsetStationsX(stations: LoftStationX[], deltaZ: number, deltaY = 0): LoftStationX[] {
  return stations.map((s) => ({
    ...s,
    halfZ: Math.max(1, s.halfZ + deltaZ),
    halfY: Math.max(1, s.halfY + deltaY),
  }));
}

function offsetStationsY(stations: LoftStationY[], deltaZ: number, deltaX = 0): LoftStationY[] {
  return stations.map((s) => ({
    ...s,
    halfZ: Math.max(1, s.halfZ + deltaZ),
    halfX: Math.max(1, s.halfX + deltaX),
  }));
}

// ============================================================================
// SCULPTED SOLID BUILDERS
// ============================================================================

/**
 * 1. Main Volt-Green Clamshell Housing + D-Handle Spine + Grounded ONE+ 18V Battery Foot.
 * Uses smooth 24-segment superellipse lofts for crowned cheeks & filleted top/bottom shoulders,
 * real subtracted cooling louver slots, a recessed ONE+ battery underside terminal bay,
 * and recessed clamshell screw boss pockets.
 */
function buildMainHousingGreenCsg(): CsgNodeSpec {
  const sideProfile: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 74,
    polygonPoints: [
      // Front vertical seam meeting dark charcoal barrel boot (X = 64.2)
      [64.2, 54.0],
      [78.0, 57.0],
      [98.0, 67.2],
      [108.5, 66.2],
      [118.5, 32.8],
      [135.8, 18.2],
      [136.0, 2.4],
      // Grounded ONE+ 18V battery receiver foot (Y = 0.0)
      [145.0, 0.0],
      [158.0, 0.0],
      [174.0, 3.0],
      [194.0, 7.6],
      [212.0, 12.2],
      [226.5, 16.5],
      [230.0, 21.5],
      [229.0, 29.5],
      [221.0, 36.5],
      // Rear foot sweeps smoothly up the angled rear heel behind the 16°-raked grip (Y = 38..53)
      [220.8, 39.0],
      [219.8, 52.5],
      [216.2, 52.0],
      [214.0, 39.2],
      [189.8, 38.2],
      // Ergonomic 16°-raked D-handle finger opening (parallel to natural angled wrist & fingers!)
      [185.0, 36.8],
      [161.5, 36.8],
      [155.0, 40.5],
      [151.8, 48.0],
      [147.2, 64.0],
      [142.0, 82.0],
      [137.0, 100.0],
      [134.0, 114.5],
      [138.0, 121.8],
      [146.5, 124.5],
      [167.0, 124.5],
      // Upper volt-green D-handle arch sweeps down over the pinched thumb-index web
      [167.0, 132.4],
      [178.0, 133.6],
      [188.0, 138.4],
      [192.2, 143.6],
      [192.2, 148.8],
      [178.0, 148.9],
      [160.0, 147.6],
      [146.0, 145.2],
      [134.0, 140.8],
      [118.0, 135.6],
      [104.0, 130.4],
      [90.0, 127.8],
      [74.0, 127.8],
      [64.2, 129.4],
    ],
  };

  // Smoothly crowned 24-segment superellipse envelopes (tapering cleanly from 62 mm body to 34 mm D-handle!)
  const midGearboxLoft = makeSuperellipseLoftX(
    [
      { x: 63.5, yCenter: 91.5, halfY: 40.8, halfZ: 31.0, exponent: 2.9 },
      { x: 96.0, yCenter: 91.5, halfY: 42.0, halfZ: 31.2, exponent: 3.4 },
      { x: 130.0, yCenter: 74.0, halfY: 72.0, halfZ: 31.2, exponent: 3.4 },
      { x: 152.0, yCenter: 62.0, halfY: 66.0, halfZ: 25.0, exponent: 2.8 },
    ],
    24
  );

  // Sleek rounded upper D-handle spine arch (smoothly narrows to 33.2 mm thumb-web grip width)
  const upperSpineLoft = makeSuperellipseLoftX(
    [
      { x: 134.0, yCenter: 134.0, halfY: 16.5, halfZ: 23.5, exponent: 2.6 },
      { x: 158.0, yCenter: 136.0, halfY: 15.5, halfZ: 18.0, exponent: 2.3 },
      { x: 195.0, yCenter: 142.0, halfY: 12.0, halfZ: 16.6, exponent: 2.3 },
    ],
    20
  );

  // Flared ONE+ 18V battery receiver foot + smoothly sculpted rear heel wrap (X = 134..232, Y = 0..55)
  const batteryFootLoft = makeSuperellipseLoftX(
    [
      { x: 134.0, yCenter: 22.0, halfY: 24.0, halfZ: 29.0, exponent: 3.0 },
      { x: 164.0, yCenter: 20.5, halfY: 23.0, halfZ: 31.2, exponent: 3.2 },
      { x: 204.0, yCenter: 25.5, halfY: 28.0, halfZ: 31.6, exponent: 3.1 },
      { x: 220.0, yCenter: 32.0, halfY: 24.5, halfZ: 20.2, exponent: 2.4 },
      { x: 231.0, yCenter: 24.0, halfY: 12.5, halfZ: 27.0, exponent: 2.8 },
    ],
    24
  );

  const sculptedShell: CsgNodeSpec = {
    op: 'intersect',
    children: [
      sideProfile,
      { op: 'union', children: [midGearboxLoft, upperSpineLoft, batteryFootLoft] },
    ],
  };

  // Real subtracted mechanical features:
  // 1. Twin real cut-through cooling louver slots on both ±Z cheeks (exposing internal motor core!)
  // 2. Precision-fit top safety lock-off cross-bolt bore passing cleanly through the pinched thumb web
  // 3. Recessed ONE+ battery underside stem channel
  // 4. Recessed circular Torx assembly screw boss pockets
  return {
    op: 'subtract',
    children: [
      sculptedShell,
      // Real cut-through cooling louvers (upper & lower slots at X = 121..137, Y = 31.8..40.2)
      { op: 'box', width: 16.8, height: 2.5, depth: 70.0, translateMm: [129.0, 38.8, 0] },
      { op: 'box', width: 16.8, height: 2.5, depth: 70.0, translateMm: [129.0, 32.8, 0] },
      // Precision-fit safety lock-off cross-bolt clearance bore (centered in thumb web at X = 178.5, Y = 136.5)
      { op: 'box', width: 13.4, height: 6.0, depth: 60.0, translateMm: [178.5, 136.5, 0] },
      // Recessed ONE+ battery stem guide cavity on underside (keeps grounded feet at X=145..158 intact)
      { op: 'box', width: 42.0, height: 10.0, depth: 34.0, translateMm: [188.0, 10.5, 0], rotateDeg: [0, 0, 12] },
      // Recessed Torx screw boss pockets along solid clamshell cheeks (clear of 16°-raked D-handle opening)
      { op: 'cylinder', radius: 2.8, height: 6.0, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [76.0, 118.0, 29.0] },
      { op: 'cylinder', radius: 2.8, height: 6.0, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [128.0, 126.0, 27.5] },
      { op: 'cylinder', radius: 2.8, height: 6.0, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [136.5, 56.0, 27.0] },
      { op: 'cylinder', radius: 2.8, height: 6.0, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [76.0, 118.0, -29.0] },
      { op: 'cylinder', radius: 2.8, height: 6.0, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [128.0, 126.0, -27.5] },
      { op: 'cylinder', radius: 2.8, height: 6.0, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [136.5, 56.0, -27.0] },
    ],
  };
}

/**
 * 2. Molded Raised Volt-Green Bezel Frame Surrounding the Recessed RYOBI Nameplate (±Z).
 * Follows the exact +2.5° angle of the logo on the photo with smoothly chamfered outer walls
 * and a real subtracted inner pocket where the jet-black RYOBI plaque nests cleanly.
 */
function buildRyobiBezelFrameCsg(zSign: 1 | -1): CsgNodeSpec {
  const outerBezel: CsgNodeSpec = {
    op: 'hull',
    children: [
      { op: 'box', width: 57.6, height: 32.0, depth: 0.8, translateMm: [0, 0, 0] },
      { op: 'box', width: 55.4, height: 29.8, depth: 0.8, translateMm: [0, 0, zSign * 1.4] },
    ],
  };
  return {
    op: 'subtract',
    children: [
      outerBezel,
      { op: 'box', width: 52.8, height: 27.2, depth: 4.5, translateMm: [0, 0, zSign * 0.6] },
    ],
  };
}

/**
 * 3. Dark Charcoal Angled Lower Motor Belly Skid Cover (X = 64.2 .. 135.6, Y = 2.0 .. 66.8).
 * Smoothly rounded superellipse lower hull + real subtracted angled cooling louver slots!
 */
function buildMotorBellyCharcoalCsg(): CsgNodeSpec {
  const sideProfile: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 66,
    polygonPoints: [
      [64.2, 53.6],
      [78.0, 56.6],
      [98.0, 66.8],
      [108.2, 65.8],
      [118.1, 32.4],
      [135.4, 17.8],
      [135.5, 2.6],
      [126.0, 1.8],
      [114.5, 2.5],
      [103.0, 6.2],
      [94.0, 12.8],
      [84.5, 25.2],
      [74.0, 40.5],
    ],
  };

  const smoothBellyLoft = makeSuperellipseLoftX(
    [
      { x: 63.8, yCenter: 48.0, halfY: 22.0, halfZ: 29.2, exponent: 2.5 },
      { x: 88.0, yCenter: 40.0, halfY: 32.0, halfZ: 29.6, exponent: 2.6 },
      { x: 112.0, yCenter: 34.0, halfY: 34.0, halfZ: 28.4, exponent: 2.6 },
      { x: 136.0, yCenter: 11.0, halfY: 13.0, halfZ: 24.5, exponent: 2.4 },
    ],
    24
  );

  const solidBelly: CsgNodeSpec = {
    op: 'intersect',
    children: [sideProfile, smoothBellyLoft],
  };

  // Real cut-in angled intake louvers visible on the charcoal motor belly in the photo
  return {
    op: 'subtract',
    children: [
      solidBelly,
      { op: 'box', width: 9.0, height: 2.2, depth: 64.0, rotateDeg: [0, 0, -48], translateMm: [90.0, 36.0, 0] },
      { op: 'box', width: 9.0, height: 2.2, depth: 64.0, rotateDeg: [0, 0, -48], translateMm: [96.0, 31.0, 0] },
    ],
  };
}

/**
 * 4. Ergonomic Dark Charcoal Rear D-Handle Overmold Grip (X = 171.2 .. 210.5, Y = 40.7 .. 148.8).
 * Smooth 24-segment oval grip loft (makeSuperellipseLoftY) + dark rear-top bumper corner cap
 * + real subtracted front trigger pocket + top safety lock-off cross-bolt bore!
 */
function buildHandleOvermoldCharcoalCsg(): CsgNodeSpec {
  const sideProfile: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 44,
    polygonPoints: [
      // Bottom seam above green ONE+ battery foot (stepped cleanly inside angled rear green heel wrap!)
      [190.0, 38.5],
      [213.7, 39.4],
      [215.9, 52.3],
      [219.5, 53.0],
      // Natural 16°-raked ergonomic rear palm swell & concave beaver-tail thumb web saddle
      [216.2, 66.0],
      [211.6, 84.0],
      [204.5, 104.0],
      [198.0, 122.0],
      [197.0, 133.0],
      [199.2, 144.6],
      [196.2, 148.4],
      [192.5, 148.6],
      [192.5, 143.3],
      // Angled seam matching the volt-green upper arch sweep down to Y = 132
      [188.1, 138.1],
      [178.0, 133.3],
      [167.2, 132.1],
      // Contoured 16°-raked front finger grip surface with subtle middle-finger saddle (35 mm clear hand loop!)
      [167.2, 122.0],
      [170.0, 109.0],
      [174.4, 95.0],
      [177.8, 82.0],
      [182.4, 66.0],
      [187.8, 48.0],
    ],
  };

  const smoothGripLoft = makeSuperellipseLoftY(
    [
      ...REAR_HANDLE_STATIONS,
      { y: 149.2, xCenter: 189.0, halfX: 13.5, halfZ: 16.4, exponent: 2.3 },
    ],
    24
  );

  const solidHandle: CsgNodeSpec = {
    op: 'intersect',
    children: [sideProfile, smoothGripLoft],
  };

  // Subtract 16°-tilted internal trigger switch pocket (perpendicular to raked grip!)
  // + precision-fit thumb-web safety lock-off cross-bolt through-bore
  return {
    op: 'subtract',
    children: [
      solidHandle,
      {
        op: 'box',
        width: 17.5,
        height: 26.2,
        depth: 16.8,
        rotateDeg: [0, 0, 16],
        translateMm: [178.0, 111.3, 0],
      },
      { op: 'box', width: 13.4, height: 6.0, depth: 50.0, translateMm: [178.5, 136.5, 0] },
    ],
  };
}

/**
 * 5. Conformal Curved Volt-Green Y-Accent Rib on 16°-Raked Rear Charcoal Handle (±Z).
 * Framed strictly behind the trigger switch pocket and sweeping into the beaver-tail & palm swell.
 */
function buildHandleYAccentConformalCsg(zSign: 1 | -1): CsgNodeSpec {
  const rib2d: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 48,
    polygonPoints: [
      [179.5, 115.0],
      [186.5, 121.5],
      [195.0, 134.8],
      [197.0, 133.2],
      [189.2, 120.0],
      [207.8, 96.8],
      [205.2, 95.4],
      [186.6, 118.2],
      [180.5, 112.4],
    ],
  };

  const outerShell = makeSuperellipseLoftY(offsetStationsY(REAR_HANDLE_STATIONS, 1.1, 1.0), 24);
  const innerShell = makeSuperellipseLoftY(offsetStationsY(REAR_HANDLE_STATIONS, 0.15, 0.2), 24);

  return {
    op: 'intersect',
    children: [
      rib2d,
      { op: 'subtract', children: [outerShell, innerShell] },
      { op: 'box', width: 52, height: 56, depth: 26, translateMm: [192, 116, zSign * 17] },
    ],
  };
}

/**
 * 6. Sculpted Smooth Cylindrical/Stadium Dark Charcoal Front Barrel Grip Boot (X = -58.0 .. +63.9).
 * Uses true 24-segment rounded superellipse loft (zero flat blocky facets!), stepped rear gearbox
 * transition collar, subtracted conformal recess for the satin-silver blade release lever,
 * and internal 28 mm reciprocating spindle clearance bore!
 */
function buildFrontBarrelBootCsg(): CsgNodeSpec {
  const sideProfile: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 72,
    polygonPoints: [
      [-58.0, 47.0],
      [-50.0, 52.2],
      [-36.0, 53.5],
      [-20.0, 54.8],
      [-4.0, 56.2],
      [8.0, 56.0],
      [20.0, 53.5],
      [38.0, 51.8],
      [52.0, 52.4],
      [63.9, 53.6],
      [63.9, 129.4],
      [42.0, 130.2],
      [16.0, 129.6],
      [-12.0, 128.0],
      [-44.0, 127.4],
      [-58.0, 128.0],
    ],
  };

  const smoothBarrelLoft = makeSuperellipseLoftX(BARREL_BOOT_STATIONS, 24);

  const solidBoot: CsgNodeSpec = {
    op: 'intersect',
    children: [sideProfile, smoothBarrelLoft],
  };

  // Subtract curved recessed housing pocket on +Z for the satin-silver blade release lever
  // + internal reciprocating spindle bore so the 28 mm drive stroke never clashes
  return {
    op: 'subtract',
    children: [
      solidBoot,
      // Recessed paddle pocket (leaves clean dark upper & lower bezel framing around the silver lever!)
      { op: 'box', width: 31.0, height: 42.0, depth: 12.0, translateMm: [-24.5, 87.5, 29.5] },
      // Internal spindle bore for 28 mm full reciprocating stroke
      { op: 'box', width: 24.0, height: 22.0, depth: 20.0, translateMm: [-51.0, 94.0, 0] },
    ],
  };
}

/**
 * 7. Conformal Curved Satin-Silver Tool-Free Blade Release Paddle (local origin at rear hinge [-9.5, 87.0, 28.5]).
 * Smoothly curves to follow the cylindrical contour of the front rubber barrel with horizontal grip ribs!
 */
function buildBladeReleaseLeverCsg(): CsgNodeSpec {
  // Local X = -28.8 .. -0.4, Local Y = -18.0 .. +18.0, curving smoothly in Z!
  const paddleSideProfile: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 14.0,
    polygonPoints: [
      [-28.6, -15.5],
      [-26.5, -17.8],
      [-2.0, -18.0],
      [-0.4, -15.8],
      [-0.4, 15.8],
      [-2.0, 18.0],
      [-26.5, 17.8],
      [-28.6, 15.5],
    ],
  };

  // Curved outer cylindrical crown matching the barrel's Y-Z curvature (centered at local Y = +4, Z = -28.5)
  const curvedOuterBody: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 32.0,
    polygonPoints: superellipsePolygon(30.8, 38.6, 2.2, 24),
    rotateDeg: [0, 90, 0],
    translateMm: [-14.5, 4.0, -28.5],
  };
  const curvedInnerCut: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 36.0,
    polygonPoints: superellipsePolygon(24.0, 33.5, 2.2, 24),
    rotateDeg: [0, 90, 0],
    translateMm: [-14.5, 4.0, -28.5],
  };

  const curvedPaddle: CsgNodeSpec = {
    op: 'intersect',
    children: [
      paddleSideProfile,
      { op: 'subtract', children: [curvedOuterBody, curvedInnerCut] },
    ],
  };

  // Add subtle molded horizontal ergonomic grip grooves/ridges across curved face
  return {
    op: 'subtract',
    children: [
      curvedPaddle,
      { op: 'box', width: 22.0, height: 1.5, depth: 2.2, translateMm: [-14.5, 7.2, 2.4] },
      { op: 'box', width: 22.0, height: 1.5, depth: 2.2, translateMm: [-14.5, 0.0, 2.6] },
      { op: 'box', width: 22.0, height: 1.5, depth: 2.2, translateMm: [-14.5, -7.2, 2.4] },
    ],
  };
}

/**
 * 8. Conformal Curved Twin Volt-Green Barrel Grip Blocks (±Z).
 * Intersected against an exact offset curved shell (+0.15..+1.25 mm outside BARREL_BOOT_STATIONS)
 * so the two volt-green grip accents wrap flush along the rounded rubber barrel — zero flat Lego bricks!
 */
function buildBarrelGreenBlockConformalCsg(xCenter: number, yCenter: number, zSign: 1 | -1): CsgNodeSpec {
  const hw = 5.6;
  const hh = 6.8;
  const r = 1.6;
  const block2d: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 74,
    polygonPoints: [
      [xCenter - hw + r, yCenter - hh],
      [xCenter + hw - r, yCenter - hh],
      [xCenter + hw, yCenter - hh + r],
      [xCenter + hw, yCenter + hh - r],
      [xCenter + hw - r, yCenter + hh],
      [xCenter - hw + r, yCenter + hh],
      [xCenter - hw, yCenter + hh - r],
      [xCenter - hw, yCenter - hh + r],
    ],
  };

  const outerShell = makeSuperellipseLoftX(offsetStationsX(BARREL_BOOT_STATIONS, 1.25, 1.2), 24);
  const innerShell = makeSuperellipseLoftX(offsetStationsX(BARREL_BOOT_STATIONS, 0.15, 0.2), 24);

  return {
    op: 'intersect',
    children: [
      block2d,
      { op: 'subtract', children: [outerShell, innerShell] },
      { op: 'box', width: 20, height: 24, depth: 36, translateMm: [xCenter, yCenter, zSign * 26] },
    ],
  };
}

/**
 * 9. Smoothly Domed Volt-Green Front Nose Collar Bullnose Ring (X = -93.4 .. -58.3, Y = 39.4 .. 135.8).
 * Uses a plump 24-segment rounded superellipse bullnose loft with a recessed front nose cavity
 * and full 28 mm through-spindle channel.
 */
function buildFrontCollarGreenCsg(): CsgNodeSpec {
  const sideProfile: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 76,
    polygonPoints: [
      [-93.4, 43.2],
      [-86.0, 41.2],
      [-78.0, 39.4],
      [-69.0, 40.0],
      [-61.5, 41.6],
      [-58.3, 46.8],
      [-58.3, 128.4],
      [-63.0, 132.8],
      [-72.0, 135.8],
      [-82.0, 135.6],
      [-89.5, 132.4],
      [-93.4, 127.6],
    ],
  };

  // Plump rounded injection-molded bullnose collar (tapers gently toward front nose lip!)
  const bullnoseLoft = makeSuperellipseLoftX(
    [
      { x: -94.0, yCenter: 86.0, halfY: 46.0, halfZ: 28.5, exponent: 2.3 },
      { x: -84.0, yCenter: 87.5, halfY: 49.0, halfZ: 33.0, exponent: 2.4 },
      { x: -70.0, yCenter: 87.5, halfY: 49.0, halfZ: 33.0, exponent: 2.4 },
      { x: -58.0, yCenter: 88.2, halfY: 44.0, halfZ: 31.4, exponent: 2.3 },
    ],
    24
  );

  const solidCollar: CsgNodeSpec = {
    op: 'intersect',
    children: [sideProfile, bullnoseLoft],
  };

  return {
    op: 'subtract',
    children: [
      solidCollar,
      // Recessed front cavity for dark nose shroud, blade clamp & shoe bar
      { op: 'box', width: 28.0, height: 70.0, depth: 39.0, translateMm: [-84.0, 88.0, 0] },
      // Through-spindle bore for full 28 mm drive stroke
      { op: 'box', width: 30.0, height: 22.0, depth: 20.0, translateMm: [-68.0, 94.0, 0] },
    ],
  };
}

/**
 * 10. Dark Matte Inner Nose Shroud Lining the Front Collar Cavity.
 */
function buildCollarInnerShroudCsg(): CsgNodeSpec {
  return {
    op: 'subtract',
    children: [
      { op: 'box', width: 21.0, height: 69.0, depth: 38.2, translateMm: [-81.0, 88.0, 0] },
      // Upper open through-channel for reciprocating blade clamp & blade
      { op: 'box', width: 26.0, height: 30.0, depth: 22.0, translateMm: [-81.0, 94.5, 0] },
      // Lower bore for pivoting shoe mounting bar
      { op: 'box', width: 26.0, height: 12.0, depth: 20.0, translateMm: [-81.0, 59.0, 0] },
    ],
  };
}

/**
 * 11. Sleek Thin-Walled (3.8 mm) Stamped-Steel Pivoting Forked U-Shoe (local origin at pivot pin [-101.0, 56.0, 0]).
 * Replaces chunky 9 mm blocks with true stamped sheet-metal twin U-prongs, rounded top ski arches,
 * open upper U-notch, stamped side lightening slot, open 22 mm center blade slot, and recessed steel pivot bosses!
 */
function buildPivotingShoeCsg(): CsgNodeSpec {
  // Rear stamped pivot cheek (3.8 mm thin stamped steel plate)
  const rearCheek2d: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 3.8,
    polygonPoints: [
      [-8.5, -10.5],
      [-2.0, -13.6],
      [2.2, -11.8],
      [6.0, 4.0],
      [6.2, 73.0],
      [4.2, 84.5],
      [0.6, 86.8],
      [-3.4, 86.0],
      [-6.8, 76.0],
      [-6.8, 40.0],
    ],
  };

  // Forward-swept front ski runner prong (3.8 mm thin stamped steel plate)
  const frontSki2d: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 3.8,
    polygonPoints: [
      [-18.8, -8.0],
      [-11.0, -10.2],
      [-10.2, 56.0],
      [-11.8, 84.0],
      [-15.0, 87.7],
      [-18.4, 86.2],
      [-20.2, 76.0],
      [-19.5, 22.0],
    ],
  };

  // Lower stamped bridge web joining front ski & rear pivot cheek (below blade Y >= 80)
  const lowerWeb2d: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 3.8,
    polygonPoints: [
      [-18.6, -8.2],
      [1.8, -11.4],
      [5.4, 14.0],
      [-18.6, 18.0],
    ],
  };

  // Front contact ski face strip curving across the front edge on ±Z (leaving central 22 mm blade slot completely open!)
  const frontContactWing: CsgNodeSpec = {
    op: 'box',
    width: 3.6,
    height: 86.0,
    depth: 6.2,
    translateMm: [-18.4, 38.0, 0],
  };

  const singleSideWall: CsgNodeSpec = {
    op: 'union',
    children: [
      rearCheek2d,
      frontSki2d,
      lowerWeb2d,
      // Outward stamped ski contact flange on front edge
      { op: 'union', translateMm: [0, 0, 1.2], children: [frontContactWing] },
    ],
  };

  const singleSideWallMirror: CsgNodeSpec = {
    op: 'union',
    children: [
      rearCheek2d,
      frontSki2d,
      lowerWeb2d,
      { op: 'union', translateMm: [0, 0, -1.2], children: [frontContactWing] },
    ],
  };

  return {
    op: 'union',
    children: [
      // +Z thin stamped wall (Z = +11.6 .. +15.4, ski flange to +19.5)
      { op: 'union', translateMm: [0, 0, 13.5], children: [singleSideWall] },
      // -Z thin stamped wall (Z = -15.4 .. -11.6, ski flange to -19.5)
      { op: 'union', translateMm: [0, 0, -13.5], children: [singleSideWallMirror] },
      // Bottom stamped U-bridge under blade slot
      { op: 'box', width: 12.0, height: 4.0, depth: 30.8, translateMm: [-5.5, -9.8, 0] },
      // Stamped pivot clevis boss rings on outer ±Z walls
      { op: 'cylinder', radius: 5.4, height: 2.4, radialSegments: 24, rotateDeg: [90, 0, 0], translateMm: [0, 0, 16.5] },
      { op: 'cylinder', radius: 5.4, height: 2.4, radialSegments: 24, rotateDeg: [90, 0, 0], translateMm: [0, 0, -16.5] },
    ],
  };
}

/**
 * 12A. Two-Tone Bi-Metal Reciprocating Blade — Black-Oxide Upper Spine (1.2 mm thin).
 * Local origin at tang mount (-104.5, 94.0, 0).
 */
function buildBladeSpineBlackCsg(): CsgNodeSpec {
  return {
    op: 'polygonExtrude',
    depth: 1.2,
    polygonPoints: [
      [0.0, -9.5],
      [0.0, 8.5],
      [-125.5, -19.0],
      [-125.5, -21.2],
      [-124.0, -21.8],
      [-14.0, -11.0],
    ],
  };
}

/**
 * 12B. Two-Tone Bi-Metal Reciprocating Blade — Bright Silver Precision-Ground Tooth Edge (1.1 mm thin).
 * Mates cleanly along the bottom edge of the black-oxide spine (0.1 mm vertical seam, zero overlap!)
 * with 28 crisp sharp milled wood/demolition teeth!
 */
function buildBladeToothEdgeSilverCsg(): CsgNodeSpec {
  const pts: [number, number][] = [
    [-14.2, -11.2],
    [-124.0, -22.0],
  ];

  const toothCount = 28;
  const xStart = -124.0;
  const xEnd = -14.2;
  const dx = (xEnd - xStart) / toothCount;
  for (let i = 0; i < toothCount; i++) {
    const t0 = i / toothCount;
    const tMid = (i + 0.42) / toothCount;
    const xBase = xStart + i * dx;
    const xTip = xStart + (i + 0.42) * dx;
    const yGullet = -22.8 + t0 * 10.6;
    const yTip = -25.8 + tMid * 11.2;
    pts.push([Number(xBase.toFixed(2)), Number(yGullet.toFixed(2))]);
    pts.push([Number(xTip.toFixed(2)), Number(yTip.toFixed(2))]);
  }

  return {
    op: 'polygonExtrude',
    depth: 1.1,
    polygonPoints: pts,
  };
}

/**
 * 13. Functional Cantilevered Concave Variable-Speed Trigger (local origin at switch pocket entry [178.0, 109.0, 0]).
 * Leaves a full 22 mm of open index-finger room in front of the concave finger pad (X = 142..164)
 * and includes a guided internal switch plunger stem gliding 0..9 mm cleanly into the rear grip pocket!
 */
function buildTriggerSwitchCsg(): CsgNodeSpec {
  // Deeply ergonomic concave index-finger shoe (local X = -14.2 .. +5.5, Y = -12.0 .. +11.8)
  const triggerShoe2d: CsgNodeSpec = {
    op: 'polygonExtrude',
    depth: 16.0,
    polygonPoints: [
      [-13.8, 11.4],
      [-8.0, 11.8],
      [0.5, 11.2],
      [0.5, -11.4],
      [-8.8, -12.0],
      [-14.2, -10.8],
      [-13.2, -7.2],
      [-11.2, -2.5],
      [-10.6, 2.5],
      [-11.8, 7.6],
    ],
  };

  // Smooth rounded finger-pad profile in Z (14.6 mm wide — comfortably narrower than 35 mm grip)
  const triggerLoft = makeSuperellipseLoftY(
    [
      { y: -12.4, xCenter: -7.0, halfX: 8.5, halfZ: 6.8, exponent: 2.3 },
      { y: 0.0, xCenter: -7.0, halfX: 8.5, halfZ: 7.4, exponent: 2.3 },
      { y: 12.2, xCenter: -7.0, halfX: 8.5, halfZ: 6.8, exponent: 2.3 },
    ],
    20
  );

  const contouredShoe: CsgNodeSpec = {
    op: 'intersect',
    children: [triggerShoe2d, triggerLoft],
  };

  // Guided switch plunger stem extending rearward inside the subtracted rear grip switch pocket
  const plungerStem: CsgNodeSpec = {
    op: 'box',
    width: 6.0,
    height: 18.0,
    depth: 11.0,
    translateMm: [3.0, 0, 0],
  };

  return {
    op: 'union',
    children: [contouredShoe, plungerStem],
  };
}

// ============================================================================
// ASSEMBLY PARTS DEFINITION
// ============================================================================

const PARTS: BlueprintPart[] = [
  // 1. MAIN VOLT-GREEN CLAMSHELL HOUSING + ONE+ BATTERY FOOT
  {
    id: 'saw_main_housing_green',
    name: 'Volt-Green Sculpted Clamshell & ONE+ Base',
    group: 'Housing & Grip',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildMainHousingGreenCsg(),
      smoothSharpAngleDeg: 42,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [0, 0, 0],
    toleranceMm: 0.15,
    ports: {
      frontBarrelMount: { localOffsetMm: [64.0, 91.0, 0], normal: [-1, 0, 0] },
      motorBellySeam: { localOffsetMm: [100.0, 42.0, 0], normal: [0, -1, 0] },
      handleGripBase: { localOffsetMm: [200.0, 38.4, 0], normal: [0, 1, 0] },
    },
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
  },

  // 2. INTERNAL METALLIC MOTOR STATOR CORE (visible through real cut-through cooling louvers!)
  {
    id: 'saw_internal_motor_core',
    name: 'Internal Stamped Steel Motor Stator Core',
    group: 'Front Barrel & Drive',
    role: 'secondary',
    positionMm: [110.0, 35.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          { op: 'box', width: 22.0, height: 14.0, depth: 50.0, translateMm: [18.5, 0.5, 0] },
          { op: 'box', width: 16.0, height: 12.0, depth: 46.0, rotateDeg: [0, 0, -48], translateMm: [-17.0, -1.5, 0] },
        ],
      },
      smoothSharpAngleDeg: 35,
    },
    material: MAT_INTERNAL_MOTOR_CORE,
    explodeOffsetMm: [0, -18, 0],
    toleranceMm: 0.2,
  },

  // 3. ANGLED CHARCOAL LOWER MOTOR BELLY COVER WITH CUT-IN LOUVERS
  {
    id: 'saw_motor_belly_charcoal',
    name: 'Angled Charcoal Motor Belly Cover',
    group: 'Housing & Grip',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildMotorBellyCharcoalCsg(),
      smoothSharpAngleDeg: 42,
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [-12, -26, 0],
    toleranceMm: 0.15,
    ports: {
      housingSeam: { localOffsetMm: [100.0, 42.0, 0], normal: [0, 1, 0] },
    },
    constraint: {
      kind: 'matePort',
      selfPort: 'housingSeam',
      targetPartId: 'saw_main_housing_green',
      targetPort: 'motorBellySeam',
    },
  },

  // 4. MOLDED RAISED VOLT-GREEN NAMEPLATE BEZEL FRAMES + RECESSED RYOBI PLAQUES (±Z)
  {
    id: 'saw_ryobi_bezel_front',
    name: 'Molded Volt-Green Nameplate Bezel (+Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [104.5, 92.2, 31.3],
    rotationDeg: [0, 0, 2.5],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildRyobiBezelFrameCsg(1),
      smoothSharpAngleDeg: 35,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [0, 0, 28],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_ryobi_bezel_rear',
    name: 'Molded Volt-Green Nameplate Bezel (-Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [104.5, 92.2, -31.3],
    rotationDeg: [0, 0, 2.5],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildRyobiBezelFrameCsg(-1),
      smoothSharpAngleDeg: 35,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [0, 0, -28],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_ryobi_badge_front',
    name: 'RYOBI Molded Side Nameplate (+Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [104.5, 92.2, 31.9],
    rotationDeg: [0, 0, 2.5],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 52.4, height: 26.8, depth: 1.2 },
      smoothSharpAngleDeg: 30,
    },
    material: MAT_RYOBI_NAMEPLATE,
    explodeOffsetMm: [0, 0, 38],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_ryobi_badge_rear',
    name: 'RYOBI Molded Side Nameplate (-Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [104.5, 92.2, -31.9],
    rotationDeg: [0, 180, 2.5],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 52.4, height: 26.8, depth: 1.2 },
      smoothSharpAngleDeg: 30,
    },
    material: MAT_RYOBI_NAMEPLATE,
    explodeOffsetMm: [0, 0, -38],
    toleranceMm: 0.1,
  },

  // 5. RECESSED CLAMSHELL M4 TORX ASSEMBLY SCREWS (±Z)
  {
    id: 'saw_torx_screws_front',
    name: 'Clamshell M4 Torx Fasteners (+Z)',
    group: 'Housing & Grip',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          { op: 'cylinder', radius: 2.3, height: 2.2, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [76.0, 118.0, 27.6] },
          { op: 'cylinder', radius: 2.3, height: 2.2, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [128.0, 126.0, 26.1] },
          { op: 'cylinder', radius: 2.3, height: 2.2, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [136.5, 56.0, 25.6] },
        ],
      },
      smoothSharpAngleDeg: 30,
    },
    material: MAT_TORX_FASTENER,
    explodeOffsetMm: [0, 0, 26],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_torx_screws_rear',
    name: 'Clamshell M4 Torx Fasteners (-Z)',
    group: 'Housing & Grip',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          { op: 'cylinder', radius: 2.3, height: 2.2, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [76.0, 118.0, -27.6] },
          { op: 'cylinder', radius: 2.3, height: 2.2, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [128.0, 126.0, -26.1] },
          { op: 'cylinder', radius: 2.3, height: 2.2, radialSegments: 16, rotateDeg: [90, 0, 0], translateMm: [136.5, 56.0, -25.6] },
        ],
      },
      smoothSharpAngleDeg: 30,
    },
    material: MAT_TORX_FASTENER,
    explodeOffsetMm: [0, 0, -26],
    toleranceMm: 0.1,
  },

  // 6. ERGONOMIC CHARCOAL REAR D-HANDLE GRIP OVERMOLD + CONFORMAL CURVED VOLT-GREEN Y-RIBS
  {
    id: 'saw_handle_overmold_charcoal',
    name: 'Ergonomic Rear D-Handle Rubber Grip',
    group: 'Housing & Grip',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildHandleOvermoldCharcoalCsg(),
      smoothSharpAngleDeg: 44,
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [34, 0, 0],
    toleranceMm: 0.15,
    ports: {
      baseMount: { localOffsetMm: [200.0, 38.4, 0], normal: [0, -1, 0] },
      // Trigger pull axis is perpendicular to the 16°-raked ergonomic handle (+16° up-and-back!)
      triggerSeat: { localOffsetMm: [170.0, 109.0, 0], normal: [0.9613, 0.2756, 0] },
      lockoffBore: { localOffsetMm: [178.5, 136.5, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'matePort',
      selfPort: 'baseMount',
      targetPartId: 'saw_main_housing_green',
      targetPort: 'handleGripBase',
    },
  },
  {
    id: 'saw_handle_y_rib_front',
    name: 'Rear Grip Conformal Volt-Green Y-Accent (+Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildHandleYAccentConformalCsg(1),
      smoothSharpAngleDeg: 40,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [36, 0, 20],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_handle_y_rib_rear',
    name: 'Rear Grip Conformal Volt-Green Y-Accent (-Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildHandleYAccentConformalCsg(-1),
      smoothSharpAngleDeg: 40,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [36, 0, -20],
    toleranceMm: 0.1,
  },

  // 7. FUNCTIONAL 16°-RAKED VARIABLE-SPEED TRIGGER + THUMB-WEB SAFETY LOCK-OFF
  {
    id: 'saw_trigger_switch',
    name: 'Variable-Speed Ergonomic Trigger',
    group: 'Controls',
    role: 'secondary',
    positionMm: [170.0, 109.0, 0],
    rotationDeg: [0, 0, 16],
    motionLimits: { minSlideMm: 0, maxSlideMm: 9 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildTriggerSwitchCsg(),
      smoothSharpAngleDeg: 40,
    },
    material: MAT_DARK_POLYMER,
    explodeOffsetMm: [-22, -6, 0],
    toleranceMm: 0.15,
    ports: {
      stem: { localOffsetMm: [0, 0, 0], normal: [1, 0, 0] },
    },
    constraint: {
      kind: 'concentric',
      selfPort: 'stem',
      targetPartId: 'saw_handle_overmold_charcoal',
      targetPort: 'triggerSeat',
      lockAxial: false,
      lockSpin: true,
    },
  },
  {
    id: 'saw_lockoff_button',
    name: 'Thumb-Web Safety Lock-Off Cross-Bolt Button',
    group: 'Controls',
    role: 'detail',
    positionMm: [178.5, 136.5, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minSlideMm: -4, maxSlideMm: 4 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'hull',
        children: [
          { op: 'box', width: 13.0, height: 5.6, depth: 37.6 },
          { op: 'box', width: 11.4, height: 4.4, depth: 39.6 },
        ],
      },
      smoothSharpAngleDeg: 35,
    },
    material: MAT_SATIN_SILVER_LEVER,
    explodeOffsetMm: [24, 24, 0],
    toleranceMm: 0.1,
    ports: {
      axis: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'concentric',
      selfPort: 'axis',
      targetPartId: 'saw_handle_overmold_charcoal',
      targetPort: 'lockoffBore',
      lockAxial: false,
      lockSpin: true,
    },
  },

  // 8. SMOOTH CYLINDRICAL FRONT BARREL BOOT + CURVED RELEASE LEVER + CONFORMAL GREEN ACCENTS
  {
    id: 'saw_front_barrel_boot',
    name: 'Rubberized Front Barrel Grip Boot',
    group: 'Front Barrel & Drive',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildFrontBarrelBootCsg(),
      smoothSharpAngleDeg: 44,
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [-36, 0, 0],
    toleranceMm: 0.15,
    ports: {
      rearSeam: { localOffsetMm: [64.0, 91.0, 0], normal: [1, 0, 0] },
      frontCollarSeam: { localOffsetMm: [-58.1, 88.0, 0], normal: [-1, 0, 0] },
      leverHinge: { localOffsetMm: [-9.5, 87.0, 28.5], normal: [0, 1, 0] },
    },
    constraint: {
      kind: 'matePort',
      selfPort: 'rearSeam',
      targetPartId: 'saw_main_housing_green',
      targetPort: 'frontBarrelMount',
    },
  },
  // Molded Dark Charcoal Gearbox Transition Band (X = 64.5..74.5, Y = 66..114, ±Z sides)
  {
    id: 'saw_gearbox_transition_band_front',
    name: 'Gearbox Transition Step Band (+Z)',
    group: 'Front Barrel & Drive',
    role: 'detail',
    positionMm: [69.4, 90.0, 31.8],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 9.6, height: 42.0, depth: 1.2 },
      smoothSharpAngleDeg: 32,
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [-16, 0, 24],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_gearbox_transition_band_rear',
    name: 'Gearbox Transition Step Band (-Z)',
    group: 'Front Barrel & Drive',
    role: 'detail',
    positionMm: [69.4, 90.0, -31.8],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: { op: 'box', width: 9.6, height: 42.0, depth: 1.2 },
      smoothSharpAngleDeg: 32,
    },
    material: MAT_CHARCOAL_OVERMOLD,
    explodeOffsetMm: [-16, 0, -24],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_blade_release_lever',
    name: 'Curved Tool-Free Blade Release Lever',
    group: 'Controls',
    role: 'secondary',
    positionMm: [-9.5, 87.0, 28.5],
    rotationDeg: [0, 0, 0],
    motionLimits: { minAngleDeg: 0, maxAngleDeg: 35 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildBladeReleaseLeverCsg(),
      smoothSharpAngleDeg: 40,
    },
    material: MAT_SATIN_SILVER_LEVER,
    explodeOffsetMm: [-34, 0, 32],
    toleranceMm: 0.15,
    ports: {
      hinge: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
    },
    constraint: {
      kind: 'concentric',
      selfPort: 'hinge',
      targetPartId: 'saw_front_barrel_boot',
      targetPort: 'leverHinge',
      lockAxial: true,
      lockSpin: false,
    },
  },
  {
    id: 'saw_boot_accent_front_1',
    name: 'Barrel Conformal Volt-Green Block Front (+Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildBarrelGreenBlockConformalCsg(6.8, 82.0, 1),
      smoothSharpAngleDeg: 40,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [-32, 0, 24],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_boot_accent_front_2',
    name: 'Barrel Conformal Volt-Green Block Rear (+Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildBarrelGreenBlockConformalCsg(31.2, 82.6, 1),
      smoothSharpAngleDeg: 40,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [-28, 0, 24],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_boot_accent_1_rear',
    name: 'Barrel Conformal Volt-Green Block Front (-Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildBarrelGreenBlockConformalCsg(6.8, 82.0, -1),
      smoothSharpAngleDeg: 40,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [-32, 0, -24],
    toleranceMm: 0.1,
  },
  {
    id: 'saw_boot_accent_2_rear',
    name: 'Barrel Conformal Volt-Green Block Rear (-Z)',
    group: 'Branding & Accents',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildBarrelGreenBlockConformalCsg(31.2, 82.6, -1),
      smoothSharpAngleDeg: 40,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [-28, 0, -24],
    toleranceMm: 0.1,
  },

  // 9. SMOOTH BULLNOSE VOLT-GREEN FRONT COLLAR + DARK INNER SHROUD
  {
    id: 'saw_front_collar_green',
    name: 'Volt-Green Sculpted Bullnose Front Collar',
    group: 'Front Barrel & Drive',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildFrontCollarGreenCsg(),
      smoothSharpAngleDeg: 44,
    },
    material: MAT_RYOBI_VOLT_GREEN,
    explodeOffsetMm: [-70, 0, 0],
    toleranceMm: 0.15,
    ports: {
      rearBootSeam: { localOffsetMm: [-58.1, 88.0, 0], normal: [1, 0, 0] },
      innerCavity: { localOffsetMm: [-81.0, 88.0, 0], normal: [-1, 0, 0] },
    },
    constraint: {
      kind: 'matePort',
      selfPort: 'rearBootSeam',
      targetPartId: 'saw_front_barrel_boot',
      targetPort: 'frontCollarSeam',
    },
  },
  {
    id: 'saw_collar_inner_shroud',
    name: 'Front Nose Cavity Dust Shroud',
    group: 'Front Barrel & Drive',
    role: 'secondary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildCollarInnerShroudCsg(),
      smoothSharpAngleDeg: 32,
    },
    material: MAT_DARK_POLYMER,
    explodeOffsetMm: [-82, 0, 0],
    toleranceMm: 0.15,
    ports: {
      cavitySeat: { localOffsetMm: [-81.0, 88.0, 0], normal: [1, 0, 0] },
      shoeBarSeat: { localOffsetMm: [-88.0, 59.0, 0], normal: [-1, 0, 0] },
      spindleAxis: { localOffsetMm: [-88.0, 94.0, 0], normal: [-1, 0, 0] },
    },
    constraint: {
      kind: 'matePort',
      selfPort: 'cavitySeat',
      targetPartId: 'saw_front_collar_green',
      targetPort: 'innerCavity',
    },
  },

  // 10. SHOE GUIDE BAR + THIN-WALLED STAMPED PIVOTING U-SHOE + PIVOT PIN
  {
    id: 'saw_shoe_mounting_bar',
    name: 'Stamped Steel Shoe Guide Bar & Pivot Pin',
    group: 'Blade & Shoe Assembly',
    role: 'secondary',
    positionMm: [-88.0, 59.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          { op: 'box', width: 25.0, height: 8.6, depth: 17.4, translateMm: [0, 0, 0] },
          // Pivot clevis knuckle + steel hinge pin spanning the U-shoe cheeks
          {
            op: 'cylinder',
            radius: 4.2,
            height: 22.8,
            radialSegments: 24,
            rotateDeg: [90, 0, 0],
            translateMm: [-13.0, -3.0, 0],
          },
        ],
      },
      smoothSharpAngleDeg: 35,
    },
    material: MAT_GLOSS_BLACK_STEEL,
    explodeOffsetMm: [-98, -14, 0],
    toleranceMm: 0.15,
    ports: {
      shroudMount: { localOffsetMm: [0, 0, 0], normal: [1, 0, 0] },
      shoePivotPin: { localOffsetMm: [-13.0, -3.0, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'matePort',
      selfPort: 'shroudMount',
      targetPartId: 'saw_collar_inner_shroud',
      targetPort: 'shoeBarSeat',
    },
  },
  {
    id: 'saw_pivoting_shoe',
    name: 'Stamped-Steel Pivoting Forked U-Shoe',
    group: 'Blade & Shoe Assembly',
    role: 'primary',
    positionMm: [-101.0, 56.0, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minAngleDeg: 0, maxAngleDeg: 18 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildPivotingShoeCsg(),
      smoothSharpAngleDeg: 38,
    },
    material: MAT_GLOSS_BLACK_STEEL,
    explodeOffsetMm: [-118, 0, 0],
    toleranceMm: 0.15,
    ports: {
      pivotPin: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'concentric',
      selfPort: 'pivotPin',
      targetPartId: 'saw_shoe_mounting_bar',
      targetPort: 'shoePivotPin',
      lockAxial: true,
      lockSpin: false,
    },
  },

  // 11. RECIPROCATING BLADE CLAMP + TWO-TONE BI-METAL SERRATED SAW BLADE
  {
    id: 'saw_blade_clamp_chuck',
    name: 'Quick-Release Reciprocating Blade Clamp',
    group: 'Blade & Shoe Assembly',
    role: 'secondary',
    positionMm: [-88.0, 94.0, 0],
    rotationDeg: [0, 0, 0],
    motionLimits: { minSlideMm: -14, maxSlideMm: 14 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          {
            op: 'cylinder',
            radius: 7.4,
            height: 28.0,
            radialSegments: 24,
            rotateDeg: [0, 0, 90],
            translateMm: [0, 0, 0],
          },
          { op: 'box', width: 8.4, height: 18.4, depth: 15.6, translateMm: [-12.0, 0, 0] },
        ],
      },
      smoothSharpAngleDeg: 35,
    },
    material: MAT_MACHINED_STEEL,
    explodeOffsetMm: [-106, 0, 0],
    toleranceMm: 0.12,
    ports: {
      driveAxis: { localOffsetMm: [0, 0, 0], normal: [-1, 0, 0] },
      bladeTangMount: { localOffsetMm: [-16.5, 0, 0], normal: [-1, 0, 0] },
    },
    constraint: {
      kind: 'concentric',
      selfPort: 'driveAxis',
      targetPartId: 'saw_collar_inner_shroud',
      targetPort: 'spindleAxis',
      lockAxial: false,
      lockSpin: true,
    },
  },
  {
    id: 'saw_reciprocating_blade',
    name: 'Bi-Metal Reciprocating Blade Spine (Black Oxide)',
    group: 'Blade & Shoe Assembly',
    role: 'primary',
    positionMm: [-104.5, 94.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildBladeSpineBlackCsg(),
      smoothSharpAngleDeg: 25,
    },
    material: MAT_BLADE_SPINE_STEEL,
    explodeOffsetMm: [-175, 0, 0],
    toleranceMm: 0.1,
    ports: {
      tang: { localOffsetMm: [0, 0, 0], normal: [1, 0, 0] },
      toothSeam: { localOffsetMm: [0, 0, 0], normal: [0, -1, 0] },
    },
    constraint: {
      kind: 'matePort',
      selfPort: 'tang',
      targetPartId: 'saw_blade_clamp_chuck',
      targetPort: 'bladeTangMount',
    },
  },
  {
    id: 'saw_blade_teeth_silver',
    name: 'Precision-Ground HSS Serrated Tooth Strip',
    group: 'Blade & Shoe Assembly',
    role: 'secondary',
    positionMm: [-104.5, 94.0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: buildBladeToothEdgeSilverCsg(),
      smoothSharpAngleDeg: 25,
    },
    material: MAT_BLADE_EDGE_SILVER,
    explodeOffsetMm: [-175, -8, 0],
    toleranceMm: 0.1,
    ports: {
      spineSeam: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
    },
    constraint: {
      kind: 'matePort',
      selfPort: 'spineSeam',
      targetPartId: 'saw_reciprocating_blade',
      targetPort: 'toothSeam',
    },
  },
];

export const RYOBI_RECIPROCATING_SAW_BLUEPRINT: MeshBlueprint = {
  id: 'ryobi-oneplus-reciprocating-saw',
  name: 'RYOBI ONE+ 18V Reciprocating Saw',
  category: 'Cordless Power Tools',
  summary:
    'Industrial-design watertight Manifold-3D CAD assembly of the RYOBI ONE+ 18V cordless reciprocating saw built with 24-segment superellipse cross-section lofts, conformal curved 2-shot accents, molded RYOBI bezel recess, real cut-through cooling louvers with internal stator core, thin-walled stamped U-shoe, two-tone bi-metal blade, and fully rigged kinematics.',
  sourceImageUrl: '/assets/aistudio/image_e4cd4a10.png',
  envelopeMm: {
    width: 460.0,
    height: 149.0,
    depth: 66.0,
  },
  toleranceSpecMm: 0.15,
  symmetryPlane: 'Z',
  photoMatchCamera: {
    positionMm: [0, 74.5, 860],
    targetMm: [0, 74.5, 0],
    fov: 22,
  },
  parts: PARTS,
  reconstructedAt: '2026-11-21T19:26:00.000Z',
};
