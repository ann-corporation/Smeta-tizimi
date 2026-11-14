/**
 * Bozor (P1, 20261216500000) — /api/bozor (kirgan foydalanuvchi) va /api/bozor-ochiq (kirmasdan) uchun SOF funksiyalar.
 * Actor DOIM sessiyadan. Tanadan faqat oq ro'yxatdagi amal va maydonlar o'tadi; RPC lar tenant/qoida/egalikni o'zi tekshiradi.
 * Sotuvchi amallari kompaniya a'zoligini talab qilmaydi (yakka shaxs); xaridor amallari kompaniya_id talab qiladi.
 */
type So = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const operationIdYaroqli = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const id = (v: unknown) => (v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

type Tur = 'faqat_actor' | 'actor_filtr' | 'yozish' | 'xaridor_oqish' | 'xaridor_sorov' | 'xaridor_yozish';
export const AMALLAR: Readonly<Record<string, { rpc: string; tur: Tur; kalit: readonly string[] }>> = {
  profil_ol: { rpc: 't2_bz_profil_ol_v1', tur: 'faqat_actor', kalit: [] },
  kabinet: { rpc: 't2_bz_kabinet_v1', tur: 'faqat_actor', kalit: [] },
  sorov_ochiq: { rpc: 't2_bz_sorov_ochiq_v1', tur: 'actor_filtr', kalit: ['hudud'] },
  mod_royxat: { rpc: 't2_bz_mod_royxat_v1', tur: 'faqat_actor', kalit: [] },
  profil_saqla: { rpc: 't2_bz_profil_saqla_v1', tur: 'yozish', kalit: ['nom', 'tur', 'telefon', 'hudud', 'tavsif', 'kompaniya_id'] },
  elon_saqla: { rpc: 't2_bz_elon_saqla_v1', tur: 'yozish', kalit: ['id', 'tur', 'holat', 'sarlavha', 'tavsif', 'kategoriya', 'pozitsiya_kodi', 'birlik', 'narx_qqs_siz', 'qqs_bor', 'min_hajm', 'hudud', 'radius_km', 'rasmlar'] },
  elon_holat: { rpc: 't2_bz_elon_holat_v1', tur: 'yozish', kalit: ['id', 'holat'] },
  taklif_ber: { rpc: 't2_bz_taklif_ber_v1', tur: 'yozish', kalit: ['sorov_id', 'narx_qqs_siz', 'muddat_kun', 'yetkazish', 'izoh', 'elon_id'] },
  yetkazildi: { rpc: 't2_bz_yetkazildi_v1', tur: 'yozish', kalit: ['sorov_id'] },
  baho: { rpc: 't2_bz_baho_v1', tur: 'yozish', kalit: ['sorov_id', 'ball', 'izoh'] },
  shikoyat: { rpc: 't2_bz_shikoyat_v1', tur: 'yozish', kalit: ['elon_id', 'sabab'] },
  mod_yashir: { rpc: 't2_bz_mod_yashir_v1', tur: 'yozish', kalit: ['elon_id', 'yashir', 'sabab'] },
  sorov_royxat: { rpc: 't2_bz_sorov_royxat_v1', tur: 'xaridor_oqish', kalit: [] },
  taqqos: { rpc: 't2_bz_taqqos_v1', tur: 'xaridor_sorov', kalit: ['sorov_id'] },
  sorov_yarat: { rpc: 't2_bz_sorov_yarat_v1', tur: 'xaridor_yozish', kalit: ['nom', 'birlik', 'hajm', 'hudud', 'resurs_kodi', 'zayavka_id', 'obyekt_id', 'tur', 'muddat_sana'] },
  golib_tanla: { rpc: 't2_bz_golib_tanla_v1', tur: 'xaridor_yozish', kalit: ['sorov_id', 'taklif_id'] },
  qabul: { rpc: 't2_bz_qabul_v1', tur: 'xaridor_yozish', kalit: ['sorov_id'] },
};
export const bozorAmalmi = (a: unknown): a is string => typeof a === 'string' && Object.prototype.hasOwnProperty.call(AMALLAR, a);

function oq(x: unknown, kalitlar: readonly string[]): So {
  const r: So = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return r;
  for (const k of kalitlar) {
    const v = (x as So)[k];
    if (v === undefined) continue;
    if (k === 'rasmlar') { if (Array.isArray(v)) r[k] = v.filter((s) => typeof s === 'string').slice(0, 8).map((s) => String(s).slice(0, 200)); continue; }
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) continue;
    r[k] = typeof v === 'string' ? v.slice(0, 2100) : v;
  }
  return r;
}

