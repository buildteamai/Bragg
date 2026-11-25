import {
  CsgNodeSpec,
  MeshBlueprint,
  SheetMetalBendLine,
  SheetMetalFlatPatternResult,
  SheetMetalFoldFlangeSpec,
} from '../types/blueprint';
import {
  DatumPlaneKind,
  OrchestratorPlanarLayout,
  OrchestratorSubAssemblyZone,
  OrthographicPlanVerification,
  PlanarSketchProfile,
} from '../types/orchestrator';

export interface ResolvedFoldFlange {
  index: number;
  edge: '+x' | '-x' | '+z' | '-z';
  angleDeg: number;
  absRad: number;
  sign: 1 | -1;
  flangeLengthMm: number;
  bendRadiusMm: number;
  outerRadiusMm: number;
  setbackMm: number;
  straightLegMm: number;
  spanMm: number;
  offsetMm: number;
  reliefWidthMm: number;
  bendAllowanceMm: number;
  holes: { uMm: number; vMm: number; diameterMm: number }[];
  returnFlange?: {
    angleDeg: number;
    absRad: number;
    sign: 1 | -1;
    flangeLengthMm: number;
    bendRadiusMm: number;
    outerRadiusMm: number;
    setbackMm: number;
    straightLegMm: number;
    bendAllowanceMm: number;
  };
}

