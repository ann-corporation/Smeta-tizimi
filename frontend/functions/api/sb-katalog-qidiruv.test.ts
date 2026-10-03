import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './sb';
import { imzola } from '../_shared/auth';

/* Egasi (2026-10-03): katalog qidiruvi "keyinroq urinib ko'ring" deb qoldi, so'rov Supabase ga yetmagan.
 * Shlyuz (sb.ts) ni aynan shu so'rov bilan ishga tushirib, Supabase ga qanday URL ketishini tekshiramiz. */
const KALIT = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());

describe('/api/sb — platforma katalogi qidiruvi', () => {
  it('kirillcha so‘zlar va * bilan filtr Supabase ga yetadi va javob qaytadi', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify([{ id: 1, nom: 'Труба 57х3,5' }]), { status: 200, headers: { 'content-range': '0-0/1' } });
    }));
    const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KALIT);
    const req = new Request('https://x/api/sb', {
      method: 'POST', headers: { Cookie: 'sess=' + sess, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jadval: 't2_platforma_narx_manba_qator', filtr: 'nom=ilike.*труба*&nom=ilike.*57*', tartib: 'nom.asc', limit: 200 }),
    });
    const r = await onRequestPost({ request: req, env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KALIT } } as never);
    const j = await r.json() as { ok: boolean; error?: string; qatorlar?: unknown[] };
    expect(urls[0]).toContain('/rest/v1/t2_platforma_narx_manba_qator?');
    // Kirillcha qiymat Supabase URL ida percent-kodlangan (Cloudflare fetch xom UTF-8 bilan yiqilmasin).
    expect(urls[0]).toContain('nom=ilike.*%D1%82%D1%80%D1%83%D0%B1%D0%B0*');
    expect(urls[0]).not.toMatch(/[^\x20-\x7e]/);
    expect(j).toMatchObject({ ok: true, qatorlar: [{ id: 1 }] });
  });
});
