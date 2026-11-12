/**
 * t2-nazorat.ts — TEXNIK NAZORAT (texnadzor) klienti. Shlyuz: /api/tomon (nazorat bo'limlari). Hamma ruxsat serverda.
 * Tekshiruv (sayt tashrifi) -> nomuvofiq band -> avtomatik predpisaniya (t2_tomon_murojaat) -> pudratchi foto bilan javob -> qayta tekshiruv.
 */
import { yangiOperationId } from './supabase';
import { tomonOqi, tomonYoz, type Muhimlik } from './t2-tomon';

export type BandNatija = 'mos' | 'mos_emas' | 'yoq';
export type TekshiruvBand = { kod: string; nom: string; natija: BandNatija; izoh?: string | null; muhimlik?: Muhimlik; document_ids?: number[] };
export type TekshiruvHolat = 'qoralama' | 'yakunlandi' | 'bekor';

export type NazoratObyektSon = {
  obyekt_id: number; ochiq_pred: number; tekshirishda: number; kechikkan: number; aosr_kutayotgan: number; f2_kutayotgan: number; oxirgi_tekshiruv: string | null;
};
export type NazoratUy = {
  obyektlar: NazoratObyektSon[];
  jami: { aosr_kutayotgan: number; f2_kutayotgan: number; pred_ochiq: number; pred_qayta_tekshiruv: number; pred_kechikkan: number; bugungi_tekshiruv: number; qoralama_tekshiruv: number };
};
export type TekshiruvQisqa = {
  id: number; sana: string; obyekt_id: number; obyekt_nom: string | null; aloqa_id: number | null; ish_turi: string; joy: string | null; holat: TekshiruvHolat;
  natija: 'mos' | 'mos_emas' | null; izoh: string | null; bandlar: TekshiruvBand[]; predpisaniya_soni: number; yaratildi: string; yakunlandi_vaqti: string | null;
};
export type TekshiruvTafsilot = {
  tekshiruv: Omit<TekshiruvQisqa, 'predpisaniya_soni' | 'yaratildi' | 'yakunlandi_vaqti'> & { versiya: number };
  fotolar: Array<{ document_id: number; fayl: string | null; mime: string | null; olcham: number | null }>;
  predpisaniyalar: Array<{ id: number; sarlavha: string; band_kod: string | null; holat: string; raund: number; muddat: string | null; kechikkan: boolean }>;
};
export type AosrKorik = {
  taqdim_id: number; aosr_id: number;
  protokollar: Array<{ id: number; raqam: string | null; sana: string | null; sinov_turi: string | null; konstruksiya: string | null; marka: string | null; natija: string | null; laboratoriya: string | null; document_id: number | null; fayl: string | null }>;
  fotolar: Array<{ document_id: number; fayl: string | null; mime: string | null }>;
  ishlar: Array<{ qator_id: number; kod: string | null; nom: string | null; birlik: string | null }>;
};
export type F2Muammo = 'akt_yoq' | 'akt_kutmoqda' | 'hajm_oshgan';
export type F2Tekshiruv = {
  akt_id: number;
  xulosa: { jami_qator: number; yashirin_qator: number; akt_tasdiqlangan: number; akt_kutmoqda: number; akt_yoq: number; fakt_korinadi: boolean; hajm_oshgan: number | null; fakt_yoq: number | null };
  muammolar: Array<{ qator_id: number; kod: string | null; nom: string | null; birlik: string | null; f2_hajm: number | null; fakt_hajm: number | null; yashirin: boolean; akt_holat: string | null; muammo: F2Muammo }>;
};

const XATO: Record<string, string> = {
  FOTO_KERAK: 'Nomuvofiq band uchun foto va izoh shart', FOTO_BEGONA: 'Foto sizning kompaniyangizniki emas yoki hali saqlanmagan', OBYEKT_YOPIQ: 'Bu obyekt sizga ochilmagan',
  ALOQA_YOQ: 'Faol aloqa topilmadi', IZOH_KERAK: 'Nomuvofiq band uchun nima noto‘g‘riligini yozing', BOSH: 'Hech bo‘lmasa bitta bandni tekshiring',
};

export const nazoratUyOl = (k: number) => tomonOqi<NazoratUy>('nazorat_uy', k);
export const tekshiruvlarOl = (k: number, p: { dan?: string; gacha?: string; obyektId?: number | null; limit?: number } = {}) =>
  tomonOqi<TekshiruvQisqa[]>('tekshiruvlar', k, { dan: p.dan, gacha: p.gacha, obyekt_id: p.obyektId, limit: p.limit });
export const tekshiruvTafsilotOl = (k: number, id: number) => tomonOqi<TekshiruvTafsilot>('tekshiruv', k, { tekshiruv_id: id });
export const aosrKorikOl = (k: number, taqdimId: number) => tomonOqi<AosrKorik>('aosr_korik', k, { taqdim_id: taqdimId });
export const f2TekshiruvOl = (k: number, p: { taqdimId?: number | null; aktId?: number | null }) => tomonOqi<F2Tekshiruv>('f2_tekshiruv', k, { taqdim_id: p.taqdimId, akt_id: p.aktId });

export type TekshiruvYozuv = {
  id?: number | null; aloqaId?: number | null; obyektId: number; sana?: string; ishTuri: string; joy?: string; bandlar: TekshiruvBand[]; izoh?: string; yakunla?: boolean; muddatKun?: number | null;
  operationId?: string;
};
/** Qoralama saqlash yoki yakunlash. Yakunlashda nomuvofiq bandlar uchun predpisaniya server tomonida avtomatik yaratiladi. */
export async function tekshiruvYoz(k: number, p: TekshiruvYozuv) {
  const r = await tomonYoz<{ id: number; holat: TekshiruvHolat; natija?: 'mos' | 'mos_emas'; predpisaniyalar?: number[]; predpisaniya_yaratilmadi?: boolean }>('tekshiruv_yoz', k, {
    id: p.id ?? null, aloqa_id: p.aloqaId ?? null, obyekt_id: p.obyektId, sana: p.sana || null, ish_turi: p.ishTuri, joy: p.joy || null, bandlar: p.bandlar,
    izoh: p.izoh || null, yakunla: p.yakunla === true, muddat_kun: p.muddatKun ?? null, operation_id: p.operationId ?? yangiOperationId(),
  });
  return r.ok ? r : { ...r, error: (r.code && XATO[r.code]) || r.error };
}
export const aosrFotoBiriktir = (k: number, aosrId: number, documentIds: number[]) => tomonYoz<{ qoshildi: number }>('aosr_foto', k, { aosr_id: aosrId, document_ids: documentIds });
