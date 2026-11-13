// @vitest-environment node
/** P0 (ekotizim): pullik hujjat baytlari — server to'langan token dalilini tekshiradi. Token yo'q → rad; to'langan → ruxsat; bir xil xesh → bepul. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as yukla } from './hujjat-yukla';
import { onRequestGet as ol } from './hujjat-ol';
import { imzola } from '../_shared/auth';
import { PULLIK_HUJJAT_TURLAR, legacyHujjatmi, pullikTurmi, tolovXeshi } from '../_shared/hujjat-tolov';

const KEY = 'k'.repeat(32);
const OP = '11111111-2222-4333-8444-555555555555';
const SARF_OP = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
afterEach(() => vi.unstubAllGlobals());

const bayt = new TextEncoder().encode('PK paket zip mazmuni');
async function sha(b: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const r2 = () => {
  const put = vi.fn(async () => ({}));
  const get = vi.fn(async (k: string) => ({ body: new Blob([k]).stream() }));
  return { put, get, bucket: { put, get } as unknown as R2Bucket };
};

type Mock = { sarf?: unknown; qaytgan?: unknown; registr?: unknown; harakatXato?: boolean; sarfla?: unknown[]; reserveXato?: boolean };
let rpcBody: Record<string, Array<Record<string, unknown>>> = {};
function mockFetch(m: Mock) {
  const chaqiruvlar: string[] = [];
  rpcBody = {};
  const sarflaNav = [...(m.sarfla ?? [])];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const url = decodeURIComponent(String(u));
    chaqiruvlar.push(url);
    const rpcNom = /\/rpc\/([a-z0-9_]+)/.exec(url)?.[1];
    if (rpcNom && init?.body) (rpcBody[rpcNom] ??= []).push(JSON.parse(String(init.body)));
    if (rpcNom === 't2_token_sarfla_v1') return Response.json(sarflaNav.length ? sarflaNav.shift() : { ok: true, sarflandi: 3, hisob: {}, balans: 10 });
    if (rpcNom === 't2_token_qaytar_v1') return Response.json({ ok: true });
    if (m.reserveXato && url.includes('/rpc/t2_document_canonical_reserve')) return Response.json({ ok: false, code: 'DOCUMENT_RESERVE_FAILED' });
    if (url.includes('/rpc/t2_document_canonical_reserve_v1')) return Response.json({ ok: true, document_id: 50, r2_key: 'docs/17/_/5/d50/r1', canonical_storage_status: 'reserved' });
    if (url.includes('/rpc/t2_document_canonical_share_v1')) return Response.json({ ok: false, code: 'NO_SHARED_SOURCE' });
    if (url.includes('/rpc/t2_document_canonical_finalize_v1')) return Response.json({ ok: true, revision_seq: 1, sha256: 'x', sha256_verified: true, versiya: 1 });
    if (url.includes('/rpc/t2_document_canonical_get_v1')) return Response.json({ ok: true, document_id: 50, r2_key: 'docs/a', mime_type: 'application/zip', original_filename: 'p.zip', sha256: 'f'.repeat(64) });
    if (url.includes('t2_token_harakat') && url.includes('tur=eq.qaytarish')) return m.harakatXato ? new Response('x', { status: 500 }) : Response.json(m.qaytgan ?? []);
    if (url.includes('t2_token_harakat')) return m.harakatXato ? new Response('x', { status: 500 }) : Response.json(m.sarf ?? []);
    if (url.includes('t2_document_registry')) return Response.json(m.registr ?? []);
    return Response.json({ ok: true });
  }));
  return chaqiruvlar;
}

async function yuklash(turi: string, extra: Record<string, string> = {}) {
  const s = r2();
  const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
  const f = new FormData();
  f.set('fayl', new File([bayt], 'p.zip', { type: 'application/zip' }));
  f.set('kompaniya_id', '17'); f.set('turi', turi);
  f.set('operation_id', OP); f.set('sha256', await sha(bayt)); f.set('size', String(bayt.length));
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  const res = await yukla({ request: new Request('https://x/api/hujjat-yukla', { method: 'POST', headers: { Cookie: 'sess=' + sess }, body: f }),
    env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: s.bucket } } as never);
  return { res, json: await res.json() as Record<string, unknown>, put: s.put };
}

describe('hujjat-yukla: pullik tur uchun to\'lov dalili', () => {
  it('token to\'lanmagan — 402, R2 ga ham reyestrga ham yozilmaydi', async () => {
    const c = mockFetch({ sarf: [] });
    const { res, json, put } = await yuklash('shartnoma_oylik_paket');
    expect(res.status).toBe(402);
    expect(json.code).toBe('TOKEN_TOLOV_YOQ');
    expect(put).not.toHaveBeenCalled();
    expect(c.some((u) => u.includes('/rpc/t2_document_canonical_reserve'))).toBe(false);
  });
  it('to\'langan (shu xesh, qaytarilmagan) — ruxsat, R2 ga yoziladi, token_dalil belgisi bilan', async () => {
    const c = mockFetch({ sarf: [{ operation_id: SARF_OP }], qaytgan: [] });
    const { json, put } = await yuklash('shartnoma_oylik_paket');
    expect(json, JSON.stringify(json)).toMatchObject({ ok: true, document_id: 50 });
    expect(put).toHaveBeenCalledTimes(1);
    expect((put.mock.calls[0] as unknown[])[2]).toMatchObject({ customMetadata: { token_dalil: '1' } });
    const soro = c.find((u) => u.includes('tur=eq.sarf')) ?? '';
    expect(soro).toContain('kompaniya_id=eq.17');
    expect(soro).toContain(`meta->>xesh=eq.${tolovXeshi(await sha(bayt))}`);
  });
  it('bir xil xesh qayta — bepul: server hech qanday yangi sarf yozmaydi (faqat dalil o\'qiydi)', async () => {
    const c = mockFetch({ sarf: [{ operation_id: SARF_OP }], qaytgan: [] });
    await yuklash('shartnoma_oylik_paket');
    await yuklash('shartnoma_oylik_paket');
    expect(c.some((u) => u.includes('token_sarfla'))).toBe(false);
  });
  it('sarf qaytarilgan (refund) — dalil hisoblanmaydi, 402', async () => {
    mockFetch({ sarf: [{ operation_id: SARF_OP }], qaytgan: [{ bogliq_operation_id: SARF_OP }] });
    const { res } = await yuklash('shartnoma_oylik_paket');
    expect(res.status).toBe(402);
  });
  it('dalilni o\'qib bo\'lmasa — yopiq (503), hech narsa yozilmaydi', async () => {
    mockFetch({ harakatXato: true });
    const { res, put } = await yuklash('shartnoma_oylik_paket');
    expect(res.status).toBe(503);
    expect(put).not.toHaveBeenCalled();
  });
  it('f2_hujjat: dalil — shu obyektda to\'langan f2_hujjat sarfi (F2 xeshi mantiqiy kalit)', async () => {
    const c = mockFetch({ sarf: [{ operation_id: SARF_OP }], qaytgan: [] });
    const { json } = await yuklash('f2_hujjat', { obyekt_id: '5' });
    expect(json).toMatchObject({ ok: true });
    expect(c.find((u) => u.includes('tur=eq.sarf'))).toContain('meta->>obyekt=eq.5');
    expect(rpcBody.t2_token_sarfla_v1).toBeUndefined(); // to'langan — server qayta yechmaydi
    mockFetch({ sarf: [{ operation_id: SARF_OP }] });
    expect((await yuklash('f2_hujjat')).res.status).toBe(402); // obyektsiz F2 — dalil ham, server yechimi ham bo'lmaydi
    expect(rpcBody.t2_token_sarfla_v1).toBeUndefined();
  });
  it('foydalanuvchining o\'z fayli (smeta, hujjat) — to\'lov tekshirilmaydi, bepul', async () => {
    const c = mockFetch({ sarf: [] });
    const { json } = await yuklash('smeta');
    expect(json).toMatchObject({ ok: true });
    expect(c.some((u) => u.includes('t2_token_harakat'))).toBe(false);
  });
});

describe('hujjat-ol: pullik arxivni berish', () => {
  async function olish(registr: unknown) {
    const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
    const s = r2();
    const res = await ol({ request: new Request('https://x/api/hujjat-ol?id=50', { headers: { Cookie: 'sess=' + sess } }),
      env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: s.bucket } } as never);
    void registr;
    return { res, get: s.get };
  }
  const yangi = { document_type: 'shartnoma_oylik_paket', created_at: '2026-12-01T00:00:00Z', sha256: 'a'.repeat(64), kompaniya_id: 17, obyekt_id: null };
  it('P0 dan keyingi pullik hujjat, dalil yo\'q — 402 va bayt berilmaydi', async () => {
    mockFetch({ registr: [yangi], sarf: [] });
    const { res, get } = await olish(yangi);
    expect(res.status).toBe(402);
    expect(get).not.toHaveBeenCalled();
  });
  it('dalil bor — beriladi', async () => {
    mockFetch({ registr: [yangi], sarf: [{ operation_id: SARF_OP }], qaytgan: [] });
    const { res, get } = await olish(yangi);
    expect(res.status).toBe(200);
    expect(get).toHaveBeenCalled();
  });
  it('P0 dan oldingi (legacy) hujjat — avvalgidek beriladi, hech narsa yopilmaydi', async () => {
    mockFetch({ registr: [{ ...yangi, created_at: '2026-10-20T00:00:00Z' }], sarf: [] });
    expect((await olish(null)).res.status).toBe(200);
  });
  it('pullik bo\'lmagan tur — dalil so\'ralmaydi', async () => {
    const c = mockFetch({ registr: [{ ...yangi, document_type: 'smeta' }], sarf: [] });
    expect((await olish(null)).res.status).toBe(200);
    expect(c.some((u) => u.includes('t2_token_harakat'))).toBe(false);
  });
});

describe('yordamchilar', () => {
  it('pullik turlar ro\'yxati', () => {
    expect([...PULLIK_HUJJAT_TURLAR].sort()).toEqual(['f2_hujjat', 'f3', 'shartnoma_oylik_paket']);
    expect(pullikTurmi('smeta')).toBe(false);
    expect(pullikTurmi(null)).toBe(false);
  });
  it('xesh — sha256 ning birinchi 32 hex belgisi (mijoz mazmunXeshi bilan bir xil)', () => {
    expect(tolovXeshi('ABCDEF' + '0'.repeat(58))).toBe(('abcdef' + '0'.repeat(26)));
  });
  it('legacy sanasi', () => {
    expect(legacyHujjatmi({}, '2026-10-01T00:00:00Z')).toBe(true);
    expect(legacyHujjatmi({}, '2026-11-06T00:00:00Z')).toBe(false);
    expect(legacyHujjatmi({ HUJJAT_TOLOV_MAJBURIY_SANA: '2026-12-31T00:00:00Z' }, '2026-11-06T00:00:00Z')).toBe(true);
  });
});
