import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { YAXLIT_KAT, YAXLIT_PODVAL_NOM, yaxlitQatorIdlari, type SvodYaxlit } from './svod-yaxlit';
import { katKesimYigish, obyektUstamali, ustamaliHisobla } from './ustamali-summa';
import { NAKRUTKA_KATLAR, kOplate, kategoriyaKf, nakrutkaKaskadJS, podvalQiymatYaxlit, type KatSummalar } from './nakrutka-podval';
import { podvalHisobla, standartPodval } from './nakrutka-konstruktor';
import { catsKat, ustamaTasiri } from './nakrutka-smetadan';
import { nakopitelniyVedomostHujjat } from './nakopitelniy-vedomost-export';
import { ostatkaHujjatModeli, ostatkaHujjatXlsx } from './ostatka-export';
import { slichitelniyHujjatXlsx, slichitelniyModeli } from './slichitelniy-vedomost';
import { lrvHujjat } from './lrv-hujjat';
import { hujjatTekshir } from './hujjat-yozuvchi';

/*
 * Sintetik obyekt (mijoz ma'lumoti emas): 10-bo'lim svod yaxlit belgili (svod 1 344 so'm QQS bilan → 1 200 QQS siz),
 * 20-bo'lim belgisiz. ORAKUL — server SQL'ining so'zma-so'z JS nusxasi:
 *   t2_nakrutka_yaxlit_qosh_v1(t2_nakrutka_hisobla_v1(cats_kaskad, nk), qqssiz, barglar, nk):
 *     itogo4 = round(kaskad.itogo4 + qqssiz, 2); nds = round(itogo4 × НДС / 100, 2); vsego = round(itogo4 + nds, 2).
 */
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
function serverYaxlitQosh(h: { itogo4: number; nds: number; vsego: number }, qqssiz: number | null, nds: number) {
  if (qqssiz == null) return h;
  const i4 = r2(h.itogo4 + qqssiz);
  const n = r2((i4 * nds) / 100);
  return { itogo4: i4, nds: n, vsego: r2(i4 + n) };
}
const ks = (p: Partial<KatSummalar>): KatSummalar => ({ ...(Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar), ...p });
const serverCats = (s: KatSummalar) => ({ chel: s.ЧЕЛ, mash: s.МАШ, mat: s.МАТ + s.КАБ + s['М/К'] + s['БЕЗ СКЛАД'], ob: s.ОБ, mk: s['М/К'], kab: s.КАБ, bez: s['БЕЗ СКЛАД'] });

const SVOD: SvodYaxlit = {
  qqssiz: 1200, barglar: 1000, summasiz: 0,
  bolimlar: [{ id: 1, qator_id: 10, nom: 'MAGIC FUN', svod_summa: 1344, qqs_stavka: 12, qqssiz: 1200, barglar: 1000, asos: 'svod', dalil: {} }],
};
const TOLIQ = ks({ ЧЕЛ: 1300, МАТ: 2700, ОБ: 500 });
const KASKAD = ks({ ЧЕЛ: 1000, МАТ: 2000, ОБ: 500 });
const ORAKUL = serverYaxlitQosh(nakrutkaKaskadJS(KASKAD, NK), SVOD.qqssiz, 12);
const ESKI = nakrutkaKaskadJS(TOLIQ, NK);

function q(id: number, ota_id: number | null, tur: string, hajm: number | null, kat: string | null = null): T2Qator {
  return {
    id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'К' + id, nom: 'Позиция ' + id,
    birlik: 'м3', hajm, narx: 1000, summa: null, kat, narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null,
  } as T2Qator;
}
function h(qator_id: number, fakt_hajm: number): T2QatorHolat {
  return { id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null,
    smeta_summa: null, fakt_hajm, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: null, qoldiq_summa: null } as T2QatorHolat;
}
const DARAXT: T2Qator[] = [
  q(10, null, 'rz', null), q(11, 10, 'bl', 1), q(12, 11, 'rs', 0.3, 'ЧЕЛ'), q(13, 11, 'rs', 0.7, 'МАТ'),
  q(20, null, 'rz', null), q(21, 20, 'bl', 1), q(22, 21, 'rs', 1, 'ЧЕЛ'), q(23, 21, 'rs', 2, 'МАТ'), q(24, 21, 'rs', 0.5, 'ОБ'),
];
const HOLAT = DARAXT.map((x) => h(x.id, 0));
const IDLAR = yaxlitQatorIdlari(DARAXT, SVOD);
const tekshir = (b: Uint8Array) => hujjatTekshir(b, { ruxsat: [/^Объект$/] });
const NOM = YAXLIT_PODVAL_NOM.toUpperCase();
const qiymatBor = (b: Uint8Array, x: number) => tekshir(b).varaqlar[0].kataklar.some((k) => Number(k.v) === x);

