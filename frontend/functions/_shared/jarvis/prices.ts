import { findKatalogSnapshots, katalogSnapshotlari, type KatalogSnapshot } from '../narx-katalog-snapshot';
import { codeSearchKey, nameSearchKeys } from '../../../src/lib/narx-katalog/catalog-search';
import { characteristics, gateFailure, normName } from '../../../src/lib/smeta-studio/resource-match';
import { qidiruvSozlari } from '../../../src/lib/jarvis/qidiruv-sozlari';
import { jarvisText, type JarvisText } from './reply-language';

type PriceBucket = Parameters<typeof katalogSnapshotlari>[0];
const pricePage = '/admin/narx-manbalari';
const priceId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const clean = (v: unknown, max = 160) => typeof v === 'string' ? v.replace(/[\r\n<>\[\]*_\x60]/g, ' ').trim().slice(0, max) || null : null;
const net = (row: KatalogSnapshot) => row.nds_holati === 'nds_siz' && row.narx !== null && /^\d{1,15}(?:\.\d{1,8})?$/.test(row.narx)
  && clean(row.birlik) !== null && clean(row.manba_nom) !== null && clean(row.nom) !== null;

export function priceRowIntent(question: string): number | null {
  if (!/katalog|каталог/u.test(question.toLowerCase()) || !/narx|нарх|цен[ауые]/iu.test(question) ||
      /qo[ʻ'’]?ll[ae]|o[ʻ'’]?zgartir|saqla|қўлла|ўзгартир|примен|замени|установи|сохрани/iu.test(question)) return null;
  const ids = [...question.matchAll(/(?:#|№)\s*([1-9]\d{0,14})(?![\p{L}\d.-])/gu)];
  return ids.length === 1 ? Number(ids[0][1]) : null;
}

async function withinPriceDeadline<T>(work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work.catch(() => null),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 2300); })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function priceRowAnswer(bucket: PriceBucket | undefined, id: number, text: JarvisText = jarvisText()) {
  const rows = bucket ? await withinPriceDeadline(katalogSnapshotlari(bucket, [id])) : null;
  if (!rows) return { javob: text('Narx katalogini tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить каталог цен. Повторите запрос позже.') };
  const row = rows.get(id);
  if (!row) return { javob: text('Joriy narx katalogida bu raqamli qator topilmadi.', 'В текущем каталоге цен запись с этим номером не найдена.') };
  if (!net(row)) return { javob: text('Bu qatorda manbasi va birligi tasdiqlangan QQSsiz narx topilmadi.', 'Для этой записи нет подтверждённой цены без НДС с источником и единицей измерения.') };
  const title = text('Narx manbalari', 'Источники цен');
  return { javob: `${priceLine(row, text)}\n\n[${title}](${pricePage})`,
    dalil: { tur: 'narx-katalog', id, revision: row.revision, source_id: row.manba_id, yol: pricePage },
    sahifalar: [{ yol: pricePage, nom: title }],
  };
}

function priceLine(row: KatalogSnapshot, text: JarvisText): string {
  const source = [clean(row.manba_nom), clean(row.manba_sana), clean(row.hudud)].filter(Boolean).join(' · ');
  const value = text('{price} so‘m / {unit}, QQSsiz', '{price} сум / {unit}, без НДС', { price: row.narx!.replace('.', ','), unit: clean(row.birlik)! });
  return `**${clean(row.nom)}** · #${row.id}\n${value}\n${source}`;
}

export function priceSearchIntent(question: string) {
  if (!/katalog|каталог/iu.test(question) || !/narx|нарх|цен[ауые]/iu.test(question) ||
      /qo[ʻ'’]?ll[ae]|o[ʻ'’]?zgartir|saqla|қўлла|ўзгартир|примен|замени|установи|сохрани/iu.test(question)) return null;
  const code = /(?:shifr|шифр|kod|код)\s*[:#№]?\s*([\p{L}\d]+(?:[-‐‑–—.][\p{L}\d]+)*)(?![\p{L}\d.-])/iu.exec(question)?.[1];
  if (code && /\d/u.test(code) && code.length <= 80) return { keys: [codeSearchKey(code)], spec: null };
  const quoted = /[«"“]([^«»"“”\r\n]{2,180})[»"”]/u.exec(question)?.[1];
  const query = quoted
    ? /[а-яё]/iu.test(quoted) ? quoted : qidiruvSozlari(quoted).resurs.join(' ')
    : qidiruvSozlari(question.replace(/(?:^|[^\p{L}])(?:katalog\p{L}*|каталог\p{L}*|нархи|қанча|билан)(?!\p{L})/giu, ' ')).resurs.join(' ');
  const keys = nameSearchKeys(query);
  return keys.length ? { keys, spec: characteristics(query) } : null;
}

export async function priceSearchAnswer(bucket: PriceBucket | undefined, query: NonNullable<ReturnType<typeof priceSearchIntent>>, text: JarvisText) {
  const result = bucket ? await withinPriceDeadline(findKatalogSnapshots(bucket, query.keys)) : null;
  if (!result) return null;
  const rows = result.rows.filter(row => net(row) && (query.spec
    ? nameSearchKeys(row.nom).includes(result.key!) && !gateFailure(query.spec, characteristics(row.nom), null, row.birlik, normName(row.nom))
    : row.kod !== null && codeSearchKey(row.kod) === result.key));
  const title = text('Narx manbalari', 'Источники цен');
  const lines = rows.slice(0, 6).map(row => priceLine(row, text));
  if (!lines.length) lines.push(result.more
    ? text('Tekshirilgan katalog qatorlarida mos narx topilmadi.', 'В проверенных позициях каталога подходящая цена не найдена.')
    : text('Katalogda shu nom yoki shifrga mos QQSsiz narx topilmadi.', 'В каталоге не найдена цена без НДС по этому названию или коду.'));
  if (result.more || rows.length > 6) lines.push(text('To‘liq ro‘yxatni katalogdan ko‘ring.', 'Посмотрите полный список в каталоге.'));
  return { javob: lines.join('\n\n') + `\n\n[${title}](${pricePage})`,
    dalil: { tur: 'narx-katalog', rows: rows.slice(0, 6).map(row => ({ id: row.id, revision: row.revision, source_id: row.manba_id })), yol: pricePage },
    sahifalar: [{ yol: pricePage, nom: title }] };
}

/** Browser input is a candidate identity only. Every displayed field comes from the same published release. */
export async function verifiedPriceCandidates(bucket: PriceBucket | undefined, question: string, candidates: unknown) {
  if (!bucket || !Array.isArray(candidates)) return [];
  const wanted = new Map<number, string>();
  for (const candidate of candidates.slice(0, 6)) {
    if (priceId(candidate?.id) && typeof candidate.revision === 'string' && /^[a-f0-9]{16}$/.test(candidate.revision)) wanted.set(candidate.id, candidate.revision);
  }
  const terms = qidiruvSozlari(question).resurs.map(normName).filter(Boolean);
  if (!wanted.size || !terms.length) return [];
  const rows = await withinPriceDeadline(katalogSnapshotlari(bucket, [...wanted.keys()]));
  const spec = characteristics(terms.join(' '));
  return [...(rows?.values() ?? [])].flatMap(row => {
    if (wanted.get(row.id) !== row.revision || !net(row)) return [];
    const name = normName(row.nom);
    if (!terms.some(term => name.includes(term)) || gateFailure(spec, characteristics(row.nom), null, row.birlik, name)) return [];
    return [{ id: row.id, nom: clean(row.nom), birlik: clean(row.birlik, 40), narx: row.narx, manba: clean(row.manba_nom), sana: clean(row.manba_sana), hudud: clean(row.hudud, 80) }];
  });
}
