/**
 * /api/profil — foydalanuvchining O'Z profili, paroli, sessiyalari, Google ulanishi va hisoblarni birlashtirish.
 *
 * Faqat SESSIYADAGI foydalanuvchi (`sess.foydalanuvchi_id`) ustida ishlaydi — so'rov tanasidan actor HECH QACHON olinmaydi,
 * shuning uchun har qanday rol uchun ochiq (permission middleware ro'yxatiga kiritilmaydi: SCOPED_APIS faqat kompaniya
 * ma'lumotlari uchun). RPC lar: t2_profil_ol_v1, t2_profil_yangila_v1, t2_parol_ozgartir_v1, t2_sessiya_bekor_v1,
 * t2_google_uzish_v1, t2_google_ulash_v1, t2_hisob_birlashtir_v1 (migratsiya 20261110200000).
 *
 * GET  → { ok, profil, sessiya:{boshlangan,tugaydi}, google:{clientId,originlar} }
 * POST { amal: 'yangila' | 'parol' | 'boshqa_sessiyalar_chiqish' | 'google_uzish' | 'google_ulash' | 'hisob_birlashtir', ... }
 *
 * Parol / sessiya amallaridan keyin BARCHA eski cookie lar serverda bekor bo'ladi (sessiya_bekor_dan) va shu qurilmaga
 * yangi cookie beriladi. Parol hech qachon javobga/logga yozilmaydi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { imzola, SESSIYA_MUDDAT_MS, tekshir, type Sess } from '../_shared/auth';
import { roleAuthority, vakolatKeshTozala, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { googleKalitlar, googleOriginlar, googleTokenTekshir, STANDART_CLIENT_ID } from '../_shared/google-id';
import { kodXesh } from './kirish-email';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string; GOOGLE_CLIENT_ID?: string; GOOGLE_ORIGINS?: string };
type Rpc = { ok?: boolean; code?: string; [k: string]: unknown };

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200, h: Record<string, string> = {}) => Response.json(b, { status, headers: { ...NO_STORE, ...h } });

/** Bazadan keladigan, foydalanuvchi xatosi bo'lgan kodlar → 400. Boshqa har qanday xato → 500 (matni qaytarilmaydi). */
const TALAB_KODLARI = new Set([
  'ISM_NOTOGRI', 'TELEFON_NOTOGRI', 'TIL_NOTOGRI', 'RANG_NOTOGRI',
  'ESKI_PAROL_XATO', 'PAROL_QISQA', 'PAROL_UZUN', 'PAROL_BIR_XIL',
  'GOOGLE_PAROLSIZ', 'GOOGLE_BOSHQA_HISOB', 'GOOGLE_ALLAQACHON_ULANGAN', 'GOOGLE_MALUMOT_NOTOGRI',
  'LOGIN_PAROL_XATO', 'OZI', 'PAROLSIZ_HISOB',
  'SUPERADMIN_FARQI', 'HISOB_YOQ', 'KOD_YAROQSIZ', 'OXIRGI_USUL', 'EMAIL_LOGIN', 'USUL_TOPILMADI', 'USUL_BIRLASHTIRILGAN', 'DOKAZ_NOTOGRI',
]);

/* ── Noto'g'ri parol urinishlari: foydalanuvchi bo'yicha, xotirada (isolate) — 5 ta / 15 daqiqa ── */
export const URINISH_LIMIT = 5;
export const URINISH_OYNA_MS = 15 * 60_000;
const urinishlar = new Map<number, { soni: number; boshlandi: number }>();
export function urinishlarTozala() { urinishlar.clear(); }
function urinishBloklangan(id: number): boolean {
  const u = urinishlar.get(id);
  if (!u) return false;
  if (Date.now() - u.boshlandi >= URINISH_OYNA_MS) { urinishlar.delete(id); return false; }
  return u.soni >= URINISH_LIMIT;
}
function urinishYoz(id: number) {
  const u = urinishlar.get(id);
  if (!u || Date.now() - u.boshlandi >= URINISH_OYNA_MS) {
    if (urinishlar.size > 5000) urinishlar.clear();
    urinishlar.set(id, { soni: 1, boshlandi: Date.now() });
  } else u.soni++;
}

