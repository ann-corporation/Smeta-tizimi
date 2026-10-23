import { describe, expect, it } from 'vitest';
import { normBir } from '../f2-match-engine';
import { tkmBirlikmi, tkmMasofa, tkmMaterialKalit, tkmTaklif } from './tkm';

describe('ТН·КМ yordamchisi', () => {
  it('birlik normalizatori: ТН·КМ / Т·КМ / ТКМ / т.км / ТН.КМ — bitta kalit', () => {
    for (const b of ['ТН·КМ', 'Т·КМ', 'ТКМ', 'т.км', 'ТН.КМ', 'тн-км', 'TKM', ' Т КМ ']) expect(normBir(b)).toBe('ТКМ');
    expect(normBir('1000 ТН·КМ')).toBe('1000ТКМ');
    expect(tkmBirlikmi('ТН·КМ')).toBe(true);
    expect(tkmBirlikmi('1000 т.км')).toBe(true);
    expect(tkmBirlikmi('Т')).toBe(false);
    expect(tkmBirlikmi('М3')).toBe(false);
  });

  it('masofa va material kaliti nomdan', () => {
    expect(tkmMasofa('Перевозка: грунт, 120 тн × 15 км')).toBe(15);
    expect(tkmMasofa('ПЕРЕВОЗКА ГРУНТА АВТОМОБИЛЕМ, РАССТОЯНИЕ ПЕРЕВОЗКИ 15,5 КМ, КЛАСС ГРУЗА 1')).toBe(15.5);
    expect(tkmMasofa('Перевозка: песок')).toBeNull();
    expect(tkmMaterialKalit('Перевозка: песок, 80 тн × 12 км')).toBe('ПЕСОК');
    expect(tkmMaterialKalit('ПЕРЕВОЗКА ГРУНТА АВТОМОБИЛЕМ, РАССТОЯНИЕ ПЕРЕВОЗКИ 15 КМ')).toBe('ГРУНТ');
    expect(tkmMaterialKalit('Устройство основания')).toBeNull();
  });

  it('A: tonnali mos material qatorlari Σ tonna × km; B: F2/smeta ulushi × smeta т·км; ikkalasi izoh bilan', () => {
    const f2 = [
      { nom: 'Песок природный для строительных работ', birlik: 'Т', hajm: 30 },
      { nom: 'ПЕСОК МЕЛКИЙ', birlik: 'ТН', hajm: 20 },
      { nom: 'Песок (м3)', birlik: 'М3', hajm: 40 },
      { nom: 'Щебень фракции 5-20', birlik: 'Т', hajm: 99 },
    ];
    const smeta = { materiallar: [{ nom: 'ПЕСОК природный', birlik: 'м3', hajm: 200 }, { nom: 'Песок', birlik: 'м3', hajm: 100 }], tkmHajm: 9000 };
    const t = tkmTaklif({ nom: 'Перевозка: песок, 80 тн × 12 км' }, f2, smeta)!;
    expect(t).toMatchObject({ kalit: 'ПЕСОК', km: 12 });
    expect(t.a).toMatchObject({ qiymat: 600 }); // (30 + 20) т × 12
    expect(t.a!.izoh).toContain('2 ta tonnali');
    expect(t.b).toMatchObject({ qiymat: 1200 }); // F2 40 м3 ÷ smeta 300 м3 × 9000
    expect(t.b!.izoh).toContain('smeta');
  });

  it('kalit yoki masofa aniqlanmasa — taklif yo‘q; smetasiz faqat A', () => {
    expect(tkmTaklif({ nom: 'Перевозка грузов' }, [{ nom: 'Песок', birlik: 'Т', hajm: 5 }])).toBeNull();
    expect(tkmTaklif({ nom: 'Перевозка: песок, 10 км' }, [{ nom: 'Песок', birlik: 'Т', hajm: 5 }])).toMatchObject({ a: { qiymat: 50 }, b: null });
    expect(tkmTaklif({ nom: 'Перевозка: песок, 10 км' }, [{ nom: 'Цемент', birlik: 'Т', hajm: 5 }])).toBeNull();
  });
});
