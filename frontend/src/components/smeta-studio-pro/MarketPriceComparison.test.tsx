import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { sbOqi, type SbJavob } from '../../api/supabase';
import { narxKatalogi, type PriceCatalog, type KatalogQatori } from '../../lib/narx-katalog/price-remote';
import { MarketPriceComparison } from './MarketPriceComparison';
import { marketReadPrice } from '../../lib/smeta-studio/market-comparison';
vi.mock('../../api/supabase', () => ({ sbOqi: vi.fn() }));
vi.mock('../../lib/narx-katalog/price-remote', () => ({ narxKatalogi: vi.fn() }));
const name = 'АРМАТУРА А500С Ø12';
const row: KatalogQatori = { id: 1, manba_id: 1, kod: 'UNUSED', nom: name, birlik: 'кг', narx: 8300, hudud: 'Ташкент',
  ishlab_chiqaruvchi: 'Zavod', nds_holati: 'nds_siz', nds_izoh: null, yil: 2026, kvartal: 2, narx_varianti: null,
  guruh: null, hudud_kalit: 'tashkent', manba_nom: 'prices.xlsx', manba_tur: 'platforma' };
const line = { id: '1', name, unit: 'т', price: 7500000 };
type Raw = { id: number; nom: string | null; birlik: string | null; narx: number | null };
const reply = (nom = name): SbJavob<Raw> => ({ ok: true, toliq: true, qatorlar: [{ id: 1, nom, birlik: 'т', narx: 7500000 }] });
beforeEach(() => {
  vi.clearAllMocks();
  const view = { size: 1, name: () => row.nom, unit: () => row.birlik, region: () => row.hudud_kalit, price: () => row.narx, row: () => row };
  vi.mocked(narxKatalogi).mockResolvedValue({ rows: [row], qator: () => row, matchView: () => view,
    dict: { hudud: ['Ташкент'], hududKalit: ['tashkent'] }, manifest: { source: { manba: { nom: 'prices.xlsx', yil: 2026, kvartal: 2 } } } } as unknown as PriceCatalog);
  vi.mocked(sbOqi).mockResolvedValue(reply());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('uses supplied actual resource lines, exposes evidence and never requests DB writes', async () => {
  const lines = Object.freeze([Object.freeze(line)]);
  render(<MarketPriceComparison lines={lines} objectId={7} companyId={17} />);
  await screen.findByText(name);
  expect(sbOqi).not.toHaveBeenCalled();
  expect(screen.getByText('10,6667%')).toBeTruthy();
  expect(screen.getByText(/Smeta katalogdan past/)).toBeTruthy();
  fireEvent.click(screen.getByText(/Takliflar: 1;/));
  expect(screen.getAllByText(/prices.xlsx/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Birlik konversiyasi/).textContent).toContain('1000');
  expect(screen.queryByRole('button', { name: /qo‘yish|saqlash/i })).toBeNull();
  expect(lines[0].price).toBe(7500000);
});
it('empty supplied lines override object loading; null and zero stay distinct', async () => {
  const v = render(<MarketPriceComparison lines={[]} objectId={7} companyId={17} />);
  await screen.findByText('Taqqoslash uchun resurslar yo‘q.'); expect(sbOqi).not.toHaveBeenCalled();
  v.rerender(<MarketPriceComparison lines={[{ ...line, price: null }, { ...line, id: '2', price: 0 }]} />);
  await screen.findByText('Smeta narxi 0 — foiz hisoblanmaydi'); expect(screen.getAllByText('Noma’lum').length).toBeGreaterThan(0);
});
it('scopes the read and hides loaded old lines synchronously on object/company switch', async () => {
  let resolveNew!: (r: SbJavob<Raw>) => void;
  vi.mocked(sbOqi).mockResolvedValueOnce(reply()).mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));
  const v = render(<MarketPriceComparison objectId={7} companyId={17} />);
  await screen.findByText(name);
  expect(sbOqi).toHaveBeenCalledWith({ jadval: 't2_qator', ustunlar: 'id,nom,birlik,narx',
    filtr: 'kompaniya_id=eq.17&obyekt_id=eq.7&tur=in.(rs,mat,ob)', tartib: 'id.asc', limit: 20000 });
  v.rerender(<MarketPriceComparison objectId={8} companyId={39} />);
  expect(screen.queryByText(name)).toBeNull();
  await act(async () => resolveNew(reply('Yangi obyekt materiali')));
  await screen.findByText('Yangi obyekt materiali'); expect(screen.queryByText(name)).toBeNull();
});
it('discards a delayed old response, including A → B → A races', async () => {
  let old!: (r: SbJavob<Raw>) => void;
  vi.mocked(sbOqi).mockReturnValueOnce(new Promise(resolve => { old = resolve; })).mockResolvedValueOnce(reply('B materiali')).mockResolvedValueOnce(reply('Yangi A materiali'));
  const v = render(<MarketPriceComparison objectId={7} companyId={17} />);
  await waitFor(() => expect(sbOqi).toHaveBeenCalledTimes(1));
  v.rerender(<MarketPriceComparison objectId={8} companyId={17} />); await screen.findByText('B materiali');
  v.rerender(<MarketPriceComparison objectId={7} companyId={17} />); await screen.findByText('Yangi A materiali');
  await act(async () => old(reply('Eski A materiali')));
  expect(screen.queryByText('Eski A materiali')).toBeNull(); expect(screen.getByText('Yangi A materiali')).toBeTruthy();
});
it('renders incomplete and failed reads as unknown rather than empty or zero', async () => {
  vi.mocked(sbOqi).mockResolvedValueOnce({ ok: true, toliq: false, qatorlar: reply().qatorlar }).mockResolvedValueOnce({ ok: false });
  const v = render(<MarketPriceComparison objectId={7} companyId={17} />);
  await screen.findByText('Qatorlar to‘liq olinmadi — taqqoslash noma’lum.'); expect(screen.queryByText(name)).toBeNull();
  v.rerender(<MarketPriceComparison objectId={8} companyId={17} />);
  await screen.findByText('Qatorlarni olib bo‘lmadi — taqqoslash noma’lum.');
});
it('catalogue failure is explicitly unknown', async () => {
  vi.mocked(narxKatalogi).mockRejectedValueOnce(new Error('offline'));
  render(<MarketPriceComparison lines={[line]} />); await screen.findByText('Katalog yuklanmadi — taqqoslash noma’lum.');
});
it('hides exactly equal prices by default and paginates many exceptions safely', async () => {
  const lines = Array.from({ length: 101 }, (_, i) => ({ ...line, id: String(i), price: i === 100 ? 8300000 : 7500000 }));
  render(<MarketPriceComparison lines={lines} />);
  await screen.findByText('1 / 2 sahifa'); expect(screen.getAllByText(name)).toHaveLength(50);
  fireEvent.click(screen.getByRole('button', { name: 'Keyingi' })); expect(screen.getByText('2 / 2 sahifa')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox')); expect(await screen.findByText('1 / 3 sahifa')).toBeTruthy();
});
it('strictly normalizes finite numeric strings while preserving zero versus null and blanks', async () => {
  for (const unknown of [null, undefined, '', '   ', 'NaN', 'Infinity', '0x10', false, Infinity]) expect(marketReadPrice(unknown)).toBeNull();
  expect(marketReadPrice('0')).toBe(0); expect(marketReadPrice(0)).toBe(0); expect(marketReadPrice(' 7500000.00 ')).toBe(7500000);
  vi.mocked(sbOqi).mockResolvedValueOnce({ ok: true, toliq: true, qatorlar: [{ id: 1, nom: name, birlik: 'т', narx: '7500000' }] });
  render(<MarketPriceComparison companyId={17} objectId={7} />); await screen.findByText('10,6667%');
});
it('shows unsupported hours only in the summary by default and both deviation directions', async () => {
  render(<MarketPriceComparison lines={[line, { ...line, id: '2', price: 9000000 }, { id: 'h', name: 'Mehnat', unit: 'чел-ч', price: 0 }]} />);
  await screen.findByText(/Material katalogiga kirmaydi: 1/);
  expect(screen.queryByText('Mehnat')).toBeNull(); expect(screen.getByText(/Smeta katalogdan yuqori/)).toBeTruthy();
  expect(screen.getByText(/Smeta katalogdan past/)).toBeTruthy();
});
it('yields between bounded batches, reports progress and processes every unique input', async () => {
  vi.useFakeTimers();
  const lines = Array.from({ length: 155 }, (_, i) => ({ ...line, id: String(i), name: `Unique material ${i}` }));
  render(<MarketPriceComparison lines={lines} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Taqqoslanmoqda: 0 / 155 resurs.')).toBeTruthy();
  await act(async () => { await vi.advanceTimersToNextTimerAsync(); });
  expect(screen.getByText(/Taqqoslanmoqda: [1-9]\d? \/ 155 resurs\./)).toBeTruthy();
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(screen.queryByText(/Taqqoslanmoqda:/)).toBeNull();
  expect(screen.getByText('Jami: 155. Farq yoki noma’lum: 155. Material katalogiga kirmaydi: 0.')).toBeTruthy();
  expect(screen.getByText('1 / 4 sahifa')).toBeTruthy();
});
it('cancels queued calculation batches when supplied resource lines change', async () => {
  vi.useFakeTimers();
  const old = Array.from({ length: 155 }, (_, i) => ({ ...line, id: String(i), name: `Old material ${i}` }));
  const v = render(<MarketPriceComparison lines={old} />);
  await act(async () => { await Promise.resolve(); await vi.advanceTimersToNextTimerAsync(); });
  v.rerender(<MarketPriceComparison lines={[{ ...line, name: 'New material' }]} />);
  expect(screen.queryByText('Old material 0')).toBeNull();
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(screen.getByText('New material')).toBeTruthy(); expect(screen.queryByText('Old material 20')).toBeNull();
  expect(screen.getByText('Jami: 1. Farq yoki noma’lum: 1. Material katalogiga kirmaydi: 0.')).toBeTruthy();
});
