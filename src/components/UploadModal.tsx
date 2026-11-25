import React, { useRef, useState } from 'react';
import { FileText, Globe, ImagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import { MeshBlueprint } from '../types/blueprint';
import { fetchApiWithRetry, parseApiJson, pollBlueprintJob } from '../utils/api';

interface AttachedPdf {
  id: string;
  name: string;
  sizeBytes: number;
  base64: string;
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onReconstructionComplete: (
    blueprint: MeshBlueprint,
    sourceLabel?: string,
    autoVisualAudit?: boolean
  ) => void;
  referenceImageUrl: string;
  secondaryReferenceImageUrl?: string;
}

const MAX_PDF_COUNT = 4;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB per PDF
const MAX_TOTAL_PDF_BYTES = 18 * 1024 * 1024; // 18 MB total raw (~24 MB base64, safely under proxy limits)
const MAX_URL_COUNT = 6;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function resizeImageToDataUrl(
  file: File,
  maxDim = 1152
): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: String(reader.result), mimeType: file.type || 'image/png' });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), mimeType: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; mimeType: string }> {
  const res = await fetchApiWithRetry(url, { method: 'GET' }, { maxAttempts: 3 });
  if (!res.ok) throw new Error('Could not load example reference image.');
  const blob = await res.blob();
  const file = new File([blob], 'reference.png', { type: blob.type || 'image/png' });
  return resizeImageToDataUrl(file, 1152);
}

