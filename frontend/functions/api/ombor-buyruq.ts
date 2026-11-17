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
 *   taklif    — aqlli takliflar (material, birlik, odatiy miqdor, narx, yetkazuvchi; yetkazuvchi → materiallari). Shu omborning tarixidan, LLM siz.
 *   hisobot   — kirim-chiqim jadvali istalgan davr uchun (filtrlar, QQS siz/bilan jami; storno/qaytarishlarsiz). `qoldiq` ga `sana` berilsa — shu sanadagi ostatka.
 *   vosita    — Jarvis/agent vositalari (ombor-vositalar.ts): yozuv faqat tasdiq tokeni bilan; qoralama hech narsa yozmaydi.
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
import { birlikKaliti, nomKaliti } from '../../src/lib/ombor-moslash/moslash';
import { ESLATMA_MANBALARI, eslatmaYigish, type EslatmaYozuv } from '../../src/lib/ombor-moslash/eslatma';
import { davrFiltrdan, toshkentBugun, type Davr } from '../../src/lib/ombor-moslash/davr';
import { OSTATKA_MANBALARI, STORNO_MANBALAR, hisobotYigish, qoldiqSanada, type HarakatQator, type Hisobot, type HisobotFiltr } from '../../src/lib/ombor-moslash/hisobot';
import { kontragentTaklif, materialTaklif, type MaterialTaklif, type TaklifYozuv, type Tur } from '../../src/lib/ombor-moslash/taklif';
import { NDS_SUKUT_FOIZ } from '../../src/lib/hisob-yadro/nds';
import { narxBilanga, narxRejimTekshir, narxSizga } from '../../src/lib/ombor-moslash/narx';
import { vositaSorov } from '../_shared/ombor-vositalar';
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
  try {
    const b = await req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) return fail('BODY_INVALID', 400);
    const o = b as Record<string, unknown>;
    // Android (mobil BFF faqat JSON o'tkazadi): ovoz base64 matni sifatida keladi — multipart bilan bir xil yo'lga tushadi.
    if (typeof o.audio_b64 === 'string' && o.audio_b64) {
      const a = audioBase64(o.audio_b64, typeof o.mime === 'string' ? o.mime : '');
      if (a === 'katta') return fail('AUDIO_TOO_LARGE', 413);
      if (!a) return fail('AUDIO_INVALID', 400);
      return { b: o, audio: a };
    }
    return { b: o, audio: null };
  } catch { return fail('BODY_INVALID', 400); }
}
const AUDIO_MIME = /^audio\/(?:webm|ogg|mp4|mpeg|wav|x-wav|aac|flac)$/i;
function audioBase64(s: string, mime: string): Blob | 'katta' | null {
  if (s.length > Math.ceil(MAX_BODY * 4 / 3) + 8) return 'katta';
  const tur = mime.split(';')[0].trim().toLowerCase();
  if (!AUDIO_MIME.test(tur)) return null;
  try {
    const bin = atob(s.replace(/\s+/g, ''));
    if (!bin.length) return null;
    return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: tur });
  } catch { return null; }
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
  const { audio } = tana;
  let b = tana.b;
  let amal = String(b.amal ?? '');
  const aid = s.foydalanuvchi_id as number;
  // Jarvis vositasi: nom+args -> ichki amal. Ruxsat/aktor/kompaniya tekshiruvi quyida HAMMA amallar bilan bir xil yo'ldan o'tadi.
  if (amal === 'vosita') {
    const v = vositaSorov(b.nom, b.args);
    if ('xato' in v) return fail(v.xato, 400);
    b = { ...b, ...v.tana, amal: v.amal }; amal = v.amal;
  }

  if (amal === 'kontekst') {
    const idlar = (s.kompaniyalar ?? []).map((c) => c.kompaniya_id).filter((k) => !ruxsat(s, k, false));
    if (!idlar.length) return json({ ok: true, omborlar: [] });
    const q = await rest<{ id: number; kompaniya_id: number; nomi: string }>(ctx.env, `t2_sklad_mustaqil?kompaniya_id=in.(${idlar.join(',')})&holat=eq.faol&select=id,kompaniya_id,nomi&order=id`);
    if (!q) return fail('SERVER_XATO', 502);
    return json({ ok: true, omborlar: q.map((x) => ({ ...x, yozish: !ruxsat(s, x.kompaniya_id, true) })) });
  }

  const kid = butun(b.kompaniya_id), sid = butun(b.sklad_id);
  if (!kid || !sid) return fail('COMPANY_REQUIRED', 400);
  const yozish = ['yoz', 'tuzat', 'alias', 'tahlil', 'tasdiq', 'narx_qoy'].includes(amal);
  if (!['qoldiq', 'royxat', 'tarix', 'eslatma', 'taklif', 'hisobot', 'eksport', 'eksport_reja', 'narx_qoy', 'yoz', 'tuzat', 'alias', 'tahlil', 'tasdiq'].includes(amal)) return fail('AMAL_NOMALUM', 400);
  const rad = ruxsat(s, kid, false) ?? (yozish && amal !== 'tahlil' ? ruxsat(s, kid, true) : null);
  if (rad) return rad;
  const baza = { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid };
  const filtr = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string' || x == null).map(([k, x]) => [k, x ?? ''])) : {});
  const lim = Number(b.limit ?? 50), off = Number(b.offset ?? 0);
  if (!Number.isInteger(lim) || lim < 1 || lim > 500 || !Number.isInteger(off) || off < 0 || off > 1_000_000) return fail('PAGINATION_INVALID', 400);

  switch (amal) {
    case 'qoldiq':
      if (typeof b.sana === 'string' && b.sana) return qoldiqSana(ctx.env, kid, sid, b.sana, filtr(b.filtr), lim, off);
      return rpcNatija(await rpc(ctx.env, 't2_ombor_qoldiq_v2', { ...baza, p_filtr: filtr(b.filtr), p_limit: lim, p_offset: off }));
    case 'narx_qoy': {
      // Narxsiz yozilgan kirimga narx keyin qo'yiladi (asl yozuv o'zgarmaydi — append-only; narx alohida jadvalda).
      const hid = butun(b.harakat_id); const narx = Number(String(b.narx ?? '').replace(',', '.').replace(/\s/g, ''));
      if (!hid || !(narx > 0 && narx <= 1e12)) return fail('INVALID_INPUT', 400);
      const r = await rpc(ctx.env, 't2_ombor_narx_qoy_v1', { ...baza, p_harakat_id: hid, p_narx: narx });
      if (r.status === 404) return fail('MIGRATSIYA_YOQ', 501);
      taklifKeshTozala(kid, sid);
      return rpcNatija(r);
    }
    case 'taklif': return taklif(ctx, aid, kid, sid, b);
    case 'hisobot': return hisobotJavob(ctx.env, kid, sid, b, lim, off);
    case 'eksport_reja': return eksportReja(ctx.env, kid, sid, b);
    case 'royxat': return rpcNatija(await rpc(ctx.env, 't2_ombor_harakat_royxat_v1', { ...baza, p_filtr: filtr(b.filtr), p_limit: lim, p_offset: off }));
    case 'tarix': return rpcNatija(await rpc(ctx.env, 't2_ombor_tarix_v1', { ...baza, p_kalit: String(b.kalit ?? '').slice(0, 500), p_birlik: String(b.birlik ?? '').slice(0, 100), p_limit: lim, p_offset: off }));
    case 'eslatma': return eslatma(ctx, aid, kid, sid, b);
    case 'alias': {
      if (!UUID.test(String(b.operation_id ?? '')) || !Array.isArray(b.variantlar)) return fail('REQUIRED_FIELD', 400);
      return rpcNatija(await rpc(ctx.env, 't2_ombor_alias_tasdiq_v1', { ...baza, p_kanonik_nom: String(b.kanonik ?? '').slice(0, 500), p_variantlar: (b.variantlar as unknown[]).slice(0, 200).map((x) => String(x).slice(0, 500)), p_operation_id: b.operation_id }));
    }
    case 'yoz': { const r = await yozish_(ctx.env, baza, b); taklifKeshTozala(kid, sid); return rpcNatija(r); }
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

/**
 * Eslatma (autocomplete): shu omborning O'Z oldingi kirim/chiqim yozuvlaridan material nomi, birlik, oxirgi yetkazuvchi/qabul qiluvchi, narx.
 * Variant guruhi tasdig'i yo'q: omborchi bir marta kiritgan nom keyingi safar taklif bo'ladi, yangi nom o'zi qabul qilinadi.
 * Ruxsat: umumiy o'qish ruxsati (yuqorida); kompaniya+ombor serverda majburiy filtr (mijoz id yubormaydi — faqat sessiya).
 */
async function eslatma(ctx: Context, aid: number, kid: number, sid: number, b: Record<string, unknown>): Promise<Response> {
  const q = typeof b.q === 'string' ? b.q.slice(0, 120) : '';
  const lim = Math.min(20, Math.max(1, Number(b.limit ?? 8) || 8));
  const manba = ESLATMA_MANBALARI.join(',');
  const qator = await rest<EslatmaYozuv>(ctx.env, `t2_sklad_harakat?kompaniya_id=eq.${kid}&c11_sklad_id=eq.${sid}&holat=eq.faol&manba=in.(${manba})&nomi=not.is.null&select=id,nomi,birligi,sana,operatsiya,postavshik,qabul_qiluvchi,narx&order=id.desc&limit=1000`);
  if (!qator) return fail('SERVER_XATO', 502);
  const takliflar = eslatmaYigish(qator, q, lim);
  // Oxirgi 1000 yozuvdan tashqaridagi eski materiallar: o'sha ombor tarixidan (guruhlanmagan nom bilan) to'ldiriladi.
  if (q.trim().length >= 2 && takliflar.length < lim) {
    const r = await rpc<{ ok?: boolean; qatorlar?: { nomi: string; birligi: string; harakatlar?: number; oxirgi_sana?: string | null }[] }>(ctx.env, 't2_ombor_qoldiq_v2',
      { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid, p_filtr: { qidir: q, musbat: '0' }, p_limit: 6, p_offset: 0 });
    const bor = new Set(takliflar.map((t) => nomKaliti(t.nomi) + '|' + birlikKaliti(t.birligi)));
    for (const g of r.data?.ok ? (r.data.qatorlar ?? []) : []) {
      const k = nomKaliti(g.nomi) + '|' + birlikKaliti(g.birligi);
      if (bor.has(k) || takliflar.length >= lim) continue;
      bor.add(k);
      takliflar.push({ nomi: g.nomi, birligi: g.birligi, soni: Number(g.harakatlar ?? 1) || 1, oxirgi_sana: g.oxirgi_sana ?? null, postavshik: null, qabul_qiluvchi: null, narx: null });
    }
  }
  return json({ ok: true, takliflar });
}

async function yozish_(env: Env, baza: Record<string, unknown>, b: Record<string, unknown>) {
  const op = String(b.operation_id ?? '');
  if (!UUID.test(op)) return { status: 400, data: { ok: false, code: 'OPERATION_ID_REQUIRED' } as Record<string, unknown> };
  const umumiy = { ...baza, p_nomi: String(b.nomi ?? '').slice(0, 500), p_birligi: String(b.birligi ?? '').slice(0, 100), p_miqdor: String(b.miqdor ?? ''), p_sana: b.sana ? String(b.sana).slice(0, 10) : null, p_operation_id: op };
  if (b.operatsiya === 'prixod') {
    const prixod = { ...umumiy, p_postavshik: b.kontragent ? String(b.kontragent).slice(0, 500) : null, p_tur: b.tur ? String(b.tur).slice(0, 200) : null, p_izoh: b.izoh ? String(b.izoh).slice(0, 1000) : null, p_sf: b.sf ? String(b.sf).slice(0, 200) : null };
    const narxKir = b.narx == null || b.narx === '' ? null : Number(String(b.narx).replace(',', '.').replace(/\s/g, ''));
    // Kanonik saqlash — QQS siz. narx_rejim = 'bilan' bo'lsa kiritilgan narx QQS bilan deb olinadi va yagona QQS stavkasi bilan keltiriladi (sukut: allaqachon QQS siz).
    const narxXom = narxKir == null || !(Number.isFinite(narxKir) && narxKir > 0 && narxKir <= 1e12) ? narxKir : narxSizga(narxKir, narxRejimTekshir(b.narx_rejim) ?? 'siz');
    if (narxXom != null && !(Number.isFinite(narxXom) && narxXom > 0 && narxXom <= 1e12)) return { status: 400, data: { ok: false, code: 'INVALID_INPUT' } as Record<string, unknown> };
    if (narxXom != null) {
      // Narx (QQS siz) bilan: t2_ombor_prixod_v2 (migratsiya 20270107...). Hali qo'llanmagan bo'lsa (404) — narxsiz yoziladi va javobda `narx_saqlanmadi` bayrog'i.
      const r2 = await rpc<Record<string, unknown>>(env, 't2_ombor_prixod_v2', { ...prixod, p_narx: narxXom });
      if (r2.status !== 404) return r2;
      const r1 = await rpc<Record<string, unknown>>(env, 't2_ombor_prixod_v1', prixod);
      return r1.data && r1.status < 400 && (r1.data as { ok?: boolean }).ok !== false ? { ...r1, data: { ...r1.data, narx_saqlanmadi: true } } : r1;
    }
    return rpc(env, 't2_ombor_prixod_v1', prixod);
  }
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

  if (buyruq.amal === 'hisobot') {
    const h = await hisobotTayyor(env, kid, sid, { davr: buyruq.davr, qidir: buyruq.nomi, kontragent: buyruq.kontragent, obyekt: buyruq.obyekt, operatsiya: buyruq.operatsiya }, bugun);
    if (h instanceof Response) return h;
    return json({ ...javob, holat: 'hisobot', hisobot: { davr: h.davr, jami: h.hisobot.jami, chetlatilgan: h.hisobot.chetlatilgan, qator_soni: h.hisobot.qatorlar.length, qatorlar: h.hisobot.qatorlar.slice(0, 15) } });
  }

  if (buyruq.amal === 'qoldiq' && (!buyruq.nomi || (buyruq.sana && buyruq.sana < bugun))) {
    // «bugungi qoldiq» (nom yo'q) yoki o'tgan sanadagi ostatka: ro'yxat (sana bo'lsa — shu sana oxirigacha hisoblanadi).
    const r = buyruq.sana && buyruq.sana < bugun
      ? await qoldiqSanaRoyxat(env, kid, sid, buyruq.sana, buyruq.nomi, 15)
      : await qoldiqHozirRoyxat(env, aid, kid, sid, buyruq.nomi, 15);
    if (!r) return fail('SERVER_XATO', 502);
    return json({ ...javob, holat: 'javob', sana: buyruq.sana && buyruq.sana < bugun ? buyruq.sana : bugun, nomzodlar: r.nomzodlar, jami: r.jami });
  }

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
  // Variant tanlash bosqichi YO'Q (egasi qarori). Aniq moslik — ombordagi yozilishi olinadi. Bir nechta o'xshash bo'lsa: chiqimda eng yaqini
  // (chiqim faqat mavjud materialdan), kirimda yozilgan nom O'ZI qabul qilinadi (yangi nom keyingi safar eslatma bo'ladi). Qolganlari `nomzodlar` da.
  const tl: Nomzod | null = m.tanlangan ?? (m.holat === 'tanlash' && buyruq.amal === 'chiqim' ? m.nomzodlar[0] ?? null : null);
  if (!m.tanlangan && tl) ogohlantirish.push(`O'xshash materiallar bor: «${tl.nomi}» olindi. Boshqa bo'lsa, nomni o'zgartiring.`);
  let yangiMaterial = false;
  let nom = tl?.nomi ?? null; let birl = buyruq.birlik ?? tl?.birligi ?? null;
  if (!tl) {
    if (buyruq.amal === 'chiqim') return json({ ...javob, holat: 'material_topilmadi', nomzodlar: m.nomzodlar });
    yangiMaterial = true; nom = buyruq.nomi; if (m.holat === 'tanlash') ogohlantirish.push('Yozilgan nom o\'zi qabul qilindi (o\'xshash materiallar bor, pastda taklif qilinadi).'); else ogohlantirish.push('Ombor tarixida bunday material topilmadi — yangi material sifatida yoziladi.');
  } else if (tl.birligi && buyruq.birlik && birlikKaliti(buyruq.birlik) !== birlikKaliti(tl.birligi)) {
    ogohlantirish.push(`Birlik farq qiladi: aytildi «${buyruq.birlik}», ombordagi material «${tl.birligi}». Ombordagi birlik ishlatiladi.`);
    birl = tl.birligi;
  }
  if (!birl) return json({ ...javob, holat: 'toldirish_kerak', yetishmaydi: ['birlik'] });
  const hozirgi = tl && Number.isFinite(tl.qoldiq) ? tl.qoldiq : null;
  const keyin = hozirgi == null ? null : buyruq.amal === 'prixod' ? hozirgi + buyruq.miqdor : hozirgi - buyruq.miqdor;
  if (buyruq.amal === 'chiqim' && keyin != null && keyin < 0) return json({ ...javob, holat: 'qoldiq_yetmaydi', material: tl, hozirgi_qoldiq: hozirgi, sorlagan: buyruq.miqdor });
  let obyektId: number | null = null;
  if (buyruq.obyekt) {
    const ob = await obyektTop(env, kid, buyruq.obyekt);
    if (ob.length === 1) obyektId = ob[0].id; else if (ob.length > 1) return json({ ...javob, holat: 'obyekt_tanlang', nomzodlar_obyekt: ob }); else ogohlantirish.push(`Obyekt topilmadi: «${buyruq.obyekt}». Obyektsiz yoziladi.`);
  }
  if (buyruq.amal === 'chiqim' && !buyruq.kontragent) ogohlantirish.push('Kimga berilgani aytilmadi (qabul qiluvchi bo\'sh qoladi).');
  if (buyruq.sana && buyruq.sana > bugun) return json({ ...javob, holat: 'sana_kelajakda' });
  const op = crypto.randomUUID();
  // Narx ixtiyoriy: yozilmagan kirimda bir marta yumshoq so'raladi (`narx_sorov`), saqlashni hech qachon to'smaydi; keyin narx qo'yish mumkin (narx_qoy).
  const narxSorov = buyruq.amal === 'prixod' && buyruq.narx == null;
  if (narxSorov) ogohlantirish.push('Narxi ma’lummi? (o‘tkazib yuborish mumkin)');
  // Narx QQS bilan/siz: matnda aytilgan yoki mijozning eslab qolgan tanlovi (narx_rejim) bo'lmasa — «bilan» deb olinadi va BIR MARTA so'raladi.
  const rejimAniq = buyruq.narx_rejim != null || narxRejimTekshir(b.narx_rejim) != null;
  const narxRejim = buyruq.narx_rejim ?? narxRejimTekshir(b.narx_rejim) ?? 'bilan';
  const narxSiz = buyruq.amal === 'prixod' ? narxSizga(buyruq.narx, narxRejim) : null;
  const narxRejimSorov = narxSiz != null && !rejimAniq;
  if (narxRejimSorov) ogohlantirish.push('Narx QQS bilan deb olindi. QQS siz bo‘lsa, «QQS siz» deb qayta ayting yoki tanlang.');
  const preview = { narx_sorov: narxSorov, narx_rejim: narxSiz != null ? narxRejim : null, narx_rejim_sorov: narxRejimSorov, narx_kiritilgan: narxSiz != null ? buyruq.narx : null, narx_bilan: narxBilanga(narxSiz), tur: buyruq.amal, nomi: nom, birligi: birl, miqdor: buyruq.miqdor, narx: narxSiz, sana: buyruq.sana ?? bugun, kontragent: buyruq.kontragent, obyekt_id: obyektId, obyekt: buyruq.obyekt, izoh: buyruq.izoh, yangi_material: yangiMaterial, qoldiq_hozir: hozirgi, qoldiq_keyin: keyin, ogohlantirish };
  return json({ ...javob, holat: 'tasdiq_kerak', preview, nomzodlar: m.nomzodlar, token: await tokenYarat(env.SESSIYA_KALIT, { a: aid, k: kid, s: sid, op, p: preview }) });
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
    r = await yozish_(env, { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid }, { operatsiya: p.tur, nomi: p.nomi, birligi: p.birligi, miqdor: p.miqdor, sana: p.sana, kontragent: p.kontragent, obyekt_id: p.obyekt_id, izoh: p.izoh, narx: p.narx, operation_id: y.op });
  } else return fail('TOKEN_YAROQSIZ', 403);
  taklifKeshTozala(kid, sid);
  await audit(env, kid, sid, 'ombor_buyruq_tasdiq', aid, `tur=${String(p.tur)}; ok=${String((r.data as { ok?: boolean } | null)?.ok)}; operation_id=${y.op}`);
  return rpcNatija(r);
}

