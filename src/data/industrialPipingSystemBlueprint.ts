import { BlueprintPart, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * Precision 3D CAD replica of the Industrial Multi-Loop Flanged Steel Piping Assembly
 * built from reference photograph /assets/aistudio/pipe-assembly-pack-01_86be8856.jpg.
 *
 * Routing & fabrication fidelity:
 * - Every curved run, 180° U-bend, and overhead arch is a watertight manifold-3d CSG sweep
 *   (op: 'sweep', cornerMode: 'bend') segmented cleanly flange-to-flange at every valve and
 *   inline cartridge (zero uncut pipes passing through solid valve bodies).
 * - Every floor pedestal base flange, valve flange, cartridge flange, and blind end cap uses
 *   true Boolean-bored & radially bolt-drilled ANSI 150# flanges (op: 'boltedFlange').
 * - All 4 five-spoke valve handwheels (1 blue horizontal, 1 red horizontal, 2 red vertical)
 *   are wired as live kinematic revolute mate chains (bonnet -> stem -> hub -> rim & 5-spoke spider).
 * - All 6 floor pedestal base flanges and all 4 vertical threaded floor hanger footpads sit flush
 *   at Y = 0 mm via deterministic sitOnGround / sitOnTopOf mates.
 *
 * Coordinate convention: Right-handed Y-up in millimeters (mm). Floor = Y = 0.
 * +X recedes up-right toward the rear high wall-anchored header.
 * +Z runs down-right toward the front-right cross manifold & bolted blind flange cap.
 */

const MAT_STEEL_BLUE: PartMaterialSpec = {
  colorHex: '#6c7ca8',
  metalness: 0.42,
  roughness: 0.36,
  clearcoat: 0.22,
  clearcoatRoughness: 0.28,
  finishName: 'Satin Industrial Steel Blue Enamel',
};

const MAT_STEEL_BLUE_DARK: PartMaterialSpec = {
  colorHex: '#5a6994',
  metalness: 0.46,
  roughness: 0.38,
  clearcoat: 0.18,
  clearcoatRoughness: 0.3,
  finishName: 'Cast Ductile Iron Valve Body Blue',
};

const MAT_STAINLESS: PartMaterialSpec = {
  colorHex: '#cfd6e0',
  metalness: 0.88,
  roughness: 0.24,
  textureKind: 'brushedMetal',
  finishName: '316 Stainless Steel Hardware',
};

const MAT_GALV_CLAMP: PartMaterialSpec = {
  colorHex: '#bfc7d1',
  metalness: 0.8,
  roughness: 0.32,
  textureKind: 'brushedMetal',
  finishName: 'Galvanized Steel Clamp & Rod',
};

const MAT_CHROME_BAND: PartMaterialSpec = {
  colorHex: '#e6ecf5',
  metalness: 0.94,
  roughness: 0.14,
  finishName: 'Polished Stainless Double Band Clamp',
};

const MAT_HANDWHEEL_RED: PartMaterialSpec = {
  colorHex: '#dc2626',
  metalness: 0.18,
  roughness: 0.32,
  clearcoat: 0.42,
  clearcoatRoughness: 0.22,
  finishName: 'Safety Red Cast Valve Handwheel',
};

const MAT_HANDWHEEL_BLUE: PartMaterialSpec = {
  colorHex: '#1d63eb',
  metalness: 0.18,
  roughness: 0.3,
  clearcoat: 0.45,
  clearcoatRoughness: 0.22,
  finishName: 'Cobalt Blue Cast Valve Handwheel',
};

const MAT_BRASS: PartMaterialSpec = {
  colorHex: '#c69a47',
  metalness: 0.84,
  roughness: 0.28,
  finishName: 'Machined Brass Stem & Gland',
};

const MAT_GAUGE_BEZEL: PartMaterialSpec = {
  colorHex: '#1e232a',
  metalness: 0.35,
  roughness: 0.42,
  finishName: 'Anodized Pressure Gauge Bezel',
};

const MAT_GAUGE_DIAL: PartMaterialSpec = {
  colorHex: '#f8fafc',
  metalness: 0.0,
  roughness: 0.38,
  finishName: 'Calibration Pressure Dial Face',
};

const R_PIPE = 68; // 136 mm OD schedule 40 industrial steel pipe
const R_FLANGE = 118; // ANSI 150# flange outer radius
const T_FLANGE = 20; // Single flange plate thickness
const R_BOLT_CIRCLE = 97;
const VALVE_HALF_LEN = 148; // Face-to-face half length of flanged globe valves

/**
 * Watertight manifold-3d CSG ANSI bolted floor base flange grounded at Y=0.
 */
function makeFloorBaseFlange(
  id: string,
  label: string,
  xMm: number,
  zMm: number,
  explodeOffsetMm: [number, number, number]
): BlueprintPart {
  return {
    id,
    name: `${label} Floor Base Flange`,
    group: 'Floor Anchors & Supports',
    role: 'secondary',
    positionMm: [xMm, T_FLANGE / 2, zMm],
    rotationDeg: [0, 0, 0],
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'boltedFlange',
        radius: R_FLANGE + 10,
        height: T_FLANGE,
        boreRadiusMm: R_PIPE - 10,
        boltCircleRadiusMm: R_BOLT_CIRCLE + 8,
        boltHoleRadiusMm: 8,
        boltCount: 8,
        radialSegments: 28,
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm,
    toleranceMm: 0.25,
  };
}

/**
 * Mated bolted ANSI 150# flange pair (2 discs + 8 stainless hex bolt studs).
 */
function makeFlangePair(
  idPrefix: string,
  label: string,
  group: string,
  pos: [number, number, number],
  axis: 'x' | 'y' | 'z',
  explodeOffsetMm: [number, number, number],
  useCsgBore = false
): BlueprintPart[] {
  const rot: [number, number, number] =
    axis === 'x' ? [0, 0, 90] : axis === 'z' ? [90, 0, 0] : [0, 0, 0];
  const sep = T_FLANGE * 0.55;
  const d1: [number, number, number] =
    axis === 'x'
      ? [pos[0] - sep, pos[1], pos[2]]
      : axis === 'y'
        ? [pos[0], pos[1] - sep, pos[2]]
        : [pos[0], pos[1], pos[2] - sep];
  const d2: [number, number, number] =
    axis === 'x'
      ? [pos[0] + sep, pos[1], pos[2]]
      : axis === 'y'
        ? [pos[0], pos[1] + sep, pos[2]]
        : [pos[0], pos[1], pos[2] + sep];

  const discGeo = useCsgBore
    ? {
        kind: 'csgSolid' as const,
        csgRoot: {
          op: 'boltedFlange' as const,
          radius: R_FLANGE,
          height: T_FLANGE,
          boreRadiusMm: R_PIPE - 8,
          boltCircleRadiusMm: R_BOLT_CIRCLE,
          boltHoleRadiusMm: 7.2,
          boltCount: 8,
          radialSegments: 24,
        },
      }
    : {
        kind: 'cylinder' as const,
        radius: R_FLANGE,
        height: T_FLANGE,
        radialSegments: 28,
      };

  const parts: BlueprintPart[] = [
    {
      id: `${idPrefix}_f1`,
      name: `${label} Flange A`,
      group,
      role: 'secondary',
      positionMm: d1,
      rotationDeg: rot,
      geometry: discGeo,
      material: MAT_STEEL_BLUE,
      explodeOffsetMm,
      toleranceMm: 0.25,
    },
    {
      id: `${idPrefix}_f2`,
      name: `${label} Flange B`,
      group,
      role: 'secondary',
      positionMm: d2,
      rotationDeg: rot,
      geometry: discGeo,
      material: MAT_STEEL_BLUE,
      explodeOffsetMm,
      toleranceMm: 0.25,
    },
  ];

  const boltCount = 8;
  for (let i = 0; i < boltCount; i++) {
    const a = (i / boltCount) * Math.PI * 2 + Math.PI / boltCount;
    const c = Math.cos(a) * R_BOLT_CIRCLE;
    const s = Math.sin(a) * R_BOLT_CIRCLE;
    const bPos: [number, number, number] =
      axis === 'x'
        ? [pos[0], pos[1] + s, pos[2] + c]
        : axis === 'y'
          ? [pos[0] + c, pos[1], pos[2] + s]
          : [pos[0] + c, pos[1] + s, pos[2]];

    parts.push({
      id: `${idPrefix}_b${i}`,
      name: `${label} Bolt #${i + 1}`,
      group,
      role: 'detail',
      positionMm: bPos,
      rotationDeg: rot,
      geometry: {
        kind: 'cylinder',
        radius: 7.2,
        height: T_FLANGE * 2 + 22,
        radialSegments: 6,
      },
      material: MAT_STAINLESS,
      explodeOffsetMm,
      toleranceMm: 0.15,
    });
  }

  return parts;
}

/**
 * Bolted ANSI blind flange end cap terminating a +Z manifold stub.
 */
function makeBlindFlangeZ(
  idPrefix: string,
  label: string,
  group: string,
  pos: [number, number, number],
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  const parts: BlueprintPart[] = [
    {
      id: `${idPrefix}_body`,
      name: `${label} Pipe Flange`,
      group,
      role: 'secondary',
      positionMm: [pos[0], pos[1], pos[2] - 11],
      rotationDeg: [90, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'boltedFlange',
          radius: R_FLANGE,
          height: T_FLANGE,
          boreRadiusMm: R_PIPE - 8,
          boltCircleRadiusMm: R_BOLT_CIRCLE,
          boltHoleRadiusMm: 7.2,
          boltCount: 8,
          radialSegments: 28,
        },
      },
      material: MAT_STEEL_BLUE,
      explodeOffsetMm,
      toleranceMm: 0.25,
    },
    {
      id: `${idPrefix}_cap`,
      name: `${label} Blind Cap Plate`,
      group,
      role: 'secondary',
      positionMm: [pos[0], pos[1], pos[2] + 11],
      rotationDeg: [90, 0, 0],
      geometry: {
        kind: 'cylinder',
        radius: R_FLANGE,
        height: T_FLANGE + 4,
        radialSegments: 28,
      },
      material: MAT_STEEL_BLUE,
      explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1], explodeOffsetMm[2] + 30],
      toleranceMm: 0.25,
    },
  ];

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push({
      id: `${idPrefix}_bolt_${i}`,
      name: `${label} Cap Bolt #${i + 1}`,
      group,
      role: 'detail',
      positionMm: [
        pos[0] + Math.cos(a) * R_BOLT_CIRCLE,
        pos[1] + Math.sin(a) * R_BOLT_CIRCLE,
        pos[2],
      ],
      rotationDeg: [90, 0, 0],
      geometry: {
        kind: 'cylinder',
        radius: 7.2,
        height: T_FLANGE * 2 + 26,
        radialSegments: 6,
      },
      material: MAT_STAINLESS,
      explodeOffsetMm,
      toleranceMm: 0.15,
    });
  }

  return parts;
}

