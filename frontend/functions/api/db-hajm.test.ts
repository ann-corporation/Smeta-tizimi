// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { darajaOl, onRequestGet } from './db-hajm';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());

async function chaqir(opts: { superadmin: boolean; dbBytes?: number; limitMb?: string }) {
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    const nom = String(u).split('/rpc/')[1];
    if (nom === 't2_boshqaruv_umumiy_v1') return opts.superadmin ? Response.json({ foydalanuvchi: { id: 7 } }) : new Response('SUPERADMIN_KERAK', { status: 400 });
    return Response.json({ ok: true, db_bytes: opts.dbBytes ?? 0, top: [{ sxema: 'public', jadval: 't2_qator', bytes: 5, qator: 1 }], snapshot_sovuq: { sovuq_blok: 0 } });
  }));
  const sess = await imzola({ rol: 'superadmin', foydalanuvchi_id: 7, kompaniyalar: [] }, KEY);
  const req = new Request('https://x/api/db-hajm', { headers: { Cookie: 'sess=' + sess } });
  const res = await onRequestGet({ request: req, env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, DB_LIMIT_MB: opts.limitMb } } as never);
  return { res, json: await res.json() as Record<string, unknown> };
}

describe('db-hajm — baza hajmi (superadmin)', () => {
  it('superadmin bo‘lmasa 403', async () => {
    const { res } = await chaqir({ superadmin: false });
    expect(res.status).toBe(403);
  });
  it('421 MB / 500 MB = 84,2% → ogohlantirish (80% dan yuqori)', async () => {
    const { json } = await chaqir({ superadmin: true, dbBytes: 421 * 1024 * 1024 });
    expect(json.foiz).toBe(84.2); expect(json.daraja).toBe('ogoh'); expect(json.limit_bytes).toBe(500 * 1024 * 1024);
  });
  it('chegaralar: 80% ogoh, 90% xavf, ostida ok; DB_LIMIT_MB hisobga olinadi', () => {
    expect(darajaOl(79.9)).toBe('ok'); expect(darajaOl(80)).toBe('ogoh'); expect(darajaOl(89.9)).toBe('ogoh'); expect(darajaOl(90)).toBe('xavf');
  });
  it('DB_LIMIT_MB=8192 bo‘lsa foiz shunga nisbatan', async () => {
    const { json } = await chaqir({ superadmin: true, dbBytes: 421 * 1024 * 1024, limitMb: '8192' });
    expect(json.daraja).toBe('ok'); expect(json.limit_bytes).toBe(8192 * 1024 * 1024);
  });
});
