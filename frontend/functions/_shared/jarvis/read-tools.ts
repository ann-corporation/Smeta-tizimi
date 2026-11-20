import { jarvisTools, type JarvisToolName } from '../../../src/lib/jarvis/tool-registry';
import { rpcData, type RpcNatija } from '../agent-rpc';
import { telemetriyaYoz } from '../ai-telemetriya';
import type { JarvisSignalSink } from './learning';
import { jarvisHasPermission } from './authority';
import type { JarvisEnv } from './chat';
import { cumulativeAnswer, cumulativeIntent } from './cumulative';
import { discrepancyAnswer, discrepancyIntent } from './discrepancies';
import { documentAnswer, documentIntent } from './documents';
import { estimatePriceAnswer, estimatePriceIntent } from './estimate-prices';
import { estimateRowAnswer, estimateRowIntent } from './estimate-row';
import { f2RegisterAnswer, f2RegisterIntent } from './f2-register';
import { normAnswer, normReference } from './normative';
import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';
import { priceRowAnswer, priceRowIntent, priceSearchAnswer, priceSearchIntent } from './prices';
import { jarvisText } from './reply-language';
import { warehouseAnswer, warehouseIntent } from './warehouse';
import { taskListAnswer, taskListIntent } from './tasks';
import { approvalsAnswer, approvalsIntent, approvalsVisible } from './approvals';
import { pulJavobi, pulSorovi } from '../agent-pul-javob';
import { materialPriceAnswer, materialPriceIntent } from './material-prices';

type Answer = { javob: string; rad?: boolean; dalil?: unknown; sahifalar?: Array<{ yol: string; nom: string }> };
type LocalCall = { name: JarvisToolName; args: unknown };
const objectIntent = (query: string) => /(?:obyekt(?:ni)? (?:top|qidir)|объект(?:ни)?\s+(?:найди|топ|қидир)|найди объект)/iu.test(query) ? query : null;
const catalogIntent = (q: string) => priceRowIntent(q) ?? priceSearchIntent(q);
const parsers = {
  object_search: objectIntent, estimate_row: estimateRowIntent, estimate_price: (q: string) => {
    const terms = estimatePriceIntent(q);
    return terms.length ? terms : null;
  },
  material_prices: materialPriceIntent, norm_reference: normReference, catalog_price: catalogIntent, f2_register: f2RegisterIntent,
  cumulative: cumulativeIntent, discrepancy: (q: string) => discrepancyIntent(q) || null,
  warehouse_balance: warehouseIntent, document_search: documentIntent,
  task_list: taskListIntent, approval_queue: (q: string) => approvalsIntent(q) || null,
  estimate_total: (q: string, history?: unknown) => pulSorovi(q, history) ? q : null,
} satisfies Record<JarvisToolName, (query: string) => unknown>;

export function readToolCall(name: JarvisToolName, query: string, history?: unknown): LocalCall | null {
  const parser: (q: string, history?: unknown) => unknown = parsers[name];
  const args = parser(query, history);
  return args === null ? null : { name, args };
}

export function firstReadTool(names: readonly JarvisToolName[], query: string): LocalCall | null {
  for (const name of names) {
    const call = readToolCall(name, query);
    if (call) return call;
  }
  return null;
}

