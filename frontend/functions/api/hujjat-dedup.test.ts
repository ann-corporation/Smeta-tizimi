// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as yukla } from './hujjat-yukla';
import { onRequestGet as ol } from './hujjat-ol';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());

const bayt = new TextEncoder().encode('bir xil smeta fayli');
async function sha(b: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function r2() {
  const put = vi.fn(async () => ({}));
  const get = vi.fn(async (k: string) => ({ body: new Blob([k]).stream() }));
  return { put, get, bucket: { put, get } as unknown as R2Bucket };
}

async function yuklash(shareJavob: Record<string, unknown>) {
  const rpclar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    const nom = String(u).split('/rpc/')[1];
    rpclar.push(nom);
    if (nom === 't2_document_canonical_reserve_v1') return Response.json({ ok: true, document_id: 50, r2_key: 'docs/17/_/5/d50/r1', canonical_storage_status: 'reserved' });
    if (nom === 't2_document_canonical_share_v1') return Response.json(shareJavob);
    if (nom === 't2_document_canonical_finalize_v1') return Response.json({ ok: true, revision_seq: 1, sha256: 'x', sha256_verified: true, versiya: 1 });
    return Response.json({ ok: true });
  }));
  const s = r2();
  const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
  const f = new FormData();
  f.set('fayl', new File([bayt], 'smeta.xls', { type: 'application/vnd.ms-excel' }));
  f.set('kompaniya_id', '17'); f.set('obyekt_id', '5'); f.set('turi', 'smeta');
  f.set('operation_id', '11111111-2222-4333-8444-555555555555'); f.set('sha256', await sha(bayt)); f.set('size', String(bayt.length));
  const res = await yukla({ request: new Request('https://x/api/hujjat-yukla', { method: 'POST', headers: { Cookie: 'sess=' + sess }, body: f }),
    env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: s.bucket } } as never);
  return { json: await res.json() as Record<string, unknown>, rpclar, put: s.put };
}

describe('R2 dublikat oldini olish (egasi: «R2 axlatxona bo‘lyapti»)', () => {
  it('aynan shu mazmun kompaniyada bor — baytlar R2 ga qayta yozilmaydi, yozuv mavjud obyektga bog‘lanadi', async () => {
    const { json, rpclar, put } = await yuklash({ ok: true, revision_seq: 1, sha256: 'x', versiya: 1, shared_from: 7, blob_key: 'docs/17/_/3/d7/r1' });
    expect(json, JSON.stringify(json)).toMatchObject({ ok: true, document_id: 50, shared_from: 7 });
    expect(put).not.toHaveBeenCalled();
    expect(rpclar).toContain('t2_document_canonical_share_v1');
    expect(rpclar).not.toContain('t2_document_canonical_finalize_v1');
  });
  it('mos manba yo‘q — odatdagidek R2 ga yoziladi va yakunlanadi', async () => {
    const { json, rpclar, put } = await yuklash({ ok: false, code: 'NO_SHARED_SOURCE' });
    expect(json).toMatchObject({ ok: true, document_id: 50 });
    expect(put).toHaveBeenCalledTimes(1);
    expect(rpclar).toContain('t2_document_canonical_finalize_v1');
  });
});

describe('o‘qish jismoniy obyektdan (blob_key)', () => {
  it('hujjat-ol blob_key dan o‘qiydi, bo‘lmasa r2_key dan', async () => {
    const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
    for (const [javob, kutilgan] of [
      [{ ok: true, document_id: 50, r2_key: 'docs/a', blob_key: 'docs/b', mime_type: 'x', original_filename: 'f' }, 'docs/b'],
      [{ ok: true, document_id: 50, r2_key: 'docs/a', mime_type: 'x', original_filename: 'f' }, 'docs/a'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json(javob)));
      const s = r2();
      await ol({ request: new Request('https://x/api/hujjat-ol?id=50', { headers: { Cookie: 'sess=' + sess } }),
        env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: s.bucket } } as never);
      expect(s.get).toHaveBeenCalledWith(kutilgan);
    }
  });
});
