import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as oqish } from './sb';
import { onRequestPost as yozish } from './sb-yoz';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { writeCommandPermission } from '../_shared/write-command-policy';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
const OP = '11111111-1111-4111-8111-111111111111';
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); });

async function chaqir(handler: typeof oqish, body: unknown, { rol = 'boss', foydalanuvchi = 7 }: { rol?: string; foydalanuvchi?: number } = {}) {
  const rpc: { yol: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol, faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: rol }] });
    if (url.pathname === '/rest/v1/t2_obyekt') return Response.json([{ id: 5, kompaniya_id: 17 }]);
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push({ yol: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : null }); return Response.json({ ok: true, tugunlar: [], bogichlar: [] }); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  const token = await imzola({ rol: rol as never, foydalanuvchi_id: foydalanuvchi, kompaniyalar: [{ kompaniya_id: 17, rol }] }, env.SESSIYA_KALIT);
  const res = await handler({ request: new Request('https://test/api', { method: 'POST', headers: { Cookie: 'sess=' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, rpc };
}

describe('mindmap_grafi_v4 (o‘qish): actor sessiyadan', () => {
  it('t2_mindmap_grafi_v4 ni p_actor_id (sessiya) va p_kompaniya_id bilan chaqiradi; mijoz actor yubora olmaydi', async () => {
    const { res, rpc } = await chaqir(oqish, { soro: 'mindmap_grafi_v4', kompaniya_id: 17, actor_id: 999, p_actor_id: 999 });
    expect(res.status).toBe(200);
    const q = new URL('https://x' + rpc[0].yol);
    expect(q.pathname).toBe('/rest/v1/rpc/t2_mindmap_grafi_v4');
    expect(q.searchParams.get('p_actor_id')).toBe('7');
    expect(q.searchParams.get('p_kompaniya_id')).toBe('17');
  });
  it('a’zo bo‘lmagan kompaniya rad etiladi', async () => {
    const { res, rpc } = await chaqir(oqish, { soro: 'mindmap_grafi_v4', kompaniya_id: 18 });
    expect(res.status).toBe(403);
    expect(rpc.length).toBe(0);
  });
});

describe('mindmap_masul (yozish)', () => {
  it('ruxsat siyosati: company.member.manage', () => {
    expect(writeCommandPermission('mindmap_masul')).toBe('company.member.manage');
  });
  it('actor sessiyadan, operation_id bilan t2_mindmap_masul_v1 ga boradi', async () => {
    const { res, rpc } = await chaqir(yozish, { amal: 'mindmap_masul', kompaniya_id: 17, obyekt_id: 5, foydalanuvchi_id: 33, ruxsat: 'write', operation_id: OP, p_actor_id: 999 });
    expect(res.status).toBe(200);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_mindmap_masul_v1');
    expect(rpc[0].body).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_obyekt_id: 5, p_loyiha_id: null, p_foydalanuvchi_id: 33, p_ruxsat: 'write', p_operation_id: OP });
  });
  it('ruxsat null — olib tashlash', async () => {
    const { rpc } = await chaqir(yozish, { amal: 'mindmap_masul', kompaniya_id: 17, obyekt_id: 5, foydalanuvchi_id: 33, ruxsat: null, operation_id: OP });
    expect((rpc[0].body as { p_ruxsat: unknown }).p_ruxsat).toBeNull();
  });
  it.each([
    [{ operation_id: 'not-uuid', obyekt_id: 5, foydalanuvchi_id: 33, ruxsat: 'read' }],
    [{ operation_id: OP, foydalanuvchi_id: 33, ruxsat: 'read' }],
    [{ operation_id: OP, obyekt_id: 5, loyiha_id: 3, foydalanuvchi_id: 33, ruxsat: 'read' }],
    [{ operation_id: OP, obyekt_id: 5, foydalanuvchi_id: 0, ruxsat: 'read' }],
    [{ operation_id: OP, obyekt_id: 5, foydalanuvchi_id: 33, ruxsat: 'admin' }],
  ])('noto‘g‘ri so‘rov RPC ga yetmaydi %#', async (qism) => {
    const { rpc } = await chaqir(yozish, { amal: 'mindmap_masul', kompaniya_id: 17, ...qism });
    expect(rpc.length).toBe(0);
  });
});
