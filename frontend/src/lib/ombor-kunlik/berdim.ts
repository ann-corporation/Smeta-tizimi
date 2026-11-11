/** Vergul yoki nuqta; faqat musbat, 6 xonagacha kasr. Boshqa shakl — noto'g'ri (jimgina tuzatilmaydi). */
export function berdimMiqdor(s: string): string | null {
  const x = s.trim().replace(',', '.');
  return /^[0-9]+(\.[0-9]{1,6})?$/.test(x) && Number(x) > 0 ? x : null;
}
