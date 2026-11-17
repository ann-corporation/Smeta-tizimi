/**
 * /api/ombor-buyruq — omborchi uchun YAGONA server nuqtasi (web, Android, Telegram bot, kelajakdagi Windows ilova).
 *
 * Amallar (hammasi POST; JSON yoki ovoz uchun multipart):
 *   kontekst  — foydalanuvchiga ochiq omborlar ro'yxati
 *   qoldiq    — birlashgan ostatka (variantlar bitta guruhda, noaniq qidiruv)            RPC t2_ombor_qoldiq_v2
 *   royxat    — kirim/chiqim harakatlari                                                  RPC t2_ombor_harakat_royxat_v1
 *   tarix     — material kartasi (guruh tarixi)                                           RPC t2_ombor_tarix_v1
 *   yoz       — tezkor kirim/chiqim (web formasi; operation_id bilan idempotent)           RPC t2_ombor_prixod_v1 / _chiqim_v1
 *   tuzat     — aniq yozuvni tuzatish/bekor (sabab majburiy)                              RPC t2_ombor_tuzat_v1
 *   eksport   — ostatka .xlsx (server hujjat yo'li: token serverSarfla orqali yechiladi, qayta yuklash bepul)
 *   alias     — variantlarni tasdiqlash (t2_material_alias ga)                            RPC t2_ombor_alias_tasdiq_v1
 *   tahlil    — matn yoki OVOZ → STT (mavjud /api/ombor-ovoz, ElevenLabs) → oddiy tahlil, kerak bo'lsa LLM (aiHisobli: limit + token yechish)
 *               → server moslashtiruvchisi → PREVIEW kartasi + tasdiq tokeni. HECH NARSA YOZILMAYDI.
 *   tasdiq    — token bilan tasdiqlash → RPC. Token: HMAC, 15 daqiqa, aktor/ombor bog'langan, operation_id ichida (qayta bosish takror yozmaydi).
 *
 * Ruxsat: a'zolik + warehouse.write|document.write (yozish) / warehouse.read|write|document.read (o'qish) — middleware + RPC ichida takror.
 * Audit: yozuvchi RPC lar t2_audit_yoz ga yozadi; tahlil/tasdiq bu yerda ham auditlanadi (matn EMAS — faqat uzunlik/amal/holat).
 */
import { tekshir, type Sess } from '../_shared/auth';
import { cachedAuthority, yopiqModul } from '../_shared/permission-policy';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { AiByudjetXatosi, aiHisobli, type HisobEnv } from '../_shared/ai-hisobli';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { LLM_TIZIM_MATNI, buyruqTekshir, llmJsonOl, oddiyTahlil, tokenTekshir, tokenYarat, type Buyruq } from '../_shared/ombor-buyruq-yadro';
import { onRequestPost as ovozPost } from './ombor-ovoz';
import { birlikKaliti } from '../../src/lib/ombor-moslash/moslash';
import { serverQaytar, serverSarfla, sarfRad } from '../_shared/hujjat-sarf';
import { RasmiyVaraq, rasmiyKitob } from '../../src/lib/hujjat-yozuvchi/rasmiy';

type Env = Omit<HisobEnv, 'SUPABASE_URL' | 'SUPABASE_KEY'> & { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; ELEVENLABS_API_KEY?: string; ELEVENLABS_COMPANY_IDS?: string };
type Context = Parameters<PagesFunction<Env>>[0];
const MAX_BODY = 8 * 1024 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (code: string, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, code, ...extra }, status);
const butun = (v: unknown): number | null => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function aktor(ctx: Context): Promise<Sess | Response> {
  const cached = cachedAuthority(ctx);
  if (cached) return cached;
  if (!ctx.env.SESSIYA_KALIT) return fail('CONFIG_UNAVAILABLE', 503);
  let signed: Sess | null;
  try { signed = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT); } catch { return fail('AUTHORITY_UNAVAILABLE', 503); }
  if (!signed) return fail('AUTH_REQUIRED', 401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return fail('AUTHORITY_UNAVAILABLE', 503);
  const current = await roleAuthority(signed, ctx.env);
  if (!current && sessiyaYaroqsizmi(signed)) return yaroqsizSessiyaJavob();
  return current ?? fail('AUTHORITY_UNAVAILABLE', 503);
}

