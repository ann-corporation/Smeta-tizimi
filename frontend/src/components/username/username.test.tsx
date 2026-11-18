import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('../../umumiy/ui/Toast', () => ({ toast: toastMock }));
import { _tilniTestdaQoy } from '../../i18n/til';
import { UsernameKarta } from './UsernameKarta';
import { DEBOUNCE_MS, KEYINROQ_KALIT } from '../../lib/username/username';
import { OdamTaklifForma } from './OdamTaklifForma';
import { KelganTakliflar } from './KelganTakliflar';
import { UsernameTaklifBanner } from './UsernameTaklifBanner';

type Javob = { status?: number; body: unknown };
function tarmoq(h: (url: string, body: Record<string, unknown>) => Javob) {
  const chaqiruvlar: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    chaqiruvlar.push({ url, body });
    const j = h(url, body); const status = j.status ?? 200;
    return { ok: status < 300, status, json: async () => j.body } as Response;
  }));
  return chaqiruvlar;
}
const OL = { ok: true, username: null, ism: 'Alisher Navoiy', telefon_qidiruv: 'hammasi', bugun_qoldi: 5 };

beforeEach(() => { toastMock.mockClear(); _tilniTestdaQoy('uz'); vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* */ } });
const kutish = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('UsernameKarta', () => {
  it('jonli tekshiruv: bo‘sh bo‘lsa «Bo‘sh», saqlash yoqiladi va RPC ga normallashgan nom ketadi', async () => {
    const c = tarmoq((url, b) => {
      if (b.amal === 'username_ol') return { body: OL };
      if (b.amal === 'username_tekshir') return { body: { ok: true, yaroqli: true, sabab: null, bosh: true, band: false, variantlar: [] } };
      if (b.amal === 'username_belgila') return { body: { ok: true, username: 'alisher_navoiy' } };
      return { status: 404, body: { ok: false } };
    });
    render(<UsernameKarta ism="Alisher Navoiy" />);
    await kutish(10);
    const inp = screen.getByLabelText('Username') as HTMLInputElement;
    fireEvent.change(inp, { target: { value: 'Alisher_Navoiy' } });
    expect((screen.getByRole('button', { name: 'Username’ni saqlash' }) as HTMLButtonElement).disabled).toBe(true);
    await kutish(DEBOUNCE_MS + 50);
    await waitFor(() => expect(screen.getByText('Bo‘sh — olishingiz mumkin')).toBeTruthy());
    expect(c.find((x) => x.body.amal === 'username_tekshir')!.body.username).toBe('alisher_navoiy');
    const saqla = screen.getByRole('button', { name: 'Username’ni saqlash' }) as HTMLButtonElement;
    expect(saqla.disabled).toBe(false);
    fireEvent.click(saqla);
    await waitFor(() => expect(c.some((x) => x.body.amal === 'username_belgila' && x.body.username === 'alisher_navoiy')).toBe(true));
  });

  it('yaroqsiz format serverga so‘ramasdan darhol xabar beradi', async () => {
    const c = tarmoq((_u, b) => (b.amal === 'username_ol' ? { body: OL } : { body: { ok: true } }));
    render(<UsernameKarta ism="A" />);
    await kutish(10);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ab' } });
    await kutish(DEBOUNCE_MS + 50);
    expect(screen.getByText('Username kamida 5 belgi bo‘lsin.')).toBeTruthy();
    expect(c.some((x) => x.body.amal === 'username_tekshir')).toBe(false);
  });

  it('band bo‘lsa — xabar va serverdan kelgan takliflar tugmalari; tugma maydonni to‘ldiradi', async () => {
    tarmoq((_u, b) => {
      if (b.amal === 'username_ol') return { body: OL };
      if (b.amal === 'username_tekshir') return { body: { ok: true, yaroqli: true, sabab: null, bosh: false, band: true, variantlar: ['alisher_navoiy_1'] } };
      return { body: { ok: true } };
    });
    render(<UsernameKarta ism="Alisher Navoiy" />);
    await kutish(10);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alisher_navoiy' } });
    await kutish(DEBOUNCE_MS + 50);
    await waitFor(() => expect(screen.getByText('Bu username band.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '@alisher_navoiy_1' }));
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('alisher_navoiy_1');
  });

  it('bo‘sh maydonda ismdan takliflar ko‘rinadi; sozlama o‘zgarsa RPC chaqiriladi', async () => {
    const c = tarmoq((_u, b) => (b.amal === 'username_ol' ? { body: OL } : b.amal === 'username_sozlama' ? { body: { ok: true, telefon_qidiruv: 'hech' } } : { body: { ok: true } }));
    render(<UsernameKarta ism="Alisher Navoiy" />);
    await kutish(10);
    expect(screen.getByRole('button', { name: '@alisher_navoiy' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Meni telefon raqami yoki email bo‘yicha kim topa oladi'), { target: { value: 'hech' } });
    await waitFor(() => expect(c.some((x) => x.body.amal === 'username_sozlama' && x.body.telefon_qidiruv === 'hech')).toBe(true));
  });
});

describe('UsernameTaklifBanner (onboarding)', () => {
  it('username bo‘sh → ko‘rinadi; «Keyinroq» → yo‘qoladi va eslab qolinadi', async () => {
    tarmoq((_u, b) => (b.amal === 'username_ol' ? { body: OL } : { body: { ok: true } }));
    render(<UsernameTaklifBanner />);
    await kutish(10);
    expect(await screen.findByText('Username tanlang')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keyinroq' }));
    expect(screen.queryByText('Username tanlang')).toBeNull();
    expect(localStorage.getItem(KEYINROQ_KALIT)).toBe('1');
  });
  it('username bor → hech narsa ko‘rsatilmaydi', async () => {
    tarmoq(() => ({ body: { ...OL, username: 'bor_user' } }));
    render(<UsernameTaklifBanner />);
    await kutish(10);
    expect(screen.queryByText('Username tanlang')).toBeNull();
  });
});

describe('OdamTaklifForma', () => {
  it('@username yozilsa kompaniyadoshlar ro‘yxati (autocomplete) chiqadi; tanlansa maydonga @username tushadi', async () => {
    tarmoq((_u, b) => (b.amal === 'kompaniyadosh_qidir' ? { body: { ok: true, royxat: [{ id: 9, ism: 'Sinov Odam', username: 'sinov_odam', avatar_rang: null }] } } : { body: { ok: true } }));
    render(<OdamTaklifForma kompaniyaId={17} />);
    fireEvent.change(screen.getByLabelText('@username, telefon yoki email'), { target: { value: '@sin' } });
    await kutish(350);
    fireEvent.click(await screen.findByRole('button', { name: /Sinov Odam/ }));
    expect((screen.getByLabelText('@username, telefon yoki email') as HTMLInputElement).value).toBe('@sinov_odam');
  });

  it('turi avtomatik aniqlanadi; telefon/email ko‘rinishida autocomplete so‘ralmaydi', async () => {
    const c = tarmoq(() => ({ body: { ok: true, royxat: [] } }));
    render(<OdamTaklifForma kompaniyaId={17} />);
    const maydon = screen.getByLabelText('@username, telefon yoki email');
    fireEvent.change(maydon, { target: { value: '+998 90 123 45 67' } });
    await kutish(400);
    expect(screen.getByText('Aniqlandi: telefon raqami')).toBeTruthy();
    fireEvent.change(maydon, { target: { value: 'ali@firma.uz' } });
    await kutish(400);
    expect(screen.getByText('Aniqlandi: email')).toBeTruthy();
    expect(c.filter((x) => x.body.amal === 'kompaniyadosh_qidir')).toHaveLength(0);
  });

  it('yuborish: member_invite RPC ga qiymat va rol ketadi, natija ko‘rsatiladi', async () => {
    const c = tarmoq((url) => (url === '/api/company' ? { body: { ok: true, taklif_id: 4, holat: 'kutmoqda', profil: { id: 9, ism: 'Sinov Odam', username: 'sinov_odam', avatar_rang: null } } } : { body: { ok: true, royxat: [] } }));
    render(<OdamTaklifForma kompaniyaId={17} />);
    fireEvent.change(screen.getByLabelText('@username, telefon yoki email'), { target: { value: '@sinov_odam' } });
    fireEvent.change(screen.getByLabelText('Lavozim'), { target: { value: 'pto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taklif yuborish' }));
    await waitFor(() => expect(screen.getByText(/Taklif yuborildi/)).toBeTruthy());
    expect(c.find((x) => x.url === '/api/company')!.body).toMatchObject({ action: 'member_invite', kompaniya_id: 17, qiymat: '@sinov_odam', rol: 'pto' });
  });

  it('telefon bo‘yicha hisob yo‘q → havola/kod taklifi (mavjud kirish-taklif oqimi), kod ko‘rsatiladi', async () => {
    const c = tarmoq((url) => {
      if (url === '/api/company') return { status: 404, body: { ok: false, code: 'TOPILMADI', tur: 'telefon', telefon_taklif: true, telefon: '+998901234567' } };
      if (url === '/api/kirish-taklif') return { body: { ok: true, kod: '12345678', havola: 'https://x.example/taklif/abc', taklif_id: 1 } };
      return { body: { ok: true, royxat: [] } };
    });
    render(<OdamTaklifForma kompaniyaId={17} />);
    fireEvent.change(screen.getByLabelText('@username, telefon yoki email'), { target: { value: '90 123 45 67' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taklif yuborish' }));
    expect(await screen.findByText(/hisob topilmadi/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Ism'), { target: { value: 'Sinov Odam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Havola va kod yaratish' }));
    expect(await screen.findByText('12345678')).toBeTruthy();
    expect(c.find((x) => x.url === '/api/kirish-taklif')!.body).toMatchObject({ amal: 'yarat', kompaniya_id: 17, telefon: '+998901234567', ism: 'Sinov Odam' });
  });

  it('ruxsat yo‘q → xato xabari', async () => {
    tarmoq((url) => (url === '/api/company' ? { status: 403, body: { ok: false, code: 'RUXSAT_YOQ' } } : { body: { ok: true, royxat: [] } }));
    render(<OdamTaklifForma kompaniyaId={17} />);
    fireEvent.change(screen.getByLabelText('@username, telefon yoki email'), { target: { value: '@sinov_odam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taklif yuborish' }));
    expect(await screen.findByText('Odam taklif qilish uchun ruxsatingiz yo‘q.')).toBeTruthy();
  });
});

describe('KelganTakliflar', () => {
  const TAKLIF = { id: 5, kompaniya_id: 17, kompaniya_nom: 'Sinov MChJ', rol: 'prorab', tugaydi: '2027-01-01', taklif_qiluvchi: { id: 3, ism: 'Direktor Sinov', username: 'direktor_sinov', avatar_rang: null } };
  it('taklif ro‘yxati; qabul qilinsa a’zolik yangilanadi (yangila chaqiriladi)', async () => {
    const c = tarmoq((_u, b) => (b.amal === 'taklif_royxat' ? { body: { ok: true, royxat: [TAKLIF] } } : { body: { ok: true, holat: 'qabul', kompaniya_id: 17 } }));
    const yangila = vi.fn();
    render(<KelganTakliflar yangila={yangila} />);
    expect(await screen.findByText('Sinov MChJ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Qabul qilish' }));
    await waitFor(() => expect(yangila).toHaveBeenCalled());
    expect(c.find((x) => x.body.amal === 'taklif_javob')!.body).toMatchObject({ taklif_id: 5, qabul: true });
  });
  it('rad etilsa ro‘yxatdan yo‘qoladi va sahifa yangilanmaydi; taklif bo‘lmasa — hech narsa', async () => {
    tarmoq((_u, b) => (b.amal === 'taklif_royxat' ? { body: { ok: true, royxat: [TAKLIF] } } : { body: { ok: true, holat: 'rad' } }));
    const yangila = vi.fn();
    const { container } = render(<KelganTakliflar yangila={yangila} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rad etish' }));
    await waitFor(() => expect(screen.queryByText('Sinov MChJ')).toBeNull());
    expect(yangila).not.toHaveBeenCalled();
    cleanup();
    tarmoq(() => ({ body: { ok: true, royxat: [] } }));
    const r2 = render(<KelganTakliflar />);
    await kutish(10);
    expect(r2.container.innerHTML).toBe('');
    expect(container).toBeTruthy();
  });
});