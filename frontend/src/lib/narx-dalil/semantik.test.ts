import { describe, expect, it } from 'vitest';
import { birlikKalit, narxSemantikNomzodlari, nomKalit, type NarxQidiruvManba, type NarxQidiruvResurs } from './semantik';

const resource = (nom: string, birlik: string | null = 'м3'): NarxQidiruvResurs =>
  ({ id: 1, nom, birlik, kod: 'SAME-CODE', narx: 100, kat: 'МАТ', tur: 'rs' });
const source = (nom: string, birlik: string | null = 'м3'): NarxQidiruvManba =>
  ({ id: 2, manba_id: 3, nom, birlik, kod: 'SAME-CODE', narx: 120 });

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

  it('identical codes cannot retrieve or score an unrelated name', () => {
    expect(narxSemantikNomzodlari([resource('ПЕСОК')], [source('КАБЕЛЬ СИЛОВОЙ')])).toEqual([]);
  });

  it('different codes match the same name and unit without a code bonus or baseline mutation', () => {
    const q = resource('ПЕСОК');
    const m = source('ПЕСОК');
    const before = JSON.stringify([q, m]);
    const sameCode = narxSemantikNomzodlari([q], [m]);
    const differentCode = narxSemantikNomzodlari([q], [{ ...m, kod: 'OTHER-CODE' }]);
    const noCode = narxSemantikNomzodlari([{ ...q, kod: null }], [{ ...m, kod: null }]);
    expect(differentCode).toEqual(sameCode);
    expect(noCode).toEqual(sameCode);
    expect(sameCode[0]).toMatchObject({ moslik: 'nom_birlik', moslikFoiz: 99, smeta_narx: 100, manba_narx: 120, farqFoiz: 20 });
    expect(sameCode[0].sabablar.join(' ')).not.toMatch(/shifr|kod/);
    expect(JSON.stringify([q, m])).toBe(before);
  });

  it.each([
    ['БЕТОН B20', 'БЕТОН B25', 'м3'],
    ['АРМАТУРА А500С ДИАМЕТРОМ 12 ММ', 'АРМАТУРА А500С ДИАМЕТРОМ 16 ММ', 'т'],
    ['ЩЕБЕНЬ 5-10 ММ', 'ЩЕБЕНЬ 10-20 ММ', 'м3'],
    ['АРМАТУРА А500С ДИАМЕТРОМ 12 ММ', 'СЕТКА А500С ДИАМЕТРОМ 12 ММ', 'т'],
    ['ЭКСКАВАТОР 0.5 М3', 'ЭКСКАВАТОР 1 М3', 'маш-ч'],
    ['КРАН 5 Т', 'КРАН 10 Т', 'маш-ч'],
    ['АВТОПОГРУЗЧИК 5 Т', 'АВТОПОГРУЗЧИК 10 Т', 'маш-ч'],
    ['ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'чел-ч'],
    ['ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'чел-ч'],
  ])('withholds incompatible characteristics: %s / %s', (name, other, unit) => {
    expect(narxSemantikNomzodlari([resource(name, unit)], [source(other, unit)])).toEqual([]);
  });

  it.each([
    ['т', 'кг'], ['кг', 'т'], ['м3', null], [null, 'м3'], [null, null], ['м3', ''], ['м3', '?'],
  ])('requires known matching units without price conversion: %s / %s', (unit, other) => {
    expect(narxSemantikNomzodlari([resource('ПЕСОК', unit)], [source('ПЕСОК', other)])).toEqual([]);
  });

  it('accepts equivalent hour aliases through the shared gates', () => {
    const q = resource('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч');
    const m = source(q.nom!, 'чел-час');
    expect(narxSemantikNomzodlari([q], [m])[0]).toMatchObject({ manba_narx: 120, moslik: 'nom_birlik' });
  });
});
