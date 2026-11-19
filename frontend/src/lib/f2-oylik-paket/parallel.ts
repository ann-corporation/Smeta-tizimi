/** Toza parallel ish yordamchisi (brauzer/Worker uchun umumiy; token/Toast ga bog'liq emas). Tartibni saqlaydi. */
export async function parallelIsh<T, R>(royxat: readonly T[], n: number, ish: (x: T, i: number) => Promise<R>, tayyor?: (bajarildi: number) => void): Promise<R[]> {
  const out = new Array<R>(royxat.length);
  let k = 0; let bajarildi = 0;
  await Promise.all(Array.from({ length: Math.max(0, Math.min(n, royxat.length)) }, async () => {
    while (k < royxat.length) {
      const i = k++;
      out[i] = await ish(royxat[i], i);
      tayyor?.(++bajarildi);
    }
  }));
  return out;
}
