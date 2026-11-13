import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import type { JurnalHolat } from './fakt-jurnal';
import { bolimSummalari } from './fakt-jurnal';
import { faktYigindiHisobla } from './fakt-studio';
import { slichitelniyModeli } from './slichitelniy-vedomost';
import { obyektSmetaKOplate, obyektUstamali } from './ustamali-summa';
import { faktSummaF2Narxda, standartPodval } from './hisob-yadro';
import type { SvodYaxlit } from './svod-yaxlit';

/*
 * SAHIFA ↔ EKSPORT paritet (egasi: «bir joyda tuzatish — hamma joyda»). Sintetik obyekt (mijoz ma'lumoti emas):
 *  - 10-bo'lim — svod yaxlit (svod 1 344 QQS bilan → 1 200 QQS siz; tarkib smetasi 1 000), ichida F2;
 *  - 20-bo'lim — oddiy: F2 narxi smetadan yuqori (22), past (23), manfiy qator (25), narxsiz (24), fakt NULL + F2 (26).
 * Narx qoidasi: fakt HAJMI yozilganidek; tasdiqlangan F2 bor qatorda fakt SUMMASI F2 birlik narxida.
 */
const SVOD: SvodYaxlit = {
  qqssiz: 1200, barglar: 1000, summasiz: 0,
  bolimlar: [{ id: 1, qator_id: 10, nom: 'СВОД', svod_summa: 1344, qqs_stavka: 12, qqssiz: 1200, barglar: 1000, asos: 'svod', dalil: {} }],
};

function q(id: number, ota_id: number | null, tur: string, hajm: number | null, kat: string | null = null, narx: number | null = 1000): T2Qator {
  return {
    id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'К' + id, nom: 'Позиция ' + id,
    birlik: 'м3', hajm, narx, summa: null, kat, narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null,
  } as T2Qator;
}
const DARAXT: T2Qator[] = [
  q(10, null, 'rz', null), q(11, 10, 'bl', 1, null, null), q(12, 11, 'rs', 0.3, 'ЧЕЛ'), q(13, 11, 'rs', 0.7, 'МАТ'),
  q(20, null, 'rz', null), q(21, 20, 'bl', 1, null, null), q(22, 21, 'rs', 1, 'ЧЕЛ'), q(23, 21, 'rs', 2, 'МАТ'),
  q(24, 21, 'rs', 1, 'МАТ', null), q(25, 21, 'rs', -1, 'МАТ'), q(26, 21, 'rs', 1, 'МАТ'),
];
/** Holat (server t2_qator_holat kabi): smeta/fakt summasi = hajm × smeta narxi; F2 summasi — tasdiqlangan (aynan). */
function h(id: number, fakt: number | null, f2h: number, f2s: number): T2QatorHolat {
  const r = DARAXT.find((x) => x.id === id)!;
  const s = (v: number | null) => (r.narx == null || v == null ? null : Math.round(v * r.narx * 100) / 100);
  const sm = s(r.hajm);
  return { id, qator_id: id, obyekt_id: 1, tur: r.tur, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, smeta_hajm: r.hajm,
    smeta_summa: sm, fakt_hajm: fakt, fakt_summa: s(fakt), f2_hajm: f2h, f2_summa: f2s, qoldiq_hajm: null,
    qoldiq_summa: sm == null ? null : Math.round((sm - f2s) * 100) / 100 } as T2QatorHolat;
}
const HOLAT: T2QatorHolat[] = [
  h(11, 0, 0, 0), h(12, 0.15, 0.1, 200), h(13, 0, 0, 0),
  h(21, 0, 0, 0), h(22, 0.5, 0.8, 2800), h(23, 1, 0.5, 400), h(24, 0, 0, 0), h(25, -0.5, -1, -1000), h(26, null, 1, 1000),
];
const JH = HOLAT as unknown as JurnalHolat[];

describe('narx qoidasi — yadro faktSummaF2Narxda', () => {
  it('smeta 12 000, F2 35 000 — fakt summasi F2 narxida; fakt < F2 yozilganidek; fakt NULL — NULL', () => {
    expect(faktSummaF2Narxda(3, 10, 350000, 36000)).toEqual({ summa: 105000, manba: 'f2', narx: 35000 });
    expect(faktSummaF2Narxda(null, 10, 350000, null).summa).toBeNull();
    expect(faktSummaF2Narxda(3, 0, 0, 36000)).toEqual({ summa: 36000, manba: 'fakt', narx: null });
  });
});

