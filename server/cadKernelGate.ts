import path from 'node:path';
import * as THREE from 'three';
import {
  AssemblyInterfaceSpec,
  AssemblySkeletonSpec,
  BlueprintPart,
  CsgNodeSpec,
  CsgOpKind,
  GeometryAuditReport,
  MechanicalFitClass,
  MeshBlueprint,
  PartConstraintSpec,
  PartGeometryKind,
  PartMaterialSpec,
  PartPortSpec,
  ProceduralTextureKind,
} from '../src/types/blueprint';
import {
  OrchestratorAccuracyMetrics,
  OrchestratorGateSnapshot,
} from '../src/types/orchestrator';
import {
  buildCsgSolidGeometry,
  ensureManifoldReady,
  setManifoldWasmPath,
} from '../src/engine/manifoldKernel';
import { compileAssemblyBlueprint } from '../src/engine/assemblyCompiler';
import {
  MeasuredPartBounds,
  measureOrientedBoundsMm,
  solveAssemblyConstraints,
} from '../src/engine/constraintSolver';
import { buildPartGeometry } from '../src/engine/meshKernel';
import { runGeometryAudit } from '../src/engine/geometryLinter';
import {
  buildAnchoredShsColumnCsg,
  buildBarGratingStairTreadCsg,
  buildDiagonalXBraceCsg,
  buildDiamondPlateDeckCsg,
  buildDiamondPlateStairTreadCsg,
  buildEndGuardrailFrameCsg,
  buildFoldedStairStringerCsg,
  buildGooseneckStairHandrailCsg,
  buildGroovedStairNosingCsg,
  buildHollowCChannelSubframeCsg,
  buildNaammBarGratingDeckCsg,
  buildSideGuardrailPanelCsg,
  computeStairMetrics,
} from '../src/engine/engineeringLibrary';

const MM_TO_SCENE = 0.001;
const DEG_TO_RAD = Math.PI / 180;

const VALID_PART_KINDS = new Set<PartGeometryKind>([
  'csgSolid',
  'roundedBox',
  'box',
  'cylinder',
  'sphere',
  'capsule',
  'torus',
  'extrudePolygon',
  'latheProfile',
  'tubePath',
  'taperedTube',
  'organicLoft',
  'moldedProfile',
  'flutedPanel',
  'hollowBox',
  'taperedBox',
  'curvedPanel',
  'staircase',
  'rollerBed',
  'dragChain',
  'impellerWorkpiece',
  'wayCoverSlats',
]);

const VALID_CSG_OPS = new Set<CsgOpKind>([
  'box',
  'cylinder',
  'sphere',
  'polygonExtrude',
  'sculptedProfile',
  'superellipseLoft',
  'curvedLoft',
  'blendedBoss',
  'blendedCowl',
  'conformalPatch',
  'revolve',
  'sweep',
  'slottedChannel',
  'boltedFlange',
  'machinedBlock',
  'sheetMetal',
  'sheetMetalFold',
  'turnedShaft',
  'involuteGear',
  'structuralBeam',
  'ballBearing',
  'union',
  'subtract',
  'intersect',
  'hull',
  'shellWall',
  'panelSeam',
]);

const VALID_TEXTURES = new Set<ProceduralTextureKind>([
  'none',
  'woodGrain',
  'stackedStone',
  'fireplaceFlames',
  'glitterFinish',
  'wovenFabric',
  'marbleStone',
  'diamondPlate',
  'brushedMetal',
  'celosScreen',
  'controlKeypad',
  'industrialConsole',
  'warningDecal',
  'amadaBadge',
  'ventedLouvers',
  'knurled',
  'dmuHeaderSign',
  'dmgMoriBadge',
  'fiveAxisBadge',
  'spindleStripe',
  'silkscreenLabel',
  'craftsmanLogo',
  'craftsmanV20Badge',
  'clutchDialRing',
  'rubberOvermold',
  'ryobiLogo',
  'galvanizedSteel',
  'galvanizedDiamondPlate',
  'paintedIndustrialSteel',
  'weldingTableGrid',
]);

const VALID_FIT_CLASSES = new Set<MechanicalFitClass>([
  'standard',
  'fastener',
  'bearing',
  'gearMesh',
  'weld',
  'sliding',
  'keepOut',
]);

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function posNum(v: unknown, min = 0.2, max = 50000): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return clamp(n, min, max);
}

function finiteNum(v: unknown, min = -50000, max = 50000): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return clamp(n, min, max);
}

function toVec3(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(v) || v.length < 3) return [...fallback];
  return [
    clamp(Number(v[0]) || 0, -50000, 50000),
    clamp(Number(v[1]) || 0, -50000, 50000),
    clamp(Number(v[2]) || 0, -50000, 50000),
  ];
}

function toPoints2D(v: unknown, maxPts = 128): [number, number][] | undefined {
  if (!Array.isArray(v)) return undefined;
  const pts = v
    .slice(0, maxPts)
    .filter((pt) => Array.isArray(pt) && pt.length >= 2)
    .map(
      (pt) =>
        [
          clamp(Number(pt[0]) || 0, -25000, 25000),
          clamp(Number(pt[1]) || 0, -25000, 25000),
        ] as [number, number]
    );
  return pts.length >= 2 ? pts : undefined;
}

function toPoints3D(v: unknown, maxPts = 64): [number, number, number][] | undefined {
  if (!Array.isArray(v)) return undefined;
  const pts = v
    .slice(0, maxPts)
    .filter((pt) => Array.isArray(pt) && pt.length >= 3)
    .map(
      (pt) =>
        [
          clamp(Number(pt[0]) || 0, -25000, 25000),
          clamp(Number(pt[1]) || 0, -25000, 25000),
          clamp(Number(pt[2]) || 0, -25000, 25000),
        ] as [number, number, number]
    );
  return pts.length >= 2 ? pts : undefined;
}

/**
 * Expands an optional parametric engineeringLibrary preset into a certified watertight CsgNodeSpec.
 */
export function expandEngineeringLibraryPreset(preset: any): CsgNodeSpec | null {
  if (!preset || typeof preset !== 'object' || typeof preset.kind !== 'string') return null;
  const p = preset.params && typeof preset.params === 'object' ? preset.params : preset;

  switch (preset.kind) {
    case 'anchoredShsColumn':
      return buildAnchoredShsColumnCsg(
        clamp(Number(p.deckFrameBotYMm ?? p.heightMm) || 780, 120, 4000),
        clamp(Number(p.legWidthMm) || 76, 30, 250)
      );
    case 'diagonalXBrace':
      return buildDiagonalXBraceCsg(
        clamp(Number(p.legZMm) || 380, 120, 2000),
        clamp(Number(p.legWidthMm) || 76, 30, 250),
        clamp(Number(p.deckFrameBotYMm) || 780, 220, 4000),
        clamp(Number(p.deckHeightMm) || 900, 300, 4200)
      );
    case 'hollowCChannelSubframe':
      return buildHollowCChannelSubframeCsg(
        clamp(Number(p.lengthXMm) || 900, 200, 6000),
        clamp(Number(p.deckWidthMm) || 860, 200, 3000),
        clamp(Number(p.frameBotYMm) || 780, 100, 4000),
        clamp(Number(p.frameTopYMm) || 875, 160, 4200)
      );
    case 'naammBarGratingDeck':
      return buildNaammBarGratingDeckCsg(
        clamp(Number(p.lengthXMm) || 900, 200, 4000),
        clamp(Number(p.deckWidthMm) || 860, 200, 2400),
        clamp(Number(p.frameTopYMm) || 875, 100, 4000),
        clamp(Number(p.barHeightMm) || 25, 16, 60),
        Array.isArray(p.holdDownLocalXs) ? p.holdDownLocalXs.map(Number).filter(Number.isFinite) : [],
        clamp(Number(p.holdDownZMm) || 0, -2000, 2000)
      );
    case 'diamondPlateDeck':
      return buildDiamondPlateDeckCsg(
        clamp(Number(p.lengthXMm) || 900, 200, 6000),
        clamp(Number(p.deckWidthMm) || 860, 200, 3000),
        clamp(Number(p.frameTopYMm) || 875, 100, 4000),
        clamp(Number(p.plateThicknessMm) || 10, 4, 40)
      );
    case 'endGuardrailFrame':
      return buildEndGuardrailFrameCsg(
        clamp(Number(p.deckWidthMm) || 860, 250, 3000),
        clamp(Number(p.deckTopYMm) || 900, 100, 4000),
        Boolean(p.enclosedFront)
      );
    case 'sideGuardrailPanel':
      return buildSideGuardrailPanelCsg(
        clamp(Number(p.xMinMm) ?? -400, -5000, 5000),
        clamp(Number(p.xMaxMm) ?? 400, -5000, 5000),
        clamp(Number(p.deckTopYMm) || 900, 100, 4000),
        p.nutZSign === -1 ? -1 : 1
      );
    case 'foldedStairStringer': {
      const dh = ([720, 900, 1080].includes(Number(p.deckHeightMm))
        ? Number(p.deckHeightMm)
        : 900) as 720 | 900 | 1080;
      const metrics = computeStairMetrics(dh, clamp(Number(p.rightDeckEdgeXMm) || 900, -5000, 5000));
      return buildFoldedStairStringerCsg(
        p.zSign === -1 ? -1 : 1,
        clamp(Number(p.deckWidthMm) || 860, 300, 2400),
        metrics
      );
    }
    case 'barGratingStairTread':
      return buildBarGratingStairTreadCsg(clamp(Number(p.deckWidthMm) || 860, 300, 2400));
    case 'groovedStairNosing':
      return buildGroovedStairNosingCsg(clamp(Number(p.deckWidthMm) || 860, 300, 2400));
    case 'diamondPlateStairTread':
      return buildDiamondPlateStairTreadCsg(clamp(Number(p.deckWidthMm) || 860, 300, 2400));
    case 'gooseneckStairHandrail': {
      const dh = ([720, 900, 1080].includes(Number(p.deckHeightMm))
        ? Number(p.deckHeightMm)
        : 900) as 720 | 900 | 1080;
      const metrics = computeStairMetrics(dh, clamp(Number(p.rightDeckEdgeXMm) || 900, -5000, 5000));
      return buildGooseneckStairHandrailCsg(metrics);
    }
    default:
      return null;
  }
}

