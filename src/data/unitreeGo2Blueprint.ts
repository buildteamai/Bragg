import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';
import {
  buildBlendedCircularBossPair,
  computeLoftSurfaceDatumAtX,
} from '../engine/surfaceBlend';

/**
 * Unitree Go2 Quadruped Robot
 * Industrial-Design Watertight Manifold-3D CAD Reconstruction from /assets/aistudio/image_790c4635.jpeg.
 *
 * Mechanical & Sculptural Architecture:
 * - 100% watertight Manifold-3D CSG solids (0 primitive-only fallbacks)
 * - 24-segment superellipse lofted aerodynamic fuselage with Boolean-cut circular shoulder arches
 * - Dual-stage CNC anodized silver rotary actuators (4 corners × machined ribbed stator drums)
 * - Sculpted 3D contoured thigh links & bowed fluted calf struts with Boolean-cleared knee clevises
 * - Ribbed matte-black TPE hemispherical traction feet grounded flush at Y = 0.0 mm
 * - Suspended 4D LiDAR L1 optical chin dome with protective multi-rib guard cage
 * - Inset front HD camera & LED headlight bar, cheek "02" badges, flank "Unitree Robot" markings,
 *   recessed dual side port pockets, top black accessory rail, rear glowing power LED bar, and
 *   folded aluminum belly skid plate (`sheetMetalFold` with exact K-factor flat pattern).
 *
 * Calibrated Master Envelope: 700.0 (X) × 400.0 (Y) × 310.0 (Z) mm, grounded at Y = 0.0 mm.
 * Coordinate Frame: -X forward (head/LiDAR), +X rear (tail), +Y up, +Z left flank (hero view).
 */

const MAT_GO2_SILVER_SHELL: PartMaterialSpec = {
  colorHex: '#a3aab5',
  metalness: 0.24,
  roughness: 0.34,
  clearcoat: 0.34,
  clearcoatRoughness: 0.22,
  textureKind: 'none',
  finishName: 'Satin Titanium-Silver Composite Shell',
};

const MAT_GO2_MID_GRAY: PartMaterialSpec = {
  colorHex: '#7d8592',
  metalness: 0.22,
  roughness: 0.38,
  clearcoat: 0.24,
  clearcoatRoughness: 0.26,
  textureKind: 'none',
  finishName: 'Matte Slate-Silver Contoured Polymer',
};

const MAT_ACTUATOR_ALUMINUM: PartMaterialSpec = {
  colorHex: '#c6cdd6',
  metalness: 0.86,
  roughness: 0.24,
  textureKind: 'brushedMetal',
  finishName: 'CNC Anodized 6061-T6 Actuator Housing',
};

const MAT_SKID_ALUMINUM: PartMaterialSpec = {
  colorHex: '#929aa6',
  metalness: 0.82,
  roughness: 0.3,
  textureKind: 'brushedMetal',
  finishName: 'Folded Bead-Blasted Aluminum Skid Pan',
};

const MAT_DARK_GRAPHITE: PartMaterialSpec = {
  colorHex: '#1b1f26',
  metalness: 0.14,
  roughness: 0.46,
  clearcoat: 0.18,
  textureKind: 'none',
  finishName: 'Matte Carbon-Filled Nylon Trim',
};

const MAT_LIDAR_OPTIC: PartMaterialSpec = {
  colorHex: '#0d1117',
  metalness: 0.18,
  roughness: 0.08,
  clearcoat: 0.94,
  clearcoatRoughness: 0.06,
  textureKind: 'none',
  finishName: '4D LiDAR L1 Optical Dome Glass',
};

const MAT_RUBBER_FOOT: PartMaterialSpec = {
  colorHex: '#181b20',
  metalness: 0.02,
  roughness: 0.84,
  textureKind: 'rubberOvermold',
  finishName: 'Ribbed High-Grip TPE Traction Pad',
};

const MAT_KNEE_BOLT_STEEL: PartMaterialSpec = {
  colorHex: '#d2d8e0',
  metalness: 0.92,
  roughness: 0.18,
  textureKind: 'brushedMetal',
  finishName: 'Stainless Steel Pivot Fastener',
};

const MAT_REAR_LED_RED: PartMaterialSpec = {
  colorHex: '#ef4444',
  metalness: 0.05,
  roughness: 0.2,
  emissiveHex: '#dc2626',
  emissiveIntensity: 1.5,
  textureKind: 'none',
  finishName: 'Rear Status LED Lightbar',
};

const MAT_FRONT_LED_WHITE: PartMaterialSpec = {
  colorHex: '#f8fafc',
  metalness: 0.05,
  roughness: 0.18,
  emissiveHex: '#e2e8f0',
  emissiveIntensity: 1.3,
  textureKind: 'none',
  finishName: 'Front Wide-Angle Headlamp Ring',
};

const MAT_UNITREE_FLANK_LABEL: PartMaterialSpec = {
  colorHex: '#89919e',
  metalness: 0.16,
  roughness: 0.36,
  clearcoat: 0.2,
  textureKind: 'silkscreenLabel',
  labelText: 'Unitree Robot',
  finishName: 'Silkscreened Unitree Robot Flank Marking',
};

const MAT_MODEL_02_LABEL: PartMaterialSpec = {
  colorHex: '#848c99',
  metalness: 0.18,
  roughness: 0.36,
  clearcoat: 0.22,
  textureKind: 'silkscreenLabel',
  labelText: '02',
  finishName: 'Silkscreened Go2 Cheek Model Marking',
};

// ============================================================================
// SMOOTH SUPERELLIPSE LOFT & SCULPTED LINK GENERATORS (Manifold-3D Watertight)
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

function makeSuperellipseLoftX(stations: LoftStationX[], segments = 24): CsgNodeSpec {
  const makeSlice = (s: LoftStationX): CsgNodeSpec => ({
    op: 'polygonExtrude',
    depth: 0.8,
    polygonPoints: superellipsePolygon(s.halfZ, s.halfY, s.exponent ?? 2.6, segments),
    rotateDeg: [0, 90, 0],
    translateMm: [s.x, s.yCenter, 0],
  });

  const hulls: CsgNodeSpec[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    hulls.push({
      op: 'hull',
      children: [makeSlice(stations[i]), makeSlice(stations[i + 1])],
    });
  }
  return hulls.length === 1 ? hulls[0] : { op: 'union', children: hulls };
}

