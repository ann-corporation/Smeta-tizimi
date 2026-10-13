import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupportConversation } from './SupportConversation';
import type { PublicSupportPort, SupportSnapshot } from './support-port';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const initial: SupportSnapshot = { version: 0, mode: 'AI_ASSISTING', messages: [] };
const port = (override: Partial<PublicSupportPort> = {}): PublicSupportPort => ({
  read: vi.fn(async () => initial),
  send: vi.fn(async () => initial),
  requestOperator: vi.fn(async (): Promise<SupportSnapshot> => ({ version: 1, mode: 'WAITING_OPERATOR', messages: [] })),
  ...override,
});
describe('Public support server kontrakti', () => {
  it('buzuq server receiptida crash yoki fake muvaffaqiyat emas, xavfsiz xabar beradi', async () => {
    render(<SupportConversation port={port({ read: vi.fn(async () => ({ version: 1, mode: 'AI_ASSISTING' }) as SupportSnapshot) })} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Yuborish' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('sekin read tugamaguncha polling ustma-ust so‘rov yubormaydi', async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => new Promise<SupportSnapshot>(() => {}));
    render(<SupportConversation port={port({ read })} />);
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('xabar server transcriptidan keladi va human holati aniq ko‘rsatiladi', async () => {
    const p = port({ read: vi.fn(async (): Promise<SupportSnapshot> => ({ version: 1, mode: 'HUMAN_ACTIVE', messages: [{ id: '1', author: 'operator', text: 'Qaysi sahifada muammo?' }] })) });
    render(<SupportConversation port={p} />);
    expect(await screen.findByText('Operator suhbatga qo‘shildi')).toBeTruthy();
    expect(screen.getByText('Qaysi sahifada muammo?')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Adminni suhbatga chaqirish' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('yuborishda error chiqsa draft va operation_id retryda saqlanadi, raw error chiqmaydi', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('SQL secret PGRST')).mockResolvedValueOnce({ version: 1, mode: 'AI_ASSISTING', messages: [{ id: 'm1', author: 'visitor', text: 'F2 savol' }] });
    render(<SupportConversation port={port({ send })} />);
    await screen.findByText('AI yordamchi');
    fireEvent.change(screen.getByLabelText('Savolingiz'), { target: { value: 'F2 savol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/PGRST/)).toBeNull();
    expect((screen.getByLabelText('Savolingiz') as HTMLTextAreaElement).value).toBe('F2 savol');
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await waitFor(() => expect((screen.getByLabelText('Savolingiz') as HTMLTextAreaElement).value).toBe(''));
    expect(send.mock.calls[0][0].operationId).toBe(send.mock.calls[1][0].operationId);
    expect(screen.getByText('F2 savol')).toBeTruthy();
  });
  it('operator chaqirish faqat server tasdiqlagan holatni ko‘rsatadi', async () => {
    const p = port(); render(<SupportConversation port={p} />);
    await screen.findByText('AI yordamchi');
    fireEvent.click(screen.getByRole('button', { name: 'Adminni suhbatga chaqirish' }));
    expect(await screen.findByText('Operator javobi kutilmoqda')).toBeTruthy();
    expect(p.requestOperator).toHaveBeenCalledWith({ operationId: expect.any(String) }, expect.any(AbortSignal));
  });
  it('port/sessiya o‘zgarsa kechikkan eski suhbat ko‘rinmaydi', async () => {
    let resolve!: (v: SupportSnapshot) => void;
    const slow = port({ read: vi.fn(() => new Promise<SupportSnapshot>(r => { resolve = r; })) });
    const { rerender } = render(<SupportConversation port={slow} />);
    rerender(<SupportConversation port={port({ read: vi.fn(async (): Promise<SupportSnapshot> => ({ version: 0, mode: 'HUMAN_ACTIVE', messages: [{ id: 'new', author: 'operator', text: 'Yangi sessiya' }] })) })} />);
    expect(await screen.findByText('Yangi sessiya')).toBeTruthy();
    resolve({ version: 9, mode: 'AI_ASSISTING', messages: [{ id: 'old', author: 'assistant', text: 'Eski sessiya' }] });
    await Promise.resolve();
    expect(screen.queryByText('Eski sessiya')).toBeNull();
  });
  it('yopilgan suhbatda write yo‘q va render 100 xabar bilan chegaralangan', async () => {
    const p = port({ read: vi.fn(async (): Promise<SupportSnapshot> => ({ version: 2, mode: 'CLOSED', messages: Array.from({ length: 150 }, (_, i) => ({ id: String(i), author: 'visitor' as const, text: `Xabar ${i}` })) })) });
    render(<SupportConversation port={p} />);
    await screen.findByText('Murojaat yopilgan');
    expect(screen.getByRole('log').querySelectorAll('article').length).toBe(100);
    expect((screen.getByRole('button', { name: 'Yuborish' }) as HTMLButtonElement).disabled).toBe(true);
    expect(p.send).not.toHaveBeenCalled();
  });
});
