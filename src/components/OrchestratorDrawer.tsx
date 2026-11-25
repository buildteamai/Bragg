import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Eye,
  ImagePlus,
  Layers,
  Loader2,
  Play,
  ShieldCheck,
  Square,
  Wrench,
  X,
} from 'lucide-react';
import {
  EdgeDiffResult,
  GeometryAuditReport,
  MeshBlueprint,
} from '../types/blueprint';
import {
  OrchestratorJobSnapshot,
  OrchestratorMode,
  OrchestratorPlanarLayout,
  OrchestratorStageId,
  PlanarSketchProfile,
  VisualCriticResponse,
} from '../types/orchestrator';
import {
  BlueprintFlatPatternEntry,
  collectBlueprintFlatPatterns,
} from '../engine/planarDevelopment';
import { computePhotoVsMeshEdgeDiff } from '../engine/edgeDiffAnalyzer';
import { fetchApiWithRetry, parseApiJson } from '../utils/api';

interface OrchestratorDrawerProps {
  open: boolean;
  onClose: () => void;
  activeBlueprint: MeshBlueprint;
  activeAudit: GeometryAuditReport | null;
  edgeDiff: EdgeDiffResult | null;
  onCaptureViewportFrame: () => string | null;
  onBlueprintReady: (blueprint: MeshBlueprint, label: string) => void;
}

const STARTER_BRIEFS = [
  {
    label: '50T C-Frame Hydraulic Press',
    widthMm: '1100',
    prompt:
      'Industrial 50-ton C-frame hydraulic workshop press with heavy welded steel base, slotted bolster plate, twin chrome guide rods, upper hydraulic ram cylinder, side electrical cabinet, and palm-button pedestal. Painted machinery blue-gray enamel and brushed steel.',
  },
  {
    label: 'CNC 4th-Axis Rotary Table',
    widthMm: '420',
    prompt:
      'Precision CNC 4th-axis rotary indexing table with cast-iron housing, 3-jaw machined steel chuck, graduated vernier ring, rear servo motor housing with cooling fins, T-slot mounting flange, and pneumatic brake manifold.',
  },
  {
    label: 'Industrial Steel Work Mezzanine',
    widthMm: '2400',
    prompt:
      '2-bay OSHA industrial steel access platform with anchored SHS columns, diagonal X-bracing, open NAAMM bar-grating deck, safety yellow mandrel-bent tubular guardrails, and folded-stringer steel staircase with anti-slip treads.',
  },
];

const ZONE_COLORS = ['#0f172a', '#0284c7', '#059669', '#d97706'];

function OrthoPlaneSvg({
  title,
  profiles,
  zoneIds,
  showGroundLine,
}: {
  title: string;
  profiles: PlanarSketchProfile[];
  zoneIds: string[];
  showGroundLine: boolean;
}) {
  const allPts = profiles.flatMap((p) => p.polygonMm);
  if (allPts.length === 0) return null;

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [u, v] of allPts) {
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  if (showGroundLine) {
    minV = Math.min(minV, 0);
  }
  const spanU = Math.max(20, maxU - minU);
  const spanV = Math.max(20, maxV - minV);
  const padU = spanU * 0.1;
  const padV = spanV * 0.1;
  const vw = 120;
  const vh = 84;
  const scale = Math.min((vw - 12) / (spanU + padU * 2), (vh - 12) / (spanV + padV * 2));
  const midU = (minU + maxU) * 0.5;
  const midV = (minV + maxV) * 0.5;

  const mapPt = ([u, v]: [number, number]): [number, number] => [
    vw * 0.5 + (u - midU) * scale,
    vh * 0.5 - (v - midV) * scale,
  ];

  const groundY = mapPt([0, 0])[1];

  return (
    <div className="rounded border border-slate-200 bg-white p-1.5 space-y-1">
      <div className="text-[10px] font-mono font-semibold text-slate-600 text-center">{title}</div>
      <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full h-20 bg-slate-50/70 rounded">
        {showGroundLine && (
          <line
            x1={4}
            y1={groundY}
            x2={vw - 4}
            y2={groundY}
            stroke="#94a3b8"
            strokeWidth={0.8}
            strokeDasharray="2 2"
          />
        )}
        {profiles.map((prof) => {
          const zIdx = Math.max(0, zoneIds.indexOf(prof.zoneId));
          const color = ZONE_COLORS[zIdx % ZONE_COLORS.length];
          const ptsStr = prof.polygonMm
            .map((p) => {
              const [sx, sy] = mapPt(p);
              return `${sx.toFixed(1)},${sy.toFixed(1)}`;
            })
            .join(' ');
          return (
            <polygon
              key={prof.id}
              points={ptsStr}
              fill={color}
              fillOpacity={prof.isSheetMetal ? 0.12 : 0.18}
              stroke={color}
              strokeWidth={1.1}
              strokeDasharray={prof.isSheetMetal ? '3 1.5' : undefined}
            />
          );
        })}
      </svg>
    </div>
  );
}

