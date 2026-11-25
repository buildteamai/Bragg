import * as THREE from 'three';
import { ProceduralTextureKind } from '../types/blueprint';

export interface ProceduralTextureSet {
  map?: THREE.CanvasTexture;
  bumpMap?: THREE.CanvasTexture;
  normalMap?: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
  emissiveMap?: THREE.CanvasTexture;
}

const textureCache = new Map<string, ProceduralTextureSet>();
const photoImageCache = new Map<string, Promise<HTMLImageElement>>();

function configureColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

function configureDataTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Converts a grayscale height/bump canvas into a seamless tileable OpenGL tangent-space
 * normal map using a periodic 3x3 Sobel filter so PBR surfaces exhibit crisp micro-bevel
 * specular highlights under HDR studio softbox lighting.
 */
function createNormalMapFromHeightCanvas(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sample = (x: number, y: number): number => {
    const wx = (x + w) % w;
    const wy = (y + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      // Periodic 3x3 Sobel gradients
      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);

      // OpenGL tangent-space normal (+X right, +Y up, +Z out)
      let nx = -dX * strength;
      let ny = dY * strength;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const p = (y * w + x) * 4;
      dst[p] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
      dst[p + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
      dst[p + 2] = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)));
      dst[p + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  const tex = configureDataTexture(outCanvas, maxAnisotropy, repeatX, repeatY);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createDiamondPlateTextures(maxAnisotropy: number): ProceduralTextureSet {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  ctx.fillStyle = '#2d323a';
  ctx.fillRect(0, 0, size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#555555';
  bCtx.fillRect(0, 0, size, size);

  const cell = 32;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const alt = ((x / cell) + (y / cell)) % 2 === 0;
      const cx = x + cell * 0.5;
      const cy = y + cell * 0.5;

      const drawLug = (c: CanvasRenderingContext2D, fill: string) => {
        c.save();
        c.translate(cx, cy);
        c.rotate(alt ? Math.PI / 4 : -Math.PI / 4);
        c.fillStyle = fill;
        c.beginPath();
        c.ellipse(0, 0, cell * 0.34, cell * 0.11, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      };

      drawLug(ctx, '#434a56');
      drawLug(bCtx, '#ececec');
    }
  }

  return {
    map: configureColorTexture(colorCanvas, maxAnisotropy, 7, 5),
    bumpMap: configureDataTexture(bumpCanvas, maxAnisotropy, 7, 5),
    normalMap: createNormalMapFromHeightCanvas(bumpCanvas, 3.6, maxAnisotropy, 7, 5),
  };
}

function createBrushedMetalTextures(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#484848'; // ~0.28 brushed stainless satin sheen
  rCtx.fillRect(0, 0, size, size);

  // Fine horizontal anisotropic streaks (subtle satin No. 4 finish)
  for (let i = 0; i < 900; i++) {
    const y = (i * 73) % size;
    const alpha = 0.014 + ((i * 19) % 10) * 0.004;
    const bright = i % 2 === 0;
    ctx.fillStyle = bright
      ? `rgba(255,255,255,${alpha.toFixed(3)})`
      : `rgba(15,23,42,${(alpha * 0.75).toFixed(3)})`;
    ctx.fillRect(0, y, size, 1 + (i % 2));

    bCtx.fillStyle = bright ? 'rgba(180,180,180,0.08)' : 'rgba(84,84,84,0.08)';
    bCtx.fillRect(0, y, size, 1);

    rCtx.fillStyle = bright ? 'rgba(56,56,56,0.14)' : 'rgba(92,92,92,0.14)';
    rCtx.fillRect(0, y, size, 1 + (i % 2));
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy, 2, 2),
    bumpMap: configureDataTexture(bumpCanvas, maxAnisotropy, 2, 2),
    normalMap: createNormalMapFromHeightCanvas(bumpCanvas, 0.45, maxAnisotropy, 2, 2),
    roughnessMap: configureDataTexture(roughCanvas, maxAnisotropy, 2, 2),
  };
}

function createCelosScreenTexture(maxAnisotropy: number): ProceduralTextureSet {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Deep obsidian HMI backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#141921');
  bg.addColorStop(1, '#1d242e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Top status bar
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, w, 54);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('CELOS', 26, 34);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('DMU 125 monoBLOCK   5-AXIS NC   0.001 mm', 120, 34);

  // Subtle top accent line
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(0, 52, w, 2);

  // App tile grid (matching the signature 3 rows x 5 columns DMG MORI CELOS icon array)
  const cols = 5;
  const rows = 3;
  const padX = 76;
  const padY = 108;
  const gapX = 28;
  const gapY = 26;
  const tileW = (w - padX * 2 - gapX * (cols - 1)) / cols;
  const tileH = 132;

  const tileLabels = [
    'JOB MANAGER', 'JOB ASSIST', 'TECH CALC', 'CAD-CAM', '3D MODEL',
    'MACHINE', 'TOOL LIST', 'SPINDLE', 'COOLANT', 'ATC 60',
    'METROLOGY', 'PROBE 3D', 'DIAGNOSTIC', 'ENERGY', 'SETTINGS',
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = padX + c * (tileW + gapX);
      const y = padY + r * (tileH + gapY);

      ctx.fillStyle = idx === 5 ? '#263244' : '#2a313c';
      ctx.beginPath();
      ctx.roundRect(x, y, tileW, tileH, 10);
      ctx.fill();

      ctx.strokeStyle = idx === 5 ? '#38bdf8' : 'rgba(226,232,240,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Minimal geometric icon inside each tile
      const ix = x + tileW * 0.5;
      const iy = y + 52;
      ctx.strokeStyle = '#e2e8f0';
      ctx.fillStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (idx % 3 === 0) {
        ctx.rect(ix - 20, iy - 16, 40, 32);
        ctx.stroke();
        ctx.fillRect(ix - 12, iy - 6, 24, 5);
        ctx.fillRect(ix - 12, iy + 4, 16, 5);
      } else if (idx % 3 === 1) {
        ctx.arc(ix, iy, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ix, iy, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(ix - 20, iy + 14);
        ctx.lineTo(ix - 6, iy - 10);
        ctx.lineTo(ix + 6, iy + 4);
        ctx.lineTo(ix + 20, iy - 14);
        ctx.stroke();
      }

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tileLabels[idx], ix, y + 108);
    }
  }
  ctx.textAlign = 'left';

  // Bottom quick dock strip
  ctx.fillStyle = '#0f141b';
  ctx.fillRect(0, h - 46, w, 46);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(28, h - 29, 10, 10);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.fillText('READY  X: 0.000  Y: 0.000  Z: 142.500  B: 20.000  C: 0.000', 50, h - 19);

  return {
    map: configureColorTexture(canvas, maxAnisotropy),
  };
}

