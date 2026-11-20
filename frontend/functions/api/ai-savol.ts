import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { aiXatoMalumoti } from '../_shared/agent-hisob';
import { kasbQuvur, type JarvisEnv } from '../_shared/jarvis/chat';
import { jarvisKichikGap, jarvisRahmatJavobi, jarvisSalomJavobi } from '../../src/lib/jarvis/intent';
import { jarvisHelp } from '../../src/lib/jarvis/answers';
import { smetaMcpClient } from '../_shared/jarvis/mcp-client';

type Env = JarvisEnv & { SESSIYA_KALIT: string };
const headers = { 'Cache-Control': 'no-store' };
const xato = (xabar: string, status = 400) => Response.json({ ok: false, xabar }, { status, headers });
const id = (v: unknown) => (
  (typeof v === 'number' || typeof v === 'string') && Number.isSafeInteger(Number(v)) && Number(v) > 0
    ? Number(v) : null
);
const javob = (body: Record<string, unknown>) =>
  Response.json({ ok: true, agent: 'Jarvis', provider: 'local', ...body, requires_approval: false }, { headers });

/** Legacy HTTP contract, also used by Telegram. Business reads run in the authenticated Jarvis core. */
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  const actor = id(sess?.foydalanuvchi_id);
  if (!sess || !actor) return xato('Kirish talab qilinadi', 401);
  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return xato('Noto‘g‘ri JSON so‘rov'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return xato('Noto‘g‘ri JSON so‘rov');
  const body = raw as Record<string, unknown>;
  const savol = typeof body.savol === 'string' ? body.savol.trim() : '';
  if (!savol || savol.length > 2000) return xato('Savol 1–2000 belgi bo‘lishi kerak');

  const kichik = jarvisKichikGap(savol);
  if (kichik) return javob({ javob: kichik === 'rahmat' ? jarvisRahmatJavobi() : jarvisSalomJavobi(), model: 'greeting' });
  const help = jarvisHelp(savol);
  if (help) return javob({ javob: help, model: 'capabilities' });

  if (!Array.isArray(sess.kompaniyalar)) return xato('Sessiya kompaniya ruxsatini tasdiqlamayapti; qayta kiring', 403);
  const requested = id(body.kompaniya_id);
  if (body.kompaniya_id != null && requested == null) return xato('kompaniya_id musbat butun son bo‘lishi kerak');
  const company = requested ?? (sess.kompaniyalar.length === 1 ? sess.kompaniyalar[0].kompaniya_id : null);
  if (!company) return xato('Tizim_02 tepasidan kompaniyani tanlang', 422);
  if (!sess.kompaniyalar.some((a) => a.kompaniya_id === company)) return xato('Bu kompaniyaga ruxsat yo‘q', 403);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return xato('Supabase AI konteksti sozlanmagan', 503);

  try {
    const result = await kasbQuvur({ ...ctx.env, jarvisMcp: smetaMcpClient(ctx.env.SMETA_MCP, ctx.request, company) }, actor, company, {
      savol, obyekt_id: id(body.obyekt_id), tarix: body.tarix,
    }, () => undefined, 'read-only', undefined, ctx.waitUntil?.bind(ctx));
    if (result.body.ok === true) return javob(result.body);
    const { error, xabar, code } = result.body;
    return Response.json({ ok: false, xabar: xabar ?? error ?? 'So‘rov bajarilmadi', code }, { status: result.status, headers });
  } catch (error) {
    const result = aiXatoMalumoti(error);
    return Response.json({ ok: false, xabar: result.body.error, code: result.body.code }, { status: result.status, headers });
  }
};