function OrthographicPlanCard({
  planarLayout,
  zoneIds,
}: {
  planarLayout: OrchestratorPlanarLayout;
  zoneIds: string[];
}) {
  const v = planarLayout.verification;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
          3-View Orthographic Planar Development
        </span>
        <span
          className={`text-[10px] font-mono font-semibold tabular-nums ${
            v.passed ? 'text-emerald-700' : 'text-amber-700'
          }`}
        >
          {v.passed ? 'PRE-3D VERIFIED' : 'CHECK WARNING'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <OrthoPlaneSvg
          title="Front XY"
          profiles={planarLayout.frontElevationXY}
          zoneIds={zoneIds}
          showGroundLine={true}
        />
        <OrthoPlaneSvg
          title="Side YZ"
          profiles={planarLayout.sideProfileYZ}
          zoneIds={zoneIds}
          showGroundLine={true}
        />
        <OrthoPlaneSvg
          title="Top XZ"
          profiles={planarLayout.topPlanXZ}
          zoneIds={zoneIds}
          showGroundLine={false}
        />
      </div>
      <div className="text-[10px] font-mono tabular-nums text-slate-500 flex flex-wrap gap-x-2">
        <span>XY {v.frontCoveragePct}%</span>
        <span>·</span>
        <span>YZ {v.sideCoveragePct}%</span>
        <span>·</span>
        <span>XZ {v.topCoveragePct}%</span>
        <span>·</span>
        <span>Env ±{v.envelopeFitErrorPct}%</span>
        <span>·</span>
        <span>{v.groundContactVerified ? 'Y=0 OK' : 'Ground Warn'}</span>
      </div>
    </div>
  );
}

