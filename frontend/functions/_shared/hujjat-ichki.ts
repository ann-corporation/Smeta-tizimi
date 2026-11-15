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
import { hujjatDizayniniOrnat } from '../../src/lib/hujjat-yozuvchi/dizayn';

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

let navbat: Promise<unknown> = Promise.resolve();

/** `ish` davomida nisbiy `fetch` lar ichki handlerlarga boradi. Bir vaqtda bitta yasash; xatodan keyin ham asl holat tiklanadi. */
export function ichkiRejimda<T>(ctx: Ctx, ish: () => Promise<T>): Promise<T> {
  const nat = navbat.then(async () => {
    const asl = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      return url.startsWith('/') ? ichkiSorov(ctx, url, init) : asl(input as never, init as never);
    }) as typeof fetch;
    try { return await ish(); }
    finally { globalThis.fetch = asl; hujjatDizayniniOrnat(null); }
  });
  navbat = nat.catch(() => undefined);
  return nat;
}
