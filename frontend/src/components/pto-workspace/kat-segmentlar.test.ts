import { describe, expect, it } from 'vitest';
import { katSegmentlar } from './kat-segmentlar';

describe('katSegmentlar', () => {
  it('adds "boshqa" segment = jami - sum4 when positive', () => {
    const r = katSegmentlar({ jami: 1000, chel: 100, mash: 100, mat: 500, ob: 100 });
    expect(r.segmentlar.map((s) => s.kalit)).toEqual(['chel', 'mash', 'mat', 'ob', 'boshqa']);
    expect(r.segmentlar[4].summa).toBe(200);
    expect(r.jami).toBe(1000);
  });
  it('no boshqa when sum4 covers jami or any column is null', () => {
    expect(katSegmentlar({ jami: 800, chel: 100, mash: 100, mat: 500, ob: 100 }).segmentlar.some((s) => s.kalit === 'boshqa')).toBe(false);
    expect(katSegmentlar({ jami: 1000, chel: null, mash: 100, mat: 500, ob: 100 }).segmentlar.some((s) => s.kalit === 'boshqa')).toBe(false);
    expect(katSegmentlar({ jami: null, chel: 1, mash: 1, mat: 1, ob: 1 }).segmentlar).toHaveLength(4);
  });
});