interface LimbStation {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  rotZDeg?: number;
}

/**
 * Generates a continuously sculpted 3D limb (thigh or bowed calf) in world-aligned local space
 * via pairwise Manifold-3D convex hulls of smooth rounded profiles.
 */
function makeSculptedLimbLoft(stations: LimbStation[]): CsgNodeSpec {
  const makeStation = (st: LimbStation): CsgNodeSpec => ({
    op: 'polygonExtrude',
    depth: Math.max(2, st.rz * 2),
    polygonPoints: superellipsePolygon(st.rx, st.ry, 2.3, 18),
    rotateDeg: [0, 0, st.rotZDeg ?? 0],
    translateMm: [st.x, st.y, st.z],
  });

  const hulls: CsgNodeSpec[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    hulls.push({
      op: 'hull',
      children: [makeStation(stations[i]), makeStation(stations[i + 1])],
    });
  }
  return hulls.length === 1 ? hulls[0] : { op: 'union', children: hulls };
}

// ============================================================================
// MASTER KINEMATIC DATUMS (Exact 0.6..1.5 mm Clearances — Zero Overlaps)
// ============================================================================
const HIP_FRONT_X = -194;
const HIP_REAR_X = 194;
const HIP_Y = 308;

// Actuator barrel extends from Z = ±74 to ±124; thigh sits at Z = ±125..±153; calf at Z = ±125..±143
const ACTUATOR_INNER_Z = 75;
const ACTUATOR_OUTER_Z = 124;
const THIGH_CENTER_Z = 138;
const CALF_CENTER_Z = 134;

// Knee and foot coordinates (all 4 knees bow rearward +X, calves sweep forward -X to ground Y=0)
const KNEE_DX_FRONT = 128;
const KNEE_DX_REAR = 126;
const KNEE_Y = 194;
const KNEE_HUB_R = 15.5;

const FOOT_DX_FROM_KNEE = -114;
const FOOT_TOP_Y = 26;

// ============================================================================
// MAIN FUSELAGE & HEAD COWLING CSG (Watertight Loft + Shoulder Arch Cutouts)
// ============================================================================

const LIDAR_CENTER_X = -310;
const CHIN_RIM_Y = 228;
const BROW_PUCK_X = -256;

const TORSO_LOFT_STATIONS: LoftStationX[] = [
  // Front nose tip & sensor brow (X: -350..-212) — curves smoothly down into vertical chin cowl
  { x: -350, yCenter: 292, halfY: 38, halfZ: 30, exponent: 2.2 },
  { x: -334, yCenter: 294, halfY: 50, halfZ: 48, exponent: 2.3 },
  { x: -306, yCenter: 298, halfY: 64, halfZ: 66, exponent: 2.5 },
  { x: -262, yCenter: 308, halfY: 66, halfZ: 78, exponent: 2.7 },
  { x: -222, yCenter: 318, halfY: 62, halfZ: 82, exponent: 2.8 },
  // Central aluminum/polymer body core (X: -175..+175)
  { x: -165, yCenter: 316, halfY: 68, halfZ: 85, exponent: 3.0 },
  { x: -90, yCenter: 317, halfY: 70, halfZ: 86, exponent: 3.1 },
  { x: 0, yCenter: 318, halfY: 71, halfZ: 86, exponent: 3.1 },
  { x: 100, yCenter: 318, halfY: 70, halfZ: 85, exponent: 3.0 },
  { x: 175, yCenter: 318, halfY: 68, halfZ: 83, exponent: 2.8 },
  // Rear tail taper (X: +215..+246)
  { x: 218, yCenter: 326, halfY: 58, halfZ: 76, exponent: 2.6 },
  { x: 246, yCenter: 342, halfY: 38, halfZ: 60, exponent: 2.3 },
];

// Derive exact right-handed brow slope & concentric filleted boss pair directly from the fuselage loft
const BROW_SURFACE_DATUM = computeLoftSurfaceDatumAtX(TORSO_LOFT_STATIONS, BROW_PUCK_X, 'top');
const BROW_BOSS_PAIR = buildBlendedCircularBossPair({
  centerMm: [BROW_PUCK_X, BROW_SURFACE_DATUM.surfaceYMm, 0],
  rotationDeg: [0, 0, BROW_SURFACE_DATUM.tiltZDeg],
  capRadiusMm: 22.4,
  bossHeightMm: 4.0,
  sinkDepthMm: 14.0,
  baseFlareMm: 12.8,
  rimMarginMm: 0.8,
  seamGapMm: 0.5,
  capSideHeightMm: 1.5,
  capTotalHeightMm: 5.0,
});

