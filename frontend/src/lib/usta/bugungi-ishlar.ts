/**
 * «Bugungi ishlar» MANBASI — yagona tikuv joyi (seam). Hozir: obyektning qoldig'i bor BL qatorlari.
 * Naryad (naryad-lugat) va grafik (#P6) tayyor bo'lganda SHU funksiya almashtiriladi: avval bugungi naryad qatorlari,
 * keyin qolgan qoldiqli ishlar. Sahifa (UstaBugun) manba haqida boshqa hech narsa bilmaydi.
 *
 * 2026-11-12: naryad ulandi — usta (
aryad: true) uchun avval O'Z naryad satrlari (o'z birligida); ochiq naryad bilan qoplangan BL ishlar
 * qoldiqli ro'yxatdan CHIQARILADI (bir ish ikki yo'ldan kiritilmaydi: naryad «Bajardim» yagona kirish). Naryad yo'q/o'qilmasa — avvalgi xulq.
 */
import { sbOqi } from '../../api/supabase';
import { ustaNaryadlarOl } from '../../api/t2-usta';
import { ochiqNaryadQatorlari, ustaNaryadSatrlari, type NaryadSatr } from './naryad-ish';

export type BugunQator = { qator_id: number; kod: string | null; nom: string; birlik: string | null; smeta_hajm: number | null; fakt_hajm: number | null; qoldiq_hajm: number | null };
export type BugunTur = 'bl' | 'mat';

const USTUNLAR = 'qator_id,kod,nom,birlik,smeta_hajm,fakt_hajm,qoldiq_hajm';
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export type BugunManba = { ok: boolean; qatorlar: BugunQator[]; naryad: NaryadSatr[] };

export async function bugungiIshlarManbasi(obyektId: number, tur: BugunTur, opts: { kompaniyaId?: number; naryad?: boolean } = {}): Promise<BugunManba> {
  const [r, nar] = await Promise.all([
    sbOqi<Record<string, unknown>>({ jadval: 't2_qator_holat', filtr: `obyekt_id=eq.${obyektId}&tur=eq.${tur}`, ustunlar: USTUNLAR, tartib: 'kod.asc', limit: 600 }),
    tur === 'bl' && opts.naryad && opts.kompaniyaId != null ? ustaNaryadlarOl(opts.kompaniyaId, obyektId).catch(() => null) : Promise.resolve(null),
  ]);
  if (!r.ok) return { ok: false, qatorlar: [], naryad: [] };
  const naryad = nar ? ustaNaryadSatrlari(nar) : [];
  const yopiq = ochiqNaryadQatorlari(naryad);
  const qatorlar = (r.qatorlar ?? []).map((x) => ({ qator_id: Number(x.qator_id), kod: (x.kod as string) ?? null, nom: String(x.nom ?? ''), birlik: (x.birlik as string) ?? null,
    smeta_hajm: num(x.smeta_hajm), fakt_hajm: num(x.fakt_hajm), qoldiq_hajm: num(x.qoldiq_hajm) }))
    .filter((x) => x.nom && (tur === 'mat' || x.qoldiq_hajm == null || x.qoldiq_hajm > 0) && !yopiq.has(x.qator_id));
  return { ok: true, qatorlar, naryad };
}