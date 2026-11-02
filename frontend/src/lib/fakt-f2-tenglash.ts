/**
 * «Fakt = F2» — sof mantiq (egasi 2026-10-24). F2 tasdiqlangan hajmi fakt dan ko'p bo'lgan ishlar (va ularning
 * mat/ob resurslari) uchun FARQ (f2 − fakt, faqat musbat) fakt hujjatiga delta sifatida yoziladi.
 *
 *  - NARX (egasi 2026-10-28: «F2 da fakt olingan narx bilan qilganman — fakt ga shu narx kirishi kerak»): har yoziladigan
 *    qator TASDIQLANGAN F2 qatorining narxi bilan (certified_unit_price ?? narx; bir necha F2 da turli narx — hajm bo'yicha
 *    o'rtacha), manbasi bilan (narx_manba='f2_sertifikat', narx_manba_id = F2 akt, narx_izoh — akt raqamlari).
 *    F2 narxi NULL — narx to'qilmaydi: narx yuborilmaydi (server smeta narxini oladi) yoki narxsiz qoladi. 0 — 0.
 *  - Mehnat/mashina (rs): F2 da bor bo'lsa — o'z F2 hajmi (F2 − o'z fakti) va narxi bilan yoziladi (T2-FAKT-F2-RS-001,
 *    narx_manba='f2_sertifikat'); o'z fakti bo'lgan rs hosiladan chiqadi (view). F2 da yo'q rs — ishga norma bo'yicha smeta
 *    narxida ergashadi. F2 da bl/rs narxi yo'q — narx_yoq (summa to'qilmaydi). Ko'rilgan summa = yoziladigan summa.
 *  - Faqat fakt jadvaliga (fakt_yoz_v2) yoziladi. Asl smeta qatorlari (t2_qator) HECH QACHON o'zgarmaydi.
 *  - Tasdiqlangan F2 — muhrlangan hujjat (egasi 2026-10-29): har qatori ishorasi bilan (minus norma, sof manfiy F2 ham)
 *    aynan ko'chiriladi; manbasi (F2 akt va akt qatorlari) narx_manba_id / narx_izoh da qoladi. Fakt F2 dan oshib ketgan
 *    qatorlar (qo'lda kiritilgan, topshirilmagan ish) o'zgartirilmaydi — faqat signal.
 */
import { sbT2AktBekor } from '../api/supabase';
import type { JurnalHolat, JurnalIsh, JurnalQator } from './fakt-jurnal';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from './ustamali-summa';

/** Tasdiqlangan F2 akt qatori (o'qish: t2_akt_qator). */
export type F2AktQator = {
  /** t2_akt_qator.id — iz uchun (narx_izoh). */
  id?: number;
  akt_id: number; qator_id: number; hajm: number | null; narx: number | null; summa: number | null;
  certified_quantity: number | null; certified_unit_price: number | null; certified_amount: number | null;
};
/**
 * Qator bo'yicha F2 narxi: narx null — F2 da narx yo'q (to'qilmaydi). `aralash` — qisman narxli F2 (soni qatordan
 * narxsizSoni tasida narx yo'q): narx = Σ narxli summalar / Σ BARCHA hajm (fakt summasi F2 summasiga aynan teng).
 */
export type F2Narx = { narx: number | null; aktlar: readonly number[]; aralash: boolean; soni?: number; narxsizSoni?: number; /** Manba F2 akt qatorlari (t2_akt_qator.id). */ qatorIdlar?: readonly number[] };

/**
 * Qator → F2 narxi. Narx = Σ summa / Σ hajm (sertifikat summasi ustun) — faktga yozilgan summa F2 summasiga aynan teng
 * (sertifikatda summa birlik narx × hajmdan farq qilsa ham). Bitta narx va summa unga mos — o'sha birlik narxi.
 * Qisman narxli (L0 2026-10-29): Σ narxli summalar / Σ barcha hajm — narxsiz hajmga narx to'qilmaydi, jami F2 ga teng.
 * Hech bir F2 qatorida narx yo'q — narx null. Narx 0 — 0 (NULL emas).
 */
