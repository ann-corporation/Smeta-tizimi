import { jarvisMoney } from '../../../src/lib/jarvis/answers';
import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';
import { jarvisText, type JarvisText } from './reply-language';

const metrics = {
  f2: { label: ['Tasdiqlangan F2 jami', 'Итого по утверждённым КС-2'], path: '/admin/f2-tarix', empty: ['Tasdiqlangan F2 topilmadi.', 'Утверждённые КС-2 не найдены.'] },
  fakt: { label: ['Fakt jami', 'Итого по факту'], path: '/admin/fakt', empty: ['Fakt yozuvi topilmadi.', 'Записи факта не найдены.'] },
} as const;

type Metric = keyof typeof metrics;
const sourceRpc = 't2_object_financials_v1';
const period = /(?:\boy\b|oylik|oyda|davr|yilda|yilgi|hafta|bugun|kecha|chorak|yanvar|fevral|martda|aprel|iyun|iyul|avgust|sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr|месяц|недел|период|сегодня|январ|феврал|март|апрел|июн|июл|август|сентябр|октябр|ноябр|декабр|йил|ойлик|ҳафта|давр|\d{4}|\d+[./]\d+)/u;
const otherMeasure = /(?:qqs|nds|ндс|ққс|устама|ustama|nakrutk|накрутк|hajm|ҳажм|объ[её]м|narx|цена|%)/u;
const actionOrDocument = /(?:\byoz\b|yozib|kirit|qosh|saqla|tasdiqla\b|qoralama|bekor|чернов|отмен|созда|провед|внес|запиш|№|#\s*\d|\bakt\b|(?:^|[^\p{L}])акт)/u;

/** Faqat umumiy summa. Davriy hisob, hujjat holati va yozuv boshqa vositalarga tegishli. */
export function objectTotalIntent(question: string): Metric | null {
  const text = question.toLowerCase().replace(/[‘’ʻʼ'`]/g, '').replace(/[‐‑–—]/g, '-');
  if (!/(?:jami|summa|qiymat|итого|сумм|стоимост|жами|сумма|қиймат)/u.test(text)) return null;
  if ([period, otherMeasure, actionOrDocument].some(pattern => pattern.test(text))) return null;
  const f2 = /(?:^|[^\p{L}\p{N}])(?:f-?2|ф-?2|forma[ -]?2|форма[ -]?2|кс[ -]?2)(?![\p{L}\p{N}])/u.test(text);
  const fakt = /(?:^|[^\p{L}\p{N}])(?:fakt|факт)(?![\p{L}\p{N}])/u.test(text);
  if (f2 === fakt) return null;
  return f2 ? 'f2' : 'fakt';
}

type TotalAnswer = { javob: string; rad?: true; dalil?: { tur: 'obyekt'; id: number; rpc: typeof sourceRpc; maydon: Metric; yol: string } };
export const objectTotalUnavailable = (text: JarvisText) => ({ javob: text('Jami summani tizimdan olib bo‘lmadi. Keyinroq qayta urinib ko‘ring.', 'Не удалось получить итоговую сумму. Повторите запрос позже.') });
export const objectTotalDenied = (text: JarvisText) => ({ rad: true, javob: text('Bu obyekt summasini ko‘rish uchun ruxsat kerak.', 'Для просмотра суммы по этому объекту нужен доступ.') } as const);

type Amount = { known: number | null; unknown: number; present: boolean };
function amountOf(value: unknown): Amount | null {
  if (typeof value !== 'object' || value === null) return null;
  const { known, unknown, present } = value as Partial<Amount>;
  if (!(known === null || typeof known === 'number' && Number.isFinite(known))) return null;
  if (typeof unknown !== 'number' || !Number.isSafeInteger(unknown) || unknown < 0 || typeof present !== 'boolean') return null;
  return { known, unknown, present };
}

export async function objectTotalAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, metric: Metric): Promise<TotalAnswer> {
  const text = scope.text ?? jarvisText();
  const unavailable = objectTotalUnavailable(text);
  const denied = objectTotalDenied(text);
  const selected = await resolveJarvisObject(rpc, scope);
  if (selected.tur === 'unavailable') return unavailable;
  if (selected.tur === 'denied') return denied;
  if (selected.tur === 'noaniq') return { javob: text('Qaysi obyekt?', 'Какой объект?') + ' ' + selected.variantlar.map(row => row.nom).join(' · ') };
  if (selected.tur === 'yoq') return { javob: text('Summani qaysi obyekt bo‘yicha ko‘ray? Obyekt nomini yozing.', 'По какому объекту показать сумму? Укажите название.') };
  const { id, nom } = selected.obyekt;
  const read = await rpc(sourceRpc, { p_actor_id: scope.actor, p_kompaniya_id: scope.company, p_object_ids: [id] });
  if (!read.ok) return read.status === 403 ? denied : unavailable;
  const data = read.data;
  if (data.ok !== true || data.kompaniya_id !== scope.company || data.basis !== 'direct' || !Array.isArray(data.objects) || data.objects.length !== 1) return unavailable;
  const row = data.objects[0];
  if (!row || row.obyekt_id !== id) return unavailable;
  const amount = amountOf(row[metric]);
  if (!amount) return unavailable;
  const { label, path, empty } = metrics[metric];
  const yol = path + '?obyekt=' + id;
  const sum = amount.known === null ? null : jarvisMoney(amount.known, text('so‘m', 'сум'));
  const value = !amount.present ? text(empty[0], empty[1]) : sum === null ? text('Summa noma’lum.', 'Сумма неизвестна.')
    : amount.unknown > 0 ? text('Ma’lum qismi {sum}.', 'Известная часть — {sum}.', { sum }) : sum + '.';
  const gap = amount.present && amount.unknown > 0 ? text(' {count} qatorning summasi noma’lum.', ' Позиции с неизвестной суммой: {count}.', { count: amount.unknown }) : '';
  return {
    javob: text('**{name}** · {label} · ustamasiz, QQS siz.', '**{name}** · {label} · без накладных расходов и НДС.', { name: nom, label: text(label[0], label[1]) }) +
      ' ' + value + gap + '\n\n' + text('[Manbani ochish]({url})', '[Открыть источник]({url})', { url: yol }),
    dalil: { tur: 'obyekt', id, rpc: sourceRpc, maydon: metric, yol },
  };
}
