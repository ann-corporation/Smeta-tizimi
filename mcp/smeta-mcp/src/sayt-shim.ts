/**
 * Sayt yuklovchilari uchun MA'LUMOT MANBAI (MCP): frontend hujjat dvigateli (`src/api/*` yuklovchilari) ma'lumotni nisbiy
 * `/api/sb`, `/api/tomon`, `/api/kompaniya-sozlama` manzillaridan oladi (brauzerda ham, Worker'da ham). Ikkinchi yuklovchi
 * yozilmaydi (har o'zgarish ikki joyda bo'lib ketardi): bu modul o'sha so'rovlarni MCP ning o'z Postgres ulanishiga yo'naltiradi —
 * `functions/_shared/hujjat-ichki.ts` (Worker) bilan bir xil g'oya, faqat manba boshqa.
 *
 *  - FAQAT o'qish yo'llari + token/disk RPC lari (`RPC_RUXSAT`): boshqa yo'l/RPC/jadval — aniq xato (jim emas).
 *  - Jadval o'qishi: PostgREST filtrining kichik qismi (eq/neq/gt/gte/lt/lte/in/is), identifikatorlar qat'iy tekshiriladi,
 *    qiymatlar faqat parametr. T2 qator versiyasi qoidasi shlyuz bilan BIR XIL (`versiyaFiltri` — shu fayldan import).
 *  - `limit` dan ko'p qator bo'lsa — `toliq:false` (yarim ma'lumotdan hujjat/summa chiqmaydi).
 *  - Bir vaqtda faqat BITTA ish (global `fetch` almashtiriladi); tugagach asl `fetch` tiklanadi.
 */
import type { Mijoz } from './db';
import { versiyaFiltri } from './frontend';

/** `SUPABASE_URL` o'rniga beriladigan soxta manba: `serverSarfla` / `diskArxivla` shu manzilga `fetch` qiladi — shim ushlaydi. */
export const SHIM_BAZA = 'https://smeta-mcp.invalid';

export const JADVAL_RUXSAT: ReadonlySet<string> = new Set([
  't2_daraxt', 't2_qator', 't2_akt_qator', 't2_f2_tafsilot', 't2_nakrutka_podval_royxat', 't2_token_harakat',
]);

/** soro → p_ parametrlari. `actor` — MCP aktori; boshqalar so'rovdan (tekshirilgan raqam). */
type SoroTur = { obyekt?: boolean; kompaniya?: boolean; tur?: boolean; shartnoma?: boolean };
export const SORO_RUXSAT: Readonly<Record<string, SoroTur>> = {
  akt_reestr_obyekt_v1: { obyekt: true, tur: true },
  shartnoma_liniya_v1: { kompaniya: true },
  akt_podval_ol_v1: { obyekt: true },
  obyekt_nakrutka_v1: { obyekt: true, shartnoma: true },
};

export const RPC_RUXSAT: ReadonlySet<string> = new Set([
  't2_token_sarfla_v1', 't2_token_qaytar_v1',
  't2_disk_tizim_yoz_v1', 't2_document_canonical_reserve_v1', 't2_document_canonical_finalize_v1',
  // Hujjat doim tayyor: Diskdagi tayyor F-2 versiyasi (faqat o'qish) va uni yuklab olish
  't2_hujjat_tayyor_ol_v1', 't2_hm_yuklab_v1',
]);

const ID = /^[a-z_][a-z0-9_]*$/;
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is']);
const SQL_OP: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const MAX_LIMIT = 200_000;

const json = (x: unknown, status = 200) => Response.json(x, { status });
const musbat = (v: unknown): number | null => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

type Sorov = { jadval: string; ustunlar?: string; filtrlar?: Array<[string, string]>; tartib?: string; limit?: number; versiya?: unknown; filtrMatn?: string };

/** PostgREST qiymati: `in.(1,2,"a b")` ro'yxati. */
function royxatBol(s: string): string[] {
  const ichki = /^\((.*)\)$/s.exec(s)?.[1] ?? '';
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([^,]+)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(ichki))) out.push(x[1] !== undefined ? x[1].replace(/\\(.)/g, '$1') : x[2].trim());
  return out;
}

/** URL-kodlangan (kirillcha qidiruv) bo'lishi mumkin; kodlanmagan % — o'z holicha. */
const ochish = (x: string): string => { try { return decodeURIComponent(x); } catch { return x; } };

