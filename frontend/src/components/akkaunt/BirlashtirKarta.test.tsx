import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('../../umumiy/ui/Toast', () => ({ toast: toastMock }));
import { _tilniTestdaQoy } from '../../i18n/til';
import { BirlashtirKarta, rolElementi } from './BirlashtirKarta';
import { PROFIL, chiz, fetchMock } from './test-yordam';

beforeEach(() => { toastMock.mockClear(); _tilniTestdaQoy('uz'); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function toldir(login = 'eski-login', parol = 'sirli-parol') {
  fireEvent.click(screen.getByRole('button', { name: 'Boshqa hisobni shu hisobga birlashtirish' }));
  fireEvent.change(screen.getByLabelText('Ikkinchi hisob logini'), { target: { value: login } });
  fireEvent.change(screen.getByLabelText('Ikkinchi hisob paroli'), { target: { value: parol } });
  fireEvent.click(screen.getByRole('button', { name: 'Birlashtirish' }));
}

describe('BirlashtirKarta', () => {
  it('ulangan usullar ko‘rsatiladi', () => {
    chiz(<BirlashtirKarta profil={{ ...PROFIL, google_ulangan: true, parol_bor: false }} />);
    expect(screen.getByText('Parol o‘rnatilmagan')).toBeTruthy();
    expect(screen.getAllByText('Ulangan').length).toBe(1);
    expect(screen.getAllByText('anvar@example.com').length).toBeGreaterThan(0);
  });

  it('muvaffaqiyat: so‘rov to‘g‘ri, xulosada ko‘chirilgan kompaniyalar va rollar', async () => {
    const { chaqiruvlar } = fetchMock(() => ({ body: { ok: true, kochirilgan_kompaniyalar: [{ kompaniya_id: 7, rol: 'boss' }], qolgan_rollar: ['prorab'] } }));
    chiz(<BirlashtirKarta profil={PROFIL} />);
    toldir();
    await waitFor(() => expect(screen.getByTestId('birlashtirish-xulosa')).toBeTruthy());
    expect(chaqiruvlar.find((c) => c.init?.method === 'POST')!.body).toEqual({ amal: 'hisob_birlashtir', login: 'eski-login', parol: 'sirli-parol' });
    expect(screen.getByText('Kompaniya № 7')).toBeTruthy();
    expect(toastMock).toHaveBeenCalledWith('Hisoblar birlashtirildi', 'ok');
  });

  it('LOGIN_PAROL_XATO xabari ko‘rsatiladi, xulosa yo‘q', async () => {
    fetchMock(() => ({ status: 401, body: { ok: false, code: 'LOGIN_PAROL_XATO' } }));
    chiz(<BirlashtirKarta profil={PROFIL} />);
    toldir();
    await waitFor(() => expect(screen.getByText('Login yoki parol noto‘g‘ri.')).toBeTruthy());
    expect(screen.queryByTestId('birlashtirish-xulosa')).toBeNull();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('tasdiq rad etilsa — so‘rov ketmaydi', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { chaqiruvlar } = fetchMock(() => ({ body: { ok: true } }));
    chiz(<BirlashtirKarta profil={PROFIL} />);
    toldir();
    await new Promise((r) => setTimeout(r, 10));
    expect(chaqiruvlar.some((c) => c.init?.method === 'POST')).toBe(false);
  });

  it('rolElementi: satr yoki {rol}', () => {
    expect(rolElementi('boss')).toBe('boss');
    expect(rolElementi({ rol: 'pto' })).toBe('pto');
    expect(rolElementi(null)).toBeNull();
  });
});
