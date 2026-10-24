import { describe, expect, it } from 'vitest';
import { NAKRUTKA_STANDART, nakrutkaKaskad } from './nakrutka-kaskad';
import { bosKatKesim, katKesimgaQosh, katKesimNomalumBilan, katKesimServerdan, katKesimYigish, ustamaliHisobla } from './ustamali-summa';
import { reconcileF2Links } from './f2-link-review/reconciliation';

// Sintetik obyekt (haqiqiy mijoz ma'lumoti emas). Orakul: t2_obyekt_nakrutka_v1 kaskadi — server `cats` (mat = to'liq savat)
// bilan nakrutkaKaskad (SQL t2_nakrutka_hisobla_v1 bilan tiyingacha paritet, nakrutka-kaskad.test.ts).
const SERVER_CATS = { chel: 906363170.46, mash: 188652881.67, mat: 73766663.54, ob: 115010123, mk: 1234567.89, kab: 17630000.3, bez: 2500000 };

describe('ustamali summa == t2_obyekt_nakrutka_v1 / Nakopitelniy (orakul)', () => {
  it('oltin qiymat A: ustamali = ИТОГО-4, QQS bilan = ВСЕГО, tiyinigacha', () => {
    const r = ustamaliHisobla(katKesimServerdan(SERVER_CATS), NAKRUTKA_STANDART);
    expect(r.ustamali).toBe(1507951902.86);
    expect(r.ndsBilan).toBe(1688906131.21);
    expect(r.ustamasiz).toBe(1283792838.67);
    expect(r.nomalum).toEqual({ summa: 0, soni: 0 });
  });

  it('qator darajasidan yig‘ilgan kesim ham server natijasiga teng (har kat alohida qatorlar)', () => {
    // Server cats ni kategoriya qatorlariga ochamiz: МАТ toza = mat - kab - mk - bez.
    const toza = SERVER_CATS.mat - SERVER_CATS.kab - SERVER_CATS.mk - SERVER_CATS.bez;
    const qatorlar = [
      ['ЧЕЛ', 400000000.46], ['ЧЕЛ', 506363170], ['МАШ', SERVER_CATS.mash], ['МАТ', toza / 2], ['МАТ', toza / 2],
      ['ОБ', SERVER_CATS.ob], ['М/К', SERVER_CATS.mk], ['КАБ', SERVER_CATS.kab], ['БЕЗСКЛАД', SERVER_CATS.bez],
    ] as Array<[string, number]>;
    const kesim = katKesimYigish(qatorlar, (x) => x[0], (x) => x[1]);
    const orakul = nakrutkaKaskad({ chel: SERVER_CATS.chel, mash: SERVER_CATS.mash, mat: SERVER_CATS.mat, ob: SERVER_CATS.ob, mk: SERVER_CATS.mk, kab: SERVER_CATS.kab, bez: SERVER_CATS.bez }, NAKRUTKA_STANDART);
    const r = ustamaliHisobla(kesim, NAKRUTKA_STANDART);
    expect(r.ustamali).toBe(orakul.itogo4);
    expect(r.ndsBilan).toBe(orakul.vsego);
    expect(kesim.nomalum).toBe(0);
  });

  it('M/K, КАБ va БЕЗ СКЛАД 0 deb olinmaydi — har biri o‘z koeffitsienti bilan', () => {
    const bir = (kat: string) => ustamaliHisobla(katKesimYigish([[kat, 1]] as Array<[string, number]>, (x) => x[0], (x) => x[1]), NAKRUTKA_STANDART);
    // nakrutka-kaskad.test.ts «C» jadvali (QQS bilan): MAT 1.42, M/K 1.40, KAB 1.37, BEZ 1.39
    expect(bir('МАТ').ndsBilan).toBe(1.42);
    expect(bir('М/К').ndsBilan).toBe(1.4);
    expect(bir('КАБ').ndsBilan).toBe(1.37);
    expect(bir('БЕЗ СКЛАД').ndsBilan).toBe(1.39);
    expect(bir('БЕЗСКЛАД').ndsBilan).toBe(1.39);
    expect(bir('ОБ').ndsBilan).toBe(1.16);
  });

  it('turli koeffitsientlar (B): kompaniya override, risk 2.5%', () => {
    const nk = { ...NAKRUTKA_STANDART, СКЛАДСКИЕ_МАТЕРИАЛ: 1, РИСК: 2.5 };
    const c = { chel: 90191208.78, mash: 59639425.67, mat: 1307752332.1, ob: 25200000, mk: 0, kab: 1133579906.25, bez: 0 };
    const r = ustamaliHisobla(katKesimServerdan(c), nk);
    expect(r.ndsBilan).toBe(2063323357.32);
    expect(r.ustamali).toBe(nakrutkaKaskad(c, nk).itogo4);
  });
});

