/**
 * hujjat-maydoni-bolak.ts - Hujjat maydoniga KATTA fayl (<= 200 MB) yuklash: R2 multipart, bo'lakma-bo'lak, davom ettiriladigan.
 * Veb (/api/hujjat-maydoni-yukla?amal=...) va mobil/desktop (/api/mobil/hujjat-yukla?amal=...) bitta mantiqdan foydalanadi.
 *
 *   boshla : POST JSON {nom, mime, bayt, sha256, operation_id, kompaniya_id?, papka_id?, fayl_id?}
 *            -> ruxsat + KVOTA e'lon qilingan hajm bo'yicha serverda tekshiriladi (RPC t2_hm_yuklash_reserve_v1); R2 multipart ochiladi.
 *            <- {yukla_id (imzolangan token), qism_bayt, qismlar}
 *   qism   : PUT/POST ?t=<yukla_id>&n=<1..qismlar> xom baytlar (aniq hajm: oxirgisidan boshqasi qism_bayt)
 *            <- {etag}.  Mijoz etag larni saqlaydi: ilova o'chib qolsa ham shu token bilan davom ettiriladi (24 soat).
 *   tugat  : POST JSON {t, qismlar:[{n, etag}]} -> multipart yig'iladi, hajm va (mavjud bo'lsa) SHA-256 server tomonida tekshiriladi, tasdiq.
 *   bekor  : POST JSON {t} -> R2 multipart bekor, kutish qatori va kvota qaytadi.
 * Aktor FAQAT sessiyadan; token aktor, versiya, R2 kaliti va uploadId ni HMAC bilan bog'laydi (soxta/almashtirilgan token rad).
 * Kutib qolgan multipart: R2 yarim yuklashlarni 7 kundan keyin o'zi o'chiradi; 'kutish' versiya qatori kunlik tozalashda yo'qoladi.
 */
import { hmIndeksla, hmRpc, mimeTozala, nomTozala, rpcOk, rpcXato, type HmEnv } from './hujjat-maydoni';
import { r2BolakBekor, r2BolakBoshla, r2BolakQism, r2BolakTugat, r2Ochir, r2Oqi, yuklashTekshir } from './r2-saqlash';
import { MATN_MAX_KIRISH, matnAjratadimi } from './hujjat-matn';

export const HM_BOLAK_QISM = 8 * 1024 * 1024;
export const HM_BOLAK_MAX_BAYT = 200 * 1024 * 1024;
const TOKEN_MUDDAT_MS = 24 * 3600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;

type Env = HmEnv & { SESSIYA_KALIT: string };
type Tok = { a: number; v: number; k: string; u: string; b: number; m: string; n: string; s: string; e: number };

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function hmac(kalit: string, matn: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('hm-bolak-v1:' + kalit), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(matn))));
}
export async function bolakTokenYarat(env: Env, t: Tok): Promise<string> {
  const p = b64(new TextEncoder().encode(JSON.stringify(t)));
  return p + '.' + await hmac(env.SESSIYA_KALIT, p);
}
export async function bolakTokenOl(env: Env, raw: unknown, actorId: number): Promise<Tok | null> {
  const [p, s] = String(raw ?? '').split('.');
  if (!p || !s || (await hmac(env.SESSIYA_KALIT, p)) !== s) return null;
  try {
    const t = JSON.parse(new TextDecoder().decode(unb64(p))) as Tok;
    return t.a === actorId && t.e > Date.now() && Number.isSafeInteger(t.v) && typeof t.k === 'string' && typeof t.u === 'string' ? t : null;
  } catch { return null; }
}

const xato = (code: string, status: number, extra: Record<string, unknown> = {}) => Response.json({ ok: false, code, ...extra }, { status });
const butun = (v: unknown): number | null => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
export const qismlarSoni = (bayt: number) => Math.ceil(bayt / HM_BOLAK_QISM);
export const qismHajmi = (bayt: number, n: number) => (n < qismlarSoni(bayt) ? HM_BOLAK_QISM : bayt - (qismlarSoni(bayt) - 1) * HM_BOLAK_QISM);

async function sarfla(body: ReadableStream<Uint8Array> | null, aniq: number): Promise<Uint8Array | null> {
  if (!body) return null;
  const r = body.getReader(); const out = new Uint8Array(aniq); let n = 0;
  try {
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      if (n + value.byteLength > aniq) { await r.cancel(); return null; }
      out.set(value, n); n += value.byteLength;
    }
  } finally { r.releaseLock(); }
  return n === aniq ? out : null;
}

