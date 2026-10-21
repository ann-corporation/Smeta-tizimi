/**
 * Menyu ↔ modul xaritasi («Telegram modeli», egasi 2026-10-21). PTO yadrosi (obyekt, smeta, Fakt, F2, Nakop, M-29)
 * modul emas — doim ko'rinadi. Modul holati noma'lum bo'lsa (yuklanmoqda / xato) menyu yashirilmaydi: bu faqat
 * ko'rinish, xavfsizlikni server alohida tekshiradi.
 */
import type { Modul } from '../api/t2-modul';

export const MENYU_MODUL: Readonly<Record<string, string>> = {
  '/admin/aosr': 'module.aosr',
  '/admin/smeta-narxlash': 'module.narx', '/admin/oferta': 'module.narx', '/admin/narx-manbalari': 'module.narx',
  '/admin/narx-dalil': 'module.narx', '/admin/nakrutka': 'module.narx', '/admin/narxlar': 'module.narx',
  '/admin/loyiha': 'module.loyiha', '/admin/shartnoma-liniya': 'module.loyiha', '/admin/documents': 'module.loyiha',
  '/admin/hujjat-nazorat': 'module.loyiha', '/admin/participants': 'module.loyiha', '/admin/crm': 'module.loyiha',
  '/admin/zakazchik': 'module.loyiha', '/admin/taqdimlar': 'module.loyiha', '/admin/murojaatlar': 'module.loyiha', '/admin/aloqalar': 'module.loyiha',
  '/admin/dashboard': 'module.erp', '/admin/moliya': 'module.erp', '/admin/logistika': 'module.erp', '/admin/zayavka': 'module.erp',
  '/admin/erp': 'module.erp', '/admin/mindmap': 'module.erp',
};

/** Shu menyu yo'li ko'rinadimi: modul bog'lanmagan → doim; holat noma'lum → ko'rinadi; 'off' → yo'q. */
export function menyuModulYoqilgan(yol: string, modullar: readonly Modul[] | undefined): boolean {
  const kod = MENYU_MODUL[yol];
  if (!kod || !modullar) return true;
  const m = modullar.find((x) => x.kod === kod);
  return !m || m.holat !== 'off';
}
