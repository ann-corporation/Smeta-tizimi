/** Real chizmalarda uchragan formatlar muammosi — SINTETIK fixturalar (real nom/miqdor yo'q): shtamp belgisi, qator siljishi, jami massa ustuni, izohdagi Ø. */
import { describe, expect, it } from 'vitest';
import type { MatnBo } from './jadval';
import { sahifaniTahlilQil, shtampBelgisi } from './tahlil';
import { bolimXaritasi, moslash, type SmetaQator } from './moslash';

const T = (s: string, x: number, y: number, sahifa = 1): MatnBo => ({ s, x, y, w: s.length * 5, h: 8, sahifa });
const filler = (sahifa = 1): MatnBo[] => Array.from({ length: 8 }, (_, i) => T('t' + i, 10 + i * 40, 900, sahifa));

describe('shtamp: «Лист» + prefiks + raqam', () => {
  it('prefiks va varaq raqami alohida kataklarda -> КР-5', () => {
    const it1 = [T('КР', 1040, 650), T('Стадия', 1000, 700), T('Лист', 1050, 700), T('Листов', 1100, 700), T('РП', 1000, 720), T('5', 1058, 720), T('75', 1100, 720)];
    expect(shtampBelgisi(it1)).toBe('КР-5');
  });
  it('prefiks bo‘lmasa shtamp belgi bermaydi (soxta belgi o‘ylab topilmaydi)', () => {
    expect(shtampBelgisi([T('Лист', 1050, 700), T('5', 1058, 720)])).toBeNull();
  });
});

describe('beton qatori: son va birlik bir oz siljigan chiziqda, «кл.» siz yozuv', () => {
  it('nom, son va m3 turli y (±3) da ham olinadi; sonsiz izoh olinmaydi', () => {
    const items = [
      ...filler(), T('Лист', 1050, 700), T('КР', 1040, 650), T('7', 1058, 720),
      T('Бетон кл. В20', 200, 100), T('54.470', 400, 103), T('м³', 480, 100),
      T('Бетон В7.5', 200, 130), T('1,5', 400, 133), T('м³', 480, 130),
      T('Бетон кл. В25', 200, 160),
    ];
    const r = sahifaniTahlilQil(items, 1);
    expect(r.varaq).toBe('КР-7');
    expect(r.elementlar.filter((e) => e.tur === 'beton').map((e) => `${e.nom}=${e.miqdor}`)).toEqual(['Бетон кл. В20=54.47', 'Бетон кл. В7.5=1.5']);
  });
});

describe('armatura: jami massa ustuni («Приме-» ostida)', () => {
  const jadval = (): MatnBo[] => [
    ...filler(), T('Лист', 1050, 700), T('КР', 1040, 650), T('9', 1058, 720),
    T('Спецификация элементов', 100, 20), T('Кол.', 300, 50), T('Масса ед.', 340, 50), T('Приме-', 400, 50),
    T('Ø12AIII', 100, 90), T('L=1100 мм', 160, 90), T('257', 300, 90), T('0.9761', 345, 90), T('250.8578', 400, 90),
    T('L=5350 мм', 160, 120), T('7', 300, 120), T('3.2968', 345, 120), T('23.0776', 402, 121),      // bar pozitsiyasi (Ø) alohida qatorda
    T('= п.м', 150, 150), T('274.60', 250, 150), T('5.05', 345, 150), T('1387.55', 400, 150),       // to'r qatori
    T('Бетон кл. В20', 100, 200), T('43,25', 345, 200), T('м³', 420, 200),                           // beton: massa ustunida emas
    T('Ø10 АIII', 2000, 300), T('400', 2100, 300), T('400', 2150, 300), T('400', 2200, 300),        // jadvaldan tashqaridagi izoh
  ];
  it('har qator (Ø yoki to‘r) massasi ustun bo‘yicha yig‘iladi; izoh va beton hajmi kirmaydi', () => {
    const r = sahifaniTahlilQil(jadval(), 1);
    const a = r.elementlar.find((e) => e.tur === 'armatura')!;
    expect(a.birlik).toBe('кг'); expect(a.miqdor).toBeCloseTo(250.8578 + 23.0776 + 1387.55, 3); expect(a.ogohlantirish).toContain('tor');
    expect(r.elementlar.find((e) => e.tur === 'beton')!.miqdor).toBe(43.25);
  });
});

describe('armatura massasi: po‘lat plastina chiqariladi, butun son, sarlavhadan chapdagi jadval', () => {
  it('plastina (ГОСТ 19903, -20x80x80) armaturaga kirmaydi; anchorli butun massa kirishi; unvondan chapdagi ikkinchi jadval ham', () => {
    const items = [
      ...filler(), T('Спецификация элементов', 800, 20),
      T('Кол.', 900, 50), T('Масса ед.', 940, 50), T('Приме-', 1000, 50),
      T('ГОСТ 5781-82', 700, 90), T('Ø20AIII', 780, 90), T('L=5900 мм', 840, 90), T('4', 900, 90), T('14.543', 940, 90), T('1047.090', 1000, 90),
      T('ГОСТ 19903-74', 700, 120), T('-20x80x80 мм', 780, 120), T('8', 900, 120), T('1.005', 940, 120), T('144.691', 1000, 120),   // plastina
      T('ГОСТ 5781-82', 700, 150), T('Ø10AIII', 780, 150), T('L=900 мм', 840, 150), T('10', 900, 150), T('2.1', 940, 150), T('21', 1002, 150), // butun massa
      T('Кол.', 400, 300), T('Масса ед.', 440, 300), T('Приме-', 500, 300),                                                        // unvondan chapda
      T('ГОСТ 5781-82', 200, 330), T('Ø12AIII', 280, 330), T('L=500 мм', 330, 330), T('2', 400, 330), T('0.444', 440, 330), T('0.888', 500, 330),
    ];
    const a = sahifaniTahlilQil(items, 1).elementlar.find((e) => e.tur === 'armatura')!;
    expect(a.miqdor).toBeCloseTo(1047.09 + 21 + 0.888, 3);
  });
});

