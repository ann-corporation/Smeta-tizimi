import { describe, expect, it } from 'vitest';
import type { F2Qator } from './f2-tayyor';
import { ishMeter, keyingiF2Raqam, qoralamaKatTaqsimot, tekshiruvBandlari, tekshiruvSanoq } from './f2-tayyorlash-korinish';

const q = (o: Partial<F2Qator> & { id: number }): F2Qator => ({ ishId: null, tur: 'rs', kat: null, nom: `q${o.id}`, birlik: null, hajm: 1, narx: 1, summa: 1, manba: 'smeta', narxsiz: false, ...o });

describe('ishMeter — smeta = 100%', () => {
  it('tasdiqlangan + boshqa qoralama + shu F2 ulushlari', () => {
    const m = ishMeter({ smeta: 10, olingan: 2, qoralama: 3 }, 4);
    expect(m.tasdiqUlush).toBeCloseTo(0.2);
    expect(m.qoralamaUlush).toBeCloseTo(0.3);
    expect(m.b.shuUlush).toBeCloseTo(0.4);
    expect(m.b.foiz).toBeCloseTo(90);
    expect(m.oshish).toBeNull();
    expect([m.tasdiq, m.qoralama]).toEqual([2, 3]);
  });
  it('smetadan oshsa — foiz so‘zda (butun, kamida 1)', () => {
    expect(ishMeter({ smeta: 10, olingan: 0 }, 12).oshish).toBe(20);
    expect(ishMeter({ smeta: 100, olingan: 100 }, 0.2).oshish).toBe(1);
  });
  it('smeta noma’lum — foiz null (0 emas)', () => {
    const m = ishMeter({ smeta: null, olingan: 1 }, 2);
    expect(m.b.foiz).toBeNull();
    expect(m.oshish).toBeNull();
  });
});

describe('qoralamaKatTaqsimot', () => {
  it('ish qatorlari va xatolar kirmaydi; narxsiz resurs — summasiz', () => {
    const r = qoralamaKatTaqsimot([
      q({ id: 1, tur: 'bl', summa: null, narxsiz: true }),
      q({ id: 2, kat: 'ЧЕЛ', summa: 300 }),
      q({ id: 3, kat: 'МАТ', tur: 'mat', summa: 100 }),
      q({ id: 4, kat: 'МАШ', summa: null, narxsiz: true }),
      q({ id: 5, kat: 'МАШ', summa: null, xato: 'NARX' }),
    ]);
    expect(r.jami).toBe(400);
    expect(r.qismlar.map((x) => [x.guruh, x.ulush])).toEqual([['chel', 0.75], ['mat', 0.25]]);
    expect(r.summasiz).toBe(1);
  });
});

describe('keyingiF2Raqam', () => {
  it('eng katta butun raqam + 1, bekor qilinganlar va matnli raqamlar hisobga olinmaydi', () => {
    expect(keyingiF2Raqam([{ raqam: '7', holat: 'tasdiqlangan' }, { raqam: '12', holat: 'bekor' }, { raqam: '9/1', holat: 'qoralama' }, { raqam: ' 8 ', holat: 'qoralama' }])).toBe('9');
    expect(keyingiF2Raqam([{ raqam: null, holat: 'qoralama' }])).toBeNull();
    expect(keyingiF2Raqam([])).toBeNull();
  });
});

describe('tekshiruvBandlari — hamma masala bir joyda', () => {
  it('xato → ogohlantirish → ma’lumot tartibi, qator idlari va sanoq', () => {
    const b = tekshiruvBandlari({
      qatorlar: [
        q({ id: 1, tur: 'bl', ogoh: 'SMETADAN_OSHDI', summa: null, narxsiz: true }),
        q({ id: 2, xato: 'NARX', summa: null, narx: null }),
        q({ id: 3, xato: 'NARX', summa: null, narx: null }),
        q({ id: 4, narxsiz: true, summa: null, narx: null, manba: 'yoq' }),
        q({ id: 5, nom: 'В т.ч. оплата', narxsiz: true, ogoh: 'AXBOROT_NARXSIZ', summa: null }),
      ],
      dublikatlar: [{ daraja: 'ogoh', kod: 'summa', matn: 'teng summa', aktIdlar: [9] }, { daraja: 'blok', kod: 'raqam', matn: 'raqam band', aktIdlar: [8] }],
      aosrsizSoni: 2,
      uchastkalar: [{ nom: 'A', soni: 1 }, { nom: 'B', soni: 2 }],
      raqam: '',
    });
    expect(b.map((x) => x.kod)).toEqual(['xato_narx', 'dublikat_blok', 'smetadan_oshdi', 'aosr', 'uchastka', 'dublikat_ogoh', 'narxsiz', 'axborot', 'raqamsiz']);
    expect(b[0]).toMatchObject({ daraja: 'bad', soni: 2, ids: [2, 3] });
    expect(b.find((x) => x.kod === 'uchastka')?.nomlar).toEqual(['A (1)', 'B (2)']);
    expect(b.find((x) => x.kod === 'dublikat_blok')?.aktIdlar).toEqual([8]);
    expect(tekshiruvSanoq(b)).toEqual({ bad: 3, warn: 6, info: 3 });
  });
  it('mashinist mehnati ogohlantirishga kirmaydi; tahrirda raqamsiz bandi yo‘q; bo‘sh qoralama', () => {
    const mash = q({ id: 7, nom: 'Затраты труда машинистов', narxsiz: true, ogoh: 'AXBOROT_NARXSIZ', summa: null });
    expect(tekshiruvBandlari({ qatorlar: [mash], raqam: '', raqamQulf: true }).map((x) => x.kod)).toEqual([]);
    expect(tekshiruvBandlari({ qatorlar: [] }).map((x) => x.kod)).toEqual(['bosh']);
    expect(tekshiruvBandlari({ qatorlar: [q({ id: 1 })], raqam: '7', korinmagan: 3 }).map((x) => [x.kod, x.soni])).toEqual([['korinmagan', 3]]);
  });
});
