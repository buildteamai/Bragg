import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Crosshair,
  FlipHorizontal,
  Layers,
  Move,
  Orbit,
  Play,
  RotateCcw,
  Ruler,
  ScanLine,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  CaliperMeasurement,
  CameraPresetId,
  LightingPresetId,
  RenderMode,
  SectionPlaneConfig,
  StudioTheme,
  TessellationDensity,
  TransformGizmoMode,
} from '../types/blueprint';

type DockTab = 'render' | 'inspect' | 'camera';

interface BottomControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  studioTheme: StudioTheme;
  onStudioThemeChange: (theme: StudioTheme) => void;
  lightingPreset: LightingPresetId;
  onLightingPresetChange: (preset: LightingPresetId) => void;
  aoEnabled: boolean;
  onToggleAo: () => void;
  renderMode: RenderMode;
  onRenderModeChange: (mode: RenderMode) => void;
  tessellation: TessellationDensity;
  onTessellationChange: (density: TessellationDensity) => void;
  explodeFactor: number;
  onExplodeFactorChange: (v: number) => void;
  sectionPlane: SectionPlaneConfig;
  onSectionPlaneChange: (cfg: SectionPlaneConfig) => void;
  caliperActive: boolean;
  onToggleCaliper: () => void;
  caliperMeasurement: CaliperMeasurement;
  onClearCaliper: () => void;
  gizmoMode: TransformGizmoMode;
  onGizmoModeChange: (mode: TransformGizmoMode) => void;
  showCoGOverlay: boolean;
  onToggleCoGOverlay: () => void;
  showSweptEnvelopes: boolean;
  onToggleSweptEnvelopes: () => void;
  showInstallationOverlay: boolean;
  onToggleInstallationOverlay: () => void;
  hasSimulation: boolean;
  showSimHmi: boolean;
  onToggleSimHmi: () => void;
  hasMovableJoints: boolean;
  hasSourceImage: boolean;
  hasConstellationCamera?: boolean;
  onLoadConstellationCamera?: (rawJson: any) => void;
  referenceOverlayOpacity: number;
  onReferenceOverlayOpacityChange: (v: number) => void;
  edgeDiffActive: boolean;
  onToggleEdgeDiff: () => void;
  onApplyCameraPreset: (preset: CameraPresetId) => void;
}

