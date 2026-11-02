import { describe, expect, it } from 'vitest';
import { formulaFoizlari, formulaniHisobla, nakrutkaPodvaliniOqi, nakrutkaVaraqlari, yorliqFoizlari } from './nakrutka';
import type { Katak, KirishKitob, KirishVaraq } from './turlar';

/** Sintetik varaq: qatorlar (1-asosli Excel qatori = indeks + 1) va ixtiyoriy formulalar. */
function varaq(nom: string, rows: Katak[][], formulalar?: Array<Array<string | null>>): KirishVaraq {
  return { nom, rows, ...(formulalar ? { formulalar } : {}) };
}
const kitob = (...varaqlar: KirishVaraq[]): KirishKitob => ({ fayl: 'sintetik.xlsx', varaqlar });

describe('formula va yorliq foizlari', () => {
  it('turli yozuvlar: *0.18, *18%, *18/100, /100*18, *F5/100, *1.12', () => {
    const q = () => 2.5;
    expect(formulaFoizlari('(D12-D8)*0.18', q).foizlar).toEqual([18]);
    expect(formulaFoizlari('G252*6%', q).foizlar).toEqual([6]);
    expect(formulaFoizlari('ROUND(C9*18/100,2)', q).foizlar).toEqual([18]);
    expect(formulaFoizlari('C9/100*0,32', q).foizlar).toEqual([0.32]);
    expect(formulaFoizlari('ROUND(E10*F12/100,2)', q).foizlar).toEqual([2.5]);
    expect(formulaFoizlari('(F354-G355)*0.02+(G355*0.0075)', q).foizlar).toEqual([2, 0.75]);
    expect(formulaFoizlari('(C9+C10+C11+C12)*0', q).foizlar).toEqual([0]);
    expect(formulaFoizlari('C14*1.15', q).ndsKoef).toBe(15);
    expect(formulaFoizlari('D7*E7', q).foizlar).toEqual([]);
  });
  it('yorliqdan: «-18%», «=2% И М/К=0,75%»', () => {
    expect(yorliqFoizlari('ПРОЧИЕ ЗАТРАТЫ И РАСХОДЫ ПОДРЯДЧИКА   -18%')).toEqual([18]);
    expect(yorliqFoizlari('ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ =2%  И  М/К=0,75%')).toEqual([2, 0.75]);
  });
  it('formula hisoblagich: SUM, boshqa varaq, %, ROUND', () => {
    const k = new Map<string, KirishVaraq>([
      ['A', varaq('A', [[1, 2, 3], [10, null, 'x']])],
      ["B b", varaq('B b', [[100]])],
    ]);
    expect(formulaniHisobla(k, 'A', 'SUM(A1:C1)+A2')).toBe(16);
    expect(formulaniHisobla(k, 'A', "'B b'!A1*5%")).toBe(5);
    expect(formulaniHisobla(k, 'A', 'ROUND(A2/3,2)')).toBe(3.33);
    expect(formulaniHisobla(k, 'A', 'VLOOKUP(A1,B:C,2,0)')).toBeNull();
  });
});

