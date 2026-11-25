import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  Pin,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { MeshBlueprint, StudioTheme } from '../types/blueprint';

export interface LibraryFolderItem {
  id: string;
  name: string;
  order: number;
}

export interface LibraryModelItem {
  id: string;
  label: string;
  category: string;
  partCount: number;
  isBuiltIn: boolean;
  isEdited?: boolean;
  folderId: string | null;
  pinned: boolean;
  order: number;
  envelopeMm?: { width: number; height: number; depth: number };
}

export interface DeletedBuiltInItem {
  id: string;
  label: string;
  category: string;
}

interface ModelLibraryDrawerProps {
  open: boolean;
  onClose: () => void;
  studioTheme: StudioTheme;
  activeModelId: string;
  models: LibraryModelItem[];
  folders: LibraryFolderItem[];
  deletedBuiltIns: DeletedBuiltInItem[];
  hasUnsavedEdits: boolean;
  onSelectModel: (id: string) => void;
  onDeleteModel: (id: string) => void;
  onRestoreBuiltIn: (id: string) => void;
  onRestoreAllBuiltIns: () => void;
  onRenameModel: (id: string, nextLabel: string) => void;
  onMoveModelToFolder: (id: string, folderId: string | null) => void;
  onTogglePinModel: (id: string) => void;
  onReorderModel: (id: string, direction: 'up' | 'down') => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, nextName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onSaveCurrentModel: () => void;
  onDuplicateActiveModel: () => void;
  onImportBlueprintJson: (blueprint: MeshBlueprint) => void;
  onImport3DAsset: (payload: {
    id: string;
    name: string;
    format: 'glb' | 'usd';
    assetUrl: string;
    envelopeMm: { width: number; height: number; depth: number };
    meshCount?: number;
    triangleCount?: number;
  }) => void;
}

type SortMode = 'custom' | 'name' | 'parts';