/** Yozish: warehouse.write | document.write; o'qish: warehouse.read | warehouse.write | document.read. Aniq rad etilgan ruxsat ustun. */
function ruxsat(s: Sess, kid: number, yozish: boolean): Response | null {
  if (!s.foydalanuvchi_id || !s.permissionsByCompany) return fail('AUTHORITY_UNAVAILABLE', 503);
  if (!s.kompaniyalar?.some((c) => c.kompaniya_id === kid)) return fail('PERMISSION_DENIED', 403);
  const bor = s.permissionsByCompany[kid] ?? [];
  const rad = s.explicitDenialsByCompany?.[kid] ?? [];
  const kerak = yozish ? ['warehouse.write', 'document.write'] : ['warehouse.read', 'warehouse.write', 'document.read'];
  const ruxsatli = kerak.find((p) => bor.includes(p) && !rad.includes(p));
  if (!ruxsatli) return fail('PERMISSION_DENIED', 403);
  if (yopiqModul(ruxsatli, [kid], s.modullarOffByCompany)) return fail('MODULE_DISABLED', 403);
  return null;
}

async function rpc<T = Record<string, unknown>>(env: Env, nom: string, yuk: Record<string, unknown>): Promise<{ status: number; data: T | null }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return { status: 503, data: null };
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  }).catch(() => null);
  if (!r) return { status: 503, data: null };
  return { status: r.status, data: await r.json().catch(() => null) as T | null };
}
async function rest<T>(env: Env, yol: string): Promise<T[] | null> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/' + yol, { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY } }).catch(() => null);
  return r && r.ok ? await r.json().catch(() => null) as T[] | null : null;
}
const rpcNatija = (r: { status: number; data: Record<string, unknown> | null }): Response => {
  if (r.status === 403 || (r.data && (r.data as { code?: string }).code === '42501')) return fail('PERMISSION_DENIED', 403);
  if (!r.data || r.status >= 500) return fail('SERVER_XATO', 502);
  if (r.status >= 400) return fail(String((r.data as { code?: string }).code ?? 'RPC_XATO'), 400);
  return json(r.data, (r.data as { ok?: boolean }).ok === false ? 409 : 200);
};
async function audit(env: Env, kid: number, sklad: number, amal: string, aktorId: number, tafsilot: string) {
  await rpc(env, 't2_audit_yoz', { p_kompaniya_id: kid, p_amal_turi: amal, p_modul: 'sklad', p_obyekt_id: null, p_tafsilot: ('sklad_id=' + sklad + '; ' + tafsilot).slice(0, 500), p_kim: 'actor:' + aktorId, p_ip: null }).catch(() => null);
}
const xesh = async (s: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');

async function tanaOl(req: Request): Promise<{ b: Record<string, unknown>; audio: Blob | null } | Response> {
  const ct = req.headers.get('Content-Type') ?? '';
  if (/multipart\/form-data/i.test(ct)) {
    if (Number(req.headers.get('Content-Length')) > MAX_BODY) return fail('AUDIO_TOO_LARGE', 413);
    let f: FormData; try { f = await req.formData(); } catch { return fail('BODY_INVALID', 400); }
    const a: unknown = f.get('audio'); const b: Record<string, unknown> = {};
    for (const [k, v] of f.entries()) if (typeof v === 'string') b[k] = v;
    if (a instanceof Blob && a.size > MAX_BODY) return fail('AUDIO_TOO_LARGE', 413);
    return { b, audio: a instanceof Blob && a.size > 0 ? a : null };
  }
  try { const b = await req.json(); return b && typeof b === 'object' && !Array.isArray(b) ? { b: b as Record<string, unknown>, audio: null } : fail('BODY_INVALID', 400); }
  catch { return fail('BODY_INVALID', 400); }
}

type Guruh = { kalit: string; nomi: string; birligi: string; tur: string | null; qoldiq: number; kirim: number; chiqim: number; variantlar_soni: number; ball: number; oxirgi_sana: string | null };
type Nomzod = { nomi: string; birligi: string; qoldiq: number; ball: number; kalit: string; variantlar_soni: number };
const nomzodga = (g: Guruh): Nomzod => ({ nomi: g.nomi, birligi: g.birligi, qoldiq: g.qoldiq, ball: g.ball, kalit: g.kalit, variantlar_soni: g.variantlar_soni });

/** Server moslashtiruvchisi: qidiruv → avtomatik tanlov (aniq va yakka) yoki nomzodlar ro'yxati. */
async function moslash(env: Env, aktorId: number, kid: number, sid: number, nomi: string, birlik: string | null) {
  const r = await rpc<{ ok?: boolean; qatorlar?: Guruh[] }>(env, 't2_ombor_qoldiq_v2', { p_actor_id: aktorId, p_kompaniya_id: kid, p_sklad_id: sid, p_filtr: { qidir: nomi, musbat: '0' }, p_limit: 6, p_offset: 0 });
  const q = r.data?.ok ? (r.data.qatorlar ?? []) : null;
  if (!q) return { xato: true as const, nomzodlar: [] as Nomzod[], tanlangan: null as Nomzod | null, holat: 'xato' as const };
  // birlik mos kelganlar yuqoriga (chiqarilmaydi)
  const bk = birlik ? birlikKaliti(birlik) : null;
  const tartib = [...q].sort((a, b) => (b.ball * (bk && birlikKaliti(b.birligi) !== bk ? 0.6 : 1)) - (a.ball * (bk && birlikKaliti(a.birligi) !== bk ? 0.6 : 1)));
  const top = tartib[0], ikkinchi = tartib[1];
  const eff = (g: Guruh) => g.ball * (bk && birlikKaliti(g.birligi) !== bk ? 0.6 : 1);
  if (!top || eff(top) < 0.45) return { xato: false as const, nomzodlar: tartib.slice(0, 5).map(nomzodga), tanlangan: null, holat: 'topilmadi' as const };
  if (eff(top) >= 0.85 && (!ikkinchi || eff(top) - eff(ikkinchi) >= 0.1)) return { xato: false as const, nomzodlar: tartib.slice(0, 5).map(nomzodga), tanlangan: nomzodga(top), holat: 'aniq' as const };
  return { xato: false as const, nomzodlar: tartib.slice(0, 5).map(nomzodga), tanlangan: null, holat: 'tanlash' as const };
}

async function obyektTop(env: Env, kid: number, matn: string): Promise<{ id: number; nom: string }[]> {
  const t = matn.replace(/[%*,()]/g, ' ').trim().slice(0, 80);
  if (!t) return [];
  return (await rest<{ id: number; nom: string }>(env, `t2_obyekt?kompaniya_id=eq.${kid}&nom=ilike.${encodeURIComponent('*' + t + '*')}&select=id,nom&limit=4`)) ?? [];
}

async function matnOl(ctx: Context, audio: Blob, kid: number, til: string): Promise<{ matn: string } | Response> {
  const f = new FormData();
  f.set('audio', audio, 'ombor-audio'); f.set('kompaniya_id', String(kid)); f.set('language', ['auto', 'uzb', 'rus', 'eng'].includes(til) ? til : 'auto');
  const h = new Headers(); const c = ctx.request.headers.get('Cookie'); if (c) h.set('Cookie', c);
  const r = await ovozPost({ ...ctx, request: new Request(new URL('/api/ombor-ovoz', ctx.request.url).toString(), { method: 'POST', headers: h, body: f }) } as Context);
  const j = await r.json().catch(() => null) as { ok?: boolean; text?: string; code?: string } | null;
  return j?.ok && j.text ? { matn: j.text } : fail(j?.code ?? 'VOICE_UNAVAILABLE', r.status >= 400 ? r.status : 502);
}

async function llmTahlil(env: Env, aktorId: number, kid: number, matn: string, bugun: string): Promise<Buyruq | null> {
  const r = await aiHisobli(env, aktorId, kid, 'document_control', 'ombor_buyruq', {
    system: LLM_TIZIM_MATNI + ` Bugungi sana: ${bugun}.`, text: matn.slice(0, 1000), temperature: 0, maxOutputTokens: 400, workload: 'utility', reasoning: { effort: 'none' },
  });
  return buyruqTekshir(llmJsonOl(r.text));
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) return fail('ORIGIN_INVALID', 403);
  const s = await aktor(ctx); if (s instanceof Response) return s;
  const tana = await tanaOl(ctx.request); if (tana instanceof Response) return tana;
  const { b, audio } = tana;
  const amal = String(b.amal ?? '');
  const aid = s.foydalanuvchi_id as number;

  if (amal === 'kontekst') {
    const idlar = (s.kompaniyalar ?? []).map((c) => c.kompaniya_id).filter((k) => !ruxsat(s, k, false));
    if (!idlar.length) return json({ ok: true, omborlar: [] });
    const q = await rest<{ id: number; kompaniya_id: number; nomi: string }>(ctx.env, `t2_sklad_mustaqil?kompaniya_id=in.(${idlar.join(',')})&holat=eq.faol&select=id,kompaniya_id,nomi&order=id`);
    if (!q) return fail('SERVER_XATO', 502);
    return json({ ok: true, omborlar: q.map((x) => ({ ...x, yozish: !ruxsat(s, x.kompaniya_id, true) })) });
  }

  const kid = butun(b.kompaniya_id), sid = butun(b.sklad_id);
  if (!kid || !sid) return fail('COMPANY_REQUIRED', 400);
  const yozish = ['yoz', 'tuzat', 'alias', 'tahlil', 'tasdiq'].includes(amal);
  if (!['qoldiq', 'royxat', 'tarix', 'eksport', 'yoz', 'tuzat', 'alias', 'tahlil', 'tasdiq'].includes(amal)) return fail('AMAL_NOMALUM', 400);
  const rad = ruxsat(s, kid, false) ?? (yozish && amal !== 'tahlil' ? ruxsat(s, kid, true) : null);
  if (rad) return rad;
  const baza = { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid };
  const filtr = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string' || x == null).map(([k, x]) => [k, x ?? ''])) : {});
  const lim = Number(b.limit ?? 50), off = Number(b.offset ?? 0);
  if (!Number.isInteger(lim) || lim < 1 || lim > 500 || !Number.isInteger(off) || off < 0 || off > 1_000_000) return fail('PAGINATION_INVALID', 400);

  switch (amal) {
    case 'qoldiq': return rpcNatija(await rpc(ctx.env, 't2_ombor_qoldiq_v2', { ...baza, p_filtr: filtr(b.filtr), p_limit: lim, p_offset: off }));
    case 'royxat': return rpcNatija(await rpc(ctx.env, 't2_ombor_harakat_royxat_v1', { ...baza, p_filtr: filtr(b.filtr), p_limit: lim, p_offset: off }));
    case 'tarix': return rpcNatija(await rpc(ctx.env, 't2_ombor_tarix_v1', { ...baza, p_kalit: String(b.kalit ?? '').slice(0, 500), p_birlik: String(b.birlik ?? '').slice(0, 100), p_limit: lim, p_offset: off }));
    case 'alias': {
      if (!UUID.test(String(b.operation_id ?? '')) || !Array.isArray(b.variantlar)) return fail('REQUIRED_FIELD', 400);
      return rpcNatija(await rpc(ctx.env, 't2_ombor_alias_tasdiq_v1', { ...baza, p_kanonik_nom: String(b.kanonik ?? '').slice(0, 500), p_variantlar: (b.variantlar as unknown[]).slice(0, 200).map((x) => String(x).slice(0, 500)), p_operation_id: b.operation_id }));
    }
    case 'yoz': return rpcNatija(await yozish_(ctx.env, baza, b));
    case 'tuzat': {
      if (!UUID.test(String(b.operation_id ?? '')) || !butun(b.harakat_id)) return fail('REQUIRED_FIELD', 400);
      return rpcNatija(await rpc(ctx.env, 't2_ombor_tuzat_v1', { ...baza, p_harakat_id: butun(b.harakat_id), p_yangi: b.yangi && typeof b.yangi === 'object' ? b.yangi : null, p_sabab: String(b.sabab ?? '').slice(0, 500), p_operation_id: b.operation_id }));
    }
    case 'eksport': return eksport(ctx, s, kid, sid, b);
    case 'tahlil': return tahlil(ctx, s, kid, sid, b, audio);
    case 'tasdiq': return tasdiq(ctx, s, kid, sid, b);
    default: return fail('AMAL_NOMALUM', 400);
  }
};