export async function bolakBoshla(env: Env, actorId: number, b: Record<string, any> | null): Promise<Response> {
  if (!b) return xato('BODY_NOTOGRI', 400);
  const nom = nomTozala(b.nom); const mime = mimeTozala(b.mime); const bayt = Number(b.bayt); const op = String(b.operation_id || '');
  if (!Number.isSafeInteger(bayt)) return xato('HAJM_KERAK', 400);
  if (!UUID.test(op)) return xato('OPERATION_ID_REQUIRED', 400);
  if (!SHA.test(String(b.sha256 || ''))) return xato('SHA_NOTOGRI', 400, { xato: 'sha256 (hex, 64) majburiy' });
  const yt = yuklashTekshir({ nom, mime, bayt, maxBayt: HM_BOLAK_MAX_BAYT });
  if (!yt.ok) return rpcXato({ httpOk: true, body: { ok: false, code: yt.code }, raw: '' });
  if (!env.R2_CANONICAL) return xato('CONFIG', 500);
  const rez = await hmRpc(env, 't2_hm_yuklash_reserve_v1', {
    p_actor: actorId, p_kompaniya: butun(b.kompaniya_id), p_papka: butun(b.papka_id), p_nom: nom, p_mime: mime, p_bayt: bayt, p_sha256: String(b.sha256),
    p_operation_id: op, p_fayl_id: butun(b.fayl_id),
  });
  if (!rpcOk(rez)) return rpcXato(rez);
  if (rez.body.ozgarmadi) return Response.json({ ok: true, ozgarmadi: true, fayl_id: rez.body.fayl_id, raqam: rez.body.raqam });
  if (rez.body.takror && rez.body.holat === 'tayyor') return Response.json({ ok: true, takror: true, fayl_id: rez.body.fayl_id, raqam: rez.body.raqam });
  let uploadId: string;
  try { uploadId = await r2BolakBoshla(env.R2_CANONICAL, String(rez.body.r2_kalit), mime); }
  catch { await hmRpc(env, 't2_hm_yuklash_bekor_v1', { p_actor: actorId, p_versiya_id: rez.body.versiya_id }); return xato('R2_XATO', 502, { xato: 'Faylni saqlab bo‘lmadi. Qayta urinib ko‘ring.' }); }
  const yukla_id = await bolakTokenYarat(env, { a: actorId, v: Number(rez.body.versiya_id), k: String(rez.body.r2_kalit), u: uploadId, b: bayt, m: mime, n: nom, s: String(b.sha256), e: Date.now() + TOKEN_MUDDAT_MS });
  return Response.json({ ok: true, yukla_id, fayl_id: rez.body.fayl_id, raqam: rez.body.raqam, qism_bayt: HM_BOLAK_QISM, qismlar: qismlarSoni(bayt) });
}

export async function bolakQism(env: Env, actorId: number, token: unknown, n: unknown, request: Request): Promise<Response> {
  const t = await bolakTokenOl(env, token, actorId);
  if (!t) return xato('YUKLA_YAROQSIZ', 400);
  const k = butun(n);
  if (!k || k > qismlarSoni(t.b)) return xato('QISM_NOTOGRI', 400);
  const aniq = qismHajmi(t.b, k);
  const decl = request.headers.get('Content-Length');
  if (decl != null && Number(decl) !== aniq) return xato('QISM_NOTOGRI', 400, { kutilgan_bayt: aniq });
  const bayt = await sarfla(request.body, aniq);
  if (!bayt) return xato('QISM_NOTOGRI', 400, { kutilgan_bayt: aniq });
  try {
    const q = await r2BolakQism(env.R2_CANONICAL, t.k, t.u, k, bayt);
    return Response.json({ ok: true, n: k, etag: q.etag });
  } catch { return xato('R2_XATO', 502, { xato: 'Qismni saqlab bo‘lmadi. Qayta yuboring.' }); }
}

