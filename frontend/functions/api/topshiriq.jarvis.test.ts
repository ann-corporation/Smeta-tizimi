// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { onRequestPost } from './topshiriq';
const state = vi.hoisted(() => ({ actor: 7, accountActive: true, directory: true, allowed: true, denied: false, memberCompany: 17, memberActive: true, object: 31,
  memberName: 'Sinov ijrochi', memberRead: vi.fn(), notifications: vi.fn(), calls: [] as Array<{ name: string; body: Record<string, unknown> }> }));
vi.mock('../_shared/permission-policy', () => ({ cachedAuthority: () => state.actor ? { foydalanuvchi_id: state.actor } : null }));
vi.mock('../_shared/auth', () => ({ tekshir: async () => null }));
vi.mock('./sb', () => ({ onRequestPost: state.memberRead }));
vi.mock('../_shared/telegram', () => ({ fonda: (_c: unknown, work: Promise<unknown>) => work, telegramYubor: state.notifications }));
const op = '123e4567-e89b-42d3-a456-426614174000';
const args = { sarlavha: 'Sintetik tekshiruv', obyekt_id: 31, ijrochi_foydalanuvchi_id: 8 };
const post = (body: unknown) => onRequestPost({ env: { SESSIYA_KALIT: 's'.repeat(32), SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_KEY: 'synthetic' },
  request: new Request('https://app.invalid/api/topshiriq', { method: 'POST', headers: { Cookie: 'sess=synthetic' }, body: JSON.stringify(body) }) } as never);