async function rpc(env: Env, nom: string, yuk: unknown): Promise<Rpc | null> {
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    });
    // PostgREST 404 = RPC bazada hali yo'q (migratsiya qo'llanmagan) — vaqtinchalik xato emas, aniq holat.
    if (r.status === 404) return { ok: false, code: 'SERVER_YANGILANMAGAN' } as Rpc;
    if (!r.ok) { console.error('[profil]', nom, 'HTTP', r.status); return null; }   // matn logga/javobga chiqarilmaydi
    const j = await r.json() as Rpc;
    return j && typeof j === 'object' ? j : null;
  } catch { console.error('[profil]', nom, 'transport'); return null; }
}

function rpcXato(j: Rpc | null): Response {
  if (!j) return json({ ok: false, code: 'SERVER_XATO' }, 500);
  const code = typeof j.code === 'string' ? j.code : 'SERVER_XATO';
  if (code === 'ACTOR_NOT_FOUND') return json({ ok: false, code }, 401);
  if (code === 'SERVER_YANGILANMAGAN') return json({ ok: false, code }, 404);
  if (TALAB_KODLARI.has(code)) {
    const extra = code === 'GOOGLE_BOSHQA_HISOB' && typeof j.boshqa_login === 'string' ? { boshqa_login: j.boshqa_login } : {};
    return json({ ok: false, code, ...extra }, 400);
  }
  return json({ ok: false, code: 'SERVER_XATO' }, 500);
}

type Identifikator = Pick<Sess, 'rol' | 'email' | 'foydalanuvchi_id' | 'kompaniyalar'>;
/** Shu qurilma uchun yangi cookie. iat bekor qilish vaqtidan kamida 1 s KEYIN bo'ladi (soat siljishida ham o'zi chiqib ketmasin). */
async function yangiCookie(env: Env, s: Identifikator, bekorISO?: unknown): Promise<string | null> {
  const bekor = typeof bekorISO === 'string' ? Date.parse(bekorISO) : NaN;
  const hozir = Math.max(Date.now(), Number.isFinite(bekor) ? bekor + 1000 : 0);
  try {
    const t = await imzola({ rol: s.rol, email: s.email, foydalanuvchi_id: s.foydalanuvchi_id, kompaniyalar: s.kompaniyalar }, env.SESSIYA_KALIT, hozir);
    return `sess=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSIYA_MUDDAT_MS / 1000)}`;
  } catch { return null; }
}

async function auth(ctx: { request: Request; env: Env; data?: unknown }): Promise<{ verified: Sess; sess: Sess } | Response> {
  const verified = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!verified || !Number.isSafeInteger(verified.foydalanuvchi_id) || !verified.foydalanuvchi_id) return json({ ok: false, code: 'SESSIYA_YOQ' }, 401);
  const sess = cachedAuthority(ctx) ?? await roleAuthority(verified, ctx.env);
  if (!sess && sessiyaYaroqsizmi(verified)) return yaroqsizSessiyaJavob();
  if (!sess) return json({ ok: false, code: 'AUTHORITY_UNAVAILABLE' }, 503);
  return { verified, sess };
}

