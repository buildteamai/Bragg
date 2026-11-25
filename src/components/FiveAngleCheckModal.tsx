import React, { useEffect } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  CameraPresetId,
  FiveAngleCapture,
  MeshBlueprint,
} from '../types/blueprint';

interface FiveAngleCheckModalProps {
  open: boolean;
  onClose: () => void;
  blueprint: MeshBlueprint;
  captures: FiveAngleCapture[];
  onRefreshCaptures: () => void;
  onJumpToAngle: (preset: CameraPresetId) => void;
}

export function FiveAngleCheckModal({
  open,
  onClose,
  blueprint,
  captures,
  onRefreshCaptures,
  onJumpToAngle,
}: FiveAngleCheckModalProps) {
  useEffect(() => {
    if (open) {
      onRefreshCaptures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blueprint.id, blueprint.reconstructedAt]);

  if (!open) return null;

  const audit = blueprint.fiveAngleAudit;
  const getAuditForAngle = (angle: FiveAngleCapture['angle']) =>
    audit?.angles?.find((a) => a.angle === angle);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="five-angle-modal-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2
              id="five-angle-modal-title"
              className="text-base font-semibold text-slate-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              5-Angle Orthographic & Orientation Check
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspect the active model across Photo-Match 3/4, Front, Left, Right, and Top Plan views. Click any tile to jump the viewport camera.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefreshCaptures}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-Capture</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close 5-angle check"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: 6-tile grid (Reference Photo + 5 Live Rendered Angles) */}
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Tile 0: Reference Source Photo (when available) */}
            {blueprint.sourceImageUrl && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">Reference Photo</span>
                  <span className="text-[11px] text-slate-500">Ground Truth</span>
                </div>
                <div className="aspect-[4/3] bg-white flex items-center justify-center p-2">
                  <img
                    src={blueprint.sourceImageUrl}
                    alt={`Reference photo of ${blueprint.name}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-100">
                  Compare overall silhouette, clearances, and hardware orientation directly against the 5 live renders.
                </div>
              </div>
            )}

            {/* Tiles 1..5: Live 3D WebGL Renders */}
            {captures.map((cap, idx) => {
              const checkItem = getAuditForAngle(cap.angle);
              return (
                <button
                  key={cap.angle}
                  type="button"
                  onClick={() => {
                    onJumpToAngle(cap.presetId);
                    onClose();
                  }}
                  className="text-left rounded-lg border border-slate-200 hover:border-slate-900 bg-slate-50 overflow-hidden flex flex-col cursor-pointer transition-colors group"
                >
                  <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {idx + 1}. {cap.label}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{checkItem?.status === 'corrected' ? 'Verified' : 'Live View'}</span>
                    </span>
                  </div>
                  <div className="aspect-[4/3] bg-[#eceff4] overflow-hidden relative">
                    <img
                      src={cap.dataUrl}
                      alt={`${cap.label} render of ${blueprint.name}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="px-3 py-2 text-[11px] text-slate-600 border-t border-slate-100 leading-snug">
                    {checkItem?.note || 'Click to jump the main 3D viewport camera to this angle.'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Spatial Verification Notes (if present) */}
          {audit && audit.correctionsApplied.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Verified 5-Angle Spatial Notes</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                {audit.correctionsApplied.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
