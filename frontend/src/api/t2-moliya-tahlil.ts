import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, type AktNatija } from './supabase';
import { ogirYuklashKut } from './ogir-sorov-navbat';
import type { MoliyaTahlilJavob } from '../lib/moliya-tahlil';

/** Moliyaviy tahlil (egasi 2026-10-27). O'qish: /api/sb `moliya_tahlil_v1` (stable, a'zolik + financial.read). */
export async function moliyaTahlilOl(p: { kompaniyaId: number; obyektId?: number | null }): Promise<{ ok: true; natija: MoliyaTahlilJavob } | { ok: false; error: string }> {
  try {
    await ogirYuklashKut();
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'moliya_tahlil_v1', kompaniya_id: p.kompaniyaId, ...(p.obyektId ? { obyekt_id: p.obyektId } : {}) }),
    });
    const j = await r.json() as { ok: boolean; natija?: MoliyaTahlilJavob | { ok: false; code?: string }; error?: string };
    if (!j.ok || !j.natija || j.natija.ok !== true) return { ok: false, error: j.error || 'Moliyaviy tahlilni o‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

/** Qo'lda qiymat (so'm, QQS bilan) kiritish/almashtirish; qiymat null → bekor. Ruxsat: financial.write. Idempotent operation_id. */
export function moliyaQoldaYoz(p: { kompaniyaId: number; obyektId?: number | null; kod: string; qiymat: number | null; izoh?: string; operationId: string }): Promise<AktNatija> {
  return yozAmali({
    amal: 'moliya_qolda_yoz_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId ?? null, kod: p.kod,
    qiymat: p.qiymat, sana: new Date().toISOString().slice(0, 10), izoh: p.izoh || null, operation_id: p.operationId,
  }) as Promise<AktNatija>;
}
