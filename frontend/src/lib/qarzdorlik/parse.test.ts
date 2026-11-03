import { describe, expect, it } from 'vitest';
import { importYuk, parseGrid, parseVaraqlar, raqamTopish, readWorkbookGrids, sanaOl, sonOl, type Grid } from './parse';
import { qarzHisobla } from './hisob';
import { qarzdorlikXlsxYarat } from './eksport';

// Faqat sintetik ma'lumot. Egasining shablon sarlavhasi (13 ustun).
const SARLAVHA = ['№', 'Наименование / содержание', 'Контрагент / документ-основание', 'Дата', 'Ед. изм.', 'Кол-во', 'Цена', 'Сумма договора',
  'Поставлено / выполнено', 'Оплачено', 'Задолженность (+ мы должны, − нам должны)', 'Примечание', 'тип'];

const shablon = (): Grid => [
  ['ОБОСНОВАНИЕ ЗАДОЛЖЕННОСТИ ПЕРЕД ПОСТАВЩИКАМИ И СУБПОДРЯДЧИКАМИ'],
  ['Синяя строка — позиция'],
  [],
  SARLAVHA,
  // namuna (o'tkaziladi)
  [1, 'Газон (пример — удалите)', 'ООО «Пример»', null, null, null, null, 1000, null, null, null, 'пример', 'П'],
  ['1.1', 'Семена', 'Накладная № 12', new Date('2026-09-09T19:00:00.000Z'), 'кг', 2000, 150, null, 300000, null, null, null, 'О'],
  // haqiqiy pozitsiya
  [2, 'Поставка материалов по договору № 45-А', 'ТЕСТ ПОСТАВЩИК', null, null, null, null, 2000, 1800, 600, 1200, null, 'П'],
  ['2.1', 'Материал 1', 'Накладная № 1', '12.01.2026', 'шт', 10, 100, null, 1000, null, null, null, 'О'],
  ['2.2', 'Материал 2', 'Накладная № 2', '2026-01-15', null, null, null, null, 500, null, null, null, 'О'],
  ['2.3', 'Работы по монтажу', 'Акт № 3', '16.01.2026', 'м2', 10, 30, null, 0, null, null, null, 'О'], // I = 0 (formula natijasi) -> hajm x narx
  ['2.4', 'Оплата', 'Платёжное поручение № 101', '20.01.2026', null, null, null, null, 0, 600, null, null, 'О'],
  ['2.5', 'Возврат', 'Накладная № 9', '21.01.2026', null, null, null, null, -100, null, null, null, 'О'],
  ['2.6', null, null, null, null, null, null, null, 0, null, null, null, 'О'], // bo'sh
  // to'ldirilmagan pozitsiya
  [3, null, null, null, null, null, null, null, null, null, null, null, 'П'],
  ['3.1', null, null, null, null, null, null, null, null, null, null, null, 'О'],
  ['ИТОГО ПО ВСЕМ ПОЗИЦИЯМ', null, null, null, null, null, null, 2000, 1800, 600, 1200, null, null],
];

describe('yordamchilar', () => {
  it('sonOl: bo‘shliq, vergul, minus belgilari, tire = NULL', () => {
    expect(sonOl('1 250 000,50')).toBe(1250000.5);
    expect(sonOl('−100')).toBe(-100);
    expect(sonOl(12)).toBe(12);
    expect(sonOl('–')).toBeNull();
    expect(sonOl('')).toBeNull();
    expect(sonOl('abc')).toBeNull();
    expect(sonOl(null)).toBeNull();
  });
  it('sanaOl: Date vaqt mintaqasi siljishida ham kun to‘g‘ri; matn formatlari', () => {
    expect(sanaOl(new Date('2026-09-09T19:00:00.000Z'))).toBe('2026-09-10'); // UTC+5 yarim tun
    expect(sanaOl(new Date('2026-09-10T00:00:00.000Z'))).toBe('2026-09-10');
    expect(sanaOl('12.01.2026')).toBe('2026-01-12');
    expect(sanaOl('2026-01-15')).toBe('2026-01-15');
    expect(sanaOl('')).toBeNull();
  });
  it('raqamTopish: matndan shartnoma raqami', () => {
    expect(raqamTopish('Поставка по договору № 45-А')).toBe('45-А');
    expect(raqamTopish('shartnoma N 12/3, material')).toBe('12/3');
    expect(raqamTopish('Газон')).toBeNull();
  });
});

