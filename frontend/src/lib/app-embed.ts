/**
 * ILOVA ICHIDAGI VEB KONTEYNER («app-embed») — Android ilovadagi WebView veb sahifani ochganda ikki marta sarlavha/menyu chiqmasligi uchun.
 *
 * Aniqlash (ikkalasi ham ixtiyoriy, bittasi yetadi):
 *   1) User-Agent da `QURAIApp/<versiya>` (Android WebView har so'rovga qo'shadi) — navigatsiyadan keyin ham saqlanadi;
 *   2) birinchi yuklashdagi `?app=android` (yoki `app=1`) — sessionStorage da eslab qolinadi (UA bo'lmagan test/brauzer uchun).
 * Qo'shimcha maslahatlar (faqat ko'rinish, ruxsat bermaydi): `k=<kompaniya id>` — ilovada tanlangan ish joyi (a'zo bo'lsangizgina ishlaydi),
 * `tema=dark|light` — ilova mavzusi. Hech qanday maxfiy ma'lumot URL da emas.
 */
export type EmbedYuza = 'Android';
const KALIT = 'qurai-app-embed';
const UA = /QURAIApp\/[\w.-]+/;

type Muhit = {
  location?: { search?: string };
  navigator?: { userAgent?: string };
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
};
const muhit = (): Muhit | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as Muhit));

function oqiSaqlangan(w: Muhit): { yuza: EmbedYuza; k: number | null } | null {
  try {
    const raw = w.sessionStorage?.getItem(KALIT);
    if (!raw) return null;
    const p = JSON.parse(raw) as { yuza?: unknown; k?: unknown };
    return p.yuza === 'Android' ? { yuza: 'Android', k: typeof p.k === 'number' && Number.isSafeInteger(p.k) && p.k > 0 ? p.k : null } : null;
  } catch { return null; }
}

/** Sof: query matnidan embed belgilarini ajratadi (testlanadi). */
export function embedQuery(search: string): { yuza: EmbedYuza | null; k: number | null; tema: 'firuza' | 'ganch' | null } {
  const q = new URLSearchParams(search);
  const app = q.get('app');
  const kRaw = q.get('k');
  const k = kRaw && /^\d{1,12}$/.test(kRaw) && Number(kRaw) > 0 ? Number(kRaw) : null;
  const t = q.get('tema');
  return { yuza: app === 'android' || app === '1' ? 'Android' : null, k, tema: t === 'dark' ? 'firuza' : t === 'light' ? 'ganch' : null };
}

/** Sahifa yuklanganda BIR marta (main.tsx eng birinchi import): query dan embed holatini eslab qoladi va ilova mavzusini qo'llaydi. */
export function appEmbedBelgila(w: Muhit | undefined = muhit()): void {
  if (!w) return;
  const e = embedQuery(w.location?.search ?? '');
  const ua = UA.test(w.navigator?.userAgent ?? '');
  if (!e.yuza && !ua) return;
  try { w.sessionStorage?.setItem(KALIT, JSON.stringify({ yuza: 'Android', k: e.k ?? oqiSaqlangan(w)?.k ?? null })); } catch { /* saqlash bloklangan: UA baribir ishlaydi */ }
  // Mavzu ilova bilan bir xil bo'lsin (Mavzu.tsx shu kalitni modul yuklanganda o'qiydi).
  if (e.tema) { try { w.localStorage?.setItem('fz-mavzu', e.tema); } catch { /* ignore */ } }
}

/** Veb ilova ichidagi konteynerdami (yon menyu / yuqori panel yashiriladi). */
export function appEmbedMi(w: Muhit | undefined = muhit()): boolean {
  if (!w) return false;
  return UA.test(w.navigator?.userAgent ?? '') || oqiSaqlangan(w) != null;
}

/** Ilovada tanlangan ish joyi (kompaniya id) — a'zolikni KompaniyaKontekst tekshiradi; yo'q bo'lsa null. */
export function appEmbedKompaniya(w: Muhit | undefined = muhit()): number | null {
  if (!w || !appEmbedMi(w)) return null;
  return oqiSaqlangan(w)?.k ?? null;
}
