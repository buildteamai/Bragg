import React from 'react';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { MetrologyStats, StudioTheme } from '../types/blueprint';
import {
  DeckSurfaceId,
  DEFAULT_WORK_PLATFORM_CONFIG,
  GuardrailLayoutId,
  IndustrialFinishId,
  WorkPlatformConfig,
} from '../engine/engineeringLibrary';

interface ConfiguratorDrawerProps {
  open: boolean;
  onClose: () => void;
  config: WorkPlatformConfig;
  onChange: (next: WorkPlatformConfig) => void;
  onReset: () => void;
  onReframeCamera: () => void;
  metrology: MetrologyStats | null;
  studioTheme: StudioTheme;
}

const FINISH_OPTIONS: {
  id: IndustrialFinishId;
  label: string;
  spec: string;
  swatches: [string, string];
}[] = [
  {
    id: 'painted',
    label: 'Painted Steel',
    spec: 'Machinery Slate Gray + OSHA Safety Yellow',
    swatches: ['#4b555f', '#e2a312'],
  },
  {
    id: 'galvanized',
    label: 'Hot-Dip Galvanized',
    spec: 'ASTM A123 Crystalline Spangle Zinc',
    swatches: ['#96938d', '#b4b1aa'],
  },
  {
    id: 'stainless',
    label: '304 Stainless Steel',
    spec: 'Sanitary No. 4 Brushed Alloy',
    swatches: ['#c6cdd6', '#9aa3ae'],
  },
];

const SURFACE_OPTIONS: {
  id: DeckSurfaceId;
  label: string;
  spec: string;
}[] = [
  {
    id: 'barGrating',
    label: 'Open Bar Grating',
    spec: 'NAAMM 19-W-4 welded bars + grooved nosing',
  },
  {
    id: 'diamondPlate',
    label: 'Diamond Checker Plate',
    spec: 'ASTM A786 raised-lug steel floor plate',
  },
];

const BAY_OPTIONS: (1 | 2 | 3)[] = [1, 2, 3];
const HEIGHT_OPTIONS: { value: 720 | 900 | 1080; steps: number }[] = [
  { value: 720, steps: 3 },
  { value: 900, steps: 4 },
  { value: 1080, steps: 5 },
];
const WIDTH_OPTIONS: (760 | 860 | 1000)[] = [760, 860, 1000];

const GUARDRAIL_OPTIONS: {
  id: GuardrailLayoutId;
  label: string;
  spec: string;
}[] = [
  {
    id: 'backAndLeft',
    label: 'Open Front (+Z)',
    spec: 'Rear & left guardrails, open work face',
  },
  {
    id: 'enclosedFront',
    label: 'Enclosed Front',
    spec: '3-sided OSHA perimeter, open stair entry',
  },
];

