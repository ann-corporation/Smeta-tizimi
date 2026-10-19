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
 *   POST { amal: 'narx_internet', kompaniya_id, sorovlar: [{id, nom, birlik, kat}] (≤ 8), hudud? }
 *        → { ok, natijalar }                           (web-search model claims seller pages; every page is opened here and
 *                                                       the price + product marks must be on it — else "not verified")
 *   POST { amal: 'narx_tajriba' | 'narx_tajriba_yoz' } (platform price experience: accepted/rejected sources, practice check)
 *
 * Session actor + company membership; company AI budget checked before every model call and usage
 * recorded (agent platform accounting). Output is schema-validated; candidates the model did not receive
 * can never be chosen. Writes only the experience tables (memory, norm and price choices) via RPC.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { rpcData } from '../_shared/agent-rpc';
import { normaKalit, tajribaMatni, xotiraBloklari, type NormaTajriba, type XotiraDarajalari } from '../../src/lib/smeta-ai/tajriba';
import { aiPublicError, type AiRequest, type AiResponse, type AiTier } from '../_shared/ai';
import { aiHisobli, AiByudjetXatosi, type HisobEnv } from '../_shared/ai-hisobli';
import { exactPriceChoice, priceLane, utilityPriceAccepted, type RoutedPriceRequest } from '../_shared/smeta-ai-routing';
import { KOEF_TANLOV_TIZIM, KP_OQISH_TIZIM, NARX_TANLOV_TIZIM, SMETACHI_TIZIM, SMETACHI_VERSIYA, TANLOV_TIZIM } from '../../src/lib/smeta-ai/prompt';
import { foundationSourceContext, contradictsFoundationSource } from '../../src/lib/smeta-ai/normative-reference';
import { INTERNET_NARX_SXEMA, INTERNET_NARX_TIZIM, internetJavobiniTekshir, internetNarxi, qqsSiz, sahifadaMahsulotBor, sahifadaNarxBor,
  type InternetManba, type InternetNatija, type InternetSorov } from '../../src/lib/smeta-ai/internet-narx';
import { priceUnitFactor } from '../../src/lib/smeta-studio/resource-match';
import { vebOl, vebUrlTekshir } from '../_shared/agent-veb';
import { KOEF_TANLOV_SXEMA, KP_SXEMA, hajmSonlariniTekshir, koefTanlovlariniTekshir, type KoefSorovi, NARX_TANLOV_SXEMA, SUHBAT_SXEMA, kpJavobiniTekshir, TANLOV_SXEMA, jsonAjrat, manbaMaterialiniTekshir, narxTanlovlariniTekshir, suhbatJavobiniTekshir, tanlovlarniTekshir,
  type IshNiyati, type NarxSorovi, type SuhbatXabari, type TanlovSorovi } from '../../src/lib/smeta-ai/protokol';

/** Veb-qidiruvli model (OpenRouter `:online` — sahifalarni qidirib o'qiydi) — faqat internet narx agenti uchun. */
/** Tanlash/moslash vazifalari: OpenRouter tahlili (2026-10-19) — chiqishning ~80% ko'rinmas fikrlash edi; past daraja yetarli. */
export const TANLOV_FIKR = { effort: 'low' } as const;

export const INTERNET_MODEL = 'google/gemini-2.5-flash:online';

