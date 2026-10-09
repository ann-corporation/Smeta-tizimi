/**
 * SMETA YADROSI — varaq NOMI bo'yicha rol (bog'liqliksiz; anatomiya va rol.ts shuni ishlatadi). Yagona varaq roli aniqlagichi (egasi 2026-10-09: "oddiy LRV va RES ni farqlay olmayapdi … nomiga qarab topsa bo'ladi,
 * nomi boshqa bo'lsa ichidagi strukturaga qarab; har qanday variantni tushunishi kerak").
 *
 * Qoida: 1) varaq NOMI aniq bo'lsa — nom bo'yicha (lotin/kirill, o'xshash harflar PC→РС, `_ЛРВ`, `RES_A`, `LRV_PLUS`,
 * "Ведомость ресурсов", "Ресурслар", "Локальная смета" …); 2) nom noaniq bo'lsa — ichki tuzilma (smeta anatomiyasi: ish →
 * resurs ierarxiyasi = LRV; guruhlangan resurs ro'yxati = RES; svod/transport/hisobot). Nom va tuzilma zid bo'lsa — nom
 * qoladi, lekin ishonch o'rta va dalilda ziddiyat yoziladi (foydalanuvchi qo'lda o'zgartira oladi).
 */

export type VaraqRol = 'lrv' | 'res' | 'svod' | 'transport' | 'nomalum';
export type VaraqRolXulosa = { rol: VaraqRol; ishonch: 'yuqori' | 'orta' | 'past'; manba: 'nom' | 'tuzilma' | 'nom+tuzilma' | 'yoq'; dalil: string[] };

/** Lotin harflari kirillcha o'xshashiga (PC → РС, PEC → РЕС); faqat token solishtirish uchun. */
const LOTIN_KIRILL: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
const kirillga = (t: string) => [...t].map((ch) => LOTIN_KIRILL[ch] ?? ch).join('');

/** Nom tokenlari: harf ketma-ketliklari (raqam, `_`, `-`, bo'shliq, nuqta — ajratuvchi). */
export function nomTokenlari(nom: string): string[] {
  return (nom.toUpperCase().replace(/Ё/g, 'Е').match(/[A-ZА-ЯЎҚҒҲ]+/g) ?? []);
}

const LRV_TOKEN = new Set(['LRV', 'ЛРВ', 'ЛСР', 'LSR', 'LRVPLUS', 'ЛРВПЛЮС', 'LOKAL', 'ЛОКАЛ', 'ЛОКАЛЬНАЯ', 'ЛОКАЛЬНЫЙ', 'СМЕТА', 'SMETA', 'ЛОЙИХА']);
const RES_TOKEN = new Set(['RES', 'РЕС', 'РС', 'RS', 'RESURS', 'РЕСУРС', 'РЕСУРСЫ', 'РЕСУРСОВ', 'РЕСУРСНАЯ', 'РЕСУРСЛАР', 'RESURSLAR', 'ВЕДОМОСТЬ', 'ВЕДОМОСТ', 'VEDOMOST', 'ПОТРЕБНОСТЬ', 'МАТЕРИАЛЛАР']);
const SVOD_TOKEN = /^(СВОД|SVOD|ССР|ИТОГ|ITOG|ОБЪЕКТН)/;
const TRANSPORT_TOKEN = /^(ТРАНСП|TRANSP|ПЕРЕВОЗ|PEREVOZ|ГРУЗ)/;

/** Faqat nomdan: aniq bo'lsa rol, bo'lmasa null. */
export function varaqNomiRoli(nom: string): { rol: Exclude<VaraqRol, 'nomalum'>; token: string } | null {
  const tok = nomTokenlari(nom);
  const har = tok.flatMap((t) => [t, kirillga(t)]);
  const top = (s: Set<string>) => har.find((t) => s.has(t) || [...s].some((k) => k.length >= 5 && t.startsWith(k)));
  const transport = tok.find((t) => TRANSPORT_TOKEN.test(t) || TRANSPORT_TOKEN.test(kirillga(t)));
  const svod = har.find((t) => SVOD_TOKEN.test(t));
  const lrv = top(LRV_TOKEN);
  const res = top(RES_TOKEN);
  // "Ведомость ресурсов" / "RES" — RES; "LRV" / "ЛРВ" — LRV; ikkalasi bo'lsa (masalan "LRV_RES") — aniq emas.
  if (res && !lrv) return { rol: 'res', token: res };
  if (lrv && !res) {
    // "Сводная смета", "Объектная смета" — svod, lokal LRV emas.
    if (svod && (lrv === 'СМЕТА' || lrv === 'SMETA')) return { rol: 'svod', token: svod };
    return { rol: 'lrv', token: lrv };
  }
  if (!lrv && !res && svod) return { rol: 'svod', token: svod };
  if (!lrv && !res && transport) return { rol: 'transport', token: transport };
  return null;
}

