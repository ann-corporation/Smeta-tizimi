import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keshTozala, marshrutHisobla, uzichida } from './yuk-marshrut';

const TOSHKENT = { lat: 41.3111, lng: 69.2797 };
const NAVOIY = { lat: 40.0844, lng: 65.3792 };
const osrm = (km: number) => vi.fn(async () => new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: km * 1000, duration: km * 40, geometry: { coordinates: [] } }] }), { status: 200 })) as unknown as typeof fetch;

describe('marshrutHisobla', () => {
  beforeEach(() => keshTozala());
  it('OSRM natijasi va kesh (ikkinchi chaqiruv tarmoqsiz)', async () => {
    const f = osrm(430);
    const a = await marshrutHisobla(TOSHKENT, NAVOIY, { fetchFn: f });
    expect(a).toEqual({ ok: true, natija: { km: 430, daqiqa: 287, manba: 'yol', kesh: false } });
    const b = await marshrutHisobla(TOSHKENT, NAVOIY, { fetchFn: f });
    expect(b.ok && b.natija.kesh).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('kesh muddati o‘tsa qayta so‘raydi', async () => {
    const f = osrm(430);
    await marshrutHisobla(TOSHKENT, NAVOIY, { fetchFn: f, hozir: 0 });
    await marshrutHisobla(TOSHKENT, NAVOIY, { fetchFn: f, hozir: 25 * 3_600_000 });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('OSRM xatosi — taxminiy (keshlanmaydi)', async () => {
    const f = vi.fn(async () => { throw new Error('tarmoq'); }) as unknown as typeof fetch;
    const a = await marshrutHisobla(TOSHKENT, NAVOIY, { fetchFn: f });
    expect(a.ok && a.natija.manba).toBe('taxminiy');
    await marshrutHisobla(TOSHKENT, NAVOIY, { fetchFn: f });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('O‘zbekiston tashqarisi rad etiladi (faqat ichki)', async () => {
    const r = await marshrutHisobla(TOSHKENT, { lat: 55.75, lng: 37.62 }, { fetchFn: osrm(1) });
    expect(r).toEqual({ ok: false, code: 'UZ_TASHQARI' });
    expect(uzichida(NAVOIY)).toBe(true);
  });
  it('noto‘g‘ri nuqta', async () => {
    expect(await marshrutHisobla({ lat: NaN, lng: 1 }, NAVOIY)).toEqual({ ok: false, code: 'NUQTA_NOTOGRI' });
    expect(await marshrutHisobla(null, NAVOIY)).toEqual({ ok: false, code: 'NUQTA_NOTOGRI' });
  });
  it('mijoz kaliti yo‘q: URL da kalit parametri yo‘q', async () => {
    const f = osrm(10);
    await marshrutHisobla(TOSHKENT, NAVOIY, { fetchFn: f });
    const url = String((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(url).not.toMatch(/key|token|apikey/i);
  });
});