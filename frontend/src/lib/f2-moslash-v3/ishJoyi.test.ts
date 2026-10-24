import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { f2MoslashV3, type SmetaQator } from './index';
import {
  avtoBoglarniUz, bogla, boshlangich, f2Indeks, guruhHisobla, ishlarResurslariniBogla, rzTaklifHisobla, guruhHolati, hisobla, ishniBogla, ishniTasdiqla, korinish, oshaQatormi, otkazibYubor, smetaIndeks, tasdiqla, uz, yozishManbasi,
} from './ishJoyi';

const S: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: ФУНДАМЕНТ', birlik: null, hajm: null, tartib: 1 },
  { id: 2, otaId: 1, tur: 'bl', kod: 'E6-1-1-22', nom: 'УСТРОЙСТВО ФУНДАМЕНТОВ', birlik: '100М3', hajm: 2, tartib: 2 },
  { id: 3, otaId: 2, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 360, tartib: 3 },
  { id: 4, otaId: 2, tur: 'mat', kod: '12-575-5', nom: 'БЕТОН В25 W6', birlik: 'М3', hajm: 203, tartib: 4 },
  { id: 5, otaId: 1, tur: 'bl', kod: 'E14-1-1', nom: 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', birlik: 'Т', hajm: 0.5, tartib: 5 },
];
const SI = smetaIndeks(S);