/* ───────────── takliflar, ostatka sanada, hisobot (REST + sof funksiyalar; migratsiyasiz ishlaydi) ───────────── */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HARAKAT_USTUN = 'id,sana,operatsiya,nomi,birligi,obyomi,postavshik,qabul_qiluvchi,narx,manba,c11_hedef_obyekt_id,c11_storno_of_id,c11_juft_id,izoh';
const OLDINGI_LIMIT = 30000;

/** Ombor harakatlari (kompaniya+ombor serverda majburiy filtr). Sana oralig'i bo'lsa storno yozuvlari alohida (oraliqdan tashqarida bo'lishi mumkin) qo'shiladi. */
async function harakatYukla(env: Env, kid: number, sid: number, o: { dan?: string | null; gacha?: string | null }): Promise<HarakatQator[] | null> {
  const asos = `t2_sklad_harakat?kompaniya_id=eq.${kid}&c11_sklad_id=eq.${sid}&holat=eq.faol&select=${HARAKAT_USTUN}&order=id.asc`;
  const dan = o.dan && ISO.test(o.dan) ? o.dan : null, gacha = o.gacha && ISO.test(o.gacha) ? o.gacha : null;
  const sanaF = (dan ? `&sana=gte.${dan}` : '') + (gacha ? `&sana=lte.${gacha}` : '');
  const hammasi: HarakatQator[] = [];
  for (let off = 0; off < OLDINGI_LIMIT; off += 1000) {
    const q = await rest<HarakatQator>(env, `${asos}&manba=in.(${OSTATKA_MANBALARI.join(',')})${sanaF}&limit=1000&offset=${off}`);
    if (!q) return null;
    hammasi.push(...q);
    if (q.length < 1000) break;
  }
  if (sanaF) {
    const st = await rest<HarakatQator>(env, `${asos}&manba=in.(${STORNO_MANBALAR.join(',')})&limit=2000`);
    if (!st) return null;
    hammasi.push(...st);
  }
  return hammasi;
}

