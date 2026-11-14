import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EvolutionQueue} from './runtime.mjs';
import {drainQueue} from './worker.mjs';
test('bounded worker skips cancelled jobs and stops on uncertain operation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'evolution-worker-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const q=new EvolutionQueue(dir);
 for(const id of ['a','b','c'])await q.create({id,goal:'synthetic',baseSha:'a'.repeat(40),ownedPaths:['ops'],deadline:new Date(Date.now()+60000).toISOString()});
 await q.cancel('a');
 const result=await drainQueue(dir,{diagnose:async()=>new Promise(()=>{})},{timeoutMs:20});
 assert.deepEqual(result,[{id:'b',state:'needs_reconciliation'}]);assert.equal((await q.read('c')).state,'queued');
});
test('worker rejects unbounded batch',async()=>{await assert.rejects(drainQueue('.',{}, {maxJobs:11}),/INVALID_JOB_BATCH/);});
