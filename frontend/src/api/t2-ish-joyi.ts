/**
 * Ish joylari («Telegram modeli», egasi 2026-10-22). /api/ish-joyi:
 * yangi ish joyi (tasdiqsiz), turi (shaxsiy ↔ tashkilot), taklif havolasi (yaratish/ro'yxat/bekor), havola orqali qo'shilish.
 */
import { yangiOperationId } from './supabase';

export type IshJoyiTuri = 'shaxsiy' | 'tashkilot';
export type TaklifRoli = 'rahbar' | 'bugalter' | 'pto' | 'prorab' | 'buyurtmachi' | 'pudratchi' | 'kuzatuvchi';
export const TAKLIF_ROLLARI: readonly TaklifRoli[] = ['pto', 'prorab', 'bugalter', 'rahbar', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'];
export type Taklif = { id: number; rol: TaklifRoli; muddat: string; max_soni: number; foydalanildi: number; izoh: string | null;
  holat: 'faol' | 'bekor' | 'muddati_otgan' | 'toldi'; yaratildi: string };
type Javob = { ok: boolean; code?: string; xabar?: string; error?: string; [k: string]: unknown };

const XATOLAR: Record<string, string> = {
  LIMIT_KUN: 'Bir kunda 3 tadan ortiq ish joyi ochib bo‘lmaydi.',
  LIMIT_JAMI: 'Bitta foydalanuvchida 20 tadan ortiq ish joyi bo‘lmaydi.',
  ROL_NOTOGRI: 'Havola orqali rahbar (boss) yoki admin berilmaydi.',
  TAKLIF_YAROQSIZ: 'Havola topilmadi yoki bekor qilingan.',
  TAKLIF_MUDDATI_OTGAN: 'Havolaning muddati tugagan. Yangi havola so‘rang.',
  TAKLIF_TOLDI: 'Havola bo‘yicha joylar tugagan. Yangi havola so‘rang.',
  RUXSAT_YOQ: 'Bu amal uchun ruxsatingiz yo‘q.',
  COMPANY_NAME_REQUIRED: 'Ish joyi nomini yozing.',
};
export const ishJoyiXato = (r: Javob) => (r.code && XATOLAR[r.code]) || r.xabar || r.error || 'Amal bajarilmadi.';

async function post(body: Record<string, unknown>): Promise<Javob> {
  try {
    const r = await fetch('/api/ish-joyi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ ok: false, error: 'Noto‘g‘ri javob' })) as Javob;
  } catch { return { ok: false, error: 'Tarmoq xatosi' }; }
}

export const ishJoyiYarat = (nom: string, turi: IshJoyiTuri) =>
  post({ amal: 'yarat', nom, turi, operation_id: yangiOperationId() }) as Promise<Javob & { kompaniya_id?: number }>;
export const ishJoyiTuri = (kompaniyaId: number, turi: IshJoyiTuri) => post({ amal: 'turi', kompaniya_id: kompaniyaId, turi });
export const taklifYarat = (p: { kompaniyaId: number; rol: TaklifRoli; muddatSoat: number; maxSoni: number; izoh?: string }) =>
  post({ amal: 'taklif_yarat', kompaniya_id: p.kompaniyaId, rol: p.rol, muddat_soat: p.muddatSoat, max_soni: p.maxSoni, izoh: p.izoh ?? null,
    operation_id: yangiOperationId() }) as Promise<Javob & { taklif_id?: number; kod?: string }>;
export const taklifBekor = (kompaniyaId: number, taklifId: number) => post({ amal: 'taklif_bekor', kompaniya_id: kompaniyaId, taklif_id: taklifId });
export const qoshil = (kod: string) =>
  post({ amal: 'qoshil', kod, operation_id: yangiOperationId() }) as Promise<Javob & { kompaniya_id?: number; nom?: string; mavjud?: boolean }>;

export async function takliflar(kompaniyaId: number): Promise<Taklif[]> {
  const r = await fetch(`/api/ish-joyi?bolim=takliflar&kompaniya_id=${kompaniyaId}`);
  const j = await r.json().catch(() => null) as (Javob & { takliflar?: Taklif[] }) | null;
  if (!j?.ok || !Array.isArray(j.takliflar)) throw new Error(j ? ishJoyiXato(j) : 'Takliflar o‘qilmadi');
  return j.takliflar;
}

/** Taklif havolasi — saytning o'z manzili bilan (kod faqat shu yerda, bazada xesh). */
export const taklifHavolasi = (kod: string, origin = typeof window !== 'undefined' ? window.location.origin : '') => `${origin}/qoshil/${encodeURIComponent(kod)}`;
