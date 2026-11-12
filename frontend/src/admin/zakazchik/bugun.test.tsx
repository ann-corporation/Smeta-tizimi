import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ toast: vi.fn(), bugunOl: vi.fn(), tolovXabarlariOl: vi.fn(), tolovXabarYoz: vi.fn(), tolovXabarBekor: vi.fn(), tolovXabarQarori: vi.fn() }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-tomon', async (asl) => ({
  ...(await asl<typeof import('../../api/t2-tomon')>()),
  bugunOl: m.bugunOl, tolovXabarlariOl: m.tolovXabarlariOl, tolovXabarYoz: m.tolovXabarYoz, tolovXabarBekor: m.tolovXabarBekor, tolovXabarQarori: m.tolovXabarQarori,
}));

import BugunBolimi from './BugunBolimi';
import { TolovXabarlariKelgan } from './TolovXabarlari';

const bugun = (qarz: number | null = 300) => ({
  ok: true, natija: {
    sana: '2026-11-11',
    kutayotgan: { taqdim: { f2: 2 }, murojaat_menga_ochiq: 1, murojaat_tekshiruv: 0, murojaat_kechikkan: 1, tolov_xabar_kutilmoqda: 0 },
    obyektlar: [{
      aloqa_id: 1, qarshi_kompaniya_id: 9, qarshi_nom: 'Pudratchi A', obyekt_id: 3, obyekt_nom: 'Fast Food', shartnoma_id: 5, shartnoma_raqam: '12', shartnoma_summa: 9000,
      smeta: { qqs_bilan: 7840, ustamali: 7000, ustamasiz: 6000, narxsiz_soni: 0, qator_soni: 9 }, fakt: null,
      f2: { soni: 2, oxirgi_oy: '2026-10-01', qqs_bilan: 4480, ustamali: 4000, ustamasiz: 3500, narxsiz_soni: 1, qator_soni: 4 },
      f3: { soni: 1, summa: 500, oxirgi_sana: null }, tolangan: { soni: 1, summa: 200, oxirgi_sana: null }, qarz,
      xabar_kutilmoqda: 0, kutayotgan_taqdim: 2, ochiq_murojaat: 1,
    }],
  },
});
const tolov = (o = {}) => ({ id: 4, aloqa_id: 1, obyekt_id: 3, obyekt_nom: 'Fast Food', qarshi_nom: 'Zakazchik', summa: 250, sana: '2026-11-10', hujjat_raqam: '77', izoh: null, holat: 'xabar', forma3_id: null, forma3_raqam: null, kelgan: true, qaror_izoh: null, qaror_vaqti: null, yaratildi: '2026-11-10T10:00:00Z', ...o });

beforeEach(() => { Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()); m.tolovXabarlariOl.mockResolvedValue({ ok: true, natija: [] }); });
afterEach(cleanup);

describe('Buyurtmachi «Bugun»', () => {
  it('portfel: noma‘lum «—» (0 emas), qarz ko‘rinadi, kutayotganlar belgilanadi', async () => {
    m.bugunOl.mockResolvedValue(bugun());
    render(<MemoryRouter><BugunBolimi kompaniyaId={5} kompaniyaNomi="Zakazchik" /></MemoryRouter>);
    await screen.findByText('Fast Food');
    expect(screen.getByText('Hujjatlar: qabul / qaytarish').closest('a')?.getAttribute('href')).toBe('/admin/taqdimlar');
    expect(screen.getByText('Predpisaniya / remark berish').closest('a')?.getAttribute('href')).toBe('/admin/murojaatlar?yangi=predpisaniya');
    expect(screen.getAllByText('300').length).toBeGreaterThan(0);
    expect(screen.queryByText('Fakt — pudratchi hisoboti (QQS bilan)')).toBeNull();   // fakt ma'lumoti/ruxsati yo'q: ustun chizilmaydi, 0 ko'rsatilmaydi
    expect(screen.getAllByText('7 840').length).toBeGreaterThan(0);  // smeta QQS bilan birinchi
    expect(screen.getAllByText(/ustamali: 4 000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 hujjat kutmoqda/)).toBeTruthy();
  });

  it('F3 yoki to‘lov ruxsati bo‘lmasa qarz ustuni yo‘q va to‘lov xabari tugmasi chizilmaydi', async () => {
    const d = bugun(null); const o = d.natija.obyektlar[0] as Record<string, unknown>; o.f3 = null; o.tolangan = null;
    m.bugunOl.mockResolvedValue(d);
    render(<MemoryRouter><BugunBolimi kompaniyaId={5} kompaniyaNomi="Zakazchik" /></MemoryRouter>);
    await screen.findByText('Fast Food');
    expect(screen.queryByText('Qarz (QQS bilan)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'To‘lov xabari' })).toBeNull();
  });

  it('server xatosi tinch ko‘rsatiladi (sahifa qulamaydi)', async () => {
    m.bugunOl.mockResolvedValue({ ok: false, error: 'Server xatosi' });
    render(<MemoryRouter><BugunBolimi kompaniyaId={5} kompaniyaNomi="Zakazchik" /></MemoryRouter>);
    await screen.findByTestId('bugun-xato');
  });

  it('to‘lov xabari: summa noldan katta bo‘lmasa yuborilmaydi; to‘g‘ri bo‘lsa serverga ketadi', async () => {
    m.bugunOl.mockResolvedValue(bugun());
    m.tolovXabarYoz.mockResolvedValue({ ok: true, natija: { id: 1, holat: 'xabar' } });
    render(<MemoryRouter><BugunBolimi kompaniyaId={5} kompaniyaNomi="Zakazchik" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'To‘lov xabari' }));
    const yubor = await screen.findByRole('button', { name: 'Xabar yuborish' });
    fireEvent.click(yubor);
    expect(m.tolovXabarYoz).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Summa (QQS bilan)'), { target: { value: '250 000,50' } });
    fireEvent.click(yubor);
    await waitFor(() => expect(m.tolovXabarYoz).toHaveBeenCalledWith(5, expect.objectContaining({ obyektId: 3, summa: 250000.5 })));
  });
});

describe('Pudratchi: kelgan to‘lov xabari', () => {
  it('xabar bo‘lmasa hech narsa chizilmaydi', async () => {
    const { container } = render(<TolovXabarlariKelgan kompaniyaId={9} />);
    await waitFor(() => expect(m.tolovXabarlariOl).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
  it('rad etish sababsiz yuborilmaydi; tasdiq serverga ketadi', async () => {
    m.tolovXabarlariOl.mockResolvedValue({ ok: true, natija: [tolov()] });
    m.tolovXabarQarori.mockResolvedValue({ ok: true, natija: {} });
    render(<TolovXabarlariKelgan kompaniyaId={9} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rad etish' }));
    expect(m.tolovXabarQarori).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() => expect(m.tolovXabarQarori).toHaveBeenCalledWith(9, 4, 'tasdiq', undefined));
  });
});
