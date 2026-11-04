/**
 * Yuk birjasi (20261201000000) — egasi tomoni yozuvchi amallar uchun yuk (RPC parametrlari). SOF funksiya (Pages turlarisiz).
 * Imzo hammasida bir xil: (p_kompaniya_id, p_actor_id, p_operation_id, p_data). Actor DOIM sessiyadan; kompaniya a'zoligini sb-yoz tekshiradi,
 * ruxsat (procurement.*) va biznes qoidalarini RPC o'zi. Tashuvchi (haydovchi) amallari BU YERDA YO'Q — ular faqat service_role (bot/PR4).
 * `p_data` oq ro'yxat bo'yicha quriladi: matn kesiladi, son/bool/null o'tadi, ichki obyekt faqat `narx_hisob`.
 */
type Yuk = Record<string, unknown>;
type So = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (v: unknown) => (v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

const YUK_KALIT = ['id', 'versiya', 'nom', 'yuk_turi', 'a_nom', 'a_lat', 'a_lng', 'a_obyekt_id', 'b_nom', 'b_lat', 'b_lng', 'b_obyekt_id', 'masofa_km', 'tonna', 'hajm_m3',
  'sana_dan', 'sana_gacha', 'tolov_shakli', 'escrow', 'narx_taklif_qqs_siz', 'narx_tavsiya_qqs_siz', 'qqs_foiz', 'izoh'] as const;
const NARX_HISOB_KALIT = ['masofa_km', 'tonna', 'stavka_tkm', 'k_yuk', 'k_qaytish', 'k_shoshilinch', 'k_mashina', 'min_tarif', 'tavsiya_qqs_siz', 'pastki_qqs_siz', 'yuqori_qqs_siz', 'manba'] as const;

const KALITLAR: Record<string, readonly string[]> = {
  yb_yuk_saqla_v1: YUK_KALIT,
  yb_yuk_elon_v1: ['id', 'versiya'],
  yb_yuk_javob_v1: ['yuk_id', 'taklif_id', 'harakat', 'narx_qqs_siz', 'izoh'],
  yb_yuk_bekor_v1: ['yuk_id', 'sabab'],
  yb_yuk_tasdiq_v1: ['yuk_id'],
  yb_yuk_baho_v1: ['bron_id', 'ball', 'izoh'],
  yb_yuk_nizo_v1: ['bron_id', 'sabab'],
};

export const YB_AMALLAR = Object.fromEntries(Object.keys(KALITLAR).map((a) => [a, 't2_' + a])) as Record<keyof typeof KALITLAR, string>;
export const ybAmalmi = (a: string): boolean => Object.prototype.hasOwnProperty.call(KALITLAR, a);

function oq(x: unknown, kalitlar: readonly string[]): Yuk {
  const r: Yuk = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return r;
  for (const k of kalitlar) {
    const v = (x as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) continue;
    r[k] = typeof v === 'string' ? v.slice(0, 2000) : v;
  }
  return r;
}

/** Yuk yoki xato matni (400). */
export function ybYuk(amal: string, so: So, actorId: number): Yuk | string {
  if (!ybAmalmi(amal)) return "Noma'lum amal";
  const kid = id(so.kompaniya_id);
  if (!kid) return "kompaniya_id noto'g'ri";
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return "Sessiyada foydalanuvchi yo'q";
  const op = String(so.operation_id ?? '');
  if (!UUID.test(op)) return "operation_id UUID bo'lishi shart";
  const data = oq(so.data, KALITLAR[amal]);
  if (amal === 'yb_yuk_saqla_v1') {
    const nh = (so.data as Record<string, unknown> | undefined)?.narx_hisob;
    if (nh && typeof nh === 'object' && !Array.isArray(nh)) data.narx_hisob = oq(nh, NARX_HISOB_KALIT);
  }
  if (JSON.stringify(data).length > 20_000) return "data juda katta";
  return { p_kompaniya_id: kid, p_actor_id: actorId, p_operation_id: op, p_data: data };
}