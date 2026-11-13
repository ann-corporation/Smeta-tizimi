/**
 * HR + KPI (egasi 2026-11-04): xodim kartasi, KPI sxemasi, kalendar/tatil, tabel, jarima/bonus, ish haqi qoralamasi.
 * O'qish: /api/sb `hr_xodimlar_v1` | `hr_oy_v1` | `hr_kpi_v1` | `hr_oylik_buxgalteriya_v1` (stable; a'zolik + hr.* / payroll.* RPC ichida).
 * Yozish: /api/sb-yoz `hr_*_v1` (idempotent operation_id; ruxsat RPC ichida). Dizayn: docs/architecture/HR_KPI_V1.md.
 * Pul hisobi yagona manbada (SQL `_t2_hr_hisob_v1`); frontend faqat ko'rsatadi va jamlaydi (lib/hr/hisob.ts).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, type AktNatija } from './supabase';

export type HrRol = 'prorab' | 'brigadir' | 'usta' | 'ishchi' | 'muhandis' | 'pto' | 'boshqa';
export type HrBazaTuri = 'oylik' | 'kunlik' | 'donabay';
export type HrObyektBog = { obyekt_id: number; obyekt: string; ulush_foiz: number; rol: string | null; dan: string | null; gacha: string | null };
export type HrPii = { pinfl: string | null; pasport: string | null; telefon: string | null; manzil: string | null };
export type HrXodim = {
  kadr_id: number; ism: string; lavozim: string | null; holat: string | null; foydalanuvchi_id: number | null; hr_bor: boolean;
  rol: HrRol | null; grafik: 5 | 6 | null; baza_turi: HrBazaTuri | null; baza_summa: number | null; sxema_id: number | null;
  qabul_sana: string | null; bosh_sana: string | null; versiya: number | null; obyektlar: HrObyektBog[]; pii: HrPii | null;
};
export type HrSxema = { id: number; nom: string; f2_foiz: number | null; f2_baza: 'ustamasiz' | 'ustamali'; f2_rejim: 'obyekt' | 'muallif'; izoh: string | null; faol: boolean; versiya: number };
export type HrSozlama = { ndfl_foiz: number | null; inps_foiz: number | null; kun_soat: number; versiya: number } | null;
/** KPI ko'rsatkichi (D2): qiymat NULL = noma'lum (`—`, 0 emas); ball faqat maqsad bo'lsa. */
export type HrKpiKod = 'f2_hajm' | 'f2_vaqtida' | 'aosr_vaqtida' | 'naryad_qabul' | 'davomat';
export type HrKpiKorsatkich = { kod: HrKpiKod; ogirlik: number; qiymat: number | null; maqsad: number | null; ball: number | null; birlik: 'som' | 'ta' | '%'; manba: string };
export type HrKpiXulosa = { korsatkichlar: HrKpiKorsatkich[]; ball: number | null; qamrov: number };
export type HrXodimlarJavob = {
  ok: true; maosh_yopiq: boolean; pii_yopiq: boolean; xodimlar: HrXodim[]; sxemalar: HrSxema[]; sozlama: HrSozlama; obyektlar: Array<{ id: number; nom: string }>;
};

export type HrKun = { sana: string; hafta: number; tur5: 'ish' | 'dam' | 'bayram'; tur6: 'ish' | 'dam' | 'bayram'; nom: string | null };
export type HrTabelQator = { kadr_id: number; kunlar: Record<string, string>; holat: 'qoralama' | 'tasdiqlangan'; versiya: number; yopiq: boolean };
export type HrTatil = { id: number; kadr_id: number; tur: 'otpusk' | 'otgul' | 'kasal'; dan: string; gacha: string; holat: 'reja' | 'tasdiqlangan' | 'bekor'; izoh: string | null };
export type HrTuzatma = {
  id: number; kadr_id: number; tur: 'jarima' | 'bonus'; sabab: string; izoh: string | null; summa: number | null; foiz: number | null;
  obyekt_id: number | null; akt_id: number | null; sifat_id: number | null; fayl_id: string | null;
  holat: 'qoralama' | 'tasdiqlangan' | 'rad' | 'bekor'; yaratgan: number | null; qaror_kim: number | null; qaror_izoh: string | null; versiya: number;
};
export type HrOy = {
  ok: true; oy: string; kun_soat: number; kunlar: HrKun[];
  norma: { '5': { kun: number; soat: number }; '6': { kun: number; soat: number } };
  istisnolar: Array<{ sana: string; tur: 'bayram' | 'dam' | 'ish'; nom: string | null }>;
  tabel: HrTabelQator[]; tatillar: HrTatil[]; tuzatmalar: HrTuzatma[];
};