export function BottomControlDock({
  collapsed,
  onToggleCollapse,
  studioTheme,
  onStudioThemeChange,
  lightingPreset,
  onLightingPresetChange,
  aoEnabled,
  onToggleAo,
  renderMode,
  onRenderModeChange,
  tessellation,
  onTessellationChange,
  explodeFactor,
  onExplodeFactorChange,
  sectionPlane,
  onSectionPlaneChange,
  caliperActive,
  onToggleCaliper,
  caliperMeasurement,
  onClearCaliper,
  gizmoMode,
  onGizmoModeChange,
  showCoGOverlay,
  onToggleCoGOverlay,
  showSweptEnvelopes,
  onToggleSweptEnvelopes,
  showInstallationOverlay,
  onToggleInstallationOverlay,
  hasSimulation,
  showSimHmi,
  onToggleSimHmi,
  hasMovableJoints,
  hasSourceImage,
  hasConstellationCamera,
  onLoadConstellationCamera,
  referenceOverlayOpacity,
  onReferenceOverlayOpacityChange,
  edgeDiffActive,
  onToggleEdgeDiff,
  onApplyCameraPreset,
}: BottomControlDockProps) {
  const [activeTab, setActiveTab] = useState<DockTab>('render');

  const isDark = studioTheme === 'dark';

  const surfaceCls = isDark
    ? 'bg-[#181d26] border-white/12 text-slate-100 shadow-xl'
    : 'bg-white border-slate-200 text-slate-900 shadow-lg';

  const segBg = isDark ? 'bg-white/6' : 'bg-slate-100';
  const segActive = isDark
    ? 'bg-white text-slate-950 shadow-xs'
    : 'bg-white text-slate-950 shadow-xs';
  const segIdle = isDark
    ? 'text-slate-300 hover:text-white'
    : 'text-slate-600 hover:text-slate-950';

  return (
    <div
      className="absolute left-1/2 z-20 transition-transform duration-200 ease-out"
      style={{
        bottom: '18px',
        width: 'min(920px, calc(100% - 32px))',
        transform: collapsed
          ? 'translate(-50%, calc(100% + 18px))'
          : 'translate(-50%, 0)',
      }}
    >
      {/* Attached Collapse / Expand Handle Tab */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggleCollapse}
          style={{
            transform: collapsed ? 'translateY(-44px)' : 'translateY(1px)',
          }}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 cursor-pointer transition-colors duration-150 whitespace-nowrap ${
            isDark
              ? 'bg-[#181d26] border-white/12 text-slate-300 hover:text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-950'
          }`}
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Container (Zero backdrop-filter over WebGL) */}
      <div className={`rounded-xl border px-4 py-3 ${surfaceCls}`}>
        {/* Top Row: Compact Tab Selector + Caliper Readout */}
        <div className="flex items-center justify-between gap-4 pb-2.5 mb-2.5 border-b border-current/10">
          <div className={`inline-flex items-center gap-1 p-1 rounded-lg ${segBg}`}>
            {(
              [
                { id: 'render', label: 'Render', icon: Layers },
                { id: 'inspect', label: 'Inspect', icon: Sliders },
                { id: 'camera', label: 'Camera', icon: Camera },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 ${
                    active ? segActive : segIdle
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs tabular-nums">
            {hasSimulation && (
              <button
                type="button"
                onClick={onToggleSimHmi}
                title="Open machine Operator HMI (START / STOP / E-STOP simulation)"
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                  showSimHmi
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : isDark
                      ? 'border-white/15 text-slate-200 hover:bg-white/10'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Operate / HMI</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleInstallationOverlay}
              title="Toggle operator floor markings, NEC panel clearances, door swings & utility drops"
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                showInstallationOverlay
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : isDark
                    ? 'border-white/15 text-slate-200 hover:bg-white/10'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Floor &amp; Utilities</span>
            </button>
            {caliperActive && (
              <span className="hidden sm:inline font-mono text-rose-600 dark:text-rose-400 font-medium whitespace-nowrap">
                {caliperMeasurement.distanceMm !== null
                  ? `D ${caliperMeasurement.distanceMm.toFixed(2)} mm`
                  : caliperMeasurement.pointA
                    ? 'Select second point on mesh'
                    : 'Click two mesh points'}
              </span>
            )}
            <span className={`hidden md:inline ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Press H to toggle controls
            </span>
          </div>
        </div>

        {/* Tab 1: Render Modes, Studio Lighting Rigs, Contact AO, Mesh Density, Backdrop */}
        {activeTab === 'render' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Shading
                </span>
                <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}>
                  {(
                    [
                      { id: 'shaded', label: 'Shaded' },
                      { id: 'cadEdges', label: 'CAD Edges' },
                      { id: 'wireframe', label: 'Wireframe' },
                      { id: 'normals', label: 'Normals' },
                      { id: 'zebra', label: 'Zebra' },
                      { id: 'xray', label: 'X-Ray' },
                    ] as { id: RenderMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onRenderModeChange(m.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        renderMode === m.id ? segActive : segIdle
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Mesh
                  </span>
                  <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}>
                    {(['standard', 'high', 'ultra'] as TessellationDensity[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => onTessellationChange(d)}
                        className={`px-2 py-1 text-xs font-medium rounded-md capitalize whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          tessellation === d ? segActive : segIdle
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}>
                  {(['light', 'dark'] as StudioTheme[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onStudioThemeChange(t)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        studioTheme === t ? segActive : segIdle
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-current/10">
              <div className="flex items-center gap-2">
                <Sun
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                />
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Studio Rig
                </span>
                <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}>
                  {(
                    [
                      { id: 'cyclorama', label: 'Cyclorama' },
                      { id: 'darkRim', label: 'Dark Rim' },
                      { id: 'factoryFloor', label: 'Factory' },
                      { id: 'showroom', label: 'Showroom' },
                    ] as { id: LightingPresetId; label: string }[]
                  ).map((rig) => (
                    <button
                      key={rig.id}
                      type="button"
                      onClick={() => onLightingPresetChange(rig.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        lightingPreset === rig.id ? segActive : segIdle
                      }`}
                    >
                      {rig.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleAo}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                  aoEnabled
                    ? isDark
                      ? 'bg-white text-slate-950 border-white'
                      : 'bg-slate-900 text-white border-slate-900'
                    : isDark
                      ? 'border-white/15 text-slate-300 hover:bg-white/10'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Contact AO {aoEnabled ? 'On' : 'Off'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Metrology Inspection (Exploded View, Section Cut, Caliper, Photo Overlay) */}
        {activeTab === 'inspect' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Exploded View */}
            <div className="md:col-span-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  Exploded View
                </span>
                <span className="font-mono tabular-nums font-medium">
                  {Math.round(explodeFactor * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(explodeFactor * 100)}
                onChange={(e) => onExplodeFactorChange(Number(e.target.value) / 100)}
                className={`cad-slider w-full ${isDark ? 'cad-slider-dark' : ''}`}
              />
            </div>

            {/* Section Plane Cut */}
            <div className="md:col-span-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  Section Cut
                </span>
                <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-md ${segBg}`}>
                  {(['off', 'x', 'y', 'z'] as const).map((axis) => (
                    <button
                      key={axis}
                      type="button"
                      onClick={() =>
                        onSectionPlaneChange({ ...sectionPlane, axis })
                      }
                      className={`px-2 py-0.5 text-[11px] font-mono uppercase rounded cursor-pointer ${
                        sectionPlane.axis === axis ? segActive : segIdle
                      }`}
                    >
                      {axis}
                    </button>
                  ))}
                  {sectionPlane.axis !== 'off' && (
                    <button
                      type="button"
                      title="Flip section direction"
                      onClick={() =>
                        onSectionPlaneChange({
                          ...sectionPlane,
                          invert: !sectionPlane.invert,
                        })
                      }
                      className={`p-1 rounded cursor-pointer ${segIdle}`}
                    >
                      <FlipHorizontal className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                disabled={sectionPlane.axis === 'off'}
                value={Math.round(sectionPlane.position * 100)}
                onChange={(e) =>
                  onSectionPlaneChange({
                    ...sectionPlane,
                    position: Number(e.target.value) / 100,
                  })
                }
                className={`cad-slider w-full disabled:opacity-35 ${
                  isDark ? 'cad-slider-dark' : ''
                }`}
              />
            </div>

            {/* Photo Alignment Overlay */}
            <div className="md:col-span-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  Photo Trace
                </span>
                <span className="font-mono tabular-nums font-medium">
                  {hasSourceImage ? `${Math.round(referenceOverlayOpacity * 100)}%` : 'Off'}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={70}
                disabled={!hasSourceImage}
                value={Math.round(referenceOverlayOpacity * 100)}
                onChange={(e) =>
                  onReferenceOverlayOpacityChange(Number(e.target.value) / 100)
                }
                className={`cad-slider w-full disabled:opacity-35 ${isDark ? 'cad-slider-dark' : ''}`}
              />
            </div>

            {/* Edge-Diff & Point-to-Point Caliper */}
            <div className="md:col-span-3 flex items-center justify-end gap-1.5">
              {hasSourceImage && (
                <button
                  type="button"
                  onClick={onToggleEdgeDiff}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                    edgeDiffActive
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : isDark
                        ? 'border-white/15 text-slate-200 hover:bg-white/10'
                        : 'border-slate-300 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>Edge Diff</span>
                </button>
              )}
              <button
                type="button"
                onClick={onToggleCaliper}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                  caliperActive
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : isDark
                      ? 'border-white/15 text-slate-200 hover:bg-white/10'
                      : 'border-slate-300 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>Caliper</span>
              </button>
              {(caliperMeasurement.pointA || caliperMeasurement.pointB) && (
                <button
                  type="button"
                  onClick={onClearCaliper}
                  title="Clear measurement pins"
                  className={`p-1.5 rounded-lg border cursor-pointer ${
                    isDark
                      ? 'border-white/15 text-slate-300 hover:bg-white/10'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Second Row: 3D Part Edit Gizmo, CoG & Stability Overlay, Swept Clearance Envelopes */}
            <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-current/10">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onGizmoModeChange(
                      gizmoMode === 'off'
                        ? 'translate'
                        : gizmoMode === 'translate'
                          ? 'rotate'
                          : 'off'
                    )
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                    gizmoMode !== 'off'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : isDark
                        ? 'border-white/15 text-slate-200 hover:bg-white/10'
                        : 'border-slate-300 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Move className="w-3.5 h-3.5" />
                  <span>
                    {gizmoMode === 'off'
                      ? '3D Edit Gizmo'
                      : gizmoMode === 'translate'
                        ? 'Gizmo: Move (G)'
                        : 'Gizmo: Rotate (R)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleCoGOverlay}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                    showCoGOverlay
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : isDark
                        ? 'border-white/15 text-slate-200 hover:bg-white/10'
                        : 'border-slate-300 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>CoG &amp; Support</span>
                </button>

                {hasMovableJoints && (
                  <button
                    type="button"
                    onClick={onToggleSweptEnvelopes}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                      showSweptEnvelopes
                        ? 'bg-cyan-600 border-cyan-600 text-white'
                        : isDark
                          ? 'border-white/15 text-slate-200 hover:bg-white/10'
                          : 'border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Orbit className="w-3.5 h-3.5" />
                    <span>Swept Envelopes</span>
                  </button>
                )}
              </div>

              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Click any part to inspect · G Move · R Rotate · Ctrl+Z Undo
              </span>
            </div>
          </div>
        )}

        {/* Tab 3: Smooth Camera Presets */}
        {activeTab === 'camera' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'photoMatch', label: 'Photo Match' },
                  { id: 'iso', label: 'Isometric 3/4' },
                  { id: 'front', label: 'Front' },
                  { id: 'left', label: 'Left Profile' },
                  { id: 'side', label: 'Right Profile' },
                  { id: 'top', label: 'Top Plan' },
                  { id: 'interior', label: 'Close-Up' },
                ] as { id: CameraPresetId; label: string }[]
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyCameraPreset(preset.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    isDark
                      ? 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/12'
                      : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              {hasSourceImage && (
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.abs(referenceOverlayOpacity - 0.5) < 0.05 ? 0 : 0.5;
                    onReferenceOverlayOpacityChange(next);
                    if (next > 0) onApplyCameraPreset('photoMatch');
                  }}
                  title="Snap to exact Photo Match camera and toggle 50/50 photo blend"
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    Math.abs(referenceOverlayOpacity - 0.5) < 0.05
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-500'
                      : isDark
                        ? 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/12'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  50/50 Blend
                </button>
              )}
              {onLoadConstellationCamera && (
                <label
                  title="Load Architekton Constellation camera.json for exact photo-camera match"
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    hasConstellationCamera
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500'
                      : isDark
                        ? 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/12'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {hasConstellationCamera ? 'camera.json ✓' : 'Load camera.json'}
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      file.text().then((txt) => {
                        try {
                          onLoadConstellationCamera(JSON.parse(txt));
                        } catch {
                          // ignore invalid json
                        }
                      });
                    }}
                  />
                </label>
              )}
            </div>
            <span
              className={`text-xs whitespace-nowrap ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Drag to orbit · Scroll to zoom · Right-drag to pan
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
