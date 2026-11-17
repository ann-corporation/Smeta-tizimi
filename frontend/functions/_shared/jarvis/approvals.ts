import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import type { JarvisObjectScope, JarvisReadRpc } from './object-scope';
import { jarvisText } from './reply-language';

const source = 't2_hujjat_kiruvchi_v1';
const detail = 't2_hujjat_zanjir_tafsilot_v1';
const path = '/admin/hujjat-aylanish';
// Matches _t2_hujjat_azo(..., 'qaror'). The step's nominal role is a workflow label.
const decisionRoles = new Set(['superadmin', 'admin', 'boss', 'rahbar', 'director', 'pto', 'buyurtmachi', 'inspektor']);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const clean = (v: string) => v.replace(/[\r\n<>\[\]*_\x60]/g, ' ').trim().slice(0, 160);

export function approvalsIntent(question: string): boolean {
  const q = question.toLowerCase().replace(/[’ʻʼ‘']/g, '');
  if (/^(?:tasdiqla(?:b ber|ng)?|тасдиқла(?:б бер|нг)?|утверди|подпиши|согласуй|одобри)(?!\p{L})|(?:rad et|рад эт|отклони|верни)(?:\s|$)/u.test(q.trim())) return false;
  return /tasdiqlashim kerak|tasdiq(?:lash)? navbati|mening tasdigim|тасдиқлашим керак|тасдиқ(?:лаш)? навбати|менинг тасдиғим|(?:жд[её]т|ждут) моего (?:согласования|утверждения)|мне (?:нужно |надо )?(?:согласовать|утвердить)|моя очередь (?:согласования|утверждения)/u.test(q);
}

type Approval = { id: number; sarlavha: string; muddat: string | null };
function validApproval(row: unknown): row is Approval {
  if (!row || typeof row !== 'object') return false;
  const a = row as Partial<Approval>;
  return id(a.id) && typeof a.sarlavha === 'string' && (a.muddat === null || typeof a.muddat === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.muddat));
}

export async function approvalsAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, authority: RpcNatija | null) {
  const text = scope.text ?? jarvisText();
  const denied = { rad: true, javob: text('Tasdiqlash navbatini ko‘rish uchun hujjat va qaror ruxsati kerak.', 'Для просмотра очереди нужен доступ к документам и право принимать решения.') };
  const unavailable = { javob: text('Tasdiqlash navbatini tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить очередь согласования. Повторите запрос позже.') };
  if (!jarvisHasPermission(authority, scope.company, 'document.read')) return denied;
  const contexts = authority?.data.context_kompaniyalar;
  const role = Array.isArray(contexts) ? contexts.find(row => row?.kompaniya_id === scope.company)?.effective_role : null;
  if (typeof role !== 'string' || !decisionRoles.has(role)) return denied;

  const scopeArgs = { p_actor_id: scope.actor, p_kompaniya_id: scope.company };
  const result = await rpc(source, scopeArgs).catch(() => null);
  if (result?.status === 401 || result?.status === 403) return denied;
  const rows = result?.data.zanjirlar;
  if (!result?.ok || result.data.ok !== true || !Array.isArray(rows) || rows.length > 50 ||
      !rows.every(validApproval) || new Set(rows.map(row => row.id)).size !== rows.length) return unavailable;

  let candidates = rows;
  let complete = rows.length < 50;
  if (scope.objectId !== null) {
    // The inbox has no object ID. Inspect a bounded batch through the existing scoped read.
    const scanned = rows.slice(0, 8);
    const matches = await Promise.all(scanned.map(async row => {
      const entry = await rpc(detail, { ...scopeArgs, p_zanjir_id: row.id }).catch(() => null);
      const chain = entry?.data.zanjir as { id?: unknown; holat?: unknown; obyekt_id?: unknown } | undefined;
      const steps = entry?.data.qadamlar;
      if (!entry?.ok || entry.data.ok !== true || chain?.id !== row.id || !Array.isArray(steps) ||
          (chain.obyekt_id !== null && !id(chain.obyekt_id))) return null;
      return chain.holat === 'jarayonda' && chain.obyekt_id === scope.objectId &&
        steps.filter(step => step?.holat === 'navbat').length === 1 &&
        steps.some(step => step?.holat === 'navbat' && step.men === true);
    }));
    complete &&= scanned.length === rows.length && matches.every(match => match !== null);
    candidates = scanned.filter((_, index) => matches[index] === true);
  }

  const shown = candidates.slice(0, 6);
  complete &&= shown.length === candidates.length;
  const links = shown.map(row => ({ yol: `${path}?zanjir=${row.id}`, nom: clean(row.sarlavha) || text('Nomsiz hujjat', 'Документ без названия') }));
  const lines = links.map((link, i) => `- [${link.nom}](${link.yol}) · ${shown[i].muddat ?? text('Muddati belgilanmagan', 'Срок не указан')}`);
  if (!lines.length) lines.push(complete ? text('Qaror kutilayotgan hujjat topilmadi.', 'Документы, ожидающие решения, не найдены.')
    : text('Tekshirilgan qismda qaror kutilayotgan hujjat topilmadi.', 'В проверенной части очереди документы, ожидающие решения, не найдены.'));
  if (!complete) lines.push(text('\nTo‘liq navbatni hujjatlar sahifasidan tekshiring.', '\nПроверьте полную очередь на странице документов.'));
  const title = text('Tasdiqlash navbati', 'Очередь согласования');
  return { javob: `**${title}**\n\n${lines.join('\n')}\n\n[${title}](${path})`,
    dalil: { tur: 'tasdiqlash-navbati', rpc: source, zanjir_ids: shown.map(row => row.id), toliq: complete, yol: path },
    sahifalar: [...links, { yol: path, nom: title }],
  };
}