export type HrAkt = { akt_id: number; raqam: string | null; obyekt_id: number; obyekt: string; sana: string; ulush: number; summa: number | null; manba: string; kpi: number | null };
export type HrKpiQator = {
  kadr_id: number; ism: string; lavozim: string | null; rol: HrRol; grafik: 5 | 6; sxema_id: number | null; sxema: string | null;
  f2_foiz: number | null; f2_baza: 'ustamasiz' | 'ustamali' | null; f2_rejim: 'obyekt' | 'muallif' | null;
  norma_kun: number; norma_soat: number; kun_ishlagan: number | null; kun_kelmadi: number | null; kun_otpusk: number | null; kun_kasal: number | null; kun_otgul: number | null;
  tabel_holat: string | null; baza_turi: HrBazaTuri; baza_summa: number | null; baza: number | null;
  kpi_f2: number | null; f2_summa: number | null; f2_soni: number; f2_nomalum_soni: number; aktlar: HrAkt[];
  bonus: number; jarima: number; tuzatmalar: Array<{ id: number; tur: string; sabab: string; summa: number | null; foiz: number | null; izoh: string | null }>;
  tuzatma_kutilmoqda: number; hisoblangan: number | null; ndfl_foiz: number | null; inps_foiz: number | null;
  ndfl: number | null; inps: number | null; sof: number | null; toliq: boolean; ogohlantirish: string[];
  /* 20261216100000: naryad (donabay) qismi, KPI pulga ta'siri, KPI ko'rsatkichlari. Eski saqlangan qatorlarda bo'lmasligi mumkin. */
  kpi_pulga_tasir?: boolean; kpi_f2_qollandi?: number | null; naryad_summa?: number | null; naryad_soni?: number | null; naryad_kun?: number | null;
  jami_daromad?: number | null; qolga?: number | null; kpi?: HrKpiXulosa | null;
};
export type HrKpi = {
  ok: true; oy: string; generated_at: string; qatorlar: HrKpiQator[];
  saqlangan: Array<{ kadr_id: number; holat: 'qoralama' | 'tasdiqlangan'; hisoblangan: number | null; sof: number | null; toliq: boolean; provodka_holat: string; vaqt: string }>;
};

type Xato = { ok: false; error: string };

async function oqi<T>(soro: string, kompaniyaId: number, oy?: string): Promise<T | Xato> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro, kompaniya_id: kompaniyaId, ...(oy ? { oy } : {}) }),
    });
    const j = await r.json() as { ok: boolean; natija?: T; error?: string };
    if (!j.ok || !j.natija) return { ok: false, error: j.error || 'HR ma‘lumotini o‘qib bo‘lmadi.' };
    return j.natija;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export const hrXodimlarOl = (kid: number) => oqi<HrXodimlarJavob>('hr_xodimlar_v1', kid);
export const hrOyOl = (kid: number, oy: string) => oqi<HrOy>('hr_oy_v1', kid, oy);
export const hrKpiOl = (kid: number, oy: string) => oqi<HrKpi>('hr_kpi_v1', kid, oy);
export const hrBuxgalteriyaOl = (kid: number, oy: string) =>
  oqi<{ ok: true; oy: string; qatorlar: Array<{ oylik_id: number; kadr_id: number; hisoblangan: number; ndfl: number; inps: number; sof: number; provodka_holat: string; provodka_id: number | null }> }>('hr_oylik_buxgalteriya_v1', kid, oy);

