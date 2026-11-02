import { describe, expect, it } from 'vitest';
import type { JurnalBolim, JurnalIsh } from './fakt-jurnal';
import { f2OlishMumkin, faktMeter, foizMatn, jurnalXulosa, obyektUlushi } from './fakt-korinish';

const bolim = (o: Partial<JurnalBolim> & { id: number }): JurnalBolim => ({ otaId: null, daraja: 0, nom: 'b', versiya: 1, ulush: null, ishSoni: 0, tugaganSoni: 0, ...o });
const ish = (id: number, holat: JurnalIsh['holat']) => ({ id, holat }) as JurnalIsh;

describe('faktMeter', () => {
  it('smeta = 100%: F2 qismi + F2 ga olinmagan fakt + bugungi kiritma', () => {
    const m = faktMeter(100, 55, 40, 70);
    expect(m.foiz).toBeCloseTo(55);
    expect(m.f2Ulush).toBeCloseTo(0.4);
    expect(m.faktUlush).toBeCloseTo(0.15);
    expect(m.yangiUlush).toBeCloseTo(0.15);
    expect(m.yangiFoiz).toBeCloseTo(70);
    expect(m.oshdi).toBe(false);
    expect(m.f2Oldinda).toBe(false);
  });

  it('oshganda chiziq 100% da to‘xtaydi, foiz esa haqiqiy', () => {
    const m = faktMeter(100, 120, 100);
    expect(m.foiz).toBeCloseTo(120);
    expect(m.f2Ulush + m.faktUlush + m.yangiUlush).toBeCloseTo(1);
    expect(m.oshdi).toBe(true);
    expect(faktMeter(100, 90, 0, 130).yangiOshdi).toBe(true);
  });

  it('F2 faktdan oldinda — belgilanadi, F2 segmenti fakt bilan cheklanadi', () => {
    const m = faktMeter(100, 30, 60);
    expect(m.f2Oldinda).toBe(true);
    expect(m.f2Ulush).toBeCloseTo(0.3);
    expect(m.faktUlush).toBe(0);
  });

  it('smeta noma‘lum yoki 0 — foiz null (0 emas)', () => {
    expect(faktMeter(null, 5, 0).foiz).toBeNull();
    expect(faktMeter(0, 5, 0).foiz).toBeNull();
  });

  it('chegirma (manfiy smeta) — smeta ishorasida', () => {
    const m = faktMeter(-10, -5, null);
    expect(m.foiz).toBeCloseTo(50);
    expect(m.faktUlush).toBeCloseTo(0.5);
  });

  it('foizMatn: tugamagan ish 100% ko‘rinmaydi; noma‘lum — «—»', () => {
    expect(foizMatn(99.7)).toBe('99%');
    expect(foizMatn(0.3)).toBe('<1%');
    expect(foizMatn(100)).toBe('100%');
    expect(foizMatn(null)).toBe('—');
  });
});

describe('xulosa va obyekt ulushi', () => {
  const bolimlar = [bolim({ id: 1, ulush: 1, ishSoni: 2 }), bolim({ id: 2, otaId: 1, ulush: 1, ishSoni: 1 }), bolim({ id: 3, ulush: 0.2, ishSoni: 8 })];
  const ishlar = new Map<number, JurnalIsh[]>([[1, [ish(10, 'tugadi')]], [2, [ish(11, 'oshdi')]], [3, [ish(12, 'qisman'), ish(13, 'yangi')]]]);

  it('ishlar holat bo‘yicha va tugagan yuqori bo‘limlar', () => {
    const x = jurnalXulosa(bolimlar, ishlar);
    expect(x.ishJami).toBe(4);
    expect(x.ishlar).toEqual({ yangi: 1, qisman: 1, tugadi: 1, oshdi: 1, smetasiz: 0 });
    expect(x.bolimJami).toBe(2);
    expect(x.bolimTugagan).toBe(1);
  });

  it('summa ma‘lum — smeta summasi bilan tortiladi (oddiy o‘rtacha emas)', () => {
    const u = obyektUlushi(bolimlar, (id) => ({ 1: 100, 3: 900 } as Record<number, number>)[id]);
    expect(u.usul).toBe('summa');
    expect(u.ulush).toBeCloseTo((100 * 1 + 900 * 0.2) / 1000);
  });

  it('summa noma‘lum bo‘lsa — ishlar soni bilan, usul aniq', () => {
    const u = obyektUlushi(bolimlar, (id) => (id === 1 ? 100 : null));
    expect(u.usul).toBe('ish');
    expect(u.ulush).toBeCloseTo((2 * 1 + 8 * 0.2) / 10);
    expect(obyektUlushi([], () => 1)).toEqual({ ulush: null, usul: null });
  });

  it('F2 ga olish mumkin: holat yo‘q — null', () => {
    expect(f2OlishMumkin(undefined)).toBeNull();
    expect(f2OlishMumkin({ f2_mumkin_hajm: 12.5 })).toBe(12.5);
  });
});
