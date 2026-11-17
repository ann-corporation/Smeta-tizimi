/**
 * Sinov boshlash (2026-11-17): actor FAQAT sessiyadan, klient p_actor_id/kompaniya_id/miqdor yubora olmaydi;
 * LIMIT -> 429, SINOV_KERAKMAS -> 409, SINOV_YOQ/DEMO_YOQ -> 404; GET ?sinov=1 faqat o'qish RPC si.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { onRequestGet, onRequestPost } from './company';

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key', SESSIYA_KALIT: 'a'.repeat(32) };
const cookie = async (id = 3) => 'sess=' + await imzola({ rol: 'boss', email: 'yangi@sinov', foydalanuvchi_id: id }, ENV.SESSIYA_KALIT);
const post = async (body: unknown, id = 3) => ({ request: new Request('http://x/api/company', { method: 'POST', headers: { Cookie: await cookie(id) }, body: JSON.stringify(body) }), env: ENV }) as any;
const get = async (qs: string, id = 3) => ({ request: new Request('http://x/api/company' + qs, { headers: { Cookie: await cookie(id) } }), env: ENV }) as any;
afterEach(() => { vi.unstubAllGlobals(); });

describe('company — sinov boshlash', () => {
  it('sinov_boshlash: actor sessiyadan, faqat p_actor_id + p_operation_id ketadi (miqdor/kompaniya klientdan EMAS)', async () => {
    const yuklar: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_sinov_boshlash_v1');
      yuklar.push(JSON.parse(init.body));
      return { ok: true, text: async () => JSON.stringify({ ok: true, kompaniya_id: 77, bonus_token: 1000, balans: 1000 }) } as Response;
    }));
    const res = await onRequestPost(await post({ action: 'sinov_boshlash', operation_id: 'op-1', p_actor_id: 999, kompaniya_id: 1, miqdor: 999999, bonus: 5 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, kompaniya_id: 77, bonus_token: 1000 });
    expect(yuklar[0]).toEqual({ p_actor_id: 3, p_operation_id: 'op-1' });
  });
  it('sinov_demo: faqat actor + operation_id', async () => {
    const f = vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_sinov_demo_v1');
      expect(JSON.parse(init.body)).toEqual({ p_actor_id: 3, p_operation_id: 'op-2' });
      return { ok: true, text: async () => JSON.stringify({ ok: true, demo_obyekt_id: 5 }) } as Response;
    });
    vi.stubGlobal('fetch', f);
    const res = await onRequestPost(await post({ action: 'sinov_demo', operation_id: 'op-2', p_obyekt_id: 1 }));
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it.each([['LIMIT', 429], ['SINOV_KERAKMAS', 409], ['SINOV_YOQ', 404], ['DEMO_YOQ', 404], ['OPERATION_CONFLICT', 409]])('%s -> %i', async (code, status) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, code }) }) as Response));
    const res = await onRequestPost(await post({ action: 'sinov_boshlash' }));
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ ok: false, code });
  });
  it('sessiyasiz so‘rov RPC ga yetmaydi', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const res = await onRequestPost({ request: new Request('http://x/api/company', { method: 'POST', body: JSON.stringify({ action: 'sinov_boshlash' }) }), env: ENV } as any);
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
  it('GET ?sinov=1 -> t2_sinov_holat_v1 (actor sessiyadan)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      expect(url).toContain('/rpc/t2_sinov_holat_v1');
      expect(JSON.parse(init.body)).toEqual({ p_actor_id: 3 });
      return { ok: true, text: async () => JSON.stringify({ ok: true, boshlangan: false, boshlash_mumkin: true }) } as Response;
    }));
    const res = await onRequestGet(await get('?sinov=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ boshlash_mumkin: true });
  });
});
