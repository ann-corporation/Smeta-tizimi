import { describe, expect, it } from 'vitest';
import type { TenderRoyxatQator } from '../../api/t2-tender';
import type { BuyurtmaRoyxatQator } from '../../api/t2-buyurtma';
import { buyurtmaHisobi, sorovHisobi } from './bugun';

const T = (id: number, o: Partial<TenderRoyxatQator> = {}) => ({ id, effektiv_holat: 'elon', muddat: null, mening_taklifim: null, ...o }) as TenderRoyxatQator;
const B = (id: number, holat: BuyurtmaRoyxatQator['holat']) => ({ id, holat }) as BuyurtmaRoyxatQator;

describe('sorovHisobi', () => {
  it('yangi / kutilmoqda / yutdim / yutqazdim ajratiladi; muddat bo\'yicha tartib', () => {
    const r = sorovHisobi([
      T(1, { muddat: '2026-12-20T00:00:00Z' }), T(2, { muddat: '2026-12-10T00:00:00Z' }), T(3),
      T(4, { mening_taklifim: { id: 1, holat: 'berildi', versiya: 1, raund: 1 } }),
      T(5, { mening_taklifim: { id: 2, holat: 'golib', versiya: 1, raund: 1 } }),
      T(6, { mening_taklifim: { id: 3, holat: 'yutqazdi', versiya: 1, raund: 1 } }),
      T(7, { effektiv_holat: 'takliflar_yopildi' }),
    ]);
    expect(r.yangi.map((x) => x.id)).toEqual([2, 1, 3]);   // muddatsiz oxirida
    expect(r.kutilmoqda.map((x) => x.id)).toEqual([4]);
    expect(r.yutdim.map((x) => x.id)).toEqual([5]);
    expect(r.yutqazdim.map((x) => x.id)).toEqual([6]);
  });
  it('bir so\'rov ikki ro\'yxatda kelsa bir marta sanaladi', () => {
    expect(sorovHisobi([T(1), T(1)]).yangi).toHaveLength(1);
  });
});

describe('buyurtmaHisobi', () => {
  it('har holat to\'g\'ri guruhga tushadi', () => {
    const r = buyurtmaHisobi([B(1, 'yuborildi'), B(2, 'qabul_qilindi'), B(3, 'bajarilmoqda'), B(4, 'tayyor'), B(5, 'topshirildi'),
      B(6, 'qisman'), B(7, 'qabul_qilindi_yakuniy'), B(8, 'nizo'), B(9, 'rad'), B(10, 'bekor')]);
    expect(r.harakatKerak.map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(r.qabulKutilmoqda.map((x) => x.id)).toEqual([5]);
    expect(r.qabulQilingan.map((x) => x.id)).toEqual([6, 7]);
    expect(r.nizo.map((x) => x.id)).toEqual([8]);
    expect(r.yakunlangan).toBe(3);   // yakuniy, rad, bekor (qisman yakunlanmagan)
  });
});
