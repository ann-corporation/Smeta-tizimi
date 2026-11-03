import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QarzRoyxat, QarzShartnoma } from '../../api/t2-qarzdorlik';

const m = vi.hoisted(() => ({ ol: vi.fn(), saqla: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-qarzdorlik', async (orig) => ({ ...(await orig<typeof import('../../api/t2-qarzdorlik')>()), qarzdorlikRoyxatOl: m.ol, qarzdorlikSaqla: m.saqla }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 1 } }) }));

import { Qarzdorlik } from './Qarzdorlik';

// Faqat sintetik raqamlar.
const sh = (p: Partial<QarzShartnoma>): QarzShartnoma => ({
  shartnoma_id: 1, versiya: 3, raqam: 'T-1', sana: null, nom: null, predmet: 'test material', turi: 'postavshik', holat: 'faol', izoh: null,
  kontragent_id: 1, kontragent: 'TEST POSTAVSHIK A', kontragent_inn: null, shartnoma_summa: 2000, obyektlar: [],
  boshlangich: null, yetkazilgan: 1500, bajarilgan: null, qabul: 1500, tolov_asos: 600, tolov_t2: null, tolangan: 600, qarz: 900,
  spravka_qarz: 700, spravka_tolangan: null, spravka_prognoz: null, spravka_sana: null, farq: 200, noma_lumot_qator: 0, qator_soni: 2,
  qatorlar: [
    { id: 11, versiya: 1, tur: 'yetkazib_berish', hujjat_raqam: 'N-1', sana: '2026-01-12', nomi: 'material', birlik: 'dona', hajm: 15, narx: 100, summa: 1500, izoh: null },
    { id: 12, versiya: 1, tur: 'tolov', hujjat_raqam: 'P-1', sana: '2026-01-20', nomi: null, birlik: null, hajm: null, narx: null, summa: 600, izoh: null },
  ],
  ...p,
});

const royxat = (shartnomalar: QarzShartnoma[]): QarzRoyxat => ({ ok: true, generated_at: '2026-11-02T00:00:00Z', obyektlar: [], shartnomalar });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Qarzdorlik', () => {
  it('ro‘yxat: qarz, spravka farqi va ogohlantirish ko‘rinadi; asos yo‘q shartnomada qarz noma‘lum', async () => {
    m.ol.mockResolvedValue({ ok: true, natija: royxat([
      sh({}),
      sh({ shartnoma_id: 2, raqam: 'T-2', kontragent: 'TEST SUBPUDRAT B', turi: 'subpudrat', qatorlar: [], qarz: null, qabul: null, tolangan: null, farq: null, spravka_qarz: 300, shartnoma_summa: 5000 }),
    ]) });
    render(<Qarzdorlik />);
    const jadval = await screen.findByRole('table', { name: 'Qarzdorlik ro‘yxati' });
    const q1 = within(jadval).getByText('TEST POSTAVSHIK A').closest('tr') as HTMLElement;
    expect(within(q1).getByText('Spravka qarzi asoslanmagan farq bor')).toBeTruthy();
    const q2 = within(jadval).getByText('TEST SUBPUDRAT B').closest('tr') as HTMLElement;
    expect(within(q2).getByText('Spravkada qarz bor, lekin asos hujjatlar kiritilmagan')).toBeTruthy();
    expect(within(q2).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('qatorni ochish → asoslar tahrirlanadi va bitta «Saqlash» CAS bilan yuboriladi', async () => {
    m.ol.mockResolvedValue({ ok: true, natija: royxat([sh({})]) });
    m.saqla.mockResolvedValue({ ok: true, versiya: 4 });
    render(<Qarzdorlik />);
    const q = (await screen.findByText('TEST POSTAVSHIK A')).closest('tr') as HTMLElement;
    fireEvent.click(q);
    const panel = await screen.findByLabelText('Qarz asoslari');
    const saqlash = within(panel).getByRole('button', { name: /Saqlash/ }) as HTMLButtonElement;
    expect(saqlash.disabled).toBe(true);
    const hujjatlar = within(panel).getAllByLabelText('Hujjat №') as HTMLInputElement[];
    fireEvent.change(hujjatlar[0], { target: { value: 'N-1A' } });
    expect(saqlash.disabled).toBe(false);
    fireEvent.click(saqlash);
    await waitFor(() => expect(m.saqla).toHaveBeenCalledTimes(1));
    const arg = m.saqla.mock.calls[0][0];
    expect(arg).toMatchObject({ kompaniyaId: 1, shartnomaId: 1, kutilganVersiya: 3, ochirilgan: [] });
    expect(arg.qatorlar[0]).toMatchObject({ id: 11, tur: 'yetkazib_berish', hujjat_raqam: 'N-1A', hajm: 15, narx: 100, summa: 1500 });
    expect(arg.qatorlar).toHaveLength(2);
    expect(typeof arg.operationId).toBe('string');
    await waitFor(() => expect(m.ol).toHaveBeenCalledTimes(2)); // saqlangach yangilanadi
  });

  it('qatorni o‘chirish — id ochirilganlar ro‘yxatiga tushadi; jonli hisob yangilanadi', async () => {
    m.ol.mockResolvedValue({ ok: true, natija: royxat([sh({})]) });
    m.saqla.mockResolvedValue({ ok: true, versiya: 4 });
    render(<Qarzdorlik />);
    fireEvent.click((await screen.findByText('TEST POSTAVSHIK A')).closest('tr') as HTMLElement);
    const panel = await screen.findByLabelText('Qarz asoslari');
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Qatorni o‘chirish' })[1]); // to‘lov qatori
    fireEvent.click(within(panel).getByRole('button', { name: /Saqlash/ }));
    await waitFor(() => expect(m.saqla).toHaveBeenCalled());
    expect(m.saqla.mock.calls[0][0].ochirilgan).toEqual([12]);
    expect(m.saqla.mock.calls[0][0].qatorlar).toHaveLength(1);
  });

  it('server xatosi tushunarli xabar bilan ko‘rsatiladi (STALE_VERSION)', async () => {
    m.ol.mockResolvedValue({ ok: true, natija: royxat([sh({})]) });
    m.saqla.mockResolvedValue({ ok: false, code: 'STALE_VERSION' });
    render(<Qarzdorlik />);
    fireEvent.click((await screen.findByText('TEST POSTAVSHIK A')).closest('tr') as HTMLElement);
    const panel = await screen.findByLabelText('Qarz asoslari');
    fireEvent.click(within(panel).getByRole('button', { name: /Qo‘shish|Yetkazib berish/ }));
    fireEvent.click(within(panel).getByRole('button', { name: /Saqlash/ }));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('o‘zgargan'), 'danger'));
  });
});
