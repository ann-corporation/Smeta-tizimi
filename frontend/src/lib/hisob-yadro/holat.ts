/** t2_qator_holat hosilalari. Mavjud paket dekoderidan ko‘chirildi; pul qoidasi o‘zgarmadi.
 * F2 tripleti server snapshotidan: narx × hajm bilan qayta tiklanmaydi.
 * PostgreSQL GREATEST(NULL, 0) = 0; shu aniq moslikdan boshqa NULL qiymatlar saqlanadi.
 */
export type HolatAsos = {
  hajm: number | null; summa: number | null;
  faktH: number | null; faktS: number | null;
  f2H: number | null; f2S: number | null;
  alH: number | null; alS: number | null;
};

export function holatHosilalari(a: HolatAsos) {
  const f2H = a.f2H ?? 0, f2S = a.f2S ?? 0, alS = a.alS ?? 0;
  return {
    smeta_hajm: a.hajm, smeta_summa: a.summa,
    qoldiq_hajm: a.hajm == null || a.alH == null ? null : a.hajm - f2H - a.alH,
    qoldiq_summa: a.summa == null ? null : a.summa - f2S - alS,
    f2_mumkin_hajm: a.faktH == null ? 0 : Math.max(a.faktH - f2H, 0),
    f2_mumkin_summa: a.faktS == null ? 0 : Math.max(a.faktS - f2S, 0),
  };
}