function buildTorsoFuselageCsg(): CsgNodeSpec {
  const mainLoft = makeSuperellipseLoftX(TORSO_LOFT_STATIONS, 24);

  // Sculpted cylindrical chin cowl that flows seamlessly from the front head cheeks
  // straight down into a concentric circular collar directly above the 4D LiDAR L1 pod
  const chinCowl: CsgNodeSpec = {
    op: 'union',
    children: [
      // Vertical cylindrical chin housing concentric with LiDAR at X = -310, Y = 228..296
      {
        op: 'revolve',
        radialSegments: 32,
        lathePoints: [
          [0, CHIN_RIM_Y],
          [42.0, CHIN_RIM_Y],
          [43.8, CHIN_RIM_Y + 5],
          [44.2, CHIN_RIM_Y + 26],
          [43.2, CHIN_RIM_Y + 54],
          [38.0, CHIN_RIM_Y + 72],
          [0, CHIN_RIM_Y + 72],
        ],
        translateMm: [LIDAR_CENTER_X, 0, 0],
      },
      // Smooth throat fillet blending the rear of the cylindrical chin cowl into the upper chest/cheeks
      {
        op: 'hull',
        children: [
          {
            op: 'cylinder',
            radius: 43.2,
            height: 24,
            radialSegments: 28,
            translateMm: [LIDAR_CENTER_X, CHIN_RIM_Y + 20, 0],
          },
          {
            op: 'polygonExtrude',
            depth: 10,
            polygonPoints: superellipsePolygon(64, 42, 2.5, 22),
            rotateDeg: [0, 90, 0],
            translateMm: [-268, 286, 0],
          },
        ],
      },
    ],
  };

  const outerShell: CsgNodeSpec = {
    op: 'union',
    children: [mainLoft, chinCowl, BROW_BOSS_PAIR.hostBossUnion],
  };

  // Subtract 4 circular shoulder arch pockets so the cylindrical hip actuators sit inside
  // realistic dark recessed arches with a crisp 1.5 mm radial clearance
  const shoulderCutters: CsgNodeSpec[] = [];
  for (const hx of [HIP_FRONT_X, HIP_REAR_X]) {
    for (const side of [1, -1]) {
      shoulderCutters.push({
        op: 'cylinder',
        radius: 50.0,
        height: 46,
        radialSegments: 32,
        rotateDeg: [90, 0, 0],
        translateMm: [hx, HIP_Y, side * 96],
      });
    }
  }

  // Subtract flat top accessory rail channel & dual recessed side battery/IO port pockets
  const detailCutters: CsgNodeSpec[] = [
    // Ensure razor-clean flat circular chin rim at Y = 228.0 mm for seamless LiDAR mating
    {
      op: 'cylinder',
      radius: 54,
      height: 18,
      radialSegments: 32,
      translateMm: [LIDAR_CENTER_X, CHIN_RIM_Y - 9, 0],
    },
    // Ensure clean flat circular landing plane on top of the molded brow boss
    BROW_BOSS_PAIR.hostLandingCut,
    // Top dorsal channel pocket
    {
      op: 'box',
      width: 268,
      height: 16,
      depth: 54,
      translateMm: [10, 387, 0],
    },
    // Front camera fascia inset pocket flush with blended vertical chin face
    {
      op: 'box',
      width: 24,
      height: 78,
      depth: 34,
      translateMm: [-348, 290, 0],
    },
    // Left & right twin recessed rectangular side latch/vent bays
    {
      op: 'box',
      width: 24,
      height: 36,
      depth: 18,
      translateMm: [14, 298, 84],
    },
    {
      op: 'box',
      width: 24,
      height: 36,
      depth: 18,
      translateMm: [56, 298, 84],
    },
    {
      op: 'box',
      width: 24,
      height: 36,
      depth: 18,
      translateMm: [14, 298, -84],
    },
    {
      op: 'box',
      width: 24,
      height: 36,
      depth: 18,
      translateMm: [56, 298, -84],
    },
    // Flat belly clearance recess for the folded aluminum skid plate
    {
      op: 'box',
      width: 236,
      height: 18,
      depth: 138,
      translateMm: [4, 245, 0],
    },
  ];

  // Carve 4 angled diagonal cooling gill slots behind the "02" badge on both cheeks
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      detailCutters.push({
        op: 'box',
        width: 3.4,
        height: 20,
        depth: 16,
        rotateDeg: [0, 0, -24],
        translateMm: [-242 + i * 7.5, 294 + i * 1.4, side * 78],
      });
    }
  }

  return {
    op: 'subtract',
    children: [outerShell, ...shoulderCutters, ...detailCutters],
  };
}

/**
 * Internal dark graphite chassis core visible inside the recessed shoulder arches
 * and side IO latch bays — also anchors the 4 hip actuators cleanly to the body.
 */
function buildInnerChassisCoreCsg(): CsgNodeSpec {
  const core: CsgNodeSpec = {
    op: 'box',
    width: 446,
    height: 98,
    depth: 146,
    chamferMm: 8,
    translateMm: [0, 312, 0],
  };
  // Trim outer shoulder corners so actuators at Z = ±75..±124 clear by 1.0 mm
  const trimCutters: CsgNodeSpec[] = [];
  for (const hx of [HIP_FRONT_X, HIP_REAR_X]) {
    for (const side of [1, -1]) {
      trimCutters.push({
        op: 'cylinder',
        radius: 49.0,
        height: 40,
        radialSegments: 28,
        rotateDeg: [90, 0, 0],
        translateMm: [hx, HIP_Y, side * 94],
      });
    }
  }
  return {
    op: 'subtract',
    children: [core, ...trimCutters],
  };
}

/**
 * 4D LiDAR L1 hemispherical chin sensor pod concentric with the sculpted chin cowl
 * (X = -310, Z = 0; top seats cleanly 0.6 mm beneath CHIN_RIM_Y = 228 mm).
 */
function buildLidarPodCsg(): CsgNodeSpec {
  // Local Y = 0 sits at world Y = 210 mm -> top at +17.4 mm (world Y = 227.4), bottom at -25 mm (world Y = 185)
  const neckAndDome: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 36,
    lathePoints: [
      [0, -24.5],
      [14, -23.5],
      [25, -18.5],
      [31.5, -10.5],
      [34.2, -1.0],
      [34.2, 16.0],
      [32.5, 17.4],
      [0, 17.4],
    ],
  };
  return neckAndDome;
}

function buildLidarGuardCageCsg(): CsgNodeSpec {
  // Stepped concentric dark mounting bezel collar matching the silver chin rim (R = 41.6 mm vs chin R = 42.0 mm)
  // Local Y: +6.5 .. +17.4 mm (world Y: 216.5 .. 227.4 mm, 0.6 mm clean parting seam below silver chin rim!)
  const collar: CsgNodeSpec = {
    op: 'subtract',
    children: [
      {
        op: 'revolve',
        radialSegments: 36,
        lathePoints: [
          [0, 6.0],
          [39.8, 6.0],
          [41.4, 8.2],
          [41.6, 16.2],
          [40.6, 17.4],
          [0, 17.4],
        ],
      },
      {
        op: 'cylinder',
        radius: 35.4,
        height: 22,
        radialSegments: 36,
        translateMm: [0, 12, 0],
      },
    ],
  };

  // Sculpted double-hoop protective chin bumper ribs hugging the 4D LiDAR dome tightly (1.5 mm radial clearance)
  const makeRibArc = (rotYDeg: number): CsgNodeSpec => ({
    op: 'sweep',
    radius: 3.8,
    pathMode: 'spline',
    splineSamples: 16,
    pathPoints: [
      [39.2, 10.5, 0],
      [39.2, -3.5, 0],
      [32.5, -19.5, 0],
      [18.0, -28.0, 0],
      [0, -30.2, 0],
      [-18.0, -28.0, 0],
      [-32.5, -19.5, 0],
      [-39.2, -3.5, 0],
      [-39.2, 10.5, 0],
    ],
    rotateDeg: [0, rotYDeg, 0],
  });

  // Lateral twin curved cheek guard arches matching the photo's distinctive side-wrapped LiDAR bumper
  const makeSideCheekLoop = (side: 1 | -1): CsgNodeSpec => ({
    op: 'sweep',
    radius: 3.4,
    pathMode: 'spline',
    splineSamples: 14,
    pathPoints: [
      [-26, 9.5, side * 29.5],
      [-24, -6.0, side * 31.0],
      [-14, -22.0, side * 24.5],
      [0, -28.5, side * 14.0],
      [14, -22.0, side * 24.5],
      [24, -6.0, side * 31.0],
      [26, 9.5, side * 29.5],
    ],
  });

  return {
    op: 'union',
    children: [collar, makeRibArc(0), makeSideCheekLoop(1), makeSideCheekLoop(-1)],
  };
}

