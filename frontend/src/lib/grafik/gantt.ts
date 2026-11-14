import type { GrafikQator, Holat } from './reja';

export const QATOR_BALANDLIGI = 26;
export const KO_RINISH = 520;
const EXTRA = 8;
export const HOLAT_NOMI: Record<Holat, string> = {
  bajarildi: 'Bajarildi', kechikmoqda: 'Kechikmoqda', vaqtida: 'Vaqtida', oldinda: 'Oldinda', boshlanmagan: 'Boshlanmagan', malumot_yoq: 'Fakt ma’lumoti yo‘q',
};
export const foizMatni = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** Daraxtdan ko'rinadigan qatorlar (yopilgan ota ostidagilar chiqarib tashlanadi). Sof funksiya. */
export function korinadiganlar(qatorlar: readonly GrafikQator[], yopiq: ReadonlySet<number>): GrafikQator[] {
  const ota = new Map(qatorlar.map((q) => [q.id, q.otaId]));
  const yopiqmi = (q: GrafikQator) => { let p = q.otaId; let n = 0; while (p != null && n++ < 20) { if (yopiq.has(p)) return true; p = ota.get(p) ?? null; } return false; };
  return qatorlar.filter((q) => !yopiqmi(q));
}

/** Virtual oyna: [boshlanish, tugash) indekslari. Sof funksiya. */
export function virtualOyna(scrollTop: number, jami: number, balandlik = KO_RINISH, qator = QATOR_BALANDLIGI): [number, number] {
  const a = Math.max(0, Math.floor(scrollTop / qator) - EXTRA);
  const b = Math.min(jami, Math.ceil((scrollTop + balandlik) / qator) + EXTRA);
  return [a, b];
}

