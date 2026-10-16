/**
 * smeta-ai.ts — Smetachi AI worker (proposals only; the estimate is changed by the user in the studio).
 *
 *   POST { amal: 'suhbat', kompaniya_id, xabarlar: [{rol, matn}], ishlar: IshNiyati[], obyekt?: string }
 *        → { ok, javob, savollar, ishlar }            (reasoning tier: decomposition, questions, formulas)
 *   POST { amal: 'tanla', kompaniya_id, sorovlar: TanlovSorovi[] }
 *        → { ok, tanlovlar }                           (fast tier: pick a catalogue work among candidates; may return
 *                                                       new normative phrasings for a second search round)
 *   POST { amal: 'narx_tanla', kompaniya_id, sorovlar: NarxSorovi[], hudud? }
 *        → { ok, tanlovlar }                           (fast tier: pick a price candidate per resource by MEANING)
 *   POST { amal: 'koef_tanla', kompaniya_id, sharoit, sorovlar: KoefSorovi[] }
 *        → { ok, tanlovlar, savol }                    (picks normative coefficients for the stated conditions, only from the list)
 *   POST { amal: 'kp_oqi', kompaniya_id, fayl?: {mimeType, data(base64)}, matn? }
 *        → { ok, kp }                                  (reads a КП / price list: rows, supplier, VAT state; nothing stored)
 *
 * Session actor + company membership; company AI budget checked before every model call and usage
 * recorded (agent platform accounting). Output is schema-validated; candidates the model did not receive
 * can never be chosen. No database or R2 writes.
 */
