/**
 * company.ts — COMPANY / AUTH / DIRECTOR canonical transport.
 * session -> actor -> Supabase RPC. Actor id ALWAYS from the verified session.
 *
 *   GET  /api/company?me=1                      -> t2_men_v1 (identity + memberships)
 *   GET  /api/company?profile=<kompaniya_id>     -> t2_kompaniya profile row (membership-checked)
 *   GET  /api/company?authorize=1&permission=P
 *        [&kompaniya_id=&loyiha_id=&obyekt_id=]  -> t2_effective_authorization_v1 passthrough
 *        (T2-COMPANY-CONTROL-CLOSEOUT: Direct URL guard — the frontend calls
 *        this before rendering a protected route, so a forged/stale company
 *        context or a revoked membership is rejected server-side, not just
 *        hidden from the menu.)
 *   POST /api/company { action, ... }           -> audited onboarding command
 *        action: create | member_add | member_role | member_remove |
 *                member_password_set | profile_update
 *
 * No Drive/Sheets/GAS. No fake subscription/payment.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizXato } from '../_shared/xato';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

const RPC = {
  me: 't2_men_v1',
  azolik_ruxsat_set:'t2_azolik_ruxsat_set_v2',
  /* T2-COMPANY-CREATE-GATE-001: to'g'ridan-to'g'ri yaratish endi FAQAT
     platforma superadmini uchun (RPC o'zi tekshiradi). Oddiy foydalanuvchi
     `royxat_soraw` orqali so'rov yuboradi -- kompaniya/a'zolik superadmin
     tasdiqlagandan keyingina paydo bo'ladi. */
  create: 't2_kompaniya_yarat_v1',
  royxat_soraw: 't2_kompaniya_royxat_soraw_v1',
  royxat_royxat: 't2_kompaniya_royxat_royxat_v1',
  royxat_tasdiqla: 't2_kompaniya_royxat_tasdiqla_v1',
  royxat_rad_et: 't2_kompaniya_royxat_rad_et_v1',
  member_add: 't2_azolik_qosh_v1',
  member_role: 't2_azolik_rol_ozgartir_v1',
  member_remove: 't2_azolik_ochir_v1',
  /* T2-AUTH-PASSWORD-MIGRATION-001: director issues/resets a bcrypt password
     for a member of their own company. Dual-check with the legacy GAS
     _XODIMLAR sheet -- see frontend/functions/api/kirish.ts. */
  member_password_set: 't2_parol_belgila_v1',
  profile_update: 't2_kompaniya_yangila_v1',
  /* T2-RUXSAT-QOSHIMCHA-001: a'zoning rolini o'zgartirmasdan, unga
     qo'shimcha (rolining qattiq to'plamidan tashqari) ruxsat berish/
     olib tashlash. Faqat t2_effective_authorization_v1 orqali o'tadigan
     tekshiruvlarga ta'sir qiladi -- boshqa yozish RPC'lariga emas. */
  azolik_ruxsat_royxat: 't2_azolik_ruxsat_qoshimcha_royxat_v1',
  azolik_ruxsat_ber: 't2_azolik_ruxsat_qoshimcha_ber_v1',
  azolik_ruxsat_olib_tashla: 't2_azolik_ruxsat_qoshimcha_olib_tashla_v1',
} as const;

const AUTHZ_PERMISSIONS = new Set([
  'f2.read','f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct','smeta.read','smeta.write','fakt.read','fakt.write','narx.read','narx.write',
  'company.read', 'company.profile.update', 'company.member.manage',
  'control.company.read', 'control.company.write', 'control.global.read', 'control.global.write',
  'project.read', 'project.write', 'object.read', 'object.write',
  'document.read', 'document.write', 'financial.read', 'financial.write',
]);

async function callRpc(env: Env, name: string, body: unknown) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* keep raw */ }
  return { r, j, text };
}

