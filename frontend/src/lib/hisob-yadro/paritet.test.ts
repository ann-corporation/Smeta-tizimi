import { describe, expect, it } from 'vitest';
import {
  hisob, kaskad, katAniqla, kategoriyaKf, kategoriyaKfJadval, kesimYigish, serverCatsdan, standartPodval, yaxlit2, bosKesim,
  type KatSummalar, type ServerCats,
} from './index';

/**
 * OLTIN PARITET: yadro == SQL semantikasi (migratsiyalardan formula tartibi AYNAN ko'chirilgan) va == avvalgi TS
 * (`nakrutkaKaskadJS`, har qadam ROUND 2). Sonlar SINTETIK (haqiqiy obyekt emas).
 *
 * SQL 20261116000000_t2_hisob_yadro_sql_moslash_v1 dan boshlab yadro bilan AYNAN:
 *  1. Yaxlitlash bosqichi: SQL ham HAR QADAMDA ROUND 2 (skl_mat va skl_mk alohida qadam). SQL bo'lish o'rniga × 0.01
 *     ishlatadi (numeric aniq ko'paytma); bu port float, matematik bir xil.
 *  2. Kiritilmagan foiz: SQL `coalesce(…, 0)`, yadro — null («noma'lum»). Server nk har doim sukut || override
 *     (11 kalit, NOT NULL) — real yo'lda farq yo'q; qo'lda berilgan to'liq bo'lmagan nk da farq qoladi.
 *  3. Kategoriyasi noma'lum summa: SQL paketi (`_t2_summa_paket_hisob_v1`) bilan bir xil — ИТОГО-4 ga ustamasiz qo'shiladi;
 *     yadro uni hech qachon МАТ deb olmaydi (alohida `nomalumSoni/nomalumSumma`, `taxminiy: true`).
 *  4. Yaxlit svod: SQL `t2_nakrutka_yaxlit_qosh_v2` — svod summasi QQS bilan НДС dan keyin aynan (yadro hisob()).
 */

const r2 = (x: number) => yaxlit2(x);

/** SQL yadrosi har qadam ROUND 2 ga o'tkazildi (20261116000000) — paritet AYNAN tenglik. */
const SQL_QADAM_YAXLITLASH = true;
const TOL = SQL_QADAM_YAXLITLASH ? 0 : 0.01;

/**
 * SQL `_t2_nakrutka_kaskad_v1` / `t2_nakrutka_hisobla_v1` (20261116000000) — har qadam round(…, 2); `yax = false` —
 * yaxlitlashsiz (Kf, `t2_nakrutka_koef_jadval_v1`).
 */
function sqlHisobla(c: ServerCats, nk: Record<string, number>, yax = true) {
  const R = yax ? r2 : (x: number) => x;
  const k = (x: string) => nk[x] ?? 0;
  const pct = (b: number, f: number) => R(b * f / 100); // SQL: round(b * f * 0.01, 2)
  const pryamye = R(c.chel + c.mash + c.mat + c.ob);
  const tr_mat = pct(c.mat - c.kab, k('ТРАНСПОРТ_МАТЕРИАЛ'));
  const skl_mat = pct(c.mat - c.bez - c.mk, k('СКЛАДСКИЕ_МАТЕРИАЛ'));
  const skl_mk = pct(c.mk, k('СКЛАДСКИЕ_МК'));
  const tr_kab = pct(c.kab, k('ТРАНСПОРТ_КАБЕЛЬ'));
  const itogo1 = R(pryamye - c.ob + tr_mat + skl_mat + skl_mk + tr_kab);
  const prochie = pct(itogo1, k('ПРОЧИЕ_ПОДРЯДЧИК'));
  const itogo2 = R(itogo1 + prochie);
  const tr_ob = pct(c.ob, k('ТРАНСПОРТ_ОБОРУД'));
  const zag_ob = pct(c.ob, k('ЗАГОТ_СКЛАД_ОБОРУД'));
  const itogo3 = R(itogo2 + c.ob + tr_ob + zag_ob);
  const strax = pct(itogo3, k('СТРАХОВАНИЕ'));
  const risk = pct(itogo3, k('РИСК'));
  const itogo4 = R(itogo3 + strax + risk);
  const nds = pct(itogo4, k('НДС'));
  // skl_mat: numeric da ikki 2-xonali son yig'indisi aniq (float port — R bilan tozalanadi).
  return { pryamye, skl_mat: R(skl_mat + skl_mk), skl_mk, itogo1, itogo2, itogo3, itogo4, nds, vsego: R(itogo4 + nds) };
}