/** Keyin qo'yilgan narxlar (t2_ombor_narx_keyin; jadval hali yo'q bo'lsa — jim o'tkaziladi): narxsiz kirim qatoriga qo'shiladi. */
async function narxQoplash<T extends { id?: number; operatsiya: string | null; narx?: number | string | null }>(env: Env, kid: number, qatorlar: T[]): Promise<T[]> {
  if (!qatorlar.some((q) => q.operatsiya === 'prixod' && q.narx == null)) return qatorlar;
  const k = await rest<{ harakat_id: number; narx: number | string }>(env, `t2_ombor_narx_keyin?kompaniya_id=eq.${kid}&select=harakat_id,narx&limit=20000`);
  if (!k?.length) return qatorlar;
  const m = new Map(k.map((x) => [Number(x.harakat_id), x.narx]));
  return qatorlar.map((q) => (q.operatsiya === 'prixod' && q.narx == null && q.id != null && m.has(q.id) ? { ...q, narx: m.get(q.id)! } : q));
}

const keshT = new Map<string, { t: number; v: TaklifYozuv[] }>();
export const taklifKeshTozala = (kid: number, sid: number): void => { keshT.delete(`${kid}:${sid}:prixod`); keshT.delete(`${kid}:${sid}:chiqim`); };
/** Takliflar tarixi: shu omborning oxirgi 2000 kirim (yoki chiqim) yozuvi; 20 soniya xotirada (har harf bosishda qayta o'qilmasin), yozuvdan keyin tozalanadi. */
async function taklifYukla(env: Env, kid: number, sid: number, tur: Tur): Promise<TaklifYozuv[] | null> {
  const kalit = `${kid}:${sid}:${tur}`; const k = keshT.get(kalit);
  if (k && Date.now() - k.t < 20_000) return k.v;
  const q = await rest<TaklifYozuv>(env, `t2_sklad_harakat?kompaniya_id=eq.${kid}&c11_sklad_id=eq.${sid}&holat=eq.faol&operatsiya=eq.${tur === 'prixod' ? 'prixod' : 'rasxod'}&manba=in.(${ESLATMA_MANBALARI.join(',')})&nomi=not.is.null&select=id,nomi,birligi,sana,operatsiya,obyomi,postavshik,qabul_qiluvchi,narx&order=id.desc&limit=2000`);
  if (!q) return null;
  const v = await narxQoplash(env, kid, q);
  if (keshT.size > 60) keshT.clear();
  keshT.set(kalit, { t: Date.now(), v });
  return v;
}

