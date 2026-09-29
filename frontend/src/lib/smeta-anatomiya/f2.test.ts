import { describe, expect, it } from 'vitest';
import { davrniOqi, f2AktlarniOqi } from './f2';
import type { KirishKitob, Katak } from './turlar';

const SARLAVHA: Katak[][] = [
  ['Подрядчик: ООО "NEW TIMES BUILDINGS"'],
  ['Заказчик: "Янги Навоий шахарчаси"'],
  [],
  ['АКТ'],
  ['О выполненых работ по объекту "Янги Узбекистон боги"'],
  [],
  ['За сентябрь месяц 2025 года'],
  [],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'Сметная стоимость', null],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7, 8],
];

function kitob(qatorlar: Katak[][], podval: Katak[][]): KirishKitob {
  return { fayl: 'f2.xlsx', varaqlar: [{ nom: 'ф2 Сцена', rows: [...SARLAVHA, ...qatorlar, ...podval] }] };
}

const ISHLAR: Katak[][] = [
  ['РАЗДЕЛ: СТЕЛЛА'],
  ['ЗЕМЛЯНЫЕ РАБОТЫ(КР-3)'],
  [1, 'E1-1-195-20 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', 2.5, null, null, 1300],
  [1.1, '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 5, 12.5, 24, 300],
  [1.2, '000003', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЧЕЛ-Ч', 21, 52.5, null, null],
  [1.3, '001942', 'ЭКСКАВАТОРЫ', 'МАШ-Ч', 10, 25, 40, 1000],
  // Google Sheets "2.1" ni sanaga aylantirgan (46024) — resurs kodi sof raqam
  [2, 'E1-2-57-2', 'РАЗРАБОТКА ГРУНТА ВРУЧНУЮ', '100М3', 0.4, null, null, 200],
  [46024, '1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 20, 8, 25, 200],
  // nomsiz resurs (formula havolasi uzilgan)
  [3, 'E6-1-1-22', 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ', '100М3', 1, null, null, 500],
  ['3.1', '006327', ' ', 'М3', 101.5, 101.5, 4.926, 500],
  // hajmi bo'sh — bajarilmagan
  [4, 'E11-1-1-1', 'УСТРОЙСТВО ПОДСТИЛАЮЩИХ СЛОЕВ', '100М2', null, null, null, null],
  // resurssiz ish (yaxlit material)
  [126, 'С124-22', 'ГОРЯЧЕКАТАННАЯ АРМАТУРНАЯ СТАЛЬ', 'Т', 2, null, 50, 100],
];

describe('F2 o‘quvchisi (smeta anatomiyasi ustida)', () => {
  it('davr: rus/o‘zbek oy nomlari', () => {
    expect(davrniOqi('За сентябрь месяц 2025 года')).toBe('2025-09');
    expect(davrniOqi('ЗА ИЮНЬ  МЕСЯЦ 2025 ГОДА')).toBe('2025-06');
    expect(davrniOqi('Отчетный период: Декабрь.2025')).toBe('2025-12');
    expect(davrniOqi('Аррель 2026')).toBe('2026-04');
    expect(davrniOqi('Karting F2 Май 2026')).toBe('2026-05');
    expect(davrniOqi('ЗА МАЯ 2026')).toBe('2026-05');
    expect(davrniOqi('ПОСТАВКА МАЙКИ 2026')).toBeNull();
    expect(davrniOqi('Сентябрь')).toBeNull();
  });

  it('daraxt, barglar, ogohlantirishlar; hujjat jami = qatorlar (farq 0)', () => {
    const podval: Katak[][] = [
      [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, 2100],
      [null, null, 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА В ТЕКУЩИХ ЦЕНАХ', 'СУМ', null, null, null, 2800],
      [null, null, 'Итого по ранее оформленным Формам №2:', 'СУМ', null, null, null, 1000],
      [],
      [null, null, 'ЗАКАЗЧИК'],
      [null, null, 'Представитель Тех.надзора Заказчика'],
      [null, null, 'ПОДРЯДЧИК'],
    ];
    const [akt] = f2AktlarniOqi(kitob(ISHLAR, podval));
    expect(akt.davr).toBe('2025-09');
    expect(akt.hujjatSarlavhasi).toBe('О выполненых работ по объекту "Янги Узбекистон боги"');
    expect(akt.ishlarSoni).toBe(4); // 4-ish (hajmsiz) chiqarildi
    expect(akt.qatorlarJami).toBe(300 + 1000 + 200 + 500 + 100);
    expect(akt.jami).toMatchObject({ pryamye: 2100, vsego: 2800, ranee: 1000 });
    const kodlar = akt.ogohlantirishlar.map((o) => o.kod);
    expect(kodlar).toContain('HAJMSIZ_ISH');
    expect(kodlar).toContain('NOMSIZ_RESURS');
    expect(kodlar).not.toContain('JAMI_FARQ');
    // RZ yo'li, imzo bloki RZ emas
    const rz = akt.daraxt[0];
    expect(rz.nom).toBe('РАЗДЕЛ: СТЕЛЛА');
    expect(rz.bolalar[0].nom).toBe('ЗЕМЛЯНЫЕ РАБОТЫ(КР-3)');
    const nomlar = JSON.stringify(akt.daraxt);
    expect(nomlar).not.toContain('ЗАКАЗЧИК');
    // Sanaga aylangan "2.1" resurs sifatida
    const ish2 = rz.bolalar[0].bolalar.find((b) => b.kod === 'E1-2-57-2')!;
    expect(ish2.bolalar).toHaveLength(1);
    expect(ish2.barg).toBe(false);
  });

  it('hujjat formulasi oxirgi ishlarni qamramagan bo‘lsa — farq sababi aniq aytiladi', () => {
    const podval: Katak[][] = [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, 2000]];
    const [akt] = f2AktlarniOqi(kitob(ISHLAR, podval));
    const f = akt.ogohlantirishlar.find((o) => o.kod === 'JAMI_FARQ')!;
    expect(f.izoh).toMatch(/126-ish \(С124-22/);
    expect(f.izoh).toMatch(/oxirgi qatorlar yig'indisiga yaqin/);
    expect(f.izoh).toMatch(/importer qiymatlarni o'zgartirmadi/);
    expect(f.izoh).not.toMatch(/Qatorlar to'g'ri/);
  });

  it('podval SUM diapazoni birinchi resurs qatorini tashlab ketsa — aynan o‘sha qator aytiladi (Sovg‘alar)', () => {
    // 1.1 (300) jamiga kirmagan: 2100 − 300 = 1800
    const podval: Katak[][] = [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, 1800]];
    const [akt] = f2AktlarniOqi(kitob(ISHLAR, podval));
    const f = akt.ogohlantirishlar.find((o) => o.kod === 'JAMI_FARQ')!;
    expect(f.izoh).toMatch(/farq aynan 15-qator \("ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ"\)/);
    expect(f.izoh).toMatch(/diapazoni bu qatordan keyin boshlanadi/);
  });

  it('#REF! kataklari pulga kirmaydi va ochiq aytiladi', () => {
    const qator: Katak[][] = [
      ['РАЗДЕЛ: ТРОТУАР'],
      [1, 'E26-1-55-2', 'УСТРОЙСТВО ПАРОИЗОЛЯЦИИ', '100М2', '#REF!', null, null, '#REF!'],
      [1.1, '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 14.36, '#REF!', 24517.7, '#REF!'],
      [2, 'E27-4-16-4', 'УСТРОЙСТВО ПРОСЛОЙКИ', '1000М2', 1, null, null, 700],
      [2.1, '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 27.7, 27.7, 25, 700],
    ];
    const [akt] = f2AktlarniOqi(kitob(qator, [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, 700]]));
    expect(akt.ogohlantirishlar.filter((o) => o.kod === 'XATO_QIYMAT').length).toBeGreaterThanOrEqual(1);
    expect(akt.qatorlarJami).toBe(700);
  });
  it('Tizim1 LRV_PLUS: sarlavha 0, yordamchi R/Z ustunlar, tartibsiz qo‘shimcha (bl+) va zamena (mat~) — hammasi o‘qiladi', () => {
    // Karting F2 (2026-09-29): E–H sarlavhalari 0; R = F yoki E (qoldiq), Z = H nusxa; I = tur.
    const q = (a: Katak, b: Katak, c: string, d: string, e: Katak, f: Katak, g: Katak, h: Katak, tur: string): Katak[] => {
      const r: Katak[] = [a, b, c, d, e, f, g, h, tur];
      r[17] = f ?? e; r[25] = h;
      return r;
    };
    const rows: Katak[][] = [
      ['Подрядчик: ООО "NEW TIMES BUILDINGS"'], [], ['АКТ'], ['За август месяц 2026 года'], [],
      ['N п.п.', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 0, null, null, 0, 'rz'],
      [null, null, null, null, 0, 0],
      [1, 2, 3, 4, 5, 6, null, 0, 'rz'],
      [null, null, 'СТЕНЫ', null, 0, 0, null, 0, 'rz'],
      q(78, 'Е0904-006-04', 'МОНТАЖ СТЕН', '100М2', 24.09, null, null, 915679005, 'bl'),
      q(78.1, '1', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ.-Ч', 170.24, 4101.0816, 29421, 120657921.7536, 'rs'),
      q(78.2, '762', 'КРАНЫ', 'МАШ.-Ч', 1.42, 34.2078, 244250, 8355255.15, 'rs'),
      q(78.3, '30322', 'БОЛТЫ', 'Т', 0.0126, 0.303534, 12000000, 3642408, 'rs'),
      q(78.4, '34241', 'КИСЛОРОД', 'М3', 2.98, 71.7882, 4406, 316298.8092, 'rs'),
      q(78.5, '45077', 'ПРОПАН', 'КГ', 3.16, 76.1244, 2667, 203023.7748, 'rs'),
      q(79, 'С', 'СЭНДВИЧ ПАНЕЛЬ', 'М2', 2409, null, 320000, 770880000, 'mat'),
      q(null, 'Е0601-015-10', 'АРМИРОВАНИЕ', 'Т', 1.91887, 18.51, null, 713592.14, 'bl+'),
      q(null, '1', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ.-Ч', 12.64, 24.2545168, 29421, 713592.1387728, 'rs+'),
      q(null, 'С', 'СЕТКА ВР-1', 'М2', 547.45, 18.8802, 12500, 6843125, 'mat~'),
      [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 904768499.6264],
    ];
    const [akt] = f2AktlarniOqi({ fayl: 'k.xlsx', varaqlar: [{ nom: 'LRV', rows }] });
    const u = akt.anatomiya.ustunlar!;
    expect([u.hajmBirlikka, u.hajmLoyiha, u.narx, u.summa]).toEqual([4, 5, 6, 7]);
    const stena = akt.daraxt[0];
    expect(stena.nom).toBe('СТЕНЫ');
    const [ish, panel, arm, setka] = stena.bolalar;
    expect(ish.hajm).toBe(24.09);
    expect(ish.bolalar).toHaveLength(5);
    expect(ish.bolalar[0]).toMatchObject({ norma: 170.24, hajm: 4101.0816, narx: 29421 });
    expect(panel).toMatchObject({ hajm: 2409, narx: 320000, summa: 770880000, barg: true });
    expect(arm).toMatchObject({ kod: 'Е0601-015-10', hajm: 1.91887, belgi: 'qoshimcha' });
    expect(arm.bolalar).toHaveLength(1);
    expect(setka).toMatchObject({ hajm: 547.45, belgi: 'zamena' });
    expect(akt.jami.pryamye).toBeCloseTo(904768499.6264, 2);
    const f = akt.ogohlantirishlar.find((o) => o.kod === 'JAMI_FARQ')!;
    expect(f.izoh).toMatch(/zamena \(~\) \(С, \d+-qator\) "СЕТКА ВР-1"/);
  });

  it('explicit F2 total in one alternate amount cell is read exactly and flagged for source-column review', () => {
    const rows: Katak[][] = [
      ['РАЗДЕЛ: ТЕСТ'],
      [1, 'W-1', 'РАБОТА', 'М3', 1, null, null, 100],
    ];
    const [akt] = f2AktlarniOqi(kitob(rows, [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 100, null]]));
    expect(akt.jami.pryamye).toBe(100);
    expect(akt.anatomiya.jamilar[0].manzil.ustun).toBe(7);
    expect(akt.anatomiya.review).toContainEqual(expect.objectContaining({ kod: 'jami_summa_ustun_fallback' }));
    expect(akt.ogohlantirishlar.map((warning) => warning.kod)).not.toContain('JAMI_FARQ');
  });

  it('does not invent a total if the explicit total row has no usable amount cell', () => {
    const [akt] = f2AktlarniOqi(kitob([[1, 'W-1', 'РАБОТА', 'М3', 1, null, null, 100]], [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, null]]));
    expect(akt.jami.pryamye).toBeNull();
    expect(akt.anatomiya.review).toContainEqual(expect.objectContaining({ kod: 'jami_summa_yoq' }));
  });

  it('one tiyina mismatch is visible while sub-tiyina floating-point noise is rounded away', () => {
    const row: Katak[] = [1, 'W-1', 'ISH', 'М2', 1, null, null, 100];
    const [oneTiyin] = f2AktlarniOqi(kitob([row], [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, 99.99]]));
    expect(oneTiyin.ogohlantirishlar).toContainEqual(expect.objectContaining({ kod: 'JAMI_FARQ' }));

    const [floatNoise] = f2AktlarniOqi(kitob([row], [[null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, null, 99.999]]));
    expect(floatNoise.ogohlantirishlar.map((warning) => warning.kod)).not.toContain('JAMI_FARQ');
  });

  it('LRV_PLUS markerlari BL/RS/MAT/OB ni ajratadi, MAT/OB RZ ostida qoladi va keyingi RS avvalgi BL ga birikadi', () => {
    const markerli: Katak[][] = [
      ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'ЦЕНА', 'СУММА', 'ТИП'],
      [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', null, null, null],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      ['РАЗДЕЛ: АМФИТЕАТР', 0, 'АМФИТЕАТР', null, 0, 0, 0, 0, 'rz'],
      ['РАЗДЕЛ: СЦЕНА', 0, 'СЦЕНА', null, 0, 0, 0, 0, 'rz'],
      [1, 'W-1', 'УСТРОЙСТВО БЕТОННЫХ РАБОТ', 'м3', 10, 10, 100, 1000, 'bl'],
      [1.1, '000001', 'ЗАТРАТЫ ТРУДА', 'чел-ч', 2, 20, 5, 100, 'rs'],
      [2, 'MAT-1', 'БЛОКИ ДВЕРНЫЕ ПВХ', 'шт', null, 3, 50, 150, 'mat'],
      [1.2, '000002', 'ЗАТРАТЫ МАШИНИСТОВ', 'маш-ч', 1, 10, 4, 40, 'rs'],
      [3, 'OB-1', 'НАСОС', 'шт', null, 1, 200, 200, 'ob'],
      [2, 'W-2', 'ОТДЕЛОЧНЫЕ РАБОТЫ', 'м2', 5, 5, 20, 100, 'bl'],
      [2.1, 'MAT-2', 'СМЕСЬ', 'кг', 3, 15, 2, 30, 'mat'],
      [2.2, '000003', 'ЗАТРАТЫ ТРУДА', 'чел-ч', 1, 5, 5, 25, 'rs'],
      ['ИТОГО ПРЯМЫЕ ЗАТРАТЫ', null, null, null, null, null, null, 545, null],
    ];
    const [akt] = f2AktlarniOqi({ fayl: 'markerli-f2.xlsx', varaqlar: [{ nom: 'LRV', rows: [...SARLAVHA, ...markerli] }] });
    const flatten = (nodes: typeof akt.daraxt): typeof akt.daraxt => nodes.flatMap((n) => [n, ...flatten(n.bolalar)]);
    const tugunlar = flatten(akt.daraxt);
    expect(tugunlar.filter((n) => n.tur === 'bl').map((n) => n.nom)).toEqual(['УСТРОЙСТВО БЕТОННЫХ РАБОТ', 'ОТДЕЛОЧНЫЕ РАБОТЫ']);
    expect(tugunlar.filter((n) => n.tur === 'mat').map((n) => n.nom)).toEqual(['БЛОКИ ДВЕРНЫЕ ПВХ', 'СМЕСЬ']);
    expect(tugunlar.filter((n) => n.tur === 'ob').map((n) => n.nom)).toEqual(['НАСОС']);
    expect(tugunlar.find((n) => n.nom === 'БЛОКИ ДВЕРНЫЕ ПВХ')?.yol).toEqual(['АМФИТЕАТР', 'СЦЕНА']);
    expect(tugunlar.find((n) => n.nom === 'ЗАТРАТЫ МАШИНИСТОВ')?.yol.at(-1)).toBe('УСТРОЙСТВО БЕТОННЫХ РАБОТ');
    expect(akt.qatorlarJami).toBe(545);
    expect(akt.barglarSoni).toBe(6);
    expect(akt.ogohlantirishlar.map((x) => x.kod)).not.toContain('JAMI_FARQ');
  });

  it('legacy F2: blank row-number + numeric resource code + explicit Кат. binds resource under the current work', () => {
    const rows: Katak[][] = [
      ['Подрядчик: ООО'],
      ['За сентябрь месяц 2026 года'],
      ['№ п/п', 'Шифр', 'Наименование работ и затрат', 'Ед. изм.', 'Количество', null, 'Стоимость, сум', null, 'К оплате, сум', 'Кат.', 'Т'],
      [null, null, null, null, 'на единицу', 'по проектным данным', 'на ед. изм.', 'общая'],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      ['ЗЕМЛЯНЫЕ РАБОТЫ'],
      [1, 'W-1', 'РАЗРАБОТКА ГРУНТА', 'м3', 2, 2, 6, 12, 16],
      [null, '1', 'ЗАТРАТЫ ТРУДА', 'чел-ч', 1, 2, 1, 2, 2, 'ЧЕЛ', 1],
      [null, '2264', 'ЭКСКАВАТОР', 'маш-ч', 0.1, 0.2, 0, 0, 0, 'МАШ', 1],
      [null, 'С', 'ЩЕБЕНЬ', 'м3', 0.5, 1, 10, 10, 10, 'МАТ', 1],
      [null, null, 'ПРЯМЫЕ ЗАТРАТЫ — ВСЕГО', 'СУМ', null, null, null, 12, 16],
      [null, null, 'Прямые затраты: материалы (МАТ)', null, null, null, null, 10],
      [null, null, 'Прочие расходы подрядчика, %', null, null, null, 18, 2.16],
      [null, null, 'НДС, %', null, null, null, 12, 1.46],
    ];
    const [act] = f2AktlarniOqi({ fayl: 'legacy-f2-kat.xlsx', varaqlar: [{ nom: 'Акт Ф-2', rows }] });
    const flat = (nodes: typeof act.daraxt): typeof act.daraxt => nodes.flatMap((node) => [node, ...flat(node.bolalar)]);
    const work = flat(act.daraxt).find((node) => node.tur === 'bl')!;
    expect(work.nom).toBe('РАЗРАБОТКА ГРУНТА');
    expect(work.bolalar.map((node) => node.nom)).toEqual(['ЗАТРАТЫ ТРУДА', 'ЭКСКАВАТОР', 'ЩЕБЕНЬ']);
    expect(act.anatomiya.review.filter((review) => [8, 9, 10].includes(review.manzil?.qator ?? -1))).toEqual([]);
    expect(act.qatorlarJami).toBe(12);
    expect(act.jami.pryamye).toBe(12);
    expect(act.ogohlantirishlar.map((warning) => warning.kod)).not.toContain('JAMI_FARQ');
    expect(act.anatomiya.review.filter((review) => review.kod === 'f2_podval_qatori')).toHaveLength(3);
    expect(act.anatomiya.review.filter((review) => review.kod === 'noaniq_qator')).toEqual([]);
  });
});
