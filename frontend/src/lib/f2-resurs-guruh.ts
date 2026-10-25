/**
 * F2 hujjati va F2 tayyorlashdagi RESURS VEDOMOSTI uchun yagona yordamchilar (egasi 2026-10-25).
 *  - shifrKorinish: smetadan kelgan «ЦЕНА» belgisi shifr emas ("joriy narxda") - ko'rsatishda bo'sh; asl t2_qator.kod o'zgarmaydi.
 *  - resursGuruhKaliti: bir resurs ikki qator bo'lib chiqmasin: kat + nom kaliti + birlik kaliti (DB t2_resurs_nom_kalit /
 *    t2_resurs_birlik_kalit bilan bir xil semantika - lib/res-narxlash), raqamli kodning bosh nollari hisobga olinmaydi.
 */
import { resBirlikKalit, resNomKalit } from './res-narxlash';

const SHIFR_NARX_BELGISI = /^\s*ЦЕНА\s*$/i;

/** Hujjat/ekranda shifr o'rnida ko'rsatiladigan matn: «ЦЕНА» (manba belgisi) bo'sh chiqadi. */
export function shifrKorinish(kod: string | null | undefined): string {
  const s = (kod ?? '').trim();
  return SHIFR_NARX_BELGISI.test(s) ? '' : s;
}
/** Qator shifri o'rniga «ЦЕНА» yozilganmi (kichik «narx bo'yicha» nishoni uchun). */
export const shifrNarxBelgisimi = (kod: string | null | undefined): boolean => SHIFR_NARX_BELGISI.test((kod ?? '').trim());

/** Kodni solishtirish uchun: raqamli bo'lsa bosh nollar olinadi («002509» = «2499»-dan farqli, lekin «000001» = «1»). */
export function kodSolishtirma(kod: string | null | undefined): string {
  const s = shifrKorinish(kod).toUpperCase();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

/** Vedomost guruhlash kaliti: kat + nom kaliti + birlik kaliti. */
export function resursGuruhKaliti(kat: string | null | undefined, nom: string, birlik: string | null | undefined): string {
  return `${kat ?? ''}|${resNomKalit(nom)}|${resBirlikKalit(birlik)}`;
}

/** Bir guruhga tushgan turli kodlar: «002509 / 2499» (bo'shlari tashlanadi, bir xil solishtirma kod bir marta). */
export function kodlarMatni(kodlar: Iterable<string | null | undefined>): string {
  const korinadi = new Map<string, string>();
  for (const k of kodlar) {
    const s = shifrKorinish(k);
    if (!s) continue;
    const kalit = kodSolishtirma(s);
    const eski = korinadi.get(kalit);
    // Bir xil solishtirma kodlardan to'liqrog'i (nolli) ko'rsatiladi.
    if (eski == null || s.length > eski.length) korinadi.set(kalit, s);
  }
  return [...korinadi.values()].join(' / ');
}
