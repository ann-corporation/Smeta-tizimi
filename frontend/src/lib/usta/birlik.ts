/**
 * Usta uchun birlik tushuntirish (sof funksiyalar). Smeta birligi «100 m²» bo'lsa, hajm «5» = 500 m² degani —
 * usta shuni adashmasligi uchun har joyda odam tilida ko'rsatiladi. Hisob-kitob EMAS: faqat ko'rsatish (pul yo'q).
 */
const ASOS: Record<string, string> = {
  m2: 'm²', 'м2': 'm²', 'm²': 'm²', 'м²': 'm²', kv: 'm²',
  m3: 'm³', 'м3': 'm³', 'm³': 'm³', 'м³': 'm³',
  m: 'm', 'м': 'm', 'pm': 'm', 'п.м': 'm', 'пм': 'm',
  dona: 'dona', 'шт': 'dona', 'шт.': 'dona', 'sht': 'dona',
  t: 'tonna', 'т': 'tonna', tonna: 'tonna',
  kg: 'kg', 'кг': 'kg',
  kompl: 'komplekt', 'компл': 'komplekt', 'компл.': 'komplekt',
};

export type BirlikTahlil = { ko: number; asos: string; belgi: string };

/** «100 м2» → { ko: 100, asos: 'm²', belgi: '100 m²' }; «м3» → { ko: 1, asos: 'm³', belgi: 'm³' }; noma'lum birlik o'zgarishsiz. */
export function birlikTahlil(birlik: string | null | undefined): BirlikTahlil | null {
  const s = String(birlik ?? '').trim().toLowerCase();
  if (!s) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*(.+)$/.exec(s);
  const ko = m ? Number(m[1].replace(',', '.')) : 1;
  const nomXom = (m ? m[2] : s).trim();
  if (!Number.isFinite(ko) || ko <= 0) return null;
  const asos = ASOS[nomXom] ?? nomXom;
  return { ko, asos, belgi: ko === 1 ? asos : `${ko} ${asos}` };
}

const son = (v: number) => Number(v.toFixed(3)).toLocaleString('ru-RU', { maximumFractionDigits: 3 });

/** «5 × 100 m² = 500 m²» (ko'paytirgich 1 bo'lsa — «5 m²»). Hajm yo'q — «—». */
export function hajmMatni(hajm: number | null | undefined, birlik: string | null | undefined): string {
  if (hajm == null || !Number.isFinite(hajm)) return '—';
  const b = birlikTahlil(birlik);
  if (!b) return son(hajm);
  if (b.ko === 1) return `${son(hajm)} ${b.asos}`;
  return `${son(hajm)} × ${b.belgi} = ${son(hajm * b.ko)} ${b.asos}`;
}

/** Katta tugmalar yonidagi tushuntirish: «Bitta birlik = 100 m². 5 ni kiritsangiz — 500 m² bajarilgan bo'ladi.» */
export function birlikIzohi(birlik: string | null | undefined, kiritilgan?: number | null): string | null {
  const b = birlikTahlil(birlik);
  if (!b || b.ko === 1) return null;
  const asos = `Bitta birlik = ${b.belgi}.`;
  if (kiritilgan == null || !Number.isFinite(kiritilgan) || kiritilgan === 0) return asos;
  return `${asos} ${son(kiritilgan)} kiritsangiz — ${son(kiritilgan * b.ko)} ${b.asos} bajarilgan bo‘ladi.`;
}

/** Qadam: katta +/- tugmasi qancha qo'shadi (birlik 100 bo'lsa 1, aks holda 1; kichik hajmda 0.5 emas — oddiy 1). */
export const QADAM = 1;
