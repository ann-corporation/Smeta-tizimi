import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obyektlarEskirdi, obyektlarModuldaKesh, obyektlarModuldaKeshniTozala, OBYEKTLAR_MODUL_TTL_MS } from './obyektlar-kesh-belgi';
import { sbT2ObyektlarOl, sbT2ObyektlarOlKomp, sbObyektTahrirlash } from './supabase';

beforeEach(() => obyektlarModuldaKeshniTozala());

describe('obyektlarModuldaKesh — in-flight birlashtirish, TTL, eskirish', () => {
  it('ikki bir vaqtdagi chaqiruv — bitta so‘rov', async () => {
    const oqi = vi.fn(async () => ({ ok: true, v: 1 }));
    const [a, b] = await Promise.all([obyektlarModuldaKesh(1, oqi), obyektlarModuldaKesh(1, oqi)]);
    expect(oqi).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
  it('TTL ichida qayta ishlatiladi, undan keyin qayta o‘qiladi', async () => {
    let t = 1000; const hozir = () => t;
    const oqi = vi.fn(async () => ({ ok: true }));
    await obyektlarModuldaKesh(1, oqi, false, hozir);
    t += OBYEKTLAR_MODUL_TTL_MS - 1;
    await obyektlarModuldaKesh(1, oqi, false, hozir);
    expect(oqi).toHaveBeenCalledTimes(1);
    t += 2;
    await obyektlarModuldaKesh(1, oqi, false, hozir);
    expect(oqi).toHaveBeenCalledTimes(2);
  });
  it('boshqa kompaniya alohida; majburiy keshni chetlab o‘tadi; xato keshlanmaydi', async () => {
    const oqi = vi.fn(async () => ({ ok: true }));
    await obyektlarModuldaKesh(1, oqi); await obyektlarModuldaKesh(2, oqi);
    expect(oqi).toHaveBeenCalledTimes(2);
    await obyektlarModuldaKesh(1, oqi, true);
    expect(oqi).toHaveBeenCalledTimes(3);
    const xato = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    await obyektlarModuldaKesh(3, xato); await obyektlarModuldaKesh(3, xato);
    expect(xato).toHaveBeenCalledTimes(2);
  });
  it('obyektlarEskirdi() keyingi o‘qishni serverdan qiladi; eskirishdan oldin boshlangan so‘rov keshga yozilmaydi', async () => {
    const oqi = vi.fn(async () => ({ ok: true }));
    await obyektlarModuldaKesh(1, oqi);
    obyektlarEskirdi();
    await obyektlarModuldaKesh(1, oqi);
    expect(oqi).toHaveBeenCalledTimes(2);
    let tugat!: () => void;
    const sekin = vi.fn(() => new Promise<{ ok: boolean }>((r) => { tugat = () => r({ ok: true }); }));
    const p = obyektlarModuldaKesh(5, sekin);
    obyektlarEskirdi(); tugat(); await p;
    const q = obyektlarModuldaKesh(5, sekin); tugat(); await q;
    expect(sekin).toHaveBeenCalledTimes(2);
  });
});

describe('sbT2ObyektlarOl — bitta keshlangan yo‘l (haqiqiy tarmoq qatlami bilan)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/sb-yoz' ? { ok: true } : { ok: true, qatorlar: [{ id: 1, nom: 'A' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  const oqishlar = () => fetchMock.mock.calls.filter((c) => c[0] === '/api/sb').length;

  it('ikki bir vaqtdagi chaqiruv → bitta /api/sb so‘rovi; keyingisi keshdan', async () => {
    const [a, b] = await Promise.all([sbT2ObyektlarOl(7), sbT2ObyektlarOlKomp(7)]);
    expect(a.qatorlar).toEqual(b.qatorlar);
    await sbT2ObyektlarOlKomp(7);
    expect(oqishlar()).toBe(1);
  });
  it('yozishdan keyin (obyekt tahrirlash) kesh eskiradi — keyingi o‘qish serverdan', async () => {
    await sbT2ObyektlarOlKomp(7);
    await sbObyektTahrirlash(1, 'Yangi', 'tur');
    await sbT2ObyektlarOlKomp(7);
    expect(oqishlar()).toBe(2);
  });
  it('majburiy — keshni chetlab o‘tadi', async () => {
    await sbT2ObyektlarOlKomp(7); await sbT2ObyektlarOlKomp(7, { majburiy: true });
    expect(oqishlar()).toBe(2);
  });
});
