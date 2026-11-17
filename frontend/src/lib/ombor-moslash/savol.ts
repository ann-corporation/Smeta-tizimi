/**
 * Omborchi SAVOLLARI (o'zbek lotin/kirill va rus): «o'tgan oy sement qancha keldi», «bugungi qoldiq», «Alfa-snabdan nima olganmiz», «за прошлый месяц сколько цемента пришло».
 * Bepul, deterministik (LLM siz). Natija: hisobot (kirim-chiqim jadvali, davr + filtrlar) yoki sanadagi ostatka. Buyruqqa o'xshash gap («sement 10 tonna keldi») savol EMAS.
 */
import { davrMatndan, type Davr } from './davr';
import { nomTokenlari } from './moslash';

export type Savol =
  | { amal: 'hisobot'; davr: Davr | null; nomi: string | null; kontragent: string | null; operatsiya: 'prixod' | 'rasxod' | null }
  | { amal: 'qoldiq'; davr: Davr | null; nomi: string | null };

const L = '(?<![\\p{L}])', R = '(?![\\p{L}])';
const rx = (s: string) => new RegExp(s, 'iu');
const KIRIM = rx(`${L}(keldi|kelgan[\\p{L}]*|kirdi|kirim[\\p{L}]*|olgan[\\p{L}]*|oldik|olindi|tushdi|tushgan[\\p{L}]*|keltirildi|yetkazildi|приш[\\p{L}]*|получ[\\p{L}]*|приход[\\p{L}]*|завез[\\p{L}]*|привез[\\p{L}]*|поступ[\\p{L}]*)${R}`);
const CHIQIM = rx(`${L}(berdik|berilgan[\\p{L}]*|berganmiz|chiqim[\\p{L}]*|chiqdi|chiqarildi|sarflan[\\p{L}]*|ketdi|ishlatil[\\p{L}]*|расход[\\p{L}]*|выдал[\\p{L}]*|выдан[\\p{L}]*|списан[\\p{L}]*|отпущ[\\p{L}]*|ушл[\\p{L}]*)${R}`);
const SURASH = rx(`${L}(qancha|nechta|necha|nima|qaysi|ro['ʻ’\`]?yxat[\\p{L}]*|jadval[\\p{L}]*|hisobot[\\p{L}]*|jurnal[\\p{L}]*|сколько|что|какие|список|таблиц[\\p{L}]*|отч[её]т[\\p{L}]*|журнал[\\p{L}]*|kirim-chiqim|приход-расход)${R}`);
const QOLDIQ = rx(`${L}(qoldiq[\\p{L}]*|ostatka[\\p{L}]*|ostatok[\\p{L}]*|qolgan[\\p{L}]*|остат[\\p{L}]*|осталос[\\p{L}]*)${R}`);
const MIQDOR_BIRLIKLI = rx(`\\d+(?:[.,]\\d+)?\\s*(?:dona|ta|шт|штук|sht|kg|кг|tonna|тонн|тн|tn|metr|метр|м2|м3|м|m2|m3|m|litr|л|rulon|рулон|qop|мешок|komplekt|комплект|t)${R}`);
const TOXTASH = new Set(['va', 'и', 'ni', 'ning', 'bu', 'shu', 'bor', 'bormi', 'ombor', 'omborda', 'omborga', 'omborni', 'склад', 'склада', 'на', 'в', 'из', 'по', 'за', 'для', 'bo\'yicha', 'boyicha', 'uchun', 'dan', 'ga', 'hammasi', 'barcha', 'umumiy', 'jami',
  'iltimos', 'pozhaluysta', 'пожалуйста', 'menga', 'ayt', 'ayting', 'ko\'rsat', 'korsat', 'ko\'rsating', 'покажи', 'скажи', 'мне', 'нам', 'мы', 'bizga', 'biz', 'qancha', 'nechta', 'necha', 'nima', 'qaysi', 'сколько', 'что', 'какие', 'и', 'о', 'об']);

/** Gap-savolni tahlil qiladi; savol bo'lmasa null (oddiy buyruq tahlili davom etadi). */
export function savolTahlil(matn: string, bugun: string): Savol | null {
  const t = String(matn ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!t) return null;
  const kirim = KIRIM.test(t), chiqim = CHIQIM.test(t), surash = SURASH.test(t), qoldiq = QOLDIQ.test(t);
  const d = davrMatndan(t, bugun);
  const miqdorli = MIQDOR_BIRLIKLI.test(t);
  // buyruq shakli: miqdor+birlik bor va savol so'zi yo'q («sement 10 tonna keldi», «bugun mix 20 kg Aliga berdim»)
  if (miqdorli && !surash) return null;
  const yonalish: 'prixod' | 'rasxod' | null = kirim && !chiqim ? 'prixod' : chiqim && !kirim ? 'rasxod' : null;
  const hisobotmi = (kirim || chiqim) && (surash || !!d) || (!!d && surash && !qoldiq) || (surash && /(hisobot|jadval|ro['ʻ’`]?yxat|jurnal|отч[её]т|таблиц|журнал|kirim-chiqim)/iu.test(t));
  if (!hisobotmi && !qoldiq) return null;
  if (!hisobotmi && qoldiq) {
    // «bugungi qoldiq», «kechagi ostatka», «sement qoldig'i 2026-11-01 da»
    const nomi = nomAjrat(d ? d.qolgan : t, []);
    return { amal: 'qoldiq', davr: d?.davr ?? null, nomi };
  }
  let qolgan = d ? d.qolgan : t;
  // kontragent: «<X>dan nima olganmiz», «от X», «поставщик X», «yetkazuvchi X»
  let kontragent: string | null = null;
  const km = rx(`(?:${L}(?:postavshik|yetkazuvchi|поставщик[\\p{L}]*|от|у)\\s+)([\\p{L}0-9"«»'’ʻ\\-]+(?:\\s+[\\p{L}0-9"«»'’ʻ\\-]+)?)(?=\\s+(?:nima|qancha|что|сколько|olgan|keldi|получил)|[,;]|$)`).exec(qolgan)
    ?? rx(`${L}([\\p{L}0-9'’ʻ\\-]{3,}?)(?:dan|дан)\\s+(?=(?:\\p{L}+\\s+){0,2}(?:olgan|oldik|keldi|kirdi|olindi|nima|qancha|тушган))`).exec(qolgan);
  if (km) { kontragent = km[1].trim(); qolgan = qolgan.replace(km[0], ' '); }
  const nomi = nomAjrat(qolgan, []);
  return { amal: 'hisobot', davr: d?.davr ?? null, nomi, kontragent, operatsiya: yonalish };
}

function nomAjrat(s: string, qo_shimcha: string[]): string | null {
  const soz = s.replace(KIRIM, ' ').replace(CHIQIM, ' ').replace(SURASH, ' ').replace(QOLDIQ, ' ').replace(/\d{4}-\d{2}-\d{2}/g, ' ')
    .split(/[\s,;:!?«»"]+/).filter((w) => w && !TOXTASH.has(w.toLowerCase()) && !qo_shimcha.includes(w) && !/^(dan|ga|ni|da|и)$/iu.test(w));
  const nomi = soz.join(' ').replace(/(?<![\p{L}])(?:ning|ni|dan|da|ga)$/iu, '').trim();
  return nomi && nomTokenlari(nomi).length ? nomi.slice(0, 200) : null;
}