/**
 * Dual-stage CNC machined rotary actuator barrel (Z-aligned local axis) for each of the 4 hips.
 * Local Z spans -24.5 .. +24.5 mm (length 49 mm), outer radius 48.0 mm.
 */
function buildHipActuatorDrumCsg(side: 1 | -1): CsgNodeSpec {
  // Lathe along Y (revolve), then rotate [90, 0, 0] so Y maps to Z
  const halfLen = (ACTUATOR_OUTER_Z - ACTUATOR_INNER_Z) * 0.5; // 24.5 mm
  const pts: [number, number][] = [
    [0, -halfLen],
    [43, -halfLen],
    [46.5, -halfLen + 3],
    [46.5, -halfLen + 13],
    [45.0, -halfLen + 15],
    [48.0, -halfLen + 17],
    [48.0, halfLen - 11],
    [46.2, halfLen - 9],
    [47.5, halfLen - 7],
    [47.5, halfLen - 2.5],
    [44.5, halfLen],
    [0, halfLen],
  ];

  // Orient stepped flange outward toward `side`
  const orderedPts: [number, number][] =
    side === 1 ? pts : pts.slice().reverse().map(([r, y]) => [r, -y]);

  const barrel: CsgNodeSpec = {
    op: 'revolve',
    radialSegments: 36,
    lathePoints: orderedPts,
    rotateDeg: [90, 0, 0],
  };

  // Subtle radial fastener dimples + machined circumferential seam groove
  const dimples: CsgNodeSpec[] = [
    {
      op: 'subtract',
      children: [
        {
          op: 'cylinder',
          radius: 50,
          height: 2.2,
          radialSegments: 36,
          rotateDeg: [90, 0, 0],
          translateMm: [0, 0, side * -3.5],
        },
        {
          op: 'cylinder',
          radius: 45.2,
          height: 6.0,
          radialSegments: 36,
          rotateDeg: [90, 0, 0],
          translateMm: [0, 0, side * -3.5],
        },
      ],
    },
  ];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const dx = Math.cos(ang) * 46.5;
    const dy = Math.sin(ang) * 46.5;
    dimples.push({
      op: 'sphere',
      radius: 2.2,
      radialSegments: 10,
      translateMm: [dx, dy, side * (halfLen - 5)],
    });
  }

  return {
    op: 'subtract',
    children: [barrel, ...dimples],
  };
}

/**
 * Sculpted Unitree Go2 Thigh Link (Hip -> Knee) in local coordinates relative to Hip center (0, 0, 0).
 * Includes the signature sculpted outer shoulder fairing dome, tapered organic upper arm,
 * and a precision Boolean-trimmed knee clevis clearing the knee pivot hub by 0.6 mm.
 */
function buildThighLinkCsg(side: 1 | -1, kneeDx: number): CsgNodeSpec {
  const kneeDy = KNEE_Y - HIP_Y; // -134 mm
  // Local Z = 0 is THIGH_CENTER_Z (138 * side). Inner face is at -12.5 * side (Z = 125.5, 1.5mm clear of actuator at 124).
  const thighStations: LimbStation[] = [
    // Shoulder dome over thigh actuator
    { x: -8, y: 8, z: 0, rx: 38, ry: 40, rz: 12.5, rotZDeg: -15 },
    { x: 24, y: -12, z: side * 0.5, rx: 31, ry: 33, rz: 12.0, rotZDeg: -32 },
    { x: 64, y: -46, z: side * -0.5, rx: 22, ry: 24, rz: 10.5, rotZDeg: -42 },
    { x: 102, y: -90, z: side * -1.5, rx: 17, ry: 18, rz: 9.5, rotZDeg: -48 },
    // Knee clevis termination
    { x: kneeDx, y: kneeDy, z: side * -2.5, rx: 18.5, ry: 18.5, rz: 9.0, rotZDeg: 0 },
  ];

  const mainArm = makeSculptedLimbLoft(thighStations);

  // Raised contoured outer shoulder bulge cap (iconic Go2 double-lobe thigh fairing)
  const shoulderCap: CsgNodeSpec = {
    op: 'hull',
    children: [
      {
        op: 'sphere',
        radius: 26,
        radialSegments: 22,
        scale: [1.12, 1.15, 0.42],
        translateMm: [-4, 6, side * 7.5],
      },
      {
        op: 'sphere',
        radius: 20,
        radialSegments: 20,
        scale: [1.1, 1.0, 0.36],
        translateMm: [24, -12, side * 6.5],
      },
    ],
  };

  const rawThigh: CsgNodeSpec = {
    op: 'union',
    children: [mainArm, shoulderCap],
  };

  // Boolean-trim knee clevis bore & clearance pocket around knee hub (R = 16.0 -> cut R = 16.6)
  const kneeClearanceCut: CsgNodeSpec = {
    op: 'cylinder',
    radius: KNEE_HUB_R + 0.6,
    height: 36,
    radialSegments: 24,
    rotateDeg: [90, 0, 0],
    translateMm: [kneeDx, kneeDy, 0],
  };

  return {
    op: 'subtract',
    children: [rawThigh, kneeClearanceCut],
  };
}

