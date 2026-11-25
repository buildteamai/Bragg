export type PartGeometryKind =
  | 'roundedBox'
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'capsule'
  | 'torus'
  | 'extrudePolygon'
  | 'latheProfile'
  | 'tubePath'
  | 'taperedTube'
  | 'organicLoft'
  | 'moldedProfile'
  | 'flutedPanel'
  | 'hollowBox'
  | 'taperedBox'
  | 'curvedPanel'
  | 'staircase'
  | 'rollerBed'
  | 'dragChain'
  | 'impellerWorkpiece'
  | 'wayCoverSlats'
  | 'csgSolid'
  | 'importedAsset';

export type CsgOpKind =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'polygonExtrude'
  | 'sculptedProfile'
  | 'superellipseLoft'
  | 'curvedLoft'
  | 'blendedBoss'
  | 'blendedCowl'
  | 'conformalPatch'
  | 'revolve'
  | 'sweep'
  | 'slottedChannel'
  | 'boltedFlange'
  | 'machinedBlock'
  | 'sheetMetal'
  | 'sheetMetalFold'
  | 'turnedShaft'
  | 'involuteGear'
  | 'structuralBeam'
  | 'ballBearing'
  | 'union'
  | 'subtract'
  | 'intersect'
  | 'smoothUnion'
  | 'smoothSubtract'
  | 'smoothIntersect'
  | 'hull'
  | 'shellWall'
  | 'panelSeam'
  | 'filletedJunction'
  | 'taperedSlotCutter';

export interface SuperellipseLoftStationSpec {
  /** Coordinate along loftAxis (mm) */
  posMm: number;
  /** Center offset along secondary axis U (Y for X-loft, X for Y/Z-loft) */
  offsetU?: number;
  /** Center offset along tertiary axis V (Z for X/Y-loft, Y for Z-loft) */
  offsetV?: number;
  /** Half-width along first cross-section axis (mm) */
  halfA: number;
  /** Half-height along second cross-section axis (mm) */
  halfB: number;
  /** Superellipse exponent (2.0 = ellipse, 2.6..3.2 = squircle/aerodynamic body) */
  exponent?: number;
}

export interface CurvedLoftStationSpec {
  /** 3D spine control point [x, y, z] in mm */
  posMm: [number, number, number];
  /** Half-width along in-plane normal N (orthogonal to spine tangent & upHint) in mm */
  halfA: number;
  /** Half-thickness along binormal B (aligned with upHint, default +Z) in mm */
  halfB: number;
  /** Optional asymmetric +N / -N half-widths (override halfA on +N / -N sides) */
  halfAPos?: number;
  halfANeg?: number;
  /** Optional asymmetric +B / -B half-thicknesses (override halfB on +B / -B sides) */
  halfBPos?: number;
  halfBNeg?: number;
  /** Optional local cross-section offset along N and B (mm) */
  offsetN?: number;
  offsetB?: number;
  /** Superellipse exponent (2.0 = ellipse, 3.0..6.0 = flat-sided forged/chamfered squircle) */
  exponent?: number;
  /** Optional local twist around spine tangent (degrees) */
  twistDeg?: number;
}

export interface SculptedZStationSpec {
  yMm: number;
  depthMm: number;
  heightMm?: number;
  xCenterMm?: number;
  widthMm?: number;
  rounded?: boolean;
}

export interface MachinedPocketSpec {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  cornerRadius?: number;
}

export interface MachinedHoleSpec {
  x: number;
  y: number;
  z: number;
  axis: 'x' | 'y' | 'z';
  diameterMm: number;
  depthMm: number;
  counterboreDiaMm?: number;
  counterboreDepthMm?: number;
}

export interface SheetMetalFlangeSpec {
  edge: '+x' | '-x' | '+z' | '-z';
  heightMm: number;
  angleDeg?: number;
  reliefWidthMm?: number;
}

export interface SheetMetalBaseHoleSpec {
  x: number;
  z: number;
  diameterMm: number;
}

export interface SheetMetalFlangeHoleSpec {
  /** Offset along the flange edge centerline (mm) */
  uMm: number;
  /** Offset along the straight flange leg from the outer mold line (mm) */
  vMm: number;
  diameterMm: number;
}

export interface SheetMetalReturnFlangeSpec {
  flangeLengthMm: number;
  /** Relative bend angle in degrees (+90 = inward lip/hem, -90 = outward Z-flange) */
  angleDeg: number;
  bendRadiusMm?: number;
}

export interface SheetMetalFoldFlangeSpec {
  edge: '+x' | '-x' | '+z' | '-z';
  /** Outer-mold-line flange length (mm) */
  flangeLengthMm: number;
  /** Bend angle in degrees (-165..+165; +90 = fold up +Y, -90 = fold down -Y) */
  angleDeg: number;
  bendRadiusMm?: number;
  /** Optional partial-edge flange width (defaults to full edge minus corner reliefs) */
  widthMm?: number;
  /** Optional offset along edge centerline (mm) */
  offsetMm?: number;
  reliefWidthMm?: number;
  holes?: SheetMetalFlangeHoleSpec[];
  returnFlange?: SheetMetalReturnFlangeSpec;
}

export interface SheetMetalBendLine {
  id: string;
  edge: '+x' | '-x' | '+z' | '-z';
  stage: 1 | 2;
  startMm: [number, number];
  endMm: [number, number];
  angleDeg: number;
  bendRadiusMm: number;
  bendAllowanceMm: number;
  direction: 'UP' | 'DOWN';
}

