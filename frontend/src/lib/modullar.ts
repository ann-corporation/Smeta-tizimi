/**
 * Menyu ↔ modul xaritasi («Telegram modeli», egasi 2026-10-21). PTO yadrosi (obyekt, smeta, Fakt, F2, Nakop, M-29)
 * modul emas — doim ko'rinadi. Modul holati noma'lum bo'lsa (yuklanmoqda / xato) menyu yashirilmaydi: bu faqat
 * ko'rinish, xavfsizlikni server alohida tekshiradi.
 */
import type { Modul } from '../api/t2-modul';
import { NAV_SAHIFALAR } from './nav/navReestr';

/** Yo'l → modul kodi. Manba — yagona navigatsiya reestri (lib/nav/navReestr.ts `modul`). */
export const MENYU_MODUL: Readonly<Record<string, string>> =
  Object.fromEntries(NAV_SAHIFALAR.flatMap((s) => (s.modul ? [[s.yol, s.modul]] : [])));

/** Shu menyu yo'li ko'rinadimi: modul bog'lanmagan → doim; holat noma'lum → ko'rinadi; 'off' → yo'q. */
export function menyuModulYoqilgan(yol: string, modullar: readonly Modul[] | undefined): boolean {
  const kod = MENYU_MODUL[yol];
  if (!kod || !modullar) return true;
  const m = modullar.find((x) => x.kod === kod);
  return !m || m.holat !== 'off';
}
