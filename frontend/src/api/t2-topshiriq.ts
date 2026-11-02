/** P1 Topshiriq klienti (E7 §3.2). Shlyuz: /api/topshiriq. Holat o'tishi va ruxsat - bazada (RPC). */
import { yangiOperationId } from './supabase';

export type TopshiriqHolat = 'berildi' | 'qabul_qilindi' | 'rad' | 'bajarilmoqda' | 'bajarildi' | 'tasdiqlandi' | 'qaytarildi' | 'bekor';
export type Topshiriq = {
  id: number; tur: string; holat: TopshiriqHolat; sarlavha: string; matn: string | null; muddat: string | null;
  obyekt_id: number | null; obyekt_nom: string | null; beruvchi_kompaniya_id: number; beruvchi_nom: string;
  ijrochi_kompaniya_id: number; ijrochi_foydalanuvchi_id: number | null; oxirgi_izoh: string | null;
  versiya: number; yaratildi: string; yangilandi: string;
};
type Javob = { ok: boolean; code?: string; error?: string; id?: number; versiya?: number; takror?: boolean };

const XATOLAR: Record<string, string> = {
  VERSIYA_ESKI: 'Topshiriq shu orada o‘zgargan - yangilab qayta urining.',
  OTISH_MUMKIN_EMAS: 'Bu holatdan bu amalni bajarib bo‘lmaydi.',
  IZOH_KERAK: 'Rad etish sababini yozing.',
  ALOQA_YOQ: 'Bu kompaniya bilan faol aloqa yo‘q.',
  IJROCHI_EMAS: 'Bu topshiriq sizga berilmagan.',
  RUXSAT_YOQ: 'Bu amal uchun ruxsatingiz yo‘q.',
  TOPILMADI: 'Topshiriq topilmadi.',
};
export const topshiriqXato = (r: Javob) => (r.code && XATOLAR[r.code]) || r.error || 'Amal bajarilmadi.';

async function post(body: Record<string, unknown>): Promise<Javob> {
  try {
    const r = await fetch('/api/topshiriq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ ok: false, error: 'Noto‘g‘ri javob' })) as Javob;
  } catch { return { ok: false, error: 'Tarmoq xatosi' }; }
}

export async function topshiriqlarOl(kompaniyaId: number, yonalish: 'menga' | 'mendan', holat?: TopshiriqHolat): Promise<{ ok: true; qatorlar: Topshiriq[] } | { ok: false; error: string }> {
  try {
    const q = new URLSearchParams({ kompaniya_id: String(kompaniyaId), yonalish, ...(holat ? { holat } : {}) });
    const r = await fetch('/api/topshiriq?' + q.toString());
    const j = await r.json() as Javob & { qatorlar?: Topshiriq[] };
    return j.ok && Array.isArray(j.qatorlar) ? { ok: true, qatorlar: j.qatorlar } : { ok: false, error: topshiriqXato(j) };
  } catch { return { ok: false, error: 'Tarmoq xatosi' }; }
}

export const topshiriqBer = (p: { kompaniyaId: number; sarlavha: string; matn?: string; muddat?: string; obyektId?: number | null;
  ijrochiKompaniyaId?: number | null; ijrochiFoydalanuvchiId?: number | null; aloqaId?: number | null; tur?: string }) =>
  post({ amal: 'ber', kompaniya_id: p.kompaniyaId, operation_id: yangiOperationId(), tur: p.tur ?? 'ish', sarlavha: p.sarlavha, matn: p.matn,
    muddat: p.muddat, obyekt_id: p.obyektId, ijrochi_kompaniya_id: p.ijrochiKompaniyaId, ijrochi_foydalanuvchi_id: p.ijrochiFoydalanuvchiId, aloqa_id: p.aloqaId });

export const topshiriqOtish = (p: { kompaniyaId: number; topshiriq: Pick<Topshiriq, 'id' | 'versiya'>; holat: TopshiriqHolat; izoh?: string; dalil?: number[] }) =>
  post({ amal: 'otish', kompaniya_id: p.kompaniyaId, operation_id: yangiOperationId(), topshiriq_id: p.topshiriq.id,
    kutilgan_versiya: p.topshiriq.versiya, holat: p.holat, izoh: p.izoh, dalil_hujjat_idlar: p.dalil });

/** Joriy holatdan tomon bo'yicha mumkin harakatlar (UI tugmalari; haqiqiy tekshiruv bazada). */
export function harakatlar(holat: TopshiriqHolat, yonalish: 'menga' | 'mendan'): Array<{ holat: TopshiriqHolat; nom: string; izohKerak?: boolean }> {
  if (yonalish === 'menga') {
    if (holat === 'berildi') return [{ holat: 'qabul_qilindi', nom: 'Qabul qilish' }, { holat: 'rad', nom: 'Rad etish', izohKerak: true }];
    if (holat === 'qabul_qilindi' || holat === 'qaytarildi') return [{ holat: 'bajarilmoqda', nom: 'Boshlash' }];
    if (holat === 'bajarilmoqda') return [{ holat: 'bajarildi', nom: 'Bajarildi' }];
    return [];
  }
  if (holat === 'bajarildi') return [{ holat: 'tasdiqlandi', nom: 'Tasdiqlash' }, { holat: 'qaytarildi', nom: 'Qaytarish' }];
  if (['berildi', 'qabul_qilindi', 'bajarilmoqda', 'qaytarildi'].includes(holat)) return [{ holat: 'bekor', nom: 'Bekor qilish' }];
  return [];
}
