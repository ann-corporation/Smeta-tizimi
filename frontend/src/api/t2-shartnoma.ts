/**
 * t2-shartnoma.ts — ШАРТНОМА (dogovor) + НАКРУТКА, 2026-08-25
 * ═══════════════════════════════════════════════════════════════════
 *
 * Ko'chirildi: `Smeta tizimi/80_Shartnoma.js`.
 *
 * ⚠️ НАКРУТКА — smeta "toza" narxini shartnoma/buxgalteriya uchun
 * "устама bilan" narxga aylantiradigan CHIZIQLI formula zanjiri.
 * Bu ikkinchi narx — "ikki narx falsafasi" (накрутка vs CONSTANTA).
 * Hisob-kitob BAZADA (`t2_nakrutka_hisob`) — frontend faqat ko'rsatadi.
 *
 * ⚠️ Alohida faylda — `supabase.ts` umumiy fayl.
 */
import { sbOqi } from './supabase';
import { trackEntityCommand } from './entity-consistency';

/* ── Shartnoma ────────────────────────────────────────────────────── */
export type Shartnoma = {
  id: number; kompaniya_id: number; raqam: string;
  nom: string | null; taraf: string | null;
  summa_bez_nds: number | null; nds: number | null; jami_nds_bilan: number | null;
  holat: 'faol' | 'yopilgan' | 'bekor';
  chel_stavka: number | null; izoh: string | null;
  versiya: number; yaratildi: string; yangilandi: string; kim: string | null;
  loyiha_id: number | null;
  /**
   * ЗАКАЗЧИК — egasi (2026-09-28): "eng baland iyerarxiyada — tomonlar
   * bog'langanida hal qilinadigan narsa". KANONIK yo'l: `t2_kompaniya`
   * registriga bog'lanish (rekvizit BIR MARTA o'sha kompaniya profilida
   * kiritiladi, hamma shartnoma/F3 shu bog'lanishdan o'qiydi). Matn
   * maydonlari faqat ZAXIRA — kompaniya hali ro'yxatga olinmagan bo'lsa.
   */
  zakazchik_kompaniya_id: number | null;
  zakazchik_toliq_nom: string | null; zakazchik_manzil: string | null; zakazchik_telefon: string | null;
  zakazchik_hisob_raqam: string | null; zakazchik_bank: string | null; zakazchik_mfo: string | null;
  zakazchik_inn: string | null; zakazchik_oked: string | null;
};

/** F3 titulida ishlatiladigan ЗАКАЗЧИК rekvizitlari to'plami (qisqa nom). */
export type ZakazchikRekvizit = {
  toliqNom?: string | null; manzil?: string | null; telefon?: string | null;
  hisobRaqam?: string | null; bank?: string | null; mfo?: string | null;
  inn?: string | null; oked?: string | null;
};

/** `t2_kompaniya` (registr) dagi rekvizit maydonlari — pudratchi va bog'langan zakazchik uchun bir xil shakl. */
export type KompaniyaRekvizitManbasi = {
  toliq_nom: string | null; manzil: string | null; telefon: string | null;
  hisob_raqam: string | null; bank: string | null; mfo: string | null;
  inn: string | null; oked: string | null;
};

/**
 * ЗАКАЗЧИК rekvizitini aniqlaydi: KANONIK yo'l — `zakazchik_kompaniya_id`
 * bog'lanган bo'lsa, kompaniya registridagi rekvizit (bitta joyda kiritilgan,
 * barcha shartnomalar bo'ylab qayta ishlatiladi). Bog'lanmagan bo'lsa —
 * shartnomaning o'z (zaxira) matn maydonlari. Ikkalasi ham bo'sh — `{}`
 * (hujjatda chiziq emas, qator o'zi ko'rinmaydi — `forma3-export.ts`).
 */
export function zakazchikRekvizit(
  sh: Pick<Shartnoma, 'zakazchik_kompaniya_id' | 'zakazchik_toliq_nom' | 'zakazchik_manzil' | 'zakazchik_telefon' | 'zakazchik_hisob_raqam' | 'zakazchik_bank' | 'zakazchik_mfo' | 'zakazchik_inn' | 'zakazchik_oked'> | null | undefined,
  kompaniyaOl: (id: number) => KompaniyaRekvizitManbasi | undefined,
): ZakazchikRekvizit {
  if (!sh) return {};
  if (sh.zakazchik_kompaniya_id != null) {
    const k = kompaniyaOl(sh.zakazchik_kompaniya_id);
    if (k) return { toliqNom: k.toliq_nom, manzil: k.manzil, telefon: k.telefon, hisobRaqam: k.hisob_raqam, bank: k.bank, mfo: k.mfo, inn: k.inn, oked: k.oked };
  }
  return {
    toliqNom: sh.zakazchik_toliq_nom, manzil: sh.zakazchik_manzil, telefon: sh.zakazchik_telefon,
    hisobRaqam: sh.zakazchik_hisob_raqam, bank: sh.zakazchik_bank, mfo: sh.zakazchik_mfo,
    inn: sh.zakazchik_inn, oked: sh.zakazchik_oked,
  };
}

