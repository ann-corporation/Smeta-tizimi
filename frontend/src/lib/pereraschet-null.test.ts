import { describe, expect, it } from 'vitest';
import { pereraschetHisobla, qatorTasnif, tuzatuvchiYuk, type PQator } from './pereraschet';

const row = (patch: Partial<PQator>): PQator => ({ qator_id: 7, ota_id: null, tur: 'mat', kod: 'SYNTHETIC', nom: 'Synthetic', birlik: 'm3', kat: 'МАТ', smeta_hajm: 10, smeta_narx: 1000, fakt_hajm: 0, f2_hajm: 0, f2_summa: 0, ...patch });
const scope = { eski: false, zamena: false, bolimId: null, bolimYol: [], ajdodlar: [] };

describe('reconciliation preserves quantity and amount evidence independently', () => {
  it.each([500, -500])('zero net quantity with amount%s stays review-only and never creates an automatic correction', amount => {
    const n = pereraschetHisobla([row({ f2_summa: amount })]);
    expect(n.qatorlar).toHaveLength(1);
    expect(n.tekshirish[0]).toMatchObject({ f2Hajm: 0, f2Summa: amount, hisobda: false, tekshir: ['f2_hajmsiz_summa'] });
    expect(n.jami.sof).toBe(0);
    expect(tuzatuvchiYuk(n.qatorlar, new Set([7]))).toEqual([]);
  });

  it.each([undefined, 0])('explicitNULL amount stays unknown when companion counter is%s', counter => {
    const n = qatorTasnif(row({ fakt_hajm: 5, f2_hajm: 5, f2_summa: null, f2_summa_nomalum: counter }), scope)!;
    expect(n.f2Summa).toBeNull();
    expect(n.f2Narx).toBeNull();
    expect(n.bandlar).toEqual([]);
    expect(n.hisobda).toBe(false);
    expect(n.tekshir).toContain('f2_summa_yoq');
  });

  it('confirmed zero is distinct from unknown and preserves a valid price-difference comparison', () => {
    const n = qatorTasnif(row({ fakt_hajm: 5, f2_hajm: 5, f2_summa: 0, f2_summa_nomalum: 0 }), scope)!;
    expect(n.f2Summa).toBe(0);
    expect(n.bandlar).toEqual([{ tur: 'narx_farqi', hajm: 0, summa: 5000 }]);
    expect(n.hisobda).toBe(true);
  });

  it('the missing-amount counter keeps a net-zero unresolved act visible', () => {
    const n = pereraschetHisobla([row({ f2_summa: null, f2_summa_nomalum: 1 })]);
    expect(n.tekshirish[0].tekshir).toContain('f2_summa_yoq');
    expect(n.tekshirish[0].f2Summa).toBeNull();
    expect(n.jami.soni).toBe(0);
  });

  it('no fact, quantity or monetary evidence produces no reconciliation row', () => {
    expect(qatorTasnif(row({}), scope)).toBeNull();
  });

  it('an unknown certified amount does not erase the existing estimate-based quantity overrun band', () => {
    const n = qatorTasnif(row({ fakt_hajm: 12, f2_hajm: 12, f2_summa: null }), scope)!;
    expect(n.bandlar).toEqual([{ tur: 'ortiqcha', hajm: -2, summa: -2000 }]);
    expect(n.eslatma).toContain('narx_farqi_hisoblanmadi');
  });
});
