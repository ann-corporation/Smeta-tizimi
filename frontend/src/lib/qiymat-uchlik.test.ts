import { describe, expect, it } from 'vitest';
import { NAKRUTKA_STANDART } from './nakrutka-kaskad';
import {
  bosKatKesim, katKesimgaQosh, katKesimServerdan, portfelUchligi, qiymatUchligi, serverUchligi, uchlikAyir, ustamaliHisobla, ustamasizUchlik,
  type UstamaNatija,
} from './ustamali-summa';

/** Sintetik namuna (obyekt 151 tuzilishida): прямые 1 000 000 → ИТОГО-4 1 157 000 → ВСЕГО 1 295 840 (QQS 12% — koeffitsientdan). */
const NAMUNA: UstamaNatija = {
  ustamali: 1_157_000, ndsBilan: 1_295_840, ustamasiz: 1_000_000,
  nomalum: { summa: 0, soni: 0 }, qadamlar: null, zanjir: [], ndsFoiz: 12,
};

describe('qiymatUchligi — QQS bilan asosiy (egasi 2026-10-27)', () => {
  it('namuna: QQS bilan 1 295 840 asosiy, ustamali 1 157 000 va ustamasiz 1 000 000 ikkinchi; ВСЕГО = ИТОГО-4 × (1 + 12%)', () => {
    const q = qiymatUchligi(NAMUNA, 1_000_000);
    expect(q).toEqual({ qqsBilan: 1_295_840, ustamali: 1_157_000, ustamasiz: 1_000_000, taxminiy: false, nomalum: 0, sabab: null });
    expect(q.qqsBilan).toBe(Math.round(q.ustamali! * (1 + NAMUNA.ndsFoiz! / 100) * 100) / 100);
  });

  it('QQS qiymati serverdagi kaskad ВСЕГО (ndsBilan) bilan aynan bir xil — yangi formula yo‘q', () => {
    const CATS = { chel: 906363170.46, mash: 188652881.67, mat: 73766663.54, ob: 115010123, mk: 1234567.89, kab: 17630000.3, bez: 2500000 };
    const u = ustamaliHisobla(katKesimServerdan(CATS), NAKRUTKA_STANDART);
    const q = qiymatUchligi(u, u.ustamasiz);
    expect(q.qqsBilan).toBe(u.ndsBilan);
    expect(q.ustamali).toBe(u.ustamali);
    expect(q.qqsBilan).toBeCloseTo(1_688_906_131.21, 2);
  });

  it('QQS stavkasi koeffitsientdan olinadi (12 qattiq yozilmagan): 20% bo‘lsa ВСЕГО = ИТОГО-4 × 1,2', () => {
    const k = bosKatKesim(); katKesimgaQosh(k, 'ЧЕЛ', 1000);
    const u = ustamaliHisobla(k, { ...NAKRUTKA_STANDART, НДС: 20 });
    expect(u.ndsFoiz).toBe(20);
    const q = qiymatUchligi(u, 1000);
    expect(q.qqsBilan).toBeCloseTo((q.ustamali ?? 0) * 1.2, 1);
  });

  it('NULL summa → hammasi null (ekranda «—»), 0 emas', () => {
    expect(qiymatUchligi(NAMUNA, null)).toMatchObject({ qqsBilan: null, ustamali: null, ustamasiz: null, sabab: 'SUMMA_YOQ' });
    expect(qiymatUchligi(null, 500)).toMatchObject({ qqsBilan: null, ustamali: null, ustamasiz: 500, sabab: 'HISOBLANMADI' });
    expect(qiymatUchligi({ ...NAMUNA, ustamali: null, ndsBilan: null, xato: 'KOEF_YOQ' }, 500)).toMatchObject({ qqsBilan: null, sabab: 'KOEF_YOQ' });
  });

  it('taxminiy (kat noma’lum): ustamali va QQS qatori ikkalasi ham taxminiy; noma’lum qism ustamasiz, QQS koeffitsient stavkasida', () => {
    const k = bosKatKesim(); katKesimgaQosh(k, 'МАТ', 1000); katKesimgaQosh(k, null, 500);
    const u = ustamaliHisobla(k, NAKRUTKA_STANDART);
    const q = qiymatUchligi(u, 1500);
    expect(q.taxminiy).toBe(true);
    expect(q.nomalum).toBe(500);
    expect(q.ustamali).toBeCloseTo(u.ustamali! + 500, 2);
    expect(q.qqsBilan).toBeCloseTo(u.ndsBilan! + 500 * 1.12, 2);
  });

  it('taxminiy, lekin stavka yo‘q — QQS bilan «—» (QQS_STAVKA_YOQ), o‘ylab topilmaydi', () => {
    const q = qiymatUchligi({ ...NAMUNA, nomalum: { summa: 10, soni: 1 }, ndsFoiz: null }, 1_000_010);
    expect(q).toMatchObject({ qqsBilan: null, taxminiy: true, sabab: 'QQS_STAVKA_YOQ' });
  });

  it('hamma qator kat’siz — QQS ham, ustamali ham noma’lum (KAT_NOMALUM)', () => {
    const k = bosKatKesim(); katKesimgaQosh(k, null, 500);
    expect(qiymatUchligi(ustamaliHisobla(k, NAKRUTKA_STANDART), 500)).toMatchObject({ qqsBilan: null, ustamali: null, ustamasiz: 500, sabab: 'KAT_NOMALUM' });
  });
});

