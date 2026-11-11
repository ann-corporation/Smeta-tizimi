import { afterEach, describe, expect, it, vi } from 'vitest';
import { vaqtliFetch, yozAmali } from './supabase';

/* Hodisa 2026-11-09: Fakt jurnalida saqlash «internet uzildi» dedi, so'rov serverga yetmadi; yangi varaqda ishladi.
 * Bu testlar: xato sababi TO'G'RI aytiladi, bitta varaqdagi fetch nosozligi XHR zaxirasi bilan yengiladi, qotib qolish yo'q. */

const OP = '00000000-0000-4000-8000-000000000001';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const yozUrl = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => String(c[0]) === '/api/sb-yoz');

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

/** XMLHttpRequest o'rniga: berilgan javob yoki xato. */
function xhrStub(mode: 'ok' | 'error', body = '{"ok":true,"akt_id":9}') {
  const sent: string[] = [];
  class X {
    status = 0; responseText = ''; timeout = 0;
    onload: (() => void) | null = null; onerror: (() => void) | null = null; ontimeout: (() => void) | null = null;
    open() { /* noop */ } setRequestHeader() { /* noop */ }
    send(b: string) { sent.push(b); queueMicrotask(() => { if (mode === 'ok') { this.status = 200; this.responseText = body; this.onload?.(); } else this.onerror?.(); }); }
  }
  vi.stubGlobal('XMLHttpRequest', X);
  return sent;
}

describe('yozAmali — xato sababi haqiqatni aytadi', () => {
  it('server boshqa so‘rovga javob beryapti, lekin yozish fetch’i rad etilsa — SEND_FAILED va «internet sababchi emas»', async () => {
    const f = vi.fn(async (url: string) => { if (url === '/api/sessiya') return json({ ok: true }); throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', f); xhrStub('error');
    const r = await yozAmali({ amal: 'fakt_yoz_v2', operation_id: OP });
    expect(r).toMatchObject({ ok: false, code: 'SEND_FAILED' });
    expect(r.error).toMatch(/Internet aloqasi sababchi emas/);
    expect(r.diag).toMatch(/Failed to fetch.*probe=200/);
    expect(yozUrl(f)).toHaveLength(2); // asl + bitta qayta urinish (XHR alohida)
  });

  it('server ham ko‘rinmasa — NETWORK (tashxis bilan), oflayn bo‘lsa — OFFLINE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))); xhrStub('error');
    const net = await yozAmali({ amal: 'x', operation_id: OP });
    expect(net).toMatchObject({ ok: false, code: 'NETWORK' });
    expect(net.error).toMatch(/Serverga ulanib bo‘lmadi \(TypeError: Failed to fetch\)/);

    vi.stubGlobal('navigator', { onLine: false });
    const off = await yozAmali({ amal: 'x', operation_id: OP });
    expect(off).toMatchObject({ ok: false, code: 'OFFLINE' });
    expect(off.error).toMatch(/internetga ulanmagan/);
  });

  it('sessiya tugagan: 401 → SESSION_EXPIRED (server matni emas), probe 401 bo‘lsa ham', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, error: 'Кириш талаб қилинади' }, 401)));
    const a = await yozAmali({ amal: 'x', operation_id: OP });
    expect(a).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' });
    expect(a.error).toMatch(/Kirish muddati tugagan/);

    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url === '/api/sessiya') return json({ ok: false }, 401); throw new TypeError('Failed to fetch'); }));
    xhrStub('error');
    expect(await yozAmali({ amal: 'x', operation_id: OP })).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' });
  });

  it('5xx — SERVER; 403 — FORBIDDEN; server o‘z kodini bersa saqlanadi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })));
    expect(await yozAmali({ amal: 'x' })).toMatchObject({ ok: false, code: 'SERVER' });
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, error: 'yo‘q' }, 403)));
    expect(await yozAmali({ amal: 'x' })).toMatchObject({ ok: false, code: 'FORBIDDEN', error: 'yo‘q' });
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, code: 'AUTHORITY_UNAVAILABLE', error: 'e' }, 503)));
    expect(await yozAmali({ amal: 'x' })).toMatchObject({ code: 'AUTHORITY_UNAVAILABLE' });
  });

  it('seriyalash xatosi (aylanma havola) tarmoq xatosi deb aytilmaydi va fetch chaqirilmaydi', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const a: Record<string, unknown> = { amal: 'x' }; a.o = a;
    const r = await yozAmali(a);
    expect(r).toMatchObject({ ok: false, code: 'SERIALIZE' });
    expect(r.error).not.toMatch(/Internet/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('yozAmali — bitta varaqdagi fetch nosozligi (hodisa 2026-11-09) sahifani yangilamasdan yengiladi', () => {
  it('fetch ikki marta rad etilsa — XHR zaxirasi o‘sha tana va operation_id bilan yuboradi va saqlaydi', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', f);
    const sent = xhrStub('ok');
    const r = await yozAmali({ amal: 'fakt_yoz_v2', operation_id: OP, qatorlar: [{ qator_id: 1, hajm: 2 }] });
    expect(r).toMatchObject({ ok: true, akt_id: 9 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][1].body).toBe(sent[0]);
    expect(JSON.parse(sent[0]).operation_id).toBe(OP);
  });

  it('operation_id siz amal zaxira transportga o‘tmaydi (takror yozish xavfi)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const sent = xhrStub('ok');
    expect(await yozAmali({ amal: 'x' })).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
  });

  it('javob tanasi yarim yo‘lda to‘xtab qolsa ham so‘rov vaqt chegarasida uziladi (taymer sarlavhada tozalanmaydi)', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { signal = init.signal as AbortSignal; return new Response('{}'); }));
    await vaqtliFetch('/x', {}, 1000);
    expect(signal?.aborted).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(signal?.aborted).toBe(true);
  });
});
