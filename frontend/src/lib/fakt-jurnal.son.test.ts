import { describe, expect, it } from 'vitest';
import { jurnalPaket, sonOqi, sonTahlil } from './fakt-jurnal';

describe('sonOqi: obmer natijasi yozuvlari (sinov-fakt)', () => {
  it.each([
    ['12,35', 12.35], ['12.35', 12.35], ['1 234,5', 1234.5], ['1.234,5', 1234.5], ['1,234.5', 1234.5], ['1.234.567,5', 1234567.5],
    ['1,234,567', 1234567], ['1 234 567', 1234567], ['12 м2', 12], ['12,35 m²', 12.35], ['12,35м2', 12.35], ['  0,125  ', 0.125], ['-3,5 кг', -3.5], ['7', 7],
    ["1'234,5", 1234.5],
  ])('%s → %s', (kirish, kutilgan) => { expect(sonOqi(kirish)).toBe(kutilgan); });
  it('bo\'sh → null; chiqindi → NaN', () => {
    expect(sonOqi('  ')).toBeNull();
    for (const x of ['abc', '1e-7', '12,5,5', '1,23.4.5', '12 $', '1.2.3']) expect(sonOqi(x), x).toBeNaN();
  });
  it('noaniq: bitta ajratgich + 3 raqam («1.234», «1,234») — taxmin qilinmaydi', () => {
    expect(sonTahlil('1.234')).toEqual({ son: NaN, noaniq: true });
    expect(sonTahlil('1,234 m2')).toEqual({ son: NaN, noaniq: true });
    expect(sonTahlil('0,125').son).toBe(0.125);
    expect(sonTahlil('1234,567').son).toBe(1234.567);
  });
  it('jurnalPaket: noaniq → NOANIQ xatosi (SON_EMAS emas), tushunarli son o\'tadi', () => {
    const p = jurnalPaket({ 1: { rejim: '+', qiymat: '1.234' }, 2: { rejim: '+', qiymat: '12,35 m²' }, 3: { rejim: '+', qiymat: 'abc' } },
      new Map([[1, 0], [2, 0], [3, 0]]), new Map([[1, 100], [2, 100], [3, 100]]));
    expect(p.xatolar.get(1)).toBe('NOANIQ');
    expect(p.xatolar.get(3)).toBe('SON_EMAS');
    expect(p.qatorlar).toEqual([{ qator_id: 2, hajm: 12.35 }]);
  });
});
