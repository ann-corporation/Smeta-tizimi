import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({
  fakt: vi.fn(async () => ({ ok: true })), daraxt: vi.fn(), tolov: vi.fn(async () => ({ ok: true })), taqdimYubor: vi.fn(async () => ({ ok: true, natija: { id: 1, holat: 'yuborilgan' } })),
  aloqalar: vi.fn(), hujjat: vi.fn(), shartnomalar: vi.fn(), savol: vi.fn(),
}));
vi.mock('../../api/t2-agent-ish', () => ({ kasbSavolOqim: m.savol, tizimYordamSavol: vi.fn() }));
vi.mock('../../lib/jarvis/katalog-kontekst', () => ({ narxSavolimi: () => false, katalogKonteksti: vi.fn(async () => []), vaqtBilan: (p: Promise<unknown>) => p }));
vi.mock('./AiBaho', () => ({ AiBaho: () => null })); vi.mock('./AiHarakatKarta', () => ({ AiHarakatKarta: () => null }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.fakt }));
vi.mock('../../lib/oylik-hujjat/ostatka-slichitelniy', () => ({ daraxtVaHolatOl: m.daraxt }));
vi.mock('../../api/t2-nakopitelniy', () => ({ tolovYoz: m.tolov }));
vi.mock('../../api/t2-tomon', () => ({ aloqalarOl: m.aloqalar, taqdimYubor: m.taqdimYubor, taqdimlarOl: vi.fn(), taqdimQarori: vi.fn(), murojaatTurlariOl: vi.fn(), murojaatYarat: vi.fn() }));
vi.mock('../../api/t2-hujjat-canonical', () => ({ hujjatRoyxatOl: m.hujjat }));
vi.mock('../../api/t2-shartnoma', () => ({ sbT2ShartnomalarOl: m.shartnomalar }));
vi.mock('../../api/t2-zayavka', () => ({ sbZayavkaYoz: vi.fn() })); vi.mock('../../api/t2-arxiv', () => ({ sbArxivla: vi.fn() }));
vi.mock('../../api/t2-lab-sorov', () => ({ sorovYubor: vi.fn() })); vi.mock('../../api/t2-bux-hisob', () => ({ buxDavr: vi.fn() }));
import { AiChat } from './AiChat';
import type { YordamchiUlanish } from './yordamchi/ishlov';

const STATES = [{ id: 101, qator_id: 101, obyekt_id: 11, tur: 'bl', kod: 'КР-5', nom: 'Beton B25 quyish', birlik: 'm3', smeta_hajm: 100, fakt_hajm: 20 }];
const ya = (permissions: string[]): YordamchiUlanish => ({
  sahifalar: [{ yol: '/admin/fakt', nom: 'Fakt kiritish' }], obyektlar: [{ id: 11, nom: 'Amfiteatr' }], joriyObyekt: { id: 11, nom: 'Amfiteatr' }, obyektTanla: () => undefined,
  motor: { obyektId: 11, holat: 'yoq', xato: '', vositalar: null, qoshimcha: () => null } as unknown as YordamchiUlanish['motor'], hujjat: null, sahifaAmallar: [], sahifaAmalBajar: () => undefined,
  amalRuxsat: { permissions, superadmin: false },
} as YordamchiUlanish);
const chiz = (p: string[]) => render(<MemoryRouter><AiChat kompaniyaId={7} kasb={null} sahifa="/admin/fakt" generatsiya={0} yordamchi={ya(p)} /></MemoryRouter>);
const yoz = (s: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: s } }); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); };

beforeEach(() => {
  sessionStorage.clear(); Object.values(m).forEach((f) => f.mockClear());
  m.daraxt.mockResolvedValue({ ok: true, rows: [{ id: 101, raqam: '5' }], states: STATES });
  m.shartnomalar.mockResolvedValue({ ok: true, qatorlar: [{ id: 301, raqam: '12/2026', nom: 'Beton' }] });
  m.aloqalar.mockResolvedValue({ ok: true, natija: [{ id: 5, holat: 'faol', qarshi_nom: 'Buyurtmachi MChJ', qarshi_rol: 'zakazchik' }] });
  m.hujjat.mockResolvedValue({ documents: [{ id: 41, type: 'f2_akt', filename: 'F2 noyabr.xlsx' }] });
});
afterEach(cleanup);

describe('AiChat: niyat -> savol -> ko‘rinish kartasi -> tasdiq -> ijrochi BIR MARTA -> natija', () => {
  it('FAKT: «Amfiteatrda 5-qatorga 12 m3 fakt yoz» — karta, tasdiq, sbFaktYoz bir marta, havola', async () => {
    chiz(['fakt.write']); yoz('Amfiteatrda 5-qatorga 12 m3 fakt yoz');
    const karta = await screen.findByTestId('amal-karta'); expect(karta.getAttribute('data-faza')).toBe('korinish');
    expect(screen.getByText(/yangi jami: 32/)).toBeTruthy();
    expect(m.fakt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Tasdiqlash'));
    await waitFor(() => expect(screen.getByTestId('amal-karta').getAttribute('data-faza')).toBe('bajarildi'));
    expect(m.fakt).toHaveBeenCalledTimes(1);
    expect(m.fakt).toHaveBeenCalledWith(expect.objectContaining({ obyektId: 11, qatorlar: [{ qator_id: 101, hajm: 12 }] }));
    expect(screen.getByText('Natijani ochish')).toBeTruthy();
  });
  it('TOMONGA YUBORISH: «shu F2 ni buyurtmachiga yubor» — karta, tasdiq, taqdimYubor bir marta', async () => {
    chiz(['document.write']); yoz('shu F2 ni buyurtmachiga yubor');
    await screen.findByTestId('amal-karta');
    expect(screen.getAllByText(/Buyurtmachi MChJ/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Tasdiqlash'));
    await waitFor(() => expect(m.taqdimYubor).toHaveBeenCalledTimes(1));
    expect(m.taqdimYubor).toHaveBeenCalledWith(7, 5, 'f2', 41);
  });
  it('TO‘LOV: summa aytilmasa so‘raladi; keyin ikki tasdiq, tolovYoz bir marta', async () => {
    chiz(['financial.write']); yoz('12/2026 shartnomaga tolov kiritish');
    expect(await screen.findByText(/summasi qancha/i)).toBeTruthy();
    expect(m.tolov).not.toHaveBeenCalled();
    yoz('5 mln');
    await screen.findByTestId('amal-karta');
    fireEvent.click(screen.getByText('Tasdiqlash'));
    const ikki = await screen.findByText('Tasdiqlayman');
    expect(m.tolov).not.toHaveBeenCalled();
    fireEvent.click(ikki);
    await waitFor(() => expect(m.tolov).toHaveBeenCalledTimes(1));
    expect(m.tolov).toHaveBeenCalledWith(expect.objectContaining({ shartnomaId: 301, summa: 5_000_000, tur: 'tolov' }));
  });
  it('RUXSAT YO‘Q: sababi tushuntiriladi, hech narsa yozilmaydi', async () => {
    chiz(['fakt.read']); yoz('12/2026 shartnomaga 5 mln tolov kiritish');
    expect(await screen.findByText(/ruxsati yo‘q/)).toBeTruthy();
    expect(m.tolov).not.toHaveBeenCalled();
  });
});