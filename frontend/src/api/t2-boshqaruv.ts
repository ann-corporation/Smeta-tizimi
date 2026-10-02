/**
 * Platforma boshqaruv paneli API (egasi, 2026-10-02). Shlyuz: /api/boshqaruv (GET — o'qish, POST — o'zgartirish).
 * Superadmin tekshiruvi bazada; bu yerda faqat tiplar va chaqiruv.
 */
export type BUmumiy = {
  foydalanuvchi: { jami: number; faol: number; google: number; yangi_7: number; yangi_30: number };
  kompaniya: { jami: number; yangi_30: number };
  obyekt: number; smeta_qator_taxmin: number;
  obunalar: { kod: string; nom: string; narx_som: number; soni: number }[];
  oylik_tushum_som: number;
  token: { berilgan: number; sotilgan: number; sarflangan: number; sarf_30: number; qoldiq: number };
  token_amal: { amal: string; token: number; soni: number }[];
  royxat_oxirgi: { id: number; vaqt: string; login: string; ism: string | null; kompaniya: string | null; google: boolean }[];
  demo_obyekt: { id: number | null; nom: string | null } | null;
};
export type BAzolik = { azolik_id: number; kompaniya_id: number; kompaniya: string; rol: string };
export type BFoydalanuvchi = {
  id: number; login: string; ism: string | null; email: string | null; holat: 'faol' | 'bekor'; yaratildi: string;
  google: boolean; parol: boolean; ozi_royxat: boolean; azoliklar: BAzolik[];
};
export type BKompaniya = {
  id: number; nom: string; kod: string; faol: boolean; inn: string | null; telefon: string | null; yaratildi: string;
  boss: string | null; azolar: number; obyektlar: number; tarif: { kod: string; nom: string; tugaydi: string | null } | null;
  balans: number; sarf_30: number;
};
export type BTokenDaftar = {
  harakatlar: { id: number; vaqt: string; kompaniya_id: number; kompaniya: string; tur: string; amal: string | null; miqdor: number; birlik_soni: number | null; izoh: string | null; kim: string | null }[];
  oylar: { oy: string; berilgan: number; sotilgan: number; sarflangan: number }[];
};
export type BTolov = { id: number; vaqt: string; kompaniya_id: number; kompaniya: string; kim: string | null; paket: string | null; token: number; summa_som: number; usul: string; tolov_malumot: string | null; holat: 'kutilmoqda' | 'tasdiqlandi' | 'rad' | 'bekor'; sabab: string | null; hal_qilindi: string | null };
export type BAudit = { id: number; vaqt: string; kompaniya_id: number; kompaniya: string | null; obyekt_id: number | null; kim: string | null; amal: string; modul: string; tafsilot: string | null };

type Javob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };

export async function boshqaruvOqi<T>(bolim: 'umumiy' | 'foydalanuvchilar' | 'kompaniyalar' | 'token' | 'audit' | 'tolovlar', p: Record<string, string | number | null | undefined> = {}): Promise<Javob<T>> {
  const q = new URLSearchParams({ bolim });
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') q.set(k, String(v));
  try {
    const r = await fetch('/api/boshqaruv?' + q.toString());
    const j = await r.json();
    return j.ok ? { ok: true, natija: j.natija as T } : { ok: false, error: j.error || j.code || 'Xato', code: j.code };
  } catch { return { ok: false, error: 'Tarmoq xatosi' }; }
}

export async function boshqaruvYoz(amal: 'foydalanuvchi_holat' | 'azolik' | 'narx' | 'tarif' | 'sozlama' | 'tolov_hal', so: Record<string, unknown>): Promise<{ ok: boolean; xabar: string }> {
  try {
    const r = await fetch('/api/boshqaruv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal, ...so }) });
    const j = await r.json();
    if (j.ok && (j.natija?.ok ?? true)) return { ok: true, xabar: 'Saqlandi' };
    return { ok: false, xabar: XATO[j.code] || XATO[j.natija?.code] || j.error || j.code || 'Bajarilmadi' };
  } catch { return { ok: false, xabar: 'Tarmoq xatosi' }; }
}

const XATO: Record<string, string> = {
  SUPERADMIN_KERAK: 'Bu amal faqat platforma superadmini uchun.',
  IZOH_MAJBURIY: 'Sababni yozing (audit uchun majburiy).',
  OZINI_BLOKLASH_MUMKIN_EMAS: 'O‘zingizni bloklay olmaysiz.',
  OZINI_PASAYTIRISH_MUMKIN_EMAS: 'O‘zingizning superadmin huquqingizni olib tashlay olmaysiz.',
  OXIRGI_SUPERADMIN: 'Bu oxirgi superadmin — olib tashlab bo‘lmaydi.',
  ROL_NOTOGRI: 'Rol noto‘g‘ri.', TOPILMADI: 'Topilmadi.', QIYMAT_NOTOGRI: 'Qiymat noto‘g‘ri.',
  ALLAQACHON_HAL_QILINGAN: 'Bu so‘rov allaqachon hal qilingan.', QAROR_NOTOGRI: 'Qaror noto‘g‘ri.',
  BEPUL_TARIF_KERAK: 'Bepul tarifni o‘chirib bo‘lmaydi — ro‘yxatdan o‘tganlar shu tarifni oladi.',
};