export function f2NarxYigish(qatorlar: readonly F2AktQator[]): Map<number, F2Narx> {
  const guruh = new Map<number, F2AktQator[]>();
  for (const x of qatorlar) { const id = Number(x.qator_id); const a = guruh.get(id); if (a) a.push(x); else guruh.set(id, [x]); }
  const out = new Map<number, F2Narx>();
  for (const [id, xs] of guruh) {
    const aktlar = [...new Set(xs.map((x) => Number(x.akt_id)))].sort((a, b) => a - b);
    const qatorIdlar = xs.map((x) => Number(x.id)).filter((x) => Number.isSafeInteger(x) && x > 0).sort((a, b) => a - b);
    const birlik = xs.map((x) => son(x.certified_unit_price) ?? son(x.narx));
    const narxli = birlik.filter((u): u is number => u != null);
    const soni = xs.length, narxsizSoni = soni - narxli.length;
    if (!narxli.length) { out.set(id, { narx: null, aktlar, aralash: false, soni, narxsizSoni, ...(qatorIdlar.length ? { qatorIdlar } : {}) }); continue; }
    let qty = 0, amt = 0;
    xs.forEach((x, i) => {
      const h = son(x.certified_quantity) ?? son(x.hajm) ?? 0; qty += h;
      if (birlik[i] != null) amt += son(x.certified_amount) ?? son(x.summa) ?? h * birlik[i]!;
    });
    const aralash = narxsizSoni > 0;
    let narx: number | null;
    if (!aralash && new Set(narxli).size === 1 && Math.abs(qty * narxli[0] - amt) < 0.005) narx = narxli[0];
    else narx = Math.abs(qty) > 1e-12 ? amt / qty : !aralash && new Set(narxli).size === 1 ? narxli[0] : null;
    out.set(id, { narx, aktlar, aralash: aralash && narx != null, soni, narxsizSoni, ...(qatorIdlar.length ? { qatorIdlar } : {}) });
  }
  return out;
}

/**
 * fakt_yoz_v2 qatori: F2 narxi bilan — narx + manba; F2 da narx yo'q (bl/rs) — narx_yoq (hajm yoziladi, summa yo'q).
 * rs qatori server tomonida faqat narx_manba='f2_sertifikat' bilan qabul qilinadi (T2-FAKT-F2-RS-001).
 */
export type FaktF2PaketQator = { qator_id: number; hajm: number; manba_akt_qator_id?: number; narx?: number; narx_yoq?: true; narx_manba?: 'f2_sertifikat'; narx_manba_id?: number; narx_izoh?: string };
/** Narx manbasi: F2 narxi / smeta narxi (F2 da narx yo'q) / narxsiz (summa noma'lum yoki F2 bo'yicha narxsiz). */
export type TenglashNarxManba = 'f2' | 'smeta' | 'narxsiz';
/**
 * Reja konteksti: F2 narxlari (qator → F2Narx), smeta narxi (holat smeta_narx yo'q bo'lsa — daraxt qatori narxi) va
 * qatorning O'Z (DIRECT) fakti — bekor qilinmagan fakt hujjatlari yig'indisi. directFakt berilsa rs (mehnat/mashina)
 * ham ko'zgulanadi: delta = F2 − o'z fakti (view rs uchun o'z fakti bo'lsa hosilani olmaydi).
 */
export type TenglashKontekst = {
  f2Narx?: ReadonlyMap<number, F2Narx>; smetaNarx?: (id: number) => number | null; directFakt?: ReadonlyMap<number, number>;
  /**
   * Qatorma-qator nusxa (L0 2026-10-29, egasining yuridik qoidasi): qator → tasdiqlangan F2 satrlari; 
usxalangan — faol
   * fakt hujjatlariga allaqachon ko'chirilgan F2 satrlari (manba_akt_qator_id); qolda — qatorning f2_sertifikat bo'lmagan
   * (qo'lda) fakti; 2Delta — manbasiz f2_sertifikat fakti (eski yig'ma usul). Qo'lda/yig'ma fakti yo'q qator — har F2
   * satri o'z fakt qatoriga 1:1; bor bo'lsa — yig'ma farq (F2 − fakt).
   */
  f2Satrlar?: ReadonlyMap<number, readonly F2AktQator[]>; nusxalangan?: ReadonlySet<number>;
  qolda?: ReadonlyMap<number, number>; f2Delta?: ReadonlyMap<number, number>;
};
/** Bitta F2 satri → bitta fakt qatori (server hajm/narx/summani manbadan AYNAN oladi). */
export type NusxaSatr = { manba: number; akt: number; hajm: number; summa: number | null };

