/**
 * Bir xil o'qishni birlashtirish (tezlik): sahifa ochilganda bir necha komponent AYNAN bir xil so'rovni (masalan, obyekt nakrutkasi,
 * akt reestri, podvallar, shartnoma liniyasi) bir vaqtda beradi - holat sahifasida 3-4 martagacha. Hozir uchib turgan (yoki so'nggi
 * `grace` ms ichida tugagan) so'rov qayta ishlatiladi. Xato darhol unutiladi. Faqat O'QISH uchun; yozishdan keyingi yangilash
 * uchun grace qisqa (300 ms): tahrirdan keyingi qayta o'qish eski javobni olmaydi.
 */
const bor = new Map<string, Promise<unknown>>();
export function birlash<R>(kalit: string, oqi: () => Promise<R>, graceMs = 300): Promise<R> {
  const b = bor.get(kalit);
  if (b) return b as Promise<R>;
  const p = oqi();
  bor.set(kalit, p);
  const unut = () => { if (bor.get(kalit) === p) bor.delete(kalit); };
  p.then(() => { setTimeout(unut, graceMs); }, unut);
  return p;
}