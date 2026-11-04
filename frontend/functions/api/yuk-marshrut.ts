/**
 * /api/yuk-marshrut — yuk e'loni uchun A→B masofa (km). POST { a:{lat,lng}, b:{lat,lng} } → { ok, km, daqiqa, manba:'yol'|'taxminiy', kesh }.
 * Faqat tizimga kirgan foydalanuvchi (sessiya cookie); kompaniya ma'lumotiga tegmaydi, shuning uchun permission middleware ro'yxatida emas.
 * Marshrut kaliti MIJOZDA YO'Q: OSRM manzili env `ROUTING_URL` (ixtiyoriy; sukut — ochiq OSRM). Foydalanuvchi bo'yicha 30 so'rov / daqiqa.
 */
import { tekshir } from '../_shared/auth';
import { marshrutHisobla } from '../_shared/yuk-marshrut';

type Env = { SESSIYA_KALIT: string; ROUTING_URL?: string };
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: NO_STORE });

const LIMIT = 30;
const OYNA_MS = 60_000;
const urinish = new Map<string, { soni: number; boshlandi: number }>();
function limitOshdi(id: string, hozir = Date.now()): boolean {
  const u = urinish.get(id);
  if (!u || hozir - u.boshlandi >= OYNA_MS) { urinish.set(id, { soni: 1, boshlandi: hozir }); return false; }
  u.soni += 1;
  return u.soni > LIMIT;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return json({ ok: false, code: 'AUTH_REQUIRED', error: 'Tizimga qayta kiring.' }, 401);
  if (limitOshdi(String(sess.foydalanuvchi_id))) return json({ ok: false, code: 'LIMIT', error: 'Juda ko‘p so‘rov. Bir daqiqadan keyin urining.' }, 429);
  let b: { a?: { lat?: unknown; lng?: unknown }; b?: { lat?: unknown; lng?: unknown } } = {};
  try { b = await ctx.request.json(); } catch { return json({ ok: false, code: 'BODY_INVALID', error: 'So‘rov noto‘g‘ri.' }, 400); }
  const nuqta = (p?: { lat?: unknown; lng?: unknown }) => (p && typeof p.lat === 'number' && typeof p.lng === 'number' ? { lat: p.lat, lng: p.lng } : null);
  const r = await marshrutHisobla(nuqta(b.a), nuqta(b.b), { baza: ctx.env.ROUTING_URL });
  if (!r.ok) return json({ ok: false, code: r.code, error: r.code === 'UZ_TASHQARI' ? 'Faqat O‘zbekiston ichidagi yo‘nalishlar.' : 'Koordinata noto‘g‘ri.' }, 400);
  return json({ ok: true, ...r.natija });
};