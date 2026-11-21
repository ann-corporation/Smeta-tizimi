/**
 * Paketdan oldin oldindan tayyorlash sikli (TOZA; tarmoq `chaqir` orqali beriladi). Server har chaqiruvda bir necha hujjatni yangilaydi (cheklangan byudjet);
 * bu sikl `qolgan` 0 bo'lguncha, yutuq to'xtaguncha (ketma-ket 2 marta o'zgarishsiz) yoki `maks` urinishgacha takrorlaydi. Xato siklni to'xtatadi, lekin
 * paket yuklab olishni to'smaydi (qolganlari yuklab olish yo'li bilan yasaladi).
 */
export type TayyorlaJavob = { ok: true; kerak: number; qolgan: number; yangilandi: number; xato: number } | { ok: false; xabar: string };
export type TayyorlaNatija = { boshida: number; qolgan: number; yangilandi: number; urinish: number; xabar?: string };

export async function tayyorlaSikl(chaqir: () => Promise<TayyorlaJavob>, o: { maks?: number; tayyor?: (qolgan: number, boshida: number) => void } = {}): Promise<TayyorlaNatija> {
  const maks = o.maks ?? 12;
  let boshida = -1; let oxirgi = 0; let yangilandi = 0; let yutuqsiz = 0; let urinish = 0;
  while (urinish < maks) {
    urinish++;
    const r = await chaqir();
    if (!r.ok) return { boshida: Math.max(boshida, 0), qolgan: oxirgi, yangilandi, urinish, xabar: r.xabar };
    if (boshida < 0) boshida = r.kerak;
    yangilandi += r.yangilandi;
    const yutuq = r.yangilandi > 0 || (urinish > 1 && r.qolgan < oxirgi);
    oxirgi = r.qolgan;
    o.tayyor?.(r.qolgan, boshida);
    if (r.qolgan <= 0) break;
    yutuqsiz = yutuq ? 0 : yutuqsiz + 1;
    if (yutuqsiz >= 2) break;
  }
  return { boshida: Math.max(boshida, 0), qolgan: oxirgi, yangilandi, urinish };
}
