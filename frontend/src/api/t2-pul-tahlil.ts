import type { PulKesim } from '../lib/pul-tahlil';

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
  jami: { smeta_ustamasiz: number | null; smeta_nomalum: number; f2_yopilgan: number | null; f2_nomalum: number; xarajat: number | null; farq: number | null; farq_foiz: number | null };
  zanjir: { obyektlar: PulZanjirObyekt[]; jami: Record<string, number>; koeffitsientlar: Record<string, number> | null; manba: string };
  dalil_kat: string | null; dalil: PulDalilQator[] | null;
};
export type PulTahlilSoro = { kompaniyaId: number; obyektId?: number | null; shartnomaId?: number | null; davrGacha?: string | null; davrDan?: string | null; dalilKat?: string | null };

export async function pulTahlilOl(p: PulTahlilSoro): Promise<{ ok: true; natija: PulTahlilJavob } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        soro: 'pul_tahlil_v1', kompaniya_id: p.kompaniyaId,
        ...(p.obyektId ? { obyekt_id: p.obyektId } : {}), ...(p.shartnomaId ? { shartnoma_id: p.shartnomaId } : {}),
        ...(p.davrGacha ? { davr_gacha: p.davrGacha } : {}), ...(p.davrDan ? { davr_dan: p.davrDan } : {}),
        ...(p.dalilKat ? { dalil_kat: p.dalilKat } : {}),
      }),
    });
    const j = await r.json() as { ok: boolean; natija?: PulTahlilJavob | { ok: false; code?: string }; error?: string };
    if (!j.ok || !j.natija || j.natija.ok !== true) return { ok: false, error: j.error || 'Pul tahlilini o‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}
