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
import { NONCE_PREFIKS, TOKEN_FORMAT, ipBelgi, nonceYaroqli, tasodifiyToken, xesh, yoqilgan } from '../_shared/kirish-emailsiz';
import { deepLink, tokenBormi } from '../_shared/telegram';
import { qiymatTuri, usernameNorm, usernameXato } from '../_shared/username';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string; GOOGLE_CLIENT_ID?: string; GOOGLE_ORIGINS?: string;
  KIRISH_TELEGRAM_YOQILGAN?: string; TELEGRAM_BOT_TOKEN?: string; TELEGRAM_BOT_USERNAME?: string; TELEGRAM_SAYT_URL?: string };
type Rpc = { ok?: boolean; code?: string; [k: string]: unknown };

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200, h: Record<string, string> = {}) => Response.json(b, { status, headers: { ...NO_STORE, ...h } });

/** Bazadan keladigan, foydalanuvchi xatosi bo'lgan kodlar → 400. Boshqa har qanday xato → 500 (matni qaytarilmaydi). */
const TALAB_KODLARI = new Set([
  'ISM_NOTOGRI', 'TELEFON_NOTOGRI', 'TIL_NOTOGRI', 'RANG_NOTOGRI',
  'ESKI_PAROL_XATO', 'PAROL_QISQA', 'PAROL_UZUN', 'PAROL_BIR_XIL',
  'GOOGLE_PAROLSIZ', 'GOOGLE_BOSHQA_HISOB', 'GOOGLE_ALLAQACHON_ULANGAN', 'GOOGLE_MALUMOT_NOTOGRI',
  'LOGIN_PAROL_XATO', 'OZI', 'PAROLSIZ_HISOB',
  'USERNAME_QISQA', 'USERNAME_UZUN', 'USERNAME_FORMAT', 'USERNAME_BOSHLANISH', 'USERNAME_UNDERSCORE', 'USERNAME_BAND_SOZ', 'SOZLAMA_NOTOGRI', 'QIYMAT_NOTOGRI',
  'TAKLIF_YAROQSIZ', 'TAKLIF_MUDDATI_OTGAN',
  'SUPERADMIN_FARQI', 'TELEGRAM_HISOB_YOQ', 'HISOB_YOQ', 'KOD_YAROQSIZ', 'OXIRGI_USUL', 'EMAIL_LOGIN', 'USUL_TOPILMADI', 'USUL_BIRLASHTIRILGAN', 'DOKAZ_NOTOGRI',
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
  if (code === 'SERVER_YANGILANMAGAN' || code === 'TAKLIF_TOPILMADI') return json({ ok: false, code }, 404);
  if (code === 'USERNAME_BAND' || code === 'USERNAME_USHLANGAN') return json({ ok: false, code }, 409);
  if (code === 'USERNAME_LIMIT' || code === 'LIMIT') return json({ ok: false, code }, 429);
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
    /* Telegram — ikkinchi hisobga egalik isboti (kirgan foydalanuvchi): nonce + brauzer siri (kirish-telegram.ts bilan bir xil sxema), actor sessiyadan. */
    case 'birlashtir_telegram_boshla': {
      if (!yoqilgan(env.KIRISH_TELEGRAM_YOQILGAN) || !tokenBormi(env)) return json({ ok: false, code: 'YOQILMAGAN' }, 503);
      const nonce = NONCE_PREFIKS + tasodifiyToken(24), sir = tasodifiyToken(32);
      const q = new Uint32Array(1); crypto.getRandomValues(q);
      const belgi = String(q[0] % 10000).padStart(4, '0');
      const j = await rpc(env, 't2_tg_dokaz_boshla_v1', {
        p_actor_id: id, p_nonce_xesh: await xesh('tg-nonce', nonce, env.SESSIYA_KALIT), p_brauzer_xesh: await xesh('tg-brauzer', sir, env.SESSIYA_KALIT), p_belgi: belgi, p_ip_belgi: await ipBelgi(ctx.request),
      });
      if (!j?.ok) return j?.code === 'LIMIT' ? json({ ok: false, code: 'KOP_URINISH' }, 429) : rpcXato(j);
      return json({ ok: true, nonce, sir, belgi, havola: deepLink(env, nonce), tugaydi: j.tugaydi });
    }

    case 'birlashtir_telegram_holat': {
      const nonce = typeof b.nonce === 'string' ? b.nonce : '', sir = typeof b.sir === 'string' ? b.sir : '';
      if (!nonceYaroqli(nonce) || !TOKEN_FORMAT.test(sir)) return json({ ok: false, code: 'TOPILMADI' }, 404);
      const d = await rpc(env, 't2_tg_dokaz_holat_v1', { p_actor_id: id, p_nonce_xesh: await xesh('tg-nonce', nonce, env.SESSIYA_KALIT), p_brauzer_xesh: await xesh('tg-brauzer', sir, env.SESSIYA_KALIT) });
      if (!d) return json({ ok: false, code: 'SERVER_XATO' }, 500);
      if (d.ok && d.holat === 'kutmoqda') return json({ ok: true, holat: 'kutmoqda' });
      if (!d.ok || !Number.isSafeInteger(Number(d.foydalanuvchi_id))) {
        const code = typeof d.code === 'string' && ['MUDDATI_OTGAN', 'TELEGRAM_HISOB_YOQ', 'LIMIT'].includes(d.code) ? d.code : 'TOPILMADI';
        return json({ ok: false, code }, code === 'TOPILMADI' ? 404 : code === 'LIMIT' ? 429 : 400);
      }
      const boshqa = Number(d.foydalanuvchi_id);
      const opId = typeof b.operation_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.operation_id) ? b.operation_id : crypto.randomUUID();
      const j = await rpc(env, 't2_hisob_birlashtir_v2', { p_actor_id: id, p_boshqa_id: boshqa, p_dokaz: 'telegram', p_operation_id: opId });
      if (!j?.ok) return rpcXato(j);
      vakolatKeshTozala(id); vakolatKeshTozala(boshqa);
      const yangi = await roleAuthority(a.verified, env);
      const cookie = await yangiCookie(env, yangi ?? a.verified);
      if (!cookie) return json({ ok: false, code: 'CONFIG' }, 503);
      return json({ ok: true, holat: 'tayyor', kochirilgan_kompaniyalar: j.kochirilgan_kompaniyalar ?? [], qolgan_rollar: j.qolgan_rollar ?? [] }, 200, { 'Set-Cookie': cookie });
    }
    /* ── @username (USERNAME-V1, 20261224100000): actor FAQAT sessiyadan. Qidiruv — aniq moslik; telefon/email hech qachon qaytmaydi. ── */
    case 'username_ol': {
      const j = await rpc(env, 't2_username_ol_v1', { p_actor_id: id });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, username: j.username ?? null, ism: j.ism ?? null, telefon_qidiruv: j.telefon_qidiruv, bugun_qoldi: j.bugun_qoldi });
    }

    case 'username_belgila': {
      /* null / '' — o'chirish. Format SQL da ham tekshiriladi (bu yerda oldindan — bekorga chaqiruvni oldini olish). */
      const norm = b.username === null || b.username === '' ? null : usernameNorm(b.username);
      if (typeof b.username !== 'string' && b.username !== null) return talab();
      if (norm !== null) { const x = usernameXato(norm); if (x) return json({ ok: false, code: x }, 400); }
      const opId = typeof b.operation_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.operation_id) ? b.operation_id : crypto.randomUUID();
      const j = await rpc(env, 't2_username_belgila_v1', { p_actor_id: id, p_username: norm, p_operation_id: opId });
      if (!j?.ok) return rpcXato(j);
      vakolatKeshTozala(id);
      return json({ ok: true, username: j.username ?? null });
    }

    case 'username_tekshir': {
      const norm = usernameNorm(b.username);
      const variantlar = Array.isArray(b.variantlar) ? b.variantlar.filter((v): v is string => typeof v === 'string').slice(0, 10).map((v) => v.slice(0, 40)) : [];
      if (typeof b.username !== 'string' || b.username.length > 64) return talab();
      const x = usernameXato(norm);
      if (x && norm !== null && norm.length >= 1 && x !== 'USERNAME_QISQA') return json({ ok: true, yaroqli: false, sabab: x, bosh: false, band: false, variantlar: [] });
      const j = await rpc(env, 't2_username_tekshir_v1', { p_actor_id: id, p_username: norm, p_variantlar: variantlar });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, yaroqli: j.yaroqli === true, sabab: j.sabab ?? null, bosh: j.bosh === true, band: j.band === true, variantlar: Array.isArray(j.variantlar) ? j.variantlar : [] });
    }

    case 'username_sozlama': {
      if (typeof b.telefon_qidiruv !== 'string') return talab();
      const j = await rpc(env, 't2_username_sozlama_v1', { p_actor_id: id, p_telefon_qidiruv: b.telefon_qidiruv });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, telefon_qidiruv: j.telefon_qidiruv });
    }

    case 'qidir': {
      const qiymat = typeof b.qiymat === 'string' ? b.qiymat.trim() : '';
      if (!qiymat || qiymat.length > 254 || qiymatTuri(qiymat) === 'noaniq') return json({ ok: false, code: 'QIYMAT_NOTOGRI' }, 400);
      const j = await rpc(env, 't2_foydalanuvchi_qidir_v1', { p_actor_id: id, p_qiymat: qiymat });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, topildi: j.topildi === true, tur: j.tur, profil: j.topildi === true ? j.profil : null });
    }

    case 'kompaniyadosh_qidir': {
      const prefiks = typeof b.prefiks === 'string' ? b.prefiks.slice(0, 40) : '';
      const komp = b.kompaniya_id == null ? null : Number(b.kompaniya_id);
      if (komp !== null && (!Number.isSafeInteger(komp) || komp <= 0)) return talab();
      const j = await rpc(env, 't2_foydalanuvchi_kompaniyadosh_qidir_v1', { p_actor_id: id, p_prefiks: prefiks, p_kompaniya_id: komp });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, royxat: Array.isArray(j.royxat) ? j.royxat : [] });
    }

    case 'username_ommaviy': {
      const idlar = Array.isArray(b.idlar) ? b.idlar.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200) : null;
      if (!idlar) return talab();
      const j = await rpc(env, 't2_username_ommaviy_v1', { p_actor_id: id, p_idlar: idlar });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, username: j.username ?? {} });
    }

    case 'taklif_royxat': {
      const j = await rpc(env, 't2_kompaniya_taklif_royxat_v1', { p_actor_id: id });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, royxat: Array.isArray(j.royxat) ? j.royxat : [] });
    }

    case 'taklif_javob': {
      const tid = Number(b.taklif_id);
      if (!Number.isSafeInteger(tid) || tid <= 0 || typeof b.qabul !== 'boolean') return talab();
      const opId = typeof b.operation_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.operation_id) ? b.operation_id : crypto.randomUUID();
      const j = await rpc(env, 't2_kompaniya_taklif_javob_v1', { p_actor_id: id, p_taklif_id: tid, p_qabul: b.qabul, p_operation_id: opId });
      if (!j?.ok) return rpcXato(j);
      if (b.qabul) {
        vakolatKeshTozala(id);
        // Yangi a'zolik cookie dagi kompaniyalar ro'yxatiga tushsin.
        const yangi = await roleAuthority(a.verified, env);
        const cookie = await yangiCookie(env, yangi ?? a.verified);
        if (!cookie) return json({ ok: false, code: 'CONFIG' }, 503);
        return json({ ok: true, holat: j.holat, kompaniya_id: j.kompaniya_id ?? null, rol: j.rol ?? null }, 200, { 'Set-Cookie': cookie });
      }
      return json({ ok: true, holat: j.holat });
    }

    default:
      return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
  }
};
