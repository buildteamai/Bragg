import React, { useEffect, useRef, useState } from 'react';
import {
  FolderOpen,
  MessageSquarePlus,
  Send,
  Square,
  Terminal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';

interface TerminalDrawerProps {
  open: boolean;
  onClose: () => void;
}

type TerminalMode = 'agy' | 'claude' | 'shell';

interface TerminalEntry {
  id: string;
  mode: TerminalMode;
  command: string;
  cwd: string;
  steps: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  running: boolean;
}

const MODE_OPTIONS: { id: TerminalMode; label: string; hint: string }[] = [
  { id: 'agy', label: 'Antigravity', hint: 'Chat & code builds via agy.exe in apps\\18d' },
  { id: 'claude', label: 'Claude', hint: 'Chat & code builds via claude.exe in apps\\18d' },
  { id: 'shell', label: 'PowerShell', hint: 'Direct PowerShell commands in apps\\18d' },
];

const QUICK_ACTIONS: { label: string; mode: TerminalMode; cmd: string }[] = [
  { label: '!test:geom', mode: 'shell', cmd: 'npm run test:geom' },
  { label: '!build', mode: 'shell', cmd: 'npm run build' },
  { label: '!git status', mode: 'shell', cmd: 'git status -sb' },
  { label: 'Explain architecture', mode: 'agy', cmd: 'Summarize the 18D app structure and key files in apps/18d.' },
];

export function TerminalDrawer({ open, onClose }: TerminalDrawerProps) {
  const [mode, setMode] = useState<TerminalMode>('agy');
  const [appRoot, setAppRoot] = useState<string>('C:\\sot\\apps\\18d');
  const [sotRoot, setSotRoot] = useState<string>('C:\\sot');
  const [cwd, setCwd] = useState<string>('C:\\sot\\apps\\18d');
  const [available, setAvailable] = useState<boolean>(true);
  const [continueChat, setContinueChat] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/terminal/status')
      .then((r) => r.json())
      .then((d) => {
        setAvailable(Boolean(d.available));
        if (d.appRoot) {
          setAppRoot(d.appRoot);
          setCwd((prev) => (prev === 'C:\\sot\\apps\\18d' ? d.appRoot : prev));
        }
        if (d.sotRoot) setSotRoot(d.sotRoot);
      })
      .catch(() => setAvailable(false));
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [entries]);

  if (!open) return null;

  const isRunning = activeJobId !== null;

  const runRequest = async (rawText: string, overrideMode?: TerminalMode) => {
    const trimmed = rawText.trim();
    if (!trimmed || isRunning) return;

    const reqMode: TerminalMode = trimmed.startsWith('!')
      ? 'shell'
      : overrideMode ?? mode;

    setInput('');
    setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 50));
    setHistoryIdx(-1);

    const entryId = `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEntries((prev) => [
      ...prev,
      {
        id: entryId,
        mode: reqMode,
        command: trimmed,
        cwd,
        steps: [],
        stdout: '',
        stderr: '',
        exitCode: null,
        running: true,
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          command: trimmed,
          cwd,
          mode: reqMode,
          continueConversation: reqMode !== 'shell' && continueChat,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, running: false, exitCode: 1, stderr: errText || `HTTP ${res.status}` }
              : e
          )
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim() || block.startsWith(':')) continue;
          let eventName = 'message';
          let dataStr = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const payload = JSON.parse(dataStr);
            if (eventName === 'start' && payload.jobId) {
              setActiveJobId(payload.jobId);
            } else if (eventName === 'cwd' && payload.cwd) {
              setCwd(payload.cwd);
            } else if (eventName === 'step' && payload.label) {
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === entryId && !e.steps.includes(payload.label)
                    ? { ...e, steps: [...e.steps.slice(-14), String(payload.label)] }
                    : e
                )
              );
            } else if (eventName === 'stdout' && payload.text) {
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === entryId ? { ...e, stdout: e.stdout + String(payload.text) } : e
                )
              );
            } else if (eventName === 'stderr' && payload.text) {
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === entryId ? { ...e, stderr: e.stderr + String(payload.text) } : e
                )
              );
            } else if (eventName === 'done') {
              if (payload.cwd) setCwd(payload.cwd);
              if (reqMode !== 'shell' && Number(payload.code ?? 0) === 0) {
                setContinueChat(true);
              }
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === entryId
                    ? { ...e, running: false, exitCode: Number(payload.code ?? 0) }
                    : e
                )
              );
              setActiveJobId(null);
            }
          } catch {
            // ignore malformed SSE chunk
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? {
                  ...e,
                  running: false,
                  exitCode: 1,
                  stderr: e.stderr + `${err?.message || 'Connection error'}\n`,
                }
              : e
          )
        );
      }
    } finally {
      setActiveJobId(null);
      abortRef.current = null;
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const handleStop = async () => {
    if (activeJobId) {
      await fetch('/api/terminal/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: activeJobId }),
      }).catch(() => {});
    }
    abortRef.current?.abort();
    setActiveJobId(null);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/35 pointer-events-auto"
      onClick={onClose}
    >
      <aside
        aria-label="18D SOT Terminal CLI"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-[#0d1117] text-slate-100 border-l border-white/10 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">18D SOT Terminal CLI</h2>
              <p className="text-[11px] font-mono text-slate-400 truncate">{cwd}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setCwd(cwd === appRoot ? sotRoot : appRoot)}
              title="Toggle working folder between apps\18d and SOT root"
              className="px-2.5 py-1 text-[11px] font-mono rounded-md border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 cursor-pointer flex items-center gap-1"
            >
              <FolderOpen className="w-3 h-3" />
              <span>{cwd === appRoot ? 'apps\\18d' : 'SOT root'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setContinueChat(false);
                setEntries([]);
              }}
              title="Start a fresh conversation & clear log"
              className="px-2 py-1 text-[11px] rounded-md border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 cursor-pointer flex items-center gap-1"
            >
              <MessageSquarePlus className="w-3 h-3" />
              <span>New</span>
            </button>
            <button
              type="button"
              onClick={() => setEntries([])}
              title="Clear screen"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close terminal"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Switcher + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 border-b border-white/10 bg-[#131922] shrink-0">
          <div className="flex items-center gap-1 bg-black/30 p-0.5 rounded-lg border border-white/10">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                title={opt.hint}
                disabled={isRunning}
                onClick={() => setMode(opt.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md cursor-pointer transition-colors ${
                  mode === opt.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={isRunning || !available}
                onClick={() => void runRequest(q.cmd, q.mode)}
                className="px-2 py-1 text-[11px] font-mono rounded-md border border-white/12 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation & Command Stream */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs leading-relaxed"
        >
          {!available && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-rose-200">
              Terminal access is restricted to localhost, LAN, or Tailscale tailnet clients.
            </div>
          )}
          {entries.length === 0 && available && (
            <div className="text-slate-400 space-y-1.5 font-mono text-[11.5px]">
              <div>
                Connected to <span className="text-emerald-400">{cwd}</span> ({mode})
              </div>
              <div>
                • Ask questions or request code edits &amp; builds directly in <span className="text-slate-200">Antigravity</span> or <span className="text-slate-200">Claude</span> mode.
              </div>
              <div>
                • Prefix any line with <span className="text-amber-300">!</span> (e.g. <span className="text-slate-200">!npm run test:geom</span>) or switch to <span className="text-slate-200">PowerShell</span> for raw shell commands.
              </div>
            </div>
          )}

          {entries.map((entry) => (
            <div key={entry.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-emerald-950/40 border border-emerald-500/25 px-3 py-2 text-slate-100 whitespace-pre-wrap break-words flex-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400 mr-2">
                    [{entry.mode}]
                  </span>
                  <span>{entry.command}</span>
                </div>
                <span
                  className={`font-mono text-[10px] pt-2 shrink-0 ${
                    entry.running
                      ? 'text-amber-400'
                      : entry.exitCode === 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                  }`}
                >
                  {entry.running ? 'running…' : `exit ${entry.exitCode}`}
                </span>
              </div>

              {entry.steps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-1">
                  {entry.steps.map((s, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[10px] text-slate-300"
                    >
                      <Wrench className="w-2.5 h-2.5 text-emerald-400" />
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {entry.stdout && (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] text-slate-200 bg-black/35 rounded-lg p-3 border border-white/8 overflow-x-auto">
                  {entry.stdout}
                </pre>
              )}

              {entry.stderr && (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] text-rose-300 bg-rose-950/25 rounded-lg p-3 border border-rose-500/20 overflow-x-auto">
                  {entry.stderr}
                </pre>
              )}
            </div>
          ))}
        </div>

        {/* Multi-line Chat / Command Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runRequest(input);
          }}
          className="flex items-end gap-2 px-4 py-3 border-t border-white/10 bg-[#131922] shrink-0"
        >
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            disabled={!available || isRunning}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void runRequest(input);
              } else if (e.key === 'ArrowUp' && !input && history.length > 0) {
                e.preventDefault();
                const next = Math.min(history.length - 1, historyIdx + 1);
                setHistoryIdx(next);
                setInput(history[next]);
              }
            }}
            placeholder={
              mode === 'shell'
                ? 'Enter PowerShell command in apps\\18d (Enter to run)...'
                : `Chat or request code builds in apps\\18d via ${mode} (Enter to send, Shift+Enter newline, !cmd for shell)...`
            }
            className="flex-1 bg-black/30 rounded-lg border border-white/12 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60 resize-none"
          />
          {isRunning ? (
            <button
              type="button"
              onClick={() => void handleStop()}
              className="px-3.5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!available || !input.trim()}
              className="px-3.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          )}
        </form>
      </aside>
    </div>
  );
}
