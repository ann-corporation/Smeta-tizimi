import { sbOqi } from './supabase';
import { qoralamaYigish, type KompHolat, type QoralamaAkt, type QoralamaQator, type QoralamaYigma } from '../lib/fakt-tiklash';

/**
 * «Fakt tiklash» manbalari — FAQAT O‘QISH (yozish `sbFaktYoz` / fakt_yoz_v2 yo‘lida).
 * Qoralama F2 aktlari (t2_akt tur='f2', holat='qoralama') va ularning qatorlari. Bekor qilingan aktlar kirmaydi.
 */
export type QoralamaManba = { ok: boolean; error?: string; aktlar: QoralamaAkt[]; yigma: Map<number, QoralamaYigma>; raqam: Map<number, string | null> };

async function aktQatorlari(ids: readonly number[]): Promise<{ ok: boolean; qatorlar: QoralamaQator[]; error?: string }> {
  const out: QoralamaQator[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const q = await sbOqi<QoralamaQator>({ jadval: 't2_akt_qator', filtr: `akt_id=in.(${ids.slice(i, i + 100).join(',')})`, ustunlar: 'akt_id,qator_id,hajm,certified_quantity', limit: 100000 });
    if (!q.ok) return { ok: false, qatorlar: [], error: q.error };
    out.push(...(q.qatorlar || []));
  }
  return { ok: true, qatorlar: out };
}

export async function sbTiklashQoralama(obyektId: number): Promise<QoralamaManba> {
  const bosh: QoralamaManba = { ok: false, aktlar: [], yigma: new Map(), raqam: new Map() };
  const a = await sbOqi<QoralamaAkt>({ jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.f2&holat=eq.qoralama`, ustunlar: 'id,raqam,oy', limit: 5000 });
  if (!a.ok) return { ...bosh, error: a.error };
  const aktlar = (a.qatorlar || []).map((x) => ({ ...x, id: Number(x.id) })).filter((x) => Number.isSafeInteger(x.id) && x.id > 0);
  if (!aktlar.length) return { ok: true, aktlar: [], yigma: new Map(), raqam: new Map() };
  const q = await aktQatorlari(aktlar.map((x) => x.id));
  if (!q.ok) return { ...bosh, error: q.error };
  return { ok: true, aktlar, yigma: qoralamaYigish(q.qatorlar), raqam: new Map(aktlar.map((x) => [x.id, x.raqam] as const)) };
}

export type KompObyektManba = { id: number; holat: KompHolat[]; yigma: Map<number, QoralamaYigma> };

/** Bitta obyekt: holat (t2_qator_holat, kerakli ustunlar) + qoralama F2 — kompaniya xulosasi uchun. */
export async function sbTiklashObyektManba(obyektId: number): Promise<{ ok: boolean; error?: string; manba?: KompObyektManba }> {
  const [h, q] = await Promise.all([
    sbOqi<KompHolat>({
      jadval: 't2_qator_holat', filtr: `obyekt_id=eq.${obyektId}`,
      ustunlar: 'qator_id,tur,kat,fakt_hajm,fakt_summa,f2_hajm,f2_summa,f2_summa_yoq,smeta_narx', limit: 100000,
    }),
    sbTiklashQoralama(obyektId),
  ]);
  if (!h.ok) return { ok: false, error: h.error };
  if (!q.ok) return { ok: false, error: q.error };
  return { ok: true, manba: { id: obyektId, holat: h.qatorlar || [], yigma: q.yigma } };
}

export type YuklashFn = (obyektId: number) => ReturnType<typeof sbTiklashObyektManba>;
