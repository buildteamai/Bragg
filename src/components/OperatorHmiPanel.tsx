import React from 'react';
import {
  Download,
  Home,
  Layers,
  OctagonAlert,
  Play,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import { MachineSimulationSpec, StudioTheme } from '../types/blueprint';
import { SimCommandKind, SimRuntimeState } from '../engine/machineSimEngine';

interface OperatorHmiPanelProps {
  spec: MachineSimulationSpec;
  sim: SimRuntimeState;
  speedMultiplier: number;
  studioTheme: StudioTheme;
  onCommand: (cmd: SimCommandKind) => void;
  onSpeedChange: (speed: number) => void;
  onExportSimManifest: () => void;
  onClose: () => void;
}

const MM_TO_IN = 1 / 25.4;

export function OperatorHmiPanel({
  spec,
  sim,
  speedMultiplier,
  studioTheme,
  onCommand,
  onSpeedChange,
  onExportSimManifest,
  onClose,
}: OperatorHmiPanelProps) {
  const isDark = studioTheme === 'dark';

  const badgeCls =
    sim.state === 'RUNNING'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
      : sim.state === 'ESTOP'
        ? 'bg-rose-600 text-white border-rose-500 animate-pulse'
        : sim.state === 'HOLD' || sim.state === 'HOMING'
          ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
          : sim.state === 'COMPLETE'
            ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
            : isDark
              ? 'bg-white/10 text-slate-300 border-white/15'
              : 'bg-slate-200 text-slate-700 border-slate-300';

  return (
    <aside
      aria-label="Machine Operator HMI"
      className={`absolute top-5 right-6 z-20 w-[348px] max-w-[calc(100%-32px)] rounded-xl border shadow-2xl overflow-hidden ${
        isDark
          ? 'bg-[#141923]/95 border-white/12 text-slate-100'
          : 'bg-white/95 border-slate-200 text-slate-900'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="text-xs font-semibold truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {spec.machineTitle}
            </h3>
            <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border ${badgeCls}`}>
              {sim.state}
            </span>
          </div>
          <p className={`text-[10px] mt-0.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {sim.statusMessage}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close Operator HMI"
          className={`p-1 rounded-md cursor-pointer shrink-0 ${
            isDark ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Primary Industrial Controls: START / STOP / E-STOP */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onCommand('start')}
            disabled={sim.eStopLatched || sim.state === 'RUNNING'}
            className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-500 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shadow-sm transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>START</span>
          </button>

          <button
            type="button"
            onClick={() => onCommand('stop')}
            disabled={sim.state !== 'RUNNING' && sim.state !== 'HOMING'}
            className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shadow-sm transition-colors"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>STOP</span>
          </button>

          <button
            type="button"
            onClick={() => onCommand('estop')}
            className={`flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl font-bold text-xs cursor-pointer shadow-sm transition-all border-2 ${
              sim.eStopLatched
                ? 'bg-rose-700 border-yellow-400 text-white ring-2 ring-rose-500/60'
                : 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500'
            }`}
          >
            <OctagonAlert className="w-4 h-4" />
            <span>{sim.eStopLatched ? 'E-STOPPED' : 'E-STOP'}</span>
          </button>
        </div>

        {/* Secondary Controls: RESET / HOME / PLATE */}
        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => onCommand('reset')}
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border font-medium cursor-pointer transition-colors ${
              sim.eStopLatched
                ? 'bg-sky-600 border-sky-500 text-white hover:bg-sky-500'
                : isDark
                  ? 'border-white/15 hover:bg-white/10 text-slate-200'
                  : 'border-slate-300 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            type="button"
            onClick={() => onCommand('home')}
            disabled={sim.eStopLatched}
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border font-medium cursor-pointer disabled:opacity-35 transition-colors ${
              isDark
                ? 'border-white/15 hover:bg-white/10 text-slate-200'
                : 'border-slate-300 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Home className="w-3.5 h-3.5" /> Home
          </button>
          {spec.workpiece && (
            <button
              type="button"
              onClick={() => onCommand('toggle_plate')}
              className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border font-medium cursor-pointer transition-colors ${
                sim.plateLoaded
                  ? isDark
                    ? 'bg-white/15 border-white/25 text-white'
                    : 'bg-slate-900 border-slate-900 text-white'
                  : isDark
                    ? 'border-white/15 hover:bg-white/10 text-slate-400'
                    : 'border-slate-300 hover:bg-slate-100 text-slate-600'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> {sim.plateLoaded ? 'Plate On' : 'No Plate'}
            </button>
          )}
        </div>

        {/* Cycle Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
              Cycle Progress ({sim.cycleTimeSec.toFixed(1)}s)
            </span>
            <span className="font-semibold">{sim.progressPct}%</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
            <div
              className={`h-full transition-all duration-150 ${
                sim.state === 'ESTOP'
                  ? 'bg-rose-500'
                  : sim.state === 'HOLD'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${sim.progressPct}%` }}
            />
          </div>
        </div>

        {/* Live Telemetry & Axis DRO */}
        <div
          className={`grid grid-cols-3 gap-2 rounded-lg border p-2.5 font-mono text-[11px] tabular-nums ${
            isDark ? 'bg-[#0f131b] border-white/10' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div>
            <div className="text-[9px] font-sans uppercase opacity-60">Pump PSI</div>
            <div className="font-semibold mt-0.5">{sim.pressurePsi.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[9px] font-sans uppercase opacity-60">Feed IPM</div>
            <div className="font-semibold mt-0.5">{sim.feedrateIpm}</div>
          </div>
          <div>
            <div className="text-[9px] font-sans uppercase opacity-60">Garnet lb/m</div>
            <div className="font-semibold mt-0.5">{sim.abrasiveLbMin.toFixed(2)}</div>
          </div>
          <div className="col-span-3 pt-1.5 border-t border-current/10 flex items-center justify-between text-[10px]">
            <span>X {(sim.nozzleTipWorldMm[0] * MM_TO_IN).toFixed(1)}&quot;</span>
            <span>Y {(-sim.nozzleTipWorldMm[2] * MM_TO_IN).toFixed(1)}&quot;</span>
            <span>Z {(sim.nozzleTipWorldMm[1] * MM_TO_IN).toFixed(1)}&quot;</span>
          </div>
        </div>

        {/* Speed Override + SOT kit_runtime Export */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1 text-[11px]">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Speed:</span>
            {[1, 2, 5].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSpeedChange(spd)}
                className={`px-2 py-0.5 rounded font-mono font-medium cursor-pointer ${
                  speedMultiplier === spd
                    ? 'bg-indigo-600 text-white'
                    : isDark
                      ? 'bg-white/10 text-slate-300 hover:bg-white/15'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                {spd}×
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onExportSimManifest}
            title="Download sim_manifest.json for SOT kit_runtime (Omniverse Kit)"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
              isDark
                ? 'border-white/15 text-slate-200 hover:bg-white/10'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Download className="w-3 h-3" /> SOT Manifest
          </button>
        </div>
      </div>
    </aside>
  );
}
