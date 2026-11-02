import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('../../umumiy/ui/Toast', () => ({ toast: toastMock }));
import { _tilniTestdaQoy } from '../../i18n/til';
import { GoogleKarta, ParolForma, SessiyaKarta } from './XavfsizlikKartalar';
import { PROFIL, chiz, fetchMock } from './test-yordam';

beforeEach(() => { toastMock.mockClear(); _tilniTestdaQoy('uz'); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const yubor = () => screen.getByRole('button', { name: 'Parolni yangilash' }) as HTMLButtonElement;

describe('ParolForma', () => {
  it('takror mos kelmasa — xabar va tugma o‘chiq', () => {
    chiz(<ParolForma parolBor />);
    fireEvent.change(screen.getByLabelText('Joriy parol'), { target: { value: 'eski-parol-1' } });
    fireEvent.change(screen.getByLabelText('Yangi parol'), { target: { value: 'Yangi-parol-77' } });
    fireEvent.change(screen.getByLabelText('Yangi parolni takrorlang'), { target: { value: 'boshqa' } });
    expect(screen.getByText('Parollar mos kelmayapti')).toBeTruthy();
    expect(yubor().disabled).toBe(true);
  });

  it('muvaffaqiyat: API chaqiriladi, toast chiqadi, maydonlar tozalanadi', async () => {
    const { chaqiruvlar } = fetchMock(() => ({ body: { ok: true } }));
    chiz(<ParolForma parolBor />);
    const eski = screen.getByLabelText('Joriy parol') as HTMLInputElement;
    const yangi = screen.getByLabelText('Yangi parol') as HTMLInputElement;
    const takror = screen.getByLabelText('Yangi parolni takrorlang') as HTMLInputElement;
    fireEvent.change(eski, { target: { value: 'eski-parol-1' } });
    fireEvent.change(yangi, { target: { value: 'Yangi-parol-77' } });
    fireEvent.change(takror, { target: { value: 'Yangi-parol-77' } });
    fireEvent.click(yubor());
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi.', 'ok'));
    expect(chaqiruvlar.find((c) => c.init?.method === 'POST')!.body).toEqual({ amal: 'parol', eski: 'eski-parol-1', yangi: 'Yangi-parol-77' });
    expect(eski.value).toBe('');
    expect(yangi.value).toBe('');
    expect(takror.value).toBe('');
  });

  it('parol yo‘q akkaunt: «Parol o‘rnatish», joriy parol maydoni yo‘q, eski yuborilmaydi', async () => {
    const { chaqiruvlar } = fetchMock(() => ({ body: { ok: true } }));
    chiz(<ParolForma parolBor={false} />);
    expect(screen.queryByLabelText('Joriy parol')).toBeNull();
    expect(screen.getAllByText('Parol o‘rnatish').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Yangi parol'), { target: { value: 'Yangi-parol-77' } });
    fireEvent.change(screen.getByLabelText('Yangi parolni takrorlang'), { target: { value: 'Yangi-parol-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Parolni o‘rnatish' }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(chaqiruvlar.find((c) => c.init?.method === 'POST')!.body).toEqual({ amal: 'parol', yangi: 'Yangi-parol-77' });
  });

  it('ESKI_PAROL_XATO va KOP_URINISH (429) xabarlari', async () => {
    let kod = 'ESKI_PAROL_XATO';
    fetchMock(() => (kod === 'KOP_URINISH' ? { status: 429, body: { ok: false } } : { status: 400, body: { ok: false, code: kod } }));
    chiz(<ParolForma parolBor />);
    fireEvent.change(screen.getByLabelText('Joriy parol'), { target: { value: 'xato-parol-1' } });
    fireEvent.change(screen.getByLabelText('Yangi parol'), { target: { value: 'Yangi-parol-77' } });
    fireEvent.change(screen.getByLabelText('Yangi parolni takrorlang'), { target: { value: 'Yangi-parol-77' } });
    fireEvent.click(yubor());
    await waitFor(() => expect(screen.getByText('Joriy parol noto‘g‘ri.')).toBeTruthy());
    kod = 'KOP_URINISH';
    fireEvent.change(screen.getByLabelText('Joriy parol'), { target: { value: 'xato-parol-2' } });
    fireEvent.click(yubor());
    await waitFor(() => expect(screen.getByText(/Juda ko‘p urinish bo‘ldi/)).toBeTruthy());
    expect(yubor().disabled).toBe(true);
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe('SessiyaKarta va GoogleKarta', () => {
  it('boshqa sessiyalardan chiqish: tasdiqdan keyin API', async () => {
    const { chaqiruvlar } = fetchMock(() => ({ body: { ok: true } }));
    chiz(<SessiyaKarta sessiya={{ boshlangan: '2026-10-01T00:00:00Z', tugaydi: '2026-11-01T00:00:00Z' }} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Boshqa barcha qurilmalardan chiqish' }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(chaqiruvlar.find((c) => c.init?.method === 'POST')!.body).toEqual({ amal: 'boshqa_sessiyalar_chiqish' });
  });

  it('Google: parolsiz ulangan — uzish o‘chiq; parol bor — uzadi', async () => {
    const { chaqiruvlar } = fetchMock(() => ({ body: { ok: true } }));
    const { rerender, qc } = chiz(<GoogleKarta profil={{ ...PROFIL, google_ulangan: true, parol_bor: false }} />);
    expect((screen.getByRole('button', { name: 'Google’ni uzish' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/avval parol o‘rnating/)).toBeTruthy();
    cleanup();
    chiz(<GoogleKarta profil={{ ...PROFIL, google_ulangan: true, parol_bor: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google’ni uzish' }));
    await waitFor(() => expect(chaqiruvlar.some((c) => c.body?.amal === 'google_uzish')).toBe(true));
    void rerender; void qc;
  });
});
