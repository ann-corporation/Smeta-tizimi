import { GENERATED_SITE_MAP } from './generated';
import { SAHIFA_KATALOGI } from './pageCatalog';
import type { SaytXaritasiManifest } from './types';

export const SAYT_XARITASI: SaytXaritasiManifest = {
  generatedAt: GENERATED_SITE_MAP.generatedAt,
  menuRoutes: [...GENERATED_SITE_MAP.menuRoutes],
  appRouteSegments: [...GENERATED_SITE_MAP.appRouteSegments],
  readTables: [...GENERATED_SITE_MAP.readTables],
  writeActions: [...GENERATED_SITE_MAP.writeActions],
  sahifalar: [...SAHIFA_KATALOGI],
};

/** PTO uchun biznes oqimi — sahifa katalogidan alohida, lekin canonical
 * sahifalar bilan bir xil route nomlaridan foydalanadi. */
export const SAYT_OQIMLARI = [
  { nom: 'Smeta → Fakt → F2 → Nakopitelniy → F3', qadamlar: ['/admin/holat', '/admin/f2-tayyorlash', '/admin/f2-tarix', '/admin/nakopitelniy', '/admin/hujjat-nazorat'] },
  { nom: 'Smeta → RES narxlash → Narx nazorati → Oferta', qadamlar: ['/admin/holat', '/admin/smeta-narxlash', '/admin/narxlar', '/admin/oferta'] },
  { nom: 'Loyiha → Obyekt → Hujjat → QA/QC', qadamlar: ['/admin/loyiha', '/admin/obyektlar', '/admin/documents', '/admin/aosr'] },
  { nom: 'Kompaniya → Ishtirokchilar → Shartnoma/Moliya', qadamlar: ['/admin/kompaniya', '/admin/participants', '/admin/moliya'] },
] as const;

export function sahifaniTop(yol: string) {
  return SAYT_XARITASI.sahifalar.find((x) => x.yol === yol) ?? null;
}
