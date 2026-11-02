import type { T2Obyekt } from '../../api/supabase';

export type KatSegment = { kalit: 'chel' | 'mash' | 'mat' | 'ob' | 'boshqa'; summa: number; rang: string };

export const KAT_RANG: Record<KatSegment['kalit'], string> = {
  chel: 'var(--kat-chel)', mash: 'var(--kat-mash)', mat: 'var(--kat-mat)', ob: 'var(--kat-ob)',
  boshqa: 'color-mix(in srgb, var(--kat-mat) 45%, var(--surface-3))',
};

/**
 * `t2_obyekt_jami` ning chel/mash/mat/ob ustunlari БЕЗ СКЛАД / КАБ / М/К ni o‘z ichiga olmaydi:
 * `jami − (chel+mash+mat+ob)` musbat bo‘lsa — «Boshqa material» segmenti. Noma’lum (null) ustun bo‘lsa farq aniqlanmaydi.
 */
export function katSegmentlar(o: Pick<T2Obyekt, 'jami' | 'chel' | 'mash' | 'mat' | 'ob'>): { segmentlar: KatSegment[]; jami: number } {
  const bor = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
  const qismlar: [KatSegment['kalit'], number | null][] = [['chel', o.chel], ['mash', o.mash], ['mat', o.mat], ['ob', o.ob]];
  const segmentlar: KatSegment[] = qismlar.filter((q): q is [KatSegment['kalit'], number] => bor(q[1]) && q[1] > 0).map(([kalit, summa]) => ({ kalit, summa, rang: KAT_RANG[kalit] }));
  const hammasi = qismlar.every((q) => bor(q[1]));
  if (hammasi && bor(o.jami)) {
    const boshqa = o.jami - qismlar.reduce((a, q) => a + (q[1] as number), 0);
    if (boshqa > 0.5) segmentlar.push({ kalit: 'boshqa', summa: boshqa, rang: KAT_RANG.boshqa });
  }
  const jami = segmentlar.reduce((a, s) => a + s.summa, 0);
  return { segmentlar, jami };
}

