/** USERNAME-V1 — /api/company member_invite: actor sessiyadan, company.member.manage ruxsatiga bog‘langan, TOPILMADI telefon belgisi bilan. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../_shared/auth';
import { requestPermission } from '../_shared/permission-policy';
import { onRequestPost } from './company';

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key', SESSIYA_KALIT: 'a'.repeat(32) };
async function ctxOf(body: unknown, actorId = 3) {
  const token = await imzola({ rol: 'boss', email: 'boss@sinov', foydalanuvchi_id: actorId }, ENV.SESSIYA_KALIT);
  return { request: new Request('http://x/api/company', { method: 'POST', headers: { Cookie: `sess=${token}` }, body: JSON.stringify(body) }), env: ENV } as any;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('company member_invite (@username / telefon / email)', () => {
  it('ruxsat xaritasi: member_invite → company.member.manage (scope map)', () => {
    expect(requestPermission('company', 'POST', { action: 'member_invite' }, new URLSearchParams())).toBe('company.member.manage');
  });

  it('sessiya actor, qiymat uzunligi cheklanadi, operation_id beriladi', async () => {
    const f = vi.fn(async (u: string, init: RequestInit) => {
      expect(u).toContain('/rpc/t2_kompaniya_taklif_yubor_v1');
      const b = JSON.parse(init.body as string);
      expect(b).toMatchObject({ p_actor_id: 3, p_kompaniya_id: 17, p_qiymat: '@sinov_user', p_rol: 'prorab' });
      expect(typeof b.p_operation_id).toBe('string');
      return Response.json({ ok: true, taklif_id: 4, holat: 'kutmoqda', profil: { id: 9, ism: 'Sinov', username: 'sinov_user' } });
    });
    vi.stubGlobal('fetch', f);
    const r = await onRequestPost(await ctxOf({ action: 'member_invite', kompaniya_id: 17, qiymat: '@sinov_user', rol: 'prorab', p_actor_id: 999 }));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { taklif_id: number }).taklif_id).toBe(4);
  });

  it('hisob topilmadi + telefon → 404 va telefon_taklif belgisi (mavjud havola/kod oqimiga yo‘l)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, code: 'TOPILMADI', tur: 'telefon', telefon_taklif: true, telefon: '+998901234567' })));
    const r = await onRequestPost(await ctxOf({ action: 'member_invite', kompaniya_id: 17, qiymat: '90 123 45 67', rol: 'prorab' }));
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ ok: false, code: 'TOPILMADI', tur: 'telefon', telefon_taklif: true, telefon: '+998901234567' });
  });

  it('RUXSAT_YOQ → 403; ALREADY_MEMBER → 409; LIMIT → 429', async () => {
    for (const [code, status] of [['RUXSAT_YOQ', 403], ['ALREADY_MEMBER', 409], ['LIMIT', 429]] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, code })));
      expect((await onRequestPost(await ctxOf({ action: 'member_invite', kompaniya_id: 17, qiymat: '@x_user1', rol: 'prorab' }))).status).toBe(status);
    }
  });
});