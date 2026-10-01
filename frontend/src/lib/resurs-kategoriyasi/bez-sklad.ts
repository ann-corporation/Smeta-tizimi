/**
 * БЕЗСКЛАД — omborga kirmaydigan, ishga bevosita sarflanadigan resurslar.
 *
 * EGASI QOIDASI (2026-10-01): nomida БЕТОН yoki РАСТВОР bo'lsa VA birligi м³ bo'lsa —
 * БЕЗСКЛАД. Asfaltobeton — т yoki м³. Birlik hal qiluvchi: erituvchi (кг/л), quruq
 * aralashma (кг), bloklar (шт), plitalar (м²), armatura (т) o'z-o'zidan chiqadi.
 * м³ ichida ham omborda saqlanadigan narsalar (gazobeton bloklari, qum) — istisno.
 *
 * Bu qoidaning SQL egizagi `public.t2_bez_sklad_qoida(nom, birlik)` — bazadagi trigger
 * har qanday import yo'lida qatorni avtomatik БЕЗСКЛАД qiladi (bu modul faqat oldindan
 * ko'rsatish uchun). Paritet testi: bez-sklad.sql-egizak.test.ts.
 */

export const BEZ_SKLAD_KATEGORIYA = 'БЕЗСКЛАД' as const;
export type BezSkladKategoriya = typeof BEZ_SKLAD_KATEGORIYA;

export type BezSkladManba = 'qoida' | 'operator' | 'none';

export type BezSkladNatija = {
  kategoriya: BezSkladKategoriya | null;
  manba: BezSkladManba;
  ishonch: 'high' | 'none';
  sabab: string;
};

const norm = (value: string): string => String(value || '')
  .toUpperCase()
  .replace(/Ё/g, 'Е')
  .replace(/[–—−]/g, '-')
  .replace(/[^0-9A-ZА-ЯЎҚҒҲЁ\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Birlik: katta harf, lotin M/T → kirill, ³→3, bo'shliq/nuqta olib tashlanadi ("100 м3" → "100М3"). */
const birlikNorm = (value: string | null | undefined): string => String(value || '')
  .toUpperCase()
  .replace(/³/g, '3')
  .replace(/M/g, 'М')
  .replace(/T/g, 'Т')
  .replace(/[\s.]/g, '');
const KUB_METR = /^\d*(?:М3|КУБМ|МКУБ)$/;
const TONNA = /^\d*(?:Т|ТН|ТОННА|ТОНН)$/;

/* JS `\b` kirillda ishlamaydi — so'z chegarasi qo'lda (SQL egizagi bilan bir xil). */
const H = '0-9A-ZА-ЯЎҚҒҲЁ';
const soz = (ichi: string) => new RegExp(`(?<![${H}])(?:${ichi})(?![${H}])`);

const BETON = /БЕТОН/;
const RASTVOR = soz('РАСТВОР(?:Ы)?');
const ASFALT = /АСФАЛЬТО-?БЕТОН/;
/** м³ da bo'lsa ham omborda saqlanadigan yoki tayyor buyumlar. */
const ISTISNO = soz('БЛОК[А-Я]*|ГАЗОБЕТОН[А-Я]*|ПЕНОБЕТОН[А-Я]*|ЖЕЛЕЗОБЕТОН[А-Я]*|КОНСТРУКЦ[А-Я]*|ПЕСОК|СУХ[А-Я]*|ИЗДЕЛИ[А-Я]*|КИРПИЧ[А-Я]*');

/**
 * Operator tanlovi qoidadan ustun. Birlik berilmasa qoida hal qilmaydi (taxmin yo'q).
 */
export function bezSkladKategoriyaAniqla(
  nom: string,
  operatorKategoriya?: string | null,
  birlik?: string | null,
): BezSkladNatija {
  const operator = norm(operatorKategoriya || '');
  if (operator === BEZ_SKLAD_KATEGORIYA) {
    return { kategoriya: BEZ_SKLAD_KATEGORIYA, manba: 'operator', ishonch: 'high', sabab: 'Operator БЕЗСКЛАД sifatida tasdiqladi.' };
  }
  if (operator) {
    return { kategoriya: null, manba: 'operator', ishonch: 'none', sabab: 'Operator boshqa kategoriya tanlagan.' };
  }

  const s = norm(nom);
  const b = birlikNorm(birlik);
  if (!s) return { kategoriya: null, manba: 'none', ishonch: 'none', sabab: 'Nom bo\'sh.' };
  if (ISTISNO.test(s)) {
    return { kategoriya: null, manba: 'none', ishonch: 'none', sabab: 'Omborda saqlanadigan material yoki tayyor buyum.' };
  }
  if (ASFALT.test(s) && (KUB_METR.test(b) || TONNA.test(b))) {
    return { kategoriya: BEZ_SKLAD_KATEGORIYA, manba: 'qoida', ishonch: 'high', sabab: 'Asfaltobeton (т/м³) — tayyor aralashma.' };
  }
  if ((BETON.test(s) || RASTVOR.test(s)) && KUB_METR.test(b)) {
    return { kategoriya: BEZ_SKLAD_KATEGORIYA, manba: 'qoida', ishonch: 'high', sabab: 'Beton/rastvor, birligi м³ — tayyor aralashma.' };
  }
  return { kategoriya: null, manba: 'none', ishonch: 'none', sabab: 'Qoidaga tushmadi (beton/rastvor + м³).' };
}

export function isBezSkladNom(nom: string, birlik?: string | null): boolean {
  return bezSkladKategoriyaAniqla(nom, null, birlik).kategoriya === BEZ_SKLAD_KATEGORIYA;
}

/** БЕЗСКЛАД uchun ombor ustamasi yo'q — bu matematik flag emas, kontrakt. */
export const BEZ_SKLAD_CONTRACT = Object.freeze({
  warehouseMarkup: false,
  directCostBucket: 'mat',
  category: BEZ_SKLAD_KATEGORIYA,
} as const);
