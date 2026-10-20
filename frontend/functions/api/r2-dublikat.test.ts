// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPost } from './r2-dublikat';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());

type Rpc = (args: Record<string, unknown>) => unknown;
async function chaqir(opts: { superadmin: boolean; rpclar: Record<string, Rpc>; head?: (k: string) => unknown; tana?: unknown; usul?: 'GET' | 'POST' }) {
  const chaqirildi: Array<{ nom: string; args: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const nom = String(u).split('/rpc/')[1];
    const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    chaqirildi.push({ nom, args });
    if (nom === 't2_boshqaruv_umumiy_v1') return opts.superadmin ? Response.json({ foydalanuvchi: { id: 7 } }) : new Response('SUPERADMIN_KERAK', { status: 400 });
    const f = opts.rpclar[nom];
    return Response.json(f ? f(args) : { ok: false, code: 'NOMALUM' });
  }));
  const del = vi.fn(async () => undefined);
  const head = vi.fn(async (k: string) => (opts.head ? opts.head(k) : null));
  const sess = await imzola({ rol: 'superadmin', foydalanuvchi_id: 7, kompaniyalar: [] }, KEY);
  const req = new Request('https://x/api/r2-dublikat', { method: opts.usul ?? 'POST', headers: { Cookie: 'sess=' + sess, 'Content-Type': 'application/json' },
    ...(opts.usul === 'GET' ? {} : { body: JSON.stringify(opts.tana ?? {}) }) });
  const env = { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: { head, delete: del } as unknown as R2Bucket };
  const res = await (opts.usul === 'GET' ? onRequestGet : onRequestPost)({ request: req, env } as never);
  return { res, json: await res.json() as Record<string, unknown>, chaqirildi, del, head };
}
const guruh = { kompaniya_id: 17, sha256: 'a'.repeat(64), size_bytes: 100, asosiy_id: 1, asosiy_kalit: 'docs/1', nusxa_idlar: [2, 3], nom: 'f', tejash_bytes: 200 };

describe('R2 dublikat tozalash — faqat superadmin, xavfsiz tartib', () => {
  it('superadmin bo‘lmasa — 403, R2 ga tegilmaydi', async () => {
    const { res, del, head, chaqirildi } = await chaqir({ superadmin: false, rpclar: {}, tana: { amal: 'yetim_ochir' } });
    expect(res.status).toBe(403);
    expect(del).not.toHaveBeenCalled(); expect(head).not.toHaveBeenCalled();
    expect(chaqirildi.map((c) => c.nom)).toEqual(['t2_boshqaruv_umumiy_v1']);
  });
  it('asosiy obyekt R2 da yo‘q yoki hajmi mos emas — nusxalar bog‘lanmaydi', async () => {
    for (const h of [null, { size: 99, customMetadata: {} }, { size: 100, customMetadata: { sha256: 'b'.repeat(64) } }]) {
      const { json, chaqirildi } = await chaqir({ superadmin: true, head: () => h, tana: { amal: 'birlashtir' },
        rpclar: { t2_r2_dublikat_royxat_v1: () => ({ ok: true, guruhlar: [guruh] }) } });
      expect(chaqirildi.some((c) => c.nom === 't2_r2_dublikat_birlashtir_v1')).toBe(false);
      expect((json.otkazildi as unknown[]).length).toBe(1);
    }
  });
  it('asosiy obyekt mos — birlashtiriladi; o‘tkazib yuborilgan guruh qayta urinilmaydi', async () => {
    const { json, chaqirildi } = await chaqir({ superadmin: true, head: () => ({ size: 100, customMetadata: { sha256: 'a'.repeat(64) } }),
      tana: { amal: 'birlashtir', otkaz: [9] },
      rpclar: { t2_r2_dublikat_royxat_v1: () => ({ ok: true, guruhlar: [{ ...guruh, asosiy_id: 9 }, guruh] }),
        t2_r2_dublikat_birlashtir_v1: () => ({ ok: true, birlashtirildi: 2, yetim: 2 }) } });
    const b = chaqirildi.filter((c) => c.nom === 't2_r2_dublikat_birlashtir_v1');
    expect(b).toHaveLength(1); expect(b[0].args).toMatchObject({ p_asosiy_id: 1, p_nusxa_idlar: [2, 3] });
    expect(json).toMatchObject({ ok: true, birlashtirildi: 2, yetim: 2, qoldi: 0 });
  });
  it('yetim: bazada qayta tekshirilmasa yoki kalit ishlatilayotgan bo‘lsa — R2 dan o‘chirilmaydi', async () => {
    const { json, del } = await chaqir({ superadmin: true, tana: { amal: 'yetim_ochir' },
      rpclar: { t2_r2_yetim_royxat_v1: () => ({ ok: true, yetimlar: [{ id: 1, r2_key: 'docs/x', size_bytes: 5 }, { id: 2, r2_key: 'docs/y', size_bytes: 7 }] }),
        t2_r2_yetim_ochirildi_v1: (a) => (a.p_yetim_id === 1 ? { ok: true, r2_key: 'docs/x' } : { ok: false, code: 'KALIT_ISHLATILMOQDA' }) } });
    expect(del).toHaveBeenCalledTimes(1); expect(del).toHaveBeenCalledWith('docs/x');
    expect(json).toMatchObject({ ok: true, ochirildi: 1, bayt: 5 });
  });
  it('GET — faqat ro‘yxat, hech narsa o‘zgarmaydi', async () => {
    const { json, del, head } = await chaqir({ superadmin: true, usul: 'GET', rpclar: { t2_r2_dublikat_royxat_v1: () => ({ ok: true, guruhlar: [guruh], jami_tejash_bytes: 200 }) } });
    expect(json).toMatchObject({ ok: true, jami_tejash_bytes: 200 });
    expect(del).not.toHaveBeenCalled(); expect(head).not.toHaveBeenCalled();
  });
});