export type BekorNatija = { ok: boolean; error?: string };
export type AktBekorFn = (aktId: number) => Promise<BekorNatija>;
/** Oldin (F2 narxisiz, smeta narxida) yozilgan «Fakt = F2» hujjati — bekor qilib qayta yozish taklif qilinadi. */
export type EskiF2Akt = { id: number; raqam: string | null; sana: string | null; jami: number | null };
export type TenglashOyna = { sarlavha: string; reja: TenglashReja; eskiAktlar?: readonly EskiF2Akt[] };

/** Fakt = F2 hujjatini bekor qilish (akt_bekor) — faqat shu hujjat, smeta qatorlariga tegmaydi. */
export const faktF2Bekor: AktBekorFn = async (aktId) => {
  const r = await sbT2AktBekor(aktId, 'Fakt = F2 bekor qilindi');
  return { ok: !!r.ok, error: (r as { error?: string }).error };
};

export type TenglashHolat = JurnalHolat;

export type TenglashQator = {
  id: number; tur: JurnalQator['tur']; nom: string; birlik: string | null;
  fakt: number; f2: number; delta: number; narx: number | null; summa: number | null;
  /** Shu ish ostidagi mehnat/mashina qatorlari soni (norma bo'yicha ergashadi, alohida yozilmaydi). */
  avtomatik: number;
  /** Bo'lim nomi (obyekt bo'yicha reja — oldindan ko'rishda bo'lim jamisi va bo'limni istisno qilish uchun). */
  bolim?: string | null;
  /** Ustamali summa uchun kategoriya kesimi (ustamasiz summa kat bo'yicha; narx noma'lum — nomalum). */
  kesim?: KatKesim;
  /** Narx manbasi (oldindan ko'rish hisoboti). Berilmasa — summa bo'yicha (smeta/narxsiz). */
  narxManba?: TenglashNarxManba;
  /** F2 narxi olingan tasdiqlangan F2 aktlari (narxManba='f2'). */
  aktlar?: readonly number[];
  /** Manba F2 akt qatorlari (t2_akt_qator.id) — iz. */
  f2Qatorlar?: readonly number[];
  /** F2 bo'yicha narxsiz (bl/rs) — narx_yoq bilan yuboriladi: hajm yoziladi, summa yo'q (smeta narxi to'qilmaydi). */
  narxYoq?: boolean;
  /** Shu ish ostidagi F2 da yo'q mehnat/mashina (rs) — norma bo'yicha smeta narxida ergashadi (soni, summa; summa ish summasida). */
  rsHosila?: { soni: number; summa: number | null };
  /** Qatorma-qator nusxa: har F2 satri → o'z fakt qatori (bo'lsa, delta = Σ hajm, summa = Σ F2 summa). */
  nusxa?: readonly NusxaSatr[];
  /** Qisman narxli F2 (soni qatordan narxsizSoni tasida narx yo'q): narx = Σ narxli summa / Σ barcha hajm. */
  qisman?: { soni: number; narxsizSoni: number };
};

export type TenglashReja = {
  qatorlar: TenglashQator[];
  /** fakt_yoz_v2 paketi: faqat musbat delta; F2 narxi bo'lsa — narx + manba. */
  paket: FaktF2PaketQator[];
  jamiSumma: number;
  narxsiz: number;
  otkazildi: { manfiyReja: number; f2Yoq: number };
  /** Fakt F2 dan ko'p (topshirilmagan ish) — faqat signal: qator va ortiq summa (fakt − F2; noma'lum — null). */
  faktOrtiq: { id: number; ortiq: number | null }[];
};

