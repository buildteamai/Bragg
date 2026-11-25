import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type express from 'express';

export type AgyMode = 'accept-edits' | 'auto' | 'plan';

export interface AgyImageAttachment {
  name?: string;
  dataUrl: string;
}

const activeJobs = new Map<string, ChildProcess>();

export function resolveAgyBinary(): string | null {
  const candidates: string[] = [];
  if (process.env.AGY_BIN) {
    candidates.push(process.env.AGY_BIN);
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe'));
  }
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, 'AppData', 'Local', 'agy', 'bin', 'agy.exe'));
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getAgyStatus() {
  const bin = resolveAgyBinary();
  const defaultCwd = process.cwd();
  const sotRoot = process.env.SOT_ROOT || path.resolve(defaultCwd, '..', '..');
  return {
    available: Boolean(bin),
    bin,
    defaultCwd,
    sotRoot: fs.existsSync(sotRoot) ? sotRoot : defaultCwd,
  };
}

export function cancelAgyJob(jobId: string): boolean {
  const child = activeJobs.get(jobId);
  if (!child) return false;
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
  activeJobs.delete(jobId);
  return true;
}

function sendSse(res: express.Response, event: string, data: unknown) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function saveAttachments(jobId: string, attachments: unknown): string[] {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  // SOT rule: app runtime data lives in %LOCALAPPDATA%\sot\<app>, never in the SOT tree or %TEMP%
  const runtimeRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'sot', '18d')
    : path.join(os.tmpdir(), 'sot', '18d');
  const dir = path.join(runtimeRoot, 'agy-attachments', jobId);
  fs.mkdirSync(dir, { recursive: true });
  const savedPaths: string[] = [];

  attachments.forEach((item: any, idx: number) => {
    const dataUrl = typeof item?.dataUrl === 'string' ? item.dataUrl : '';
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return;
    const rawExt = match[1].toLowerCase().replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'png';
    const rawName = typeof item?.name === 'string' ? path.basename(item.name) : `image-${idx + 1}.${rawExt}`;
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_') || `image-${idx + 1}.${rawExt}`;
    const finalName = path.extname(safeName) ? safeName : `${safeName}.${rawExt}`;
    const outPath = path.join(dir, `${idx + 1}-${finalName}`);
    fs.writeFileSync(outPath, Buffer.from(match[2], 'base64'));
    savedPaths.push(outPath);
  });

  return savedPaths;
}

