/**
 * boshqaruv.ts — EGASINING PLATFORMA BOSHQARUV PANELI shlyuzi (egasi, 2026-10-02).
 *
 * Tor va sanab o'tilgan: GET — o'qish bo'limlari, POST — o'zgartirish amallari. Ixtiyoriy RPC nomi qabul qilinmaydi.
 * Actor HAR DOIM sessiyadan; platforma superadmini tekshiruvi BAZADA har funksiyaning birinchi qatorida
 * (`_t2_boshqaruv_tekshir`) — shlyuz ruxsat bermaydi, faqat uzatadi. Token to'ldirish / obuna / demo — mavjud
 * /api/sb-yoz amallari orqali (ular ham superadminni bazada tekshiradi).
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };

const OQISH: Record<string, string> = {
  umumiy: 't2_boshqaruv_umumiy_v1',
  foydalanuvchilar: 't2_boshqaruv_foydalanuvchilar_v1',
  kompaniyalar: 't2_boshqaruv_kompaniyalar_v1',
  token: 't2_boshqaruv_token_daftar_v1',
  audit: 't2_boshqaruv_audit_v1',
  tolovlar: 't2_boshqaruv_tolovlar_v1',
};
const YOZISH: Record<string, string> = {
  foydalanuvchi_holat: 't2_boshqaruv_foydalanuvchi_holat_v1',
  azolik: 't2_boshqaruv_azolik_v1',
  narx: 't2_boshqaruv_narx_v2_saqla',
  sozlama: 't2_boshqaruv_sozlama_saqla_v1',
  tolov_hal: 't2_tolov_hal_qil_v1',
  tarif: 't2_boshqaruv_tarif_saqla_v1',
};

const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const matn = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));

/** Amal parametrlarini tekshirib, RPC yukiga aylantiradi (xato bo'lsa — matn). Testlanadi. */
export function yozishYuki(amal: string, so: Record<string, unknown>): Record<string, unknown> | string {
  switch (amal) {
    case 'foydalanuvchi_holat':
      if (!sonmi(so.foydalanuvchi_id) || !['faol', 'bekor'].includes(String(so.holat))) return 'foydalanuvchi_id va holat (faol/bekor) kerak';
      return { p_foydalanuvchi_id: Number(so.foydalanuvchi_id), p_holat: String(so.holat), p_sabab: matn(so.sabab, 300) };
    case 'azolik':
      if (!sonmi(so.foydalanuvchi_id) || !sonmi(so.kompaniya_id)) return 'foydalanuvchi_id va kompaniya_id kerak';
      return { p_foydalanuvchi_id: Number(so.foydalanuvchi_id), p_kompaniya_id: Number(so.kompaniya_id), p_rol: so.rol == null || so.rol === '' ? null : String(so.rol).slice(0, 30), p_sabab: matn(so.sabab, 300) };
    case 'narx': {
      const ixt = (v: unknown) => (v == null || v === '' ? null : Number(v));
      const [a, b, bs, mn] = [Number(so.asos_som), Number(so.birlik), Number(so.birlik_som), Number(so.min_som)];
      const [mx, f] = [ixt(so.max_som), ixt(so.foyda_foiz)];
      if (!/^[a-z0-9_]{2,40}$/.test(String(so.amal_kod || '')) || ![a, b, bs, mn].every(Number.isFinite) || (mx != null && !Number.isFinite(mx)) || (f != null && !Number.isFinite(f))) {
        return 'amal_kod, asos_som, birlik, birlik_som, min_som kerak';
      }
      return { p_amal: String(so.amal_kod), p_asos_som: a, p_birlik: Math.trunc(b), p_birlik_som: bs, p_min_som: mn, p_max_som: mx, p_foyda_foiz: f, p_faol: so.faol !== false };
    }
    case 'sozlama': {
      const [ts, f, bon, k] = [Number(so.token_som), Number(so.foyda_foiz), Number(so.royxat_bonus_token), Number(so.usd_kurs)];
      if (![ts, f, bon, k].every(Number.isFinite)) return 'token_som, foyda_foiz, royxat_bonus_token, usd_kurs kerak';
      return { p_token_som: ts, p_foyda_foiz: f, p_royxat_bonus: bon, p_usd_kurs: k, p_tolov_rekvizit: matn(so.tolov_rekvizit, 500) };
    }
    case 'tolov_hal':
      if (!sonmi(so.sorov_id) || !['tasdiqlandi', 'rad'].includes(String(so.qaror))) return 'sorov_id va qaror (tasdiqlandi/rad) kerak';
      return { p_sorov_id: Number(so.sorov_id), p_qaror: String(so.qaror), p_sabab: matn(so.sabab, 300) };
    case 'tarif': {
      const [t, s] = [Number(so.oylik_token), Number(so.narx_som)];
      if (!/^[a-z_]{2,30}$/.test(String(so.kod || '')) || !String(so.nom || '').trim() || ![t, s].every(Number.isFinite)) return 'kod, nom, oylik_token, narx_som kerak';
      return { p_kod: String(so.kod), p_nom: String(so.nom).slice(0, 100), p_oylik_token: t, p_narx_som: s, p_faol: so.faol !== false };
    }
    default: return 'Amal ochiq emas';
  }
}

