/**
 * telegram-amal.ts — bot amalini MAVJUD shlyuz + middleware orqali bajarish (Telegram V2, 1-bosqich).
 *
 * Qoida: Telegram hisobi faqat bog'langan t2_foydalanuvchi sifatida ishlaydi. Bot hech qachon o'z ruxsat tekshiruvini
 * yozmaydi va jadvalga to'g'ridan-to'g'ri tegmaydi: `botChaqiruv` ichki so'rov quradi (foydalanuvchi uchun qisqa muddatli
 * ichki sessiya — brauzerga HECH QACHON chiqmaydi) va uni AYNAN veb-so'rov o'tadigan yo'ldan o'tkazadi:
 *   middleware (roleAuthority → t2_men_v1, permissionsByCompany, modul holati, tenant) → shlyuz funksiyasi (RPC birinchi
 *   qatorida a'zolik/rol).  Natija: botda ham veb bilan bir xil ruxsat, bir xil hisob-kitob (aiHisobli, hujjat-sarf, …).
 * Ichki sessiya roli (`prorab`) HUQUQ BERMAYDI — middleware har safar DB vakolatini qayta o'qiydi (roleAuthority).
 * Token/cookie/matn loglanmaydi.
 */
import { imzola } from './auth';
import { type TgEnv, saytUrl } from './telegram';

export type BotChaqiruv = {
  /** `/api/<api>` oxirgi yo'l bo'lagi (middleware shu nom bilan ruxsatni aniqlaydi). */
  api: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number>;
  json?: unknown;
  form?: FormData;
};
export type BotNatija<T = Record<string, unknown>> = { status: number; body: T | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (ctx: any) => Promise<Response> | Response;
type Mw = TgEnv & { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT?: string };

/** Ichki so'rovni middleware → handler zanjirida bajaradi. `uid` — FAQAT bog'lanishdan (t2_telegram_aniqla_v1) olingan id. */
export async function botChaqiruv<T = Record<string, unknown>>(
  env: Mw, uid: number, c: BotChaqiruv, middleware: Handler, handler: Handler,
): Promise<BotNatija<T>> {
  if (!Number.isSafeInteger(uid) || uid <= 0 || String(env.SESSIYA_KALIT || '').trim().length < 16) return { status: 503, body: null };
  let sess: string;
  try { sess = await imzola({ rol: 'prorab', email: 'telegram-bot', foydalanuvchi_id: uid, kompaniyalar: [] }, String(env.SESSIYA_KALIT)); }
  catch { return { status: 503, body: null }; }
  const url = new URL(saytUrl(env) + '/api/' + c.api);
  for (const [k, v] of Object.entries(c.query ?? {})) url.searchParams.set(k, String(v));
  const method = c.method ?? (c.json !== undefined || c.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Cookie: 'sess=' + sess };
  let body: BodyInit | undefined;
  if (c.form) body = c.form;
  else if (c.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(c.json); }
  const request = new Request(url.toString(), { method, headers, body });
  const data: Record<string, unknown> = {};
  const ctx = {
    request, env, data, params: {}, functionPath: '/api/' + c.api,
    waitUntil: () => undefined, passThroughOnException: () => undefined,
    next: async () => handler(ctx),
  };
  try {
    const r = await middleware(ctx);
    const j = await r.json().catch(() => null) as T | null;
    return { status: r.status, body: j };
  } catch { return { status: 502, body: null }; }
}
