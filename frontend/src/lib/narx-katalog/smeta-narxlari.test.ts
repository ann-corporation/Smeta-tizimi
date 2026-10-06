import { describe, expect, it } from 'vitest';
import { smetaNarxlari, type ExportRow } from './price-shards';
import { priceCommand } from '../smeta-studio/price-lookup';
import type { KatalogQatori } from './types';

// id, manba, tartib(source row), kod, nom, birlik, narx, hudud, zavod, nds_holati, nds_izoh, yil, kv, variant, guruh, kod_key, nom_key, birlik_key, header
const row = (id: number, tartib: number, narx: string, nds: 'nds_bilan' | 'nds_siz', nom = 'Плиты 2 ПК 59-12', izoh = 'НДС 12%'): ExportRow =>
  [id, 5, tartib, null, nom, 'шт', narx, 'г. Ташкент', 'OOO Zavod', nds, izoh, 2026, 1, nds, 'Плиты', null, null, null, false];

describe('smeta narxlari — VAT-free only, each product once (owner rule 2026-10-06)', () => {
  it('3 identical rows × with/without VAT collapse to ONE VAT-free row (lowest id kept)', () => {
    const r = smetaNarxlari([row(1, 101, '1550000', 'nds_bilan'), row(2, 102, '1550000', 'nds_bilan'), row(3, 103, '1550000', 'nds_bilan'),
      row(4, 104, '1383929', 'nds_siz'), row(5, 105, '1383929', 'nds_siz'), row(6, 106, '1383929', 'nds_siz')]);
    expect(r.rows.map(x => [x[0], x[6], x[9]])).toEqual([[4, '1383929', 'nds_siz']]);
    expect(r.counts).toMatchObject({ vatRowsDropped: 3, duplicatesCollapsed: 2, derivedNet: 0 });
  });
  it('a VAT-inclusive row without a VAT-free twin gets a derived net price, explicitly marked', () => {
    const r = smetaNarxlari([row(7, 1, '1120000', 'nds_bilan', 'Кольца КС 7-6')]);
    expect(r.rows[0][6]).toBe('1000000');
    expect(r.rows[0][9]).toBe('nds_siz');
    expect(r.rows[0][10]).toContain('hisoblangan: НДС 12% chiqarildi');
    const bad = smetaNarxlari([row(8, 1, '500', 'nds_bilan', 'Без ставки', '')]);
    expect(bad.rows).toHaveLength(0); expect(bad.counts.unknownVatDropped).toBe(1);
  });
  it('a different price is a different offer, never collapsed', () => {
    expect(smetaNarxlari([row(1, 1, '100', 'nds_siz'), row(2, 2, '110', 'nds_siz')]).rows).toHaveLength(2);
  });
  it('studio never applies a VAT-inclusive price', () => {
    const k = { id: 1, narx: 1550000, nds_holati: 'nds_bilan', nom: 'x' } as KatalogQatori;
    expect(() => priceCommand('o', 'r', k)).toThrow('PRICE_VAT_INCLUDED');
  });
});
