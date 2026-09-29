import { describe, expect, it } from 'vitest';
import { kitobAnatomiyasi, sarlavhaYoli } from './index';
import { son } from './matn';
import type { Katak } from './turlar';

/** ABC4 lokal LRV shakli (sintetik, real fayl tuzilmasidan). */
const ABC4_LRV: Katak[][] = [
  ['НАИМЕНОВАНИЕ СТРОЙКИ: НАВОИЙ'],
  ['НАИМЕНОВАНИЕ ОБЪЕКТА: ИСКУССТВЕННАЯ ОЗЕРА'],
  [],
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 01-04'],
  ['КОЛОДЦЕВ (ПРОФИЛЬ К1)'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО'],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ'],
  [1, 2, 3, 4, 5, 6],
  ['РАЗДЕЛ: КОЛОДЕЦ (ЛИСТ .-39)'],
  ['ЗЕМЛЯНЫЕ РАБОТЫ'],
  ['1', 'E1-1-195-20', 'РАЗРАБОТКА ГРУНТА', '1000М3', '0,01017'],
  ['1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '5,02', '0,0510534'],
  ['1.2', '001942', 'ЭКСКАВАТОРЫ', 'МАШ-Ч', '10,59', null],
  ['КОЛОДЕЦ К1'],
  ['2', '615-1', 'БЕТОН КЛ. В12,5', 'М3', '3,6'],
  ['ВЕДОМОСТЬ РЕСУРСОВ'],
  ['ТРУДОВЫЕ РЕСУРСЫ'],
  ['1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '323,19'],
  [null, null, 'Составил: ____ САМАТОВ'],
];

/** Faravon "БВ"/"БР" shakli: titul izohlari, bir xil sarlavha. */
const FARAVON_BR: Katak[][] = [
  [null, 'НА СТРОИТЕЛЬСТВО ДОРОГИ'],
  [null, '(наименование стройки)'],
  ['на', 'ДОРОЖНАЯ ОДЕЖДА. УЧАСТОК №1.'],
  [null, '(наименование работ и затрат, наименование объекта)'],
  ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество ', 'Сметная стоимость'],
  [null, null, null, null, null, 'в текущем (прогнозном)'],
  [null, null, null, null, null, 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7],
  [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'],
  ['1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 12315.2466, 29421.2, 362329333],
  [null, 'ИТОГО ПО ТРУДОВЫМ РЕСУРСАМ:', null, 'СУМ', null, null, 362329333],
];

/** T1 LRV_PLUS markerli qator: RZ nomi A ustunida, T2 aniqlagan nom ustuni C bo'sh. */
const T1_LRV_PLUS_RZ: Katak[][] = [
  ['НАИМЕНОВАНИЕ ОБЪЕКТА: ИСКУССТВЕННОЕ ОЗЕРА'],
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 01'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'ЦЕНА', 'СУММА', null],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', null, null, null],
  [1, 2, 3, 4, 5, 6, 7, 8, null],
  ['СМЕТА № 01 НА ТЕПЛОВЫЕ СЕТИ', null, null, null, null, null, null, 0, 'rz'],
  ['РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ', null, null, null, null, null, null, 0, 'rz'],
  ['1', 'E1-1-1', 'РАЗРАБОТКА ГРУНТА', '1000М3', null, 1, 100, 100, 'bl'],
  ['1.1', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 1, 1, 10, 10, 'rs'],
  ['РАЗДЕЛ: ТЕПЛОВЫЕ СЕТИ', null, null, null, null, null, null, 0, 'rz'],
  ['2', 'E2-1-1', 'УСТАНОВКА ТРУБ', 'М', null, 2, 50, 100, 'bl'],
  ['2.1', '000002', 'МАШИНЫ И МЕХАНИЗМЫ', 'МАШ-Ч', 2, 2, 5, 10, 'rs'],
  ['РАЗДЕЛ: ОТДЕЛОЧНЫЕ РАБОТЫ', null, null, null, null, null, null, 0, 'rz'],
  ['3', 'E3-1-1', 'ОТДЕЛКА ПОВЕРХНОСТЕЙ', 'М2', null, 3, 20, 60, 'bl'],
  ['3.1', '000003', 'МАТЕРИАЛ', 'КГ', 3, 9, 2, 18, 'rs'],
];

/** T2 LRV_PLUS export: Uzbek Cyrillic headers, explicit row type, 24 metadata columns. */
const T2_LRV_PLUS: Katak[][] = [
  ['Fast Food 1-etaj'],
  ['№', 'КОД', 'НАИМЕНОВАНИЕ', 'ЕД.ИЗМ.', 'ҲАЖМ (ед)', 'ҲАЖМ (жами)', 'НАРХ', 'СУММА', 'ТИП', 'ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К', 'ФАКТ ҳажм', 'ОСТАТКА ҳажм', 'F2 ОЛИНГАН ҳажм', 'F2 ОЛИНИШИ МУМКИН ҳажм', 'ФАКТ сумма', 'ОСТАТКА сумма', 'F2 ОЛИНГАН сумма', 'F2 ОЛИНИШИ МУМКИН сумма', 'Даража', 'КАЛИТ'],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, null, 'LRV.xlsx — LRV', null, 0, 0, 0, 0, 'rz'],
  [2, null, 'ЗЕМЛЯНЫЕ РАБОТЫ', null, 0, 0, 0, 0, 'rz'],
  [3, 'W-1', 'УСТРОЙСТВО БЕТОННЫХ РАБОТ', 'м3', null, 2, 6, 12, 'bl'],
  [4, '000001', 'ЗАТРАТЫ ТРУДА', 'чел-ч', 1, 2, 1, 2, 'rs'],
  [5, '000002', 'БЕТОН', 'м3', 0.5, 1, 10, 10, 'mat'],
  [6, 'W-2', 'МОНТАЖ ОБОРУДОВАНИЯ', 'шт', null, 1, 4, 4, 'bl'],
  [7, '000003', 'ОБОРУДОВАНИЕ', 'шт', 1, 1, 4, 4, 'ob'],
  [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, 16, null],
];

describe('varaq anatomiyasi', () => {
  it('ABC4 LRV: rol, titul yo\'li, ish/resurs, vergulli son, NULL saqlanadi, vedomost ajraladi', () => {
    const a = kitobAnatomiyasi({ fayl: 'k.xls', varaqlar: [{ nom: 'LRV', rows: ABC4_LRV }] });
    const v = a.varaqlar[0];
    expect(v.rol).toBe('lrv');
    expect(v.ishlar.map((i) => i.tartib)).toEqual(['1', '2']);
    const ish = v.ishlar[0];
    expect(ish.hajm).toBe(0.01017);
    expect(ish.resurslar[0]).toMatchObject({ normaBirlikka: 5.02, hajm: 0.0510534 });
    expect(ish.resurslar[1].hajm).toBeNull(); // bo'sh katak 0 EMAS
    const barcha = [...v.titul, ...v.sarlavhalar];
    expect(sarlavhaYoli(barcha, ish.sarlavha).map((s) => s.xom))
      .toEqual(['ИСКУССТВЕННАЯ ОЗЕРА', 'КОЛОДЦЕВ (ПРОФИЛЬ К1)', 'РАЗДЕЛ: КОЛОДЕЦ (ЛИСТ .-39)', 'ЗЕМЛЯНЫЕ РАБОТЫ']);
    expect(sarlavhaYoli(barcha, v.ishlar[1].sarlavha).at(-1)!.xom).toBe('КОЛОДЕЦ К1');
    expect(v.titul.find((s) => s.tur === 'lokal')!.belgi).toBe('№ 01-04');
    expect(v.vedomost).toHaveLength(1);
    expect(v.vedomost[0].guruh).toBe('ТРУДОВЫЕ РЕСУРСЫ');
    expect(v.ishlar[0].manzil).toMatchObject({ varaq: 'LRV', qator: 11, ustun: 3 });
    expect(v.review).toEqual([]);
  });

  it('.xls ЛРВ: nom sarlavhasida "масса" bo‘lsa ham nom ustuni to‘g‘ri, miqdor ustuni nomga tushmaydi', () => {
    const rows: Katak[][] = [
      ['ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ № 35-24'],
      ['№ п/п', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат, характеристика оборудования и его масса, расход ресурсов на единицу измерения', 'Единица измерения', 'Количество', null, 'Сметная стоимость', null],
      [null, null, null, null, 'на единицу измерения', 'по проектным данным', 'на единицу измерения', 'общая'],
      [1, 2, 3, 4, 5, 6, 7, 8],
      ['1', 'Е01-01-004-5', 'ТРАНЩЕЯ КОЛОДЕЦ ЭКСКОВАТОРОМ', '1000 М3', null, '0,0542', '5021985,26', '272191,60'],
      ['1.1', '00001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-ЧАС', '12,86', '0,69701', '15101,47', '10525,91'],
    ];
    const v = kitobAnatomiyasi({ fayl: 'pe.xls', varaqlar: [{ nom: 'Локально-ресурсная ведомости', rows }] }).varaqlar[0];
    expect(v.ustunlar).toMatchObject({ nom: 2, hajmBirlikka: 4, hajmLoyiha: 5, narx: 6, summa: 7 });
    expect(v.ishlar[0].resurslar[0]).toMatchObject({ xom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', normaBirlikka: 12.86, hajm: 0.69701 });
  });

  it('RES ro‘yxati № ustunisiz, ИТОГО yozuvi o‘chgan jami va bo‘sh shablon qatorlari (Amfiteatr)', () => {
    const rows: Katak[][] = [
      ['НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА ЗА ЕД.', 'СУММА (сум)'],
      [2, 3, 4, 5, 6],
      ['ЗАТРАТЫ ТРУДА'],
      ['ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'ЧЕЛ-Ч', 100, 30, 3000],
      [null, 'СУМ', null, null, 3000],
      ['СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
      ['АВТОПОГРУЗЧИКИ 5 Т', 'МАШ-Ч', 2, 500, 1000],
      ['БУЛЬДОЗЕРЫ', 'МАШ-Ч', 1, 700, 700],
    ];
    const v = kitobAnatomiyasi({ fayl: 'amf.xlsx', varaqlar: [{ nom: '9-Этаж', rows }] }).varaqlar[0];
    expect(v.rol).toBe('res');
    expect(v.vedomost.map((r) => r.xom)).toEqual(['ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'АВТОПОГРУЗЧИКИ 5 Т', 'БУЛЬДОЗЕРЫ']);
    expect(v.jamilar.some((j) => j.qiymat === 3000)).toBe(true);
    expect(v.review.filter((r) => r.kod === 'noaniq_qator')).toEqual([]);
  });

  it('T1 LRV_PLUS: selected nom ustuni bo\'sh bo\'lsa, aniq RZ markeridan oldingi nomni olib ichma-ich yo\'lni saqlaydi', () => {
    const v = kitobAnatomiyasi({ fayl: 'lrv-plus.xlsx', varaqlar: [{ nom: 'LRV', rows: T1_LRV_PLUS_RZ }] }).varaqlar[0];
    expect(v.ustunlar?.nom).toBe(2);
    expect(v.sarlavhalar.map((s) => s.xom)).toEqual([
      'СМЕТА № 01 НА ТЕПЛОВЫЕ СЕТИ',
      'РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ',
      'РАЗДЕЛ: ТЕПЛОВЫЕ СЕТИ',
      'РАЗДЕЛ: ОТДЕЛОЧНЫЕ РАБОТЫ',
    ]);
    expect(v.ishlar).toHaveLength(3);
    expect(v.ishlar.map((ish) => sarlavhaYoli(v.sarlavhalar, ish.sarlavha).map((s) => s.xom))).toEqual([
      ['СМЕТА № 01 НА ТЕПЛОВЫЕ СЕТИ', 'РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ'],
      ['СМЕТА № 01 НА ТЕПЛОВЫЕ СЕТИ', 'РАЗДЕЛ: ТЕПЛОВЫЕ СЕТИ'],
      ['СМЕТА № 01 НА ТЕПЛОВЫЕ СЕТИ', 'РАЗДЕЛ: ОТДЕЛОЧНЫЕ РАБОТЫ'],
    ]);
    expect(v.sarlavhalar.every((s) => s.manzil.ustun === 1 && s.dalil.some((d) => d.qoida === 't1_lrv_plus_rz_nom_fallback'))).toBe(true);
    expect(v.jamilar).toEqual([]); // RZ subtotal-like 0 values never become F2 money rows.
    expect(v.review.filter((r) => r.kod === 'rz_nomsiz')).toEqual([]);
  });

  it('T2 LRV_PLUS: TIP dalili va Uzbek Cyrillic hajm/narx ustunlari bilan daraxtni topadi', () => {
    const a = kitobAnatomiyasi({ fayl: 'Fast-Food-LRV_PLUS.xlsx', varaqlar: [{ nom: 'LRV_PLUS', rows: T2_LRV_PLUS }] });
    const v = a.varaqlar[0];
    expect(v.rol).toBe('lrv');
    expect(v.rolDalil).toContainEqual(expect.objectContaining({ qoida: 'lrv_plus:tip_va_qator_turlari', ishonch: 'yuqori' }));
    expect(v.ustunlar).toMatchObject({ tartib: 0, shifr: 1, nom: 2, birlik: 3, hajmBirlikka: 4, hajmLoyiha: 5, narx: 6, summa: 7 });
    expect(v.ishlar.map((work) => work.shifr)).toEqual(['W-1', 'W-2']);
    expect(v.ishlar.map((work) => work.resurslar.length)).toEqual([1, 0]);
    expect(v.mustaqilResurslar?.map((resource) => resource.texnikBelgi)).toEqual(['mat', 'ob']);
    expect(sarlavhaYoli(v.sarlavhalar, v.ishlar[0].sarlavha).map((section) => section.xom)).toEqual(['LRV.xlsx — LRV', 'ЗЕМЛЯНЫЕ РАБОТЫ']);
    expect(a.asosiyLrv).toBe('LRV_PLUS');
  });

  it('markerli RZ dagi qisqa, lekin mazmunli nomni (masalan, POL) saqlaydi', () => {
    const rows = T1_LRV_PLUS_RZ.map((row) => [...row]);
    rows[12][0] = 'ПОЛ';
    const v = kitobAnatomiyasi({ fayl: 'lrv-plus.xlsx', varaqlar: [{ nom: 'LRV', rows }] }).varaqlar[0];
    expect(v.sarlavhalar.some((s) => s.xom === 'ПОЛ' && s.manzil.qator === 13)).toBe(true);
  });

  it('Faravon БР: sarlavhasi LRV ga o\'xshasa ham ma\'lumot shakli bo\'yicha RES', () => {
    const a = kitobAnatomiyasi({ fayl: 'f.xlsx', varaqlar: [{ nom: '4230_БР', rows: FARAVON_BR }] });
    const v = a.varaqlar[0];
    expect(v.rol).toBe('res');
    expect(v.ustunlar).toMatchObject({ tartib: 0, shifr: 1, nom: 2, birlik: 3, hajmLoyiha: 4, narx: 5, summa: 6 });
    expect(v.vedomost[0]).toMatchObject({ xom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', hajm: 12315.2466, narx: 29421.2, summa: 362329333, guruh: 'ТРУДОВЫЕ РЕСУРСЫ' });
    expect(v.jamilar[0].qiymat).toBe(362329333);
  });

  it('TN titul "ВЕДОМОСТЬ ПОТРЕБНЫХ РЕСУРСОВ" — guruhsiz bo\'lsa ham RES', () => {
    const rows: Katak[][] = [
      ['ВЕДОМОСТЬ ПОТРЕБНЫХ РЕСУРСОВ'],
      ['N п.п.', 'Шифр', 'Наименование работ и затрат', 'Единица измерения', 'Количество', 'Цена'],
      [1, 2, 3, 4, 5, 6],
      ['1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 12.5, 29421.2],
    ];
    const v = kitobAnatomiyasi({ fayl: 't.xlsx', varaqlar: [{ nom: 'Лист1', rows }] }).varaqlar[0];
    expect(v.rol).toBe('res');
    expect(v.rolDalil.some((d) => d.qoida === 'titul')).toBe(true);
    expect(v.vedomost).toHaveLength(1);
  });

  it('F5_UZB va LRV bir xil ishlar bersa — biri asosiy, biri dublikat', () => {
    const a = kitobAnatomiyasi({ fayl: 'k.xls', varaqlar: [{ nom: 'F5_UZB', rows: ABC4_LRV }, { nom: 'LRV', rows: ABC4_LRV }] });
    expect(a.asosiyLrv).toBe('F5_UZB');
    expect(a.dublikat).toEqual([{ varaq: 'LRV', asl: 'F5_UZB', sabab: expect.any(String) }]);
  });
});

describe('son', () => {
  it('vergul, bo\'shliq, qavs; son emas → null', () => {
    expect(son('0,0510534')).toBe(0.0510534);
    expect(son('1 234,5')).toBe(1234.5);
    expect(son('(12)')).toBe(-12);
    expect(son('')).toBeNull();
    expect(son('ЦЕНА')).toBeNull();
    expect(son('1.2.3')).toBeNull();
  });
});
