import { vaqtliOqish } from './vaqtli-fetch';
/**
 * t2-price-control.ts — T2-REAL-PARK-LRV-VERTICAL-SLICE-004.
 * Reads /api/sb {soro:'price_control_v1'|'f2_exact_qatorlar_v1'} ->
 * Supabase t2_price_control_v1 / t2_f2_exact_qatorlar_v1 (actor always
 * from the verified session server-side, never client-supplied).
 * NOT procurement saving -- see the migration/contract docs for the law.
 */

export type PriceState =
  | 'NORMAL' | 'BELOW_REFERENCE' | 'ABOVE_REFERENCE_JUSTIFIED'
  | 'ABOVE_REFERENCE_MISSING_BASIS' | 'ABOVE_APPROVED_BASIS';

export type PriceControlLine = {
  qator_id: number; kod: string | null; nom: string; birlik: string | null;
  reference_unit_price: number | null;
  certified_unit_price: number | null;
  price_delta: number | null;
  frozen_amount: number;
  at_risk_amount: number;
  basis_approved_price: number | null;
  price_state: PriceState;
};

async function soroOqi<T>(body: Record<string, unknown>): Promise<{ ok: boolean; natija?: T; error?: string }> {
  const r = await vaqtliOqish('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function priceControlOl(obyektId: number): Promise<{ ok: boolean; qatorlar: PriceControlLine[]; error?: string }> {
  const r = await soroOqi<{ ok: boolean; qatorlar: PriceControlLine[] }>({ soro: 'price_control_v1', obyekt_id: obyektId });
  if (!r.ok || !r.natija || r.natija.ok !== true) return { ok: false, qatorlar: [], error: r.error || 'Narx nazorati o\'qilmadi' };
  return { ok: true, qatorlar: r.natija.qatorlar || [] };
}

export type F2ExactLine = {
  akt_qator_id: number; qator_id: number;
  certified_quantity: number | null; certified_unit_price: number | null; certified_amount: number | null;
  provenance: string;
};

export async function f2ExactQatorlarOl(aktId: number): Promise<{ ok: boolean; qatorlar: F2ExactLine[]; error?: string }> {
  const r = await soroOqi<{ ok: boolean; qatorlar: F2ExactLine[] }>({ soro: 'f2_exact_qatorlar_v1', akt_id: aktId });
  if (!r.ok || !r.natija || r.natija.ok !== true) return { ok: false, qatorlar: [], error: r.error || 'F2 aniq ma\'lumot o\'qilmadi' };
  return { ok: true, qatorlar: r.natija.qatorlar || [] };
}

export const PRICE_STATE_BADGE: Record<PriceState, { emoji: string; label: string; className: string }> = {
  NORMAL: { emoji: '🟢', label: 'Normal', className: 'text-emerald-400' },
  BELOW_REFERENCE: { emoji: '🟠', label: 'Past narx / muzlagan', className: 'text-amber-400' },
  ABOVE_REFERENCE_JUSTIFIED: { emoji: '📄', label: 'Basis bor — asoslangan', className: 'text-sky-400' },
  ABOVE_REFERENCE_MISSING_BASIS: { emoji: '🔴', label: 'Yuqori narx / basis talab', className: 'text-rose-400' },
  ABOVE_APPROVED_BASIS: { emoji: '🔴', label: 'Tasdiqlangan basisdan yuqori', className: 'text-rose-400' },
};