export interface SheetMetalFlatPatternResult {
  thicknessMm: number;
  kFactor: number;
  flatWidthMm: number;
  flatDepthMm: number;
  baseWidthMm: number;
  baseDepthMm: number;
  bendCount: number;
  totalBendAllowanceMm: number;
  bendLines: SheetMetalBendLine[];
  flangeRects: {
    id: string;
    xMin: number;
    zMin: number;
    xMax: number;
    zMax: number;
    stage: 0 | 1 | 2;
  }[];
  holes2D: { x: number; z: number; diameterMm: number }[];
}

export interface TurnedShaftSectionSpec {
  lengthMm: number;
  diameterMm: number;
  chamferStartMm?: number;
  chamferEndMm?: number;
}

export interface ShaftKeywaySpec {
  startMm: number;
  lengthMm: number;
  widthMm: number;
  depthMm: number;
}

export interface ShaftGrooveSpec {
  posMm: number;
  widthMm: number;
  depthMm: number;
}

export interface CsgNodeSpec {
  op: CsgOpKind;
  // Dimensions in mm
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  radialSegments?: number;
  wallThickness?: number;
  // For sculptedProfile (exact side-elevation polygon intersected with ergonomic 3D Z-thickness stations)
  zStations?: SculptedZStationSpec[];
  // For general 3D profile sweep (tubing, wiring harnesses, hoses, cable carriers, handrails)
  profilePoints?: [number, number][];
  profileHoles?: [number, number][][];
  pathPoints?: [number, number, number][];
  pathMode?: 'polyline' | 'spline';
  cornerMode?: 'miter' | 'bend';
  bendRadiusMm?: number;
  bendSegments?: number;
  splineSamples?: number;
  splineTension?: number;
  profileTwistDeg?: number;
  closedLoop?: boolean;
  // For slottedChannel (Unistrut P1000T true hollow slotted C-channel)
  slotPitchMm?: number;
  slotWidthMm?: number;
  slotLengthMm?: number;
  lipWidthMm?: number;
  // For boltedFlange (ANSI/ASME bored flange with real subtracted bolt holes)
  boreRadiusMm?: number;
  boltCircleRadiusMm?: number;
  boltHoleRadiusMm?: number;
  boltCount?: number;
  // For machinedBlock (CNC prismatic block with edge chamfers, pockets & counterbored holes)
  chamferMm?: number;
  pockets?: MachinedPocketSpec[];
  holes?: MachinedHoleSpec[];
  // For SDF smooth booleans (smoothUnion / smoothSubtract / smoothIntersect — SOT rule GB-04)
  /** Smooth fillet/blend radius in mm for SDF smoothUnion / smoothSubtract / smoothIntersect */
  filletRadiusMm?: number;
  /** Optional Marching Tetrahedra voxel edge length in mm (auto-sized from bounds & filletRadiusMm if omitted) */
  voxelSizeMm?: number;
  /** Optional levelSet surface tolerance in mm (-1 = fast linear interpolation) */
  levelSetToleranceMm?: number;
  /** Mark true when a raw C0 union seam between dissimilar primitives is an intentional sharp shoulder/parting line */
  intentionalSharpSeam?: boolean;
  // For sheetMetal / sheetMetalFold (planar blank + K-factor bent flanges, return hems & cutouts)
  thicknessMm?: number;
  kFactor?: number;
  flanges?: SheetMetalFlangeSpec[];
  foldFlanges?: SheetMetalFoldFlangeSpec[];
  baseHoles?: SheetMetalBaseHoleSpec[];
  louverSlots?: { count: number; widthMm: number; heightMm: number; pitchMm: number; face: 'top' | '+z' | '-z' };
  // For turnedShaft (stepped revolved shaft with chamfers, keyway & snap-ring grooves)
  shaftSections?: TurnedShaftSectionSpec[];
  shaftAxis?: 'x' | 'y' | 'z';
  keyway?: ShaftKeywaySpec;
  grooves?: ShaftGrooveSpec[];
  // For involuteGear (true involute spur gear with hub, bore, keyway & lightening holes)
  moduleMm?: number;
  teeth?: number;
  faceWidthMm?: number;
  pressureAngleDeg?: number;
  boreDiameterMm?: number;
  hubDiameterMm?: number;
  hubLengthMm?: number;
  keywayWidthMm?: number;
  keywayDepthMm?: number;
  lighteningHoleCount?: number;
  gearAxis?: 'x' | 'y' | 'z';
  // For structuralBeam (standard steel/aluminum cross-sections: I-beam, C-channel, 80/20 T-slot, angle, tube)
  profileType?: 'iBeam' | 'cChannel' | 'tSlot8020' | 'angleIron' | 'squareTube' | 'roundTube';
  flangeThicknessMm?: number;
  webThicknessMm?: number;
  beamLengthMm?: number;
  // For ballBearing (COTS rolling-element bearing)
  innerDiaMm?: number;
  outerDiaMm?: number;
  ballCount?: number;
  bearingAxis?: 'x' | 'y' | 'z';
  // For polygonExtrude / revolve
  polygonPoints?: [number, number][];
  polygonHoles?: [number, number][][];
  /** Optional front/back 3D edge bevel/chamfer radius on polygonExtrude (mm) */
  bevelMm?: number;
  /** Number of bevel segments (1 = crisp 45° chamfer, 2..6 = smooth rounded fillet) */
  bevelSegments?: number;
  /** Optional Catmull-Rom subdivisions per polygon edge for smooth curved silhouettes (e.g. 3..6) */
  splineSubdivisions?: number;
  /** Corner turn angle (deg) above which spline resampling preserves a sharp vertex (default 68) */
  sharpCornerAngleDeg?: number;
  lathePoints?: [number, number][];
  arcDeg?: number;
  // For superellipseLoft (multi-station smooth aerodynamic bodies, housings & limbs)
  loftAxis?: 'x' | 'y' | 'z';
  superellipseStations?: SuperellipseLoftStationSpec[];
  // For curvedLoft (3D curved-spine tapered superellipse loft with parallel-transport frames)
  curvedLoftStations?: CurvedLoftStationSpec[];
  /** Reference up/binormal hint [x, y, z] for curvedLoft halfB alignment (default [0, 0, 1]) */
  upHint?: [number, number, number];
  /** End-cap style for curvedLoft ('flat' | 'domed' | 'beveled', default 'flat') */
  startCapStyle?: 'flat' | 'domed' | 'beveled';
  endCapStyle?: 'flat' | 'domed' | 'beveled';
  /** Optional cap protrusion/bevel depth in mm (defaults to 0.35 * min(halfA, halfB)) */
  capDepthMm?: number;
  // For blendedBoss / blendedCowl (flared filleted host landing boss or vertical sensor cowl)
  sinkDepthMm?: number;
  baseFlareMm?: number;
  rimMarginMm?: number;
  cowlDirection?: 'up' | 'down';
  throatOffsetMm?: [number, number, number];
  throatHalfWidthMm?: number;
  throatHalfHeightMm?: number;
  // For conformalPatch (bi-curved badge, decal, vent plate, or bezel hugging convex hosts)
  curveRadiusUMm?: number;
  curveRadiusVMm?: number;
  // For shellWall (hollow uniform-thickness watertight enclosure)
  shellOpenFace?: 'none' | '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
  // For panelSeam (watertight curved clamshell parting-line groove cutter)
  seamAxis?: 'x' | 'y' | 'z';
  seamOffsetMm?: number;
  seamWidthMm?: number;
  seamDepthMm?: number;
  // For filletedJunction (C1 tangent-continuous flared transition between two superellipse sections)
  baseHalfA?: number;
  baseHalfB?: number;
  baseExponent?: number;
  topHalfA?: number;
  topHalfB?: number;
  topExponent?: number;
  filletFlareMm?: number;
  junctionAxis?: 'x' | 'y' | 'z';
  // For taperedSlotCutter (parametric V-slot / keyway / chamfered groove Boolean cutter; uses slotLengthMm)
  slotWidthStartMm?: number;
  slotWidthEndMm?: number;
  slotBottomWidthMm?: number;
  slotTopChamferMm?: number;
  // Native watertight Manifold-3D reflection across local X, Y, or Z plane
  mirrorAxis?: 'x' | 'y' | 'z';
  // Local transform inside CSG tree (mm and degrees)
  translateMm?: [number, number, number];
  rotateDeg?: [number, number, number];
  scale?: [number, number, number];
  // Boolean children (for union, subtract, intersect, hull, shellWall, panelSeam)
  children?: CsgNodeSpec[];
}