/**
 * Har qanday model bilan ishonchli chaqiruv (egasi 2026-10-09: "nima yozsam ham tushunilmadi deyapdi — professional
 * ishlasin"): 1) javobdan JSON mustahkam ajratiladi; 2) o'qilmasa — o'sha model "faqat JSON" ko'rsatmasi bilan bir
 * marta qayta; utility buzilsa primary ekspertga o'tadi. Uchinchi urinish ham ekspertda, arzon modelga tushirilmaydi.
 * Har chaqiruv kompaniya byudjeti/hisobidan o'tadi. length bilan kesilgan JSON muvaffaqiyat emas.
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
  let obj = r.finishReason === 'length' ? null : oquv(r.text);
  if (obj) return { r, obj };
  const tanlangan = r.model;
  const tuzatish: AiRequest = {
    ...req,
    workload: 'primary',
    ...(req.workload === 'utility' ? { model: undefined } : {}),
    ...(r.finishReason === 'length' ? { reasoning: { effort: 'low' as const } } : {}),
    system: `${req.system ?? ''}\n\nMUHIM: javobdagi normativ da’volar yuqoridagi tekshirilgan manbaga zid bo‘lmasin. Javob FAQAT bitta JSON obyekt bo'lsin — izoh, markdown va \`\`\` belgilarisiz.`,
    text: `${req.text}\n\nOldingi javob strukturasi yetarli emas. FAQAT sxemaga mos JSON qaytaring. Hisoblangan/taklif qilingan har bir ish ishlar massivida bo'lsin; faqat javob matnida ro'yxat yozmang. Oldingi ishlar ro'yxatini to'liq yangilang. Smeta tayyor yoki yozildi demang — bu faqat taklif.`,
  };
  r = await chaqir(tuzatish);
  obj = r.finishReason === 'length' ? null : oquv(r.text);
  if (obj) return { r, obj };
  // Never downgrade an expert/planner to a cheap model merely because JSON was malformed.
  r = await chaqir({ ...tuzatish, model: r.model, ...(r.finishReason === 'length' ? { reasoning: { effort: 'low' as const } } : {}) });
  obj = r.finishReason === 'length' ? null : oquv(r.text);
  if (obj) return { r, obj, ogohlantirish: `Javob qayta tekshirildi (${tanlangan} → ${r.model}).` };
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
    const qidiruv = (Array.isArray(s.qidiruv) ? s.qidiruv : []).slice(0, 3).map(q => clip(q, 160)).filter(Boolean);
    out.push({ id, tavsif: clip(s.tavsif, 1200), birlik: clip(s.birlik, 10) as TanlovSorovi['birlik'], material: s.material == null ? null : clip(s.material, 120), nomzodlar, ...(qidiruv.length ? { qidiruv } : {}) });
  }
  return out;
}
/** Price requests: ≤40 resources × ≤15 candidates the browser found (catalogue rows / company estimate rows). */
export function narxSorovlariniTayyorla(raw: unknown): RoutedPriceRequest[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 40) return null;
  const out: RoutedPriceRequest[] = [];
  for (const s of raw as Array<Record<string, unknown>>) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const sourceRows = Array.isArray(s?.nomzodlar) ? s.nomzodlar : [];
    const sourceComplete = sourceRows.length <= 15 && clip(s.nom, 400) === s.nom && clip(s.birlik ?? '', 30) === (s.birlik ?? '') &&
      sourceRows.every(n => { const r = (n ?? {}) as Record<string, unknown>; return clip(r.nom, 300) === r.nom &&
        clip(r.birlik ?? '', 30) === (r.birlik ?? '') && clip(r.manba, 160) === r.manba && clip(r.id, 60) === r.id; });
    const nomzodlar = sourceRows.slice(0, 15).map(n => {
      const r = (n ?? {}) as Record<string, unknown>;
      return { id: clip(r.id, 60), nom: clip(r.nom, 300), birlik: r.birlik == null ? null : clip(r.birlik, 30), narx: typeof r.narx === 'number' ? r.narx : NaN, manba: clip(r.manba, 160), ...(r.birlikBoshqa === true ? { birlikBoshqa: true } : {}) };
    }).filter(n => /^[A-Za-z0-9_:.-]{1,60}$/.test(n.id) && n.nom && Number.isFinite(n.narx) && n.narx >= 0);
    const id = clip(s?.id, 60);
    // An empty candidate list is allowed: the model then only proposes catalogue phrasings for a new search.
    if (id !== s.id || !/^[A-Za-z0-9_:.-]{1,60}$/.test(id) || !clip(s.nom, 400).trim() || out.some(x => x.id === id) ||
      new Set(nomzodlar.map(n => n.id)).size !== nomzodlar.length) return null;
    out.push({ id, nom: clip(s.nom, 400), birlik: s.birlik == null ? null : clip(s.birlik, 30), kat: s.kat == null ? null : clip(s.kat, 20), nomzodlar,
      ...(sourceComplete ? {} : { sourceComplete: false }) });
  }
  return out;
}