function SheetMetalFlatPatternsCard({ entries }: { entries: BlueprintFlatPatternEntry[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  if (entries.length === 0) return null;

  const active = entries[Math.min(selectedIdx, entries.length - 1)];
  const fp = active.pattern;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of fp.flangeRects) {
    if (r.xMin < minX) minX = r.xMin;
    if (r.xMax > maxX) maxX = r.xMax;
    if (r.zMin < minZ) minZ = r.zMin;
    if (r.zMax > maxZ) maxZ = r.zMax;
  }
  const spanX = Math.max(10, maxX - minX);
  const spanZ = Math.max(10, maxZ - minZ);
  const vw = 320;
  const vh = 156;
  const scale = Math.min((vw - 24) / spanX, (vh - 24) / spanZ);
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  const sx = (x: number) => vw * 0.5 + (x - midX) * scale;
  const sz = (z: number) => vh * 0.5 + (z - midZ) * scale;

  return (
    <section className="px-6 py-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800">
          Sheet-Metal Flat Pattern ({entries.length})
        </span>
        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
          K={fp.kFactor} · t={fp.thicknessMm} mm
        </span>
      </div>

      {entries.length > 1 && (
        <select
          value={Math.min(selectedIdx, entries.length - 1)}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        >
          {entries.map((entry, idx) => (
            <option key={entry.partId} value={idx}>
              {entry.partName}
            </option>
          ))}
        </select>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-800 truncate">{active.partName}</span>
          <span className="font-mono text-slate-600 tabular-nums shrink-0">
            Blank {fp.flatWidthMm}×{fp.flatDepthMm} mm
          </span>
        </div>

        <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full h-36 bg-white rounded border border-slate-200/80">
          {fp.flangeRects.map((rect) => {
            const x = sx(rect.xMin);
            const y = sz(rect.zMin);
            const w = Math.max(1, (rect.xMax - rect.xMin) * scale);
            const h = Math.max(1, (rect.zMax - rect.zMin) * scale);
            const fill =
              rect.stage === 0 ? '#e2e8f0' : rect.stage === 1 ? '#e0f2fe' : '#d1fae5';
            const stroke =
              rect.stage === 0 ? '#334155' : rect.stage === 1 ? '#0369a1' : '#047857';
            return (
              <rect
                key={rect.id}
                x={x}
                y={y}
                width={w}
                height={h}
                fill={fill}
                stroke={stroke}
                strokeWidth={0.9}
              />
            );
          })}
          {fp.bendLines.map((bl) => (
            <line
              key={bl.id}
              x1={sx(bl.startMm[0])}
              y1={sz(bl.startMm[1])}
              x2={sx(bl.endMm[0])}
              y2={sz(bl.endMm[1])}
              stroke={bl.direction === 'UP' ? '#1d4ed8' : '#b45309'}
              strokeWidth={1.1}
              strokeDasharray="4 2"
            />
          ))}
          {fp.holes2D.map((hole, hi) => (
            <circle
              key={hi}
              cx={sx(hole.x)}
              cy={sz(hole.z)}
              r={Math.max(1.8, hole.diameterMm * 0.5 * scale)}
              fill="#ffffff"
              stroke="#334155"
              strokeWidth={0.9}
            />
          ))}
        </svg>

        <div className="text-[10px] font-mono tabular-nums text-slate-500 flex flex-wrap gap-x-2">
          <span>{fp.bendCount} bends</span>
          <span>·</span>
          <span>ΣBA {fp.totalBendAllowanceMm} mm</span>
          <span>·</span>
          <span>{fp.holes2D.length} cutouts</span>
          <span>·</span>
          <span className="text-blue-700">--- UP</span>
          <span className="text-amber-700">--- DOWN</span>
        </div>
      </div>
    </section>
  );
}

function resizeImageFile(file: File, maxDim = 1024): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: String(reader.result), mimeType: file.type || 'image/png' });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), mimeType: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function fetchUrlAsBase64(url: string): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) {
    const mimeMatch = url.match(/^data:(image\/[^;]+);/);
    return { dataUrl: url, mimeType: mimeMatch ? mimeMatch[1] : 'image/png' };
  }
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const file = new File([blob], 'ref.png', { type: blob.type || 'image/png' });
    return await resizeImageFile(file, 1024);
  } catch {
    return null;
  }
}

const STAGE_ORDER: { id: OrchestratorStageId; label: string }[] = [
  { id: 'skeleton', label: '1. Skeleton' },
  { id: 'subassemblies', label: '2. Workers' },
  { id: 'gate', label: '3. Kernel Gate' },
  { id: 'repair', label: '4. Scoped Repair' },
];

