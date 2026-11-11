/**
 * Bir xil o'qishni birlashtirish (tezlik): sahifa ochilganda bir necha komponent AYNAN bir xil so'rovni (masalan, obyekt nakrutkasi,
 * akt reestri, podvallar, shartnoma liniyasi) bir vaqtda beradi - holat sahifasida 3-4 martagacha. Sukut bo'yicha faqat HOZIR uchib
 * turgan so'rov qayta ishlatiladi; tugagach darhol unutiladi (tahrirdan keyingi qayta o'qish hech qachon eski javob olmaydi). Faqat O'QISH uchun.
 */
const bor = new Map<string, Promise<unknown>>();
export function birlash<R>(kalit: string, oqi: () => Promise<R>, graceMs = 0): Promise<R> {
  const b = bor.get(kalit);
  if (b) return b as Promise<R>;
  const p = oqi();
  bor.set(kalit, p);
  const unut = () => { if (bor.get(kalit) === p) bor.delete(kalit); };
  p.then(() => { if (graceMs > 0) setTimeout(unut, graceMs); else unut(); }, unut);
  return p;
}