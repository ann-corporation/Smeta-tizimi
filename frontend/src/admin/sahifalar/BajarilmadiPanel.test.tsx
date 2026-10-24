import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator, T2QatorHolat } from '../../api/supabase';

const m = vi.hoisted(() => ({ royxat: vi.fn(), belgila: vi.fn(), bekor: vi.fn() }));
vi.mock('../../api/t2-bajarilmadi', async (asl) => ({
  ...(await asl<typeof import('../../api/t2-bajarilmadi')>()),
  bajarilmadiRoyxatOl: m.royxat, bajarilmadiBelgila: m.belgila, bajarilmadiBekor: m.bekor,
}));
import { BajarilmadiPanel } from './BajarilmadiPanel';

const q = { id: 10, tur: 'bl', kod: 'E6-1', nom: 'Beton quyish', birlik: 'm3', hajm: 10 } as unknown as T2Qator;
const h = [{ qator_id: 10, fakt_hajm: 3 }] as unknown as T2QatorHolat[];
const yozuv = { id: 5, obyekt_id: 8, qator_id: 10, kod: 'E6-1', nom: 'Beton quyish', birlik: 'm3', tur: 'bl', smeta_hajm: 10, fakt_hajm: 3, hajm: null, bajarilmagan_hajm: 7,
  sabab_kod: 'texnik_sabab', sabab_izoh: null, hujjat_id: null, hujjat_nom: null, sana: '2026-10-24', zamena_qator_id: null, holat: 'faol', kim: 'Anvar', yaratildi: '2026-10-24T05:00:00Z' };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Bajarilmadi paneli', () => {
  it('qator tanlanadi, sabab bilan belgilanadi (smeta qatoriga tegilmaydi); yozuv ro‘yxatda ko‘rinadi va bekor qilinadi', async () => {
    m.royxat.mockResolvedValueOnce({ ok: true, qatorlar: [] }).mockResolvedValue({ ok: true, qatorlar: [yozuv] });
    m.belgila.mockResolvedValue({ ok: true, yaratildi: 1, otkazildi: 0 });
    m.bekor.mockResolvedValue({ ok: true });
    render(<BajarilmadiPanel kompaniyaId={123} obyektId={8} qatorlar={[q]} holatlar={h} />);
    fireEvent.change(screen.getByLabelText('Ishni qidirish'), { target: { value: 'beton' } });
    fireEvent.click(await screen.findByText(/Beton quyish/));
    fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'buyurtmachi_chiqardi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bajarilmadi deb belgilash' }));
    await waitFor(() => expect(m.belgila).toHaveBeenCalledTimes(1));
    expect(m.belgila.mock.calls[0][0]).toMatchObject({ kompaniyaId: 123, obyektId: 8, sabab: 'buyurtmachi_chiqardi', qatorlar: [{ qator_id: 10, hajm: null }] });
    const bekor = await screen.findByRole('button', { name: 'Bekor qilish' });
    fireEvent.click(bekor);
    await waitFor(() => expect(m.bekor).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 123, id: 5 })));
  });

  it('sabab «Boshqa» bo‘lsa izohsiz belgilab bo‘lmaydi', async () => {
    m.royxat.mockResolvedValue({ ok: true, qatorlar: [] });
    render(<BajarilmadiPanel kompaniyaId={123} obyektId={8} qatorlar={[q]} holatlar={h} />);
    fireEvent.change(screen.getByLabelText('Ishni qidirish'), { target: { value: 'beton' } });
    fireEvent.click(await screen.findByText(/Beton quyish/));
    fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'boshqa' } });
    expect((screen.getByRole('button', { name: 'Bajarilmadi deb belgilash' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
