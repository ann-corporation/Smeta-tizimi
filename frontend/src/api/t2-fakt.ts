import { yozAmali, sbOqi } from './supabase';
import { t2ToliqOqi, t2ToliqOqiParallel } from './t2-toliq-oqish';

/* ⚡ 2026-08-28 (Claude) — YURAK ORGANI: «nima bajarildi».
 *
 * Bazada 0 ta ФАКТ hujjati bor edi, chunki uni kiritadigan YO'L yo'q edi.
 * Natijada Ф2 tekshiriladigan asosga ega emasdi va pul zanjiri (to'lov,
 * debitor) umuman boshlanmasdi.
 *
 * Foydalanuvchi qarori: «ikkalasi ham bo'lishi kerak» — prorab kunlik ham,
 * PTO jamlab ham kirita olsin. Ikkalasi AYNI mexanizmga yozadi
 * (`t2_akt` tur='fakt'); farq faqat paket kattaligida:
 *     prorab  → kuniga bitta kichik hujjat  (F20260828-01)
 *     PTO     → oyiga bitta katta hujjat
 * Jamlash (`t2_qator_holat.fakt_hajm`) ikkalasini ham qo'shadi — hisob
 * mantig'i o'zgarmaydi.
 *
 * UCHINCHI YO'L: ko'zgu Google Sheets varag'idagi ФАКТ ustuni
 * (`sbFaktBelgila` — jami qiymat beriladi, tizim FARQNI yozadi).
 */

/** Bitta qator uchun kiritiladigan hajm. */
export type FaktQator = {
  qator_id: number;
  /** Bajarilgan hajm. Manfiy ham bo'lishi mumkin (ПЕРЕРАСЧЁТ — tuzatish). */
  hajm: number;
  izoh?: string;
  /** Qatorning o'z narxi (t2_akt_yarat: coalesce(narx, smeta narxi)) — «Fakt = F2»: tasdiqlangan F2 narxi. */
  narx?: number;
  /** «Fakt = F2» 1:1 nusxa: manba tasdiqlangan F2 akt qatori (server hajm/narx/summani undan aynan oladi). */
  manba_akt_qator_id?: number;
  /** Narx ataylab yo'q (F2 bo'yicha narxsiz): summa yozilmaydi, smeta narxi olinmaydi. */
  narx_yoq?: boolean;
  /** Narx manbasi (t2_akt_qator_narx_manba_check: smeta | f2_sertifikat | taminot | shartnoma | qol_nomalum). */
  narx_manba?: string;
  narx_manba_id?: number;
  narx_izoh?: string;
};

export type FaktNatija = {
  ok: boolean;
  akt_id?: number;
  raqam?: string;
  sana?: string;
  oy?: string;
  qator_soni?: number;
  narxsiz?: number;
  jami?: number;
  toliq?: boolean;
  /** Smetadan oshgan qatorlar. TO'SMAYDI — faqat ogohlantiradi. */
  ogohlantirish?: Array<{
    qator_id: number; nom: string; bor: number; qoshilmoqda: number; chegara: number;
  }> | null;
  ogohlantirish_soni?: number;
  izoh?: string;
  xabar?: string;
  takror?: boolean;
};

/**
 * ФАКТ kiritish — kunlik (prorab) yoki jamlab (PTO).
 *
 * `operationId` — takroriy yuborishdan himoya. Tarmoq uzilib qayta
 * yuborilsa ikkinchi hujjat YARATILMAYDI (chaqiruvchi UUID beradi —
 * serverda yasalsa qayta urinish yangi UUID bilan ketib, himoya yo'qolardi).
 */
export function sbFaktYoz(p: {
  obyektId: number;
  /** YYYY-MM-DD */
  sana: string;
  qatorlar: FaktQator[];
  izoh?: string;
  /** Berilmasa tizim sanadan yasaydi: F20260828-01 */
  raqam?: string;
  operationId?: string;
}) {
  return yozAmali({
    amal: 'fakt_yoz_v2',
    obyekt_id: p.obyektId,
    sana: p.sana,
    qatorlar: p.qatorlar,
    izoh: p.izoh,
    raqam: p.raqam,
    operation_id: p.operationId,
  }) as Promise<FaktNatija & { error?: string; code?: string }>;
}

/**
 * Ko'zgu varaq uchun: qatorning ФАКТ **jami** qiymatini belgilaydi.
 * Tizim hozirgi jamini o'qib, FARQNI hujjat qilib yozadi.
 *
 * Masalan bazada 3 turgan bo'lsa va 8 berilsa → «+5 bajarildi» yoziladi.
 * Kamaytirish ham mumkin (manfiy farq — ПЕРЕРАСЧЁТ).
 */
export function sbFaktBelgila(p: {
  qatorId: number;
  yangiJami: number;
  /** YYYY-MM-DD; berilmasa bugungi sana. */
  sana?: string;
}) {
  return yozAmali({
    amal: 'fakt_belgila',
    qator_id: p.qatorId,
    yangi_jami: p.yangiJami,
    sana: p.sana,
  }) as Promise<FaktNatija & {
    ozgarmadi?: boolean; oldingi_jami?: number; yangi_jami?: number; farq?: number;
    error?: string;
  }>;
}

