/**
 * Profil klienti — `GET/POST /api/profil` (akkaunt markazi). Server kontrakti:
 *  GET  → { ok, profil, sessiya } | 401 SESSIYA_YOQ | 404 (eski deploy: «Server yangilanmagan»)
 *  POST → { amal: 'yangila' | 'parol' | 'boshqa_sessiyalar_chiqish' | 'google_uzish' | 'hisob_birlashtir' | 'google_ulash', ... }
 * Soxta ma'lumot yo'q: javob kelmasa — xato kodi; noma'lum qiymat — null (UI «—» ko'rsatadi).
 */
import { useQuery } from '@tanstack/react-query';
import { t } from '../i18n/til';

export type ProfilTil = 'uz' | 'ru' | 'en';
export type Profil = {
  id: number;
  login: string | null;
  email: string | null;
  ism: string | null;
  telefon: string | null;
  telefon_tasdiqlangan: boolean;
  til: ProfilTil | null;
  avatar_rang: string | null;
  google_ulangan: boolean;
  parol_bor: boolean;
  parol_yangilandi: string | null;
  yaratildi: string;
};
export type ProfilSessiya = { boshlangan: string; tugaydi: string };
export type ProfilJavobi = { profil: Profil; sessiya: ProfilSessiya | null };

export type ProfilYangilash = { ism?: string; telefon?: string; til?: ProfilTil; avatar_rang?: string };
export type KochirilganKompaniya = { kompaniya_id: number; rol: string };
export type BirlashtirNatija = { kochirilgan_kompaniyalar: KochirilganKompaniya[]; qolgan_rollar: unknown[] };

/** Server javobining umumiy shakli (muvaffaqiyatsiz holatda `code` + HTTP `status`). */
export type AmalNatija<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; code: string; status: number; boshqa_login?: string | null };

export class ProfilXatosi extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}

/** Server hali yangilanmagan (404) — UI «Server yangilanmagan» notasi va faqat-o‘qish rejimi. */
export const SERVER_YANGILANMAGAN = 'SERVER_YANGILANMAGAN';

export const PROFIL_KALIT = ['profil'] as const;

/** Kod → o‘zbekcha (lotin) xabar. Ko‘rsatishda `xatoMatn()` t() orqali o‘tkazadi. */
const XATO_XABARLARI: Readonly<Record<string, string>> = {
  SESSIYA_YOQ: 'Sessiya tugagan. Qaytadan kiring.',
  [SERVER_YANGILANMAGAN]: 'Server yangilanmagan: profil API hali yoqilmagan.',
  ISM_NOTOGRI: 'Ism 2 dan 80 gacha belgidan iborat bo‘lishi kerak.',
  TELEFON_NOTOGRI: 'Telefon raqami noto‘g‘ri (7–15 raqam, boshida + bo‘lishi mumkin).',
  TIL_NOTOGRI: 'Til noto‘g‘ri tanlangan.',
  RANG_NOTOGRI: 'Rang noto‘g‘ri tanlangan.',
  ESKI_PAROL_XATO: 'Joriy parol noto‘g‘ri.',
  PAROL_QISQA: 'Yangi parol kamida 8 belgi bo‘lishi kerak.',
  PAROL_UZUN: 'Yangi parol 128 belgidan oshmasligi kerak.',
  PAROL_BIR_XIL: 'Yangi parol joriy paroldan farq qilishi kerak.',
  KOP_URINISH: 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.',
  GOOGLE_PAROLSIZ: 'Google’ni uzishdan oldin parol o‘rnating — aks holda akkauntga kira olmay qolasiz.',
  GOOGLE_BOSHQA_HISOB: 'Bu Google pochta boshqa hisobga ulangan. Ikkala hisobni birlashtirishingiz mumkin.',
  LOGIN_PAROL_XATO: 'Login yoki parol noto‘g‘ri.',
  OZI: 'Bu sizning joriy hisobingiz — o‘zini o‘ziga birlashtirib bo‘lmaydi.',
  PAROLSIZ_HISOB: 'Bu hisobda parol yo‘q, shuning uchun login bilan birlashtirib bo‘lmaydi.',
  TARMOQ: 'Tarmoq xatosi. Ulanishni tekshirib qayta urinib ko‘ring.',
  NOMA_LUM: 'Amal bajarilmadi. Qayta urinib ko‘ring.',
};

