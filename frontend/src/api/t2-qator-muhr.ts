/**
 * SMETA CONST — qator muhri farqini o'qish (view `t2_qator_muhr_farq`, /api/sb, kompaniya siyosati). Faqat o'qish.
 * View faqat farqi bor qatorlarni beradi (o'zgargan / o'chirilgan / qo'shilgan / muhrsiz) — odatda kam qator.
 */
import { sbOqi } from './supabase';
import { t2ToliqOqi } from './t2-toliq-oqish';
import { MUHR_FARQ_USTUNLARI, type QatorMuhrFarq } from '../lib/qator-muhr/farq';

export async function qatorMuhrFarqOl(obyektId: number) {
  return t2ToliqOqi<QatorMuhrFarq>(sbOqi, {
    jadval: 't2_qator_muhr_farq', filtr: `obyekt_id=eq.${obyektId}`, ustunlar: MUHR_FARQ_USTUNLARI, limit: 200000,
  }, 'qator_id');
}
