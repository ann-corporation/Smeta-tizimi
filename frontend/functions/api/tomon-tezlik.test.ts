import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_shared/auth', () => ({ tekshir: vi.fn(async () => ({ foydalanuvchi_id: 7 })) }));

import { onRequestGet, oqishYuki } from './tomon';

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key', SESSIYA_KALIT: 'a'.repeat(32) };
const get = (qs: string) => ({ request: new Request('https://x/api/tomon?' + qs, { headers: { Cookie: 's=1' } }), env: ENV }) as never;

afterEach(() => vi.unstubAllGlobals());

describe('tomon shlyuzi: obyektlar — tez ro‘yxat (v2) va bitta obyekt tafsiloti', () => {
  it('standart: ustamali podval hisobi so‘ralmaydi', () => {
    expect(oqishYuki('obyektlar', new URLSearchParams('kompaniya_id=433'))).toEqual({ p_kompaniya_id: 433, p_obyekt_id: null, p_ustama: false });
  });
  it('ustama=1 faqat bitta obyekt bilan; obyektsiz — baribir tez ro‘yxat (butun portfelga og‘ir hisob yo‘q)', () => {
    expect(oqishYuki('obyektlar', new URLSearchParams('kompaniya_id=433&obyekt_id=353&ustama=1'))).toEqual({ p_kompaniya_id: 433, p_obyekt_id: 353, p_ustama: true });
    expect(oqishYuki('obyektlar', new URLSearchParams('kompaniya_id=433&ustama=1'))).toEqual({ p_kompaniya_id: 433, p_obyekt_id: null, p_ustama: false });
  });
  it('RPC v2 chaqiriladi, actor sessiyadan; bitta so‘rov — bitta RPC (ketma-ket chaqiruv yo‘q)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const r = await onRequestGet(get('bolim=obyektlar&kompaniya_id=433'));
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/rest/v1/rpc/t2_zakazchik_obyektlar_v2');
    expect(JSON.parse(String(init.body))).toEqual({ p_actor_id: 7, p_kompaniya_id: 433, p_obyekt_id: null, p_ustama: false });
  });
});
