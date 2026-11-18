// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as yukla } from './hujjat-yukla';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());
const bayt = new TextEncoder().encode('f-2 hujjati');
const sha = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');

async function yuk(reserve: Record<string, unknown>, manba: Record<string, string>, metaJavob: Record<string, unknown> = { ok: true, versiya: 2 }) {
  const c: Array<{ nom: string; args: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const nom = String(u).split('/rpc/')[1]; c.push({ nom, args: JSON.parse(String(init?.body ?? '{}')) });
    if (nom === 't2_document_canonical_reserve_v1') return Response.json(reserve);
    if (nom === 't2_document_canonical_finalize_v1') return Response.json({ ok: true, revision_seq: 3, sha256: 'x', sha256_verified: true, versiya: 1 });
    if (nom === 't2_disk_tizim_meta_v1') return Response.json(metaJavob);
    return Response.json({ ok: false, code: 'NO_SHARED_SOURCE' });
  }));
  const put = vi.fn(async () => ({}));
  const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
  const f = new FormData();
  f.set('fayl', new File([bayt], 'f2.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  f.set('kompaniya_id', '17'); f.set('obyekt_id', '80'); f.set('turi', 'hujjat'); f.set('operation_id', '11111111-2222-4333-8444-555555555555');
  f.set('sha256', await sha(bayt)); f.set('size', String(bayt.length));
  for (const [k, v] of Object.entries(manba)) f.set(k, v);
  const res = await yukla({ request: new Request('https://x/api/hujjat-yukla', { method: 'POST', headers: { Cookie: 'sess=' + sess }, body: f }),
    env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: { put } as unknown as R2Bucket } } as never);
  return { json: await res.json() as Record<string, unknown>, c };
}
const M = { manba_turi: 'f2', manba_id: '41', hujjat_kalit: 'f2:41', korinish_nom: 'F-2 №5 — Fast Food 1-qavat — 2026-11', shartnoma_id: '5' };

describe('hujjat-yukla: Disk metama’lumoti (kalit/manba/nom/shartnoma)', () => {
  it('yangi yuklash: finalize’dan keyin t2_disk_tizim_meta_v1 — aktor sessiyadan, qiymatlar to‘g‘ri', async () => {
    const { json, c } = await yuk({ ok: true, document_id: 50, r2_key: 'docs/17/_/80/d50/r3', canonical_storage_status: 'reserved' }, M);
    expect(json).toMatchObject({ ok: true, document_id: 50 });
    expect(c.map((x) => x.nom)).toEqual(['t2_document_canonical_reserve_v1', 't2_document_canonical_share_v1', 't2_document_canonical_finalize_v1', 't2_disk_tizim_meta_v1']);
    expect(c[3].args).toEqual({ p_actor_id: 5, p_kompaniya_id: 17, p_document_id: 50, p_manba_turi: 'f2', p_manba_id: 41, p_hujjat_kalit: 'f2:41', p_shartnoma_id: 5, p_nom: M.korinish_nom });
  });
  it('mavjud (dedup/retry) yozuvga ham meta biriktiriladi; meta xatosi yuklashni buzmaydi', async () => {
    const { json, c } = await yuk({ ok: true, document_id: 50, r2_key: 'k', canonical_storage_status: 'stored', retry: true, dedup: true }, M, { ok: false, code: 'HUJJAT_TOPILMADI' });
    expect(json).toMatchObject({ ok: true, document_id: 50, dedup: true });
    expect(c.map((x) => x.nom)).toContain('t2_disk_tizim_meta_v1');
  });
  it('meta maydonlari berilmasa (oddiy yuklash) meta RPC chaqirilmaydi', async () => {
    const { c } = await yuk({ ok: true, document_id: 51, r2_key: 'k', canonical_storage_status: 'reserved' }, {});
    expect(c.map((x) => x.nom)).not.toContain('t2_disk_tizim_meta_v1');
  });
});
