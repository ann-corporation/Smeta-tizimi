// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { relizJavob, relizKalit } from './reliz-fayl';

const sha = 'ab'.repeat(32);
const BYTES = new TextEncoder().encode('0123456789');

function bucket(objects: Record<string, { meta?: Record<string, string> }>) {
  const mk = (key: string, range?: { offset: number; length: number }) => {
    const o = objects[key]; if (!o) return null;
    const body = range ? BYTES.slice(range.offset, range.offset + range.length) : BYTES;
    return { key, size: BYTES.length, customMetadata: o.meta, body: new Response(body).body };
  };
  return {
    head: vi.fn(async (key: string) => { const o = mk(key); return o ? { key, size: o.size, customMetadata: o.customMetadata } : null; }),
    get: vi.fn(async (key: string, opts?: { range?: { offset: number; length: number } }) => mk(key, opts?.range)),
  };
}
const call = (platform: 'windows' | 'android' | 'macos', path: string, r2: ReturnType<typeof bucket>, init?: RequestInit) =>
  relizJavob(platform, new Request(`https://app.example${path}`, init), { R2_CANONICAL: r2 as unknown as R2Bucket });

describe('reliz fayl marshruti', () => {
  it('android 200: sarlavhalar va R2 kaliti', async () => {
    const r2 = bucket({ [`reliz/android/1.2.3/${sha}/smeta-1.2.3-debug.apk`]: {} });
    const res = await call('android', `/android/1.2.3/${sha}/smeta-1.2.3-debug.apk`, r2);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('0123456789');
    expect(res.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
    expect(res.headers.get('Content-Length')).toBe('10');
    expect(res.headers.get('ETag')).toBe(`"${sha}"`);
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="smeta-1.2.3-debug.apk"');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('macos va windows (exe + INSTALL_RU.md): kalit joylashuvi va turlar', async () => {
    const r2 = bucket({
      [`reliz/macos/1.2.3/${sha}/Smeta_1.2.3.dmg`]: {},
      [`windows/0.1.0/${sha}/Smeta Tizimi_0.1.0_x64-setup.exe`]: {},
      [`windows/0.1.0/${sha}/INSTALL_RU.md`]: {},
    });
    expect((await call('macos', `/macos/1.2.3/${sha}/Smeta_1.2.3.dmg`, r2)).headers.get('Content-Type')).toBe('application/x-apple-diskimage');
    const exe = await call('windows', `/windows/0.1.0/${sha}/${encodeURIComponent('Smeta Tizimi_0.1.0_x64-setup.exe')}`, r2);
    expect(exe.status).toBe(200);
    expect(exe.headers.get('Content-Type')).toBe('application/vnd.microsoft.portable-executable');
    const md = await call('windows', `/windows/0.1.0/${sha}/INSTALL_RU.md`, r2);
    expect(md.status).toBe(200);
    expect(md.headers.get('Content-Type')).toContain('text/markdown');
  });

  it('windows msi (native desktop 0.2.0+)', async () => {
    const r2 = bucket({ [`windows/0.2.0/${sha}/QURAI-0.2.0.msi`]: {} });
    const msi = await call('windows', `/windows/0.2.0/${sha}/QURAI-0.2.0.msi`, r2);
    expect(msi.status).toBe(200);
    expect(msi.headers.get('Content-Type')).toBe('application/x-msi');
  });

  it('HEAD: tanasiz, Content-Length bilan', async () => {
    const r2 = bucket({ [`reliz/android/1.2.3/${sha}/a.apk`]: {} });
    const res = await call('android', `/android/1.2.3/${sha}/a.apk`, r2, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('10');
    expect(await res.text()).toBe('');
    expect(r2.get).not.toHaveBeenCalled();
  });

  it('Range: 206, suffix va 416', async () => {
    const r2 = bucket({ [`reliz/android/1.2.3/${sha}/a.apk`]: {} });
    const url = `/android/1.2.3/${sha}/a.apk`;
    const r = await call('android', url, r2, { headers: { Range: 'bytes=2-5' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(r.headers.get('Content-Length')).toBe('4');
    expect(await r.text()).toBe('2345');
    const s = await call('android', url, r2, { headers: { Range: 'bytes=-3' } });
    expect(s.status).toBe(206);
    expect(await s.text()).toBe('789');
    expect((await call('android', url, r2, { headers: { Range: 'bytes=50-' } })).status).toBe(416);
  });

  it('If-None-Match: 304', async () => {
    const r2 = bucket({ [`reliz/android/1.2.3/${sha}/a.apk`]: {} });
    expect((await call('android', `/android/1.2.3/${sha}/a.apk`, r2, { headers: { 'If-None-Match': `"${sha}"` } })).status).toBe(304);
  });

  it('yaroqsiz yo\'llar 404 va R2 ga umuman murojaat qilinmaydi', async () => {
    const r2 = bucket({});
    const bad = [
      `/android/1.2/${sha}/a.apk`, `/android/1.2.3/${sha.toUpperCase()}/a.apk`, `/android/1.2.3/${'a'.repeat(63)}/a.apk`,
      `/android/1.2.3/${sha}/a.exe`, `/android/1.2.3/${sha}/a.apk/`, `/android/1.2.3/${sha}/`, `/android/1.2.3/${sha}`,
      `/android/1.2.3/${sha}/../a.apk`, `/android/1.2.3/${sha}/%2e%2e%2fa.apk`, `/android/1.2.3/${sha}/a%2Fb.apk`,
      `/android/1.2.3/${sha}/a%5Cb.apk`, `/android/1.2.3/${sha}/..a.apk`, `/android/1.2.3/${sha}/%00.apk`,
      `/android/1.2.3/${sha}/.hidden.apk`, `/android/1.2.3/${sha}/a%.apk`, `/android/1.2.3/${sha}/x/a.apk`,
      `/android/../windows/0.1.0/${sha}/a.apk`, `/android//1.2.3/${sha}/a.apk`,
    ];
    for (const p of bad) expect((await call('android', p, r2)).status, p).toBe(404);
    expect((await call('windows', `/windows/0.1.0/${sha}/installer-manifest.json`, r2)).status).toBe(404);
    expect((await call('windows', `/windows/0.1.0/${sha}/install_ru.md`, r2)).status).toBe(404);
    expect((await call('macos', `/macos/1.2.3/${sha}/a.apk`, r2)).status).toBe(404);
    expect((await call('android', `/macos/1.2.3/${sha}/a.dmg`, r2)).status).toBe(404);
    expect(r2.head).not.toHaveBeenCalled();
    expect(r2.get).not.toHaveBeenCalled();
  });

  it('yo\'q obyekt 404; sha metadata mos kelmasa 404; boshqa prefiksga yetib bo\'lmaydi', async () => {
    const r2 = bucket({
      [`reliz/android/1.2.3/${sha}/bad.apk`]: { meta: { sha256: 'c'.repeat(64) } },
      [`secret/1.2.3/${sha}/a.apk`]: {}, [`hujjat/a.apk`]: {},
    });
    expect((await call('android', `/android/1.2.3/${sha}/missing.apk`, r2)).status).toBe(404);
    expect((await call('android', `/android/1.2.3/${sha}/bad.apk`, r2)).status).toBe(404);
    expect((await call('android', `/android/1.2.3/${sha}/a.apk`, r2)).status).toBe(404);
    for (const [key] of r2.head.mock.calls) expect(key).toMatch(/^(reliz\/(android|macos)|windows)\//);
  });

  it('POST 405; R2 binding yo\'q bo\'lsa 404', async () => {
    const r2 = bucket({});
    expect((await call('android', `/android/1.2.3/${sha}/a.apk`, r2, { method: 'POST' })).status).toBe(405);
    const res = await relizJavob('android', new Request(`https://app.example/android/1.2.3/${sha}/a.apk`), {});
    expect(res.status).toBe(404);
  });

  it('relizKalit: kalit tuzilishi', () => {
    expect(relizKalit('windows', `/windows/0.1.0/${sha}/INSTALL_RU.md`)?.key).toBe(`windows/0.1.0/${sha}/INSTALL_RU.md`);
    expect(relizKalit('macos', `/macos/1.0.0/${sha}/Smeta_1.0.0.dmg`)?.key).toBe(`reliz/macos/1.0.0/${sha}/Smeta_1.0.0.dmg`);
  });
});
