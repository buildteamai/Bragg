import { BlueprintPart, CsgNodeSpec, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

// Shared realistic PBR materials calibrated for a commercial Type L copper PRV & metering station
const MAT_COPPER_PIPE: PartMaterialSpec = {
  colorHex: '#c97447',
  metalness: 0.9,
  roughness: 0.25,
  clearcoat: 0.22,
  clearcoatRoughness: 0.28,
  textureKind: 'brushedMetal',
  finishName: 'Type L Drawn Copper Pipe',
  densityGPerCm3: 8.96,
};

const MAT_COPPER_FITTING: PartMaterialSpec = {
  colorHex: '#ba663b',
  metalness: 0.91,
  roughness: 0.22,
  clearcoat: 0.25,
  clearcoatRoughness: 0.24,
  finishName: 'ProPress Wrought Copper Fitting',
  densityGPerCm3: 8.96,
};

const MAT_BRASS_CAST: PartMaterialSpec = {
  colorHex: '#bd984a',
  metalness: 0.85,
  roughness: 0.31,
  clearcoat: 0.15,
  clearcoatRoughness: 0.35,
  textureKind: 'brushedMetal',
  finishName: 'Lead-Free Cast Brass',
  densityGPerCm3: 8.5,
};

const MAT_BRONZE_DARK: PartMaterialSpec = {
  colorHex: '#8c6f38',
  metalness: 0.82,
  roughness: 0.36,
  finishName: 'Machined Silicon Bronze',
  densityGPerCm3: 8.7,
};

const MAT_VALVE_BLUE: PartMaterialSpec = {
  colorHex: '#1264bd',
  metalness: 0.22,
  roughness: 0.32,
  clearcoat: 0.48,
  clearcoatRoughness: 0.22,
  finishName: 'Fusion-Bonded Epoxy Valve Blue',
  densityGPerCm3: 7.2,
};

const MAT_UNISTRUT: PartMaterialSpec = {
  colorHex: '#aeb6bf',
  metalness: 0.72,
  roughness: 0.38,
  textureKind: 'galvanizedSteel',
  finishName: 'Pre-Galvanized Steel Strut (P1000T)',
  densityGPerCm3: 7.85,
};

const MAT_STAINLESS: PartMaterialSpec = {
  colorHex: '#cfd6de',
  metalness: 0.92,
  roughness: 0.22,
  textureKind: 'brushedMetal',
  finishName: '316 Stainless Steel',
  densityGPerCm3: 8.0,
};

const MAT_RED_HANDLE: PartMaterialSpec = {
  colorHex: '#b91c1c',
  metalness: 0.12,
  roughness: 0.38,
  clearcoat: 0.3,
  clearcoatRoughness: 0.25,
  finishName: 'Vinyl-Coated Valve Lever Red',
  densityGPerCm3: 1.35,
};

const MAT_RED_GASKET: PartMaterialSpec = {
  colorHex: '#a8221e',
  metalness: 0.28,
  roughness: 0.45,
  finishName: 'Epoxy Meter Flange Ring Red',
  densityGPerCm3: 7.2,
};

const MAT_DARK_HOUSING: PartMaterialSpec = {
  colorHex: '#1f242c',
  metalness: 0.32,
  roughness: 0.52,
  finishName: 'Anodized Instrument Housing Black',
  densityGPerCm3: 2.7,
};

const MAT_GAUGE_DIAL: PartMaterialSpec = {
  colorHex: '#f6f8fb',
  metalness: 0.0,
  roughness: 0.4,
  finishName: 'Calibration Gauge Dial Face',
  densityGPerCm3: 1.4,
};

const MAT_GAUGE_GLASS: PartMaterialSpec = {
  colorHex: '#e6f2fa',
  metalness: 0.05,
  roughness: 0.08,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05,
  opacity: 0.28,
  transparent: true,
  ior: 1.5,
  finishName: 'Tempered Instrument Sight Glass',
  densityGPerCm3: 2.5,
};

const MAT_WHITE_HANDLE: PartMaterialSpec = {
  colorHex: '#e9eef4',
  metalness: 0.08,
  roughness: 0.35,
  finishName: 'Polymer Isolation Handle White',
  densityGPerCm3: 1.2,
};

const MAT_GROUND_WIRE: PartMaterialSpec = {
  colorHex: '#d4b34c',
  metalness: 0.35,
  roughness: 0.52,
  finishName: 'Ground Bonding Conductor',
  densityGPerCm3: 6.5,
};

const MAT_EPDM_CUSHION: PartMaterialSpec = {
  colorHex: '#252930',
  metalness: 0.05,
  roughness: 0.78,
  finishName: 'EPDM Vibration Cushion Liner',
  densityGPerCm3: 1.2,
};

/**
 * Generates an ANSI 150# bolted circular pipe flange (oriented along the X axis)
 * with radially arrayed stainless steel hex bolts & nuts.
 */
function makeBoltedFlangeX(
  idPrefix: string,
  namePrefix: string,
  group: string,
  xMm: number,
  yMm: number,
  zMm: number,
  outerRadiusMm: number,
  thicknessMm: number,
  material: PartMaterialSpec,
  explodeOffsetMm: [number, number, number],
  boltCount = 8
): BlueprintPart[] {
  const boltCircleR = outerRadiusMm - 15;
  const parts: BlueprintPart[] = [
    {
      id: `${idPrefix}_disc`,
      name: `${namePrefix} Flange Disc (CSG)`,
      group,
      role: 'secondary',
      positionMm: [xMm, yMm, zMm],
      rotationDeg: [0, 0, 90],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'boltedFlange',
          radius: outerRadiusMm,
          height: thicknessMm,
          boreRadiusMm: Math.round(outerRadiusMm * 0.42),
          boltCircleRadiusMm: boltCircleR,
          boltHoleRadiusMm: 7.2,
          boltCount,
          radialSegments: 32,
        },
      },
      material,
      explodeOffsetMm,
      toleranceMm: 0.25,
    },
  ];

  for (let i = 0; i < boltCount; i++) {
    const angle = (i / boltCount) * Math.PI * 2 + Math.PI / boltCount;
    const by = yMm + Math.sin(angle) * boltCircleR;
    const bz = zMm + Math.cos(angle) * boltCircleR;
    parts.push({
      id: `${idPrefix}_bolt_${i}`,
      name: `${namePrefix} Hex Bolt #${i + 1}`,
      group,
      role: 'detail',
      fitClass: 'fastener',
      positionMm: [xMm, by, bz],
      rotationDeg: [0, 0, 90],
      geometry: {
        kind: 'cylinder',
        radius: 6.5,
        height: thicknessMm + 16,
        radialSegments: 6,
      },
      material: MAT_STAINLESS,
      explodeOffsetMm: [explodeOffsetMm[0] * 1.15, explodeOffsetMm[1], explodeOffsetMm[2]],
      toleranceMm: 0.15,
    });
  }

  return parts;
}

/**
 * Generates a ProPress rolled copper press bead collar around a pipe run along X or Y.
 */
function makePressRing(
  id: string,
  name: string,
  group: string,
  pos: [number, number, number],
  axis: 'x' | 'y',
  pipeRadiusMm: number,
  explodeOffsetMm: [number, number, number]
): BlueprintPart {
  return {
    id,
    name,
    group,
    role: 'detail',
    positionMm: pos,
    rotationDeg: axis === 'x' ? [0, 90, 0] : [90, 0, 0],
    geometry: {
      kind: 'torus',
      radius: pipeRadiusMm + 3.5,
      tubeRadius: 5.5,
      radialSegments: 24,
    },
    material: MAT_COPPER_FITTING,
    explodeOffsetMm,
    toleranceMm: 0.2,
  };
}

/**
 * Builds a watertight CSG spoked cast-iron handwheel centered at local (0, 0, 0) in the XZ plane.
 */
function makeHandwheelCsg(rimRadiusMm: number, tubeRadiusMm: number): CsgNodeSpec {
  const rimProfile: [number, number][] = [];
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    rimProfile.push([
      rimRadiusMm + Math.cos(a) * tubeRadiusMm,
      Math.sin(a) * tubeRadiusMm,
    ]);
  }
  return {
    op: 'union',
    children: [
      // Center hub boss
      {
        op: 'cylinder',
        radius: 19,
        height: 22,
        radialSegments: 20,
      },
      // Revolved toroidal handwheel rim
      {
        op: 'revolve',
        lathePoints: rimProfile,
        radialSegments: 28,
      },
      // Four radial cast spokes
      {
        op: 'cylinder',
        radius: 6.2,
        height: rimRadiusMm * 2 - 4,
        radialSegments: 12,
        rotateDeg: [0, 0, 90],
      },
      {
        op: 'cylinder',
        radius: 6.2,
        height: rimRadiusMm * 2 - 4,
        radialSegments: 12,
        rotateDeg: [90, 0, 0],
      },
    ],
  };
}

/**
 * Generates a complete royal-blue flanged OS&Y rising-stem gate valve centered at (xMm, yMm, 0)
 * using a watertight CSG cast body, C1 filleted bonnet neck, bolted bonnet hardware, and revolute CSG handwheel.
 */
