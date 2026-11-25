import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cog,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  Link2,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Scale,
  ScanLine,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ConstellationQaGateReport,
  EdgeDiffResult,
  GeometryAuditReport,
  KinematicPosePreset,
  MeshBlueprint,
  MetrologyStats,
} from '../types/blueprint';

export interface JointRigValue {
  angleDeg?: number;
  slideMm?: number;
}

interface GeometryAuditDrawerProps {
  open: boolean;
  onClose: () => void;
  blueprint: MeshBlueprint;
  metrology: MetrologyStats | null;
  audit: GeometryAuditReport | null;
  edgeDiff: EdgeDiffResult | null;
  edgeDiffBusy: boolean;
  edgeDiffError: string | null;
  edgeDiffOverlayVisible: boolean;
  edgeDiffOverlayOpacity: number;
  onRunEdgeDiff: () => void;
  onToggleEdgeDiffOverlay: () => void;
  onEdgeDiffOpacityChange: (opacity: number) => void;
  showCoGOverlay: boolean;
  onToggleCoGOverlay: () => void;
  showSweptEnvelopes: boolean;
  onToggleSweptEnvelopes: () => void;
  kinematicPlaying: boolean;
  onToggleKinematicPlaying: () => void;
  onApplyPosePreset: (preset: KinematicPosePreset) => void;
  jointRigValues: Record<string, JointRigValue>;
  onJointRigChange: (jointId: string, next: JointRigValue) => void;
  onResetJointRig: () => void;
  highlightedPartIds: string[];
  onHighlightParts: (partIds: string[]) => void;
  onSelectPart: (partId: string | null) => void;
  constellationQa?: ConstellationQaGateReport | null;
  constellationBusy?: boolean;
  constellationError?: string | null;
  onLoadConstellationCamera?: (rawJson: any) => void;
  onRunConstellationQa?: (inventory?: any, checkPoints?: any[]) => void;
  onRectifyGlassBox?: () => void;
}