/**
 * Saytning kanonik Fakt jami tahriri.
 *
 * Bu ko'zgu/legacy `fakt_belgila` yo'li emas: server qatorning joriy
 * qiymatini `expectedFaktHajm` bilan solishtiradi, farqni kanonik Fakt
 * hujjati sifatida yozadi va eskirgan brauzer qiymatini FAKT_CONFLICT bilan
 * rad etadi.
 */
export function sbFaktBelgilaV2(p: {
  obyektId: number;
  qatorId: number;
  expectedFaktHajm: number;
  yangiFaktHajm: number;
  /** YYYY-MM-DD */
  sana: string;
  operationId: string;
  izoh?: string;
}) {
  return yozAmali({
    amal: 'fakt_belgila_v2',
    obyekt_id: p.obyektId,
    qator_id: p.qatorId,
    expected_fakt_hajm: p.expectedFaktHajm,
    yangi_fakt_hajm: p.yangiFaktHajm,
    sana: p.sana,
    operation_id: p.operationId,
    izoh: p.izoh,
  }) as Promise<FaktNatija & {
    code?: string;
    current_fakt_hajm?: number;
    fakt_hajm?: number;
    unchanged?: boolean;
    error?: string;
  }>;
}

/* ── O'QISH: qator bo'yicha smeta / fakt / Ф2 holati ────────────────────── */

export type QatorHolat = {
  id: number; qator_id: number; obyekt_id: number;
  tur: string; kod: string | null; nom: string; birlik: string | null; kat: string | null;
  smeta_hajm: number | null; smeta_narx: number | null; smeta_summa: number | null;
  fakt_hajm: number; fakt_summa: number;
  f2_hajm: number; f2_summa: number;
  qoldiq_hajm: number | null; qoldiq_summa: number | null;
  /** Ф2 ga olish MUMKIN bo'lgan qoldiq = fakt − f2 (manfiy bo'lmaydi). */
  f2_mumkin_hajm: number; f2_mumkin_summa: number;
  /** Shu qatorning oldingi tasdiqlangan F2 narxi (view'da bor). */
  f2_narx?: number | null;
};

/**
 * Obyekt holati TO'LIQ (qator_id oynalari bilan, parallel). Avval bitta so'rov edi — server qator chegarasi katta obyektda
 * (masalan 11 942 qator) holatning bir qismini kesardi va F2 tayyorlash ishlarni taklif qilmasdi (egasi 2026-11-05, Amfiteatr).
 */
export function sbQatorHolatOl(obyektId: number) {
  return t2ToliqOqiParallel<QatorHolat>(sbOqi, {
    jadval: 't2_qator_holat',
    filtr: 'obyekt_id=eq.' + obyektId,
    limit: 200000,
  }, 'qator_id');
}

/** Tasdiqlanmagan (qoralama) F2 aktlaridagi hajmlar: qator_id -> jami hajm (ikki marta F2 qilish xavfini ko'rsatish uchun). */
/**
 * Natija to'liq bo'lmasa `ok: false` (QORALAMA_TAKROR himoyasi jim o'chmasin — audit 2026-11-06, A-14): ikkala o'qish ham
 * sahifalab (t2ToliqOqi; shlyuz bir chaqiruvda ~5k qator beradi).
 */
export async function sbF2QoralamaHajmlar(obyektId: number, istisnoAktId?: number | null): Promise<{ ok: boolean; hajm: Map<number, number>; aktSoni: number }> {
  const bosh = { ok: false, hajm: new Map<number, number>(), aktSoni: 0 };
  const a = await t2ToliqOqi<{ id: number }>(sbOqi, { jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.f2&holat=eq.qoralama`, ustunlar: 'id', limit: 20000 }, 'id'); // faqat F2 qoralamalari (fakt qoralamasi o'zini ayirmasin)
  if (!a.ok || a.toliq === false) return bosh;
  // Tahrirlanayotgan qoralamaning o'z hajmi «mumkin» dan ayirilmaydi (istisnoAktId).
  const ids = (a.qatorlar || []).map((x) => Number(x.id)).filter((x) => Number.isSafeInteger(x) && x !== istisnoAktId);
  if (!ids.length) return { ok: true, hajm: new Map(), aktSoni: 0 };
  const q = await t2ToliqOqi<{ id: number; qator_id: number; hajm: number | null; certified_quantity: number | null }>(sbOqi, { jadval: 't2_akt_qator', filtr: `akt_id=in.(${ids.join(',')})`, ustunlar: 'id,qator_id,hajm,certified_quantity', limit: 200000 }, 'id');
  if (!q.ok || q.toliq === false) return bosh;
  const hajm = new Map<number, number>();
  for (const x of q.qatorlar || []) hajm.set(x.qator_id, (hajm.get(x.qator_id) ?? 0) + Number(x.certified_quantity ?? x.hajm ?? 0));
  return { ok: true, hajm, aktSoni: ids.length };
}
