/**
 * /api/loyiha-ekstraksiya — chizma PDF dan brauzerda olingan XOM matn-element JSON ni R2 da saqlash/qaytarish (kesh): obyekt qayta ochilganda
 * PDF qayta tahlil qilinmaydi. Kalit: kompaniya + PDF sha256 (boshqa kompaniya o'qiy olmaydi). Postgres'ga hech narsa yozilmaydi (hajm: R2 da).
 * Format: gzip(JSON) — klient siqadi; server baytlarni o'zgartirmaydi, faqat hajm va kalitni tekshiradi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { sessiyaKompaniya } from '../_shared/ai-kompaniya';

type Env = { SESSIYA_KALIT: string; R2_CANONICAL?: R2Bucket };

export const MAX_BAYT = 12 * 1024 * 1024;
const HEX64 = /^[0-9a-f]{64}$/;
export const ekstraksiyaKaliti = (kompaniyaId: number, sha: string) => `loyiha-ekstraksiya/k${kompaniyaId}/${sha}.json.gz`;
const xato = (xabar: string, status: number) => Response.json({ ok: false, xabar }, { status, headers: { 'Cache-Control': 'no-store' } });

async function kirish(ctx: EventContext<Env, string, unknown>): Promise<{ id: number; sha: string } | Response> {
  const sess = cachedAuthority(ctx) ?? (ctx.env.SESSIYA_KALIT ? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null) : null);
  if (!sess) return xato('Kirish talab qilinadi', 401);
  const u = new URL(ctx.request.url);
  const komp = sessiyaKompaniya(sess, u.searchParams.get('kompaniya_id'));
  if (!komp.ok) return xato(komp.xabar, komp.status);
  const sha = (u.searchParams.get('sha') ?? '').toLowerCase();
  if (!HEX64.test(sha)) return xato('sha noto‘g‘ri', 400);
  if (!ctx.env.R2_CANONICAL) return xato('Saqlash sozlanmagan', 503);
  return { id: komp.id, sha };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const k = await kirish(ctx); if (k instanceof Response) return k;
  const obj = await ctx.env.R2_CANONICAL!.get(ekstraksiyaKaliti(k.id, k.sha)).catch(() => null);
  if (!obj) return xato('Keshda yo‘q', 404);
  return new Response(obj.body, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'private, no-store' } });
};

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const k = await kirish(ctx); if (k instanceof Response) return k;
  const bayt = await ctx.request.arrayBuffer();
  if (!bayt.byteLength) return xato('Bo‘sh tana', 400);
  if (bayt.byteLength > MAX_BAYT) return xato('Hajm 12 MB dan oshmasin', 413);
  const b = new Uint8Array(bayt);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return xato('gzip kutilgan', 400);
  await ctx.env.R2_CANONICAL!.put(ekstraksiyaKaliti(k.id, k.sha), bayt, { httpMetadata: { contentType: 'application/gzip' }, customMetadata: { kompaniya_id: String(k.id) } });
  return Response.json({ ok: true, bayt: bayt.byteLength }, { headers: { 'Cache-Control': 'no-store' } });
};
