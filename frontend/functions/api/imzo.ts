/**
 * /api/imzo - SHAXSIY IMZO (kirgan foydalanuvchi). ADR: docs/architecture/ADR_SHAXSIY_IMZO.md.
 *
 * Actor FAQAT sessiyadan (so'rov tanasidan hech qachon). Maxfiy kalit serverga kelmaydi; bu yerda faqat OCHIQ kalit va imzo.
 * Imzo bazaga yozilishidan OLDIN shu yerda ochiq kalit bilan tekshiriladi (WebCrypto ECDSA P-256).
 *
 * GET  ?amal=kalitlar                     -> o'z qurilma kalitlari
 * GET  ?amal=hujjat&hujjat_id=N           -> hujjat imzolari (tekshirilgan holat bilan; a'zolik SQL da)
 * GET  ?amal=mening                       -> o'zim qo'ygan imzolar
 * GET  ?amal=ochish&token=...             -> token bo'yicha hujjat id (faqat hujjat kompaniyasi a'zosiga) - yuklab olish /api/hujjat-ol
 * POST {amal:'kalit_yarat', qurilma, ochiq_kalit, parol?}  (qayta autentifikatsiya: parol yoki yangi sessiya)
 * POST {amal:'kalit_bekor', kalit_id, sabab, shubhali_dan?}
 * POST {amal:'tayyorla', hujjat_id, kalit_id, tomon, imzo_kompaniya_id?, nomidan_kompaniya_id?}  -> server vaqti + nonce + zanjir; mijoz shu xabarni imzolaydi
 * POST {amal:'nashr_tayyor', kompaniya_id, obyekt_id?, turi, atama?, mazmun_xesh}  -> manba QR nashri (bir xil mazmun - mavjud token)
 * POST {amal:'nashr_nusxa', token, hujjat_id}                                      -> QR li nusxani nashrga biriktirish
 * POST {amal:'yoz', hujjat_id, kalit_id, tomon, imzo_kompaniya_id?, nomidan_kompaniya_id?, vaqt, nonce, oldingi_xesh, mazmun_xesh, imzo}
 *
 * Permission middleware ro'yxatida EMAS (SCOPED_APIS faqat kompaniya ma'lumotlari uchun): mustaqil himoya - sessiya, origin,
 * har RPC ichida a'zolik/kalit egasi tekshiruvi (imzo.test.ts, permission-integration.test.ts istisno izohi).
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { SESSIYA_MUDDAT_MS, tekshir, type Sess } from '../_shared/auth';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import {
  imzoKorinish, imzoQatorTekshir, imzoRpc, sessiyaYoshiMs, tezlikOmbori, zanjirTekshir, type ImzoEnv, type ImzoXom,
} from '../_shared/imzo';
import {
  IMZO_VAQT_OYNASI_S, imzoMazmunToTogri, imzoTekshir, imzoXabar, imzoXeshi, ochiqKalitYaroqli, sha256Hex, sha256Matn, tasodifiyToken, tokenMi,
  type ImzoMazmun,
} from '../../src/lib/imzo/yadro';
import { hujjatMazmunXeshi } from '../../src/lib/imzo/mazmun';

type Env = ImzoEnv & { SESSIYA_KALIT: string; R2_CANONICAL?: R2Bucket };
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: NO_STORE });

/** Bazadan keladigan foydalanuvchi xatosi kodlari -> 400 (boshqasi - 500, matni qaytarilmaydi). */
const TALAB_KODLARI = new Set([
  'HUJJAT_TAYYOR_EMAS',
  'PAROL_XATO', 'QAYTA_KIRISH_KERAK', 'QURILMA_NOTOGRI', 'KALIT_NOTOGRI', 'KALIT_LIMIT', 'KALIT_BAND', 'KALIT_YOQ', 'KALIT_BEKOR', 'SABAB_KERAK', 'VAQT_NOTOGRI',
  'TOMON_NOTOGRI', 'VAKOLAT_YOQ', 'HUJJAT_TOPILMADI', 'HUJJAT_TAYYOR_EMAS', 'MALUMOT_ESKIRGAN', 'ZANJIR_YANGILANDI', 'VAQT_OYNASI', 'TALAB_NOTOGRI', 'IMZO_TAKROR', 'RUXSAT_YOQ',
]);

export const parolUrinish = tezlikOmbori();
export const yozUrinish = tezlikOmbori();
export const nashrUrinish = tezlikOmbori();

