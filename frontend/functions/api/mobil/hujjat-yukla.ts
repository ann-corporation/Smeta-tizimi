import { sessiyaOl } from '../../_shared/auth';
import { desktopDenyCode, desktopFail, verifiedDesktopDevice, type DesktopEnv } from '../../_shared/desktop-device';
import { roleAuthority, sessiyaYaroqsizmi } from '../../_shared/role-authority';
import { hmYukla, type HmEnv } from '../../_shared/hujjat-maydoni';
import { bolakYonalt } from '../../_shared/hujjat-maydoni-bolak';

/**
 * /api/mobil/hujjat-yukla - Hujjat maydoniga yuklash (Android / Windows ilova). Ishonch modeli mobil/avatar.ts bilan bir xil:
 * tasdiqlangan qurilma Bearer'i -> jonli hisob -> aktor FAQAT qurilma egasi (so'rovdagi hech narsaga ishonilmaydi).
 *
 *   POST  multipart/form-data  (fayl, operation_id, kompaniya_id?, papka_id?, fayl_id?)  - bir martalik, <= 25 MB (xotira xavfsizligi)
 *   POST  ?amal=boshla  JSON            - katta fayl (<= 200 MB): kvota/ruxsat tekshiriladi, R2 multipart ochiladi
 *   PUT   ?amal=qism&t=<yukla_id>&n=<k> - bitta bo'lak (8 MiB; oxirgisidan boshqasi aniq shuncha), etag qaytadi - ilova etag larni saqlaydi
 *   POST  ?amal=tugat   JSON {t, qismlar:[{n, etag}]}  /  ?amal=bekor JSON {t}
 * Kvota, MIME/kengaytma, ruxsat, versiya, matn indeksi - veb bilan BIR XIL (_shared/hujjat-maydoni*.ts); parallel mantiq yo'q.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Env = DesktopEnv & HmEnv & Record<string, any>;
export const MOBIL_HM_BIR_MARTA_MAX = 25 * 1024 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status: number) => Response.json(b, { status, headers: NO_STORE });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const son = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

async function actor(ctx: { request: Request; env: Env }): Promise<number | Response> {
  const sess = await sessiyaOl(ctx.request, ctx.env);
  const device = verifiedDesktopDevice(ctx.request);
  if (!sess || !device) return desktopFail(401, desktopDenyCode(ctx.request));
  const live = await roleAuthority(sess, ctx.env);
  if (!live) return sessiyaYaroqsizmi(sess) ? desktopFail(401, 'DEVICE_AUTH_REQUIRED') : desktopFail(503, 'AUTHORITY_UNAVAILABLE');
  return device.foydalanuvchi_id;
}

async function ish(ctx: { request: Request; env: Env }): Promise<Response> {
  const a = await actor(ctx); if (a instanceof Response) return a;
  if (!ctx.env.R2_CANONICAL || !ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return json({ ok: false, code: 'CONFIG' }, 503);
  try {
    const bolak = await bolakYonalt(ctx.env, a, ctx.request);
    if (bolak) { const h = new Headers(bolak.headers); h.set('Cache-Control', 'no-store'); return new Response(bolak.body, { status: bolak.status, headers: h }); }
    if (ctx.request.method !== 'POST') return json({ ok: false, code: 'AMAL_NOMALUM' }, 405);
    if (!/^multipart\/form-data;\s*boundary=/i.test(ctx.request.headers.get('Content-Type') ?? '')) return json({ ok: false, code: 'TARGET_INVALID' }, 400);
    if (Number(ctx.request.headers.get('Content-Length')) > MOBIL_HM_BIR_MARTA_MAX + 64 * 1024) return json({ ok: false, code: 'FILE_TOO_LARGE', xato: 'Katta fayl uchun bo‘lakli yuklashdan foydalaning (amal=boshla).' }, 413);
    const form = await ctx.request.formData();
    const file = form.get('fayl') as unknown as File | null;
    const op = String(form.get('operation_id') || '').trim();
    if (!file || typeof file.arrayBuffer !== 'function') return json({ ok: false, code: 'FAYL_KERAK' }, 400);
    if (!UUID.test(op)) return json({ ok: false, code: 'OPERATION_ID_REQUIRED' }, 400);
    if (file.size > MOBIL_HM_BIR_MARTA_MAX) return json({ ok: false, code: 'FILE_TOO_LARGE', xato: 'Katta fayl uchun bo‘lakli yuklashdan foydalaning (amal=boshla).' }, 413);
    const r = await hmYukla(ctx.env, {
      actorId: a, kompaniyaId: son(form.get('kompaniya_id')), papkaId: son(form.get('papka_id')), faylId: son(form.get('fayl_id')),
      nom: (file as File).name, mime: (file as File).type, bayt: new Uint8Array(await file.arrayBuffer()), operationId: op,
    });
    const h = new Headers(r.headers); h.set('Cache-Control', 'no-store');
    return new Response(r.body, { status: r.status, headers: h });
  } catch (e) { return json({ ok: false, code: 'HM_XATO', xato: String((e as Error)?.message || e).slice(0, 200) }, 500); }
}

export const onRequestPost: PagesFunction<Env> = ish;
export const onRequestPut: PagesFunction<Env> = ish;
