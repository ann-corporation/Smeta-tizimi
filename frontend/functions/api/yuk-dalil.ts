/**
 * /api/yuk-dalil — yetkazish/yuklash isboti (foto) va qabul qiluvchi imzosi: kichik rasm R2 (private, R2_CANONICAL) ga.
 * POST multipart: fayl (image/jpeg|png|webp, <= 2 MiB), operation_id (uuid). Kalit: yb/u<actor>/<operation_id>.<kengaytma> — faqat shu foydalanuvchi prefiksida.
 * Javob { ok, r2_kalit, sha256 } → keyin /api/yuk-tashish amal `dalil` (bron egaligini RPC tekshiradi). Kompaniya a'zoligi shart EMAS (yakka haydovchi).
 */
import { tekshir } from '../_shared/auth';
import { dalilPrefiks, operationIdYaroqli } from '../_shared/yuk-tashish';

type Env = { SESSIYA_KALIT: string; R2_CANONICAL?: R2Bucket };
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: NO_STORE });
const MAX = 2 * 1024 * 1024;
const TURLAR: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  if (!ctx.env.R2_CANONICAL) return json({ ok: false, code: 'R2_YOQ' }, 503);
  let f: FormData;
  try { f = await ctx.request.formData(); } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const fayl = f.get('fayl') as unknown as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> } | string | null;
  const op = f.get('operation_id');
  if (!fayl || typeof fayl === 'string' || typeof fayl.arrayBuffer !== 'function' || !operationIdYaroqli(op)) return json({ ok: false, code: 'FAYL_KERAK' }, 400);
  const kengaytma = TURLAR[fayl.type];
  if (!kengaytma) return json({ ok: false, code: 'TUR_NOTOGRI' }, 400);
  if (fayl.size <= 0 || fayl.size > MAX) return json({ ok: false, code: 'HAJM_NOTOGRI' }, 400);
  const baytlar = await fayl.arrayBuffer();
  const xesh = [...new Uint8Array(await crypto.subtle.digest('SHA-256', baytlar))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const kalit = `${dalilPrefiks(Number(sess.foydalanuvchi_id))}${op}.${kengaytma}`;
  await ctx.env.R2_CANONICAL.put(kalit, baytlar, { httpMetadata: { contentType: fayl.type } });
  return json({ ok: true, r2_kalit: kalit, sha256: xesh });
};
