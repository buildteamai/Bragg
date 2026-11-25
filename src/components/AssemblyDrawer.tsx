import React from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { MeshBlueprint, MetrologyStats } from '../types/blueprint';

interface AssemblyDrawerProps {
  open: boolean;
  onClose: () => void;
  blueprint: MeshBlueprint;
  metrology: MetrologyStats | null;
  hiddenPartIds: Set<string>;
  onTogglePartVisibility: (partId: string) => void;
  onShowAllParts: () => void;
  selectedPartId: string | null;
  onSelectPart: (partId: string | null) => void;
}

export function AssemblyDrawer({
  open,
  onClose,
  blueprint,
  metrology,
  hiddenPartIds,
  onTogglePartVisibility,
  onShowAllParts,
  selectedPartId,
  onSelectPart,
}: AssemblyDrawerProps) {
  if (!open) return null;

  const grouped = new Map<string, NonNullable<MetrologyStats['parts']>>();
  (metrology?.parts || []).forEach((p) => {
    const arr = grouped.get(p.group) || [];
    arr.push(p);
    grouped.set(p.group, arr);
  });

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/35"
      onClick={onClose}
    >
      <aside
        aria-label="Assembly Hierarchy and Metrology"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2
              className="text-base font-semibold text-slate-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Assembly Tree
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {blueprint.name} · {blueprint.category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assembly drawer"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Metrology Strip */}
        {metrology && (
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 space-y-2.5">
            <p className="text-xs text-slate-600 leading-relaxed">{blueprint.summary}</p>
            <div className="grid grid-cols-3 gap-3 pt-1 font-mono text-xs tabular-nums">
              <div>
                <div className="text-[11px] font-sans text-slate-500">Envelope (mm)</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {metrology.boundingMm[0].toFixed(0)}×{metrology.boundingMm[1].toFixed(0)}×
                  {metrology.boundingMm[2].toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-sans text-slate-500">Triangles</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {metrology.totalTriangles.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-sans text-slate-500">Surface Area</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {metrology.surfaceAreaM2.toFixed(2)} m²
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Attached Reference Context (Web URLs & PDFs) */}
        {blueprint.contextSources &&
          (blueprint.contextSources.webUrls.length > 0 ||
            blueprint.contextSources.pdfNames.length > 0) && (
            <div className="px-6 py-3.5 border-b border-slate-200 bg-white space-y-2 text-xs">
              <div className="font-semibold text-slate-500">Reference Context</div>
              {blueprint.contextSources.pdfNames.length > 0 && (
                <div className="text-slate-700">
                  <span className="text-slate-500">PDFs: </span>
                  {blueprint.contextSources.pdfNames.join(' · ')}
                </div>
              )}
              {blueprint.contextSources.webUrls.length > 0 && (
                <div className="space-y-1">
                  {blueprint.contextSources.webUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-mono text-[11px] text-slate-700 hover:text-slate-950 underline"
                    >
                      {url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Controls Strip */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-slate-200 text-xs">
          <span className="text-slate-500 tabular-nums">
            {metrology ? metrology.partCount : blueprint.parts.length} parametric parts
          </span>
          {hiddenPartIds.size > 0 && (
            <button
              type="button"
              onClick={onShowAllParts}
              className="font-medium text-slate-900 hover:underline cursor-pointer"
            >
              Show all ({hiddenPartIds.size} hidden)
            </button>
          )}
        </div>

        {/* Hierarchical Parts List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {Array.from(grouped.entries()).map(([groupName, items]) => (
            <div key={groupName} className="py-3">
              <div className="px-6 pb-1.5 text-xs font-semibold text-slate-500">
                {groupName} · {items.length}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isHidden = hiddenPartIds.has(item.id);
                  const isSelected = selectedPartId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-3 px-6 py-2 transition-colors ${
                        isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPart(isSelected ? null : item.id)}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <div
                          className={`text-xs font-medium truncate ${
                            isHidden ? 'text-slate-400 line-through' : 'text-slate-900'
                          }`}
                        >
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums truncate mt-0.5">
                          {item.sizeMm[0].toFixed(1)}×{item.sizeMm[1].toFixed(1)}×
                          {item.sizeMm[2].toFixed(1)} mm · ±{item.toleranceMm} mm ·{' '}
                          {item.triangles.toLocaleString()} tris
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onTogglePartVisibility(item.id)}
                        aria-label={isHidden ? `Show ${item.name}` : `Hide ${item.name}`}
                        className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer shrink-0"
                      >
                        {isHidden ? (
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
