/** CommandCenter: "/goal Complete …" must create a turn, not treat "complete" as a verb. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startScriptedWorker } from './helpers/scripted-worker.mjs';
import { createAgentBridge } from '../server/agent/agent-bridge.mjs';
import { resolveHarness } from '../server/agent/harness-runtime.mjs';

const HARNESS = process.env.STRATA_HARNESS_DIR;
const skip = !HARNESS || !resolveHarness({ env: process.env }).ok ? 'STRATA_HARNESS_DIR is not set to a built Harness' : false;

test('goal lines with leading Complete/Resume text start agent turns', { skip }, async t => {
  const worker = await startScriptedWorker({});
  const dir = mkdtempSync(join(tmpdir(), 'strata-goal-verb-'));
  const ws = join(dir, 'ws');
  mkdirSync(ws, { recursive: true });
  const bridge = createAgentBridge({
    dataDir: dir,
    skillsDir: () => join(dir, 'skills'),
    tools: () => ({ off: new Set(), search: { provider: 'builtin' }, continuity: true }),
    localInstances: () => [{ id: 'i', label: 'S', baseUrl: worker.url, modelId: 'scripted-model', context: 32768, slots: 2 }],
    connections: () => [],
    env: process.env,
    startTimeoutMs: 120_000,
  });
  t.after(async () => {
    await bridge.close();
    await worker.close();
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ }
  });

  async function queuedId(line, chatId) {
    const frames = [];
    await bridge.goalCommand({ chatId, line, workspacePath: ws, mode: 'bypass', onFrame: f => frames.push(f) });
    return frames.find(f => f.type === 'queued')?.requestId ?? '';
  }

  assert.match(await queuedId('Complete life cycle milestone', 'gc1'), /^req-/);
  assert.match(await queuedId('Resume and complete the integration', 'gc2'), /^req-/);
});
