import type { TaqdimQisqa } from '../../api/t2-tomon';

/** Bajarilish foizi: faqat ikkala qiymat ma'lum va shartnoma > 0 bo'lsa; aks holda null (0 emas). */
export function bajarilishFoizi(f2Jami: number | null | undefined, shartnomaBezNds: number | null | undefined): number | null {
  if (f2Jami == null || shartnomaBezNds == null || !Number.isFinite(f2Jami) || !Number.isFinite(shartnomaBezNds) || shartnomaBezNds <= 0) return null;
  return Math.round((f2Jami / shartnomaBezNds) * 1000) / 10;
}

/** Yuborilgan hujjatlar yig'indisi holat bo'yicha (summasi yo'q hujjat yig'indiga kirmaydi, soni alohida). */
export function holatYigindisi(royxat: readonly TaqdimQisqa[]) {
  const m: Record<string, { soni: number; summa: number; summasiz: number }> = {};
  for (const x of royxat) {
    const g = (m[x.holat] ??= { soni: 0, summa: 0, summasiz: 0 });
    g.soni += 1;
    if (x.summa == null) g.summasiz += 1; else g.summa += Number(x.summa);
  }
  return m;
}
