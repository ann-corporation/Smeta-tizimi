/**
 * Tender ochiq rejim (P1, 20261216510000) — /api/tender-ochiq (kirmasdan GET) va /api/tender-p1 (kirgan xaridor amallari) uchun SOF funksiyalar.
 * Actor DOIM sessiyadan. Oq ro'yxat: faqat t2_tn_* RPC lar; mavjud tender RPC lari (taklif, ochish, g'olib) o'zlarining /api/sb, /api/sb-yoz yo'llarida qoladi.
 * Muhr bazada: ochilgunga qadar narxni hech qaysi yo'l bermaydi (t2_tn_* ochilgan bo'lmasa MUHRLANGAN qaytaradi).
 */
type So = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const operationIdYaroqli = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const id = (v: unknown) => (v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

export const OCHIQ_AMALLAR = ['royxat', 'lot'] as const;
export type Qurilgan = { ok: true; rpc: string; body: So } | { ok: false; code: string };

export function quraOchiq(amal: unknown, p: URLSearchParams): Qurilgan {
  if (amal === 'lot') {
    const x = id(p.get('id'));
    return x == null ? { ok: false, code: 'ID_KERAK' } : { ok: true, rpc: 't2_tn_ochiq_lot_v1', body: { p_id: x } };
  }
  if (amal !== 'royxat') return { ok: false, code: 'AMAL_NOMA_LUM' };
  const f: So = {};
  const tur = p.get('tur'); if (tur && /^[a-z_]{2,40}$/.test(tur)) f.tur = tur;
  const q = p.get('q'); if (q) f.q = q.slice(0, 80);
  const lim = id(p.get('limit')); if (lim) f.limit = Math.min(lim, 100);
  return { ok: true, rpc: 't2_tn_ochiq_royxat_v1', body: { p_filtr: f } };
}

/** Xaridor amallari: kompaniya_id + operation_id (o'qish — ogohlantirish/bayonnoma — operation_id siz, lekin actor/kompaniya bilan). */
type Tur = 'yozish' | 'oqish';
export const AMALLAR: Readonly<Record<string, { rpc: string; tur: Tur; kalit: readonly string[] }>> = {
  lot_smetadan: { rpc: 't2_tn_lot_smetadan_v1', tur: 'yozish', kalit: ['obyekt_id', 'bolim_id', 'tur', 'doira', 'muddat', 'nom', 'izoh', 'qabul'] },
  aloqa: { rpc: 't2_tn_aloqa_v1', tur: 'yozish', kalit: ['rfq_id', 'taklif_id'] },
  narx_manba: { rpc: 't2_tn_narx_manba_v1', tur: 'yozish', kalit: ['rfq_id'] },
  ish_qadam: { rpc: 't2_tn_ish_qadam_v1', tur: 'yozish', kalit: ['rfq_id', 'qadam', 'umumiy_summa'] },
  korsatish: { rpc: 't2_tn_korsatish_v1', tur: 'yozish', kalit: ['rfq_id', 'korsat'] },
  ogohlantirish: { rpc: 't2_tn_ogohlantirish_v1', tur: 'oqish', kalit: ['rfq_id'] },
  bayonnoma: { rpc: 't2_tn_bayonnoma_v1', tur: 'oqish', kalit: ['rfq_id'] },
};

function oq(x: unknown, kalitlar: readonly string[]): So {
  const r: So = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return r;
  for (const k of kalitlar) {
    const v = (x as So)[k];
    if (v === undefined) continue;
    if (k === 'qabul') { if (Array.isArray(v)) r[k] = v.filter((n) => Number.isSafeInteger(Number(n))).slice(0, 50).map(Number); continue; }
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) continue;
    r[k] = typeof v === 'string' ? v.slice(0, 1100) : v;
  }
  return r;
}

export function quraRpc(amal: unknown, actorId: number, so: So): Qurilgan {
  if (typeof amal !== 'string' || !Object.prototype.hasOwnProperty.call(AMALLAR, amal)) return { ok: false, code: 'AMAL_NOMA_LUM' };
  const a = AMALLAR[amal];
  const kid = id(so.kompaniya_id);
  if (kid == null) return { ok: false, code: 'KOMPANIYA_KERAK' };
  const data = oq(so.data, a.kalit);
  if (a.tur === 'oqish') {
    const rid = id(data.rfq_id);
    if (rid == null) return { ok: false, code: 'RFQ_KERAK' };
    return { ok: true, rpc: a.rpc, body: { p_kompaniya_id: kid, p_actor_id: actorId, p_rfq_id: rid } };
  }
  if (!operationIdYaroqli(so.operation_id)) return { ok: false, code: 'OPERATION_ID_REQUIRED' };
  return { ok: true, rpc: a.rpc, body: { p_kompaniya_id: kid, p_actor_id: actorId, p_operation_id: so.operation_id, p_data: data } };
}

export function xatoHolati(pgKod: string | undefined): number {
  if (pgKod === '42501') return 403;
  if (pgKod === 'P0002') return 404;
  return 500;
}
