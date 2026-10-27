/**
 * Egasi 2026-10-27: «tizim uchun taaluqli hamma narsalar superadmindan boshqada umuman chiqmasligi shart».
 * SERVER qatlami: token tannarxi/foydasi, tizim boshqaruv markazi va texnik diagnostika superadmin bo'lmaganga chiqmaydi.
 * Ma'lumotlar sintetik.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { onRequestPost as sbOqi } from './sb';
import { onRequestPost as sbYoz } from './sb-yoz';
import { onRequestGet as nazoratOqi, onRequestPost as nazoratYoz } from './system-control';
import { onRequestGet as diag } from './kontekst-diag';
import { tokenHolatTozala, tokenJavobTozala, aiJavobTozala } from '../_shared/tizim-maxfiy';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-key', SESSIYA_KALIT: 'k'.repeat(32) };
const op = '11111111-1111-4111-8111-111111111111';
const HISOB = { amal: 'f2_hujjat', nom: 'F2', birlik_soni: 792, birlik: 100, qism: 8, asos_som: 20000, birlik_som: 1000, tannarx_som: 28000, foyda_foiz: 30, min_som: 30000, max_som: 100000, yakuniy_som: 36400, token_som: 100, token: 364 };
const holat = (superadmin: boolean) => ({
  balans: 136, superadmin, obuna: null, tariflar: [], paketlar: [], sorovlar: [], demo_obyekt_id: null,
  sozlama: { token_som: 100, foyda_foiz: 30, royxat_bonus_token: 500, usd_kurs: 12700, tolov_rekvizit: 'X' },
  narxlar: [{ amal: 'f2_hujjat', nom: 'F2', tur: 'yacheyka', birlik: 100, narx: 1, minimum: 1, asos_som: 20000, birlik_som: 1000, min_som: 30000, max_som: 100000, foyda_foiz: null, izoh: null, faol: true }],
  harakatlar: [{ id: 2, miqdor: -364, tur: 'sarf', amal: 'f2_hujjat', birlik_soni: 792, izoh: null, yaratildi: '2026-10-02T10:00:00Z', meta: { sabab: 'F2 №1', hisob: HISOB } }],
});
const SIR = /tannarx|usd_kurs|"foyda_foiz":(?!0)|"narx":|"minimum":|28000|"asos_som":20000/;

function upstream(role: string, extra: (path: string, body: string) => Response | null = () => null) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(String(raw)); calls.push(url.pathname);
    const e = extra(url.pathname, String(init?.body ?? ''));
    if (e) return e;
    if (url.pathname.endsWith('/rpc/t2_men_v1')) return Response.json({ ok: true, platform_role: role === 'superadmin' ? 'superadmin' : 'none', foydalanuvchi: { holat: 'faol' }, context_kompaniyalar: [{ kompaniya_id: 17, effective_role: role === 'superadmin' ? 'boss' : role, permissions: ['company.read', 'control.company.read', 'control.company.write', 'document.read'] }] });
    if (url.pathname.endsWith('/rpc/t2_actor_kompaniya_azo_tekshir')) return Response.json(role);
    if (url.pathname.endsWith('/rpc/t2_token_holat_v1')) return Response.json(holat(role === 'superadmin'));
    if (url.pathname.endsWith('/rpc/t2_token_sarfla_v1')) return Response.json({ ok: true, sarflandi: 364, balans: 0, hisob: HISOB });
    if (url.pathname.endsWith('/rpc/t2_system_control_v1')) return Response.json({ ok: true, health: [{ id: 'supabase' }], integrations: [{ id: 'gas' }], jobs: [{ id: 'j' }], incidents: [], capabilities: [{ id: 'cap' }], version: { environment: 'production' }, auditEvents: [{ id: 1, action: 'F2 tasdiqlandi' }] });
    if (url.pathname.endsWith('/rpc/t2_boshqaruv_umumiy_v1')) return role === 'superadmin' ? Response.json({ foydalanuvchi: { id: 7 } }) : new Response('SUPERADMIN_KERAK', { status: 400 });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return Response.json({ ok: true });
    return Response.json([]);
  }));
  return calls;
}
/** Har rol — alohida foydalanuvchi (role-authority 60 s keshi foydalanuvchi bo'yicha). */
const cookie = async (id = 7) => 'sess=' + await imzola({ rol: 'boss', foydalanuvchi_id: id, kompaniyalar: [{ kompaniya_id: 17, rol: 'boss' }] }, env.SESSIYA_KALIT);
/** Middleware bazadan olgan vakolat (ctx.data.roleAuthority) — superadmin yoki kompaniya bossi. */
const vakolat = (role: string) => ({ roleAuthority: { rol: role, foydalanuvchi_id: 7, exp: Date.now() / 1000 + 3600, jti: 'x', kompaniyalar: [{ kompaniya_id: 17, rol: role === 'superadmin' ? 'boss' : role }] } });

