import { sbOqi } from './supabase';
import { f2NarxYigish, type F2AktQator, type F2Narx } from '../lib/fakt-f2-tenglash';

/**
 * «Fakt = F2» uchun TASDIQLANGAN F2 qatorlari narxi (egasi 2026-10-28: «F2 da fakt olingan narx bilan qilganman — fakt ga
 * shu narx kirishi kerak»). Faqat o'qish: obyektning tasdiqlangan F2 aktlari → ularning qatorlari (hajm/narx/sertifikat).
 * Yig'ish (bitta narx / hajm bo'yicha o'rtacha / narxsiz) — sof `f2NarxYigish` da.
 */
export async function sbF2TasdiqNarxlar(obyektId: number): Promise<{ ok: boolean; narxlar: Map<number, F2Narx>; error?: string }> {
  const bosh = { ok: false, narxlar: new Map<number, F2Narx>() };
  const a = await sbOqi<{ id: number }>({ jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.f2&holat=eq.tasdiqlangan`, ustunlar: 'id', limit: 5000 });
  if (!a.ok) return { ...bosh, error: a.error };
  const ids = (a.qatorlar || []).map((x) => Number(x.id)).filter((x) => Number.isSafeInteger(x) && x > 0);
  if (!ids.length) return { ok: true, narxlar: new Map() };
  const qatorlar: F2AktQator[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const q = await sbOqi<F2AktQator>({
      jadval: 't2_akt_qator', filtr: `akt_id=in.(${ids.slice(i, i + 100).join(',')})`,
      ustunlar: 'akt_id,qator_id,hajm,narx,summa,certified_quantity,certified_unit_price,certified_amount', limit: 100000,
    });
    if (!q.ok) return { ...bosh, error: q.error };
    qatorlar.push(...(q.qatorlar || []));
  }
  return { ok: true, narxlar: f2NarxYigish(qatorlar) };
}