export function jarvisReadTools(env: JarvisEnv, scope: JarvisObjectScope, men: RpcNatija | null, categories: readonly string[], onSignal?: JarvisSignalSink) {
  const text = scope.text ?? jarvisText();
  const { actor, company } = scope;
  const denied = { rad: true, javob: text('Bu ma’lumotni ko‘rish uchun ruxsat kerak.', 'Для просмотра этих данных нужен доступ.') };
  const unavailable = { javob: text('Manbani hozir tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить источник. Повторите запрос позже.') };
  const visible = (name: JarvisToolName) => jarvisTools[name].permissions.every(permission => jarvisHasPermission(men, company, permission)) &&
    (!['estimate_price', 'estimate_total', 'material_prices'].includes(name) || categories.includes('smeta_pul')) &&
    (name !== 'approval_queue' || approvalsVisible(men, company)) && (name !== 'cumulative' || categories.includes('f2_fakt_pul'));

  async function run(call: LocalCall, _modelRequested = false): Promise<Answer | null> {
    const started = Date.now();
    const signal = AbortSignal.timeout(3500);
    const rpc: JarvisReadRpc = (name, body) => rpcData(env, name, body, signal);
    let answer: Answer | null;
    let error: string | null = null;
    let noAnswer = false;
    const args = call.args;
    try {
      if (!visible(call.name)) answer = denied;
      else switch (call.name) {
        case 'object_search': {
          if (!visible(call.name)) { answer = denied; break; }
          const found = await resolveJarvisObject(rpc, { ...scope, question: String(args), history: [], objectId: null });
          if (found.tur === 'denied') { answer = denied; break; }
          if (found.tur === 'unavailable') { answer = unavailable; error = 'SOURCE_UNAVAILABLE'; break; }
          const rows = found.tur === 'bor' ? [found.obyekt] : found.tur === 'noaniq' ? found.variantlar : [];
          const links = rows.map(row => ({ yol: '/admin/holat/' + row.id, nom: row.nom.replace(/[\r\n<>\[\]*_\x60]/g, ' ').slice(0, 160) }));
          noAnswer = links.length === 0;
          answer = { javob: links.length ? links.map(link => `- [${link.nom}](${link.yol})`).join('\n') :
            text('Mos obyekt topilmadi.', 'Подходящий объект не найден.'), sahifalar: links };
          break;
        }
        case 'cumulative': answer = await cumulativeAnswer(rpc, scope, args as NonNullable<ReturnType<typeof cumulativeIntent>>, men, categories.includes('f2_fakt_pul')); break;
        case 'f2_register': answer = await f2RegisterAnswer(rpc, scope, args as NonNullable<ReturnType<typeof f2RegisterIntent>>); break;
        case 'warehouse_balance': answer = await warehouseAnswer(rpc, actor, company, args as NonNullable<ReturnType<typeof warehouseIntent>>, men, text); break;
        case 'discrepancy': answer = await discrepancyAnswer(rpc, scope, men); break;
        case 'estimate_row': answer = await estimateRowAnswer(rpc, scope, args as string, men); break;
        case 'estimate_price': answer = await estimatePriceAnswer(rpc, scope, args as string[], men, categories.includes('smeta_pul')); break;
        case 'material_prices': answer = await materialPriceAnswer(rpc, scope, args as string[], men, categories.includes('smeta_pul')); break;
        case 'norm_reference': answer = await normAnswer(env, actor, company, args as string, men, text); break;
        case 'catalog_price': answer = typeof args === 'number' ? await priceRowAnswer(env.R2_CANONICAL, args, text)
          : await priceSearchAnswer(env.R2_CANONICAL, args as NonNullable<ReturnType<typeof priceSearchIntent>>, text); break;
        case 'document_search': answer = await documentAnswer(rpc, scope, args as NonNullable<ReturnType<typeof documentIntent>>, men); break;
        case 'task_list': answer = await taskListAnswer(rpc, scope, args as 'today' | 'open', men); break;
        case 'approval_queue': answer = await approvalsAnswer(rpc, scope, men); break;
        case 'estimate_total': answer = !visible(call.name) ? denied : await pulJavobi(rpc, {
          actor, kid: company, savol: String(args), tarix: scope.history, obyektId: scope.objectId, ruxsat: categories, text,
        }); break;
      }
    } catch { answer = unavailable; error = 'SOURCE_UNAVAILABLE'; }
    if (!answer) error = 'SOURCE_UNAVAILABLE';
    if (answer && 'source_unavailable' in answer && answer.source_unavailable === true) error = 'SOURCE_UNAVAILABLE';
    if (answer?.rad) error = 'FORBIDDEN';
    onSignal?.({ kind: answer?.rad ? 'permission_denied' : answer === null || noAnswer ? 'no_answer'
      : error ? 'tool_failed' : 'tool_finished', tool: call.name, ms: Date.now() - started });
    await telemetriyaYoz(env, { actor, kompaniyaId: company, yuza: 'jarvis', vositalar: [call.name], manba: 'tool',
      ok: error === null, xatoKod: error, vositaXato: error ? 1 : 0, kechikishMs: Date.now() - started });
    return answer;
  }
  return { visible, run, unavailable };
}