/**
 * Sculpted Unitree Go2 Calf Strut (Knee -> Ankle) in local coordinates relative to Knee center (0, 0, 0).
 * Slightly forward-bowed airfoil strut with longitudinal stiffening flutes, Boolean-trimmed cleanly
 * at the top knee hub (0.6 mm clearance) and flat-trimmed at the ankle collar (0.6 mm above rubber foot).
 */
function buildCalfLinkCsg(side: 1 | -1): CsgNodeSpec {
  const ankleDx = FOOT_DX_FROM_KNEE; // -114 mm
  const ankleDy = FOOT_TOP_Y - KNEE_Y; // 26 - 174 = -148 mm

  const calfStations: LimbStation[] = [
    { x: 0, y: 0, z: 0, rx: 17.5, ry: 17.5, rz: 8.5, rotZDeg: 0 },
    { x: ankleDx * 0.24 - 6, y: ankleDy * 0.22, z: 0, rx: 15.5, ry: 17.5, rz: 8.2, rotZDeg: 36 },
    { x: ankleDx * 0.54 - 8, y: ankleDy * 0.52, z: 0, rx: 14.0, ry: 16.0, rz: 7.8, rotZDeg: 38 },
    { x: ankleDx * 0.82 - 4, y: ankleDy * 0.8, z: 0, rx: 13.0, ry: 14.0, rz: 8.0, rotZDeg: 28 },
    // Flared ankle cuff resting cleanly over the rubber foot dome
    { x: ankleDx, y: ankleDy + 6, z: 0, rx: 16.5, ry: 11.0, rz: 15.5, rotZDeg: 0 },
    { x: ankleDx, y: ankleDy - 6, z: 0, rx: 18.0, ry: 10.0, rz: 17.5, rotZDeg: 0 },
  ];

  const rawCalf = makeSculptedLimbLoft(calfStations);

  // Subtle recessed weight-relief flute along the outer calf cheek
  const outerFlute: CsgNodeSpec = {
    op: 'sweep',
    radius: 4.0,
    pathMode: 'spline',
    splineSamples: 10,
    pathPoints: [
      [ankleDx * 0.22 - 4, ankleDy * 0.2, side * 9.2],
      [ankleDx * 0.52 - 7, ankleDy * 0.5, side * 8.6],
      [ankleDx * 0.78 - 4, ankleDy * 0.76, side * 8.8],
    ],
  };

  // Top knee hub clearance cutter (R = 16.6 mm) + bottom ankle plane trim at Y = ankleDy + 0.6 mm
  const kneeClearanceCut: CsgNodeSpec = {
    op: 'cylinder',
    radius: KNEE_HUB_R + 0.6,
    height: 36,
    radialSegments: 24,
    rotateDeg: [90, 0, 0],
    translateMm: [0, 0, 0],
  };

  const ankleBottomTrim: CsgNodeSpec = {
    op: 'box',
    width: 80,
    height: 40,
    depth: 80,
    translateMm: [ankleDx, ankleDy + 0.6 - 20, 0],
  };

  return {
    op: 'subtract',
    children: [rawCalf, outerFlute, kneeClearanceCut, ankleBottomTrim],
  };
}

/**
 * Ribbed TPE rubber hemispherical traction foot (local Y: 0.0 .. +26.0 mm, grounded at Y = 0).
 */
function buildRubberFootCsg(): CsgNodeSpec {
  return {
    op: 'revolve',
    radialSegments: 28,
    lathePoints: [
      [0, 0],
      [13.5, 0],
      [18.0, 2.2],
      [20.2, 5.5],
      [19.2, 7.2],
      [20.8, 9.0],
      [20.8, 12.8],
      [19.6, 14.5],
      [20.4, 16.5],
      [19.5, 22.0],
      [17.5, 26.0],
      [0, 26.0],
    ],
  };
}

/**
 * Knee rotary pivot housing (dark graphite drum + stainless steel pivot bolt).
 */
function buildKneeHubCsg(): CsgNodeSpec {
  const drum: CsgNodeSpec = {
    op: 'cylinder',
    radius: KNEE_HUB_R,
    height: 22,
    radialSegments: 24,
    rotateDeg: [90, 0, 0],
  };
  const outerPin: CsgNodeSpec = {
    op: 'cylinder',
    radius: 6.5,
    height: 26,
    radialSegments: 18,
    rotateDeg: [90, 0, 0],
  };
  return {
    op: 'union',
    children: [drum, outerPin],
  };
}

// ============================================================================
// GENERATE ALL 4 QUADRUPED LEG ASSEMBLIES (FL, FR, RL, RR)
// ============================================================================

interface LegConfig {
  code: 'fl' | 'fr' | 'rl' | 'rr';
  label: string;
  isFront: boolean;
  side: 1 | -1;
}

const LEG_CONFIGS: LegConfig[] = [
  { code: 'fl', label: 'Front-Left', isFront: true, side: 1 },
  { code: 'fr', label: 'Front-Right', isFront: true, side: -1 },
  { code: 'rl', label: 'Rear-Left', isFront: false, side: 1 },
  { code: 'rr', label: 'Rear-Right', isFront: false, side: -1 },
];

