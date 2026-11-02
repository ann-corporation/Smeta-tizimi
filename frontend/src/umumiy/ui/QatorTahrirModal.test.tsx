import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tahrir: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/supabase', () => ({ sbT2QatorTahrir: m.tahrir }));
vi.mock('./Toast', () => ({ toast: m.toast }));
import { QatorTahrirModal } from './QatorTahrirModal';
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const nishon = { qatorId: 3, versiya: 1, nom: 'Ish', maydonlar: { nom: 'Ish', hajm: 10, narx: 20, birlik: 'm2', kat: null } };

describe('QatorTahrirModal — versiya ziddiyati', () => {
  it('ziddiyatda qator qayta o‘qiladi (ziddiyatda), qo‘rqituvchi xato yo‘q, qayta urinish mumkin', async () => {
    m.tahrir.mockResolvedValueOnce({ ok: false, sabab: 'ziddiyat', sizning_versiya: 1, bazadagi_versiya: 2, joriy: { nom: 'Ish' } })
      .mockResolvedValueOnce({ ok: true, versiya: 3 });
    const saqlandi = vi.fn(); const ziddiyatda = vi.fn();
    render(<QatorTahrirModal nishon={nishon} yop={vi.fn()} saqlandi={saqlandi} ziddiyatda={ziddiyatda} />);
    fireEvent.change(screen.getByLabelText('Nomi'), { target: { value: 'Ish yangi' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Shu maydonni saqlash' })[0]);
    await waitFor(() => expect(ziddiyatda).toHaveBeenCalledOnce());
    expect(saqlandi).not.toHaveBeenCalled();
    expect(m.toast.mock.calls.some((c) => c[1] === 'danger')).toBe(false);
    // Foydalanuvchi bazadagi versiya bilan qayta yozadi.
    fireEvent.click(screen.getByRole('button', { name: 'Baribir o‘zimniki bilan yozish' }));
    await waitFor(() => expect(saqlandi).toHaveBeenCalledOnce());
    expect(m.tahrir).toHaveBeenLastCalledWith(3, 'nom', 'Ish yangi', 2);
  });
});
