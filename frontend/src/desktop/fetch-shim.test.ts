// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { desktopFetch, type NativeInvoke } from './fetch-shim';

describe('native-only Desktop transport', () => {
  it('passes no cookie or Authorization to renderer HTTP transport', async () => {
    const original = vi.fn(), invoke = vi.fn(async () => ({ status: 200, body: '{}', etag: null }));
    const response = await desktopFetch(original, invoke as NativeInvoke)('/api/sb', { method: 'POST', body: '{"x":1}',
      headers: { Cookie: 'forged', Authorization: 'forged', 'X-Caller-Authority': 'forged' } });
    expect(response.status).toBe(200);
    expect(original).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledExactlyOnceWith('desktop_request', { path: '/api/sb', method: 'POST', body: '{"x":1}', etag: null });
  });
  it.each(['https://example.org/api/sb', 'https://smeta-tizimi.pages.dev/api/sb', '/assets/app.js', '//example.org/api/x', '/api/../assets/x'])('does not acquire credentials for %s', async url => {
    const original = vi.fn(async () => new Response()), invoke = vi.fn();
    await desktopFetch(original, invoke as NativeInvoke)(url);
    expect(original).toHaveBeenCalledWith(url, undefined);
    expect(invoke).not.toHaveBeenCalled();
  });
  it('preserves matching conditional GET without inventing a body for 304', async () => {
    const invoke = vi.fn(async () => ({ status: 304, body: '', etag: 'v1' }));
    const r = await desktopFetch(vi.fn(), invoke as NativeInvoke)('/api/obyekt-paket?obyekt_id=4', { headers: { 'If-None-Match': 'v1' } });
    expect(r.status).toBe(304); expect(r.headers.get('ETag')).toBe('v1');
    expect(invoke.mock.calls[0]).toEqual(['desktop_request', { path: '/api/obyekt-paket?obyekt_id=4', method: 'GET', body: null, etag: 'v1' }]);
  });
  it('blocks aborted work and unsupported methods', async () => {
    const invoke = vi.fn(), fetcher = desktopFetch(vi.fn(), invoke as NativeInvoke);
    const controller = new AbortController(); controller.abort();
    await expect(fetcher('/api/sessiya', { signal: controller.signal })).rejects.toThrow('Aborted');
    await expect(fetcher('/api/sb', { method: 'DELETE' })).rejects.toThrow('METHOD_DENIED');
    expect(invoke).not.toHaveBeenCalled();
  });
});
