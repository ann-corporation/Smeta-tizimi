import { describe, expect, it } from 'vitest';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yacheykalar, f2Yuk } from './f2-tayyor';
import { narxHisob, type TokenNarx } from '../api/t2-token';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS, NAMUNA_NAKRUTKA } from './f2-hujjat.fixture';

// Egasi 2026-10-02: narx — ishlangan yacheykalardan tannarx + superadmin foyda foizi; F2 ≈ 30–100 ming so'm.
const F2: TokenNarx = { amal: 'f2_hujjat', nom: 'F2', tur: 'yacheyka', birlik: 100, asos_som: 20000, birlik_som: 1000, min_som: 30000, max_som: 100000, foyda_foiz: null, izoh: null, faol: true };
const SOZ = { token_som: 100, foyda_foiz: 30 };

describe('token — yacheyka soni va narx v2', () => {
  const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
  const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });

  it('Ф-2 hujjati faqat qiymat/formulali kataklarni sanaydi', () => {
    const kichik = f2Hujjat(b, q.slice(0, 2), { obyektNom: 'X', davr: '2026-10', raqam: '1' });
    const toliq = f2Hujjat(b, q, { obyektNom: 'X', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 });
    expect(toliq.yacheykalar).toBeGreaterThan(q.length * 3);
    expect(toliq.yacheykalar).toBeGreaterThan(kichik.yacheykalar);
  });

  it('150 mln F2 (792 yacheyka): 28 000 tannarx × 1,3 = 36 400 so‘m = 364 token (server bilan bir xil)', () => {
    const h = narxHisob(F2, 792, SOZ)!;
    expect(h).toMatchObject({ qism: 8, tannarx_som: 28000, foyda_foiz: 30, yakuniy_som: 36400, token: 364 });
  });

  it('minimum va maksimum chegarasi; amalda foyda foizi ustun', () => {
    expect(narxHisob(F2, 50, SOZ)!.yakuniy_som).toBe(30000);
    expect(narxHisob(F2, 8000, SOZ)!.yakuniy_som).toBe(100000);
    expect(narxHisob({ ...F2, foyda_foiz: 0 }, 792, SOZ)!.yakuniy_som).toBe(30000);
    expect(narxHisob({ ...F2, min_som: 0, foyda_foiz: 0 }, 792, SOZ)!.yakuniy_som).toBe(28000);
    expect(narxHisob({ ...F2, faol: false }, 792, SOZ)).toBeNull();
  });

  it('bepul amal (tannarx 0) — 0 token, minimum qo‘llanmaydi', () => {
    expect(narxHisob({ ...F2, asos_som: 0, birlik_som: 0 }, 792, SOZ)!.token).toBe(0);
  });

  it('F2 qoralama — to‘ldirilgan hajm/narx/summa qiymatlari', () => {
    const yuk = f2Yuk(q, '1');
    const n = f2Yacheykalar(yuk);
    expect(n).toBeGreaterThanOrEqual(yuk.length);
    expect(n).toBeLessThanOrEqual(yuk.length * 3);
  });
});