/** SQL `_t2_kaskad_yakun_v1` (20261116000000): kat noma'lum + QQS siz qism QQS dan oldin; QQS bilan svod — НДС dan keyin. */
function sqlYakun(h: { itogo4: number; nds: number; vsego: number }, nomalum: number, oldin: number, kb: number | null, ks: number | null, nk: Record<string, number>) {
  const nom = nomalum !== 0 ? r2(nomalum) : 0;
  const o = r2(nom + oldin);
  if (o === 0 && kb == null) return { itogo4: h.itogo4, nds: h.nds, vsego: h.vsego };
  const i4w = r2(h.itogo4 + o);
  const ndsw = o === 0 ? h.nds : r2(i4w * (nk.НДС ?? 0) / 100);
  const vsw = o === 0 ? h.vsego : r2(i4w + ndsw);
  if (kb == null) return { itogo4: i4w, nds: ndsw, vsego: vsw };
  return { itogo4: r2(i4w + ks!), nds: r2(ndsw + kb - ks!), vsego: r2(vsw + kb) };
}

/** SQL `t2_nakrutka_yaxlit_qosh_v1` (avvalgi ma'no: QQS siz qism ИТОГО-4 ga, QQS bir marta). */
function sqlYaxlitQosh(h: { itogo4: number; nds: number; vsego: number }, qqssiz: number, nk: Record<string, number>) {
  return sqlYakun(h, 0, qqssiz, null, null, nk);
}

/** SQL `t2_nakrutka_yaxlit_qosh_v2` (obyekt svod xulosasi bilan; yadro hisob() + svodKesimYaxlit). */
function sqlYaxlitQoshV2(h: { itogo4: number; nds: number; vsego: number }, yax: { qqssiz: number; bolimlar: Array<{ svod_summa: number | null; qqssiz: number }> }, nk: Record<string, number>) {
  const sv = yax.bolimlar.filter((b) => b.svod_summa != null);
  const svq = r2(sv.reduce((t, b) => t + (b.svod_summa as number), 0)), svs = r2(sv.reduce((t, b) => t + b.qqssiz, 0));
  const qolgan = yax.qqssiz - svs;
  const qb = Math.abs(qolgan) < 0.005 ? 0 : r2(qolgan * (1 + (nk.НДС ?? 0) / 100));
  return sqlYakun(h, 0, 0, r2(svq + qb), r2(yax.qqssiz), nk);
}

/** Avvalgi TS `nakrutkaKaskadJS` (nakrutka-podval.ts, olib tashlangan) — har qadam ROUND 2. */
function eskiTsKaskad(s: KatSummalar, nk: Record<string, number>) {
  const y = r2; const pc = (x: string) => (nk[x] ?? 0) / 100; const bez = s['БЕЗ СКЛАД'];
  const r: Record<string, number> = {};
  r.pryamye = y(s.ЧЕЛ + s.МАШ + s.МАТ + s.ОБ + s.КАБ + s['М/К'] + bez);
  r.tr_mat = y((s.МАТ + s['М/К'] + bez) * pc('ТРАНСПОРТ_МАТЕРИАЛ'));
  r.skl_mat = y((s.МАТ + s.КАБ) * pc('СКЛАДСКИЕ_МАТЕРИАЛ'));
  r.skl_mk = y(s['М/К'] * pc('СКЛАДСКИЕ_МК'));
  r.tr_kab = y(s.КАБ * pc('ТРАНСПОРТ_КАБЕЛЬ'));
  r.itogo1 = y(r.pryamye - s.ОБ + r.tr_mat + r.skl_mat + r.skl_mk + r.tr_kab);
  r.prochie = y(r.itogo1 * pc('ПРОЧИЕ_ПОДРЯДЧИК'));
  r.itogo2 = y(r.itogo1 + r.prochie);
  r.tr_ob = y(s.ОБ * pc('ТРАНСПОРТ_ОБОРУД'));
  r.zag_ob = y(s.ОБ * pc('ЗАГОТ_СКЛАД_ОБОРУД'));
  r.itogo3 = y(r.itogo2 + s.ОБ + r.tr_ob + r.zag_ob);
  r.strax = y(r.itogo3 * pc('СТРАХОВАНИЕ'));
  r.risk = y(r.itogo3 * pc('РИСК'));
  r.itogo4 = y(r.itogo3 + r.strax + r.risk);
  r.nds = y(r.itogo4 * pc('НДС'));
  r.vsego = y(r.itogo4 + r.nds);
  return r;
}

