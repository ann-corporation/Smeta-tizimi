import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Nomzod } from '../../lib/hujjat-paket/nomzod';

const m = vi.hoisted(() => ({ nomzod: vi.fn(), dl: vi.fn() }));
vi.mock('../../api/hujjat-paket', () => ({ paketNomzodOl: m.nomzod, saytYetkazuvchi: () => ({ diskdan: async () => ({ bytes: new Uint8Array([1]), faylNomi: 'a.xlsx' }), yasa: async () => ({ bytes: new Uint8Array([1]), faylNomi: 'b.xlsx' }) }) }));
vi.mock('../../api/t2-token', () => ({ tokenHolatOl: async () => ({ ok: false, error: 'x' }), narxHisob: () => null }));
vi.mock('../../lib/construction-document-control/export/download-helper', () => ({ downloadBlob: m.dl }));
vi.mock('../../lib/hujjat-paket/yigish', () => ({ paketYigish: async () => ({ fayllar: [{ n: {}, bytes: new Uint8Array(), faylNomi: 'x', manba: 'disk' }], xatolar: [] }), paketZipi: () => ({ bytes: new Uint8Array([9]), yollar: [] }), paketExcel: async () => ({ bytes: new Uint8Array([8]), otkazilgan: [] }) }));
import { HujjatPaket } from './HujjatPaket';

const N = (o: Partial<Nomzod>): Nomzod => ({
  kalit: 'f2:1', tur: 'f2', sarlavha: 'F-2 №1', holat: 'tasdiqlangan', loyiha_id: 1, loyiha_nom: 'Loyiha A', shartnoma_id: 7, shartnoma_raqam: '12', obyekt_id: 10, obyekt_nom: 'Obyekt 1',
  oy: '2031-03', akt_id: 1, forma3_id: null, taxminiy: false, takror: false, qator_soni: 10, fayl_id: 5, versiya: 1, bayt: 10, yasash: false, ...o,
});

beforeEach(() => { m.nomzod.mockReset(); m.dl.mockReset(); });

describe('HujjatPaket', () => {
  it('Diskdagi tasdiqlangan sukut bo\'yicha tanlanadi; yasaladigan qoralama belgilansa son va yuklab olish ishlaydi; taxminiy/takror kirmaydi', async () => {
    m.nomzod.mockResolvedValue({ ok: true, kesilgan: false, jami: 4, nomzodlar: [
      N({}), N({ kalit: 'f2:2', sarlavha: 'F-2 №2', holat: 'qoralama', yasash: true, fayl_id: null, versiya: null, obyekt_id: 11, obyekt_nom: 'Obyekt 2' }),
      N({ kalit: 'f2:3', taxminiy: true, holat: 'qoralama' }), N({ kalit: 'f2:4', takror: true, holat: 'qoralama' }),
    ] });
    render(<HujjatPaket kompaniyaId={17} tashkilot="T" />);
    await waitFor(() => expect(screen.getByTestId('paket-son').textContent).toContain('Tanlandi: 1'));
    expect(screen.getByTestId('paket-son').textContent).toContain('Diskdan: 1');
    expect(screen.getByTestId('paket-son').textContent).toContain('Yasaladi: 0');
    expect(screen.getByText(/Qoida bo‘yicha kiritilmaydi/).textContent).toContain('2');
    // ildiz tugun (Loyiha A) belgisi - hammasini tanlaydi (yaroqli 2 ta)
    fireEvent.click(screen.getByLabelText('paket:Loyiha A'));
    expect(screen.getByTestId('paket-son').textContent).toContain('Tanlandi: 2');
    expect(screen.getByTestId('paket-son').textContent).toContain('Yasaladi: 1');
    fireEvent.click(screen.getByRole('button', { name: /Paketni yuklab olish/ }));
    await waitFor(() => expect(m.dl).toHaveBeenCalledTimes(1));
    expect(m.dl.mock.calls[0][1]).toBe('hujjatlar-paketi.zip');
  });

  it('filtr: obyekt tanlansa daraxt va son torayadi; Excel chiqishi', async () => {
    m.nomzod.mockResolvedValue({ ok: true, kesilgan: false, jami: 2, nomzodlar: [N({}), N({ kalit: 'f2:2', sarlavha: 'F-2 №2', obyekt_id: 11, obyekt_nom: 'Obyekt 2' })] });
    render(<HujjatPaket kompaniyaId={17} />);
    await waitFor(() => expect(screen.getByTestId('paket-son').textContent).toContain('Tanlandi: 2'));
    fireEvent.click(screen.getByLabelText('Obyekt 2', { selector: 'input[type=checkbox]' }));
    await waitFor(() => expect(screen.getByTestId('paket-son').textContent).toContain('Tanlandi: 1'));
    fireEvent.change(screen.getByLabelText('Chiqish'), { target: { value: 'excel' } });
    fireEvent.click(screen.getByRole('button', { name: /Paketni yuklab olish/ }));
    await waitFor(() => expect(m.dl.mock.calls[0]?.[1]).toBe('hujjatlar-paketi.xlsx'));
  });

  it('server xatosi ko\'rsatiladi', async () => {
    m.nomzod.mockResolvedValue({ ok: false, xabar: 'RUXSAT_YOQ' });
    render(<HujjatPaket kompaniyaId={17} />);
    expect((await screen.findByRole('alert')).textContent).toContain('RUXSAT_YOQ');
  });
});
