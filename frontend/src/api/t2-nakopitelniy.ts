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

import { yozAmali, type AktNatija } from './supabase';
import type { SvodShartnoma, TolovTur } from '../lib/nakopitelniy-svod';

export type NakopitelniyQator = {
  qator_id: number; tartib: number; kod: string | null; nom: string | null; birlik: string | null;
  tur: 'rz' | 'bl' | 'rs' | 'mat' | 'ob'; kat: string | null; qoshimcha: boolean; zamena: boolean;
  /** Canonical tree relation from t2_qator/t2_daraxt. Optional for older RPC deployments. */
  ota_id?: number | null; daraja?: number | null;
  /** Yagona smeta modeli izohi (lib/smeta-model): qo'shimcha ish / zamena — nima o'rniga. */
  ozgarish_izoh?: string | null;
  /** Resurs normasi (yagona smeta modelidan) — hujjatda smeta hajmi = norma × ish hajmi formulasi. */
  norma?: number | null;
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
/** Bir vaqtda o'qiladigan sahifalar soni (server/DB yuklamasini cheklash uchun). */
const NAKOPITELNIY_PARALLEL = 4;

export async function t2NakopitelniyOl(obyektId: number, davr?: string | null, limit?: number, offset?: number): Promise<NakopitelniyJavob> {
  const q = new URLSearchParams({ amal: 'nakopitelniy', obyekt_id: String(obyektId), faqat_faol: '0' });
  // UI month selector uses YYYY-MM; PostgreSQL RPC requires a complete date.
  if (davr) q.set('davr', /^\d{4}-\d{2}$/.test(davr) ? `${davr}-01` : davr);
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
  // Unumdorlik (Sun'iy ko'l 25k qator, prod profil 2026-10-24: 5 sahifa ketma-ket ~3 s dan = ~15 s): jami ma'lum bo'lsa
  // qolgan sahifalar oldindan rejalanadi va 4 tadan PARALLEL o'qiladi; tartib offset bo'yicha saqlanadi, natija bir xil.
  const jami = birinchi.qatorlar_jami;
  // Faqat server sahifa hajmini to'liq bergan bo'lsa (keyingi = 5000) — aks holda eski ketma-ket yo'l.
  if (keyingi != null && keyingi === NAKOPITELNIY_SAHIFA && Number.isSafeInteger(jami) && jami > keyingi) {
    const offsetlar: number[] = [];
    for (let o = keyingi; o < jami; o += NAKOPITELNIY_SAHIFA) offsetlar.push(o);
    if (offsetlar.length >= NAKOPITELNIY_MAX_SAHIFA) return { ok: false, code: 'NAKOPITELNIY_SAHIFA_CHEGARASI' };
    const sahifalar: NakopitelniyJavob[] = new Array(offsetlar.length);
    for (let i = 0; i < offsetlar.length; i += NAKOPITELNIY_PARALLEL) {
      const bolak = offsetlar.slice(i, i + NAKOPITELNIY_PARALLEL);
      const javob = await Promise.all(bolak.map((o) => t2NakopitelniyOl(obyektId, davrQat, NAKOPITELNIY_SAHIFA, o)));
      javob.forEach((s, k) => { sahifalar[i + k] = s; });
    }
    for (const s of sahifalar) {
      if (!s.ok) return s;
      if (s.qatorlar_jami !== jami) return { ok: false, code: 'NAKOPITELNIY_OZGARDI' };
      qatorlar.push(...s.qatorlar);
    }
    // Rejadan keyin ham server yana sahifa ko'rsatsa (jami o'zgargan) — chala hujjat yasalmaydi.
    const oxirgi = sahifalar[sahifalar.length - 1];
    if (oxirgi.ok && oxirgi.keyingi_offset != null) return { ok: false, code: 'NAKOPITELNIY_OZGARDI' };
    if (qatorlar.length !== jami) return { ok: false, code: 'NAKOPITELNIY_OZGARDI' };
    return { ...birinchi, qatorlar, qatorlar_korsatildi: qatorlar.length, truncated: false, keyingi_offset: null };
  }
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

/* ═══════════ Shartnoma darajasi (2026-10-23): svod, akt-sverka, F3 sotuvdan, DS ═══════════
 * O'qish: /api/sb `shartnoma_svod_v1` (stable, a'zolik + f2.read). Yozish: /api/sb-yoz `sverka_yozuv_v1` (DS | F3 sotuvdan,
 * t2_forma3.manba='sotuv'); to'lov — mavjud `tolov_yoz`. Hisob — lib/nakopitelniy-svod.ts. */

export type ShartnomaSvodJavob = { ok: true; generated_at: string; shartnomalar: SvodShartnoma[] };

export async function shartnomaSvodOl(kompaniyaId: number): Promise<{ ok: true; natija: ShartnomaSvodJavob } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 'shartnoma_svod_v1', kompaniya_id: kompaniyaId }) });
    const j = await r.json() as { ok: boolean; natija?: ShartnomaSvodJavob; error?: string };
    if (!j.ok || !j.natija || !Array.isArray(j.natija.shartnomalar)) return { ok: false, error: j.error || 'Svodni o‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export type SverkaYozuvTur = 'ds' | 'f3_sotuv';

export function sverkaYozuvYoz(p: {
  kompaniyaId: number; shartnomaId: number; tur: SverkaYozuvTur; yozuvId?: number | null; kutilganVersiya?: number | null;
  malumot: Record<string, string | number | null>; operationId: string;
}): Promise<AktNatija & { id?: number; versiya?: number; code?: string; xabar?: string }> {
  return yozAmali({
    amal: 'sverka_yozuv_v1', kompaniya_id: p.kompaniyaId, shartnoma_id: p.shartnomaId, tur: p.tur,
    yozuv_id: p.yozuvId ?? null, kutilgan_versiya: p.kutilganVersiya ?? null, malumot: p.malumot, operation_id: p.operationId,
  });
}

export function tolovYoz(p: { kompaniyaId: number; shartnomaId: number; summa: number; tur: TolovTur; sana: string; izoh?: string | null; operationId: string }) {
  return yozAmali({ amal: 'tolov_yoz', kompaniya_id: p.kompaniyaId, shartnoma_id: p.shartnomaId, summa: p.summa, tur: p.tur, sana: p.sana, izoh: p.izoh ?? null, operation_id: p.operationId });
}

export function sverkaXato(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''}`;
  if (r?.xabar) return r.xabar;
  if (/STALE_VERSION/.test(m)) return 'Yozuv shu orada o‘zgargan — yangilab qayta urinib ko‘ring.';
  if (/F3_TAKROR/.test(m)) return 'Shu sana, raqam va summali F3 allaqachon bor.';
  if (/PERMISSION_DENIED/.test(m)) return 'Bu amal uchun moliya yozish ruxsati kerak.';
  if (/SHARTNOMA_NOT_FOUND/.test(m)) return 'Shartnoma topilmadi.';
  return r?.error || r?.code || 'Saqlab bo‘lmadi.';
}
