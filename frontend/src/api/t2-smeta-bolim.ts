/**
 * Smeta bo'limi (razdel) yaratish (egasi 2026-10-21: «razdelni yasash va o'chirish funksiyasi ham kerak»).
 * Yozish: /api/sb-yoz `smeta_bolim_yarat_v1` → t2_smeta_bolim_yarat_v1. Bo'lim qo'shilgan (qoshimcha) qator bo'ladi;
 * o'chirish — mavjud `ishAbcOchir` orqali (asl smeta qatori bo'lsa server rad etadi).
 * Bir joyda bir xil nomli bo'lim bor bo'lsa server yangisini yaratmaydi — o'shani qaytaradi (`mavjud: true`).
 */
import { yozAmali, type AktNatija } from './supabase';

export type BolimYaratInput = {
  kompaniyaId: number; obyektId: number; nom: string;
  /** null — smetaning eng yuqori darajasi; aks holda shu bo'lim ichida. */
  otaQatorId: number | null;
  /** Shu darajadagi bo'lim — yangisi undan (va uning ichidagilaridan) keyin. null — oxiriga. */
  keyinQatorId?: number | null;
  sabab?: string; operationId: string;
};

export type BolimNatija = AktNatija & { code?: string; versiya?: number; mavjud?: boolean };

const XATOLAR: Record<string, string> = {
  NOM_REQUIRED: 'Bo‘lim nomini yozing (1–300 belgi).',
  OTA_BOLIM_EMAS: 'Bo‘lim faqat smetaning yuqori darajasida yoki boshqa bo‘lim ichida bo‘ladi.',
  ORDERING_SCOPE_INVALID: 'Yangi bo‘lim faqat shu darajadagi bo‘limdan keyin qo‘yiladi.',
  OBJECT_ACCESS_DENIED: 'Obyekt tanlangan kompaniyaga tegishli emas.',
  OPERATION_CONFLICT: 'Bu operatsiya boshqa ma’lumot bilan allaqachon bajarilgan — sahifani yangilang.',
};

export function bolimXato(r: { code?: string; xabar?: string; error?: string }): string {
  return (r.code && XATOLAR[r.code]) || r.xabar || r.error || 'Bo‘lim yaratilmadi.';
}

export async function smetaBolimYarat(p: BolimYaratInput): Promise<BolimNatija> {
  const nom = p.nom.replace(/\s+/g, ' ').trim();
  if (!nom || nom.length > 300) return { ok: false, code: 'NOM_REQUIRED', xabar: XATOLAR.NOM_REQUIRED } as BolimNatija;
  const r = await yozAmali({
    amal: 'smeta_bolim_yarat_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, nom,
    ota_qator_id: p.otaQatorId, keyin_qator_id: p.keyinQatorId ?? null, sabab: p.sabab ?? null, operation_id: p.operationId,
  }) as BolimNatija;
  return r.ok ? r : { ...r, xabar: bolimXato(r) };
}
