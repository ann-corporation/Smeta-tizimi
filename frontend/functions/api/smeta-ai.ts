/**
 * smeta-ai.ts — Smetachi AI worker (proposals only; the estimate is changed by the user in the studio).
 *
 *   POST { amal: 'suhbat', kompaniya_id, xabarlar: [{rol, matn}], ishlar: IshNiyati[], obyekt?: string }
 *        → { ok, javob, savollar, ishlar }            (reasoning tier: decomposition, questions, formulas)
 *   POST { amal: 'tanla', kompaniya_id, sorovlar: TanlovSorovi[] }
 *        → { ok, tanlovlar }                           (fast tier: pick a catalogue work among candidates)
 *
 * Session actor + company membership; company AI budget checked before every model call and usage
 * recorded (agent platform accounting). Output is schema-validated; candidates the model did not receive
 * can never be chosen. No database or R2 writes.
 */
import { tekshir } from '../_shared/auth';
import { aiPublicError, type AiTier } from '../_shared/ai';
import { aiHisobli, AiByudjetXatosi, type HisobEnv } from '../_shared/ai-hisobli';
import { SMETACHI_TIZIM, SMETACHI_VERSIYA, TANLOV_TIZIM } from '../../src/lib/smeta-ai/prompt';
import { SUHBAT_SXEMA, TANLOV_SXEMA, suhbatJavobiniTekshir, tanlovlarniTekshir, type IshNiyati, type SuhbatXabari, type TanlovSorovi } from '../../src/lib/smeta-ai/protokol';

type Env = HisobEnv & { SESSIYA_KALIT: string };
const fail = (code: string, status = 400, message?: string) => Response.json({ ok: false, code, message }, { status, headers: { 'Cache-Control': 'no-store' } });
const posInt = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

export function xabarlarniTayyorla(raw: unknown): SuhbatXabari[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = raw.slice(-14).map(x => ({ rol: (x as SuhbatXabari)?.rol === 'assistant' ? 'assistant' as const : 'user' as const, matn: clip((x as SuhbatXabari)?.matn, 4000).trim() }))
    .filter(x => x.matn);
  return out.length && out[out.length - 1].rol === 'user' ? out : null;
}
export function sorovlarniTayyorla(raw: unknown): TanlovSorovi[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 40) return null;
  const out: TanlovSorovi[] = [];
  for (const s of raw as Array<Record<string, unknown>>) {
    const nomzodlar = (Array.isArray(s?.nomzodlar) ? s.nomzodlar : []).slice(0, 15).map(n => {
      const r = (n ?? {}) as Record<string, unknown>;
      return { id: clip(r.id, 40), kod: clip(r.kod, 60), nom: clip(r.nom, 400), birlik: r.birlik == null ? null : clip(r.birlik, 30) };
    }).filter(n => /^[A-Za-z0-9_:.-]{1,40}$/.test(n.id));
    const id = clip(s?.id, 40);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !nomzodlar.length) return null;
    out.push({ id, tavsif: clip(s.tavsif, 300), birlik: clip(s.birlik, 10) as TanlovSorovi['birlik'], material: s.material == null ? null : clip(s.material, 120), nomzodlar });
  }
  return out;
}
const parse = (t: string) => { try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess || !posInt(sess.foydalanuvchi_id)) return fail('AUTH_REQUIRED', 401);
  const raw = await ctx.request.text();
  if (raw.length > 300_000) return fail('BODY_TOO_LARGE', 413);
  let so: Record<string, unknown>;
  try { so = JSON.parse(raw); } catch { return fail('BODY_INVALID'); }
  const kompaniyaId = Number(so.kompaniya_id);
  if (!posInt(kompaniyaId)) return fail('CONTEXT_REQUIRED');
  if (Array.isArray(sess.kompaniyalar) && !sess.kompaniyalar.some(a => a.kompaniya_id === kompaniyaId) && sess.rol !== 'superadmin') return fail('FORBIDDEN', 403);

  try {
    if (so.amal === 'suhbat') {
      const xabarlar = xabarlarniTayyorla(so.xabarlar);
      if (!xabarlar) return fail('XABAR_INVALID');
      const joriy = suhbatJavobiniTekshir({ ishlar: so.ishlar }).ishlar;
      const text = [`Obyekt: ${clip(so.obyekt, 200) || 'ko‘rsatilmagan'}`,
        `Hozirgi ishlar ro'yxati (yangilang yoki to'ldiring):\n${JSON.stringify(joriy satisfies IshNiyati[])}`,
        `Suhbat:\n<SUHBAT>\n${xabarlar.map(x => `${x.rol === 'user' ? 'Foydalanuvchi' : 'Smetachi'}: ${x.matn}`).join('\n')}\n</SUHBAT>`].join('\n\n');
      const r = await aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_suhbat',
        { system: SMETACHI_TIZIM, text, tier: 'reasoning' as AiTier, temperature: 0.2, maxOutputTokens: 6000, jsonSchema: SUHBAT_SXEMA });
      const parsed = parse(r.text);
      const out = suhbatJavobiniTekshir(parsed);
      // Platform superadmin sees the raw model output when nothing usable came back (format diagnostics).
      const xom = sess.rol === 'superadmin' && (!parsed || !out.ishlar.length) ? r.text.slice(0, 3000) : undefined;
      return Response.json({ ok: true, ...out, model: r.model, versiya: SMETACHI_VERSIYA, ...(xom ? { xom } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (so.amal === 'tanla') {
      const sorovlar = sorovlarniTayyorla(so.sorovlar);
      if (!sorovlar) return fail('SOROV_INVALID');
      const r = await aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_ish_tanlash',
        { system: TANLOV_TIZIM, text: `<MALUMOT>\n${JSON.stringify(sorovlar)}\n</MALUMOT>`, tier: 'fast' as AiTier, temperature: 0, maxOutputTokens: 3000, jsonSchema: TANLOV_SXEMA });
      return Response.json({ ok: true, tanlovlar: tanlovlarniTekshir(parse(r.text), sorovlar), model: r.model }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return fail('AMAL_INVALID');
  } catch (e) {
    if (e instanceof AiByudjetXatosi) return fail(e.kod, 402, e.xabar);
    const p = aiPublicError(e);
    return fail(p.code === 'not_configured' ? 'AI_NOT_CONFIGURED' : 'AI_UNAVAILABLE', 503, p.message);
  }
};
