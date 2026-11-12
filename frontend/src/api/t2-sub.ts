/**
 * t2-sub.ts - subpudratchi tomoni klienti (shlyuz /api/tomon; 20261216300000_t2_subpudratchi_v1).
 * Hamma ruxsat serverda (a'zolik, rol, grant, aloqa); bu fayl faqat so'rov yuboradi va javobni tiplaydi.
 * Pul bu yerda HISOBLANMAYDI: summa/QQS/farq - lib/subpudratchi orqali hisob-yadroda.
 */
import { tomonOqi, tomonYoz } from './t2-tomon';
import { yangiOperationId } from './supabase';

export type SubAktHolat = 'qoralama' | 'yuborilgan' | 'qabul' | 'tuzatish' | 'bekor';

/** Subpudratchiga topshirilgan qator (subpudratchi ko'rinishi): hajm va KELISHILGAN narx; smeta narxi yo'q. */
export type SubIsh = {
  id: number; aloqa_id: number; gc_kompaniya_id: number; gc_nom: string; obyekt_id: number; obyekt_nom: string;
  tartib: number; kod: string | null; nom: string | null; birlik: string | null;
  hajm: number; narx: number | null; qqs_foiz: number;
  qabul_hajm: number; kutilayotgan_hajm: number; qoralama_hajm: number;
};

/** Bosh pudratchi ko'rinishi: smeta narxi + kelishilgan narx (marja uchun) va ikki marta sanalmaslik hisob-kitobi. */
export type SubTopshiriq = {
  id: number; aloqa_id: number; sub_kompaniya_id: number; sub_nom: string; shartnoma_id: number | null;
  qator_id: number; tartib: number; kod: string | null; nom: string | null; birlik: string | null; tur: string; kat: string | null;
  smeta_hajm: number | null; smeta_narx: number | null;
  hajm: number; narx: number | null; qqs_foiz: number;
  qabul_hajm: number; kutilayotgan_hajm: number; gc_fakt_hajm: number;
};

export type SubAktQisqa = {
  id: number; aloqa_id: number; obyekt_id: number; obyekt_nom: string; oy: string; raqam: string | null; holat: SubAktHolat;
  taqdim_id: number | null; taqdim_holat: string | null; qaror_izoh: string | null; taqdim_vaqti: string | null; qaror_vaqti: string | null;
  sub_nom: string; gc_nom: string; fakt_akt_id: number | null; xarajat_id: number | null; qator_soni: number; jami_qqs_siz: number | null;
};

export type SubAktQator = {
  topshiriq_id: number; qator_id: number; kod: string | null; nom: string | null; birlik: string | null; hajm: number; narx: number | null;
  topshirilgan_hajm: number; qqs_foiz: number; izoh: string | null;
};
export type SubAktTafsilot = {
  akt: Omit<SubAktQisqa, 'qator_soni' | 'jami_qqs_siz' | 'taqdim_vaqti'> & { izoh: string | null; meniki: boolean };
  qatorlar: SubAktQator[]; narxsiz_qator: number; jami_qqs_siz: number | null;
  hodisalar: Array<{ id: number; tur: string; matn: string | null; vaqt: string; meni: boolean; kompaniya_nom: string | null }>;
};

export type SubTolovQator = {
  akt_id: number; oy: string; obyekt_nom: string; gc_nom: string; ruxsat: boolean; jami_qqs_siz: number | null; qqs_foiz: number | null;
  shartnoma_id: number | null; shartnoma_qabul_qqs_siz: number | null; tolangan: number | null;
};

export type TopshirishQatori = { qator_id: number; hajm?: number | null; narx?: number | null };

export const subIshlarimOl = (k: number) => tomonOqi<{ ishlar: SubIsh[] }>('sub_ishlarim', k);
export const subBoshqaruvOl = (k: number, obyektId: number) => tomonOqi<{ topshiriqlar: SubTopshiriq[] }>('sub_boshqaruv', k, { obyekt_id: obyektId });
export const subAktlarOl = (k: number, yonalish: 'kelgan' | 'yuborilgan') => tomonOqi<{ aktlar: SubAktQisqa[] }>('sub_aktlar', k, { yonalish });
export const subAktTafsilotOl = (k: number, aktId: number) => tomonOqi<SubAktTafsilot>('sub_akt', k, { sub_akt_id: aktId });
export const subTolovOl = (k: number) => tomonOqi<{ aktlar: SubTolovQator[] }>('sub_tolov', k);

export const subTopshir = (k: number, p: { aloqaId: number; obyektId: number; qatorlar?: TopshirishQatori[]; bolimId?: number | null; shartnomaId?: number | null; qqsFoiz?: number | null }) =>
  tomonYoz<{ yangi: number; yangilandi: number; grant_yaratildi: boolean }>('sub_topshir', k, {
    aloqa_id: p.aloqaId, obyekt_id: p.obyektId, qatorlar: p.qatorlar ?? [], bolim_id: p.bolimId ?? null, shartnoma_id: p.shartnomaId ?? null, qqs_foiz: p.qqsFoiz ?? null,
  });
export const subTopshiriqBekor = (k: number, topshiriqId: number) => tomonYoz('sub_topshiriq_bekor', k, { topshiriq_id: topshiriqId });
export const subAktYoz = (k: number, p: { aloqaId: number; obyektId: number; oy: string; qatorlar: Array<{ topshiriq_id: number; hajm: number; izoh?: string }>; aktId?: number | null; raqam?: string; izoh?: string; operationId?: string }) =>
  tomonYoz<{ id: number; qayta?: boolean }>('sub_akt_yoz', k, {
    aloqa_id: p.aloqaId, obyekt_id: p.obyektId, oy: p.oy, qatorlar: p.qatorlar, akt_id: p.aktId ?? null, raqam: p.raqam ?? null, izoh: p.izoh ?? null, operation_id: p.operationId ?? yangiOperationId(),
  });
export const subAktYubor = (k: number, aktId: number, izoh?: string) => tomonYoz<{ id: number; holat: string }>('sub_akt_yubor', k, { sub_akt_id: aktId, izoh: izoh || null, operation_id: yangiOperationId() });
export const subAktQarori = (k: number, taqdimId: number, qaror: 'korilmoqda' | 'qabul' | 'rad' | 'tuzatish', izoh?: string) =>
  tomonYoz<{ id: number; holat: string; fakt_akt_id?: number | null; xarajat_id?: number | null }>('sub_qaror', k, { taqdim_id: taqdimId, qaror, izoh: izoh || null });
