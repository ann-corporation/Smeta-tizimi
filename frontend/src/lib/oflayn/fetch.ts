/**
 * fetch qatlami (faqat native ko'prik bor bo'lganda o'rnatiladi; oddiy brauzerda hech qachon):
 *  - O'QISH (GET /api/sessiya, /api/company, /api/obyekt-paket, /api/ish-joyi, POST /api/sb): server javob berdi ->
 *    shifrlangan native keshga yoziladi; TARMOQ UZILGANDA keshdan beriladi. Server javob bergan bo'lsa (xato bo'lsa ham)
 *    kesh HECH QACHON berilmaydi. Qiymatlar aynan keshdagidek; noma'lum — noma'lum qoladi (hech narsa qayta hisoblanmaydi).
 *  - YOZISH: faqat Fakt (fakt_yoz_v2 / fakt_belgila_v2) tarmoq uzilganda navbatga tushadi; qolgan hamma yozish
 *    (F-2, imzo, to'lov, import, ...) oflayn ishlamaydi — asl tarmoq xatosi o'zgarmay qaytadi.
 */
import type { Kopri, OflaynHolat } from './kopri';
import { sha256Hex } from './sha256';
import { oflaynYangila, oflaynKorinish } from './holat';
import { FaktNavbat, NAVBAT_AMALLARI, NAVBAT_URL } from './navbat';
import { t } from '../../i18n/til';

const OQISH_GET = new Set(['/api/sessiya', '/api/company', '/api/obyekt-paket', '/api/ish-joyi']);
const SAQLASH_CHEGARA = 8 * 1024 * 1024; // bitta javob (kesh yozuvi MAX 24 MB; bundan kattasi yozilmaydi)

export type FetchSozlama = {
  kopri: Kopri;
  navbat: FaktNavbat;
  /** Ko'prik holati (boshlang'ich `oflayn_holat`): tayyor bo'lmasa kesh/navbat ishlatilmaydi. */
  tayyor: () => Promise<OflaynHolat | null>;
  origin?: string;
  now?: () => number;
  onlayn?: () => boolean;
};

type Soro = { tur: 'oqish' | 'fakt' | 'chiqish' | null; method: string; yol: string; body: string };

async function soroOl(input: RequestInfo | URL, init: RequestInit | undefined, origin: string): Promise<Soro> {
  const bosh: Soro = { tur: null, method: 'GET', yol: '', body: '' };
  let url: URL;
  try { url = new URL(input instanceof Request ? input.url : String(input), origin); } catch { return bosh; }
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) return bosh;
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let body = '';
  if (method === 'POST') {
    if (typeof init?.body === 'string') body = init.body;
    else if (init?.body == null && input instanceof Request) body = await input.clone().text().catch(() => '');
    else if (init?.body != null) return { ...bosh, method }; // FormData/Blob va h.k. — kesh/navbat uchun emas
  }
  const yol = url.pathname + url.search;
  if (method === 'GET' && OQISH_GET.has(url.pathname)) return { tur: 'oqish', method, yol, body };
  if (method === 'POST' && url.pathname === '/api/sb' && !url.search) return { tur: 'oqish', method, yol, body };
  if (method === 'POST' && url.pathname === '/api/chiqish') return { tur: 'chiqish', method, yol, body };
  if (method === 'POST' && url.pathname === NAVBAT_URL && !url.search) {
    try {
      const j = JSON.parse(body) as { amal?: unknown };
      if ((NAVBAT_AMALLARI as readonly string[]).includes(String(j?.amal))) return { tur: 'fakt', method, yol, body };
    } catch { /* yaroqsiz JSON — navbatga kirmaydi */ }
  }
  return { ...bosh, method, yol, body };
}

export const keshKaliti = (s: Pick<Soro, 'method' | 'yol' | 'body'>): string => 'r_' + sha256Hex(`${s.method}\n${s.yol}\n${s.body}`);

const aborted = (e: unknown, init?: RequestInit) =>
  (e instanceof DOMException && e.name === 'AbortError') || init?.signal?.aborted === true;

type Saqlangan = { s: number; ct: string | null; et: string | null; b: string };

