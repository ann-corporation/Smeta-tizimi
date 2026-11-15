import { describe, expect, it } from 'vitest';
import { imzola } from '../_shared/auth';
import { biletOch, biletYarat, siryXesh } from '../_shared/ilova-bilet';
import { onRequestPost } from './ilova-kirish';

const KALIT = 'test-kalit-0123456789abcdef0123456789abcdef';
const SIR = 'A'.repeat(43);
const post = (body: unknown, cookie?: string) => onRequestPost({ request: new Request('https://t/api/ilova-kirish', { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: JSON.stringify(body) }), env: { SESSIYA_KALIT: KALIT } } as never);

describe('ilova brauzer kirishi (bilet)', () => {
  it('bilet -> almash: sir bilan sessiya cookie beradi, sirsiz va eskirgan bilet rad', async () => {
    const tok = await imzola({ rol: 'pto', email: 'a@b.uz', foydalanuvchi_id: 7, kompaniyalar: [] } as never, KALIT);
    const h = await siryXesh(SIR);
    const r1 = await post({ amal: 'bilet', h }, 'sess=' + tok);
    const { bilet } = await r1.json() as { bilet: string };
    expect(bilet).toBeTruthy();
    const r2 = await post({ amal: 'almash', bilet, sir: SIR });
    expect(r2.status).toBe(200);
    expect(r2.headers.get('Set-Cookie')).toMatch(new RegExp('^sess=' + tok.replace('.', '\\.') + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=\\d{6,}'));
    expect((await post({ amal: 'almash', bilet, sir: 'B'.repeat(43) })).status).toBe(401);
    expect(await biletOch(bilet, SIR, KALIT, Date.now() + 121_000)).toBeNull();
    expect(await biletOch(bilet, SIR, 'boshqa-kalit-0123456789abcdef0123456789abcd')).toBeNull();
  });
  it('sessiyasiz bilet berilmaydi; noto\'g\'ri h rad', async () => {
    expect((await post({ amal: 'bilet', h: await siryXesh(SIR) })).status).toBe(401);
    const tok = await imzola({ rol: 'pto', email: 'a@b.uz', foydalanuvchi_id: 7, kompaniyalar: [] } as never, KALIT);
    expect((await post({ amal: 'bilet', h: 'qisqa' }, 'sess=' + tok)).status).toBe(400);
  });
  it('biletYarat deterministik emas (iv) va o\'qiladi', async () => {
    const h = await siryXesh(SIR);
    const a = await biletYarat('tok.en', h, KALIT), b = await biletYarat('tok.en', h, KALIT);
    expect(a).not.toBe(b);
    expect(await biletOch(a, SIR, KALIT)).toBe('tok.en');
  });
});
