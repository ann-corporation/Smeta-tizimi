/**
 * Fayl menejeri ko'rinishi: fayl turlari bo'yicha hajm taqsimoti (egasi 2026-10-25: «fayl turi bo'linishi ko'rinsin»).
 * Faqat fayl ro'yxatidan (mime / kengaytma) — server hisobi o'zgarmaydi. Kvota (limit) ma'lumoti tizimda yo'q,
 * shuning uchun «band joy» — umumiy hajm sifatida ko'rsatiladi, foiz o'ylab topilmaydi.
 */
export type FaylTuri = 'excel' | 'pdf' | 'rasm' | 'word' | 'arxiv' | 'boshqa';
export const FAYL_TURI_NOMI: Record<FaylTuri, string> = { excel: 'Excel', pdf: 'PDF', rasm: 'Rasm', word: 'Word', arxiv: 'Arxiv', boshqa: 'Boshqa' };
export const FAYL_TURI_RANG: Record<FaylTuri, string> = {
  excel: 'var(--kat-mat)', pdf: 'var(--danger)', rasm: 'var(--kat-ob)', word: 'var(--kat-chel)', arxiv: 'var(--kat-mash)', boshqa: 'var(--border-strong)',
};

export function faylTuri(f: { mime?: string | null; nom?: string | null }): FaylTuri {
  const m = (f.mime ?? '').toLowerCase();
  const n = (f.nom ?? '').toLowerCase();
  if (/spreadsheet|excel|csv/.test(m) || /\.(xlsx?|xlsm|csv|ods)$/.test(n)) return 'excel';
  if (/pdf/.test(m) || n.endsWith('.pdf')) return 'pdf';
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/.test(n)) return 'rasm';
  if (/word|officedocument\.wordprocessing|msword/.test(m) || /\.(docx?|odt|rtf)$/.test(n)) return 'word';
  if (/zip|rar|7z|tar|gzip/.test(m) || /\.(zip|rar|7z|tar|gz)$/.test(n)) return 'arxiv';
  return 'boshqa';
}

export type TurUlush = { tur: FaylTuri; soni: number; hajm: number; ulush: number };
export function faylTurTaqsimot(fayllar: readonly { mime?: string | null; nom?: string | null; hajm?: number | null }[]): { qismlar: TurUlush[]; jamiHajm: number; soni: number } {
  const acc = new Map<FaylTuri, { soni: number; hajm: number }>();
  for (const f of fayllar) {
    const t = faylTuri(f);
    const a = acc.get(t) ?? { soni: 0, hajm: 0 };
    a.soni++; a.hajm += Math.max(0, f.hajm ?? 0); acc.set(t, a);
  }
  const jamiHajm = [...acc.values()].reduce((s, a) => s + a.hajm, 0);
  const qismlar = [...acc.entries()].map(([tur, a]) => ({ tur, soni: a.soni, hajm: a.hajm, ulush: jamiHajm > 0 ? a.hajm / jamiHajm : 0 }))
    .sort((a, b) => b.hajm - a.hajm || b.soni - a.soni);
  return { qismlar, jamiHajm, soni: fayllar.length };
}
