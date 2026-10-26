import { afterEach, describe, expect, it, vi } from 'vitest';
import { roleAuthority, mayWriteCompanies, vakolatKeshTozala, VAKOLAT_KESH_MS, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from './role-authority';
import { SESSIYA_MUDDAT_MS, type Sess } from './auth';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'server-only' };
const sess: Sess = { rol: 'superadmin', foydalanuvchi_id: 7, jti: 'test', exp: Date.now()+10000,
  kompaniyalar: [{ kompaniya_id: 1, rol: 'superadmin' }] };
const model = (platform_role = 'none', role = 'pto') => ({ ok: true, platform_role,
  foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: role, faol: true }],
  context_kompaniyalar: [{ kompaniya_id: 17, effective_role: role }] });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vakolatKeshTozala(); });
describe('vakolat keshi (egasi 2026-10-21: har so‘rovda qayta tekshirish ortiqcha)', () => {
  it('60 s ichida DB ga qayta bormaydi, keyin yangilaydi; xato javob keshlanmaydi', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(model('none', 'pto')), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    expect((await roleAuthority(sess, env))?.rol).toBe('pto');
    expect((await roleAuthority({ ...sess, rol: 'superadmin' }, env))?.rol).toBe('pto'); // cookie roliga ishonilmaydi
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(VAKOLAT_KESH_MS + 1);
    fetcher.mockImplementation(async () => new Response('{}', { status: 500 }));
    expect(await roleAuthority(sess, env)).toBeNull();
    expect(await roleAuthority(sess, env)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
describe('fresh server authority', () => {
  it('mixed boss A / reader B cannot write B through an entity ID', () => {
    const s = { ...sess, kompaniyalar: [{ kompaniya_id: 1, rol: 'boss' }, { kompaniya_id: 17, rol: 'rahbar' }] };
    expect(mayWriteCompanies(s, [1])).toBe(true);
    expect(mayWriteCompanies(s, [17])).toBe(false);
    expect(mayWriteCompanies(s, [1,17])).toBe(false);
    expect(mayWriteCompanies(s, [999])).toBe(false);
  });
  it.each(['rahbar','buyurtmachi','pudratchi','kuzatuvchi','unknown'])('readonly %s cannot write without explicit company_id either', rol => {
    expect(mayWriteCompanies({ ...sess, kompaniyalar: [{ kompaniya_id: 17, rol }] }, [])).toBe(false);
  });
  it('DB superadmin + PTO company is still superadmin; actor from verified session only', async () => {
    const fetcher = vi.fn(async (_url, init) => {
      expect(JSON.parse(init.body)).toEqual({ p_actor_id: 7 });
      return Response.json(model('superadmin', 'superadmin'));
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await roleAuthority({ ...sess, rol: 'pto' }, env);
    expect(result?.rol).toBe('superadmin');
    expect(result?.kompaniyalar).toEqual([{ kompaniya_id: 17, rol: 'superadmin' }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('revoked superadmin cookie cannot retain platform access', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(model())));
    expect((await roleAuthority(sess, env))?.rol).toBe('pto');
  });
  it('company boss is NOT a platform superadmin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(model('none', 'boss'))));
    expect((await roleAuthority(sess, env))?.rol).toBe('boss');
  });
  it('old cookie memberships are replaced, not merged (A → B)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(model())));
    expect((await roleAuthority(sess, env))?.kompaniyalar?.some(a => a.kompaniya_id === 1)).toBe(false);
  });
  it.each([401,403,500,503])('DB HTTP %s fails closed', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));
    expect(await roleAuthority(sess, env)).toBeNull();
  });
  it('inactive actor fails closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...model(), foydalanuvchi: { holat: 'bloklangan' } })));
    expect(await roleAuthority(sess, env)).toBeNull();
  });
  it('missing actor makes NO upstream request', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(await roleAuthority({ ...sess, foydalanuvchi_id: undefined }, env)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('DB exception fails closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await roleAuthority(sess, env)).toBeNull();
  });
});

describe('sessiya bekor qilish (t2_men_v1.foydalanuvchi.sessiya_bekor_dan)', () => {
  const iatBilan = (iat: number): Sess => ({ ...sess, exp: iat + SESSIYA_MUDDAT_MS });
  const bekorli = (bekor?: string | null) => ({ ...model('none', 'pto'), foydalanuvchi: { holat: 'faol', ...(bekor === undefined ? {} : { sessiya_bekor_dan: bekor }) } });
  const stub = (m: unknown) => { const f = vi.fn(async () => Response.json(m)); vi.stubGlobal('fetch', f); return f; };

  it('cookie bekor qilishdan OLDIN chiqarilgan → null', async () => {
    const now = Date.now();
    stub(bekorli(new Date(now).toISOString()));
    expect(await roleAuthority(iatBilan(now - 60_000), env)).toBeNull();
  });
  it('cookie bekor qilishdan KEYIN chiqarilgan → ok', async () => {
    const now = Date.now();
    stub(bekorli(new Date(now - 60_000).toISOString()));
    expect((await roleAuthority(iatBilan(now), env))?.rol).toBe('pto');
  });
  it('2 s soat siljishi chegarasi: 1 s oldingi — ok, 3 s oldingi — null', async () => {
    const now = Date.now();
    stub(bekorli(new Date(now).toISOString()));
    expect((await roleAuthority(iatBilan(now - 1000), env))?.rol).toBe('pto');
    vakolatKeshTozala();
    expect(await roleAuthority(iatBilan(now - 3000), env)).toBeNull();
  });
  it('maydon yo‘q (eski DB) yoki null → xatti-harakat o‘zgarmaydi', async () => {
    stub(bekorli());
    expect((await roleAuthority(sess, env))?.rol).toBe('pto');
    vakolatKeshTozala();
    stub(bekorli(null));
    expect((await roleAuthority(sess, env))?.rol).toBe('pto');
  });
  it('kesh ham bekor ni qo‘llaydi: keshdan o‘qilganda eski cookie rad etiladi, yangisi o‘tadi', async () => {
    const now = Date.now();
    const f = stub(bekorli(new Date(now).toISOString()));
    expect((await roleAuthority(iatBilan(now + 5000), env))?.rol).toBe('pto');   // yangi cookie → keshga yoziladi
    expect(await roleAuthority(iatBilan(now - 60_000), env)).toBeNull();          // kesh urishi, eski cookie
    expect((await roleAuthority(iatBilan(now + 6000), env))?.rol).toBe('pto');
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('yaroqsiz sessiya 401 bilan farqlanadi (503 emas)', () => {
  it('birlashtirilgan/faol emas hisob — yaroqsiz; tarmoq xatosi — yaroqsiz emas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...model(), foydalanuvchi: { holat: 'birlashtirildi' } }), { status: 200 })));
    const a = { ...sess, foydalanuvchi_id: 91 };
    expect(await roleAuthority(a, env)).toBeNull();
    expect(sessiyaYaroqsizmi(a)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    const b = { ...sess, foydalanuvchi_id: 92 };
    expect(await roleAuthority(b, env)).toBeNull();
    expect(sessiyaYaroqsizmi(b)).toBe(false);
  });
  it('hisob topilmadi / birlashtirilgan (t2_men_v1 ACTOR_NOT_FOUND) — yaroqsiz (401), boshqa ok:false — yaroqsiz emas (503)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, code: 'ACTOR_NOT_FOUND' }), { status: 200 })));
    const a = { ...sess, foydalanuvchi_id: 94 };
    expect(await roleAuthority(a, env)).toBeNull();
    expect(sessiyaYaroqsizmi(a)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, code: 'BOSHQA' }), { status: 200 })));
    const b = { ...sess, foydalanuvchi_id: 95 };
    expect(await roleAuthority(b, env)).toBeNull();
    expect(sessiyaYaroqsizmi(b)).toBe(false);
  });
  it('bekor qilingan sessiya (kesh orqali ham) — yaroqsiz; javob 401 va cookie tozalanadi', async () => {
    const bekor = new Date(Date.now() + 60_000).toISOString();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...model(), foydalanuvchi: { holat: 'faol', sessiya_bekor_dan: bekor } }), { status: 200 })));
    const eski = { ...sess, foydalanuvchi_id: 93, exp: Date.now() + SESSIYA_MUDDAT_MS - 3_600_000 };
    expect(await roleAuthority(eski, env)).toBeNull();
    expect(sessiyaYaroqsizmi(eski)).toBe(true);
    const keshdan = { ...eski };
    expect(await roleAuthority(keshdan, env)).toBeNull();
    expect(sessiyaYaroqsizmi(keshdan)).toBe(true);
    const r = yaroqsizSessiyaJavob();
    expect(r.status).toBe(401);
    expect(r.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
