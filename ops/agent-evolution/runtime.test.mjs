import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvolutionQueue, releaseGate } from './runtime.mjs';
const baseSha='a'.repeat(40), headSha='b'.repeat(40);
async function setup(t) {
 const dir=await mkdtemp(join(tmpdir(),'evolution-test-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const q=new EvolutionQueue(dir);
 await q.create({id:'test',goal:'Repair synthetic issue',baseSha,ownedPaths:['src/ui'],deadline:new Date(Date.now()+60000).toISOString()});
 return q;
}
function workers(calls=[]) {
 const outputs={diagnose:{reproduced:true,evidenceId:'synthetic-repro'},engineer:{actor:'engineer',headSha,changedPaths:['src/ui/widget.ts']},
 review:{actor:'reviewer',headSha,passed:true},verify:{headSha,baseSha,passed:true,artifactId:'new',rollbackArtifactId:'old'},
 preview:{url:'https://preview.example.test',headSha},observe:{healthy:true,headSha},rollback:{restored:true,artifactId:'old'}};
 return Object.fromEntries(Object.entries(outputs).map(([name,value])=>[name,async request=>{calls.push(request.operationId);return structuredClone(value);} ]));
}
test('durable stages finish once; completed job does not deploy twice',async t=>{
 const q=await setup(t),calls=[],a=workers(calls);assert.equal((await q.run('test',a)).state,'completed');
 assert.equal((await new EvolutionQueue(q.directory).run('test',a)).state,'completed');assert.equal(calls.length,6);
});
test('same reviewer, stale SHA, out-of-scope patch and missing rollback prevent deployment',async t=>{
 for(const mutate of [a=>a.review=async()=>({actor:'engineer',headSha,passed:true}),a=>a.verify=async()=>({headSha:baseSha,baseSha,passed:true}),a=>a.engineer=async()=>({actor:'engineer',headSha,changedPaths:['auth/rights.ts']}),a=>a.verify=async()=>({headSha,baseSha,passed:true,artifactId:'new'})]){
 await t.test('reject evidence',async t=>{const q=await setup(t),calls=[],a=workers(calls);mutate(a);assert.equal((await q.run('test',a)).state,'failed');assert.ok(!calls.includes('test:preview'));});}
});
test('unhealthy preview restores previous artifact and never reports success',async t=>{
 const q=await setup(t),a=workers();a.observe=async()=>({healthy:false,headSha});assert.equal((await q.run('test',a)).state,'rolled_back');
});
test('rollback failure stays explicit and cannot auto retry deployment',async t=>{
 const q=await setup(t),a=workers();a.observe=async()=>{throw Error('unhealthy');};a.rollback=async()=>({restored:false});
 assert.equal((await q.run('test',a)).state,'rollback_failed');assert.equal((await q.run('test',a)).state,'rollback_failed');
});
test('retry skips recorded stages and reuses operation id',async t=>{
 const q=await setup(t),calls=[],a=workers(calls),real=a.engineer;let n=0;
 a.engineer=async r=>{if(!n++){calls.push(r.operationId);throw Error('temporary');}return real(r);};
 assert.equal((await q.run('test',a)).state,'failed');assert.equal((await q.run('test',a)).state,'completed');
 assert.equal(calls.filter(x=>x==='test:diagnose').length,1);assert.equal(calls.filter(x=>x==='test:engineer').length,2);
});
test('duplicate jobs and unsafe paths are rejected',async t=>{
 const q=await setup(t);await assert.rejects(q.create({id:'../bad',goal:'x',baseSha,ownedPaths:['src'],deadline:new Date(Date.now()+60000).toISOString()}));
 await assert.rejects(q.create({id:'test',goal:'x',baseSha,ownedPaths:['src'],deadline:new Date(Date.now()+60000).toISOString()}),/JOB_EXISTS/);
});
test('concurrent run is locked',async t=>{
 const q=await setup(t),a=workers();let release,entered;const ready=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 a.diagnose=async()=>{entered();await hold;return {reproduced:true,evidenceId:'e'};};const first=q.run('test',a);await ready;
 await assert.rejects(q.run('test',a),/JOB_LOCKED/);release();await first;
});
test('cancelled task cannot run',async t=>{const q=await setup(t);await q.cancel('test');assert.equal((await q.run('test',workers())).state,'cancelled');});
test('production is not a supported target',()=>assert.throws(()=>releaseGate({environment:'production',ownedPaths:['src/ui'],baseSha,results:{engineer:{headSha,actor:'a',changedPaths:['src/ui/x']},review:{headSha,actor:'b',passed:true},verify:{headSha,baseSha,passed:true,artifactId:'x',rollbackArtifactId:'y'}}}),/PRODUCTION_NOT_ENABLED/));
test('timeout cannot be blindly retried while remote outcome is unknown',async t=>{
 const q=await setup(t),a=workers();a.diagnose=async()=>new Promise(()=>{});
 assert.equal((await q.run('test',a,{timeoutMs:20})).state,'needs_reconciliation');
 await assert.rejects(q.run('test',a),/RECONCILIATION_REQUIRED/);
});
test('unknown preview result invokes rollback with stable identity',async t=>{
 const q=await setup(t),calls=[],a=workers(calls);a.preview=async()=>{throw Error('response lost');};
 assert.equal((await q.run('test',a)).state,'rolled_back');assert.ok(calls.includes('test:rollback'));
});
test('rollback also times out without claiming recovery',async t=>{
 const q=await setup(t),a=workers();a.observe=async()=>({healthy:false,headSha});a.rollback=async()=>new Promise(()=>{});
 assert.equal((await q.run('test',a,{timeoutMs:20})).state,'rollback_failed');
});
test('call budget stops execution before deployment',async t=>{
 const q=await setup(t),job=await q.read('test');job.maxCalls=3;await q.save(job);
 const calls=[];assert.equal((await q.run('test',workers(calls))).state,'failed');assert.equal(calls.length,3);
});
test('CLI creates and reads a private job without printing its goal',async t=>{
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const {writeFile}=await import('node:fs/promises');
 const dir=await mkdtemp(join(tmpdir(),'evolution-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const spec=join(dir,'spec.json');await writeFile(spec,JSON.stringify({id:'cli-test',goal:'PRIVATE SYNTHETIC GOAL',baseSha,ownedPaths:['src/ui'],deadline:new Date(Date.now()+60000).toISOString()}));
 const cli=new URL('./cli.mjs',import.meta.url);const {fileURLToPath}=await import('node:url');
 const run=promisify(execFile);const created=await run(process.execPath,[fileURLToPath(cli),'create',join(dir,'jobs'),spec]);
 assert.equal(JSON.parse(created.stdout).state,'queued');assert.ok(!created.stdout.includes('PRIVATE'));
 const status=await run(process.execPath,[fileURLToPath(cli),'status',join(dir,'jobs'),'cli-test']);assert.equal(JSON.parse(status.stdout).calls,0);
});
