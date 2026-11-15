/** Serializable task lifecycle. Persistence and authorization belong to server adapters. */
export type TaskScope = { actorId: number; companyId: number | null; objectId: number | null };
export type TaskStep = { id: string; tool: string; input: Record<string, unknown>; operationId: string; write: boolean; expectedVersion: number | null; state: 'queued' | 'running' | 'reconciling' | 'verified'; evidence: string | null };
export type JarvisTask = { id: string; goal: string; scope: TaskScope; revision: number; cancelled: boolean; steps: TaskStep[] };
export type TaskEvent = { type: 'start'; stepId: string } | { type: 'interrupt' } | { type: 'verify'; stepId: string; evidence: string } | { type: 'cancel' };
export function taskTransition(task: JarvisTask, event: TaskEvent, scope: TaskScope, expectedRevision: number): JarvisTask {
  if (task.scope.actorId !== scope.actorId || task.scope.companyId !== scope.companyId || task.scope.objectId !== scope.objectId) throw new Error('SCOPE_CHANGED');
  if (task.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
  const next: JarvisTask = { ...task, scope: { ...task.scope }, steps: task.steps.map(s => ({ ...s })) , revision: task.revision + 1 };
  if (event.type === 'interrupt' || event.type === 'cancel') {
    next.cancelled ||= event.type === 'cancel';
    next.steps = next.steps.map(s => s.state === 'running' ? { ...s, state: s.write ? 'reconciling' : 'queued' } : s);
    return next;
  }
  const index = next.steps.findIndex(s => s.id === event.stepId);
  if (index < 0) throw new Error('STEP_UNKNOWN');
  const step = next.steps[index];
  if (event.type === 'start') {
    if (next.cancelled) throw new Error('TASK_CANCELLED');
    if (step.state !== 'queued' || next.steps.slice(0,index).some(s => s.state !== 'verified') || next.steps.some(s => s.state === 'running' || s.state === 'reconciling')) throw new Error('STEP_NOT_READY');
    step.state = 'running';
  } else {
    if (!event.evidence.trim() || event.evidence.length > 2048) throw new Error('EVIDENCE_REQUIRED');
    if (step.state !== 'running' && step.state !== 'reconciling') throw new Error('STEP_NOT_RUNNING');
    step.state = 'verified'; step.evidence = event.evidence;
  }
  return next;
}
export function taskCompleted(task: JarvisTask): boolean {
  return !task.cancelled && task.steps.length > 0 && task.steps.every(s => s.state === 'verified' && !!s.evidence);
}

/** Server adapter must implement atomic compare-and-swap and authorize scope on every call. */
export interface TaskStore {
  load(id: string, scope: TaskScope): Promise<JarvisTask>;
  save(task: JarvisTask, expectedRevision: number): Promise<void>;
}
export interface TaskExecutor {
  /** Existing command, stable operationId. Must not mark success without readback. */
  execute(step: TaskStep, scope: TaskScope): Promise<void>;
  /** null means unverified, never permission to replay a write. */
  readback(step: TaskStep, scope: TaskScope): Promise<string | null>;
}
/** Executes at most one step. A checkpoint precedes the side effect. */
export async function runTaskStep(id: string, scope: TaskScope, store: TaskStore, executor: TaskExecutor): Promise<JarvisTask> {
  let task = await store.load(id, scope);
  if (task.scope.actorId !== scope.actorId || task.scope.companyId !== scope.companyId || task.scope.objectId !== scope.objectId) throw new Error('SCOPE_CHANGED');
  // A running step may belong to another worker; only a server lease-expiry recovery may interrupt it.
  if (task.cancelled || task.steps.some(s => s.state === 'running')) return task;
  const pending = task.steps.find(s => s.state === 'reconciling');
  const step = pending ?? task.steps.find(s => s.state === 'queued');
  if (!step) return task;
  if (!pending) {
    const next = taskTransition(task, { type: 'start', stepId: step.id }, scope, task.revision);
    await store.save(next, task.revision); task = next;
    try { await executor.execute(step, scope); }
    catch {
      const interrupted = taskTransition(task, { type: 'interrupt' }, scope, task.revision);
      await store.save(interrupted, task.revision);
      return interrupted;
    }
  }
  let evidence: string | null = null;
  try { evidence = await executor.readback(step, scope); } catch { /* Unknown outcome remains unresolved. */ }
  const next = evidence ? taskTransition(task, { type: 'verify', stepId: step.id, evidence }, scope, task.revision)
    : taskTransition(task, { type: 'interrupt' }, scope, task.revision);
  await store.save(next, task.revision);
  return next;
}
