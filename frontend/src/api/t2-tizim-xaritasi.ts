/**
 * «Tizim xaritasi» API (egasi 2026-10-27). FAQAT platforma superadmini va u ruxsat bergan odamlar ko'radi — ruxsat BAZADA
 * (`t2_tizim_xaritasi_ruxsat` + `t2_platforma_superadmin`), actor har doim sessiyadan (/api/sb `tizim_actor`).
 *   o'qish:   /api/sb soro=tizim_xaritasi_v1 (stable)            — graf + oxirgi hodisalar;
 *   tekshir:  /api/sb soro=tizim_xaritasi_ruxsat_tekshir_v1        — menyu/sahifa uchun {ruxsat, superadmin};
 *   ruxsatlar: /api/boshqaruv (faqat superadmin) bolim=tizim_ruxsat, amal=tizim_ruxsat_ber / tizim_ruxsat_ol.
 * Hech qanday pul summasi kelmaydi — faqat sonlar, vaqtlar, matnlar.
 */
import { useQuery } from '@tanstack/react-query';
import { boshqaruvOqi, type BFoydalanuvchi } from './t2-boshqaruv';

export type TizimHolat = 'ok' | 'diqqat' | 'xato';
export type TizimModulKod = 'smeta' | 'fakt' | 'f2' | 'nakopitelniy' | 'sverka' | 'ombor' | 'agentlar';
export type TizimTugunTur = 'tizim' | 'kompaniya' | 'modul' | 'integratsiya' | 'deploy' | 'ishlar';

export type TizimOxirgiAmal = { vaqt: string; kim: string | null; kim_nom?: string | null; amal: string | null; matn: string | null; obyekt_id: number | null };
export type TizimXato = { vaqt: string; matn: string; manba: string; daraja: string };
export type TizimFaolObyekt = { id: number; nom: string; soni_7k: number; oxirgi: string; ochiq_signal: number };

export type TizimMeta = {
  holat?: TizimHolat | string | null;
  kompaniya_id?: number;
  modul?: TizimModulKod;
  /* tizim / kompaniya */
  kompaniya_jami?: number; kompaniya_soni?: number;
  obyekt_soni?: number; oxirgi_faollik?: string | null; sinxron_navbat?: number;
  faol_obyektlar?: TizimFaolObyekt[];
  /* umumiy sonlar */
  ochiq_signal?: number; kritik_signal?: number; xato_24s?: number;
  /** `null` — bu modulda navbat manbai yo'q (0 emas). */
  navbat?: number | null; navbat_qotgan?: number; navbat_eng_eski?: string | null;
  /* modul */
  soni_24s?: number; soni_7k?: number; oxirgi_amal?: TizimOxirgiAmal | null; xatolar?: TizimXato[];
  /* platforma tugunlari */
  qatorlar?: Record<string, unknown>[];
  [k: string]: unknown;
};

export type TizimTugun = { id: string; tur: TizimTugunTur; nom: string; meta: TizimMeta | null };
export type TizimBogich = { manba: string; maqsad: string; tur: 'tizim_kompaniya' | 'kompaniya_modul' | 'tizim_platforma' | string };
export type TizimHodisa = {
  vaqt: string; kompaniya_id: number | null; kompaniya_nom?: string | null; modul: TizimModulKod | null; matn: string;
  daraja: string; manba: string; obyekt_id: number | null; kim?: string | null; kim_nom?: string | null;
};
export type TizimKorinish = {
  doira: 'tizim' | 'kompaniya'; superadmin: boolean; kompaniya_id: number | null;
  kompaniya_jami: number; kompaniya_soni: number; oyna_soat: number; oyna_kun: number;
};
export type TizimGraf = {
  ok: true; versiya: number; vaqt: string;
  tugunlar: TizimTugun[]; bogichlar: TizimBogich[];
  oxirgi_hodisalar: TizimHodisa[];
  /** Manbasida qator yo'q (to'qilmaydi): 'integratsiya' | 'deploy' | 'ishlar'. */
  malumot_yoq: string[];
  korinish: TizimKorinish;
};

export type TizimNatija<T> = { ok: true; natija: T } | { ok: false; code?: string; error: string };

