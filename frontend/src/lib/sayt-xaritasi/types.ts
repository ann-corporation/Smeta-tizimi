export type SaytScope = 'GLOBAL' | 'COMPANY' | 'PROJECT' | 'OBJECT' | 'USER' | 'LEGACY';

export interface SaytSahifa {
  kalit: string;
  nom: string;
  yol: string;
  scope: SaytScope;
  oqiydi: string[];
  yozadi: string[];
  chiqaradi: string[];
  beradi: string[];
  izoh: string;
  legacy?: boolean;
}

export interface SaytXaritasiManifest {
  generatedAt: string;
  menuRoutes: string[];
  appRouteSegments: string[];
  readTables: string[];
  writeActions: Array<{ amal: string; rpc: string }>;
  sahifalar: SaytSahifa[];
}
