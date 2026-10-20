import { describe, expect, it } from 'vitest';
import { farq, smetaAloqa } from './shartnoma-smeta';

describe('Shartnoma ↔ smeta summasi', () => {
  const ob = new Map([[1, { id: 1, nom: 'Amfiteatr', jami: 100.5 }], [2, { id: 2, nom: 'Stella', jami: 200 }], [3, { id: 3, nom: 'Bo‘sh', jami: null }]]);
  it('bog‘langan obyektlar smetasi yig‘iladi; smetasizlar alohida sanaladi (NULL ≠ 0)', () => {
    const a = smetaAloqa([1, 2, 3, 2], ob);
    expect(a.smeta).toBe(300.5); expect(a.nomalum).toBe(1); expect(a.qatorlar).toHaveLength(3);
    expect(smetaAloqa([3], ob).smeta).toBeNull();
  });
  it('farq faqat ikkala summa ma’lum bo‘lsa', () => {
    expect(farq(350, 300.5)).toBe(49.5); expect(farq(null, 300)).toBeNull(); expect(farq(1, null)).toBeNull();
  });
});
