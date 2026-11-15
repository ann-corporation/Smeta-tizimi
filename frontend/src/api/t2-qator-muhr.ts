/**
 * SMETA CONST — qator muhri farqini o'qish (RPC `qator_muhr_farq_obyekt_v1` → `t2_qator_muhr_farq` view'ining keshi, /api/sb, kompaniya siyosati). Faqat o'qish.
 * View faqat farqi bor qatorlarni beradi (o'zgargan / o'chirilgan / qo'shilgan / muhrsiz) — odatda kam qator. Obyekt iflos bo'lsa server view'dan jonli o'qiydi.
 * Saqlash dietasi: muhr yuklamasi R2 da bo'lishi mumkin (sovuq). O'zgargan sovuq qatorning avval/endi si bo'sh kelsa — bir marta
 * /api/muhr-isit (R2 -> baza, xesh tekshiruvi bilan) chaqiriladi va qayta o'qiladi. Xato bo'lsa — jim: avvalgi natija (belgi bor, tafsilot yo'q).
 */
import { sbSoroQatorlar } from './supabase';
import { muhrSovuqKerak, type QatorMuhrFarq } from '../lib/qator-muhr/farq';

export async function qatorMuhrFarqOl(obyektId: number) {
  const oqi = () => sbSoroQatorlar<QatorMuhrFarq>('qator_muhr_farq_obyekt_v1', { obyekt_id: obyektId });
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