async function sbOqi<T>(body: Record<string, unknown>): Promise<TizimNatija<T>> {
  try {
    const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json() as { ok: boolean; natija?: (T & { ok?: boolean; code?: string }) | null; error?: string; code?: string };
    if (!j.ok || !j.natija) return { ok: false, code: j.code, error: j.error || j.code || 'So‘rov bajarilmadi' };
    if (j.natija.ok === false) return { ok: false, code: j.natija.code, error: j.natija.code || 'Rad etildi' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

/** Tizim xaritasi grafi. `kompaniyaId` — ixtiyoriy filtr (ruxsat bazada). */
export function tizimXaritasiOl(p: { kompaniyaId?: number | null } = {}): Promise<TizimNatija<TizimGraf>> {
  return sbOqi<TizimGraf>({ soro: 'tizim_xaritasi_v1', ...(p.kompaniyaId ? { kompaniya_id: p.kompaniyaId } : {}) });
}

export type TizimRuxsatHolati = { ruxsat: boolean; superadmin: boolean };

/** Yengil tekshiruv: joriy foydalanuvchi tizim xaritasini ko'ra oladimi. Xato — `ruxsat: false` (yopiq bo'lib qoladi). */
export async function tizimRuxsatTekshir(): Promise<TizimRuxsatHolati> {
  const r = await sbOqi<{ ok: true; ruxsat: boolean; superadmin: boolean }>({ soro: 'tizim_xaritasi_ruxsat_tekshir_v1' });
  return r.ok ? { ruxsat: r.natija.ruxsat === true, superadmin: r.natija.superadmin === true } : { ruxsat: false, superadmin: false };
}

/** Menyu va sahifa uchun (5 daqiqa kesh). `enabled=false` — so'rov yuborilmaydi. */
export function useTizimRuxsat(enabled = true) {
  return useQuery({ queryKey: ['tizim-xaritasi-ruxsat'], queryFn: tizimRuxsatTekshir, enabled, staleTime: 5 * 60_000, retry: 1 });
}

/* ───────── Ruxsatlarni boshqarish (faqat superadmin, /api/boshqaruv) ───────── */

export type TizimRuxsatQator = {
  foydalanuvchi_id: number; login: string; ism: string | null; holat: string;
  berilgan_by: number | null; berilgan_by_nom: string | null; berildi: string; izoh: string | null;
};

export async function tizimRuxsatRoyxat(): Promise<TizimNatija<TizimRuxsatQator[]>> {
  const r = await boshqaruvOqi<{ ok: boolean; qatorlar?: TizimRuxsatQator[] }>('tizim_ruxsat');
  if (!r.ok) return { ok: false, code: r.code, error: r.error };
  return { ok: true, natija: Array.isArray(r.natija?.qatorlar) ? r.natija.qatorlar : [] };
}

export async function tizimFoydalanuvchiQidir(qidiruv: string): Promise<TizimNatija<BFoydalanuvchi[]>> {
  const r = await boshqaruvOqi<BFoydalanuvchi[]>('foydalanuvchilar', { qidiruv: qidiruv.slice(0, 100) });
  return r.ok ? { ok: true, natija: Array.isArray(r.natija) ? r.natija.slice(0, 20) : [] } : { ok: false, code: r.code, error: r.error };
}

async function ruxsatYoz(amal: 'tizim_ruxsat_ber' | 'tizim_ruxsat_ol', foydalanuvchiId: number, izoh: string | null): Promise<TizimNatija<{ ozgarmadi: boolean }>> {
  try {
    const r = await fetch('/api/boshqaruv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amal, foydalanuvchi_id: foydalanuvchiId, izoh: izoh || null, operation_id: crypto.randomUUID() }),
    });
    const j = await r.json() as { ok: boolean; natija?: { ok?: boolean; code?: string; ozgarmadi?: boolean }; error?: string; code?: string };
    if (!j.ok || j.natija?.ok === false) return { ok: false, code: j.code || j.natija?.code, error: j.error || j.code || j.natija?.code || 'Bajarilmadi' };
    return { ok: true, natija: { ozgarmadi: j.natija?.ozgarmadi === true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export const tizimRuxsatBer = (foydalanuvchiId: number, izoh: string | null) => ruxsatYoz('tizim_ruxsat_ber', foydalanuvchiId, izoh);
export const tizimRuxsatOl = (foydalanuvchiId: number, izoh: string | null) => ruxsatYoz('tizim_ruxsat_ol', foydalanuvchiId, izoh);
