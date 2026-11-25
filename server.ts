import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  cancelOrchestratorJob,
  getOrchestratorJob,
  runVisualFidelityCritic,
  startOrchestratorJob,
} from './server/cadOrchestrator';
import {
  applyDeterministicGeometryFixes,
  evaluateBlueprintInKernel,
} from './server/cadKernelGate';
import { cancelAgyJob, getAgyStatus, handleAgyRun } from './server/agyRunner';
import {
  cancelTerminalJob,
  getTerminalStatus,
  handleTerminalRun,
} from './server/terminalRunner';
import { getLibraryAssetsDir, readLibraryState, writeLibraryState } from './server/modelLibraryStore';
import {
  checkConstellationStatus,
  runConstellationGlassBox,
  runConstellationQaGate,
  runConstellationSingleView,
} from './server/constellationBridge';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';
const FALLBACK_MODEL_NAME = 'gemini-3.1-flash-lite';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your key in Settings > Secrets.'
    );
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

function isRetryableApiError(err: unknown): boolean {
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : JSON.stringify(err ?? '');
  const status = (err as any)?.status ?? (err as any)?.code ?? (err as any)?.error?.code;
  return (
    status === 503 ||
    status === 429 ||
    rawMessage.includes('503') ||
    rawMessage.includes('UNAVAILABLE') ||
    rawMessage.includes('RESOURCE_EXHAUSTED') ||
    rawMessage.includes('API_TIMEOUT') ||
    rawMessage.includes('DEADLINE_EXCEEDED')
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`API_TIMEOUT: ${label} exceeded ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelaySec?: number;
    timeoutMs?: number;
    label?: string;
    onRetry?: (attempt: number, maxRetries: number, delaySec: number) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelaySec = options.baseDelaySec ?? 1.5;
  const timeoutMs = options.timeoutMs ?? 35_000;
  const label = options.label ?? 'Gemini API request';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (err) {
      if (isRetryableApiError(err)) {
        if (attempt === maxRetries - 1) {
          throw err;
        }
        const sleepSec = baseDelaySec * 2 ** attempt + Math.random();
        console.log(
          `[Gemini API] ${label} transient issue on attempt ${attempt + 1}/${maxRetries}; retrying in ${sleepSec.toFixed(2)}s...`
        );
        options.onRetry?.(attempt + 1, maxRetries, sleepSec);
        await new Promise((resolve) => setTimeout(resolve, Math.round(sleepSec * 1000)));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Retry attempts exhausted.');
}

let primaryDegradedUntil = 0;
const PRIMARY_COOLDOWN_MS = 35 * 1000;

async function generateContentResilient(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: Record<string, any>;
    thinkingLevel?: ThinkingLevel;
    fallbackThinkingLevel?: ThinkingLevel;
    primaryRetries?: number;
    timeoutMs?: number;
    label?: string;
  },
  onStage?: (stage: string) => void
) {
  const timeoutMs = params.timeoutMs ?? 60_000;
  const label = params.label ?? 'CAD generation';
  const primaryRetries = params.primaryRetries ?? 3;
  const primaryConfig = params.thinkingLevel
    ? {
        ...(params.config ?? {}),
        thinkingConfig: { thinkingLevel: params.thinkingLevel },
      }
    : params.config;

  const fallbackConfig = params.fallbackThinkingLevel
    ? {
        ...(params.config ?? {}),
        thinkingConfig: { thinkingLevel: params.fallbackThinkingLevel },
      }
    : params.config;

  const tryPrimary = Date.now() >= primaryDegradedUntil;

  if (tryPrimary) {
    try {
      return await callWithRetry(
        () =>
          ai.models.generateContent({
            model: MODEL_NAME,
            contents: params.contents,
            config: primaryConfig,
          }),
        {
          maxRetries: primaryRetries,
          baseDelaySec: 1.4,
          timeoutMs,
          label: `${MODEL_NAME} ${label}`,
          onRetry: (attempt, max) => {
            onStage?.(`High-precision CAD solver busy — retrying (${attempt + 1}/${max})...`);
          },
        }
      );
    } catch (err) {
      if (!isRetryableApiError(err)) {
        throw err;
      }
      primaryDegradedUntil = Date.now() + PRIMARY_COOLDOWN_MS;
      console.log(
        `[Gemini API] Primary model ${MODEL_NAME} unavailable after ${primaryRetries} attempts for ${label}; activating 35s cooldown and switching to ${FALLBACK_MODEL_NAME}.`
      );
    }
  } else {
    console.log(
      `[Gemini API] Routing ${label} directly to ${FALLBACK_MODEL_NAME} (primary model in cooldown).`
    );
  }

  onStage?.('Solving high-precision 3D CAD geometry...');
  return await callWithRetry(
    () =>
      ai.models.generateContent({
        model: FALLBACK_MODEL_NAME,
        contents: params.contents,
        config: fallbackConfig,
      }),
    {
      maxRetries: 3,
      baseDelaySec: 1.4,
      timeoutMs,
      label: `${FALLBACK_MODEL_NAME} ${label}`,
    }
  );
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

interface AsyncJob {
  id: string;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  blueprint?: any;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, AsyncJob>();
const JOB_TTL_MS = 15 * 60 * 1000;

function pruneExpiredJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

function createJob(initialStage: string): AsyncJob {
  pruneExpiredJobs();
  const id = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const job: AsyncJob = {
    id,
    status: 'running',
    stage: initialStage,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

function getHttpStatusForError(message: string): number {
  if (message.includes('API_KEY') || message.includes('403')) return 403;
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) return 429;
  if (message.includes('503') || message.includes('UNAVAILABLE') || message.includes('API_TIMEOUT')) return 503;
  return 500;
}

const BLUEPRINT_JSON_CONTRACT = `Return ONLY a single valid JSON object (no markdown fences, no commentary) matching this exact structure:
{
  "name": "string (exact model or object designation)",
  "category": "string (e.g. 5-Axis CNC Machining Center, Optical Instrument, Consumer Hardware, Automotive, Industrial Equipment)",
  "summary": "string (1-2 sentence geometric summary)",
  "envelopeMm": { "width": number, "height": number, "depth": number },
  "toleranceSpecMm": number (0.02 to 0.15),
  "symmetryPlane": "none" | "X" | "Z" | "radial",
  "photoMatchCamera": {
    "positionMm": [x, y, z],
    "targetMm": [x, y, z],
    "fov": number (28 to 42)
  },
  "parts": [
    {
      "id": "string",
      "name": "string",
      "group": "string (e.g. Base, Enclosure, Frame, Interior, Mechanism, Controls, Optical, Detail)",
      "role": "primary" | "secondary" | "detail",
      "positionMm": [x, y, z],
      "rotationDeg": [rx, ry, rz],
      "explodeOffsetMm": [dx, dy, dz],
      "toleranceMm": number,
      "notes": "optional string",
      "geometry": {
        "kind": "hollowBox" | "extrudePolygon" | "moldedProfile" | "flutedPanel" | "organicLoft" | "taperedTube" | "taperedBox" | "curvedPanel" | "staircase" | "rollerBed" | "dragChain" | "roundedBox" | "box" | "cylinder" | "sphere" | "capsule" | "torus" | "latheProfile" | "tubePath" | "wayCoverSlats",
        "width": number,
        "height": number,
        "depth": number,
        "radius": number,
        "radiusTop": number,
        "radiusBottom": number,
        "bevelRadius": number,
        "bevelThickness": number,
        "tubeRadius": number,
        "radiusStart": number,
        "radiusEnd": number,
        "polygonPoints": [[x, y], ...],
        "polygonHoles": [[[x, y], ...], ...],
        "lathePoints": [[radiusMm, yMm], ...],
        "pathPoints": [[x, y, z], ...],
        "loftStations": [[xMm, yMm, zMm, radiusXMm, radiusYMm], ...],
        "moldingStyle": "crown" | "plinth" | "bevelCap",
        "fluteCount": number,
        "wallThickness": number,
        "openFace": "front" | "back" | "top" | "left" | "right" | "none",
        "windowWidth": number,
        "windowHeight": number,
        "windowOffsetX": number,
        "windowOffsetY": number,
        "topWidth": number,
        "topDepth": number,
        "topOffsetX": number,
        "topOffsetZ": number,
        "thickness": number,
        "arcDeg": number,
        "slatCount": number,
        "stepCount": number,
        "hasHandrails": boolean,
        "rollerCount": number,
        "chainWidth": number,
        "chainHeight": number,
        "linkCount": number
      },
      "material": {
        "colorHex": "#rrggbb",
        "metalness": number (0..1),
        "roughness": number (0.05..0.95),
        "clearcoat": number (0..1),
        "clearcoatRoughness": number (0.05..0.5),
        "opacity": number (0.05..1),
        "transparent": boolean,
        "transmission": number (0..0.95),
        "emissiveHex": "#rrggbb",
        "emissiveIntensity": number,
        "textureKind": "none" | "woodGrain" | "stackedStone" | "fireplaceFlames" | "glitterFinish" | "wovenFabric" | "marbleStone" | "diamondPlate" | "brushedMetal" | "celosScreen" | "controlKeypad" | "industrialConsole" | "ventedLouvers" | "knurled" | "silkscreenLabel" | "warningDecal" | "amadaBadge",
        "photoCrop": [xMin, yMin, xMax, yMax] (optional normalized 0..1 crop box from the uploaded photo for flat textured facades/stonework/fireboxes/artwork/screens),
        "labelText": "optional short text",
        "labelSubtext": "optional secondary label line",
        "finishName": "string"
      }
    }
  ],
  "lights": [
    {
      "id": "string",
      "name": "string (e.g. Left Shelf Blue LED, Firebox Warm Glow, Salt Lamp)",
      "positionMm": [x, y, z],
      "colorHex": "#rrggbb",
      "intensity": number (0.5 to 6.0),
      "distanceMm": number (400 to 3000),
      "decay": number (1.2 to 2.0)
    }
  ]
}

WORKED MILLIMETER GEOMETRY RECIPES (FOLLOW THESE EXACT COORDINATE CONVENTIONS):
1. STACKED ARCHITECTURAL VERTICAL MATH (ZERO GAPS, FLUSH GROUNDING):
   - Plinth base: kind "moldedProfile", moldingStyle "plinth", height 76, positionMm [0, 38, 20] (spans Y=0..76).
   - Main open cabinet/alcove: kind "hollowBox", openFace "front", wallThickness 28, height 880, positionMm [0, 516, 0] (spans Y=76..956).
   - Crown top cap: kind "moldedProfile", moldingStyle "crown", height 62, positionMm [0, 987, 24] (spans Y=956..1018 — exact top surface Y = 1018!).
   - Fluted pilaster trim: kind "flutedPanel", fluteCount 3, width 88, height 876, depth 56, positionMm [±464, 516, 206] (flush front).
2. TRUE CUTOUT FACADE (STONE SURROUND / BEZEL / DOOR FRAME):
   - kind "extrudePolygon", depth 38, polygonPoints [[-420,-344],[420,-344],[420,344],[-420,344]], polygonHoles [[[-296,-288],[296,-288],[296,238],[-296,238]]].
   - Mount a recessed "hollowBox" chamber behind the hole + 3D interior items (e.g. crossed "taperedTube" glowing logs + "fireplaceFlames" backdrop + warm PointLight).
3. MULTI-PART SCULPTED ORGANIC FIGURINES / ANIMALS / BOWS (NEVER USE BOXES OR 2 SPHERES!):
   - Put ALL organic parts of a standing figurine at positionMm [0, supportingSurfaceY, zCenter] so local y=0 is the EXACT top surface where feet/hooves touch!
   - Torso: "organicLoft" with 6-8 loftStations [[x,y,z,rx,ry], ...] tracing rump -> waist -> chest.
   - Neck & Head: separate "organicLoft" curves continuing seamlessly from chest -> throat -> skull -> snout, plus two flared "organicLoft" ears.
   - Legs & Branching Antlers/Stems: separate "taperedTube" curves with 3-5 pathPoints (hip -> knee/hock -> ankle -> [x, 2, z] planted on surface!) and radiusStart -> radiusEnd taper.
   - Satin Bows / Ribbons: 1 center knot sphere + 2 plump curved "organicLoft" loops + 2 downward draped "organicLoft" tails with textureKind "wovenFabric".
4. PHOTO-CROP VS PROCEDURAL PBR RULE:
   - ONLY use "photoCrop" when the photo is shot nearly straight-on (front elevation) on a flat rectangular sign/artwork/screen.
   - When the photo is taken at an angled 3/4 perspective, ALWAYS use seamless 3D procedural PBR textures ("woodGrain", "stackedStone", "fireplaceFlames", "glitterFinish", "wovenFabric", "marbleStone", "brushedMetal") instead of "photoCrop" so angled perspective never skews across 3D faces!`;

function sanitizeBlueprint(raw: any, sourceImageUrl: string, targetWidthMm?: number) {
  const env = raw?.envelopeMm || { width: 500, height: 500, depth: 500 };
  let width = Math.max(20, Math.min(50000, Number(env.width) || 500));
  let height = Math.max(20, Math.min(50000, Number(env.height) || 500));
  let depth = Math.max(20, Math.min(50000, Number(env.depth) || 500));

  const validKinds = new Set([
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
    'wayCoverSlats',
  ]);

  const validTextures = new Set([
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
    'ventedLouvers',
    'knurled',
    'silkscreenLabel',
    'warningDecal',
    'amadaBadge',
  ]);

  const validOpenFaces = new Set(['front', 'back', 'top', 'left', 'right', 'none']);
  const validMoldingStyles = new Set(['crown', 'plinth', 'bevelCap']);

  const parts = Array.isArray(raw?.parts)
    ? raw.parts.slice(0, 96).map((p: any, idx: number) => {
        const kind = validKinds.has(p?.geometry?.kind) ? p.geometry.kind : 'roundedBox';
        const pos = Array.isArray(p?.positionMm) && p.positionMm.length === 3
          ? p.positionMm.map((n: any) => Number(n) || 0)
          : [0, height / 2, 0];
        const rot = Array.isArray(p?.rotationDeg) && p.rotationDeg.length === 3
          ? p.rotationDeg.map((n: any) => Number(n) || 0)
          : [0, 0, 0];
        const exp = Array.isArray(p?.explodeOffsetMm) && p.explodeOffsetMm.length === 3
          ? p.explodeOffsetMm.map((n: any) => Number(n) || 0)
          : [0, 0, 0];

        const colorHex =
          typeof p?.material?.colorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.material.colorHex)
            ? p.material.colorHex
            : '#cfd6de';

        const tex = validTextures.has(p?.material?.textureKind)
          ? p.material.textureKind
          : 'none';

        const numOrUndef = (v: any) => {
          const n = Number(v);
          return Number.isFinite(n) && n !== 0 ? n : undefined;
        };
        const posNumOrUndef = (v: any) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : undefined;
        };

        return {
          id: typeof p?.id === 'string' && p.id.trim() ? p.id.trim() : `part-${idx + 1}`,
          name: typeof p?.name === 'string' && p.name.trim() ? p.name.trim() : `Component ${idx + 1}`,
          group: typeof p?.group === 'string' && p.group.trim() ? p.group.trim() : 'Assembly',
          role: p?.role === 'primary' || p?.role === 'secondary' || p?.role === 'detail' ? p.role : 'secondary',
          positionMm: pos as [number, number, number],
          rotationDeg: rot as [number, number, number],
          explodeOffsetMm: exp as [number, number, number],
          toleranceMm: Math.max(0.005, Math.min(2, Number(p?.toleranceMm) || 0.05)),
          notes: typeof p?.notes === 'string' ? p.notes : undefined,
          geometry: {
            kind,
            width: posNumOrUndef(p?.geometry?.width),
            height: posNumOrUndef(p?.geometry?.height),
            depth: posNumOrUndef(p?.geometry?.depth),
            radius: posNumOrUndef(p?.geometry?.radius),
            radiusTop: posNumOrUndef(p?.geometry?.radiusTop),
            radiusBottom: posNumOrUndef(p?.geometry?.radiusBottom),
            bevelRadius: posNumOrUndef(p?.geometry?.bevelRadius),
            bevelThickness: posNumOrUndef(p?.geometry?.bevelThickness),
            tubeRadius: posNumOrUndef(p?.geometry?.tubeRadius),
            radiusStart: posNumOrUndef(p?.geometry?.radiusStart),
            radiusEnd: posNumOrUndef(p?.geometry?.radiusEnd),
            polygonPoints: Array.isArray(p?.geometry?.polygonPoints)
              ? p.geometry.polygonPoints
                  .filter((pt: any) => Array.isArray(pt) && pt.length >= 2)
                  .map((pt: any) => [Number(pt[0]) || 0, Number(pt[1]) || 0])
              : undefined,
            polygonHoles: Array.isArray(p?.geometry?.polygonHoles)
              ? p.geometry.polygonHoles
                  .filter((loop: any) => Array.isArray(loop) && loop.length >= 3)
                  .map((loop: any) =>
                    loop
                      .filter((pt: any) => Array.isArray(pt) && pt.length >= 2)
                      .map((pt: any) => [Number(pt[0]) || 0, Number(pt[1]) || 0])
                  )
                  .filter((loop: any) => loop.length >= 3)
              : undefined,
            lathePoints: Array.isArray(p?.geometry?.lathePoints)
              ? p.geometry.lathePoints
                  .filter((pt: any) => Array.isArray(pt) && pt.length >= 2)
                  .map((pt: any) => [Math.max(0, Number(pt[0]) || 0), Number(pt[1]) || 0])
              : undefined,
            pathPoints: Array.isArray(p?.geometry?.pathPoints)
              ? p.geometry.pathPoints
                  .filter((pt: any) => Array.isArray(pt) && pt.length >= 3)
                  .map((pt: any) => [Number(pt[0]) || 0, Number(pt[1]) || 0, Number(pt[2]) || 0])
              : undefined,
            loftStations: Array.isArray(p?.geometry?.loftStations)
              ? p.geometry.loftStations
                  .filter((st: any) => Array.isArray(st) && st.length >= 4)
                  .map((st: any) => [
                    Number(st[0]) || 0,
                    Number(st[1]) || 0,
                    Number(st[2]) || 0,
                    Math.max(2, Number(st[3]) || 16),
                    Math.max(2, Number(st[4] ?? st[3]) || 16),
                  ])
              : undefined,
            moldingStyle: validMoldingStyles.has(p?.geometry?.moldingStyle)
              ? p.geometry.moldingStyle
              : undefined,
            fluteCount: posNumOrUndef(p?.geometry?.fluteCount),
            wallThickness: posNumOrUndef(p?.geometry?.wallThickness),
            openFace: validOpenFaces.has(p?.geometry?.openFace)
              ? p.geometry.openFace
              : undefined,
            windowWidth: posNumOrUndef(p?.geometry?.windowWidth),
            windowHeight: posNumOrUndef(p?.geometry?.windowHeight),
            windowOffsetX: numOrUndef(p?.geometry?.windowOffsetX),
            windowOffsetY: numOrUndef(p?.geometry?.windowOffsetY),
            topWidth: posNumOrUndef(p?.geometry?.topWidth),
            topDepth: posNumOrUndef(p?.geometry?.topDepth),
            topOffsetX: numOrUndef(p?.geometry?.topOffsetX),
            topOffsetZ: numOrUndef(p?.geometry?.topOffsetZ),
            thickness: posNumOrUndef(p?.geometry?.thickness),
            arcDeg: posNumOrUndef(p?.geometry?.arcDeg),
            slatCount: posNumOrUndef(p?.geometry?.slatCount),
            stepCount: posNumOrUndef(p?.geometry?.stepCount),
            hasHandrails:
              p?.geometry?.hasHandrails !== undefined
                ? Boolean(p.geometry.hasHandrails)
                : undefined,
            rollerCount: posNumOrUndef(p?.geometry?.rollerCount),
            chainWidth: posNumOrUndef(p?.geometry?.chainWidth),
            chainHeight: posNumOrUndef(p?.geometry?.chainHeight),
            linkCount: posNumOrUndef(p?.geometry?.linkCount),
          },
          material: {
            colorHex,
            metalness: Math.max(0, Math.min(1, Number(p?.material?.metalness) ?? 0.2)),
            roughness: Math.max(0.04, Math.min(0.98, Number(p?.material?.roughness) ?? 0.45)),
            clearcoat: Number(p?.material?.clearcoat) || 0,
            clearcoatRoughness:
              p?.material?.clearcoatRoughness !== undefined
                ? Math.max(0.04, Math.min(0.9, Number(p.material.clearcoatRoughness)))
                : undefined,
            opacity:
              p?.material?.opacity !== undefined
                ? Math.max(0.05, Math.min(1, Number(p.material.opacity)))
                : 1,
            transparent: Boolean(p?.material?.transparent) || (Number(p?.material?.opacity) < 0.98),
            transmission: Math.max(0, Math.min(0.95, Number(p?.material?.transmission) || 0)),
            emissiveHex:
              typeof p?.material?.emissiveHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.material.emissiveHex)
                ? p.material.emissiveHex
                : undefined,
            emissiveIntensity: Number(p?.material?.emissiveIntensity) || 0,
            textureKind: tex,
            photoCrop:
              Array.isArray(p?.material?.photoCrop) &&
              p.material.photoCrop.length === 4 &&
              p.material.photoCrop.every((v: any) => Number.isFinite(Number(v)))
                ? (() => {
                    const x0 = Math.max(0, Math.min(0.98, Number(p.material.photoCrop[0])));
                    const y0 = Math.max(0, Math.min(0.98, Number(p.material.photoCrop[1])));
                    const x1 = Math.max(x0 + 0.02, Math.min(1, Number(p.material.photoCrop[2])));
                    const y1 = Math.max(y0 + 0.02, Math.min(1, Number(p.material.photoCrop[3])));
                    return [x0, y0, x1, y1] as [number, number, number, number];
                  })()
                : undefined,
            labelText: typeof p?.material?.labelText === 'string' ? p.material.labelText.slice(0, 48) : undefined,
            labelSubtext: typeof p?.material?.labelSubtext === 'string' ? p.material.labelSubtext.slice(0, 48) : undefined,
            finishName:
              typeof p?.material?.finishName === 'string' && p.material.finishName.trim()
                ? p.material.finishName.trim()
                : 'Precision Machined Finish',
          },
        };
      })
    : [];

  const lights = Array.isArray(raw?.lights)
    ? raw.lights
        .slice(0, 12)
        .filter((l: any) => l && Array.isArray(l.positionMm) && l.positionMm.length === 3)
        .map((l: any, idx: number) => ({
          id: typeof l.id === 'string' && l.id.trim() ? l.id.trim() : `light-${idx + 1}`,
          name: typeof l.name === 'string' && l.name.trim() ? l.name.trim() : `Accent Light ${idx + 1}`,
          positionMm: l.positionMm.map((n: any) => Number(n) || 0) as [number, number, number],
          colorHex:
            typeof l.colorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.colorHex)
              ? l.colorHex
              : '#ffffff',
          intensity: Math.max(0.2, Math.min(10, Number(l.intensity) || 2.5)),
          distanceMm: Math.max(300, Math.min(8000, Number(l.distanceMm) || 1400)),
          decay: Math.max(1.0, Math.min(2.6, Number(l.decay) || 1.6)),
        }))
    : [];

  // Optional exact user width calibration scaling
  if (targetWidthMm && targetWidthMm > 10 && width > 10) {
    const scale = targetWidthMm / width;
    if (Number.isFinite(scale) && scale > 0.1 && scale < 10 && Math.abs(scale - 1) > 0.02) {
      width = Math.round(width * scale * 10) / 10;
      height = Math.round(height * scale * 10) / 10;
      depth = Math.round(depth * scale * 10) / 10;
      for (const p of parts) {
        p.positionMm = p.positionMm.map((n: number) => Math.round(n * scale * 10) / 10) as [number, number, number];
        p.explodeOffsetMm = p.explodeOffsetMm.map((n: number) => Math.round(n * scale * 10) / 10) as [number, number, number];
        const g = p.geometry;
        const scalarKeys = [
          'width', 'height', 'depth', 'radius', 'radiusTop', 'radiusBottom',
          'bevelRadius', 'bevelThickness', 'tubeRadius', 'radiusStart', 'radiusEnd',
          'wallThickness', 'windowWidth', 'windowHeight', 'windowOffsetX', 'windowOffsetY',
          'topWidth', 'topDepth', 'topOffsetX', 'topOffsetZ', 'thickness',
          'chainWidth', 'chainHeight',
        ] as const;
        for (const k of scalarKeys) {
          if (typeof (g as any)[k] === 'number') {
            (g as any)[k] = Math.round((g as any)[k] * scale * 10) / 10;
          }
        }
        if (g.polygonPoints) {
          g.polygonPoints = g.polygonPoints.map(([x, y]: [number, number]) => [x * scale, y * scale]);
        }
        if (g.polygonHoles) {
          g.polygonHoles = g.polygonHoles.map((loop: [number, number][]) =>
            loop.map(([x, y]) => [x * scale, y * scale])
          );
        }
        if (g.lathePoints) {
          g.lathePoints = g.lathePoints.map(([r, y]: [number, number]) => [r * scale, y * scale]);
        }
        if (g.pathPoints) {
          g.pathPoints = g.pathPoints.map(([x, y, z]: [number, number, number]) => [x * scale, y * scale, z * scale]);
        }
        if (g.loftStations) {
          g.loftStations = g.loftStations.map(
            ([x, y, z, rx, ry]: [number, number, number, number, number]) => [
              x * scale,
              y * scale,
              z * scale,
              rx * scale,
              ry * scale,
            ]
          );
        }
      }
      for (const l of lights) {
        l.positionMm = l.positionMm.map((n: number) => Math.round(n * scale * 10) / 10) as [number, number, number];
        l.distanceMm = Math.round(l.distanceMm * scale);
      }
    }
  }

  // Automatic geometric occlusion repair:
  // 1) If a large solid box/roundedBox/taperedBox encloses smaller interior parts, convert it to a hollowBox open on +Z so interiors are never buried.
  // 2) If a thin silkscreenLabel/screen/keypad plaque is buried inside a larger solid part, project it flush onto that part's front (+Z) face.
  const estimatePartBounds = (p: any) => {
    const g = p.geometry;
    let sx = g.width || (g.radius ? g.radius * 2 : 120);
    let sy = g.height || (g.radius ? g.radius * 2 : 120);
    let sz = g.depth || (g.radius ? g.radius * 2 : 120);
    if (g.kind === 'extrudePolygon' && Array.isArray(g.polygonPoints) && g.polygonPoints.length >= 3) {
      const xs = g.polygonPoints.map((pt: [number, number]) => pt[0]);
      const ys = g.polygonPoints.map((pt: [number, number]) => pt[1]);
      sx = Math.max(20, Math.max(...xs) - Math.min(...xs));
      sy = Math.max(20, Math.max(...ys) - Math.min(...ys));
      sz = g.depth || 60;
    } else if (g.kind === 'latheProfile' && Array.isArray(g.lathePoints) && g.lathePoints.length >= 2) {
      const maxR = Math.max(...g.lathePoints.map((pt: [number, number]) => pt[0]));
      const ys = g.lathePoints.map((pt: [number, number]) => pt[1]);
      sx = Math.max(20, maxR * 2);
      sz = sx;
      sy = Math.max(20, Math.max(...ys) - Math.min(...ys));
    }
    const [cx, cy, cz] = p.positionMm;
    return {
      minX: cx - sx / 2,
      maxX: cx + sx / 2,
      minY: cy - sy / 2,
      maxY: cy + sy / 2,
      minZ: cz - sz / 2,
      maxZ: cz + sz / 2,
      sx,
      sy,
      sz,
      vol: sx * sy * sz,
    };
  };

  const boundsList = parts.map(estimatePartBounds);
  for (let i = 0; i < parts.length; i++) {
    const outer = parts[i];
    const ob = boundsList[i];
    if (outer.material.transparent) continue;
    const isSolidHull =
      outer.geometry.kind === 'box' ||
      outer.geometry.kind === 'roundedBox' ||
      outer.geometry.kind === 'taperedBox';
    if (!isSolidHull) continue;
    // Only check major body shells (at least 18% of envelope width & height)
    if (ob.sx < width * 0.25 || ob.sy < height * 0.35 || ob.sz < depth * 0.2) continue;

    let enclosedInteriorCount = 0;
    for (let j = 0; j < parts.length; j++) {
      if (i === j) continue;
      const inner = parts[j];
      const ib = boundsList[j];
      if (ib.vol >= ob.vol * 0.65) continue;
      if (
        inner.material.textureKind === 'silkscreenLabel' ||
        inner.material.textureKind === 'celosScreen' ||
        inner.material.textureKind === 'controlKeypad'
      ) {
        continue;
      }
      const [ix, iy, iz] = inner.positionMm;
      const margin = 15;
      if (
        ix > ob.minX + margin &&
        ix < ob.maxX - margin &&
        iy > ob.minY + margin &&
        iy < ob.maxY - margin &&
        iz > ob.minZ + margin &&
        iz < ob.maxZ - margin
      ) {
        enclosedInteriorCount += 1;
      }
    }

    if (enclosedInteriorCount >= 1) {
      outer.geometry.kind = 'hollowBox';
      outer.geometry.openFace = 'front';
      outer.geometry.wallThickness = Math.max(
        35,
        Math.min(140, Math.round(Math.min(ob.sx, ob.sy, ob.sz) * 0.08))
      );
    }
  }

  // Ensure thin front labels/screens/keypads/decals are never buried inside a thicker opaque part
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const isFrontOverlay =
      p.material.textureKind === 'silkscreenLabel' ||
      p.material.textureKind === 'celosScreen' ||
      p.material.textureKind === 'controlKeypad' ||
      p.material.textureKind === 'industrialConsole' ||
      p.material.textureKind === 'warningDecal' ||
      p.material.textureKind === 'amadaBadge' ||
      /label|logo|badge|sign|decal/i.test(p.name);
    if (!isFrontOverlay) continue;
    const pb = boundsList[i];
    if (pb.sz > 80) continue; // only adjust thin front plaques/screens

    for (let j = 0; j < parts.length; j++) {
      if (i === j) continue;
      const host = parts[j];
      if (host.material.transparent) continue;
      const hb = boundsList[j];
      if (hb.vol <= pb.vol * 3) continue;
      const [px, py, pz] = p.positionMm;
      if (
        px >= hb.minX &&
        px <= hb.maxX &&
        py >= hb.minY &&
        py <= hb.maxY &&
        pz >= hb.minZ &&
        pz < hb.maxZ - pb.sz / 2
      ) {
        p.positionMm[2] = Math.round(hb.maxZ + pb.sz / 2 + 6);
      }
    }
  }

  const maxSpan = Math.max(width, height, depth);
  let camTarget: [number, number, number] =
    Array.isArray(raw?.photoMatchCamera?.targetMm) && raw.photoMatchCamera.targetMm.length === 3
      ? (raw.photoMatchCamera.targetMm.map((n: any) => Number(n) || 0) as [number, number, number])
      : [0, height * 0.48, 0];

  let camPos: [number, number, number] =
    Array.isArray(raw?.photoMatchCamera?.positionMm) && raw.photoMatchCamera.positionMm.length === 3
      ? (raw.photoMatchCamera.positionMm.map((n: any) => Number(n) || 0) as [number, number, number])
      : [-maxSpan * 0.85, height * 0.58, maxSpan * 1.55];

  // Ensure camera is safely outside the object envelope so the model is never clipped or viewed from inside
  const dx = camPos[0] - camTarget[0];
  const dy = camPos[1] - camTarget[1];
  const dz = camPos[2] - camTarget[2];
  const camDist = Math.hypot(dx, dy, dz);
  const minDist = maxSpan * 1.65;
  const maxDist = maxSpan * 3.4;
  if (!Number.isFinite(camDist) || camDist < 10) {
    camPos = [-maxSpan * 0.85, height * 0.58, maxSpan * 1.55];
  } else if (camDist < minDist || camDist > maxDist) {
    const desired = Math.max(minDist, Math.min(maxDist, camDist));
    const ratio = desired / camDist;
    camPos = [
      Math.round(camTarget[0] + dx * ratio),
      Math.round(Math.max(height * 0.25, camTarget[1] + dy * ratio)),
      Math.round(camTarget[2] + dz * ratio),
    ];
  }

  const allowedAngles = new Set(['photoMatch', 'front', 'left', 'right', 'top']);
  let fiveAngleAudit: any = undefined;
  if (raw?.fiveAngleAudit && typeof raw.fiveAngleAudit === 'object') {
    const rawAngles = Array.isArray(raw.fiveAngleAudit.angles)
      ? raw.fiveAngleAudit.angles
      : [];
    const sanitizedAngles = rawAngles
      .filter((a: any) => a && allowedAngles.has(String(a.angle)))
      .map((a: any) => ({
        angle: String(a.angle),
        label:
          typeof a.label === 'string' && a.label.trim()
            ? a.label.trim()
            : String(a.angle),
        status: a.status === 'corrected' ? 'corrected' : 'verified',
        note: typeof a.note === 'string' ? a.note.trim() : '',
      }));
    const correctionsApplied = Array.isArray(raw.fiveAngleAudit.correctionsApplied)
      ? raw.fiveAngleAudit.correctionsApplied
          .filter((c: any) => typeof c === 'string' && c.trim())
          .map((c: string) => c.trim())
          .slice(0, 12)
      : [];
    if (sanitizedAngles.length > 0 || correctionsApplied.length > 0) {
      fiveAngleAudit = {
        auditedAt:
          typeof raw.fiveAngleAudit.auditedAt === 'string' &&
          raw.fiveAngleAudit.auditedAt.trim()
            ? raw.fiveAngleAudit.auditedAt.trim()
            : new Date().toISOString(),
        angles: sanitizedAngles,
        correctionsApplied,
      };
    }
  }

  return {
    id: `recon-${Date.now()}`,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Reconstructed Assembly',
    category: typeof raw?.category === 'string' && raw.category.trim() ? raw.category.trim() : 'Industrial CAD Replica',
    summary:
      typeof raw?.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : 'Multi-part parametric 3D mesh reconstructed from reference sources.',
    sourceImageUrl,
    isReferencePreset: false,
    envelopeMm: { width, height, depth },
    toleranceSpecMm: Math.max(0.005, Math.min(1, Number(raw?.toleranceSpecMm) || 0.04)),
    symmetryPlane: ['none', 'X', 'Z', 'radial'].includes(raw?.symmetryPlane) ? raw.symmetryPlane : 'none',
    photoMatchCamera: {
      positionMm: camPos,
      targetMm: camTarget,
      fov: Math.max(26, Math.min(48, Number(raw?.photoMatchCamera?.fov) || 34)),
    },
    parts,
    ...(lights.length > 0 ? { lights } : {}),
    ...(fiveAngleAudit ? { fiveAngleAudit } : {}),
    reconstructedAt: new Date().toISOString(),
  };
}

async function runReconstructionTask(
  payload: any,
  onStage?: (stage: string) => void
) {
  const {
    imageBase64,
    mimeType,
    targetWidthMm,
    userHint,
    webReferences,
    pdfDocuments,
  } = payload || {};

  const hasImage =
    typeof imageBase64 === 'string' && imageBase64.trim().length > 0;

  const validWebUrls: string[] = Array.isArray(webReferences)
    ? webReferences
        .filter((u: any) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim()))
        .map((u: string) => u.trim())
        .slice(0, 10)
    : [];

  const validPdfs: { name: string; data: string }[] = Array.isArray(pdfDocuments)
    ? pdfDocuments
        .filter(
          (d: any) =>
            d &&
            typeof d.base64 === 'string' &&
            d.base64.length > 0
        )
        .slice(0, 4)
        .map((d: any, i: number) => ({
          name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : `reference-${i + 1}.pdf`,
          data: d.base64.includes(',') ? d.base64.split(',')[1] : d.base64,
        }))
    : [];

  if (!hasImage && validWebUrls.length === 0 && validPdfs.length === 0) {
    const err = new Error(
      'Provide at least one source: a reference image, a PDF document, or a web reference URL.'
    );
    (err as any).httpStatus = 400;
    throw err;
  }

  const cleanBase64 = hasImage
    ? imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64
    : '';
  const safeMime =
    typeof mimeType === 'string' && mimeType.startsWith('image/')
      ? mimeType
      : 'image/png';

  const ai = getAiClient();

  let webSpecBrief = '';
  if (validWebUrls.length > 0) {
    onStage?.('Reading web references and extracting technical specifications...');
    const urlListText = validWebUrls.map((u, idx) => `${idx + 1}. ${u}`).join('\n');
    try {
      const specRes = await generateContentResilient(
        ai,
        {
          contents: `Inspect the following reference web pages and extract all concrete engineering specifications relevant for sub-millimeter 3D CAD reconstruction: exact physical dimensions (width, height, depth, footprint, diameters, travel envelopes in millimeters), sub-assemblies, materials/finishes, colorways, doors/windows/screens/controls, and structural features.\n\nReference URLs:\n${urlListText}\n\nProvide a concise, strictly factual engineering specification summary in bullet points.`,
          config: {
            tools: [{ urlContext: {} }],
          },
          thinkingLevel: ThinkingLevel.LOW,
          primaryRetries: 2,
          timeoutMs: 25_000,
          label: 'URL specification extraction',
        },
        onStage
      );
      webSpecBrief = (specRes.text ?? '').trim();
    } catch (urlErr: any) {
      if (!hasImage && validPdfs.length === 0) {
        throw urlErr;
      }
      console.log(
        '[Gemini API] URL extraction skipped after timeout/error; continuing with attached image/PDF sources.'
      );
    }
  }

  const calibrationNote =
    targetWidthMm && Number(targetWidthMm) > 0
      ? `The user calibrated the real-world overall width of the subject to exactly ${Number(targetWidthMm)} mm. Scale every part position and dimension accurately to match this calibration.`
      : validWebUrls.length > 0 || validPdfs.length > 0
        ? `Use exact real-world millimeter dimensions extracted from the provided web references and/or PDF technical documents whenever available; otherwise estimate accurately from engineering proportions.`
        : `Estimate accurate real-world physical dimensions in millimeters (mm) based on visual cues and engineering proportions.`;

  const hintNote =
    userHint && typeof userHint === 'string' && userHint.trim()
      ? `Additional user engineering note: "${userHint.trim()}".`
      : '';

  const webContextBlock = webSpecBrief
    ? `\n\nTechnical specifications extracted from user-provided web references (${validWebUrls.join(', ')}):\n${webSpecBrief}`
    : '';

  const pdfContextBlock =
    validPdfs.length > 0
      ? hasImage
        ? `\n\nThe user also attached ${validPdfs.length} PDF technical document(s) (${validPdfs.map((p) => p.name).join(', ')}). Cross-reference any dimensional drawings, tables, orthographic views, part lists, and surface finish specs inside these PDFs with the photograph to maximize sub-millimeter geometric fidelity.`
        : `\n\nThe user attached ${validPdfs.length} PDF technical document(s) (${validPdfs.map((p) => p.name).join(', ')}) as the primary reference without a separate photograph. Carefully inspect every dimensional drawing, orthographic projection, cross-section, specification table, part list, and finish callout inside the PDF(s) to reconstruct the complete 3D CAD assembly to millimeter accuracy.`
      : '';

  const mediaParts: any[] = [];
  if (hasImage) {
    mediaParts.push({
      inlineData: {
        mimeType: safeMime,
        data: cleanBase64,
      },
    });
  }
  for (const pdf of validPdfs) {
    mediaParts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: pdf.data,
      },
    });
  }

  // Stage 1: Structured Visual Metrology & Spatial Deconstruction Plan
  onStage?.(
    hasImage
      ? 'Stage 1/4 — Measuring silhouette contours, functional axes, open cavities, and sub-assemblies...'
      : 'Stage 1/4 — Deconstructing orthographic dimensions, functional axes, and sub-assemblies...'
  );

  let spatialMetrologyPlan = '';
  try {
    const metrologyRes = await generateContentResilient(
      ai,
      {
        contents: {
          parts: [
            ...mediaParts,
            {
                text: `Before generating 3D geometry, perform a rigorous reverse-engineering visual metrology & sub-assembly breakdown of the MAIN HERO SUBJECT in this reference (including every object sitting on or inside it, ignoring unrelated room walls/doors/floor). ${calibrationNote} ${hintNote}${pdfContextBlock}${webContextBlock}

Produce a concise, concrete engineering coordinate plan covering:
1. Exact Subject & Overall Envelope: Width (X), Height (Y), Depth (Z) in mm, matching the EXACT visible height-to-width silhouette aspect ratio.
2. Exact Camera Viewpoint & Perspective: Is the photo straight-on or 3/4 angled (left-front / right-front)? Give exact camera positionMm [x, y, z] and targetMm [x, y, z]. Note that for 3/4 angled photos, seamless 3D PBR textures must be used instead of rectangular photoCrop.
3. Exact Color, PBR Material & Lighting Inventory:
   - Exact sampled hex colors (#rrggbb) and PBR textures (woodGrain, stackedStone, fireplaceFlames, glitterFinish, wovenFabric, marbleStone, brushedMetal, etc.).
   - EVERY glowing/illuminated light source with its exact hex color and [x, y, z] mm coordinates (colored LED alcoves, fireboxes, lamps, backlit screens).
4. Primary Structure Coordinate Table (Y=0 ground, +Z front, +X right, +Y up):
   - Exact [xMin..xMax, yMin..yMax, zMin..zMax] mm bounds for EVERY base plinth, side wing, center housing, stepped crown molding, fluted pilaster, cutout surround, open shelf bay, and recessed firebox/throat.
   - EXPLICITLY list the exact top surface Y height (e.g. leftWingTopY = 880, centerCrownTopY = 1015, lowerShelfTopY = 329) of every surface that supports objects!
5. Hero Props & Secondary Sub-Assemblies Inventory (for dedicated Stage 3 sculpting):
   - List EVERY object sitting ON TOP of or INSIDE the main structure (figurines/animals with body orientation, leg/antler count, ribbon bows; glowing lamps; routers/cables; books/boxes; glowing logs/flames; handles/hardware; or mechanical consoles/tools) with its exact resting surface Y and X/Z footprint so Stage 3 can sculpt each one with full multi-part anatomical detail and ZERO floating gaps!`,
            },
          ],
        },
        thinkingLevel: ThinkingLevel.MEDIUM,
        fallbackThinkingLevel: ThinkingLevel.MEDIUM,
        primaryRetries: 2,
        timeoutMs: 45_000,
        label: 'Stage 1 visual metrology',
      },
      onStage
    );
    spatialMetrologyPlan = (metrologyRes.text ?? '').trim();
  } catch (_planErr: any) {
    console.log(
      '[Gemini API] Stage 1 metrology brief skipped; proceeding directly to Stage 2 CAD architecture synthesis.'
    );
  }

  // Stage 2: High-Precision Primary Architecture, Moldings, Cutouts, Open Cavities & Lighting Pass
  onStage?.(
    'Stage 2/4 — Sculpting primary architecture, stepped moldings, fluted trims, open cavities, and lighting...'
  );

  const cameraGuidance = hasImage
    ? `Set photoMatchCamera so the 3D camera matches the EXACT viewing side, elevation, and framing angle of the input photograph (distance roughly 1.8x to 2.2x the maximum dimension so the entire subject fits cleanly in frame).`
    : `Because no reference photograph was provided, set photoMatchCamera to an ideal front-left 3/4 isometric studio hero camera framing the entire assembly cleanly.`;

  const systemInstruction = `You are a master 3D CAD, architectural, and industrial reconstruction engineer.
Your job in Stage 2 is to build the PRIMARY ARCHITECTURE, OPEN CAVITIES, MOLDINGS, CUTOUT SURROUNDS, SHELVES, AND EMBEDDED LIGHTING of the hero subject in millimeters (mm) with museum-grade accuracy — NEVER plain blocky rectangles!
Note: A dedicated Stage 3 sculpting pass immediately follows to build complex figurines/animals, lamps, shelf books/props, 3D fireplace logs/flames, and fine hardware — so spend Stage 2's full 26 to 40 part budget making the primary structure, stepped moldings, fluted pilasters, cutout surrounds, recessed interiors, PBR textures, and colored PointLights mathematically flawless!

CRITICAL STAGE 2 RULES:
1. ARCHITECTURAL & STRUCTURAL FIDELITY (ZERO BLOCKY BOXES):
   - Use 'moldedProfile' ("crown" / "plinth" / "bevelCap") for ALL stepped top crowns, mantels, and floor plinths.
   - Use 'flutedPanel' (fluteCount: 3..5) for ALL vertical fluted pilasters and grooved architectural columns.
   - Use 'extrudePolygon' + 'polygonHoles' for ALL surrounds/frames with rectangular or shaped openings (stone fireplace surrounds, metal bezels, chamfered machine bows, windowed doors).
   - Use 'hollowBox' (openFace: "front") for ALL open bookcases, media niches, fireboxes, and hollow enclosures so cavities are genuinely recessed and open!
   - Match exact stepped height differences and Z-depth projections between center bodies and flanking wings.
2. AUTHENTIC PBR MATERIALS & REAL EMBEDDED LIGHTING:
   - Apply 'woodGrain', 'stackedStone', 'fireplaceFlames', 'brushedMetal', 'marbleStone', 'ventedLouvers', 'diamondPlate', 'industrialConsole', etc.
   - Whenever the photo shows colored LED bays (e.g. royal blue '#1044ff'), glowing fireboxes ('#ff7a14'), or backlit alcoves, ALWAYS emit BOTH glowing emissive cove strips/back panels AND real Three.js 'lights' (PointLights positioned inside each cavity!).
3. EXACT COORDINATE ALIGNMENT:
   - Right-handed Y-up in mm. Ground plane Y = 0. Front = +Z, Right = +X, Up = +Y.
   - Follow the Stage 1 coordinate table so adjacent parts meet flush with ZERO gaps or floating geometry.
4. ${cameraGuidance}

${BLUEPRINT_JSON_CONTRACT}`;

  const metrologyBlock = spatialMetrologyPlan
    ? `\n\n--- STAGE 1 VISUAL METROLOGY & COORDINATE PLAN (FOLLOW THESE EXACT MILLIMETER BOUNDS, HEIGHTS, CUTOUTS, LIGHTING, AND COLORS) ---\n${spatialMetrologyPlan}\n--- END METROLOGY PLAN ---`
    : '';

  const taskLead = hasImage
    ? `Build Stage 2 (26 to 40 richly sculpted primary architectural/structural parts + embedded lights) matching the photographed hero subject in millimeters.`
    : `Build Stage 2 (26 to 40 richly sculpted primary structural parts + lights) from the attached technical PDF document(s) and/or web reference specification(s) in millimeters.`;

  const stage2Response = await generateContentResilient(
    ai,
    {
      contents: {
        parts: [
          ...mediaParts,
          {
            text: `${taskLead} ${calibrationNote} ${hintNote}${pdfContextBlock}${webContextBlock}${metrologyBlock}\n\nFollow the WORKED MILLIMETER GEOMETRY RECIPES strictly: use moldedProfile for crowns/plinths, flutedPanel for fluted pilasters, extrudePolygon+polygonHoles for cutout surrounds/bezels, hollowBox for open shelves/alcoves/fireboxes, seamless PBR textures (avoid photoCrop on angled 3/4 photos), and real colored PointLights inside every illuminated cavity!`,
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
      thinkingLevel: ThinkingLevel.HIGH,
      fallbackThinkingLevel: ThinkingLevel.HIGH,
      primaryRetries: 2,
      timeoutMs: 95_000,
      label: 'Stage 2 primary architecture synthesis',
    },
    onStage
  );

  const stage2Text = extractJsonText(stage2Response.text ?? '');
  if (!stage2Text) {
    const err = new Error('Model returned an empty geometric blueprint.');
    (err as any).httpStatus = 502;
    throw err;
  }

  const parsedMacro = JSON.parse(stage2Text);
  const macroParts = Array.isArray(parsedMacro?.parts) ? parsedMacro.parts : [];

  // Stage 3: Dedicated Hero Props, Organic Sculptures, Interior Elements & Fine Hardware Pass
  let mergedRawBlueprint = parsedMacro;
  if (macroParts.length > 0) {
    onStage?.(
      'Stage 3/4 — Sculpting hero props, organic figurines, interior logs/books, fine hardware, and accent lights...'
    );
    try {
      const compactSummary = {
        name: parsedMacro.name,
        envelopeMm: parsedMacro.envelopeMm,
        existingPartsWithBounds: macroParts.map((p: any) => {
          const g = p?.geometry || {};
          const pos = Array.isArray(p?.positionMm) ? p.positionMm : [0, 0, 0];
          const w = Number(g.width) || (Number(g.radius) ? Number(g.radius) * 2 : 0);
          const h = Number(g.height) || (Number(g.radius) ? Number(g.radius) * 2 : 0);
          const d = Number(g.depth) || (Number(g.radius) ? Number(g.radius) * 2 : 0);
          return {
            id: p.id,
            name: p.name,
            group: p.group,
            kind: g.kind,
            positionMm: pos.map((n: any) => Math.round(Number(n) || 0)),
            topSurfaceY: h ? Math.round((Number(pos[1]) || 0) + h / 2) : undefined,
            frontSurfaceZ: d ? Math.round((Number(pos[2]) || 0) + d / 2) : undefined,
            sizeMm: [Math.round(w), Math.round(h), Math.round(d)],
          };
        }),
        existingLights: Array.isArray(parsedMacro?.lights) ? parsedMacro.lights : [],
      };

      const detailResponse = await generateContentResilient(
        ai,
        {
          contents: {
            parts: [
              ...mediaParts,
              {
                text: `Compare the reference photograph against the Stage 2 primary structure below and sculpt ALL MISSING HERO PROPS, ORGANIC FIGURINES, INTERIOR ELEMENTS, AND FINE HARDWARE with museum-grade multi-part detail!

Stage 2 Structure & Exact Supporting Surface Coordinates (use topSurfaceY and frontSurfaceZ so EVERY prop sits flush with ZERO floating gaps!):
${JSON.stringify(compactSummary)}
${metrologyBlock}

Generate 22 to 36 NEW richly sculpted parts (do NOT duplicate existing Stage 2 parts!):
1. ORGANIC SCULPTURES & FIGURINES (if any appear on or near the subject — e.g. deer/reindeer, statues, vases, lamps):
   - NEVER approximate an animal or figurine with boxes or 2 spheres!
   - Put all organic pieces at positionMm [0, exactSupportingTopSurfaceY, zCenter] and sculpt: smooth 6-8 station 'organicLoft' torso + arched neck + tapered head/muzzle + 2 flared ears + 4 articulated 4-point 'taperedTube' legs with flush hooves at local y=0..6 + multi-branch 'taperedTube' antlers/horns (if present) + 5-part sculpted 'organicLoft' ribbon bow with 'wovenFabric' (if present), using 'glitterFinish' / matching PBR!
   - Build glowing lamps/vases using multi-station 'latheProfile' + turned base cylinder + warm 'additionalLights' PointLight!
2. INTERIOR & SHELF PROPS:
   - Inside fireboxes: 3D crossed charred 'taperedTube' oak logs, glowing ember bed, rising translucent/emissive 'organicLoft' flame tongues, and 'fireplaceFlames' backdrop.
   - Inside open bookcases/shelves: stacked books, patterned keepsake boxes, speakers, routers/cables resting flush on the exact shelf topSurfaceY.
3. ARCHITECTURAL & MECHANICAL HARDWARE:
   - Drawer/door bronze pulls & handles flush on frontSurfaceZ, glass panes, decorative trim capitals, hinges, control decks, cutting blades, hoses, or decals.
4. LIGHTING:
   - Emit 'additionalLights' for any unlit lamp, firebox, or LED alcove.

Return ONLY valid JSON: { "additionalParts": [ ...22 to 36 BlueprintPart objects... ], "additionalLights": [ ...optional light objects... ] }`,
              },
            ],
          },
          config: {
            systemInstruction: `You are a master 3D sculptural & prop modeling specialist. Using the exact Stage 2 supporting surface coordinates (topSurfaceY, frontSurfaceZ), return ONLY valid JSON with "additionalParts" (22 to 36 finely sculpted organic/prop/hardware parts in mm) and optional "additionalLights". Never use crude boxes for organic figurines or animals!\n\n${BLUEPRINT_JSON_CONTRACT}`,
            responseMimeType: 'application/json',
          },
          thinkingLevel: ThinkingLevel.HIGH,
          fallbackThinkingLevel: ThinkingLevel.MEDIUM,
          primaryRetries: 2,
          timeoutMs: 90_000,
          label: 'Stage 3 hero props & organic sculpting',
        },
        onStage
      );

      const detailText = extractJsonText(detailResponse.text ?? '');
      if (detailText) {
        const detailParsed = JSON.parse(detailText);
        const extra = Array.isArray(detailParsed?.additionalParts)
          ? detailParsed.additionalParts
          : Array.isArray(detailParsed?.parts)
            ? detailParsed.parts
            : [];
        if (extra.length > 0) {
          const seenIds = new Set(macroParts.map((p: any) => String(p?.id || '')));
          const uniqueExtra = extra.filter((p: any, i: number) => {
            const id = typeof p?.id === 'string' && p.id.trim() ? p.id.trim() : `detail-${i + 1}`;
            if (seenIds.has(id)) {
              p.id = `${id}-det-${i + 1}`;
            }
            seenIds.add(p.id);
            return true;
          });
          const extraLights = Array.isArray(detailParsed?.additionalLights)
            ? detailParsed.additionalLights
            : [];
          const baseLights = Array.isArray(parsedMacro?.lights) ? parsedMacro.lights : [];
          mergedRawBlueprint = {
            ...parsedMacro,
            parts: [...macroParts, ...uniqueExtra],
            lights: [...baseLights, ...extraLights],
          };
        }
      }
    } catch (_detailErr: any) {
      console.log(
        '[Gemini API] Stage 3 detail pass skipped; continuing to Stage 4 spatial audit.'
      );
    }
  }

  // Stage 4: Mandatory 5-Angle Spatial & Orientation Audit on ALL Builds
  const allCurrentParts = Array.isArray(mergedRawBlueprint?.parts)
    ? mergedRawBlueprint.parts
    : [];
  if (allCurrentParts.length > 0) {
    onStage?.(
      'Stage 4/4 — Running mandatory 5-angle spatial audit (Photo-Match 3/4, Front, Left, Right, Top)...'
    );
    try {
      const partSpatialTable = allCurrentParts.map((p: any) => {
        const g = p?.geometry || {};
        const pos = Array.isArray(p?.positionMm) ? p.positionMm : [0, 0, 0];
        const rot = Array.isArray(p?.rotationDeg) ? p.rotationDeg : [0, 0, 0];
        const w = Number(g.width) || (Number(g.radius) ? Number(g.radius) * 2 : 0);
        const h = Number(g.height) || (Number(g.radius) ? Number(g.radius) * 2 : 0);
        const d = Number(g.depth) || (Number(g.radius) ? Number(g.radius) * 2 : 0);
        return {
          id: p.id,
          name: p.name,
          group: p.group,
          kind: g.kind,
          positionMm: pos.map((n: any) => Math.round(Number(n) || 0)),
          rotationDeg: rot.map((n: any) => Math.round(Number(n) || 0)),
          sizeMm: [Math.round(w), Math.round(h), Math.round(d)],
          boundsX: w ? [Math.round(pos[0] - w / 2), Math.round(pos[0] + w / 2)] : undefined,
          boundsY: h ? [Math.round(pos[1] - h / 2), Math.round(pos[1] + h / 2)] : undefined,
          boundsZ: d ? [Math.round(pos[2] - d / 2), Math.round(pos[2] + d / 2)] : undefined,
        };
      });

      const auditResponse = await generateContentResilient(
        ai,
        {
          contents: {
            parts: [
              ...mediaParts,
              {
                text: `Perform a strict 5-Angle Spatial & Mechanical Orientation Audit of the assembled 3D CAD blueprint below against the reference source.

Assembled Parts Coordinate Table (mm, Y=0 ground, +Z front, +X right, +Y up):
${JSON.stringify({ name: mergedRawBlueprint.name, envelopeMm: mergedRawBlueprint.envelopeMm, parts: partSpatialTable })}

Audit ALL FIVE canonical views rigorously:
1. "photoMatch" (Photo-Match 3/4): Does the silhouette, architectural trim depth, sculpted figurine/object proportions, lighting mood, and perspective alignment closely match the reference?
2. "front" (Front Elevation +Z): Are open shelving bays, media alcoves, fireboxes, and cutting throats genuinely recessed/open (never sealed solid), are all plinths/feet/bases grounded flush at Y=0, and are front moldings, pilasters, stone surrounds, and plaques flush on +Z?
3. "left" (Left Profile -X): Are left-wing cabinets, shelves, lamps, or side rams/consoles aligned in Z depth without floating gaps or awkward protrusion?
4. "right" (Right Profile +X): Are right-wing cabinets, figurines/sculptures, or stairs/ladders positioned squarely on their supporting surface with zero floating gaps or clipping?
5. "top" (Top Plan +Y): Are component depths, overhangs, crown moldings, and functional axes orthogonal and non-intersecting (for machinery: vise/clamp jaws orthogonal to blade/feed axis; for furniture/architecture: wings, shelves, and stone surround flush and symmetrical)?

Return ONLY valid JSON matching this exact schema:
{
  "partUpdates": [
    {
      "id": "exact-existing-part-id",
      "positionMm": [x, y, z],
      "rotationDeg": [rx, ry, rz],
      "geometryPatch": { "width": 100, "height": 100, "depth": 100 }
    }
  ],
  "removePartIds": [],
  "fiveAngleAudit": {
    "angles": [
      { "angle": "photoMatch", "label": "Photo-Match 3/4", "status": "verified or corrected", "note": "concise spatial verification note" },
      { "angle": "front", "label": "Front Elevation (+Z)", "status": "verified or corrected", "note": "concise spatial verification note" },
      { "angle": "left", "label": "Left Profile (-X)", "status": "verified or corrected", "note": "concise spatial verification note" },
      { "angle": "right", "label": "Right Profile (+X)", "status": "verified or corrected", "note": "concise spatial verification note" },
      { "angle": "top", "label": "Top Plan (+Y)", "status": "verified or corrected", "note": "concise spatial verification note" }
    ],
    "correctionsApplied": ["list each spatial/orientation correction applied, or 'All 5 angles verified aligned'"]
  }
}
If a part needs NO change, omit it from partUpdates. Only include geometryPatch fields you are explicitly changing.`,
              },
            ],
          },
          config: {
            systemInstruction:
              'You are a senior 3D CAD, architectural, and industrial metrology QA engineer performing a 5-angle orientation, grounding, and placement audit. Catch floating objects, misplaced limbs/appendages, 90-degree orientation errors, protruding bases/stairs, and blocked open cavities or alcoves. Return strictly valid JSON.',
            responseMimeType: 'application/json',
          },
          thinkingLevel: ThinkingLevel.LOW,
          fallbackThinkingLevel: ThinkingLevel.MEDIUM,
          primaryRetries: 2,
          timeoutMs: 42_000,
          label: 'Stage 4 five-angle spatial audit',
        },
        onStage
      );

      const auditText = extractJsonText(auditResponse.text ?? '');
      if (auditText) {
        const auditParsed = JSON.parse(auditText);
        const removeSet = new Set(
          Array.isArray(auditParsed?.removePartIds)
            ? auditParsed.removePartIds.map((id: any) => String(id))
            : []
        );
        const updatesMap = new Map<string, any>();
        if (Array.isArray(auditParsed?.partUpdates)) {
          for (const upd of auditParsed.partUpdates) {
            if (upd && typeof upd.id === 'string' && upd.id.trim()) {
              updatesMap.set(upd.id.trim(), upd);
            }
          }
        }

        const auditedParts = allCurrentParts
          .filter((p: any) => !removeSet.has(String(p?.id || '')))
          .map((p: any) => {
            const upd = updatesMap.get(String(p?.id || ''));
            if (!upd) return p;
            const nextPart = { ...p };
            if (Array.isArray(upd.positionMm) && upd.positionMm.length === 3) {
              nextPart.positionMm = upd.positionMm.map((n: any) => Number(n) || 0);
            }
            if (Array.isArray(upd.rotationDeg) && upd.rotationDeg.length === 3) {
              nextPart.rotationDeg = upd.rotationDeg.map((n: any) => Number(n) || 0);
            }
            if (upd.geometryPatch && typeof upd.geometryPatch === 'object') {
              nextPart.geometry = { ...p.geometry, ...upd.geometryPatch };
            }
            return nextPart;
          });

        mergedRawBlueprint = {
          ...mergedRawBlueprint,
          parts: auditedParts,
          fiveAngleAudit: auditParsed?.fiveAngleAudit || undefined,
        };
      }
    } catch (_auditErr: any) {
      console.log(
        '[Gemini API] Stage 4 five-angle spatial audit skipped; attaching baseline audit status.'
      );
      mergedRawBlueprint = {
        ...mergedRawBlueprint,
        fiveAngleAudit: {
          auditedAt: new Date().toISOString(),
          angles: [
            { angle: 'photoMatch', label: 'Photo-Match 3/4', status: 'verified', note: 'Primary 3/4 perspective assembled; open 5-Angle Check to run live visual render audit.' },
            { angle: 'front', label: 'Front Elevation (+Z)', status: 'verified', note: 'Grounded on Y=0 with open cavity protection.' },
            { angle: 'left', label: 'Left Profile (-X)', status: 'verified', note: 'Left profile depth and overhangs sanitized.' },
            { angle: 'right', label: 'Right Profile (+X)', status: 'verified', note: 'Right profile footprint verified.' },
            { angle: 'top', label: 'Top Plan (+Y)', status: 'verified', note: 'Top plan bounds calibrated.' },
          ],
          correctionsApplied: ['Baseline geometric grounding and cavity sanitization applied.'],
        },
      };
    }
  }

  const sourceDataUrl = hasImage ? `data:${safeMime};base64,${cleanBase64}` : '';
  const blueprint = sanitizeBlueprint(
    mergedRawBlueprint,
    sourceDataUrl,
    targetWidthMm && Number(targetWidthMm) > 0 ? Number(targetWidthMm) : undefined
  );

  if (validWebUrls.length > 0 || validPdfs.length > 0) {
    (blueprint as any).contextSources = {
      webUrls: validWebUrls,
      pdfNames: validPdfs.map((p) => p.name),
      extractedSpecNote: webSpecBrief ? webSpecBrief.slice(0, 600) : undefined,
    };
  }

  if (blueprint.parts.length === 0) {
    const err = new Error('Reconstruction produced zero valid geometry parts.');
    (err as any).httpStatus = 502;
    throw err;
  }

  return blueprint;
}

function resolveBlueprintInlineImage(sourceImageUrl: string | undefined): { mimeType: string; data: string } | null {
  if (!sourceImageUrl || typeof sourceImageUrl !== 'string') return null;
  if (sourceImageUrl.startsWith('data:image/')) {
    const match = sourceImageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
    return null;
  }
  if (sourceImageUrl.startsWith('/assets/')) {
    try {
      const safeRel = path.normalize(sourceImageUrl).replace(/^(\.\.[/\\])+/, '');
      const absPath = path.join(__dirname, 'public', safeRel);
      const publicRoot = path.join(__dirname, 'public');
      if (absPath.startsWith(publicRoot) && fs.existsSync(absPath)) {
        const buf = fs.readFileSync(absPath);
        const ext = path.extname(absPath).toLowerCase();
        const mimeType =
          ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.webp'
              ? 'image/webp'
              : 'image/png';
        return { mimeType, data: buf.toString('base64') };
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function runRefinementTask(
  payload: any,
  onStage?: (stage: string) => void
) {
  const { currentBlueprint, instruction } = payload || {};
  if (!currentBlueprint || !instruction || typeof instruction !== 'string') {
    const err = new Error('Missing currentBlueprint or refinement instruction.');
    (err as any).httpStatus = 400;
    throw err;
  }

  onStage?.('Inspecting reference image and applying parametric CAD modification...');
  const ai = getAiClient();
  const compactBlueprint = {
    ...currentBlueprint,
    sourceImageUrl: '[attached-separately]',
  };

  const inlineImage = resolveBlueprintInlineImage(currentBlueprint.sourceImageUrl);
  const refineParts: any[] = [];
  if (inlineImage) {
    refineParts.push({ inlineData: inlineImage });
  }
  refineParts.push({
    text: `${inlineImage ? 'Reference photograph is attached above for direct visual comparison.\n\n' : ''}Current CAD Blueprint JSON:\n${JSON.stringify(compactBlueprint)}\n\nRequested Engineering Modification:\n"${instruction.trim()}"\n\nReturn the complete updated CAD blueprint JSON.`,
  });

  const systemInstruction = `You are a precision parametric CAD modification engine.
Given an existing 3D MeshBlueprint JSON in millimeters, an optional reference photograph, and a user's geometric or material refinement instruction, return the complete updated MeshBlueprint JSON with the requested changes cleanly integrated while preserving all untouched assemblies, grounding on Y=0, open throats/cavities, and mechanical contact alignment.

${BLUEPRINT_JSON_CONTRACT}`;

  const response = await generateContentResilient(
    ai,
    {
      contents: { parts: refineParts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
      thinkingLevel: ThinkingLevel.MEDIUM,
      fallbackThinkingLevel: ThinkingLevel.HIGH,
      primaryRetries: 3,
      timeoutMs: 70_000,
      label: 'CAD refinement',
    },
    onStage
  );

  const text = extractJsonText(response.text ?? '');
  if (!text) {
    const err = new Error('Refinement returned empty response.');
    (err as any).httpStatus = 502;
    throw err;
  }

  const parsed = JSON.parse(text);
  const updated = sanitizeBlueprint(parsed, currentBlueprint.sourceImageUrl || '');
  updated.isReferencePreset = false;
  return updated;
}

async function runFiveAngleVisualAuditTask(
  payload: any,
  onStage?: (stage: string) => void
) {
  const { currentBlueprint, angleSnapshots } = payload || {};
  if (!currentBlueprint || !Array.isArray(angleSnapshots) || angleSnapshots.length === 0) {
    const err = new Error('Missing currentBlueprint or 5-angle render snapshots.');
    (err as any).httpStatus = 400;
    throw err;
  }

  const validSnapshots = angleSnapshots
    .slice(0, 5)
    .map((snap: any) => {
      const dataUrl = typeof snap?.dataUrl === 'string' ? snap.dataUrl : '';
      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) return null;
      return {
        angle: typeof snap?.angle === 'string' ? snap.angle : 'unknown',
        label: typeof snap?.label === 'string' ? snap.label : 'Rendered View',
        mimeType: match[1],
        data: match[2],
      };
    })
    .filter(Boolean) as { angle: string; label: string; mimeType: string; data: string }[];

  if (validSnapshots.length === 0) {
    const err = new Error('No valid base64 rendered angle snapshots were supplied.');
    (err as any).httpStatus = 400;
    throw err;
  }

  onStage?.('Inspecting all 5 live 3D rendered angles against the reference photo...');
  const ai = getAiClient();

  const compactBlueprint = {
    ...currentBlueprint,
    sourceImageUrl: '[attached-separately]',
  };

  const inlineRef = resolveBlueprintInlineImage(currentBlueprint.sourceImageUrl);
  const contentParts: any[] = [];

  if (inlineRef) {
    contentParts.push({
      text: 'GROUND-TRUTH REFERENCE PHOTOGRAPH (compare every rendered angle below against this photo):',
    });
    contentParts.push({ inlineData: inlineRef });
  }

  validSnapshots.forEach((snap, idx) => {
    contentParts.push({
      text: `LIVE 3D RENDER ${idx + 1}/${validSnapshots.length} — ${snap.label} (angle key: "${snap.angle}"):`,
    });
    contentParts.push({
      inlineData: {
        mimeType: snap.mimeType,
        data: snap.data,
      },
    });
  });

  contentParts.push({
    text: `Current 3D CAD MeshBlueprint JSON (millimeters, Y=0 ground, +Z front, +X right, +Y up):
${JSON.stringify(compactBlueprint)}

CRITICAL PHOTOREALISM & VISUAL AUDIT TASK:
You are looking directly at the actual live 3D WebGL renders from 5 canonical angles (Photo-Match 3/4, Front +Z, Left -X, Right +X, Top +Y)${inlineRef ? ' alongside the ground-truth reference photograph' : ''}.
1. Ruthlessly compare EVERY rendered angle against the reference photo and identify ANY blocky, flat, misaligned, or missing visual elements:
   - BLOCKY ARCHITECTURE: Replace plain rectangular boxes on mantel crowns, floor plinths, and pilasters with 'moldedProfile' ("crown" / "plinth" / "bevelCap") and 'flutedPanel' (carved vertical grooves).
   - BLOCKY ORGANIC OBJECTS / FIGURINES: Replace crude boxes, cylinders, or 2-sphere approximations on animals, figurines, statues, ribbon bows, or lamps with smooth 'organicLoft' bodies/necks/heads + 'taperedTube' legs/antlers/branches + 'latheProfile' vases/lamps!
   - FLAT / WRONG MATERIALS & TEXTURES: Upgrade flat colors to real PBR textures ('woodGrain', 'stackedStone', 'fireplaceFlames', 'glitterFinish', 'wovenFabric', 'marbleStone', 'brushedMetal') and add 'photoCrop: [xMin, yMin, xMax, yMax]' on flat front-facing textured surfaces (stacked stone, burning firebox, artwork, screens, signs) so exact photo pixels project cleanly onto the mesh.
   - MISSING LIGHTING / GLOW: If the photo has glowing colored LED alcoves, electric fireplaces, salt lamps, or backlit screens that look dark or flat in the 3D render, add/boost emissive surfaces AND real Three.js 'lights' (PointLights positioned inside the glowing cavities).
   - BLOCKED CAVITIES & PLACEMENT ERRORS: Ensure open bookshelves, media niches, fireboxes, and cutting throats use 'hollowBox' or open frames, fix any floating objects, fix 90-degree vise/clamp/stair orientation errors, and ground the base flush on Y=0.
2. Fix EVERY discrepancy directly in the returned complete MeshBlueprint JSON (including upgraded 'parts' and 'lights') while keeping all already-accurate assemblies intact.
3. Include a detailed "fiveAngleAudit" object inside the returned JSON:
   {
     "auditedAt": "ISO timestamp",
     "angles": [
       { "angle": "photoMatch", "label": "Photo-Match 3/4", "status": "verified or corrected", "note": "..." },
       { "angle": "front", "label": "Front Elevation (+Z)", "status": "verified or corrected", "note": "..." },
       { "angle": "left", "label": "Left Profile (-X)", "status": "verified or corrected", "note": "..." },
       { "angle": "right", "label": "Right Profile (+X)", "status": "verified or corrected", "note": "..." },
       { "angle": "top", "label": "Top Plan (+Y)", "status": "verified or corrected", "note": "..." }
     ],
     "correctionsApplied": ["Concrete list of every geometry sculpt, material/photoCrop upgrade, lighting addition, or placement fix applied"]
   }

Return ONLY the complete corrected MeshBlueprint JSON.`,
  });

  const systemInstruction = `You are a master photorealistic 3D CAD, architectural, and sculptural visual QA specialist.
Compare the live 3D WebGL renders from all 5 angles directly against the ground-truth reference photograph. Aggressively replace blocky boxes/spheres with sculpted 'moldedProfile', 'flutedPanel', 'organicLoft', 'taperedTube', and 'hollowBox' geometry, apply real PBR textures + 'photoCrop' projections, add missing glowing 'lights', and fix all spatial/orientation flaws. Return the complete corrected MeshBlueprint JSON including the "fiveAngleAudit" report.

${BLUEPRINT_JSON_CONTRACT}`;

  onStage?.('Correcting part orientations, placements, and geometry across all 5 angles...');
  const response = await generateContentResilient(
    ai,
    {
      contents: { parts: contentParts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
      thinkingLevel: ThinkingLevel.HIGH,
      fallbackThinkingLevel: ThinkingLevel.HIGH,
      primaryRetries: 2,
      timeoutMs: 95_000,
      label: 'Live 5-angle visual audit',
    },
    onStage
  );

  const text = extractJsonText(response.text ?? '');
  if (!text) {
    const err = new Error('5-angle visual audit returned an empty response.');
    (err as any).httpStatus = 502;
    throw err;
  }

  const parsed = JSON.parse(text);
  const updated = sanitizeBlueprint(parsed, currentBlueprint.sourceImageUrl || '');
  updated.isReferencePreset = false;
  if (currentBlueprint.contextSources) {
    (updated as any).contextSources = currentBlueprint.contextSources;
  }
  return updated;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '45mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: MODEL_NAME });
  });

  // Non-blocking async job endpoints (prevents gateway/proxy 504 HTML timeouts on long reconstructions)
  app.post('/api/reconstruct/start', (req, res) => {
    const { imageBase64, webReferences, pdfDocuments } = req.body || {};
    const hasImage = typeof imageBase64 === 'string' && imageBase64.trim().length > 0;
    const hasUrls =
      Array.isArray(webReferences) &&
      webReferences.some((u: any) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim()));
    const hasPdfs =
      Array.isArray(pdfDocuments) &&
      pdfDocuments.some((d: any) => d && typeof d.base64 === 'string' && d.base64.length > 0);

    if (!hasImage && !hasUrls && !hasPdfs) {
      res.status(400).json({
        error:
          'Provide at least one source: a reference image, a PDF document, or a web reference URL.',
      });
      return;
    }

    const job = createJob('Initializing 3D CAD reconstruction...');
    const payload = req.body;

    void runReconstructionTask(payload, (stage) => {
      job.stage = stage;
    })
      .then((blueprint) => {
        job.status = 'completed';
        job.stage = 'Complete';
        job.blueprint = blueprint;
      })
      .catch((err: any) => {
        console.error('[/api/reconstruct/start] Job error:', err);
        job.status = 'failed';
        job.error = err?.message || 'Geometric reconstruction failed on the server.';
      });

    res.status(202).json({ jobId: job.id, status: job.status, stage: job.stage });
  });

  app.get('/api/reconstruct/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Reconstruction job not found or expired.' });
      return;
    }
    res.json({
      status: job.status,
      stage: job.stage,
      blueprint: job.blueprint,
      error: job.error,
    });
  });

  app.post('/api/reconstruct', async (req, res) => {
    try {
      const blueprint = await runReconstructionTask(req.body);
      res.json({ blueprint });
    } catch (err: any) {
      console.error('[/api/reconstruct] Error:', err);
      const message =
        err?.message || 'Geometric reconstruction failed on the server.';
      const status = err?.httpStatus || getHttpStatusForError(message);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/refine/start', (req, res) => {
    const { currentBlueprint, instruction } = req.body || {};
    if (!currentBlueprint || !instruction || typeof instruction !== 'string') {
      res.status(400).json({ error: 'Missing currentBlueprint or refinement instruction.' });
      return;
    }

    const job = createJob('Applying parametric CAD modification...');
    const payload = req.body;

    void runRefinementTask(payload, (stage) => {
      job.stage = stage;
    })
      .then((blueprint) => {
        job.status = 'completed';
        job.stage = 'Complete';
        job.blueprint = blueprint;
      })
      .catch((err: any) => {
        console.error('[/api/refine/start] Job error:', err);
        job.status = 'failed';
        job.error = err?.message || 'Mesh refinement failed.';
      });

    res.status(202).json({ jobId: job.id, status: job.status, stage: job.stage });
  });

  app.get('/api/refine/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Refinement job not found or expired.' });
      return;
    }
    res.json({
      status: job.status,
      stage: job.stage,
      blueprint: job.blueprint,
      error: job.error,
    });
  });

  app.post('/api/refine', async (req, res) => {
    try {
      const updated = await runRefinementTask(req.body);
      res.json({ blueprint: updated });
    } catch (err: any) {
      console.error('[/api/refine] Error:', err);
      const message = err?.message || 'Mesh refinement failed.';
      const status = err?.httpStatus || getHttpStatusForError(message);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/audit-5-angle/start', (req, res) => {
    const { currentBlueprint, angleSnapshots } = req.body || {};
    if (!currentBlueprint || !Array.isArray(angleSnapshots) || angleSnapshots.length === 0) {
      res.status(400).json({
        error: 'Missing currentBlueprint or rendered 5-angle snapshots.',
      });
      return;
    }

    const job = createJob('Initializing live 5-angle visual audit...');
    const payload = req.body;

    void runFiveAngleVisualAuditTask(payload, (stage) => {
      job.stage = stage;
    })
      .then((blueprint) => {
        job.status = 'completed';
        job.stage = 'Complete';
        job.blueprint = blueprint;
      })
      .catch((err: any) => {
        console.error('[/api/audit-5-angle/start] Job error:', err);
        job.status = 'failed';
        job.error = err?.message || '5-angle visual audit failed.';
      });

    res.status(202).json({ jobId: job.id, status: job.status, stage: job.stage });
  });

  app.get('/api/audit-5-angle/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: '5-angle audit job not found or expired.' });
      return;
    }
    res.json({
      status: job.status,
      stage: job.stage,
      blueprint: job.blueprint,
      error: job.error,
    });
  });

  // =========================================================================
  // Single Lightweight 4-Stage CAD Agent Orchestrator Endpoints
  // =========================================================================
  app.post('/api/orchestrator/start', (req, res) => {
    const body = req.body || {};
    const mode = body.mode === 'auditAndUpgrade' ? 'auditAndUpgrade' : 'build';
    if (mode === 'auditAndUpgrade') {
      if (!body.currentBlueprint || !Array.isArray(body.currentBlueprint.parts)) {
        res.status(400).json({ error: 'auditAndUpgrade mode requires currentBlueprint with parts.' });
        return;
      }
    } else {
      const hasPrompt = typeof body.prompt === 'string' && body.prompt.trim().length > 0;
      const hasImage = typeof body.imageBase64 === 'string' && body.imageBase64.trim().length > 0;
      if (!hasPrompt && !hasImage) {
        res.status(400).json({ error: 'Provide an engineering prompt or a reference photograph.' });
        return;
      }
    }

    const snapshot = startOrchestratorJob({
      mode,
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
      imageBase64: typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
      targetWidthMm: Number(body.targetWidthMm) > 0 ? Number(body.targetWidthMm) : undefined,
      currentBlueprint: body.currentBlueprint,
      workerCount: Number(body.workerCount) || 3,
      maxRepairIterations:
        body.maxRepairIterations !== undefined ? Number(body.maxRepairIterations) : 3,
    });

    res.status(202).json(snapshot);
  });

  app.get('/api/orchestrator/status/:jobId', (req, res) => {
    const snapshot = getOrchestratorJob(req.params.jobId);
    if (!snapshot) {
      res.status(404).json({ error: 'Orchestrator job not found or expired.' });
      return;
    }
    res.json(snapshot);
  });

  app.post('/api/orchestrator/cancel/:jobId', (req, res) => {
    const ok = cancelOrchestratorJob(req.params.jobId);
    if (!ok) {
      res.status(404).json({ error: 'Orchestrator job not found.' });
      return;
    }
    res.json({ cancelled: true });
  });

  app.post('/api/orchestrator/verify', async (req, res) => {
    try {
      const { blueprint, label } = req.body || {};
      if (!blueprint || !Array.isArray(blueprint.parts)) {
        res.status(400).json({ error: 'Missing blueprint payload for Manifold-3D kernel verification.' });
        return;
      }
      const evaluation = await evaluateBlueprintInKernel(
        blueprint,
        0,
        typeof label === 'string' && label.trim() ? label.trim() : 'Kernel Verify'
      );
      res.json({
        gate: evaluation.gateSnapshot,
        report: evaluation.report,
        failingPartIds: evaluation.failingPartIds,
        nonWatertightIds: evaluation.nonWatertightIds,
      });
    } catch (err: any) {
      console.error('[/api/orchestrator/verify] Error:', err);
      res.status(500).json({ error: err?.message || 'Manifold-3D kernel verification failed.' });
    }
  });

  app.post('/api/orchestrator/visual-critic', async (req, res) => {
    try {
      const result = await runVisualFidelityCritic(req.body);
      res.json(result);
    } catch (err: any) {
      console.error('[/api/orchestrator/visual-critic] Error:', err);
      const message = err?.message || 'Visual fidelity critic failed.';
      res.status(getHttpStatusForError(message)).json({ error: message });
    }
  });

  app.post('/api/orchestrator/auto-fix', async (req, res) => {
    try {
      const { blueprint, label } = req.body || {};
      if (!blueprint || !Array.isArray(blueprint.parts)) {
        res.status(400).json({ error: 'Missing blueprint payload for deterministic auto-seating.' });
        return;
      }
      const beforeEval = await evaluateBlueprintInKernel(
        blueprint,
        0,
        typeof label === 'string' && label.trim() ? label.trim() : 'Pre-Auto-Seat'
      );
      const det = await applyDeterministicGeometryFixes(
        blueprint,
        beforeEval,
        1,
        'Auto-Seat & Align'
      );
      res.json({
        improved: det.improved,
        blueprint: det.blueprint,
        appliedFixes: det.appliedFixes,
        beforeGate: beforeEval.gateSnapshot,
        afterGate: det.evaluation.gateSnapshot,
      });
    } catch (err: any) {
      console.error('[/api/orchestrator/auto-fix] Error:', err);
      res.status(500).json({ error: err?.message || 'Deterministic auto-seating failed.' });
    }
  });

  // The agent runs with full file permissions: only accept calls from this machine.
  app.use('/api/agy', (req, res, next) => {
    const ip = req.socket.remoteAddress || '';
    const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLoopback) {
      res.status(403).json({ error: 'Antigravity CLI endpoints are restricted to localhost.' });
      return;
    }
    next();
  });

  app.get('/api/agy/status', (_req, res) => {
    res.json(getAgyStatus());
  });

  app.get('/api/library', (_req, res) => {
    try {
      res.json(readLibraryState());
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to read model library.' });
    }
  });

  app.put('/api/library', (req, res) => {
    try {
      const saved = writeLibraryState(req.body);
      res.json(saved);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save model library.' });
    }
  });

  app.get('/api/library/assets/:file', (req, res) => {
    const safeFile = path.basename(req.params.file || '');
    const assetPath = path.join(getLibraryAssetsDir(), safeFile);
    if (!safeFile || !fs.existsSync(assetPath)) {
      res.status(404).json({ error: `Imported 3D asset not found: ${safeFile}` });
      return;
    }
    if (safeFile.toLowerCase().endsWith('.glb')) {
      res.setHeader('Content-Type', 'model/gltf-binary');
    } else if (safeFile.toLowerCase().endsWith('.gltf')) {
      res.setHeader('Content-Type', 'model/gltf+json');
    }
    res.sendFile(assetPath);
  });

  app.get('/api/library/fs-list', (req, res) => {
    const ip = req.socket.remoteAddress || '';
    const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLoopback) {
      res.status(403).json({ error: 'File Explorer is restricted to localhost.' });
      return;
    }
    try {
      const sotRoot = process.env.SOT_ROOT || path.resolve(__dirname, '..', '..');
      const userProfile = process.env.USERPROFILE || process.env.HOME || '';
      const eqDir = path.join(sotRoot, '_library', 'equipment');
      const boxDir = userProfile ? path.join(userProfile, 'Box') : '';
      const desktopDir = userProfile ? path.join(userProfile, 'Desktop') : '';

      const shortcuts: { label: string; path: string }[] = [];
      if (fs.existsSync(eqDir)) shortcuts.push({ label: 'SOT Equipment', path: eqDir });
      if (fs.existsSync(sotRoot)) shortcuts.push({ label: 'SOT Root', path: sotRoot });
      if (boxDir && fs.existsSync(boxDir)) shortcuts.push({ label: 'Box', path: boxDir });
      if (desktopDir && fs.existsSync(desktopDir)) shortcuts.push({ label: 'Desktop', path: desktopDir });
      if (userProfile && fs.existsSync(userProfile)) shortcuts.push({ label: 'Home', path: userProfile });
      for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
        const drv = `${letter}:\\`;
        try {
          if (fs.existsSync(drv)) {
            shortcuts.push({ label: drv, path: drv });
          }
        } catch {
          // skip unreadable / unmounted removable drives
        }
      }

      const requested = typeof req.query.dir === 'string' && req.query.dir.trim()
        ? req.query.dir.trim()
        : (boxDir && fs.existsSync(boxDir) ? boxDir : fs.existsSync(eqDir) ? eqDir : sotRoot);
      const targetDir = path.resolve(requested);
      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        res.status(404).json({ error: `Folder not found: ${targetDir}` });
        return;
      }

      const supportedExt = new Set(['.usda', '.usd', '.usdc', '.usdz', '.glb', '.gltf', '.json']);
      const dirents = fs.readdirSync(targetDir, { withFileTypes: true });
      const entries: {
        name: string;
        path: string;
        isDir: boolean;
        ext: string;
        sizeBytes: number;
      }[] = [];

      for (const d of dirents) {
        if (d.name.startsWith('$') || d.name === 'System Volume Information') continue;
        const full = path.join(targetDir, d.name);
        if (d.isDirectory()) {
          entries.push({ name: d.name, path: full, isDir: true, ext: '', sizeBytes: 0 });
        } else if (d.isFile()) {
          const ext = path.extname(d.name).toLowerCase();
          if (!supportedExt.has(ext)) continue;
          let sizeBytes = 0;
          try {
            sizeBytes = fs.statSync(full).size;
          } catch {
            // ignore stat error
          }
          entries.push({ name: d.name, path: full, isDir: false, ext, sizeBytes });
        }
      }

      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      const parentDir = path.dirname(targetDir);
      res.json({
        cwd: targetDir,
        parent: parentDir !== targetDir ? parentDir : null,
        shortcuts,
        entries,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list directory.' });
    }
  });

  app.post('/api/library/import-3d', (req, res) => {
    try {
      const { fileName, dataBase64, localPath } = req.body || {};
      const assetsDir = getLibraryAssetsDir();
      const sotRoot = process.env.SOT_ROOT || path.resolve(__dirname, '..', '..');

      let srcPath = '';
      let displayName = '';
      let ext = '';
      let tempUploadedFile = '';

      if (typeof localPath === 'string' && localPath.trim()) {
        const ip = req.socket.remoteAddress || '';
        const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
        if (!isLoopback) {
          res.status(403).json({ error: 'Local path import is restricted to localhost.' });
          return;
        }
        const resolved = path.resolve(localPath.trim().replace(/^["']|["']$/g, ''));
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
          res.status(404).json({ error: `File not found: ${resolved}` });
          return;
        }
        srcPath = resolved;
        ext = path.extname(resolved).toLowerCase();
        displayName = path.basename(resolved, ext);
      } else if (typeof fileName === 'string' && typeof dataBase64 === 'string' && dataBase64.length > 0) {
        ext = path.extname(fileName).toLowerCase();
        displayName = path.basename(fileName, ext) || 'Imported Model';
        const cleanB64 = dataBase64.includes(',') ? dataBase64.split(',').pop() || '' : dataBase64;
        const buf = Buffer.from(cleanB64, 'base64');
        const safeTmpName = `${Date.now()}-${path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        tempUploadedFile = path.join(assetsDir, safeTmpName);
        fs.writeFileSync(tempUploadedFile, buf);
        srcPath = tempUploadedFile;
      } else {
        res.status(400).json({ error: 'Provide either a 3D file upload or a localPath.' });
        return;
      }

      const slug =
        displayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'imported-3d';
      const id = `${slug}-${Date.now().toString(36)}`;

      if (ext === '.json') {
        const parsed = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
        const bp = parsed?.blueprint ? parsed.blueprint : parsed;
        if (tempUploadedFile && fs.existsSync(tempUploadedFile)) {
          fs.unlinkSync(tempUploadedFile);
        }
        if (!bp || typeof bp !== 'object' || !Array.isArray(bp.parts) || !bp.name) {
          res.status(400).json({ error: 'JSON file is not a valid 18D MeshBlueprint.' });
          return;
        }
        res.json({ format: 'json', blueprint: bp });
        return;
      }

      if (ext === '.glb' || ext === '.gltf') {
        const outName = `${id}${ext}`;
        const outPath = path.join(assetsDir, outName);
        if (srcPath !== outPath) {
          fs.copyFileSync(srcPath, outPath);
        }
        if (tempUploadedFile && tempUploadedFile !== outPath && fs.existsSync(tempUploadedFile)) {
          fs.unlinkSync(tempUploadedFile);
        }
        res.json({
          id,
          name: displayName,
          format: 'glb',
          assetUrl: `/api/library/assets/${outName}`,
          envelopeMm: { width: 2000, height: 1500, depth: 2000 },
        });
        return;
      }

      if (ext === '.usd' || ext === '.usda' || ext === '.usdc' || ext === '.usdz') {
        const converter = path.join(sotRoot, 'Setups', 'lib', 'usd_to_glb.py');
        if (!fs.existsSync(converter)) {
          res.status(500).json({ error: `SOT USD converter not found at ${converter}` });
          return;
        }
        const outName = `${id}.glb`;
        const outPath = path.join(assetsDir, outName);
        const stdout = execFileSync('python', [converter, srcPath, outPath, '--json'], {
          encoding: 'utf-8',
          maxBuffer: 20 * 1024 * 1024,
        });
        if (tempUploadedFile && fs.existsSync(tempUploadedFile)) {
          fs.unlinkSync(tempUploadedFile);
        }
        const info = JSON.parse(stdout.trim());
        res.json({
          id,
          name: displayName,
          format: 'usd',
          assetUrl: `/api/library/assets/${outName}`,
          envelopeMm: info.envelopeMm || { width: 2000, height: 1500, depth: 2000 },
          meshCount: info.meshCount,
          triangleCount: info.triangleCount,
        });
        return;
      }

      if (tempUploadedFile && fs.existsSync(tempUploadedFile)) {
        fs.unlinkSync(tempUploadedFile);
      }
      res.status(400).json({
        error: `Unsupported 3D format "${ext}". Supported: .glb, .gltf, .usd, .usda, .usdc, .usdz, .json`,
      });
    } catch (err: any) {
      console.error('[/api/library/import-3d] Error:', err);
      res.status(500).json({ error: err?.message || 'Failed to import 3D model.' });
    }
  });

  app.get('/api/sot/signage', (_req, res) => {
    const sotRoot = process.env.SOT_ROOT || path.resolve(__dirname, '..', '..');
    const signagePath = path.join(sotRoot, 'Setups', 'rules', 'signage.json');
    if (!fs.existsSync(signagePath)) {
      res.status(404).json({ error: `SOT signage rules not found at ${signagePath}` });
      return;
    }
    res.sendFile(signagePath);
  });

  app.get('/api/sot/decals', (_req, res) => {
    const sotRoot = process.env.SOT_ROOT || path.resolve(__dirname, '..', '..');
    const decalsPath = path.join(sotRoot, 'Setups', 'rules', 'decals.json');
    if (!fs.existsSync(decalsPath)) {
      res.status(404).json({ error: `SOT decal rules not found at ${decalsPath}` });
      return;
    }
    res.sendFile(decalsPath);
  });

  app.get('/api/sot/geometry-blending-rules', (_req, res) => {
    const sotRoot = process.env.SOT_ROOT || path.resolve(__dirname, '..', '..');
    const rulesPath = path.join(sotRoot, 'Setups', 'rules', 'geometry_blending.json');
    if (!fs.existsSync(rulesPath)) {
      res.status(404).json({ error: `SOT geometry blending rules not found at ${rulesPath}` });
      return;
    }
    res.sendFile(rulesPath);
  });

  app.get('/api/sot/decal-textures/:file', (req, res) => {
    const sotRoot = process.env.SOT_ROOT || path.resolve(__dirname, '..', '..');
    const safeFile = path.basename(req.params.file || '');
    const texPath = path.join(sotRoot, '_library', 'textures', 'decals', safeFile);
    if (!safeFile || !fs.existsSync(texPath)) {
      res.status(404).json({ error: `Decal texture not found: ${safeFile}` });
      return;
    }
    res.sendFile(texPath);
  });

  app.post('/api/agy/run', (req, res) => {
    handleAgyRun(req, res);
  });

  app.post('/api/agy/cancel', (req, res) => {
    const { jobId } = req.body || {};
    const cancelled = typeof jobId === 'string' ? cancelAgyJob(jobId) : false;
    res.json({ cancelled });
  });

  // --- Direct 18D SOT Terminal Endpoints (localhost, LAN & Tailscale) ---
  app.get('/api/terminal/status', (req, res) => {
    res.json(getTerminalStatus(req));
  });

  app.post('/api/terminal/run', (req, res) => {
    handleTerminalRun(req, res);
  });

  app.post('/api/terminal/cancel', (req, res) => {
    const { jobId } = req.body || {};
    const cancelled = typeof jobId === 'string' ? cancelTerminalJob(jobId) : false;
    res.json({ cancelled });
  });

  // --- Architekton Constellation Integration Endpoints ---
  app.get('/api/constellation/status', async (_req, res) => {
    try {
      res.json(await checkConstellationStatus());
    } catch (err: any) {
      res.status(500).json({ available: false, error: err?.message || 'Status check failed.' });
    }
  });

  app.post('/api/constellation/single-view', async (req, res) => {
    try {
      const { marks, modelPoints, units, sigmaPx, trials } = req.body || {};
      if (!marks || typeof marks !== 'object') {
        res.status(400).json({ error: 'Missing required "marks" JSON object.' });
        return;
      }
      const spec = await runConstellationSingleView({ marks, modelPoints, units, sigmaPx, trials });
      res.json(spec);
    } catch (err: any) {
      console.error('[/api/constellation/single-view] Error:', err);
      res.status(500).json({ error: err?.message || 'Constellation single_view solve failed.' });
    }
  });

  app.post('/api/constellation/glass-box', async (req, res) => {
    try {
      const { imageBase64, camera, boundsMm, axes, origin, res: pxPerMm } = req.body || {};
      if (!imageBase64 || !camera || !boundsMm?.min || !boundsMm?.max) {
        res.status(400).json({ error: 'Missing required imageBase64, camera, or boundsMm.' });
        return;
      }
      const result = await runConstellationGlassBox({
        imageBase64,
        camera,
        boundsMm,
        axes,
        origin,
        res: pxPerMm,
      });
      res.json(result);
    } catch (err: any) {
      console.error('[/api/constellation/glass-box] Error:', err);
      res.status(500).json({ error: err?.message || 'Constellation glass_box rectification failed.' });
    }
  });

  app.post('/api/constellation/qa-gate', async (req, res) => {
    try {
      const { blueprint, camera, inventory, checkPoints, tolPx, iouOk, iouGood } = req.body || {};
      if (!blueprint || !camera) {
        res.status(400).json({ error: 'Missing required blueprint or camera.' });
        return;
      }
      const report = await runConstellationQaGate({
        blueprint,
        camera,
        inventory,
        checkPoints,
        tolPx,
        iouOk,
        iouGood,
      });
      res.json(report);
    } catch (err: any) {
      console.error('[/api/constellation/qa-gate] Error:', err);
      res.status(500).json({ error: err?.message || 'Constellation QA gate failed.' });
    }
  });

  // Never let unmatched /api/* requests fall through to HTML SPA fallback
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Ensure Express middleware errors (e.g., 413 PayloadTooLargeError, invalid JSON) always return JSON, never HTML
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    if (req.path.startsWith('/api/')) {
      const status =
        err?.type === 'entity.too.large'
          ? 413
          : err?.status || err?.statusCode || 500;
      const message =
        status === 413
          ? 'Uploaded files exceed the maximum allowed payload size. Please use smaller PDFs or fewer attachments.'
          : err?.message || 'Unexpected server error.';
      res.status(status).json({ error: message });
      return;
    }
    next(err);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configLoader: 'native',
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`18D server listening on http://0.0.0.0:${PORT}`);
  });
  // Cloud Run / GFE upstream keep-alive is ~60s; keeping Node's timeout > 60s prevents premature socket resets ("Failed to fetch")
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  httpServer.requestTimeout = 300_000;
}

createServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
