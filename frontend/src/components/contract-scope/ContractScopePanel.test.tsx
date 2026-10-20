import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const m = vi.hoisted(() => ({ read: vi.fn(), set: vi.fn() }));
vi.mock('../../api/t2-contract-scope', () => ({ contractScopeRead: m.read, contractScopeSet: m.set }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
import { ContractScopePanel } from './ContractScopePanel';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const lines = [{ id: 7, ota_id: null, tur: 'bl', nom: 'Тестовая скульптура', summa: '100.00', versiya: 3 }];
const data = { bases: [], contracts: [{ id: 9, nom: 'Тестовый договор', raqam: 'Т-1' }] };
describe('contract scope UI', () => {
  it('makes rows after the first page available instead of imposing a fixed limit', async () => {
    m.read.mockResolvedValue(data);
    const many = Array.from({ length: 70 }, (_, i) => ({ ...lines[0], id: i + 1, nom: `Строка ${i + 1}` }));
    render(<ContractScopePanel objectId={4} lines={many} />); await screen.findByText('Tasniflanmagan');
    expect(screen.queryByRole('option', { name: '70 · Строка 70' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Yana qatorlarni ko‘rsatish/ }));
    expect(screen.getByRole('option', { name: '70 · Строка 70' })).toBeTruthy();
  });
  it('shows unknown classification, keeps original amount, never guesses a contract', async () => {
    m.read.mockResolvedValue(data); render(<ContractScopePanel objectId={4} lines={lines} />);
    expect(await screen.findByText('Tasniflanmagan')).toBeTruthy();
    expect(screen.getAllByText('100.00 UZS').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Shartnoma') as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Tasnifni saqlash' }).matches(':disabled')).toBe(true);
  });
  it('retries the same operation after an uncertain response and preserves tax unknown', async () => {
    m.read.mockResolvedValue(data); m.set.mockRejectedValueOnce(new Error('NETWORK_ERROR')).mockResolvedValueOnce(undefined);
    render(<ContractScopePanel objectId={4} lines={lines} />); await screen.findByText('Tasniflanmagan');
    fireEvent.change(screen.getByLabelText('Qator yoki bo‘lim'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Shartnoma'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Ishlar doirasi'), { target: { value: 'artwork' } });
    fireEvent.change(screen.getByLabelText('Asos: hujjat, ilova va band'), { target: { value: 'Договор Т-1 / п.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tasnifni saqlash' }));
    await screen.findByRole('button', { name: 'Qayta urinish' });
    expect(screen.getByLabelText('Ishlar doirasi').matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta urinish' }));
    await waitFor(() => expect(m.set).toHaveBeenCalledTimes(2));
    expect(m.set.mock.calls[0]).toEqual(m.set.mock.calls[1]);
    expect(m.set.mock.calls[0][3]).toMatchObject({ vat: null, markup: null, kind: 'artwork' });
  });
  it('ignores a previous object response arriving after a new scope', async () => {
    let late!: (v: unknown) => void;
    m.read.mockImplementationOnce(() => new Promise(r => { late = r; })).mockResolvedValueOnce(data);
    const view = render(<ContractScopePanel objectId={4} lines={lines} />);
    view.rerender(<ContractScopePanel objectId={5} lines={lines} />);
    await screen.findByText('Tasniflanmagan'); late({ bases: [], contracts: [{ id: 99, nom: 'OLD PRIVATE CONTRACT', raqam: '' }] });
    await waitFor(() => expect(screen.queryByText(/OLD PRIVATE CONTRACT/)).toBeNull());
  });
});