async function rpc(env: Env, nom: string, yuk: Record<string, unknown>): Promise<Response> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });
  const text = await r.text();
  if (!r.ok) {
    if (/SUPERADMIN_KERAK/.test(text)) return Response.json({ ok: false, code: 'SUPERADMIN_KERAK', error: 'Bu panel faqat platforma superadmini uchun' }, { status: 403 });
    return Response.json({ ok: false, error: 'Server xatosi' }, { status: 502 });
  }
  let d: unknown = null;
  try { d = JSON.parse(text); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri javob' }, { status: 502 }); }
  if (d && typeof d === 'object' && !Array.isArray(d) && (d as { ok?: unknown }).ok === false) return Response.json(d);
  return Response.json({ ok: true, natija: d });
}

async function actor(ctx: EventContext<Env, string, unknown>): Promise<number | Response> {
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, error: 'Server sozlanmagan' }, { status: 503 });
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!sess) return Response.json({ ok: false, error: 'Kirish talab qilinadi' }, { status: 401 });
  if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return Response.json({ ok: false, error: 'Sessiyada foydalanuvchi yo‘q' }, { status: 401 });
  return sess.foydalanuvchi_id as number;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  const u = new URL(ctx.request.url);
  const bolim = u.searchParams.get('bolim') || '';
  const nom = OQISH[bolim];
  if (!nom) return Response.json({ ok: false, error: 'Bo‘lim ochiq emas' }, { status: 400 });
  const yuk: Record<string, unknown> = { p_actor_id: a };
  const q = u.searchParams.get('qidiruv');
  const k = u.searchParams.get('kompaniya_id');
  const oldin = u.searchParams.get('oldin_id');
  if (bolim === 'foydalanuvchilar') yuk.p_qidiruv = q ? q.slice(0, 100) : null;
  if (bolim === 'token') yuk.p_kompaniya_id = sonmi(k) ? Number(k) : null;
  if (bolim === 'tolovlar') { const h = u.searchParams.get('holat'); yuk.p_holat = h && /^[a-z]{2,15}$/.test(h) ? h : null; }
  if (bolim === 'audit') Object.assign(yuk, { p_qidiruv: q ? q.slice(0, 100) : null, p_kompaniya_id: sonmi(k) ? Number(k) : null, p_oldin_id: sonmi(oldin) ? Number(oldin) : null });
  return rpc(ctx.env, nom, yuk);
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  let so: Record<string, unknown> = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const amal = String(so.amal || '');
  const nom = YOZISH[amal];
  if (!nom) return Response.json({ ok: false, error: 'Amal ochiq emas' }, { status: 400 });
  const yuk = yozishYuki(amal, so);
  if (typeof yuk === 'string') return Response.json({ ok: false, error: yuk }, { status: 400 });
  return rpc(ctx.env, nom, { p_actor_id: a, ...yuk });
};
