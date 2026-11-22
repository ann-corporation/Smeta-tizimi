import { beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola, type Sess } from '../../../frontend/functions/_shared/auth';
import { roleAuthority } from '../../../frontend/functions/_shared/role-authority';
import { SMETA_MCP_PERMISSIONS, SMETA_MCP_READS } from '../../../frontend/src/lib/jarvis/mcp-contract';
import { mockHovuz } from '../../smeta-mcp/test/mock';
import type { Env } from '../src/env';
import * as siyosat from '../src/siyosat';
import { SOROV_MAX } from '../src/mcp';
import worker from '../src/worker';
import { smetaMcpClient } from '../../../frontend/functions/_shared/jarvis/mcp-client';
import { normativR2CacheClear } from '../../../frontend/functions/_shared/normativ-r2-index';

vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {}, env: {} }));
vi.mock('../../../frontend/functions/_shared/role-authority', async orig => ({
  ...await orig<typeof import('../../../frontend/functions/_shared/role-authority')>(), roleAuthority: vi.fn(),
}));
const pool = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/hovuz', () => ({ hyperdriveHovuz: () => pool.get() }));
const secret = 'synthetic-jarvis-sso-secret';
const company = { kompaniya_id: 17, rol: 'pto' };
let cookie: string, live: Sess, h: ReturnType<typeof mockHovuz>, pending: Promise<unknown>[];
const env = { SESSIYA_KALIT: secret, HYPERDRIVE: { connectionString: 'mock-only' },
  MCP_RATE: { limit: vi.fn(async () => ({ success: true })) } } as unknown as Env;
