import { jarvisHasPermission } from './authority';
import type { RpcNatija } from '../agent-rpc';
import type { JarvisObjectScope, JarvisReadRpc } from './object-scope';
import { jarvisText } from './reply-language';

const rpcName = 't2_topshiriqlar_v1';
const path = '/admin/topshiriqlar';
const pageSize = 100;
const visibleLimit = 8;
const openStates = new Set(['berildi', 'qabul_qilindi', 'bajarilmoqda', 'qaytarildi']);
const states = new Set([...openStates, 'rad', 'bajarildi', 'tasdiqlandi', 'bekor']);
const uzDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' });
const isoDate = /^\d{4}-\d\d-\d\d$/;
const safeId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const safeTitle = (v: string) => v.replace(/[\r\n<>\[\]*_\x60]/g, ' ').trim().slice(0, 160);

export function taskListIntent(question: string): 'today' | 'open' | null {
  const q = question.toLowerCase().replace(/[’ʻʼ‘']/g, '');
  if (!/topshiriq|vazifa|топшириқ|вазифа|задач|поручени/u.test(q) ||
      /yarat|bering|ber\b|qosh\b|ozgartir|ochir|tasdiqla|bekor|созда|добав|удал|отмен|подтверд|поставь|назначь|ярат|қўш|ўзгартир|беринг/u.test(q)) return null;
  const today = /bugun|бугун|сегодня/u.test(q);
  const personal = /mening|menga|менинг|менга|мои|мне|у меня/u.test(q);
  if (today) return 'today';
  return personal ? 'open' : null;
}

type Task = { id: number; sarlavha: string; holat: string; muddat: string | null; obyekt_id: number | null;
  ijrochi_kompaniya_id: number; ijrochi_foydalanuvchi_id: number | null };

function validRow(row: unknown): row is Task {
  if (!row || typeof row !== 'object') return false;
  const t = row as Partial<Task>;
  return safeId(t.id) && typeof t.sarlavha === 'string' && typeof t.holat === 'string' && states.has(t.holat) &&
    (t.muddat === null || typeof t.muddat === 'string' && isoDate.test(t.muddat)) && (t.obyekt_id === null || safeId(t.obyekt_id)) &&
    safeId(t.ijrochi_kompaniya_id) && (t.ijrochi_foydalanuvchi_id === null || safeId(t.ijrochi_foydalanuvchi_id));
}

export async function taskListAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, intent: 'today' | 'open', authority: RpcNatija | null) {
  const text = scope.text ?? jarvisText();
  const denied = { rad: true, javob: text('Topshiriqlarni ko‘rish uchun kompaniyaga kirish ruxsati kerak.', 'Для просмотра задач нужен доступ к компании.') };
  const unavailable = { javob: text('Topshiriqlarni tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить задачи. Повторите запрос позже.') };
  if (!jarvisHasPermission(authority, scope.company, 'company.read')) return denied;

  const today = uzDate.format(new Date());
  const matches: Task[] = [];
  let cursor: number | null = null;
  let complete = false;
  for (let page = 0; page < 3; page++) {
    const result: RpcNatija | null = await rpc(rpcName, { p_actor_id: scope.actor, p_kompaniya_id: scope.company, p_yonalish: 'menga',
      p_holat: null, p_obyekt_id: scope.objectId, p_limit: pageSize, p_keyin_id: cursor }).catch(() => null);
    if (result?.status === 401 || result?.status === 403) return denied;
    if (!result?.ok || result.data.ok !== true) {
      if (page === 0) return unavailable;
      break;
    }
    const rows: unknown = result.data.qatorlar;
    const next: unknown = result.data.keyingi_id;
    if (!Array.isArray(rows) || rows.length > pageSize || !rows.every(validRow) ||
        rows.some((row, i) => row.ijrochi_kompaniya_id !== scope.company || (scope.objectId !== null && row.obyekt_id !== scope.objectId) ||
          (i > 0 && row.id >= rows[i - 1].id) || (cursor !== null && row.id >= cursor)) ||
        (next !== null && (!safeId(next) || rows.length !== pageSize || rows.at(-1)?.id !== next))) return unavailable;
    matches.push(...rows.filter(row => row.ijrochi_foydalanuvchi_id === scope.actor && openStates.has(row.holat) &&
      (intent === 'open' || row.muddat === today)));
    if (next === null) { complete = true; break; }
    if (matches.length > visibleLimit) break;
    cursor = next;
  }

  const shown = matches.slice(0, visibleLimit);
  const title = intent === 'today' ? text('**Bugun muddati tugaydigan topshiriqlar**', '**Задачи со сроком на сегодня**')
    : text('**Ochiq topshiriqlaringiz**', '**Ваши открытые задачи**');
  const details = shown.map(row => '- ' + (safeTitle(row.sarlavha) || text('Nomsiz topshiriq', 'Задача без названия')) +
    ' · ' + (row.muddat ?? text('Muddati belgilanmagan', 'Срок не указан')));
  if (!details.length) details.push(complete ? text('Sizga biriktirilgan topshiriq topilmadi.', 'Назначенные вам задачи не найдены.')
    : text('Tekshirilgan qismda sizga biriktirilgan topshiriq topilmadi.', 'В проверенной части списка назначенные вам задачи не найдены.'));
  if (!complete || matches.length > visibleLimit) details.push(text('\nTo‘liq ro‘yxatni topshiriqlar sahifasidan ko‘ring.', '\nОткройте страницу задач, чтобы посмотреть полный список.'));
  const name = text('Mening topshiriqlarim', 'Мои задачи');
  return { javob: `${title}\n\n${details.join('\n')}\n\n[${name}](${path})`,
    dalil: { tur: 'topshiriqlar', rpc: rpcName, topshiriq_ids: shown.map(row => row.id), toliq: complete && matches.length <= visibleLimit, yol: path },
    sahifalar: [{ yol: path, nom: name }] };
}
