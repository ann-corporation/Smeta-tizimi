/**
 * Yuk birjasi — gateway mijozi (yuk egasi tomoni).
 * O'qish: `/api/sb` soro `yb_ol_v1` (actor sessiyadan; a'zolik + procurement.read RPC ichida).
 * Yozish: `/api/sb-yoz` amal `yb_yuk_*_v1` (idempotent: operation_id; versiya — optimistik qulf).
 * Masofa: `/api/yuk-marshrut` (server funksiya, kesh; mijozda kalit yo'q). Pul: QQS siz asos; QQS bilan — lib/hisob-yadro.
 * Server: 20261201000000_t2_yuk_birjasi_v1. Tashuvchi (haydovchi) tomoni bu mijozda YO'Q (service_role, PR4 bot).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, yangiOperationId } from './supabase';
import type { TolovHolat, YukHolat } from '../lib/yuk-birjasi/holat';
import type { YukTuri } from '../lib/yuk-birjasi/narx';

export type TolovShakli = 'naqd' | 'otkazma' | 'ikkalasi';
export type YukQator = {
  id: number; nom: string; yuk_turi: YukTuri; a_nom: string | null; b_nom: string | null; masofa_km: number | null; tonna: number | null; hajm_m3: number | null;
  sana_dan: string | null; sana_gacha: string | null; tolov_shakli: TolovShakli; escrow: boolean; narx_taklif_qqs_siz: number | null; narx_tavsiya_qqs_siz: number | null;
  qqs_foiz: number; holat: YukHolat; versiya: number; yaratildi: string; faol_takliflar: number;
};
export type YukToliq = {
  id: number; kompaniya_id: number; nom: string; yuk_turi: YukTuri; a_nom: string | null; a_lat: number | null; a_lng: number | null; a_obyekt_id: number | null;
  b_nom: string | null; b_lat: number | null; b_lng: number | null; b_obyekt_id: number | null; masofa_km: number | null; tonna: number | null; hajm_m3: number | null;
  sana_dan: string | null; sana_gacha: string | null; tolov_shakli: TolovShakli; escrow: boolean; narx_taklif_qqs_siz: number | null; narx_tavsiya_qqs_siz: number | null;
  narx_hisob: Record<string, unknown> | null; qqs_foiz: number; izoh: string | null; holat: YukHolat; tanlangan_taklif_id: number | null; versiya: number; elon_vaqt: string | null; yopildi_vaqt: string | null;
};
export type TaklifQator = {
  id: number; kimdan: 'tashuvchi' | 'ega'; raund: number; narx_qqs_siz: number; qqs_foiz: number; izoh: string | null; holat: 'faol' | 'qabul' | 'rad' | 'qaytarildi' | 'eskirdi';
  yaratildi: string; tashuvchi_id: number; tashuvchi: string; tur: 'yakka' | 'firma'; daraja: number; reyting: number | null; reyting_soni: number;
  mashina: { raqam: string | null; turi: string | null; yuk_t: number | null };
};
export type BronKorinish = {
  id: number; holat: string; narx_qqs_siz: number; qqs_foiz: number; tolov_shakli: 'naqd' | 'otkazma'; qabul_kod: string; tashuvchi: string; telefon: string | null; daraja: number;
  mashina: string; yuklandi_vaqt: string | null; yetkazildi_vaqt: string | null; bekor_sabab: string | null;
};
export type DalilKorinish = { id: number; tur: 'yuklash' | 'yetkazish' | 'nizo'; r2_kalit: string | null; document_id: number | null; sha256: string | null; yaratildi: string };
export type TolovKorinish = {
  id: number; holat: TolovHolat; summa_qqs_siz: number; summa_jami: number; komissiya_foiz: number; komissiya_summa: number | null; tashuvchiga_summa: number | null; provider: string | null;
};
export type YukTafsilot = {
  yuk: YukToliq; takliflar: TaklifQator[]; bron: BronKorinish | null; dalil: DalilKorinish[]; tolov: TolovKorinish | null;
  baho: Array<{ kimdan_turi: 'ega' | 'tashuvchi'; ball: number; izoh: string | null }>;
  nizo: { id: number; holat: 'ochiq' | 'hal'; sabab: string; qaror: string | null } | null;
  hodisalar: Array<{ tur: string; meta: Record<string, unknown>; yaratildi: string }>;
};
export type NarxSozlama = { parametrlar: Record<string, unknown>; komissiya_foiz: number };

export type Natija<T> = { ok: true; natija: T } | { ok: false; code?: string; error?: string };
type Bolim = 'yuklarim' | 'yuk' | 'sozlama';
type Filtr = { id?: number; limit?: number; holat?: YukHolat };

async function oqi<T>(kompaniyaId: number, bolim: Bolim, filtr: Filtr = {}): Promise<Natija<T>> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'yb_ol_v1', kompaniya_id: kompaniyaId, bolim, filtr }),
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; natija?: (T & { ok?: boolean; code?: string }); error?: string; code?: string } | null;
    if (!j?.ok || !j.natija) return { ok: false, code: j?.code ?? 'HTTP_' + r.status, error: j?.error };
    if (j.natija.ok === false) return { ok: false, code: j.natija.code };
    return { ok: true, natija: j.natija };
  } catch { return { ok: false, code: 'NETWORK' }; }
}

export const ybYuklarim = (k: number, f: Filtr = {}) => oqi<{ yuklar: YukQator[] }>(k, 'yuklarim', f);
export const ybYuk = (k: number, id: number) => oqi<YukTafsilot>(k, 'yuk', { id });
export const ybSozlama = (k: number) => oqi<NarxSozlama>(k, 'sozlama');

export type YozNatija = { ok: boolean; id?: number; versiya?: number; holat?: string; code?: string; error?: string; takror?: boolean; [k: string]: unknown };
export type YbAmal = 'saqla' | 'elon' | 'javob' | 'bekor' | 'tasdiq' | 'baho' | 'nizo';

/** Bitta yozuv buyrug'i. `operationId` ni chaqiruvchi saqlasa, qayta urinish takroriy yozuv yaratmaydi. */
export async function ybYoz(kompaniyaId: number, amal: YbAmal, data: Record<string, unknown>, operationId: string = yangiOperationId()): Promise<YozNatija> {
  try {
    return await yozAmali({ amal: `yb_yuk_${amal}_v1`, kompaniya_id: kompaniyaId, operation_id: operationId, data }) as unknown as YozNatija;
  } catch (e) { return { ok: false, code: 'NETWORK', error: e instanceof Error ? e.message : undefined }; }
}

