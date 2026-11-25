import React, { useEffect, useState } from 'react';
import { Download, FileCode, Image, Package, X } from 'lucide-react';
import { MeshBlueprint, MetrologyStats } from '../types/blueprint';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  blueprint: MeshBlueprint;
  metrology: MetrologyStats | null;
  buildRevision: number;
  hiddenPartCount: number;
  onExportSTL: (includeHidden: boolean) => string;
  onExportOBJ: (includeHidden: boolean) => string;
  onExportGLB: (includeHidden: boolean) => Promise<string>;
  onExportSOTUSD: (includeHidden: boolean) => string;
  onExportUSDZ: (includeHidden: boolean) => Promise<string>;
  onExportJSON: () => string;
  onCapturePNG: () => string;
}

export function ExportModal({
  open,
  onClose,
  blueprint,
  metrology,
  buildRevision,
  hiddenPartCount,
  onExportSTL,
  onExportOBJ,
  onExportGLB,
  onExportSOTUSD,
  onExportUSDZ,
  onExportJSON,
  onCapturePNG,
}: ExportModalProps) {
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [includeHidden, setIncludeHidden] = useState(true);

  useEffect(() => {
    setNotice(null);
  }, [open, blueprint.id, blueprint.reconstructedAt, buildRevision]);

  if (!open) return null;

  const runExport = async (
    id: string,
    label: string,
    fn: () => string | Promise<string>
  ) => {
    setBusyFormat(id);
    setNotice(null);
    try {
      const filename = await fn();
      setNotice(`Saved ${label} → ${filename}`);
    } catch (err: any) {
      setNotice(err?.message || `Failed to export ${label}.`);
    } finally {
      setBusyFormat(null);
    }
  };

  const options = [
    {
      id: 'stl',
      title: 'Binary STL (.stl)',
      subtitle: 'Millimeter-calibrated solid mesh ready for CNC CAM, SolidWorks, or slicing',
      icon: Package,
      action: () => runExport('stl', 'Binary STL', () => onExportSTL(includeHidden)),
    },
    {
      id: 'obj',
      title: 'Wavefront OBJ (.obj)',
      subtitle: 'Preserves individual named sub-assembly part groups in millimeter scale',
      icon: Package,
      action: () => runExport('obj', 'Wavefront OBJ', () => onExportOBJ(includeHidden)),
    },
    {
      id: 'glb',
      title: 'Binary glTF 2.0 (.glb)',
      subtitle: 'Complete 3D assembly with PBR materials, clearcoats, and procedural textures',
      icon: Download,
      action: () => runExport('glb', 'Binary GLB', () => onExportGLB(includeHidden)),
    },
    {
      id: 'sot-usd',
      title: 'SOT OpenUSD (.usda — Z-up, Inches)',
      subtitle: 'SOT delivery standard: Z-up, metersPerUnit 0.0254 (in), front -Y, z=0, UsdPreviewSurface + OmniPBR',
      icon: Download,
      action: () => runExport('sot-usd', 'SOT OpenUSD (Z-up, Inches)', () => onExportSOTUSD(includeHidden)),
    },
    {
      id: 'usdz',
      title: 'Universal Scene Description (.usdz)',
      subtitle: 'Apple AR Quick Look, visionOS, Reality Composer, and OpenUSD PBR package',
      icon: Download,
      action: () => runExport('usdz', 'USDZ Package', () => onExportUSDZ(includeHidden)),
    },
    {
      id: 'json',
      title: 'Parametric Blueprint (.json)',
      subtitle: 'Editable millimeter CAD geometry specification, tolerances, and explode vectors',
      icon: FileCode,
      action: () => runExport('json', 'Blueprint JSON', onExportJSON),
    },
    {
      id: 'png',
      title: 'Studio Render Snapshot (.png)',
      subtitle: 'Current viewport angle exported directly from the WebGL framebuffer',
      icon: Image,
      action: () => runExport('png', 'Viewport PNG', onCapturePNG),
    },
  ];

  const activePartCount = includeHidden
    ? blueprint.parts.length
    : Math.max(0, blueprint.parts.length - hiddenPartCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h2
              id="export-modal-title"
              className="text-base font-semibold text-slate-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Download & Export 3D Assembly
            </h2>
            <p className="text-xs text-slate-600 mt-0.5 truncate">{blueprint.name}</p>
            {metrology && (
              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                {(metrology.boundingMm[0] / 25.4).toFixed(1)} × {(metrology.boundingMm[1] / 25.4).toFixed(1)} ×{' '}
                {(metrology.boundingMm[2] / 25.4).toFixed(1)} in ({metrology.boundingMm[0].toFixed(0)} ×{' '}
                {metrology.boundingMm[1].toFixed(0)} × {metrology.boundingMm[2].toFixed(0)} mm) ·{' '}
                {metrology.totalTriangles.toLocaleString()} tris · {activePartCount} parts
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {hiddenPartCount > 0 && (
          <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>
                Include {hiddenPartCount} currently hidden part{hiddenPartCount > 1 ? 's' : ''} in 3D export
              </span>
            </label>
          </div>
        )}

        <div className="p-6 divide-y divide-slate-100">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isBusy = busyFormat === opt.id;
            return (
              <div
                key={opt.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{opt.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{opt.subtitle}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={opt.action}
                  disabled={busyFormat !== null}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-900 hover:text-white hover:border-slate-900 whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-45"
                >
                  {isBusy ? 'Saving...' : 'Download'}
                </button>
              </div>
            );
          })}
        </div>

        {notice && (
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-700 font-mono break-all">
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}
