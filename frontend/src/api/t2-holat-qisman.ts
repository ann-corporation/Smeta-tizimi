import { sbOqi, type T2Qator, type T2QatorHolat } from './supabase';
import { T2_DARAXT_USTUNLARI } from './t2-daraxt-ustunlar';

/**
 * `t2_daraxt` — faqat berilgan qatorlar (qator tahriridan keyin: o'zi, ota-bobolari, bolalari).
 * Ustunlar to'liq yuklash bilan bir xil — yamalgan qator shakli o'zgarmaydi.
 */
export function sbT2DaraxtQisman(obyektId: number, qatorIdlar: readonly number[]) {
  const idlar = qatorIdlar.filter((id) => Number.isSafeInteger(id) && id > 0);
  return sbOqi<T2Qator>({
    jadval: 't2_daraxt',
    filtr: `obyekt_id=eq.${obyektId}&id=in.(${idlar.join(',')})`,
    ustunlar: T2_DARAXT_USTUNLARI,
    tartib: 'id.asc',
    limit: Math.max(1, idlar.length),
  });
}

/**
 * Obyektning faqat berilgan qatorlari holati. `obyekt_id=eq.N` filtri
 * majburiy qoladi — gateway tenant chegarasini shu bilan tekshiradi.
 */
export function sbT2QatorHolatQisman(obyektId: number, qatorIdlar: readonly number[]) {
  const idlar = qatorIdlar.filter((id) => Number.isSafeInteger(id) && id > 0);
  return sbOqi<T2QatorHolat>({
    jadval: 't2_qator_holat',
    filtr: `obyekt_id=eq.${obyektId}&qator_id=in.(${idlar.join(',')})`,
    limit: Math.max(1, idlar.length),
  });
}
