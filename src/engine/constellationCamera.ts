/**
 * Exact pinhole camera conversion & projection helpers for Architekton Constellation.
 *
 * Frame conventions:
 *   - Architekton / Constellation default ('zup'): mm, +Z up, right-handed.
 *   - 18D Three.js scene ('yup'): meters (MM_TO_SCENE = 0.001), +X right, +Y up, +Z front.
 *   - Conversion zup -> yup: (x_y, y_y, z_y) = (x_z, z_z, -y_z)  [det = +1, pure -90 deg X rotation]
 *   - Conversion yup -> zup: (x_z, y_z, z_z) = (x_y, -z_y, y_y)
 *
 * OpenCV camera convention (architekton_engine.constellation.Camera):
 *   X_cam = R @ X_world + t  (camera +X right, +Y down, +Z forward)
 *   u = f * X_cam.x / X_cam.z + cx
 *   v = f * X_cam.y / X_cam.z + cy
 */
import * as THREE from 'three';
import { ConstellationCameraJson } from '../types/constellation';

const MM_TO_SCENE = 0.001;
const IN_TO_MM = 25.4;

export interface SolvedThreeCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fovDeg: number;
  /** Principal point offset in pixels relative to image center (dx = cx - w/2, dy = cy - h/2) */
  ppOffsetPx: [number, number];
  imageWidth: number;
  imageHeight: number;
}

/** Convert a 3D point from Constellation frame (zup/yup, mm/in) to 18D Y-up mm. */
export function constellationPointTo18dMm(
  pt: [number, number, number],
  frame: 'zup' | 'yup' = 'zup',
  units: 'mm' | 'in' = 'mm'
): [number, number, number] {
  const s = units === 'in' ? IN_TO_MM : 1.0;
  const x = pt[0] * s;
  const y = pt[1] * s;
  const z = pt[2] * s;
  if (frame === 'yup') {
    return [x, y, z];
  }
  // Z-up -> Y-up: (x, y, z)_zup -> (x, z, -y)_yup
  return [x, z, -y];
}

/** Convert a 3D point from 18D Y-up mm to Constellation frame (zup/yup, mm/in). */
export function point18dMmToConstellation(
  pt: [number, number, number],
  frame: 'zup' | 'yup' = 'zup',
  units: 'mm' | 'in' = 'mm'
): [number, number, number] {
  const inv = units === 'in' ? 1.0 / IN_TO_MM : 1.0;
  if (frame === 'yup') {
    return [pt[0] * inv, pt[1] * inv, pt[2] * inv];
  }
  // Y-up -> Z-up: (x, y, z)_yup -> (x, -z, y)_zup
  return [pt[0] * inv, -pt[2] * inv, pt[1] * inv];
}

/**
 * Compute the exact Three.js PerspectiveCamera pose (position, orientation, target, up, vertical FOV,
 * and principal-point shift) from an Architekton Constellation `camera.json`.
 */
export function constellationCameraToThreePose(
  cam: ConstellationCameraJson,
  targetDistMm = 1500
): SolvedThreeCameraPose {
  const frame = cam.frame ?? 'zup';
  const units = cam.units ?? 'mm';
  const R = cam.R;
  const t = cam.t;

  // Camera center in Constellation world units: C = -R^T @ t
  const cWorld: [number, number, number] = [
    -(R[0][0] * t[0] + R[1][0] * t[1] + R[2][0] * t[2]),
    -(R[0][1] * t[0] + R[1][1] * t[1] + R[2][1] * t[2]),
    -(R[0][2] * t[0] + R[1][2] * t[1] + R[2][2] * t[2]),
  ];

  // Camera basis vectors in Constellation world frame (rows of R):
  // OpenCV: right = R[0], down = R[1], forward = R[2]
  // Three.js camera looks down -Z with +Y up:
  //   right_three =  R[0]
  //   up_three    = -R[1]
  //   back_three  = -R[2]  (so camera +Z points backward)
  const rightW = constellationPointTo18dMm(R[0], frame, 'mm');
  const upW = constellationPointTo18dMm([-R[1][0], -R[1][1], -R[1][2]], frame, 'mm');
  const backW = constellationPointTo18dMm([-R[2][0], -R[2][1], -R[2][2]], frame, 'mm');

  const vRight = new THREE.Vector3(rightW[0], rightW[1], rightW[2]).normalize();
  const vUp = new THREE.Vector3(upW[0], upW[1], upW[2]).normalize();
  const vBack = new THREE.Vector3(backW[0], backW[1], backW[2]).normalize();

  const rotMat = new THREE.Matrix4().makeBasis(vRight, vUp, vBack);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotMat);

  const posMm = constellationPointTo18dMm(cWorld, frame, units);
  const position = new THREE.Vector3(
    posMm[0] * MM_TO_SCENE,
    posMm[1] * MM_TO_SCENE,
    posMm[2] * MM_TO_SCENE
  );

  // Forward direction is -vBack
  const forward = vBack.clone().negate();
  const target = position.clone().addScaledVector(forward, targetDistMm * MM_TO_SCENE);

  // Vertical FOV from pinhole focal length f and image height h:
  //   tan(fovY / 2) = (h / 2) / f
  const safeF = Math.max(1e-3, cam.f);
  const safeH = Math.max(1, cam.h);
  const safeW = Math.max(1, cam.w);
  const fovDeg = (2 * Math.atan(safeH / (2 * safeF)) * 180) / Math.PI;

  const cx = cam.cx ?? safeW / 2;
  const cy = cam.cy ?? safeH / 2;

  return {
    position,
    target,
    up: vUp,
    quaternion,
    fovDeg,
    ppOffsetPx: [cx - safeW / 2, cy - safeH / 2],
    imageWidth: safeW,
    imageHeight: safeH,
  };
}

