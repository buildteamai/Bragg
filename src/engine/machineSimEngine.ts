import * as THREE from 'three';
import {
  MachineSimulationSpec,
  MeshBlueprint,
} from '../types/blueprint';

const MM_TO_SCENE = 0.001;

export type SimCommandKind = 'start' | 'stop' | 'estop' | 'reset' | 'home' | 'toggle_plate';
export type SimMachineState = 'IDLE' | 'HOMING' | 'RUNNING' | 'HOLD' | 'ESTOP' | 'COMPLETE';

export interface SimRuntimeState {
  state: SimMachineState;
  homed: boolean;
  eStopLatched: boolean;
  plateLoaded: boolean;
  axisOffsetsMm: Record<string, number>;
  /** Current waypoint index in spec.toolpath */
  waypointIdx: number;
  /** Progress 0..1 along current segment */
  segmentProgress: number;
  /** Completed & active cut line segments on the plate top surface as [[x0, z0], [x1, z1]] in world mm */
  cutSegments: [[number, number], [number, number]][];
  jetActive: boolean;
  pressurePsi: number;
  feedrateIpm: number;
  abrasiveLbMin: number;
  cycleTimeSec: number;
  progressPct: number;
  lampColor: 'green' | 'amber' | 'red' | 'off';
  lampBlink: boolean;
  statusMessage: string;
  nozzleTipWorldMm: [number, number, number];
  eventLog: { t: number; cmd: SimCommandKind }[];
}

function getAxisIds(spec: MachineSimulationSpec) {
  const xAxis = spec.axes.find((a) => a.motionAxis === 'x');
  const yAxis = spec.axes.find((a) => a.motionAxis === 'y');
  const zAxis = spec.axes.find((a) => a.motionAxis === 'z');
  return { xAxis, yAxis, zAxis };
}

function computeNozzleTip(
  spec: MachineSimulationSpec,
  axisOffsetsMm: Record<string, number>
): [number, number, number] {
  const { xAxis, yAxis, zAxis } = getAxisIds(spec);
  return [
    spec.nozzleTipOffsetMm[0] + (xAxis ? axisOffsetsMm[xAxis.id] || 0 : 0),
    spec.nozzleTipOffsetMm[1] + (yAxis ? axisOffsetsMm[yAxis.id] || 0 : 0),
    spec.nozzleTipOffsetMm[2] + (zAxis ? axisOffsetsMm[zAxis.id] || 0 : 0),
  ];
}

export function createInitialSimState(spec: MachineSimulationSpec): SimRuntimeState {
  const axisOffsetsMm: Record<string, number> = {};
  for (const a of spec.axes) {
    axisOffsetsMm[a.id] = a.homeMm;
  }
  return {
    state: 'IDLE',
    homed: true,
    eStopLatched: false,
    plateLoaded: Boolean(spec.workpiece),
    axisOffsetsMm,
    waypointIdx: 0,
    segmentProgress: 0,
    cutSegments: [],
    jetActive: false,
    pressurePsi: 0,
    feedrateIpm: 0,
    abrasiveLbMin: 0,
    cycleTimeSec: 0,
    progressPct: 0,
    lampColor: 'off',
    lampBlink: false,
    statusMessage: 'Ready — Press START to begin cutting cycle.',
    nozzleTipWorldMm: computeNozzleTip(spec, axisOffsetsMm),
    eventLog: [],
  };
}

