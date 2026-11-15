import { describe, expect, it } from 'vitest';
import { narxBirlikKoef } from './narx-birlik';
import { kalkulyatsiyaMatni, narxHisobla, nomdagiZichlik, pulMatni, zichlikTop } from './narx-hisob';

const ok = (r: ReturnType<typeof narxHisobla>) => { if (!r.ok) throw new Error(r.sabab); return r; };

describe('pulMatni', () => {
  it('thousands with spaces, decimals with a comma', () => {
    expect(pulMatni(12500000)).toBe('12 500 000');
    expect(pulMatni(11160.714)).toBe('11 160,71');
    expect(pulMatni(0.5)).toBe('0,5');
  });
});

describe('narxHisobla: exact unit conversion with a visible calculation', () => {
  it('owner example: per kg to per t', () => {
    const r = ok(narxHisobla({ narx: 12500, manbaBirlik: 'кг', smetaBirlik: 'т', nds: 'siz' }));
    expect(r.narx).toBe(12500000);
    expect(r.koef).toBe(1000);
    expect(r.usul).toBe('olcham');
    expect(r.taxmin).toEqual([]);
    expect(r.qadamlar.join(' | ')).toContain("12 500 so'm/кг (QQS siz)");
    expect(r.qadamlar.join(' | ')).toContain("× 1000 = 12 500 000 so'm/т");
  });
  it('price with VAT is divided by 1,12 first', () => {
    const r = ok(narxHisobla({ narx: 1120000, manbaBirlik: 'т', smetaBirlik: 'кг', nds: 'bilan' }));
    expect(r.qqsSiz).toBe(1000000);
    expect(r.narx).toBe(1000);
    expect(r.taxmin).toEqual([]);
  });
  it('unknown VAT state is treated as with VAT and flagged', () => {
    const r = ok(narxHisobla({ narx: 112000, manbaBirlik: 'м2', smetaBirlik: 'м2', nds: 'nomalum' }));
    expect(r.narx).toBe(100000);
    expect(r.taxmin.join(' ')).toContain('QQS holati noma');
  });
  it('same unit: no conversion', () => {
    const r = ok(narxHisobla({ narx: 500, manbaBirlik: 'шт', smetaBirlik: 'шт.', nds: 'siz' }));
    expect(r.usul).toBe('bir');
    expect(r.narx).toBe(500);
  });
  it('1000 pieces and 100 m2 on the estimate side are exact multiples', () => {
    expect(ok(narxHisobla({ narx: 800, manbaBirlik: 'шт', smetaBirlik: '1000 шт', nds: 'siz' })).narx).toBe(800000);
    expect(ok(narxHisobla({ narx: 15000, manbaBirlik: 'м2', smetaBirlik: '100 м2', nds: 'siz' })).narx).toBe(1500000);
  });
});

describe('narxHisobla: a count in the SOURCE unit (price per 100 m2)', () => {
  it('converts and flags the assumption', () => {
    const r = ok(narxHisobla({ narx: 1200000, manbaBirlik: '100 м2', smetaBirlik: 'м2', nds: 'siz' }));
    expect(r.narx).toBe(12000);
    expect(r.usul).toBe('miqyos');
    expect(r.taxmin).toHaveLength(1);
    expect(kalkulyatsiyaMatni(r)).toContain('⚠');
  });
  it('1000 pcs to pcs and 100 m to m', () => {
    expect(ok(narxHisobla({ narx: 5000000, manbaBirlik: '1000 шт', smetaBirlik: 'шт', nds: 'siz' })).narx).toBe(5000);
    expect(ok(narxHisobla({ narx: 900000, manbaBirlik: '100 м', smetaBirlik: 'м', nds: 'siz' })).narx).toBe(9000);
  });
});

describe('narxHisobla: package with its stated content', () => {
  it('a bag of 50 kg', () => {
    const r = ok(narxHisobla({ narx: 45000, manbaBirlik: 'мешок', smetaBirlik: 'т', nds: 'siz', qadoq: { miqdor: 50, birlik: 'кг' } }));
    expect(r.narx).toBe(900000);
    expect(r.usul).toBe('qadoq');
  });
  it('a package without content is refused', () => {
    const r = narxHisobla({ narx: 45000, manbaBirlik: 'мешок', smetaBirlik: 'т', nds: 'siz' });
    expect(r.ok).toBe(false);
  });
});

