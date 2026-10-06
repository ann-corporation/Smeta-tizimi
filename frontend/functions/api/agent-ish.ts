/**
 * agent-ish.ts — AI agent ISH MUHITI shlyuzi: kontekst/qoida/xotira, takliflar (admin tasdig'i), tasdiqlangan veb-manbalar, savol.
 *
 * Qonunlar: actor HAR DOIM sessiyadan; a'zolik/rol/doira bazada (RPC birinchi qatori); kompaniya_id berilmasa — GLOBAL (tizim)
 * doira, uni faqat platforma superadmini ocha oladi (baza tekshiradi). Model chaqiruvidan OLDIN doira tekshiriladi (ruxsatsizga token sarflanmaydi).
 * Agent biznes jadvalga yozmaydi: natija — javob matni yoki TAKLIF (kutilmoqda). Qoida/manba faqat admin tasdig'idan keyin kuchga kiradi.
 * Funksiya o'chiq turadi: Cloudflare env `AGENT_ISH_YOQILGAN=1` bo'lgandagina ishlaydi (egasi kalitlarni qo'yib yoqadi).
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { aiCall, aiPublicError, parseJsonText, type AiEnv } from '../_shared/ai';
import { tizimPrompti, tashqiMatnOra, profilDarajasi, type Muhit } from '../_shared/agent-prompt';
import { vebOl } from '../_shared/agent-veb';

type Env = AiEnv & { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string; AGENT_ISH_YOQILGAN?: string };
type Yuk = Record<string, unknown>;
type RpcNatija = { ok: boolean; status: number; data: Yuk };

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
const PROFIL = /^[a-z_]{3,40}$/;

async function rpcData(env: Env, nom: string, yuk: Yuk): Promise<RpcNatija> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });
  const text = await r.text();
  if (!r.ok) {
    let code = ''; try { code = (JSON.parse(text) as { code?: string }).code ?? ''; } catch { /* matn emas */ }
    return { ok: false, status: code === '42501' ? 403 : code === '22023' ? 400 : 502, data: { ok: false, error: code === '42501' ? 'Bu doiraga ruxsat yo‘q' : 'Server xatosi' } };
  }
  let d: unknown = null;
  try { d = JSON.parse(text); } catch { return { ok: false, status: 502, data: { ok: false, error: 'Noto‘g‘ri javob' } }; }
  const o = (d && typeof d === 'object' ? d : { ok: true, natija: d }) as Yuk;
  return { ok: o.ok !== false, status: o.ok === false ? (o.code === 'GLOBAL_SCOPE_DENIED' || o.code === 'COMPANY_ACCESS_DENIED' || o.code === 'WRITE_ROLE_REQUIRED' ? 403 : 400) : 200, data: o };
}

const chiqar = (r: RpcNatija) => Response.json(r.data, { status: r.status, ...JAVOB });
const xato = (m: string, status = 400) => Response.json({ ok: false, error: m }, { status, ...JAVOB });

async function kirish(ctx: EventContext<Env, string, unknown>): Promise<{ actor: number } | Response> {
  if (ctx.env.AGENT_ISH_YOQILGAN !== '1') return xato('AI agent muhiti hali yoqilmagan', 503);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return xato('Server sozlanmagan', 503);
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!sess) return xato('Kirish talab qilinadi', 401);
  if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return xato('Sessiyada foydalanuvchi yo‘q', 401);
  return { actor: sess.foydalanuvchi_id as number };
}

