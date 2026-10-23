import { describe, expect, it } from 'vitest';
import { f2Imzo, f2MoslashV3, gradeFarq, rzKalit, texnikTafsilotFarqlari, type SmetaQator } from './index';
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

  it('texnik spetsifikatsiya lotin/kirill va yozuv farqidan qat’i nazar farqni taniydi', () => {
    expect(gradeFarq('БЕТОН B15 W6', 'бетон В25 W6')).toBe(true);
    expect(gradeFarq('БЕТОН B25 W6', 'бетон В25 W6')).toBe(false);
    expect(texnikTafsilotFarqlari('АРМАТУРА A400', 'Арматура А500')).toContain('armatura klassi');
    expect(texnikTafsilotFarqlari('Бетон В25 W6 F150', 'Бетон B25 W8 F150')).toContain('suv o‘tkazmaslik markasi');
    expect(texnikTafsilotFarqlari('АРМАТУРА А-I ДИАМ. 8 ММ', 'АРМАТУРА A-III ДИАМ. 8 ММ')).toContain('armatura markasi');
    expect(texnikTafsilotFarqlari('АРМАТУРА А-III ДИАМ. 8 ММ', 'АРМАТУРА А-III ДИАМ. 10 ММ')).toContain('diametr');
    expect(texnikTafsilotFarqlari('АРМАТУРА А-III ДИАМ. 22 ММ', 'АРМАТУРА А-III ДИАМ. 25 ММ')).toContain('diametr');
  });

  it('BL shifri va nomi bir xil bo‘lsa ham resursdagi beton klassi farqi avto bog‘lashni bloklaydi', () => {
    const sectionId = rz('РАЗДЕЛ: ТЕХНИЧЕСКАЯ ПРОВЕРКА');
    const workId = ish(sectionId, 'TECH-GRADE-WORK-001', 'УСТРОЙСТВО МОНОЛИТНОГО ОСНОВАНИЯ', '100М3', 2, [
      ['000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 10],
      ['TECH-CONCRETE-001', 'БЕТОН В15 W6', 'М3', 4],
    ]);
    const yol = ['РАЗДЕЛ: ТЕХНИЧЕСКАЯ ПРОВЕРКА'];
    const fWork = f('bl', 'TECH-GRADE-WORK-001', 'УСТРОЙСТВО МОНОЛИТНОГО ОСНОВАНИЯ', '100М3', 2, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 20, yol, [], 10),
      f('rs', 'TECH-CONCRETE-001', 'БЕТОН B25 W6', 'М3', 8, yol, [], 4),
    ]);
    const result = f2MoslashV3([rzF(yol[0], [], [fWork])], S).natijalar.get(fWork.uid)!;

    expect(result.qatorId).not.toBe(workId);
    expect(result.holat).not.toBe('aniq');
    expect(result.nomzodlar.some((n) => n.qatorId === workId && n.qavatlar.some((q) => q.nom === 'texnik_tafsilot' && q.ball < 0))).toBe(true);
    const resourceResult = f2MoslashV3([rzF(yol[0], [], [fWork])], S).natijalar.get(fWork.bolalar[1].uid)!;
    expect(resourceResult.holat).toBe('topilmadi');
  });

  it('bir xil ish nomzodlarida resurs klassi to‘g‘ri qatorni ajratadi, boshqa klass avto tanlanmaydi', () => {
    const sectionId = rz('РАЗДЕЛ: КЛАСС БЕТОНА ТЕСТИ');
    const wrongId = ish(sectionId, 'TECH-GRADE-CHOICE-001', 'УСТРОЙСТВО ТЕСТОВОГО ОСНОВАНИЯ', '100М3', 2, [
      ['TECH-GRADE-MATERIAL-001', 'БЕТОН В15', 'М3', 4],
    ]);
    const rightId = ish(sectionId, 'TECH-GRADE-CHOICE-001', 'УСТРОЙСТВО ТЕСТОВОГО ОСНОВАНИЯ', '100М3', 2, [
      ['TECH-GRADE-MATERIAL-001', 'БЕТОН В25', 'М3', 4],
    ]);
    const yol = ['РАЗДЕЛ: КЛАСС БЕТОНА ТЕСТИ'];
    const fWork = f('bl', 'TECH-GRADE-CHOICE-001', 'УСТРОЙСТВО ТЕСТОВОГО ОСНОВАНИЯ', '100М3', 2, yol, [
      f('rs', 'TECH-GRADE-MATERIAL-001', 'БЕТОН B25', 'М3', 8, yol, [], 4),
    ]);
    const result = f2MoslashV3([rzF(yol[0], [], [fWork])], S).natijalar.get(fWork.uid)!;

    expect(result).toMatchObject({ holat: 'aniq', qatorId: rightId });
    expect(result.qatorId).not.toBe(wrongId);
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

  it('mustaqil MAT/OB qatori BL ota yoki RZ ga emas, faqat mos smeta bargiga bog‘lanadi', () => {
    const yol = ['РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)'];
    const matParent = rz('РАЗДЕЛ: МАТЕРИАЛЫ');
    const onlyWork = ish(matParent, 'MAT-EXACT', 'БЛОКИ ДВЕРНЫЕ ПВХ', 'ШТ', 3);
    const matId = ++sid;
    S.push({ id: matId, otaId: L3c, tur: 'mat', kod: 'MAT-EXACT-2', nom: 'БЛОКИ ОКОННЫЕ ПВХ', birlik: 'ШТ', hajm: 4, tartib: matId });
    const mat = f('mat', 'MAT-EXACT', 'БЛОКИ ДВЕРНЫЕ ПВХ', 'ШТ', 1, yol);
    const root = rzF(yol[0], [], [mat]);
    const n1 = f2MoslashV3([root], S);
    expect(n1.natijalar.get(mat.uid)?.qatorId).not.toBe(onlyWork);
    expect(n1.natijalar.get(mat.uid)?.holat).toBe('topilmadi');

    const exactMat = f('mat', 'MAT-EXACT-2', 'БЛОКИ ОКОННЫЕ ПВХ', 'ШТ', 1, yol);
    const n2 = f2MoslashV3([rzF(yol[0], [], [exactMat])], S);
    expect(n2.natijalar.get(exactMat.uid)?.qatorId).toBe(matId);
    expect(n2.natijalar.get(exactMat.uid)?.holat).not.toBe('topilmadi');
  });

  it('explicit row type is a hard matching boundary; only unmarked legacy work keeps the leaf suggestion', () => {
    const id = ++sid;
    S.push({ id, otaId: L3c, tur: 'ob', kod: 'TYPE-BOUNDARY', nom: 'СВЕТИЛЬНИК', birlik: 'ШТ', hajm: 3, tartib: id });
    const yol = ['РАЗДЕЛ: ФУНДАМЕНТ (ЛИСТ.-11)'];
    const markedMaterial = Object.assign(f('mat', 'TYPE-BOUNDARY', 'СВЕТИЛЬНИК', 'ШТ', 1, yol), { texnikBelgi: 'mat' });
    const markedWork = Object.assign(f('bl', 'TYPE-BOUNDARY', 'СВЕТИЛЬНИК', 'ШТ', 1, yol), { texnikBelgi: 'bl' });
    const legacyUnmarkedWork = f('bl', 'TYPE-BOUNDARY', 'СВЕТИЛЬНИК', 'ШТ', 1, yol);

    const wrongMaterialType = f2MoslashV3([rzF(yol[0], [], [markedMaterial])], S).natijalar.get(markedMaterial.uid)!;
    const wrongWorkType = f2MoslashV3([rzF(yol[0], [], [markedWork])], S).natijalar.get(markedWork.uid)!;
    const legacyReview = f2MoslashV3([rzF(yol[0], [], [legacyUnmarkedWork])], S).natijalar.get(legacyUnmarkedWork.uid)!;

    expect(wrongMaterialType.holat).toBe('topilmadi');
    expect(wrongWorkType.holat).toBe('topilmadi');
    expect(legacyReview.holat).not.toBe('aniq');
    expect(legacyReview.qatorId).toBe(id);
  });

  it('explicit RS resource cannot bind to a same-code MAT child', () => {
    const materialId = ++sid;
    S.push({ id: materialId, otaId: W1, tur: 'mat', kod: 'RS-MAT-BOUNDARY', nom: 'БЕТОН В25', birlik: 'М3', hajm: 2, tartib: materialId });
    const work = Object.assign(f('bl', 'E1-1-195-19 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', 1, ['РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ-3)']), { texnikBelgi: 'bl' });
    const resource = Object.assign(f('rs', 'RS-MAT-BOUNDARY', 'БЕТОН В25', 'М3', 2, []), { texnikBelgi: 'rs' });
    work.bolalar.push(resource);
    const result = f2MoslashV3([rzF('РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ-3)', [], [work])], S);

    expect(result.natijalar.get(work.uid)?.qatorId).toBe(W1);
    expect(result.natijalar.get(resource.uid)?.holat).toBe('topilmadi');
    expect(result.natijalar.get(resource.uid)?.qatorId).not.toBe(materialId);
  });

  it('xotira: o‘tgan oyda tasdiqlangan bog‘lanish birinchi', () => {
    const yol = ['БОШҚА НОМ'];
    const w = f('bl', 'E1-1-195-19 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', 0.1, yol);
    const xotira = new Map([[f2Imzo(w), W2]]);
    const n = f2MoslashV3([rzF(yol[0], [], [w])], S, { xotira });
    expect(n.natijalar.get(w.uid)).toMatchObject({ holat: 'xotira', qatorId: W2 });
  });

  it('eskirgan xotira explicit BL qatorini bir xil identifikatorli MAT qatoriga bog‘lamaydi', () => {
    const matId = ++sid;
    S.push({ id: matId, otaId: L3c, tur: 'mat', kod: 'MEMORY-TYPE-GUARD', nom: 'BETON B25', birlik: 'M3', hajm: 4, tartib: matId });
    const yol = ['BOSHQA SMETA'];
    const work = Object.assign(f('bl', 'MEMORY-TYPE-GUARD', 'BETON B25', 'M3', 1, yol), { texnikBelgi: 'bl' });
    // Eski signature formatida tur belgisi yo‘q: xotira kaliti aynan to‘qnashadi.
    const remembered = new Map([[f2Imzo(work), matId]]);

    const result = f2MoslashV3([rzF(yol[0], [], [work])], S, { xotira: remembered });
    const matched = result.natijalar.get(work.uid)!;
    expect(matched.holat).not.toBe('xotira');
    expect(matched.qatorId).not.toBe(matId);
  });

  it('oldingi tasdiqlangan xotira joriy operator tanlagan boshqa razdel chegarasidan o‘tmaydi', () => {
    const yol = ['РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ-3)'];
    const work = Object.assign(f('bl', 'E1-1-195-19 ШHК.ДОП.11', 'РАЗРАБОТКА ГРУНТА В ОТВАЛ', '1000М3', 4.3524, yol, [
      f('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 16.19, yol, [], 3.72),
      f('rs', '001942', 'ЭКСКАВАТОРЫ', 'МАШ-Ч', 34.17, yol, [], 7.85),
    ]), { texnikBelgi: 'bl' });
    const section = rzF(yol[0], [], [work]);
    const remembered = new Map([[f2Imzo(work), W2]]);
    const sectionBinding = new Map([[section.uid, L1z]]);

    const result = f2MoslashV3([section], S, { xotira: remembered, rzBog: sectionBinding });
    expect(result.natijalar.get(work.uid)).toMatchObject({ holat: 'aniq', qatorId: W1 });
  });

  it('smetada umuman yo‘q ish — topilmadi, qo‘shimcha ish taklif qilinadi', () => {
    const w = f('bl', 'E99-9-9', 'УСТАНОВКА СКАМЕЕК ПАРКОВЫХ', 'ШТ', 3, ['ЛЮБОЙ']);
    const n = f2MoslashV3([rzF('ЛЮБОЙ', [], [w])], S);
    expect(n.natijalar.get(w.uid)).toMatchObject({ holat: 'topilmadi' });
    expect(n.natijalar.get(w.uid)!.sabab).toMatch(/bo‘lim.*hali bog‘lanmagan/);
  });

  it('unmapped F2 section never auto-links a globally unique work from another section', () => {
    const otherSection = rz('SMETA — AMALDAGI BO‘LIM');
    const targetId = ish(otherSection, 'UNMAPPED-SCOPE-001', 'ISH NOMI TO‘LIQ MOS', 'M2', 5);
    const source = f('bl', 'UNMAPPED-SCOPE-001', 'ISH NOMI TO‘LIQ MOS', 'M2', 1, ['F2 DA TOPILMAGAN BO‘LIM']);
    const fSection = rzF('F2 DA TOPILMAGAN BO‘LIM', [], [source]);

    const automatic = f2MoslashV3([fSection], S).natijalar.get(source.uid)!;
    expect(automatic).toMatchObject({ holat: 'topilmadi', qatorId: null });
    expect(automatic.sabab).toMatch(/bo‘lim.*hali bog‘lanmagan/);
    expect(automatic.nomzodlar.some((candidate) => candidate.qatorId === targetId)).toBe(true);

    const taught = f2MoslashV3([fSection], S, { rzBog: new Map([[fSection.uid, otherSection]]) }).natijalar.get(source.uid)!;
    expect(taught).toMatchObject({ holat: 'aniq', qatorId: targetId });
  });

  it('unmapped nested F2 subsection cannot fall back to its matched parent scope', () => {
    const parentName = 'СМЕТА № 01-01 НА КОНСТРУКТИВНАЯ ЧАСТЬ-ОЗЕРА';
    const childName = 'ВНУТРЕННИЙ РАЗДЕЛ БЕЗ СОВПАДЕНИЯ';
    const targetId = ish(L3a, 'NESTED-SCOPE-001', 'ВНУТРЕННИЙ ТЕСТОВЫЙ РАБОЧИЙ ПРОЦЕСС', 'М2', 1);
    const source = f('bl', 'NESTED-SCOPE-001', 'ВНУТРЕННИЙ ТЕСТОВЫЙ РАБОЧИЙ ПРОЦЕСС', 'М2', 0.5, [parentName, childName]);
    const inner = rzF(childName, [parentName], [source]);
    const outer = rzF(parentName, [], [inner]);

    const automatic = f2MoslashV3([outer], S).natijalar.get(source.uid)!;
    expect(automatic).toMatchObject({ holat: 'topilmadi', qatorId: null });
    expect(automatic.sabab).toMatch(/bo‘lim.*hali bog‘lanmagan/);

    const taught = f2MoslashV3([outer], S, { rzBog: new Map([[inner.uid, L3a]]) }).natijalar.get(source.uid)!;
    expect(taught).toMatchObject({ holat: 'aniq', qatorId: targetId });
  });

  it('one-letter resource code С is not identity and cannot bind a different material', () => {
    const section = rz('GENERIC RESOURCE CODE TEST');
    const targetWork = ish(section, 'GENERIC-CODE-PARENT', 'ИШ ОДИНАКОВОЕ', 'М2', 1,
      [['С', 'СТЕКЛО ЖИДКОЕ КАЛИЙНОЕ', 'Т', 1]]);
    const wrongMaterialId = S.find((row) => row.otaId === targetWork)!.id;
    const yol = ['GENERIC RESOURCE CODE TEST'];
    const source = f('bl', 'GENERIC-CODE-PARENT', 'ИШ ОДИНАКОВОЕ', 'М2', 1, yol, [
      f('rs', 'С', 'АРМАТУРА AIII ДИАМЕТРОМ 12 ММ', 'Т', 0.1, yol, [], 0.1),
    ]);
    const result = f2MoslashV3([rzF(yol[0], [], [source])], S);

    expect(result.natijalar.get(source.uid)).toMatchObject({ holat: 'aniq', qatorId: targetWork });
    expect(result.natijalar.get(source.bolalar[0].uid)).toMatchObject({ holat: 'topilmadi', qatorId: null });
    expect(result.natijalar.get(source.bolalar[0].uid)?.qatorId).not.toBe(wrongMaterialId);
    expect(result.natijalar.get(source.bolalar[0].uid)?.nomzodlar).toEqual([]);
  });

  it('one-letter resource markers do not make different BL resource compositions look equal', () => {
    const section = rz('GENERIC MATERIAL COMPOSITION');
    const wrongWork = ish(section, 'DUPLICATE-WORK-CODE-1', 'BIR XIL ISH', 'M2', 1, [['С', 'QUMLI TAYYORLASH', 'М3', 2]]);
    const rightWork = ish(section, 'DUPLICATE-WORK-CODE-1', 'BIR XIL ISH', 'M2', 1, [['С', 'BETON В25 W6', 'М3', 2]]);
    const yol = ['GENERIC MATERIAL COMPOSITION'];
    const source = f('bl', 'DUPLICATE-WORK-CODE-1', 'BIR XIL ISH', 'M2', 1, yol, [
      f('rs', 'С', 'BETON B25 W6', 'М3', 2, yol, [], 2),
    ]);
    const result = f2MoslashV3([rzF(yol[0], [], [source])], S);

    expect(result.natijalar.get(source.uid)).toMatchObject({ holat: 'aniq', qatorId: rightWork });
    expect(result.natijalar.get(source.uid)?.qatorId).not.toBe(wrongWork);
    expect(result.natijalar.get(source.bolalar[0].uid)).toMatchObject({ holat: 'aniq' });
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

describe('bir nomli ichma-ich razdellar (prod sinovi 2026-10-23, sun’iy)', () => {
  it('F2 razdeli eng tashqi bir nomli smeta razdeliga ulanadi — ichki takroriy sarlavha butun F2 ni qamab qo‘ymaydi', () => {
    const Q: SmetaQator[] = [];
    let i = 1000;
    const r = (nom: string, ota: number | null) => { const id = ++i; Q.push({ id, otaId: ota, tur: 'rz', kod: null, nom, birlik: null, hajm: null, tartib: id }); return id; };
    const w = (ota: number, kod: string, nom: string, birlik: string, hajm: number) => { const id = ++i; Q.push({ id, otaId: ota, tur: 'bl', kod, nom, birlik, hajm, tartib: id }); return id; };
    const fayl = r('Obyekt LRV.xlsx — LRV', null);
    const obyekt = r('ОБЪЕКТ-А', fayl);
    const qism = r('АР И КЖ', obyekt);
    const zem = r('ЗЕМЛЯНЫЕ РАБОТЫ', qism);
    const W = w(zem, 'X0101-001', 'РАЗРАБОТКА ГРУНТА', '1000М3', 3);
    // Import qilingan smetada takroriy jadval sarlavhasi: ichida yana «ОБЪЕКТ-А» (boshqa bo'limlar uchun).
    const ov = r('ОВ И ВК', obyekt);
    const ichki = r('ОБЪЕКТ-А', ov);
    w(r('ОВ', ichki), 'X2001-001', 'МОНТАЖ ТРУБ', 'М', 10);
    const ns = r('ЭС ЭМ', obyekt);
    r('ОБЪЕКТ-А', ns);
    const fw = f('bl', 'X0101-001', 'РАЗРАБОТКА ГРУНТА', '1000М3', 1, ['ОБЪЕКТ-А', 'АР И КЖ', 'ЗЕМЛЯНЫЕ РАБОТЫ']);
    const daraxt = [rzF('ОБЪЕКТ-А', [], [rzF('АР И КЖ', ['ОБЪЕКТ-А'], [rzF('ЗЕМЛЯНЫЕ РАБОТЫ', ['ОБЪЕКТ-А', 'АР И КЖ'], [fw])])])];
    const n = f2MoslashV3(daraxt, Q);
    expect(n.rzDiag.map((d) => d.smetaRzIdlar)).toEqual([[obyekt], [qism], [zem]]);
    expect(n.natijalar.get(fw.uid)).toMatchObject({ holat: 'aniq', qatorId: W });
  });
});

describe('F2 → smeta: shifr-kanoni, birlik sinonimi, zamena nomzodi (2026-10-23, sun’iy)', () => {
  const Q: SmetaQator[] = [];
  let i = 5000;
  const r = (nom: string, ota: number | null) => { const id = ++i; Q.push({ id, otaId: ota, tur: 'rz', kod: null, nom, birlik: null, hajm: null, tartib: id }); return id; };
  const w = (ota: number, kod: string, nom: string, birlik: string, hajm: number) => { const id = ++i; Q.push({ id, otaId: ota, tur: 'bl', kod, nom, birlik, hajm, tartib: id }); return id; };
  const ob = r('ОБЪЕКТ-Б', null);
  const zem = r('ЗЕМЛЯНЫЕ РАБОТЫ', ob);
  w(zem, 'Х0101-001', 'РАЗРАБОТКА ГРУНТА', '1000М3', 3);
  const tr = w(zem, 'Х310-1020', 'ПЕРЕВОЗКА ГРУЗОВ, РАССТОЯНИЕ 20 КМ, КЛАСС 1', 'Т', 600.5);
  const lf1 = r('ЛЕНТОЧНЫЙ ФУНДАМЕНТ', ob);
  const pod1 = w(lf1, 'Х0601-001-01 ДОП. 3', 'УСТРОЙСТВО ПОДГОТОВКИ', '100 М3 БЕТОНА', 0.2);
  const lf2 = r('ЛЕНТОЧНЫЙ ФУНДАМЕНТ', ob);
  w(lf2, 'Х0601-001-01 ДОП. 3', 'УСТРОЙСТВО ПОДГОТОВКИ', '100 М3 БЕТОНА', 0.05);
  const yol = ['ОБЪЕКТ-Б', 'ЗЕМЛЯНЫЕ РАБОТЫ'];

  it('boshqa razdeldagi kanon-shifr + nom + birlik (sinonim) aynan qator — ◐ taklif; egizaklardan hajm sig‘adigani', () => {
    const fp = f('bl', 'X6-1-1-1', 'УСТРОЙСТВО ПОДГОТОВКИ', '100М3', 0.18, yol);
    const n = f2MoslashV3([rzF('ОБЪЕКТ-Б', [], [rzF('ЗЕМЛЯНЫЕ РАБОТЫ', ['ОБЪЕКТ-Б'], [fp])])], Q);
    expect(n.natijalar.get(fp.uid)).toMatchObject({ holat: 'taklif', qatorId: pod1, usul: 'boshqa_razdel' });
  });

  it('nomi faqat raqamda farq, birlik va hajm teng — ◐ zamena nomzodi', () => {
    const ft = f('bl', 'Х310-1011', 'ПЕРЕВОЗКА ГРУЗОВ, РАССТОЯНИЕ 11 КМ, КЛАСС 1', 'Т', 600.5, yol);
    const n = f2MoslashV3([rzF('ОБЪЕКТ-Б', [], [rzF('ЗЕМЛЯНЫЕ РАБОТЫ', ['ОБЪЕКТ-Б'], [ft])])], Q);
    expect(n.natijalar.get(ft.uid)).toMatchObject({ holat: 'taklif', qatorId: tr, usul: 'zamena_nomzod' });
  });
});

describe('ota doirasi kaskadi (51 F2 quruq sinovi 2026-10-24, sun’iy)', () => {
  it('ota doirasida topilmagan razdel butun smetada YAGONA bo‘lsa ulanadi; «ЛИСТ КЖ-2» «КР-2» bilan adashmaydi', () => {
    const Q: SmetaQator[] = [];
    let i = 9000;
    const r = (nom: string, ota: number | null) => { const id = ++i; Q.push({ id, otaId: ota, tur: 'rz', kod: null, nom, birlik: null, hajm: null, tartib: id }); return id; };
    const w = (ota: number, kod: string, nom: string) => { const id = ++i; Q.push({ id, otaId: ota, tur: 'bl', kod, nom, birlik: 'М3', hajm: 10, tartib: id }); return id; };
    const oz = r('РАЗДЕЛ: ОЗЕЛЕНЕНИЕ', null);
    r('ЗЕМЛЯНЫЕ РАБОТЫ', oz);
    const s1 = r('СМЕТА № 01 НА ФИЛЬТРАЦИЯ', null);
    w(r('РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ КР-2)', s1), 'Y-1', 'РАЗРАБОТКА ГРУНТА');
    const s2 = r('СМЕТА № 02 НА КОНСТРУКТИВНАЯ ЧАСТЬ', null);
    const z2 = w(r('РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ КЖ-2)', s2), 'Y-1', 'РАЗРАБОТКА ГРУНТА');
    const lf = w(r('РАЗДЕЛ: ЛЕНТОЧНЫЙ ФУНДАМЕНТ (ЛИСТ КЖ-3)', s2), 'Y-2', 'УСТРОЙСТВО ФУНДАМЕНТА');
    const y = ['СМЕТА № 03 НА ОЗЕЛЕНЕНИЕ'];
    const a = f('bl', 'Y-1', 'РАЗРАБОТКА ГРУНТА', 'М3', 1, [...y, 'РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ КЖ-2)']);
    const b = f('bl', 'Y-2', 'УСТРОЙСТВО ФУНДАМЕНТА', 'М3', 1, [...y, 'РАЗДЕЛ: ЛЕНТОЧНЫЙ ФУНДАМЕНТ (ЛИСТ КЖ-3)']);
    const daraxt = [rzF(y[0], [], [rzF('РАЗДЕЛ: ЗЕМЛЯНЫЕ РАБОТЫ (ЛИСТ КЖ-2)', y, [a]), rzF('РАЗДЕЛ: ЛЕНТОЧНЫЙ ФУНДАМЕНТ (ЛИСТ КЖ-3)', y, [b])])];
    const n = f2MoslashV3(daraxt, Q);
    expect(n.natijalar.get(a.uid)).toMatchObject({ holat: 'aniq', qatorId: z2 });
    expect(n.natijalar.get(b.uid)).toMatchObject({ holat: 'aniq', qatorId: lf });
  });
});