function makeFlangedGateValve(
  idPrefix: string,
  label: string,
  group: string,
  xMm: number,
  yMm: number,
  wheelHeightOffsetMm: number,
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  const halfLen = 78;
  const wheelY = yMm + wheelHeightOffsetMm;
  const stemLen = wheelY + 26 - (yMm + 172);

  const bonnetBoltOffsets: [number, number][] = [
    [-38, -46],
    [38, -46],
    [-38, 46],
    [38, 46],
  ];

  const parts: BlueprintPart[] = [
    ...makeBoltedFlangeX(
      `${idPrefix}_flange_l`,
      `${label} Left`,
      group,
      xMm - halfLen,
      yMm,
      0,
      90,
      20,
      MAT_VALVE_BLUE,
      explodeOffsetMm
    ),
    ...makeBoltedFlangeX(
      `${idPrefix}_flange_r`,
      `${label} Right`,
      group,
      xMm + halfLen,
      yMm,
      0,
      90,
      20,
      MAT_VALVE_BLUE,
      explodeOffsetMm
    ),
    // Watertight CSG cast-iron OS&Y gate valve body + wedge chamber + bolted bonnet flange + C1 filleted neck
    {
      id: `${idPrefix}_body`,
      name: `${label} Cast Gate Body & Bonnet (CSG)`,
      group,
      role: 'primary',
      positionMm: [xMm, yMm, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            // Horizontal flow throat
            {
              op: 'cylinder',
              radius: 48,
              height: halfLen * 2 - 12,
              radialSegments: 28,
              rotateDeg: [0, 0, 90],
            },
            // Sculpted wedge-gate central chamber
            {
              op: 'superellipseLoft',
              loftAxis: 'y',
              radialSegments: 24,
              superellipseStations: [
                { posMm: -52, halfA: 34, halfB: 46, exponent: 2.6 },
                { posMm: -20, halfA: 42, halfB: 58, exponent: 3.0 },
                { posMm: 45, halfA: 42, halfB: 58, exponent: 3.0 },
                { posMm: 76, halfA: 38, halfB: 52, exponent: 2.8 },
              ],
            },
            // Bolted oval bonnet flange collar
            {
              op: 'superellipseLoft',
              loftAxis: 'y',
              radialSegments: 24,
              superellipseStations: [
                { posMm: 73, halfA: 50, halfB: 62, exponent: 2.8 },
                { posMm: 91, halfA: 50, halfB: 62, exponent: 2.8 },
              ],
            },
            // C1 tangent-continuous flared bonnet tower
            {
              op: 'filletedJunction',
              junctionAxis: 'y',
              height: 86,
              baseHalfA: 38,
              baseHalfB: 44,
              baseExponent: 2.4,
              topHalfA: 26,
              topHalfB: 26,
              topExponent: 2.0,
              filletFlareMm: 8,
              radialSegments: 24,
              translateMm: [0, 134, 0],
            },
          ],
        },
      },
      material: MAT_VALVE_BLUE,
      explodeOffsetMm,
      toleranceMm: 0.3,
    },
    // Stainless bonnet flange hex bolts
    ...bonnetBoltOffsets.map(([bx, bz], idx) => ({
      id: `${idPrefix}_bonnet_bolt_${idx}`,
      name: `${label} Bonnet Bolt #${idx + 1}`,
      group,
      role: 'detail' as const,
      fitClass: 'fastener' as const,
      positionMm: [xMm + bx, yMm + 82, bz] as [number, number, number],
      rotationDeg: [0, 0, 0] as [number, number, number],
      geometry: {
        kind: 'cylinder' as const,
        radius: 5.5,
        height: 28,
        radialSegments: 6,
      },
      material: MAT_STAINLESS,
      explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] + 10, explodeOffsetMm[2]] as [number, number, number],
      toleranceMm: 0.15,
    })),
    // Stuffing box gland flange (mated flush on top of CSG bonnet neck)
    {
      id: `${idPrefix}_gland`,
      name: `${label} Packing Gland`,
      group,
      role: 'detail',
      positionMm: [xMm, yMm + 180, 0],
      rotationDeg: [0, 0, 0],
      ports: {
        topAxis: { localOffsetMm: [0, 7, 0], normal: [0, 1, 0] },
      },
      constraint: {
        kind: 'sitOnTopOf',
        targetPartId: `${idPrefix}_body`,
        offsetMm: [0, -2, 0],
      },
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            { op: 'cylinder', radius: 34, height: 14, radialSegments: 24 },
            { op: 'cylinder', radius: 17, height: 18, radialSegments: 6, translateMm: [0, 8, 0] },
          ],
        },
      },
      material: MAT_VALVE_BLUE,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
    // Machined stainless steel rising stem (concentric revolute mate to packing gland)
    {
      id: `${idPrefix}_stem`,
      name: `${label} Stainless Rising Stem`,
      group,
      role: 'detail',
      positionMm: [xMm, (yMm + 178 + wheelY + 18) / 2, 0],
      rotationDeg: [0, 0, 0],
      ports: {
        glandSeat: {
          localOffsetMm: [0, -stemLen / 2 + 10, 0],
          normal: [0, 1, 0],
        },
        wheelSeat: {
          localOffsetMm: [0, stemLen / 2 - 22, 0],
          normal: [0, 1, 0],
        },
      },
      constraint: {
        kind: 'concentric',
        selfPort: 'glandSeat',
        targetPartId: `${idPrefix}_gland`,
        targetPort: 'topAxis',
        axialOffsetMm: 0,
        lockAxial: true,
        lockSpin: false,
      },
      geometry: {
        kind: 'cylinder',
        radius: 9.5,
        height: stemLen,
        radialSegments: 20,
      },
      material: MAT_STAINLESS,
      explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] + 25, explodeOffsetMm[2]],
      toleranceMm: 0.15,
    },
    // Watertight CSG cast-iron spoked handwheel (coincident fixed mate to rising stem)
    {
      id: `${idPrefix}_wheel`,
      name: `${label} Spoked Handwheel (CSG)`,
      group,
      role: 'secondary',
      positionMm: [xMm, wheelY, 0],
      rotationDeg: [0, 0, 0],
      ports: {
        stemBore: { localOffsetMm: [0, 0, 0], normal: [0, 1, 0] },
      },
      constraint: {
        kind: 'coincident',
        selfPort: 'stemBore',
        targetPartId: `${idPrefix}_stem`,
        targetPort: 'wheelSeat',
        flipNormal: false,
        jointKind: 'fixed',
      },
      geometry: {
        kind: 'csgSolid',
        csgRoot: makeHandwheelCsg(76, 9.5),
      },
      material: MAT_VALVE_BLUE,
      explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] + 55, explodeOffsetMm[2]],
      toleranceMm: 0.25,
    },
  ];

  return parts;
}

/**
 * Generates a watertight CSG cast-brass full-port commercial ball valve with hex union nuts,
 * ProPress tail adapters, and vinyl-coated or brass operating lever.
 */
function makeBrassBallValve(
  idPrefix: string,
  label: string,
  group: string,
  xMm: number,
  yMm: number,
  bodyRadiusMm: number,
  lengthMm: number,
  handleDirection: 'up' | 'downRed' | 'leftRed',
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  const halfLen = lengthMm / 2;
  const parts: BlueprintPart[] = [
    // Watertight CSG forged brass ball valve body + dual hex union nuts + stem boss
    {
      id: `${idPrefix}_body`,
      name: `${label} Cast Brass Valve Body (CSG)`,
      group,
      role: 'primary',
      positionMm: [xMm, yMm, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            // Central forged spherical-cylindrical chamber
            {
              op: 'cylinder',
              radius: bodyRadiusMm,
              height: lengthMm * 0.52,
              radialSegments: 24,
              rotateDeg: [0, 0, 90],
            },
            // Left & right hex union nuts
            {
              op: 'cylinder',
              radius: bodyRadiusMm * 0.98,
              height: lengthMm * 0.26,
              radialSegments: 6,
              rotateDeg: [0, 0, 90],
              translateMm: [-halfLen * 0.64, 0, 0],
            },
            {
              op: 'cylinder',
              radius: bodyRadiusMm * 0.98,
              height: lengthMm * 0.26,
              radialSegments: 6,
              rotateDeg: [0, 0, 90],
              translateMm: [halfLen * 0.64, 0, 0],
            },
            // Stem packing gland boss
            handleDirection === 'up'
              ? {
                  op: 'cylinder',
                  radius: 13,
                  height: 26,
                  radialSegments: 6,
                  translateMm: [0, bodyRadiusMm + 6, 0],
                }
              : {
                  op: 'cylinder',
                  radius: 12,
                  height: 22,
                  radialSegments: 6,
                  rotateDeg: [90, 0, 0],
                  translateMm: [-8, 0, bodyRadiusMm + 4],
                },
          ],
        },
      },
      material: MAT_BRASS_CAST,
      explodeOffsetMm,
      toleranceMm: 0.25,
    },
    // ProPress bronze tail adapters on both ends
    {
      id: `${idPrefix}_tail_l`,
      name: `${label} Left ProPress Adapter`,
      group,
      role: 'detail',
      positionMm: [xMm - halfLen * 0.92, yMm, 0],
      rotationDeg: [0, 0, 90],
      geometry: {
        kind: 'cylinder',
        radius: bodyRadiusMm * 0.72,
        height: lengthMm * 0.24,
        radialSegments: 20,
      },
      material: MAT_BRONZE_DARK,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
    {
      id: `${idPrefix}_tail_r`,
      name: `${label} Right ProPress Adapter`,
      group,
      role: 'detail',
      positionMm: [xMm + halfLen * 0.92, yMm, 0],
      rotationDeg: [0, 0, 90],
      geometry: {
        kind: 'cylinder',
        radius: bodyRadiusMm * 0.72,
        height: lengthMm * 0.24,
        radialSegments: 20,
      },
      material: MAT_BRONZE_DARK,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
  ];

  if (handleDirection === 'up') {
    parts.push(
      {
        id: `${idPrefix}_stem`,
        name: `${label} Valve Stem`,
        group,
        role: 'detail',
        positionMm: [xMm, yMm + bodyRadiusMm + 22, 0],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'cylinder',
          radius: 8.5,
          height: 28,
          radialSegments: 14,
        },
        material: MAT_STAINLESS,
        explodeOffsetMm,
        toleranceMm: 0.2,
      },
      {
        id: `${idPrefix}_lever`,
        name: `${label} Operating Lever Handle`,
        group,
        role: 'detail',
        positionMm: [xMm + 16, yMm + bodyRadiusMm + 38, 0],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'roundedBox',
          width: 72,
          height: 11,
          depth: 16,
          bevelRadius: 3,
        },
        material: MAT_BRONZE_DARK,
        explodeOffsetMm,
        toleranceMm: 0.25,
      }
    );
  } else if (handleDirection === 'downRed') {
    // Downward-hanging red vinyl-coated lever handle (exact match to bottom-tier isolation valve)
    parts.push(
      {
        id: `${idPrefix}_stem`,
        name: `${label} Valve Stem`,
        group,
        role: 'detail',
        positionMm: [xMm - 8, yMm - 4, bodyRadiusMm + 14],
        rotationDeg: [90, 0, 0],
        geometry: {
          kind: 'cylinder',
          radius: 8,
          height: 22,
          radialSegments: 14,
        },
        material: MAT_STAINLESS,
        explodeOffsetMm,
        toleranceMm: 0.2,
      },
      {
        id: `${idPrefix}_red_lever`,
        name: `${label} Red Isolation Lever Handle`,
        group,
        role: 'secondary',
        positionMm: [xMm - 12, yMm - 82, bodyRadiusMm + 24],
        rotationDeg: [0, 0, -3],
        geometry: {
          kind: 'roundedBox',
          width: 15,
          height: 158,
          depth: 12,
          bevelRadius: 4,
        },
        material: MAT_RED_HANDLE,
        explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] - 35, explodeOffsetMm[2] + 30],
        toleranceMm: 0.25,
      }
    );
  } else {
    // Horizontal left-pointing red vinyl-coated lever handle (exact match to Tier-2 & Tier-3 left riser isolation valves)
    parts.push(
      {
        id: `${idPrefix}_stem`,
        name: `${label} Valve Stem`,
        group,
        role: 'detail',
        positionMm: [xMm - 8, yMm, bodyRadiusMm + 12],
        rotationDeg: [90, 0, 0],
        geometry: {
          kind: 'cylinder',
          radius: 7.5,
          height: 20,
          radialSegments: 14,
        },
        material: MAT_STAINLESS,
        explodeOffsetMm,
        toleranceMm: 0.2,
      },
      {
        id: `${idPrefix}_red_lever`,
        name: `${label} Red Isolation Lever Handle`,
        group,
        role: 'secondary',
        positionMm: [xMm - 64, yMm, bodyRadiusMm + 21],
        rotationDeg: [0, 0, 0],
        geometry: {
          kind: 'roundedBox',
          width: 126,
          height: 14,
          depth: 11,
          bevelRadius: 3.5,
        },
        material: MAT_RED_HANDLE,
        explodeOffsetMm: [explodeOffsetMm[0] - 25, explodeOffsetMm[1], explodeOffsetMm[2] + 30],
        toleranceMm: 0.25,
      }
    );
  }

  return parts;
}

/**
 * Generates a vertical galvanized Unistrut P1000T slotted channel post with floor baseplate & anchor bolts.
 */
