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

/**
 * Bir nechta akt uchun BITTA so'rov (F2 tarixi ro'yxati: N+1 yo'q): import qilingan aktlar to'plami.
 * Ustun ro'yxati kesilsa (limit) — ishonchsiz natija o'rniga akt-akt tekshiruvga qaytadi.
 */
export async function f2ImportAktlari(aktIds: readonly number[]): Promise<Set<number>> {
  const ids = [...new Set(aktIds.filter((x) => Number.isSafeInteger(x) && x > 0))];
  if (!ids.length) return new Set();
  const LIMIT = 20000;
  const r = await sbOqi<{ akt_id: number }>({ jadval: 't2_akt_qator', filtr: `akt_id=in.(${ids.join(',')})&raw_snapshot->>manba=eq.f2_v3`, ustunlar: 'akt_id', limit: LIMIT });
  if (!r.ok) throw new Error('F2_MANBA_OQILMADI');
  const rows = r.qatorlar ?? [];
  if (rows.length >= LIMIT) {
    const belgi = await Promise.all(ids.map((id) => f2ImportQilinganmi(id)));
    return new Set(ids.filter((_, i) => belgi[i]));
  }
  const natija = new Set(rows.map((x) => x.akt_id));
  for (const id of ids) kesh.set(id, Promise.resolve(natija.has(id)));
  return natija;
}
