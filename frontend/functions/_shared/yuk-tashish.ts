/**
 * Yuk tashish (Logistika P1, 20261216400000) — /api/yuk-tashish uchun SOF funksiyalar (Pages turlarisiz).
 * Actor DOIM sessiyadan. Tanadan faqat oq ro'yxatdagi amal va maydonlar o'tadi; RPC lar o'zi ruxsat/tenant/qoidani tekshiradi.
 * Haydovchi/yakka foydalanuvchi amallari kompaniya a'zoligini TALAB QILMAYDI (profil — t2_yb_tashuvchi, kompaniyasiz).
 * Yuk egasi amallari kompaniya_id talab qiladi (a'zolik va procurement.* RPC ichida).
 */
type So = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const operationIdYaroqli = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const id = (v: unknown) => (v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** Amal turlari: o'qish (actor, bolim, filtr) | yozish (actor, op, data) | joy (actor, data) | ega o'qish/yozish (kompaniya) */
type Tur = 'tashuvchi_ol' | 'yozish' | 'filtr' | 'joy' | 'ega_kuzat' | 'ega_yozish' | 'faqat_actor';
export const AMALLAR: Readonly<Record<string, { rpc: string; tur: Tur; bolim?: string; kalit: readonly string[] }>> = {
  profil: { rpc: 't2_yb_tashuvchi_ol_v1', tur: 'tashuvchi_ol', bolim: 'profil', kalit: [] },
  reys: { rpc: 't2_yb_p1_reys_v1', tur: 'faqat_actor', kalit: [] },
  yaqin: { rpc: 't2_yb_p1_yaqin_v1', tur: 'filtr', kalit: ['lat', 'lng', 'radius_km', 'limit'] },
  saqla: { rpc: 't2_yb_tashuvchi_saqla_v1', tur: 'yozish', kalit: ['ism', 'telefon', 'davlat_raqami', 'turi', 'yuk_t', 'yuk_m3', 'kompaniya_id'] },
  holat: { rpc: 't2_yb_p1_holat_v1', tur: 'yozish', kalit: ['onlayn', 'lat', 'lng', 'tashuvchi_id'] },
  qabul: { rpc: 't2_yb_p1_qabul_v1', tur: 'yozish', kalit: ['yuk_id', 'harakat', 'narx_qqs_siz', 'mashina_id', 'izoh', 'tashuvchi_id'] },
  qadam: { rpc: 't2_yb_p1_qadam_v1', tur: 'yozish', kalit: ['bron_id', 'qadam', 'qabul_nom', 'kod', 'imzo_r2_kalit', 'tashuvchi_id'] },
  dalil: { rpc: 't2_yb_dalil_qosh_v1', tur: 'yozish', kalit: ['bron_id', 'tur', 'r2_kalit', 'sha256', 'tashuvchi_id'] },
  bekor: { rpc: 't2_yb_bron_bekor_v1', tur: 'yozish', kalit: ['bron_id', 'sabab', 'tashuvchi_id'] },
  baho: { rpc: 't2_yb_tashuvchi_baho_v1', tur: 'yozish', kalit: ['bron_id', 'ball', 'izoh', 'tashuvchi_id'] },
  nizo: { rpc: 't2_yb_tashuvchi_nizo_v1', tur: 'yozish', kalit: ['bron_id', 'sabab', 'tashuvchi_id'] },
  joy: { rpc: 't2_yb_p1_joy_v1', tur: 'joy', kalit: ['bron_id', 'lat', 'lng', 'aniqlik_m', 'tashuvchi_id'] },
  ega_kuzat: { rpc: 't2_yb_p1_ega_kuzat_v1', tur: 'ega_kuzat', kalit: ['yuk_id'] },
  yuk_qosh: { rpc: 't2_yb_p1_yuk_qosh_v1', tur: 'ega_yozish', kalit: ['yuk_id', 'narx_rejim', 'mashina_sinf', 'zayavka_id', 'buyurtma_id'] },
};
export const yukTashishAmalmi = (a: unknown): a is string => typeof a === 'string' && Object.prototype.hasOwnProperty.call(AMALLAR, a);

function oq(x: unknown, kalitlar: readonly string[]): So {
  const r: So = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return r;
  for (const k of kalitlar) {
    const v = (x as So)[k];
    if (v === undefined) continue;
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) continue;
    r[k] = typeof v === 'string' ? v.slice(0, 600) : v;
  }
  return r;
}

export type Qurilgan = { ok: true; rpc: string; body: So; ega: boolean } | { ok: false; code: string };

/** R2 kaliti faqat shu foydalanuvchining yuklash prefiksi ostida bo'lishi shart (boshqa odamning faylini bog'lab bo'lmaydi). */
export const dalilPrefiks = (actorId: number) => `yb/u${actorId}/`;
const kalitYaroqli = (k: unknown, actorId: number) => typeof k === 'string' && k.startsWith(dalilPrefiks(actorId)) && k.length <= 300 && !k.includes('..');

export function quraRpc(amal: unknown, actorId: number, so: So): Qurilgan {
  if (!yukTashishAmalmi(amal)) return { ok: false, code: 'AMAL_NOMA_LUM' };
  const a = AMALLAR[amal];
  const data = oq(so.data, a.kalit);
  if (a.tur === 'tashuvchi_ol') return { ok: true, rpc: a.rpc, body: { p_actor_id: actorId, p_bolim: a.bolim, p_filtr: {} }, ega: false };
  if (a.tur === 'faqat_actor') return { ok: true, rpc: a.rpc, body: { p_actor_id: actorId }, ega: false };
  if (a.tur === 'filtr') return { ok: true, rpc: a.rpc, body: { p_actor_id: actorId, p_filtr: data }, ega: false };
  if (a.tur === 'joy') return { ok: true, rpc: a.rpc, body: { p_actor_id: actorId, p_data: data }, ega: false };
  if (amal === 'dalil' && !kalitYaroqli(data.r2_kalit, actorId)) return { ok: false, code: 'R2_KALIT_NOTOGRI' };
  if (amal === 'qadam' && data.imzo_r2_kalit != null && !kalitYaroqli(data.imzo_r2_kalit, actorId)) return { ok: false, code: 'R2_KALIT_NOTOGRI' };
  if (a.tur === 'yozish') {
    if (!operationIdYaroqli(so.operation_id)) return { ok: false, code: 'OPERATION_ID_REQUIRED' };
    return { ok: true, rpc: a.rpc, body: { p_actor_id: actorId, p_operation_id: so.operation_id, p_data: data }, ega: false };
  }
  const kid = id(so.kompaniya_id);
  if (kid == null) return { ok: false, code: 'KOMPANIYA_KERAK' };
  if (a.tur === 'ega_kuzat') {
    const yid = id(data.yuk_id);
    if (yid == null) return { ok: false, code: 'YUK_KERAK' };
    return { ok: true, rpc: a.rpc, body: { p_kompaniya_id: kid, p_actor_id: actorId, p_yuk_id: yid }, ega: true };
  }
  if (!operationIdYaroqli(so.operation_id)) return { ok: false, code: 'OPERATION_ID_REQUIRED' };
  return { ok: true, rpc: a.rpc, body: { p_kompaniya_id: kid, p_actor_id: actorId, p_operation_id: so.operation_id, p_data: data }, ega: true };
}

/** Foydalanuvchi xatosi (400) bo'lgan kodlar; PostgREST 42501 → 403; P0002 → 404. Boshqa xato matni qaytarilmaydi. */
export function xatoHolati(pgKod: string | undefined): number {
  if (pgKod === '42501') return 403;
  if (pgKod === 'P0002') return 404;
  return 500;
}