const son = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Yuboriladigan qator: F2 narxi bo'lsa narx; F2 bo'yicha narxsiz (bl/rs) — narx_yoq; ikkalasida ham narx_manba=
 * 'f2_sertifikat', narx_manba_id (bitta akt), narx_izoh (akt raqamlari). Smeta narxiga tushgan qator — faqat hajm.
 */
export function paketQator(q: Pick<TenglashQator, 'id' | 'delta' | 'narx' | 'narxManba' | 'aktlar' | 'narxYoq' | 'qisman' | 'f2Qatorlar'>): FaktF2PaketQator {
  const p: FaktF2PaketQator = { qator_id: q.id, hajm: q.delta };
  const f2Narxli = q.narxManba === 'f2' && q.narx != null;
  if (!f2Narxli && !q.narxYoq) return p;
  const aktlar = q.aktlar ?? [];
  if (f2Narxli) p.narx = q.narx as number; else p.narx_yoq = true;
  p.narx_manba = 'f2_sertifikat';
  if (aktlar.length === 1) p.narx_manba_id = aktlar[0];
  const nomer = aktlar.map((a) => `№${a}`).join(', ');
  const iz = q.f2Qatorlar?.length ? ` [qator: ${q.f2Qatorlar.join(', ')}]` : '';
  p.narx_izoh = ((q.narxYoq ? `Fakt = F2: F2 ${nomer} da narx yo'q` : q.qisman ? `Fakt = F2: F2 ${nomer} — qisman narxli F2: ${q.qisman.soni} qatordan ${q.qisman.narxsizSoni} tasida narx yo'q` : aktlar.length > 1 ? `Fakt = F2: F2 ${nomer} — hajm bo'yicha o'rtacha narx` : `Fakt = F2: F2 ${nomer} narxi`) + iz).slice(0, 480);
  return p;
}

/** Reja qatori → fakt_yoz_v2 qatorlari: 1:1 nusxada har F2 satri alohida (manba_akt_qator_id), aks holda bitta yig'ma qator. */
export function paketQatorlar(q: Parameters<typeof paketQator>[0] & Pick<TenglashQator, 'nusxa'>): FaktF2PaketQator[] {
  if (!q.nusxa?.length) return [paketQator(q)];
  return q.nusxa.map((x) => ({ qator_id: q.id, hajm: x.hajm, manba_akt_qator_id: x.manba, narx_manba: 'f2_sertifikat' as const, narx_manba_id: x.akt,
    narx_izoh: `Fakt = F2: F2 №${x.akt} qatori #${x.manba}` }));
}
/**
 * Ko'zgulanadigan qator hajmi (egasi 2026-10-29: tasdiqlangan F2 — muhrlangan hujjat, har qatori ishorasi bilan aynan
 * ko'chiriladi): farq = F2 − o'z fakti, F2 tomon — F2 musbat bo'lsa oshiradi, F2 manfiy bo'lsa (minus norma, sof manfiy
 * F2) manfiy yoziladi. Fakt F2 dan oshib ketgan (qo'lda kiritilgan, topshirilmagan ish) — o'zgartirilmaydi (null, signal).
 */
const farqOl = (f2: number, fakt: number): number | null => {
  const d = yaxlit(f2 - fakt);
  return (d > 1e-9 && f2 > 1e-9) || (d < -1e-9 && f2 < -1e-9) ? d : null;
};

type SummaNatija = { narx: number | null; summa: number | null; kesim: KatKesim; narxManba: TenglashNarxManba; aktlar?: readonly number[]; f2Qatorlar?: readonly number[]; narxYoq?: boolean; rsHosila?: { soni: number; summa: number | null }; qisman?: { soni: number; narxsizSoni: number } };

/**
 * Qator summasi (ustamasiz, NDS siz) — serverda yoziladigan summa bilan aynan bir xil qoida:
 *  - qatorning o'zi: delta × narx; narx = F2 narxi ?? (F2 da narx yo'q: bl/rs — narx_yoq, summa yo'q; mat/ob — smeta
 *    narxi: server ham narx yuborilmasa coalesce(narx, smeta narxi)); hech biri yo'q — NULL (0 to'qilmaydi);
 *  - ish (bl): F2 dan ko'chirilgan (narx_manba='f2_sertifikat') ish ulushi rs hosilasini BERMAYDI (t2_qator_holat v5:
 *    hosila = (bl fakti − f2_sertifikat fakti) × norma) — o'sha ulushning rs'i F2 dagi aniq rs qatorlaridan keladi.
 *    F2 manbasisiz ish (kontekstsiz) — avvalgidek ergashadigan rs: delta × norma × rs smeta narxi.
 */