export function GeometryAuditDrawer({
  open,
  onClose,
  blueprint,
  metrology,
  audit,
  edgeDiff,
  edgeDiffBusy,
  edgeDiffError,
  edgeDiffOverlayVisible,
  edgeDiffOverlayOpacity,
  onRunEdgeDiff,
  onToggleEdgeDiffOverlay,
  onEdgeDiffOpacityChange,
  showCoGOverlay,
  onToggleCoGOverlay,
  showSweptEnvelopes,
  onToggleSweptEnvelopes,
  kinematicPlaying,
  onToggleKinematicPlaying,
  onApplyPosePreset,
  jointRigValues,
  onJointRigChange,
  onResetJointRig,
  highlightedPartIds,
  onHighlightParts,
  onSelectPart,
  constellationQa,
  constellationBusy,
  constellationError,
  onLoadConstellationCamera,
  onRunConstellationQa,
  onRectifyGlassBox,
}: GeometryAuditDrawerProps) {
  const [showAllMates, setShowAllMates] = useState(false);

  const movableJoints = useMemo(
    () => (audit?.joints || []).filter((j) => j.jointKind !== 'fixed'),
    [audit]
  );

  // Merge custom blueprint poses with auto-derived engineering stroke poses
  const posePresets = useMemo<KinematicPosePreset[]>(() => {
    if (movableJoints.length === 0) return [];
    const custom = blueprint.posePresets || [];
    const neutral: KinematicPosePreset = {
      id: '__neutral',
      label: 'Rest / Zero',
      jointTargets: Object.fromEntries(
        movableJoints.map((j) => [j.id, { angleDeg: 0, slideMm: 0 }])
      ),
    };
    const midStroke: KinematicPosePreset = {
      id: '__mid',
      label: 'Mid-Stroke',
      jointTargets: Object.fromEntries(
        movableJoints.map((j) => {
          const maxA = j.motionLimits?.maxAngleDeg ?? (j.jointKind === 'prismatic' ? 0 : 45);
          const maxS = j.motionLimits?.maxSlideMm ?? (j.jointKind === 'revolute' ? 0 : 25);
          return [
            j.id,
            {
              angleDeg: Math.round(maxA * 0.55),
              slideMm: Math.round(maxS * 0.55),
            },
          ];
        })
      ),
    };
    const maxTravel: KinematicPosePreset = {
      id: '__max',
      label: 'Max Travel',
      jointTargets: Object.fromEntries(
        movableJoints.map((j) => {
          const maxA = j.motionLimits?.maxAngleDeg ?? (j.jointKind === 'prismatic' ? 0 : 45);
          const maxS = j.motionLimits?.maxSlideMm ?? (j.jointKind === 'revolute' ? 0 : 25);
          return [j.id, { angleDeg: maxA, slideMm: maxS }];
        })
      ),
    };
    return [neutral, ...custom, midStroke, maxTravel];
  }, [movableJoints, blueprint.posePresets]);

  const hasActiveRig = useMemo(
    () =>
      Object.values(jointRigValues).some(
        (v) => Math.abs(v.angleDeg ?? 0) > 0.1 || Math.abs(v.slideMm ?? 0) > 0.1
      ),
    [jointRigValues]
  );

  const flaggedMates = useMemo(
    () =>
      (audit?.solvedConstraints || []).filter(
        (m) => m.status === 'conflicting' || m.status === 'underConstrained' || m.status === 'unresolved'
      ),
    [audit]
  );

  if (!open) return null;

  const displayedMates = showAllMates
    ? audit?.solvedConstraints || []
    : flaggedMates.length > 0
      ? flaggedMates
      : (audit?.solvedConstraints || []).slice(0, 6);

  const healthScore = audit?.healthScore ?? 100;
  const healthTone =
    healthScore >= 85
      ? 'text-emerald-700'
      : healthScore >= 65
        ? 'text-amber-700'
        : 'text-rose-700';

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/25 pointer-events-auto"
      onClick={onClose}
    >
      <aside
        aria-label="Geometry, Mate & Edge-Diff Audit"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden text-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2
              className="text-base font-semibold text-slate-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Geometry &amp; Kinematic Audit
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[300px]">
              {blueprint.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close audit drawer"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
          {/* 1. Solid Kernel & Assembly Health Summary */}
          <section className="px-6 py-4 bg-slate-50/70">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                <span>Solid Kernel &amp; Assembly Health</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {audit?.exactBooleanAuditActive
                  ? 'Exact Boolean WASM'
                  : audit?.manifoldWasmActive
                    ? 'Manifold-3D WASM'
                    : 'Mesh Fallback'}
              </span>
            </div>

            {audit ? (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 font-mono text-xs tabular-nums">
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <div className="text-[10px] font-sans text-slate-500">Health</div>
                    <div className={`text-sm font-semibold mt-0.5 ${healthTone}`}>
                      {audit.healthScore}/100
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <div className="text-[10px] font-sans text-slate-500">CSG Solids</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">
                      {audit.watertightCsgCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <div className="text-[10px] font-sans text-slate-500">Load-Path</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">
                      {audit.connectedCount}/{audit.totalPartCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <div className="text-[10px] font-sans text-slate-500">Verified Fits</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">
                      {audit.verifiedFitCount > 0 ? audit.verifiedFitCount : audit.seatingContactCount}
                    </div>
                  </div>
                </div>

                {audit.motionSweepPosesChecked > 0 && (
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 px-1">
                    <span>
                      Motion Sweep: {audit.motionSweepPosesChecked} poses checked
                    </span>
                    <span
                      className={
                        audit.dynamicClashes.length === 0
                          ? 'text-emerald-700 font-medium'
                          : 'text-rose-700 font-semibold'
                      }
                    >
                      {audit.dynamicClashes.length === 0
                        ? '0 dynamic clashes'
                        : `${audit.dynamicClashes.length} dynamic clash${audit.dynamicClashes.length === 1 ? '' : 'es'}`}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Running geometry audit...</p>
            )}
          </section>

          {/* 1b. Compiled Bidirectional Interface Contracts (when present) */}
          {audit && audit.compiledInterfaces.length > 0 && (
            <section className="px-6 py-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Link2 className="w-3.5 h-3.5 text-slate-600" />
                  <span>Compiled Interfaces ({audit.compiledInterfaces.length})</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {audit.compiledInterfaces.reduce((a, b) => a + b.holesCut, 0)} bores cut
                </span>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {audit.compiledInterfaces.map((ci) => (
                  <button
                    key={ci.id}
                    type="button"
                    onClick={() => {
                      if (ci.partIds[0]) onSelectPart(ci.partIds[0]);
                      onHighlightParts(ci.partIds);
                    }}
                    className={`w-full text-left rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                      ci.status === 'warning'
                        ? 'border-amber-200 bg-amber-50/60 text-amber-950'
                        : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{ci.label}</span>
                      <span className="text-[10px] font-mono uppercase text-slate-500 shrink-0">
                        {ci.kind}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      {ci.summary}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 2. Live Photo-vs-3D Sobel Edge-Diff Overlay */}
          <section className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <ScanLine className="w-3.5 h-3.5 text-slate-600" />
                <span>Photo vs 3D Edge-Diff</span>
              </div>
              <button
                type="button"
                disabled={!blueprint.sourceImageUrl || edgeDiffBusy}
                onClick={onRunEdgeDiff}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer transition-colors"
              >
                {edgeDiffBusy ? 'Scanning...' : edgeDiff ? 'Re-Scan' : 'Run Edge-Diff'}
              </button>
            </div>

            {!blueprint.sourceImageUrl && (
              <p className="text-xs text-slate-500">
                Attach a reference photograph to run Sobel edge-diff alignment.
              </p>
            )}

            {edgeDiffError && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {edgeDiffError}
              </div>
            )}

            {edgeDiff && (
              <div className="space-y-3">
                {/* Overlay Toggle + Opacity */}
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <button
                    type="button"
                    onClick={onToggleEdgeDiffOverlay}
                    className={`flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
                      edgeDiffOverlayVisible ? 'text-slate-950' : 'text-slate-600'
                    }`}
                  >
                    {edgeDiffOverlayVisible ? (
                      <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{edgeDiffOverlayVisible ? 'Overlay On' : 'Overlay Off'}</span>
                  </button>

                  <div className="flex items-center gap-2 flex-1 max-w-[170px]">
                    <input
                      type="range"
                      min={15}
                      max={100}
                      disabled={!edgeDiffOverlayVisible}
                      value={Math.round(edgeDiffOverlayOpacity * 100)}
                      onChange={(e) => onEdgeDiffOpacityChange(Number(e.target.value) / 100)}
                      className="cad-slider w-full disabled:opacity-40"
                    />
                    <span className="text-[11px] font-mono tabular-nums text-slate-600 w-8 text-right">
                      {Math.round(edgeDiffOverlayOpacity * 100)}%
                    </span>
                  </div>
                </div>

                {/* Composite Preview + Legend */}
                <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-950">
                  <img
                    src={edgeDiff.overlayDataUrl}
                    alt="Sobel edge-diff alignment map"
                    className="w-full h-36 object-contain"
                  />
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 text-[11px] text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                      Matched
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                      Photo Missing
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-cyan-400" />
                      3D Extra
                    </span>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-2 font-mono text-xs tabular-nums">
                  <div className="rounded-lg border border-slate-200 px-2 py-1.5">
                    <div className="text-[10px] font-sans text-slate-500">F1 Align</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {edgeDiff.f1ScorePct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 px-2 py-1.5">
                    <div className="text-[10px] font-sans text-slate-500">Precision</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {edgeDiff.precisionPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 px-2 py-1.5">
                    <div className="text-[10px] font-sans text-slate-500">Recall</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {edgeDiff.recallPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 px-2 py-1.5">
                    <div className="text-[10px] font-sans text-slate-500">Sil. IoU</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {edgeDiff.silhouetteIoUPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 2B. Exact Mass Properties, 3D CoG & Static Tip-Over Stability */}
          {metrology?.massProperties && (
            <section className="px-6 py-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Scale className="w-3.5 h-3.5 text-slate-600" />
                  <span>Mass, CoG &amp; Tip-Over Stability</span>
                </div>
                <button
                  type="button"
                  onClick={onToggleCoGOverlay}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border cursor-pointer transition-colors ${
                    showCoGOverlay
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  <span>{showCoGOverlay ? '3D CoG On' : 'Show 3D CoG'}</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                  <div className="text-[10px] font-sans text-slate-500">Total Mass</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {metrology.massProperties.totalMassKg.toFixed(2)} kg
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {metrology.massProperties.totalVolumeCm3.toLocaleString()} cm³
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                  <div className="text-[10px] font-sans text-slate-500">Stability</div>
                  <div
                    className={`font-semibold uppercase mt-0.5 ${
                      metrology.massProperties.stabilityStatus === 'stable'
                        ? 'text-emerald-700'
                        : metrology.massProperties.stabilityStatus === 'marginal'
                          ? 'text-amber-700'
                          : 'text-rose-700'
                    }`}
                  >
                    {metrology.massProperties.stabilityStatus}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {metrology.massProperties.stabilityMarginMm >= 0 ? '+' : ''}
                    {metrology.massProperties.stabilityMarginMm.toFixed(1)} mm margin
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                  <div className="text-[10px] font-sans text-slate-500">CoG Height</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {Math.round(metrology.massProperties.topHeavinessRatio * 100)}% H
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Y {metrology.massProperties.centerOfGravityMm[1].toFixed(0)} mm
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-mono tabular-nums text-slate-600 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 flex items-center justify-between">
                <span>Center of Gravity</span>
                <span>
                  X {metrology.massProperties.centerOfGravityMm[0].toFixed(1)} · Y{' '}
                  {metrology.massProperties.centerOfGravityMm[1].toFixed(1)} · Z{' '}
                  {metrology.massProperties.centerOfGravityMm[2].toFixed(1)} mm
                </span>
              </div>

              {metrology.massProperties.parts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Heaviest Sub-Components
                  </div>
                  <div className="space-y-1">
                    {metrology.massProperties.parts.slice(0, 4).map((pm) => (
                      <button
                        key={pm.partId}
                        type="button"
                        onClick={() => {
                          onSelectPart(pm.partId);
                          onHighlightParts([pm.partId]);
                        }}
                        className="w-full flex items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px] hover:bg-slate-50 cursor-pointer"
                      >
                        <span className="truncate text-slate-800 font-medium">{pm.partName}</span>
                        <span className="font-mono tabular-nums text-slate-600 shrink-0">
                          {pm.massKg >= 1
                            ? `${pm.massKg.toFixed(2)} kg`
                            : `${(pm.massKg * 1000).toFixed(0)} g`}{' '}
                          ({pm.densityGPerCm3.toFixed(1)})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 3. Live Kinematic Joint Motion Rigging, Pose Presets & Swept Envelopes */}
          <section className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Cog className="w-3.5 h-3.5 text-slate-600" />
                <span>Joint Motion Rigging ({movableJoints.length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                {movableJoints.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={onToggleKinematicPlaying}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border cursor-pointer transition-colors ${
                        kinematicPlaying
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {kinematicPlaying ? (
                        <>
                          <Pause className="w-3 h-3" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          <span>Cycle</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={onToggleSweptEnvelopes}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border cursor-pointer transition-colors ${
                        showSweptEnvelopes
                          ? 'bg-cyan-600 border-cyan-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Orbit className="w-3 h-3" />
                      <span>Envelope</span>
                    </button>
                  </>
                )}
                {hasActiveRig && (
                  <button
                    type="button"
                    onClick={onResetJointRig}
                    className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-950 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {posePresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {posePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onApplyPosePreset(preset)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950 cursor-pointer transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {movableJoints.length === 0 ? (
              <p className="text-xs text-slate-500">
                No movable revolute, prismatic, or cylindrical joints in this assembly.
              </p>
            ) : (
              <div className="space-y-2.5">
                {movableJoints.map((joint) => {
                  const val = jointRigValues[joint.id] || {};
                  const angleDeg = val.angleDeg ?? 0;
                  const slideMm = val.slideMm ?? 0;
                  const canSpin =
                    joint.jointKind === 'revolute' || joint.jointKind === 'cylindrical';
                  const canSlide =
                    joint.jointKind === 'prismatic' || joint.jointKind === 'cylindrical';

                  return (
                    <div
                      key={joint.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectPart(joint.childPartId);
                            onHighlightParts(joint.chainPartIds);
                          }}
                          className="text-left min-w-0 cursor-pointer"
                        >
                          <div className="text-xs font-medium text-slate-900 truncate">
                            {joint.childPartName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {joint.jointKind} · drives {joint.chainPartIds.length} part
                            {joint.chainPartIds.length === 1 ? '' : 's'}
                            {joint.coupledTargets && joint.coupledTargets.length > 0
                              ? ` · gear coupled (${joint.coupledTargets[0].ratio.toFixed(2)}×)`
                              : ''}
                          </div>
                        </button>
                        <span className="text-[10px] font-mono uppercase tracking-wide text-slate-600 border border-slate-300 bg-white px-1.5 py-0.5 rounded">
                          {joint.freeDofs.join(', ') || joint.jointKind}
                        </span>
                      </div>

                      {canSpin && (
                        <div className="flex items-center gap-2.5">
                          <span className="text-[11px] text-slate-500 w-10">Spin</span>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            value={Math.round(angleDeg)}
                            onChange={(e) =>
                              onJointRigChange(joint.id, {
                                ...val,
                                angleDeg: Number(e.target.value),
                              })
                            }
                            className="cad-slider flex-1"
                          />
                          <span className="text-[11px] font-mono tabular-nums text-slate-700 w-11 text-right">
                            {Math.round(angleDeg)}°
                          </span>
                        </div>
                      )}

                      {canSlide && (
                        <div className="flex items-center gap-2.5">
                          <span className="text-[11px] text-slate-500 w-10">Slide</span>
                          <input
                            type="range"
                            min={-80}
                            max={80}
                            value={Math.round(slideMm)}
                            onChange={(e) =>
                              onJointRigChange(joint.id, {
                                ...val,
                                slideMm: Number(e.target.value),
                              })
                            }
                            className="cad-slider flex-1"
                          />
                          <span className="text-[11px] font-mono tabular-nums text-slate-700 w-11 text-right">
                            {Math.round(slideMm)} mm
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. Multi-Mate Solver Diagnostics */}
          <section className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Link2 className="w-3.5 h-3.5 text-slate-600" />
                <span>Mate Solver ({audit?.solvedConstraints.length ?? 0})</span>
              </div>
              {audit && audit.solvedConstraints.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllMates((s) => !s)}
                  className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-950 cursor-pointer"
                >
                  {showAllMates ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>{showAllMates ? 'Show Flagged' : 'Show All'}</span>
                </button>
              )}
            </div>

            {audit && (
              <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
                <span className="text-emerald-700">
                  {audit.solvedConstraints.filter((m) => m.status === 'solved').length} locked
                </span>
                <span className="text-amber-700">
                  {audit.underConstrainedMateCount} open-DOF
                </span>
                <span
                  className={
                    audit.conflictingMateCount > 0 ? 'text-rose-700 font-semibold' : 'text-slate-500'
                  }
                >
                  {audit.conflictingMateCount} conflicting
                </span>
              </div>
            )}

            {displayedMates.length === 0 ? (
              <p className="text-xs text-slate-500">
                No explicit parametric mates defined on this legacy model.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {displayedMates.map((m, i) => {
                  const statusTone =
                    m.status === 'conflicting' || m.status === 'unresolved'
                      ? 'border-rose-200 bg-rose-50/70 text-rose-900'
                      : m.status === 'underConstrained'
                        ? 'border-amber-200 bg-amber-50/60 text-amber-950'
                        : 'border-slate-200 bg-white text-slate-800';
                  return (
                    <button
                      key={`${m.partId}_${i}`}
                      type="button"
                      onClick={() => {
                        onSelectPart(m.partId);
                        onHighlightParts(m.targetPartId ? [m.partId, m.targetPartId] : [m.partId]);
                      }}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors hover:brightness-98 cursor-pointer ${statusTone}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">{m.partName}</span>
                        <span className="text-[10px] font-mono uppercase shrink-0 opacity-80">
                          {m.constraintKind}
                        </span>
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5 leading-snug">{m.note}</div>
                      {m.conflictDetail && (
                        <div className="text-[11px] font-mono text-rose-700 mt-1">
                          Conflict: {m.conflictDetail}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 5. Automated Clash & Floating-Part Inspector */}
          <section className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Layers className="w-3.5 h-3.5 text-slate-600" />
                <span>Clash &amp; Grounding Linter</span>
              </div>
              {highlightedPartIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onHighlightParts([])}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Clear Highlight
                </button>
              )}
            </div>

            {audit &&
            audit.floatingParts.length === 0 &&
            (audit.occludedParts?.length ?? 0) === 0 &&
            (audit.unblendedMounts?.length ?? 0) === 0 &&
            audit.clashes.length === 0 &&
            audit.dynamicClashes.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>
                  Zero floating parts, zero unblended mounts, zero buried details, zero static Boolean clashes, and zero dynamic collisions.
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Unblended / Skewed Curved-Surface Mounts */}
                {audit && (audit.unblendedMounts?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>
                        Unblended Surface Mounts ({audit.unblendedMounts?.length ?? 0})
                      </span>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {(audit.unblendedMounts ?? []).map((um) => (
                        <button
                          key={um.partId}
                          type="button"
                          onClick={() => {
                            onSelectPart(um.partId);
                            onHighlightParts([um.partId, um.hostPartId]);
                          }}
                          className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-1.5 hover:bg-amber-50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-amber-950 truncate">
                              {um.partName}
                            </span>
                            <span className="font-mono text-[11px] text-amber-800 shrink-0">
                              {um.reason === 'cantileveredRimSkew'
                                ? `${um.maxRimGapMm.toFixed(1)} mm skew`
                                : `+${um.minSurfaceGapMm.toFixed(1)} mm air`}
                            </span>
                          </div>
                          <div className="text-[11px] text-amber-800/80 truncate">
                            On {um.hostPartName} · min {um.minSurfaceGapMm.toFixed(1)} mm / rim{' '}
                            {um.maxRimGapMm.toFixed(1)} mm
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Floating Parts */}
                {audit && audit.floatingParts.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Floating / Unsupported Parts ({audit.floatingParts.length})</span>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {audit.floatingParts.map((fp) => (
                        <button
                          key={fp.partId}
                          type="button"
                          onClick={() => {
                            onSelectPart(fp.partId);
                            onHighlightParts([fp.partId]);
                          }}
                          className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-1.5 hover:bg-amber-50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-amber-950 truncate">
                              {fp.partName}
                            </span>
                            <span className="font-mono text-[11px] text-amber-800 shrink-0">
                              +{fp.gapMm.toFixed(1)} mm gap
                            </span>
                          </div>
                          <div className="text-[11px] text-amber-800/80 truncate">
                            {fp.group} · min Y {fp.minYMm.toFixed(1)} mm
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buried / Occluded Exterior Details */}
                {audit && (audit.occludedParts?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Buried / Occluded Details ({audit.occludedParts.length})</span>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {audit.occludedParts.map((op) => (
                        <button
                          key={op.partId}
                          type="button"
                          onClick={() => {
                            onSelectPart(op.partId);
                            onHighlightParts([op.partId, op.occluderPartId]);
                          }}
                          className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-1.5 hover:bg-amber-50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-amber-950 truncate">
                              {op.partName}
                            </span>
                            <span className="font-mono text-[11px] text-amber-800 shrink-0">
                              {op.buriedRatioPct.toFixed(0)}% buried
                            </span>
                          </div>
                          <div className="text-[11px] text-amber-800/80 truncate">
                            Swallowed by {op.occluderPartName}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Static Hard Clashes */}
                {audit && audit.clashes.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-rose-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Static Interference Clashes ({audit.clashes.length})</span>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {audit.clashes.map((cl) => (
                        <button
                          key={cl.id}
                          type="button"
                          onClick={() => {
                            onSelectPart(cl.partAId);
                            onHighlightParts([cl.partAId, cl.partBId]);
                          }}
                          className="w-full text-left rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-1.5 hover:bg-rose-50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-rose-950 truncate">
                              {cl.partAName}
                            </span>
                            <span className="font-mono text-[11px] text-rose-700 shrink-0">
                              {cl.penetrationMm.toFixed(1)} mm
                            </span>
                          </div>
                          <div className="text-[11px] text-rose-800/80 truncate">
                            ↔ {cl.partBName} ({cl.overlapVolumeCm3.toFixed(1)} cm³
                            {cl.verificationMethod === 'exactBoolean' ? ' · Boolean' : ''})
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full-Stroke Dynamic Kinematic Clashes */}
                {audit && audit.dynamicClashes.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-rose-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Motion-Sweep Collisions ({audit.dynamicClashes.length})</span>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {audit.dynamicClashes.map((dc) => (
                        <button
                          key={dc.id}
                          type="button"
                          onClick={() => {
                            onSelectPart(dc.movingPartId);
                            onHighlightParts([dc.movingPartId, dc.obstaclePartId]);
                          }}
                          className="w-full text-left rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-1.5 hover:bg-rose-50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-rose-950 truncate">
                              {dc.movingPartName} @ {dc.poseLabel}
                            </span>
                            <span className="font-mono text-[11px] text-rose-700 shrink-0">
                              {dc.overlapVolumeCm3.toFixed(1)} cm³
                            </span>
                          </div>
                          <div className="text-[11px] text-rose-800/80 truncate">
                            Hits {dc.obstaclePartName} ({dc.penetrationMm.toFixed(1)} mm)
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Architekton Constellation Photo QA Gate (coverage + check_points + glass_box) */}
          <section className="px-6 py-4 space-y-3 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Constellation Photo QA Gate
                </h3>
              </div>
              {constellationQa && (
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full ${
                    constellationQa.passed
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {constellationQa.passed ? 'PASS' : 'NEEDS FIX'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {onLoadConstellationCamera && (
                <label className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer">
                  {blueprint.photoMatchCamera?.constellationCamera
                    ? 'camera.json ✓'
                    : 'Load camera.json'}
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      f.text().then((txt) => {
                        try {
                          onLoadConstellationCamera(JSON.parse(txt));
                        } catch {
                          // ignore malformed JSON
                        }
                      });
                    }}
                  />
                </label>
              )}

              {onRunConstellationQa && (
                <label
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer ${
                    !blueprint.photoMatchCamera?.constellationCamera || constellationBusy
                      ? 'opacity-50 pointer-events-none'
                      : ''
                  }`}
                >
                  Run Inventory QA
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      f.text().then((txt) => {
                        try {
                          const parsed = JSON.parse(txt);
                          onRunConstellationQa(
                            parsed.objects ? parsed : undefined,
                            Array.isArray(parsed.checkPoints) ? parsed.checkPoints : undefined
                          );
                        } catch {
                          // ignore malformed JSON
                        }
                      });
                    }}
                  />
                </label>
              )}

              {onRectifyGlassBox && (
                <button
                  type="button"
                  disabled={
                    constellationBusy ||
                    !blueprint.sourceImageUrl ||
                    !blueprint.photoMatchCamera?.constellationCamera
                  }
                  onClick={onRectifyGlassBox}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 cursor-pointer"
                >
                  {blueprint.rectifiedFaces && Object.keys(blueprint.rectifiedFaces).length > 0
                    ? `Glass Box (${Object.keys(blueprint.rectifiedFaces).join('/')})`
                    : 'Rectify Glass Box'}
                </button>
              )}
            </div>

            {constellationError && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {constellationError}
              </div>
            )}

            {(constellationQa || blueprint.constellationQa) && (() => {
              const qa = constellationQa || blueprint.constellationQa!;
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Coverage
                      </div>
                      <div className="font-mono font-semibold text-slate-900 text-sm">
                        {Math.round(qa.coveragePct)}% ({qa.okCount}/{qa.toModelCount})
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Check-Point RMS
                      </div>
                      <div className="font-mono font-semibold text-slate-900 text-sm">
                        {qa.rmsPx !== null ? `${qa.rmsPx.toFixed(2)} px` : '—'}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600">{qa.summary}</p>
                  {qa.todo.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Worst-First Todo ({qa.todo.length})
                      </div>
                      {qa.todo.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => {
                            if (row.matchedParts.length > 0) {
                              onSelectPart(row.matchedParts[0]);
                              onHighlightParts(row.matchedParts);
                            }
                          }}
                          className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 hover:bg-amber-50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-medium text-slate-900 truncate">{row.id}</span>
                            <span className="font-mono text-[10px] uppercase text-amber-800 shrink-0">
                              {row.status} · IoU {row.iou.toFixed(2)}
                            </span>
                          </div>
                          {row.note && (
                            <div className="text-[11px] text-slate-600 truncate">{row.note}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        </div>
      </aside>
    </div>
  );
}
