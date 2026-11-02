/** Opt-in local integrations. Originals and their supporting files stay in place. */
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseSkillFile } from './skill-files.mjs';

export function readLocalIntegrations(dataDir) {
  try { return JSON.parse(readFileSync(join(dataDir, 'local-integrations.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('Could not read local-integrations.json: ' + error.message); }
}

export function localSkills(roots = []) {
  const found = [], visited = new Set(), bodies = new Set();
  function walk(dir, depth = 0) {
    if (depth > 12) return;
    let real, entries;
    try { real = realpathSync(dir); if (visited.has(real)) return; visited.add(real); entries = readdirSync(real, { withFileTypes: true }); } catch { return; }
    const file = join(real, 'SKILL.md');
    if (entries.some(e => e.name === 'SKILL.md' && e.isFile())) {
      const text = readFileSync(file, 'utf8'), parsed = parseSkillFile(text);
      const hash = createHash('sha256').update(text).digest('hex');
      if (!bodies.has(hash)) {
        bodies.add(hash);
        found.push({ id: 'local-' + createHash('sha256').update(real).digest('hex').slice(0, 16),
          name: parsed.title || parsed.name || real.split(/[\\/]/).at(-1), description: parsed.description || 'Local skill',
          source: 'workspace', enabled: true, triggers: [], sizeKb: +(Buffer.byteLength(text) / 1024).toFixed(1),
          body: `Original skill: ${file}\nResolve relative scripts, references and assets from: ${dirname(file)}\nRead the original SKILL.md before using this skill. Tool names mentioned there are available only if registered in this session.\n\n${parsed.body}` });
      }
    }
    for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
      if (['node_modules', '.git', '.venv', 'work', 'outputs'].includes(entry.name)) continue;
      if (entry.isDirectory() || entry.isSymbolicLink()) walk(join(real, entry.name), depth + 1);
    }
  }
  for (const root of roots) walk(root);
  return found;
}

export function localToolServers(config, dataDir) {
  const isLazy = config.lazyTools !== false;
  return Object.fromEntries(Object.entries(config.servers ?? {}).map(([name, server]) => [name,
    isLazy && server.command && !server.disabled ? { command: process.execPath, args: [fileURLToPath(new URL('./agent/local-tools-mcp.mjs', import.meta.url)), join(dataDir, 'local-integrations.json'), name] } : server]));
}
