// @vitest-environment node
/** Eksport tokeni SERVERDA: dalil yo'q bo'lsa hujjat-yukla t2_token_sarfla_v1 ni o'zi chaqiradi (idempotent, xatoda qaytaradi, yetmasa 402). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { onRequestPost as yukla } from './hujjat-yukla';
import { imzola } from '../_shared/auth';
import { sarfOperationId } from '../_shared/hujjat-sarf';
import { tolovXeshi } from '../_shared/hujjat-tolov';
import { mazmunXeshi } from '../../src/api/mazmun-xesh';

const KEY = 'k'.repeat(32);
const OP = '11111111-2222-4333-8444-555555555555';
const SARF_OP = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
afterEach(() => vi.unstubAllGlobals());

/** Haqiqiy xlsx shaklidagi kichik zip: 2 ta formula katak. */
const sheet = '<worksheet><sheetData><row r="1"><c r="A1"><f>SUM(B1:B2)</f><v>3</v></c><c r="B1"><v>1</v></c><c r="C1"><f>B1*2</f><v>2</v></c></row></sheetData></worksheet>';
const bayt = zipSync({ 'xl/worksheets/sheet1.xml': strToU8(sheet), 'docProps/core.xml': strToU8('<x>' + Math.random() + '</x>') });
async function sha(b: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', b as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

type Mock = { sarf?: unknown; qaytgan?: unknown; sarfla?: unknown[]; reserveXato?: boolean };
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
    if (url.includes('/rpc/t2_document_canonical_reserve_v1')) {
      return m.reserveXato ? Response.json({ ok: false, code: 'DOCUMENT_RESERVE_FAILED' }) : Response.json({ ok: true, document_id: 50, r2_key: 'docs/17/_/5/d50/r1', canonical_storage_status: 'reserved' });
    }
    if (url.includes('/rpc/t2_document_canonical_share_v1')) return Response.json({ ok: false, code: 'NO_SHARED_SOURCE' });
    if (url.includes('/rpc/t2_document_canonical_finalize_v1')) return Response.json({ ok: true, revision_seq: 1, sha256: 'x', sha256_verified: true, versiya: 1 });
    if (url.includes('t2_token_harakat') && url.includes('tur=eq.qaytarish')) return Response.json(m.qaytgan ?? []);
    if (url.includes('t2_token_harakat')) return Response.json(m.sarf ?? []);
    return Response.json({ ok: true });
  }));
  return chaqiruvlar;
}

async function yuklash(turi: string, extra: Record<string, string> = {}, fayl: Uint8Array = bayt) {
  const put = vi.fn(async () => ({}));
  const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
  const f = new FormData();
  f.set('fayl', new File([fayl], 'p.xlsx', { type: 'application/zip' }));
  f.set('kompaniya_id', '17'); f.set('turi', turi);
  f.set('operation_id', OP); f.set('sha256', await sha(fayl)); f.set('size', String(fayl.length));
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  const res = await yukla({ request: new Request('https://x/api/hujjat-yukla', { method: 'POST', headers: { Cookie: 'sess=' + sess }, body: f }),
    env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: { put } as unknown as R2Bucket } } as never);
  return { res, json: await res.json() as Record<string, unknown>, put };
}

