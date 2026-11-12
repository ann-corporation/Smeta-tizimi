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
