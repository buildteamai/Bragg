import { BlueprintPart, MeshBlueprint, PartMaterialSpec } from '../types/blueprint';

/**
 * General Mechanical Showcase Assembly compiled 100% through 18D's 20x Engine:
 *  1. Top-Down Master Skeleton (`module=4`, `18T:36T`, exact 108.0 mm pitch center distance)
 *  2. Bidirectional Interface Contracts (`boltedJoint` auto-drilling + bolts/washers,
 *     `bearingSeat` auto-boring + COTS ball bearings, `gearMesh` auto-phasing + live -0.5x coupling)
 *  3. All 5 Mechanical Fabrication Engines (`machinedBlock`, `sheetMetal`, `turnedShaft`,
 *     `involuteGear`, `structuralBeam` 80/20 T-slot, `ballBearing`)
 *  4. Fit-Aware Exact Manifold Boolean + Full-Stroke Kinematic Motion-Sweep Verification (100/100 Health)
 */

const MAT_CNC_HOUSING: PartMaterialSpec = {
  colorHex: '#4b586e',
  metalness: 0.62,
  roughness: 0.34,
  clearcoat: 0.16,
  textureKind: 'brushedMetal',
  finishName: '6061-T6 Anodized Slate CNC Aluminum',
};

const MAT_COVER_GLASS: PartMaterialSpec = {
  colorHex: '#dbeafe',
  metalness: 0.05,
  roughness: 0.1,
  transparent: true,
  opacity: 0.34,
  transmission: 0.68,
  ior: 1.49,
  finishName: 'Machined Polycarbonate Inspection Lid',
};

const MAT_HARDENED_GEAR: PartMaterialSpec = {
  colorHex: '#8b95a5',
  metalness: 0.88,
  roughness: 0.24,
  textureKind: 'brushedMetal',
  finishName: '4140 Case-Hardened Alloy Gear Steel',
};

const MAT_PINION_BRONZE: PartMaterialSpec = {
  colorHex: '#c69a4b',
  metalness: 0.86,
  roughness: 0.26,
  textureKind: 'brushedMetal',
  finishName: 'C95400 Aluminum-Bronze High-Speed Pinion',
};

const MAT_TURNED_SHAFT: PartMaterialSpec = {
  colorHex: '#dce3ec',
  metalness: 0.94,
  roughness: 0.16,
  textureKind: 'brushedMetal',
  finishName: 'Precision Ground 1045 Steel Shaft',
};

const MAT_8020_ALUM: PartMaterialSpec = {
  colorHex: '#c5cdd8',
  metalness: 0.78,
  roughness: 0.28,
  textureKind: 'brushedMetal',
  finishName: 'Clear Anodized 80/20 T-Slot Extrusion',
};

const MAT_SHEET_SAFETY: PartMaterialSpec = {
  colorHex: '#d97706',
  metalness: 0.22,
  roughness: 0.36,
  clearcoat: 0.3,
  finishName: 'Powder-Coated Safety Amber 11-Ga Steel',
};

const MAT_COUPLING_HUB: PartMaterialSpec = {
  colorHex: '#1f2937',
  metalness: 0.65,
  roughness: 0.32,
  finishName: 'Black Oxide Machined Drive Coupling',
};

// Master Skeleton Parameters (mm)
const MODULE = 4;
const TEETH_A = 18; // Pitch Ø72 mm
const TEETH_B = 36; // Pitch Ø144 mm
const CENTER_DIST = (MODULE * (TEETH_A + TEETH_B)) / 2; // Exact 108.0 mm
const INPUT_X = -CENTER_DIST / 2; // -54.0 mm
const OUTPUT_X = CENTER_DIST / 2; // +54.0 mm
const SHAFT_Y = 144; // 104 mm above top of 40 mm 80/20 skid rails

