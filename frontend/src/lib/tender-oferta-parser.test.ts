import { describe, expect, it } from 'vitest';
import { ofertaResursVaraqlariniAniqla, ofertaTanlanganQatorlari } from './tender-oferta-parser';
import { ofertaHisobla } from './tender-oferta';
import type { SheetGrid, XlsxWorkbook } from './f2-import-parse';

function workbook(sheets: Array<{ name: string; rows: unknown[][] }>): XlsxWorkbook {
  const list = sheets.map((sheet) => ({ ...sheet, rows: sheet.rows as SheetGrid, merges: [] }));
  return { sheets: list, sheet: (name: string) => list.find((s) => s.name === name) ?? null };
}

const TN_HEADER = [
  ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество ', 'Сметная стоимость'],
  [null, null, null, null, null, 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7],
];

describe('tender oferta RES parseri V2', () => {
  it('kodsiz RES satrlarini saqlaydi, LRV varag‘ini ajratadi', () => {
    const wb = workbook([
      { name: 'RES-MAT', rows: [
        ['№', 'Наименование ресурсов', 'Единица измерения', 'Количество', 'Сметная стоимость на ед. изм.', 'Общая стоимость'],
        [1, 'Бетон B25', 'м3', 10, 123.45, 1234.49],
        [2, 'Вода', 'м3', 2, 8.5, 17],
      ] },
      { name: 'Локальная смета', rows: [
        ['Шифр', 'Наименование работ и затрат', 'Единица измерения', 'Количество', 'Сметная стоимость'],
        ['E1', 'Земляные работы', 'м3', 10, 1000],
      ] },
    ]);
    const result = ofertaResursVaraqlariniAniqla(wb);
    const res = result.find((s) => s.nom === 'RES-MAT')!;
    expect(res.role).toBe('res');
    expect(res.qatorlar).toHaveLength(2);
    expect(res.qatorlar[0]).toMatchObject({ shifr: null, hajm: 10, smetaBirlikNarx: 123.45, smetaSumma: 1234.49, rol: 'RESOURCE', hisobTuri: 'birlik', manbaHajmSon: true });
    expect(result.find((s) => s.nom === 'Локальная смета')?.role).toBe('lrv');
    expect(ofertaTanlanganQatorlari(result, ['RES-MAT'])).toHaveLength(2);
  });

  it('T1 LRV_PLUS (ТИП rz/bl/rs) RES deb adashtirilmaydi', () => {
    const wb = workbook([{ name: 'Suniy kol', rows: [
      ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'Сметная стоимость'],
      ['РАЗДЕЛ 1', null, null, null, null, null, null, null, null, 'rz'],
      [1, 'E11', 'УСТРОЙСТВО', '100М2', 1, null, null, 100, null, 'bl'],
      [1.1, '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 2, 2, 10, 20, null, 'rs'],
      [2, 'E12', 'УСТРОЙСТВО 2', '100М2', 1, null, null, 100, null, 'bl'],
      [2.1, '011004', 'ПЕСОК', 'М3', 3, 3, 10, 30, null, 'rs'],
    ] }]);
    expect(ofertaResursVaraqlariniAniqla(wb)[0].role).toBe('lrv');
  });

  it('TN ko‘p paketli RES: jami zanjiri manba summasi bo‘yicha bog‘lanadi, hosila va INFO ajraladi', () => {
    const rows = [
      ...TN_HEADER,
      [null, null, 'ТРУДОВЫЕ РЕСУРСЫ'],
      [1, 1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 10, 100, 1000],
      [2, 3, 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЧЕЛ.-Ч', 5, '--', '--'],
      [2, 4, 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ (0)', 'ЧЕЛ.-Ч', 7, 0, 0],
      [2, 5, 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ (bo‘sh)', 'ЧЕЛ.-Ч', 8, null, null],
      [null, 'ИТОГО ПО ТРУДОВЫМ РЕСУРСАМ:', null, 'СУМ', null, null, 1000],
      [null, null, 'МАТЕРИАЛЬНЫЕ РЕСУРСЫ'],
      [3, 'С', 'ПЕСОК', 'М3', 10, 50, 500],
      [4, 'С', 'КАБЕЛЬ СИЛОВОЙ', 'КМ', 1, 300, 300],
      [5, 'С', 'УСТАНОВКА. ДОСТАВКА И СТОИМОСТЬ ПАНЕЛЕЙ', 'КОМПЛ', 1, 200, 200],
      [null, 'ИТОГО ', null, 'СУМ', null, null, 1000],
      [null, 'ИТОГО ТРАНСПОРТНЫ РАСХОДЫ ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', null, 'СУМ', null, null, 35],
      [null, 'ИТОГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:', null, 'СУМ', null, null, 1035],
      [null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', null, 'СУМ', null, null, 2035],
      [],
      ['НБШ'],
      ...TN_HEADER,
      [null, null, 'ОБОРУДОВАНИЕ'],
      [1, null, 'ТЕЛЕВИЗОР', 'ШТ', 2, 100, 200],
      [null, 'ИТОГО ОБОРУДОВАНИЕ:', null, 'СУМ', null, null, 200],
    ];
    const [s] = ofertaResursVaraqlariniAniqla(workbook([{ name: 'RES', rows }]));
    const by = (nom: string) => s.qatorlar.find((q) => q.nom.trim() === nom)!;
    expect(s.role).toBe('res');
    expect(by('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ')).toMatchObject({ rol: 'RESOURCE', kategoriya: 'ЧЕЛ', kategoriyaManbasi: 'birlik' });
    expect(by('ЗАТРАТЫ ТРУДА МАШИНИСТОВ').rol).toBe('INFO');
    // Mashinistning o‘z narxi bo‘lmaydi: 0 yoki bo‘sh ham “narxsiz” emas, INFO.
    expect(by('ЗАТРАТЫ ТРУДА МАШИНИСТОВ (0)').rol).toBe('INFO');
    expect(by('ЗАТРАТЫ ТРУДА МАШИНИСТОВ (bo‘sh)').rol).toBe('INFO');
    expect(by('ПЕСОК')).toMatchObject({ kategoriya: 'МАТ', kategoriyaManbasi: 'bolim' });
    expect(by('КАБЕЛЬ СИЛОВОЙ')).toMatchObject({ kategoriya: 'КАБ', kategoriyaManbasi: 'nom' });
    // Nomida ДОСТАВКА bor, lekin hajm+narx — haqiqiy resurs.
    expect(by('УСТАНОВКА. ДОСТАВКА И СТОИМОСТЬ ПАНЕЛЕЙ').rol).toBe('RESOURCE');
    expect(by('ИТОГО ТРАНСПОРТНЫ РАСХОДЫ ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:')).toMatchObject({ rol: 'TRANSPORT', hosila: true });
    const itogoMat = s.qatorlar.find((q) => q.nom.trim() === 'ИТОГО')!;
    expect(itogoMat.jamiMoslik).toBe('summa');
    expect(itogoMat.jamiBolalari).toHaveLength(3);
    const poMat = by('ИТОГО ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:');
    expect(poMat.jamiBolalari).toEqual([itogoMat.sourceId, by('ИТОГО ТРАНСПОРТНЫ РАСХОДЫ ПО СТРОИТЕЛЬНЫМ МАТЕРИАЛАМ:').sourceId]);
    const pryamye = by('ИТОГО ПРЯМЫЕ ЗАТРАТЫ');
    expect(pryamye).toMatchObject({ rol: 'GRAND_TOTAL', jamiMoslik: 'summa' });
    expect(pryamye.jamiBolalari).toEqual([by('ИТОГО ПО ТРУДОВЫМ РЕСУРСАМ:').sourceId, poMat.sourceId]);
    // Takroriy sarlavha resurs bo‘lmaydi; ikkinchi paket o‘z jamisiga ega.
    expect(s.qatorlar.some((q) => /НАИМЕНОВАНИЕ/.test(q.nom))).toBe(false);
    expect(by('ТЕЛЕВИЗОР')).toMatchObject({ kategoriya: 'ОБ' });
    expect(by('ИТОГО ОБОРУДОВАНИЕ:').jamiMoslik).toBe('summa');

    // Pul: faqat barglar; jami va hosila qayta qo‘shilmaydi.
    const h = ofertaHisobla(s.qatorlar, { sozlama: { rejim: 'foiz', yon: 'pasaytirish', foiz: 0 } });
    expect(h.togridanJami).toBe(1000 + 500 + 300 + 200 + 200);
    expect(h.manbaTogridanJami).toBe(2200);
  });

  it('manba jamisi bolalar yig‘indisiga teng bo‘lmasa taxmin qilinmaydi (mos_emas)', () => {
    const [s] = ofertaResursVaraqlariniAniqla(workbook([{ name: 'RES', rows: [
      ...TN_HEADER,
      [null, null, 'ОБОРУДОВАНИЕ'],
      [1, null, 'МУФТА', 'КОМПЛ', 8, 3000000, 24000000],
      [2, null, 'ОГРАНИЧИТЕЛЬ', 'ШТ', 6, 200000, 1200000],
      [null, 'ИТОГО ОБОРУДОВАНИЕ:', null, 'СУМ', null, null, 25000000],
    ] }]));
    const t = s.qatorlar.find((q) => q.rol === 'SUBTOTAL')!;
    expect(t.jamiMoslik).toBe('mos_emas');
    expect(t.jamiBolalari).toEqual([]);
  });

  it('narxsiz ABC (0 summa): oddiy ИТОГО tuzilma bo‘yicha, ВСЕГО МАТЕРИАЛОВ taxmin qilinmaydi; ИНЕРТНЫЕ → БЕЗСКЛАД taklifi', () => {
    const [s] = ofertaResursVaraqlariniAniqla(workbook([{ name: 'RES', rows: [
      ['№№', 'РЕСУРС', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РЕСУРСА', 'ЕД.ИЗМ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
      [1, 2, 3, 4, 5, 6, 7, 8],
      ['МАТЕРИАЛЬНЫЕ РЕСУРСЫ'],
      [1, '045021', null, 'ЦЕМЕНТ', 'Т', 2, 0, 0],
      [null, null, null, 'ИТОГО', 'СУМ', null, null, 0],
      [null, null, null, 'ВСЕГО', 'СУМ', null, null, 0],
      ['ИНЕРТНЫЕ МАТЕРИАЛЫ'],
      [1, '011004', null, 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ', 'М3', 5, 0, 0],
      [null, null, null, 'ИТОГО', 'СУМ', null, null, 0],
      [null, null, null, 'ВСЕГО МАТЕРИАЛОВ', 'СУМ', null, null, 0],
    ] }]));
    const itogo = s.qatorlar.filter((q) => q.nom === 'ИТОГО');
    expect(itogo.every((q) => q.jamiMoslik === 'tuzilma' && q.jamiBolalari?.length === 1)).toBe(true);
    expect(s.qatorlar.find((q) => q.nom === 'ВСЕГО')!.jamiBolalari).toEqual([itogo[0].sourceId]);
    expect(s.qatorlar.find((q) => q.nom === 'ВСЕГО МАТЕРИАЛОВ')!.jamiMoslik).toBe('mos_emas');
    const pesok = s.qatorlar.find((q) => q.nom.startsWith('ПЕСОК'))!;
    expect(pesok).toMatchObject({ kategoriya: 'UNKNOWN', kategoriyaTaklifi: 'БЕЗСКЛАД' });
    // Narx ANIQ 0 — taklif 0 + ogohlantirish; UNKNOWN kategoriya (ПЕСОК) — faqat o‘zi ro‘yxatda, yakuniy ko‘rinadi.
    const h = ofertaHisobla(s.qatorlar, { sozlama: { rejim: 'foiz', yon: 'pasaytirish', foiz: 10 } });
    expect(h.yakuniyOferta).not.toBeNull();
    expect(h.halQilinmagan).toBeGreaterThan(0);
    expect(h.qatorlar.find((q) => q.nom === 'ЦЕМЕНТ')!.muammolar).toContain('SMETA_NARXI_NOL');
  });

  it('RES va RES_A ayni ko‘rinish bo‘lsa, ikki marta tanlanmaydi', () => {
    const rows = [
      ['№', 'Код', 'Наименование ресурса', 'Ед. изм.', 'Количество', 'Цена за ед.', 'Сумма'],
      [1, 'M-1', 'Цемент', 'т', 2, 100, 200],
      [2, 'M-2', 'Песок', 'м3', 3, 50, 150],
      ['', '', 'ИТОГО', 'СУМ', '', '', 350],
    ];
    const altRows = [
      ['№', 'Наименование ресурса', 'Ед. изм.', 'Количество', 'Цена за ед.', 'Сумма'],
      [1, 'Цемент', 'т', 2, 100, 200],
      [2, 'Песок', 'м3', 3, 50, 150],
      ['', 'ИТОГО', 'СУМ', '', '', 350],
    ];
    const result = ofertaResursVaraqlariniAniqla(workbook([{ name: 'RES', rows }, { name: 'RES_A', rows: altRows }]));
    expect(result.find((s) => s.nom === 'RES_A')?.alternativVaraq).toBe('RES');
    expect(ofertaTanlanganQatorlari(result, ['RES', 'RES_A'])).toHaveLength(3);
  });

  it('RESURS_VEDOMOST: nom ustuni “Resurs”, kategoriya “МАТ (n resurs)” qatoridan olinadi', () => {
    const [s] = ofertaResursVaraqlariniAniqla(workbook([{ name: 'RESURS_VEDOMOST', rows: [
      ['Kategoriya', 'Kod', 'Resurs', 'Birlik', 'Smeta hajm', 'Smeta summa'],
      ['ЧЕЛ (1 resurs)', null, null, null, null, 2261477091.47],
      [null, '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 76865.56, 2261477091.47],
      ['МАТ (2 resurs)', null, null, null, null, 300],
      [null, 'С', 'АР-РА А-I D-6ММ', 'Т', 1, 100],
      [null, 'ЦЕНА', 'БИТУМ', 'Т', 2, 200],
    ] }]));
    expect(s.role).toBe('res');
    const res = s.qatorlar.filter((q) => q.rol === 'RESOURCE');
    expect(res.map((q) => q.nom)).toEqual(['ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'АР-РА А-I D-6ММ', 'БИТУМ']);
    expect(res.map((q) => q.kategoriya)).toEqual(['ЧЕЛ', 'МАТ', 'МАТ']);
    expect(res[1].kategoriyaManbasi).toBe('vedomost');
    expect(res.every((q) => q.hisobTuri === 'manba_jami')).toBe(true);
  });
});
