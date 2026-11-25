import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  AssemblyMassProperties,
  CaliperMeasurement,
  CameraPresetId,
  FiveAngleCapture,
  GeometryAuditReport,
  LightingPresetId,
  MeshBlueprint,
  MetrologyStats,
  ProjectedDecalSpec,
  RenderMode,
  SectionPlaneConfig,
  StudioTheme,
  TessellationDensity,
  TransformGizmoMode,
} from '../types/blueprint';
import {
  buildBlueprintAssembly,
  BuiltAssembly,
  disposeAssembly,
  formatExportFilename,
  MM_TO_SCENE,
} from '../engine/meshKernel';
import { ensureManifoldReady, isManifoldReady } from '../engine/manifoldKernel';
import {
  createContactShadowTexture,
  createZebraCurvatureMaterial,
} from '../engine/proceduralTextures';
import { renderProjectedNecDecal } from '../engine/necDecals';
import { renderProjectedSignage } from '../engine/signageEngine';
import {
  InstallationVisibilityOptions,
  populateInstallationOverlayGroup,
} from '../engine/installationOverlay';
import {
  SimRuntimeState,
  updateSimOverlayGroup,
} from '../engine/machineSimEngine';
import {
  applyConstellationCameraToThree,
  constellationCameraToThreePose,
} from '../engine/constellationCamera';
import type { JointRigValue } from './GeometryAuditDrawer';

export interface Viewport3DHandle {
  applyCameraPreset: (preset: CameraPresetId) => void;
  captureFiveAngles: () => FiveAngleCapture[];
  captureViewportFrame: (snapToPhotoMatch?: boolean) => string | null;
  capturePNG: (buildRevision?: number) => string;
  clearCaliper: () => void;
}

interface Viewport3DProps {
  blueprint: MeshBlueprint | null;
  renderMode: RenderMode;
  studioTheme: StudioTheme;
  lightingPreset: LightingPresetId;
  aoEnabled: boolean;
  gizmoMode: TransformGizmoMode;
  showCoGOverlay: boolean;
  showSweptEnvelopes: boolean;
  showInstallationOverlay: boolean;
  installationOptions: InstallationVisibilityOptions;
  simState: SimRuntimeState | null;
  simBlinkOn: boolean;
  kinematicPlaying: boolean;
  tessellation: TessellationDensity;
  explodeFactor: number; // 0 to 1
  sectionPlane: SectionPlaneConfig;
  caliperActive: boolean;
  compareMode: boolean;
  compareSplit: number; // 0 to 100
  onCompareSplitChange: (pct: number) => void;
  referenceOverlayOpacity: number; // 0 to 0.75
  edgeDiffOverlayUrl: string | null;
  edgeDiffOverlayOpacity: number; // 0 to 1
  hiddenPartIds: Set<string>;
  selectedPartId: string | null;
  highlightedPartIds: string[];
  jointRigValues: Record<string, JointRigValue>;
  onSelectPart: (partId: string | null) => void;
  onHoverPart: (partId: string | null) => void;
  onTransformPart?: (
    partId: string,
    nextPositionMm: [number, number, number],
    nextRotationDeg: [number, number, number]
  ) => void;
  onMetrologyReady: (stats: MetrologyStats | null) => void;
  onAuditReady: (audit: GeometryAuditReport | null) => void;
  onCaliperChange: (measurement: CaliperMeasurement) => void;
}

// Pre-allocated math helpers (zero GC inside render loop)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vMid = new THREE.Vector3();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _rigAnchor = new THREE.Vector3();
const _rigAxis = new THREE.Vector3();
const _rigQuat = new THREE.Quaternion();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Generates a high-dynamic-range Studio Softbox IBL cubemap via PMREMGenerator
 * parameterized by switchable studio lighting rigs (Cyclorama, Dark Rim, Factory Floor, Showroom).
 */
function createStudioSoftboxEnvironment(
  renderer: THREE.WebGLRenderer,
  preset: LightingPresetId = 'cyclorama'
): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const cfg =
    preset === 'darkRim'
      ? {
          bg: '#0c1018',
          room: '#1d2433',
          roomInt: 0.35,
          floor: '#090d14',
          floorInt: 0.35,
          overhead: '#e2ecff',
          overheadInt: 2.2,
          strip: '#ffffff',
          stripInt: 6.8,
          key: '#fff0db',
          keyInt: 3.1,
          fill: '#9cc4ff',
          fillInt: 2.0,
          rim: '#ffffff',
          rimInt: 7.4,
        }
      : preset === 'factoryFloor'
        ? {
            bg: '#26292e',
            room: '#575b61',
            roomInt: 0.58,
            floor: '#32363c',
            floorInt: 0.55,
            overhead: '#fff4df',
            overheadInt: 3.8,
            strip: '#fffaee',
            stripInt: 5.0,
            key: '#ffe9c7',
            keyInt: 4.5,
            fill: '#cfe0f5',
            fillInt: 2.4,
            rim: '#f0f6ff',
            rimInt: 3.6,
          }
        : preset === 'showroom'
          ? {
              bg: '#343b46',
              room: '#8590a1',
              roomInt: 0.72,
              floor: '#2a303a',
              floorInt: 0.52,
              overhead: '#ffffff',
              overheadInt: 4.2,
              strip: '#ffffff',
              stripInt: 6.0,
              key: '#fff8ee',
              keyInt: 4.8,
              fill: '#e6f0ff',
              fillInt: 3.4,
              rim: '#ffffff',
              rimInt: 5.2,
            }
          : {
              bg: '#202630',
              room: '#5c6472',
              roomInt: 0.55,
              floor: '#181d26',
              floorInt: 0.45,
              overhead: '#f8fbff',
              overheadInt: 3.4,
              strip: '#ffffff',
              stripInt: 5.2,
              key: '#fff3e2',
              keyInt: 4.3,
              fill: '#d9e9ff',
              fillInt: 2.6,
              rim: '#ffffff',
              rimInt: 4.8,
            };

  envScene.background = new THREE.Color(cfg.bg);

  const tempDisposables: Array<{ dispose: () => void }> = [];
  const addPanel = (
    w: number,
    h: number,
    colorHex: string,
    intensity: number,
    pos: [number, number, number],
    lookAt: [number, number, number] = [0, 0, 0]
  ) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const col = new THREE.Color(colorHex).multiplyScalar(intensity);
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    envScene.add(mesh);
    tempDisposables.push(geo, mat);
  };

  const roomGeo = new THREE.BoxGeometry(26, 16, 26);
  const roomMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(cfg.room).multiplyScalar(cfg.roomInt),
    side: THREE.BackSide,
    toneMapped: false,
  });
  const roomMesh = new THREE.Mesh(roomGeo, roomMat);
  roomMesh.position.set(0, 4.5, 0);
  envScene.add(roomMesh);
  tempDisposables.push(roomGeo, roomMat);

  addPanel(24, 24, cfg.floor, cfg.floorInt, [0, -3.4, 0], [0, 0, 0]);
  addPanel(11.5, 6.2, cfg.overhead, cfg.overheadInt, [0, 8.2, 0.6], [0, 0, 0]);
  addPanel(13.0, 1.4, cfg.strip, cfg.stripInt, [0, 7.6, -2.8], [0, 0, 0]);
  addPanel(5.4, 4.2, cfg.key, cfg.keyInt, [-8.4, 4.4, 7.2], [0, 0.5, 0]);
  addPanel(6.2, 4.6, cfg.fill, cfg.fillInt, [8.8, 3.4, 6.4], [0, 0.5, 0]);
  addPanel(10.0, 2.2, cfg.rim, cfg.rimInt, [1.0, 5.4, -9.2], [0, 0.5, 0]);
  addPanel(6.0, 1.3, '#f7ece0', preset === 'darkRim' ? 0.9 : 1.7, [-9.8, 0.8, -1.2], [0, 0.8, 0]);
  addPanel(6.0, 1.3, '#d7e6f9', preset === 'darkRim' ? 1.1 : 1.6, [9.8, 1.0, -2.0], [0, 0.8, 0]);

  const rt = pmremGenerator.fromScene(envScene, 0.032);
  tempDisposables.forEach((d) => d.dispose());
  pmremGenerator.dispose();
  return rt.texture;
}

function disposeGroupChildren(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj: any) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }
}

/**
 * Generates a crisp high-DPI transparent canvas texture for curved DecalGeometry projection.
 */
