/**
 * Telegram bot (@qur_uz_bot) + Mini App — mijoz tomoni (egasi 2026-10-28). Server: /api/telegram, /api/telegram/miniapp.
 * Ulash kodi faqat serverda yaratiladi (bazada xesh); bu yerda faqat t.me havolasi ko'rsatiladi.
 */
export type TgHolat = { ok: boolean; code?: string; sozlangan?: boolean; bot?: string; ulangan?: boolean; ulandi_at?: string | null;
  bildirishnoma?: Record<string, boolean> | null };
export type TgAdminHolat = { ok: boolean; code?: string; xabar?: string; sozlangan?: boolean; sir_sozlangan?: boolean; bot?: string | null; kutilgan_url?: string;
  webhook?: { ornatilgan: boolean; url: string | null; navbat: number | null; oxirgi_xato_vaqt: string | null; oxirgi_xato: string | null } | null;
  statistika?: { ulangan: number | null; update_24s: number | null; miniapp_24s: number | null } | null;
  webhook_xato?: string | null; menyu_xato?: string | null; buyruqlar?: boolean };
type Javob = { ok: boolean; code?: string; xabar?: string; [k: string]: unknown };

const XATOLAR: Record<string, string> = {
  SOZLANMAGAN: 'Telegram bot hali sozlanmagan. Administratorga xabar bering.',
  LIMIT: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.',
  AUTH_REQUIRED: 'Tizimga qayta kiring.',
  ULANMAGAN: 'Telegram hali hisobingizga ulanmagan.',
  SUPERADMIN_REQUIRED: 'Bu bo‘lim faqat superadmin uchun.',
  WEBHOOK_SIR_YOQ: 'TELEGRAM_WEBHOOK_SECRET o‘rnatilmagan.',
  TELEGRAM_RAD: 'Telegram so‘rovni rad etdi.',
};
export const tgXato = (r: Javob) => (r.code && XATOLAR[r.code]) || r.xabar || 'Amal bajarilmadi.';

async function post<T extends Javob>(url: string, body: Record<string, unknown>): Promise<T> {
  try {
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ ok: false, code: 'JAVOB_NOTOGRI' })) as T;
  } catch { return { ok: false, code: 'TARMOQ', xabar: 'Tarmoq xatosi' } as T; }
}

export async function tgHolatOl(): Promise<TgHolat> {
  try {
    const r = await fetch('/api/telegram', { credentials: 'same-origin' });
    return await r.json().catch(() => ({ ok: false, code: 'JAVOB_NOTOGRI' })) as TgHolat;
  } catch { return { ok: false, code: 'TARMOQ' }; }
}
export const tgKodOl = () => post<Javob & { havola?: string; tugaydi?: string | null }>('/api/telegram', { amal: 'kod' });
export const tgUz = () => post<Javob & { uzildi?: boolean }>('/api/telegram', { amal: 'uz' });
export const tgSozlama = (bildirishnoma: Record<string, boolean>) => post<Javob & { bildirishnoma?: Record<string, boolean> }>('/api/telegram', { amal: 'sozlama', bildirishnoma });
export const tgAdminHolat = () => post<TgAdminHolat>('/api/telegram', { amal: 'admin_holat' });
export const tgAdminOrnat = () => post<TgAdminHolat>('/api/telegram', { amal: 'admin_ornat' });
export const tgMiniAppKirish = (initData: string) => post<Javob & { rol?: string }>('/api/telegram/miniapp', { initData });

/** Telegram Mini App initData: avval Telegram skripti (bo'lsa), aks holda URL fragmentidagi `tgWebAppData`. */
export function initDataOl(w: { location: { hash: string }; Telegram?: { WebApp?: { initData?: string } } } =
  window as unknown as { location: { hash: string }; Telegram?: { WebApp?: { initData?: string } } }): string {
  const s = w.Telegram?.WebApp?.initData;
  if (s) return s;
  try { return new URLSearchParams(w.location.hash.replace(/^#/, '')).get('tgWebAppData') || ''; } catch { return ''; }
}

/** Telegram'ga «ready/expand» signali — tashqi skript yuklamasdan (mobil: TelegramWebviewProxy; web: postMessage). */
export function tgSignal(hodisa: 'web_app_ready' | 'web_app_expand'): void {
  const w = window as unknown as { TelegramWebviewProxy?: { postEvent: (e: string, d: string) => void } };
  try {
    if (w.TelegramWebviewProxy?.postEvent) { w.TelegramWebviewProxy.postEvent(hodisa, ''); return; }
    if (window.parent && window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: hodisa, eventData: {} }), 'https://web.telegram.org');
  } catch { /* Telegram tashqarisida */ }
}