describe('sahifalar yadro bilan: Fakt jurnali / Fakt Studio = Сличительная модели', () => {
  const model = slichitelniyModeli(DARAXT, HOLAT, { svodYaxlit: SVOD });
  const s = bolimSummalari(DARAXT, JH, undefined, SVOD);
  const qator = (id: number) => model.qatorlar.find((x) => x.id === id && x.tur === 'barg')!;

  it('fakt hajmi yozilganidek: fakt < F2 — o‘zgarmaydi; fakt NULL + F2 — NULL qoladi', () => {
    expect(qator(22).faktHajm).toBe(0.5);
    expect(qator(26).faktHajm).toBeNull();
    expect(qator(26).faktSumma).toBeNull();
  });

  it('fakt summasi F2 narxida: F2 smetadan qimmat (22) va arzon (23), manfiy qator (25)', () => {
    expect(qator(22).faktSumma).toBe(1750); // 0,5 × 3 500 (smeta narxi 1 000 emas)
    expect(qator(23).faktSumma).toBe(800);  // 1 × 800
    expect(qator(25).faktSumma).toBe(-500); // −0,5 × 1 000
    expect(qator(22).f2Narxda).toBe(true);
    // 4 — отклонение SUMMA = I − G (F2 narxidagi fakt − smeta), qator ichida izchil.
    expect(qator(22).farqSumma).toBe(1750 - 1000);
    expect(qator(23).farqSumma).toBe(800 - 2000);
    expect(qator(26).farqSumma).toBeNull(); // fakt NULL
  });

  it('smeta: svod yaxlit (QQS siz); narxsiz qator yig‘ilmaydi (NULL ≠ 0)', () => {
    expect(model.jami.smeta).toBe(4200);
    expect(s.get(0)?.smeta.ustamasiz).toBe(model.jami.smeta);
    expect(s.get(0)?.smeta.kesim.summasizSoni).toBe(1);
  });

  it('fakt: sahifa = eksport; svod — yaxlit × (F2 narxidagi fakt / smeta)', () => {
    // OGOHLANTIRISH (2026-11-14): Slichitelniy hujjati svod faktini endi TAQSIMLAMAYDI (server #450 qoidasi: fakt Ф-2 usulida, to'g'ri narx;
    // qator ichida hajm × narx = summa). Sahifalar (bolimSummalari / faktYigindiHisobla) hali egasining 10-30 qoidasi bilan taqsimlaydi:
    // svod qismi sahifada 360 (1 200 × 300 / 1 000), hujjatda 300. Sahifalar ham ko'chirilgach (sinov-fakt) bu tenglik qayta tiklanadi.
    expect(model.jami.fakt).toBe(2350); // 300 (to'g'ri narx) + 1 750 + 800 − 500
    expect(s.get(0)?.fakt.ustamasiz).toBe((model.jami.fakt ?? 0) + 60);
    expect(s.get(10)?.fakt.ustamasiz).toBe(360);
    const y = faktYigindiHisobla(DARAXT, JH, [], SVOD);
    expect(y.faktUstamasiz).toBe((model.jami.fakt ?? 0) + 60);
    expect(y.faktF2Narxda).toBe(4); // 12, 22, 23, 25 (26 — fakt NULL, summa yo'q)
  });

  it('F2 aynan (masshtablanmaydi); svod F2 qoldig‘i = yaxlit − F2 aynan', () => {
    expect(model.jami.f2).toBe(3400);
    expect(s.get(0)?.f2.ustamasiz).toBe(model.jami.f2);
    expect(s.get(10)?.f2.ustamasiz).toBe(200);
    expect(s.get(10)?.qoldiq.ustamasiz).toBe(1000); // 1 200 − 200
    expect(s.get(0)?.qoldiq.ustamasiz).toBe(800);   // smeta 4 200 − F2 3 400
  });
});

describe('Nakopitelniy smeta «к оплате» — bitta yadro hisobi', () => {
  const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
  const r = { cats: { chel: 1300, mash: 0, mat: 2700, ob: 500, mk: 0, kab: 0, bez: 0 }, cats_kaskad: { chel: 1000, mash: 0, mat: 2000, ob: 500, mk: 0, kab: 0, bez: 0 }, svod_yaxlit: SVOD, koeffitsientlar: NK, nk_manba: 'shartnoma' };

  it('podvalsiz va standart podval bilan bir xil; ВСЕГО = obyektUstamali; tartib QQS bilan → ИТОГО-4 → ustamasiz', () => {
    const a = obyektSmetaKOplate(r, null, NK);
    const b = obyektSmetaKOplate(r, standartPodval(NK), NK);
    expect(a.sabab).toBeNull();
    expect(a.qiymat!.vsego).toBe(obyektUstamali(r, null, NK)!.ndsBilan);
    expect(b.qiymat).toEqual(a.qiymat);
    expect(a.qiymat!.vsego).toBeGreaterThan(a.qiymat!.itogo4);
    expect(a.qiymat!.itogo4).toBeGreaterThan(a.qiymat!.pryamye);
    expect(a.qiymat!.pryamye).toBe(4500);
    expect(a.qiymat!.taxminiy).toBe(false);
  });

  it('kategoriyasiz smeta qismi tashlanmaydi: ИТОГО-4 ga ustamasiz, «≈»', () => {
    const a = obyektSmetaKOplate(r, null, NK);
    const c = obyektSmetaKOplate(r, null, NK, 4600);
    expect(c.qiymat!.pryamye).toBe(4600);
    expect(c.qiymat!.taxminiy).toBe(true);
    expect(c.qiymat!.itogo4).toBe(Math.round((a.qiymat!.itogo4 + 100) * 100) / 100);
  });

  it('kirish yetishmasa — «не определена» (null + sabab), muqobil manba yo‘q', () => {
    expect(obyektSmetaKOplate(null, null, NK)).toMatchObject({ qiymat: null });
    expect(obyektSmetaKOplate(r, null, null).sabab).toBeTruthy();
    const yoq = { ...NK, НДС: null as unknown as number };
    const x = obyektSmetaKOplate({ ...r, koeffitsientlar: yoq }, null, yoq);
    expect(x.qiymat).toBeNull();
    expect(x.sabab).toBeTruthy();
  });
});
