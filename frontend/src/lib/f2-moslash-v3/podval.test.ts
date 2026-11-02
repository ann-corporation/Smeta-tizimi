import { describe, expect, it } from 'vitest';
import { f2AktlarniOqi, podvalQolda, PODVAL_RZ_NOM } from '../smeta-anatomiya/f2';
import type { Katak } from '../smeta-anatomiya/turlar';
import { f2Indeks, yozishManbasi, type IshJoyi } from './ishJoyi';
import { dvigatelDaraxti, podvalMosQator, podvalTakrori, podvalTaklifQosh } from './podval';

/** Sintetik F2: bitta ish + podvalda bojxona va shef-montaj qatorlari (summa «narx» ustunida — format odati). */
const ROWS: Katak[][] = [
  ['АКТ'],
  ['За июль месяц 2026 года'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'Сметная стоимость', null],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7, 8],
  [1, 'E1-1-1-1', 'ТЕСТОВАЯ РАБОТА', 'М3', 10, null, null, 1000],
  [1.1, '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 5, 50, 20, 1000],
  [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 1000, null],
  [null, null, 'ШЕФ-МОНТАЖНАЯ РАБОТА', 'СУМ', null, null, 300, null],
  [null, null, 'ТАМОЖЕННЫЕ РАСХОДЫ И НДС ДЛЯ ОБОРУДОВАНИЕ (ПО ТАМОЖЕННОЕ ДЕКЛАРАЦИЯ)', 'СУМ', null, null, 4046.85, null],
  [null, null, 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА В ТЕКУЩИХ ЦЕНАХ', 'СУМ', null, null, 5346.85, null],
];

const akt = () => f2AktlarniOqi({ fayl: 'f.xlsx', varaqlar: [{ nom: 'V', rows: ROWS }] })[0];

describe('F2 podval — qo‘lda qatorlar (bojxona, shef-montaj)', () => {
  it('faqat o‘tkazma nomlari podval razdeliga olinadi; qatorlar jamiga kirmaydi', () => {
    expect(podvalQolda('ТАМОЖЕННЫЕ РАСХОДЫ')).toBe(true);
    expect(podvalQolda('ИТОГО')).toBe(false);
    expect(podvalQolda('ЗАТРАТЫ НА СТРАХОВАНИЕ ОБЪЕКТА 0,32%')).toBe(false);
    const a = akt();
    const rz = a.daraxt.find((t) => t.podval);
    expect(rz?.nom).toBe(PODVAL_RZ_NOM);
    expect(rz?.bolalar.map((b) => [b.nom.slice(0, 13), b.hajm, b.summa, b.birlik])).toEqual([
      ['ШЕФ-МОНТАЖНАЯ', 1, 300, 'КОМПЛ'], ['ТАМОЖЕННЫЕ РА', 1, 4046.85, 'КОМПЛ'],
    ]);
    expect(a.qatorlarJami).toBe(1000);
    expect(a.jami.pryamye).toBe(1000);
    expect(a.ogohlantirishlar.filter((o) => o.kod === 'JAMI_FARQ')).toEqual([]);
  });

  it('dvigatelga podval berilmaydi; bog‘lanmagan podval qator yozishni to‘xtatmaydi', () => {
    const a = akt();
    expect(dvigatelDaraxti(a.daraxt).some((t) => t.podval)).toBe(false);
    const ind = f2Indeks(a.daraxt);
    const bog: IshJoyi = { bog: new Map([['V!6', { qatorId: 11, holat: 'aniq', usul: 't' }], ['V!7', { qatorId: 12, holat: 'aniq', usul: 't' }]]), otkaz: new Set() };
    const w = yozishManbasi(ind, bog);
    expect(w.toxtatish.filter((m) => /hal qilinmagan/.test(m))).toEqual([]);
    expect(w.nodes.map((n) => n.uid)).toEqual(['V!6', 'V!7']);
  });

  it('smetada nom o‘xshash va summa aynan (±1) YAGONA qator bo‘lsa — ◐ taklif; aks holda taklif yo‘q', () => {
    const a = akt();
    const qat = f2Indeks(a.daraxt).qatorlar;
    const smeta = [
      { id: 501, tur: 'bl', nom: 'ТАМОЖЕННЫЕ РАСХОДЫ (НДС 12%)', summa: 4046.85 },
      { id: 502, tur: 'bl', nom: 'ШЕФ-МОНТАЖНЫЕ РАБОТЫ', summa: 299.5 }, // so‘z shakli boshqa -> mos emas
      { id: 503, tur: 'rz', nom: 'ТАМОЖЕННЫЕ РАСХОДЫ', summa: 4046.85 },
    ];
    expect(podvalMosQator({ nom: 'ТАМОЖЕННЫЕ РАСХОДЫ И НДС ДЛЯ ОБОРУДОВАНИЕ', summa: 4046.85 }, smeta)).toBe(501);
    const ij = podvalTaklifQosh({ bog: new Map(), otkaz: new Set() }, qat, smeta);
    const tk = [...ij.bog].filter(([uid]) => uid === 'V!9' || uid === 'V!10').map(([uid, b]) => [uid, b.qatorId, b.holat]);
    expect(tk).toEqual([['V!10', 501, 'taklif']]);
    // Ikki xil mos qator — noaniq, taklif yo‘q.
    expect(podvalMosQator({ nom: 'ТАМОЖЕННЫЕ РАСХОДЫ', summa: 10 }, [
      { id: 1, tur: 'bl', nom: 'ТАМОЖЕННЫЕ РАСХОДЫ', summa: 10 }, { id: 2, tur: 'bl', nom: 'ТАМОЖЕННЫЕ РАСХОДЫ 2', summa: 10 },
    ])).toBeNull();
    // Summa mos emas.
    expect(podvalMosQator({ nom: 'ТАМОЖЕННЫЕ РАСХОДЫ', summa: 10 }, [{ id: 1, tur: 'bl', nom: 'ТАМОЖЕННЫЕ РАСХОДЫ', summa: 12 }])).toBeNull();
  });

  it('Sun’iy ko‘l: summa aynan teng YAGONA smeta qatori — nom boshqacha yozilgan bo‘lsa ham ◐ taklif; summa ustuni bo‘sh — hajm × narx', () => {
    const smeta = [
      { id: 950874, tur: 'rz', nom: '17. ОБОРУДОВАНИЕ MAGIC FUN', summa: 4_046_929_242.85 },
      { id: 950885, tur: 'ob', nom: 'Шефмонтажные работы', summa: null, hajm: 1, narx: 4_009_740_240 },
      // Siz qo'shgan qator: summa ustuni bo'sh, hajm × narx.
      { id: 950888, tur: 'ob', nom: 'Импорт: расходы (НДС 12%)', summa: null, hajm: 1, narx: 4_046_929_242.85 },
    ];
    expect(podvalMosQator({ nom: 'ТАМОЖЕННЫЕ РАСХОДЫ И НДС ДЛЯ ОБОРУДОВАНИЕ', summa: 4_046_929_242.85 }, smeta)).toBe(950888);
    // Shef-montaj podvalda yarmi (2 004 870 120) — summa teng qator yo'q, taklif yo'q (operator qo'lda bog'laydi yoki izoh qiladi).
    expect(podvalMosQator({ nom: 'ШЕФ-МОНТАЖНАЯ РАБОТА', summa: 2_004_870_120 }, smeta)).toBeNull();
    // Kichik summa faqat summa bo'yicha taklif qilinmaydi (tasodif).
    expect(podvalMosQator({ nom: 'ТАМОЖЕННЫЕ', summa: 500 }, [{ id: 1, tur: 'mat', nom: 'Песок', summa: 500 }])).toBeNull();
    // Summasi teng ikki qator — noaniq.
    expect(podvalMosQator({ nom: 'X', summa: 5_000_000 }, [{ id: 1, tur: 'mat', nom: 'A', summa: 5_000_000 }, { id: 2, tur: 'mat', nom: 'B', summa: 5_000_000 }])).toBeNull();
  });

  it('podval qatori asosiy qismda olingan smeta qatoriga bog‘lansa — takror; «faqat izoh» (otkaz) — takror yo‘q, yozish to‘xtamaydi', () => {
    const a = akt();
    const ind = f2Indeks(a.daraxt);
    const shef = ind.qatorlar.find((t) => t.podval && t.nom.startsWith('ШЕФ'))!;
    const ij: IshJoyi = { bog: new Map([
      ['V!6', { qatorId: 11, holat: 'qolda', usul: 'qolda' }], ['V!7', { qatorId: 12, holat: 'qolda', usul: 'qolda' }],
      [shef.uid, { qatorId: 11, holat: 'qolda', usul: 'qolda' }],
    ]), otkaz: new Set() };
    expect(podvalTakrori(shef, ind.qatorlar, ij)).toEqual(['V!6']);
    const izoh: IshJoyi = { bog: new Map([...ij.bog].filter(([u]) => u !== shef.uid)), otkaz: new Set([shef.uid]) };
    expect(podvalTakrori(shef, ind.qatorlar, izoh)).toEqual([]);
    const w = yozishManbasi(ind, izoh);
    expect(w.toxtatish.filter((m) => /hal qilinmagan/.test(m))).toEqual([]);
    expect(w.nodes.map((n) => n.uid)).toEqual(['V!6', 'V!7']);
  });
});