/** Deterministik UUID (v5 ko'rinishida) - token sarfi/qaytarishi idempotent bo'lishi uchun. */
async function opUuid(belgi: string, kalit: string, nonce: string): Promise<string> {
  const h = await sha256Matn(['imzo', belgi, kalit, nonce].join('|'));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** Parolsiz hisobda kalit yaratish uchun sessiya shuncha yangi bo'lishi shart. */
export const YANGI_KIRISH_MS = 15 * 60_000;

function rpcXato(j: Record<string, unknown> | null): Response {
  if (!j) return json({ ok: false, code: 'SERVER_XATO' }, 500);
  const code = typeof j.code === 'string' ? j.code : 'SERVER_XATO';
  if (code === 'ACTOR_NOT_FOUND') return json({ ok: false, code }, 401);
  if (code === 'SERVER_YANGILANMAGAN') return json({ ok: false, code }, 404);
  if (TALAB_KODLARI.has(code)) return json({ ok: false, code }, code === 'RUXSAT_YOQ' || code === 'HUJJAT_TOPILMADI' ? 403 : 400);
  return json({ ok: false, code: 'SERVER_XATO' }, 500);
}

async function auth(ctx: { request: Request; env: Env; data?: unknown }): Promise<{ sess: Sess; id: number } | Response> {
  const verified = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!verified || !Number.isSafeInteger(verified.foydalanuvchi_id) || !verified.foydalanuvchi_id) return json({ ok: false, code: 'SESSIYA_YOQ' }, 401);
  const sess = cachedAuthority(ctx) ?? await roleAuthority(verified, ctx.env);
  if (!sess && sessiyaYaroqsizmi(verified)) return yaroqsizSessiyaJavob();
  if (!sess) return json({ ok: false, code: 'AUTHORITY_UNAVAILABLE' }, 503);
  return { sess, id: sess.foydalanuvchi_id as number };
}

const musbat = (v: unknown): number | null => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const MAX_XLSX = 20 * 1024 * 1024;
const ixtiyoriMusbat = (v: unknown): number | null | undefined => (v === undefined || v === null ? null : musbat(v) ?? undefined);   // undefined = noto'g'ri

/** Mazmun xeshi serverda R2 dan: xlsx - varaqlar xeshi (imzo varag'isiz); boshqa fayl - reestrdagi (server tekshirgan) bayt xeshi. */
async function serverMazmunXeshi(env: Env, m: Record<string, unknown>): Promise<string | null> {
  const sha = String(m.hujjat_sha256 ?? '');
  const nom = String(m.fayl_nomi ?? '').toLowerCase();
  if (!/\.(xlsx|xlsm)$/.test(nom)) return sha;
  if (!env.R2_CANONICAL || Number(m.hajm ?? 0) > MAX_XLSX) return null;
  const obj = await env.R2_CANONICAL.get(String(m.r2_obyekt));
  if (!obj) return null;
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if ((await sha256Hex(bytes)) !== sha) return null;     // R2 va reestr mos emas - imzolanmaydi
  return hujjatMazmunXeshi(bytes);
}