function createControlKeypadTexture(maxAnisotropy: number): ProceduralTextureSet {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Dark anodized recessed console keywell
  ctx.fillStyle = '#161a21';
  ctx.fillRect(0, 0, w, h);

  // Subtle recessed metallic border
  ctx.strokeStyle = '#38414f';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  // LEFT BANK: Machine Control Panel (E-Stop, Mode Select, Rotary Override Scales, Cycle Start/Stop)
  ctx.fillStyle = '#1e242d';
  ctx.beginPath();
  ctx.roundRect(28, 28, 306, 456, 10);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Upper-left Emergency Stop yellow safety collar plate
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(112, 118, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Upper-middle status & mode keys next to E-Stop
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const kx = 186 + c * 44;
      const ky = 68 + r * 48;
      ctx.fillStyle = r === 0 && c === 0 ? '#16a34a' : r === 0 && c === 1 ? '#dc2626' : '#334155';
      ctx.beginPath();
      ctx.roundRect(kx, ky, 36, 36, 5);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Two rotary override dial scales (Feedrate & Spindle Override)
  const dialCenters = [
    { cx: 112, cy: 312, label: 'FEED %' },
    { cx: 244, cy: 312, label: 'SPINDLE %' },
  ];
  for (const d of dialCenters) {
    // Dial scale ring
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    for (let t = 0; t <= 10; t++) {
      const ang = (Math.PI * 0.75) + (t / 10) * (Math.PI * 1.5);
      ctx.beginPath();
      ctx.moveTo(d.cx + Math.cos(ang) * 44, d.cy + Math.sin(ang) * 44);
      ctx.lineTo(d.cx + Math.cos(ang) * 54, d.cy + Math.sin(ang) * 54);
      ctx.stroke();
    }
    ctx.fillStyle = '#0f1318';
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, 38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, d.cx, d.cy + 74);
  }
  ctx.textAlign = 'left';

  // Bottom-left Cycle Start (Green) & Cycle Stop (Red) illumination keys
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.roundRect(54, 412, 102, 50, 7);
  ctx.fill();
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.roundRect(178, 412, 102, 50, 7);
  ctx.fill();

  // CENTER-RIGHT BANK: Signature DMG MORI Crisp Light-Silver / White QWERTY + NC Softkey Deck
  ctx.fillStyle = '#1a2029';
  ctx.beginPath();
  ctx.roundRect(354, 28, 642, 456, 10);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Top CNC Function Softkeys Row (F1-F10)
  for (let c = 0; c < 10; c++) {
    const x = 376 + c * 60;
    const y = 46;
    ctx.fillStyle = '#cfd6df';
    ctx.beginPath();
    ctx.roundRect(x, y, 50, 34, 5);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 14, y + 14, 22, 5);
  }

  // Main QWERTY / Alphanumeric White-Silver Key Block (4 rows x 10 cols)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 10; c++) {
      const x = 376 + c * 46;
      const y = 104 + r * 58;
      ctx.fillStyle = '#e8edf3';
      ctx.beginPath();
      ctx.roundRect(x, y, 39, 46, 5);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 11, y + 19, 17, 5);
    }
  }

  // Spacebar & Modifier Bottom Row
  ctx.fillStyle = '#dce3ec';
  ctx.beginPath();
  ctx.roundRect(376, 342, 76, 46, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(464, 342, 232, 46, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(708, 342, 122, 46, 5);
  ctx.fill();

  // Right-side Numeric / Axis Jog Pad (4 rows x 3 cols)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const x = 852 + c * 44;
      const y = 104 + r * 58;
      ctx.fillStyle = r === 3 && c === 2 ? '#38bdf8' : '#d5dde7';
      ctx.beginPath();
      ctx.roundRect(x, y, 37, 46, 5);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 11, y + 20, 15, 5);
    }
  }

  // Bottom trackpad / cursor strip
  ctx.fillStyle = '#252c37';
  ctx.beginPath();
  ctx.roundRect(450, 408, 310, 56, 8);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return {
    map: configureColorTexture(canvas, maxAnisotropy),
  };
}

function createVentedLouversTexture(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let y = 36; y < size - 36; y += 22) {
    ctx.fillStyle = '#11151b';
    ctx.fillRect(48, y, size - 96, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(48, y + 8, size - 96, 3);

    bCtx.fillStyle = '#181818';
    bCtx.fillRect(48, y, size - 96, 8);
    bCtx.fillStyle = '#dddddd';
    bCtx.fillRect(48, y + 8, size - 96, 4);
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy),
    bumpMap: configureDataTexture(bumpCanvas, maxAnisotropy),
  };
}

function createSilkscreenTexture(
  maxAnisotropy: number,
  bgHex: string,
  text: string,
  subtext?: string,
  vertical = false,
  alignLeft = false
): ProceduralTextureSet {
  const w = vertical ? 256 : 1024;
  const h = vertical ? 1024 : 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, w, h);

  const cleanHex = bgHex.replace('#', '');
  const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const isLightBg = luminance > 175;
  ctx.fillStyle = isLightBg ? '#111827' : '#f8fafc';

  if (vertical) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 54px "Outfit", sans-serif';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  } else {
    ctx.textBaseline = 'middle';
    ctx.textAlign = alignLeft ? 'left' : 'center';
    const x = alignLeft ? 64 : w / 2;

    if (text === 'DMU 125 monoBLOCK®') {
      ctx.textAlign = 'left';
      const startX = 96;
      ctx.font = '700 78px "Outfit", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('DMU', startX, h / 2 + 2);
      const w1 = ctx.measureText('DMU ').width;
      ctx.font = '500 76px "Outfit", sans-serif';
      ctx.fillText('125', startX + w1, h / 2 + 2);
      const w2 = ctx.measureText('125 ').width;
      ctx.font = '500 72px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText('monoBLOCK®', startX + w1 + w2, h / 2 + 2);
    } else if (subtext) {
      ctx.font = '600 54px "Outfit", sans-serif';
      ctx.fillText(text, x, h * 0.42);
      ctx.font = '500 32px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = isLightBg ? '#475569' : '#94a3b8';
      ctx.fillText(subtext, x, h * 0.72);
    } else {
      ctx.font = '700 70px "Outfit", sans-serif';
      ctx.fillText(text, x, h / 2);
    }
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy),
  };
}

function createWarningDecalTexture(maxAnisotropy: number): ProceduralTextureSet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#22262d';
  ctx.fillRect(0, 0, size, size);

  // Yellow ISO high-voltage safety triangle
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 22;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.1);
  ctx.lineTo(size * 0.9, size * 0.86);
  ctx.lineTo(size * 0.1, size * 0.86);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lightning bolt glyph
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.moveTo(size * 0.52, size * 0.3);
  ctx.lineTo(size * 0.41, size * 0.56);
  ctx.lineTo(size * 0.52, size * 0.56);
  ctx.lineTo(size * 0.46, size * 0.77);
  ctx.lineTo(size * 0.62, size * 0.5);
  ctx.lineTo(size * 0.51, size * 0.5);
  ctx.closePath();
  ctx.fill();

  return { map: configureColorTexture(canvas, maxAnisotropy) };
}

