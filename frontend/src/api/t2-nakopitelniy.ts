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

import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, type AktNatija } from './supabase';
import type { SvodShartnoma, TolovTur } from '../lib/nakopitelniy-svod';
import { ogirYuklashBoshla, ogirYuklashKut } from './ogir-sorov-navbat';

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
  /** Zamena qoplagan qism (t2_almashtirilgan_hajm; qoldiq_* shuni ALLAQACHON ayirgan). Eski RPC da yo'q. */
  almashtirilgan_hajm?: number; almashtirilgan_summa?: number | null;
  /** Zamena qatori qaysi asl qator o'rniga (smeta-model `almashtiradi`; hujjatda «взамен поз. N»). */
  almashtirgan_id?: number | null;
  /** «Bajarilmadi» (t2_qator_bajarilmadi, faol): bajarilmagan hajm (null — butun qator), sabab kodi, izoh, zamena qatori. Qator hujjatdan yo'qolmaydi. */
  bajarilmadi_hajm?: number | null; bajarilmadi_sabab?: string | null; bajarilmadi_izoh?: string | null; bajarilmadi_zamena_id?: number | null;
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
export type SmetaNakrutka = { pryamye: number; itogo4: number; nds: number; nds_foiz: number | null; vsego: number; /** Kat noma'lum qism bor — taxminiy. */ taxminiy?: boolean };

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
/**
 * Bir vaqtda o'qiladigan sahifalar soni. Prod 2026-10-27: 4 parallel sahifa kichik DB instansini CPU ga to'yintirib,
 * har biri 30 s statement timeout bilan 500 berdi («keyinroq qayta urinib ko'ring»). Endi ko'pi bilan 2.
 */
export const NAKOPITELNIY_PARALLEL = 2;
/** Vaqtinchalik server xatosida (5xx / tarmoq) qayta urinishlar soni va boshlang'ich kutish (eksponensial: 1×, 2×). */
export const NAKOPITELNIY_QAYTA = 2;
export const nakopitelniyQaytaKutish = { ms: 1500 };

/** Yuklash progressi: qancha qator o'qildi / jami (jami birinchi sahifadan keyin ma'lum). */
export type NakopitelniyProgress = { yuklandi: number; jami: number | null; sahifa: number; sahifalar: number | null };
export type NakopitelniyOpts = { onProgress?: (p: NakopitelniyProgress) => void };

