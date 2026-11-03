/**
 * Smeta birligidagi KO'PAYTMA: «100М3», «100 М3 БЕТОНА», «1000М3 ГРУНТА», «100М2», «10 Т» — hajm shu
 * birlikning ulushida yoziladi (2,791 «100М3» = 279,1 m³). Oddiy birlik («Т», «М3 ОСНОВАНИЯ») — ko'paytma yo'q (null).
 * Faqat 10 ning darajalari (10 … 1 000 000) tanib olinadi: «3 КГ», «12 МЕС» kabi sonlar ko'paytma emas.
 * Yagona yordamchi — fakt kiritishdagi «birlik xatosi» ogohlantirishi (lib/fakt-birlik-ogoh) shunga tayanadi.
 */
export type BirlikKopaytma = { kopaytma: number; /** Ko'rsatish uchun: «100 М3» (ko'paytma + birinchi so'z). */ birlik: string };

const KOPAYTMALAR = new Set([10, 100, 1000, 10000, 100000, 1000000]);

export function birlikKopaytma(birlik: string | null | undefined): BirlikKopaytma | null {
  if (birlik == null) return null;
  const s = String(birlik).normalize('NFKC').replace(/[\s  -​]+/g, ' ').trim();
  // «1 000 М3» (mingliklar bo'shliq bilan) ham, «100М3» (yopishgan) ham; keyingi belgi — harf (birlik nomi).
  const m = /^(\d{1,3}(?: \d{3})+|\d+) ?([A-Za-zА-Яа-яЁё][^\s]*)/.exec(s);
  if (!m) return null;
  const son = Number(m[1].replace(/ /g, ''));
  if (!KOPAYTMALAR.has(son)) return null;
  const nom = m[2].replace(/[.,;:]+$/, '');
  return { kopaytma: son, birlik: `${son} ${nom}` };
}
