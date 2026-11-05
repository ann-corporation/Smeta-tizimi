import { describe, expect, it } from 'vitest';
import { tuzatishBoglanishlari, tuzatishFakti, tuzatishQatorimi, tuzatishSababi, type TuzatishManba } from './tuzatish';

let keyingi = 100;
const bl = (kod: string, nom: string, birlik: string, hajm: number | null, ota = 1, extra: Partial<TuzatishManba> = {}): TuzatishManba =>
  ({ id: keyingi, tartib: keyingi++, tur: 'bl', kod, nom, birlik, hajm, ota_id: ota, ...extra });

describe('tuzatish qatori — aniqlagich', () => {
  const misollar: Array<[string, string]> = [
    ['E27-4-5-4 К=10', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ К НОРМАМ С 27-04-005-1 ПО 27-04-005-3 ЗА 10 РАЗ'],
    ['E27-6-2-18 К=8', 'ПРИ ИЗМЕНЕНИИ ТОЛЩИНЫ СЛОЯ НА 1 СМ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ К НОРМЕ 27-06-002-17+ИСКЛЮЧИТЬ 8СМ'],
    ['E27-1-5-2 ШHК.ДОП.4 К=15', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ/15СМ/ ИЛИ ИСКЛЮЧАТЬ К НОРМЕ 27-01-005-1 ЗА 15 РАЗ'],
    ['E11-1-11-2 К=4', 'УСТРОЙСТВО СТЯЖЕК ЦЕМЕНТНЫХ НА КАЖДЫЕ 5 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ СТЯЖКИ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ К НОРМЕ 11-01-011-01'],
    ['E15-1-5-1', 'НА КАЖДЫЕ 10 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ ПЛИТ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ/10ММ/, ПРИ ОБЛИЦОВКЕ СТЕН И КОЛОНН'],
    ['E6-1-97-1', 'ВЫЧИТАЕТСЯ УСТАНОВКУ АРМАТУРЫ'],
    ['E15-2-19-11 К=8', 'НА КАЖДЫЙ ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ ДОБАВЛЯЕТСЯ ИЛИ ИСКЛЮЧАЕТСЯ СТЕН ЗА 8 РАЗ'],
    ['E1-1-1', 'прочие работы: добавлять или исключать по проекту'],
  ];
  it.each(misollar)('%s — tuzatish', (kod, nom) => {
    expect(tuzatishQatorimi({ tur: 'bl', kod, nom })).toBe(true);
  });

  it('К=n shifrda bo‘lsa «ДОБАВЛЯТЬ» siz ham (kichik harf, lotin K ham)', () => {
    expect(tuzatishSababi({ tur: 'bl', kod: 'E11-1-15-2 K=2', nom: 'устройство покрытий бетонных на каждые 5 мм изменения толщины за 2 раза' })).toBe('koef_qalinlik');
    expect(tuzatishSababi({ tur: 'bl', kod: 'E11-1-15-2', nom: 'УСТРОЙСТВО ПОКРЫТИЙ БЕТОННЫХ НА КАЖДЫЕ 5 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ ЗА 2 РАЗА' })).toBeNull();
  });

  it('oddiy ish, resurs, qo‘shimcha/zamena — tuzatish emas', () => {
    expect(tuzatishQatorimi({ tur: 'bl', kod: 'E27-4-5-1', nom: 'УСТРОЙСТВО ОСНОВАНИЙ ТОЛЩИНОЙ 15 СМ ИЗ ЩЕБНЯ' })).toBe(false);
    expect(tuzatishQatorimi({ tur: 'rs', kod: '006322', nom: 'ВЫЧИТАЕТСЯ БЕТОН' })).toBe(false);
    expect(tuzatishQatorimi({ tur: 'bl', kod: 'E6-1-97-1', nom: 'ВЫЧИТАЕТСЯ УСТАНОВКУ АРМАТУРЫ', qoshimcha: true })).toBe(false);
    expect(tuzatishQatorimi({ tur: 'bl', kod: 'E6-1-97-1', nom: 'ВЫЧИТАЕТСЯ УСТАНОВКУ АРМАТУРЫ', zamena: true })).toBe(false);
  });
});

describe('tuzatish qatori — asosiy ishga bog‘lanish', () => {
  it('bir bo‘limdagi uchta tuzatish: har biri eng yaqin oldingi bir xil birlik va |hajm| li ishga', () => {
    const a1 = bl('E27-1-5-1', 'УСТРОЙСТВО ОСНОВАНИЯ ИЗ ПЕСЧАНО-ГРАВИЙНЫХ СМЕСЕЙ', '1000М2', 50);
    const t1 = bl('E27-1-5-2 ШHК.ДОП.4 К=15', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ/15СМ/ ИЛИ ИСКЛЮЧАТЬ', '1000М2', 50);
    const boshqa = bl('E1-1-197-2', 'РАЗРАБОТКА ГРУНТА', '1000М3', 50);
    const a2 = bl('E27-4-5-1', 'УСТРОЙСТВО ОСНОВАНИЙ ИЗ ЩЕБНЯ', '1000 м2', 50);
    const t2 = bl('E27-4-5-4 К=10', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ К НОРМАМ', '1000М2', -50);
    const a3 = bl('E27-6-2-17', 'УСТРОЙСТВО ЦЕМЕНТОБЕТОННЫХ ПОКРЫТИЙ', '1000М2', 50.2);
    const t3 = bl('E27-6-2-18 К=8', 'ПРИ ИЗМЕНЕНИИ ТОЛЩИНЫ СЛОЯ НА 1 СМ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ', '1000М2', -50);
    const x = tuzatishBoglanishlari([t3, a3, t2, a2, boshqa, t1, a1]); // kirish tartibi muhim emas — tartib bo'yicha
    expect(x.asos.get(t1.id)).toBe(a1.id);
    expect(x.asos.get(t2.id)).toBe(a2.id);
    expect(x.asos.get(t3.id)).toBe(a3.id); // 50.2 vs 50 — 1% ichida
    expect(x.ergashuvchi.get(a1.id)).toEqual([t1.id]);
    expect(x.boglanmagan).toEqual([]);
    expect(x.taxminiy).toEqual([]);
  });

  it('hajm mos kelmasa — eng yaqin oldingi bir xil birlikli ish (taxminiy)', () => {
    const a = bl('E11-1-11-1', 'УСТРОЙСТВО СТЯЖЕК ЦЕМЕНТНЫХ ТОЛЩИНОЙ 20 ММ', '100М2', 12, 2);
    const yaqin = bl('E11-1-4-3', 'ГИДРОИЗОЛЯЦИЯ', '100М2', 3, 2);
    const t = bl('E11-1-11-2 К=4', 'УСТРОЙСТВО СТЯЖЕК ЦЕМЕНТНЫХ НА КАЖДЫЕ 5 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ СТЯЖКИ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ', '100М2', 12, 2);
    const x = tuzatishBoglanishlari([a, yaqin, t]);
    expect(x.asos.get(t.id)).toBe(a.id); // hajm bo'yicha uzoqroq, lekin mos
    const t2 = bl('E11-1-11-2 К=4', 'УСТРОЙСТВО СТЯЖЕК ЦЕМЕНТНЫХ НА КАЖДЫЕ 5 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ СТЯЖКИ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ', '100М2', 7, 2);
    const y = tuzatishBoglanishlari([a, yaqin, t2]);
    expect(y.asos.get(t2.id)).toBe(yaqin.id);
    expect(y.taxminiy.map((b) => b.tuzatishId)).toEqual([t2.id]);
  });

  it('E15-1-5-1 manfiy va E6-1-97-1 «ВЫЧИТАЕТСЯ» (Т) — |hajm| bo‘yicha', () => {
    const plita = bl('E15-1-4-1', 'ОБЛИЦОВКА СТЕН ГРАНИТОМ', '100М2', 4, 3);
    const tp = bl('E15-1-5-1', 'НА КАЖДЫЕ 10 ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ ПЛИТ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ', '100М2', -4, 3);
    const arm = bl('E6-1-15-1', 'АРМИРОВАНИЕ', 'Т', 0.6, 3);
    const ta = bl('E6-1-97-1', 'ВЫЧИТАЕТСЯ УСТАНОВКУ АРМАТУРЫ', 'т', -0.6, 3);
    const x = tuzatishBoglanishlari([plita, tp, arm, ta]);
    expect(x.asos.get(tp.id)).toBe(plita.id);
    expect(x.asos.get(ta.id)).toBe(arm.id);
  });

  it('kesilgan birlik matni bir xil birlik hisoblanadi; qisqa boshlar (Т/ТН) emas', () => {
    const a = bl('E27-4-3-6', 'УСТРОЙСТВО НИЖНЕГО СЛОЯ ОСНОВАНИЯ', '1000М2 ОСНОВАНИЯ ИЛИ ПОКРЫТИ', 0.7, 7);
    const t = bl('E27-4-3-8 К=8', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ К НОРМАМ', '1000 М2 ОСНОВАНИЯ ИЛИ ПОКРЫТИЯ', 0.7, 7);
    expect(tuzatishBoglanishlari([a, t]).asos.get(t.id)).toBe(a.id);
    const b = bl('E6-1-15-1', 'АРМИРОВАНИЕ', 'ТН', 1, 8);
    const v = bl('E6-1-97-1', 'ВЫЧИТАЕТСЯ УСТАНОВКУ АРМАТУРЫ', 'Т', -1, 8);
    expect(tuzatishBoglanishlari([b, v]).asos.has(v.id)).toBe(false);
  });

  it('boshqa bo‘lim, keyingi ish yoki boshqa birlik — bog‘lanmaydi', () => {
    const a = bl('E27-4-5-1', 'УСТРОЙСТВО ОСНОВАНИЙ', '1000М2', 10, 4);
    const t = bl('E27-4-5-4 К=10', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ', '1000М2', -10, 5);
    const keyin = bl('E27-4-5-1', 'УСТРОЙСТВО ОСНОВАНИЙ', '1000М2', 10, 5);
    const t2 = bl('E6-1-97-1', 'ВЫЧИТАЕТСЯ УСТАНОВКУ АРМАТУРЫ', 'Т', -1, 4);
    const x = tuzatishBoglanishlari([a, t, keyin, t2]);
    expect(x.asos.has(t.id)).toBe(false);
    expect(x.asos.has(t2.id)).toBe(false);
    expect(x.boglanmagan.map((b) => b.tuzatishId).sort()).toEqual([t.id, t2.id].sort());
  });

  it('tuzatish boshqa tuzatishga bog‘lanmaydi; qo‘shimcha ish asos bo‘lmaydi', () => {
    const a = bl('E27-6-2-17', 'УСТРОЙСТВО ПОКРЫТИЙ', '1000М2', 8, 6);
    const q = bl('E27-6-2-17', 'УСТРОЙСТВО ПОКРЫТИЙ', '1000М2', 8, 6, { qoshimcha: true });
    const t1 = bl('E27-1-5-2 К=15', 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ', '1000М2', 8, 6);
    const t2 = bl('E27-6-2-18 К=8', 'ПРИ ИЗМЕНЕНИИ ТОЛЩИНЫ СЛОЯ НА 1 СМ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ', '1000М2', -8, 6);
    const x = tuzatishBoglanishlari([a, q, t1, t2]);
    expect(x.asos.get(t1.id)).toBe(a.id);
    expect(x.asos.get(t2.id)).toBe(a.id);
    expect(x.ergashuvchi.get(a.id)).toEqual([t1.id, t2.id]);
  });
});

describe('tuzatish fakti', () => {
  it('tuzatish.hajm × asos.fakt / asos.hajm, ishora tuzatishniki', () => {
    expect(tuzatishFakti(-50, 40, 50)).toBe(-40);
    expect(tuzatishFakti(50, 60, 50)).toBe(60);
    expect(tuzatishFakti(-0.6, 0.3, 0.6)).toBe(-0.3);
  });
  it('NULL ≠ 0: asos fakti NULL → null; asos hajmi 0/NULL → null', () => {
    expect(tuzatishFakti(-50, null, 50)).toBeNull();
    expect(tuzatishFakti(-50, 10, 0)).toBeNull();
    expect(tuzatishFakti(-50, 10, null)).toBeNull();
    expect(tuzatishFakti(null, 10, 50)).toBeNull();
    expect(tuzatishFakti(-50, 0, 50)).toBe(0);
  });
});
