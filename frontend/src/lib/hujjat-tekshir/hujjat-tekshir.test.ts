import { describe, expect, it } from 'vitest';
import { bajar, foizKopaytuvchi, formulaniOqi } from './formula';
import { kitobniTekshir } from './index';
import type { KirishKitob } from '../smeta-anatomiya/turlar';

const hech = () => null;

describe('formula dvigateli (eval yo‘q)', () => {
  it('arifmetika, foiz, ustuvorlik, funksiyalar', () => {
    expect(bajar(formulaniOqi('=2+3*4'), hech, 'S')).toBe(14);
    expect(bajar(formulaniOqi('(2+3)*4'), hech, 'S')).toBe(20);
    expect(bajar(formulaniOqi('200*6%'), hech, 'S')).toBeCloseTo(12, 10);
    expect(bajar(formulaniOqi('-2^2'), hech, 'S')).toBe(4); // Excel: unar minus avval
    expect(bajar(formulaniOqi('ROUND(2.345,2)'), hech, 'S')).toBe(2.35);
    expect(bajar(formulaniOqi('IF(1>2,"a","b")'), hech, 'S')).toBe('b');
    expect(bajar(formulaniOqi('MAX(1,5,3)'), hech, 'S')).toBe(5);
  });
  it('katak, oraliq, boshqa varaq, $ belgilari', () => {
    const v: Record<string, number> = { 'S!0,0': 10, 'S!1,0': 20, 'S!2,0': 30, 'RES!4,6': 7 };
    const oqi = (r: { varaq: string | null; r: number; c: number }) => v[`${r.varaq}!${r.r},${r.c}`] ?? null;
    expect(bajar(formulaniOqi('SUM(A1:A3)'), oqi, 'S')).toBe(60);
    expect(bajar(formulaniOqi('$A$1+A2'), oqi, 'S')).toBe(30);
    expect(bajar(formulaniOqi("'RES'!G5*2"), oqi, 'S')).toBe(14);
    expect(bajar(formulaniOqi('RES!G5+1'), oqi, 'S')).toBe(8);
  });
  it('foizni taniydi: X*6%, X*0.06, (a-b)*1.5%, 6/100*X', () => {
    expect(foizKopaytuvchi(formulaniOqi('G213*6%'))?.foiz).toBe(6);
    expect(foizKopaytuvchi(formulaniOqi('G213*0.06'))?.foiz).toBeCloseTo(6, 10);
    expect(foizKopaytuvchi(formulaniOqi('(G470-G469)*1.5%'))?.foiz).toBe(1.5);
    expect(foizKopaytuvchi(formulaniOqi('6/100*G1'))?.foiz).toBe(6);
    expect(foizKopaytuvchi(formulaniOqi('F13*E13'))).toBeNull();
  });
});

describe('Excel mezonlari va qo‘shimcha funksiyalar', () => {
  it('SUMIF/SUMIFS/COUNTIF/OR/N, bo‘sh katak — 0', () => {
    const rows: Array<Array<string | number | null>> = [['rs', 10], ['mat', 5], ['rs', 7], ['bl', 100], [null, null]];
    const k: KirishKitob = { fayl: 'x', varaqlar: [{ nom: 'S', rows: [...rows, [null, null, 17, 3, 12, 2, 1, 0]], formulalar: [[], [], [], [], [], [null, null, 'SUMIF(A1:A4,"rs",B1:B4)', 'COUNTIF(A1:A4,"<>bl")', 'SUMIFS(B1:B4,A1:A4,"rs",B1:B4,">8")+2', 'N(A1)+COUNTIF(B1:B4,">=10")', 'OR(B1>9,B2>9)', 'B5']] }] };
    const r = kitobniTekshir(k);
    expect(r.jami).toMatchObject({ formulalar: 6, mos: 6, farq: 0, tushunilmadi: 0 });
  });
});

