/**
 * disk-saqla.ts - brauzerda yasalgan tizim hujjatini kompaniya DISKIGA saqlash (A2). Server yo'li: /api/hujjat-yukla -> t2_disk_tizim_yoz_v1;
 * kalit/nom FAQAT lib/disk-hujjat.ts dan. Hujjat berishni hech qachon to'xtatmaydi, lekin jim ham emas: xato bo'lsa foydalanuvchiga aytiladi
 * (saqlanmagan hujjatni kunlik navbat yoki qayta chiqarish Diskka ulaydi).
 */
import { hujjatArxivla, type ArxivTuri } from '../api/t2-hujjat-arxiv';
import type { DiskManba } from './disk-hujjat';
import { toast } from '../umumiy/ui/Toast';

export type DiskSaqlaSoz = { kompaniyaId: number; obyektId?: number | null; loyihaId?: number | null; turi: ArxivTuri; faylNomi: string; bytes: Uint8Array; davr?: string | null; manba: DiskManba; mime?: string };

export const DISK_SAQLANMADI = 'Hujjat Diskka saqlanmadi - qayta chiqaring yoki biroz kuting (tizim o‘zi qayta uradi).';

/** Fon rejimda saqlaydi; natija: ok yoki xato (toast ko'rsatiladi). Hech qachon istisno tashlamaydi. */
export function diskkaSaqla(p: DiskSaqlaSoz): Promise<boolean> {
  return hujjatArxivla({ kompaniyaId: p.kompaniyaId, obyektId: p.obyektId ?? null, loyihaId: p.loyihaId ?? null, turi: p.turi, faylNomi: p.faylNomi, bytes: p.bytes, davr: p.davr ?? null, manba: p.manba, mime: p.mime })
    .then((a) => { if (!a.ok) { toast(DISK_SAQLANMADI, 'warn'); return false; } return true; })
    .catch(() => { toast(DISK_SAQLANMADI, 'warn'); return false; });
}

/** Server yasagan hujjat javobidagi `X-Disk-Holat` ('ok' | 'otkazildi' | 'xato:<kod>'): xato bo'lsa ogohlantiradi. */
export function diskHolatiniKorsat(holat: string | null | undefined): void {
  if (holat && holat.startsWith('xato')) toast(DISK_SAQLANMADI, 'warn');
}