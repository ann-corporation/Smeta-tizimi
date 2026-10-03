import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './royxat-email-kod';

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key', SESSIYA_KALIT: 'a'.repeat(32), RESEND_API_KEY: 're_test', EMAIL_FROM: 'Smeta OS <noreply@example.com>' };
const ctx = (body: unknown, env = ENV) => ({ request: new Request('https://x/api/royxat-email-kod', { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body) }), env }) as any;

afterEach(() => vi.unstubAllGlobals());

describe('royxat-email-kod', () => {
  it('kod xeshi RPCga boradi, kod esa faqat Resendga boradi', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.includes('t2_royxat_email_kod_yarat_v1')) return { ok: true, json: async () => ({ ok: true, tasdiqlash_id: '11111111-1111-4111-8111-111111111111' }) };
      if (url === 'https://api.resend.com/emails') { expect(init?.body).toContain('123400'); return { ok: true, json: async () => ({ id: 'mail' }) }; }
      if (url.includes('t2_royxat_email_kod_yuborildi_v1')) return { ok: true, json: async () => ({ ok: true }) };
      throw new Error(url);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Math, 'random').mockReturnValue(0.026);
    const r = await onRequestPost(ctx({ email: 'Aziz@Gmail.com' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, tasdiqlash_id: '11111111-1111-4111-8111-111111111111' });
    const rpcBody = String(fetchMock.mock.calls[0][1]?.body);
    expect(rpcBody).not.toContain('123400');
    expect(JSON.parse(rpcBody).p_email).toBe('aziz@gmail.com');
  });

  it('email xizmati sozlanmagan bo‘lsa kod yaratmaydi', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const r = await onRequestPost(ctx({ email: 'aziz@gmail.com' }, { ...ENV, RESEND_API_KEY: '' }));
    expect(r.status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
  });
});
