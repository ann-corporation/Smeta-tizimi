import { describe, expect, it } from 'vitest';
import { f2AktlarniOqi } from './f2';
import type { Katak } from './turlar';

/** Sintetik «СПРАВКА-СЧЕТ-ФАКТУРА» (subpudrat yaxlit akti): shartnoma 1000 (QQSsiz), shu davr ulushi 0,25. */
function spravka(dagi: { shart: number; pct: number; bez: number; nds: number; sVat: number }): Katak[][] {
  const bos = (n: number): Katak[] => Array.from({ length: n }, () => null);
  const q = (arr: Array<[number, Katak]>): Katak[] => { const r = bos(16); for (const [i, v] of arr) r[i] = v; return r; };
  return [
    q([[3, 'СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ ']]),
    q([[3, ' (ПОНЕСЕННЫХ ЗАТРАТАХ)']]),
    q([[1, 'Исполнитель: ООО "ТЕСТ"']]),
    [], [], [], [], [], [], [], [], [],
    q([[1, 'НАИМЕНОВАНИЕ РАБОТ И ИХ АДРЕС: ТЕСТОВАЯ РАБОТА']]),
    q([[1, 'Договор №1 от "01" января 2026 г.']]),
    q([[1, 'Общая договорная сумма: 1 000,00 сум']]),
    q([[3, 'Номер документа'], [5, 'Дата составления'], [8, 'Отчетный период']]),
    q([[8, 'с'], [10, 'по']]),
    q([[3, '2'], [5, '23.03.2026 г.'], [8, '01.01.2026 г.'], [10, '23.03.2026 г.']]),
    [],
    q([[0, '№'], [1, 'Наименование пусковых комплексов, этапов, объектов, видов выполненных работ, оборудования, затрат'], [2, 'Ед. изм.'], [3, 'Объем работ затрат физических показателях'], [5, 'Стоимость в договорных текущих ценах'], [7, 'Выполненные работы (понесенные затраты)']]),
    q([[3, 'Всего'], [4, 'в т.ч. Текущий год '], [5, 'Всего'], [6, 'в т.ч. Текущий год '], [7, 'с начало проведения работ'], [10, 'с начало года по отчетный месяц включительно'], [13, 'в том числе за отчетный месяц']]),
    q([[7, 'в физич. показат.'], [8, 'в % к объему '], [9, 'в текущих ценах (сум)'], [10, 'в физич. показат.'], [11, 'в % к объему '], [12, 'в текущих ценах (сум)'], [13, 'в физич. показат.'], [14, 'в % к объему'], [15, 'в текущих ценах (сум)']]),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    q([[0, 1], [1, 'ТЕСТОВАЯ РАБОТА ПО ДОГОВОРУ'], [2, 'сум'], [3, dagi.shart], [4, dagi.shart], [5, dagi.shart], [6, dagi.shart], [14, dagi.pct], [15, dagi.sVat]]),
    q([[1, 'ИТОГО БЕЗ НДС'], [2, 'сум'], [3, dagi.shart], [5, dagi.shart], [14, dagi.pct], [15, dagi.bez]]),
    q([[1, 'НДС (12%)'], [2, 'сум'], [5, 120], [14, dagi.pct], [15, dagi.nds]]),
    q([[1, 'ИТОГО С НДС'], [2, 'сум'], [5, 1120], [14, dagi.pct], [15, dagi.sVat]]),
    q([[1, 'РАНЕЕ ОПЛАЧЕНО (АВАНС)'], [2, 'сум'], [14, 0.1], [15, 100]]),
    q([[1, 'ВСЕГО К ОПЛАТЕ'], [14, 0.15], [15, 180]]),
    [],
    q([[1, 'Всего выполненных работ'], [3, 280], [4, 'сум']]),
    [], q([[1, 'ИСПОЛНИТЕЛЬ'], [10, 'ЗАКАЗЧИК']]),
  ];
}

describe('СПРАВКА-СЧЕТ-ФАКТУРА — yaxlit akt (subpudrat)', () => {
  it('qator hajmi = shu davr ulushi, summa = shu davr QQSsiz; shartnoma summasi davr summasi emas', () => {
    const rows = spravka({ shart: 1000, pct: 0.25, bez: 250, nds: 30, sVat: 280 });
    const aktlar = f2AktlarniOqi({ fayl: 'x.xls', varaqlar: [{ nom: 'ф-2', rows }, { nom: 'СВОДНАЯ', rows: [['ИТОГО', 5]] }] });
    expect(aktlar.map((a) => a.varaq)).toEqual(['ф-2']);
    const a = aktlar[0];
    expect(a.davr).toBe('2026-03');
    expect(a.daraxt).toHaveLength(1);
    expect(a.daraxt[0]).toMatchObject({ tur: 'bl', nom: 'ТЕСТОВАЯ РАБОТА ПО ДОГОВОРУ', birlik: 'сум', hajm: 0.25, narx: 1000, summa: 250, barg: true });
    expect(a.qatorlarJami).toBe(250);
    expect(a.jami).toMatchObject({ pryamye: 250, vsego: 280, nds: 30, ranee: null });
    expect(a.ogohlantirishlar).toEqual([]);
  });

  it('bu davrda bajarilgan yo‘q (ulush 0) — qator hajm 0 bilan, jami 0', () => {
    const rows = spravka({ shart: 1000, pct: 0, bez: 0, nds: 0, sVat: 0 });
    const a = f2AktlarniOqi({ fayl: 'x.xls', varaqlar: [{ nom: 'ф-2', rows }] })[0];
    expect(a.daraxt[0]).toMatchObject({ hajm: 0, summa: 0 });
    expect(a.jami.pryamye).toBe(0);
  });
});
