/**
 * Hujjat MAZMUNI xeshi (yengil modul — tarmoq/Excel kutubxonalarini tortmaydi). Bir xil o'zgarmagan hujjatni qayta yuklash
 * qayta token yechmasligi uchun: xlsx/zip — ichki fayllar (nom + mazmun xeshi, tartiblangan); har yasalganda o'zgaradigan
 * qismlar (docProps/* — yaratilgan vaqt; zip yozuvlari sanasi) hisobga olinmaydi; ichki zip (paket) rekursiv.
 * Xotira: ichki fayllar bitta katta buferga YIG'ILMAYDI — har bo'lak alohida xeshlanadi, faqat 32 baytlik xeshlar birlashtiriladi.
 * Zip bo'lmagan fayl — o'z baytlari xeshi.
 */
import { unzipSync } from 'fflate';

const sha = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest('SHA-256', b as unknown as ArrayBuffer));
const onaltilik = (x: Uint8Array): string => [...x].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');

async function izi(bytes: Uint8Array, chuqurlik: number): Promise<Uint8Array> {
  let fayllar: Record<string, Uint8Array> | null = null;
  try { fayllar = chuqurlik < 3 ? unzipSync(bytes) : null; } catch { fayllar = null; }
  if (!fayllar) return sha(bytes);
  const enc = new TextEncoder();
  const qismlar: Uint8Array[] = [];
  for (const nom of Object.keys(fayllar).sort()) {
    if (/^docProps\//i.test(nom)) continue;
    qismlar.push(enc.encode(`\n#${nom}\n`), await izi(fayllar[nom], chuqurlik + 1)); // uzunlik emas: ichki zip siqilishi barqaror emas
    delete fayllar[nom];
  }
  const out = new Uint8Array(qismlar.reduce((s, q) => s + q.length, 0));
  let o = 0;
  for (const q of qismlar) { out.set(q, o); o += q.length; }
  return sha(out);
}

/** Hujjat mazmunining qisqa xeshi — bir xil hujjat qayta yuklanganda qayta to'lov olinmasligi uchun. */
export async function mazmunXeshi(bytes: Uint8Array): Promise<string> {
  return onaltilik(await izi(bytes, 0));
}