const parts: BlueprintPart[] = [
  // =========================================================================
  // 1. STRUCTURAL 80/20 T-SLOT EXTRUDED SKID FRAME (Grounded flush at Y = 0)
  // =========================================================================
  {
    id: 'skid_rail_left',
    name: 'Left 80/20 T-Slot Base Rail (40×40)',
    group: '80/20 Structural Skid',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [-130, 20, 0],
    rotationDeg: [0, 0, 0],
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'structuralBeam',
        profileType: 'tSlot8020',
        width: 40,
        height: 40,
        beamLengthMm: 340,
      },
    },
    material: MAT_8020_ALUM,
    explodeOffsetMm: [-45, -40, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'skid_rail_right',
    name: 'Right 80/20 T-Slot Base Rail (40×40)',
    group: '80/20 Structural Skid',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [130, 20, 0],
    rotationDeg: [0, 0, 0],
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'structuralBeam',
        profileType: 'tSlot8020',
        width: 40,
        height: 40,
        beamLengthMm: 340,
      },
    },
    material: MAT_8020_ALUM,
    explodeOffsetMm: [45, -40, 0],
    toleranceMm: 0.15,
  },
  {
    id: 'skid_cross_front',
    name: 'Front 80/20 Cross Tie Rail',
    group: '80/20 Structural Skid',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [0, 20, 145],
    rotationDeg: [0, 90, 0],
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'structuralBeam',
        profileType: 'tSlot8020',
        width: 40,
        height: 40,
        beamLengthMm: 220,
      },
    },
    material: MAT_8020_ALUM,
    explodeOffsetMm: [0, -40, 55],
    toleranceMm: 0.15,
  },
  {
    id: 'skid_cross_rear',
    name: 'Rear 80/20 Cross Tie Rail',
    group: '80/20 Structural Skid',
    role: 'primary',
    anchorKind: 'floor',
    positionMm: [0, 20, -145],
    rotationDeg: [0, 90, 0],
    constraint: { kind: 'sitOnGround', groundYMm: 0 },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'structuralBeam',
        profileType: 'tSlot8020',
        width: 40,
        height: 40,
        beamLengthMm: 220,
      },
    },
    material: MAT_8020_ALUM,
    explodeOffsetMm: [0, -40, -55],
    toleranceMm: 0.15,
  },

  // =========================================================================
  // 2. CNC MACHINED GEARBOX HOUSING & INSPECTION LID
  //    Bearing bores & 12 bolt holes are cut automatically by the Interface Compiler!
  // =========================================================================
  {
    id: 'gearbox_housing',
    name: 'CNC Machined Gear Housing (Chamfered & Pocketed)',
    group: 'CNC Gearbox Housing',
    role: 'primary',
    positionMm: [0, 136, 0],
    rotationDeg: [0, 0, 0],
    ports: {
      inputAxis: { localOffsetMm: [INPUT_X, SHAFT_Y - 136, 0], normal: [0, 0, 1] },
      outputAxis: { localOffsetMm: [OUTPUT_X, SHAFT_Y - 136, 0], normal: [0, 0, 1] },
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'machinedBlock',
        width: 360,
        height: 192,
        depth: 160,
        chamferMm: 4.5,
        pockets: [
          {
            // Deep open-top internal gear sump pocket (Y = 60..236 world, X = -143..+143, Z = -52..+52)
            x: 0,
            y: 12,
            z: 0,
            width: 286,
            height: 176,
            depth: 104,
            cornerRadius: 14,
          },
        ],
      },
    },
    material: MAT_CNC_HOUSING,
    explodeOffsetMm: [0, 0, 0],
    toleranceMm: 0.05,
  },
  {
    id: 'gearbox_top_cover',
    name: 'Polycarbonate Inspection Top Lid',
    group: 'CNC Gearbox Housing',
    role: 'secondary',
    positionMm: [0, 240, 0],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'machinedBlock',
        width: 360,
        height: 16,
        depth: 160,
        chamferMm: 2.5,
      },
    },
    material: MAT_COVER_GLASS,
    explodeOffsetMm: [0, 95, 0],
    toleranceMm: 0.1,
  },

  // =========================================================================
  // 3. INPUT DRIVE TRAIN (Turned Stepped Shaft + 18T Involute Pinion + Drive Coupling)
  //    Wired as a live Revolute Kinematic Chain coupled -0.50x to the Output Train!
  // =========================================================================
  {
    id: 'input_shaft',
    name: 'Input Stepped Drive Shaft (Turned + Keyway)',
    group: 'Input Drive Train (18T)',
    role: 'primary',
    positionMm: [INPUT_X, SHAFT_Y, 30],
    rotationDeg: [0, 0, 0],
    motionLimits: { minAngleDeg: -180, maxAngleDeg: 180 },
    ports: {
      housingDatum: { localOffsetMm: [0, 0, -30], normal: [0, 0, 1] },
      gearSeat: { localOffsetMm: [0, 0, -30], normal: [0, 0, 1] },
      couplingSeat: { localOffsetMm: [0, 0, 96], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'concentric',
      selfPort: 'housingDatum',
      targetPartId: 'gearbox_housing',
      targetPort: 'inputAxis',
      axialOffsetMm: 0,
      lockAxial: true,
      lockSpin: false,
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'turnedShaft',
        shaftAxis: 'z',
        radialSegments: 32,
        shaftSections: [
          { lengthMm: 26, diameterMm: 22, chamferStartMm: 2 },
          { lengthMm: 36, diameterMm: 26 },
          { lengthMm: 100, diameterMm: 32, chamferStartMm: 1.5, chamferEndMm: 1.5 },
          { lengthMm: 36, diameterMm: 26 },
          { lengthMm: 62, diameterMm: 24, chamferEndMm: 2.5 },
        ],
        keyway: { startMm: 78, lengthMm: 64, widthMm: 8, depthMm: 4 },
        grooves: [
          { posMm: 60, widthMm: 2.2, depthMm: 1.6 },
          { posMm: 164, widthMm: 2.2, depthMm: 1.6 },
        ],
      },
    },
    material: MAT_TURNED_SHAFT,
    explodeOffsetMm: [-40, 20, 75],
    toleranceMm: 0.02,
  },
  {
    id: 'pinion_gear_18t',
    name: '18-Tooth Involute Pinion Gear (m=4)',
    group: 'Input Drive Train (18T)',
    role: 'primary',
    fitClass: 'gearMesh',
    positionMm: [INPUT_X, SHAFT_Y, 0],
    rotationDeg: [0, 0, 0],
    ports: {
      boreCenter: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'coincident',
      selfPort: 'boreCenter',
      targetPartId: 'input_shaft',
      targetPort: 'gearSeat',
      flipNormal: false,
      jointKind: 'fixed',
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'involuteGear',
        moduleMm: MODULE,
        teeth: TEETH_A,
        faceWidthMm: 36,
        pressureAngleDeg: 20,
        boreDiameterMm: 32.1,
        hubDiameterMm: 50,
        hubLengthMm: 48,
        keywayWidthMm: 8,
        keywayDepthMm: 3.5,
        gearAxis: 'z',
      },
    },
    material: MAT_PINION_BRONZE,
    explodeOffsetMm: [-40, 45, 25],
    toleranceMm: 0.03,
  },
  {
    id: 'input_coupling_hub',
    name: 'Input Drive Coupling Hub',
    group: 'Input Drive Train (18T)',
    role: 'secondary',
    positionMm: [INPUT_X, SHAFT_Y, 126],
    rotationDeg: [0, 0, 0],
    ports: {
      shaftBore: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'coincident',
      selfPort: 'shaftBore',
      targetPartId: 'input_shaft',
      targetPort: 'couplingSeat',
      flipNormal: false,
      jointKind: 'fixed',
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'boltedFlange',
        radius: 30,
        height: 40,
        boreRadiusMm: 12.05,
        boltCircleRadiusMm: 22,
        boltHoleRadiusMm: 3.2,
        boltCount: 6,
        radialSegments: 28,
        rotateDeg: [90, 0, 0],
      },
    },
    material: MAT_COUPLING_HUB,
    explodeOffsetMm: [-40, 20, 120],
    toleranceMm: 0.05,
  },

  // =========================================================================
  // 4. OUTPUT DRIVE TRAIN (Turned Stepped Shaft + 36T Involute Bull Gear)
  //    Auto-phased & mechanically coupled at -0.50x to the Input Shaft!
  // =========================================================================
  {
    id: 'output_shaft',
    name: 'Output Stepped Torque Shaft (Turned + Keyway)',
    group: 'Output Drive Train (36T)',
    role: 'primary',
    positionMm: [OUTPUT_X, SHAFT_Y, -30],
    rotationDeg: [0, 0, 0],
    motionLimits: { minAngleDeg: -180, maxAngleDeg: 180 },
    ports: {
      housingDatum: { localOffsetMm: [0, 0, 30], normal: [0, 0, 1] },
      gearSeat: { localOffsetMm: [0, 0, 30], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'concentric',
      selfPort: 'housingDatum',
      targetPartId: 'gearbox_housing',
      targetPort: 'outputAxis',
      axialOffsetMm: 0,
      lockAxial: true,
      lockSpin: false,
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'turnedShaft',
        shaftAxis: 'z',
        radialSegments: 32,
        shaftSections: [
          { lengthMm: 62, diameterMm: 28, chamferStartMm: 2.5 },
          { lengthMm: 36, diameterMm: 30 },
          { lengthMm: 100, diameterMm: 36, chamferStartMm: 1.5, chamferEndMm: 1.5 },
          { lengthMm: 36, diameterMm: 30 },
          { lengthMm: 26, diameterMm: 24, chamferEndMm: 2 },
        ],
        keyway: { startMm: 108, lengthMm: 64, widthMm: 10, depthMm: 4.5 },
        grooves: [
          { posMm: 96, widthMm: 2.4, depthMm: 1.8 },
          { posMm: 200, widthMm: 2.4, depthMm: 1.8 },
        ],
      },
    },
    material: MAT_TURNED_SHAFT,
    explodeOffsetMm: [40, 20, -75],
    toleranceMm: 0.02,
  },
  {
    id: 'bull_gear_36t',
    name: '36-Tooth Involute Bull Gear (m=4, Lightened)',
    group: 'Output Drive Train (36T)',
    role: 'primary',
    fitClass: 'gearMesh',
    positionMm: [OUTPUT_X, SHAFT_Y, 0],
    rotationDeg: [0, 0, 0],
    ports: {
      boreCenter: { localOffsetMm: [0, 0, 0], normal: [0, 0, 1] },
    },
    constraint: {
      kind: 'coincident',
      selfPort: 'boreCenter',
      targetPartId: 'output_shaft',
      targetPort: 'gearSeat',
      flipNormal: false,
      jointKind: 'fixed',
    },
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'involuteGear',
        moduleMm: MODULE,
        teeth: TEETH_B,
        faceWidthMm: 36,
        pressureAngleDeg: 20,
        boreDiameterMm: 36.1,
        hubDiameterMm: 62,
        hubLengthMm: 50,
        keywayWidthMm: 10,
        keywayDepthMm: 4,
        lighteningHoleCount: 6,
        gearAxis: 'z',
      },
    },
    material: MAT_HARDENED_GEAR,
    explodeOffsetMm: [40, 45, -25],
    toleranceMm: 0.03,
  },

  // =========================================================================
  // 5. BENT SHEET-METAL DRIVE COUPLING GUARD (Folded Flanges + Vent Louvers)
  // =========================================================================
  {
    id: 'sheet_metal_guard',
    name: 'Folded Sheet-Metal Coupling Safety Shroud',
    group: 'Sheet-Metal Guarding',
    role: 'primary',
    positionMm: [INPUT_X, 41.5, 138],
    rotationDeg: [0, 0, 0],
    geometry: {
      kind: 'csgSolid',
      csgRoot: {
        op: 'sheetMetal',
        width: 112,
        depth: 68,
        thicknessMm: 3.0,
        bendRadiusMm: 5.0,
        flanges: [
          { edge: '+x', heightMm: 146, reliefWidthMm: 5 },
          { edge: '-x', heightMm: 146, reliefWidthMm: 5 },
          { edge: '+z', heightMm: 146, reliefWidthMm: 5 },
        ],
        louverSlots: {
          count: 5,
          widthMm: 10,
          heightMm: 42,
          pitchMm: 18,
          face: '+z',
        },
      },
    },
    material: MAT_SHEET_SAFETY,
    explodeOffsetMm: [-40, 35, 110],
    toleranceMm: 0.25,
  },
];

