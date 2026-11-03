/**
 * Uy sotish (egasi 2026-11-03, migratsiya 20261124000000).
 * O'qish: /api/sb `sotuv_*_v1` (stable; a'zolik + sales.read/sales.write RPC ichida).
 * Yozish: /api/sb-yoz `sotuv_*_v1` (oq ro'yxat — functions/_shared/sotuv-yuk.ts; idempotent operation_id; CAS versiya).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, yangiOperationId, type AktNatija } from './supabase';

export type BirlikHolat = 'bosh' | 'bron' | 'sotilgan' | 'sotuvda_emas' | 'zaxira';
export type BirlikTur = 'xonadon' | 'uy' | 'tijorat' | 'parking' | 'ombor';
export type Bosqich = 'lid' | 'aloqa' | 'korsatildi' | 'bron' | 'shartnoma' | 'tolov' | 'topshirildi' | 'bekor';
export type TolovTuri = 'toliq' | 'muddatli' | 'ipoteka' | 'eskrou';
export type TolovUsul = 'naqd' | 'karta' | 'bank' | 'eskrou' | 'payme' | 'click' | 'uzum' | 'boshqa';
export type Valyuta = 'UZS' | 'USD';

export type Birlik = {
  id: number; podyezd: number | null; qavat: number | null; raqam: string; tur: BirlikTur; xona_soni: number | null;
  maydon: number | null; maydon_yashash: number | null; maydon_oshxona: number | null; maydon_balkon: number | null;
  shift: number | null; pardoz: string | null; yon: string | null; manzara: string | null; planirovka_id: number | null;
  narx_m2: number | null; narx_jami: number | null; valyuta: Valyuta; holat: BirlikHolat; versiya: number;
  bron_id: number | null; bron_tugaydi: string | null; bitim_id: number | null; mijoz: string | null;
};
export type Shaxmatka = {
  ok: true; generated_at: string; obyekt_id: number; birliklar: Birlik[]; yozish: boolean;
  hisob: { jami: number; bosh: number; bron: number; sotilgan: number; sotuvda_emas: number; zaxira: number;
    maydon_bosh: number; qiymat_bosh: number | null; narxsiz_soni: number };
};
export type BitimQator = {
  id: number; bosqich: Bosqich; mijoz_id: number; mijoz: string; telefon: string; manba: string | null; masul_actor_id: number | null;
  loyiha_id: number | null; birlik_id: number | null;
  birlik: { raqam: string; obyekt_id: number; qavat: number | null; xona_soni: number | null; maydon: number | null } | null;
  summa: number | null; valyuta: Valyuta; tolov_turi: TolovTuri | null; keyingi_aloqa: string | null; bron_tugaydi: string | null;
  versiya: number; yaratildi: string; yangilandi: string;
};
export type GrafikQator = { id: number; n: number; sana: string; summa: number; tur: string | null; tolangan: number; qoldiq: number; kechikkan_kun: number | null };
export type SotuvTolov = { id: number; sana: string; summa: number; tur: 'tolov' | 'bron' | 'qaytarim'; usul: TolovUsul; holat: string;
  hujjat: string | null; izoh: string | null };
export type BitimKarta = {
  ok: true; generated_at: string;
  bitim: Record<string, unknown> & { id: number; bosqich: Bosqich; versiya: number; summa: number | null; birlik_id: number | null };
  mijoz: Record<string, unknown> & { id: number; fio: string; telefon: string };
  birlik: (Record<string, unknown> & { id: number; raqam: string; narx_jami: number | null }) | null;
  bron: (Record<string, unknown> & { id: number; holat: string; tugaydi: string }) | null;
  grafik: GrafikQator[]; grafik_versiya: number | null; tolovlar: SotuvTolov[];
  jami: { summa: number | null; tolandi: number; qoldiq: number | null; muddati_otgan: number };
  audit: Array<{ amal: string; entity: string; actor_id: number | null; yaratildi: string }>;
};
export type Mijoz = { id: number; tur: string; fio: string; telefon: string; manba: string | null; bitim_soni: number; rozilik: boolean; yaratildi: string };
export type SotuvPanel = {
  ok: true; generated_at: string;
  zaxira: { jami: number; bosh: number; bron: number; sotilgan: number; sotuvda_emas: number; maydon_jami: number; maydon_bosh: number;
    qiymat_bosh: number | null; narxsiz_soni: number; ortacha_m2_bosh: number | null };
  sotuv: { soni: number; summa: number | null; maydon: number | null; ortacha_m2: number | null };
  tushum: number | null;
  qarz: { muddati_otgan: number; k0_30: number; k31_90: number; k90: number; kelajak: number };
  kechikkanlar: Array<{ bitim_id: number; mijoz: string; telefon: string; qarz: number; kun: number }>;
  prognoz: Array<{ oy: string; summa: number }>;
  voronka: Partial<Record<Bosqich, number>>;
  manbalar: Array<{ manba: string; lid: number; sotildi: number }>;
  menejerlar: Array<{ actor_id: number | null; ism: string | null; bitim: number; sotildi: number; summa: number | null }>;
  oylik_sotuv: Array<{ oy: string; soni: number; summa: number | null }>;
  binolar: Array<{ obyekt_id: number; nom: string; loyiha_id: number | null; jami: number; bosh: number; sotilgan: number }>;
  loyihalar: Array<{ loyiha_id: number; nom: string; reyestr_raqam: string | null; sotuvda: boolean; topshirish_sana: string | null;
    eskrou_hisob: string | null; bron_soat: number }>;
};

type Oqildi<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };

async function oqi<T>(soro: string, kompaniyaId: number, qoshimcha: Record<string, unknown> = {}): Promise<Oqildi<T>> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro, kompaniya_id: kompaniyaId, ...qoshimcha }),
    });
    const j = await r.json() as { ok: boolean; natija?: T & { ok?: boolean; code?: string }; error?: string };
    if (!j.ok || !j.natija) return { ok: false, error: j.error || 'Sotuv ma’lumotini o‘qib bo‘lmadi.' };
    if (j.natija.ok === false) return { ok: false, error: sotuvXato(j.natija), code: j.natija.code };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export const shaxmatkaOl = (kompaniyaId: number, obyektId: number) => oqi<Shaxmatka>('sotuv_shaxmatka_v1', kompaniyaId, { obyekt_id: obyektId });
export const bitimlarOl = (kompaniyaId: number, filtr: { bosqich?: Bosqich; qidiruv?: string; loyiha_id?: number; masul_actor_id?: number; yopilganlar?: boolean } = {}) =>
  oqi<{ ok: true; bitimlar: BitimQator[] }>('sotuv_bitimlar_v1', kompaniyaId, { filtr });
export const bitimOl = (kompaniyaId: number, bitimId: number) => oqi<BitimKarta>('sotuv_bitim_v1', kompaniyaId, { bitim_id: bitimId });
export const mijozlarOl = (kompaniyaId: number, qidiruv?: string) => oqi<{ ok: true; mijozlar: Mijoz[] }>('sotuv_mijozlar_v1', kompaniyaId, { qidiruv });
export const sotuvPanelOl = (kompaniyaId: number, loyihaId?: number | null) => oqi<SotuvPanel>('sotuv_panel_v1', kompaniyaId, { loyiha_id: loyihaId ?? null });

export type SotuvNatija = AktNatija & { code?: string; id?: number; versiya?: number; yangi?: number; yangilandi?: number; otkazildi?: number; ozgardi?: number };
const yoz = (amal: string, kompaniyaId: number, yuk: Record<string, unknown>, opKerak = true) =>
  yozAmali({ amal, kompaniya_id: kompaniyaId, ...yuk, ...(opKerak ? { operation_id: yuk.operation_id ?? yangiOperationId() } : {}) }) as Promise<SotuvNatija>;

export type LoyihaSozlama = { reyestr_raqam?: string | null; reyestr_sana?: string | null; eskrou_bank?: string | null; eskrou_hisob?: string | null;
  topshirish_sana?: string | null; tavsif?: string | null; sotuvda?: boolean; bron_soat?: number };
export const loyihaSaqla = (kompaniyaId: number, loyihaId: number, p: LoyihaSozlama, operationId?: string) =>
  yoz('sotuv_loyiha_saqla_v1', kompaniyaId, { loyiha_id: loyihaId, p, operation_id: operationId });
export type BirlikYuk = Partial<Omit<Birlik, 'id' | 'narx_jami' | 'versiya' | 'bron_id' | 'bron_tugaydi' | 'bitim_id' | 'mijoz'>> & { raqam: string; izoh?: string | null };
export const birliklarSaqla = (kompaniyaId: number, obyektId: number, qatorlar: BirlikYuk[], operationId?: string) =>
  yoz('sotuv_birlik_saqla_v1', kompaniyaId, { obyekt_id: obyektId, qatorlar, operation_id: operationId });
export const narxOzgartir = (kompaniyaId: number, p: { birlikIds: number[]; usul: 'foiz' | 'summa_m2' | 'yangi_m2'; qiymat: number; sabab: string; operationId?: string }) =>
  yoz('sotuv_narx_ozgartir_v1', kompaniyaId, { birlik_ids: p.birlikIds, usul: p.usul, qiymat: p.qiymat, sabab: p.sabab, operation_id: p.operationId });
export const birlikHolat = (kompaniyaId: number, birlikId: number, holat: 'bosh' | 'sotuvda_emas' | 'zaxira', sabab: string, kutilganVersiya: number) =>
  yoz('sotuv_birlik_holat_v1', kompaniyaId, { birlik_id: birlikId, holat, sabab, kutilgan_versiya: kutilganVersiya }, false);
export type MijozYuk = { tur?: 'jismoniy' | 'yuridik'; fio: string; telefon: string; telefon2?: string; email?: string; pinfl?: string; pasport?: string;
  inn?: string; manzil?: string; manba?: string; izoh?: string; rozilik?: boolean };
export type BitimYuk = Record<string, unknown> & { id?: number; kutilgan_versiya?: number; mijoz_id?: number; mijoz?: MijozYuk; bosqich?: Bosqich };
export const bitimSaqla = (kompaniyaId: number, p: BitimYuk, operationId?: string) => yoz('sotuv_bitim_saqla_v1', kompaniyaId, { p, operation_id: operationId });
export const bronQil = (kompaniyaId: number, p: { bitimId: number; birlikId: number; soat?: number | null; tolovSumma?: number | null; operationId?: string }) =>
  yoz('sotuv_bron_v1', kompaniyaId, { bitim_id: p.bitimId, birlik_id: p.birlikId, soat: p.soat ?? null, tolov_summa: p.tolovSumma ?? null, operation_id: p.operationId });
export const bronBekor = (kompaniyaId: number, bronId: number, sabab: string) => yoz('sotuv_bron_bekor_v1', kompaniyaId, { bron_id: bronId, sabab }, false);
export const grafikSaqla = (kompaniyaId: number, bitimId: number, qatorlar: Array<{ sana: string; summa: number; tur?: string }>, operationId?: string) =>
  yoz('sotuv_grafik_saqla_v1', kompaniyaId, { bitim_id: bitimId, qatorlar, operation_id: operationId });
export const tolovYoz = (kompaniyaId: number, p: { bitimId: number; sana: string; summa: number; tur?: 'tolov' | 'bron' | 'qaytarim'; usul?: TolovUsul;
  hujjat?: string; izoh?: string; operationId?: string }) =>
  yoz('sotuv_tolov_yoz_v1', kompaniyaId, { bitim_id: p.bitimId, sana: p.sana, summa: p.summa, tur: p.tur ?? 'tolov', usul: p.usul ?? 'bank',
    hujjat: p.hujjat ?? null, izoh: p.izoh ?? null, operation_id: p.operationId });
export const tolovBekor = (kompaniyaId: number, tolovId: number, sabab: string) => yoz('sotuv_tolov_bekor_v1', kompaniyaId, { tolov_id: tolovId, sabab }, false);

const XATOLAR: Record<string, string> = {
  BIRLIK_BAND: 'Bu birlik hozir boshqa mijozga bron qilingan yoki sotilgan.',
  BIRLIK_SOTILGAN: 'Birlik allaqachon sotilgan.',
  BIRLIK_QULFLANGAN: 'Bron yoki sotilgan birlikni bu yerdan o‘zgartirib bo‘lmaydi.',
  BIRLIK_KERAK: 'Shartnoma uchun birlik tanlang.',
  BIRLIK_NOT_FOUND: 'Birlik topilmadi.',
  BITIMDA: 'Birlik faol bitimga bog‘langan.',
  BITIM_NOT_FOUND: 'Bitim topilmadi.',
  BOSQICH_NOTOGRI: 'Bu bosqichga o‘tib bo‘lmaydi.',
  BRON_ORQALI: 'Bron faqat «Bron qilish» tugmasi orqali qilinadi.',
  NARX_YOQ: 'Birlikka narx qo‘yilmagan — avval narx belgilang.',
  NARX_NOTOGRI: 'Narx noto‘g‘ri.', FOIZ_NOTOGRI: 'Foiz noto‘g‘ri.', USUL_NOTOGRI: 'Usul noto‘g‘ri.',
  SABAB_REQUIRED: 'Sababini yozing (kamida 3 harf).',
  JAMI_MOS_EMAS: 'Grafik jami shartnoma summasiga teng emas.',
  SUMMA_KERAK: 'Shartnoma summasi kerak.', SUMMA_NOTOGRI: 'Summa noto‘g‘ri.', SANA_NOTOGRI: 'Sana noto‘g‘ri.',
  SHARTNOMA_KERAK: 'To‘lov faqat shartnomadan keyin yoziladi.',
  REYESTR_KERAK: 'Sotuvga chiqarish uchun reyestr raqami kerak (PP-4732).',
  VERSIYA: 'Ma’lumot shu orada o‘zgargan — yangilab qayta urinib ko‘ring.',
  YOPILGAN: 'Bitim yopilgan — o‘zgartirib bo‘lmaydi.',
  TELEFON_NOTOGRI: 'Telefon raqami noto‘g‘ri.', FIO_REQUIRED: 'Mijoz FIO sini yozing.',
  QATOR_NOTOGRI: 'Qatorlardan biri noto‘g‘ri.', QATORLAR_NOTOGRI: 'Qatorlar noto‘g‘ri.',
  PERMISSION_DENIED: 'Bu amal uchun ruxsatingiz yo‘q.',
  NOT_FOUND: 'Topilmadi.', OBYEKT_NOT_FOUND: 'Obyekt topilmadi.', LOYIHA_NOT_FOUND: 'Loyiha topilmadi.', MIJOZ_NOT_FOUND: 'Mijoz topilmadi.',
};
export function sotuvXato(r: { code?: string; error?: string; xabar?: string } | null | undefined): string {
  if (r?.code && XATOLAR[r.code]) return XATOLAR[r.code];
  const m = `${r?.error ?? ''} ${r?.xabar ?? ''}`;
  for (const [k, v] of Object.entries(XATOLAR)) if (m.includes(k)) return v;
  return r?.xabar || r?.error || 'Amal bajarilmadi.';
}