function statusFor(code: string, raw: string): number {
  if (code === 'ACTOR_NOT_FOUND' || code === 'COMPANY_NOT_FOUND' || code === 'MEMBERSHIP_NOT_FOUND' || code === 'REQUEST_NOT_FOUND' || code === 'AZOLIK_TOPILMADI') return 404;
  if (code === 'AUTHORIZATION_DENIED' || code === 'SUPERADMIN_REQUIRED' || code === 'MANAGE_ROLE_REQUIRED' || /42501|direktor|a'zo|azo|membership|PERMISSION/i.test(code + raw)) return 403;
  if (['PROTECTED_AUTHORITY','MANAGEMENT_ROLE_REQUIRED','ACCOUNT_OWNER_REQUIRED'].includes(code)) return 403;
  if (code === 'OPERATION_ID_REQUIRED' || code === 'PAROL_QISQA' || code === 'RUXSAT_NOTOGRI' || /INVALID|REQUIRED/.test(code)) return 400;
  if (code === 'ALREADY_MEMBER' || code === 'LAST_DIRECTOR' || code === 'STALE_VERSION') return 409;
  if(code==='OPERATION_CONFLICT') return 409;
  if(code==='LAST_SUPERADMIN') return 409;
  // T2-COMPANY-CREATE-GATE-001: so'rov allaqachon ko'rib chiqilgan (qayta tasdiqlash/rad etish).
  if (code === 'REQUEST_NOT_PENDING') return 409;
  return 502;
}

async function actor(ctx: any): Promise<{ id: number } | Response> {
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  const id = (sess as any).foydalanuvchi_id;
  if (id == null) return Response.json({ ok: false, code: 'AUTH_REQUIRED', xato: 'Sessiyada foydalanuvchi yo‘q — qayta kiring' }, { status: 401 });
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, code: 'CONFIG' }, { status: 500 });
  return { id };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const a = await actor(ctx);
    if (a instanceof Response) return a;
    const url = new URL(ctx.request.url);

    // ── Direct URL guard: server-verified effective authorization ──
    if (url.searchParams.get('authorize') === '1') {
      const permission = url.searchParams.get('permission') || '';
      if (!AUTHZ_PERMISSIONS.has(permission)) {
        return Response.json({ ok: false, code: 'PERMISSION_UNKNOWN' }, { status: 400 });
      }
      const kompaniyaId = url.searchParams.get('kompaniya_id');
      const loyihaId = url.searchParams.get('loyiha_id');
      const obyektId = url.searchParams.get('obyekt_id');
      const { r, j, text } = await callRpc(ctx.env, 't2_effective_authorization_v1', {
        p_actor_id: a.id,
        p_kompaniya_id: kompaniyaId ? Number(kompaniyaId) : null,
        p_loyiha_id: loyihaId ? Number(loyihaId) : null,
        p_obyekt_id: obyektId ? Number(obyektId) : null,
        p_permission: permission,
        p_capability_kod: null,
      });
      if (!r.ok || !j) {
        console.error('[company authorize] t2_effective_authorization_v1', r.status, text.slice(0, 300));
        return Response.json({ ok: false, code: 'CONFIG' }, { status: 502 });
      }
      return Response.json(j);
    }

    // ── Kompaniya so'rovlari (T2-COMPANY-CREATE-GATE-001): superadmin —
    // hammasi; oddiy foydalanuvchi — faqat o'zinikilar (RPC ichida ajratiladi). ──
    if (url.searchParams.get('royxatlar') === '1') {
      const { r, j, text } = await callRpc(ctx.env, RPC.royxat_royxat, { p_actor_id: a.id });
      if (!r.ok || !j || j.ok !== true) {
        console.error('[company royxatlar] t2_kompaniya_royxat_royxat_v1', r.status, text.slice(0, 300));
        return Response.json({ ok: false, code: 'CONFIG' }, { status: 502 });
      }
      return Response.json(j);
    }

    // ── T2-RUXSAT-QOSHIMCHA-001: kompaniya a'zolari + ularning qo'shimcha
    // ruxsatlari ro'yxati ("Rollar va Ruxsatlar" tabining boshqaruvchi qismi). ──
    const ruxsatKompId = url.searchParams.get('azolik_ruxsatlari');
    if (ruxsatKompId) {
      const kompaniyaId = Number(ruxsatKompId);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, code: 'REQUEST_INVALID' }, { status: 400 });
      }
      const { r, j, text } = await callRpc(ctx.env, RPC.azolik_ruxsat_royxat, { p_actor_id: a.id, p_kompaniya_id: kompaniyaId });
      if (!r.ok || !j) {
        console.error('[company azolik_ruxsatlari]', r.status, text.slice(0, 300));
        return Response.json({ ok: false, code: 'CONFIG' }, { status: 502 });
      }
      if (j.ok !== true) return Response.json(j, { status: statusFor(j.code || '', text) });
      return Response.json(j);
    }

    // ── Company profile (Control Center "Profil" tab) — membership-checked read ──
    const profileId = url.searchParams.get('profile');
    if (profileId) {
      const kompaniyaId = Number(profileId);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, code: 'REQUEST_INVALID' }, { status: 400 });
      }
      const authRes = await callRpc(ctx.env, 't2_effective_authorization_v1', {
        p_actor_id: a.id, p_kompaniya_id: kompaniyaId, p_loyiha_id: null, p_obyekt_id: null,
        p_permission: 'company.read', p_capability_kod: null,
      });
      if (!authRes.r.ok || !authRes.j || authRes.j.allowed !== true) {
        return Response.json({ ok: false, code: 'AUTHORIZATION_DENIED', reason: authRes.j?.reason },
          { status: 403 });
      }
      const r2 = await fetch(
        supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/t2_kompaniya?id=eq.' + kompaniyaId +
          '&select=id,nom,kod,toliq_nom,inn,manzil,rahbar,telefon,bank,hisob_raqam,mfo,mavqe,versiya&limit=1',
        { headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY } });
      const rows = r2.ok ? await r2.json().catch(() => []) : [];
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return Response.json({ ok: false, code: 'COMPANY_NOT_FOUND' }, { status: 404 });
      return Response.json({ ok: true, profil: row });
    }

    const { r, j, text } = await callRpc(ctx.env, RPC.me, { p_actor_id: a.id });
    if (!r.ok || !j || j.ok !== true) {
      const domCode = j && typeof j === 'object' && 'code' in j ? String((j as any).code) : '';
      // Domen javobi (ACTOR_NOT_FOUND / AUTH_REQUIRED) — xavfsiz, frontendga o'tkazamiz.
      if (domCode === 'ACTOR_NOT_FOUND' || domCode === 'AUTH_REQUIRED') {
        return Response.json({ ok: false, code: domCode }, { status: statusFor(domCode, text) });
      }
      // HTTP / PGRST xatosi (kalit roli, funksiya ruxsati, URL) — SERVER CONFIG.
      console.error('[company me] t2_men_v1', r.status, text.slice(0, 300));
      return Response.json({ ok: false, code: 'CONFIG',
        xato: 'Kompaniya ma’lumoti serveri sozlamasida nosozlik. Administrator bilan bog‘laning.' },
        { status: 502 });
    }
    return Response.json(j);
  } catch (err: any) {
    return xavfsizXato('UPSTREAM', 500, err?.message || String(err));
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const a = await actor(ctx);
    if (a instanceof Response) return a;
    const b: any = await ctx.request.json().catch(() => ({}));
    const action: string = b?.action;
    if (!action || !(action in RPC) || action === 'me' || action === 'royxat_royxat' || action === 'azolik_ruxsat_royxat') {
      return Response.json({ ok: false, code: 'COMPANY_ACTION_INVALID' }, { status: 400 });
    }
    const opId: string = typeof b.operation_id === 'string' && b.operation_id ? b.operation_id : crypto.randomUUID();

    let body: Record<string, unknown>;
    if(action==='azolik_ruxsat_set') {
      if (!Number.isSafeInteger(b.expected_version) || b.expected_version<0 || !b.permissions || typeof b.permissions!=='object' || Array.isArray(b.permissions)) return Response.json({ok:false,code:'REQUEST_INVALID'},{status:400});
      body={p_actor_id:a.id,p_kompaniya_id:Number(b.kompaniya_id),p_azolik_id:Number(b.azolik_id),p_permissions:b.permissions,p_expected_version:b.expected_version,p_operation_id:opId};
    } else if (action === 'create' || action === 'royxat_soraw') {
      body = { p_actor_id: a.id, p_nom: String(b.nom ?? ''), p_inn: b.inn == null ? null : String(b.inn), p_telefon: b.telefon == null ? null : String(b.telefon), p_operation_id: opId };
    } else if (action === 'royxat_tasdiqla') {
      body = { p_actor_id: a.id, p_royxat_id: Number(b.royxat_id), p_operation_id: opId };
    } else if (action === 'royxat_rad_et') {
      body = { p_actor_id: a.id, p_royxat_id: Number(b.royxat_id), p_sabab: b.sabab == null ? null : String(b.sabab), p_operation_id: opId };
    } else if (action === 'member_add') {
      body = { p_actor_id: a.id, p_kompaniya_id: Number(b.kompaniya_id), p_login: String(b.login ?? ''), p_rol: String(b.rol ?? ''), p_email: b.email == null ? null : String(b.email), p_ism: b.ism == null ? null : String(b.ism), p_operation_id: opId };
    } else if (action === 'member_role') {
      body = { p_actor_id: a.id, p_azolik_id: Number(b.azolik_id), p_yangi_rol: String(b.rol ?? ''), p_operation_id: opId };
    } else if (action === 'azolik_ruxsat_ber' || action === 'azolik_ruxsat_olib_tashla') {
      body = { p_actor_id: a.id, p_kompaniya_id: Number(b.kompaniya_id), p_azolik_id: Number(b.azolik_id), p_ruxsat: String(b.ruxsat ?? ''), p_operation_id: opId };
    } else if (action === 'member_password_set') {
      body = { p_actor_id: a.id, p_kompaniya_id: Number(b.kompaniya_id), p_foydalanuvchi_id: Number(b.foydalanuvchi_id), p_yangi_parol: String(b.yangi_parol ?? ''), p_operation_id: opId };
    } else if (action === 'profile_update') {
      const s = (v: unknown) => (v == null || v === '' ? null : String(v));
      body = {
        p_actor_id: a.id, p_kompaniya_id: Number(b.kompaniya_id), p_expected_version: Number(b.expected_version),
        p_toliq_nom: s(b.toliq_nom), p_inn: s(b.inn), p_manzil: s(b.manzil), p_rahbar: s(b.rahbar),
        p_telefon: s(b.telefon), p_bank: s(b.bank), p_hisob_raqam: s(b.hisob_raqam), p_mfo: s(b.mfo),
        p_mavqe: s(b.mavqe), p_operation_id: opId,
      };
    } else { // member_remove
      body = { p_actor_id: a.id, p_azolik_id: Number(b.azolik_id), p_operation_id: opId };
    }

    const { r, j, text } = await callRpc(ctx.env, (RPC as any)[action], body);
    if (!r.ok || !j || j.ok !== true) {
      const code = (j && j.code) || 'COMPANY_COMMAND_FAILED';
      // Domen xato kodlari (LAST_DIRECTOR, ALREADY_MEMBER, ROLE_INVALID, ...) frontendga kerak — ular xavfsiz.
      const known = code && code !== 'COMPANY_COMMAND_FAILED';
      if (known) return Response.json({ ok: false, code, reason: j?.reason, versiya: j?.versiya, xato: j?.xato }, { status: statusFor(code, text) });
      return xavfsizXato('UPSTREAM', statusFor(code, text), text);
    }
    return Response.json({ ...j, operation_id: opId });
  } catch (err: any) {
    return xavfsizXato('UPSTREAM', 500, err?.message || String(err));
  }
};
