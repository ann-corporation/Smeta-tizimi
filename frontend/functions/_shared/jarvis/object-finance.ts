import { jarvisMoney } from '../../../src/lib/jarvis/answers';
import { obyektTanla, type PulObyekt } from '../agent-pul-javob';
import type { RpcNatija, Yuk } from '../agent-rpc';

const metrics = {
  f2: { label: 'Tasdiqlangan F2 jami', path: '/admin/f2-tarix', empty: 'Tasdiqlangan F2 topilmadi.' },
  fakt: { label: 'Fakt jami', path: '/admin/fakt', empty: 'Fakt yozuvi topilmadi.' },
} as const;

type Metric = keyof typeof metrics;
type Rpc = (name: string, body: Yuk) => Promise<RpcNatija>;
type Scope = { actor: number; company: number; question: string; history: unknown; objectId: number | null };
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
const unavailable = { javob: 'Jami summani tizimdan olib bo‘lmadi. Keyinroq qayta urinib ko‘ring.' };
const denied = { rad: true, javob: 'Bu obyekt summasini ko‘rish uchun ruxsat kerak.' } as const;

type Amount = { known: number | null; unknown: number; present: boolean };
function amountOf(value: unknown): Amount | null {
  if (typeof value !== 'object' || value === null) return null;
  const { known, unknown, present } = value as Partial<Amount>;
  if (!(known === null || typeof known === 'number' && Number.isFinite(known))) return null;
  if (typeof unknown !== 'number' || !Number.isSafeInteger(unknown) || unknown < 0 || typeof present !== 'boolean') return null;
  return { known, unknown, present };
}

export async function objectTotalAnswer(rpc: Rpc, scope: Scope, metric: Metric): Promise<TotalAnswer> {
  const list = await rpc('t2_agent_fakt_v1', {
    p_actor_id: scope.actor, p_kompaniya_id: scope.company, p_kategoriyalar: ['obyektlar'], p_obyekt_id: null,
  });
  if (!list.ok) return list.status === 403 ? denied : unavailable;
  const rows = (list.data.fakt as { obyektlar?: unknown } | undefined)?.obyektlar;
  if (!Array.isArray(rows)) return unavailable;
  const objects: PulObyekt[] = rows.flatMap((row: Partial<PulObyekt> | null) =>
    row && typeof row.id === 'number' && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.nom === 'string'
      ? [{ id: row.id, nom: row.nom }] : []);
  const selected = obyektTanla(scope.question, scope.history, objects, scope.objectId);
  if (selected.tur === 'noaniq') return { javob: 'Qaysi obyekt? ' + selected.variantlar.map(row => row.nom).join(' · ') };
  if (selected.tur === 'yoq') return { javob: 'Summani qaysi obyekt bo‘yicha ko‘ray? Obyekt nomini yozing.' };
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
  const value = !amount.present ? empty : amount.known === null ? 'Summa noma’lum.'
    : amount.unknown > 0 ? `Ma’lum qismi ${jarvisMoney(amount.known)}.`
    : jarvisMoney(amount.known) + '.';
  const gap = amount.present && amount.unknown > 0 ? ` ${amount.unknown} qatorning summasi noma’lum.` : '';
  return {
    javob: `**${nom}** · ${label} · ustamasiz, QQS siz. ${value}${gap}\n\n[Manbani ochish](${yol})`,
    dalil: { tur: 'obyekt', id, rpc: sourceRpc, maydon: metric, yol },
  };
}
