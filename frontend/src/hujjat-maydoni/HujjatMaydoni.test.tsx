import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({
  kompaniya: { joriy: null as { id: number; nom: string } | null, superadmin: false },
  royxat: vi.fn(), ulashilgan: vi.fn(), faoliyat: vi.fn(), registryJoy: vi.fn(), papka: vi.fn(), taqdimRoyxat: vi.fn(),
}));
vi.mock('../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => m.kompaniya }));
vi.mock('../api/t2-hujjat-maydoni', async (orig) => ({
  ...(await orig<object>()),
  hmRoyxat: m.royxat, hmUlashilgan: m.ulashilgan, hmFaoliyat: m.faoliyat, hmRegistryJoy: m.registryJoy, hmPapka: m.papka,
  hmVersiyalar: async () => ({ ok: true, versiyalar: [{ raqam: 2, bayt: 2000, mime: 'x', yaratildi: '2026-11-18T10:00:00Z', kim: 'Ali', joriy: true }, { raqam: 1, bayt: 1000, mime: 'x', yaratildi: '2026-11-10T10:00:00Z', kim: 'Ali', joriy: false }] }),
  hmOdamlar: async () => ({ ok: true, royxat: [] }), hmIzohlar: async () => ({ ok: true, izohlar: [] }),
}));
vi.mock('../api/t2-hujjat-maydoni-2', async (orig) => ({ ...(await orig<object>()), hmTaqdimRoyxat: m.taqdimRoyxat, hmTaqdimTafsilot: vi.fn(), hmTaqdimNishon: vi.fn() }));
vi.mock('../admin/sahifalar/R2DublikatPanel', () => ({ R2DublikatPanel: () => <div data-testid="r2-dublikat">R2 dublikatlar</div> }));
vi.mock('../admin/sahifalar/DbHajmPanel', () => ({ DbHajmPanel: () => <div data-testid="db-hajm">DB hajmi. Tungi arxiv: oxirgi ish</div> }));
vi.mock('./AdminPanel', () => ({ AdminPanel: () => <div data-testid="admin-panel">Disk hajmi</div> }));
import HujjatMaydoni from './HujjatMaydoni';

const kvota = { ishlatilgan: 10, limit: 1000, chegara: 0.8, ortiqcha: false, foiz: 1 };
const royxat = (o: Record<string, unknown> = {}) => ({ ok: true, daraja: 5, kompaniya_id: 17, shaxsiy: false, yol: [], papkalar: [], fayllar: [], kvota, ...o });
const fayl = (o: Record<string, unknown> = {}) => ({ id: 1, nom: 'a.xlsx', mime: 'x', bayt: 100, versiya: 1, yangilandi: '2026-11-18T10:00:00Z', savatda: null, qulf_kim: null, qulf_ism: null, izohlar: 0, ...o });
const korsat = (url = '/admin/documents') => render(<MemoryRouter initialEntries={[url]}><HujjatMaydoni /></MemoryRouter>);
const tabNomlari = () => within(screen.getByRole('tablist', { name: 'Bo‘limlar' })).getAllByRole('tab').map((x) => x.textContent);

beforeEach(() => {
  m.kompaniya.joriy = { id: 17, nom: 'NEW TIMES' }; m.kompaniya.superadmin = false;
  m.royxat.mockResolvedValue(royxat()); m.ulashilgan.mockResolvedValue({ ok: true, royxat: [] }); m.faoliyat.mockResolvedValue({ ok: true, royxat: [] });
  m.taqdimRoyxat.mockResolvedValue({ ok: true, royxat: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Disk A3: tablar', () => {
  it('kompaniya bor: FAQAT Mening diskim | Kompaniya diski | Ulashilgan | Savat', async () => {
    korsat();
    await screen.findByRole('tablist', { name: 'Bo‘limlar' });
    expect(tabNomlari()).toEqual(['Mening diskim', 'Kompaniya diski', 'Ulashilgan', 'Savat']);
    for (const eski of ['Tizim hujjatlari', 'Taqdimlar', 'Faoliyat', 'Disk boshqaruvi']) expect(screen.queryByRole('tab', { name: eski })).toBeNull();
  });

  it('kompaniyasiz foydalanuvchi: faqat Mening diskim | Ulashilgan | Savat (kompaniya diski tabi yo‘q)', async () => {
    m.kompaniya.joriy = null;
    korsat();
    await screen.findByRole('tablist', { name: 'Bo‘limlar' });
    expect(tabNomlari()).toEqual(['Mening diskim', 'Ulashilgan', 'Savat']);
    expect(screen.queryByRole('tab', { name: 'Kompaniya diski' })).toBeNull();
    // shaxsiy ro'yxat kompaniyasiz so'raladi
    await waitFor(() => expect(m.royxat).toHaveBeenCalledWith({ kompaniyaId: null, papkaId: null, savat: false }));
  });

  it('Ulashilgan ichida: Menga ulashilgan / Men taqdim qilganlar / Menga taqdim qilinganlar (taqdimlar shu yerga ko‘chdi)', async () => {
    korsat();
    fireEvent.click(await screen.findByRole('tab', { name: 'Ulashilgan' }));
    const kichik = await screen.findByRole('tablist', { name: 'Ulashilgan bo‘limlari' });
    expect(within(kichik).getAllByRole('tab').map((x) => x.textContent)).toEqual(['Menga ulashilgan', 'Men taqdim qilganlar', 'Menga taqdim qilinganlar']);
    fireEvent.click(within(kichik).getByRole('tab', { name: 'Men taqdim qilganlar' }));
    await waitFor(() => expect(m.taqdimRoyxat).toHaveBeenCalledWith(17, 'yuborilgan'));
    fireEvent.click(within(kichik).getByRole('tab', { name: 'Menga taqdim qilinganlar' }));
    await waitFor(() => expect(m.taqdimRoyxat).toHaveBeenCalledWith(17, 'kelgan'));
  });

  it('kompaniyasiz: Ulashilgan da faqat «Menga ulashilgan» (taqdim kompaniya fayllari uchun)', async () => {
    m.kompaniya.joriy = null;
    korsat();
    fireEvent.click(await screen.findByRole('tab', { name: 'Ulashilgan' }));
    expect(await screen.findByText('Hali hech kim fayl ulashmagan.')).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Ulashilgan bo‘limlari' })).toBeNull();
  });
});

describe('Disk A3: ⚙ menyu - Faoliyat va Boshqaruv', () => {
  it('Faoliyat va Boshqaruv ⚙ menyuda; Boshqaruv ichida AdminPanel', async () => {
    korsat();
    await screen.findByRole('tablist', { name: 'Bo‘limlar' });
    fireEvent.click(screen.getByRole('button', { name: 'Disk sozlamalari' }));
    const menyu = screen.getByRole('menu');
    expect(within(menyu).getAllByRole('menuitem').map((x) => x.textContent)).toEqual(['Faoliyat', 'Boshqaruv']);
    fireEvent.click(within(menyu).getByRole('menuitem', { name: 'Boshqaruv' }));
    expect(await screen.findByTestId('admin-panel')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Diskka qaytish/ }));
    expect(await screen.findByRole('tablist', { name: 'Bo‘limlar' })).toBeTruthy();
  });

  it('Faoliyat menyudan ochiladi (tab emas)', async () => {
    m.faoliyat.mockResolvedValue({ ok: true, royxat: [{ id: 1, amal: 'yuklandi', tafsilot: 'x.pdf', vaqt: '2026-11-18T10:00:00Z', fayl_id: 1, ism: 'Ali' }] });
    korsat();
    await screen.findByRole('tablist', { name: 'Bo‘limlar' });
    fireEvent.click(screen.getByRole('button', { name: 'Disk sozlamalari' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Faoliyat' }));
    expect(await screen.findByText(/Yuklandi: x\.pdf/)).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Bo‘limlar' })).toBeNull();
  });

  it('R2 dublikatlar, DB hajmi va Tungi arxiv: oddiy ko‘rinishda va boshqaruvchi rolida DOM da UMUMAN yo‘q', async () => {
    korsat();
    await screen.findByRole('tablist', { name: 'Bo‘limlar' });
    expect(screen.queryByTestId('r2-dublikat')).toBeNull(); expect(screen.queryByTestId('db-hajm')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Tungi arxiv|R2 dublikat/);
    fireEvent.click(screen.getByRole('button', { name: 'Disk sozlamalari' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Boshqaruv' }));
    expect(await screen.findByTestId('admin-panel')).toBeTruthy();
    expect(screen.queryByTestId('r2-dublikat')).toBeNull(); expect(screen.queryByTestId('db-hajm')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Tungi arxiv|R2 dublikat|Platforma tashxisi/);
  });

  it('superadmin: bloklar FAQAT Boshqaruv ichida chiqadi (asosiy ko‘rinishda yo‘q)', async () => {
    m.kompaniya.superadmin = true;
    korsat();
    await screen.findByRole('tablist', { name: 'Bo‘limlar' });
    expect(screen.queryByTestId('r2-dublikat')).toBeNull(); expect(screen.queryByTestId('db-hajm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Disk sozlamalari' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Boshqaruv' }));
    expect(await screen.findByTestId('r2-dublikat')).toBeTruthy();
    expect(screen.getByTestId('db-hajm').textContent).toMatch(/Tungi arxiv/);
  });
});

describe('Disk A3: Kompaniya diski - tizim papkalari va tizim fayllari', () => {
  const tizimDaraxt = () => royxat({
    papkalar: [{ id: 9, nom: 'Mening papkam' }, { id: 5, nom: 'Navoiy bog‘', tizim: true }, { id: 6, nom: 'Biriktirilmagan', tizim: true }],
    fayllar: [fayl({ id: 3, nom: 'oddiy.pdf' })],
  });

  it('tizim papkalari 🔒 belgili, birinchi turadi, o‘chirish tugmasi YO‘Q; foydalanuvchi papkasida bor; «Fayl qo‘shish» bor', async () => {
    m.royxat.mockImplementation(async (p: { kompaniyaId?: number | null }) => (p.kompaniyaId ? tizimDaraxt() : royxat()));
    korsat();
    fireEvent.click(await screen.findByRole('tab', { name: 'Kompaniya diski' }));
    await screen.findByText('Navoiy bog‘');
    const qatorlar = screen.getAllByRole('row').filter((r) => r.querySelector('td button svg') && /Navoiy|Biriktirilmagan|Mening papkam/.test(r.textContent ?? ''));
    expect(qatorlar.map((r) => r.textContent?.trim())).toEqual(['Biriktirilmagan', 'Navoiy bog‘', 'Mening papkam']);
    expect(screen.getAllByTestId('tizim-papka-belgi')).toHaveLength(2);
    const sat = (nom: string) => screen.getByText(nom).closest('tr') as HTMLElement;
    expect(within(sat('Navoiy bog‘')).queryByRole('button', { name: 'Papkani o‘chirish' })).toBeNull();
    expect(within(sat('Biriktirilmagan')).queryByRole('button', { name: 'Papkani o‘chirish' })).toBeNull();
    expect(within(sat('Mening papkam')).getByRole('button', { name: 'Papkani o‘chirish' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Fayl qo‘shish/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Papkani ZIP/ })).toBeTruthy();
  });

  it('Mening diskimda «tizim» belgisi va ZIP yo‘q; yuklash tugmasi «Yuklash»', async () => {
    korsat();
    await screen.findByRole('tablist', { name: 'Bo‘limlar' });
    await screen.findByRole('button', { name: /Yuklash/ });
    expect(screen.queryByRole('button', { name: /Fayl qo‘shish/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Papkani ZIP/ })).toBeNull();
  });

  it('bo‘sh kompaniya diski: tushunarli matn; yuklanish skeleton; xato matni va «Qayta urinish»', async () => {
    m.royxat.mockImplementation(async (p: { kompaniyaId?: number | null }) => (p.kompaniyaId ? royxat() : royxat()));
    korsat();
    fireEvent.click(await screen.findByRole('tab', { name: 'Kompaniya diski' }));
    expect(await screen.findByText(/Kompaniya diski hali bo‘sh\. F-2, F-3/)).toBeTruthy();
    cleanup();
    m.royxat.mockResolvedValue({ ok: false, code: 'TARMOQ' });
    korsat();
    expect(await screen.findByText('Aloqa xatosi. Internetni tekshirib, qayta urinib ko‘ring.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Qayta urinish' })).toBeTruthy();
  });

  it('skeleton: ma’lumot kelguncha jadval o‘rniga yuklanish holati', async () => {
    m.royxat.mockImplementation(() => new Promise(() => {}));
    korsat();
    expect(await screen.findByRole('status', { name: 'Yuklanmoqda…' })).toBeTruthy();
  });

  it('tizim fayli: «tizim» belgisi, panelda «Tizimda ochish» (F-2 tayyorlash) va versiyalar paneli', async () => {
    m.royxat.mockImplementation(async (p: { kompaniyaId?: number | null }) => (p.kompaniyaId ? royxat({ fayllar: [fayl({ id: 7, nom: 'F-2 №5 — Fast Food 1-qavat — 2026-11', versiya: 2, tizim_hujjat: true, manba_turi: 'f2', manba_id: 41, obyekt_id: 80, hujjat_kalit: 'f2:41' })] }) : royxat()));
    korsat();
    fireEvent.click(await screen.findByRole('tab', { name: 'Kompaniya diski' }));
    const nomTugma = await screen.findByText('F-2 №5 — Fast Food 1-qavat — 2026-11');
    expect(screen.getByText('tizim')).toBeTruthy();
    fireEvent.click(nomTugma);
    const havola = await screen.findByRole('link', { name: /Tizimda ochish/ });
    expect(havola.getAttribute('href')).toBe('/admin/f2-tayyorlash?obyekt=80&akt=41');
    expect(await screen.findByText('joriy')).toBeTruthy();
  });

  it('oddiy fayl uchun «Tizimda ochish» yo‘q', async () => {
    m.royxat.mockImplementation(async (p: { kompaniyaId?: number | null }) => (p.kompaniyaId ? royxat({ fayllar: [fayl({ id: 8, nom: 'oddiy.docx' })] }) : royxat()));
    korsat();
    fireEvent.click(await screen.findByRole('tab', { name: 'Kompaniya diski' }));
    fireEvent.click(await screen.findByText('oddiy.docx'));
    await screen.findByText('joriy');
    expect(screen.queryByRole('link', { name: /Tizimda ochish/ })).toBeNull();
  });
});

describe('Disk A3: eski /admin/documents?document_id= havolasi', () => {
  it('hujjat joylashgan papkani ochadi va faylni tanlaydi', async () => {
    m.registryJoy.mockResolvedValue({ ok: true, fayl_id: 7, papka_id: 55, kompaniya_id: 17, savatda: false, nom: 'F-2' });
    m.royxat.mockImplementation(async (p: { kompaniyaId?: number | null; papkaId?: number | null }) => (p.kompaniyaId && p.papkaId === 55
      ? royxat({ yol: [{ id: 5, nom: 'Navoiy bog‘', tizim: true }, { id: 55, nom: '2026-11', tizim: true }], fayllar: [fayl({ id: 7, nom: 'F-2 №5 — 2026-11', tizim_hujjat: true, manba_turi: 'f2', manba_id: 41, obyekt_id: 80 })] })
      : royxat()));
    korsat('/admin/documents?document_id=321');
    await waitFor(() => expect(m.registryJoy).toHaveBeenCalledWith(321));
    expect(await screen.findByRole('complementary', { name: 'Fayl tafsilotlari' })).toBeTruthy();
    expect(m.royxat).toHaveBeenCalledWith({ kompaniyaId: 17, papkaId: 55, savat: false });
    expect(screen.getByRole('tab', { name: 'Kompaniya diski' }).getAttribute('aria-selected')).toBe('true');
  });

  it('topilmasa yoki ruxsat bo‘lmasa - tushunarli xabar', async () => {
    m.registryJoy.mockResolvedValue({ ok: false, code: 'FAYL_TOPILMADI' });
    korsat('/admin/documents?document_id=999');
    expect(await screen.findByText('Bu hujjat Diskda topilmadi.')).toBeTruthy();
    cleanup();
    m.registryJoy.mockResolvedValue({ ok: false, code: 'RUXSAT_YOQ' });
    korsat('/admin/documents?document_id=998');
    expect(await screen.findByText('Bu hujjatga ruxsatingiz yo‘q.')).toBeTruthy();
  });
});
