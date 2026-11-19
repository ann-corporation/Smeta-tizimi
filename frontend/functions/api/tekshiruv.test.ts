// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestGet, onRequestPost, urinish } from './tekshiruv';
import { sha256Matn } from '../../src/lib/imzo/yadro';

const ENV = { SESSIYA_KALIT: 'k'.repeat(32), SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key' };
const MEN = { ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, azoliklar: [{ kompaniya_id: 17, rol: 'texnadzor', faol: true }], context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'texnadzor' }] };
const T = 'N'.repeat(22);

type Rpcs = Record<string, unknown | ((body: any) => unknown)>;
function mockFetch(rpcs: Rpcs) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const nom = String(url).split('/rpc/')[1];
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (nom === 't2_men_v1') return Response.json(MEN);
    if (!(nom in rpcs)) throw new Error('kutilmagan rpc: ' + nom);
    const v = rpcs[nom];
    return Response.json(typeof v === 'function' ? (v as (b: unknown) => unknown)(body) : v);
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const calls = (f: ReturnType<typeof mockFetch>, nom: string) => f.mock.calls.filter((c) => String(c[0]).endsWith('/rpc/' + nom));
const body = (f: ReturnType<typeof mockFetch>, nom: string) => JSON.parse(String(calls(f, nom)[0][1]!.body));
const J = (r: Response): Promise<any> => r.json();
const cookie = async () => 'sess=' + await imzola({ rol: 'texnadzor', email: 'tx', foydalanuvchi_id: 7, kompaniyalar: [{ kompaniya_id: 17, rol: 'texnadzor' }] } as never, ENV.SESSIYA_KALIT);
const post = async (b: unknown, c?: string | null, origin?: string) => onRequestPost({ request: new Request('https://t.example/api/tekshiruv', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(c === null ? {} : { Cookie: c ?? await cookie() }), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(b) }), env: ENV, data: {} } as never);
const get = async (qs: string, c?: string | null) => onRequestGet({ request: new Request('https://t.example/api/tekshiruv?' + qs, { headers: c === null ? {} : { Cookie: c ?? await cookie() } }), env: ENV, data: {} } as never);