async function rpc(method: string, params?: unknown, headers: Record<string, string> = {}, id: number | null = 1) {
  return worker.fetch(new Request('https://mcp.test/jarvis/mcp', { method: 'POST', headers: {
    Cookie: cookie, 'X-Jarvis-Company': '17', 'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18', ...headers,
  }, body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }) }), env,
  { waitUntil: (p: Promise<unknown>) => pending.push(p) } as never);
}
beforeEach(async () => {
  vi.restoreAllMocks(); vi.clearAllMocks(); pending = [];
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  cookie = `sess=${await imzola({ rol: 'superadmin', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 99, rol: 'admin' }] }, secret)}`;
  live = { rol: 'pto', foydalanuvchi_id: 7, exp: Date.now() + 10000, jti: 'db', kompaniyalar: [company, { kompaniya_id: 99, rol: 'pto' }],
    permissionsByCompany: { 17: [...SMETA_MCP_PERMISSIONS] }, explicitDenialsByCompany: { 17: [] }, modullarOffByCompany: { 17: [] } };
  vi.mocked(roleAuthority).mockImplementation(async s => ({ ...s, ...live }));
  vi.mocked(env.MCP_RATE.limit).mockResolvedValue({ success: true });
  h = mockHovuz(() => []); pool.get.mockReturnValue(h);
});
describe('existing worker SSO read-only MCP (real SDK, mocked SQL/roleAuthority)', () => {
  it('combined R2 source wiring reaches the real canonical reader without stale SQL fallback', async () => {
    normativR2CacheClear();
    const get = vi.fn(async () => null); const saved = env.SNAPSHOT_R2;
    env.SNAPSHOT_R2 = { get, put: vi.fn() };
    h = mockHovuz(sql => sql.includes('t2_obyekt') ? [{ id: 5, kompaniya_id: 17, nom: 'Synthetic' }] : []);
    pool.get.mockReturnValue(h);
    try {
      const result = await (await rpc('tools/call', { name: 'normativ_qidir', arguments: { obyekt_id: 5, matn: 'synthetic norm' } })).json();
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain('NORMATIV_SOURCE_UNAVAILABLE');
      expect(get).toHaveBeenCalledWith('normativ/shnk/v1/corpus.json.gz', undefined);
      expect(h.sorovlar.some(q => q.sql.includes('t2_normativ_qidir_v1'))).toBe(false);
    } finally { env.SNAPSHOT_R2 = saved; normativR2CacheClear(); await Promise.all(pending); }
  });
  it('real Jarvis client discovers the existing SDK tools/rules and calls through scoped SSO', async () => {
    const service = { fetch: (request: Request) => worker.fetch(request, env, {
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    } as never) };
    const client = smetaMcpClient(service, new Request('https://app.test/api/agent-ish', { headers: { Cookie: cookie } }), 17)!;
    expect((await client.open()).tools).toHaveLength(SMETA_MCP_READS.length);
    const answer = await client.call('obyektlar', {});
    expect(answer.javob.length).toBeGreaterThan(0);
    expect(answer.dalil).toEqual({ tur: 'smeta-mcp', vosita: 'obyektlar', kompaniya_id: 17 });
    expect(pool.get).toHaveBeenCalled();
    expect(h.sorovlar.some(q => q.params.some(p => Array.isArray(p) && p.includes(17) && !p.includes(99)))).toBe(true);
    await Promise.all(pending);
  });
  it('fails closed without config, cookie, valid signature or unexpired session', async () => {
    const saved = env.SESSIYA_KALIT; delete env.SESSIYA_KALIT;
    try { expect((await rpc('tools/list')).status).toBe(503); } finally { env.SESSIYA_KALIT = saved; }
    for (const Cookie of ['', 'sess=invalid', `sess=${await imzola({ rol: 'pto', foydalanuvchi_id: 7 }, secret, 0)}`])
      expect((await rpc('tools/list', {}, { Cookie })).status).toBe(401);
    expect(roleAuthority).not.toHaveBeenCalled(); expect(pool.get).not.toHaveBeenCalled();
  });
  it('does not turn a model-supplied price override into verified money evidence', async () => {
    const result = await (await rpc('tools/call', { name: 'yoyilma', arguments: {
      obyekt_idlar: [5], narx_override: { '11': 999 },
    } })).json();
    expect(result.result.isError).toBe(true); expect(pool.get).not.toHaveBeenCalled();
    await Promise.all(pending);
  });
  it.each(['revoked', 'other company', 'invalid company', 'missing permission', 'explicit deny'])('%s denies before SQL', async kind => {
    if (kind === 'revoked') vi.mocked(roleAuthority).mockResolvedValue(null);
    if (kind === 'missing permission') live.permissionsByCompany![17] = ['smeta.read'];
    if (kind === 'explicit deny') live.explicitDenialsByCompany = { 17: ['f2.read'] };
    expect((await rpc('tools/list', {}, { 'X-Jarvis-Company': kind === 'other company' ? '88' : kind === 'invalid company' ? '0' : '17' })).status).toBe(403);
    expect(pool.get).not.toHaveBeenCalled();
  });
  it.each([undefined, { 17: ['module.hr', 'module.narx'] }])('read availability follows existing module policy (%j)', async off => {
    live.modullarOffByCompany = off;
    expect((await (await rpc('tools/call', { name: 'obyektlar', arguments: {} })).json()).result.isError).not.toBe(true);
    expect(pool.get).toHaveBeenCalled(); await Promise.all(pending);
  });
  it('2025-06-18 initialize, initialized 202, list and resource read use real stateless JSON transport', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'jarvis-test', version: '1' } });
    expect(init.headers.get('content-type')).toContain('application/json'); expect((await init.json()).result.protocolVersion).toBe('2025-06-18');
    expect((await rpc('notifications/initialized', undefined, {}, null)).status).toBe(202);
    const list = (await (await rpc('tools/list')).json()).result.tools;
    expect(list.filter((t: { name: string }) => !['search', 'fetch'].includes(t.name)).map((t: { name: string }) => t.name).sort())
      .toEqual(SMETA_MCP_READS.filter(n => n !== 'search' && n !== 'fetch').slice().sort());
    expect(list).toHaveLength(SMETA_MCP_READS.length); expect(list.every((t: { annotations: { readOnlyHint: boolean } }) => t.annotations.readOnlyHint)).toBe(true);
    const resource = await (await rpc('resources/read', { uri: 'smeta://qoidalar' })).json();
    expect(resource.result.contents[0]).toMatchObject({ uri: 'smeta://qoidalar', mimeType: 'text/markdown' });
    expect(resource.result.contents[0].text.length).toBeGreaterThan(0); expect(pool.get).not.toHaveBeenCalled();
    expect(pending).toHaveLength(4); await Promise.all(pending);
  });
  it.each([...siyosat.YOZISH.map(t => t.nom), ...siyosat.TAQIQLANGAN, 'unknown_tool'])('%s cannot execute or reach SQL', async name => {
    const j = await (await rpc('tools/call', { name, arguments: { dry_run: false, tasdiq: true, actor_id: 999 } })).json();
    expect(Boolean(j.error || j.result?.isError)).toBe(true); expect(pool.get).not.toHaveBeenCalled();
  });
  it('forwards original cookie to authority, verified actor and exactly current company to existing tools/SQL', async () => {
    const call = vi.spyOn(siyosat, 'masofaviyChaqir'); const close = vi.spyOn(h, 'end');
    expect((await (await rpc('tools/call', { name: 'obyektlar', arguments: {} })).json()).result.isError).not.toBe(true);
    expect(roleAuthority).toHaveBeenCalledWith(await (await import('../../../frontend/functions/_shared/auth')).tekshir(cookie, secret), env);
    const v = call.mock.calls[0][2]; expect(v.foydalanuvchiId).toBe(7); expect(v.kompaniyalar).toEqual([company]); expect(v.sess.kompaniyalar).toEqual([company]);
    expect(h.sorovlar.find(q => q.sql.includes('from public.t2_obyekt o left join'))?.params[3]).toEqual([17]);
    expect(h.sorovlar.some(q => q.params.includes('mcp:actor:7'))).toBe(true); await Promise.all(pending); expect(close).toHaveBeenCalled();
  });
  it('preserves rate/body limits before authority and SQL', async () => {
    vi.mocked(env.MCP_RATE.limit).mockResolvedValueOnce({ success: false }); expect((await rpc('tools/list')).status).toBe(429);
    expect((await rpc('tools/list', { padding: 'x'.repeat(SOROV_MAX) })).status).toBe(413);
    expect(roleAuthority).not.toHaveBeenCalled(); expect(pool.get).not.toHaveBeenCalled();
  });
});

it('current-main OAuth admin/file tools stay absent from Jarvis SSO even for a live superadmin', async () => {
 live = { ...live, rol: 'superadmin' };
 const list = (await (await rpc('tools/list')).json()).result.tools.map((t: { name: string }) => t.name);
 expect(list).toHaveLength(SMETA_MCP_READS.length);expect(list).toContain('transport_tekshir');expect(list).toContain('f2_jami');
 for(const name of ['sql_oqish','sxema','f2_fayl','hujjat_paket']) {
  expect(list).not.toContain(name);const result=await (await rpc('tools/call',{name,arguments:{}})).json();
  expect(Boolean(result.error || result.result?.isError)).toBe(true);
 }
 expect(pool.get).not.toHaveBeenCalled();await Promise.all(pending);
});
