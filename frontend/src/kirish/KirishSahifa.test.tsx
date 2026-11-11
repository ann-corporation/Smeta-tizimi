import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Egasi 2026-10-26: «pochtaga raqam keladi, keyin login bo'ladi» — email kod bilan kirish va ro'yxat (parolsiz).
const m = vi.hoisted(() => ({ navigate: vi.fn(), toast: vi.fn() }));
vi.mock('react-router-dom', async (asl) => ({ ...(await asl<typeof import('react-router-dom')>()), useNavigate: () => m.navigate }));
vi.mock('../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('./GoogleKirish', () => ({ default: () => null }));
// Desktop yuklab olish bloki mount paytida /desktop-release.json ni fetch qiladi; bu testlar faqat kirish API chaqiruvlarini sanaydi.
vi.mock('../components/public-entry/DesktopDownload', () => ({ DesktopDownload: () => null }));

import KirishSahifa from './KirishSahifa';

const TID = '11111111-1111-4111-8111-111111111111';
const javob = (d: unknown, status = 200) => ({ status, json: async () => d });
const kodSora = async (email: string) => {
  fireEvent.change(screen.getByLabelText('Email manzili'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }));
  return screen.findByLabelText('Emailga kelgan 6 xonali kod');
};

describe('Email kod bilan kirish', () => {
  beforeEach(() => { m.navigate.mockReset(); m.toast.mockReset(); });

  it('mavjud hisob: kod → 6-raqamda avtomatik tasdiq → rol sahifasi', async () => {
    const fetchMock = vi.fn(async (_u: string, init?: { body?: string }) => {
      const b = JSON.parse(String(init?.body));
      return b.amal === 'kod' ? javob({ ok: true, tasdiqlash_id: TID }) : javob({ ok: true, yangi: false, rol: 'pto', demo: false });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    const kod = await kodSora('Aziz@Gmail.com ');
    fireEvent.change(kod, { target: { value: '12 34 56' } });
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/admin'));
    const [k, t2] = fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as { body: string }).body)));
    expect(fetchMock.mock.calls.every((c) => c[0] === '/api/kirish-email')).toBe(true);
    expect(k).toEqual({ amal: 'kod', email: 'aziz@gmail.com' });
    expect(t2).toMatchObject({ amal: 'tasdiqla', email: 'aziz@gmail.com', tasdiqlash_id: TID, kod: '123456' });
    expect(t2.operation_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ro‘yxat: ism bilan yangi hisob → Tokenlar', async () => {
    const fetchMock = vi.fn(async (_u: string, init?: { body?: string }) => {
      const b = JSON.parse(String(init?.body));
      return b.amal === 'kod' ? javob({ ok: true, tasdiqlash_id: TID }) : javob({ ok: true, yangi: true, rol: 'boss', demo: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: "Ro'yxatdan o'tish" }));
    fireEvent.change(await screen.findByPlaceholderText('F.I.Sh.'), { target: { value: 'Aziz Karimov' } });
    const kod = await kodSora('aziz@gmail.com');
    fireEvent.change(kod, { target: { value: '654321' } });
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/admin/tokenlar'));
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as { body: string }).body)).ism).toBe('Aziz Karimov');
    expect(m.toast).toHaveBeenCalled();
  });

  it('noto‘g‘ri kod: xabar va qolgan urinish, kirilmaydi', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => JSON.parse(String(init?.body)).amal === 'kod'
      ? javob({ ok: true, tasdiqlash_id: TID }) : javob({ ok: false, code: 'KOD_NOTOGRI', xabar: 'Kod noto‘g‘ri.', qolgan_urinish: 3 }, 400)));
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    fireEvent.change(await kodSora('a@b.uz'), { target: { value: '111111' } });
    expect(await screen.findByText(/Kod noto‘g‘ri\. Qolgan urinish: 3/)).toBeTruthy();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('email tasdiqlanmagan parolli hisob: tushunarli xabar, kirilmaydi, login-parol formasi ochiladi', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => JSON.parse(String(init?.body)).amal === 'kod'
      ? javob({ ok: true, tasdiqlash_id: TID }) : javob({ ok: false, code: 'EMAIL_TASDIQLANMAGAN_PAROLLI_HISOB', xabar: 'x' }, 409)));
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    fireEvent.change(await kodSora('egasi@b.uz'), { target: { value: '222222' } });
    expect(await screen.findByText('Bu email bilan parolli hisob bor. Parol bilan kiring yoki administratorga murojaat qiling.')).toBeTruthy();
    expect(m.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Login va parol bilan kirish' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('yaroqsiz email — serverga bormaydi', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email manzili'), { target: { value: 'aziz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }));
    expect(await screen.findByText('Email manzilini to‘g‘ri kiriting.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('email xizmati yoqilmagan — xabar va login-parol formasi ochiladi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => javob({ ok: false, code: 'EMAIL_XIZMATI_SOZLANMAGAN', xabar: 'Email orqali kirish hali yoqilmagan.' }, 503)));
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email manzili'), { target: { value: 'a@b.uz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kod yuborish' }));
    expect(await screen.findByText('Email orqali kirish hali yoqilmagan.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Login va parol bilan kirish' }).getAttribute('aria-expanded')).toBe('true');
  });
});
