import { describe, expect, it } from 'vitest';
import { haqiqiyHarakatlar, hisobotYigish, matnMosmi, qoldiqSanada, type HarakatQator } from './hisobot';

// Faqat sintetik ma'lumot.
let id = 0;
const H = (sana: string, operatsiya: 'prixod' | 'rasxod', nomi: string, birligi: string, obyomi: number, o: Partial<HarakatQator> = {}): HarakatQator =>
  ({ id: ++id, sana, operatsiya, nomi, birligi, obyomi, manba: operatsiya === 'prixod' ? 'ombor_prixod_v1' : 'ombor_chiqim_v1', postavshik: null, qabul_qiluvchi: null, narx: null, ...o });

function baza(): HarakatQator[] {
  id = 0;
  return [
    H('2026-10-05', 'prixod', 'Цемент ПЦ-400', 'кг', 1000, { postavshik: 'Альфа-снаб', narx: 1000 }),       // 1
    H('2026-10-20', 'prixod', 'Sement PTs-400', 'kg', 500, { postavshik: 'Alfa-snab', narx: 1200 }),        // 2 (lotin yozilish — bitta material)
    H('2026-10-25', 'rasxod', 'Цемент ПЦ-400', 'кг', 300, { qabul_qiluvchi: 'Brigada Orol', c11_hedef_obyekt_id: 7 }), // 3
    H('2026-11-02', 'prixod', 'Арматура 12', 'тн', 2, { postavshik: 'Бета', narx: 9_000_000 }),             // 4
    H('2026-11-03', 'prixod', 'Труба ПЭ 25', 'м', 100),                                                      // 5 narxsiz
    H('2026-11-04', 'rasxod', 'Арматура 12', 'тн', 1, { qabul_qiluvchi: 'Brigada Tosh', c11_hedef_obyekt_id: 8 }), // 6
  ];
}

describe('hisobotYigish: davr, filtrlar, jami', () => {
  it('davr bo\'yicha jami: lotin/kirill bitta material, birlik bo\'yicha alohida', () => {
    const h = hisobotYigish(baza(), { dan: '2026-10-01', gacha: '2026-10-31' });
    expect(h.qatorlar.map((q) => q.id)).toEqual([3, 2, 1]);
    expect(h.jami.kirim_soni).toBe(2); expect(h.jami.chiqim_soni).toBe(1);
    expect(h.jami.birliklar).toEqual([{ birligi: 'кг', kirim: 1500, chiqim: 300 }]);
  });
  it('summa QQS siz = hajm x narx; QQS bilan = +12 %; narxsiz qator 0 emas — soni alohida', () => {
    const h = hisobotYigish(baza(), { dan: '2026-10-01', gacha: '2026-11-30', operatsiya: 'prixod' });
    // 1000*1000 + 500*1200 + 2*9_000_000 = 1_000_000 + 600_000 + 18_000_000
    expect(h.jami.kirim_summa).toBe(19_600_000);
    expect(h.jami.kirim_summa_qqs).toBe(21_952_000);
    expect(h.jami.narxsiz_soni).toBe(1); // труба (faqat kirim qatorlari sanaladi)
    expect(h.jami.chiqim_summa).toBeNull(); // chiqimda narx saqlanmaydi: noma'lum, 0 emas
    expect(h.qatorlar.find((q) => q.nomi.startsWith('Труба'))).toMatchObject({ narx: null, summa: null, summa_qqs: null });
    expect(h.jami.qqs_foiz).toBe(12);
  });
  it('filtrlar: material (lotin so\'rov kirill nomga), yetkazuvchi, qabul qiluvchi, obyekt, yo\'nalish', () => {
    expect(hisobotYigish(baza(), { qidir: 'sement' }).qatorlar.map((q) => q.id).sort()).toEqual([1, 2, 3]);
    expect(hisobotYigish(baza(), { yetkazuvchi: 'alfa' }).qatorlar.map((q) => q.id).sort()).toEqual([1, 2]);
    expect(hisobotYigish(baza(), { kontragent: 'brigada tosh' }).qatorlar.map((q) => q.id)).toEqual([6]);
    expect(hisobotYigish(baza(), { qabul: 'brigada' }).qatorlar.every((q) => q.operatsiya === 'rasxod')).toBe(true);
    expect(hisobotYigish(baza(), { obyekt_idlar: [7] }).qatorlar.map((q) => q.id)).toEqual([3]);
    expect(hisobotYigish(baza(), { obyekt_idlar: [-1] }).qatorlar).toEqual([]);
    expect(hisobotYigish(baza(), { operatsiya: 'rasxod' }).qatorlar.length).toBe(2);
  });
  it('bo\'sh natija: jami nol', () => {
    const h = hisobotYigish(baza(), { dan: '2030-01-01' });
    expect(h.qatorlar).toEqual([]); expect(h.jami).toMatchObject({ kirim_soni: 0, kirim_summa: 0, birliklar: [] });
  });
});

