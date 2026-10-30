import { describe, expect, it } from 'vitest';
import {
  NDS_SUKUT_FOIZ, faktF2Max, faktSummaF2Max, hajmMasshtab, hisob, kaskad, kOplate, kategoriyaKf, kesimYigish, korinishKesim,
  korinishSummasi, qatorSumma, qoldiq, qqsBilan, serverMerosKoefQoy, standartPodval, yaxlit2, yaxlitBilanYakun, yaxlitKOplate,
  yaxlitKorinish, yaxlitQqssiz, yaxlitTaqsim, yigindi2Qatiy, type KorinishQator, type Podval,
} from './index';

// Sintetik koeffitsientlar va summalar (haqiqiy obyekt emas).
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };

describe('yaxlit2 — yagona ROUND 2', () => {
  it('Excel ROUND: yarmi noldan uzoqqa, ishoraga simmetrik', () => {
    expect(yaxlit2(1.005)).toBe(1.01);
    expect(yaxlit2(-1.005)).toBe(-1.01);
    expect(yaxlit2(2.675)).toBe(2.68);
    expect(yaxlit2(-2.675)).toBe(-2.68);
    expect(yaxlit2(1111.0499999999)).toBe(1111.05);
    expect(yaxlit2(0.125)).toBe(0.13);
    expect(yaxlit2(-0.125)).toBe(-0.13);
  });
  it('−0 qaytmaydi; NaN/∞ o‘zgarishsiz', () => {
    expect(Object.is(yaxlit2(-0.001), 0)).toBe(true);
    expect(Number.isNaN(yaxlit2(NaN))).toBe(true);
  });
  it('avvalgi r2u manfiyda xato edi (−1,005 → −1,00); yadro to‘g‘ri', () => {
    const r2uEski = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
    expect(r2uEski(-1.005)).toBe(-1);
    expect(yaxlit2(-1.005)).toBe(-1.01);
  });
  it('qatorSumma va qat‘iy yig‘indi null saqlaydi', () => {
    expect(qatorSumma(3, 1.005)).toBe(3.02);
    expect(qatorSumma(null, 5)).toBeNull();
    expect(yigindi2Qatiy([1, null])).toBeNull();
    expect(yigindi2Qatiy([0.1, 0.2])).toBe(0.3);
  });
});

describe('podval: foiz faqat podvaldan, noma‘lum — aniq belgi', () => {
  it('kiritilmagan foiz — null, ИТОГО-4 noma‘lum (jim 0 emas)', () => {
    const { ПРОЧИЕ_ПОДРЯДЧИК: _p, ...yarim } = NK;
    void _p;
    const r = kaskad({ ЧЕЛ: 1000 }, standartPodval(yarim));
    expect(r.nomalumQatorlar).toContain('prochie');
    expect(r.itogo4).toBeNull();
    expect(r.qqsBilan).toBeNull();
    expect(r.qiymat.itogo1).toBe(1000); // noma'lumdan oldingi qadamlar ma'lum
  });
  it('QQS stavkasi noma‘lum — QQS null, ИТОГО-4 ma‘lum', () => {
    const { НДС: _n, ...nds } = NK;
    void _n;
    const r = kaskad({ ЧЕЛ: 1000 }, standartPodval(nds));
    expect(r.itogo4).not.toBeNull();
    expect(r.qqs).toBeNull();
    expect(r.qqsFoiz).toBeNull();
  });
  it('server meros rejimi: smeta foizi o‘zgarmaydi, meros qatori koeffitsientdan (yo‘q — null)', () => {
    const p: Podval = standartPodval(NK);
    p.qatorlar = p.qatorlar.map((q) => (q.kod === 'prochie' ? { ...q, foiz: 20, manba: 'smeta' as const } : q.kod === 'strax' ? { ...q, foiz: 9, manba: 'meros' as const } : q));
    const m = serverMerosKoefQoy(p, { ...NK, ПРОЧИЕ_ПОДРЯДЧИК: 18, СТРАХОВАНИЕ: 0.5, ТРАНСПОРТ_КАБЕЛЬ: undefined as unknown as number });
    const f = (kod: string) => m.qatorlar.find((q) => q.kod === kod)!.foiz;
    expect(f('prochie')).toBe(20);     // smetadan — chaqiruvchi almashtira olmaydi
    expect(f('strax')).toBe(0.5);      // meros — server kabi koeffitsientdan
    expect(f('tr_kab')).toBeNull();    // koeffitsient yo'q — noma'lum, 0 emas
  });
  it('Kf: noma‘lum foiz — null; kOplate null qaytaradi', () => {
    const { ТРАНСПОРТ_КАБЕЛЬ: _k, ...x } = NK;
    void _k;
    const kf = kategoriyaKf(standartPodval(x));
    expect(kf.КАБ).toBeNull();
    expect(kf.ЧЕЛ).not.toBeNull();
    expect(kOplate(100, 'КАБ', kf)).toBeNull();
    expect(kOplate(100, null, kf)).toBeNull();
  });
});

