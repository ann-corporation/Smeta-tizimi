import { describe, expect, it } from 'vitest';
import { ballashtir, engArzonBolinma, engArzonEmas, meyorXato, tartibla, taqqoslashJadvali, type TQator, type TTaklif } from './taqqoslash';

const qatorlar: TQator[] = [
  { id: 1, qatorNo: 1, lotNo: 1, nom: 'Sement M400', birlik: 'tonna', miqdor: 10 },
  { id: 2, qatorNo: 2, lotNo: 1, nom: 'Armatura d12', birlik: 'tonna', miqdor: 2 },
];
const mk = (id: number, nom: string, p: Partial<TTaklif> & { q: [number, number][] }): TTaklif => ({
  id, yetkazuvchiId: id * 10, nom, qqsFoiz: 12, yetkazishNarx: null, amalKun: 30, kafolatOy: null, reyting: null,
  qatorlar: p.q.map(([rfqQatorId, narx]) => ({ rfqQatorId, narx, muddatKun: null, mavjudMiqdor: null })), ...p,
});
const A = mk(1, 'A', { q: [[1, 1000000], [2, 8000000]], kafolatOy: 12, reyting: 5 });
const B = mk(2, 'B', { q: [[1, 950000], [2, 8500000]], kafolatOy: 6, reyting: 3 });
const C = mk(3, 'C', { q: [[1, 900000]], qqsFoiz: 0 });   // faqat 1-qator, QQS to'lovchi emas

describe('taqqoslash jadvali', () => {
  const j = taqqoslashJadvali(qatorlar, [A, B, C]);
  it('har qatorda eng arzon QQS bilan narx bo\'yicha belgilanadi (C 0% — 900 000 < 950 000*1.12)', () => {
    expect(j.satrlar[0].engTaklifIdlar).toEqual([3]);
    expect(j.satrlar[1].engTaklifIdlar).toEqual([1]);
  });
  it('QQS stavkalari farq qilsa QQS bilan solishtiriladi (NDS siz narx aldamaydi)', () => {
    const D = mk(4, 'D', { q: [[1, 940000]], qqsFoiz: 12 });   // 940 000 < 950 000 lekin 1 052 800 > E ning 1 000 000 (0%)
    const E = mk(5, 'E', { q: [[1, 1000000]], qqsFoiz: 0 });
    const x = taqqoslashJadvali([qatorlar[0]], [D, E]);
    expect(x.satrlar[0].engTaklifIdlar).toEqual([5]);
  });
  it('jami: NDS siz va QQS bilan, to\'liqlik', () => {
    const a = j.jami.find((x) => x.taklifId === 1)!;
    expect(a.jamiNdsSiz).toBe(26000000);       // 10*1 000 000 + 2*8 000 000
    expect(a.jamiQqsBilan).toBe(29120000);
    expect(a.qqsSumma).toBe(3120000);
    expect(a.toliq).toBe(true);
    const c = j.jami.find((x) => x.taklifId === 3)!;
    expect(c.toliq).toBe(false);                // 2-qatorga narx bermagan: jami to'liq emas, 0 qo'shilmaydi
    expect(c.yopilgan).toBe(1);
    expect(c.jamiQqsBilan).toBe(9000000);
  });
  it('to\'liq bo\'lmagan taklif umumiy eng arzon bo\'la olmaydi', () => {
    // A: 29 120 000; B: (9 500 000 + 17 000 000)*1.12 = 29 680 000
    expect(j.engArzonToliqId).toBe(1);
  });
  it('bo\'linma g\'olib: C 1-qator, A 2-qator', () => {
    expect(engArzonBolinma(j)).toEqual([{ taklifId: 1, qatorIdlar: [2] }, { taklifId: 3, qatorIdlar: [1] }]);
  });
  it('eng arzon bo\'lmaganni tanlasa — asos kerak qatorlar ro\'yxati', () => {
    expect(engArzonEmas(j, [{ taklifId: 2, qatorIdlar: [1, 2] }])).toEqual([1, 2]);
    expect(engArzonEmas(j, [{ taklifId: 3, qatorIdlar: [1] }, { taklifId: 1, qatorIdlar: [2] }])).toEqual([]);
  });
  it('mavjud miqdor talabdan kam — qisman, to\'liq emas', () => {
    const P: TTaklif = { ...A, id: 9, qatorlar: [{ rfqQatorId: 1, narx: 1000, muddatKun: 5, mavjudMiqdor: 4 }, { rfqQatorId: 2, narx: 1000, muddatKun: 5, mavjudMiqdor: null }] };
    const x = taqqoslashJadvali(qatorlar, [P]);
    expect(x.satrlar[0].kataklar[0].qisman).toBe(true);
    expect(x.jami[0].toliq).toBe(false);
    expect(x.jami[0].jamiNdsSiz).toBe(6000);    // 4*1000 + 2*1000
  });
  it('yetkazish haqi jamiga qo\'shiladi; QQS stavkasi noma\'lum bo\'lsa QQS bilan null', () => {
    const Y = { ...A, id: 7, yetkazishNarx: 500000 };
    expect(taqqoslashJadvali(qatorlar, [Y]).jami[0].jamiNdsSiz).toBe(26500000);
    const N = { ...A, id: 8, qqsFoiz: null };
    const x = taqqoslashJadvali(qatorlar, [N]);
    expect(x.jami[0].jamiQqsBilan).toBeNull();
    expect(x.jami[0].qqsNomalum).toBe(true);
  });
});

