/**
 * /api/hujjat-paket - Hujjatlar paketini SERVERDA yig'ish: sayt, Android, Windows (va bot) uchun yagona nuqta. Yangi mantiq yo'q:
 * `src/lib/hujjat-paket/*` (reja, ZIP yo'llari, «Tarkib», token bahosi) ishlatiladi; nomzodlar - `/api/hujjat-maydoni`, Disk - `/api/hujjat-maydoni-ol`,
 * yasash - `/api/hujjat-yarat` (token SHU YERDA yechiladi, mazmun kaliti bo'yicha bir marta; qayta yuklash bepul).
 *
 *   POST { amal:'baho', kompaniya_id, filtr?, kalitlar? }  -> { ok, tanlangan, tolanadigan, bepul, token|null }   (hech narsa yozilmaydi, token yechilmaydi)
 *   POST { amal:'yig',  kompaniya_id, filtr?, kalitlar?, chiqish:'zip'|'excel', sarlavha? }
 *        -> <= 25 MB: fayl baytlari (Content-Disposition, X-Paket-Soni, X-Paket-Xatolar); `yetkazish:'havola'` so'ralsa (qurilma ilovalari) har doim havola
 *        -> >  25 MB: JSON { ok, havola, hajm, soni, xatolar } (R2, 15 daqiqa, faqat shu aktor ochadi; hech qachon rad etilmaydi)
 *   GET  ?amal=ol&k=<r2 kalit> -> R2 dagi tayyor paket (aktorniki va muddati tugamagan bo'lsa)
 */
import { hmRpc, sessiyaAktor, type HmEnv } from '../_shared/hujjat-maydoni';
import { haqiqiyDeps, navbatniIshla } from '../_shared/hujjat-yangila';
import { tayyorlashKerak, tezlatSorovlari } from '../../src/lib/hujjat-paket/eskirgan';
import { r2Yoz } from '../_shared/r2-saqlash';
import { PAKET_BAYT_CHEGARA, PAKET_HAVOLA_DAQIQA, paketBaho, paketKalitAktorniki, paketR2Kalit, paketYigServer, type PaketChiqish } from '../_shared/hujjat-paket-yig';
import { onRequestGet as maydonGet } from './hujjat-maydoni';
import { onRequestGet as maydonOlGet } from './hujjat-maydoni-ol';
import { onRequestPost as yaratPost } from './hujjat-yarat';
import { onRequestPost as sbPost } from './sb';
import type { Nomzod } from '../../src/lib/hujjat-paket/nomzod';
import type { RoyxatQator } from '../../src/lib/hujjat-paket/royxat';
import { kengaytmaBilan } from '../../src/lib/hujjat-paket/fayl-nomi';
import { tizimImzosiniQoy } from '../../src/lib/hujjat-yozuvchi/tizim-imzo';
import { YetkazishXato, type Yetkazuvchi } from '../../src/lib/hujjat-paket/yigish';
import { yasashSorovi } from '../../src/lib/hujjat-paket/yasash-sorov';
import { narxHisob, type TokenHolat } from '../../src/api/t2-token';

type Env = HmEnv & { R2_CANONICAL?: R2Bucket };
type Ctx = Parameters<PagesFunction<Env>>[0];
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const butun = (v: unknown): number | null => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

/** Ichki chaqiruv: o'sha sessiya (Cookie) bilan boshqa handler (tashqi middleware allaqachon ruxsat tekshirgan). */
async function ichki(ctx: Ctx, h: PagesFunction<Env>, api: string, o: { query?: Record<string, unknown>; json?: unknown }): Promise<Response> {
  const url = new URL(ctx.request.url); url.pathname = '/api/' + api; url.search = '';
  for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, String(v));
  const headers = new Headers(); const ck = ctx.request.headers.get('Cookie'); if (ck) headers.set('Cookie', ck);
  let body: BodyInit | undefined;
  if (o.json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(o.json); }
  const request = new Request(url.toString(), { method: o.json !== undefined ? 'POST' : 'GET', headers, body });
  return h({ ...ctx, request } as Ctx) as Promise<Response>;
}

const filtrTozala = (f: unknown): Record<string, unknown> => (f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, unknown>) : {});

/** Filtr bo'yicha nomzodlar (server sahifalaydi: 500 tadan, <= 3000), `kalitlar` bo'lsa faqat shular. */
async function nomzodlar(ctx: Ctx, kid: number, filtr: Record<string, unknown>, kalitlar: ReadonlySet<string> | null): Promise<RoyxatQator[] | Response> {
  const chiqish: RoyxatQator[] = [];
  for (let offset = 0; offset < 3000; offset += 500) {
    const r = await ichki(ctx, maydonGet, 'hujjat-maydoni', { query: { amal: 'paket_royxat', kompaniya_id: kid, filtr: JSON.stringify({ ...filtr, offset, sahifa_limit: 500 }) } });
    const j = await r.json().catch(() => null) as { ok?: boolean; nomzodlar?: RoyxatQator[]; jami?: number; code?: string } | null;
    if (!r.ok || !j?.ok || !Array.isArray(j.nomzodlar)) return json({ ok: false, code: j?.code ?? 'ROYXAT_OQILMADI' }, r.ok ? 502 : r.status);
    for (const n of j.nomzodlar) if (!kalitlar || kalitlar.has(n.kalit)) chiqish.push(n);
    if (offset + 500 >= (j.jami ?? j.nomzodlar.length) || (kalitlar && chiqish.length >= kalitlar.size)) break;
  }
  return chiqish;
}

