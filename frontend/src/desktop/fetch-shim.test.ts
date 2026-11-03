// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { desktopFetch } from './fetch-shim';

describe('Desktop API transport', () => {
  it('faqat lokal /api ni Cloudflarega Bearer bilan yuboradi', async () => {
    const fetcher = vi.fn(async () => new Response('{}')), token = vi.fn(async () => 'SYNTHETIC_TOKEN');
    await desktopFetch(fetcher, {token})('/api/sb?x=1', {method:'POST',body:'{"x":1}',headers:{'content-type':'application/json','authorization':'forged','cookie':'forged'}});
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://smeta-tizimi.pages.dev/api/sb?x=1');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer SYNTHETIC_TOKEN'); expect(headers.has('cookie')).toBe(false);
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"x":1}');
    expect(init.credentials).toBe('omit'); expect(init.redirect).toBe('error');
  });
  it.each(['https://example.org/api/sb','https://smeta-tizimi.pages.dev/api/sb','/assets/app.js','//example.org/api/steal','/api/../assets/x'])('tashqi yoki asset so‘rovda tokenni o‘qimaydi: %s', async url => {
    const fetcher = vi.fn(async()=>new Response()),token=vi.fn(async()=> 'SYNTHETIC_TOKEN');
    await desktopFetch(fetcher,{token})(url); expect(fetcher).toHaveBeenCalledWith(url, undefined); expect(token).not.toHaveBeenCalled();
  });
  it('Request body/header va caller override saqlanadi', async()=>{
    const fetcher=vi.fn(async()=>new Response());
    const req=new Request('http://tauri.localhost/api/save',{method:'POST',body:'original',headers:{'x-test':'yes'}});
    await desktopFetch(fetcher,{token:async()=>null})(req,{body:'override'});
    const init=(fetcher.mock.calls[0] as unknown as [string,RequestInit])[1];
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('override'); expect(new Headers(init.headers).get('x-test')).toBe('yes'); expect(new Headers(init.headers).has('authorization')).toBe(false);
  });
});
