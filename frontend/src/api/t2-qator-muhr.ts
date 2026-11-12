/**
 * SMETA CONST — qator muhri farqini o'qish (view `t2_qator_muhr_farq`, /api/sb, kompaniya siyosati). Faqat o'qish.
 * View faqat farqi bor qatorlarni beradi (o'zgargan / o'chirilgan / qo'shilgan / muhrsiz) — odatda kam qator.
 * Saqlash dietasi: muhr yuklamasi R2 da bo'lishi mumkin (sovuq). O'zgargan sovuq qatorning avval/endi si bo'sh kelsa — bir marta
 * /api/muhr-isit (R2 -> baza, xesh tekshiruvi bilan) chaqiriladi va qayta o'qiladi. Xato bo'lsa — jim: avvalgi natija (belgi bor, tafsilot yo'q).
 */
import { sbOqi } from './supabase';
import { t2ToliqOqi } from './t2-toliq-oqish';
import { MUHR_FARQ_USTUNLARI, muhrSovuqKerak, type QatorMuhrFarq } from '../lib/qator-muhr/farq';

export async function qatorMuhrFarqOl(obyektId: number) {
  const oqi = () => t2ToliqOqi<QatorMuhrFarq>(sbOqi, {
    jadval: 't2_qator_muhr_farq', filtr: `obyekt_id=eq.${obyektId}`, ustunlar: MUHR_FARQ_USTUNLARI, limit: 200000,
  }, 'qator_id');
  const r = await oqi();
  if (!r.ok || !(r.qatorlar ?? []).some(muhrSovuqKerak)) return r;
  try {
    const j = await fetch('/api/muhr-isit', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ obyekt_id: obyektId }),
    });
    const b = j.ok ? await j.json().catch(() => null) as { isitildi?: number } | null : null;
    if (b && Number(b.isitildi) > 0) return await oqi();
  } catch { /* tarmoq xatosi: avvalgi natija */ }
  return r;
}
