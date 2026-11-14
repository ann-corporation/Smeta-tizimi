import { describe, expect, it } from 'vitest';
import { faktFormulaKonteksti, formulaXatosi, jurnalPaket, kiritmaSoni } from './fakt-jurnal';

const q = { smeta: 100, fakt: 60, qoldiq: 40, f2Mumkin: 30 };

describe('Fakt kiritmasida xavfsiz formula', () => {
  it('faktFormulaKonteksti: SMETA, FAKT, QOLDIQ, F2_MUMKIN', () => {
    expect(faktFormulaKonteksti(q)).toEqual({ SMETA: 100, FAKT: 60, QOLDIQ: 40, F2_MUMKIN: 30 });
  });
  it('kiritmaSoni: formula natijasi; oddiy son va foiz avvalgidek', () => {
    const k = faktFormulaKonteksti(q);
    expect(kiritmaSoni('=SMETA-FAKT', 100, k)).toBe(40);
    expect(kiritmaSoni('=SMETA*0,5', 100, k)).toBe(50);
    expect(kiritmaSoni('=QOLDIQ', 100, k)).toBe(40);
    expect(kiritmaSoni('=F2_MUMKIN+1', 100, k)).toBe(31);
    expect(kiritmaSoni('=1/3', 100, k)).toBe(0.333333);
    expect(kiritmaSoni('12,5', 100, k)).toBe(12.5);
    expect(kiritmaSoni('50%', 100, k)).toBe(50);
    expect(kiritmaSoni('', 100, k)).toBeNull();
    expect(kiritmaSoni('   ', 100, k)).toBeNull();
  });
  it('noto‘g‘ri formula — NaN; bo‘sh qiymat NULL, 0 emas', () => {
    const k = faktFormulaKonteksti(q);
    for (const x of ['=', '=1/0', '=NOMA', '=constructor', '=__proto__', '=SUM(1)', '=1+', '=window.alert(1)']) expect(kiritmaSoni(x, 100, k), x).toBeNaN();
    expect(kiritmaSoni('=FAKT', 100, { FAKT: null })).toBeNaN();
    expect(kiritmaSoni('=SMETA', null, {})).toBeNaN();
    expect(kiritmaSoni('=FAKT', 100)).toBeNaN(); // kontekstsiz — fail-closed
  });
  it('formulaXatosi sababni qaytaradi', () => {
    expect(formulaXatosi('=1/0', 1)).toBe('DIVIDE_BY_ZERO');
    expect(formulaXatosi('=XYZ', 1)).toBe('UNKNOWN_NAME');
    expect(formulaXatosi('=1+1', 1)).toBeNull();
    expect(formulaXatosi('5', 1)).toBeNull();
  });
  it('jurnalPaket: formula "=" va "+" rejimida delta beradi; xato formula saqlanmaydi', () => {
    const kont = new Map([[1, faktFormulaKonteksti(q)], [2, faktFormulaKonteksti(q)], [3, faktFormulaKonteksti(q)], [4, faktFormulaKonteksti(q)]]);
    const p = jurnalPaket({
      1: { rejim: '=', qiymat: '=SMETA' }, 2: { rejim: '+', qiymat: '=QOLDIQ/2' }, 3: { rejim: '+', qiymat: '=1/0' }, 4: { rejim: '=', qiymat: '=NOMA' },
    }, new Map([[1, 60], [2, 60], [3, 60], [4, 60]]), new Map([[1, 100], [2, 100], [3, 100], [4, 100]]), kont);
    expect(p.qatorlar).toEqual([{ qator_id: 1, hajm: 40 }, { qator_id: 2, hajm: 20 }]);
    expect(p.xatolar.get(3)).toBe('FORMULA_XATO');
    expect(p.xatolar.get(4)).toBe('FORMULA_XATO');
    expect(p.ok).toBe(false);
  });
  it('mavjud tekshiruvlar formulaga ham qo‘llanadi: manfiy jami fakt MANFIY, 0 qo‘shilmaydi; kontekstsiz formula xato', () => {
    const kont = new Map([[1, faktLike()], [2, faktLike()]]);
    const p = jurnalPaket({ 1: { rejim: '=', qiymat: '=FAKT-100' }, 2: { rejim: '+', qiymat: '=0' } }, new Map([[1, 60], [2, 60]]), new Map([[1, 100], [2, 100]]), kont);
    expect(p.xatolar.get(1)).toBe('MANFIY');
    expect(p.xatolar.get(2)).toBe('NOL');
    expect(jurnalPaket({ 1: { rejim: '=', qiymat: '=FAKT' } }, new Map([[1, 60]]), new Map([[1, 100]])).xatolar.get(1)).toBe('FORMULA_XATO');
  });
  it('oddiy son paketi o‘zgarmagan', () => {
    const p = jurnalPaket({ 1: { rejim: '=', qiymat: '70' }, 2: { rejim: '+', qiymat: '2,5' } }, new Map([[1, 60], [2, 60]]));
    expect(p.qatorlar).toEqual([{ qator_id: 1, hajm: 10 }, { qator_id: 2, hajm: 2.5 }]);
  });
});

function faktLike() { return faktFormulaKonteksti(q); }
