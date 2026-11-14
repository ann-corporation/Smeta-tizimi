/* /api/kirish — TELEFON + PAROL yo'li (KIRISH_TELEFON_YOQILGAN). SINTETIK ma'lumot. Eski yo'l (o'chiq sozlama) o'zgarmagani ham tekshiriladi. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './kirish';

const ENV = { GAS_URL: 'https://gas.example/exec', GAS_TOKEN: 'gas-token', SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key', SESSIYA_KALIT: 'a'.repeat(32), KIRISH_TELEFON_YOQILGAN: '1' };
const ctxOf = (body: unknown, env: Record<string, unknown> = ENV) => ({ request: new Request('http://x/api/kirish', { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': '203.0.113.9' } }), env }) as any;

function tarmoq(o: { limit?: unknown; parolTekshir?: unknown }) {
  const rpc: { nom: string; yuk: any }[] = []; const gas: string[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENV.GAS_URL) { gas.push(url); return { ok: true, json: async () => ({ ok: true, data: 'prorab' }) } as Response; }
    const nom = url.split('/rpc/')[1]; rpc.push({ nom, yuk: init?.body ? JSON.parse(String(init.body)) : {} });
    if (nom === 't2_kirish_tel_limit_v1') return { ok: true, json: async () => o.limit ?? { ok: true } } as Response;
    if (nom === 't2_parol_tekshir_v1') return { ok: true, json: async () => o.parolTekshir } as Response;
    if (nom === 't2_kirish_royxatga_ol') return { ok: true, text: async () => JSON.stringify({ ok: true, foydalanuvchi_id: 9, azoliklar: [{ kompaniya_id: 17, rol: 'usta' }] }) } as Response;
    throw new Error('kutilmagan: ' + nom);
  });
  vi.stubGlobal('fetch', f);
  return { rpc, gas };
}
afterEach(() => vi.unstubAllGlobals());

describe('telefon + parol', () => {
  it('muvaffaqiyat: login E.164 ga keltirilib bazaga ketadi; GAS chaqirilmaydi; limit tekshirilgan', async () => {
    const t = tarmoq({ parolTekshir: { ok: true, rol: 'usta', foydalanuvchi_id: 9 } });
    const r = await onRequestPost(ctxOf({ login: '+998 90 123 45 67', parol: 'Yaxshi-Parol-77' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('Set-Cookie')).toMatch(/^sess=.+; HttpOnly; Secure; SameSite=Lax; Path=\//);
    expect(t.rpc.map((x) => x.nom)).toEqual(['t2_kirish_tel_limit_v1', 't2_parol_tekshir_v1', 't2_kirish_royxatga_ol']);
    expect(t.rpc[0].yuk).toMatchObject({ p_telefon: '+998901234567', p_xato: false });
    expect(t.rpc[1].yuk.p_login).toBe('+998901234567');
    expect(t.gas).toHaveLength(0);
  });
  it('xato parol → 401 va xato hisoblanadi (p_xato:true); GAS ga qaytilmaydi', async () => {
    const t = tarmoq({ parolTekshir: { ok: false, code: 'PAROL_NOTOGRI' } });
    const r = await onRequestPost(ctxOf({ login: '901234567', parol: 'noto‘g‘ri' }));
    expect(r.status).toBe(401);
    expect(t.rpc.filter((x) => x.nom === 't2_kirish_tel_limit_v1').map((x) => x.yuk.p_xato)).toEqual([false, true]);
    expect(t.gas).toHaveLength(0);
  });
  it('parolsiz (Telegram orqali ochilgan) yoki mavjud emas hisob → GAS ga TUSHMAYDI, aynan o‘sha rad javobi', async () => {
    const t = tarmoq({ parolTekshir: { ok: false, code: 'NO_PASSWORD_SET' } });
    const a = await onRequestPost(ctxOf({ login: '+998901234567', parol: 'Yaxshi-Parol-77' }));
    expect(a.status).toBe(401);
    expect(t.gas).toHaveLength(0);
    const t2 = tarmoq({ parolTekshir: { ok: false, code: 'PAROL_NOTOGRI' } });
    const b = await onRequestPost(ctxOf({ login: '+998901234567', parol: 'Yaxshi-Parol-77' }));
    expect(await a.json()).toEqual(await b.json()); // hisob bor-yo'qligi/parol holati farqlanmaydi
    expect(t2.gas).toHaveLength(0);
  });
  it('limit → 429, parol tekshirilmaydi; limit xizmati javob bermasa → 503 (fail-closed)', async () => {
    const t = tarmoq({ limit: { ok: false, code: 'LIMIT' } });
    expect((await onRequestPost(ctxOf({ login: '+998901234567', parol: 'x-parol-123' }))).status).toBe(429);
    expect(t.rpc.map((x) => x.nom)).toEqual(['t2_kirish_tel_limit_v1']);
    tarmoq({ limit: { message: 'not found' } });
    expect((await onRequestPost(ctxOf({ login: '+998901234567', parol: 'x-parol-123' }))).status).toBe(503);
  });
  it('sozlama O‘CHIQ bo‘lsa telefon yo‘li ishlamaydi: eski yo‘l (limit RPC yo‘q, login o‘zgarmaydi)', async () => {
    const t = tarmoq({ parolTekshir: { ok: false, code: 'PAROL_NOTOGRI' } });
    await onRequestPost(ctxOf({ login: '+998901234567', parol: 'x-parol-123' }, { ...ENV, KIRISH_TELEFON_YOQILGAN: undefined }));
    expect(t.rpc.map((x) => x.nom)).toEqual(['t2_parol_tekshir_v1']);
    expect(t.rpc[0].yuk.p_login).toBe('+998901234567');
  });
  it('oddiy login (telefon emas) o‘zgarmaydi: limit RPC chaqirilmaydi', async () => {
    const t = tarmoq({ parolTekshir: { ok: false, code: 'PAROL_NOTOGRI' } });
    await onRequestPost(ctxOf({ login: 'sinov', parol: 'x-parol-123' }));
    expect(t.rpc.map((x) => x.nom)).toEqual(['t2_parol_tekshir_v1']);
  });
});