export function oflaynFetch(base: typeof fetch, c: FetchSozlama): typeof fetch {
  const origin = c.origin ?? window.location.origin;
  const now = c.now ?? (() => Date.now());
  let chiqishOgoh = 0;
  const onlayn = c.onlayn ?? (() => navigator.onLine !== false);
  const oxirgi = new Map<string, string>(); // kalit -> javob belgisi (o'zgarmagan javob qayta yozilmaydi)
  let zanjir: Promise<unknown> = Promise.resolve();

  const tarmoqQaytdi = () => {
    const k = oflaynKorinish();
    if (k.oflayn) oflaynYangila({ oflayn: false, eskiMs: null });
    if (k.navbat > 0 && !k.yuborilmoqda) void c.navbat.yubor().catch(() => undefined);
  };

  const saqla = (kalit: string, res: Response) => {
    const clone = res.clone();
    zanjir = zanjir.then(async () => {
      const h = await c.tayyor().catch(() => null);
      if (!h?.tayyor) return;
      const b = await clone.text();
      if (b.length > SAQLASH_CHEGARA || /^\s*\{\s*"ok"\s*:\s*false/.test(b.slice(0, 64))) return;
      const belgi = `${b.length}:${sha256Hex(b)}`;
      if (oxirgi.get(kalit) === belgi) return;
      const rec: Saqlangan = { s: res.status, ct: res.headers.get('Content-Type'), et: res.headers.get('ETag'), b };
      await c.kopri.yoz(kalit, JSON.stringify(rec));
      oxirgi.set(kalit, belgi);
    }).catch(() => undefined); // kesh xatosi jonli javobni buzmaydi
  };

  async function keshdan(s: Soro): Promise<Response | null> {
    const h = await c.tayyor().catch(() => null);
    if (!h?.tayyor) return null;
    const y = await c.kopri.oqi(keshKaliti(s)).catch(() => null);
    if (!y) return null;
    let r: Saqlangan;
    try { r = JSON.parse(y.qiymat) as Saqlangan; } catch { return null; }
    const k = oflaynKorinish();
    oflaynYangila({ oflayn: true, eskiMs: k.oflayn && k.eskiMs != null ? Math.min(k.eskiMs, y.vaqt_ms) : y.vaqt_ms });
    const headers = new Headers();
    if (r.ct) headers.set('Content-Type', r.ct);
    if (r.et) headers.set('ETag', r.et);
    headers.set('X-Smeta-Oflayn', String(y.vaqt_ms));
    return new Response(r.b, { status: r.s, headers });
  }

  return async (input, init) => {
    const s = await soroOl(input, init, origin);
    if (!s.tur) return base(input, init);

    if (s.tur === 'chiqish') {
      // Yuborilmagan Fakt yozuvlari chiqishda yo'qolmasin: avval yuborishga urinamiz; qolsa — bir marta ogohlantiramiz.
      if (oflaynKorinish().navbat > 0 && onlayn()) await c.navbat.yubor().catch(() => undefined);
      if (oflaynKorinish().navbat > 0 && now() - chiqishOgoh > 60_000) {
        chiqishOgoh = now();
        return Response.json({ ok: false, code: 'OFLAYN_NAVBAT_BOSH_EMAS', error: t('Yuborilmagan oflayn yozuvlar bor. Chiqsangiz ular o‘chadi. Aloqani tekshirib yuborilishini kuting yoki yana bir marta «Chiqish» ni bosing.') }, { status: 409 });
      }
      const res = await base(input, init);
      // Chiqish: shu qurilmadagi shifrlangan kesh va navbat o'chiriladi (aktyor almashganda eski ma'lumot qolmasin).
      await c.kopri.tozala().catch(() => undefined);
      oflaynYangila({ oflayn: false, eskiMs: null, navbat: 0, nizolar: [], toxtadi: null });
      return res;
    }

    if (s.tur === 'oqish') {
      if (!onlayn()) {
        const k = await keshdan(s);
        if (k) return k;
      }
      let res: Response;
      try { res = await base(input, init); }
      catch (e) {
        if (aborted(e, init)) throw e;
        const k = await keshdan(s);
        if (k) return k;
        throw e;
      }
      tarmoqQaytdi();
      if (res.status === 200) saqla(keshKaliti(s), res);
      return res;
    }

    // Fakt yozish
    try {
      const res = await base(input, init);
      tarmoqQaytdi();
      return res;
    } catch (e) {
      if (aborted(e, init)) throw e;
      const h = await c.tayyor().catch(() => null);
      if (!h?.tayyor) throw e;
      let body: Record<string, unknown>;
      try { body = JSON.parse(s.body) as Record<string, unknown>; } catch { throw e; }
      let elem;
      try { elem = await c.navbat.qosh(body); } catch { throw e; } // navbatga yozib bo'lmasa — asl xato (foydalanuvchi bilsin)
      oflaynYangila({ oflayn: true });
      return Response.json({
        ok: false, code: 'OFLAYN_NAVBATDA', navbatda: true, operation_id: elem.body.operation_id,
        error: t('Oflayn: yozuv navbatga olindi (yuborilmagan). Aloqa qaytganda avtomatik yuboriladi.'),
      }, { status: 202 });
    }
  };
}