describe('hisob natijasi (6-band)', () => {
  it('ko‘rsatish tartibi: QQS bilan → ustamali → ustamasiz; null semantikasi', () => {
    const h = hisob(kesimYigish([['ЧЕЛ', 1000], ['МАТ', null]] as Array<[string, number | null]>, (x) => x[0], (x) => x[1]), { koef: NK });
    expect(Object.keys(h).slice(0, 3)).toEqual(['qqsBilan', 'qqs', 'ustamali']);
    expect(h.narxsizSoni).toBe(1);
    expect(h.qqsFoiz).toBe(12);
    expect(h.qqsBilan).toBe(yaxlit2((h.ustamali as number) + (h.qqs as number)));
  });
  it('koeffitsient ham podval ham yo‘q — KOEF_YOQ, hammasi null', () => {
    const h = hisob(kesimYigish([['ЧЕЛ', 1000]] as Array<[string, number]>, (x) => x[0], (x) => x[1]), {});
    expect(h.sabab).toBe('KOEF_YOQ');
    expect(h.ustamali).toBeNull();
    expect(h.ustamasiz).toBe(1000);
  });
  it('kat noma‘lum summa МАТ ga tushmaydi: ustamasiz qo‘shiladi, taxminiy', () => {
    const a = hisob(kesimYigish([['МАТ', 1000]] as Array<[string, number]>, (x) => x[0], (x) => x[1]), { koef: NK });
    const b = hisob(kesimYigish([['МАТ', 1000], ['???', 1000]] as Array<[string, number]>, (x) => x[0], (x) => x[1]), { koef: NK });
    expect(b.kategoriyalar.МАТ).toBe(1000);
    expect(b.nomalumSumma).toBe(1000);
    expect(b.ustamali).toBe(yaxlit2((a.ustamali as number) + 1000)); // ustamasiz, МАТ ustamasi YO'Q
    expect(b.taxminiy).toBe(true);
  });
  it('NDS konstantasi bitta manbadan', () => {
    expect(NDS_SUKUT_FOIZ).toBe(12);
    expect(qqsBilan(100, NDS_SUKUT_FOIZ)).toBe(112);
    expect(qqsBilan(100, null)).toBeNull();
  });
});

describe('yaxlit svod — universal, faqat QQS', () => {
  it('QQS siz summa svoddan (stavka bilan), aks holda bolalar summasi; stavka noma‘lum — null', () => {
    expect(yaxlitQqssiz(1120, 12, 999)).toBe(1000);
    expect(yaxlitQqssiz(null, null, 777.777)).toBe(777.78);
    expect(yaxlitQqssiz(1120, null, 999)).toBeNull();
  });
  it('taqsim: bolalar tiyingacha yaxlit summaga AYNAN yig‘iladi (manfiy bola ham)', () => {
    const t = yaxlitTaqsim(1000, [{ id: 1, summa: 333.33 }, { id: 2, summa: 333.33 }, { id: 3, summa: 333.34 }, { id: 4, summa: -10 }])!;
    const jami = [...t.values()].reduce((a, b) => a + b, 0);
    expect(yaxlit2(jami)).toBe(1000);
    expect(t.get(4)! < 0).toBe(true);
    expect(yaxlitTaqsim(10, [{ id: 1, summa: null }])).toBeNull();
    expect(yaxlitTaqsim(10, [{ id: 1, summa: 0 }])).toBeNull();
  });
  it('ko‘rinishdagi yaxlit = yaxlit × (ko‘rinish / smeta); smeta 0 — null', () => {
    expect(yaxlitKorinish(1000, 800, 400)).toBe(500);
    expect(yaxlitKorinish(1000, 0, 400)).toBeNull();
  });
  it('к оплате koeffitsienti faqat (1 + QQS): 1,12', () => {
    expect(yaxlitKOplate(1000, 12)).toBe(1120);
    expect(yaxlitKOplate(1000, null)).toBeNull();
    expect(kOplate(1000, 'МАТ', kategoriyaKf(standartPodval(NK)), true, 12)).toBe(1120);
  });
  it('yaxlit ИТОГО-4 ga ustamasiz, QQS bir marta', () => {
    expect(yaxlitBilanYakun(100, 50, 12)).toEqual({ itogo4: 150, nds: 18, vsego: 168 });
    expect(yaxlitBilanYakun(100, 50, null)).toEqual({ itogo4: 150, nds: null, vsego: null });
    expect(yaxlitBilanYakun(100, null, 12)).toBeNull();
  });
  it('maxsus podvalda ИТОГО-4 yo‘q — yaxlit qo‘shib bo‘lmaydi: null, taxmin yo‘q', () => {
    const p: Podval = { versiya: 1, qatorlar: [{ kod: 'jami', nom: 'ВСЕГО', tur: 'jami', baza: [{ kat: 'ЧЕЛ' }] }] };
    const r = kaskad({ ЧЕЛ: 10 }, p, { ustamasizQism: 5 });
    expect(r.itogo4).toBeNull();
    expect(r.nomalumQatorlar).toContain('itogo4');
  });
});

