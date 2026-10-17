/**
 * t2-men.ts — canonical current-user + memberships client (COMPANY/AUTH/DIRECTOR).
 * Reads /api/company?me=1 -> Supabase t2_men_v1. Commands -> /api/company (POST).
 * NO /api/gas, NO Drive/Sheets. Actor identity is server-side (session).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Azolik = {
  azolik_id: number; kompaniya_id: number; nom: string; kod: string;
  rol: string; is_director: boolean; holat: string; faol: boolean;
};
export type Men = {
  platform_role?: 'superadmin' | 'none';
  context_kompaniyalar?: { kompaniya_id: number; nom: string; kod: string; faol: boolean; membership_role: string | null; effective_role: string; is_director: boolean; permissions?:string[] }[];
  ok: true;
  foydalanuvchi: { id: number; login: string; ism: string | null; email: string | null; holat: string };
  azoliklar: Azolik[];
  jami: number;
  onboarding_kerak: boolean;
};

export type MenError = Error & { code?: string };
function toErr(j: any, status: number): MenError {
  const e = new Error((j && (j.xato || j.code)) || ('HTTP ' + status)) as MenError;
  e.code = (j && j.code) || ('HTTP_' + status);
  return e;
}

export async function menOl(): Promise<Men> {
  const r = await fetch('/api/company?me=1');
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw toErr(j, r.status);
  return j as Men;
}

export function useMen() {
  return useQuery({
    queryKey: ['men'],
    queryFn: menOl,
    staleTime: 60 * 1000,
    retry: (n, e: any) => e?.code !== 'AUTH_REQUIRED' && n < 2,
  });
}

async function post(action: string, payload: Record<string, unknown>) {
  const r = await fetch('/api/company', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw toErr(j, r.status);
  return j;
}

/** Bitta kompaniya a'zolari (list) — kanonik o'qish (t2_azolik_royxat, a'zolik-tekshirilgan). */
export type KompaniyaAzo = {
  azolik_id: number; kompaniya_id: number; rol: string; holat: string;
  foydalanuvchi_id: number; login: string; email: string | null; ism: string | null;
};
export async function kompaniyaAzolariOl(kompaniyaId: number): Promise<KompaniyaAzo[]> {
  const r = await fetch('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jadval: 't2_azolik_royxat', filtr: 'kompaniya_id=eq.' + kompaniyaId, tartib: 'login.asc', limit: 500 }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw toErr(j, r.status);
  return (j.qatorlar as KompaniyaAzo[]) || [];
}
export function useKompaniyaAzolari(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: ['kompaniyaAzolari', kompaniyaId],
    queryFn: () => kompaniyaAzolariOl(kompaniyaId as number),
    enabled: !!kompaniyaId,
    staleTime: 30_000,
  });
}

/** Company profile row (Control Center "Profil" tab) — membership-checked
 * read via /api/company?profile=<id>, canonical write via
 * t2_kompaniya_yangila_v1 (optimistic lock on `versiya`). */
export type KompaniyaProfil = {
  id: number; nom: string; kod: string; toliq_nom: string | null; inn: string | null;
  manzil: string | null; rahbar: string | null; telefon: string | null; bank: string | null;
  hisob_raqam: string | null; mfo: string | null; mavqe: string | null; versiya: number;
};
export async function kompaniyaProfilOl(kompaniyaId: number): Promise<KompaniyaProfil> {
  const r = await fetch('/api/company?profile=' + kompaniyaId);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw toErr(j, r.status);
  return j.profil as KompaniyaProfil;
}
export function useKompaniyaProfil(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: ['kompaniyaProfil', kompaniyaId],
    queryFn: () => kompaniyaProfilOl(kompaniyaId as number),
    enabled: !!kompaniyaId,
    staleTime: 15_000,
  });
}
export type ProfilYangilaInput = {
  kompaniya_id: number; expected_version: number;
  toliq_nom?: string; inn?: string; manzil?: string; rahbar?: string; telefon?: string;
  bank?: string; hisob_raqam?: string; mfo?: string; mavqe?: string; operation_id?: string;
};
export const kompaniyaProfilYangila = (i: ProfilYangilaInput) => post('profile_update', i);
export function useProfilYangila(kompaniyaId: number | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kompaniyaProfilYangila,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kompaniyaProfil', kompaniyaId] });
      qc.invalidateQueries({ queryKey: ['men'] });
    },
  });
}