async function taklif(ctx: Context, aid: number, kid: number, sid: number, b: Record<string, unknown>): Promise<Response> {
  const q = typeof b.q === 'string' ? b.q.slice(0, 120) : '';
  const tur: Tur = b.tur === 'chiqim' ? 'chiqim' : 'prixod';
  const yet = typeof b.yetkazuvchi === 'string' && b.yetkazuvchi.trim() ? b.yetkazuvchi.trim().slice(0, 200) : null;
  const lim = Math.min(20, Math.max(1, Number(b.limit ?? 6) || 6));
  const yoz = await taklifYukla(ctx.env, kid, sid, tur);
  if (!yoz) return fail('SERVER_XATO', 502);
  const bugun = toshkentBugun();
  const takliflar: (MaterialTaklif & { qoldiq?: number | null })[] = materialTaklif(yoz, q, tur, { bugun, limit: lim, kontragent: yet });
  // Tarixda yo'q (yoki chiqimda — omborda bor) materiallar: ostatka ro'yxatidan to'ldiriladi (ombor hali bu nom bilan ishlamagan bo'lishi mumkin).
  if (!yet && takliflar.length < lim && (q.trim().length >= 2 || tur === 'chiqim')) {
    const r = await rpc<{ ok?: boolean; qatorlar?: Guruh[] }>(ctx.env, 't2_ombor_qoldiq_v2', { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid, p_filtr: { ...(q.trim() ? { qidir: q } : {}), musbat: tur === 'chiqim' ? '1' : '0', tartib: 'qoldiq' }, p_limit: lim, p_offset: 0 });
    const bor = new Set(takliflar.map((t) => nomKaliti(t.nomi) + '|' + birlikKaliti(t.birligi)));
    for (const g of r.data?.ok ? (r.data.qatorlar ?? []) : []) {
      const k = nomKaliti(g.nomi) + '|' + birlikKaliti(g.birligi);
      if (bor.has(k) || takliflar.length >= lim) continue;
      bor.add(k);
      takliflar.push({ nomi: g.nomi, birligi: g.birligi, soni: Number((g as { harakatlar?: number }).harakatlar ?? 1) || 1, oxirgi_sana: g.oxirgi_sana ?? null, miqdor_oxirgi: null, miqdor_median: null, narx_oxirgi: null, narx_ortacha: null,
        narx_oxirgi_qqs: null, narx_ortacha_qqs: null, kontragent: null, kontragent_oxirgi: null, kontragentlar: [], ball: 0, qoldiq: Number(g.qoldiq) });
    }
  }
  return json({ ok: true, tur, qqs_foiz: NDS_SUKUT_FOIZ, takliflar, kontragentlar: yet ? [] : kontragentTaklif(yoz, q, tur, { limit: 4 }) });
}

