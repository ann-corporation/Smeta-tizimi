import { describe, expect, it } from 'vitest';
import {
  hisob, kaskad, katAniqla, kategoriyaKf, kategoriyaKfJadval, kesimYigish, serverCatsdan, standartPodval, yaxlit2, bosKesim,
  type KatSummalar, type ServerCats,
} from './index';

/**
 * OLTIN PARITET: yadro == SQL semantikasi (migratsiyalardan formula tartibi AYNAN ko'chirilgan) va == avvalgi TS
 * (`nakrutkaKaskadJS`, har qadam ROUND 2). Sonlar SINTETIK (haqiqiy obyekt emas).
 *
 * Qasddan farqlar (hujjatlashtirilgan):
 *  1. Yaxlitlash bosqichi: yadro HAR QADAMDA ROUND 2 (Excel hujjati bilan aynan), SQL faqat OXIRIDA. Farq — bir necha
 *     tiyin; bu yerda real o'lchamli obyektlarda ≤ 0,01 so'm qotirilgan, tasodifiy to'plamda chegara ≤ 0,05.
 *  2. Kiritilmagan foiz: SQL `coalesce(…, 0)`, yadro — null («noma'lum»), natija ИТОГО-4 = null.
 *  3. Kategoriyasi noma'lum summa: SQL paketi (`_t2_summa_paket_hisob_v1`) bilan bir xil — ИТОГО-4 ga ustamasiz qo'shiladi;
 *     yadro uni hech qachon МАТ deb olmaydi (alohida `nomalumSoni/nomalumSumma`, `taxminiy: true`).
 */

const r2 = (x: number) => yaxlit2(x);

/** SQL yadrosi har qadam ROUND 2 ga o'tkazilganda (koordinator rejasi) — true: paritet AYNAN tenglikka o'tadi. */
const SQL_QADAM_YAXLITLASH = false;
const TOL = SQL_QADAM_YAXLITLASH ? 0 : 0.01;

/** SQL `t2_nakrutka_hisobla_v1` (20261014090000) — oraliq qiymatlar yaxlitlanmaydi, chiqishda round(…, 2). */
function sqlHisobla(c: ServerCats, nk: Record<string, number>) {
  const k = (x: string) => nk[x] ?? 0;
  const pryamye = c.chel + c.mash + c.mat + c.ob;
  const tr_mat = (c.mat - c.kab) * k('ТРАНСПОРТ_МАТЕРИАЛ') / 100;
  const skl_mat = (c.mat - c.bez - c.mk) * k('СКЛАДСКИЕ_МАТЕРИАЛ') / 100 + c.mk * k('СКЛАДСКИЕ_МК') / 100;
  const tr_kab = c.kab * k('ТРАНСПОРТ_КАБЕЛЬ') / 100;
  const itogo1 = pryamye - c.ob + tr_mat + skl_mat + tr_kab;
  const prochie = itogo1 * k('ПРОЧИЕ_ПОДРЯДЧИК') / 100;
  const itogo2 = itogo1 + prochie;
  const tr_ob = c.ob * k('ТРАНСПОРТ_ОБОРУД') / 100;
  const zag_ob = c.ob * k('ЗАГОТ_СКЛАД_ОБОРУД') / 100;
  const itogo3 = itogo2 + c.ob + tr_ob + zag_ob;
  const strax = itogo3 * k('СТРАХОВАНИЕ') / 100;
  const risk = itogo3 * k('РИСК') / 100;
  const itogo4 = itogo3 + strax + risk;
  const nds = itogo4 * k('НДС') / 100;
  return { pryamye: r2(pryamye), itogo1: r2(itogo1), itogo2: r2(itogo2), itogo3: r2(itogo3), itogo4: r2(itogo4), nds: r2(nds), vsego: r2(itogo4 + nds) };
}

