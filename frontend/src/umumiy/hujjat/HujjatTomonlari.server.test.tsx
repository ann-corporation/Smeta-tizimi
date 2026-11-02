import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useHujjatTomonlari } from './HujjatTomonlari';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

const javob = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const get = (o: Record<string, unknown>) => ({ ok: true, kompaniya_id: 5, mavqe: null, f2_tasdiq_rejimi: 'shaxsiy', sozlamalar: {}, yozish_mumkin: true, ...o });

describe('useHujjatTomonlari (server-backed)', () => {
  it('serverdan kelgan qiymat bilan to‘ldiriladi va localStorage ga yoziladi', async () => {
    localStorage.setItem('hujjat-tomonlari:5', JSON.stringify({ zakazchik: 'Lokal' }));
    vi.stubGlobal('fetch', vi.fn(() => javob(get({ sozlamalar: { 'hujjat.imzo_tomonlari': { qiymat: { zakazchik: 'Server MChJ' } } } }))));
    const { result } = renderHook(() => useHujjatTomonlari(5));
    expect(result.current[0]).toEqual({ zakazchik: 'Lokal' });
    await waitFor(() => expect(result.current[0]).toEqual({ zakazchik: 'Server MChJ' }));
    expect(JSON.parse(localStorage.getItem('hujjat-tomonlari:5')!)).toEqual({ zakazchik: 'Server MChJ' });
  });

  it('404 bo‘lsa — jim, mahalliy qiymatda qoladi', async () => {
    localStorage.setItem('hujjat-tomonlari:5', JSON.stringify({ pudratchi: 'Lokal' }));
    const f = vi.fn(() => javob({ ok: false, code: 'SERVER_YANGILANMAGAN' }, 404));
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useHujjatTomonlari(5));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(result.current[0]).toEqual({ pudratchi: 'Lokal' });
  });

  it('serverda yo‘q, mahalliy bor — bir marta yuklaydi; saqla debounce bilan POST qiladi', async () => {
    localStorage.setItem('hujjat-tomonlari:5', JSON.stringify({ pudratchi: 'Lokal' }));
    const f = vi.fn((_u: string, init?: RequestInit) => init?.method === 'POST' ? javob({ ok: true }) : javob(get({})));
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useHujjatTomonlari(5));
    await waitFor(() => expect(f.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1));
    expect(JSON.parse(String(f.mock.calls.find(([, i]) => i?.method === 'POST')![1]!.body))).toMatchObject({ kalit: 'hujjat.imzo_tomonlari', qiymat: { pudratchi: 'Lokal' } });
    act(() => result.current[1]({ pudratchi: 'Yangi' }));
    expect(result.current[0]).toEqual({ pudratchi: 'Yangi' });
    await waitFor(() => expect(f.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(2), { timeout: 2000 });
  });
});
