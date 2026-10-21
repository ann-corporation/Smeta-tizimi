import { describe, expect, it } from 'vitest';
import { f2OyKesimi } from './f3-sources';
import type { F2Tafsilot } from '../../api/t2-narx';

/* Audit 2026-10-21 (ADR-4): NULL = noma'lum, 0 = haqiqiy nol; tasdiqlangan summa qayta hisoblanmaydi. */
const q = (x: Partial<F2Tafsilot>): F2Tafsilot => ({
  akt_id: 1, obyekt_id: 1, kompaniya_id: 1, tur: 'f2', oy: '2026-09-01', akt_holat: 'tasdiqlangan', raqam: '1', akt_kim: null, akt_sana: '2026-09-30',
  akt_qator_id: 1, qator_id: 10, kod: null, nom: 'Beton', birlik: 'm3', kat: 'МАТ', qator_tur: 'mat', hajm: 10, narx: 123.45, summa: null, izoh: null,
  certified_quantity: 10, certified_unit_price: 123.45, certified_amount: null, ...x,
});
const kesim = (rows: F2Tafsilot[]) => f2OyKesimi(rows, '2026-09').qiymat.get(10)?.get('2026-09');

describe('F2 oylik kesim — NULL ≠ 0', () => {
  it('aniq certified summa aynan saqlanadi (qty × narx bilan qayta hisoblanmaydi)', () => {
    expect(kesim([q({ certified_amount: 1234.49 })])).toEqual({ hajm: 10, summa: 1234.49 });
  });
  it('summa yo‘q (certified va summa NULL) — noma‘lum, 0 emas', () => {
    expect(kesim([q({})])?.summa).toBeNull();
  });
  it('certified_amount = 0 — haqiqiy 0', () => {
    expect(kesim([q({ certified_amount: 0 })])?.summa).toBe(0);
  });
  it('eski (legacy) qator: certified yo‘q, summa bor — summa olinadi (t2_qator_holat bilan bir xil)', () => {
    expect(kesim([q({ certified_amount: null, summa: 500 })])?.summa).toBe(500);
  });
  it('bir oyda biri ma‘lum, biri noma‘lum — katak noma‘lum (qisman summa to‘liq deb ko‘rsatilmaydi)', () => {
    expect(kesim([q({ certified_amount: 100 }), q({ akt_qator_id: 2, certified_amount: null })])?.summa).toBeNull();
    expect(kesim([q({ certified_amount: null }), q({ akt_qator_id: 2, certified_amount: 100 })])?.summa).toBeNull();
  });
  it('tasdiqlanmagan akt hisobga olinmaydi', () => {
    expect(kesim([q({ akt_holat: 'qoralama', certified_amount: 100 })])).toBeUndefined();
  });
});
