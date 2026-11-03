import { describe, expect, it } from 'vitest';
import { haversine, taxminiyMarshrut, googleHavola, yandexHavola, marshrutQur, osrmAdapter } from './geo';
import { tannarxHisobla, yoqilgiNarxiOl, type MashinaTannarx, type HaydovchiTannarx, type ReysTannarx } from './xarajat';
import { narxHisobla, qqsBilanOl, qqsSizOl, type Tarif } from './narxlash';
import { harakatMumkinmi, hujjatSignal, keyingiHolat, obyektgaTaqsimla } from './holat';

const M: MashinaTannarx = { yoqilgiTuri: 'dizel', norma100km: 30, normaMotosoat: null, egalik: 'oz', amortKm: 1000, amortSoat: null, ijaraKm: null, ijaraSoat: null, ijaraKun: null, kutishSoatNarx: 50000 };
const H: HaydovchiTannarx = { tolovTuri: 'km', tolovStavka: 500, ijtimoiyFoiz: 12 };
const R: ReysTannarx = {
  sana: '2026-04-10', rejaKm: 90, rejaDaqiqa: null, kmBoshi: 1000, kmOxiri: 1100, faktKm: null, motoBoshi: null, motoOxiri: null, ishSoat: null, boshlandi: null, tugadi: null,
  kutishDaqiqa: 30, yoqilgiSarfiL: null, yoqilgiNarxFakt: null, normaKoef: 1, yolHaqi: 20000, boshqaXarajat: null,
};
const NARX = [{ yoqilgiTuri: 'dizel', sana: '2026-01-01', narx: 12000 }, { yoqilgiTuri: 'dizel', sana: '2026-03-01', narx: 14000 }, { yoqilgiTuri: 'dizel', sana: '2026-06-01', narx: 15000 }];

describe('geo', () => {
  it('haversine Toshkent-Samarqand ~ 270 km to\'g\'ri chiziq', () => {
    const d = haversine({ lat: 41.2995, lng: 69.2401 }, { lat: 39.627, lng: 66.975 });
    expect(d).toBeGreaterThan(260); expect(d).toBeLessThan(285);
    expect(haversine({ lat: 41, lng: 69 }, { lat: 41, lng: 69 })).toBe(0);
  });
  it('taxminiy marshrut: koordinatasiz bekat -> null (0 emas)', () => {
    expect(taxminiyMarshrut([{ lat: 41.3, lng: 69.2 }, {}])).toBeNull();
    const m = taxminiyMarshrut([{ lat: 41.3, lng: 69.2 }, { lat: 41.4, lng: 69.3 }]);
    expect(m?.manba).toBe('taxminiy'); expect(m!.km).toBeGreaterThan(10); expect(m!.daqiqa).toBeGreaterThan(0);
  });
  it('navigatsiya havolalari', () => {
    const p = [{ lat: 41.3, lng: 69.2 }, { lat: 41.31, lng: 69.21 }, { lat: 41.32, lng: 69.22 }];
    expect(googleHavola(p)).toContain('destination=41.320000,69.220000');
    expect(googleHavola(p)).toContain('waypoints=41.310000,69.210000');
    expect(yandexHavola(p)).toBe('https://yandex.com/maps/?rtext=41.300000,69.200000~41.310000,69.210000~41.320000,69.220000&rtt=auto');
    expect(googleHavola([{ lat: 0, lng: 0 }])).toBeNull();
  });
  it('OSRM xatosida taxminiyga qaytadi', async () => {
    const p = [{ lat: 41.3, lng: 69.2 }, { lat: 41.4, lng: 69.3 }];
    const yomon = osrmAdapter('https://x.invalid', (async () => { throw new Error('net'); }) as unknown as typeof fetch);
    expect((await marshrutQur(p, yomon))?.manba).toBe('taxminiy');
    const yaxshi = osrmAdapter('https://x.invalid', (async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 15230, duration: 1260, geometry: { coordinates: [[69.2, 41.3], [69.3, 41.4]] } }] }) })) as unknown as typeof fetch);
    const n = await marshrutQur(p, yaxshi);
    expect(n).toMatchObject({ km: 15.2, daqiqa: 21, manba: 'yol' }); expect(n!.geometriya![0]).toEqual([41.3, 69.2]);
  });
});

