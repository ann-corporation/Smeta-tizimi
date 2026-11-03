import { sbOqi } from './supabase';
import { EGIZAK_USTUNLAR, type EgizakQator } from '../lib/f2-moslash-v3/egizak';
import { t } from '../i18n/til';

/** Obyektning t2_qator qatorlari (egizak moslash uchun): F2 egizak nusxasi va Fakt egizaklari umumiy o'qiydi. */
export async function egizakQatorlarOl(oid: number): Promise<EgizakQator[]> {
  const r = await sbOqi<EgizakQator>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${oid}`, ustunlar: EGIZAK_USTUNLAR, tartib: 'id.asc', limit: 50000 });
  if (!r.ok) throw new Error(t('Egizak obyekt ma’lumotlari o‘qilmadi.'));
  return r.qatorlar ?? [];
}
