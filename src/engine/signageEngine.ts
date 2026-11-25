import * as THREE from 'three';
import type { ProjectedDecalSpec, SignageSpec } from '../types/blueprint';

const ANSI_PALETTE: Record<string, { headerBg: string; headerFg: string; bodyBg: string; bodyFg: string; border: string }> = {
  DANGER:  { headerBg: '#C8102E', headerFg: '#FFFFFF', bodyBg: '#FFFFFF', bodyFg: '#111111', border: '#111111' },
  WARNING: { headerBg: '#FF6A00', headerFg: '#111111', bodyBg: '#FFFFFF', bodyFg: '#111111', border: '#111111' },
  CAUTION: { headerBg: '#FFD100', headerFg: '#111111', bodyBg: '#FFFFFF', bodyFg: '#111111', border: '#111111' },
  NOTICE:  { headerBg: '#005EB8', headerFg: '#FFFFFF', bodyBg: '#FFFFFF', bodyFg: '#111111', border: '#111111' },
  SAFETY:  { headerBg: '#00843D', headerFg: '#FFFFFF', bodyBg: '#FFFFFF', bodyFg: '#111111', border: '#111111' },
};

const ASME_PALETTE: Record<string, { bg: string; fg: string }> = {
  FIRE_QUENCHING:  { bg: '#C8102E', fg: '#FFFFFF' },
  FLAMMABLE:       { bg: '#FFD100', fg: '#111111' },
  TOXIC_CORROSIVE: { bg: '#FF6A00', fg: '#111111' },
  COMBUSTIBLE:     { bg: '#6B4226', fg: '#FFFFFF' },
  POTABLE_WATER:   { bg: '#00843D', fg: '#FFFFFF' },
  COMPRESSED_AIR:  { bg: '#005EB8', fg: '#FFFFFF' },
  USER_DEFINED:    { bg: '#6B21A8', fg: '#FFFFFF' },
};

const FINISHES: Record<string, { bg: string; fg: string; border: string }> = {
  VINYL:            { bg: '#FFFFFF', fg: '#111111', border: '#111111' },
  PHENOLIC_BLK_WHT: { bg: '#111827', fg: '#F9FAFB', border: '#E5E7EB' },
  PHENOLIC_RED_WHT: { bg: '#991B1B', fg: '#FFFFFF', border: '#F9FAFB' },
  ANODIZED_ALUM:    { bg: '#1E293B', fg: '#E2E8F0', border: '#94A3B8' },
  STAINLESS_ETCH:   { bg: '#CBD5E1', fg: '#0F172A', border: '#334155' },
};

