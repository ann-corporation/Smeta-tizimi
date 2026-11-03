import { describe, expect, it } from 'vitest';
import {
  NDS_SUKUT_FOIZ, faktSummaF2Narxda, faktSummaF2NarxFormula, yaxlitQoldiqF2, hajmMasshtab, hisob, kaskad, kOplate, kategoriyaKf, kesimYigish, korinishKesim,
  korinishSummasi, podvalTekshir, podvalVsegoKodi, qatorSumma, qoldiq, qqsBilan, serverMerosKoefQoy, yaxlitQatorlarga, standartPodval, yaxlit2, yaxlitBilanYakun, yaxlitKOplate, yaxlitSvodSumma,
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
    expect(m.qatorlar.find((q) => q.kod === 'strax')!.merosIzoh).toMatch(/по умолчанию/); // manba ko'rinadi, jim emas
    expect(serverMerosKoefQoy(p, NK, 'shartnoma').qatorlar.find((q) => q.kod === 'strax')!.merosIzoh).toMatch(/из договора/);
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
  it('yaxlit svod QQS BILAN, НДС dan keyin: ВСЕГО = ishlar + svod AYNAN; QQS siz/QQS — ayirma bilan (egasi 2026-10-30)', () => {
    expect(yaxlitBilanYakun({ itogo4: 100, nds: 12, vsego: 112 }, { qqsBilan: 1000.01, qqssiz: 892.87 })).toEqual({ itogo4: 992.87, nds: 119.14, vsego: 1112.01 });
    expect(yaxlitBilanYakun({ itogo4: 100, nds: 12, vsego: 112 }, null)).toBeNull();
    const s = yaxlitSvodSumma(1000.01, 12, null, 12);
    expect(s.qqsBilan).toBe(1000.01);
    expect(yaxlit2(s.qqssiz! + s.qqs!)).toBe(1000.01); // ÷/× aylanmasiz, yig'indi aynan qaytadi
    const r = kaskad({ ЧЕЛ: 1000 }, standartPodval(NK), { yaxlit: { qqsBilan: 777777.77 } });
    const w = kaskad({ ЧЕЛ: 1000 }, standartPodval(NK));
    expect(r.vsego).toBe(yaxlit2(w.vsego! + 777777.77));
    expect(r.qiymat.itogo4).toBe(w.qiymat.itogo4); // podval ИТОГО-4/НДС — ishlarniki (yaxlit НДС dan keyin)
    expect(r.qiymat.nds).toBe(w.qiymat.nds);
    expect(yaxlit2(r.itogo4! + r.qqs!)).toBe(r.qqsBilan);
  });
  it('maxsus podvalda ИТОГО-4 yo‘q — yaxlit qo‘shib bo‘lmaydi: null, taxmin yo‘q', () => {
    const p: Podval = { versiya: 1, qatorlar: [{ kod: 'jami', nom: 'ВСЕГО', tur: 'jami', baza: [{ kat: 'ЧЕЛ' }] }] };
    const r = kaskad({ ЧЕЛ: 10 }, p, { nomalumQism: 5 });
    expect(r.itogo4).toBeNull();
    expect(r.nomalumQatorlar).toContain('itogo4');
  });
  it('ИТОГО-4 va ВСЕГО orasida maxsus qator + qo‘shiladigan qism — aniq rad etiladi (jim tashlanmaydi)', () => {
    const p = standartPodval(NK);
    const i = p.qatorlar.findIndex((q) => q.kod === 'nds');
    p.qatorlar.splice(i, 0, { kod: 'bonus', nom: 'Бонус', tur: 'foiz', foiz: 1, baza: [{ qator: 'itogo4' }] });
    const r = kaskad({ ЧЕЛ: 10 }, p, { yaxlit: { qqsBilan: 5 } });
    expect(r.xato).toBe('SVOD_YAXLIT_ITOGO4_DAN_KEYIN_QATOR');
    expect(r.vsego).toBeNull();
  });
});

