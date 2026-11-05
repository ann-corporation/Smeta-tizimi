import { sbOqi, sbT2AktYaratV2, sbT2DaraxtOl, yangiOperationId, type AktNatija } from './supabase';
import { sbFaktYoz, sbQatorHolatOl, type FaktNatija } from './t2-fakt';
import type { StornoDaraxtTugun, StornoFaktHolat, StornoFaktYozuv, StornoManbaQator, StornoYukQator } from '../lib/f2-storno';

/** Bo'lim bo'yicha tanlash uchun smeta daraxti (faqat ierarxiya ustunlari). */
export async function f2StornoDaraxtOl(obyektId: number): Promise<{ ok: boolean; qatorlar: StornoDaraxtTugun[] }> {
  const r = await sbT2DaraxtOl(obyektId, 'id,ota_id,tur,kod,nom,tartib');
  if (!r.ok) return { ok: false, qatorlar: [] };
  return { ok: true, qatorlar: (r.qatorlar ?? []).map((x) => ({ id: x.id, ota_id: x.ota_id ?? null, tur: x.tur ?? '', kod: x.kod ?? null, nom: x.nom ?? null, tartib: x.tartib ?? null })) };
}

/** Storno qilinadigan aktning barcha qatorlari (aniq hujjat qiymatlari: certified_*, bo'lmasa hajm/narx/summa). */
export async function f2StornoManbaOl(aktId: number, obyektId: number): Promise<{ ok: boolean; qatorlar: StornoManbaQator[]; error?: string }> {
  const r = await sbOqi<StornoManbaQator>({
    jadval: 't2_akt_qator', filtr: `akt_id=eq.${aktId}&obyekt_id=eq.${obyektId}`,
    ustunlar: 'qator_id,hajm,certified_quantity,certified_unit_price,certified_amount,narx,summa,provenance_status', limit: 50000,
  });
  if (!r.ok) return { ok: false, qatorlar: [], error: 'F2 qatorlari o‘qilmadi' };
  return { ok: true, qatorlar: r.qatorlar ?? [] };
}

/** Shu aktning storno qoralamalari (raw_snapshot.stornoOf = akt id) — akt id lar. Bekor qilinganlarini chaqiruvchi reestrdan ajratadi. */
export async function f2StornoAktIdlari(aktId: number, obyektId: number): Promise<number[]> {
  const r = await sbOqi<{ akt_id: number }>({
    jadval: 't2_akt_qator', filtr: `obyekt_id=eq.${obyektId}&raw_snapshot->>stornoOf=eq.${aktId}`, ustunlar: 'akt_id', limit: 20000,
  });
  if (!r.ok) throw new Error('STORNO_TEKSHIRUV_OQILMADI');
  return [...new Set((r.qatorlar ?? []).map((x) => x.akt_id))];
}

/** Joriy fakt (qator nomi, turi, sof fakt hajmi) — kanonik qator holati. */
export type StornoQatorKorinish = StornoFaktHolat & { kod: string | null; nom: string | null; birlik: string | null };
export async function f2StornoHolatOl(obyektId: number): Promise<{ ok: boolean; qatorlar: StornoQatorKorinish[] }> {
  const r = await sbQatorHolatOl(obyektId);
  if (!r.ok) return { ok: false, qatorlar: [] };
  return { ok: true, qatorlar: (r.qatorlar ?? []).map((h) => ({ qator_id: h.qator_id, tur: h.tur, fakt_hajm: h.fakt_hajm, kod: h.kod ?? null, nom: h.nom ?? null, birlik: h.birlik ?? null })) };
}

/** Storno qoralamasini mavjud F2 yaratish yo'li (`t2_akt_yarat_v2`) bilan yaratadi. `operationId` qayta urinishda o'zgarmaydi. */
export function f2StornoQoralamaYarat(p: { obyektId: number; oy: string; raqam?: string; qatorlar: readonly StornoYukQator[]; operationId: string }): Promise<AktNatija> {
  return sbT2AktYaratV2({ obyektId: p.obyektId, oy: p.oy, raqam: p.raqam, operationId: p.operationId, qatorlar: [...p.qatorlar] });
}

/** Minus fakt yozuvlari: mavjud fakt kiritish yo'li (`fakt_yoz_v2`) — audit va versiyalash saqlanadi; o'tgan yozuvlar tegilmaydi. */
export function f2StornoFaktYoz(p: { obyektId: number; sana: string; yozuvlar: readonly StornoFaktYozuv[]; raqam?: string; operationId: string; izoh: string }): Promise<FaktNatija & { error?: string }> {
  return sbFaktYoz({
    obyektId: p.obyektId, sana: p.sana, operationId: p.operationId, raqam: p.raqam, izoh: p.izoh,
    qatorlar: p.yozuvlar.map((y) => ({ qator_id: y.qator_id, hajm: y.hajm, izoh: y.izoh })),
  });
}

export { yangiOperationId };