const NK = { ЗТР_СОЦСТРАХ: 12, ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const NK2 = { ...NK, СКЛАДСКИЕ_МАТЕРИАЛ: 1, РИСК: 2.5, ПРОЧИЕ_ПОДРЯДЧИК: 15.5, НДС: 15 };

// Sintetik obyektlar (server `cats` shakli: mat — to'liq savat).
const OBYEKTLAR: Array<[string, ServerCats]> = [
  ['A: hamma kategoriya', { chel: 123456789.01, mash: 23456789.12, mat: 98765432.1, ob: 11111111.11, mk: 2222222.22, kab: 3333333.33, bez: 4444444.44 }],
  ['B: faqat mehnat', { chel: 50000000, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0 }],
  ['C: kabel ko‘p', { chel: 1000000.5, mash: 2000000.25, mat: 500000000.75, ob: 0, mk: 0, kab: 400000000.5, bez: 0 }],
  ['D: uskuna', { chel: 0, mash: 0, mat: 0, ob: 777777777.77, mk: 0, kab: 0, bez: 0 }],
  ['E: kichik', { chel: 12.34, mash: 5.67, mat: 89.01, ob: 2.34, mk: 1.11, kab: 2.22, bez: 3.33 }],
];

const yadro = (c: ServerCats, nk: Record<string, number>) => kaskad(serverCatsdan(c), standartPodval(nk));

describe('PARITET: yadro == avvalgi TS (nakrutkaKaskadJS) — aynan', () => {
  for (const [nom, c] of OBYEKTLAR) for (const nk of [NK, NK2]) it(`${nom} (НДС ${nk.НДС})`, () => {
    const e = eskiTsKaskad(serverCatsdan(c), nk);
    const y = yadro(c, nk);
    for (const kod of Object.keys(e)) expect(y.qiymat[kod], kod).toBe(e[kod]);
    expect(y.itogo4).toBe(e.itogo4);
    expect(y.qqsBilan).toBe(e.vsego);
  });
});

describe('PARITET: yadro == SQL t2_nakrutka_hisobla_v1 (20261116000000 — aynan)', () => {
  for (const [nom, c] of OBYEKTLAR) for (const nk of [NK, NK2]) it(`${nom} (НДС ${nk.НДС})`, () => {
    const s = sqlHisobla(c, nk);
    const y = yadro(c, nk);
    expect(y.pryamye).toBe(s.pryamye);
    for (const kod of ['itogo1', 'itogo2', 'itogo3', 'itogo4'] as const) expect(Math.abs((y.qiymat[kod] as number) - s[kod]), kod).toBeLessThanOrEqual(TOL + 1e-6);
    expect(Math.abs((y.qqsBilan as number) - s.vsego)).toBeLessThanOrEqual(TOL + 1e-6);
    expect(s.skl_mk).toBe(y.qiymat.skl_mk);
    expect(s.skl_mat).toBe(r2((y.qiymat.skl_mat as number) + (y.qiymat.skl_mk as number)));
  });

  it('tasodifiy 500 obyekt: yadro == SQL aynan', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pul = (m: number) => Math.round(rnd() * m * 100) / 100;
    let max = 0;
    for (let i = 0; i < 500; i++) {
      const mk = pul(1e7), kab = pul(1e7), bez = pul(1e7);
      const c = { chel: pul(1e9), mash: pul(1e8), mat: pul(1e9) + mk + kab + bez, ob: pul(1e8), mk, kab, bez };
      const s = sqlHisobla(c, NK2), y = yadro(c, NK2);
      max = Math.max(max, Math.abs((y.qqsBilan as number) - s.vsego), Math.abs((y.itogo4 as number) - s.itogo4));
    }
    expect(max).toBeLessThanOrEqual(SQL_QADAM_YAXLITLASH ? 0 : 0.05 + 1e-6);
  });

  it('svod yaxlit — SQL v2 == yadro: svod summasi (QQS bilan) НДС dan keyin AYNAN; ИТОГО-4 = ishlar + QQS siz qism', () => {
    const c = OBYEKTLAR[0][1];
    const svod = 9876543.21; // QQS bilan, yakuniy (egasi 2026-10-30)
    const sqlIshlar = sqlHisobla(c, NK); // SQL port to'liq (yadro qiymatlari berilmaydi)
    const sqlQqssiz = r2(svod / 1.12); // t2_svod_yaxlit_obyekt_v1: round(svod / (1 + st/100), 2)
    const s = sqlYaxlitQoshV2(sqlIshlar, { qqssiz: sqlQqssiz, bolimlar: [{ svod_summa: svod, qqssiz: sqlQqssiz }] }, NK);
    const y = kaskad(serverCatsdan(c), standartPodval(NK), { yaxlit: { qqsBilan: svod, qqssiz: sqlQqssiz } });
    const w = yadro(c, NK);
    expect(y.vsego).toBe(r2(w.vsego! + svod)); // aynan, ÷1,12 ×1,12 aylanmasi yo'q
    expect(s.vsego).toBe(y.vsego);
    expect(s.itogo4).toBe(y.itogo4);
    expect(s.nds).toBe(y.qqs);
    expect(r2(s.vsego - s.itogo4)).toBe(s.nds); // НДС = ВСЕГО − ИТОГО-4
  });

  it('_t2_summa_paket_hisob_v1: kat noma‘lum + subpudrat/ustamasiz ИТОГО-4 ga (QQS dan oldin), svod summasi — НДС dan keyin (yadro kaskad)', () => {
    const c = OBYEKTLAR[0][1];
    const ishlar = sqlHisobla(c, NK);
    for (const [nom, oldin, svQ, svS] of [[1234.56, 98765.43, 0, 0], [0, 0, 11200000.01, 10000000], [777.77, 5000.05, 2240, 2000]] as const) {
      const kb = svQ ? svQ : null, ks = svQ ? svS : null;
      const s = sqlYakun(ishlar, nom, oldin, kb, ks, NK);
      const y = kaskad(serverCatsdan(c), standartPodval(NK), { nomalumQism: nom, yaxlitlar: [{ bosqich: 'qqssiz_ustamadan_keyin', qqssiz: oldin }], yaxlit: kb == null ? null : { qqsBilan: kb, qqssiz: ks } });
      expect(s.itogo4).toBe(y.itogo4); expect(s.nds).toBe(y.qqs); expect(s.vsego).toBe(y.qqsBilan);
    }
  });

  it('hisob(): kat noma‘lum ИТОГО-4 ga ustamasiz (SQL kabi); svod summasiz yaxlit — ×(1+QQS), НДС dan keyin', () => {
    const k = kesimYigish([['ЧЕЛ', 1000], ['МАТ', 2000], ['XYZ', 300], [null, 200]] as Array<[string | null, number]>, (x) => x[0], (x) => x[1]);
    k.yaxlit = { qqssiz: 500, barglar: 450 }; // svod summasi yo'q — QQS bilan = 500 × 1,12
    const h = hisob(k, { koef: NK });
    const base = eskiTsKaskad({ ЧЕЛ: 1000, МАШ: 0, МАТ: 2000, ОБ: 0, КАБ: 0, 'М/К': 0, 'БЕЗ СКЛАД': 0 }, NK);
    const s = sqlYaxlitQosh({ itogo4: base.itogo4, nds: base.nds, vsego: base.vsego }, 500, NK); // faqat kat noma'lum qism (SQL)
    expect(h.ustamali).toBe(r2(s.itogo4 + 500));
    expect(h.qqsBilan).toBe(r2(s.vsego + 560));
    // SQL v2 (obyekt nakrutka) aynan shu: kat noma'lum qismdan keyingi kaskad + svod summasiz yaxlit ×(1+QQS).
    const v2 = sqlYaxlitQoshV2(s, { qqssiz: 500, bolimlar: [] }, NK);
    expect(v2.itogo4).toBe(h.ustamali); expect(v2.vsego).toBe(h.qqsBilan); expect(v2.nds).toBe(h.qqs);
    expect(h.ustamasiz).toBe(1000 + 2000 + 500 + 450);
    expect(h.nomalumSoni).toBe(2);
    expect(h.taxminiy).toBe(true);
  });
});