export type MechanicalFitClass =
  | 'standard'
  | 'fastener'
  | 'bearing'
  | 'gearMesh'
  | 'weld'
  | 'sliding'
  | 'keepOut';

export interface AssemblySkeletonSpec {
  params?: Record<string, number>;
  axes?: {
    id: string;
    label: string;
    originMm: [number, number, number];
    direction: [number, number, number];
  }[];
  planes?: {
    id: string;
    label: string;
    originMm: [number, number, number];
    normal: [number, number, number];
  }[];
}

export type AssemblyInterfaceSpec =
  | {
      id: string;
      kind: 'boltedJoint';
      label: string;
      partAId: string;
      partBId: string;
      axis: 'x' | 'y' | 'z';
      boltDiameterMm: number;
      boltLengthMm: number;
      /** Bolt head seats on the +axis side of this coordinate along axis */
      headPlaneMm: number;
      /** World positions [x, y, z] of each fastener center along the joint */
      positionsMm?: [number, number, number][];
      /** Or polar bolt-circle generator */
      boltCircle?: {
        centerMm: [number, number, number];
        radiusMm: number;
        count: number;
        startAngleDeg?: number;
      };
      group: string;
      includeWasher?: boolean;
      includeNut?: boolean;
      cutHoles?: boolean;
    }
  | {
      id: string;
      kind: 'bearingSeat';
      label: string;
      housingPartId: string;
      shaftPartId: string;
      centerMm: [number, number, number];
      axis: 'x' | 'y' | 'z';
      innerDiaMm: number;
      outerDiaMm: number;
      widthMm: number;
      ballCount?: number;
      group: string;
      cutHousingBore?: boolean;
    }
  | {
      id: string;
      kind: 'gearMesh';
      label: string;
      gearAPartId: string;
      gearBPartId: string;
      driverJointPartId?: string;
      drivenJointPartId?: string;
      moduleMm: number;
      teethA: number;
      teethB: number;
      axis: 'x' | 'y' | 'z';
      autoPhaseB?: boolean;
    }
  | {
      id: string;
      kind: 'copeJoint';
      label: string;
      branchPartId: string;
      parentPartId: string;
      weldBiteMm?: number;
    }
  | {
      id: string;
      kind: 'portRoute';
      label: string;
      group: string;
      radiusMm: number;
      bendRadiusMm?: number;
      waypointsMm: [number, number, number][];
      inlineComponents?: {
        partId: string;
        centerMm: [number, number, number];
        halfLengthMm: number;
        axis: 'x' | 'y' | 'z';
      }[];
      material: PartMaterialSpec;
    }
  | {
      id: string;
      kind: 'blendedMount';
      label: string;
      hostPartId: string;
      childPartId: string;
      style?: 'boss' | 'cowl';
      centerMm: [number, number, number];
      rotationDeg: [number, number, number];
      radiusMm: number;
      bossHeightMm?: number;
      sinkDepthMm?: number;
      baseFlareMm?: number;
      rimMarginMm?: number;
      seamGapMm?: number;
      autoAlignChild?: boolean;
    };

