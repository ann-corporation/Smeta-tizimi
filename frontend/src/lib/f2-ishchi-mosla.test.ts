import { describe, expect, it } from 'vitest';
import { f2AktlarniOqi } from './smeta-anatomiya/f2';
import type { Katak } from './smeta-anatomiya/turlar';
import { f2Indeks, type IshJoyi } from './f2-moslash-v3/ishJoyi';
import { f2BuzilganniBoshat, f2ManbaMosla, qiymatTeng } from './f2-ishchi-qoralama';

/** Yangi parser podval qatorlarini chiqaradi; eski parser (qoralama saqlangan paytdagi) ularni chiqarmagan. */
const ROWS: Katak[][] = [
  ['АКТ'], ['За июль месяц 2026 года'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'Сметная стоимость', null],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7, 8],
  [1, 'E1-1-1-1', 'ТЕСТОВАЯ РАБОТА', 'М3', 10, null, null, 1000],
  [1.1, '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 5, 50, 20, 1000],
  [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 1000, null],
  [null, null, 'ТАМОЖЕННЫЕ РАСХОДЫ И НДС ДЛЯ ОБОРУДОВАНИЕ', 'СУМ', null, null, 4046.85, null],
  [null, null, 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА В ТЕКУЩИХ ЦЕНАХ', 'СУМ', null, null, 5046.85, null],
];
const ind = () => f2Indeks(f2AktlarniOqi({ fayl: 'f.xlsx', varaqlar: [{ nom: 'V', rows: ROWS }] })[0].daraxt);
const saqlangan = (i = ind()) => i.qatorlar.filter((t) => !t.podval).map((t) => ({ uid: t.uid, hajm: t.hajm, narx: t.narx, summa: t.summa }));

describe('F2 server qoralamasini tiklash — parser versiyasiga chidamli', () => {
  it('qiymatTeng: float shovqini teng, haqiqiy farq teng emas, null↔null teng', () => {
    expect(qiymatTeng(0.3262, 0.32620000000000005)).toBe(true);
    expect(qiymatTeng('4.41', 4.41)).toBe(true);
    expect(qiymatTeng(null, undefined)).toBe(true);
    expect(qiymatTeng(null, 0)).toBe(false);
    expect(qiymatTeng(1000, 1000.01)).toBe(false);
  });

  it('eski parser bilan saqlangan qoralama (podvalsiz) yangi parse bilan: hammasi mos, podval qatorlari YANGI sifatida qo‘shiladi', () => {
    const i = ind();
    const m = f2ManbaMosla(saqlangan(i), i);
    expect(m.buzilgan.size).toBe(0);
    expect(m.mos).toBe(2);
    expect(m.yangi).toEqual(i.qatorlar.filter((t) => t.podval).map((t) => t.uid));
    expect(m.yangi).toHaveLength(1);
  });

  it('bitta qatorning qiymati o‘zgargan — faqat o‘sha qator buzilgan, qolganlarining bog‘lanishi saqlanadi', () => {
    const i = ind();
    const s = saqlangan(i);
    s[1] = { ...s[1], summa: (s[1].summa ?? 0) + 5 }; // resurs summasi boshqacha saqlangan
    const m = f2ManbaMosla(s, i);
    expect([...m.buzilgan]).toEqual([s[1].uid]);
    const ij: IshJoyi = { bog: new Map([[s[0].uid, { qatorId: 11, holat: 'aniq', usul: 't' }], [s[1].uid, { qatorId: 12, holat: 'qolda', usul: 't' }]]), otkaz: new Set([s[1].uid]) };
    const t = f2BuzilganniBoshat(ij, m.buzilgan);
    expect([...t.bog.keys()]).toEqual([s[0].uid]);
    expect(t.otkaz.size).toBe(0);
  });

  it('qoralamadagi qator yangi parse da yo‘q — buzilgan; fayl umuman boshqa — mos=0', () => {
    const i = ind();
    const s = [...saqlangan(i), { uid: 'V!99', hajm: 1, narx: null, summa: null }];
    expect([...f2ManbaMosla(s, i).buzilgan]).toEqual(['V!99']);
    expect(f2ManbaMosla([{ uid: 'X!1', hajm: 1, narx: 1, summa: 1 }], i).mos).toBe(0);
  });
});
