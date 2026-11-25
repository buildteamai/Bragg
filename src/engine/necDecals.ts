import * as THREE from 'three';
import { BlueprintPart, ProjectedDecalSpec } from '../types/blueprint';

export type AnsiSignalWord = 'DANGER' | 'WARNING' | 'CAUTION' | 'NOTICE' | 'SAFETY' | 'PHENOLIC';

export interface NecDecalSpec {
  nec_article: string;
  signal: AnsiSignalWord;
  title: string;
  width_in: number;
  height_in: number;
  lines: string[];
}

export interface NecDecalPaletteEntry {
  header_bg: string;
  header_fg: string;
  body_bg: string;
  body_fg: string;
  border: string;
}

export interface SotDecalRules {
  format: string;
  geometry: {
    thickness_in: number;
    standoff_in: number;
    border_in: number;
    dpi: number;
  };
  ansi_z535_palette: Record<AnsiSignalWord, NecDecalPaletteEntry>;
  catalog: Record<string, NecDecalSpec>;
}

const IN_TO_MM = 25.4;

const DEFAULT_PALETTE: Record<AnsiSignalWord, NecDecalPaletteEntry> = {
  DANGER: { header_bg: '#C8102E', header_fg: '#FFFFFF', body_bg: '#FFFFFF', body_fg: '#111111', border: '#111111' },
  WARNING: { header_bg: '#FF6A00', header_fg: '#111111', body_bg: '#FFFFFF', body_fg: '#111111', border: '#111111' },
  CAUTION: { header_bg: '#FFD100', header_fg: '#111111', body_bg: '#FFFFFF', body_fg: '#111111', border: '#111111' },
  NOTICE: { header_bg: '#005EB8', header_fg: '#FFFFFF', body_bg: '#FFFFFF', body_fg: '#111111', border: '#111111' },
  SAFETY: { header_bg: '#00843D', header_fg: '#FFFFFF', body_bg: '#FFFFFF', body_fg: '#111111', border: '#111111' },
  PHENOLIC: { header_bg: '#111827', header_fg: '#FFFFFF', body_bg: '#111827', body_fg: '#FFFFFF', border: '#E5E7EB' },
};

let cachedRules: SotDecalRules | null = null;
let cachedRulesPromise: Promise<SotDecalRules> | null = null;

/** Fetches the single-source-of-truth NEC decal catalog from SOT (Setups/rules/decals.json). */
export function fetchSotDecalRules(): Promise<SotDecalRules> {
  if (!cachedRulesPromise) {
    cachedRulesPromise = fetch('/api/sot/decals')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load SOT decal rules (HTTP ${r.status})`);
        return r.json() as Promise<SotDecalRules>;
      })
      .then((data) => {
        cachedRules = data;
        return data;
      });
  }
  return cachedRulesPromise;
}

// Preload SOT rules in browser so synchronous ProjectedDecalSpec rendering has full catalog
if (typeof window !== 'undefined') {
  fetchSotDecalRules().catch(() => {});
}

/** Renders a ProjectedDecalSpec that carries necDecalId or necSignal using SOT ANSI Z535 styling. */
export function renderProjectedNecDecal(spec: ProjectedDecalSpec): THREE.CanvasTexture {
  const catalogEntry = spec.necDecalId ? cachedRules?.catalog?.[spec.necDecalId] : undefined;
  const signal: AnsiSignalWord =
    spec.necSignal ??
    catalogEntry?.signal ??
    (spec.necDecalId?.includes('danger') || spec.necDecalId?.includes('480v')
      ? 'DANGER'
      : spec.necDecalId?.includes('caution') || spec.necDecalId?.includes('working_space')
        ? 'CAUTION'
        : spec.necDecalId?.includes('disconnect')
          ? 'PHENOLIC'
          : spec.necDecalId?.includes('ground')
            ? 'SAFETY'
            : spec.necDecalId?.includes('panel') || spec.necDecalId?.includes('circuit')
              ? 'NOTICE'
              : 'WARNING');

  const palette = cachedRules?.ansi_z535_palette?.[signal] ?? DEFAULT_PALETTE[signal];
  const widthIn = catalogEntry?.width_in ?? Math.max(1, spec.sizeMm[0] / IN_TO_MM);
  const heightIn = catalogEntry?.height_in ?? Math.max(1, spec.sizeMm[1] / IN_TO_MM);
  const title = spec.text || catalogEntry?.title || 'WARNING';
  const lines =
    spec.necLines && spec.necLines.length > 0
      ? spec.necLines
      : spec.subtext
        ? spec.subtext.split('|').map((s) => s.trim())
        : catalogEntry?.lines ?? [];
  const necArticle = spec.necArticle ?? catalogEntry?.nec_article ?? '';

  return createNecDecalTexture(
    {
      nec_article: necArticle,
      signal,
      title,
      width_in: widthIn,
      height_in: heightIn,
      lines,
    },
    palette
  );
}

/** Renders an ANSI Z535 / NEC decal onto a high-res Three.js CanvasTexture. */
export function createNecDecalTexture(
  spec: NecDecalSpec,
  palette: NecDecalPaletteEntry,
  overrides?: { title?: string; lines?: string[] }
): THREE.CanvasTexture {
  const pxPerIn = 128;
  const w = Math.max(256, Math.round(spec.width_in * pxPerIn));
  const h = Math.max(160, Math.round(spec.height_in * pxPerIn));
  const border = Math.max(4, Math.round(pxPerIn * 0.05));
  const headerH = Math.round(h * 0.28);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = palette.body_bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = border * 2;
  ctx.strokeRect(0, 0, w, h);

  let yCursor: number;
  if (spec.signal !== 'PHENOLIC') {
    ctx.fillStyle = palette.header_bg;
    ctx.fillRect(border, border, w - border * 2, headerH);
    ctx.fillStyle = palette.header_fg;
    ctx.font = `900 ${Math.round(headerH * 0.6)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.signal, w / 2, border + headerH / 2);
    yCursor = border + headerH + h * 0.14;
  } else {
    yCursor = h * 0.28;
  }

  const title = overrides?.title ?? spec.title;
  const lines = overrides?.lines ?? spec.lines;

  ctx.fillStyle = palette.body_fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.max(18, Math.round(h * 0.105))}px Arial, sans-serif`;
  ctx.fillText(title, w / 2, yCursor, w - border * 6);

  const bodyFontSize = Math.max(13, Math.round(h * 0.068));
  ctx.font = `600 ${bodyFontSize}px Arial, sans-serif`;
  lines.forEach((line, idx) => {
    ctx.fillText(line, w / 2, yCursor + h * 0.14 + idx * bodyFontSize * 1.45, w - border * 6);
  });

  if (spec.nec_article) {
    ctx.font = `500 ${Math.max(10, Math.round(h * 0.045))}px Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.7;
    ctx.fillText(spec.nec_article, w - border * 2.5, h - border * 2.5);
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Helper to create an 18D BlueprintPart for a standardized NEC decal plate
 * using dimensions in mm converted directly from SOT Setups/rules/decals.json (inches).
 */
