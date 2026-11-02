/** Stdio MCP adapter: keep large tool catalogs out of every model prompt. */
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
const [file, serverName] = process.argv.slice(2);
const config = JSON.parse(readFileSync(file, 'utf8')).servers[serverName];
const child = spawn(config.command, config.args ?? [], { env: { ...process.env, ...config.env }, cwd: config.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
let next = 1;
const pending = new Map();
const sendChild = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
function request(method, params) {
 return new Promise((resolve, reject) => {
  const id = next++, timer = setTimeout(() => { pending.delete(id); reject(new Error('Tool server timed out')); }, 120000);
  pending.set(id, { resolve, reject, timer }); sendChild({ id, method, params });
 });
}
createInterface({ input: child.stdout }).on('line', line => {
 let message; try { message = JSON.parse(line); } catch { return; }
 const wait = pending.get(message.id);
 if (!wait) return;
 clearTimeout(wait.timer); pending.delete(message.id);
 if (message.error) wait.reject(new Error(message.error.message)); else wait.resolve(message.result);
});
function fail(error) { for (const wait of pending.values()) { clearTimeout(wait.timer); wait.reject(error); } pending.clear(); }
child.on('error', fail);child.on('exit', () => fail(new Error('Tool server exited')));
let ready;
async function catalog() {
 ready ??= (async () => {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'strata-tool-library', version: '1' } });
  sendChild({ method: 'notifications/initialized' });
  const all = [];let cursor;
  do { const page = await request('tools/list', cursor ? { cursor } : {}); all.push(...page.tools); cursor = page.nextCursor; } while(cursor);
  return all;
 })();
 return ready;
}
const result = text => ({ content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }] });
const output = value => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
createInterface({ input: process.stdin }).on('line', async line => {
 let message; try { message = JSON.parse(line); } catch { return; }
 if (message.id === undefined) return;
 try {
  let answer;
  if (message.method === 'initialize') answer = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'strata-' + serverName, version: '1' } };
  else if (message.method === 'ping') answer = {};
  else if (message.method === 'tools/list') answer = { tools: [
   { name: 'find_tools', description: `Search ${serverName} tools and read their input schemas before calling them.`, inputSchema: { type: 'object', properties: { query: { type: 'string' }, offset: { type: 'integer', minimum: 0 } }, required: ['query'] } },
   { name: 'run_tool', description: `Run a ${serverName} tool using the exact name and arguments from find_tools.`, inputSchema: { type: 'object', properties: { name: { type: 'string' }, arguments: { type: 'object' } }, required: ['name', 'arguments'] } }
  ] };
  else if (message.method === 'tools/call') {
   const args = message.params.arguments ?? {}, tools = await catalog();
   if (message.params.name === 'find_tools') {
    const words = String(args.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const matches = tools.filter(t => words.every(w => (t.name + ' ' + t.description).toLowerCase().includes(w)));
    const offset = Math.max(0, Math.floor(Number(args.offset) || 0)); answer = result({ total: matches.length, tools: matches.slice(offset, offset + 5), nextOffset: offset + 5 < matches.length ? offset + 5 : null });
   } else if (message.params.name === 'run_tool' && tools.some(t => t.name === args.name)) answer = await request('tools/call', { name: args.name, arguments: args.arguments ?? {} });
   else throw new Error('Unknown tool. Use find_tools first.');
  } else { output({ id: message.id, error: { code: -32601, message: 'Method not supported' } }); return; }
  output({ id: message.id, result: answer });
 } catch (error) { output({ id: message.id, result: { ...result(error.message), isError: true } }); }
}).on('close', () => { if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill(); process.exit(0); });