export function sanitizeCsgNode(raw: any, depth = 0): CsgNodeSpec | null {
  if (!raw || typeof raw !== 'object' || depth > 8) return null;

  if (raw.libraryPreset) {
    const expanded = expandEngineeringLibraryPreset(raw.libraryPreset);
    if (expanded) return expanded;
  }

  const op = VALID_CSG_OPS.has(raw.op) ? (raw.op as CsgOpKind) : 'box';
  const node: CsgNodeSpec = { op };

  if (raw.width !== undefined) node.width = posNum(raw.width, 0.5, 25000);
  if (raw.height !== undefined) node.height = posNum(raw.height, 0.5, 25000);
  if (raw.depth !== undefined) node.depth = posNum(raw.depth, 0.5, 25000);
  if (raw.radius !== undefined) node.radius = posNum(raw.radius, 0.4, 12000);
  if (raw.radiusTop !== undefined) node.radiusTop = clamp(Number(raw.radiusTop) || 0, 0, 12000);
  if (raw.radiusBottom !== undefined) node.radiusBottom = clamp(Number(raw.radiusBottom) || 0, 0, 12000);
  if (raw.radialSegments !== undefined) node.radialSegments = Math.round(clamp(Number(raw.radialSegments) || 20, 6, 48));
  if (raw.wallThickness !== undefined) node.wallThickness = posNum(raw.wallThickness, 0.5, 500);

  if (raw.polygonPoints !== undefined) {
    const poly = toPoints2D(raw.polygonPoints, 128);
    if (poly && poly.length >= 3) node.polygonPoints = poly;
  }
  if (Array.isArray(raw.polygonHoles)) {
    const holes = raw.polygonHoles
      .slice(0, 64)
      .map((h: any) => toPoints2D(h, 64))
      .filter((h: [number, number][] | undefined): h is [number, number][] => Boolean(h && h.length >= 3));
    if (holes.length > 0) node.polygonHoles = holes;
  }
  if (raw.profilePoints !== undefined) {
    const prof = toPoints2D(raw.profilePoints, 64);
    if (prof && prof.length >= 3) node.profilePoints = prof;
  }
  if (raw.pathPoints !== undefined) {
    const pathPts = toPoints3D(raw.pathPoints, 64);
    if (pathPts && pathPts.length >= 2) node.pathPoints = pathPts;
  }
  if (raw.lathePoints !== undefined) {
    const lathe = toPoints2D(raw.lathePoints, 64)?.map(
      ([r, y]) => [Math.max(0, r), y] as [number, number]
    );
    if (lathe && lathe.length >= 2) node.lathePoints = lathe;
  }

  if (raw.pathMode === 'polyline' || raw.pathMode === 'spline') node.pathMode = raw.pathMode;
  if (raw.cornerMode === 'miter' || raw.cornerMode === 'bend') node.cornerMode = raw.cornerMode;
  if (raw.bendRadiusMm !== undefined) node.bendRadiusMm = posNum(raw.bendRadiusMm, 1, 2000);
  if (raw.bendSegments !== undefined) node.bendSegments = Math.round(clamp(Number(raw.bendSegments) || 8, 3, 20));
  if (raw.splineSamples !== undefined) node.splineSamples = Math.round(clamp(Number(raw.splineSamples) || 24, 6, 96));
  if (raw.closedLoop !== undefined) node.closedLoop = Boolean(raw.closedLoop);
  if (raw.arcDeg !== undefined) node.arcDeg = clamp(Number(raw.arcDeg) || 360, 10, 360);

  // Specialized parametric CSG node properties
  if (raw.chamferMm !== undefined) node.chamferMm = clamp(Number(raw.chamferMm) || 0, 0, 80);
  if (Array.isArray(raw.pockets)) {
    node.pockets = raw.pockets.slice(0, 32).map((pk: any) => ({
      x: clamp(Number(pk.x) || 0, -10000, 10000),
      y: clamp(Number(pk.y) || 0, -10000, 10000),
      z: clamp(Number(pk.z) || 0, -10000, 10000),
      width: clamp(Number(pk.width) || 20, 1, 10000),
      height: clamp(Number(pk.height) || 20, 1, 10000),
      depth: clamp(Number(pk.depth) || 10, 1, 10000),
      cornerRadius: pk.cornerRadius !== undefined ? clamp(Number(pk.cornerRadius) || 0, 0, 200) : undefined,
    }));
  }
  if (Array.isArray(raw.holes)) {
    node.holes = raw.holes.slice(0, 64).map((hl: any) => ({
      x: clamp(Number(hl.x) || 0, -10000, 10000),
      y: clamp(Number(hl.y) || 0, -10000, 10000),
      z: clamp(Number(hl.z) || 0, -10000, 10000),
      axis: hl.axis === 'x' || hl.axis === 'y' || hl.axis === 'z' ? hl.axis : 'y',
      diameterMm: clamp(Number(hl.diameterMm) || 10, 1, 1000),
      depthMm: clamp(Number(hl.depthMm) || 20, 1, 2000),
      counterboreDiaMm: hl.counterboreDiaMm !== undefined ? clamp(Number(hl.counterboreDiaMm) || 0, 0, 1200) : undefined,
      counterboreDepthMm: hl.counterboreDepthMm !== undefined ? clamp(Number(hl.counterboreDepthMm) || 0, 0, 500) : undefined,
    }));
  }
  if (raw.boreRadiusMm !== undefined) node.boreRadiusMm = posNum(raw.boreRadiusMm, 0.5, 2000);
  if (raw.boltCircleRadiusMm !== undefined) node.boltCircleRadiusMm = posNum(raw.boltCircleRadiusMm, 2, 3000);
  if (raw.boltHoleRadiusMm !== undefined) node.boltHoleRadiusMm = posNum(raw.boltHoleRadiusMm, 0.5, 200);
  if (raw.boltCount !== undefined) node.boltCount = Math.round(clamp(Number(raw.boltCount) || 4, 2, 24));

  if (raw.thicknessMm !== undefined) node.thicknessMm = posNum(raw.thicknessMm, 0.5, 100);
  if (raw.kFactor !== undefined) node.kFactor = clamp(Number(raw.kFactor) || 0.42, 0.2, 0.5);
  if (Array.isArray(raw.flanges)) {
    node.flanges = raw.flanges.slice(0, 4).map((fl: any) => ({
      edge: ['+x', '-x', '+z', '-z'].includes(fl.edge) ? fl.edge : '+z',
      heightMm: clamp(Number(fl.heightMm) || 30, 2, 2000),
      angleDeg: fl.angleDeg !== undefined ? clamp(Number(fl.angleDeg) || 90, 15, 165) : undefined,
      reliefWidthMm: fl.reliefWidthMm !== undefined ? clamp(Number(fl.reliefWidthMm) || 0, 0, 40) : undefined,
    }));
  }
  if (Array.isArray(raw.foldFlanges)) {
    node.foldFlanges = raw.foldFlanges.slice(0, 12).map((fl: any) => ({
      edge: ['+x', '-x', '+z', '-z'].includes(fl.edge) ? fl.edge : '+z',
      flangeLengthMm: clamp(Number(fl.flangeLengthMm) || 40, 4, 3000),
      angleDeg: clamp(Number(fl.angleDeg) || 90, -165, 165),
      bendRadiusMm: fl.bendRadiusMm !== undefined ? posNum(fl.bendRadiusMm, 0.4, 200) : undefined,
      widthMm: fl.widthMm !== undefined ? posNum(fl.widthMm, 4, 8000) : undefined,
      offsetMm: fl.offsetMm !== undefined ? clamp(Number(fl.offsetMm) || 0, -4000, 4000) : undefined,
      reliefWidthMm: fl.reliefWidthMm !== undefined ? clamp(Number(fl.reliefWidthMm) || 0, 0, 120) : undefined,
      holes: Array.isArray(fl.holes)
        ? fl.holes.slice(0, 24).map((h: any) => ({
            uMm: clamp(Number(h.uMm) || 0, -4000, 4000),
            vMm: clamp(Number(h.vMm) || 20, 2, 3000),
            diameterMm: clamp(Number(h.diameterMm) || 8, 1, 500),
          }))
        : undefined,
      returnFlange:
        fl.returnFlange && typeof fl.returnFlange === 'object'
          ? {
              flangeLengthMm: clamp(Number(fl.returnFlange.flangeLengthMm) || 20, 4, 1500),
              angleDeg: clamp(Number(fl.returnFlange.angleDeg) || 90, -165, 165),
              bendRadiusMm:
                fl.returnFlange.bendRadiusMm !== undefined
                  ? posNum(fl.returnFlange.bendRadiusMm, 0.4, 150)
                  : undefined,
            }
          : undefined,
    }));
  }
  if (Array.isArray(raw.baseHoles)) {
    node.baseHoles = raw.baseHoles.slice(0, 48).map((h: any) => ({
      x: clamp(Number(h.x) || 0, -8000, 8000),
      z: clamp(Number(h.z) || 0, -8000, 8000),
      diameterMm: clamp(Number(h.diameterMm) || 10, 1, 1000),
    }));
  }

  if (Array.isArray(raw.shaftSections)) {
    node.shaftSections = raw.shaftSections.slice(0, 16).map((s: any) => ({
      lengthMm: clamp(Number(s.lengthMm) || 20, 1, 5000),
      diameterMm: clamp(Number(s.diameterMm) || 20, 2, 2000),
      chamferStartMm: s.chamferStartMm !== undefined ? clamp(Number(s.chamferStartMm) || 0, 0, 20) : undefined,
      chamferEndMm: s.chamferEndMm !== undefined ? clamp(Number(s.chamferEndMm) || 0, 0, 20) : undefined,
    }));
  }
  if (raw.shaftAxis === 'x' || raw.shaftAxis === 'y' || raw.shaftAxis === 'z') node.shaftAxis = raw.shaftAxis;
  if (raw.moduleMm !== undefined) node.moduleMm = posNum(raw.moduleMm, 0.5, 40);
  if (raw.teeth !== undefined) node.teeth = Math.round(clamp(Number(raw.teeth) || 20, 8, 120));
  if (raw.faceWidthMm !== undefined) node.faceWidthMm = posNum(raw.faceWidthMm, 2, 500);
  if (raw.boreDiameterMm !== undefined) node.boreDiameterMm = posNum(raw.boreDiameterMm, 2, 1000);
  if (raw.gearAxis === 'x' || raw.gearAxis === 'y' || raw.gearAxis === 'z') node.gearAxis = raw.gearAxis;

  if (
    ['iBeam', 'cChannel', 'tSlot8020', 'angleIron', 'squareTube', 'roundTube'].includes(
      raw.profileType
    )
  ) {
    node.profileType = raw.profileType;
  }
  if (raw.flangeThicknessMm !== undefined) node.flangeThicknessMm = posNum(raw.flangeThicknessMm, 1, 100);
  if (raw.webThicknessMm !== undefined) node.webThicknessMm = posNum(raw.webThicknessMm, 1, 100);
  if (raw.beamLengthMm !== undefined) node.beamLengthMm = posNum(raw.beamLengthMm, 10, 15000);

  if (raw.innerDiaMm !== undefined) node.innerDiaMm = posNum(raw.innerDiaMm, 3, 1000);
  if (raw.outerDiaMm !== undefined) node.outerDiaMm = posNum(raw.outerDiaMm, 8, 1500);
  if (raw.ballCount !== undefined) node.ballCount = Math.round(clamp(Number(raw.ballCount) || 9, 5, 20));
  if (raw.bearingAxis === 'x' || raw.bearingAxis === 'y' || raw.bearingAxis === 'z') {
    node.bearingAxis = raw.bearingAxis;
  }

  if (Array.isArray(raw.zStations)) {
    node.zStations = raw.zStations.slice(0, 24).map((st: any) => ({
      yMm: clamp(Number(st.yMm) || 0, -5000, 5000),
      depthMm: clamp(Number(st.depthMm) || 20, 2, 5000),
      heightMm: st.heightMm !== undefined ? clamp(Number(st.heightMm) || 20, 2, 5000) : undefined,
      xCenterMm: st.xCenterMm !== undefined ? clamp(Number(st.xCenterMm) || 0, -5000, 5000) : undefined,
      widthMm: st.widthMm !== undefined ? clamp(Number(st.widthMm) || 20, 2, 5000) : undefined,
      rounded: st.rounded !== undefined ? Boolean(st.rounded) : undefined,
    }));
  }

  // Sculptural & blended-mount CSG properties
  if (raw.loftAxis === 'x' || raw.loftAxis === 'y' || raw.loftAxis === 'z') {
    node.loftAxis = raw.loftAxis;
  }
  if (Array.isArray(raw.superellipseStations)) {
    node.superellipseStations = raw.superellipseStations.slice(0, 24).map((st: any) => ({
      posMm: clamp(Number(st.posMm) || 0, -10000, 10000),
      offsetU: st.offsetU !== undefined ? clamp(Number(st.offsetU) || 0, -10000, 10000) : undefined,
      offsetV: st.offsetV !== undefined ? clamp(Number(st.offsetV) || 0, -10000, 10000) : undefined,
      halfA: clamp(Number(st.halfA) || 20, 0.5, 5000),
      halfB: clamp(Number(st.halfB) || 20, 0.5, 5000),
      exponent: st.exponent !== undefined ? clamp(Number(st.exponent) || 2.6, 1.2, 8.0) : undefined,
    }));
  }
  if (Array.isArray(raw.curvedLoftStations)) {
    node.curvedLoftStations = raw.curvedLoftStations.slice(0, 32).map((st: any) => ({
      posMm: toVec3(st.posMm, [0, 0, 0]),
      halfA: clamp(Number(st.halfA) || 12, 0.3, 5000),
      halfB: clamp(Number(st.halfB) || 12, 0.3, 5000),
      exponent: st.exponent !== undefined ? clamp(Number(st.exponent) || 2.6, 1.2, 10.0) : undefined,
      twistDeg: st.twistDeg !== undefined ? clamp(Number(st.twistDeg) || 0, -360, 360) : undefined,
    }));
  }
  if (Array.isArray(raw.upHint) && raw.upHint.length >= 3) {
    node.upHint = toVec3(raw.upHint, [0, 0, 1]);
  }
  if (raw.bevelMm !== undefined) node.bevelMm = posNum(raw.bevelMm, 0.05, 250);
  if (raw.bevelSegments !== undefined) {
    node.bevelSegments = Math.round(clamp(Number(raw.bevelSegments) || 1, 1, 8));
  }
  if (raw.splineSubdivisions !== undefined) {
    node.splineSubdivisions = Math.round(clamp(Number(raw.splineSubdivisions) || 1, 1, 12));
  }
  if (raw.sharpCornerAngleDeg !== undefined) {
    node.sharpCornerAngleDeg = clamp(Number(raw.sharpCornerAngleDeg) || 68, 5, 175);
  }
  if (raw.sinkDepthMm !== undefined) node.sinkDepthMm = posNum(raw.sinkDepthMm, 0.5, 500);
  if (raw.baseFlareMm !== undefined) node.baseFlareMm = posNum(raw.baseFlareMm, 0.5, 500);
  if (raw.rimMarginMm !== undefined) node.rimMarginMm = clamp(Number(raw.rimMarginMm) || 0, 0, 100);
  if (raw.cowlDirection === 'up' || raw.cowlDirection === 'down') {
    node.cowlDirection = raw.cowlDirection;
  }
  if (Array.isArray(raw.throatOffsetMm) && raw.throatOffsetMm.length >= 3) {
    node.throatOffsetMm = toVec3(raw.throatOffsetMm, [0, 0, 0]);
  }
  if (raw.throatHalfWidthMm !== undefined) node.throatHalfWidthMm = posNum(raw.throatHalfWidthMm, 2, 2000);
  if (raw.throatHalfHeightMm !== undefined) node.throatHalfHeightMm = posNum(raw.throatHalfHeightMm, 2, 2000);
  if (raw.curveRadiusUMm !== undefined) node.curveRadiusUMm = finiteNum(raw.curveRadiusUMm, -20000, 20000);
  if (raw.curveRadiusVMm !== undefined) node.curveRadiusVMm = finiteNum(raw.curveRadiusVMm, -20000, 20000);
  if (
    raw.shellOpenFace === 'none' ||
    raw.shellOpenFace === '+x' ||
    raw.shellOpenFace === '-x' ||
    raw.shellOpenFace === '+y' ||
    raw.shellOpenFace === '-y' ||
    raw.shellOpenFace === '+z' ||
    raw.shellOpenFace === '-z'
  ) {
    node.shellOpenFace = raw.shellOpenFace;
  }
  if (raw.seamAxis === 'x' || raw.seamAxis === 'y' || raw.seamAxis === 'z') {
    node.seamAxis = raw.seamAxis;
  }
  if (raw.seamOffsetMm !== undefined) node.seamOffsetMm = finiteNum(raw.seamOffsetMm, -10000, 10000);
  if (raw.seamWidthMm !== undefined) node.seamWidthMm = posNum(raw.seamWidthMm, 0.5, 12);
  if (raw.seamDepthMm !== undefined) node.seamDepthMm = posNum(raw.seamDepthMm, 0.4, 15);
  if (raw.mirrorAxis === 'x' || raw.mirrorAxis === 'y' || raw.mirrorAxis === 'z') {
    node.mirrorAxis = raw.mirrorAxis;
  }

  if (Array.isArray(raw.translateMm) && raw.translateMm.length >= 3) {
    node.translateMm = toVec3(raw.translateMm, [0, 0, 0]);
  }
  if (Array.isArray(raw.rotateDeg) && raw.rotateDeg.length >= 3) {
    node.rotateDeg = [
      clamp(Number(raw.rotateDeg[0]) || 0, -360, 360),
      clamp(Number(raw.rotateDeg[1]) || 0, -360, 360),
      clamp(Number(raw.rotateDeg[2]) || 0, -360, 360),
    ];
  }
  if (Array.isArray(raw.scale) && raw.scale.length >= 3) {
    node.scale = [
      clamp(Number(raw.scale[0]) || 1, 0.05, 20),
      clamp(Number(raw.scale[1]) || 1, 0.05, 20),
      clamp(Number(raw.scale[2]) || 1, 0.05, 20),
    ];
  }

  if (
    op === 'union' ||
    op === 'subtract' ||
    op === 'intersect' ||
    op === 'hull' ||
    op === 'shellWall' ||
    op === 'panelSeam'
  ) {
    const rawChildren = Array.isArray(raw.children) ? raw.children.slice(0, 64) : [];
    const cleaned = rawChildren
      .map((c: any) => sanitizeCsgNode(c, depth + 1))
      .filter((c: CsgNodeSpec | null): c is CsgNodeSpec => c !== null);
    if (cleaned.length === 0) {
      return { op: 'box', width: 40, height: 40, depth: 40 };
    }
    node.children = cleaned;
  } else if (op === 'box' || op === 'machinedBlock') {
    node.width = node.width ?? 60;
    node.height = node.height ?? 60;
    node.depth = node.depth ?? 60;
  } else if (op === 'cylinder') {
    if (node.radius === undefined && node.radiusTop === undefined && node.radiusBottom === undefined) {
      node.radius = 25;
    }
    node.height = node.height ?? 60;
  } else if (op === 'sphere') {
    node.radius = node.radius ?? 25;
  } else if (op === 'polygonExtrude') {
    if (!node.polygonPoints || node.polygonPoints.length < 3) {
      return { op: 'box', width: 60, height: 60, depth: node.depth ?? 40 };
    }
    node.depth = node.depth ?? 40;
  } else if (op === 'sweep') {
    if (!node.pathPoints || node.pathPoints.length < 2) {
      return { op: 'cylinder', radius: node.radius ?? 15, height: 80 };
    }
    if (!node.profilePoints && !node.radius) {
      node.radius = 16;
    }
  } else if (op === 'sheetMetalFold') {
    node.width = node.width ?? 240;
    node.depth = node.depth ?? 180;
    node.thicknessMm = node.thicknessMm ?? 3;
    node.kFactor = node.kFactor ?? 0.42;
  }

  return node;
}