export interface SheetMetalFoldLayout {
  thicknessMm: number;
  kFactor: number;
  outerWidthMm: number;
  outerDepthMm: number;
  baseXMin: number;
  baseXMax: number;
  baseZMin: number;
  baseZMax: number;
  baseWidthMm: number;
  baseDepthMm: number;
  baseCenterX: number;
  baseCenterZ: number;
  flanges: ResolvedFoldFlange[];
  baseHoles: { x: number; z: number; diameterMm: number }[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normalizeFlangeSpecs(node: CsgNodeSpec): SheetMetalFoldFlangeSpec[] {
  if (Array.isArray(node.foldFlanges) && node.foldFlanges.length > 0) {
    return node.foldFlanges;
  }
  if (Array.isArray(node.flanges) && node.flanges.length > 0) {
    return node.flanges.map((fl) => ({
      edge: fl.edge,
      flangeLengthMm: fl.heightMm,
      angleDeg: fl.angleDeg ?? 90,
      bendRadiusMm: node.bendRadiusMm,
      reliefWidthMm: fl.reliefWidthMm,
    }));
  }
  return [];
}

/**
 * Computes exact outer-mold-line setbacks, cylindrical bend radii, straight leg lengths,
 * and K-factor bend allowances shared between the 3D Manifold-3D folder and the 2D unfolder.
 */
export function computeSheetMetalFoldLayout(node: CsgNodeSpec): SheetMetalFoldLayout {
  const t = clamp(Number(node.thicknessMm) || 3.0, 0.8, 24);
  const kFactor = clamp(Number(node.kFactor) || 0.42, 0.2, 0.5);
  const outerW = Math.max(16, Number(node.width) || 220);
  const outerD = Math.max(16, Number(node.depth) || 160);
  const defaultBendR = Math.max(0.4, Number(node.bendRadiusMm) || t * 1.25);

  const rawFlanges = normalizeFlangeSpecs(node);

  // Determine per-edge outer setback so 90° folded outer walls land cleanly at ±outerW/2 and ±outerD/2
  const edgeSetbacks: Record<'+x' | '-x' | '+z' | '-z', number> = {
    '+x': 0,
    '-x': 0,
    '+z': 0,
    '-z': 0,
  };

  for (const fl of rawFlanges) {
    const rawAngle = Number(fl.angleDeg);
    const angleDeg = clamp(Number.isFinite(rawAngle) && Math.abs(rawAngle) >= 5 ? rawAngle : 90, -165, 165);
    const absRad = (Math.abs(angleDeg) * Math.PI) / 180;
    const rIn = Math.max(0.4, Number(fl.bendRadiusMm) || defaultBendR);
    const rOut = rIn + t;
    const sb = rOut * Math.sin(Math.min(absRad, Math.PI / 2));
    if (sb > edgeSetbacks[fl.edge]) {
      edgeSetbacks[fl.edge] = sb;
    }
  }

  // Ensure base keeps at least 8 mm span on both X and Z
  const maxXSetbackSum = Math.max(0, outerW - 8);
  const xSetbackSum = edgeSetbacks['+x'] + edgeSetbacks['-x'];
  if (xSetbackSum > maxXSetbackSum && xSetbackSum > 0) {
    const scale = maxXSetbackSum / xSetbackSum;
    edgeSetbacks['+x'] *= scale;
    edgeSetbacks['-x'] *= scale;
  }

  const maxZSetbackSum = Math.max(0, outerD - 8);
  const zSetbackSum = edgeSetbacks['+z'] + edgeSetbacks['-z'];
  if (zSetbackSum > maxZSetbackSum && zSetbackSum > 0) {
    const scale = maxZSetbackSum / zSetbackSum;
    edgeSetbacks['+z'] *= scale;
    edgeSetbacks['-z'] *= scale;
  }

  const baseXMin = -outerW / 2 + edgeSetbacks['-x'];
  const baseXMax = outerW / 2 - edgeSetbacks['+x'];
  const baseZMin = -outerD / 2 + edgeSetbacks['-z'];
  const baseZMax = outerD / 2 - edgeSetbacks['+z'];
  const baseWidthMm = Math.max(8, baseXMax - baseXMin);
  const baseDepthMm = Math.max(8, baseZMax - baseZMin);
  const baseCenterX = (baseXMin + baseXMax) * 0.5;
  const baseCenterZ = (baseZMin + baseZMax) * 0.5;

  const flanges: ResolvedFoldFlange[] = rawFlanges.map((fl, index) => {
    const rawAngle = Number(fl.angleDeg);
    const angleDeg = clamp(Number.isFinite(rawAngle) && Math.abs(rawAngle) >= 5 ? rawAngle : 90, -165, 165);
    const sign: 1 | -1 = angleDeg >= 0 ? 1 : -1;
    const absRad = (Math.abs(angleDeg) * Math.PI) / 180;
    const rIn = Math.max(0.4, Number(fl.bendRadiusMm) || defaultBendR);
    const rOut = rIn + t;
    const setbackMm = rOut * Math.sin(Math.min(absRad, Math.PI / 2));
    const flangeLengthMm = Math.max(rOut + 2, Number(fl.flangeLengthMm) || 40);

    const isXEdge = fl.edge === '+x' || fl.edge === '-x';
    const fullEdgeSpan = isXEdge ? baseDepthMm : baseWidthMm;
    const reliefWidthMm = Math.max(0, fl.reliefWidthMm ?? 0.5);
    const maxSpan = Math.max(4, fullEdgeSpan - reliefWidthMm * 2);
    const spanMm =
      fl.widthMm !== undefined && Number.isFinite(fl.widthMm)
        ? clamp(fl.widthMm, 4, maxSpan)
        : maxSpan;
    const offsetMm = clamp(Number(fl.offsetMm) || 0, -(fullEdgeSpan - spanMm) * 0.5, (fullEdgeSpan - spanMm) * 0.5);

    const bendAllowanceMm = absRad * (rIn + kFactor * t);
    let straightLegMm = Math.max(1.0, flangeLengthMm - setbackMm);

    let returnFlange: ResolvedFoldFlange['returnFlange'];
    if (fl.returnFlange && Number(fl.returnFlange.flangeLengthMm) > t) {
      const rawRetAngle = Number(fl.returnFlange.angleDeg);
      const retAngleDeg = clamp(
        Number.isFinite(rawRetAngle) && Math.abs(rawRetAngle) >= 5 ? rawRetAngle : 90,
        -165,
        165
      );
      const retSign: 1 | -1 = retAngleDeg >= 0 ? 1 : -1;
      const retAbsRad = (Math.abs(retAngleDeg) * Math.PI) / 180;
      const retRIn = Math.max(0.4, Number(fl.returnFlange.bendRadiusMm) || rIn);
      const retROut = retRIn + t;
      const retSetback = retROut * Math.sin(Math.min(retAbsRad, Math.PI / 2));
      const retLengthMm = Math.max(retROut + 2, Number(fl.returnFlange.flangeLengthMm) || 20);
      const retStraightLeg = Math.max(1.0, retLengthMm - retSetback);
      const retBA = retAbsRad * (retRIn + kFactor * t);

      // Trim Stage-1 leg by Stage-2 setback so inward top lips stay strictly inside flangeLengthMm
      straightLegMm = Math.max(1.0, straightLegMm - retSetback);

      returnFlange = {
        angleDeg: retAngleDeg,
        absRad: retAbsRad,
        sign: retSign,
        flangeLengthMm: retLengthMm,
        bendRadiusMm: retRIn,
        outerRadiusMm: retROut,
        setbackMm: retSetback,
        straightLegMm: retStraightLeg,
        bendAllowanceMm: retBA,
      };
    }

    const holes = Array.isArray(fl.holes)
      ? fl.holes
          .filter((h) => Number(h.diameterMm) > 0.5)
          .map((h) => ({
            uMm: Number(h.uMm) || 0,
            vMm: Number(h.vMm) || flangeLengthMm * 0.5,
            diameterMm: clamp(Number(h.diameterMm) || 6, 1, Math.min(spanMm, flangeLengthMm) * 0.85),
          }))
      : [];

    return {
      index,
      edge: fl.edge,
      angleDeg,
      absRad,
      sign,
      flangeLengthMm,
      bendRadiusMm: rIn,
      outerRadiusMm: rOut,
      setbackMm,
      straightLegMm,
      spanMm,
      offsetMm,
      reliefWidthMm,
      bendAllowanceMm,
      holes,
      returnFlange,
    };
  });

  const baseHoles = Array.isArray(node.baseHoles)
    ? node.baseHoles
        .filter((h) => Number(h.diameterMm) > 0.5)
        .map((h) => ({
          x: Number(h.x) || 0,
          z: Number(h.z) || 0,
          diameterMm: clamp(Number(h.diameterMm) || 8, 1, Math.min(outerW, outerD) * 0.85),
        }))
    : [];

  return {
    thicknessMm: t,
    kFactor,
    outerWidthMm: outerW,
    outerDepthMm: outerD,
    baseXMin,
    baseXMax,
    baseZMin,
    baseZMax,
    baseWidthMm,
    baseDepthMm,
    baseCenterX,
    baseCenterZ,
    flanges,
    baseHoles,
  };
}

/**
 * Unfolds a `sheetMetalFold` (or `sheetMetal`) CSG solid into its true K-factor
 * 2D flat-pattern blank, bend lines (`UP`/`DOWN`), flange rectangles, and unfolded hole map.
 */
export function developSheetMetalFlatPattern(node: CsgNodeSpec): SheetMetalFlatPatternResult {
  const layout = computeSheetMetalFoldLayout(node);
  const bendLines: SheetMetalBendLine[] = [];
  const flangeRects: SheetMetalFlatPatternResult['flangeRects'] = [
    {
      id: 'base_plate',
      xMin: layout.baseXMin,
      zMin: layout.baseZMin,
      xMax: layout.baseXMax,
      zMax: layout.baseZMax,
      stage: 0,
    },
  ];
  const holes2D: { x: number; z: number; diameterMm: number }[] = layout.baseHoles.map((h) => ({
    x: h.x,
    z: h.z,
    diameterMm: h.diameterMm,
  }));

  let minX = layout.baseXMin;
  let maxX = layout.baseXMax;
  let minZ = layout.baseZMin;
  let maxZ = layout.baseZMax;
  let totalBendAllowanceMm = 0;

  for (const fl of layout.flanges) {
    totalBendAllowanceMm += fl.bendAllowanceMm;
    const dir1: 'UP' | 'DOWN' = fl.angleDeg >= 0 ? 'UP' : 'DOWN';
    const stage1Span = fl.bendAllowanceMm + fl.straightLegMm;
    const bendMid1 = fl.bendAllowanceMm * 0.5;

    if (fl.edge === '+x' || fl.edge === '-x') {
      const sx = fl.edge === '+x' ? 1 : -1;
      const anchorX = sx > 0 ? layout.baseXMax : layout.baseXMin;
      const zCenter = layout.baseCenterZ + fl.offsetMm;
      const z0 = zCenter - fl.spanMm * 0.5;
      const z1 = zCenter + fl.spanMm * 0.5;
      const x1 = anchorX + sx * stage1Span;

      flangeRects.push({
        id: `flange_${fl.index}_s1`,
        xMin: Math.min(anchorX, x1),
        xMax: Math.max(anchorX, x1),
        zMin: z0,
        zMax: z1,
        stage: 1,
      });

      const bendX1 = anchorX + sx * bendMid1;
      bendLines.push({
        id: `bend_${fl.index}_s1`,
        edge: fl.edge,
        stage: 1,
        startMm: [Number(bendX1.toFixed(2)), Number(z0.toFixed(2))],
        endMm: [Number(bendX1.toFixed(2)), Number(z1.toFixed(2))],
        angleDeg: fl.angleDeg,
        bendRadiusMm: Number(fl.bendRadiusMm.toFixed(2)),
        bendAllowanceMm: Number(fl.bendAllowanceMm.toFixed(2)),
        direction: dir1,
      });

      for (const h of fl.holes) {
        const legDist = Math.max(0, h.vMm - fl.setbackMm);
        holes2D.push({
          x: Number((anchorX + sx * (fl.bendAllowanceMm + legDist)).toFixed(2)),
          z: Number((zCenter + h.uMm).toFixed(2)),
          diameterMm: h.diameterMm,
        });
      }

      minX = Math.min(minX, anchorX, x1);
      maxX = Math.max(maxX, anchorX, x1);
      minZ = Math.min(minZ, z0);
      maxZ = Math.max(maxZ, z1);

      if (fl.returnFlange) {
        const ret = fl.returnFlange;
        totalBendAllowanceMm += ret.bendAllowanceMm;
        const stage2Span = ret.bendAllowanceMm + ret.straightLegMm;
        const x2 = x1 + sx * stage2Span;
        const bendX2 = x1 + sx * (ret.bendAllowanceMm * 0.5);
        const effDir: 'UP' | 'DOWN' = fl.sign * ret.sign >= 0 ? 'UP' : 'DOWN';

        flangeRects.push({
          id: `flange_${fl.index}_s2`,
          xMin: Math.min(x1, x2),
          xMax: Math.max(x1, x2),
          zMin: z0,
          zMax: z1,
          stage: 2,
        });
        bendLines.push({
          id: `bend_${fl.index}_s2`,
          edge: fl.edge,
          stage: 2,
          startMm: [Number(bendX2.toFixed(2)), Number(z0.toFixed(2))],
          endMm: [Number(bendX2.toFixed(2)), Number(z1.toFixed(2))],
          angleDeg: ret.angleDeg,
          bendRadiusMm: Number(ret.bendRadiusMm.toFixed(2)),
          bendAllowanceMm: Number(ret.bendAllowanceMm.toFixed(2)),
          direction: effDir,
        });
        minX = Math.min(minX, x2);
        maxX = Math.max(maxX, x2);
      }
    } else {
      const sz = fl.edge === '+z' ? 1 : -1;
      const anchorZ = sz > 0 ? layout.baseZMax : layout.baseZMin;
      const xCenter = layout.baseCenterX + fl.offsetMm;
      const x0 = xCenter - fl.spanMm * 0.5;
      const x1 = xCenter + fl.spanMm * 0.5;
      const z1 = anchorZ + sz * stage1Span;

      flangeRects.push({
        id: `flange_${fl.index}_s1`,
        xMin: x0,
        xMax: x1,
        zMin: Math.min(anchorZ, z1),
        zMax: Math.max(anchorZ, z1),
        stage: 1,
      });

      const bendZ1 = anchorZ + sz * bendMid1;
      bendLines.push({
        id: `bend_${fl.index}_s1`,
        edge: fl.edge,
        stage: 1,
        startMm: [Number(x0.toFixed(2)), Number(bendZ1.toFixed(2))],
        endMm: [Number(x1.toFixed(2)), Number(bendZ1.toFixed(2))],
        angleDeg: fl.angleDeg,
        bendRadiusMm: Number(fl.bendRadiusMm.toFixed(2)),
        bendAllowanceMm: Number(fl.bendAllowanceMm.toFixed(2)),
        direction: dir1,
      });

      for (const h of fl.holes) {
        const legDist = Math.max(0, h.vMm - fl.setbackMm);
        holes2D.push({
          x: Number((xCenter + h.uMm).toFixed(2)),
          z: Number((anchorZ + sz * (fl.bendAllowanceMm + legDist)).toFixed(2)),
          diameterMm: h.diameterMm,
        });
      }

      minX = Math.min(minX, x0);
      maxX = Math.max(maxX, x1);
      minZ = Math.min(minZ, anchorZ, z1);
      maxZ = Math.max(maxZ, anchorZ, z1);

      if (fl.returnFlange) {
        const ret = fl.returnFlange;
        totalBendAllowanceMm += ret.bendAllowanceMm;
        const stage2Span = ret.bendAllowanceMm + ret.straightLegMm;
        const z2 = z1 + sz * stage2Span;
        const bendZ2 = z1 + sz * (ret.bendAllowanceMm * 0.5);
        const effDir: 'UP' | 'DOWN' = fl.sign * ret.sign >= 0 ? 'UP' : 'DOWN';

        flangeRects.push({
          id: `flange_${fl.index}_s2`,
          xMin: x0,
          xMax: x1,
          zMin: Math.min(z1, z2),
          zMax: Math.max(z1, z2),
          stage: 2,
        });
        bendLines.push({
          id: `bend_${fl.index}_s2`,
          edge: fl.edge,
          stage: 2,
          startMm: [Number(x0.toFixed(2)), Number(bendZ2.toFixed(2))],
          endMm: [Number(x1.toFixed(2)), Number(bendZ2.toFixed(2))],
          angleDeg: ret.angleDeg,
          bendRadiusMm: Number(ret.bendRadiusMm.toFixed(2)),
          bendAllowanceMm: Number(ret.bendAllowanceMm.toFixed(2)),
          direction: effDir,
        });
        minZ = Math.min(minZ, z2);
        maxZ = Math.max(maxZ, z2);
      }
    }
  }

  return {
    thicknessMm: Number(layout.thicknessMm.toFixed(2)),
    kFactor: Number(layout.kFactor.toFixed(3)),
    flatWidthMm: Number((maxX - minX).toFixed(1)),
    flatDepthMm: Number((maxZ - minZ).toFixed(1)),
    baseWidthMm: Number(layout.baseWidthMm.toFixed(1)),
    baseDepthMm: Number(layout.baseDepthMm.toFixed(1)),
    bendCount: bendLines.length,
    totalBendAllowanceMm: Number(totalBendAllowanceMm.toFixed(2)),
    bendLines,
    flangeRects,
    holes2D,
  };
}

export interface BlueprintFlatPatternEntry {
  partId: string;
  partName: string;
  group: string;
  pattern: SheetMetalFlatPatternResult;
}

function findSheetMetalNodes(node: CsgNodeSpec | undefined, out: CsgNodeSpec[]): void {
  if (!node) return;
  if (node.op === 'sheetMetalFold' || node.op === 'sheetMetal') {
    out.push(node);
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) {
      findSheetMetalNodes(c, out);
    }
  }
}

/**
 * Extracts all developable sheet-metal flat patterns from a MeshBlueprint.
 */
export function collectBlueprintFlatPatterns(blueprint: MeshBlueprint | undefined | null): BlueprintFlatPatternEntry[] {
  if (!blueprint || !Array.isArray(blueprint.parts)) return [];
  const entries: BlueprintFlatPatternEntry[] = [];
  for (const part of blueprint.parts) {
    if (part.geometry.kind !== 'csgSolid') continue;
    const nodes: CsgNodeSpec[] = [];
    findSheetMetalNodes(part.geometry.csgRoot, nodes);
    nodes.forEach((node, idx) => {
      entries.push({
        partId: idx === 0 ? part.id : `${part.id}#${idx + 1}`,
        partName: idx === 0 ? part.name : `${part.name} (Sheet ${idx + 1})`,
        group: part.group,
        pattern: developSheetMetalFlatPattern(node),
      });
    });
  }
  return entries;
}

// ============================================================================
// MULTI-PLANE ORTHOGRAPHIC PLANAR LAYOUT SANITIZER & PRE-3D VERIFIER
// ============================================================================

function sanitizePolygon2D(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const pts: [number, number][] = [];
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 2) {
      const u = Number(p[0]);
      const v = Number(p[1]);
      if (Number.isFinite(u) && Number.isFinite(v)) {
        pts.push([Math.round(clamp(u, -20000, 20000)), Math.round(clamp(v, -20000, 20000))]);
      }
    }
  }
  return pts.length >= 3 ? pts : [];
}