export function createNecDecalPart(opts: {
  id: string;
  name: string;
  widthIn: number;
  heightIn: number;
  /** 18D convention: mm, Y-up (Y=0 ground plane) */
  positionMm: [number, number, number];
  rotationDeg?: [number, number, number];
  colorHex?: string;
  thicknessIn?: number;
  group?: string;
}): BlueprintPart {
  const thicknessMm = (opts.thicknessIn ?? 0.02) * IN_TO_MM;
  return {
    id: opts.id,
    name: opts.name,
    group: opts.group ?? 'NEC Safety Decals',
    role: 'detail',
    positionMm: opts.positionMm,
    rotationDeg: opts.rotationDeg ?? [0, 0, 0],
    geometry: {
      kind: 'box',
      width: opts.widthIn * IN_TO_MM,
      height: opts.heightIn * IN_TO_MM,
      depth: Math.max(0.5, thicknessMm),
    },
    material: {
      colorHex: opts.colorHex ?? '#FF6A00',
      metalness: 0.05,
      roughness: 0.35,
      finishName: 'Vinyl Safety Label',
    },
    explodeOffsetMm: [0, 0, 0],
    toleranceMm: 0.5,
    notes: 'SOT NEC decal plate (Setups/rules/decals.json)',
  };
}

/**
 * Preferred path: a projected decal that hugs the target part, sized from the SOT catalog.
 * Returns null if the catalog has not loaded or the id is unknown (never guesses a size).
 */
export function createNecProjectedDecal(opts: {
  id: string;
  necDecalId: string;
  targetPartId: string;
  positionMm: [number, number, number];
  rotationDeg?: [number, number, number];
}): ProjectedDecalSpec | null {
  const entry = cachedRules?.catalog?.[opts.necDecalId];
  if (!entry) return null;
  const depthMm = 20;
  return {
    id: opts.id,
    targetPartId: opts.targetPartId,
    positionMm: opts.positionMm,
    rotationDeg: opts.rotationDeg ?? [0, 0, 0],
    sizeMm: [entry.width_in * IN_TO_MM, entry.height_in * IN_TO_MM, depthMm],
    text: entry.title,
    colorHex: '#111111',
    necDecalId: opts.necDecalId,
    necSignal: entry.signal,
    necArticle: entry.nec_article,
    necLines: entry.lines,
  };
}