function sanitizePorts(raw: any): Record<string, PartPortSpec> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, PartPortSpec> = {};
  let count = 0;
  for (const [k, val] of Object.entries(raw)) {
    if (!k.trim() || !val || typeof val !== 'object') continue;
    const v = val as any;
    if (!Array.isArray(v.localOffsetMm) || v.localOffsetMm.length < 3) continue;
    out[k.trim()] = {
      localOffsetMm: toVec3(v.localOffsetMm, [0, 0, 0]),
      normal:
        Array.isArray(v.normal) && v.normal.length >= 3
          ? toVec3(v.normal, [0, 1, 0])
          : undefined,
    };
    count++;
    if (count >= 16) break;
  }
  return count > 0 ? out : undefined;
}

function sanitizeConstraint(raw: any): PartConstraintSpec | undefined {
  if (!raw || typeof raw !== 'object' || typeof raw.kind !== 'string') return undefined;
  switch (raw.kind) {
    case 'sitOnGround':
      return {
        kind: 'sitOnGround',
        groundYMm: finiteNum(raw.groundYMm) ?? 0,
      };
    case 'sitOnTopOf':
      if (typeof raw.targetPartId !== 'string' || !raw.targetPartId.trim()) return undefined;
      return {
        kind: 'sitOnTopOf',
        targetPartId: raw.targetPartId.trim(),
        offsetMm: Array.isArray(raw.offsetMm) ? toVec3(raw.offsetMm, [0, 0, 0]) : undefined,
      };
    case 'matePort':
      if (
        typeof raw.selfPort !== 'string' ||
        typeof raw.targetPartId !== 'string' ||
        typeof raw.targetPort !== 'string'
      ) {
        return undefined;
      }
      return {
        kind: 'matePort',
        selfPort: raw.selfPort.trim(),
        targetPartId: raw.targetPartId.trim(),
        targetPort: raw.targetPort.trim(),
        offsetMm: Array.isArray(raw.offsetMm) ? toVec3(raw.offsetMm, [0, 0, 0]) : undefined,
      };
    case 'alignCenter':
      if (typeof raw.targetPartId !== 'string' || !Array.isArray(raw.axes)) return undefined;
      return {
        kind: 'alignCenter',
        targetPartId: raw.targetPartId.trim(),
        axes: raw.axes.filter((a: any) => a === 'x' || a === 'y' || a === 'z'),
        offsetMm: Array.isArray(raw.offsetMm) ? toVec3(raw.offsetMm, [0, 0, 0]) : undefined,
      };
    case 'coincident':
      if (
        typeof raw.selfPort !== 'string' ||
        typeof raw.targetPartId !== 'string' ||
        typeof raw.targetPort !== 'string'
      ) {
        return undefined;
      }
      return {
        kind: 'coincident',
        selfPort: raw.selfPort.trim(),
        targetPartId: raw.targetPartId.trim(),
        targetPort: raw.targetPort.trim(),
        flipNormal: raw.flipNormal !== undefined ? Boolean(raw.flipNormal) : undefined,
        offsetMm: Array.isArray(raw.offsetMm) ? toVec3(raw.offsetMm, [0, 0, 0]) : undefined,
        jointKind: ['fixed', 'revolute', 'cylindrical', 'prismatic'].includes(raw.jointKind)
          ? raw.jointKind
          : undefined,
      };
    case 'concentric':
      if (
        typeof raw.selfPort !== 'string' ||
        typeof raw.targetPartId !== 'string' ||
        typeof raw.targetPort !== 'string'
      ) {
        return undefined;
      }
      return {
        kind: 'concentric',
        selfPort: raw.selfPort.trim(),
        targetPartId: raw.targetPartId.trim(),
        targetPort: raw.targetPort.trim(),
        axialOffsetMm: finiteNum(raw.axialOffsetMm),
        lockAxial: raw.lockAxial !== undefined ? Boolean(raw.lockAxial) : undefined,
        lockSpin: raw.lockSpin !== undefined ? Boolean(raw.lockSpin) : undefined,
      };
    default:
      return undefined;
  }
}