describe('portfel / server / ayirma uchliklari', () => {
  it('portfel: hamma obyekt hisoblangan — server yig‘indisi', () => {
    const q = portfelUchligi({ ustamali: 1_157_000, ndsBilan: 1_295_840, nomalumSoni: 0, hisoblanganUstamasiz: 1_000_000 }, 1_000_000);
    expect(q).toMatchObject({ qqsBilan: 1_295_840, ustamali: 1_157_000, ustamasiz: 1_000_000, taxminiy: false });
  });
  it('portfel qisman: hisoblanmagan obyekt to‘g‘ri xarajati bilan qo‘shiladi va ikkala qiymat taxminiy', () => {
    const q = portfelUchligi({ ustamali: 1266.64, ndsBilan: 1418.64, nomalumSoni: 1, hisoblanganUstamasiz: 1000 }, 1500);
    expect(q).toMatchObject({ qqsBilan: 1918.64, ustamali: 1766.64, taxminiy: true, nomalum: 500 });
  });
  it('portfel: hech biri hisoblanmagan — «—»', () => {
    expect(portfelUchligi({ ustamali: null, ndsBilan: null, nomalumSoni: 2, hisoblanganUstamasiz: 0 }, 900)).toMatchObject({ qqsBilan: null, ustamasiz: 900, sabab: 'HISOBLANMADI' });
  });
  it('server natijasi (vsego/itogo4) va faqat ustamasiz manba', () => {
    expect(serverUchligi({ itogo4: 2700, vsego: 2900 }, 2200)).toMatchObject({ qqsBilan: 2900, ustamali: 2700, ustamasiz: 2200, sabab: null });
    expect(serverUchligi(null, 2200)).toMatchObject({ qqsBilan: null, ustamasiz: 2200, sabab: 'HISOBLANMADI' });
    expect(ustamasizUchlik(2200)).toMatchObject({ qqsBilan: null, ustamali: null, ustamasiz: 2200, sabab: 'KESIM_YOQ' });
    expect(ustamasizUchlik(null).sabab).toBe('SUMMA_YOQ');
  });
  it('sof natija = plyus − minus; bittasi noma’lum bo‘lsa QQS ham noma’lum', () => {
    const a = serverUchligi({ itogo4: 300, vsego: 336 }, 200), b = serverUchligi({ itogo4: 100, vsego: 112 }, 80);
    expect(uchlikAyir(a, b)).toMatchObject({ qqsBilan: 224, ustamali: 200, ustamasiz: 120 });
    expect(uchlikAyir(a, serverUchligi(null, 80))).toMatchObject({ qqsBilan: null, sabab: 'HISOBLANMADI' });
  });
});
