/** 1C sverka importi UI — umumiy ko'rsatish yordamchilari (summalar tiyinda). */
import type { CSSProperties } from 'react';

export const pul = (t: number | null | undefined): string =>
  t == null ? '—' : (t / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const sanaKor = (s: string | null | undefined): string => (s ? s.slice(0, 10).split('-').reverse().join('.') : '—');

/** «+» — buyurtmachi qarzi (yashil emas, diqqat), «−» — avans (bizning qarz). */
export const qoldiqRang = (x: number | null | undefined): CSSProperties | undefined =>
  x == null || x === 0 ? undefined : x > 0 ? { color: 'var(--warn, #b45309)' } : { color: 'var(--danger)' };

export const raqamUstun: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
