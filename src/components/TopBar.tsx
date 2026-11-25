import React from 'react';
import { StudioTheme } from '../types/blueprint';

export type ActiveWorkspaceView =
  | 'viewport'
  | 'models'
  | 'orchestrator'
  | 'configure'
  | 'fiveAngle'
  | 'compare'
  | 'assembly'
  | 'audit'
  | 'agy'
  | 'terminal'
  | 'export';

export interface ViewerModelOption {
  id: string;
  label: string;
  group?: string;
}

interface TopBarProps {
  activeView: ActiveWorkspaceView;
  onSelectView: (view: ActiveWorkspaceView) => void;
  models: ViewerModelOption[];
  activeModelId: string;
  onSelectModel: (id: string) => void;
  hasSourceImage: boolean;
  hasConfigurator?: boolean;
  studioTheme: StudioTheme;
}

export function TopBar({
  activeView,
  onSelectView,
  models,
  activeModelId,
  onSelectModel,
  hasSourceImage,
  hasConfigurator = false,
  studioTheme,
}: TopBarProps) {
  const isDark = studioTheme === 'dark';

  const navItems: {
    id: ActiveWorkspaceView;
    label: string;
    requiresImage?: boolean;
  }[] = [
    { id: 'viewport', label: 'Viewport' },
    { id: 'models', label: 'Models' },
    { id: 'agy', label: 'CLI' },
    { id: 'terminal', label: 'Terminal' },
    ...(hasConfigurator ? [{ id: 'configure' as const, label: 'Configure' }] : []),
    { id: 'fiveAngle', label: '5-Angle' },
    { id: 'compare', label: 'Compare', requiresImage: true },
    { id: 'assembly', label: 'Assembly' },
    { id: 'audit', label: 'Audit' },
  ];

  const groupedModels = React.useMemo(() => {
    const groups: { label: string; items: ViewerModelOption[] }[] = [];
    const byLabel = new Map<string, ViewerModelOption[]>();
    for (const m of models) {
      const g = m.group || 'Models';
      let arr = byLabel.get(g);
      if (!arr) {
        arr = [];
        byLabel.set(g, arr);
        groups.push({ label: g, items: arr });
      }
      arr.push(m);
    }
    return groups;
  }, [models]);

  return (
    <header
      className={`h-14 w-full flex items-center justify-between gap-6 px-6 border-b shrink-0 z-30 transition-colors duration-150 ${
        isDark
          ? 'bg-[#141820] border-white/10 text-slate-100'
          : 'bg-white border-slate-200/90 text-slate-900'
      }`}
    >
      {/* Zone 1: Brand Wordmark */}
      <button
        type="button"
        onClick={() => onSelectView('viewport')}
        className="text-lg font-semibold tracking-tight whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        18D
      </button>

      {/* Zone 2: Inspection Views */}
      <nav
        aria-label="Viewer navigation"
        className="flex items-center gap-7 text-sm font-medium"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const isDisabled = Boolean(item.requiresImage) && !hasSourceImage;
          return (
            <button
              key={item.id}
              type="button"
              disabled={isDisabled}
              title={
                isDisabled
                  ? 'Photo comparison is available when a reference photograph is attached'
                  : undefined
              }
              onClick={() => onSelectView(item.id)}
              className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 ${
                isDisabled
                  ? isDark
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-300 cursor-not-allowed'
                  : isActive
                    ? isDark
                      ? 'text-white cursor-pointer'
                      : 'text-slate-950 cursor-pointer'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-100 cursor-pointer'
                      : 'text-slate-500 hover:text-slate-900 cursor-pointer'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className={`absolute left-0 right-0 -bottom-[17px] h-[2px] ${
                    isDark ? 'bg-white' : 'bg-slate-900'
                  }`}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Session Build Switcher + Download/Export Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        {models.length > 0 && (
          <select
            aria-label="Switch active 3D build"
            value={activeModelId}
            onChange={(e) => onSelectModel(e.target.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer focus:outline-none focus:ring-2 transition-colors ${
              isDark
                ? 'bg-[#1c222d] border-white/15 text-slate-100 focus:ring-white/30'
                : 'bg-slate-50 border-slate-300 text-slate-800 focus:ring-slate-900/20'
            }`}
          >
            {groupedModels.length > 1
              ? groupedModels.map((grp) => (
                  <optgroup key={grp.label} label={grp.label}>
                    {grp.items.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))
              : models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => onSelectView('export')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${
            isDark
              ? 'bg-white text-slate-950 hover:bg-slate-200 focus-visible:outline-white'
              : 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-slate-900'
          }`}
        >
          Export
        </button>
      </div>
    </header>
  );
}