function createAmadaBadgeTexture(maxAnisotropy: number): ProceduralTextureSet {
  const w = 1024;
  const h = 280;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#171a1f';
  ctx.fillRect(0, 0, w, h);

  // Signature AMADA stylized A-arch mark on left
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.roundRect(38, 38, 174, 204, 88);
  ctx.fill();
  ctx.fillStyle = '#df5624';
  ctx.beginPath();
  ctx.arc(125, 146, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#171a1f';
  ctx.fillRect(94, 152, 62, 92);

  // Bold industrial AMADA wordmark
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 148px "Outfit", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('MADA', 238, 154);

  return { map: configureColorTexture(canvas, maxAnisotropy) };
}

function createIndustrialConsoleTexture(maxAnisotropy: number): ProceduralTextureSet {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#252930';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#3f4652';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  // Upper digital LED counter displays (orange/red + green readouts)
  ctx.fillStyle = '#0d1015';
  ctx.fillRect(54, 48, 210, 86);
  ctx.fillStyle = '#ef4444';
  ctx.font = '700 44px "JetBrains Mono", monospace';
  ctx.fillText('0048.5', 74, 106);

  ctx.fillStyle = '#0d1015';
  ctx.fillRect(300, 48, 280, 124);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 22px "JetBrains Mono", monospace';
  ctx.fillText('SPEED   68 m/min', 320, 92);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('FEED    14 mm/min', 320, 134);

  // Right analog pressure / blade tension dial gauge
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(760, 126, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(760, 126);
  ctx.lineTo(804, 86);
  ctx.stroke();

  // Middle bank: rotary selector dials & indicator lamps
  const dialX = [148, 360, 560, 760];
  for (const cx of dialX) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, 290, 52, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    ctx.fillStyle = '#12151b';
    ctx.beginPath();
    ctx.arc(cx, 290, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(cx - 4, 256, 8, 32);
  }

  // Lower matrix: industrial illuminated pushbuttons & toggle switches
  const colors = ['#22c55e', '#ef4444', '#facc15', '#3b82f6', '#e2e8f0', '#22c55e', '#f97316', '#ef4444'];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 8; c++) {
      const bx = 76 + c * 112;
      const by = 414 + r * 92;
      ctx.fillStyle = '#111419';
      ctx.beginPath();
      ctx.arc(bx, by, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors[(c + r * 3) % colors.length];
      ctx.beginPath();
      ctx.arc(bx, by, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { map: configureColorTexture(canvas, maxAnisotropy) };
}

function createCraftsmanLogoTexture(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex || '#e21b22';
  ctx.fillRect(0, 0, w, h);

  // Subtle molded satin sheen gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Bold white Craftsman wordmark
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 116px "Impact", "Arial Black", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(w * 0.5, h * 0.53);
  ctx.scale(1.06, 1.0);
  ctx.fillText('CRAFTSMAN', 0, 0);
  ctx.restore();

  return {
    map: configureColorTexture(canvas, maxAnisotropy),
  };
}

function createCraftsmanV20BadgeTexture(maxAnisotropy: number): ProceduralTextureSet {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Dark charcoal badge plate
  ctx.fillStyle = '#1f2329';
  ctx.fillRect(0, 0, w, h);

  // Outer red chamfered technical border
  ctx.strokeStyle = '#e21b22';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(34, 24);
  ctx.lineTo(w - 58, 24);
  ctx.lineTo(w - 22, 128);
  ctx.lineTo(w - 58, h - 24);
  ctx.lineTo(34, h - 24);
  ctx.closePath();
  ctx.stroke();

  // Left V20 dark box with white frame
  ctx.fillStyle = '#14171c';
  ctx.fillRect(52, 42, 465, h - 84);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 7;
  ctx.strokeRect(52, 42, 465, h - 84);

  // Red "V" + bold white "20"
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ef232a';
  ctx.font = '900 124px "Impact", "Arial Black", sans-serif';
  ctx.fillText('V', 74, h * 0.54);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('20', 142, h * 0.54);

  // Diagonal crimson speed stripes inside the V20 frame
  ctx.save();
  ctx.beginPath();
  ctx.rect(282, 50, 224, h - 100);
  ctx.clip();
  ctx.fillStyle = '#d82128';
  for (let i = -2; i < 12; i++) {
    const sx = 285 + i * 28;
    ctx.beginPath();
    ctx.moveTo(sx, h - 42);
    ctx.lineTo(sx + 16, h - 42);
    ctx.lineTo(sx + 48, 42);
    ctx.lineTo(sx + 32, 42);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Right crimson 2.0 AH LITHIUM ION block
  ctx.fillStyle = '#e21b22';
  ctx.beginPath();
  ctx.moveTo(532, 42);
  ctx.lineTo(w - 66, 42);
  ctx.lineTo(w - 38, 128);
  ctx.lineTo(w - 66, h - 86);
  ctx.lineTo(532, h - 86);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#181b20';
  ctx.font = '900 104px "Impact", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('2.0', 715, 112);

  ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('AH', 840, 120);

  // Bottom white "LITHIUM ION" subtext
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 38px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LITHIUM ION', 742, h - 54);

  return {
    map: configureColorTexture(canvas, maxAnisotropy),
  };
}

function createClutchDialRingTexture(maxAnisotropy: number): ProceduralTextureSet {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#202328';
  ctx.fillRect(0, 0, w, h);

  // Subtle horizontal collar seam lines
  ctx.fillStyle = '#15181c';
  ctx.fillRect(0, 0, w, 16);
  ctx.fillRect(0, h - 16, w, 16);

  // Crisp white circumferential torque markings (1..21 + drill icon)
  const marks = ['1', '3', '5', '7', '9', '11', '13', '15', '17', '19', '21', 'DRILL'];
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < marks.length; i++) {
    const cx = ((i + 0.5) / marks.length) * w;
    // Small tick mark between numbers
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(cx - 2.5, h * 0.5 - 24, 5, 16);
    ctx.fillRect(cx - 2.5, h * 0.5 + 8, 5, 16);

    const nx = ((i + 1) / marks.length) * w;
    ctx.save();
    ctx.translate(nx % w, h * 0.52);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.font =
      marks[i] === 'DRILL'
        ? '700 32px "Plus Jakarta Sans", sans-serif'
        : '800 52px "JetBrains Mono", "Plus Jakarta Sans", monospace';
    ctx.fillText(marks[i], 0, 0);
    ctx.restore();
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy),
  };
}

function createRubberOvermoldTexture(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex || '#22262c';
  ctx.fillRect(0, 0, size, size);

  const bump = document.createElement('canvas');
  bump.width = size;
  bump.height = size;
  const bCtx = bump.getContext('2d')!;
  bCtx.fillStyle = '#787878';
  bCtx.fillRect(0, 0, size, size);

  // Fine molded elastomer pebble + horizontal micro-rib texture
  for (let y = 0; y < size; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(0, y, size, 2);
    bCtx.fillStyle = y % 12 === 0 ? '#a8a8a8' : '#4a4a4a';
    bCtx.fillRect(0, y, size, 2);
  }
  for (let i = 0; i < 1400; i++) {
    const px = (i * 53) % size;
    const py = (i * 97) % size;
    bCtx.fillStyle = i % 2 === 0 ? '#9e9e9e' : '#585858';
    bCtx.fillRect(px, py, 2, 2);
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy, 4, 4),
    bumpMap: configureDataTexture(bump, maxAnisotropy, 4, 4),
  };
}

function createRyobiLogoTexture(maxAnisotropy: number): ProceduralTextureSet {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Matte jet-black molded nameplate backdrop
  ctx.fillStyle = '#15181d';
  ctx.fillRect(0, 0, w, h);

  // Subtle recessed dark-charcoal inner bevel border
  ctx.strokeStyle = '#333942';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.roundRect(18, 22, w - 36, h - 44, 28);
  ctx.stroke();

  // Crisp subtle metallic top highlight
  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  // Bold industrial white RYOBI wordmark
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 284px "Arial Black", "Impact", "Outfit", sans-serif';
  ctx.save();
  ctx.translate(w * 0.5, h * 0.53);
  ctx.scale(0.94, 1.0);
  ctx.fillText('RYOBI', 0, 0);
  ctx.restore();

  return {
    map: configureColorTexture(canvas, maxAnisotropy),
  };
}

/**
 * Generates seamless 512x512 hot-dip galvanized crystalline zinc spangle textures:
 * - Albedo map: warm-neutral industrial zinc gray with faceted Voronoi crystal mottling
 * - Roughness map: per-crystal specular sheen variation (0.28..0.64) so individual spangles glint realistically
 * - Bump map: crisp micro-step relief along crystal grain boundaries + fine galvanized zinc texture
 */
function renderGalvanizedSpangleBase(
  size: number,
  baseHex: string,
  seedInit: number
): {
  colorCanvas: HTMLCanvasElement;
  bumpCanvas: HTMLCanvasElement;
  roughCanvas: HTMLCanvasElement;
} {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const [br, bg, bb] = hexToRgb(baseHex || '#95928c');

  // Deterministic PRNG for repeatable photorealistic crystalline zinc spangle
  let seed = seedInit >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Jittered periodic Voronoi grid (16x16 = 256 seamless spangle crystals per tile)
  const gridN = 16;
  const cellSize = size / gridN;
  const ptsX = new Float32Array(gridN * gridN);
  const ptsY = new Float32Array(gridN * gridN);
  const cellTone = new Float32Array(gridN * gridN);
  const cellWarm = new Float32Array(gridN * gridN);
  const cellRough = new Float32Array(gridN * gridN);
  const cellBump = new Float32Array(gridN * gridN);
  const cellAngle = new Float32Array(gridN * gridN);

  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const idx = gy * gridN + gx;
      ptsX[idx] = (gx + 0.14 + rand() * 0.72) * cellSize;
      ptsY[idx] = (gy + 0.14 + rand() * 0.72) * cellSize;
      // Refined hot-dip galvanized zinc contrast (realistic satin silver spangle, not overly blotchy)
      const r1 = rand();
      cellTone[idx] = (r1 - 0.48) * 36 + (rand() > 0.82 ? 10 : 0) - (rand() > 0.86 ? 10 : 0);
      cellWarm[idx] = (rand() - 0.44) * 5;
      // Subtle per-crystal satin roughness variation (0.34 .. 0.54)
      cellRough[idx] = 0.44 - (cellTone[idx] / 60) * 0.12 + (rand() - 0.5) * 0.05;
      cellBump[idx] = 122 + rand() * 14;
      cellAngle[idx] = rand() * Math.PI * 2;
    }
  }

  // Secondary coarser macro-mottling grid (5x5 seamless zinc dip tone)
  const macroN = 5;
  const macroVal = new Float32Array(macroN * macroN);
  for (let i = 0; i < macroVal.length; i++) {
    macroVal[i] = (rand() - 0.5) * 14;
  }
  const sampleMacro = (x: number, y: number): number => {
    const fx = (x / size) * macroN;
    const fy = (y / size) * macroN;
    const x0 = Math.floor(fx) % macroN;
    const y0 = Math.floor(fy) % macroN;
    const x1 = (x0 + 1) % macroN;
    const y1 = (y0 + 1) % macroN;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v00 = macroVal[y0 * macroN + x0];
    const v10 = macroVal[y0 * macroN + x1];
    const v01 = macroVal[y1 * macroN + x0];
    const v11 = macroVal[y1 * macroN + x1];
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
  };

  const cImg = ctx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const cData = cImg.data;
  const bData = bImg.data;
  const rData = rImg.data;

  for (let y = 0; y < size; y++) {
    const gy = Math.floor(y / cellSize);
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / cellSize);

      let bestD2 = 1e12;
      let secondD2 = 1e12;
      let bestIdx = 0;

      for (let oy = -1; oy <= 1; oy++) {
        const ngy = (gy + oy + gridN) % gridN;
        const wrapY = gy + oy < 0 ? -size : gy + oy >= gridN ? size : 0;
        for (let ox = -1; ox <= 1; ox++) {
          const ngx = (gx + ox + gridN) % gridN;
          const wrapX = gx + ox < 0 ? -size : gx + ox >= gridN ? size : 0;
          const idx = ngy * gridN + ngx;
          const dx = x - (ptsX[idx] + wrapX);
          const dy = y - (ptsY[idx] + wrapY);
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            secondD2 = bestD2;
            bestD2 = d2;
            bestIdx = idx;
          } else if (d2 < secondD2) {
            secondD2 = d2;
          }
        }
      }

      const d1 = Math.sqrt(bestD2);
      const d2 = Math.sqrt(secondD2);
      const edgeDist = d2 - d1;
      // Subtle zinc grain boundary crease
      const seamDark = edgeDist < 1.5 ? (1.5 - edgeDist) * 3.8 : 0;

      // Gentle directional crystalline feathering inside each zinc spangle
      const ang = cellAngle[bestIdx];
      const feather = Math.sin((x * Math.cos(ang) + y * Math.sin(ang)) * 0.35) * 2.2;
      // Very subtle micro-grain (kept out of height channel so Sobel normals stay clean)
      const hHash = ((x * 374761393 + y * 668265263) ^ (bestIdx * 1274126177)) >>> 0;
      const micro = (((hHash ^ (hHash >> 13)) * 1274126177) >>> 24) / 255 - 0.5;

      const macro = sampleMacro(x, y);
      const tone = cellTone[bestIdx] + macro + feather + micro * 3.5 - seamDark;
      const warm = cellWarm[bestIdx];

      const p = (y * size + x) * 4;
      cData[p] = clampByte(br + tone + warm * 0.5);
      cData[p + 1] = clampByte(bg + tone + warm * 0.2);
      cData[p + 2] = clampByte(bb + tone - warm * 0.4);
      cData[p + 3] = 255;

      const bv = clampByte(cellBump[bestIdx] + feather * 0.5 - seamDark * 1.1);
      bData[p] = bv;
      bData[p + 1] = bv;
      bData[p + 2] = bv;
      bData[p + 3] = 255;

      const roughNorm = Math.max(0.3, Math.min(0.62, cellRough[bestIdx] - macro * 0.002 + seamDark * 0.008 + micro * 0.015));
      const rv = clampByte(roughNorm * 255);
      rData[p] = rv;
      rData[p + 1] = rv;
      rData[p + 2] = rv;
      rData[p + 3] = 255;
    }
  }

  ctx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return { colorCanvas, bumpCanvas, roughCanvas };
}

