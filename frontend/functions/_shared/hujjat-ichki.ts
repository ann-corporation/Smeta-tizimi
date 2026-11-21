/**
 * hujjat-ichki.ts — hujjat dvigatelining MA'LUMOT YUKLOVCHILARINI (src/api/*) Worker ichida o'zgarishsiz ishlatish.
 *
 * Sayt hujjatni brauzerda yasaydi: yuklovchilar (`portfelObyektOl`, `f2HujjatKonteksti`, `shartnomaSvodOl` …) nisbiy
 * `/api/sb` manzillariga `fetch` qiladi. Ikkinchi yuklovchi yozmaslik uchun (har o'zgarish ikki joyda bo'lib ketardi)
 * shu yuklovchilarning NISBIY so'rovlari shu yerda xuddi sayt kabi — o'zgarmagan `_middleware` (rol, kompaniya, ruxsat,
 * qulf) orqali — handlerlarga yo'naltiriladi. Ruxsat mantig'i yangidan yozilmagan: aynan sayt bilan bir xil darvozalar.
 *
 * Xavfsizlik:
 *   - faqat NISBIY (`/`) manzillar ushlanadi; mutloq URL asl `fetch` ga o'tadi;
 *   - ruxsat etilgan yo'llar ro'yxati qat'iy (`HANDLERLAR`), boshqasi 404;
 *   - kirish sarlavhalari (Cookie, X-Tasdiq, X-Qulf-Kanal) chaqiruvchi so'rovdan olinadi — hech qachon boshqa aktorniki emas;
 *   - bir vaqtda faqat BITTA yasash (navbat): `globalThis.fetch` almashtirilgan paytda boshqa aktor so'rovi aralashmaydi;
 *   - tugagach `fetch` va hujjat dizayni (kompaniya sozlamasi) asl holiga qaytariladi.
 */
import { onRequest as middleware } from '../api/_middleware';
import { onRequestPost as sbPost } from '../api/sb';
import { onRequestPost as sbYozPost } from '../api/sb-yoz';
import { onRequestGet as sozlamaGet } from '../api/kompaniya-sozlama';
import { AsyncLocalStorage } from 'node:async_hooks';
import { dizaynKontekstiniUlash, type HujjatDizayn } from '../../src/lib/hujjat-yozuvchi/dizayn';
import { ogirNavbatniOchir } from '../../src/api/ogir-sorov-navbat';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any;

const HANDLERLAR: Record<string, Record<string, PagesFunction<never>>> = {
  '/api/sb': { POST: sbPost as never },
  '/api/sb-yoz': { POST: sbYozPost as never },
  '/api/kompaniya-sozlama': { GET: sozlamaGet as never },
};
export const ICHKI_YOLLAR: readonly string[] = Object.keys(HANDLERLAR);
const UZATILADIGAN = ['Cookie', 'Origin', 'Sec-Fetch-Site', 'X-Qulf-Kanal', 'X-Tasdiq'] as const;

export async function ichkiSorov(ctx: Ctx, url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, new URL(ctx.request.url).origin);
  const method = (init.method ?? 'GET').toUpperCase();
  const handler = Object.hasOwn(HANDLERLAR, u.pathname) ? HANDLERLAR[u.pathname][method] : undefined;
  if (!handler) return Response.json({ ok: false, code: 'ICHKI_YOL_YOQ', error: 'Ruxsat etilmagan ichki yo\'l' }, { status: 404 });
  const headers = new Headers();
  new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  for (const k of UZATILADIGAN) { const v = ctx.request.headers.get(k); if (v) headers.set(k, v); else headers.delete(k); }
  if (!headers.has('Origin')) headers.set('Origin', u.origin);
  const request = new Request(u.href, { method, headers, ...(method === 'POST' ? { body: typeof init.body === 'string' ? init.body : '{}' } : {}) });
  const data = {};
  const ichki = { ...ctx, request, data, next: () => handler({ ...ctx, request, data } as never) as Promise<Response> };
  return middleware(ichki);
}