export interface CompiledInterfaceRecord {
  id: string;
  kind: AssemblyInterfaceSpec['kind'];
  label: string;
  status: 'compiled' | 'warning';
  holesCut: number;
  partsGenerated: number;
  summary: string;
  partIds: string[];
}

export interface DynamicClashIssue {
  id: string;
  jointId: string;
  jointLabel: string;
  poseLabel: string;
  movingPartId: string;
  movingPartName: string;
  obstaclePartId: string;
  obstaclePartName: string;
  overlapVolumeCm3: number;
  penetrationMm: number;
}

export interface PartPortSpec {
  localOffsetMm: [number, number, number];
  normal?: [number, number, number];
}

export type MateJointKind = 'fixed' | 'revolute' | 'cylindrical' | 'prismatic';

export type PartConstraintSpec =
  | {
      kind: 'sitOnGround';
      groundYMm?: number;
    }
  | {
      kind: 'sitOnTopOf';
      targetPartId: string;
      offsetMm?: [number, number, number];
    }
  | {
      kind: 'matePort';
      selfPort: string;
      targetPartId: string;
      targetPort: string;
      offsetMm?: [number, number, number];
    }
  | {
      kind: 'alignCenter';
      targetPartId: string;
      axes: ('x' | 'y' | 'z')[];
      offsetMm?: [number, number, number];
    }
  | {
      kind: 'coincident';
      selfPort: string;
      targetPartId: string;
      targetPort: string;
      flipNormal?: boolean; // true = face-to-face mating (anti-parallel normals), false = parallel
      offsetMm?: [number, number, number];
      jointKind?: MateJointKind;
    }
  | {
      kind: 'concentric';
      selfPort: string;
      targetPartId: string;
      targetPort: string;
      axialOffsetMm?: number;
      lockAxial?: boolean; // if false, leaves axial slide DOF open (cylindrical joint)
      lockSpin?: boolean; // if false, leaves spin DOF open (revolute/cylindrical joint)
    }
  | {
      kind: 'offset';
      selfPort?: string;
      targetPartId: string;
      targetPort?: string;
      axis?: 'x' | 'y' | 'z' | 'portNormal';
      distanceMm: number;
    }
  | {
      kind: 'angle';
      selfPort?: string;
      targetPartId: string;
      targetPort?: string;
      axis: 'x' | 'y' | 'z';
      angleDeg: number;
    };

export type MateConstraintStatus =
  | 'solved'
  | 'underConstrained'
  | 'conflicting'
  | 'unresolved';

export interface ConstraintSolveEntry {
  partId: string;
  partName: string;
  constraintKind: PartConstraintSpec['kind'];
  targetPartId?: string;
  deltaAppliedMm: [number, number, number];
  residualErrorMm: number;
  residualAngleDeg?: number;
  status: MateConstraintStatus;
  freeDofs: string[];
  conflictDetail?: string;
  note: string;
}

export interface SolvedJointRecord {
  id: string;
  label: string;
  parentPartId: string;
  childPartId: string;
  childPartName: string;
  mateKind: PartConstraintSpec['kind'];
  jointKind: MateJointKind;
  anchorWorldMm: [number, number, number];
  axisWorld: [number, number, number];
  freeDofs: string[];
  /** All downstream parts in the kinematic chain driven when this joint moves */
  chainPartIds: string[];
  /** Optional mechanical coupling (e.g. gear mesh ratio) driving another joint */
  coupledTargets?: {
    targetJointId?: string;
    targetChildPartId: string;
    ratio: number;
  }[];
  /** Optional travel limits for kinematic motion-sweep collision checking */
  motionLimits?: {
    minAngleDeg?: number;
    maxAngleDeg?: number;
    minSlideMm?: number;
    maxSlideMm?: number;
  };
}

export interface GeometryClashIssue {
  id: string;
  partAId: string;
  partAName: string;
  partBId: string;
  partBName: string;
  overlapVolumeCm3: number;
  penetrationMm: number;
  severity: 'clash' | 'warning';
  centerMm: [number, number, number];
  verificationMethod?: 'exactBoolean' | 'rayParity' | 'aabb';
}

export interface FloatingPartIssue {
  partId: string;
  partName: string;
  group: string;
  minYMm: number;
  nearestPartName: string | null;
  gapMm: number;
}

export interface OccludedPartIssue {
  partId: string;
  partName: string;
  group: string;
  occluderPartId: string;
  occluderPartName: string;
  buriedRatioPct: number;
}

export interface UnblendedMountIssue {
  partId: string;
  partName: string;
  group: string;
  hostPartId: string;
  hostPartName: string;
  minSurfaceGapMm: number;
  maxRimGapMm: number;
  reason: 'hoveringAirGap' | 'cantileveredRimSkew';
  recommendedShiftMm: [number, number, number];
  hostNormal: [number, number, number];
  /** Outward world normal of the child part's mating face (for zero-token auto-tilt alignment) */
  childMatingNormalWorld?: [number, number, number];
  /** World center of the child part's mating face (mm) */
  matingFaceCenterWorldMm?: [number, number, number];
  /** Nearest host triangle surface point to the child's mating face center (mm) */
  nearestHostAtCenterMm?: [number, number, number];
  hint: string;
}

import type {
  ConstellationCameraJson,
  ConstellationFaceId,
  ConstellationQaGateReport,
  ConstellationSpec,
} from './constellation';

export type {
  ConstellationCameraJson,
  ConstellationFaceId,
  ConstellationQaGateReport,
  ConstellationSpec,
};