describe('storno / qaytarish hisobotga kirmaydi', () => {
  it('tuzatish-storno va uning asl yozuvi chiqariladi; yangi qiymat qoladi', () => {
    id = 0;
    const asl = H('2026-11-10', 'prixod', 'Цемент', 'кг', 100, { narx: 10 });                       // 1 (xato)
    const storno = H('2026-11-10', 'rasxod', 'Цемент', 'кг', 100, { manba: 'ombor_tuzat_storno_v1', c11_juft_id: asl.id }); // 2
    const yangi = H('2026-11-10', 'prixod', 'Цемент', 'кг', 80, { narx: 10 });                      // 3
    const h = hisobotYigish([asl, storno, yangi]);
    expect(h.qatorlar.map((q) => q.id)).toEqual([3]);
    expect(h.chetlatilgan).toBe(2);
    expect(h.jami.birliklar).toEqual([{ birligi: 'кг', kirim: 80, chiqim: 0 }]);
    expect(h.jami.kirim_summa).toBe(800);
  });
  it('C11 storno (c11_storno_of_id) va chiqim qaytarish: qaytarish yozuvi chiqariladi, asl chiqim qoladi (qisman bo\'lishi mumkin)', () => {
    id = 0;
    const kirim = H('2026-11-01', 'prixod', 'Мix', 'кг', 50, { manba: 'c11_warehouse_receipt_v1' });   // 1
    const storno = H('2026-11-01', 'rasxod', 'Мix', 'кг', 50, { manba: 'c11_warehouse_storno_v1', c11_storno_of_id: kirim.id }); // 2
    const chiqim = H('2026-11-02', 'rasxod', 'Мix', 'кг', 10);                                           // 3
    const qaytar = H('2026-11-03', 'prixod', 'Мix', 'кг', 4, { manba: 'ombor_chiqim_qaytarish_v1' });   // 4
    const h = hisobotYigish([kirim, storno, chiqim, qaytar]);
    expect(h.qatorlar.map((q) => q.id)).toEqual([3]);
    expect(h.chetlatilgan).toBe(3);
  });
  it('davrdan tashqaridagi storno ham aniqlanadi (asl yozuv davr ichida)', () => {
    id = 0;
    const asl = H('2026-10-30', 'prixod', 'Цемент', 'кг', 100);
    const storno = H('2026-11-05', 'rasxod', 'Цемент', 'кг', 100, { manba: 'ombor_tuzat_storno_v1', c11_juft_id: asl.id });
    expect(hisobotYigish([asl, storno], { dan: '2026-10-01', gacha: '2026-10-31' }).qatorlar).toEqual([]);
  });
  it('haqiqiyHarakatlar: takroriy id bir marta, noma\'lum operatsiya tashlanadi', () => {
    id = 0; const a = H('2026-11-01', 'prixod', 'X', 'шт', 1);
    expect(haqiqiyHarakatlar([a, a, { ...H('2026-11-01', 'prixod', 'Y', 'шт', 1), operatsiya: 'boshqa' }]).haqiqiy.length).toBe(1);
  });
});

describe('qoldiqSanada (istalgan sanadagi ostatka)', () => {
  it('sana oxirigacha: kirim - chiqim; storno va qaytarish ostatkaga ta\'sir qiladi', () => {
    const q = qoldiqSanada(baza(), '2026-10-31');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ birligi: 'кг', kirim: 1500, chiqim: 300, qoldiq: 1200, oxirgi_sana: '2026-10-25' });
    const keyin = qoldiqSanada(baza(), '2026-11-30');
    expect(keyin.map((x) => x.nomi).sort()).toEqual(['Арматура 12', 'Труба ПЭ 25', 'Цемент ПЦ-400'].sort());
    expect(keyin.find((x) => x.nomi.startsWith('Арматура'))!.qoldiq).toBe(1);
  });
  it('o\'sha kuni kirim ham hisobga olinadi, ertasi kuni emas', () => {
    expect(qoldiqSanada(baza(), '2026-10-05')[0].qoldiq).toBe(1000);
    expect(qoldiqSanada(baza(), '2026-10-04')).toEqual([]);
  });
  it('storno bilan ostatka to\'g\'rilanadi (asl+storno = 0)', () => {
    id = 0;
    const a = H('2026-11-01', 'prixod', 'Мix', 'кг', 50); const s = H('2026-11-02', 'rasxod', 'Мix', 'кг', 50, { manba: 'ombor_tuzat_storno_v1', c11_juft_id: a.id });
    expect(qoldiqSanada([a, s], '2026-11-30')[0].qoldiq).toBe(0);
    expect(qoldiqSanada([a, s], '2026-11-30', { faqatMusbat: true })).toEqual([]);
    expect(qoldiqSanada([a, s], '2026-11-01')[0].qoldiq).toBe(50);
  });
  it('qidiruv va faqat musbat', () => {
    expect(qoldiqSanada(baza(), '2026-11-30', { qidir: 'truba' })).toHaveLength(1);
    expect(qoldiqSanada(baza(), null).length).toBe(3);
  });
});

describe('matnMosmi', () => {
  it('lotin/kirill va so\'z boshi', () => {
    expect(matnMosmi('alfa', 'Альфа-снаб')).toBe(true);
    expect(matnMosmi('beta', 'Альфа-снаб')).toBe(false);
    expect(matnMosmi('', 'x')).toBe(true);
    expect(matnMosmi('x', null)).toBe(false);
  });
});
