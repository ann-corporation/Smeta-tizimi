/**
 * Tizim tajribasi va uch darajali xotira (egasi 2026-10-16: "tizim foydalanuvchilarning ishidan o'rganib borsin — qancha ko'p
 * ishlatilsa, hamma foydalanuvchilardan shuncha ko'p smetachi kuchini olsin"; "AI xotirasi kompaniya, foydalanuvchi va butun
 * tizim darajasida bo'lsin").
 *
 * Tajriba = barcha kompaniyalarning smetalarida (ish qatorlari) va Studio tanlovlarida norma necha marta, qaysi koeffitsient bilan
 * qo'llangani (faqat kod, son va koeffitsient matni — narx, kompaniya, obyekt nomi chiqmaydi; baza: t2_norma_tajriba_v1).
 */
export type NormaTajriba = { smeta_soni: number; obyekt_soni: number; kompaniya_soni: number; studio_soni: number; koeflar: Array<{ koef: string; soni: number }> };
export type XotiraDarajalari = { tizim: Array<{ kalit: string; mazmun: string }>; kompaniya: Array<{ kalit: string; mazmun: string }>; foydalanuvchi: Array<{ kalit: string; mazmun: string }> };

/** Same key as SQL t2_norma_kalit: Cyrillic/Latin letters unified, the base code only, Е310/Е311 = С310/С311. */
export function normaKalit(kod: string | null | undefined): string | null {
  const t = (kod ?? '').toUpperCase().replace(/[ЕСАОРХКТМН]/g, ch => 'ECAOPXKTMH'['ЕСАОРХКТМН'.indexOf(ch)]);
  const b = /^[A-Z]+[0-9]+(?:-[0-9]+)+/.exec(t)?.[0] ?? null;
  return b && /^E31[01]-/.test(b) ? 'C' + b.slice(1) : b;
}

/** One line for the model and the UI: how often estimators used the norm and with which coefficient. */
export function tajribaMatni(t: NormaTajriba | null | undefined): string | null {
  if (!t || (!t.smeta_soni && !t.studio_soni)) return null;
  const qism = [`${t.smeta_soni + t.studio_soni} marta qo'llangan (${t.obyekt_soni} obyekt, ${t.kompaniya_soni} kompaniya)`];
  const k = t.koeflar.filter(x => x.soni >= 2).slice(0, 2).map(x => `${x.koef} (${x.soni})`);
  if (k.length) qism.push(`odatiy koeffitsient: ${k.join(', ')}`);
  return qism.join('; ');
}

/** The three memory levels as prompt blocks; the user's own rules win over the company's, the company's over the system's. */
export function xotiraBloklari(x: XotiraDarajalari): string {
  const blok = (teg: string, l: Array<{ mazmun: string }>) => {
    const qatorlar = l.filter(y => y.mazmun.trim() && y.mazmun !== '-').slice(0, 40).map(y => `- ${y.mazmun.slice(0, 400)}`);
    return qatorlar.length ? `\n\n<${teg}>\n${qatorlar.join('\n')}\n</${teg}>` : '';
  };
  return blok('TIZIM XOTIRASI', x.tizim) + blok('KOMPANIYA XOTIRASI', x.kompaniya) + blok('FOYDALANUVCHI XOTIRASI', x.foydalanuvchi);
}
