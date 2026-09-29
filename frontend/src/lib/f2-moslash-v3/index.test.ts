import { describe, expect, it } from 'vitest';
import { f2Imzo, f2MoslashV3, rzKalit, type SmetaQator } from './index';
import type { F2Tugun } from '../smeta-anatomiya/f2';

let sid = 0;
const S: SmetaQator[] = [];
function rz(nom: string, ota: number | null = null) { const id = ++sid; S.push({ id, otaId: ota, tur: 'rz', kod: null, nom, birlik: null, hajm: null, tartib: id }); return id; }
function ish(ota: number, kod: string, nom: string, birlik: string, hajm: number, resurslar: Array<[string, string, string, number]> = []) {
  const id = ++sid;
  S.push({ id, otaId: ota, tur: 'bl', kod, nom, birlik, hajm, tartib: id });
  for (const [k, n, b, norma] of resurslar) { const r = ++sid; S.push({ id: r, otaId: id, tur: 'rs', kod: k, nom: n, birlik: b, hajm: norma * hajm, tartib: r }); }
  return id;
}

// Smeta: bir xil shifr uch lokal smetada; bir xil ish ikki varaqda (egizak); beton markasi farqli.
const L1 = rz('РАЗДЕЛ: СМЕТА № 02-01 НА ОБЪЕДИНЁННЫЙ ВОДОПРОВОД');
const L1z = rz('РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ-3)', L1);
const W1 = ish(L1z, 'E1-1-195-19 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', 4.3524, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 3.72], ['001942', 'ЭКСКАВАТОРЫ', 'МАШ-Ч', 7.85]]);
const L2 = rz('РАЗДЕЛ: СМЕТА № 01 НА НАСОСНАЯ №1');
const L2z = rz('РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ-24)', L2);
const W2 = ish(L2z, 'E1-1-195-19 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', 0.617, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 3.72], ['001942', 'ЭКСКАВАТОРЫ', 'МАШ-Ч', 7.85]]);
const L3 = rz('РАЗДЕЛ: СМЕТА № 01-01 НА КОНСТРУКТИВНАЯ ЧАСТЬ-ОЗЕРА');
const L3a = rz('РАЗДЕЛ: ПОДПОРНАЯ СТЕНА (ЛИСТ.-8)', L3);
const E1 = ish(L3a, 'E6-1-24-3', 'УСТРОЙСТВО СТЕН ПОДПОРНЫХ', '100М3', 2, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 1051], ['12-575-3', 'БЕТОН В15 W6', 'М3', 101.5]]);
const L3b = rz('РАЗДЕЛ: ПОДПОРНАЯ СТЕНА (ЛИСТ.-9)', L3);
const E2 = ish(L3b, 'E6-1-24-3', 'УСТРОЙСТВО СТЕН ПОДПОРНЫХ', '100М3', 2, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 1051], ['12-575-3', 'БЕТОН В15 W6', 'М3', 101.5]]);
const L3c = rz('РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)', L3);
const B25 = ish(L3c, 'E6-1-1-22', 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ', '100М3', 1, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 180], ['12-575-5', 'БЕТОН В25 W6', 'М3', 101.5]]);
const B15 = ish(L3c, 'E6-1-1-22', 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ', '100М3', 1.5, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 180], ['12-575-3', 'БЕТОН В15 W6', 'М3', 101.5]]);
const P1 = ish(L3c, 'E14-1-1', 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', 'Т', 0.5);
const K1 = ish(L3c, 'E7-1-1', 'КОЛЬЦА СТЕНОВЫЕ ПК', 'ШТ', 10);

let fu = 0;
function f(tur: F2Tugun['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null, yol: string[], bolalar: F2Tugun[] = [], norma?: number): F2Tugun {
  const u = `F!${++fu}`;
  return { uid: u, tur, kod, nom, birlik, hajm, narx: null, summa: null, norma, manzil: { fayl: 'f', varaq: 'F', qator: fu }, yol, bolalar, barg: !bolalar.length };
}
const rzF = (nom: string, yol: string[], bolalar: F2Tugun[]) => ({ ...f('rz', null, nom, null, null, yol), bolalar, barg: false });

describe('F2 moslash V3 — qavatma-qavat ball (Tizim1 himoyalari bilan)', () => {
  it('lokal smeta raqami F2 da boshqa ("01-01" ↔ "02-01") — nom bo‘yicha to‘g‘ri doira, aniq', () => {
    expect(rzKalit('СМЕТА № 01-01 НА ОБЪЕДИНЁННЫЙ ВОДОПРОВОД')).toBe(rzKalit('РАЗДЕЛ: СМЕТА № 02-01 НА ОБЪЕДИНЁННЫЙ ВОДОПРОВОД'));
    const yol = ['СМЕТА № 01-01 НА ОБЪЕДИНЁННЫЙ ВОДОПРОВОД'];
    const w = f('bl', 'E1-1-195-19 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', 4.3524, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 16.19, [...yol, 'x'], [], 3.72),
      f('rs', '001942', 'ЭКСКАВАТОРЫ', 'МАШ-Ч', 34.17, [...yol, 'x'], [], 7.85),
    ]);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S);
    expect(n.natijalar.get(w.uid)).toMatchObject({ holat: 'aniq', qatorId: W1 });
    expect(n.natijalar.get(w.bolalar[0].uid)).toMatchObject({ holat: 'aniq' });
    expect(W2).toBeGreaterThan(0);
  });

  it('bir xil shifr — resurs tarkibi (БЕТОН В15 ↔ В25) ajratadi', () => {
    const yol = ['РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)'];
    const w = f('bl', 'E6-1-1-22', 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ', '100М3', 0.7, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 126, yol, [], 180),
      f('rs', '12-575-5', 'БЕТОН В25 W6', 'М3', 71, yol, [], 101.5),
    ]);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S);
    const r = n.natijalar.get(w.uid)!;
    expect(r.qatorId).toBe(B25);
    expect(r.nomzodlar.find((x) => x.qatorId === B15)!.ball).toBeLessThan(r.nomzodlar[0].ball);
  });

  it('egizaklar (ЛИСТ-8 va ЛИСТ-9 da aynan bir xil ish) — tartib bo‘yicha TAKLIF (avto-tasdiq emas), ikkinchisi ikkinchiga', () => {
    const yol = ['СМЕТА № 01-01 НА КОНСТРУКТИВНАЯ ЧАСТЬ-ОЗЕРА', 'РАЗДЕЛ: ПОДПОРНАЯ СТЕНА (ЛИСТ.-8,9)'];
    const mk = () => f('bl', 'E6-1-24-3', 'УСТРОЙСТВО СТЕН ПОДПОРНЫХ', '100М3', 1, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 1051, yol, [], 1051),
      f('rs', '12-575-3', 'БЕТОН В15 W6', 'М3', 101.5, yol, [], 101.5),
    ]);
    const a = mk(), b = mk();
    const n = f2MoslashV3([rzF(yol[0], [], [rzF(yol[1], [yol[0]], [a, b])])], S);
    expect(n.natijalar.get(a.uid)).toMatchObject({ holat: 'taklif', qatorId: E1, usul: 'tartib' });
    expect(n.natijalar.get(b.uid)).toMatchObject({ holat: 'taklif', qatorId: E2, usul: 'tartib' });
  });

  it('F2 razdeli smeta razdeliga bog‘langan, ichida ish yo‘q — boshqa razdeldan TAKLIF yo‘q (egasi sinovi: fasad ↔ pol)', () => {
    // «ФУНДАМЕНТ (ЛИСТ.-11)» razdelida «УСТРОЙСТВО СТЕН ПОДПОРНЫХ» yo'q (u ПОДПОРНАЯ СТЕНА da).
    const yol = ['РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)'];
    const w = f('bl', 'E6-1-24-3', 'УСТРОЙСТВО СТЕН ПОДПОРНЫХ', '100М3', 0.5, yol);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S);
    const r = n.natijalar.get(w.uid)!;
    expect(r.holat).toBe('topilmadi');
    expect(r.qatorId).toBeNull();
    expect(r.nomzodlar.length).toBeGreaterThan(0); // variant sifatida ko'rsatiladi
    expect(r.sabab).toMatch(/zamena|qo‘shimcha/);
  });

  it('razdel ichida nomi va birligi aynan bir xil yagona qator — ✓ (ball chegarasidan qat’i nazar)', () => {
    const yol = ['РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)'];
    const w = f('bl', 'С', 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', 'Т', 0.1, yol);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S, { avtoMin: 999 });
    expect(n.natijalar.get(w.uid)).toMatchObject({ holat: 'aniq', qatorId: P1, usul: 'nom_aynan' });
  });

  it('birlik qalqoni: Т ↔ КГ hech qachon avto bog‘lanmaydi', () => {
    const yol = ['РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)'];
    const w = f('bl', 'E14-1-1', 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', 'КГ', 500, yol);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S);
    const r = n.natijalar.get(w.uid)!;
    expect(r.holat).toBe('topilmadi');
    expect(r.nomzodlar[0].qatorId).toBe(P1);
    expect(r.nomzodlar[0].sabab.join()).toMatch(/birlik ✗/);
  });

  it('marka farqi (ПК ↔ ПБ) — ehtimoliy zamena, avto emas', () => {
    const yol = ['РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)'];
    const w = f('bl', 'E7-1-1', 'КОЛЬЦА СТЕНОВЫЕ ПБ', 'ШТ', 5, yol);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S);
    const r = n.natijalar.get(w.uid)!;
    expect(r.holat).toBe('topilmadi');
    expect(r.nomzodlar[0].qatorId).toBe(K1);
    expect(r.sabab).toMatch(/zamena/);
  });

  it('ish ichida yo‘q resurs — zamena material/qo‘shimcha resurs sifatida topilmadi', () => {
    const yol = ['РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)'];
    const w = f('bl', 'E6-1-1-22', 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ', '100М3', 1, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 180, yol, [], 180),
      f('rs', '12-575-5', 'БЕТОН В25 W6', 'М3', 101.5, yol, [], 101.5),
      f('rs', '12-575-9', 'БЕТОН В30 W8', 'М3', 5, yol, [], 5),
    ]);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S);
    expect(n.natijalar.get(w.bolalar[2].uid)).toMatchObject({ holat: 'topilmadi' });
    expect(n.natijalar.get(w.bolalar[2].uid)!.sabab).toMatch(/zamena material|qo‘shimcha resurs/);
  });

  it('xotira: o‘tgan oyda tasdiqlangan bog‘lanish birinchi', () => {
    const yol = ['БОШҚА НОМ'];
    const w = f('bl', 'E1-1-195-19 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', 0.1, yol);
    const xotira = new Map([[f2Imzo(w), W2]]);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S, { xotira });
    expect(n.natijalar.get(w.uid)).toMatchObject({ holat: 'xotira', qatorId: W2 });
  });

  it('smetada umuman yo‘q ish — topilmadi, qo‘shimcha ish taklif qilinadi', () => {
    const w = f('bl', 'E99-9-9', 'УСТАНОВКА СКАМЕЕК ПАРКОВЫХ', 'ШТ', 3, ['ЛЮБОЙ']);
    const n = f2MoslashV3([rzF('ЛЮБОЙ', [], [w])], S);
    expect(n.natijalar.get(w.uid)).toMatchObject({ holat: 'topilmadi' });
    expect(n.natijalar.get(w.uid)!.sabab).toMatch(/qo‘shimcha/);
  });