/** Jadval o'qishi → SQL (qat'iy oq ro'yxat, parametrlangan). Sof funksiya (testlanadi). */
export function jadvalSql(s: Sorov): { sql: string; params: unknown[]; limit: number } {
  if (!JADVAL_RUXSAT.has(s.jadval)) throw new Error(`Jadval ochiq emas: ${s.jadval}`);
  const ustunlar = (s.ustunlar && s.ustunlar !== '*' ? s.ustunlar.split(',').map((x) => x.trim()) : ['*']);
  for (const u of ustunlar) if (u !== '*' && !ID.test(u)) throw new Error(`Ustun nomi qo'llab-quvvatlanmaydi: ${u}`);
  const filtrlar = [...(s.filtrlar ?? [])];
  if (s.filtrMatn) {
    for (const bo of s.filtrMatn.split('&')) {
      if (!bo) continue;
      const i = bo.indexOf('=');
      if (i <= 0) throw new Error(`Filtr noto'g'ri: ${bo.slice(0, 40)}`);
      filtrlar.push([ochish(bo.slice(0, i)), ochish(bo.slice(i + 1))]);
    }
  }
  const vq = versiyaFiltri(s.jadval, { filtr: s.filtrMatn ?? filtrlar.map(([k, v]) => `${k}=${v}`).join('&'), versiya: s.versiya });
  if (!vq.ok) throw new Error(vq.error);
  if (vq.filtr) { const i = vq.filtr.indexOf('='); filtrlar.push([vq.filtr.slice(0, i), vq.filtr.slice(i + 1)]); }
  const params: unknown[] = [];
  const shart: string[] = [];
  for (const [kol, qiy] of filtrlar) {
    if (!ID.test(kol)) throw new Error(`Filtr ustuni qo'llab-quvvatlanmaydi: ${kol}`);
    const nuqta = qiy.indexOf('.');
    const op = nuqta > 0 ? qiy.slice(0, nuqta) : '';
    const val = nuqta > 0 ? qiy.slice(nuqta + 1) : '';
    if (!OPS.has(op)) throw new Error(`Filtr operatori qo'llab-quvvatlanmaydi: ${kol}=${op || qiy.slice(0, 12)}`);
    if (op === 'in') {
      const v = royxatBol(val);
      if (!v.length) { shart.push('false'); continue; }
      shart.push(`"${kol}" in (${v.map((x) => { params.push(x); return `$${params.length}`; }).join(',')})`);
    } else if (op === 'is') {
      if (!['null', 'true', 'false'].includes(val)) throw new Error(`is.${val} qo'llab-quvvatlanmaydi`);
      shart.push(`"${kol}" is ${val}`);
    } else {
      params.push(val);
      shart.push(`"${kol}" ${SQL_OP[op]} $${params.length}`);
    }
  }
  let order = '';
  if (s.tartib) {
    const q = s.tartib.split(',').map((x) => {
      const [kol, yon = 'asc'] = x.trim().split('.');
      if (!ID.test(kol) || !['asc', 'desc'].includes(yon)) throw new Error(`Tartib qo'llab-quvvatlanmaydi: ${x}`);
      return `"${kol}" ${yon}`;
    });
    order = ` order by ${q.join(', ')}`;
  }
  const limit = Math.min(Math.max(1, Math.floor(s.limit ?? 50_000)), MAX_LIMIT);
  const sel = ustunlar.map((u) => (u === '*' ? '*' : `"${u}"`)).join(', ');
  const sql = `select ${sel} from public."${s.jadval}"${shart.length ? ` where ${shart.join(' and ')}` : ''}${order} limit ${limit + 1}`;
  return { sql, params, limit };
}

/** RPC chaqiruvi (nomlangan argumentlar, PostgREST kabi): `select public.fn(p_a => $1, ...)`. */
export function rpcSql(nom: string, args: Record<string, unknown>): { sql: string; params: unknown[] } {
  if (!ID.test(nom)) throw new Error(`RPC nomi noto'g'ri: ${nom}`);
  const params: unknown[] = [];
  const nomlangan = Object.entries(args).map(([k, v]) => {
    if (!ID.test(k)) throw new Error(`RPC argument nomi noto'g'ri: ${k}`);
    params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
    return `"${k}" => $${params.length}`;
  });
  return { sql: `select public."${nom}"(${nomlangan.join(', ')}) as r`, params };
}

/** Xatoda tranzaksiya buzilmasin: har shim so'rovi SAVEPOINT ichida. */
async function himoyali<T>(m: Mijoz, fn: () => Promise<T>): Promise<T> {
  await m.query('SAVEPOINT sayt_shim');
  try {
    const r = await fn();
    await m.query('RELEASE SAVEPOINT sayt_shim');
    return r;
  } catch (e) {
    await m.query('ROLLBACK TO SAVEPOINT sayt_shim').catch(() => undefined);
    throw e;
  }
}

