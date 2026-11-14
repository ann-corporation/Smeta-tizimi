/**
 * /api/bozor-ochiq — Bozor vitrinasi (KIRMASDAN, GET). Faqat oq ro'yxat: qidir | elon | sotuvchi | filtr.
 * Faqat t2_bz_ochiq_* RPC lar: ular faqat holat='faol' e'lon va sotuvchining E'LON QILINGAN maydonlarini qaytaradi (telefon, kompaniya, email YO'Q).
 * Actor/sessiya o'qilmaydi. Qisqa edge kesh (30 s): bazaga yuk tushmaydi.
 */
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { quraOchiq } from '../_shared/bozor';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string };
const KESH = { 'Cache-Control': 'public, max-age=30, s-maxage=30' };

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const q = quraOchiq(url.searchParams.get('amal'), url.searchParams);
  if (!q.ok) return Response.json({ ok: false, code: q.code }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  try {
    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/' + q.rpc, {
      method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(q.body),
    });
    if (r.status === 404) return Response.json({ ok: false, code: 'SERVER_YANGILANMAGAN' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    if (!r.ok) return Response.json({ ok: false, code: 'SERVER_XATO' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    const j = await r.json() as Record<string, unknown> | null;
    if (!j || typeof j !== 'object') return Response.json({ ok: false, code: 'SERVER_XATO' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ ok: true, natija: j }, { headers: j.ok === false ? { 'Cache-Control': 'no-store' } : KESH });
  } catch { return Response.json({ ok: false, code: 'SERVER_XATO' }, { status: 500, headers: { 'Cache-Control': 'no-store' } }); }
};
