import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ zakazchikObyektlarOl: vi.fn(), taqdimlarOl: vi.fn() }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5, nom: 'Zakazchik MCHJ', rol: 'boss' } }) }));
vi.mock('../../api/t2-tomon', async (asl) => ({ ...(await asl<typeof import('../../api/t2-tomon')>()), zakazchikObyektlarOl: m.zakazchikObyektlarOl, taqdimlarOl: m.taqdimlarOl }));

import ObyektPortali from './ObyektPortali';
import { bajarilishFoizi, holatYigindisi } from './obyekt-portali-yordam';

const obyekt = (o: Record<string, unknown> = {}) => ({
  aloqa_id: 1, qarshi_kompaniya_id: 9, qarshi_nom: 'Sinov Qurilish', qarshi_rol: 'pudratchi', obyekt_id: 3, obyekt_nom: 'Sinov obyekt',
  shartnoma: { raqam: '12', nom: null, summa_bez_nds: 10000, jami_nds_bilan: 11200 },
  f2: { soni: 2, jami: 2500, oxirgi_oy: '2026-09-01', royxat: [{ akt_id: 11, raqam: '1', oy: '2026-08-01', jami: 1000 }, { akt_id: 12, raqam: '2', oy: '2026-09-01', jami: 1500 }] },
  kutayotgan_taqdim: 1, ...o,
});
const taqdim = (o: Record<string, unknown> = {}) => ({
  id: 7, aloqa_id: 1, resurs: 'f2', nom: 'Ф-2 № 2', oy: '2026-09-01', summa: 1500, holat: 'yuborilgan', kelgan: true, qarshi_nom: 'Sinov Qurilish', obyekt_nom: 'Sinov obyekt',
  taqdim_vaqti: '2026-10-05T10:00:00Z', qaror_vaqti: null, qaror_izoh: null, oldingi_taqdim_id: null, ...o,
});
const korsat = () => render(<MemoryRouter initialEntries={['/admin/zakazchik/obyekt/1/3']}><Routes><Route path="/admin/zakazchik/obyekt/:aloqaId/:obyektId" element={<ObyektPortali />} /></Routes></MemoryRouter>);

beforeEach(() => { m.zakazchikObyektlarOl.mockReset(); m.taqdimlarOl.mockReset(); });
afterEach(cleanup);

describe('bajarilishFoizi', () => {
  it('ikkala qiymat ma’lum bo‘lsa foiz, aks holda null (0 emas)', () => {
    expect(bajarilishFoizi(2500, 10000)).toBe(25);
    expect(bajarilishFoizi(null, 10000)).toBeNull();
    expect(bajarilishFoizi(2500, null)).toBeNull();
    expect(bajarilishFoizi(2500, 0)).toBeNull();
  });
});
describe('holatYigindisi', () => {
  it('summasiz hujjat yig‘indiga kirmaydi, soni alohida', () => {
    const y = holatYigindisi([taqdim({ holat: 'qabul', summa: 100 }), taqdim({ id: 8, holat: 'qabul', summa: null }), taqdim({ id: 9, holat: 'rad', summa: 5 })] as never);
    expect(y.qabul).toEqual({ soni: 2, summa: 100, summasiz: 1 });
    expect(y.rad.soni).toBe(1);
  });
});

describe('Obyekt portali', () => {
  it('progress, aktlar va hujjat holati ko‘rinadi; boshqa obyekt hujjati yashirin', async () => {
    m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [obyekt(), obyekt({ obyekt_id: 4, obyekt_nom: 'Boshqa' })] });
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [taqdim(), taqdim({ id: 8, nom: 'Ф-2 № 99', obyekt_nom: 'Boshqa' })] });
    korsat();
    await screen.findByText('Ф-2 № 2');
    expect(screen.getByText('25 %')).toBeTruthy();
    expect(screen.queryByText('Ф-2 № 99')).toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getAllByText('Sinov obyekt').length).toBeGreaterThan(0);
  });

  it('F2 ruxsati yo‘q bo‘lsa “ochilmagan” va foiz “—” (0 emas)', async () => {
    m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [obyekt({ f2: null, shartnoma: null })] });
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [] });
    korsat();
    await screen.findByText(/Pudratchi F2 ni sizga hali ochmagan/);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('0 %')).toBeNull();
  });

  it('sizga ochilmagan obyekt — topilmadi', async () => {
    m.zakazchikObyektlarOl.mockResolvedValue({ ok: true, natija: [obyekt({ obyekt_id: 99 })] });
    m.taqdimlarOl.mockResolvedValue({ ok: true, natija: [] });
    korsat();
    await screen.findByText(/topilmadi yoki sizga ochilmagan/);
  });
});
