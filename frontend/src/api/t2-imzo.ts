/**
 * api/t2-imzo.ts - shaxsiy imzo klienti (/api/imzo, /api/imzo-ochiq). ADR: docs/architecture/ADR_SHAXSIY_IMZO.md.
 * Maxfiy kalit bu yerga ham kelmaydi: imzo `lib/imzo/kalit-saqlash.ts` (qurilma) orqali qo'yiladi.
 */
import { hujjatOl } from './t2-hujjat-canonical';
import {
  imzoMazmunToTogri, imzoXabar, sha256Hex, tokenMi, type ImzoMazmun, type ImzoTomon, type ImzoUsul,
} from '../lib/imzo/yadro';
import { hujjatMazmunXeshi } from '../lib/imzo/mazmun';
import { kalitBelgila, kalitOchir, kalitYarat, qurilmaKaliti, xabarImzola } from '../lib/imzo/kalit-saqlash';

export type ImzoHolati = 'haqiqiy' | 'imzo_yaroqsiz' | 'hujjat_ozgargan' | 'hujjat_almashtirilgan' | 'hujjat_ochirilgan' | 'shubhali';
export type ImzoKorinish = {
  id?: number; token?: string; imzolovchi: string; rol: string; usul: ImzoUsul; tomon: ImzoTomon; imzolovchi_kompaniya: string; nomidan_kompaniya: string | null;
  kod: string; vaqt: string; holat: ImzoHolati; imzo_haqiqiy: boolean; zanjir_ok: boolean; kalit_bekor: boolean; shubhali: boolean;
  hujjat_holat: 'ozgarmagan' | 'ozgargan' | 'almashtirilgan' | 'ochirilgan'; mazmun_xesh: string; hujjat_sha256: string;
  hujjat_turi?: string | null; fayl_nomi?: string | null; joriy?: boolean;
};
export type QurilmaKalit = { id: string; qurilma: string; ochiq_kalit: string; yaratilgan: string; bekor_vaqt: string | null; bekor_sabab: string | null; shubhali_dan: string | null };
export type OchiqNatija =
  | { ok: true; tur: 'imzo'; hujjat: { turi: string | null; tahrir: string | null; sana: string | null; kompaniya: string | null }; imzolar: ImzoKorinish[] }
  | { ok: true; tur: 'nashr'; nashr: { turi: string | null; sana: string | null; kompaniya: string | null; joriy: boolean; joriy_token: string | null; mazmun_xesh: string | null }; imzolar: ImzoKorinish[] }
  | { ok: false; code: string; status: number };

export type Javob<T> = ({ ok: true } & T) | { ok: false; code: string; status: number };

