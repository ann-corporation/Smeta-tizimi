/**
 * Zamena bog'lanishi (faqat o'qish): zamena → asl qator (replaces_line_id), asl qatorning zamenalar qoplagan hajmi
 * (t2_qator_holat.almashtirilgan_hajm) va zamenaning «aslning qancha hajmini almashtiradi» qiymati (almashtirish_hajm).
 *
 * Ikki xil iste'molchi:
 *  - `zamenaBoglanishOqi` / `zamenaMiqdorOqi` — QAT'IY (F2 tayyorlash: pul). O'qilmasa yoki to'liq o'qilmasa `{ ok: false }`:
 *    bo'sh xarita bilan davom etilsa asl va zamena ikkalasi F2 ga tushib, pul ikki marta olinardi (audit 2026-11-06, A-2).
 *  - `zamenaBoglanishOl` / `zamenaMiqdorOl` — Fakt jurnali uchun yumshoq: xato bo'lsa bo'sh xarita (faqat «asl X» belgilari chiqmaydi).
 * Hamma o'qish sahifalab (t2ToliqOqi) — shlyuz bir chaqiruvda ~5k qator qaytaradi, jim kesilmasin.
 */
import { sbOqi } from '../api/supabase';
import { t2ToliqOqi } from '../api/t2-toliq-oqish';
import type { ZamenaBoglanish } from './fakt-jurnal';

export type ZamenaOqish<T> = { ok: true; natija: T } | { ok: false; xato: string };
const XATO = 'Zamena bog‘lanishlari o‘qilmadi';

export async function zamenaBoglanishOqi(obyektId: number): Promise<ZamenaOqish<ZamenaBoglanish>> {
  try {
    const [z, h] = await Promise.all([
      t2ToliqOqi<{ id: number; replaces_line_id: number | null }>(sbOqi, { jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&zamena=is.true`, ustunlar: 'id,replaces_line_id', limit: 200000 }, 'id'),
      t2ToliqOqi<{ qator_id: number; almashtirilgan_hajm: number | null }>(sbOqi, { jadval: 't2_qator_holat', filtr: `obyekt_id=eq.${obyektId}&almashtirilgan_hajm=gt.0`, ustunlar: 'qator_id,almashtirilgan_hajm', limit: 200000 }, 'qator_id'),
    ]);
    if (!z.ok || z.toliq === false || !h.ok || h.toliq === false) return { ok: false, xato: XATO };
    const almashtiradi = new Map<number, number>();
    for (const r of z.qatorlar ?? []) if (r.replaces_line_id != null) almashtiradi.set(Number(r.id), Number(r.replaces_line_id));
    const almashtirilgan = new Map<number, number>();
    for (const r of h.qatorlar ?? []) { const v = Number(r.almashtirilgan_hajm); if (Number.isFinite(v) && v > 0) almashtirilgan.set(Number(r.qator_id), v); }
    return { ok: true, natija: { almashtiradi, almashtirilgan } };
  } catch { return { ok: false, xato: XATO }; }
}

/** Zamena → almashtirish_hajm (aslning birligida). Ustun bo'lmasa kalit yo'q — qoida proporsional ulushga qaytadi (to'qilmaydi). */
export async function zamenaMiqdorOqi(obyektId: number): Promise<ZamenaOqish<Map<number, number>>> {
  try {
    const r = await t2ToliqOqi<{ id: number; almashtirish_hajm: number | null }>(sbOqi, { jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&zamena=is.true&almashtirish_hajm=not.is.null`, ustunlar: 'id,almashtirish_hajm', limit: 200000 }, 'id');
    if (!r.ok || r.toliq === false) return { ok: false, xato: XATO };
    const m = new Map<number, number>();
    for (const x of r.qatorlar ?? []) { const v = Number(x.almashtirish_hajm); if (x.almashtirish_hajm != null && Number.isFinite(v) && v >= 0) m.set(Number(x.id), v); }
    return { ok: true, natija: m };
  } catch { return { ok: false, xato: XATO }; }
}

/** Fakt jurnali (yumshoq): xato bo'lsa bo'sh xarita — jurnal ishlashda davom etadi. F2 uchun `zamenaBoglanishOqi`. */
export async function zamenaBoglanishOl(obyektId: number): Promise<ZamenaBoglanish> {
  const r = await zamenaBoglanishOqi(obyektId);
  return r.ok ? r.natija : { almashtiradi: new Map(), almashtirilgan: new Map() };
}

/** Fakt jurnali (yumshoq): xato bo'lsa bo'sh xarita. F2 uchun `zamenaMiqdorOqi`. */
export async function zamenaMiqdorOl(obyektId: number): Promise<Map<number, number>> {
  const r = await zamenaMiqdorOqi(obyektId);
  return r.ok ? r.natija : new Map();
}