describe('narxHisobla: mass <-> volume only with a density', () => {
  it('density written in the name is evidence (no assumption flag)', () => {
    expect(nomdagiZichlik('Щебень фр. 5-20, насыпная плотность 1,5 т/м3')).toMatchObject({ tm3: 1.5, taxmin: false });
    expect(nomdagiZichlik('Песок, плотность 1600 кг/м3')?.tm3).toBeCloseTo(1.6);
    const r = ok(narxHisobla({ narx: 100000, manbaBirlik: 'т', smetaBirlik: 'м3', nds: 'siz', nom: 'Щебень, насыпная плотность 1,5 т/м3' }));
    expect(r.narx).toBe(150000);
    expect(r.taxmin).toEqual([]);
    expect(r.qadamlar.join(' | ')).toContain('1,5 t/m3');
  });
  it('reference density is an assumption and is flagged', () => {
    expect(zichlikTop('Песок природный для строительных работ')).toMatchObject({ tm3: 1.6, taxmin: true });
    const r = ok(narxHisobla({ narx: 150000, manbaBirlik: 'т', smetaBirlik: 'м3', nds: 'siz', nom: 'Песок природный' }));
    expect(r.narx).toBe(240000);
    expect(r.usul).toBe('zichlik');
    expect(r.taxmin.join(' ')).toContain('zichlik taxmin qilindi');
  });
  it('m3 -> t divides by the density; kg-priced source works too', () => {
    expect(ok(narxHisobla({ narx: 240000, manbaBirlik: 'м3', smetaBirlik: 'т', nds: 'siz', nom: 'Песок' })).narx).toBe(150000);
    expect(ok(narxHisobla({ narx: 100, manbaBirlik: 'кг', smetaBirlik: 'м3', nds: 'siz', nom: 'Песок' })).narx).toBe(160000);
  });
  it('unknown density: refused, never guessed', () => {
    const r = narxHisobla({ narx: 100000, manbaBirlik: 'т', smetaBirlik: 'м3', nds: 'siz', nom: 'Кирпич керамический' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.sabab).toContain('zichlik');
  });
});

describe('unit-pair table (synthetic, the owner\'s examples): before vs after', () => {
  // [source unit, smeta unit, material name, qadoq, should convert]
  const JADVAL: Array<[string, string, string, { miqdor: number; birlik: string } | null, boolean]> = [
    ['кг', 'т', 'Арматура А500С', null, true], ['т', 'кг', 'Арматура А500С', null, true],
    ['100 м2', 'м2', 'Линолеум', null, true], ['м2', '100 м2', 'Линолеум', null, true],
    ['1000 шт', 'шт', 'Кирпич М100', null, true], ['шт', '1000 шт', 'Кирпич М100', null, true],
    ['100 м', 'м', 'Кабель ВВГ', null, true], ['10 м', 'м', 'Провод', null, true],
    ['л', 'м3', 'Вода техническая', null, true], ['100 кг', 'т', 'Гвозди', null, true],
    ['т', 'м3', 'Песок природный', null, true], ['м3', 'т', 'Щебень', null, true], ['кг', 'м3', 'Песок природный', null, true],
    ['т', 'м3', 'Цемент М400', null, true], ['м3', 'т', 'Бетон тяжелый', null, true],
    ['мешок', 'т', 'Цемент М400', { miqdor: 50, birlik: 'кг' }, true], ['лист', 'м2', 'Гипсокартон', { miqdor: 3, birlik: 'м2' }, true],
    ['т', 'м3', 'Кирпич керамический', null, false], ['мешок', 'т', 'Цемент М400', null, false], ['шт', 'кг', 'Светильник', null, false],
    ['маш.-ч', 'час', 'Кран', null, false], ['м2', 'м', 'Профнастил', null, false], ['км', 'т', 'Труба', null, false],
  ];
  it('the new calculation converts every convertible pair and refuses every non-convertible one', () => {
    let eski = 0, yangi = 0, togri = 0;
    for (const [m, s, nom, q, kutilgan] of JADVAL) {
      if (narxBirlikKoef(m, s, q).koef != null) eski++;
      const r = narxHisobla({ narx: 1000, manbaBirlik: m, smetaBirlik: s, nds: 'siz', nom, qadoq: q });
      if (r.ok) yangi++;
      if (r.ok === kutilgan) togri++;
    }
    const jami = JADVAL.filter(x => x[4]).length;
    expect({ jami, eski, yangi, togri, n: JADVAL.length }).toEqual({ jami: 17, eski: 7, yangi: 17, togri: JADVAL.length, n: JADVAL.length });
  });
});

describe('narxHisobla: refusals', () => {
  it('pieces to kg, hours to anything', () => {
    expect(narxHisobla({ narx: 1000, manbaBirlik: 'шт', smetaBirlik: 'кг', nds: 'siz' }).ok).toBe(false);
    expect(narxHisobla({ narx: 1000, manbaBirlik: 'маш.-ч', smetaBirlik: 'час', nds: 'siz' }).ok).toBe(false);
    expect(narxHisobla({ narx: -1, manbaBirlik: 'т', smetaBirlik: 'т', nds: 'siz' }).ok).toBe(false);
  });
});
