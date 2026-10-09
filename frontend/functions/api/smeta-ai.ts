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
import { aiPublicError, type AiRequest, type AiResponse, type AiTier } from '../_shared/ai';
import { aiHisobli, AiByudjetXatosi, type HisobEnv } from '../_shared/ai-hisobli';
import { SMETACHI_TIZIM, SMETACHI_VERSIYA, TANLOV_TIZIM } from '../../src/lib/smeta-ai/prompt';
import { foundationSourceContext, contradictsFoundationSource } from '../../src/lib/smeta-ai/normative-reference';
import { SUHBAT_SXEMA, TANLOV_SXEMA, jsonAjrat, manbaMaterialiniTekshir, suhbatJavobiniTekshir, tanlovlarniTekshir, type IshNiyati, type SuhbatXabari, type TanlovSorovi } from '../../src/lib/smeta-ai/protokol';

/** Javob formatiga ishonchli amal qiladigan, tekshirilgan platforma modeli (tanlangan model formatni buzsa zaxira). */
export const ZAXIRA_MODEL = 'google/gemini-2.5-flash-lite';

/**
 * Har qanday model bilan ishonchli chaqiruv (egasi 2026-10-09: "nima yozsam ham tushunilmadi deyapdi — professional
 * ishlasin"): 1) javobdan JSON mustahkam ajratiladi; 2) o'qilmasa — o'sha model "faqat JSON" ko'rsatmasi bilan bir
 * marta qayta; 3) yana o'qilmasa — zaxira model. Har chaqiruv kompaniya byudjeti/hisobidan o'tadi.
 */
export async function ishonchliChaqir(chaqir: (req: AiRequest) => Promise<AiResponse>, req: AiRequest, kalitlar: readonly string[]):
  Promise<{ r: AiResponse; obj: Record<string, unknown> | null; ogohlantirish?: string }> {
  let r = await chaqir(req);
  const oquv = (text: string) => {
    const v = jsonAjrat(text, kalitlar);
    if (!v || !kalitlar.some(k => k in v)) return null;
    if (kalitlar.includes('ishlar')) {
      const parsed = suhbatJavobiniTekshir(v);
      if (req.system?.includes('TEKSHIRILGAN MANBA:') && contradictsFoundationSource(parsed.javob)) return null;
      // A prose promise of a completed estimate is not a structured estimate.
      if (!parsed.ishlar.length && /(?:smeta|смет|hisob|рассчит|fundament|фундамент|kotlovan|котлован|armatura|арматур)/i.test(parsed.javob)) return null;
    }
    return v;
  };
  let obj = oquv(r.text);
  if (obj) return { r, obj };
  const tanlangan = r.model;
  const tuzatish: AiRequest = {
    ...req,
    system: `${req.system ?? ''}\n\nMUHIM: javobdagi normativ da’volar yuqoridagi tekshirilgan manbaga zid bo‘lmasin. Javob FAQAT bitta JSON obyekt bo'lsin — izoh, markdown va \`\`\` belgilarisiz.`,
    text: `${req.text}\n\nOldingi javob strukturasi yetarli emas. FAQAT sxemaga mos JSON qaytaring. Hisoblangan/taklif qilingan har bir ish ishlar massivida bo'lsin; faqat javob matnida ro'yxat yozmang. Oldingi ishlar ro'yxatini to'liq yangilang. Smeta tayyor yoki yozildi demang — bu faqat taklif.`,
  };
  r = await chaqir(tuzatish);
  obj = oquv(r.text);
  if (obj) return { r, obj };
  if (tanlangan !== ZAXIRA_MODEL) {
    r = await chaqir({ ...tuzatish, model: ZAXIRA_MODEL });
    obj = oquv(r.text);
    if (obj) return { r, obj, ogohlantirish: `Tanlangan model (${tanlangan}) javob formatiga amal qilmadi — bu safar tekshirilgan model (${ZAXIRA_MODEL}) ishlatildi.` };
  }
  return { r, obj: null };
}

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
    out.push({ id, tavsif: clip(s.tavsif, 1200), birlik: clip(s.birlik, 10) as TanlovSorovi['birlik'], material: s.material == null ? null : clip(s.material, 120), nomzodlar });
  }
  return out;
}

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
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_suhbat', req);
      const { r, obj, ogohlantirish } = await ishonchliChaqir(chaqir,
        { system: SMETACHI_TIZIM + foundationSourceContext(xabarlar.filter(x => x.rol === 'user').map(x => x.matn).join('\n')), text, tier: 'reasoning' as AiTier, temperature: 0.2, maxOutputTokens: 6000, jsonSchema: SUHBAT_SXEMA },
        ['javob', 'ishlar', 'savollar', 'works', 'items']);
      const out = manbaMaterialiniTekshir(suhbatJavobiniTekshir(obj), xabarlar.filter(x => x.rol === 'user').map(x => x.matn).join('\n'));
      // Javob o'qildi (savol/izoh bo'lsa ham) — tushunildi. Faqat hech narsa o'qilmasa xom (diagnostika).
      const xom = obj ? undefined : r.text.slice(0, 3000);
      return Response.json({ ok: true, ...out, tushunildi: !!obj, model: r.model, versiya: SMETACHI_VERSIYA, ...(ogohlantirish ? { ogohlantirish } : {}), ...(xom ? { xom } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (so.amal === 'tanla') {
      const sorovlar = sorovlarniTayyorla(so.sorovlar);
      if (!sorovlar) return fail('SOROV_INVALID');
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_ish_tanlash', req);
      const { r, obj } = await ishonchliChaqir(chaqir,
        { system: TANLOV_TIZIM, text: `<MALUMOT>\n${JSON.stringify(sorovlar)}\n</MALUMOT>`, tier: 'fast' as AiTier, temperature: 0, maxOutputTokens: 3000, jsonSchema: TANLOV_SXEMA },
        ['tanlovlar', 'choices']);
      const tanlovlar = tanlovlarniTekshir(obj, sorovlar);
      const xom = tanlovlar.every(x => !x.ishId) ? r.text.slice(0, 2000) : undefined;
      return Response.json({ ok: true, tanlovlar, model: r.model, ...(xom ? { xom } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return fail('AMAL_INVALID');
  } catch (e) {
    if (e instanceof AiByudjetXatosi) return fail(e.kod, 402, e.xabar);
    const p = aiPublicError(e);
    return fail(p.code === 'not_configured' ? 'AI_NOT_CONFIGURED' : 'AI_UNAVAILABLE', 503, p.message);
  }
};
