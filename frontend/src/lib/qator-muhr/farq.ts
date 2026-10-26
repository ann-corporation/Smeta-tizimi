/**
 * SMETA CONST — qator muhri farqi (egasi 2026-10-27: «bir vergul qo'shilsa ham smetadan o'zgargan pozitsiya aniq bo'lishi
 * kerak»). Ma'lumot: view `t2_qator_muhr_farq` (faqat farqi bor qatorlar). Bu modul — sof funksiyalar: belgi, xulosa,
 * qiymat matni. Hech narsa yozmaydi; asl qatorni tahrirlash rad etilmaydi — faqat ko'rinadi.
 * Dizayn: docs/architecture/SMETA_CONST_KORREKTIROVKA.md §2.
 */
export type MuhrHolat = 'ozgargan' | 'ochirilgan' | 'qoshilgan' | 'muhrsiz';
export type MuhrMaydon = 'tur' | 'kod' | 'nom' | 'birlik' | 'kat' | 'ota_id' | 'hajm' | 'narx' | 'norma';
export type MuhrQiymat = string | number | null;

export interface QatorMuhrFarq {
  qator_id: number;
  obyekt_id: number;
  tur: string | null;
  kod: string | null;
  nom: string | null;
  ota_id: number | null;
  holat: MuhrHolat;
  maydonlar: MuhrMaydon[];
  avval: Partial<Record<MuhrMaydon, MuhrQiymat>>;
  endi: Partial<Record<MuhrMaydon, MuhrQiymat>>;
  faqat_narx_qoyildi: boolean;
  aslda_yoq: boolean | null;
  ekspertizagacha: boolean | null;
  tekshirilmagan: string[];
  muhr_manba: string | null;
  asos_vaqt: string | null;
  jurnal_soni: number | null;
  oxirgi_tahrir: string | null;
  oxirgi_kim: string | null;
  oxirgi_manba: string | null;
}

export const MUHR_FARQ_USTUNLARI =
  'qator_id,obyekt_id,tur,kod,nom,ota_id,holat,maydonlar,avval,endi,faqat_narx_qoyildi,aslda_yoq,ekspertizagacha,tekshirilmagan,muhr_manba,asos_vaqt,jurnal_soni,oxirgi_tahrir,oxirgi_kim,oxirgi_manba';

/** Maydon nomi (o'zbekcha kalit — `t()` orqali tarjima qilinadi). Tartib — view bilan bir xil. */
export const MUHR_MAYDON_NOMI: Readonly<Record<MuhrMaydon, string>> = {
  tur: 'Qator turi', kod: 'Shifr', nom: 'Nomi', birlik: 'Birlik', kat: 'Kategoriya', ota_id: 'Joyi (ota qator)',
  hajm: 'Hajm', narx: 'Narx', norma: 'Norma',
};

export type MuhrTon = 'warn' | 'info' | 'danger';
export interface MuhrBelgi { soz: string; ton: MuhrTon; izoh: string }

/** Daraxt va tafsilotdagi belgi. «Narx qo'yildi» (narxlash: NULL → qiymat) — yumshoq; boshqa har farq — ogohlantirish. */
export function muhrBelgisi(f: Pick<QatorMuhrFarq, 'holat' | 'faqat_narx_qoyildi' | 'maydonlar'>): MuhrBelgi {
  if (f.holat === 'ochirilgan') return { soz: 'O‘chirilgan', ton: 'danger', izoh: 'Asl smetadagi qator bazadan o‘chirilgan' };
  if (f.holat === 'muhrsiz') return { soz: 'Muhrsiz', ton: 'warn', izoh: 'Qator asl smeta muhridan keyin qo‘shilgan — muhr olinmagan' };
  if (f.holat === 'qoshilgan') return { soz: 'Qo‘shilgan', ton: 'info', izoh: 'Qator asl smetada yo‘q edi — keyin qo‘shilgan' };
  if (f.faqat_narx_qoyildi) return { soz: 'Narx qo‘yildi', ton: 'info', izoh: 'Asl smetada narx bo‘sh edi — narx keyin qo‘yilgan' };
  return { soz: 'O‘zgargan', ton: 'warn', izoh: 'Qator asl smetadan farq qiladi' };
}