function createGalvanizedSteelTextures(
  maxAnisotropy: number,
  baseHex: string
): ProceduralTextureSet {
  const { colorCanvas, bumpCanvas, roughCanvas } = renderGalvanizedSpangleBase(512, baseHex, 91427);
  const map = configureColorTexture(colorCanvas, maxAnisotropy, 1, 1);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const bumpMap = configureDataTexture(bumpCanvas, maxAnisotropy, 1, 1);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  const normalMap = createNormalMapFromHeightCanvas(bumpCanvas, 0.55, maxAnisotropy, 1, 1);
  const roughnessMap = configureDataTexture(roughCanvas, maxAnisotropy, 1, 1);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap, normalMap, roughnessMap };
}

function createGalvanizedDiamondPlateTextures(
  maxAnisotropy: number,
  baseHex: string
): ProceduralTextureSet {
  const size = 512;
  const { colorCanvas, bumpCanvas, roughCanvas } = renderGalvanizedSpangleBase(
    size,
    baseHex || '#a3a09a',
    42071
  );
  const ctx = colorCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  // Industrial galvanized checker/diamond-plate raised alternating 45° tear-drop lugs
  // At 0.26 m world tile, 8x8 cells => ~32.5 mm lug pitch (1:1 real ASTM A786 floor plate!)
  const cells = 8;
  const cell = size / cells;

  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const alt = (row + col) % 2 === 0;
      const cx = (col + 0.5) * cell;
      const cy = (row + 0.5) * cell;
      const rot = alt ? Math.PI / 4 : -Math.PI / 4;
      const rx = cell * 0.34;
      const ry = cell * 0.115;

      // Subtle shaded base fillet around each stamped diamond lug
      ctx.save();
      ctx.translate(cx + 1.2, cy + 1.6);
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(38, 35, 32, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 1.04, ry * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Bright galvanized lug crest catching studio overhead light
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      const lugGrad = ctx.createLinearGradient(0, -ry, 0, ry);
      lugGrad.addColorStop(0, 'rgba(232, 230, 226, 0.58)');
      lugGrad.addColorStop(0.5, 'rgba(182, 180, 175, 0.32)');
      lugGrad.addColorStop(1, 'rgba(82, 78, 74, 0.30)');
      ctx.fillStyle = lugGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // High-relief beveled diamond lug in bump map (base spangle sits around ~128, crest rises to 248)
      bCtx.save();
      bCtx.translate(cx, cy);
      bCtx.rotate(rot);
      const bGrad = bCtx.createRadialGradient(0, 0, ry * 0.15, 0, 0, rx);
      bGrad.addColorStop(0, '#fcfcfc');
      bGrad.addColorStop(0.65, '#dcdcdc');
      bGrad.addColorStop(1, '#848484');
      bCtx.fillStyle = bGrad;
      bCtx.beginPath();
      bCtx.ellipse(0, 0, rx * 1.05, ry * 1.15, 0, 0, Math.PI * 2);
      bCtx.fill();
      bCtx.restore();

      // Polished smoother specular highlight on raised lug crests in roughnessMap (~0.26)
      rCtx.save();
      rCtx.translate(cx, cy);
      rCtx.rotate(rot);
      rCtx.fillStyle = 'rgb(70, 70, 70)';
      rCtx.beginPath();
      rCtx.ellipse(0, 0, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
      rCtx.fill();
      rCtx.restore();
    }
  }

  const map = configureColorTexture(colorCanvas, maxAnisotropy, 1, 1);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const bumpMap = configureDataTexture(bumpCanvas, maxAnisotropy, 1, 1);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  const normalMap = createNormalMapFromHeightCanvas(bumpCanvas, 1.65, maxAnisotropy, 1, 1);
  const roughnessMap = configureDataTexture(roughCanvas, maxAnisotropy, 1, 1);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap, normalMap, roughnessMap };
}

/**
 * Photorealistic industrial painted / powder-coated steel (alkyd enamel / polyurethane shop coat):
 * Seamless periodic powder-coat micro-orange-peel bump, subtle multi-scale spray-coat tonal variation,
 * and realistic satin-enamel roughness modulation (0.31 .. 0.45) over fabricated steel.
 */