describe('noma’lum kat — o‘ylab topilmaydi', () => {
  it('kat’siz / notanish kat ustamaga kirmaydi, alohida turadi', () => {
    const k = bosKatKesim();
    katKesimgaQosh(k, 'МАТ', 1000);
    katKesimgaQosh(k, null, 500);
    katKesimgaQosh(k, 'XYZ', 250);
    katKesimgaQosh(k, 'ЧЕЛ', null);
    const r = ustamaliHisobla(k, NAKRUTKA_STANDART);
    expect(r.ustamasiz).toBe(1000);
    expect(r.nomalum).toEqual({ summa: 750, soni: 2 });
    expect(k.summasizSoni).toBe(1);
    expect(r.ustamali).toBe(nakrutkaKaskad({ chel: 0, mash: 0, mat: 1000, ob: 0, mk: 0, kab: 0, bez: 0 }, NAKRUTKA_STANDART).itogo4);
  });

  it('koeffitsient yo‘q — ustamali null (0 emas)', () => {
    const r = ustamaliHisobla(katKesimServerdan(SERVER_CATS), null);
    expect(r.ustamali).toBeNull();
    expect(r.xato).toBe('KOEF_YOQ');
  });

  it('kesimga farq qo‘shish: ~0 farq o‘zgarishsiz, aks holda kat noma’lum', () => {
    const k = katKesimYigish([['МАТ', 10]] as Array<[string, number]>, (x) => x[0], (x) => x[1]);
    expect(katKesimNomalumBilan(k, 0.001).nomalumSoni).toBe(0);
    expect(katKesimNomalumBilan(k, 5).nomalum).toBe(5);
    expect(k.nomalum).toBe(0);
  });

  it('zanjir: to‘g‘ridan-to‘g‘ri → transport → prochie → sug‘urta → itogo', () => {
    const r = ustamaliHisobla(katKesimServerdan(SERVER_CATS), NAKRUTKA_STANDART);
    expect(r.zanjir.map((z) => z.kod)).toEqual(['pryamye', 'transport', 'prochie', 'sugurta', 'itogo']);
    expect(r.zanjir[0].summa).toBe(r.ustamasiz);
    expect(r.zanjir.at(-1)!.summa).toBe(r.ustamali);
  });
});

describe('F2 reconciliation kat kesimi', () => {
  it('bog‘langan — smeta kat’i bilan, bog‘lanmagan — kat noma’lum', () => {
    const r = reconcileF2Links(null, [
      { state: 'confirmed', sourceAmount: 100, sourceQuantity: 1, referenceUnitPrice: 100, kat: 'МАТ' },
      { state: 'confirmed', sourceAmount: 50, sourceQuantity: 1, referenceUnitPrice: 50, kat: null },
      { state: 'suggested', sourceAmount: 30, sourceQuantity: 1, referenceUnitPrice: 30, kat: 'ЧЕЛ' },
      { state: 'unbound', sourceAmount: 20, sourceQuantity: null, referenceUnitPrice: null, kat: 'МАТ' },
    ]);
    expect(r.katKesim.confirmed.summalar).toEqual({ МАТ: 100 });
    expect(r.katKesim.confirmed.nomalum).toBe(50);
    expect(r.katKesim.suggested.summalar).toEqual({ ЧЕЛ: 30 });
    expect(r.katKesim.unbound.summalar).toEqual({});
    expect(r.katKesim.unbound.nomalum).toBe(20);
    expect(r.katKesim.source.nomalum).toBe(70);
    const u = ustamaliHisobla(r.katKesim.source, NAKRUTKA_STANDART);
    expect(u.ustamasiz).toBe(130);
  });
});
