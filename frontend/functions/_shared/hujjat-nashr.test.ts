// @vitest-environment node
// @ts-nocheck -- fon yasash (server) ga manba QR: brauzer eksporti bilan bir xil nashrQoy yo'li, Worker adapteri RPC orqali.
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { unzipSync, strFromU8 } from 'fflate';
import { serverNashrQoy, nusxaBiriktir } from './hujjat-nashr';
import { f2gaQrQosh } from './hujjat-yangila';
import { imzoVaraqiBormi } from '../../src/lib/imzo/mazmun';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k' };
const TOKEN = 'T'.repeat(22);
async function xlsx() {
  const wb = new ExcelJS.Workbook(); const v = wb.addWorksheet('F2');
  v.addRow(['Kod', 'Nom', 'Hajm']); v.addRow(['A-1', 'Beton', 12.5]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
function rpcMock(javob: Record<string, unknown>) {
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const nom = String(url).split('/rpc/')[1];
    const j = typeof javob[nom] === 'function' ? (javob[nom] as (b: unknown) => unknown)(JSON.parse(String(init.body))) : javob[nom] ?? { ok: false };
    return new Response(JSON.stringify(j), { status: 200 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const chaqiruvlar = (f: ReturnType<typeof vi.fn>, nom: string) => f.mock.calls.filter((c) => String(c[0]).endsWith('/rpc/' + nom)).map((c) => JSON.parse(String(c[1].body)));
afterEach(() => vi.unstubAllGlobals());

describe('server F-2 ga manba QR', () => {
  it('xlsx ga IMZO varag\'i + QR qo\'yiladi, token aktga bog\'lanadi, kompaniya meta dan (global kontekstsiz)', async () => {
    const f = rpcMock({ t2_nashr_tayyor_v1: { ok: true, token: TOKEN, yangi: true, hujjat_id: null }, t2_f2_tekshiruv_bog_v1: { ok: true, yangi: true } });
    const bytes = await xlsx();
    const n = await serverNashrQoy(ENV, bytes, 'F2_Obyekt_5.xlsx', { actorId: 9, kompaniyaId: 17, obyektId: 5, origin: 'https://qur.example', turi: 'f2', aktId: 100 });
    expect(n).not.toBeNull();
    expect(n!.token).toBe(TOKEN); expect(n!.nusxaKerak).toBe(true);
    expect(imzoVaraqiBormi(n!.bytes)).toBe(true);
    const fayllar = unzipSync(n!.bytes);
    expect(Object.keys(fayllar).some((k) => /media\/.*\.png$/.test(k))).toBe(true);
    expect(Object.entries(fayllar).some(([k, v]) => /sheet\d+\.xml$|sharedStrings/.test(k) && strFromU8(v).includes('/t/' + TOKEN))).toBe(true);
    expect(chaqiruvlar(f, 't2_nashr_tayyor_v1')[0]).toMatchObject({ p_actor_id: 9, p_kompaniya_id: 17, p_obyekt_id: 5, p_turi: 'f2' });
    expect(chaqiruvlar(f, 't2_f2_tekshiruv_bog_v1')[0]).toEqual({ p_actor_id: 9, p_token: TOKEN, p_akt_id: 100 });
  });
  it('RPC xato bo\'lsa QR siz (null) - eksport to\'xtamaydi', async () => {
    rpcMock({ t2_nashr_tayyor_v1: { ok: false, code: 'RUXSAT_YOQ' } });
    expect(await serverNashrQoy(ENV, await xlsx(), 'F2.xlsx', { actorId: 9, kompaniyaId: 17, obyektId: 5, origin: 'https://qur.example', turi: 'f2', aktId: 100 })).toBeNull();
  });
  it('f2gaQrQosh: QR li bayt + QR dan oldingi mazmun xeshi (Disk kaliti barqaror); xatoda asl F2Tayyor', async () => {
    rpcMock({ t2_nashr_tayyor_v1: { ok: true, token: TOKEN, yangi: false, hujjat_id: 77 }, t2_f2_tekshiruv_bog_v1: { ok: true } });
    const bytes = await xlsx();
    const t = { bytes, faylNomi: 'F2_5.xlsx', turi: 'f2_hujjat', obyektId: 5, davr: '2031-03', xesh: 'x', arxivla: true, moliya: null, manba: { turi: 'f2', id: 100, kalit: 'f2:100', nom: 'F-2' }, akt: { id: 100 } };
    const q = { kompaniya_id: 17, obyekt_id: 5, manba_id: 100, aktor_id: 9 };
    const r = await f2gaQrQosh(ENV, 'https://qur.example', q, t);
    expect(r.nashr).toMatchObject({ token: TOKEN, nusxaKerak: false });
    expect(r.bytes).not.toBe(bytes);
    const r2 = await f2gaQrQosh(ENV, 'https://qur.example', q, t);
    expect(r2.nashr.mazmunXesh).toBe(r.nashr.mazmunXesh);
    rpcMock({ t2_nashr_tayyor_v1: { ok: false } });
    expect(await f2gaQrQosh(ENV, 'https://qur.example', q, t)).toBe(t);
  });
  it('nusxaBiriktir: registry yozuvi nashrga biriktiriladi', async () => {
    const f = rpcMock({ t2_nashr_nusxa_v1: { ok: true, hujjat_id: 55 } });
    expect(await nusxaBiriktir(ENV, 9, TOKEN, 55)).toBe(true);
    expect(chaqiruvlar(f, 't2_nashr_nusxa_v1')[0]).toEqual({ p_actor_id: 9, p_token: TOKEN, p_hujjat_id: 55 });
  });
});
