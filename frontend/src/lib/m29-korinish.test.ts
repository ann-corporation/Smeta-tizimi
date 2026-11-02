import { describe, expect, it } from 'vitest';
import { m29Hisobla, type M29F2Qator, type M29SkladQator, type M29SmetaQator } from './m29';
import { m29DiqqatXaritasi, m29FarqHolat, m29Nisbat, m29PulKesim, m29Xulosa } from './m29-korinish';

const S: M29SmetaQator[] = [
  { id: 1, ota_id: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ 1', birlik: null, hajm: null, narx: null, kat: null },
  { id: 2, ota_id: 1, tur: 'bl', kod: 'Е6-1-1', nom: 'ФУНДАМЕНТ', birlik: '100 М3', hajm: 2, narx: null, kat: null },
  { id: 3, ota_id: 2, tur: 'mat', kod: '12-575', nom: 'БЕТОН В15', birlik: 'М3', hajm: 203, narx: 800_000, norma: 101.5, kat: 'МАТ' },
  { id: 4, ota_id: 2, tur: 'mat', kod: '009219', nom: 'ВОДА', birlik: 'М3', hajm: 0.4, narx: 5_000, norma: 0.2, kat: 'МАТ' },
  { id: 5, ota_id: 2, tur: 'ob', kod: 'ОБ-1', nom: 'НАСОС', birlik: 'ШТ', hajm: 2, narx: 1_000_000, norma: 1, kat: 'ОБ' },
];
const F2: M29F2Qator[] = [{ qator_id: 2, oy: '2026-09-01', hajm: 1, akt_holat: 'tasdiqlangan' }];
const SK: M29SkladQator[] = [
  { operatsiya: 'rasxod', sana: '2026-09-10', nomi: 'БЕТОН В15', birligi: 'М3', obyomi: 111.65 }, // +10% ortiqcha
  { operatsiya: 'rasxod', sana: '2026-09-10', nomi: 'НАСОС', birligi: 'ШТ', obyomi: 0.5 }, // tejaldi 50%
  { operatsiya: 'rasxod', sana: '2026-09-11', nomi: 'КРАСКА', birligi: 'КГ', obyomi: 4 }, // smetada yo'q
];

describe('m29Nisbat — norma = 100%', () => {
  it('ortiqcha: foiz va so‘z, norma belgisi shkala ichida', () => {
    const r = m29Nisbat(100, 112);
    expect(r.holat).toBe('ortiqcha');
    expect(r.farqFoiz).toBeCloseTo(12, 6);
    expect(r.normaJoy).toBeCloseTo(100 / 112, 6);
    expect(r.faktUzun).toBe(1);
  });
  it('tejaldi: fakt chizig‘i normadan qisqa', () => {
    const r = m29Nisbat(100, 92);
    expect(r.holat).toBe('tejaldi');
    expect(r.farqFoiz).toBeCloseTo(8, 6);
    expect(r.normaJoy).toBe(1);
    expect(r.faktUzun).toBeCloseTo(0.92, 6);
  });
  it('2 baravardan ko‘p — chiziq kesiladi, norma 50% da', () => {
    const r = m29Nisbat(10, 50);
    expect(r.kesilgan).toBe(true);
    expect(r.normaJoy).toBe(0.5);
    expect(r.faktUzun).toBe(1);
  });
  it('NULL ≠ 0: fakt noma’lum — holat faktYoq, foiz null', () => {
    const r = m29Nisbat(5, null);
    expect(r).toMatchObject({ holat: 'faktYoq', foiz: null, farqFoiz: null });
  });
  it('normasiz chiqim va bo‘sh', () => {
    expect(m29Nisbat(0, 3).holat).toBe('normasiz');
    expect(m29Nisbat(0, 0).holat).toBe('bosh');
    expect(m29Nisbat(10, 10).holat).toBe('mos');
  });
  it('farq belgisi so‘zga', () => {
    expect(m29FarqHolat(1)).toBe('ortiqcha');
    expect(m29FarqHolat(-1)).toBe('tejaldi');
    expect(m29FarqHolat(0)).toBe('mos');
    expect(m29FarqHolat(null)).toBeNull();
  });
});

describe('M-29 natijasi ustida', () => {
  const n = m29Hisobla({ smeta: S, f2: F2, sklad: SK }, '2026-09');

  it('xulosa: ortiqcha / tejaldi / fakt noma’lum materiallar soni', () => {
    const x = m29Xulosa(n);
    expect(x).toMatchObject({ materialSoni: 3, ortiqchaSoni: 1, tejaldiSoni: 1, faktYoqSoni: 1, faktBor: true });
  });

  it('fakt umuman yo‘q — faktBor false', () => {
    const b = m29Hisobla({ smeta: S, f2: F2, sklad: [] }, '2026-09');
    expect(m29Xulosa(b).faktBor).toBe(false);
  });

  it('diqqat yozuvlari material qatoriga bog‘lanadi (smetada yo‘q — bog‘lanmaydi)', () => {
    const x = m29DiqqatXaritasi(n);
    const beton = n.guruhlar.flatMap((g) => g.materiallar).find((m) => m.nom === 'БЕТОН В15')!;
    const voda = n.guruhlar.flatMap((g) => g.materiallar).find((m) => m.nom === 'ВОДА')!;
    expect(x.get(beton.kalit)?.map((d) => d.tur)).toEqual(['PERERASXOD']);
    expect(x.get(voda.kalit)?.map((d) => d.tur)).toEqual(['SKLAD_KIRITILMAGAN']);
    expect([...x.values()].flat().some((d) => d.tur === 'SMETADA_YOQ')).toBe(false);
  });

  it('pul kesimi yig‘indisi natija.jami bilan bir xil (yangi hisob yo‘q)', () => {
    const yig = (k: ReturnType<typeof m29PulKesim>) => Object.values(k.summalar).reduce((s, v) => s + (v ?? 0), 0) + k.nomalum;
    expect(yig(m29PulKesim(n, 'ortiqcha'))).toBeCloseTo(n.jami.ortiqchaSumma, 2);
    expect(yig(m29PulKesim(n, 'tejash'))).toBeCloseTo(n.jami.tejashSumma, 2);
    expect(yig(m29PulKesim(n, 'sof'))).toBeCloseTo(Math.abs(n.jami.farqSummaJami ?? 0), 2);
    expect(m29PulKesim(n, 'tejash').summalar.ОБ).toBeCloseTo(500_000, 2);
  });
});