export function applySimCommand(
  prev: SimRuntimeState,
  spec: MachineSimulationSpec,
  cmd: SimCommandKind
): SimRuntimeState {
  const log = [...prev.eventLog, { t: Number(prev.cycleTimeSec.toFixed(3)), cmd }];

  if (cmd === 'toggle_plate') {
    const nextLoaded = !prev.plateLoaded;
    return {
      ...prev,
      plateLoaded: nextLoaded,
      cutSegments: nextLoaded ? [] : prev.cutSegments,
      statusMessage: nextLoaded ? 'Workpiece plate loaded on slats.' : 'Workpiece plate unloaded.',
      eventLog: log,
    };
  }

  if (cmd === 'estop') {
    return {
      ...prev,
      state: 'ESTOP',
      eStopLatched: true,
      homed: false,
      jetActive: false,
      pressurePsi: 0,
      feedrateIpm: 0,
      abrasiveLbMin: 0,
      lampColor: 'red',
      lampBlink: true,
      statusMessage: 'E-STOP ACTIVE — All motion halted & HP pump dumped. Press RESET, then HOME.',
      eventLog: log,
    };
  }

  if (cmd === 'reset') {
    if (prev.state === 'ESTOP') {
      return {
        ...prev,
        state: 'IDLE',
        eStopLatched: false,
        lampColor: 'amber',
        lampBlink: false,
        statusMessage: 'E-STOP cleared — Press HOME (or START) to re-home axes.',
        eventLog: log,
      };
    }
    if (prev.state === 'COMPLETE' || prev.state === 'HOLD' || prev.state === 'IDLE') {
      const fresh = createInitialSimState(spec);
      return {
        ...fresh,
        plateLoaded: prev.plateLoaded,
        statusMessage: 'Cycle reset to home.',
        eventLog: log,
      };
    }
    return prev;
  }

  if (cmd === 'home') {
    if (prev.eStopLatched || prev.state === 'ESTOP') {
      return {
        ...prev,
        statusMessage: 'Cannot HOME while E-STOP is latched. Press RESET first.',
        eventLog: log,
      };
    }
    return {
      ...prev,
      state: 'HOMING',
      jetActive: false,
      pressurePsi: 0,
      abrasiveLbMin: 0,
      lampColor: 'amber',
      lampBlink: true,
      statusMessage: 'Homing Z, X, and Y axes to machine zero...',
      eventLog: log,
    };
  }

  if (cmd === 'stop') {
    if (prev.state === 'RUNNING' || prev.state === 'HOMING') {
      const { yAxis } = getAxisIds(spec);
      const nextOffsets = { ...prev.axisOffsetsMm };
      if (yAxis) nextOffsets[yAxis.id] = yAxis.homeMm; // Safe Z retract on feed hold
      return {
        ...prev,
        state: 'HOLD',
        axisOffsetsMm: nextOffsets,
        nozzleTipWorldMm: computeNozzleTip(spec, nextOffsets),
        jetActive: false,
        pressurePsi: 0,
        feedrateIpm: 0,
        abrasiveLbMin: 0,
        lampColor: 'amber',
        lampBlink: false,
        statusMessage: 'FEED HOLD — Jet off, Z retracted. Press START to resume or HOME to park.',
        eventLog: log,
      };
    }
    return prev;
  }

  if (cmd === 'start') {
    if (prev.eStopLatched || prev.state === 'ESTOP') {
      return {
        ...prev,
        statusMessage: 'START blocked — Release E-STOP (press RESET) first.',
        eventLog: log,
      };
    }
    if (!prev.homed) {
      return {
        ...prev,
        state: 'HOMING',
        lampColor: 'amber',
        lampBlink: true,
        statusMessage: 'Axes not homed after E-STOP — Homing first...',
        eventLog: log,
      };
    }
    if (prev.state === 'COMPLETE') {
      const fresh = createInitialSimState(spec);
      return {
        ...fresh,
        plateLoaded: prev.plateLoaded,
        state: 'RUNNING',
        lampColor: 'green',
        lampBlink: false,
        statusMessage: 'Cutting cycle started.',
        eventLog: log,
      };
    }
    return {
      ...prev,
      state: 'RUNNING',
      lampColor: 'green',
      lampBlink: false,
      statusMessage: prev.state === 'HOLD' ? 'Resuming cutting cycle...' : 'Cutting cycle running...',
      eventLog: log,
    };
  }

  return prev;
}