/** kompaniya_id: yo'q/null = global; bor bo'lsa musbat son. */
function doira(v: unknown): number | null | 'xato' {
  if (v == null || v === '') return null;
  return sonmi(v) ? Number(v) : 'xato';
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const k = await kirish(ctx); if (k instanceof Response) return k;
  const u = new URL(ctx.request.url);
  const kid = doira(u.searchParams.get('kompaniya_id')); if (kid === 'xato') return xato('kompaniya_id noto‘g‘ri');
  const profil = u.searchParams.get('profil');
  if (profil && !PROFIL.test(profil)) return xato('profil noto‘g‘ri');
  const bolim = u.searchParams.get('bolim');
  if (bolim === 'muhit') return chiqar(await rpcData(ctx.env, 't2_agent_muhit_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_profil: profil || null }));
  if (bolim === 'takliflar') {
    const h = u.searchParams.get('holat');
    return chiqar(await rpcData(ctx.env, 't2_agent_taklif_royxat_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_holat: h && /^[a-z]{3,20}$/.test(h) ? h : null }));
  }
  return xato('Bo‘lim ochiq emas');
};

const TAKLIF_SXEMA = {
  name: 'qoida_takliflari',
  schema: {
    type: 'object', additionalProperties: false, required: ['takliflar'],
    properties: { takliflar: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['sarlavha', 'kod', 'matn'],
      properties: { sarlavha: { type: 'string' }, kod: { type: 'string' }, matn: { type: 'string' } } } } },
  },
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const k = await kirish(ctx); if (k instanceof Response) return k;
  let so: Yuk;
  try { so = await ctx.request.json() as Yuk; } catch { return xato('Noto‘g‘ri so‘rov'); }
  const kid = doira(so.kompaniya_id); if (kid === 'xato') return xato('kompaniya_id noto‘g‘ri');
  const profil = so.profil == null || so.profil === '' ? null : String(so.profil);
  if (profil && !PROFIL.test(profil)) return xato('profil noto‘g‘ri');
  const amal = String(so.amal || '');
  const env = ctx.env;

  if (amal === 'xotira_yoz') {
    return chiqar(await rpcData(env, 't2_agent_xotira_yoz_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_profil: profil, p_kalit: String(so.kalit ?? ''), p_mazmun: String(so.mazmun ?? '').slice(0, 4000) }));
  }
  if (amal === 'taklif_yarat') {
    const mz = so.mazmun && typeof so.mazmun === 'object' && !Array.isArray(so.mazmun) ? so.mazmun : null;
    if (!mz) return xato('mazmun obyekt bo‘lishi kerak');
    return chiqar(await rpcData(env, 't2_agent_taklif_yarat_v1', {
      p_actor_id: k.actor, p_kompaniya_id: kid, p_tur: String(so.tur ?? ''), p_doira: kid == null ? 'global' : String(so.maqsad_doira ?? 'company'), p_profil: profil,
      p_sarlavha: matn(so.sarlavha, 200) ?? '', p_mazmun: mz, p_dalil: [], p_run_id: null,
    }));
  }
  if (amal === 'taklif_qaror') {
    if (!sonmi(so.taklif_id)) return xato('taklif_id kerak');
    return chiqar(await rpcData(env, 't2_agent_taklif_qaror_v1', { p_actor_id: k.actor, p_taklif_id: Number(so.taklif_id), p_qaror: String(so.qaror ?? ''), p_izoh: matn(so.izoh, 1000) }));
  }

  const ruxsat = (domen: string) => rpcData(env, 't2_agent_veb_ruxsat_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_domen: domen }).then((r) => r.data.ok === true);
  const vebYukla = async (url: string) => {
    const v = await vebOl(url, ruxsat);
    if (v.ok) await rpcData(env, 't2_agent_veb_log_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_url: v.url, p_domen: v.domen, p_status: v.status, p_bayt: v.bayt, p_sha256: v.sha256, p_run_id: null });
    return v;
  };

  if (amal === 'veb_ol') {
    const v = await vebYukla(String(so.url ?? ''));
    if (!v.ok) return xato(v.xato, 400);
    return Response.json({ ok: true, url: v.url, domen: v.domen, sha256: v.sha256, bayt: v.bayt, qisqartirildi: v.qisqartirildi, matn: v.matn }, JAVOB);
  }

  if (amal === 'savol' || amal === 'veb_tahlil') {
    const m = await rpcData(env, 't2_agent_muhit_v1', { p_actor_id: k.actor, p_kompaniya_id: kid, p_profil: profil }); // doira tekshiruvi — model chaqiruvidan OLDIN
    if (!m.ok) return chiqar(m);
    const muhit = m.data as unknown as Muhit;
    const tizim = tizimPrompti(muhit, profil);
    const tier = profilDarajasi(profil);
    try {
      if (amal === 'savol') {
        const savol = matn(so.savol, 2000);
        if (!savol) return xato('savol kerak');
        let kontekst = '';
        if (so.url) { const v = await vebYukla(String(so.url)); if (!v.ok) return xato(v.xato, 400); kontekst = '\n\n' + tashqiMatnOra(v.url, v.matn); }
        const r = await aiCall(env, { system: tizim, text: savol + kontekst, tier, maxOutputTokens: 1200 });
        return Response.json({ ok: true, javob: r.text, model: r.model, provider: r.provider, usage: r.usage ?? null }, JAVOB);
      }
      const v = await vebYukla(String(so.url ?? ''));
      if (!v.ok) return xato(v.xato, 400);
      const maqsad = matn(so.maqsad, 500) ?? 'Qurilishga doir qoida takliflarini ajrat';
      const r = await aiCall(env, {
        system: tizim, tier: 'reasoning', maxOutputTokens: 1500, jsonSchema: TAKLIF_SXEMA,
        text: `${maqsad}.\nFaqat manbada ANIQ yozilgan, amaliy qoidani taklif qil (eng ko‘pi 3 ta). kod — kichik lotin harf/raqam/pastki chiziq; matn — qisqa buyruq shaklida, manba havolasi kontekstda. Manbada qoida bo‘lmasa bo‘sh ro‘yxat qaytar.\n\n` + tashqiMatnOra(v.url, v.matn),
      });
      const j = parseJsonText<{ takliflar?: Array<{ sarlavha?: unknown; kod?: unknown; matn?: unknown }> }>(r.text);
      const yaratildi: unknown[] = []; let otkazildi = 0;
      for (const t of (Array.isArray(j.takliflar) ? j.takliflar : []).slice(0, 3)) {
        const c = await rpcData(env, 't2_agent_taklif_yarat_v1', {
          p_actor_id: k.actor, p_kompaniya_id: kid, p_tur: 'qoida', p_doira: kid == null ? 'global' : 'company', p_profil: profil,
          p_sarlavha: matn(t.sarlavha, 200) ?? 'Manbadan qoida', p_mazmun: { kod: String(t.kod ?? ''), matn: String(t.matn ?? '') },
          p_dalil: [{ url: v.url, sha256: v.sha256, olingan: new Date().toISOString() }], p_run_id: null,
        });
        if (c.ok) yaratildi.push(c.data.id); else otkazildi += 1;
      }
      return Response.json({ ok: true, takliflar: yaratildi, otkazildi, manba: v.url, sha256: v.sha256, model: r.model }, JAVOB);
    } catch (e) {
      const p = aiPublicError(e);
      return Response.json({ ok: false, code: p.code, error: p.message }, { status: p.code === 'not_configured' ? 503 : 502, ...JAVOB });
    }
  }
  return xato('Amal ochiq emas');
};
