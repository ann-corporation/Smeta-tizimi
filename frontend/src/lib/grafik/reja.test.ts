import { describe, expect, it } from 'vitest';
import { cashflowHisobla, grafikHisobla, grafikMalumot, ishKunlari, isoKun, kunRaqami, type GrafikMalumot, type RazdelXom } from './reja';

const rz = (id: number, tartib: number, o: Partial<RazdelXom> = {}): RazdelXom => ({
  id, ota_id: null, daraja: 1, tartib, nom: 'Razdel ' + id, kod: null, chel_soat: 0, summa: null, narxsiz: 0,
  fakt_summa: null, fakt_birinchi: null, fakt_oxirgi: null, ...o,
});
const paket = (qb: number) => ({
  qqs_bilan: qb, qqs: qb - qb / 1.12, ustamali: qb / 1.12, ustamasiz: qb / 1.4, qqs_foiz: 12, ustamasiz_qism: 0,
  kesim: { chel: 0, mash: 0, mat: 0, ob: 0, subpudrat: 0, svod: 0, ustamasiz: 0, nomalum: 0 }, soat: { chel: 0, mash: 0, mashinist: 0 },
  subpudratchilar: [], narxsiz_soni: 0, qator_soni: 1,
});
const baza = (razdellar: RazdelXom[], o: Partial<GrafikMalumot> = {}): GrafikMalumot => ({
  bugun: '2030-03-04', tomon: false, obyekt: { id: 1, nom: 'Sinov' }, razdellar, paketSmeta: null, paketFakt: null,
  shartnomaSana: '2030-03-04', f2Oylik: [], tolovOylik: [], sozlama: [], ...o,
});

describe('kalendar', () => {
  it('yakshanba dam olish kuni', () => {
    // 2030-03-04 - dushanba; 6 ish kuni = shanba, keyingi ish kuni - dushanba
    expect(ishKunlari(kunRaqami('2030-03-04'), kunRaqami('2030-03-09'))).toBe(6);
    expect(ishKunlari(kunRaqami('2030-03-04'), kunRaqami('2030-03-10'))).toBe(6);
    expect(ishKunlari(kunRaqami('2030-03-04'), kunRaqami('2030-03-11'))).toBe(7);
    expect(isoKun(kunRaqami('2030-03-04'))).toBe('2030-03-04');
  });
});

describe('grafikHisobla', () => {
  it('davomiylik = chel-soat / (brigada x smena), ketma-ket tartib', () => {
    const m = baza([rz(1, 1, { chel_soat: 800, summa: 100 }), rz(2, 2, { chel_soat: 80, summa: 100 })]);
    const g = grafikHisobla(m);
    expect(g.birlamchi).toEqual({ brigada: 10, smena: 8 });
    expect(g.qatorlar[0].oz?.kun).toBe(10);
    expect(g.qatorlar[0].oz?.bosh).toBe('2030-03-04');
    expect(g.qatorlar[0].oz?.tugash).toBe('2030-03-14');
    expect(g.qatorlar[1].oz?.kun).toBe(1);
    expect(g.qatorlar[1].oz?.bosh).toBe('2030-03-15');
    expect(g.jamiChelSoat).toBe(880);
  });

  it('override: brigada, kun va boshlanish', () => {
    const m = baza([rz(1, 1, { chel_soat: 800, summa: 100 }), rz(2, 2, { chel_soat: 800, summa: 100 })], {
      sozlama: [{ razdel_id: 0, brigada: 20, smena_soat: 8, boshlanish_sana: null, kun: null, versiya: 1 },
        { razdel_id: 2, brigada: null, smena_soat: null, boshlanish_sana: null, kun: 3, versiya: 1 }],
    });
    const g = grafikHisobla(m);
    expect(g.qatorlar[0].oz?.kun).toBe(5);
    expect(g.qatorlar[1].oz?.kun).toBe(3);
    expect(g.qatorlar[1].oz?.kunManba).toBe('override');
  });

  it('boshlanish sanasi yo‘q: sana o‘ylab topilmaydi', () => {
    const g = grafikHisobla(baza([rz(1, 1, { chel_soat: 80, summa: 10 })], { shartnomaSana: null }));
    expect(g.boshSana).toBeNull();
    expect(g.qatorlar[0].bosh).toBeNull();
    expect(g.jamiIshKun).toBeNull();
  });

  it('mehnati yo‘q razdel grafiksiz, bar yo‘q', () => {
    const g = grafikHisobla(baza([rz(1, 1, { chel_soat: 80, summa: 50 }), rz(2, 2, { chel_soat: 0, summa: 50 })]));
    expect(g.qatorlar[1].oz).toBeNull();
    expect(g.qatorlar[1].grafiksiz).toBe(true);
    expect(g.grafiksizSoni).toBe(1);
    expect(g.grafiksizSummaUlush).toBeCloseTo(0.5);
  });

  it('kechikmoqda: reja fakt dan 10 punktdan ko‘p oldinda', () => {
    const m = baza([rz(1, 1, { chel_soat: 800, summa: 100, fakt_summa: 10, fakt_birinchi: '2030-03-04', fakt_oxirgi: '2030-03-05' })], { bugun: '2030-03-12' });
    const g = grafikHisobla(m);
    expect(g.qatorlar[0].holat).toBe('kechikmoqda');
    expect(g.qatorlar[0].kechikishKun).toBeGreaterThan(0);
    expect(g.kechikmoqda).toBe(1);
  });

  it('bajarildi va vaqtida', () => {
    const a = grafikHisobla(baza([rz(1, 1, { chel_soat: 800, summa: 100, fakt_summa: 100 })], { bugun: '2030-03-12' }));
    expect(a.qatorlar[0].holat).toBe('bajarildi');
    const b = grafikHisobla(baza([rz(1, 1, { chel_soat: 800, summa: 100, fakt_summa: 60, fakt_birinchi: '2030-03-04' })], { bugun: '2030-03-10' }));
    expect(b.qatorlar[0].holat).toBe('vaqtida');
  });

  it('daraxt: ota razdel oralig‘i bolalar yig‘indisi', () => {
    const m = baza([rz(1, 1, { daraja: 1 }), rz(2, 2, { ota_id: 1, daraja: 2, chel_soat: 80, summa: 10 }), rz(3, 3, { ota_id: 1, daraja: 2, chel_soat: 160, summa: 10 })]);
    const g = grafikHisobla(m);
    expect(g.qatorlar[0].bolalar).toBe(2);
    expect(g.qatorlar[0].bosh).toBe('2030-03-04');
    expect(g.qatorlar[0].tugash).toBe(g.qatorlar[2].tugash);
    expect(g.qatorlar[0].summaJami).toBe(20);
    expect(g.qatorlar[2].daraja).toBe(1);
  });
});

