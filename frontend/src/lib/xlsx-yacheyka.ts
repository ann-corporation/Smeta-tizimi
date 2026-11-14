/**
 * Xlsx/zip dagi tizim HISOBLAGAN (formula bor) kataklar sanog'i - SOF modul (faqat fflate): brauzer (hujjatTokenBilan)
 * ham, server (functions/_shared/hujjat-sarf.ts) ham aynan shu qoidadan foydalanadi.
 */
import { unzipSync, strFromU8 } from 'fflate';

const VARAQ = /^xl\/worksheets\/[^/]+\.xml$/;
const KATAK = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const FORMULA = /<f\b/;
const MANZIL = /\br="([A-Z]+\d+)"/;

/** Varaqdagi hisoblangan (formula bor) kataklar: manzil → katak XML (manba bilan solishtirish uchun). */
function hisoblanganlar(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  let i = 0;
  for (const k of xml.matchAll(KATAK)) {
    if (!k[2] || !FORMULA.test(k[2])) continue;
    m.set(MANZIL.exec(k[1])?.[1] ?? `#${i++}`, k[0]);
  }
  return m;
}

/** Bitta varaq XML idagi tizim hisoblagan (formula bor) kataklar soni. */
export function varaqYacheykaSoni(xml: string): number {
  return hisoblanganlar(xml).size;
}

function varaqlar(bytes: Uint8Array): Record<string, Uint8Array> | null {
  try { return unzipSync(bytes); } catch { return null; }
}

/**
 * Faylning hisoblangan kataklari: xlsx — barcha varaqlar; zip paket — ichidagi har xlsx.
 * `manba` (foydalanuvchining asl xlsx fayli) berilsa — undagi aynan bir xil katak sanalmaydi: tizim faqat o'zi
 * qo'shgan yoki o'zgartirgan hisob uchun pul oladi. O'qib bo'lmasa 0 (faqat toifaning asosiy narxi).
 */
export function xlsxYacheykaSoni(bytes: Uint8Array, manba?: Uint8Array | null): number {
  const fayllar = varaqlar(bytes);
  if (!fayllar) return 0;
  const asl = manba ? varaqlar(manba) : null;
  let n = 0;
  for (const [nom, b] of Object.entries(fayllar)) {
    if (/\.xlsx$/i.test(nom)) { n += xlsxYacheykaSoni(b); continue; }
    if (!VARAQ.test(nom)) continue;
    const yangi = hisoblanganlar(strFromU8(b));
    const eski = asl?.[nom] ? hisoblanganlar(strFromU8(asl[nom])) : null;
    for (const [manzil, katak] of yangi) if (eski?.get(manzil) !== katak) n++;
  }
  return n;
}

/** Har ichki xlsx uchun alohida hisoblangan kataklar soni (zip - har xlsx; oddiy xlsx - bitta element). Paket narxi shu ro'yxat bo'yicha. */
export function xlsxFaylYacheykalari(bytes: Uint8Array): number[] {
  const fayllar = varaqlar(bytes);
  if (!fayllar) return [];
  const ichki = Object.entries(fayllar).filter(([nom]) => /\.xlsx$/i.test(nom));
  if (ichki.length) return ichki.map(([, b]) => xlsxYacheykaSoni(b));
  return [xlsxYacheykaSoni(bytes)];
}