export function OrchestratorDrawer({
  open,
  onClose,
  activeBlueprint,
  activeAudit,
  edgeDiff,
  onCaptureViewportFrame,
  onBlueprintReady,
}: OrchestratorDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const appliedJobIdRef = useRef<string | null>(null);

  const activeHasDefects = Boolean(
    activeAudit &&
      (activeAudit.healthScore < 98 ||
        activeAudit.clashes.length > 0 ||
        activeAudit.floatingParts.length > 0 ||
        activeAudit.dynamicClashes.length > 0)
  );

  const [mode, setMode] = useState<OrchestratorMode>(
    activeHasDefects ? 'auditAndUpgrade' : 'build'
  );
  const [prompt, setPrompt] = useState('');
  const [repairDirective, setRepairDirective] = useState('');
  const [targetWidthMm, setTargetWidthMm] = useState('');
  const [workerCount, setWorkerCount] = useState<number>(3);
  const [maxRepairIterations, setMaxRepairIterations] = useState<number>(3);

  const [refImageDataUrl, setRefImageDataUrl] = useState<string | null>(null);
  const [refImageMime, setRefImageMime] = useState<string>('image/jpeg');
  const [refFileName, setRefFileName] = useState<string>('');
  const [constellationMarks, setConstellationMarks] = useState<Record<string, any> | null>(null);
  const [constellationMarksName, setConstellationMarksName] = useState<string>('');
  const [constellationSpec, setConstellationSpec] = useState<any | null>(null);
  const [solvingConstellation, setSolvingConstellation] = useState(false);

  const [job, setJob] = useState<OrchestratorJobSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stage 5 Visual Critic state
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualFocusNote, setVisualFocusNote] = useState('');
  const [visualResult, setVisualResult] = useState<VisualCriticResponse | null>(null);
  const [visualEdgeMetrics, setVisualEdgeMetrics] = useState<{
    f1ScorePct: number;
    silhouetteIoUPct: number;
    precisionPct: number;
    recallPct: number;
  } | null>(null);
  const [visualError, setVisualError] = useState<string | null>(null);

  const isRunning = submitting || job?.status === 'running';
  const flatPatterns = useMemo(
    () => collectBlueprintFlatPatterns(job?.blueprint ?? activeBlueprint),
    [job?.blueprint, activeBlueprint]
  );

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Poll active orchestrator job every 1.1s
  useEffect(() => {
    if (!job || job.status !== 'running') {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const activeJobId = job.jobId;
    const pollOnce = async () => {
      try {
        const res = await fetch(`/api/orchestrator/status/${encodeURIComponent(activeJobId)}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        const snap = await parseApiJson<OrchestratorJobSnapshot>(res);
        setJob(snap);
        if (
          snap.status === 'completed' &&
          snap.blueprint &&
          appliedJobIdRef.current !== snap.jobId
        ) {
          appliedJobIdRef.current = snap.jobId;
          onBlueprintReady(snap.blueprint, snap.blueprint.name);
        }
      } catch (err: any) {
        setError(err?.message || 'Lost connection to orchestrator.');
      }
    };

    pollTimerRef.current = window.setInterval(() => {
      void pollOnce();
    }, 1100);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [job?.jobId, job?.status, onBlueprintReady]);

  if (!open) return null;

  const handleImagePick = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Select a PNG, JPG, or WebP reference image.');
      return;
    }
    try {
      const { dataUrl, mimeType } = await resizeImageFile(file);
      setRefImageDataUrl(dataUrl);
      setRefImageMime(mimeType);
      setRefFileName(file.name);
    } catch (err: any) {
      setError(err?.message || 'Unable to process image.');
    }
  };

  const handleStartPipeline = async () => {
    if (isRunning) return;
    setError(null);
    setVisualResult(null);
    setVisualError(null);

    if (mode === 'build' && !prompt.trim() && !refImageDataUrl) {
      setError('Enter a mechanical build prompt or attach a reference photo.');
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        mode === 'auditAndUpgrade'
          ? {
              mode: 'auditAndUpgrade',
              currentBlueprint: activeBlueprint,
              prompt: repairDirective.trim() || undefined,
              maxRepairIterations,
            }
          : {
              mode: 'build',
              prompt: prompt.trim() || undefined,
              imageBase64: refImageDataUrl || undefined,
              mimeType: refImageDataUrl ? refImageMime : undefined,
              targetWidthMm: targetWidthMm ? Number(targetWidthMm) : undefined,
              workerCount,
              maxRepairIterations,
              ...(constellationMarks ? { constellationMarks } : {}),
              ...(constellationSpec ? { constellationSpec } : {}),
              ...(constellationSpec?.camera ? { constellationCamera: constellationSpec.camera } : {}),
            };

      const res = await fetchApiWithRetry('/api/orchestrator/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const initialSnap = await parseApiJson<OrchestratorJobSnapshot>(res);
      appliedJobIdRef.current = null;
      setJob(initialSnap);
    } catch (err: any) {
      setError(err?.message || 'Could not start orchestrator.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!job || job.status !== 'running') return;
    try {
      await fetch(`/api/orchestrator/cancel/${encodeURIComponent(job.jobId)}`, {
        method: 'POST',
      });
      setJob((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
    } catch {
      // ignore cancel network error
    }
  };

  const handleRunVisualCritic = async () => {
    if (visualBusy || isRunning) return;
    setVisualError(null);
    setVisualResult(null);
    setVisualEdgeMetrics(null);
    setVisualBusy(true);
    try {
      const renderedFrame = onCaptureViewportFrame();
      if (!renderedFrame) {
        throw new Error('Could not capture live 3D viewport frame.');
      }
      const refLoaded = activeBlueprint.sourceImageUrl
        ? await fetchUrlAsBase64(activeBlueprint.sourceImageUrl)
        : null;

      // Automatically compute fresh Silhouette IoU & Edge-Diff F1 when reference photo is present
      let liveMetrics = edgeDiff
        ? {
            f1ScorePct: edgeDiff.f1ScorePct,
            silhouetteIoUPct: edgeDiff.silhouetteIoUPct,
            precisionPct: edgeDiff.precisionPct,
            recallPct: edgeDiff.recallPct,
          }
        : undefined;

      if (!liveMetrics && activeBlueprint.sourceImageUrl) {
        try {
          const freshDiff = await computePhotoVsMeshEdgeDiff(
            activeBlueprint.sourceImageUrl,
            renderedFrame
          );
          liveMetrics = {
            f1ScorePct: freshDiff.f1ScorePct,
            silhouetteIoUPct: freshDiff.silhouetteIoUPct,
            precisionPct: freshDiff.precisionPct,
            recallPct: freshDiff.recallPct,
          };
        } catch {
          // Continue with multimodal critique even if CORS prevents pixel readback
        }
      }
      if (liveMetrics) setVisualEdgeMetrics(liveMetrics);

      const res = await fetchApiWithRetry('/api/orchestrator/visual-critic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          blueprint: activeBlueprint,
          renderedFrameBase64: renderedFrame,
          referenceImageBase64: refLoaded?.dataUrl,
          referenceMimeType: refLoaded?.mimeType,
          edgeDiffMetrics: liveMetrics,
          focusNote: visualFocusNote.trim() || undefined,
        }),
      });
      const result = await parseApiJson<VisualCriticResponse>(res);
      setVisualResult(result);
      if (result.accepted && result.blueprint && result.blueprint.id !== activeBlueprint.id) {
        onBlueprintReady(result.blueprint, `${activeBlueprint.name} (Visual Pass)`);
      }
    } catch (err: any) {
      setVisualError(err?.message || 'Visual fidelity critic failed.');
    } finally {
      setVisualBusy(false);
    }
  };

  const activeHealth = activeAudit?.healthScore ?? null;
  const latestGate = job?.gateHistory[job.gateHistory.length - 1] ?? null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/25 pointer-events-auto"
      onClick={onClose}
    >
      <aside
        aria-label="CAD Agent Orchestrator"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden text-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-700 shrink-0" />
              <h2
                className="text-base font-semibold text-slate-900"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                CAD Agent Orchestrator
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Skeleton Planner · Parallel CSG Workers · Manifold-3D Gate · Scoped Repair
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close orchestrator drawer"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-3 pb-3 border-b border-slate-200 bg-slate-50/70 shrink-0">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-200/70">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => setMode('build')}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                mode === 'build'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Build New Assembly</span>
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => setMode('auditAndUpgrade')}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                mode === 'auditAndUpgrade'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Repair Active Model</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
          {/* Input Section */}
          <section className="px-6 py-4 space-y-4">
            {mode === 'build' ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="orch-prompt" className="block text-xs font-semibold text-slate-800">
                    Engineering Brief
                  </label>
                  <textarea
                    id="orch-prompt"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isRunning}
                    placeholder="Describe the machine, fixture, or structure to decompose into locked datums and watertight Manifold-3D CSG sub-assemblies..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 resize-none"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {STARTER_BRIEFS.map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        disabled={isRunning}
                        onClick={() => {
                          setPrompt(b.prompt);
                          setTargetWidthMm(b.widthMm);
                        }}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Reference Photo */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">Reference Photo (Optional)</span>
                    {refImageDataUrl && (
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => {
                          setRefImageDataUrl(null);
                          setRefFileName('');
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="text-[11px] text-slate-500 hover:text-rose-600 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Constellation single_view pre-pass (marks.json -> spec.json) */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-800">
                        Constellation Metrology Pre-Pass (marks.json)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <label className="px-2 py-0.5 text-[11px] font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer">
                          {constellationMarks ? 'Change JSON' : 'Load marks.json'}
                          <input
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            disabled={isRunning}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (!f) return;
                              f.text().then(async (txt) => {
                                try {
                                  const parsed = JSON.parse(txt);
                                  setConstellationMarks(parsed);
                                  setConstellationMarksName(f.name);
                                  setConstellationSpec(null);
                                  setSolvingConstellation(true);
                                  setError(null);
                                  const res = await fetch('/api/constellation/single-view', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ marks: parsed }),
                                  });
                                  const solved = await parseApiJson<any>(res);
                                  setConstellationSpec(solved);
                                  if (solved?.envelopeMm?.width && !targetWidthMm) {
                                    setTargetWidthMm(String(solved.envelopeMm.width));
                                  }
                                } catch (err: any) {
                                  setError(err?.message || 'Failed to solve marks.json via Constellation.');
                                } finally {
                                  setSolvingConstellation(false);
                                }
                              });
                            }}
                          />
                        </label>
                        {constellationMarks && (
                          <button
                            type="button"
                            disabled={isRunning}
                            onClick={() => {
                              setConstellationMarks(null);
                              setConstellationMarksName('');
                              setConstellationSpec(null);
                            }}
                            className="text-[11px] text-slate-500 hover:text-rose-600 cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    {solvingConstellation && (
                      <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Solving single_view vanishing points &amp; 95% CIs...
                      </div>
                    )}
                    {constellationSpec && (
                      <div className="text-[11px] font-mono text-slate-700 space-y-1 bg-white rounded border border-slate-200 p-2">
                        <div className="flex items-center justify-between text-emerald-700 font-semibold">
                          <span>{constellationMarksName || 'spec.json'} solved</span>
                          <span>{constellationSpec.scaleCheck || 'anchored'}</span>
                        </div>
                        {constellationSpec.envelopeMm && (
                          <div>
                            Envelope: {constellationSpec.envelopeMm.width}×{constellationSpec.envelopeMm.height}×{constellationSpec.envelopeMm.depth} mm
                          </div>
                        )}
                        {Array.isArray(constellationSpec.dimensions) &&
                          constellationSpec.dimensions.slice(0, 4).map((d: any) => (
                            <div key={d.name} className="text-[10px] text-slate-600 truncate">
                              {d.name}: {d.valueMm} mm
                              {d.lo95Mm !== undefined && d.hi95Mm !== undefined
                                ? ` [${d.lo95Mm}..${d.hi95Mm}]`
                                : ''}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleImagePick(f);
                    }}
                  />
                  {refImageDataUrl ? (
                    <div className="flex items-center gap-3 p-2 rounded-lg border border-slate-200 bg-slate-50">
                      <img
                        src={refImageDataUrl}
                        alt="Reference preview"
                        className="w-12 h-12 rounded object-contain bg-white border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-900 truncate">{refFileName}</div>
                        <div className="text-[11px] text-slate-500">
                          Passed to Stage 1 Skeleton &amp; Stage 2 Workers
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer"
                      >
                        Replace
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-slate-500 hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Attach reference photograph</span>
                    </button>
                  )}
                </div>

                {/* Pipeline Budget Controls */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label htmlFor="orch-width" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Width (mm)
                    </label>
                    <input
                      id="orch-width"
                      type="number"
                      min={40}
                      max={20000}
                      value={targetWidthMm}
                      onChange={(e) => setTargetWidthMm(e.target.value)}
                      disabled={isRunning}
                      placeholder="Auto"
                      className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="orch-workers" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Parallel Zones
                    </label>
                    <select
                      id="orch-workers"
                      value={workerCount}
                      onChange={(e) => setWorkerCount(Number(e.target.value))}
                      disabled={isRunning}
                      className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                    >
                      <option value={2}>2 workers</option>
                      <option value={3}>3 workers</option>
                      <option value={4}>4 workers</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="orch-repairs" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Repair Passes
                    </label>
                    <select
                      id="orch-repairs"
                      value={maxRepairIterations}
                      onChange={(e) => setMaxRepairIterations(Number(e.target.value))}
                      disabled={isRunning}
                      className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                    >
                      <option value={0}>0 (Gate only)</option>
                      <option value={1}>Up to 1</option>
                      <option value={2}>Up to 2</option>
                      <option value={3}>Up to 3</option>
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Active Blueprint Summary */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {activeBlueprint.name}
                    </span>
                    {activeHealth !== null && (
                      <span
                        className={`text-xs font-mono font-semibold tabular-nums ${
                          activeHealth >= 95
                            ? 'text-emerald-700'
                            : activeHealth >= 70
                              ? 'text-amber-700'
                              : 'text-rose-700'
                        }`}
                      >
                        {activeHealth}/100
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-600 flex flex-wrap gap-x-2.5 gap-y-0.5">
                    <span>{activeBlueprint.parts.length} parts</span>
                    <span>·</span>
                    <span>
                      Clashes: {activeAudit?.clashes.length ?? 0}
                    </span>
                    <span>·</span>
                    <span>
                      Floating: {activeAudit?.floatingParts.length ?? 0}
                    </span>
                    <span>·</span>
                    <span>
                      Watertight CSG: {activeAudit?.watertightCsgCount ?? 0}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="orch-repair-note"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Scoped Repair Directive (Optional)
                  </label>
                  <textarea
                    id="orch-repair-note"
                    rows={2}
                    value={repairDirective}
                    onChange={(e) => setRepairDirective(e.target.value)}
                    disabled={isRunning}
                    placeholder="e.g. Clear rear columns from bandwheel housings, separate staircase handrails from saw head, convert colliding parts to watertight CSG..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 resize-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="orch-repairs-active" className="text-xs font-medium text-slate-700">
                    Max Scoped Repair Iterations
                  </label>
                  <select
                    id="orch-repairs-active"
                    value={maxRepairIterations}
                    onChange={(e) => setMaxRepairIterations(Number(e.target.value))}
                    disabled={isRunning}
                    className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                  >
                    <option value={1}>1 pass</option>
                    <option value={2}>2 passes</option>
                    <option value={3}>3 passes</option>
                  </select>
                </div>
              </>
            )}

            {/* Primary Action Bar */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleStartPipeline}
                disabled={isRunning}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Running Pipeline ({job?.progressPct ?? 5}%)...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {mode === 'build' ? 'Run 4-Stage Build Pipeline' : 'Run Scoped Repair Loop'}
                    </span>
                  </>
                )}
              </button>
              {isRunning && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  <span>Stop</span>
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}
          </section>

          {/* Live Pipeline Status & Kernel Gate Telemetry */}
          {job && (
            <section className="px-6 py-4 space-y-4 bg-slate-50/50">
              {/* 4-Stage Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">Pipeline Execution</span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {job.status.toUpperCase()} · {job.progressPct}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {STAGE_ORDER.map((st, idx) => {
                    const skipped =
                      job.mode === 'auditAndUpgrade' &&
                      (st.id === 'skeleton' || st.id === 'subassemblies');
                    const isCurrent = job.status === 'running' && job.currentStage === st.id;
                    const stageIdx = STAGE_ORDER.findIndex((s) => s.id === job.currentStage);
                    const isDone =
                      !skipped &&
                      (job.status === 'completed' || (stageIdx > idx && job.status === 'running'));
                    return (
                      <div
                        key={st.id}
                        className={`px-2 py-1.5 rounded border text-[11px] font-medium text-center truncate ${
                          skipped
                            ? 'border-slate-200 bg-slate-100 text-slate-400'
                            : isCurrent
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : isDone
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {st.label}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stage-1 3-View Orthographic Planar Development */}
              {job.skeletonPlan?.planarLayout && (
                <OrthographicPlanCard
                  planarLayout={job.skeletonPlan.planarLayout}
                  zoneIds={job.skeletonPlan.zones.map((z) => z.id)}
                />
              )}

              {/* Parallel Worker Status Grid */}
              {job.workers.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    Sub-Assembly Workers ({job.workers.length})
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {job.workers.map((w) => (
                      <div
                        key={w.zoneId}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {w.status === 'running' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-700 shrink-0" />
                          ) : w.status === 'passed' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : w.status === 'failed' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          )}
                          <span className="font-medium text-slate-900 truncate">{w.zoneName}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                          {w.partCount > 0 ? `${w.partCount} parts` : w.status}
                          {w.durationMs ? ` · ${(w.durationMs / 1000).toFixed(1)}s` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manifold-3D Kernel Gate Trajectory */}
              {job.gateHistory.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-700" />
                      <span>Manifold-3D Kernel Gate Trajectory</span>
                    </div>
                    {latestGate && (
                      <span
                        className={`text-xs font-mono font-bold tabular-nums ${
                          latestGate.passed ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {latestGate.healthScore}/100 {latestGate.passed ? 'PASS' : 'ITERATING'}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {job.gateHistory.map((g, i) => (
                      <div
                        key={`${g.iteration}-${i}`}
                        className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{g.label}</span>
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              g.passed
                                ? 'text-emerald-700'
                                : g.healthScore >= 75
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                            }`}
                          >
                            {g.healthScore}/100
                          </span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 flex flex-wrap gap-x-2">
                          <span>CSG {g.watertightCsgCount}/{g.totalCsgCount}</span>
                          <span>·</span>
                          <span>Clashes {g.hardClashCount}H/{g.warningClashCount}W</span>
                          <span>·</span>
                          <span>Dyn {g.dynamicClashCount}</span>
                          <span>·</span>
                          <span>Float {g.floatingCount}</span>
                          <span>·</span>
                          <span>Buried {g.occludedCount}</span>
                        </div>
                        {g.accuracyMetrics && (
                          <div className="text-[11px] font-mono tabular-nums text-slate-600 flex flex-wrap gap-x-2 pt-0.5">
                            <span className="font-semibold text-slate-800">
                              Acc {g.accuracyMetrics.accuracyScore}/100
                            </span>
                            <span>·</span>
                            <span>Env ±{g.accuracyMetrics.envelopeErrorPct}%</span>
                            <span>·</span>
                            <span>Feat {Math.round(g.accuracyMetrics.featureRichnessPct)}%</span>
                            <span>·</span>
                            <span>Floor ΔY {g.accuracyMetrics.groundingAccuracyMm}mm</span>
                          </div>
                        )}
                        {g.topDefects.length > 0 && i === job.gateHistory.length - 1 && !g.passed && (
                          <ul className="pt-1 space-y-0.5 text-[11px] font-mono text-rose-700">
                            {g.topDefects.slice(0, 4).map((d, di) => (
                              <li key={di} className="truncate" title={d}>
                                {d}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Execution Trace Log */}
              {job.events.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    Step Log
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {job.events.map((ev) => (
                      <div key={ev.id} className="px-3 py-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">{ev.title}</span>
                          {ev.durationMs !== undefined && (
                            <span className="font-mono text-slate-400 tabular-nums shrink-0">
                              {(ev.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>
                        <div className="text-slate-600 mt-0.5 leading-snug">{ev.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Developable Sheet-Metal 2D Flat Patterns */}
          <SheetMetalFlatPatternsCard entries={flatPatterns} />

          {/* Stage 5: On-Demand Vision-in-the-Loop Visual Fidelity Critic */}
          <section className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Eye className="w-3.5 h-3.5 text-slate-700" />
                <span>Stage 5 — Visual Fidelity Critic</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Vision + Manifold Gate
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Captures the live 3D viewport frame{activeBlueprint.sourceImageUrl ? ', compares it against the reference photo' : ''}, flags visual/material/proportion mismatches, and re-gates any patch through Manifold-3D so zero clashes are introduced.
            </p>
            <input
              type="text"
              value={visualFocusNote}
              onChange={(e) => setVisualFocusNote(e.target.value)}
              disabled={visualBusy || isRunning}
              placeholder="Optional focus (e.g. epoxy sheen too matte, adjust handle angle)"
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            />
            <button
              type="button"
              onClick={handleRunVisualCritic}
              disabled={visualBusy || isRunning}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {visualBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Comparing Render &amp; Re-Gating...</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>Capture Viewport &amp; Run Visual Critic</span>
                </>
              )}
            </button>

            {visualError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {visualError}
              </div>
            )}

            {visualResult && (
              <div
                className={`rounded-lg border px-3.5 py-3 text-xs space-y-2 ${
                  visualResult.accepted
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : 'border-amber-200 bg-amber-50/70'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className={visualResult.accepted ? 'text-emerald-900' : 'text-amber-900'}>
                    {visualResult.accepted
                      ? 'Visual Patch Verified & Applied'
                      : 'Visual Patch Blocked by Kernel Gate'}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {visualResult.beforeGate.healthScore} → {visualResult.afterGate.healthScore}/100
                  </span>
                </div>
                {visualEdgeMetrics && (
                  <div className="flex flex-wrap gap-x-2 text-[11px] font-mono tabular-nums text-slate-600">
                    <span>Sil. IoU {visualEdgeMetrics.silhouetteIoUPct.toFixed(1)}%</span>
                    <span>·</span>
                    <span>Edge F1 {visualEdgeMetrics.f1ScorePct.toFixed(1)}%</span>
                    <span>·</span>
                    <span>P {visualEdgeMetrics.precisionPct.toFixed(0)}% / R {visualEdgeMetrics.recallPct.toFixed(0)}%</span>
                  </div>
                )}
                {visualResult.rejectionReason && (
                  <p className="text-[11px] text-amber-800">{visualResult.rejectionReason}</p>
                )}
                {visualResult.visualFindings.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] text-slate-700 list-disc pl-4">
                    {visualResult.visualFindings.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
                {visualResult.appliedFixes && visualResult.appliedFixes.length > 0 && (
                  <div className="pt-1 border-t border-slate-200/70 space-y-0.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Applied Repairs
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-slate-700 list-disc pl-4">
                      {visualResult.appliedFixes.slice(0, 5).map((fix, i) => (
                        <li key={i}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