describe('tannarx (SQL acceptance bilan bir xil raqamlar)', () => {
  it('yoqilg\'i narxi sanaga mos tarixdan', () => {
    expect(yoqilgiNarxiOl(NARX, 'dizel', '2026-04-10')).toBe(14000);
    expect(yoqilgiNarxiOl(NARX, 'dizel', '2025-12-31')).toBeNull();
    expect(yoqilgiNarxiOl(NARX, 'benzin', '2026-04-10')).toBeNull();
  });
  it('to\'liq reys: 621000', () => {
    const t = tannarxHisobla(M, H, R, NARX);
    expect(t.km).toBe(100); expect(t.kmManba).toBe('fakt');
    expect(t.yoqilgi).toMatchObject({ normaL: 30, summa: 420000, narxManba: 'tarix' });
    expect(t.haydovchi).toBe(56000); expect(t.amortizatsiya).toBe(100000); expect(t.kutish).toBe(25000);
    expect(t.jami).toBe(621000); expect(t.toliq).toBe(true); expect(t.yetishmaydi).toEqual([]);
  });
  it('haqiqiy sarf me\'yordan ortiq — og\'ish foizi; haqiqiy narx ustun', () => {
    const t = tannarxHisobla(M, H, { ...R, yoqilgiSarfiL: 36, yoqilgiNarxFakt: 15000 }, NARX);
    expect(t.yoqilgi.ogishFoiz).toBe(20); expect(t.yoqilgi.summa).toBe(540000); expect(t.yoqilgi.narxManba).toBe('fakt');
  });
  it('noma\'lum = null, 0 emas: haydovchisiz, narxsiz, amortizatsiyasiz', () => {
    const m2: MashinaTannarx = { ...M, amortKm: null, egalik: 'ijara' };
    const t = tannarxHisobla(m2, null, { ...R, yolHaqi: null, kutishDaqiqa: null }, []);
    expect(t.yoqilgi.summa).toBeNull(); expect(t.haydovchi).toBeNull(); expect(t.amortizatsiya).toBeNull();
    expect(t.yetishmaydi).toEqual(['yoqilgi', 'haydovchi', 'amortizatsiya']); expect(t.toliq).toBe(false); expect(t.jami).toBe(0);
  });
  it('texnika: moto-soat me\'yori, kunlik oylik, ijara kuni', () => {
    const ek: MashinaTannarx = { yoqilgiTuri: 'dizel', norma100km: null, normaMotosoat: 12, egalik: 'ijara', amortKm: null, amortSoat: null, ijaraKm: null, ijaraSoat: 100000, ijaraKun: 50000, kutishSoatNarx: null };
    const hy: HaydovchiTannarx = { tolovTuri: 'oylik', tolovStavka: 2600000, ijtimoiyFoiz: 0 };
    const t = tannarxHisobla(ek, hy, { ...R, kmBoshi: null, kmOxiri: null, rejaKm: null, motoBoshi: 100, motoOxiri: 108, kutishDaqiqa: null, yolHaqi: null, boshlandi: '2026-04-10T05:00:00Z', tugadi: '2026-04-11T02:00:00Z' }, NARX);
    expect(t.soat).toBe(8); expect(t.kun).toBe(2);
    expect(t.yoqilgi.normaL).toBe(96); expect(t.yoqilgi.summa).toBe(1344000);
    expect(t.haydovchi).toBe(200000); expect(t.amortizatsiya).toBe(900000);
  });
  it('norma koeffitsienti (qish)', () => {
    expect(tannarxHisobla(M, H, { ...R, normaKoef: 1.1 }, NARX).yoqilgi.normaL).toBe(33);
  });
});

describe('narxlash', () => {
  const T: Tarif = { kmNarx: 10000, tonnaKmNarx: 500, soatNarx: null, reysNarx: 50000, minimalSumma: 200000, marjaFoiz: 20, qqsFoiz: 12, qqsKiritilgan: false };
  it('tarif + QQS bilan asosiy', () => {
    const n = narxHisobla({ ...T, marjaFoiz: null }, { km: 100, tonna: 10, soat: null }, { jami: 621000, toliq: true });
    expect(n.tarifQqsSiz).toBe(1000000 + 500000 + 50000); expect(n.qqs).toBe(186000); expect(n.qqsBilan).toBe(1736000);
    expect(n.foyda).toBe(1550000 - 621000); expect(n.marjaFoiz).toBe(59.9);
  });
  it('marja uchun minimal narx tarifdan yuqori bo\'lsa tavsiya shu', () => {
    const n = narxHisobla({ ...T, kmNarx: 5000, tonnaKmNarx: null, reysNarx: null }, { km: 100, tonna: null, soat: null }, { jami: 621000, toliq: true });
    expect(n.tarifQqsSiz).toBe(500000); expect(n.marjaUchunMin).toBe(776250); expect(n.tavsiyaQqsSiz).toBe(776250);
    expect(n.marjaFoiz).toBe(20);
  });
  it('minimal summa; noma\'lum miqdor jim 0 emas', () => {
    expect(narxHisobla({ ...T, kmNarx: 1000, tonnaKmNarx: null, reysNarx: null, marjaFoiz: null }, { km: 10, tonna: null, soat: null }, null).tarifQqsSiz).toBe(200000);
    const n = narxHisobla({ ...T, marjaFoiz: null }, { km: 100, tonna: null, soat: null }, null);
    expect(n.yetishmaydi).toEqual(['tonna']); expect(n.foyda).toBeNull(); expect(n.tannarx).toBeNull();
  });
  it('tarif QQS bilan kiritilgan bo\'lsa QQS siz keltiriladi', () => {
    const n = narxHisobla({ ...T, kmNarx: 11200, tonnaKmNarx: null, reysNarx: null, minimalSumma: null, marjaFoiz: null, qqsKiritilgan: true }, { km: 100, tonna: null, soat: null }, null);
    expect(n.tarifQqsSiz).toBe(1000000); expect(n.qqsBilan).toBe(1120000);
  });
  it('qqs yordamchilari', () => { expect(qqsBilanOl(1000, 12)).toBe(1120); expect(qqsSizOl(1120, 12)).toBe(1000); });
  it('tarifda narx yo\'q — hisoblanmaydi (null)', () => {
    expect(narxHisobla({ ...T, kmNarx: null, tonnaKmNarx: null, reysNarx: null, minimalSumma: null, marjaFoiz: null }, { km: 1, tonna: 1, soat: 1 }, null).tavsiyaQqsSiz).toBeNull();
  });
});

