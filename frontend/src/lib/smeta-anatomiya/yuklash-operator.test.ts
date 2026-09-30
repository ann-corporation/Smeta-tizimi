import { describe, expect, it } from 'vitest';
import { lrvDaraxti, ustunSozlamasi, ustunXaritasigaQayt, varaqRoli } from './yuklash';
import { varaqniTahlilQil } from './varaq';
import type { Katak } from './turlar';

/** Anatomiya o'zi tanigan LRV (ustun sarlavhalari aniq). */
const LRV: Katak[][] = [
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО'],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ'],
  [1, 2, 3, 4, 5, 6],
  ['РАЗДЕЛ: ФУНДАМЕНТ'],
  ['1', 'E1', 'БЕТОН', 'М3', null, '2'],
  ['1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '5', '10'],
];

describe('Operator ustunlari — anatomiya o‘zi o‘qiydi (zaxira faqat tanimasa)', () => {
  it('ustunSozlamasi ↔ ustunXaritasigaQayt teskari', () => {
    const v = varaqniTahlilQil('lrv', { nom: 'lrv', rows: LRV });
    const s = ustunSozlamasi(v.ustunlar!);
    const q = ustunXaritasigaQayt(s);
    for (const [k, x] of Object.entries(q)) expect((v.ustunlar as unknown as Record<string, number>)[k]).toBe(x);
  });

  it('operator narx ustunini ko‘rsatsa — anatomiya shu ustun bilan o‘qiydi, ierarxiya saqlanadi', () => {
    expect(lrvDaraxti('lrv', LRV).anatomiya).toBe(true);
    const u = ustunSozlamasi(varaqniTahlilQil('lrv', { nom: 'lrv', rows: LRV }).ustunlar!);
    const v = varaqniTahlilQil('lrv', { nom: 'lrv', rows: LRV }, 1, { ustunlar: ustunXaritasigaQayt({ ...u, narx: 4 }) });
    expect(v.ustunlar!.narx).toBe(4);
    const d = lrvDaraxti('lrv', LRV, v);
    expect(d.anatomiya).toBe(true);
    expect(JSON.stringify(d.tree)).toContain('ФУНДАМЕНТ');
  });

  it('operator hajmni bo‘sh ustunga qo‘ysa — anatomiya rad etadi (zaxira ishlaydi, sabab bilan)', () => {
    const u = ustunSozlamasi(varaqniTahlilQil('lrv', { nom: 'lrv', rows: LRV }).ustunlar!);
    const v = varaqniTahlilQil('lrv', { nom: 'lrv', rows: LRV }, 1, { ustunlar: ustunXaritasigaQayt({ ...u, obyom: 4 }) });
    const d = lrvDaraxti('lrv', LRV, v);
    expect(d.anatomiya).toBe(false);
    expect(d.sabab).toBeTruthy();
  });
});

describe('RES bo‘lim qoidasi anatomiyada (eski evristikadan ko‘chirildi)', () => {
  it('kamida ikki xil RES bo‘limi — RES (sarlavha bloki tanilmasa ham)', () => {
    const rows: Katak[][] = [
      ['Ресурсы по объекту'],
      ['ЗАТРАТЫ ТРУДА РАБОЧИХ'],
      ['Рабочий 3 разряда', 'чел.-ч', 120, 25000],
      ['СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ'],
      ['Кран 25 т', 'маш.-ч', 8, 180000],
      ['МАТЕРИАЛЬНЫЕ РЕСУРСЫ'],
      ['Бетон B25', 'м3', 12.5, 950000],
    ];
    const x = varaqRoli('RES', rows);
    expect(x.rol).toBe('res');
    expect(x.dalil.join(' ')).toContain('RES bo');
  });

  it('bitta bo‘lim — RES deb xulosa qilinmaydi', () => {
    const x = varaqRoli('x', [['МАТЕРИАЛЬНЫЕ РЕСУРСЫ'], ['Бетон', 'м3', 1, 2], ['Песок', 'м3', 1, 2]]);
    expect(x.rol).not.toBe('res');
  });
});