async function yozish_(env: Env, baza: Record<string, unknown>, b: Record<string, unknown>) {
  const op = String(b.operation_id ?? '');
  if (!UUID.test(op)) return { status: 400, data: { ok: false, code: 'OPERATION_ID_REQUIRED' } as Record<string, unknown> };
  const umumiy = { ...baza, p_nomi: String(b.nomi ?? '').slice(0, 500), p_birligi: String(b.birligi ?? '').slice(0, 100), p_miqdor: String(b.miqdor ?? ''), p_sana: b.sana ? String(b.sana).slice(0, 10) : null, p_operation_id: op };
  if (b.operatsiya === 'prixod') return rpc(env, 't2_ombor_prixod_v1', { ...umumiy, p_postavshik: b.kontragent ? String(b.kontragent).slice(0, 500) : null, p_tur: b.tur ? String(b.tur).slice(0, 200) : null, p_izoh: b.izoh ? String(b.izoh).slice(0, 1000) : null, p_sf: b.sf ? String(b.sf).slice(0, 200) : null });
  if (b.operatsiya === 'chiqim') return rpc(env, 't2_ombor_chiqim_v1', { ...umumiy, p_qabul_qiluvchi: b.kontragent ? String(b.kontragent).slice(0, 500) : null, p_qabul_turi: b.qabul_turi ? String(b.qabul_turi).slice(0, 100) : null, p_obyekt_id: butun(b.obyekt_id), p_izoh: b.izoh ? String(b.izoh).slice(0, 1000) : null, p_manfiy_ruxsat: false });
  return { status: 400, data: { ok: false, code: 'OPERATSIYA_NOMALUM' } as Record<string, unknown> };
}

