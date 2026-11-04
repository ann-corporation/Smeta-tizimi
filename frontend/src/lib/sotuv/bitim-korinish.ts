/**
 * Uy sotish — bitim (kanban, karta, grafik) ko'rinish modeli: sof funksiyalar.
 * Server qoidalari (migratsiya 20261124000000, t2_sotuv_bitim_saqla_v1):
 *  - «bron» faqat bron RPC orqali (BRON_ORQALI); bronni bo'shatish — bron bekor (bitim «korsatildi» ga qaytadi);
 *  - «shartnoma» birlik + summa talab qiladi va birlikni SOTILGAN qiladi; «bekor» — sabab bilan;
 *  - «topshirildi» / «bekor» — yopiq (o'zgarmaydi); to'lov ('tolov') faqat shartnomadan keyin.
 */
import type { BitimQator, Bosqich } from '../../api/t2-sotuv';

export const BOSQICHLAR: readonly Bosqich[] = ['lid', 'aloqa', 'korsatildi', 'bron', 'shartnoma', 'tolov', 'topshirildi'];
export const OCHIQ_BOSQICH: readonly Bosqich[] = ['lid', 'aloqa', 'korsatildi'];
export const SOTILGAN_BOSQICH: readonly Bosqich[] = ['shartnoma', 'tolov', 'topshirildi'];

/** Migratsiyadagi manba ro'yxati (t2_sotuv_bitim.manba check). */
export const MANBALAR = ['telegram', 'instagram', 'olx', 'uybor', 'sayt', 'tavsiya', 'qongiroq', 'ofis', 'agent', 'boshqa'] as const;
export type Manba = typeof MANBALAR[number];

export type OtishTur = 'oddiy' | 'bron' | 'shartnoma' | 'bekor';
export type Otish = { bosqich: Bosqich; tur: OtishTur };

/**
 * UI da ruxsat etilgan o'tishlar (server bundan kengroq ruxsat bersa ham — orqaga «sotilgan»dan tushish va bronni
 * oddiy saqlash bilan tashlab ketish xavfli, shuning uchun taklif qilinmaydi).
 */
export function otishlar(joriy: Bosqich): Otish[] {
  if (joriy === 'topshirildi' || joriy === 'bekor') return [];
  if ((OCHIQ_BOSQICH as readonly string[]).includes(joriy)) {
    return [
      ...OCHIQ_BOSQICH.filter((b) => b !== joriy).map((b) => ({ bosqich: b, tur: 'oddiy' as const })),
      { bosqich: 'bron', tur: 'bron' }, { bosqich: 'shartnoma', tur: 'shartnoma' }, { bosqich: 'bekor', tur: 'bekor' },
    ];
  }
  if (joriy === 'bron') return [{ bosqich: 'shartnoma', tur: 'shartnoma' }, { bosqich: 'bekor', tur: 'bekor' }];
  if (joriy === 'shartnoma') return [{ bosqich: 'tolov', tur: 'oddiy' }, { bosqich: 'topshirildi', tur: 'oddiy' }, { bosqich: 'bekor', tur: 'bekor' }];
  return [{ bosqich: 'topshirildi', tur: 'oddiy' }, { bosqich: 'bekor', tur: 'bekor' }];
}

/** Shartnomaga o'tish uchun yetishmaydiganlar (server: BIRLIK_KERAK / SUMMA_KERAK). */
export function shartnomaYetishmaydi(b: { birlik_id: number | null; summa: number | null }): Array<'birlik' | 'summa'> {
  const r: Array<'birlik' | 'summa'> = [];
  if (b.birlik_id == null) r.push('birlik');
  if (b.summa == null || !(b.summa > 0)) r.push('summa');
  return r;
}

/** Kanban ustunlari: 7 bosqich (+ «bekor» — faqat so'ralsa). Ichida — oxirgi yangilangan tepada (server tartibi saqlanadi). */
export function kanbanGuruh(bitimlar: readonly BitimQator[], bekorKorsat: boolean): Array<{ bosqich: Bosqich; bitimlar: BitimQator[] }> {
  const ustunlar: Bosqich[] = bekorKorsat ? [...BOSQICHLAR, 'bekor'] : [...BOSQICHLAR];
  return ustunlar.map((bosqich) => ({ bosqich, bitimlar: bitimlar.filter((b) => b.bosqich === bosqich) }));
}

/** Bronning qolgan vaqti. otdi — muddat tugagan (server o'qishda yopadi). */
export function bronQoldi(tugaydi: string | null | undefined, hozir: Date = new Date()): { soat: number; daqiqa: number; otdi: boolean } | null {
  if (!tugaydi) return null;
  const ms = new Date(tugaydi).getTime() - hozir.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return { soat: 0, daqiqa: 0, otdi: true };
  const daq = Math.floor(ms / 60000);
  return { soat: Math.floor(daq / 60), daqiqa: daq % 60, otdi: false };
}

/** Keyingi aloqa sanasi holati: o'tgan (kechikkan) / bugun / kelajak. */
export function aloqaHolat(keyingi: string | null | undefined, hozir: Date = new Date()): 'otgan' | 'bugun' | 'kelajak' | null {
  if (!keyingi) return null;
  const k = new Date(keyingi);
  if (!Number.isFinite(k.getTime())) return null;
  const kun = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (kun(k) === kun(hozir)) return k.getTime() < hozir.getTime() ? 'otgan' : 'bugun';
  return k.getTime() < hozir.getTime() ? 'otgan' : 'kelajak';
}

/** Telefonni ko'rsatish: 998901234567 → +998 90 123 45 67 (boshqa uzunlik — o'zgarishsiz). */
export function telefonKorinish(t: string | null | undefined): string {
  if (!t) return '';
  const d = t.replace(/\D/g, '');
  const n = d.length === 9 ? `998${d}` : d;
  if (n.length === 12 && n.startsWith('998')) return `+998 ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10)}`;
  return t;
}

/** Boshlang'ich to'lov: summa yoki foiz (0..100) ko'rinishida kiritilgan qiymatdan summa. */
export function boshlangichSumma(summa: number, qiymat: number, foizmi: boolean): number {
  if (!(summa > 0) || !(qiymat > 0)) return 0;
  const s = foizmi ? summa * Math.min(qiymat, 100) / 100 : qiymat;
  return Math.min(s, summa);
}

/** Grafik Σ tekshiruvi (server: |Σ − summa| ≤ 1). */
export function grafikTekshir(qatorlar: ReadonlyArray<{ summa: number }>, summa: number | null): { jami: number; farq: number | null; mos: boolean } {
  const jami = qatorlar.reduce((s, q) => s + q.summa, 0);
  if (summa == null) return { jami, farq: null, mos: false };
  const farq = jami - summa;
  return { jami, farq, mos: Math.abs(farq) <= 1 && qatorlar.length > 0 };
}

/** Bugungi sana YYYY-MM-DD (mahalliy vaqt). */
export function bugun(hozir: Date = new Date()): string {
  return `${hozir.getFullYear()}-${String(hozir.getMonth() + 1).padStart(2, '0')}-${String(hozir.getDate()).padStart(2, '0')}`;
}

/** Bitim maydonini xavfsiz o'qish (bitim kartasi `Record<string, unknown>`). */
export function maydon<T = string>(o: Record<string, unknown> | null | undefined, k: string): T | null {
  const v = o?.[k];
  return v == null || v === '' ? null : (v as T);
}
export function sonMaydon(o: Record<string, unknown> | null | undefined, k: string): number | null {
  const v = o?.[k];
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
