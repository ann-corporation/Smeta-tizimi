/**
 * Uy sotish — panel (KPI) ko'rinish modeli: voronka konversiyasi, qarz «aging», ustun diagramma masshtabi.
 * Server `voronka` — har bosqichda HOZIR turgan bitimlar soni. Voronka uchun «shu bosqichga yetib kelganlar» =
 * shu va undan keyingi bosqichlar yig'indisi (bekor hisobga olinmaydi — qayerda bekor bo'lgani saqlanmaydi).
 */
import type { Bosqich, SotuvPanel } from '../../api/t2-sotuv';
import { BOSQICHLAR } from './bitim-korinish';

export type VoronkaQadam = { bosqich: Bosqich; hozir: number; yetdi: number; oldingidanFoiz: number | null; boshidanFoiz: number | null };

export function voronkaQur(v: Partial<Record<Bosqich, number>>): { qadamlar: VoronkaQadam[]; bekor: number } {
  const hozir = BOSQICHLAR.map((b) => Math.max(0, v[b] ?? 0));
  const yetdi = hozir.map((_, i) => hozir.slice(i).reduce((s, x) => s + x, 0));
  const qadamlar = BOSQICHLAR.map((bosqich, i) => ({
    bosqich, hozir: hozir[i], yetdi: yetdi[i],
    oldingidanFoiz: i === 0 ? null : foiz(yetdi[i], yetdi[i - 1]),
    boshidanFoiz: foiz(yetdi[i], yetdi[0]),
  }));
  return { qadamlar, bekor: Math.max(0, v.bekor ?? 0) };
}

/** a/b foizda (1 kasr), b=0 → null («hisoblab bo'lmaydi», 0 emas). */
export function foiz(a: number, b: number): number | null {
  if (!(b > 0)) return null;
  return Number((a / b * 100).toFixed(1));
}

export type AgingQator = { kalit: 'k0_30' | 'k31_90' | 'k90' | 'kelajak'; summa: number; ulush: number };
/** Qarz «aging» ustunlari: muddati o'tgan (0–30, 31–90, 90+) va kelajak (hali muddati kelmagan qoldiq). ulush — eng kattasiga nisbatan 0..1. */
export function agingQur(q: SotuvPanel['qarz']): AgingQator[] {
  const r = (['k0_30', 'k31_90', 'k90', 'kelajak'] as const).map((kalit) => ({ kalit, summa: Math.max(0, q[kalit] ?? 0) }));
  const max = Math.max(0, ...r.map((x) => x.summa));
  return r.map((x) => ({ ...x, ulush: max > 0 ? x.summa / max : 0 }));
}

/** Ustun diagramma: har qiymatning eng kattasiga nisbati (0..1). Bo'sh/0 — 0. */
export function ustunUlush(qiymatlar: ReadonlyArray<number | null>): number[] {
  const max = Math.max(0, ...qiymatlar.map((x) => x ?? 0));
  return qiymatlar.map((x) => (max > 0 && x != null && x > 0 ? x / max : 0));
}

/** Prognoz: keyingi 12 oyni to'liq ro'yxat qiladi (server faqat summasi bor oylarni qaytaradi). */
export function prognoz12(prognoz: SotuvPanel['prognoz'], hozir: Date = new Date()): Array<{ oy: string; summa: number }> {
  const m = new Map(prognoz.map((p) => [p.oy, p.summa]));
  const r: Array<{ oy: string; summa: number }> = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(hozir.getFullYear(), hozir.getMonth() + i, 1);
    const oy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    r.push({ oy, summa: m.get(oy) ?? 0 });
  }
  return r;
}

/** Manba konversiyasi: sotildi / lid (%). */
export function manbaKonversiya(m: SotuvPanel['manbalar']): Array<SotuvPanel['manbalar'][number] & { foiz: number | null }> {
  return m.map((x) => ({ ...x, foiz: foiz(x.sotildi, x.lid) }));
}