/** «Mening oyligim va KPI» — FAQAT o'z qatori (RPC t2_hr_men_v1: foydalanuvchi_id = sessiya). F2 aktlari/summasi berilmaydi. */
export type HrMen = {
  ok: true; oy: string; bog_langan: boolean; hr_karta: boolean; holat?: 'tasdiqlangan' | 'taxminiy'; oylar: string[];
  qator?: Omit<HrKpiQator, 'aktlar' | 'f2_summa' | 'sxema_id' | 'f2_foiz' | 'f2_baza' | 'f2_rejim'> | null;
};
export type HrQoidaQator = { rol: HrRol; korsatkich: HrKpiKod; ogirlik: number; maqsad: number | null; chegara_kun: number | null; manba: 'sukut' | 'kompaniya' };
export type HrAzo = { foydalanuvchi_id: number; ism: string; rol: string; kadr_id: number | null };
export type HrQoida = { ok: true; kpi_pulga_tasir: boolean; qoidalar: HrQoidaQator[]; azolar: HrAzo[] | null };
export const hrMenOl = (kid: number, oy?: string) => oqi<HrMen>('hr_men_v1', kid, oy);
export const hrQoidaOl = (kid: number) => oqi<HrQoida>('hr_qoida_v1', kid);

export type HrYoz = AktNatija & { code?: string; kadr_id?: number; id?: number; sxema_id?: number; saqlandi?: number; yopiq_kadrlar?: number[]; qator_soni?: number; rad_etilgan?: Array<{ kadr_id: number; sabab: string; ogohlantirish?: string[] }> };

export type HrXodimYuk = {
  kompaniyaId: number; kadrId: number | null; kutilganVersiya?: number | null;
  profil?: { ism?: string; lavozim?: string; foydalanuvchi_id?: number | null; rol?: HrRol; grafik?: 5 | 6; baza_turi?: HrBazaTuri; baza_summa?: number | null; sxema_id?: number | null; qabul_sana?: string | null; bosh_sana?: string | null } | null;
  pii?: Partial<HrPii> | null;
  obyektlar?: Array<{ obyekt_id: number; ulush_foiz?: number; rol?: string | null; dan?: string | null; gacha?: string | null }> | null;
  operationId: string;
};
export const hrXodimSaqla = (p: HrXodimYuk): Promise<HrYoz> => yozAmali({
  amal: 'hr_xodim_saqla_v1', kompaniya_id: p.kompaniyaId, kadr_id: p.kadrId, kutilgan_versiya: p.kutilganVersiya ?? null,
  profil: p.profil ?? null, pii: p.pii ?? null, obyektlar: p.obyektlar ?? null, operation_id: p.operationId,
});
export const hrSxemaSaqla = (p: { kompaniyaId: number; sxema?: Partial<Omit<HrSxema, 'versiya'>> | null; sozlama?: { ndfl_foiz?: number | null; inps_foiz?: number | null; kun_soat?: number } | null; operationId: string }): Promise<HrYoz> =>
  yozAmali({ amal: 'hr_sxema_saqla_v1', kompaniya_id: p.kompaniyaId, sxema: p.sxema ?? null, sozlama: p.sozlama ?? null, operation_id: p.operationId });
export const hrKalendarSaqla = (p: {
  kompaniyaId: number; kunlar?: Array<{ sana: string; tur: 'bayram' | 'dam' | 'ish' | null; nom?: string | null }> | null;
  tatillar?: Array<{ id?: number | null; kadr_id: number; tur: HrTatil['tur']; dan: string; gacha: string; holat?: HrTatil['holat']; izoh?: string | null }> | null; operationId: string;
}): Promise<HrYoz> => yozAmali({ amal: 'hr_kalendar_saqla_v1', kompaniya_id: p.kompaniyaId, kunlar: p.kunlar ?? null, tatillar: p.tatillar ?? null, operation_id: p.operationId });
export const hrTabelSaqla = (p: { kompaniyaId: number; oy: string; qatorlar: Array<{ kadr_id: number; kunlar: Record<string, string>; holat?: 'qoralama' | 'tasdiqlangan' }>; operationId: string }): Promise<HrYoz> =>
  yozAmali({ amal: 'hr_tabel_saqla_v1', kompaniya_id: p.kompaniyaId, oy: p.oy, qatorlar: p.qatorlar, operation_id: p.operationId });
