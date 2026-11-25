import * as THREE from 'three';

export interface BishopFrame {
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
}

/**
 * Fritsch-Carlson Monotone Piecewise Cubic Hermite Interpolation (PCHIP)
 * on arbitrary strictly-increasing non-uniform knots.
 *
 * Guarantees:
 * - C1 continuity across interior knots
 * - Zero overshoot / undershoot (strictly monotonic on monotonic intervals)
 * - 100% deterministic for identical inputs
 */
export function monotoneCubicInterp(
  knots: readonly number[],
  values: readonly number[],
  t: number
): number {
  const n = knots.length;
  if (n === 0) return 0;
  if (n === 1 || t <= knots[0]) return values[0];
  if (t >= knots[n - 1]) return values[n - 1];

  // Segment slopes and widths
  const h: number[] = new Array(n - 1);
  const delta: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = Math.max(1e-9, knots[i + 1] - knots[i]);
    delta[i] = (values[i + 1] - values[i]) / h[i];
  }

  // Interior tangents via weighted harmonic mean (Fritsch-Butland / Brodlie)
  const m: number[] = new Array(n).fill(0);
  if (n === 2) {
    m[0] = delta[0];
    m[1] = delta[0];
  } else {
    for (let i = 1; i < n - 1; i++) {
      if (delta[i - 1] * delta[i] <= 0) {
        m[i] = 0;
      } else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
      }
    }

    // One-sided shape-preserving endpoint slopes
    const clampEndpoint = (d0: number, d1: number, h0: number, h1: number): number => {
      let slope = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
      if (Math.sign(slope) !== Math.sign(d0)) {
        slope = 0;
      } else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(slope) > Math.abs(3 * d0)) {
        slope = 3 * d0;
      }
      return slope;
    };
    m[0] = clampEndpoint(delta[0], delta[1], h[0], h[1]);
    m[n - 1] = clampEndpoint(delta[n - 2], delta[n - 3], h[n - 2], h[n - 3]);
  }

  // Binary search for active interval
  let lo = 0;
  let hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t < knots[mid + 1]) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  const idx = lo;
  const u = THREE.MathUtils.clamp((t - knots[idx]) / h[idx], 0, 1);
  const u2 = u * u;
  const u3 = u2 * u;

  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;

  return h00 * values[idx] + h10 * h[idx] * m[idx] + h01 * values[idx + 1] + h11 * h[idx] * m[idx + 1];
}

/**
 * Computes twist-free parallel-transport (Bishop) orthonormal right-handed frames
 * (T, N, B) with T x N = B along a 3D spine.
 */
