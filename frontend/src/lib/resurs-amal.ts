/**
 * Faktli ish ichidagi RESURS amallari (egasi 2026-10-27): «zamena» (boshqa resurs bilan almashtirish) va
 * «chiqarish» (resurs shu ishda ishlatilmadi — F2 ga kirmaydi). Sof qoidalar; yozuvlar mavjud RPC'lar orqali:
 *  - zamena  → `ish_abc_saqla_v1` (command 'resurs_zamena'), asl qator O'ZGARMAYDI, qoldiq yagona zamena-qoldiq qoidasi bilan yopiladi;
 *  - chiqarish → `bajarilmadi_belgila` (t2_qator_bajarilmadi), hajm = resursning TO'LIQ smeta hajmi + sabab. Asl smeta CONST.
 * ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ (ishchi mehnati, kat ЧЕЛ) zamena qilinmaydi va hozircha chiqarilmaydi ham
 * (egasi «zamena qilinmaydi» degan; chiqarish haqida qaror kutilmoqda).
 */
import { katAniqla } from './ish-abc';

/** Ishchi mehnati nomi (mashinistlar mehnati — МАШ, bu yerga kirmaydi). */
const MEHNAT_NOM = /^\s*ЗАТРАТЫ\s+ТРУДА\s+РАБОЧИХ/;
const MASHINIST = /МАШИНИСТ/;

export type ResursBelgi = { tur?: string | null; kat?: string | null; nom?: string | null; birlik?: string | null };

/** Ishchi mehnati (ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ, kat ЧЕЛ)mi? Mavjud kategoriya aniqlagichi (`katAniqla`) asosida. */
export function mehnatResursmi(q: ResursBelgi): boolean {
  if (q.tur === 'bl' || q.tur === 'rz') return false;
  const nom = String(q.nom ?? '').toUpperCase().replace(/Ё/g, 'Е');
  if (MASHINIST.test(nom)) return false;
  if (MEHNAT_NOM.test(nom)) return true;
  return katAniqla(q.kat, q.tur, q.birlik) === 'ЧЕЛ';
}

export const MEHNAT_ZAMENA_YOQ = 'Ishchi mehnati (ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ) zamena qilinmaydi — egasi qoidasi.';
export const MEHNAT_CHIQARISH_YOQ = 'Ishchi mehnatini ishdan chiqarib bo‘lmaydi (hozircha) — egasi qarori kutilmoqda.';

const EPS = 1e-9;

/**
 * Resurs ishdan CHIQARILGANmi: faol «bajarilmaydi» belgilari resursning butun smeta hajmini qoplaydi.
 * Smeta hajmi noma'lum (NULL) yoki 0 bo'lsa — chiqarilgan hisoblanmaydi (to'qilmaydi; NULL ≠ 0).
 */
export function chiqarilganmi(smeta: number | null | undefined, bajarilmaydi: number | null | undefined): boolean {
  if (smeta == null || !Number.isFinite(Number(smeta)) || bajarilmaydi == null || !Number.isFinite(Number(bajarilmaydi))) return false;
  const s = Math.abs(Number(smeta));
  return s > EPS && Number(bajarilmaydi) >= s - EPS;
}

/** Chiqarish uchun yoziladigan hajm — resursning to'liq smeta hajmi (manfiy chegirma qatorida modul). Noma'lum bo'lsa null. */
export function chiqarishHajmi(smeta: number | null | undefined): number | null {
  if (smeta == null || !Number.isFinite(Number(smeta)) || Math.abs(Number(smeta)) <= EPS) return null;
  return Math.round(Math.abs(Number(smeta)) * 1e6) / 1e6;
}

export type ResursAmalHolat = ResursBelgi & {
  /** Ota ish (bl) ichidami. */
  ishIchida: boolean;
  /** Qo'shilgan (qoshimcha) yoki o'zi zamena qatori — bular uchun tahrirlash/o'chirish bor, zamena/chiqarish yo'q. */
  qoshimcha?: boolean; zamena?: boolean;
  smeta: number | null;
  /** Resursning O'Z (to'g'ridan-to'g'ri kiritilgan) fakti; norma × ish faktidan hosila hisobga olinmaydi. */
  ozFakt?: number | null;
  /** Faol «bajarilmaydi» hajmi. */
  belgilangan?: number | null;
};

export type AmalRuxsat = { mumkin: true } | { mumkin: false; sabab: string };

/** Zamena tugmasi: ish ichidagi asl resurs, mehnat emas. */
export function zamenaRuxsat(q: ResursAmalHolat): AmalRuxsat {
  if (q.qoshimcha || q.zamena) return { mumkin: false, sabab: 'Qo‘shilgan/zamena qatorini tahrirlang yoki o‘chiring.' };
  if (mehnatResursmi(q)) return { mumkin: false, sabab: MEHNAT_ZAMENA_YOQ };
  return { mumkin: true };
}

/** Chiqarish tugmasi: ish ichidagi asl resurs, mehnat emas, smeta hajmi ma'lum, o'z fakti yo'q, boshqa faol belgi yo'q. */
export function chiqarishRuxsat(q: ResursAmalHolat): AmalRuxsat {
  if (!q.ishIchida) return { mumkin: false, sabab: 'Faqat ish ichidagi resurs chiqariladi.' };
  if (q.qoshimcha || q.zamena) return { mumkin: false, sabab: 'Qo‘shilgan/zamena qatorini tahrirlang yoki o‘chiring.' };
  if (mehnatResursmi(q)) return { mumkin: false, sabab: MEHNAT_CHIQARISH_YOQ };
  if (chiqarishHajmi(q.smeta) == null) return { mumkin: false, sabab: 'Resursning smeta hajmi noma‘lum — chiqarib bo‘lmaydi.' };
  if ((q.ozFakt ?? 0) > EPS) return { mumkin: false, sabab: 'Resursga fakt yozilgan — avval faktni 0 ga tushiring.' };
  if ((q.belgilangan ?? 0) > EPS) return { mumkin: false, sabab: 'Resursda «bajarilmaydi» belgisi bor — avval uni bekor qiling.' };
  return { mumkin: true };
}
