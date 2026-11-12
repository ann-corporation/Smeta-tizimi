// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-buxgalteriya', () => ({ sbT2TolovYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => '11111111-1111-4111-8111-111111111111' }));

import { TolovForma } from './TolovForma';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const shartnomalar = [{ id: 7, raqam: 'A-1', nom: 'Asosiy', jami_nds_bilan: 1000 }, { id: 8, raqam: 'B-2', jami_nds_bilan: null }];

describe('TolovForma', () => {
  it('shartnoma oldindan tanlangan; bo‘sh summa yozuvni YUBORMAYDI', async () => {
    render(<TolovForma kompaniyaId={17} shartnomalar={shartnomalar} shartnomaId={7} yop={vi.fn()} />);
    expect((screen.getByLabelText('Shartnoma') as HTMLSelectElement).value).toBe('7');
    expect(screen.getByTestId('tolov-shartnoma-jami').textContent).toContain('QQS bilan');
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(m.yoz).not.toHaveBeenCalled();
    expect(await screen.findByText('Summani kiriting')).toBeTruthy();
  });
  it('summa bilan saqlaydi: bitta operation_id, saqlangach yopiladi va yangilanadi', async () => {
    m.yoz.mockResolvedValue({ ok: true, tolov_id: 1 });
    const yop = vi.fn(); const onSaved = vi.fn();
    render(<TolovForma kompaniyaId={17} shartnomalar={shartnomalar} shartnomaId={7} yop={yop} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Summa'), { target: { value: '1500000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz.mock.calls[0][0]).toMatchObject({ shartnomaId: 7, summa: 1500000, tur: 'tolov', operationId: '11111111-1111-4111-8111-111111111111' });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(yop).toHaveBeenCalled();
  });
  it('server rad etsa — sabab ko‘rsatiladi, oyna yopilmaydi', async () => {
    m.yoz.mockResolvedValue({ ok: false, sabab: 'shartnoma', error: 'Shartnoma topilmadi' });
    const yop = vi.fn();
    render(<TolovForma kompaniyaId={17} shartnomalar={shartnomalar} shartnomaId={8} yop={yop} />);
    fireEvent.change(screen.getByLabelText('Summa'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith('Shartnoma topilmadi', 'danger'));
    expect(yop).not.toHaveBeenCalled();
  });
});
