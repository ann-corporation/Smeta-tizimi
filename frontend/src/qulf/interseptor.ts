/**
 * STEP-UP interseptori: har bir same-origin /api so'rov 403 {code:'STEP_UP_KERAK'} qaytarsa -- tasdiq oynasi ochiladi, muvaffaqiyatda so'rov BIR MARTA
 * qayta yuboriladi. Alohida chaqiruv joylarini o'zgartirish shart emas (supabase.ts, t2-*.ts va h.k.).
 * Veb: server HttpOnly cookie (qulf_tasdiq) qo'yadi. Windows ilova (Tauri): cookie yo'q -- /api/qulf javobidagi `tasdiq_token` xotirada saqlanib,
 * keyingi /api so'rovlariga `_tasdiq` parametri sifatida qo'shiladi (yo'l BFF tanasi ichida ketadi, HTTP URL logiga tushmaydi).
 */
export type TasdiqSorovchi = (usullar: string[]) => Promise<boolean>;

const TOKEN_UMR_MS = 4.5 * 60_000; // server 5 daqiqa; biroz erta tashlaymiz

const manzil = (input: RequestInfo | URL): URL | null => {
  try { return new URL(input instanceof Request ? input.url : String(input), location.origin); } catch { return null; }
};
const tauriMi = () => typeof window !== 'undefined' && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;

export function interseptorOrnat(sorovchi: TasdiqSorovchi): () => void {
  if (typeof window === 'undefined') return () => {};
  const asl = window.fetch;
  let desktopToken: { t: string; until: number } | null = null;

  /** Tauri: token bor bo'lsa `_tasdiq` parametrini qo'shadi. */
  const tokenQosh = (input: RequestInfo | URL): RequestInfo | URL => {
    if (!desktopToken || Date.now() > desktopToken.until) return input;
    const u = manzil(input);
    if (!u || u.origin !== location.origin || !u.pathname.startsWith('/api/')) return input;
    u.searchParams.set('_tasdiq', desktopToken.t);
    const yangi = u.pathname + u.search;
    return input instanceof Request ? new Request(yangi, input) : yangi;
  };

  const uragan: typeof fetch = async (input, init) => {
    const qayta = input instanceof Request ? input.clone() : input;
    const tauri = tauriMi();
    const u = manzil(input);
    const api = !!u && u.origin === location.origin && u.pathname.startsWith('/api/');
    const res = await asl.call(window, tauri && api ? tokenQosh(input) : input, init);
    if (!api) return res;
    if (tauri && u!.pathname === '/api/qulf' && res.ok) {
      try { const j = await res.clone().json() as { tasdiq_token?: string }; if (j?.tasdiq_token) desktopToken = { t: j.tasdiq_token, until: Date.now() + TOKEN_UMR_MS }; } catch { /* JSON emas */ }
    }
    if (res.status !== 403 || u!.pathname === '/api/qulf') return res;
    let j: { code?: string; usullar?: string[] } | null = null;
    try { j = await res.clone().json(); } catch { return res; }
    if (j?.code !== 'STEP_UP_KERAK') return res;
    const ok = await sorovchi(Array.isArray(j.usullar) ? j.usullar : ['pin']);
    return ok ? asl.call(window, tauri ? tokenQosh(qayta) : qayta, init) : res;
  };
  window.fetch = uragan;
  return () => { if (window.fetch === uragan) window.fetch = asl; };
}
