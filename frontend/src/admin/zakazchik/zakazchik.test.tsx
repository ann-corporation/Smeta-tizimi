import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  toast: vi.fn(),
  aloqalarOl: vi.fn(), zakazchikObyektlarOl: vi.fn(), taqdimlarOl: vi.fn(), taqdimTafsilotOl: vi.fn(), taqdimQarori: vi.fn(),
  taklifgaJavob: vi.fn(), resurslarOl: vi.fn(), aloqaTafsilotOl: vi.fn(), kompaniyaQidir: vi.fn(), taklifYubor: vi.fn(), kodBilanQabul: vi.fn(),
}));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5, nom: 'Zakazchik MCHJ', rol: 'boss' } }) }));
vi.mock('../../api/supabase', async (asl) => ({ ...(await asl<typeof import('../../api/supabase')>()), sbT2ObyektlarOlKomp: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-tomon', async (asl) => ({
  ...(await asl<typeof import('../../api/t2-tomon')>()),
  aloqalarOl: m.aloqalarOl, zakazchikObyektlarOl: m.zakazchikObyektlarOl, taqdimlarOl: m.taqdimlarOl, taqdimTafsilotOl: m.taqdimTafsilotOl, taqdimQarori: m.taqdimQarori,
  taklifgaJavob: m.taklifgaJavob, resurslarOl: m.resurslarOl, aloqaTafsilotOl: m.aloqaTafsilotOl, kompaniyaQidir: m.kompaniyaQidir, taklifYubor: m.taklifYubor, kodBilanQabul: m.kodBilanQabul,
}));

import ZakazchikKabinet from './ZakazchikKabinet';
import TaqdimlarInbox from './TaqdimlarInbox';
import TomonlarAloqa from './TomonlarAloqa';

const aloqa = (o: Record<string, unknown> = {}) => ({
  id: 1, holat: 'faol', turi: 'shartnoma', nom: null, men_taklif_qildim: false, men_rol: 'zakazchik', qarshi_rol: 'pudratchi', qarshi_kompaniya_id: 9, qarshi_nom: 'NTB Qurilish',
  qarshi_inn: '301234567', kod_kutilmoqda: false, kod_muddati: null, taklif_vaqti: '2026-10-05T10:00:00Z', javob_vaqti: null, yopish_sababi: null, izoh: null,
  berilgan_grant_soni: 0, olingan_grant_soni: 3, kelgan_ochiq_taqdim: 1, yuborilgan_ochiq_taqdim: 0, ...o,
});
const taqdim = (o: Record<string, unknown> = {}) => ({
  id: 7, aloqa_id: 1, resurs: 'f2', nom: 'Ф-2 № 4', oy: '2026-09-01', summa: 1500, holat: 'yuborilgan', kelgan: true, qarshi_nom: 'NTB Qurilish', obyekt_nom: 'Fast Food',
  taqdim_vaqti: '2026-10-05T10:00:00Z', qaror_vaqti: null, qaror_izoh: null, oldingi_taqdim_id: null, ...o,
});
const tafsilot = (o: Record<string, unknown> = {}, butunlik: boolean | null = true) => ({
  ok: true, natija: {
    taqdim: { ...taqdim(), snapshot: {}, etuvchi_nom: 'NTB Qurilish', qabul_qiluvchi_nom: 'Zakazchik MCHJ', taqdim_izoh: null, document_id: null, ...o },
    qatorlar: [{ qator_id: 1, tartib: 1, kod: 'C101', nom: 'Beton B25', birlik: 'м3', tur: 'rs', kat: 'МАТ', hajm: 10, narx: 150, summa: 1500, narx_manba: 'smeta' }],
    qator_jami: 1, qisqartirilgan: false, butunlik_ok: butunlik, hodisalar: [],
  },
});

beforeEach(() => {
  m.toast.mockReset(); Object.values(m).forEach((f) => { if (f !== m.toast) (f as ReturnType<typeof vi.fn>).mockReset(); });
  m.resurslarOl.mockResolvedValue({ ok: true, natija: [{ kalit: 'f2', nom: 'Forma-2', nom_ru: null, guruh: 'hujjat', amallar: ['korish', 'tafsilot'], taqdim_mumkin: true, izoh: null }] });
});
afterEach(cleanup);