/** SQL `t2_nakrutka_yaxlit_qosh_v1` (20261113500000). */
function sqlYaxlitQosh(h: { itogo4: number }, qqssiz: number, nk: Record<string, number>) {
  const i4 = r2(h.itogo4 + qqssiz);
  const nds = r2(i4 * (nk.НДС ?? 0) / 100);
  return { itogo4: i4, nds, vsego: r2(i4 + nds) };
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

describe('PARITET: yadro == SQL t2_nakrutka_hisobla_v1 (≤ 0,01 so‘m; farq faqat yaxlitlash bosqichida)', () => {
  for (const [nom, c] of OBYEKTLAR) for (const nk of [NK, NK2]) it(`${nom} (НДС ${nk.НДС})`, () => {
    const s = sqlHisobla(c, nk);
    const y = yadro(c, nk);
    expect(y.pryamye).toBe(s.pryamye);
    for (const kod of ['itogo1', 'itogo2', 'itogo3', 'itogo4'] as const) expect(Math.abs((y.qiymat[kod] as number) - s[kod]), kod).toBeLessThanOrEqual(TOL + 1e-6);
    expect(Math.abs((y.qqsBilan as number) - s.vsego)).toBeLessThanOrEqual(TOL + 1e-6);
  });

  it('tasodifiy 500 obyekt: |yadro − SQL| ≤ 0,05 (har qadam yaxlitlash chegarasi)', () => {
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

  it('svod yaxlit — QASDDAN FARQ: yadro svod summasini (QQS bilan) НДС dan keyin AYNAN qo‘shadi; SQL QQS siz qismni ИТОГО-4 ga qo‘shib QQS ni qayta hisoblaydi', () => {
    const c = OBYEKTLAR[0][1];
    const svod = 9876543.21; // QQS bilan, yakuniy (egasi 2026-10-30)
    const sqlIshlar = sqlHisobla(c, NK); // SQL port to'liq (yadro qiymatlari berilmaydi)
    const sqlQqssiz = r2(svod / 1.12);
    const s = sqlYaxlitQosh({ itogo4: sqlIshlar.itogo4 }, sqlQqssiz, NK);
    const y = kaskad(serverCatsdan(c), standartPodval(NK), { yaxlit: { qqsBilan: svod, qqssiz: sqlQqssiz } });
    const w = yadro(c, NK);
    expect(y.vsego).toBe(r2(w.vsego! + svod)); // aynan, ÷1,12 ×1,12 aylanmasi yo'q
    expect(Math.abs(y.vsego! - s.vsego)).toBeLessThanOrEqual(0.05); // SQL bilan farq — faqat aylanma tiyinlari
    expect(Math.abs(y.itogo4! - s.itogo4)).toBeLessThanOrEqual(TOL + 1e-6);
  });

  it('_t2_summa_paket_hisob_v1: kat noma‘lum ИТОГО-4 ga ustamasiz (SQL kabi); svod — QQS bilan, НДС dan keyin', () => {
    const k = kesimYigish([['ЧЕЛ', 1000], ['МАТ', 2000], ['XYZ', 300], [null, 200]] as Array<[string | null, number]>, (x) => x[0], (x) => x[1]);
    k.yaxlit = { qqssiz: 500, barglar: 450 }; // svod summasi yo'q — QQS bilan = 500 × 1,12
    const h = hisob(k, { koef: NK });
    const base = eskiTsKaskad({ ЧЕЛ: 1000, МАШ: 0, МАТ: 2000, ОБ: 0, КАБ: 0, 'М/К': 0, 'БЕЗ СКЛАД': 0 }, NK);
    const s = sqlYaxlitQosh({ itogo4: base.itogo4 }, 500, NK); // faqat kat noma'lum qism (SQL)
    expect(h.ustamali).toBe(r2(s.itogo4 + 500));
    expect(h.qqsBilan).toBe(r2(s.vsego + 560));
    expect(h.ustamasiz).toBe(1000 + 2000 + 500 + 450);
    expect(h.nomalumSoni).toBe(2);
    expect(h.taxminiy).toBe(true);
  });
});

describe('Kf JADVALI == SQL t2_nakrutka_koef_jadval_v1 (round(1 so‘mlik ВСЕГО, 2)) — ekran va hujjat jadvali bitta', () => {
  it('kategoriyaKfJadval', () => {
    const j = kategoriyaKfJadval(standartPodval(NK));
    const sql = (c: Partial<ServerCats>) => sqlHisobla({ chel: 0, mash: 0, mat: 0, ob: 0, mk: 0, kab: 0, bez: 0, ...c }, NK).vsego;
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
