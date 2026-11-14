import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TasdiqContainer } from '../../umumiy/ui/Tasdiq';
import { XizmatTakliflari } from './XizmatTakliflari';

const m = vi.hoisted(() => ({ javob: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../components/mutaxassis/MutaxassisKartasi', () => ({ MutaxassisKartasi: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../api/t2-mutaxassis', () => ({
  KASB_NOMI: {}, mutaxassisXato: () => 'xato', ochiqProfil: vi.fn(), mutaxassislarQidir: vi.fn(async () => []),
  kelganTakliflar: async () => ({ ochiqProfil: false, takliflar: [{ id: 9, rol: 'pto', holat: 'yuborildi', xabar: null, mutaxassis: { ism: 'Test' } }] }),
  taklifJavob: m.javob,
}));

afterEach(() => { cleanup(); m.javob.mockClear(); });

describe('Xizmat taklifini rad etish: sabab sahifa ichidagi dialogda (window.prompt emas)', () => {
  it('sabab yozilib tasdiqlansa — shu sabab bilan rad etiladi', async () => {
    render(<><TasdiqContainer /><XizmatTakliflari kompaniyaId={3} isDirector /></>);
    const rad = await screen.findByRole('button', { name: /Rad etish/ });
    await act(async () => { fireEvent.click(rad); });
    fireEvent.change(await screen.findByTestId('matn-sorov'), { target: { value: 'hozir kerak emas' } });
    await act(async () => { fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rad etish' })); });
    await waitFor(() => expect(m.javob).toHaveBeenCalledWith(3, 9, false, 'hozir kerak emas'));
  });
  it('dialog bekor qilinsa — rad etilmaydi (hech narsa bo‘lmaydi)', async () => {
    render(<><TasdiqContainer /><XizmatTakliflari kompaniyaId={3} isDirector /></>);
    const rad = await screen.findByRole('button', { name: /Rad etish/ });
    await act(async () => { fireEvent.click(rad); });
    await screen.findByTestId('matn-sorov');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' })); });
    expect(m.javob).not.toHaveBeenCalled();
  });
});
