import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useMedia, useReducedMotionPref } from './hooks';

/** Subtle magnetic pull toward the pointer (fine pointers only, off with reduced motion). */
export function Magnetic({ children, strength = 0.28, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fine = useMedia('(hover: hover) and (pointer: fine)');
  const reduced = useReducedMotionPref();
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 });
  const active = fine && !reduced;
  return <motion.span ref={ref} className={`entry-magnetic ${className ?? ''}`} style={active ? { x: sx, y: sy } : undefined}
    onPointerMove={active ? (e) => {
      const r = ref.current?.getBoundingClientRect(); if (!r) return;
      x.set((e.clientX - (r.left + r.width / 2)) * strength);
      y.set((e.clientY - (r.top + r.height / 2)) * strength);
    } : undefined}
    onPointerLeave={active ? () => { x.set(0); y.set(0); } : undefined}>
    {children}
  </motion.span>;
}
