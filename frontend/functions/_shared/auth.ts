export type Rol = 'superadmin' | 'admin' | 'boss' | 'rahbar' | 'bugalter' | 'pto' | 'prorab';

/* ⚡ 2026-08-27 (Claude, foydalanuvchi tasdig'i bilan — "Auth Session ->
 * User -> Tenant -> Role" poydevori): sessiya avval faqat `rol`/`email`
 * saqlardi — HECH QANDAY foydalanuvchi identifikatori yoki qaysi
 * kompaniya(lar)ga tegishli ekani yo'q edi. Amalda bu shuni anglatardi:
 * har qanday tizimga kirgan odam `kompaniya_id`ni o'zgartirib istalgan
 * mijozning ma'lumotini ko'ra olardi (frontend UI cheklovi bo'lsa ham,
 * server darajasida tekshiruv YO'Q edi).
 *
 * ⚠️ ATAYLAB QISMAN: `foydalanuvchi_id`/`kompaniyalar` IXTIYORIY
 * (optional) — eski (bu o'zgarishdan oldin chiqarilgan) sessiya
 * cookie'lari hali ham yaroqli bo'lib qolishi kerak (12 soatlik
 * muddat tugagunicha), ular bu maydonlarsiz keladi. `sb.ts`/
 * `sb-yoz.ts` bu maydon yo'qligini "eski sessiya, tekshiruv hali
 * qo'llanmaydi" deb talqin qiladi — YANGI kirishlar esa to'liq
 * tekshiriladi. */
export type Sess = {
  /** Server-request-only DB snapshot. Never accepted as caller authority. */
  permissionsByCompany?: Record<number, string[]>;
  explicitDenialsByCompany?: Record<number, string[]>;
  rol: Rol;
  email?: string;
  exp: number;
  jti: string;
  foydalanuvchi_id?: number;
  /** Shu foydalanuvchi a'zo bo'lgan barcha kompaniyalar VA har biridagi
   *  ROLI — sessiya ichida saqlanadi (har so'rovda bazaga qayta so'rov
   *  yubormaslik uchun). A'zolik o'zgarsa, foydalanuvchi qayta kirishi
   *  kerak (12 soat ichida) — bu bilib turilgan cheklov.
   *
   *  ⚡ 2026-08-27: avval bu oddiy `number[]` (faqat ID) edi — «shu
   *  kompaniyaga a'zomi» tekshiruvi uchun yetarli edi, lekin «polimorfik
   *  rol» (bitta odam bir kompaniyada admin, boshqasida faqat ko'ruvchi
   *  bo'lishi) uchun YETARLI EMAS — global `rol` (yuqorida, GAS'dan)
   *  BARCHA kompaniya uchun bir xil bo'lib qolardi. Endi har yozuv o'z
   *  ROLINI olib yuradi. */
  kompaniyalar?: { kompaniya_id: number; rol: string }[];
};

