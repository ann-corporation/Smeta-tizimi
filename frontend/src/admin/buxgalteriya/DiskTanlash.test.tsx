import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ tolovOl: vi.fn() }));
vi.mock('../../api/t2-asl-fayl', () => ({ aslFaylSaqla: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));
vi.mock('../../api/t2-bux-hisob', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bux-hisob')>()), buxTolovOl: m.tolovOl }));
/* Disk oynasi alohida testlangan: bu yerda tugma Disk faylini File sifatida sahifa handleriga bergani tekshiriladi. */
vi.mock('../../hujjat-maydoni/DiskdanTanlash', () => ({
  DiskdanTanlashTugma: ({ onFayllar, accept }: { onFayllar: (f: File[]) => void; accept?: string }) => (
    <button type="button" data-accept={accept} onClick={() => onFayllar([new File(['Hisob;Debet;Kredit\n5010;100;0\n'], 'disk-saldo.csv', { type: 'text/csv' })])}>Diskdan tanlash</button>
  ),
}));
import { Saldo } from './Saldo';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Buxgalteriya: Diskdan tanlash', () => {
  it('Saldo: Diskdan tanlangan CSV kompyuterdan yuklangandek o‘qiladi (fayl nomi ko‘rinadi)', async () => {
    m.tolovOl.mockResolvedValue({ ok: false, error: 'x' });
    render(<Saldo kid={1} onOzgardi={() => {}} tasdiqlaydi />);
    const tugma = screen.getByRole('button', { name: 'Diskdan tanlash' });
    expect(tugma.getAttribute('data-accept')).toBe('.csv,.txt,.xlsx,.xls');
    fireEvent.click(tugma);
    await waitFor(() => expect(screen.getByText('disk-saldo.csv')).toBeTruthy());
  });
});
