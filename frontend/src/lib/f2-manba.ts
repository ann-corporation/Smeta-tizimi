/**
 * F2 akt qayerdan kelgan: F2 IMPORT (o'tgan davr hujjati, fayldan) yoki tizimda F2 TAYYORLASH. Egasi 2026-10-20:
 * import qilingan o'tgan F2 ni zakazchikka qayta yuborish ma'nosiz — «Zakazchikka yuborish» faqat tizimda tayyorlangan F2 uchun.
 * Belgi: import qatorlari `raw_snapshot.manba = 'f2_v3'` bilan yoziladi (t2_akt.manba ikkala yo'lda bir xil).
 */
import { sbOqi } from '../api/supabase';

const kesh = new Map<number, Promise<boolean>>();

/** Akt F2 importdan kelganmi. O'qib bo'lmasa — null emas, `false` emas: xato tashlanadi (chaqiruvchi tugmani yashirmaydi). */
export function f2ImportQilinganmi(aktId: number): Promise<boolean> {
  const k = kesh.get(aktId);
  if (k) return k;
  const p = (async () => {
    const r = await sbOqi<{ id: number }>({ jadval: 't2_akt_qator', filtr: `akt_id=eq.${aktId}&raw_snapshot->>manba=eq.f2_v3`, ustunlar: 'id', limit: 1 });
    if (!r.ok) throw new Error('F2_MANBA_OQILMADI');
    return (r.qatorlar ?? []).length > 0;
  })();
  kesh.set(aktId, p);
  p.catch(() => kesh.delete(aktId));
  return p;
}