/* ⚠️ 2026-08-28 (Claude) — TENANT IZOLYATSIYASI TUZATILDI.
 *
 * Avval bu funksiya kompaniya bo'yicha UMUMAN filtrlamasdi va BARCHA
 * kompaniyalarning shartnomalarini o'qirdi. Auditda aniqlandi: sklad,
 * kadr, texnika, kontragent, loyiha — hammasi `kompaniya_id=eq.N`
 * bilan filtrlaydi, FAQAT shartnoma istisno edi.
 *
 * Bitta kompaniya bo'lgani uchun bu ko'rinmasdi, lekin ikkinchisi
 * qo'shilishi bilan bir mijoz boshqasining shartnomalarini ko'rardi.
 *
 * `kompaniyaId` endi MAJBURIY — ixtiyoriy qilinса, chaqiruvchi uni
 * berishni unutadi va xato jimgina qaytadi.
 */
export function sbT2ShartnomalarOl(kompaniyaId: number, faqatFaol = true) {
  const filtrlar = ['kompaniya_id=eq.' + kompaniyaId];
  if (faqatFaol) filtrlar.push('holat=eq.faol');
  return sbOqi<Shartnoma>({
    jadval: 't2_shartnoma',
    filtr: filtrlar.join('&'),
    tartib: 'raqam.asc', limit: 5000,
  });
}

/* ── Obyekt → shartnoma bog'lanishi ──────────────────────────────── */
export type ShartnomaBog = {
  id: number; obyekt_id: number; shartnoma_id: number;
  holat: 'faol' | 'bekor';
};

export function sbT2ShartnomaBogOl(obyektId: number) {
  return sbOqi<ShartnomaBog>({
    jadval: 't2_shartnoma_bog', filtr: 'obyekt_id=eq.' + obyektId + '&holat=eq.faol',
  });
}

/* ── Накрутка koeffitsientlari (bazadagi jadval — ko'rish uchun) ───── */
export type NakrutkaQator = {
  id: number; kompaniya_id: number; shartnoma_id: number | null;
  koef: string; qiymat: number; izoh: string | null; yangilandi: string;
};

/** shartnomaId=null → umumiy default. Berilsa — shu shartnomaning override'lari. */
export function sbT2NakrutkaOl(shartnomaId: number | null) {
  return sbOqi<NakrutkaQator>({
    jadval: 't2_nakrutka',
    filtr: shartnomaId == null ? 'shartnoma_id=is.null' : 'shartnoma_id=eq.' + shartnomaId,
    tartib: 'koef.asc',
  });
}

/* ── Qo'shimcha ishlar (smeta tashqarisidagi) ────────────────────── */
export type QoshimchaIsh = {
  id: number; shartnoma_id: number; kompaniya_id: number;
  nom: string; smeta: number | null; fakt: number; f2_olingan: number;
  izoh: string | null; versiya: number; yaratildi: string; yangilandi: string;
};

export function sbT2QoshimchaIshlarOl(shartnomaId: number) {
  return sbOqi<QoshimchaIsh>({
    jadval: 't2_qoshimcha_ish', filtr: 'shartnoma_id=eq.' + shartnomaId,
    tartib: 'nom.asc',
  });
}

/* ══════════════════════════════════════════════════════════════════
 * YOZISH — nomli amallar orqali (`/api/sb-yoz`)
 * ══════════════════════════════════════════════════════════════════ */

export type ShartnomaNatija = {
  ok: boolean; error?: string; xabar?: string; sabab?: string;
  shartnoma_id?: number; versiya?: number; holat?: string;
  obyekt_id?: number; yozildi?: number; daraja?: string;
  bordagi_versiya?: number; siz_yuborgan?: number;
  ms?: number;
};

