/**
 * /api/ai-ishchi — kompaniya va tizim AI ishchilari: ro'yxat, sozlama (yoqish/jadval/limit), «Hozir ishga tushir», natijalar inbox'i, sarf, internet manbalari.
 *
 * Qonunlar: actor HAR DOIM sessiyadan; a'zolik/rol/doira bazada (RPC birinchi qatori: t2_agent_scope_guard_v1); kompaniya_id yo'q = TIZIM doirasi (faqat superadmin).
 * Hamma yozuv — nomli RPC + operation_id (idempotent). Agent pul/hujjatni o'zi tasdiqlamaydi: natija inbox yoki egasi navbatidagi taklif.
 * «Hozir ishga tushir»: navbat -> SQL quruq qadam (LLMsiz, doim ishlaydi) -> (yoqilgan bo'lsa) AI xulosa (aiHisobli: limit/hamyon tekshiruvi OLDIN).
 * Rejali (cron) qism: pg_cron (SQL) + /api/ai-ishchi-bajar (AI/internet, GitHub Actions).
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { rpcData, type RpcNatija, type Yuk } from '../_shared/agent-rpc';
import { aiQadamBajar, haqiqiyBogliq, internetBajar, SUBREQUEST_BUDJET, type IshchiEnv } from '../_shared/ai-ishchi';

type Env = IshchiEnv & { SESSIYA_KALIT: string; AGENT_ISH_YOQILGAN?: string };

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISHCHI = /^[a-z0-9_]{3,40}$/;
const chiqar = (r: RpcNatija) => Response.json(r.data, { status: r.status, ...JAVOB });
const xato = (m: string, status = 400) => Response.json({ ok: false, error: m }, { status, ...JAVOB });
const opId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : crypto.randomUUID());

async function kirish(ctx: EventContext<Env, string, unknown>): Promise<{ actor: number } | Response> {
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return xato('Server sozlanmagan', 503);
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!sess) return xato('Kirish talab qilinadi', 401);
  if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return xato('Sessiyada foydalanuvchi yo‘q', 401);
  return { actor: sess.foydalanuvchi_id as number };
}

/** kompaniya_id: yo'q/null = tizim; bor bo'lsa musbat son. */
function doira(v: unknown): number | null | 'xato' {
  if (v == null || v === '') return null;
  return sonmi(v) ? Number(v) : 'xato';
}