let q = 0;
function t(tur: F2Tugun['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null, narx: number | null, summa: number | null, bolalar: F2Tugun[] = []): F2Tugun {
  q++;
  return { uid: `A!${q}`, tur, kod, nom, birlik, hajm, narx, summa, manzil: { fayl: 'f', varaq: 'A', qator: q }, yol: ['РАЗДЕЛ: ФУНДАМЕНТ'], bolalar, barg: tur !== 'rz' && !bolalar.length };
}
const r1 = t('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 180, 10, 1800);
const r2 = t('rs', '12-575-3', 'БЕТОН В15 W6', 'М3', 101.5, 100, 10150); // smetada В25 — zamena material
const ish = t('bl', 'E6-1-1-22', 'УСТРОЙСТВО ФУНДАМЕНТОВ', '100М3', 1, null, 11950, [r1, r2]);
const sim = t('bl', 'E14-1-1', 'ПРОВОЛОКА ВЯЗАЛЬНАЯ', 'Т', 0.2, 5000, 1000);
const rz = { ...t('rz', null, 'РАЗДЕЛ: ФУНДАМЕНТ', null, null, null, null, [ish, sim]), yol: [], barg: false };
const IND = f2Indeks([rz]);

describe('F2 V3 ish joyi holati', () => {
  it('ish resurslari bilan bog‘lanadi; marka farqli material bog‘lanmaydi (zamena)', () => {
    const bosh = { bog: new Map(), otkaz: new Set<string>() };
    const r = ishniBogla(bosh, ish, 2, SI);
    expect(r.ij.bog.get(ish.uid)?.qatorId).toBe(2);
    expect(r.ij.bog.get(r1.uid)?.qatorId).toBe(3);
    expect(r.ij.bog.has(r2.uid)).toBe(false);
    expect(r).toMatchObject({ boglandi: 1, qoldi: 1 });
    expect(korinish(r.ij, r2.uid)).toBe('topilmadi');
  });

  it('hal qilinmagan qator bor ekan — yozish to‘xtaydi; zamena bog‘langach ish faqat hajm, resurslar pul', () => {
    let ij = ishniBogla({ bog: new Map(), otkaz: new Set() }, ish, 2, SI).ij;
    ij = bogla(ij, sim.uid, 5);
    expect(yozishManbasi(IND, ij).toxtatish[0]).toMatch(/1 ta qator hal qilinmagan/);
    ij = bogla(ij, r2.uid, 99); // masalan yangi zamena qatori
    const y = yozishManbasi(IND, ij);
    expect(y.toxtatish).toEqual([]);
    expect(y.nodes.find((n) => n.uid === ish.uid)).toMatchObject({ hajm: 1, narx: undefined, summa: undefined });
    expect(y.nodes.find((n) => n.uid === r2.uid)).toMatchObject({ summa: 10150, narx: 100 });
    expect(y.nodes.find((n) => n.uid === sim.uid)).toMatchObject({ summa: 1000 });
    expect(y.imzolar.size).toBe(4);
    const h = hisobla(IND, ij);
    expect(h).toMatchObject({ jami: 4, tayyor: 4, boglanganSumma: 12950, hujjatSumma: 12950 });
  });

  it('avtomatik topilgan, oldingi qarordan olingan va operator tasdiqlagan bog‘lanishlarni alohida sanaydi', () => {
    const ij = { bog: new Map([
      [ish.uid, { qatorId: 2, holat: 'aniq' as const, usul: 'ball' }],
      [r1.uid, { qatorId: 3, holat: 'xotira' as const, usul: 'xotira' }],
      [r2.uid, { qatorId: 4, holat: 'qolda' as const, usul: 'qolda' }],
      [sim.uid, { qatorId: 5, holat: 'qolda' as const, usul: 'taklif_tasdiq' }],
    ]), otkaz: new Set<string>() };
    expect(hisobla(IND, ij)).toMatchObject({
      jami: 4, tayyor: 4, tizimTopdi: 1, avvalgiQaror: 1, operatorTasdiqladi: 2,
    });
  });

  it('o‘tkazib yuborilgan ish resurslari bilan chiqadi, summa alohida ko‘rinadi', () => {
    let ij = bogla({ bog: new Map(), otkaz: new Set() }, sim.uid, 5);
    ij = otkazibYubor(ij, ish, true);
    expect(korinish(ij, r1.uid)).toBe('otkazildi');
    expect(yozishManbasi(IND, ij).toxtatish).toEqual([]);
    expect(hisobla(IND, ij)).toMatchObject({ otkazildi: 3, otkazilganSumma: 11950 });
    ij = otkazibYubor(ij, ish, false);
    expect(korinish(ij, ish.uid)).toBe('topilmadi');
  });

  it('taklif tasdiqlanmaguncha yozilmaydi; qayta hisoblashda qo‘lda qarorlar saqlanadi', () => {
    // Nomi biroz farqli (aynan bir xil nom ✓ bo'ladi) va avtoMin baland — hammasi ◐ yoki ✕.
    const rzT = { ...rz, bolalar: rz.bolalar.map((x) => ({ ...x, nom: x.nom + ' (F2)' })) };
    const n = f2MoslashV3([rzT], S, { avtoMin: 999 });
    let ij = boshlangich(n);
    const takliflar = [...ij.bog.entries()].filter(([, b]) => b.holat === 'taklif').map(([u]) => u);
    expect(takliflar.length).toBeGreaterThan(0);
    ij = tasdiqla(ij, takliflar);
    expect(takliflar.every((u) => korinish(ij, u) === 'qolda')).toBe(true);
    const qayta = boshlangich(f2MoslashV3([rzT], S, { avtoMin: 999 }), ij);
    expect(takliflar.every((u) => korinish(qayta, u) === 'qolda')).toBe(true);
  });

  it('boshqa F2 qatori (pereraschet minusi) band qilgan smeta resursi to‘siq emas — ish bog‘langanda resursi ham bog‘lanadi', () => {
    // Boshqa bo'limdagi minus qator allaqachon smeta resursi 3 ga bog'langan.
    const minus = { bog: new Map([['MINUS!1', { qatorId: 3, holat: 'qolda' as const, usul: 'pereraschet_taklif' }]]), otkaz: new Set<string>() };
    const r = ishniBogla(minus, ish, 2, SI);
    expect(r.ij.bog.get(r1.uid)?.qatorId).toBe(3);
    expect(r.ij.bog.get('MINUS!1')?.qatorId).toBe(3);
  });

  it('ishlarResurslariniBogla: bog‘langan ishning resurslari — aniq mosi ✓, o‘xshash nomlisi ◐ taklif, mos yo‘g‘i ✕', () => {
    const SS = smetaIndeks([...S, { id: 6, otaId: 2, tur: 'mat', kod: '12-999-9', nom: 'БЕТОН ТЯЖЕЛЫЙ В15 W6 F150', birlik: 'М3', hajm: 10, tartib: 6 }]);
    const ij0 = bogla({ bog: new Map([['MINUS!1', { qatorId: 3, holat: 'qolda' as const, usul: 'qolda' }]]), otkaz: new Set<string>() }, ish.uid, 2);
    const r = ishlarResurslariniBogla(ij0, IND, SS);
    expect(r.ij.bog.get(r1.uid)).toMatchObject({ qatorId: 3, holat: 'qolda', usul: 'ish_ichida' });
    // r2 «БЕТОН В15 W6» — kod boshqa, smetada В25 (marka farqli, ✓ emas); «БЕТОН ТЯЖЕЛЫЙ В15 W6 F150» o'xshash → ◐.
    expect(r.ij.bog.get(r2.uid)).toMatchObject({ qatorId: 6, holat: 'taklif' });
    expect(r).toMatchObject({ boglandi: 1, taklif: 1, qoldi: 0 });
    // Ikkinchi marta — o'zgarish yo'q (idempotent).
    const r2x = ishlarResurslariniBogla(r.ij, IND, SS);
    expect(r2x).toMatchObject({ boglandi: 0, taklif: 0 });
    expect(r2x.ij).toBe(r.ij);
  });

  it('rzTaklifHisobla: ishlar hali bog‘lanmagan F2 bo‘limi — ishlar SHIFRI eng ko‘p tushgan smeta bo‘limi taklif qilinadi; teng bo‘lsa nomi bo‘yicha', () => {
    const SQ: SmetaQator[] = [
      { id: 100, otaId: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: СМЕТА № 02-03 НА КАНАЛИЗАЦИЯ', birlik: null, hajm: null, tartib: 1 },
      { id: 101, otaId: 100, tur: 'bl', kod: 'E23-1-21-1', nom: 'УКЛАДКА ТРУБ', birlik: '100М', hajm: 1, tartib: 2 },
      { id: 200, otaId: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: СМЕТА № 01-04 НА КОЛОДЦЕВ', birlik: null, hajm: null, tartib: 3 },
      { id: 210, otaId: 200, tur: 'rz', kod: null, nom: 'КОЛОДЕЦ К1', birlik: null, hajm: null, tartib: 4 },
      { id: 211, otaId: 210, tur: 'bl', kod: 'E23-3-1-3', nom: 'УСТРОЙСТВО КОЛОДЦЕВ', birlik: '10М3', hajm: 5, tartib: 5 },
      { id: 212, otaId: 210, tur: 'bl', kod: 'E7-1-44-3', nom: 'УСТАНОВКА МОНТАЖНЫХ ИЗДЕЛИЙ', birlik: 'Т', hajm: 1, tartib: 6 },
      { id: 220, otaId: 200, tur: 'rz', kod: null, nom: 'ГИДРОИЗОЛЯЦИЯ', birlik: null, hajm: null, tartib: 7 },
      { id: 221, otaId: 220, tur: 'bl', kod: 'E12-2-2-2', nom: 'ГИДРОИЗОЛЯЦИЯ ОБМАЗОЧНАЯ', birlik: '100М2', hajm: 1, tartib: 8 },
      { id: 222, otaId: 220, tur: 'bl', kod: 'E12-2-2-3', nom: 'ГИДРОИЗОЛЯЦИЯ НА КАЖДЫЙ СЛОЙ', birlik: '100М2', hajm: 1, tartib: 9 },
      // Xuddi shu gidroizolyatsiya shifrlari boshqa bo'limda ham bor (teng hisob — nom hal qiladi).
      { id: 300, otaId: null, tur: 'rz', kod: null, nom: 'ПОДПОРНАЯ СТЕНА', birlik: null, hajm: null, tartib: 10 },
      { id: 301, otaId: 300, tur: 'bl', kod: 'E12-2-2-2', nom: 'ГИДРОИЗОЛЯЦИЯ ОБМАЗОЧНАЯ', birlik: '100М2', hajm: 1, tartib: 11 },
      { id: 302, otaId: 300, tur: 'bl', kod: 'E12-2-2-3', nom: 'ГИДРОИЗОЛЯЦИЯ НА КАЖДЫЙ СЛОЙ', birlik: '100М2', hajm: 1, tartib: 12 },
    ];
    const SS = smetaIndeks(SQ);
    const kol = t('rz', null, 'КОЛОДЕЦ К-1М', null, null, null, null, [
      t('bl', 'E23-3-1-3', 'УСТРОЙСТВО КОЛОДЦЕВ', '10М3', 5, null, 100),
      t('bl', 'E7-1-44-3', 'УСТАНОВКА МОНТАЖНЫХ ИЗДЕЛИЙ', 'Т', 0.36, null, 10),
      t('bl', 'Е06-01-082-4', 'ПРИГОТОВЛЕНИЕ РАСТВОРОВ', '100М3', 0.5, null, 5),
    ]);
    const gid = t('rz', null, 'ГИДРОИЗОЛЯЦИЯ', null, null, null, null, [
      t('bl', 'E12-2-2-3', 'ГИДРОИЗОЛЯЦИЯ НА КАЖДЫЙ СЛОЙ', '100М2', 7.8, null, 20),
      t('bl', 'E12-2-2-2', 'ГИДРОИЗОЛЯЦИЯ ОБМАЗОЧНАЯ', '100М2', 7.8, null, 24),
    ]);
    const bosh = { bog: new Map(), otkaz: new Set<string>() };
    expect(rzTaklifHisobla(kol, bosh, SS)).toMatchObject({ smetaRzId: 210, soni: 2, jami: 3 });
    expect(rzTaklifHisobla(gid, bosh, SS)).toMatchObject({ smetaRzId: 220, soni: 2, jami: 2 });
    // Nomi ham, shifri ham hal qila olmasa — taklif YO'Q (jim tanlanmaydi).
    const noaniq = t('rz', null, 'БОШҚА ИШЛАР', null, null, null, null, [
      t('bl', 'E12-2-2-3', 'ГИДРОИЗОЛЯЦИЯ НА КАЖДЫЙ СЛОЙ', '100М2', 1, null, 1),
      t('bl', 'E12-2-2-2', 'ГИДРОИЗОЛЯЦИЯ ОБМАЗОЧНАЯ', '100М2', 1, null, 1),
    ]);
    expect(rzTaklifHisobla(noaniq, bosh, SS)).toBeNull();
  });

  it('rzTaklifHisobla (Sun‘iy ko‘l holati): ichki bo‘limli F2 bo‘limi, shifrlar yarmi mos — ota smeta bo‘limi, tenglikda nom hal qiladi', () => {
    const SQ: SmetaQator[] = [
      { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: СМЕТА № 01-04 НА КОЛОДЦЕВ', birlik: null, hajm: null, tartib: 1 },
      { id: 2, otaId: 1, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: КОЛОДЕЦ (ЛИСТ .-39)', birlik: null, hajm: null, tartib: 2 },
      { id: 3, otaId: 2, tur: 'rz', kod: null, nom: 'КОЛОДЕЦ К1', birlik: null, hajm: null, tartib: 3 },
      { id: 4, otaId: 3, tur: 'bl', kod: 'E7-1-44-3', nom: 'МОНТАЖ', birlik: 'Т', hajm: 1, tartib: 4 },
      { id: 5, otaId: 2, tur: 'rz', kod: null, nom: 'ГИДРОИЗОЛЯЦИЯ', birlik: null, hajm: null, tartib: 5 },
      { id: 6, otaId: 5, tur: 'bl', kod: 'E12-2-2-2', nom: 'ГИДРО', birlik: '100М2', hajm: 1, tartib: 6 },
      { id: 7, otaId: 5, tur: 'bl', kod: 'E12-2-2-3', nom: 'ГИДРО СЛОЙ', birlik: '100М2', hajm: 1, tartib: 7 },
      // Boshqa joyda ham xuddi shu uch shifr (sahna quduqlari) — teng ovoz, nom boshqa.
      { id: 10, otaId: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: СМЕТА № 01-10 ПОГЛОЩАЮЩИЙ КОЛОДЕЦ - СЦЕНА', birlik: null, hajm: null, tartib: 10 },
      { id: 11, otaId: 10, tur: 'rz', kod: null, nom: 'КОЛОДЦЫ', birlik: null, hajm: null, tartib: 11 },
      { id: 12, otaId: 11, tur: 'bl', kod: 'E7-1-44-3', nom: 'МОНТАЖ', birlik: 'Т', hajm: 1, tartib: 12 },
      { id: 13, otaId: 11, tur: 'bl', kod: 'E12-2-2-2', nom: 'ГИДРО', birlik: '100М2', hajm: 1, tartib: 13 },
      { id: 14, otaId: 11, tur: 'bl', kod: 'E12-2-2-3', nom: 'ГИДРО СЛОЙ', birlik: '100М2', hajm: 1, tartib: 14 },
    ];
    const SS = smetaIndeks(SQ);
    const f2 = t('rz', null, 'КОЛОДЕЦ К-1М', null, null, null, null, [
      t('bl', 'Е1101-002-04', 'ЩЕБЕНЬ', 'М3', 14, null, 1),
      t('bl', 'E23-3-1-3', 'КОЛОДЦЫ D1М', '10М3', 5, null, 1),
      t('bl', 'Е06-01-082-4', 'РАСТВОР', '100М3', 0.5, null, 1),
      t('bl', 'E7-1-44-3', 'МОНТАЖ', 'Т', 0.36, null, 1),
      t('rz', null, 'ГИДРОИЗОЛЯЦИЯ', null, null, null, null, [
        t('bl', 'E12-2-2-3', 'ГИДРО СЛОЙ', '100М2', 7.8, null, 1),
        t('bl', 'E12-2-2-2', 'ГИДРО', '100М2', 7.8, null, 1),
      ]),
    ]);
    expect(rzTaklifHisobla(f2, { bog: new Map(), otkaz: new Set<string>() }, SS)).toMatchObject({ smetaRzId: 2, soni: 3, jami: 6 });
  });

  it('uzish — ish bilan birga resurslari ham', () => {
    const ij = uz(ishniBogla({ bog: new Map(), otkaz: new Set() }, ish, 2, SI).ij, ish);
    expect(ij.bog.size).toBe(0);
  });

  it('"o‘sha qator" tekshiruvi: kod teng → ha; birlik yoki marka farqli → so‘raladi', () => {
    expect(oshaQatormi(ish, S[1])).toBe(true);
    expect(oshaQatormi(r2, S[3])).toBe(false);
    expect(oshaQatormi({ ...sim, birlik: 'КГ' }, S[4])).toBe(false);
  });

  it('avtoBoglarniUz: aniq/xotira/taklif/tarkib uziladi, qo‘lda va aktga kiritilmaganlar qoladi', () => {
    const ij = {
      bog: new Map([
        ['a', { qatorId: 1, holat: 'aniq' as const, usul: 'kod' }],
        ['b', { qatorId: 2, holat: 'xotira' as const, usul: 'xotira' }],
        ['c', { qatorId: 3, holat: 'taklif' as const, usul: 'nom' }],
        ['d', { qatorId: 4, holat: 'qolda' as const, usul: 'qolda' }],
        ['e', { qatorId: 5, holat: 'qolda' as const, usul: 'taklif_tasdiq' }],
        ['f', { qatorId: 6, holat: 'aniq' as const, usul: 'ish_narxi_tarkibi' }],
      ]),
      otkaz: new Set(['z']),
    };
    const r = avtoBoglarniUz(ij);
    expect(r.uzildi).toBe(4);
    expect([...r.ij.bog.keys()]).toEqual(['d', 'e']);
    expect([...r.ij.otkaz]).toEqual(['z']);
    const bosh = avtoBoglarniUz(r.ij);
    expect(bosh.uzildi).toBe(0);
    expect(bosh.ij).toBe(r.ij);
  });

  it('#REF! (hajmsiz) qator yozishni TO‘XTATMAYDI — aktga kirmaydi, faqat eslatma (egasi 2026-10-24)', () => {
    const xato = { ...sim, uid: 'A!x', hajm: null, ogohlantirish: ['katakda #REF!'] };
    const rz2 = { ...rz, bolalar: [xato, { ...sim, uid: 'A!y' }] };
    const ind = f2Indeks([rz2]);
    const ij = bogla(bogla({ bog: new Map(), otkaz: new Set() }, xato.uid, 5), 'A!y', 6);
    const y = yozishManbasi(ind, ij);
    expect(y.toxtatish).toEqual([]);
    expect(y.nodes.map((n) => n.uid)).toEqual(['A!y']);
    expect(y.ogohlantirish.join()).toMatch(/hajm yo'q/);
  });
  it('narxi bor-u summasi bo‘sh qator yozishni to‘xtatmaydi — hajm yoziladi, eslatma chiqadi', () => {
    const s = { ...sim, uid: 'A!s', summa: null };
    const ind = f2Indeks([{ ...rz, bolalar: [s] }]);
    const y = yozishManbasi(ind, bogla({ bog: new Map(), otkaz: new Set() }, s.uid, 5));
    expect(y.toxtatish).toEqual([]);
    expect(y.nodes).toHaveLength(1);
    expect(y.ogohlantirish.join()).toMatch(/summa bo'sh/);
  });
});

describe('ish + resurslari BITTA guruh (egasi 2026-10-24)', () => {
  const ijTaklif = () => ({ bog: new Map([
    [ish.uid, { qatorId: 2, holat: 'taklif' as const, usul: 'ball' }],
    [r1.uid, { qatorId: 3, holat: 'taklif' as const, usul: 'ball' }],
    [sim.uid, { qatorId: 5, holat: 'aniq' as const, usul: 'ball' }],
  ]), otkaz: new Set<string>() });

  it('ishni tasdiqlash: ish va ◐ resurslari ✓, mos resurs avtomatik bog‘lanadi, mos topilmagani ish ichida qoladi', () => {
    const r = ishniTasdiqla(ijTaklif(), ish, SI);
    expect(korinish(r.ij, ish.uid)).toBe('qolda');
    expect(korinish(r.ij, r1.uid)).toBe('qolda');
    expect(r.tasdiqlandi).toBe(2);
    expect(korinish(r.ij, r2.uid)).toBe('topilmadi'); // В15 ≠ В25 — zamena qarori
    expect(r.qoldi).toBe(1);
    // Mavjud ✓ (aniq) bog'lanish o'zgarmaydi.
    expect(r.ij.bog.get(sim.uid)?.holat).toBe('aniq');
  });

  it('ish tasdiqlangan, resursi bog‘lanmagan — guruh ◐ (bitta ro‘yxatda), hisoblagich ish darajasida; resurslar alohida sanalmaydi', () => {
    const ij = { bog: new Map([[ish.uid, { qatorId: 2, holat: 'qolda' as const, usul: 'qolda' }], [r1.uid, { qatorId: 3, holat: 'qolda' as const, usul: 'qolda' }], [sim.uid, { qatorId: 5, holat: 'aniq' as const, usul: 'ball' }]]), otkaz: new Set<string>() };
    expect(guruhHolati(IND, ij, ish)).toBe('taklif'); // r2 yo'q
    const g = guruhHisobla(IND, ij);
    expect(g).toMatchObject({ taklif: 1, topilmadi: 0, tizimTopdi: 1 });
    expect(g.hal).toEqual([ish.uid]);
    // Hammasi bog'langach guruh ✓.
    const to = bogla(ij, r2.uid, 4);
    expect(guruhHolati(IND, to, ish)).toBe('qolda');
    expect(guruhHisobla(IND, to).hal).toEqual([]);
  });

  it('ish o‘tkazib yuborilsa resurslari ham; hisoblagichda bitta «ataylab chiqarilgan»', () => {
    const ij = otkazibYubor({ bog: new Map(), otkaz: new Set() }, ish, true);
    const g = guruhHisobla(IND, ij);
    expect(g.otkazildi).toBe(1);
    expect(g.topilmadi).toBe(1); // faqat «sim» (mustaqil ish)
  });
});