async function shaOl(obj: { body?: ReadableStream } | null): Promise<string | null> {
  const DS = (crypto as unknown as { DigestStream?: new (a: string) => WritableStream & { digest: Promise<ArrayBuffer> } }).DigestStream;
  if (!DS || !obj?.body) return null; // Workers'da mavjud; boshqa muhitda butunlik tekshiruvi o'tkaziladi
  const ds = new DS('SHA-256');
  await obj.body.pipeTo(ds);
  return [...new Uint8Array(await ds.digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function bolakTugat(env: Env, actorId: number, b: Record<string, any> | null): Promise<Response> {
  const t = await bolakTokenOl(env, b?.t, actorId);
  if (!t) return xato('YUKLA_YAROQSIZ', 400);
  const jami = qismlarSoni(t.b);
  const q: Array<{ partNumber: number; etag: string }> = Array.isArray(b?.qismlar)
    ? b!.qismlar.map((x: any) => ({ partNumber: Number(x?.n), etag: String(x?.etag || '') })).sort((a: any, c: any) => a.partNumber - c.partNumber) : [];
  if (q.length !== jami || q.some((x, i) => x.partNumber !== i + 1 || !x.etag)) return xato('QISMLAR_YETMAYDI', 400, { kutilgan: jami });
  const bekor = async () => { await r2Ochir(env.R2_CANONICAL, t.k).catch(() => undefined); await hmRpc(env, 't2_hm_yuklash_bekor_v1', { p_actor: actorId, p_versiya_id: t.v }); };
  let obj: { size: number } | null;
  try { obj = await r2BolakTugat(env.R2_CANONICAL, t.k, t.u, q); }
  catch { return xato('R2_XATO', 502, { xato: 'Faylni yig‘ib bo‘lmadi. Qismlarni qayta yuboring.' }); }
  if (!obj || obj.size !== t.b) { await bekor(); return xato('HAJM_MOS_EMAS', 422); }
  const o = await r2Oqi(env.R2_CANONICAL, t.k);
  const sha = await shaOl(o).catch(() => null);
  if (sha && sha !== t.s) { await bekor(); return xato('SHA_MOS_EMAS', 422); }
  const tz = await hmRpc(env, 't2_hm_yuklash_tasdiq_v1', { p_actor: actorId, p_versiya_id: t.v });
  if (!rpcOk(tz)) return rpcXato(tz);
  // Matn indeksi: faqat chegarali hajmda (xotira xavfsizligi) - undan kattasi faqat nomi bilan qidiriladi.
  if (t.b <= MATN_MAX_KIRISH && matnAjratadimi(t.n, t.m)) {
    try {
      const f = await r2Oqi(env.R2_CANONICAL, t.k);
      if (f) await hmIndeksla(env, { actorId, versiyaId: t.v, r2Kalit: t.k, nom: t.n, mime: t.m }, new Uint8Array(await f.arrayBuffer()));
    } catch { /* indekssiz */ }
  }
  return Response.json({ ok: true, fayl_id: tz.body.fayl_id, raqam: tz.body.raqam });
}

export async function bolakBekor(env: Env, actorId: number, b: Record<string, any> | null): Promise<Response> {
  const t = await bolakTokenOl(env, b?.t, actorId);
  if (!t) return Response.json({ ok: true }); // yaroqsiz/eskirgan token: bekor qilish zararsiz
  await r2BolakBekor(env.R2_CANONICAL, t.k, t.u).catch(() => undefined);
  await hmRpc(env, 't2_hm_yuklash_bekor_v1', { p_actor: actorId, p_versiya_id: t.v });
  return Response.json({ ok: true });
}

/** Ikkala marshrut uchun yagona yo'naltirgich. null = bu so'rov bo'lakli oqim emas (oddiy yuklash davom etadi). */
export async function bolakYonalt(env: Env, actorId: number, request: Request): Promise<Response | null> {
  const u = new URL(request.url); const amal = u.searchParams.get('amal');
  if (!amal) return null;
  if (amal === 'qism' && (request.method === 'PUT' || request.method === 'POST')) return bolakQism(env, actorId, u.searchParams.get('t'), u.searchParams.get('n'), request);
  if (request.method !== 'POST') return xato('AMAL_NOMALUM', 405);
  const b = await request.json().catch(() => null) as Record<string, any> | null;
  if (amal === 'boshla') return bolakBoshla(env, actorId, b);
  if (amal === 'tugat') return bolakTugat(env, actorId, b);
  if (amal === 'bekor') return bolakBekor(env, actorId, b);
  return xato('AMAL_NOMALUM', 400);
}
