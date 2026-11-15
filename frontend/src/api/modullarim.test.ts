import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { korildiOl, korildiYoz, tanlovOl, tanlovSaqla } from './modullarim';

const javob = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('/api/modullarim klienti', () => {
  it('server javobi haqiqat manbai va mahalliy nusxaga yoziladi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => javob(200, { ok: true, tanlangan: ['fakt'], tartib: ['fakt'], versiya: 2 })));
    const r = await tanlovOl(17);
    expect(r).toMatchObject({ tanlangan: ['fakt'], versiya: 2, manba: 'server' });
    expect(JSON.parse(localStorage.getItem('fz-modullarim:17')!).tanlangan).toEqual(['fakt']);
  });
  it('server yo‘q (404/tarmoq) — mahalliy nusxa; bo‘lmasa bo‘sh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => javob(404, null)));
    expect(await tanlovOl(17)).toMatchObject({ tanlangan: [], versiya: 0, manba: 'mahalliy' });
    localStorage.setItem('fz-modullarim:17', JSON.stringify({ tanlangan: ['moliya'], tartib: [], versiya: 0 }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await tanlovOl(17)).toMatchObject({ tanlangan: ['moliya'], manba: 'mahalliy' });
  });
  it('saqlash: server qabul qilsa versiya yangilanadi; yo‘q bo‘lsa mahalliy qoladi', async () => {
    const f = vi.fn(async () => javob(200, { ok: true, versiya: 1 }));
    vi.stubGlobal('fetch', f);
    const r = await tanlovSaqla(17, { tanlangan: ['fakt'], tartib: ['fakt'], versiya: 0 });
    expect(r).toMatchObject({ versiya: 1, manba: 'server' });
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ kompaniya_id: 17, tanlangan: ['fakt'], expected_version: 0 });
    vi.stubGlobal('fetch', vi.fn(async () => javob(404, null)));
    expect(await tanlovSaqla(17, { tanlangan: ['hr'], tartib: [], versiya: 1 })).toMatchObject({ tanlangan: ['hr'], manba: 'mahalliy' });
  });
  it('STALE_VERSION (409) — yangi versiya bilan bir marta qayta uriniladi', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(javob(409, { ok: false, code: 'STALE_VERSION', versiya: 5 }))
      .mockResolvedValueOnce(javob(200, { ok: true, versiya: 6 }));
    vi.stubGlobal('fetch', f);
    const r = await tanlovSaqla(17, { tanlangan: ['fakt'], tartib: [], versiya: 0 });
    expect(r).toMatchObject({ versiya: 6, manba: 'server' });
    expect(JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body)).expected_version).toBe(5);
  });
  it('«ko‘rildi» belgisi kompaniya bo‘yicha', () => {
    expect(korildiOl(17)).toBe(false);
    korildiYoz(17);
    expect(korildiOl(17)).toBe(true);
    expect(korildiOl(18)).toBe(false);
  });
});