describe('parseGrid: shablon', () => {
  const n = parseGrid(shablon(), { turi: 'postavshik' });

  it('formatni aniqlaydi; namuna va to‘ldirilmagan pozitsiya o‘tkazib yuboriladi', () => {
    expect(n.format).toBe('shablon');
    expect(n.xatolar).toEqual([]);
    expect(n.shartnomalar).toHaveLength(1);
    const s = n.shartnomalar[0];
    expect(s.kontragent).toBe('ТЕСТ ПОСТАВЩИК');
    expect(s.raqam).toBe('45-А');
    expect(s.summa).toBe(2000);
    expect(s.turi).toBe('postavshik');
  });

  it('asos qatorlari: yetkazish, hajm x narx, akt, to‘lov, minus qaytarish; bo‘sh qator tushadi', () => {
    const qs = n.shartnomalar[0].qatorlar;
    expect(qs.map((q) => q.tur)).toEqual(['yetkazib_berish', 'yetkazib_berish', 'bajarilgan_ish', 'tolov', 'yetkazib_berish']);
    expect(qs.map((q) => q.summa)).toEqual([1000, 500, 300, 600, -100]);
    expect(qs[0].sana).toBe('2026-01-12');
    expect(qs[0].hujjat_raqam).toBe('Накладная № 1');
    expect(qs[2].hajm).toBe(10); expect(qs[2].narx).toBe(30);
    expect(qs[3].hujjat_raqam).toBe('Платёжное поручение № 101');
  });

  it('shablon qatorlari bilan hisob: qabul 1700, to‘langan 600, qarz 1100', () => {
    const s = n.shartnomalar[0];
    const h = qarzHisobla({ qatorlar: s.qatorlar, shartnomaSumma: s.summa });
    expect(h.qabul).toBe(1700);
    expect(h.tolangan).toBe(600);
    expect(h.qarz).toBe(1100);
  });

  it('shartnoma raqami yo‘q bo‘lsa — deterministik kalit (qayta import takror yaratmaydi)', () => {
    const g = shablon(); g[6][1] = 'Поставка материалов';
    const a = parseGrid(g).shartnomalar[0]; const b = parseGrid(g).shartnomalar[0];
    expect(a.raqam).toMatch(/^PZ-[0-9a-f]{8}$/);
    expect(a.raqam).toBe(b.raqam);
    expect(a.eslatmalar.length).toBeGreaterThan(0);
  });

  it('kontragentsiz pozitsiya xato sifatida qaytadi, import yukiga tushmaydi', () => {
    const g = shablon(); g[6][2] = null;
    const r = parseGrid(g);
    expect(r.shartnomalar).toHaveLength(0);
    expect(r.xatolar[0]).toMatch(/kontragent/);
  });

  it('tip ustuni bo‘lmasa № bo‘yicha: butun = pozitsiya, nuqtali = asos', () => {
    const g = shablon().map((r) => r.slice(0, 12));
    g[3] = SARLAVHA.slice(0, 12);
    const r = parseGrid(g);
    expect(r.shartnomalar).toHaveLength(1);
    expect(r.shartnomalar[0].qatorlar).toHaveLength(5);
  });

  it('importYuk: summa hajm x narx dan to‘ldiriladi, NULL saqlanadi', () => {
    const y = importYuk(n.shartnomalar);
    expect(y[0].qatorlar[2].summa).toBe(300);
    const nol = importYuk([{ ...n.shartnomalar[0], qatorlar: [{ ...n.shartnomalar[0].qatorlar[0], summa: null, hajm: null, narx: null }] }]);
    expect(nol[0].qatorlar[0].summa).toBeNull();
  });
});