const sessiyaInfo = (exp: number) => ({ boshlangan: new Date(exp - SESSIYA_MUDDAT_MS).toISOString(), tugaydi: new Date(exp).toISOString() });
const str = (v: unknown): string | null | undefined => v === undefined || v === null ? null : typeof v === 'string' ? v : undefined;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await auth(ctx);
  if (a instanceof Response) return a;
  const id = a.sess.foydalanuvchi_id as number;
  const j = await rpc(ctx.env, 't2_profil_ol_v1', { p_actor_id: id });
  if (!j?.ok) return rpcXato(j);
  return json({
    ok: true, profil: j.profil, sessiya: sessiyaInfo(a.sess.exp),
    google: { clientId: ctx.env.GOOGLE_CLIENT_ID || STANDART_CLIENT_ID, originlar: googleOriginlar(ctx.env) },
  });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) {
    return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  }
  const a = await auth(ctx);
  if (a instanceof Response) return a;
  const id = a.sess.foydalanuvchi_id as number;

  let b: Record<string, unknown>;
  try { const p = await ctx.request.json(); if (!p || typeof p !== 'object' || Array.isArray(p)) throw 0; b = p as Record<string, unknown>; }
  catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const env = ctx.env;
  const talab = () => json({ ok: false, code: 'TALAB_NOTOGRI' }, 400);

  switch (b.amal) {
    case 'yangila': {
      const ism = str(b.ism), telefon = str(b.telefon), til = str(b.til), rang = str(b.avatar_rang);
      if ([ism, telefon, til, rang].includes(undefined)) return talab();
      const j = await rpc(env, 't2_profil_yangila_v1', { p_actor_id: id, p_ism: ism, p_telefon: telefon, p_til: til, p_avatar_rang: rang });
      if (!j?.ok) return rpcXato(j);
      vakolatKeshTozala(id);
      return json({ ok: true, profil: j.profil });
    }

    case 'parol': {
      const eski = str(b.eski);
      if (typeof b.yangi !== 'string' || eski === undefined) return talab();
      if (urinishBloklangan(id)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
      const j = await rpc(env, 't2_parol_ozgartir_v1', { p_actor_id: id, p_eski: eski, p_yangi: b.yangi });
      if (!j?.ok) {
        if (j?.code === 'ESKI_PAROL_XATO') urinishYoz(id);
        return rpcXato(j);
      }
      urinishlar.delete(id);
      vakolatKeshTozala(id);
      const cookie = await yangiCookie(env, a.verified, j.sessiya_bekor_dan);
      if (!cookie) return json({ ok: false, code: 'CONFIG' }, 503);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie });
    }

    case 'boshqa_sessiyalar_chiqish': {
      const j = await rpc(env, 't2_sessiya_bekor_v1', { p_actor_id: id });
      if (!j?.ok) return rpcXato(j);
      vakolatKeshTozala(id);
      const cookie = await yangiCookie(env, a.verified, j.sessiya_bekor_dan);
      if (!cookie) return json({ ok: false, code: 'CONFIG' }, 503);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie });
    }

    case 'google_uzish': {
      const j = await rpc(env, 't2_google_uzish_v1', { p_actor_id: id });
      if (!j?.ok) return rpcXato(j);
      vakolatKeshTozala(id);
      return json({ ok: true, profil: j.profil });
    }

    case 'google_ulash': {
      const token = typeof b.credential === 'string' ? b.credential : '';
      if (!token || token.length > 4096) return talab();
      /* AYNAN kirish-google.ts dagi tekshiruv (imzo, aud, iss, exp, email_verified) — _shared/google-id.ts. */
      let t: Awaited<ReturnType<typeof googleTokenTekshir>>;
      try { t = await googleTokenTekshir(token, env.GOOGLE_CLIENT_ID || STANDART_CLIENT_ID, await googleKalitlar()); }
      catch { return json({ ok: false, code: 'GOOGLE_ALOQA' }, 502); }
      if (!t.ok) return json({ ok: false, code: 'GOOGLE_TOKEN_YAROQSIZ', sabab: t.sabab }, 400);
      const j = await rpc(env, 't2_google_ulash_v1', { p_actor_id: id, p_sub: t.p.sub, p_email: t.p.email });
      if (!j?.ok) return rpcXato(j);
      vakolatKeshTozala(id);
      return json({ ok: true, profil: j.profil });
    }

    case 'hisob_birlashtir': {
      const login = typeof b.login === 'string' ? b.login.trim() : '';
      if (!login || login.length > 200 || typeof b.parol !== 'string' || !b.parol || b.parol.length > 256) return talab();
      if (urinishBloklangan(id)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
      const j = await rpc(env, 't2_hisob_birlashtir_v1', { p_actor_id: id, p_login: login, p_parol: b.parol });
      if (!j?.ok) {
        if (j?.code === 'LOGIN_PAROL_XATO') urinishYoz(id);
        return rpcXato(j);
      }
      urinishlar.delete(id);
      vakolatKeshTozala(id);
      const boshqa = Number(j.birlashtirilgan_id);
      if (Number.isSafeInteger(boshqa) && boshqa > 0) vakolatKeshTozala(boshqa);
      // A'zoliklar o'zgardi → cookie dagi kompaniyalar ro'yxatini bazadagi YANGI holatdan qayta chiqaramiz.
      const yangi = await roleAuthority(a.verified, env);
      const cookie = await yangiCookie(env, yangi ?? a.verified);
      if (!cookie) return json({ ok: false, code: 'CONFIG' }, 503);
      return json({ ok: true, kochirilgan_kompaniyalar: j.kochirilgan_kompaniyalar ?? [], qolgan_rollar: j.qolgan_rollar ?? [] }, 200, { 'Set-Cookie': cookie });
    }

    /* ── Yagona akkaunt (20261218600000): kirish usullari, uzish, ikkinchi hisobni parolsiz isbot bilan birlashtirish ── */
    case 'usullar': {
      const j = await rpc(env, 't2_kirish_usullari_v1', { p_actor_id: id });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, usullar: j.usullar ?? [] });
    }

    case 'usul_uz': {
      const usulId = Number(b.usul_id);
      if (!Number.isSafeInteger(usulId) || usulId <= 0) return talab();
      /* Qayta autentifikatsiya: sessiya 10 daqiqadan yosh YOKI joriy parol (parolsiz hisobda — faqat yangi sessiya). */
      const yangiSessiya = Date.now() - (a.verified.exp - SESSIYA_MUDDAT_MS) < 10 * 60_000;
      if (!yangiSessiya) {
        if (typeof b.parol !== 'string' || !b.parol || b.parol.length > 256 || !a.verified.email) return json({ ok: false, code: 'QAYTA_KIRISH_KERAK' }, 401);
        if (urinishBloklangan(id)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
        const t = await rpc(env, 't2_parol_tekshir_v1', { p_login: a.verified.email, p_parol: b.parol });
        if (!t?.ok || Number(t.foydalanuvchi_id) !== id) { urinishYoz(id); return json({ ok: false, code: 'QAYTA_KIRISH_KERAK' }, 401); }
        urinishlar.delete(id);
      }
      const opId = typeof b.operation_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.operation_id) ? b.operation_id : crypto.randomUUID();
      const j = await rpc(env, 't2_usul_uz_v1', { p_actor_id: id, p_usul_id: usulId, p_operation_id: opId });
      if (!j?.ok) return rpcXato(j);
      vakolatKeshTozala(id);
      return json({ ok: true, tur: j.tur });
    }

    case 'birlashtir_google':
    case 'birlashtir_email_kod': {
      /* Ikkinchi hisobga egalik isboti SHLYUZDA tekshiriladi (Google imzosi yoki email kodi); RPC faqat natijaga ishonadi. */
      if (urinishBloklangan(id)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
      let dokaz: Rpc | null;
      if (b.amal === 'birlashtir_google') {
        const token = typeof b.credential === 'string' ? b.credential : '';
        if (!token || token.length > 4096) return talab();
        let t: Awaited<ReturnType<typeof googleTokenTekshir>>;
        try { t = await googleTokenTekshir(token, env.GOOGLE_CLIENT_ID || STANDART_CLIENT_ID, await googleKalitlar()); }
        catch { return json({ ok: false, code: 'SERVER_XATO' }, 500); }
        if (!t.ok) return json({ ok: false, code: 'GOOGLE_TOKEN_YAROQSIZ', sabab: t.sabab }, 400);
        dokaz = await rpc(env, 't2_google_dokaz_v1', { p_email: t.p.email, p_sub: t.p.sub });
      } else {
        const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 254) : '';
        const kod = typeof b.kod === 'string' ? b.kod.replace(/\s+/g, '') : '';
        const tid = typeof b.tasdiqlash_id === 'string' ? b.tasdiqlash_id : '';
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) || !/^\d{6}$/.test(kod) || !/^[0-9a-f-]{36}$/i.test(tid)) return talab();
        dokaz = await rpc(env, 't2_email_kod_dokaz_v1', { p_tasdiqlash_id: tid, p_kod_xesh: await kodXesh(kod, email, env.SESSIYA_KALIT), p_email: email });
      }
      if (!dokaz?.ok) { if (dokaz?.code === 'KOD_YAROQSIZ') urinishYoz(id); return rpcXato(dokaz); }
      const boshqa = Number(dokaz.foydalanuvchi_id);
      if (!Number.isSafeInteger(boshqa) || boshqa <= 0) return json({ ok: false, code: 'SERVER_XATO' }, 500);
      const opId = typeof b.operation_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.operation_id) ? b.operation_id : crypto.randomUUID();
      const j = await rpc(env, 't2_hisob_birlashtir_v2', { p_actor_id: id, p_boshqa_id: boshqa, p_dokaz: b.amal === 'birlashtir_google' ? 'google' : 'email', p_operation_id: opId });
      if (!j?.ok) return rpcXato(j);
      urinishlar.delete(id);
      vakolatKeshTozala(id); vakolatKeshTozala(boshqa);
      const yangi = await roleAuthority(a.verified, env);
      const cookie = await yangiCookie(env, yangi ?? a.verified);
      if (!cookie) return json({ ok: false, code: 'CONFIG' }, 503);
      return json({ ok: true, kochirilgan_kompaniyalar: j.kochirilgan_kompaniyalar ?? [], qolgan_rollar: j.qolgan_rollar ?? [] }, 200, { 'Set-Cookie': cookie });
    }
    default:
      return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
  }
};
