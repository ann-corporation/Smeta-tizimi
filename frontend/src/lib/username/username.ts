/**
 * @username qoidalari va ismdan taklif (mijoz nusxasi). Server nusxasi: functions/_shared/username.ts — ikkalasi bir xil.
 * Mijoz faqat oldindan ko'rsatma beradi; yagona hakam — bazadagi RPC (noyoblik, band so'zlar).
 */
export const USERNAME_MIN = 5;
export const USERNAME_MAX = 32;
export const DEBOUNCE_MS = 400;
export const KEYINROQ_KALIT = 'qurai.username.keyinroq';
const BAND = new Set(['admin', 'administrator', 'support', 'qurai', 'qur_uz', 'quruz', 'smeta', 'system', 'bot', 'root', 'api', 'www', 'help', 'info', 'moderator',
  'superadmin', 'boss', 'official', 'telegram', 'everyone', 'all', 'here', 'channel', 'null', 'undefined', 'owner', 'staff', 'security', 'billing',
  'payment', 'noreply', 'jarvis', 'anonymous', 'settings', 'login', 'logout', 'register']);

export function usernameNorm(v: unknown): string | null {
  const s = String(v ?? '').trim().replace(/^@+/, '').toLowerCase();
  return s || null;
}

export function usernameXato(norm: string | null): string | null {
  if (!norm || norm.length < USERNAME_MIN) return 'USERNAME_QISQA';
  if (norm.length > USERNAME_MAX) return 'USERNAME_UZUN';
  if (!/^[a-z0-9_]+$/.test(norm)) return 'USERNAME_FORMAT';
  if (!/^[a-z]/.test(norm)) return 'USERNAME_BOSHLANISH';
  if (/__/.test(norm) || /_$/.test(norm)) return 'USERNAME_UNDERSCORE';
  if (BAND.has(norm) || norm.startsWith('qurai') || norm.startsWith('admin_')) return 'USERNAME_BAND_SOZ';
  return null;
}

export type QiymatTuri = 'username' | 'telefon' | 'email' | 'noaniq';
/** Bitta maydondagi qiymat turini aniqlaydi: @ali_01 / +998 90 123 45 67 / ali@firma.uz. */
export function qiymatTuri(v: unknown): QiymatTuri {
  const s = String(v ?? '').trim();
  if (!s || s.length > 254) return 'noaniq';
  if (s.startsWith('@') || /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s)) return 'username';
  if (s.indexOf('@') > 0) return 'email';
  if (/^\+?[0-9 ()./-]{9,24}$/.test(s)) return 'telefon';
  return 'noaniq';
}

const KIRILL: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
function lotin(s: string): string {
  return s.toLowerCase().replace(/[ʻʼ‘’`']/g, '').split('').map((c) => (c in KIRILL ? KIRILL[c] : c)).join('')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Ismdan (va ixtiyoriy loginning oldingi qismidan) yaroqli @username variantlari — eng ko'pi 8 ta; bo'shligi serverda tekshiriladi. */
export function usernameTakliflari(ism: string | null | undefined, login?: string | null): string[] {
  const qismlar = lotin(ism ?? '').split(' ').filter(Boolean);
  const loginBosh = lotin((login ?? '').split('@')[0] ?? '').replace(/ /g, '_');
  const [a, b] = [qismlar[0] ?? '', qismlar[1] ?? ''];
  const xom = [a && b ? `${a}_${b}` : '', a && b ? `${a}${b}` : '', a && b ? `${a[0]}${b}` : '', a && b ? `${a}_${b[0]}` : '', a, loginBosh];
  const chiqish: string[] = [];
  const qosh = (v: string) => {
    const n = v.replace(/^[^a-z]+/, '').replace(/__+/g, '_').replace(/_+$/, '').slice(0, USERNAME_MAX);
    if (n && !usernameXato(n) && !chiqish.includes(n)) chiqish.push(n);
  };
  for (const v of xom) { qosh(v); }
  // Qisqa asoslarga raqam qo'shib 5 belgiga yetkazamiz yoki variant ko'paytiramiz.
  for (const v of xom.slice(0, 3)) { if (!v) continue; for (const suf of ['01', '_uz', '77']) qosh(v + suf); }
  const tayyor = chiqish.filter((x, i) => chiqish.indexOf(x) === i);
  return tayyor.slice(0, 8);
}

/** Telegram username i bo'lsa — QURAI qoidalariga mos bo'lsa qaytaradi, bo'lmasa null. */
export function telegramUsernameTaklifi(tg: string | null | undefined): string | null {
  const n = usernameNorm(tg);
  return n && !usernameXato(n) ? n : null;
}