export function UploadModal({
  open,
  onClose,
  onReconstructionComplete,
  referenceImageUrl,
  secondaryReferenceImageUrl,
}: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/png');
  const [fileName, setFileName] = useState<string>('');
  const [targetWidthMm, setTargetWidthMm] = useState<string>('');
  const [userHint, setUserHint] = useState<string>('');

  // Optional additional technical context: web references & PDFs
  const [urlInput, setUrlInput] = useState<string>('');
  const [webReferences, setWebReferences] = useState<string[]>([]);
  const [attachedPdfs, setAttachedPdfs] = useState<AttachedPdf[]>([]);

  const [dragOver, setDragOver] = useState(false);
  const [autoVisualAudit, setAutoVisualAudit] = useState(true);
  const [isReconstructing, setIsReconstructing] = useState(false);
  const [stageText, setStageText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please upload a PNG, JPG, or WebP photograph.');
      return;
    }
    try {
      const { dataUrl, mimeType: detectedMime } = await resizeImageToDataUrl(file);
      setPreviewUrl(dataUrl);
      setMimeType(detectedMime);
      setFileName(file.name);
    } catch (err: any) {
      setError(err?.message || 'Unable to process image.');
    }
  };

  const handleAddPdfFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const remaining = MAX_PDF_COUNT - attachedPdfs.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_PDF_COUNT} PDF documents per reconstruction.`);
      return;
    }

    const incoming = Array.from(fileList).slice(0, remaining);
    const added: AttachedPdf[] = [];
    let runningTotalBytes = attachedPdfs.reduce((sum, p) => sum + p.sizeBytes, 0);

    for (const file of incoming) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setError(`${file.name} is not a PDF document.`);
        continue;
      }
      if (file.size > MAX_PDF_BYTES) {
        setError(`${file.name} exceeds the 10 MB per-file limit.`);
        continue;
      }
      if (runningTotalBytes + file.size > MAX_TOTAL_PDF_BYTES) {
        setError(`Adding ${file.name} exceeds the 18 MB total PDF upload limit.`);
        continue;
      }
      try {
        const base64 = await readFileAsDataUrl(file);
        runningTotalBytes += file.size;
        added.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          sizeBytes: file.size,
          base64,
        });
      } catch (err: any) {
        setError(err?.message || `Unable to read ${file.name}.`);
      }
    }

    if (added.length > 0) {
      setAttachedPdfs((prev) => [...prev, ...added]);
    }
    if (pdfInputRef.current) {
      pdfInputRef.current.value = '';
    }
  };

  const handleAddWebUrl = () => {
    setError(null);
    const raw = urlInput.trim();
    if (!raw) return;

    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      setError('Enter a valid web reference URL (e.g., https://example.com/spec-sheet).');
      return;
    }

    if (webReferences.includes(normalized)) {
      setUrlInput('');
      return;
    }

    if (webReferences.length >= MAX_URL_COUNT) {
      setError(`You can add up to ${MAX_URL_COUNT} web references.`);
      return;
    }

    setWebReferences((prev) => [...prev, normalized]);
    setUrlInput('');
  };

  const handleUseExample = async (
    imageUrl: string,
    labelName: string,
    defaultWidthMm: string
  ) => {
    setError(null);
    try {
      const { dataUrl, mimeType: detectedMime } = await fetchImageAsDataUrl(imageUrl);
      setPreviewUrl(dataUrl);
      setMimeType(detectedMime);
      setFileName(labelName);
      setTargetWidthMm(defaultWidthMm);
    } catch (err: any) {
      setError(err?.message || 'Unable to load reference image.');
    }
  };

  const parseValidUrl = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(normalized);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.hostname.includes('.')
      ) {
        return normalized;
      }
    } catch {
      return null;
    }
    return null;
  };

  const pendingValidUrl = parseValidUrl(urlInput);
  const canReconstruct =
    Boolean(previewUrl) ||
    attachedPdfs.length > 0 ||
    webReferences.length > 0 ||
    Boolean(pendingValidUrl);

  const handleReconstruct = async () => {
    if (!canReconstruct || isReconstructing) return;
    setError(null);

    // Include any typed-but-not-yet-clicked URL automatically if valid
    const finalWebUrls = [...webReferences];
    if (urlInput.trim()) {
      const parsedPending = parseValidUrl(urlInput);
      if (!parsedPending && !previewUrl && attachedPdfs.length === 0 && finalWebUrls.length === 0) {
        setError('Enter a valid web reference URL (e.g., https://example.com/spec-sheet).');
        return;
      }
      if (
        parsedPending &&
        !finalWebUrls.includes(parsedPending) &&
        finalWebUrls.length < MAX_URL_COUNT
      ) {
        finalWebUrls.push(parsedPending);
        setWebReferences(finalWebUrls);
        setUrlInput('');
      }
    }

    setIsReconstructing(true);

    const hasImage = Boolean(previewUrl);
    setStageText(
      finalWebUrls.length > 0
        ? 'Reading web references and extracting technical dimensions...'
        : attachedPdfs.length > 0
          ? hasImage
            ? 'Cross-referencing PDF technical drawings with photograph...'
            : 'Extracting dimensional drawings and specifications from PDF documents...'
          : 'Analyzing silhouette contours, depth planes, and material finishes...'
    );

    try {
      const startRes = await fetchApiWithRetry(
        '/api/reconstruct/start',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            imageBase64: previewUrl || undefined,
            mimeType: previewUrl ? mimeType : undefined,
            targetWidthMm: targetWidthMm ? Number(targetWidthMm) : undefined,
            userHint: userHint.trim() || undefined,
            webReferences: finalWebUrls.length > 0 ? finalWebUrls : undefined,
            pdfDocuments:
              attachedPdfs.length > 0
                ? attachedPdfs.map((p) => ({ name: p.name, base64: p.base64 }))
                : undefined,
          }),
        },
        {
          maxAttempts: 4,
          onRetry: (attempt, maxAttempts) =>
            setStageText(`Reconnecting to server (attempt ${attempt}/${maxAttempts})...`),
        }
      );

      const startData = await parseApiJson<{ jobId: string; stage?: string }>(startRes);
      if (!startData?.jobId) {
        throw new Error('Server did not return a reconstruction job ID.');
      }

      const blueprint = await pollBlueprintJob<MeshBlueprint>(
        `/api/reconstruct/status/${encodeURIComponent(startData.jobId)}`,
        (stage) => setStageText(stage)
      );

      onReconstructionComplete(
        blueprint,
        'AI Reconstruction',
        Boolean(previewUrl && autoVisualAudit)
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'AI geometric reconstruction failed.');
    } finally {
      setIsReconstructing(false);
      setStageText('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2
              id="upload-modal-title"
              className="text-base font-semibold text-slate-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Build 3D Mesh from Reference
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Provide a photograph, PDF drawings/datasheets, web spec URLs — or any combination.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isReconstructing}
            aria-label="Close dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Reference Photograph Dropzone or Preview (Optional if PDF or URL provided) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                Reference Photograph (Optional if PDF or URL added)
              </span>
              {previewUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    setFileName('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  disabled={isReconstructing}
                  className="text-slate-500 hover:text-rose-600 cursor-pointer disabled:opacity-40"
                >
                  Remove photo
                </button>
              )}
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const files = Array.from(e.dataTransfer.files || []);
                const imgFile = files.find((f) => f.type.startsWith('image/'));
                const pdfFiles = files.filter(
                  (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
                );
                if (imgFile) handleFile(imgFile);
                if (pdfFiles.length > 0) {
                  const dt = new DataTransfer();
                  pdfFiles.forEach((f) => dt.items.add(f));
                  handleAddPdfFiles(dt.files);
                }
              }}
              onClick={() => !isReconstructing && fileInputRef.current?.click()}
              className={`relative rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              {previewUrl ? (
                <div className="flex flex-col items-center gap-2.5">
                  <img
                    src={previewUrl}
                    alt="Selected input preview"
                    referrerPolicy="no-referrer"
                    className="max-h-44 rounded object-contain bg-white border border-slate-200 p-2"
                  />
                  <div className="text-xs text-slate-600 flex items-center gap-2">
                    <span className="font-medium text-slate-900 truncate max-w-xs">
                      {fileName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="underline">Replace image</span>
                  </div>
                </div>
              ) : (
                <div className="py-4 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                    <ImagePlus className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium text-slate-800">
                    Drop a photo or PDFs here, or click to browse an image
                  </p>
                  <p className="text-xs text-slate-500">
                    PNG, JPG, or WebP · Skip this if building directly from PDFs or web links below
                  </p>
                </div>
              )}
            </div>
          </div>

          {!previewUrl && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Run live AI reconstruction on a sample photo:</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    handleUseExample(referenceImageUrl, 'AMADA_H1000_II.png', '3740')
                  }
                  className="font-medium text-slate-900 hover:underline cursor-pointer whitespace-nowrap"
                >
                  AMADA H-1000 II Photo
                </button>
                {secondaryReferenceImageUrl && (
                  <>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleUseExample(
                          secondaryReferenceImageUrl,
                          'DMU_125_monoBLOCK.png',
                          '3460'
                        )
                      }
                      className="font-medium text-slate-900 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      DMU 125 Photo
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Web References & PDF Documents (usable standalone or alongside a photo) */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                Web References & PDF Documents
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Build directly from manufacturer spec pages or PDF technical drawings — with or without a photograph.
              </p>
            </div>

            {/* Web References Input */}
            <div className="space-y-2">
              <label
                htmlFor="web-ref-url"
                className="block text-xs font-medium text-slate-700"
              >
                Web Reference URLs
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="web-ref-url"
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddWebUrl();
                      }
                    }}
                    disabled={isReconstructing}
                    placeholder="https://manufacturer.com/product-specs"
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddWebUrl}
                  disabled={isReconstructing || !urlInput.trim()}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add URL</span>
                </button>
              </div>

              {webReferences.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60">
                  {webReferences.map((url) => (
                    <li
                      key={url}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <span className="truncate text-slate-700 font-mono text-[11px]">
                        {url}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setWebReferences((prev) => prev.filter((u) => u !== url))
                        }
                        disabled={isReconstructing}
                        aria-label={`Remove ${url}`}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* PDF Attachments Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-700">
                  PDF Datasheets & Engineering Drawings
                </label>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {attachedPdfs.length}/{MAX_PDF_COUNT} attached · max 10 MB each (18 MB total)
                </span>
              </div>

              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => handleAddPdfFiles(e.target.files)}
              />

              <button
                type="button"
                onClick={() => !isReconstructing && pdfInputRef.current?.click()}
                disabled={isReconstructing || attachedPdfs.length >= MAX_PDF_COUNT}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg border border-dashed border-slate-300 text-slate-700 hover:border-slate-500 hover:bg-slate-50 disabled:opacity-45 cursor-pointer transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Attach PDF Spec Sheets or CAD Drawings</span>
              </button>

              {attachedPdfs.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60">
                  {attachedPdfs.map((pdf) => (
                    <li
                      key={pdf.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate font-medium text-slate-800">
                          {pdf.name}
                        </span>
                        <span className="text-slate-400 shrink-0" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                          {formatBytes(pdf.sizeBytes)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachedPdfs((prev) => prev.filter((p) => p.id !== pdf.id))
                        }
                        disabled={isReconstructing}
                        aria-label={`Remove ${pdf.name}`}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Metric Calibration & Engineering Note */}
          <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="target-width-mm"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Reference Width (mm, optional)
              </label>
              <input
                id="target-width-mm"
                type="number"
                min={10}
                max={50000}
                step="0.1"
                value={targetWidthMm}
                onChange={(e) => setTargetWidthMm(e.target.value)}
                disabled={isReconstructing}
                placeholder="Auto from photo / references"
                className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
              />
            </div>

            <div>
              <label
                htmlFor="recon-hint"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Structural Focus (optional)
              </label>
              <input
                id="recon-hint"
                type="text"
                value={userHint}
                onChange={(e) => setUserHint(e.target.value)}
                disabled={isReconstructing}
                placeholder="e.g. Preserve crown molding, glowing shelves, and sculpted deer"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
              />
            </div>
          </div>

          {previewUrl && (
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoVisualAudit}
                onChange={(e) => setAutoVisualAudit(e.target.checked)}
                disabled={isReconstructing}
                className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>
                <span className="font-semibold text-slate-900">
                  Auto Visual Self-Check (Stage 5 Render-Compare-Fix)
                </span>{' '}
                — automatically renders all 5 live 3D angles, visually compares them against your photo, and replaces blocky or misaligned geometry before finishing.
              </span>
            </label>
          )}

          {isReconstructing && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-700">
              <div className="font-medium text-slate-900">
                Reconstructing 3D CAD Assembly
              </div>
              <div className="text-slate-500 mt-1">{stageText}</div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/70 shrink-0">
          <div className="text-xs text-slate-500 tabular-nums">
            {canReconstruct ? (
              <span>
                {[
                  previewUrl ? '1 photo' : null,
                  webReferences.length + (pendingValidUrl && !webReferences.includes(pendingValidUrl) ? 1 : 0) > 0
                    ? `${webReferences.length + (pendingValidUrl && !webReferences.includes(pendingValidUrl) ? 1 : 0)} URL${webReferences.length + (pendingValidUrl && !webReferences.includes(pendingValidUrl) ? 1 : 0) === 1 ? '' : 's'}`
                    : null,
                  attachedPdfs.length > 0
                    ? `${attachedPdfs.length} PDF${attachedPdfs.length === 1 ? '' : 's'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : (
              <span>Add a photo, PDF, or URL to build</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isReconstructing}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-950 cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReconstruct}
              disabled={!canReconstruct || isReconstructing}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-45 cursor-pointer transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isReconstructing ? 'Reconstructing...' : 'Build 3D Mesh'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