function summaHisob(q: JurnalQator, ish: JurnalIsh | null, delta: number, holat: ReadonlyMap<number, TenglashHolat>, ktx: TenglashKontekst,
  ozgacha: (r: JurnalQator) => boolean): SummaNatija {
  const kesim = bosKatKesim();
  const smetaNarx = (id: number) => ktx.smetaNarx?.(id) ?? son(holat.get(id)?.smeta_narx);
  const f2 = ktx.f2Narx?.get(q.id);
  const f2n = f2?.narx ?? null;
  const narxYoq = !!f2 && f2n == null && (q.tur === 'bl' || q.tur === 'rs');
  const narx = narxYoq ? null : f2n ?? smetaNarx(q.id);
  const oz = narx == null ? null : yaxlit(delta * narx);
  const f2Manbali = f2n != null || narxYoq;
  const ergash = ish && !f2Manbali ? ish.avtomatik.filter((r) => r.otaId === ish.id && r.norma != null && !ozgacha(r)) : [];
  let summa: number | null = oz;
  let rsHosila: SummaNatija['rsHosila'];
  if (ergash.length) {
    if (oz != null) katKesimgaQosh(kesim, q.kat, oz);
    rsHosila = { soni: 0, summa: null };
    for (const r of ergash) {
      const rn = smetaNarx(r.id);
      const v = rn == null ? null : yaxlit(delta * (r.norma as number) * rn);
      katKesimgaQosh(kesim, r.kat, v);
      rsHosila.soni += 1;
      if (v != null) { summa = (summa ?? 0) + v; rsHosila.summa = yaxlit((rsHosila.summa ?? 0) + v); }
    }
  } else if (!narxYoq) katKesimgaQosh(kesim, q.kat, oz);
  const narxManba: TenglashNarxManba = f2n != null ? 'f2' : narxYoq ? 'narxsiz' : summa != null ? 'smeta' : 'narxsiz';
  return { narx, summa: summa == null ? null : yaxlit(summa), kesim, narxManba, aktlar: f2 ? f2.aktlar : undefined, f2Qatorlar: f2?.qatorIdlar, narxYoq, rsHosila,
    ...(f2n != null && f2?.aralash ? { qisman: { soni: f2.soni ?? 0, narxsizSoni: f2.narxsizSoni ?? 0 } } : {}) };
}

