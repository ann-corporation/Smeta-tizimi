import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TasdiqContainer } from '../../umumiy/ui/Tasdiq';
import { TaklifHavolalari } from './TaklifHavolalari';

const m = vi.hoisted(() => ({ taklifBekor: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../api/t2-ish-joyi', () => ({
  TAKLIF_ROLLARI: ['pto'], ishJoyiXato: () => 'xato', taklifHavolasi: (k: string) => k,
  taklifBekor: m.taklifBekor, taklifYarat: vi.fn(),
  takliflar: async () => [{ id: 5, rol: 'pto', holat: 'faol', max_soni: 1, foydalanildi: 0, izoh: null, muddat: '2099-01-01T00:00:00Z', yaratildi: '2026-01-01T00:00:00Z' }],
}));

afterEach(() => { cleanup(); m.taklifBekor.mockClear(); });

const ochish = async () => {
  render(<><TasdiqContainer /><TaklifHavolalari kompaniyaId={3} isDirector /></>);
  const b = await screen.findByRole('button', { name: 'Bekor qilish: #5' });
  await act(async () => { fireEvent.click(b); });
};

describe('Taklif havolasini bekor qilish: sahifa ichidagi tasdiq (window.confirm emas)', () => {
  it('bekor tugmasi bosilsa hech narsa o‘zgarmaydi', async () => {
    await ochish();
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' })); });
    expect(m.taklifBekor).not.toHaveBeenCalled();
  });
  it('tasdiqlansa havola bekor qilinadi', async () => {
    await ochish();
    const ok = await screen.findByRole('button', { name: 'Tasdiqlash' });
    await act(async () => { fireEvent.click(ok); });
    await waitFor(() => expect(m.taklifBekor).toHaveBeenCalledWith(3, 5));
  });
});