function createPaintedIndustrialSteelTextures(
  maxAnisotropy: number,
  baseHex: string
): ProceduralTextureSet {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const [br, bg, bb] = hexToRgb(baseHex || '#464e56');
  const cImg = cCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  const hash2 = (x: number, y: number, seed: number): number => {
    let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1274126177, 2246822519) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  const smoothTileNoise = (px: number, py: number, grid: number, seed: number): number => {
    const gx = (px / size) * grid;
    const gy = (py / size) * grid;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const x1 = (x0 + 1) % grid;
    const y1 = (y0 + 1) % grid;
    const xm = x0 % grid;
    const ym = y0 % grid;
    const n00 = hash2(xm, ym, seed);
    const n10 = hash2(x1, ym, seed);
    const n01 = hash2(xm, y1, seed);
    const n11 = hash2(x1, y1, seed);
    return (n00 * (1 - ux) + n10 * ux) * (1 - uy) + (n01 * (1 - ux) + n11 * ux) * uy;
  };

  const cData = cImg.data;
  const bData = bImg.data;
  const rData = rImg.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Smooth, clean industrial 2-part epoxy / polyurethane coating (virtually flat flow-leveling)
      const macroFlow = smoothTileNoise(x, y, 4, 9101);
      const softWave = smoothTileNoise(x, y, 12, 17443);
      const microFlow = smoothTileNoise(x, y, 24, 31991);

      // Uniform factory epoxy color (subtle ±0.8% natural depth, zero blotching or grainy noise)
      const shade = 0.992 + macroFlow * 0.012 + (softWave - 0.5) * 0.005;
      const idx = (y * size + x) * 4;
      cData[idx] = clampByte(br * shade);
      cData[idx + 1] = clampByte(bg * shade);
      cData[idx + 2] = clampByte(bb * shade);
      cData[idx + 3] = 255;

      // Whisper-subtle cured epoxy flow-leveling heightfield (no pixel static!)
      const hVal = clampByte(128 + (softWave - 0.5) * 7 + (microFlow - 0.5) * 4);
      bData[idx] = hVal;
      bData[idx + 1] = hVal;
      bData[idx + 2] = hVal;
      bData[idx + 3] = 255;

      // Smooth semi-gloss industrial epoxy sheen (roughness 0.25 .. 0.30 => 64 .. 77)
      const rVal = clampByte(66 + (1 - macroFlow) * 7 + microFlow * 4);
      rData[idx] = rVal;
      rData[idx + 1] = rVal;
      rData[idx + 2] = rVal;
      rData[idx + 3] = 255;
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const map = configureColorTexture(colorCanvas, maxAnisotropy, 1, 1);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const bumpMap = configureDataTexture(bumpCanvas, maxAnisotropy, 1, 1);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  const normalMap = createNormalMapFromHeightCanvas(bumpCanvas, 0.25, maxAnisotropy, 1, 1);
  const roughnessMap = configureDataTexture(roughCanvas, maxAnisotropy, 1, 1);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap, normalMap, roughnessMap };
}

/**
 * Clean plasma-nitrided gunmetal tool-steel surface with laser-etched 100 mm coordinate grid
 * (20 x 10 cells across 2000 x 1000 mm) and millimeter ruler markings along perimeter edges.
 * Intentionally ultra-smooth with zero coarse noise so HDR softbox reflections read as real CNC-ground steel.
 */