describe('hujjatni o‘zi tekshirish', () => {
  // RES shakli: resurslar (hajm × narx), ИТОГО = SUM, transport = ИТОГО × 6%, jami.
  const rows = [
    ['', 'ПЕСОК', 'м3', '', 10, 100, 1000],
    ['', 'ЦЕМЕНТ', 'т', '', 2, 500, 1000],
    ['', 'ИТОГО', 'СУМ', '', null, null, 2000],
    ['', 'ИТОГО ТРАНСПОРТНЫ РАСХОДЫ:', 'СУМ', '', null, null, 120],
    ['', 'ИТОГО ПО МАТЕРИАЛАМ:', 'СУМ', '', null, null, 2120],
  ];
  const formulalar = [
    [null, null, null, null, null, null, 'F1*E1'],
    [null, null, null, null, null, null, 'F2*E2'],
    [null, null, null, null, null, null, 'SUM(G1:G2)'],
    [null, null, null, null, null, null, 'G3*6%'],
    [null, null, null, null, null, null, 'G4+G3'],
  ];
  const kitob = (r = rows): KirishKitob => ({ fayl: 'x.xlsx', varaqlar: [{ nom: 'RES', rows: r, formulalar }] });

  it('hamma formula hujjatdagi natija bilan aynan mos; foiz yorlig‘i va bazasi bilan tushuntiriladi', () => {
    const t = kitobniTekshir(kitob());
    expect(t.jami).toMatchObject({ formulalar: 5, mos: 5, yaxlitlash: 0, farq: 0, tushunilmadi: 0, foizlar: 1 });
    expect(t.toliqMos).toBe(true);
    expect(t.varaqlar[0].foizlar[0]).toMatchObject({ manzil: 'G4', yorliq: 'ИТОГО ТРАНСПОРТНЫ РАСХОДЫ:', foiz: 6, baza: 'ИТОГО (G3)', bazaQiymat: 2000, natija: 120 });
  });

  it('qo‘lda buzilgan katak aniq manzil va farq bilan topiladi', () => {
    const buzuq = rows.map((r) => [...r]);
    buzuq[3][6] = 125; // transport qo'lda yozilgan (formula ustidan)
    buzuq[4][6] = 2125; // Excel keyingi jamini o'zi qayta hisoblaydi
    const t = kitobniTekshir(kitob(buzuq));
    expect(t.toliqMos).toBe(false);
    expect(t.varaqlar[0].muammolar).toEqual([expect.objectContaining({ manzil: 'G4', hujjatda: 125, hisoblandi: 120, holat: 'farq' })]);
  });

  it('tushunilmagan funksiya — taxmin qilinmaydi, alohida ko‘rsatiladi', () => {
    const t = kitobniTekshir({ fayl: 'x', varaqlar: [{ nom: 'S', rows: [[5]], formulalar: [['VLOOKUP(1,A1:B2,2)']] }] });
    expect(t.jami.tushunilmadi).toBe(1);
    expect(t.toliqMos).toBe(false);
  });
});

describe('qiymat bo‘yicha isbot (formulasiz hujjat)', () => {
  it('qator, ish, jami (oraliq, foiz, keng oraliq) isbotlanadi; buzilgan summa topiladi', async () => {
    const { kitobQiymatTekshir } = await import('./index');
    const rows: Array<Array<string | number | null>> = [
      ['№', 'КОД', 'НАИМЕНОВАНИЕ РЕСУРСА', 'ЕД.ИЗМ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
      [null, null, 'ТРУДОВЫЕ РЕСУРСЫ', null, null, null, null],
      [1, '1-100', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ-Ч', 10, 20000, 200000],
      [null, null, 'ИТОГО ПО ТРУДОВЫМ РЕСУРСАМ:', 'СУМ', null, null, 200000],
      [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ', null, null, null, null],
      [2, 'С401', 'БЕТОН В25', 'М3', 4, 500000, 2000000],
      [3, 'С402', 'ПЕСОК', 'М3', 2, 100000, 200000],
      [null, null, 'ИТОГО', 'СУМ', null, null, 2200000],
      [null, null, 'ИТОГО ТРАНСПОРТНЫ РАСХОДЫ ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', 'СУМ', null, null, 132000],
      [null, null, 'ИТОГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', 'СУМ', null, null, 2332000],
      [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 2532000],
    ];
    const t = kitobQiymatTekshir({ fayl: 'res.xlsx', varaqlar: [{ nom: 'RES', rows }] });
    expect(t.length).toBe(1);
    const r = t[0];
    expect(r.qatorlar).toMatchObject({ farq: 0 });
    expect(r.foizlar.some((f) => f.foiz === 6)).toBe(true);
    const buzuq = rows.map((x) => [...x]);
    buzuq[6][6] = 210000; // ПЕСОК summasi qo'lda o'zgargan
    const b = kitobQiymatTekshir({ fayl: 'res.xlsx', varaqlar: [{ nom: 'RES', rows: buzuq }] })[0];
    expect(b.qatorlar.farq).toBe(1);
  });
});