describe('svod yaxlit — obyekt darajasidagi ko‘rinishlar server bilan bir xil', () => {
  it('yaxlitQatorIdlari: belgili bo‘lim va barcha avlodlari; belgi yo‘q — bo‘sh', () => {
    expect([...IDLAR].sort((a, b) => a - b)).toEqual([10, 11, 12, 13]);
    expect(yaxlitQatorIdlari(DARAXT, null).size).toBe(0);
  });

  it('obyektUstamali (SummaJuft/Nakopitelniy paneli/portfel): cats_kaskad + yaxlit = server ВСЕГО; belgisiz — avvalgidek', () => {
    const r = { cats: serverCats(TOLIQ), cats_kaskad: serverCats(KASKAD), svod_yaxlit: SVOD, koeffitsientlar: NK };
    const u = obyektUstamali(r)!;
    expect(u.ustamali).toBe(ORAKUL.itogo4);
    expect(u.ndsBilan).toBe(ORAKUL.vsego);
    expect(u.ustamasiz).toBe(4500);
    // maxsus (standart) podval bilan ham — server bilan bir xil
    expect(obyektUstamali(r, standartPodval(NK))!.ndsBilan).toBe(ORAKUL.vsego);
    const u0 = obyektUstamali({ cats: serverCats(TOLIQ), koeffitsientlar: NK })!;
    expect(u0.ndsBilan).toBe(ESKI.vsego);
    expect(u0.ustamali).toBe(ESKI.itogo4);
  });

  it('qator darajasi: yaxlit avlodlari koeffitsientsiz (kOplate, kesim)', () => {
    const kf = kategoriyaKf(NK);
    expect(kOplate(300, 'ЧЕЛ', kf, true)).toBe(300);
    expect(kOplate(300, 'ЧЕЛ', kf)).toBe(r2(300 * kf.ЧЕЛ));
    const barglar = DARAXT.filter((x) => x.tur === 'rs');
    const k = katKesimYigish(barglar, (x) => x.kat, (x) => (x.hajm ?? 0) * 1000, (x) => IDLAR.has(x.id));
    expect(k.yaxlitQator).toBe(1000);
    const u = ustamaliHisobla(k, NK);
    expect(u.ndsBilan).toBe(serverYaxlitQosh(nakrutkaKaskadJS(KASKAD, NK), 1000, 12).vsego);
    expect(u.ustamasiz).toBe(4500);
    // belgisiz — avvalgidek
    expect(ustamaliHisobla(katKesimYigish(barglar, (x) => x.kat, (x) => (x.hajm ?? 0) * 1000), NK).ndsBilan).toBe(ESKI.vsego);
  });

  it('SmetaPodvalNakrutka (ustamaTasiri) va PodvalKonstruktor (podvalQiymatYaxlit) — server ВСЕГО', () => {
    const t = ustamaTasiri(catsKat(serverCats(KASKAD)), NK, NK, SVOD);
    expect(t.eski.vsego).toBe(ORAKUL.vsego);
    expect(t.ustamasiz).toBe(4500);
    expect(ustamaTasiri(catsKat(serverCats(TOLIQ)), NK, NK).eski.vsego).toBe(ESKI.vsego);
    const p = standartPodval(NK);
    const qiy = podvalQiymatYaxlit(podvalHisobla(p, KASKAD).qiymat, p, SVOD.qqssiz, NK);
    expect(qiy.itogo4).toBe(ORAKUL.itogo4);
    expect(qiy[p.qatorlar[p.qatorlar.length - 1].kod]).toBe(ORAKUL.vsego);
  });

  it('Nakopitelniy eksporti: podvalda «Свод яхлит» qatori, smeta ustuni ВСЕГО = server; belgisiz — avvalgidek', () => {
    let seq = 0;
    const nq = (p: Partial<NakopitelniyQator> & { tur: NakopitelniyQator['tur']; qator_id: number }): NakopitelniyQator => ({
      tartib: ++seq, kod: null, nom: 'Поз', birlik: null, kat: null, qoshimcha: false, zamena: false,
      smeta_hajm: 1, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0,
      oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0,
      jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
      jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
    } as NakopitelniyQator);
    const rows = DARAXT.map((x) => nq({ qator_id: x.id, ota_id: x.ota_id, tur: x.tur as NakopitelniyQator['tur'], kat: x.kat, nom: x.nom,
      smeta_summa: x.tur === 'rs' ? (x.hajm ?? 0) * 1000 : null, joriy_summa: x.id === 12 ? 100 : x.id === 22 ? 200 : 0 }));
    const h1 = nakopitelniyVedomostHujjat(rows, { obyektNom: 'Объект', davr: '2026-09-01', nakrutka: NK, ndsFoiz: 12, svodYaxlit: SVOD });
    expect(h1.kaskad!.G.itogo4).toBe(ORAKUL.itogo4);
    expect(h1.kaskad!.G.vsego).toBe(ORAKUL.vsego);
    const t = tekshir(h1.bytes);
    expect(t.matnlar).toEqual(expect.arrayContaining([NOM]));
    expect(t.varaqlar[0].kataklar.some((k) => k.matn === YAXLIT_KAT || k.v === YAXLIT_KAT)).toBe(true);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    const h0 = nakopitelniyVedomostHujjat(rows, { obyektNom: 'Объект', davr: '2026-09-01', nakrutka: NK, ndsFoiz: 12 });
    expect(h0.kaskad!.G.vsego).toBe(ESKI.vsego);
    expect(tekshir(h0.bytes).matnlar).not.toContain(NOM);
  });

  it('Ostatka eksporti: yaxlit qatorlar ustamasiz (podval qatori), boshqasi kaskad orqali', () => {
    const m = ostatkaHujjatModeli(DARAXT, HOLAT);
    const r = ostatkaHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25', nakrutka: NK, yaxlitIdlar: IDLAR });
    expect(r.kOplataVsego).toBe(serverYaxlitQosh(nakrutkaKaskadJS(KASKAD, NK), 1000, 12).vsego);
    expect(tekshir(r.bytes).matnlar).toEqual(expect.arrayContaining([NOM]));
    const r0 = ostatkaHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25', nakrutka: NK });
    expect(r0.kOplataVsego).toBe(ESKI.vsego);
  });

  it('Slichitelniy eksporti: smeta ustuni ВСЕГО = server (svod qqssiz bilan)', () => {
    const m = slichitelniyModeli(DARAXT, HOLAT);
    const r = slichitelniyHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25', nakrutka: NK, yaxlitIdlar: IDLAR, svodYaxlit: SVOD });
    expect(qiymatBor(r.bytes, ORAKUL.vsego)).toBe(true);
    expect(tekshir(r.bytes).matnlar).toEqual(expect.arrayContaining([NOM]));
    const r0 = slichitelniyHujjatXlsx(m, { obyektNomi: 'Объект', sana: '2026-09-25', nakrutka: NK });
    expect(qiymatBor(r0.bytes, ESKI.vsego)).toBe(true);
    expect(tekshir(r0.bytes).matnlar).not.toContain(NOM);
  });

  it('LRV eksporti: smeta ustuni ВСЕГО = server; maxsus podval bilan ham', () => {
    const r = lrvHujjat(DARAXT, HOLAT, { obyektNom: 'Объект', nakrutka: NK, ndsFoiz: 12, yaxlitIdlar: IDLAR, svodYaxlit: SVOD });
    expect(qiymatBor(r.bytes, ORAKUL.vsego)).toBe(true);
    const rp = lrvHujjat(DARAXT, HOLAT, { obyektNom: 'Объект', nakrutka: NK, ndsFoiz: 12, podval: standartPodval(NK), yaxlitIdlar: IDLAR, svodYaxlit: SVOD });
    expect(qiymatBor(rp.bytes, ORAKUL.vsego)).toBe(true);
    const r0 = lrvHujjat(DARAXT, HOLAT, { obyektNom: 'Объект', nakrutka: NK, ndsFoiz: 12 });
    expect(qiymatBor(r0.bytes, ESKI.vsego)).toBe(true);
  });
});
