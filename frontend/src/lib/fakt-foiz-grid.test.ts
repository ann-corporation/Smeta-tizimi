import { describe, expect, it } from 'vitest';
import { casZiddiyat, foizQoll, jamiIdlari, tarixgaQosh, ustunJoylash, ustunOqi } from './fakt-foiz-grid';
import { foizOqi, jurnalPaket, kiritmaSoni } from './fakt-jurnal';

describe('fakt foiz — jadval kiritish', () => {
  it('foizOqi / kiritmaSoni: smeta foizi yadro bilan; smetasiz — to‘qilmaydi; NULL ≠ 0', () => {
    expect(foizOqi('50%')).toBe(50);
    expect(foizOqi(' 12,5 % ')).toBe(12.5);
    expect(foizOqi('50')).toBeNull();
    expect(kiritmaSoni('50%', 30)).toBe(15);
    expect(kiritmaSoni('33.3333%', 1)).toBe(0.333333);
    expect(kiritmaSoni('50%', null)).toBe('SMETASIZ');
    expect(kiritmaSoni('50%', 0)).toBe('SMETASIZ');
    expect(kiritmaSoni('', 10)).toBeNull();
    expect(kiritmaSoni('7', null)).toBe(7);
    expect(kiritmaSoni('10%', -20)).toBe(-2); // chegirma ishi: ishora smetadan
  });

  it('jurnalPaket: «=» foiz → delta; «+» foiz → bugungi; fakt F2 dan kam bo‘lishi mumkin; smetasiz foiz — xato', () => {
    const p = jurnalPaket({ 1: { rejim: '=', qiymat: '50%' }, 2: { rejim: '+', qiymat: '10%' }, 3: { rejim: '=', qiymat: '50%' } },
      new Map([[1, 80], [2, 0], [3, 0]]), new Map([[1, 100], [2, 20], [3, null]]));
    expect(p.qatorlar).toEqual([{ qator_id: 1, hajm: -30 }, { qator_id: 2, hajm: 2 }]);
    expect(p.xatolar.get(3)).toBe('FOIZ_SMETASIZ');
    expect(p.ok).toBe(false);
  });

  it('foizQoll: smetasizlar o‘tkaziladi; ustunJoylash pastga; bo‘sh qiymat o‘chiradi', () => {
    const r = foizQoll({}, [{ id: 1, smeta: 10 }, { id: 2, smeta: null }, { id: 3, smeta: 0 }], 75);
    expect(r).toEqual({ kiritmalar: { 1: { rejim: '=', qiymat: '75%' } }, qollandi: 1, otkazildi: 2 });
    expect(ustunOqi('5\r\n2,5\t x\n\n')).toEqual(['5', '2,5']);
    expect(ustunOqi('5')).toBeNull();
    const j = ustunJoylash({ 2: { rejim: '=', qiymat: '1' }, 3: { rejim: '+', qiymat: '9' } }, [1, 2, 3], 1, ['4', '']);
    expect(j.kiritmalar).toEqual({ 2: { rejim: '=', qiymat: '4' } });
    expect(j.joylandi).toBe(1);
  });

  it('CAS: faqat «=» kiritmalar; server farqi yoki yo‘qolgan qator — ziddiyat', () => {
    const ids = jamiIdlari({ 1: { rejim: '=', qiymat: '50%' }, 2: { rejim: '+', qiymat: '3' }, 3: { rejim: '=', qiymat: '' } }, new Map([[1, 10]]));
    expect(ids).toEqual([1]);
    expect(casZiddiyat([1, 4], new Map([[1, 5], [4, 0]]), new Map([[1, 5]]))).toEqual([{ id: 4, brauzer: 0, server: null }]);
    expect(casZiddiyat([1], new Map([[1, 5]]), new Map([[1, 6]]))).toEqual([{ id: 1, brauzer: 5, server: 6 }]);
  });

  it('tarix: chegara bilan', () => {
    let t = tarixgaQosh([], { 1: { rejim: '+', qiymat: '1' } }, 2);
    t = tarixgaQosh(t, {}, 2); t = tarixgaQosh(t, { 2: { rejim: '+', qiymat: '2' } }, 2);
    expect(t).toHaveLength(2);
    expect(t[1]).toEqual({ 2: { rejim: '+', qiymat: '2' } });
  });
});
