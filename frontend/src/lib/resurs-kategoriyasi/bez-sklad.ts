/**
 * БЕЗСКЛАД — omborga kirmaydigan, ishga bevosita sarflanadigan resurslar.
 *
 * Bu modul faqat klassifikatsiya kontraktini beradi. U narxni, miqdorni yoki
 * nakrutkani o'zi hisoblamaydi. Yakuniy kategoriya kompaniya registrida
 * saqlanadi; server esa `БЕЗСКЛАД` uchun warehouse qadamini qo'llamaydi.
 */

export const BEZ_SKLAD_KATEGORIYA = 'БЕЗСКЛАД' as const;
export type BezSkladKategoriya = typeof BEZ_SKLAD_KATEGORIYA;

export type BezSkladManba = 'keyword' | 'operator' | 'none';

export type BezSkladNatija = {
  kategoriya: BezSkladKategoriya | null;
  manba: BezSkladManba;
  ishonch: 'high' | 'none';
  sabab: string;
};

/**
 * Faqat qurilishda odatda tayyor holda olib kelinib, obyektda darhol
 * ishlatiladigan aralashmalar. Ro'yxat ataylab tor: barcha "бетон" nomlari
 * avtomatik БЕЗСКЛАД qilinmaydi.
 */
export const BEZ_SKLAD_KEYWORDS = Object.freeze([
  'ТОВАРНЫЙ БЕТОН',
  'БЕТОННАЯ СМЕСЬ',
  'БЕТОННЫЕ СМЕСИ',
  'РАСТВОР',
  'РАСТВОРЫ',
  'АСФАЛЬТОБЕТОН',
  'АСФАЛЬТО-БЕТОН',
  'TOVAR BETON',
  'BETON QORISHMA',
  'BETON QORISHMALARI',
  'ASFALTOBETON',
] as const);

const norm = (value: string): string => String(value || '')
  .toUpperCase()
  .replace(/Ё/g, 'Е')
  .replace(/[–—−]/g, '-')
  .replace(/[^0-9A-ZА-ЯЎҚҒҲЁ\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* These are manufactured/storeable goods, not ready-mix delivery. */
const STORAGE_MATERIAL = /\b(?:БЛОК(?:И|ОВ)?|ЖБИ|ЖЕЛЕЗОБЕТОН(?:НЫЙ|НЫЕ)?|КОНСТРУКЦ(?:ИЯ|ИИ|ИЙ)|ПЛИТ(?:А|Ы)?|КОЛЬЦ(?:О|А)?|БОРДЮР(?:Ы)?|ЛОТК(?:И)?|ТРУБ(?:А|Ы)?|ПЕРЕМЫЧК(?:А|И)|СТОЙК(?:А|КИ))\b/;

/**
 * Operator tanlovi keyworddan ustun turadi. Bu yerda faqat ruxsat etilgan
 * kategoriyalar qabul qilinadi; bo'sh yoki noma'lum tanlov taxmin qilmaydi.
 */
export function bezSkladKategoriyaAniqla(
  nom: string,
  operatorKategoriya?: string | null,
): BezSkladNatija {
  const operator = norm(operatorKategoriya || '');
  if (operator === BEZ_SKLAD_KATEGORIYA) {
    return { kategoriya: BEZ_SKLAD_KATEGORIYA, manba: 'operator', ishonch: 'high', sabab: 'Operator БЕЗСКЛАД sifatida tasdiqladi.' };
  }
  if (operator && operatorKategoriya !== BEZ_SKLAD_KATEGORIYA) {
    return { kategoriya: null, manba: 'operator', ishonch: 'none', sabab: 'Operator boshqa kategoriya tanlagan.' };
  }

  const s = norm(nom);
  if (!s) return { kategoriya: null, manba: 'none', ishonch: 'none', sabab: 'Nom bo\'sh.' };
  if (STORAGE_MATERIAL.test(s)) {
    return { kategoriya: null, manba: 'none', ishonch: 'none', sabab: 'Nom ombor materiali yoki tayyor konstruksiyaga o\'xshaydi.' };
  }
  const hit = BEZ_SKLAD_KEYWORDS.find((keyword) => {
    const k = norm(keyword);
    return s === k || s.includes(k) || (k === 'АСФАЛЬТО-БЕТОН' && s.includes('АСФАЛЬТОБЕТОН'));
  });
  if (!hit && /\bБЕТОН\b/.test(s) && !/\b(?:СУХОЙ|СУХАЯ)\s+СМЕСЬ\b/.test(s)) {
    return { kategoriya: BEZ_SKLAD_KATEGORIYA, manba: 'keyword', ishonch: 'high', sabab: 'Tayyor beton nomi dalilli keywordga mos.' };
  }
  if (hit) {
    return { kategoriya: BEZ_SKLAD_KATEGORIYA, manba: 'keyword', ishonch: 'high', sabab: `Tayyor aralashma keywordi topildi: ${hit}.` };
  }
  return { kategoriya: null, manba: 'none', ishonch: 'none', sabab: 'БЕЗСКЛАД uchun yetarli dalil topilmadi.' };
}

export function isBezSkladNom(nom: string): boolean {
  return bezSkladKategoriyaAniqla(nom).kategoriya === BEZ_SKLAD_KATEGORIYA;
}

/** БЕЗСКЛАД uchun ombor ustamasi yo'q — bu matematik flag emas, kontrakt. */
export const BEZ_SKLAD_CONTRACT = Object.freeze({
  warehouseMarkup: false,
  directCostBucket: 'mat',
  category: BEZ_SKLAD_KATEGORIYA,
} as const);