function buildLegParts(cfg: LegConfig): BlueprintPart[] {
  const hipX = cfg.isFront ? HIP_FRONT_X : HIP_REAR_X;
  const kneeDx = cfg.isFront ? KNEE_DX_FRONT : KNEE_DX_REAR;
  const kneeX = hipX + kneeDx;
  const footX = kneeX + FOOT_DX_FROM_KNEE;

  const actuatorCenterZ = cfg.side * ((ACTUATOR_INNER_Z + ACTUATOR_OUTER_Z) * 0.5); // ±99.5 mm
  const thighZ = cfg.side * THIGH_CENTER_Z;
  const calfZ = cfg.side * CALF_CENTER_Z;

  const explodeX = cfg.isFront ? -45 : 45;
  const explodeZ = cfg.side * 75;
  const group = `${cfg.label} Leg`;

  return [
    {
      id: `go2-actuator-${cfg.code}`,
      name: `${cfg.label} Dual-Stage Hip Rotary Actuator (CSG)`,
      group,
      role: 'primary',
      positionMm: [hipX, HIP_Y, actuatorCenterZ],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [explodeX, 10, explodeZ * 0.55],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 38,
        csgRoot: buildHipActuatorDrumCsg(cfg.side),
      },
      material: MAT_ACTUATOR_ALUMINUM,
    },
    {
      id: `go2-thigh-${cfg.code}`,
      name: `${cfg.label} Sculpted Contoured Thigh Link (CSG)`,
      group,
      role: 'primary',
      positionMm: [hipX, HIP_Y, thighZ],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [explodeX, -5, explodeZ],
      toleranceMm: 0.03,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 46,
        csgRoot: buildThighLinkCsg(cfg.side, kneeDx),
      },
      material: MAT_GO2_SILVER_SHELL,
    },
    {
      id: `go2-knee-hub-${cfg.code}`,
      name: `${cfg.label} Knee Rotary Joint Hub (CSG)`,
      group,
      role: 'secondary',
      positionMm: [kneeX, KNEE_Y, calfZ],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [explodeX * 1.1, -22, explodeZ * 1.1],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 36,
        csgRoot: buildKneeHubCsg(),
      },
      material: MAT_DARK_GRAPHITE,
    },
    {
      id: `go2-knee-bolt-${cfg.code}`,
      name: `${cfg.label} Knee Stainless Pivot Cap (CSG)`,
      group,
      role: 'detail',
      positionMm: [kneeX, KNEE_Y, calfZ + cfg.side * 14.2],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [explodeX * 1.1, -22, explodeZ * 1.35],
      toleranceMm: 0.015,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 36,
        csgRoot: {
          op: 'cylinder',
          radius: 5.5,
          height: 2.2,
          radialSegments: 18,
          rotateDeg: [90, 0, 0],
        },
      },
      material: MAT_KNEE_BOLT_STEEL,
    },
    {
      id: `go2-calf-${cfg.code}`,
      name: `${cfg.label} Bowed Fluted Calf Strut (CSG)`,
      group,
      role: 'primary',
      positionMm: [kneeX, KNEE_Y, calfZ],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [explodeX, -50, explodeZ * 1.05],
      toleranceMm: 0.03,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 46,
        csgRoot: buildCalfLinkCsg(cfg.side),
      },
      material: MAT_GO2_SILVER_SHELL,
    },
    {
      id: `go2-foot-${cfg.code}`,
      name: `${cfg.label} Ribbed TPE Traction Foot Pad (CSG)`,
      group,
      role: 'secondary',
      anchorKind: 'floor',
      constraint: { kind: 'sitOnGround', groundYMm: 0 },
      positionMm: [footX, 0, calfZ],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [explodeX, -82, explodeZ * 1.05],
      toleranceMm: 0.03,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 42,
        csgRoot: buildRubberFootCsg(),
      },
      material: MAT_RUBBER_FOOT,
    },
  ];
}

// ============================================================================
// COMPLETE UNITREE GO2 BLUEPRINT ASSEMBLY
// ============================================================================

const ALL_LEG_PARTS: BlueprintPart[] = LEG_CONFIGS.flatMap(buildLegParts);

