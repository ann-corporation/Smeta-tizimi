// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as yukla } from './hujjat-yukla';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());
const bayt = new TextEncoder().encode('LRV smeta fayli');
async function sha(b: Uint8Array) { const d = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

async function yuklash(opts: { yoz?: Record<string, unknown>; forma?: Record<string, string>; reserve?: Record<string, unknown> } = {}) {
  const c: Array<{ nom: string; args: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const nom = String(u).split('/rpc/')[1]; c.push({ nom, args: JSON.parse(String(init?.body ?? '{}')) });
    if (nom === 't2_document_canonical_reserve_v1') return Response.json(opts.reserve ?? { ok: true, document_id: 50, r2_key: 'docs/17/_/5/d50/r1', canonical_storage_status: 'reserved' });
    if (nom === 't2_document_canonical_share_v1') return Response.json({ ok: false, code: 'NO_SHARED_SOURCE' });
    if (nom === 't2_document_canonical_finalize_v1') return Response.json({ ok: true, revision_seq: 1, sha256: 'x', sha256_verified: true, versiya: 1 });
    if (nom === 't2_disk_tizim_yoz_v1') return Response.json(opts.yoz ?? { ok: true, fayl_id: 8, raqam: 1, yangi: true });
    return Response.json({ ok: true });
  }));
  const put = vi.fn(async () => ({}));
  const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
  const f = new FormData();
  f.set('fayl', new File([bayt], 'x.xls', { type: 'application/vnd.ms-excel' }));
  f.set('kompaniya_id', '17'); f.set('obyekt_id', '5'); f.set('turi', 'smeta');
  f.set('operation_id', '11111111-2222-4333-8444-555555555555'); f.set('sha256', await sha(bayt)); f.set('size', String(bayt.length));
  for (const [k, v] of Object.entries(opts.forma ?? {})) f.set(k, v);
  const res = await yukla({ request: new Request('https://x/api/hujjat-yukla', { method: 'POST', headers: { Cookie: 'sess=' + sess }, body: f }),
    env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: { put, get: vi.fn(), head: vi.fn(), delete: vi.fn() } as unknown as R2Bucket } } as never);
  return { res, json: await res.json() as Record<string, any>, c };
}

describe('Disk A2: har saqlangan hujjat Diskka yoziladi (hujjat-yukla - yagona kirish)', () => {
  it('kalit/manba/nom formadan t2_disk_tizim_yoz_v1 ga aynan o‘tadi; javobda disk natijasi', async () => {
    const { json, c } = await yuklash({ forma: { manba_turi: 'f2', manba_id: '41', hujjat_kalit: 'f2:41', shartnoma_id: '5', korinish_nom: 'F-2 №5 — Fast Food — 2026-11' } });
    expect(json).toMatchObject({ ok: true, document_id: 50, disk: { ok: true, fayl_id: 8, versiya: 1, takror: false } });
    const yoz = c.find((x) => x.nom === 't2_disk_tizim_yoz_v1')!;
    expect(yoz.args).toMatchObject({ p_actor: 5, p_kompaniya: 17, p_registry_id: 50, p_manba_turi: 'f2', p_manba_id: 41, p_hujjat_kalit: 'f2:41', p_shartnoma_id: 5, p_nom: 'F-2 №5 — Fast Food — 2026-11' });
    expect(c.findIndex((x) => x.nom === 't2_document_canonical_finalize_v1')).toBeLessThan(c.findIndex((x) => x.nom === 't2_disk_tizim_yoz_v1'));
  });
  it('forma maydonlarisiz ham yoziladi: kalit/nom NULL - SQL registry qatoridan aniqlaydi (smeta, nashr, shartnoma... hammasi Diskda)', async () => {
    const { c, json } = await yuklash();
    expect(json.disk.ok).toBe(true);
    expect(c.find((x) => x.nom === 't2_disk_tizim_yoz_v1')!.args).toMatchObject({ p_registry_id: 50, p_hujjat_kalit: null, p_manba_turi: null, p_nom: null });
  });
  it('allaqachon saqlangan (retry) hujjat ham Diskka ulanadi (idempotent)', async () => {
    const { c, json } = await yuklash({ reserve: { ok: true, document_id: 50, r2_key: 'k', canonical_storage_status: 'stored', sha256: 'x' } });
    expect(json).toMatchObject({ ok: true, retry: true, disk: { ok: true } });
    expect(c.map((x) => x.nom)).toContain('t2_disk_tizim_yoz_v1');
  });
  it('Disk yozuvi yiqilsa yuklash YIQILMAYDI (200 ok), xato javobda va jurnalda ko‘rinadi - jim emas', async () => {
    const jurnal = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res, json } = await yuklash({ yoz: { ok: false, code: 'KVOTA_TUGADI' } });
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, document_id: 50, disk: { ok: false, code: 'KVOTA_TUGADI' } });
    expect(jurnal).toHaveBeenCalledTimes(1);
    jurnal.mockRestore();
  });
});