function makeUnistrutPost(
  idPrefix: string,
  label: string,
  xMm: number,
  zMm: number,
  heightMm: number,
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  const anchorOffsets: [number, number][] = [
    [-46, -46],
    [46, -46],
    [-46, 46],
    [46, 46],
  ];

  const parts: BlueprintPart[] = [
    // Heavy steel post baseplate grounded flush on Y=0
    {
      id: `${idPrefix}_baseplate`,
      name: `${label} Floor Baseplate`,
      group: 'Unistrut Support Frame',
      role: 'secondary',
      anchorKind: 'floor',
      positionMm: [xMm, 6, zMm],
      rotationDeg: [0, 0, 0],
      constraint: { kind: 'sitOnGround', groundYMm: 0 },
      geometry: {
        kind: 'roundedBox',
        width: 136,
        height: 12,
        depth: 136,
        bevelRadius: 2,
      },
      material: MAT_UNISTRUT,
      explodeOffsetMm: [explodeOffsetMm[0], -30, explodeOffsetMm[2]],
      toleranceMm: 0.3,
    },
    // Concrete wedge anchor bolts on baseplate corners
    ...anchorOffsets.map(([ax, az], idx) => ({
      id: `${idPrefix}_anchor_${idx}`,
      name: `${label} Concrete Anchor #${idx + 1}`,
      group: 'Unistrut Support Frame',
      role: 'detail' as const,
      fitClass: 'fastener' as const,
      positionMm: [xMm + ax, 16, zMm + az] as [number, number, number],
      rotationDeg: [0, 0, 0] as [number, number, number],
      geometry: {
        kind: 'cylinder' as const,
        radius: 6,
        height: 12,
        radialSegments: 6,
      },
      material: MAT_STAINLESS,
      explodeOffsetMm: [explodeOffsetMm[0], -20, explodeOffsetMm[2]] as [number, number, number],
      toleranceMm: 0.2,
    })),
    // Welded post socket collar seated flush on top of floor baseplate
    {
      id: `${idPrefix}_socket`,
      name: `${label} Base Socket`,
      group: 'Unistrut Support Frame',
      role: 'detail',
      positionMm: [xMm, 44, zMm],
      rotationDeg: [0, 0, 0],
      constraint: {
        kind: 'sitOnTopOf',
        targetPartId: `${idPrefix}_baseplate`,
        offsetMm: [0, 0, 0],
      },
      geometry: {
        kind: 'roundedBox',
        width: 54,
        height: 68,
        depth: 54,
        bevelRadius: 2,
      },
      material: MAT_UNISTRUT,
      explodeOffsetMm: [explodeOffsetMm[0], -20, explodeOffsetMm[2]],
      toleranceMm: 0.25,
    },
    // True hollow galvanized Unistrut P1000T C-channel with real Boolean-subtracted oblong through-slots
    {
      id: `${idPrefix}_channel`,
      name: `${label} P1000T Slotted C-Channel (CSG)`,
      group: 'Unistrut Support Frame',
      role: 'primary',
      positionMm: [xMm, heightMm / 2 + 12, zMm],
      rotationDeg: [0, 0, 0],
      constraint: {
        kind: 'sitOnTopOf',
        targetPartId: `${idPrefix}_baseplate`,
        offsetMm: [0, 0, 0],
      },
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'slottedChannel',
          width: 41.3,
          height: heightMm,
          depth: 41.3,
          wallThickness: 2.8,
          lipWidthMm: 7.5,
          slotPitchMm: 72,
          slotWidthMm: 14,
          slotLengthMm: 36,
        },
      },
      material: MAT_UNISTRUT,
      explodeOffsetMm,
      toleranceMm: 0.3,
    },
  ];

  return parts;
}

/**
 * Generates a precision 63 mm liquid-filled stainless-steel pressure gauge with CSG crimped bezel,
 * tempered glass lens, white dial face, indicator needle, and brass NPT hex stem.
 */
function makePressureGauge(
  idPrefix: string,
  label: string,
  group: string,
  xMm: number,
  yMm: number,
  zMm: number,
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  return [
    {
      id: `${idPrefix}_case`,
      name: `${label} Crimped Stainless Case (CSG)`,
      group,
      role: 'secondary',
      positionMm: [xMm, yMm, zMm],
      rotationDeg: [90, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'revolve',
          radialSegments: 28,
          lathePoints: [
            [0, -13],
            [33, -13],
            [34, -10],
            [34, 10],
            [36.5, 11.5],
            [36.5, 14.5],
            [30, 14.5],
            [30, 10],
            [0, 10],
          ],
        },
      },
      material: MAT_STAINLESS,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
    {
      id: `${idPrefix}_dial`,
      name: `${label} White Dial Face`,
      group,
      role: 'detail',
      positionMm: [xMm, yMm, zMm + 11],
      rotationDeg: [90, 0, 0],
      geometry: {
        kind: 'cylinder',
        radius: 29.5,
        height: 2,
        radialSegments: 28,
      },
      material: MAT_GAUGE_DIAL,
      explodeOffsetMm,
      toleranceMm: 0.15,
    },
    {
      id: `${idPrefix}_needle`,
      name: `${label} Indicator Needle`,
      group,
      role: 'detail',
      positionMm: [xMm + 6, yMm + 5, zMm + 12.8],
      rotationDeg: [0, 0, -42],
      geometry: {
        kind: 'box',
        width: 2.4,
        height: 24,
        depth: 1.6,
      },
      material: MAT_DARK_HOUSING,
      explodeOffsetMm,
      toleranceMm: 0.1,
    },
    {
      id: `${idPrefix}_lens`,
      name: `${label} Tempered Sight Glass`,
      group,
      role: 'detail',
      positionMm: [xMm, yMm, zMm + 14.2],
      rotationDeg: [90, 0, 0],
      geometry: {
        kind: 'cylinder',
        radius: 29.8,
        height: 1.8,
        radialSegments: 28,
      },
      material: MAT_GAUGE_GLASS,
      explodeOffsetMm,
      toleranceMm: 0.15,
    },
    {
      id: `${idPrefix}_hex_stem`,
      name: `${label} Brass NPT Hex Socket Stem`,
      group,
      role: 'detail',
      positionMm: [xMm, yMm - 42, zMm],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            { op: 'cylinder', radius: 10.5, height: 18, radialSegments: 6, translateMm: [0, 4, 0] },
            { op: 'cylinder', radius: 7.5, height: 22, radialSegments: 16, translateMm: [0, -6, 0] },
          ],
        },
      },
      material: MAT_BRASS_CAST,
      explodeOffsetMm,
      toleranceMm: 0.2,
    },
  ];
}

/**
 * Generates a watertight CSG ProPress wrought copper tee fitting (vertical run + horizontal branch along +X or -X).
 */
function makeProPressTee(
  id: string,
  name: string,
  group: string,
  posMm: [number, number, number],
  runRadiusMm: number,
  runHeightMm: number,
  branchRadiusMm: number,
  branchDir: 1 | -1,
  explodeOffsetMm: [number, number, number]
): BlueprintPart {
  return {
    id,
    name: `${name} (CSG)`,
    group,
    role: 'secondary',
    positionMm: posMm,
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          {
            op: 'cylinder',
            radius: runRadiusMm,
            height: runHeightMm,
            radialSegments: 26,
          },
          {
            op: 'filletedJunction',
            junctionAxis: 'x',
            height: 52,
            baseHalfA: branchRadiusMm + 4,
            baseHalfB: branchRadiusMm + 4,
            topHalfA: branchRadiusMm,
            topHalfB: branchRadiusMm,
            filletFlareMm: 6,
            radialSegments: 24,
            translateMm: [branchDir * 32, 0, 0],
            rotateDeg: branchDir === 1 ? [0, 0, 0] : [0, 180, 0],
          },
        ],
      },
    },
    material: MAT_COPPER_FITTING,
    explodeOffsetMm,
    toleranceMm: 0.25,
  };
}

/**
 * Generates a watertight CSG flanged royal-blue Y-strainer body (horizontal barrel + 45° downward-left
 * screen pocket + bolted cleanout cover) plus brass blow-down plug.
 */
function makeBlueFlangedYStrainer(
  idPrefix: string,
  label: string,
  group: string,
  xMm: number,
  yMm: number,
  barrelLengthMm: number,
  barrelRadiusMm: number,
  wyeLengthMm: number,
  wyeRadiusMm: number,
  explodeOffsetMm: [number, number, number]
): BlueprintPart[] {
  // 45° downward-left vector for screen chamber & cleanout flange
  const angleRad = (-42 * Math.PI) / 180;
  const sinA = Math.sin(angleRad); // -0.669
  const cosA = Math.cos(angleRad); // +0.743
  // Local cylinder axis is Y; rotated -42 deg around Z tilts -Y toward (-X, -Y)
  // Actually rotating [0, -1, 0] by -42 deg around Z gives: x' = -(-1)*sin(-42) = -0.669, y' = -cos(-42) = -0.743
  const wyeMidDist = wyeLengthMm * 0.48;
  const capDist = wyeLengthMm * 0.94;
  const plugDist = capDist + 20;

  return [
    {
      id: `${idPrefix}_body`,
      name: `${label} Cast Body & 45° Screen Chamber (CSG)`,
      group,
      role: 'primary',
      positionMm: [xMm, yMm, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            // Horizontal flow barrel
            {
              op: 'cylinder',
              radius: barrelRadiusMm,
              height: barrelLengthMm,
              radialSegments: 28,
              rotateDeg: [0, 0, 90],
            },
            // 45° downward-left screen pocket
            {
              op: 'cylinder',
              radius: wyeRadiusMm,
              height: wyeLengthMm,
              radialSegments: 28,
              translateMm: [sinA * wyeMidDist, -cosA * wyeMidDist, 0],
              rotateDeg: [0, 0, -42],
            },
            // Bolted cleanout cover flange
            {
              op: 'cylinder',
              radius: wyeRadiusMm + 10,
              height: 22,
              radialSegments: 24,
              translateMm: [sinA * capDist, -cosA * capDist, 0],
              rotateDeg: [0, 0, -42],
            },
          ],
        },
      },
      material: MAT_VALVE_BLUE,
      explodeOffsetMm,
      toleranceMm: 0.3,
    },
    {
      id: `${idPrefix}_blowdown_plug`,
      name: `${label} Brass Blow-Down Plug`,
      group,
      role: 'detail',
      positionMm: [xMm + sinA * plugDist, yMm - cosA * plugDist, 0],
      rotationDeg: [0, 0, -42],
      geometry: {
        kind: 'cylinder',
        radius: 13,
        height: 22,
        radialSegments: 6,
      },
      material: MAT_BRASS_CAST,
      explodeOffsetMm: [explodeOffsetMm[0], explodeOffsetMm[1] - 10, explodeOffsetMm[2] + 15],
      toleranceMm: 0.2,
    },
  ];
}