export function computeBishopFrames(
  tangentsInput: readonly THREE.Vector3[],
  upHint?: [number, number, number]
): BishopFrame[] {
  const n = tangentsInput.length;
  if (n === 0) return [];

  const tangents = tangentsInput.map((t, i) => {
    const c = t.clone();
    if (c.lengthSq() < 1e-12) {
      return i > 0 ? tangentsInput[i - 1].clone().normalize() : new THREE.Vector3(1, 0, 0);
    }
    return c.normalize();
  });

  const t0 = tangents[0];
  let ref = upHint
    ? new THREE.Vector3(upHint[0], upHint[1], upHint[2])
    : new THREE.Vector3(0, 0, 1);
  if (ref.lengthSq() < 1e-8) ref.set(0, 0, 1);
  ref.normalize();
  if (Math.abs(ref.dot(t0)) > 0.96) {
    ref = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  }

  // Orthogonalize initial binormal B0 to T0, then N0 = B0 x T0 so T0 x N0 = B0 (right-handed)
  const b0 = ref.clone().addScaledVector(t0, -ref.dot(t0)).normalize();
  const n0 = new THREE.Vector3().crossVectors(b0, t0).normalize();

  const frames: BishopFrame[] = [{ tangent: t0, normal: n0, binormal: b0 }];
  const qStep = new THREE.Quaternion();

  for (let i = 1; i < n; i++) {
    const prev = frames[i - 1];
    const curT = tangents[i];
    const dot = THREE.MathUtils.clamp(prev.tangent.dot(curT), -1, 1);

    let curN: THREE.Vector3;
    if (dot < -0.9995) {
      curN = prev.normal.clone().negate();
    } else {
      qStep.setFromUnitVectors(prev.tangent, curT);
      curN = prev.normal.clone().applyQuaternion(qStep);
    }
    // Re-orthonormalize via Gram-Schmidt to prevent floating-point drift
    curN.addScaledVector(curT, -curN.dot(curT));
    if (curN.lengthSq() < 1e-12) {
      curN = Math.abs(curT.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      curN.addScaledVector(curT, -curN.dot(curT));
    }
    curN.normalize();
    const curB = new THREE.Vector3().crossVectors(curT, curN).normalize();
    frames.push({ tangent: curT, normal: curN, binormal: curB });
  }

  return frames;
}

/**
 * Evaluates an asymmetric superellipse cross-section ring in local (u along N, v along B) coordinates.
 * Supports distinct positive/negative half-extents (e.g. flat-top / domed-bottom, D-grips, forged cheeks).
 */
export function sampleAsymmetricSuperellipse(
  radialSegs: number,
  halfAPos: number,
  halfANeg: number,
  halfBPos: number,
  halfBNeg: number,
  exponent: number,
  offsetN = 0,
  offsetB = 0
): [number, number][] {
  const power = 2 / Math.max(0.5, exponent);
  const ring: [number, number][] = new Array(radialSegs);
  for (let k = 0; k < radialSegs; k++) {
    const a = (k / radialSegs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rA = ca >= 0 ? halfAPos : halfANeg;
    const rB = sa >= 0 ? halfBPos : halfBNeg;
    const u = offsetN + Math.sign(ca) * Math.pow(Math.abs(ca), power) * rA;
    const v = offsetB + Math.sign(sa) * Math.pow(Math.abs(sa), power) * rB;
    ring[k] = [u, v];
  }
  return ring;
}

/**
 * Uniformly resamples a closed 2D polygon by arc length into `count` vertices,
 * preserving deterministic vertex correspondence for multi-station lofting.
 */
export function resampleClosedPolygon2D(
  pts: readonly [number, number][],
  count: number
): [number, number][] {
  const m = pts.length;
  if (m < 3 || count < 3) return pts.slice() as [number, number][];
  const cumLen: number[] = [0];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cumLen.push(total);
  }
  if (total < 1e-9) return new Array(count).fill(pts[0]);

  const out: [number, number][] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (seg < m - 1 && cumLen[seg + 1] < target) seg++;
    const segLen = Math.max(1e-9, cumLen[seg + 1] - cumLen[seg]);
    const frac = (target - cumLen[seg]) / segLen;
    const a = pts[seg];
    const b = pts[(seg + 1) % m];
    out.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
  }
  return out;
}

export interface LoftSurfaceDatum {
  /** Exact 3D surface point in mm */
  positionMm: [number, number, number];
  /** Outward unit surface normal */
  normal: [number, number, number];
  /** Unit spine tangent at parameter t */
  tangent: [number, number, number];
  /** Euler rotation [rx, ry, rz] in degrees aligning local +Z to the outward surface normal */
  rotationDeg: [number, number, number];
}

export interface MinimalLoftStation {
  posMm: [number, number, number];
  halfA: number;
  halfB: number;
  halfAPos?: number;
  halfANeg?: number;
  halfBPos?: number;
  halfBNeg?: number;
  offsetN?: number;
  offsetB?: number;
  exponent?: number;
  twistDeg?: number;
}

/**
 * Computes an exact surface-mounting datum (3D point, outward normal, and Euler rotationDeg
 * with local +Z along the outward normal) at normalized arc parameter t in [0, 1] and
 * circumferential angleRad (0 = +N, pi/2 = +B, pi = -N, -pi/2 = -B) on any curvedLoft.
 */
