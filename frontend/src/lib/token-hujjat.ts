/**
 * Hujjat chiqarishning YAGONA pullik yo'li (egasi, 2026-10-16: "tizim maksimal pul ishlasin — har xizmat token
 * hisoblasin"). Har rasmiy hujjat (F3, M-29, nakopitelniy, ostatka, slichitelniy, sverka, oferta, AOSR, Studio
 * LRV/RES …) shu orqali beriladi: to'ldirilgan kataklar sanaladi → token yechiladi → keyin fayl foydalanuvchiga.
 *
 * Halollik (BUSINESS_MODEL v2/v3): hisoblagich isbotlanadi — foydalanuvchi faylni ochib qiymat yoki formula bor
 * kataklarni o'zi qayta sanay oladi (`rasmiyKitob` bilan aynan bir qoida); aynan shu mazmun qayta yuklansa —
 * bepul (xesh); berish xato bersa — token qaytadi (`tokenBilan`).
 */
import { unzipSync, strFromU8 } from 'fflate';
import { mazmunXeshi, tokenBilan, type NarxTafsilot, type TokenAmal } from '../api/t2-token';

const VARAQ = /^xl\/worksheets\/[^/]+\.xml$/;
const KATAK = /<c\b[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g;
const MAZMUN = /<(?:v|f|is)\b/;

/** Bitta varaq XML idagi qiymat yoki formula bor kataklar (faqat uslubli bo'sh katak sanalmaydi). */
export function varaqYacheykaSoni(xml: string): number {
  let n = 0;
  for (const m of xml.matchAll(KATAK)) if (m[1] && MAZMUN.test(m[1])) n++;
  return n;
}

/**
 * Faylning to'ldirilgan kataklari: xlsx — barcha varaqlar; zip paket (masalan oferta) — ichidagi har xlsx.
 * O'qib bo'lmasa 0 (narx toifaning asos/minimum qismidan olinadi — hech qachon "bepul" sababi bo'lmaydi).
 */
export function xlsxYacheykaSoni(bytes: Uint8Array): number {
  let fayllar: Record<string, Uint8Array>;
  try { fayllar = unzipSync(bytes); } catch { return 0; }
  let n = 0;
  for (const [nom, b] of Object.entries(fayllar)) {
    if (VARAQ.test(nom)) n += varaqYacheykaSoni(strFromU8(b));
    else if (/\.xlsx$/i.test(nom)) n += xlsxYacheykaSoni(b);
  }
  return n;
}

export type HujjatTokenNatija =
  | { ok: true; xabar: string; sarflandi: number; yacheykalar: number; bepulTakror: boolean; hisob?: NarxTafsilot }
  | { ok: false; xabar: string };

/**
 * Hujjatni token bilan berish. `yetkaz` — faylni yuklab berish yoki ko'rsatish; faqat token muvaffaqiyatli
 * yechilgandan KEYIN chaqiriladi. `yacheykalar` berilmasa fayldan sanaladi.
 */
export async function hujjatTokenBilan(
  p: { kompaniyaId: number; bytes: Uint8Array; hujjat: string; sabab: string; obyekt?: number | string | null; amal?: TokenAmal; yacheykalar?: number },
  yetkaz: () => void | Promise<void>,
  d: { tokenBilan: typeof tokenBilan; mazmunXeshi: typeof mazmunXeshi } = { tokenBilan, mazmunXeshi },
): Promise<HujjatTokenNatija> {
  const yacheykalar = p.yacheykalar ?? xlsxYacheykaSoni(p.bytes);
  const xesh = await d.mazmunXeshi(p.bytes);
  const meta: Record<string, string | number> = { hujjat: p.hujjat, sabab: p.sabab.slice(0, 200), yacheyka: yacheykalar, xesh };
  if (p.obyekt != null && p.obyekt !== '') meta.obyekt = p.obyekt;
  const r = await d.tokenBilan({ kompaniyaId: p.kompaniyaId, amal: p.amal ?? 'hujjat', birlikSoni: yacheykalar, meta }, async () => { await yetkaz(); return true; });
  if (!r.ok) return { ok: false, xabar: r.xabar };
  const xabar = r.bepulTakror
    ? 'Bu hujjat avval to‘langan — qayta yuklash bepul'
    : r.sarflandi
      ? `${r.sarflandi} token · ${Number(r.hisob?.yakuniy_som ?? 0).toLocaleString('ru-RU')} so‘m (${yacheykalar} yacheyka)`
      : '';
  return { ok: true, xabar, sarflandi: r.sarflandi, yacheykalar, bepulTakror: r.bepulTakror === true, hisob: r.hisob };
}