function createProjectedDecalTexture(spec: ProjectedDecalSpec): THREE.CanvasTexture {
  if (spec.signage) {
    const tex = renderProjectedSignage(spec);
    if (tex) return tex;
  }
  if (spec.necDecalId || spec.necSignal) {
    return renderProjectedNecDecal(spec);
  }
  if (spec.circularRing) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 512);
      ctx.fillStyle = spec.colorHex || '#2b2824';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const weight =
        spec.fontWeight === 'normal' ? '500' : spec.fontWeight === 'semibold' ? '600' : '700';
      ctx.font = `${weight} 44px "Space Grotesk", "Inter", system-ui, sans-serif`;
      const cx = 256;
      const cy = 256;
      const radius = 178;
      const chars = Array.from(spec.text);
      const step = (Math.PI * 2) / Math.max(1, chars.length);
      for (let i = 0; i < chars.length; i++) {
        const angle = -Math.PI * 0.72 + i * step;
        ctx.save();
        ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(chars[i], 0, 0);
        ctx.restore();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (spec.bgHex) {
      ctx.fillStyle = spec.bgHex;
      ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
    }
    ctx.fillStyle = spec.colorHex || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const weight =
      spec.fontWeight === 'normal' ? '500' : spec.fontWeight === 'semibold' ? '600' : '700';
    const hasSub = Boolean(spec.subtext && spec.subtext.trim());
    ctx.font = `${weight} ${hasSub ? 66 : 82}px "Space Grotesk", "Inter", system-ui, sans-serif`;
    ctx.fillText(spec.text, canvas.width / 2, hasSub ? 76 : canvas.height / 2);
    if (hasSub && spec.subtext) {
      ctx.font = `600 32px "JetBrains Mono", monospace`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(spec.subtext, canvas.width / 2, 138);
      ctx.globalAlpha = 1;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Projects curved decals onto target part meshes using Three.js DecalGeometry with polygonOffset.
 */
function populateProjectedDecalsGroup(
  group: THREE.Group,
  blueprint: MeshBlueprint,
  assembly: BuiltAssembly,
  clippingPlane: THREE.Plane
): void {
  disposeGroupChildren(group);
  if (!Array.isArray(blueprint.decals) || blueprint.decals.length === 0) return;

  assembly.rootGroup.updateMatrixWorld(true);
  const meshById = new Map<string, THREE.Mesh>();
  for (const m of assembly.partMeshes) {
    meshById.set(m.userData.partId as string, m);
  }

  for (const spec of blueprint.decals) {
    const target = meshById.get(spec.targetPartId);
    if (!target || !target.geometry) continue;
    try {
      const pos = new THREE.Vector3(
        spec.positionMm[0] * MM_TO_SCENE,
        spec.positionMm[1] * MM_TO_SCENE + assembly.groundOffsetY,
        spec.positionMm[2] * MM_TO_SCENE
      );
      const orient = new THREE.Euler(
        THREE.MathUtils.degToRad(spec.rotationDeg[0]),
        THREE.MathUtils.degToRad(spec.rotationDeg[1]),
        THREE.MathUtils.degToRad(spec.rotationDeg[2]),
        'XYZ'
      );
      const size = new THREE.Vector3(
        Math.max(0.005, spec.sizeMm[0] * MM_TO_SCENE),
        Math.max(0.005, spec.sizeMm[1] * MM_TO_SCENE),
        Math.max(0.004, spec.sizeMm[2] * MM_TO_SCENE)
      );

      const decalGeo = new DecalGeometry(target, pos, orient, size);
      if (!decalGeo.attributes.position || decalGeo.attributes.position.count === 0) {
        decalGeo.dispose();
        continue;
      }
      const tex = createProjectedDecalTexture(spec);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        opacity: spec.opacity ?? 0.94,
        roughness: 0.35,
        metalness: 0.05,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        clippingPlanes: [clippingPlane],
      });
      const decalMesh = new THREE.Mesh(decalGeo, mat);
      decalMesh.userData.targetPartId = spec.targetPartId;
      decalMesh.renderOrder = 4;
      group.add(decalMesh);
    } catch {
      // Skip invalid decal projections gracefully
    }
  }
}

/**
 * Builds the 3D Center of Gravity crosshair, vertical plumb line, and 2D floor support polygon.
 */
