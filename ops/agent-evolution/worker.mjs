import { readdir } from 'node:fs/promises';
import { EvolutionQueue } from './runtime.mjs';

/** One bounded sweep; no implicit daemon, cron registration or production privileges. */
export async function drainQueue(directory,adapters,{maxJobs=3,timeoutMs=1800000,signal,onResult=()=>{}}={}){
 if(!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>10)throw Error('INVALID_JOB_BATCH');
 const queue=new EvolutionQueue(directory),results=[];
 for(const file of (await readdir(directory)).filter(f=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.json$/.test(f)).sort()){
  signal?.throwIfAborted();if(results.length>=maxJobs)break;
  const id=file.slice(0,-5),job=await queue.read(id);
  if(!['queued','failed'].includes(job.state)||job.previewAttempted||job.attempts>=job.maxAttempts||job.calls>=job.maxCalls||Date.parse(job.deadline)<=Date.now())continue;
  try{
   const result=await queue.run(id,adapters,{signal,timeoutMs});
   const summary={id,state:result.state};results.push(summary);await onResult(summary);
   if(result.state==='needs_reconciliation'||result.state==='rollback_failed')break;
  }catch(error){
   if(error.message==='JOB_LOCKED')continue;
   throw error;
  }
 }
 return results;
}
