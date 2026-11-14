/**
 * /api/tender-ochiq — ochiq tender vitrinasi (KIRMASDAN, GET): royxat | lot. Faqat t2_tn_ochiq_* RPC lar: doira='ochiq' va holat='elon' lotlar;
 * hajm, muddat, shartlar. Narx, smeta/zayavka identifikatorlari, taklif narxlari va egasi nomi YO'Q. Actor/sessiya o'qilmaydi. Qisqa edge kesh (30 s).
 */
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { quraOchiq } from '../_shared/tender-ochiq';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string };
const NO = { 'Cache-Control': 'no-store' };

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const q = quraOchiq(url.searchParams.get('amal'), url.searchParams);
  if (!q.ok) return Response.json({ ok: false, code: q.code }, { status: 400, headers: NO });
  try {
    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/' + q.rpc, {
      method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(q.body),
    });
    if (r.status === 404) return Response.json({ ok: false, code: 'SERVER_YANGILANMAGAN' }, { status: 503, headers: NO });
    if (!r.ok) return Response.json({ ok: false, code: 'SERVER_XATO' }, { status: 500, headers: NO });
    const j = await r.json() as Record<string, unknown> | null;
    if (!j || typeof j !== 'object') return Response.json({ ok: false, code: 'SERVER_XATO' }, { status: 500, headers: NO });
    return Response.json({ ok: true, natija: j }, { headers: j.ok === false ? NO : { 'Cache-Control': 'public, max-age=30, s-maxage=30' } });
  } catch { return Response.json({ ok: false, code: 'SERVER_XATO' }, { status: 500, headers: NO }); }
};
