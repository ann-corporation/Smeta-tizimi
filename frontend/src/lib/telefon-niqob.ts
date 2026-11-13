/**
 * O'zbekiston telefon raqami kiritish niqobi (+998 XX XXX XX XX) va E.164 ga keltirish.
 * Qoida server bilan BIR XIL: functions/_shared/kirish-emailsiz.ts `telefonNorm` va SQL `t2_telefon_norm_v1`.
 */
export function telefonRaqamlari(kirish: string): string {
  let d = String(kirish ?? '').replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  return d.slice(0, 9);
}

/** Yozilgan matnni «+998 90 123 45 67» ko'rinishiga keltiradi (bo'sh kirish — bo'sh). */
export function telefonNiqob(kirish: string): string {
  const d = telefonRaqamlari(kirish);
  if (!d) return '';
  const q = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return '+998 ' + q.join(' ');
}

/** To'liq va yaroqli bo'lsa '+998XXXXXXXXX', aks holda null. */
export function telefonE164(kirish: string): string | null {
  const s = String(kirish ?? '').trim();
  if (!s || s.length > 24 || !/^\+?[0-9 ()./-]+$/.test(s)) return null;
  let d = s.replace(/[^0-9]/g, '');
  if (d.length === 9) d = '998' + d;
  return /^998[2-9][0-9]{8}$/.test(d) ? '+' + d : null;
}

/** Login qatori telefon ko'rinishidami (emailsiz, harfsiz)? */
export const loginTelefonmi = (login: string): boolean => !login.includes('@') && /^\+?[0-9 ()./-]{9,24}$/.test(login.trim());