async function tahlil(ctx: Context, s: Sess, kid: number, sid: number, b: Record<string, unknown>, audio: Blob | null): Promise<Response> {
  const aid = s.foydalanuvchi_id as number; const env = ctx.env;
  let matn = typeof b.matn === 'string' ? b.matn.trim().slice(0, 1000) : '';
  let manba: 'matn' | 'ovoz' | 'forma' = 'matn';
  let buyruq: Buyruq | null = null; let llmIshlatildi = false; let aiXabar: string | null = null;
  const bugun = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

  if (b.buyruq && typeof b.buyruq === 'object') { buyruq = buyruqTekshir(b.buyruq); manba = 'forma'; if (!buyruq) return fail('BUYRUQ_NOTOGRI', 400); }
  else {
    if (audio) { const t = await matnOl(ctx, audio, kid, String(b.til ?? 'auto')); if (t instanceof Response) return t; matn = t.matn.slice(0, 1000); manba = 'ovoz'; }
    if (!matn) return fail('MATN_YOQ', 400);
    const o = oddiyTahlil(matn);
    buyruq = o.buyruq;
    if (!buyruq || o.ishonch !== 'yuqori') {
      try { const l = await llmTahlil(env, aid, kid, matn, bugun); llmIshlatildi = true; if (l) buyruq = l; }
      catch (e) {
        if ((e as object) instanceof AiByudjetXatosi) { if (!buyruq) return json({ ok: false, code: (e as AiByudjetXatosi).kod, xabar: (e as AiByudjetXatosi).xabar, matn }, 402); aiXabar = (e as AiByudjetXatosi).xabar; }
        else if (!buyruq) return fail('AI_UNAVAILABLE', 503, { matn });
      }
    }
  }
  if (!buyruq) return json({ ok: true, holat: 'tushunilmadi', matn });
  await audit(env, kid, sid, 'ombor_buyruq_tahlil', aid, `manba=${manba}; amal=${buyruq.amal}; llm=${llmIshlatildi}; uzunlik=${matn.length}; xesh=${matn ? await xesh(matn) : '-'}`);

  const tanlov = b.tanlov && typeof b.tanlov === 'object' ? b.tanlov as { nomi?: unknown; birligi?: unknown } : null;
  const javob: Record<string, unknown> = { ok: true, manba, matn: manba === 'forma' ? undefined : matn, buyruq, llm: llmIshlatildi, ...(aiXabar ? { ai_xabar: aiXabar } : {}) };

  if (buyruq.amal === 'qoldiq' || buyruq.amal === 'tarix') {
    if (!buyruq.nomi) return json({ ...javob, holat: 'nom_kerak' });
    const m = await moslash(env, aid, kid, sid, buyruq.nomi, buyruq.birlik);
    if (m.xato) return fail('SERVER_XATO', 502);
    if (buyruq.amal === 'tarix' && m.tanlangan) {
      const t = await rpc(env, 't2_ombor_tarix_v1', { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid, p_kalit: m.tanlangan.kalit, p_birlik: m.tanlangan.birligi, p_limit: 10, p_offset: 0 });
      return json({ ...javob, holat: 'javob', material: m.tanlangan, tarix: t.data });
    }
    return json({ ...javob, holat: 'javob', nomzodlar: m.nomzodlar, material: m.tanlangan });
  }

  if (buyruq.amal === 'tuzat' || buyruq.amal === 'bekor') {
    let hid = buyruq.harakat_id;
    if (!hid) {
      const r = await rpc<{ ok?: boolean; qatorlar?: Record<string, unknown>[] }>(env, 't2_ombor_harakat_royxat_v1', { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid, p_filtr: buyruq.nomi ? { qidir: buyruq.nomi } : {}, p_limit: 5, p_offset: 0 });
      return json({ ...javob, holat: 'yozuv_tanlang', izoh: 'Tuzatish uchun aniq yozuvni tanlang (harakat_id).', nomzodlar_yozuv: r.data?.qatorlar ?? [] });
    }
    const q = await rest<Record<string, unknown>>(env, `t2_sklad_harakat?id=eq.${hid}&kompaniya_id=eq.${kid}&c11_sklad_id=eq.${sid}&holat=eq.faol&select=id,sana,operatsiya,nomi,birligi,obyomi,postavshik,qabul_qiluvchi,manba&limit=1`);
    const orig = q?.[0]; if (!orig) return json({ ...javob, holat: 'yozuv_topilmadi' });
    const yangi = buyruq.amal === 'bekor' ? null : (buyruq.yangi ?? (buyruq.miqdor ? { miqdor: buyruq.miqdor } : null));
    if (buyruq.amal === 'tuzat' && !yangi) return json({ ...javob, holat: 'yangi_qiymat_kerak', asl: orig });
    const op = crypto.randomUUID();
    const preview = { amal: buyruq.amal, harakat_id: hid, asl: orig, yangi, sabab: buyruq.izoh ?? (buyruq.amal === 'bekor' ? 'omborchi buyrug\'i bilan bekor' : 'omborchi buyrug\'i bilan tuzatish') };
    return json({ ...javob, holat: 'tasdiq_kerak', preview, token: await tokenYarat(env.SESSIYA_KALIT, { a: aid, k: kid, s: sid, op, p: { tur: 'tuzat', ...preview } }) });
  }

  // prixod / chiqim
  if (!buyruq.nomi || !buyruq.miqdor) return json({ ...javob, holat: 'toldirish_kerak', yetishmaydi: [!buyruq.nomi && 'nomi', !buyruq.miqdor && 'miqdor'].filter(Boolean) });
  const m = tanlov?.nomi ? { xato: false as const, nomzodlar: [] as Nomzod[], holat: 'tanlandi' as const, tanlangan: { nomi: String(tanlov.nomi), birligi: String(tanlov.birligi ?? buyruq.birlik ?? ''), qoldiq: NaN, ball: 1, kalit: '', variantlar_soni: 0 } as Nomzod }
    : await moslash(env, aid, kid, sid, buyruq.nomi, buyruq.birlik);
  if (m.xato) return fail('SERVER_XATO', 502);
  const ogohlantirish: string[] = [];
  let yangiMaterial = false;
  let nom = m.tanlangan?.nomi ?? null; let birl = buyruq.birlik ?? m.tanlangan?.birligi ?? null;
  if (!m.tanlangan) {
    if (m.holat === 'tanlash') return json({ ...javob, holat: 'material_tanlang', nomzodlar: m.nomzodlar });
    if (buyruq.amal === 'chiqim') return json({ ...javob, holat: 'material_topilmadi', nomzodlar: m.nomzodlar });
    yangiMaterial = true; nom = buyruq.nomi; ogohlantirish.push('Ombor tarixida bunday material topilmadi — yangi material sifatida yoziladi.');
  } else if (m.tanlangan.birligi && buyruq.birlik && birlikKaliti(buyruq.birlik) !== birlikKaliti(m.tanlangan.birligi)) {
    ogohlantirish.push(`Birlik farq qiladi: aytildi «${buyruq.birlik}», ombordagi material «${m.tanlangan.birligi}». Ombordagi birlik ishlatiladi.`);
    birl = m.tanlangan.birligi;
  }
  if (!birl) return json({ ...javob, holat: 'toldirish_kerak', yetishmaydi: ['birlik'] });
  const hozirgi = m.tanlangan && Number.isFinite(m.tanlangan.qoldiq) ? m.tanlangan.qoldiq : null;
  const keyin = hozirgi == null ? null : buyruq.amal === 'prixod' ? hozirgi + buyruq.miqdor : hozirgi - buyruq.miqdor;
  if (buyruq.amal === 'chiqim' && keyin != null && keyin < 0) return json({ ...javob, holat: 'qoldiq_yetmaydi', material: m.tanlangan, hozirgi_qoldiq: hozirgi, sorlagan: buyruq.miqdor });
  let obyektId: number | null = null;
  if (buyruq.obyekt) {
    const ob = await obyektTop(env, kid, buyruq.obyekt);
    if (ob.length === 1) obyektId = ob[0].id; else if (ob.length > 1) return json({ ...javob, holat: 'obyekt_tanlang', nomzodlar_obyekt: ob }); else ogohlantirish.push(`Obyekt topilmadi: «${buyruq.obyekt}». Obyektsiz yoziladi.`);
  }
  if (buyruq.amal === 'chiqim' && !buyruq.kontragent) ogohlantirish.push('Kimga berilgani aytilmadi (qabul qiluvchi bo\'sh qoladi).');
  if (buyruq.sana && buyruq.sana > bugun) return json({ ...javob, holat: 'sana_kelajakda' });
  const op = crypto.randomUUID();
  const preview = { tur: buyruq.amal, nomi: nom, birligi: birl, miqdor: buyruq.miqdor, sana: buyruq.sana ?? bugun, kontragent: buyruq.kontragent, obyekt_id: obyektId, obyekt: buyruq.obyekt, izoh: buyruq.izoh, yangi_material: yangiMaterial, qoldiq_hozir: hozirgi, qoldiq_keyin: keyin, ogohlantirish };
  return json({ ...javob, holat: 'tasdiq_kerak', preview, token: await tokenYarat(env.SESSIYA_KALIT, { a: aid, k: kid, s: sid, op, p: preview }) });
}