export function stepSimState(
  prev: SimRuntimeState,
  spec: MachineSimulationSpec,
  dtSec: number
): SimRuntimeState {
  if (dtSec <= 0 || (prev.state !== 'RUNNING' && prev.state !== 'HOMING')) {
    return prev;
  }

  const { xAxis, yAxis, zAxis } = getAxisIds(spec);
  const nextOffsets = { ...prev.axisOffsetsMm };

  if (prev.state === 'HOMING') {
    let allAtHome = true;
    for (const axis of spec.axes) {
      const cur = nextOffsets[axis.id] ?? axis.homeMm;
      const diff = axis.homeMm - cur;
      const maxStep = axis.rapidSpeedMmPerSec * dtSec;
      if (Math.abs(diff) <= maxStep) {
        nextOffsets[axis.id] = axis.homeMm;
      } else {
        nextOffsets[axis.id] = cur + Math.sign(diff) * maxStep;
        allAtHome = false;
      }
    }
    const tip = computeNozzleTip(spec, nextOffsets);
    if (allAtHome) {
      return {
        ...prev,
        state: 'IDLE',
        homed: true,
        axisOffsetsMm: nextOffsets,
        nozzleTipWorldMm: tip,
        waypointIdx: 0,
        segmentProgress: 0,
        cutSegments: [],
        progressPct: 0,
        cycleTimeSec: 0,
        lampColor: 'off',
        lampBlink: false,
        statusMessage: 'Homed & Ready — Press START to run cycle.',
      };
    }
    return {
      ...prev,
      axisOffsetsMm: nextOffsets,
      nozzleTipWorldMm: tip,
      feedrateIpm: spec.telemetryDefaults.rapidFeedIpm,
    };
  }

  // RUNNING state
  const path = spec.toolpath;
  if (path.length === 0) {
    return { ...prev, state: 'COMPLETE', jetActive: false, pressurePsi: 0, lampColor: 'green' };
  }

  const target = path[Math.min(prev.waypointIdx, path.length - 1)];
  const curX = xAxis ? (nextOffsets[xAxis.id] ?? 0) : 0;
  const curY = yAxis ? (nextOffsets[yAxis.id] ?? 0) : 0;
  const curZ = zAxis ? (nextOffsets[zAxis.id] ?? 0) : 0;

  const prevTip = computeNozzleTip(spec, nextOffsets);

  const dx = target.xMm - curX;
  const dy = target.yMm - curY;
  const dz = target.zMm - curZ;
  const dist = Math.hypot(dx, dy, dz);

  const defaultFeedMmPerSec = target.cutting
    ? (spec.telemetryDefaults.cutFeedIpm * 25.4) / 60
    : (spec.telemetryDefaults.rapidFeedIpm * 25.4) / 60;
  const speed = target.feedMmPerSec ?? defaultFeedMmPerSec;
  const step = speed * dtSec;

  let nextIdx = prev.waypointIdx;
  if (dist <= step || dist < 1e-3) {
    if (xAxis) nextOffsets[xAxis.id] = target.xMm;
    if (yAxis) nextOffsets[yAxis.id] = target.yMm;
    if (zAxis) nextOffsets[zAxis.id] = target.zMm;
    nextIdx = prev.waypointIdx + 1;
  } else {
    const ratio = step / dist;
    if (xAxis) nextOffsets[xAxis.id] = curX + dx * ratio;
    if (yAxis) nextOffsets[yAxis.id] = curY + dy * ratio;
    if (zAxis) nextOffsets[zAxis.id] = curZ + dz * ratio;
  }

  const nextTip = computeNozzleTip(spec, nextOffsets);
  const nextCutSegments =
    target.cutting && prev.plateLoaded && Math.hypot(nextTip[0] - prevTip[0], nextTip[2] - prevTip[2]) > 0.5
      ? [...prev.cutSegments, [[prevTip[0], prevTip[2]], [nextTip[0], nextTip[2]]] as [[number, number], [number, number]]]
      : prev.cutSegments;

  const cycleTimeSec = prev.cycleTimeSec + dtSec;
  const progressPct = Math.min(100, Math.round((nextIdx / path.length) * 100));

  if (nextIdx >= path.length) {
    return {
      ...prev,
      state: 'COMPLETE',
      axisOffsetsMm: nextOffsets,
      nozzleTipWorldMm: nextTip,
      waypointIdx: path.length,
      cutSegments: nextCutSegments,
      jetActive: false,
      pressurePsi: 0,
      feedrateIpm: 0,
      abrasiveLbMin: 0,
      cycleTimeSec,
      progressPct: 100,
      lampColor: 'green',
      lampBlink: false,
      statusMessage: `Cycle complete in ${cycleTimeSec.toFixed(1)}s — Press START to re-run or RESET.`,
    };
  }

  return {
    ...prev,
    axisOffsetsMm: nextOffsets,
    nozzleTipWorldMm: nextTip,
    waypointIdx: nextIdx,
    cutSegments: nextCutSegments,
    jetActive: target.cutting,
    pressurePsi: target.cutting ? spec.telemetryDefaults.maxPressurePsi : 12000,
    feedrateIpm: Math.round((speed * 60) / 25.4),
    abrasiveLbMin: target.cutting ? (spec.telemetryDefaults.abrasiveFlowLbMin ?? 0.9) : 0,
    cycleTimeSec,
    progressPct,
    lampColor: 'green',
    lampBlink: false,
    statusMessage: target.cutting
      ? `Cutting plate (${progressPct}% · ${spec.telemetryDefaults.maxPressurePsi.toLocaleString()} PSI)`
      : `Rapid positioning (${progressPct}%)`,
  };
}