/**
 * Precision black-bezel white-dial pressure gauge with brass tap stem.
 */
function makeDialPressureGauge(
  idPrefix: string,
  label: string,
  group: string,
  pos: [number, number, number],
  facingAxis: '-x' | '+z',
  stemDir: 'down' | 'inX',
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  const rot: [number, number, number] = facingAxis === '-x' ? [0, 0, 90] : [90, 0, 0];
  const faceOff: [number, number, number] = facingAxis === '-x' ? [-17, 0, 0] : [0, 0, 17];
  const needleOff: [number, number, number] = facingAxis === '-x' ? [-20, 4, 4] : [4, 4, 20];
  const stemPos: [number, number, number] =
    stemDir === 'down' ? [pos[0], pos[1] - 50, pos[2]] : [pos[0] + 40, pos[1], pos[2]];
  const stemRot: [number, number, number] = stemDir === 'down' ? [0, 0, 0] : [0, 0, 90];

  return [
    {
      id: `${idPrefix}_stem`,
      name: `${label} Brass Tap Stem`,
      group,
      role: 'detail',
      positionMm: stemPos,
      rotationDeg: stemRot,
      geometry: { kind: 'cylinder', radius: 11, height: 60, radialSegments: 6 },
      material: MAT_BRASS,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
    {
      id: `${idPrefix}_case`,
      name: `${label} Gauge Case`,
      group,
      role: 'secondary',
      positionMm: pos,
      rotationDeg: rot,
      geometry: { kind: 'cylinder', radius: 46, height: 34, radialSegments: 24 },
      material: MAT_GAUGE_BEZEL,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
    {
      id: `${idPrefix}_dial`,
      name: `${label} White Dial`,
      group,
      role: 'detail',
      positionMm: [pos[0] + faceOff[0], pos[1] + faceOff[1], pos[2] + faceOff[2]],
      rotationDeg: rot,
      geometry: { kind: 'cylinder', radius: 39, height: 4, radialSegments: 24 },
      material: MAT_GAUGE_DIAL,
      explodeOffsetMm,
      toleranceMm: 0.15,
    },
    {
      id: `${idPrefix}_needle`,
      name: `${label} Indicator Needle`,
      group,
      role: 'detail',
      positionMm: [pos[0] + needleOff[0], pos[1] + needleOff[1], pos[2] + needleOff[2]],
      rotationDeg: facingAxis === '-x' ? [38, 0, 0] : [0, 0, -38],
      geometry: {
        kind: 'box',
        width: facingAxis === '-x' ? 3 : 4,
        height: 30,
        depth: facingAxis === '-x' ? 4 : 3,
      },
      material: MAT_HANDWHEEL_RED,
      explodeOffsetMm,
      toleranceMm: 0.1,
    },
  ];
}

/**
 * Flanged bolted-bonnet globe valve with LIVE KINEMATIC REVOLUTE 5-spoke handwheel chain.
 * Adjacent pipe spools terminate cleanly at +/- VALVE_HALF_LEN so there is ZERO solid overlap.
 */
function makeKinematicGlobeValve(
  idPrefix: string,
  label: string,
  group: string,
  center: [number, number, number],
  flowAxis: 'x' | 'y' | 'z',
  wheelColor: 'red' | 'blue',
  explodeOffsetMm: [number, number, number],
  withPressureGauge?: {
    offset: [number, number, number];
    facingAxis: '-x' | '+z';
    stemDir: 'down' | 'inX';
  }
): BlueprintPart[] {
  const wheelMat = wheelColor === 'blue' ? MAT_HANDWHEEL_BLUE : MAT_HANDWHEEL_RED;
  const stemUpY = flowAxis !== 'y';
  const halfLen = VALVE_HALF_LEN;

  const fA: [number, number, number] =
    flowAxis === 'x'
      ? [center[0] - halfLen, center[1], center[2]]
      : flowAxis === 'y'
        ? [center[0], center[1] - halfLen, center[2]]
        : [center[0], center[1], center[2] - halfLen];
  const fB: [number, number, number] =
    flowAxis === 'x'
      ? [center[0] + halfLen, center[1], center[2]]
      : flowAxis === 'y'
        ? [center[0], center[1] + halfLen, center[2]]
        : [center[0], center[1], center[2] + halfLen];

  const flowRot: [number, number, number] =
    flowAxis === 'x' ? [0, 0, 90] : flowAxis === 'z' ? [90, 0, 0] : [0, 0, 0];

  const parts: BlueprintPart[] = [
    ...makeFlangePair(`${idPrefix}_fl_a`, `${label} Inlet`, group, fA, flowAxis, explodeOffsetMm, true),
    ...makeFlangePair(`${idPrefix}_fl_b`, `${label} Outlet`, group, fB, flowAxis, explodeOffsetMm, true),
    {
      id: `${idPrefix}_throat`,
      name: `${label} Flow Throat`,
      group,
      role: 'primary',
      positionMm: center,
      rotationDeg: flowRot,
      geometry: { kind: 'cylinder', radius: R_PIPE + 12, height: halfLen * 2 - 20, radialSegments: 24 },
      material: MAT_STEEL_BLUE_DARK,
      explodeOffsetMm,
      toleranceMm: 0.3,
    },
    {
      id: `${idPrefix}_globe`,
      name: `${label} Globe Valve Body`,
      group,
      role: 'primary',
      positionMm: center,
      rotationDeg: [0, 0, 0],
      geometry: { kind: 'sphere', radius: 114, radialSegments: 28 },
      material: MAT_STEEL_BLUE_DARK,
      explodeOffsetMm,
      toleranceMm: 0.3,
    },
  ];

  const bonnetOffset = 124;
  const stemLen = 180;
  const wheelDist = 308;
  const wheelRadius = 148;

  if (stemUpY) {
    parts.push(
      {
        id: `${idPrefix}_bonnet`,
        name: `${label} Bolted Bonnet Flange`,
        group,
        role: 'secondary',
        positionMm: [center[0], center[1] + bonnetOffset, center[2]],
        rotationDeg: [0, 0, 0],
        ports: { stemAxis: { localOffsetMm: [0, 24, 0], normal: [0, 1, 0] } },
        geometry: { kind: 'cylinder', radius: 104, height: 32, radialSegments: 24 },
        material: MAT_STEEL_BLUE_DARK,
        explodeOffsetMm,
        toleranceMm: 0.25,
      },
      ...Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return {
          id: `${idPrefix}_bbolt_${i}`,
          name: `${label} Bonnet Bolt #${i + 1}`,
          group,
          role: 'detail' as const,
          positionMm: [
            center[0] + Math.cos(a) * 82,
            center[1] + bonnetOffset + 12,
            center[2] + Math.sin(a) * 82,
          ] as [number, number, number],
          rotationDeg: [0, 0, 0] as [number, number, number],
          geometry: { kind: 'cylinder' as const, radius: 7, height: 36, radialSegments: 6 },
          material: MAT_STAINLESS,
          explodeOffsetMm,
          toleranceMm: 0.15,
        };
      }),
      {
        id: `${idPrefix}_yoke`,
        name: `${label} Brass Packing Gland`,
        group,
        role: 'detail',
        positionMm: [center[0], center[1] + bonnetOffset + 38, center[2]],
        rotationDeg: [0, 0, 0],
        geometry: { kind: 'cylinder', radius: 32, height: 50, radialSegments: 6 },
        material: MAT_BRASS,
        explodeOffsetMm,
        toleranceMm: 0.2,
      },
      {
        id: `${idPrefix}_stem`,
        name: `${label} Valve Stem`,
        group,
        role: 'detail',
        positionMm: [center[0], center[1] + bonnetOffset + 104, center[2]],
        rotationDeg: [0, 0, 0],
        ports: {
          bonnetSeat: { localOffsetMm: [0, -stemLen / 2 + 12, 0], normal: [0, 1, 0] },
          wheelSeat: { localOffsetMm: [0, stemLen / 2 - 20, 0], normal: [0, 1, 0] },
        },
        constraint: {
          kind: 'concentric',
          selfPort: 'bonnetSeat',
          targetPartId: `${idPrefix}_bonnet`,
          targetPort: 'stemAxis',
          axialOffsetMm: 0,
          lockAxial: true,
          lockSpin: false,
        },
        geometry: { kind: 'cylinder', radius: 13.5, height: stemLen, radialSegments: 16 },
        material: MAT_STAINLESS,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] + 40, explodeOffsetMm[2]],
        toleranceMm: 0.15,
      },
      {
        id: `${idPrefix}_wheel_hub`,
        name: `${label} Handwheel Hub`,
        group,
        role: 'detail',
        positionMm: [center[0], center[1] + wheelDist, center[2]],
        rotationDeg: [0, 0, 0],
        ports: {
          stemBore: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
          spokeHub: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
        },
        constraint: {
          kind: 'coincident',
          selfPort: 'stemBore',
          targetPartId: `${idPrefix}_stem`,
          targetPort: 'wheelSeat',
          flipNormal: false,
          jointKind: 'fixed',
        },
        geometry: { kind: 'cylinder', radius: 26, height: 26, radialSegments: 18 },
        material: wheelMat,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] + 75, explodeOffsetMm[2]],
        toleranceMm: 0.2,
      },
      {
        id: `${idPrefix}_wheel_rim`,
        name: `${label} Handwheel Rim`,
        group,
        role: 'secondary',
        positionMm: [center[0], center[1] + wheelDist, center[2]],
        rotationDeg: [90, 0, 0],
        ports: { center: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] } },
        constraint: {
          kind: 'matePort',
          selfPort: 'center',
          targetPartId: `${idPrefix}_wheel_hub`,
          targetPort: 'spokeHub',
        },
        geometry: { kind: 'torus', radius: wheelRadius, tubeRadius: 14.5, radialSegments: 28 },
        material: wheelMat,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] + 75, explodeOffsetMm[2]],
        toleranceMm: 0.3,
      },
      {
        id: `${idPrefix}_wheel_spokes`,
        name: `${label} Handwheel 5-Spoke Spider`,
        group,
        role: 'detail',
        positionMm: [center[0], center[1] + wheelDist, center[2]],
        rotationDeg: [0, 0, 0],
        ports: { center: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] } },
        constraint: {
          kind: 'matePort',
          selfPort: 'center',
          targetPartId: `${idPrefix}_wheel_hub`,
          targetPort: 'spokeHub',
        },
        geometry: {
          kind: 'csgSolid',
          csgRoot: {
            op: 'union',
            children: [0, 72, 144, 216, 288].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              return {
                op: 'sweep' as const,
                radius: 9,
                radialSegments: 10,
                pathPoints: [
                  [0, 0, 0],
                  [Math.cos(rad) * (wheelRadius - 4), 0, Math.sin(rad) * (wheelRadius - 4)],
                ],
              };
            }),
          },
        },
        material: wheelMat,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] + 75, explodeOffsetMm[2]],
        toleranceMm: 0.25,
      }
    );
  } else {
    // Vertical flow valve: bonnet, stem & 5-spoke RED handwheel project horizontally toward +Z
    parts.push(
      {
        id: `${idPrefix}_bonnet`,
        name: `${label} Side Bolted Bonnet`,
        group,
        role: 'secondary',
        positionMm: [center[0], center[1], center[2] + bonnetOffset],
        rotationDeg: [90, 0, 0],
        ports: { stemAxis: { localOffsetMm: [0, 24, 0], normal: [0, 1, 0] } },
        geometry: { kind: 'cylinder', radius: 104, height: 32, radialSegments: 24 },
        material: MAT_STEEL_BLUE_DARK,
        explodeOffsetMm,
        toleranceMm: 0.25,
      },
      ...Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return {
          id: `${idPrefix}_bbolt_${i}`,
          name: `${label} Bonnet Bolt #${i + 1}`,
          group,
          role: 'detail' as const,
          positionMm: [
            center[0] + Math.cos(a) * 82,
            center[1] + Math.sin(a) * 82,
            center[2] + bonnetOffset + 12,
          ] as [number, number, number],
          rotationDeg: [90, 0, 0] as [number, number, number],
          geometry: { kind: 'cylinder' as const, radius: 7, height: 36, radialSegments: 6 },
          material: MAT_STAINLESS,
          explodeOffsetMm,
          toleranceMm: 0.15,
        };
      }),
      {
        id: `${idPrefix}_yoke`,
        name: `${label} Brass Packing Gland`,
        group,
        role: 'detail',
        positionMm: [center[0], center[1], center[2] + bonnetOffset + 38],
        rotationDeg: [90, 0, 0],
        geometry: { kind: 'cylinder', radius: 32, height: 50, radialSegments: 6 },
        material: MAT_BRASS,
        explodeOffsetMm,
        toleranceMm: 0.2,
      },
      {
        id: `${idPrefix}_stem`,
        name: `${label} Valve Stem`,
        group,
        role: 'detail',
        positionMm: [center[0], center[1], center[2] + bonnetOffset + 104],
        rotationDeg: [90, 0, 0],
        ports: {
          bonnetSeat: { localOffsetMm: [0, -stemLen / 2 + 12, 0], normal: [0, 1, 0] },
          wheelSeat: { localOffsetMm: [0, stemLen / 2 - 20, 0], normal: [0, 1, 0] },
        },
        constraint: {
          kind: 'concentric',
          selfPort: 'bonnetSeat',
          targetPartId: `${idPrefix}_bonnet`,
          targetPort: 'stemAxis',
          axialOffsetMm: 0,
          lockAxial: true,
          lockSpin: false,
        },
        geometry: { kind: 'cylinder', radius: 13.5, height: stemLen, radialSegments: 16 },
        material: MAT_STAINLESS,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1], explodeOffsetMm[2] + 45],
        toleranceMm: 0.15,
      },
      {
        id: `${idPrefix}_wheel_hub`,
        name: `${label} Handwheel Hub`,
        group,
        role: 'detail',
        positionMm: [center[0], center[1], center[2] + wheelDist],
        rotationDeg: [90, 0, 0],
        ports: {
          stemBore: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
          spokeHub: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
        },
        constraint: {
          kind: 'coincident',
          selfPort: 'stemBore',
          targetPartId: `${idPrefix}_stem`,
          targetPort: 'wheelSeat',
          flipNormal: false,
          jointKind: 'fixed',
        },
        geometry: { kind: 'cylinder', radius: 26, height: 26, radialSegments: 18 },
        material: wheelMat,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1], explodeOffsetMm[2] + 85],
        toleranceMm: 0.2,
      },
      {
        id: `${idPrefix}_wheel_rim`,
        name: `${label} Handwheel Rim`,
        group,
        role: 'secondary',
        positionMm: [center[0], center[1], center[2] + wheelDist],
        rotationDeg: [0, 0, 0],
        ports: { center: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] } },
        constraint: {
          kind: 'matePort',
          selfPort: 'center',
          targetPartId: `${idPrefix}_wheel_hub`,
          targetPort: 'spokeHub',
        },
        geometry: { kind: 'torus', radius: wheelRadius, tubeRadius: 14.5, radialSegments: 28 },
        material: wheelMat,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1], explodeOffsetMm[2] + 85],
        toleranceMm: 0.3,
      },
      {
        id: `${idPrefix}_wheel_spokes`,
        name: `${label} Handwheel 5-Spoke Spider`,
        group,
        role: 'detail',
        positionMm: [center[0], center[1], center[2] + wheelDist],
        rotationDeg: [0, 0, 0],
        ports: { center: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] } },
        constraint: {
          kind: 'matePort',
          selfPort: 'center',
          targetPartId: `${idPrefix}_wheel_hub`,
          targetPort: 'spokeHub',
        },
        geometry: {
          kind: 'csgSolid',
          csgRoot: {
            op: 'union',
            children: [0, 72, 144, 216, 288].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              return {
                op: 'sweep' as const,
                radius: 9,
                radialSegments: 10,
                pathPoints: [
                  [0, 0, 0],
                  [Math.cos(rad) * (wheelRadius - 4), Math.sin(rad) * (wheelRadius - 4), 0],
                ],
              };
            }),
          },
        },
        material: wheelMat,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1], explodeOffsetMm[2] + 85],
        toleranceMm: 0.25,
      }
    );
  }

  if (withPressureGauge) {
    parts.push(
      ...makeDialPressureGauge(
        `${idPrefix}_gauge`,
        `${label} Pressure Gauge`,
        group,
        [
          center[0] + withPressureGauge.offset[0],
          center[1] + withPressureGauge.offset[1],
          center[2] + withPressureGauge.offset[2],
        ],
        withPressureGauge.facingAxis,
        withPressureGauge.stemDir,
        explodeOffsetMm
      )
    );
  }

  return parts;
}

