import { describe, expect, it } from 'vitest';
import { bolimJamilari, davrNomi, f2Tekshiruv, hajmXaritasi, katGuruh, katTaqsimot, oldingiTasdiqlanganAktlar, qatorBajarilish, type F2KorQator } from './f2-hujjat-korinish';

const q = (p: Partial<F2KorQator>): F2KorQator => ({ akt_id: 1, qator_id: 10, oy: '2026-10-01', akt_holat: 'qoralama', hajm: 1, narx: 1, summa: 1, kat: 'МАТ', ...p });

describe('f2 hujjat ko‘rinishi', () => {
  it('oldin tasdiqlangan aktlar: faqat tasdiqlangan va davri oldin', () => {
    const s = oldingiTasdiqlanganAktlar([
      { id: 1, oy: '2026-08-01', holat: 'tasdiqlangan' },
      { id: 2, oy: '2026-09-01', holat: 'qoralama' },
      { id: 3, oy: '2026-10-01', holat: 'tasdiqlangan' },
      { id: 4, oy: '2026-10-01', holat: 'qoralama' },
      { id: 5, oy: '2026-11-01', holat: 'tasdiqlangan' },
    ], { id: 4, oy: '2026-10-01', holat: 'qoralama' });
    expect([...s].sort()).toEqual([1, 3]);
  });

  it('hajm xaritasi: gorunish_hajm ustuvor, akt filtri', () => {
    const m = hajmXaritasi([q({ akt_id: 1, hajm: 5, gorunish_hajm: 6 }), q({ akt_id: 1, qator_id: 10, hajm: 2 }), q({ akt_id: 2, hajm: 100 })], new Set([1]));
    expect(m.get(10)).toBe(8);
  });

  it('bajarilish: oshganda ulush 100% da to‘xtaydi, NULL smeta — foiz noma’lum', () => {
    const b = qatorBajarilish(100, 60, 53);
    expect(b.oshdi).toBe(true);
    expect(b.oldinUlush + b.shuUlush).toBeCloseTo(1);
    expect(b.qoldiq).toBe(-13);
    const n = qatorBajarilish(null, 1, 2);
    expect(n.foiz).toBeNull();
    expect(n.qoldiq).toBeNull();
  });

  it('kategoriya guruhi va taqsimoti', () => {
    expect(katGuruh('кab'.toUpperCase())).toBe('nomalum');
    expect(katGuruh('КАБ')).toBe('mat');
    const t = katTaqsimot([q({ kat: 'ЧЕЛ', summa: 30 }), q({ kat: 'МАТ', summa: 70 }), q({ kat: null, summa: null })]);
    expect(t.jami).toBe(100);
    expect(t.summasiz).toBe(1);
    expect(t.qismlar.map((x) => x.guruh)).toEqual(['chel', 'mat']);
  });

  it('davr nomi o‘zbekcha brauzerga bog‘liq emas', () => {
    expect(davrNomi('2026-10-01', 'uz-UZ')).toBe('oktabr 2026');
    expect(davrNomi('2026-01-01', 'uz-Cyrl-UZ')).toBe('январ 2026');
    expect(davrNomi(null, 'uz')).toBe('');
  });

  it('bo‘lim jamilari va tekshiruv', () => {
    const b = bolimJamilari([{ qator_id: 1, daraja: 0, kod: null, nom: 'A', summa: 75 }, { qator_id: 2, daraja: 1, kod: null, nom: 'x', summa: 75 }, { qator_id: 3, daraja: 0, kod: null, nom: 'B', summa: 25 }]);
    expect(b.map((x) => x.ulush)).toEqual([0.75, 0.25]);
    const r = f2Tekshiruv({
      lines: [q({ qator_id: 10, hajm: 2, narx: 3, summa: 7 }), q({ qator_id: 11, narx: null, summa: null }), q({ qator_id: 99 })],
      smetaHajm: new Map([[10, 1], [11, 5]]), oldin: new Map(),
      belgilar: new Map([[10, { zamena: true }]]),
    });
    expect(r).toMatchObject({ arifmetik: 1, narxsiz: 1, topilmagan: 1, oshgan: 1, zamena: 1 });
  });
});
