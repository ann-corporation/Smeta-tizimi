/**
 * /api/tekshiruv - TEXNADZOR TEKSHIRUVI (egasi 2026-11-19): F-2 dagi QR -> tekshiruv paneli (/tekshiruv/<token>).
 *
 * `token` = hujjat nashri tokeni (t2_nashr, QR dagi `/t/<token>` bilan bir xil). Aktor FAQAT sessiyadan; ruxsatni RPC hal qiladi
 * (_t2_f2_tekshiruv_rol_v1: PTO a'zosi | buyurtmachi/texnadzor tomon granti | PTO bergan bir martalik kod). Texnadzor F-2 ga YOZMAYDI:
 * hamma narsa taklif (t2_f2_tekshiruv_taklif); F-2 ga yozuv faqat PTO qarori bilan, mavjud /api/f2-buyruq preview->tasdiq yo'lida.
 *
 * GET  ?token=...                                                   -> panel (rol, akt, qatorlar smeta tartibida, takliflar)
 * POST {amal:'bog', token, akt_id}                                  -> nashr tokenini (akt, versiya) ga bog'lash (eksport qiluvchi, PTO a'zosi)
 * POST {amal:'saqla', token, qator_id, bayroq?, izoh?, taklif_hajm?, rang?, hujjat_turi?, qosh?}   -> qator bo'yicha taklif (bo'sh = o'chirish)
 * POST {amal:'holat', token, holat, izoh?}                          -> umumiy holat: qoralama | korib_chiqildi | qaytarildi | qabul
 * POST {amal:'qidir', token, q}                                     -> F-2 da yo'q smeta qatorlari (qo'shishni taklif qilish uchun)
 * POST {amal:'kod_ber', token, ism?, soat?}                         -> PTO: bir martalik kirish kodi (faqat shu javobda ko'rinadi)
 * POST {amal:'kod_ol', token, kod}                                  -> kirgan foydalanuvchi kodni ishlatadi (bir marta)
 *
 * Permission middleware ro'yxatida EMAS (imzo.ts kabi): mustaqil himoya - sessiya, origin, har RPC ichida ruxsat.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir, type Sess } from '../_shared/auth';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { imzoRpc, tezlikOmbori, type ImzoEnv } from '../_shared/imzo';
import { sha256Matn, tasodifiyToken, tokenMi } from '../../src/lib/imzo/yadro';
import { tekshiruvTalabi } from '../../src/lib/tekshiruv/yadro';

type Env = ImzoEnv & { SESSIYA_KALIT: string };
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: NO_STORE });

/** RPC xato kodlari -> HTTP (boshqasi 500; matn qaytarilmaydi). */
const KODLAR: Record<string, number> = {
  TOPILMADI: 404, RUXSAT_YOQ: 403, TALAB_NOTOGRI: 400, QATOR_NOTOGRI: 400, QAROR_QOYILGAN: 409, KOD_YAROQSIZ: 403, KOD_ISHLATILGAN: 403, AKT_TOPILMADI: 404, TOKEN_BAND: 409,
};
export const urinish = tezlikOmbori();

function rpcXato(j: Record<string, unknown> | null): Response {
  if (!j) return json({ ok: false, code: 'SERVER_XATO' }, 500);
  const code = typeof j.code === 'string' ? j.code : 'SERVER_XATO';
  if (code === 'SERVER_YANGILANMAGAN') return json({ ok: false, code }, 503);
  return KODLAR[code] ? json({ ok: false, code }, KODLAR[code]) : json({ ok: false, code: 'SERVER_XATO' }, 500);
}