function drawPictogram(
  ctx: CanvasRenderingContext2D,
  kind: string,
  cx: number,
  cy: number,
  r: number,
  fg: string
) {
  ctx.save();
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  if (kind === 'bolt' || kind === 'arc_flash') {
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.1, cy - r * 0.72);
    ctx.lineTo(cx - r * 0.36, cy + r * 0.06);
    ctx.lineTo(cx + r * 0.02, cy + r * 0.06);
    ctx.lineTo(cx - r * 0.14, cy + r * 0.74);
    ctx.lineTo(cx + r * 0.38, cy - r * 0.1);
    ctx.lineTo(cx - r * 0.02, cy - r * 0.1);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'ground') {
    ctx.lineWidth = Math.max(3, r * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.55);
    ctx.lineTo(cx, cy + r * 0.05);
    ctx.moveTo(cx - r * 0.55, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.55, cy + r * 0.05);
    ctx.moveTo(cx - r * 0.36, cy + r * 0.28);
    ctx.lineTo(cx + r * 0.36, cy + r * 0.28);
    ctx.moveTo(cx - r * 0.18, cy + r * 0.5);
    ctx.lineTo(cx + r * 0.18, cy + r * 0.5);
    ctx.stroke();
  } else if (kind === 'first_aid') {
    const t = r * 0.28;
    const L = r * 0.62;
    ctx.fillRect(cx - t, cy - L, t * 2, L * 2);
    ctx.fillRect(cx - L, cy - t, L * 2, t * 2);
  } else {
    ctx.fillRect(cx - r * 0.1, cy - r * 0.55, r * 0.2, r * 0.7);
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.42, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Universal SOT Signage & Nameplate Texture Renderer for Three.js / 18D.
 * Supports ANSI Z535, ISO 7010/3864, NFPA 704, ASME A13.1 pipe markers,
 * OEM/UL/CE rating nameplates, crane capacity placards, phenolic tags, and QR asset tags.
 */
export function renderSignageTexture(
  sign: SignageSpec,
  sizeMm?: [number, number, number]
): THREE.CanvasTexture {
  const aspect = sizeMm && sizeMm[1] > 0 ? Math.max(0.4, Math.min(6, sizeMm[0] / sizeMm[1])) : 1.5;
  const h = 384;
  const w = Math.round(h * aspect);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  if (sign.template === 'ansi_signal') {
    const pal = ANSI_PALETTE[sign.signal ?? 'WARNING'] ?? ANSI_PALETTE.WARNING;
    const hdrH = Math.round(h * 0.28);
    ctx.fillStyle = pal.bodyBg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = pal.headerBg;
    ctx.fillRect(10, 10, w - 20, hdrH);
    ctx.fillStyle = pal.headerFg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(hdrH * 0.6)}px Arial, sans-serif`;
    ctx.fillText(sign.signal ?? 'WARNING', w / 2, 10 + hdrH / 2);

    const hasPicto = Boolean(sign.pictogram);
    const tx = hasPicto ? w * 0.62 : w * 0.5;
    if (sign.pictogram) {
      const cx = w * 0.2;
      const cy = hdrH + (h - hdrH) * 0.52;
      const r = Math.min(w * 0.13, (h - hdrH) * 0.35);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx - r * 1.05, cy + r * 0.82);
      ctx.lineTo(cx + r * 1.05, cy + r * 0.82);
      ctx.closePath();
      ctx.fillStyle = '#FFD100';
      ctx.fill();
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 6;
      ctx.stroke();
      drawPictogram(ctx, sign.pictogram, cx, cy + r * 0.14, r * 0.55, '#111111');
    }
    ctx.fillStyle = pal.bodyFg;
    ctx.font = `800 ${Math.round(h * 0.1)}px Arial, sans-serif`;
    ctx.fillText(sign.title ?? '', tx, hdrH + h * 0.18, hasPicto ? w * 0.64 : w * 0.86);
    const bodySz = Math.round(h * 0.068);
    ctx.font = `600 ${bodySz}px Arial, sans-serif`;
    (sign.lines ?? []).forEach((line, i) => {
      ctx.fillText(line, tx, hdrH + h * 0.33 + i * bodySz * 1.45, hasPicto ? w * 0.64 : w * 0.86);
    });
    if (sign.citation) {
      ctx.font = `500 ${Math.round(h * 0.045)}px Arial, sans-serif`;
      ctx.textAlign = 'right';
      ctx.globalAlpha = 0.7;
      ctx.fillText(sign.citation, w - 18, h - 18);
      ctx.globalAlpha = 1;
    }
  } else if (sign.template === 'nfpa_704') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const s = Math.min(w, h) * 0.22;
    const quads: [number, number, string, string, string][] = [
      [cx - s, cy, '#0066CC', '#FFFFFF', String(sign.health ?? 0)],
      [cx, cy - s, '#CC0000', '#FFFFFF', String(sign.flammability ?? 0)],
      [cx + s, cy, '#FFCC00', '#111111', String(sign.instability ?? 0)],
      [cx, cy + s, '#FFFFFF', '#111111', String(sign.special ?? '')],
    ];
    quads.forEach(([qx, qy, bg, fg, val]) => {
      ctx.beginPath();
      ctx.moveTo(qx, qy - s);
      ctx.lineTo(qx + s, qy);
      ctx.lineTo(qx, qy + s);
      ctx.lineTo(qx - s, qy);
      ctx.closePath();
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(s * 0.95)}px Arial, sans-serif`;
      ctx.fillText(val, qx, qy);
    });
  } else if (sign.template === 'asme_pipe_marker') {
    const pal = ASME_PALETTE[sign.fluidClass ?? 'COMPRESSED_AIR'] ?? ASME_PALETTE.COMPRESSED_AIR;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = pal.fg;
    const flow = sign.flowDir ?? 'right';
    if (flow === 'right' || flow === 'both') {
      ctx.beginPath();
      ctx.moveTo(w - h * 0.82, h * 0.22);
      ctx.lineTo(w - h * 0.18, h * 0.5);
      ctx.lineTo(w - h * 0.82, h * 0.78);
      ctx.closePath();
      ctx.fill();
    }
    if (flow === 'left' || flow === 'both') {
      ctx.beginPath();
      ctx.moveTo(h * 0.82, h * 0.22);
      ctx.lineTo(h * 0.18, h * 0.5);
      ctx.lineTo(h * 0.82, h * 0.78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(h * 0.44)}px Arial, sans-serif`;
    ctx.fillText(sign.title ?? 'PROCESS', w / 2, h / 2, w - h * 1.9);
  } else if (sign.template === 'crane_capacity') {
    ctx.fillStyle = '#FFD100';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(h * 0.56)}px Arial, sans-serif`;
    ctx.fillText(sign.title ?? '10 TON', w / 2, h * 0.48, w - 40);
    if (sign.lines?.[0]) {
      ctx.font = `700 ${Math.round(h * 0.16)}px Arial, sans-serif`;
      ctx.fillText(sign.lines[0], w / 2, h * 0.82, w - 40);
    }
  } else if (sign.template === 'rating_nameplate') {
    const fin = FINISHES[sign.finish ?? 'ANODIZED_ALUM'] ?? FINISHES.ANODIZED_ALUM;
    ctx.fillStyle = fin.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fin.border;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = fin.fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `900 ${Math.round(h * 0.1)}px Arial, sans-serif`;
    ctx.fillText(sign.vendor ?? sign.title ?? 'OEM', 24, h * 0.14);
    ctx.textAlign = 'right';
    ctx.font = `700 ${Math.round(h * 0.075)}px Arial, sans-serif`;
    ctx.fillText(sign.marks ?? 'UL / CE', w - 24, h * 0.14);
    ctx.fillStyle = fin.border;
    ctx.fillRect(16, h * 0.22, w - 32, 3);
    const rows = sign.rows ?? [];
    const rowH = (h * 0.72) / Math.max(1, rows.length);
    ctx.fillStyle = fin.fg;
    rows.forEach(([k, v], i) => {
      const y = h * 0.25 + (i + 0.55) * rowH;
      ctx.font = `700 ${Math.max(14, Math.round(rowH * 0.44))}px monospace`;
      ctx.textAlign = 'left';
      ctx.globalAlpha = 0.78;
      ctx.fillText(k, 24, y);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right';
      ctx.fillText(v, w - 24, y);
    });
  } else if (sign.template === 'iso_pictogram') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    const cx = h * 0.5;
    const cy = h * 0.5;
    const r = h * 0.36;
    const cat = sign.isoCategory ?? 'WARNING';
    if (cat === 'WARNING') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx - r * 1.05, cy + r * 0.85);
      ctx.lineTo(cx + r * 1.05, cy + r * 0.85);
      ctx.closePath();
      ctx.fillStyle = '#FFD100';
      ctx.fill();
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 8;
      ctx.stroke();
      drawPictogram(ctx, sign.pictogram ?? 'bolt', cx, cy + r * 0.14, r * 0.55, '#111111');
    } else {
      ctx.fillStyle = cat === 'MANDATORY' ? '#005EB8' : cat === 'SAFE_CONDITION' ? '#00843D' : '#C8102E';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      drawPictogram(ctx, sign.pictogram ?? 'first_aid', cx, cy, r * 0.58, '#FFFFFF');
    }
    const tx = h + (w - h) * 0.5;
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(h * 0.14)}px Arial, sans-serif`;
    ctx.fillText(sign.title ?? '', tx, h * 0.4, w - h - 24);
    ctx.font = `600 ${Math.round(h * 0.095)}px Arial, sans-serif`;
    (sign.lines ?? []).forEach((line, i) => {
      ctx.fillText(line, tx, h * 0.6 + i * h * 0.14, w - h - 24);
    });
  } else {
    // phenolic_tag or asset_qr_tag
    const fin = FINISHES[sign.finish ?? 'PHENOLIC_BLK_WHT'] ?? FINISHES.PHENOLIC_BLK_WHT;
    ctx.fillStyle = fin.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fin.border;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = fin.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(h * 0.24)}px Arial, sans-serif`;
    ctx.fillText(sign.title ?? sign.assetId ?? '', w / 2, h * 0.44, w - 32);
    ctx.font = `600 ${Math.round(h * 0.13)}px monospace`;
    (sign.lines ?? []).forEach((line, i) => {
      ctx.fillText(line, w / 2, h * 0.68 + i * h * 0.16, w - 32);
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function renderProjectedSignage(spec: ProjectedDecalSpec): THREE.CanvasTexture | null {
  if (!spec.signage) return null;
  return renderSignageTexture(spec.signage, spec.sizeMm);
}
