import type { T2Qator, T2QatorHolat } from '../api/supabase';

/**
 * Slichitelniy bo'yicha «smetadan farqli» barglar soni (ortiq + kam) — `slichitelniyModeli(...)` ning `ortiq + kam` qiymati bilan
 * AYNAN bir xil (test: slichitelniy-farq-soni.test.ts), lekin to'liq model (saralash, daraxt, hujjat qatorlari) qurilmaydi: O(n).
 * Obyekt sahifasi zanjir chizig'i uchun faqat shu sonni oladi; to'liq model faqat panel/hujjat ochilganda quriladi.
 * Qoida: barg = rs/mat/ob yoki bolasiz bl; farq = fakt − smeta (qo'shimcha ish smetasi 0; hajm yoki fakt NULL — farq noma'lum, sanalmaydi).
 */
export function slichitelniyFarqSoni(qatorlar: readonly T2Qator[], holatlar: readonly T2QatorHolat[]): number {
  const ota = new Set<number>();
  const byId = new Set<number>();
  for (const q of qatorlar) byId.add(q.id);
  for (const q of qatorlar) if (q.ota_id != null && byId.has(q.ota_id)) ota.add(q.ota_id);
  const fakt = new Map<number, number | null>();
  for (const h of holatlar) fakt.set(h.qator_id, h.fakt_hajm == null ? null : Number(h.fakt_hajm));
  let n = 0;
  for (const q of qatorlar) {
    const tur = q.tur ?? '';
    const barg = tur === 'rs' || tur === 'mat' || tur === 'ob' || (tur === 'bl' && !ota.has(q.id));
    if (!barg) continue;
    const f = fakt.get(q.id) ?? null;
    const smeta = q.qoshimcha ? 0 : q.hajm ?? null;
    if (smeta == null || f == null) continue;
    if (Math.abs(f - smeta) >= 1e-9) n++;
  }
  return n;
}
