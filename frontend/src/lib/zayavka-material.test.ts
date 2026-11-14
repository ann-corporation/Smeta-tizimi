import { describe, expect, it } from 'vitest';
import { materialTakliflari, materialTopish, smetaMaterialFiltri, ZAYAVKA_KATLAR } from './zayavka-material';
import { KATLAR } from './hisob-yadro/kategoriya';

const q = [
  { nom: 'Бетон М400', birlik: 'м3', hajm: 40 },
  { nom: 'бетон м400', birlik: 'м3', hajm: 10 },
  { nom: 'Арматура А500', birlik: 'т', hajm: null },
  { nom: '', birlik: 'шт', hajm: 5 },
];

describe('zayavka-material', () => {
  it('birlik materialdan; bir xil nomlar yig‘iladi; hajm noma‘lum — null (0 emas)', () => {
    const r = materialTakliflari(q, []);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.nom === 'Арматура А500')).toMatchObject({ birlik: 'т', smetaHajm: null, qoldiq: null });
    expect(r.find((x) => x.birlik === 'м3')).toMatchObject({ smetaHajm: 50, soralgan: 0, qoldiq: 50 });
  });
  it('qoldiq = smeta − oldin so‘ralgan (bekor qilinganlar hisobga olinmaydi)', () => {
    const r = materialTakliflari(q, [
      { itemText: 'бетон м400', requestedQty: 12, unit: 'м3', status: 'submitted' },
      { itemText: 'Бетон М400', requestedQty: 100, unit: 'м3', status: 'cancelled' },
    ]);
    expect(r.find((x) => x.birlik === 'м3')).toMatchObject({ soralgan: 12, qoldiq: 38 });
  });
  it('smeta filtri: kat KIRILL (МАТ, ОБ) — bazadagi qiymat; lotin mat/ob emas; percent-kodlangan', () => {
    expect(ZAYAVKA_KATLAR).toEqual(['МАТ', 'ОБ']);
    for (const k of ZAYAVKA_KATLAR) expect(KATLAR).toContain(k);
    const f = smetaMaterialFiltri(353);
    expect(f).toBe('obyekt_id=eq.353&kat=in.(%D0%9C%D0%90%D0%A2,%D0%9E%D0%91)');
    expect(decodeURIComponent(f)).toBe('obyekt_id=eq.353&kat=in.(МАТ,ОБ)');
    expect(f).not.toMatch(/[(,](mat|ob)[,)]/i);
    expect(/^[\x20-\x7e]+$/.test(f)).toBe(true);
  });
  it('materialTopish: aniq bitta mos kelsa', () => {
    const r = materialTakliflari(q, []);
    expect(materialTopish(r, ' бетон  м400 ')?.birlik).toBe('м3');
    expect(materialTopish(r, 'M400 beton')).toBeNull();
    expect(materialTopish(r, '')).toBeNull();
  });
});
