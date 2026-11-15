/**
 * @username klienti (USERNAME-V1) — `/api/profil` (o'z username i, qidiruv, takliflar) va `/api/company` (kompaniyaga taklif).
 * Hamma mantiq serverda; Android/Windows ilova ham xuddi shu endpointlar (docs/architecture/USERNAME_V1.md).
 * Telefon/email hech qachon javobda qaytmaydi — faqat id, ism, @username, avatar rangi.
 */
import { t } from '../i18n/til';

export type OdamProfil = { id: number; ism: string; username: string | null; avatar_rang: string | null };
export type TelefonQidiruv = 'hammasi' | 'kompaniyadosh' | 'hech';
export type UsernameHolat = { username: string | null; ism: string | null; telefon_qidiruv: TelefonQidiruv; bugun_qoldi: number };
export type UsernameTekshiruv = { yaroqli: boolean; sabab: string | null; bosh: boolean; band: boolean; variantlar: string[] };
export type QidiruvNatija = { topildi: boolean; tur: 'username' | 'telefon' | 'email'; profil: OdamProfil | null };
export type KelganTaklif = { id: number; kompaniya_id: number; kompaniya_nom: string; rol: string; tugaydi: string; taklif_qiluvchi: OdamProfil };
export type Natija<T> = ({ ok: true } & T) | { ok: false; code: string; status: number } & Partial<{ tur: string; telefon_taklif: boolean; telefon: string | null }>;

async function yubor<T>(yol: string, body: Record<string, unknown>): Promise<Natija<T>> {
  try {
    const r = await fetch(yol, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null) as ({ ok?: boolean; code?: string } & Record<string, unknown>) | null;
    if (!j || j.ok !== true) return { ok: false, code: j?.code ?? (r.status === 404 ? 'SERVER_YANGILANMAGAN' : 'NOMA_LUM'), status: r.status, ...(j ?? {}) } as Natija<T>;
    return j as unknown as Natija<T>;
  } catch { return { ok: false, code: 'TARMOQ', status: 0 }; }
}

export const usernameOl = () => yubor<UsernameHolat>('/api/profil', { amal: 'username_ol' });
export const usernameBelgila = (username: string | null) => yubor<{ username: string | null }>('/api/profil', { amal: 'username_belgila', username, operation_id: crypto.randomUUID() });
export const usernameTekshir = (username: string, variantlar: string[] = []) => yubor<UsernameTekshiruv>('/api/profil', { amal: 'username_tekshir', username, variantlar });
export const telefonQidiruvBelgila = (telefon_qidiruv: TelefonQidiruv) => yubor<{ telefon_qidiruv: TelefonQidiruv }>('/api/profil', { amal: 'username_sozlama', telefon_qidiruv });
export const odamQidir = (qiymat: string) => yubor<QidiruvNatija>('/api/profil', { amal: 'qidir', qiymat });
export const kompaniyadoshQidir = (prefiks: string, kompaniya_id?: number) => yubor<{ royxat: OdamProfil[] }>('/api/profil', { amal: 'kompaniyadosh_qidir', prefiks, ...(kompaniya_id ? { kompaniya_id } : {}) });
export const usernameOmmaviy = (idlar: number[]) => yubor<{ username: Record<string, string> }>('/api/profil', { amal: 'username_ommaviy', idlar });
export const kelganTakliflar = () => yubor<{ royxat: KelganTaklif[] }>('/api/profil', { amal: 'taklif_royxat' });
export const taklifJavob = (taklif_id: number, qabul: boolean) => yubor<{ holat: 'qabul' | 'rad'; kompaniya_id?: number | null }>('/api/profil', { amal: 'taklif_javob', taklif_id, qabul, operation_id: crypto.randomUUID() });
/** @username / telefon / email (aniq) bo'yicha kompaniyaga KUTILADIGAN taklif. Hisob topilmasa va telefon bo'lsa — `telefon_taklif: true`. */
export const kompaniyaTaklifYubor = (kompaniya_id: number, qiymat: string, rol: string) =>
  yubor<{ taklif_id: number; holat: string; profil: OdamProfil }>('/api/company', { action: 'member_invite', kompaniya_id, qiymat, rol });

const XATO: Readonly<Record<string, string>> = {
  USERNAME_QISQA: 'Username kamida 5 belgi bo‘lsin.',
  USERNAME_UZUN: 'Username 32 belgidan oshmasin.',
  USERNAME_FORMAT: 'Faqat kichik lotin harflari, raqamlar va pastki chiziq (_) mumkin.',
  USERNAME_BOSHLANISH: 'Username harf bilan boshlanishi kerak.',
  USERNAME_UNDERSCORE: 'Ketma-ket ikki pastki chiziq va oxirgi pastki chiziq mumkin emas.',
  USERNAME_BAND_SOZ: 'Bu nom tizim uchun band qilingan.',
  USERNAME_BAND: 'Bu username band.',
  USERNAME_LIMIT: 'Bugun username’ni o‘zgartirish limiti tugadi (kuniga 5 marta).',
  LIMIT: 'Juda ko‘p so‘rov. Birozdan keyin qayta urinib ko‘ring.',
  KOP_URINISH: 'Juda ko‘p so‘rov. Birozdan keyin qayta urinib ko‘ring.',
  QIYMAT_NOTOGRI: '@username, telefon raqami yoki email kiriting.',
  TOPILMADI: 'Bunday foydalanuvchi topilmadi.',
  ALREADY_MEMBER: 'Bu odam allaqachon shu kompaniya a’zosi.',
  RUXSAT_YOQ: 'Odam taklif qilish uchun ruxsatingiz yo‘q.',
  ROL_NOTOGRI: 'Bu lavozimni taklif orqali berib bo‘lmaydi.',
  TAKLIF_TOPILMADI: 'Taklif topilmadi yoki allaqachon javob berilgan.',
  TAKLIF_MUDDATI_OTGAN: 'Taklif muddati tugagan.',
  TAKLIF_YAROQSIZ: 'Taklif qiluvchining huquqi o‘zgargan — taklif yaroqsiz.',
  SERVER_YANGILANMAGAN: 'Server hali yangilanmagan.',
  TARMOQ: 'Tarmoq xatosi. Qayta urinib ko‘ring.',
  NOMA_LUM: 'Amal bajarilmadi. Qayta urinib ko‘ring.',
};
export const usernameXatoMatn = (code: string | null | undefined): string => t(XATO[code ?? ''] ?? XATO.NOMA_LUM);