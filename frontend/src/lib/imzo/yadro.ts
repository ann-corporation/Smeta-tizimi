/**
 * lib/imzo/yadro.ts - SHAXSIY IMZO yadrosi (ADR_SHAXSIY_IMZO.md). SOF funksiyalar: React ham, DOM ham yo'q -
 * brauzer (imzo qo'yish, fayl xeshi) va Pages Function (imzoni ochiq kalit bilan tekshirish) AYNAN BIR XIL kodni ishlatadi.
 *
 * Imzo = ECDSA P-256 / SHA-256 (WebCrypto, imzo formati P1363: r||s, 64 bayt). Imzolanadigan xabar - `imzoXabar()`:
 * domen belgisi + JSON massiv (maydonlar tartibi qat'iy). SQL xabarni QURMAYDI - faqat ustunlarni saqlaydi; tekshiruvda
 * xabar ustunlardan qayta quriladi, shuning uchun ustun o'zgarsa imzo darhol yaroqsiz bo'ladi.
 */

export const IMZO_DOMEN = 'T2-IMZO-V1';
/** Zanjirdagi birinchi imzoning `oldingi_xesh` qiymati. */
export const IMZO_BOSH_XESH = '0'.repeat(64);
/** Imzo vaqti serverdan olinadi; yozish shu oynada (soniya) bo'lishi shart (replay va vaqtni soxtalash). */
export const IMZO_VAQT_OYNASI_S = 180;

export type ImzoUsul = 'tizim' | 'eri';
export const IMZO_USULLAR: readonly ImzoUsul[] = ['tizim', 'eri'];
export type ImzoTomon = 'pudratchi' | 'subpudratchi' | 'buyurtmachi' | 'texnadzor' | 'loyihachi' | 'laboratoriya' | 'yetkazuvchi' | 'boshqa';
export const IMZO_TOMONLAR: readonly ImzoTomon[] = ['pudratchi', 'subpudratchi', 'buyurtmachi', 'texnadzor', 'loyihachi', 'laboratoriya', 'yetkazuvchi', 'boshqa'];

export type ImzoMazmun = {
  kompaniya_id: number;
  hujjat_id: number;
  /** Reestrdagi (server tekshirgan) fayl baytlari SHA-256 (hex). Hujjat o'zgarganini ushlaydi. */
  hujjat_sha256: string;
  /** Mazmun xeshi (xlsx: varaqlar + sharedStrings, imzo varag'isiz; boshqa fayl: bayt xeshi). QR bosilgan nusxani tekshirish uchun. */
  mazmun_xesh: string;
  kalit_id: string;
  foydalanuvchi_id: number;
  imzolovchi: string;
  /** Imzolovchining shu kompaniyadagi roli (lavozimi). */
  rol: string;
  /** Imzo usuli: hozir 'tizim'; keyin 'eri' (E-IMZO) qo'shiladi - xabarga kiradi, shuning uchun usulni almashtirib bo'lmaydi. */
  usul: ImzoUsul;
  /** Imzolovchi qaysi tomon sifatida imzoladi. */
  tomon: ImzoTomon;
  imzolovchi_kompaniya_id: number;
  imzolovchi_kompaniya: string;
  /** «Kim nomidan»: vakolat bergan kompaniya (masalan alohida texnadzor kompaniyasi - Buyurtmachi nomidan). Yo'q bo'lsa null. */
  nomidan_kompaniya_id: number | null;
  nomidan_kompaniya: string | null;
  /** UTC ISO, millisekund (server vaqti): 2026-12-18T09:30:00.123Z */
  vaqt: string;
  nonce: string;
  oldingi_xesh: string;
};

const HEX64 = /^[0-9a-f]{64}$/;
const B64U = /^[A-Za-z0-9_-]+$/;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const hexMi = (s: unknown): s is string => typeof s === 'string' && HEX64.test(s);
export const isoMsMi = (s: unknown): s is string => typeof s === 'string' && ISO_MS.test(s) && !Number.isNaN(Date.parse(s));
export const uuidMi = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

// --- base64url / hex -------------------------------------------------------------------------------------------------

