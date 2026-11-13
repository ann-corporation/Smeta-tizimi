import { describe, expect, it } from 'vitest';
import { tolovHolatiSvoddan } from './tolovHolati';
import { zanjirHisobla, type ZanjirKirish } from './qadamlar';
import type { SvodShartnoma } from '../nakopitelniy-svod';

const sh = (o: Partial<Omit<SvodShartnoma, 'f3' | 'tolovlar'>> & { f3?: number[]; tolov?: number[] }): SvodShartnoma => ({
  id: 1, loyiha_id: null, raqam: 'T-1', nom: null, asosiy: true, holat: 'faol', jami_nds_bilan: 1000,
  obyektlar: [{ id: 7, nom: 'Sintetik' }], ds: [], f2: [],
  f3: (o.f3 ?? []).map((s, i) => ({ id: i + 1, manba: 'sotuv' as const, raqam: String(i), sotuv_sana: '2026-11-01', sotuv_summa: s, nds_foiz: 12, davr_boshi: null, davr_oxiri: null, holat: 'tayyor' as const, bajarilgan_f2_summa: null, izoh: null, versiya: 1 })),
  tolovlar: (o.tolov ?? []).map((s, i) => ({ id: i + 1, sana: '2026-11-05', summa: s, tur: 'tolov' as const, izoh: null })),
  ...(({ f3: _f, tolov: _t, ...r }) => r)(o),
});

describe('tolovHolatiSvoddan', () => {
  it('bog‘langan shartnoma yo‘q yoki svod o‘qilmadi — null (0 emas)', () => {
    expect(tolovHolatiSvoddan(null, 7)).toBeNull();
    expect(tolovHolatiSvoddan([sh({ f3: [100] })], 99)).toBeNull();
  });
  it('F3 jami, to‘langan, qarz; bekor shartnoma hisobga olinmaydi', () => {
    const r = tolovHolatiSvoddan([sh({ f3: [600, 400], tolov: [250] }), sh({ id: 2, holat: 'bekor', f3: [9999] })], 7);
    expect(r).toEqual({ f3Jami: 1000, tolangan: 250, qarz: 750 });
  });
  it('F3 bor, to‘lov yo‘q — to‘langan 0 (ma‘lum), qarz = F3', () => {
    expect(tolovHolatiSvoddan([sh({ f3: [500] })], 7)).toEqual({ f3Jami: 500, tolangan: 0, qarz: 500 });
  });
});

describe('zanjir: To‘lov qadami shartnoma sonidan', () => {
  const k = (tolov: ZanjirKirish['tolov']): ZanjirKirish => ({
    smeta: { bor: true, narxsiz: 0 }, faktSaqlangan: 3, faktQoralama: 0, aosr: { yashirin: 0, aktsiz: 0 },
    f2BuOyda: true, f2TasdiqBuOyda: 1, forma3: 1, tolovYozilgan: null, slichitelniy: { farqli: 0, barglar: 4 }, tolov, oy: '2026-11',
  });
  const q = (tolov: ZanjirKirish['tolov']) => zanjirHisobla(k(tolov)).qadamlar.find((x) => x.id === 'tolov')!;
  it('to‘liq to‘langan — done', () => expect(q({ f3Jami: 1000, tolangan: 1000, qarz: 0 }).holat).toBe('done'));
  it('qisman — current, izohda to‘langan/F3/qarz', () => {
    const x = q({ f3Jami: 1000, tolangan: 250, qarz: 750 });
    expect(x.holat).toBe('current');
    expect(x.izoh).toContain('qarz 750');
  });
  it('to‘lov yo‘q — todo; ma‘lumot yo‘q (null) — unknown', () => {
    expect(q({ f3Jami: 1000, tolangan: 0, qarz: 1000 }).holat).toBe('current');
    expect(q(null).holat).toBe('unknown');
  });
});
