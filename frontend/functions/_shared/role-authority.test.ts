import { afterEach, describe, expect, it, vi } from 'vitest';
import { roleAuthority, mayWriteCompanies } from './role-authority';
import type { Sess } from './auth';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'server-only' };
const sess: Sess = { rol: 'superadmin', foydalanuvchi_id: 7, jti: 'test', exp: Date.now()+10000,
  kompaniyalar: [{ kompaniya_id: 1, rol: 'superadmin' }] };
const model = (platform_role = 'none', role = 'pto') => ({ ok: true, platform_role,
  foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: role, faol: true }],
  context_kompaniyalar: [{ kompaniya_id: 17, effective_role: role }] });
afterEach(() => vi.unstubAllGlobals());
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
