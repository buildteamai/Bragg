import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  BlueprintPart,
  MeshBlueprint,
  PartMaterialSpec,
} from '../src/types/blueprint';
import {
  OrchestratorInterfaceDatum,
  OrchestratorJobSnapshot,
  OrchestratorMode,
  OrchestratorSkeletonPlan,
  OrchestratorStageId,
  OrchestratorStageStatus,
  OrchestratorStartRequest,
  OrchestratorStepEvent,
  OrchestratorSubAssemblyZone,
  OrchestratorWorkerState,
  VisualCriticRequest,
  VisualCriticResponse,
} from '../src/types/orchestrator';
import {
  applyDeterministicGeometryFixes,
  deduplicateParts,
  evaluateBlueprintInKernel,
  KernelEvaluationResult,
  sanitizeInterfaces,
  sanitizeMaterial,
  sanitizeModernPart,
  sanitizeSkeleton,
} from './cadKernelGate';
import { sanitizeAndVerifyPlanarLayout } from '../src/engine/planarDevelopment';
import {
  runConstellationQaGate,
  runConstellationSingleView,
} from './constellationBridge';
import type { ConstellationSpec } from '../src/types/constellation';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Add your key in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const status = (err as any)?.status ?? (err as any)?.code ?? (err as any)?.error?.code;
  return (
    status === 429 ||
    status === 503 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('TIMEOUT')
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`API_TIMEOUT: ${label} exceeded ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function extractJsonObject(raw: string): any {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  const sliced = first !== -1 && last > first ? candidate.slice(first, last + 1) : candidate;
  return JSON.parse(sliced);
}

async function generateJsonResilient(
  ai: GoogleGenAI,
  params: {
    contents: any;
    systemInstruction: string;
    thinkingLevel?: ThinkingLevel;
    timeoutMs?: number;
    label: string;
  }
): Promise<any> {
  const timeoutMs = params.timeoutMs ?? 65_000;
  const baseConfig: Record<string, any> = {
    systemInstruction: params.systemInstruction,
    responseMimeType: 'application/json',
  };
  const primaryConfig = params.thinkingLevel
    ? { ...baseConfig, thinkingConfig: { thinkingLevel: params.thinkingLevel } }
    : baseConfig;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model: PRIMARY_MODEL,
          contents: params.contents,
          config: primaryConfig,
        }),
        timeoutMs,
        `${PRIMARY_MODEL} ${params.label}`
      );
      const text = (res.text ?? '').trim();
      if (!text) throw new Error(`${params.label} returned an empty response.`);
      return extractJsonObject(text);
    } catch (err) {
      lastErr = err;
      if (isRetryable(err) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!isRetryable(err)) break;
    }
  }

  // Resilient fallback to gemini-3.1-flash-lite on transient primary saturation
  if (isRetryable(lastErr)) {
    const res = await withTimeout(
      ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents: params.contents,
        config: baseConfig,
      }),
      timeoutMs,
      `${FALLBACK_MODEL} ${params.label}`
    );
    const text = (res.text ?? '').trim();
    if (!text) throw new Error(`${params.label} fallback returned an empty response.`);
    return extractJsonObject(text);
  }

  throw lastErr instanceof Error ? lastErr : new Error(`${params.label} failed.`);
}

const CSG_18D_PRIMER = `18D WATERTIGHT MANIFOLD-3D CSG CONTRACT (MILLIMETERS, Y=0 GROUND, +Y UP, +X RIGHT, +Z FRONT):
- Build EVERY mechanical/structural part with "geometry": { "kind": "csgSolid", "smoothSharpAngleDeg": 42, "csgRoot": { ... } }.
- Supported csgRoot ops:
  1. Primitives: "box" (width, height, depth, chamferMm?), "cylinder" (radius or radiusTop/radiusBottom, height, radialSegments), "sphere" (radius, radialSegments).
  2. Extrusion, Loft & Sculptural Blending: "polygonExtrude" (polygonPoints: [[x,y],...], polygonHoles?: [[[x,y],...]], depth), "revolve" (lathePoints: [[r,y],...], arcDeg), "sweep" (radius or profilePoints, pathPoints: [[x,y,z],...], pathMode: "polyline"|"spline", cornerMode: "bend"|"miter", bendRadiusMm), "superellipseLoft" (loftAxis: "x"|"y"|"z", superellipseStations: [{posMm, offsetU?, offsetV?, halfA, halfB, exponent?: 2.6}]), "blendedBoss" (radius, height, sinkDepthMm, baseFlareMm, rimMarginMm), "blendedCowl" (radius, height, baseFlareMm, cowlDirection: "down"|"up", throatOffsetMm?, throatHalfWidthMm?, throatHalfHeightMm?), "conformalPatch" (width, height, thicknessMm, curveRadiusUMm?, curveRadiusVMm?), "shellWall" (wallThickness: 2..6, shellOpenFace?: "none"|"+x"|"-x"|"+y"|"-y"|"+z"|"-z", children: [solid] — hollows any enclosure for true wall thickness), "panelSeam" (seamAxis: "x"|"y"|"z", seamOffsetMm?, seamWidthMm?: 1.4, seamDepthMm?: 1.6, children: [solid] — carves crisp clamshell parting grooves across curved shells).
  3. Engineering Feature Nodes: "machinedBlock" (width, height, depth, chamferMm, pockets, holes), "sheetMetalFold" (planar blank width, depth, thicknessMm, kFactor: 0.42, baseHoles?: [{x,z,diameterMm}], foldFlanges: [{edge: "+x"|"-x"|"+z"|"-z", flangeLengthMm, angleDeg: -165..165, bendRadiusMm, widthMm?, offsetMm?, reliefWidthMm?, holes?: [{uMm,vMm,diameterMm}], returnFlange?: {flangeLengthMm, angleDeg, bendRadiusMm}}]), "sheetMetal" (legacy 90° enclosure), "turnedShaft" (shaftSections, shaftAxis), "involuteGear" (moduleMm, teeth, faceWidthMm, boreDiameterMm, gearAxis), "structuralBeam" (profileType: "iBeam"|"cChannel"|"tSlot8020"|"angleIron"|"squareTube"|"roundTube", width, height, beamLengthMm, flangeThicknessMm, webThicknessMm), "ballBearing" (innerDiaMm, outerDiaMm, width, bearingAxis), "boltedFlange" (radius, height, boreRadiusMm, boltCircleRadiusMm, boltHoleRadiusMm, boltCount).
  4. Booleans & Mirroring: "union", "subtract" (children[0] minus children[1..n]), "intersect", "hull" — each child may specify translateMm: [x,y,z], rotateDeg: [rx,ry,rz], and mirrorAxis?: "x"|"y"|"z".
  5. Compiler-Level Symmetry & Patterning (on BlueprintPart — saves tokens & guarantees mathematical symmetry):
     * "mirrorAcross": { "axis": "x"|"z", "planeOffsetMm"?: 0, "swapLeftRightName"?: true, "mirrorGeometry"?: false } — automatically spawns the exact mirrored twin with reflected position, rotation, and optional watertight CSG mirror!
     * "pattern": { "kind": "linear", "count": N, "stepMm": [dx,dy,dz] } OR { "kind": "polar", "count": N, "axis": "x"|"y"|"z", "centerMm": [cx,cy,cz], "totalAngleDeg"?: 360, "rotateInstances"?: true }.
  6. Certified engineeringLibrary shorthand inside csgRoot: { "libraryPreset": { "kind": "anchoredShsColumn"|"diagonalXBrace"|"hollowCChannelSubframe"|"naammBarGratingDeck"|"diamondPlateDeck"|"endGuardrailFrame"|"sideGuardrailPanel"|"foldedStairStringer"|"barGratingStairTread"|"groovedStairNosing"|"diamondPlateStairTread"|"gooseneckStairHandrail", "params": { ... } } }.
- WORKED WATERTIGHT FEATURE RECIPES (USE REAL CAD FEATURES, NOT PLAIN BOXES):
  * Bolster / mounting plate: { "op": "machinedBlock", "width": 420, "height": 45, "depth": 320, "chamferMm": 4, "holes": [{ "x": -170, "y": 0, "z": -120, "axis": "y", "diameterMm": 16, "depthMm": 50, "counterboreDiaMm": 26, "counterboreDepthMm": 12 }] }
  * Sculpted aerodynamic body / chassis loft: { "op": "superellipseLoft", "loftAxis": "x", "superellipseStations": [{ "posMm": -220, "offsetU": 0, "halfA": 52, "halfB": 68, "exponent": 2.8 }, { "posMm": 0, "offsetU": 8, "halfA": 68, "halfB": 92, "exponent": 3.0 }, { "posMm": 210, "offsetU": 4, "halfA": 44, "halfB": 62, "exponent": 2.5 }] }
  * Curved flank badge / vent bezel (zero lifted corners): { "op": "conformalPatch", "width": 54, "height": 22, "thicknessMm": 2.4, "curveRadiusUMm": 160 }
  * Folded sheet-metal shroud / drip pan / bracket (developable 2D flat pattern): { "op": "sheetMetalFold", "width": 640, "depth": 480, "thicknessMm": 4, "kFactor": 0.42, "baseHoles": [{ "x": 0, "z": 0, "diameterMm": 42 }], "foldFlanges": [{ "edge": "+x", "flangeLengthMm": 120, "angleDeg": 90, "bendRadiusMm": 6, "returnFlange": { "flangeLengthMm": 28, "angleDeg": 90 } }, { "edge": "-x", "flangeLengthMm": 120, "angleDeg": 90, "bendRadiusMm": 6, "returnFlange": { "flangeLengthMm": 28, "angleDeg": 90 } }] }
  * Gusseted C-frame / web plate: { "op": "polygonExtrude", "depth": 32, "polygonPoints": [[-200,-300],[200,-300],[200,-120],[40,-120],[40,140],[200,140],[200,300],[-200,300]], "polygonHoles": [[[-140,-40],[-40,-40],[-40,40],[-140,40]]] }
  * Mandrel-bent pipe / handrail: { "op": "sweep", "radius": 21, "pathMode": "polyline", "cornerMode": "bend", "bendRadiusMm": 65, "pathPoints": [[0,0,0],[0,420,0],[340,420,0],[340,0,0]] }
  * Turned hydraulic piston / pulley: { "op": "turnedShaft", "shaftAxis": "y", "shaftSections": [{ "lengthMm": 120, "diameterMm": 90, "chamferStartMm": 3 }, { "lengthMm": 260, "diameterMm": 52, "chamferEndMm": 2 }] }
- CRITICAL CLEARANCE & GROUNDING RULES (VERIFIED BY EXACT MANIFOLD-3D BOOLEANS):
  * NEVER let two distinct parts overlap in 3D space! Leave a clean 0.5 mm to 2.0 mm mating clearance or butt faces cleanly (0.0 mm overlap).
  * Every part resting on the floor MUST have its bottom at Y = 0 and set "anchorKind": "floor", "constraint": { "kind": "sitOnGround", "groundYMm": 0 }.
  * Every elevated part MUST touch (gap <= 1.5 mm) a grounded part or support chain so ZERO parts float in mid-air.
  * CURVED-SURFACE BLENDING & SLOPE-NORMAL CONTRACT (ENFORCED BY EXACT TRIANGLE-SURFACE AUDIT — ZERO UNBLENDED MOUNTS):
    1. NEVER mount a sensor pod, LiDAR dome, GPS/IMU puck, bezel, camera housing, cap, or badge directly onto a curved/lofted/sloped host shell! Doing so creates hovering air-gaps inside the host AABB or cantilevered rim-skew that FAILS the kernel gate.
    2. ALWAYS mold a concentric filleted landing boss ("blendedBoss") or vertical cowl ("blendedCowl") into the host CSG (or declare a top-level "blendedMount" interface contract), then subtract a flat landing cutter at the exact mating plane. For flush curved side badges/vents, use "conformalPatch".
    3. Mount the mating cap/pod/dome concentrically on that flat landing plane with a uniform 0.5..0.8 mm hairline parting seam around 100% of its perimeter (maxRimGapMm <= 2.5 mm).
    4. RIGHT-HAND SLOPE ROTATION LAW (NEVER FLIP THE SIGN): For a top surface rising from [x1, y1] to [x2, y2] with dx = x2 - x1 > 0, the surface-normal tilt is ALWAYS rotateDeg: [0, 0, +atan2(dy, dx) * 180/pi] (POSITIVE rz when dy > 0, NEGATIVE rz when dy < 0). For a YZ slope rising toward +Z (dy/dz > 0), rotateDeg: [-atan2(dy, dz) * 180/pi, 0, 0].
  * PBR Material Discipline: Painted enamel/epoxy uses metalness 0.05..0.12, roughness 0.24..0.34, clearcoat 0.35..0.55, textureKind "none" (smooth, never noisy). Bare steel/aluminum/chrome uses metalness 0.85..0.94, roughness 0.14..0.34, textureKind "brushedMetal" or "none".`;

function buildImageInlinePart(imageBase64?: string, mimeType?: string) {
  if (!imageBase64 || !imageBase64.trim()) return null;
  const clean = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64.trim();
  const safeMime = mimeType && mimeType.startsWith('image/') ? mimeType : 'image/png';
  return {
    inlineData: {
      mimeType: safeMime,
      data: clean,
    },
  };
}

function sanitizeSkeletonPlan(raw: any, workerCount: number, targetWidthMm?: number): OrchestratorSkeletonPlan {
  const envRaw = raw?.envelopeMm || {};
  let width = Math.max(80, Math.min(20000, Number(envRaw.width) || targetWidthMm || 1200));
  let height = Math.max(80, Math.min(20000, Number(envRaw.height) || 950));
  let depth = Math.max(80, Math.min(20000, Number(envRaw.depth) || 850));

  if (targetWidthMm && targetWidthMm > 20 && Math.abs(width - targetWidthMm) / width > 0.05) {
    const scale = targetWidthMm / width;
    width = Math.round(targetWidthMm);
    height = Math.round(height * scale);
    depth = Math.round(depth * scale);
  }

  const materialPalette: Record<string, PartMaterialSpec> = {};
  if (raw?.materialPalette && typeof raw.materialPalette === 'object') {
    for (const [key, val] of Object.entries(raw.materialPalette)) {
      if (key.trim()) {
        materialPalette[key.trim()] = sanitizeMaterial(val);
      }
    }
  }
  if (Object.keys(materialPalette).length === 0) {
    materialPalette.primaryFrame = sanitizeMaterial({
      colorHex: '#3e4752',
      metalness: 0.1,
      roughness: 0.3,
      clearcoat: 0.42,
      textureKind: 'none',
      finishName: 'Industrial Slate Enamel',
    });
    materialPalette.machinedSteel = sanitizeMaterial({
      colorHex: '#c8d0da',
      metalness: 0.88,
      roughness: 0.24,
      textureKind: 'brushedMetal',
      finishName: 'CNC Machined Steel',
    });
  }

  const rawZones: any[] = Array.isArray(raw?.zones) ? raw.zones : [];
  const clampedCount = Math.max(2, Math.min(4, workerCount));
  let zones: OrchestratorSubAssemblyZone[] = rawZones.slice(0, clampedCount).map((z, idx) => {
    const min = Array.isArray(z?.boundsMm?.min) && z.boundsMm.min.length >= 3
      ? [Number(z.boundsMm.min[0]) || 0, Number(z.boundsMm.min[1]) || 0, Number(z.boundsMm.min[2]) || 0]
      : [-width / 2, 0, -depth / 2];
    const max = Array.isArray(z?.boundsMm?.max) && z.boundsMm.max.length >= 3
      ? [Number(z.boundsMm.max[0]) || 0, Number(z.boundsMm.max[1]) || 0, Number(z.boundsMm.max[2]) || 0]
      : [width / 2, height, depth / 2];
    return {
      id: typeof z?.id === 'string' && z.id.trim() ? z.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : `zone_${idx + 1}`,
      name: typeof z?.name === 'string' && z.name.trim() ? z.name.trim() : `Sub-Assembly ${idx + 1}`,
      group: typeof z?.group === 'string' && z.group.trim() ? z.group.trim() : `Sub-Assembly ${idx + 1}`,
      boundsMm: {
        min: [Math.min(min[0], max[0]), Math.min(min[1], max[1]), Math.min(min[2], max[2])],
        max: [Math.max(min[0], max[0]), Math.max(min[1], max[1]), Math.max(min[2], max[2])],
      },
      targetPartCount: Math.max(3, Math.min(12, Math.round(Number(z?.targetPartCount) || 6))),
      interfacePorts: Array.isArray(z?.interfacePorts)
        ? z.interfacePorts.map(String).slice(0, 8)
        : [],
      libraryHints: Array.isArray(z?.libraryHints)
        ? z.libraryHints.map(String).slice(0, 6)
        : [],
      summary: typeof z?.summary === 'string' ? z.summary.trim() : 'Primary mechanical sub-assembly.',
    };
  });

  if (zones.length < 2) {
    zones = [
      {
        id: 'base_structure',
        name: 'Base & Frame Structure',
        group: 'Base & Frame',
        boundsMm: { min: [-width / 2, 0, -depth / 2], max: [width / 2, Math.round(height * 0.45), depth / 2] },
        targetPartCount: 6,
        interfacePorts: ['top_deck_datum'],
        libraryHints: [],
        summary: 'Grounded chassis, support columns, and primary load-bearing frame.',
      },
      {
        id: 'upper_mechanism',
        name: 'Upper Mechanism & Controls',
        group: 'Upper Assembly',
        boundsMm: { min: [-width / 2, Math.round(height * 0.45) + 1, -depth / 2], max: [width / 2, height, depth / 2] },
        targetPartCount: 6,
        interfacePorts: ['top_deck_datum'],
        libraryHints: [],
        summary: 'Working head, actuation hardware, guarding, and operator controls.',
      },
    ];
  }

  // Programmatically enforce strict non-overlap between all parallel worker zones (1.0 mm clearance margin)
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i].boundsMm;
      const b = zones[j].boundsMm;
      const ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
      const oy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
      const oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
      if (ox > -0.5 && oy > -0.5 && oz > -0.5) {
        const axes = [
          { idx: 0 as const, ov: ox },
          { idx: 1 as const, ov: oy },
          { idx: 2 as const, ov: oz },
        ].sort((u, v) => u.ov - v.ov);
        const ax = axes[0].idx;
        const aCenter = (a.min[ax] + a.max[ax]) * 0.5;
        const bCenter = (b.min[ax] + b.max[ax]) * 0.5;
        const split = Number(((Math.max(a.min[ax], b.min[ax]) + Math.min(a.max[ax], b.max[ax])) * 0.5).toFixed(1));
        if (aCenter <= bCenter) {
          a.max[ax] = Math.max(a.min[ax] + 10, Number((split - 0.5).toFixed(1)));
          b.min[ax] = Math.min(b.max[ax] - 10, Number((split + 0.5).toFixed(1)));
        } else {
          b.max[ax] = Math.max(b.min[ax] + 10, Number((split - 0.5).toFixed(1)));
          a.min[ax] = Math.min(a.max[ax] - 10, Number((split + 0.5).toFixed(1)));
        }
      }
    }
  }

  // Ensure at least one zone touches the ground plane Y=0
  const minZoneY = Math.min(...zones.map((z) => z.boundsMm.min[1]));
  if (minZoneY > 1) {
    const lowestIdx = zones.reduce(
      (best, z, idx) => (z.boundsMm.min[1] < zones[best].boundsMm.min[1] ? idx : best),
      0
    );
    zones[lowestIdx].boundsMm.min[1] = 0;
  }

  const zoneIdSet = new Set(zones.map((z) => z.id));
  const rawDatums: any[] = Array.isArray(raw?.interfaceDatums) ? raw.interfaceDatums : [];
  const interfaceDatums: OrchestratorInterfaceDatum[] = rawDatums
    .slice(0, 12)
    .filter((d) => d && typeof d.id === 'string' && Array.isArray(d.positionMm) && d.positionMm.length >= 3)
    .map((d, idx) => {
      const cz = Array.isArray(d.connectsZones) && d.connectsZones.length >= 2
        ? [String(d.connectsZones[0]), String(d.connectsZones[1])] as [string, string]
        : [zones[0].id, zones[Math.min(1, zones.length - 1)].id] as [string, string];
      const safeZones: [string, string] = [
        zoneIdSet.has(cz[0]) ? cz[0] : zones[0].id,
        zoneIdSet.has(cz[1]) ? cz[1] : zones[Math.min(1, zones.length - 1)].id,
      ];
      return {
        id: d.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || `datum_${idx + 1}`,
        positionMm: [
          Number(d.positionMm[0]) || 0,
          Number(d.positionMm[1]) || 0,
          Number(d.positionMm[2]) || 0,
        ],
        normal:
          Array.isArray(d.normal) && d.normal.length >= 3
            ? [Number(d.normal[0]) || 0, Number(d.normal[1]) || 1, Number(d.normal[2]) || 0]
            : [0, 1, 0],
        matingClearanceMm: Math.max(0, Math.min(10, Number(d.matingClearanceMm ?? 1.0))),
        connectsZones: safeZones,
      };
    });

  // Auto-derive inter-zone boundary datums if planner omitted them
  if (interfaceDatums.length === 0 && zones.length >= 2) {
    for (let i = 0; i < zones.length - 1; i++) {
      const a = zones[i];
      const b = zones[i + 1];
      interfaceDatums.push({
        id: `datum_${a.id}_to_${b.id}`,
        positionMm: [
          Math.round((Math.max(a.boundsMm.min[0], b.boundsMm.min[0]) + Math.min(a.boundsMm.max[0], b.boundsMm.max[0])) * 0.5) || 0,
          Math.round((a.boundsMm.max[1] + b.boundsMm.min[1]) * 0.5),
          Math.round((Math.max(a.boundsMm.min[2], b.boundsMm.min[2]) + Math.min(a.boundsMm.max[2], b.boundsMm.max[2])) * 0.5) || 0,
        ],
        normal: [0, 1, 0],
        matingClearanceMm: 1.0,
        connectsZones: [a.id, b.id],
      });
    }
  }

  const maxSpan = Math.max(width, height, depth);
  const camTarget: [number, number, number] =
    Array.isArray(raw?.photoMatchCamera?.targetMm) && raw.photoMatchCamera.targetMm.length >= 3
      ? [
          Number(raw.photoMatchCamera.targetMm[0]) || 0,
          Number(raw.photoMatchCamera.targetMm[1]) || height * 0.48,
          Number(raw.photoMatchCamera.targetMm[2]) || 0,
        ]
      : [0, Math.round(height * 0.48), 0];

  const camPos: [number, number, number] =
    Array.isArray(raw?.photoMatchCamera?.positionMm) && raw.photoMatchCamera.positionMm.length >= 3
      ? [
          Number(raw.photoMatchCamera.positionMm[0]) || -Math.round(maxSpan * 1.15),
          Number(raw.photoMatchCamera.positionMm[1]) || Math.round(height * 0.95),
          Number(raw.photoMatchCamera.positionMm[2]) || Math.round(maxSpan * 1.65),
        ]
      : [-Math.round(maxSpan * 1.15), Math.round(height * 0.95), Math.round(maxSpan * 1.65)];

  const planarLayout = sanitizeAndVerifyPlanarLayout(raw?.planarLayout, zones, {
    width,
    height,
    depth,
  });

  return {
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Orchestrated CAD Assembly',
    category: typeof raw?.category === 'string' && raw.category.trim() ? raw.category.trim() : 'Industrial Machinery',
    summary:
      typeof raw?.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : 'Multi-agent Manifold-3D CAD assembly compiled from locked master skeleton datums.',
    envelopeMm: { width, height, depth },
    symmetryPlane: ['none', 'X', 'Z', 'radial'].includes(raw?.symmetryPlane) ? raw.symmetryPlane : 'none',
    photoMatchCamera: {
      positionMm: camPos,
      targetMm: camTarget,
      fov: Math.max(26, Math.min(44, Number(raw?.photoMatchCamera?.fov) || 34)),
    },
    skeleton: sanitizeSkeleton(raw?.skeleton) ?? {
      params: { envelopeWidthMm: width, envelopeHeightMm: height, envelopeDepthMm: depth },
      planes: [{ id: 'ground', label: 'Floor Plane', originMm: [0, 0, 0], normal: [0, 1, 0] }],
    },
    materialPalette,
    zones,
    interfaceDatums,
    planarLayout,
  };
}

interface InternalJobRecord {
  snapshot: OrchestratorJobSnapshot;
  cancelled: boolean;
}

const orchestratorJobs = new Map<string, InternalJobRecord>();
const JOB_TTL_MS = 25 * 60 * 1000;

function pruneJobs() {
  const now = Date.now();
  for (const [id, rec] of orchestratorJobs.entries()) {
    if (now - rec.snapshot.startedAt > JOB_TTL_MS) {
      orchestratorJobs.delete(id);
    }
  }
}

function pushEvent(
  rec: InternalJobRecord,
  stage: OrchestratorStageId,
  status: OrchestratorStageStatus,
  title: string,
  detail: string,
  extra?: { worker?: string; durationMs?: number }
) {
  const ev: OrchestratorStepEvent = {
    id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    stage,
    status,
    title,
    detail,
    worker: extra?.worker,
    durationMs: extra?.durationMs,
  };
  rec.snapshot.events.push(ev);
  if (rec.snapshot.events.length > 60) {
    rec.snapshot.events = rec.snapshot.events.slice(-60);
  }
}

export function getOrchestratorJob(jobId: string): OrchestratorJobSnapshot | null {
  pruneJobs();
  const rec = orchestratorJobs.get(jobId);
  return rec ? rec.snapshot : null;
}

export function cancelOrchestratorJob(jobId: string): boolean {
  const rec = orchestratorJobs.get(jobId);
  if (!rec) return false;
  rec.cancelled = true;
  if (rec.snapshot.status === 'running') {
    rec.snapshot.status = 'cancelled';
    rec.snapshot.finishedAt = Date.now();
    pushEvent(rec, rec.snapshot.currentStage, 'warning', 'Run Cancelled', 'Stopped cleanly by user request.');
  }
  return true;
}

function assertNotCancelled(rec: InternalJobRecord) {
  if (rec.cancelled) {
    throw new Error('ORCHESTRATOR_CANCELLED');
  }
}

function applyScopedPatch(
  base: MeshBlueprint,
  patch: any,
  palette?: Record<string, PartMaterialSpec>
): { nextBlueprint: MeshBlueprint; upsertedCount: number; removedCount: number; fixSummary: string } {
  const removeIds = new Set<string>(
    Array.isArray(patch?.removePartIds) ? patch.removePartIds.map((s: any) => String(s)) : []
  );

  const partMap = new Map<string, BlueprintPart>();
  const orderedIds: string[] = [];
  for (const p of base.parts) {
    if (removeIds.has(p.id)) continue;
    partMap.set(p.id, structuredClone(p));
    orderedIds.push(p.id);
  }

  let upsertedCount = 0;
  const rawUpserts = Array.isArray(patch?.upsertParts) ? patch.upsertParts : [];
  for (let i = 0; i < rawUpserts.length; i++) {
    const raw = rawUpserts[i];
    if (!raw || typeof raw !== 'object') continue;
    const existing = typeof raw.id === 'string' ? partMap.get(raw.id) : undefined;
    // Allow partial position/rotation/geometry patches when modifying an existing part ID
    const mergedRaw = existing
      ? {
          ...existing,
          ...raw,
          geometry: raw.geometry ? raw.geometry : existing.geometry,
          material: raw.material ? { ...existing.material, ...raw.material } : existing.material,
        }
      : raw;
    const clean = sanitizeModernPart(
      mergedRaw,
      orderedIds.length + i,
      existing?.group ?? 'Repaired',
      palette
    );
    if (!partMap.has(clean.id)) {
      orderedIds.push(clean.id);
    }
    partMap.set(clean.id, clean);
    upsertedCount++;
  }

  const nextParts = orderedIds
    .map((id) => partMap.get(id))
    .filter((p): p is BlueprintPart => Boolean(p));

  const nextBlueprint: MeshBlueprint = {
    ...base,
    parts: nextParts,
    reconstructedAt: new Date().toISOString(),
  };

  return {
    nextBlueprint,
    upsertedCount,
    removedCount: removeIds.size,
    fixSummary:
      typeof patch?.fixSummary === 'string' && patch.fixSummary.trim()
        ? patch.fixSummary.trim()
        : `Updated ${upsertedCount} part(s), removed ${removeIds.size} part(s).`,
  };
}

function isBetterEvaluation(candidate: KernelEvaluationResult, best: KernelEvaluationResult): boolean {
  const c = candidate.gateSnapshot;
  const b = best.gateSnapshot;
  if (c.healthScore !== b.healthScore) return c.healthScore > b.healthScore;
  const cDefects =
    c.hardClashCount * 3 +
    c.warningClashCount +
    c.dynamicClashCount * 3 +
    c.floatingCount * 2 +
    c.occludedCount +
    (c.unblendedMountCount ?? 0) * 2;
  const bDefects =
    b.hardClashCount * 3 +
    b.warningClashCount +
    b.dynamicClashCount * 3 +
    b.floatingCount * 2 +
    b.occludedCount +
    (b.unblendedMountCount ?? 0) * 2;
  return cDefects < bDefects;
}

/**
 * Runs Stage 4 Scoped Auto-Repair Loop with deterministic Manifold-3D verification after every pass.
 * Keeps the highest-scoring blueprint monotonically so repairs never regress assembly health.
 */
async function runScopedRepairLoop(
  ai: GoogleGenAI,
  rec: InternalJobRecord,
  initialBlueprint: MeshBlueprint,
  initialEval: KernelEvaluationResult,
  options: {
    userDirective?: string;
    palette?: Record<string, PartMaterialSpec>;
    maxIterations: number;
    mediaPart?: any;
  }
): Promise<{ blueprint: MeshBlueprint; evaluation: KernelEvaluationResult }> {
  let bestBlueprint = initialBlueprint;
  let bestEval = initialEval;

  for (let iter = 1; iter <= options.maxIterations; iter++) {
    assertNotCancelled(rec);
    if (bestEval.gateSnapshot.passed) break;

    rec.snapshot.currentStage = 'repair';
    rec.snapshot.iteration = iter;
    rec.snapshot.progressPct = Math.min(92, 62 + Math.round((iter / (options.maxIterations + 1)) * 30));

    const iterStart = Date.now();
    const failingIds = new Set(bestEval.failingPartIds);

    // Scope context ONLY to failing parts (plus up to 6 closest context summaries)
    const failingParts = bestBlueprint.parts.filter((p) => failingIds.has(p.id)).slice(0, 18);
    const healthySummary = bestBlueprint.parts
      .filter((p) => !failingIds.has(p.id))
      .slice(0, 40)
      .map((p) => {
        const b = bestEval.partBoundsWorldMm[p.id];
        return b
          ? `${p.id} (${p.group}): X[${b.min[0]}..${b.max[0]}], Y[${b.min[1]}..${b.max[1]}], Z[${b.min[2]}..${b.max[2]}]`
          : `${p.id} (${p.group}) @ [${p.positionMm.join(',')}]`;
      })
      .join('\n');

    pushEvent(
      rec,
      'repair',
      'running',
      `Scoped Repair Pass ${iter}/${options.maxIterations}`,
      `Targeting ${failingParts.length} failing part(s) from ${bestEval.gateSnapshot.healthScore}/100 baseline.`
    );

    const repairPrompt = `You are 18D's Scoped CAD Geometry Repair Agent.
Fix ALL deterministic Manifold-3D kernel defects listed below by returning a minimal JSON patch.
Do NOT rewrite unrelated healthy parts — ONLY output modified/upgraded parts in "upsertParts" (preserving their exact "id" unless replacing) and optional "removePartIds".

${CSG_18D_PRIMER}

${options.userDirective ? `USER ENGINEERING DIRECTIVE: ${options.userDirective}\n` : ''}
${bestEval.defectSummaryForAgent}

FAILING PARTS FULL JSON (edit these to eliminate EVERY clash, float, burial, unblended curved-surface mount/rim-skew, and non-watertight mesh — when fixing [UNBLENDED AIR-GAP] or [UNBLENDED RIM SKEW], mold a concentric filleted landing boss/cowl into the host CSG and align the mounted part to the exact +atan2(dy, dx) surface slope with a 0.5..0.8 mm seam):
${JSON.stringify(failingParts, null, 2)}

HEALTHY NEIGHBOR WORLD BOUNDS (DO NOT COLLIDE WITH THESE):
${healthySummary || '(none)'}

REPAIR STRATEGY RULES:
- For any CLASH between partA and partB: check their exact X/Y/Z world bounding boxes above. Either shift/reposition the smaller or misaligned part clear by at least 1.5 mm, resize its dimension cleanly so faces butt with >= 0.5 mm clearance, OR convert to watertight "csgSolid" with an explicit Boolean "subtract" pocket/bore clearing the intersecting body.
- For any FLOATING part: lower its Y position or add/extend a grounded bracket/column so it touches its supporting surface with <= 1.0 mm gap; set anchorKind: "floor" + constraint: { kind: "sitOnGround", groundYMm: 0 } if it sits on Y = 0.
- For any BURIED part: move it outside the occluding housing flush against the exterior face (+1.0 mm proud).
- For any NON-WATERTIGHT CSG part: simplify/fix degenerate zero-thickness polygons or overlapping coplanar faces into clean watertight primitives/unions.

Return ONLY valid JSON:
{
  "fixSummary": "1-sentence summary of the exact coordinate/CSG changes made",
  "upsertParts": [ ...BlueprintPart objects... ],
  "removePartIds": []
}`;

    const contentParts: any[] = [];
    if (options.mediaPart) contentParts.push(options.mediaPart);
    contentParts.push({ text: repairPrompt });

    const patch = await generateJsonResilient(ai, {
      contents: contentParts.length === 1 ? repairPrompt : { parts: contentParts },
      systemInstruction:
        'You are a principal mechanical CAD repair engineer. Output ONLY a single valid JSON object matching { fixSummary, upsertParts, removePartIds } with zero markdown or prose.',
      thinkingLevel: ThinkingLevel.MEDIUM,
      timeoutMs: 70_000,
      label: `Stage 4 scoped repair pass ${iter}`,
    });

    assertNotCancelled(rec);

    const { nextBlueprint, upsertedCount, removedCount, fixSummary } = applyScopedPatch(
      bestBlueprint,
      patch,
      options.palette
    );

    rec.snapshot.currentStage = 'gate';
    let evaluatedBlueprint = nextBlueprint;
    let nextEval = await evaluateBlueprintInKernel(
      evaluatedBlueprint,
      iter,
      `After Repair Pass ${iter}`
    );

    // Run deterministic zero-token contact/grounding micro-solver if residual small defects remain
    if (!nextEval.gateSnapshot.passed) {
      const det = await applyDeterministicGeometryFixes(
        evaluatedBlueprint,
        nextEval,
        iter,
        `After Repair Pass ${iter} + Pre-Solver`
      );
      if (det.improved) {
        evaluatedBlueprint = det.blueprint;
        nextEval = det.evaluation;
      }
    }

    rec.snapshot.gateHistory.push(nextEval.gateSnapshot);

    const elapsedMs = Date.now() - iterStart;

    if (isBetterEvaluation(nextEval, bestEval) || nextEval.gateSnapshot.passed) {
      bestBlueprint = evaluatedBlueprint;
      bestEval = nextEval;
      pushEvent(
        rec,
        'repair',
        nextEval.gateSnapshot.passed ? 'passed' : 'repaired',
        `Repair Pass ${iter} Verified (${nextEval.gateSnapshot.healthScore}/100)`,
        `${fixSummary} (${upsertedCount} patched, ${removedCount} removed; clashes: ${nextEval.gateSnapshot.hardClashCount}H/${nextEval.gateSnapshot.warningClashCount}W, floating: ${nextEval.gateSnapshot.floatingCount}, acc: ${nextEval.gateSnapshot.accuracyMetrics?.accuracyScore ?? 0}/100).`,
        { durationMs: elapsedMs }
      );
    } else {
      pushEvent(
        rec,
        'repair',
        'warning',
        `Repair Pass ${iter} Reverted (Kept ${bestEval.gateSnapshot.healthScore}/100)`,
        `Candidate scored ${nextEval.gateSnapshot.healthScore}/100 vs best ${bestEval.gateSnapshot.healthScore}/100 — kept higher-scoring geometry.`,
        { durationMs: elapsedMs }
      );
    }
  }

  return { blueprint: bestBlueprint, evaluation: bestEval };
}

/**
 * Starts a non-blocking 4-Stage CAD Agent Orchestrator job.
 */
export function startOrchestratorJob(req: OrchestratorStartRequest): OrchestratorJobSnapshot {
  pruneJobs();

  const mode: OrchestratorMode = req.mode === 'auditAndUpgrade' ? 'auditAndUpgrade' : 'build';
  const maxRepairIterations = Math.max(0, Math.min(3, Math.round(req.maxRepairIterations ?? 3)));
  const workerCount = Math.max(2, Math.min(4, Math.round(req.workerCount ?? 3)));
  const jobId = `orch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const snapshot: OrchestratorJobSnapshot = {
    jobId,
    mode,
    status: 'running',
    currentStage: mode === 'build' ? 'skeleton' : 'gate',
    progressPct: 4,
    iteration: 0,
    maxRepairIterations,
    workers: [],
    gateHistory: [],
    events: [],
    startedAt: Date.now(),
  };

  const rec: InternalJobRecord = { snapshot, cancelled: false };
  orchestratorJobs.set(jobId, rec);

  void executeOrchestratorPipeline(rec, req, workerCount, maxRepairIterations).catch((err: any) => {
    if (err?.message === 'ORCHESTRATOR_CANCELLED' || rec.cancelled) {
      rec.snapshot.status = 'cancelled';
      rec.snapshot.finishedAt = Date.now();
      return;
    }
    console.error('[CAD Orchestrator] Pipeline error:', err);
    rec.snapshot.status = 'failed';
    rec.snapshot.error = err?.message || 'CAD orchestrator failed.';
    rec.snapshot.finishedAt = Date.now();
    pushEvent(
      rec,
      rec.snapshot.currentStage,
      'failed',
      'Pipeline Failed',
      rec.snapshot.error || 'Unexpected error.'
    );
  });

  return snapshot;
}

