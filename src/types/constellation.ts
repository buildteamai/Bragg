/**
 * Shared TypeScript types for Architekton Constellation integration in 18D.
 * Mirrors `architekton_engine.constellation` (camera, single_view, ortho, sections, coverage).
 */

export type ConstellationFaceId = 'FRONT' | 'TOP' | 'SIDE';

/**
 * OpenCV-style pinhole camera exported by `architekton_engine.constellation.Camera.to_dict()`
 * or `single_view.camera_to_model()`:
 *   X_cam = R @ X_world + t
 *   u = f * X_cam.x / X_cam.z + cx
 *   v = f * X_cam.y / X_cam.z + cy
 */
export interface ConstellationCameraJson {
  /** 3x3 world-to-camera rotation matrix (rows are camera +X right, +Y down, +Z forward) */
  R: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  /** 3-vector camera translation in world units */
  t: [number, number, number];
  /** Focal length in pixels */
  f: number;
  /** Source photo width in pixels */
  w: number;
  /** Source photo height in pixels */
  h: number;
  /** Principal point X in pixels (defaults to w / 2) */
  cx?: number | null;
  /** Principal point Y in pixels (defaults to h / 2) */
  cy?: number | null;
  /** World up axis convention: architekton uses 'zup', 18D Three.js scene uses 'yup' */
  frame?: 'zup' | 'yup';
  /** World units of t / points: 'mm' (default) or 'in' */
  units?: 'mm' | 'in';
  /** Optional reprojection RMS in pixels from camera refinement */
  reproj_rms_px?: number;
  /** Optional source photo filename or label */
  photo?: string;
}

export interface ConstellationDimensionCI {
  name: string;
  valueMm: number;
  lo95Mm?: number;
  hi95Mm?: number;
  valueIn?: number;
  lo95In?: number;
  hi95In?: number;
  source?: string;
  note?: string;
}

export interface ConstellationSpec {
  envelopeMm?: {
    width: number;
    height: number;
    depth: number;
  };
  dimensions: ConstellationDimensionCI[];
  pointsMm: Record<string, [number, number, number]>;
  gaps: string[];
  scaleCheck?: string;
  focalObsSdPct?: number;
  focalTensionSigma?: number;
  camera?: ConstellationCameraJson;
  rawSpec?: Record<string, any>;
  rawReport?: Record<string, any>;
}

export interface ConstellationRectifiedFace {
  face: ConstellationFaceId;
  imageDataUrl: string;
  widthPx: number;
  heightPx: number;
  scalePxPerMm: number;
  extentMm: [number, number];
}

export interface ConstellationGlassBoxResult {
  faces: Partial<Record<ConstellationFaceId, ConstellationRectifiedFace>>;
  camera: ConstellationCameraJson;
  engine: 'architekton-constellation';
}

export interface ConstellationInventoryItem {
  id: string;
  cls?: string;
  kind?: 'model' | 'gap' | 'art' | 'background' | 'out_of_scope';
  /** Photo bounding box [u0, v0, u1, v1] in pixels */
  box: [number, number, number, number];
  /** Optional part id/name globs or substrings in the 18D blueprint */
  partGlobs?: string[];
  prim_globs?: string[];
  expectedCount?: number;
  count?: number;
  note?: string;
}

export interface ConstellationInventory {
  schema?: string;
  photo?: string;
  imageSize?: [number, number];
  objects: ConstellationInventoryItem[];
}

export interface ConstellationCheckPointInput {
  label: string;
  /** Photo pixel [u, v] */
  uv: [number, number];
  /** Optional 3D model point [x, y, z] in mm (18D Y-up frame) */
  modelMm?: [number, number, number];
  /** Optional part name/id globs for mesh edge matching in sections.check_points */
  partGlobs?: string[];
  kind?: 'edge' | 'center' | 'opening' | 'point';
}

export interface ConstellationPointCheckResult {
  label: string;
  uvPhoto: [number, number];
  uvProjected: [number, number] | null;
  errPx: number | null;
  withinTol: boolean;
  status: 'ok' | 'miss' | 'occluded' | 'unmatched';
  note?: string;
}

export interface ConstellationCoverageRow {
  id: string;
  cls: string;
  status: 'ok' | 'rough' | 'misplaced' | 'missing' | 'count' | 'gap' | 'ignored';
  iou: number;
  offsetPx?: [number, number];
  expectedBox?: [number, number, number, number];
  projectedBox?: [number, number, number, number] | null;
  matchedParts: string[];
  note?: string;
}

export interface ConstellationQaGateReport {
  checkedAt: string;
  engine: 'architekton-constellation' | 'constellation-ts-projection';
  passed: boolean;
  /** 0..100 */
  coveragePct: number;
  toModelCount: number;
  okCount: number;
  roughCount: number;
  misplacedCount: number;
  missingCount: number;
  wrongCount: number;
  gapCount: number;
  /** Reprojection RMS in pixels across checked points */
  rmsPx: number | null;
  maxErrPx: number | null;
  withinTolPct: number | null;
  tolPx: number;
  summary: string;
  objects: ConstellationCoverageRow[];
  todo: ConstellationCoverageRow[];
  pointChecks: ConstellationPointCheckResult[];
}
