import { jarvisMoney } from '../../../src/lib/jarvis/answers';
import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';
import { jarvisText } from './reply-language';

const source = 't2_nakopitelniy_v2';
const monthPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/;
type Query = { month: string | null; clarify: boolean; paymentBasis: boolean };

export function cumulativeIntent(question: string): Query | null {
  const q = question.toLowerCase().replace(/[‘’ʻʼ'`]/g, '').replace(/[‐‑–—]/g, '-');
  if (!/nakopitel|накопител/u.test(q) || /\byoz\b|kirit|yarat|saqla|yuklab|chiqar|eksport|ёзиб|кирит|ярат|сақла|юклаб|экспорт|созда|внес[иёт]|сформируй|выгрузи|удали/u.test(q)) return null;
  const dates = q.match(/(?<!\d)\d{4}-\d{1,2}(?:-\d{1,2})?(?!\d)/g) ?? [];
  const month = dates.length === 1 && monthPattern.test(dates[0]) ? dates[0] : null;
  const basis = q.replace(/(?:qqs|nds|ққс)\s*(?:siz|сиз)|ustamasiz|устамасиз|без\s+(?:ндс|накладн\p{L}*\s+расход\p{L}*)/gu, '');
  return { month, clarify: !month && (dates.length > 0 || /\b(?:\d{4}|shu oy|otgan oy|oylik|davr|yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr)\b|шу ой|ўтган ой|давр|месяц|период|январ|феврал|март|апрел|ма[йея]|июн|июл|август|сентябр|октябр|ноябр|декабр/u.test(q)),
    paymentBasis: /qqs|nds|ндс|ққс|ustama|устама|nakrutk|накрутк|накладн|к оплате|tolov|\bf-?3\b|кс-?3/u.test(basis) };
}

const record = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export async function cumulativeAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, query: Query,
  authority: RpcNatija | null, amountPermitted: boolean) {
  const text = scope.text ?? jarvisText();
  const denied = { rad: true, javob: text('Nakopitelniydagi summalarni ko‘rish uchun F2 va uning summalariga ruxsat kerak.', 'Для просмотра сумм накопительной ведомости нужен доступ к КС-2 и их суммам.') } as const;
  const unavailable = { javob: text('Nakopitelniyni hozir o‘qib bo‘lmadi. Keyinroq qayta urinib ko‘ring.', 'Не удалось прочитать накопительную ведомость. Повторите запрос позже.') };
  if (!amountPermitted || !jarvisHasPermission(authority, scope.company, 'f2.read')) return denied;
  if (query.clarify) return { javob: text('Qaysi oy kerak? Bitta oyni YYYY-MM shaklida yozing.', 'За какой месяц показать ведомость? Укажите один месяц в формате YYYY-MM.') };
  if (query.paymentBasis) return { javob: text('Bu nakopitelniy o‘qishi ustamasiz va QQSsiz summani beradi. To‘lov yoki QQS bilan qiymat uchun tegishli F3 hujjatini oching.', 'По ведомости доступны прямые суммы без накладных расходов и НДС. Сумму к оплате и сумму с НДС смотрите в соответствующей КС-3.') };
  const object = await resolveJarvisObject(rpc, scope).catch(() => ({ tur: 'unavailable' as const }));
  if (object.tur === 'denied') return denied;
  if (object.tur === 'unavailable') return unavailable;
  if (object.tur === 'noaniq') return { javob: text('Qaysi obyekt? {names}', 'Какой объект? {names}', { names: object.variantlar.map(row => row.nom).join(' · ') }) };
  if (object.tur === 'yoq') return { javob: text('Qaysi obyektning nakopitelniyi kerak? Obyekt nomini yozing.', 'Для какого объекта нужна накопительная ведомость? Укажите название.') };

  const { id, nom } = object.obyekt;
  const result = await rpc(source, { p_actor_id: scope.actor, p_obyekt_id: id, p_davr: query.month ? query.month + '-01' : null,
    p_limit: 1, p_offset: 0, p_faqat_faol: false }).catch(() => null);
  if (result?.status === 403) return denied;
  if (!result?.ok || result.data.ok !== true) return unavailable;
  const { obyekt, davr, jami, davrlar } = result.data;
  const returned = record(obyekt);
  const totals = record(jami);
  if (returned?.id !== id || returned.kompaniya_id !== scope.company || typeof davr !== 'string' || !monthPattern.test(davr) ||
    (query.month !== null && query.month !== davr) || !totals || !Array.isArray(davrlar)) return unavailable;
  const periods = davrlar.map(record);
  if (periods.some(period => !period || typeof period.oy !== 'string' || !monthPattern.test(period.oy) || typeof period.certified !== 'boolean')) return unavailable;

  const hasApproved = periods.some(period => period?.certified === true && String(period.oy) <= davr);
  const currentApproved = periods.some(period => period?.certified === true && period.oy === davr);
  const count = totals.f2_summa_nomalum;
  const unknown = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
  const complete = unknown === 0;
  const sum = complete ? finite(totals.jami_tasdiqlangan_summa) : null;
  const partial = finite(totals.jami_tasdiqlangan_malum_summa);
  const month = complete ? finite(totals.joriy_tasdiqlangan_summa) : null;
  const money = (value: number) => jarvisMoney(value, text('so‘m', 'сум'));
  const missing = text('Summa noma’lum.', 'Сумма неизвестна.');
  const cumulative = !hasApproved ? text('Shu oygacha tasdiqlangan F2 topilmadi.', 'До конца этого месяца утверждённых КС-2 нет.')
    : sum !== null ? money(sum) : unknown !== null && unknown > 0 && partial !== null && partial !== 0
      ? text('Ma’lum qismi {sum}. Noma’lum summali qatorlar: {count}.', 'Известная часть — {sum}. Позиций с неизвестной суммой: {count}.', { sum: money(partial), count: unknown }) : missing;
  const monthly = !currentApproved ? text('Bu oyda tasdiqlangan F2 topilmadi.', 'В этом месяце утверждённых КС-2 нет.') : month !== null ? money(month) : missing;
  const yol = `/admin/nakopitelniy?obyekt=${id}&davr=${davr}`;
  return {
    javob: text('**{name}** · nakopitelniy · {period}\nUstamasiz, QQSsiz.\n\n- Oy bo‘yicha: {monthly}\n- Oy oxirigacha jami: {total}\n\n[Manbani ochish]({url})',
      '**{name}** · накопительная ведомость · {period}\nПрямые суммы без накладных расходов и НДС.\n\n- За месяц: {monthly}\n- Нарастающим итогом: {total}\n\n[Открыть источник]({url})',
      { name: nom, period: davr, monthly, total: cumulative, url: yol }),
    dalil: { tur: 'nakopitelniy', id, davr, rpc: source, yol },
    sahifalar: [{ yol, nom: text('Nakopitelniy', 'Накопительная ведомость') }],
  };
}
