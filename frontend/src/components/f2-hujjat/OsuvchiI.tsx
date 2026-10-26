import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Chiziq bo'lagi: kenglik (`ulush` 0..1) darrov to'g'ri qo'yiladi, ko'rinish esa chapdan o'sib chiqadi (scaleX).
 * `prefers-reduced-motion` bo'lsa — animatsiyasiz. Rang/o'lcham tashqaridan (className/style, faqat Firuza tokenlari).
 */
export function OsuvchiI({ ulush, className, style, kechikish = 0 }: { ulush: number; className?: string; style?: CSSProperties; kechikish?: number }) {
  const kam = useReducedMotion();
  const u = Number.isFinite(ulush) ? Math.min(1, Math.max(0, ulush)) : 0;
  return (
    <motion.i
      className={className}
      style={{ ...style, width: `${u * 100}%`, transformOrigin: 'left center' }}
      initial={kam ? false : { scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.55, delay: kechikish, ease: [0.2, 0.7, 0.2, 1] }}
    />
  );
}
