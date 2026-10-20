/**
 * Shartnoma ↔ smeta summasi aloqasi (egasi 2026-10-20: «smeta summasi va shartnoma o'rtasidagi aloqani ta'minla va
 * to'liq tahrir imkoniyati bo'lsin»). Smeta summasi — bog'langan obyektlarning nakrutkasiz to'g'ri xarajatlari
 * (t2_obyekt_jami.jami). Shartnoma summasi — egasi kiritadigan hujjat qiymati; tizim uni hech qachon o'zi o'zgartirmaydi,
 * faqat farqni ko'rsatadi va bir bosishda to'ldirishni taklif qiladi. NULL ≠ 0.
 */
export type ObyektSmeta = { id: number; nom: string; jami: number | null };
export type SmetaAloqa = {
  qatorlar: Array<ObyektSmeta & { bor: boolean }>;
  /** Ma'lum smeta summalari yig'indisi; birorta ham ma'lum bo'lmasa — null. */
  smeta: number | null;
  /** Smetasi yo'q (yoki summasi noma'lum) obyektlar soni. */
  nomalum: number;
};

export function smetaAloqa(obyektIdlar: readonly number[], obyektlar: ReadonlyMap<number, ObyektSmeta>): SmetaAloqa {
  const qatorlar = [...new Set(obyektIdlar)].map((id) => {
    const o = obyektlar.get(id);
    const jami = o?.jami != null && Number.isFinite(Number(o.jami)) ? Number(o.jami) : null;
    return { id, nom: o?.nom ?? `#${id}`, jami, bor: jami != null };
  });
  const bor = qatorlar.filter((q) => q.bor);
  return { qatorlar, smeta: bor.length ? Math.round(bor.reduce((a, q) => a + (q.jami as number), 0) * 100) / 100 : null, nomalum: qatorlar.length - bor.length };
}

/** Shartnoma summasi (QQSsiz) − smeta summasi; biri noma'lum bo'lsa — null. */
export function farq(shartnoma: number | null, smeta: number | null): number | null {
  return shartnoma == null || smeta == null ? null : Math.round((shartnoma - smeta) * 100) / 100;
}

export const QQS_STAVKA = 0.12;
export const yaxlit2 = (x: number) => Math.round(x * 100) / 100;
