import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ShartnomaHujjatlar as Malumot } from '../../api/t2-shartnoma-hujjat';
import { hajmKorinish, joriySumma, sanaKorinish } from '../../lib/shartnoma-hujjat-korinish';

const m = vi.hoisted(() => ({ ol: vi.fn(), yukla: vi.fn(), ajrat: vi.fn(), bogla: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-shartnoma-hujjat', async (orig) => ({
  ...(await orig<typeof import('../../api/t2-shartnoma-hujjat')>()),
  shartnomaHujjatlarOl: m.ol, shartnomaFaylYukla: m.yukla, shartnomaHujjatAjrat: m.ajrat, shartnomaHujjatBogla: m.bogla,
}));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));

import { ShartnomaHujjatlar } from './ShartnomaHujjatlar';

// Sintetik ma'lumot (haqiqiy shartnoma emas).
const M: Malumot = {
  shartnoma: { id: 7, raqam: 'T-1', sana: '2025-01-15', nom: null, predmet: null, jami_nds_bilan: 1000, holat: 'faol', versiya: 1 },
  ds: [
    { id: 2, raqam: '2', sana: '2025-06-01', jami_nds_bilan: 1800, izoh: null, versiya: 1 },
    { id: 1, raqam: '1', sana: '2025-03-01', jami_nds_bilan: 1500, izoh: 'limit', versiya: 1 },
  ],
  hujjatlar: [
    { id: 11, ds_id: null, tur: 'asosiy', izoh: null, yaratildi: '2025-01-15T00:00:00Z', document_id: 501, original_filename: 'asosiy.pdf', mime_type: 'application/pdf', size_bytes: 2_500_000, sha256: null, saqlangan: true, yuklangan: '2025-01-15T00:00:00Z' },
    { id: 12, ds_id: 1, tur: 'ds', izoh: null, yaratildi: '2025-03-01T00:00:00Z', document_id: 502, original_filename: 'ds1.pdf', mime_type: 'application/pdf', size_bytes: 40_000, sha256: null, saqlangan: true, yuklangan: '2025-03-01T00:00:00Z' },
  ],
  boglanmagan: [{ document_id: 503, original_filename: 'yangi.pdf', size_bytes: 10, yuklangan: '2025-07-01T00:00:00Z' }],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('shartnoma-hujjat-korinish', () => {
  it('sana, hajm va joriy summa (eng so‘nggi DS)', () => {
    expect(sanaKorinish('2025-04-18')).toBe('18.04.2025');
    expect(sanaKorinish(null)).toBe('—');
    expect(hajmKorinish(40_000)).toBe('39 KB');
    expect(hajmKorinish(2_500_000)).toBe('2.4 MB');
    expect(hajmKorinish(0)).toBe('—');
    expect(joriySumma(M)).toBe(1800);
    expect(joriySumma({ shartnoma: M.shartnoma, ds: [] })).toBe(1000);
    expect(joriySumma({ shartnoma: { ...M.shartnoma, jami_nds_bilan: null }, ds: [] })).toBeNull();
  });
});

describe('ShartnomaHujjatlar', () => {
  it('shartnoma va DS fayllari yuklab olish havolasi bilan, DS sana/summa bilan', async () => {
    m.ol.mockResolvedValue({ ok: true, natija: M });
    render(<MemoryRouter><ShartnomaHujjatlar kompaniyaId={3} shartnomaId={7} /></MemoryRouter>);
    expect(await screen.findByText('asosiy.pdf')).toBeTruthy();
    expect(m.ol).toHaveBeenCalledWith(3, 7);
    const havolalar = screen.getAllByRole('link', { name: 'Yuklab olish' }).map((a) => a.getAttribute('href'));
    expect(havolalar).toEqual(['/api/hujjat-ol?id=501', '/api/hujjat-ol?id=502']);
    expect(screen.getByText('01.03.2025')).toBeTruthy();
    expect(screen.getByText('ds1.pdf')).toBeTruthy();
  });

  it('ajratish va bog‘lanmagan faylni DS ga bog‘lash', async () => {
    m.ol.mockResolvedValue({ ok: true, natija: M });
    m.ajrat.mockResolvedValue({ ok: true });
    m.bogla.mockResolvedValue({ ok: true, id: 99 });
    render(<MemoryRouter><ShartnomaHujjatlar kompaniyaId={3} shartnomaId={7} /></MemoryRouter>);
    await screen.findByText('asosiy.pdf');
    fireEvent.click(screen.getAllByRole('button', { name: 'Shartnomadan ajratish' })[0]);
    await waitFor(() => expect(m.ajrat).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 3, id: 11 })));
    await waitFor(() => expect(m.ol).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Yuklangan, lekin bog‘lanmagan fayl'), { target: { value: '503:1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bog‘lash' }));
    await waitFor(() => expect(m.bogla).toHaveBeenCalledWith(expect.objectContaining({ shartnomaId: 7, documentId: 503, dsId: 1 })));
  });

  it('o‘qish xatosi ko‘rinadi', async () => {
    m.ol.mockResolvedValue({ ok: false, error: 'SHARTNOMA_NOT_FOUND' });
    render(<MemoryRouter><ShartnomaHujjatlar kompaniyaId={3} shartnomaId={7} /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toContain('SHARTNOMA_NOT_FOUND');
  });
});