describe('АР: eshik/oyna vedomosti (ko‘p qatorli sarlavha) va ko‘p qatorli nomli spetsifikatsiya', () => {
  it('oyna vedomosti: son va umumiy maydon sarlavha x-holatidan; maydon = bitta × son tekshiruvi', () => {
    const items = [
      ...filler(), T('Количество', 300, 50), T('Площадь, м²', 380, 55), T('Длина', 470, 55),
      T('Витражи', 100, 100), T('Витраж наружный', 100, 130), T('2370х1470', 200, 130), T('2400', 258, 130),
      T('18', 305, 131), T('-', 340, 131), T('3.48', 385, 131), T('62.71', 420, 131), T('1.5', 480, 131),
      T('Витраж внутренний', 100, 160), T('1000х1000', 200, 160), T('4', 305, 161), T('1.0', 385, 161), T('9.0', 420, 161),   // 4 × 1.0 ≠ 9.0
    ];
    const e = sahifaniTahlilQil(items, 1).elementlar.filter((x) => x.profil === 'satr_oyna');
    expect(e.map((x) => [x.birlik, x.miqdor])).toEqual([['шт', 18], ['м2', 62.71], ['шт', 4], ['м2', 9]]);
    expect(e[0].nom).toContain('Витражи'); expect(e[0].nom).toContain('2370х1470');
    expect(e[0].ogohlantirish).toEqual([]); expect(e[2].ogohlantirish).toContain('maydon_mos_emas'); expect(e[2].ishonch).toBeLessThan(e[0].ishonch);
  });
  it('spetsifikatsiya: nom ko‘p qatorli va raqam qatoriga nisbatan vertikal markazlangan; birlik sarlavhasiz ustunda', () => {
    const items = [
      ...filler(), T('Наименование', 200, 40), T('Кол.', 400, 40),
      T('Входная группа', 150, 100), T('4', 405, 100), T('шт', 470, 100),
      T('Панели толщ. 20мм', 205, 150), T('с облицовкой', 205, 160), T('17.63', 405, 160), T('м²', 470, 160), T('декоративной', 205, 170),
    ];
    const e = sahifaniTahlilQil(items, 1).elementlar.filter((x) => x.profil === 'satr_spes');
    expect(e.map((x) => [x.nom, x.miqdor, x.birlik])).toEqual([['Входная группа', 4, 'шт'], ['Панели толщ. 20мм с облицовкой декоративной', 17.63, 'м²']]);
    expect(e[1].ogohlantirish).toContain('kop_qatorli');
  });
});

describe('sahifa AI ga faqat jadval kalit so‘zi bo‘lsa taklif qilinadi', () => {
  it('reja (kalit so‘zsiz) -> AI kerak emas; «Спецификация» bor, qoida o‘qimadi -> AI', () => {
    const reja = sahifaniTahlilQil(filler(), 1);
    expect(reja.aiTaklifi).toBe(false); expect(reja.sabab).toBe('jadval_yoq');
    const jad = sahifaniTahlilQil([...filler(), T('Спецификация', 10, 20)], 1);
    expect(jad.aiTaklifi).toBe(true);
  });
});

describe('beton sinfi ish turiga mos (bl qatorlari nomida sinf yo‘q)', () => {
  const smeta: SmetaQator[] = [
    { id: 1, ota_id: null, tur: 'rz', nom: 'ФУНДАМЕНТ (КР-5)', birlik: null, hajm: null, narx: null },
    { id: 2, ota_id: 1, tur: 'bl', nom: 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', birlik: 'м3', hajm: 8.9, narx: 1 },
    { id: 3, ota_id: 1, tur: 'bl', nom: 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ ЖЕЛЕЗОБЕТОННЫХ', birlik: 'м3', hajm: 43.25, narx: 1 },
  ];
  const x = bolimXaritasi(smeta);
  it('В20 -> konstruktiv qator, В7.5 -> tayyorgarlik; ish qatorlari bl', () => {
    expect(moslash({ nom: 'Бетон кл. В20', birlik: 'м3', tur: 'beton', varaq: 'КР-5' }, smeta, x).nomzodlar[0].qatorId).toBe(3);
    expect(moslash({ nom: 'Бетон кл. В7.5', birlik: 'м3', tur: 'beton', varaq: 'КР-5' }, smeta, x).nomzodlar[0].qatorId).toBe(2);
  });
});
