import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WarehouseCard } from './WarehouseCard';
import { omborTahlilMatn, omborTasdiq } from '../../api/t2-ombor';
import type { WarehouseSnapshot } from './warehouse-command';
vi.mock('../../api/t2-ombor', () => ({ omborTahlilMatn: vi.fn(), omborTasdiq: vi.fn() }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s, raqamFormatla: String }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const preview = { ok: true as const, holat: 'tasdiq_kerak', token: 'signed', preview: { nomi: 'Sement', miqdor: 2, birligi: 'kg', narx_rejim_sorov: true } };
const snapshot: WarehouseSnapshot = { company: 7, question: 'sement keldi', warehouseId: null, result: null,
  warehouses: [1, 2].map(id => ({ id, kompaniya_id: 7, nomi: `Ombor ${id}`, yozish: true })) };
it('preserves choices and QQS and only confirms explicitly, retaining failed confirmation for retry', async () => {
  vi.mocked(omborTahlilMatn).mockResolvedValueOnce({ ok: true, holat: 'savol', savol: 'Kimdan?', variantlar: [{ yorliq: 'Ali', tanlov: { kontragent: 'Ali' } }] })
    .mockResolvedValueOnce(preview).mockResolvedValue({ ...preview, preview: { ...preview.preview, narx_rejim_sorov: false } });
  vi.mocked(omborTasdiq).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true });
  const onDone = vi.fn(); render(<WarehouseCard snapshot={snapshot} onDone={onDone} />);
  expect(omborTahlilMatn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ombor 2' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ali' }));
  expect(await screen.findByRole('button', { name: 'Tasdiqlash' })).toHaveProperty('disabled', true);
  fireEvent.click(await screen.findByRole('button', { name: 'QQS siz' }));
  await waitFor(() => expect(omborTahlilMatn).toHaveBeenLastCalledWith(7, 2, snapshot.question, { kontragent: 'Ali' }, 'siz'));
  expect(omborTasdiq).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Tasdiqlash' }));
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(onDone).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith('Yozildi'));
  expect(omborTasdiq).toHaveBeenCalledTimes(2); expect(omborTasdiq).toHaveBeenLastCalledWith(7, 2, 'signed');
});
it('appends missing facts to original command and blocks concurrent sends', async () => {
  const pending = { ...snapshot, warehouseId: 1, result: { ok: true as const, holat: 'toldirish_kerak', savol: 'Sana?' } };
  let release!: (v: typeof preview) => void;
  vi.mocked(omborTahlilMatn).mockImplementation(() => new Promise(resolve => { release = resolve; }));
  render(<WarehouseCard snapshot={pending} onDone={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '2026-11-18' } });
  const button = screen.getByRole('button', { name: 'Tushun' }); fireEvent.click(button); fireEvent.click(button);
  expect(omborTahlilMatn).toHaveBeenCalledTimes(1);
  expect(omborTahlilMatn).toHaveBeenCalledWith(7, 1, snapshot.question + '\n2026-11-18', {}, undefined);
  release(preview); await screen.findByRole('button', { name: 'Tasdiqlash' }); expect(omborTasdiq).not.toHaveBeenCalled();
});
it('merges material choices and invalidates old confirmation when reanalysis fails', async () => {
  const nomzod = { kalit: 'mix', nomi: 'Mix', birligi: 'kg', qoldiq: 5, ball: 0.8, variantlar_soni: 1 };
  vi.mocked(omborTahlilMatn).mockResolvedValueOnce({ ...preview, nomzodlar: [nomzod] }).mockResolvedValueOnce({ ok: false, code: 'NETWORK' }).mockResolvedValue(preview);
  render(<WarehouseCard snapshot={{ ...snapshot, warehouseId: 1, result: preview }} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'QQS siz' }));
  fireEvent.click(await screen.findByRole('button', { name: /Mix/ }));
  await screen.findByRole('alert'); expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tushun' }));
  await screen.findByRole('button', { name: 'Tasdiqlash' });
  expect(omborTahlilMatn).toHaveBeenLastCalledWith(7, 1, snapshot.question, { nomi: 'Mix', birligi: 'kg' }, 'siz');
  expect(omborTasdiq).not.toHaveBeenCalled();
});
