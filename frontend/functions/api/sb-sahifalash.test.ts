import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './sb';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());

async function read(total: number, failOffset?: number, objectCompany = 17, table = 't2_daraxt') {
  const pages: Array<{ offset: number; count: string | null; url: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const url = new URL(String(u));
    if (url.pathname === '/rest/v1/t2_obyekt') return Response.json([{ kompaniya_id: objectCompany }]);
    const offset = Number(url.searchParams.get('offset'));
    pages.push({ offset, count: new Headers(init?.headers).get('Prefer'), url: url.toString() });
    if (offset === failOffset) return new Response('unavailable', { status: 503 });
    const n = Math.min(1000, total - offset, Number(url.searchParams.get('limit')));
    return new Response(JSON.stringify(Array.from({ length: Math.max(0,n) }, (_,i) => ({ id: offset+i+1 }))), {
      headers: { 'content-range': `${offset}-${offset+n-1}/${offset === 0 ? total : '*'}` },
    });
  }));
  const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
  const request = new Request('https://x/api/sb', { method: 'POST', headers: { Cookie: 'sess='+sess },
    body: JSON.stringify({ jadval: table, filtr: 'obyekt_id=eq.127', tartib: 'id.asc', limit: 200000 }) });
  const response = await onRequestPost({ request, env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY } } as never);
  return { response, json: await response.json() as { ok: boolean; toliq: boolean; jamiServerda: number; soni: number; qatorlar?: unknown[] }, pages };
}

describe('large financial reads count once', () => {
  it.each(['t2_daraxt','t2_qator_holat'])('retains exact completeness and object filter on all %s requests', async (table) => {
    const { json, pages } = await read(2503,undefined,17,table);
    expect(json).toMatchObject({ ok: true, toliq: true, jamiServerda: 2503, soni: 2503 });
    expect(pages.map(p => p.count)).toEqual(['count=exact', null, null]);
    expect(pages.every(p => p.url.includes('obyekt_id=eq.127'))).toBe(true);
    if (table === 't2_daraxt') expect(pages.every(p => new URL(p.url).searchParams.get('kompaniya_id') === 'in.(17)')).toBe(true);
    expect(pages.map(p => p.offset)).toEqual([0,1000,2000]);
  });
  it('never requests financial pages from an object in another company', async () => {
    const { response,json,pages } = await read(2503,undefined,18,'t2_qator_holat');
    expect(response.status).toBe(403); expect(json.ok).toBe(false); expect(pages).toEqual([]);
  });
  it('still exposes incompleteness beyond worker budget instead of a smaller financial total', async () => {
    const { json,pages } = await read(25030);
    expect(json).toMatchObject({ ok: true, toliq: false, jamiServerda: 25030, soni: 20000 });
    expect(pages.filter(p => p.count)).toHaveLength(1);
  });
  it('does not turn a failed continuation into financial success', async () => {
    const { json } = await read(2503,1000);
    expect(json.ok).toBe(false); expect(json.qatorlar).toBeUndefined();
  });
});