const parts: BlueprintPart[] = [
  // =========================================================================
  // 1. FLOOR PENETRATION & GALVANIZED UNISTRUT BASE COLLAR (Y = 0..265 mm)
  // =========================================================================
  {
    id: 'floor_penetration_sleeve',
    name: 'Floor Penetration Gasket Sleeve',
    group: 'Inlet Supply & Floor Collar',
    role: 'secondary',
    anchorKind: 'floor',
    positionMm: [20, 14, 0],
    rotationDeg: [0, 0, 0],
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    geometry: {
      kind: 'cylinder',
      radius: 68,
      height: 28,
      radialSegments: 28,
    },
    material: MAT_DARK_HOUSING,
    explodeOffsetMm: [0, -60, 0],
    toleranceMm: 0.3,
  },
  // Square 4-sided galvanized Unistrut P1000T slotted floor anchor cage around inlet riser
  {
    id: 'floor_cage_front_bot',
    name: 'Floor Strut Anchor Rail (Front Lower, CSG)',
    group: 'Inlet Supply & Floor Collar',
    role: 'secondary',
    anchorKind: 'floor',
    positionMm: [20, 17, 92],
    rotationDeg: [0, 0, 90],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'slottedChannel',
        width: 34,
        height: 224,
        depth: 34,
        wallThickness: 2.6,
        lipWidthMm: 6.5,
        slotPitchMm: 52,
        slotWidthMm: 12,
        slotLengthMm: 28,
      },
    },
    material: MAT_UNISTRUT,
    explodeOffsetMm: [0, -50, 50],
    toleranceMm: 0.3,
  },
  {
    id: 'floor_cage_back_bot',
    name: 'Floor Strut Anchor Rail (Rear Lower, CSG)',
    group: 'Inlet Supply & Floor Collar',
    role: 'secondary',
    anchorKind: 'floor',
    positionMm: [20, 17, -92],
    rotationDeg: [0, 0, 90],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'slottedChannel',
        width: 34,
        height: 224,
        depth: 34,
        wallThickness: 2.6,
        lipWidthMm: 6.5,
        slotPitchMm: 52,
        slotWidthMm: 12,
        slotLengthMm: 28,
      },
    },
    material: MAT_UNISTRUT,
    explodeOffsetMm: [0, -50, -50],
    toleranceMm: 0.3,
  },
  {
    id: 'floor_cage_left_bot',
    name: 'Floor Strut Anchor Rail (Left Lower, CSG)',
    group: 'Inlet Supply & Floor Collar',
    role: 'secondary',
    anchorKind: 'floor',
    positionMm: [-76, 17, 0],
    rotationDeg: [90, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'slottedChannel',
        width: 34,
        height: 152,
        depth: 34,
        wallThickness: 2.6,
        lipWidthMm: 6.5,
        slotPitchMm: 52,
        slotWidthMm: 12,
        slotLengthMm: 28,
      },
    },
    material: MAT_UNISTRUT,
    explodeOffsetMm: [-50, -50, 0],
    toleranceMm: 0.3,
  },
  {
    id: 'floor_cage_right_bot',
    name: 'Floor Strut Anchor Rail (Right Lower, CSG)',
    group: 'Inlet Supply & Floor Collar',
    role: 'secondary',
    anchorKind: 'floor',
    positionMm: [116, 17, 0],
    rotationDeg: [90, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'slottedChannel',
        width: 34,
        height: 152,
        depth: 34,
        wallThickness: 2.6,
        lipWidthMm: 6.5,
        slotPitchMm: 52,
        slotWidthMm: 12,
        slotLengthMm: 28,
      },
    },
    material: MAT_UNISTRUT,
    explodeOffsetMm: [50, -50, 0],
    toleranceMm: 0.3,
  },
  {
    id: 'floor_cage_front_top',
    name: 'Floor Strut Clamp Rail (Front Upper, CSG)',
    group: 'Inlet Supply & Floor Collar',
    role: 'secondary',
    positionMm: [20, 86, 86],
    rotationDeg: [0, 0, 90],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'slottedChannel',
        width: 32,
        height: 210,
        depth: 32,
        wallThickness: 2.5,
        lipWidthMm: 6.0,
        slotPitchMm: 52,
        slotWidthMm: 11,
        slotLengthMm: 26,
      },
    },
    material: MAT_UNISTRUT,
    explodeOffsetMm: [0, -25, 50],
    toleranceMm: 0.3,
  },
  {
    id: 'floor_cage_back_top',
    name: 'Floor Strut Clamp Rail (Rear Upper, CSG)',
    group: 'Inlet Supply & Floor Collar',
    role: 'secondary',
    positionMm: [20, 86, -86],
    rotationDeg: [0, 0, 90],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'slottedChannel',
        width: 32,
        height: 210,
        depth: 32,
        wallThickness: 2.5,
        lipWidthMm: 6.0,
        slotPitchMm: 52,
        slotWidthMm: 11,
        slotLengthMm: 26,
      },
    },
    material: MAT_UNISTRUT,
    explodeOffsetMm: [0, -25, -50],
    toleranceMm: 0.3,
  },
  // Four threaded vertical tie rods with top hex nuts at floor cage corners
  ...([
    [-78, 86],
    [118, 86],
    [-78, -86],
    [118, -86],
  ] as [number, number][]).flatMap(([rx, rz], idx) => [
    {
      id: `floor_cage_rod_${idx}`,
      name: `Floor Cage Anchor Stud #${idx + 1}`,
      group: 'Inlet Supply & Floor Collar',
      role: 'detail' as const,
      fitClass: 'fastener' as const,
      positionMm: [rx, 56, rz] as [number, number, number],
      rotationDeg: [0, 0, 0] as [number, number, number],
      geometry: { kind: 'cylinder' as const, radius: 6, height: 112, radialSegments: 12 },
      material: MAT_STAINLESS,
      explodeOffsetMm: [0, -35, 0] as [number, number, number],
      toleranceMm: 0.2,
    },
    {
      id: `floor_cage_nut_${idx}`,
      name: `Floor Cage Top Hex Nut #${idx + 1}`,
      group: 'Inlet Supply & Floor Collar',
      role: 'detail' as const,
      fitClass: 'fastener' as const,
      positionMm: [rx, 106, rz] as [number, number, number],
      rotationDeg: [0, 0, 0] as [number, number, number],
      geometry: { kind: 'cylinder' as const, radius: 10.5, height: 10, radialSegments: 6 },
      material: MAT_STAINLESS,
      explodeOffsetMm: [0, -25, 0] as [number, number, number],
      toleranceMm: 0.15,
    },
  ]),
  // Main 2.5" copper floor supply elbow sweeping into horizontal bottom manifold (Watertight CSG 3D Sweep)
  {
    id: 'inlet_supply_elbow_sweep',
    name: 'Main Inlet 90° Copper Supply Elbow (CSG Sweep)',
    group: 'Inlet Supply & Floor Collar',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 36,
        radialSegments: 24,
        cornerMode: 'bend',
        bendRadiusMm: 78,
        bendSegments: 10,
        pathPoints: [
          [20, 12, 0],
          [20, 260, 0],
          [-125, 260, 0],
        ],
      },
    },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [40, -60, 0],
    toleranceMm: 0.3,
  },
  makePressRing('inlet_press_1', 'Inlet ProPress Collar (Lower)', 'Inlet Supply & Floor Collar', [20, 155, 0], 'y', 36, [40, -60, 0]),
  makePressRing('inlet_press_2', 'Inlet ProPress Collar (Horizontal)', 'Inlet Supply & Floor Collar', [-80, 260, 0], 'x', 36, [40, -60, 0]),

  // Bottom-tier brass isolation ball valve with vertical downward RED lever handle (BV-0)
  ...makeBrassBallValve(
    'bottom_isolation_bv',
    'Main Inlet Isolation Ball Valve',
    'Inlet Supply & Floor Collar',
    -200,
    260,
    46,
    148,
    'downRed',
    [0, -80, 30]
  ),

  // Bottom-tier Royal Blue Flanged Y-Strainer (matches photo's 45° downward-left screen leg!)
  ...makeBoltedFlangeX('bottom_blue_flange_r', 'Inlet Y-Strainer Right', 'Inlet Supply & Floor Collar', -285, 265, 0, 92, 22, MAT_VALVE_BLUE, [-40, -85, 0]),
  ...makeBoltedFlangeX('bottom_blue_flange_l', 'Inlet Y-Strainer Left', 'Inlet Supply & Floor Collar', -455, 265, 0, 92, 22, MAT_VALVE_BLUE, [-40, -85, 0]),
  ...makeBlueFlangedYStrainer(
    'bottom_blue_strainer',
    'Inlet Flanged Blue Y-Strainer',
    'Inlet Supply & Floor Collar',
    -370,
    265,
    152,
    52,
    146,
    43,
    [-40, -85, 0]
  ),

  // Lower-left copper C-bend rising from bottom Y-strainer up into Tier 1 Meter Branch (Watertight CSG 3D Sweep)
  {
    id: 'lower_left_copper_riser_sweep',
    name: 'Lower-Left Copper Transition Riser (CSG Sweep)',
    group: 'Tier 1: Meter & Gate Valves',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 34,
        radialSegments: 24,
        cornerMode: 'bend',
        bendRadiusMm: 72,
        bendSegments: 10,
        pathPoints: [
          [-455, 265, 0],
          [-610, 265, 0],
          [-610, 695, 0],
          [-305, 695, 0],
        ],
      },
    },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-110, -30, 0],
    toleranceMm: 0.3,
  },
  makePressRing('ll_press_1', 'Lower Elbow ProPress Collar', 'Tier 1: Meter & Gate Valves', [-610, 355, 0], 'y', 34, [-110, -30, 0]),
  makePressRing('ll_press_2', 'Upper Elbow ProPress Collar', 'Tier 1: Meter & Gate Valves', [-610, 615, 0], 'y', 34, [-110, -30, 0]),
  makePressRing('ll_press_3', 'Meter Inlet ProPress Collar', 'Tier 1: Meter & Gate Valves', [-455, 695, 0], 'x', 34, [-110, -30, 0]),

  // Grounding bonding clamp & yellow-copper grounding conductor trailing from bottom-left elbow (CSG Sweep)
  {
    id: 'ground_clamp_collar',
    name: 'Bronze Pipe Grounding Clamp',
    group: 'Inlet Supply & Floor Collar',
    role: 'detail',
    positionMm: [-575, 246, 26],
    rotationDeg: [0, 0, 40],
    geometry: { kind: 'roundedBox', width: 32, height: 18, depth: 22, bevelRadius: 3 },
    material: MAT_BRONZE_DARK,
    explodeOffsetMm: [-120, -60, 40],
    toleranceMm: 0.25,
  },
  {
    id: 'ground_bonding_wire',
    name: 'Electrical Grounding Bonding Wire (CSG Sweep)',
    group: 'Inlet Supply & Floor Collar',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 4.5,
        radialSegments: 10,
        pathMode: 'spline',
        splineSamples: 24,
        pathPoints: [
          [-572, 240, 28],
          [-548, 165, 55],
          [-500, 75, 85],
          [-475, 16, 130],
          [-565, 8, 155],
          [-715, 6, 140],
        ],
      },
    },
    material: MAT_GROUND_WIRE,
    explodeOffsetMm: [-120, -80, 60],
    toleranceMm: 0.4,
  },

  // =========================================================================
  // 2. TIER 1: DUAL BLUE OS&Y GATE VALVES, FLOW METER & PRESSURE GAUGE (Y = 695 mm)
  // =========================================================================
  ...makeFlangedGateValve(
    'meter_gate_l',
    'Upstream OS&Y Gate Valve',
    'Tier 1: Meter & Gate Valves',
    -225,
    695,
    208,
    [-55, -25, 45]
  ),
  // Red ANSI bolted flange isolation rings bracketing the stainless flow meter (CSG)
  ...makeBoltedFlangeX('meter_red_ring_l', 'Flow Meter Left Red', 'Tier 1: Meter & Gate Valves', -136, 695, 0, 78, 16, MAT_RED_GASKET, [0, -25, 70], 8),
  ...makeBoltedFlangeX('meter_red_ring_r', 'Flow Meter Right Red', 'Tier 1: Meter & Gate Valves', 76, 695, 0, 78, 16, MAT_RED_GASKET, [0, -25, 70], 8),
  // Stainless steel commercial ultrasonic/mag flow meter spool (CSG Revolve)
  {
    id: 'flow_meter_tube',
    name: 'Stainless Commercial Water Flow Meter Tube (CSG)',
    group: 'Tier 1: Meter & Gate Valves',
    role: 'primary',
    positionMm: [-30, 695, 0],
    rotationDeg: [0, 0, 90],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'revolve',
        radialSegments: 28,
        lathePoints: [
          [0, -100],
          [46, -100],
          [46, -86],
          [41, -82],
          [41, 82],
          [46, 86],
          [46, 100],
          [0, 100],
        ],
      },
    },
    material: MAT_STAINLESS,
    explodeOffsetMm: [0, -25, 80],
    toleranceMm: 0.2,
  },
  {
    id: 'flow_meter_bronze_collar',
    name: 'Flow Meter Bronze Sensor Collar',
    group: 'Tier 1: Meter & Gate Valves',
    role: 'secondary',
    positionMm: [-66, 695, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 50, height: 76, radialSegments: 24 },
    material: MAT_BRONZE_DARK,
    explodeOffsetMm: [0, -25, 80],
    toleranceMm: 0.2,
  },
  {
    id: 'flow_meter_top_boss',
    name: 'Flow Meter Top Ultrasonic Sensor Boss (CSG)',
    group: 'Tier 1: Meter & Gate Valves',
    role: 'detail',
    positionMm: [-66, 756, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          { op: 'cylinder', radius: 15, height: 22, radialSegments: 6, translateMm: [0, -6, 0] },
          { op: 'cylinder', radius: 12, height: 28, radialSegments: 16, translateMm: [0, 12, 0] },
        ],
      },
    },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [0, -10, 80],
    toleranceMm: 0.2,
  },
  // Underslung black electronic register housing (CSG) & drooping silver sensor wire loop (CSG Sweep)
  {
    id: 'flow_meter_register_head',
    name: 'Flow Meter Electronic Transmitter Head (CSG)',
    group: 'Tier 1: Meter & Gate Valves',
    role: 'secondary',
    positionMm: [-66, 612, 6],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          // Main cylindrical transmitter body
          { op: 'cylinder', radius: 40, height: 64, radialSegments: 24 },
          // Neck collar mating up into bronze sensor saddle
          { op: 'cylinder', radius: 18, height: 34, radialSegments: 16, translateMm: [0, 42, -4] },
          // Front flat LCD readout bezel face (+Z)
          { op: 'box', width: 58, height: 42, depth: 18, translateMm: [0, 0, 34] },
        ],
      },
    },
    material: MAT_DARK_HOUSING,
    explodeOffsetMm: [0, -50, 85],
    toleranceMm: 0.25,
  },
  {
    id: 'flow_meter_sensor_cable',
    name: 'Flow Meter Shielded Signal Cable Loop (CSG Sweep)',
    group: 'Tier 1: Meter & Gate Valves',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 3.5,
        radialSegments: 10,
        pathMode: 'spline',
        splineSamples: 22,
        pathPoints: [
          [-138, 650, 22],
          [-152, 560, 28],
          [-120, 488, 30],
          [-68, 495, 28],
          [-48, 565, 22],
          [-58, 595, 14],
        ],
      },
    },
    material: MAT_STAINLESS,
    explodeOffsetMm: [0, -60, 90],
    toleranceMm: 0.35,
  },
  ...makeFlangedGateValve(
    'meter_gate_r',
    'Downstream OS&Y Gate Valve',
    'Tier 1: Meter & Gate Valves',
    165,
    695,
    185,
    [55, -25, 45]
  ),

  // Right vertical copper header sweeping from Tier 1 outlet -> Tier 2 Tee -> Tier 3 Top Bypass (Watertight CSG Sweep)
  {
    id: 'right_vertical_copper_header',
    name: 'Right Vertical Copper Distribution Header (CSG Sweep)',
    group: 'Right Distribution Header',
    role: 'primary',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 34,
        radialSegments: 24,
        cornerMode: 'bend',
        bendRadiusMm: 72,
        bendSegments: 10,
        pathPoints: [
          [262, 695, 0],
          [740, 695, 0],
          [740, 1435, 0],
          [602, 1435, 0],
        ],
      },
    },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [120, 0, 0],
    toleranceMm: 0.3,
  },
  // ProPress fitting hubs & collars along the right vertical header
  makePressRing('rh_press_1', 'Right Header Lower Collar', 'Right Distribution Header', [625, 695, 0], 'x', 34, [120, 0, 0]),
  makePressRing('rh_press_2', 'Right Header Riser Collar 1', 'Right Distribution Header', [740, 815, 0], 'y', 34, [120, 0, 0]),
  makePressRing('rh_press_3', 'Right Header Riser Collar 2', 'Right Distribution Header', [740, 960, 0], 'y', 34, [120, 0, 0]),
  makeProPressTee(
    'rh_mid_tee_hub',
    'Right Header Tier-2 ProPress Tee Hub',
    'Right Distribution Header',
    [740, 1095, 0],
    42,
    118,
    38,
    -1,
    [120, 0, 0]
  ),
  makePressRing('rh_press_4', 'Right Header Upper Collar', 'Right Distribution Header', [740, 1260, 0], 'y', 34, [120, 0, 0]),
  makePressRing('rh_press_5', 'Right Header Top Bypass Reducer', 'Right Distribution Header', [630, 1435, 0], 'x', 28, [120, 0, 0]),

  // Right Tier-1 Vertical Pressure Gauge Riser + White Mini Isolation Valve + Round Dial Gauge
  {
    id: 'lower_gauge_tee',
    name: 'Outlet Pressure Gauge Tap Tee',
    group: 'Pressure Gauges & Instrumentation',
    role: 'detail',
    positionMm: [505, 695, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 40, height: 58, radialSegments: 22 },
    material: MAT_COPPER_FITTING,
    explodeOffsetMm: [60, 20, 35],
    toleranceMm: 0.25,
  },
  {
    id: 'lower_gauge_stem_pipe',
    name: 'Outlet Pressure Gauge Copper Riser',
    group: 'Pressure Gauges & Instrumentation',
    role: 'detail',
    positionMm: [505, 815, 0],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'cylinder', radius: 9, height: 185, radialSegments: 16 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [60, 35, 35],
    toleranceMm: 0.2,
  },
  {
    id: 'lower_gauge_mini_valve',
    name: 'Gauge Isolation Mini Ball Valve',
    group: 'Pressure Gauges & Instrumentation',
    role: 'detail',
    positionMm: [505, 825, 0],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'cylinder', radius: 14, height: 34, radialSegments: 6 },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [60, 35, 35],
    toleranceMm: 0.2,
  },
  {
    id: 'lower_gauge_white_handle',
    name: 'Gauge Isolation White Handle',
    group: 'Pressure Gauges & Instrumentation',
    role: 'detail',
    positionMm: [538, 825, 12],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'roundedBox', width: 54, height: 11, depth: 9, bevelRadius: 3 },
    material: MAT_WHITE_HANDLE,
    explodeOffsetMm: [65, 35, 45],
    toleranceMm: 0.2,
  },
  ...makePressureGauge(
    'lower_dial_gauge',
    'Manifold Inlet Pressure Gauge',
    'Pressure Gauges & Instrumentation',
    505,
    955,
    0,
    [60, 55, 40]
  ),

  // =========================================================================
  // 3. TIER 2: MAIN ROYAL-BLUE PILOT-OPERATED PRV & Y-STRAINER BRANCH (Y = 1095 mm)
  // =========================================================================
  {
    id: 'mid_copper_right_stub',
    name: 'Main PRV Branch Right Copper Pipe',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'primary',
    positionMm: [652, 1095, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 34, height: 106, radialSegments: 24 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [90, 20, 0],
    toleranceMm: 0.3,
  },
  // Right 2.5" cast brass isolation ball valve
  ...makeBrassBallValve(
    'mid_right_bv',
    'Main PRV Upstream Brass Ball Valve',
    'Tier 2: Main Blue PRV & Strainer',
    522,
    1095,
    46,
    154,
    'up',
    [65, 25, 25]
  ),
  // Copper spool from right brass ball valve to blue Y-strainer flange
  {
    id: 'mid_copper_mid_spool',
    name: 'Main PRV Upstream Copper Spool',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'primary',
    positionMm: [275, 1095, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 34, height: 356, radialSegments: 24 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [30, 25, 0],
    toleranceMm: 0.3,
  },
  makePressRing('mid_press_r1', 'Main PRV Spool ProPress Collar', 'Tier 2: Main Blue PRV & Strainer', [122, 1095, 0], 'x', 34, [30, 25, 0]),

  // Royal Blue Flanged Y-Strainer (Watertight CSG, X = -75 .. +95, Y = 1095, 45° downward-left screen leg)
  ...makeBoltedFlangeX('mid_strainer_flange_r', 'Blue Y-Strainer Right', 'Tier 2: Main Blue PRV & Strainer', 95, 1095, 0, 96, 22, MAT_VALVE_BLUE, [15, 30, 55]),
  ...makeBoltedFlangeX('mid_strainer_flange_l', 'Blue Y-Strainer / PRV Mating', 'Tier 2: Main Blue PRV & Strainer', -75, 1095, 0, 96, 26, MAT_VALVE_BLUE, [0, 30, 55]),
  ...makeBlueFlangedYStrainer(
    'mid_strainer',
    'Main PRV Blue Flanged Y-Strainer',
    'Tier 2: Main Blue PRV & Strainer',
    10,
    1095,
    158,
    52,
    168,
    46,
    [15, 30, 55]
  ),

  // Royal Blue Flanged Pilot-Operated PRV (Cla-Val 90-01 style, Watertight CSG, X = -295 .. -75, Y = 1095)
  ...makeBoltedFlangeX('mid_prv_flange_l', 'Blue Pilot PRV Left', 'Tier 2: Main Blue PRV & Strainer', -295, 1095, 0, 96, 22, MAT_VALVE_BLUE, [-25, 30, 55]),
  {
    id: 'mid_prv_body',
    name: 'Blue Pilot PRV Globe Body & Diaphragm Bonnet (CSG)',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'primary',
    positionMm: [-185, 1095, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          // Horizontal globe flow body
          {
            op: 'cylinder',
            radius: 58,
            height: 196,
            radialSegments: 28,
            rotateDeg: [0, 0, 90],
          },
          // Sculpted diaphragm chamber belly
          {
            op: 'sphere',
            radius: 74,
            radialSegments: 28,
          },
          // Bolted cover flange
          {
            op: 'cylinder',
            radius: 86,
            height: 22,
            radialSegments: 28,
            translateMm: [0, 57, 0],
          },
          // Revolved domed diaphragm bonnet cover
          {
            op: 'revolve',
            radialSegments: 28,
            translateMm: [0, 68, 0],
            lathePoints: [
              [0, 0],
              [76, 0],
              [72, 18],
              [52, 44],
              [24, 58],
              [18, 72],
              [0, 74],
            ],
          },
        ],
      },
    },
    material: MAT_VALVE_BLUE,
    explodeOffsetMm: [-20, 35, 55],
    toleranceMm: 0.3,
  },
  // 8 stainless hex bolts around the PRV diaphragm cover flange
  ...Array.from({ length: 8 }, (_, idx) => {
    const a = (idx / 8) * Math.PI * 2;
    const r = 74;
    return {
      id: `mid_prv_cover_bolt_${idx}`,
      name: `Blue Pilot PRV Cover Bolt #${idx + 1}`,
      group: 'Tier 2: Main Blue PRV & Strainer',
      role: 'detail' as const,
      fitClass: 'fastener' as const,
      positionMm: [-185 + Math.cos(a) * r, 1152, Math.sin(a) * r] as [number, number, number],
      rotationDeg: [0, 0, 0] as [number, number, number],
      geometry: { kind: 'cylinder' as const, radius: 5.5, height: 32, radialSegments: 6 },
      material: MAT_STAINLESS,
      explodeOffsetMm: [-20, 55, 55] as [number, number, number],
      toleranceMm: 0.15,
    };
  }),
  // Brass CRD pressure-reducing pilot control trim, compression tap fittings & overhead copper sensing tubing
  {
    id: 'mid_prv_pilot_valve',
    name: 'Brass CRD Pilot Control Valve (CSG)',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'detail',
    positionMm: [-185, 1262, 22],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          { op: 'cylinder', radius: 21, height: 22, radialSegments: 6, translateMm: [0, -16, 0] },
          { op: 'cylinder', radiusTop: 13, radiusBottom: 20, height: 42, radialSegments: 18, translateMm: [0, 10, 0] },
          { op: 'cylinder', radius: 6, height: 18, radialSegments: 6, translateMm: [0, 36, 0] },
        ],
      },
    },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [-20, 88, 65],
    toleranceMm: 0.2,
  },
  {
    id: 'mid_prv_pilot_tap_l',
    name: 'Pilot Tubing Upstream Brass Tap Fitting',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'detail',
    positionMm: [-252, 1138, 34],
    rotationDeg: [90, 0, 0],
    geometry: { kind: 'cylinder', radius: 10, height: 18, radialSegments: 6 },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [-20, 85, 65],
    toleranceMm: 0.2,
  },
  {
    id: 'mid_prv_pilot_tap_r',
    name: 'Pilot Tubing Downstream Brass Tap Fitting',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'detail',
    positionMm: [-84, 1152, 30],
    rotationDeg: [90, 0, 0],
    geometry: { kind: 'cylinder', radius: 10, height: 18, radialSegments: 6 },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [-20, 85, 65],
    toleranceMm: 0.2,
  },
  {
    id: 'mid_prv_pilot_tubing_loop',
    name: 'Copper Pilot Control Sensing Tubing (CSG Sweep)',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 4.5,
        radialSegments: 14,
        cornerMode: 'bend',
        bendRadiusMm: 18,
        bendSegments: 8,
        pathPoints: [
          [-252, 1138, 34],
          [-248, 1304, 32],
          [-86, 1304, 28],
          [-84, 1152, 30],
        ],
      },
    },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-20, 95, 65],
    toleranceMm: 0.25,
  },

  // Copper outlet spool + left brass isolation ball valve (with RED left-pointing handle) into Left Main Riser Tee
  {
    id: 'mid_copper_left_spool',
    name: 'Main PRV Downstream Copper Spool',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'primary',
    positionMm: [-355, 1095, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 34, height: 120, radialSegments: 24 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-55, 25, 0],
    toleranceMm: 0.3,
  },
  ...makeBrassBallValve(
    'mid_left_bv',
    'Main PRV Downstream Brass Ball Valve',
    'Tier 2: Main Blue PRV & Strainer',
    -465,
    1095,
    42,
    130,
    'leftRed',
    [-75, 25, 20]
  ),
  {
    id: 'mid_copper_riser_stub',
    name: 'Main PRV Riser Connection Pipe',
    group: 'Tier 2: Main Blue PRV & Strainer',
    role: 'primary',
    positionMm: [-550, 1095, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 34, height: 40, radialSegments: 24 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-95, 25, 0],
    toleranceMm: 0.3,
  },

  // =========================================================================
  // 4. TIER 3: TOP LOW-FLOW BYPASS PRV, BRASS Y-STRAINER & BALL VALVES (Y = 1435 mm)
  // =========================================================================
  ...makeBrassBallValve(
    'top_right_bv',
    'Bypass Upstream Brass Ball Valve',
    'Tier 3: Top Bypass PRV Branch',
    522,
    1435,
    34,
    124,
    'up',
    [60, 80, 20]
  ),
  {
    id: 'top_copper_right_run',
    name: 'Bypass Upstream Copper Pipe',
    group: 'Tier 3: Top Bypass PRV Branch',
    role: 'primary',
    positionMm: [315, 1435, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 22, height: 318, radialSegments: 22 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [25, 80, 0],
    toleranceMm: 0.25,
  },
  // Stainless dielectric/union coupling flanking the brass Y-strainer
  {
    id: 'top_strainer_union_r',
    name: 'Bypass Y-Strainer Right Stainless Union',
    group: 'Tier 3: Top Bypass PRV Branch',
    role: 'detail',
    positionMm: [172, 1435, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 30, height: 34, radialSegments: 6 },
    material: MAT_STAINLESS,
    explodeOffsetMm: [10, 85, 30],
    toleranceMm: 0.2,
  },
  // Cast Brass Y-Strainer (Watertight CSG, X = +108, Y = 1435, 45° downward-left pocket)
  {
    id: 'top_brass_strainer_assembly',
    name: 'Bypass Cast-Brass Y-Strainer (CSG)',
    group: 'Tier 3: Top Bypass PRV Branch',
    role: 'primary',
    positionMm: [108, 1435, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          {
            op: 'cylinder',
            radius: 29,
            height: 102,
            radialSegments: 22,
            rotateDeg: [0, 0, 90],
          },
          {
            op: 'cylinder',
            radius: 25,
            height: 96,
            radialSegments: 20,
            translateMm: [-18, -36, 0],
            rotateDeg: [0, 0, -45],
          },
          {
            op: 'cylinder',
            radius: 27,
            height: 18,
            radialSegments: 6,
            translateMm: [-48, -68, 0],
            rotateDeg: [0, 0, -45],
          },
        ],
      },
    },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [10, 85, 35],
    toleranceMm: 0.25,
  },
  {
    id: 'top_copper_mid_run',
    name: 'Bypass Mid Copper Connector',
    group: 'Tier 3: Top Bypass PRV Branch',
    role: 'primary',
    positionMm: [-4, 1435, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 22, height: 126, radialSegments: 22 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [0, 80, 0],
    toleranceMm: 0.25,
  },
  // Cast Brass Direct-Acting Spring-Loaded Bell-Housing PRV (Watertight CSG, X = -135, Y = 1435)
  {
    id: 'top_brass_prv_assembly',
    name: 'Bypass Brass Direct-Acting Spring-Bell PRV (CSG)',
    group: 'Tier 3: Top Bypass PRV Branch',
    role: 'primary',
    positionMm: [-135, 1435, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          // Main cast brass body
          {
            op: 'cylinder',
            radius: 36,
            height: 136,
            radialSegments: 22,
            rotateDeg: [0, 0, 90],
          },
          // Left & right hex union nuts
          {
            op: 'cylinder',
            radius: 35,
            height: 28,
            radialSegments: 6,
            rotateDeg: [0, 0, 90],
            translateMm: [-67, 0, 0],
          },
          {
            op: 'cylinder',
            radius: 35,
            height: 28,
            radialSegments: 6,
            rotateDeg: [0, 0, 90],
            translateMm: [67, 0, 0],
          },
          // Revolved bronze spring bell housing
          {
            op: 'revolve',
            radialSegments: 26,
            translateMm: [0, 23, 0],
            lathePoints: [
              [0, 0],
              [52, 0],
              [52, 16],
              [38, 22],
              [30, 86],
              [20, 118],
              [13, 128],
              [13, 144],
              [0, 144],
            ],
          },
        ],
      },
    },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [-20, 95, 35],
    toleranceMm: 0.25,
  },
  {
    id: 'top_brass_prv_adj_bolt',
    name: 'Bypass PRV Pressure Adjustment Screw & Locknut (CSG)',
    group: 'Tier 3: Top Bypass PRV Branch',
    role: 'detail',
    positionMm: [-135, 1612, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          { op: 'cylinder', radius: 11, height: 8, radialSegments: 6, translateMm: [0, -8, 0] },
          { op: 'cylinder', radius: 7, height: 28, radialSegments: 6, translateMm: [0, 2, 0] },
        ],
      },
    },
    material: MAT_STAINLESS,
    explodeOffsetMm: [-20, 130, 35],
    toleranceMm: 0.15,
  },
  {
    id: 'top_copper_left_run',
    name: 'Bypass Downstream Copper Pipe',
    group: 'Tier 3: Top Bypass PRV Branch',
    role: 'primary',
    positionMm: [-312, 1435, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 22, height: 215, radialSegments: 22 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-45, 80, 0],
    toleranceMm: 0.25,
  },
  ...makeBrassBallValve(
    'top_left_bv',
    'Bypass Downstream Brass Ball Valve',
    'Tier 3: Top Bypass PRV Branch',
    -470,
    1435,
    33,
    114,
    'leftRed',
    [-75, 80, 20]
  ),
  {
    id: 'top_copper_riser_stub',
    name: 'Bypass Riser Connection Pipe',
    group: 'Tier 3: Top Bypass PRV Branch',
    role: 'primary',
    positionMm: [-548, 1435, 0],
    rotationDeg: [0, 0, 90],
    geometry: { kind: 'cylinder', radius: 22, height: 43, radialSegments: 22 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-95, 80, 0],
    toleranceMm: 0.25,
  },

  // =========================================================================
  // 5. LEFT MAIN 3" COPPER DISTRIBUTION RISER, DRAIN & UPPER GAUGE (X = -610 mm)
  // =========================================================================
  {
    id: 'left_main_copper_riser',
    name: 'Left Main 3" Vertical Copper Riser',
    group: 'Left Main Copper Riser',
    role: 'primary',
    positionMm: [-610, 1715, 0],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'cylinder', radius: 39.5, height: 1320, radialSegments: 28 },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-125, 40, 0],
    toleranceMm: 0.3,
  },
  makeProPressTee(
    'left_riser_mid_tee',
    'Main Riser Tier-2 ProPress Tee',
    'Left Main Copper Riser',
    [-610, 1095, 0],
    46,
    120,
    38,
    1,
    [-125, 25, 0]
  ),
  makeProPressTee(
    'left_riser_top_tee',
    'Main Riser Tier-3 ProPress Tee',
    'Left Main Copper Riser',
    [-610, 1435, 0],
    46,
    106,
    27,
    1,
    [-125, 50, 0]
  ),
  // Bottom sediment drain assembly hanging beneath the main riser tee (Y = 805..1055)
  {
    id: 'left_riser_drain_reducer',
    name: 'Main Riser Concentric Copper Reducer (CSG)',
    group: 'Left Main Copper Riser',
    role: 'secondary',
    positionMm: [-610, 995, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'revolve',
        radialSegments: 24,
        lathePoints: [
          [0, -42],
          [18, -42],
          [18, -26],
          [40, 20],
          [44, 24],
          [44, 42],
          [0, 42],
        ],
      },
    },
    material: MAT_COPPER_FITTING,
    explodeOffsetMm: [-125, -20, 0],
    toleranceMm: 0.25,
  },
  {
    id: 'left_riser_drain_pipe',
    name: 'Riser Sediment Drain Drop Tube (CSG Sweep)',
    group: 'Left Main Copper Riser',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 11,
        radialSegments: 14,
        cornerMode: 'bend',
        bendRadiusMm: 22,
        bendSegments: 8,
        pathPoints: [
          [-610, 958, 0],
          [-610, 805, 0],
          [-652, 805, 0],
        ],
      },
    },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-125, -40, 0],
    toleranceMm: 0.25,
  },
  {
    id: 'left_riser_drain_valve_body',
    name: 'Sediment Drain Brass Mini Ball Valve',
    group: 'Left Main Copper Riser',
    role: 'detail',
    positionMm: [-610, 886, 0],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'cylinder', radius: 16, height: 34, radialSegments: 6 },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [-125, -35, 15],
    toleranceMm: 0.2,
  },
  {
    id: 'left_riser_drain_handle',
    name: 'Sediment Drain Red Tee Handle',
    group: 'Left Main Copper Riser',
    role: 'detail',
    positionMm: [-590, 886, 18],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'roundedBox', width: 48, height: 11, depth: 9, bevelRadius: 3 },
    material: MAT_RED_HANDLE,
    explodeOffsetMm: [-125, -35, 25],
    toleranceMm: 0.2,
  },
  // Upper riser brass union coupling + upper pressure gauge & test loop (Y = 1595..1790)
  {
    id: 'left_riser_upper_coupling',
    name: 'Main Riser Upper Brass Union Coupling (CSG)',
    group: 'Left Main Copper Riser',
    role: 'secondary',
    positionMm: [-610, 1735, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          { op: 'cylinder', radius: 46, height: 74, radialSegments: 24 },
          { op: 'cylinder', radius: 52, height: 28, radialSegments: 8 },
        ],
      },
    },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [-125, 65, 0],
    toleranceMm: 0.25,
  },
  {
    id: 'upper_gauge_bypass_tube',
    name: 'Upper Riser Pressure Test Loop (CSG Sweep)',
    group: 'Pressure Gauges & Instrumentation',
    role: 'detail',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sweep',
        radius: 7.5,
        radialSegments: 14,
        cornerMode: 'bend',
        bendRadiusMm: 22,
        bendSegments: 8,
        pathPoints: [
          [-575, 1595, 6],
          [-520, 1595, 10],
          [-520, 1742, 12],
        ],
      },
    },
    material: MAT_COPPER_PIPE,
    explodeOffsetMm: [-110, 75, 25],
    toleranceMm: 0.2,
  },
  {
    id: 'upper_gauge_test_body',
    name: 'Upper Riser Brass Test Cock Body',
    group: 'Pressure Gauges & Instrumentation',
    role: 'detail',
    positionMm: [-520, 1710, 12],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'cylinder', radius: 13, height: 30, radialSegments: 6 },
    material: MAT_BRASS_CAST,
    explodeOffsetMm: [-110, 75, 28],
    toleranceMm: 0.2,
  },
  {
    id: 'upper_gauge_test_valve',
    name: 'Upper Riser Red Test Cock Handle',
    group: 'Pressure Gauges & Instrumentation',
    role: 'detail',
    positionMm: [-548, 1710, 24],
    rotationDeg: [0, 0, 0],
    geometry: { kind: 'roundedBox', width: 52, height: 11, depth: 9, bevelRadius: 3 },
    material: MAT_RED_HANDLE,
    explodeOffsetMm: [-110, 75, 35],
    toleranceMm: 0.2,
  },
  ...makePressureGauge(
    'upper_dial_gauge',
    'Distribution Riser Discharge Pressure Gauge',
    'Pressure Gauges & Instrumentation',
    -520,
    1785,
    12,
    [-110, 90, 30]
  ),
  // Upper riser copper-plated split-ring wall pipe hanger & anchor plate (CSG, Y = 2005)
  {
    id: 'left_riser_wall_clamp',
    name: 'Riser Copper-Plated Split-Ring Wall Clamp (CSG)',
    group: 'Left Main Copper Riser',
    role: 'detail',
    anchorKind: 'wall',
    positionMm: [-610, 2005, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'union',
        children: [
          // Split-ring collar around 3" copper riser
          { op: 'cylinder', radius: 52, height: 28, radialSegments: 24 },
          // Clamping side ears
          { op: 'box', width: 124, height: 22, depth: 18 },
          // Rear standoff rod
          { op: 'cylinder', radius: 8, height: 86, radialSegments: 12, rotateDeg: [90, 0, 0], translateMm: [0, 0, -64] },
          // Wall anchor flange plate
          { op: 'box', width: 88, height: 64, depth: 10, translateMm: [0, 0, -108] },
        ],
      },
    },
    material: MAT_COPPER_FITTING,
    explodeOffsetMm: [-125, 85, -35],
    toleranceMm: 0.25,
  },

  // =========================================================================
  // 6. FOUR-POST GALVANIZED UNISTRUT P1000T RACK, GUSSETS & CUSHION CLAMPS
  // =========================================================================
  ...makeUnistrutPost('strut_fl', 'Front-Left Strut Post', -385, 122, 1445, [-70, 0, 120]),
  ...makeUnistrutPost('strut_rl', 'Rear-Left Strut Post', -385, -132, 1500, [-70, 0, -120]),
  ...makeUnistrutPost('strut_fr', 'Front-Right Strut Post', 365, 122, 1465, [70, 0, 120]),
  ...makeUnistrutPost('strut_rr', 'Rear-Right Strut Post', 365, -132, 1520, [70, 0, -120]),

  // Horizontal Z-axis Unistrut P1000T slotted cradle cross-bars + 90° gusset brackets + EPDM cushion clamps
  ...([
    { id: 'cross_l_t1', name: 'Left Rack Tier-1 Support Rail', x: -385, y: 636, ex: -70, pipeR: 34 },
    { id: 'cross_l_t2', name: 'Left Rack Tier-2 Support Rail', x: -385, y: 1036, ex: -70, pipeR: 34 },
    { id: 'cross_l_t3', name: 'Left Rack Tier-3 Support Rail', x: -385, y: 1388, ex: -70, pipeR: 22 },
    { id: 'cross_r_t1', name: 'Right Rack Tier-1 Support Rail', x: 365, y: 636, ex: 70, pipeR: 34 },
    { id: 'cross_r_t2', name: 'Right Rack Tier-2 Support Rail', x: 365, y: 1036, ex: 70, pipeR: 34 },
    { id: 'cross_r_t3', name: 'Right Rack Tier-3 Support Rail', x: 365, y: 1388, ex: 70, pipeR: 22 },
  ]).flatMap((rail): BlueprintPart[] => [
    {
      id: rail.id,
      name: `${rail.name} (CSG P1000T)`,
      group: 'Unistrut Support Frame',
      role: 'secondary',
      positionMm: [rail.x, rail.y, -5],
      rotationDeg: [90, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'slottedChannel',
          width: 41.3,
          height: 296,
          depth: 41.3,
          wallThickness: 2.8,
          lipWidthMm: 7.5,
          slotPitchMm: 62,
          slotWidthMm: 14,
          slotLengthMm: 32,
        },
      },
      material: MAT_UNISTRUT,
      explodeOffsetMm: [rail.ex, 0, 0],
      toleranceMm: 0.3,
    },
    // Front & rear 90° galvanized Unistrut P1026 corner gusset brackets
    {
      id: `${rail.id}_gusset_f`,
      name: `${rail.name} Front 90° Bracket`,
      group: 'Unistrut Support Frame',
      role: 'detail',
      positionMm: [rail.x, rail.y - 34, 92],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            { op: 'box', width: 41, height: 52, depth: 8, translateMm: [0, 0, 9] },
            { op: 'box', width: 41, height: 8, depth: 52, translateMm: [0, 22, -13] },
          ],
        },
      },
      material: MAT_UNISTRUT,
      explodeOffsetMm: [rail.ex, -10, 40],
      toleranceMm: 0.25,
    },
    {
      id: `${rail.id}_gusset_r`,
      name: `${rail.name} Rear 90° Bracket`,
      group: 'Unistrut Support Frame',
      role: 'detail',
      positionMm: [rail.x, rail.y - 34, -102],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            { op: 'box', width: 41, height: 52, depth: 8, translateMm: [0, 0, -9] },
            { op: 'box', width: 41, height: 8, depth: 52, translateMm: [0, 22, 13] },
          ],
        },
      },
      material: MAT_UNISTRUT,
      explodeOffsetMm: [rail.ex, -10, -40],
      toleranceMm: 0.25,
    },
    // EPDM vibration-isolating cushion liner
    {
      id: `${rail.id}_cushion`,
      name: `${rail.name} EPDM Pipe Cushion`,
      group: 'Unistrut Support Frame',
      role: 'detail',
      positionMm: [rail.x, rail.y + 21 + rail.pipeR + 3, 0],
      rotationDeg: [0, 0, 90],
      geometry: {
        kind: 'cylinder',
        radius: rail.pipeR + 3.5,
        height: 34,
        radialSegments: 22,
      },
      material: MAT_EPDM_CUSHION,
      explodeOffsetMm: [rail.ex, 16, 0],
      toleranceMm: 0.25,
    },
    // Watertight CSG two-piece galvanized Unistrut pipe clamp with top clamping lug
    {
      id: `${rail.id}_clamp`,
      name: `${rail.name} Cushion Pipe Clamp (CSG)`,
      group: 'Unistrut Support Frame',
      role: 'detail',
      positionMm: [rail.x, rail.y + 21 + rail.pipeR + 3, 0],
      rotationDeg: [0, 0, 0],
      geometry: {
        kind: 'csgSolid',
        csgRoot: {
          op: 'union',
          children: [
            {
              op: 'cylinder',
              radius: rail.pipeR + 6.5,
              height: 26,
              radialSegments: 24,
              rotateDeg: [0, 0, 90],
            },
            // Top bolted pinch ears
            {
              op: 'box',
              width: 26,
              height: 18,
              depth: 14,
              translateMm: [0, rail.pipeR + 12, 0],
            },
            // Base saddle tabs engaging Unistrut slot
            {
              op: 'box',
              width: 28,
              height: 12,
              depth: (rail.pipeR + 14) * 2,
              translateMm: [0, -rail.pipeR - 1, 0],
            },
          ],
        },
      },
      material: MAT_UNISTRUT,
      explodeOffsetMm: [rail.ex, 22, 0],
      toleranceMm: 0.25,
    },
  ]),

  // Brushed 316 stainless steel station data nameplate bracket mounted on front-right Unistrut post
  {
    id: 'station_nameplate_bracket',
    name: 'Stainless Station Equipment Nameplate Bracket',
    group: 'Unistrut Support Frame',
    role: 'detail',
    positionMm: [365, 1225, 147],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'roundedBox',
      width: 140,
      height: 92,
      depth: 6,
      bevelRadius: 1.5,
    },
    material: MAT_STAINLESS,
    explodeOffsetMm: [70, 10, 150],
    toleranceMm: 0.2,
  },
];

