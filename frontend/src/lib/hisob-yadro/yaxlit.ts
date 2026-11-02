/**
 * YAGONA pul yaxlitlash — Excel ROUND(x;2): yarmi noldan uzoqqa, ishoraga simmetrik,
 * ikkilik kasr xatosiga chidamli (15 muhim raqamgacha tozalanadi: 1,005 → 1,01; −2,675 → −2,68).
 * Tizimdagi boshqa round-2 yordamchilari shu funksiyaga yo'naltirilgan.
 */
export function yaxlit2(x: number): number {
  if (!Number.isFinite(x)) return x;
  const a = Number((Math.abs(x) * 100).toPrecision(15));
  const r = Math.round(a) / 100;
  if (r === 0) return 0; // −0 bo'lmasin
  return x < 0 ? -r : r;
}

/** null-saqlovchi variant: noma'lum (null/undefined/NaN) — null, 0 emas. */
export function yaxlit2N(x: number | null | undefined): number | null {
  return x == null || !Number.isFinite(x) ? null : yaxlit2(x);
}

/** Qator summasi = ROUND(hajm × narx, 2). Hajm yoki narx noma'lum — null. */
export function qatorSumma(hajm: number | null | undefined, narx: number | null | undefined): number | null {
  if (hajm == null || narx == null || !Number.isFinite(hajm) || !Number.isFinite(narx)) return null;
  return yaxlit2(hajm * narx);
}

/** Yig'indi (ROUND 2). null qiymatlar o'tkazib yuboriladi (summa doim ko'rinadi qoidasi). */
export function yigindi2(xs: Iterable<number | null | undefined>): number {
  let t = 0;
  for (const x of xs) if (x != null && Number.isFinite(x)) t += x;
  return yaxlit2(t);
}

/** Qat'iy yig'indi: birorta noma'lum bo'lsa — null (NULL ≠ 0). Bo'sh ro'yxat — 0. */
export function yigindi2Qatiy(xs: Iterable<number | null | undefined>): number | null {
  let t = 0;
  for (const x of xs) { if (x == null || !Number.isFinite(x)) return null; t += x; }
  return yaxlit2(t);
}

/** Ayirma (ROUND 2), ikkalasi ma'lum bo'lsagina. */
export function ayirma2(a: number | null | undefined, b: number | null | undefined): number | null {
  return a == null || b == null ? null : yaxlit2(a - b);
}
