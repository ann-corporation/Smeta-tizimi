import { describe, expect, it } from 'vitest';
import { markazHolati, qadamHolatlari, type MarkazAkt, type MarkazKirish } from './markaz';

const akt = (o: Partial<MarkazAkt>): MarkazAkt => ({ tur: 'fakt', holat: 'tasdiqlangan', lifecycle_status: null, oy: '2026-11-01', yaratildi: '2026-11-03T10:00:00Z', hujjat_jami: 100, yozilgan_jami: 100, ...o });
const kirish = (o: Partial<MarkazKirish> = {}): MarkazKirish => ({ smetaJami: 1000, narxsiz: 0, aktlar: [], importQoralama: 0, forma3: null, oy: '2026-11', ...o });
describe('markazHolati (null ≠ 0)', () => {
  it('akt reestri o‘qilmadi (null) — qoralama deb taxmin qilinmaydi', () => {
    const h = markazHolati(kirish({ aktlar: null }));
    expect(h.faktQoralama).toBeNull();
    expect(h.f2TasdiqJami).toBeNull();
    expect(Object.values(qadamHolatlari(h)).some((x) => x.matn === '—')).toBe(true);
  });
});

describe('markazHolati / qadamHolatlari', () => {
  it('sonlar va oxirgi fakt sanasi', () => {
    const h = markazHolati(kirish({ aktlar: [akt({}), akt({ holat: 'qoralama', yaratildi: '2026-11-09T00:00:00Z' }), akt({ tur: 'f2', holat: 'qoralama' }), akt({ tur: 'f2' })] }));
    expect(h).toMatchObject({ faktQoralama: 1, faktSaqlangan: 1, faktOxirgiSana: '2026-11-09', f2Qoralama: 1, f2Tasdiq: 1 });
    expect(qadamHolatlari(h).fakt.ton).toBe('warn');
    expect(qadamHolatlari(h)['f2-yasash'].matn).toContain('1');
  });
  it('summa yo‘q — null, 0 emas', () => {
    expect(markazHolati(kirish({ aktlar: [akt({ tur: 'f2', hujjat_jami: null })] })).f2TasdiqJami).toBeNull();
  });
});