async function tasdiq(ctx: Context, s: Sess, kid: number, sid: number, b: Record<string, unknown>): Promise<Response> {
  const aid = s.foydalanuvchi_id as number; const env = ctx.env;
  const y = await tokenTekshir(env.SESSIYA_KALIT, String(b.token ?? ''));
  if (y === 'muddati') return fail('TOKEN_MUDDATI_OTGAN', 410);
  if (!y || y.a !== aid || y.k !== kid || y.s !== sid) return fail('TOKEN_YAROQSIZ', 403);
  const p = y.p as Record<string, unknown>;
  let r: { status: number; data: Record<string, unknown> | null };
  if (p.tur === 'tuzat') {
    r = await rpc(env, 't2_ombor_tuzat_v1', { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid, p_harakat_id: p.harakat_id, p_yangi: p.yangi ?? null, p_sabab: String(p.sabab ?? 'omborchi buyrug\'i'), p_operation_id: y.op });
  } else if (p.tur === 'prixod' || p.tur === 'chiqim') {
    r = await yozish_(env, { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid }, { operatsiya: p.tur, nomi: p.nomi, birligi: p.birligi, miqdor: p.miqdor, sana: p.sana, kontragent: p.kontragent, obyekt_id: p.obyekt_id, izoh: p.izoh, operation_id: y.op });
  } else return fail('TOKEN_YAROQSIZ', 403);
  await audit(env, kid, sid, 'ombor_buyruq_tasdiq', aid, `tur=${String(p.tur)}; ok=${String((r.data as { ok?: boolean } | null)?.ok)}; operation_id=${y.op}`);
  return rpcNatija(r);
}

