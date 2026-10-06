import { afterEach, describe, expect, it, vi } from 'vitest';
import { kasbSavolOqim } from './t2-agent-ish';

const oqim = (qismlar: string[], tur = 'application/x-ndjson; charset=utf-8') => {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { qismlar.forEach((q) => c.enqueue(enc.encode(q))); c.close(); } }), { status: 200, headers: { 'content-type': tur } });
};
afterEach(() => vi.unstubAllGlobals());

describe('kasbSavolOqim', () => {
  it('qadamlar kelishi bilan chaqiriladi (bo‘lak chegarasidan qat’i nazar), yakunda to‘liq natija qaytadi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => oqim([
      '{"t":"qadam","ms":10,"belgi":"🔐","matn":"Lavozim"}\n{"t":"qa', 'dam","ms":20,"belgi":"🗄️","matn":"Ma’lumot"}\n',
      '{"t":"yakun","status":200,"ok":true,"javob":"Tayyor","qadamlar":[{"ms":10,"belgi":"🔐","matn":"Lavozim"}]}\n'])));
    const q: string[] = [];
    const y = await kasbSavolOqim(5, 'Omborda nima bor?', { qadam: (x) => q.push(x.matn) });
    expect(q).toEqual(['Lavozim', 'Ma’lumot']); expect(y).toMatchObject({ ok: true, javob: 'Tayyor' });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ amal: 'kasb_savol', kompaniya_id: 5, oqim: true });
  });
  it('oqim bo‘lmasa (401/400 JSON) — xato tushunarli qaytadi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'Kirish talab qilinadi' }), { status: 401, headers: { 'content-type': 'application/json' } })));
    expect(await kasbSavolOqim(5, 'x')).toMatchObject({ ok: false, error: 'Kirish talab qilinadi', status: 401 });
  });
  it('yakunsiz uzilgan oqim — «aloqa uzildi»; buzilgan satr e’tiborsiz', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => oqim(['{buzilgan\n{"t":"qadam","ms":1,"belgi":"x","matn":"a"}\n'])));
    expect(await kasbSavolOqim(5, 'x')).toMatchObject({ ok: false, error: expect.stringContaining('uzildi') });
  });
  it('tarmoq xatosi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await kasbSavolOqim(5, 'x')).toMatchObject({ ok: false, error: expect.stringContaining('offline') });
  });
});