const BOLIMLAR = new Set(['ishchilar', 'inbox', 'sarf', 'manbalar']);

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const k = await kirish(ctx); if (k instanceof Response) return k;
  const u = new URL(ctx.request.url);
  const kid = doira(u.searchParams.get('kompaniya_id')); if (kid === 'xato') return xato('kompaniya_id noto‘g‘ri');
  const bolim = u.searchParams.get('bolim') ?? 'ishchilar';
  if (!BOLIMLAR.has(bolim)) return xato('bolim noto‘g‘ri');
  const h = u.searchParams.get('holat');
  const filtr: Yuk = h && ['yangi', 'oqildi', 'bajarildi'].includes(h) ? { holat: h } : {};
  return chiqar(await rpcData(ctx.env, 't2_ai_ol_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_bolim: bolim, p_filtr: filtr }));
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const k = await kirish(ctx); if (k instanceof Response) return k;
  let so: Yuk;
  try { so = await ctx.request.json() as Yuk; } catch { return xato('Noto‘g‘ri so‘rov'); }
  const kid = doira(so.kompaniya_id); if (kid === 'xato') return xato('kompaniya_id noto‘g‘ri');
  const env = ctx.env; const amal = String(so.amal ?? '');
  const ishchi = String(so.ishchi ?? '');

  if (amal === 'sozlama_saqla') {
    if (!ISHCHI.test(ishchi)) return xato('ishchi noto‘g‘ri');
    const kirishYuk = so.kirish && typeof so.kirish === 'object' && !Array.isArray(so.kirish) ? so.kirish : {};
    return chiqar(await rpcData(env, 't2_ai_sozlama_saqla_v1', {
      p_actor_id: k.actor, p_kompaniya_id: kid, p_ishchi: ishchi, p_yoqilgan: so.yoqilgan === true, p_jadval: String(so.jadval ?? 'qolda'),
      p_soat: so.soat == null ? 1 : Number(so.soat), p_ai_xulosa: so.ai_xulosa !== false, p_max_token: so.max_token_ish == null ? 3000 : Number(so.max_token_ish),
      p_kirish: kirishYuk, p_operation_id: opId(so.operation_id),
    }));
  }

  if (amal === 'natija_holat') {
    if (!sonmi(so.natija_id)) return xato('natija_id kerak');
    return chiqar(await rpcData(env, 't2_ai_natija_holat_v1', { p_actor_id: k.actor, p_natija_id: Number(so.natija_id), p_holat: String(so.holat ?? ''), p_operation_id: opId(so.operation_id) }));
  }

  if (amal === 'manba_saqla') {
    if (kid !== null) return xato('Faqat tizim doirasida', 403);
    if (!sonmi(so.id)) return xato('id kerak');
    return chiqar(await rpcData(env, 't2_ai_manba_saqla_v1', {
      p_actor_id: k.actor, p_id: Number(so.id), p_faol: typeof so.faol === 'boolean' ? so.faol : null, p_tur: so.tur == null ? null : String(so.tur),
      p_chastota_soat: so.chastota_soat == null ? null : Number(so.chastota_soat), p_operation_id: opId(so.operation_id),
    }));
  }

  if (amal === 'ishga_tushir') {
    if (!ISHCHI.test(ishchi)) return xato('ishchi noto‘g‘ri');
    const kirishYuk = so.kirish && typeof so.kirish === 'object' && !Array.isArray(so.kirish) ? so.kirish : {};
    const n = await rpcData(env, 't2_ai_ish_navbat_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_ishchi: ishchi, p_kirish: kirishYuk, p_operation_id: opId(so.operation_id), p_manba: 'qolda' });
    if (!n.ok || n.data.ok === false) return chiqar(n);
    const ishId = Number(n.data.id);
    const hisob = { n: 0 }; const d = haqiqiyBogliq(env, hisob);
    // 1) SQL quruq qadam (LLMsiz); internet ishi — tarmoq qadami shu yerning o'zida
    let holat = String(n.data.holat ?? '');
    if (ishchi === 'internet_kuzatuvchi') {
      const r = await internetBajar(d, ishId, () => hisob.n < SUBREQUEST_BUDJET);
      if (!r.ok) return Response.json({ ok: false, code: r.kod ?? 'YUR', error: 'Internet kuzatuvchi bajarilmadi' }, { status: 502, ...JAVOB });
    } else {
      const y = await rpcData(env, 't2_ai_ish_yur_v1', { p_ish_id: ishId });
      if (!y.ok || y.data.ok === false) return chiqar(y);
      holat = String(y.data.holat ?? holat);
      // 2) AI xulosa (faqat ish tugagan va AI navbatda bo'lsa; favqulodda o'chirgich AGENT_ISH_YOQILGAN=0)
      if (holat === 'tugadi' && y.data.ai_holat === 'kutilmoqda' && env.AGENT_ISH_YOQILGAN !== '0') await aiQadamBajar(d, ishId);
    }
    const nat = await rpcData(env, 't2_ai_ol_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_bolim: 'inbox', p_filtr: {} });
    const royxat = Array.isArray(nat.data.royxat) ? (nat.data.royxat as Array<Record<string, unknown>>) : [];
    return Response.json({ ok: true, ish_id: ishId, takror: n.data.takror === true, natija: royxat.find((x) => Number(x.ish_id) === ishId) ?? null }, JAVOB);
  }

  return xato('Noma‘lum amal');
};