describe('yaxlit kirish bosqichlari va buyurtmachi xarajatlari (ABC-4 ekspert svodlari)', () => {
  it('qqssiz_ustamadan_keyin — ИТОГО-4 ga, faqat QQS oladi', () => {
    const w = kaskad({ ЧЕЛ: 1000 }, standartPodval(NK));
    const r = kaskad({ ЧЕЛ: 1000 }, standartPodval(NK), { yaxlitlar: [{ bosqich: 'qqssiz_ustamadan_keyin', qqssiz: 500 }] });
    expect(r.qiymat.itogo4).toBe(yaxlit2(w.qiymat.itogo4! + 500));
    expect(r.qqs).toBe(yaxlit2(r.qiymat.itogo4! * 0.12));
  });
  it('togri_xarajat — o‘z smetasining to‘g‘ri xarajati kategoriyalar bo‘yicha, to‘liq kaskad (manba ustamasi olinmaydi)', () => {
    const a = kaskad({ ЧЕЛ: 1000, МАТ: 300 }, standartPodval(NK));
    const b = kaskad({ ЧЕЛ: 1000 }, standartPodval(NK), { yaxlitlar: [{ bosqich: 'togri_xarajat', kategoriyalar: { МАТ: 300 } }] });
    expect(b.qqsBilan).toBe(a.qqsBilan);
  });
  it('uskuna (ОБ): прочие 18 % bazasiga kirmaydi, o‘z transport/zagot foizi bilan', () => {
    const r = kaskad({ ОБ: 1000 }, standartPodval(NK));
    expect(r.qiymat.itogo1).toBe(0);
    expect(r.qiymat.prochie).toBe(0);
    expect(r.qiymat.tr_ob).toBe(20);
    expect(r.qiymat.zag_ob).toBe(12);
  });
  it('buyurtmachi xarajatlari ВСЕГО dan keyin, baza = ВСЕГО + yaxlit; pudratchi summasiga kirmaydi', () => {
    const p = standartPodval(NK);
    p.qatorlar.push(
      { kod: 'zakazchik', nom: 'Прочие затраты заказчика, %', tur: 'foiz', foiz: 5, baza: [{ qator: 'vsego' }] },
      { kod: 'shaffof', nom: 'Фонд Шаффоф, %', tur: 'foiz', foiz: 0.05, baza: [{ qator: 'vsego' }] },
      { kod: 'malumot', nom: 'Справочно', tur: 'foiz', foiz: 1, baza: [{ qator: 'vsego' }], amal: 'korsatish' },
    );
    const r = kaskad({ ЧЕЛ: 1000 }, p, { yaxlit: { qqsBilan: 10000 } });
    const w = kaskad({ ЧЕЛ: 1000 }, standartPodval(NK), { yaxlit: { qqsBilan: 10000 } });
    expect(r.qqsBilan).toBe(w.qqsBilan); // pudratchi daromadi o'zgarmaydi
    expect(r.qiymat.zakazchik).toBe(yaxlit2(r.vsego! * 0.05));
    expect(r.qiymat.shaffof).toBe(yaxlit2(r.vsego! * 0.0005));
    expect(r.buyurtmachiJami).toBe(yaxlit2(r.vsego! + r.qiymat.zakazchik! + r.qiymat.shaffof!));
    expect(r.buyurtmachi.map((x) => x.amal)).toEqual(['qoshiladi', 'qoshiladi', 'korsatish']);
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
  it('narx qoidasi: F2 bor — fakt summasi F2 narxida (smeta 12 000, F2 35 000); fakt hajmi yozilganidek', () => {
    // Fakt < F2 — normal (F2 oldindan olinadi): hajm o'zgarmaydi, summa F2 narxida.
    expect(faktSummaF2Narxda(2, 5, 175000, 24000)).toEqual({ summa: 70000, manba: 'f2', narx: 35000 });
    // Fakt NULL, F2 bor — fakt NULL qoladi (F2 dan chiqarilmaydi).
    expect(faktSummaF2Narxda(null, 5, 175000, null).summa).toBeNull();
    // F2 yo'q — odatdagi fakt summasi.
    expect(faktSummaF2Narxda(2, 0, 0, 24000)).toEqual({ summa: 24000, manba: 'fakt', narx: null });
    expect(faktSummaF2Narxda(2, null, null, 24000).manba).toBe('fakt');
    // Manfiy qator: ishorali narx; F2 summasi noma'lum — narx to'qilmaydi; 0 — 0.
    expect(faktSummaF2Narxda(-1, -2, -70000, -12000).summa).toBe(-35000);
    expect(faktSummaF2Narxda(2, 5, null, 24000)).toEqual({ summa: null, manba: 'f2', narx: null });
    // F2 summasi yozilmagan (server f2_summa_yoq > 0, summa 0 ko'rinsa ham): fakt 0 ga tushmaydi, avvalgidek; yoq=0 — odatdagi qoida.
    expect(faktSummaF2Narxda(1, 1, 0, 3270, 1)).toEqual({ summa: 3270, manba: 'fakt', narx: null });
    expect(faktSummaF2Narxda(1, 1, 0, 3270, 0).summa).toBe(0);
    expect(faktSummaF2Narxda(null, 1, null, null, 2).summa).toBeNull();
    expect(faktSummaF2Narxda(2, 5, 0, 24000).summa).toBe(0);
    // Float shovqinli chegara (x.xx4999999999995): yaxlit2 15 muhim raqamga olib YUQORI yaxlitlaydi — SQL `_t2_f2_narxda_v1` shuni qiladi.
    expect(faktSummaF2Narxda(1, 1, 28656.224999999995, null).summa).toBe(28656.23);
    expect(faktSummaF2Narxda(1, 1, -28656.224999999995, null).summa).toBe(-28656.23);
    expect(faktSummaF2NarxFormula('H1', 'J1', 'K1', 'ROUND(H1*F1,2)')).toBe('IF(AND(ISNUMBER(J1),J1<>0),IF(AND(ISNUMBER(K1),H1<>""),ROUND(H1*K1/J1,2),""),ROUND(H1*F1,2))');
    expect(korinishSummasi(q({ faktHajm: 5, f2Hajm: 8, f2Summa: 80 }), 'fakt', { f2Narx: true })).toBe(50);
    expect(korinishSummasi(q({ faktHajm: 5, f2Hajm: 8, f2Summa: 160 }), 'fakt', { f2Narx: true })).toBe(100);
    expect(korinishSummasi(q({ faktHajm: 5, f2Summa: 80 }), 'fakt')).toBe(50);
    expect(yaxlitQoldiqF2(1200, 400)).toBe(800);
  });  it('oylik pul = o‘sha kaskad masshtablangan hajm ko‘rinishida', () => {
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
  it('F2 ko‘rinishida svod ichidagi ЧЕЛ/МАШ yaxlit emas (ustama oladi), МАТ yaxlit qoladi; smeta ko‘rinishi o‘zgarmaydi', () => {
    const qs = [q({ id: 1, kat: 'ЧЕЛ', f2Summa: 1000 }), q({ id: 2, kat: 'МАШ', f2Summa: 200 }), q({ id: 3, kat: 'ОБ', f2Summa: 500 })];
    const yx = new Set([1, 2, 3]);
    const f2 = korinishKesim(qs, 'f2', { yaxlitIdlar: yx });
    expect(f2.summalar.ЧЕЛ).toBe(1000);
    expect(f2.summalar.МАШ).toBe(200);
    expect(f2.yaxlitQator).toBe(500);
    const qor = korinishKesim(qs, 'f2_qoralama', { yaxlitIdlar: yx });
    expect(qor.summalar.ЧЕЛ ?? 0).toBe(0); // f2QoralamaSumma berilmagan — summa noma'lum, lekin yaxlit sanalmaydi
    const sm = korinishKesim(qs.map((x) => ({ ...x, smetaHajm: 1, narx: x.f2Summa })), 'smeta', { yaxlitIdlar: yx });
    expect(sm.summalar.ЧЕЛ).toBeUndefined();
    expect(sm.yaxlitQator).toBe(1700);
  });
});

describe('ko‘rib chiqish tuzatishlari (NULL ≠ 0, ВСЕГО kodi)', () => {
  it('taqsim: noma‘lum qator taqsimga kirmaydi va null qoladi (0 emas)', () => {
    const t = yaxlitQatorlarga(1000, [{ id: 1, summa: 300 }, { id: 2, summa: null }, { id: 3, summa: 700 }])!;
    expect(t.has(2)).toBe(false);
    expect(yaxlit2(t.get(1)! + t.get(3)!)).toBe(1000);
    expect(yaxlitQatorlarga(10, [{ id: 1, summa: null }])).toBeNull();
  });
  it('togri_xarajat: noma‘lum kategoriya summasi — natija noma‘lum', () => {
    const r = kaskad({ ЧЕЛ: 1000 }, standartPodval(NK), { yaxlitlar: [{ bosqich: 'togri_xarajat', kategoriyalar: { МАТ: null as unknown as number } }] });
    expect(r.qqsBilan).toBeNull();
    expect(r.nomalumQatorlar).toContain('togri_xarajat');
  });
  it('buyurtmachi qatorlari bor-u `vsego` kodi yo‘q — oxirgi qator ВСЕГО deb olinmaydi, aniq xato', () => {
    const p = standartPodval(NK);
    p.qatorlar = p.qatorlar.map((q) => (q.kod === 'vsego' ? { ...q, kod: 'jami_tolov' } : q));
    p.qatorlar.push({ kod: 'zakazchik', nom: 'Прочие затраты заказчика, %', tur: 'foiz', foiz: 5, baza: [{ qator: 'jami_tolov' }], amal: 'qoshiladi' });
    expect(podvalVsegoKodi(p)).toBeNull();
    expect(podvalTekshir(p).some((x) => /vsego/.test(x.xabar))).toBe(true);
    const r = kaskad({ ЧЕЛ: 1000 }, p);
    expect(r.xato).toBe('VSEGO_KODI_YOQ');
    expect(r.qqsBilan).toBeNull();
  });
});