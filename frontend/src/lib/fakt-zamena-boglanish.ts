/**
 * Fakt jurnali uchun zamena bog'lanishi (faqat o'qish, ixtiyoriy): zamena → asl qator (replaces_line_id)
 * va asl qatorning zamenalar qoplagan hajmi (t2_qator_holat.almashtirilgan_hajm).
 * Xato bo'lsa bo'sh xarita qaytadi — jurnal ishlashda davom etadi (faqat «asl X» belgilari chiqmaydi).
 */
import { sbOqi } from '../api/supabase';
import type { ZamenaBoglanish } from './fakt-jurnal';

export async function zamenaBoglanishOl(obyektId: number): Promise<ZamenaBoglanish> {
  const [z, h] = await Promise.all([
    sbOqi<{ id: number; replaces_line_id: number | null }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&zamena=is.true`, ustunlar: 'id,replaces_line_id', limit: 20000 }).catch(() => null),
    sbOqi<{ qator_id: number; almashtirilgan_hajm: number | null }>({ jadval: 't2_qator_holat', filtr: `obyekt_id=eq.${obyektId}&almashtirilgan_hajm=gt.0`, ustunlar: 'qator_id,almashtirilgan_hajm', limit: 20000 }).catch(() => null),
  ]);
  const almashtiradi = new Map<number, number>();
  if (z?.ok) for (const r of z.qatorlar ?? []) if (r.replaces_line_id != null) almashtiradi.set(Number(r.id), Number(r.replaces_line_id));
  const almashtirilgan = new Map<number, number>();
  if (h?.ok) for (const r of h.qatorlar ?? []) { const v = Number(r.almashtirilgan_hajm); if (Number.isFinite(v) && v > 0) almashtirilgan.set(Number(r.qator_id), v); }
  return { almashtiradi, almashtirilgan };
}

/**
 * Zamena qatorlarining «aslning qancha hajmini almashtiradi» qiymati (t2_qator.almashtirish_hajm, aslning birligida).
 * Alohida so'rov: ustun bo'lmasa/xato bo'lsa bo'sh xarita — qoida proporsional ulushga qaytadi (to'qilmaydi).
 */
export async function zamenaMiqdorOl(obyektId: number): Promise<Map<number, number>> {
  const r = await sbOqi<{ id: number; almashtirish_hajm: number | null }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&zamena=is.true&almashtirish_hajm=not.is.null`, ustunlar: 'id,almashtirish_hajm', limit: 20000 }).catch(() => null);
  const m = new Map<number, number>();
  if (r?.ok) for (const x of r.qatorlar ?? []) { const v = Number(x.almashtirish_hajm); if (x.almashtirish_hajm != null && Number.isFinite(v) && v >= 0) m.set(Number(x.id), v); }
  return m;
}