export function sanitizeMaterial(
  raw: any,
  palette?: Record<string, PartMaterialSpec>
): PartMaterialSpec {
  if (typeof raw === 'string' && palette && palette[raw]) {
    return { ...palette[raw] };
  }
  if (raw && typeof raw.paletteKey === 'string' && palette && palette[raw.paletteKey]) {
    return { ...palette[raw.paletteKey] };
  }
  const colorHex =
    typeof raw?.colorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.colorHex)
      ? raw.colorHex
      : '#64748b';
  const tex: ProceduralTextureKind = VALID_TEXTURES.has(raw?.textureKind)
    ? raw.textureKind
    : 'none';
  return {
    colorHex,
    metalness: clamp(Number(raw?.metalness ?? 0.2), 0, 1),
    roughness: clamp(Number(raw?.roughness ?? 0.36), 0.06, 0.96),
    clearcoat: raw?.clearcoat !== undefined ? clamp(Number(raw.clearcoat) || 0, 0, 1) : 0,
    clearcoatRoughness:
      raw?.clearcoatRoughness !== undefined
        ? clamp(Number(raw.clearcoatRoughness) || 0.2, 0.05, 0.85)
        : undefined,
    opacity: raw?.opacity !== undefined ? clamp(Number(raw.opacity) || 1, 0.08, 1) : 1,
    transparent: Boolean(raw?.transparent) || (raw?.opacity !== undefined && Number(raw.opacity) < 0.98),
    transmission: raw?.transmission !== undefined ? clamp(Number(raw.transmission) || 0, 0, 0.92) : 0,
    emissiveHex:
      typeof raw?.emissiveHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.emissiveHex)
        ? raw.emissiveHex
        : undefined,
    emissiveIntensity:
      raw?.emissiveIntensity !== undefined ? clamp(Number(raw.emissiveIntensity) || 0, 0, 4) : 0,
    textureKind: tex,
    labelText: typeof raw?.labelText === 'string' ? raw.labelText.slice(0, 48) : undefined,
    labelSubtext: typeof raw?.labelSubtext === 'string' ? raw.labelSubtext.slice(0, 48) : undefined,
    finishName:
      typeof raw?.finishName === 'string' && raw.finishName.trim()
        ? raw.finishName.trim().slice(0, 64)
        : 'Industrial Machined Finish',
  };
}

