/**
 * t2-nakopitelniy.ts — typed client for the real PTO nakopitelniy vedomost.
 * Reads /api/hujjat-nazorat?amal=nakopitelniy -> t2_nakopitelniy_v2 (Supabase
 * canonical). No Drive/Sheets/GAS. This is the RAW row shape (not the
 * abstract ProgressLineResult in lib/construction-document-control, which
 * has no Fakt dimension) -- see t2_nakopitelniy_v1's own migration history
 * for why: t2_nakopitelniy_v1's fakt_hajm/f2_mumkin_hajm columns
 * (20261011100000_t2_nakopitelniy_fakt_v1.sql) are exactly what a PTO
 * specialist needs ("Faktdan F2ga olish mumkin qancha qoldi?") and the pure
 * engine never modeled Fakt at all.
 */

export type NakopitelniyQator = {
  qator_id: number; tartib: number; kod: string | null; nom: string | null; birlik: string | null;
  tur: 'rz' | 'bl' | 'rs' | 'mat' | 'ob'; kat: string | null; qoshimcha: boolean; zamena: boolean;
  /** Canonical tree relation from t2_qator/t2_daraxt. Optional for older RPC deployments. */
  ota_id?: number | null; daraja?: number | null;
  smeta_hajm: number | null; smeta_narx: number | null; smeta_summa: number | null;
  fakt_hajm: number; fakt_summa: number;
  oldingi_hajm: number; oldingi_summa: number;
  joriy_hajm: number; joriy_summa: number; joriy_qoralama_summa: number;
  jami_hajm: number; jami_summa: number;
  f2_mumkin_hajm: number;
  qoldiq_hajm: number; qoldiq_summa: number;
  /** Additive v1 ledger wrapper fields; absent until that source migration is applied. */
  smeta_qoldiq_hajm?: number | null;
  smeta_qoldiq_summa?: number | null;
  f2_mumkin_summa?: number;
  contract_qoldiq_hajm?: number | null;
  contract_qoldiq_summa?: number | null;
  ledger_semantics?: 'v1';
  jami_baseline_summa: number; jami_actual_summa: number | null; narx_variance_summa: number;
  bajarilish_foiz: number | null;
};

export type NakopitelniyDavr = {
  oy: string; akt_id: number; raqam: string | null; holat: string; hujjat_jami: number | null;
  davr_muhr: string | null; revision_id: number | null; joriy: boolean; oldingi: boolean; certified: boolean;
};

export type NakopitelniyJami = {
  smeta_summa: number; fakt_summa: number; oldingi_summa: number; joriy_tasdiqlangan_summa: number;
  joriy_qoralama_summa: number; jami_tasdiqlangan_summa: number; qoldiq_summa: number;
  f2_mumkin_summa: number; baseline_summa: number; narx_variance_summa: number;
  pending_ozgarish_delta: number; bajarilish_foiz: number | null;
  /** v2: smeta summasi faqat barglardan (rs/mat/ob); summasi noma'lum barglar soni. */
  smeta_summa_asos?: 'barglar'; smeta_summa_nomalum?: number;
  /** v2: t2_obyekt_nakrutka kaskadi (null — obyektda nakrutka yo'q). */
  smeta_nakrutka?: SmetaNakrutka | null;
};

/** Smeta: to'g'ri xarajat → ИТОГО-4 (без НДС) → НДС → ВСЕГО (t2_obyekt_nakrutka). */
export type SmetaNakrutka = { pryamye: number; itogo4: number; nds: number; nds_foiz: number | null; vsego: number };

export type NakopitelniyJavob = {
  ok: true; generated_at: string;
  obyekt: { id: number; nom: string; kompaniya_id: number; loyiha_id: number | null };
  davr: string; joriy_revision_id: number | null;
  qatorlar: NakopitelniyQator[]; qatorlar_jami: number; qatorlar_korsatildi: number; truncated: boolean;
  /** v2 sahifalash: keyingi sahifa boshi (null — oxirgi sahifa). */
  offset?: number; limit?: number; keyingi_offset?: number | null;
  /** v2: faqat birinchi sahifada (offset=0) to'ldiriladi. */
  jami: NakopitelniyJami;
  davrlar: NakopitelniyDavr[];
} | { ok: false; code: string; xato?: string };

/** Bitta sahifa hajmi (server maksimumi 5000). */
export const NAKOPITELNIY_SAHIFA = 5000;
/** Xavfsizlik chegarasi: 200 sahifa × 5000 = 1 mln qator. */
const NAKOPITELNIY_MAX_SAHIFA = 200;

export async function t2NakopitelniyOl(obyektId: number, davr?: string | null, limit?: number, offset?: number): Promise<NakopitelniyJavob> {
  const q = new URLSearchParams({ amal: 'nakopitelniy', obyekt_id: String(obyektId), faqat_faol: '0' });
  if (davr) q.set('davr', davr);
  if (limit) q.set('limit', String(limit));
  if (offset) q.set('offset', String(offset));
  const r = await fetch('/api/hujjat-nazorat?' + q.toString());
  const j = await r.json().catch(() => null);
  if (!j) return { ok: false, code: 'NETWORK_ERROR' };
  return j;
}

/**
 * TO'LIQ ro'yxat — server sahifalarini `keyingi_offset` null bo'lguncha o'qiydi
 * (egasi qarori Q4, 2026-09-25: "keyingi ishlarda bu avtomat ishlashi shart").
 * Qator chegarasi yo'q: 27 000+ qatorli obyekt ham to'liq keladi. Jami
 * birinchi sahifadan. Sahifalar orasida qator soni o'zgarsa (parallel import)
 * — xato, chala hujjat yasalmaydi.
 */
export async function t2NakopitelniyToliq(obyektId: number, davr?: string | null): Promise<NakopitelniyJavob> {
  const birinchi = await t2NakopitelniyOl(obyektId, davr, NAKOPITELNIY_SAHIFA, 0);
  if (!birinchi.ok) return birinchi;
  const qatorlar = [...birinchi.qatorlar];
  let keyingi = birinchi.keyingi_offset ?? null;
  // Eski server (v1 javobi, keyingi_offset yo'q) qirqilgan bo'lsa — to'liq emas.
  if (keyingi == null && birinchi.truncated && birinchi.keyingi_offset === undefined) {
    return { ...birinchi, qatorlar, qatorlar_korsatildi: qatorlar.length, truncated: true };
  }
  const davrQat = davr || birinchi.davr;
  for (let n = 0; keyingi != null; n++) {
    if (n >= NAKOPITELNIY_MAX_SAHIFA) return { ok: false, code: 'NAKOPITELNIY_SAHIFA_CHEGARASI' };
    const s = await t2NakopitelniyOl(obyektId, davrQat, NAKOPITELNIY_SAHIFA, keyingi);
    if (!s.ok) return s;
    if (s.qatorlar_jami !== birinchi.qatorlar_jami) return { ok: false, code: 'NAKOPITELNIY_OZGARDI' };
    qatorlar.push(...s.qatorlar);
    keyingi = s.keyingi_offset ?? null;
  }
  return { ...birinchi, qatorlar, qatorlar_korsatildi: qatorlar.length, truncated: false, keyingi_offset: null };
}