export type ShimKontekst = { m: Mijoz; aktorId: number };

async function jadvalOqi(k: ShimKontekst, s: Sorov): Promise<Response> {
  const q = jadvalSql(s);
  const r = await himoyali(k.m, () => k.m.query<Record<string, unknown>>(q.sql, q.params));
  const toliq = r.rows.length <= q.limit;
  const qatorlar = toliq ? r.rows : r.rows.slice(0, q.limit);
  return json({ ok: true, qatorlar, soni: qatorlar.length, jamiServerda: toliq ? qatorlar.length : null, toliq });
}

async function rpcChaqir(k: ShimKontekst, nom: string, args: Record<string, unknown>): Promise<unknown> {
  const q = rpcSql(nom, args);
  const r = await himoyali(k.m, () => k.m.query<{ r: unknown }>(q.sql, q.params));
  return r.rows[0]?.r ?? null;
}

async function apiSb(k: ShimKontekst, body: Record<string, unknown>): Promise<Response> {
  if (typeof body.soro === 'string') {
    const t = SORO_RUXSAT[body.soro];
    if (!t) return json({ ok: false, error: `So'rov ochiq emas: ${body.soro}` });
    const args: Record<string, unknown> = {};
    if (t.obyekt) { const id = musbat(body.obyekt_id); if (!id) return json({ ok: false, error: "obyekt_id noto'g'ri" }); args.p_obyekt_id = id; }
    if (t.kompaniya) { const id = musbat(body.kompaniya_id); if (!id) return json({ ok: false, error: "kompaniya_id noto'g'ri" }); args.p_kompaniya_id = id; }
    args.p_actor_id = k.aktorId;
    if (t.tur && body.tur != null && body.tur !== '') {
      if (body.tur !== 'f2' && body.tur !== 'fakt') return json({ ok: false, error: "tur f2 yoki fakt bo'lishi kerak" });
      args.p_tur = body.tur;
    }
    if (t.shartnoma && body.shartnoma_id != null && String(body.shartnoma_id) !== '') {
      const sid = musbat(body.shartnoma_id);
      if (!sid) return json({ ok: false, error: "shartnoma_id noto'g'ri" });
      args.p_shartnoma_id = sid;
    }
    try { return json({ ok: true, natija: await rpcChaqir(k, `t2_${body.soro}`, args) }); }
    catch (e) { return json({ ok: false, error: `So'rov bajarilmadi (${e instanceof Error ? e.message.slice(0, 120) : 'xato'})` }); }
  }
  try {
    return await jadvalOqi(k, { jadval: String(body.jadval ?? ''), ustunlar: typeof body.ustunlar === 'string' ? body.ustunlar : undefined, filtrlar: [],
      filtrMatn: typeof body.filtr === 'string' ? body.filtr : '', tartib: typeof body.tartib === 'string' ? body.tartib : undefined,
      limit: typeof body.limit === 'number' ? body.limit : undefined, versiya: body.versiya });
  } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : 'xato' }); }
}

async function apiTomon(k: ShimKontekst, u: URL): Promise<Response> {
  if (u.searchParams.get('bolim') !== 'imzochilar') return json({ ok: false, error: "Bo'lim ochiq emas" }, 400);
  const kid = musbat(u.searchParams.get('kompaniya_id')), oid = musbat(u.searchParams.get('obyekt_id'));
  if (!kid || !oid) return json({ ok: false, error: 'obyekt_id kerak' }, 400);
  const razdel = musbat(u.searchParams.get('razdel_id'));
  const d = await rpcChaqir(k, 't2_obyekt_imzochilar_v1', { p_actor_id: k.aktorId, p_kompaniya_id: kid, p_obyekt_id: oid, p_razdel_id: razdel });
  // `tomon.ts rpc()` bilan bir xil o'rash.
  if (d && typeof d === 'object' && !Array.isArray(d) && typeof (d as { ok?: unknown }).ok === 'boolean') return json(d);
  return json({ ok: true, natija: d });
}

async function apiSozlama(k: ShimKontekst, u: URL): Promise<Response> {
  const kid = musbat(u.searchParams.get('kompaniya_id'));
  if (!kid) return json({ ok: false, code: 'REQUEST_INVALID' }, 400);
  const d = await rpcChaqir(k, 't2_kompaniya_sozlama_ol_v1', { p_actor_id: k.aktorId, p_kompaniya_id: kid }) as { ok?: unknown; code?: unknown } | null;
  if (!d) return json({ ok: false, code: 'SERVER_XATO' }, 500);
  if (d.ok !== true) return json({ ok: false, code: typeof d.code === 'string' ? d.code : 'SERVER_XATO' }, 403);
  return json(d);
}