type EksportGuruh = { nomi: string; birligi: string; tur: string | null; kirim: number; chiqim: number; qoldiq: number };
/** Ostatka .xlsx: filtr bo'yicha HAMMA guruhlar (sahifalab o'qiladi, 5000 gacha). Token: serverSarfla (mazmun xeshi bo'yicha idempotent). */
async function eksport(ctx: Context, s: Sess, kid: number, sid: number, b: Record<string, unknown>): Promise<Response> {
  const aid = s.foydalanuvchi_id as number; const env = ctx.env;
  const f = b.filtr && typeof b.filtr === 'object' && !Array.isArray(b.filtr) ? Object.fromEntries(Object.entries(b.filtr as Record<string, unknown>).filter(([, x]) => typeof x === 'string')) : {};
  const hammasi: EksportGuruh[] = [];
  for (let off = 0; off < 5000; off += 500) {
    const r = await rpc<{ ok?: boolean; jami?: number; qatorlar?: EksportGuruh[] }>(env, 't2_ombor_qoldiq_v2', { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid, p_filtr: f, p_limit: 500, p_offset: off });
    if (!r.data?.ok) return rpcNatija(r as { status: number; data: Record<string, unknown> | null });
    hammasi.push(...(r.data.qatorlar ?? []));
    if (off + 500 >= (r.data.jami ?? 0)) break;
  }
  // Rasmiy hujjat yozuvchisi (HUJJAT_STANDARTI_V1): jadval formatlari, kolontitul, filtr — boshqa hujjatlar bilan bir xil dvigatel.
  const bugun = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const v = new RasmiyVaraq({ nom: 'Остаток', kattaHarf: false, sarlavha: 'ОСТАТОК МАТЕРИАЛОВ НА СКЛАДЕ', titul: [['Дата', bugun], ['Позиций', String(hammasi.length)]], filtr: true, yonalish: 'landscape', muzlatUstun: 2,
    ustunlar: [{ sarlavha: '№', kenglik: 6, tur: 'tartib' }, { sarlavha: 'Наименование', kenglik: 56, tur: 'matn' }, { sarlavha: 'Ед.изм', kenglik: 9, tur: 'birlik' }, { sarlavha: 'Группа', kenglik: 16, tur: 'matn' },
      { sarlavha: 'Приход', kenglik: 14, tur: 'hajm' }, { sarlavha: 'Расход', kenglik: 14, tur: 'hajm' }, { sarlavha: 'Остаток', kenglik: 14, tur: 'hajm' }] });
  v.bosh();
  hammasi.forEach((g, i) => v.qator('oddiy', [i + 1, g.nomi, g.birligi, g.tur ?? '', Number(g.kirim), Number(g.chiqim), Number(g.qoldiq)]));
  const bytes = rasmiyKitob([v], { tur: 'ostatka' }).bytes;  const xeshHex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(hammasi))))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const sarf = await serverSarfla(env, { actorId: aid, kompaniyaId: kid, turi: 'ombor_qoldiq', xesh: xeshHex, bytes });
  if (!sarf.ok) return sarfRad(sarf);
  await audit(env, kid, sid, 'ombor_eksport', aid, `qatorlar=${hammasi.length}; sarf=${sarf.sarflandi}`);
  if (!bytes.length && sarf.operationId) await serverQaytar(env, { actorId: aid, kompaniyaId: kid, sarfOperationId: sarf.operationId });
  return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="ostatka-${bugun}.xlsx"`, 'X-Hujjat-Sarf': String(sarf.sarflandi), 'X-Hujjat-Bepul-Takror': sarf.bepulTakror ? '1' : '0', 'Cache-Control': 'no-store' } });
}