export function ConfiguratorDrawer({
  open,
  onClose,
  config,
  onChange,
  onReset,
  onReframeCamera,
  metrology,
  studioTheme,
}: ConfiguratorDrawerProps) {
  if (!open) return null;

  const isDark = studioTheme === 'dark';
  const isDefault =
    config.finish === DEFAULT_WORK_PLATFORM_CONFIG.finish &&
    config.deckSurface === DEFAULT_WORK_PLATFORM_CONFIG.deckSurface &&
    config.bayCount === DEFAULT_WORK_PLATFORM_CONFIG.bayCount &&
    config.deckHeightMm === DEFAULT_WORK_PLATFORM_CONFIG.deckHeightMm &&
    config.deckWidthMm === DEFAULT_WORK_PLATFORM_CONFIG.deckWidthMm &&
    config.guardrailLayout === DEFAULT_WORK_PLATFORM_CONFIG.guardrailLayout;

  const stepCount = Math.round(config.deckHeightMm / 180) - 1;
  const baySpanMm = config.bayCount * 1398 + (config.bayCount - 1) * 4;

  const sectionLabelCls = `text-xs font-medium mb-2 ${
    isDark ? 'text-slate-300' : 'text-slate-600'
  }`;

  const segmentedTrackCls = `grid gap-1 p-1 rounded-lg border ${
    isDark
      ? 'bg-[#12161d] border-white/10'
      : 'bg-slate-100 border-slate-200/80'
  }`;

  const segmentedBtnCls = (active: boolean) =>
    `px-3 py-2 text-xs font-medium rounded-md transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 ${
      active
        ? isDark
          ? 'bg-white text-slate-950 shadow-sm focus-visible:outline-white'
          : 'bg-white text-slate-950 shadow-sm focus-visible:outline-slate-900'
        : isDark
          ? 'text-slate-400 hover:text-slate-100 focus-visible:outline-white'
          : 'text-slate-600 hover:text-slate-950 focus-visible:outline-slate-900'
    }`;

  const choiceRowCls = (active: boolean) =>
    `w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 ${
      active
        ? isDark
          ? 'bg-white/10 border-white/40 text-white focus-visible:outline-white'
          : 'bg-slate-900 text-white border-slate-900 focus-visible:outline-slate-900'
        : isDark
          ? 'bg-[#1a202b] border-white/10 text-slate-200 hover:border-white/25 focus-visible:outline-white'
          : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 focus-visible:outline-slate-900'
    }`;

  return (
    <aside
      aria-label="Parametric engineering configurator"
      className={`fixed top-14 right-0 bottom-0 w-96 max-w-[92vw] z-30 border-l shadow-2xl flex flex-col ${
        isDark
          ? 'bg-[#141820] border-white/10 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 shrink-0 opacity-75" />
            <h2
              className="text-sm font-semibold tracking-tight truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Parametric Configurator
            </h2>
          </div>
          <p
            className={`text-xs mt-0.5 font-mono tabular-nums ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {config.bayCount} {config.bayCount === 1 ? 'bay' : 'bays'} · {stepCount} steps ·{' '}
            {config.deckHeightMm} mm deck
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close configurator"
          className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
            isDark
              ? 'text-slate-400 hover:text-white hover:bg-white/10'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Engineering Parameters */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* 1. Finish / Coating */}
        <section>
          <h3 className={sectionLabelCls}>Surface Finish & Coating</h3>
          <div className="space-y-2">
            {FINISH_OPTIONS.map((opt) => {
              const active = config.finish === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...config, finish: opt.id })}
                  className={choiceRowCls(active)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          active
                            ? isDark
                              ? 'text-slate-300'
                              : 'text-slate-300'
                            : isDark
                              ? 'text-slate-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {opt.spec}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
                      <span
                        className="w-4 h-4 rounded-sm border border-black/15"
                        style={{ backgroundColor: opt.swatches[0] }}
                      />
                      <span
                        className="w-4 h-4 rounded-sm border border-black/15"
                        style={{ backgroundColor: opt.swatches[1] }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Deck & Tread Surface */}
        <section>
          <h3 className={sectionLabelCls}>Deck & Stair Tread Surface</h3>
          <div className="space-y-2">
            {SURFACE_OPTIONS.map((opt) => {
              const active = config.deckSurface === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...config, deckSurface: opt.id })}
                  className={choiceRowCls(active)}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      active
                        ? 'text-slate-300'
                        : isDark
                          ? 'text-slate-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {opt.spec}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Modular Bays */}
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Modular Deck Bays
            </h3>
            <span
              className={`text-[11px] font-mono tabular-nums ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {baySpanMm.toLocaleString()} mm span
            </span>
          </div>
          <div className={`${segmentedTrackCls} grid-cols-3`}>
            {BAY_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={config.bayCount === n}
                onClick={() => onChange({ ...config, bayCount: n })}
                className={segmentedBtnCls(config.bayCount === n)}
              >
                {n} {n === 1 ? 'Bay' : 'Bays'}
              </button>
            ))}
          </div>
        </section>

        {/* 4. Deck Elevation */}
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Deck Elevation (180 mm Rise)
            </h3>
            <span
              className={`text-[11px] font-mono tabular-nums ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              44.2° stair
            </span>
          </div>
          <div className={`${segmentedTrackCls} grid-cols-3`}>
            {HEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={config.deckHeightMm === opt.value}
                onClick={() => onChange({ ...config, deckHeightMm: opt.value })}
                className={segmentedBtnCls(config.deckHeightMm === opt.value)}
              >
                <span className="font-mono tabular-nums">{opt.value}</span> mm
              </button>
            ))}
          </div>
        </section>

        {/* 5. Platform Width */}
        <section>
          <h3 className={sectionLabelCls}>Platform & Stair Width</h3>
          <div className={`${segmentedTrackCls} grid-cols-3`}>
            {WIDTH_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={config.deckWidthMm === w}
                onClick={() => onChange({ ...config, deckWidthMm: w })}
                className={segmentedBtnCls(config.deckWidthMm === w)}
              >
                <span className="font-mono tabular-nums">{w}</span> mm
              </button>
            ))}
          </div>
        </section>

        {/* 6. Guardrail Perimeter */}
        <section>
          <h3 className={sectionLabelCls}>Guardrail Perimeter</h3>
          <div className="space-y-2">
            {GUARDRAIL_OPTIONS.map((opt) => {
              const active = config.guardrailLayout === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...config, guardrailLayout: opt.id })}
                  className={choiceRowCls(active)}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      active
                        ? 'text-slate-300'
                        : isDark
                          ? 'text-slate-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {opt.spec}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Footer: Live Envelope Readout & Reset / Frame Actions */}
      <div
        className={`px-5 py-4 border-t shrink-0 space-y-3 ${
          isDark ? 'border-white/10 bg-[#11151c]' : 'border-slate-200 bg-slate-50/70'
        }`}
      >
        {metrology && (
          <div
            className={`flex items-center justify-between text-xs font-mono tabular-nums ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            <span>
              {metrology.boundingMm[0].toFixed(0)} × {metrology.boundingMm[1].toFixed(0)} ×{' '}
              {metrology.boundingMm[2].toFixed(0)} mm
            </span>
            <span>{metrology.partCount} solids</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReframeCamera}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              isDark
                ? 'border-white/15 bg-[#1c222d] text-slate-100 hover:bg-[#252d3b]'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
            }`}
          >
            Frame Assembly
          </button>
          <button
            type="button"
            disabled={isDefault}
            onClick={onReset}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              isDefault
                ? isDark
                  ? 'border-white/5 text-slate-600 cursor-not-allowed'
                  : 'border-slate-200 text-slate-400 cursor-not-allowed'
                : isDark
                  ? 'border-white/15 bg-[#1c222d] text-slate-200 hover:bg-[#252d3b] cursor-pointer'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>
    </aside>
  );
}