async function yoz(yuk: Record<string, unknown>): Promise<ShartnomaNatija> {
  const t0 = performance.now();
  try {
    const r = await fetch('/api/sb-yoz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    });
    const j = (await r.json()) as ShartnomaNatija;
    return { ...j, ms: Math.round(performance.now() - t0) };
  } catch (e: any) {
    return { ok: false, error: 'Tarmoq: ' + (e?.message || String(e)),
             ms: Math.round(performance.now() - t0) };
  }
}

/** Shartnoma yaratadi yoki (raqam mos kelsa) yangilaydi. `kutilganVersiya` yangilashda kerak. */
/**
 * ⚠️ 2026-08-28: `kompaniyaId` qo'shildi va MAJBURIY qilindi.
 *
 * Avval u umuman uzatilmasdi. RPC (`t2_shartnoma_saqla`) `p_kompaniya_id`
 * ni qabul qiladi, lekin frontend hech qachon bermasdi — natijada
 * shartnoma qaysi kompaniyaga tegishli ekani TASODIFGA qolardi
 * (bitta kompaniya bo'lgani uchun to'g'ri chiqardi, ikkinchisi
 * qo'shilishi bilan buzilardi).
 */
export function sbT2ShartnomaSaqla(p: {
  kompaniyaId: number;
  raqam: string; nom?: string; taraf?: string;
  summaBezNds?: number; nds?: number; jamiNdsBilan?: number;
  chelStavka?: number; izoh?: string; kutilganVersiya?: number;
  /** ЗАКАЗЧИК: kanonik yo'l — `t2_kompaniya` registriga bog'lash (rekvizit bir marta shu yerda kiritiladi). */
  zakazchikKompaniyaId?: number | null;
  /** Zaxira matn rekvizitlari — faqat kompaniya hali ro'yxatga olinmaganda. Berilmagan maydon mavjudini o'zgartirmaydi. */
  zakazchik?: ZakazchikRekvizit;
}): Promise<ShartnomaNatija> {
  return trackEntityCommand('shartnoma', p.kompaniyaId, yoz({
    amal: 'shartnoma_saqla', kompaniya_id: p.kompaniyaId,
    raqam: p.raqam, nom: p.nom, taraf: p.taraf,
    summa_bez_nds: p.summaBezNds, nds: p.nds, jami_nds_bilan: p.jamiNdsBilan,
    chel_stavka: p.chelStavka, izoh: p.izoh, kutilgan_versiya: p.kutilganVersiya,
    zakazchik_kompaniya_id: p.zakazchikKompaniyaId,
    zakazchik_toliq_nom: p.zakazchik?.toliqNom, zakazchik_manzil: p.zakazchik?.manzil,
    zakazchik_telefon: p.zakazchik?.telefon, zakazchik_hisob_raqam: p.zakazchik?.hisobRaqam,
    zakazchik_bank: p.zakazchik?.bank, zakazchik_mfo: p.zakazchik?.mfo,
    zakazchik_inn: p.zakazchik?.inn, zakazchik_oked: p.zakazchik?.oked,
  }));
}

/** Shartnomani bekor qiladi (o'chirmaydi — tarix saqlanadi). */
export function sbT2ShartnomaOchir(shartnomaId: number, kutilganVersiya?: number): Promise<ShartnomaNatija> {
  return yoz({ amal: 'shartnoma_ochir', shartnoma_id: shartnomaId, kutilgan_versiya: kutilganVersiya });
}

/** Obyektni shartnomaga bog'laydi (bitta obyekt — bitta shartnoma). */
export function sbT2ShartnomaBogSaqla(obyektId: number, shartnomaId: number): Promise<ShartnomaNatija> {
  return yoz({ amal: 'shartnoma_bog_saqla', obyekt_id: obyektId, shartnoma_id: shartnomaId });
}

/**
 * Накрутка koeffitsientlarini saqlaydi.
 *
 * ⚠️ `shartnomaId` berilmasa UMUMIY DEFAULT yangilanadi — bu BARCHA
 * shartnomalarga ta'sir qiladi va faqat admin/superadmin bajara oladi.
 */
export function sbT2NakrutkaSaqla(p: {
  qatorlar: Array<{ koef: string; qiymat: number; izoh?: string }>;
  shartnomaId?: number | null;
}): Promise<ShartnomaNatija> {
  return yoz({ amal: 'nakrutka_saqla', qatorlar: p.qatorlar, shartnoma_id: p.shartnomaId ?? null });
}

/* ══════════════════════════════════════════════════════════════════
 * HISOB-KITOB (RPC to'g'ridan-to'g'ri, o'qish — yozish emas)
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Har obyekt uchun to'liq накрутка zanjiri.
 *
 * ⚠️ `t2_obyekt_nakrutka` — RPC EMAS, VIEW. Ataylab: yozish/o'qish
 * eshiklari faqat TABLE/VIEW larni biladi (`sb.ts` oq ro'yxati).
 * Ixtiyoriy RPC chaqirish uchun yangi endpoint kerak bo'lardi — yangi
 * xavfsizlik yuzasi. VIEW esa mavjud filtr bilan xavfsiz o'qiladi.
 */
export type ObyektNakrutka = {
  obyekt_id: number; shartnoma_id: number | null;
  chel: number; mash: number; mat: number; ob: number;
  pryamye: number; tr_mat: number; skl_mat: number; tr_kab: number;
  itogo1: number; prochie: number; itogo2: number;
  tr_ob: number; zag_ob: number; itogo3: number;
  strax: number; risk: number; itogo4: number; nds: number; vsego: number;
  kf_chel: number; kf_mash: number; kf_mat: number; kf_ob: number;
  kf_mk: number; kf_kab: number; kf_bezsklad: number;
};

export function sbT2ObyektNakrutkaOl(obyektId: number) {
  return sbOqi<ObyektNakrutka>({
    jadval: 't2_obyekt_nakrutka', filtr: 'obyekt_id=eq.' + obyektId,
  });
}