const kut = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Vaqtinchalik (qayta urinsa o'tishi mumkin) xato: 5xx yoki tarmoq. 4xx (ruxsat, parametr) — qayta urinilmaydi. */
const vaqtinchalik = (status: number | undefined) => status == null || status >= 500;

async function sahifaBirMarta(obyektId: number, davr: string | null | undefined, limit: number | undefined, offset: number | undefined, faqatFaol: boolean): Promise<{ j: NakopitelniyJavob; qayta: boolean }> {
  const q = new URLSearchParams({ amal: 'nakopitelniy', obyekt_id: String(obyektId), faqat_faol: faqatFaol ? '1' : '0' });
  // UI month selector uses YYYY-MM; PostgreSQL RPC requires a complete date.
  if (davr) q.set('davr', /^\d{4}-\d{2}$/.test(davr) ? `${davr}-01` : davr);
  if (limit) q.set('limit', String(limit));
  if (offset) q.set('offset', String(offset));
  let r: Response;
  try { r = await fetch('/api/hujjat-nazorat?' + q.toString()); } catch { return { j: { ok: false, code: 'NETWORK_ERROR' }, qayta: true }; }
  const j = await r.json().catch(() => null) as NakopitelniyJavob | null;
  if (!j) return { j: { ok: false, code: 'NETWORK_ERROR' }, qayta: vaqtinchalik(r.status) };
  return { j, qayta: !j.ok && vaqtinchalik(r.status) };
}

/** Bitta sahifa; 5xx/tarmoq xatosida eksponensial kutish bilan NAKOPITELNIY_QAYTA marta qayta uriniladi. */
export async function t2NakopitelniyOl(obyektId: number, davr?: string | null, limit?: number, offset?: number, faqatFaol = false): Promise<NakopitelniyJavob> {
  for (let urinish = 0; ; urinish++) {
    const { j, qayta } = await sahifaBirMarta(obyektId, davr, limit, offset, faqatFaol);
    if (j.ok || !qayta || urinish >= NAKOPITELNIY_QAYTA) return j;
    await kut(nakopitelniyQaytaKutish.ms * 2 ** urinish);
  }
}

/**
 * TO'LIQ ro'yxat — server sahifalarini `keyingi_offset` null bo'lguncha o'qiydi
 * (egasi qarori Q4, 2026-09-25: "keyingi ishlarda bu avtomat ishlashi shart").
 * Qator chegarasi yo'q: 27 000+ qatorli obyekt ham to'liq keladi. Jami
 * birinchi sahifadan. Sahifalar orasida qator soni o'zgarsa (parallel import)
 * — xato, chala hujjat yasalmaydi.
 */
/** Qolgan sahifalarni NAKOPITELNIY_PARALLEL tadan o'qiydi. Hammasi to'g'ri va to'liq bo'lsa — qatorlar, aks holda null (chaqiruvchi ketma-ket o'qiydi). */
async function nakopitelniyParallel(obyektId: number, davr: string | null, boshi: number, jami: number, progress: (n: number) => void): Promise<NakopitelniyQator[] | null> {
  const offsetlar: number[] = [];
  for (let o = boshi; o < jami; o += NAKOPITELNIY_SAHIFA) offsetlar.push(o);
  if (offsetlar.length >= NAKOPITELNIY_MAX_SAHIFA) return null;
  const qatorlar: NakopitelniyQator[] = [];
  for (let i = 0; i < offsetlar.length; i += NAKOPITELNIY_PARALLEL) {
    const javob = await Promise.all(offsetlar.slice(i, i + NAKOPITELNIY_PARALLEL).map((o) => t2NakopitelniyOl(obyektId, davr, NAKOPITELNIY_SAHIFA, o)));
    for (const s of javob) {
      if (!s.ok || s.qatorlar_jami !== jami) {
        // eslint-disable-next-line no-console
        console.info('[nakopitelniy parallel] sahifa:', s.ok ? `jami ${s.qatorlar_jami} != ${jami}` : s.code);
        return null;
      }
      qatorlar.push(...s.qatorlar);
    }
    progress(qatorlar.length);
  }
  return qatorlar.length + boshi === jami ? qatorlar : null;
}
export async function t2NakopitelniyToliq(obyektId: number, davr?: string | null, faqatFaol = false, opts: NakopitelniyOpts = {}): Promise<NakopitelniyJavob> {
  // Yuklash davomida boshqa og'ir o'qishlar (pul tahlili, akt reestri) kutadi — DB bir vaqtda to'yinmasin.
  const tugadi = ogirYuklashBoshla();
  try { return await toliqOqi(obyektId, davr, faqatFaol, opts); } finally { tugadi(); }
}

async function toliqOqi(obyektId: number, davr: string | null | undefined, faqatFaol: boolean, opts: NakopitelniyOpts): Promise<NakopitelniyJavob> {
  const xabar = (yuklandi: number, jami: number | null) => {
    try {
      opts.onProgress?.({ yuklandi, jami, sahifa: Math.ceil(yuklandi / NAKOPITELNIY_SAHIFA), sahifalar: jami == null || faqatFaol ? null : Math.max(1, Math.ceil(jami / NAKOPITELNIY_SAHIFA)) });
    } catch { /* progress UI xatosi yuklashni to'xtatmaydi */ }
  };
  xabar(0, null);
  const birinchi = await t2NakopitelniyOl(obyektId, davr, NAKOPITELNIY_SAHIFA, 0, faqatFaol);
  if (!birinchi.ok) return birinchi;
  const qatorlar = [...birinchi.qatorlar];
  let keyingi = birinchi.keyingi_offset ?? null;
  const progressJami = faqatFaol ? null : birinchi.qatorlar_jami;
  xabar(qatorlar.length, progressJami);
  // Eski server (v1 javobi, keyingi_offset yo'q) qirqilgan bo'lsa — to'liq emas.
  if (keyingi == null && birinchi.truncated && birinchi.keyingi_offset === undefined) {
    return { ...birinchi, qatorlar, qatorlar_korsatildi: qatorlar.length, truncated: true };
  }
  const davrQat = davr || birinchi.davr;
  // Jami ma'lum bo'lsa qolgan sahifalar oldindan rejalanadi va NAKOPITELNIY_PARALLEL tadan o'qiladi; tartib offset bo'yicha saqlanadi.
  const jami = birinchi.qatorlar_jami;
  // Faqat server sahifa hajmini to'liq bergan bo'lsa (keyingi = 5000) — aks holda eski ketma-ket yo'l.
  // Faqat faol qatorlar rejimida qatorlar_jami obyektning BARCHA qatorlari soni — oldindan rejalab bo'lmaydi (ketma-ket).
  if (!faqatFaol && keyingi != null && keyingi === NAKOPITELNIY_SAHIFA && Number.isSafeInteger(jami) && jami > keyingi) {
    // Parallel o'qish faqat TEZLASHTIRISH: biror sahifa (qayta urinishlardan keyin ham) xato bersa — jim xato emas,
    // ketma-ket yo'lga qaytiladi (regressiya 2026-10-24: Sun'iy ko'l da «Nakopitelniy o'qilmadi»).
    const parallel = await nakopitelniyParallel(obyektId, davrQat, keyingi, jami, (n) => xabar(qatorlar.length + n, progressJami)).catch((e) => {
      // eslint-disable-next-line no-console
      console.info('[nakopitelniy parallel] istisno:', e instanceof Error ? e.message : String(e));
      return null;
    });
    // eslint-disable-next-line no-console
    if (!parallel) console.info('[nakopitelniy parallel] zaxira (ketma-ket) yo‘l');
    if (parallel) return { ...birinchi, qatorlar: [...qatorlar, ...parallel], qatorlar_korsatildi: qatorlar.length + parallel.length, truncated: false, keyingi_offset: null };
  }
  for (let n = 0; keyingi != null; n++) {
    if (n >= NAKOPITELNIY_MAX_SAHIFA) return { ok: false, code: 'NAKOPITELNIY_SAHIFA_CHEGARASI' };
    const s = await t2NakopitelniyOl(obyektId, davrQat, NAKOPITELNIY_SAHIFA, keyingi, faqatFaol);
    if (!s.ok) return s;
    if (s.qatorlar_jami !== birinchi.qatorlar_jami) return { ok: false, code: 'NAKOPITELNIY_OZGARDI' };
    qatorlar.push(...s.qatorlar);
    keyingi = s.keyingi_offset ?? null;
    xabar(qatorlar.length, progressJami);
  }
  return { ...birinchi, qatorlar, qatorlar_korsatildi: qatorlar.length, truncated: false, keyingi_offset: null };
}

/* ═══════════ Shartnoma darajasi (2026-10-23): svod, akt-sverka, F3 sotuvdan, DS ═══════════
 * O'qish: /api/sb `shartnoma_svod_v1` (stable, a'zolik + f2.read). Yozish: /api/sb-yoz `sverka_yozuv_v1` (DS | F3 sotuvdan,
 * t2_forma3.manba='sotuv'); to'lov — mavjud `tolov_yoz`. Hisob — lib/nakopitelniy-svod.ts. */

export type ShartnomaSvodJavob = { ok: true; generated_at: string; shartnomalar: SvodShartnoma[] };

export async function shartnomaSvodOl(kompaniyaId: number): Promise<{ ok: true; natija: ShartnomaSvodJavob } | { ok: false; error: string }> {
  try {
    await ogirYuklashKut(); // Nakopitelniy sahifalari bilan bir vaqtda DB ni to'yintirmasin (prod 2026-10-27).
    const r = await vaqtliOqish('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 'shartnoma_svod_v1', kompaniya_id: kompaniyaId }) });
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
