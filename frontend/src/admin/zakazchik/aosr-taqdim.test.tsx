/**
 * Buyurtmachi + texnik nazorat kundalik sikli (АОСР va F2): pudratchi yuboradi → qarshi tomon inboxda ochadi, qabul qiladi yoki
 * izoh bilan qaytaradi → pudratchi o'z ekranida qaytarilganini ko'radi va qayta yuboradi. Fake ma'lumot; server qoidalari
 * (tasdiqlangan faqat qarshi tomon qarori bilan) — supabase/migrations/20261212500000_*.acceptance.sql.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  toast: vi.fn(), aloqalarOl: vi.fn(), taqdimlarOl: vi.fn(), taqdimTafsilotOl: vi.fn(), taqdimQarori: vi.fn(), taqdimYubor: vi.fn(),
}));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5, nom: 'Buyurtmachi MCHJ', rol: 'inspektor' } }) }));
vi.mock('../../api/t2-tomon', async (asl) => ({
  ...(await asl<typeof import('../../api/t2-tomon')>()),
  aloqalarOl: m.aloqalarOl, taqdimlarOl: m.taqdimlarOl, taqdimTafsilotOl: m.taqdimTafsilotOl, taqdimQarori: m.taqdimQarori, taqdimYubor: m.taqdimYubor,
}));

import TaqdimlarInbox from './TaqdimlarInbox';
import { ZakazchigaYuborish } from './ZakazchigaYuborish';
import { taqdimKeshiniTozala, xaritaYasa } from './taqdim-holat-hook';

const taqdim = (o: Record<string, unknown> = {}) => ({
  id: 9, aloqa_id: 1, resurs: 'aosr', nom: 'АОСР № 12 — Armatura plitasi', oy: '2099-01-01', summa: null, holat: 'yuborilgan', kelgan: true, qarshi_nom: 'Pudratchi MCHJ',
  obyekt_nom: 'Test obyekt', taqdim_vaqti: '2099-01-05T10:00:00Z', qaror_vaqti: null, qaror_izoh: null, oldingi_taqdim_id: null, manba_jadval: 't2_aosr', manba_id: 41, ...o,
});
const SNAP = {
  tur: 'aosr', aosr_id: 41, raqam: '12', sana: '2099-01-04', ish_nomi: 'Armatura plitasi', ish_tavsifi: 'Armatura o‘rnatildi', materiallar: 'A500, sertifikat 77',
  komissiya: [{ rol: 'texnadzor', fio: 'Test Fio' }], ish_soni: 3, protokollar: [{ raqam: 'LP-5', sana: '2099-01-03', sinov_turi: 'armatura', natija: 'mos' }],
};
const tafsilot = (o: Record<string, unknown> = {}, butunlik: boolean | null = true) => ({
  ok: true, natija: {
    taqdim: { ...taqdim(), snapshot: SNAP, etuvchi_nom: 'Pudratchi MCHJ', qabul_qiluvchi_nom: 'Buyurtmachi MCHJ', taqdim_izoh: null, document_id: null, ...o },
    qatorlar: [], qator_jami: 0, qisqartirilgan: false, butunlik_ok: butunlik, hodisalar: [],
  },
});
const aloqa = { id: 1, holat: 'faol', turi: 'shartnoma', nom: null, men_rol: 'pudratchi', qarshi_rol: 'zakazchik', qarshi_nom: 'Buyurtmachi MCHJ' };

beforeEach(() => { Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()); taqdimKeshiniTozala(); });
afterEach(cleanup);

describe('Texnadzor / buyurtmachi inboxi: АОСР', () => {
  it('АОСР mazmuni ko‘rinadi; qabul qilish qarorni serverga yuboradi', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim()] });
    m.taqdimTafsilotOl.mockResolvedValue(tafsilot());
    m.taqdimQarori.mockResolvedValue({ ok: true, natija: {} });
    render(<MemoryRouter><TaqdimlarInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByText('АОСР № 12 — Armatura plitasi'));
    const jadval = await screen.findByTestId('aosr-taqdim');
    expect(jadval.textContent).toContain('Armatura o‘rnatildi');
    expect(jadval.textContent).toContain('LP-5');
    expect(jadval.textContent).toContain('texnadzor · Test Fio');
    expect(screen.getByText(/АОСР «tasdiqlangan» bo‘ladi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Qabul qilish' }));
    await waitFor(() => expect(m.taqdimQarori).toHaveBeenCalledWith(5, 9, 'qabul', ''));
  });

  it('tuzatish so‘rash izohsiz o‘tmaydi; izoh bilan — qaytariladi', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim()] });
    m.taqdimTafsilotOl.mockResolvedValue(tafsilot());
    m.taqdimQarori.mockResolvedValue({ ok: true, natija: {} });
    render(<MemoryRouter><TaqdimlarInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByText('АОСР № 12 — Armatura plitasi'));
    await screen.findByTestId('aosr-taqdim');
    fireEvent.click(screen.getByRole('button', { name: 'Tuzatish so‘rash' }));
    expect(m.taqdimQarori).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/Izoh yozing/), { target: { value: 'Sertifikat raqami yo‘q' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tuzatish so‘rash' }));
    await waitFor(() => expect(m.taqdimQarori).toHaveBeenCalledWith(5, 9, 'tuzatish', 'Sertifikat raqami yo‘q'));
  });

  it('akt yuborilgandan keyin o‘zgargan bo‘lsa (butunlik buzilgan) qabul bloklanadi', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim()] });
    m.taqdimTafsilotOl.mockResolvedValue(tafsilot({}, false));
    render(<MemoryRouter><TaqdimlarInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByText('АОСР № 12 — Armatura plitasi'));
    await screen.findByText(/butunlik xeshi mos kelmaydi/);
    expect((screen.getByRole('button', { name: 'Qabul qilish' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('hujjat turi bo‘yicha filtr: F2 / АОСР ajratiladi, ochiqlari sanaladi', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim(), taqdim({ id: 10, resurs: 'f2', nom: 'Ф-2 № 4', manba_jadval: 't2_akt', manba_id: 7 })] });
    render(<MemoryRouter><TaqdimlarInbox /></MemoryRouter>);
    await screen.findByText('Ф-2 № 4');
    fireEvent.click(within(screen.getByRole('group', { name: 'Hujjat turi' })).getByRole('button', { name: /АОСР/ }));
    expect(screen.queryByText('Ф-2 № 4')).toBeNull();
    expect(screen.getByText('АОСР № 12 — Armatura plitasi')).toBeTruthy();
  });

  it('qabul qilingan АОСР da qaror tugmalari yo‘q (qaror o‘zgarmaydi)', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim({ holat: 'qabul' })] });
    m.taqdimTafsilotOl.mockResolvedValue(tafsilot({ holat: 'qabul' }));
    render(<MemoryRouter><TaqdimlarInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByText('АОСР № 12 — Armatura plitasi'));
    await screen.findByTestId('aosr-taqdim');
    expect(screen.queryByRole('button', { name: 'Qabul qilish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tuzatish so‘rash' })).toBeNull();
  });
});

describe('Pudratchi: АОСР ni yuborish va qaytarilganini ko‘rish', () => {
  const korsat = () => render(<MemoryRouter><ZakazchigaYuborish kompaniyaId={5} aktId={41} resurs="aosr" /></MemoryRouter>);

  it('yuborilmagan АОСР: tugma → aloqa tanlanadi → resurs «aosr» bilan yuboriladi', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [] });
    m.aloqalarOl.mockResolvedValue({ ok: true, natija: [aloqa] });
    m.taqdimYubor.mockResolvedValue({ ok: true, natija: { id: 3, holat: 'yuborilgan' } });
    korsat();
    fireEvent.click(await screen.findByRole('button', { name: /Zakazchikka yuborish/ }));
    await screen.findByRole('dialog');
    fireEvent.click(await screen.findByRole('button', { name: 'Yuborish' }));
    await waitFor(() => expect(m.taqdimYubor).toHaveBeenCalledWith(5, 1, 'aosr', 41, ''));
  });

  it('texnadzor tuzatishga qaytargan: izoh ko‘rinadi, havola taqdimga olib boradi, «Qayta yuborish» bor', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim({ holat: 'tuzatish', kelgan: false, qaror_izoh: 'Sertifikat raqami yo‘q' })] });
    korsat();
    await screen.findByText(/Qaytardi: Sertifikat raqami yo‘q/);
    expect(screen.getByRole('button', { name: /Qayta yuborish/ })).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/admin/taqdimlar?id=9&yonalish=yuborilgan');
  });

  it('qaror kutilayotgan yoki qabul qilingan akt qayta yuborilmaydi (faqat holat belgisi)', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim({ holat: 'ko_rilmoqda', kelgan: false })] });
    const { unmount } = korsat();
    await screen.findByRole('link');
    expect(screen.queryByRole('button')).toBeNull();
    unmount(); taqdimKeshiniTozala();
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim({ holat: 'qabul', kelgan: false })] });
    korsat();
    await screen.findByRole('link');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('F2 uchun xuddi shu komponent (aktlar jadvali bo‘yicha) ishlaydi', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim({ id: 4, resurs: 'f2', manba_jadval: 't2_akt', manba_id: 41, holat: 'rad', kelgan: false, qaror_izoh: 'Narx xato' })] });
    render(<MemoryRouter><ZakazchigaYuborish kompaniyaId={5} aktId={41} /></MemoryRouter>);
    await screen.findByText(/Qaytardi: Narx xato/);
  });
});

describe('xaritaYasa', () => {
  it('har hujjat uchun eng yangi taqdim olinadi; manbasiz yozuv tashlanadi', () => {
    const x = xaritaYasa([taqdim({ id: 3, holat: 'tuzatish' }), taqdim({ id: 8, holat: 'yuborilgan' }), taqdim({ id: 2, manba_jadval: undefined })] as never);
    expect(x.size).toBe(1);
    expect(x.get('t2_aosr:41')?.id).toBe(8);
  });
});