describe('ball bilan baholash', () => {
  const T1 = { ...A, qatorlar: A.qatorlar.map((q) => ({ ...q, muddatKun: 10 })) };
  const T2 = { ...B, qatorlar: B.qatorlar.map((q) => ({ ...q, muddatKun: 20 })) };
  const jad = taqqoslashJadvali(qatorlar, [T1, T2]);
  const meyor = { narx: 50, muddat: 20, kafolat: 15, reyting: 15 };
  it('avtomatik mezonlar va jami', () => {
    const b = ballashtir(jad, [T1, T2], meyor);
    const x = b.find((n) => n.taklifId === 1)!, y = b.find((n) => n.taklifId === 2)!;
    expect(x.ballar.narx).toBe(100);                       // eng arzon
    expect(y.ballar.narx).toBeCloseTo(98.11, 1);           // 29 120 000 / 29 680 000
    expect(x.ballar.muddat).toBe(100);
    expect(y.ballar.muddat).toBe(50);
    expect(x.ballar.kafolat).toBe(100);
    expect(y.ballar.kafolat).toBe(50);
    expect(x.ballar.reyting).toBe(100);                    // 5/5
    expect(y.ballar.reyting).toBe(50);                     // 3/5 -> 50
    expect(x.jami).toBe(100);
    expect(y.jami).toBeCloseTo((50 * 98.11 + 20 * 50 + 15 * 50 + 15 * 50) / 100, 0);
    expect(x.toliq && y.toliq).toBe(true);
  });
  it('qo\'lda mezon (to\'lov) bo\'lmasa jami null — 0 emas', () => {
    const b = ballashtir(jad, [T1, T2], { narx: 60, tolov: 40 });
    expect(b.every((n) => n.jami === null && n.toliq === false)).toBe(true);
    const q = ballashtir(jad, [T1, T2], { narx: 60, tolov: 40 }, { 1: { tolov: 80 }, 2: { tolov: 100 } });
    expect(q.find((n) => n.taklifId === 1)!.jami).toBe(92);                 // (60*100 + 40*80)/100
    expect(q.find((n) => n.taklifId === 2)!.jami).toBeCloseTo(98.87, 1);
  });
  it('kafolat ko\'rsatilmagan — 0 ball va «yetishmaydi» belgisi; reytingsiz — neytral 50', () => {
    const Z = { ...T2, id: 3, kafolatOy: null, reyting: null };
    const jz = taqqoslashJadvali(qatorlar, [T1, Z]);
    const b = ballashtir(jz, [T1, Z], meyor).find((n) => n.taklifId === 3)!;
    expect(b.ballar.kafolat).toBe(0);
    expect(b.ballar.reyting).toBe(50);
    expect(b.yetishmaydi).toEqual(expect.arrayContaining(['kafolat', 'reyting']));
  });
  it('to\'liq bo\'lmagan taklif narx balli olmaydi', () => {
    const jc = taqqoslashJadvali(qatorlar, [T1, C]);
    const b = ballashtir(jc, [T1, C], { narx: 100 }).find((n) => n.taklifId === 3)!;
    expect(b.ballar.narx).toBeNull();
    expect(b.jami).toBeNull();
  });
  it('tartib: ball usulida jami kamayish, null oxirida; narx usulida to\'liq va arzon birinchi', () => {
    const b = ballashtir(jad, [T1, T2], meyor);
    expect(tartibla('ball', jad, b)).toEqual([1, 2]);
    const j3 = taqqoslashJadvali(qatorlar, [T1, T2, C]);
    expect(tartibla('narx', j3, [])).toEqual([1, 2, 3]);   // C to'liq emas — oxirida
  });
  it('meyor tekshiruvi bazadagi bilan bir xil', () => {
    expect(meyorXato('narx', {})).toBeNull();
    expect(meyorXato('ball', { narx: 60, muddat: 40 })).toBeNull();
    expect(meyorXato('ball', { narx: 60, muddat: 30 })).toBe('MEYOR_YIGINDI');
    expect(meyorXato('ball', { muddat: 100 })).toBe('MEYOR_YIGINDI');   // narx mezoni majburiy
    expect(meyorXato('narx', { narx: 101 })).toBe('MEYOR_NOTOGRI');
  });
});
