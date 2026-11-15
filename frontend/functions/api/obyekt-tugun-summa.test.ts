/**
 * /api/obyekt-tugun-summa: darvoza obyekt-paket bilan bir xil (401/403), natija `tugunSummalari` yadrosi bilan bir xil,
 * ustama manbai yo'q bo'lsa faqat ustamasiz. Sintetik ma'lumot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const D = vi.hoisted(() => ({ rows: [] as unknown[], states: [] as unknown[], ustama: null as unknown }));
vi.mock('../../src/lib/oylik-hujjat/ostatka-slichitelniy', () => ({
  daraxtToliqOl: vi.fn(async () => ({ ok: true, rows: D.rows, states: D.states })),
  ustamaManbaOl: vi.fn(async () => D.ustama),
}));
vi.mock('../_shared/hujjat-ichki', () => ({ ichkiRejimda: async (_c: unknown, fn: () => Promise<unknown>) => fn() }));

import { onRequestGet } from './obyekt-tugun-summa';
import { imzola } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { tugunSummalari } from '../../src/lib/tugun-summa';

const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_KEY: 'synthetic', SESSIYA_KALIT: 'k'.repeat(32) };
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const OK_RIGHTS = ['company.read', 'smeta.read', 'f2.read', 'narx.read'];

const row = (id: number, ota: number | null, tur: string, kat: string | null, summa: number | null) => ({ id, ota_id: ota, tur, kat, summa });
const st = (qator_id: number, fakt_summa: number | null, f2_summa: number | null) => ({ qator_id, fakt_summa, f2_summa });

beforeEach(() => {
  D.rows = [row(1, null, 'rz', null, 4_500_000), row(2, 1, 'bl', null, 4_500_000), row(3, 2, 'mat', 'МАТ', 3_000_000), row(4, 2, 'rs', 'ЧЕЛ', 1_500_000)];
  D.states = [st(1, 1_000_000, 500_000), st(2, 1_000_000, 500_000), st(3, 600_000, 300_000), st(4, 400_000, 200_000)];
  D.ustama = { ok: true, ustama: { koeffitsientlar: NK, podval: null, nkManba: null, svodYaxlit: null } };
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); otaKeshTozala(); });

function upstream(rights = OK_RIGHTS) {
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const u = new URL(String(raw));
    if (u.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 8, rol: 'pto', faol: true }], context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'pto', permissions: rights }] });
    if (u.pathname === '/rest/v1/t2_obyekt') return Response.json([{ kompaniya_id: 8 }]);
    throw new Error('Unexpected upstream ' + u.pathname);
  }));
}
async function get(authed = true, qs = 'obyekt_id=4') {
  const headers = new Headers();
  if (authed) headers.set('Cookie', 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 8, rol: 'pto' }] }, env.SESSIYA_KALIT));
  return onRequestGet({ request: new Request('https://fixture/api/obyekt-tugun-summa?' + qs, { headers }), env, data: {} } as never);
}

describe('obyekt-tugun-summa', () => {
  it('401 sessiyasiz; 400 noto\'g\'ri obyekt_id; 403 ruxsat yetmasa (hech narsa o\'qilmaydi)', async () => {
    upstream();
    expect((await get(false)).status).toBe(401);
    expect((await get(true, 'obyekt_id=abc')).status).toBe(400);
    vakolatKeshTozala(); otaKeshTozala(); upstream(['company.read', 'smeta.read']);
    const r = await get();
    expect(r.status).toBe(403);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('natija yadro bilan bir xil: har RZ/BL uchun [qqsBilan, ustamali, ustamasiz] x smeta/fakt/F-2', async () => {
    upstream();
    const r = await get();
    expect(r.status).toBe(200);
    const j = await r.json() as { ok: boolean; ustama: string; tugunlar: Array<[number, Array<number | null>, Array<number | null>, Array<number | null>]> };
    expect(j.ok).toBe(true); expect(j.ustama).toBe('bor');
    expect(j.tugunlar.map((t) => t[0]).sort()).toEqual([1, 2]);
    const kutilgan = tugunSummalari([
      { id: 1, ota_id: null, tur: 'rz', kat: null, smeta: 4_500_000, fakt: 1_000_000, f2: 500_000 }, { id: 2, ota_id: 1, tur: 'bl', kat: null, smeta: 4_500_000, fakt: 1_000_000, f2: 500_000 },
      { id: 3, ota_id: 2, tur: 'mat', kat: 'МАТ', smeta: 3_000_000, fakt: 600_000, f2: 300_000 }, { id: 4, ota_id: 2, tur: 'rs', kat: 'ЧЕЛ', smeta: 1_500_000, fakt: 400_000, f2: 200_000 },
    ], { koeffitsientlar: NK as never, podval: null, svodYaxlit: null });
    const bl = j.tugunlar.find((t) => t[0] === 2)!;
    const k = kutilgan.get(2)!;
    expect(bl[1]).toEqual([k.smeta.qqsBilan, k.smeta.ustamali, k.smeta.ustamasiz]);
    expect(bl[2]).toEqual([k.fakt.qqsBilan, k.fakt.ustamali, k.fakt.ustamasiz]);
    expect(bl[3]).toEqual([k.f2.qqsBilan, k.f2.ustamali, k.f2.ustamasiz]);
    expect(bl[1][0]).not.toBeNull();
  });

  it('ustama manbai o\'qilmasa: faqat ustamasiz (QQS bilan va ustamali null, 0 emas) + sabab', async () => {
    upstream();
    D.ustama = { ok: false, xato: 'koeffitsientlar yoq' };
    const j = await (await get()).json() as { ustama: string; sabab?: string; tugunlar: Array<[number, Array<number | null>]> };
    expect(j.ustama).toBe('yoq'); expect(j.sabab).toContain('koeffitsientlar');
    const bl = j.tugunlar.find((t) => t[0] === 2)!;
    expect(bl[1]).toEqual([null, null, 4_500_000]);
  });
});