export function b64uKodla(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uOch(s: string): Uint8Array | null {
  if (typeof s !== 'string' || !B64U.test(s) || s.length % 4 === 1) return null;
  try {
    const t = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const b = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
    return b;
  } catch { return null; }
}

export const hexKodla = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** BufferSource kerak bo'lgan joylar uchun: Uint8Array ni aniq ArrayBuffer ga ko'chiradi (SharedArrayBuffer turi muammosiz). */
const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export async function sha256Hex(b: Uint8Array): Promise<string> {
  return hexKodla(new Uint8Array(await crypto.subtle.digest('SHA-256', buf(b))));
}
export const sha256Matn = (s: string): Promise<string> => sha256Hex(new TextEncoder().encode(s));

/** Tasodifiy 128 bit (22 belgi base64url): QR token va nonce. Taxmin qilib bo'lmaydi, hujjat id sini oshkor qilmaydi. */
export function tasodifiyToken(): string {
  return b64uKodla(crypto.getRandomValues(new Uint8Array(16)));
}
export const tokenMi = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{22}$/.test(s);

// --- xabar ----------------------------------------------------------------------------------------------------------

/** Imzolanadigan kanonik xabar. Maydonlar tartibi O'ZGARMAS (versiya o'zgarsa - IMZO_DOMEN yangilanadi). */
export function imzoXabar(m: ImzoMazmun): Uint8Array {
  const arr = [m.kompaniya_id, m.hujjat_id, m.hujjat_sha256, m.mazmun_xesh, m.kalit_id, m.foydalanuvchi_id,
    m.imzolovchi, m.rol, m.usul, m.tomon, m.imzolovchi_kompaniya_id, m.imzolovchi_kompaniya, m.nomidan_kompaniya_id, m.nomidan_kompaniya,
    m.vaqt, m.nonce, m.oldingi_xesh];
  return new TextEncoder().encode(IMZO_DOMEN + '\n' + JSON.stringify(arr));
}

/** Zanjir xeshi: xabarning SHA-256 (hex). Keyingi imzo `oldingi_xesh` sifatida shuni imzolaydi. */
export const imzoXeshi = (m: ImzoMazmun): Promise<string> => sha256Hex(imzoXabar(m));

/** Maydonlar tuzilmasi to'g'rimi (tekshirishdan OLDIN - buzuq yozuv istisno chiqarmasin). */
export function imzoMazmunToTogri(m: ImzoMazmun): boolean {
  return Number.isSafeInteger(m.kompaniya_id) && m.kompaniya_id > 0 && Number.isSafeInteger(m.hujjat_id) && m.hujjat_id > 0
    && hexMi(m.hujjat_sha256) && hexMi(m.mazmun_xesh) && uuidMi(m.kalit_id) && Number.isSafeInteger(m.foydalanuvchi_id) && m.foydalanuvchi_id > 0
    && typeof m.imzolovchi === 'string' && m.imzolovchi.length > 0 && typeof m.rol === 'string' && m.rol.length > 0
    && IMZO_USULLAR.includes(m.usul) && IMZO_TOMONLAR.includes(m.tomon)
    && Number.isSafeInteger(m.imzolovchi_kompaniya_id) && m.imzolovchi_kompaniya_id > 0 && typeof m.imzolovchi_kompaniya === 'string' && m.imzolovchi_kompaniya.length > 0
    && ((m.nomidan_kompaniya_id === null && m.nomidan_kompaniya === null)
      || (Number.isSafeInteger(m.nomidan_kompaniya_id) && (m.nomidan_kompaniya_id as number) > 0 && typeof m.nomidan_kompaniya === 'string' && m.nomidan_kompaniya.length > 0))
    && isoMsMi(m.vaqt) && tokenMi(m.nonce) && hexMi(m.oldingi_xesh);
}

// --- kalit va imzo --------------------------------------------------------------------------------------------------

/** Ochiq kalit: P-256 nuqta, siqilmagan shakl (0x04 || X || Y) = 65 bayt = 87 belgi base64url. */
export const OCHIQ_KALIT_RE = /^[A-Za-z0-9_-]{87}$/;
export const IMZO_RE = /^[A-Za-z0-9_-]{86}$/;

async function ochiqKalitImport(ochiqB64u: string): Promise<CryptoKey | null> {
  if (!OCHIQ_KALIT_RE.test(ochiqB64u)) return null;
  const raw = b64uOch(ochiqB64u);
  if (!raw || raw.length !== 65 || raw[0] !== 0x04) return null;
  try { return await crypto.subtle.importKey('raw', buf(raw), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); }
  catch { return null; }   // egri chiziqda yotmagan nuqta
}

/** Ochiq kalit haqiqatan P-256 nuqtami (ro'yxatdan o'tkazishdan oldin). */
export async function ochiqKalitYaroqli(ochiqB64u: string): Promise<boolean> {
  return (await ochiqKalitImport(ochiqB64u)) !== null;
}

/** Imzoni ochiq kalit bilan tekshiradi. Har qanday xato (buzuq kalit/imzo) - false, istisno chiqmaydi. */
export async function imzoTekshir(ochiqB64u: string, xabar: Uint8Array, imzoB64u: string): Promise<boolean> {
  if (!IMZO_RE.test(imzoB64u)) return false;
  const [kalit, imzo] = [await ochiqKalitImport(ochiqB64u), b64uOch(imzoB64u)];
  if (!kalit || !imzo || imzo.length !== 64) return false;
  try { return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kalit, buf(imzo), buf(xabar)); }
  catch { return false; }
}

/** Ochiq kalit barmoq izi (qurilmalar ro'yxatida ko'rsatiladi): SHA-256 ning birinchi 16 hex belgisi, 4 tadan guruhlangan. */
export async function barmoqIzi(ochiqB64u: string): Promise<string> {
  return (await sha256Matn(ochiqB64u)).slice(0, 16).replace(/(.{4})(?=.)/g, '$1-');
}

const KOD_ALIFBO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32 (I, L, O, U yo'q) - odam o'qiganda adashmaydi
/** Odam o'qiy oladigan qisqa imzo kodi: zanjir xeshining birinchi 50 biti -> 10 belgi XXXXX-XXXXX. */
export function qisqaKod(xeshHex: string): string {
  let v = 0n;
  for (let i = 0; i < 13; i++) v = (v << 4n) | BigInt(parseInt(xeshHex[i] ?? '0', 16) || 0);   // 52 bit
  v >>= 2n;                                                                                      // 50 bit
  let s = '';
  for (let i = 9; i >= 0; i--) s += KOD_ALIFBO[Number((v >> BigInt(i * 5)) & 31n)];
  return s.slice(0, 5) + '-' + s.slice(5);
}