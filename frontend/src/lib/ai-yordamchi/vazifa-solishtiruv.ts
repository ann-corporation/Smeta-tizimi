/** Object reconciliation uses existing business reads; never recomputes financial totals. */
import type { VositaApi } from '../yordamchi/vosita/tur';
import type { JarvisTask, TaskExecutor, TaskScope } from './vazifa';
const TOOLS = ['object.summary', 'object.discrepancies'] as const;
export function reconciliationTask(id: string, goal: string, scope: TaskScope, operationIds: readonly [string,string]): JarvisTask {
  if (!scope.companyId || !scope.objectId || !scope.actorId || !goal.trim() || operationIds[0] === operationIds[1]) throw new Error('TASK_INPUT_INVALID');
  return {id,goal,scope:{...scope},revision:0,cancelled:false,steps:TOOLS.map((tool,i)=>({id:tool,tool,input:{objectId:scope.objectId},operationId:operationIds[i],write:false,expectedVersion:null,state:'queued',evidence:null}))};
}
/** saveEvidence must durably store output and return a reference; callback is not a database implementation. */
export function reconciliationExecutor(api: Pick<VositaApi,'obyektHolat'|'slichitelniyHisob'>, saveEvidence: (scope: TaskScope, operationId: string, output: unknown) => Promise<string>): TaskExecutor {
  return {
    execute: async(step,scope)=>{if(step.write || step.input.objectId !== scope.objectId || !TOOLS.includes(step.tool as typeof TOOLS[number])) throw new Error('TOOL_DENIED');},
    readback: async(step,scope)=>{
      if(step.write || !scope.objectId || step.input.objectId !== scope.objectId) throw new Error('SCOPE_CHANGED');
      const result = step.tool === 'object.summary' ? await api.obyektHolat?.(scope.objectId)
        : step.tool === 'object.discrepancies' ? await api.slichitelniyHisob?.(scope.objectId) : null;
      if (result == null) return null;
      return saveEvidence(scope,step.operationId,result);
    },
  };
}