/** System, company and personal memory; before the three-level RPC exists, the company memory from the agent environment. */
async function xotiraOqi(env: Env, actor: number, kompaniyaId: number, superadmin = false): Promise<XotiraDarajalari & { superadmin?: boolean }> {
  const bosh: XotiraDarajalari = { tizim: [], kompaniya: [], foydalanuvchi: [] };
  const r = await rpcData(env, 't2_smeta_xotira_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId }).catch(() => null);
  const toza = (l: unknown) => (Array.isArray(l) ? l as Array<{ kalit: string; mazmun: string }> : []).filter(x => typeof x?.mazmun === 'string' && x.mazmun.trim() && x.mazmun !== '-');
  if (r?.ok) return { tizim: toza(r.data.tizim), kompaniya: toza(r.data.kompaniya), foydalanuvchi: toza(r.data.foydalanuvchi), ...(superadmin ? { superadmin: r.data.superadmin === true } : {}) };
  const m = await rpcData(env, 't2_agent_muhit_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: null }).catch(() => null);
  return m?.ok ? { ...bosh, kompaniya: toza(m.data.xotira).filter(x => x.kalit.startsWith('smeta.')) } : bosh;
}
/** Per work: the norms estimators put for similarly described works in uploaded estimates; empty when unavailable. */
async function amaliyotOqi(env: Env, actor: number, kompaniyaId: number, matnlar: string[]): Promise<Array<Array<{ kod: string; nom: string; soni: number; koef: string | null }>>> {
  if (!matnlar.length) return [];
  const r = await rpcData(env, 't2_ish_tajriba_qidir_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_matnlar: matnlar.slice(0, 40) }).catch(() => null);
  return r?.ok && Array.isArray(r.data.natijalar) ? r.data.natijalar as Array<Array<{ kod: string; nom: string; soni: number; koef: string | null }>> : [];
}
/** Platform practice for the candidate norms (keyed by normaKalit); empty when unavailable — the choice still works. */
async function tajribaOqi(env: Env, actor: number, kompaniyaId: number, kodlar: string[]): Promise<Record<string, NormaTajriba>> {
  const k = [...new Set(kodlar.filter(Boolean))].slice(0, 200);
  if (!k.length) return {};
  const r = await rpcData(env, 't2_norma_tajriba_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_kodlar: k }).catch(() => null);
  return r?.ok && r.data.normalar && typeof r.data.normalar === 'object' ? r.data.normalar as Record<string, NormaTajriba> : {};
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
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
      // Memory on three levels (system, company, this user) — read on every turn; a failed read never blocks the chat.
      const xotira = await xotiraOqi(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId);
      const { r, obj, ogohlantirish } = await ishonchliChaqir(chaqir,
        { system: SMETACHI_TIZIM + xotiraBloklari(xotira) + foundationSourceContext(xabarlar.filter(x => x.rol === 'user').map(x => x.matn).join('\n')),
          text: hujjatMatn ? `${text}\n\n<HUJJAT nom="${clip(so.hujjat_nom, 120)}">\n${hujjatMatn}\n</HUJJAT>\nILOVA: foydalanuvchi yuborgan loyiha hujjati yuqorida. Har pozitsiyani ishga aylantiring, hajmni hujjatdagi sondan oling, hajmIzoh da pozitsiya №/qatorni ko'rsating; noaniq joyni so'rang.`
            : loyihaFayl ? `${text}\n\nILOVA: foydalanuvchi loyiha hujjatini yubordi (${clip(sf?.nom, 120) || 'fayl'}). Uni o'qing: har pozitsiyani ishga aylantiring, hajmni hujjatdagi sondan oling, hajmIzoh da pozitsiya №/qator va sahifani ko'rsating; o'qib bo'lmagan joyni so'rang.` : text,
          ...(loyihaFayl ? { attachment: loyihaFayl } : {}), tier: 'reasoning' as AiTier, temperature: 0.2, maxOutputTokens: loyihaFayl || hujjatMatn ? 12000 : 6000, jsonSchema: SUHBAT_SXEMA },
        ['javob', 'ishlar', 'savollar', 'works', 'items']);
      const userText = xabarlar.filter(x => x.rol === 'user').map(x => x.matn).join('\n');
      const material = manbaMaterialiniTekshir(suhbatJavobiniTekshir(obj), userText);
      // Numbers are checkable against text sources; a drawing/PDF image is read by the model only, so it is not checked here.
      const out = loyihaFayl ? material : hajmSonlariniTekshir(material, [userText, hujjatMatn, smeta, JSON.stringify(joriy)].join('\n'));
      // Javob o'qildi (savol/izoh bo'lsa ham) — tushunildi. Faqat hech narsa o'qilmasa xom (diagnostika).
      const xom = obj ? undefined : r.text.slice(0, 3000);
      return Response.json({ ok: true, ...out, tushunildi: !!obj, model: r.model, versiya: SMETACHI_VERSIYA, ...(ogohlantirish ? { ogohlantirish } : {}), ...(xom ? { xom } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (so.amal === 'tanla') {
      const sorovlar = sorovlarniTayyorla(so.sorovlar);
      if (!sorovlar) return fail('SOROV_INVALID');
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_ish_tanlash', req);
      // Practice of all estimators on the platform: how often each candidate norm was used and with which coefficient.
      const tajriba = await tajribaOqi(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, sorovlar.flatMap(x => x.nomzodlar.map(n => n.kod)));
      // Uploaded estimates as a dictionary: how practitioners normed works described like this one (grows with every estimate).
      const amaliyot = await amaliyotOqi(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, sorovlar.map(x => (x.qidiruv ?? []).join(' ') || x.tavsif.slice(0, 200)));
      const malumot = sorovlar.map((x, i) => ({ ...x, nomzodlar: x.nomzodlar.map(n => { const t = tajribaMatni(tajriba[normaKalit(n.kod) ?? '']); return t ? { ...n, tajriba: t } : n; }),
        ...(amaliyot[i]?.length ? { amaliyot: amaliyot[i].map(a => `${a.kod} — ${a.nom} (${a.soni} smeta qatori${a.koef ? `, ${a.koef}` : ''})`) } : {}) }));
      const { r, obj } = await ishonchliChaqir(chaqir,
        { system: TANLOV_TIZIM, text: `<MALUMOT>\n${JSON.stringify(malumot)}\n</MALUMOT>`, tier: 'fast' as AiTier, temperature: 0, reasoning: TANLOV_FIKR, maxOutputTokens: 3000, jsonSchema: TANLOV_SXEMA },
        ['tanlovlar', 'choices']);
      const tanlovlar = tanlovlarniTekshir(obj, sorovlar);
      const xom = tanlovlar.every(x => !x.ishId) ? r.text.slice(0, 2000) : undefined;
      return Response.json({ ok: true, tanlovlar, tajriba, model: r.model, ...(xom ? { xom } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (so.amal === 'narx_tanla') {
      const sorovlar = narxSorovlariniTayyorla(so.sorovlar);
      if (!sorovlar) return fail('SOROV_INVALID');
      const hudud = clip(so.hudud, 80);
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_narx_tanlash', req);
      const by = new Map<string, ReturnType<typeof exactPriceChoice>>();
      const primary: NarxSorovi[] = [], utility: NarxSorovi[] = [];
      for (const s of sorovlar) {
        const lane = ctx.env.SMETA_AI_UTILITY_ENABLED === '0' ? 'primary' : priceLane(s);
        if (lane === 'local') by.set(s.id, exactPriceChoice(s));
        else (lane === 'utility' ? utility : primary).push(s);
      }
      const models: string[] = [];
      const localCount = by.size;
      const primaryCount = primary.length;
      const choose = async (rows: NarxSorovi[], workload: 'utility' | 'primary') => {
        const req: AiRequest = { system: NARX_TANLOV_TIZIM, text: `${hudud ? `Obyekt hududi: ${hudud}\n` : ''}<MALUMOT>\n${JSON.stringify(rows)}\n</MALUMOT>`,
          tier: 'fast', workload, temperature: 0, maxOutputTokens: 5000, jsonSchema: NARX_TANLOV_SXEMA };
        // One helper generation only. Don't pay for repairing a helper before paying for the expert again.
        if (workload === 'utility') {
          try {
            const r = await chaqir(req); models.push(r.model);
            return narxTanlovlariniTekshir(r.finishReason === 'length' ? null : jsonAjrat(r.text, ['tanlovlar', 'choices', 'results']), rows);
          } catch (e) {
            if (e instanceof AiByudjetXatosi) throw e; // No paid escalation past a denied wallet.
            return narxTanlovlariniTekshir(null, rows); // Service failure → same expert path as before.
          }
        }
        const { r, obj } = await ishonchliChaqir(chaqir, req, ['tanlovlar', 'choices', 'results']);
        models.push(r.model);
        return narxTanlovlariniTekshir(obj, rows);
      };
      if (utility.length) {
        const result = await choose(utility, 'utility');
        utility.forEach((s, i) => {
          if (utilityPriceAccepted(s, result[i])) by.set(s.id, result[i]);
          else primary.push(s);
        });
      }
      const escalated = primary.length - primaryCount;
      if (primary.length) for (const t of await choose(primary, 'primary')) by.set(t.id, t);
      return Response.json({ ok: true, tanlovlar: sorovlar.map(s => by.get(s.id)), model: models.at(-1) ?? 'local',
        routing: { local: localCount, utility: utility.length, primary: primary.length, escalated, models } }, { headers: { 'Cache-Control': 'no-store' } });
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
        { system: KOEF_TANLOV_TIZIM, text: `Ish sharoiti (foydalanuvchi): ${sharoit}\n<MALUMOT>\n${JSON.stringify(sorovlar)}\n</MALUMOT>`, tier: 'fast' as AiTier, temperature: 0, reasoning: TANLOV_FIKR, maxOutputTokens: 4000, jsonSchema: KOEF_TANLOV_SXEMA },
        ['tanlovlar', 'savol']);
      return Response.json({ ok: true, ...koefTanlovlariniTekshir(obj, sorovlar), model: r.model }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (so.amal === 'xotira') return Response.json({ ok: true, ...(await xotiraOqi(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, true)) }, { headers: { 'Cache-Control': 'no-store' } });
    if (so.amal === 'xotira_yoz') {
      const daraja = String(so.daraja ?? '');
      if (!['foydalanuvchi', 'kompaniya', 'tizim'].includes(daraja)) return fail('DARAJA_INVALID');
      const r = await rpcData(ctx.env, 't2_smeta_xotira_yoz_v1', { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId, p_daraja: daraja, p_kalit: clip(so.kalit, 80), p_mazmun: clip(so.mazmun, 1500) });
      // Before the three-level memory exists in the database, a company-level lesson still goes to the shared agent memory.
      if (!r.ok && r.status === 502 && daraja === 'kompaniya')
        return Response.json(await rpcData(ctx.env, 't2_agent_xotira_yoz_v1', { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId, p_profil: null, p_kalit: clip(so.kalit, 80), p_mazmun: clip(so.mazmun, 1500) }).then(x => x.data));
      return Response.json(r.data, { status: r.ok ? 200 : r.status });
    }
    if (so.amal === 'tajriba_yoz') {
      const tanlovlar = (Array.isArray(so.tanlovlar) ? so.tanlovlar.slice(0, 60) : []).map(t => { const x = (t ?? {}) as Record<string, unknown>;
        return { kod: clip(x.kod, 80), tavsif: clip(x.tavsif, 400), birlik: clip(x.birlik, 40), koef: clip(x.koef, 200), manba: x.manba === 'qolda' ? 'qolda' : 'ai' }; }).filter(t => t.kod.length >= 2);
      if (!tanlovlar.length) return fail('SOROV_INVALID');
      const r = await rpcData(ctx.env, 't2_smeta_tajriba_yoz_v1', { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId, p_tanlovlar: tanlovlar });
      return Response.json(r.data, { status: r.ok ? 200 : r.status });
    }
    // Platform price experience (owner 2026-10-17): accepted/rejected sources and the uploaded estimates' practice per resource.
    if (so.amal === 'narx_tajriba') {
      const sorovlar = (Array.isArray(so.sorovlar) ? so.sorovlar.slice(0, 300) : []).map(t => { const x = (t ?? {}) as Record<string, unknown>;
        const narx = Number(x.narx);
        return { resurs: clip(x.resurs, 300), ...(Number.isFinite(narx) && narx >= 0 ? { narx: String(Math.round(narx * 100) / 100) } : {}) }; }).filter(t => t.resurs.includes('|'));
      if (!sorovlar.length) return Response.json({ ok: true, resurslar: {} });
      const r = await rpcData(ctx.env, 't2_narx_tajriba_v1', { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId, p_sorovlar: sorovlar });
      return Response.json(r.data, { status: r.ok ? 200 : r.status, headers: { 'Cache-Control': 'no-store' } });
    }
    if (so.amal === 'narx_tajriba_yoz') {
      const yozuvlar = (Array.isArray(so.yozuvlar) ? so.yozuvlar.slice(0, 200) : []).map(t => { const x = (t ?? {}) as Record<string, unknown>;
        const narx = Number(x.narx);
        return { resurs: clip(x.resurs, 300), manba: clip(x.manba, 300), tur: clip(x.tur, 20), holat: clip(x.holat, 10),
          ...(Number.isFinite(narx) && narx >= 0 ? { narx: String(Math.round(narx * 100) / 100) } : {}) }; })
        .filter(t => t.resurs.includes('|') && t.manba.length >= 2 && ['katalog', 'kp', 'internet', 'qolda'].includes(t.tur) && ['qabul', 'rad'].includes(t.holat));
      if (!yozuvlar.length) return fail('SOROV_INVALID');
      const r = await rpcData(ctx.env, 't2_narx_tajriba_yoz_v1', { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId, p_yozuvlar: yozuvlar });
      return Response.json(r.data, { status: r.ok ? 200 : r.status });
    }
    // Internet price agent (owner 2026-10-17): the last resort for resources no source priced. The model (web search) only
    // CLAIMS a link and a price; every link is opened here and the price/product must be written on the page.
    if (so.amal === 'narx_internet') {
      const sorovlar: InternetSorov[] = (Array.isArray(so.sorovlar) ? so.sorovlar.slice(0, 8) : []).map(t => { const x = (t ?? {}) as Record<string, unknown>;
        return { id: clip(x.id, 60), nom: clip(x.nom, 300), birlik: clip(x.birlik, 30) || null, kat: clip(x.kat, 20) || null }; })
        .filter(s => /^[A-Za-z0-9_-]{1,60}$/.test(s.id) && s.nom.length >= 3 && s.kat !== 'ЧЕЛ');
      if (!sorovlar.length) return fail('SOROV_INVALID');
      const hudud = clip(so.hudud, 80);
      const chaqir = (req: AiRequest) => aiHisobli(ctx.env, sess.foydalanuvchi_id as number, kompaniyaId, 'smeta_ai', 'smeta_narx_internet', { ...req, model: INTERNET_MODEL });
      const { r, obj } = await ishonchliChaqir(chaqir,
        { system: INTERNET_NARX_TIZIM, text: `${hudud ? `Obyekt hududi: ${hudud}\n` : ''}<RESURSLAR>\n${JSON.stringify(sorovlar)}\n</RESURSLAR>`,
          tier: 'fast' as AiTier, temperature: 0, reasoning: TANLOV_FIKR, maxOutputTokens: 4000, jsonSchema: INTERNET_NARX_SXEMA }, ['natijalar']);
      const davolar = internetJavobiniTekshir(obj, sorovlar);
      const natijalar: InternetNatija[] = await Promise.all(sorovlar.map(async s => {
        const d = davolar.get(s.id) ?? { davolar: [], izoh: 'model javob bermadi' };
        const manbalar: InternetManba[] = await Promise.all(d.davolar.map(async (v): Promise<InternetManba> => {
          const u = vebUrlTekshir(v.url);
          const koef = priceUnitFactor(v.birlik, s.birlik);
          const asos = { ...v, domen: u.ok ? u.domen : '', koef, smetaNarx: koef == null ? null : Math.round(qqsSiz(v) * koef * 100) / 100 };
          if (!u.ok) return { ...asos, tekshirildi: false, sabab: u.xato };
          if (koef == null) return { ...asos, tekshirildi: false, sabab: `birlik mos emas (${v.birlik ?? '—'} → ${s.birlik ?? '—'})` };
          // Any public https page (SSRF-checked, text only, 1 MB, 8 s); its text is scanned by code only, never sent to a model.
          const p = await vebOl(v.url, async () => true);
          if (!p.ok) return { ...asos, tekshirildi: false, sabab: p.xato };
          if (!sahifadaNarxBor(p.matn, v.narx)) return { ...asos, url: p.url, tekshirildi: false, sabab: 'sahifada bu narx topilmadi' };
          if (!sahifadaMahsulotBor(p.matn, s.nom)) return { ...asos, url: p.url, tekshirildi: false, sabab: 'sahifada mahsulot belgilari (marka/o‘lcham) topilmadi' };
          return { ...asos, url: p.url, tekshirildi: true, sabab: null };
        }));
        return { id: s.id, narx: internetNarxi(manbalar), manbalar, izoh: d.izoh };
      }));
      return Response.json({ ok: true, natijalar, model: r.model }, { headers: { 'Cache-Control': 'no-store' } });
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
          tier: 'fast' as AiTier, temperature: 0, reasoning: TANLOV_FIKR, maxOutputTokens: 16000, jsonSchema: KP_SXEMA },
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
