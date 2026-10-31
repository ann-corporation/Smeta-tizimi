import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import type { JurnalHolat } from './fakt-jurnal';
import { bolimSummalari } from './fakt-jurnal';
import { faktYigindiHisobla } from './fakt-studio';
import { slichitelniyModeli } from './slichitelniy-vedomost';
import { obyektSmetaKOplate, obyektUstamali } from './ustamali-summa';
import { faktF2Qoida, standartPodval } from './hisob-yadro';
import type { SvodYaxlit } from './svod-yaxlit';

/*
 * SAHIFA ↔ EKSPORT paritet (egasi: «bir joyda tuzatish — hamma joyda»). Sintetik obyekt (mijoz ma'lumoti emas):
 *  - 10-bo'lim — svod yaxlit (svod 1 344 QQS bilan → 1 200 QQS siz; tarkib smetasi 1 000);
 *  - 20-bo'lim — oddiy: manfiy qator (25), narxsiz qator (24), fakt < F2 (22), fakt va F2 ishorasi har xil (23).
 * Fakt jurnali bo'lim summalari (bolimSummalari / faktYigindiHisobla) Сличительная модели bilan bir xil sonni beradi.
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
  q(24, 21, 'rs', 1, 'МАТ', null), q(25, 21, 'rs', -1, 'МАТ'),
];
/** Holat: summalar = hajm × narx (server t2_qator_holat kabi); narxsiz — NULL (0 emas). */
function h(id: number, fakt: number, f2: number): T2QatorHolat {
  const r = DARAXT.find((x) => x.id === id)!;
  const s = (v: number | null) => (r.narx == null || v == null ? null : Math.round(v * r.narx * 100) / 100);
  return { id, qator_id: id, obyekt_id: 1, tur: r.tur, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, smeta_hajm: r.hajm,
    smeta_summa: s(r.hajm), fakt_hajm: fakt, fakt_summa: s(fakt), f2_hajm: f2, f2_summa: s(f2) ?? 0, qoldiq_hajm: null, qoldiq_summa: null } as T2QatorHolat;
}
const HOLAT: T2QatorHolat[] = [
  h(11, 0, 0), h(12, 0.15, 0), h(13, 0, 0),
  h(21, 0, 0), h(22, 0.5, 0.8), h(23, 1, -0.2), h(24, 0, 0), h(25, -0.5, -1),
];
const JH = HOLAT as unknown as JurnalHolat[];

