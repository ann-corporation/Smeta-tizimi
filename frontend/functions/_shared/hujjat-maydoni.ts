/**
 * hujjat-maydoni.ts - Hujjat maydoni (Hujjatlarim / Kompaniya diski) umumiy yordamchilari.
 * Qoida: aktor FAQAT sessiyadan (body'dagi actor_id hech qachon ishonilmaydi); ruxsat va kvota RPC ichida (service_role);
 * baytlar FAQAT R2 da (r2Yoz); Postgres'da metama'lumot.
 */
import { cachedAuthority } from './permission-policy';
import { tekshir } from './auth';
import { supabaseBaseUrl } from './supabase-url';
import { r2Ochir, r2Oqi, r2Yoz, sha256Hex, yuklashTekshir } from './r2-saqlash';
import { MATN_MAX_KIRISH, matnAjratadimi, matnAjrat, parchaTop, qidiruvNorm, qidiruvSozlar } from './hujjat-matn';

export type HmEnv = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };

/** Bitta fayl chegarasi (Pages Functions so'rov tanasi chegarasi bilan mos). Katta fayl - veb-yuklash/ilova. */
export const HM_MAX_BAYT = 100 * 1024 * 1024;
export const HM_TG_MAX_BAYT = 20 * 1024 * 1024;
/** Brauzerda ko'rsatish (inline) uchun ruxsat etilgan turlar. SVG/HTML YO'Q (skript xavfi) - ular faqat yuklab olinadi. */
export const KORISH_MIME = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/i;
const MIME_SHAKL = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,100}$/i;

export function mimeTozala(m: string | null | undefined): string {
  const s = String(m || '').split(';')[0].trim().toLowerCase();
  return MIME_SHAKL.test(s) ? s : 'application/octet-stream';
}

/** Fayl nomi: yo'l ajratgichlar va boshqaruv belgilari olib tashlanadi (RPC ham shuni takrorlaydi). */
export function nomTozala(nom: unknown): string {
  // eslint-disable-next-line no-control-regex
  const s = String(nom ?? '').replace(/[\\/\u0000-\u001f]+/g, '_').replace(/\.\.+/g, '.').trim().slice(0, 200);
  return s || 'fayl';
}

export async function hmRpc(env: HmEnv, nom: string, args: Record<string, unknown>) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* xom */ }
  return { httpOk: r.ok, body, raw: text };
}

export async function sessiyaAktor(ctx: { request: Request; env: HmEnv }): Promise<{ actorId: number } | Response> {
  const sess = cachedAuthority(ctx as any) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED', xato: 'Kirish talab qilinadi' }, { status: 401 });
  const actorId = (sess as any).foydalanuvchi_id;
  if (actorId == null) return Response.json({ ok: false, code: 'AUTH_REQUIRED', xato: 'Sessiyada foydalanuvchi yo‘q' }, { status: 401 });
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, code: 'CONFIG' }, { status: 500 });
  return { actorId: Number(actorId) };
}