describe('Kf: SQL t2_nakrutka_koef_jadval_v1 (20261116000000 — yaxlitlanmagan 1 so‘mlik ВСЕГО) == yadro Kf; jadval ko‘rinishi = round(…, 2)', () => {
  it('SQL Kf == kategoriyaKf (yaxlitlashsiz)', () => {
    const kf = kategoriyaKf(standartPodval(NK));
    const sql = (c: Partial<ServerCats>) => sqlHisobla({ chel: 0, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0, ...c }, NK, false).vsego;
    expect(kf.ЧЕЛ).toBeCloseTo(sql({ chel: 1 }), 12);
    expect(kf.МАТ).toBeCloseTo(sql({ mat: 1 }), 12);
    expect(kf.ОБ).toBeCloseTo(sql({ ob: 1 }), 12);
    expect(kf['М/К']).toBeCloseTo(sql({ mat: 1, mk: 1 }), 12);
    expect(kf.КАБ).toBeCloseTo(sql({ mat: 1, kab: 1 }), 12);
    expect(kf['БЕЗ СКЛАД']).toBeCloseTo(sql({ mat: 1, bez: 1 }), 12);
  });
  it('kategoriyaKfJadval == round(SQL Kf, 2)', () => {
    const j = kategoriyaKfJadval(standartPodval(NK));
    const sql = (c: Partial<ServerCats>) => r2(sqlHisobla({ chel: 0, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0, ...c }, NK, false).vsego);
    expect(j.ЧЕЛ).toBe(sql({ chel: 1 }));
    expect(j.МАТ).toBe(sql({ mat: 1 }));
    expect(j.ОБ).toBe(sql({ ob: 1 }));
    expect(j['М/К']).toBe(sql({ mat: 1, mk: 1 }));
    expect(j.КАБ).toBe(sql({ mat: 1, kab: 1 }));
    expect(j['БЕЗ СКЛАД']).toBe(sql({ mat: 1, bez: 1 }));
  });
});

