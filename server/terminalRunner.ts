/**
 * Unified Coding Agent (Antigravity `agy` / Claude Code `claude`) + PowerShell Terminal Runner
 * scoped to `%SOT_ROOT%\apps\18d`.
 *
 * Allows natural-language chat & code-build requests (without 3D-model prompt hijacking)
 * as well as direct PowerShell commands from localhost, LAN, or Tailscale tailnet clients.
 */
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type express from 'express';
import { resolveAgyBinary } from './agyRunner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type TerminalMode = 'agy' | 'claude' | 'shell';

const activeTermJobs = new Map<string, ChildProcess>();

export function resolve18dAppRoot(): string {
  if (process.env.SOT_18D_ROOT && fs.existsSync(process.env.SOT_18D_ROOT)) {
    return path.resolve(process.env.SOT_18D_ROOT);
  }
  return path.resolve(__dirname, '..');
}

export function resolveSotRoot(): string {
  if (process.env.SOT_ROOT && fs.existsSync(process.env.SOT_ROOT)) {
    return path.resolve(process.env.SOT_ROOT);
  }
  return path.resolve(resolve18dAppRoot(), '..', '..');
}

export function resolveClaudeBinary(): string | null {
  const candidates: string[] = [];
  if (process.env.CLAUDE_BIN) candidates.push(process.env.CLAUDE_BIN);
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'));
    candidates.push(path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm', 'claude.cmd'));
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  // Fallback to PATH lookup
  return process.platform === 'win32' ? 'claude.exe' : 'claude';
}

/** Allow loopback (127.0.0.1, ::1), private LAN, and Tailscale CGNAT (100.64.0.0/10) clients only. */
export function isLocalOrTailscaleRequest(req: express.Request): boolean {
  const rawIp = String(req.socket?.remoteAddress || req.ip || '').trim();
  if (!rawIp) return false;
  if (rawIp === '127.0.0.1' || rawIp === '::1' || rawIp === '::ffff:127.0.0.1') {
    return true;
  }
  const v4 = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
  const parts = v4.split('.').map((n) => Number(n));
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168)) return true;
  }
  return false;
}

