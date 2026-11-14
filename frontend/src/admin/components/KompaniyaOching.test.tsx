import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ navigate: vi.fn(), oziOch: vi.fn(), qayta: vi.fn(), tanla: vi.fn(), qoshil: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => m.navigate }));
vi.mock('../../api/t2-men', () => ({ kompaniyaOziOch: m.oziOch }));
vi.mock('../../api/t2-ish-joyi', () => ({ qoshil: m.qoshil, ishJoyiXato: (r: { code?: string }) => r.code || 'xato' }));
vi.mock('../../api/supabase', () => ({ yangiOperationId: () => '11111111-1111-4111-8111-111111111111' }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ qayta: m.qayta, tanla: m.tanla }) }));
import { KompaniyaOching } from './KompaniyaOching';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const korsat = () => render(<MemoryRouter><KompaniyaOching /></MemoryRouter>);

describe('Kompaniyangizni oching (yangi hisob — bir qadam)', () => {
  it('nom kiritiladi → bitta chaqiruv (STIR siz) → kontekst yangilanadi → bosh sahifaga o‘tadi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.oziOch.mockResolvedValue({ ok: true, kompaniya_id: 55, rol: 'boss' });
    korsat();
    const tugma = screen.getByRole('button', { name: 'Kompaniyani ochish' }) as HTMLButtonElement;
    expect(tugma.disabled).toBe(true); // nom yo'q
    fireEvent.change(screen.getByLabelText('Kompaniya nomi'), { target: { value: 'Sinov MChJ' } });
    fireEvent.click(tugma);
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/admin', { replace: true }));
    expect(m.oziOch).toHaveBeenCalledTimes(1);
    expect(m.oziOch.mock.calls[0][0]).toEqual({ nom: 'Sinov MChJ', inn: undefined, operation_id: '11111111-1111-4111-8111-111111111111' });
    expect(m.qayta).toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(m.tanla).toHaveBeenCalledWith(55);
    vi.useRealTimers();
  });
  it('STIR faqat 9 raqam bo‘lganda yuboriladi; harflar kesiladi', async () => {
    m.oziOch.mockResolvedValue({ ok: true, kompaniya_id: 1 });
    korsat();
    fireEvent.change(screen.getByLabelText('Kompaniya nomi'), { target: { value: 'Sinov MChJ' } });
    fireEvent.change(screen.getByLabelText('STIR (ixtiyoriy)'), { target: { value: '12ab34' } });
    expect((screen.getByLabelText('STIR (ixtiyoriy)') as HTMLInputElement).value).toBe('1234');
    expect((screen.getByRole('button', { name: 'Kompaniyani ochish' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('STIR (ixtiyoriy)'), { target: { value: '123456789' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kompaniyani ochish' }));
    await waitFor(() => expect(m.oziOch).toHaveBeenCalled());
    expect(m.oziOch.mock.calls[0][0].inn).toBe('123456789');
  });
  it('band STIR / ikkinchi urinish — xabar ko‘rinadi, o‘tish yo‘q', async () => {
    for (const [code, matn] of [['INN_BAND', /Bu kompaniya tizimda mavjud/], ['OZI_OCHILGAN', /allaqachon o‘zingiz kompaniya ochgansiz/]] as const) {
      m.oziOch.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
      const { unmount } = korsat();
      fireEvent.change(screen.getByLabelText('Kompaniya nomi'), { target: { value: 'Sinov MChJ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Kompaniyani ochish' }));
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toMatch(matn);
      expect(m.navigate).not.toHaveBeenCalled();
      unmount();
    }
  });
  it('«Taklif havolam bor» — havola bilan qo‘shiladi', async () => {
    m.qoshil.mockResolvedValue({ ok: true, kompaniya_id: 9 });
    korsat();
    fireEvent.click(screen.getByRole('button', { name: /Taklif havolam bor/ }));
    fireEvent.change(screen.getByLabelText('Taklif havolasi yoki kodi'), { target: { value: 'https://x.example/qoshil/abc-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Qo‘shilish' }));
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/admin', { replace: true }));
    expect(m.qoshil).toHaveBeenCalledWith('ABC-123');
  });
});
