import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localSkills, readLocalIntegrations } from '../server/local-integrations.mjs';
import { apply } from '../server/agent/plugins/strata-context.mjs';
test('external skills retain resource paths, deduplicate copies and do not modify originals', t => {
 const dir=mkdtempSync(join(tmpdir(),'strata-local-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const name of ['a','b']) { mkdirSync(join(dir,name)); writeFileSync(join(dir,name,'SKILL.md'),'---\nname: sample\ndescription: Example\n---\nRead scripts/run.py'); }
 assert.deepEqual(readLocalIntegrations(dir),{});
 const skills=localSkills([dir,dir]); assert.equal(skills.length,1); assert.match(skills[0].body,/Resolve relative scripts/); assert.match(skills[0].body,/scripts\/run.py/);
});
test('continuity mode rewrites only summary requests and preserves original messages', async()=>{
 const requests=[]; const llm={resolveModelInfo:async()=>({context:{contextWindow:32768}}),async *stream(o){requests.push(o); yield {type:'text-delta',text:'record'};yield {type:'finish',reason:{kind:'stop'}};}};
 apply({llm,inject(){}},{continuity:true});
 const messages=[{role:'user',content:'pending task'},{role:'user',content:'summarize'}];
 for await(const chunk of llm.stream({purpose:'compaction',messages,maxTokens:2048})) {}
 assert.equal(messages.length,2); assert.match(requests[0].messages.at(-1).content[0].text,/SAME ongoing chat/);
 const ordinary={purpose:'chat',messages};for await(const chunk of llm.stream(ordinary)) {} assert.equal(requests[1],ordinary);
});
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
test('lazy MCP lists schemas on demand and executes the original tool', async t => {
 const dir=mkdtempSync(join(tmpdir(),'strata-tools-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'local-integrations.json');writeFileSync(file,JSON.stringify({servers:{demo:{command:process.execPath,args:[fileURLToPath(new URL('./helpers/mini-mcp.mjs',import.meta.url))]}}}));
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server/agent/local-tools-mcp.mjs',import.meta.url)),file,'demo'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 t.after(()=>child.stdin.end());
 const pending=new Map();let id=0;
 createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});
 function call(method,params){return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>reject(new Error('timeout')),10000);pending.set(key,r=>{clearTimeout(timer);resolve(r.result)});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});}
 const listed=await call('tools/list',{});assert.equal(listed.tools.length,2);
 const found=await call('tools/call',{name:'find_tools',arguments:{query:'shout'}});assert.equal(JSON.parse(found.content[0].text).tools[0].name,'shout');
 const answer=await call('tools/call',{name:'run_tool',arguments:{name:'shout',arguments:{text:'hello'}}});assert.match(answer.content[0].text,/HELLO/);
});