it('bitta F2 da o‘sha ish bir necha qism (smetada bitta qator) — takror qism o‘sha qatorga, resurslari bilan; qoldiqdan oshsa ◐', () => {
    const yol = ['СМЕТА № 01-01 НА ОБЪЕДИНЁННЫЙ ВОДОПРОВОД'];
    const mk = (h: number) => f('bl', 'E1-1-195-19 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', h, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 3.72 * h, [...yol, 'x'], [], 3.72),
      f('rs', '001942', 'ЭКСКАВАТОРЫ', 'МАШ-Ч', 7.85 * h, [...yol, 'x'], [], 7.85),
    ]);
    const a = mk(1.5), b = mk(2), c = mk(1);
    const n = f2MoslashV3([rzF(yol[0], [], [a, b, c])], S);
    expect(n.natijalar.get(a.uid)).toMatchObject({ holat: 'aniq', qatorId: W1 });
    expect(n.natijalar.get(b.uid)).toMatchObject({ holat: 'aniq', qatorId: W1, usul: 'takror' });
    expect(n.natijalar.get(b.bolalar[1].uid)).toMatchObject({ holat: 'aniq' });
    // 1,5 + 2 + 1 = 4,5 > 4,3524 — operator tasdiqlaydi, ogohlantirish bilan.
    const r = n.natijalar.get(c.uid)!;
    expect(r).toMatchObject({ holat: 'taklif', qatorId: W1, usul: 'takror' });
    expect(r.sabab).toMatch(/qoldiqdan oshdi/);
  });

  it('ish = resurslar massivi: ekspertizadan keyin kran boshqa (16 t гусеничный → 25 т автомобильный) — zamena taklifi; smetada yo‘q material — qo‘shimcha resurs', () => {
    const rzId = rz('РАЗДЕЛ: МОНТАЖ КРАНОМ');
    const w = ish(rzId, 'E9-1-1-1', 'МОНТАЖ КОЛОНН', 'Т', 10, [['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 5], ['000780', 'КРАНЫ НА ГУСЕНИЧНОМ ХОДУ 16 Т', 'МАШ-Ч', 2]]);
    const kranId = S.find((x) => x.otaId === w && x.kod === '000780')!.id;
    const yol = ['РАЗДЕЛ: МОНТАЖ КРАНОМ'];
    const fw = f('bl', 'E9-1-1-1', 'МОНТАЖ КОЛОНН', 'Т', 4, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 20, yol, [], 5),
      f('rs', '000762', 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 25 Т', 'МАШ-Ч', 8, yol, [], 2),
      f('rs', '030407', 'ГВОЗДИ СТРОИТЕЛЬНЫЕ', 'Т', 0.01, yol, [], 0.0025),
    ]);
    const n = f2MoslashV3([rzF(yol[0], [], [fw])], S);
    expect(n.natijalar.get(fw.bolalar[0].uid)).toMatchObject({ holat: 'aniq' });
    expect(n.natijalar.get(fw.bolalar[1].uid)?.tavsiya).toEqual({ tur: 'zamena', qatorId: kranId, sabab: expect.stringContaining('КРАНЫ НА ГУСЕНИЧНОМ') });
    expect(n.natijalar.get(fw.bolalar[2].uid)?.tavsiya).toMatchObject({ tur: 'qoshimcha' });
  });
});
