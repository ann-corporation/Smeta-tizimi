import { base64url, positiveId, unbase64url, uuid } from '../desktop-device';
import { uuidHosila } from '../f2-buyruq-yadro';
import { taskDraft, type TaskDraft, type TaskPreview } from '../../../src/lib/jarvis/task-command';

export type TaskNames = { obyekt_nom: string | null; ijrochi_nom: string | null };
export type TaskCheck = (args: TaskDraft) => Promise<TaskNames | { code: string; status: number }>;
type Envelope = { a: number; k: number; op: string; args: TaskDraft; names: TaskNames; e: number };
type Result = { kind: 'preview'; value: TaskPreview } | { kind: 'confirmed'; body: Record<string, unknown> }
  | { kind: 'error'; code: string; status: number };
const enc = new TextEncoder();
const fail = (code: string, status = 400): Result => ({ kind: 'error', code, status });
const named = (id: number | null, name: unknown) => id === null ? name === null : typeof name === 'string' && !!name.trim() && name.length <= 500;
const validNames = (args: TaskDraft, names: TaskNames) => named(args.obyekt_id, names.obyekt_nom) && named(args.ijrochi_foydalanuvchi_id, names.ijrochi_nom);
const key = (secret: string) => crypto.subtle.importKey('raw', enc.encode('jarvis-task:v1:' + secret),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
async function signed(secret: string, body: Envelope) {
  const payload = base64url(enc.encode(JSON.stringify(body)));
  return payload + '.' + base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload))));
}
async function verified(secret: string, raw: unknown, now: number): Promise<Envelope | null> {
  if (typeof raw !== 'string' || raw.length > 24000 || raw.split('.').length !== 2) return null;
  try {
    const [p, s] = raw.split('.');
    if (!await crypto.subtle.verify('HMAC', await key(secret), unbase64url(s), enc.encode(p))) return null;
    const y = JSON.parse(new TextDecoder().decode(unbase64url(p))) as Envelope;
    return positiveId(y?.a) && positiveId(y.k) && uuid(y.op) && taskDraft(y.args) &&
      Number.isSafeInteger(y.e) && y.e > now && y.e <= now + 15 * 60000 && y.names &&
      (y.names.obyekt_nom === null || typeof y.names.obyekt_nom === 'string') &&
      (y.names.ijrochi_nom === null || typeof y.names.ijrochi_nom === 'string') ? y : null;
  } catch { return null; }
}

/** Only confirmation returns a body for the EXISTING task writer. No business writes here. */
export async function taskCommand(secret: string, actor: number, company: number, input: Record<string, unknown>,
  check: TaskCheck, now = Date.now()): Promise<Result> {
  if (!secret || !positiveId(actor) || !positiveId(company)) return fail('TASK_CONTEXT_INVALID', 503);
  if (input.kompaniya_id !== company) return fail('TASK_CONTEXT_INVALID', 403);
  if (input.amal === 'jarvis_preview') {
    if (Object.keys(input).some(k => !['amal', 'kompaniya_id', 'operation_id', 'args'].includes(k))) return fail('TASK_DRAFT_INVALID');
    const args = taskDraft(input.args);
    if (!args || !uuid(input.operation_id)) return fail('TASK_DRAFT_INVALID');
    const names = await check(args).catch(() => ({ code: 'TASK_SOURCE_UNAVAILABLE', status: 503 }));
    if ('code' in names) return fail(names.code, names.status);
    if (!validNames(args, names)) return fail('TASK_SOURCE_UNAVAILABLE', 503);
    const op = await uuidHosila(input.operation_id, `jarvis-task:v1:${actor}:${company}:` + JSON.stringify(args));
    const token = await signed(secret, { a: actor, k: company, op, args, names, e: now + 15 * 60000 });
    if (token.length > 24000) return fail('TASK_PREVIEW_TOO_LARGE', 413);
    return { kind: 'preview', value: { ok: true, holat: 'tasdiq_kerak', token, operation_id: op, args, ...names } };
  }
  if (input.amal !== 'jarvis_confirm' || input.tasdiqlayman !== true ||
      Object.keys(input).some(k => !['amal', 'kompaniya_id', 'token', 'tasdiqlayman'].includes(k))) return fail('TASK_CONFIRM_REQUIRED');
  const payload = await verified(secret, input.token, now);
  if (!payload || payload.a !== actor || payload.k !== company) return fail('TASK_PREVIEW_INVALID', 403);
  const names = await check(payload.args).catch(() => ({ code: 'TASK_SOURCE_UNAVAILABLE', status: 503 }));
  if ('code' in names) return fail(names.code, names.status);
  if (!validNames(payload.args, names)) return fail('TASK_SOURCE_UNAVAILABLE', 503);
  if (names.obyekt_nom !== payload.names.obyekt_nom || names.ijrochi_nom !== payload.names.ijrochi_nom) return fail('TASK_PREVIEW_CHANGED', 409);
  return { kind: 'confirmed', body: { amal: 'ber', kompaniya_id: company, operation_id: payload.op,
    ...payload.args, ijrochi_kompaniya_id: company } };
}