export function xatoMatn(code: string | null | undefined): string {
  const m = code ? XATO_XABARLARI[code] : undefined;
  return t(m ?? XATO_XABARLARI.NOMA_LUM);
}

/* ───────── so‘rovlar ───────── */
export async function profilOl(): Promise<ProfilJavobi> {
  let r: Response;
  try { r = await fetch('/api/profil', { credentials: 'same-origin' }); } catch { throw new ProfilXatosi('TARMOQ', 0); }
  if (r.status === 404) throw new ProfilXatosi(SERVER_YANGILANMAGAN, 404);
  const j = await r.json().catch(() => null) as { ok?: boolean; code?: string; profil?: Profil; sessiya?: ProfilSessiya | null } | null;
  if (r.status === 401) throw new ProfilXatosi(j?.code ?? 'SESSIYA_YOQ', 401);
  if (!r.ok || !j || j.ok !== true || !j.profil) throw new ProfilXatosi(j?.code ?? 'NOMA_LUM', r.status);
  return { profil: j.profil, sessiya: j.sessiya ?? null };
}

export function useProfil() {
  return useQuery({
    queryKey: PROFIL_KALIT,
    queryFn: profilOl,
    staleTime: 60_000,
    retry: (n, e) => !(e instanceof ProfilXatosi && (e.status === 404 || e.status === 401)) && n < 1,
  });
}

