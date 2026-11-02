/**
 * NAKOPITELNIY GRAFIGI — oyma-oy tasdiqlangan F2 summasi va jamlanma (S-egri chiziq) smeta va faktga nisbatan.
 * Manba: `f2OyKesimi` natijasi (tasdiqlangan F2 tafsiloti). Yangi formula yo'q: oy bo'yicha yig'ish.
 * NULL ≠ 0: oyda summasi noma'lum qator bo'lsa — o'sha oy `nomalum: true`, yig'indi ma'lum qism bilan.
 */
export type OyNuqta = { oy: string; summa: number; jamlanma: number; nomalum: boolean };

export function oylikNuqtalar(kesim: { oylar: string[]; qiymat: Map<number, Map<string, { hajm: number; summa: number | null }>> }): OyNuqta[] {
  const yig = new Map<string, { s: number; nom: boolean }>(kesim.oylar.map((o) => [o, { s: 0, nom: false }]));
  for (const m of kesim.qiymat.values()) for (const [oy, v] of m) {
    const a = yig.get(oy) ?? { s: 0, nom: false };
    if (v.summa == null) a.nom = true; else a.s += v.summa;
    yig.set(oy, a);
  }
  let jam = 0;
  return [...yig.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([oy, a]) => { jam += a.s; return { oy, summa: a.s, jamlanma: jam, nomalum: a.nom }; });
}

/** Chiroyli o'q chegarasi: 1/2/2.5/5 × 10^n. */
export function yumaloqMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}
