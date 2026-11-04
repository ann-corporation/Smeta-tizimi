/**
 * Transport moduli — gateway mijozi.
 * O'qish: `/api/sb` soro `transport_ol_v1` (actor sessiyadan; a'zolik + logistics.read | machinery.read RPC ichida).
 * Yozish: `/api/sb-yoz` amal `transport_*_v1` (idempotent: operation_id; versiya — optimistik qulf). Obyekt xarajatiga o'tkazish — mavjud t2_xarajat_kirit_v1 orqali.
 * Pul: ichki tannarx QQS siz; narx_qqs_siz + qqs_foiz → QQS bilan. Noma'lum qiymat — null (UI «kiritilmagan»).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yozAmali, yangiOperationId } from './supabase';
import type { Tannarx } from '../lib/transport/xarajat';
import type { ReysHolat } from '../lib/transport/holat';

export type Mashina = {
  id: number; kompaniya_id: number; nomi: string; davlat_raqami: string | null; turi: string; yuk_t: number | null; yuk_m3: number | null; yoqilgi_turi: string;
  norma_100km: number | null; norma_motosoat: number | null; odometr_km: number | null; motosoat: number | null; egalik: 'oz' | 'ijara';
  ijara_km: number | null; ijara_soat: number | null; ijara_kun: number | null; amort_km: number | null; amort_soat: number | null; kutish_soat_narx: number | null;
  texnika_id: number | null; haydovchi_id: number | null; holat: 'faol' | 'remontda' | 'nofaol'; versiya: number;
};
export type Haydovchi = {
  id: number; ism: string; telefon: string | null; kadr_id: number | null; foydalanuvchi_id: number | null; tolov_turi: 'reys' | 'km' | 'soat' | 'oylik';
  tolov_stavka: number | null; ijtimoiy_foiz: number; holat: 'faol' | 'nofaol'; versiya: number;
};
export type Hujjat = {
  id: number; egasi_turi: 'mashina' | 'haydovchi'; egasi_id: number; turi: string; raqam: string | null; boshlanish: string | null; muddat: string; izoh: string | null;
  holat: 'faol' | 'bekor'; versiya: number; qolgan_kun: number; signal: 'otgan' | 'yaqin' | 'ok';
};
export type Tarif = {
  id: number; nom: string; zona: string | null; mashina_turi: string | null; km_narx: number | null; tonna_km_narx: number | null; soat_narx: number | null; reys_narx: number | null;
  minimal_summa: number | null; marja_foiz: number | null; qqs_foiz: number; qqs_kiritilgan: boolean; holat: 'faol' | 'nofaol'; versiya: number;
};
export type YoqilgiNarx = { id: number; yoqilgi_turi: string; sana: string; narx: number; izoh: string | null };
export type Bekat = {
  id: number; tartib: number; turi: 'yuklash' | 'tushirish' | 'oraliq'; nom: string; obyekt_id: number | null; sklad_id: number | null; lat: number | null; lng: number | null; manzil: string | null;
  reja_vaqt: string | null; kelish_vaqt: string | null; ketish_vaqt: string | null; holat: 'kutilmoqda' | 'yetib_keldi' | 'bajarildi' | 'otkazildi';
  qabul_qiluvchi: string | null; tasdiq_turi: 'foto' | 'imzo' | null; tasdiq_ref: string | null; izoh: string | null;
};
export type Yuk = { id: number; yuklash_tartib: number | null; tushirish_tartib: number | null; nom: string; birlik: string | null; miqdor: number | null; ogirlik_t: number | null; hajm_m3: number | null; obyekt_id: number | null };
export type Taqsim = { id: number; obyekt_id: number; ulush: number; summa_qqs_siz: number; asos: 'ogirlik' | 'teng'; xarajat_id: number | null; holat: 'hisoblangan' | 'otkazilgan' };
export type TannarxServer = {
  km: number | null; km_manba: 'fakt' | 'reja' | null; soat: number | null; kun: number;
  yoqilgi: { norma_l: number | null; fakt_l: number | null; litr: number | null; narx: number | null; narx_manba: string | null; summa: number | null; ogish_foiz: number | null };
  haydovchi: number | null; amortizatsiya: number | null; kutish: number | null; yol_haqi: number | null; boshqa: number | null; jami: number; toliq: boolean; yetishmaydi: string[];
};
export type Reys = {
  id: number; raqam: string | null; holat: ReysHolat; sana: string; versiya: number; mashina_id: number; mashina_nomi: string; davlat_raqami: string | null; haydovchi_id: number | null; haydovchi_ism: string | null;
  buyurtmachi_turi: 'ichki' | 'tashqi'; kontragent_id: number | null; mijoz_nom: string | null; talab_turi: string; talab_ref: string | null; tarif_id: number | null;
  reja_km: number | null; reja_daqiqa: number | null; marshrut_manba: 'yol' | 'taxminiy' | 'qolda' | null; km_boshi: number | null; km_oxiri: number | null; moto_boshi: number | null; moto_oxiri: number | null;
  fakt_km: number | null; bosh_km: number | null; ish_soat: number | null; boshlandi: string | null; tugadi: string | null; kutish_daqiqa: number | null;
  yoqilgi_sarfi_l: number | null; yoqilgi_quyildi_l: number | null; yoqilgi_narx_fakt: number | null; norma_koef: number; yol_haqi: number | null; boshqa_xarajat: number | null; boshqa_izoh: string | null;
  narx_qqs_siz: number | null; qqs_foiz: number; bekor_sabab: string | null; izoh: string | null;
  tannarx: TannarxServer | null; bekatlar: Bekat[]; yuklar: Yuk[]; taqsimot: Taqsim[];
};
export type Joy = { id: number; nom: string; lat: number | null; lng: number | null };
export type KpiQator = {
  guruh: 'jami' | 'mashina' | 'haydovchi' | 'marshrut'; kalit: string | null; nom: string | null; reys: number; km: number | null; bosh_km: number | null; km_bosh_bilan: number | null;
  xarajat: number | null; daromad_qqs_siz: number | null; daromad_qqs_bilan: number | null; foyda: number | null; xarajat_daromadli: number | null; tonna_km: number | null;
  xarajat_tonna_km: number | null; fakt_l: number | null; norma_l: number | null; yuk_t: number | null; toliq_emas: number; narxsiz: number;
};
export type Kpi = {
  dan: string; gacha: string; kunlar: number; qatorlar: KpiQator[]; bandlik: Array<{ mashina_id: number; nom: string; band_kun: number; foiz: number }>;
  holatlar: Record<string, number>; hujjat_signal: { otgan: number; yaqin: number }; qqs_izoh?: string;
};

export type Natija<T> = { ok: true; natija: T } | { ok: false; code?: string; error?: string };
type Bolim = 'park' | 'sozlama' | 'joylar' | 'reyslar' | 'reys' | 'bugun' | 'kpi';
type Filtr = { dan?: string; gacha?: string; sana?: string; id?: number; mashina_id?: number; haydovchi_id?: number; holat?: ReysHolat; limit?: number };

async function oqi<T>(kompaniyaId: number, bolim: Bolim, filtr: Filtr = {}): Promise<Natija<T>> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'transport_ol_v1', kompaniya_id: kompaniyaId, bolim, filtr }),
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; natija?: (T & { ok?: boolean; code?: string }); error?: string; code?: string } | null;
    if (!j?.ok || !j.natija) return { ok: false, code: j?.code ?? 'HTTP_' + r.status, error: j?.error };
    if (j.natija.ok === false) return { ok: false, code: j.natija.code };
    return { ok: true, natija: j.natija };
  } catch { return { ok: false, code: 'NETWORK' }; }
}

export const transportPark = (k: number) => oqi<{ mashinalar: Mashina[]; haydovchilar: Haydovchi[]; hujjatlar: Hujjat[] }>(k, 'park');
export const transportSozlama = (k: number) => oqi<{ tariflar: Tarif[]; yoqilgi_narxlari: YoqilgiNarx[] }>(k, 'sozlama');
export const transportJoylar = (k: number) => oqi<{ obyektlar: Joy[] }>(k, 'joylar');
export const transportReyslar = (k: number, f: Filtr = {}) => oqi<{ reyslar: Reys[] }>(k, 'reyslar', f);
export const transportBugun = (k: number, sana?: string) => oqi<{ reyslar: Reys[] }>(k, 'bugun', sana ? { sana } : {});
export const transportKpi = (k: number, dan: string, gacha: string) => oqi<Kpi>(k, 'kpi', { dan, gacha });

export type YozNatija = { ok: boolean; id?: number; versiya?: number; code?: string; error?: string; takror?: boolean; [k: string]: unknown };
type Amal = 'mashina_saqla' | 'haydovchi_saqla' | 'hujjat_saqla' | 'yoqilgi_narx_saqla' | 'tarif_saqla' | 'reys_saqla' | 'reys_yurish' | 'reys_yop' | 'reys_bekor' | 'xarajat_otkaz';

/** Bitta yozuv buyrug'i. `operationId` ni chaqiruvchi saqlasa, qayta urinish takroriy yozuv yaratmaydi. */
export async function transportYoz(kompaniyaId: number, amal: Amal, data: Record<string, unknown>, operationId: string = yangiOperationId()): Promise<YozNatija> {
  try {
    return await yozAmali({ amal: `transport_${amal}_v1`, kompaniya_id: kompaniyaId, operation_id: operationId, data }) as unknown as YozNatija;
  } catch (e) { return { ok: false, code: 'NETWORK', error: e instanceof Error ? e.message : undefined }; }
}

/** Server tannarxi (snake_case) → lib/transport tannarxi (camelCase) — UI bitta shaklda ishlaydi. */
export function tannarxKorinish(t: TannarxServer): Tannarx {
  return {
    km: t.km, kmManba: t.km_manba, soat: t.soat, kun: t.kun,
    yoqilgi: { normaL: t.yoqilgi.norma_l, faktL: t.yoqilgi.fakt_l, litr: t.yoqilgi.litr, narx: t.yoqilgi.narx, narxManba: t.yoqilgi.narx_manba as 'fakt' | 'tarix' | null, summa: t.yoqilgi.summa, ogishFoiz: t.yoqilgi.ogish_foiz },
    haydovchi: t.haydovchi, amortizatsiya: t.amortizatsiya, kutish: t.kutish, yolHaqi: t.yol_haqi, boshqa: t.boshqa, jami: t.jami, toliq: t.toliq,
    yetishmaydi: t.yetishmaydi as Tannarx['yetishmaydi'],
  };
}