describe('hujjat-yukla: eksport tokeni SERVERDA yechiladi', () => {
  it('F3, dalil yo\'q — server t2_token_sarfla_v1 ni sessiya aktori bilan chaqiradi (formula kataklari soni bilan), so\'ng saqlaydi', async () => {
    mockFetch({ sarf: [] });
    const { json, put } = await yuklash('f3', { obyekt_id: '5', revision: '2026-11-30' });
    expect(json, JSON.stringify(json)).toMatchObject({ ok: true, document_id: 50 });
    expect(put).toHaveBeenCalledTimes(1);
    const b = rpcBody.t2_token_sarfla_v1;
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ p_actor_id: 5, p_kompaniya_id: 17, p_amal: 'hujjat', p_birlik_soni: 2 });
    expect(b[0].p_operation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Dalil kaliti — mijoz hujjatTokenBilan bilan bir xil MAZMUN xeshi (docProps hisobga olinmaydi), xom bayt xeshi emas.
    expect(b[0].p_meta).toMatchObject({ hujjat: 'f3', obyekt: 5, davr: '2026-11', xesh: await mazmunXeshi(bayt), server: 1, sanoq: 'formula' });
    expect(await mazmunXeshi(bayt)).not.toBe(tolovXeshi(await sha(bayt)));
  });
  it('operation_id deterministik: bir xil hujjat — bir xil id; boshqa davr / obyekt — boshqa id', async () => {
    const id = async (extra: Record<string, string>) => { mockFetch({ sarf: [] }); await yuklash('f3', extra); return rpcBody.t2_token_sarfla_v1[0].p_operation_id;  };
    const a = await id({ obyekt_id: '5', revision: '2026-11' });
    expect(await id({ obyekt_id: '5', revision: '2026-11' })).toBe(a);
    expect(await id({ obyekt_id: '5', revision: '2026-12' })).not.toBe(a);
    expect(await id({ obyekt_id: '6', revision: '2026-11' })).not.toBe(a);
    expect(await sarfOperationId({ turi: 'f3', kompaniyaId: 17, obyektId: 5, davr: '2026-11', xesh: 'x' })).toBe(await sarfOperationId({ turi: 'f3', kompaniyaId: 17, obyektId: 5, davr: '2026-11-30', xesh: 'x' }));
  });
  it('F2 (obyekt bilan) — amal f2_hujjat; RPC bepul_takror qaytarsa — sarf ham, qaytarish ham yo\'q', async () => {
    mockFetch({ sarf: [], sarfla: [{ ok: true, sarflandi: 0, bepul_takror: true }] });
    const { json } = await yuklash('f2_hujjat', { obyekt_id: '5' });
    expect(json).toMatchObject({ ok: true });
    expect(rpcBody.t2_token_sarfla_v1[0]).toMatchObject({ p_amal: 'f2_hujjat' });
    expect(rpcBody.t2_token_qaytar_v1).toBeUndefined();
  });
  it('F2 obyektsiz — server yechmaydi, 402', async () => {
    mockFetch({ sarf: [] });
    expect((await yuklash('f2_hujjat')).res.status).toBe(402);
    expect(rpcBody.t2_token_sarfla_v1).toBeUndefined();
  });
  it('token yetmasa — 402 TOKEN_YETMAYDI (kerak/balans bilan), R2 ga ham reyestrga ham yozilmaydi', async () => {
    const c = mockFetch({ sarf: [], sarfla: [{ ok: false, code: 'TOKEN_YETMAYDI', kerak: 7, balans: 2 }] });
    const { res, json, put } = await yuklash('f3');
    expect(res.status).toBe(402);
    expect(json).toMatchObject({ code: 'TOKEN_YETMAYDI', kerak: 7, balans: 2 });
    expect(String(json.xato)).toContain('kerak 7');
    expect(put).not.toHaveBeenCalled();
    expect(c.some((u) => u.includes('/rpc/t2_document_canonical_reserve'))).toBe(false);
  });
  it('reyestr zahirasi xato bersa — serverda yechilgan token QAYTARILADI (t2_token_qaytar_v1)', async () => {
    mockFetch({ sarf: [], reserveXato: true });
    const { res, put } = await yuklash('f3');
    expect(res.status).toBe(502);
    expect(put).not.toHaveBeenCalled();
    const sarf = rpcBody.t2_token_sarfla_v1[0];
    expect(rpcBody.t2_token_qaytar_v1).toHaveLength(1);
    expect(rpcBody.t2_token_qaytar_v1[0]).toMatchObject({ p_actor_id: 5, p_kompaniya_id: 17, p_sarf_operation_id: sarf.p_operation_id });
  });
  it('R2 yozuvi xato bersa — token qaytariladi', async () => {
    mockFetch({ sarf: [] });
    const put = vi.fn(async () => { throw new Error('r2 down'); });
    const sess = await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
    const f = new FormData();
    f.set('fayl', new File([bayt], 'p.xlsx')); f.set('kompaniya_id', '17'); f.set('turi', 'f3');
    f.set('operation_id', OP); f.set('sha256', await sha(bayt)); f.set('size', String(bayt.length));
    const res = await yukla({ request: new Request('https://x/api/hujjat-yukla', { method: 'POST', headers: { Cookie: 'sess=' + sess }, body: f }),
      env: { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: { put } as unknown as R2Bucket } } as never);
    expect(res.status).toBe(500);
    expect(rpcBody.t2_token_qaytar_v1).toHaveLength(1);
  });
  it('avval qaytarilgan sarf (takror) — yangi urinish raqami bilan qayta yechiladi (bepul o\'tib ketmaydi)', async () => {
    mockFetch({ sarf: [], sarfla: [{ ok: true, takror: true, sarflandi: 3 }, { ok: true, sarflandi: 3 }], qaytgan: [{ bogliq_operation_id: SARF_OP }] });
    const { json } = await yuklash('f3');
    expect(json).toMatchObject({ ok: true });
    const b = rpcBody.t2_token_sarfla_v1;
    expect(b).toHaveLength(2);
    expect(b[0].p_operation_id).not.toBe(b[1].p_operation_id);
  });
  it('takror, qaytarilmagan — to\'langan deb olinadi (qayta yechilmaydi, qaytarish ham yo\'q)', async () => {
    mockFetch({ sarf: [], sarfla: [{ ok: true, takror: true, sarflandi: 3 }], qaytgan: [] });
    const { json } = await yuklash('f3');
    expect(json).toMatchObject({ ok: true });
    expect(rpcBody.t2_token_sarfla_v1).toHaveLength(1);
    expect(rpcBody.t2_token_qaytar_v1).toBeUndefined();
  });
  it('dalil bor (mijoz to\'lagan, mazmun xeshi mos) — server qayta yechmaydi', async () => {
    const c = mockFetch({ sarf: [{ operation_id: SARF_OP }], qaytgan: [] });
    const { json } = await yuklash('f3');
    expect(json).toMatchObject({ ok: true });
    expect(rpcBody.t2_token_sarfla_v1).toBeUndefined();
    expect(c.find((u) => u.includes('tur=eq.sarf'))).toContain(`meta->>xesh=eq.${await mazmunXeshi(bayt)}`);
  });
  it('paket ZIP — server ZIP ni qayta yechmaydi (ichki hujjatlar mijozda to\'langan): dalilsiz 402', async () => {
    mockFetch({ sarf: [] });
    expect((await yuklash('shartnoma_oylik_paket')).res.status).toBe(402);
    expect(rpcBody.t2_token_sarfla_v1).toBeUndefined();
  });
  it('sha256 mos kelmasa — token yechilmaydi (400)', async () => {
    mockFetch({ sarf: [] });
    const { res } = await yuklash('f3', { sha256: 'a'.repeat(64) });
    expect(res.status).toBe(400);
    expect(rpcBody.t2_token_sarfla_v1).toBeUndefined();
  });
  it('foydalanuvchining o\'z fayli (smeta) — token yechilmaydi', async () => {
    mockFetch({ sarf: [] });
    const { json } = await yuklash('smeta');
    expect(json).toMatchObject({ ok: true });
    expect(rpcBody.t2_token_sarfla_v1).toBeUndefined();
  });
});
