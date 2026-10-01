import { describe, expect, it } from 'vitest';
import type { Liniya, LiniyaShartnoma } from '../api/t2-shartnoma-liniya';
import { liniyaDaraxt, shaklQur, shaklTekshir, shaklYuk, shartnomasizObyektlar, takliflar, tanlashMumkin } from './shartnoma-liniya';

const sh = (o: Partial<LiniyaShartnoma> & { id: number }): LiniyaShartnoma => ({
  loyiha_id: 1, raqam: String(o.id), nom: null, turi: null, asosiy: true, holat: 'faol', summa_bez_nds: null, nds: null, jami_nds_bilan: null,
  izoh: null, versiya: 1, tomonlar: [], obyektlar: [], ...o,
});
const L: Liniya = {
  loyihalar: [{ id: 1, nom: 'Navoiy', holat: 'faol' }, { id: 2, nom: 'Faravon', holat: 'faol' }],
  shartnomalar: [sh({ id: 10, obyektlar: [100] }), sh({ id: 11, asosiy: false, turi: 'Laboratoriya', obyektlar: [100, 101] }), sh({ id: 12, loyiha_id: null })],
  obyektlar: [
    { id: 100, nom: 'A', loyiha_id: 1, asosiy_shartnoma_id: 10 },
    { id: 101, nom: 'B', loyiha_id: 1, asosiy_shartnoma_id: null },
    { id: 102, nom: 'C', loyiha_id: 2, asosiy_shartnoma_id: null },
    { id: 103, nom: 'D', loyiha_id: null, asosiy_shartnoma_id: null },
  ],
  rollar: ['Subpudratchi', 'buyurtmachi'], turlar: [],
};

describe('shartnoma liniyasi', () => {
  it('daraxt: loyiha → asosiy / qo‘shimcha; loyihasiz shartnoma oxirida', () => {
    const d = liniyaDaraxt(L);
    expect(d.map((t) => [t.id, t.asosiy.map((s) => s.id), t.qoshimcha.map((s) => s.id), t.obyektSoni])).toEqual([
      [1, [10], [11], 2], [2, [], [], 1], [null, [12], [], 0],
    ]);
  });

  it('shartnomasiz obyektlar', () => {
    expect(shartnomasizObyektlar(L).map((o) => o.id)).toEqual([101, 102, 103]);
  });

  it('tanlash: asosiy — boshqa asosiydagi obyekt chiqmaydi; loyiha mos bo‘lishi kerak', () => {
    expect(tanlashMumkin(L, { id: null, loyiha_id: 1, asosiy: true }).map((o) => o.id)).toEqual([101, 103]);
    expect(tanlashMumkin(L, { id: 10, loyiha_id: 1, asosiy: true }).map((o) => o.id)).toEqual([100, 101, 103]);
    expect(tanlashMumkin(L, { id: 11, loyiha_id: 1, asosiy: false }).map((o) => o.id)).toEqual([100, 101, 103]);
  });

  it('takliflar: erkin, takrorsiz (registr farqisiz)', () => {
    expect(takliflar(['Buyurtmachi', 'Pudratchi'], L.rollar)).toEqual(['Subpudratchi', 'buyurtmachi', 'Pudratchi']);
  });

  it('shakl: tekshiruv va yuk (bo‘sh tomon tashlanadi, son vergul bilan)', () => {
    const s = { ...shaklQur(null, 1), raqam: ' 12/A ', jami_nds_bilan: '1 200,5', obyektlar: [101, 101, 103] };
    s.tomonlar[0] = { rol: 'Buyurtmachi', nom: 'Hokimlik', inn: ' 123 ' };
    expect(shaklTekshir(s)).toEqual([]);
    const y = shaklYuk(s);
    expect(y.malumot).toMatchObject({ loyiha_id: 1, raqam: '12/A', jami_nds_bilan: 1200.5, asosiy: true });
    expect(y.tomonlar).toEqual([{ rol: 'Buyurtmachi', nom: 'Hokimlik', inn: '123' }]);
    expect(y.obyektlar).toEqual([101, 103]);
    const xato = { ...shaklQur(null), nds: 'abc', tomonlar: [{ rol: '', nom: 'GeoLab', inn: null }] };
    expect(shaklTekshir(xato).map((x) => x.joy)).toEqual(['loyiha', 'raqam', 'nds', 't0']);
  });
});
