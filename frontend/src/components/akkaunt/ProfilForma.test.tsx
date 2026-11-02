import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('../../umumiy/ui/Toast', () => ({ toast: toastMock }));
import { tilOl, _tilniTestdaQoy } from '../../i18n/til';
import { ProfilForma } from './ProfilForma';
import { PROFIL, chiz, fetchMock } from './test-yordam';

beforeEach(() => { toastMock.mockClear(); _tilniTestdaQoy('uz'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); _tilniTestdaQoy('uz'); });

const saqlash = () => screen.getByRole('button', { name: 'Saqlash' }) as HTMLButtonElement;

describe('ProfilForma', () => {
  it('o‘zgarish yo‘q — Saqlash o‘chiq; o‘zgarsa — yoqiladi', () => {
    chiz(<ProfilForma profil={PROFIL} />);
    expect(saqlash().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Ism'), { target: { value: 'Anvar A.' } });
    expect(saqlash().disabled).toBe(false);
    expect(screen.getByText('Saqlanmagan o‘zgarishlar bor')).toBeTruthy();
  });

  it('inline tekshiruv: ism qisqa va telefon noto‘g‘ri bo‘lsa saqlab bo‘lmaydi', () => {
    const { chaqiruvlar } = fetchMock(() => ({ body: { ok: true } }));
    chiz(<ProfilForma profil={PROFIL} />);
    fireEvent.change(screen.getByLabelText('Ism'), { target: { value: 'A' } });
    expect(screen.getByText('Ism 2 dan 80 gacha belgidan iborat bo‘lishi kerak.')).toBeTruthy();
    expect(saqlash().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Ism'), { target: { value: 'Anvar' } });
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '12ab' } });
    expect(screen.getByText(/Telefon raqami noto‘g‘ri/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '123456' } });
    expect(screen.getByText(/Telefon raqami noto‘g‘ri/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '+998 90 123 45 67' } });
    expect(screen.queryByText(/Telefon raqami noto‘g‘ri/)).toBeNull();
    expect(chaqiruvlar.length).toBe(0);
  });

  it('saqlash: faqat o‘zgargan maydonlar API ga ketadi, toast chiqadi, til almashadi', async () => {
    const { chaqiruvlar } = fetchMock((b) => ({ body: { ok: true, profil: { ...PROFIL, ...b, amal: undefined } } }));
    chiz(<ProfilForma profil={PROFIL} />);
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '+998901234567' } });
    fireEvent.change(screen.getByLabelText('Interfeys tili'), { target: { value: 'ru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Firuza' }));
    fireEvent.click(saqlash());
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('Profil saqlandi', 'ok'));
    const c = chaqiruvlar.find((x) => x.init?.method === 'POST')!;
    expect(c.url).toBe('/api/profil');
    expect((c.init!.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(c.init!.credentials).toBe('same-origin');
    expect(c.body).toEqual({ amal: 'yangila', telefon: '+998901234567', til: 'ru', avatar_rang: '#14B8A6' });
    expect(tilOl()).toBe('ru');
  });

  it('server kodi (ISM_NOTOGRI) o‘zbekcha xabar bilan ko‘rsatiladi', async () => {
    fetchMock(() => ({ status: 400, body: { ok: false, code: 'ISM_NOTOGRI' } }));
    chiz(<ProfilForma profil={PROFIL} />);
    fireEvent.change(screen.getByLabelText('Ism'), { target: { value: 'Yangi Ism' } });
    fireEvent.click(saqlash());
    await waitFor(() => expect(screen.getAllByText('Ism 2 dan 80 gacha belgidan iborat bo‘lishi kerak.').length).toBeGreaterThan(0));
    expect(toastMock).not.toHaveBeenCalled();
  });
});