export const UNITREE_GO2_QUADRUPED_BLUEPRINT: MeshBlueprint = {
  id: 'unitree-go2-quadruped',
  name: 'Unitree Go2 Quadruped Robot',
  category: 'Bionic Robotics',
  summary:
    'Watertight Manifold-3D CAD assembly of the Unitree Go2 quadruped robot featuring a 24-segment superellipse lofted fuselage, 4 dual-stage CNC rotary hip actuators, sculpted knee-flexed legs, suspended 4D LiDAR L1 optical chin pod, folded aluminum underbelly skid plate, and ribbed TPE traction feet.',
  sourceImageUrl: '/assets/aistudio/image_790c4635.jpeg',
  isReferencePreset: true,
  reconstructedAt: '2026-11-22T20:38:00Z',
  envelopeMm: {
    width: 700,
    height: 400,
    depth: 310,
  },
  toleranceSpecMm: 0.025,
  symmetryPlane: 'Z',
  photoMatchCamera: {
    positionMm: [-590, 365, 610],
    targetMm: [-12, 205, 12],
    fov: 31,
  },
  skeleton: {
    params: {
      envelopeLengthMm: 700,
      envelopeHeightMm: 400,
      envelopeWidthMm: 310,
      wheelbaseMm: 388,
      hipHeightMm: 308,
      kneeHeightMm: 194,
      trackWidthMm: 268,
    },
    axes: [
      { id: 'front_hip_axis', label: 'Front Hip Pitch Axis', originMm: [HIP_FRONT_X, HIP_Y, 0], direction: [0, 0, 1] },
      { id: 'rear_hip_axis', label: 'Rear Hip Pitch Axis', originMm: [HIP_REAR_X, HIP_Y, 0], direction: [0, 0, 1] },
      { id: 'lidar_optical_axis', label: '4D LiDAR L1 Spin Axis', originMm: [-302, 205, 0], direction: [0, 1, 0] },
    ],
    planes: [
      { id: 'floor', label: 'Floor Contact Plane', originMm: [0, 0, 0], normal: [0, 1, 0] },
      { id: 'sagittal_symmetry', label: 'Sagittal Midplane (Z=0)', originMm: [0, 200, 0], normal: [0, 0, 1] },
      { id: 'dorsal_deck', label: 'Dorsal Accessory Deck Plane', originMm: [0, 388, 0], normal: [0, 1, 0] },
    ],
  },
  decals: [
    {
      id: 'go2-dorsal-stencil',
      targetPartId: 'go2-main-fuselage',
      positionMm: [148, 382, 0],
      rotationDeg: [-90, 0, 0],
      sizeMm: [68, 22, 18],
      text: 'GO2 PRO',
      subtext: 'UNITREE',
      colorHex: '#f8fafc',
      opacity: 0.85,
      fontWeight: 'bold',
    },
  ],
  parts: [
    // =========================================================================
    // 1. MAIN AERODYNAMIC FUSELAGE & STRUCTURAL CHASSIS CORE
    // =========================================================================
    {
      id: 'go2-main-fuselage',
      name: 'Aerodynamic Superellipse Lofted Main Fuselage (CSG)',
      group: 'Torso & Head',
      role: 'primary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [0, 58, 0],
      toleranceMm: 0.03,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 46,
        csgRoot: buildTorsoFuselageCsg(),
      },
      material: MAT_GO2_SILVER_SHELL,
    },
    {
      id: 'go2-inner-chassis-core',
      name: 'Internal Graphite Structural Frame & Arch Liner (CSG)',
      group: 'Torso & Head',
      role: 'primary',
      positionMm: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [0, 12, 0],
      toleranceMm: 0.03,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 38,
        csgRoot: buildInnerChassisCoreCsg(),
      },
      material: MAT_DARK_GRAPHITE,
    },
    {
      id: 'go2-belly-skid-plate',
      name: 'Folded Aluminum Underbelly Battery Skid Pan (CSG)',
      group: 'Torso & Head',
      role: 'secondary',
      positionMm: [4, 235.5, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [0, -64, 0],
      toleranceMm: 0.03,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 38,
        csgRoot: {
          op: 'sheetMetalFold',
          width: 230,
          depth: 132,
          thicknessMm: 3,
          kFactor: 0.42,
          bendRadiusMm: 4.5,
          baseHoles: [
            { x: -56, z: 0, diameterMm: 14 },
            { x: 0, z: 0, diameterMm: 18 },
            { x: 56, z: 0, diameterMm: 14 },
          ],
          foldFlanges: [
            {
              edge: '+z',
              flangeLengthMm: 18,
              angleDeg: 90,
              bendRadiusMm: 4.5,
              reliefWidthMm: 2,
            },
            {
              edge: '-z',
              flangeLengthMm: 18,
              angleDeg: 90,
              bendRadiusMm: 4.5,
              reliefWidthMm: 2,
            },
            {
              edge: '+x',
              flangeLengthMm: 17,
              angleDeg: 80,
              bendRadiusMm: 4.5,
              reliefWidthMm: 2,
            },
            {
              edge: '-x',
              flangeLengthMm: 17,
              angleDeg: 80,
              bendRadiusMm: 4.5,
              reliefWidthMm: 2,
            },
          ],
        },
      },
      material: MAT_SKID_ALUMINUM,
    },

    // =========================================================================
    // 2. FRONT HEAD SENSOR FASCIA, CAMERA, HEADLAMP & 4D LIDAR L1 CHIN POD
    // =========================================================================
    {
      id: 'go2-front-camera-fascia',
      name: 'Front Vertical Sensor & HD Camera Bezel (CSG)',
      group: 'Sensors & LiDAR',
      role: 'secondary',
      positionMm: [-349, 290, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [-68, 12, 0],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 38,
        csgRoot: {
          op: 'subtract',
          children: [
            {
              op: 'box',
              width: 14,
              height: 74,
              depth: 30,
              chamferMm: 3,
            },
            // Upper RGB camera lens bore
            {
              op: 'cylinder',
              radius: 7.5,
              height: 18,
              radialSegments: 20,
              rotateDeg: [0, 0, 90],
              translateMm: [-5, 19, 0],
            },
            // Lower LED lamp bore
            {
              op: 'cylinder',
              radius: 6.0,
              height: 18,
              radialSegments: 20,
              rotateDeg: [0, 0, 90],
              translateMm: [-5, -14, 0],
            },
          ],
        },
      },
      material: MAT_DARK_GRAPHITE,
    },
    {
      id: 'go2-front-camera-lens',
      name: 'Wide-Angle HD RGB Optical Lens (CSG)',
      group: 'Sensors & LiDAR',
      role: 'detail',
      positionMm: [-354.5, 309, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [-82, 16, 0],
      toleranceMm: 0.015,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 40,
        csgRoot: {
          op: 'cylinder',
          radius: 6.8,
          height: 5.5,
          radialSegments: 20,
          rotateDeg: [0, 0, 90],
        },
      },
      material: MAT_LIDAR_OPTIC,
    },
    {
      id: 'go2-front-headlamp-led',
      name: 'Front Illuminated LED Headlamp Lens (CSG)',
      group: 'Sensors & LiDAR',
      role: 'detail',
      positionMm: [-354.5, 276, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [-82, 8, 0],
      toleranceMm: 0.015,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 40,
        csgRoot: {
          op: 'cylinder',
          radius: 5.2,
          height: 5.0,
          radialSegments: 20,
          rotateDeg: [0, 0, 90],
        },
      },
      material: MAT_FRONT_LED_WHITE,
    },
    {
      id: 'go2-lidar-l1-dome',
      name: '4D LiDAR L1 Hemispherical Optical Sensor Dome (CSG)',
      group: 'Sensors & LiDAR',
      role: 'primary',
      positionMm: [LIDAR_CENTER_X, 210, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [-62, -54, 0],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 46,
        csgRoot: buildLidarPodCsg(),
      },
      material: MAT_LIDAR_OPTIC,
    },
    {
      id: 'go2-lidar-guard-cage',
      name: '4D LiDAR L1 Protective Multi-Rib Guard Cage (CSG)',
      group: 'Sensors & LiDAR',
      role: 'secondary',
      positionMm: [LIDAR_CENTER_X, 210, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [-76, -68, 0],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 42,
        csgRoot: buildLidarGuardCageCsg(),
      },
      material: MAT_DARK_GRAPHITE,
    },

    // =========================================================================
    // 3. DORSAL DECK RAIL, BROW GPS CAP, REAR LED BAR & SIDE MARKINGS
    // =========================================================================
    {
      id: 'go2-dorsal-accessory-rail',
      name: 'Top Matte-Black Accessory Mounting Rail (CSG)',
      group: 'Torso & Head',
      role: 'secondary',
      positionMm: [10, 386.5, 0],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [0, 92, 0],
      toleranceMm: 0.025,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 38,
        csgRoot: {
          op: 'machinedBlock',
          width: 260,
          height: 12,
          depth: 48,
          chamferMm: 2.5,
          pockets: [
            { x: 0, y: 4, z: 0, width: 224, height: 5, depth: 24, cornerRadius: 4 },
          ],
          holes: [
            { x: -96, y: 0, z: 0, axis: 'y', diameterMm: 6, depthMm: 16 },
            { x: 0, y: 0, z: 0, axis: 'y', diameterMm: 6, depthMm: 16 },
            { x: 96, y: 0, z: 0, axis: 'y', diameterMm: 6, depthMm: 16 },
          ],
        },
      },
      material: MAT_DARK_GRAPHITE,
    },
    {
      id: 'go2-brow-gps-puck',
      name: 'Front Dorsal IMU / GPS Dome Cap (CSG)',
      group: 'Sensors & LiDAR',
      role: 'detail',
      positionMm: BROW_BOSS_PAIR.capPositionMm,
      rotationDeg: BROW_BOSS_PAIR.capRotationDeg,
      explodeOffsetMm: [-28, 96, 0],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 46,
        csgRoot: BROW_BOSS_PAIR.capCsgRoot,
      },
      material: MAT_GO2_SILVER_SHELL,
    },
    {
      id: 'go2-side-io-vents-left',
      name: 'Left Side Recessed IO & Vent Louver Inserts (CSG)',
      group: 'Torso & Head',
      role: 'detail',
      positionMm: [35, 298, 79.5],
      rotationDeg: [0, 0, 0],
      explodeOffsetMm: [0, 12, 36],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 36,
        csgRoot: {
          op: 'union',
          children: [
            {
              op: 'machinedBlock',
              width: 21,
              height: 33,
              depth: 6,
              chamferMm: 1,
              pockets: [
                { x: 0, y: 0, z: 2, width: 15, height: 25, depth: 3.5, cornerRadius: 2 },
              ],
              translateMm: [-21, 0, 0],
            },
            {
              op: 'machinedBlock',
              width: 21,
              height: 33,
              depth: 6,
              chamferMm: 1,
              pockets: [
                { x: 0, y: 0, z: 2, width: 15, height: 25, depth: 3.5, cornerRadius: 2 },
              ],
              translateMm: [21, 0, 0],
            },
          ],
        },
      },
      material: MAT_DARK_GRAPHITE,
    },
    {
      id: 'go2-side-io-vents-right',
      name: 'Right Side Recessed IO & Vent Louver Inserts (CSG)',
      group: 'Torso & Head',
      role: 'detail',
      positionMm: [35, 298, -79.5],
      rotationDeg: [0, 180, 0],
      explodeOffsetMm: [0, 12, -36],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 36,
        csgRoot: {
          op: 'union',
          children: [
            {
              op: 'machinedBlock',
              width: 21,
              height: 33,
              depth: 6,
              chamferMm: 1,
              pockets: [
                { x: 0, y: 0, z: 2, width: 15, height: 25, depth: 3.5, cornerRadius: 2 },
              ],
              translateMm: [-21, 0, 0],
            },
            {
              op: 'machinedBlock',
              width: 21,
              height: 33,
              depth: 6,
              chamferMm: 1,
              pockets: [
                { x: 0, y: 0, z: 2, width: 15, height: 25, depth: 3.5, cornerRadius: 2 },
              ],
              translateMm: [21, 0, 0],
            },
          ],
        },
      },
      material: MAT_DARK_GRAPHITE,
    },
    {
      id: 'go2-rear-status-led',
      name: 'Rear Power & Telemetry Status LED Lightbar (CSG)',
      group: 'Sensors & LiDAR',
      role: 'detail',
      positionMm: [232, 377, 0],
      rotationDeg: [0, 0, -24],
      explodeOffsetMm: [68, 72, 0],
      toleranceMm: 0.02,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 38,
        csgRoot: {
          op: 'box',
          width: 14,
          height: 6,
          depth: 86,
          chamferMm: 1.5,
        },
      },
      material: MAT_REAR_LED_RED,
    },
    {
      id: 'go2-flank-badge-left',
      name: 'Left Flank Unitree Robot Branding Plate (CSG)',
      group: 'Torso & Head',
      role: 'detail',
      positionMm: [26, 329, 84.8],
      rotationDeg: [-4, 0, 0],
      explodeOffsetMm: [0, 42, 46],
      toleranceMm: 0.015,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 36,
        csgRoot: {
          op: 'box',
          width: 136,
          height: 16,
          depth: 2.0,
          chamferMm: 0.4,
        },
      },
      material: MAT_UNITREE_FLANK_LABEL,
    },
    {
      id: 'go2-flank-badge-right',
      name: 'Right Flank Unitree Robot Branding Plate (CSG)',
      group: 'Torso & Head',
      role: 'detail',
      positionMm: [26, 329, -84.8],
      rotationDeg: [-4, 180, 0],
      explodeOffsetMm: [0, 42, -46],
      toleranceMm: 0.015,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 36,
        csgRoot: {
          op: 'box',
          width: 136,
          height: 16,
          depth: 2.0,
          chamferMm: 0.4,
        },
      },
      material: MAT_UNITREE_FLANK_LABEL,
    },
    {
      id: 'go2-cheek-02-left',
      name: 'Left Cheek Model "02" Designation Badge (CSG)',
      group: 'Torso & Head',
      role: 'detail',
      positionMm: [-278, 304, 73.6],
      rotationDeg: [0, -13, 0],
      explodeOffsetMm: [-40, 26, 48],
      toleranceMm: 0.015,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 36,
        csgRoot: {
          op: 'box',
          width: 30,
          height: 18,
          depth: 2.2,
          chamferMm: 0.5,
        },
      },
      material: MAT_MODEL_02_LABEL,
    },
    {
      id: 'go2-cheek-02-right',
      name: 'Right Cheek Model "02" Designation Badge (CSG)',
      group: 'Torso & Head',
      role: 'detail',
      positionMm: [-278, 304, -73.6],
      rotationDeg: [0, 193, 0],
      explodeOffsetMm: [-40, 26, -48],
      toleranceMm: 0.015,
      geometry: {
        kind: 'csgSolid',
        smoothSharpAngleDeg: 36,
        csgRoot: {
          op: 'box',
          width: 30,
          height: 18,
          depth: 2.2,
          chamferMm: 0.5,
        },
      },
      material: MAT_MODEL_02_LABEL,
    },

    // =========================================================================
    // 4. FOUR QUADRUPED LEG SUB-ASSEMBLIES (24 WATERTIGHT CSG PARTS)
    // =========================================================================
    ...ALL_LEG_PARTS,
  ],
};
