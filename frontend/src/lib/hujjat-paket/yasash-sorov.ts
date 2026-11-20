/**
 * Hujjatlar paketi: nomzod -> `/api/hujjat-yarat` parametrlari (TOZA, brauzer/Worker uchun umumiy). null - bu turni yasab bo'lmaydi.
 * `src/api/hujjat-paket.ts` (sayt) va bot (`functions/_shared/telegram-toliq-paket.ts`) shu bitta funksiyani ishlatadi.
 */
import type { Nomzod } from './nomzod';

export type YasashTuri = 'f2' | 'forma3' | 'nakopitelniy' | 'm29' | 'slichitelniy' | 'ostatka';

export function yasashSorovi(n: Nomzod): { tur: YasashTuri; parametrlar: Record<string, number> } | null {
  switch (n.tur) {
    case 'f2': return n.akt_id != null ? { tur: 'f2', parametrlar: { akt_id: n.akt_id } } : null;
    case 'forma3': return n.forma3_id != null && n.shartnoma_id != null ? { tur: 'forma3', parametrlar: { shartnoma_id: n.shartnoma_id, f3_id: n.forma3_id } } : null;
    case 'nakopitelniy': case 'm29': return n.oy ? { tur: n.tur, parametrlar: { oy_son: Number(n.oy.replace('-', '')) } } : null;
    case 'slichitelniy': case 'ostatka': return { tur: n.tur, parametrlar: {} };
    default: return null;
  }
}