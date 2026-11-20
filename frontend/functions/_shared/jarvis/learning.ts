import { rpcData, type AgentRpcEnv } from '../agent-rpc';
import { jarvisToolNames, type JarvisToolName } from '../../../src/lib/jarvis/tool-registry';

export type JarvisSignal =
  | { kind: 'tool_finished' | 'tool_failed' | 'no_answer' | 'permission_denied'; tool: JarvisToolName; ms: number }
  | { kind: 'feedback_good' | 'feedback_bad' | 'feedback_unclear' };
const feedback = new Set(['feedback_good', 'feedback_bad', 'feedback_unclear']);
const outcomes = new Set(['tool_finished', 'tool_failed', 'no_answer', 'permission_denied']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timeBucket = (ms: number) => ms < 5000 ? 't0' : ms < 30000 ? 't1' : ms < 120000 ? 't2' : ms < 600000 ? 't3' : 't4';

/** Fixed-code counters in the EXISTING friction store, never transcripts or learned business facts.
 * o=0 deliberately: a server attempt is not proof of a distinct person. No global promotion here.
 */
export function jarvisSignalRow(signal: JarvisSignal) {
  if (!signal || typeof signal !== 'object') return null;
  if (feedback.has(signal.kind)) return {
    s: 'jarvis', a: signal.kind, h: signal.kind === 'feedback_good' ? 'tugadi' : 'tashlandi',
    k: signal.kind === 'feedback_good' ? 't0' : '', n: 1, o: 0,
  };
  if (!outcomes.has(signal.kind) || !('tool' in signal) || !jarvisToolNames.includes(signal.tool) ||
      !Number.isFinite(signal.ms) || signal.ms < 0) return null;
  return { s: 'jarvis', a: `read.${signal.tool}`, h: signal.kind === 'tool_finished' ? 'tugadi' : 'xato',
    k: signal.kind === 'tool_finished' ? timeBucket(signal.ms) : signal.kind === 'tool_failed' ? 'SOURCE_UNAVAILABLE'
      : signal.kind === 'no_answer' ? 'NO_ANSWER' : 'FORBIDDEN', n: 1, o: 0 };
}

/** Best effort, same <=2s ceiling as telemetry. Host passes authenticated actor/company.
 * Retries may reuse the SAME event operationId; invalid supplied IDs are rejected, never regenerated.
 */
export async function jarvisSignalYoz(env: AgentRpcEnv, actor: number, company: number, signal: JarvisSignal,
  operationId?: unknown): Promise<boolean> {
  const batch = jarvisSignalBatch(env, actor, company, operationId);
  batch.record(signal);
  return batch.flush();
}

export type JarvisSignalSink = (signal: JarvisSignal) => void;
/** Request-local aggregation: one bounded RPC per turn, not one write per tool. */
export function jarvisSignalBatch(env: AgentRpcEnv, actor: number, company: number, operationId?: unknown) {
  const rows = new Map<string, NonNullable<ReturnType<typeof jarvisSignalRow>>>();
  let pending: Promise<boolean> | undefined;
  const record: JarvisSignalSink = signal => {
    if (pending) return;
    const row = jarvisSignalRow(signal); if (!row) return;
    const key = JSON.stringify(row); const previous = rows.get(key);
    if (previous) previous.n = Math.min(1000, previous.n + 1);
    else if (rows.size < 60) rows.set(key, row);
  };
  const flush = () => pending ??= writeRows([...rows.values()]);
  return { record, flush };

  async function writeRows(batch: Array<NonNullable<ReturnType<typeof jarvisSignalRow>>>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!batch.length || !Number.isSafeInteger(actor) || actor <= 0 || !Number.isSafeInteger(company) || company <= 0 ||
        !env.SUPABASE_URL || !env.SUPABASE_KEY || (operationId !== undefined && (typeof operationId !== 'string' || !uuid.test(operationId)))) return false;
      const write = rpcData(env, 't2_osuvchi_yoz_v1', {
        p_actor_id: actor, p_kompaniya_id: company, p_operation_id: operationId ?? crypto.randomUUID(),
        p_amal: 'friksiya_yubor', p_yuk: { qatorlar: batch },
      }, AbortSignal.timeout(2000)).then(result => result.ok && (result.data.takror === true ||
        (typeof result.data.qabul === 'number' && result.data.qabul > 0)));
      return await Promise.race([write, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 2000); })]);
    } catch { return false; }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
}
