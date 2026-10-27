import { describe, expect, it } from 'vitest';
import { kaskadCats, yaxlitBilanYakun } from './svod-yaxlit';
import { katKesimServerdan, ustamaliHisobla } from './ustamali-summa';
import { nakrutkaKaskad } from './nakrutka-kaskad';

// Sintetik (mijoz ma'lumoti emas). Orakul: SQL t2_nakrutka_yaxlit_qosh_v1 — itogo4 = kaskad + yaxlit, QQS bir marta.
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const CATS = { chel: 1000, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0 };

describe('svod yaxlit (egasi 2026-10-27: svod summasiga ustama yo‘q)', () => {
  it('yaxlit yo‘q — natija yo‘q (kaskad o‘zgarmaydi)', () => {
    expect(yaxlitBilanYakun(100, null, 12)).toBeNull();
    expect(kaskadCats({ cats: CATS, cats_kaskad: { ...CATS, chel: 1 } })).toBe(CATS);
  });
  it('ИТОГО-4 + yaxlit, QQS faqat oxirida', () => {
    expect(yaxlitBilanYakun(1183.78, 2000, 12)).toEqual({ itogo4: 3183.78, nds: 382.05, vsego: 3565.83 });
  });
  it('ustamaliHisobla: kesim yaxlit bilan — server bilan bir xil, ustamasiz barglarni ham o‘z ichiga oladi', () => {
    const yax = { qqssiz: 2000, barglar: 1000, summasiz: 0, bolimlar: [] };
    const u = ustamaliHisobla(katKesimServerdan(CATS, yax), NK);
    const k = nakrutkaKaskad(CATS, NK) as unknown as { itogo4: number };
    const y = yaxlitBilanYakun(k.itogo4, 2000, 12)!;
    expect(u.ustamali).toBe(y.itogo4);
    expect(u.ndsBilan).toBe(y.vsego);
    expect(u.ustamasiz).toBe(2000);
    // belgisiz — avvalgidek
    const u0 = ustamaliHisobla(katKesimServerdan(CATS), NK);
    expect(u0.ustamali).toBe(k.itogo4);
  });
});