afterEach(() => vi.unstubAllGlobals());

describe('token API: tannarx, foyda va ustama faqat superadminga', () => {
  it.each(['boss', 'admin', 'rahbar'])('%s: token_holat_v1 javobida tannarx/foyda/usd_kurs yo‘q; balans va sarf bor', async (role) => {
    upstream(role);
    const r = await sbOqi({ request: new Request('https://t/api/sb', { method: 'POST', headers: { Cookie: await cookie(50 + role.length) }, body: JSON.stringify({ soro: 'token_holat_v1', kompaniya_id: 17 }) }), env } as never);
    const j = await r.json() as { ok: boolean; natija: ReturnType<typeof holat> };
    expect(j.ok).toBe(true);
    expect(JSON.stringify(j.natija)).not.toMatch(SIR);
    expect(j.natija.balans).toBe(136);
    expect(j.natija.harakatlar[0]).toMatchObject({ miqdor: -364, meta: { hisob: { yakuniy_som: 36400, token: 364 } } });
    expect(j.natija.narxlar[0]).toMatchObject({ asos_som: 26000, birlik_som: 1300, foyda_foiz: 0, min_som: 30000 });
  });

  it('superadmin: token_holat_v1 to‘liq (tannarx, foyda, kurs)', async () => {
    upstream('superadmin');
    const r = await sbOqi({ request: new Request('https://t/api/sb', { method: 'POST', headers: { Cookie: await cookie(60) }, body: JSON.stringify({ soro: 'token_holat_v1', kompaniya_id: 17 }) }), env } as never);
    const j = await r.json() as { natija: ReturnType<typeof holat> };
    expect(j.natija.sozlama).toMatchObject({ foyda_foiz: 30, usd_kurs: 12700 });
    expect(j.natija.harakatlar[0].meta.hisob).toMatchObject({ tannarx_som: 28000, foyda_foiz: 30 });
  });

  it('token_sarfla_v1 javobi: bossga hisob tannarxsiz; superadminga to‘liq', async () => {
    for (const [role, toliq, id] of [['boss', false, 31], ['superadmin', true, 32]] as const) {
      upstream(role);
      const body = { amal: 'token_sarfla_v1', kompaniya_id: 17, tur_amal: 'f2_hujjat', birlik_soni: 792, operation_id: op };
      const r = await sbYoz({ request: new Request('https://t/api/sb-yoz', { method: 'POST', headers: { Cookie: await cookie(id) }, body: JSON.stringify(body) }), env } as never);
      const j = await r.json() as { ok: boolean; hisob: Record<string, unknown> };
      expect(j.ok, role).toBe(true);
      expect(j.hisob.yakuniy_som).toBe(36400);
      expect('tannarx_som' in j.hisob, role).toBe(toliq);
      expect('foyda_foiz' in j.hisob, role).toBe(toliq);
    }
  });

  it('sof funksiyalar: tozalash mijoz narxini o‘zgartirmaydi, faqat tarkibni yashiradi', () => {
    expect(tokenJavobTozala({ ok: true, hisob: HISOB })).toEqual({ ok: true, hisob: { amal: 'f2_hujjat', nom: 'F2', birlik_soni: 792, birlik: 100, qism: 8, yakuniy_som: 36400, token_som: 100, token: 364 } });
    const t = tokenHolatTozala(holat(false)) as ReturnType<typeof holat>;
    expect(t.sozlama).not.toHaveProperty('usd_kurs');
    expect(aiJavobTozala({ ok: true, model: 'vendor/x', provider: 'openrouter', usage: { cost: 1 }, model_manba: 'kompaniya', qadamlar: [{ belgi: '🤖', matn: 'Model: vendor/x — limit' }] }))
      .toEqual({ ok: true, model: 'ai', qadamlar: [{ belgi: '🤖', matn: 'Model tanlandi — limit' }] });
  });
});

