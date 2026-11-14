import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as yozish } from './sb-yoz';
import { imzola } from '../_shared/auth';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { ilovaKeshTozala } from '../_shared/ilova-darvoza';
import { writeCommandPermission } from '../_shared/write-command-policy';
import { dataPermission } from '../_shared/permission-policy';

/** Usta В«BugunВ» amallari: actor sessiyadan, operation_id, ruxsat (usta qaror/fakt.write qila olmaydi). */
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
const OP = '11111111-1111-4111-8111-111111111111';
const IZIN: Record<string, string[]> = { usta: ['company.read', 'object.read', 'document.read', 'fakt.read', 'self.work.read', 'self.work.write'] };
afterEach(() => { vi.unstubAllGlobals(); otaKeshTozala(); vakolatKeshTozala(); ilovaKeshTozala(); });

async function chaqir(body: unknown, { rol = 'boss', rpcJavob = { ok: true, qator_soni: 1, holat: 'qoralama' } as unknown, modul = 'on' }: { rol?: string; rpcJavob?: unknown; modul?: 'on' | 'off' } = {}) {
  const rpc: { yol: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(String(raw));
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol, faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: rol, permissions: IZIN[rol] ?? [] }] });
    if (url.pathname.endsWith('/rpc/t2_modul_holat_v1')) return Response.json({ ok: true, modullar: [{ kod: 'module.xarid', holat: modul }] });
    if (url.pathname === '/rest/v1/t2_obyekt') return Response.json([{ id: 5, kompaniya_id: 17 }]);
    if (url.pathname === '/rest/v1/t2_naryad') return Response.json([{ id: 5, kompaniya_id: 17 }]);
    if (url.pathname === '/rest/v1/t2_qator') return Response.json([{ id: 301, kompaniya_id: 17 }]);
    if (url.pathname === '/rest/v1/t2_shartnoma') return Response.json([{ id: 31, kompaniya_id: 17 }]);   // shlyuz p_shartnoma_id egaligini tekshiradi
    if (url.pathname === '/rest/v1/t2_erp_taminot') {
      // 44 - o'z kompaniyasiniki, 55 - begona kompaniyaniki
      const idlar = (url.searchParams.get('id') ?? '').replace(/[^0-9,]/g, '').split(',').filter(Boolean).map(Number);
      return Response.json(idlar.filter((i) => i === 44 || i === 55).map((i) => ({ id: i, kompaniya_id: i === 44 ? 17 : 99 })));
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) { rpc.push({ yol: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : {} }); return Response.json(rpcJavob); }
    throw new Error('Unexpected upstream ' + url.pathname);
  }));
  const token = await imzola({ rol: rol as never, foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol }] }, env.SESSIYA_KALIT);
  const res = await yozish({ request: new Request('https://test/api/sb-yoz', { method: 'POST', headers: { Cookie: 'sess=' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env } as never);
  return { res, rpc, json: await res.json() as Record<string, unknown> };
}

const fakt = (ustiga: Record<string, unknown> = {}) => ({ amal: 'usta_fakt_qoralama_v1', kompaniya_id: 17, operation_id: OP, obyekt_id: 5, sana: '2026-11-12', qatorlar: [{ qator_id: 301, hajm: 2.5 }], izoh: 'beton quyildi', ...ustiga });

describe('usta_fakt_qoralama_v1', () => {
  it('usta qoralama yoza oladi; actor sessiyadan, oq ro\'yxatdagi argumentlar bilan', async () => {
    const { res, rpc } = await chaqir(fakt({ p_actor_id: 999, ortiqcha: 'x' }), { rol: 'usta' });
    expect(res.status).toBe(200);
    expect(rpc).toHaveLength(1);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_usta_fakt_qoralama_v1');
    expect(rpc[0].body).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_obyekt_id: 5, p_sana: '2026-11-12', p_qatorlar: [{ qator_id: 301, hajm: 2.5 }], p_izoh: 'beton quyildi', p_foto_hujjat_id: null, p_operation_id: OP });
  });
  it('operation_id UUID bo\'lmasa вЂ” RPC chaqirilmaydi (oflayn navbat idempotentligi)', async () => {
    const { res, rpc } = await chaqir(fakt({ operation_id: 'x' }), { rol: 'usta' });
    expect(res.status).toBe(400); expect(rpc).toHaveLength(0);
  });
  it.each([['hajm 0', { qatorlar: [{ qator_id: 301, hajm: 0 }] }], ['qatorsiz', { qatorlar: [] }], ['sana yomon', { sana: '12.11.2026' }]])('%s вЂ” rad', async (_n, ustiga) => {
    const { res, rpc } = await chaqir(fakt(ustiga as Record<string, unknown>), { rol: 'usta' });
    expect(res.status).toBe(400); expect(rpc).toHaveLength(0);
  });
});

