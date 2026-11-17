import { afterEach, describe, expect, it, vi } from 'vitest';
import { toshkentKunBoshi, workersAiHisobli } from './ai-bepul-hisob';

const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_KEY: 'k' };
afterEach(() => vi.unstubAllGlobals());
function setup(o: { tekshir?: unknown; user?: number; komp?: number } = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/rpc/t2_agent_sarf_tekshir_v1')) return Response.json(o.tekshir ?? { ok: true });
    if (url.includes('/rpc/t2_agent_sarf_yoz_v1')) return Response.json({ ok: true });
    const n = url.includes('actor_id=eq.') ? (o.user ?? 0) : (o.komp ?? 0);
    void init; return new Response('[]', { headers: { 'content-range': `*/${n}` } });
  });
  vi.stubGlobal('fetch', f); return f;
}
const chaqir = () => vi.fn(async () => ({ response: 'x', usage: { input_tokens: 5, output_tokens: 7 } }));

describe('Workers AI hisobli va chegarali', () => {
  it('muvaffaqiyatda token sarfi yoziladi', async () => {
    const f = setup(); const c = chaqir();
    await workersAiHisobli(env, 7, 17, c);
    expect(c).toHaveBeenCalledTimes(1);
    const yoz = f.mock.calls.filter((x) => String(x[0]).includes('t2_agent_sarf_yoz_v1'));
    expect(yoz).toHaveLength(1);
    expect(JSON.parse(String(yoz[0][1]?.body))).toMatchObject({ p_amal: 'jarvis_eski_cf', p_kirish: 5, p_chiqish: 7 });
  });
  it('byudjet yo\'q yoki a\'zo emas -> model chaqirilmaydi', async () => {
    setup({ tekshir: { ok: false, code: 'BYUDJET_YOQ' } }); const c = chaqir();
    await expect(workersAiHisobli(env, 7, 17, c)).rejects.toMatchObject({ kod: 'BYUDJET_YOQ' });
    expect(c).not.toHaveBeenCalled();
  });
  it('kunlik foydalanuvchi va kompaniya chegarasi', async () => {
    setup({ user: 20 }); let c = chaqir();
    await expect(workersAiHisobli(env, 7, 17, c)).rejects.toMatchObject({ kod: 'KUNLIK_FOYDALANUVCHI' });
    setup({ komp: 100 }); c = chaqir();
    await expect(workersAiHisobli(env, 7, 17, c)).rejects.toMatchObject({ kod: 'KUNLIK_KOMPANIYA' });
    expect(c).not.toHaveBeenCalled();
    setup({ user: 2 }); c = chaqir();
    await expect(workersAiHisobli({ ...env, JARVIS_CF_KUNLIK_FOYDALANUVCHI: '2' }, 7, 17, c)).rejects.toMatchObject({ kod: 'KUNLIK_FOYDALANUVCHI' });
  });
  it('sonni o\'qib bo\'lmasa fail-closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/rpc/') ? Response.json({ ok: true }) : new Response('x', { status: 500 })));
    const c = chaqir();
    await expect(workersAiHisobli(env, 7, 17, c)).rejects.toMatchObject({ kod: 'HISOB_XATOSI' });
    expect(c).not.toHaveBeenCalled();
  });
  it('model xatosida ham urinish kunlik hisobga yoziladi', async () => {
    const f = setup();
    await expect(workersAiHisobli(env, 7, 17, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(JSON.parse(String(f.mock.calls.filter((x) => String(x[0]).includes('sarf_yoz'))[0][1]?.body))).toMatchObject({ p_muvaffaqiyat: false });
  });
  it('Toshkent kun boshi = 19:00 UTC oldingi kun', () => {
    expect(toshkentKunBoshi(new Date('2026-11-17T10:00:00Z'))).toBe('2026-11-16T19:00:00.000Z');
    expect(toshkentKunBoshi(new Date('2026-11-17T20:00:00Z'))).toBe('2026-11-17T19:00:00.000Z');
  });
});