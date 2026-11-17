import { katalogSnapshotlari, type KatalogSnapshot } from '../narx-katalog-snapshot';
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

async function load(bucket: PriceBucket, ids: number[]): Promise<Map<number, KatalogSnapshot> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([katalogSnapshotlari(bucket, ids).catch(() => null),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 2300); })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function priceRowAnswer(bucket: PriceBucket | undefined, id: number, text: JarvisText = jarvisText()) {
  const rows = bucket ? await load(bucket, [id]) : null;
  if (!rows) return { javob: text('Narx katalogini tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить каталог цен. Повторите запрос позже.') };
  const row = rows.get(id);
  if (!row) return { javob: text('Joriy narx katalogida bu raqamli qator topilmadi.', 'В текущем каталоге цен запись с этим номером не найдена.') };
  if (!net(row)) return { javob: text('Bu qatorda manbasi va birligi tasdiqlangan QQSsiz narx topilmadi.', 'Для этой записи нет подтверждённой цены без НДС с источником и единицей измерения.') };
  const title = text('Narx manbalari', 'Источники цен');
  const source = [clean(row.manba_nom), clean(row.manba_sana), clean(row.hudud)].filter(Boolean).join(' · ');
  const value = text('{price} so‘m / {unit}, QQSsiz', '{price} сум / {unit}, без НДС', { price: row.narx!.replace('.', ','), unit: clean(row.birlik)! });
  return { javob: `**${clean(row.nom)}** · #${id}\n\n${value}\n${source}\n\n[${title}](${pricePage})`,
    dalil: { tur: 'narx-katalog', id, revision: row.revision, source_id: row.manba_id, yol: pricePage },
    sahifalar: [{ yol: pricePage, nom: title }],
  };
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
  const rows = await load(bucket, [...wanted.keys()]);
  const spec = characteristics(terms.join(' '));
  return [...(rows?.values() ?? [])].flatMap(row => {
    if (wanted.get(row.id) !== row.revision || !net(row)) return [];
    const name = normName(row.nom);
    if (!terms.some(term => name.includes(term)) || gateFailure(spec, characteristics(row.nom), null, row.birlik, name)) return [];
    return [{ id: row.id, nom: clean(row.nom), birlik: clean(row.birlik, 40), narx: row.narx, manba: clean(row.manba_nom), sana: clean(row.manba_sana), hudud: clean(row.hudud, 80) }];
  });
}