import { tekshir } from '../_shared/auth';
import { rpcData } from '../_shared/agent-rpc';
import { aiPublicError, type AiRequest, type AiResponse, type AiTier } from '../_shared/ai';
import { aiHisobli, AiByudjetXatosi, type HisobEnv } from '../_shared/ai-hisobli';
import { KOEF_TANLOV_TIZIM, KP_OQISH_TIZIM, NARX_TANLOV_TIZIM, SMETACHI_TIZIM, SMETACHI_VERSIYA, TANLOV_TIZIM } from '../../src/lib/smeta-ai/prompt';
import { foundationSourceContext, contradictsFoundationSource } from '../../src/lib/smeta-ai/normative-reference';
import { KOEF_TANLOV_SXEMA, KP_SXEMA, koefTanlovlariniTekshir, type KoefSorovi, NARX_TANLOV_SXEMA, SUHBAT_SXEMA, kpJavobiniTekshir, TANLOV_SXEMA, jsonAjrat, manbaMaterialiniTekshir, narxTanlovlariniTekshir, suhbatJavobiniTekshir, tanlovlarniTekshir,
  type IshNiyati, type NarxSorovi, type SuhbatXabari, type TanlovSorovi } from '../../src/lib/smeta-ai/protokol';

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
      // A prose promise of a completed estimate is not a structured estimate. A question about the work
      // ("Fundament o'lchami qancha?") IS a valid reply — only claims of a finished/computed result are rejected.
      if (!parsed.ishlar.length && /(?:smeta\s+tayyor|tayyorladim|hisobladim|hisoblab\s+chiqdim|yozib\s+qo['‘’]?ydim|смета\s+готова|рассчитал|составил\s+смет)/i.test(parsed.javob)) return null;
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
      return { id: clip(r.id, 40), kod: clip(r.kod, 60), nom: clip(r.nom, 400), birlik: r.birlik == null ? null : clip(r.birlik, 30),
        jadval: r.jadval == null ? null : clip(r.jadval, 200), toplam: r.toplam == null ? null : clip(r.toplam, 120) };
    }).filter(n => /^[A-Za-z0-9_:.-]{1,40}$/.test(n.id));
    const id = clip(s?.id, 40);
    // No candidates yet → the model may only answer with new normative phrasings (second search round).
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
    out.push({ id, tavsif: clip(s.tavsif, 1200), birlik: clip(s.birlik, 10) as TanlovSorovi['birlik'], material: s.material == null ? null : clip(s.material, 120), nomzodlar });
  }
  return out;
}
/** Price requests: ≤40 resources × ≤15 candidates the browser found (catalogue rows / company estimate rows). */
export function narxSorovlariniTayyorla(raw: unknown): NarxSorovi[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 40) return null;
  const out: NarxSorovi[] = [];
  for (const s of raw as Array<Record<string, unknown>>) {
    const nomzodlar = (Array.isArray(s?.nomzodlar) ? s.nomzodlar : []).slice(0, 15).map(n => {
      const r = (n ?? {}) as Record<string, unknown>;
      return { id: clip(r.id, 60), nom: clip(r.nom, 300), birlik: r.birlik == null ? null : clip(r.birlik, 30), narx: Number(r.narx), manba: clip(r.manba, 160), ...(r.birlikBoshqa === true ? { birlikBoshqa: true } : {}) };
    }).filter(n => /^[A-Za-z0-9_:.-]{1,60}$/.test(n.id) && n.nom && Number.isFinite(n.narx) && n.narx >= 0);
    const id = clip(s?.id, 60);
    // An empty candidate list is allowed: the model then only proposes catalogue phrasings for a new search.
    if (!/^[A-Za-z0-9_:.-]{1,60}$/.test(id) || !clip(s.nom, 400).trim()) return null;
    out.push({ id, nom: clip(s.nom, 400), birlik: s.birlik == null ? null : clip(s.birlik, 30), kat: s.kat == null ? null : clip(s.kat, 20), nomzodlar });
  }
  return out;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess || !posInt(sess.foydalanuvchi_id)) return fail('AUTH_REQUIRED', 401);
  const raw = await ctx.request.text();
  // A КП file (PDF/image, base64) may be up to ~7 MB; every other request stays small.
  if (raw.length > 10_000_000) return fail('BODY_TOO_LARGE', 413);
  let so: Record<string, unknown>;
  try { so = JSON.parse(raw); } catch { return fail('BODY_INVALID'); }
  // A КП or a project document (image/PDF) travels as base64; other requests stay small.
  if (so.amal !== 'kp_oqi' && !(so.amal === 'suhbat' && (so.fayl || so.hujjat_matn)) && raw.length > 300_000) return fail('BODY_TOO_LARGE', 413);
  const kompaniyaId = Number(so.kompaniya_id);
  if (!posInt(kompaniyaId)) return fail('CONTEXT_REQUIRED');
  if (Array.isArray(sess.kompaniyalar) && !sess.kompaniyalar.some(a => a.kompaniya_id === kompaniyaId) && sess.rol !== 'superadmin') return fail('FORBIDDEN', 403);

  try {
    if (so.amal === 'suhbat') {
      const xabarlar = xabarlarniTayyorla(so.xabarlar);
      // Owner 2026-10-16: "spetsifikatsiya yoki loyihani tashlab bersam AI o'zi tushunib smetani hal qilsin" — the drawing,
      // specification or bill of quantities (image / PDF) goes to the model with this turn.
      const sf = (so.fayl ?? null) as { mimeType?: unknown; data?: unknown; nom?: unknown } | null;
      const loyihaFayl = sf && typeof sf.mimeType === 'string' && typeof sf.data === 'string' && /^(image\/(png|jpeg|webp)|application\/pdf)$/.test(sf.mimeType) && /^[A-Za-z0-9+/=]+$/.test(sf.data.slice(0, 200))
        ? { mimeType: sf.mimeType, data: sf.data } : null;
      // Excel / Word documents arrive as their text (read in the browser).
      const hujjatMatn = clip(so.hujjat_matn, 110_000).trim();
      if (!xabarlar) return fail('XABAR_INVALID');
      const joriy = suhbatJavobiniTekshir({ ishlar: so.ishlar }).ishlar;
      // The estimate the user is building (owner 2026-10-15: "butun yasalayotgan smetani AI o'qib tura olishi kerak").
      const smeta = clip(so.smeta, 16000).trim();
      const text = [`Obyekt: ${clip(so.obyekt, 200) || 'ko‘rsatilmagan'}`,
        ...(smeta ? [`Foydalanuvchi qurayotgan smeta (Studio holati — bo'limlar, ishlar, hajmlar, koeffitsientlar, narxlar):\n<SMETA>\n${smeta}\n</SMETA>`] : []),
        `Hozirgi ishlar ro'yxati (yangilang yoki to'ldiring):\n${JSON.stringify(joriy satisfies IshNiyati[])}`,
        // An empty list after earlier replies means nothing reached the studio: the works must be (re)stated in "ishlar".
        ...(joriy.length ? [] : ["DIQQAT: taklif qilingan ishlar ro'yxati BO'SH — oldingi javoblarda tasvirlangan bo'lsa ham hech biri smetaga yetmagan. Foydalanuvchi aytgan barcha ishlarni \"ishlar\" massivida to'liq bering."]),
        `Suhbat:\n<SUHBAT>\n${xabarlar.map(x => `${x.rol === 'user' ? 'Foydalanuvchi' : 'Smetachi'}: ${x.matn}`).join('\n')}\n</SUHBAT>`].join('\n\n');
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_suhbat', req);
      // Company memory (what this company's users taught the estimator) — read on every turn; a failed read never blocks the chat.
      const muhit = await rpcData(ctx.env, 't2_agent_muhit_v1', { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId, p_profil: null }).catch(() => null);
      const xotiraMatn = ((muhit?.ok ? muhit.data.xotira : []) as Array<{ kalit: string; mazmun: string }> | undefined ?? [])
        .filter(x => x.kalit.startsWith('smeta.') && x.mazmun.trim() && x.mazmun !== '-').slice(0, 40).map(x => `- ${x.mazmun.slice(0, 400)}`).join('\n');
      const { r, obj, ogohlantirish } = await ishonchliChaqir(chaqir,
        { system: SMETACHI_TIZIM + (xotiraMatn ? `\n\n<KOMPANIYA XOTIRASI>\n${xotiraMatn}\n</KOMPANIYA XOTIRASI>` : '') + foundationSourceContext(xabarlar.filter(x => x.rol === 'user').map(x => x.matn).join('\n')),
          text: hujjatMatn ? `${text}\n\n<HUJJAT nom="${clip(so.hujjat_nom, 120)}">\n${hujjatMatn}\n</HUJJAT>\nILOVA: foydalanuvchi yuborgan loyiha hujjati yuqorida. Har pozitsiyani ishga aylantiring, hajmni hujjatdagi sondan oling, hajmIzoh da pozitsiya №/qatorni ko'rsating; noaniq joyni so'rang.`
            : loyihaFayl ? `${text}\n\nILOVA: foydalanuvchi loyiha hujjatini yubordi (${clip(sf?.nom, 120) || 'fayl'}). Uni o'qing: har pozitsiyani ishga aylantiring, hajmni hujjatdagi sondan oling, hajmIzoh da pozitsiya №/qator va sahifani ko'rsating; o'qib bo'lmagan joyni so'rang.` : text,
          ...(loyihaFayl ? { attachment: loyihaFayl } : {}), tier: 'reasoning' as AiTier, temperature: 0.2, maxOutputTokens: loyihaFayl || hujjatMatn ? 12000 : 6000, jsonSchema: SUHBAT_SXEMA },
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
    if (so.amal === 'narx_tanla') {
      const sorovlar = narxSorovlariniTayyorla(so.sorovlar);
      if (!sorovlar) return fail('SOROV_INVALID');
      const hudud = clip(so.hudud, 80);
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_narx_tanlash', req);
      const { r, obj } = await ishonchliChaqir(chaqir,
        { system: NARX_TANLOV_TIZIM, text: `${hudud ? `Obyekt hududi: ${hudud}\n` : ''}<MALUMOT>\n${JSON.stringify(sorovlar)}\n</MALUMOT>`, tier: 'fast' as AiTier, temperature: 0, maxOutputTokens: 5000, jsonSchema: NARX_TANLOV_SXEMA },
        ['tanlovlar', 'choices', 'results']);
      return Response.json({ ok: true, tanlovlar: narxTanlovlariniTekshir(obj, sorovlar), model: r.model }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (so.amal === 'koef_tanla') {
      const sharoit = clip(so.sharoit, 2000).trim();
      const raw = Array.isArray(so.sorovlar) ? so.sorovlar.slice(0, 40) as Array<Record<string, unknown>> : [];
      const sorovlar: KoefSorovi[] = raw.map(s => ({ id: clip(s?.id, 60), ish: clip(s?.ish, 400),
        nomzodlar: (Array.isArray(s?.nomzodlar) ? s.nomzodlar : []).slice(0, 40).map(n => ({ kod: clip((n as Record<string, unknown>)?.kod, 40), shart: clip((n as Record<string, unknown>)?.shart, 700) })).filter(n => n.kod) }))
        .filter(s => /^[A-Za-z0-9_-]{1,60}$/.test(s.id) && s.nomzodlar.length);
      if (!sharoit || !sorovlar.length) return fail('SOROV_INVALID');
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_koef_tanlash', req);
      const { r, obj } = await ishonchliChaqir(chaqir,
        { system: KOEF_TANLOV_TIZIM, text: `Ish sharoiti (foydalanuvchi): ${sharoit}\n<MALUMOT>\n${JSON.stringify(sorovlar)}\n</MALUMOT>`, tier: 'fast' as AiTier, temperature: 0, maxOutputTokens: 4000, jsonSchema: KOEF_TANLOV_SXEMA },
        ['tanlovlar', 'savol']);
      return Response.json({ ok: true, ...koefTanlovlariniTekshir(obj, sorovlar), model: r.model }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (so.amal === 'kp_oqi') {
      const f = (so.fayl ?? null) as { mimeType?: unknown; data?: unknown } | null;
      const matn = clip(so.matn, 120_000).trim();
      const fayl = f && typeof f.mimeType === 'string' && typeof f.data === 'string' && /^(image\/(png|jpeg|webp)|application\/pdf)$/.test(f.mimeType) && /^[A-Za-z0-9+/=]+$/.test(f.data.slice(0, 200))
        ? { mimeType: f.mimeType, data: f.data } : null;
      if (!fayl && !matn) return fail('KP_FAYL_INVALID');
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_kp_oqish', req);
      const { r, obj } = await ishonchliChaqir(chaqir,
        { system: KP_OQISH_TIZIM, text: matn ? `<HUJJAT>\n${matn}\n</HUJJAT>` : 'Ilova qilingan hujjatni o‘qing.', ...(fayl ? { attachment: fayl } : {}),
          tier: 'fast' as AiTier, temperature: 0, maxOutputTokens: 16000, jsonSchema: KP_SXEMA },
        ['qatorlar', 'nds_holati']);
      return Response.json({ ok: true, kp: kpJavobiniTekshir(obj), model: r.model }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return fail('AMAL_INVALID');
  } catch (e) {
    if (e instanceof AiByudjetXatosi) return fail(e.kod, 402, e.xabar);
    const p = aiPublicError(e);
    return fail(p.code === 'not_configured' ? 'AI_NOT_CONFIGURED' : 'AI_UNAVAILABLE', 503, p.message);
  }
};