function createWeldingTableGridTexture(
  maxAnisotropy: number,
  baseHex: string
): ProceduralTextureSet {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const [br, bg, bb] = hexToRgb(baseHex || '#616a75');

  // Smooth CNC surface-ground gunmetal steel base with subtle studio-lit sheen gradient
  const baseGrad = ctx.createLinearGradient(0, 0, w, h);
  baseGrad.addColorStop(0, `rgb(${clampByte(br + 7)},${clampByte(bg + 8)},${clampByte(bb + 10)})`);
  baseGrad.addColorStop(0.5, `rgb(${br},${bg},${bb})`);
  baseGrad.addColorStop(1, `rgb(${clampByte(br - 6)},${clampByte(bg - 6)},${clampByte(bb - 5)})`);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Ultra-fine horizontal surface-grinding micro-passes (barely perceptible)
  for (let y = 0; y < h; y += 3) {
    const shade = (y % 6 === 0) ? 'rgba(255,255,255,0.016)' : 'rgba(10,14,20,0.018)';
    ctx.fillStyle = shade;
    ctx.fillRect(0, y, w, 1);
  }

  const cols = 20;
  const rows = 10;
  const cellW = w / cols;
  const cellH = h / rows;

  // Crisp 100 mm laser-etched coordinate grid lines (passing right through diagonal hole centers)
  ctx.strokeStyle = 'rgba(20, 24, 30, 0.52)';
  ctx.lineWidth = 2.0;
  for (let c = 1; c < cols; c++) {
    const x = Math.round(c * cellW) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = Math.round(r * cellH) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Subtle metallic highlight flanking etched lines
  ctx.strokeStyle = 'rgba(225, 232, 240, 0.14)';
  ctx.lineWidth = 1.0;
  for (let c = 1; c < cols; c++) {
    const x = Math.round(c * cellW) + 2.0;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = Math.round(r * cellH) + 2.0;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Front (+Z = bottom of UV v=1) and Back (-Z = top of UV v=0) millimeter ruler scale ticks & numbers
  const drawHorizontalRuler = (edgeY: number, dir: 1 | -1) => {
    ctx.strokeStyle = 'rgba(18, 22, 28, 0.62)';
    ctx.fillStyle = 'rgba(20, 24, 30, 0.68)';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Every 10 mm tick (200 ticks across 2000 mm)
    for (let mm = 10; mm < 2000; mm += 10) {
      const x = (mm / 2000) * w;
      const is100 = mm % 100 === 0;
      const is50 = mm % 50 === 0;
      const tickLen = is100 ? 14 : is50 ? 10 : 6;
      ctx.lineWidth = is100 ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.moveTo(x, edgeY);
      ctx.lineTo(x, edgeY + dir * tickLen);
      ctx.stroke();

      if (is100 && mm >= 100 && mm <= 1900) {
        const cmLabel = String(mm / 10);
        ctx.fillText(cmLabel, x, edgeY + dir * 24);
      }
    }
  };

  // Front edge (+Z => y = h) and Back edge (-Z => y = 0)
  drawHorizontalRuler(h - 2, -1);
  drawHorizontalRuler(2, 1);

  // Left (-X) and Right (+X) millimeter ruler scale ticks
  const drawVerticalRuler = (edgeX: number, dir: 1 | -1) => {
    ctx.strokeStyle = 'rgba(18, 22, 28, 0.58)';
    for (let mm = 10; mm < 1000; mm += 10) {
      const y = (mm / 1000) * h;
      const is100 = mm % 100 === 0;
      const is50 = mm % 50 === 0;
      const tickLen = is100 ? 13 : is50 ? 9 : 5;
      ctx.lineWidth = is100 ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.moveTo(edgeX, y);
      ctx.lineTo(edgeX + dir * tickLen, y);
      ctx.stroke();
    }
  };
  drawVerticalRuler(w - 2, -1);
  drawVerticalRuler(2, 1);

  // Crisp perimeter chamfer rim frame
  ctx.strokeStyle = 'rgba(230, 238, 246, 0.28)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  const map = configureColorTexture(canvas, maxAnisotropy, 1, 1);
  return { map };
}

export function getProceduralTextureSet(
  kind: ProceduralTextureKind | undefined,
  baseHex: string,
  maxAnisotropy: number,
  labelText?: string,
  labelSubtext?: string
): ProceduralTextureSet {
  if (!kind || kind === 'none' || typeof document === 'undefined') return {};

  const cacheKey = `${kind}|${baseHex}|${labelText || ''}|${labelSubtext || ''}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  let result: ProceduralTextureSet = {};
  switch (kind) {
    case 'diamondPlate':
      result = createDiamondPlateTextures(maxAnisotropy);
      break;
    case 'brushedMetal':
      result = createBrushedMetalTextures(maxAnisotropy, baseHex);
      break;
    case 'woodGrain':
      result = createWoodGrainTextures(maxAnisotropy, baseHex);
      break;
    case 'stackedStone':
      result = createStackedStoneTextures(maxAnisotropy, baseHex);
      break;
    case 'fireplaceFlames':
      result = createFireplaceFlamesTextures(maxAnisotropy);
      break;
    case 'glitterFinish':
      result = createGlitterFinishTextures(maxAnisotropy, baseHex);
      break;
    case 'wovenFabric':
      result = createWovenFabricTextures(maxAnisotropy, baseHex);
      break;
    case 'marbleStone':
      result = createMarbleStoneTextures(maxAnisotropy, baseHex);
      break;
    case 'celosScreen':
      result = createCelosScreenTexture(maxAnisotropy);
      break;
    case 'controlKeypad':
      result = createControlKeypadTexture(maxAnisotropy);
      break;
    case 'industrialConsole':
      result = createIndustrialConsoleTexture(maxAnisotropy);
      break;
    case 'warningDecal':
      result = createWarningDecalTexture(maxAnisotropy);
      break;
    case 'amadaBadge':
      result = createAmadaBadgeTexture(maxAnisotropy);
      break;
    case 'ventedLouvers':
      result = createVentedLouversTexture(maxAnisotropy, baseHex);
      break;
    case 'knurled':
      result = createDiamondPlateTextures(maxAnisotropy);
      break;
    case 'dmuHeaderSign':
      result = createSilkscreenTexture(maxAnisotropy, '#14181f', 'DMU 125 monoBLOCK®');
      break;
    case 'dmgMoriBadge':
      result = createSilkscreenTexture(maxAnisotropy, '#232830', 'DMG MORI');
      break;
    case 'fiveAxisBadge':
      result = createSilkscreenTexture(
        maxAnisotropy,
        '#171c23',
        '5-Axis-Champion   |   DECKEL MAHO',
        undefined,
        false,
        true
      );
      break;
    case 'spindleStripe':
      result = createSilkscreenTexture(maxAnisotropy, '#14181e', 'DMG MORI', undefined, true);
      break;
    case 'silkscreenLabel':
      result = createSilkscreenTexture(
        maxAnisotropy,
        baseHex,
        labelText || 'PRECISION CAD',
        labelSubtext
      );
      break;
    case 'craftsmanLogo':
      result = createCraftsmanLogoTexture(maxAnisotropy, baseHex);
      break;
    case 'craftsmanV20Badge':
      result = createCraftsmanV20BadgeTexture(maxAnisotropy);
      break;
    case 'clutchDialRing':
      result = createClutchDialRingTexture(maxAnisotropy);
      break;
    case 'rubberOvermold':
      result = createRubberOvermoldTexture(maxAnisotropy, baseHex);
      break;
    case 'ryobiLogo':
      result = createRyobiLogoTexture(maxAnisotropy);
      break;
    case 'galvanizedSteel':
      result = createGalvanizedSteelTextures(maxAnisotropy, baseHex);
      break;
    case 'galvanizedDiamondPlate':
      result = createGalvanizedDiamondPlateTextures(maxAnisotropy, baseHex);
      break;
    case 'paintedIndustrialSteel':
      result = createPaintedIndustrialSteelTextures(maxAnisotropy, baseHex);
      break;
    case 'weldingTableGrid':
      result = createWeldingTableGridTexture(maxAnisotropy, baseHex);
      break;
    case 'haimerScreen':
      result = createHaimerScreenTexture(maxAnisotropy);
      break;
    case 'fdmLayerLines':
      result = createFdmLayerLinesTextures(maxAnisotropy, baseHex);
      break;
    default:
      result = {};
  }

  textureCache.set(cacheKey, result);
  return result;
}

/**
 * Generates authentic horizontal 3D-printed FDM/FFF PLA layer-line striations:
 * subtle periodic vertical micro-ridges (0.2 mm layer pitch feel) with a tangent-space
 * normal map and micro-roughness variation so matte charcoal facets catch grazing light
 * identically to a real desktop 3D-printed architectural vessel.
 */
function createFdmLayerLinesTextures(
  maxAnisotropy: number,
  baseHex: string
): ProceduralTextureSet {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = size;
  heightCanvas.height = size;
  const hCtx = heightCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const [br, bg, bb] = hexToRgb(baseHex);
  const cImg = ctx.createImageData(size, size);
  const hImg = hCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  let seed = 41927;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Precompute subtle per-layer extrusion width/flow jitter (96 layers per tile)
  const layerCount = 96;
  const layerJitter = new Float32Array(layerCount);
  for (let l = 0; l < layerCount; l++) {
    layerJitter[l] = (rand() - 0.5) * 0.22;
  }

  for (let y = 0; y < size; y++) {
    const layerPos = (y / size) * layerCount;
    const layerIdx = Math.floor(layerPos) % layerCount;
    const frac = layerPos - Math.floor(layerPos);
    // Rounded cylindrical filament bead cross-section profile per horizontal layer
    const bead = Math.sin(frac * Math.PI);
    const profile = Math.pow(bead, 0.55) + layerJitter[layerIdx] * 0.25;

    for (let x = 0; x < size; x++) {
      // Very fine matte polymer grain + subtle extrusion ripple along X
      const ripple = Math.sin((x / size) * Math.PI * 12 + layerIdx * 1.7) * 0.04;
      const microGrain = (rand() - 0.5) * 0.045;
      const hVal = Math.max(0, Math.min(1, 0.22 + profile * 0.68 + ripple + microGrain));

      // Subtle albedo shading in layer valleys vs ridges
      const shade = (hVal - 0.55) * 26;
      const p = (y * size + x) * 4;
      cImg.data[p] = clampByte(br + shade);
      cImg.data[p + 1] = clampByte(bg + shade);
      cImg.data[p + 2] = clampByte(bb + shade);
      cImg.data[p + 3] = 255;

      const hb = clampByte(hVal * 255);
      hImg.data[p] = hb;
      hImg.data[p + 1] = hb;
      hImg.data[p + 2] = hb;
      hImg.data[p + 3] = 255;

      // Slightly glossier on filament bead crests, rougher in inter-layer crevices
      const rb = clampByte((0.68 - profile * 0.18 + microGrain * 0.5) * 255);
      rImg.data[p] = rb;
      rImg.data[p + 1] = rb;
      rImg.data[p + 2] = rb;
      rImg.data[p + 3] = 255;
    }
  }

  ctx.putImageData(cImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    map: configureColorTexture(colorCanvas, maxAnisotropy, 2, 2),
    bumpMap: configureDataTexture(heightCanvas, maxAnisotropy, 2, 2),
    normalMap: createNormalMapFromHeightCanvas(heightCanvas, 1.45, maxAnisotropy, 2, 2),
    roughnessMap: configureDataTexture(roughCanvas, maxAnisotropy, 2, 2),
  };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [80, 52, 38];
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return [80, 52, 38];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function createWoodGrainTextures(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = size;
  bump.height = size;
  const bCtx = bump.getContext('2d')!;

  const [br, bg, bb] = hexToRgb(baseHex);
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Organic wood cathedral grain streaks & pores
  for (let i = 0; i < 420; i++) {
    const x = (i * 137.5) % size;
    const waveAmp = 4 + (i % 9) * 1.4;
    const waveFreq = 0.008 + (i % 5) * 0.003;
    const delta = (i % 3 === 0 ? -24 : i % 3 === 1 ? 18 : -12) * (0.5 + ((i * 29) % 10) * 0.06);
    ctx.strokeStyle = `rgba(${clampByte(br + delta)},${clampByte(bg + delta * 0.88)},${clampByte(bb + delta * 0.78)},0.34)`;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    for (let y = 0; y <= size; y += 16) {
      const px = x + Math.sin(y * waveFreq + i) * waveAmp;
      if (y === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();

    const bv = clampByte(128 + delta * 1.6);
    bCtx.strokeStyle = `rgba(${bv},${bv},${bv},0.28)`;
    bCtx.lineWidth = 1;
    bCtx.beginPath();
    for (let y = 0; y <= size; y += 16) {
      const px = x + Math.sin(y * waveFreq + i) * waveAmp;
      if (y === 0) bCtx.moveTo(px, y);
      else bCtx.lineTo(px, y);
    }
    bCtx.stroke();
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy, 1, 1),
    bumpMap: configureDataTexture(bump, maxAnisotropy, 1, 1),
  };
}

function createStackedStoneTextures(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = size;
  bump.height = size;
  const bCtx = bump.getContext('2d')!;

  // Deep shadow mortar background
  ctx.fillStyle = '#25211e';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#181818';
  bCtx.fillRect(0, 0, size, size);

  const [br, bg, bb] = hexToRgb(baseHex);
  const rows = 16;
  const rowH = size / rows;
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let r = 0; r < rows; r++) {
    let x = -Math.floor(rand() * 48);
    const y = r * rowH;
    while (x < size) {
      const w = 52 + Math.floor(rand() * 96);
      const toneShift = (rand() - 0.5) * 58;
      const warmShift = (rand() - 0.45) * 26;
      const sr = clampByte(br + toneShift + warmShift);
      const sg = clampByte(bg + toneShift + warmShift * 0.65);
      const sb = clampByte(bb + toneShift - warmShift * 0.25);

      const gap = 2.2;
      const rx = x + gap * 0.5;
      const ry = y + gap * 0.5;
      const rw = Math.max(8, w - gap);
      const rh = Math.max(6, rowH - gap);

      const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
      grad.addColorStop(0, `rgb(${clampByte(sr + 16)},${clampByte(sg + 15)},${clampByte(sb + 14)})`);
      grad.addColorStop(0.55, `rgb(${sr},${sg},${sb})`);
      grad.addColorStop(1, `rgb(${clampByte(sr - 22)},${clampByte(sg - 22)},${clampByte(sb - 20)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rw, rh);

      // Split-face mineral striations
      for (let s = 0; s < 5; s++) {
        const ly = ry + rand() * rh;
        ctx.fillStyle = rand() > 0.5 ? 'rgba(255,250,242,0.11)' : 'rgba(18,15,12,0.16)';
        ctx.fillRect(rx + 2, ly, rw - 4, 1 + rand() * 2.2);
      }

      // Deep relief height variation per ledger block
      const heightVal = clampByte(115 + rand() * 125);
      bCtx.fillStyle = `rgb(${heightVal},${heightVal},${heightVal})`;
      bCtx.fillRect(rx + 1, ry + 1, rw - 2, rh - 2);

      x += w;
    }
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy, 1, 1),
    bumpMap: configureDataTexture(bump, maxAnisotropy, 1, 1),
  };
}

