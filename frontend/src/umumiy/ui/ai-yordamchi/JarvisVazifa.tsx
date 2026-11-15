import type { GoalPlan } from '../../../lib/ai-yordamchi/vazifa-reja';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n/til';
import { vazifaOl, vazifaRoyxat, vazifaSaqla, vazifaReja } from '../../../api/jarvis-vazifa';
import { runTaskStep, taskCompleted, taskTransition, type JarvisTask, type TaskScope, type TaskStore } from '../../../lib/ai-yordamchi/vazifa';
import { reconciliationExecutor, reconciliationTask } from '../../../lib/ai-yordamchi/vazifa-solishtiruv';
import { obyektHolatMatni } from '../../../lib/yordamchi/vosita/pto-liniya';
import type { ObyektHolatMalumot, TsiklHisob, VositaApi } from '../../../lib/yordamchi/vosita/tur';
export function JarvisVazifa({scope,api}: {scope:TaskScope;api:VositaApi}) {
 const [tasks,setTasks]=useState<JarvisTask[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const alive=useRef(true);const lock=useRef(false);
 const [goal,setGoal]=useState('');const [plan,setPlan]=useState<GoalPlan|null>(null);const request=useRef(0);
 async function planGoal(){if(lock.current||!goal.trim())return;lock.current=true;setBusy(true);setError('');setPlan(null);const version=++request.current;
  try{const result=await vazifaReja(scope,goal);if(alive.current && version===request.current){if(result.ok)setPlan(result.plan);else setError(t('Reja tuzilmadi. Hech qanday amal bajarilmadi.'));}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const {actorId,companyId,objectId}=scope;
 useEffect(()=>{alive.current=true;void vazifaRoyxat({actorId,companyId,objectId}).then(r=>{if(alive.current){if(r.ok)setTasks(r.tasks);else setError(t('Vazifalar serverdan yuklanmadi.'));}});return()=>{alive.current=false;};},[actorId,companyId,objectId]);
 const update=(task:JarvisTask)=>{if(alive.current)setTasks(xs=>[task,...xs.filter(x=>x.id!==task.id)]);};
 const store:TaskStore={load:async(id)=>{const r=await vazifaOl(scope,id);if(!r.ok)throw Error('LOAD');return r.task;},save:async(task,expected)=>{if(!alive.current)throw Error('SCOPE_CHANGED');const r=await vazifaSaqla(task,expected);if(!r.ok)throw Error('SAVE');update(r.task);}};
 async function run(existing?:JarvisTask,plannedGoal?:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   let task=existing;
   if(!task){task=reconciliationTask(crypto.randomUUID(),plannedGoal??t('Smeta, fakt va F2 holatini tekshirish'),scope,[crypto.randomUUID(),crypto.randomUUID()]);await store.save(task,-1);}
   else {task=await store.load(task.id,scope);if(task.steps.some(s=>s.state==='running')){if(task.steps.some(s=>s.write))throw Error('LEASE_REQUIRED');const next=taskTransition(task,{type:'interrupt'},scope,task.revision);await store.save(next,task.revision);task=next;}}
   const executor=reconciliationExecutor(api,async(_scope,operation,output)=>{
    if(operation===task!.steps[0].operationId) return obyektHolatMatni(output as ObyektHolatMalumot).slice(0,2000);
    const r=output as TsiklHisob;
    return t('Qo‘shimcha: {plus} ta; kamayish: {minus} ta; aniqlanmagan: {unknown} ta; sig‘magan: {unmatched} ta.',{plus:r.doplata.soni,minus:r.snyatie.soni,unknown:r.nomalum,unmatched:r.sigmadi});
   });
   for(let i=0;i<task.steps.length && alive.current && !taskCompleted(task);i++){
    task=await runTaskStep(task.id,scope,store,executor);if(task.steps.some(s=>s.state==='queued') && i>0)break;
   }
  }catch{if(alive.current)setError(t('Vazifa yakunlanmadi. Saqlangan holatdan davom ettirish mumkin.'));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details className="border-b border-border px-4 py-2"><summary className="cursor-pointer text-sm">{t('Jarvis vazifalari')}</summary>
  <button type="button" disabled={busy} onClick={()=>void run()} className="tugma mt-2">{t('Obyektni tekshirish')}</button>
  <form onSubmit={e=>{e.preventDefault();void planGoal();}} className="mt-2 space-y-2">
   <label className="block">{t('Jarvisga vazifa')}<textarea aria-label={t('Jarvisga vazifa')} value={goal} maxLength={2000} disabled={busy} onChange={e=>{request.current++;setGoal(e.target.value);setPlan(null);}} className="input w-full" placeholder={t('Masalan: shu obyektning smeta, fakt va F2 farqlarini tekshir')}/></label>
   <button type="submit" disabled={busy||!goal.trim()} className="tugma">{t('Reja tuzish')}</button>
  </form>
  {plan&&<div className="mt-2 rounded border border-border p-2"><p>{plan.explanation}</p>{plan.questions.map(q=><p key={q}>{q}</p>)}{plan.supported&&<><ol><li>{t('Obyekt holati')}</li><li>{t('Farqlar tekshiruvi')}</li></ol><button type="button" disabled={busy} onClick={()=>void run(undefined,goal.trim())}>{t('Rejani bajarish')}</button></>}</div>}
  {error&&<p role="status" className="text-xs text-warn">{error}</p>}
  {tasks.map(task=><div key={task.id} className="mt-2 rounded border border-border p-2 text-xs"><p>{task.goal}</p><ol>{task.steps.map(step=><li key={step.id}>{step.tool==='object.summary'?t('Obyekt holati'):t('Farqlar tekshiruvi')} · {step.state==='verified'?t('Tekshirildi'):t('Kutilmoqda')}{step.evidence&&<details><summary>{t('Natijani ko‘rish')}</summary><pre className="whitespace-pre-wrap break-all">{step.evidence}</pre></details>}</li>)}</ol>
  {!taskCompleted(task)&&<button type="button" disabled={busy} onClick={()=>void run(task)}>{t('Davom ettirish')}</button>}</div>)}
 </details>;
}
