// Automatic compaction for a LOCAL model: it starts before the window is full, the chat goes on after it, and helpers get it too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startScriptedWorker } from './helpers/scripted-worker.mjs';
import { createAgentBridge } from '../server/agent/agent-bridge.mjs';
import { resolveHarness } from '../server/agent/harness-runtime.mjs';
import { buildProfile, compactionHeadroom, localOutputBudget } from '../server/agent/profile.mjs';

const HARNESS = process.env.STRATA_HARNESS_DIR;
const skip = !HARNESS || !resolveHarness({ env: process.env }).ok ? 'STRATA_HARNESS_DIR is not set to a built Harness' : false;

test('the reply keeps 30 percent of the window (at most 32K) and compaction gets a headroom that fits, for every window size', () => {
  assert.equal(localOutputBudget(32768), 9830); assert.equal(localOutputBudget(262144), 32768); assert.equal(localOutputBudget(8192), 4096); assert.equal(localOutputBudget(undefined), 9830);
  for (const w of [8192, 16384, 32768, 65536, 131072, 262144, 1_000_000]) {
    const out = localOutputBudget(w), head = compactionHeadroom(w, out);
    const threshold = Math.floor(Math.min(w * 0.8, w - out - head));
    assert.ok(threshold > 0, `window ${w}: a positive start point (${threshold})`);
    assert.ok(threshold >= (w - out) * 0.5, `window ${w}: compaction starts after at least half of the room the conversation has (${threshold})`);
    assert.ok(Math.floor((w - out) * 0.16) < threshold, `window ${w}: the verbatim tail is smaller than the start point`);
  }
  const profile = buildProfile({ local: [{ id: 'a', modelId: 'm', baseUrl: 'http://x', context: 32768 }], connections: [] });
  assert.match(profile.patch, /"modelPolicies": \[\s*\{\s*"provider": "strata-local",\s*"model": "m",\s*"headroomTokens": 2867/);
});

test('a long chat on a small window compacts before it overflows, and the conversation goes on', { skip }, async (t) => {
  const worker = await startScriptedWorker({});
  const dir = mkdtempSync(join(tmpdir(), 'strata-compact-'));
  const ws = join(dir, 'ws'); mkdirSync(ws, { recursive: true });
  const makeBridge = () => createAgentBridge({ dataDir: dir, skillsDir: () => join(dir, 'skills'), tools: () => ({ off: new Set(), search: { provider: 'builtin' }, continuity: true }), localInstances: () => [{ id: 'i', label: 'S', baseUrl: worker.url, modelId: 'scripted-model', context: 16384, slots: 2 }], connections: () => [], env: process.env, startTimeoutMs: 90_000 });
  let bridge = makeBridge();
  t.after(async () => { await bridge.close(); await worker.close(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ } });
  const big = 'alpha '.repeat(1500);
  const replies = [];
  for (let i = 0; i < 6; i++) {
    const frames = [];
    await bridge.runTurn({ chatId: 'long', message: `SCRIPT:echo round${i} ${big}`, workspacePath: ws, mode: 'bypass', onFrame: f => frames.push(f) });
    replies.push(frames.filter(f => f.type === 'delta' && !f.noteReason).map(f => f.text).join('').slice(0, 12));
    assert.equal(frames.at(-1).type, 'done', `round ${i} ended normally`);
  }
  assert.ok(replies.every(r => /^round\d/.test(r)), 'every round was answered: ' + replies.join(' | '));
  const reqs = worker.requests;
  const summaries = reqs.filter(r => r.summary);
  assert.ok(summaries.some(r => r.raw.includes('SAME ongoing chat')), 'continuity instructions reached the real summarization request');
  assert.ok(summaries.length >= 1, 'the Harness asked for a summary of the old history');
  const answers = reqs.filter(r => !r.summary && r.toolNames.length);
  const peak = Math.max(...answers.map(r => r.promptChars));
  assert.ok(peak < 16384 * 4, `no request was bigger than the window (about ${Math.round(peak / 4)} tokens of 16384)`);
  const lastRoundPrompt = answers.at(-1).promptChars;
  assert.ok(lastRoundPrompt < answers[Math.min(4, answers.length - 1)].promptChars + 1, 'the prompt stopped growing');
  const sessionId = bridge.sessionOf('long');
  await bridge.close();
  bridge = makeBridge();
  const resumed = [];
  await bridge.runTurn({ chatId: 'long', message: 'SCRIPT:echo resumed', workspacePath: ws, mode: 'bypass', onFrame: f => resumed.push(f) });
  assert.equal(bridge.sessionOf('long'), sessionId, 'reopening preserves the same durable session');
  assert.ok(resumed.some(f => f.type === 'delta' && f.text?.includes('resumed')));
  assert.equal(resumed.at(-1).type, 'done');
});
import { writeFileSync } from 'node:fs';
test('continuity bounds large reads before they enter the model prompt', { skip }, async t => {
 const worker=await startScriptedWorker({});const dir=mkdtempSync(join(tmpdir(),'strata-read-budget-'));const ws=join(dir,'ws');mkdirSync(ws);
 const file=join(ws,'large.txt');writeFileSync(file,Array.from({length:1500},(_,i)=>`LINE_${i}_`+'x'.repeat(60)).join('\n'));
 const bridge=createAgentBridge({dataDir:dir,skillsDir:()=>join(dir,'skills'),tools:()=>({off:new Set(),search:{provider:'builtin'},continuity:true}),localInstances:()=>[{id:'i',label:'S',baseUrl:worker.url,modelId:'scripted-model',context:65536,slots:2}],connections:()=>[],env:process.env,startTimeoutMs:90000});
 t.after(async()=>{await bridge.close();await worker.close();rmSync(dir,{recursive:true,force:true,maxRetries:3});});
 const frames=[];await bridge.runTurn({chatId:'read',message:`SCRIPT:read ${file}`,workspacePath:ws,mode:'bypass',onFrame:f=>frames.push(f)});
 assert.equal(frames.at(-1).type,'done');
 const toolMessages=worker.requests.flatMap(r=>JSON.parse(r.raw).messages??[]).filter(m=>m.role==='tool');
 assert.ok(toolMessages.length,'a read result reached the model');
 assert.ok(toolMessages.some(m=>JSON.stringify(m).includes('LINE_199_')),'first chunk available');
 assert.ok(toolMessages.every(m=>!JSON.stringify(m).includes('LINE_1499_')),'the whole file was not injected');
 assert.equal(worker.requests.filter(r=>r.summary).length,0,'one large file read does not force a summary');
 const before=worker.requests.length;
 await bridge.runTurn({chatId:'read',message:'SCRIPT:call pwsh '+JSON.stringify({command:"Write-Output ('result ' * 15000)",description:'Produce a large test result'}),workspacePath:ws,mode:'bypass',onFrame:()=>{}});
 const shellResults=worker.requests.slice(before).flatMap(r=>JSON.parse(r.raw).messages??[]).filter(m=>m.role==='tool' && JSON.stringify(m).includes('Full formatted result stored at:'));
 assert.ok(shellResults.length,'large command output is preserved in a retrievable file');
 assert.ok(shellResults.every(m=>JSON.stringify(m).length<9000),'model receives a bounded preview');
 for(let i=0;i<5;i++) await bridge.runTurn({chatId:'read',message:'SCRIPT:call pwsh '+JSON.stringify({command:"Write-Output ('result ' * 15000)",description:'Repeated large-output regression'}),workspacePath:ws,mode:'bypass',onFrame:()=>{}});
 assert.equal(worker.requests.filter(r=>r.summary).length,0,'six large command results plus the file read do not trigger compaction');


});
