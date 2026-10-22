/**
 * Manba nomi — foydalanuvchiga ko'rinadigan shakl (egasi 2026-10-22: «smeta studioda manbalarda ABC, TNQ, Construct kabi
 * boshqa nomlar bo'lmaydi — bu shaxsiy baza, faqat o'zimizning nomimiz: masalan "Smeta tizimi · ШНҚ … asosida" yoki
 * "Smeta tizimi katalogi 2026"»).
 *
 * Ma'lumot (R2 katalog, dalil, versiya xeshlari) o'zgarmaydi — faqat EKRANGA, eksportga va AI matniga chiqishdan oldin
 * shu yerdan o'tadi. Tashqi dastur nomi bo'lmagan matn (masalan foydalanuvchining o'z КП fayli nomi) tegilmaydi.
 */

export const BREND = 'Smeta tizimi';
export const BREND_KATALOG_YILI = '2026';

/** Tashqi dastur / manba nomlari (lotin va kirill yozuvlari). «ТН» (tonna birligi) ataylab kirmaydi. */
// `\b` kirill harflarida ishlamaydi — Unicode harf/raqam chegarasi ishlatiladi.
const TASHQI = /(?<![\p{L}\p{N}])(?:(?:ABC|АВС|АБС)(?:\s*(?:Base|База))?(?:\s*\d+)?|TNQ|ТНҚ|ТНК|TN|Construct|NormRepository|PTO[-\s]?UZ|ПТО[-\s]?УЗ|Fo2\s*Studio|pomoshnik\s*PTO|00-(?:ppr|amen))(?![\p{L}\p{N}])/giu;
const SHNQ = /(?:ШНҚ|ШНК|ShNQ|SHNQ|КМК|KMK)\s*([0-9]+(?:\.[0-9]+)+(?:-[0-9]+)?)/i;
const YIL = /\b(20\d{2})\b/;

/** Matnda tashqi dastur nomi bormi. */
export function tashqiNomBormi(matn: string | null | undefined): boolean {
  TASHQI.lastIndex = 0;
  return !!matn && TASHQI.test(matn);
}

/**
 * Bitta manba nomi (katalog, normativ yozuv, nashr) → ko'rinadigan nom.
 * ШНҚ raqami bo'lsa — «Smeta tizimi · ШНҚ 4.02.15-04 asosida»; aks holda tashqi nom → «Smeta tizimi katalogi 2026»
 * (matndagi yil bo'lsa o'sha yil). Bo'sh → «Smeta tizimi katalogi». Tashqi nomsiz matn o'zgarmaydi.
 */
export function manbaKorinishi(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return `${BREND} katalogi`;
  const shnq = SHNQ.exec(s);
  if (!tashqiNomBormi(s)) return s;
  if (shnq) return `${BREND} · ШНҚ ${shnq[1]} asosida`;
  return `${BREND} katalogi ${YIL.exec(s)?.[1] ?? BREND_KATALOG_YILI}`;
}

/** Uzun matn (dalil, izoh, AI javobi) ichidagi tashqi nomlarni o'z brendimizga almashtiradi; qolgani saqlanadi. */
export function tashqiNomlarniAlmashtir(matn: string | null | undefined): string {
  if (!matn) return '';
  TASHQI.lastIndex = 0;
  return matn.replace(TASHQI, BREND).replace(new RegExp(`(?:${BREND}[\\s/,·-]*){2,}`, 'g'), `${BREND} `).replace(/\s{2,}/g, ' ').trim();
}
