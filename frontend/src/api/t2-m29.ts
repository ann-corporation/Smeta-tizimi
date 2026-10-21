/**
 * M-29 bajarish — ombordan chiqim (egasi 2026-10-21, ADR-3: «ombor bajarilayotgan M-29 hujjati orqali kamayishi kerak»).
 * O'qish: /api/sb `t2_m29_hujjat` (kompaniya filtri serverda). Yozish: /api/sb-yoz `m29_bajar_v1` / `m29_bekor_v1`.
 * Fakt endi omborni kamaytirmaydi; shu davrdagi eski avtomatik (Fakt-trigger) chiqimlar M-29 bajarilganda bekor qilinadi.
 */
import { sbOqi, yozAmali, yangiOperationId, type AktNatija } from './supabase';

export type M29Hujjat = { id: number; obyekt_id: number; davr: string; holat: 'bajarildi' | 'bekor'; qator_soni: number; trigger_bekor_soni: number; manfiy_qoldiq: boolean; bajarildi: string };
export type M29ChiqimQator = { nomi: string; birligi: string | null; miqdor: number };
export type M29Yetmaydi = { nomi: string; birligi: string | null; kerak: number; bor: number };
export type M29TriggerQator = { nomi: string; birligi: string | null; sof: number };
export type M29BajarNatija =
  | { ok: true; hujjat_id: number; qator_soni: number; trigger_bekor_soni: number; takror?: boolean }
  | { ok: false; code?: string; xato: string; hujjat_id?: number; yetmaydi?: M29Yetmaydi[]; trigger?: M29TriggerQator[] };

/** Obyekt + davr uchun faol (bajarilgan) M-29 hujjati; yo'q bo'lsa null. O'qib bo'lmasa — xato (holat noma'lum). */
export async function m29HujjatOl(obyektId: number, davr: string): Promise<M29Hujjat | null> {
  const r = await sbOqi<M29Hujjat>({ jadval: 't2_m29_hujjat', filtr: `obyekt_id=eq.${obyektId}&davr=eq.${davr}&holat=eq.bajarildi`,
    ustunlar: 'id,obyekt_id,davr,holat,qator_soni,trigger_bekor_soni,manfiy_qoldiq,bajarildi', limit: 1 });
  if (!r.ok) throw new Error('M29_HOLAT_OQILMADI');
  return (r.qatorlar ?? [])[0] ?? null;
}

const XATOLAR: Readonly<Record<string, string>> = {
  DAVR_BAJARILGAN: 'Bu davr uchun M-29 allaqachon bajarilgan.',
  OBYEKT_BEGONA: 'Obyekt tanlangan kompaniyaga tegishli emas.',
  QATORLAR_NOTOGRI: 'Chiqim qilinadigan material yo‘q (miqdor 0 dan katta bo‘lsin).',
  PERMISSION_DENIED: 'Bajarish (fakt) ruxsatingiz yo‘q.',
};

export async function m29Bajar(p: { kompaniyaId: number; obyektId: number; davr: string; qatorlar: M29ChiqimQator[];
  operationId?: string; manfiygaRuxsat?: boolean; triggerBekor?: boolean }): Promise<M29BajarNatija> {
  const r = await yozAmali({ amal: 'm29_bajar_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, davr: p.davr, qatorlar: p.qatorlar,
    operation_id: p.operationId ?? yangiOperationId(), manfiyga_ruxsat: p.manfiygaRuxsat === true, trigger_bekor: p.triggerBekor === true }) as AktNatija & Record<string, unknown>;
  if (r.ok) return { ok: true, hujjat_id: Number(r.hujjat_id), qator_soni: Number(r.qator_soni ?? 0), trigger_bekor_soni: Number(r.trigger_bekor_soni ?? 0), takror: r.takror === true };
  const code = typeof r.code === 'string' ? r.code : undefined;
  return { ok: false, code, xato: (code && XATOLAR[code]) || r.error || 'M-29 bajarilmadi.',
    hujjat_id: r.hujjat_id == null ? undefined : Number(r.hujjat_id),
    yetmaydi: Array.isArray(r.yetmaydi) ? r.yetmaydi as M29Yetmaydi[] : undefined,
    trigger: Array.isArray(r.trigger) ? r.trigger as M29TriggerQator[] : undefined };
}

export async function m29Bekor(p: { kompaniyaId: number; hujjatId: number; sabab: string }): Promise<{ ok: boolean; xato?: string }> {
  const r = await yozAmali({ amal: 'm29_bekor_v1', kompaniya_id: p.kompaniyaId, hujjat_id: p.hujjatId, sabab: p.sabab }) as AktNatija & { code?: string };
  return r.ok ? { ok: true } : { ok: false, xato: r.code === 'SABAB_KERAK' ? 'Bekor qilish sababini yozing.' : (r.error || 'Bekor qilinmadi.') };
}

/** M-29 natijasidan chiqim qatorlari: davrning norma sarfi (foydalanuvchi o'zgartirishi mumkin). */
export function m29ChiqimTaklifi(materiallar: ReadonlyArray<{ nom: string; birlik: string | null; normaOy: number }>): M29ChiqimQator[] {
  return materiallar.filter((m) => m.normaOy > 1e-9).map((m) => ({ nomi: m.nom, birligi: m.birlik, miqdor: Math.round(m.normaOy * 1e6) / 1e6 }));
}
