import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ESTWING_SURE_STRIKE_HAMMER_BLUEPRINT } from './data/estwingSureStrikeHammerBlueprint';
import { BANWOOD_CRUISER_SKATEBOARD_BLUEPRINT } from './data/banwoodCruiserSkateboardBlueprint';
import { ORIGAMI_DIAGRID_VASE_BLUEPRINT } from './data/origamiDiagridVaseBlueprint';
import { ULINE_CLAW_HAMMER_BLUEPRINT } from './data/ulineClawHammerBlueprint';
import { HAIMER_UNO_2070_BLUEPRINT } from './data/haimerUnoBlueprint';
import { UNITREE_GO2_QUADRUPED_BLUEPRINT } from './data/unitreeGo2Blueprint';
import { WELDING_TABLE_SYSTEM28_BLUEPRINT } from './data/weldingTableBlueprint';
import {
  createWorkPlatformBlueprint,
  DEFAULT_WORK_PLATFORM_CONFIG,
  GALVANIZED_WORK_PLATFORM_BLUEPRINT,
  WorkPlatformConfig,
} from './data/galvanizedWorkPlatformBlueprint';
import { RYOBI_RECIPROCATING_SAW_BLUEPRINT } from './data/ryobiReciprocatingSawBlueprint';
import { CRAFTSMAN_V20_DRILL_BLUEPRINT } from './data/craftsmanV20DrillBlueprint';
import { INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT } from './data/industrialPipingSystemBlueprint';
import { PRECISION_GEARBOX_BLUEPRINT } from './data/precisionGearboxBlueprint';
import { COPPER_PRV_MANIFOLD_BLUEPRINT } from './data/copperPrvManifoldBlueprint';
import { STEEL_COLUMN_CONNECTION_BLUEPRINT } from './data/steelColumnConnectionBlueprint';
import { FIREPLACE_MANTEL_REFERENCE_BLUEPRINT } from './data/fireplaceMantelBlueprint';
import { AMADA_H1000_REFERENCE_BLUEPRINT } from './data/amadaH1000Blueprint';
import { DMU_125_REFERENCE_BLUEPRINT } from './data/dmu125Blueprint';
import { FLOW_MACH500_WATERJET_BLUEPRINT } from './data/flowMach500WaterjetBlueprint';
import {
  BlueprintPart,
  CaliperMeasurement,
  CameraPresetId,
  ConstellationQaGateReport,
  EdgeDiffResult,
  FiveAngleCapture,
  GeometryAuditReport,
  KinematicPosePreset,
  LightingPresetId,
  MeshBlueprint,
  MetrologyStats,
  RenderMode,
  SectionPlaneConfig,
  StudioTheme,
  TessellationDensity,
  TransformGizmoMode,
} from './types/blueprint';
import { parseConstellationCameraJson } from './engine/constellationCamera';
import {
  exportBlueprintAsGLB,
  exportBlueprintAsJSON,
  exportBlueprintAsOBJ,
  exportBlueprintAsSOTUSD,
  exportBlueprintAsSTL,
  exportBlueprintAsUSDZ,
} from './engine/meshKernel';
import { computePhotoVsMeshEdgeDiff } from './engine/edgeDiffAnalyzer';
import { ActiveWorkspaceView, TopBar } from './components/TopBar';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { BottomControlDock } from './components/BottomControlDock';
import { AssemblyDrawer } from './components/AssemblyDrawer';
import { GeometryAuditDrawer, JointRigValue } from './components/GeometryAuditDrawer';
import { TerminalDrawer } from './components/TerminalDrawer';
import { ExportModal } from './components/ExportModal';
import { FiveAngleCheckModal } from './components/FiveAngleCheckModal';
import { ConfiguratorDrawer } from './components/ConfiguratorDrawer';
import { PartInspectorPanel } from './components/PartInspectorPanel';
import { AgyDrawer } from './components/AgyDrawer';
import {
  DeletedBuiltInItem,
  LibraryFolderItem,
  LibraryModelItem,
  ModelLibraryDrawer,
} from './components/ModelLibraryDrawer';
import { InstallationSchedulePanel } from './components/InstallationSchedulePanel';
import { OperatorHmiPanel } from './components/OperatorHmiPanel';
import type { InstallationVisibilityOptions } from './engine/installationOverlay';
import {
  applySimCommand,
  buildSotSimManifest,
  createInitialSimState,
  SimCommandKind,
  SimRuntimeState,
  stepSimState,
} from './engine/machineSimEngine';
import { fetchApiWithRetry, parseApiJson } from './utils/api';

interface LibraryModelMeta {
  label?: string;
  folderId?: string | null;
  pinned?: boolean;
  order?: number;
  updatedAt?: string;
}

interface SavedLibraryModel {
  id: string;
  label: string;
  defaultTheme: StudioTheme;
  blueprint: MeshBlueprint;
  savedAt: string;
}

interface ModelLibraryState {
  version: 1;
  folders: LibraryFolderItem[];
  modelMeta: Record<string, LibraryModelMeta>;
  deletedBuiltInIds: string[];
  savedModels: SavedLibraryModel[];
}

const LIBRARY_STORAGE_KEY = '18d-model-library-v1';

const DEFAULT_FOLDERS: LibraryFolderItem[] = [
  { id: 'workcells-machines', name: 'Workcells & Machines', order: 0 },
  { id: 'piping-structures', name: 'Piping & Structures', order: 1 },
  { id: 'tools-hardware', name: 'Tools & Hardware', order: 2 },
  { id: 'reference-misc', name: 'Reference & Misc', order: 3 },
];

const DEFAULT_BUILTIN_FOLDER_MAP: Record<string, string> = {
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
  'estwing-sure-strike-hammer-v1': 'tools-hardware',
  'uline-claw-hammer-v1': 'tools-hardware',
  'banwood-cruiser-skateboard-v1': 'reference-misc',
  'origami-diagrid-vase-v1': 'reference-misc',
  'fireplace-mantel-reference': 'reference-misc',
};

function createInitialLibraryState(): ModelLibraryState {
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.folders)) {
        return {
          version: 1,
          folders: parsed.folders,
          modelMeta: parsed.modelMeta || {},
          deletedBuiltInIds: Array.isArray(parsed.deletedBuiltInIds) ? parsed.deletedBuiltInIds : [],
          savedModels: Array.isArray(parsed.savedModels) ? parsed.savedModels : [],
        };
      }
    }
  } catch {
    // ignore storage errors
  }
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

interface SessionModelEntry {
  id: string;
  label: string;
  blueprint: MeshBlueprint;
  defaultTheme: StudioTheme;
}

