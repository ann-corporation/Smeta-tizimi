import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { IshKarta } from '../../api/t2-ish-kartasi';
import type { SmetaQator } from '../../lib/ish-kartasi';

const m = vi.hoisted(() => ({ kartalar: vi.fn(), qatorlar: vi.fn(), qidir: vi.fn(), saqla: vi.fn(), nak: vi.fn(), pod: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-ish-kartasi', async (orig) => ({
  ...(await orig<typeof import('../../api/t2-ish-kartasi')>()),
  kartalarOl: m.kartalar, qatorlarOl: m.qatorlar, smetadanQidir: m.qidir, kartaSaqla: m.saqla,
}));
vi.mock('../../api/t2-nakrutka', () => ({ t2ObyektNakrutka: m.nak }));
vi.mock('../../api/t2-nakrutka-podval', () => ({ sbPodvallarOl: m.pod, podvalTanla: () => null }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriyId: 1, joriy: { id: 1 } }) }));

import NarxTekshiruv from './NarxTekshiruv';

/* Sintetik: asosiy norma 0,4 «100М3», mehnat 12 000, beton 20 000; armatura 6 т — 48 000; istisno −6 т, mehnat −1 200. */
const ASOS: SmetaQator = {
  id: 1, obyekt_id: 10, obyekt_nom: 'Obyekt A', ota_id: 100, tartib: 1, tur: 'bl', kod: 'Е6-1-37-1', nom: 'УСТРОЙСТВО РИГЕЛЕЙ', birlik: '100М3', hajm: 0.4,
  bolalar: [
    { kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 600, summa: 12000 },
    { kat: 'БЕЗСКЛАД', nom: 'БЕТОН', birlik: 'М3', hajm: 40.6, summa: 20000 },
  ],
};
const ARM: SmetaQator = { id: 2, obyekt_id: 10, ota_id: 100, tartib: 2, tur: 'mat', kat: 'МАТ', kod: 'С124-6-1', nom: 'АРМАТУРНЫЙ КАРКАС', birlik: 'Т', hajm: 6, summa: 48000, bolalar: [] };
const IST: SmetaQator = { id: 3, obyekt_id: 10, ota_id: 100, tartib: 3, tur: 'bl', kod: 'Е6-1-97-1', nom: 'ИСКЛЮЧИТЬ ЗАТРАТЫ ТРУДА', birlik: 'Т', hajm: -6,
  bolalar: [{ kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: -60, summa: -1200 }] };

