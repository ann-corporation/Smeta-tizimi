/**
 * r2-dublikat.ts — R2 dagi mavjud dublikatlarni tozalash (egasi 2026-10-20: «dublikatlar R2 da yig'ilib axlatxona»).
 * Faqat platforma superadmini (har chaqiruvda bazada qayta tekshiriladi). Uch amal:
 *   GET                      — guruhlar va tejaladigan hajm (hech narsa o'zgarmaydi);
 *   POST {amal:'birlashtir'} — asosiy obyekt R2 da borligi va hajmi/sha256 mosligi tekshiriladi, keyin nusxa yozuvlar unga
 *                              bog'lanadi (blob_key). Eski obyektlar O'CHIRILMAYDI — yetimlar ro'yxatiga tushadi;
 *   POST {amal:'yetim_ochir'} — hech kim ishlatmaydigan yetim obyektlarni R2 dan o'chiradi (QAYTARIB BO'LMAYDI — egasi bosadi).
 * Har chaqiruv chekli bo'lak (Cloudflare so'rov limiti); interfeys `qoldi` 0 bo'lguncha takrorlaydi.
 */
import { superadminActor } from '../_shared/superadmin';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };
type Guruh = { kompaniya_id: number; sha256: string; size_bytes: number; asosiy_id: number; asosiy_kalit: string; nusxa_idlar: number[]; nom: string; tejash_bytes: number };
type Yetim = { id: number; r2_key: string; size_bytes: number | null };

export const BOLAK = 20;

async function rpc(env: Env, nom: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) return null;
  return await r.json().catch(() => null) as Record<string, unknown> | null;
}
const xato = (code: string, status = 400) => Response.json({ ok: false, code }, { status });

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const actor = await superadminActor(ctx.request, ctx.env);
  if ('code' in actor) return xato(actor.code, actor.status);
  const r = await rpc(ctx.env, 't2_r2_dublikat_royxat_v1', { p_actor_id: actor.id });
  if (!r || r.ok !== true) return xato(String(r?.code ?? 'ROYXAT_OLINMADI'), 502);
  return Response.json(r);
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await superadminActor(ctx.request, ctx.env);
  if ('code' in actor) return xato(actor.code, actor.status);
  if (!ctx.env.R2_CANONICAL) return xato('CONFIG', 503);
  const so = await ctx.request.json().catch(() => null) as { amal?: string; otkaz?: unknown } | null;

  if (so?.amal === 'birlashtir') {
    const r = await rpc(ctx.env, 't2_r2_dublikat_royxat_v1', { p_actor_id: actor.id });
    if (!r || r.ok !== true) return xato(String(r?.code ?? 'ROYXAT_OLINMADI'), 502);
    /* Avvalgi bo'laklarda tekshiruvdan o'tmagan guruhlar (mijoz yuboradi) qayta urinilmaydi — sikl cheksiz aylanmaydi. */
    const otkaz = new Set((Array.isArray(so.otkaz) ? so.otkaz : []).map(Number).filter(Number.isSafeInteger));
    const guruhlar = ((r.guruhlar as Guruh[] | undefined) ?? []).filter((g) => !otkaz.has(Number(g.asosiy_id)));
    let birlashtirildi = 0, yetim = 0;
    const otkazildi: Array<{ asosiy_id: number; sabab: string }> = [];
    for (const g of guruhlar.slice(0, BOLAK)) {
      /* Asosiy obyekt haqiqatan R2 da va aynan shu mazmun bo'lishi shart — aks holda nusxalar bog'lanmaydi. */
      const h = await ctx.env.R2_CANONICAL.head(g.asosiy_kalit);
      const metaSha = h?.customMetadata?.sha256;
      if (!h || h.size !== Number(g.size_bytes) || (metaSha && metaSha.toLowerCase() !== g.sha256)) {
        otkazildi.push({ asosiy_id: g.asosiy_id, sabab: !h ? 'ASOSIY_OBYEKT_YOQ' : 'ASOSIY_MOS_EMAS' });
        continue;
      }
      const b = await rpc(ctx.env, 't2_r2_dublikat_birlashtir_v1', { p_actor_id: actor.id, p_asosiy_id: g.asosiy_id, p_nusxa_idlar: g.nusxa_idlar });
      if (!b || b.ok !== true) { otkazildi.push({ asosiy_id: g.asosiy_id, sabab: String(b?.code ?? 'BIRLASHTIRILMADI') }); continue; }
      birlashtirildi += Number(b.birlashtirildi ?? 0); yetim += Number(b.yetim ?? 0);
    }
    const qoldi = Math.max(0, guruhlar.length - BOLAK);
    return Response.json({ ok: true, birlashtirildi, yetim, otkazildi, qoldi });
  }

  if (so?.amal === 'yetim_ochir') {
    const r = await rpc(ctx.env, 't2_r2_yetim_royxat_v1', { p_actor_id: actor.id, p_limit: BOLAK });
    if (!r || r.ok !== true) return xato(String(r?.code ?? 'ROYXAT_OLINMADI'), 502);
    const yetimlar = (r.yetimlar as Yetim[] | undefined) ?? [];
    let ochirildi = 0, bayt = 0;
    for (const y of yetimlar) {
      /* O'chirishdan oldin bazada yana tekshiriladi: kalitni hech bir hujjat ishlatmasligi shart. */
      const t = await rpc(ctx.env, 't2_r2_yetim_ochirildi_v1', { p_actor_id: actor.id, p_yetim_id: y.id, p_tekshir: true });
      if (!t || t.ok !== true || t.r2_key !== y.r2_key) continue;
      await ctx.env.R2_CANONICAL.delete(y.r2_key);
      const m = await rpc(ctx.env, 't2_r2_yetim_ochirildi_v1', { p_actor_id: actor.id, p_yetim_id: y.id, p_tekshir: false });
      if (m?.ok === true) { ochirildi++; bayt += Number(y.size_bytes ?? 0); }
    }
    return Response.json({ ok: true, ochirildi, bayt, qoldi: yetimlar.length === BOLAK ? 1 : 0 });
  }

  return xato('AMAL_NOMALUM');
};