beforeEach(() => { vakolatKeshTozala(); urinish.tozala(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('/api/tekshiruv - sessiya va ruxsat', () => {
  it('sessiyasiz - 401; begona origin - 403; token shakli noto\'g\'ri - 404/400 (RPC chaqirilmaydi)', async () => {
    const f = mockFetch({});
    expect((await get('token=' + T, null)).status).toBe(401);
    expect((await post({ amal: 'holat', token: T, holat: 'qabul' }, null)).status).toBe(401);
    expect((await post({ amal: 'holat', token: T, holat: 'qabul' }, undefined, 'https://evil.example')).status).toBe(403);
    expect((await get('token=qisqa')).status).toBe(404);
    expect((await post({ amal: 'holat', token: 'qisqa', holat: 'qabul' })).status).toBe(400);
    expect(calls(f, 't2_tekshiruv_ochish_v1')).toHaveLength(0);
  });

  it('ochish: aktor sessiyadan (tanadagi/so\'rovdagi actor e\'tiborsiz); begona kompaniya/rol - 403', async () => {
    const f = mockFetch({ t2_tekshiruv_ochish_v1: { ok: false, code: 'RUXSAT_YOQ' } });
    const r = await get('token=' + T + '&p_actor_id=99');
    expect(r.status).toBe(403); expect(await J(r)).toEqual({ ok: false, code: 'RUXSAT_YOQ' });
    expect(body(f, 't2_tekshiruv_ochish_v1')).toEqual({ p_actor_id: 7, p_token: T });
  });

  it('ochish: ruxsat bor - panel javobi o\'zgarishsiz qaytadi; token yo\'q - 404', async () => {
    mockFetch({ t2_tekshiruv_ochish_v1: { ok: true, rol: 'tekshiruvchi', qatorlar: [], takliflar: [] } });
    expect(await J(await get('token=' + T))).toMatchObject({ ok: true, rol: 'tekshiruvchi' });
    mockFetch({ t2_tekshiruv_ochish_v1: { ok: false, code: 'TOPILMADI' } });
    expect((await get('token=' + T)).status).toBe(404);
  });
});

describe('/api/tekshiruv - taklif yozish (F-2 ga yozilmaydi)', () => {
  it('saqla: talab tozalanadi, RPC ga aktor sessiyadan; faqat tekshiruv RPC lari chaqiriladi', async () => {
    const f = mockFetch({ t2_tekshiruv_saqla_v1: { ok: true, id: 5 } });
    const j = await J(await post({ amal: 'saqla', token: T, qator_id: 41, bayroq: 'hajm_notogri', izoh: '  loyiha bilan mos emas ', taklif_hajm: '3,5', rang: 'qizil', p_actor_id: 99 }));
    expect(j).toEqual({ ok: true, id: 5, ochirildi: false });
    expect(body(f, 't2_tekshiruv_saqla_v1')).toEqual({ p_actor_id: 7, p_token: T, p_qator_id: 41, p_bayroq: 'hajm_notogri', p_izoh: 'loyiha bilan mos emas', p_taklif_hajm: 3.5, p_rang: 'qizil', p_hujjat_turi: null, p_qosh: false });
    expect(f.mock.calls.every((c) => /\/rpc\/(t2_men_v1|t2_tekshiruv_[a-z_0-9]+)$/.test(String(c[0])) || !String(c[0]).includes('/rpc/'))).toBe(true);
  });

  it('saqla: noto\'g\'ri belgi/rang/hajm, hujjat_kerak turisiz - 400 (RPC chaqirilmaydi)', async () => {
    const f = mockFetch({ t2_tekshiruv_saqla_v1: { ok: true } });
    for (const x of [{ bayroq: 'yomon' }, { rang: 'pushti' }, { taklif_hajm: -1 }, { taklif_hajm: 'abc' }, { bayroq: 'hujjat_kerak' }, { izoh: 'x'.repeat(1001) }, { qator_id: 0 }]) {
      expect((await post({ amal: 'saqla', token: T, qator_id: 41, ...x })).status).toBe(400);
    }
    expect(calls(f, 't2_tekshiruv_saqla_v1')).toHaveLength(0);
  });

  it('saqla: PTO hal qilgan taklif - 409; qator F-2 da yo\'q - 400', async () => {
    mockFetch({ t2_tekshiruv_saqla_v1: { ok: false, code: 'QAROR_QOYILGAN' } });
    expect((await post({ amal: 'saqla', token: T, qator_id: 41, izoh: 'x' })).status).toBe(409);
    mockFetch({ t2_tekshiruv_saqla_v1: { ok: false, code: 'QATOR_NOTOGRI' } });
    expect((await post({ amal: 'saqla', token: T, qator_id: 41, izoh: 'x' })).status).toBe(400);
  });

  it('holat: faqat 4 ta qiymat; qidir: 2..80 belgi', async () => {
    const f = mockFetch({ t2_tekshiruv_holat_v1: { ok: true, holat: 'qabul' }, t2_tekshiruv_qidir_v1: { ok: true, qatorlar: [] } });
    expect(await J(await post({ amal: 'holat', token: T, holat: 'qabul', izoh: 'ok' }))).toEqual({ ok: true, holat: 'qabul' });
    expect((await post({ amal: 'holat', token: T, holat: 'hammasi_yaxshi' })).status).toBe(400);
    expect((await post({ amal: 'qidir', token: T, q: 'a' })).status).toBe(400);
    expect((await post({ amal: 'qidir', token: T, q: 'beton' })).status).toBe(200);
    expect(calls(f, 't2_tekshiruv_holat_v1')).toHaveLength(1);
  });
});

describe('/api/tekshiruv - bir martalik kod va bog\'lash', () => {
  it('kod_ber: kod mijozga FAQAT javobda; bazaga faqat xesh ketadi', async () => {
    const f = mockFetch({ t2_tekshiruv_kod_ber_v1: { ok: true } });
    const j = await J(await post({ amal: 'kod_ber', token: T, ism: 'Tekshiruvchi', soat: 24 }));
    expect(j.ok).toBe(true); expect(j.kod).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const b = body(f, 't2_tekshiruv_kod_ber_v1');
    expect(b.p_kod_xesh).toBe(await sha256Matn(j.kod)); expect(JSON.stringify(b)).not.toContain(j.kod);
    expect((await post({ amal: 'kod_ber', token: T, soat: 9999 })).status).toBe(400);
  });

  it('kod_ber: PTO bo\'lmaganga - 403; kod_ol: yaroqsiz - 403, tezlik cheklovi', async () => {
    mockFetch({ t2_tekshiruv_kod_ber_v1: { ok: false, code: 'RUXSAT_YOQ' }, t2_tekshiruv_kod_ol_v1: { ok: false, code: 'KOD_YAROQSIZ' } });
    expect((await post({ amal: 'kod_ber', token: T })).status).toBe(403);
    expect((await post({ amal: 'kod_ol', token: T, kod: 'K'.repeat(22) })).status).toBe(403);
    expect((await post({ amal: 'kod_ol', token: T, kod: 'qisqa' })).status).toBe(400);
    let oxirgi = 0; for (let i = 0; i < 10; i++) oxirgi = (await post({ amal: 'kod_ol', token: T, kod: 'K'.repeat(22) })).status;
    expect(oxirgi).toBe(400);   // 8 urinishdan keyin kod tekshiruvi to'xtaydi
  });

  it('bog: akt versiyaga bog\'lanadi (RPC), akt id musbat butun bo\'lsin; noma\'lum amal - 400', async () => {
    const f = mockFetch({ t2_tekshiruv_bog_v1: { ok: true, yangi: true } });
    expect(await J(await post({ amal: 'bog', token: T, akt_id: 41 }))).toEqual({ ok: true, yangi: true });
    expect(body(f, 't2_tekshiruv_bog_v1')).toEqual({ p_actor_id: 7, p_token: T, p_akt_id: 41 });
    expect((await post({ amal: 'bog', token: T, akt_id: -3 })).status).toBe(400);
    expect((await post({ amal: 'nomalum', token: T })).status).toBe(400);
  });
});

describe('/api/tekshiruv - yaroqsiz, muddati utgan, begona kompaniya tokeni rad etiladi', () => {
  it('har amal: nomalum token 404, begona kompaniya 403, muddati utgan kod 403; F-2 ga yozilmaydi', async () => {
    const f = mockFetch({
      t2_tekshiruv_ochish_v1: (b: any) => (b.p_token === T ? { ok: false, code: 'RUXSAT_YOQ' } : { ok: false, code: 'TOPILMADI' }),
      t2_tekshiruv_saqla_v1: { ok: false, code: 'RUXSAT_YOQ' },
      t2_tekshiruv_holat_v1: { ok: false, code: 'RUXSAT_YOQ' },
      t2_tekshiruv_qidir_v1: { ok: false, code: 'RUXSAT_YOQ' },
      t2_tekshiruv_kod_ol_v1: { ok: false, code: 'KOD_YAROQSIZ' },
    });
    expect((await get('token=' + 'Z'.repeat(22))).status).toBe(404);      // bazada yo'q token
    expect((await get('token=' + T)).status).toBe(403);                   // boshqa kompaniya / rolsiz
    expect((await post({ amal: 'saqla', token: T, qator_id: 1, izoh: 'x' })).status).toBe(403);
    expect((await post({ amal: 'holat', token: T, holat: 'qabul' })).status).toBe(403);
    expect((await post({ amal: 'qidir', token: T, q: 'beton' })).status).toBe(403);
    expect((await post({ amal: 'kod_ol', token: T, kod: 'E'.repeat(22) })).status).toBe(403);   // muddati o'tgan kod
    expect(f.mock.calls.every((c) => !String(c[0]).includes('f2_qoralama') && !String(c[0]).includes('t2_akt'))).toBe(true);
  });
});