async function narxFunksiya(ctx: Ctx, kid: number): Promise<((katak: number) => number | null) | null> {
  const r = await ichki(ctx, sbPost, 'sb', { json: { soro: 'token_holat_v1', kompaniya_id: kid } });
  const j = await r.json().catch(() => null) as { ok?: boolean; natija?: TokenHolat } | null;
  const th = r.ok && j?.ok ? j.natija : null;
  const n = th?.narxlar.find((x) => x.amal === 'hujjat');
  return n && th?.sozlama ? (k: number) => narxHisob(n, k, th.sozlama)?.token ?? null : null;
}

const faylNomi = (h: Headers, zaxira: string): string => {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(h.get('Content-Disposition') ?? '');
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* zaxira */ } }
  return zaxira;
};

function yetkazuvchi(ctx: Ctx, kid: number): Yetkazuvchi {
  return {
    async diskdan(n: Nomzod) {
      if (n.fayl_id == null) throw new Error('Diskda fayl yo\'q');
      const r = await ichki(ctx, maydonOlGet, 'hujjat-maydoni-ol', { query: { id: n.fayl_id } });
      if (!r.ok) throw new Error(`Diskdan o'qilmadi (HTTP ${r.status})`);
      const bytes = new Uint8Array(await r.arrayBuffer()); const nom = faylNomi(r.headers, `${n.sarlavha}.xlsx`); const mime = r.headers.get('Content-Type');
      // F-2 Diskda imzosiz: paketga /api/hujjat-yarat bergan fayldek QURAI imzosi qo'yiladi.
      return { bytes: n.tur === 'f2' ? tizimImzosiniQoy(bytes, { hujjat: kengaytmaBilan(nom, bytes, mime) }) : bytes, faylNomi: nom, mime };
    },
    async yasa(n: Nomzod) {
      const s = yasashSorovi(n);
      if (!s || n.obyekt_id == null) throw new Error('Bu hujjatni yasab bo\'lmaydi');
      const r = await ichki(ctx, yaratPost, 'hujjat-yarat', { json: { ...s.parametrlar, ...(s.tur === 'f2' ? { disk_afzal: 1 } : {}), amal: 'yarat', tur: s.tur, format: 'xlsx', kompaniya_id: kid, obyekt_id: n.obyekt_id } });
      if (!r.ok || /json/i.test(r.headers.get('Content-Type') ?? '')) {
        throw new YetkazishXato(r.status === 402 ? 'Tokenlar yetarli emas' : `Yasalmadi (HTTP ${r.status})`, { toxtat: r.status === 402, vaqtinchalik: [408, 429, 502, 503, 504].includes(r.status) });
      }
      const manba = r.headers.get('X-Hujjat-Manba');
      return { bytes: new Uint8Array(await r.arrayBuffer()), faylNomi: faylNomi(r.headers, `${n.sarlavha}.xlsx`), ...(manba === 'disk' || manba === 'yasaldi' ? { manba } : {}) };
    },
  };
}

/**
 * Oldindan tayyorlash: tanlangan hujjatlardan Diskda eskirgan/yo'q F-2 va yangilanayotgan boshqa turlarni navbatda DARHOL muddatli qiladi
 * (`t2_hujjat_yangila_tezlat_v1` - migratsiya qo'llanmagan bo'lsa jim o'tkazib yuboriladi) va cheklangan (3 ta, 20 s) sikl bilan serverda yasaydi (token yechilmaydi).
 * Mijoz qolgan > 0 va yutuq bor ekan bir necha marta ketma-ket chaqiradi; yuklab olish vaqtida hammasi Diskda yangi turadi.
 */
