import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RoyxatQator } from '../../lib/hujjat-paket/royxat';

const m = vi.hoisted(() => ({ royxat: vi.fn(), nomzodlar: vi.fn(), dl: vi.fn(), saqla: vi.fn(), filtrlar: vi.fn(), ochir: vi.fn() }));
vi.mock('../../api/hujjat-paket', () => ({
  paketRoyxatOl: m.royxat, tanlanganNomzodlar: m.nomzodlar, filtrSaqla: m.saqla, filtrlarOl: m.filtrlar, filtrOchir: m.ochir, SAHIFA_HAJMI: 50,
  saytYetkazuvchi: () => ({ diskdan: async () => ({ bytes: new Uint8Array([1]), faylNomi: 'a.xlsx' }), yasa: async () => ({ bytes: new Uint8Array([1]), faylNomi: 'b.xlsx' }) }),
}));
vi.mock('../../api/t2-token', () => ({ tokenHolatOl: async () => ({ ok: false, error: 'x' }), narxHisob: () => null }));
vi.mock('../../lib/construction-document-control/export/download-helper', () => ({ downloadBlob: m.dl }));
vi.mock('../../lib/hujjat-paket/yigish', () => ({ paketYigish: async () => ({ fayllar: [{ n: {}, bytes: new Uint8Array(), faylNomi: 'x', manba: 'disk' }], xatolar: [] }), paketZipi: () => ({ bytes: new Uint8Array([9]), yollar: [] }), paketExcel: async () => ({ bytes: new Uint8Array([8]), otkazilgan: [] }) }));
import { HujjatPaket } from './HujjatPaket';

const N = (o: Partial<RoyxatQator>): RoyxatQator => ({
  kalit: 'f2:1', tur: 'f2', sarlavha: 'F-2 №1', holat: 'tasdiqlangan', loyiha_id: 1, loyiha_nom: 'Loyiha A', shartnoma_id: 7, shartnoma_raqam: '12', obyekt_id: 10, obyekt_nom: 'Obyekt 1',
  oy: '2031-03', akt_id: 1, forma3_id: null, taxminiy: false, takror: false, qator_soni: 10, fayl_id: 5, versiya: 5, bayt: 10, yasash: false, yangilandi: new Date(Date.now() - 120_000).toISOString(), ...o,
});
const javob = (nomzodlar: RoyxatQator[]) => ({
  ok: true, nomzodlar, jami: nomzodlar.length, kesilgan: false, barchaKalitlar: nomzodlar.filter((n) => !n.takror).map((n) => n.kalit), offset: 0,
  variantlar: { shartnomalar: [{ id: 7, raqam: '12' }], obyektlar: [{ id: 10, nom: 'Obyekt 1', shartnoma_id: 7 }, { id: 11, nom: 'Obyekt 2', shartnoma_id: 7 }] },
});

beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); m.filtrlar.mockResolvedValue([]); });

