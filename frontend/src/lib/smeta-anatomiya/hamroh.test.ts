/**
 * C4 PR-1 — perevozka (tn·km, sarlavhasiz RES), moddali svod (`SvodQatori`), «bo'sh import» darvozasi.
 * Fixture'lar SINTETIK (real smeta ma'lumoti yo'q): shakl real korpusdagidek, nomlar va sonlar to'qima.
 */
import { describe, expect, it } from 'vitest';
import { kitobAnatomiyasi, kitobHamrohlari } from './index';
import { hamrohDaraxti, varaqRoli, xatQatoriNarxi } from './yuklash';
import type { Katak } from './turlar';

// ─── tn·km varag'i (`трансп.`) ───────────────────────────────────────────────
const TKM: Katak[][] = [
  [null, 'Расчёт затрат транспорта'],
  [null, 'НА СТРОИТЕЛЬСТВО ТЕСТОВОГО ОБЪЕКТА'],
  [],
  [null, '№', 'Наименование материалов', 'Ед.изм', 'Кол-во', 'Кол-во (тн)', 'Дальность возки (км)', 'Грузооборот тн.км.', 'Стоимость тн.км в сум', 'Стоимость всего сум.'],
  [],
  [null, 1, 'Материал А', 'тн', 100, 100, 10, 1000, 1000, 1_000_000],
  [null, 2, 'Материал Б', 'м3', 10, 15, 20, 300, 1000, 300_000],
  [null, 3, 'Материал В', 'м3', 0, 0, 5, 0, 1000, 0],
  [null, null, 'ИТОГО:', 'сум', null, null, null, null, null, 1_300_000],
];
const SVODN: Katak[][] = [
  [null, 'РЕКОМЕНДУЕМАЯ СТОИМОСТЬ ОБЪЕКТА В ТЕКУЩИХ ЦЕНАХ'],
  ['№№ ПП', 'НАИМЕНОВАНИЕ ЗАТРАТ', 'Цена'],
  [null, null, '(сум)'],
  [1, 2, 3],
  [1, 'ЗАТРАТЫ НА СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ', 10_000_000],
  [2, 'ЗАТРАТЫ НА ТРАНСПОРТНЫЕ РАСХОДЫ', 1_300_000],
  [null, 'ИТОГО: П.1-2', 11_300_000],
  [3, 'ПРОЧИЕ ЗАТРАТЫ И РАСХОДЫ ПОДРЯДЧИКА -18,0% ОТ СУММЫ ПО П.1-2', 2_034_000],
  [4, 'ЗАТРАТЫ НА СТРАХОВАНИЕ СТРОИТЕЛЬСТВА ОБЪЕКТА-0,4% С К=0,8 ОТ СУММЫ', 42_665.28],
  [null, 'ИТОГО: П.1-4', 13_376_665.28],
  [5, 'НДС -12%', 1_605_199.83],
  [null, 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА', 14_981_865.11],
  [null, 'Tuzdi:'],
];
const SVODN_F: Array<Array<string | null>> = [];
SVODN_F[5] = [null, null, 'трансп.!J9'];
SVODN_F[7] = [null, null, 'C7*0.18'];

// ─── sarlavhasiz perevozka RES (`16.Перевоз`) va ekspertiza svodi ─────────────
const PEREVOZ: Katak[][] = [
  ['ТЕСТ ВИЛОЯТИ, ТЕСТ ОБЪЕКТИ БЎЙИЧА'],
  ['ПЕРЕВОЗКА'],
  [],
  ['СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
  [1, 'ЭКСКАВАТОРЫ ТЕСТОВЫЕ', 'МАШ-Ч', 10, 2000, 20_000],
  [2, 'АВТОМОБИЛИ-САМОСВАЛЫ ТЕСТОВЫЕ', 'МАШ-Ч', 5, 3000, 15_000],
  ['ИТОГО ', null, 'СУМ', null, null, 35_000],
];
const SVOD_EKS: Katak[][] = [
  ['СВОДНАЯ ТАБЛИЦА ЗАТРАТ СТОИМОСТИ СТРОИТЕЛЬСТВА'],
  ['№', 'Наименование смет ', 'Перевозка грузов (тыс.сум)', 'Всего стоимость без НДС (тыс.сум)', 'Всего стоимость с НДС (тыс.сум)'],
  [1, 2, 3, 4, 5],
  [1, 'ПЕРЕВОЗКА', 35, 35, 39.2],
  [2, 'ОБОРУДОВАНИЕ ТЕСТОВОЕ СОГЛАСНО ПИСЬМО ЗАКАЗЧИКА от 01.02.2026г. №777', null, null, 1120],
  [null, 'ИТОГО:', null, null, 1159.2],
  [3, 'ПРОЧИЕ ЗАТРАТЫ ЗАКАЗЧИКА', null, null, 57.96],
  [null, null, null, 'заявленная', 1300],
  [null, null, null, 'снижения', -140.8],
];
const SVOD_EKS_F: Array<Array<string | null>> = [];
SVOD_EKS_F[3] = [null, null, "'16.Перевоз'!F7/1000", null, 'D4*1.12'];
const SVODN_EKS: Katak[][] = [
  ['СВОДНЫЙ РАСЧЕТ стоимости строительства'],
  [],
  ['№ п.п', 'Наименование затрат', 'Стоимость в текущих ценах (тыс. сум)'],
  [1, 'Перевозка', 35],
  ['Оборудование тестовое согласно письмо заказчика от 01.02.2026г. №777', null, 1120],
];
const SVODN_EKS_F: Array<Array<string | null>> = [];
SVODN_EKS_F[4] = [null, null, 'свод!E5'];

describe('perevozka: tn·km varag‘i', () => {
  const a = kitobAnatomiyasi({ fayl: 'yol.xlsx', varaqlar: [
    { nom: 'сводн.', rows: SVODN, formulalar: SVODN_F }, { nom: 'трансп.', rows: TKM },
  ] });
  const e = a.erkin.find((x) => x.varaq === 'трансп.')!;

  it('har material qatori: miqdor, tonna, masofa, tn·km, narx, summa + arifmetik isbot', () => {
    expect(e.rol).toBe('transport');
    expect(e.qatorlar).toHaveLength(3);
    expect(e.qatorlar![1]).toMatchObject({ xom: 'Материал Б', birlik: 'м3', miqdor: 10, tonna: 15, masofa: 20, tnKm: 300, narx: 1000, summa: 300_000, isbot: { tnKm: true, summa: true }, manzil: { varaq: 'трансп.', qator: 7 } });
    expect(e.qatorlarJami).toBe(1_300_000);
    expect(e.jamiMos).toBe(true);
    expect(e.svodQatori).toMatchObject({ manzil: { varaq: 'сводн.', qator: 6 }, dalil: { qoida: 'formula', ishonch: 'yuqori' } });
  });

  it('arifmetika buzilsa — isbot false va jami farqi review, qiymat to‘ldirilmaydi', () => {
    const buzuq = TKM.map((r) => [...r]);
    buzuq[5][9] = 900_000; // summa ≠ tn·km × narx
    const b = kitobAnatomiyasi({ fayl: 'b.xlsx', varaqlar: [{ nom: 'трансп.', rows: buzuq }] });
    const q = b.erkin[0].qatorlar![0];
    expect(q.isbot.summa).toBe(false);
    expect(q.summa).toBe(900_000);
    expect(b.erkin[0].jamiMos).toBe(false);
    expect(b.review.some((r) => r.kod === 'transport_jami_farq')).toBe(true);
  });

  it('import roli: hamroh (etiborsiz emas)', () => {
    expect(varaqRoli('трансп.', TKM).rol).toBe('hamroh');
    expect(varaqRoli('сводн.', SVODN).rol).toBe('hamroh');
  });

  it('hamroh daraxti: har material ALOHIDA perevozka resursi (т·км); tn·km 0 — kirmaydi; bo‘sh tanlov — bo‘sh', () => {
    expect(hamrohDaraxti({ transport: [], xatlar: [] }).tree).toEqual([]);
    const h = hamrohDaraxti({ transport: [e], xatlar: [] });
    expect(h.tree).toHaveLength(1);
    expect(h.tree[0]).toMatchObject({ type: 'rz', nom: 'ПЕРЕВОЗКА ГРУЗОВ (трансп.)' });
    expect(h.tree[0].children!.map((c) => [c.type, c.nom, c.bir, c.hajm, c.narx, c.summa])).toEqual([
      ['rs', 'ПЕРЕВОЗКА: Материал А', 'т·км', 1000, 1000, 1_000_000],
      ['rs', 'ПЕРЕВОЗКА: Материал Б', 'т·км', 300, 1000, 300_000],
    ]);
    expect(h.otkazildi).toBe(1);
  });
});

describe('perevozka: sarlavhasiz bitta guruhli RES', () => {
  const a = kitobAnatomiyasi({ fayl: 'eks.xlsx', varaqlar: [
    { nom: 'свод', rows: SVOD_EKS, formulalar: SVOD_EKS_F }, { nom: '16.Перевоз', rows: PEREVOZ }, { nom: 'сводн', rows: SVODN_EKS, formulalar: SVODN_EKS_F },
  ] });
  const v = a.varaqlar[1];

  it('guruh sarlavhasi + miqdor × narx = summa isboti bilan RES sifatida o‘qiladi', () => {
    expect(v.rol).toBe('res');
    expect(v.rolDalil.map((d) => d.qoida)).toEqual(expect.arrayContaining(['res:sarlavhasiz_arifmetika', 'perevozka_res']));
    expect(v.vedomost.map((r) => [r.xom, r.birlik, r.hajm, r.narx, r.summa, r.guruh])).toEqual([
      ['ЭКСКАВАТОРЫ ТЕСТОВЫЕ', 'МАШ-Ч', 10, 2000, 20_000, 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
      ['АВТОМОБИЛИ-САМОСВАЛЫ ТЕСТОВЫЕ', 'МАШ-Ч', 5, 3000, 15_000, 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
    ]);
    expect(v.jamilar.at(-1)?.qiymat).toBe(35_000);
    expect(varaqRoli('16.Перевоз', PEREVOZ)).toMatchObject({ rol: 'res', aniq: true });
  });

  it('ИТОГО svod qatoriga formula bilan bog‘lanadi (`\'16.Перевоз\'!F7/1000`)', () => {
    const e = a.erkin.find((x) => x.varaq === '16.Перевоз')!;
    expect(e.rol).toBe('perevozka_res');
    expect(e.yakuniy?.qiymat).toBe(35_000);
    expect(e.svodQatori).toMatchObject({ manzil: { varaq: 'свод', qator: 4 }, dalil: { qoida: 'formula' } });
  });

  it('isbot yetmasa (bitta qator) — RES qilinmaydi, avvalgidek erkin', () => {
    const b = kitobAnatomiyasi({ fayl: 'x.xlsx', varaqlar: [{ nom: 'Лист9', rows: PEREVOZ.slice(0, 5) }] });
    expect(b.varaqlar[0].rol).toBe('erkin');
  });
});

describe('moddali svod — SvodQatori', () => {
  it('modda, foiz («-18,0%», «0,4% С К=0,8»), НДС stavkasi, jami; masshtab so‘m', () => {
    const a = kitobAnatomiyasi({ fayl: 'yol.xlsx', varaqlar: [{ nom: 'сводн.', rows: SVODN, formulalar: SVODN_F }, { nom: 'трансп.', rows: TKM }] });
    const s = a.svod.find((x) => x.varaq === 'сводн.')!;
    expect(s.shakl).toBe('modda');
    expect(s.holat).toBe('kutmoqda');
    expect(s.nds).toMatchObject({ stavka: 0.12 });
    const tur = (re: RegExp) => s.qatorlar.find((q) => re.test(q.xom))!;
    expect(tur(/МАТЕРИАЛЫ/)).toMatchObject({ tur: 'modda', tartib: '1', summa: { qiymat: 10_000_000, masshtab: 1 } });
    expect(tur(/ТРАНСПОРТНЫЕ/)).toMatchObject({ tur: 'modda', bogLanish: { varaq: 'трансп.', katak: 'J9' } });
    expect(tur(/ПРОЧИЕ/)).toMatchObject({ tur: 'foiz', foiz: { foiz: 18, koef: null } });
    expect(tur(/СТРАХОВАНИЕ/)).toMatchObject({ tur: 'foiz', foiz: { foiz: 0.4, koef: 0.8 } });
    expect(tur(/^НДС/)).toMatchObject({ tur: 'nds', foiz: { foiz: 12 } });
    expect(tur(/^ИТОГО: П.1-2/).tur).toBe('jami');
    // «1 | 2 | 3» raqamlash qatori va imzo svod qatori emas.
    expect(s.qatorlar.some((q) => /Tuzdi/.test(q.xom))).toBe(false);
    expect(s.qatorlar).toHaveLength(8);
  });

  it('xat lump-sum: raqam/sana, тыс.сум masshtabi, «с НДС» — НДС siz narx svod stavkasidan; snijenie; nusxa ikki marta sanalmaydi', () => {
    const a = kitobAnatomiyasi({ fayl: 'eks.xlsx', varaqlar: [
      { nom: 'свод', rows: SVOD_EKS, formulalar: SVOD_EKS_F }, { nom: '16.Перевоз', rows: PEREVOZ }, { nom: 'сводн', rows: SVODN_EKS, formulalar: SVODN_EKS_F },
    ] });
    const svod = a.svod.find((x) => x.varaq === 'свод')!;
    const xat = svod.qatorlar.find((q) => q.tur === 'xat_lumpsum')!;
    expect(xat).toMatchObject({ xat: { raqam: '777', sana: '01.02.2026' }, summa: { qiymat: 1120, masshtab: 1000, ndsBilan: true } });
    expect(svod.nds?.stavka).toBe(0.12);
    expect(xatQatoriNarxi(svod, xat)).toEqual({ narx: 1_000_000, ndsBilan: 1_120_000, sabab: null });
    expect(svod.qatorlar.filter((q) => q.tur === 'snijenie').map((q) => q.xom)).toEqual(['заявленная', 'снижения']);
    expect(svod.qatorlar.find((q) => q.xom === 'ПРОЧИЕ ЗАТРАТЫ ЗАКАЗЧИКА')?.tur).toBe('buyurtmachi_xarajati');
    expect(svod.qatorlar.find((q) => q.xom === 'ПЕРЕВОЗКА')?.tur).toBe('lokal');

    const svodn = a.svod.find((x) => x.varaq === 'сводн')!;
    const nusxa = svodn.qatorlar.find((q) => q.tur === 'xat_lumpsum')!;
    expect(nusxa.nusxa).toEqual({ varaq: 'свод', qator: 5 });
    expect(nusxa.summa?.ndsBilan).toBe(true); // formula orqali свод!E ustunidan

    const h = hamrohDaraxti({ transport: [], xatlar: [{ svod, qator: xat }, { svod: svodn, qator: nusxa }] });
    expect(h.tree).toHaveLength(1);
    expect(h.tree[0].children).toEqual([expect.objectContaining({
      type: 'bl', kod: 'ПИСЬМО ЗАКАЗЧИКА №777 ОТ 01.02.2026', bir: 'сум', hajm: 1, narx: 1_000_000, summa: 1_000_000,
    })]);
    expect(h.otkazildi).toBe(1);
  });

  it('НДС holati yoki stavkasi dalilsiz — narx null (pul to‘qilmaydi)', () => {
    const rows: Katak[][] = [
      ['№', 'Наименование затрат', 'Сумма'],
      [1, 'Оборудование согласно письма заказчика №12', 500],
    ];
    const a = kitobAnatomiyasi({ fayl: 'x.xlsx', varaqlar: [{ nom: 'свод', rows }] });
    const s = a.svod[0];
    const q = s.qatorlar[0];
    expect(q.tur).toBe('xat_lumpsum');
    expect(xatQatoriNarxi(s, q)).toMatchObject({ narx: null, sabab: expect.stringContaining('НДС') });
    expect(hamrohDaraxti({ transport: [], xatlar: [{ svod: s, qator: q }] }).tree).toEqual([]);
  });
});

describe('«bo‘sh import» darvozasi', () => {
  const FAQAT_SONLAR: Katak[][] = [
    ['Таблица объёмов'],
    ['Участок 1', 120.5, 'м2'], ['Участок 2', 88, 'м2'], ['Участок 3', 40, 'м2'],
    ['Участок 4', 12, 'м2'], ['Участок 5', 7.5, 'м2'], ['Итого', 268, 'м2'],
  ];

  it('sonli qatorlar bor, hech bir shakl o‘qimadi — tushunilmadi + eng katta ИТОГО + taklif', () => {
    const a = kitobAnatomiyasi({ fayl: 'j.xlsx', varaqlar: [{ nom: 'Лист3', rows: FAQAT_SONLAR }] });
    expect(a.tushunilmadi).toHaveLength(1);
    expect(a.tushunilmadi[0]).toMatchObject({ varaq: 'Лист3', rol: 'erkin', sonliQatorlar: 6, engKattaSumma: { qiymat: 268, yorliq: 'Итого', manzil: { qator: 7 } } });
    expect(a.tushunilmadi[0].taklif).toMatch(/hajm jadvali/);
    expect(a.review.some((r) => r.kod === 'tushunilmadi')).toBe(true);
  });

  it('kam sonli varaq yoki o‘qilgan varaq — darvozaga tushmaydi', () => {
    const a = kitobAnatomiyasi({ fayl: 'j.xlsx', varaqlar: [{ nom: 'Лист3', rows: FAQAT_SONLAR.slice(0, 4) }, { nom: 'трансп.', rows: TKM }] });
    expect(a.tushunilmadi).toEqual([]);
  });

  it('kitobHamrohlari — UI uchun yengil kirish, kitobAnatomiyasi bilan bir xil natija', () => {
    const k = { fayl: 'yol.xlsx', varaqlar: [{ nom: 'сводн.', rows: SVODN, formulalar: SVODN_F }, { nom: 'трансп.', rows: TKM }] };
    const a = kitobAnatomiyasi(k);
    const h = kitobHamrohlari(k);
    expect(h.erkin).toEqual(a.erkin);
    expect(h.svod).toEqual(a.svod);
    expect(h.tushunilmadi).toEqual(a.tushunilmadi);
  });
});
