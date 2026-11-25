import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  FolderOpen,
  ImagePlus,
  Loader2,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { StudioTheme } from '../types/blueprint';

interface AgyDrawerProps {
  open: boolean;
  onClose: () => void;
  studioTheme: StudioTheme;
  activeModel?: { id: string; name: string };
  onCaptureViewportFrame?: () => string | null;
}

interface AgyStatus {
  available: boolean;
  bin: string | null;
  defaultCwd: string;
  sotRoot: string;
}

interface ImageAttachment {
  id: string;
  name: string;
  dataUrl: string;
}

interface BuildStepItem {
  key: string;
  stepIndex?: number;
  stepType: string;
  toolName?: string;
  detail?: string;
  state: 'ACTIVE' | 'DONE' | 'ERROR';
}

interface BuildRun {
  id: string;
  prompt: string;
  images?: ImageAttachment[];
  startedAt: number;
  durationSeconds?: number;
  status: 'running' | 'done' | 'error' | 'stopped';
  exitCode?: number;
  steps: BuildStepItem[];
  response: string;
  stderr: string;
  error?: string;
  stepsExpanded: boolean;
}

const QUICK_PROMPTS = [
  'Audit & fix any geometry or alignment issues on this model',
  'Add realistic surface details, fasteners, and chamfered edges',
  'Add standard NEC & ANSI safety decals to the active model',
];