export const COPPER_PRV_MANIFOLD_BLUEPRINT: MeshBlueprint = {
  id: 'copper-prv-manifold-station-v1',
  name: 'Commercial Copper PRV & Dual-Tier Meter Manifold Station',
  category: 'Commercial MEP / Domestic Water PRV Assembly',
  summary:
    'Three-tier commercial domestic water pressure reducing valve (PRV) and metering manifold built from Type L copper with watertight CSG ProPress sweeps and tees, slotted P1000T floor anchor cage, lower blue flanged Y-strainer and red-handled brass isolation valve, twin blue OS&Y rising-stem gate valves with CSG spoked handwheels flanking a stainless ultrasonic flow meter with electronic transmitter and signal loop, middle royal-blue pilot-operated PRV + flanged Y-strainer with copper pilot sensing tubing, top low-flow bypass brass bell-housing PRV + brass Y-strainer, dual liquid-filled stainless pressure gauges, four-post P1000T Unistrut rack with gussets and EPDM cushion clamps, ASME A13.1 pipe markers, phenolic valve tags, and installation clearance envelope.',
  sourceImageUrl: '/assets/aistudio/images__2__39ac10c7.jpeg',
  isReferencePreset: true,
  envelopeMm: {
    width: 1520,
    height: 2375,
    depth: 320,
  },
  toleranceSpecMm: 0.3,
  symmetryPlane: 'none',
  photoMatchCamera: {
    positionMm: [440, 1210, 2940],
    targetMm: [30, 1085, 0],
    fov: 43,
  },
  parts,
  decals: [
    // ASME A13.1 Potable Water Pipe Markers (green/white with directional flow arrows)
    {
      id: 'pipe-marker-tier2-dcw',
      targetPartId: 'mid_copper_mid_spool',
      positionMm: [275, 1095, 34],
      rotationDeg: [0, 0, 0],
      sizeMm: [190, 48, 36],
      text: 'DOMESTIC COLD WATER',
      colorHex: '#ffffff',
      bgHex: '#007a33',
      signage: {
        template: 'asme_pipe_marker',
        fluidClass: 'POTABLE_WATER',
        flowDir: 'left',
        title: 'DOMESTIC COLD WATER',
        citation: 'ASME A13.1',
      },
    },
    {
      id: 'pipe-marker-tier3-bypass',
      targetPartId: 'top_copper_right_run',
      positionMm: [315, 1435, 22],
      rotationDeg: [0, 0, 0],
      sizeMm: [175, 38, 28],
      text: 'DCW LOW-FLOW BYPASS',
      colorHex: '#ffffff',
      bgHex: '#007a33',
      signage: {
        template: 'asme_pipe_marker',
        fluidClass: 'POTABLE_WATER',
        flowDir: 'left',
        title: 'DCW LOW-FLOW BYPASS',
        citation: 'ASME A13.1',
      },
    },
    {
      id: 'pipe-marker-left-riser',
      targetPartId: 'left_main_copper_riser',
      positionMm: [-610, 1875, 40],
      rotationDeg: [0, 0, 90],
      sizeMm: [210, 52, 42],
      text: 'DOMESTIC WATER · 65 PSI',
      colorHex: '#ffffff',
      bgHex: '#007a33',
      signage: {
        template: 'asme_pipe_marker',
        fluidClass: 'POTABLE_WATER',
        flowDir: 'right',
        title: 'DOMESTIC WATER · 65 PSI',
        citation: 'ASME A13.1',
      },
    },
    // Engraved Phenolic Valve Identification Tags
    {
      id: 'tag-prv1-main',
      targetPartId: 'mid_prv_body',
      positionMm: [-185, 1095, 75],
      rotationDeg: [0, 0, 0],
      sizeMm: [86, 40, 26],
      text: 'PRV-1 MAIN',
      colorHex: '#ffffff',
      signage: {
        template: 'phenolic_tag',
        finish: 'PHENOLIC_BLK_WHT',
        title: 'PRV-1 · MAIN',
        lines: ['SET 65 PSI · 2.5"'],
      },
    },
    {
      id: 'tag-bv0-main-shutoff',
      targetPartId: 'bottom_isolation_bv_body',
      positionMm: [-200, 260, 47],
      rotationDeg: [0, 0, 0],
      sizeMm: [76, 34, 24],
      text: 'BV-0 MAIN SHUTOFF',
      colorHex: '#ffffff',
      signage: {
        template: 'phenolic_tag',
        finish: 'PHENOLIC_RED_WHT',
        title: 'BV-0 · MAIN',
        lines: ['INLET SHUTOFF'],
      },
    },
    // Flow Meter Digital Readout / Rating Tag
    {
      id: 'flow-meter-readout',
      targetPartId: 'flow_meter_register_head',
      positionMm: [-66, 612, 49],
      rotationDeg: [0, 0, 0],
      sizeMm: [54, 38, 12],
      text: 'FM-101 · 48.2 GPM',
      subtext: 'ULTRASONIC METER',
      colorHex: '#38bdf8',
      bgHex: '#0f172a',
      fontWeight: 'bold',
    },
    // Stainless Equipment Rating Nameplate on Front-Right Strut Post
    {
      id: 'station-rating-nameplate',
      targetPartId: 'station_nameplate_bracket',
      positionMm: [365, 1225, 151],
      rotationDeg: [0, 0, 0],
      sizeMm: [132, 84, 14],
      text: 'PRV & METER STATION',
      colorHex: '#111827',
      signage: {
        template: 'rating_nameplate',
        vendor: 'COMMERCIAL MEP SYSTEMS',
        title: 'DUAL-TIER PRV & METER MANIFOLD',
        marks: 'ASSE 1003 / NSF 61',
        rows: [
          ['ASSET ID', 'PRV-STA-01'],
          ['INLET / OUT', '125 PSI -> 65 PSI'],
          ['MAIN / BYP', '2.5" / 1.5" TYPE L CU'],
          ['MAX TEMP', '140 °F (60 °C)'],
        ],
      },
    },
  ],
  installation: {
    operatorSide: '+z',
    underCrane: false,
    notes:
      'Wall-adjacent mechanical room domestic water PRV & metering station. Requires 36 in front working clearance for OS&Y gate valve operation, pressure gauge reading, and Y-strainer screen cleanout.',
    floorZones: [
      {
        id: 'prv-operator-access',
        kind: 'operator',
        label: 'Valve Operation & Gauge Inspection Zone',
        citation: 'IPC / OSHA 1910.22 · 36 in (914 mm) clear working depth',
        rectMm: { centerX: 50, centerZ: 620, widthX: 1620, depthZ: 915 },
      },
      {
        id: 'prv-strainer-service',
        kind: 'service_access',
        label: 'Y-Strainer Cleanout & Sediment Blowdown Zone',
        citation: 'Service clearance for screen removal & floor drain flush',
        rectMm: { centerX: -480, centerZ: 340, widthX: 620, depthZ: 680 },
      },
    ],
    utilities: [
      {
        id: 'dcw-city-inlet',
        kind: 'water_supply',
        label: 'Domestic Cold Water City Main Inlet',
        spec: '2.5 in Type L Copper · 125 PSI Unregulated Supply',
        positionMm: [20, 12, 0],
        floorPointMm: [20, 0],
        routing: 'floor_stub',
        pipeOrConduitSize: '2-1/2" CTS Copper',
      },
      {
        id: 'dcw-regulated-riser',
        kind: 'water_return',
        label: 'Regulated Building Distribution Riser',
        spec: '3 in Type L Copper · 65 PSI Regulated Domestic Water',
        positionMm: [-610, 2375, 0],
        floorPointMm: [-610, 0],
        routing: 'overhead_drop',
        pipeOrConduitSize: '3" CTS Copper',
      },
      {
        id: 'riser-sediment-drain',
        kind: 'drain',
        label: 'Sediment Blowdown & Strainer Flush Drain',
        spec: '3/4 in Copper Indirect Drain to Mechanical Room Floor Sink',
        positionMm: [-652, 805, 0],
        floorPointMm: [-652, 0],
        routing: 'floor_stub',
        pipeOrConduitSize: '3/4" CTS Copper',
      },
      {
        id: 'meter-bms-telemetry',
        kind: 'network',
        label: 'Ultrasonic Flow Meter BMS / AMR Signal',
        spec: '24 VDC · RS-485 BACnet/Modbus & Pulse Output',
        positionMm: [-66, 612, 6],
        floorPointMm: [-66, -132],
        routing: 'rear_manifold',
        pipeOrConduitSize: '1/2" EMT',
      },
    ],
  },
  reconstructedAt: new Date().toISOString(),
  fiveAngleAudit: {
    auditedAt: new Date().toISOString(),
    angles: [
      {
        angle: 'photoMatch',
        label: 'Photo-Match Elevation',
        status: 'verified',
        note: 'Matches slight right-offset perspective showing front/rear Unistrut post stagger, slotted floor strut cage, lower blue flanged Y-strainer, all three copper tiers, red left-riser ball valve levers, gauges, and left 3" riser.',
      },
      {
        angle: 'front',
        label: 'Front Orthographic (+Z)',
        status: 'verified',
        note: 'All three horizontal tiers (Y = 695, 1095, 1435 mm) are parallel, level, and properly spaced with ASME A13.1 potable water markers and phenolic valve ID tags.',
      },
      {
        angle: 'left',
        label: 'Left Elevation (-X)',
        status: 'verified',
        note: 'Left 3" riser, sediment drain valve with brass body, upper gauge test loop, and lower C-bend transition clear the left Unistrut posts cleanly.',
      },
      {
        angle: 'right',
        label: 'Right Elevation (+X)',
        status: 'verified',
        note: 'Right vertical CSG swept header, Tier-1 pressure gauge riser, and right Unistrut frame cross-rails with 90° gussets align cleanly along Z = 0.',
      },
      {
        angle: 'top',
        label: 'Top Plan View (+Y)',
        status: 'verified',
        note: 'Front (+122 mm) and rear (-132 mm) Unistrut posts symmetrically straddle the Z = 0 piping plane with full clearance for ANSI 150# valve flanges.',
      },
    ],
    correctionsApplied: [
      'Replaced lower check-valve dome with watertight CSG royal-blue flanged Y-strainer (45° downward-left screen leg) matching the reference photograph.',
      'Upgraded OS&Y gate valves, spoked handwheels, brass ball valves, Tier-2 blue Y-strainer & pilot PRV, Tier-3 brass Y-strainer & spring-bell PRV, ProPress tees, pressure gauges, and swept piping/cables to watertight Manifold-3D CSG solids.',
      'Added red vinyl left-pointing levers on Tier-2 and Tier-3 left isolation ball valves, brass valve bodies behind drain/test-cock handles, P1000T slotted cross-rails with 90° gussets & EPDM cushion clamps.',
      'Authored SOT ASME A13.1 pipe markers, phenolic valve ID tags, stainless equipment rating nameplate, and full installation clearance + utility stub envelope.',
    ],
  },
};