function xomlar(j: Record<string, unknown> | null): ImzoXom[] {
  const a = j && Array.isArray(j.imzolar) ? j.imzolar as ImzoXom[] : [];
  return a;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await auth(ctx);
  if (a instanceof Response) return a;
  const u = new URL(ctx.request.url);
  switch (u.searchParams.get('amal')) {
    case 'kalitlar': {
      const j = await imzoRpc(ctx.env, 't2_imzo_kalit_royxat_v1', { p_actor_id: a.id });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, kalitlar: j.kalitlar });
    }
    case 'hujjat': {
      const id = musbat(u.searchParams.get('hujjat_id'));
      if (!id) return json({ ok: false, code: 'TALAB_NOTOGRI' }, 400);
      const j = await imzoRpc(ctx.env, 't2_imzo_hujjat_royxat_v1', { p_actor_id: a.id, p_hujjat_id: id });
      if (!j?.ok) return rpcXato(j);
      const x = xomlar(j); const n = await zanjirTekshir(x, x.length >= 50);
      return json({ ok: true, imzolar: x.map((q, i) => ({ ...imzoKorinish(q, n[i], true), id: q.id })) });
    }
    case 'mening': {
      const j = await imzoRpc(ctx.env, 't2_imzo_mening_v1', { p_actor_id: a.id, p_limit: 100 });
      if (!j?.ok) return rpcXato(j);
      const x = xomlar(j); const n: Awaited<ReturnType<typeof imzoQatorTekshir>>[] = [];
      for (const q of x) n.push(await imzoQatorTekshir(q, null, false));   // har imzo mustaqil (zanjir - hujjat ro'yxatida)
      return json({ ok: true, imzolar: x.map((q, i) => ({ ...imzoKorinish(q, n[i], true), id: q.id, hujjat_turi: q.hujjat_turi ?? null, fayl_nomi: q.fayl_nomi ?? null })) });
    }
    case 'ochish': {
      const t = u.searchParams.get('token');
      if (!tokenMi(t)) return json({ ok: false, code: 'RUXSAT_YOQ' }, 403);
      const j = await imzoRpc(ctx.env, 't2_imzo_hujjat_ruxsat_v1', { p_actor_id: a.id, p_token: t });
      if (j?.ok) return json({ ok: true, tur: 'imzo', hujjat_id: j.hujjat_id, fayl_nomi: j.fayl_nomi });
      if (j && j.code !== 'RUXSAT_YOQ') return rpcXato(j);
      const n = await imzoRpc(ctx.env, 't2_nashr_ruxsat_v1', { p_actor_id: a.id, p_token: t });
      if (!n?.ok) return rpcXato(n);
      return json({ ok: true, tur: 'nashr', hujjat_id: n.hujjat_id ?? null, fayl_nomi: n.atama ?? null, hujjat_turi: n.turi, joriy: n.joriy === true, joriy_token: n.joriy_token ?? null });
    }
    default: return json({ ok: false, code: 'TALAB_NOTOGRI' }, 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) {
    return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  }
  const a = await auth(ctx);
  if (a instanceof Response) return a;
  let b: Record<string, unknown>;
  try { const p = await ctx.request.json(); if (!p || typeof p !== 'object' || Array.isArray(p)) throw 0; b = p as Record<string, unknown>; }
  catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const talab = () => json({ ok: false, code: 'TALAB_NOTOGRI' }, 400);
  const env = ctx.env;

  switch (b.amal) {
    case 'kalit_yarat': {
      const qurilma = typeof b.qurilma === 'string' ? b.qurilma : '';
      const ochiq = typeof b.ochiq_kalit === 'string' ? b.ochiq_kalit : '';
      const parol = typeof b.parol === 'string' && b.parol.length <= 256 ? b.parol : null;
      if (!qurilma || qurilma.length > 120 || !(await ochiqKalitYaroqli(ochiq))) return talab();
      if (parolUrinish.oshdi('p:' + a.id, 5, 15 * 60_000)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
      const yangi = sessiyaYoshiMs(a.sess.exp, SESSIYA_MUDDAT_MS) <= YANGI_KIRISH_MS;
      const j = await imzoRpc(env, 't2_imzo_kalit_yarat_v1', { p_actor_id: a.id, p_qurilma: qurilma, p_ochiq_kalit: ochiq, p_parol: parol, p_yangi_kirish: yangi });
      if (!j?.ok) return rpcXato(j);
      parolUrinish.tozala();
      return json({ ok: true, id: j.id });
    }

    case 'kalit_bekor': {
      if (typeof b.kalit_id !== 'string' || typeof b.sabab !== 'string') return talab();
      const sh = typeof b.shubhali_dan === 'string' && Number.isFinite(Date.parse(b.shubhali_dan)) ? new Date(b.shubhali_dan).toISOString() : null;
      const j = await imzoRpc(env, 't2_imzo_kalit_bekor_v1', { p_actor_id: a.id, p_kalit_id: b.kalit_id, p_sabab: b.sabab, p_shubhali_dan: sh });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true });
    }

    case 'tayyorla': {
      const hujjat = musbat(b.hujjat_id); const sk = ixtiyoriMusbat(b.imzo_kompaniya_id); const nm = ixtiyoriMusbat(b.nomidan_kompaniya_id);
      if (!hujjat || typeof b.kalit_id !== 'string' || typeof b.tomon !== 'string' || sk === undefined || nm === undefined) return talab();
      const m = await imzoRpc(env, 't2_imzo_manba_v1', { p_actor_id: a.id, p_hujjat_id: hujjat, p_kalit_id: b.kalit_id, p_imzo_kompaniya_id: sk, p_tomon: b.tomon, p_nomidan_id: nm });
      if (!m?.ok) return rpcXato(m);
      const mazmun = await serverMazmunXeshi(env, m);
      if (!mazmun) return json({ ok: false, code: 'HUJJAT_OQILMADI' }, 502);
      const vaqt = new Date().toISOString();
      const xabar: ImzoMazmun = {
        kompaniya_id: Number(m.kompaniya_id), hujjat_id: hujjat, hujjat_sha256: String(m.hujjat_sha256), mazmun_xesh: mazmun,
        kalit_id: b.kalit_id, foydalanuvchi_id: a.id, imzolovchi: String(m.imzolovchi), rol: String(m.rol), usul: 'tizim', tomon: m.tomon as ImzoMazmun['tomon'],
        imzolovchi_kompaniya_id: Number(m.imzolovchi_kompaniya_id), imzolovchi_kompaniya: String(m.imzolovchi_kompaniya),
        nomidan_kompaniya_id: m.nomidan_kompaniya_id == null ? null : Number(m.nomidan_kompaniya_id), nomidan_kompaniya: m.nomidan_kompaniya == null ? null : String(m.nomidan_kompaniya), vaqt, nonce: tasodifiyToken(),
        oldingi_xesh: String(m.oldingi_xesh),
      };
      return json({ ok: true, mazmun: xabar, oyna_s: IMZO_VAQT_OYNASI_S, fayl_nomi: m.fayl_nomi ?? null });
    }

    case 'yoz': {
      const hujjat = musbat(b.hujjat_id); const sk = ixtiyoriMusbat(b.imzo_kompaniya_id); const nm = ixtiyoriMusbat(b.nomidan_kompaniya_id);
      if (!hujjat || sk === undefined || nm === undefined || typeof b.tomon !== 'string' || typeof b.kalit_id !== 'string' || typeof b.vaqt !== 'string' || typeof b.nonce !== 'string' || typeof b.oldingi_xesh !== 'string'
        || typeof b.mazmun_xesh !== 'string' || typeof b.imzo !== 'string') return talab();
      if (yozUrinish.oshdi('y:' + a.id, 20, 60_000)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
      const m = await imzoRpc(env, 't2_imzo_manba_v1', { p_actor_id: a.id, p_hujjat_id: hujjat, p_kalit_id: b.kalit_id, p_imzo_kompaniya_id: sk, p_tomon: b.tomon, p_nomidan_id: nm });
      if (!m?.ok) return rpcXato(m);
      if (String(m.oldingi_xesh) !== b.oldingi_xesh) return json({ ok: false, code: 'ZANJIR_YANGILANDI' }, 400);
      const mazmun = await serverMazmunXeshi(env, m);
      if (!mazmun) return json({ ok: false, code: 'HUJJAT_OQILMADI' }, 502);
      if (mazmun !== b.mazmun_xesh) return json({ ok: false, code: 'MALUMOT_ESKIRGAN' }, 400);
      const xabar: ImzoMazmun = {
        kompaniya_id: Number(m.kompaniya_id), hujjat_id: hujjat, hujjat_sha256: String(m.hujjat_sha256), mazmun_xesh: mazmun,
        kalit_id: b.kalit_id, foydalanuvchi_id: a.id, imzolovchi: String(m.imzolovchi), rol: String(m.rol), usul: 'tizim', tomon: m.tomon as ImzoMazmun['tomon'],
        imzolovchi_kompaniya_id: Number(m.imzolovchi_kompaniya_id), imzolovchi_kompaniya: String(m.imzolovchi_kompaniya),
        nomidan_kompaniya_id: m.nomidan_kompaniya_id == null ? null : Number(m.nomidan_kompaniya_id), nomidan_kompaniya: m.nomidan_kompaniya == null ? null : String(m.nomidan_kompaniya), vaqt: b.vaqt, nonce: b.nonce,
        oldingi_xesh: String(m.oldingi_xesh),
      };
      if (!imzoMazmunToTogri(xabar)) return talab();
      if (Math.abs(Date.now() - Date.parse(xabar.vaqt)) > IMZO_VAQT_OYNASI_S * 1000) return json({ ok: false, code: 'VAQT_OYNASI' }, 400);
      // KRIPTOGRAFIK TEKSHIRUV: imzo ochiq kalit bilan (kalit bazadan, mijozdan emas) tekshirilgachgina yoziladi
      if (!(await imzoTekshir(String(m.ochiq_kalit), imzoXabar(xabar), b.imzo))) return json({ ok: false, code: 'IMZO_YAROQSIZ' }, 400);
      // TOKEN SERVERDA MAJBURLANADI (mavjud t2_token_sarfla_v1, operation_id = (kalit, nonce) dan - idempotent). Imzo yozilmasa - qaytariladi.
      const sarfOp = await opUuid('sarf', xabar.kalit_id, xabar.nonce);
      const sarf = await imzoRpc(env, 't2_token_sarfla_v1', {
        p_actor_id: a.id, p_kompaniya_id: xabar.imzolovchi_kompaniya_id, p_amal: 'hujjat', p_birlik_soni: 1, p_operation_id: sarfOp,
        p_meta: { hujjat: 'IMZO', sabab: 'Hujjatni imzolash', yacheyka: 1, sanoq: 'formula', xesh: await sha256Matn('imzo|' + xabar.kalit_id + '|' + xabar.nonce) },
      });
      if (!sarf) return json({ ok: false, code: 'TOKEN_XATO' }, 502);
      if (sarf.ok !== true) return json({ ok: false, code: sarf.code === 'TOKEN_YETMAYDI' ? 'TOKEN_YETMAYDI' : 'TOKEN_XATO', kerak: sarf.kerak ?? null, balans: sarf.balans ?? null }, sarf.code === 'TOKEN_YETMAYDI' ? 402 : 502);
      // Bu nonce bilan avval urinilgan (va qaytarilgan bo'lishi mumkin) - qayta to'lovsiz yozilmasin: yangi `tayyorla` kerak.
      if (sarf.takror === true) return json({ ok: false, code: 'MALUMOT_ESKIRGAN' }, 400);
      const j = await imzoRpc(env, 't2_imzo_yoz_v1', {
        p_actor_id: a.id, p_token: tasodifiyToken(), p_hujjat_id: hujjat, p_kalit_id: b.kalit_id, p_imzo_kompaniya_id: sk, p_tomon: xabar.tomon, p_nomidan_id: nm, p_vaqt: xabar.vaqt, p_nonce: xabar.nonce,
        p_mazmun_xesh: mazmun, p_oldingi_xesh: xabar.oldingi_xesh, p_hujjat_sha256: xabar.hujjat_sha256, p_imzolovchi: xabar.imzolovchi, p_rol: xabar.rol, p_imzolovchi_kompaniya: xabar.imzolovchi_kompaniya, p_nomidan_kompaniya: xabar.nomidan_kompaniya,
        p_xesh: await imzoXeshi(xabar), p_imzo: b.imzo,
      });
      if (!j?.ok) {
        await imzoRpc(env, 't2_token_qaytar_v1', { p_actor_id: a.id, p_kompaniya_id: xabar.imzolovchi_kompaniya_id, p_sarf_operation_id: sarfOp, p_operation_id: await opUuid('qaytar', xabar.kalit_id, xabar.nonce), p_sabab: 'Imzo yozilmadi' });
        return rpcXato(j);
      }
      return json({ ok: true, token: j.token, id: j.id, sarflandi: sarf.sarflandi ?? 0 });
    }

    case 'nashr_tayyor': {
      const komp = musbat(b.kompaniya_id); const ob = ixtiyoriMusbat(b.obyekt_id);
      if (!komp || ob === undefined || typeof b.turi !== 'string' || typeof b.mazmun_xesh !== 'string' || (b.atama != null && typeof b.atama !== 'string')) return talab();
      if (nashrUrinish.oshdi('n:' + a.id, 120, 60_000)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
      const j = await imzoRpc(env, 't2_nashr_tayyor_v1', { p_actor_id: a.id, p_kompaniya_id: komp, p_obyekt_id: ob, p_turi: b.turi, p_atama: (b.atama as string | null | undefined)?.slice(0, 160) ?? null, p_xesh: b.mazmun_xesh, p_token: tasodifiyToken() });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, token: j.token, yangi: j.yangi === true, hujjat_id: j.hujjat_id ?? null });
    }

    case 'nashr_nusxa': {
      const doc = musbat(b.hujjat_id);
      if (!tokenMi(b.token) || !doc) return talab();
      const j = await imzoRpc(env, 't2_nashr_nusxa_v1', { p_actor_id: a.id, p_token: b.token, p_hujjat_id: doc });
      if (!j?.ok) return rpcXato(j);
      return json({ ok: true, hujjat_id: j.hujjat_id });
    }

    default: return talab();
  }
};