/**
 * T2-COMPANY-CREATE-GATE-001 (haqiqiy hodisa): a'zoligi yo'q HAR QANDAY
 * foydalanuvchi (masalan a'zoligi bekor qilingan "prorab") o'zi uchun
 * kompaniya ochib, uning direktori bo'lib olardi — server hech qanday
 * rol tekshiruvi qilmasdi. Endi to'g'ridan-to'g'ri yaratish (`create`)
 * FAQAT platforma superadmini uchun; oddiy foydalanuvchi SO'ROV yuboradi
 * (`royxat_soraw`) va superadmin uni ko'rib chiqib tasdiqlaydi/rad etadi.
 */
export type KompaniyaRoyxat = {
  id: number; actor_id: number; login: string; nom: string; inn: string | null;
  telefon: string | null; holat: 'kutilmoqda' | 'tasdiqlandi' | 'rad_etildi';
  kompaniya_id: number | null; sabab: string | null; created_at: string; decided_at: string | null;
};
export async function kompaniyaRoyxatlarOl(): Promise<{ superadmin: boolean; royxatlar: KompaniyaRoyxat[] }> {
  const r = await fetch('/api/company?royxatlar=1');
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw toErr(j, r.status);
  return { superadmin: !!j.superadmin, royxatlar: (j.royxatlar as KompaniyaRoyxat[]) || [] };
}
export function useKompaniyaRoyxatlar() {
  return useQuery({
    queryKey: ['kompaniyaRoyxatlar'],
    queryFn: kompaniyaRoyxatlarOl,
    staleTime: 15_000,
  });
}

export type KompaniyaYaratInput = { nom: string; inn?: string; telefon?: string; operation_id?: string };
export type RoyxatSorawInput = { nom: string; inn?: string; telefon?: string; operation_id?: string };
export type RoyxatTasdiqlaInput = { royxat_id: number; operation_id?: string };
export type RoyxatRadEtInput = { royxat_id: number; sabab?: string; operation_id?: string };
export type MemberAddInput = { kompaniya_id: number; login: string; rol: string; email?: string; ism?: string; operation_id?: string };
export type MemberRoleInput = { azolik_id: number; rol: string; operation_id?: string };
export type MemberRemoveInput = { azolik_id: number; operation_id?: string };
/** T2-AUTH-PASSWORD-MIGRATION-001: director bcrypt parol o'rnatadi/qayta
 *  belgilaydi. `member_add`ning o'zi parolga tegmaydi (o'sha RPC login+rolni
 *  yozadi, xolos) -- yangi a'zo bu chaqiruvsiz TIZIMGA KIRA OLMAYDI, chunki
 *  GAS'ning eski _XODIMLAR varag'ida ham yo'q. */
export type MemberPasswordSetInput = { kompaniya_id: number; foydalanuvchi_id: number; yangi_parol: string; operation_id?: string };

/**
 * T2-RUXSAT-QOSHIMCHA-001: a'zoning rolini o'zgartirmasdan, unga
 * qo'shimcha (rolining qattiq to'plamidan tashqari) ruxsat berish/olib
 * tashlash. ⚠️ Bu FAQAT `t2_effective_authorization_v1` orqali o'tadigan
 * tekshiruvlarga (hozircha ko'pchilik yozish RPC'lari emas) ta'sir
 * qiladi — UI shuni ochiq ko'rsatishi kerak.
 */
export type QoshimchaRuxsat = Exclude<import('../lib/company-authorization/effective-authorization').PermissionCode,'control.global.read'|'control.global.write'>;
export const QOSHIMCHA_RUXSATLAR: QoshimchaRuxsat[] = [
  'company.read', 'company.profile.update', 'company.member.manage',
  'control.company.read', 'control.company.write',
  'project.read', 'project.write', 'object.read', 'object.write',
  'document.read', 'document.write', 'financial.read', 'financial.write',
];
export type AzolikRuxsat = {
  ruxsat_versiya?:number; protected?:boolean; base_permissions?:QoshimchaRuxsat[]; effective_permissions?:QoshimchaRuxsat[];
  azolik_id: number; foydalanuvchi_id: number; login: string; ism: string | null;
  rol: string; qoshimcha_ruxsatlar: QoshimchaRuxsat[];
};
export type AzolikRuxsatBerInput = { kompaniya_id: number; azolik_id: number; ruxsat: QoshimchaRuxsat; operation_id?: string };
export type AzolikRuxsatSetInput = { kompaniya_id:number; azolik_id:number; permissions:Record<string,boolean>; expected_version:number; operation_id?:string };

