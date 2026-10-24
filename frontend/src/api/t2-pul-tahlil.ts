import { yozAmali, type AktNatija } from './supabase';
import type { PulKesim, PulUstamali } from '../lib/pul-tahlil';

/** Rahbarlar uchun pul tahlili (egasi 2026-10-24). O'qish: /api/sb `pul_tahlil_v1` (stable, a'zolik + f2.read + financial.read). */
export type PulDalilQator = {
  qator_id: number; obyekt_id: number; kod: string | null; nom: string | null; tur: string | null; kat: string | null;
  smeta_summa: number | null; f2_summa: number | null; aktlar: Array<{ akt_id: number; raqam: string | null; oy: string }> | null;
};
export type PulZanjirObyekt = { obyekt_id: number; shartnoma_id: number | null; cats: Record<string, number>; nakrutka: Record<string, number> };
export type PulTahlilJavob = {
  ok: true;
  qamrov: { obyekt_id: number | null; shartnoma_id: number | null; obyektlar: number[]; davr_dan: string | null; davr_gacha: string | null };
  kesimlar: PulKesim[];
  jami: { xarajat_toliq?: boolean; xarajat_qator_soni?: number; xarajat_sub_otk?: number | null; smeta_ustamasiz: number | null; smeta_nomalum: number; f2_yopilgan: number | null; f2_nomalum: number; xarajat: number | null; farq: number | null; farq_foiz: number | null; smeta_ustamali?: PulUstamali | null; f2_ustamali?: PulUstamali | null };
  zanjir: { obyektlar: PulZanjirObyekt[]; jami: Record<string, number>; koeffitsientlar: Record<string, number> | null; f2_obyektlar?: PulZanjirObyekt[]; f2_jami?: Record<string, number>; manba: string };
  dalil_kat: string | null; dalil: Array<PulDalilQator | PulXarajatQator> | null; dalil_turi?: 'xarajat';
};
export type PulXarajatQator = {
  id: number; sana: string; kat: string | null; summa: number; obyekt_id: number | null; shartnoma_id: number | null;
  manba: string | null; hujjat_ref: string | null; izoh: string | null; kim: string | null; versiya: number;
};
export type PulTahlilSoro = { dalilTuri?: 'xarajat' | null; kompaniyaId: number; obyektId?: number | null; shartnomaId?: number | null; davrGacha?: string | null; davrDan?: string | null; dalilKat?: string | null };

export async function pulTahlilOl(p: PulTahlilSoro): Promise<{ ok: true; natija: PulTahlilJavob } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        soro: 'pul_tahlil_v2', kompaniya_id: p.kompaniyaId,
        ...(p.obyektId ? { obyekt_id: p.obyektId } : {}), ...(p.shartnomaId ? { shartnoma_id: p.shartnomaId } : {}),
        ...(p.davrGacha ? { davr_gacha: p.davrGacha } : {}), ...(p.davrDan ? { davr_dan: p.davrDan } : {}),
        ...(p.dalilKat ? { dalil_kat: p.dalilKat } : {}), ...(p.dalilTuri ? { dalil_turi: p.dalilTuri } : {}),
      }),
    });
    const j = await r.json() as { ok: boolean; natija?: PulTahlilJavob | { ok: false; code?: string }; error?: string };
    if (!j.ok || !j.natija || j.natija.ok !== true) return { ok: false, error: j.error || 'Pul tahlilini o‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

/** Qo'lda xarajat kiritish (idempotent operation_id). Ruxsat: financial.write. */
export function pulXarajatKirit(p: {
  kompaniyaId: number; obyektId?: number | null; shartnomaId?: number | null; sana: string; kat: string; summa: string;
  hujjatRef?: string; izoh?: string; operationId: string;
}): Promise<AktNatija> {
  return yozAmali({
    amal: 'xarajat_kirit_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId ?? null, shartnoma_id: p.shartnomaId ?? null,
    sana: p.sana, kat: p.kat, summa: Number(p.summa), hujjat_ref: p.hujjatRef || null, izoh: p.izoh || null, operation_id: p.operationId,
  }) as Promise<AktNatija>;
}

export function pulXarajatBekor(p: { kompaniyaId: number; id: number; versiya?: number | null }): Promise<AktNatija> {
  return yozAmali({ amal: 'xarajat_bekor_v1', kompaniya_id: p.kompaniyaId, id: p.id, versiya: p.versiya ?? null }) as Promise<AktNatija>;
}