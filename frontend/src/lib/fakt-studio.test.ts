import { describe, expect, it } from 'vitest';
import { bajarilmadiHajmlar, bajarilmadiTaklif, faktYigindiHisobla } from './fakt-studio';

const r = (id: number, tur: string, ota_id: number | null, extra: Record<string, unknown> = {}) =>
  ({ id, tur, ota_id, kat: 'mat', qoshimcha: false, zamena: false, ...extra }) as never;
const h = (qator_id: number, fakt_summa: number | null, smeta_narx: number | null = null) =>
  ({ qator_id, smeta_hajm: null, fakt_hajm: null, fakt_summa, smeta_narx });

describe('faktYigindiHisobla', () => {
  const rows = [r(1, 'bl', null), r(2, 'mat', 1), r(3, 'bl', null, { qoshimcha: true }), r(4, 'mat', 3), r(5, 'bl', null, { zamena: true }), r(6, 'rs', 5, { kat: 'chel' })];
  it('faktni yig\'adi, yangi ishlarni alohida sanaydi', () => {
    const y = faktYigindiHisobla(rows, [h(2, 100), h(4, 40), h(6, 10)]);
    expect(y.faktUstamasiz).toBe(150);
    expect(y.yangiSoni).toBe(2);
    expect(y.yangiUstamasiz).toBe(50);
  });
  it('narxsiz (null) qator 0 emas - summasizSoni da', () => {
    const y = faktYigindiHisobla(rows, [h(2, null), h(4, 40)]);
    expect(y.faktUstamasiz).toBe(40);
    expect(y.faktKesim.summasizSoni).toBeGreaterThan(0);
  });
  it('bajarilmadi: narxi borlar yig\'iladi, narxsizlar alohida', () => {
    const y = faktYigindiHisobla(rows, [h(2, 0, 10), h(4, 0, null)], [
      { qator_id: 2, bajarilmagan_hajm: 3, holat: 'faol' }, { qator_id: 4, bajarilmagan_hajm: 2, holat: 'faol' }, { qator_id: 2, bajarilmagan_hajm: 9, holat: 'bekor' },
    ]);
    expect(y.bajarilmadiSoni).toBe(2);
    expect(y.bajarilmadiUstamasiz).toBe(30);
    expect(y.bajarilmadiNarxsiz).toBe(1);
  });
});

describe('bajarilmadi yordamchilari', () => {
  it('faol hajmlarni qator bo\'yicha qo\'shadi', () => {
    const m = bajarilmadiHajmlar([{ qator_id: 1, bajarilmagan_hajm: 2, holat: 'faol' }, { qator_id: 1, bajarilmagan_hajm: 3, holat: 'faol' }, { qator_id: 1, bajarilmagan_hajm: 7, holat: 'bekor' }]);
    expect(m.get(1)).toBe(5);
  });
  it('taklif: qoldiq, manfiy emas, smeta noma\'lum -> null', () => {
    expect(bajarilmadiTaklif(10, 4, 1)).toBe(5);
    expect(bajarilmadiTaklif(10, 12, 0)).toBe(0);
    expect(bajarilmadiTaklif(null, 1, 0)).toBeNull();
  });
});
