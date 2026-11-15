/**
 * username.ts — tizim darajasidagi @username qoidalari (server tomoni; SQL `_t2_username_xato_v1` bilan AYNAN bir xil).
 * Mijoz (sayt/Android/Windows/bot) faqat qulaylik uchun oldindan tekshiradi; yakuniy qaror — bazada.
 * Ko'chirma: frontend/src/lib/username/username.ts (mijoz nusxasi — ikkalasi bir xil testdan o'tadi).
 */
export const USERNAME_MIN = 5;
export const USERNAME_MAX = 32;
export const BAND_SOZLAR: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'support', 'qurai', 'qur_uz', 'quruz', 'smeta', 'system', 'bot', 'root', 'api', 'www', 'help', 'info', 'moderator',
  'superadmin', 'boss', 'official', 'telegram', 'everyone', 'all', 'here', 'channel', 'null', 'undefined', 'owner', 'staff', 'security', 'billing',
  'payment', 'noreply', 'jarvis', 'anonymous', 'settings', 'login', 'logout', 'register',
]);

/** '@Ali_01' -> 'ali_01'; bo'sh -> null. */
export function usernameNorm(v: unknown): string | null {
  const s = String(v ?? '').trim().replace(/^@+/, '').toLowerCase();
  return s ? s : null;
}

/** null = yaroqli; aks holda SQL bilan bir xil sabab kodi. */
export function usernameXato(norm: string | null): string | null {
  if (!norm || norm.length < USERNAME_MIN) return 'USERNAME_QISQA';
  if (norm.length > USERNAME_MAX) return 'USERNAME_UZUN';
  if (!/^[a-z0-9_]+$/.test(norm)) return 'USERNAME_FORMAT';
  if (!/^[a-z]/.test(norm)) return 'USERNAME_BOSHLANISH';
  if (/__/.test(norm) || /_$/.test(norm)) return 'USERNAME_UNDERSCORE';
  if (BAND_SOZLAR.has(norm) || norm.startsWith('qurai') || norm.startsWith('admin_')) return 'USERNAME_BAND_SOZ';
  return null;
}

export type QiymatTuri = 'username' | 'telefon' | 'email' | 'noaniq';
/** Bitta maydondagi qiymat turini aniqlaydi (SQL `_t2_qidir_ichki_v1` bilan bir xil tartib). */
export function qiymatTuri(v: unknown): QiymatTuri {
  const s = String(v ?? '').trim();
  if (!s || s.length > 254) return 'noaniq';
  if (s.startsWith('@') || /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s)) return 'username';
  if (s.indexOf('@') > 0) return 'email';
  if (/^\+?[0-9 ()./-]{9,24}$/.test(s)) return 'telefon';
  return 'noaniq';
}
