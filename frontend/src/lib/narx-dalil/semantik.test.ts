import { describe, expect, it } from 'vitest';
import { birlikKalit, narxSemantikNomzodlari, nomKalit } from './semantik';

describe('narx semantic source suggestions', () => {
  it('normalizes equivalent units and finds a renamed machine resource', () => {
    expect(birlikKalit('МАШ.-Ч')).toBe('mashch');
    const result = narxSemantikNomzodlari([
      { id: 7, nom: 'ЭКСКАВАТОРЫ НА ГУСЕНИЧНОМ ХОДУ HITACHI', birlik: 'МАШ.-Ч', kod: null, narx: null, kat: 'МАШ', tur: 'rs' },
    ], [
      { id: 91, manba_id: 4, nom: 'Экскаватор дизельный гусеничный HITACHI', birlik: 'маш-час', kod: null, narx: 121463, manbaTur: 'kalkulyatsiya_mash' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].qator_id).toBe(7);
    expect(result[0].manba_narx).toBe(121463);
    expect(result[0].moslikFoiz).toBeGreaterThanOrEqual(72);
    expect(result[0].farqFoiz).toBeNull();
  });

  it('keeps baseline price separate and reports variance', () => {
    const result = narxSemantikNomzodlari([
      { id: 8, nom: 'БЕТОН М200', birlik: 'м3', kod: null, narx: 100000, kat: 'МАТ', tur: 'rs' },
    ], [
      { id: 92, manba_id: 5, nom: 'Бетон М-200', birlik: 'м³', kod: null, narx: 120000, manbaTur: 'katalog' },
    ]);
    expect(result[0].smeta_narx).toBe(100000);
    expect(result[0].manba_narx).toBe(120000);
    expect(result[0].farqFoiz).toBe(20);
    expect(nomKalit('Бетон М200')).toBe(nomKalit('Бетон М-200'));
  });

  it('does not propose a different unit or unrelated material', () => {
    const result = narxSemantikNomzodlari([
      { id: 9, nom: 'АРМАТУРА А500', birlik: 'т', kod: null, narx: null, kat: 'МАТ', tur: 'rs' },
    ], [
      { id: 93, manba_id: 6, nom: 'Арматура А500', birlik: 'м3', kod: null, narx: 10, manbaTur: 'katalog' },
      { id: 94, manba_id: 6, nom: 'Кабель силовой', birlik: 'т', kod: null, narx: 20, manbaTur: 'katalog' },
    ]);
    expect(result).toHaveLength(0);
  });

  it('allows a generic catalog to price a machine row when unit and name agree', () => {
    const result = narxSemantikNomzodlari([
      { id: 10, nom: 'АВТОПОГРУЗЧИК 5 Т', birlik: 'МАШ.-Ч', kod: null, narx: null, kat: 'МАШ', tur: 'rs' },
    ], [
      { id: 95, manba_id: 7, nom: 'Автопогрузчик 5 т', birlik: 'маш-час', kod: null, narx: 88000, manbaTur: 'katalog' },
    ]);
    expect(result[0]?.manba_narx).toBe(88000);
  });
});
