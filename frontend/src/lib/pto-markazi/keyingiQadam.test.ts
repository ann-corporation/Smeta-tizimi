import { describe, expect, it } from 'vitest';
import { keyingiQadam, QADAM_YOL } from './keyingiQadam';
import { markazHolati, qadamHolatlari, type MarkazAkt, type MarkazKirish } from './markaz';

const akt = (o: Partial<MarkazAkt>): MarkazAkt => ({ tur: 'fakt', holat: 'tasdiqlangan', lifecycle_status: null, oy: '2026-11-01', yaratildi: '2026-11-03T10:00:00Z', hujjat_jami: 100, yozilgan_jami: 100, ...o });
const kirish = (o: Partial<MarkazKirish> = {}): MarkazKirish => ({ smetaJami: 1000, narxsiz: 0, aktlar: [], importQoralama: 0, forma3: null, oy: '2026-11', ...o });
const qadam = (o: Partial<MarkazKirish>) => keyingiQadam(markazHolati(kirish(o))).kod;

describe('keyingiQadam (sof tanlov)', () => {
  it('smeta yo‘q — avval smeta', () => { expect(qadam({ smetaJami: null })).toBe('smeta-yoq'); });
  it('fakt qoralamasi bor — faktni yakunlang', () => {
    expect(qadam({ aktlar: [akt({ holat: 'qoralama' })] })).toBe('fakt-yakunla');
  });
  it('ochiq import qoralamasi — importni davom ettiring', () => {
    expect(qadam({ aktlar: [akt({})], importQoralama: 2 })).toBe('import-davom');
  });
  it('F2 qoralamasi — tugating', () => {
    expect(qadam({ aktlar: [akt({}), akt({ tur: 'f2', holat: 'qoralama' })] })).toBe('f2-tasdiqla');
  });
  it('fakt umuman yo‘q — fakt kiriting', () => { expect(qadam({ aktlar: [] })).toBe('fakt-kiriting'); });
  it('fakt saqlangan, shu oyda F2 yo‘q — F2 yasang', () => {
    expect(qadam({ aktlar: [akt({})] })).toBe('f2-yasang');
    expect(qadam({ aktlar: [akt({}), akt({ tur: 'f2', oy: '2026-10-01' })] })).toBe('f2-yasang');
  });
  it('F2 tasdiqlangan, Forma 3 yo‘q — Forma 3', () => {
    expect(qadam({ aktlar: [akt({}), akt({ tur: 'f2', oy: '2026-11-01' })], forma3: 0 })).toBe('forma3');
  });
  it('Forma 3 noma‘lum (null) — taxmin qilinmaydi, paket', () => {
    expect(qadam({ aktlar: [akt({}), akt({ tur: 'f2' })], forma3: null })).toBe('paket');
  });
  it('bekor qilingan F2 hisobga olinmaydi', () => {
    expect(qadam({ aktlar: [akt({}), akt({ tur: 'f2', holat: 'bekor' })] })).toBe('f2-yasang');
  });
  it('akt reestri o‘qilmadi (null) — qoralama deb taxmin qilinmaydi', () => {
    const h = markazHolati(kirish({ aktlar: null }));
    expect(h.faktQoralama).toBeNull();
    expect(h.f2TasdiqJami).toBeNull();
    expect(Object.values(qadamHolatlari(h)).some((x) => x.matn === '—')).toBe(true);
  });
  it('har qadam yo‘lga ega', () => { expect(QADAM_YOL.fakt).toBe('/admin/fakt'); expect(QADAM_YOL.nakopitelniy).toBe('/admin/nakopitelniy'); });
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