export type MarshrutJavob = { ok: true; km: number; daqiqa: number; manba: 'yol' | 'taxminiy'; kesh: boolean } | { ok: false; code?: string; error?: string };
export async function ybMarshrut(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<MarshrutJavob> {
  try {
    const r = await fetch('/api/yuk-marshrut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, b }) });
    return await r.json() as MarshrutJavob;
  } catch { return { ok: false, code: 'NETWORK' }; }
}

/** Server kodlari → o'zbekcha xabar (kalitlar lug'atda: lugat/qism/yuk-birjasi.json). */
export const YB_XATO_XABARI: Readonly<Record<string, string>> = {
  NETWORK: 'Tarmoq xatosi. Qayta urining.',
  NOM_REQUIRED: 'Yuk nomini kiriting.',
  MARSHRUT_KERAK: 'Qayerdan va qayerga manzilini kiriting.',
  HAJM_KERAK: 'Tonna yoki hajmni kiriting.',
  SANA_KERAK: 'Yuklash sanasini kiriting.',
  SANA_NOTOGRI: 'Sana oralig‘i noto‘g‘ri.',
  ESCROW_FAQAT_OTKAZMA: 'Platforma orqali to‘lov faqat o‘tkazma bilan ishlaydi.',
  TOLOV_SHAKLI_NOTOGRI: 'To‘lov shakli noto‘g‘ri.',
  OBYEKT_SCOPE_MISMATCH: 'Obyekt sizning kompaniyangizniki emas.',
  VERSION_CONFLICT: 'Ma’lumot boshqa joyda o‘zgargan. Sahifani yangilang.',
  HOLAT: 'Bu amal hozirgi holatda mumkin emas.',
  NOT_FOUND: 'Yuk topilmadi.',
  TAKLIF_TOPILMADI: 'Taklif topilmadi yoki eskirgan.',
  SIGIM_YETMAYDI: 'Mashina sig‘imi yuk uchun yetmaydi.',
  NARX_KERAK: 'Narxni kiriting.',
  SABAB_KERAK: 'Sababni yozing.',
  BALL_NOTOGRI: 'Baho 1 dan 5 gacha bo‘lishi kerak.',
  BAHO_BERILGAN: 'Baho allaqachon berilgan.',
  PERMISSION_DENIED: 'Bu amal uchun ruxsatingiz yo‘q.',
};
export function ybXato(r: { error?: string; code?: string }): string {
  return (r.code && YB_XATO_XABARI[r.code]) || r.error || 'Amalni bajarib bo‘lmadi.';
}