export function ModelLibraryDrawer({
  open,
  onClose,
  studioTheme,
  activeModelId,
  models,
  folders,
  deletedBuiltIns,
  hasUnsavedEdits,
  onSelectModel,
  onDeleteModel,
  onRestoreBuiltIn,
  onRestoreAllBuiltIns,
  onRenameModel,
  onMoveModelToFolder,
  onTogglePinModel,
  onReorderModel,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onSaveCurrentModel,
  onDuplicateActiveModel,
  onImportBlueprintJson,
  onImport3DAsset,
}: ModelLibraryDrawerProps) {
  const isDark = studioTheme === 'dark';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState('');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all'); // 'all' | 'pinned' | 'uncategorized' | folderId
  const [sortMode, setSortMode] = useState<SortMode>('custom');

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderValue, setRenamingFolderValue] = useState('');

  const [renamingModelId, setRenamingModelId] = useState<string | null>(null);
  const [renamingModelValue, setRenamingModelValue] = useState('');

  const [confirmDeleteModelId, setConfirmDeleteModelId] = useState<string | null>(null);
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing3D, setImporting3D] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerCwd, setExplorerCwd] = useState('');
  const [explorerParent, setExplorerParent] = useState<string | null>(null);
  const [explorerShortcuts, setExplorerShortcuts] = useState<{ label: string; path: string }[]>([]);
  const [explorerEntries, setExplorerEntries] = useState<
    { name: string; path: string; isDir: boolean; ext: string; sizeBytes: number }[]
  >([]);
  const [explorerFilter, setExplorerFilter] = useState('');
  const [showLocalPathImport, setShowLocalPathImport] = useState(false);
  const [localPathInput, setLocalPathInput] = useState('');

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [folders]
  );

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let pinnedCount = 0;
    let uncatCount = 0;
    for (const m of models) {
      if (m.pinned) pinnedCount++;
      if (!m.folderId || !folders.some((f) => f.id === m.folderId)) {
        uncatCount++;
      } else {
        counts.set(m.folderId, (counts.get(m.folderId) || 0) + 1);
      }
    }
    return { counts, pinnedCount, uncatCount };
  }, [models, folders]);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    const validFolderIds = new Set(folders.map((f) => f.id));

    let list = models.filter((m) => {
      if (selectedFolderFilter === 'pinned' && !m.pinned) return false;
      if (selectedFolderFilter === 'uncategorized') {
        if (m.folderId && validFolderIds.has(m.folderId)) return false;
      } else if (
        selectedFolderFilter !== 'all' &&
        selectedFolderFilter !== 'pinned' &&
        m.folderId !== selectedFolderFilter
      ) {
        return false;
      }
      if (!q) return true;
      const folderName = folders.find((f) => f.id === m.folderId)?.name.toLowerCase() || '';
      return (
        m.label.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        folderName.includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'name') return a.label.localeCompare(b.label);
      if (sortMode === 'parts') return b.partCount - a.partCount || a.label.localeCompare(b.label);
      return a.order - b.order || a.label.localeCompare(b.label);
    });

    return list;
  }, [models, folders, search, selectedFolderFilter, sortMode]);

  // Group by folder when viewing 'all'
  const groupedSections = useMemo(() => {
    if (selectedFolderFilter !== 'all') {
      return [{ id: selectedFolderFilter, title: null as string | null, items: filteredModels }];
    }
    const validFolderIds = new Set(sortedFolders.map((f) => f.id));
    const sections: { id: string; title: string | null; items: LibraryModelItem[] }[] = [];

    const pinned = filteredModels.filter((m) => m.pinned);
    if (pinned.length > 0) {
      sections.push({ id: '__pinned', title: 'Pinned', items: pinned });
    }

    const unpinned = filteredModels.filter((m) => !m.pinned);
    for (const f of sortedFolders) {
      const items = unpinned.filter((m) => m.folderId === f.id);
      if (items.length > 0) {
        sections.push({ id: f.id, title: f.name, items });
      }
    }
    const uncategorized = unpinned.filter((m) => !m.folderId || !validFolderIds.has(m.folderId));
    if (uncategorized.length > 0) {
      sections.push({ id: '__uncategorized', title: 'Uncategorized', items: uncategorized });
    }
    return sections;
  }, [filteredModels, selectedFolderFilter, sortedFolders]);

  if (!open) return null;

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    onCreateFolder(trimmed);
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const importFromLocalPath = async (rawPath: string) => {
    const p = rawPath.trim();
    if (!p || importing3D) return;
    setImportError(null);
    setImporting3D(true);
    try {
      const res = await fetch('/api/library/import-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ localPath: p }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Import failed (HTTP ${res.status})`);
      if (data.format === 'json' && data.blueprint) {
        onImportBlueprintJson(data.blueprint);
      } else {
        onImport3DAsset(data);
      }
      setLocalPathInput('');
      setShowLocalPathImport(false);
    } catch (err: any) {
      setImportError(err?.message || 'Failed to import local USD / GLB file.');
    } finally {
      setImporting3D(false);
    }
  };

  const handleLocalPathImport = async (e: React.FormEvent) => {
    e.preventDefault();
    await importFromLocalPath(localPathInput);
  };

  const loadExplorerDir = async (dir?: string) => {
    setExplorerLoading(true);
    setImportError(null);
    try {
      const qs = dir ? `?dir=${encodeURIComponent(dir)}` : '';
      const res = await fetch(`/api/library/fs-list${qs}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Could not open folder (HTTP ${res.status})`);
      setExplorerCwd(data.cwd || '');
      setExplorerParent(data.parent ?? null);
      setExplorerShortcuts(Array.isArray(data.shortcuts) ? data.shortcuts : []);
      setExplorerEntries(Array.isArray(data.entries) ? data.entries : []);
      setExplorerFilter('');
    } catch (err: any) {
      setImportError(err?.message || 'Failed to browse folder.');
    } finally {
      setExplorerLoading(false);
    }
  };

  const handleBrowseFileExplorer = async () => {
    setShowExplorer(true);
    await loadExplorerDir(explorerCwd || undefined);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || ''));
          const bp: MeshBlueprint = parsed?.blueprint ? parsed.blueprint : parsed;
          if (!bp || typeof bp !== 'object' || !Array.isArray(bp.parts) || !bp.name) {
            throw new Error('JSON file is not a valid 18D MeshBlueprint.');
          }
          onImportBlueprintJson(bp);
        } catch (err: any) {
          setImportError(err?.message || 'Failed to import blueprint JSON.');
        }
      };
      reader.readAsText(file);
      return;
    }

    // .glb, .gltf, .usd, .usda, .usdc, .usdz -> send to local 18D server for storage / USD->GLB conversion
    setImporting3D(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch('/api/library/import-3d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            dataBase64: String(reader.result || ''),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Import failed (HTTP ${res.status})`);
        onImport3DAsset(data);
      } catch (err: any) {
        setImportError(err?.message || 'Failed to import 3D model.');
      } finally {
        setImporting3D(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const surfaceBg = isDark ? 'bg-[#141820] border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const subtleBg = isDark ? 'bg-[#1a202c]/70 border-white/10' : 'bg-slate-50/70 border-slate-200';
  const inputCls = isDark
    ? 'bg-[#1c222d] border-white/15 text-slate-100 placeholder:text-slate-500 focus:ring-white/25'
    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:ring-slate-900/20';

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/35"
      onClick={onClose}
    >
      <aside
        aria-label="Saved Models & Organization"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg h-full border-l shadow-2xl flex flex-col overflow-hidden ${surfaceBg}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <div>
            <h2
              className="text-base font-semibold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Models Library
            </h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {models.length} model{models.length === 1 ? '' : 's'} · {sortedFolders.length} folder
              {sortedFolders.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {hasUnsavedEdits && (
              <button
                type="button"
                onClick={onSaveCurrentModel}
                title="Save edits to active model"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save Edits
              </button>
            )}
            <button
              type="button"
              onClick={onDuplicateActiveModel}
              disabled={models.length === 0}
              title="Save a copy of the active model"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer disabled:opacity-40 ${
                isDark
                  ? 'border-white/15 text-slate-200 hover:bg-white/10'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              Save Copy
            </button>
            <button
              type="button"
              onClick={handleBrowseFileExplorer}
              disabled={importing3D}
              title="Browse local folders for .usda, .usd, .usdc, .usdz, .glb, .gltf, or .json (preserves USD references)"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer disabled:opacity-50 ${
                showExplorer
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : isDark
                    ? 'border-white/15 text-slate-200 hover:bg-white/10'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {importing3D ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {importing3D ? 'Importing...' : 'Import 3D'}
            </button>
            <button
              type="button"
              onClick={() => setShowLocalPathImport((v) => !v)}
              title="Enter a local .usda / .usd / .glb file path manually"
              className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border cursor-pointer ${
                showLocalPathImport
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : isDark
                    ? 'border-white/15 text-slate-200 hover:bg-white/10'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.glb,.gltf,.usd,.usda,.usdc,.usdz,application/json,model/gltf-binary"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close models library"
              className={`p-2 rounded-lg cursor-pointer ${
                isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/10'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showLocalPathImport && (
          <form
            onSubmit={handleLocalPathImport}
            className={`px-6 py-2.5 border-b flex items-center gap-2 ${subtleBg}`}
          >
            <button
              type="button"
              onClick={handleBrowseFileExplorer}
              disabled={importing3D}
              title="Open built-in File Explorer"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer disabled:opacity-40 shrink-0 ${
                isDark
                  ? 'bg-white/10 border-white/15 text-slate-100 hover:bg-white/15'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              Browse...
            </button>
            <input
              type="text"
              autoFocus
              value={localPathInput}
              onChange={(e) => setLocalPathInput(e.target.value)}
              placeholder="Or paste .usda / .usd / .glb path..."
              className={`flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono rounded-lg border focus:outline-none focus:ring-2 ${inputCls}`}
            />
            <button
              type="submit"
              disabled={!localPathInput.trim() || importing3D}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 cursor-pointer shrink-0"
            >
              {importing3D ? 'Loading...' : 'Open'}
            </button>
          </form>
        )}

        {showExplorer && (
          <div className={`px-6 py-3 border-b space-y-2 ${subtleBg}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {explorerShortcuts.map((sc) => (
                  <button
                    key={sc.path}
                    type="button"
                    onClick={() => loadExplorerDir(sc.path)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-md border cursor-pointer ${
                      explorerCwd.toLowerCase() === sc.path.toLowerCase()
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : isDark
                          ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowExplorer(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Close File Explorer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!explorerParent || explorerLoading}
                onClick={() => explorerParent && loadExplorerDir(explorerParent)}
                title="Parent folder"
                className={`px-2 py-1 text-[11px] font-medium rounded-md border cursor-pointer disabled:opacity-35 ${
                  isDark
                    ? 'border-white/15 text-slate-200 hover:bg-white/10'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                ↑ Up
              </button>
              <div
                className={`flex-1 min-w-0 px-2 py-1 text-[11px] font-mono truncate rounded-md border ${
                  isDark
                    ? 'bg-[#10141c] border-white/10 text-slate-300'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
                title={explorerCwd}
              >
                {explorerCwd || '...'}
              </div>
              <input
                type="text"
                value={explorerFilter}
                onChange={(e) => setExplorerFilter(e.target.value)}
                placeholder="Filter..."
                className={`w-24 px-2 py-1 text-[11px] rounded-md border focus:outline-none ${inputCls}`}
              />
            </div>

            <div
              className={`max-h-52 overflow-y-auto rounded-lg border divide-y ${
                isDark
                  ? 'bg-[#10141c] border-white/10 divide-white/5'
                  : 'bg-white border-slate-200 divide-slate-100'
              }`}
            >
              {explorerLoading ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs opacity-60">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading folder...
                </div>
              ) : (
                explorerEntries
                  .filter((e) =>
                    !explorerFilter.trim()
                      ? true
                      : e.name.toLowerCase().includes(explorerFilter.trim().toLowerCase())
                  )
                  .map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      disabled={importing3D}
                      onClick={() => {
                        if (entry.isDir) {
                          loadExplorerDir(entry.path);
                        } else {
                          setShowExplorer(false);
                          importFromLocalPath(entry.path);
                        }
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs cursor-pointer transition-colors disabled:opacity-40 ${
                        isDark ? 'hover:bg-white/10' : 'hover:bg-indigo-50/70'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Folder
                          className={`w-3.5 h-3.5 shrink-0 ${
                            entry.isDir ? 'text-amber-500' : 'text-indigo-500'
                          }`}
                        />
                        <span className={`truncate ${entry.isDir ? 'font-medium' : 'font-mono text-[11px]'}`}>
                          {entry.name}
                        </span>
                      </span>
                      {!entry.isDir && (
                        <span className="text-[10px] font-mono opacity-60 shrink-0">
                          {entry.sizeBytes > 1024 * 1024
                            ? `${(entry.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.max(1, Math.round(entry.sizeBytes / 1024))} KB`}
                        </span>
                      )}
                    </button>
                  ))
              )}
              {!explorerLoading && explorerEntries.length === 0 && (
                <div className="py-6 text-center text-xs opacity-50">
                  No subfolders or 3D files (.usda, .usd, .usdc, .glb, .json) here.
                </div>
              )}
            </div>
          </div>
        )}

        {importError && (
          <div className="px-6 py-2 text-xs bg-rose-500/10 text-rose-500 border-b border-rose-500/20 flex items-center justify-between">
            <span>{importError}</span>
            <button type="button" onClick={() => setImportError(null)} className="p-0.5 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Search + Sort Bar */}
        <div className={`px-6 py-3 border-b space-y-2.5 ${subtleBg}`}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                }`}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models, categories, folders..."
                className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-2 ${inputCls}`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <select
              aria-label="Sort models"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className={`px-2.5 py-1.5 text-xs rounded-lg border cursor-pointer focus:outline-none focus:ring-2 ${inputCls}`}
            >
              <option value="custom">Sort: Custom</option>
              <option value="name">Sort: Name A–Z</option>
              <option value="parts">Sort: Most Parts</option>
            </select>
          </div>

          {/* Folder Filter Pills + Create Folder */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedFolderFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full cursor-pointer transition-colors ${
                selectedFolderFilter === 'all'
                  ? isDark
                    ? 'bg-white text-slate-950'
                    : 'bg-slate-900 text-white'
                  : isDark
                    ? 'bg-white/10 text-slate-300 hover:bg-white/15'
                    : 'bg-slate-200/75 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All ({models.length})
            </button>
            {folderCounts.pinnedCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedFolderFilter('pinned')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full cursor-pointer transition-colors ${
                  selectedFolderFilter === 'pinned'
                    ? 'bg-amber-500 text-white'
                    : isDark
                      ? 'bg-white/10 text-amber-300 hover:bg-white/15'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200/80'
                }`}
              >
                <Pin className="w-2.5 h-2.5" />
                Pinned ({folderCounts.pinnedCount})
              </button>
            )}
            {sortedFolders.map((folder) => {
              const count = folderCounts.counts.get(folder.id) || 0;
              const isSelected = selectedFolderFilter === folder.id;
              const isRenaming = renamingFolderId === folder.id;
              const isConfirmingDelete = confirmDeleteFolderId === folder.id;

              if (isRenaming) {
                return (
                  <form
                    key={folder.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (renamingFolderValue.trim()) {
                        onRenameFolder(folder.id, renamingFolderValue.trim());
                      }
                      setRenamingFolderId(null);
                    }}
                    className="inline-flex items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={renamingFolderValue}
                      onChange={(e) => setRenamingFolderValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRenamingFolderId(null);
                      }}
                      className={`px-2 py-0.5 text-[11px] rounded-md border w-32 focus:outline-none ${inputCls}`}
                    />
                    <button type="submit" className="p-1 text-emerald-500 hover:text-emerald-400 cursor-pointer">
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingFolderId(null)}
                      className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </form>
                );
              }

              if (isConfirmingDelete) {
                return (
                  <div
                    key={folder.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-500"
                  >
                    <span>Remove &ldquo;{folder.name}&rdquo;?</span>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteFolder(folder.id);
                        if (selectedFolderFilter === folder.id) setSelectedFolderFilter('all');
                        setConfirmDeleteFolderId(null);
                      }}
                      className="font-semibold underline cursor-pointer"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteFolderId(null)}
                      className="opacity-75 hover:opacity-100 cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={folder.id}
                  className={`group inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                    isSelected
                      ? isDark
                        ? 'bg-white text-slate-950'
                        : 'bg-slate-900 text-white'
                      : isDark
                        ? 'bg-white/10 text-slate-300 hover:bg-white/15'
                        : 'bg-slate-200/75 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFolderFilter(folder.id)}
                    className="inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Folder className="w-2.5 h-2.5 opacity-70" />
                    <span>{folder.name}</span>
                    <span className="opacity-65">({count})</span>
                  </button>
                  <button
                    type="button"
                    title="Rename folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingFolderId(folder.id);
                      setRenamingFolderValue(folder.name);
                      setConfirmDeleteFolderId(null);
                    }}
                    className="p-0.5 opacity-0 group-hover:opacity-80 hover:!opacity-100 cursor-pointer"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete folder (keeps models)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteFolderId(folder.id);
                      setRenamingFolderId(null);
                    }}
                    className="p-0.5 opacity-0 group-hover:opacity-80 hover:!opacity-100 text-rose-500 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}

            {folderCounts.uncatCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedFolderFilter('uncategorized')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full cursor-pointer transition-colors ${
                  selectedFolderFilter === 'uncategorized'
                    ? isDark
                      ? 'bg-white text-slate-950'
                      : 'bg-slate-900 text-white'
                    : isDark
                      ? 'bg-white/10 text-slate-400 hover:bg-white/15'
                      : 'bg-slate-200/60 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Uncategorized ({folderCounts.uncatCount})
              </button>
            )}

            {creatingFolder ? (
              <form onSubmit={handleCreateFolderSubmit} className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setCreatingFolder(false);
                      setNewFolderName('');
                    }
                  }}
                  placeholder="Folder name..."
                  className={`px-2 py-0.5 text-[11px] rounded-md border w-32 focus:outline-none ${inputCls}`}
                />
                <button type="submit" className="p-1 text-emerald-500 hover:text-emerald-400 cursor-pointer">
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreatingFolder(true)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-full border border-dashed cursor-pointer ${
                  isDark
                    ? 'border-white/20 text-slate-400 hover:text-white hover:border-white/40'
                    : 'border-slate-300 text-slate-500 hover:text-slate-900 hover:border-slate-400'
                }`}
              >
                <FolderPlus className="w-3 h-3" />
                New Folder
              </button>
            )}
          </div>
        </div>

        {/* Model List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {filteredModels.length === 0 ? (
            <div className={`py-12 text-center text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              No models match this filter.
            </div>
          ) : (
            groupedSections.map((section) => (
              <div key={section.id} className="space-y-2">
                {section.title && (
                  <div
                    className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    <span>{section.title}</span>
                    <span className="font-mono font-normal opacity-75">{section.items.length}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  {section.items.map((model, idx) => {
                    const isActive = model.id === activeModelId;
                    const isRenaming = renamingModelId === model.id;
                    const isConfirmingDelete = confirmDeleteModelId === model.id;

                    return (
                      <div
                        key={model.id}
                        className={`rounded-xl border p-3 transition-colors ${
                          isActive
                            ? isDark
                              ? 'bg-white/10 border-white/30'
                              : 'bg-slate-900/[0.04] border-slate-900/35'
                            : isDark
                              ? 'bg-[#1a202c]/50 border-white/10 hover:border-white/20'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {isRenaming ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (renamingModelValue.trim()) {
                                    onRenameModel(model.id, renamingModelValue.trim());
                                  }
                                  setRenamingModelId(null);
                                }}
                                className="flex items-center gap-1.5"
                              >
                                <input
                                  autoFocus
                                  value={renamingModelValue}
                                  onChange={(e) => setRenamingModelValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setRenamingModelId(null);
                                  }}
                                  className={`flex-1 px-2 py-1 text-xs rounded-md border focus:outline-none ${inputCls}`}
                                />
                                <button
                                  type="submit"
                                  className="p-1 text-emerald-500 hover:text-emerald-400 cursor-pointer"
                                  title="Save name"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenamingModelId(null)}
                                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onSelectModel(model.id)}
                                className="text-left w-full group cursor-pointer"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold truncate group-hover:underline">
                                    {model.label}
                                  </span>
                                  {isActive && (
                                    <span
                                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                        isDark
                                          ? 'bg-white text-slate-950'
                                          : 'bg-slate-900 text-white'
                                      }`}
                                    >
                                      Active
                                    </span>
                                  )}
                                  {!model.isBuiltIn && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-sky-500/15 text-sky-600 dark:text-sky-400">
                                      Saved
                                    </span>
                                  )}
                                  {model.isEdited && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                      Edited
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={`mt-0.5 text-[11px] flex flex-wrap items-center gap-x-1.5 ${
                                    isDark ? 'text-slate-400' : 'text-slate-500'
                                  }`}
                                >
                                  <span className="truncate max-w-[200px]">{model.category}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">{model.partCount} parts</span>
                                  {model.envelopeMm && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono tabular-nums">
                                        {Math.round(model.envelopeMm.width)}×
                                        {Math.round(model.envelopeMm.height)}×
                                        {Math.round(model.envelopeMm.depth)} mm
                                      </span>
                                    </>
                                  )}
                                </div>
                              </button>
                            )}
                          </div>

                          {/* Quick Action Icons */}
                          {!isRenaming && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => onTogglePinModel(model.id)}
                                title={model.pinned ? 'Unpin model' : 'Pin model to top'}
                                className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                                  model.pinned
                                    ? 'text-amber-500 hover:bg-amber-500/10'
                                    : isDark
                                      ? 'text-slate-500 hover:text-slate-200 hover:bg-white/10'
                                      : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                                }`}
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingModelId(model.id);
                                  setRenamingModelValue(model.label);
                                  setConfirmDeleteModelId(null);
                                }}
                                title="Rename model"
                                className={`p-1.5 rounded-md cursor-pointer ${
                                  isDark
                                    ? 'text-slate-500 hover:text-slate-200 hover:bg-white/10'
                                    : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                                }`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {sortMode === 'custom' && (
                                <>
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => onReorderModel(model.id, 'up')}
                                    title="Move up"
                                    className={`p-1.5 rounded-md cursor-pointer disabled:opacity-25 ${
                                      isDark
                                        ? 'text-slate-500 hover:text-slate-200 hover:bg-white/10'
                                        : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                                    }`}
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === section.items.length - 1}
                                    onClick={() => onReorderModel(model.id, 'down')}
                                    title="Move down"
                                    className={`p-1.5 rounded-md cursor-pointer disabled:opacity-25 ${
                                      isDark
                                        ? 'text-slate-500 hover:text-slate-200 hover:bg-white/10'
                                        : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                                    }`}
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDeleteModelId(isConfirmingDelete ? null : model.id)
                                }
                                title="Delete model"
                                className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Folder assignment & Delete confirmation row */}
                        <div className="mt-2 pt-2 border-t border-dashed flex items-center justify-between gap-2 text-[11px] border-slate-200/70 dark:border-white/10">
                          <label className="inline-flex items-center gap-1.5 min-w-0">
                            <Folder className="w-3 h-3 opacity-55 shrink-0" />
                            <select
                              aria-label={`Folder for ${model.label}`}
                              value={model.folderId ?? ''}
                              onChange={(e) =>
                                onMoveModelToFolder(model.id, e.target.value || null)
                              }
                              className={`px-2 py-0.5 text-[11px] rounded-md border cursor-pointer focus:outline-none ${inputCls}`}
                            >
                              <option value="">Uncategorized</option>
                              {sortedFolders.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          {isConfirmingDelete && (
                            <div className="inline-flex items-center gap-1.5 shrink-0">
                              <span className="text-rose-500 font-medium">
                                {model.isBuiltIn ? 'Hide model?' : 'Delete permanently?'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteModel(model.id);
                                  setConfirmDeleteModelId(null);
                                }}
                                className="px-2 py-0.5 rounded bg-rose-600 text-white font-semibold hover:bg-rose-500 cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteModelId(null)}
                                className={`px-2 py-0.5 rounded border cursor-pointer ${
                                  isDark
                                    ? 'border-white/15 text-slate-300 hover:bg-white/10'
                                    : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Trash / Deleted Built-Ins Footer */}
        {deletedBuiltIns.length > 0 && (
          <div className={`border-t px-6 py-3 ${subtleBg}`}>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowTrash((v) => !v)}
                className={`text-xs font-medium cursor-pointer flex items-center gap-1.5 ${
                  isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Deleted Built-in Models ({deletedBuiltIns.length})
              </button>
              <button
                type="button"
                onClick={onRestoreAllBuiltIns}
                className="text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Restore All
              </button>
            </div>
            {showTrash && (
              <div className="mt-2.5 max-h-36 overflow-y-auto space-y-1.5">
                {deletedBuiltIns.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                      isDark ? 'bg-[#141820] border-white/10' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.label}</div>
                      <div className="text-[10px] opacity-60 truncate">{item.category}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestoreBuiltIn(item.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-sky-600 text-white hover:bg-sky-500 cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