export function faktF2Reja(ishlar: readonly JurnalIsh[], holat: ReadonlyMap<number, TenglashHolat>, bolim: string | null = null, ktx: TenglashKontekst = {}): TenglashReja {
  const qatorlar: TenglashQator[] = [];
  let manfiyReja = 0, f2Yoq = 0;
  const faktOrtiq: TenglashReja['faktOrtiq'] = [];
  const korildi = new Set<number>();
  const smetaHajm = (q: JurnalQator) => son(holat.get(q.id)?.smeta_hajm) ?? q.smeta ?? 0;
  /** Qatorning o'z fakti: rs uchun DIRECT (directFakt), qolganlari holat fakt_hajm (bl/mat/ob da u DIRECT). */
  const faktOl = (q: JurnalQator) => (q.tur === 'rs' ? ktx.directFakt?.get(q.id) ?? 0 : son(holat.get(q.id)?.fakt_hajm) ?? 0);
  /** rs shu rejada o'zi yoziladimi (keyin u ishga ergashmaydi) yoki o'z fakti bormi (hozir ham ergashmaydi). */
  const rsOzgacha = (r: JurnalQator) => {
    if (!ktx.directFakt) return false;
    if (Math.abs(ktx.directFakt.get(r.id) ?? 0) > 1e-9) return true;
    if (ktx.f2Satrlar?.get(r.id)?.length) return true;
    return farqOl(son(holat.get(r.id)?.f2_hajm) ?? 0, 0) != null;
  };
  for (const ish of ishlar) {
    const rsLar = ktx.directFakt ? ish.avtomatik : [];
    for (const q of [ish as JurnalQator, ...ish.resurslar, ...rsLar]) {
      if (korildi.has(q.id)) continue;
      korildi.add(q.id);
      const h = holat.get(q.id);
      const f2 = son(h?.f2_hajm) ?? 0;
      const fakt = faktOl(q);
      const manfiy = smetaHajm(q) < 0;
      const oz0 = q === (ish as JurnalQator);
      // 1:1 nusxa: qatorda qo'lda / yig'ma fakt yo'q — har ko'chirilmagan F2 satri o'z fakt qatoriga.
      if (ktx.f2Satrlar && Math.abs(ktx.qolda?.get(q.id) ?? 0) <= 1e-9 && Math.abs(ktx.f2Delta?.get(q.id) ?? 0) <= 1e-9) {
        const nusxa: NusxaSatr[] = [];
        for (const x of ktx.f2Satrlar.get(q.id) ?? []) {
          const id = Number(x.id); if (!Number.isSafeInteger(id) || ktx.nusxalangan?.has(id)) continue;
          const hj = son(x.certified_quantity) ?? son(x.hajm) ?? 0; const sm = son(x.certified_amount) ?? son(x.summa);
          if (Math.abs(hj) <= 1e-12 && (sm == null || sm === 0)) continue;
          nusxa.push({ manba: id, akt: Number(x.akt_id), hajm: hj, summa: sm });
        }
        if (!nusxa.length) { if (manfiy) manfiyReja += 1; if (Math.abs(f2) <= 1e-9) f2Yoq += 1; continue; }
        const malum = nusxa.filter((x) => x.summa != null);
        const summa = malum.length ? yaxlit(malum.reduce((a, x) => a + (x.summa as number), 0)) : null;
        const kesim = bosKatKesim(); katKesimgaQosh(kesim, q.kat, summa);
        const f2n = ktx.f2Narx?.get(q.id);
        qatorlar.push({
          id: q.id, tur: q.tur, nom: q.nom, birlik: q.birlik, fakt, f2, delta: yaxlit(nusxa.reduce((a, x) => a + x.hajm, 0)), narx: f2n?.narx ?? null,
          summa, avtomatik: oz0 ? ish.avtomatik.length : 0, bolim, kesim, narxManba: summa != null ? 'f2' : 'narxsiz',
          aktlar: [...new Set(nusxa.map((x) => x.akt))].sort((a, b) => a - b), nusxa,
          ...(f2n?.aralash ? { qisman: { soni: f2n.soni ?? 0, narxsizSoni: f2n.narxsizSoni ?? 0 } } : {}),
        });
        continue;
      }
      const delta = farqOl(f2, fakt);
      if (delta == null) {
        if (manfiy) manfiyReja += 1;
        if (Math.abs(f2 - fakt) > 1e-9 && Math.abs(fakt) > 1e-9) { const fs = son(h?.fakt_summa), f2s = son(h?.f2_summa); faktOrtiq.push({ id: q.id, ortiq: fs == null ? null : yaxlit(fs - (f2s ?? 0)) }); }
        if (Math.abs(f2) <= 1e-9) f2Yoq += 1;
        continue;
      }
      const oz = q === (ish as JurnalQator);
      const s = summaHisob(q, oz && ish.tur === 'bl' ? ish : null, delta, holat, ktx, rsOzgacha);
      qatorlar.push({
        id: q.id, tur: q.tur, nom: q.nom, birlik: q.birlik, fakt, f2, delta, narx: s.narx,
        summa: s.summa, avtomatik: oz ? ish.avtomatik.length : 0, bolim, kesim: s.kesim,
        narxManba: s.narxManba, ...(s.aktlar ? { aktlar: s.aktlar } : {}), ...(s.f2Qatorlar ? { f2Qatorlar: s.f2Qatorlar } : {}), ...(s.narxYoq ? { narxYoq: true } : {}),
        ...(s.rsHosila ? { rsHosila: s.rsHosila } : {}), ...(s.qisman ? { qisman: s.qisman } : {}),
      });
    }
  }
  return rejaYasa(qatorlar, manfiyReja, f2Yoq, faktOrtiq);
}