export async function azolikRuxsatlariOl(kompaniyaId: number): Promise<{ azolar: AzolikRuxsat[] }> {
  const r = await fetch('/api/company?azolik_ruxsatlari=' + Number(kompaniyaId));
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw toErr(j, r.status);
  return { azolar: (j.azolar as AzolikRuxsat[]) || [] };
}
export function useAzolikRuxsatlari(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: ['azolikRuxsatlari', kompaniyaId],
    queryFn: () => azolikRuxsatlariOl(kompaniyaId as number),
    enabled: !!kompaniyaId,
    staleTime: 15_000,
  });
}

/** Faqat superadmin uchun — server rolni qayta tekshiradi. */
export const kompaniyaYarat = (i: KompaniyaYaratInput) => post('create', i);
export const kompaniyaRoyxatSoraw = (i: RoyxatSorawInput) => post('royxat_soraw', i);
export const kompaniyaRoyxatTasdiqla = (i: RoyxatTasdiqlaInput) => post('royxat_tasdiqla', i);
export const kompaniyaRoyxatRadEt = (i: RoyxatRadEtInput) => post('royxat_rad_et', i);
export const azoQosh = (i: MemberAddInput) => post('member_add', i);
export const azoRol = (i: MemberRoleInput) => post('member_role', i);
export const azoOchir = (i: MemberRemoveInput) => post('member_remove', i);
export const azoParolBelgila = (i: MemberPasswordSetInput) => post('member_password_set', i);
export const azolikRuxsatBer = (i: AzolikRuxsatBerInput) => post('azolik_ruxsat_ber', i);
export const azolikRuxsatOlibTashla = (i: AzolikRuxsatBerInput) => post('azolik_ruxsat_olib_tashla', i);
export const azolikRuxsatSet = (i: AzolikRuxsatSetInput) => post('azolik_ruxsat_set',i);

export function useOnboardingCommands() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ['men'] });
    qc.invalidateQueries({ queryKey: ['authz'] });
    qc.invalidateQueries({ queryKey: ['azolikRuxsatlari'] });
    qc.invalidateQueries({ queryKey: ['kompaniyaAzolari'] });
  };
  const royxatDone = () => {
    done();
    qc.invalidateQueries({ queryKey: ['kompaniyaRoyxatlar'] });
  };
  return {
    azolikRuxsatSet:useMutation({mutationFn:azolikRuxsatSet,onSuccess:done}),
    yarat: useMutation({ mutationFn: kompaniyaYarat, onSuccess: done }),
    royxatSoraw: useMutation({ mutationFn: kompaniyaRoyxatSoraw, onSuccess: () => qc.invalidateQueries({ queryKey: ['kompaniyaRoyxatlar'] }) }),
    royxatTasdiqla: useMutation({ mutationFn: kompaniyaRoyxatTasdiqla, onSuccess: royxatDone }),
    royxatRadEt: useMutation({ mutationFn: kompaniyaRoyxatRadEt, onSuccess: () => qc.invalidateQueries({ queryKey: ['kompaniyaRoyxatlar'] }) }),
    azoQosh: useMutation({ mutationFn: azoQosh, onSuccess: done }),
    azoRol: useMutation({ mutationFn: azoRol, onSuccess: done }),
    azoOchir: useMutation({ mutationFn: azoOchir, onSuccess: done }),
    /* Parol ro'yxat/holatga ta'sir qilmaydi -- invalidatsiya shart emas. */
    azoParolBelgila: useMutation({ mutationFn: azoParolBelgila }),
    azolikRuxsatBer: useMutation({
      mutationFn: azolikRuxsatBer,
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['azolikRuxsatlari'] }); qc.invalidateQueries({ queryKey: ['authz'] }); },
    }),
    azolikRuxsatOlibTashla: useMutation({
      mutationFn: azolikRuxsatOlibTashla,
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['azolikRuxsatlari'] }); qc.invalidateQueries({ queryKey: ['authz'] }); },
    }),
  };
}
