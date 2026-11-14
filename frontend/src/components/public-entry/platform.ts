export type Platform = 'windows' | 'android' | 'ios' | 'macos' | 'other';

type NavLike = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
};

/** Tashrif buyuruvchi platformasi. Noma‘lum bo‘lsa 'other' (hech qaysi karta ajratilmaydi). */
export function detectPlatform(nav: NavLike | undefined | null = typeof navigator === 'undefined' ? null : navigator): Platform {
  if (!nav) return 'other';
  try {
    const hint = (nav.userAgentData?.platform ?? '').toLowerCase();
    if (hint === 'android') return 'android';
    if (hint === 'windows') return 'windows';
    if (hint === 'ios') return 'ios';
    if (hint === 'macos') return (nav.maxTouchPoints ?? 0) > 1 ? 'ios' : 'macos';
    const ua = nav.userAgent ?? '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    // iPadOS 13+ Safari o‘zini Macintosh deb tanishtiradi; sensorli ekran farqlaydi.
    if (/macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return 'ios';
    if (/macintosh|mac os x/i.test(ua)) return 'macos';
    if (/windows/i.test(ua) || /^win/i.test(nav.platform ?? '')) return 'windows';
  } catch { /* noodatiy navigator — ajratmaymiz */ }
  return 'other';
}
