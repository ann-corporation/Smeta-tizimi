import { describe, expect, it } from 'vitest';
import { normaBirlikka, normativIshOl } from './fakt-normativ';
import type { StudioNormCatalog } from './catalog-extraction/norm-library';

const rec = (id: string, name: string | null, unitCode: string | null, type: string, norm: string | null, status = 'EXACT') => ({ id, workCode: 'E1', resourceCode: id, resourceIdCode: id, norm, resourceStatus: status, matchBasis: 'X',
  candidates: status === 'EXACT' ? [{ id, code: `С${id}`, resourceIdCode: id, name, unitCode, type }] : [], candidateCount: status === 'EXACT' ? 1 : 2, prices: [], priceCount: 0 });

const fake = (scale: string | null, recipes: ReturnType<typeof rec>[]) => ({
  load: async () => undefined, unit: () => null,
  sourceBasis: () => ({ scale, unitLabel: scale ? 'м3' : null, evidence: null, origin: null }),
  detail: (_id: string, page = 0) => ({ work: { id: 'w', code: 'Е06-01-001-22', name: ' ФУНДАМЕНТЫ ', unitCode: 'u', collection: null, section: null, subsection: null, tableCode: null }, workCodeAmbiguous: false, recipeCount: recipes.length, recipes: recipes.slice(page * 25, (page + 1) * 25) }),
}) as unknown as StudioNormCatalog;

describe('fakt-normativ', () => {
  it('norma ÷ masshtab; noma‘lum bo‘lsa bo‘sh (to‘qilmaydi)', () => {
    expect(normaBirlikka('394', '100')).toBe('3.94');
    expect(normaBirlikka('1', '3')).toBe('0.333333333');
    expect(normaBirlikka(null, '100')).toBe('');
    expect(normaBirlikka('5', null)).toBe('');
    expect(normaBirlikka('5', '0')).toBe('');
  });

  it('butun retsept (barcha sahifalar) → ish va ABC resurslari; noaniq resurs qo‘shilmaydi va ogohlantiriladi', async () => {
    const recipes = [rec('1', 'ЗАТРАТЫ ТРУДА', '001', 'NORM_LABOUR', '170'), rec('2', 'БЕТОН', '003', 'NORM_MATERIAL', '102'), rec('3', null, null, 'X', '1', 'AMBIGUOUS'),
      ...Array.from({ length: 25 }, (_, i) => rec(`m${i}`, `МАТ ${i}`, '005', 'NORM_MATERIAL', '1'))];
    const n = await normativIshOl(fake('100', recipes), 'w');
    expect(n.ish).toEqual({ kod: 'Е06-01-001-22', nom: 'ФУНДАМЕНТЫ', birlik: 'м3' });
    expect(n.resurslar).toHaveLength(27);
    expect(n.resurslar[0]).toMatchObject({ nom: 'ЗАТРАТЫ ТРУДА', birlik: 'чел-ч', norma: '1.7', kat: 'ЧЕЛ', kod: 'С1', narx: '' });
    expect(n.resurslar[1]).toMatchObject({ birlik: 'м3', norma: '1.02', kat: 'МАТ' });
    expect(n.ogohlantirish).toContain('NOANIQ_RESURS');
  });

  it('masshtab tasdiqlanmagan — normalar bo‘sh, ogohlantirish', async () => {
    const n = await normativIshOl(fake(null, [rec('1', 'БЕТОН', '003', 'NORM_MATERIAL', '102')]), 'w');
    expect(n.resurslar[0].norma).toBe('');
    expect(n.ogohlantirish).toContain('NORMA_MASSHTABI_NOMALUM');
  });
});
