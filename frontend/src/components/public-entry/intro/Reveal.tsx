import { useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useSeen } from './hooks';

/** Fade-up on first view. Uses our guarded observer (framer's whileInView needs IntersectionObserver unconditionally). */
export function Reveal({ children, className, delay = 0, id, as = 'div' }: { children: ReactNode; className?: string; delay?: number; id?: string; as?: 'div' | 'article' }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref, 0.2);
  const props = { ref, id, className, initial: { opacity: 0, y: 22 }, animate: seen ? { opacity: 1, y: 0 } : undefined, transition: { duration: 0.55, delay, ease: [0.2, 0.8, 0.2, 1] as const } };
  return as === 'article' ? <motion.article {...props}>{children}</motion.article> : <motion.div {...props}>{children}</motion.div>;
}