async function chaqir<T>(url: string, init?: RequestInit): Promise<Javob<T>> {
  try {
    const r = await fetch(url, init);
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (r.ok && j && j.ok === true) return j as Javob<T>;
    return { ok: false, code: typeof j?.code === 'string' ? j.code : 'SERVER_XATO', status: r.status };
  } catch { return { ok: false, code: 'TARMOQ', status: 0 }; }
}
const post = <T>(body: Record<string, unknown>) => chaqir<T>('/api/imzo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const get = <T>(qs: string) => chaqir<T>('/api/imzo?' + qs);

export const XATO_MATNI: Readonly<Record<string, string>> = {
  SESSIYA_YOQ: 'Sessiya tugagan. Qaytadan kiring.', PAROL_XATO: 'Parol noto‘g‘ri.', QAYTA_KIRISH_KERAK: 'Xavfsizlik uchun avval tizimga qaytadan kiring, keyin kalit yarating.',
  KOP_URINISH: 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.', KALIT_LIMIT: 'Faol qurilma kalitlari 5 tadan oshmasin: eskisini bekor qiling.',
  KALIT_BAND: 'Bu kalit allaqachon ro‘yxatdan o‘tgan.', KALIT_YOQ: 'Bu qurilmadagi kalit serverda topilmadi. Yangi kalit yarating.', KALIT_BEKOR: 'Bu kalit bekor qilingan.',
  HUJJAT_TOPILMADI: 'Hujjat topilmadi yoki imzolashga ruxsatingiz yo‘q.', HUJJAT_TAYYOR_EMAS: 'Hujjat hali tayyor emas yoki yangi tahrirga almashtirilgan.',
  HUJJAT_OQILMADI: 'Hujjat faylini serverda o‘qib bo‘lmadi.', HUJJAT_MOS_EMAS: 'Yuklangan fayl serverdagi hujjat bilan mos emas - imzolanmadi.',
  ZANJIR_YANGILANDI: 'Hujjatga shu payt boshqa imzo qo‘yildi. Qayta urinib ko‘ring.', MALUMOT_ESKIRGAN: 'Ma‘lumot yangilandi. Qayta urinib ko‘ring.', VAQT_OYNASI: 'Vaqt oynasi o‘tib ketdi. Qayta urinib ko‘ring.',
  IMZO_YAROQSIZ: 'Imzo tekshiruvdan o‘tmadi.', VAKOLAT_YOQ: 'Bu kompaniya nomidan imzolash uchun faol aloqa (vakolat) yo‘q.', TOMON_NOTOGRI: 'Tomon noto‘g‘ri tanlangan.',
  SERVER_YANGILANMAGAN: 'Server hali yangilanmagan (imzo API yoqilmagan).', TARMOQ: 'Tarmoq xatosi.', SERVER_XATO: 'Server xatosi.',
  TOKEN_YETMAYDI: 'Token yetmaydi: «Tokenlar va obuna» bo‘limida sotib oling.', TOKEN_XATO: 'Token hisobini tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.',
  TOPILMADI: 'Topilmadi.', IDB_YOQ: 'Brauzer kalitni saqlay olmaydi (IndexedDB yo‘q yoki yopiq rejim).',
};
export const xatoMatni = (code: string): string => XATO_MATNI[code] ?? 'Amal bajarilmadi.';

// --- kalitlar -------------------------------------------------------------------------------------------------------

export const kalitlarOl = () => get<{ kalitlar: QurilmaKalit[] }>('amal=kalitlar');

/** Shu qurilmada kalit yaratadi va ro'yxatdan o'tkazadi (qayta autentifikatsiya: parol yoki yangi sessiya). */
export async function kalitYaratVaYubor(userId: number, qurilma: string, parol: string | null): Promise<Javob<{ id: string; ochiq: string }>> {
  let k;
  try { k = await kalitYarat(userId); } catch { return { ok: false, code: 'IDB_YOQ', status: 0 }; }
  const r = await post<{ id: string }>({ amal: 'kalit_yarat', qurilma, ochiq_kalit: k.ochiq, ...(parol ? { parol } : {}) });
  if (!r.ok) { await kalitOchir(userId); return r; }
  await kalitBelgila(userId, r.id);
  return { ok: true, id: r.id, ochiq: k.ochiq };
}

export async function kalitBekorQil(userId: number, kalitId: string, sabab: string, shubhaliDan: string | null): Promise<Javob<Record<string, never>>> {
  const r = await post<Record<string, never>>({ amal: 'kalit_bekor', kalit_id: kalitId, sabab, ...(shubhaliDan ? { shubhali_dan: shubhaliDan } : {}) });
  if (r.ok) { const q = await qurilmaKaliti(userId); if (q?.kalit_id === kalitId) await kalitOchir(userId); }
  return r;
}

// --- imzo qo'yish ---------------------------------------------------------------------------------------------------

export type ImzolashSorovi = { userId: number; kompaniyaId: number; hujjatId: number; tomon: ImzoTomon; imzoKompaniyaId?: number | null; nomidanKompaniyaId?: number | null };
export type ImzolashNatija = { ok: true; token: string; xabar: string } | { ok: false; code: string; xabar: string };

/**
XX -> server ochiq kalit bilan
 * tekshirib yozadi. Xato bo'lsa token qaytadi (tokenBilan). Qayta yuklab olish takror yechmaydi.
 */
export async function hujjatniImzola(s: ImzolashSorovi): Promise<ImzolashNatija> {
  const xato = (code: string): ImzolashNatija => ({ ok: false, code, xabar: xatoMatni(code) });
  const kalit = await qurilmaKaliti(s.userId);
  if (!kalit?.kalit_id) return xato('KALIT_YOQ');
  const t = await post<{ mazmun: ImzoMazmun }>({ amal: 'tayyorla', hujjat_id: s.hujjatId, kalit_id: kalit.kalit_id, tomon: s.tomon, imzo_kompaniya_id: s.imzoKompaniyaId ?? null, nomidan_kompaniya_id: s.nomidanKompaniyaId ?? null });
  if (!t.ok) return xato(t.code);
  const m = t.mazmun;
  if (!imzoMazmunToTogri(m) || m.hujjat_id !== s.hujjatId || m.kalit_id !== kalit.kalit_id || m.tomon !== s.tomon) return xato('IMZO_YAROQSIZ');

  const blob = await hujjatOl(s.hujjatId);
  if (!(blob instanceof Blob)) return xato('HUJJAT_OQILMADI');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if ((await sha256Hex(bytes)) !== m.hujjat_sha256 || (await hujjatMazmunXeshi(bytes)) !== m.mazmun_xesh) return xato('HUJJAT_MOS_EMAS');

  // Token SERVERDA yechiladi (/api/imzo yoz: t2_token_sarfla_v1, idempotent; imzo yozilmasa qaytariladi) - mijozda ikkilamchi yechim yo'q.
  const imzo = await xabarImzola(kalit, imzoXabar(m));
  const y = await post<{ token: string; sarflandi?: number }>({ amal: 'yoz', hujjat_id: s.hujjatId, kalit_id: m.kalit_id, tomon: m.tomon, imzo_kompaniya_id: s.imzoKompaniyaId ?? null,
    nomidan_kompaniya_id: s.nomidanKompaniyaId ?? null, vaqt: m.vaqt, nonce: m.nonce, oldingi_xesh: m.oldingi_xesh, mazmun_xesh: m.mazmun_xesh, imzo });
  if (!y.ok) return xato(y.code);
  return { ok: true, token: y.token, xabar: y.sarflandi ? `${y.sarflandi} token` : '' };
}
export const hujjatImzolariOl = (hujjatId: number) => get<{ imzolar: ImzoKorinish[] }>('amal=hujjat&hujjat_id=' + Number(hujjatId));
export const meningImzolarimOl = () => get<{ imzolar: ImzoKorinish[] }>('amal=mening');
export const tokenOchish = (token: string) => get<{ tur: 'imzo' | 'nashr'; hujjat_id: number | null; fayl_nomi: string | null; joriy?: boolean; joriy_token?: string | null }>('amal=ochish&token=' + encodeURIComponent(token));

// --- ochiq tekshiruv (kirmasdan) ------------------------------------------------------------------------------------

export async function ochiqTekshir(token: string): Promise<OchiqNatija> {
  if (!tokenMi(token)) return { ok: false, code: 'TOPILMADI', status: 404 };
  try {
    const r = await fetch('/api/imzo-ochiq?token=' + encodeURIComponent(token));
    const j = await r.json().catch(() => null) as OchiqNatija | null;
    if (r.ok && j && j.ok) return j;
    return { ok: false, code: (j as { code?: string } | null)?.code ?? 'SERVER_XATO', status: r.status };
  } catch { return { ok: false, code: 'TARMOQ', status: 0 }; }
}

/** Yuklangan fayl imzolangan mazmunga mosmi (xlsx: kanonik mazmun; boshqa: bayt xeshi). Mazmunning o'zi qaytmaydi. */
export async function faylMosmi(file: File, imzolar: readonly Pick<ImzoKorinish, 'mazmun_xesh'>[]): Promise<{ mos: boolean; xesh: string }> {
  const xesh = await hujjatMazmunXeshi(new Uint8Array(await file.arrayBuffer()));
  return { mos: imzolar.some((i) => i.mazmun_xesh === xesh), xesh };
}