describe('parseGrid: finansoviy spravka', () => {
  const g: Grid = [
    ['Финансовая справка'],
    ['Наименование', 'Контрагент', 'Договор сумма', 'Оплата', 'Факт задолженность', 'Прогноз'],
    ['Электрика', 'ТЕСТ СУБПОДРЯД', 5000, 3000, 1500, 800],
    ['Газон', 'ТЕСТ ПОСТАВЩИК', '2 000', null, -200, null],
    ['Газон', 'ТЕСТ ПОСТАВЩИК', 100, 50, 50, null], // bir xil kontragent+nom -> alohida raqam
    [null, null, null, null, null, null],
    ['ИТОГО', null, 7100, 3050, 1350, 800],
  ];
  const n = parseGrid(g, { spravkaSana: '2026-10-22' });

  it('formatni aniqlaydi, jami qatori tushadi, minus qarz saqlanadi', () => {
    expect(n.format).toBe('spravka');
    expect(n.shartnomalar).toHaveLength(3);
    expect(n.shartnomalar[0]).toMatchObject({ kontragent: 'ТЕСТ СУБПОДРЯД', summa: 5000, turi: 'subpudrat' }); // nomida «подряд»
    expect(n.shartnomalar[0].spravka).toEqual({ qarz: 1500, tolangan: 3000, prognoz: 800, sana: '2026-10-22' });
    expect(n.shartnomalar[1].summa).toBe(2000);
    expect(n.shartnomalar[1].spravka?.qarz).toBe(-200);
    expect(n.shartnomalar[1].spravka?.tolangan).toBeNull();
  });

  it('bir xil kontragent+nom — takrorlanmaydigan raqamlar; asos qatori yo‘q (FARQ noma‘lum)', () => {
    const raqamlar = n.shartnomalar.map((s) => s.raqam);
    expect(new Set(raqamlar).size).toBe(3);
    expect(raqamlar.every((r) => r.startsWith('SPR-'))).toBe(true);
    const h = qarzHisobla({ qatorlar: n.shartnomalar[0].qatorlar, spravkaQarz: n.shartnomalar[0].spravka?.qarz });
    expect(h.qarz).toBeNull();
    expect(h.farq).toBeNull();
  });

  it('tanilmagan format xato beradi', () => {
    const r = parseGrid([['a', 'b'], [1, 2]]);
    expect(r.format).toBeNull();
    expect(r.xatolar).toHaveLength(1);
  });

  it('parseVaraqlar: birinchi taniladigan varaqni oladi', () => {
    const r = parseVaraqlar([{ nom: 'Bo‘sh', grid: [['x']] }, { nom: 'Spravka', grid: g }]);
    expect(r.varaq).toBe('Spravka');
    expect(r.format).toBe('spravka');
  });
});

describe('eksport -> import aylanmasi (shablon joylashuvi)', () => {
  it('eksport qilingan fayl o‘sha ma‘lumot va hisob bilan qayta o‘qiladi', async () => {
    const qatorlar = [
      { tur: 'yetkazib_berish' as const, hujjat_raqam: 'Накладная № 1', sana: '2026-01-12', nomi: 'Материал', birlik: 'шт', hajm: 10, narx: 100, summa: null, izoh: null },
      { tur: 'bajarilgan_ish' as const, hujjat_raqam: 'Акт № 3', sana: '2026-01-16', nomi: 'Монтаж', birlik: null, hajm: null, narx: null, summa: 500, izoh: 'izoh' },
      { tur: 'tolov' as const, hujjat_raqam: 'ПП № 101', sana: '2026-01-20', nomi: null, birlik: null, hajm: null, narx: null, summa: 600, izoh: null },
      { tur: 'yetkazib_berish' as const, hujjat_raqam: 'Накладная № 9', sana: null, nomi: 'Возврат', birlik: null, hajm: null, narx: null, summa: -100, izoh: null },
    ];
    const buf = await qarzdorlikXlsxYarat([{ kontragent: 'ТЕСТ ПОСТАВЩИК', nom: 'Договор № 45-А', predmet: 'Договор № 45-А', summa: 2000, spravkaQarz: 700, qatorlar }]);
    const varaqlar = await readWorkbookGrids(buf);
    const r = parseVaraqlar(varaqlar);
    expect(r.format).toBe('shablon');
    expect(r.shartnomalar).toHaveLength(1);
    const s = r.shartnomalar[0];
    expect(s.kontragent).toBe('ТЕСТ ПОСТАВЩИК');
    expect(s.raqam).toBe('45-А');
    expect(s.summa).toBe(2000);
    expect(s.spravka?.qarz).toBe(700);
    expect(s.qatorlar.map((q) => q.summa)).toEqual([1000, 500, 600, -100]);
    expect(s.qatorlar.map((q) => q.tur)).toEqual(['yetkazib_berish', 'bajarilgan_ish', 'tolov', 'yetkazib_berish']);
    expect(s.qatorlar[0].sana).toBe('2026-01-12');
    const h = qarzHisobla({ qatorlar: s.qatorlar, shartnomaSumma: s.summa, spravkaQarz: s.spravka?.qarz });
    expect(h.qarz).toBe(800); // 1000 + 500 - 100 - 600
    expect(h.farq).toBe(100);
  });
});
