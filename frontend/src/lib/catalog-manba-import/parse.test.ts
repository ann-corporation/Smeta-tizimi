import { describe, expect, it } from 'vitest';
import { catalogQatorlariniApiFormatga, mashinaSoatTahliliniCatalogga, tahlilKatalogXlsx, tahlilMashinaSoatMatni } from './parse';
import type { XlsxWorkbook } from '../f2-import-parse/xlsxReader';
import type { CellValue } from '../f2-import-parse/types';

function wb(sheets: Array<{ name: string; rows: CellValue[][] }>): XlsxWorkbook {
  const all = sheets.map(s => ({ ...s, merges: [] }));
  return { sheets: all, sheet: name => all.find(s => s.name === name) ?? null };
}

describe('catalog-manba-import', () => {
  it('material katalogining NDS variantlari va noma’lum narxni 0 qilmasdan ajratadi', () => {
    const result = tahlilKatalogXlsx(wb([{
      name: 'г. Ташкент, сум',
      rows: [
        ['№ п/п', 'Наименование продукции', 'Ед. изм.', 'Цена с НДС', 'Цена без НДС'],
        ['1', 'Beton B25', 'м3', '1 200 000,00', '1 000 000,00'],
        ['2', 'Armatura', 'т', '-', '4,250,000'],
        ['3', 'Bo‘lim sarlavhasi', '', '', ''],
      ],
    }, { name: 'Izoh', rows: [['Faqat ma’lumot'], ['Qayta import qilinmaydi']] }]), 'Каталог 1 кв. 2026.xls');
    expect(result.turi).toBe('material_katalog');
    // 2026-10-01 (Claude): "-" ustuni yozilmaydi (0 ham emas, bo'sh qator ham emas); mahsulotning HECH narxi
    // bo'lmasa — bitta NULL qator PRICE_MISSING bilan ko'rinib turadi.
    expect(result.qatorlar).toHaveLength(3);
    expect(result.qatorlar.find(q => q.nom === 'Beton B25' && q.narxVarianti === 'nds_bilan')?.narx).toBe(1200000);
    expect(result.qatorlar.find(q => q.nom === 'Beton B25' && q.narxVarianti === 'nds_siz')?.narx).toBe(1000000);
    expect(result.qatorlar.find(q => q.nom === 'Armatura' && q.narxVarianti === 'nds_bilan')).toBeUndefined();
    expect(result.qatorlar.find(q => q.nom === 'Armatura' && q.narxVarianti === 'nds_siz')?.narx).toBe(4250000);
    expect(result.qatorlar.some(q => q.narx === 0)).toBe(false);
    expect(result.varaqlar.find(v => v.nom === 'Izoh')?.rol).toBe('noma_lum');
  });

  it('ish haqi katalogini materialdan alohida, bazaviy va ijtimoiy ustunlar bilan chiqaradi', () => {
    const result = tahlilKatalogXlsx(wb([{
      name: '2 квартал',
      rows: [
        ['Среднечасовая заработная плата рабочих-строителей', null, null, null],
        ['№', 'Регионы', '2026 год 2 квартал', 'Соц. страх. 12 %', 'Соц. страх. 25 %'],
        ['1', 'г. Ташкент', '25 000,50', '28 000,56', '31 250,63'],
        ['2', 'Самаркандская область', '-', '-', '-'],
      ],
    }]), 'Иш хаки 2-кв 2026 йил.xls');
    expect(result.turi).toBe('ish_haqi');
    expect(result.qatorlar).toHaveLength(6);
    expect(result.qatorlar.filter(q => q.hudud === 'г. Ташкент').map(q => q.narx)).toEqual([25000.5, 28000.56, 31250.63]);
    expect(result.qatorlar.filter(q => q.hudud === 'Самаркандская область').every(q => q.narx === null)).toBe(true);
    expect(result.qatorlar.every(q => q.birlik === 'ЧЕЛ.-Ч')).toBe(true);
    expect(result.qatorlar.some(q => q.narxVarianti === 'ijtimoiy_12')).toBe(true);
  });

  it('davrni fayl nomidan oladi va sourceKey row numberga tayanmaydi', () => {
    const a = tahlilKatalogXlsx(wb([{ name: 'г. Ташкент, сум', rows: [
      ['№', 'Наименование продукции', 'Ед. изм.', 'Цена с НДС'], ['1', 'A', 'шт', '100'],
    ] }]), 'Каталог 2026 1-квартал.xls');
    const b = tahlilKatalogXlsx(wb([{ name: 'г. Ташкент, сум', rows: [
      ['№', 'Наименование продукции', 'Ед. изм.', 'Цена с НДС'], ['cover', '', '', ''], ['1', 'A', 'шт', '100'],
    ] }]), 'Каталог 2026 1-квартал.xls');
    expect(a.davr).toMatchObject({ yil: 2026, kvartal: 1 });
    expect(a.qatorlar[0].sourceKey).toBe(b.qatorlar[0].sourceKey);
    expect(a.qatorlar[0].sourceKey).not.toContain('|2|');
  });

  it('mashina-soat PDF matn adapteri qatorlarni faqat birlik bilan ajratadi', () => {
    const result = tahlilMashinaSoatMatni('Машин и механизмов на 01.01.2025г..pdf', [
      'Цены на машины и механизмы',
      '1 Экскаватор на гусеничном ходу 0,65 м3 маш.-ч 184 531',
      '2 Кран автомобильный 25 т маш.-ч 145 212',
      'Итого 329 743',
    ].join('\n'));
    expect(result.turi).toBe('mashina_soat');
    expect(result.importgaTayyor).toBe(true);
    expect(result.qatorlar).toHaveLength(2);
    expect(result.qatorlar[0].narx).toBe(184531);
    expect(result.qatorlar[0].birlik).toBe('МАШ.-Ч');
    expect(mashinaSoatTahliliniCatalogga(result).turi).toBe('mashina_soat');
  });

  it('API payload provenance va NULL qiymatni saqlaydi', () => {
    const result = tahlilKatalogXlsx(wb([{ name: '1 квартал', rows: [
      ['№', 'Регионы', '2026 год 1 квартал', 'Соц. страх. 12 %'], ['1', 'Ташкент', '200', '-'],
    ] }]), 'Иш хаки 1 кв 2026.xls');
    const api = catalogQatorlariniApiFormatga(result.qatorlar);
    expect(api[0].narx).toBe(200);
    expect(api[1].narx).toBeNull();
    expect(api[0].izoh).toContain('sourceKey');
    expect(api.some(q => q.izoh?.includes('ijtimoiy_12'))).toBe(true);
  });

  it('real katalog tuzilishi: 3 qatorli sarlavha (НДС + sana), raqamlash, guruh, izoh — faqat mahsulotlar', () => {
    const r = tahlilKatalogXlsx(wb([{
      name: 'г. Ташкент, сум',
      rows: [
        ['№ п/п', 'Наименование выпускаемой продукции', 'Ед. изм', 'Отпускная цена, сум', 'Отпускная цена, сум', 'Отпускная цена, сум', 'Отпускная цена, сум'],
        ['№ п/п', 'Наименование выпускаемой продукции', 'Ед. изм', 'с НДС', 'с НДС', 'без НДС', 'без НДС'],
        ['№ п/п', 'Наименование выпускаемой продукции', 'Ед. изм', '01.08.2025', '01.09.2025', '01.08.2025', '01.09.2025'],
        ['1', '2', '3', '4', '5', '6', '7'],
        ['1. КЛАСТЕР', '1. КЛАСТЕР', '1. КЛАСТЕР', '1. КЛАСТЕР', '1. КЛАСТЕР', '1. КЛАСТЕР', '1. КЛАСТЕР'],
        ['', 'Изделия для мостов', 'Изделия для мостов', 'Изделия для мостов', 'Изделия для мостов', 'Изделия для мостов', 'Изделия для мостов'],
        ['1', 'Плиты ПН-18', 'шт', 28998482, '-', 25891502, '-'],
        ['2', 'Фанера', 'лист', '-', '-', '-', 0],
        ['', 'Примечание: При формировании себестоимости продукции использованы биржевые цены', '', '', '', '', ''],
      ],
    }]), 'каталог 3 кв. 2025 года.xls');
    expect(r.qatorlar.map(q => [q.nom, q.narxVarianti, q.narx, JSON.parse(q.izoh).sana])).toEqual([
      ['Плиты ПН-18', 'nds_bilan', 28998482, '2025-08-01'],
      ['Плиты ПН-18', 'nds_siz', 25891502, '2025-08-01'],
      ['Фанера', 'nds_bilan', null, '2025-08-01'],
    ]);
    expect(JSON.parse(r.qatorlar[0].izoh).guruh).toBe('Изделия для мостов');
    expect(r.qatorlar[2].ogohlantirishlar[0]).toMatch(/PRICE_MISSING/);
    expect(r.varaqlar[0].ma_lumotBoshi).toBe(4);
  });

  it('mashina-soat Excel: yil ustunlari, birlik МАШ.-Ч, raqamlash qatori ma’lumot emas', () => {
    const r = tahlilKatalogXlsx(wb([{
      name: 'маш час',
      rows: [
        ['', 'СТОИМОСТЬ 1 МАШ.ЧАСА МАШИН И МЕХАНИЗМОВ', '', ''],
        ['N п/п', 'Наименование', 'Цена за ед.измерения на (сум)', 'Цена за ед.измерения на (сум)'],
        ['1', '2', '3', '3'],
        ['', 'Механизмы', 'на 2021год.', 'на 2022год.'],
        ['1', 'Автобетоносмесители', 93123, 121060],
      ],
    }]), 'маш-час 2022.xls');
    expect(r.turi).toBe('mashina_soat');
    expect(r.qatorlar.map(q => [q.nom, q.birlik, q.narx, JSON.parse(q.izoh).sana])).toEqual([
      ['Автобетоносмесители', 'МАШ.-Ч', 93123, '2021'],
      ['Автобетоносмесители', 'МАШ.-Ч', 121060, '2022'],
    ]);
  });
});

describe('mashina-soat PDF — skan', () => {
  it('matn qatlami yo‘q PDF aniq xabar bilan rad etiladi', () => {
    const r = tahlilMashinaSoatMatni('маш-час 2023.pdf', '-- 1 of 16 --\n-- 2 of 16 --', Array.from({ length: 16 }, () => ''));
    expect(r.importgaTayyor).toBe(false);
    expect(r.warnings[0]).toMatch(/^PDF_SKAN_MATNSIZ/);
  });
});
