import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Forma3ShaklTanlagich } from './Forma3ShaklTanlagich';
import { f3PaketTanlovOl, f3PaketTanlovSaqla, f3ShaklOl, f3ShaklSaqla, forma3SotuvFayllari, paketShakllari } from '../../lib/forma3-shakl-tanlov';
import type { SvodShartnoma } from '../../lib/nakopitelniy-svod';

beforeEach(() => { try { window.localStorage.clear(); } catch { /* yo'q */ } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('sahifa tanlagichi: ikki variant, ikkalasi-ham varianti yo‘q; tanlov onChange ga uzatiladi', () => {
  const on = vi.fn();
  render(<Forma3ShaklTanlagich qiymat="toliq" onChange={on} />);
  const s = screen.getByLabelText('Forma-3 shakli') as HTMLSelectElement;
  expect([...s.options].map((o) => o.value)).toEqual(['toliq', 'bir_qatorli']);
  fireEvent.change(s, { target: { value: 'bir_qatorli' } });
  expect(on).toHaveBeenCalledWith('bir_qatorli');
});

it('paket tanlagichida «ikkalasi ham» ham bor', () => {
  const on = vi.fn();
  render(<Forma3ShaklTanlagich paket qiymat="toliq" onChange={on} />);
  const s = screen.getByLabelText('Forma-3 shakli') as HTMLSelectElement;
  expect([...s.options].map((o) => o.value)).toEqual(['toliq', 'bir_qatorli', 'ikkalasi']);
  fireEvent.change(s, { target: { value: 'ikkalasi' } });
  expect(on).toHaveBeenCalledWith('ikkalasi');
});

it('tanlov kompaniya bo‘yicha eslanadi; sukut — to‘liq; buzuq qiymat — to‘liq', () => {
  expect(f3ShaklOl(1)).toBe('toliq');
  f3ShaklSaqla(1, 'bir_qatorli');
  expect(f3ShaklOl(1)).toBe('bir_qatorli');
  expect(f3ShaklOl(2)).toBe('toliq');
  window.localStorage.setItem('forma3.shakl.v1:sahifa:3', 'axlat');
  expect(f3ShaklOl(3)).toBe('toliq');
  f3PaketTanlovSaqla(1, 'ikkalasi');
  expect(f3PaketTanlovOl(1)).toBe('ikkalasi');
  expect(f3PaketTanlovOl(2)).toBe('toliq');
});

it('localStorage ishlamasa (try/catch) — xato yo‘q, sukut to‘liq', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blok'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blok'); });
  expect(f3ShaklOl(1)).toBe('toliq');
  expect(() => f3ShaklSaqla(1, 'bir_qatorli')).not.toThrow();
  expect(f3PaketTanlovOl(1)).toBe('toliq');
  expect(() => f3PaketTanlovSaqla(1, 'ikkalasi')).not.toThrow();
});

it('paket shakllari va fayllar: to‘liq → 1, bir qatorli → 1 (boshqa nom), ikkalasi → 2', () => {
  expect(paketShakllari('toliq')).toEqual(['toliq']);
  expect(paketShakllari('ikkalasi')).toEqual(['toliq', 'bir_qatorli']);
  const sh: SvodShartnoma = {
    id: 1, loyiha_id: 1, raqam: 'T-1', nom: null, asosiy: true, holat: 'faol', jami_nds_bilan: 1_000_000,
    obyektlar: [{ id: 10, nom: 'Obyekt A' }], ds: [], f2: [], tolovlar: [],
    f3: [{ id: 12, manba: 'sotuv', raqam: '1', sotuv_sana: '2026-02-10', sotuv_summa: 1_120_000.35, nds_foiz: 12, davr_boshi: '2026-02-01', davr_oxiri: '2026-02-10', holat: 'tayyor', bajarilgan_f2_summa: null, izoh: null, versiya: 1 }],
  };
  const a = forma3SotuvFayllari(sh, 12, 'toliq'), b = forma3SotuvFayllari(sh, 12, 'bir_qatorli'), c = forma3SotuvFayllari(sh, 12, 'ikkalasi');
  expect([a.length, b.length, c.length]).toEqual([1, 1, 2]);
  expect(a[0].faylNomi).not.toBe(b[0].faylNomi);
  expect(c.map((x) => x.shakl)).toEqual(['toliq', 'bir_qatorli']);
  expect(forma3SotuvFayllari(sh, 99, 'ikkalasi')).toEqual([]);
});