function resolveSafeCwd(requestedCwd?: string): string {
  const appRoot = resolve18dAppRoot();
  const sotRoot = resolveSotRoot();
  if (typeof requestedCwd === 'string' && requestedCwd.trim()) {
    const resolved = path.resolve(appRoot, requestedCwd.trim());
    const relToSot = path.relative(sotRoot, resolved);
    if (!relToSot.startsWith('..') && !path.isAbsolute(relToSot) && fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return appRoot;
}

export function getTerminalStatus(req: express.Request) {
  const appRoot = resolve18dAppRoot();
  const sotRoot = resolveSotRoot();
  const agyBin = resolveAgyBinary();
  const claudeBin = resolveClaudeBinary();
  return {
    available: isLocalOrTailscaleRequest(req),
    shell: process.platform === 'win32' ? 'powershell.exe' : 'bash',
    agyAvailable: Boolean(agyBin),
    claudeAvailable: Boolean(claudeBin),
    appRoot,
    sotRoot,
    activeJobs: activeTermJobs.size,
  };
}

export function cancelTerminalJob(jobId: string): boolean {
  const child = activeTermJobs.get(jobId);
  if (!child) return false;
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
  activeTermJobs.delete(jobId);
  return true;
}

function sendSse(res: express.Response, event: string, data: unknown) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function handleTerminalRun(req: express.Request, res: express.Response) {
  if (!isLocalOrTailscaleRequest(req)) {
    res.status(403).json({
      error: 'Terminal access is restricted to localhost, LAN, or Tailscale tailnet clients.',
    });
    return;
  }

  const {
    command,
    cwd,
    mode = 'agy',
    continueConversation = false,
  } = req.body || {};

  if (typeof command !== 'string' || !command.trim()) {
    res.status(400).json({ error: 'Input is required.' });
    return;
  }

  const targetCwd = resolveSafeCwd(cwd);
  let trimmed = command.trim();
  let effectiveMode: TerminalMode =
    mode === 'shell' || mode === 'claude' || mode === 'agy' ? mode : 'agy';

  // Inline `!command` shortcut always executes in PowerShell even when in chat mode
  if (trimmed.startsWith('!') && trimmed.length > 1) {
    effectiveMode = 'shell';
    trimmed = trimmed.slice(1).trim();
  }

  // Handle pure `cd <dir>` fast-path in shell mode
  if (effectiveMode === 'shell') {
    const cdMatch = trimmed.match(/^cd\s+(.+)$/i);
    if (cdMatch && !trimmed.includes('&&') && !trimmed.includes(';')) {
      const rawTarget = cdMatch[1].trim().replace(/^["']|["']$/g, '');
      const candidate = path.resolve(targetCwd, rawTarget);
      const sotRoot = resolveSotRoot();
      const rel = path.relative(sotRoot, candidate);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      if (
        !rel.startsWith('..') &&
        !path.isAbsolute(rel) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isDirectory()
      ) {
        sendSse(res, 'cwd', { cwd: candidate });
        sendSse(res, 'done', { code: 0, cwd: candidate });
      } else {
        sendSse(res, 'stderr', { text: `Directory not found or outside SOT root: ${rawTarget}\n` });
        sendSse(res, 'done', { code: 1, cwd: targetCwd });
      }
      res.end();
      return;
    }
  }

  const jobId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let bin: string;
  let args: string[];

  if (effectiveMode === 'agy') {
    const agyBin = resolveAgyBinary();
    if (!agyBin) {
      sendSse(res, 'stderr', { text: 'Antigravity CLI (agy.exe) not found.\n' });
      sendSse(res, 'done', { code: 1, cwd: targetCwd });
      res.end();
      return;
    }
    bin = agyBin;
    args = ['-p', trimmed, '--mode', 'accept-edits', '--output-format', 'stream-json', '--dangerously-skip-permissions'];
    if (continueConversation) args.push('--continue');
  } else if (effectiveMode === 'claude') {
    const claudeBin = resolveClaudeBinary();
    if (!claudeBin) {
      sendSse(res, 'stderr', { text: 'Claude CLI (claude.exe) not found.\n' });
      sendSse(res, 'done', { code: 1, cwd: targetCwd });
      res.end();
      return;
    }
    bin = claudeBin;
    args = ['-p', trimmed, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits'];
    if (continueConversation) args.push('--continue');
  } else {
    const isWin = process.platform === 'win32';
    bin = isWin ? 'powershell.exe' : '/bin/bash';
    args = isWin
      ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', trimmed]
      : ['-lc', trimmed];
  }

  sendSse(res, 'start', { jobId, cwd: targetCwd, mode: effectiveMode, command: trimmed });

  const child = spawn(bin, args, {
    cwd: targetCwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SOT_ROOT: resolveSotRoot(),
      SOT_18D_ROOT: resolve18dAppRoot(),
    },
    windowsHide: true,
  });

  activeTermJobs.set(jobId, child);

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15_000);

  if (effectiveMode === 'shell') {
    child.stdout?.on('data', (chunk: Buffer) => {
      sendSse(res, 'stdout', { text: chunk.toString('utf8') });
    });
  } else {
    // Parse stream-json events from agy / claude into clean text + tool-step events
    let lineBuf = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      lineBuf += chunk.toString('utf8');
      const lines = lineBuf.split(/\r?\n/);
      lineBuf = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          // Antigravity (`agy`) stream-json format
          if (evt.event === 'step_update' && evt.step_update) {
            const su = evt.step_update;
            if (typeof su.text_delta === 'string' && su.text_delta.length > 0) {
              sendSse(res, 'stdout', { text: su.text_delta });
            } else if (
              su.step_type &&
              su.step_type !== 'user_input' &&
              su.step_type !== 'agent_response' &&
              su.step_type !== 'system_message'
            ) {
              sendSse(res, 'step', {
                label: su.detail || su.tool_name || su.step_type,
                state: su.state || 'ACTIVE',
              });
            }
            continue;
          }
          // Claude Code (`claude`) stream-json format
          if (evt.type === 'assistant' && evt.message?.content) {
            for (const block of evt.message.content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                sendSse(res, 'stdout', { text: block.text });
              } else if (block.type === 'tool_use' && block.name) {
                sendSse(res, 'step', { label: block.name, state: 'ACTIVE' });
              }
            }
            continue;
          }
          if (evt.type === 'content_block_delta' && evt.delta?.text) {
            sendSse(res, 'stdout', { text: evt.delta.text });
            continue;
          }
          if (evt.type === 'result' && typeof evt.result === 'string' && evt.is_error) {
            sendSse(res, 'stderr', { text: `${evt.result}\n` });
          }
        } catch {
          // Non-JSON plain output fallback
          sendSse(res, 'stdout', { text: `${line}\n` });
        }
      }
    });
  }

  child.stderr?.on('data', (chunk: Buffer) => {
    sendSse(res, 'stderr', { text: chunk.toString('utf8') });
  });

  child.on('error', (err) => {
    clearInterval(heartbeat);
    activeTermJobs.delete(jobId);
    sendSse(res, 'stderr', { text: `${err.message}\n` });
    sendSse(res, 'done', { code: 1, cwd: targetCwd });
    if (!res.writableEnded) res.end();
  });

  child.on('close', (code) => {
    clearInterval(heartbeat);
    activeTermJobs.delete(jobId);
    sendSse(res, 'done', { code: code ?? 0, cwd: targetCwd });
    if (!res.writableEnded) res.end();
  });

  res.on('close', () => {
    clearInterval(heartbeat);
    if (!res.writableEnded && activeTermJobs.has(jobId)) {
      cancelTerminalJob(jobId);
    }
  });
}
