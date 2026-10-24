/**
 * F2 ish ichidagi GURUH sarlavhasi («ДЕТАЛЬ -1», «МЕТИЗЫ ДЛЯ КРЕПЛЕНИЯ») — smetadagi shu nomli razdel (rz) ga ulanadi
 * (egasi 2026-10-24, Stella). Qidiruv: smeta ishining razdelidan yuqoriga, eng yaqin ota-razdeldagi (chuqurligi 2 gacha)
 * bir xil nomli rz lar orasidan tartib bo'yicha eng yaqini; `olingan` — boshqa guruhga berilgan rz lar (takror nomli razdellar uchun).
 * Struktura-mustaqil: ham SmetaQator indeksi (ishJoyi), ham STugun daraxti (engine) bilan ishlaydi.
 */
export function guruhRzTanla<T extends { id: number; tur?: string | null; nom?: string | null; tartib?: number | null }>(
  ish: T,
  otaOl: (x: T) => T | null,
  bolalarOl: (x: T) => readonly T[],
  guruhNom: string,
  kalit: (s: unknown) => string,
  olingan: ReadonlySet<number> = new Set(),
): T | null {
  const nomK = kalit(guruhNom);
  if (!nomK) return null;
  const yig = (a: T, chuqurlik: number, out: T[]) => {
    for (const c of bolalarOl(a)) {
      if (c.tur !== 'rz') continue;
      if (kalit(c.nom ?? '') === nomK) out.push(c);
      if (chuqurlik > 0) yig(c, chuqurlik - 1, out);
    }
  };
  const tr = Number(ish.tartib ?? 0);
  for (let a = otaOl(ish); a; a = otaOl(a)) {
    const mos: T[] = []; yig(a, 2, mos);
    const bosh = mos.filter((x) => x.id !== ish.id && !olingan.has(x.id));
    bosh.sort((x, y) => Math.abs(Number(x.tartib ?? 0) - tr) - Math.abs(Number(y.tartib ?? 0) - tr));
    if (bosh[0]) return bosh[0];
  }
  return null;
}
