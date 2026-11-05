/**
 * Ish kartasi — birlik o'girish, tarkibli karta (MANFIY istisno qatori bilan), qamrov, bosqich bo'linishi, o'rtacha, avto-yig'ish.
 * FAQAT sintetik raqamlar (repo public).
 */
import { describe, expect, it } from 'vitest';
import { standartPodval } from '../hisob-yadro';
import {
  armaturaKgM3, avtoYigish, birlikAylantir, birlikTahlil, farq, fizikMiqdor, hukm, kartaNatija, kartaObyektlar, koefParametrdan,
  materialGuruhi, nisbatKoef, qamrovToldir, qatorHissalari, SUKUT_QAMROV, SUKUT_ULUSH, taqsimot, ulushTanla, ulushYaroqli,
  type KartaBog, type SmetaQator,
} from './index';

describe('birlik', () => {
  it('smeta birliklarini tahlil qiladi', () => {
    expect(birlikTahlil('100М3')).toEqual({ asos: 'М3', kopaytuvchi: 100 });
    expect(birlikTahlil('1000 м3')).toEqual({ asos: 'М3', kopaytuvchi: 1000 });
    expect(birlikTahlil('100M2')).toEqual({ asos: 'М2', kopaytuvchi: 100 }); // lotin M
    expect(birlikTahlil('T')).toEqual({ asos: 'Т', kopaytuvchi: 1 });
    expect(birlikTahlil('м³')).toEqual({ asos: 'М3', kopaytuvchi: 1 });
    expect(birlikTahlil('ЧЕЛ-Ч')).toBeNull();
    expect(birlikTahlil(null)).toBeNull();
  });
  it('yagona o‘girish: bir xil asos, т ↔ кг, mos kelmasa null', () => {
    expect(birlikAylantir(0.15, 'м³', '100М3')).toBeCloseTo(0.0015, 12);
    expect(birlikAylantir(2, '1000М3', 'М3')).toBe(2000);
    expect(birlikAylantir(1, 'м²', '100М2')).toBeCloseTo(0.01, 12);
    expect(birlikAylantir(1.5, 'Т', 'кг')).toBe(1500);
    expect(birlikAylantir(250, 'кг', 'т')).toBeCloseTo(0.25, 12);
    expect(birlikAylantir(1, 'м', '100М3')).toBeNull();
    expect(birlikAylantir(null, 'м³', 'М3')).toBeNull();
  });
  it('parametrdan koeffitsient: to‘sin b×h, plita qalinligi, to‘g‘ridan birlik', () => {
    expect(fizikMiqdor('rigel', 'м', { b_mm: 200, h_mm: 400 })?.qiymat).toBeCloseTo(0.08, 12);
    expect(koefParametrdan('rigel', 'м', { b_mm: 200, h_mm: 400 }, '100М3')).toBeCloseTo(0.0008, 12);
    expect(koefParametrdan('kolonna', 'шт', { b_mm: 400, h_mm: 400, uzunlik_m: 3 }, 'М3')).toBeCloseTo(0.48, 12);
    expect(koefParametrdan('plita', 'м²', { qalinlik_mm: 200 }, '100М3')).toBeCloseTo(0.002, 12);
    expect(koefParametrdan('devor', 'м²', { qalinlik_mm: 250 }, 'М3')).toBeCloseTo(0.25, 12);
    expect(koefParametrdan('boshqa', 'м²', {}, '100М2')).toBeCloseTo(0.01, 12);
    expect(koefParametrdan('rigel', 'м', { b_mm: 200 }, '100М3')).toBeNull(); // h yo'q — taxmin yo'q
  });
  it('nisbat koeffitsienti ishorani saqlaydi; armatura kg/м³ smetaning o‘zidan', () => {
    expect(nisbatKoef(0.001, 0.4, 6)).toBeCloseTo(0.015, 12);
    expect(nisbatKoef(0.001, 0.4, -6)).toBeCloseTo(-0.015, 12);
    expect(nisbatKoef(0.001, 0, 6)).toBeNull();
    expect(nisbatKoef(null, 0.4, 6)).toBeNull();
    expect(armaturaKgM3(6, 'Т', 0.4, '100М3')).toBeCloseTo(150, 9);
  });
});

