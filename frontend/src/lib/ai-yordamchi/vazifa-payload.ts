import type { JarvisTask, TaskScope } from './vazifa';
/** Initial checkpoint contract is read-only. Client state is never business-write authority. */
export function taskPayload(raw: unknown, scope: TaskScope): JarvisTask | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = raw as JarvisTask;
  if (typeof t.id !== 'string' || !/^[A-Za-z0-9_.-]{1,40}$/.test(t.id) || typeof t.goal !== 'string' || !t.goal.trim() || t.goal.length > 2000 || !Number.isSafeInteger(t.revision) || t.revision < 0 || typeof t.cancelled !== 'boolean' || !Array.isArray(t.steps) || t.steps.length !== 2) return null;
  const names = ['object.summary','object.discrepancies'];
  const ids = new Set<string>();
  for (const [i,s] of t.steps.entries()) {
    if (!s || s.tool !== names[i] || s.id !== names[i] || s.write !== false || s.expectedVersion !== null || typeof s.operationId !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(s.operationId) || ids.has(s.operationId) || !s.input || s.input.objectId !== scope.objectId || !['queued','running','reconciling','verified'].includes(s.state) || (s.evidence !== null && (typeof s.evidence !== 'string' || s.evidence.length > 2048)) || (s.state === 'verified' && !s.evidence)) return null;
    ids.add(s.operationId);
  }
  const clean = {id:t.id,goal:t.goal,scope,revision:t.revision,cancelled:t.cancelled,steps:t.steps.map(s=>({id:s.id,tool:s.tool,input:{objectId:scope.objectId},operationId:s.operationId,write:false,expectedVersion:null,state:s.state,evidence:s.evidence}))};
  return JSON.stringify(clean).length <= 16000 ? clean : null;
}
