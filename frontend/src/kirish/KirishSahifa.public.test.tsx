import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicEntry, OWNER_PHONE } from '../components/public-entry/PublicEntry';
import { tilQoy } from '../i18n/til';

const m = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...(await original<typeof import('react-router-dom')>()), useNavigate: () => m.navigate }));
vi.mock('./GoogleKirish', () => ({ default: () => null }));
vi.mock('../umumiy/ui/Toast', () => ({ toast: vi.fn() }));
import KirishSahifa from './KirishSahifa';

beforeEach(() => { tilQoy('uz'); m.navigate.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); tilQoy('uz'); });

describe('Public kirish sayti', () => {
  it('haqiqiy telefon, intro va auth form bitta sahifada', () => {
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Hisoblar tartibli.');
    expect(screen.getAllByRole('link').filter(a => a.getAttribute('href') === `tel:${OWNER_PHONE}`).length).toBeGreaterThan(1);
    expect(screen.getByPlaceholderText('foydalanuvchi_nomi')).toBeTruthy();
  });
  it('hero CTA signup formasini tanlaydi', async () => {
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Hisob ochish' }));
    expect(await screen.findByPlaceholderText('F.I.Sh.')).toBeTruthy();
  });
  it('mavjud login API va role yo‘naltirishi saqlangan', async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, rol: 'pto' }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><KirishSahifa /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('foydalanuvchi_nomi'), { target: { value: 'sinov' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'test-password' } });
    fireEvent.submit(screen.getByPlaceholderText('foydalanuvchi_nomi').closest('form')!);
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/admin/test/obyektlar'));
    expect(fetchMock).toHaveBeenCalledWith('/api/kirish', expect.objectContaining({ body: JSON.stringify({ login: 'sinov', parol: 'test-password' }) }));
  });
  it('yordam paneli fake operator yoki message receipt yaratmaydi', () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    render(<PublicEntry onChooseAuth={vi.fn()}><span>Form</span></PublicEntry>);
    fireEvent.click(screen.getByRole('button', { name: 'Yordam' }));
    expect(screen.getByText(/Xabar yuborilmaydi/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yordamni yopish' }));
    expect(screen.queryByText(/Xabar yuborilmaydi/)).toBeNull();
  });
  it.each(['ru', 'en'] as const)('%s intro matnlari shu tilga o‘tadi', til => {
    tilQoy(til); render(<PublicEntry onChooseAuth={vi.fn()}><span>Form</span></PublicEntry>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(til === 'ru' ? 'Порядок в расчётах.' : 'Clear calculations.');
  });
  it('skrinshotlar faqat real asset berilganda chiziladi', () => {
    const { rerender } = render(<PublicEntry onChooseAuth={vi.fn()}><span>Form</span></PublicEntry>);
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<PublicEntry onChooseAuth={vi.fn()} screenshots={[{ src: '/verified-lrv.png', alt: 'LRV ekran', caption: 'LRV' }]}><span>Form</span></PublicEntry>);
    expect(screen.getByRole('img', { name: 'LRV ekran' }).getAttribute('src')).toBe('/verified-lrv.png');
  });
});
