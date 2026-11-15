/**
 * STEP-UP DARVOZASI: pul/imzo/tasdiq buyrug'i (write-command-policy: stepUpKerak) uchun yangi PIN/biometrik tasdiq tokenini talab qiladi.
 * Talab: foydalanuvchida qabul qilinadigan usul bor VA kompaniya siyosati 'off' emas. Hech narsa sozlanmagan bo'lsa -- o'tkazadi (eski xatti-harakat).
 * Migratsiya qo'llanmagan bo'lsa (jadval/funksiya yo'q) -- o'tkazadi; boshqa DB xatosi -- FAIL-CLOSED (503).
 */
import { tekshir } from './auth';
import { QulfYoq, supabaseStore } from './qulf-store';
import type { QulfStore } from './qulf-amal';
import { qabulUsullar, tasdiqOl, tasdiqTekshir } from './qulf';
import { stepUpKerak } from './write-command-policy';

export const KANAL_HEADER = 'X-Qulf-Kanal';
type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

const rad = (status: number, code: string, extra: Record<string, unknown> = {}) => Response.json(
  { ok: false, code, error: code === 'STEP_UP_KERAK' ? 'Bu amal uchun PIN yoki biometrik tasdiq kerak.' : 'Xavfsizlik tekshiruvi vaqtincha mavjud emas. Qayta urinib ko\'ring.', ...extra },
  { status, headers: { 'Cache-Control': 'no-store' } });

export async function qulfDarvoza(request: Request, env: Env, api: string, b: Record<string, unknown>, store?: QulfStore): Promise<Response | null> {
  if (!stepUpKerak(api, b)) return null;
  const sess = await tekshir(request.headers.get('Cookie'), env.SESSIYA_KALIT);
  const uid = sess?.foydalanuvchi_id;
  if (!sess || !Number.isSafeInteger(uid) || !uid) return null; // sessiyasiz/eski -- boshqa qatlamlar rad etadi
  const kid = Number(b.kompaniya_id);
  let t;
  try { t = await (store ?? supabaseStore(env)).talab(uid, Number.isSafeInteger(kid) && kid > 0 ? kid : null); }
  catch (e) { return e instanceof QulfYoq ? null : rad(503, 'QULF_UNAVAILABLE'); }
  if (!t.talab) return null;
  const usullar = qabulUsullar(t.rejim, t);
  const j = request.headers.get(KANAL_HEADER) === 'mobil' ? 'm' : sess.jti;
  const tk = await tasdiqTekshir(tasdiqOl(request), env.SESSIYA_KALIT, { u: uid, j });
  if (tk && usullar.includes(tk.m)) return null;
  return rad(403, 'STEP_UP_KERAK', { usullar, rejim: t.rejim });
}
