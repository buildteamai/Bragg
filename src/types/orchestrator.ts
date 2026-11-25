import {
  AssemblySkeletonSpec,
  CameraViewConfig,
  ConstellationCameraJson,
  ConstellationQaGateReport,
  ConstellationSpec,
  GeometryAuditReport,
  MeshBlueprint,
  PartMaterialSpec,
} from './blueprint';
import type {
  ConstellationCheckPointInput,
  ConstellationInventory,
} from './constellation';

export type OrchestratorMode = 'build' | 'auditAndUpgrade';

export type OrchestratorStageId =
  | 'constellation'
  | 'skeleton'
  | 'subassemblies'
  | 'gate'
  | 'repair'
  | 'visual';

export type OrchestratorStageStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'repaired'
  | 'warning'
  | 'failed'
  | 'skipped';

export interface OrchestratorSubAssemblyZone {
  id: string;
  name: string;
  group: string;
  boundsMm: {
    min: [number, number, number];
    max: [number, number, number];
  };
  targetPartCount: number;
  interfacePorts: string[];
  libraryHints: string[];
  summary: string;
}

export interface OrchestratorInterfaceDatum {
  id: string;
  positionMm: [number, number, number];
  normal: [number, number, number];
  matingClearanceMm: number;
  connectsZones: [string, string];
}

export type DatumPlaneKind = 'XY' | 'YZ' | 'XZ';

export interface PlanarSketchProfile {
  id: string;
  zoneId: string;
  label: string;
  plane: DatumPlaneKind;
  planeOffsetMm: number;
  extrudeDepthMm: number;
  polygonMm: [number, number][];
  isSheetMetal?: boolean;
}

export interface OrthographicPlanVerification {
  passed: boolean;
  frontCoveragePct: number;
  sideCoveragePct: number;
  topCoveragePct: number;
  planarZoneOverlapCount: number;
  groundContactVerified: boolean;
  envelopeFitErrorPct: number;
  notes: string[];
}

export interface OrchestratorPlanarLayout {
  frontElevationXY: PlanarSketchProfile[];
  sideProfileYZ: PlanarSketchProfile[];
  topPlanXZ: PlanarSketchProfile[];
  verification: OrthographicPlanVerification;
}

export interface OrchestratorSkeletonPlan {
  name: string;
  category: string;
  summary: string;
  envelopeMm: {
    width: number;
    height: number;
    depth: number;
  };
  symmetryPlane: 'none' | 'X' | 'Z' | 'radial';
  photoMatchCamera: CameraViewConfig;
  skeleton: AssemblySkeletonSpec;
  materialPalette: Record<string, PartMaterialSpec>;
  zones: OrchestratorSubAssemblyZone[];
  interfaceDatums?: OrchestratorInterfaceDatum[];
  planarLayout?: OrchestratorPlanarLayout;
}

export interface OrchestratorWorkerState {
  zoneId: string;
  zoneName: string;
  group: string;
  status: OrchestratorStageStatus;
  partCount: number;
  durationMs?: number;
  error?: string;
}

export interface OrchestratorAccuracyMetrics {
  actualEnvelopeMm: {
    width: number;
    height: number;
    depth: number;
  };
  envelopeErrorPct: number;
  csgWatertightPct: number;
  featureRichnessPct: number;
  groundingAccuracyMm: number;
  accuracyScore: number;
}

export interface OrchestratorGateSnapshot {
  iteration: number;
  label: string;
  healthScore: number;
  watertightCsgCount: number;
  totalCsgCount: number;
  totalPartCount: number;
  hardClashCount: number;
  warningClashCount: number;
  dynamicClashCount: number;
  floatingCount: number;
  occludedCount: number;
  unblendedMountCount?: number;
  maxResidualMm: number;
  passed: boolean;
  topDefects: string[];
  mtvFixes?: string[];
  accuracyMetrics?: OrchestratorAccuracyMetrics;
  /** Optional Constellation photo QA gate snapshot (coverage % + check_points RMS px) */
  constellationQa?: ConstellationQaGateReport;
}

export interface OrchestratorStepEvent {
  id: string;
  timestamp: number;
  stage: OrchestratorStageId;
  worker?: string;
  status: OrchestratorStageStatus;
  title: string;
  detail: string;
  durationMs?: number;
}

export interface OrchestratorStartRequest {
  mode: OrchestratorMode;
  prompt?: string;
  imageBase64?: string;
  mimeType?: string;
  targetWidthMm?: number;
  currentBlueprint?: MeshBlueprint;
  workerCount?: number;
  maxRepairIterations?: number;
  /** Optional raw Constellation single_view marks.json for pre-pass metrology */
  constellationMarks?: Record<string, any>;
  /** Optional pre-solved Constellation spec.json */
  constellationSpec?: ConstellationSpec;
  /** Optional solved Constellation camera.json */
  constellationCamera?: ConstellationCameraJson;
  /** Optional Constellation coverage inventory.json for QA gate */
  constellationInventory?: ConstellationInventory;
  /** Optional Constellation 2D/3D check points for QA gate */
  constellationCheckPoints?: ConstellationCheckPointInput[];
}

export interface OrchestratorJobSnapshot {
  jobId: string;
  mode: OrchestratorMode;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: OrchestratorStageId;
  progressPct: number;
  iteration: number;
  maxRepairIterations: number;
  constellationSpec?: ConstellationSpec;
  constellationQa?: ConstellationQaGateReport;
  skeletonPlan?: OrchestratorSkeletonPlan;
  workers: OrchestratorWorkerState[];
  gateHistory: OrchestratorGateSnapshot[];
  events: OrchestratorStepEvent[];
  blueprint?: MeshBlueprint;
  finalAudit?: GeometryAuditReport;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface VisualCriticRequest {
  blueprint: MeshBlueprint;
  renderedFrameBase64: string;
  referenceImageBase64?: string;
  referenceMimeType?: string;
  edgeDiffMetrics?: {
    f1ScorePct: number;
    silhouetteIoUPct: number;
    precisionPct: number;
    recallPct: number;
  };
  focusNote?: string;
}

export interface VisualCriticResponse {
  blueprint: MeshBlueprint;
  beforeGate: OrchestratorGateSnapshot;
  afterGate: OrchestratorGateSnapshot;
  visualFindings: string[];
  appliedFixes: string[];
  accepted: boolean;
  rejectionReason?: string;
}