export function sanitizeModernPart(
  raw: any,
  index: number,
  defaultGroup = 'Assembly',
  palette?: Record<string, PartMaterialSpec>
): BlueprintPart {
  const id =
    typeof raw?.id === 'string' && raw.id.trim()
      ? raw.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
      : `part_${index + 1}`;
  const name =
    typeof raw?.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 80)
      : `Component ${index + 1}`;
  const group =
    typeof raw?.group === 'string' && raw.group.trim()
      ? raw.group.trim().slice(0, 48)
      : defaultGroup;

  // Allow direct engineeringLibrary preset shorthand on part or geometry
  const presetNode = expandEngineeringLibraryPreset(raw?.libraryPreset ?? raw?.geometry?.libraryPreset);

  let geometry: BlueprintPart['geometry'];
  if (presetNode) {
    geometry = {
      kind: 'csgSolid',
      csgRoot: presetNode,
      smoothSharpAngleDeg: clamp(Number(raw?.geometry?.smoothSharpAngleDeg) || 40, 15, 75),
    };
  } else if (raw?.geometry?.kind === 'csgSolid' && raw?.geometry?.csgRoot) {
    const cleanRoot = sanitizeCsgNode(raw.geometry.csgRoot) ?? {
      op: 'box',
      width: 60,
      height: 60,
      depth: 60,
    };
    geometry = {
      kind: 'csgSolid',
      csgRoot: cleanRoot,
      smoothSharpAngleDeg: clamp(Number(raw.geometry.smoothSharpAngleDeg) || 42, 15, 75),
    };
  } else {
    const rawKind = VALID_PART_KINDS.has(raw?.geometry?.kind)
      ? (raw.geometry.kind as PartGeometryKind)
      : 'csgSolid';

    if (rawKind === 'csgSolid') {
      geometry = {
        kind: 'csgSolid',
        csgRoot: {
          op: 'box',
          width: posNum(raw?.geometry?.width, 2, 20000) ?? 80,
          height: posNum(raw?.geometry?.height, 2, 20000) ?? 80,
          depth: posNum(raw?.geometry?.depth, 2, 20000) ?? 80,
        },
        smoothSharpAngleDeg: 42,
      };
    } else {
      const g = raw?.geometry || {};
      geometry = {
        kind: rawKind,
        width: posNum(g.width),
        height: posNum(g.height),
        depth: posNum(g.depth),
        radius: posNum(g.radius),
        radiusTop: posNum(g.radiusTop),
        radiusBottom: posNum(g.radiusBottom),
        bevelRadius: posNum(g.bevelRadius, 0.2, 500),
        bevelThickness: posNum(g.bevelThickness, 0.2, 500),
        tubeRadius: posNum(g.tubeRadius, 0.5, 500),
        radialSegments: g.radialSegments ? Math.round(clamp(Number(g.radialSegments), 6, 48)) : undefined,
        polygonPoints: toPoints2D(g.polygonPoints),
        polygonHoles: Array.isArray(g.polygonHoles)
          ? g.polygonHoles
              .map((h: any) => toPoints2D(h))
              .filter((h: any): h is [number, number][] => Boolean(h && h.length >= 3))
          : undefined,
        lathePoints: toPoints2D(g.lathePoints),
        pathPoints: toPoints3D(g.pathPoints),
        wallThickness: posNum(g.wallThickness, 1, 500),
        openFace: ['front', 'back', 'top', 'left', 'right', 'none'].includes(g.openFace)
          ? g.openFace
          : undefined,
        topWidth: posNum(g.topWidth),
        topDepth: posNum(g.topDepth),
        topOffsetX: finiteNum(g.topOffsetX),
        topOffsetZ: finiteNum(g.topOffsetZ),
        thickness: posNum(g.thickness),
        arcDeg: g.arcDeg !== undefined ? clamp(Number(g.arcDeg) || 90, 10, 360) : undefined,
        stepCount: g.stepCount ? Math.round(clamp(Number(g.stepCount), 2, 20)) : undefined,
        hasHandrails: g.hasHandrails !== undefined ? Boolean(g.hasHandrails) : undefined,
        rollerCount: g.rollerCount ? Math.round(clamp(Number(g.rollerCount), 2, 40)) : undefined,
        chainWidth: posNum(g.chainWidth),
        chainHeight: posNum(g.chainHeight),
        linkCount: g.linkCount ? Math.round(clamp(Number(g.linkCount), 4, 80)) : undefined,
        slatCount: g.slatCount ? Math.round(clamp(Number(g.slatCount), 2, 40)) : undefined,
      };
    }
  }

  const constraint = sanitizeConstraint(raw?.constraint);
  const mates = Array.isArray(raw?.mates)
    ? raw.mates
        .map(sanitizeConstraint)
        .filter((m: PartConstraintSpec | undefined): m is PartConstraintSpec => Boolean(m))
    : undefined;

  const motionLimits =
    raw?.motionLimits && typeof raw.motionLimits === 'object'
      ? {
          minAngleDeg: finiteNum(raw.motionLimits.minAngleDeg, -360, 360),
          maxAngleDeg: finiteNum(raw.motionLimits.maxAngleDeg, -360, 360),
          minSlideMm: finiteNum(raw.motionLimits.minSlideMm, -5000, 5000),
          maxSlideMm: finiteNum(raw.motionLimits.maxSlideMm, -5000, 5000),
        }
      : undefined;

  const mirrorAcross =
    raw?.mirrorAcross &&
    typeof raw.mirrorAcross === 'object' &&
    (raw.mirrorAcross.axis === 'x' || raw.mirrorAcross.axis === 'z')
      ? {
          axis: raw.mirrorAcross.axis as 'x' | 'z',
          planeOffsetMm: finiteNum(raw.mirrorAcross.planeOffsetMm, -25000, 25000),
          idSuffix:
            typeof raw.mirrorAcross.idSuffix === 'string'
              ? raw.mirrorAcross.idSuffix.slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, '')
              : undefined,
          swapLeftRightName:
            raw.mirrorAcross.swapLeftRightName !== undefined
              ? Boolean(raw.mirrorAcross.swapLeftRightName)
              : undefined,
          mirrorGeometry:
            raw.mirrorAcross.mirrorGeometry !== undefined
              ? Boolean(raw.mirrorAcross.mirrorGeometry)
              : undefined,
        }
      : undefined;

  let pattern: BlueprintPart['pattern'];
  if (raw?.pattern && typeof raw.pattern === 'object') {
    const count = Math.round(clamp(Number(raw.pattern.count) || 1, 1, 64));
    if (raw.pattern.kind === 'linear' && count >= 2 && Array.isArray(raw.pattern.stepMm)) {
      pattern = {
        kind: 'linear',
        count,
        stepMm: toVec3(raw.pattern.stepMm, [50, 0, 0]),
        idPrefix:
          typeof raw.pattern.idPrefix === 'string'
            ? raw.pattern.idPrefix.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_')
            : undefined,
      };
    } else if (
      raw.pattern.kind === 'polar' &&
      count >= 2 &&
      (raw.pattern.axis === 'x' || raw.pattern.axis === 'y' || raw.pattern.axis === 'z')
    ) {
      pattern = {
        kind: 'polar',
        count,
        axis: raw.pattern.axis,
        centerMm: toVec3(raw.pattern.centerMm, [0, 0, 0]),
        totalAngleDeg: finiteNum(raw.pattern.totalAngleDeg, -360, 360),
        rotateInstances:
          raw.pattern.rotateInstances !== undefined
            ? Boolean(raw.pattern.rotateInstances)
            : undefined,
      };
    }
  }

  return {
    id,
    name,
    group,
    role: raw?.role === 'primary' || raw?.role === 'secondary' || raw?.role === 'detail' ? raw.role : 'secondary',
    fitClass: VALID_FIT_CLASSES.has(raw?.fitClass) ? raw.fitClass : undefined,
    anchorKind:
      raw?.anchorKind === 'floor' || raw?.anchorKind === 'wall' || raw?.anchorKind === 'chassis'
        ? raw.anchorKind
        : undefined,
    motionLimits,
    positionMm: toVec3(raw?.positionMm, [0, 100, 0]),
    rotationDeg: [
      clamp(Number(raw?.rotationDeg?.[0]) || 0, -360, 360),
      clamp(Number(raw?.rotationDeg?.[1]) || 0, -360, 360),
      clamp(Number(raw?.rotationDeg?.[2]) || 0, -360, 360),
    ],
    geometry,
    material: sanitizeMaterial(raw?.material, palette),
    explodeOffsetMm: toVec3(raw?.explodeOffsetMm, [0, 30, 0]),
    toleranceMm: clamp(Number(raw?.toleranceMm) || 0.1, 0.01, 2.0),
    notes: typeof raw?.notes === 'string' ? raw.notes.slice(0, 160) : undefined,
    mirrorAcross,
    pattern,
    ports: sanitizePorts(raw?.ports),
    constraint,
    mates: mates && mates.length > 0 ? mates : undefined,
  };
}