function rejaYasa(qatorlar: TenglashQator[], manfiyReja: number, f2Yoq: number, faktOrtiq: TenglashReja['faktOrtiq']): TenglashReja {
  return {
    qatorlar,
    paket: qatorlar.flatMap(paketQatorlar),
    jamiSumma: yaxlit(qatorlar.reduce((s, x) => s + (x.summa ?? 0), 0)),
    narxsiz: qatorlar.filter((x) => x.summa == null).length,
    otkazildi: { manfiyReja, f2Yoq }, faktOrtiq,
  };
}

/**
 * BUTUN OBYEKT bo'yicha «Fakt = F2» (egasi 2026-10-26: «fakt qilingan ishni tez hisoblab F2 qilib Nakopitelniy'ga»):
 * har bo'lim O'Z ishlari (avlodlarisiz — har ish bir marta) + bo'limsiz ishlar. Qator bo'lim nomi bilan belgilanadi.
 * Farq F2 tomon, ishorasi bilan (F2 manfiy bo'lsa manfiy); fakt F2 dan oshgan qator o'zgartirilmaydi.
 */
export function obyektF2Reja(guruhlar: readonly { nom: string; ishlar: readonly JurnalIsh[] }[], holat: ReadonlyMap<number, TenglashHolat>, ktx: TenglashKontekst = {}): TenglashReja {
  const qatorlar: TenglashQator[] = []; let manfiy = 0, f2Yoq = 0; const bor = new Set<number>();
  const faktOrtiq: TenglashReja['faktOrtiq'] = []; const bor2 = new Set<number>();
  for (const g of guruhlar) {
    const r = faktF2Reja(g.ishlar, holat, g.nom, ktx);
    for (const q of r.qatorlar) if (!bor.has(q.id)) { bor.add(q.id); qatorlar.push(q); }
    manfiy += r.otkazildi.manfiyReja; f2Yoq += r.otkazildi.f2Yoq;
    for (const x of r.faktOrtiq) if (!bor2.has(x.id)) { bor2.add(x.id); faktOrtiq.push(x); }
  }
  return rejaYasa(qatorlar, manfiy, f2Yoq, faktOrtiq);
}

export type TenglashBolimJami = { nom: string; soni: number; ustamasiz: number | null; kesim: KatKesim; narxsiz: number };
export type TenglashJami = {
  paket: FaktF2PaketQator[];
  ustamasiz: number | null; kesim: KatKesim; narxsiz: number;
  /** Narx manbasi bo'yicha qator soni: F2 narxi / smeta narxi (F2 da narx yo'q). Narxsiz — `narxsiz`. */
  f2Narxli: number; smetaNarxli: number;
  /** F2 da yo'q mehnat/mashina (rs) — ishga norma bo'yicha smeta narxida ergashadi (soni, summa; summa jamiga kirgan). */
  rsHosila: { soni: number; summa: number | null };
  /** Qisman narxli F2 qatorlari soni (narx = Σ narxli summa / Σ barcha hajm). */
  qisman: number;
  /** Istisno qilingan mehnat/mashina (rs): F2 dan ko'chirilgan ish ulushiga ergashmaydi — faktga tushmaydi (soni, ko'rilmagan summa). */
  rsIstisno: { soni: number; summa: number | null };
  /** 1:1 nusxa: shuncha F2 satri → shuncha fakt qatori. */
  nusxaSoni: number;
  /** Manfiy hajmli qatorlar (F2 dagi minus — aynan ko'chiriladi): soni, ma'lumot uchun. */
  manfiySoni: number;
  /** Fakt F2 dan ko'p — signal (soni, ortiq summa). */
  faktOrtiq: { soni: number; summa: number | null };
  /** Bo'lim bo'yicha jami (rejadagi tartibda; istisno qilingan bo'lim ham ko'rinadi — soni 0). */
  bolimlar: TenglashBolimJami[];
};

