import { EdgeDiffResult } from '../types/blueprint';

const ANALYZE_W = 512;
const ANALYZE_H = 384;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Unable to load image for edge-diff analysis: ${src}`));
    img.src = src;
  });
}

/**
 * Draws an image centered with object-fit: contain matching Viewport3D's photo trace framing.
 */
function rasterizeContained(
  img: HTMLImageElement,
  width: number,
  height: number,
  fillPct = 0.84
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for edge-diff analysis.');

  // Fill with neutral corner sample / white so borders don't create artificial edges
  ctx.fillStyle = '#eceff4';
  ctx.fillRect(0, 0, width, height);

  const maxW = width * fillPct;
  const maxH = height * fillPct;
  const scale = Math.min(maxW / Math.max(1, img.naturalWidth), maxH / Math.max(1, img.naturalHeight));
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;

  ctx.drawImage(img, dx, dy, dw, dh);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Computes 3x3 Sobel gradient edge mask & foreground silhouette mask.
 */
function extractSobelAndSilhouette(
  imageData: ImageData,
  edgeThreshold: number
): { edges: Uint8Array; silhouette: Uint8Array } {
  const { width, height, data } = imageData;
  const lum = new Float32Array(width * height);

  // Sample average border color for foreground silhouette segmentation
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgSamples = 0;
  for (let x = 0; x < width; x += 4) {
    const topIdx = x * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    bgR += data[topIdx] + data[botIdx];
    bgG += data[topIdx + 1] + data[botIdx + 1];
    bgB += data[topIdx + 2] + data[botIdx + 2];
    bgSamples += 2;
  }
  bgR /= Math.max(1, bgSamples);
  bgG /= Math.max(1, bgSamples);
  bgB /= Math.max(1, bgSamples);

  const silhouette = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const colorDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
    if (colorDist > 36) {
      silhouette[i] = 1;
    }
  }

  const edges = new Uint8Array(width * height);
  // Ignore outer 4px frame border
  for (let y = 4; y < height - 4; y++) {
    for (let x = 4; x < width - 4; x++) {
      const idx = y * width + x;
      const gx =
        -lum[idx - width - 1] +
        lum[idx - width + 1] -
        2 * lum[idx - 1] +
        2 * lum[idx + 1] -
        lum[idx + width - 1] +
        lum[idx + width + 1];
      const gy =
        -lum[idx - width - 1] -
        2 * lum[idx - width] -
        lum[idx - width + 1] +
        lum[idx + width - 1] +
        2 * lum[idx + width] +
        lum[idx + width + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag >= edgeThreshold) {
        edges[idx] = 1;
      }
    }
  }

  return { edges, silhouette };
}

/**
 * Dilates a binary edge mask by `radius` pixels (Chebyshev neighborhood) for tolerant alignment matching.
 */
function dilateMask(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const dst = new Uint8Array(width * height);
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      if (!src[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        const row = (y + dy) * width;
        for (let dx = -radius; dx <= radius; dx++) {
          dst[row + x + dx] = 1;
        }
      }
    }
  }
  return dst;
}

function renderEdgeMaskToDataUrl(
  mask: Uint8Array,
  width: number,
  height: number,
  rgb: [number, number, number]
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);
  const d = imgData.data;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    if (mask[i]) {
      d[p] = rgb[0];
      d[p + 1] = rgb[1];
      d[p + 2] = rgb[2];
      d[p + 3] = 255;
    } else {
      d[p] = 15;
      d[p + 1] = 23;
      d[p + 2] = 42;
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Compares live 3D WebGL viewport render against the reference photograph using Sobel edge
 * detection and morphological proximity matching.
 *
 * Overlay color legend:
 *  - Emerald Green (#10b981): Aligned edges (3D mesh matches photo within ±4 px)
 *  - Crimson Red (#ef4444): Unmatched reference photo edges (missing or shifted geometry)
 *  - Cyan (#06b6d4): Extra 3D mesh edges extending beyond photo contours
 */
export async function computePhotoVsMeshEdgeDiff(
  sourcePhotoUrl: string,
  meshRenderDataUrl: string
): Promise<EdgeDiffResult> {
  const [photoImg, meshImg] = await Promise.all([
    loadImageElement(sourcePhotoUrl),
    loadImageElement(meshRenderDataUrl),
  ]);

  const photoData = rasterizeContained(photoImg, ANALYZE_W, ANALYZE_H, 0.84);
  const meshData = rasterizeContained(meshImg, ANALYZE_W, ANALYZE_H, 1.0);

  const photo = extractSobelAndSilhouette(photoData, 68);
  const mesh = extractSobelAndSilhouette(meshData, 42);

  const photoDilated = dilateMask(photo.edges, ANALYZE_W, ANALYZE_H, 4);
  const meshDilated = dilateMask(mesh.edges, ANALYZE_W, ANALYZE_H, 4);

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = ANALYZE_W;
  overlayCanvas.height = ANALYZE_H;
  const ctx = overlayCanvas.getContext('2d')!;
  const overlayData = ctx.createImageData(ANALYZE_W, ANALYZE_H);
  const out = overlayData.data;

  let photoEdgePixels = 0;
  let meshEdgePixels = 0;
  let matchedPhotoEdges = 0;
  let matchedMeshEdges = 0;
  let silInter = 0;
  let silUnion = 0;

  for (let i = 0; i < ANALYZE_W * ANALYZE_H; i++) {
    const pEdge = photo.edges[i] === 1;
    const mEdge = mesh.edges[i] === 1;

    if (photo.silhouette[i] || mesh.silhouette[i]) {
      silUnion++;
      if (photo.silhouette[i] && mesh.silhouette[i]) {
        silInter++;
      }
    }

    if (pEdge) {
      photoEdgePixels++;
      if (meshDilated[i]) matchedPhotoEdges++;
    }
    if (mEdge) {
      meshEdgePixels++;
      if (photoDilated[i]) matchedMeshEdges++;
    }

    const p = i * 4;
    if ((pEdge && meshDilated[i]) || (mEdge && photoDilated[i])) {
      // Matched edge -> Emerald Green
      out[p] = 16;
      out[p + 1] = 185;
      out[p + 2] = 129;
      out[p + 3] = 235;
    } else if (pEdge) {
      // Unmatched Photo Edge -> Crimson Red
      out[p] = 239;
      out[p + 1] = 68;
      out[p + 2] = 68;
      out[p + 3] = 225;
    } else if (mEdge) {
      // Unmatched 3D Mesh Edge -> Bright Cyan
      out[p] = 6;
      out[p + 1] = 182;
      out[p + 2] = 212;
      out[p + 3] = 225;
    } else {
      out[p] = 0;
      out[p + 1] = 0;
      out[p + 2] = 0;
      out[p + 3] = 0;
    }
  }

  ctx.putImageData(overlayData, 0, 0);

  const precision = meshEdgePixels > 0 ? matchedMeshEdges / meshEdgePixels : 0;
  const recall = photoEdgePixels > 0 ? matchedPhotoEdges / photoEdgePixels : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const silIoU = silUnion > 0 ? silInter / silUnion : 0;

  return {
    overlayDataUrl: overlayCanvas.toDataURL('image/png'),
    photoEdgesDataUrl: renderEdgeMaskToDataUrl(photo.edges, ANALYZE_W, ANALYZE_H, [248, 113, 113]),
    meshEdgesDataUrl: renderEdgeMaskToDataUrl(mesh.edges, ANALYZE_W, ANALYZE_H, [34, 211, 238]),
    precisionPct: Math.round(precision * 1000) / 10,
    recallPct: Math.round(recall * 1000) / 10,
    f1ScorePct: Math.round(f1 * 1000) / 10,
    silhouetteIoUPct: Math.round(silIoU * 1000) / 10,
    matchedPixels: matchedMeshEdges,
    photoEdgePixels,
    meshEdgePixels,
    computedAt: new Date().toISOString(),
  };
}