export interface UnblendedCsgSeamIssue {
  partId: string;
  partName: string;
  process: string;
  families: string[];
  reason: string;
}

export interface GeometryAuditReport {
  auditedAt: string;
  manifoldWasmActive: boolean;
  exactBooleanAuditActive: boolean;
  watertightCsgCount: number;
  totalPartCount: number;
  groundedCount: number;
  connectedCount: number;
  solvedConstraints: ConstraintSolveEntry[];
  joints: SolvedJointRecord[];
  conflictingMateCount: number;
  underConstrainedMateCount: number;
  floatingParts: FloatingPartIssue[];
  occludedParts: OccludedPartIssue[];
  unblendedMounts?: UnblendedMountIssue[];
  /** SOT Rule GB-04: raw C0 union seams across dissimilar primitive families on forged/cast/molded parts */
  unblendedCsgSeams?: UnblendedCsgSeamIssue[];
  clashes: GeometryClashIssue[];
  dynamicClashes: DynamicClashIssue[];
  motionSweepPosesChecked: number;
  compiledInterfaces: CompiledInterfaceRecord[];
  verifiedFitCount: number;
  seatingContactCount: number;
  healthScore: number; // 0-100
  /** Optional Constellation quantitative photo QA gate (coverage % + check_points RMS px) */
  constellationQa?: ConstellationQaGateReport;
}

export interface EdgeDiffResult {
  overlayDataUrl: string;
  photoEdgesDataUrl: string;
  meshEdgesDataUrl: string;
  precisionPct: number;
  recallPct: number;
  f1ScorePct: number;
  silhouetteIoUPct: number;
  matchedPixels: number;
  photoEdgePixels: number;
  meshEdgePixels: number;
  computedAt: string;
}

export type ProceduralTextureKind =
  | 'none'
  | 'woodGrain'
  | 'stackedStone'
  | 'fireplaceFlames'
  | 'glitterFinish'
  | 'wovenFabric'
  | 'marbleStone'
  | 'diamondPlate'
  | 'brushedMetal'
  | 'celosScreen'
  | 'controlKeypad'
  | 'industrialConsole'
  | 'warningDecal'
  | 'amadaBadge'
  | 'ventedLouvers'
  | 'knurled'
  | 'dmuHeaderSign'
  | 'dmgMoriBadge'
  | 'fiveAxisBadge'
  | 'spindleStripe'
  | 'silkscreenLabel'
  | 'craftsmanLogo'
  | 'craftsmanV20Badge'
  | 'clutchDialRing'
  | 'rubberOvermold'
  | 'ryobiLogo'
  | 'galvanizedSteel'
  | 'galvanizedDiamondPlate'
  | 'paintedIndustrialSteel'
  | 'weldingTableGrid'
  | 'haimerScreen'
  | 'fdmLayerLines';

export interface PartGeometrySpec {
  kind: PartGeometryKind;
  // Dimensions in millimeters (mm)
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  bevelRadius?: number;
  bevelThickness?: number;
  tubeRadius?: number;
  arc?: number;
  radialSegments?: number;
  // For extrudePolygon: closed 2D points [[x, y], ...] in mm
  polygonPoints?: [number, number][];
  // Optional holes for extrudePolygon: array of 2D point loops in mm
  polygonHoles?: [number, number][][];
  // For latheProfile: array of [radiusMm, yMm] pairs
  lathePoints?: [number, number][];
  // For tubePath / dragChain: 3D spline points [[x, y, z], ...] in mm
  pathPoints?: [number, number, number][];
  // For hollowBox: open-cavity enclosure with optional front viewport cutout
  wallThickness?: number;
  openFace?: 'front' | 'back' | 'top' | 'left' | 'right' | 'none';
  windowWidth?: number;
  windowHeight?: number;
  windowOffsetX?: number;
  windowOffsetY?: number;
  // For taperedBox: frustum / sloped prism hull
  topWidth?: number;
  topDepth?: number;
  topOffsetX?: number;
  topOffsetZ?: number;
  // For curvedPanel: thick cylindrical arc shell
  thickness?: number;
  arcDeg?: number;
  // For staircase / rollerBed / dragChain / wayCoverSlats / impellerWorkpiece
  stepCount?: number;
  hasHandrails?: boolean;
  rollerCount?: number;
  chainWidth?: number;
  chainHeight?: number;
  linkCount?: number;
  bladeCount?: number;
  slatCount?: number;
  // For moldedProfile: architectural crown molding, plinth base, or beveled mantel cap
  moldingStyle?: 'crown' | 'plinth' | 'bevelCap';
  // For flutedPanel: carved architectural vertical grooves/flutes
  fluteCount?: number;
  // For taperedTube: smooth tapering spline tube
  radiusStart?: number;
  radiusEnd?: number;
  // For organicLoft: array of [xMm, yMm, zMm, radiusXMm, radiusYMm] smooth cross-section stations
  loftStations?: [number, number, number, number, number][];
  // For csgSolid: recursive manifold-3d Boolean CSG tree
  csgRoot?: CsgNodeSpec;
  smoothSharpAngleDeg?: number;
  // For importedAsset: external .glb / converted .usd asset served from /api/library/assets/*
  assetUrl?: string;
  assetFormat?: 'glb' | 'usd';
  assetScale?: number;
}