const kesimQosh = (a: KatKesim, b: KatKesim | undefined) => {
  if (!b) return;
  for (const [k, v] of Object.entries(b.summalar) as [keyof KatKesim['summalar'], number][]) a.summalar[k] = (a.summalar[k] ?? 0) + v;
  a.nomalum += b.nomalum; a.nomalumSoni += b.nomalumSoni; a.summasizSoni += b.summasizSoni;
};

/** Istisnolardan (qator id yoki bo'lim nomi) keyingi paket va jamilar — sof, 25k qatorda chiziqli. */
export function tenglashJami(reja: TenglashReja, chiqQator: ReadonlySet<number>, chiqBolim: ReadonlySet<string>): TenglashJami {
  const paket: TenglashJami['paket'] = [];
  const kesim = bosKatKesim(); let ustamasiz: number | null = null; let narxsiz = 0; let f2Narxli = 0; let smetaNarxli = 0;
  const rsHosila = { soni: 0, summa: null as number | null }; let qisman = 0; let nusxaSoni = 0;
  const rsIstisno = { soni: 0, summa: null as number | null };
  const bm = new Map<string, TenglashBolimJami>();
  for (const q of reja.qatorlar) {
    const nom = q.bolim ?? '';
    let b = bm.get(nom); if (!b) { b = { nom, soni: 0, ustamasiz: null, kesim: bosKatKesim(), narxsiz: 0 }; bm.set(nom, b); }
    if (chiqQator.has(q.id) || chiqBolim.has(nom)) {
      if (q.tur === 'rs') { rsIstisno.soni += 1; if (q.summa != null) rsIstisno.summa = yaxlit((rsIstisno.summa ?? 0) + q.summa); }
      continue;
    }
    if (q.qisman && q.narxManba === 'f2') qisman += 1;
    paket.push(...paketQatorlar(q));
    b.soni += 1;
    if (q.summa == null) { narxsiz += 1; b.narxsiz += 1; }
    else { ustamasiz = (ustamasiz ?? 0) + q.summa; b.ustamasiz = (b.ustamasiz ?? 0) + q.summa; }
    if (q.nusxa) nusxaSoni += q.nusxa.length;
    if (q.narxManba === 'f2' && (q.narx != null || q.nusxa)) f2Narxli += 1; else if (q.summa != null) smetaNarxli += 1;
    if (q.rsHosila) { rsHosila.soni += q.rsHosila.soni; if (q.rsHosila.summa != null) rsHosila.summa = yaxlit((rsHosila.summa ?? 0) + q.rsHosila.summa); }
    kesimQosh(kesim, q.kesim); kesimQosh(b.kesim, q.kesim);
  }
  for (const b of bm.values()) if (b.ustamasiz != null) b.ustamasiz = yaxlit(b.ustamasiz);
  const yig = (xs: readonly (number | null)[]) => xs.reduce<number | null>((a, v) => (v == null ? a : yaxlit((a ?? 0) + v)), null);
  return { paket, ustamasiz: ustamasiz == null ? null : yaxlit(ustamasiz), kesim, narxsiz, f2Narxli, smetaNarxli, rsHosila, qisman, rsIstisno, nusxaSoni,
    manfiySoni: paket.filter((x) => x.hajm < 0).length,
    faktOrtiq: { soni: reja.faktOrtiq.length, summa: yig(reja.faktOrtiq.map((x) => x.ortiq)) },
    bolimlar: [...bm.values()] };
}

/** Bo'lim (va ixtiyoriy ichki bo'limlar) ishlari. `bolimIshlari` — jurnalQur natijasi; `ichkilar` — bo'lim id → ichki bo'limlar id. */
export function bolimIshlariYigish(
  bolimId: number,
  bolimIshlari: ReadonlyMap<number, JurnalIsh[]>,
  bolalar: ReadonlyMap<number, readonly number[]>,
  ichkiBilan: boolean,
): JurnalIsh[] {
  const out: JurnalIsh[] = [];
  const yur = (id: number) => {
    out.push(...(bolimIshlari.get(id) ?? []));
    if (ichkiBilan) for (const c of bolalar.get(id) ?? []) yur(c);
  };
  yur(bolimId);
  return out;
}
