/**
 * BUYURTMA API (zayavka -> yetkazuvchi). Hammasi /api/sb-yoz (POST) orqali: yozish (yarat/otish/olish_yoz/qabul) va
 * o'qish (royxat/tafsilot - RPC prodda VOLATILE, shuning uchun GET /api/sb ga qo'yib bo'lmaydi; shlyuz bu ikkisini faqat o'qiydi).
 * Actor - sessiyadan; a'zolik, ruxsat, faol aloqa va holat mashinasi - serverda va bazada. Narx NDS siz; null = noma'lum (0 emas).
 * Server: supabase/migrations/20261108410000_t2_buyurtma_p3_v1.sql. Holat mashinasi: lib/yetkazuvchi/buyurtma-holat.ts.
 */
import { yozAmali, yangiOperationId, type AktNatija } from './supabase';
import type { BuyurtmaHolat } from '../lib/yetkazuvchi/buyurtma-holat';

export type BuyurtmaYonalish = 'meniki' | 'menga';
export type QabulQatorHolat = 'butun' | 'shikast' | 'kam';

export type BuyurtmaRoyxatQator = {
  id: number; tur: string; holat: BuyurtmaHolat; bosqich: string | null; obyekt_id: number | null;
  summa_nds_siz: number | null; yetkazish_narx: number | null; qqs_foiz: number | null; versiya: number; yaratildi: string;
  xaridor_kompaniya_id: number; ijrochi_kompaniya_id: number; qator_soni: number;
};
export type BuyurtmaQator = {
  id: number; qator_no: number; nom: string; birlik: string; miqdor: number; narx: number | null; muddat_kun: number | null;
  resurs_kodi: string | null; qabul_miqdor: number | null; qabul_holat: QabulQatorHolat | null;
};
export type BuyurtmaTafsilot = {
  tomon: 'xaridor' | 'ijrochi';
  buyurtma: {
    id: number; tur: string; holat: BuyurtmaHolat; bosqich: string | null; obyekt_id: number | null; summa_nds_siz: number | null;
    yetkazish_narx: number | null; qqs_foiz: number | null; shart: Record<string, unknown>; olish: Record<string, unknown>; izoh: string | null;
    versiya: number; faktura_id: number | null; yaratildi: string; xaridor_kompaniya_id: number; ijrochi_kompaniya_id: number;
  };
  qatorlar: BuyurtmaQator[];
};

/** Server natijasi: `code` (masalan VERSIYA_ESKI, ALOQA_KERAK, OLISH_KERAK) + yangi `versiya`. */
export type BuyurtmaNatija = AktNatija & { id?: number; versiya?: number; code?: string; ogohlantirish?: string[] };
type Javob<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

/** Server `code` -> foydalanuvchiga tushunarli xabar (UI t() bilan o'raydi; kalitlar lugat/qism/taminot-buyurtma.json da). */
export const BUYURTMA_XATO_XABARI: Readonly<Record<string, string>> = {
  VERSIYA_ESKI: 'Buyurtma boshqa joyda o‘zgargan. Sahifani yangilang.',
  ALOQA_KERAK: 'Bu yetkazuvchi bilan faol aloqa yo‘q. Avval taklif yuboring.',
  ALOQA_YOPIQ: 'Yetkazuvchi bilan aloqa yopilgan.',
  IJROCHI_NOTOGRI: 'Yetkazuvchi tanlanmadi.',
  OLISH_KERAK: 'Qayerdan olib ketilishini kiriting.',
  OTISH_TAQIQ: 'Bu qadamni hozir bajarib bo‘lmaydi.',
  HOLAT: 'Buyurtma holati bu amalga mos emas.',
  TOPILMADI: 'Buyurtma topilmadi.',
  PERMISSION_DENIED: 'Bu amal uchun ruxsatingiz yo‘q.',
  QATOR_MIQDOR: 'Miqdor musbat son bo‘lishi kerak.',
};
export function buyurtmaXatosi(r: { code?: string; error?: string } | null | undefined): string {
  if (!r) return 'Xato yuz berdi';
  return (r.code && BUYURTMA_XATO_XABARI[r.code]) || r.error || 'Xato yuz berdi';
}

const yoz = (amal: string, kompaniyaId: number, yuk: Record<string, unknown>, operationId?: string): Promise<BuyurtmaNatija> =>
  yozAmali({ amal, kompaniya_id: kompaniyaId, operation_id: operationId ?? yangiOperationId(), ...yuk }) as Promise<BuyurtmaNatija>;