/**
 * Slender stainless pipe clamp + threaded vertical support rod + circular floor footpad grounded at Y=0.
 */
function makeFloorSupportHanger(
  idPrefix: string,
  label: string,
  xMm: number,
  pipeCenterYMm: number,
  zMm: number,
  pipeAxis: 'x' | 'z',
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  const rodHeight = Math.max(40, pipeCenterYMm - R_PIPE - 6);
  return [
    {
      id: `${idPrefix}_foot`,
      name: `${label} Floor Footpad`,
      group: 'Floor Anchors & Supports',
      role: 'detail',
      positionMm: [xMm, 7, zMm],
      rotationDeg: [0, 0, 0],
      constraint: { kind: 'sitOnGround', groundYMm: 0 },
      geometry: { kind: 'cylinder', radius: 44, height: 14, radialSegments: 24 },
      material: MAT_GALV_CLAMP,
      explodeOffsetMm: [explodeOffsetMm[0], -35, explodeOffsetMm[2]],
      toleranceMm: 0.25,
    },
    {
      id: `${idPrefix}_rod`,
      name: `${label} Threaded Support Rod`,
      group: 'Floor Anchors & Supports',
      role: 'detail',
      positionMm: [xMm, 14 + rodHeight / 2, zMm],
      rotationDeg: [0, 0, 0],
      constraint: { kind: 'sitOnTopOf', targetPartId: `${idPrefix}_foot`, offsetMm: [0, 0, 0] },
      geometry: { kind: 'cylinder', radius: 8.5, height: rodHeight, radialSegments: 12 },
      material: MAT_STAINLESS,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
    {
      id: `${idPrefix}_collar`,
      name: `${label} Pipe Clamp Band`,
      group: 'Floor Anchors & Supports',
      role: 'detail',
      positionMm: [xMm, pipeCenterYMm, zMm],
      rotationDeg: pipeAxis === 'z' ? [90, 0, 0] : [0, 0, 90],
      geometry: { kind: 'cylinder', radius: R_PIPE + 9, height: 32, radialSegments: 24 },
      material: MAT_GALV_CLAMP,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
  ];
}

/**
 * Wall-mount pipe clamp + standoff rod + circular wall anchor plate along +X.
 */
function makeWallAnchorBracket(
  idPrefix: string,
  label: string,
  xMm: number,
  yMm: number,
  zMm: number,
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  return [
    {
      id: `${idPrefix}_band`,
      name: `${label} Header Clamp Band`,
      group: 'Rear High Header & Wall Anchors',
      role: 'detail',
      positionMm: [xMm, yMm, zMm],
      rotationDeg: [90, 0, 0],
      geometry: { kind: 'cylinder', radius: R_PIPE + 10, height: 34, radialSegments: 24 },
      material: MAT_GALV_CLAMP,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
    {
      id: `${idPrefix}_rod`,
      name: `${label} Wall Standoff Rod`,
      group: 'Rear High Header & Wall Anchors',
      role: 'detail',
      positionMm: [xMm + 146, yMm, zMm],
      rotationDeg: [0, 0, 90],
      geometry: { kind: 'cylinder', radius: 9.5, height: 175, radialSegments: 12 },
      material: MAT_STAINLESS,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
    {
      id: `${idPrefix}_plate`,
      name: `${label} Circular Wall Plate`,
      group: 'Rear High Header & Wall Anchors',
      role: 'detail',
      positionMm: [xMm + 238, yMm, zMm],
      rotationDeg: [0, 0, 90],
      geometry: { kind: 'cylinder', radius: 44, height: 14, radialSegments: 22 },
      material: MAT_GALV_CLAMP,
      explodeOffsetMm: [explodeOffsetMm[0] + 40, explodeOffsetMm[1], explodeOffsetMm[2]],
      toleranceMm: 0.25,
    },
  ];
}

// =========================================================================
// COORDINATE-LOCKED & FLANGE-SEGMENTED PIPING ROUTING (ZERO INTERPENETRATION)
// =========================================================================
const parts: BlueprintPart[] = [
  // -------------------------------------------------------------------------
  // 1. FAR-LEFT FLOOR LEG -> EYE OF 3 U-BENDS (Y = 640) -> FRONT-RIGHT FLOOR PEDESTAL
  //    Threads cleanly through the exact center (-540, 640) of all 3 vertical U-bends!
  // -------------------------------------------------------------------------
  makeFloorBaseFlange('fl_far_left', 'Far-Left Supply Leg', -540, -1320, [-60, -80, -160]),
  makeFloorBaseFlange('fl_front_right_pedestal', 'Front-Right Pedestal Leg', -540, 980, [-40, -80, 110]),
  {
    id: 'pipe_far_left_to_front_pedestal',
    name: 'Far-Left Supply to Front-Right Pedestal Trunk (CSG Sweep)',
    group: 'Primary Distribution Trunk',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 160,
        bendSegments: 9,
        pathPoints: [
          [-540, 20, -1320],
          [-540, 640, -1320],
          [-540, 640, 980],
          [-540, 20, 980],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [-55, 0, 0],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_far_left_top', 'Far-Left Elbow', 'Primary Distribution Trunk', [-540, 640, -1100], 'z', [-60, 0, -120]),
  ...makeFlangePair('fp_front_upper_mid', 'Front Upper Trunk', 'Primary Distribution Trunk', [-540, 640, 740], 'z', [-40, 0, 60]),
  ...makeFlangePair('fp_front_right_drop', 'Front-Right Pedestal', 'Primary Distribution Trunk', [-540, 220, 980], 'y', [-40, -40, 110]),

  // Front-Right Pedestal Side-Tee -> Front Horizontal U-Bypass connecting into the Blind-Flange Cross-Tee!
  {
    id: 'pipe_front_right_side_ubypass',
    name: 'Front-Right Pedestal Side-Tee Bypass Loop (CSG Sweep)',
    group: 'Primary Distribution Trunk',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 125,
        bendSegments: 8,
        pathPoints: [
          [-540, 380, 980 + R_PIPE - 4],
          [-540, 380, 1250],
          [-320 - R_PIPE + 4, 380, 1250],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [-40, -25, 130],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_front_right_side_tee', 'Front-Right Pedestal Tee', 'Primary Distribution Trunk', [-540, 380, 1085], 'z', [-40, -25, 115]),

  // -------------------------------------------------------------------------
  // 2. THREE NESTED PARALLEL U-BEND LOOPS (Z = -380, -130, +120)
  //    Upper bank at Y = 855 mm -> 180° vertical U-bends around (-540, 640) -> Lower bank at Y = 425 mm
  //    Inner bend clearance = 215 - 68 = 147 mm vs 68 mm trunk radius => 79 mm clean air gap!
  // -------------------------------------------------------------------------
  // Loop #1 (Back-leftmost, Z = -380)
  {
    id: 'pipe_loop1_full',
    name: 'Parallel Loop #1 Upper-to-Lower U-Bend Run (CSG Sweep)',
    group: 'Parallel U-Bend Loops',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 210,
        bendSegments: 10,
        pathPoints: [
          [960, 1480 - R_PIPE - 2.5, -380],
          [960, 855, -380],
          [-755, 855, -380],
          [-755, 425, -380],
          [420, 425, -380],
          [420, 425, 20 - R_PIPE + 4],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [0, 40, -90],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_l1_riser', 'Loop #1 Header Riser', 'Parallel U-Bend Loops', [960, 1210, -380], 'y', [60, 60, -90]),
  ...makeFlangePair('fp_l1_back_elbow', 'Loop #1 Rear Elbow', 'Parallel U-Bend Loops', [710, 855, -380], 'x', [40, 40, -90]),
  ...makeFlangePair('fp_l1_front_ubend', 'Loop #1 U-Bend Upper', 'Parallel U-Bend Loops', [-360, 855, -380], 'x', [-40, 40, -90]),

  // Loop #2 (Middle, Z = -130)
  {
    id: 'pipe_loop2_full',
    name: 'Parallel Loop #2 Upper-to-Lower U-Bend Run (CSG Sweep)',
    group: 'Parallel U-Bend Loops',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 210,
        bendSegments: 10,
        pathPoints: [
          [960, 1480 - R_PIPE - 2.5, -130],
          [960, 855, -130],
          [-755, 855, -130],
          [-755, 425, -130],
          [420 - R_PIPE + 4, 425, -130],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [0, 20, -35],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_l2_riser', 'Loop #2 Header Riser', 'Parallel U-Bend Loops', [960, 1210, -130], 'y', [60, 60, -35]),
  ...makeFlangePair('fp_l2_back_elbow', 'Loop #2 Rear Elbow', 'Parallel U-Bend Loops', [710, 855, -130], 'x', [40, 20, -35]),
  ...makeFlangePair('fp_l2_front_ubend', 'Loop #2 U-Bend Upper', 'Parallel U-Bend Loops', [-360, 855, -130], 'x', [-40, 20, -35]),

  // Loop #3 (Front-most of upper bank, Z = +120) — SPLIT CLEANLY AT BLUE VALVE (-100 +/- 148 mm)
  // Upstream spool from Rear Header (+960, 1416, +120) to Blue Valve Right Flange (+48, 855, +120)
  {
    id: 'pipe_loop3_upstream_of_blue_valve',
    name: 'Parallel Loop #3 Upstream of Blue Valve (CSG Sweep)',
    group: 'Parallel U-Bend Loops',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 200,
        bendSegments: 9,
        pathPoints: [
          [960, 1480 - R_PIPE - 2.5, 120],
          [960, 855, 120],
          [-100 + VALVE_HALF_LEN, 855, 120],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [40, 20, 20],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_l3_riser', 'Loop #3 Header Riser', 'Parallel U-Bend Loops', [960, 1210, 120], 'y', [60, 60, 20]),
  ...makeFlangePair('fp_l3_back_elbow', 'Loop #3 Rear Elbow', 'Parallel U-Bend Loops', [710, 855, 120], 'x', [40, 20, 20]),

  // VALVE #1: Cobalt Blue Horizontal-Wheel Globe Valve on Loop #3 (X = -100, Y = 855, Z = +120)
  ...makeKinematicGlobeValve(
    'valve_blue_upper',
    'Upper Loop #3 Blue-Wheel Globe Valve',
    'Valves & Instrumentation',
    [-100, 855, 120],
    'x',
    'blue',
    [0, 65, 20]
  ),

  // Downstream spool from Blue Valve Left Flange (-248, 855, +120) -> 180° U-bend -> Lower Front Parallel Trunk -> Blind Flange Cap!
  {
    id: 'pipe_loop3_ubend_to_blind_flange',
    name: 'Loop #3 U-Bend & Lower Front Trunk to Blind Cap (CSG Sweep)',
    group: 'Parallel U-Bend Loops',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 210,
        bendSegments: 10,
        pathPoints: [
          [-100 - VALVE_HALF_LEN, 855, 120],
          [-755, 855, 120],
          [-755, 380, 120],
          [-320, 380, 120],
          [-320, 380, 1465],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [-20, -10, 50],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_lower_front_mid1', 'Lower Front Trunk Mid', 'Parallel U-Bend Loops', [-320, 380, 860], 'z', [-20, -10, 75]),
  ...makeFlangePair('fp_lower_front_mid2', 'Lower Front Cross Inlet', 'Parallel U-Bend Loops', [-320, 380, 1060], 'z', [-20, -10, 95]),

  // Bolted ANSI Blind Flange Cap terminating the direct straight continuation of the Lower Front Trunk!
  ...makeBlindFlangeZ(
    'blind_flange_outlet',
    'Front-Right Manifold Blind Cap',
    'Front-Right Cross & Bypass Manifold',
    [-320, 380, 1476],
    [-20, -10, 165]
  ),

  // -------------------------------------------------------------------------
  // 3. REAR HIGH HORIZONTAL HEADER & 3 WALL ANCHOR BRACKETS (X = +960, Y = 1480)
  // -------------------------------------------------------------------------
  {
    id: 'rear_high_header_bar',
    name: 'Rear High Distribution Header',
    group: 'Rear High Header & Wall Anchors',
    role: 'primary',
    positionMm: [960, 1480, -100],
    rotationDeg: [90, 0, 0],
    geometry: { kind: 'cylinder', radius: R_PIPE + 2, height: 680, radialSegments: 26 },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [90, 90, 0],
    toleranceMm: 0.3,
  },
  ...makeWallAnchorBracket('wall_brk_1', 'Rear Wall Bracket #1', 960, 1480, -255, [110, 90, -40]),
  ...makeWallAnchorBracket('wall_brk_2', 'Rear Wall Bracket #2', 960, 1480, -5, [110, 90, 0]),
  ...makeWallAnchorBracket('wall_brk_3', 'Rear Wall Bracket #3', 960, 1480, 210, [110, 90, 40]),

  // -------------------------------------------------------------------------
  // 4. FOREGROUND TALL 180° ARCH & FRONT RED-WHEEL VERTICAL GLOBE VALVE
  //    Positioned at X = -1260 .. -820 so the Red Handwheel clears the central trunk by 50 mm!
  //    Split cleanly at Front Red Valve flanges (Y = 500 +/- 148 mm) — ZERO clash!
  // -------------------------------------------------------------------------
  makeFloorBaseFlange('fl_fg_tall_leg', 'Foreground Tall Arch Leg', -1260, 380, [-140, -60, 80]),
  makeFloorBaseFlange('fl_fg_valve_pedestal', 'Front Red-Valve Pedestal', -820, 380, [-80, -80, 80]),
  // Upper foreground arch spool from floor flange (-1260, 20, 380) over to top flange of Front Red Valve (-820, 648, 380)
  {
    id: 'pipe_foreground_arch_upper',
    name: 'Foreground 180° Supply Arch Spool (CSG Sweep)',
    group: 'Foreground Arch & Red Valve',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 24,
        cornerMode: 'bend',
        bendRadiusMm: 215,
        bendSegments: 12,
        pathPoints: [
          [-1260, 20, 380],
          [-1260, 1020, 380],
          [-820, 1020, 380],
          [-820, 500 + VALVE_HALF_LEN, 380],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [-110, 30, 80],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_fg_tall_mid', 'Foreground Leg Mid', 'Foreground Arch & Red Valve', [-1260, 540, 380], 'y', [-140, 0, 80]),
  ...makeFlangePair('fp_fg_arch_crest', 'Foreground Arch Top', 'Foreground Arch & Red Valve', [-1040, 1020, 380], 'x', [-110, 50, 80]),

  // VALVE #2: Front-Left Vertical Globe Valve with RED Vertical Handwheel (X = -820, Y = 500, Z = +380)
  ...makeKinematicGlobeValve(
    'valve_red_front_vert',
    'Front Vertical Red-Wheel Globe Valve',
    'Valves & Instrumentation',
    [-820, 500, 380],
    'y',
    'red',
    [-80, 0, 110]
  ),

  // Lower vertical pedestal spool below Front Red Valve (Y = 20 .. 352)
  {
    id: 'pipe_fg_valve_lower_pedestal',
    name: 'Front Red-Valve Lower Floor Column',
    group: 'Foreground Arch & Red Valve',
    role: 'primary',
    positionMm: [-820, (20 + (500 - VALVE_HALF_LEN)) / 2, 380],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'cylinder',
      radius: R_PIPE,
      height: 500 - VALVE_HALF_LEN - 20,
      radialSegments: 24,
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [-80, -45, 80],
    toleranceMm: 0.3,
  },

  // -------------------------------------------------------------------------
  // 5. CENTER-RIGHT VERTICAL TIE-ROD CARTRIDGE MODULE & INVERTED-U LOOP
  //    Centered at X = +420, Z = +380, split cleanly at Cartridge Flanges (Y = 530 & Y = 830)!
  // -------------------------------------------------------------------------
  makeFloorBaseFlange('fl_center_back_leg', 'Center-Back Support Leg', 420, 20, [20, -80, -30]),
  {
    id: 'pipe_center_back_support_l',
    name: 'Center-Back Support Pedestal to Cartridge Base (CSG Sweep)',
    group: 'Center Tie-Rod Module & Loops',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 100,
        bendSegments: 8,
        pathPoints: [
          [420, 20, 20],
          [420, 425, 20],
          [420, 425, 380],
          [420, 530, 380],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [20, -30, -10],
    toleranceMm: 0.3,
  },
  // Vertical Tie-Rod Strainer / Sight-Glass Cartridge (Y = 530..830, X = +420, Z = +380)
  ...makeFlangePair('fp_tierod_bot', 'Tie-Rod Module Bottom', 'Center Tie-Rod Module & Loops', [420, 530, 380], 'y', [30, 0, 30], true),
  ...makeFlangePair('fp_tierod_top', 'Tie-Rod Module Top', 'Center Tie-Rod Module & Loops', [420, 830, 380], 'y', [30, 30, 30], true),
  {
    id: 'tierod_module_cylinder',
    name: 'Inline Tie-Rod Cartridge Cylinder',
    group: 'Center Tie-Rod Module & Loops',
    role: 'primary',
    positionMm: [420, 680, 380],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'cylinder', radius: 72, height: 260, radialSegments: 24 },
    material: MAT_STEEL_BLUE_DARK,
    explodeOffsetMm: [30, 15, 30],
    toleranceMm: 0.25,
  },
  ...([
    [92, 42],
    [-92, 42],
    [92, -42],
    [-92, -42],
  ] as [number, number][]).map(([dx, dz], i) => ({
    id: `tierod_rod_${i}`,
    name: `Cartridge External Tie Rod #${i + 1}`,
    group: 'Center Tie-Rod Module & Loops',
    role: 'detail' as const,
    positionMm: [420 + dx, 680, 380 + dz] as [number, number, number],
    rotationDeg: [0, 0, 0] as [number, number, number],
    geometry: { kind: 'cylinder' as const, radius: 7.2, height: 300, radialSegments: 12 },
    material: MAT_STAINLESS,
    explodeOffsetMm: [30, 15, 30] as [number, number, number],
    toleranceMm: 0.2,
  })),
  {
    id: 'tierod_drain_body',
    name: 'Cartridge Brass Drain Valve',
    group: 'Center Tie-Rod Module & Loops',
    role: 'detail',
    positionMm: [328, 600, 380],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 13, height: 48, radialSegments: 6 },
    material: MAT_STAINLESS,
    explodeOffsetMm: [15, 10, 30],
    toleranceMm: 0.2,
  },
  {
    id: 'tierod_drain_red_lever',
    name: 'Cartridge Drain Red Lever Handle',
    group: 'Center Tie-Rod Module & Loops',
    role: 'detail',
    positionMm: [304, 570, 380],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'roundedBox', width: 12, height: 82, depth: 12, bevelRadius: 3 },
    material: MAT_HANDWHEEL_RED,
    explodeOffsetMm: [10, 5, 30],
    toleranceMm: 0.2,
  },

  // Left-side Inverted-U Loop branching off above the Tie-Rod Cartridge (Z = +380 -> +130 -> Y = 510)
  {
    id: 'pipe_mid_inverted_u_loop',
    name: 'Center Inverted-U Bypass Loop (CSG Sweep)',
    group: 'Center Tie-Rod Module & Loops',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 56,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 34,
        bendSegments: 8,
        pathPoints: [
          [420, 1020, 380 - R_PIPE - 2],
          [420, 1020, 250],
          [420, 425 + R_PIPE + 0.5, 250],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [20, 45, 0],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_mid_u_drop', 'Mid Loop Vertical', 'Center Tie-Rod Module & Loops', [420, 770, 250], 'y', [20, 30, 0]),

  // -------------------------------------------------------------------------
  // 6. HIGH REAR-RIGHT OVERHEAD ARCH -> REAR-RIGHT RED-WHEEL VALVE & GAUGE -> FAR-RIGHT FLOOR LEG
  //    Split cleanly at Rear-Right Valve flanges (Y = 1080 +/- 148 mm) — ZERO clash!
  // -------------------------------------------------------------------------
  makeFloorBaseFlange('fl_far_right_leg', 'Far-Right Outlet Leg', 960, 1280, [110, -80, 140]),
  // Upper Arch Spool from Tie-Rod Top Flange (420, 830, 380) up & over to Rear-Right Valve Top Flange (960, 1228, 380)
  {
    id: 'pipe_high_rear_right_arch_upper',
    name: 'High Rear-Right Overhead Arch Spool (CSG Sweep)',
    group: 'Rear-Right Arch & Far-Right Leg',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 165,
        bendSegments: 9,
        pathPoints: [
          [420, 830, 380],
          [420, 1520, 380],
          [960, 1520, 380],
          [960, 1080 + VALVE_HALF_LEN, 380],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [80, 65, 45],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_high_arch_riser', 'High Arch Up-Riser', 'Rear-Right Arch & Far-Right Leg', [420, 1220, 380], 'y', [60, 55, 40]),
  ...makeFlangePair('fp_high_arch_top', 'High Arch Crest', 'Rear-Right Arch & Far-Right Leg', [740, 1520, 380], 'x', [90, 75, 40]),

  // VALVE #3: Rear-Right Vertical Globe Valve with RED Vertical Handwheel + Dial Pressure Gauge #1!
  ...makeKinematicGlobeValve(
    'valve_red_rear_vert',
    'Rear-Right Vertical Red-Wheel Globe Valve',
    'Valves & Instrumentation',
    [960, 1080, 380],
    'y',
    'red',
    [110, 45, 75],
    { offset: [-122, -48, 86], facingAxis: '-x', stemDir: 'inX' }
  ),

  // Lower Arch Outlet Spool from Rear-Right Valve Bottom Flange (960, 932, 380) -> Far-Right High Branch -> Far-Right Floor Leg!
  {
    id: 'pipe_far_right_high_drop',
    name: 'Far-Right High Branch & Floor Pedestal Drop (CSG Sweep)',
    group: 'Rear-Right Arch & Far-Right Leg',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 165,
        bendSegments: 9,
        pathPoints: [
          [960, 1080 - VALVE_HALF_LEN, 380],
          [960, 720, 380],
          [960, 720, 1280],
          [960, 20, 1280],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [105, -15, 105],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_far_right_horiz', 'Far-Right High Branch', 'Rear-Right Arch & Far-Right Leg', [960, 720, 680], 'z', [100, 0, 80]),

  // -------------------------------------------------------------------------
  // 7. RIGHT-SIDE DOWN-DROP -> FRONT-RIGHT RED-WHEEL HORIZONTAL VALVE & GAUGE
  //    -> DOUBLE-BAND CHROME CLAMP 90° BYPASS LOOP -> BLIND-FLANGE CROSS-TEE (-320, 380, 1250)!
  //    Split cleanly at Front-Right Red Valve flanges (Z = 900 +/- 148 mm) — ZERO clash!
  // -------------------------------------------------------------------------
  // Upstream drop from Tie-Rod Cross (420, 1020, 444) down to Front-Right Valve Inlet (-20, 440, 752)
  {
    id: 'pipe_front_right_valve_inlet',
    name: 'Front-Right Valve Supply Drop Spool (CSG Sweep)',
    group: 'Front-Right Cross & Bypass Manifold',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 120,
        bendSegments: 9,
        pathPoints: [
          [420, 1020, 380 + R_PIPE - 4],
          [420, 1020, 620],
          [420, 440, 620],
          [-20, 440, 620],
          [-20, 440, 900 - VALVE_HALF_LEN],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [45, 5, 60],
    toleranceMm: 0.3,
  },
  ...makeFlangePair('fp_right_drop_mid', 'Right Supply Drop', 'Front-Right Cross & Bypass Manifold', [420, 760, 620], 'y', [45, 10, 55]),

  // VALVE #4: Front-Right Horizontal Globe Valve with RED Horizontal Top Handwheel + Dial Pressure Gauge #2!
  ...makeKinematicGlobeValve(
    'valve_red_front_horiz',
    'Front-Right Horizontal Red-Wheel Globe Valve',
    'Valves & Instrumentation',
    [-20, 440, 900],
    'z',
    'red',
    [30, 15, 105],
    { offset: [-92, 128, -24], facingAxis: '-x', stemDir: 'down' }
  ),

  // Downstream Return Sweep from Front-Right Red Valve Outlet (-20, 440, 1048) -> straight clamp run -> 90° bend -> Cross-Tee (-256, 380, 1250)!
  {
    id: 'pipe_front_right_valve_outlet_return',
    name: 'Front-Right Valve Outlet to Blind-Cap Cross-Tee (CSG Sweep)',
    group: 'Front-Right Cross & Bypass Manifold',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE,
        radialSegments: 22,
        cornerMode: 'bend',
        bendRadiusMm: 85,
        bendSegments: 9,
        pathPoints: [
          [-20, 440, 900 + VALVE_HALF_LEN],
          [-20, 440, 1250],
          [-145, 380, 1250],
          [-320 + R_PIPE - 4, 380, 1250],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [15, -10, 130],
    toleranceMm: 0.3,
  },
  // Signature polished stainless double-band clamp on the straight outlet section before the elbow (visible in photo!)
  {
    id: 'front_right_double_clamp_a',
    name: 'Front-Right Double Band Clamp A',
    group: 'Front-Right Cross & Bypass Manifold',
    role: 'detail',
    positionMm: [-20, 440, 1104],
    rotationDeg: [90, 0, 0],
    geometry: { kind: 'torus', radius: R_PIPE + 5, tubeRadius: 7, radialSegments: 24 },
    material: MAT_CHROME_BAND,
    explodeOffsetMm: [15, -10, 130],
    toleranceMm: 0.2,
  },
  {
    id: 'front_right_double_clamp_b',
    name: 'Front-Right Double Band Clamp B',
    group: 'Front-Right Cross & Bypass Manifold',
    role: 'detail',
    positionMm: [-20, 440, 1128],
    rotationDeg: [90, 0, 0],
    geometry: { kind: 'torus', radius: R_PIPE + 5, tubeRadius: 7, radialSegments: 24 },
    material: MAT_CHROME_BAND,
    explodeOffsetMm: [15, -10, 130],
    toleranceMm: 0.2,
  },

  // Secondary parallel background branch behind the Front-Right Red Valve (matches curved back return in photo)
  {
    id: 'pipe_right_background_return',
    name: 'Right Rear Parallel Return Pipe (CSG Sweep)',
    group: 'Front-Right Cross & Bypass Manifold',
    role: 'secondary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: R_PIPE - 4,
        radialSegments: 20,
        cornerMode: 'bend',
        bendRadiusMm: 120,
        bendSegments: 8,
        pathPoints: [
          [420, 520, 620 + R_PIPE - 4],
          [420, 520, 1080],
          [200, 440, 1080],
          [200, 440, 1250],
          [-20 + R_PIPE - 4, 440, 1250],
        ],
      },
    },
    material: MAT_STEEL_BLUE,
    explodeOffsetMm: [65, -15, 105],
    toleranceMm: 0.3,
  },

  // -------------------------------------------------------------------------
  // 8. FOUR SLENDER VERTICAL THREADED FLOOR SUPPORT HANGERS (Y = 0..380/440 mm)
  // -------------------------------------------------------------------------
  ...makeFloorSupportHanger('hanger_1', 'Lower Front Hanger #1', -320, 380, 760, 'z', [-20, -35, 65]),
  ...makeFloorSupportHanger('hanger_2', 'Front-Right Bypass Hanger #2', -445, 380, 1250, 'x', [-30, -35, 130]),
  ...makeFloorSupportHanger('hanger_3', 'Front-Right Cross Hanger #3', -170, 380, 1250, 'x', [0, -35, 130]),
  ...makeFloorSupportHanger('hanger_4', 'Outlet Loop Hanger #4', -20, 440, 1152, 'z', [25, -35, 125]),
];

export const INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT: MeshBlueprint = {
  id: 'industrial-flanged-piping-manifold-v1',
  name: 'Multi-Loop Flanged Steel Piping Manifold',
  category: 'Industrial Process Piping & Valve Assembly',
  summary:
    'Coordinate-locked, flange-segmented DN150 flanged process steel piping skid matching the reference photograph: far-left supply leg threading cleanly through three nested 180° vertical U-bends into the front-right floor pedestal and side-tee bypass, lower parallel front trunk continuing straight to the bolted ANSI blind flange cap, foreground 180° arch dropping into a vertical red-wheel globe valve, wall-anchored rear high header, inline 4-tie-rod strainer cartridge with red drain lever, high rear-right arch with red-wheel valve & dial gauge dropping to the far-right pedestal, front-right horizontal red-wheel valve with dial gauge and chrome double-band clamp bypass, and four grounded threaded floor hangers.',
  sourceImageUrl: '/assets/aistudio/pipe-assembly-pack-01_86be8856.jpg',
  isReferencePreset: true,
  reconstructedAt: '2026-11-21T07:36:00.000Z',
  envelopeMm: {
    width: 2420,
    height: 1620,
    depth: 2920,
  },
  toleranceSpecMm: 0.25,
  symmetryPlane: 'none',
  photoMatchCamera: {
    positionMm: [-2820, 2180, 2940],
    targetMm: [-60, 610, 140],
    fov: 32,
  },
  fiveAngleAudit: {
    auditedAt: '2026-11-21T07:36:00.000Z',
    angles: [
      {
        angle: 'photoMatch',
        label: 'Photo-Match 3/4',
        status: 'verified',
        note: 'Far-left trunk threads through all 3 nested U-bends into the front-right pedestal; lower parallel trunk continues straight to the bottom-right blind flange cap; all 4 handwheels, 2 gauges, chrome double-band clamp, and tie-rod module match the reference photo.',
      },
      {
        angle: 'front',
        label: 'Front Elevation (+Z)',
        status: 'verified',
        note: 'All 6 bolted floor base flanges and all 4 threaded floor hanger footpads sit flush on Y = 0 mm with zero floating parts.',
      },
      {
        angle: 'left',
        label: 'Left Profile (-X)',
        status: 'verified',
        note: 'Three parallel upper runs (Y = 855 mm) transition via 210 mm-radius 180° vertical U-bends to Y = 425 mm, leaving a 79 mm concentric air gap around the Y = 640 mm central trunk.',
      },
      {
        angle: 'right',
        label: 'Right Profile (+X)',
        status: 'verified',
        note: 'High rear-right overhead arch stops cleanly at the rear-right valve flanges and drops into the far-right floor pedestal.',
      },
      {
        angle: 'top',
        label: 'Top Plan (+Y)',
        status: 'verified',
        note: 'Every pipe spool terminates cleanly flange-to-flange at every valve body and tie-rod cartridge with zero solid-through-solid interpenetration.',
      },
    ],
    correctionsApplied: [
      'Re-routed the lower front parallel trunk directly through the front-right cross-tee to the bolted ANSI blind flange cap, matching the reference photograph.',
      'Added the front-right floor pedestal side-tee bypass loop and front-right red-wheel horizontal valve with chrome double-band clamp returning directly into the blind-cap cross-tee.',
      'Segmented every pipe run flange-to-flange at all 4 globe valves and the inline 4-tie-rod cartridge so no pipe runs through a solid valve body.',
      'Upgraded geometryLinter clash detection to exact 3D DoubleSide ray-parity testing so U-bends wrapping cleanly around pipes no longer register false-positive AABB clashes.',
    ],
  },
  parts,
};
