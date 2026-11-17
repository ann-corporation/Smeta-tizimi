/**
 * GET /api/ai-salomatlik - "AI salomatligi" hisoboti (faqat platforma superadmini; har chaqiruvda bazada qayta tekshiriladi, superadminActor).
 * Oxirgi 7 va 30 kun, yuza (surface) bo'yicha: so'rovlar soni, xato foizi, p50/p95 kechikish, eng ko'p xato kodlari, yoqdi/yoqmadi, vosita statistikasi
 * + AI ishchilar holati. Faqat o'qiydi; matn/kompaniya ma'lumoti yo'q (faqat sonlar va kodlar).
 * Migratsiya (20270106000000) qo'llanmagan bo'lsa - 503 MIGRATSIYA_YOQ.
 */
import { superadminActor, type SuperadminEnv } from '../_shared/superadmin';
import { supabaseBaseUrl } from '../_shared/supabase-url';

const javob = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });

export const onRequestGet: PagesFunction<SuperadminEnv> = async (ctx) => {
  const actor = await superadminActor(ctx.request, ctx.env);
  if ('code' in actor) return javob({ ok: false, code: actor.code }, actor.status);
  const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_ai_salomatlik_v1', {
    method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_id: actor.id }),
  }).catch(() => null);
  if (!r) return javob({ ok: false, code: 'HISOBOT_OLINMADI' }, 502);
  if (r.status === 404) return javob({ ok: false, code: 'MIGRATSIYA_YOQ' }, 503);
  const j = (r.ok ? await r.json().catch(() => null) : null) as Record<string, unknown> | null;
  if (!j || j.ok !== true) return javob({ ok: false, code: String(j?.code ?? 'HISOBOT_OLINMADI') }, 502);
  return javob(j);
};