/* Sintetik rigel 200×400 obyekti: asosiy norma 0,4 «100М3» (40 м³), armatura 6 т, istisno −6 т (mehnat −1200). */
const ASOS: SmetaQator = {
  id: 1, obyekt_id: 10, obyekt_nom: 'Obyekt A', ota_id: 100, tartib: 1, tur: 'bl', kod: 'Е6-1-37-1', nom: 'УСТРОЙСТВО РИГЕЛЕЙ', birlik: '100М3', hajm: 0.4,
  bolalar: [
    { kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', birlik: 'ЧЕЛ-Ч', hajm: 600, summa: 12000 },
    { kat: 'МАШ', nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', birlik: 'ЧЕЛ-Ч', hajm: 100, summa: null },
    { kat: 'МАШ', nom: 'КРАН', birlik: 'МАШ-Ч', hajm: 2, summa: 400 },
    { kat: 'БЕЗСКЛАД', nom: 'БЕТОН ТЯЖЕЛЫЙ', birlik: 'М3', hajm: 40.6, summa: 20000 },
    { kat: 'МАТ', nom: 'ДОСКИ ОБРЕЗНЫЕ', birlik: 'М3', hajm: 0.8, summa: 4000 },
  ],
};
const ARM: SmetaQator = { id: 2, obyekt_id: 10, ota_id: 100, tartib: 2, tur: 'mat', kat: 'МАТ', kod: 'С124-6-1', nom: 'АРМАТУРНЫЙ КАРКАС ДЛЯ РИГЕЛ', birlik: 'Т', hajm: 6, summa: 48000, bolalar: [] };
const IST: SmetaQator = {
  id: 3, obyekt_id: 10, ota_id: 100, tartib: 3, tur: 'bl', kod: 'Е6-1-97-1', nom: 'УСТАНОВКА АРМАТУРЫ ИСКЛЮЧИТЬ ЗАТРАТЫ ТРУДА', birlik: 'Т', hajm: -6,
  bolalar: [{ kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ', birlik: 'ЧЕЛ-Ч', hajm: -60, summa: -1200 }],
};
const ZAK: SmetaQator = { id: 4, obyekt_id: 10, ota_id: 100, tartib: 4, tur: 'bl', kod: 'Е6-1-15-8', nom: 'УСТАНОВКА ЗАКЛАДНЫХ ДЕТАЛЕЙ', birlik: 'Т', hajm: 0.1, bolalar: [] };
const KLADKA: SmetaQator = { id: 5, obyekt_id: 10, ota_id: 100, tartib: 5, tur: 'bl', kod: 'Е8-3-7-1', nom: 'КЛАДКА СТЕН', birlik: 'М3', hajm: 10, bolalar: [] };
const ARM2: SmetaQator = { ...ARM, id: 6, tartib: 6 };

const K = 0.001; // 0,1 м³/м → «100М3»
const BOG: KartaBog[] = [
  { qator_id: 1, obyekt_id: 10, rol: 'asosiy', koef: K, bosqich: null, material_guruh: null },
  { qator_id: 2, obyekt_id: 10, rol: 'armatura_mat', koef: nisbatKoef(K, 0.4, 6), bosqich: null, material_guruh: 'armatura' },
  { qator_id: 3, obyekt_id: 10, rol: 'istisno', koef: nisbatKoef(K, 0.4, -6), bosqich: 'armatura', material_guruh: null },
];
const QATORLAR = new Map([ASOS, ARM, IST, ZAK].map((q) => [q.id, q]));
const NK = { ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 10,
  ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };
const PODVAL = standartPodval(NK);

describe('tarkibli karta: 1 birlikka taqsimot', () => {
  it('istisno qatori ISHORASI bilan kiradi; narxsiz resurs 0 emas (sanaladi)', () => {
    const t = qatorHissalari(BOG[2], IST);
    expect(t.holat).toBe('ok');
    expect(t.hissalar).toHaveLength(1);
    expect(t.hissalar[0].qiymat).toBeCloseTo(-3, 9); // (−1200 / −6) × (−0,015)
    expect(t.hissalar[0].chelSoat).toBeCloseTo(-0.15, 9);
    const a = qatorHissalari(BOG[0], ASOS);
    expect(a.narxsizSoni).toBe(1);
    expect(a.hissalar.find((h) => h.katXom === 'МАШ' && h.qiymat === 0)).toBeUndefined();
  });

  it('mehnat / mashina / beton+opalubka / armatura / jami', () => {
    const [o] = kartaObyektlar({ bog: BOG, qatorlar: QATORLAR, ulush: SUKUT_ULUSH, qamrov: SUKUT_QAMROV, ustama: () => ({ podval: PODVAL }) });
    const t = o.taqsimot;
    expect(t.mehnat.jami).toBeCloseTo(27, 9);   // 30 − 3
    expect(t.mashina).toBeCloseTo(1, 9);
    expect(t.material.beton).toBeCloseTo(50, 9);
    expect(t.material.opalubka).toBeCloseTo(10, 9);
    expect(t.material.armatura).toBeCloseTo(120, 9);
    expect(t.jami).toBeCloseTo(208, 9);
    expect(t.chelSoat).toBeCloseTo(1.35, 9);    // 1,5 − 0,15
    expect(o.hajm).toBeCloseTo(400, 9);         // 0,4 / 0,001 m
    expect(o.narxsizSoni).toBe(1);
  });

  it('bosqich bo‘linishi: asosiy norma ulush bo‘yicha, istisno — o‘z bosqichiga', () => {
    const [o] = kartaObyektlar({ bog: BOG, qatorlar: QATORLAR, ulush: SUKUT_ULUSH, qamrov: SUKUT_QAMROV, ustama: () => null });
    expect(o.taqsimot.mehnat.opalubka).toBeCloseTo(12, 9);  // 30 × 40 %
    expect(o.taqsimot.mehnat.armatura).toBeCloseTo(4.5, 9); // 30 × 25 % − 3
    expect(o.taqsimot.mehnat.beton).toBeCloseTo(10.5, 9);   // 30 × 35 %
    const t = taqsimot(o.qatorlar.flatMap((q) => q.hissalar), { opalubka: 0, armatura: 100, beton: 0 });
    expect(t.mehnat.armatura).toBeCloseTo(27, 9);
  });

  it('ustama faqat hisob-yadro orqali: mehnat + ustama, to‘liq ish, QQS bilan', () => {
    const [o] = kartaObyektlar({ bog: BOG, qatorlar: QATORLAR, ulush: SUKUT_ULUSH, qamrov: SUKUT_QAMROV, ustama: () => ({ podval: PODVAL }) });
    expect(o.mehnat.ustamasiz).toBeCloseTo(27, 2);
    expect(o.mehnat.ustamali).toBeCloseTo(29.7, 2);   // + prochie 10 %
    expect(o.mehnat.qqsBilan).toBeCloseTo(33.26, 2);  // + QQS 12 %
    expect(o.toliq.ustamasiz).toBeCloseTo(208, 2);
    expect(o.toliq.ustamali).toBeCloseTo(228.8, 2);
    // Ustama ma'lumoti yo'q — noma'lum (null), 0 emas.
    const [b] = kartaObyektlar({ bog: BOG, qatorlar: QATORLAR, ulush: SUKUT_ULUSH, qamrov: SUKUT_QAMROV, ustama: () => null });
    expect(b.toliq.ustamali).toBeNull();
    expect(b.toliq.sabab).toBe('KOEF_YOQ');
  });

  it('qamrov: belgilangan bosqichlar mehnati + usta beradigan materiallar', () => {
    const qamrov = qamrovToldir({ bosqichlar: { opalubka: false, armatura: false, beton: true }, material: { beton: 'usta' } });
    const [o] = kartaObyektlar({ bog: BOG, qatorlar: QATORLAR, ulush: SUKUT_ULUSH, qamrov, ustama: () => ({ podval: PODVAL }) });
    expect(o.qamrov.ustamasiz).toBeCloseTo(60.5, 2); // 10,5 mehnat + 50 beton
    const faqatArm = qamrovToldir({ bosqichlar: { opalubka: false, armatura: true, beton: false }, material: { armatura: 'usta' }, mexanizm: 'usta' });
    const [a] = kartaObyektlar({ bog: BOG, qatorlar: QATORLAR, ulush: SUKUT_ULUSH, qamrov: faqatArm, ustama: () => null });
    expect(a.qamrov.ustamasiz).toBeCloseTo(4.5 + 0.25 + 120, 2); // mehnat (istisno bilan) + mashina 25 % + armatura
  });

  it('koef yoki qator yo‘q — ogohlantirish, hisobga kirmaydi; qo‘shimcha qator faqat tanlansa', () => {
    const bog: KartaBog[] = [...BOG, { qator_id: 4, obyekt_id: 10, rol: 'zakladnoy', koef: null, bosqich: 'armatura', material_guruh: null },
      { qator_id: 999, obyekt_id: 10, rol: 'boshqa', koef: 1, bosqich: null, material_guruh: null }];
    const [o] = kartaObyektlar({ bog, qatorlar: QATORLAR, ulush: SUKUT_ULUSH, qamrov: SUKUT_QAMROV, ustama: () => null });
    expect(o.ogohlantirish.map((q) => q.holat).sort()).toEqual(['koef_yoq', 'topilmadi']);
    expect(o.taqsimot.jami).toBeCloseTo(208, 9);
    const qosh = new Map(QATORLAR); qosh.set(2, { ...ARM, qoshimcha: true });
    expect(kartaObyektlar({ bog: BOG, qatorlar: qosh, ulush: SUKUT_ULUSH, qamrov: SUKUT_QAMROV, ustama: () => null })[0].taqsimot.material.armatura).toBe(0);
    expect(kartaObyektlar({ bog: BOG, qatorlar: qosh, ulush: SUKUT_ULUSH, qamrov: SUKUT_QAMROV, ustama: () => null, qoshimchaBilan: true })[0].taqsimot.material.armatura).toBeCloseTo(120, 9);
  });

  it('bir nechta obyekt: hajm bo‘yicha tortilgan o‘rtacha va min–max', () => {
    const B: SmetaQator = { ...ASOS, id: 11, obyekt_id: 20, hajm: 0.1, bolalar: [{ kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 200, summa: 6000 }] };
    const bog: KartaBog[] = [BOG[0], { qator_id: 11, obyekt_id: 20, rol: 'asosiy', koef: K, bosqich: null, material_guruh: null }];
    const n = kartaNatija({ bog, qatorlar: new Map([[1, ASOS], [11, B]]), ulush: SUKUT_ULUSH, qamrov: SUKUT_QAMROV, ustama: () => null });
    // A: mehnat 30 (400 m), B: 60 (100 m) → (30×400 + 60×100) / 500 = 36.
    expect(n.taqsimot.mehnat.ortacha).toBeCloseTo(36, 9);
    expect(n.taqsimot.mehnat.min).toBeCloseTo(30, 9);
    expect(n.taqsimot.mehnat.max).toBeCloseTo(60, 9);
    expect(n.hajmNomalum).toBe(false);
  });
});

describe('ulush, material guruhi, solishtirish', () => {
  it('ulush yig‘indisi 100; karta → kompaniya → sukut', () => {
    expect(ulushYaroqli({ opalubka: 40, armatura: 25, beton: 35 })).toBe(true);
    expect(ulushYaroqli({ opalubka: 40, armatura: 25, beton: 30 })).toBe(false);
    expect(ulushYaroqli({ opalubka: 40, armatura: 60 })).toBe(false);
    expect(ulushTanla(null, { opalubka: 50, armatura: 20, beton: 30 }).manba).toBe('kompaniya');
    expect(ulushTanla({ opalubka: 30, armatura: 30, beton: 40 }, { opalubka: 50, armatura: 20, beton: 30 }).ulush.opalubka).toBe(30);
    expect(ulushTanla(null, null)).toEqual({ ulush: SUKUT_ULUSH, manba: 'sukut' });
  });
  it('material guruhi nomdan', () => {
    expect(materialGuruhi('БЕТОН ТЯЖЕЛЫЙ КЛАССА В20')).toBe('beton');
    expect(materialGuruhi('АРМАТУРНАЯ СТАЛЬ А-III')).toBe('armatura');
    expect(materialGuruhi('ГАЗОБЕТОННЫЕ БЛОКИ')).toBe('opalubka');
    expect(materialGuruhi('ПРОВОЛОКА СВЕТЛАЯ')).toBe('opalubka');
  });
  it('farq va hukm', () => {
    const f = farq(120, 40, 100);
    expect(f.foiz).toBeCloseTo(200, 9);
    expect(f.baravar).toBeCloseTo(3, 9);
    expect(f.jamiFarq).toBeCloseTo(8000, 9);
    expect(farq(120, null).foiz).toBeNull();
    expect(farq(120, 0).foiz).toBeNull();
    const h = hukm(150, 50, 100);
    expect(h.mehnat.baravar).toBeCloseTo(3, 9);
    expect(h.qamrov.foiz).toBeCloseTo(50, 9);
  });
});

describe('avto-yig‘ish', () => {
  it('asosiydan keyingi element qatorlarini taklif qiladi, begona ishda to‘xtaydi', () => {
    const r = avtoYigish(ASOS, [KLADKA, ZAK, IST, ARM, ARM2], K);
    expect(r.map((x) => [x.qator.id, x.rol])).toEqual([[2, 'armatura_mat'], [3, 'istisno'], [4, 'zakladnoy']]);
    expect(r[0].koef).toBeCloseTo(0.015, 12);
    expect(r[1].koef).toBeCloseTo(-0.015, 12);
    expect(r[1].bosqich).toBe('armatura');
    expect(r[2].tanlangan).toBe(false);
  });
  it('boshqa bo‘lim yoki obyekt qatorlari olinmaydi', () => {
    expect(avtoYigish(ASOS, [{ ...ARM, ota_id: 101 }, { ...ARM, id: 7, obyekt_id: 11 }], K)).toEqual([]);
  });
});
