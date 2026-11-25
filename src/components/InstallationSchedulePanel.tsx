import React, { useMemo } from 'react';
import {
  AlertTriangle,
  DoorOpen,
  Layers,
  PlugZap,
  ShieldCheck,
  X,
} from 'lucide-react';
import { MeshBlueprint, StudioTheme } from '../types/blueprint';
import {
  InstallationVisibilityOptions,
  resolveInstallationSpec,
  UTILITY_STYLE,
} from '../engine/installationOverlay';

interface InstallationSchedulePanelProps {
  blueprint: MeshBlueprint;
  studioTheme: StudioTheme;
  options: InstallationVisibilityOptions;
  onOptionsChange: (next: InstallationVisibilityOptions) => void;
  onClose: () => void;
}

function mmToFtIn(mm: number): string {
  const totalIn = mm / 25.4;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn - ft * 12);
  if (ft === 0) return `${inches}"`;
  if (inches === 0) return `${ft}'`;
  return `${ft}'-${inches}"`;
}

const ROUTING_LABEL: Record<string, string> = {
  floor_stub: 'Floor Stub-Up',
  overhead_drop: 'Overhead Drop',
  rear_manifold: 'Rear Manifold',
  side_panel: 'Side Panel',
};

export function InstallationSchedulePanel({
  blueprint,
  studioTheme,
  options,
  onOptionsChange,
  onClose,
}: InstallationSchedulePanelProps) {
  const isDark = studioTheme === 'dark';
  const { spec, isDerived } = useMemo(() => resolveInstallationSpec(blueprint), [blueprint]);

  const floorZones = spec.floorZones.filter((z) => z.kind !== 'door_swing');
  const doorSwings = spec.floorZones.filter((z) => z.kind === 'door_swing');

  return (
    <aside
      aria-label="Machine Installation Envelope & Utility Schedule"
      className={`absolute top-5 right-6 z-20 w-[340px] max-w-[calc(100%-32px)] max-h-[calc(100%-150px)] flex flex-col rounded-xl border shadow-xl overflow-hidden ${
        isDark
          ? 'bg-[#151a24]/95 border-white/12 text-slate-100'
          : 'bg-white/95 border-slate-200 text-slate-900'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <h3
              className="text-xs font-semibold truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Floor Markings &amp; Utilities
            </h3>
            <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {isDerived ? 'Auto-derived baseline envelope' : 'OEM Installation Envelope'}
              {spec.underCrane ? ' · Under-Crane (Floor Stub)' : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Hide floor markings & utilities"
          className={`p-1 rounded-md cursor-pointer ${
            isDark ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Sub-layer Filter Toggles */}
      <div
        className={`px-4 py-2 border-b flex items-center gap-1.5 text-[11px] ${
          isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <button
          type="button"
          onClick={() => onOptionsChange({ ...options, showZones: !options.showZones })}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium cursor-pointer transition-colors ${
            options.showZones
              ? 'bg-emerald-600 text-white'
              : isDark
                ? 'bg-white/10 text-slate-400'
                : 'bg-slate-200 text-slate-600'
          }`}
        >
          <Layers className="w-3 h-3" /> Zones ({floorZones.length})
        </button>
        <button
          type="button"
          onClick={() => onOptionsChange({ ...options, showDoorSwings: !options.showDoorSwings })}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium cursor-pointer transition-colors ${
            options.showDoorSwings
              ? 'bg-amber-600 text-white'
              : isDark
                ? 'bg-white/10 text-slate-400'
                : 'bg-slate-200 text-slate-600'
          }`}
        >
          <DoorOpen className="w-3 h-3" /> Doors ({doorSwings.length})
        </button>
        <button
          type="button"
          onClick={() => onOptionsChange({ ...options, showUtilities: !options.showUtilities })}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium cursor-pointer transition-colors ${
            options.showUtilities
              ? 'bg-sky-600 text-white'
              : isDark
                ? 'bg-white/10 text-slate-400'
                : 'bg-slate-200 text-slate-600'
          }`}
        >
          <PlugZap className="w-3 h-3" /> Utilities ({spec.utilities.length})
        </button>
      </div>

      {/* Scrollable Schedule Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 text-xs">
        {isDerived && (
          <div
            className={`flex items-start gap-2 p-2.5 rounded-lg border text-[11px] leading-snug ${
              isDark
                ? 'bg-amber-500/10 border-amber-400/25 text-amber-200'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Baseline auto-envelope shown. Use the <strong>CLI</strong> drawer to author exact OEM
              clearances, door swings, and utility drops for this model.
            </span>
          </div>
        )}

        {/* Utility Connections Schedule */}
        {spec.utilities.length > 0 && (
          <div className="space-y-1.5">
            <div
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Utility Connections &amp; Requirements
            </div>
            <div className="space-y-1.5">
              {spec.utilities.map((u) => {
                const st = UTILITY_STYLE[u.kind];
                return (
                  <div
                    key={u.id}
                    className={`rounded-lg border px-2.5 py-2 space-y-1 ${
                      isDark ? 'bg-[#10141c] border-white/10' : 'bg-slate-50/70 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white shrink-0"
                          style={{ backgroundColor: st.color }}
                        >
                          {st.shortCode}
                        </span>
                        <span className="font-semibold text-[11px] truncate">{u.label}</span>
                      </div>
                      <span
                        className={`text-[10px] shrink-0 ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {ROUTING_LABEL[u.routing] || u.routing}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] opacity-90">{u.spec}</div>
                    <div
                      className={`flex items-center justify-between text-[10px] font-mono ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      <span>{u.pipeOrConduitSize || st.label}</span>
                      <span>
                        ({mmToFtIn(u.positionMm[0])}, {mmToFtIn(u.positionMm[1])},{' '}
                        {mmToFtIn(u.positionMm[2])})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Floor Clearances & Door Swings */}
        {spec.floorZones.length > 0 && (
          <div className="space-y-1.5">
            <div
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Floor Markings, Clearances &amp; Swings
            </div>
            <div className="space-y-1.5">
              {spec.floorZones.map((z) => {
                const dimLabel = z.rectMm
                  ? `${mmToFtIn(z.rectMm.widthX)} × ${mmToFtIn(z.rectMm.depthZ)}`
                  : z.doorSwingMm
                    ? `R ${mmToFtIn(z.doorSwingMm.radiusMm)} · ${Math.abs(z.doorSwingMm.sweepAngleDeg)}°`
                    : 'Custom Polygon';
                return (
                  <div
                    key={z.id}
                    className={`rounded-lg border px-2.5 py-1.5 ${
                      isDark ? 'bg-[#10141c] border-white/10' : 'bg-slate-50/70 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[11px] truncate">{z.label}</span>
                      <span className="font-mono text-[10px] opacity-80 shrink-0">{dimLabel}</span>
                    </div>
                    {z.citation && (
                      <div
                        className={`text-[10px] mt-0.5 ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {z.citation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