function populateCoGOverlayGroup(
  group: THREE.Group,
  mp: AssemblyMassProperties | undefined,
  spanM: number
): void {
  disposeGroupChildren(group);
  if (!mp) return;

  const cx = mp.centerOfGravityMm[0] * MM_TO_SCENE;
  const cy = mp.centerOfGravityMm[1] * MM_TO_SCENE;
  const cz = mp.centerOfGravityMm[2] * MM_TO_SCENE;
  const floorY = mp.floorYMm * MM_TO_SCENE + 0.0025;

  const statusColor =
    mp.stabilityStatus === 'stable'
      ? 0x10b981
      : mp.stabilityStatus === 'marginal'
        ? 0xf59e0b
        : 0xf43f5e;

  const r = THREE.MathUtils.clamp(spanM * 0.022, 0.012, 0.055);
  const arm = r * 2.8;

  // CoG glowing sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(r, 20, 16),
    new THREE.MeshBasicMaterial({ color: statusColor, depthTest: false })
  );
  sphere.position.set(cx, cy, cz);
  sphere.renderOrder = 30;
  group.add(sphere);

  // 3-axis CoG crosshair
  const crossPts = [
    new THREE.Vector3(cx - arm, cy, cz),
    new THREE.Vector3(cx + arm, cy, cz),
    new THREE.Vector3(cx, cy - arm, cz),
    new THREE.Vector3(cx, cy + arm, cz),
    new THREE.Vector3(cx, cy, cz - arm),
    new THREE.Vector3(cx, cy, cz + arm),
  ];
  const crossGeo = new THREE.BufferGeometry().setFromPoints(crossPts);
  const crossLines = new THREE.LineSegments(
    crossGeo,
    new THREE.LineBasicMaterial({ color: 0x0f172a, depthTest: false })
  );
  crossLines.renderOrder = 31;
  group.add(crossLines);

  // Vertical plumb line down to support polygon
  const plumbGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cx, cy, cz),
    new THREE.Vector3(cx, floorY, cz),
  ]);
  const plumbLine = new THREE.Line(
    plumbGeo,
    new THREE.LineBasicMaterial({ color: statusColor, depthTest: false })
  );
  plumbLine.renderOrder = 28;
  group.add(plumbLine);

  // Floor CoG target ring
  const ringGeo = new THREE.RingGeometry(r * 0.75, r * 1.3, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: statusColor, side: THREE.DoubleSide, depthTest: false })
  );
  ringMesh.position.set(cx, floorY + 0.001, cz);
  ringMesh.renderOrder = 29;
  group.add(ringMesh);

  // 2D Floor Support Polygon (Convex Hull)
  if (mp.supportPolygonXZMm.length >= 3) {
    const shape = new THREE.Shape();
    const hullPts3D: THREE.Vector3[] = [];
    mp.supportPolygonXZMm.forEach(([xMm, zMm], idx) => {
      const x = xMm * MM_TO_SCENE;
      const z = zMm * MM_TO_SCENE;
      if (idx === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
      hullPts3D.push(new THREE.Vector3(x, floorY, z));
    });
    shape.closePath();

    const polyGeo = new THREE.ShapeGeometry(shape);
    polyGeo.rotateX(-Math.PI / 2);
    const polyMesh = new THREE.Mesh(
      polyGeo,
      new THREE.MeshBasicMaterial({
        color: statusColor,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    polyMesh.position.y = floorY;
    polyMesh.renderOrder = 15;
    group.add(polyMesh);

    const outlineGeo = new THREE.BufferGeometry().setFromPoints(hullPts3D);
    const outline = new THREE.LineLoop(
      outlineGeo,
      new THREE.LineBasicMaterial({ color: statusColor, depthTest: false })
    );
    outline.renderOrder = 27;
    group.add(outline);
  }
}

/**
 * Builds translucent ghost swept-volume clearance envelopes across movable kinematic joint travel.
 */
function populateSweptEnvelopesGroup(
  group: THREE.Group,
  assembly: BuiltAssembly
): void {
  disposeGroupChildren(group);
  const movable = assembly.joints.filter((j) => j.jointKind !== 'fixed');
  if (movable.length === 0) return;

  const meshById = new Map<string, THREE.Mesh>();
  for (const m of assembly.partMeshes) {
    meshById.set(m.userData.partId as string, m);
  }

  const samples = [-1, -0.5, 0.5, 1];
  const anchor = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const q = new THREE.Quaternion();

  for (const joint of movable) {
    const minAng = joint.motionLimits?.minAngleDeg ?? (joint.jointKind === 'prismatic' ? 0 : -45);
    const maxAng = joint.motionLimits?.maxAngleDeg ?? (joint.jointKind === 'prismatic' ? 0 : 45);
    const minSl = joint.motionLimits?.minSlideMm ?? (joint.jointKind === 'revolute' ? 0 : -25);
    const maxSl = joint.motionLimits?.maxSlideMm ?? (joint.jointKind === 'revolute' ? 0 : 25);

    anchor.set(
      joint.anchorWorldMm[0] * MM_TO_SCENE,
      joint.anchorWorldMm[1] * MM_TO_SCENE - assembly.groundOffsetY,
      joint.anchorWorldMm[2] * MM_TO_SCENE
    );
    axis.set(joint.axisWorld[0], joint.axisWorld[1], joint.axisWorld[2]).normalize();

    for (const s of samples) {
      const t = (s + 1) * 0.5;
      const angleDeg = minAng + (maxAng - minAng) * t;
      const slideMm = minSl + (maxSl - minSl) * t;
      q.setFromAxisAngle(axis, THREE.MathUtils.degToRad(angleDeg));

      for (const pid of joint.chainPartIds) {
        const srcMesh = meshById.get(pid);
        if (!srcMesh) continue;
        const basePos = (srcMesh.userData.basePosition as THREE.Vector3).clone();
        const baseQuat = (srcMesh.userData.baseQuaternion as THREE.Quaternion | undefined)?.clone() ?? new THREE.Quaternion();

        basePos.sub(anchor).applyQuaternion(q).add(anchor);
        if (Math.abs(slideMm) > 0.05) {
          basePos.addScaledVector(axis, slideMm * MM_TO_SCENE);
        }
        baseQuat.premultiply(q);

        const ghostMat = new THREE.MeshBasicMaterial({
          color: 0x06b6d4,
          transparent: true,
          opacity: 0.13,
          wireframe: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const ghost = new THREE.Mesh(srcMesh.geometry.clone(), ghostMat);
        ghost.position.copy(basePos);
        ghost.quaternion.copy(baseQuat);
        ghost.renderOrder = 10;
        group.add(ghost);
      }
    }
  }
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(
  function Viewport3D(
    {
      blueprint,
      renderMode,
      studioTheme,
      lightingPreset,
      aoEnabled,
      gizmoMode,
      showCoGOverlay,
      showSweptEnvelopes,
      showInstallationOverlay,
      installationOptions,
      simState,
      simBlinkOn,
      kinematicPlaying,
      tessellation,
      explodeFactor,
      sectionPlane,
      caliperActive,
      compareMode,
      compareSplit,
      onCompareSplitChange,
      referenceOverlayOpacity,
      edgeDiffOverlayUrl,
      edgeDiffOverlayOpacity,
      hiddenPartIds,
      selectedPartId,
      highlightedPartIds,
      jointRigValues,
      onSelectPart,
      onHoverPart,
      onTransformPart,
      onMetrologyReady,
      onAuditReady,
      onCaliperChange,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasMountRef = useRef<HTMLDivElement | null>(null);
    const [contextLost, setContextLost] = useState(false);
    const [manifoldReady, setManifoldReady] = useState(() => isManifoldReady());
    const [caliperLabelPos, setCaliperLabelPos] = useState<{
      x: number;
      y: number;
      visible: boolean;
      text: string;
    }>({ x: 0, y: 0, visible: false, text: '' });
    const [draggingSplit, setDraggingSplit] = useState(false);

    // Boot manifold-3d WASM once so csgSolid parts rebuild as true watertight CSG solids
    useEffect(() => {
      let alive = true;
      if (!manifoldReady) {
        ensureManifoldReady().then((ok) => {
          if (alive && ok) setManifoldReady(true);
        });
      }
      return () => {
        alive = false;
      };
    }, [manifoldReady]);

    const lastFramedBlueprintIdRef = useRef<string | null>(null);
    const isDraggingGizmoRef = useRef(false);
    const kinematicPhaseRef = useRef(0);

    // Refs synced with React state so WebGL never tears down on UI updates
    const stateRef = useRef({
      blueprint,
      renderMode,
      studioTheme,
      lightingPreset,
      aoEnabled,
      gizmoMode,
      kinematicPlaying,
      explodeTarget: explodeFactor,
      explodeCurrent: explodeFactor,
      jointRigValues,
      simState,
      sectionPlane,
      caliperActive,
      selectedPartId,
      onSelectPart,
      onHoverPart,
      onTransformPart,
      onCaliperChange,
    });
    stateRef.current = {
      blueprint,
      renderMode,
      studioTheme,
      lightingPreset,
      aoEnabled,
      gizmoMode,
      kinematicPlaying,
      explodeTarget: explodeFactor,
      explodeCurrent: stateRef.current.explodeCurrent,
      jointRigValues,
      simState,
      sectionPlane,
      caliperActive,
      selectedPartId,
      onSelectPart,
      onHoverPart,
      onTransformPart,
      onCaliperChange,
    };

    const engineRef = useRef<{
      renderer: THREE.WebGLRenderer;
      composer: EffectComposer | null;
      gtaoPass: GTAOPass | null;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      transformControls: TransformControls;
      envTexture: THREE.Texture;
      hemiLight: THREE.HemisphereLight;
      keyLight: THREE.DirectionalLight;
      fillLight: THREE.DirectionalLight;
      rimLight: THREE.DirectionalLight;
      isSoftwareGl: boolean;
      assembly: BuiltAssembly | null;
      decalGroup: THREE.Group;
      cogOverlayGroup: THREE.Group;
      sweptEnvelopeGroup: THREE.Group;
      installationOverlayGroup: THREE.Group;
      simOverlayGroup: THREE.Group;
      importedAssetGroup: THREE.Group;
      clippingPlane: THREE.Plane;
      gridHelper: THREE.GridHelper;
      contactShadow: THREE.Mesh;
      shadowCatcher: THREE.Mesh | null;
      sharedMaterials: {
        wireframe: THREE.MeshBasicMaterial;
        normals: THREE.MeshNormalMaterial;
        zebra: THREE.ShaderMaterial;
        xray: THREE.MeshPhysicalMaterial;
      };
      caliperGroup: THREE.Group;
      caliperPinA: THREE.Mesh;
      caliperPinB: THREE.Mesh;
      caliperLine: THREE.Line;
      caliperData: CaliperMeasurement;
      cameraGoal: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null;
      renderFrame: () => void;
      requestRender: () => void;
    } | null>(null);

    const computeCameraPreset = (
      bp: MeshBlueprint,
      preset: CameraPresetId
    ): { pos: THREE.Vector3; target: THREE.Vector3; fov: number } => {
      const eng = engineRef.current;
      let w = bp.envelopeMm.width * MM_TO_SCENE;
      let h = bp.envelopeMm.height * MM_TO_SCENE;
      let d = bp.envelopeMm.depth * MM_TO_SCENE;
      let cx = 0;
      let cy = h * 0.48;
      let cz = 0;

      if (eng?.assembly) {
        _box.setFromObject(eng.assembly.rootGroup);
        if (!_box.isEmpty()) {
          _box.getSize(_size);
          _box.getCenter(_center);
          w = _size.x;
          h = _size.y;
          d = _size.z;
          cx = _center.x;
          cy = _center.y;
          cz = _center.z;
        }
      }

      const span = Math.max(w, h, d, 0.4);
      const dist = span * 1.65;

      switch (preset) {
        case 'photoMatch': {
          const solvedCam = bp.photoMatchCamera?.constellationCamera;
          if (solvedCam) {
            const pose = constellationCameraToThreePose(solvedCam);
            return {
              pos: pose.position,
              target: pose.target,
              fov: pose.fovDeg,
            };
          }
          return {
            pos: new THREE.Vector3(
              bp.photoMatchCamera.positionMm[0] * MM_TO_SCENE,
              bp.photoMatchCamera.positionMm[1] * MM_TO_SCENE,
              bp.photoMatchCamera.positionMm[2] * MM_TO_SCENE
            ),
            target: new THREE.Vector3(
              bp.photoMatchCamera.targetMm[0] * MM_TO_SCENE,
              bp.photoMatchCamera.targetMm[1] * MM_TO_SCENE,
              bp.photoMatchCamera.targetMm[2] * MM_TO_SCENE
            ),
            fov: bp.photoMatchCamera.fov || 32,
          };
        }
        case 'front':
          return {
            pos: new THREE.Vector3(cx, cy + h * 0.04, cz + dist * 1.15),
            target: new THREE.Vector3(cx, cy, cz),
            fov: 32,
          };
        case 'left':
          return {
            pos: new THREE.Vector3(cx - dist * 1.18, cy + h * 0.06, cz + span * 0.06),
            target: new THREE.Vector3(cx, cy, cz),
            fov: 32,
          };
        case 'side':
          return {
            pos: new THREE.Vector3(cx + dist * 1.18, cy + h * 0.06, cz + span * 0.08),
            target: new THREE.Vector3(cx, cy, cz),
            fov: 32,
          };
        case 'top':
          return {
            pos: new THREE.Vector3(cx, cy + dist * 1.35, cz + span * 0.14),
            target: new THREE.Vector3(cx, cy * 0.35, cz),
            fov: 34,
          };
        case 'interior':
          return {
            pos: new THREE.Vector3(cx + w * 0.08, cy + h * 0.06, cz + d * 0.85),
            target: new THREE.Vector3(cx + w * 0.04, cy - h * 0.04, cz + d * 0.08),
            fov: 36,
          };
        case 'iso':
        default:
          return {
            pos: new THREE.Vector3(
              cx + dist * 0.72,
              cy + dist * 0.44,
              cz + dist * 0.92
            ),
            target: new THREE.Vector3(cx, cy, cz),
            fov: 33,
          };
      }
    };

    const clearCaliperInternal = () => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.caliperData = { pointA: null, pointB: null, distanceMm: null, deltaMm: null };
      eng.caliperPinA.visible = false;
      eng.caliperPinB.visible = false;
      eng.caliperLine.visible = false;
      setCaliperLabelPos({ x: 0, y: 0, visible: false, text: '' });
      stateRef.current.onCaliperChange(eng.caliperData);
      eng.requestRender();
    };

    useImperativeHandle(ref, () => ({
      applyCameraPreset(preset: CameraPresetId) {
        const eng = engineRef.current;
        const bp = stateRef.current.blueprint;
        if (!eng || !bp) return;
        const solvedCam = preset === 'photoMatch' ? bp.photoMatchCamera?.constellationCamera : undefined;
        if (solvedCam) {
          const el = eng.renderer.domElement;
          const pose = applyConstellationCameraToThree(
            eng.camera,
            solvedCam,
            el.clientWidth || el.width || 1280,
            el.clientHeight || el.height || 720
          );
          eng.controls.target.copy(pose.target);
          eng.controls.update();
          eng.cameraGoal = null;
          eng.requestRender();
          return;
        }
        eng.camera.clearViewOffset();
        eng.camera.up.set(0, 1, 0);
        eng.cameraGoal = computeCameraPreset(bp, preset);
        eng.requestRender();
      },
      captureFiveAngles(): FiveAngleCapture[] {
        const eng = engineRef.current;
        const bp = stateRef.current.blueprint;
        if (!eng || !bp) return [];

        const savedPos = eng.camera.position.clone();
        const savedTarget = eng.controls.target.clone();
        const savedFov = eng.camera.fov;

        const specs: {
          angle: FiveAngleCapture['angle'];
          label: string;
          presetId: CameraPresetId;
        }[] = [
          { angle: 'photoMatch', label: 'Photo Match (3/4)', presetId: 'photoMatch' },
          { angle: 'front', label: 'Front Elevation (+Z)', presetId: 'front' },
          { angle: 'left', label: 'Left Profile (-X)', presetId: 'left' },
          { angle: 'right', label: 'Right Profile (+X)', presetId: 'side' },
          { angle: 'top', label: 'Top Plan (+Y)', presetId: 'top' },
        ];

        const captures: FiveAngleCapture[] = [];
        try {
          for (const spec of specs) {
            const view = computeCameraPreset(bp, spec.presetId);
            eng.camera.position.copy(view.pos);
            eng.camera.fov = view.fov;
            eng.camera.updateProjectionMatrix();
            eng.camera.lookAt(view.target);
            eng.renderFrame();

            // Downscale cleanly to 640x480 JPEG for crisp contact sheet & fast AI visual audit
            const srcCanvas = eng.renderer.domElement;
            const out = document.createElement('canvas');
            out.width = 640;
            out.height = 480;
            const ctx = out.getContext('2d');
            if (ctx) {
              ctx.fillStyle = stateRef.current.studioTheme === 'dark' ? '#12161d' : '#eceff4';
              ctx.fillRect(0, 0, out.width, out.height);
              const srcAspect = srcCanvas.width / Math.max(1, srcCanvas.height);
              const dstAspect = out.width / out.height;
              let drawW = out.width;
              let drawH = out.height;
              let dx = 0;
              let dy = 0;
              if (srcAspect > dstAspect) {
                drawH = out.width / srcAspect;
                dy = (out.height - drawH) / 2;
              } else {
                drawW = out.height * srcAspect;
                dx = (out.width - drawW) / 2;
              }
              ctx.drawImage(srcCanvas, dx, dy, drawW, drawH);
              captures.push({
                ...spec,
                dataUrl: out.toDataURL('image/jpeg', 0.84),
              });
            } else {
              captures.push({
                ...spec,
                dataUrl: srcCanvas.toDataURL('image/jpeg', 0.84),
              });
            }
          }
        } finally {
          eng.camera.position.copy(savedPos);
          eng.controls.target.copy(savedTarget);
          eng.camera.fov = savedFov;
          eng.camera.updateProjectionMatrix();
          eng.controls.update();
          eng.renderFrame();
          eng.requestRender();
        }
        return captures;
      },
      captureViewportFrame(snapToPhotoMatch = true): string | null {
        const eng = engineRef.current;
        const bp = stateRef.current.blueprint;
        if (!eng || !bp) return null;

        if (snapToPhotoMatch) {
          const solvedCam = bp.photoMatchCamera?.constellationCamera;
          if (solvedCam) {
            const el = eng.renderer.domElement;
            const pose = applyConstellationCameraToThree(
              eng.camera,
              solvedCam,
              el.clientWidth || el.width || 1280,
              el.clientHeight || el.height || 720
            );
            eng.controls.target.copy(pose.target);
            eng.controls.update();
            eng.cameraGoal = null;
          } else {
            const view = computeCameraPreset(bp, 'photoMatch');
            eng.camera.clearViewOffset();
            eng.camera.up.set(0, 1, 0);
            eng.camera.position.copy(view.pos);
            eng.controls.target.copy(view.target);
            eng.camera.fov = view.fov;
            eng.camera.updateProjectionMatrix();
            eng.controls.update();
            eng.cameraGoal = null;
          }
        }
        eng.renderFrame();
        return eng.renderer.domElement.toDataURL('image/png');
      },
      capturePNG(buildRevision?: number): string {
        const eng = engineRef.current;
        if (!eng) {
          throw new Error('3D viewport is not initialized.');
        }
        eng.renderFrame();
        const dataUrl = eng.renderer.domElement.toDataURL('image/png');
        const name = stateRef.current.blueprint?.name || '18d-session';
        const filename = formatExportFilename(name, 'viewport.png', buildRevision);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return filename;
      },
      clearCaliper() {
        clearCaliperInternal();
      },
    }));

    // 1. Initialize WebGL scene ONCE inside isolated mount ref
    useEffect(() => {
      const mount = canvasMountRef.current;
      if (!mount) return;

      const isSoftwareGl = detectSoftwareGl();
      const width = mount.clientWidth || window.innerWidth;
      const height = mount.clientHeight || window.innerHeight;

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.localClippingEnabled = true;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#eceff4');
      scene.fog = new THREE.Fog('#eceff4', 14, 34);

      // Custom HDR Studio Softbox IBL reflection environment (zero external dependencies)
      const envTex = createStudioSoftboxEnvironment(renderer, stateRef.current.lightingPreset);
      scene.environment = envTex;
      scene.environmentIntensity = 1.12;

      const camera = new THREE.PerspectiveCamera(31, width / height, 0.05, 80);
      camera.position.set(-2.18, 1.52, 5.65);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.maxPolarAngle = Math.PI * 0.495;
      controls.minDistance = 0.35;
      controls.maxDistance = 24;
      controls.target.set(-0.06, 1.34, 0.14);
      controls.update();

      // Interactive 3D TransformControls Gizmo (Three r187 requires adding getHelper() to scene)
      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.setSize(0.75);
      const gizmoHelper = transformControls.getHelper();
      scene.add(gizmoHelper);

      const decalGroup = new THREE.Group();
      decalGroup.name = 'ProjectedDecals';
      scene.add(decalGroup);

      const cogOverlayGroup = new THREE.Group();
      cogOverlayGroup.name = 'CoGStabilityOverlay';
      scene.add(cogOverlayGroup);

      const sweptEnvelopeGroup = new THREE.Group();
      sweptEnvelopeGroup.name = 'SweptVolumeEnvelopes';
      scene.add(sweptEnvelopeGroup);

      const installationOverlayGroup = new THREE.Group();
      installationOverlayGroup.name = 'InstallationEnvelopeOverlay';
      scene.add(installationOverlayGroup);

      const simOverlayGroup = new THREE.Group();
      simOverlayGroup.name = 'MachineSimulationOverlay';
      scene.add(simOverlayGroup);

      const importedAssetGroup = new THREE.Group();
      importedAssetGroup.name = 'Imported3DAssets';
      scene.add(importedAssetGroup);

      // Balanced 3-point warm/cool industrial studio lighting rig
      const hemiLight = new THREE.HemisphereLight(0xf6f9ff, 0x8b95a5, 0.72);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.9);
      keyLight.position.set(-4.5, 7.8, 6.0);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.camera.left = -4.2;
        keyLight.shadow.camera.right = 4.2;
        keyLight.shadow.camera.top = 4.2;
        keyLight.shadow.camera.bottom = -4.2;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 22;
        keyLight.shadow.bias = -0.0004;
        keyLight.shadow.normalBias = 0.018;
      }
      scene.add(keyLight);
      scene.add(keyLight.target);

      const fillLight = new THREE.DirectionalLight(0xd9e8fc, 0.78);
      fillLight.position.set(5.6, 4.2, 3.8);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xffffff, 1.05);
      rimLight.position.set(1.6, 5.4, -6.5);
      scene.add(rimLight);

      // Subtle interior fill point light so recessed enclosures & gratings retain depth
      const chamberLight = new THREE.PointLight(0xf8fbff, 1.45, 5.5, 1.4);
      chamberLight.position.set(0.12, 1.85, 0.45);
      scene.add(chamberLight);

      // Ground plane: calibrated millimeter metrology grid + soft radial contact shadow + real shadow catcher
      const gridHelper = new THREE.GridHelper(16, 32, 0xcbd5e1, 0xdce2ea);
      gridHelper.position.y = -0.003;
      scene.add(gridHelper);

      const shadowGeo = new THREE.PlaneGeometry(5.2, 4.8);
      shadowGeo.rotateX(-Math.PI / 2);
      const shadowTex = createContactShadowTexture();
      const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: isSoftwareGl ? 0.52 : 0.32,
      });
      const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
      contactShadow.position.y = -0.0014;
      scene.add(contactShadow);

      let shadowCatcher: THREE.Mesh | null = null;
      let shadowCatcherGeo: THREE.PlaneGeometry | null = null;
      let shadowCatcherMat: THREE.ShadowMaterial | null = null;
      if (!isSoftwareGl) {
        shadowCatcherGeo = new THREE.PlaneGeometry(24, 24);
        shadowCatcherGeo.rotateX(-Math.PI / 2);
        shadowCatcherMat = new THREE.ShadowMaterial({
          color: 0x0f172a,
          opacity: 0.22,
          depthWrite: false,
        });
        shadowCatcher = new THREE.Mesh(shadowCatcherGeo, shadowCatcherMat);
        shadowCatcher.position.y = -0.0004;
        shadowCatcher.receiveShadow = true;
        scene.add(shadowCatcher);
      }

      // Real-Time Ground-Truth Ambient Occlusion (GTAOPass) post-processing pipeline on GPU devices
      let composer: EffectComposer | null = null;
      let gtaoPass: GTAOPass | null = null;
      if (!isSoftwareGl) {
        try {
          composer = new EffectComposer(renderer);
          composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          composer.setSize(width, height);

          const renderPass = new RenderPass(scene, camera);
          composer.addPass(renderPass);

          gtaoPass = new GTAOPass(scene, camera, width, height);
          gtaoPass.output = GTAOPass.OUTPUT.Default;
          gtaoPass.blendIntensity = 0.52;
          gtaoPass.updateGtaoMaterial({
            radius: 0.22,
            distanceExponent: 1.4,
            thickness: 0.85,
            scale: 1.0,
            samples: 16,
            distanceFallOff: 1.0,
          });
          gtaoPass.updatePdMaterial({
            lumaPhi: 10,
            depthPhi: 2,
            normalPhi: 3,
            radius: 4,
            radiusExponent: 2,
            rings: 2,
            samples: 16,
          });
          composer.addPass(gtaoPass);

          const outputPass = new OutputPass();
          composer.addPass(outputPass);
        } catch {
          composer?.dispose();
          composer = null;
          gtaoPass = null;
        }
      }

      // Shared clipping plane & inspection materials
      const clippingPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100);
      const sharedMaterials = {
        wireframe: new THREE.MeshBasicMaterial({
          color: 0x0f172a,
          wireframe: true,
          clippingPlanes: [clippingPlane],
        }),
        normals: new THREE.MeshNormalMaterial({
          clippingPlanes: [clippingPlane],
          side: THREE.DoubleSide,
        }),
        zebra: createZebraCurvatureMaterial(),
        xray: new THREE.MeshPhysicalMaterial({
          color: 0x3b82f6,
          metalness: 0.1,
          roughness: 0.2,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          clippingPlanes: [clippingPlane],
          side: THREE.DoubleSide,
        }),
      };
      sharedMaterials.zebra.clippingPlanes = [clippingPlane];

      // Caliper 3D pins + connector line
      const caliperGroup = new THREE.Group();
      const pinGeo = new THREE.SphereGeometry(0.032, 16, 16);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xe11d48, depthTest: false });
      const caliperPinA = new THREE.Mesh(pinGeo, pinMat);
      const caliperPinB = new THREE.Mesh(pinGeo, pinMat);
      caliperPinA.renderOrder = 20;
      caliperPinB.renderOrder = 20;
      caliperPinA.visible = false;
      caliperPinB.visible = false;

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xe11d48,
        depthTest: false,
      });
      const caliperLine = new THREE.Line(lineGeo, lineMat);
      caliperLine.renderOrder = 19;
      caliperLine.visible = false;
      caliperGroup.add(caliperPinA, caliperPinB, caliperLine);
      scene.add(caliperGroup);

      // On-demand coalesced rendering + software-GL fenceSync pacing
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let disposed = false;
      let lastTime = performance.now();

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || typeof gl.fenceSync !== 'function') {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      const updateCaliperScreenLabel = () => {
        const eng = engineRef.current;
        if (!eng || !eng.caliperData.pointA || !eng.caliperData.pointB || eng.caliperData.distanceMm === null) {
          return;
        }
        _vA.set(
          eng.caliperData.pointA.positionMm[0] * MM_TO_SCENE,
          eng.caliperData.pointA.positionMm[1] * MM_TO_SCENE,
          eng.caliperData.pointA.positionMm[2] * MM_TO_SCENE
        );
        _vB.set(
          eng.caliperData.pointB.positionMm[0] * MM_TO_SCENE,
          eng.caliperData.pointB.positionMm[1] * MM_TO_SCENE,
          eng.caliperData.pointB.positionMm[2] * MM_TO_SCENE
        );
        _vMid.addVectors(_vA, _vB).multiplyScalar(0.5);
        _vMid.project(camera);

        const rect = renderer.domElement.getBoundingClientRect();
        const sx = ((_vMid.x + 1) / 2) * rect.width;
        const sy = ((-_vMid.y + 1) / 2) * rect.height;
        setCaliperLabelPos({
          x: sx,
          y: sy,
          visible: _vMid.z < 1,
          text: `${eng.caliperData.distanceMm.toFixed(2)} mm`,
        });
      };

      const renderFrame = () => {
        const mode = stateRef.current.renderMode;
        const usePostAo =
          !isSoftwareGl &&
          stateRef.current.aoEnabled &&
          Boolean(composer) &&
          (mode === 'shaded' || mode === 'cadEdges');
        if (usePostAo && composer) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }
      };

      const requestRender = () => {
        if (disposed) return;
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame(() => {
          if (disposed) return;
          renderDirty = false;
          const now = performance.now();
          const dt = Math.min(0.08, Math.max(0.001, (now - lastTime) / 1000));
          lastTime = now;

          let needsMoreFrames = false;
          const eng = engineRef.current;

          // Smooth damped camera preset transitions
          if (eng?.cameraGoal) {
            const g = eng.cameraGoal;
            const lambda = isSoftwareGl ? 18 : 7.5;
            camera.position.x = THREE.MathUtils.damp(camera.position.x, g.pos.x, lambda, dt);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, g.pos.y, lambda, dt);
            camera.position.z = THREE.MathUtils.damp(camera.position.z, g.pos.z, lambda, dt);
            controls.target.x = THREE.MathUtils.damp(controls.target.x, g.target.x, lambda, dt);
            controls.target.y = THREE.MathUtils.damp(controls.target.y, g.target.y, lambda, dt);
            controls.target.z = THREE.MathUtils.damp(controls.target.z, g.target.z, lambda, dt);
            camera.fov = THREE.MathUtils.damp(camera.fov, g.fov, lambda, dt);
            camera.updateProjectionMatrix();

            const posDone = camera.position.distanceTo(g.pos) < 0.008;
            const tgtDone = controls.target.distanceTo(g.target) < 0.008;
            if (posDone && tgtDone) {
              camera.position.copy(g.pos);
              controls.target.copy(g.target);
              camera.fov = g.fov;
              camera.updateProjectionMatrix();
              eng.cameraGoal = null;
            } else {
              needsMoreFrames = true;
            }
          }

          // Apply kinematic joint rig (plus smooth live animation loop) + smooth damped exploded-view separation
          const applyPose = (assembly: BuiltAssembly, f: number, animPhase: number | null) => {
            if (isDraggingGizmoRef.current) return;
            const rigMap = stateRef.current.jointRigValues;
            const meshById = new Map<string, THREE.Mesh>();
            for (const mesh of assembly.partMeshes) {
              const base = mesh.userData.basePosition as THREE.Vector3;
              const baseQ = mesh.userData.baseQuaternion as THREE.Quaternion | undefined;
              mesh.position.copy(base);
              if (baseQ) {
                mesh.quaternion.copy(baseQ);
              }
              meshById.set(mesh.userData.partId as string, mesh);
            }

            if (assembly.joints.length > 0 && (rigMap || animPhase !== null)) {
              const effectiveRig = new Map<string, { angleDeg: number; slideMm: number }>();
              for (const joint of assembly.joints) {
                let a = rigMap?.[joint.id]?.angleDeg ?? 0;
                let s = rigMap?.[joint.id]?.slideMm ?? 0;

                if (animPhase !== null && joint.jointKind !== 'fixed') {
                  const wave = Math.sin(animPhase);
                  if (joint.jointKind === 'revolute' || joint.jointKind === 'cylindrical') {
                    const minA = joint.motionLimits?.minAngleDeg ?? -35;
                    const maxA = joint.motionLimits?.maxAngleDeg ?? 35;
                    a = (minA + maxA) * 0.5 + wave * ((maxA - minA) * 0.5);
                  }
                  if (joint.jointKind === 'prismatic' || joint.jointKind === 'cylindrical') {
                    const minS = joint.motionLimits?.minSlideMm ?? -20;
                    const maxS = joint.motionLimits?.maxSlideMm ?? 20;
                    s = (minS + maxS) * 0.5 + wave * ((maxS - minS) * 0.5);
                  }
                }

                if (Math.abs(a) < 0.01 && Math.abs(s) < 0.01) continue;
                const cur = effectiveRig.get(joint.id) ?? { angleDeg: 0, slideMm: 0 };
                cur.angleDeg += a;
                cur.slideMm += s;
                effectiveRig.set(joint.id, cur);

                if (joint.coupledTargets) {
                  for (const ct of joint.coupledTargets) {
                    if (!ct.targetJointId) continue;
                    const tCur = effectiveRig.get(ct.targetJointId) ?? { angleDeg: 0, slideMm: 0 };
                    tCur.angleDeg += a * ct.ratio;
                    tCur.slideMm += s * ct.ratio;
                    effectiveRig.set(ct.targetJointId, tCur);
                  }
                }
              }

              for (const joint of assembly.joints) {
                const val = effectiveRig.get(joint.id);
                if (!val) continue;
                const angleDeg = val.angleDeg;
                const slideMm = val.slideMm;
                if (Math.abs(angleDeg) < 0.01 && Math.abs(slideMm) < 0.01) continue;

                _rigAnchor.set(
                  joint.anchorWorldMm[0] * MM_TO_SCENE,
                  joint.anchorWorldMm[1] * MM_TO_SCENE - assembly.groundOffsetY,
                  joint.anchorWorldMm[2] * MM_TO_SCENE
                );
                _rigAxis.set(
                  joint.axisWorld[0],
                  joint.axisWorld[1],
                  joint.axisWorld[2]
                ).normalize();
                _rigQuat.setFromAxisAngle(_rigAxis, THREE.MathUtils.degToRad(angleDeg));
                const slideM = slideMm * MM_TO_SCENE;

                for (const pid of joint.chainPartIds) {
                  const m = meshById.get(pid);
                  if (!m) continue;
                  m.position.sub(_rigAnchor).applyQuaternion(_rigQuat).add(_rigAnchor);
                  if (Math.abs(slideM) > 1e-6) {
                    m.position.addScaledVector(_rigAxis, slideM);
                  }
                  m.quaternion.premultiply(_rigQuat);
                }
              }
            }

            if (f > 0.0005) {
              for (const mesh of assembly.partMeshes) {
                const off = mesh.userData.explodeOffset as THREE.Vector3;
                mesh.position.x += off.x * f;
                mesh.position.y += off.y * f;
                mesh.position.z += off.z * f;
              }
            }

            // Apply live machine simulation axis translations (gantry / carriage / nozzle + attached decals + flexible hoses)
            const activeSim = stateRef.current.simState;
            const simSpec = stateRef.current.blueprint?.simulation;
            const replacedHoseIds = new Set(
              activeSim && simSpec?.flexibleHoses ? simSpec.flexibleHoses.map((h) => h.partId) : []
            );
            const perPart = new Map<string, [number, number, number]>();
            if (activeSim && simSpec) {
              for (const ax of simSpec.axes) {
                const valMm = activeSim.axisOffsetsMm[ax.id] ?? 0;
                if (Math.abs(valMm) < 1e-4) continue;
                for (const pid of ax.partIds) {
                  const vec = perPart.get(pid) || [0, 0, 0];
                  if (ax.motionAxis === 'x') vec[0] += valMm;
                  else if (ax.motionAxis === 'y') vec[1] += valMm;
                  else if (ax.motionAxis === 'z') vec[2] += valMm;
                  perPart.set(pid, vec);
                }
              }
            }
            for (const mesh of assembly.partMeshes) {
              const pid = String(mesh.userData.partId || '');
              if (replacedHoseIds.has(pid)) {
                mesh.visible = false;
              } else if (mesh.userData.hiddenBySimHose) {
                mesh.visible = !hiddenPartIds.has(pid);
              }
              mesh.userData.hiddenBySimHose = replacedHoseIds.has(pid);
              const delta = perPart.get(pid);
              if (delta) {
                mesh.position.x += delta[0] * MM_TO_SCENE;
                mesh.position.y += delta[1] * MM_TO_SCENE;
                mesh.position.z += delta[2] * MM_TO_SCENE;
              }
            }
            // Keep projected decals synced with their moving host parts (e.g. gantry bridge branding)
            for (const child of decalGroup.children) {
              const targetId = String(child.userData?.targetPartId || '');
              const delta = perPart.get(targetId);
              if (delta) {
                child.position.set(
                  delta[0] * MM_TO_SCENE,
                  delta[1] * MM_TO_SCENE,
                  delta[2] * MM_TO_SCENE
                );
              } else {
                child.position.set(0, 0, 0);
              }
            }
          };

          const expDiff = Math.abs(stateRef.current.explodeTarget - stateRef.current.explodeCurrent);
          if (eng?.assembly) {
            if (expDiff > 0.001) {
              stateRef.current.explodeCurrent = isSoftwareGl
                ? stateRef.current.explodeTarget
                : THREE.MathUtils.damp(
                    stateRef.current.explodeCurrent,
                    stateRef.current.explodeTarget,
                    8.5,
                    dt
                  );
              if (Math.abs(stateRef.current.explodeTarget - stateRef.current.explodeCurrent) > 0.001) {
                needsMoreFrames = true;
              }
            }
            let animPhase: number | null = null;
            if (stateRef.current.kinematicPlaying && eng.assembly.joints.some((j) => j.jointKind !== 'fixed')) {
              kinematicPhaseRef.current += dt * 1.9;
              animPhase = kinematicPhaseRef.current;
              needsMoreFrames = true;
            }
            applyPose(eng.assembly, stateRef.current.explodeCurrent, animPhase);
          }

          const controlsMoved = controls.update();
          if (controlsMoved && !isSoftwareGl) {
            needsMoreFrames = true;
          }

          renderFrame();
          updateCaliperScreenLabel();

          const done = () => {
            renderBusy = false;
            if (renderDirty || needsMoreFrames) {
              requestRender();
            }
          };

          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      };

      // Cancel camera preset transition immediately if user grabs orbit controls
      controls.addEventListener('start', () => {
        if (engineRef.current) {
          engineRef.current.cameraGoal = null;
          engineRef.current.camera.clearViewOffset();
          engineRef.current.camera.up.set(0, 1, 0);
        }
      });
      controls.addEventListener('change', () => {
        requestRender();
      });

      // Wire TransformControls drag lifecycle (suspend OrbitControls during gizmo drag & commit exact mm/deg on release)
      transformControls.addEventListener('dragging-changed', (event: any) => {
        const dragging = Boolean(event.value);
        isDraggingGizmoRef.current = dragging;
        controls.enabled = !dragging;
        if (!dragging) {
          const obj = transformControls.object as THREE.Mesh | undefined;
          const eng = engineRef.current;
          if (obj && eng?.assembly && obj.userData?.partId) {
            const pid = obj.userData.partId as string;
            const posMm: [number, number, number] = [
              Number((obj.position.x / MM_TO_SCENE).toFixed(1)),
              Number((obj.position.y / MM_TO_SCENE).toFixed(1)),
              Number((obj.position.z / MM_TO_SCENE).toFixed(1)),
            ];
            const eul = new THREE.Euler().setFromQuaternion(obj.quaternion, 'YXZ');
            const rotDeg: [number, number, number] = [
              Number(THREE.MathUtils.radToDeg(eul.x).toFixed(1)),
              Number(THREE.MathUtils.radToDeg(eul.y).toFixed(1)),
              Number(THREE.MathUtils.radToDeg(eul.z).toFixed(1)),
            ];
            stateRef.current.onTransformPart?.(pid, posMm, rotDeg);
          }
        }
        requestRender();
      });
      transformControls.addEventListener('objectChange', () => {
        requestRender();
      });

      // Raycasting for part hover, selection, and caliper measurement
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let pointerDownPos = { x: 0, y: 0 };
      let lastHoverCheck = 0;

      const getIntersections = (clientX: number, clientY: number) => {
        const eng = engineRef.current;
        if (!eng?.assembly) return [];
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const visibleMeshes = eng.assembly.partMeshes.filter((m) => m.visible);
        return raycaster.intersectObjects(visibleMeshes, false);
      };

      const onPointerDown = (e: PointerEvent) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
      };

      const onPointerMove = (e: PointerEvent) => {
        const now = performance.now();
        if (now - lastHoverCheck < 55) return;
        lastHoverCheck = now;
        const hits = getIntersections(e.clientX, e.clientY);
        if (hits.length > 0) {
          const id = hits[0].object.userData.partId as string;
          renderer.domElement.style.cursor = stateRef.current.caliperActive
            ? 'crosshair'
            : 'pointer';
          stateRef.current.onHoverPart(id);
        } else {
          renderer.domElement.style.cursor = stateRef.current.caliperActive
            ? 'crosshair'
            : 'grab';
          stateRef.current.onHoverPart(null);
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        const moveDist = Math.hypot(
          e.clientX - pointerDownPos.x,
          e.clientY - pointerDownPos.y
        );
        if (moveDist > 6) return; // Ignore orbit drags

        const eng = engineRef.current;
        if (!eng) return;

        const hits = getIntersections(e.clientX, e.clientY);

        if (stateRef.current.caliperActive) {
          if (hits.length === 0) return;
          const hit = hits[0];
          const ptMm: [number, number, number] = [
            Math.round(hit.point.x * 100000) / 100,
            Math.round(hit.point.y * 100000) / 100,
            Math.round(hit.point.z * 100000) / 100,
          ];
          const partName = String(hit.object.userData.partName || 'Surface');

          if (!eng.caliperData.pointA || (eng.caliperData.pointA && eng.caliperData.pointB)) {
            eng.caliperData = {
              pointA: { positionMm: ptMm, partName },
              pointB: null,
              distanceMm: null,
              deltaMm: null,
            };
            eng.caliperPinA.position.copy(hit.point);
            eng.caliperPinA.visible = true;
            eng.caliperPinB.visible = false;
            eng.caliperLine.visible = false;
            setCaliperLabelPos({ x: 0, y: 0, visible: false, text: '' });
          } else {
            const pA = eng.caliperData.pointA.positionMm;
            const dx = ptMm[0] - pA[0];
            const dy = ptMm[1] - pA[1];
            const dz = ptMm[2] - pA[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            eng.caliperData = {
              pointA: eng.caliperData.pointA,
              pointB: { positionMm: ptMm, partName },
              distanceMm: Math.round(dist * 100) / 100,
              deltaMm: [
                Math.round(Math.abs(dx) * 100) / 100,
                Math.round(Math.abs(dy) * 100) / 100,
                Math.round(Math.abs(dz) * 100) / 100,
              ],
            };
            eng.caliperPinB.position.copy(hit.point);
            eng.caliperPinB.visible = true;
            const posAttr = eng.caliperLine.geometry.attributes
              .position as THREE.BufferAttribute;
            posAttr.setXYZ(0, eng.caliperPinA.position.x, eng.caliperPinA.position.y, eng.caliperPinA.position.z);
            posAttr.setXYZ(1, eng.caliperPinB.position.x, eng.caliperPinB.position.y, eng.caliperPinB.position.z);
            posAttr.needsUpdate = true;
            eng.caliperLine.visible = true;
          }
          stateRef.current.onCaliperChange({ ...eng.caliperData });
          requestRender();
          return;
        }

        if (hits.length > 0) {
          const partId = hits[0].object.userData.partId as string;
          stateRef.current.onSelectPart(
            stateRef.current.selectedPartId === partId ? null : partId
          );
        } else {
          stateRef.current.onSelectPart(null);
        }
      };

      const onContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const onContextRestored = () => {
        setContextLost(false);
        requestRender();
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

      const resizeObserver = new ResizeObserver(() => {
        if (!mount) return;
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        if (w <= 0 || h <= 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (composer) {
          composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          composer.setSize(w, h);
        }
        requestRender();
      });
      resizeObserver.observe(mount);

      engineRef.current = {
        renderer,
        composer,
        gtaoPass,
        scene,
        camera,
        controls,
        transformControls,
        envTexture: envTex,
        hemiLight,
        keyLight,
        fillLight,
        rimLight,
        isSoftwareGl,
        assembly: null,
        decalGroup,
        cogOverlayGroup,
        sweptEnvelopeGroup,
        installationOverlayGroup,
        simOverlayGroup,
        importedAssetGroup,
        clippingPlane,
        gridHelper,
        contactShadow,
        shadowCatcher,
        sharedMaterials,
        caliperGroup,
        caliperPinA,
        caliperPinB,
        caliperLine,
        caliperData: { pointA: null, pointB: null, distanceMm: null, deltaMm: null },
        cameraGoal: null,
        renderFrame,
        requestRender,
      };

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
        transformControls.detach();
        transformControls.dispose();
        controls.dispose();
        disposeGroupChildren(decalGroup);
        disposeGroupChildren(cogOverlayGroup);
        disposeGroupChildren(sweptEnvelopeGroup);
        disposeGroupChildren(installationOverlayGroup);
        disposeGroupChildren(simOverlayGroup);
        disposeGroupChildren(importedAssetGroup);
        disposeAssembly(engineRef.current?.assembly || null);
        gtaoPass?.dispose();
        composer?.dispose();
        engineRef.current?.envTexture.dispose();
        shadowGeo.dispose();
        shadowTex.dispose();
        shadowMat.dispose();
        shadowCatcherGeo?.dispose();
        shadowCatcherMat?.dispose();
        pinGeo.dispose();
        pinMat.dispose();
        lineGeo.dispose();
        lineMat.dispose();
        Object.values(sharedMaterials).forEach((m) => m.dispose());
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
        engineRef.current = null;
      };
    }, []);

    // 2. Rebuild or unload 3D mesh assembly when blueprint or tessellation changes
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (eng.assembly) {
        eng.transformControls.detach();
        disposeGroupChildren(eng.decalGroup);
        disposeGroupChildren(eng.cogOverlayGroup);
        disposeGroupChildren(eng.sweptEnvelopeGroup);
        disposeGroupChildren(eng.installationOverlayGroup);
        disposeGroupChildren(eng.simOverlayGroup);
        disposeGroupChildren(eng.importedAssetGroup);
        eng.scene.remove(eng.assembly.rootGroup);
        disposeAssembly(eng.assembly);
        eng.assembly = null;
      }

      stateRef.current.explodeCurrent = 0;

      if (!blueprint) {
        eng.contactShadow.visible = false;
        onMetrologyReady(null);
        onAuditReady(null);
        clearCaliperInternal();
        eng.camera.position.set(3.2, 2.2, 4.4);
        eng.controls.target.set(0, 0.7, 0);
        eng.camera.fov = 34;
        eng.camera.updateProjectionMatrix();
        eng.controls.update();
        eng.cameraGoal = null;
        eng.requestRender();
        return;
      }

      eng.contactShadow.visible = true;
      const maxAniso = eng.renderer.capabilities.getMaxAnisotropy();
      const built = buildBlueprintAssembly(
        blueprint,
        tessellation,
        maxAniso,
        eng.isSoftwareGl,
        [eng.clippingPlane],
        hiddenPartIds,
        () => eng.requestRender()
      );
      eng.assembly = built;
      eng.scene.add(built.rootGroup);

      // Project curved-surface decals onto target part meshes via DecalGeometry
      populateProjectedDecalsGroup(eng.decalGroup, blueprint, built, eng.clippingPlane);

      // Fit contact shadow & directional shadow camera frustum tightly to assembly bounds
      _box.setFromObject(built.rootGroup);
      if (!_box.isEmpty()) {
        _box.getSize(_size);
        _box.getCenter(_center);
        const footprint = Math.max(_size.x, _size.z, 0.4);
        eng.contactShadow.position.set(_center.x, -0.0014, _center.z);
        eng.contactShadow.scale.set(footprint * 0.36, 1, footprint * 0.36);

        if (!eng.isSoftwareGl) {
          const halfSpan = Math.max(_size.x, _size.y, _size.z, 0.5) * 0.85;
          eng.keyLight.target.position.set(_center.x, _center.y * 0.4, _center.z);
          eng.keyLight.position.set(
            _center.x - halfSpan * 1.45,
            _center.y + halfSpan * 2.45,
            _center.z + halfSpan * 1.9
          );
          eng.keyLight.shadow.camera.left = -halfSpan * 1.25;
          eng.keyLight.shadow.camera.right = halfSpan * 1.25;
          eng.keyLight.shadow.camera.top = halfSpan * 1.25;
          eng.keyLight.shadow.camera.bottom = -halfSpan * 1.25;
          eng.keyLight.shadow.camera.near = Math.max(0.2, halfSpan * 0.35);
          eng.keyLight.shadow.camera.far = halfSpan * 7.5;
          eng.keyLight.shadow.camera.updateProjectionMatrix();
          if (eng.gtaoPass) {
            // Calibrate GTAO world-space radius to assembly scale (tighter on handheld tools, wider on platforms)
            const aoRadius = THREE.MathUtils.clamp(halfSpan * 0.11, 0.04, 0.28);
            eng.gtaoPass.updateGtaoMaterial({ radius: aoRadius });
          }
        }
      }

      if (!eng.isSoftwareGl) {
        eng.renderer.compile(eng.scene, eng.camera);
      }

      onMetrologyReady(built.metrology);
      onAuditReady(built.audit);
      clearCaliperInternal();

      // Only auto-frame camera when switching to a different blueprint id, preserving user orbit during live edits
      if (lastFramedBlueprintIdRef.current !== blueprint.id) {
        lastFramedBlueprintIdRef.current = blueprint.id;
        const camGoal = computeCameraPreset(blueprint, 'photoMatch');
        eng.camera.position.copy(camGoal.pos);
        eng.controls.target.copy(camGoal.target);
        eng.camera.fov = camGoal.fov;
        eng.camera.updateProjectionMatrix();
        eng.controls.update();
        eng.cameraGoal = null;
      }

      eng.requestRender();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blueprint, tessellation, manifoldReady]);

    // 3. Apply part visibility, selection & audit highlights without rebuilding geometry
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng?.assembly || !blueprint) return;

      const highlightSet = new Set(highlightedPartIds);

      for (const mesh of eng.assembly.partMeshes) {
        const pid = mesh.userData.partId as string;
        mesh.visible = !hiddenPartIds.has(pid);

        const origMat = mesh.userData.originalMaterial as THREE.MeshPhysicalMaterial;
        const isSelected = pid === selectedPartId;
        const isHighlighted = highlightSet.has(pid);
        if (origMat && renderMode !== 'wireframe' && renderMode !== 'normals' && renderMode !== 'zebra' && renderMode !== 'xray') {
          if (isHighlighted && !isSelected) {
            origMat.emissive.set('#ea580c');
            origMat.emissiveIntensity = 0.36;
          } else if (isSelected) {
            origMat.emissive.set('#2563eb');
            origMat.emissiveIntensity = 0.28;
          } else {
            const spec = blueprint.parts.find((p) => p.id === pid)?.material;
            origMat.emissive.set(spec?.emissiveHex || '#000000');
            origMat.emissiveIntensity = spec?.emissiveIntensity ?? 0;
          }
        }
      }
      eng.requestRender();
    }, [hiddenPartIds, selectedPartId, highlightedPartIds, renderMode, blueprint, manifoldReady]);

    // 4. Apply render mode & studio theme
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      const bgHex = studioTheme === 'dark' ? '#12161d' : '#eceff4';
      eng.scene.background = new THREE.Color(bgHex);
      eng.scene.fog = new THREE.Fog(bgHex, 14, 34);
      eng.scene.environmentIntensity = studioTheme === 'dark' ? 0.96 : 1.12;
      if (eng.shadowCatcher) {
        const scMat = eng.shadowCatcher.material as THREE.ShadowMaterial;
        scMat.opacity = studioTheme === 'dark' ? 0.36 : 0.22;
      }
      const gridMat = eng.gridHelper.material as THREE.Material | THREE.Material[];
      if (Array.isArray(gridMat)) {
        gridMat.forEach((m: any) => m.color?.set(studioTheme === 'dark' ? '#252d3a' : '#cfd7e3'));
      } else if ((gridMat as any).color) {
        (gridMat as any).color.set(studioTheme === 'dark' ? '#252d3a' : '#cfd7e3');
      }

      eng.sharedMaterials.wireframe.color.set(studioTheme === 'dark' ? '#e2e8f0' : '#0f172a');

      if (eng.assembly) {
        eng.assembly.partMeshes.forEach((mesh, i) => {
          const edge = eng.assembly!.edgeLines[i];
          const edgeMat = edge.material as THREE.LineBasicMaterial;
          edgeMat.color.set(studioTheme === 'dark' ? '#e2e8f0' : '#0f172a');

          switch (renderMode) {
            case 'wireframe':
              mesh.material = eng.sharedMaterials.wireframe;
              edge.visible = false;
              break;
            case 'normals':
              mesh.material = eng.sharedMaterials.normals;
              edge.visible = false;
              break;
            case 'zebra':
              mesh.material = eng.sharedMaterials.zebra;
              edge.visible = false;
              break;
            case 'xray':
              mesh.material = eng.sharedMaterials.xray;
              edge.visible = true;
              edgeMat.opacity = 0.35;
              break;
            case 'cadEdges':
              mesh.material = mesh.userData.originalMaterial;
              edge.visible = true;
              edgeMat.opacity = 0.42;
              break;
            case 'shaded':
            default:
              mesh.material = mesh.userData.originalMaterial;
              edge.visible = false;
              break;
          }
        });
      }

      eng.requestRender();
    }, [renderMode, studioTheme, blueprint, tessellation, manifoldReady]);

    // 5. Apply exploded factor, kinematic rig & live kinematic playback
    useEffect(() => {
      stateRef.current.explodeTarget = explodeFactor;
      stateRef.current.jointRigValues = jointRigValues;
      stateRef.current.kinematicPlaying = kinematicPlaying;
      engineRef.current?.requestRender();
    }, [explodeFactor, jointRigValues, kinematicPlaying]);

    // 5B. Switchable Studio HDRI Lighting Rigs & Contact AO (GTAO) toggle
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      const nextEnv = createStudioSoftboxEnvironment(eng.renderer, lightingPreset);
      const prevEnv = eng.envTexture;
      eng.scene.environment = nextEnv;
      eng.envTexture = nextEnv;
      prevEnv.dispose();

      if (lightingPreset === 'darkRim') {
        eng.keyLight.color.set('#fff0db');
        eng.keyLight.intensity = 1.65;
        eng.fillLight.color.set('#9ec5ff');
        eng.fillLight.intensity = 0.55;
        eng.rimLight.color.set('#ffffff');
        eng.rimLight.intensity = 1.95;
        eng.hemiLight.intensity = 0.42;
        eng.renderer.toneMappingExposure = 1.12;
      } else if (lightingPreset === 'factoryFloor') {
        eng.keyLight.color.set('#ffebd1');
        eng.keyLight.intensity = 2.05;
        eng.fillLight.color.set('#d2e2f7');
        eng.fillLight.intensity = 0.75;
        eng.rimLight.color.set('#eef5ff');
        eng.rimLight.intensity = 0.9;
        eng.hemiLight.intensity = 0.78;
        eng.renderer.toneMappingExposure = 1.06;
      } else if (lightingPreset === 'showroom') {
        eng.keyLight.color.set('#fffaf2');
        eng.keyLight.intensity = 2.2;
        eng.fillLight.color.set('#e8f2ff');
        eng.fillLight.intensity = 1.02;
        eng.rimLight.color.set('#ffffff');
        eng.rimLight.intensity = 1.35;
        eng.hemiLight.intensity = 0.9;
        eng.renderer.toneMappingExposure = 1.14;
      } else {
        eng.keyLight.color.set('#fff8ee');
        eng.keyLight.intensity = 1.9;
        eng.fillLight.color.set('#d9e8fc');
        eng.fillLight.intensity = 0.78;
        eng.rimLight.color.set('#ffffff');
        eng.rimLight.intensity = 1.05;
        eng.hemiLight.intensity = 0.72;
        eng.renderer.toneMappingExposure = 1.08;
      }

      if (eng.gtaoPass) {
        eng.gtaoPass.blendIntensity = aoEnabled ? 0.6 : 0;
      }

      eng.requestRender();
    }, [lightingPreset, aoEnabled]);

    // 5C. Attach / detach 3D TransformControls gizmo to selected part
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (gizmoMode === 'off' || !selectedPartId || !eng.assembly) {
        eng.transformControls.detach();
        eng.requestRender();
        return;
      }

      const targetMesh = eng.assembly.partMeshes.find(
        (m) => m.userData.partId === selectedPartId && m.visible
      );
      if (targetMesh) {
        eng.transformControls.setMode(gizmoMode);
        eng.transformControls.attach(targetMesh);
      } else {
        eng.transformControls.detach();
      }
      eng.requestRender();
    }, [gizmoMode, selectedPartId, blueprint, tessellation, manifoldReady, hiddenPartIds]);

    // 5D. Toggle 3D Center of Gravity + Plumb Line + Floor Support Polygon overlay
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      if (!showCoGOverlay || !eng.assembly?.metrology.massProperties) {
        disposeGroupChildren(eng.cogOverlayGroup);
        eng.requestRender();
        return;
      }
      _box.setFromObject(eng.assembly.rootGroup);
      _box.getSize(_size);
      const spanM = Math.max(_size.x, _size.y, _size.z, 0.4);
      populateCoGOverlayGroup(eng.cogOverlayGroup, eng.assembly.metrology.massProperties, spanM);
      eng.requestRender();
    }, [showCoGOverlay, blueprint, tessellation, manifoldReady]);

    // 5E. Toggle 3D Swept-Volume Clearance Envelope ghost overlay
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      if (!showSweptEnvelopes || !eng.assembly) {
        disposeGroupChildren(eng.sweptEnvelopeGroup);
        eng.requestRender();
        return;
      }
      populateSweptEnvelopesGroup(eng.sweptEnvelopeGroup, eng.assembly);
      eng.requestRender();
    }, [showSweptEnvelopes, blueprint, tessellation, manifoldReady]);

    // 5F. Toggle Machine Installation Envelope (Floor Markings, NEC Clearances, Door Swings & Utilities)
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      disposeGroupChildren(eng.installationOverlayGroup);
      if (!showInstallationOverlay || !blueprint || !eng.assembly) {
        eng.requestRender();
        return;
      }
      _box.setFromObject(eng.assembly.rootGroup);
      _box.getSize(_size);
      const spanM = Math.max(_size.x, _size.y, _size.z, 0.8);
      populateInstallationOverlayGroup(
        eng.installationOverlayGroup,
        blueprint,
        spanM,
        installationOptions
      );
      eng.requestRender();
    }, [showInstallationOverlay, installationOptions, blueprint, tessellation, manifoldReady]);

    // 5G. Drive Machine Simulation Overlay (Plate / Waterjet Beam / Kerf) & Trigger Pose Re-Render
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (!simState || !blueprint?.simulation || !eng.assembly) {
        disposeGroupChildren(eng.simOverlayGroup);
        eng.requestRender();
        return;
      }

      updateSimOverlayGroup(eng.simOverlayGroup, blueprint.simulation, simState, simBlinkOn);
      eng.requestRender();
    }, [simState, simBlinkOn, blueprint, tessellation, manifoldReady]);

    // 5H. Load external imported 3D assets (.glb / converted .usd) referenced by blueprint parts
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng || !blueprint) return;
      disposeGroupChildren(eng.importedAssetGroup);

      const assetParts = blueprint.parts.filter(
        (p) => p.geometry.kind === 'importedAsset' && Boolean(p.geometry.assetUrl)
      );
      if (assetParts.length === 0) {
        eng.requestRender();
        return;
      }

      let cancelled = false;
      const loader = new GLTFLoader();

      Promise.all(
        assetParts.map(
          (part) =>
            new Promise<void>((resolve) => {
              loader.load(
                part.geometry.assetUrl!,
                (gltf) => {
                  if (cancelled) {
                    resolve();
                    return;
                  }
                  const root = gltf.scene;
                  const scale = part.geometry.assetScale ?? 1;
                  root.scale.setScalar(scale);

                  // Ground imported asset cleanly on Y = 0 and center X/Z when placed at origin
                  const box = new THREE.Box3().setFromObject(root);
                  if (!box.isEmpty()) {
                    const ctr = new THREE.Vector3();
                    box.getCenter(ctr);
                    root.position.set(
                      -ctr.x + part.positionMm[0] * MM_TO_SCENE,
                      -box.min.y + part.positionMm[1] * MM_TO_SCENE,
                      -ctr.z + part.positionMm[2] * MM_TO_SCENE
                    );
                  }
                  root.rotation.set(
                    THREE.MathUtils.degToRad(part.rotationDeg[0]),
                    THREE.MathUtils.degToRad(part.rotationDeg[1]),
                    THREE.MathUtils.degToRad(part.rotationDeg[2])
                  );
                  root.traverse((obj) => {
                    const mesh = obj as THREE.Mesh;
                    if (!mesh.isMesh) return;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    mats.forEach((m: any) => {
                      if (m && 'clippingPlanes' in m) {
                        m.clippingPlanes = [eng.clippingPlane];
                      }
                    });
                  });
                  eng.importedAssetGroup.add(root);
                  resolve();
                },
                undefined,
                (err) => {
                  console.warn('[Viewport3D] Failed to load imported asset:', part.geometry.assetUrl, err);
                  resolve();
                }
              );
            })
        )
      ).then(() => {
        if (cancelled) return;
        // Auto-frame camera around the loaded imported model if it's the main subject
        const b = new THREE.Box3().setFromObject(eng.importedAssetGroup);
        if (!b.isEmpty()) {
          const sz = new THREE.Vector3();
          const ctr = new THREE.Vector3();
          b.getSize(sz);
          b.getCenter(ctr);
          const radius = Math.max(sz.x, sz.y, sz.z, 0.5);
          eng.camera.position.set(ctr.x - radius * 1.45, ctr.y + radius * 0.95, ctr.z + radius * 1.65);
          eng.controls.target.copy(ctr);
          eng.controls.update();
          let totalTriangles = 0;
          let totalVertices = 0;
          eng.importedAssetGroup.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh || !mesh.geometry) return;
            const pos = mesh.geometry.attributes.position;
            if (pos) totalVertices += pos.count;
            const idx = mesh.geometry.index;
            totalTriangles += idx ? Math.floor(idx.count / 3) : pos ? Math.floor(pos.count / 3) : 0;
          });
          onMetrologyReady({
            boundingMm: [sz.x * 1000, sz.y * 1000, sz.z * 1000],
            totalTriangles,
            totalVertices,
            surfaceAreaM2: 0,
            partCount: blueprint.parts.length,
            parts: [],
          });
        }
        eng.requestRender();
      });

      return () => {
        cancelled = true;
      };
    }, [blueprint]);

    // 6. Apply 3-axis section clipping plane
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (sectionPlane.axis === 'off' || !blueprint) {
        eng.clippingPlane.normal.set(0, -1, 0);
        eng.clippingPlane.constant = 100;
      } else {
        const sign = sectionPlane.invert ? 1 : -1;
        const env = blueprint.envelopeMm;
        if (sectionPlane.axis === 'x') {
          eng.clippingPlane.normal.set(sign, 0, 0);
          const half = (env.width * 0.55) * MM_TO_SCENE;
          eng.clippingPlane.constant = -sign * (sectionPlane.position * half);
        } else if (sectionPlane.axis === 'y') {
          eng.clippingPlane.normal.set(0, sign, 0);
          const maxH = (env.height * 1.05) * MM_TO_SCENE;
          const cutY = ((sectionPlane.position + 1) * 0.5) * maxH;
          eng.clippingPlane.constant = -sign * cutY;
        } else {
          eng.clippingPlane.normal.set(0, 0, sign);
          const half = (env.depth * 0.55) * MM_TO_SCENE;
          eng.clippingPlane.constant = -sign * (sectionPlane.position * half);
        }
      }

      eng.requestRender();
    }, [sectionPlane, blueprint]);

    // Handle split curtain drag in Compare mode
    useEffect(() => {
      if (!draggingSplit) return;
      const onMove = (e: PointerEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        onCompareSplitChange(Math.max(5, Math.min(95, pct)));
      };
      const onUp = () => setDraggingSplit(false);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
    }, [draggingSplit, onCompareSplitChange]);

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden select-none"
      >
        {/* Dedicated isolated WebGL canvas container */}
        <div ref={canvasMountRef} className="w-full h-full" />

        {/* Optional semi-transparent photo alignment overlay (pixel-locked when Constellation camera.json is active) */}
        {!compareMode && referenceOverlayOpacity > 0.01 && blueprint?.sourceImageUrl && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ opacity: referenceOverlayOpacity }}
          >
            <img
              src={blueprint.sourceImageUrl}
              alt={`Reference scan of ${blueprint.name}`}
              referrerPolicy="no-referrer"
              className={
                blueprint.photoMatchCamera?.constellationCamera
                  ? 'w-full h-full object-contain'
                  : 'max-h-[82%] max-w-[82%] object-contain'
              }
            />
          </div>
        )}

        {/* Constellation solved camera HUD badge */}
        {blueprint?.photoMatchCamera?.constellationCamera && (
          <div className="pointer-events-none absolute top-16 left-5 z-10 flex items-center gap-2 rounded-full border border-emerald-500/35 bg-slate-950/75 px-3 py-1 text-[11px] font-mono text-emerald-200 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>
              Constellation Cam · f={Math.round(blueprint.photoMatchCamera.constellationCamera.f)}px ·{' '}
              {blueprint.photoMatchCamera.constellationCamera.w}×{blueprint.photoMatchCamera.constellationCamera.h}
              {blueprint.photoMatchCamera.constellationCamera.reproj_rms_px !== undefined
                ? ` · RMS ${blueprint.photoMatchCamera.constellationCamera.reproj_rms_px.toFixed(1)}px`
                : ''}
            </span>
            {referenceOverlayOpacity > 0.01 && (
              <span className="text-emerald-300/90">
                · Blend {Math.round(referenceOverlayOpacity * 100)}%
              </span>
            )}
          </div>
        )}

        {/* Live Sobel Photo-vs-3D Edge-Diff Overlay (Green=Matched, Red=Photo Missing, Cyan=3D Extra) */}
        {!compareMode && edgeDiffOverlayUrl && edgeDiffOverlayOpacity > 0.01 && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
            style={{ opacity: edgeDiffOverlayOpacity }}
          >
            <img
              src={edgeDiffOverlayUrl}
              alt="Live Photo vs 3D Sobel Edge-Diff Overlay"
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Compare Split Curtain Mode: Reference photo on left vs live 3D replica on right */}
        {compareMode && blueprint?.sourceImageUrl && (
          <>
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden bg-white"
              style={{ clipPath: `inset(0 ${100 - compareSplit}% 0 0)` }}
            >
              <div className="w-full h-full flex items-center justify-center p-12 pb-28">
                <img
                  src={blueprint.sourceImageUrl}
                  alt={`Original photograph of ${blueprint.name}`}
                  referrerPolicy="no-referrer"
                  className="max-h-[78%] max-w-[78%] object-contain"
                />
              </div>
              <div className="absolute top-16 left-6 text-xs font-medium text-slate-600">
                Source Photograph
              </div>
            </div>

            <div className="pointer-events-none absolute top-16 right-6 text-xs font-medium text-slate-600">
              3D Mesh Replica
            </div>

            {/* Draggable split divider */}
            <div
              role="slider"
              aria-label="Comparison curtain divider"
              aria-valuemin={5}
              aria-valuemax={95}
              aria-valuenow={Math.round(compareSplit)}
              tabIndex={0}
              onPointerDown={(e) => {
                e.preventDefault();
                setDraggingSplit(true);
              }}
              className="absolute top-0 bottom-0 z-20 w-8 -ml-4 cursor-ew-resize flex items-center justify-center"
              style={{ left: `${compareSplit}%` }}
            >
              <div className="w-px h-full bg-slate-900/70" />
              <div className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-900 text-white shadow-md flex items-center justify-center text-xs font-mono">
                ↔
              </div>
            </div>
          </>
        )}

        {/* Live 3D Caliper Distance Callout */}
        {caliperLabelPos.visible && caliperLabelPos.text && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded bg-rose-600 text-white text-xs font-mono font-medium tabular-nums shadow-sm"
            style={{ left: caliperLabelPos.x, top: caliperLabelPos.y - 10 }}
          >
            {caliperLabelPos.text}
          </div>
        )}

        {/* Graceful WebGL Context Loss Fallback */}
        {contextLost && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#eceff4] p-8 text-center">
            {blueprint?.sourceImageUrl && (
              <img
                src={blueprint.sourceImageUrl}
                alt={blueprint.name}
                referrerPolicy="no-referrer"
                className="max-h-72 object-contain mb-4 opacity-80"
              />
            )}
            <p className="text-sm font-medium text-slate-800">
              3D graphics context interrupted. Attempting to restore viewport.
            </p>
          </div>
        )}
      </div>
    );
  }
);