export interface PartMaterialSpec {
  colorHex: string;
  metalness: number;
  roughness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  opacity?: number;
  transparent?: boolean;
  transmission?: number;
  ior?: number;
  emissiveHex?: string;
  emissiveIntensity?: number;
  textureKind?: ProceduralTextureKind;
  // Optional normalized [xMin, yMin, xMax, yMax] (0..1 from top-left) crop from the uploaded photo
  photoCrop?: [number, number, number, number];
  /** Optional Constellation glass_box rectified face ('FRONT' | 'TOP' | 'SIDE') to sample photoCrop from */
  photoFace?: ConstellationFaceId;
  labelText?: string;
  labelSubtext?: string;
  finishName: string;
  /** Optional explicit physical material density in g/cm^3 (overrides automatic finish/metalness inference) */
  densityGPerCm3?: number;
}

export interface BlueprintLight {
  id: string;
  name?: string;
  positionMm: [number, number, number];
  colorHex: string;
  intensity: number;
  distanceMm: number;
  decay?: number;
}

export interface PartMirrorSpec {
  axis: 'x' | 'z';
  planeOffsetMm?: number;
  idSuffix?: string;
  swapLeftRightName?: boolean;
  /** When true, also mirrors asymmetric local CSG geometry via watertight Manifold mirror */
  mirrorGeometry?: boolean;
}

export type PartPatternSpec =
  | {
      kind: 'linear';
      count: number;
      stepMm: [number, number, number];
      idPrefix?: string;
    }
  | {
      kind: 'polar';
      count: number;
      axis: 'x' | 'y' | 'z';
      centerMm: [number, number, number];
      totalAngleDeg?: number;
      rotateInstances?: boolean;
    };

export interface BlueprintPart {
  id: string;
  name: string;
  group: string;
  role?: 'primary' | 'secondary' | 'detail';
  /** Manufacturing process family (drives SOT geometry_blending.json linter rules for smooth vs sharp seams) */
  manufacturingProcess?: 'forged' | 'cast' | 'molded' | 'machined' | 'sheetMetal' | 'weldment' | 'assembly';
  /** Semantic mechanical fit class for fit-aware exact Boolean auditing */
  fitClass?: MechanicalFitClass;
  /** Explicit fixed structural anchor (floor, wall mount, or base chassis) for load-path verification */
  anchorKind?: 'floor' | 'wall' | 'chassis';
  /** Optional travel limits for kinematic motion-sweep collision auditing */
  motionLimits?: {
    minAngleDeg?: number;
    maxAngleDeg?: number;
    minSlideMm?: number;
    maxSlideMm?: number;
  };
  // Center position in millimeters (Y=0 is ground plane)
  positionMm: [number, number, number];
  // Euler rotation in degrees [rx, ry, rz]
  rotationDeg: [number, number, number];
  geometry: PartGeometrySpec;
  material: PartMaterialSpec;
  // Direction & distance in mm when exploded view = 100%
  explodeOffsetMm: [number, number, number];
  toleranceMm: number;
  notes?: string;
  /** Compiler-level bilateral symmetry mirroring (expands deterministically in assemblyCompiler) */
  mirrorAcross?: PartMirrorSpec;
  /** Compiler-level linear or polar instancing pattern (expands deterministically in assemblyCompiler) */
  pattern?: PartPatternSpec;
  // Optional parametric datum ports & deterministic mate constraints (single or multi-mate chain)
  ports?: Record<string, PartPortSpec>;
  constraint?: PartConstraintSpec;
  mates?: PartConstraintSpec[];
}

export interface CameraViewConfig {
  positionMm: [number, number, number];
  targetMm: [number, number, number];
  fov?: number;
  /** Optional exact pinhole camera solved by Architekton Constellation (camera.json) */
  constellationCamera?: ConstellationCameraJson;
}

export interface FiveAngleCheckItem {
  angle: 'photoMatch' | 'front' | 'left' | 'right' | 'top';
  label?: string;
  status: 'verified' | 'corrected';
  note: string;
}

export interface FiveAngleAuditReport {
  angles: FiveAngleCheckItem[];
  correctionsApplied: string[];
  auditedAt: string;
}

export interface FiveAngleCapture {
  angle: 'photoMatch' | 'front' | 'left' | 'right' | 'top';
  label: string;
  presetId: CameraPresetId;
  dataUrl: string;
}

export interface MeshBlueprint {
  id: string;
  name: string;
  category: string;
  summary: string;
  sourceImageUrl: string;
  isReferencePreset?: boolean;
  envelopeMm: {
    width: number;
    height: number;
    depth: number;
  };
  toleranceSpecMm: number;
  symmetryPlane: 'none' | 'X' | 'Z' | 'radial';
  photoMatchCamera: CameraViewConfig;
  /** Optional Top-Down Master Skeleton (datum axes, planes & shared design params) */
  skeleton?: AssemblySkeletonSpec;
  /** Optional Bidirectional Interface Contracts compiled before geometry building */
  interfaces?: AssemblyInterfaceSpec[];
  parts: BlueprintPart[];
  lights?: BlueprintLight[];
  /** Optional named kinematic poses for instant articulation & animation playback */
  posePresets?: KinematicPosePreset[];
  /** Optional curved-surface projected decals (DecalGeometry) hugged directly onto target parts */
  decals?: ProjectedDecalSpec[];
  /** Optional machine installation envelope: operator zones, NEC clearances, door swings & utility connections */
  installation?: MachineInstallationSpec;
  /** Optional declarative event-sourced kinematic simulation (runs in 18D & carries over to SOT kit_runtime) */
  simulation?: MachineSimulationSpec;
  reconstructedAt: string;
  fiveAngleAudit?: FiveAngleAuditReport;
  /** Optional Constellation single_view metrology spec (measured mm + 95% CIs + gaps) */
  constellationSpec?: ConstellationSpec;
  /** Optional Constellation ortho.glass_box rectified face PNG data URLs for perspective-free photoCrop */
  rectifiedFaces?: Partial<Record<ConstellationFaceId, string>>;
  /** Optional Constellation quantitative QA gate result (coverage % + check_points RMS px) */
  constellationQa?: ConstellationQaGateReport;
  contextSources?: {
    webUrls: string[];
    pdfNames: string[];
    extractedSpecNote?: string;
  };
}