describe('sahifalar yadro bilan: Fakt jurnali = Сличительная модели (svod, manfiy qator, narxsiz)', () => {
  const model = slichitelniyModeli(DARAXT, HOLAT, { svodYaxlit: SVOD });
  const s = bolimSummalari(DARAXT, JH, undefined, SVOD);

  it('smeta: svod bo‘limi yaxlit summasi (QQS siz) bilan; narxsiz qator yig‘ilmaydi (NULL ≠ 0)', () => {
    expect(model.jami.smeta).toBe(3200); // 1 200 (svod) + 1 000 + 2 000 − 1 000
    expect(s.get(0)?.smeta.ustamasiz).toBe(model.jami.smeta);
    expect(s.get(0)?.smeta.kesim.summasizSoni).toBe(1);
    // Ichki bo'lim kesimi: svod bo'limi (10) o'zi — yaxlitning o'zi; oddiy bo'lim (20) — o'z qatorlari.
    expect(s.get(10)?.smeta.ustamasiz).toBe(1200);
    expect(s.get(20)?.smeta.ustamasiz).toBe(2000);
  });

  it('fakt: F2 dan kam emas (ishorali), ishora har xil — o‘zgarmaydi; svod — yaxlit × fakt / smeta', () => {
    expect(model.jami.fakt).toBe(980); // 180 (svod: 1 200 × 150 / 1 000) + 800 + 1 000 − 1 000
    expect(s.get(0)?.fakt.ustamasiz).toBe(model.jami.fakt);
    expect(faktYigindiHisobla(DARAXT, JH, [], SVOD).faktUstamasiz).toBe(model.jami.fakt);
    expect(s.get(0)?.faktF2).toEqual({ f2dan: 2, aralash: 1 });
    const y = faktYigindiHisobla(DARAXT, JH, [], SVOD);
    expect([y.faktF2dan, y.faktF2Aralash]).toEqual([2, 1]);
    // Model diqqatida ham xuddi shu pozitsiya (ishora har xil) aytiladi.
    expect(model.diqqat.some((d) => /разного знака/.test(d.sabab))).toBe(true);
  });

  it('F2: tasdiqlangan summa aynan, ishorali (masshtablanmaydi) — svod bo‘limida ham', () => {
    expect(model.jami.f2).toBe(-400); // 800 − 200 − 1 000
    expect(s.get(0)?.f2.ustamasiz).toBe(model.jami.f2);
  });

  it('faktF2Qoida — yadro: F2 yo‘q/0 — fakt; manfiy — MIN; ishora har xil — o‘zgarmaydi; NULL — NULL', () => {
    expect(faktF2Qoida(500, null)).toEqual({ qiymat: 500, aralash: false, f2dan: false });
    expect(faktF2Qoida(500, 0)).toEqual({ qiymat: 500, aralash: false, f2dan: false });
    expect(faktF2Qoida(500, 800)).toEqual({ qiymat: 800, aralash: false, f2dan: true });
    expect(faktF2Qoida(-500, -1000)).toEqual({ qiymat: -1000, aralash: false, f2dan: true });
    expect(faktF2Qoida(1000, -200)).toEqual({ qiymat: 1000, aralash: true, f2dan: false });
    expect(faktF2Qoida(null, 800)).toEqual({ qiymat: null, aralash: false, f2dan: false });
  });
});

describe('Nakopitelniy smeta «к оплате» — bitta yadro hisobi', () => {
  const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
  const r = { cats: { chel: 1300, mash: 0, mat: 2700, ob: 500, mk: 0, kab: 0, bez: 0 }, cats_kaskad: { chel: 1000, mash: 0, mat: 2000, ob: 500, mk: 0, kab: 0, bez: 0 }, svod_yaxlit: SVOD, koeffitsientlar: NK, nk_manba: 'shartnoma' };

  it('podvalsiz va standart podval bilan bir xil; ВСЕГО = ishlar + svod (QQS bilan, aynan); tartib QQS bilan → ИТОГО-4 → ustamasiz', () => {
    const a = obyektSmetaKOplate(r, null, NK);
    const b = obyektSmetaKOplate(r, standartPodval(NK), NK);
    const u = obyektUstamali(r, null, NK)!;
    expect(a.sabab).toBeNull();
    expect(a.qiymat!.vsego).toBe(u.ndsBilan);
    expect(b.qiymat).toEqual(a.qiymat);
    expect(a.qiymat!.vsego).toBeGreaterThan(a.qiymat!.itogo4);
    expect(a.qiymat!.itogo4).toBeGreaterThan(a.qiymat!.pryamye);
    expect(a.qiymat!.pryamye).toBe(4500); // ishlar 3 500 + svod tarkibi 1 000 (ustamasiz)
  });

  it('kirish yetishmasa — «не определена» (null + sabab), muqobil manba yo‘q', () => {
    expect(obyektSmetaKOplate(null, null, NK)).toMatchObject({ qiymat: null });
    expect(obyektSmetaKOplate(r, null, null).sabab).toBeTruthy();
    const qqssiz = obyektSmetaKOplate({ ...r, koeffitsientlar: { ...NK, НДС: null as unknown as number } }, null, { ...NK, НДС: null as unknown as number });
    expect(qqssiz.qiymat).toBeNull();
    expect(qqssiz.sabab).toBeTruthy();
  });
});
