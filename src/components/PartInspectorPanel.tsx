import React, { useMemo } from 'react';
import {
  Loader2,
  Magnet,
  Move,
  Redo2,
  RotateCw,
  Sliders,
  Undo2,
  X,
} from 'lucide-react';
import {
  BlueprintPart,
  MetrologyStats,
  PartMaterialSpec,
  StudioTheme,
  TransformGizmoMode,
} from '../types/blueprint';

interface PartInspectorPanelProps {
  part: BlueprintPart | null;
  metrology: MetrologyStats | null;
  studioTheme: StudioTheme;
  gizmoMode: TransformGizmoMode;
  onGizmoModeChange: (mode: TransformGizmoMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onUpdatePart: (partId: string, updater: (part: BlueprintPart) => BlueprintPart) => void;
  onAutoSeatAssembly: () => void;
  autoSeatBusy: boolean;
  autoSeatNote: string | null;
  onClose: () => void;
}

const QUICK_FINISHES: Array<{
  label: string;
  patch: Partial<PartMaterialSpec>;
}> = [
  {
    label: 'Satin Silver',
    patch: {
      colorHex: '#b4bcc6',
      metalness: 0.35,
      roughness: 0.32,
      clearcoat: 0.25,
      finishName: 'Satin Silver Alloy',
    },
  },
  {
    label: 'Machined Steel',
    patch: {
      colorHex: '#94a3b8',
      metalness: 0.88,
      roughness: 0.24,
      clearcoat: 0.05,
      finishName: 'CNC Machined Steel',
    },
  },
  {
    label: 'Matte Graphite',
    patch: {
      colorHex: '#272c35',
      metalness: 0.22,
      roughness: 0.56,
      clearcoat: 0.08,
      finishName: 'Matte Graphite Polymer',
    },
  },
  {
    label: 'Safety Yellow',
    patch: {
      colorHex: '#eab308',
      metalness: 0.08,
      roughness: 0.28,
      clearcoat: 0.45,
      finishName: 'Safety Yellow Enamel',
    },
  },
  {
    label: 'Cobalt Enamel',
    patch: {
      colorHex: '#2563eb',
      metalness: 0.12,
      roughness: 0.26,
      clearcoat: 0.5,
      finishName: 'Industrial Cobalt Enamel',
    },
  },
  {
    label: 'Copper',
    patch: {
      colorHex: '#c87547',
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.08,
      finishName: 'Polished Copper',
    },
  },
];

export function PartInspectorPanel({
  part,
  metrology,
  studioTheme,
  gizmoMode,
  onGizmoModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onUpdatePart,
  onAutoSeatAssembly,
  autoSeatBusy,
  autoSeatNote,
  onClose,
}: PartInspectorPanelProps) {
  const partMass = useMemo(() => {
    if (!part || !metrology?.massProperties) return null;
    return metrology.massProperties.parts.find((p) => p.partId === part.id) ?? null;
  }, [part, metrology]);

  const partMetrology = useMemo(() => {
    if (!part || !metrology) return null;
    return metrology.parts.find((p) => p.id === part.id) ?? null;
  }, [part, metrology]);

  if (!part) return null;

  const isDark = studioTheme === 'dark';
  const surfaceCls = isDark
    ? 'bg-[#181d26] border-white/12 text-slate-100 shadow-2xl'
    : 'bg-white border-slate-200 text-slate-900 shadow-xl';
  const subSurfaceCls = isDark
    ? 'bg-white/5 border-white/10'
    : 'bg-slate-50 border-slate-200/90';
  const inputCls = isDark
    ? 'bg-[#10141c] border-white/15 text-slate-100 focus:border-blue-400'
    : 'bg-white border-slate-300 text-slate-900 focus:border-slate-900';
  const labelCls = isDark ? 'text-slate-400' : 'text-slate-500';

  const setPosAxis = (idx: 0 | 1 | 2, val: number) => {
    if (!Number.isFinite(val)) return;
    onUpdatePart(part.id, (p) => {
      const next: [number, number, number] = [...p.positionMm];
      next[idx] = Number(val.toFixed(2));
      return { ...p, positionMm: next };
    });
  };

  const setRotAxis = (idx: 0 | 1 | 2, val: number) => {
    if (!Number.isFinite(val)) return;
    onUpdatePart(part.id, (p) => {
      const next: [number, number, number] = [...p.rotationDeg];
      next[idx] = Number(val.toFixed(1));
      return { ...p, rotationDeg: next };
    });
  };

  const patchMaterial = (patch: Partial<PartMaterialSpec>) => {
    onUpdatePart(part.id, (p) => ({
      ...p,
      material: { ...p.material, ...patch },
    }));
  };

  // Detect directly editable scalar geometry dimensions (on csgRoot or standard primitive)
  const csg = part.geometry.kind === 'csgSolid' ? part.geometry.csgRoot : undefined;
  const scalarFields: Array<{
    key: 'width' | 'height' | 'depth' | 'radius' | 'wallThickness' | 'chamferMm';
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
  }> = [];

  const sourceObj = csg ?? part.geometry;
  if (typeof sourceObj.width === 'number') {
    scalarFields.push({ key: 'width', label: 'Width', value: sourceObj.width, min: 2, max: 3000, step: 1 });
  }
  if (typeof sourceObj.height === 'number') {
    scalarFields.push({ key: 'height', label: 'Height', value: sourceObj.height, min: 2, max: 3000, step: 1 });
  }
  if (typeof sourceObj.depth === 'number') {
    scalarFields.push({ key: 'depth', label: 'Depth', value: sourceObj.depth, min: 2, max: 3000, step: 1 });
  }
  if (typeof sourceObj.radius === 'number') {
    scalarFields.push({ key: 'radius', label: 'Radius', value: sourceObj.radius, min: 1, max: 1500, step: 0.5 });
  }
  if (typeof sourceObj.wallThickness === 'number') {
    scalarFields.push({
      key: 'wallThickness',
      label: 'Wall',
      value: sourceObj.wallThickness,
      min: 0.8,
      max: 40,
      step: 0.2,
    });
  }
  if (csg && typeof csg.chamferMm === 'number') {
    scalarFields.push({
      key: 'chamferMm',
      label: 'Chamfer',
      value: csg.chamferMm,
      min: 0,
      max: 25,
      step: 0.2,
    });
  }

  const updateScalarDim = (
    key: 'width' | 'height' | 'depth' | 'radius' | 'wallThickness' | 'chamferMm',
    val: number
  ) => {
    if (!Number.isFinite(val)) return;
    onUpdatePart(part.id, (p) => {
      if (p.geometry.kind === 'csgSolid' && p.geometry.csgRoot) {
        return {
          ...p,
          geometry: {
            ...p.geometry,
            csgRoot: {
              ...p.geometry.csgRoot,
              [key]: Math.max(0.2, Number(val.toFixed(2))),
            },
          },
        };
      }
      return {
        ...p,
        geometry: {
          ...p.geometry,
          [key]: Math.max(0.2, Number(val.toFixed(2))),
        },
      };
    });
  };

  return (
    <aside
      aria-label="Part Parametric Inspector"
      className={`absolute top-4 right-4 z-20 w-76 max-h-[calc(100%-150px)] rounded-xl border flex flex-col overflow-hidden ${surfaceCls}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3.5 py-2.5 border-b border-current/10 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 shrink-0 opacity-75" />
            <h3 className="text-xs font-semibold truncate">{part.name}</h3>
          </div>
          <div className={`text-[10px] font-mono mt-0.5 truncate ${labelCls}`}>
            {part.group}
            {partMetrology?.isWatertightCsg ? ' · Watertight CSG' : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close inspector (Esc)"
          className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-current/10 cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 text-xs">
        {/* Gizmo Mode + Undo/Redo Bar */}
        <div className="flex items-center justify-between gap-1.5">
          <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg border ${subSurfaceCls}`}>
            {(
              [
                { id: 'off', label: 'Pick', icon: null },
                { id: 'translate', label: 'Move', icon: Move },
                { id: 'rotate', label: 'Rotate', icon: RotateCw },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = gizmoMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onGizmoModeChange(m.id)}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md cursor-pointer transition-colors ${
                    active
                      ? isDark
                        ? 'bg-white text-slate-950'
                        : 'bg-slate-900 text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              title="Undo edit (Ctrl+Z)"
              className={`p-1.5 rounded-md border disabled:opacity-30 cursor-pointer ${subSurfaceCls}`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              title="Redo edit (Ctrl+Shift+Z)"
              className={`p-1.5 rounded-md border disabled:opacity-30 cursor-pointer ${subSurfaceCls}`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Position (mm) */}
        <div className="space-y-1">
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${labelCls}`}>
            Position (mm)
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
              <label key={axis} className="block space-y-0.5">
                <span className={`text-[10px] font-mono ${labelCls}`}>{axis}</span>
                <input
                  type="number"
                  step={1}
                  value={Number(part.positionMm[idx].toFixed(1))}
                  onChange={(e) => setPosAxis(idx as 0 | 1 | 2, Number(e.target.value))}
                  className={`w-full px-2 py-1 text-[11px] font-mono tabular-nums rounded border focus:outline-none ${inputCls}`}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Rotation (deg) */}
        <div className="space-y-1">
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${labelCls}`}>
            Rotation (deg)
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['RX', 'RY', 'RZ'] as const).map((axis, idx) => (
              <label key={axis} className="block space-y-0.5">
                <span className={`text-[10px] font-mono ${labelCls}`}>{axis}</span>
                <input
                  type="number"
                  step={1}
                  value={Number(part.rotationDeg[idx].toFixed(1))}
                  onChange={(e) => setRotAxis(idx as 0 | 1 | 2, Number(e.target.value))}
                  className={`w-full px-2 py-1 text-[11px] font-mono tabular-nums rounded border focus:outline-none ${inputCls}`}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Direct Parametric CSG / Primitive Dimensions */}
        {scalarFields.length > 0 && (
          <div className="space-y-1.5">
            <div className={`text-[10px] font-semibold uppercase tracking-wider ${labelCls}`}>
              Parametric Dimensions (mm)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {scalarFields.slice(0, 4).map((f) => (
                <label key={f.key} className="block space-y-0.5">
                  <span className={`text-[10px] font-mono ${labelCls}`}>{f.label}</span>
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={Number(f.value.toFixed(1))}
                    onChange={(e) => updateScalarDim(f.key, Number(e.target.value))}
                    className={`w-full px-2 py-1 text-[11px] font-mono tabular-nums rounded border focus:outline-none ${inputCls}`}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Material & Surface Finish */}
        <div className="space-y-2 pt-1 border-t border-current/10">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${labelCls}`}>
              Material &amp; Finish
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="color"
                value={part.material.colorHex}
                onChange={(e) => patchMaterial({ colorHex: e.target.value })}
                className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
              />
              <span className="text-[10px] font-mono opacity-80">{part.material.colorHex}</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {QUICK_FINISHES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => patchMaterial(preset.patch)}
                className={`flex items-center gap-1 px-1.5 py-1 text-[10px] rounded border truncate cursor-pointer hover:brightness-95 ${subSurfaceCls}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                  style={{ backgroundColor: preset.patch.colorHex }}
                />
                <span className="truncate">{preset.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] w-16 ${labelCls}`}>Metalness</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(part.material.metalness * 100)}
                onChange={(e) => patchMaterial({ metalness: Number(e.target.value) / 100 })}
                className={`cad-slider flex-1 ${isDark ? 'cad-slider-dark' : ''}`}
              />
              <span className="text-[10px] font-mono tabular-nums w-8 text-right">
                {Math.round(part.material.metalness * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] w-16 ${labelCls}`}>Roughness</span>
              <input
                type="range"
                min={6}
                max={96}
                value={Math.round(part.material.roughness * 100)}
                onChange={(e) => patchMaterial({ roughness: Number(e.target.value) / 100 })}
                className={`cad-slider flex-1 ${isDark ? 'cad-slider-dark' : ''}`}
              />
              <span className="text-[10px] font-mono tabular-nums w-8 text-right">
                {Math.round(part.material.roughness * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Live Part Mass & Physical Properties */}
        {partMass && (
          <div className={`rounded-lg border p-2 space-y-1 ${subSurfaceCls}`}>
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
              <span className={labelCls}>Part Mass</span>
              <span className="font-semibold">
                {partMass.massKg >= 1
                  ? `${partMass.massKg.toFixed(2)} kg`
                  : `${(partMass.massKg * 1000).toFixed(0)} g`}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums opacity-75">
              <span>{partMass.volumeCm3.toFixed(1)} cm³</span>
              <span>ρ {partMass.densityGPerCm3.toFixed(2)} g/cm³</span>
            </div>
          </div>
        )}

        {/* Deterministic Kernel Auto-Seat & Normal Align */}
        <div className="pt-1 border-t border-current/10 space-y-1.5">
          <button
            type="button"
            disabled={autoSeatBusy}
            onClick={onAutoSeatAssembly}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {autoSeatBusy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Seating via Manifold-3D...</span>
              </>
            ) : (
              <>
                <Magnet className="w-3.5 h-3.5" />
                <span>Auto-Seat &amp; Align to Host</span>
              </>
            )}
          </button>
          {autoSeatNote && (
            <p className={`text-[10px] leading-snug ${labelCls}`}>{autoSeatNote}</p>
          )}
        </div>
      </div>
    </aside>
  );
}