async function amalYubor<T extends object>(body: Record<string, unknown>): Promise<AmalNatija<T>> {
  let r: Response;
  try {
    r = await fetch('/api/profil', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch { return { ok: false, code: 'TARMOQ', status: 0 }; }
  const j = await r.json().catch(() => null) as ({ ok?: boolean; code?: string; boshqa_login?: string | null } & Record<string, unknown>) | null;
  if (r.status === 404) return { ok: false, code: SERVER_YANGILANMAGAN, status: 404 };
  if (!j || j.ok !== true) {
    return { ok: false, code: r.status === 429 ? 'KOP_URINISH' : (j?.code ?? 'NOMA_LUM'), status: r.status, boshqa_login: j?.boshqa_login ?? null };
  }
  return j as unknown as AmalNatija<T>;
}

export const profilYangila = (p: ProfilYangilash) => amalYubor<{ profil: Profil }>({ amal: 'yangila', ...p });
export const parolOzgartir = (p: { eski?: string; yangi: string }) => amalYubor({ amal: 'parol', ...(p.eski ? { eski: p.eski } : {}), yangi: p.yangi });
export const boshqaSessiyalarChiqish = () => amalYubor({ amal: 'boshqa_sessiyalar_chiqish' });
export const googleUzish = () => amalYubor({ amal: 'google_uzish' });
export const hisobBirlashtir = (p: { login: string; parol: string }) => amalYubor<BirlashtirNatija>({ amal: 'hisob_birlashtir', login: p.login, parol: p.parol });
export const googleUlash = (credential: string) => amalYubor({ amal: 'google_ulash', credential });

/* ───────── sof tekshiruvlar (UI va testlar uchun) ───────── */
export const ISM_MIN = 2;
export const ISM_MAX = 80;
export const PAROL_MIN = 8;
export const PAROL_MAX = 128;

/** Xato bo‘lsa — kod; to‘g‘ri bo‘lsa — null. */
export function ismTekshir(ism: string): 'ISM_NOTOGRI' | null {
  const n = Array.from(ism.trim()).length;
  return n >= ISM_MIN && n <= ISM_MAX ? null : 'ISM_NOTOGRI';
}
/** Bo‘sh telefon — ruxsat (ixtiyoriy). To‘ldirilsa: 7..15 raqam, boshida ixtiyoriy +, ajratgichlar ( ) - bo‘shliq. */
export function telefonTekshir(telefon: string): 'TELEFON_NOTOGRI' | null {
  const s = telefon.trim();
  if (!s) return null;
  if (!/^\+?[0-9\s()-]+$/.test(s)) return 'TELEFON_NOTOGRI';
  const raqam = s.replace(/\D/g, '').length;
  return raqam >= 7 && raqam <= 15 ? null : 'TELEFON_NOTOGRI';
}
export const RANG_RE = /^#[0-9a-fA-F]{6}$/;

/** Avatar ranglari: Firuza (firuza) ranglariga uyg‘un 10 ta. */
export const AVATAR_RANGLAR: ReadonlyArray<{ rang: string; nom: string }> = [
  { rang: '#14B8A6', nom: 'Firuza' },
  { rang: '#0891B2', nom: 'Moviy-yashil' },
  { rang: '#0EA5E9', nom: 'Osmon' },
  { rang: '#3B82F6', nom: 'Ko‘k' },
  { rang: '#6366F1', nom: 'Indigo' },
  { rang: '#8B5CF6', nom: 'Binafsha' },
  { rang: '#D946EF', nom: 'Pushti-binafsha' },
  { rang: '#F43F5E', nom: 'Qizil-pushti' },
  { rang: '#F59E0B', nom: 'Qahrabo' },
  { rang: '#65A30D', nom: 'Yashil' },
];

/** Rang ustida o‘qiladigan matn rangi (WCAG nisbiy yorqinlik bo‘yicha). */
export function rangUstidaMatn(hex: string): string {
  if (!RANG_RE.test(hex)) return '#FFFFFF';
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return L > 0.4 ? '#0B1F1D' : '#FFFFFF';
}

export type ParolTalab = { id: string; matn: string; bajarildi: boolean; majburiy: boolean };
export function parolTalablari(yangi: string, eski?: string): ParolTalab[] {
  return [
    { id: 'uzunlik', matn: 'Kamida 8 belgi', bajarildi: yangi.length >= PAROL_MIN, majburiy: true },
    { id: 'maks', matn: '128 belgidan oshmasin', bajarildi: yangi.length <= PAROL_MAX, majburiy: true },
    { id: 'farq', matn: 'Joriy paroldan farq qilsin', bajarildi: !eski || yangi !== eski, majburiy: !!eski },
    { id: 'harf', matn: 'Harf bor (tavsiya)', bajarildi: /\p{L}/u.test(yangi), majburiy: false },
    { id: 'raqam', matn: 'Raqam bor (tavsiya)', bajarildi: /\d/.test(yangi), majburiy: false },
    { id: 'belgi', matn: 'Belgi bor: ! ? # % (tavsiya)', bajarildi: /[^\p{L}\d\s]/u.test(yangi), majburiy: false },
  ];
}
/** 0..4 (faqat mijoz maslahati — server yagona hakam). */
export function parolKuchi(yangi: string): 0 | 1 | 2 | 3 | 4 {
  if (!yangi) return 0;
  let b = 0;
  if (yangi.length >= PAROL_MIN) b++;
  if (yangi.length >= 12) b++;
  if (/\p{L}/u.test(yangi) && /\d/.test(yangi)) b++;
  if (/[^\p{L}\d\s]/u.test(yangi) || (/\p{Lu}/u.test(yangi) && /\p{Ll}/u.test(yangi))) b++;
  if (yangi.length < PAROL_MIN) return 1;
  return Math.max(1, b) as 1 | 2 | 3 | 4;
}

/** User-agent'dan oddiy «Brauzer · Tizim». */
export function qurilmaNomi(ua: string | null | undefined): string {
  const s = ua ?? '';
  if (!s) return '—';
  const brauzer = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\/|CriOS/.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : null;
  const tizim = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iOS'
    : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : null;
  return [brauzer, tizim].filter(Boolean).join(' · ') || '—';
}