export function deduplicateParts(parts: BlueprintPart[]): BlueprintPart[] {
  const seen = new Set<string>();
  const out: BlueprintPart[] = [];
  for (const p of parts) {
    let id = p.id;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${p.id}_${suffix++}`;
    }
    seen.add(id);
    out.push(id === p.id ? p : { ...p, id });
  }
  return out;
}

export function sanitizeSkeleton(raw: any): AssemblySkeletonSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const params: Record<string, number> = {};
  if (raw.params && typeof raw.params === 'object') {
    for (const [k, v] of Object.entries(raw.params)) {
      const n = Number(v);
      if (k.trim() && Number.isFinite(n)) params[k.trim()] = n;
    }
  }
  const axes = Array.isArray(raw.axes)
    ? raw.axes
        .slice(0, 12)
        .filter((a: any) => a && typeof a.id === 'string')
        .map((a: any) => ({
          id: String(a.id).trim(),
          label: typeof a.label === 'string' ? a.label.trim() : String(a.id),
          originMm: toVec3(a.originMm, [0, 0, 0]),
          direction: toVec3(a.direction, [0, 1, 0]),
        }))
    : undefined;
  const planes = Array.isArray(raw.planes)
    ? raw.planes
        .slice(0, 12)
        .filter((pl: any) => pl && typeof pl.id === 'string')
        .map((pl: any) => ({
          id: String(pl.id).trim(),
          label: typeof pl.label === 'string' ? pl.label.trim() : String(pl.id),
          originMm: toVec3(pl.originMm, [0, 0, 0]),
          normal: toVec3(pl.normal, [0, 1, 0]),
        }))
    : undefined;

  if (Object.keys(params).length === 0 && (!axes || axes.length === 0) && (!planes || planes.length === 0)) {
    return undefined;
  }
  return {
    ...(Object.keys(params).length > 0 ? { params } : {}),
    ...(axes && axes.length > 0 ? { axes } : {}),
    ...(planes && planes.length > 0 ? { planes } : {}),
  };
}

export interface MtvSeparationSuggestion {
  movePartId: string;
  fixedPartId: string;
  axis: 'x' | 'y' | 'z';
  axisIdx: 0 | 1 | 2;
  deltaMm: number;
  overlapMm: number;
  hint: string;
}

export interface KernelEvaluationResult {
  report: GeometryAuditReport;
  gateSnapshot: OrchestratorGateSnapshot;
  failingPartIds: string[];
  nonWatertightIds: string[];
  partBoundsWorldMm: Record<string, { min: [number, number, number]; max: [number, number, number] }>;
  mtvSuggestions: MtvSeparationSuggestion[];
  defectSummaryForAgent: string;
}

function isFeatureRichCsgNode(node: CsgNodeSpec | undefined): boolean {
  if (!node) return false;
  if (
    node.op === 'subtract' ||
    node.op === 'intersect' ||
    node.op === 'hull' ||
    node.op === 'polygonExtrude' ||
    node.op === 'sculptedProfile' ||
    node.op === 'superellipseLoft' ||
    node.op === 'blendedBoss' ||
    node.op === 'blendedCowl' ||
    node.op === 'conformalPatch' ||
    node.op === 'shellWall' ||
    node.op === 'panelSeam' ||
    node.op === 'revolve' ||
    node.op === 'sweep' ||
    node.op === 'slottedChannel' ||
    node.op === 'boltedFlange' ||
    node.op === 'machinedBlock' ||
    node.op === 'sheetMetal' ||
    node.op === 'sheetMetalFold' ||
    node.op === 'turnedShaft' ||
    node.op === 'involuteGear' ||
    node.op === 'structuralBeam' ||
    node.op === 'ballBearing'
  ) {
    return true;
  }
  if (node.op === 'box' && (node.chamferMm ?? 0) > 0.2) {
    return true;
  }
  if (node.op === 'union' && Array.isArray(node.children)) {
    if (node.children.length >= 2) return true;
    return node.children.some((c) => isFeatureRichCsgNode(c));
  }
  return false;
}

function boxVolumeMm3(b: { min: [number, number, number]; max: [number, number, number] }): number {
  return (
    Math.max(1, b.max[0] - b.min[0]) *
    Math.max(1, b.max[1] - b.min[1]) *
    Math.max(1, b.max[2] - b.min[2])
  );
}

function computeMtvSuggestion(
  partA: BlueprintPart,
  partB: BlueprintPart,
  boxA: { min: [number, number, number]; max: [number, number, number] },
  boxB: { min: [number, number, number]; max: [number, number, number] },
  penetrationMm: number
): MtvSeparationSuggestion | null {
  const ox = Math.min(boxA.max[0], boxB.max[0]) - Math.max(boxA.min[0], boxB.min[0]);
  const oy = Math.min(boxA.max[1], boxB.max[1]) - Math.max(boxA.min[1], boxB.min[1]);
  const oz = Math.min(boxA.max[2], boxB.max[2]) - Math.max(boxA.min[2], boxB.min[2]);
  if (ox <= 0 || oy <= 0 || oz <= 0) return null;

  // Prefer moving the non-floor-anchored, smaller part
  const aAnchored = partA.anchorKind === 'floor' || partA.constraint?.kind === 'sitOnGround';
  const bAnchored = partB.anchorKind === 'floor' || partB.constraint?.kind === 'sitOnGround';
  const moveA =
    aAnchored !== bAnchored
      ? !aAnchored
      : boxVolumeMm3(boxA) <= boxVolumeMm3(boxB);

  const movePart = moveA ? partA : partB;
  const fixedPart = moveA ? partB : partA;
  const mBox = moveA ? boxA : boxB;
  const fBox = moveA ? boxB : boxA;

  const overlaps: { axis: 'x' | 'y' | 'z'; idx: 0 | 1 | 2; ov: number }[] = [
    { axis: 'x', idx: 0, ov: ox },
    { axis: 'y', idx: 1, ov: oy },
    { axis: 'z', idx: 2, ov: oz },
  ];
  // Avoid pushing a floor-anchored part down into negative Y if horizontal axis is close
  overlaps.sort((u, v) => {
    const uPen = u.axis === 'y' && (movePart.anchorKind === 'floor' || mBox.min[1] <= 2) ? u.ov * 3 : u.ov;
    const vPen = v.axis === 'y' && (movePart.anchorKind === 'floor' || mBox.min[1] <= 2) ? v.ov * 3 : v.ov;
    return uPen - vPen;
  });

  const best = overlaps[0];
  const mCenter = (mBox.min[best.idx] + mBox.max[best.idx]) * 0.5;
  const fCenter = (fBox.min[best.idx] + fBox.max[best.idx]) * 0.5;
  let dir = mCenter >= fCenter ? 1 : -1;
  if (best.axis === 'y' && mBox.min[1] - (best.ov + 1.5) < 0) {
    dir = 1;
  }

  const effectiveOv = Math.min(best.ov, Math.max(penetrationMm, 0.5));
  const shiftMag = Number((effectiveOv + 1.5).toFixed(1));
  const deltaMm = Number((dir * shiftMag).toFixed(1));
  const signStr = deltaMm >= 0 ? `+${deltaMm}` : `${deltaMm}`;
  const axisLabel = best.axis.toUpperCase();

  return {
    movePartId: movePart.id,
    fixedPartId: fixedPart.id,
    axis: best.axis,
    axisIdx: best.idx,
    deltaMm,
    overlapMm: Number(effectiveOv.toFixed(1)),
    hint: `MTV: Shift "${movePart.id}" by ${signStr} mm along ${axisLabel} (clears "${fixedPart.id}" with 1.5 mm gap) OR trim/subtract ${effectiveOv.toFixed(1)} mm.`,
  };
}

/**
 * Deterministic Stage 3 CAD Kernel Gate.
 * Runs real manifold-3d WASM CSG evaluation, bidirectional interface compilation,
 * parametric mate constraint solving, exact Boolean clash & dynamic motion-sweep detection,
 * quantitative accuracy/fidelity scoring, and structural load-path grounding checks inside Node.js.
 */
export async function evaluateBlueprintInKernel(
  blueprint: MeshBlueprint,
  iteration: number,
  label: string
): Promise<KernelEvaluationResult> {
  setManifoldWasmPath(path.resolve(process.cwd(), 'node_modules/manifold-3d/manifold.wasm'));
  const ready = await ensureManifoldReady();
  if (!ready) {
    throw new Error('Manifold-3D WASM kernel failed to initialize on the server.');
  }

  const compiled = compileAssemblyBlueprint(blueprint);
  const parts = compiled.parts;
  const partById = new Map<string, BlueprintPart>(parts.map((p) => [p.id, p]));

  const geomMap = new Map<string, THREE.BufferGeometry>();
  const boundsMap = new Map<string, MeasuredPartBounds>();
  let totalCsgCount = 0;
  let watertightCsgCount = 0;
  let featureRichPartCount = 0;
  const nonWatertightIds: string[] = [];

  for (const p of parts) {
    let geo: THREE.BufferGeometry;
    if (p.geometry.kind === 'csgSolid' && p.geometry.csgRoot) {
      totalCsgCount++;
      if (isFeatureRichCsgNode(p.geometry.csgRoot)) {
        featureRichPartCount++;
      }
      const res = buildCsgSolidGeometry(
        p.geometry.csgRoot,
        'standard',
        p.geometry.smoothSharpAngleDeg ?? 42
      );
      geo = res.geometry;
      if (res.isWatertightManifold) {
        watertightCsgCount++;
      } else {
        nonWatertightIds.push(p.id);
      }
    } else {
      if (
        p.geometry.kind !== 'box' &&
        p.geometry.kind !== 'roundedBox' &&
        p.geometry.kind !== 'cylinder' &&
        p.geometry.kind !== 'sphere'
      ) {
        featureRichPartCount++;
      }
      geo = buildPartGeometry(p, 'standard');
    }
    geomMap.set(p.id, geo);
    boundsMap.set(p.id, measureOrientedBoundsMm(geo, p.rotationDeg));
  }

  const cs = solveAssemblyConstraints(parts, boundsMap, geomMap);
  const root = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const sharedMat = new THREE.MeshBasicMaterial();
  const partBoundsWorldMm: Record<
    string,
    { min: [number, number, number]; max: [number, number, number] }
  > = {};

  let asmMinX = Infinity;
  let asmMinY = Infinity;
  let asmMinZ = Infinity;
  let asmMaxX = -Infinity;
  let asmMaxY = -Infinity;
  let asmMaxZ = -Infinity;

  try {
    for (const p of parts) {
      const geo = geomMap.get(p.id)!;
      const mesh = new THREE.Mesh(geo, sharedMat);
      mesh.userData.partId = p.id;
      const pos = cs.resolvedPositionsMm.get(p.id) ?? p.positionMm;
      const rot = cs.resolvedRotationsDeg.get(p.id) ?? p.rotationDeg;
      mesh.position.set(pos[0] * MM_TO_SCENE, pos[1] * MM_TO_SCENE, pos[2] * MM_TO_SCENE);
      mesh.rotation.set(rot[0] * DEG_TO_RAD, rot[1] * DEG_TO_RAD, rot[2] * DEG_TO_RAD, 'YXZ');
      mesh.updateMatrixWorld(true);
      root.add(mesh);
      meshes.push(mesh);

      const box = new THREE.Box3().setFromObject(mesh);
      const minMm: [number, number, number] = [
        Number((box.min.x * 1000).toFixed(1)),
        Number((box.min.y * 1000).toFixed(1)),
        Number((box.min.z * 1000).toFixed(1)),
      ];
      const maxMm: [number, number, number] = [
        Number((box.max.x * 1000).toFixed(1)),
        Number((box.max.y * 1000).toFixed(1)),
        Number((box.max.z * 1000).toFixed(1)),
      ];
      partBoundsWorldMm[p.id] = { min: minMm, max: maxMm };

      if (Number.isFinite(minMm[0]) && Number.isFinite(maxMm[0])) {
        asmMinX = Math.min(asmMinX, minMm[0]);
        asmMinY = Math.min(asmMinY, minMm[1]);
        asmMinZ = Math.min(asmMinZ, minMm[2]);
        asmMaxX = Math.max(asmMaxX, maxMm[0]);
        asmMaxY = Math.max(asmMaxY, maxMm[1]);
        asmMaxZ = Math.max(asmMaxZ, maxMm[2]);
      }
    }
    root.updateMatrixWorld(true);

    const report = runGeometryAudit(
      parts,
      meshes,
      cs.entries,
      cs.joints,
      watertightCsgCount,
      {
        compiledInterfaces: compiled.compiledInterfaces,
        fitExemptPairs: compiled.fitExemptPairs,
        loadPathEdges: compiled.loadPathEdges,
      }
    );

    const actualW = Number.isFinite(asmMaxX - asmMinX) ? Math.max(0, asmMaxX - asmMinX) : 0;
    const actualH = Number.isFinite(asmMaxY - asmMinY) ? Math.max(0, asmMaxY - asmMinY) : 0;
    const actualD = Number.isFinite(asmMaxZ - asmMinZ) ? Math.max(0, asmMaxZ - asmMinZ) : 0;
    const targetW = Math.max(1, blueprint.envelopeMm?.width || actualW || 1);
    const targetH = Math.max(1, blueprint.envelopeMm?.height || actualH || 1);
    const targetD = Math.max(1, blueprint.envelopeMm?.depth || actualD || 1);

    const errW = Math.abs(actualW - targetW) / targetW;
    const errH = Math.abs(actualH - targetH) / targetH;
    const errD = Math.abs(actualD - targetD) / targetD;
    const envelopeErrorPct = Number(clamp(((errW + errH + errD) / 3) * 100, 0, 100).toFixed(1));
    const csgWatertightPct = Number(
      ((watertightCsgCount / Math.max(1, parts.length)) * 100).toFixed(1)
    );
    const featureRichnessPct = Number(
      ((featureRichPartCount / Math.max(1, parts.length)) * 100).toFixed(1)
    );
    const groundingAccuracyMm = Number(
      (Number.isFinite(asmMinY) ? Math.abs(asmMinY) : 0).toFixed(1)
    );

    const envScore = Math.max(0, 100 - envelopeErrorPct * 2.5);
    const groundScore = Math.max(0, 100 - groundingAccuracyMm * 12);
    const featScore = Math.min(100, featureRichnessPct * 1.15);
    const accuracyScore = Math.round(
      clamp(
        report.healthScore * 0.45 +
          envScore * 0.2 +
          csgWatertightPct * 0.15 +
          featScore * 0.1 +
          groundScore * 0.1,
        0,
        100
      )
    );

    const accuracyMetrics: OrchestratorAccuracyMetrics = {
      actualEnvelopeMm: {
        width: Math.round(actualW),
        height: Math.round(actualH),
        depth: Math.round(actualD),
      },
      envelopeErrorPct,
      csgWatertightPct,
      featureRichnessPct,
      groundingAccuracyMm,
      accuracyScore,
    };

    const maxResidualMm = cs.entries.reduce(
      (maxErr, e) => Math.max(maxErr, e.residualErrorMm ?? 0),
      0
    );
    const hardClashCount = report.clashes.filter((c) => c.severity === 'clash').length;
    const warningClashCount = report.clashes.filter((c) => c.severity === 'warning').length;
    const dynamicClashCount = report.dynamicClashes.length;
    const floatingCount = report.floatingParts.length;
    const occludedCount = report.occludedParts?.length ?? 0;
    const unblendedMountCount = report.unblendedMounts?.length ?? 0;

    const passed =
      report.healthScore >= 98 &&
      nonWatertightIds.length === 0 &&
      hardClashCount === 0 &&
      warningClashCount === 0 &&
      dynamicClashCount === 0 &&
      floatingCount === 0 &&
      occludedCount === 0 &&
      unblendedMountCount === 0 &&
      maxResidualMm <= 0.15;

    const failingSet = new Set<string>(nonWatertightIds);
    const topDefects: string[] = [];
    const mtvSuggestions: MtvSeparationSuggestion[] = [];
    const mtvFixes: string[] = [];

    for (const c of report.clashes) {
      failingSet.add(c.partAId);
      failingSet.add(c.partBId);
      topDefects.push(
        `[${c.severity.toUpperCase()}] ${c.partAId} <-> ${c.partBId}: ${c.overlapVolumeCm3.toFixed(1)} cm³ overlap, ${c.penetrationMm.toFixed(1)} mm penetration @ [${c.centerMm.map((n) => Math.round(n)).join(', ')}]`
      );
      const pA = partById.get(c.partAId);
      const pB = partById.get(c.partBId);
      const bA = partBoundsWorldMm[c.partAId];
      const bB = partBoundsWorldMm[c.partBId];
      if (pA && pB && bA && bB) {
        const mtv = computeMtvSuggestion(pA, pB, bA, bB, c.penetrationMm);
        if (mtv) {
          mtvSuggestions.push(mtv);
          mtvFixes.push(mtv.hint);
        }
      }
    }
    for (const d of report.dynamicClashes) {
      failingSet.add(d.movingPartId);
      failingSet.add(d.obstaclePartId);
      topDefects.push(
        `[DYNAMIC CLASH @ ${d.poseLabel}] ${d.movingPartId} <-> ${d.obstaclePartId}: ${d.penetrationMm.toFixed(1)} mm penetration`
      );
    }
    for (const f of report.floatingParts) {
      failingSet.add(f.partId);
      topDefects.push(
        `[FLOATING] ${f.partId}: minY=${f.minYMm.toFixed(1)} mm, ${f.gapMm.toFixed(1)} mm air gap from ${f.nearestPartName ?? 'ground'}`
      );
      mtvFixes.push(
        `DROP: Lower "${f.partId}" by -${f.gapMm.toFixed(1)} mm along Y to sit flush on ${f.nearestPartName ?? 'floor Y=0'}.`
      );
    }
    for (const o of report.occludedParts ?? []) {
      failingSet.add(o.partId);
      topDefects.push(
        `[BURIED] ${o.partId}: ${o.buriedRatioPct.toFixed(0)}% buried inside ${o.occluderPartId}`
      );
    }
    for (const m of report.unblendedMounts ?? []) {
      failingSet.add(m.partId);
      failingSet.add(m.hostPartId);
      const tag = m.reason === 'cantileveredRimSkew' ? 'UNBLENDED RIM SKEW' : 'UNBLENDED AIR-GAP';
      topDefects.push(
        `[${tag}] ${m.partId} on ${m.hostPartId}: minGap=${m.minSurfaceGapMm.toFixed(1)} mm, maxRimGap=${m.maxRimGapMm.toFixed(1)} mm (host normal [${m.hostNormal.join(', ')}])`
      );
      mtvFixes.push(`SEAT FIX: ${m.hint}`);
    }
    for (const nw of nonWatertightIds) {
      topDefects.push(`[NON-WATERTIGHT] ${nw}: CSG manifold failed watertight check`);
    }
    for (const ce of cs.entries) {
      if (ce.status === 'conflicting' || ce.status === 'unresolved' || ce.residualErrorMm > 0.15) {
        failingSet.add(ce.partId);
        topDefects.push(
          `[CONSTRAINT ${ce.status.toUpperCase()}] ${ce.partId}: residual ${ce.residualErrorMm.toFixed(2)} mm (${ce.note})`
        );
      }
    }

    const defectLines: string[] = [
      `KERNEL GATE SCORE: ${report.healthScore}/100 (${passed ? 'PASS' : 'FAIL'}) | ACCURACY: ${accuracyScore}/100 (EnvErr ${envelopeErrorPct}%, CSG ${csgWatertightPct}%, Feat ${featureRichnessPct}%, Floor ΔY ${groundingAccuracyMm} mm)`,
      `Totals: ${parts.length} parts | Watertight CSG: ${watertightCsgCount}/${totalCsgCount} | Clashes: ${hardClashCount} hard, ${warningClashCount} warning | Dynamic: ${dynamicClashCount} | Floating: ${floatingCount} | Buried: ${occludedCount} | Unblended Mounts: ${unblendedMountCount} | Max residual: ${maxResidualMm.toFixed(3)} mm`,
      '',
      'EXACT DEFECTS TO FIX:',
      ...(topDefects.length > 0 ? topDefects.slice(0, 24).map((d, i) => `${i + 1}. ${d}`) : ['None.']),
      ...(mtvFixes.length > 0
        ? [
            '',
            'COMPUTED EXACT MTV, DROP & CURVED-SURFACE SEAT FIX VECTORS (FOLLOW THESE DIRECTIONS):',
            ...mtvFixes.slice(0, 18).map((m, i) => `${i + 1}. ${m}`),
          ]
        : []),
      '',
      'WORLD BOUNDING BOXES (mm) OF AFFECTED PARTS:',
      ...Array.from(failingSet)
        .slice(0, 28)
        .map((pid) => {
          const b = partBoundsWorldMm[pid];
          return b
            ? `- ${pid}: X[${b.min[0]}..${b.max[0]}], Y[${b.min[1]}..${b.max[1]}], Z[${b.min[2]}..${b.max[2]}]`
            : `- ${pid}: (bounds unavailable)`;
        }),
    ];

    const gateSnapshot: OrchestratorGateSnapshot = {
      iteration,
      label,
      healthScore: report.healthScore,
      watertightCsgCount,
      totalCsgCount,
      totalPartCount: parts.length,
      hardClashCount,
      warningClashCount,
      dynamicClashCount,
      floatingCount,
      occludedCount,
      unblendedMountCount,
      maxResidualMm: Number(maxResidualMm.toFixed(3)),
      passed,
      topDefects: topDefects.slice(0, 10),
      mtvFixes: mtvFixes.slice(0, 8),
      accuracyMetrics,
    };

    return {
      report,
      gateSnapshot,
      failingPartIds: Array.from(failingSet),
      nonWatertightIds,
      partBoundsWorldMm,
      mtvSuggestions,
      defectSummaryForAgent: defectLines.join('\n'),
    };
  } finally {
    sharedMat.dispose();
    for (const geo of geomMap.values()) {
      geo.dispose();
    }
  }
}

function defectWeight(g: OrchestratorGateSnapshot): number {
  return (
    g.hardClashCount * 3 +
    g.warningClashCount +
    g.dynamicClashCount * 3 +
    g.floatingCount * 2 +
    g.occludedCount +
    (g.unblendedMountCount ?? 0) * 2
  );
}

/**
 * Deterministic Zero-Token Geometric Contact & Grounding Pre-Solver.
 * Fixes small grounding offsets (|minY| <= 12 mm), floating air gaps (<= 18 mm), and
 * micro-overlaps (<= 4.5 mm) along the computed MTV axis on unconstrained parts, then
 * re-verifies in Manifold-3D WASM and ONLY accepts strictly-improving changes.
 */
export async function applyDeterministicGeometryFixes(
  blueprint: MeshBlueprint,
  baselineEval?: KernelEvaluationResult,
  iteration = 0,
  label = 'Deterministic Pre-Solver'
): Promise<{
  blueprint: MeshBlueprint;
  evaluation: KernelEvaluationResult;
  appliedFixes: string[];
  improved: boolean;
}> {
  const baseEval = baselineEval ?? (await evaluateBlueprintInKernel(blueprint, iteration, label));
  if (
    baseEval.gateSnapshot.passed &&
    (baseEval.gateSnapshot.accuracyMetrics?.groundingAccuracyMm ?? 0) <= 0.3
  ) {
    return { blueprint, evaluation: baseEval, appliedFixes: [], improved: false };
  }

  const candidate = structuredClone(blueprint);
  const partMap = new Map<string, BlueprintPart>(candidate.parts.map((p) => [p.id, p]));
  const movedIds = new Set<string>();
  const appliedFixes: string[] = [];

  const hasActiveMate = (p: BlueprintPart) =>
    Boolean(
      (p.constraint && p.constraint.kind !== 'sitOnGround') ||
        (p.mates && p.mates.length > 0)
    );

  // 1. Snap floor-anchored or near-ground parts to exact Y = 0.0 mm
  for (const p of candidate.parts) {
    if (hasActiveMate(p)) continue;
    const b = baseEval.partBoundsWorldMm[p.id];
    if (!b) continue;
    const isFloorPart = p.anchorKind === 'floor' || p.constraint?.kind === 'sitOnGround';
    if ((isFloorPart || (b.min[1] >= -12 && b.min[1] <= 12)) && Math.abs(b.min[1]) > 0.25 && Math.abs(b.min[1]) <= 12) {
      p.positionMm = [
        p.positionMm[0],
        Number((p.positionMm[1] - b.min[1]).toFixed(2)),
        p.positionMm[2],
      ];
      movedIds.add(p.id);
      appliedFixes.push(`Snapped floor part "${p.id}" by ${(-b.min[1]).toFixed(1)} mm to Y=0.0 mm`);
    }
  }

  // 2. Close small vertical air gaps on floating parts (0.5 .. 18 mm)
  for (const f of baseEval.report.floatingParts) {
    const p = partMap.get(f.partId);
    if (!p || movedIds.has(p.id) || hasActiveMate(p)) continue;
    if (f.gapMm > 0.4 && f.gapMm <= 18) {
      p.positionMm = [
        p.positionMm[0],
        Number((p.positionMm[1] - f.gapMm).toFixed(2)),
        p.positionMm[2],
      ];
      movedIds.add(p.id);
      appliedFixes.push(`Dropped floating "${p.id}" by -${f.gapMm.toFixed(1)} mm onto support`);
    }
  }

  // 3. Zero-token Auto-Normal Alignment for skewed/wrong-sign curved-surface mounts (runs BEFORE MTV separation)
  for (const m of baseEval.report.unblendedMounts ?? []) {
    if (
      m.reason !== 'cantileveredRimSkew' ||
      !m.childMatingNormalWorld ||
      !m.matingFaceCenterWorldMm ||
      !m.nearestHostAtCenterMm
    ) {
      continue;
    }
    const p = partMap.get(m.partId);
    if (!p || movedIds.has(p.id) || hasActiveMate(p)) continue;

    const vChildMate = new THREE.Vector3(...m.childMatingNormalWorld).normalize();
    const vHostNorm = new THREE.Vector3(...m.hostNormal).normalize();
    const vTargetMate = vHostNorm.clone().negate();
    const cosAngle = clamp(vChildMate.dot(vTargetMate), -1, 1);
    const angleDeg = (Math.acos(cosAngle) * 180) / Math.PI;
    if (angleDeg < 0.5 || angleDeg > 75) continue;

    const qAlign = new THREE.Quaternion().setFromUnitVectors(vChildMate, vTargetMate);
    const qOld = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        p.rotationDeg[0] * DEG_TO_RAD,
        p.rotationDeg[1] * DEG_TO_RAD,
        p.rotationDeg[2] * DEG_TO_RAD,
        'YXZ'
      )
    );
    const qNew = qAlign.clone().multiply(qOld);
    const eNew = new THREE.Euler().setFromQuaternion(qNew, 'YXZ');
    const RAD_TO_DEG = 180 / Math.PI;
    p.rotationDeg = [
      Number((eNew.x * RAD_TO_DEG).toFixed(2)),
      Number((eNew.y * RAD_TO_DEG).toFixed(2)),
      Number((eNew.z * RAD_TO_DEG).toFixed(2)),
    ];

    // Shift origin so the rotated mating-face center seats at 0.6 mm hairline seam above host surface
    const origPos = new THREE.Vector3(...p.positionMm);
    const faceCenter = new THREE.Vector3(...m.matingFaceCenterWorldMm);
    const relNew = faceCenter.clone().sub(origPos).applyQuaternion(qAlign);
    const targetFaceCenter = new THREE.Vector3(...m.nearestHostAtCenterMm).addScaledVector(
      vHostNorm,
      0.6
    );
    const nextOrigin = targetFaceCenter.sub(relNew);
    p.positionMm = [
      Number(nextOrigin.x.toFixed(2)),
      Number(nextOrigin.y.toFixed(2)),
      Number(nextOrigin.z.toFixed(2)),
    ];

    movedIds.add(p.id);
    appliedFixes.push(
      `Auto-aligned skewed mount "${p.id}" by ${angleDeg.toFixed(1)}° to "${m.hostPartId}" surface normal (rot [${p.rotationDeg.join(', ')}]°, 0.6 mm seam)`
    );
  }

  // 4. Separate micro-grazes (<= 4.5 mm penetration) along exact MTV axis
  for (const mtv of baseEval.mtvSuggestions) {
    if (mtv.overlapMm > 4.5) continue;
    const p = partMap.get(mtv.movePartId);
    if (!p || movedIds.has(p.id) || hasActiveMate(p)) continue;
    const nextPos: [number, number, number] = [...p.positionMm];
    nextPos[mtv.axisIdx] = Number((nextPos[mtv.axisIdx] + mtv.deltaMm).toFixed(2));
    p.positionMm = nextPos;
    movedIds.add(p.id);
    appliedFixes.push(
      `Separated "${p.id}" from "${mtv.fixedPartId}" by ${mtv.deltaMm > 0 ? '+' : ''}${mtv.deltaMm} mm along ${mtv.axis.toUpperCase()}`
    );
  }

  // 5. Seat hovering curved-surface mounts along exact nearest-triangle host vector (preserving 0.6 mm hairline seam)
  for (const m of baseEval.report.unblendedMounts ?? []) {
    if (m.reason !== 'hoveringAirGap' || m.minSurfaceGapMm > 22) continue;
    const p = partMap.get(m.partId);
    if (!p || movedIds.has(p.id) || hasActiveMate(p)) continue;
    const [dx, dy, dz] = m.recommendedShiftMm;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= 0.8) continue;
    const scale = Math.max(0, (dist - 0.6) / dist);
    p.positionMm = [
      Number((p.positionMm[0] + dx * scale).toFixed(2)),
      Number((p.positionMm[1] + dy * scale).toFixed(2)),
      Number((p.positionMm[2] + dz * scale).toFixed(2)),
    ];
    movedIds.add(p.id);
    appliedFixes.push(
      `Seated hovering mount "${p.id}" onto "${m.hostPartId}" surface by [${(dx * scale).toFixed(1)}, ${(dy * scale).toFixed(1)}, ${(dz * scale).toFixed(1)}] mm (0.6 mm seam)`
    );
  }

  if (appliedFixes.length === 0) {
    return { blueprint, evaluation: baseEval, appliedFixes: [], improved: false };
  }

  const nextEval = await evaluateBlueprintInKernel(candidate, iteration, label);
  const scoreImproved = nextEval.gateSnapshot.healthScore > baseEval.gateSnapshot.healthScore;
  const defectsImproved =
    nextEval.gateSnapshot.healthScore === baseEval.gateSnapshot.healthScore &&
    defectWeight(nextEval.gateSnapshot) < defectWeight(baseEval.gateSnapshot);
  const groundingImproved =
    nextEval.gateSnapshot.healthScore === baseEval.gateSnapshot.healthScore &&
    defectWeight(nextEval.gateSnapshot) === defectWeight(baseEval.gateSnapshot) &&
    (nextEval.gateSnapshot.accuracyMetrics?.groundingAccuracyMm ?? 99) <
      (baseEval.gateSnapshot.accuracyMetrics?.groundingAccuracyMm ?? 99) - 0.2;

  if (scoreImproved || defectsImproved || groundingImproved) {
    return {
      blueprint: candidate,
      evaluation: nextEval,
      appliedFixes,
      improved: true,
    };
  }

  return { blueprint, evaluation: baseEval, appliedFixes: [], improved: false };
}

export function sanitizeInterfaces(raw: any): AssemblyInterfaceSpec[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.slice(0, 24) as AssemblyInterfaceSpec[];
}