describe('HujjatPaket (filtr + ro‘yxat)', () => {
  it('ro‘yxat: obyekt · hujjat · oy · holat · versiya vaqti; yangilanmoqda belgisi; hammasini tanlash va ZIP yuklab olish', async () => {
    const royxat = [N({}), N({ kalit: 'f2:2', sarlavha: 'F-2 №2', holat: 'qoralama', obyekt_nom: 'Obyekt 2', obyekt_id: 11, yangilanmoqda: true }), N({ kalit: 'f2:4', takror: true, holat: 'qoralama' })];
    m.royxat.mockResolvedValue(javob(royxat));
    m.nomzodlar.mockResolvedValue(royxat.slice(0, 2));
    render(<HujjatPaket kompaniyaId={17} tashkilot="T" />);
    await waitFor(() => expect(screen.getByTestId('paket-jami').textContent).toContain('3'));
    expect(screen.getAllByText(/Excel tayyor · v5 · 2 daqiqa oldin/).length).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toContain('yangilanmoqda');
    fireEvent.click(screen.getByText('Hammasini tanlash'));
    expect(screen.getByRole('button', { name: /Yuklab olish \(2\) — ZIP/ })).toBeTruthy(); // takror tanlanmaydi
    fireEvent.click(screen.getByRole('button', { name: /Yuklab olish/ }));
    await waitFor(() => expect(m.dl).toHaveBeenCalledTimes(1));
    expect(m.dl.mock.calls[0][1]).toBe('hujjatlar-paketi.zip');
  });

  it('filtr o‘zgarsa server qayta so‘raladi (server filtri); Excel chiqishi', async () => {
    const royxat = [N({})];
    m.royxat.mockResolvedValue(javob(royxat)); m.nomzodlar.mockResolvedValue(royxat);
    render(<HujjatPaket kompaniyaId={17} />);
    await waitFor(() => expect(m.royxat).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'F-2' })); // tur chip
    await waitFor(() => expect(m.royxat.mock.calls.some((c) => (c[1] as { turlar?: string[] }).turlar?.[0] === 'f2')).toBe(true));
    fireEvent.change(screen.getByLabelText('Shartnoma'), { target: { value: '7' } });
    await waitFor(() => expect(m.royxat.mock.calls.some((c) => (c[1] as { shartnomaIds?: number[] }).shartnomaIds?.[0] === 7)).toBe(true));
    fireEvent.click(screen.getByText('Hammasini tanlash'));
    fireEvent.change(screen.getByLabelText('Chiqish'), { target: { value: 'excel' } });
    fireEvent.click(screen.getByRole('button', { name: /Yuklab olish/ }));
    await waitFor(() => expect(m.dl.mock.calls[0]?.[1]).toBe('hujjatlar-paketi.xlsx'));
  });

  it('obyekt: nom yozib qidiriladi, chip bo‘lib qo‘shiladi va filtrga tushadi', async () => {
    m.royxat.mockResolvedValue(javob([N({})]));
    render(<HujjatPaket kompaniyaId={17} />);
    await waitFor(() => expect(m.royxat).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Obyekt qidirish')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Obyekt qidirish'), { target: { value: 'obyekt 2' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Obyekt 2' }));
    await waitFor(() => expect(m.royxat.mock.calls.some((c) => (c[1] as { obyektIds?: number[] }).obyektIds?.[0] === 11)).toBe(true));
  });

  it('saqlangan filtr: yuklanadi (qo‘llanadi), yangisi saqlanadi, o‘chiriladi', async () => {
    m.royxat.mockResolvedValue(javob([N({})]));
    m.filtrlar.mockResolvedValue([{ id: 3, nom: 'Texnadzor to‘plami', filtr: { turlar: ['f2'], holatlar: ['tasdiqlangan'], oy_dan: '2031-01' } }]);
    m.saqla.mockResolvedValue(true); m.ochir.mockResolvedValue(true);
    render(<HujjatPaket kompaniyaId={17} />);
    fireEvent.click(await screen.findByText('Texnadzor to‘plami'));
    await waitFor(() => expect(m.royxat.mock.calls.some((c) => (c[1] as { oyDan?: string }).oyDan === '2031-01' && (c[1] as { holatlar?: string[] }).holatlar?.[0] === 'tasdiqlangan')).toBe(true));
    fireEvent.change(screen.getByLabelText('Filtr nomi'), { target: { value: 'Yangi' } });
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    await waitFor(() => expect(m.saqla).toHaveBeenCalledWith(17, 'Yangi', expect.objectContaining({ oyDan: '2031-01' })));
    fireEvent.click(screen.getByLabelText('O‘chirish: Texnadzor to‘plami'));
    await waitFor(() => expect(m.ochir).toHaveBeenCalledWith(17, 3));
  });

  it('server xatosi ko‘rsatiladi', async () => {
    m.royxat.mockResolvedValue({ ok: false, xabar: 'RUXSAT_YOQ' });
    render(<HujjatPaket kompaniyaId={17} />);
    expect((await screen.findByRole('alert')).textContent).toContain('RUXSAT_YOQ');
  });
});
