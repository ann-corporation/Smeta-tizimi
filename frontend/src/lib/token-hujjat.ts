/**
 * Hujjat chiqarishning YAGONA pullik yo'li (egasi, 2026-10-16: "tizim maksimal pul ishlasin — har xizmat token
 * hisoblasin"). Har rasmiy hujjat (F3, M-29, nakopitelniy, ostatka, slichitelniy, sverka, oferta, AOSR, Studio
 * LRV/RES …) shu orqali beriladi: tizim HISOBLAGAN kataklar sanaladi → token yechiladi → keyin fayl foydalanuvchiga.
 *
 * Nima sanaladi (egasi, 2026-10-17): "tizim faqat o'zi ishlatgan — hisob qilib yozgan narsalarni yozishi kerak;
 * tayyor hujjatlardan olingan narsalarni yacheyka deb hisoblash noto'g'ri". Shuning uchun:
 *   • sanaladi — FORMULA bor katak (tizim hisoblab yozgan: summa, jami, nakrutka, farq, qoldiq…; hujjatlarda
 *     hisob doim formula bilan yoziladi — egasi qoidasi 2026-10-09 "maksimal formula");
 *   • sanalmaydi — matn (ish nomi, sarlavha, imzo), smeta/hujjatdan ko'chirilgan son, foydalanuvchining o'z faylidan
 *     o'zgarmay qolgan katak (`manba` berilsa — masalan oferta asl smetani saqlaydi).
 * Isbot: foydalanuvchi Excel'da «Выделить группу ячеек → Формулы» bilan aynan shu sonni o'zi ko'radi.
 * Aynan shu mazmun qayta yuklansa — bepul (xesh); berish xato bersa — token qaytadi (`tokenBilan`).
 * Hisob yo'q hujjat (AOSR, reestr — faqat kiritilgan maʼlumot) uchun faqat toifaning asosiy narxi olinadi.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { mazmunXeshi, tokenBilan, type NarxTafsilot, type TokenAmal } from '../api/t2-token';

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

export type HujjatTokenNatija =
  | { ok: true; xabar: string; sarflandi: number; yacheykalar: number; bepulTakror: boolean; hisob?: NarxTafsilot }
  | { ok: false; xabar: string };

/**
 * Hujjatni token bilan berish. `yetkaz` — faylni yuklab berish yoki ko'rsatish; faqat token muvaffaqiyatli
 * yechilgandan KEYIN chaqiriladi. `yacheykalar` berilmasa fayldan sanaladi (`manba` bilan — asl fayl ayirib).
 */
export async function hujjatTokenBilan(
  p: { kompaniyaId: number; bytes: Uint8Array; hujjat: string; sabab: string; obyekt?: number | string | null; amal?: TokenAmal; yacheykalar?: number; manba?: Uint8Array | null },
  yetkaz: () => void | Promise<void>,
  d: { tokenBilan: typeof tokenBilan; mazmunXeshi: typeof mazmunXeshi } = { tokenBilan, mazmunXeshi },
): Promise<HujjatTokenNatija> {
  const yacheykalar = p.yacheykalar ?? xlsxYacheykaSoni(p.bytes, p.manba);
  const xesh = await d.mazmunXeshi(p.bytes);
  const meta: Record<string, string | number> = { hujjat: p.hujjat, sabab: p.sabab.slice(0, 200), yacheyka: yacheykalar, sanoq: 'formula', xesh };
  if (p.obyekt != null && p.obyekt !== '') meta.obyekt = p.obyekt;
  const r = await d.tokenBilan({ kompaniyaId: p.kompaniyaId, amal: p.amal ?? 'hujjat', birlikSoni: yacheykalar, meta }, async () => { await yetkaz(); return true; });
  if (!r.ok) return { ok: false, xabar: r.xabar };
  const xabar = r.bepulTakror
    ? 'Bu hujjat avval to‘langan — qayta yuklash bepul'
    : r.sarflandi
      ? `${r.sarflandi} token · ${Number(r.hisob?.yakuniy_som ?? 0).toLocaleString('ru-RU')} so‘m (${yacheykalar} ta hisoblangan katak)`
      : '';
  return { ok: true, xabar, sarflandi: r.sarflandi, yacheykalar, bepulTakror: r.bepulTakror === true, hisob: r.hisob };
}
