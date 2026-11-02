import { describe, expect, it } from 'vitest';
import { foiz, kesimJami, kesimMosmi, summaPaket } from './summa-paket';

const namuna = {
  qqs_bilan: 2022.47, qqs: 216.69, ustamali: 1805.78, ustamasiz: 1640, qqs_foiz: 12, ustamasiz_qism: 620,
  kesim: { chel: 100, mash: 220, mat: 300, ob: 400, subpudrat: 120, svod: 500, ustamasiz: 0, nomalum: 0 },
  soat: { chel: 10, mash: 5, mashinist: 5 },
  subpudratchilar: [{ kontragent: 'Sintetik MChJ', summa: 120 }, null],
  narxsiz_soni: 0, qator_soni: 8, nk_manba: 'smeta_podvali',
};

describe('summaPaket', () => {
  it('server javobini turga keltiradi; Σ kesim = прямые', () => {
    const p = summaPaket(namuna)!;
    expect(p.qqs_bilan).toBe(2022.47);
    expect(p.subpudratchilar).toEqual([{ kontragent: 'Sintetik MChJ', summa: 120 }]);
    expect(kesimJami(p.kesim)).toBe(1640);
    expect(kesimMosmi(p)).toBe(true);
    expect(p.nk_manba).toBe('smeta_podvali');
  });
  it('asosiy uchlik bo‘lmasa — null (soxta 0 yo‘q)', () => {
    expect(summaPaket(null)).toBeNull();
    expect(summaPaket({ ...namuna, qqs_bilan: null })).toBeNull();
    expect(summaPaket({ ustamali: 1, ustamasiz: 1 })).toBeNull();
    expect(summaPaket([1, 2])).toBeNull();
  });
  it('raqam matn ko‘rinishida kelsa ham o‘qiladi (Postgres numeric)', () => {
    const p = summaPaket({ ...namuna, qqs_bilan: '2022.47', kesim: { chel: '100' } })!;
    expect(p.qqs_bilan).toBe(2022.47);
    expect(p.kesim.chel).toBe(100);
    expect(p.kesim.mash).toBe(0);
    expect(kesimMosmi(p)).toBe(false);
  });
  it('foiz: maxraj 0/null → null', () => {
    expect(foiz(50, 200)).toBe(25);
    expect(foiz(1, 3)).toBe(33.3);
    expect(foiz(5, 0)).toBeNull();
    expect(foiz(null, 10)).toBeNull();
  });
});
