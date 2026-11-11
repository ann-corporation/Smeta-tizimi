import { describe, expect, it } from 'vitest';
import { aktualQator, bogniAktualla, ESKI_VERSIYA_SABAB, faktDeltaReja, faktMavjudYigish, FAKT_BOR_SABAB, vorisXaritasi, xotiraniAktualla, type AQator } from './aktual';

// Sun'iy smeta: eski versiya (1xx, almashtirilgan) va yangi faol (2xx). Kod/tartib o'zgargan.
const Q: AQator[] = [
  { id: 101, otaId: null, kod: 'A-1', nom: 'ТЕСТ ИШ ОДИН', birlik: 'М3', faol: false },
  { id: 102, otaId: 101, kod: '000001', nom: 'ТРУД', birlik: 'ЧЕЛ-Ч', faol: false },
  { id: 103, otaId: null, kod: 'A-2', nom: 'ТЕСТ ИШ ДВА', birlik: 'М2', faol: false },
  { id: 104, otaId: null, kod: 'A-9', nom: 'УДАЛЕННЫЙ ИШ', birlik: 'ШТ', faol: false },
  { id: 201, otaId: null, kod: 'A-1', nom: 'ТЕСТ ИШ ОДИН', birlik: 'М3', faol: true },
  { id: 202, otaId: 201, kod: '000001', nom: 'ТРУД', birlik: 'ЧЕЛ-Ч', faol: true },
  { id: 203, otaId: null, kod: 'B-7', nom: 'ТЕСТ ИШ ДВА', birlik: 'М2', faol: true },
];
const JUFT = [{ eskiId: 101, yangiId: 201 }, { eskiId: 103, yangiId: 203 }];
const FAOL = new Set(Q.filter((q) => q.faol).map((q) => q.id));

describe('voris zanjiri', () => {
  const voris = vorisXaritasi(Q, JUFT);
  it('moslik juftlari + rs bolalari ota vorisi ostida topiladi', () => {
    expect(voris.get(101)).toBe(201);
    expect(voris.get(103)).toBe(203);
    expect(voris.get(102)).toBe(202);
    expect(voris.has(104)).toBe(false);
  });
  it('eski qator — faol qatorga yo‘naltiriladi; faol o‘zi; zanjirsiz — sabab', () => {
    expect(aktualQator(101, FAOL, voris)).toEqual({ qatorId: 201, almashgan: true });
    expect(aktualQator(201, FAOL, voris)).toEqual({ qatorId: 201, almashgan: false });
    expect(aktualQator(104, FAOL, voris)).toEqual({ qatorId: null, sabab: ESKI_VERSIYA_SABAB });
  });
  it('faol qatorga ishora qilmaydigan juft e‘tiborga olinmaydi', () => {
    expect(vorisXaritasi(Q, [{ eskiId: 101, yangiId: 103 }]).has(101)).toBe(false);
  });
  it('bog‘lanishlar aktuallanadi: eski → voris, zanjirsiz → rad', () => {
    const bog = new Map([['u1', { qatorId: 101 }], ['u2', { qatorId: 104 }], ['u3', { qatorId: 203 }]]);
    const r = bogniAktualla(bog, FAOL, voris);
    expect(r.bog.get('u1')?.qatorId).toBe(201);
    expect(r.bog.get('u3')?.qatorId).toBe(203);
    expect(r.bog.has('u2')).toBe(false);
    expect(r.rad).toEqual([{ uid: 'u2', eskiId: 104, sabab: ESKI_VERSIYA_SABAB }]);
    expect(r.almashgan).toEqual([{ uid: 'u1', eskiId: 101, yangiId: 201 }]);
  });
  it('xotira imzolari aktuallanadi', () => {
    const r = xotiraniAktualla(new Map([['i1', 102], ['i2', 104]]), FAOL, voris);
    expect([...r.xotira]).toEqual([['i1', 202]]);
    expect(r.tashlandi).toBe(1);
  });
});

describe('fakt delta', () => {
  const voris = vorisXaritasi(Q, JUFT);
  it('mavjud fakt eski qatordagi bilan birga faol qatorga yig‘iladi (ikki marta sanalmaydi)', () => {
    const { mavjud, yetim } = faktMavjudYigish([{ qatorId: 101, hajm: 4 }, { qatorId: 201, hajm: 1 }, { qatorId: 104, hajm: 9 }], FAOL, voris);
    expect(mavjud.get(201)).toBe(5);
    expect(yetim).toBe(1);
  });
  it('tizimda bor qator yozilmaydi; musbat delta yoziladi; smetadan oshsa — faqat ogohlantirish', () => {
    const s = (qatorId: number, faylHajm: number, smetaHajm: number | null, tur = 'bl') => ({ qatorId, tur, kod: 'k', nom: 'n', birlik: 'М3', faylHajm, smetaHajm });
    const reja = faktDeltaReja([s(201, 5, 100), s(203, 12, 10), s(202, 3, 50, 'rs'), s(104, 0, 5)], new Map([[201, 5], [203, 4]]));
    expect(reja.yoziladi.map((x) => [x.qatorId, x.delta])).toEqual([[203, 8]]);
    expect(reja.yoziladi[0].ogohlantirish).toMatch(/oshadi/);
    expect(reja.bor.find((x) => x.qatorId === 201)?.sabab).toBe(FAKT_BOR_SABAB);
    expect(reja.bor.find((x) => x.qatorId === 202)?.sabab).toMatch(/resurs/);
    expect(reja.bor.find((x) => x.qatorId === 104)?.sabab).toMatch(/≤ 0/);
  });
});