describe('Zakazchik kabineti', () => {
  it('faqat ochilgan ko‘rsatkichlar ko‘rinadi, ochilmaganlari “ochilmagan”', async () => {
    m.aloqalarOl.mockResolvedValue({ ok: true, natija: [aloqa()] });
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim()] });
    m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [
      { aloqa_id: 1, qarshi_kompaniya_id: 9, qarshi_nom: 'NTB Qurilish', qarshi_rol: 'pudratchi', obyekt_id: 3, obyekt_nom: 'Fast Food', shartnoma: null,
        f2: { soni: 2, jami: 2500000, oxirgi_oy: '2026-09-01', royxat: [] }, kutayotgan_taqdim: 1 },
    ] });
    render(<MemoryRouter><ZakazchikKabinet /></MemoryRouter>);
    await screen.findByText('Fast Food');
    expect(screen.getByText('NTB Qurilish — pudratchi')).toBeTruthy();
    expect(screen.getByText('2 / 2 500 000')).toBeTruthy();      // F2 ochilgan
    expect(screen.getAllByText('ochilmagan').length).toBe(1);    // shartnoma grantsiz yashirin
    expect(screen.getByText('Ф-2 № 4')).toBeTruthy();            // qaror kutayotgan hujjat
  });

  it('aloqa yo‘q bo‘lsa — boshlash yo‘riqnomasi', async () => {
    m.aloqalarOl.mockResolvedValue({ ok: true, natija: [] });
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [] });
    m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [] });
    render(<MemoryRouter><ZakazchikKabinet /></MemoryRouter>);
    await screen.findByText(/Hali pudratchi ulanmagan/);
  });

  it('server xatosi ko‘rsatiladi', async () => {
    m.aloqalarOl.mockResolvedValue({ ok: false, error: 'Siz bu kompaniyaning faol a’zosi emassiz' });
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [] });
    m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [] });
    render(<MemoryRouter><ZakazchikKabinet /></MemoryRouter>);
    await screen.findByRole('alert');
  });
});

describe('Taqdimlar (zakazchik qarori)', () => {
  const ochish = async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim()] });
    m.taqdimTafsilotOl.mockResolvedValue(tafsilot());
    render(<MemoryRouter><TaqdimlarInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Ф-2 № 4'));
    await screen.findByText('Beton B25');
  };

  it('rad etish izohsiz yuborilmaydi; izoh bilan — qaror serverga ketadi', async () => {
    await ochish();
    fireEvent.click(screen.getByRole('button', { name: 'Rad etish' }));
    expect(m.taqdimQarori).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('izoh'), 'danger');
    m.taqdimQarori.mockResolvedValue({ ok: true, natija: {} });
    fireEvent.change(screen.getByPlaceholderText(/Izoh yozing/), { target: { value: 'Narx noto‘g‘ri' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rad etish' }));
    await waitFor(() => expect(m.taqdimQarori).toHaveBeenCalledWith(5, 7, 'rad', 'Narx noto‘g‘ri'));
  });

  it('butunlik buzilgan bo‘lsa qabul qilish bloklanadi va ogohlantirish chiqadi', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim()] });
    m.taqdimTafsilotOl.mockResolvedValue(tafsilot({}, false));
    render(<MemoryRouter><TaqdimlarInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Ф-2 № 4'));
    await screen.findByText(/butunlik xeshi mos kelmaydi/);
    expect((screen.getByRole('button', { name: 'Qabul qilish' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('qabul qilingan hujjatda qaror tugmalari yo‘q (qaror o‘zgarmaydi)', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim({ holat: 'qabul' })] });
    m.taqdimTafsilotOl.mockResolvedValue(tafsilot({ holat: 'qabul' }));
    render(<MemoryRouter><TaqdimlarInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Ф-2 № 4'));
    await screen.findByText('Beton B25');
    expect(screen.queryByRole('button', { name: 'Qabul qilish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rad etish' })).toBeNull();
  });
});

describe('Tomonlar aloqasi', () => {
  it('kelgan taklifni qabul qilish', async () => {
    m.aloqalarOl.mockResolvedValue({ ok: true, natija: [aloqa({ id: 11, holat: 'taklif', men_taklif_qildim: false, kod_kutilmoqda: false })] });
    m.taklifgaJavob.mockResolvedValue({ ok: true, natija: {} });
    render(<MemoryRouter><TomonlarAloqa /></MemoryRouter>);
    const bolim = (await screen.findByText('Sizga kelgan takliflar')).closest('section') as HTMLElement;
    fireEvent.click(within(bolim).getByRole('button', { name: 'Qabul qilish' }));
    await waitFor(() => expect(m.taklifgaJavob).toHaveBeenCalledWith(5, 11, 'qabul'));
  });

  it('tizimda topilmagan tomonga taklif: ochiq kod bir marta ko‘rsatiladi', async () => {
    m.aloqalarOl.mockResolvedValue({ ok: true, natija: [] });
    m.kompaniyaQidir.mockResolvedValue({ ok: true, natija: { topildi: false } });
    m.taklifYubor.mockResolvedValue({ ok: true, natija: { id: 1, holat: 'taklif', kod_kerak: true, kod: 'ABCD-EFGH-JKMN' } });
    render(<MemoryRouter><TomonlarAloqa /></MemoryRouter>);
    fireEvent.change(await screen.findByPlaceholderText('301234567'), { target: { value: '301234567' } });
    fireEvent.click(screen.getByRole('button', { name: /Tizimdan izlash/ }));
    fireEvent.change(await screen.findByPlaceholderText(/MCHJ/), { target: { value: 'Yangi MCHJ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taklif yuborish' }));
    await screen.findByText('ABCD-EFGH-JKMN');
    expect(m.taklifYubor).toHaveBeenCalledWith(5, expect.objectContaining({ qabulKompaniyaId: null, qabulNom: 'Yangi MCHJ', taklifRol: 'pudratchi', qabulRol: 'zakazchik' }));
  });
});
