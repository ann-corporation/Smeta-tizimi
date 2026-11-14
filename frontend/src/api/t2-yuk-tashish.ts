/**
 * Yuk tashish (Logistika P1) — gateway mijozi: `/api/yuk-tashish` (haydovchi + yuk egasi kuzatuvi) va `/api/yuk-dalil` (foto/imzo R2 ga).
 * Actor sessiyadan; yakka haydovchi kompaniyasiz ishlaydi. Narx QQS siz; NULL = noma'lum. Server: 20261216400000_t2_logistika_yuk_p1_v1.
 */
import { yangiOperationId } from './supabase';

export type YtNatija<T> = { ok: true; natija: T } | { ok: false; code: string };
export type YtQadam = 'bron' | 'keldi' | 'yuklandi' | 'yolda' | 'yetkazdi';
export type MashinaQator = { id: number; davlat_raqami: string; turi: string; yuk_t: number | null; yuk_m3: number | null; holat: string };
export type TashuvchiProfil = {
  id: number; tur: 'yakka' | 'firma'; kompaniya_id: number | null; ism: string; telefon: string | null; daraja: number; reyting_ortacha: number | null; reyting_soni: number;
  onlayn: boolean; joy_lat: number | null; joy_lng: number | null; joy_vaqt: string | null;
};
export type YaqinYuk = {
  id: number; nom: string; yuk_turi: string; a_nom: string | null; b_nom: string | null; a_lat: number | null; a_lng: number | null; masofa_km: number | null; tonna: number | null;
  hajm_m3: number | null; sana_dan: string | null; sana_gacha: string | null; tolov_shakli: string; narx_rejim: 'qat_iy' | 'taklif'; mashina_sinf: string | null;
  narx_taklif_qqs_siz: number | null; qqs_foiz: number; holat: string; joydan_km: number;
};
export type MenikiBron = {
  id: number; yuk_id: number; holat: string; qadam: YtQadam; narx_qqs_siz: number; yuk: string; a_nom: string | null; b_nom: string | null;
  a_lat: number | null; a_lng: number | null; b_lat: number | null; b_lng: number | null; yetkazildi_vaqt: string | null; baholangan: boolean;
  haydovchi_id: number | null; haydovchi: string | null; mening: boolean; buyurtma_id: number | null;
};
export type EgaKuzat = {
  yuk_holat: string; buyurtma_id: number | null; qabul_so_rov: boolean;
  bron: null | { id: number; holat: string; qadam: YtQadam; qabul_kod: string; tashuvchi: string; telefon: string | null; reyting: number | null; reyting_soni: number; qabul_nom: string | null; yetkazildi_vaqt: string | null; haydovchi?: string | null };
  joy: null | { lat: number; lng: number; vaqt: string; soniya_oldin: number; iz: Array<[number, number, number]>; arxivlandi?: boolean; iz_km?: number | null; iz_daqiqa?: number | null };
};