const preview = () => post({ amal: 'jarvis_preview', kompaniya_id: 17, operation_id: op, args });
const confirm = (token: unknown, extra = {}) => post({ amal: 'jarvis_confirm', kompaniya_id: 17, token, tasdiqlayman: true, ...extra });
beforeEach(() => {
  Object.assign(state, { actor: 7, accountActive: true, directory: true, allowed: true, denied: false, memberCompany: 17, memberActive: true, object: 31, memberName: 'Sinov ijrochi', calls: [] });
  vi.clearAllMocks(); state.notifications.mockResolvedValue(undefined);
  state.memberRead.mockImplementation(async ({ request }: { request: Request }) => {
    expect(request.url).toBe('https://app.invalid/api/sb'); expect(request.headers.get('Cookie')).toBe('sess=synthetic');
    expect(await request.json()).toEqual({ jadval: 't2_azolik_royxat', filtr: 'kompaniya_id=eq.17&foydalanuvchi_id=eq.8',
      ustunlar: 'kompaniya_id,foydalanuvchi_id,holat,ism,login', limit: 2 });
    return Response.json({ ok: true, qatorlar: [{ kompaniya_id: state.memberCompany, foydalanuvchi_id: 8,
      holat: state.memberActive ? 'faol' : 'bekor', ism: state.memberName, login: 'synthetic' }] });
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const name = String(url).split('/').at(-1)!; const body = JSON.parse(String(init.body)); state.calls.push({ name, body });
    if (name === 't2_men_v1') return Response.json({ ok: true, foydalanuvchi: { holat: state.accountActive ? 'faol' : 'blok' }, context_kompaniyalar: [{ kompaniya_id: 17,
      permissions: [...(state.allowed ? ['fakt.write'] : []), ...(state.directory ? ['company.read'] : [])], explicit_denials: state.denied ? ['fakt.write'] : [] }] });
    if (name === 't2_agent_fakt_v1') return Response.json({ ok: true, fakt: { obyektlar: [{ id: state.object, nom: 'Sinov obyekt' }] } });
    if (name === 't2_topshiriq_ber_v1') return Response.json({ ok: true, id: 91, versiya: 1, takror: state.calls.filter(x => x.name === name).length > 1 });
    throw Error('Unexpected endpoint ' + name);
  }));
});
afterEach(() => vi.unstubAllGlobals());
it('previews verified names without writing, then confirms via the original writer/notification/idempotency', async () => {
  const response = await preview(); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  const p = await response.json() as Record<string, unknown>; expect(p).toMatchObject({ holat: 'tasdiq_kerak', obyekt_nom: 'Sinov obyekt', ijrochi_nom: 'Sinov ijrochi', args: { muddat: null } });
  expect(state.calls.map(x => x.name)).toEqual(['t2_men_v1', 't2_agent_fakt_v1']); expect(state.notifications).not.toHaveBeenCalled();
  expect((await confirm(p.token)).status).toBe(200); expect(((await (await confirm(p.token)).json()) as Record<string, unknown>).takror).toBe(true);
  const writes = state.calls.filter(x => x.name === 't2_topshiriq_ber_v1'); expect(writes).toHaveLength(2);
  expect(writes[0].body).toEqual(writes[1].body); expect(writes[0].body).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 17,
    p_ijrochi_kompaniya_id: 17, p_ijrochi_foydalanuvchi_id: 8, p_operation_id: p.operation_id, p_muddat: null });
  expect(state.notifications).toHaveBeenCalledTimes(1);
});
it.each(['foreign member', 'inactive member', 'foreign object', 'explicit denial', 'missing permission'])('refuses %s before preview/write', async mode => {
  if (mode === 'foreign member') state.memberCompany = 99;
  if (mode === 'inactive member') state.memberActive = false;
  if (mode === 'foreign object') state.object = 99;
  if (mode === 'explicit denial') state.denied = true;
  if (mode === 'missing permission') state.allowed = false;
  expect((await preview()).status).toBe(403); expect(state.calls.some(x => x.name === 't2_topshiriq_ber_v1')).toBe(false);
  if (mode.includes('permission') || mode === 'explicit denial') expect(state.memberRead).not.toHaveBeenCalled();
});
it('rechecks revoked permission, renamed recipient, actor and company at confirmation', async () => {
  const p = await (await preview()).json() as Record<string, unknown>; state.memberName = 'O‘zgargan'; expect((await confirm(p.token)).status).toBe(409);
  state.memberName = 'Sinov ijrochi'; state.allowed = false; expect((await confirm(p.token)).status).toBe(403);
  state.allowed = true; state.actor = 9; expect((await confirm(p.token)).status).toBe(403);
  state.actor = 7; expect((await confirm(p.token, { kompaniya_id: 99 })).status).toBe(403);
  expect(state.calls.some(x => x.name === 't2_topshiriq_ber_v1')).toBe(false);
});
it('rejects model confirmation, replacement payload, missing session and malformed body', async () => {
  const p = await (await preview()).json() as Record<string, unknown>; expect((await confirm(p.token, { tasdiqlayman: 'true' })).status).toBe(400);
  expect((await confirm(p.token, { args: { sarlavha: 'Injected' } })).status).toBe(400);
  expect((await post(null)).status).toBe(400); state.actor = 0; expect((await preview()).status).toBe(401);
  expect(state.calls.some(x => x.name === 't2_topshiriq_ber_v1')).toBe(false);
});
it('refuses a blocked actor before reading members or writing', async () => {
  state.accountActive = false; expect((await preview()).status).toBe(401);
  expect(state.memberRead).not.toHaveBeenCalled(); expect(state.calls.map(x => x.name)).toEqual(['t2_men_v1']);
});
it('does not bypass the existing directory read permission to name a selected recipient/object', async () => {
  state.directory = false; const response = await preview(); expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'TASK_DIRECTORY_PERMISSION' });
  expect(state.memberRead).not.toHaveBeenCalled(); expect(state.calls.map(x => x.name)).toEqual(['t2_men_v1']);
});
it('still permits a company-queue draft without reading a denied directory', async () => {
  state.directory = false;
  const response = await post({ amal: 'jarvis_preview', kompaniya_id: 17, operation_id: op, args: { sarlavha: 'Umumiy tekshiruv' } });
  expect(response.status).toBe(200); expect(state.memberRead).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ args: { muddat: null }, obyekt_nom: null, ijrochi_nom: null });
  expect(state.calls.map(x => x.name)).toEqual(['t2_men_v1']);
});