/** `SHIM_BAZA/rest/v1/...` — `serverSarfla` / `diskArxivla` ishlatadigan PostgREST ko'rinishi. */
async function rest(k: ShimKontekst, u: URL, init: RequestInit): Promise<Response> {
  const yol = u.pathname.replace(/^\/rest\/v1\//, '');
  if (yol.startsWith('rpc/')) {
    const nom = yol.slice(4);
    if (!RPC_RUXSAT.has(nom)) return json({ message: `RPC ochiq emas: ${nom}` }, 404);
    let args: Record<string, unknown> = {};
    try { args = typeof init.body === 'string' && init.body ? JSON.parse(init.body) as Record<string, unknown> : {}; } catch { return json({ message: 'JSON noto\'g\'ri' }, 400); }
    try { return json(await rpcChaqir(k, nom, args)); } catch (e) { return json({ message: e instanceof Error ? e.message.slice(0, 200) : 'xato' }, 400); }
  }
  const filtrlar: Array<[string, string]> = [];
  let ustunlar: string | undefined, tartib: string | undefined, limit: number | undefined;
  for (const [a, b] of u.searchParams) {
    if (a === 'select') ustunlar = b; else if (a === 'order') tartib = b; else if (a === 'limit') limit = Number(b); else filtrlar.push([a, b]);
  }
  try {
    const r = await jadvalOqi(k, { jadval: yol, ustunlar, filtrlar, tartib, limit });
    const j = await r.json() as { ok: boolean; qatorlar?: unknown[] };
    return json(j.qatorlar ?? []);
  } catch (e) { return json({ message: e instanceof Error ? e.message.slice(0, 200) : 'xato' }, 400); }
}

/** Shim `fetch`: ruxsat etilmagan nisbiy yo'l — 404 (jim emas). Mutloq (shim bazasiga o'xshamagan) URL — rad. */
export function shimFetch(k: ShimKontekst): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init.method ?? 'GET').toUpperCase();
    const bazaMi = href.startsWith(SHIM_BAZA);
    if (!href.startsWith('/') && !bazaMi) return json({ ok: false, code: 'TASHQI_URL', error: 'MCP: tashqi tarmoq so\'rovi ruxsat etilmagan' }, 403);
    const u = new URL(href, SHIM_BAZA);
    if (bazaMi) return rest(k, u, init);
    if (u.pathname === '/api/sb' && method === 'POST') {
      let body: Record<string, unknown> = {};
      try { body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}; } catch { return json({ ok: false, error: "JSON noto'g'ri" }, 400); }
      return apiSb(k, body);
    }
    if (u.pathname === '/api/tomon' && method === 'GET') return apiTomon(k, u);
    if (u.pathname === '/api/kompaniya-sozlama' && method === 'GET') return apiSozlama(k, u);
    return json({ ok: false, code: 'ICHKI_YOL_YOQ', error: "Ruxsat etilmagan ichki yo'l" }, 404);
  }) as typeof fetch;
}

let navbat: Promise<unknown> = Promise.resolve();

/** `ish` davomida global `fetch` shimga yo'naladi (bir vaqtda bitta); xatodan keyin ham asl holat tiklanadi. */
export function shimRejimda<T>(k: ShimKontekst, ish: () => Promise<T>, tugash?: () => void): Promise<T> {
  const nat = navbat.then(async () => {
    const asl = globalThis.fetch;
    globalThis.fetch = shimFetch(k);
    try { return await ish(); } finally { globalThis.fetch = asl; tugash?.(); }
  });
  navbat = nat.catch(() => undefined);
  return nat;
}

/**
 * Doimiy qo'riqchi: shim rejimidan TASHQARIDA frontend API ning nisbiy `fetch('/api/...')` chaqiruvi (masalan yozuv funksiyalari)
 * jim muvaffaqiyat yoki tushunarsiz «Invalid URL» emas, aniq xato beradi — MCP yozuvni faqat o'z tranzaksiyasi orqali qiladi.
 */
export function relativFetchQoriqchi(): void {
  const asl = globalThis.fetch;
  if ((asl as { qoriqchi?: boolean }).qoriqchi) return;
  const q = ((input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (href.startsWith('/')) return Promise.reject(new Error(`MCP: frontend API «${href.split('?')[0]}» Node'da mavjud emas (bazaga MCP o'zi ulanadi; faqat f2_excel ichida o'qish yo'llari shim orqali).`));
    return asl(input as never, init as never);
  }) as typeof fetch & { qoriqchi?: boolean };
  q.qoriqchi = true;
  globalThis.fetch = q;
}