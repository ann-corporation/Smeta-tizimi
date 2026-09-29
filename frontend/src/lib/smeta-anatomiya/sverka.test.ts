import { describe, expect, it } from 'vitest';
import { birlikKaliti, sverkaManbalardan } from './sverka';
import type { Katak } from './turlar';

const LRV: Katak[][] = [
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 01-01'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО'],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ'],
  [1, 2, 3, 4, 5, 6],
  ['1', 'E1-1-195-20', 'РАЗРАБОТКА ГРУНТА', '1000М3', '2'],
  ['1.1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '5', '10'],
  ['1.2', '3', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЧЕЛ-Ч', '2', '4'],
  ['1.3', '001942', 'ЭКСКАВАТОРЫ', 'МАШ-Ч', '2', '4'],
  ['2', 'E6-1-1', 'БЕТОНИРОВАНИЕ', '100М3', '1'],
  ['2.1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '20', '20'],
  ['2.2', '615-1', 'БЕТОН КЛ. В12,5', 'М3', '101,5', '101,5'],
  ['2.3', '700-1', 'АРМАТУРА А500', 'Т', '1', '1'],
];

const RES: Katak[][] = [
  ['№', 'КОД', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
  [1, 2, 3, 4, 5, 6, 7],
  ['ТРУДОВЫЕ РЕСУРСЫ'],
  ['1', '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ С УЧЕТОМ СОЦСТРАХА', 'ЧЕЛ.-Ч', 30, 100, 3000],
  ['МАШИНЫ И МЕХАНИЗМЫ'],
  ['1', '001942', 'ЭКСКАВАТОРЫ', 'МАШ.-Ч', 4, 500, 2000],
  ['МАТЕРИАЛЫ'],
  ['1', '615-1', 'БЕТОН КЛ. В12,5', 'М3', 100, 700, 70000],
  ['2', '700-1', 'АРМАТУРА КЛАССА А500С', 'Т', 1, 9000, 9000],
  ['3', '800-2', 'ГВОЗДИ', 'КГ', 5, 20, 100],
];

describe('СВЕРКА ЛРВ и РС', () => {
  it('birlik kaliti: ЧЕЛ.-Ч = ЧЕЛ-ЧАС, МАШ.-Ч = МАШ-Ч', () => {
    expect(birlikKaliti('ЧЕЛ.-Ч')).toBe(birlikKaliti('ЧЕЛ-ЧАС'));
    expect(birlikKaliti('маш.-ч')).toBe(birlikKaliti('МАШ-Ч'));
  });

  it('mos, miqdor farqi, faqat birida, kod bo‘yicha ehtimoliy juft, mashinist — ma’lumot', () => {
    const s = sverkaManbalardan([{ nom: 'LRV', rows: LRV }], [{ nom: 'RES', rows: RES }]);
    const p = (nom: string) => s.pozitsiyalar.find((x) => x.nom.startsWith(nom))!;
    // ishchilar mehnati: 10 + 20 = 30 — RES "С УЧЕТОМ СОЦСТРАХА" bilan bir pozitsiya
    expect(p('ЗАТРАТЫ ТРУДА РАБОЧИХ')).toMatchObject({ holat: 'mos', lrvHajm: 30, resHajm: 30, lrvSoni: 2, kat: 'ЧЕЛ' });
    expect(p('ЭКСКАВАТОРЫ')).toMatchObject({ holat: 'mos', kat: 'МАШ' });
    expect(p('БЕТОН')).toMatchObject({ holat: 'farq', lrvHajm: 101.5, resHajm: 100, farqHajm: -1.5 });
    expect(p('ГВОЗДИ')).toMatchObject({ holat: 'faqat_res', lrvHajm: null });
    expect(p('ЗАТРАТЫ ТРУДА МАШИНИСТОВ').holat).toBe('mashinist');
    // Nomi farqli, kodi bir xil — birlashtirilmaydi, faqat izohda
    expect(p('АРМАТУРА А500').holat).toBe('faqat_lrv');
    expect(p('АРМАТУРА А500').izoh).toMatch(/возможно соответствует позиции РС «АРМАТУРА КЛАССА А500С»/);
    expect(s.soni).toMatchObject({ mos: 2, farq: 1, faqat_lrv: 1, faqat_res: 2, mashinist: 1 });
    expect(s.muammo).toBe(4);
    expect(s.resYoq).toBe(false);
  });

  it('RES berilmasa — natija resYoq, hamma faqat_lrv', () => {
    const s = sverkaManbalardan([{ nom: 'LRV', rows: LRV }], []);
    expect(s.resYoq).toBe(true);
  });
});
