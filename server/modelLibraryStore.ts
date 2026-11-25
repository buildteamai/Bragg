import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MeshBlueprint, StudioTheme } from '../src/types/blueprint';

export interface LibraryFolder {
  id: string;
  name: string;
  order: number;
}

export interface LibraryModelMeta {
  label?: string;
  folderId?: string | null;
  pinned?: boolean;
  order?: number;
  updatedAt?: string;
}

export interface SavedLibraryModel {
  id: string;
  label: string;
  defaultTheme: StudioTheme;
  blueprint: MeshBlueprint;
  savedAt: string;
}

export interface ModelLibraryState {
  version: 1;
  folders: LibraryFolder[];
  modelMeta: Record<string, LibraryModelMeta>;
  deletedBuiltInIds: string[];
  savedModels: SavedLibraryModel[];
}

export const DEFAULT_FOLDERS: LibraryFolder[] = [
  { id: 'workcells-machines', name: 'Workcells & Machines', order: 0 },
  { id: 'piping-structures', name: 'Piping & Structures', order: 1 },
  { id: 'tools-hardware', name: 'Tools & Hardware', order: 2 },
  { id: 'reference-misc', name: 'Reference & Misc', order: 3 },
];

export const DEFAULT_BUILTIN_FOLDER_MAP: Record<string, string> = {
  'amada-h1000-ii-reference': 'workcells-machines',
  'dmu-125-monoblock-reference': 'workcells-machines',
  'flow-mach500-4020-waterjet-v1': 'workcells-machines',
  'haimer-microset-uno-2070-v1': 'workcells-machines',
  'welding-table-system28-v1': 'workcells-machines',
  'unitree-go2-quadruped-v1': 'workcells-machines',
  'precision-spur-gearbox-20x-v1': 'workcells-machines',
  'galvanized-work-platform-v1': 'piping-structures',
  'industrial-piping-system-v1': 'piping-structures',
  'copper-prv-manifold-v1': 'piping-structures',
  'steel-column-connection-v1': 'piping-structures',
  'craftsman-v20-drill-v1': 'tools-hardware',
  'ryobi-reciprocating-saw-v1': 'tools-hardware',
  'uline-claw-hammer-v1': 'tools-hardware',
  'banwood-cruiser-skateboard-v1': 'reference-misc',
  'origami-diagrid-vase-v1': 'reference-misc',
  'fireplace-mantel-reference': 'reference-misc',
};

function getRuntimeRoot(): string {
  // SOT rule: app runtime data lives in %LOCALAPPDATA%\sot\<app>, never in the SOT tree
  return process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'sot', '18d')
    : path.join(os.tmpdir(), 'sot', '18d');
}

export function getLibraryAssetsDir(): string {
  const dir = path.join(getRuntimeRoot(), 'assets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLibraryFilePath(): string {
  return path.join(getRuntimeRoot(), 'library.json');
}

export function createDefaultLibraryState(): ModelLibraryState {
  const modelMeta: Record<string, LibraryModelMeta> = {};
  Object.entries(DEFAULT_BUILTIN_FOLDER_MAP).forEach(([id, folderId], idx) => {
    modelMeta[id] = { folderId, order: idx };
  });
  return {
    version: 1,
    folders: DEFAULT_FOLDERS.map((f) => ({ ...f })),
    modelMeta,
    deletedBuiltInIds: [],
    savedModels: [],
  };
}

function sanitizeLibraryState(raw: unknown): ModelLibraryState {
  if (!raw || typeof raw !== 'object') {
    return createDefaultLibraryState();
  }
  const obj = raw as Partial<ModelLibraryState>;
  const folders: LibraryFolder[] = Array.isArray(obj.folders)
    ? obj.folders
        .filter((f): f is LibraryFolder => Boolean(f && typeof f.id === 'string' && typeof f.name === 'string'))
        .map((f, idx) => ({
          id: f.id.trim(),
          name: f.name.trim() || 'Untitled Folder',
          order: typeof f.order === 'number' && Number.isFinite(f.order) ? f.order : idx,
        }))
    : DEFAULT_FOLDERS.map((f) => ({ ...f }));

  const modelMeta: Record<string, LibraryModelMeta> = {};
  if (obj.modelMeta && typeof obj.modelMeta === 'object' && !Array.isArray(obj.modelMeta)) {
    for (const [id, meta] of Object.entries(obj.modelMeta)) {
      if (!id || !meta || typeof meta !== 'object') continue;
      modelMeta[id] = {
        label: typeof meta.label === 'string' && meta.label.trim() ? meta.label.trim() : undefined,
        folderId:
          meta.folderId === null
            ? null
            : typeof meta.folderId === 'string' && meta.folderId.trim()
              ? meta.folderId.trim()
              : undefined,
        pinned: Boolean(meta.pinned),
        order: typeof meta.order === 'number' && Number.isFinite(meta.order) ? meta.order : undefined,
        updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : undefined,
      };
    }
  }

  const deletedBuiltInIds = Array.isArray(obj.deletedBuiltInIds)
    ? Array.from(new Set(obj.deletedBuiltInIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)))
    : [];

  const savedModels: SavedLibraryModel[] = Array.isArray(obj.savedModels)
    ? obj.savedModels.filter(
        (m): m is SavedLibraryModel =>
          Boolean(
            m &&
              typeof m.id === 'string' &&
              typeof m.label === 'string' &&
              m.blueprint &&
              typeof m.blueprint === 'object' &&
              Array.isArray((m.blueprint as MeshBlueprint).parts)
          )
      )
    : [];

  return {
    version: 1,
    folders,
    modelMeta,
    deletedBuiltInIds,
    savedModels,
  };
}

export function readLibraryState(): ModelLibraryState {
  const filePath = getLibraryFilePath();
  if (!fs.existsSync(filePath)) {
    return createDefaultLibraryState();
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return sanitizeLibraryState(JSON.parse(raw));
  } catch (err) {
    console.warn('[modelLibraryStore] Failed to parse library.json, falling back to defaults:', err);
    return createDefaultLibraryState();
  }
}

export function writeLibraryState(next: unknown): ModelLibraryState {
  const clean = sanitizeLibraryState(next);
  const filePath = getLibraryFilePath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(clean, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
  return clean;
}
