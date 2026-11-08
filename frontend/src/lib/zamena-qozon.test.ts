import { describe, expect, it } from 'vitest';
import { almashtirilganHajmlar, almashtirilganSumma, ochiqQoldiq, qoldiqHajmi, zamenaRejaHajm, zamenaRejaHajmlar, type ZamenaQator } from './zamena-qoldiq';
import { zamenaQaytaMatn } from './fakt-inline-amal';

// SQL qabul testi (20261203001700_t2_zamena_qozon_v1.acceptance.sql) bilan bir xil sintetik raqamlar.
const asl = (o: Partial<ZamenaQator> & { id: number }): ZamenaQator => ({ tur: 'bl', birlik: 'm2', hajm: 100, f2Hajm: 0, ...o });
const zam = (o: Partial<ZamenaQator> & { id: number; replaces_line_id: number }): ZamenaQator =>
  ({ tur: 'bl', birlik: 'm2', hajm: 20, change_type: 'REPLACEMENT', progress: 0, almashtirish_hajm: null, ...o });

describe('zamena «umumiy qozon» (egasi 2026-11-08)', () => {
  it('takror kiritish minusga ketmaydi: zamena qoldig\'i = asl qoldig\'i', () => {
    const rows = [asl({ id: 1 }), zam({ id: 2, replaces_line_id: 1, progress: 95 })];
    const reja = zamenaRejaHajmlar(rows);
    expect(reja.get(2)).toBe(100);
    const alm = almashtirilganHajmlar(rows);
    expect(qoldiqHajmi(100, 0, alm.get(1))).toBe(5);
    expect(qoldiqHajmi(reja.get(2), 95)).toBe(5); // eski xatti: 20 − 95 = −75
    expect(ochiqQoldiq({ smeta: reja.get(2), fakt: 95 }, 'fakt')).toBe(5);
  });

  it('aslning o\'z F2 si qozondan ayriladi', () => {
    expect(zamenaRejaHajm(zam({ id: 2, replaces_line_id: 1, progress: 10 }), asl({ id: 1, f2Hajm: 30 }))).toBe(70);
  });

  it('bir aslga ikki zamena: har biri boshqasining qoplaganini ayiradi', () => {
    const a = asl({ id: 1, tur: 'rs', birlik: 'm3' });
    const za = zam({ id: 2, replaces_line_id: 1, tur: 'rs', birlik: 'm3', hajm: 10, progress: 30 });
    const zb = zam({ id: 3, replaces_line_id: 1, tur: 'rs', birlik: 'm3', hajm: 10, progress: 20 });
    const reja = zamenaRejaHajmlar([a, za, zb]);
    expect(reja.get(2)).toBe(80);
    expect(reja.get(3)).toBe(70);
    expect(qoldiqHajmi(reja.get(2), 30)).toBe(50);
    expect(qoldiqHajmi(reja.get(3), 20)).toBe(50);
    expect(qoldiqHajmi(100, 0, almashtirilganHajmlar([a, za, zb]).get(1))).toBe(50);
  });

  it('pastki chegara — zamenaning o\'z hajmi (yomonlashmaydi)', () => {
    expect(zamenaRejaHajm(zam({ id: 2, replaces_line_id: 1, hajm: 40, progress: 15 }), asl({ id: 1, hajm: 10 }))).toBe(40);
  });

  it('qo\'llanmaydi: birlik farqli, almashtirish_hajm kiritilgan, asl hajmi noma\'lum/0, manfiy zamena', () => {
    expect(zamenaRejaHajm(zam({ id: 2, replaces_line_id: 1, birlik: 'kg' }), asl({ id: 1 }))).toBeNull();
    expect(zamenaRejaHajm(zam({ id: 2, replaces_line_id: 1, almashtirish_hajm: 40 }), asl({ id: 1 }))).toBeNull();
    expect(zamenaRejaHajm(zam({ id: 2, replaces_line_id: 1 }), asl({ id: 1, hajm: null }))).toBeNull();
    expect(zamenaRejaHajm(zam({ id: 2, replaces_line_id: 1 }), asl({ id: 1, hajm: 0 }))).toBeNull();
    expect(zamenaRejaHajm(zam({ id: 2, replaces_line_id: 1, hajm: -5 }), asl({ id: 1 }))).toBeNull();
    expect(zamenaRejaHajmlar([asl({ id: 1 }), zam({ id: 2, replaces_line_id: 1, birlik: 'kg' })]).size).toBe(0);
  });

  it('zamena hajmi NULL — qozon rejasi baribir hisoblanadi (NULL ≠ 0 emas, pastki chegara 0)', () => {
    expect(zamenaRejaHajm(zam({ id: 2, replaces_line_id: 1, hajm: null }), asl({ id: 1 }))).toBe(100);
  });
});

describe('almashtirilgan summa: narx 0, pul bolalarda', () => {
  it('narx 0 + summa != 0 → summa/hajm; BL qoldig\'i bolalar qoldig\'iga teng', () => {
    // asl ish 100 m2, narx 0, summa 1000 (bola rs 50 kg × 20); 95 m2 almashtirilgan.
    expect(almashtirilganSumma(95, 100, 0, 1000)).toBe(950);
    const blQoldiq = 1000 - (almashtirilganSumma(95, 100, 0, 1000) ?? 0);
    const bolaQoldiq = 1000 - (almashtirilganSumma(47.5, 50, 20, 1000) ?? 0);
    expect(blQoldiq).toBe(50);
    expect(bolaQoldiq).toBe(50);
  });
  it('NULL ≠ 0 saqlanadi', () => {
    expect(almashtirilganSumma(5, 100, 0, 0)).toBe(0);
    expect(almashtirilganSumma(5, 100, null, null)).toBeNull();
    expect(almashtirilganSumma(5, 0, 0, 1000)).toBeNull();
    expect(almashtirilganSumma(5, 100, 10, 999)).toBe(50);
    expect(almashtirilganSumma(0, 100, 0, 1000)).toBe(0);
  });
});

describe('takror zamena xabari', () => {
  it('server qayta ishlatgan bo\'lsa xabar, aks holda null', () => {
    expect(zamenaQaytaMatn({ qayta_ishlatildi: true })).toMatch(/yangi qator ochilmadi/);
    expect(zamenaQaytaMatn({ qayta_ishlatildi: false })).toBeNull();
    expect(zamenaQaytaMatn(null)).toBeNull();
  });
});
