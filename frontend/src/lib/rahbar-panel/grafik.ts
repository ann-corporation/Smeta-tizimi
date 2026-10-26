/**
 * RAHBAR PANELI GRAFIKLARI — sof hisoblar (egasi 2026-10-25: «rahbar paneli maksimal vizual bo'lsin»).
 * Yangi biznes formula YO'Q: faqat boss-dashboard allaqachon bergan qiymatlarni chizish shakliga keltiradi.
 * NULL ≠ 0: noma'lum smeta plitka maydoniga kirmaydi (alohida sanaladi), noma'lum summa ustunda «—».
 */
import type { BossSignal } from '../../api/t2-boss';
import type { PortfolioTotals } from '../../components/boss-decision/model';
import { yumaloqMax } from '../nakopitelniy-grafik';

/** Obyekt holati — rang guruhi (mavjud belgilardan, ball emas). */
export type ObyektHolat = 'xavf' | 'diqqat' | 'tekshiruv' | 'toza';
export function obyektHolati(o: Pick<PortfolioTotals, 'approved_missing' | 'estimate_missing' | 'unpriced_rows' | 'pending_changes' | 'review_count' | 'draft_count'>): ObyektHolat {
  if (o.approved_missing > 0 || o.estimate_missing > 0) return 'xavf';
  if (o.unpriced_rows > 0 || o.pending_changes > 0) return 'diqqat';
  if (o.review_count > 0 || o.draft_count > 0) return 'tekshiruv';
  return 'toza';
}
export const HOLAT_RANG: Record<ObyektHolat, string> = { xavf: 'var(--danger)', diqqat: 'var(--warn)', tekshiruv: 'var(--info)', toza: 'var(--ok)' };
export const HOLAT_NOMI: Record<ObyektHolat, string> = {
  xavf: 'Summa yoki smeta yetishmaydi', diqqat: 'Narxsiz qator yoki o‘zgarish bor', tekshiruv: 'F2 tekshiruvda / qoralamada', toza: 'Ochiq masala qayd etilmagan',
};

export type Plitka = { id: string; x: number; y: number; w: number; h: number };

/** Squarified treemap (Bruls va b.): qiymatlar > 0, w×h to'rtburchakka joylashadi. */
export function squarify(items: readonly { id: string; qiymat: number }[], w: number, h: number): Plitka[] {
  const toza = items.filter((i) => Number.isFinite(i.qiymat) && i.qiymat > 0).sort((a, b) => b.qiymat - a.qiymat);
  const jami = toza.reduce((s, i) => s + i.qiymat, 0);
  if (!jami || w <= 0 || h <= 0) return [];
  const k = (w * h) / jami;
  const qolgan = toza.map((i) => ({ id: i.id, a: i.qiymat * k }));
  const out: Plitka[] = [];
  let x = 0, y = 0, W = w, H = h;
  const eng = (qator: { a: number }[], tomon: number) => {
    const s = qator.reduce((t, r) => t + r.a, 0);
    const mx = Math.max(...qator.map((r) => r.a)), mn = Math.min(...qator.map((r) => r.a));
    return Math.max((tomon * tomon * mx) / (s * s), (s * s) / (tomon * tomon * mn));
  };
  while (qolgan.length) {
    const tomon = Math.min(W, H);
    const qator = [qolgan.shift()!];
    while (qolgan.length && eng([...qator, qolgan[0]], tomon) <= eng(qator, tomon)) qator.push(qolgan.shift()!);
    const s = qator.reduce((t, r) => t + r.a, 0);
    if (W >= H) { // chap ustun
      const kenglik = s / H; let yy = y;
      for (const r of qator) { const hh = r.a / kenglik; out.push({ id: r.id, x, y: yy, w: kenglik, h: hh }); yy += hh; }
      x += kenglik; W -= kenglik;
    } else { // yuqori qator
      const balandlik = s / W; let xx = x;
      for (const r of qator) { const ww = r.a / balandlik; out.push({ id: r.id, x: xx, y, w: ww, h: balandlik }); xx += ww; }
      y += balandlik; H -= balandlik;
    }
  }
  return out;
}

/** Bitta shkala: 0..max (yumaloq) va 5 teng bo'lak belgilari. */
export function shkala(qiymatlar: readonly (number | null | undefined)[]): { max: number; belgilar: number[] } {
  const m = Math.max(0, ...qiymatlar.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
  const max = yumaloqMax(m);
  return { max, belgilar: [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => max * f) };
}

export type SignalDaraja = 'muhim' | 'orta' | 'past';
const DARAJA: Record<string, SignalDaraja> = { critical: 'muhim', high: 'muhim', error: 'muhim', medium: 'orta', warning: 'orta' };
export const signalDarajasi = (s: Pick<BossSignal, 'severity'>): SignalDaraja => DARAJA[s.severity ?? ''] ?? 'past';
/** Ko'rsatilgan signallar darajasi bo'yicha (qayd soni bilan). */
export function signallarDaraja(signals: readonly Pick<BossSignal, 'severity' | 'quantity'>[]): Record<SignalDaraja, number> {
  const r: Record<SignalDaraja, number> = { muhim: 0, orta: 0, past: 0 };
  for (const s of signals) r[signalDarajasi(s)] += s.quantity ?? 1;
  return r;
}
