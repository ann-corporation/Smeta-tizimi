import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';
import { jarvisText, type JarvisText } from './reply-language';

const rpcName = 't2_akt_reestr_obyekt_v1';
const displayLimit = 5;
const statusNames: Readonly<Record<string, readonly [string, string]>> = {
  draft: ['Qoralama', 'Черновик'], submitted: ['Yuborilgan', 'Отправлен'], checked: ['Tekshirilgan', 'Проверен'], approved: ['Tasdiqlangan', 'Утверждён'],
  rejected: ['Rad etilgan', 'Отклонён'], cancelled: ['Bekor qilingan', 'Отменён'], superseded: ['Yangi versiya bilan almashtirilgan', 'Заменён новой версией'],
};
type Filter = { number: string | null; month: string | null; needsMonth: boolean; status: 'approved' | 'draft' | null };

export function f2RegisterIntent(question: string): Filter | null {
  const text = question.toLowerCase().replace(/[‘’ʻʼ'\x60]/g, '').replace(/[‐‑–—]/g, '-');
  if (!/(?:^|[^\p{L}\p{N}])(?:f-?2|ф-?2|forma[ -]?2|форма[ -]?2|кс[ -]?2)(?![\p{L}\p{N}])/u.test(text)) return null;
  if (!/(?:royxat|holat|reestr|qaysi|tasdiqlanganmi|рўйхат|ҳолат|тасдиқланганми|список|статус|реестр|утвержд[её]н)/u.test(text)) return null;
  if (/(?:summa|narx|qiymat|сумм|цен[ау]|қиймат|ёзиб|ярат|kirit|yarat|saqla|ochir|bekor qil|tasdiqla(?:[^\p{L}]|$)|\byoz\b|внес|созда|удали|отмени|утверди)/u.test(text)) return null;
  const number = /(?:№|#)\s*([\p{L}\p{N}][\p{L}\p{N}./-]{0,59})(?![\p{L}\p{N}./-])/u.exec(text)?.[1]?.replace(/\.$/, '') ?? null;
  const month = /(?:^|[^\d])(\d{4}-(?:0[1-9]|1[0-2]))(?![\d-])/u.exec(text)?.[1] ?? null;
  const periodText = number ? text.replace(number, '') : text;
  const needsMonth = !month && /(?:\d{4}|oylik|oyda|shu oy|otgan oy|davr|yanvar|fevral|mart|aprel|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr|месяц|период|январ|феврал|март|апрел|июн|июл|август|сентябр|октябр|ноябр|декабр|ойлик|шу ой)/u.test(periodText);
  const approved = /(?:tasdiqlangan(?!mi)|тасдиқланган(?!ми)|утвержд[её]нны)/u.test(text);
  const draft = /(?:qoralama|қоралама|черновик)/u.test(text);
  return { number, month, needsMonth, status: number || approved === draft ? null : approved ? 'approved' : 'draft' };
}

type Act = {
  id: number; obyekt_id: number; kompaniya_id: number; tur: 'f2';
  raqam: string | null; oy: string | null; holat: string; lifecycle_status?: string | null;
};
function scopedAct(row: unknown, object: number, company: number): row is Act {
  if (typeof row !== 'object' || row === null) return false;
  const a = row as Partial<Act>;
  return a.obyekt_id === object && a.kompaniya_id === company && a.tur === 'f2' &&
    typeof a.id === 'number' && Number.isSafeInteger(a.id) && a.id > 0 &&
    (a.raqam === null || typeof a.raqam === 'string') && (a.oy === null || typeof a.oy === 'string') &&
    typeof a.holat === 'string' && (a.lifecycle_status == null || typeof a.lifecycle_status === 'string');
}

const safeNumber = (number: string | null) => number?.replace(/[^\p{L}\p{N}\s./-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60) || null;
const legacyStatus = new Map([['qoralama', 'draft'], ['tasdiqlangan', 'approved'], ['bekor', 'cancelled']]);
const actStatus = (row: Act) => row.lifecycle_status || legacyStatus.get(row.holat) || '';
function actLine(row: Act, text: JarvisText) {
  const number = safeNumber(row.raqam);
  const month = row.oy?.match(/^\d{4}-(?:0[1-9]|1[0-2])(?=-|$)/)?.[0];
  const lifecycle = actStatus(row);
  const labels = Object.hasOwn(statusNames, lifecycle) ? statusNames[lifecycle] : undefined;
  const status = labels ? text(...labels) : text('Holati nomaʼlum', 'Статус неизвестен');
  return text('- F2', '- КС-2') + ' ' + (number ? '№ ' + number : '#' + row.id) + (month ? ' · ' + month : '') + ' · ' + status;
}

export async function f2RegisterAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, filter: Filter) {
  const text = scope.text ?? jarvisText();
  const unavailable = { javob: text('F2 reestrini hozir tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring.', 'Не удалось проверить реестр КС-2. Повторите запрос позже.') };
  const denied = { rad: true, javob: text('F2 reestrini ko‘rish uchun ruxsat kerak.', 'Для просмотра реестра КС-2 нужен доступ.') } as const;
  if (filter.needsMonth) return { javob: text('Qaysi oy kerak? Oyni YYYY-MM shaklida yozing.', 'За какой месяц показать реестр? Укажите месяц в формате YYYY-MM.') };
  const selected = await resolveJarvisObject(rpc, scope).catch(() => ({ tur: 'unavailable' as const }));
  if (selected.tur === 'denied') return denied;
  if (selected.tur === 'unavailable') return unavailable;
  if (selected.tur === 'noaniq') return { javob: text('Qaysi obyekt?', 'Какой объект?') + ' ' + selected.variantlar.map(row => row.nom).join(' · ') };
  if (selected.tur === 'yoq') return { javob: text('Qaysi obyektning F2 reestri kerak? Obyekt nomini yozing.', 'Для какого объекта нужен реестр КС-2? Укажите название.') };
  const { id, nom } = selected.obyekt;
  const result = await rpc(rpcName, { p_actor_id: scope.actor, p_obyekt_id: id, p_tur: 'f2' }).catch(() => null);
  if (!result?.ok) return result?.status === 403 ? denied : unavailable;
  const rows = result.data.qatorlar;
  if (!Array.isArray(rows) || !rows.every(row => scopedAct(row, id, scope.company))) return unavailable;
  const filtered = (rows as Act[]).filter(row =>
    !(row.holat === 'bekor' && (row.lifecycle_status ?? 'draft') === 'draft') &&
    (!filter.number || row.raqam?.trim().toLowerCase() === filter.number) &&
    (!filter.status || actStatus(row) === filter.status) &&
    (!filter.month || row.oy === filter.month || row.oy?.startsWith(filter.month + '-')));
  const yol = '/admin/f2-tarix?obyekt=' + id;
  const shown = filtered.slice(0, displayLimit);
  const lines = shown.length ? shown.map(row => actLine(row, text)).join('\n') : text('Mos F2 hujjati topilmadi.', 'Подходящие акты КС-2 не найдены.');
  const note = filtered.length > shown.length ? text('\n\nOxirgi {count} tasi ko‘rsatildi. To‘liq ro‘yxat havolada.', '\n\nПоказаны последние акты ({count}). Полный список по ссылке.', { count: shown.length }) : '';
  return {
    javob: text('**{name}** · F2 reestri', '**{name}** · реестр КС-2', { name: nom }) + '\n\n' + lines + note + '\n\n' +
      text('[Manbani ochish]({url})', '[Открыть источник]({url})', { url: yol }),
    dalil: { tur: 'f2-reestr', id, rpc: rpcName, yol, akt_ids: shown.map(row => row.id) },
  };
}