/** RPC kodi -> HTTP holati + foydalanuvchi uchun o'zbekcha matn (UI t() bilan tarjima qiladi). */
const KODLAR: Record<string, [number, string]> = {
  RUXSAT_YOQ: [403, 'Bu amal uchun ruxsat yo‘q.'],
  AUTH_REQUIRED: [401, 'Kirish talab qilinadi.'],
  FAYL_TOPILMADI: [404, 'Fayl topilmadi.'], PAPKA_TOPILMADI: [404, 'Papka topilmadi.'], VERSIYA_TOPILMADI: [404, 'Versiya topilmadi.'], NISHON_TOPILMADI: [404, 'Topilmadi.'], HAVOLA_YOQ: [404, 'Havola yaroqsiz yoki muddati tugagan.'],
  QULFLANGAN: [423, 'Fayl boshqa foydalanuvchi tomonidan tahrir uchun qulflangan.'],
  NOM_BAND: [409, 'Shu joyda bunday nomli fayl yoki papka bor.'], NOM_NOTOGRI: [400, 'Nom 1–120 (fayl: 200) belgidan iborat bo‘lsin.'],
  AYLANMA: [400, 'Papkani o‘zining ichiga ko‘chirib bo‘lmaydi.'], PAPKA_BOSH_EMAS: [409, 'Papka bo‘sh emas.'],
  KVOTA_TUGADI: [413, 'Disk to‘ldi. Joy bo‘shating yoki Tokenlar va obuna sahifasida disk rejasini oshiring.'],
  HAVOLA_YOQILMAGAN: [403, 'Tashqi havola ulashish kompaniyada yoqilmagan (kompaniya admini yoqadi).'],
  TOKEN_YETMAYDI: [402, 'Tokenlar yetarli emas.'], ALOQA_YOQ: [403, 'Bu kompaniya bilan faol aloqa yo‘q.'],
  TAQDIM_ALOQA_YOQ: [404, 'Faol aloqa topilmadi.'], TAQDIM_SHAXSIY: [400, 'Shaxsiy fayl taqdim qilinmaydi: avval kompaniya diskiga ko‘chiring.'], TAQDIM_BOSH: [400, 'Taqdim qilinadigan fayl topilmadi.'], TAQDIM_KO_P: [413, 'Papkada 200 tadan ko‘p fayl bor: kichikroq papka tanlang.'], TAQDIM_TOPILMADI: [404, 'Taqdim topilmadi.'], TAQDIMDA: [409, 'Fayl taqdim qilingan: avval taqdimni qaytaring.'],
  YUKLA_YAROQSIZ: [400, 'Yuklash sessiyasi yaroqsiz yoki muddati tugagan.'], QISM_NOTOGRI: [400, 'Qism hajmi yoki raqami noto‘g‘ri.'], QISMLAR_YETMAYDI: [400, 'Barcha qismlar yuborilmagan.'], SHA_MOS_EMAS: [422, 'Fayl butunligi tekshiruvidan o‘tmadi. Qayta yuklang.'], HAJM_MOS_EMAS: [422, 'Yuklangan hajm e‘lon qilinganiga mos emas. Qayta yuklang.'],
  EMPTY_FILE: [400, 'Fayl bo‘sh.'], FILE_TOO_LARGE: [413, 'Fayl juda katta.'], MIME_REJECTED: [415, 'Bu turdagi faylni yuklab bo‘lmaydi.'],
  YETIM_EMAS: [409, 'Fayl allaqachon biriktirilgan: sahifani yangilang.'], LOYIHA_KERAK: [400, 'Obyekt yoki loyihani tanlang.'], LOYIHA_TOPILMADI: [404, 'Loyiha topilmadi.'], OBYEKT_TOPILMADI: [404, 'Obyekt topilmadi.'], LOYIHA_MOS_EMAS: [400, 'Obyekt tanlangan loyihaga tegishli emas.'],
};
export function rpcXato(res: { httpOk: boolean; body: any; raw: string }): Response {
  const code = String(res.body?.code || (res.httpOk ? 'XATO' : 'RPC_XATO'));
  const [status, xato] = KODLAR[code] ?? [res.httpOk ? 400 : 502, 'Amal bajarilmadi.'];
  return Response.json({ ok: false, code, xato, ...(code === 'KVOTA_TUGADI' ? { ishlatilgan: res.body?.ishlatilgan, limit: res.body?.limit, tarif_yol: '/admin/tokenlar' } : {}) }, { status });
}
export const rpcOk = (res: { httpOk: boolean; body: any }) => res.httpOk && res.body && res.body.ok === true;