describe('tizim boshqaruv markazi (/api/system-control): kompaniyaga faqat o‘z audit jurnali', () => {
  const get = async (data: unknown) => nazoratOqi({ request: new Request('https://t/api/system-control?kompaniya_id=17', { headers: { Cookie: await cookie(33) } }), env, data } as never);
  it('boss: sog‘liq, integratsiya, fon ishlari, bayroqlar, versiya YO‘Q; audit bor', async () => {
    upstream('boss');
    const j = await (await get(vakolat('boss'))).json() as Record<string, unknown>;
    expect(j).toEqual({ ok: true, auditEvents: [{ id: 1, action: 'F2 tasdiqlandi' }] });
  });
  it('vakolat yo‘q (middleware ishlamagan) — fail-closed: faqat audit', async () => {
    upstream('boss');
    expect(Object.keys(await (await get(undefined)).json() as object).sort()).toEqual(['auditEvents', 'ok']);
  });
  it('superadmin: to‘liq', async () => {
    upstream('superadmin');
    const j = await (await get(vakolat('superadmin'))).json() as Record<string, unknown>;
    expect(j).toHaveProperty('health'); expect(j).toHaveProperty('integrations'); expect(j).toHaveProperty('jobs'); expect(j).toHaveProperty('capabilities');
  });
  const post = (data: unknown, body: unknown) => nazoratYoz({ request: new Request('https://t/api/system-control', { method: 'POST', body: JSON.stringify(body) }), env, data } as never);
  it('boss: o‘z kompaniyasida faqat MODUL yoqish/o‘chirish; texnik bayroq, kill-switch, fon ishi — 403 (RPC ga yetmaydi)', async () => {
    const calls = upstream('boss');
    const modul = await post(vakolat('boss'), { action: 'capability_override_set', kod: 'module.narx', scope: 'company', scope_id: 17, holat: 'off', kompaniya_id: 17 });
    expect(modul.status).toBe(200);
    for (const b of [
      { action: 'capability_override_set', kod: 'f2.import.v3', scope: 'company', scope_id: 17, holat: 'off' },
      { action: 'capability_override_set', kod: 'module.narx', scope: 'global', holat: 'off' },
      { action: 'capability_killswitch', kod: 'x', on: true },
      { action: 'job_control', job_kod: 'j', job_action: 'pause' },
      { action: 'deploy_state_set' },
    ]) {
      const n = calls.length;
      const r = await post(vakolat('boss'), b);
      expect(r.status, JSON.stringify(b)).toBe(403);
      expect(calls.slice(n), JSON.stringify(b)).toEqual([]);
    }
  });
});

describe('texnik diagnostika (/api/kontekst-diag) — faqat superadmin (bazada qayta tekshiriladi)', () => {
  it('boss: 403, sozlama holati chiqmaydi; superadmin: diagnostika', async () => {
    upstream('boss');
    const r = await diag({ request: new Request('https://t/api/kontekst-diag', { headers: { Cookie: await cookie(41) } }), env } as never);
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toMatch(/supabase_key_set|sessiya_kalit_set/);
    upstream('superadmin');
    const s = await diag({ request: new Request('https://t/api/kontekst-diag', { headers: { Cookie: await cookie(42) } }), env } as never);
    expect(await s.json()).toHaveProperty('supabase_key_set', true);
  });
});