export const hrTuzatmaSaqla = (p: {
  kompaniyaId: number; kutilganVersiya?: number | null; operationId: string;
  tuzatma: { id?: number | null; bekor?: boolean; kadr_id?: number; oy?: string; tur?: 'jarima' | 'bonus'; sabab?: string; izoh?: string | null; summa?: number | null; foiz?: number | null; obyekt_id?: number | null; akt_id?: number | null; sifat_id?: number | null; fayl_id?: string | null };
}): Promise<HrYoz> => yozAmali({ amal: 'hr_tuzatma_saqla_v1', kompaniya_id: p.kompaniyaId, tuzatma: p.tuzatma, kutilgan_versiya: p.kutilganVersiya ?? null, operation_id: p.operationId });
export const hrTuzatmaQaror = (p: { kompaniyaId: number; id: number; qaror: 'tasdiqlangan' | 'rad'; izoh?: string | null; kutilganVersiya?: number | null; operationId: string }): Promise<HrYoz> =>
  yozAmali({ amal: 'hr_tuzatma_qaror_v1', kompaniya_id: p.kompaniyaId, id: p.id, qaror: p.qaror, izoh: p.izoh ?? null, kutilgan_versiya: p.kutilganVersiya ?? null, operation_id: p.operationId });
export const hrOylikAmal = (p: { kompaniyaId: number; oy: string; amal: 'hisobla' | 'tasdiqla' | 'qaytar'; kadrIds?: number[] | null; operationId: string }): Promise<HrYoz> =>
  yozAmali({ amal: 'hr_oylik_v1', kompaniya_id: p.kompaniyaId, oy: p.oy, oylik_amal: p.amal, kadr_ids: p.kadrIds ?? null, operation_id: p.operationId });

export const hrKpiQoidaSaqla = (p: {
  kompaniyaId: number; qoidalar?: Array<{ rol: HrRol; korsatkich?: HrKpiKod; ogirlik?: number; maqsad?: number | null; chegara_kun?: number | null; qayta_sukut?: boolean }> | null;
  kpiPulga?: boolean | null; operationId: string;
}): Promise<HrYoz> => yozAmali({ amal: 'hr_kpi_qoida_saqla_v1', kompaniya_id: p.kompaniyaId, qoidalar: p.qoidalar ?? null, kpi_pulga: p.kpiPulga ?? null, operation_id: p.operationId });

const XATO: Array<[RegExp, string]> = [
  [/STALE_VERSION/, 'Yozuv shu orada o‘zgargan — yangilab qayta urinib ko‘ring.'],
  [/ISH_HAQI_TASDIQLANGAN/, 'Bu oy uchun ish haqi tasdiqlangan — avval «Qaytarish» kerak.'],
  [/OZ_YOZUVINI_TASDIQLAMAYDI/, 'O‘zingiz yaratgan yozuvni o‘zingiz tasdiqlay olmaysiz.'],
  [/SUMMA_YOKI_FOIZ/, 'Summa yoki foizdan aynan bittasini kiriting.'],
  [/SABAB_IZOH_KERAK/, 'Jarima sababini yozing.'],
  [/PERMISSION_DENIED|42501/, 'Bu amal uchun ruxsatingiz yo‘q.'],
  [/FAQAT_QORALAMA_TAHRIR/, 'Faqat qoralama yozuvni tahrirlash mumkin.'],
  [/PROVODKA_YOZILGAN/, 'Buxgalteriyaga o‘tkazilgan — qaytarib bo‘lmaydi.'],
  [/KUN_INVALID|KUNLAR_INVALID/, 'Tabel kunlari noto‘g‘ri.'],
];
/** Xato matni (kalit — t() bilan tarjima qilinadi). */
export function hrXato(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''} ${r?.xabar ?? ''}`;
  for (const [re, matn] of XATO) if (re.test(m)) return matn;
  return r?.error || r?.code || 'Amal bajarilmadi.';
}