const SESSION_MODELS: SessionModelEntry[] = [
  {
    id: ESTWING_SURE_STRIKE_HAMMER_BLUEPRINT.id,
    label: 'Estwing Sure Strike 16 oz Hickory Claw Hammer',
    blueprint: ESTWING_SURE_STRIKE_HAMMER_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: BANWOOD_CRUISER_SKATEBOARD_BLUEPRINT.id,
    label: 'Banwood Classic Cruiser Skateboard',
    blueprint: BANWOOD_CRUISER_SKATEBOARD_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: ORIGAMI_DIAGRID_VASE_BLUEPRINT.id,
    label: 'Origami Diagrid 3D-Printed Vase',
    blueprint: ORIGAMI_DIAGRID_VASE_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: ULINE_CLAW_HAMMER_BLUEPRINT.id,
    label: 'ULINE 16 oz Curved Claw Hammer',
    blueprint: ULINE_CLAW_HAMMER_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: HAIMER_UNO_2070_BLUEPRINT.id,
    label: 'HAIMER Microset UNO 20|70',
    blueprint: HAIMER_UNO_2070_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: UNITREE_GO2_QUADRUPED_BLUEPRINT.id,
    label: 'Unitree Go2 Quadruped Robot',
    blueprint: UNITREE_GO2_QUADRUPED_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: WELDING_TABLE_SYSTEM28_BLUEPRINT.id,
    label: 'System 28 Modular Welding Table',
    blueprint: WELDING_TABLE_SYSTEM28_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: GALVANIZED_WORK_PLATFORM_BLUEPRINT.id,
    label: 'Modular Industrial Work Platform',
    blueprint: GALVANIZED_WORK_PLATFORM_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: RYOBI_RECIPROCATING_SAW_BLUEPRINT.id,
    label: 'RYOBI ONE+ 18V Reciprocating Saw',
    blueprint: RYOBI_RECIPROCATING_SAW_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: CRAFTSMAN_V20_DRILL_BLUEPRINT.id,
    label: 'Craftsman V20 Cordless Drill',
    blueprint: CRAFTSMAN_V20_DRILL_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT.id,
    label: 'Flanged Steel Piping Manifold',
    blueprint: INDUSTRIAL_PIPING_SYSTEM_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: PRECISION_GEARBOX_BLUEPRINT.id,
    label: '2:1 CNC Spur Gearbox & Skid',
    blueprint: PRECISION_GEARBOX_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: COPPER_PRV_MANIFOLD_BLUEPRINT.id,
    label: 'Copper PRV Station',
    blueprint: COPPER_PRV_MANIFOLD_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: STEEL_COLUMN_CONNECTION_BLUEPRINT.id,
    label: 'Steel Column Connection',
    blueprint: STEEL_COLUMN_CONNECTION_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: FIREPLACE_MANTEL_REFERENCE_BLUEPRINT.id,
    label: 'Fireplace Mantel',
    blueprint: FIREPLACE_MANTEL_REFERENCE_BLUEPRINT,
    defaultTheme: 'dark',
  },
  {
    id: AMADA_H1000_REFERENCE_BLUEPRINT.id,
    label: 'AMADA H-1000 II',
    blueprint: AMADA_H1000_REFERENCE_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: DMU_125_REFERENCE_BLUEPRINT.id,
    label: 'DMU 125',
    blueprint: DMU_125_REFERENCE_BLUEPRINT,
    defaultTheme: 'light',
  },
  {
    id: FLOW_MACH500_WATERJET_BLUEPRINT.id,
    label: 'Flow Mach 500 4020 Waterjet',
    blueprint: FLOW_MACH500_WATERJET_BLUEPRINT,
    defaultTheme: 'light',
  },
];

