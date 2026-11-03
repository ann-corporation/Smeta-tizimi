import { describe, expect, it } from 'vitest';
import { annuitetTolov, birliklarYasa, ipoteka, narxHisob, oyQosh, telefonNorm, tolovGrafigi } from './hisob';

const jami = (q: { summa: number }[]) => Math.round(q.reduce((s, x) => s + x.summa, 0) * 100) / 100;

describe('oyQosh', () => {
  it('oy oxirini saqlaydi', () => {
    expect(oyQosh('2026-01-31', 1)).toBe('2026-02-28');
    expect(oyQosh('2028-01-31', 1)).toBe('2028-02-29');
    expect(oyQosh('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('tolovGrafigi', () => {
  it('teng bo‘lish: Σ aniq, oxirgi qator qoldiqni oladi', () => {
    const g = tolovGrafigi({ summa: 1_000_000_000, boshlangich: 300_000_000, boshlangichSana: '2026-11-03', oylar: 7, yaxlitlash: 1000 });
    expect(g).toHaveLength(8);
    expect(g[0]).toEqual({ sana: '2026-11-03', summa: 300_000_000, tur: 'boshlangich' });
    expect(g[1].sana).toBe('2026-12-03');
    expect(g[1].summa % 1000).toBe(0);
    expect(jami(g)).toBe(1_000_000_000);
  });
  it('oylar=0 → bitta to‘liq to‘lov', () => {
    expect(tolovGrafigi({ summa: 500, boshlangich: 0, boshlangichSana: '2026-11-03', oylar: 0 })).toEqual([{ sana: '2026-11-03', summa: 500, tur: 'boshlangich' }]);
  });
  it('boshlang‘ich 0 → faqat oylik', () => {
    const g = tolovGrafigi({ summa: 100, boshlangich: 0, boshlangichSana: '2026-11-03', oylar: 3 });
    expect(g.map((x) => x.tur)).toEqual(['oylik', 'oylik', 'oylik']);
    expect(jami(g)).toBe(100);
  });
  it('annuitet: Σ = oylik × n', () => {
    const g = tolovGrafigi({ summa: 1200, boshlangich: 0, boshlangichSana: '2026-01-01', oylar: 12, usul: 'annuitet', yillikFoiz: 12 });
    expect(jami(g)).toBeCloseTo(annuitetTolov(1200, 12, 12) * 12, 1);
  });
  it('noto‘g‘ri summa → bo‘sh', () => { expect(tolovGrafigi({ summa: 0, boshlangich: 0, boshlangichSana: '2026-01-01', oylar: 3 })).toEqual([]); });
});

describe('ipoteka', () => {
  it('annuitet formulasi va subsidiya', () => {
    const r = ipoteka({ narx: 1_000_000_000, boshlangich: 250_000_000, yillikFoiz: 18, yillar: 20 });
    expect(r.kredit).toBe(750_000_000);
    expect(r.oylik).toBeCloseTo(11_574_000, -4);
    expect(r.boshlangichFoiz).toBe(25);
    const s = ipoteka({ narx: 1_000_000_000, boshlangich: 250_000_000, yillikFoiz: 18, yillar: 20, subsidiya: 50_000_000 });
    expect(s.kredit).toBe(700_000_000);
  });
  it('0% foiz', () => { expect(ipoteka({ narx: 120, boshlangich: 0, yillikFoiz: 0, yillar: 1 }).oylik).toBe(10); });
});

describe('narxHisob', () => {
  it('chegirma', () => {
    expect(narxHisob(60, 10_000_000, 5)).toEqual({ asosiy: 600_000_000, chegirma: 30_000_000, yakuniy: 570_000_000, m2Yakuniy: 9_500_000 });
  });
});

describe('birliklarYasa', () => {
  it('podyezd × qavat × namuna, qavat ustamasi, tijorat qavat', () => {
    const r = birliklarYasa({ podyezdlar: 2, qavatlar: 3, namunalar: [{ xona_soni: 2, maydon: 60, narx_m2: 10_000_000 }, { xona_soni: 3, maydon: 80, narx_m2: 10_000_000 }],
      qavatQoshimcha: 1, qoshimchaDan: 2, tijoratQavat: 1, raqamlash: 'kod' });
    expect(r).toHaveLength(12);
    expect(r[0]).toMatchObject({ raqam: '1-01-1', tur: 'tijorat', narx_m2: 10_000_000 });
    expect(r.find((x) => x.raqam === '2-03-2')).toMatchObject({ podyezd: 2, qavat: 3, narx_m2: 10_100_000, tur: 'xonadon' });
    expect(new Set(r.map((x) => x.raqam)).size).toBe(12);
  });
  it('ketma raqamlash', () => {
    expect(birliklarYasa({ podyezdlar: 1, qavatlar: 2, namunalar: [{ xona_soni: 1, maydon: 40 }] }).map((x) => x.raqam)).toEqual(['1', '2']);
  });
});

describe('telefonNorm', () => {
  it('9 raqam → 998', () => { expect(telefonNorm('90 123-45-67')).toBe('998901234567'); expect(telefonNorm('+998 90 123 45 67')).toBe('998901234567'); });
});