export interface KinematicPosePreset {
  id: string;
  label: string;
  jointTargets: Record<string, { angleDeg?: number; slideMm?: number }>;
}

export type FloorZoneKind =
  | 'operator'
  | 'electrical_clearance'
  | 'door_swing'
  | 'service_access'
  | 'material_flow';

export interface FloorZoneSpec {
  id: string;
  kind: FloorZoneKind;
  label: string;
  /** Optional standard or OEM citation (e.g. "NEC 110.26(A)(1) · 36 in min") */
  citation?: string;
  /** Rectangular floor zone on Y = 0 in machine mm coordinates */
  rectMm?: {
    centerX: number;
    centerZ: number;
    widthX: number;
    depthZ: number;
    rotationDeg?: number;
  };
  /** Custom 2D polygon on Y = 0 as [xMm, zMm] vertices */
  polygonMm?: [number, number][];
  /** Swept hinged door / panel swing arc on Y = 0 (0 deg = +X, 90 deg = +Z) */
  doorSwingMm?: {
    hingeXZ: [number, number];
    radiusMm: number;
    startAngleDeg: number;
    sweepAngleDeg: number;
  };
}

export type UtilityKind =
  | 'electrical'
  | 'pneumatic'
  | 'gas'
  | 'exhaust'
  | 'water_supply'
  | 'water_return'
  | 'drain'
  | 'network';

export type UtilityRouting =
  | 'floor_stub'
  | 'overhead_drop'
  | 'rear_manifold'
  | 'side_panel';

export interface UtilityConnectionSpec {
  id: string;
  kind: UtilityKind;
  label: string;
  /** Concise engineering spec (e.g. "480V · 3Ph · 60Hz · 35A FLA") */
  spec: string;
  /** Exact 3D connection port on the machine in mm (Y-up, Y=0 floor) */
  positionMm: [number, number, number];
  /** Optional [xMm, zMm] floor stub-up or overhead drop landing point (defaults to port XZ) */
  floorPointMm?: [number, number];
  routing: UtilityRouting;
  pipeOrConduitSize?: string;
  notes?: string;
}

export interface MachineInstallationSpec {
  operatorSide?: '+z' | '-z' | '+x' | '-x';
  /** When true, flags SOT under-crane rule (floor stub-up power, no overhead drops) */
  underCrane?: boolean;
  floorZones: FloorZoneSpec[];
  utilities: UtilityConnectionSpec[];
  notes?: string;
}

export interface SimAxisSpec {
  id: string;
  label: string;
  /** 18D Y-up mm translation axis */
  motionAxis: 'x' | 'y' | 'z';
  /** Exact BlueprintPart IDs translated by this axis (supports mirror suffixes) */
  partIds: string[];
  minMm: number;
  maxMm: number;
  homeMm: number;
  rapidSpeedMmPerSec: number;
}

export interface SimWorkpieceSpec {
  label: string;
  /** [widthX, thicknessY, depthZ] in mm */
  sizeMm: [number, number, number];
  /** Center [x, y, z] in mm (Y-up) */
  positionMm: [number, number, number];
  colorHex: string;
}

export interface SimWaypointSpec {
  /** Target axis offsets [xMm, yMm, zMm] relative to base blueprint pose */
  xMm: number;
  yMm: number;
  zMm: number;
  /** True when waterjet / spindle / laser is actively cutting on this segment */
  cutting: boolean;
  feedMmPerSec?: number;
}

export interface SimFlexibleHoseSpec {
  /** Static BlueprintPart ID to hide and replace with a live flexing spline during simulation */
  partId: string;
  /** Optional fixed lead-in points (mm) before the flexing anchor (e.g. hopper up to whip mast) */
  fixedLeadPointsMm?: [number, number, number][];
  /** Fixed whip-stand anchor [x, y, z] in mm */
  anchorMm: [number, number, number];
  /** Moving carriage/head connection [x, y, z] in mm at zero axis offset */
  endBaseMm: [number, number, number];
  /** Axis IDs whose offsets translate the moving end */
  endAxisIds: string[];
  /** Vertical arch lift (mm) at midpoint between anchor and moving end */
  apexLiftMm: number;
  radiusMm: number;
  colorHex: string;
  metalness?: number;
  roughness?: number;
}

export interface MachineSimulationSpec {
  machineTitle: string;
  axes: SimAxisSpec[];
  flexibleHoses?: SimFlexibleHoseSpec[];
  workpiece?: SimWorkpieceSpec;
  /** Base [x, y, z] mm of the active nozzle/tool tip when all axis offsets are 0 */
  nozzleTipOffsetMm: [number, number, number];
  /** Optional [x, y, z] mm mount position for the 3D status stack light */
  stackLightPosMm?: [number, number, number];
  /** Optional active jet / beam color hex (default cyan-blue '#38bdf8') */
  beamColorHex?: string;
  toolpath: SimWaypointSpec[];
  telemetryDefaults: {
    maxPressurePsi: number;
    cutFeedIpm: number;
    rapidFeedIpm: number;
    abrasiveFlowLbMin?: number;
  };
}

export type SignageTemplateKind =
  | 'ansi_signal'
  | 'iso_pictogram'
  | 'nfpa_704'
  | 'asme_pipe_marker'
  | 'rating_nameplate'
  | 'phenolic_tag'
  | 'crane_capacity'
  | 'asset_qr_tag';