async function importKey(secret: string) {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function hmacHex(body: string, secret: string) {
  const key = await importKey(secret);
  const data = new TextEncoder().encode(body);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Kalit o'rnatilmaganda ko'rsatiladigan xabar.
 *
 * ⚠️ HOZIR U KO'RSATILMAYDI: to'siq vaqtincha olib qo'yilgan (pastdagi
 * `kalitTekshir` ga qarang). Xabar saqlanib turibdi, chunki to'siq
 * qaytarilganda yana kerak bo'ladi.
 */
export const KALIT_XABAR =
  'Server sozlanmagan: SESSIYA_KALIT yo\'q (yoki 16 belgidan qisqa). ' +
  'Cloudflare Pages → Settings → Environment variables → SESSIYA_KALIT ' +
  'ga 32+ belgili tasodifiy satr qo\'ying va qayta deploy qiling. ' +
  'Zaxira kalit ataylab olib tashlangan: repozitoriy ochiq va u kalit ' +
  'bilan har kim sessiya cookie\'sini soxtalashtira olardi.';

/** Kalit yaroqlimi — TASHLAMAYDI, holat qaytaradi. */
export function kalitBormi(secret: string | undefined | null): boolean {
  return String(secret || '').trim().length >= 16;
}

/**
 * Kalit nega qabul qilinmayotganini AYTADI — kalitning o'zini oshkor
 * qilmasdan.
 *
 * Kerak bo'ldi, chunki «o'rnatdim, baribir ishlamadi» holatida taxmin
 * qilishdan boshqa yo'l qolmadi. Sabablari bir nechta bo'lishi mumkin:
 *   • Cloudflare Pages'da Production va Preview uchun o'zgaruvchilar
 *     ALOHIDA — biriga qo'yilib, ikkinchisiga qo'yilmagan bo'lishi mumkin
 *   • o'zgaruvchi qo'yilgach QAYTA DEPLOY qilinmagan
 *   • nomida bo'shliq/xato yoki qiymati qisqa
 * Bularni ajratish uchun o'lchov kerak, taxmin emas.
 */
export function kalitTashxis(env: Record<string, unknown>): {
  bor: boolean; uzunlik: number; oq_joy: boolean; mavjud_nomlar: string[];
} {
  const xom = env?.SESSIYA_KALIT;
  const s = typeof xom === 'string' ? xom : '';
  return {
    bor: kalitBormi(s),
    uzunlik: s.length,                       // qiymat EMAS, faqat uzunlik
    oq_joy: s !== s.trim(),
    /* Qaysi o'zgaruvchilar umuman ko'rinayotgani — nom xatosini ochadi */
    mavjud_nomlar: Object.keys(env || {}).filter((k) => !/KEY|KALIT|SECRET|TOKEN/i.test(k))
      .concat(Object.keys(env || {}).filter((k) => /KEY|KALIT|SECRET|TOKEN/i.test(k))
        .map((k) => k + '(qiymat yashirin)')),
  };
}

/* SECURITY P0 (2026-09): the hardcoded backup key is GONE. The repository is
 * public — any shipped fallback key lets anyone forge an admin session cookie.
 * `kalitTekshir` now FAILS CLOSED: no valid `SESSIYA_KALIT` -> throw. Callers:
 *   - `tekshir` (session validation) treats the throw as "no valid session"
 *     -> every request is unauthenticated (fail closed, nobody gets in).
 *   - `imzola` (login) rethrows -> the login handler returns 503 CONFIG and
 *     issues NO cookie, instead of minting one signed with a guessable key.
 *
 * If this ever locks everyone out, the fix is to set `SESSIYA_KALIT`
 * (Production AND Preview) in Cloudflare Pages and redeploy — never to ship a
 * key in the repo. `/api/sessiya` reports `zaxira_kalit: true` when it is unset.
 */
export class KalitYoqError extends Error {
  code = 'SESSIYA_KALIT_YOQ';
  constructor() { super('SESSIYA_KALIT o‘rnatilmagan yoki 16 belgidan qisqa — fail closed'); }
}

export function kalitTekshir(secret: string | undefined | null): string {
  const k = String(secret || '').trim();
  if (k.length >= 16) return k;
  throw new KalitYoqError();
}

/** Sessiya muddati — 90 kun. */
export const SESSIYA_MUDDAT_MS = 90 * 24 * 3600_000;

export async function imzola(s: Omit<Sess, 'exp' | 'jti'>, secret: string): Promise<string> {
  secret = kalitTekshir(secret);
  const payload: Sess = {
    ...s,
    // Egasi (2026-09-25): sinov/rivojlanish davrida har safar login zeriktiradi —
    // sessiya 90 kun eslab qoladi (login butunlay o'chirilmaydi: repo ochiq,
    // bazada real ma'lumot). A'zolik har RPC da serverda qayta tekshiriladi.
    exp: Date.now() + SESSIYA_MUDDAT_MS,
    jti: crypto.randomUUID(),
  };
  const body = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  const sig = await hmacHex(body, secret);
  return `${body}.${sig}`;
}

export async function tekshir(cookie: string | null, secret: string): Promise<Sess | null> {
  /* Kalit yo'q bo'lsa HECH KIM kira olmaydi (fail closed). */
  try { secret = kalitTekshir(secret); }
  catch { return null; }
  const t = cookie?.match(/sess=([^;]+)/)?.[1];
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  
  if (!body || !sig) return null;

  const kutilgan = await hmacHex(body, secret);
  if (!teng(sig, kutilgan)) return null;

  let s: Sess;
  try { 
    s = JSON.parse(atob(body)); 
  } catch { 
    return null; 
  }
  
  if (!s.exp || Date.now() > s.exp) return null; // MUDDAT tekshiruvi
  return s;
}

/** Vaqt-barqaror solishtirish — sirni uzunlik bo'yicha topib bo'lmasin */
function teng(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