/** Haqiqiy (xavfli) o'zgarish: muhrdan farq, «narx qo'yildi» emas. */
export const haqiqiyOzgarish = (f: Pick<QatorMuhrFarq, 'holat' | 'faqat_narx_qoyildi'>) => f.holat === 'ozgargan' && !f.faqat_narx_qoyildi;

/** Jurnalsiz o'zgarish — muhrdan farq bor, lekin t2_ozgarish da muhrdan keyin birorta yozuv yo'q (import/markirovka yo'li). */
export const jurnalsiz = (f: Pick<QatorMuhrFarq, 'holat' | 'jurnal_soni'>) => f.holat === 'ozgargan' && (f.jurnal_soni ?? 0) === 0;

export interface MuhrXulosa {
  ozgargan: number; narxQoyildi: number; qoshilgan: number; ochirilgan: number; muhrsiz: number;
  jurnalsiz: number; ekspertizagacha: number; jami: number;
}

export function muhrXulosa(royxat: readonly QatorMuhrFarq[]): MuhrXulosa {
  const x: MuhrXulosa = { ozgargan: 0, narxQoyildi: 0, qoshilgan: 0, ochirilgan: 0, muhrsiz: 0, jurnalsiz: 0, ekspertizagacha: 0, jami: royxat.length };
  for (const f of royxat) {
    if (f.holat === 'ozgargan') { if (f.faqat_narx_qoyildi) x.narxQoyildi++; else x.ozgargan++; }
    else if (f.holat === 'qoshilgan') x.qoshilgan++;
    else if (f.holat === 'ochirilgan') x.ochirilgan++;
    else if (f.holat === 'muhrsiz') x.muhrsiz++;
    if (jurnalsiz(f)) x.jurnalsiz++;
    if (f.ekspertizagacha && f.holat !== 'muhrsiz') x.ekspertizagacha++;
  }
  return x;
}

/** Daraxtda ko'rinadigan qatorlar (o'chirilgan qator daraxtda yo'q — u alohida ro'yxatda). */
export function muhrXaritasi(royxat: readonly QatorMuhrFarq[]): Map<number, QatorMuhrFarq> {
  const m = new Map<number, QatorMuhrFarq>();
  for (const f of royxat) if (f.holat !== 'ochirilgan') m.set(Number(f.qator_id), f);
  return m;
}

const sonFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 });

/** Qiymat matni: NULL — `null` (UI «bo'sh» deb ko'rsatadi, 0 EMAS); son — ru-RU; ota — «#id». Foydalanuvchi matni tarjima qilinmaydi. */
export function muhrQiymatMatn(maydon: MuhrMaydon, v: MuhrQiymat | undefined): string | null {
  if (v == null || v === '') return null;
  if (maydon === 'ota_id') return `#${v}`;
  if (maydon === 'hajm' || maydon === 'narx' || maydon === 'norma') {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? sonFmt.format(n) : String(v);
  }
  return String(v);
}

/** Maydonlar bo'yicha avval/endi juftlari (view tartibida). */
export function muhrJuftlar(f: Pick<QatorMuhrFarq, 'maydonlar' | 'avval' | 'endi'>): Array<{ maydon: MuhrMaydon; avval: string | null; endi: string | null }> {
  return (f.maydonlar || []).map((maydon) => ({
    maydon, avval: muhrQiymatMatn(maydon, f.avval?.[maydon]), endi: muhrQiymatMatn(maydon, f.endi?.[maydon]),
  }));
}

/** Muhr manbasi — foydalanuvchiga tushunarli. */
export function muhrManbaMatn(manba: string | null): string {
  switch (manba) {
    case 'import': return 'smeta yuklangan payt';
    case 'backfill_revision': return 'asl smeta (birinchi F2 / o‘zgarishdagi muhr)';
    case 'backfill_joriy': return 'muhr joriy etilgan kundagi holat';
    case 'korrektirovka': return 'korrektirovka';
    case 'qolda': return 'qo‘lda muhrlangan';
    default: return 'muhr yo‘q';
  }
}