export interface SignageSpec {
  template: SignageTemplateKind;
  signal?: 'DANGER' | 'WARNING' | 'CAUTION' | 'NOTICE' | 'SAFETY';
  isoCategory?: 'WARNING' | 'PROHIBITION' | 'MANDATORY' | 'SAFE_CONDITION' | 'FIRE';
  fluidClass?: 'FIRE_QUENCHING' | 'FLAMMABLE' | 'TOXIC_CORROSIVE' | 'COMBUSTIBLE' | 'POTABLE_WATER' | 'COMPRESSED_AIR' | 'USER_DEFINED';
  flowDir?: 'left' | 'right' | 'both';
  finish?: 'VINYL' | 'PHENOLIC_BLK_WHT' | 'PHENOLIC_RED_WHT' | 'ANODIZED_ALUM' | 'STAINLESS_ETCH';
  pictogram?: string;
  title?: string;
  lines?: string[];
  citation?: string;
  vendor?: string;
  marks?: string;
  rows?: [string, string][];
  health?: number;
  flammability?: number;
  instability?: number;
  special?: string;
  assetId?: string;
  payload?: string;
}

export interface ProjectedDecalSpec {
  id: string;
  targetPartId: string;
  /** World-space or assembly-local anchor point on the target part surface (mm) */
  positionMm: [number, number, number];
  /** Euler orientation [rx, ry, rz] (deg) where local +Z points outward from surface */
  rotationDeg: [number, number, number];
  /** Projection box size [width, height, depth] in mm */
  sizeMm: [number, number, number];
  text: string;
  subtext?: string;
  colorHex: string;
  bgHex?: string;
  /** Optional universal SOT signage/nameplate spec (ANSI Z535, ISO 7010, NFPA 704, ASME A13.1, UL/CE rating plate, crane capacity, QR asset tag) */
  signage?: SignageSpec;
  /** Optional SOT NEC decal ID from Setups/rules/decals.json (e.g. 'nec_110_16_arc_flash') */
  necDecalId?: string;
  /** Optional ANSI Z535 signal word override ('DANGER' | 'WARNING' | 'CAUTION' | 'NOTICE' | 'SAFETY' | 'PHENOLIC') */
  necSignal?: 'DANGER' | 'WARNING' | 'CAUTION' | 'NOTICE' | 'SAFETY' | 'PHENOLIC';
  /** Optional NEC article footer (e.g. 'NEC 110.16(A)') */
  necArticle?: string;
  /** Optional body lines for NEC decal */
  necLines?: string[];
  opacity?: number;
  fontWeight?: 'normal' | 'semibold' | 'bold';
  /** Render text curved around a circular ring (e.g. skateboard wheel sidewall branding) */
  circularRing?: boolean;
}

export interface PartMassProperty {
  partId: string;
  partName: string;
  group: string;
  finishName: string;
  densityGPerCm3: number;
  volumeCm3: number;
  massKg: number;
  centerOfGravityMm: [number, number, number];
}

export interface AssemblyMassProperties {
  totalMassKg: number;
  totalVolumeCm3: number;
  centerOfGravityMm: [number, number, number];
  /** 2D XZ convex hull of floor-contacting footprint (mm) */
  supportPolygonXZMm: [number, number][];
  /** Signed distance from CoG XZ projection to nearest support polygon edge (+ = inside, - = tip-over) */
  stabilityMarginMm: number;
  stabilityStatus: 'stable' | 'marginal' | 'unstable';
  /** CoG height divided by total assembly height (0..1) */
  topHeavinessRatio: number;
  /** Floor plane Y coordinate (mm) used for stability calculation */
  floorYMm: number;
  parts: PartMassProperty[];
}

export interface PartMetrology {
  id: string;
  name: string;
  group: string;
  finishName: string;
  triangles: number;
  sizeMm: [number, number, number];
  toleranceMm: number;
  visible: boolean;
  isWatertightCsg?: boolean;
  hasSolvedConstraint?: boolean;
}

export interface MetrologyStats {
  totalTriangles: number;
  totalVertices: number;
  partCount: number;
  surfaceAreaM2: number;
  boundingMm: [number, number, number];
  parts: PartMetrology[];
  watertightCsgCount?: number;
  solvedConstraintCount?: number;
  massProperties?: AssemblyMassProperties;
}

export type RenderMode =
  | 'shaded'
  | 'cadEdges'
  | 'wireframe'
  | 'normals'
  | 'zebra'
  | 'xray';

export type StudioTheme = 'light' | 'dark';

export type LightingPresetId = 'cyclorama' | 'darkRim' | 'factoryFloor' | 'showroom';

export type TransformGizmoMode = 'off' | 'translate' | 'rotate';

export type TessellationDensity = 'standard' | 'high' | 'ultra';

export type CameraPresetId =
  | 'photoMatch'
  | 'iso'
  | 'front'
  | 'left'
  | 'side'
  | 'top'
  | 'interior';

export interface SectionPlaneConfig {
  axis: 'off' | 'x' | 'y' | 'z';
  position: number; // -1 to 1 normalized across bounding envelope
  invert: boolean;
}

export interface CaliperPoint {
  positionMm: [number, number, number];
  partName: string;
}

export interface CaliperMeasurement {
  pointA: CaliperPoint | null;
  pointB: CaliperPoint | null;
  distanceMm: number | null;
  deltaMm: [number, number, number] | null;
}

export interface SweepSolidDiagnostic {
  manifoldReady: boolean;
  status: string;
  isWatertight: boolean;
  volumeCm3: number;
  surfaceAreaCm2: number;
  genus: number;
  triangles: number;
  vertices: number;
  pathLengthMm: number;
  stationCount: number;
  evaluatedPathMm: [number, number, number][];
}
