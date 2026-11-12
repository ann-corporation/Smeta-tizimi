/**
 * «Bugungi ishlar» MANBASI — yagona tikuv joyi (seam). Hozir: obyektning qoldig'i bor BL qatorlari.
 * Naryad (naryad-lugat) va grafik (#P6) tayyor bo'lganda SHU funksiya almashtiriladi: avval bugungi naryad qatorlari,
 * keyin qolgan qoldiqli ishlar. Sahifa (UstaBugun) manba haqida boshqa hech narsa bilmaydi.
 */
import { sbOqi } from '../../api/supabase';

export type BugunQator = { qator_id: number; kod: string | null; nom: string; birlik: string | null; smeta_hajm: number | null; fakt_hajm: number | null; qoldiq_hajm: number | null };
export type BugunTur = 'bl' | 'mat';

const USTUNLAR = 'qator_id,kod,nom,birlik,smeta_hajm,fakt_hajm,qoldiq_hajm';
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export async function bugungiIshlarManbasi(obyektId: number, tur: BugunTur): Promise<{ ok: boolean; qatorlar: BugunQator[] }> {
  const r = await sbOqi<Record<string, unknown>>({ jadval: 't2_qator_holat', filtr: `obyekt_id=eq.${obyektId}&tur=eq.${tur}`, ustunlar: USTUNLAR, tartib: 'kod.asc', limit: 600 });
  if (!r.ok) return { ok: false, qatorlar: [] };
  const qatorlar = (r.qatorlar ?? []).map((x) => ({ qator_id: Number(x.qator_id), kod: (x.kod as string) ?? null, nom: String(x.nom ?? ''), birlik: (x.birlik as string) ?? null,
    smeta_hajm: num(x.smeta_hajm), fakt_hajm: num(x.fakt_hajm), qoldiq_hajm: num(x.qoldiq_hajm) }))
    .filter((x) => x.nom && (tur === 'mat' || x.qoldiq_hajm == null || x.qoldiq_hajm > 0));
  return { ok: true, qatorlar };
}
