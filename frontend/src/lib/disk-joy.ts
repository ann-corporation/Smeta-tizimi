/**
 * disk-joy.ts - hujjatTokenBilan({ disk }) parametrini YAGONA yo'ldan quradi (Disk A5): har hujjat uchun to'g'ri tur, aniq nom va kalit
 * (obyekt / shartnoma / oy bo'yicha). Kalit va nom FAQAT lib/disk-hujjat.ts `hujjatJoyManba` dan; bu yerda hech narsa o'ylab topilmaydi.
 *   obyektId bor   -> obyekt darajasi: tur = `asos` (masalan 'pereraschet'), Disk: Loyiha -> (Shartnoma) -> Obyekt -> Tur -> Oy
 *   obyektId yo'q  -> kompaniya darajasi: tur = `kompaniya_<asos>`, Disk: Kompaniya hujjatlari -> Tur -> Oy
 */
import { hujjatJoyManba } from './disk-hujjat';
import type { DiskSaqlaSoz } from './disk-saqla';

export type DiskJoySoz = {
  /** Hujjat asosiy turi (JOY_NOMI kaliti, masalan 'pereraschet', 'bux_hisobot'). */
  tur: string; kompaniyaId: number; obyektId?: number | string | null; loyihaId?: number | null; obyekt?: string | null;
  /** Hisobot oyi (YYYY-MM...) - bo'sh bo'lsa oysiz (bitta fayl, qayta yasalsa yangi versiya). */
  oy?: string | null;
  /** Bir obyekt/oyda bir nechta alohida hujjat bo'lsa ularni ajratuvchi (naryad raqami, protokol raqami, bo'lim nomi); alohida fayl bo'ladi. */
  qism?: string | number | null; qismNom?: string | null;
  faylNomi: string; mime?: string;
};

export function diskJoy(p: DiskJoySoz): Omit<DiskSaqlaSoz, 'kompaniyaId' | 'bytes'> {
  const obyektId = p.obyektId != null && p.obyektId !== '' && Number(p.obyektId) > 0 ? Number(p.obyektId) : null;
  const manba = hujjatJoyManba({ tur: p.tur, kompaniyaId: p.kompaniyaId, obyektId, obyekt: p.obyekt ?? null, oy: p.oy ?? null, qism: p.qism, qismNom: p.qismNom });
  return { turi: manba.turi as DiskSaqlaSoz['turi'], obyektId, loyihaId: p.loyihaId ?? null, faylNomi: p.faylNomi, davr: p.oy && /^\d{4}-\d{2}/.test(p.oy) ? p.oy.slice(0, 7) : null, manba, ...(p.mime ? { mime: p.mime } : {}) };
}