export function evaluateCurvedLoftDatum(
  stations: readonly MinimalLoftStation[],
  t: number,
  angleRad: number,
  upHint?: [number, number, number],
  normalOffsetMm = 0
): LoftSurfaceDatum {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  const ctrlVecs = stations.map((s) => new THREE.Vector3(s.posMm[0], s.posMm[1], s.posMm[2]));
  const cumLen: number[] = [0];
  for (let i = 1; i < ctrlVecs.length; i++) {
    cumLen.push(cumLen[i - 1] + Math.max(1e-4, ctrlVecs[i].distanceTo(ctrlVecs[i - 1])));
  }
  const totalLen = Math.max(1e-4, cumLen[cumLen.length - 1]);
  const knots = cumLen.map((l) => l / totalLen);

  const useSpline = stations.length >= 3;
  const curve = useSpline ? new THREE.CatmullRomCurve3(ctrlVecs, false, 'centripetal', 0.5) : null;

  const sampleCount = Math.max(16, stations.length * 6);
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const ti = i / (sampleCount - 1);
    if (curve) {
      tangents.push(curve.getTangentAt(ti));
    } else {
      tangents.push(new THREE.Vector3().subVectors(ctrlVecs[1], ctrlVecs[0]));
    }
  }
  const frames = computeBishopFrames(tangents, upHint);
  const frameIdx = Math.min(sampleCount - 1, Math.round(clampedT * (sampleCount - 1)));
  const frame = frames[frameIdx];

  const evalScalar = (vals: number[]): number =>
    useSpline
      ? monotoneCubicInterp(knots, vals, clampedT)
      : THREE.MathUtils.lerp(vals[0], vals[vals.length - 1], clampedT);

  const halfAPos = Math.max(0.25, evalScalar(stations.map((s) => s.halfAPos ?? s.halfA)));
  const halfANeg = Math.max(0.25, evalScalar(stations.map((s) => s.halfANeg ?? s.halfA)));
  const halfBPos = Math.max(0.25, evalScalar(stations.map((s) => s.halfBPos ?? s.halfB)));
  const halfBNeg = Math.max(0.25, evalScalar(stations.map((s) => s.halfBNeg ?? s.halfB)));
  const offsetN = evalScalar(stations.map((s) => s.offsetN ?? 0));
  const offsetB = evalScalar(stations.map((s) => s.offsetB ?? 0));
  const exponent = THREE.MathUtils.clamp(evalScalar(stations.map((s) => s.exponent ?? 2.6)), 1.2, 10);
  const twistRad = THREE.MathUtils.degToRad(evalScalar(stations.map((s) => s.twistDeg ?? 0)));

  let N = frame.normal.clone();
  let B = frame.binormal.clone();
  if (Math.abs(twistRad) > 1e-4) {
    const q = new THREE.Quaternion().setFromAxisAngle(frame.tangent, twistRad);
    N.applyQuaternion(q).normalize();
    B.applyQuaternion(q).normalize();
  }

  const spinePos = curve
    ? curve.getPointAt(clampedT)
    : new THREE.Vector3().lerpVectors(ctrlVecs[0], ctrlVecs[ctrlVecs.length - 1], clampedT);

  const power = 2 / exponent;
  const evalRingPoint = (ang: number): [number, number] => {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const rA = ca >= 0 ? halfAPos : halfANeg;
    const rB = sa >= 0 ? halfBPos : halfBNeg;
    return [
      offsetN + Math.sign(ca) * Math.pow(Math.abs(ca), power) * rA,
      offsetB + Math.sign(sa) * Math.pow(Math.abs(sa), power) * rB,
    ];
  };

  const [u, v] = evalRingPoint(angleRad);
  const eps = 1e-3;
  const [u1, v1] = evalRingPoint(angleRad + eps);
  const [u0, v0] = evalRingPoint(angleRad - eps);
  // Ring tangent in (N, B) plane; outward normal is (ringTan x spineTan) or normalized radial check
  const ringTan = new THREE.Vector3()
    .addScaledVector(N, u1 - u0)
    .addScaledVector(B, v1 - v0)
    .normalize();
  const outNorm = new THREE.Vector3().crossVectors(ringTan, frame.tangent).normalize();
  const radialDir = new THREE.Vector3()
    .addScaledVector(N, u - offsetN)
    .addScaledVector(B, v - offsetB);
  if (outNorm.dot(radialDir) < 0) outNorm.negate();

  const worldPos = spinePos
    .clone()
    .addScaledVector(N, u)
    .addScaledVector(B, v)
    .addScaledVector(outNorm, normalOffsetMm);

  // Build orthonormal basis with local +Z = outNorm, local +Y aligned to spine tangent
  const upVec = frame.tangent.clone().addScaledVector(outNorm, -frame.tangent.dot(outNorm));
  if (upVec.lengthSq() < 1e-8) {
    upVec.set(0, 1, 0).addScaledVector(outNorm, -outNorm.y);
  }
  upVec.normalize();
  const xVec = new THREE.Vector3().crossVectors(upVec, outNorm).normalize();
  const rotMat = new THREE.Matrix4().makeBasis(xVec, upVec, outNorm);
  const euler = new THREE.Euler().setFromRotationMatrix(rotMat, 'XYZ');

  return {
    positionMm: [worldPos.x, worldPos.y, worldPos.z],
    normal: [outNorm.x, outNorm.y, outNorm.z],
    tangent: [frame.tangent.x, frame.tangent.y, frame.tangent.z],
    rotationDeg: [
      THREE.MathUtils.radToDeg(euler.x),
      THREE.MathUtils.radToDeg(euler.y),
      THREE.MathUtils.radToDeg(euler.z),
    ],
  };
}
