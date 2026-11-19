/**
 * api/t2-tekshiruv.ts - texnadzor tekshiruvi mijozi (/api/tekshiruv). Aktor sessiyadan; mijoz hech qachon actor_id yubormaydi.
 * Texnadzor faqat TAKLIF yozadi; F-2 ga yozuv - PTO qarori, mavjud f2Buyruq (preview->tasdiq) yo'lida.
 */
import type { Bayroq, PanelJavob, Rang, TekshiruvHolat } from '../lib/tekshiruv/yadro';
import type { AktTakliflari } from '../lib/tekshiruv/pto';

export type TekshiruvXato = { ok: false; status: number; code: string };
export type Natija<T> = ({ ok: true } & T) | TekshiruvXato;

async function chaqir<T>(url: string, init?: RequestInit): Promise<Natija<T>> {
  try {
    const r = await fetch(url, { credentials: 'same-origin', ...init });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (r.ok && j && j.ok === true) return j as unknown as Natija<T>;
    return { ok: false, status: r.status, code: typeof j?.code === 'string' ? j.code : 'SERVER_XATO' };
  } catch { return { ok: false, status: 0, code: 'TARMOQ_XATO' }; }
}
const post = <T>(body: Record<string, unknown>) => chaqir<T>('/api/tekshiruv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const tekshiruvOchish = (token: string) => chaqir<Omit<PanelJavob, 'ok'>>('/api/tekshiruv?token=' + encodeURIComponent(token));

export type TaklifYuki = { qator_id: number; bayroq?: Bayroq | null; izoh?: string | null; taklif_hajm?: number | null; rang?: Rang | null; hujjat_turi?: string | null; qosh?: boolean };
export const tekshiruvSaqla = (token: string, y: TaklifYuki) => post<{ id: number | null; ochirildi: boolean }>({ amal: 'saqla', token, ...y });
export const tekshiruvHolat = (token: string, holat: TekshiruvHolat, izoh?: string | null) => post<{ holat: TekshiruvHolat }>({ amal: 'holat', token, holat, izoh: izoh ?? null });
export const tekshiruvQidir = (token: string, q: string) => post<{ qatorlar: Array<{ qator_id: number; kod: string | null; nom: string | null; birlik: string | null; tur: string }> }>({ amal: 'qidir', token, q });
export const tekshiruvKodBer = (token: string, ism: string | null, soat: number) => post<{ kod: string; soat: number }>({ amal: 'kod_ber', token, ism, soat });
export const tekshiruvKodOl = (token: string, kod: string) => post<Record<string, never>>({ amal: 'kod_ol', token, kod });
/** PTO: shu aktga kelgan takliflar (F-2 muharriri). */
export const tekshiruvAktTakliflari = (kompaniyaId: number, aktId: number) => chaqir<Omit<AktTakliflari, 'ok'>>(`/api/tekshiruv?amal=akt&kompaniya_id=${kompaniyaId}&akt_id=${aktId}`);
/** PTO qarori (F-2 ga yozuv alohida: f2Buyruq preview->tasdiq). */
export const tekshiruvQaror = (taklifId: number, qaror: 'qabul' | 'rad' | 'keyinroq' | 'kutilmoqda', sabab: string | null) => post<{ qaror: string }>({ amal: 'qaror', taklif_id: taklifId, qaror, sabab });
export const tekshiruvHujjatBiriktir = (taklifId: number, faylId: number | null) => post<Record<string, never>>({ amal: 'hujjat', taklif_id: taklifId, fayl_id: faylId });

/** Eksport vaqtida: nashr tokenini F-2 (akt, versiya) ga bog'laydi. Xato eksportni to'xtatmaydi. */
export const tekshiruvBogla = (token: string, aktId: number) => post<{ yangi: boolean }>({ amal: 'bog', token, akt_id: aktId });

/** Xato kodi -> foydalanuvchi matni (i18n kaliti sifatida). */
export function tekshiruvXatoMatni(x: TekshiruvXato): string {
  switch (x.code) {
    case 'SESSIYA_YOQ': return 'Kirish kerak';
    case 'RUXSAT_YOQ': return 'Bu tekshiruvga ruxsatingiz yo‘q';
    case 'TOPILMADI': return 'Tekshiruv topilmadi';
    case 'KOP_URINISH': return 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.';
    case 'SABAB_KERAK': return 'Rad etish uchun sabab yozing';
    case 'FAYL_TOPILMADI': return 'Fayl topilmadi';
    case 'QAROR_QOYILGAN': return 'PTO bu taklifni allaqachon hal qilgan';
    case 'KOD_YAROQSIZ': case 'KOD_ISHLATILGAN': return 'Kod yaroqsiz yoki ishlatilgan';
    default: return 'Bajarib bo‘lmadi. Keyinroq urinib ko‘ring.';
  }
}
