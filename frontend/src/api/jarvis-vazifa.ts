import { taskPayload } from '../lib/ai-yordamchi/vazifa-payload';
import type { JarvisTask, TaskScope } from '../lib/ai-yordamchi/vazifa';

type JarvisVazifaXatosi = { ok: false; error: string; code?: string; status?: number };
type JarvisVazifaMuvaffaqiyati<K extends 'task' | 'tasks'> = K extends 'task'
  ? { ok: true; task: JarvisTask }
  : { ok: true; tasks: JarvisTask[] };

type XomJavob = {
  ok?: unknown;
  task?: unknown;
  tasks?: unknown;
  error?: unknown;
  code?: unknown;
};

function xato(error: string, status?: number, code?: string): JarvisVazifaXatosi {
  return { ok: false, error, ...(status === undefined ? {} : { status }), ...(code ? { code } : {}) };
}

async function yubor<K extends 'task' | 'tasks'>(body: Record<string, unknown>, resultKey: K, scope: TaskScope, signal?: AbortSignal): Promise<JarvisVazifaXatosi | JarvisVazifaMuvaffaqiyati<K>> {
  let response: Response;
  try {
    response = await fetch('/api/agent-ish', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    return xato(`Tarmoq xatosi: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  let parsed: XomJavob;
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return xato(`Server javobi noto‘g‘ri (HTTP ${response.status})`, response.status);
    }
    parsed = value as XomJavob;
  } catch {
    return xato(`Server javobini o‘qib bo‘lmadi (HTTP ${response.status})`, response.status);
  }

  if (!response.ok) {
    return xato(typeof parsed.error === 'string' ? parsed.error : `So‘rov rad etildi (HTTP ${response.status})`, response.status,
      typeof parsed.code === 'string' ? parsed.code : undefined);
  }
  if (parsed.ok === false) {
    return xato(typeof parsed.error === 'string' ? parsed.error : 'Server so‘rovni rad etdi', response.status,
      typeof parsed.code === 'string' ? parsed.code : undefined);
  }
  if (parsed.ok !== true || !(resultKey in parsed) || (resultKey === 'tasks' ? !Array.isArray(parsed.tasks) : !parsed.task || typeof parsed.task !== 'object' || Array.isArray(parsed.task))) {
    return xato(`Server javobi kutilgan formatda emas (HTTP ${response.status})`, response.status);
  }
  const tasks = resultKey === 'tasks' ? parsed.tasks as unknown[] : [parsed.task];
  if (tasks.length > 50 || tasks.some(value => {
    if (!value || typeof value !== 'object') return true;
    const task = value as JarvisTask;
    return !taskPayload(task,scope) || typeof task.id !== 'string' || typeof task.goal !== 'string' || !Number.isSafeInteger(task.revision) || typeof task.cancelled !== 'boolean' || !task.scope || task.scope.actorId !== scope.actorId || task.scope.companyId !== scope.companyId || task.scope.objectId !== scope.objectId || !Array.isArray(task.steps) || task.steps.some(step => !step || typeof step.id !== 'string' || typeof step.tool !== 'string' || !['queued','running','reconciling','verified'].includes(step.state) || (step.evidence !== null && typeof step.evidence !== 'string'));
  })) return xato('Server task scope or shape invalid', response.status);
  return { ok: true, [resultKey]: parsed[resultKey] } as JarvisVazifaMuvaffaqiyati<K>;
}

function doiraMaydonlari(scope: TaskScope) {
  return { kompaniya_id: scope.companyId, obyekt_id: scope.objectId };
}

export function vazifaRoyxat(
  scope: TaskScope,
  signal?: AbortSignal,
): Promise<JarvisVazifaXatosi | JarvisVazifaMuvaffaqiyati<'tasks'>> {
  return yubor({ amal: 'vazifa_royxat', ...doiraMaydonlari(scope) }, 'tasks', scope, signal);
}

export function vazifaOl(
  scope: TaskScope,
  id: string,
  signal?: AbortSignal,
): Promise<JarvisVazifaXatosi | JarvisVazifaMuvaffaqiyati<'task'>> {
  return yubor({ amal: 'vazifa_ol', ...doiraMaydonlari(scope), id }, 'task', scope, signal);
}

export function vazifaSaqla(
  task: JarvisTask,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<JarvisVazifaXatosi | JarvisVazifaMuvaffaqiyati<'task'>> {
  const { actorId: _serverActorId, ...serverScope } = task.scope;
  const serverTask = { ...task, scope: serverScope };
  return yubor({
    amal: 'vazifa_saqla',
    ...doiraMaydonlari(task.scope),
    id: task.id,
    task: serverTask,
    expected_revision: expectedRevision,
  }, 'task', task.scope, signal);
}