function formatStepLabel(step: BuildStepItem, idx: number): string {
  if (step.detail) return step.detail;
  if (step.toolName) {
    return step.toolName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const t = step.stepType.toLowerCase();
  if (t.includes('think') || t.includes('plan')) return 'Reasoning & planning';
  if (t.includes('tool')) return `Build step #${idx + 1}`;
  return step.stepType.replace(/_/g, ' ');
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

/** Lightweight markdown-ish renderer for build summaries (bullets, inline code, bold) */
function FormattedResponse({ text, isDark }: { text: string; isDark: boolean }) {
  const lines = text.trim().split(/\r?\n/);

  const renderInline = (line: string) => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code
            key={i}
            className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
              isDark ? 'bg-white/10 text-indigo-300' : 'bg-slate-200/80 text-indigo-700'
            }`}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-1.5 text-xs leading-relaxed">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (/^#{1,3}\s+/.test(line)) {
          return (
            <div key={i} className="font-semibold text-[13px] pt-1">
              {renderInline(line.replace(/^#{1,3}\s+/, ''))}
            </div>
          );
        }
        if (/^\s*[-*•]\s+/.test(line)) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-indigo-500 shrink-0" />
              <span className="flex-1 break-words">{renderInline(line.replace(/^\s*[-*•]\s+/, ''))}</span>
            </div>
          );
        }
        return (
          <p key={i} className="break-words">
            {renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}

export function AgyDrawer({
  open,
  onClose,
  studioTheme,
  activeModel,
  onCaptureViewportFrame,
}: AgyDrawerProps) {
  const isDark = studioTheme === 'dark';
  const [status, setStatus] = useState<AgyStatus | null>(null);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'accept-edits' | 'auto' | 'plan'>('auto');
  const [cwd, setCwd] = useState('');
  const [continueConv, setContinueConv] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [running, setRunning] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [runs, setRuns] = useState<BuildRun[]>([]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/agy/status')
      .then((r) => r.json())
      .then((data: AgyStatus) => {
        setStatus(data);
        setCwd((prev) => prev || data.defaultCwd);
      })
      .catch(() => {
        setStatus({ available: false, bin: null, defaultCwd: '', sotRoot: '' });
      });
  }, [open]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runs]);

  if (!open) return null;

  const updateRun = (runId: string, updater: (run: BuildRun) => BuildRun) => {
    setRuns((prev) => prev.map((r) => (r.id === runId ? updater(r) : r)));
  };

  const addImageFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAttachments((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file.name || 'pasted-image.png',
              dataUrl: reader.result as string,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCaptureViewport = () => {
    const dataUrl = onCaptureViewportFrame?.();
    if (!dataUrl) return;
    setAttachments((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `viewport-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        dataUrl,
      },
    ]);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      addImageFiles(imageFiles);
    }
  };

  const handleStop = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (jobId) {
      await fetch('/api/agy/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      }).catch(() => {});
    }
    setRuns((prev) =>
      prev.map((r) =>
        r.status === 'running'
          ? {
              ...r,
              status: 'stopped',
              durationSeconds: (Date.now() - r.startedAt) / 1000,
              steps: r.steps.map((s) => (s.state === 'ACTIVE' ? { ...s, state: 'DONE' } : s)),
            }
          : r
      )
    );
    setRunning(false);
    setJobId(null);
  };

  const handleRun = async (overridePrompt?: string) => {
    const trimmed = (overridePrompt ?? prompt).trim();
    if (!trimmed || running) return;

    const currentAttachments = [...attachments];
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startedAt = Date.now();

    setRunning(true);
    setNowTick(startedAt);
    setNeedsReload(false);
    setRuns((prev) => [
      ...prev,
      {
        id: runId,
        prompt: trimmed,
        images: currentAttachments.length > 0 ? currentAttachments : undefined,
        startedAt,
        status: 'running',
        steps: [],
        response: '',
        stderr: '',
        stepsExpanded: false,
      },
    ]);
    if (!overridePrompt) setPrompt('');
    setAttachments([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/agy/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          mode,
          cwd: cwd.trim() || undefined,
          continueConversation: continueConv,
          activeModel,
          attachments: currentAttachments.map(({ name, dataUrl }) => ({ name, dataUrl })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errText = await response.text();
        updateRun(runId, (r) => ({
          ...r,
          status: 'error',
          error: errText || `HTTP ${response.status}`,
          durationSeconds: (Date.now() - r.startedAt) / 1000,
        }));
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventName = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const payload = JSON.parse(dataStr);
            if (eventName === 'start') {
              setJobId(payload.jobId);
            } else if (eventName === 'step') {
              const rawState = String(payload.state || 'ACTIVE').toUpperCase();
              const normState: BuildStepItem['state'] =
                rawState.includes('ERR') || rawState.includes('FAIL')
                  ? 'ERROR'
                  : rawState.includes('DONE') || rawState.includes('COMPLET')
                    ? 'DONE'
                    : 'ACTIVE';
              const stepIdx = typeof payload.stepIndex === 'number' ? payload.stepIndex : undefined;

              updateRun(runId, (r) => {
                const nextSteps = [...r.steps];
                // Match existing step by stepIndex, or if DONE update the last ACTIVE step of same type
                let matchIdx =
                  stepIdx !== undefined
                    ? nextSteps.findIndex((s) => s.stepIndex === stepIdx)
                    : -1;
                if (matchIdx === -1 && normState !== 'ACTIVE') {
                  for (let i = nextSteps.length - 1; i >= 0; i--) {
                    if (nextSteps[i].state === 'ACTIVE' && nextSteps[i].stepType === payload.stepType) {
                      matchIdx = i;
                      break;
                    }
                  }
                }

                if (matchIdx !== -1) {
                  nextSteps[matchIdx] = {
                    ...nextSteps[matchIdx],
                    state: normState,
                    toolName: payload.toolName || nextSteps[matchIdx].toolName,
                    detail: payload.detail || nextSteps[matchIdx].detail,
                  };
                } else {
                  nextSteps.push({
                    key: `${stepIdx ?? nextSteps.length}-${payload.stepType}-${Date.now()}`,
                    stepIndex: stepIdx,
                    stepType: payload.stepType || 'tool',
                    toolName: payload.toolName,
                    detail: payload.detail,
                    state: normState,
                  });
                }
                return { ...r, steps: nextSteps };
              });
            } else if (eventName === 'stdout') {
              updateRun(runId, (r) => ({ ...r, response: r.response + (payload.chunk || '') }));
            } else if (eventName === 'stderr') {
              updateRun(runId, (r) => ({ ...r, stderr: r.stderr + (payload.chunk || '') }));
            } else if (eventName === 'error') {
              updateRun(runId, (r) => ({
                ...r,
                status: 'error',
                error: payload.message || 'Unknown error',
              }));
            } else if (eventName === 'result') {
              updateRun(runId, (r) => ({
                ...r,
                durationSeconds:
                  typeof payload.durationSeconds === 'number'
                    ? payload.durationSeconds
                    : (Date.now() - r.startedAt) / 1000,
              }));
            } else if (eventName === 'done') {
              const exitCode = payload.code ?? 0;
              if (exitCode === 0) setNeedsReload(true);
              updateRun(runId, (r) => ({
                ...r,
                status: r.status === 'error' || exitCode !== 0 ? 'error' : 'done',
                exitCode,
                durationSeconds: r.durationSeconds ?? (Date.now() - r.startedAt) / 1000,
                steps: r.steps.map((s) => (s.state === 'ACTIVE' ? { ...s, state: 'DONE' } : s)),
              }));
            }
          } catch {
            // ignore malformed frame
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        updateRun(runId, (r) => ({
          ...r,
          status: 'error',
          error: err?.message || 'Failed to run Antigravity CLI.',
          durationSeconds: (Date.now() - r.startedAt) / 1000,
        }));
      }
    } finally {
      setRunning(false);
      setJobId(null);
      abortRef.current = null;
    }
  };

  return (
    <aside
      aria-label="Antigravity Build Studio"
      className={`fixed top-14 right-0 bottom-0 w-[520px] max-w-[95vw] z-40 flex flex-col border-l shadow-2xl ${
        isDark
          ? 'bg-[#12161e] border-white/10 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/15 text-indigo-500 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                className="text-sm font-semibold tracking-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Build Agent
              </h2>
              {status && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    status.available
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {status.available ? (
                    <>
                      <CheckCircle2 className="w-2.5 h-2.5" /> Ready
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-2.5 h-2.5" /> Offline
                    </>
                  )}
                </span>
              )}
            </div>
            {activeModel && (
              <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {activeModel.name}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => window.location.reload()}
            title="Reload viewport to load modified 3D files"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
              needsReload
                ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm'
                : isDark
                  ? 'hover:bg-white/10 text-slate-300'
                  : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reload
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            title="Build settings (directory, mode, session)"
            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
              showSettings
                ? isDark
                  ? 'bg-white/15 text-white'
                  : 'bg-slate-200 text-slate-900'
                : isDark
                  ? 'hover:bg-white/10 text-slate-400'
                  : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          {runs.length > 0 && (
            <button
              type="button"
              onClick={() => setRuns([])}
              title="Clear history"
              className={`p-1.5 rounded-lg cursor-pointer ${
                isDark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className={`p-1.5 rounded-lg cursor-pointer ${
              isDark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Collapsible Settings Bar */}
      {showSettings && (
        <div
          className={`px-4 py-3 border-b flex flex-col gap-2.5 text-xs ${
            isDark ? 'border-white/10 bg-[#171c26]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 shrink-0 opacity-60" />
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="Working directory"
              className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                isDark
                  ? 'bg-[#0f131a] border-white/10 text-slate-200'
                  : 'bg-white border-slate-300 text-slate-800'
              }`}
            />
            {status?.sotRoot && status.sotRoot !== status.defaultCwd && (
              <button
                type="button"
                onClick={() => setCwd(cwd === status.sotRoot ? status.defaultCwd : status.sotRoot)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                  isDark
                    ? 'border-white/15 hover:bg-white/10 text-slate-300'
                    : 'border-slate-300 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {cwd === status.sotRoot ? 'App Dir' : 'SOT Root'}
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2">
              <span className="opacity-70">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'accept-edits' | 'auto' | 'plan')}
                className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${
                  isDark
                    ? 'bg-[#0f131a] border-white/10 text-slate-200'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value="auto">Auto</option>
                <option value="accept-edits">Accept Edits</option>
                <option value="plan">Plan Only</option>
              </select>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={continueConv}
                onChange={(e) => setContinueConv(e.target.checked)}
                className="rounded"
              />
              <span className="opacity-80">Continue session</span>
            </label>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <div
        className={`flex-1 overflow-y-auto px-4 py-4 space-y-4 ${
          isDark ? 'bg-[#0e1219]' : 'bg-slate-50/75'
        }`}
      >
        {runs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 space-y-4">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                isDark ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
              }`}
            >
              <Cpu className="w-5 h-5" />
            </div>
            <div className="space-y-1 max-w-xs">
              <h3 className="text-sm font-semibold">Build or refine any 3D model</h3>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Describe changes, build a new workcell, or paste/drop a screenshot markup directly into the box below.
              </p>
            </div>
            <div className="w-full max-w-sm space-y-1.5 pt-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={status?.available === false}
                  onClick={() => handleRun(q)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer disabled:opacity-40 ${
                    isDark
                      ? 'bg-[#151a24] border-white/10 text-slate-300 hover:border-indigo-400/50 hover:text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          runs.map((run) => {
            const doneCount = run.steps.filter((s) => s.state === 'DONE').length;
            const activeStep = [...run.steps].reverse().find((s) => s.state === 'ACTIVE');
            const elapsedMs =
              run.status === 'running'
                ? nowTick - run.startedAt
                : (run.durationSeconds ?? 0) * 1000;

            return (
              <div key={run.id} className="space-y-2.5">
                {/* User Prompt Bubble */}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 border ${
                    isDark
                      ? 'bg-indigo-500/15 border-indigo-400/25 text-indigo-100'
                      : 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  }`}
                >
                  {run.images && run.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {run.images.map((img) => (
                        <img
                          key={img.id}
                          src={img.dataUrl}
                          alt={img.name}
                          title={img.name}
                          className="h-16 w-auto rounded-lg border border-white/25 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{run.prompt}</p>
                </div>

                {/* Progress / Steps Card */}
                <div
                  className={`rounded-2xl border overflow-hidden ${
                    isDark
                      ? 'bg-[#151a24] border-white/10'
                      : 'bg-white border-slate-200/90 shadow-xs'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      updateRun(run.id, (r) => ({ ...r, stepsExpanded: !r.stepsExpanded }))
                    }
                    className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs cursor-pointer transition-colors ${
                      isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {run.status === 'running' ? (
                        <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin shrink-0" />
                      ) : run.status === 'done' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : run.status === 'stopped' ? (
                        <Square className="w-3 h-3 text-amber-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      )}

                      <span className="font-medium truncate">
                        {run.status === 'running'
                          ? activeStep
                            ? formatStepLabel(activeStep, run.steps.length - 1)
                            : run.response
                              ? 'Writing summary...'
                              : 'Thinking...'
                          : run.status === 'done'
                            ? `Completed${run.steps.length > 0 ? ` · ${run.steps.length} step${run.steps.length === 1 ? '' : 's'}` : ''}`
                            : run.status === 'stopped'
                              ? 'Stopped by user'
                              : 'Build failed'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {run.status === 'running' && run.steps.length > 0 && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] ${
                            isDark
                              ? 'bg-white/10 text-slate-300'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {doneCount}/{run.steps.length}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[11px] tabular-nums ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        <Clock className="w-3 h-3 opacity-70" />
                        {formatElapsed(elapsedMs)}
                      </span>
                      {run.steps.length > 0 &&
                        (run.stepsExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                        ))}
                    </div>
                  </button>

                  {/* Animated Progress Bar while running */}
                  {run.status === 'running' && (
                    <div className={`h-0.5 w-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                      <div className="h-full w-1/2 bg-indigo-500/80 animate-pulse rounded-full" />
                    </div>
                  )}

                  {/* Collapsible Step List */}
                  {run.stepsExpanded && run.steps.length > 0 && (
                    <div
                      className={`px-3.5 py-2.5 border-t space-y-1.5 max-h-48 overflow-y-auto ${
                        isDark ? 'border-white/10 bg-[#10141c]' : 'border-slate-100 bg-slate-50/70'
                      }`}
                    >
                      {run.steps.map((step, i) => (
                        <div key={step.key} className="flex items-center gap-2 text-[11px]">
                          {step.state === 'ACTIVE' ? (
                            <Loader2 className="w-3 h-3 text-indigo-500 animate-spin shrink-0" />
                          ) : step.state === 'ERROR' ? (
                            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                          ) : (
                            <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                          )}
                          <Wrench className="w-3 h-3 opacity-40 shrink-0" />
                          <span
                            className={`truncate ${
                              step.state === 'ACTIVE'
                                ? isDark
                                  ? 'text-indigo-300 font-medium'
                                  : 'text-indigo-700 font-medium'
                                : isDark
                                  ? 'text-slate-400'
                                  : 'text-slate-600'
                            }`}
                          >
                            {formatStepLabel(step, i)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Agent Response */}
                  {run.response.trim() && (
                    <div
                      className={`px-3.5 py-3 border-t ${
                        isDark ? 'border-white/10 text-slate-200' : 'border-slate-100 text-slate-800'
                      }`}
                    >
                      <FormattedResponse text={run.response} isDark={isDark} />
                    </div>
                  )}

                  {/* Error / Stderr */}
                  {(run.error || run.stderr.trim()) && (
                    <div className="px-3.5 py-2.5 border-t border-rose-500/20 bg-rose-500/10 text-rose-500 text-[11px] font-mono whitespace-pre-wrap break-words">
                      {run.error || run.stderr.trim()}
                    </div>
                  )}

                  {/* Reload Prompt Banner on Success */}
                  {run.status === 'done' && (
                    <div
                      className={`px-3.5 py-2 border-t flex items-center justify-between text-[11px] ${
                        isDark
                          ? 'border-white/10 bg-emerald-500/10 text-emerald-300'
                          : 'border-emerald-100 bg-emerald-50/80 text-emerald-800'
                      }`}
                    >
                      <span>Files updated — reload to view changes</span>
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" /> Reload
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>

      {/* Composer */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) {
            addImageFiles(e.dataTransfer.files);
          }
        }}
        className={`p-3 border-t transition-colors ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : isDark
              ? 'border-white/10 bg-[#141820]'
              : 'border-slate-200 bg-white'
        }`}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5">
            {attachments.map((img) => (
              <div
                key={img.id}
                className={`relative group rounded-lg overflow-hidden border ${
                  isDark ? 'border-white/15 bg-[#0f131a]' : 'border-slate-300 bg-slate-100'
                }`}
              >
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  title={img.name}
                  className="h-14 w-auto max-w-[120px] object-cover block"
                />
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== img.id))}
                  title="Remove image"
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white hover:bg-rose-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              addImageFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        <div
          className={`rounded-xl border transition-colors ${
            isDark
              ? 'bg-[#0f131a] border-white/15 focus-within:border-indigo-400/60'
              : 'bg-slate-50 border-slate-300 focus-within:border-indigo-500 focus-within:bg-white'
          }`}
        >
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleRun();
              }
            }}
            placeholder="Describe a build or edit... Paste or drop screenshot markups (Ctrl+Enter)"
            disabled={running || status?.available === false}
            className="w-full px-3 pt-2.5 pb-1 text-xs bg-transparent resize-none focus:outline-none"
          />

          <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={running}
                title="Attach image or screenshot markup"
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg cursor-pointer disabled:opacity-40 transition-colors ${
                  isDark
                    ? 'hover:bg-white/10 text-slate-300'
                    : 'hover:bg-slate-200/70 text-slate-600'
                }`}
              >
                <ImagePlus className="w-3.5 h-3.5" /> Image
              </button>
              {onCaptureViewportFrame && (
                <button
                  type="button"
                  onClick={handleCaptureViewport}
                  disabled={running}
                  title="Capture current 3D viewport frame"
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg cursor-pointer disabled:opacity-40 transition-colors ${
                    isDark
                      ? 'hover:bg-white/10 text-slate-300'
                      : 'hover:bg-slate-200/70 text-slate-600'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" /> Viewport
                </button>
              )}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-200/60 text-slate-500'
                }`}
              >
                {mode}
              </span>
            </div>

            {running ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleRun()}
                disabled={!prompt.trim() || status?.available === false}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Play className="w-3 h-3" /> Build
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
