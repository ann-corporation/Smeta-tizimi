import { describe, expect, it } from 'vitest';
import { pereraschetHisobla, qatorTasnif, type PQator } from '../../src/lib/pereraschet';

const line = (patch: Partial<PQator>): PQator => ({
  qator_id: 1, ota_id: null, tur: 'mat', kod: 'SYNTHETIC-01', nom: 'Synthetic material', birlik: 'm3', kat: 'МАТ',
  smeta_hajm: 10, smeta_narx: 1000, fakt_hajm: 0, f2_hajm: 0, f2_summa: 0,
  f2_summa_nomalum: 0, almashtirilgan_hajm: 0, ...patch,
});
const scope = { eski: false, zamena: false, bolimId: null, bolimYol: [], ajdodlar: [] };

describe('independent joint PTO acceptance — synthetic only', () => {
  it('CONTROL: over-certified 2 units at1000 yields minus2000', () => {
    const r = qatorTasnif(line({ fakt_hajm: 12, f2_hajm: 12, f2_summa: 12000 }), scope);
    expect(r?.sof).toBe(-2000);
  });
  it('CONTROL: an unknown plan price stays outside the monetary total', () => {
    const r = pereraschetHisobla([line({ smeta_narx: null, fakt_hajm: 5 })]);
    expect(r.hisobda).toHaveLength(0);
    expect(r.tekshirish).toHaveLength(1);
  });
  it('OPEN JQA-01: zero net quantity with nonzero certified amount must remain visible', () => {
    // Valid reconciliation shape after quantity/price corrections: quantity has netted to0; amount has not.
    const r = pereraschetHisobla([line({ f2_hajm: 0, f2_summa: 500, fakt_hajm: 0 })]);
    expect(r.qatorlar).toHaveLength(1);
    expect(r.hisobda.length + r.tekshirish.length).toBe(1);
  });
  it('OPEN JQA-02: NULL certified amount cannot create a claim by being treated as zero', () => {
    // The nullable input contract must fail closed even if a companion missing-value counter is absent/zero.
    const r = qatorTasnif(line({ f2_hajm: 5, fakt_hajm: 5, f2_summa: null }), scope);
    expect(r?.bandlar.filter(b => b.tur === 'narx_farqi')).toHaveLength(0);
    expect(r == null || !r.hisobda || r.eslatma.includes('narx_farqi_hisoblanmadi')).toBe(true);
  });
});
