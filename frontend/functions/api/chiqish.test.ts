import { describe, expect, it } from 'vitest';
import { onRequestPost } from './chiqish';

describe('/api/chiqish', () => {
  it('HttpOnly sessiya cookie si serverda o‘chiriladi', async () => {
    const r = await onRequestPost({ request: new Request('https://t/api/chiqish', { method: 'POST' }) } as never);
    expect(r.status).toBe(200);
    expect(r.headers.get('Set-Cookie')).toMatch(/^sess=;.*HttpOnly.*Max-Age=0/);
  });
  it('boshqa saytdan chaqirilsa rad etiladi', async () => {
    const r = await onRequestPost({ request: new Request('https://t/api/chiqish', { method: 'POST', headers: { Origin: 'https://evil.example' } }) } as never);
    expect(r.status).toBe(403);
  });
});
