/**
 * CommandCenter runtime manifest — same source as Koda/Cursor (State/command-center-runtime.json).
 * Injected into the Strata Harness persona and the first turn of each fresh harness session.
 */
import { existsSync, readFileSync, statSync } from 'fs';
import { spawnSync } from 'child_process';

const DEFAULT_JSON = 'M:\\CommandCenter\\State\\command-center-runtime.json';
const BUILDER = 'M:\\CommandCenter\\Tools\\command_center_runtime.py';
const PYTHON = process.env.STRATA_PYTHON || 'C:\\Users\\jmoor\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

let lastRefreshAttempt = 0;

export function runtimeJsonPath() {
  return process.env.STRATA_COMMAND_CENTER_RUNTIME || DEFAULT_JSON;
}

export function readRuntime() {
  const path = runtimeJsonPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Compaction/automation thresholds — CommandCenter context-plane policy (long harness turns vs chat). */
export function contextAutomationPolicy({ goalRun = false } = {}) {
  const lim = readRuntime()?.limits ?? {};
  const goalFrac = Number(lim.auto_compact_fraction_goal);
  const chatFrac = Number(lim.auto_compact_fraction);
  const autoCompactFraction = goalRun && goalFrac > 0 ? goalFrac : chatFrac > 0 ? chatFrac : 0.72;
  const throttleSec = goalRun
    ? Number(lim.auto_compact_throttle_sec_goal ?? lim.auto_compact_throttle_sec)
    : Number(lim.auto_compact_throttle_sec);
  const throttleMs = (throttleSec > 0 ? throttleSec : goalRun ? 12 : 45) * 1000;
  const emergency = Number(lim.emergency_compact_fraction);
  return {
    autoCompactFraction,
    sessionResetFraction: 0.7,
    compactRetryFraction: 0.65,
    throttleMs,
    emergencyCompactFraction: emergency > 0 ? emergency : 0.85,
    longHarnessTurns: lim.harness_long_turns !== false,
  };
}

/** Rebuild manifest at most once per 45s when the Harness profile is built. */
export function refreshRuntimeFileIfStale() {
  const path = runtimeJsonPath();
  const now = Date.now();
  if (now - lastRefreshAttempt < 45_000) return;
  lastRefreshAttempt = now;
  let stale = true;
  try {
    if (existsSync(path)) stale = now - statSync(path).mtimeMs > 120_000;
  } catch { /* */ }
  if (!stale || !existsSync(BUILDER) || !existsSync(PYTHON)) return;
  spawnSync(PYTHON, [BUILDER], { timeout: 20_000, windowsHide: true, stdio: 'ignore' });
}

function toolhiveSummary(runtime) {
  const servers = runtime?.toolhive?.servers ?? {};
  const up = Object.keys(servers).filter(k => servers[k]?.up);
  const down = Object.keys(servers).filter(k => !servers[k]?.up);
  return { up, down };
}

/** Stable block for Harness persona prefix (rebuilt when profile reloads). */
export function runtimeSystemBlock() {
  const r = readRuntime();
  if (!r) {
    return [
      '## CommandCenter runtime',
      'Before assuming limits or which MCP servers exist, read `M:\\CommandCenter\\State\\command-center-runtime.json` or `GET http://127.0.0.1:18765/runtime`.',
      'Use ToolHive koda-catalog (`find_tools` / `run_tool`), not raw MCP floods.',
    ].join('\n');
  }
  const sh = r.surfaces?.strata_harness ?? {};
  const lim = r.limits ?? {};
  const th = toolhiveSummary(r);
  const src = sh.model_source ? ` (${sh.model_source})` : '';
  return [
    '## CommandCenter runtime (live manifest — do not guess)',
    r.instruction_for_agents ?? '',
    '',
    `- Model: ${sh.model_id ?? 'unknown'}${src} · n_ctx: ${sh.n_ctx ?? lim.context_tokens ?? '?'}`,
    `- Max parallel background subagents: ${lim.max_active_subagents ?? sh.max_active_subagents ?? '?'}`,
    `- Auto-compact from ~${Math.round((lim.auto_compact_fraction_goal ?? lim.auto_compact_fraction ?? 0.72) * 100)}% during goals (~${Math.round((lim.auto_compact_fraction ?? 0.72) * 100)}% plain chat); long harness turns expected`,
    `- Context plane: ${r.context_plane?.url ?? 'http://127.0.0.1:18765'} · recover: ${r.context_plane?.compact_recover ?? ''}`,
    `- ToolHive up: ${th.up.join(', ') || 'none'} · down: ${th.down.join(', ') || 'none'}`,
    `- Enabled Strata MCP (integration file): ${(sh.mcp_servers_enabled ?? []).join(', ') || 'none'}`,
    `- Skill roots: ${(sh.skill_roots ?? []).join('; ') || 'none'}`,
    `- Full JSON path: ${runtimeJsonPath()}`,
  ].join('\n');
}

/** Short refresh on the first prompt of a new harness attach (ToolHive / harness state). */
export function runtimeFreshTurnBlock() {
  const r = readRuntime();
  if (!r) return '';
  const sh = r.surfaces?.strata_harness ?? {};
  const th = toolhiveSummary(r);
  const gen = r.generated_at_utc ? `Snapshot ${r.generated_at_utc}.` : '';
  return [
    `[CommandCenter] ${gen} Harness ${sh.agent_state ?? 'unknown'}; model ${sh.model_id ?? '?'} (n_ctx ${sh.n_ctx ?? '?'}).`,
    `Subagent cap ${r.limits?.max_active_subagents ?? 6}. ToolHive up: ${th.up.join(', ') || 'none'}.`,
    'Full manifest: State/command-center-runtime.json · HTTP :18765/runtime.',
  ].join(' ');
}
