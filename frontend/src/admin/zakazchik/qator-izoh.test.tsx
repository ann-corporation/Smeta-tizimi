import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  toast: vi.fn(), zakazchikObyektlarOl: vi.fn(), taqdimlarOl: vi.fn(), murojaatlarOl: vi.fn(), murojaatYarat: vi.fn(),
  taqdimTafsilotOl: vi.fn(), qatorIzohlariOl: vi.fn(), qatorIzohYoz: vi.fn(), qatorIzohHal: vi.fn(),
}));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5, nom: 'Zakazchik MCHJ', rol: 'boss' } }) }));
vi.mock('../../api/t2-tomon', async (asl) => ({ ...(await asl<typeof import('../../api/t2-tomon')>()), ...m }));

import ObyektPortali from './ObyektPortali';
import TaqdimlarInbox from './TaqdimlarInbox';

const ustama = (o: Record<string, unknown> = {}) => ({ pryamye: 2200, ustamali: 2900, katsiz: 0, narxsiz_qator: 0, podval: { itogo1: 2000, prochie: 100, itogo4: 2700, nds: 200, vsego: 2900 }, ...o });
const obyekt = (o: Record<string, unknown> = {}) => ({
  aloqa_id: 1, qarshi_kompaniya_id: 9, qarshi_nom: 'Sinov Qurilish', qarshi_rol: 'pudratchi', obyekt_id: 3, obyekt_nom: 'Sinov obyekt',
  shartnoma: { raqam: '12', nom: null, summa_bez_nds: 10000, jami_nds_bilan: 11200 },
  f2: { soni: 1, jami: 2200, oxirgi_oy: '2026-09-01', ustama_jami: ustama(), royxat: [{ akt_id: 11, raqam: '1', oy: '2026-09-01', jami: 2200, ustama: ustama({ katsiz: 200 }) }] },
  kutayotgan_taqdim: 0, ...o,
});

beforeEach(() => { Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()); m.murojaatlarOl.mockResolvedValue({ ok: true, natija: [] }); });
afterEach(cleanup);

describe('Obyekt portali: ustamali + ustamasiz + podval + so‘rov', () => {
  it('har akt uchun ikkala raqam, kat noma’lum bo‘lsa taxminiy; podval satrlari rus nomi bilan; koeffitsient yo‘q', async () => {
    m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [obyekt()] });
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [] });
    render(<MemoryRouter initialEntries={['/o/1/3']}><Routes><Route path="/o/:aloqaId/:obyektId" element={<ObyektPortali />} /></Routes></MemoryRouter>);
    await screen.findByText('Sertifikatlangan F2 aktlar');
    expect(screen.getAllByTestId('tomon-ustamali').length).toBeGreaterThanOrEqual(2);       // karta + akt
    expect(screen.getAllByTestId('tomon-ustamasiz')[0].textContent).toMatch(/2\s?200/);
    expect(screen.getByText(/taxminiy/)).toBeTruthy();                                       // katsiz=200
    expect(screen.getByText('Прочие затраты подрядчика')).toBeTruthy();                      // rasmiy podval nomi
    expect(screen.getByText('ВСЕГО (с НДС)')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/koef|marja/i);
  });

  it('o‘zgartirish so‘rovi yuboriladi (turi, obyekt, aloqa)', async () => {
    m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [obyekt()] });
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [] });
    m.murojaatYarat.mockResolvedValue({ ok: true, natija: { id: 1, holat: 'ochiq' } });
    render(<MemoryRouter initialEntries={['/o/1/3']}><Routes><Route path="/o/:aloqaId/:obyektId" element={<ObyektPortali />} /></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByText('Yangi so‘rov'));
    fireEvent.change(screen.getByLabelText('Qisqa sarlavha'), { target: { value: 'Qo‘shimcha ish: parapet' } });
    fireEvent.click(screen.getByText('Yuborish'));
    await waitFor(() => expect(m.murojaatYarat).toHaveBeenCalledTimes(1));
    expect(m.murojaatYarat.mock.calls[0][1]).toMatchObject({ aloqaId: 1, turi: 'ozgartirish_sorovi', sarlavha: 'Qo‘shimcha ish: parapet', obyektId: 3 });
  });
});

describe('Inbox: qator izohi', () => {
  const tafsilot = {
    ok: true, natija: {
      taqdim: { id: 7, aloqa_id: 1, resurs: 'f2', nom: 'Ф-2 № 1', oy: '2026-09-01', summa: 1500, holat: 'yuborilgan', kelgan: true, obyekt_nom: 'Sinov obyekt', taqdim_vaqti: '2026-10-05T10:00:00Z',
        qaror_vaqti: null, qaror_izoh: null, oldingi_taqdim_id: null, snapshot: {}, etuvchi_nom: 'Sinov Qurilish', qabul_qiluvchi_nom: 'Zakazchik MCHJ', taqdim_izoh: null, document_id: null, manba_jadval: 't2_akt', manba_id: 11 },
      qatorlar: [{ akt_qator_id: 101, qator_id: 1, tartib: 1, kod: 'C101', nom: 'Beton B25', birlik: 'м3', tur: 'rs', kat: 'МАТ', hajm: 10, narx: 150, summa: 1500, narx_manba: 'smeta' }],
      qator_jami: 1, qisqartirilgan: false, butunlik_ok: true, hodisalar: [],
    },
  };
  it('buyurtmachi qatorga izoh yozadi (akt_qator_id, aloqa bilan)', async () => {
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [{ id: 7, aloqa_id: 1, resurs: 'f2', nom: 'Ф-2 № 1', oy: '2026-09-01', summa: 1500, holat: 'yuborilgan', kelgan: true, qarshi_nom: 'Sinov Qurilish', obyekt_nom: 'Sinov obyekt', taqdim_vaqti: '2026-10-05T10:00:00Z', qaror_vaqti: null, qaror_izoh: null, oldingi_taqdim_id: null }] });
    m.taqdimTafsilotOl.mockResolvedValue(tafsilot);
    m.qatorIzohlariOl.mockResolvedValue({ ok: true, natija: { izohlar: [] } });
    m.qatorIzohYoz.mockResolvedValue({ ok: true, natija: { id: 1, versiya: 1 } });
    render(<MemoryRouter initialEntries={['/t?id=7']}><Routes><Route path="/t" element={<TaqdimlarInbox />} /></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByText('Izoh', { selector: 'button' }));
    fireEvent.change(await screen.findByPlaceholderText('Shu qator bo‘yicha izoh yozing'), { target: { value: 'Narx yuqori' } });
    fireEvent.click(screen.getByText('Yuborish'));
    await waitFor(() => expect(m.qatorIzohYoz).toHaveBeenCalledTimes(1));
    expect(m.qatorIzohYoz.mock.calls[0][1]).toMatchObject({ aloqaId: 1, aktQatorId: 101, matn: 'Narx yuqori' });
    expect(m.qatorIzohlariOl).toHaveBeenCalledWith(5, 11, 1);
  });
});