describe('ko‘rinishlar (Construct uslubi)', () => {
  const q = (o: Partial<KorinishQator>): KorinishQator => ({ id: 1, kat: 'МАТ', narx: 10, smetaHajm: 100, ...o });
  it('qoldiq = smeta − F2 − almashtirilgan; smeta noma‘lum — noma‘lum (0 emas)', () => {
    expect(korinishSummasi(q({ f2Summa: 300, almashtirilganSumma: 200 }), 'qoldiq')).toBe(500);
    expect(korinishSummasi(q({ smetaHajm: null, f2Summa: 300 }), 'qoldiq')).toBeNull();
    expect(qoldiq(null, 0)).toBeNull();
    expect(qoldiq(100, null)).toBe(100);
  });
  it('F2 summasi aynan (ishorali), masshtablanmaydi', () => {
    expect(korinishSummasi(q({ f2Summa: -123.45 }), 'f2')).toBe(-123.45);
    expect(korinishSummasi(q({ f2Summa: null }), 'f2')).toBeNull();
  });
  it('fakt hech qachon F2 dan kam emas (MAX)', () => {
    expect(faktF2Max(5, 7)).toBe(7);
    expect(faktF2Max(null, 7)).toBeNull();
    expect(faktSummaF2Max(5, 10, 80)).toBe(80);
    expect(faktSummaF2Max(5, 10, 20)).toBe(50);
    expect(faktSummaF2Max(5, null, 33)).toBe(33);
    expect(korinishSummasi(q({ faktHajm: 5, f2Summa: 80 }), 'fakt', { faktF2Max: true })).toBe(80);
    expect(korinishSummasi(q({ faktHajm: 5, f2Summa: 80 }), 'fakt')).toBe(50);
  });
  it('oylik pul = o‘sha kaskad masshtablangan hajm ko‘rinishida', () => {
    const qs = [q({ id: 1, kat: 'ЧЕЛ', narx: 1000, smetaHajm: 10, davrHajm: hajmMasshtab(10, 0.3) }), q({ id: 2, kat: 'МАТ', narx: 500, smetaHajm: 40, davrHajm: hajmMasshtab(40, 0.3) })];
    const oy = hisob(korinishKesim(qs, 'oy'), { koef: NK });
    const togri = hisob(kesimYigish([['ЧЕЛ', 3000], ['МАТ', 6000]] as Array<[string, number]>, (x) => x[0], (x) => x[1]), { koef: NK });
    expect(oy.qqsBilan).toBe(togri.qqsBilan);
  });
  it('yaxlit avlodlari ko‘rinish kesimida ustamasiz qismga o‘tadi', () => {
    const k = korinishKesim([q({ id: 1 }), q({ id: 2, kat: 'ЧЕЛ' })], 'smeta', { yaxlitIdlar: new Set([2]) });
    expect(k.yaxlitQator).toBe(1000);
    expect(k.summalar.МАТ).toBe(1000);
  });
});
