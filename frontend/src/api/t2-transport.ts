/**
 * Transport maydonlari (`t2_qator.transport_usul / transport_manba_qator_id / transport_zichlik / transport_km`) — `t2_daraxt`
 * view'ida yo'q, shu sabab F-2 smeta qatorlariga alohida o'qib qo'shiladi (migratsiya 20270120200000). Faqat transport belgisi bor
 * qatorlar o'qiladi (kichik ro'yxat). Xato — throw: o'qilmasa podvalda transport ikki marta hisoblanib ketardi (jim tashlanmaydi).
 */
import { sbOqi, type T2Qator } from './supabase';
import { t2ToliqOqi } from './t2-toliq-oqish';

type Satr = { id: number; transport_usul: string | null; transport_manba_qator_id: number | null; transport_zichlik: number | string | null; transport_km: number | string | null };
const USTUNLAR = 'id,transport_usul,transport_manba_qator_id,transport_zichlik,transport_km';
const num = (x: number | string | null | undefined): number | null => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

export async function transportMalumotOl(obyektId: number): Promise<Map<number, Satr>> {
  const filtrlar = ['transport_usul=in.(foiz,tkm,narx_ichida)', 'transport_manba_qator_id=gt.0'] /* 
ot.is.null shlyuz/shimda yo'q — qo'llab-quvvatlanadigan operatorlar */;
  const javoblar = await Promise.all(filtrlar.map((f) => t2ToliqOqi<Satr>(sbOqi, { jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&${f}`, ustunlar: USTUNLAR, limit: 200000 }, 'id')));
  const m = new Map<number, Satr>();
  for (const j of javoblar) {
    if (!j.ok || j.toliq === false) throw new Error('TRANSPORT_OQILMADI');
    for (const x of j.qatorlar ?? []) m.set(Number(x.id), x);
  }
  return m;
}

/** Smeta qatorlariga transport maydonlarini qo'shadi (transport belgisi yo'q qator o'zgarmaydi). */
export async function transportBilan(obyektId: number, smeta: T2Qator[]): Promise<T2Qator[]> {
  const m = await transportMalumotOl(obyektId);
  if (!m.size) return smeta;
  return smeta.map((r) => {
    const x = m.get(r.id);
    return x ? { ...r, transport_usul: x.transport_usul, transport_manba_qator_id: x.transport_manba_qator_id == null ? null : Number(x.transport_manba_qator_id), transport_zichlik: num(x.transport_zichlik), transport_km: num(x.transport_km) } : r;
  });
}