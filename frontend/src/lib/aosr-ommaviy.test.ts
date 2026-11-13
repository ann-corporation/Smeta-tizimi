import { describe, expect, it } from 'vitest';
import { ISHONCH_SUKUT, boglanmaganAktlar, ishonchDarajasi, matndanHajm, ommaviyReja, type Taklif } from './aosr-taklif';

const tk = (qatorId: number, ball: number): Taklif => ({ qatorId, ball, nom: 'N', razdelId: null, razdelNom: '', faktBor: true, sabab: [] });
const akt = (ish_nomi: string, ish_tavsifi: string | null = null) => ({ ish_nomi, ish_tavsifi, bajarilgan: null });

describe('ommaviy bog‘lash rejasi', () => {
  it('ishonch darajasi va bog‘lanmagan aktlar', () => {
    expect(ISHONCH_SUKUT).toBe(0.7);
    expect([ishonchDarajasi(0.8), ishonchDarajasi(0.55), ishonchDarajasi(0.3)]).toEqual(['yuqori', 'orta', 'past']);
    expect(boglanmaganAktlar([{ id: 1, holat: 'yangi', boglangan_ish_soni: 0 }, { id: 2, holat: 'bekor', boglangan_ish_soni: 0 }, { id: 3, holat: 'qogoz', boglangan_ish_soni: 2 }, { id: 4, holat: 'qogoz', boglangan_ish_soni: 0 }])).toEqual([1, 4]);
  });
  it('matndan hajm: faqat birlik qator birligiga teng bo‘lsa (mm — qalinlik, hajm emas)', () => {
    expect(matndanHajm(akt('Засыпка 12,5 м3 грунта'), 'м3')).toBe(12.5);
    expect(matndanHajm(akt('Щебень слоем 100 мм', 'уложено 40 м2'), 'м2')).toBe(40);
    expect(matndanHajm(akt('Щебень слоем 100 мм'), 'м3')).toBeNull();
    expect(matndanHajm(akt('Бетон 5 м3'), null)).toBeNull();
  });
  it('reja: chegaradan past — qo‘lda; hajm matndan, bo‘lmasa fakt qoldig‘i (bir qatorga ko‘p akt — teng bo‘linadi); fakt noma‘lum — null', () => {
    const aktlar = new Map([[1, akt('A 4 м3')], [2, akt('B')], [3, akt('C')], [4, akt('D')], [5, akt('E')]]);
    const takliflar = new Map<number, Taklif[]>([[1, [tk(10, 0.9)]], [2, [tk(10, 0.8)]], [3, [tk(10, 0.75)]], [4, [tk(20, 0.4)]], [5, [tk(30, 0.9)]]]);
    const qatorlar = new Map([[10, { fakt: 10, birlik: 'м3' }], [20, { fakt: 5, birlik: 'м3' }], [30, { fakt: null, birlik: 'м3' }]]);
    const r = ommaviyReja(aktlar, takliflar, qatorlar, { chegara: 0.7 });
    expect(r.qolda).toEqual([4]);
    const j = new Map(r.juftlar.map((x) => [x.aktId, x]));
    expect([j.get(1)?.hajm, j.get(1)?.hajmManba]).toEqual([4, 'matn']);
    expect([j.get(2)?.hajm, j.get(3)?.hajm, j.get(2)?.hajmManba]).toEqual([3, 3, 'fakt']);
    expect([j.get(5)?.hajm, j.get(5)?.hajmManba]).toEqual([null, 'yoq']);
    // foydalanuvchi tanlovi chegaradan qat'i nazar qabul qilinadi
    expect(ommaviyReja(aktlar, takliflar, qatorlar, { chegara: 0.7, tanlov: new Map([[4, 20]]) }).qolda).toEqual([]);
  });
});
