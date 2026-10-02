import { describe, expect, it } from 'vitest';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yacheykalar, f2Yuk } from './f2-tayyor';
import { tokenTaxmin, type TokenNarx } from '../api/t2-token';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS, NAMUNA_NAKRUTKA } from './f2-hujjat.fixture';

// Egasi 2026-10-02: token — hujjatda ishlanayotgan yacheykalar soniga ko'ra.
const narx: TokenNarx = { amal: 'hujjat', nom: '', tur: 'yacheyka', narx: 1, birlik: 500, minimum: 1 };

describe('token — yacheyka soni', () => {
  const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
  const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });

  it('Ф-2 hujjati faqat qiymat/formulali kataklarni sanaydi', () => {
    const kichik = f2Hujjat(b, q.slice(0, 2), { obyektNom: 'X', davr: '2026-10', raqam: '1' });
    const toliq = f2Hujjat(b, q, { obyektNom: 'X', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 });
    expect(toliq.yacheykalar).toBeGreaterThan(q.length * 3);
    expect(toliq.yacheykalar).toBeGreaterThan(kichik.yacheykalar);
    expect(tokenTaxmin(narx, toliq.yacheykalar)).toBe(Math.max(1, Math.ceil(toliq.yacheykalar / 500)));
  });

  it('minimum 1 token; yacheyka ko‘paysa token proporsional', () => {
    expect(tokenTaxmin(narx, 0)).toBe(1);
    expect(tokenTaxmin(narx, 500)).toBe(1);
    expect(tokenTaxmin(narx, 501)).toBe(2);
    expect(tokenTaxmin(narx, 10000)).toBe(20);
  });

  it('F2 qoralama — to‘ldirilgan hajm/narx/summa qiymatlari', () => {
    const yuk = f2Yuk(q, '1');
    const n = f2Yacheykalar(yuk);
    expect(n).toBeGreaterThanOrEqual(yuk.length);
    expect(n).toBeLessThanOrEqual(yuk.length * 3);
  });
});