async function chaqir<T>(amal: string, body: Record<string, unknown>): Promise<YtNatija<T>> {
  try {
    const r = await fetch('/api/yuk-tashish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ amal, ...body }) });
    const j = await r.json().catch(() => null) as { ok?: boolean; natija?: T & { ok?: boolean; code?: string }; code?: string } | null;
    if (!j?.ok || !j.natija) return { ok: false, code: j?.code ?? 'HTTP_' + r.status };
    if ((j.natija as { ok?: boolean }).ok === false) return { ok: false, code: (j.natija as { code?: string }).code ?? 'XATO' };
    return { ok: true, natija: j.natija };
  } catch { return { ok: false, code: 'NETWORK' }; }
}
const yoz = <T>(amal: string, data: Record<string, unknown>, operationId: string = yangiOperationId(), kompaniyaId?: number) =>
  chaqir<T>(amal, { data, operation_id: operationId, ...(kompaniyaId != null ? { kompaniya_id: kompaniyaId } : {}) });

export const ytProfil = () => chaqir<{ tashuvchi: TashuvchiProfil | null; mashinalar: MashinaQator[] }>('profil', {});
export const ytReys = () => chaqir<{ bronlar: MenikiBron[] }>('reys', {});
export const ytYaqin = (f: { lat?: number; lng?: number; radius_km?: number }) => chaqir<{ yuklar: YaqinYuk[] }>('yaqin', { data: f });
export const ytSaqla = (d: { ism: string; telefon?: string; davlat_raqami?: string; turi?: string; yuk_t?: number; kompaniya_id?: number }) => yoz<{ tashuvchi_id: number; daraja: number }>('saqla', d);
export const ytHolat = (onlayn: boolean, joy?: { lat: number; lng: number }) => yoz<{ onlayn: boolean }>('holat', { onlayn, ...(joy ?? {}) });
export const ytQabul = (yukId: number, harakat: 'bron' | 'taklif', narx?: number) => yoz<{ ok: true }>('qabul', { yuk_id: yukId, harakat, ...(narx != null ? { narx_qqs_siz: narx } : {}) });
export const ytQadam = (bronId: number, qadam: Exclude<YtQadam, 'bron'>, ekstra: { qabul_nom?: string; kod?: string; imzo_r2_kalit?: string } = {}) =>
  yoz<{ qadam: YtQadam }>('qadam', { bron_id: bronId, qadam, ...ekstra });
export const ytDalil = (bronId: number, tur: 'yuklash' | 'yetkazish', r2Kalit: string, sha256: string) => yoz<{ dalil_id: number }>('dalil', { bron_id: bronId, tur, r2_kalit: r2Kalit, sha256 });
export const ytBekor = (bronId: number, sabab: string) => yoz<{ ok: true }>('bekor', { bron_id: bronId, sabab });
export const ytBaho = (bronId: number, ball: number, izoh?: string) => yoz<{ ok: true }>('baho', { bron_id: bronId, ball, ...(izoh ? { izoh } : {}) });
export const ytJoy = (bronId: number, lat: number, lng: number, aniqlikM?: number) => chaqir<{ iz_soni?: number }>('joy', { data: { bron_id: bronId, lat, lng, ...(aniqlikM != null ? { aniqlik_m: Math.round(aniqlikM) } : {}) } });
export const ytEgaKuzat = (kompaniyaId: number, yukId: number) => chaqir<EgaKuzat>('ega_kuzat', { kompaniya_id: kompaniyaId, data: { yuk_id: yukId } });
export const ytYukQosh = (kompaniyaId: number, d: { yuk_id: number; narx_rejim?: 'qat_iy' | 'taklif'; mashina_sinf?: string; zayavka_id?: number; buyurtma_id?: number }) =>
  yoz<{ id: number }>('yuk_qosh', d, yangiOperationId(), kompaniyaId);

/** Foto/imzo → R2. Qaytgan kalit/xesh `ytDalil` yoki `ytQadam(imzo_r2_kalit)` ga beriladi. */
export async function ytFaylYukla(blob: Blob): Promise<{ ok: true; r2_kalit: string; sha256: string } | { ok: false; code: string }> {
  try {
    const f = new FormData();
    f.append('fayl', new File([blob], 'dalil', { type: blob.type || 'image/jpeg' }));
    f.append('operation_id', yangiOperationId());
    const r = await fetch('/api/yuk-dalil', { method: 'POST', body: f, credentials: 'same-origin' });
    const j = await r.json().catch(() => null) as { ok?: boolean; r2_kalit?: string; sha256?: string; code?: string } | null;
    if (!j?.ok || !j.r2_kalit || !j.sha256) return { ok: false, code: j?.code ?? 'HTTP_' + r.status };
    return { ok: true, r2_kalit: j.r2_kalit, sha256: j.sha256 };
  } catch { return { ok: false, code: 'NETWORK' }; }
}

export type ParkHaydovchi = { foydalanuvchi_id: number; ism: string; holat: string };
export const ytPark = () => chaqir<{ tashuvchi_id: number; tur: 'yakka' | 'firma'; haydovchilar: ParkHaydovchi[]; mashinalar: MashinaQator[] }>('park', { data: {} });
export const ytHaydovchiQosh = (login: string) => yoz<{ haydovchi_id: number }>('haydovchi_qosh', { login });
export const ytTayinla = (bronId: number, haydovchiId: number, mashinaId?: number) => yoz<{ ok: true }>('tayinla', { bron_id: bronId, haydovchi_id: haydovchiId, ...(mashinaId != null ? { mashina_id: mashinaId } : {}) });
export type BuyurtmaYuk = { buyurtma_id: number; yuk_id: number; holat: string; qabul_so_rov: boolean };
export const ytBuyurtmaYuklar = (kompaniyaId: number, ids: number[]) => chaqir<{ yuklar: BuyurtmaYuk[] }>('buyurtma_yuklar', { kompaniya_id: kompaniyaId, data: { ids } });

export const YT_XATO: Readonly<Record<string, string>> = {
  NETWORK: 'Tarmoq xatosi. Qayta urining.', AUTH_REQUIRED: 'Tizimga qayta kiring.', PERMISSION_DENIED: 'Ruxsat yo‘q.', SERVER_YANGILANMAGAN: 'Server hali yangilanmagan.',
  YB_TASHUVCHI_YOQ: 'Avval haydovchi profilini yarating.', JOY_KERAK: 'Joylashuvni yoqing.', REJIM_TAKLIF: 'Bu yuk uchun narx taklif qilinadi.', REJIM_QATIY: 'Bu yuk qat‘iy narxda.',
  HOLAT: 'Yuk endi band yoki holati o‘zgargan.', QADAM_TARTIB: 'Qadam tartibi buzildi.', DALIL_KERAK: 'Avval foto qo‘shing.', QABUL_NOM_KERAK: 'Qabul qiluvchi nomini kiriting.',
  BRON_TOPILMADI: 'Reys topilmadi.', REYS_FAOL_EMAS: 'Reys faol emas.', DARAJA_YETARLI_EMAS: 'Mashina va sig‘imni kiriting.', MASHINA_KERAK: 'Avval mashina qo‘shing.', KOD_NOTOGRI: 'Kod noto‘g‘ri.', OZ_YUKI: 'O‘z yukingizni qabul qila olmaysiz: yukni boshqa kompaniya yoki boshqa haydovchi qabul qiladi.',
  FAQAT_FIRMA: 'Haydovchi qo‘shish faqat firma profili uchun.', FIRMA_AZOSI_EMAS: 'Bu foydalanuvchi firma a‘zosi emas.', FOYDALANUVCHI_TOPILMADI: 'Foydalanuvchi topilmadi.', HAYDOVCHI_FIRMANIKI_EMAS: 'Bu haydovchi firmangizda emas.',
};
