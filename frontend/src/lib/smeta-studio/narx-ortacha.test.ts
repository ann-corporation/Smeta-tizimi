import { describe, expect, it } from 'vitest';
import type { KatalogQatori } from '../narx-katalog/types';
import { justificationOf } from './commands';
import { narxAsosi, ortachaQil, qatorNomzodi } from './narx-yigish';

let id = 0;
const q = (nom: string, narx: number, p: Partial<KatalogQatori> = {}): KatalogQatori => ({
  id: ++id, manba_id: 1, kod: String(100 + id), nom, birlik: 'т', narx, hudud: 'Тошкент ш.', ishlab_chiqaruvchi: `Поставщик ${id}`, nds_holati: 'nds_siz',
  nds_izoh: null, yil: 2026, kvartal: 3, narx_varianti: null, guruh: null, hudud_kalit: 'toshkent', manba_nom: 'Каталог текущих цен', manba_tur: 'katalog', ...p,
});

describe('bir nechta yetkazuvchi narxi — o‘rtacha (egasi 2026-10-17)', () => {
  it('6 ta yetkazuvchining Ø10 armaturasi → arifmetik o‘rtacha, har bir taklif hujjatda', () => {
    const narxlar = [7_800_000, 8_000_000, 8_100_000, 8_200_000, 8_400_000, 8_500_000];
    const rows = narxlar.map((n, i) => q(i % 2 ? 'Арматура А500С Д10 ММ' : 'Арматура класса А500С д10мм', n));
    const n0 = qatorNomzodi(rows[0], 'т', 'katalog')!;
    const n = ortachaQil(n0, rows, 'toshkent');
    expect(n.ortacha?.soni).toBe(6);
    expect(n.narx).toBe(8_166_666.67);
    expect(n.ortacha).toMatchObject({ min: 7_800_000, max: 8_500_000 });
    const j = narxAsosi(n, 'test');
    expect(j.sourcePrice).toBe('8166666.67');
    expect(j.document).toContain('среднее арифметическое цен 6 поставщиков');
    expect(j.average?.offers).toHaveLength(6);
  });

  it('boshqa sinf/diametr, boshqa hudud, boshqa chorak va NDS li narx o‘rtachaga kirmaydi', () => {
    const asosiy = q('Арматура А500С Д10 ММ', 8_000_000);
    const boshqa = [
      q('Арматура А500С Д12 ММ', 9_000_000), q('Арматура А240 Д10 ММ', 7_000_000),
      q('Арматура А500С Д10 ММ', 9_900_000, { hudud_kalit: 'samarqand' }), q('Арматура А500С Д10 ММ', 6_000_000, { kvartal: 2 }),
      q('Арматура А500С Д10 ММ', 9_600_000, { nds_holati: 'nds_bilan' }), q('Арматура А500С Д10 ММ', 8_200_000, { birlik: 'кг' }),
    ];
    const n = ortachaQil(qatorNomzodi(asosiy, 'т', 'katalog')!, boshqa, 'toshkent');
    expect(n.ortacha).toBeUndefined();
    expect(n.narx).toBe(8_000_000);
  });

  it('bitta yetkazuvchining ikki qatori — o‘rtacha emas (har yetkazuvchi bir marta)', () => {
    const a = q('Цемент М400', 900_000, { ishlab_chiqaruvchi: 'Кувасай' }), b = q('Цемент М400', 950_000, { ishlab_chiqaruvchi: 'Кувасай' });
    expect(ortachaQil(qatorNomzodi(a, 'т', 'katalog')!, [b], 'toshkent').ortacha).toBeUndefined();
  });

  it('o‘rtacha asos buyruqlar qatlamida saqlanadi; bitta taklifli «o‘rtacha» rad etiladi', () => {
    const rows = [q('Цемент М400', 900_000), q('Цемент М400', 1_000_000)];
    const n = ortachaQil(qatorNomzodi(rows[0], 'т', 'katalog')!, rows, 'toshkent');
    const j = narxAsosi(n);
    expect(j.average?.count).toBe(2);
    expect(justificationOf(j)?.average).toEqual({ count: 2, min: '900000', max: '1000000',
      offers: [{ supplier: rows[0].ishlab_chiqaruvchi, code: rows[0].kod, price: '900000' }, { supplier: rows[1].ishlab_chiqaruvchi, code: rows[1].kod, price: '1000000' }] });
    const bad = { ...j, average: { ...j.average!, count: 1, offers: j.average!.offers.slice(0, 1) } };
    expect(() => justificationOf(bad)).toThrow('PRICE_JUSTIFICATION_INVALID');
    expect(justificationOf({ ...j, average: undefined })).not.toHaveProperty('average');
  });
});