/**
 * Populates the Three.js simulation overlay group with:
 * - Workpiece steel plate on the slats
 * - Live cut kerf path traced on top of the plate
 * - Animated 94K PSI waterjet beam + pierce splash glow when cutting
 * - 3D status stack light (green / amber / red)
 */
export function updateSimOverlayGroup(
  group: THREE.Group,
  spec: MachineSimulationSpec,
  sim: SimRuntimeState,
  blinkOn: boolean
) {
  // Dispose previous frame's dynamic children cleanly
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => m.dispose());
      }
    });
  }

  // 1. Workpiece Plate on the slats
  if (spec.workpiece && sim.plateLoaded) {
    const wp = spec.workpiece;
    const plateGeo = new THREE.BoxGeometry(
      wp.sizeMm[0] * MM_TO_SCENE,
      wp.sizeMm[1] * MM_TO_SCENE,
      wp.sizeMm[2] * MM_TO_SCENE
    );
    const plateMat = new THREE.MeshStandardMaterial({
      color: wp.colorHex,
      metalness: 0.78,
      roughness: 0.36,
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(
      wp.positionMm[0] * MM_TO_SCENE,
      wp.positionMm[1] * MM_TO_SCENE,
      wp.positionMm[2] * MM_TO_SCENE
    );
    plateMesh.castShadow = true;
    plateMesh.receiveShadow = true;
    plateMesh.name = 'sim_workpiece_plate';
    group.add(plateMesh);

    // 2. Cut kerf lines on top surface of the plate
    if (sim.cutSegments.length > 0) {
      const topY = (wp.positionMm[1] + wp.sizeMm[1] * 0.5 + 1.2) * MM_TO_SCENE;
      const pts: THREE.Vector3[] = [];
      for (const [a, b] of sim.cutSegments) {
        pts.push(new THREE.Vector3(a[0] * MM_TO_SCENE, topY, a[1] * MM_TO_SCENE));
        pts.push(new THREE.Vector3(b[0] * MM_TO_SCENE, topY, b[1] * MM_TO_SCENE));
      }
      const kerfGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const kerfMat = new THREE.LineBasicMaterial({ color: '#0ea5e9' });
      group.add(new THREE.LineSegments(kerfGeo, kerfMat));
    }
  }

  // 3. Active High-Pressure Waterjet Stream & Pierce Glow
  if (sim.jetActive) {
    const [nx, ny, nz] = sim.nozzleTipWorldMm;
    const beamColor = spec.beamColorHex || '#38bdf8';
    const jetLenMm = 140;
    const jetGeo = new THREE.CylinderGeometry(0.004, 0.009, jetLenMm * MM_TO_SCENE, 10);
    const jetMat = new THREE.MeshBasicMaterial({
      color: beamColor,
      transparent: true,
      opacity: 0.9,
    });
    const jetMesh = new THREE.Mesh(jetGeo, jetMat);
    jetMesh.position.set(nx * MM_TO_SCENE, (ny - jetLenMm * 0.5) * MM_TO_SCENE, nz * MM_TO_SCENE);
    group.add(jetMesh);

    // Pierce mist/spray halo right on top of the plate
    const plateTopY = spec.workpiece
      ? spec.workpiece.positionMm[1] + spec.workpiece.sizeMm[1] * 0.5
      : ny - 20;
    const haloGeo = new THREE.SphereGeometry(0.028, 12, 10);
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.75,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(nx * MM_TO_SCENE, (plateTopY + 8) * MM_TO_SCENE, nz * MM_TO_SCENE);
    group.add(halo);
  }

  // 3b. Dynamic Flexible Overhead Whips & Abrasive Hoses (stay connected to moving head!)
  if (spec.flexibleHoses && spec.flexibleHoses.length > 0) {
    for (const hose of spec.flexibleHoses) {
      let dx = 0;
      let dy = 0;
      let dz = 0;
      for (const axId of hose.endAxisIds) {
        const ax = spec.axes.find((a) => a.id === axId);
        if (!ax) continue;
        const val = sim.axisOffsetsMm[ax.id] ?? 0;
        if (ax.motionAxis === 'x') dx += val;
        else if (ax.motionAxis === 'y') dy += val;
        else if (ax.motionAxis === 'z') dz += val;
      }

      const endX = hose.endBaseMm[0] + dx;
      const endY = hose.endBaseMm[1] + dy;
      const endZ = hose.endBaseMm[2] + dz;

      const ax0 = hose.anchorMm[0];
      const ay0 = hose.anchorMm[1];
      const az0 = hose.anchorMm[2];
      const midX = (ax0 + endX) * 0.5;
      const midY = Math.max(ay0, endY) + hose.apexLiftMm;
      const midZ = (az0 + endZ) * 0.5;

      const q1X = ax0 * 0.72 + endX * 0.28;
      const q1Y = ay0 * 0.35 + midY * 0.65;
      const q1Z = az0 * 0.72 + endZ * 0.28;

      const q3X = ax0 * 0.22 + endX * 0.78;
      const q3Y = endY * 0.3 + midY * 0.7;
      const q3Z = az0 * 0.22 + endZ * 0.78;

      const hoseMat = new THREE.MeshStandardMaterial({
        color: hose.colorHex,
        metalness: hose.metalness ?? 0.3,
        roughness: hose.roughness ?? 0.5,
      });

      const archPts = [
        new THREE.Vector3(ax0 * MM_TO_SCENE, ay0 * MM_TO_SCENE, az0 * MM_TO_SCENE),
        new THREE.Vector3(q1X * MM_TO_SCENE, q1Y * MM_TO_SCENE, q1Z * MM_TO_SCENE),
        new THREE.Vector3(midX * MM_TO_SCENE, midY * MM_TO_SCENE, midZ * MM_TO_SCENE),
        new THREE.Vector3(q3X * MM_TO_SCENE, q3Y * MM_TO_SCENE, q3Z * MM_TO_SCENE),
        new THREE.Vector3(endX * MM_TO_SCENE, endY * MM_TO_SCENE, endZ * MM_TO_SCENE),
      ];
      const archCurve = new THREE.CatmullRomCurve3(archPts);
      const archGeo = new THREE.TubeGeometry(archCurve, 28, hose.radiusMm * MM_TO_SCENE, 10, false);
      group.add(new THREE.Mesh(archGeo, hoseMat));

      if (hose.fixedLeadPointsMm && hose.fixedLeadPointsMm.length >= 2) {
        const leadPts = [
          ...hose.fixedLeadPointsMm.map(
            ([x, y, z]) => new THREE.Vector3(x * MM_TO_SCENE, y * MM_TO_SCENE, z * MM_TO_SCENE)
          ),
          new THREE.Vector3(ax0 * MM_TO_SCENE, ay0 * MM_TO_SCENE, az0 * MM_TO_SCENE),
        ];
        const leadCurve = new THREE.CatmullRomCurve3(leadPts);
        const leadGeo = new THREE.TubeGeometry(leadCurve, 20, hose.radiusMm * MM_TO_SCENE, 10, false);
        group.add(new THREE.Mesh(leadGeo, hoseMat.clone()));
      }
    }
  }

  // 4. 3D Machine Status Stack Light
  if (spec.stackLightPosMm) {
    const [sx, sy, sz] = spec.stackLightPosMm;
    const lampHex =
      sim.lampColor === 'red'
        ? '#ef4444'
        : sim.lampColor === 'amber'
          ? '#f59e0b'
          : sim.lampColor === 'green'
            ? '#22c55e'
            : '#475569';
    const lit = sim.lampColor !== 'off' && (!sim.lampBlink || blinkOn);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.24, 12),
      new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.6, roughness: 0.4 })
    );
    mast.position.set(sx * MM_TO_SCENE, (sy + 120) * MM_TO_SCENE, sz * MM_TO_SCENE);
    group.add(mast);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.14, 16),
      new THREE.MeshStandardMaterial({
        color: lampHex,
        emissive: lit ? lampHex : '#000000',
        emissiveIntensity: lit ? 1.8 : 0,
        roughness: 0.25,
      })
    );
    lens.position.set(sx * MM_TO_SCENE, (sy + 280) * MM_TO_SCENE, sz * MM_TO_SCENE);
    group.add(lens);
  }
}

/**
 * Builds the SOT kit_runtime `sim_manifest.json` so the exact same simulation spec
 * carries over to Omniverse Kit (`_library/_lib/kit_runtime/sim_18d.py`) with zero rework.
 */
export function buildSotSimManifest(blueprint: MeshBlueprint) {
  const rootPrim = (blueprint.id || blueprint.name)
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+/, '') || 'Model18D';
  const safeRoot = /^[0-9]/.test(rootPrim) ? `_${rootPrim}` : rootPrim;
  return {
    format: '18d-kit-sim-manifest/1',
    machineId: blueprint.id,
    machineName: blueprint.name,
    rootPrim: `/${safeRoot}`,
    geomScope: `/${safeRoot}/Geom`,
    installationScope: `/${safeRoot}/Installation`,
    simulation: blueprint.simulation || null,
  };
}