const guruhJavob = (x: { kalit: string; nomi: string; birligi: string; kirim: number; chiqim: number; qoldiq: number; oxirgi_sana: string | null; harakatlar: number }) => ({ ...x, tur: null, variantlar_soni: 1, ball: 1 });

/** Istalgan sanadagi ostatka (shu kun oxirigacha), `qoldiq` amali bilan bir xil javob shakli. */
async function qoldiqSana(env: Env, kid: number, sid: number, sana: string, f: Record<string, unknown>, lim: number, off: number): Promise<Response> {
  if (!ISO.test(sana) || sana > toshkentBugun()) return fail('DATE_INVALID', 400);
  const qidir = typeof f.qidir === 'string' && f.qidir.trim() ? f.qidir.trim() : null;
  const rows = await harakatYukla(env, kid, sid, { gacha: sana });
  if (!rows) return fail('SERVER_XATO', 502);
  const royxat = qoldiqSanada(rows, sana, { qidir, faqatMusbat: f.musbat !== '0' && !qidir });
  if (f.tartib === 'qoldiq') royxat.sort((a, b) => b.qoldiq - a.qoldiq);
  return json({ ok: true, sana, jami: royxat.length, limit: lim, offset: off, turlar: [], qatorlar: royxat.slice(off, off + lim).map(guruhJavob) });
}
async function qoldiqSanaRoyxat(env: Env, kid: number, sid: number, sana: string, nomi: string | null, lim: number): Promise<{ nomzodlar: Nomzod[]; jami: number } | null> {
  const rows = await harakatYukla(env, kid, sid, { gacha: sana });
  if (!rows) return null;
  const royxat = qoldiqSanada(rows, sana, { qidir: nomi, faqatMusbat: !nomi });
  if (!nomi) royxat.sort((a, b) => b.qoldiq - a.qoldiq);
  return { jami: royxat.length, nomzodlar: royxat.slice(0, lim).map((x) => ({ nomi: x.nomi, birligi: x.birligi, qoldiq: x.qoldiq, ball: 1, kalit: x.kalit, variantlar_soni: 1 })) };
}
async function qoldiqHozirRoyxat(env: Env, aid: number, kid: number, sid: number, nomi: string | null, lim: number): Promise<{ nomzodlar: Nomzod[]; jami: number } | null> {
  const r = await rpc<{ ok?: boolean; jami?: number; qatorlar?: Guruh[] }>(env, 't2_ombor_qoldiq_v2', { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid, p_filtr: { ...(nomi ? { qidir: nomi } : {}), musbat: '1', tartib: 'qoldiq' }, p_limit: lim, p_offset: 0 });
  if (!r.data?.ok) return null;
  return { jami: Number(r.data.jami ?? 0), nomzodlar: (r.data.qatorlar ?? []).map(nomzodga) };
}