async function auth(ctx: { request: Request; env: Env; data?: unknown }): Promise<{ sess: Sess; id: number } | Response> {
  const verified = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!verified || !Number.isSafeInteger(verified.foydalanuvchi_id) || !verified.foydalanuvchi_id) return json({ ok: false, code: 'SESSIYA_YOQ' }, 401);
  const sess = cachedAuthority(ctx) ?? await roleAuthority(verified, ctx.env);
  if (!sess && sessiyaYaroqsizmi(verified)) return yaroqsizSessiyaJavob();
  if (!sess) return json({ ok: false, code: 'AUTHORITY_UNAVAILABLE' }, 503);
  return { sess, id: sess.foydalanuvchi_id as number };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await auth(ctx);
  if (a instanceof Response) return a;
  if (urinish.oshdi('g:' + a.id, 120, 60_000)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
  const token = new URL(ctx.request.url).searchParams.get('token');
  if (!tokenMi(token)) return json({ ok: false, code: 'TOPILMADI' }, 404);
  const j = await imzoRpc(ctx.env, 't2_f2_tekshiruv_ochish_v1', { p_actor_id: a.id, p_token: token });
  return j?.ok ? json(j) : rpcXato(j);
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  const a = await auth(ctx);
  if (a instanceof Response) return a;
  let b: Record<string, unknown>;
  try { const p = await ctx.request.json(); if (!p || typeof p !== 'object' || Array.isArray(p)) throw 0; b = p as Record<string, unknown>; }
  catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const talab = () => json({ ok: false, code: 'TALAB_NOTOGRI' }, 400);
  const token = b.token;
  if (!tokenMi(token)) return talab();
  if (urinish.oshdi('p:' + a.id, 90, 60_000)) return json({ ok: false, code: 'KOP_URINISH' }, 429);
  const env = ctx.env;

  switch (b.amal) {
    case 'bog': {
      const akt = Number(b.akt_id);
      if (!Number.isSafeInteger(akt) || akt <= 0) return talab();
      const j = await imzoRpc(env, 't2_f2_tekshiruv_bog_v1', { p_actor_id: a.id, p_token: token, p_akt_id: akt });
      return j?.ok ? json({ ok: true, yangi: j.yangi === true }) : rpcXato(j);
    }
    case 'saqla': {
      const t = tekshiruvTalabi(b);
      if (!t) return talab();
      const j = await imzoRpc(env, 't2_f2_tekshiruv_saqla_v1', { p_actor_id: a.id, p_token: token, p_qator_id: t.qator_id, p_bayroq: t.bayroq, p_izoh: t.izoh, p_taklif_hajm: t.taklif_hajm, p_rang: t.rang, p_hujjat_turi: t.hujjat_turi, p_qosh: t.qosh });
      return j?.ok ? json({ ok: true, id: j.id ?? null, ochirildi: j.ochirildi === true }) : rpcXato(j);
    }
    case 'holat': {
      const h = typeof b.holat === 'string' ? b.holat : '';
      if (!['qoralama', 'korib_chiqildi', 'qaytarildi', 'qabul'].includes(h)) return talab();
      const j = await imzoRpc(env, 't2_f2_tekshiruv_holat_v1', { p_actor_id: a.id, p_token: token, p_holat: h, p_izoh: typeof b.izoh === 'string' ? b.izoh.slice(0, 2000) : null });
      return j?.ok ? json({ ok: true, holat: j.holat }) : rpcXato(j);
    }
    case 'qidir': {
      const q = typeof b.q === 'string' ? b.q.trim() : '';
      if (q.length < 2 || q.length > 80) return talab();
      const j = await imzoRpc(env, 't2_f2_tekshiruv_qidir_v1', { p_actor_id: a.id, p_token: token, p_q: q });
      return j?.ok ? json({ ok: true, qatorlar: j.qatorlar }) : rpcXato(j);
    }
    case 'kod_ber': {
      const kod = tasodifiyToken();
      const soat = b.soat === undefined ? 72 : Number(b.soat);
      if (!Number.isSafeInteger(soat) || soat < 1 || soat > 336) return talab();
      const j = await imzoRpc(env, 't2_f2_tekshiruv_kod_ber_v1', { p_actor_id: a.id, p_token: token, p_kod_xesh: await sha256Matn(kod), p_ism: typeof b.ism === 'string' ? b.ism.slice(0, 120) : null, p_soat: soat });
      return j?.ok ? json({ ok: true, kod, soat }) : rpcXato(j);
    }
    case 'kod_ol': {
      if (!tokenMi(b.kod) || urinish.oshdi('k:' + a.id, 8, 15 * 60_000)) return talab();
      const j = await imzoRpc(env, 't2_f2_tekshiruv_kod_ol_v1', { p_actor_id: a.id, p_token: token, p_kod_xesh: await sha256Matn(b.kod as string) });
      return j?.ok ? json({ ok: true }) : rpcXato(j);
    }
    default: return talab();
  }
};
