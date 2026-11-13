import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const m = vi.hoisted(() => ({ usullar: vi.fn(), uz: vi.fn(), tasdiq: vi.fn(), kod: vi.fn(), emailBirl: vi.fn() }));
vi.mock('../../api/profil', async (orig) => ({ ...(await orig<typeof import('../../api/profil')>()), usullarOl: m.usullar, usulUz: m.uz, emailKodYubor: m.kod, birlashtirEmailKod: m.emailBirl }));
vi.mock('../../umumiy/ui/Tasdiq', () => ({ tasdiqSora: m.tasdiq }));
vi.mock('../../kirish/GoogleKirish', () => ({ default: () => null }));
import { BirlashtirIsbot, KirishUsullariKarta } from './KirishUsullariKarta';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const U = [
  { id: 1, tur: 'google', niqob: 'Google', tasdiqlangan: true, ulangan_at: '2026-11-01T00:00:00Z', oxirgi_kirish_at: null, manba: 'ustun' },
  { id: 2, tur: 'email', niqob: 'a***@x.uz', tasdiqlangan: false, ulangan_at: '2026-11-01T00:00:00Z', oxirgi_kirish_at: null, manba: 'birlashtirish' },
];
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('Kirish usullari', () => {
  it('ro‘yxat niqoblangan; birlashtirilgan usulda «Uzish» yo‘q', async () => {
    m.usullar.mockResolvedValue({ ok: true, usullar: U });
    wrap(<KirishUsullariKarta />);
    expect(await screen.findByText('a***@x.uz')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Uzish/ })).toHaveLength(1);
  });
  it('uzish: tasdiq → server; QAYTA_KIRISH_KERAK → parol maydoni → parol bilan qayta yuboriladi', async () => {
    m.usullar.mockResolvedValue({ ok: true, usullar: U });
    m.tasdiq.mockResolvedValue(true);
    m.uz.mockResolvedValueOnce({ ok: false, code: 'QAYTA_KIRISH_KERAK', status: 401 }).mockResolvedValueOnce({ ok: true, tur: 'google' });
    wrap(<KirishUsullariKarta />);
    fireEvent.click(await screen.findByRole('button', { name: /^Uzish/ }));
    const parol = await screen.findByLabelText('Joriy parol');
    fireEvent.change(parol, { target: { value: 'parol-12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() => expect(m.uz).toHaveBeenCalledTimes(2));
    expect(m.uz.mock.calls[1][0]).toMatchObject({ usulId: 1, parol: 'parol-12345' });
  });
  it('OXIRGI_USUL xabari ko‘rinadi', async () => {
    m.usullar.mockResolvedValue({ ok: true, usullar: [U[0]] });
    m.tasdiq.mockResolvedValue(true);
    m.uz.mockResolvedValue({ ok: false, code: 'OXIRGI_USUL', status: 400 });
    wrap(<KirishUsullariKarta />);
    fireEvent.click(await screen.findByRole('button', { name: /^Uzish/ }));
    expect((await screen.findByText('Oxirgi kirish usulini uzib bo‘lmaydi.'))).toBeTruthy();
  });
});

describe('Birlashtirish isboti (email kod)', () => {
  it('kod yuboriladi → 6 xonali kod → tasdiq → natija', async () => {
    m.kod.mockResolvedValue({ ok: true, tasdiqlash_id: '11111111-1111-4111-8111-111111111111' });
    m.tasdiq.mockResolvedValue(true);
    m.emailBirl.mockResolvedValue({ ok: true, kochirilgan_kompaniyalar: [], qolgan_rollar: [] });
    const onNatija = vi.fn();
    wrap(<BirlashtirIsbot onNatija={onNatija} />);
    fireEvent.change(screen.getByLabelText('Ikkinchi hisob emaili'), { target: { value: 'aziz@mail.uz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }));
    fireEvent.change(await screen.findByLabelText('Emailga kelgan 6 xonali kod'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Birlashtirish/ }));
    await waitFor(() => expect(onNatija).toHaveBeenCalled());
    expect(m.emailBirl).toHaveBeenCalledWith({ email: 'aziz@mail.uz', tasdiqlashId: '11111111-1111-4111-8111-111111111111', kod: '123456' });
  });
});