/*
 * 2026-11-21 (prod: paket 16 hujjatdan 15 tasi «120 s javob yo'q», hatto `royxat` ham osildi): avval bitta GLOBAL navbat
 * (`navbat.then`) bor edi. Mijoz 120 s da so'rovni uzsa, Worker o'sha so'rov kontekstini bekor qiladi — uning va'dasi hech
 * qachon tugamaydi, navbat shu izolyatda ABADIY qotadi (keyingi har so'rov kutib qoladi). Endi:
 *   - so'rov konteksti AsyncLocalStorage da (har so'rov o'z Cookie/aktori bilan; global almashtirish aralashmaydi);
 *   - hujjat dizayni ham shu kontekstda (parallel yasashda boshqa kompaniya dizayni tushmaydi);
 *   - parallel cheklovi bor (CPU: izolyatda bitta), lekin KUTISH CHEKLANGAN va o'lik (uzilgan) so'rov o'rni muddat o'tgach hisobdan chiqadi.
 */
type Kontekst = { ctx: Ctx; dizayn?: HujjatDizayn };
const als = new AsyncLocalStorage<Kontekst>();
dizaynKontekstiniUlash({ ol: () => als.getStore()?.dizayn, qoy: (d) => { const s = als.getStore(); if (!s) return false; s.dizayn = d; return true; } });
ogirNavbatniOchir(); // brauzer uchun mo'ljallangan «og'ir so'rov» kutishi serverda kerak emas (o'lik so'rov hisoblagichni qotirardi)

// limit 1: Cloudflare CPU chegarasi izolyat bo'yicha — bir izolyatda 2+ yasash bo'lsa «exceededCpu» bilan HAMMASI o'ldiriladi (prod 2026-11-21: bo'sh 503).
// Parallellik izolyatlar orasida (Cloudflare har so'rovni boshqa izolyatga yo'naltira oladi). Kutish cheklangan — qotish yo'q.
const SOZ = { limit: 1, maksKutishMs: 60_000, orinMuddatMs: 150_000, qadamMs: 200 };
/** Faqat testlar uchun: chegaralarni qisqartirish. */
export function ichkiSozla(x: Partial<typeof SOZ>): void { Object.assign(SOZ, x); }
const orinlar = new Map<symbol, number>();
/** Shu izolyatda hujjat yasalyaptimi (fon ishi CPU chegarasini oshirmasligi uchun band bo'lsa kutadi). */
export function ichkiBandmi(): boolean { return tirikOrinlar() > 0; }
/** Hozirgi chaqiruv hujjat yasash ichidami (ichki `/api/sb` so'rovlari). */
export function ichkidami(): boolean { return als.getStore() != null; }
/** Faqat testlar uchun: band o'rinlarni tozalash. */
export function ichkiOrinlarniTozala(): void { orinlar.clear(); }
const tirikOrinlar = (): number => { const endi = Date.now(); let n = 0; for (const [k, t] of orinlar) { if (endi - t > SOZ.orinMuddatMs) orinlar.delete(k); else n++; } return n; };
async function orinOl(): Promise<symbol> {
  const boshi = Date.now();
  while (tirikOrinlar() >= SOZ.limit && Date.now() - boshi < SOZ.maksKutishMs) await new Promise((o) => setTimeout(o, SOZ.qadamMs));
  const k = Symbol('ichki'); orinlar.set(k, Date.now()); return k;
}

let aslFetch: typeof fetch | null = null;
let ourar: typeof fetch | null = null;
let faol = 0;
function fetchniUla(): void {
  if (ourar && globalThis.fetch === ourar) return;
  const asl = globalThis.fetch; aslFetch = asl;
  ourar = ((input: RequestInfo | URL, init?: RequestInit) => {
    const s = als.getStore();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    return s && url.startsWith('/') ? ichkiSorov(s.ctx, url, init) : asl(input as never, init as never);
  }) as typeof fetch;
  globalThis.fetch = ourar;
}

/** `ish` davomida nisbiy `fetch` lar SHU so'rov kontekstida ichki handlerlarga boradi. Bir so'rovning qotishi boshqasini to'xtatmaydi. */
export async function ichkiRejimda<T>(ctx: Ctx, ish: () => Promise<T>): Promise<T> {
  const orin = await orinOl();
  fetchniUla(); faol++;
  try { return await als.run({ ctx }, ish); }
  finally {
    orinlar.delete(orin); faol--;
    if (faol <= 0 && ourar && globalThis.fetch === ourar && aslFetch) { globalThis.fetch = aslFetch; ourar = null; }
  }
}