export type Qurilgan = { ok: true; rpc: string; body: So } | { ok: false; code: string };

export function quraRpc(amal: unknown, actorId: number, so: So): Qurilgan {
  if (!bozorAmalmi(amal)) return { ok: false, code: 'AMAL_NOMA_LUM' };
  const a = AMALLAR[amal];
  const data = oq(so.data, a.kalit);
  if (a.tur === 'faqat_actor') return { ok: true, rpc: a.rpc, body: { p_actor_id: actorId } };
  if (a.tur === 'actor_filtr') return { ok: true, rpc: a.rpc, body: { p_actor_id: actorId, p_filtr: data } };
  if (a.tur === 'yozish') {
    if (!operationIdYaroqli(so.operation_id)) return { ok: false, code: 'OPERATION_ID_REQUIRED' };
    return { ok: true, rpc: a.rpc, body: { p_actor_id: actorId, p_operation_id: so.operation_id, p_data: data } };
  }
  const kid = id(so.kompaniya_id);
  if (kid == null) return { ok: false, code: 'KOMPANIYA_KERAK' };
  if (a.tur === 'xaridor_oqish') return { ok: true, rpc: a.rpc, body: { p_kompaniya_id: kid, p_actor_id: actorId } };
  if (a.tur === 'xaridor_sorov') {
    const sid = id(data.sorov_id);
    if (sid == null) return { ok: false, code: 'SOROV_KERAK' };
    return { ok: true, rpc: a.rpc, body: { p_kompaniya_id: kid, p_actor_id: actorId, p_sorov_id: sid } };
  }
  if (!operationIdYaroqli(so.operation_id)) return { ok: false, code: 'OPERATION_ID_REQUIRED' };
  return { ok: true, rpc: a.rpc, body: { p_kompaniya_id: kid, p_actor_id: actorId, p_operation_id: so.operation_id, p_data: data } };
}

/** Ochiq (kirmasdan) o'qish: faqat oq ro'yxat; hech qanday actor yoki tenant ma'lumoti YO'Q. */
export const OCHIQ_AMALLAR = ['qidir', 'elon', 'sotuvchi', 'filtr'] as const;
export type OchiqAmal = (typeof OCHIQ_AMALLAR)[number];
export function quraOchiq(amal: unknown, p: URLSearchParams): Qurilgan {
  if (typeof amal !== 'string' || !(OCHIQ_AMALLAR as readonly string[]).includes(amal)) return { ok: false, code: 'AMAL_NOMA_LUM' };
  if (amal === 'filtr') return { ok: true, rpc: 't2_bz_ochiq_filtr_v1', body: {} };
  if (amal === 'elon' || amal === 'sotuvchi') {
    const x = id(p.get('id'));
    if (x == null) return { ok: false, code: 'ID_KERAK' };
    return { ok: true, rpc: amal === 'elon' ? 't2_bz_ochiq_elon_v1' : 't2_bz_ochiq_sotuvchi_v1', body: { p_id: x } };
  }
  const f: So = {};
  for (const k of ['tur', 'kategoriya', 'hudud']) { const v = p.get(k); if (v) f[k] = v.slice(0, 80); }
  const q = p.getAll('q').map((s) => s.slice(0, 80)).filter(Boolean).slice(0, 8);
  if (q.length) f.q = q;
  const lim = id(p.get('limit')); if (lim) f.limit = Math.min(lim, 100);
  const off = Number(p.get('offset')); if (Number.isSafeInteger(off) && off > 0) f.offset = Math.min(off, 10000);
  return { ok: true, rpc: 't2_bz_ochiq_qidir_v1', body: { p_filtr: f } };
}

export const rasmPrefiks = (actorId: number) => `bz/u${actorId}/`;
export const rasmKalitiYaroqli = (k: unknown) => typeof k === 'string' && /^bz\/u[0-9]{1,12}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(k);

export function xatoHolati(pgKod: string | undefined): number {
  if (pgKod === '42501') return 403;
  if (pgKod === 'P0002') return 404;
  return 500;
}