describe('holat va taqsimot', () => {
  it('holat mashinasi', () => {
    expect(harakatMumkinmi('reja', 'boshla')).toBe(true); expect(harakatMumkinmi('yolda', 'boshla')).toBe(false);
    expect(harakatMumkinmi('yetkazildi', 'yop')).toBe(true); expect(harakatMumkinmi('yopildi', 'bekor')).toBe(false);
    expect(keyingiHolat('yetkaz')).toBe('yetkazildi');
  });
  it('hujjat signali', () => {
    expect(hujjatSignal('2026-11-02', '2026-11-03')).toEqual({ qolganKun: -1, signal: 'otgan' });
    expect(hujjatSignal('2026-11-20', '2026-11-03').signal).toBe('yaqin');
    expect(hujjatSignal('2027-01-01', '2026-11-03').signal).toBe('ok');
  });
  it('og\'irlikka mutanosib taqsimot, yig\'indi aniq', () => {
    const u = obyektgaTaqsimla(621000, [{ obyektId: 1, ogirlikT: 3 }, { obyektId: 2, ogirlikT: 1 }]);
    expect(u.map((x) => x.summa)).toEqual([465750, 155250]); expect(u[0].asos).toBe('ogirlik');
    const t = obyektgaTaqsimla(100, [{ obyektId: 1, ogirlikT: 1 }, { obyektId: 2, ogirlikT: 1 }, { obyektId: 3, ogirlikT: 1 }]);
    expect(t.reduce((a, b) => a + b.summa, 0)).toBeCloseTo(100, 10);
  });
  it('og\'irlik noma\'lum bo\'lsa teng; obyekt yo\'q bo\'lsa taqsimlanmaydi', () => {
    const u = obyektgaTaqsimla(100, [{ obyektId: 1, ogirlikT: null }, { obyektId: 2, ogirlikT: 5 }], [3]);
    expect(u.map((x) => x.obyektId)).toEqual([1, 2, 3]); expect(u[0].asos).toBe('teng'); expect(u.reduce((a, b) => a + b.summa, 0)).toBeCloseTo(100, 10);
    expect(obyektgaTaqsimla(100, [{ obyektId: null, ogirlikT: 2 }])).toEqual([]);
  });
});

import { bandlikFoiz, kpiKorsatkich } from './foyda';
describe('foyda ko\'rsatkichlari', () => {
  const q = { km: 1000, km_bosh_bilan: 800, bosh_km: 200, xarajat_tonna_km: 600000, tonna_km: 12000, fakt_l: 330, norma_l: 300, foyda: 179000, daromad_qqs_siz: 800000, xarajat_daromadli: 621000 };
  it('hisoblaydi', () => {
    expect(kpiKorsatkich(q)).toEqual({ boshYurishFoiz: 25, tonnaKmTannarx: 50, yoqilgiOgishFoiz: 10, margaFoiz: 22.4 });
    expect(bandlikFoiz(15, 30)).toBe(50);
  });
  it('noma\'lum bo\'lsa null (0 emas)', () => {
    expect(kpiKorsatkich({ ...q, km_bosh_bilan: null, tonna_km: null, norma_l: null, daromad_qqs_siz: null })).toEqual({ boshYurishFoiz: null, tonnaKmTannarx: null, yoqilgiOgishFoiz: null, margaFoiz: null });
  });
});
