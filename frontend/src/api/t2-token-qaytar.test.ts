import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kutilayotganQaytarishlar, tokenBilan } from './t2-token';

/* Audit 2026-10-21 (CODE-06): token qaytarish xatosi yutilmasin, foydalanuvchiga «qaytarildi» deb yolg'on aytilmasin. */
type Javob = { ok: boolean; [k: string]: unknown };
function server(qaytarish: () => Javob) {
  const amallar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body ?? '{}')) as { amal?: string };
    amallar.push(String(b.amal));
    const j = b.amal === 'token_sarfla_v1' ? { ok: true, sarflandi: 5, balans: 95 } : qaytarish();
    return new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return amallar;
}
const xatoIsh = async () => { throw new Error('Fayl yaratilmadi'); };

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('token qaytarish — ishonchli va halol', () => {
  it('qaytarish muvaffaqiyatli — «token qaytarildi»', async () => {
    const amallar = server(() => ({ ok: true }));
    const r = await tokenBilan({ kompaniyaId: 17, amal: 'hujjat' }, xatoIsh);
    expect(r).toEqual({ ok: false, xabar: 'Fayl yaratilmadi — token qaytarildi.' });
    expect(amallar.filter((a) => a === 'token_qaytar_v1')).toHaveLength(1);
    expect(localStorage.getItem('t2_token_qaytar_navbat_v1')).toBeNull();
  });

  it('qaytarish 3 marta o‘tmasa — «qaytarildi» deyilmaydi, navbatga yoziladi; keyin navbatdan qaytariladi', async () => {
    let qaytarishOk = false;
    const amallar = server(() => (qaytarishOk ? { ok: true } : { ok: false, error: 'server band' }));
    const r = await tokenBilan({ kompaniyaId: 17, amal: 'hujjat' }, xatoIsh);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.xabar).toContain('qaytarib bo‘lmadi');
    expect(!r.ok && r.xabar).not.toContain('token qaytarildi');
    expect(amallar.filter((a) => a === 'token_qaytar_v1')).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem('t2_token_qaytar_navbat_v1') ?? '[]')).toHaveLength(1);

    qaytarishOk = true;
    expect(await kutilayotganQaytarishlar()).toBe(1);
    expect(localStorage.getItem('t2_token_qaytar_navbat_v1')).toBeNull();
  }, 15000);

  it('token sarflanmagan bo‘lsa (bepul takror) — qaytarish chaqirilmaydi', async () => {
    const amallar: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      amallar.push(String((JSON.parse(String(init?.body ?? '{}')) as { amal?: string }).amal));
      return new Response(JSON.stringify({ ok: true, sarflandi: 0, bepul_takror: true }), { status: 200 });
    }));
    const r = await tokenBilan({ kompaniyaId: 17, amal: 'hujjat' }, xatoIsh);
    expect(r).toEqual({ ok: false, xabar: 'Fayl yaratilmadi' });
    expect(amallar).not.toContain('token_qaytar_v1');
  });
});