type HisobotSorov = {
  davr?: { dan: string | null; gacha: string | null } | null; belgi?: unknown; dan?: unknown; gacha?: unknown; qidir?: string | null; yetkazuvchi?: string | null; qabul?: string | null;
  kontragent?: string | null; obyekt?: string | null; operatsiya?: unknown;
};
const yonalishOl = (v: unknown): 'prixod' | 'rasxod' | null => { const s = typeof v === 'string' ? v.toLowerCase() : ''; return /^(prixod|kirim)$/.test(s) ? 'prixod' : /^(rasxod|chiqim)$/.test(s) ? 'rasxod' : null; };

/** Hisobot: davr + filtrlar -> sof hisob (storno/qaytarishsiz, QQS siz/bilan). Xato bo'lsa Response. */
async function hisobotTayyor(env: Env, kid: number, sid: number, f: HisobotSorov, bugun: string): Promise<{ davr: Davr; hisobot: Hisobot } | Response> {
  const d = f.davr ? { belgi: 'ixtiyoriy' as const, dan: f.davr.dan, gacha: f.davr.gacha } : davrFiltrdan({ davr: f.belgi, dan: f.dan, gacha: f.gacha }, bugun);
  if (!d) return fail('DATE_INVALID', 400);
  const obyektlar = f.obyekt ? (await obyektTop(env, kid, f.obyekt)).map((o) => o.id) : null;
  const rows0 = await harakatYukla(env, kid, sid, { dan: d.dan, gacha: d.gacha });
  if (!rows0) return fail('SERVER_XATO', 502);
  const rows = await narxQoplash(env, kid, rows0);
  const flt: HisobotFiltr = { dan: d.dan, gacha: d.gacha, qidir: f.qidir ?? null, yetkazuvchi: f.yetkazuvchi ?? null, qabul: f.qabul ?? null, kontragent: f.kontragent ?? null, operatsiya: yonalishOl(f.operatsiya), obyekt_idlar: obyektlar ? (obyektlar.length ? obyektlar : [-1]) : null };
  return { davr: d, hisobot: hisobotYigish(rows, flt) };
}
const satr = (v: unknown, n = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const hisobotSorovi = (f: Record<string, unknown>): HisobotSorov => ({ belgi: f.davr, dan: f.dan, gacha: f.gacha, qidir: satr(f.qidir), yetkazuvchi: satr(f.yetkazuvchi), qabul: satr(f.qabul), kontragent: satr(f.kontragent), obyekt: satr(f.obyekt), operatsiya: f.operatsiya });

async function hisobotJavob(env: Env, kid: number, sid: number, b: Record<string, unknown>, lim: number, off: number): Promise<Response> {
  const f = b.filtr && typeof b.filtr === 'object' && !Array.isArray(b.filtr) ? b.filtr as Record<string, unknown> : {};
  const h = await hisobotTayyor(env, kid, sid, hisobotSorovi(f), toshkentBugun());
  if (h instanceof Response) return h;
  const sahifa = h.hisobot.qatorlar.slice(off, off + lim);
  const idlar = [...new Set(sahifa.map((x) => x.obyekt_id).filter((x): x is number => x != null))];
  const nomlar = new Map<number, string>();
  if (idlar.length) for (const o of (await rest<{ id: number; nom: string }>(env, `t2_obyekt?kompaniya_id=eq.${kid}&id=in.(${idlar.join(',')})&select=id,nom`)) ?? []) nomlar.set(o.id, o.nom);
  return json({ ok: true, davr: h.davr, jami: h.hisobot.jami, chetlatilgan: h.hisobot.chetlatilgan, jami_qator: h.hisobot.qatorlar.length, limit: lim, offset: off,
    qatorlar: sahifa.map((x) => ({ ...x, obyekt: x.obyekt_id != null ? nomlar.get(x.obyekt_id) ?? null : null })) });
}

/** Jarvis `ombor_eksport`: fayl o'zi berilmaydi — yuklab olish tavsifi (token yuklab olishda yechiladi). */
async function eksportReja(env: Env, kid: number, sid: number, b: Record<string, unknown>): Promise<Response> {
  const f = b.filtr && typeof b.filtr === 'object' && !Array.isArray(b.filtr) ? b.filtr as Record<string, unknown> : {};
  if (b.tur !== 'hisobot') return json({ ok: true, holat: 'eksport_tayyor', tur: 'qoldiq', yuklash: { amal: 'eksport', filtr: f }, izoh: 'Yuklab olinganda tokenlar yechiladi; qayta yuklash bepul.' });
  const h = await hisobotTayyor(env, kid, sid, hisobotSorovi(f), toshkentBugun());
  if (h instanceof Response) return h;
  return json({ ok: true, holat: 'eksport_tayyor', tur: 'hisobot', davr: h.davr, qator_soni: h.hisobot.qatorlar.length, jami: h.hisobot.jami, yuklash: { amal: 'eksport', tur: 'hisobot', filtr: f }, izoh: 'Yuklab olinganda tokenlar yechiladi; qayta yuklash bepul.' });
}

/** Kirim-chiqim hisoboti .xlsx (rasmiy hujjat yozuvchisi; token serverSarfla orqali, mazmun xeshi bo'yicha idempotent). */
async function eksportHisobot(ctx: Context, s: Sess, kid: number, sid: number, b: Record<string, unknown>): Promise<Response> {
  const aid = s.foydalanuvchi_id as number; const env = ctx.env;
  const f = b.filtr && typeof b.filtr === 'object' && !Array.isArray(b.filtr) ? b.filtr as Record<string, unknown> : {};
  const bugun = toshkentBugun();
  const h = await hisobotTayyor(env, kid, sid, hisobotSorovi(f), bugun);
  if (h instanceof Response) return h;
  const { qatorlar, jami } = h.hisobot;
  const idlar = [...new Set(qatorlar.map((x) => x.obyekt_id).filter((x): x is number => x != null))];
  const nomlar = new Map<number, string>();
  if (idlar.length) for (const o of (await rest<{ id: number; nom: string }>(env, `t2_obyekt?kompaniya_id=eq.${kid}&id=in.(${idlar.slice(0, 300).join(',')})&select=id,nom`)) ?? []) nomlar.set(o.id, o.nom);
  const v = new RasmiyVaraq({ nom: 'Приход-расход', kattaHarf: false, sarlavha: 'ЖУРНАЛ ПРИХОДА И РАСХОДА МАТЕРИАЛОВ', titul: [['Период', `${h.davr.dan ?? '…'} — ${h.davr.gacha ?? '…'}`], ['Операций', String(qatorlar.length)], ['НДС', `${jami.qqs_foiz} %`]], filtr: true, yonalish: 'landscape', muzlatUstun: 4,
    ustunlar: [{ sarlavha: '№', kenglik: 6, tur: 'tartib' }, { sarlavha: 'Дата', kenglik: 12, tur: 'matn' }, { sarlavha: 'Операция', kenglik: 11, tur: 'matn' }, { sarlavha: 'Наименование', kenglik: 46, tur: 'matn' }, { sarlavha: 'Ед.изм', kenglik: 9, tur: 'birlik' },
      { sarlavha: 'Количество', kenglik: 13, tur: 'hajm' }, { sarlavha: 'Контрагент', kenglik: 28, tur: 'matn' }, { sarlavha: 'Объект', kenglik: 24, tur: 'matn' },
      { sarlavha: 'Цена без НДС', kenglik: 14, tur: 'narx' }, { sarlavha: 'Сумма без НДС', kenglik: 16, tur: 'pul' }, { sarlavha: 'Сумма с НДС', kenglik: 16, tur: 'pul' }] });
  v.bosh();
  qatorlar.forEach((r, i) => v.qator('oddiy', [i + 1, r.sana, r.operatsiya === 'prixod' ? 'Приход' : 'Расход', r.nomi, r.birligi, r.obyomi, r.kontragent ?? '', r.obyekt_id != null ? nomlar.get(r.obyekt_id) ?? '' : '', r.narx, r.summa, r.summa_qqs]));
  v.qator('jami', ['', '', 'Приход', 'Итого без НДС / с НДС', '', null, '', '', null, jami.kirim_summa, jami.kirim_summa_qqs]);
  v.qator('jami', ['', '', 'Расход', 'Итого без НДС / с НДС', '', null, '', '', null, jami.chiqim_summa ?? null, jami.chiqim_summa_qqs ?? null]);
  const bytes = rasmiyKitob([v], { tur: 'ostatka' }).bytes;
  const xeshHex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([h.davr, qatorlar.map((r) => [r.id, r.obyomi, r.narx])]))))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const sarf = await serverSarfla(env, { actorId: aid, kompaniyaId: kid, turi: 'ombor_hisobot', xesh: xeshHex, bytes });
  if (!sarf.ok) return sarfRad(sarf);
  await audit(env, kid, sid, 'ombor_hisobot_eksport', aid, `qatorlar=${qatorlar.length}; sarf=${sarf.sarflandi}`);
  if (!bytes.length && sarf.operationId) await serverQaytar(env, { actorId: aid, kompaniyaId: kid, sarfOperationId: sarf.operationId });
  return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="kirim-chiqim-${h.davr.dan ?? 'boshi'}_${h.davr.gacha ?? bugun}.xlsx"`, 'X-Hujjat-Sarf': String(sarf.sarflandi), 'X-Hujjat-Bepul-Takror': sarf.bepulTakror ? '1' : '0', 'Cache-Control': 'no-store' } });
}

type EksportGuruh = { nomi: string; birligi: string; tur: string | null; kirim: number; chiqim: number; qoldiq: number };
/** Ostatka .xlsx: filtr bo'yicha HAMMA guruhlar (sahifalab o'qiladi, 5000 gacha). Token: serverSarfla (mazmun xeshi bo'yicha idempotent). */
async function eksport(ctx: Context, s: Sess, kid: number, sid: number, b: Record<string, unknown>): Promise<Response> {
  if (b.tur === 'hisobot') return eksportHisobot(ctx, s, kid, sid, b);
  const aid = s.foydalanuvchi_id as number; const env = ctx.env;
  const f = b.filtr && typeof b.filtr === 'object' && !Array.isArray(b.filtr) ? Object.fromEntries(Object.entries(b.filtr as Record<string, unknown>).filter(([, x]) => typeof x === 'string')) : {};
  const hammasi: EksportGuruh[] = [];
  const sanaTalab = typeof b.sana === 'string' && b.sana ? b.sana : null;
  if (sanaTalab) {
    // O'tgan sanadagi ostatka (SQL ostatkasi faqat hozirgi holatni beradi): harakatlardan shu sana oxirigacha hisoblanadi.
    if (!ISO.test(sanaTalab) || sanaTalab > toshkentBugun()) return fail('DATE_INVALID', 400);
    const rows = await harakatYukla(env, kid, sid, { gacha: sanaTalab });
    if (!rows) return fail('SERVER_XATO', 502);
    const qidir = typeof f.qidir === 'string' && f.qidir.trim() ? f.qidir.trim() : null;
    hammasi.push(...qoldiqSanada(rows, sanaTalab, { qidir, faqatMusbat: !qidir }).map((x) => ({ nomi: x.nomi, birligi: x.birligi, tur: null, kirim: x.kirim, chiqim: x.chiqim, qoldiq: x.qoldiq })));
  } else for (let off = 0; off < 5000; off += 500) {
    const r = await rpc<{ ok?: boolean; jami?: number; qatorlar?: EksportGuruh[] }>(env, 't2_ombor_qoldiq_v2', { p_actor_id: aid, p_kompaniya_id: kid, p_sklad_id: sid, p_filtr: f, p_limit: 500, p_offset: off });
    if (!r.data?.ok) return rpcNatija(r as { status: number; data: Record<string, unknown> | null });
    hammasi.push(...(r.data.qatorlar ?? []));
    if (off + 500 >= (r.data.jami ?? 0)) break;
  }
  // Rasmiy hujjat yozuvchisi (HUJJAT_STANDARTI_V1): jadval formatlari, kolontitul, filtr — boshqa hujjatlar bilan bir xil dvigatel.
  const bugun = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const v = new RasmiyVaraq({ nom: 'Остаток', kattaHarf: false, sarlavha: 'ОСТАТОК МАТЕРИАЛОВ НА СКЛАДЕ', titul: [['Дата', sanaTalab ?? bugun], ['Позиций', String(hammasi.length)]], filtr: true, yonalish: 'landscape', muzlatUstun: 2,
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
    'Content-Disposition': `attachment; filename="ostatka-${sanaTalab ?? bugun}.xlsx"`, 'X-Hujjat-Sarf': String(sarf.sarflandi), 'X-Hujjat-Bepul-Takror': sarf.bepulTakror ? '1' : '0', 'Cache-Control': 'no-store' } });
}