export const PRECISION_GEARBOX_BLUEPRINT: MeshBlueprint = {
  id: 'precision-spur-gearbox-20x-v1',
  name: '2:1 CNC Spur Gearbox & Sheet-Metal Drive Skid',
  category: 'General Mechanical · Power Transmission & Sheet Metal',
  summary:
    'Multi-domain mechanical assembly compiled through 18D’s Top-Down Master Skeleton, Bidirectional Interface Contracts, and all 5 fabrication engines: 80/20 T-slot structural skid, chamfered & pocketed CNC gearbox housing, bolted polycarbonate inspection lid, 4 auto-bored COTS ball bearings, stepped turned shafts with keyways, 18T:36T involute spur gear mesh with auto-phased teeth and live -0.50× coupled rotation, and a folded sheet-metal coupling guard with ventilation louvers.',
  sourceImageUrl: '',
  isReferencePreset: true,
  reconstructedAt: '2026-11-21T17:20:00.000Z',
  envelopeMm: {
    width: 360,
    height: 256,
    depth: 340,
  },
  toleranceSpecMm: 0.05,
  symmetryPlane: 'none',
  photoMatchCamera: {
    positionMm: [-420, 340, 520],
    targetMm: [0, 128, 12],
    fov: 32,
  },
  skeleton: {
    params: {
      gearModuleMm: MODULE,
      teethPinion: TEETH_A,
      teethBull: TEETH_B,
      pitchCenterDistanceMm: CENTER_DIST,
      shaftElevationMm: SHAFT_Y,
    },
    axes: [
      { id: 'inputShaftAxis', label: 'Input Pinion Axis (18T)', originMm: [INPUT_X, SHAFT_Y, 0], direction: [0, 0, 1] },
      { id: 'outputShaftAxis', label: 'Output Bull Axis (36T)', originMm: [OUTPUT_X, SHAFT_Y, 0], direction: [0, 0, 1] },
    ],
    planes: [
      { id: 'skidMountPlane', label: '80/20 Skid Top Datum', originMm: [0, 40, 0], normal: [0, 1, 0] },
      { id: 'lidSplitPlane', label: 'Inspection Cover Gasket Plane', originMm: [0, 232, 0], normal: [0, 1, 0] },
    ],
  },
  interfaces: [
    // Bidirectional Bolted Joint: Inspection Lid <-> CNC Gearbox Housing (8 M8 bolts + aligned holes)
    {
      id: 'iface_lid_bolts',
      kind: 'boltedJoint',
      label: 'Inspection Lid Perimeter',
      partAId: 'gearbox_top_cover',
      partBId: 'gearbox_housing',
      axis: 'y',
      boltDiameterMm: 8,
      boltLengthMm: 34,
      headPlaneMm: 248,
      positionsMm: [
        [-162, 248, -66],
        [-54, 248, -66],
        [54, 248, -66],
        [162, 248, -66],
        [-162, 248, 66],
        [-54, 248, 66],
        [54, 248, 66],
        [162, 248, 66],
      ],
      group: 'Interface Hardware & Bearings',
      includeWasher: true,
      cutHoles: true,
    },
    // Bidirectional Bolted Joints: CNC Housing Sump Floor <-> Left & Right 80/20 Skid Rails
    {
      id: 'iface_housing_skid_left',
      kind: 'boltedJoint',
      label: 'Housing Left Skid Mount',
      partAId: 'gearbox_housing',
      partBId: 'skid_rail_left',
      axis: 'y',
      boltDiameterMm: 10,
      boltLengthMm: 44,
      headPlaneMm: 60,
      positionsMm: [
        [-126, 60, -38],
        [-126, 60, 38],
      ],
      group: 'Interface Hardware & Bearings',
      includeWasher: true,
      cutHoles: true,
    },
    {
      id: 'iface_housing_skid_right',
      kind: 'boltedJoint',
      label: 'Housing Right Skid Mount',
      partAId: 'gearbox_housing',
      partBId: 'skid_rail_right',
      axis: 'y',
      boltDiameterMm: 10,
      boltLengthMm: 44,
      headPlaneMm: 60,
      positionsMm: [
        [126, 60, -38],
        [126, 60, 38],
      ],
      group: 'Interface Hardware & Bearings',
      includeWasher: true,
      cutHoles: true,
    },
    // Bidirectional Bolted Joint: Sheet-Metal Guard <-> Front 80/20 Cross Rail
    {
      id: 'iface_guard_skid_bolts',
      kind: 'boltedJoint',
      label: 'Safety Shroud Rail Mount',
      partAId: 'sheet_metal_guard',
      partBId: 'skid_cross_front',
      axis: 'y',
      boltDiameterMm: 6,
      boltLengthMm: 24,
      headPlaneMm: 43,
      positionsMm: [
        [INPUT_X - 32, 43, 145],
        [INPUT_X + 32, 43, 145],
      ],
      group: 'Interface Hardware & Bearings',
      includeWasher: true,
      cutHoles: true,
    },
    // 4 Bidirectional Bearing Seats: Auto-bores CNC housing walls & seats COTS ball bearings
    {
      id: 'iface_brg_in_front',
      kind: 'bearingSeat',
      label: 'Input Front Bearing',
      housingPartId: 'gearbox_housing',
      shaftPartId: 'input_shaft',
      centerMm: [INPUT_X, SHAFT_Y, 66],
      axis: 'z',
      innerDiaMm: 26,
      outerDiaMm: 52,
      widthMm: 18,
      ballCount: 9,
      group: 'Interface Hardware & Bearings',
      cutHousingBore: true,
    },
    {
      id: 'iface_brg_in_rear',
      kind: 'bearingSeat',
      label: 'Input Rear Bearing',
      housingPartId: 'gearbox_housing',
      shaftPartId: 'input_shaft',
      centerMm: [INPUT_X, SHAFT_Y, -66],
      axis: 'z',
      innerDiaMm: 26,
      outerDiaMm: 52,
      widthMm: 18,
      ballCount: 9,
      group: 'Interface Hardware & Bearings',
      cutHousingBore: true,
    },
    {
      id: 'iface_brg_out_front',
      kind: 'bearingSeat',
      label: 'Output Front Bearing',
      housingPartId: 'gearbox_housing',
      shaftPartId: 'output_shaft',
      centerMm: [OUTPUT_X, SHAFT_Y, 66],
      axis: 'z',
      innerDiaMm: 30,
      outerDiaMm: 62,
      widthMm: 18,
      ballCount: 10,
      group: 'Interface Hardware & Bearings',
      cutHousingBore: true,
    },
    {
      id: 'iface_brg_out_rear',
      kind: 'bearingSeat',
      label: 'Output Rear Bearing',
      housingPartId: 'gearbox_housing',
      shaftPartId: 'output_shaft',
      centerMm: [OUTPUT_X, SHAFT_Y, -66],
      axis: 'z',
      innerDiaMm: 30,
      outerDiaMm: 62,
      widthMm: 18,
      ballCount: 10,
      group: 'Interface Hardware & Bearings',
      cutHousingBore: true,
    },
    // Bidirectional Gear Mesh Contract: Validates 108.0 mm CD, auto-phases teeth, couples -0.50x rotation!
    {
      id: 'iface_primary_gear_mesh',
      kind: 'gearMesh',
      label: 'Primary 2:1 Spur Gear Mesh',
      gearAPartId: 'pinion_gear_18t',
      gearBPartId: 'bull_gear_36t',
      driverJointPartId: 'input_shaft',
      drivenJointPartId: 'output_shaft',
      moduleMm: MODULE,
      teethA: TEETH_A,
      teethB: TEETH_B,
      axis: 'z',
      autoPhaseB: true,
    },
  ],
  parts,
};
