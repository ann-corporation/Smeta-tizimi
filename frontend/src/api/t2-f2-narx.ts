import { sbOqi } from './supabase';
import { f2NarxYigish, type EskiF2Akt, type F2AktQator, type F2Narx } from '../lib/fakt-f2-tenglash';

type FaktAkt = { id: number; raqam: string | null; sana: string | null; izoh: string | null; hujjat_jami: number | null };
type FaktAktQator = { akt_id: number; qator_id: number; hajm: number | null; narx_manba: string | null; manba_akt_qator_id?: number | null };

export type F2TenglashManba = {
  ok: boolean; error?: string;
  /** Qator → tasdiqlangan F2 narxi. */
  narxlar: Map<number, F2Narx>;
  /** Qator → o'z (DIRECT) fakti: bekor qilinmagan fakt hujjatlari hajmi yig'indisi. */
  directFakt: Map<number, number>;
  /** Oldin (1:1 nusxasiz — smeta narxida yoki yig'ma farq bilan) yozilgan «Fakt = F2» hujjatlari. */
  eskiAktlar: EskiF2Akt[];
  /** Qator → tasdiqlangan F2 satrlari (1:1 nusxa uchun). */
  f2Satrlar: Map<number, F2AktQator[]>;
  /** Faol fakt hujjatlariga ko'chirilgan F2 satrlari. */
  nusxalangan: Set<number>;
  /** Qator → qo'lda (f2_sertifikat bo'lmagan) fakt; qator → manbasiz f2_sertifikat (yig'ma) fakt. */
  qolda: Map<number, number>; f2Delta: Map<number, number>;
};

/**
 * Sof: fakt hujjatlari va qatorlaridan o'z fakti (jami / qo'lda / yig'ma f2_sertifikat), ko'chirilgan F2 satrlari va eski
 * «Fakt = F2» hujjatlari (birorta qatori 1:1 nusxa — manba_akt_qator_id — emas).
 */
export function faktManbaYigish(aktlar: readonly FaktAkt[], qatorlar: readonly FaktAktQator[]):
  { directFakt: Map<number, number>; qolda: Map<number, number>; f2Delta: Map<number, number>; nusxalangan: Set<number>; eskiAktlar: EskiF2Akt[] } {
  const directFakt = new Map<number, number>(), qolda = new Map<number, number>(), f2Delta = new Map<number, number>();
  const nusxalangan = new Set<number>(); const nusxali = new Set<number>();
  const qosh = (m: Map<number, number>, k: number, v: number) => m.set(k, Math.round(((m.get(k) ?? 0) + v) * 1e6) / 1e6);
  for (const q of qatorlar) {
    const h = Number(q.hajm ?? 0); const id = Number(q.qator_id);
    if (!Number.isFinite(h)) continue;
    qosh(directFakt, id, h);
    if (q.manba_akt_qator_id != null) { nusxalangan.add(Number(q.manba_akt_qator_id)); nusxali.add(Number(q.akt_id)); }
    else if (q.narx_manba === 'f2_sertifikat') qosh(f2Delta, id, h);
    else qosh(qolda, id, h);
  }
  const eskiAktlar = aktlar.filter((a) => /Fakt = F2/.test(a.izoh ?? '') && !nusxali.has(Number(a.id)))
    .map((a) => ({ id: Number(a.id), raqam: a.raqam, sana: a.sana, jami: a.hujjat_jami == null ? null : Number(a.hujjat_jami) }));
  return { directFakt, qolda, f2Delta, nusxalangan, eskiAktlar };
}

async function qatorlarOl<T>(ids: readonly number[], ustunlar: string): Promise<{ ok: boolean; qatorlar: T[]; error?: string }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const q = await sbOqi<T>({ jadval: 't2_akt_qator', filtr: `akt_id=in.(${ids.slice(i, i + 100).join(',')})`, ustunlar, limit: 100000 });
    if (!q.ok) return { ok: false, qatorlar: [], error: q.error };
    out.push(...(q.qatorlar || []));
  }
  return { ok: true, qatorlar: out };
}
const idlar = (xs: readonly { id: number }[] | undefined) => (xs || []).map((x) => Number(x.id)).filter((x) => Number.isSafeInteger(x) && x > 0);

/**
 * «Fakt = F2» manbalari (egasi 2026-10-28: «F2 da fakt olingan narx bilan qilganman — fakt ga shu narx kirishi kerak»).
 * Faqat o'qish: tasdiqlangan F2 aktlari qatorlari (narx), bekor qilinmagan fakt hujjatlari qatorlari (o'z fakti, eski
 * «Fakt = F2» hujjatlari). Yig'ish — sof `f2NarxYigish` / `faktManbaYigish` da.
 */
export async function sbF2TasdiqNarxlar(obyektId: number): Promise<F2TenglashManba> {
  const bosh: F2TenglashManba = { ok: false, narxlar: new Map(), directFakt: new Map(), eskiAktlar: [], f2Satrlar: new Map(), nusxalangan: new Set(), qolda: new Map(), f2Delta: new Map() };
  const [a, f] = await Promise.all([
    sbOqi<{ id: number }>({ jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.f2&holat=eq.tasdiqlangan`, ustunlar: 'id', limit: 5000 }),
    sbOqi<FaktAkt>({ jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.fakt&holat=neq.bekor`, ustunlar: 'id,raqam,sana,izoh,hujjat_jami', limit: 5000 }),
  ]);
  if (!a.ok) return { ...bosh, error: a.error };
  if (!f.ok) return { ...bosh, error: f.error };
  const [f2q, fq] = await Promise.all([
    qatorlarOl<F2AktQator>(idlar(a.qatorlar), 'id,akt_id,qator_id,hajm,narx,summa,certified_quantity,certified_unit_price,certified_amount'),
    qatorlarOl<FaktAktQator>(idlar(f.qatorlar), 'akt_id,qator_id,hajm,narx_manba,manba_akt_qator_id'),
  ]);
  if (!f2q.ok) return { ...bosh, error: f2q.error };
  if (!fq.ok) return { ...bosh, error: fq.error };
  const f2Satrlar = new Map<number, F2AktQator[]>();
  for (const x of f2q.qatorlar) { const k = Number(x.qator_id); const a = f2Satrlar.get(k); if (a) a.push(x); else f2Satrlar.set(k, [x]); }
  return { ok: true, narxlar: f2NarxYigish(f2q.qatorlar), f2Satrlar, ...faktManbaYigish(f.qatorlar || [], fq.qatorlar) };
}
