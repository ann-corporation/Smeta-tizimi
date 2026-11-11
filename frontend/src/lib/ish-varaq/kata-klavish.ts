/**
 * Hajm katagi (input) klaviatura xaritasi — Fakt jurnali va Ish varag'i uchun BIR XIL.
 * Sof funksiya: tugma → amal. Ctrl+S / Ctrl+Enter bu yerda EMAS (yagona `lib/hotkeys` moduli, ikki marta saqlanmasin).
 */
export type KataAmal =
  | 'otkaz'        // Ctrl/Cmd+Enter — hotkeys moduli ishlaydi
  | 'keyingi'      // Enter / ↓ — keyingi qator (xuddi shu ustun)
  | 'oldingi'      // ↑ — oldingi qator (birinchi qatorda — qidiruvga)
  | 'tab+' | 'tab-' // Tab / Shift+Tab — keyingi/oldingi katak
  | 'bekor'        // Esc — tahrirni bekor qilish
  | 'bajarilmadi'  // Ctrl+B
  | 'orqaga'       // Ctrl+Z (tarix bo'lsa)
  | null;

export function kataAmali(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, tarixBor: boolean): KataAmal {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'Enter') return 'otkaz';
  if (e.key === 'Enter' || e.key === 'ArrowDown') return 'keyingi';
  if (e.key === 'ArrowUp') return 'oldingi';
  if (e.key === 'Tab') return e.shiftKey ? 'tab-' : 'tab+';
  if (e.key === 'Escape') return 'bekor';
  if (ctrl && e.key.toLowerCase() === 'b') return 'bajarilmadi';
  if (ctrl && e.key.toLowerCase() === 'z' && tarixBor) return 'orqaga';
  return null;
}
