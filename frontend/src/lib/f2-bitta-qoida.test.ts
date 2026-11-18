import { describe, expect, it } from 'vitest';
import { oyTakrorlari, paketRadEtish, paketRadXabari, taxminiyMi, type BittaF2Akt } from './f2-bitta-qoida';

const akt = (id: number, o: Partial<BittaF2Akt> = {}): BittaF2Akt => ({ id, obyekt_id: 1, oy: '2026-11-01', raqam: `F2-${id}`, holat: 'qoralama', lifecycle_status: 'draft', ...o });
const tasdiq = (id: number, o: Partial<BittaF2Akt> = {}) => akt(id, { holat: 'tasdiqlangan', lifecycle_status: 'approved', ...o });

describe('obyekt x oy = bitta F-2', () => {
  it('taxminiy raqamni taniydi', () => {
    expect(taxminiyMi({ raqam: "TAXMINIY-DPK-163 (prorab tasdig'i kutilmoqda)" })).toBe(true);
    expect(taxminiyMi({ raqam: 'F2-12' })).toBe(false);
  });
  it('asosiy + taxminiy qoralama = takror (akt idlari bilan)', () => {
    const r = oyTakrorlari([akt(1), akt(2, { raqam: 'TAXMINIY-1' })]);
    expect(r).toHaveLength(1);
    expect(r[0].aktlar.map((a) => a.id)).toEqual([1, 2]);
    expect(r[0].taxminiyIds).toEqual([2]);
  });
  it('bekor qilingan, boshqa oy va boshqa obyekt takror emas; ikki tasdiqlangan ham emas', () => {
    expect(oyTakrorlari([akt(1), akt(2, { holat: 'bekor', lifecycle_status: 'cancelled' })])).toEqual([]);
    expect(oyTakrorlari([akt(1), akt(2, { oy: '2026-12-01' })])).toEqual([]);
    expect(oyTakrorlari([akt(1), akt(2, { obyekt_id: 2 })])).toEqual([]);
    expect(oyTakrorlari([tasdiq(1), tasdiq(2)])).toEqual([]);
  });
  it('tasdiqlangan + qoralama takror', () => {
    expect(oyTakrorlari([tasdiq(1), akt(2)])).toHaveLength(1);
  });
  it('paket rad etadi: takror tanlanganda va taxminiy tanlanganda; faqat asosiy tanlansa o‘tadi', () => {
    const a = [tasdiq(1), akt(2, { raqam: 'TAXMINIY-2' })];
    expect(paketRadXabari(paketRadEtish(a, new Set([1, 2])))).toContain('akt 1, 2');
    expect(paketRadXabari(paketRadEtish(a, new Set([2])))).toContain('Taxminiy');
    expect(paketRadEtish(a, new Set([1])).taxminiyIds).toEqual([]);
    expect(paketRadEtish([tasdiq(1)], new Set([1]))).toEqual({ takrorlar: [], taxminiyIds: [] });
    expect(paketRadXabari({ takrorlar: [], taxminiyIds: [] })).toBeNull();
  });
});