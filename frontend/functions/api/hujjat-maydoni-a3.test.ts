// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet as oqi } from './hujjat-maydoni';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());
const kuki = async () => 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
const ENV = { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: {} as R2Bucket };

describe('Disk A3 API: eski document_id havolasi -> Disk fayli', () => {
  it('registry_joy: aktor sessiyadan, registry id RPC ga o‘tadi', async () => {
    const c: Array<{ nom: string; args: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => { c.push({ nom: String(u).split('/rpc/')[1], args: JSON.parse(String(init?.body ?? '{}')) }); return Response.json({ ok: true, fayl_id: 7, papka_id: 55, kompaniya_id: 17 }); }));
    const r = await oqi({ request: new Request('https://x/api/hujjat-maydoni?amal=registry_joy&registry_id=321&actor_id=999', { headers: { Cookie: await kuki() } }), env: ENV } as never);
    expect(await r.json()).toMatchObject({ ok: true, fayl_id: 7, papka_id: 55 });
    expect(c).toEqual([{ nom: 't2_hm_registry_joy_v1', args: { p_actor: 5, p_registry_id: 321 } }]); // actor_id so'rovdan o'qilmaydi
  });
  it('RUXSAT_YOQ RPC javobi 403 ga aylanadi (begona hujjat ko‘rinmaydi)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, code: 'RUXSAT_YOQ' })));
    const r = await oqi({ request: new Request('https://x/api/hujjat-maydoni?amal=registry_joy&registry_id=321', { headers: { Cookie: await kuki() } }), env: ENV } as never);
    expect(r.status).toBe(403);
  });
});