describe('Kf (к оплате koeffitsientlari) == SQL t2_nakrutka_koef_jadval_v1 (yaxlitlashsiz)', () => {
  it('har kategoriya', () => {
    const kf = kategoriyaKf(standartPodval(NK));
    const one = (c: Partial<ServerCats>) => {
      const x = { chel: 0, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0, ...c };
      const k = (n: string) => (NK as Record<string, number>)[n] / 100;
      const itogo1 = x.chel + x.mash + x.mat + (x.mat - x.kab) * k('ТРАНСПОРТ_МАТЕРИАЛ') + (x.mat - x.bez - x.mk) * k('СКЛАДСКИЕ_МАТЕРИАЛ') + x.mk * k('СКЛАДСКИЕ_МК') + x.kab * k('ТРАНСПОРТ_КАБЕЛЬ');
      const itogo3 = itogo1 * (1 + k('ПРОЧИЕ_ПОДРЯДЧИК')) + x.ob * (1 + k('ТРАНСПОРТ_ОБОРУД') + k('ЗАГОТ_СКЛАД_ОБОРУД'));
      return itogo3 * (1 + k('СТРАХОВАНИЕ') + k('РИСК')) * (1 + k('НДС'));
    };
    expect(kf.ЧЕЛ).toBeCloseTo(one({ chel: 1 }), 12);
    expect(kf.МАТ).toBeCloseTo(one({ mat: 1 }), 12);
    expect(kf.ОБ).toBeCloseTo(one({ ob: 1 }), 12);
    expect(kf['М/К']).toBeCloseTo(one({ mat: 1, mk: 1 }), 12);
    expect(kf.КАБ).toBeCloseTo(one({ mat: 1, kab: 1 }), 12);
    expect(kf['БЕЗ СКЛАД']).toBeCloseTo(one({ mat: 1, bez: 1 }), 12);
  });
});

describe('kategoriya: noma‘lum hech qachon МАТ emas', () => {
  it('katAniqla', () => {
    expect(katAniqla('БЕЗСКЛАД')).toBe('БЕЗ СКЛАД');
    expect(katAniqla(' мат ')).toBe('МАТ');
    expect(katAniqla('XYZ')).toBeNull();
    expect(katAniqla(null)).toBeNull();
    const k = bosKesim();
    expect(k.summalar).toEqual({});
  });
});
