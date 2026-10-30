/**
 * O'qish so'rovlari uchun vaqt chegarasi (tez yuklash / barqarorlik, 2026-10-30).
 *
 * Nega alohida fayl: `supabase.ts` dagi `vaqtliFetch` bilan bir xil g'oya, lekin ko'p testlar `api/supabase` ni
 * mock qiladi — undan import qilinsa, mock ichida helper yo'qligi sababli modullar yiqilardi. Bu fayl mustaqil.
 *
 * Faqat O'QISH (`/api/sb`) uchun: server 60 s javob bermasa so'rov uziladi va aniq o'zbekcha xato chiqadi —
 * panel abadiy «Yuklanmoqda…» da qotib qolmaydi. Yozish (`/api/sb-yoz`) bunga ulanmagan (o'z chegarasi bor).
 */
// i18n (til.ts) bu yerda import qilinmaydi: modul Cloudflare functions type-gate'iga ham tushadi (lib/jarvis → t2-ai).

/* 60 s — `supabase.ts` dagi OQISH_CHEGARA_MS bilan bir xil. 30 s bo'lmaydi: server statement_timeout 30 s, og'ir
 * RPC'lar (rahbar_panel, pul_tahlil, moliya_tahlil, shartnoma_svod, sverka) to'liq yo'lda 31–35 s oladi. */
export const OQISH_CHEGARA_60S = 60_000;

/** `fetch` + vaqt chegarasi. Chaqiruvchining o'z `signal`i bo'lsa — u ham hurmat qilinadi. */
export async function vaqtliOqish(url: string, init: RequestInit = {}, ms: number = OQISH_CHEGARA_60S): Promise<Response> {
  const c = new AbortController();
  let vaqtTugadi = false;
  const taymer = setTimeout(() => { vaqtTugadi = true; c.abort(); }, ms);
  const tashqi = init.signal;
  const tashqiUzildi = () => c.abort();
  if (tashqi) { if (tashqi.aborted) c.abort(); else tashqi.addEventListener('abort', tashqiUzildi, { once: true }); }
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } catch (e) {
    if (vaqtTugadi) throw new Error(`Server ${Math.round(ms / 1000)} soniyada javob bermadi. Sahifani yangilab qayta urinib ko‘ring.`);
    throw e;
  } finally {
    clearTimeout(taymer);
    tashqi?.removeEventListener('abort', tashqiUzildi);
  }
}