async function executeOrchestratorPipeline(
  rec: InternalJobRecord,
  req: OrchestratorStartRequest,
  workerCount: number,
  maxRepairIterations: number
): Promise<void> {
  const ai = getAiClient();
  const mediaPart = buildImageInlinePart(req.imageBase64, req.mimeType);

  if (req.mode === 'auditAndUpgrade') {
    if (!req.currentBlueprint || !Array.isArray(req.currentBlueprint.parts)) {
      throw new Error('auditAndUpgrade mode requires currentBlueprint.');
    }

    // Baseline Deterministic Manifold-3D Kernel Gate
    rec.snapshot.currentStage = 'gate';
    rec.snapshot.progressPct = 18;
    const t0 = Date.now();
    pushEvent(
      rec,
      'gate',
      'running',
      'Stage 3 — Baseline Manifold-3D Kernel Gate',
      `Evaluating ${req.currentBlueprint.parts.length} parts in Manifold-3D WASM...`
    );

    const baseEval = await evaluateBlueprintInKernel(req.currentBlueprint, 0, 'Baseline Audit');
    assertNotCancelled(rec);
    rec.snapshot.gateHistory.push(baseEval.gateSnapshot);
    rec.snapshot.progressPct = 36;

    pushEvent(
      rec,
      'gate',
      baseEval.gateSnapshot.passed ? 'passed' : 'warning',
      `Baseline Score: ${baseEval.gateSnapshot.healthScore}/100`,
      `Watertight CSG ${baseEval.gateSnapshot.watertightCsgCount}/${baseEval.gateSnapshot.totalCsgCount} · Clashes ${baseEval.gateSnapshot.hardClashCount}H/${baseEval.gateSnapshot.warningClashCount}W · Dynamic ${baseEval.gateSnapshot.dynamicClashCount} · Floating ${baseEval.gateSnapshot.floatingCount}.`,
      { durationMs: Date.now() - t0 }
    );

    let workingBp = req.currentBlueprint;
    let workingEval = baseEval;

    if (!workingEval.gateSnapshot.passed) {
      const det = await applyDeterministicGeometryFixes(
        workingBp,
        workingEval,
        0,
        'Deterministic Pre-Solver'
      );
      if (det.improved) {
        workingBp = det.blueprint;
        workingEval = det.evaluation;
        rec.snapshot.gateHistory.push(workingEval.gateSnapshot);
        pushEvent(
          rec,
          'gate',
          workingEval.gateSnapshot.passed ? 'passed' : 'repaired',
          `Pre-Solver Improved Gate -> ${workingEval.gateSnapshot.healthScore}/100`,
          `${det.appliedFixes.slice(0, 3).join('; ')} (${det.appliedFixes.length} deterministic fix(es), 0 LLM tokens).`
        );
      }
    }

    if (workingEval.gateSnapshot.passed && !req.prompt?.trim()) {
      rec.snapshot.blueprint = workingBp;
      rec.snapshot.finalAudit = workingEval.report;
      rec.snapshot.status = 'completed';
      rec.snapshot.progressPct = 100;
      rec.snapshot.finishedAt = Date.now();
      pushEvent(
        rec,
        'gate',
        'passed',
        workingBp === req.currentBlueprint
          ? 'Assembly Already Certified'
          : 'Certified by Deterministic Pre-Solver',
        'Zero clashes, zero floating parts, and watertight CSG — zero LLM repair tokens needed.'
      );
      return;
    }

    const { blueprint: repairedBp, evaluation: finalEval } = await runScopedRepairLoop(
      ai,
      rec,
      workingBp,
      workingEval,
      {
        userDirective: req.prompt?.trim(),
        maxIterations: Math.max(1, maxRepairIterations),
        mediaPart,
      }
    );

    assertNotCancelled(rec);

    rec.snapshot.blueprint = {
      ...repairedBp,
      id: `${req.currentBlueprint.id}-orch-${Date.now().toString(36)}`,
      name: req.currentBlueprint.name.includes('(Orchestrated)')
        ? req.currentBlueprint.name
        : `${req.currentBlueprint.name} (Orchestrated)`,
      isReferencePreset: false,
    };
    rec.snapshot.finalAudit = finalEval.report;
    rec.snapshot.status = 'completed';
    rec.snapshot.progressPct = 100;
    rec.snapshot.finishedAt = Date.now();
    pushEvent(
      rec,
      'gate',
      finalEval.gateSnapshot.passed ? 'passed' : 'warning',
      `Orchestrator Complete (${finalEval.gateSnapshot.healthScore}/100)`,
      `Health ${baseEval.gateSnapshot.healthScore} -> ${finalEval.gateSnapshot.healthScore}/100 across ${rec.snapshot.gateHistory.length - 1} repair pass(es).`
    );
    return;
  }

  // =========================================================================
  // MODE: 'build' (4-Stage Pipeline: Skeleton -> Parallel Builders -> Gate -> Scoped Repair)
  // =========================================================================
  const promptText = (req.prompt || '').trim();
  if (!promptText && !mediaPart) {
    throw new Error('Provide an engineering prompt or a reference photograph to run a build.');
  }

  // STAGE 0 (Optional): Architekton Constellation single_view pre-pass (marks.json -> spec.json)
  let constellationSpec: ConstellationSpec | undefined = req.constellationSpec;
  if (!constellationSpec && req.constellationMarks) {
    rec.snapshot.currentStage = 'constellation';
    rec.snapshot.progressPct = 5;
    const c0Start = Date.now();
    pushEvent(
      rec,
      'constellation',
      'running',
      'Stage 0 — Constellation Single-View Metrology',
      'Solving camera pose, vanishing points, scale anchors, and 95% dimension confidence intervals...'
    );
    try {
      constellationSpec = await runConstellationSingleView({
        marks: req.constellationMarks,
      });
      assertNotCancelled(rec);
      rec.snapshot.constellationSpec = constellationSpec;
      const envStr = constellationSpec.envelopeMm
        ? `${constellationSpec.envelopeMm.width}×${constellationSpec.envelopeMm.height}×${constellationSpec.envelopeMm.depth} mm`
        : 'envelope pending';
      pushEvent(
        rec,
        'constellation',
        constellationSpec.scaleCheck === 'conflict' ? 'warning' : 'passed',
        `Constellation Solved (${constellationSpec.dimensions.length} dims, ${envStr})`,
        `Scale: ${constellationSpec.scaleCheck || 'solved'} · Gaps: ${constellationSpec.gaps.length}${
          constellationSpec.focalObsSdPct !== undefined
            ? ` · Focal SD ${constellationSpec.focalObsSdPct.toFixed(1)}%`
            : ''
        }.`,
        { durationMs: Date.now() - c0Start }
      );
    } catch (err: any) {
      pushEvent(
        rec,
        'constellation',
        'warning',
        'Constellation Pre-Pass Skipped',
        err?.message || 'single_view solver unavailable; falling back to direct skeleton planning.',
        { durationMs: Date.now() - c0Start }
      );
    }
  } else if (constellationSpec) {
    rec.snapshot.constellationSpec = constellationSpec;
  }

  const solvedConstellationCam = req.constellationCamera || constellationSpec?.camera;
  const effectiveTargetWidthMm = req.targetWidthMm || constellationSpec?.envelopeMm?.width;

  const constellationPromptBlock = constellationSpec
    ? [
        '',
        'ARCHITEKTON CONSTELLATION METROLOGY SPEC (measured from photo with 95% confidence intervals — treat as authoritative bounds):',
        constellationSpec.envelopeMm
          ? `- Measured Envelope (mm): width=${constellationSpec.envelopeMm.width}, height=${constellationSpec.envelopeMm.height}, depth=${constellationSpec.envelopeMm.depth}`
          : '',
        constellationSpec.scaleCheck ? `- Scale Anchor Verdict: ${constellationSpec.scaleCheck}` : '',
        ...constellationSpec.dimensions.slice(0, 24).map((d) => {
          const ci =
            d.lo95Mm !== undefined && d.hi95Mm !== undefined
              ? ` [95% CI: ${d.lo95Mm}..${d.hi95Mm} mm]`
              : '';
          return `- ${d.name}: ${d.valueMm} mm${ci}${d.source ? ` (${d.source})` : ''}`;
        }),
        constellationSpec.gaps.length > 0
          ? `- Declared Unobserved Gaps: ${constellationSpec.gaps.slice(0, 8).join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  // STAGE 1: Master Skeleton Planner
  rec.snapshot.currentStage = 'skeleton';
  rec.snapshot.progressPct = 10;
  const s1Start = Date.now();
  pushEvent(
    rec,
    'skeleton',
    'running',
    'Stage 1 — Master Skeleton Planner',
    `Freezing global envelope, datum planes, PBR palette, and ${workerCount} non-overlapping sub-assembly zones...`
  );

  const skeletonPrompt = `You are 18D's Stage 1 Master Skeleton & Orthographic Planar Planner.
Decompose the requested mechanical/industrial product into a locked 3-view 2D orthographic planar development (Front XY, Side YZ, Top XZ) AND non-overlapping 3D spatial zones BEFORE any 3D CSG geometry is written.

USER BRIEF: ${promptText || 'Reconstruct the subject in the attached reference photograph with sub-millimeter engineering precision.'}
${effectiveTargetWidthMm ? `TARGET OVERALL WIDTH: ${effectiveTargetWidthMm} mm.` : ''}${constellationPromptBlock}

REQUIREMENTS:
1. Define realistic millimeter envelopeMm { width, height, depth } with ground at Y=0, +Y up, +X right, +Z front.
2. Define "skeleton" with key shared "params" (mm), datum "axes", and datum "planes" (floor, working surface, symmetry/cutting planes).
3. Define a calibrated studio PBR "materialPalette" (3-6 named materials):
   - Painted steel/epoxy: metalness 0.06..0.12, roughness 0.24..0.34, clearcoat 0.35..0.52, textureKind "none".
   - Machined/brushed steel/stainless/chrome: metalness 0.85..0.94, roughness 0.14..0.32, textureKind "brushedMetal" or "none".
   - Rubber/elastomer grips/feet: metalness 0.02, roughness 0.72..0.85, textureKind "none".
4. Partition the assembly into EXACTLY ${workerCount} STRICTLY NON-OVERLAPPING spatial "zones" (each with boundsMm: { min: [x,y,z], max: [x,y,z] } separated by at least 1 mm at zone boundaries, plus optional "libraryHints" if stairs/platforms/columns/guardrails/grating are needed).
5. Define exact typed 3D "interfaceDatums" where adjacent zones mate: { id, positionMm: [x,y,z], normal: [nx,ny,nz], matingClearanceMm: 0.5..2.0, connectsZones: [zoneAId, zoneBId] }.
6. PLANAR DEVELOPMENT ("planarLayout"): For each zone, sketch its true 2D silhouette polygon (4-10 vertices in world mm, NOT just boxes when the silhouette is tapered, L-shaped, C-frame, or stepped!) on all three orthographic datum planes:
   - "frontElevationXY": polygonMm in [X, Y] mm (Y=0 ground), planeOffsetMm = Z center, extrudeDepthMm = Z span.
   - "sideProfileYZ": polygonMm in [Z, Y] mm (Y=0 ground), planeOffsetMm = X center, extrudeDepthMm = X span.
   - "topPlanXZ": polygonMm in [X, Z] mm, planeOffsetMm = Y center, extrudeDepthMm = Y span.
   - Mark "isSheetMetal": true on profiles that represent folded sheet-metal enclosures, shrouds, pans, guards, or brackets so Stage 2 uses "sheetMetalFold".
7. Ensure the lowest zone and its Front XY / Side YZ silhouettes touch Y=0 cleanly so the structure is firmly grounded.
8. SOT GEOMETRY BLENDING RULE (Setups/rules/geometry_blending.json — GB-01..GB-06): For monolithic forged, cast, or molded parts spanning multiple planes, NEVER butt-join dissimilar primitives (revolve + extrude + sweep) with raw C0 "union". Follow Blank -> Smooth Blend -> Subtractive Machining -> Edge Breaks: form one continuous spine ("curvedLoft") or blend sub-volumes with SDF "smoothUnion" / "smoothIntersect" (filletRadiusMm 2-8 mm), then cut flat cheeks, bores, eyes, and slots subtractively ("subtract" / "smoothSubtract").

Return ONLY valid JSON:
{
  "name": "string",
  "category": "string",
  "summary": "string",
  "envelopeMm": { "width": number, "height": number, "depth": number },
  "symmetryPlane": "none" | "X" | "Z" | "radial",
  "photoMatchCamera": { "positionMm": [x,y,z], "targetMm": [x,y,z], "fov": 34 },
  "skeleton": {
    "params": { "keyMm": number },
    "axes": [{ "id": "string", "label": "string", "originMm": [x,y,z], "direction": [dx,dy,dz] }],
    "planes": [{ "id": "string", "label": "string", "originMm": [x,y,z], "normal": [nx,ny,nz] }]
  },
  "materialPalette": {
    "keyName": { "colorHex": "#rrggbb", "metalness": number, "roughness": number, "clearcoat": number, "textureKind": "none", "finishName": "string" }
  },
  "zones": [
    {
      "id": "string",
      "name": "string",
      "group": "string",
      "boundsMm": { "min": [x,y,z], "max": [x,y,z] },
      "targetPartCount": 5,
      "interfacePorts": ["string"],
      "libraryHints": ["string"],
      "summary": "string"
    }
  ],
  "interfaceDatums": [
    {
      "id": "string",
      "positionMm": [x, y, z],
      "normal": [nx, ny, nz],
      "matingClearanceMm": 1.0,
      "connectsZones": ["zone_a_id", "zone_b_id"]
    }
  ],
  "planarLayout": {
    "frontElevationXY": [{ "id": "string", "zoneId": "string", "label": "string", "planeOffsetMm": 0, "extrudeDepthMm": 400, "polygonMm": [[x,y], ...], "isSheetMetal": false }],
    "sideProfileYZ": [{ "id": "string", "zoneId": "string", "label": "string", "planeOffsetMm": 0, "extrudeDepthMm": 400, "polygonMm": [[z,y], ...], "isSheetMetal": false }],
    "topPlanXZ": [{ "id": "string", "zoneId": "string", "label": "string", "planeOffsetMm": 0, "extrudeDepthMm": 400, "polygonMm": [[x,z], ...], "isSheetMetal": false }]
  }
}`;

  const s1Content = mediaPart ? { parts: [mediaPart, { text: skeletonPrompt }] } : skeletonPrompt;
  const rawSkeleton = await generateJsonResilient(ai, {
    contents: s1Content,
    systemInstruction:
      'You are a principal CAD systems architect. Return ONLY valid JSON with non-overlapping spatial zones, exact millimeter datums, and accurate 3-view orthographic 2D planar silhouettes (Front XY, Side YZ, Top XZ).',
    thinkingLevel: ThinkingLevel.MEDIUM,
    timeoutMs: 60_000,
    label: 'Stage 1 master skeleton planner',
  });

  assertNotCancelled(rec);
  const skeletonPlan = sanitizeSkeletonPlan(rawSkeleton, workerCount, effectiveTargetWidthMm);
  if (solvedConstellationCam) {
    skeletonPlan.photoMatchCamera = {
      ...skeletonPlan.photoMatchCamera,
      constellationCamera: solvedConstellationCam,
    };
  }
  rec.snapshot.skeletonPlan = skeletonPlan;
  rec.snapshot.workers = skeletonPlan.zones.map(
    (z): OrchestratorWorkerState => ({
      zoneId: z.id,
      zoneName: z.name,
      group: z.group,
      status: 'pending',
      partCount: 0,
    })
  );
  rec.snapshot.progressPct = 24;

  const planarVer = skeletonPlan.planarLayout?.verification;
  pushEvent(
    rec,
    'skeleton',
    'passed',
    `Master Skeleton & 3-View Planar Blueprint Locked (${skeletonPlan.zones.length} Zones)`,
    `${skeletonPlan.name} · ${skeletonPlan.envelopeMm.width}×${skeletonPlan.envelopeMm.height}×${skeletonPlan.envelopeMm.depth} mm · Pre-3D Ortho: Front ${planarVer?.frontCoveragePct ?? 0}% / Side ${planarVer?.sideCoveragePct ?? 0}% / Top ${planarVer?.topCoveragePct ?? 0}% (Env ±${planarVer?.envelopeFitErrorPct ?? 0}%, ${planarVer?.groundContactVerified ? 'Y=0 OK' : 'Ground Warn'}).`,
    { durationMs: Date.now() - s1Start }
  );

  // STAGE 2: Parallel Sub-Assembly Builders
  rec.snapshot.currentStage = 'subassemblies';
  const s2Start = Date.now();
  pushEvent(
    rec,
    'subassemblies',
    'running',
    `Stage 2 — Launching ${skeletonPlan.zones.length} Parallel Sub-Assembly Workers`,
    skeletonPlan.zones.map((z) => z.name).join(' · ')
  );

  const workerResults = await Promise.all(
    skeletonPlan.zones.map(async (zone: OrchestratorSubAssemblyZone, wIdx: number) => {
      const workerState = rec.snapshot.workers[wIdx];
      workerState.status = 'running';
      const wStart = Date.now();

      const otherZonesSummary = skeletonPlan.zones
        .filter((oz) => oz.id !== zone.id)
        .map(
          (oz) =>
            `- ${oz.name} (${oz.id}): X[${oz.boundsMm.min[0]}..${oz.boundsMm.max[0]}], Y[${oz.boundsMm.min[1]}..${oz.boundsMm.max[1]}], Z[${oz.boundsMm.min[2]}..${oz.boundsMm.max[2]}]`
        )
        .join('\n');

      const zoneDatums = (skeletonPlan.interfaceDatums ?? [])
        .filter((d) => d.connectsZones[0] === zone.id || d.connectsZones[1] === zone.id)
        .map(
          (d) =>
            `- ${d.id}: pos=[${d.positionMm.join(', ')}] mm, normal=[${d.normal.join(', ')}], clearance=${d.matingClearanceMm} mm (connects ${d.connectsZones[0]} <-> ${d.connectsZones[1]})`
        )
        .join('\n');

      const zonePlanarSketches = [
        ...(skeletonPlan.planarLayout?.frontElevationXY ?? []),
        ...(skeletonPlan.planarLayout?.sideProfileYZ ?? []),
        ...(skeletonPlan.planarLayout?.topPlanXZ ?? []),
      ].filter((p) => p.zoneId === zone.id);

      const planarSketchBlock =
        zonePlanarSketches.length > 0
          ? JSON.stringify(zonePlanarSketches)
          : 'No custom sketches — derive profiles cleanly inside your bounds.';

      const workerPrompt = `You are 18D Sub-Assembly Builder Worker "${zone.name}" (Zone ID: ${zone.id}).
Build ONLY the watertight Manifold-3D CSG parts belonging to your assigned spatial zone, developing 3D solids directly from your locked 2D orthographic planar sketches.

PROJECT: ${skeletonPlan.name} (${skeletonPlan.category})
USER BRIEF: ${promptText || skeletonPlan.summary}
YOUR ZONE: ${zone.name} | Group: "${zone.group}"
YOUR STRICT BOUNDING BOX (mm — ALL YOUR PARTS MUST STAY INSIDE THIS BOX):
  X: ${zone.boundsMm.min[0]} .. ${zone.boundsMm.max[0]}
  Y: ${zone.boundsMm.min[1]} .. ${zone.boundsMm.max[1]}
  Z: ${zone.boundsMm.min[2]} .. ${zone.boundsMm.max[2]}
TARGET PART COUNT: ${zone.targetPartCount} detailed watertight parts
TYPED 3D INTERFACE DATUMS TOUCHING YOUR ZONE:
${zoneDatums || '- Butt cleanly against neighboring zone boundary with 1.0 mm clearance'}
LOCKED 2D ORTHOGRAPHIC PLANAR SKETCHES FOR YOUR ZONE (EXTRUDE/FOLD DIRECTLY FROM THESE PROFILES — USE "sheetMetalFold" WHEN isSheetMetal=true):
${planarSketchBlock}
ZONE GOAL: ${zone.summary}
${zone.libraryHints.length > 0 ? `LIBRARY HINTS: ${zone.libraryHints.join(', ')}` : ''}

OTHER ZONES (FORBIDDEN SPACE — NEVER INTRUDE INTO THESE BOUNDS):
${otherZonesSummary}

SHARED MASTER SKELETON:
${JSON.stringify(skeletonPlan.skeleton)}

SHARED MATERIAL PALETTE (use "paletteKey" or matching values):
${JSON.stringify(skeletonPlan.materialPalette)}

${CSG_18D_PRIMER}

PART ID PREFIX: Prefix every part "id" with "${zone.id}_" so parallel workers never collide on IDs.
INTERNAL CLEARANCE: Every distinct part inside your zone must either be combined into ONE CSG "union" solid OR keep >= 1.0 mm clearance from neighboring parts in your zone so exact Manifold-3D Boolean clash checking finds ZERO clashes!
SUPPORT CONTINUITY: If your zone touches Y=0, ground base parts at Y=0 with "anchorKind": "floor" and "constraint": { "kind": "sitOnGround", "groundYMm": 0 }. If your zone sits above another zone, ensure its bottom parts touch your zone's Y min (${zone.boundsMm.min[1]} mm) cleanly so they rest on the lower zone with zero floating gap!

Return ONLY valid JSON:
{
  "parts": [ ...BlueprintPart objects... ],
  "interfaces": [ ...optional AssemblyInterfaceSpec objects... ]
}`;

      try {
        const wContent = mediaPart ? { parts: [mediaPart, { text: workerPrompt }] } : workerPrompt;
        const rawOut = await generateJsonResilient(ai, {
          contents: wContent,
          systemInstruction:
            'You are a senior mechanical CAD sub-assembly engineer. Output ONLY valid JSON { parts, interfaces } with watertight csgSolid geometries strictly inside your assigned bounds.',
          thinkingLevel: ThinkingLevel.MEDIUM,
          timeoutMs: 75_000,
          label: `Stage 2 worker ${zone.id}`,
        });

        const rawParts = Array.isArray(rawOut?.parts) ? rawOut.parts.slice(0, 20) : [];
        const cleanParts = rawParts.map((rp: any, i: number) =>
          sanitizeModernPart(rp, i, zone.group, skeletonPlan.materialPalette)
        );
        const cleanIfaces = sanitizeInterfaces(rawOut?.interfaces) ?? [];

        workerState.status = cleanParts.length > 0 ? 'passed' : 'warning';
        workerState.partCount = cleanParts.length;
        workerState.durationMs = Date.now() - wStart;

        const completedCount = rec.snapshot.workers.filter(
          (w) => w.status === 'passed' || w.status === 'warning' || w.status === 'failed'
        ).length;
        rec.snapshot.progressPct = 24 + Math.round((completedCount / skeletonPlan.zones.length) * 32);

        pushEvent(
          rec,
          'subassemblies',
          workerState.status,
          `Worker Ready: ${zone.name}`,
          `Generated ${cleanParts.length} watertight CSG part(s) in ${(workerState.durationMs / 1000).toFixed(1)}s.`,
          { worker: zone.id, durationMs: workerState.durationMs }
        );

        return { parts: cleanParts, interfaces: cleanIfaces };
      } catch (wErr: any) {
        workerState.status = 'failed';
        workerState.error = wErr?.message || 'Worker failed';
        workerState.durationMs = Date.now() - wStart;
        pushEvent(
          rec,
          'subassemblies',
          'failed',
          `Worker Failed: ${zone.name}`,
          workerState.error || 'Unknown worker error.',
          { worker: zone.id, durationMs: workerState.durationMs }
        );
        return { parts: [] as BlueprintPart[], interfaces: [] as any[] };
      }
    })
  );

  assertNotCancelled(rec);

  const mergedParts = deduplicateParts(workerResults.flatMap((r) => r.parts));
  const mergedInterfaces = workerResults.flatMap((r) => r.interfaces);

  if (mergedParts.length === 0) {
    throw new Error('All sub-assembly workers returned empty geometry. Please refine your prompt and try again.');
  }

  const candidateBlueprint: MeshBlueprint = {
    id: `orch-${Date.now().toString(36)}`,
    name: skeletonPlan.name,
    category: skeletonPlan.category,
    summary: skeletonPlan.summary,
    sourceImageUrl: req.imageBase64 || '',
    isReferencePreset: false,
    envelopeMm: skeletonPlan.envelopeMm,
    toleranceSpecMm: 0.1,
    symmetryPlane: skeletonPlan.symmetryPlane,
    photoMatchCamera: skeletonPlan.photoMatchCamera,
    skeleton: skeletonPlan.skeleton,
    ...(constellationSpec ? { constellationSpec } : {}),
    ...(mergedInterfaces.length > 0 ? { interfaces: mergedInterfaces } : {}),
    parts: mergedParts,
    reconstructedAt: new Date().toISOString(),
  };

  pushEvent(
    rec,
    'subassemblies',
    'passed',
    'Sub-Assemblies Merged',
    `Combined ${mergedParts.length} parts across ${skeletonPlan.zones.length} parallel workers.`,
    { durationMs: Date.now() - s2Start }
  );

  // STAGE 3: Deterministic CAD Kernel Gate
  rec.snapshot.currentStage = 'gate';
  rec.snapshot.progressPct = 60;
  const gStart = Date.now();
  pushEvent(
    rec,
    'gate',
    'running',
    'Stage 3 — Deterministic Manifold-3D Kernel Gate',
    `Auditing ${mergedParts.length} parts for watertightness, exact Boolean clashes, floating parts, and mate residuals...`
  );

  let finalBlueprint = candidateBlueprint;
  let finalEval = await evaluateBlueprintInKernel(finalBlueprint, 0, 'Initial Merge Gate');
  assertNotCancelled(rec);
  rec.snapshot.gateHistory.push(finalEval.gateSnapshot);

  pushEvent(
    rec,
    'gate',
    finalEval.gateSnapshot.passed ? 'passed' : 'warning',
    `Initial Gate: ${finalEval.gateSnapshot.healthScore}/100 (Acc ${finalEval.gateSnapshot.accuracyMetrics?.accuracyScore ?? 0}/100)`,
    `CSG Watertight ${finalEval.gateSnapshot.watertightCsgCount}/${finalEval.gateSnapshot.totalCsgCount} · Clashes ${finalEval.gateSnapshot.hardClashCount}H/${finalEval.gateSnapshot.warningClashCount}W · Floating ${finalEval.gateSnapshot.floatingCount} · Buried ${finalEval.gateSnapshot.occludedCount}.`,
    { durationMs: Date.now() - gStart }
  );

  // Deterministic Zero-Token Contact & Grounding Pre-Solver before LLM Repair
  if (!finalEval.gateSnapshot.passed) {
    const det = await applyDeterministicGeometryFixes(
      finalBlueprint,
      finalEval,
      0,
      'Deterministic Pre-Solver'
    );
    if (det.improved) {
      finalBlueprint = det.blueprint;
      finalEval = det.evaluation;
      rec.snapshot.gateHistory.push(finalEval.gateSnapshot);
      pushEvent(
        rec,
        'gate',
        finalEval.gateSnapshot.passed ? 'passed' : 'repaired',
        `Pre-Solver Improved Gate -> ${finalEval.gateSnapshot.healthScore}/100`,
        `${det.appliedFixes.slice(0, 3).join('; ')} (${det.appliedFixes.length} deterministic fix(es), 0 LLM tokens).`
      );
    }
  }

  // STAGE 4: Scoped Auto-Repair Loop (only if Gate still needs repairs)
  if (!finalEval.gateSnapshot.passed && maxRepairIterations > 0) {
    const repaired = await runScopedRepairLoop(ai, rec, finalBlueprint, finalEval, {
      userDirective: promptText || undefined,
      palette: skeletonPlan.materialPalette,
      maxIterations: maxRepairIterations,
      mediaPart,
    });
    finalBlueprint = repaired.blueprint;
    finalEval = repaired.evaluation;
  }

  assertNotCancelled(rec);

  // Quantitative Constellation Photo QA Gate (coverage + check_points alongside cadKernelGate)
  if (
    solvedConstellationCam &&
    ((req.constellationInventory?.objects?.length ?? 0) > 0 ||
      (req.constellationCheckPoints?.length ?? 0) > 0)
  ) {
    const qaStart = Date.now();
    const constellationQa = await runConstellationQaGate({
      blueprint: finalBlueprint,
      camera: solvedConstellationCam,
      inventory: req.constellationInventory,
      checkPoints: req.constellationCheckPoints,
    });
    finalBlueprint = { ...finalBlueprint, constellationQa };
    finalEval.report = { ...finalEval.report, constellationQa };
    finalEval.gateSnapshot = { ...finalEval.gateSnapshot, constellationQa };
    rec.snapshot.constellationQa = constellationQa;
    pushEvent(
      rec,
      'gate',
      constellationQa.passed ? 'passed' : 'warning',
      `Constellation QA Gate (${Math.round(constellationQa.coveragePct)}% cov${
        constellationQa.rmsPx !== null ? `, ${constellationQa.rmsPx.toFixed(1)}px RMS` : ''
      })`,
      constellationQa.summary,
      { durationMs: Date.now() - qaStart }
    );
  }

  rec.snapshot.blueprint = finalBlueprint;
  rec.snapshot.finalAudit = finalEval.report;
  rec.snapshot.status = 'completed';
  rec.snapshot.progressPct = 100;
  rec.snapshot.finishedAt = Date.now();

  pushEvent(
    rec,
    'gate',
    finalEval.gateSnapshot.passed ? 'passed' : 'warning',
    `Build Delivered (${finalEval.gateSnapshot.healthScore}/100)`,
    `${finalBlueprint.parts.length} parts · Watertight CSG ${finalEval.gateSnapshot.watertightCsgCount}/${finalEval.gateSnapshot.totalCsgCount} · ${finalEval.gateSnapshot.hardClashCount} hard clashes · ${finalEval.gateSnapshot.floatingCount} floating.`
  );
}

/**
 * Stage 5: Vision-in-the-Loop Visual Fidelity Critic.
 * Compares the live 3D rendered viewport frame against the reference photograph (and edge-diff metrics),
 * proposes surgical visual/proportion/material fixes, and re-runs the deterministic Manifold-3D Gate
 * so visual improvements never silently introduce geometry clashes.
 */
export async function runVisualFidelityCritic(
  req: VisualCriticRequest
): Promise<VisualCriticResponse> {
  if (!req.blueprint || !Array.isArray(req.blueprint.parts)) {
    throw new Error('Missing blueprint for visual fidelity critic.');
  }
  if (!req.renderedFrameBase64) {
    throw new Error('Missing rendered 3D viewport frame for visual fidelity critic.');
  }

  const ai = getAiClient();
  const beforeEval = await evaluateBlueprintInKernel(req.blueprint, 0, 'Pre-Visual-Critic');

  const renderInline = buildImageInlinePart(req.renderedFrameBase64, 'image/png');
  const refInline = buildImageInlinePart(req.referenceImageBase64, req.referenceMimeType || 'image/png');

  const partDirectory = req.blueprint.parts.slice(0, 60).map((p) => ({
    id: p.id,
    name: p.name,
    group: p.group,
    positionMm: p.positionMm,
    rotationDeg: p.rotationDeg,
    worldBoundsMm: beforeEval.partBoundsWorldMm[p.id],
    material: {
      colorHex: p.material.colorHex,
      metalness: p.material.metalness,
      roughness: p.material.roughness,
      clearcoat: p.material.clearcoat,
      textureKind: p.material.textureKind,
    },
  }));

  const prompt = `You are 18D's Stage 5 Visual Fidelity Critic Agent.
Compare the live 3D rendered CAD viewport image${refInline ? ' (Image 1 = Live 3D Render, Image 2 = Target Reference Photograph)' : ' (Image 1 = Live 3D Render)'}.
${req.edgeDiffMetrics ? `OBJECTIVE EDGE-DIFF METRICS: F1=${req.edgeDiffMetrics.f1ScorePct.toFixed(1)}%, Silhouette IoU=${req.edgeDiffMetrics.silhouetteIoUPct.toFixed(1)}%, Precision=${req.edgeDiffMetrics.precisionPct.toFixed(1)}%, Recall=${req.edgeDiffMetrics.recallPct.toFixed(1)}%.` : ''}
${req.focusNote ? `USER VISUAL FOCUS NOTE: ${req.focusNote}` : ''}

CURRENT PARTS & WORLD BOUNDS:
${JSON.stringify(partDirectory, null, 2)}

${CSG_18D_PRIMER}

Identify up to 4 high-impact visual/proportion/ergonomic/material discrepancies (e.g., silhouette aspect ratio mismatch, over-intense material roughness, missing key trim/hardware, misaligned sub-assembly angle) and return a surgical JSON patch that improves visual realism WITHOUT creating any new 3D clashes or floating parts!

Return ONLY valid JSON:
{
  "visualFindings": ["finding 1", "finding 2"],
  "appliedFixes": ["fix 1", "fix 2"],
  "fixSummary": "short summary",
  "upsertParts": [ ...only modified or added BlueprintPart objects... ],
  "removePartIds": []
}`;

  const partsPayload: any[] = [];
  if (renderInline) partsPayload.push(renderInline);
  if (refInline) partsPayload.push(refInline);
  partsPayload.push({ text: prompt });

  const patch = await generateJsonResilient(ai, {
    contents: { parts: partsPayload },
    systemInstruction:
      'You are an industrial design and CAD visual-fidelity critic. Output ONLY valid JSON matching { visualFindings, appliedFixes, fixSummary, upsertParts, removePartIds }.',
    thinkingLevel: ThinkingLevel.MEDIUM,
    timeoutMs: 70_000,
    label: 'Stage 5 visual fidelity critic',
  });

  const visualFindings: string[] = Array.isArray(patch?.visualFindings)
    ? patch.visualFindings.map(String).slice(0, 6)
    : [];
  const appliedFixes: string[] = Array.isArray(patch?.appliedFixes)
    ? patch.appliedFixes.map(String).slice(0, 6)
    : [];

  const { nextBlueprint, upsertedCount, removedCount } = applyScopedPatch(req.blueprint, patch);
  if (upsertedCount === 0 && removedCount === 0) {
    return {
      blueprint: req.blueprint,
      beforeGate: beforeEval.gateSnapshot,
      afterGate: beforeEval.gateSnapshot,
      visualFindings,
      appliedFixes: appliedFixes.length > 0 ? appliedFixes : ['No geometry changes required.'],
      accepted: true,
    };
  }

  let workingBlueprint = nextBlueprint;
  let afterEval = await evaluateBlueprintInKernel(workingBlueprint, 1, 'Post-Visual-Critic Gate');

  // Auto-heal any minor seating/tilt/clash introduced by the visual patch via zero-token deterministic solver
  if (!afterEval.gateSnapshot.passed || afterEval.gateSnapshot.healthScore < beforeEval.gateSnapshot.healthScore) {
    const det = await applyDeterministicGeometryFixes(
      workingBlueprint,
      afterEval,
      1,
      'Post-Visual Deterministic Seating'
    );
    if (det.improved) {
      workingBlueprint = det.blueprint;
      afterEval = det.evaluation;
      for (const f of det.appliedFixes.slice(0, 3)) {
        appliedFixes.push(`Auto-seated: ${f}`);
      }
    }
  }

  // Hard regression guard: never accept a visual edit that introduces new hard clashes or tanks health
  const regressed =
    afterEval.gateSnapshot.hardClashCount > beforeEval.gateSnapshot.hardClashCount ||
    afterEval.gateSnapshot.floatingCount > beforeEval.gateSnapshot.floatingCount ||
    afterEval.gateSnapshot.healthScore < beforeEval.gateSnapshot.healthScore - 2;

  if (regressed) {
    return {
      blueprint: req.blueprint,
      beforeGate: beforeEval.gateSnapshot,
      afterGate: afterEval.gateSnapshot,
      visualFindings,
      appliedFixes,
      accepted: false,
      rejectionReason: `Visual patch rejected by Manifold-3D Gate (Health ${beforeEval.gateSnapshot.healthScore} -> ${afterEval.gateSnapshot.healthScore}, Hard Clashes ${beforeEval.gateSnapshot.hardClashCount} -> ${afterEval.gateSnapshot.hardClashCount}).`,
    };
  }

  return {
    blueprint: {
      ...workingBlueprint,
      id: `${req.blueprint.id}-vis-${Date.now().toString(36)}`,
      isReferencePreset: false,
    },
    beforeGate: beforeEval.gateSnapshot,
    afterGate: afterEval.gateSnapshot,
    visualFindings,
    appliedFixes,
    accepted: true,
  };
}
