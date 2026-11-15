import { describe,it,expect } from 'vitest';
import { taskTransition,taskCompleted,type JarvisTask } from './vazifa';
const scope={actorId:7,companyId:17,objectId:101};
const make=():JarvisTask=>({id:'task',goal:'Reconcile',scope,revision:0,cancelled:false,steps:[{id:'read',tool:'object.read',input:{},operationId:'stable-read',write:false,expectedVersion:null,state:'queued',evidence:null},{id:'write',tool:'existing.command',input:{},operationId:'stable-write',write:true,expectedVersion:3,state:'queued',evidence:null}]});
describe('durable task lifecycle contract',()=>{
 it('requires ordered steps and verified evidence',()=>{const t=make();expect(()=>taskTransition(t,{type:'start',stepId:'write'},scope,0)).toThrow('STEP_NOT_READY');const a=taskTransition(t,{type:'start',stepId:'read'},scope,0);expect(taskCompleted(a)).toBe(false);expect(()=>taskTransition(a,{type:'verify',stepId:'read',evidence:''},scope,1)).toThrow('EVIDENCE_REQUIRED');expect(t.steps[0].state).toBe('queued');});
 it('interrupted writes reconcile instead of replaying',()=>{let t=make();t.steps[0]={...t.steps[0],state:'verified',evidence:'readback:1'};t=taskTransition(t,{type:'start',stepId:'write'},scope,0);t=taskTransition(JSON.parse(JSON.stringify(t)),{type:'interrupt'},scope,1);expect(t.steps[1].state).toBe('reconciling');expect(t.steps[1].operationId).toBe('stable-write');expect(()=>taskTransition(t,{type:'start',stepId:'write'},scope,2)).toThrow();t=taskTransition(t,{type:'verify',stepId:'write',evidence:'command-log:stable-write'},scope,2);expect(taskCompleted(t)).toBe(true);});
 it('rejects stale revision and changed scope',()=>{expect(()=>taskTransition(make(),{type:'interrupt'},scope,9)).toThrow('REVISION_CONFLICT');expect(()=>taskTransition(make(),{type:'interrupt'},{...scope,actorId:8},0)).toThrow('SCOPE_CHANGED');});
 it('cancel does not pretend pending writes were rolled back',()=>{const t=make();t.steps[1].state='running';const n=taskTransition(t,{type:'cancel'},scope,0);expect(n.steps[1].state).toBe('reconciling');expect(taskCompleted(n)).toBe(false);});
});

import { runTaskStep, type TaskStore } from './vazifa';
import { vi } from 'vitest';
it('persists before execution and reconciles uncertain write without executing twice',async()=>{
 let saved=make();saved.steps[0]={...saved.steps[0],state:'verified',evidence:'source:1'};
 const store:TaskStore={load:async()=>structuredClone(saved),save:async(t,r)=>{expect(saved.revision).toBe(r);saved=structuredClone(t);}};
 const execute=vi.fn(async()=>{expect(saved.steps[1].state).toBe('running');throw new Error('response lost');});
 const readback=vi.fn(async()=> 'existing-command-log:stable-write');
 await runTaskStep('task',scope,store,{execute,readback});expect(saved.steps[1].state).toBe('reconciling');expect(readback).not.toHaveBeenCalled();
 await runTaskStep('task',scope,store,{execute,readback});expect(execute).toHaveBeenCalledTimes(1);expect(taskCompleted(saved)).toBe(true);
});
it('failed checkpoint never invokes a business command',async()=>{
 const execute=vi.fn();const store:TaskStore={load:async()=>make(),save:async()=>{throw new Error('CAS conflict');}};
 await expect(runTaskStep('task',scope,store,{execute,readback:async()=>null})).rejects.toThrow('CAS conflict');expect(execute).not.toHaveBeenCalled();
});
