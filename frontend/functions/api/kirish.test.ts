/**
 * T2-AUTH-PASSWORD-MIGRATION-001 -- dual-check login proof.
 * Every existing GAS-only login must keep working unchanged
 * (NO_PASSWORD_SET -> GAS, exactly like before this task). A login that HAS
 * a Supabase hash must NEVER fall through to GAS -- neither on success
 * (would silently double the source of truth) nor on failure (would let a
 * stale/different GAS password bypass an explicitly-set Supabase one).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './kirish';

const ENV = {
  GAS_URL: 'https://gas.example/exec', GAS_TOKEN: 'gas-token',
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key',
  SESSIYA_KALIT: 'a'.repeat(32),
};

function ctxOf(body: unknown) {
  return { request: new Request('http://x/api/kirish', { method: 'POST', body: JSON.stringify(body) }), env: ENV } as any;
}

function fetchMock(opts: { parolTekshir?: unknown; gas?: unknown; kirishRoyxat?: unknown }) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('/rpc/t2_parol_tekshir_v1')) {
      return { ok: true, json: async () => opts.parolTekshir } as Response;
    }
    if (url === ENV.GAS_URL) {
      return { ok: true, json: async () => opts.gas ?? { ok: false, data: null } } as Response;
    }
    if (url.includes('/rpc/t2_kirish_royxatga_ol')) {
      return { ok: true, text: async () => JSON.stringify(opts.kirishRoyxat ?? { ok: true, foydalanuvchi_id: 1, azoliklar: [] }) } as Response;
    }
    throw new Error('kutilmagan fetch: ' + url);
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('kirish -- Supabase/GAS dual-check', () => {
  it('NO_PASSWORD_SET -> eski GAS yo\'liga o\'tadi (mavjud foydalanuvchilar buzilmaydi)', async () => {
    const fetchSpy = fetchMock({ parolTekshir: { ok: false, code: 'NO_PASSWORD_SET' }, gas: { ok: true, data: 'prorab' } });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(ctxOf({ login: 'eski_foydalanuvchi', parol: 'gas-parol' }));
    expect(res.status).toBe(200);
    expect(fetchSpy.mock.calls.some((c) => c[0] === ENV.GAS_URL)).toBe(true);
    expect(res.headers.get('Set-Cookie')).toMatch(/^sess=/);
  });

  it('Supabase hash mos keladi -> GAS UMUMAN chaqirilmaydi', async () => {
    const fetchSpy = fetchMock({ parolTekshir: { ok: true, foydalanuvchi_id: 7, rol: 'prorab' } });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(ctxOf({ login: 'yangi_azo', parol: 'togri-parol-123' }));
    expect(res.status).toBe(200);
    expect(fetchSpy.mock.calls.some((c) => c[0] === ENV.GAS_URL)).toBe(false);
    expect(res.headers.get('Set-Cookie')).toMatch(/^sess=/);
  });

  it('Supabase hash bor, lekin mos kelmadi -> darhol rad etiladi, GAS\'ga QAYTILMAYDI', async () => {
    const fetchSpy = fetchMock({ parolTekshir: { ok: false, code: 'PAROL_NOTOGRI' }, gas: { ok: true, data: 'prorab' } });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(ctxOf({ login: 'yangi_azo', parol: 'notogri' }));
    expect(res.status).toBe(401);
    // GAS'da (nazariy) mos kelishi mumkin bo'lsa ham -- chaqirilmasligi SHART.
    expect(fetchSpy.mock.calls.some((c) => c[0] === ENV.GAS_URL)).toBe(false);
  });
});

describe('kirish -- birlashtirilgan hisob (t2_hisob_birlashtir_v1)', () => {
  it('RPC omon qolgan hisobni qaytarsa — sessiya O\'SHA hisobga beriladi (login kanonik resolve ga ham shu ketadi)', async () => {
    const fetchSpy = fetchMock({
      parolTekshir: { ok: true, foydalanuvchi_id: 183, login: 'anvar@gmail.com', rol: 'superadmin' },
      kirishRoyxat: { ok: true, foydalanuvchi_id: 183, azoliklar: [{ kompaniya_id: 1, rol: 'superadmin' }, { kompaniya_id: 39, rol: 'pto' }] },
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await onRequestPost(ctxOf({ login: 'admin', parol: 'eski-admin-parol' }));
    expect(res.status).toBe(200);
    const resolve = fetchSpy.mock.calls.find((c) => String(c[0]).includes('/rpc/t2_kirish_royxatga_ol'))!;
    expect(JSON.parse(String((resolve[1] as RequestInit).body)).p_login).toBe('anvar@gmail.com');
    const { tekshir } = await import('../_shared/auth');
    const s = await tekshir(res.headers.get('Set-Cookie')!.split(';')[0], ENV.SESSIYA_KALIT);
    expect(s?.foydalanuvchi_id).toBe(183);
    expect(s?.email).toBe('anvar@gmail.com');
    expect(fetchSpy.mock.calls.some((c) => c[0] === ENV.GAS_URL)).toBe(false);
  });
  it('oddiy hisobda `login` kelmaydi → kiritilgan login ishlatiladi (o\'zgarish yo\'q)', async () => {
    const fetchSpy = fetchMock({ parolTekshir: { ok: true, foydalanuvchi_id: 7, rol: 'prorab' } });
    vi.stubGlobal('fetch', fetchSpy);
    await onRequestPost(ctxOf({ login: 'yangi_azo', parol: 'togri-parol-123' }));
    const resolve = fetchSpy.mock.calls.find((c) => String(c[0]).includes('/rpc/t2_kirish_royxatga_ol'))!;
    expect(JSON.parse(String((resolve[1] as RequestInit).body)).p_login).toBe('yangi_azo');
  });
});