/** Yuklab olish sarlavhalari: sukut - attachment; faqat xavfsiz turlar inline (sandbox CSP bilan). */
export function yuklashSarlavha(nom: string, mime: string, bayt: number, korish: boolean): Headers {
  const h = new Headers();
  const inline = korish && KORISH_MIME.test(mime);
  h.set('Content-Type', inline ? mime : (KORISH_MIME.test(mime) ? mime : 'application/octet-stream'));
  h.set('Content-Disposition', (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(nom));
  if (bayt) h.set('Content-Length', String(bayt));
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  h.set('Cache-Control', 'private, no-store');
  return h;
}

/** Yagona yuklash yo'li (veb va Telegram): reserve (ruxsat+kvota) -> R2 -> tasdiq. */
export async function hmYukla(env: HmEnv, p: {
  actorId: number; kompaniyaId: number | null; papkaId: number | null; faylId: number | null; nom: string; mime: string; bayt: Uint8Array; operationId: string;
}): Promise<Response> {
  const nom = nomTozala(p.nom);
  const mime = mimeTozala(p.mime);
  const yt = yuklashTekshir({ nom, mime, bayt: p.bayt.byteLength, maxBayt: HM_MAX_BAYT });
  if (!yt.ok) return rpcXato({ httpOk: true, body: { ok: false, code: yt.code }, raw: '' });
  const sha = await sha256Hex(p.bayt);
  const rez = await hmRpc(env, 't2_hm_yuklash_reserve_v1', {
    p_actor: p.actorId, p_kompaniya: p.kompaniyaId, p_papka: p.papkaId, p_nom: nom, p_mime: mime, p_bayt: p.bayt.byteLength, p_sha256: sha,
    p_operation_id: p.operationId, p_fayl_id: p.faylId,
  });
  if (!rpcOk(rez)) return rpcXato(rez);
  if (rez.body.ozgarmadi) return Response.json({ ok: true, ozgarmadi: true, fayl_id: rez.body.fayl_id, raqam: rez.body.raqam });
  if (rez.body.takror && rez.body.holat === 'tayyor') return Response.json({ ok: true, takror: true, fayl_id: rez.body.fayl_id, raqam: rez.body.raqam });
  try {
    await r2Yoz(env.R2_CANONICAL, String(rez.body.r2_kalit), p.bayt, { httpMetadata: { contentType: mime }, sha256: sha });
  } catch {
    await hmRpc(env, 't2_hm_yuklash_bekor_v1', { p_actor: p.actorId, p_versiya_id: rez.body.versiya_id });
    return Response.json({ ok: false, code: 'R2_XATO', xato: 'Faylni saqlab bo‘lmadi. Qayta urinib ko‘ring.' }, { status: 502 });
  }
  const t = await hmRpc(env, 't2_hm_yuklash_tasdiq_v1', { p_actor: p.actorId, p_versiya_id: rez.body.versiya_id });
  if (!rpcOk(t)) return rpcXato(t);
  await hmIndeksla(env, { actorId: p.actorId, versiyaId: Number(rez.body.versiya_id), r2Kalit: String(rez.body.r2_kalit), nom, mime }, p.bayt);
  return Response.json({ ok: true, fayl_id: rez.body.fayl_id, raqam: rez.body.raqam, yangi: !!rez.body.yangi });
}

/**
 * To'liq matnli qidiruv indeksi (yuklashdan keyin, xato bo'lsa JIM): matn R2 da (r2 kalit + '.txt'), Postgres'da faqat ixcham tsvector qatori
 * (fayl boshiga bitta qator - faqat joriy versiya). Eski versiyaning matn obyekti almashtirilganda R2 dan o'chiriladi.
 */
export async function hmIndeksla(env: HmEnv, v: { actorId: number; versiyaId: number; r2Kalit: string; nom: string; mime: string }, bayt: Uint8Array): Promise<boolean> {
  try {
    if (!matnAjratadimi(v.nom, v.mime) || bayt.byteLength > MATN_MAX_KIRISH) return false;
    const matn = matnAjrat(v.nom, v.mime, bayt);
    if (!matn) return false;
    const norm = qidiruvNorm(matn).slice(0, 200_000);
    if (norm.length < 2) return false;
    const kalit = v.r2Kalit + '.txt';
    await r2Yoz(env.R2_CANONICAL, kalit, matn, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
    const r = await hmRpc(env, 't2_hm_matn_yoz_v1', { p_actor: v.actorId, p_versiya_id: v.versiyaId, p_norm: norm, p_belgi: matn.length, p_r2_kalit: kalit });
    if (!rpcOk(r)) { await r2Ochir(env.R2_CANONICAL, kalit).catch(() => undefined); return false; }
    const eski = r.body?.eski_kalit;
    if (typeof eski === 'string' && eski && eski !== kalit) await r2Ochir(env.R2_CANONICAL, eski).catch(() => undefined);
    return true;
  } catch { return false; }
}

/** Qidiruv (nom + fayl ichidagi matn): RPC dan keyin eng yaxshi mazmun natijalariga R2 dan parcha qo'shiladi; ichki matn kaliti mijozga chiqmaydi. */
export async function hmQidirYuqori(env: HmEnv, actorId: number, kompaniyaId: number | null, q: string) {
  const r = await hmRpc(env, 't2_hm_qidir_v1', { p_actor: actorId, p_kompaniya: kompaniyaId, p_q: q, p_q_norm: qidiruvNorm(q) });
  if (!rpcOk(r)) return r;
  const sozlar = qidiruvSozlar(q);
  const royxat: any[] = Array.isArray(r.body.royxat) ? r.body.royxat : [];
  let n = 0;
  await Promise.all(royxat.map(async (x) => {
    const k = x.matn_kalit; delete x.matn_kalit;
    if (!k || x.mos !== 'matn' || n >= 10 || !env.R2_CANONICAL) return;
    n++;
    try {
      const o = await r2Oqi(env.R2_CANONICAL, String(k));
      const s = o ? await o.text() : '';
      x.parcha = parchaTop(s, sozlar);
    } catch { /* parchasiz */ }
  }));
  return { ...r, body: { ...r.body, royxat } };
}