describe('usta_zayavka_v1 va qaror', () => {
  it('usta zayavka yoza oladi (draft RPC)', async () => {
    const { res, rpc } = await chaqir({ amal: 'usta_zayavka_v1', kompaniya_id: 17, operation_id: OP, obyekt_id: 5, nomi: 'Sement M400', miqdor: 3, birlik: 'tonna' }, { rol: 'usta' });
    expect(res.status).toBe(200);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_usta_zayavka_v1');
    expect(rpc[0].body).toMatchObject({ p_actor_id: 7, p_item_text: 'Sement M400', p_requested_qty: 3, p_unit: 'tonna', p_operation_id: OP });
  });
  it('usta qarorni (tasdiq) bera olmaydi va to\'g\'ridan-to\'g\'ri fakt_yoz_v2 ham yoza olmaydi', async () => {
    const q = await chaqir({ amal: 'usta_fakt_qaror_v1', kompaniya_id: 17, operation_id: OP, idlar: [1], qaror: 'tasdiqlangan' }, { rol: 'usta' });
    expect(q.rpc).toHaveLength(0); expect(q.res.status).toBeGreaterThanOrEqual(400);
    const f = await chaqir({ amal: 'fakt_yoz_v2', kompaniya_id: 17, operation_id: OP, obyekt_id: 5, sana: '2026-11-12', qatorlar: [{ qator_id: 301, hajm: 1 }] }, { rol: 'usta' });
    expect(f.rpc).toHaveLength(0); expect(f.res.status).toBeGreaterThanOrEqual(400);
  });
  it('ruxsat reyestri: qoralama/zayavka вЂ” self.work.write, qaror вЂ” fakt.write', () => {
    expect(writeCommandPermission('usta_fakt_qoralama_v1')).toBe('self.work.write');
    expect(writeCommandPermission('usta_zayavka_v1')).toBe('self.work.write');
    expect(writeCommandPermission('usta_fakt_qaror_v1')).toBe('fakt.write');
    expect(dataPermission('usta_fakt_qaror_v1', true, {})).toBeTruthy();
  });
});

describe('naryad_usta_bajarildi_v1 (usta Bajardim)', () => {
  const yuk = (ustiga: Record<string, unknown> = {}) => ({ amal: 'naryad_usta_bajarildi_v1', naryad_amal: 'bajarildi', kompaniya_id: 17, operation_id: OP, naryad_id: 5, kutilgan_versiya: 3, qatorlar: [{ id: 11, bajarilgan_hajm: 4 }], tugadi: false, izoh: 'x', ...ustiga });
  it('usta (self.work.write) o‘tadi: RPC ga faqat oq ro‘yxatdagi maydonlar, actor sessiyadan', async () => {
    const { res, rpc } = await chaqir(yuk({ p_actor_id: 999, ortiqcha: 1 }), { rol: 'usta' });
    expect(res.status).toBe(200);
    expect(rpc[0].yol).toBe('/rest/v1/rpc/t2_naryad_usta_bajarildi_v1');
    expect(rpc[0].body).toEqual({ p_kompaniya_id: 17, p_actor_id: 7, p_operation_id: OP, p_naryad_id: 5, p_kutilgan_versiya: 3, p_qatorlar: [{ id: 11, bajarilgan_hajm: 4 }], p_tugadi: false, p_izoh: 'x' });
  });
  it('naryad_amal belgisiz — fail-closed (smeta.write talab qilinadi), usta o‘tmaydi', async () => {
    const r = await chaqir(yuk({ naryad_amal: undefined }), { rol: 'usta' });
    expect(r.rpc).toHaveLength(0); expect(r.res.status).toBeGreaterThanOrEqual(400);
  });
  it('noto‘g‘ri hajm (manfiy) va bo‘sh qatorlar — rad', async () => {
    expect((await chaqir(yuk({ qatorlar: [{ id: 11, bajarilgan_hajm: -1 }] }), { rol: 'usta' })).res.status).toBe(400);
    expect((await chaqir(yuk({ qatorlar: [] }), { rol: 'usta' })).res.status).toBe(400);
  });
});