/**
 * Apply a Constellation camera (including off-center principal point lens shift) to a Three.js PerspectiveCamera.
 * Scales the frustum cleanly when the viewport aspect differs from the photo aspect (letterbox-matched).
 */
export function applyConstellationCameraToThree(
  camera: THREE.PerspectiveCamera,
  camJson: ConstellationCameraJson,
  viewportW: number,
  viewportH: number
): SolvedThreeCameraPose {
  const pose = constellationCameraToThreePose(camJson);

  camera.position.copy(pose.position);
  camera.up.copy(pose.up);
  camera.quaternion.copy(pose.quaternion);

  const vpW = Math.max(1, viewportW);
  const vpH = Math.max(1, viewportH);
  const photoAspect = pose.imageWidth / pose.imageHeight;
  const vpAspect = vpW / vpH;

  // Match how `object-contain` fits the photo inside the viewport:
  // - If viewport is wider than photo: photo height fills viewport height -> vertical FOV = photo vertical FOV.
  // - If viewport is taller than photo: photo width fills viewport width -> expand vertical FOV so horizontal FOV matches photo.
  if (vpAspect >= photoAspect) {
    camera.fov = pose.fovDeg;
  } else {
    const photoHalfTanY = Math.tan(THREE.MathUtils.degToRad(pose.fovDeg * 0.5));
    const adjustedHalfTanY = photoHalfTanY * (photoAspect / vpAspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(adjustedHalfTanY));
  }

  camera.aspect = vpAspect;

  // Principal point shift via Three.js setViewOffset:
  // If cx > w/2, the optical axis shifts right in image pixels, so the frustum window shifts left (-dx).
  const [dxPx, dyPx] = pose.ppOffsetPx;
  if (Math.abs(dxPx) > 0.25 || Math.abs(dyPx) > 0.25) {
    const scale =
      vpAspect >= photoAspect ? vpH / pose.imageHeight : vpW / pose.imageWidth;
    camera.setViewOffset(vpW, vpH, -dxPx * scale, -dyPx * scale, vpW, vpH);
  } else {
    camera.clearViewOffset();
  }

  camera.updateProjectionMatrix();
  return pose;
}

/**
 * Project a 3D point in 18D's Y-up mm frame into Constellation photo pixel coordinates [u, v] and depth zCam.
 */
export function project18dMmToPhotoPx(
  pt18dMm: [number, number, number],
  cam: ConstellationCameraJson
): { uv: [number, number]; depth: number; inFront: boolean } {
  const frame = cam.frame ?? 'zup';
  const units = cam.units ?? 'mm';
  const X = point18dMmToConstellation(pt18dMm, frame, units);
  const R = cam.R;
  const t = cam.t;

  const xc = R[0][0] * X[0] + R[0][1] * X[1] + R[0][2] * X[2] + t[0];
  const yc = R[1][0] * X[0] + R[1][1] * X[1] + R[1][2] * X[2] + t[1];
  const zc = R[2][0] * X[0] + R[2][1] * X[1] + R[2][2] * X[2] + t[2];

  const cx = cam.cx ?? cam.w / 2;
  const cy = cam.cy ?? cam.h / 2;

  if (zc <= 1e-6) {
    return { uv: [NaN, NaN], depth: zc, inFront: false };
  }
  return {
    uv: [(cam.f * xc) / zc + cx, (cam.f * yc) / zc + cy],
    depth: zc,
    inFront: true,
  };
}

/**
 * Parse a user-supplied camera.json (supports both raw `Camera.to_dict()` and wrapped `{ camera: {...} }`).
 */
export function parseConstellationCameraJson(raw: any): ConstellationCameraJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw.camera && typeof raw.camera === 'object' ? raw.camera : raw;
  if (
    !Array.isArray(c.R) ||
    c.R.length !== 3 ||
    !Array.isArray(c.t) ||
    c.t.length !== 3 ||
    !Number.isFinite(Number(c.f)) ||
    !Number.isFinite(Number(c.w)) ||
    !Number.isFinite(Number(c.h))
  ) {
    return null;
  }
  return {
    R: [
      [Number(c.R[0][0]), Number(c.R[0][1]), Number(c.R[0][2])],
      [Number(c.R[1][0]), Number(c.R[1][1]), Number(c.R[1][2])],
      [Number(c.R[2][0]), Number(c.R[2][1]), Number(c.R[2][2])],
    ],
    t: [Number(c.t[0]), Number(c.t[1]), Number(c.t[2])],
    f: Number(c.f),
    w: Math.round(Number(c.w)),
    h: Math.round(Number(c.h)),
    cx: c.cx !== undefined && c.cx !== null ? Number(c.cx) : undefined,
    cy: c.cy !== undefined && c.cy !== null ? Number(c.cy) : undefined,
    frame: c.frame === 'yup' ? 'yup' : 'zup',
    units: c.units === 'in' ? 'in' : 'mm',
    reproj_rms_px: Number.isFinite(Number(c.reproj_rms_px)) ? Number(c.reproj_rms_px) : undefined,
    photo: typeof c.photo === 'string' ? c.photo : undefined,
  };
}