function createFireplaceFlamesTextures(maxAnisotropy: number): ProceduralTextureSet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark soot firebox interior
  const bgGrad = ctx.createLinearGradient(0, 0, 0, size);
  bgGrad.addColorStop(0, '#0b0909');
  bgGrad.addColorStop(0.55, '#1d120b');
  bgGrad.addColorStop(1, '#120a06');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle firebox brick back wall
  ctx.strokeStyle = 'rgba(70, 42, 24, 0.22)';
  ctx.lineWidth = 2;
  for (let y = 32; y < size * 0.78; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Warm ambient fire halo
  const halo = ctx.createRadialGradient(size * 0.5, size * 0.72, 24, size * 0.5, size * 0.65, size * 0.48);
  halo.addColorStop(0, 'rgba(255, 168, 36, 0.92)');
  halo.addColorStop(0.42, 'rgba(245, 96, 16, 0.58)');
  halo.addColorStop(0.78, 'rgba(140, 34, 4, 0.22)');
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // Multi-layered rising flame tongues
  const flames = [
    { x: 135, w: 68, h: 175 },
    { x: 205, w: 84, h: 245 },
    { x: 268, w: 92, h: 265 },
    { x: 335, w: 78, h: 220 },
    { x: 392, w: 60, h: 160 },
  ];
  for (const f of flames) {
    const fGrad = ctx.createLinearGradient(f.x, size * 0.82 - f.h, f.x, size * 0.82);
    fGrad.addColorStop(0, 'rgba(255, 120, 12, 0.0)');
    fGrad.addColorStop(0.35, 'rgba(255, 138, 18, 0.68)');
    fGrad.addColorStop(0.72, 'rgba(255, 206, 64, 0.92)');
    fGrad.addColorStop(1, 'rgba(255, 244, 178, 0.98)');
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.moveTo(f.x - f.w * 0.5, size * 0.82);
    ctx.quadraticCurveTo(f.x - f.w * 0.35, size * 0.82 - f.h * 0.55, f.x + 8, size * 0.82 - f.h);
    ctx.quadraticCurveTo(f.x + f.w * 0.42, size * 0.82 - f.h * 0.5, f.x + f.w * 0.5, size * 0.82);
    ctx.closePath();
    ctx.fill();
  }

  // Glowing ember bed at bottom
  const emberGrad = ctx.createLinearGradient(0, size * 0.78, 0, size);
  emberGrad.addColorStop(0, '#ff9c1e');
  emberGrad.addColorStop(0.45, '#b83208');
  emberGrad.addColorStop(1, '#1a0d08');
  ctx.fillStyle = emberGrad;
  ctx.fillRect(30, size * 0.8, size - 60, size * 0.2);

  // Charred sculpted oak logs with glowing orange fissures
  const drawLog = (x1: number, y1: number, x2: number, y2: number, thickness: number) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ff9918';
    ctx.lineWidth = thickness + 8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = '#241710';
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Glowing bark cracks
    ctx.strokeStyle = '#ffbe38';
    ctx.lineWidth = 3;
    for (let t = 0.2; t <= 0.82; t += 0.16) {
      const mx = x1 + (x2 - x1) * t;
      const my = y1 + (y2 - y1) * t;
      ctx.beginPath();
      ctx.moveTo(mx - 8, my - thickness * 0.25);
      ctx.lineTo(mx + 6, my + thickness * 0.28);
      ctx.stroke();
    }
    ctx.restore();
  };

  drawLog(105, 425, 250, 355, 42);
  drawLog(405, 430, 275, 360, 44);
  drawLog(150, 452, 368, 445, 38);

  const colorTex = configureColorTexture(canvas, maxAnisotropy, 1, 1);
  return {
    map: colorTex,
    emissiveMap: colorTex,
  };
}

function createGlitterFinishTextures(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = size;
  bump.height = size;
  const bCtx = bump.getContext('2d')!;

  const [br, bg, bb] = hexToRgb(baseHex);
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#707070';
  bCtx.fillRect(0, 0, size, size);

  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < 6500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 2.4;
    const sparkle = rand();
    if (sparkle > 0.78) {
      ctx.fillStyle = 'rgba(255, 252, 240, 0.92)';
      bCtx.fillStyle = '#f5f5f5';
    } else if (sparkle > 0.42) {
      ctx.fillStyle = `rgba(${clampByte(br + 28)},${clampByte(bg + 26)},${clampByte(bb + 20)},0.75)`;
      bCtx.fillStyle = '#b4b4b4';
    } else {
      ctx.fillStyle = `rgba(${clampByte(br - 28)},${clampByte(bg - 28)},${clampByte(bb - 24)},0.65)`;
      bCtx.fillStyle = '#404040';
    }
    ctx.fillRect(x, y, r, r);
    bCtx.fillRect(x, y, r, r);
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy, 2, 2),
    bumpMap: configureDataTexture(bump, maxAnisotropy, 2, 2),
  };
}

function createWovenFabricTextures(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = size;
  bump.height = size;
  const bCtx = bump.getContext('2d')!;

  const [br, bg, bb] = hexToRgb(baseHex);
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const alt = ((x + y) / 4) % 2 === 0;
      const d = alt ? 12 : -12;
      ctx.fillStyle = `rgb(${clampByte(br + d)},${clampByte(bg + d)},${clampByte(bb + d)})`;
      ctx.fillRect(x, y, 3, 3);
      const bv = alt ? 168 : 96;
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, y, 3, 3);
    }
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy, 4, 4),
    bumpMap: configureDataTexture(bump, maxAnisotropy, 4, 4),
  };
}

function createMarbleStoneTextures(maxAnisotropy: number, baseHex: string): ProceduralTextureSet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const [br, bg, bb] = hexToRgb(baseHex);
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, size, size);

  for (let v = 0; v < 22; v++) {
    ctx.strokeStyle =
      v % 2 === 0
        ? `rgba(${clampByte(br - 42)},${clampByte(bg - 40)},${clampByte(bb - 38)},0.22)`
        : `rgba(${clampByte(br + 28)},${clampByte(bg + 28)},${clampByte(bb + 28)},0.18)`;
    ctx.lineWidth = 1.5 + (v % 4);
    ctx.beginPath();
    let y = (v * 31) % size;
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) {
      y += Math.sin(x * 0.015 + v * 1.7) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return {
    map: configureColorTexture(canvas, maxAnisotropy, 1, 1),
  };
}

