import { describe, expect, it } from 'vitest';
import { kitobAnatomiyasi, sarlavhaYoli } from './index';
import type { Katak } from './turlar';

/** Prime Towers shakli (2026-10-17): bitta varaqda bir nechta lokal smeta — КЖ, keyin АР, keyin ВК (sintetik). */
const KOP_LOKAL: Katak[][] = [
  ['НАИМЕНОВАНИЕ ОБЪЕКТА: 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ'],
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 1-1'],
  ['на ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ(КЖ), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО'],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ'],
  [1, 2, 3, 4, 5, 6],
  ['РАЗДЕЛ 1.ЗЕМЛЯНЫЕ РАБОТЫ'],
  ['1', 'E1-1-195-20', 'РАЗРАБОТКА ГРУНТА', '1000М3', '0,01'],
  ['1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '5,02', '0,05'],
  ['на ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ(АР), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)'],
  ['РАЗДЕЛ 1. СТЕНЫ'],
  ['2', 'E8-1-1', 'КЛАДКА СТЕН', 'М3', '10'],
  ['2.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '4', '40'],
  ['на ВОДОПРОВОД И КАНАЛИЗАЦИЯ (ВК), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)'],
  ['РАЗДЕЛ 1. ХОЗ. ПИТЬЕВОЙ ВОДОПРОВОД В0,В1'],
  ['3', 'E16-1-1', 'ПРОКЛАДКА ТРУБОПРОВОДОВ', '100М', '0,5'],
  ['3.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '20', '10'],
];

describe('bitta varaqda bir nechta lokal smeta (Prime Towers, 2026-10-17)', () => {
  it('АР va ВК — КЖ ning bo‘limi emas, u bilan bir darajadagi lokal smeta; bo‘limlar o‘z lokali ostida', () => {
    const v = kitobAnatomiyasi({ fayl: 'p.xls', varaqlar: [{ nom: 'ЛРВ', rows: KOP_LOKAL }] }).varaqlar[0];
    expect(v.rol).toBe('lrv');
    const hammasi = [...v.titul, ...v.sarlavhalar];
    const lokallar = hammasi.filter(s => s.tur === 'lokal');
    expect(lokallar.map(s => s.xom)).toEqual([
      'ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ(КЖ), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)',
      'ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ(АР), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)',
      'ВОДОПРОВОД И КАНАЛИЗАЦИЯ (ВК), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)',
    ]);
    // all three under the same parent (the object), not nested in each other
    expect(new Set(lokallar.map(s => s.ota)).size).toBe(1);
    const yol = (tartib: string) => sarlavhaYoli(hammasi, v.ishlar.find(i => i.tartib === tartib)!.sarlavha).map(s => s.xom);
    expect(yol('2')).toEqual(['16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ', 'ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ(АР), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)', 'РАЗДЕЛ 1. СТЕНЫ']);
    expect(yol('3')[1]).toBe('ВОДОПРОВОД И КАНАЛИЗАЦИЯ (ВК), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)');
    expect(yol('1')[1]).toBe('ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ(КЖ), 16-ЭТАЖНЫЙ ЖИЛОЙ ДОМ (БЛОК-1)');
  });
  it('ABC4 shakli: «на» alohida katakda, nom keyingisida; titul «(наименование работ …)» izohi bilan', () => {
    const rows: Katak[][] = [
      ['Форма N 5'], ['СТРОИТЕЛЬСТВО ЖИЛЫХ ДОМОВ'], ['(наименование стройки)'], [],
      ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ  № ', '1-1'], ['(локальная ресурсная смета)'], [],
      ['на ', 'ЭЛЕКТРОСНАБЖЕНИЕ(ЭС), 16 - ЭТАЖНЫЙ ЖИЛОЙ ДОМ'], ['(наименование работ и затрат, наименование объекта)'],
      ...KOP_LOKAL.slice(3, 9),
      ['на ', 'СЛАБОТОЧНЫЕ СЕТИ(СС), 16 - ЭТАЖНЫЙ ЖИЛОЙ ДОМ'],
      ...KOP_LOKAL.slice(10, 13),
    ];
    const v = kitobAnatomiyasi({ fayl: 'p.xls', varaqlar: [{ nom: 'bv_abc4', rows }] }).varaqlar[0];
    const hammasi = [...v.titul, ...v.sarlavhalar];
    expect(hammasi.filter(s => s.tur === 'lokal').map(s => s.xom)).toEqual(['ЭЛЕКТРОСНАБЖЕНИЕ(ЭС), 16 - ЭТАЖНЫЙ ЖИЛОЙ ДОМ', 'СЛАБОТОЧНЫЕ СЕТИ(СС), 16 - ЭТАЖНЫЙ ЖИЛОЙ ДОМ']);
    expect(sarlavhaYoli(hammasi, v.ishlar.find(i => i.tartib === '2')!.sarlavha).map(s => s.xom)).toContain('СЛАБОТОЧНЫЕ СЕТИ(СС), 16 - ЭТАЖНЫЙ ЖИЛОЙ ДОМ');
    expect(v.review.filter(r => r.kod === 'noaniq_qator')).toHaveLength(0);
  });
  it('titul «на …» shaklida bo‘lmasa — «на …» bilan boshlangan oddiy sarlavha lokal deb olinmaydi', () => {
    const rows = KOP_LOKAL.map((r, i) => (i === 2 ? ['ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ(КЖ)'] : r));
    const v = kitobAnatomiyasi({ fayl: 'p.xls', varaqlar: [{ nom: 'ЛРВ', rows }] }).varaqlar[0];
    expect([...v.titul, ...v.sarlavhalar].filter(s => s.tur === 'lokal')).toHaveLength(1);
  });
});