function zoneToRectPolygon(zone: OrchestratorSubAssemblyZone, plane: DatumPlaneKind): [number, number][] {
  const { min, max } = zone.boundsMm;
  if (plane === 'XY') {
    return [
      [min[0], min[1]],
      [max[0], min[1]],
      [max[0], max[1]],
      [min[0], max[1]],
    ];
  }
  if (plane === 'YZ') {
    return [
      [min[2], min[1]],
      [max[2], min[1]],
      [max[2], max[1]],
      [min[2], max[1]],
    ];
  }
  // XZ
  return [
    [min[0], min[2]],
    [max[0], min[2]],
    [max[0], max[2]],
    [min[0], max[2]],
  ];
}

function zonePlaneDepthAndOffset(
  zone: OrchestratorSubAssemblyZone,
  plane: DatumPlaneKind
): { offset: number; depth: number } {
  const { min, max } = zone.boundsMm;
  if (plane === 'XY') {
    return { offset: Math.round((min[2] + max[2]) * 0.5), depth: Math.max(4, Math.round(max[2] - min[2])) };
  }
  if (plane === 'YZ') {
    return { offset: Math.round((min[0] + max[0]) * 0.5), depth: Math.max(4, Math.round(max[0] - min[0])) };
  }
  return { offset: Math.round((min[1] + max[1]) * 0.5), depth: Math.max(4, Math.round(max[1] - min[1])) };
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function computePolygonBounds2D(poly: [number, number][]): {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
} {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [u, v] of poly) {
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return { minU, maxU, minV, maxV };
}

function computePlaneCoveragePct(
  profiles: PlanarSketchProfile[],
  rectMinU: number,
  rectMaxU: number,
  rectMinV: number,
  rectMaxV: number
): number {
  if (profiles.length === 0) return 0;
  const grid = 28;
  const spanU = Math.max(1, rectMaxU - rectMinU);
  const spanV = Math.max(1, rectMaxV - rectMinV);
  let covered = 0;
  for (let gx = 0; gx < grid; gx++) {
    const u = rectMinU + ((gx + 0.5) / grid) * spanU;
    for (let gy = 0; gy < grid; gy++) {
      const v = rectMinV + ((gy + 0.5) / grid) * spanV;
      for (const p of profiles) {
        if (pointInPolygon(u, v, p.polygonMm)) {
          covered++;
          break;
        }
      }
    }
  }
  return Number(((covered / (grid * grid)) * 100).toFixed(1));
}

function sanitizePlaneProfiles(
  rawList: unknown,
  plane: DatumPlaneKind,
  zones: OrchestratorSubAssemblyZone[]
): PlanarSketchProfile[] {
  const zoneMap = new Map(zones.map((z) => [z.id, z]));
  const out: PlanarSketchProfile[] = [];
  const coveredZones = new Set<string>();

  if (Array.isArray(rawList)) {
    rawList.slice(0, 24).forEach((item: any, idx: number) => {
      const poly = sanitizePolygon2D(item?.polygonMm);
      if (poly.length < 3) return;
      const matchedZone =
        typeof item?.zoneId === 'string' && zoneMap.has(item.zoneId)
          ? zoneMap.get(item.zoneId)!
          : zones[Math.min(idx, zones.length - 1)];
      if (!matchedZone) return;
      const defaults = zonePlaneDepthAndOffset(matchedZone, plane);
      coveredZones.add(matchedZone.id);
      out.push({
        id:
          typeof item?.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `${plane.toLowerCase()}_${matchedZone.id}_${idx + 1}`,
        zoneId: matchedZone.id,
        label:
          typeof item?.label === 'string' && item.label.trim()
            ? item.label.trim()
            : `${matchedZone.name} (${plane})`,
        plane,
        planeOffsetMm: Number.isFinite(Number(item?.planeOffsetMm))
          ? Math.round(Number(item.planeOffsetMm))
          : defaults.offset,
        extrudeDepthMm: Math.max(
          2,
          Math.round(Number(item?.extrudeDepthMm) || defaults.depth)
        ),
        polygonMm: poly,
        isSheetMetal: item?.isSheetMetal !== undefined ? Boolean(item.isSheetMetal) : undefined,
      });
    });
  }

  // Ensure every zone has a deterministic orthographic projection on all 3 planes
  for (const zone of zones) {
    if (!coveredZones.has(zone.id)) {
      const defaults = zonePlaneDepthAndOffset(zone, plane);
      out.push({
        id: `${plane.toLowerCase()}_${zone.id}_proj`,
        zoneId: zone.id,
        label: `${zone.name} (${plane})`,
        plane,
        planeOffsetMm: defaults.offset,
        extrudeDepthMm: defaults.depth,
        polygonMm: zoneToRectPolygon(zone, plane),
      });
    }
  }

  return out;
}

/**
 * Sanitizes Stage-1 multi-plane orthographic 2D sketches (Front XY, Side YZ, Top XZ),
 * auto-projects any omitted zone onto all 3 datum planes, and runs deterministic
 * Pre-3D Orthographic Verification (grounding, non-overlap, coverage %, envelope fit error %).
 */
export function sanitizeAndVerifyPlanarLayout(
  rawPlanar: any,
  zones: OrchestratorSubAssemblyZone[],
  envelopeMm: { width: number; height: number; depth: number }
): OrchestratorPlanarLayout {
  const frontElevationXY = sanitizePlaneProfiles(rawPlanar?.frontElevationXY, 'XY', zones);
  const sideProfileYZ = sanitizePlaneProfiles(rawPlanar?.sideProfileYZ, 'YZ', zones);
  const topPlanXZ = sanitizePlaneProfiles(rawPlanar?.topPlanXZ, 'XZ', zones);

  const halfW = envelopeMm.width * 0.5;
  const halfD = envelopeMm.depth * 0.5;

  const frontCoveragePct = computePlaneCoveragePct(frontElevationXY, -halfW, halfW, 0, envelopeMm.height);
  const sideCoveragePct = computePlaneCoveragePct(sideProfileYZ, -halfD, halfD, 0, envelopeMm.height);
  const topCoveragePct = computePlaneCoveragePct(topPlanXZ, -halfW, halfW, -halfD, halfD);

  // Measure aggregate planar union span vs target envelopeMm
  const xyBounds = frontElevationXY.map((p) => computePolygonBounds2D(p.polygonMm));
  const yzBounds = sideProfileYZ.map((p) => computePolygonBounds2D(p.polygonMm));
  const xzBounds = topPlanXZ.map((p) => computePolygonBounds2D(p.polygonMm));

  const minX = Math.min(...xyBounds.map((b) => b.minU), ...xzBounds.map((b) => b.minU));
  const maxX = Math.max(...xyBounds.map((b) => b.maxU), ...xzBounds.map((b) => b.maxU));
  const minY = Math.min(...xyBounds.map((b) => b.minV), ...yzBounds.map((b) => b.minV));
  const maxY = Math.max(...xyBounds.map((b) => b.maxV), ...yzBounds.map((b) => b.maxV));
  const minZ = Math.min(...yzBounds.map((b) => b.minU), ...xzBounds.map((b) => b.minV));
  const maxZ = Math.max(...yzBounds.map((b) => b.maxU), ...xzBounds.map((b) => b.maxV));

  const actualW = Number.isFinite(maxX - minX) ? Math.max(1, maxX - minX) : envelopeMm.width;
  const actualH = Number.isFinite(maxY - minY) ? Math.max(1, maxY - minY) : envelopeMm.height;
  const actualD = Number.isFinite(maxZ - minZ) ? Math.max(1, maxZ - minZ) : envelopeMm.depth;

  const errW = Math.abs(actualW - envelopeMm.width) / Math.max(1, envelopeMm.width);
  const errH = Math.abs(actualH - envelopeMm.height) / Math.max(1, envelopeMm.height);
  const errD = Math.abs(actualD - envelopeMm.depth) / Math.max(1, envelopeMm.depth);
  const envelopeFitErrorPct = Number((((errW + errH + errD) / 3) * 100).toFixed(1));

  const groundContactVerified = Number.isFinite(minY) && Math.abs(minY) <= 4;

  // Check pairwise 3-plane zone overlap (two zones overlap in 3D iff their projections overlap on XY, YZ, and XZ)
  const zoneRanges = zones.map((z) => {
    const zXY = frontElevationXY.filter((p) => p.zoneId === z.id).map((p) => computePolygonBounds2D(p.polygonMm));
    const zYZ = sideProfileYZ.filter((p) => p.zoneId === z.id).map((p) => computePolygonBounds2D(p.polygonMm));
    const zXZ = topPlanXZ.filter((p) => p.zoneId === z.id).map((p) => computePolygonBounds2D(p.polygonMm));
    return {
      id: z.id,
      minX: zXY.length ? Math.min(...zXY.map((b) => b.minU)) : z.boundsMm.min[0],
      maxX: zXY.length ? Math.max(...zXY.map((b) => b.maxU)) : z.boundsMm.max[0],
      minY: zXY.length ? Math.min(...zXY.map((b) => b.minV)) : z.boundsMm.min[1],
      maxY: zXY.length ? Math.max(...zXY.map((b) => b.maxV)) : z.boundsMm.max[1],
      minZ: zYZ.length ? Math.min(...zYZ.map((b) => b.minU)) : zXZ.length ? Math.min(...zXZ.map((b) => b.minV)) : z.boundsMm.min[2],
      maxZ: zYZ.length ? Math.max(...zYZ.map((b) => b.maxU)) : zXZ.length ? Math.max(...zXZ.map((b) => b.maxV)) : z.boundsMm.max[2],
    };
  });

  let planarZoneOverlapCount = 0;
  const notes: string[] = [];
  for (let i = 0; i < zoneRanges.length; i++) {
    for (let j = i + 1; j < zoneRanges.length; j++) {
      const a = zoneRanges[i];
      const b = zoneRanges[j];
      const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (ox > 2 && oy > 2 && oz > 2) {
        planarZoneOverlapCount++;
        notes.push(
          `3-plane overlap between ${a.id} & ${b.id} (${Math.round(ox)}×${Math.round(oy)}×${Math.round(oz)} mm)`
        );
      }
    }
  }

  if (!groundContactVerified) {
    notes.push(`Lowest elevation Y = ${Math.round(minY)} mm (expected 0 mm ground contact).`);
  }
  if (envelopeFitErrorPct > 18) {
    notes.push(`Planar union span deviates ${envelopeFitErrorPct}% from target envelope.`);
  }
  if (notes.length === 0) {
    notes.push(
      `3-view orthographic layout verified: Front ${frontCoveragePct}% · Side ${sideCoveragePct}% · Top ${topCoveragePct}% · Env ±${envelopeFitErrorPct}%.`
    );
  }

  const verification: OrthographicPlanVerification = {
    passed: groundContactVerified && planarZoneOverlapCount === 0 && envelopeFitErrorPct <= 18,
    frontCoveragePct,
    sideCoveragePct,
    topCoveragePct,
    planarZoneOverlapCount,
    groundContactVerified,
    envelopeFitErrorPct,
    notes,
  };

  return {
    frontElevationXY,
    sideProfileYZ,
    topPlanXZ,
    verification,
  };
}