/* ───────────── O'qish (POST /api/sb-yoz, faqat o'qiydi; operation_id kerak emas) ───────────── */
async function oqi<T>(amal: string, kompaniyaId: number, yuk: Record<string, unknown>): Promise<Javob<T>> {
  try {
    const j = await yozAmali({ amal, kompaniya_id: kompaniyaId, ...yuk }) as BuyurtmaNatija & Record<string, unknown>;
    if (j.ok !== true) return { ok: false, error: buyurtmaXatosi(j), code: typeof j.code === 'string' ? j.code : undefined };
    return j as unknown as { ok: true } & T;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export const buyurtmalarOl = (p: { kompaniyaId: number; yonalish: BuyurtmaYonalish; holat?: BuyurtmaHolat | null; tur?: string | null; limit?: number; keyinId?: number | null }) =>
  oqi<{ qatorlar: BuyurtmaRoyxatQator[]; keyingi_id: number | null }>('buyurtma_royxat_v1', p.kompaniyaId, {
    yonalish: p.yonalish, ...(p.holat ? { holat: p.holat } : {}), ...(p.tur ? { tur: p.tur } : {}),
    ...(p.limit ? { limit: p.limit } : {}), ...(p.keyinId ? { keyin_id: p.keyinId } : {}) });
export const buyurtmaTafsilotOl = (kompaniyaId: number, buyurtmaId: number) =>
  oqi<BuyurtmaTafsilot>('buyurtma_tafsilot_v1', kompaniyaId, { buyurtma_id: buyurtmaId });

/* ───────────── Yozish (har chaqiruvda operation_id: qayta urinishda bir xil beriladi) ───────────── */
export type BuyurtmaQatorYozuv = {
  nom: string; birlik: string; miqdor: number;
  /** Birlik narxi NDS siz; yo'q bo'lsa NULL (noma'lum) - 0 yuborilmaydi. */
  narx?: number | null; muddat_kun?: number | null; resurs_kodi?: string | null; zayavka_id?: number | null; izoh?: string | null;
};
export const buyurtmaYarat = (kompaniyaId: number, p: { ijrochiKompaniyaId: number; obyektId?: number | null; aloqaId?: number | null; tur?: string;
  qatorlar: BuyurtmaQatorYozuv[]; shart?: { manzil?: string; oyna_dan?: string; oyna_gacha?: string } }, operationId?: string) =>
  yoz('buyurtma_yarat_v1', kompaniyaId, { ijrochi_kompaniya_id: p.ijrochiKompaniyaId, obyekt_id: p.obyektId ?? null, aloqa_id: p.aloqaId ?? null,
    tur: p.tur ?? 'material', qatorlar: p.qatorlar, shart: p.shart ?? {} }, operationId);
export const buyurtmaOtish = (kompaniyaId: number, p: { buyurtmaId: number; kutilganVersiya: number; holat: BuyurtmaHolat; bosqich?: string | null; izoh?: string | null }, operationId?: string) =>
  yoz('buyurtma_otish_v1', kompaniyaId, { buyurtma_id: p.buyurtmaId, kutilgan_versiya: p.kutilganVersiya, holat: p.holat, bosqich: p.bosqich ?? null, izoh: p.izoh ?? null }, operationId);
export type BuyurtmaOlish = { ombor_nomi?: string; manzil?: string; lat?: number; lng?: number; aloqa_tel?: string; tayyor_dan?: string; tayyor_gacha?: string };
export const buyurtmaOlishYoz = (kompaniyaId: number, p: { buyurtmaId: number; kutilganVersiya: number; olish: BuyurtmaOlish }, operationId?: string) =>
  yoz('buyurtma_olish_yoz_v1', kompaniyaId, { buyurtma_id: p.buyurtmaId, kutilgan_versiya: p.kutilganVersiya, olish: p.olish }, operationId);
export type BuyurtmaQabulQator = { buyurtma_qator_id: number; qabul_miqdor: number; holat?: QabulQatorHolat; izoh?: string };
export const buyurtmaQabul = (kompaniyaId: number, p: { buyurtmaId: number; kutilganVersiya: number; qatorlar: BuyurtmaQabulQator[]; izoh?: string | null; hujjatIdlar?: number[] }, operationId?: string) =>
  yoz('buyurtma_qabul_v1', kompaniyaId, { buyurtma_id: p.buyurtmaId, kutilgan_versiya: p.kutilganVersiya, qatorlar: p.qatorlar, izoh: p.izoh ?? null,
    ...(p.hujjatIdlar?.length ? { hujjat_idlar: p.hujjatIdlar } : {}) }, operationId);