function createHaimerScreenTexture(maxAnisotropy: number): ProceduralTextureSet {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Base metallic-slate HAIMER Microset UI frame
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(0, 0, w, h);

  // Top dark status bar
  ctx.fillStyle = '#1f2329';
  ctx.fillRect(0, 0, w, 26);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '600 13px Inter, system-ui, sans-serif';
  ctx.fillText('HAIMER Microset  |  UNO 20|70  |  Microvision III', 16, 17);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(w - 92, 8, 10, 10);
  ctx.fillStyle = '#d1d5db';
  ctx.fillText('READY', w - 76, 17);

  // Left vertical icon menu panel
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(10, 36, 195, 560);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 36, 195, 560);

  const leftItems = [
    'Messfunktion',
    'Kante',
    'Messkontur',
    'Messfenster manuell',
    'Messfenster autom.',
    'Auflicht',
    'Drucken',
  ];
  leftItems.forEach((label, i) => {
    const y = 48 + i * 44;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(18, y, 179, 36);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, y, 179, 36);
    ctx.fillStyle = '#334155';
    ctx.fillRect(26, y + 9, 18, 18);
    ctx.fillStyle = '#1e293b';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText(label, 52, y + 22);
  });

  // Top-center & top-right dark DRO coordinate header (X 0.157 mm / Z 153.445 mm + HAIMER branding)
  const droGrad = ctx.createLinearGradient(216, 36, 1010, 160);
  droGrad.addColorStop(0, '#1e2228');
  droGrad.addColorStop(1, '#2b313a');
  ctx.fillStyle = droGrad;
  ctx.fillRect(216, 36, 796, 132);

  // X and Z coordinate badges
  ctx.fillStyle = '#374151';
  ctx.fillRect(232, 52, 34, 42);
  ctx.fillRect(232, 104, 34, 42);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 22px Inter, system-ui, sans-serif';
  ctx.fillText('X', 241, 80);
  ctx.fillText('Z', 242, 132);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 36px ui-monospace, SFMono-Regular, monospace';
  ctx.fillText('0.157', 355, 84);
  ctx.fillText('153.445', 312, 136);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 16px Inter, system-ui, sans-serif';
  ctx.fillText('mm', 486, 84);
  ctx.fillText('mm', 486, 136);

  // HAIMER top-right logotype
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 34px Inter, system-ui, sans-serif';
  ctx.fillText('HAIMER.', 812, 82);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 13px Inter, system-ui, sans-serif';
  ctx.fillText('Maschine:  DMU 125', 812, 114);
  ctx.fillText('Adapter:   2-SK50-0', 812, 138);

  // Center telecentric live optical camera viewport (white backlight + crisp black cutting-tool silhouette!)
  const camX = 216;
  const camY = 178;
  const camW = 480;
  const camH = 418;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(camX, camY, camW, camH);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(camX, camY, camW, camH);

  // Backlit tool silhouette (triangular/beveled carbide cutter tip matching the uploaded photo!)
  const tipX = camX + camW * 0.5;
  const tipY = camY + 132;
  ctx.fillStyle = '#090b0f';
  ctx.beginPath();
  ctx.moveTo(camX + 42, camY + camH);
  ctx.lineTo(camX + 74, tipY + 62);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(camX + camW - 74, tipY + 62);
  ctx.lineTo(camX + camW - 42, camY + camH);
  ctx.closePath();
  ctx.fill();

  // Subtle green right-side measurement tolerance bar inside camera window
  ctx.fillStyle = '#15803d';
  ctx.fillRect(camX + camW - 22, camY + 4, 18, camH - 8);

  // Precision red telecentric measurement crosshairs locked onto the cutting-edge apex
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(camX, tipY);
  ctx.lineTo(camX + camW, tipY);
  ctx.moveTo(tipX, camY);
  ctx.lineTo(tipX, camY + camH);
  ctx.stroke();

  // Concentric crosshair target circle at apex
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 16, 0, Math.PI * 2);
  ctx.stroke();

  // Right soft-key panel
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(708, 178, 304, 418);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(708, 178, 304, 418);

  const rightBtns = [
    'Werkzeug',
    'Werkzeugsatz',
    'Adapter',
    'Maschine',
    'Einstellungen',
    'Datenausgabe',
    'Beenden',
  ];
  rightBtns.forEach((label, i) => {
    const y = 192 + i * 54;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(724, y, 272, 44);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(724, y, 272, 44);
    ctx.fillStyle = '#1e293b';
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    ctx.fillText(label, 742, y + 27);
  });

  // Bottom status bar
  ctx.fillStyle = '#1e2228';
  ctx.fillRect(0, 608, w, 32);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 13px ui-monospace, SFMono-Regular, monospace';
  ctx.fillText('ISS-SPINDLE SK50  ·  20x TELECENTRIC  ·  CALIBRATED ±0.002 mm', 16, 628);

  const tex = configureColorTexture(canvas, maxAnisotropy, 1, 1);
  return {
    map: tex,
    emissiveMap: tex,
  };
}

function loadPhotoImage(sourceImageUrl: string): Promise<HTMLImageElement> {
  const existing = photoImageCache.get(sourceImageUrl);
  if (existing) return existing;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load source photo for texture projection.'));
    img.src = sourceImageUrl;
  });
  photoImageCache.set(sourceImageUrl, p);
  return p;
}

/**
 * Projects an exact normalized [xMin, yMin, xMax, yMax] (0..1 from top-left) region
 * of the uploaded reference photograph directly onto a part's PBR material, paired
 * with an auto-synthesized luminance bump relief map for photorealistic surface depth.
 */
export function applyPhotoCropTextureToMaterial(
  sourceImageUrl: string,
  photoCrop: [number, number, number, number],
  material: THREE.MeshPhysicalMaterial,
  maxAnisotropy: number,
  onLoaded?: () => void
): void {
  if (!sourceImageUrl) return;
  const x0 = Math.max(0, Math.min(0.98, photoCrop[0]));
  const y0 = Math.max(0, Math.min(0.98, photoCrop[1]));
  const x1 = Math.max(x0 + 0.02, Math.min(1, photoCrop[2]));
  const y1 = Math.max(y0 + 0.02, Math.min(1, photoCrop[3]));

  const cacheKey = `photoCrop|${sourceImageUrl.slice(0, 64)}|${sourceImageUrl.length}|${x0.toFixed(3)},${y0.toFixed(3)},${x1.toFixed(3)},${y1.toFixed(3)}`;
  const cached = textureCache.get(cacheKey);
  if (cached?.map) {
    material.color.set('#ffffff');
    material.map = cached.map;
    if (cached.bumpMap) {
      material.bumpMap = cached.bumpMap;
      material.bumpScale = 0.005;
    }
    material.needsUpdate = true;
    onLoaded?.();
    return;
  }

  void loadPhotoImage(sourceImageUrl)
    .then((img) => {
      const sx = Math.floor(x0 * img.naturalWidth);
      const sy = Math.floor(y0 * img.naturalHeight);
      const sw = Math.max(8, Math.floor((x1 - x0) * img.naturalWidth));
      const sh = Math.max(8, Math.floor((y1 - y0) * img.naturalHeight));

      const outSize = 512;
      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = outSize;
      colorCanvas.height = outSize;
      const ctx = colorCanvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outSize, outSize);

      // Synthesize a subtle grayscale height/bump map from local luminance
      const bumpCanvas = document.createElement('canvas');
      bumpCanvas.width = 256;
      bumpCanvas.height = 256;
      const bCtx = bumpCanvas.getContext('2d')!;
      bCtx.drawImage(colorCanvas, 0, 0, 256, 256);
      const imgData = bCtx.getImageData(0, 0, 256, 256);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = clampByte(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        d[i] = lum;
        d[i + 1] = lum;
        d[i + 2] = lum;
      }
      bCtx.putImageData(imgData, 0, 0);

      const texSet: ProceduralTextureSet = {
        map: configureColorTexture(colorCanvas, maxAnisotropy, 1, 1),
        bumpMap: configureDataTexture(bumpCanvas, maxAnisotropy, 1, 1),
      };
      textureCache.set(cacheKey, texSet);

      material.color.set('#ffffff');
      material.map = texSet.map!;
      material.bumpMap = texSet.bumpMap!;
      material.bumpScale = 0.005;
      material.needsUpdate = true;
      onLoaded?.();
    })
    .catch(() => {
      // Fall back gracefully to procedural / solid color material
    });
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.49
  );
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.18)');
  grad.addColorStop(0.85, 'rgba(15, 23, 42, 0.04)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createZebraCurvatureMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uStripeDensity: { value: 26.0 },
      uContrast: { value: 0.92 },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uStripeDensity;
      uniform float uContrast;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vec3 R = reflect(-vViewDir, normalize(vNormalView));
        float band = sin((R.y * 0.85 + R.x * 0.35) * uStripeDensity);
        float stripe = smoothstep(-0.18, 0.18, band);
        vec3 darkCol = vec3(0.11, 0.14, 0.19);
        vec3 lightCol = vec3(0.95, 0.97, 0.99);
        float fresnel = pow(1.0 - max(dot(normalize(vNormalView), vViewDir), 0.0), 2.5);
        vec3 col = mix(darkCol, lightCol, stripe * uContrast + fresnel * 0.12);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}
