/**
 * Workers AI (bepul binding) yo'lini HISOBLI va CHEGARALI qilish. Binding o'zi hisobsiz — shuning uchun:
 *  1) a'zolik + oylik byudjet tekshiruvi (t2_agent_sarf_tekshir_v1 — pullik yo'l bilan bir xil shartnoma; limit yo'q → BYUDJET_YOQ, AI yo'q);
 *  2) kunlik chegara: bir foydalanuvchiga va bir kompaniyaga (Toshkent kuni, t2_agent_sarf jadvalidagi amal='jarvis_eski_cf' soni);
 *  3) chaqiruvdan keyin haqiqiy token sarfi t2_agent_sarf_yoz_v1 ga yoziladi (token hisobi).
 * Hisob/son o'qish xatosi → fail-closed (AI chaqirilmaydi). Migratsiya talab qilinmaydi.
 */
import { supabaseBaseUrl } from './supabase-url';
import { AiByudjetXatosi } from './ai-hisobli';

export const CF_AMAL = 'jarvis_eski_cf';
export const KUNLIK_FOYDALANUVCHI = 20;
export const KUNLIK_KOMPANIYA = 100;
export type CfHisobEnv = { SUPABASE_URL?: string; SUPABASE_KEY?: string; JARVIS_CF_KUNLIK_FOYDALANUVCHI?: string; JARVIS_CF_KUNLIK_KOMPANIYA?: string };

const XABAR: Record<string, string> = {
  BYUDJET_YOQ: 'AI uchun oylik limit belgilanmagan — Boshqaruv → AI markazi → Xarajat bo\'limida limit qo\'ying',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi — limitni oshiring yoki keyingi oyni kuting',
  KUNLIK_FOYDALANUVCHI: 'Bugungi AI so\'rovlar limiti tugadi — ertaga qayta urinib ko\'ring',
  KUNLIK_KOMPANIYA: 'Kompaniyaning bugungi AI so\'rovlar limiti tugadi — ertaga qayta urinib ko\'ring',
  HISOB_XATOSI: 'AI hozir mavjud emas (hisob tekshiruvi o\'tmadi)',
};
const lim = (v: unknown, d: number) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : d; };

/** Toshkent (UTC+5) kunining boshi, UTC ISO ko'rinishida. */
export function toshkentKunBoshi(now = new Date()): string {
  const t = new Date(now.getTime() + 5 * 3600_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 5 * 3600_000).toISOString();
}

const sarlavha = (env: CfHisobEnv) => ({ apikey: String(env.SUPABASE_KEY), Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' });

async function rpc(env: CfHisobEnv, nom: string, yuk: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const r = await fetch(supabaseBaseUrl(String(env.SUPABASE_URL)) + '/rest/v1/rpc/' + nom, { method: 'POST', headers: sarlavha(env), body: JSON.stringify(yuk) }).catch(() => null);
  if (!r) return null;
  const d = await r.json().catch(() => null) as Record<string, unknown> | null;
  return r.ok ? d : { ok: false, code: r.status === 403 ? 'COMPANY_ACCESS_DENIED' : 'HISOB_XATOSI' };
}

async function bugunSoni(env: CfHisobEnv, filtr: string): Promise<number | null> {
  const q = `?select=id&amal=eq.${CF_AMAL}&vaqt=gte.${encodeURIComponent(toshkentKunBoshi())}&${filtr}&limit=1`;
  const r = await fetch(supabaseBaseUrl(String(env.SUPABASE_URL)) + '/rest/v1/t2_agent_sarf' + q, { headers: { ...sarlavha(env), Prefer: 'count=exact' } }).catch(() => null);
  if (!r || !r.ok) return null;
  const m = /\/(\d+)$/.exec(r.headers.get('content-range') ?? '');
  return m ? Number(m[1]) : null;
}

export async function workersAiHisobli<T extends { usage?: { input_tokens?: number; output_tokens?: number } }>(
  env: CfHisobEnv, actor: number, kompaniyaId: number, chaqir: () => Promise<T>,
): Promise<T> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new AiByudjetXatosi('HISOB_XATOSI', XABAR.HISOB_XATOSI);
  const t = await rpc(env, 't2_agent_sarf_tekshir_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId });
  if (!t || t.ok === false) { const c = String(t?.code ?? 'HISOB_XATOSI'); throw new AiByudjetXatosi(c, XABAR[c] ?? XABAR.HISOB_XATOSI); }
  const [u, k] = await Promise.all([bugunSoni(env, `actor_id=eq.${actor}`), bugunSoni(env, `kompaniya_id=eq.${kompaniyaId}`)]);
  if (u === null || k === null) throw new AiByudjetXatosi('HISOB_XATOSI', XABAR.HISOB_XATOSI);
  if (u >= lim(env.JARVIS_CF_KUNLIK_FOYDALANUVCHI, KUNLIK_FOYDALANUVCHI)) throw new AiByudjetXatosi('KUNLIK_FOYDALANUVCHI', XABAR.KUNLIK_FOYDALANUVCHI);
  if (k >= lim(env.JARVIS_CF_KUNLIK_KOMPANIYA, KUNLIK_KOMPANIYA)) throw new AiByudjetXatosi('KUNLIK_KOMPANIYA', XABAR.KUNLIK_KOMPANIYA);
  try {
    const r = await chaqir();
    await rpc(env, 't2_agent_sarf_yoz_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: 'company_access', p_amal: CF_AMAL, p_model: null,
      p_kirish: r.usage?.input_tokens ?? 0, p_chiqish: r.usage?.output_tokens ?? 0, p_narx_usd: 0, p_muvaffaqiyat: true });
    return r;
  } catch (e) {
    /* Muvaffaqiyatsiz urinish ham kunlik hisobga kiradi (xato bilan aylanib o'tib cheksiz urinib bo'lmasin). */
    await rpc(env, 't2_agent_sarf_yoz_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: 'company_access', p_amal: CF_AMAL, p_model: null,
      p_kirish: 0, p_chiqish: 0, p_narx_usd: 0, p_muvaffaqiyat: false }).catch(() => null);
    throw e;
  }
}
