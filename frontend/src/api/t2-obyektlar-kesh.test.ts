import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ ol: vi.fn() }));
vi.mock('./supabase', () => ({ sbT2ObyektlarOlKomp: api.ol }));
import { obyektlarKeshdan } from './t2-obyektlar-kesh';
import { obyektlarEskirdi } from './obyektlar-kesh-belgi';

beforeEach(() => { api.ol.mockReset(); });

describe('obyektlarKeshdan — sahifalar orasida bitta t2_obyekt_jami so‘rovi', () => {
  it('60 s ichida qayta so‘ralmaydi; qo‘lda yangilash keshni chetlab o‘tadi', async () => {
    api.ol.mockResolvedValue({ ok: true, qatorlar: [{ id: 1, kompaniya_id: 17, nom: 'A' }] });
    const qc = new QueryClient();
    const [a, b] = await Promise.all([obyektlarKeshdan(qc, 17), obyektlarKeshdan(qc, 17)]);
    const c = await obyektlarKeshdan(qc, 17);
    expect(api.ol).toHaveBeenCalledTimes(1);
    expect(a.qatorlar).toEqual(b.qatorlar);
    expect(c).toMatchObject({ ok: true, qatorlar: [{ id: 1 }] });
    await obyektlarKeshdan(qc, 17, true);
    expect(api.ol).toHaveBeenCalledTimes(2);
    await obyektlarKeshdan(qc, 18); // boshqa kompaniya — alohida kalit
    expect(api.ol).toHaveBeenCalledTimes(3);
  });

  it('xato keshlanmaydi — keyingi chaqiruv qayta o‘qiydi', async () => {
    api.ol.mockResolvedValueOnce({ ok: false, error: 'timeout' }).mockResolvedValueOnce({ ok: true, qatorlar: [] });
    const qc = new QueryClient();
    expect(await obyektlarKeshdan(qc, 17)).toMatchObject({ ok: false, qatorlar: [] });
    expect(await obyektlarKeshdan(qc, 17)).toMatchObject({ ok: true, qatorlar: [] });
    expect(api.ol).toHaveBeenCalledTimes(2);
  });

  it('provider yo‘q (izolyatsiyalangan test) — to‘g‘ridan-to‘g‘ri o‘qish', async () => {
    api.ol.mockResolvedValue({ ok: true, qatorlar: [] });
    await obyektlarKeshdan(null, 17); await obyektlarKeshdan(null, 17);
    expect(api.ol).toHaveBeenCalledTimes(2);
  });
  it('obyekt yaratish/nomlashdan keyin (obyektlarEskirdi) — keyingi o‘qish serverdan', async () => {
    api.ol.mockResolvedValue({ ok: true, qatorlar: [] });
    const qc = new QueryClient();
    await obyektlarKeshdan(qc, 17); await obyektlarKeshdan(qc, 17);
    expect(api.ol).toHaveBeenCalledTimes(1);
    obyektlarEskirdi();
    await obyektlarKeshdan(qc, 17);
    expect(api.ol).toHaveBeenCalledTimes(2);
  });
});