const KARTA: IshKarta = {
  id: 7, nom: 'Rigel 200×400', tur: 'rigel', birlik: 'м', parametrlar: { b_mm: 200, h_mm: 400 }, bosqich_ulush: null, qamrov: null,
  naryad_narx: null, naryad_sana: null, usta_nom: null, usta_kontragent_id: null, manba: 'qolda', ishonch: null, manba_hujjat_id: null, manba_sahifa: null,
  izoh: null, holat: 'faol', versiya: 2,
  bog: [
    { qator_id: 1, obyekt_id: 10, rol: 'asosiy', koef: 0.001, koef_usul: 'parametr', bosqich: null, material_guruh: null },
    { qator_id: 2, obyekt_id: 10, rol: 'armatura_mat', koef: 0.015, koef_usul: 'nisbat', bosqich: null, material_guruh: 'armatura' },
    { qator_id: 3, obyekt_id: 10, rol: 'istisno', koef: -0.015, koef_usul: 'nisbat', bosqich: 'armatura', material_guruh: null },
  ],
};
const NK = { ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 0,
  ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function tayyorla() {
  m.kartalar.mockResolvedValue({ kartalar: [KARTA], ulushlar: [] });
  m.qatorlar.mockResolvedValue({ qatorlar: [ASOS, ARM, IST], qoshnilar: [] });
  m.nak.mockResolvedValue({ ok: true, koeffitsientlar: NK });
  m.pod.mockResolvedValue({ ok: true, qatorlar: [] });
}

describe('NarxTekshiruv', () => {
  it('karta → 1 birlikka smeta, usta narxi bilan solishtirish va hukm', async () => {
    tayyorla();
    render(<NarxTekshiruv />);
    fireEvent.click(await screen.findByLabelText('Solishtirishga qo‘shish'));
    const bolim = await screen.findByRole('region', { name: 'Rigel 200×400' });
    // To'g'ri xarajat 1 m ga: mehnat 30 − 3 = 27, beton 50, armatura 120 → 197.
    await waitFor(() => expect(within(bolim).getByText('Jami to‘g‘ri xarajat').closest('tr')!.textContent).toContain('197'));
    expect(within(bolim).getByText('Armatura', { selector: 'td' }).closest('tr')!.textContent).toContain('120');
    fireEvent.change(within(bolim).getByLabelText('Usta narxi, 1 birlikka'), { target: { value: '81' } });
    fireEvent.change(within(bolim).getByLabelText('Rejadagi miqdor'), { target: { value: '100' } });
    // Mehnat ustamali (ustama 0, QQS siz) 27 → 81/27 = 3 baravar; qamrov (hamma bosqich, material biz) = 27 → +200 %.
    await waitFor(() => expect(within(bolim).getByTestId('hukm').textContent).toBe('Usta narxi smeta mehnatidan (ustama bilan) 3 baravar ko‘p; tanlangan qamrov narxidan 200% ortiq.'));
    expect(within(bolim).getByText('Smeta mehnati (ShNQ)').closest('tr')!.textContent).toContain('5 400');
  });

  it('qamrov: faqat beton bosqichi + beton materiali ustadan', async () => {
    tayyorla();
    render(<NarxTekshiruv />);
    fireEvent.click(await screen.findByLabelText('Solishtirishga qo‘shish'));
    const bolim = await screen.findByRole('region', { name: 'Rigel 200×400' });
    await waitFor(() => expect(within(bolim).getByText('Jami to‘g‘ri xarajat').closest('tr')!.textContent).toContain('197'));
    fireEvent.click(within(bolim).getByLabelText(/Opalubka \(/));
    fireEvent.click(within(bolim).getByLabelText(/Armatura to‘qish/));
    fireEvent.change(within(bolim).getAllByRole('combobox')[2], { target: { value: 'usta' } }); // Beton — usta
    // Qamrov: beton mehnati 30 × 35 % = 10,5 + beton 50 = 60,5 (ustama 0).
    await waitFor(() => expect(within(bolim).getByText('Tanlangan qamrov').closest('tr')!.textContent).toContain('Tanlangan qamrov6161'));
  });

  it('smetadan ish topish → asosiy qilib bog‘lash koeffitsientni parametrdan hisoblaydi va saqlaydi', async () => {
    tayyorla();
    m.qidir.mockResolvedValue([ASOS]);
    m.saqla.mockResolvedValue({ ok: true, id: 8, versiya: 1 });
    render(<NarxTekshiruv />);
    fireEvent.click(await screen.findByRole('button', { name: /Yangi karta/ }));
    fireEvent.change(screen.getByPlaceholderText('Masalan: Rigel 300×500'), { target: { value: 'Rigel 300×500' } });
    fireEvent.change(screen.getByLabelText('Kenglik b, mm'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Balandlik h, mm'), { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('Masalan: ригел'), { target: { value: 'ригел' } });
    fireEvent.click(screen.getByRole('button', { name: /Qidirish/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Asosiy' }));
    await waitFor(() => expect(Number((screen.getAllByLabelText('1 birlikka koef')[0] as HTMLInputElement).value)).toBeCloseTo(0.0015, 12));
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    await waitFor(() => expect(m.saqla).toHaveBeenCalled());
    const arg = m.saqla.mock.calls[0][0];
    expect(arg.karta).toMatchObject({ nom: 'Rigel 300×500', tur: 'rigel', birlik: 'м', parametrlar: { b_mm: 300, h_mm: 500 } });
    expect(arg.bog[0]).toMatchObject({ qator_id: 1, rol: 'asosiy', koef_usul: 'parametr' });
    expect(arg.bog[0].koef).toBeCloseTo(0.0015, 12);
  });
});