describe('nakrutkaPodvaliniOqi — formulali podval (ekspertiza: RES + сводн, ming so‘m)', () => {
  // RES: materiallar bloki (склад 2% va М/К 0,75%, kabel transporti 1,5%, transport 5%), jihozlar bloki (1,2% / 2%).
  const res = varaq('1', [
    /* 1 */ ['МАТЕРИАЛЫ'],
    /* 2 */ [null, 'ИТОГО', 'СУМ', 10000],
    /* 3 */ [null, 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ =2%  И  М/К=0,75%', 'СУМ', 192.5, 600],
    /* 4 */ [null, 'ТРАНСПОРТНЫЕ УСЛУГИ НА КАБЕЛЬНО ПРОВОД.ПРОДУК.=1,5%', 'СУМ', 15, 1000],
    /* 5 */ [null, 'ТРАНСПОРТНЫЕ УСЛУГИ=5%', 'СУМ', 450],
    /* 6 */ [null, 'ВСЕГО С УЧЕТОМ ЗАГОТОВИТЕЛЬНО-СКЛАДСКИХ РАСХОДОВ И ТРАНСПОРТА', 'СУМ', 10657.5],
    /* 7 */ ['ОБОРУДОВАНИЕ'],
    /* 8 */ [null, 'ИТОГО', 'СУМ', 5000],
    /* 9 */ [null, 'ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ=1,2%', 'СУМ', 60],
    /* 10 */ [null, 'ТРАНСПОРТНЫЕ УСЛУГИ=2%', 'СУМ', 100],
    /* 11 */ [null, 'ИТОГО ОБОРУДОВАНИЕ С УЧЕТОМ ЗАГОТОВИТЕЛЬНО-СКЛАДСКИХ И ТРАНСПОРТНЫХ', 'СУМ', 5160],
  ], [
    [], [], [null, null, null, '(D2-E3)*0.02+(E3*0.0075)'], [null, null, null, 'E4*0.015'], [null, null, null, '(D2-E4)*0.05'],
    [null, null, null, 'SUM(D2:D5)'], [], [], [null, null, null, 'D8*0.012'], [null, null, null, 'D8*0.02'], [null, null, null, 'SUM(D8:D10)'],
  ]);
  const svod = varaq('сводн', [
    /* 1 */ ['СВОДКА ЗАТРАТ (тыс.сум)'],
    /* 2 */ ['Итого:', 16000],
    /* 3 */ ['Оборудование с учетом заготовительно-складских расходов и транспорта', 5160],
    /* 4 */ ['Прочие затраты подрядчика 18,0 %', 1951.2],
    /* 5 */ ['Затраты на страхование объекта', 57.44384],
    /* 6 */ ['Коэффициент риска 5,0 %', 0],
    /* 7 */ ['Итого  стоимость в текущих ценах без НДС', 18008.64384],
    /* 8 */ ['Итого  стоимость в текущих ценах с НДС', 20169.6811008],
  ], [
    [], [], [], [null, '(B2-B3)*0.18'], [null, '(B2+B4)*0.0032'], [null, '(B2+B4+B5)*0'], [null, 'B2+B4+B5+B6'], [null, 'B7*1.12'],
  ]);
  const n = nakrutkaPodvaliniOqi(kitob(res, svod));

  it('har foiz formuladan, katak manzili bilan', () => {
    expect(n.koeffitsientlar).toEqual({
      ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18,
      ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12,
    });
    expect(n.manba.ПРОЧИЕ_ПОДРЯДЧИК).toMatchObject({ dalil: 'formula', manzil: { varaq: 'сводн', qator: 4, ustun: 2 } });
    expect(n.manba.ЗАГОТ_СКЛАД_ОБОРУД?.manzil.qator).toBe(9);
    expect(n.holat).toBe('topildi');
  });
  it('ming so‘m masshtabi va isbot (ИТОГО-4 × 1,12 = ВСЕГО)', () => {
    expect(n.masshtab).toBe(1000);
    expect(n.isbot.length).toBeGreaterThan(0);
    expect(n.isbot.every((b) => b.mos)).toBe(true);
    expect(n.qatorlar.filter((q) => q.formula).every((q) => q.formulaIsbot !== false)).toBe(true);
  });
  it('yorliq formuladan farq qilsa — formula olinadi, review bor (риск 5% yozilgan, *0)', () => {
    expect(n.review.some((r) => r.kod === 'nakrutka_yorliq_formula_farq' && /риска/.test(r.izoh))).toBe(true);
  });
});

describe('nakrutkaPodvaliniOqi — formulasiz podval (yorliq), НДС 15%', () => {
  const rows: Katak[][] = [
    ['ИТОГО-1', 'СУМ', 1000],
    ['ПРОЧИЕ РАСХОДЫ ПОДРЯДЧИКА 20%', 'СУМ', 200],
    ['ИТОГО-2', 'СУМ', 1200],
    ['ИТОГО-3', 'СУМ', 1500],
    ['СТРАХОВАНИЕ ОБЪЕКТА 0,5%', 'СУМ', 7.5],
    ['РИСК 2%', 'СУМ', 30],
    ['ИТОГО-4 (без НДС)', 'СУМ', 1537.5],
    ['НДС 15%', 'СУМ', 230.63],
    ['ВСЕГО К ОПЛАТЕ', 'СУМ', 1768.13],
  ];
  it('foizlar yorliqdan, zanjir isboti mos', () => {
    const n = nakrutkaPodvaliniOqi(kitob(varaq('LRV', rows)));
    expect(n.koeffitsientlar).toEqual({ ПРОЧИЕ_ПОДРЯДЧИК: 20, СТРАХОВАНИЕ: 0.5, РИСК: 2, НДС: 15 });
    expect(n.manba.НДС?.dalil).toBe('yorliq');
    expect(n.isbot.map((b) => b.mos)).toEqual([true, true, true, true, true, true, true]);
    expect(n.masshtab).toBe(1);
    // Transport topilmadi — null (uydirilmaydi) + review.
    expect(n.koeffitsientlar.ТРАНСПОРТ_МАТЕРИАЛ).toBeUndefined();
    expect(n.review.some((r) => r.kod === 'nakrutka_topilmadi' && r.izoh.startsWith('ТРАНСПОРТ_МАТЕРИАЛ'))).toBe(true);
  });
  it('hujjat summasi nomos — ogohlantirish, lekin bloklamaydi', () => {
    const buzuq = rows.map((r) => (r[0] === 'ВСЕГО К ОПЛАТЕ' ? ['ВСЕГО К ОПЛАТЕ', 'СУМ', 1800] : r));
    const n = nakrutkaPodvaliniOqi(kitob(varaq('LRV', buzuq)));
    expect(n.koeffitsientlar.НДС).toBe(15);
    expect(n.review.some((r) => r.kod === 'nakrutka_isbot_nomos' && /ВСЕГО/.test(r.izoh))).toBe(true);
  });
  it('НДС foizi yozilmagan — summa nisbatidan (12%)', () => {
    const n = nakrutkaPodvaliniOqi(kitob(varaq('LRV', [
      ['ИТОГО СТОИМОСТЬ СТРОИТЕЛЬСТВА В ТЕКУЩИХ ЦЕНАХ', 2000],
      ['НДС', 240],
      ['ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА', 2240],
    ])));
    expect(n.koeffitsientlar.НДС).toBe(12);
    expect(n.manba.НДС?.dalil).toBe('summa_nisbati');
  });
});

describe('nakrutkaPodvaliniOqi — ziddiyat, resurs Kf, nostandart qator, o‘z hujjatimiz', () => {
  it('ikki blokda turli transport foizi — null + review (operator tanlaydi)', () => {
    const n = nakrutkaPodvaliniOqi(kitob(varaq('РС', [
      ['ИТОГО ТРАНСПОРТНЫ РАСХОДЫ ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', 'СУМ', 60],
      ['ИТОГО ТРАНСПОРТНЫ РАСХОДЫ ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', 'СУМ', 50],
    ], [[null, null, 'C9*6%'], [null, null, 'C20*5%']])));
    expect(n.koeffitsientlar.ТРАНСПОРТ_МАТЕРИАЛ).toBeUndefined();
    expect(n.review.find((r) => r.kod === 'nakrutka_ziddiyat')?.izoh).toMatch(/6% \/ 5%/);
  });
  it('«КОЭФФИЦИЕНТ К ОПЛАТЕ» qatorlari — resurs koeffitsientlari (БЕЗ СКЛАД ham)', () => {
    const n = nakrutkaPodvaliniOqi(kitob(varaq('LRV', [
      ['КОЭФФИЦИЕНТ К ОПЛАТЕ: ЧЕЛ', 1.33],
      ['КОЭФФИЦИЕНТ К ОПЛАТЕ: МАТ', 1.42],
      ['КОЭФФИЦИЕНТ К ОПЛАТЕ: БЕЗ СКЛАД', 1.39],
      ['КОЭФФИЦИЕНТ К ОПЛАТЕ: М/К', 1.4],
    ])));
    expect(n.resursKf.ЧЕЛ?.qiymat).toBe(1.33);
    expect(n.resursKf['БЕЗ СКЛАД']?.qiymat).toBe(1.39);
    expect(n.resursKf['М/К']?.qiymat).toBe(1.4);
    expect(n.resursKf.МАТ?.manzil.qator).toBe(2);
  });
  it('зимнее удорожание — standart kaskadda yo‘q: nostandart + review', () => {
    const n = nakrutkaPodvaliniOqi(kitob(varaq('сводн', [['Затраты на зимнее удорожание 0,35 %', 35]])));
    expect(n.nostandart).toEqual([expect.objectContaining({ foiz: 0.35, summa: 35 })]);
    expect(n.review.some((r) => r.kod === 'nakrutka_nostandart_qator')).toBe(true);
  });
  it('tizim hujjati: foiz alohida katakda (`*F3/100`)', () => {
    const n = nakrutkaPodvaliniOqi(kitob(varaq('F2', [
      ['ПРЯМЫЕ ЗАТРАТЫ — ВСЕГО', 1000],
      ['Транспортные расходы — материалы, %', 40, 4],
      ['Прочие расходы подрядчика, %', 187.2, 18],
    ], [[], [null, 'ROUND(B1*C2/100,2)'], [null, 'ROUND((B1+B2)*C3/100,2)']])));
    expect(n.koeffitsientlar).toMatchObject({ ТРАНСПОРТ_МАТЕРИАЛ: 4, ПРОЧИЕ_ПОДРЯДЧИК: 18 });
    expect(n.qatorlar.find((q) => q.kod === 'prochie')?.formulaIsbot).toBe(true);
  });
  it('podval yo‘q — topilmadi, hech narsa uydirilmaydi', () => {
    const n = nakrutkaPodvaliniOqi(kitob(varaq('LRV', [['1', 'Е01-001', 'КОТЛОВАН', 'М3', 10]])));
    expect(n.holat).toBe('topilmadi');
    expect(n.koeffitsientlar).toEqual({});
  });
  it('svod formulalari o‘qigan varaqlar tanlanadi (ishchi nusxalar chetda)', () => {
    const k = kitob(
      varaq('Стелла', [['x']]), varaq('Лист5', [['y']]), varaq('1', [['z']]),
      varaq('свод', [['ИТОГО', 5]], [[null, "'1'!F290/1000"]]),
    );
    const anat = { varaqlar: [{ varaq: 'Стелла', rol: 'lrv' }, { varaq: 'Лист5', rol: 'lrv' }, { varaq: '1', rol: 'lrv' }, { varaq: 'свод', rol: 'svod' }], asosiyLrv: 'Стелла', dublikat: [] };
    expect(nakrutkaVaraqlari(k, anat)).toEqual(['1', 'свод']);
  });
});

// ─── Ekspertiza «ALL» RES podvali (sintetik; tuzilma: № | kod | kod2 | nom | birlik | КОЛ-ВО | ЦЕНА | СУММА) ───
const R = (nom: string, bir: string, kolvo: number, narx: number): Katak[] => ['1', null, 'X-1', nom, bir, kolvo, narx, kolvo * narx];
const P = (yorliq: string, p: number | null, s: number): Katak[] => [null, null, null, yorliq, 'СУМ', p, null, s];
const T = (yorliq: string): Katak[] => [yorliq, null, null, null, null, null, null, null];
/** Bitta blok: sarlavha, resurslar, ИТОГО / ТРАНСПОРТ / (ЗАГОТ) / ВСЕГО. */
function blok(sarlavha: string | null, resurslar: Katak[][], tr: [number, number], zg: [number, number] | null): Katak[][] {
  const B = resurslar.reduce((a, r) => a + (r[7] as number), 0);
  return [
    ...(sarlavha ? [T(sarlavha)] : []), ...resurslar, P('ИТОГО', null, B),
    P('ТРАНСПОРТНЫЕ РАСХОДЫ', tr[0], tr[1]), ...(zg ? [P('ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ', zg[0], zg[1])] : []),
    P('ВСЕГО', null, B + tr[1] + (zg?.[1] ?? 0)), [],
  ];
}
const ALL_RES = (...qatorlar: Katak[][]) => varaq('RES', [T('ЛОКАЛЬНАЯ РЕСУРСНАЯ СМЕТА № 01'), T('ТРУДОВЫЕ РЕСУРСЫ'), R('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 10, 30), P('ИТОГО', null, 300), ...qatorlar]);

describe('ALL RES podvali — foiz КОЛ-ВО ustunidan, blok kategoriyasi', () => {
  it('ИТОГО 1000 / ТРАНСПОРТНЫЕ | СУМ | 5 | 50 / ЗАГОТ | СУМ | 1 | 10 → foiz 5 va 1 (kolvo_ustun), summa 50', () => {
    const n = nakrutkaPodvaliniOqi(kitob(ALL_RES(
      ...blok('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', [R('ЦЕМЕНТ', 'Т', 2, 500)], [5, 50], [1, 10]),
      P('ВСЕГО МАТЕРИАЛОВ', null, 1060),
    )));
    expect(n.koeffitsientlar).toEqual({ ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 1 });
    expect(n.manba.ТРАНСПОРТ_МАТЕРИАЛ?.dalil).toBe('kolvo_ustun');
    const tr = n.qatorlar.find((q) => q.kod === 'tr_mat')!;
    expect(tr.summa).toBe(50);
    expect(tr.manzil.ustun).toBe(8);
  });

  it('isbot buzilgan (S=60) — foiz null + review, uydirilmaydi', () => {
    const n = nakrutkaPodvaliniOqi(kitob(ALL_RES(
      ...blok('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', [R('ЦЕМЕНТ', 'Т', 2, 500)], [5, 60], [1, 10]),
      P('ВСЕГО МАТЕРИАЛОВ', null, 1070),
    )));
    expect(n.koeffitsientlar.ТРАНСПОРТ_МАТЕРИАЛ).toBeUndefined();
    expect(n.koeffitsientlar.СКЛАДСКИЕ_МАТЕРИАЛ).toBe(1);
    expect(n.qatorlar.find((q) => q.kod === 'tr_mat')?.summa).toBe(60);
    expect(n.review.some((r) => r.kod === 'nakrutka_kolvo_isbotsiz')).toBe(true);
  });

  it('М/К (0,75), КАБ (1,5/1), ОБ guruhi (2/1, «ВСЕГО ОБОРУДОВАНИЯ» yopadi) — to‘g‘ri kodlar; ОБ zagot = 1 (1,2 emas)', () => {
    const n = nakrutkaPodvaliniOqi(kitob(ALL_RES(
      ...blok('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', [R('ЦЕМЕНТ', 'Т', 2, 500)], [5, 50], [1, 10]),
      ...blok('МЕТАЛЛОКОНСТРУКЦИИ', [R('КОНСТРУКЦИИ СТАЛЬНЫЕ', 'Т', 1, 2000)], [5, 100], [0.75, 15]),
      ...blok('КАБЕЛЬНАЯ ПРОДУКЦИЯ', [R('КАБЕЛЬ ВВГ 3Х2,5', '1000М', 1, 4000)], [1.5, 60], [1, 40]),
      P('ВСЕГО МАТЕРИАЛОВ', null, 7275),
      // sarlavhasiz uskuna bloki — uni faqat guruh yopuvchisi ОБ qiladi
      ...blok(null, [R('ЩИТ РАСПРЕДЕЛИТЕЛЬНЫЙ', 'ШТ', 2, 5000)], [2, 200], [1, 100]),
      P('ВСЕГО ОБОРУДОВАНИЯ', null, 10300),
    )));
    expect(n.koeffitsientlar).toEqual({
      ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 1, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1,
    });
    expect(n.resBloklar?.map((b) => b.kat)).toEqual(['МАТ', 'М/К', 'КАБ', 'ОБ']);
    expect(n.review.some((r) => r.kod === 'nakrutka_ziddiyat')).toBe(false);
  });

  it('КАБ zagot % МАТ zagot % dan farqli — ziddiyat review (alohida КАБ zagot kodi yo‘q)', () => {
    const n = nakrutkaPodvaliniOqi(kitob(ALL_RES(
      ...blok('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', [R('ЦЕМЕНТ', 'Т', 2, 500)], [5, 50], [1, 10]),
      ...blok('КАБЕЛЬНАЯ ПРОДУКЦИЯ', [R('КАБЕЛЬ ВВГ 3Х2,5', '1000М', 1, 4000)], [1.5, 60], [2, 80]),
      P('ВСЕГО МАТЕРИАЛОВ', null, 5200),
    )));
    expect(n.koeffitsientlar.СКЛАДСКИЕ_МАТЕРИАЛ).toBeUndefined();
    expect(n.review.some((r) => r.kod === 'nakrutka_ziddiyat' && r.izoh.startsWith('СКЛАДСКИЕ_МАТЕРИАЛ'))).toBe(true);
  });

  it('zagotsiz isbotli blok — БЕЗ СКЛАД (bloklovchi review yo‘q), transport МАТ foizi bilan bir xil', () => {
    const n = nakrutkaPodvaliniOqi(kitob(ALL_RES(
      ...blok('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', [R('ЦЕМЕНТ', 'Т', 2, 500)], [5, 50], [1, 10]),
      ...blok('ИНЕРТНЫЕ МАТЕРИАЛЫ', [R('ЩЕБЕНЬ', 'М3', 4, 100)], [5, 20], null),
      P('ВСЕГО МАТЕРИАЛОВ', null, 1480),
    )));
    expect(n.resBloklar?.map((b) => b.kat)).toEqual(['МАТ', 'БЕЗ СКЛАД']);
    expect(n.review.some((r) => r.bloklovchi)).toBe(false);
    expect(n.koeffitsientlar).toEqual({ ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 1 });
  });

  it('zagotsiz blok, transport isbotsiz — БЕЗСКЛАД berilmaydi, bloklovchi review (blok bazasi bilan)', () => {
    const n = nakrutkaPodvaliniOqi(kitob(ALL_RES(
      ...blok('ИНЕРТНЫЕ МАТЕРИАЛЫ', [R('ЩЕБЕНЬ', 'М3', 4, 100)], [5, 33], null),
      P('ВСЕГО МАТЕРИАЛОВ', null, 433),
    )));
    const b = n.review.find((r) => r.kod === 'bez_sklad_isbotsiz');
    expect(b?.bloklovchi).toBe(true);
    expect(b?.izoh).toMatch(/baza 400/);
  });

  it('lokal podval (prochie/НДС yo‘q) — holat «topilmadi» emas, lokal; prochie meros', () => {
    const n = nakrutkaPodvaliniOqi(kitob(ALL_RES(
      ...blok('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', [R('ЦЕМЕНТ', 'Т', 2, 500)], [5, 50], [1, 10]),
      P('ВСЕГО МАТЕРИАЛОВ', null, 1060),
    )));
    expect(n.holat).toBe('qisman');
    expect(n.lokal).toBe(true);
    expect(n.koeffitsientlar.ПРОЧИЕ_ПОДРЯДЧИК).toBeUndefined();
    expect(n.review.some((r) => r.kod === 'nakrutka_lokal_meros' && r.izoh.startsWith('ПРОЧИЕ_ПОДРЯДЧИК'))).toBe(true);
  });

  it('kaskad: tr + skl + tr_ob + zag_ob = podval summalari (±1)', async () => {
    // Lokal podval (prochie/НДС yo'q) — butun kaskad noma'lum, lekin transport/sklad qadamlari ma'lum: yadro qiymatlari.
    const { kaskad, standartPodval } = await import('../hisob-yadro');
    const n = nakrutkaPodvaliniOqi(kitob(ALL_RES(
      ...blok('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', [R('ЦЕМЕНТ', 'Т', 3, 1234.57)], [5, 185.19], [1, 37.04]),
      ...blok('МЕТАЛЛОКОНСТРУКЦИИ', [R('КОНСТРУКЦИИ СТАЛЬНЫЕ', 'Т', 1.5, 9876.5)], [5, 740.74], [0.75, 111.11]),
      ...blok('КАБЕЛЬНАЯ ПРОДУКЦИЯ', [R('КАБЕЛЬ ВВГ 3Х2,5', '1000М', 0.7, 15222.3)], [1.5, 159.83], [1, 106.56]),
      P('ВСЕГО МАТЕРИАЛОВ', null, 0),
      ...blok('ОБОРУДОВАНИЕ', [R('ЩИТ РАСПРЕДЕЛИТЕЛЬНЫЙ', 'ШТ', 3, 696429)], [2, 41785.74], [1, 20892.87]),
      P('ВСЕГО ОБОРУДОВАНИЯ', null, 0),
    )));
    const baza = (k: string) => (n.resBloklar ?? []).filter((b) => b.kat === k).reduce((a, b) => a + (b.baza ?? 0), 0);
    const k = kaskad({ ЧЕЛ: 0, МАШ: 0, МАТ: baza('МАТ'), ОБ: baza('ОБ'), КАБ: baza('КАБ'), 'М/К': baza('М/К'), 'БЕЗ СКЛАД': 0 }, standartPodval(n.koeffitsientlar)).qiymat;
    const tizim = ['tr_mat', 'skl_mat', 'skl_mk', 'tr_kab', 'tr_ob', 'zag_ob'].reduce((a, kod) => a + (k[kod] as number), 0);
    const hujjat = (n.resBloklar ?? []).reduce((a, b) => a + (b.transportSumma ?? 0) + (b.zagotSumma ?? 0), 0);
    expect(Math.abs(tizim - hujjat)).toBeLessThanOrEqual(1);
  });

  it('«ШАФФОФ ҚУРИЛИШ ФОНДИ» — ЗАКАЗЧИК kabi o‘tkazib yuboriladi', () => {
    const n = nakrutkaPodvaliniOqi(kitob(varaq('сводн', [['ИТОГО С НДС ШАФФОФ ҚУРИЛИШ ФОНДИГА 1%', 10]])));
    expect(n.qatorlar).toEqual([]);
  });

  it('ALL to‘plami: VED va TNDR podval varaqlari emas', () => {
    const k = kitob(
      ALL_RES(...blok('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', [R('ЦЕМЕНТ', 'Т', 2, 500)], [5, 50], [1, 10])),
      varaq('F5', [['ИШ']]), varaq('VED', [['ВЕДОМОСТЬ ОБЪЕМОВ РАБОТ']]), varaq('TNDR', [['ИТОГО', 5]]),
    );
    const anat = { varaqlar: [{ varaq: 'RES', rol: 'res' }, { varaq: 'F5', rol: 'lrv' }, { varaq: 'VED', rol: 'lrv' }, { varaq: 'TNDR', rol: 'res' }], asosiyLrv: null, dublikat: [] };
    expect(nakrutkaVaraqlari(k, anat, ['F5', 'VED', 'TNDR'])).toEqual(['RES', 'F5']);
  });
});