describe('cashflowHisobla', () => {
  it('reja yadro paketini taqsimlaydi: oylar yig‘indisi = paket QQS bilan (grafiksiz ulushsiz)', () => {
    const m = baza([rz(1, 1, { chel_soat: 4800, summa: 60 }), rz(2, 2, { chel_soat: 3200, summa: 40 })], { paketSmeta: paket(1000) });
    const c = cashflowHisobla(m, grafikHisobla(m));
    expect(c.jamiReja).toBeCloseTo(1000, 3);
    expect(c.oylar.reduce((s, o) => s + (o.reja ?? 0), 0)).toBeCloseTo(1000, 3);
    expect(c.nisbat?.ustamali).toBeCloseTo(1 / 1.12);
  });

  it('paket yo‘q: reja null (0 emas)', () => {
    const m = baza([rz(1, 1, { chel_soat: 800, summa: 60 })], { f2Oylik: [{ oy: '2030-03-01', qqs_bilan: 5, soni: 1, f3_qqs_bilan: null, nomalum: 0 }] });
    const c = cashflowHisobla(m, grafikHisobla(m));
    expect(c.oylar[0].reja).toBeNull();
    expect(c.oylar[0].hisoblangan).toBe(5);
    expect(c.jamiReja).toBeNull();
  });

  it('prognoz: joriy oy = reja + hisoblanmagan fakt; o‘tgan oyda prognoz yo‘q; to‘lanmagan qoldiq', () => {
    const m = baza([rz(1, 1, { chel_soat: 4800, summa: 100 })], {
      paketSmeta: paket(1200), paketFakt: paket(300), bugun: '2030-04-10',
      f2Oylik: [{ oy: '2030-03-01', qqs_bilan: 100, soni: 1, f3_qqs_bilan: 100, nomalum: 0 }],
      tolovOylik: [{ oy: '2030-03-01', summa: 40 }],
    });
    const c = cashflowHisobla(m, grafikHisobla(m));
    const mart = c.oylar.find((o) => o.oy === '2030-03-01')!; const aprel = c.oylar.find((o) => o.oy === '2030-04-01')!;
    expect(mart.davr).toBe('otgan'); expect(mart.prognoz).toBeNull();
    expect(aprel.davr).toBe('joriy');
    expect(c.hisoblanmaganFakt).toBeCloseTo(200);
    expect(aprel.prognoz).toBeCloseTo((aprel.reja ?? 0) + 200);
    expect(c.tolanmaganQoldiq).toBe(60);
  });
});

describe('grafikMalumot', () => {
  it('noto‘g‘ri javob null', () => {
    expect(grafikMalumot(null)).toBeNull();
    expect(grafikMalumot({ ok: false })).toBeNull();
    const m = grafikMalumot({ ok: true, bugun: '2030-01-01', obyekt: { id: 3, nom: 'X' }, razdellar: [{ id: 1, tartib: 1, nom: 'a', chel_soat: '12.5', summa: null }], paket_smeta: null });
    expect(m?.razdellar[0].chel_soat).toBe(12.5);
    expect(m?.razdellar[0].summa).toBeNull();
  });
});
