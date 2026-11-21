/**
 * hujjat-fon.ts — «Hujjat doim tayyor» navbatini TIZIM FAOLIYATI bilan doimiy ishlatish (egasi 2026-11-21).
 *
 * Muammo: navbatni faqat GitHub cron (`*\/5` deb yozilgan, amalda 5–8 soatda bir) va paket sahifasi ochilishi ishlatardi —
 * Diskdagi F-2 soatlab eskirib, paket hujjatni bosilgan paytda yasashga majbur bo'lardi (sekin, ko'p yuklamada CPU chegarasi).
 * Endi: har qanday foydalanuvchi API so'rovidan KEYIN (javob qaytgach, `waitUntil`) izolyatda ko'pi bilan `ORALIQ_MS` da bir
 * marta navbatdan BITTA hujjat yasaladi. Ma'lumot o'zgarishi faqat foydalanuvchi faoliyatida bo'ladi — shu sabab o'zgarishdan
 * keyin bir necha daqiqada Disk yangi bo'ladi. Navbatni olish SQL da atomar (`for update skip locked`) — takror yasalmaydi.
 * Izolyatda hujjat yasalayotgan bo'lsa (CPU) yoki chaqiruv hujjat yasash ichida bo'lsa — o'tkazib yuboriladi. Token yechilmaydi.
 */
import { haqiqiyDeps, navbatniIshla, type YangilaEnv } from './hujjat-yangila';
import { ichkiBandmi, ichkidami } from './hujjat-ichki';

export const ORALIQ_MS = 20_000;
const OGIR_YOLLAR = new Set(['hujjat-yarat', 'hujjat-yangila-tick', 'hujjat-paket', 'hujjat-maydoni']);
let oxirgi = 0;

/** Faqat testlar uchun. */
export function fonniQaytaOrnat(): void { oxirgi = 0; }

export type FonCtx = { request: Request; env: Partial<YangilaEnv>; waitUntil?: (p: Promise<unknown>) => void };

/** Fon ishini boshlash kerakmi (sof qaror — testlanadi). */
export function fonKerakmi(api: string, status: number, hozir: number): boolean {
  if (OGIR_YOLLAR.has(api)) return false;
  if (status >= 400) return false;
  if (hozir - oxirgi < ORALIQ_MS) return false;
  if (ichkidami() || ichkiBandmi()) return false;
  return true;
}

/** Javob qaytgach (waitUntil) navbatdan bitta hujjatni yasaydi. Hech qachon xato tashlamaydi. */
export function fondaYangila(ctx: FonCtx, api: string, status: number, ish: (c: FonCtx) => Promise<unknown> = standartIsh): void {
  try {
    if (!ctx.waitUntil || !ctx.env?.SESSIYA_KALIT || !ctx.env?.SUPABASE_URL) return;
    const hozir = Date.now();
    if (!fonKerakmi(api, status, hozir)) return;
    oxirgi = hozir;
    ctx.waitUntil(ish(ctx).catch(() => undefined));
  } catch { /* fon ishi foydalanuvchi so'roviga hech qachon ta'sir qilmaydi */ }
}

async function standartIsh(ctx: FonCtx): Promise<unknown> {
  // Faqat F-2: javobdan keyingi fon vaqti qisqa (~30 s); og'ir ostatka/slichitelniy unga sig'maydi — ular cron/paket ishlovchisida.
  const n = await navbatniIshla(haqiqiyDeps(ctx as never, { turlar: ['f2'] }), { limit: 1, byudjetMs: 25_000 });
  if (n.xato > 0) console.error(JSON.stringify({ hujjat_fon: 'xato', xatolar: n.xatolar.slice(0, 3) }));
  return n;
}