export default function App() {
  const viewportRef = useRef<Viewport3DHandle | null>(null);

  const [activeModelId, setActiveModelId] = useState<string>(SESSION_MODELS[0].id);
  const [buildRevision, setBuildRevision] = useState(1);
  const [metrology, setMetrology] = useState<MetrologyStats | null>(null);

  const [activeView, setActiveView] = useState<ActiveWorkspaceView>('viewport');

  const [studioTheme, setStudioTheme] = useState<StudioTheme>(SESSION_MODELS[0].defaultTheme);
  const [lightingPreset, setLightingPreset] = useState<LightingPresetId>('cyclorama');
  const [aoEnabled, setAoEnabled] = useState(true);
  const [gizmoMode, setGizmoMode] = useState<TransformGizmoMode>('off');
  const [showCoGOverlay, setShowCoGOverlay] = useState(false);
  const [showSweptEnvelopes, setShowSweptEnvelopes] = useState(false);
  const [showInstallationOverlay, setShowInstallationOverlay] = useState(false);
  const [installationOptions, setInstallationOptions] = useState<InstallationVisibilityOptions>({
    showZones: true,
    showDoorSwings: true,
    showUtilities: true,
  });
  const [showSimHmi, setShowSimHmi] = useState(false);
  const [simState, setSimState] = useState<SimRuntimeState | null>(null);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simBlinkOn, setSimBlinkOn] = useState(true);
  const [kinematicPlaying, setKinematicPlaying] = useState(false);

  const [renderMode, setRenderMode] = useState<RenderMode>('shaded');
  const [tessellation, setTessellation] = useState<TessellationDensity>('high');
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [sectionPlane, setSectionPlane] = useState<SectionPlaneConfig>({
    axis: 'off',
    position: 0,
    invert: false,
  });
  const [caliperActive, setCaliperActive] = useState(false);
  const [caliperMeasurement, setCaliperMeasurement] = useState<CaliperMeasurement>({
    pointA: null,
    pointB: null,
    distanceMm: null,
    deltaMm: null,
  });

  const [compareSplit, setCompareSplit] = useState(48);
  const [referenceOverlayOpacity, setReferenceOverlayOpacity] = useState(0);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [hiddenPartIds, setHiddenPartIds] = useState<Set<string>>(() => new Set());
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const [highlightedPartIds, setHighlightedPartIds] = useState<string[]>([]);

  const [auditReport, setAuditReport] = useState<GeometryAuditReport | null>(null);
  const [edgeDiff, setEdgeDiff] = useState<EdgeDiffResult | null>(null);
  const [edgeDiffBusy, setEdgeDiffBusy] = useState(false);
  const [edgeDiffError, setEdgeDiffError] = useState<string | null>(null);
  const [edgeDiffOverlayVisible, setEdgeDiffOverlayVisible] = useState(false);
  const [edgeDiffOverlayOpacity, setEdgeDiffOverlayOpacity] = useState(0.72);
  const [jointRigValues, setJointRigValues] = useState<Record<string, JointRigValue>>({});

  const [fiveAngleCaptures, setFiveAngleCaptures] = useState<FiveAngleCapture[]>([]);
  const [platformConfig, setPlatformConfig] = useState<WorkPlatformConfig>(
    DEFAULT_WORK_PLATFORM_CONFIG
  );

  const [libraryState, setLibraryState] = useState<ModelLibraryState>(() => createInitialLibraryState());
  const libraryLoadedRef = useRef(false);

  // Sync model library with server-side persistent store (%LOCALAPPDATA%\sot\18d\library.json)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/library', { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data !== 'object' || !Array.isArray(data.folders)) return;
        libraryLoadedRef.current = true;
        setLibraryState({
          version: 1,
          folders: data.folders,
          modelMeta: data.modelMeta || {},
          deletedBuiltInIds: Array.isArray(data.deletedBuiltInIds) ? data.deletedBuiltInIds : [],
          savedModels: Array.isArray(data.savedModels) ? data.savedModels : [],
        });
      })
      .catch(() => {
        libraryLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistLibraryState = useCallback((updater: (prev: ModelLibraryState) => ModelLibraryState) => {
    setLibraryState((prev) => {
      const next = updater(prev);
      try {
        window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      fetch('/api/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {
        // localStorage fallback already updated
      });
      return next;
    });
  }, []);

  // Per-model direct edit override + Undo/Redo history stack
  const [editedBlueprints, setEditedBlueprints] = useState<Record<string, MeshBlueprint>>({});
  const [undoStacks, setUndoStacks] = useState<Record<string, MeshBlueprint[]>>({});
  const [redoStacks, setRedoStacks] = useState<Record<string, MeshBlueprint[]>>({});
  const [autoSeatBusy, setAutoSeatBusy] = useState(false);
  const [autoSeatNote, setAutoSeatNote] = useState<string | null>(null);
  const [constellationQa, setConstellationQa] = useState<ConstellationQaGateReport | null>(null);
  const [constellationBusy, setConstellationBusy] = useState(false);
  const [constellationError, setConstellationError] = useState<string | null>(null);

  const builtInIdSet = useMemo(() => new Set(SESSION_MODELS.map((m) => m.id)), []);

  const allSessionModels = useMemo(() => {
    const deletedSet = new Set(libraryState.deletedBuiltInIds);
    const seen = new Set<string>();
    const merged: (SessionModelEntry & { isBuiltIn: boolean })[] = [];

    for (const saved of libraryState.savedModels) {
      if (seen.has(saved.id)) continue;
      seen.add(saved.id);
      const meta = libraryState.modelMeta[saved.id];
      merged.push({
        id: saved.id,
        label: meta?.label || saved.label,
        blueprint: saved.blueprint,
        defaultTheme: saved.defaultTheme,
        isBuiltIn: false,
      });
    }

    for (const m of SESSION_MODELS) {
      if (deletedSet.has(m.id) || seen.has(m.id)) continue;
      seen.add(m.id);
      const meta = libraryState.modelMeta[m.id];
      merged.push({
        ...m,
        label: meta?.label || m.label,
        isBuiltIn: true,
      });
    }

    return merged;
  }, [libraryState.deletedBuiltInIds, libraryState.savedModels, libraryState.modelMeta]);

  const activeEntry = useMemo(
    () => allSessionModels.find((m) => m.id === activeModelId) ?? allSessionModels[0] ?? null,
    [activeModelId, allSessionModels]
  );

  // Keep activeModelId in sync if the active model was deleted or restored
  useEffect(() => {
    if (activeEntry && activeEntry.id !== activeModelId) {
      setActiveModelId(activeEntry.id);
    } else if (!activeEntry && activeModelId !== '') {
      setActiveModelId('');
    }
  }, [activeEntry, activeModelId]);

  const isConfigurablePlatform = activeEntry?.id === GALVANIZED_WORK_PLATFORM_BLUEPRINT.id;

  const baseBlueprint = useMemo(
    () =>
      !activeEntry
        ? null
        : isConfigurablePlatform
          ? createWorkPlatformBlueprint(platformConfig)
          : activeEntry.blueprint,
    [isConfigurablePlatform, platformConfig, activeEntry]
  );

  const blueprint = (activeEntry ? editedBlueprints[activeEntry.id] : undefined) ?? baseBlueprint;

  // Reset or initialize machine simulation state when active model changes
  useEffect(() => {
    if (blueprint?.simulation) {
      setSimState(createInitialSimState(blueprint.simulation));
    } else {
      setSimState(null);
      setShowSimHmi(false);
    }
  }, [blueprint?.id, blueprint?.simulation]);

  // 60 fps deterministic machine simulation loop when RUNNING or HOMING
  const simActiveLoop = Boolean(
    showSimHmi &&
      blueprint?.simulation &&
      simState &&
      (simState.state === 'RUNNING' || simState.state === 'HOMING')
  );
  useEffect(() => {
    if (!simActiveLoop || !blueprint?.simulation) return;
    const spec = blueprint.simulation;
    let rafId = 0;
    let lastTs = performance.now();
    const tick = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastTs) / 1000) * simSpeed;
      lastTs = now;
      setSimState((prev) => (prev ? stepSimState(prev, spec, dtSec) : prev));
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [simActiveLoop, blueprint?.simulation, simSpeed]);

  // Stack light blink timer (E-STOP / HOMING)
  useEffect(() => {
    if (!showSimHmi || !simState?.lampBlink) {
      setSimBlinkOn(true);
      return;
    }
    const id = window.setInterval(() => setSimBlinkOn((v) => !v), 450);
    return () => window.clearInterval(id);
  }, [showSimHmi, simState?.lampBlink]);

  const handleSimCommand = useCallback(
    (cmd: SimCommandKind) => {
      if (!blueprint?.simulation) return;
      const spec = blueprint.simulation;
      setSimState((prev) => applySimCommand(prev ?? createInitialSimState(spec), spec, cmd));
    },
    [blueprint?.simulation]
  );

  const handleExportSimManifest = useCallback(() => {
    if (!blueprint?.simulation) return;
    const manifest = buildSotSimManifest(blueprint);
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${blueprint.id}-sim_manifest.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [blueprint]);

  const commitBlueprintEdit = useCallback(
    (nextBlueprint: MeshBlueprint) => {
      if (!blueprint || !activeModelId) return;
      setUndoStacks((prev) => ({
        ...prev,
        [activeModelId]: [...(prev[activeModelId] || []).slice(-29), blueprint],
      }));
      setRedoStacks((prev) => ({ ...prev, [activeModelId]: [] }));
      setEditedBlueprints((prev) => ({ ...prev, [activeModelId]: nextBlueprint }));
      setBuildRevision((prev) => prev + 1);
    },
    [activeModelId, blueprint]
  );

  const handleUpdatePart = useCallback(
    (partId: string, updater: (part: BlueprintPart) => BlueprintPart) => {
      if (!blueprint) return;
      const idx = blueprint.parts.findIndex((p) => p.id === partId);
      if (idx === -1) return;
      const nextParts = [...blueprint.parts];
      nextParts[idx] = updater(nextParts[idx]);
      commitBlueprintEdit({ ...blueprint, parts: nextParts });
    },
    [blueprint, commitBlueprintEdit]
  );

  const handleTransformPart = useCallback(
    (
      partId: string,
      nextPositionMm: [number, number, number],
      nextRotationDeg: [number, number, number]
    ) => {
      handleUpdatePart(partId, (p) => ({
        ...p,
        positionMm: nextPositionMm,
        rotationDeg: nextRotationDeg,
      }));
    },
    [handleUpdatePart]
  );

  const canUndo = (undoStacks[activeModelId]?.length ?? 0) > 0;
  const canRedo = (redoStacks[activeModelId]?.length ?? 0) > 0;

  const handleUndo = useCallback(() => {
    const stack = undoStacks[activeModelId];
    if (!stack || stack.length === 0 || !blueprint) return;
    const prevBp = stack[stack.length - 1];
    setUndoStacks((prev) => ({ ...prev, [activeModelId]: stack.slice(0, -1) }));
    setRedoStacks((prev) => ({
      ...prev,
      [activeModelId]: [...(prev[activeModelId] || []).slice(-29), blueprint],
    }));
    setEditedBlueprints((prev) => ({ ...prev, [activeModelId]: prevBp }));
    setBuildRevision((prev) => prev + 1);
  }, [activeModelId, undoStacks, blueprint]);

  const handleRedo = useCallback(() => {
    const stack = redoStacks[activeModelId];
    if (!stack || stack.length === 0 || !blueprint) return;
    const nextBp = stack[stack.length - 1];
    setRedoStacks((prev) => ({ ...prev, [activeModelId]: stack.slice(0, -1) }));
    setUndoStacks((prev) => ({
      ...prev,
      [activeModelId]: [...(prev[activeModelId] || []).slice(-29), blueprint],
    }));
    setEditedBlueprints((prev) => ({ ...prev, [activeModelId]: nextBp }));
    setBuildRevision((prev) => prev + 1);
  }, [activeModelId, redoStacks, blueprint]);

  const handleLoadConstellationCamera = useCallback(
    (rawJson: any) => {
      if (!blueprint) return;
      const parsed = parseConstellationCameraJson(rawJson);
      if (!parsed) {
        setConstellationError('Invalid camera.json (expected R[3x3], t[3], f, w, h).');
        return;
      }
      setConstellationError(null);
      commitBlueprintEdit({
        ...blueprint,
        photoMatchCamera: {
          ...blueprint.photoMatchCamera,
          constellationCamera: parsed,
        },
      });
      if (blueprint.sourceImageUrl && referenceOverlayOpacity < 0.05) {
        setReferenceOverlayOpacity(0.5);
      }
      window.setTimeout(() => {
        viewportRef.current?.applyCameraPreset('photoMatch');
      }, 40);
    },
    [blueprint, commitBlueprintEdit, referenceOverlayOpacity]
  );

  const handleRectifyGlassBox = useCallback(async () => {
    const cam = blueprint?.photoMatchCamera?.constellationCamera;
    if (!blueprint || !cam || !blueprint.sourceImageUrl || constellationBusy) return;
    setConstellationBusy(true);
    setConstellationError(null);
    try {
      const env = blueprint.envelopeMm;
      const res = await fetch('/api/constellation/glass-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: blueprint.sourceImageUrl,
          camera: cam,
          boundsMm: {
            min: [-env.width * 0.5, 0, -env.depth * 0.5],
            max: [env.width * 0.5, env.height, env.depth * 0.5],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Glass-box rectification failed.');
      const nextFaces: NonNullable<MeshBlueprint['rectifiedFaces']> = {};
      for (const [k, v] of Object.entries<any>(data.faces || {})) {
        if (v?.imageDataUrl && (k === 'FRONT' || k === 'TOP' || k === 'SIDE')) {
          nextFaces[k] = v.imageDataUrl;
        }
      }
      commitBlueprintEdit({
        ...blueprint,
        rectifiedFaces: nextFaces,
      });
    } catch (err: any) {
      setConstellationError(err?.message || 'Glass-box rectification failed.');
    } finally {
      setConstellationBusy(false);
    }
  }, [blueprint, commitBlueprintEdit, constellationBusy]);

  const handleRunConstellationQa = useCallback(
    async (inventory?: any, checkPoints?: any[]) => {
      const cam = blueprint?.photoMatchCamera?.constellationCamera;
      if (!blueprint || !cam || constellationBusy) return;
      setConstellationBusy(true);
      setConstellationError(null);
      try {
        const res = await fetch('/api/constellation/qa-gate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blueprint,
            camera: cam,
            inventory,
            checkPoints,
          }),
        });
        const report = await res.json();
        if (!res.ok) throw new Error(report?.error || 'Constellation QA gate failed.');
        setConstellationQa(report);
      } catch (err: any) {
        setConstellationError(err?.message || 'Constellation QA gate failed.');
      } finally {
        setConstellationBusy(false);
      }
    },
    [blueprint, constellationBusy]
  );

  const handleAutoSeatAssembly = useCallback(async () => {
    if (autoSeatBusy || !blueprint) return;
    setAutoSeatBusy(true);
    setAutoSeatNote(null);
    try {
      const res = await fetchApiWithRetry('/api/orchestrator/auto-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ blueprint, label: 'Auto-Seat & Align' }),
      });
      const data = await parseApiJson<{
        improved: boolean;
        blueprint: MeshBlueprint;
        appliedFixes: string[];
        beforeGate: { healthScore: number };
        afterGate: { healthScore: number };
      }>(res);

      if (data.improved && data.blueprint) {
        commitBlueprintEdit(data.blueprint);
        setAutoSeatNote(
          `Seated (${data.beforeGate.healthScore} → ${data.afterGate.healthScore}/100): ${
            data.appliedFixes.slice(0, 2).join('; ') || 'Aligned to host.'
          }`
        );
      } else {
        setAutoSeatNote(
          `Already cleanly seated (${data.afterGate.healthScore}/100 Health, 0 floating/unblended).`
        );
      }
    } catch (err: any) {
      setAutoSeatNote(err?.message || 'Auto-seat verification failed.');
    } finally {
      setAutoSeatBusy(false);
    }
  }, [autoSeatBusy, blueprint, commitBlueprintEdit]);

  const libraryModelItems: LibraryModelItem[] = useMemo(() => {
    const validFolderIds = new Set(libraryState.folders.map((f) => f.id));
    return allSessionModels.map((m, idx) => {
      const meta = libraryState.modelMeta[m.id];
      const rawFolderId = meta?.folderId;
      const folderId =
        rawFolderId && validFolderIds.has(rawFolderId) ? rawFolderId : null;
      const bp = editedBlueprints[m.id] ?? m.blueprint;
      return {
        id: m.id,
        label: m.label,
        category: bp.category || 'Uncategorized',
        partCount: bp.parts.length,
        isBuiltIn: m.isBuiltIn,
        isEdited: Boolean(editedBlueprints[m.id]),
        folderId,
        pinned: Boolean(meta?.pinned),
        order: typeof meta?.order === 'number' ? meta.order : idx,
        envelopeMm: bp.envelopeMm,
      };
    });
  }, [allSessionModels, libraryState.folders, libraryState.modelMeta, editedBlueprints]);

  const deletedBuiltIns: DeletedBuiltInItem[] = useMemo(() => {
    const deletedSet = new Set(libraryState.deletedBuiltInIds);
    return SESSION_MODELS.filter((m) => deletedSet.has(m.id)).map((m) => ({
      id: m.id,
      label: libraryState.modelMeta[m.id]?.label || m.label,
      category: m.blueprint.category || 'Built-in',
    }));
  }, [libraryState.deletedBuiltInIds, libraryState.modelMeta]);

  const modelOptions = useMemo(() => {
    const sortedFolders = [...libraryState.folders].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name)
    );
    const folderRank = new Map(sortedFolders.map((f, idx) => [f.id, idx]));
    const folderName = new Map(sortedFolders.map((f) => [f.id, f.name]));

    const sorted = [...libraryModelItems].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (!a.pinned && !b.pinned) {
        const ra = a.folderId ? (folderRank.get(a.folderId) ?? 999) : 999;
        const rb = b.folderId ? (folderRank.get(b.folderId) ?? 999) : 999;
        if (ra !== rb) return ra - rb;
      }
      return a.order - b.order || a.label.localeCompare(b.label);
    });

    return sorted.map((m) => ({
      id: m.id,
      label: m.pinned ? `★ ${m.label}` : m.label,
      group: m.pinned
        ? 'Pinned'
        : m.folderId
          ? folderName.get(m.folderId) || 'Uncategorized'
          : 'Uncategorized',
    }));
  }, [libraryModelItems, libraryState.folders]);

  const handleDeleteModel = useCallback(
    (id: string) => {
      const isBuiltIn = builtInIdSet.has(id);
      persistLibraryState((prev) => {
        const nextSaved = prev.savedModels.filter((m) => m.id !== id);
        const nextDeleted = isBuiltIn
          ? Array.from(new Set([...prev.deletedBuiltInIds, id]))
          : prev.deletedBuiltInIds;
        const nextMeta = { ...prev.modelMeta };
        if (!isBuiltIn) {
          delete nextMeta[id];
        }
        return {
          ...prev,
          savedModels: nextSaved,
          deletedBuiltInIds: nextDeleted,
          modelMeta: nextMeta,
        };
      });
      setEditedBlueprints((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [builtInIdSet, persistLibraryState]
  );

  const handleRestoreBuiltIn = useCallback(
    (id: string) => {
      persistLibraryState((prev) => ({
        ...prev,
        deletedBuiltInIds: prev.deletedBuiltInIds.filter((x) => x !== id),
      }));
    },
    [persistLibraryState]
  );

  const handleRestoreAllBuiltIns = useCallback(() => {
    persistLibraryState((prev) => ({
      ...prev,
      deletedBuiltInIds: [],
    }));
  }, [persistLibraryState]);

  const handleRenameModel = useCallback(
    (id: string, nextLabel: string) => {
      const trimmed = nextLabel.trim();
      if (!trimmed) return;
      persistLibraryState((prev) => ({
        ...prev,
        savedModels: prev.savedModels.map((m) =>
          m.id === id
            ? { ...m, label: trimmed, blueprint: { ...m.blueprint, name: trimmed } }
            : m
        ),
        modelMeta: {
          ...prev.modelMeta,
          [id]: {
            ...prev.modelMeta[id],
            label: trimmed,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    },
    [persistLibraryState]
  );

  const handleMoveModelToFolder = useCallback(
    (id: string, folderId: string | null) => {
      persistLibraryState((prev) => ({
        ...prev,
        modelMeta: {
          ...prev.modelMeta,
          [id]: {
            ...prev.modelMeta[id],
            folderId,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    },
    [persistLibraryState]
  );

  const handleTogglePinModel = useCallback(
    (id: string) => {
      persistLibraryState((prev) => ({
        ...prev,
        modelMeta: {
          ...prev.modelMeta,
          [id]: {
            ...prev.modelMeta[id],
            pinned: !prev.modelMeta[id]?.pinned,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    },
    [persistLibraryState]
  );

  const handleReorderModel = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const target = libraryModelItems.find((m) => m.id === id);
      if (!target) return;
      const peers = libraryModelItems
        .filter((m) => m.pinned === target.pinned && (target.pinned || m.folderId === target.folderId))
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
      const idx = peers.findIndex((m) => m.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= peers.length) return;
      const reordered = [...peers];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      persistLibraryState((prev) => {
        const nextMeta = { ...prev.modelMeta };
        reordered.forEach((item, i) => {
          nextMeta[item.id] = {
            ...nextMeta[item.id],
            order: i,
          };
        });
        return { ...prev, modelMeta: nextMeta };
      });
    },
    [libraryModelItems, persistLibraryState]
  );

  const handleCreateFolder = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const slug = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'folder';
      const id = `${slug}-${Date.now().toString(36)}`;
      persistLibraryState((prev) => ({
        ...prev,
        folders: [...prev.folders, { id, name: trimmed, order: prev.folders.length }],
      }));
    },
    [persistLibraryState]
  );

  const handleRenameFolder = useCallback(
    (folderId: string, nextName: string) => {
      const trimmed = nextName.trim();
      if (!trimmed) return;
      persistLibraryState((prev) => ({
        ...prev,
        folders: prev.folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)),
      }));
    },
    [persistLibraryState]
  );

  const handleDeleteFolder = useCallback(
    (folderId: string) => {
      persistLibraryState((prev) => {
        const nextMeta: Record<string, LibraryModelMeta> = {};
        for (const [mid, meta] of Object.entries(prev.modelMeta)) {
          nextMeta[mid] = meta.folderId === folderId ? { ...meta, folderId: null } : meta;
        }
        return {
          ...prev,
          folders: prev.folders.filter((f) => f.id !== folderId),
          modelMeta: nextMeta,
        };
      });
    },
    [persistLibraryState]
  );

  const handleSaveCurrentModel = useCallback(() => {
    if (!blueprint || !activeEntry) return;
    const isBuiltIn = builtInIdSet.has(activeEntry.id);
    if (!isBuiltIn) {
      persistLibraryState((prev) => ({
        ...prev,
        savedModels: prev.savedModels.map((m) =>
          m.id === activeEntry.id
            ? { ...m, blueprint, savedAt: new Date().toISOString() }
            : m
        ),
      }));
      setEditedBlueprints((prev) => {
        const next = { ...prev };
        delete next[activeEntry.id];
        return next;
      });
      return;
    }
    const newId = `${activeEntry.id}-saved-${Date.now().toString(36)}`;
    const newLabel = `${activeEntry.label} (Saved)`;
    const nextBp: MeshBlueprint = { ...blueprint, id: newId, name: newLabel };
    const folderId = libraryState.modelMeta[activeEntry.id]?.folderId ?? null;
    persistLibraryState((prev) => ({
      ...prev,
      savedModels: [
        {
          id: newId,
          label: newLabel,
          defaultTheme: studioTheme,
          blueprint: nextBp,
          savedAt: new Date().toISOString(),
        },
        ...prev.savedModels,
      ],
      modelMeta: {
        ...prev.modelMeta,
        [newId]: { label: newLabel, folderId, order: 0, updatedAt: new Date().toISOString() },
      },
    }));
    setEditedBlueprints((prev) => {
      const next = { ...prev };
      delete next[activeEntry.id];
      return next;
    });
    setActiveModelId(newId);
  }, [blueprint, activeEntry, builtInIdSet, libraryState.modelMeta, persistLibraryState, studioTheme]);

  const handleDuplicateActiveModel = useCallback(() => {
    if (!blueprint || !activeEntry) return;
    const newId = `${blueprint.id}-copy-${Date.now().toString(36)}`;
    const newLabel = `${activeEntry.label} (Copy)`;
    const nextBp: MeshBlueprint = { ...blueprint, id: newId, name: newLabel };
    const folderId = libraryState.modelMeta[activeEntry.id]?.folderId ?? null;
    persistLibraryState((prev) => ({
      ...prev,
      savedModels: [
        {
          id: newId,
          label: newLabel,
          defaultTheme: studioTheme,
          blueprint: nextBp,
          savedAt: new Date().toISOString(),
        },
        ...prev.savedModels,
      ],
      modelMeta: {
        ...prev.modelMeta,
        [newId]: { label: newLabel, folderId, order: 0, updatedAt: new Date().toISOString() },
      },
    }));
    setActiveModelId(newId);
  }, [blueprint, activeEntry, libraryState.modelMeta, persistLibraryState, studioTheme]);

  const handleImportBlueprintJson = useCallback(
    (imported: MeshBlueprint) => {
      const baseId =
        (imported.id || imported.name || 'imported-model')
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'imported-model';
      const exists = allSessionModels.some((m) => m.id === baseId);
      const id = exists ? `${baseId}-${Date.now().toString(36)}` : baseId;
      const label = imported.name || id;
      const nextBp: MeshBlueprint = { ...imported, id, name: label };
      persistLibraryState((prev) => ({
        ...prev,
        savedModels: [
          {
            id,
            label,
            defaultTheme: 'light',
            blueprint: nextBp,
            savedAt: new Date().toISOString(),
          },
          ...prev.savedModels,
        ],
        modelMeta: {
          ...prev.modelMeta,
          [id]: {
            label,
            folderId: prev.folders[0]?.id ?? null,
            order: 0,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      setActiveModelId(id);
      setActiveView('viewport');
    },
    [allSessionModels, persistLibraryState]
  );

  const handleImport3DAsset = useCallback(
    (imported: {
      id: string;
      name: string;
      format: 'glb' | 'usd';
      assetUrl: string;
      envelopeMm: { width: number; height: number; depth: number };
      meshCount?: number;
      triangleCount?: number;
    }) => {
      const env = imported.envelopeMm || { width: 2000, height: 1500, depth: 2000 };
      const span = Math.max(env.width, env.height, env.depth, 500);
      const bp: MeshBlueprint = {
        id: imported.id,
        name: imported.name,
        category: imported.format === 'usd' ? 'Imported OpenUSD Model' : 'Imported GLB Model',
        summary: `Imported ${imported.format.toUpperCase()} asset (${
          imported.meshCount ? `${imported.meshCount} meshes, ` : ''
        }${imported.triangleCount ? `${imported.triangleCount.toLocaleString()} tris` : 'ready for workcell integration'}).`,
        sourceImageUrl: '',
        envelopeMm: env,
        toleranceSpecMm: 0.5,
        symmetryPlane: 'none',
        photoMatchCamera: {
          positionMm: [-span * 1.35, span * 0.9, span * 1.55],
          targetMm: [0, env.height * 0.45, 0],
          fov: 35,
        },
        reconstructedAt: new Date().toISOString(),
        parts: [
          {
            id: `${imported.id}-asset`,
            name: imported.name,
            group: 'Imported Model',
            role: 'primary',
            anchorKind: 'floor',
            positionMm: [0, 0, 0],
            rotationDeg: [0, 0, 0],
            explodeOffsetMm: [0, 0, 0],
            toleranceMm: 0.5,
            geometry: {
              kind: 'importedAsset',
              assetUrl: imported.assetUrl,
              assetFormat: imported.format,
              assetScale: 1,
            },
            material: {
              colorHex: '#94a3b8',
              metalness: 0.3,
              roughness: 0.45,
              finishName: `Imported ${imported.format.toUpperCase()}`,
            },
          },
        ],
      };

      persistLibraryState((prev) => ({
        ...prev,
        savedModels: [
          {
            id: imported.id,
            label: imported.name,
            defaultTheme: 'light',
            blueprint: bp,
            savedAt: new Date().toISOString(),
          },
          ...prev.savedModels.filter((m) => m.id !== imported.id),
        ],
        modelMeta: {
          ...prev.modelMeta,
          [imported.id]: {
            label: imported.name,
            folderId: prev.folders[0]?.id ?? null,
            order: 0,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      setActiveModelId(imported.id);
      setActiveView('viewport');
    },
    [persistLibraryState]
  );

  // Keyboard shortcuts: H dock, G move gizmo, R rotate gizmo, Ctrl/Cmd+Z undo/redo, Esc dismiss
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'g' || e.key === 'G') {
        setGizmoMode((prev) => (prev === 'translate' ? 'off' : 'translate'));
      } else if (e.key === 'r' || e.key === 'R') {
        setGizmoMode((prev) => (prev === 'rotate' ? 'off' : 'rotate'));
      } else if (e.key === 'Escape') {
        if (
          activeView === 'models' ||
          activeView === 'agy' ||
          activeView === 'configure' ||
          activeView === 'assembly' ||
          activeView === 'audit' ||
          activeView === 'export' ||
          activeView === 'fiveAngle'
        ) {
          setActiveView('viewport');
        } else if (gizmoMode !== 'off') {
          setGizmoMode('off');
        } else if (caliperActive) {
          setCaliperActive(false);
        } else if (selectedPartId || highlightedPartIds.length > 0) {
          setSelectedPartId(null);
          setHighlightedPartIds([]);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeView, caliperActive, gizmoMode, selectedPartId, highlightedPartIds.length, handleUndo, handleRedo]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      const found = allSessionModels.find((m) => m.id === modelId);
      if (!found) return;
      setActiveModelId(found.id);
      setBuildRevision((prev) => prev + 1);
      setStudioTheme(found.defaultTheme);
      setHiddenPartIds(new Set());
      setSelectedPartId(null);
      setHoveredPartId(null);
      setHighlightedPartIds([]);
      setExplodeFactor(0);
      setSectionPlane({ axis: 'off', position: 0, invert: false });
      setCaliperActive(false);
      setCaliperMeasurement({
        pointA: null,
        pointB: null,
        distanceMm: null,
        deltaMm: null,
      });
      setReferenceOverlayOpacity(0);
      setEdgeDiff(null);
      setEdgeDiffError(null);
      setEdgeDiffOverlayVisible(false);
      setJointRigValues({});
      setKinematicPlaying(false);
      setShowSweptEnvelopes(false);
      setGizmoMode('off');
      setAutoSeatNote(null);
      setFiveAngleCaptures([]);
      setActiveView('viewport');
    },
    [allSessionModels]
  );

  const handleOrchestratorBlueprintReady = useCallback(
    (nextBlueprint: MeshBlueprint, label: string) => {
      const savedEntry: SavedLibraryModel = {
        id: nextBlueprint.id,
        label,
        blueprint: nextBlueprint,
        defaultTheme: 'light',
        savedAt: new Date().toISOString(),
      };
      persistLibraryState((prev) => ({
        ...prev,
        savedModels: [savedEntry, ...prev.savedModels.filter((m) => m.id !== savedEntry.id)],
        modelMeta: {
          ...prev.modelMeta,
          [savedEntry.id]: {
            ...prev.modelMeta[savedEntry.id],
            label,
            folderId: prev.modelMeta[savedEntry.id]?.folderId ?? prev.folders[0]?.id ?? null,
            updatedAt: savedEntry.savedAt,
          },
        },
      }));
      setEditedBlueprints((prev) => {
        if (!(savedEntry.id in prev)) return prev;
        const next = { ...prev };
        delete next[savedEntry.id];
        return next;
      });
      setActiveModelId(savedEntry.id);
      setBuildRevision((prev) => prev + 1);
      setStudioTheme('light');
      setHiddenPartIds(new Set());
      setSelectedPartId(null);
      setHoveredPartId(null);
      setHighlightedPartIds([]);
      setExplodeFactor(0);
      setSectionPlane({ axis: 'off', position: 0, invert: false });
      setEdgeDiff(null);
      setEdgeDiffError(null);
      setEdgeDiffOverlayVisible(false);
      setJointRigValues({});
      setFiveAngleCaptures([]);
    },
    [persistLibraryState]
  );

  const handleSelectView = useCallback(
    (view: ActiveWorkspaceView) => {
      if (view === 'compare' && !blueprint?.sourceImageUrl) return;
      setActiveView(view);
      if (view === 'compare') {
        viewportRef.current?.applyCameraPreset('photoMatch');
      }
    },
    [blueprint]
  );

  const handleTogglePartVisibility = useCallback((partId: string) => {
    setHiddenPartIds((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  }, []);

  const handleShowAllParts = useCallback(() => {
    setHiddenPartIds(new Set());
  }, []);

  const handleCaptureFiveAngles = useCallback(() => {
    const captures = viewportRef.current?.captureFiveAngles() || [];
    setFiveAngleCaptures(captures);
  }, []);

  const handleRunEdgeDiff = useCallback(async () => {
    if (!blueprint?.sourceImageUrl || !viewportRef.current) return;
    setEdgeDiffBusy(true);
    setEdgeDiffError(null);
    try {
      const meshFrameUrl = viewportRef.current.captureViewportFrame(true);
      if (!meshFrameUrl) {
        throw new Error('3D viewport frame unavailable for edge-diff scan.');
      }
      const result = await computePhotoVsMeshEdgeDiff(blueprint.sourceImageUrl, meshFrameUrl);
      setEdgeDiff(result);
      setEdgeDiffOverlayVisible(true);
    } catch (err) {
      setEdgeDiffError(err instanceof Error ? err.message : 'Edge-diff scan failed.');
    } finally {
      setEdgeDiffBusy(false);
    }
  }, [blueprint?.sourceImageUrl]);

  const handleToggleQuickEdgeDiff = useCallback(() => {
    if (edgeDiffOverlayVisible) {
      setEdgeDiffOverlayVisible(false);
    } else if (edgeDiff) {
      setEdgeDiffOverlayVisible(true);
    } else {
      void handleRunEdgeDiff();
    }
  }, [edgeDiffOverlayVisible, edgeDiff, handleRunEdgeDiff]);

  const handleJointRigChange = useCallback((jointId: string, next: JointRigValue) => {
    setKinematicPlaying(false);
    setJointRigValues((prev) => ({ ...prev, [jointId]: next }));
  }, []);

  const handleResetJointRig = useCallback(() => {
    setKinematicPlaying(false);
    setJointRigValues({});
  }, []);

  const handleApplyPosePreset = useCallback((preset: KinematicPosePreset) => {
    setKinematicPlaying(false);
    setJointRigValues(preset.jointTargets);
  }, []);

  const hasMovableJoints = useMemo(
    () => Boolean(auditReport?.joints?.some((j) => j.jointKind !== 'fixed')),
    [auditReport]
  );

  const selectedBlueprintPart = useMemo(() => {
    if (!selectedPartId || !blueprint) return null;
    return blueprint.parts.find((p) => p.id === selectedPartId) ?? null;
  }, [selectedPartId, blueprint]);

  const activePartInfo = useMemo(() => {
    const id = selectedPartId || hoveredPartId;
    if (!id || !metrology) return null;
    return metrology.parts.find((p) => p.id === id) || null;
  }, [selectedPartId, hoveredPartId, metrology]);

  const isDark = studioTheme === 'dark';

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden ${
        isDark ? 'bg-[#12161d] text-slate-100' : 'bg-[#eceff4] text-slate-900'
      }`}
    >
      {/* Top Bar: Viewer Navigation, Session Model Switcher & Export */}
      <TopBar
        activeView={activeView}
        onSelectView={handleSelectView}
        models={modelOptions}
        activeModelId={activeModelId}
        onSelectModel={handleSelectModel}
        hasSourceImage={Boolean(blueprint?.sourceImageUrl)}
        hasConfigurator={isConfigurablePlatform}
        studioTheme={studioTheme}
      />

      {/* Full-Viewport 3D Metrology Stage */}
      <main className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
        {!blueprint ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium opacity-80">No active models in your library.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveView('models')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                  isDark ? 'bg-white text-slate-950 hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                Open Models Library
              </button>
              {deletedBuiltIns.length > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreAllBuiltIns}
                  className={`px-4 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                    isDark ? 'border-white/20 hover:bg-white/10' : 'border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Restore Built-in Models ({deletedBuiltIns.length})
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
          <Viewport3D
            ref={viewportRef}
            blueprint={blueprint}
            renderMode={renderMode}
            studioTheme={studioTheme}
            lightingPreset={lightingPreset}
            aoEnabled={aoEnabled}
            gizmoMode={gizmoMode}
            showCoGOverlay={showCoGOverlay}
            showSweptEnvelopes={showSweptEnvelopes}
            showInstallationOverlay={showInstallationOverlay}
            installationOptions={installationOptions}
            simState={showSimHmi ? simState : null}
            simBlinkOn={simBlinkOn}
            kinematicPlaying={kinematicPlaying}
            tessellation={tessellation}
            explodeFactor={explodeFactor}
            sectionPlane={sectionPlane}
            caliperActive={caliperActive}
            compareMode={activeView === 'compare' && Boolean(blueprint.sourceImageUrl)}
            compareSplit={compareSplit}
            onCompareSplitChange={setCompareSplit}
            referenceOverlayOpacity={referenceOverlayOpacity}
            edgeDiffOverlayUrl={edgeDiffOverlayVisible && edgeDiff ? edgeDiff.overlayDataUrl : null}
            edgeDiffOverlayOpacity={edgeDiffOverlayOpacity}
            hiddenPartIds={hiddenPartIds}
            selectedPartId={selectedPartId}
            highlightedPartIds={highlightedPartIds}
            jointRigValues={jointRigValues}
            onSelectPart={setSelectedPartId}
            onHoverPart={setHoveredPartId}
            onTransformPart={handleTransformPart}
            onMetrologyReady={setMetrology}
            onAuditReady={setAuditReport}
            onCaliperChange={setCaliperMeasurement}
          />

          {/* Minimal Top-Left Unboxed Spec Readout */}
          {activeView !== 'compare' && (
            <div className="pointer-events-none absolute top-5 left-6 z-10 max-w-xl">
              <h1
                className={`text-lg font-semibold tracking-tight leading-tight ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {blueprint.name}
              </h1>

              <div
                className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-mono tabular-nums ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {metrology ? (
                  <>
                    <span>
                      {metrology.boundingMm[0].toFixed(1)} × {metrology.boundingMm[1].toFixed(1)} ×{' '}
                      {metrology.boundingMm[2].toFixed(1)} mm
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{metrology.totalTriangles.toLocaleString()} tris</span>
                    <span aria-hidden="true">·</span>
                    <span>±{blueprint.toleranceSpecMm.toFixed(2)} mm</span>
                    <span aria-hidden="true">·</span>
                    <span>{metrology.partCount} parts</span>
                    {metrology.massProperties && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{metrology.massProperties.totalMassKg.toFixed(2)} kg</span>
                      </>
                    )}
                  </>
                ) : (
                  <span>Calibrating sub-millimeter mesh...</span>
                )}
              </div>

              {activePartInfo && (
                <div
                  className={`mt-2 text-xs leading-snug ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  <span className="font-medium">{activePartInfo.name}</span>
                  <span className="mx-1.5 opacity-45" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums opacity-80">
                    {activePartInfo.sizeMm[0].toFixed(1)}×{activePartInfo.sizeMm[1].toFixed(1)}×
                    {activePartInfo.sizeMm[2].toFixed(1)} mm
                  </span>
                  <span className="mx-1.5 opacity-45" aria-hidden="true">
                    ·
                  </span>
                  <span className="opacity-75">{activePartInfo.finishName}</span>
                </div>
              )}

              {caliperMeasurement.distanceMm !== null && caliperMeasurement.deltaMm && (
                <div className="mt-2 text-xs font-mono tabular-nums text-rose-600 dark:text-rose-400">
                  Caliper {caliperMeasurement.distanceMm.toFixed(2)} mm (ΔX{' '}
                  {caliperMeasurement.deltaMm[0].toFixed(2)} · ΔY{' '}
                  {caliperMeasurement.deltaMm[1].toFixed(2)} · ΔZ{' '}
                  {caliperMeasurement.deltaMm[2].toFixed(2)} mm)
                </div>
              )}
            </div>
          )}

          {/* Direct 3D Part Inspector & Transform Gizmo Panel */}
          {activeView === 'viewport' && selectedBlueprintPart && (
            <PartInspectorPanel
              part={selectedBlueprintPart}
              metrology={metrology}
              studioTheme={studioTheme}
              gizmoMode={gizmoMode}
              onGizmoModeChange={setGizmoMode}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onUpdatePart={handleUpdatePart}
              onAutoSeatAssembly={handleAutoSeatAssembly}
              autoSeatBusy={autoSeatBusy}
              autoSeatNote={autoSeatNote}
              onClose={() => {
                setSelectedPartId(null);
                setGizmoMode('off');
              }}
            />
          )}

          {/* Floating Machine Operator HMI (START / STOP / E-STOP / RESET / HOME) */}
          {activeView === 'viewport' &&
            showSimHmi &&
            blueprint.simulation &&
            simState &&
            !selectedBlueprintPart && (
              <OperatorHmiPanel
                spec={blueprint.simulation}
                sim={simState}
                speedMultiplier={simSpeed}
                studioTheme={studioTheme}
                onCommand={handleSimCommand}
                onSpeedChange={setSimSpeed}
                onExportSimManifest={handleExportSimManifest}
                onClose={() => setShowSimHmi(false)}
              />
            )}

          {/* Floating Machine Floor Markings, Clearances & Utilities Schedule Panel */}
          {activeView === 'viewport' &&
            showInstallationOverlay &&
            !showSimHmi &&
            !selectedBlueprintPart && (
            <InstallationSchedulePanel
              blueprint={blueprint}
              studioTheme={studioTheme}
              options={installationOptions}
              onOptionsChange={setInstallationOptions}
              onClose={() => setShowInstallationOverlay(false)}
            />
          )}

          {/* Unified Collapsible Bottom Control Dock (Render, Inspect, Camera) */}
          <BottomControlDock
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((c) => !c)}
            studioTheme={studioTheme}
            onStudioThemeChange={setStudioTheme}
            lightingPreset={lightingPreset}
            onLightingPresetChange={setLightingPreset}
            aoEnabled={aoEnabled}
            onToggleAo={() => setAoEnabled((v) => !v)}
            renderMode={renderMode}
            onRenderModeChange={setRenderMode}
            tessellation={tessellation}
            onTessellationChange={setTessellation}
            explodeFactor={explodeFactor}
            onExplodeFactorChange={setExplodeFactor}
            sectionPlane={sectionPlane}
            onSectionPlaneChange={setSectionPlane}
            caliperActive={caliperActive}
            onToggleCaliper={() => setCaliperActive((a) => !a)}
            caliperMeasurement={caliperMeasurement}
            onClearCaliper={() => viewportRef.current?.clearCaliper()}
            gizmoMode={gizmoMode}
            onGizmoModeChange={setGizmoMode}
            showCoGOverlay={showCoGOverlay}
            onToggleCoGOverlay={() => setShowCoGOverlay((v) => !v)}
            showSweptEnvelopes={showSweptEnvelopes}
            onToggleSweptEnvelopes={() => setShowSweptEnvelopes((v) => !v)}
            showInstallationOverlay={showInstallationOverlay}
            onToggleInstallationOverlay={() => {
              setShowInstallationOverlay((v) => {
                if (!v) setShowSimHmi(false);
                return !v;
              });
            }}
            hasSimulation={Boolean(blueprint.simulation)}
            showSimHmi={showSimHmi}
            onToggleSimHmi={() => {
              setShowSimHmi((v) => {
                if (!v) setShowInstallationOverlay(false);
                return !v;
              });
            }}
            hasMovableJoints={hasMovableJoints}
            hasSourceImage={Boolean(blueprint.sourceImageUrl)}
            hasConstellationCamera={Boolean(blueprint.photoMatchCamera?.constellationCamera)}
            onLoadConstellationCamera={handleLoadConstellationCamera}
            referenceOverlayOpacity={referenceOverlayOpacity}
            onReferenceOverlayOpacityChange={setReferenceOverlayOpacity}
            edgeDiffActive={edgeDiffOverlayVisible}
            onToggleEdgeDiff={handleToggleQuickEdgeDiff}
            onApplyCameraPreset={(preset: CameraPresetId) => {
              viewportRef.current?.applyCameraPreset(preset);
            }}
          />
          </>
        )}
      </main>

      {/* Orchestrator removed: all builds and modifications run through the CLI drawer (AgyDrawer) */}

      {/* On-Demand Models Library & Organization Drawer */}
      <ModelLibraryDrawer
        open={activeView === 'models'}
        onClose={() => setActiveView('viewport')}
        studioTheme={studioTheme}
        activeModelId={activeModelId}
        models={libraryModelItems}
        folders={libraryState.folders}
        deletedBuiltIns={deletedBuiltIns}
        hasUnsavedEdits={Boolean(activeModelId && editedBlueprints[activeModelId])}
        onSelectModel={handleSelectModel}
        onDeleteModel={handleDeleteModel}
        onRestoreBuiltIn={handleRestoreBuiltIn}
        onRestoreAllBuiltIns={handleRestoreAllBuiltIns}
        onRenameModel={handleRenameModel}
        onMoveModelToFolder={handleMoveModelToFolder}
        onTogglePinModel={handleTogglePinModel}
        onReorderModel={handleReorderModel}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onSaveCurrentModel={handleSaveCurrentModel}
        onDuplicateActiveModel={handleDuplicateActiveModel}
        onImportBlueprintJson={handleImportBlueprintJson}
        onImport3DAsset={handleImport3DAsset}
      />

      {/* On-Demand Parametric Engineering Configurator Drawer */}
      {isConfigurablePlatform && (
        <ConfiguratorDrawer
          open={activeView === 'configure'}
          onClose={() => setActiveView('viewport')}
          config={platformConfig}
          onChange={(next) => {
            setPlatformConfig(next);
            setBuildRevision((prev) => prev + 1);
            setSelectedPartId(null);
            setHighlightedPartIds([]);
            setHiddenPartIds(new Set());
          }}
          onReset={() => {
            setPlatformConfig(DEFAULT_WORK_PLATFORM_CONFIG);
            setBuildRevision((prev) => prev + 1);
            setSelectedPartId(null);
            setHighlightedPartIds([]);
            setHiddenPartIds(new Set());
          }}
          onReframeCamera={() => {
            viewportRef.current?.applyCameraPreset('photoMatch');
          }}
          metrology={metrology}
          studioTheme={studioTheme}
        />
      )}

      {/* On-Demand Assembly Tree Drawer */}
      {blueprint && (
        <AssemblyDrawer
          open={activeView === 'assembly'}
          onClose={() => setActiveView('viewport')}
          blueprint={blueprint}
          metrology={metrology}
          hiddenPartIds={hiddenPartIds}
          onTogglePartVisibility={handleTogglePartVisibility}
          onShowAllParts={handleShowAllParts}
          selectedPartId={selectedPartId}
          onSelectPart={setSelectedPartId}
        />
      )}

      {/* On-Demand Geometry, Mass/Stability, Edge-Diff, Mate & Motion Rigging Audit Drawer */}
      {blueprint && (
        <GeometryAuditDrawer
          open={activeView === 'audit'}
          onClose={() => setActiveView('viewport')}
          blueprint={blueprint}
          metrology={metrology}
          audit={auditReport}
          edgeDiff={edgeDiff}
          edgeDiffBusy={edgeDiffBusy}
          edgeDiffError={edgeDiffError}
          edgeDiffOverlayVisible={edgeDiffOverlayVisible}
          edgeDiffOverlayOpacity={edgeDiffOverlayOpacity}
          onRunEdgeDiff={handleRunEdgeDiff}
          onToggleEdgeDiffOverlay={() => setEdgeDiffOverlayVisible((v) => !v)}
          onEdgeDiffOpacityChange={setEdgeDiffOverlayOpacity}
          showCoGOverlay={showCoGOverlay}
          onToggleCoGOverlay={() => setShowCoGOverlay((v) => !v)}
          showSweptEnvelopes={showSweptEnvelopes}
          onToggleSweptEnvelopes={() => setShowSweptEnvelopes((v) => !v)}
          kinematicPlaying={kinematicPlaying}
          onToggleKinematicPlaying={() => setKinematicPlaying((v) => !v)}
          onApplyPosePreset={handleApplyPosePreset}
          jointRigValues={jointRigValues}
          onJointRigChange={handleJointRigChange}
          onResetJointRig={handleResetJointRig}
          highlightedPartIds={highlightedPartIds}
          onHighlightParts={setHighlightedPartIds}
          onSelectPart={setSelectedPartId}
          constellationQa={constellationQa || blueprint.constellationQa || null}
          constellationBusy={constellationBusy}
          constellationError={constellationError}
          onLoadConstellationCamera={handleLoadConstellationCamera}
          onRunConstellationQa={handleRunConstellationQa}
          onRectifyGlassBox={handleRectifyGlassBox}
        />
      )}

      {/* On-Demand Download & Export Modal */}
      {blueprint && (
        <ExportModal
          open={activeView === 'export'}
          onClose={() => setActiveView('viewport')}
          blueprint={blueprint}
          metrology={metrology}
          buildRevision={buildRevision}
          hiddenPartCount={hiddenPartIds.size}
          onExportSTL={(includeHidden) =>
            exportBlueprintAsSTL(
              blueprint,
              tessellation,
              includeHidden ? new Set() : hiddenPartIds,
              buildRevision
            )
          }
          onExportOBJ={(includeHidden) =>
            exportBlueprintAsOBJ(
              blueprint,
              tessellation,
              includeHidden ? new Set() : hiddenPartIds,
              buildRevision
            )
          }
          onExportGLB={(includeHidden) =>
            exportBlueprintAsGLB(
              blueprint,
              tessellation,
              includeHidden ? new Set() : hiddenPartIds,
              buildRevision
            )
          }
          onExportSOTUSD={(includeHidden) =>
            exportBlueprintAsSOTUSD(
              blueprint,
              tessellation,
              includeHidden ? new Set() : hiddenPartIds,
              buildRevision
            )
          }
          onExportUSDZ={(includeHidden) =>
            exportBlueprintAsUSDZ(
              blueprint,
              tessellation,
              includeHidden ? new Set() : hiddenPartIds,
              buildRevision
            )
          }
          onExportJSON={() => exportBlueprintAsJSON(blueprint, buildRevision)}
          onCapturePNG={() => {
            if (!viewportRef.current) {
              throw new Error('3D viewport is not ready.');
            }
            return viewportRef.current.capturePNG(buildRevision);
          }}
        />
      )}

      {/* On-Demand 5-Angle Orthographic & Orientation Check Modal */}
      {blueprint && (
        <FiveAngleCheckModal
          open={activeView === 'fiveAngle'}
          onClose={() => setActiveView('viewport')}
          blueprint={blueprint}
          captures={fiveAngleCaptures}
          onRefreshCaptures={handleCaptureFiveAngles}
          onJumpToAngle={(preset) => viewportRef.current?.applyCameraPreset(preset)}
        />
      )}

      {/* On-Demand 18D SOT Terminal Drawer */}
      <TerminalDrawer
        open={activeView === 'terminal'}
        onClose={() => setActiveView('viewport')}
      />

      {/* On-Demand Antigravity CLI Drawer */}
      <AgyDrawer
        open={activeView === 'agy'}
        onClose={() => setActiveView('viewport')}
        studioTheme={studioTheme}
        activeModel={blueprint ? { id: blueprint.id, name: blueprint.name } : undefined}
        onCaptureViewportFrame={() => viewportRef.current?.captureViewportFrame(true) ?? null}
      />
    </div>
  );
}