export function handleAgyRun(req: express.Request, res: express.Response) {
  const {
    prompt,
    mode = 'accept-edits',
    cwd,
    continueConversation = false,
    attachments = [],
    activeModel,
  } = req.body || {};

  if (typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'Prompt is required.' });
    return;
  }

  const bin = resolveAgyBinary();
  if (!bin) {
    res.status(500).json({
      error: 'Antigravity CLI (agy.exe) not found. Set AGY_BIN or install agy in %LOCALAPPDATA%\\agy\\bin\\agy.exe.',
    });
    return;
  }

  const validModes: AgyMode[] = ['accept-edits', 'auto', 'plan'];
  const safeMode: AgyMode = validModes.includes(mode) ? mode : 'accept-edits';
  const targetCwd =
    typeof cwd === 'string' && cwd.trim() && fs.existsSync(cwd.trim())
      ? path.resolve(cwd.trim())
      : process.cwd();

  const jobId = `agy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const attachmentPaths = saveAttachments(jobId, attachments);

  const contextLines: string[] = [];
  if (activeModel && typeof activeModel.name === 'string') {
    contextLines.push(
      `Active 3D model in 18D viewport: "${activeModel.name}" (id: ${activeModel.id || 'unknown'}). Blueprint files live in src/data/.`
    );
  }
  contextLines.push(
    '18D deterministic CAD kernel rules (all builds and modifications run through this CLI; there is no orchestrator): ' +
      'each model is a MeshBlueprint in src/data/<name>Blueprint.ts (types in src/types/blueprint.ts; mm, Y-up, Y=0 ground; SOT OpenUSD export converts to Z-up inches). ' +
      'PREFER exact watertight manifold-3d CSG ops (`geometry.kind = "csgSolid"`) over stacked raw boxes/cylinders: ' +
      '`curvedLoft` (PCHIP C1 non-overshooting spine + Bishop frames + asymmetric halfAPos/halfANeg/halfBPos/halfBNeg + startCapStyle/endCapStyle flat|domed|beveled), ' +
      '`filletedJunction` (C1 flared neck/collar/boss transition), `taperedSlotCutter` (V-slot/keyway/chamfered groove cutter for `subtract`), ' +
      '`superellipseLoft`, `blendedBoss`, `blendedCowl`, `conformalPatch`, `machinedBlock`, `sheetMetalFold`, `revolve`, `sweep`, `panelSeam`, `shellWall`, `union`, `subtract`, `intersect`. ' +
      'For mounting features/decals onto curved lofts, use `evaluateCurvedLoftDatum` from src/engine/spineMath.ts instead of guessing coordinates. ' +
      'To MODIFY the active model, edit its blueprint file. To BUILD a new model, create src/data/<name>Blueprint.ts ' +
      'modeled on an existing blueprint, then import it and add an entry to SESSION_MODELS in src/App.tsx. ' +
      'After editing, run `npx tsc --noEmit` and `npm run test:geom` in the app folder and fix every error before finishing. ' +
      'End with a short list of the files you changed.'
  );
  contextLines.push(
    'Global SOT Signage, Nameplates & Markings (Setups/rules/signage.json, Setups/lib/signage.py): supports ANSI Z535 (`ansi_signal`), ISO 7010/3864 (`iso_pictogram`), NFPA 704 (`nfpa_704`), ASME A13.1 pipe markers (`asme_pipe_marker`), OEM/UL/CE rating plates (`rating_nameplate`), phenolic/LOTO tags (`phenolic_tag`), crane capacity (`crane_capacity`), and QR asset tags (`asset_qr_tag`). In 18D blueprints, attach a ProjectedDecalSpec with `signage: { template, ... }` (or `necDecalId` shorthand); for USD/SVG, use `Setups/lib/signage.py`.'
  );
  contextLines.push(
    'Machine Installation Envelope (MeshBlueprint.installation): whenever building or upgrading a machine/workcell, author `installation: { operatorSide, underCrane, floorZones, utilities }` alongside the geometry! ' +
      'Include `floorZones` for `operator` (operator standing/loading mat), `electrical_clearance` (NEC 110.26 36 in = 914.4 mm min depth × 30 in = 762 mm min width in front of electrical cabinets/disconnects), `door_swing` (hinged cabinet/enclosure door arcs), `service_access` (pull-out/maintenance zones), and `material_flow` (infeed/outfeed). ' +
      'Include `utilities` for every machine connection (`electrical`, `pneumatic`, `gas`, `exhaust`, `water_supply`, `water_return`, `drain`, `network`) with exact `positionMm`, `floorPointMm`, `routing` (`floor_stub` under cranes, `overhead_drop`, `rear_manifold`, `side_panel`), `spec`, and `pipeOrConduitSize`.'
  );
  if (attachmentPaths.length > 0) {
    const list = attachmentPaths.map((p) => `- ${p}`).join('\n');
    contextLines.push(`Attached image(s) / screenshot markup(s) (inspect them with read_file):\n${list}`);
  }
  const fullPrompt =
    contextLines.length > 0 ? `${contextLines.join('\n\n')}\n\n${prompt.trim()}` : prompt.trim();

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const args = ['-p', fullPrompt, '--mode', safeMode, '--output-format', 'stream-json'];
  if (safeMode !== 'plan') {
    args.push('--dangerously-skip-permissions');
  }
  if (continueConversation) {
    args.push('--continue');
  }

  sendSse(res, 'start', { jobId, bin, cwd: targetCwd, mode: safeMode, attachmentCount: attachmentPaths.length });

  const child = spawn(bin, args, {
    cwd: targetCwd,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  activeJobs.set(jobId, child);

  let stdoutBuffer = '';
  child.stdout?.on('data', (buf: Buffer) => {
    stdoutBuffer += buf.toString('utf8');
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.event === 'step_update' && evt.step_update) {
          const su = evt.step_update;
          if (typeof su.text_delta === 'string' && su.text_delta.length > 0) {
            sendSse(res, 'stdout', { chunk: su.text_delta });
          } else if (
            su.step_type &&
            su.step_type !== 'user_input' &&
            su.step_type !== 'agent_response' &&
            su.step_type !== 'system_message'
          ) {
            const toolName =
              (typeof su.tool_name === 'string' && su.tool_name) ||
              (typeof su.tool === 'string' && su.tool) ||
              (typeof su.name === 'string' && su.name) ||
              (typeof su.tool_call?.name === 'string' && su.tool_call.name) ||
              undefined;
            const detail =
              (typeof su.summary === 'string' && su.summary) ||
              (typeof su.tool_summary === 'string' && su.tool_summary) ||
              (typeof su.title === 'string' && su.title) ||
              (typeof su.description === 'string' && su.description) ||
              (typeof su.file_path === 'string' && su.file_path) ||
              (typeof su.path === 'string' && su.path) ||
              (typeof su.command === 'string' && su.command) ||
              undefined;
            sendSse(res, 'step', {
              stepType: su.step_type,
              state: su.state,
              stepIndex: su.step_index,
              toolName,
              detail,
            });
          }
        } else if (evt.event === 'result' && evt.result) {
          sendSse(res, 'result', {
            status: evt.result.status,
            durationSeconds: evt.result.duration_seconds,
            conversationId: evt.result.conversation_id,
          });
        }
      } catch {
        // Non-JSON line: forward raw
        sendSse(res, 'stdout', { chunk: rawLine + '\n' });
      }
    }
  });

  child.stderr?.on('data', (buf: Buffer) => {
    sendSse(res, 'stderr', { chunk: buf.toString('utf8') });
  });

  child.on('error', (err) => {
    activeJobs.delete(jobId);
    sendSse(res, 'error', { message: err.message });
    if (!res.writableEnded) res.end();
  });

  child.on('close', (code, signal) => {
    activeJobs.delete(jobId);
    sendSse(res, 'done', { code, signal });
    if (!res.writableEnded) res.end();
  });

  res.on('close', () => {
    if (!res.writableEnded && activeJobs.has(jobId)) {
      cancelAgyJob(jobId);
    }
  });
}