async function tayyorla(ctx: Ctx, kid: number, filtr: Record<string, unknown>, kalitlar: ReadonlySet<string> | null): Promise<Response> {
  const r0 = await nomzodlar(ctx, kid, filtr, kalitlar);
  if (r0 instanceof Response) return r0;
  const kerak = tayyorlashKerak(r0 as never[], kalitlar) as RoyxatQator[];
  if (!kerak.length) return json({ ok: true, kerak: 0, qolgan: 0, korildi: 0, yangilandi: 0, xato: 0, xatolar: [] });
  for (const [tur, idlar] of tezlatSorovlari(kerak as never[])) await hmRpc(ctx.env, 't2_hujjat_yangila_tezlat_v1', { p_kompaniya: kid, p_tur: tur, p_idlar: idlar }).catch(() => null);
  const n = await navbatniIshla(haqiqiyDeps(ctx as never, { kompaniyaId: kid }), { limit: 3, byudjetMs: 20_000 }).catch((e) => ({ korildi: 0, yangilandi: 0, otkazildi: 0, xato: 1, xatolar: [e instanceof Error ? e.message.slice(0, 120) : 'xato'] }));
  const r1 = await nomzodlar(ctx, kid, filtr, kalitlar);
  const qolgan = r1 instanceof Response ? kerak.length : tayyorlashKerak(r1 as never[], kalitlar).length;
  return json({ ok: true, kerak: kerak.length, qolgan, korildi: n.korildi, yangilandi: n.yangilandi, xato: n.xato, xatolar: n.xatolar.slice(0, 5) });
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await sessiyaAktor(ctx);
  if (a instanceof Response) return a;
  const u = new URL(ctx.request.url);
  if (u.searchParams.get('amal') !== 'ol') return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
  const k = u.searchParams.get('k') ?? '';
  if (!ctx.env.R2_CANONICAL) return json({ ok: false, code: 'R2_YOQ' }, 503);
  if (!paketKalitAktorniki(k, a.actorId)) return json({ ok: false, code: 'TOPILMADI' }, 404);
  const o = await ctx.env.R2_CANONICAL.get(k);
  if (!o) return json({ ok: false, code: 'TOPILMADI' }, 404);
  if (Number(o.customMetadata?.muddat ?? 0) < Date.now()) { await ctx.env.R2_CANONICAL.delete(k).catch(() => undefined); return json({ ok: false, code: 'MUDDAT_TUGAGAN' }, 410); }
  return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType ?? 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(k.split('/').pop() ?? 'paket')}`, 'Cache-Control': 'no-store' } });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await sessiyaAktor(ctx);
  if (a instanceof Response) return a;
  const b = await ctx.request.json().catch(() => null) as { amal?: string; kompaniya_id?: unknown; filtr?: unknown; kalitlar?: unknown; chiqish?: unknown; sarlavha?: unknown; yetkazish?: unknown } | null;
  const kid = butun(b?.kompaniya_id);
  if (!b || !kid) return json({ ok: false, code: 'KOMPANIYA_KERAK' }, 400);
  if (b.amal !== 'baho' && b.amal !== 'yig' && b.amal !== 'tayyorla') return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
  const kalitlar = Array.isArray(b.kalitlar) ? new Set(b.kalitlar.map(String).slice(0, 3000)) : null;
  const r = await nomzodlar(ctx, kid, filtrTozala(b.filtr), kalitlar);
  if (r instanceof Response) return r;
  const tanlov = kalitlar ?? new Set(r.map((n) => n.kalit));

  if (b.amal === 'tayyorla') return tayyorla(ctx, kid, filtrTozala(b.filtr), kalitlar);

  if (b.amal === 'baho') {
    const x = paketBaho(r, tanlov, await narxFunksiya(ctx, kid));
    return json({ ok: true, tanlangan: x.tanlangan, tolanadigan: x.tolanadigan, bepul: x.bepul, token: x.token });
  }

  const chiqish: PaketChiqish = b.chiqish === 'excel' ? 'excel' : 'zip';
  const sarlavha = typeof b.sarlavha === 'string' && b.sarlavha.trim() ? b.sarlavha.trim().slice(0, 120) : 'HUJJATLAR PAKETI';
  let natija;
  try { natija = await paketYigServer(r.filter((n) => tanlov.has(n.kalit)), sarlavha, chiqish, yetkazuvchi(ctx, kid)); }
  catch (e) { return json({ ok: false, code: 'YIGISH_XATO', xato: e instanceof Error ? e.message.slice(0, 200) : 'xato' }, 502); }
  if (!natija || !natija.soni) return json({ ok: false, code: 'HUJJAT_YOQ', xatolar: natija?.xatolar ?? [], holatlar: natija?.holatlar?.slice(0, 300) ?? [] }, 422);

  const xatolar = natija.xatolar.slice(0, 50);
  const holatlar = natija.holatlar.slice(0, 300);
  if (b.yetkazish !== 'havola' && natija.bytes.byteLength <= PAKET_BAYT_CHEGARA) {
    return new Response(natija.bytes as unknown as BodyInit, { headers: {
      'Content-Type': natija.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(natija.nom)}`,
      'X-Paket-Soni': String(natija.soni), 'X-Paket-Xatolar': encodeURIComponent(JSON.stringify(xatolar)).slice(0, 4000), 'Cache-Control': 'no-store',
    } });
  }
  if (!ctx.env.R2_CANONICAL) return json({ ok: false, code: 'R2_YOQ', xato: 'Katta paketni saqlab bo\'lmadi' }, 503);
  const kalit = paketR2Kalit(a.actorId, crypto.randomUUID(), natija.nom);
  await r2Yoz(ctx.env.R2_CANONICAL, kalit, natija.bytes, { httpMetadata: { contentType: natija.mime }, customMetadata: { muddat: String(Date.now() + PAKET_HAVOLA_DAQIQA * 60_000) } });
  return json({ ok: true, havola: `/api/hujjat-paket?amal=ol&k=${encodeURIComponent(kalit)}`, hajm: natija.bytes.byteLength, soni: natija.soni, xatolar, holatlar });
};
