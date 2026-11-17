import { afterEach, describe, expect, it, vi } from 'vitest';
import { hajmBaho, onRequestPost } from './monitor';

const KALIT = 'k'.repeat(30);
const ENV = { BILDIRISHNOMA_CRON_KALIT: KALIT, SUPABASE_URL: 'https://p.supabase.co', SUPABASE_KEY: 's', MONITOR_EGASI_ID: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'a'.repeat(30) };
const post = (body: unknown, env: Record<string, unknown> = ENV, kalit: string | null = KALIT) =>
  onRequestPost({ request: new Request('https://x/api/telegram/monitor', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(kalit ? { 'X-Cron-Kalit': kalit } : {}) }, body: JSON.stringify(body) }), env } as never);
afterEach(() => vi.unstubAllGlobals());
function mock(dbBytes: number) {
  const f = vi.fn(async (url: string) => {
    if (url.includes('t2_db_hajm_v1')) return Response.json({ ok: true, db_bytes: dbBytes });
    if (url.includes('t2_telegram_manzil_v1')) return Response.json({ ok: true, yuborish: true, chat_id: 555 });
    return Response.json({ ok: true });
  });
  vi.stubGlobal('fetch', f); return f;
}
describe('monitor', () => {
  it('hajmBaho: 85% chegara', () => {
    expect(hajmBaho(508 * 1024 * 1024, undefined, undefined)).toMatchObject({ ogoh: true });
    expect(hajmBaho(400 * 1024 * 1024, '500', '85').ogoh).toBe(false);
    expect(hajmBaho(425 * 1024 * 1024, '500', '85').ogoh).toBe(true);
  });
  it('kalitsiz 403, sozlanmagan 503', async () => {
    expect((await post({ db: true }, ENV, 'x')).status).toBe(403);
    expect((await post({ db: true }, { ...ENV, BILDIRISHNOMA_CRON_KALIT: '' })).status).toBe(503);
    expect((await post({ db: true }, { ...ENV, MONITOR_EGASI_ID: '' })).status).toBe(503);
  });
  it('chegaradan oshsa egasiga Telegram xabari ketadi', async () => {
    const f = mock(450 * 1024 * 1024);
    const j = await (await post({ db: true })).json() as { ogoh: boolean; yuborildi: boolean };
    expect(j).toMatchObject({ ogoh: true, yuborildi: true });
    expect(f.mock.calls.some((x) => String(x[0]).includes('api.telegram.org') && String(x[0]).includes('sendMessage'))).toBe(true);
  });
  it('chegaradan past -> xabar yo\'q; db:true bo\'lmasa tekshiruv yo\'q', async () => {
    const f = mock(100 * 1024 * 1024);
    expect(await (await post({ db: true })).json()).toMatchObject({ ogoh: false });
    expect(f.mock.calls.some((x) => String(x[0]).includes('telegram'))).toBe(false);
    f.mockClear();
    expect(await (await post({})).json()).toMatchObject({ tekshirildi: false });
    expect(f).not.toHaveBeenCalled();
  });
});