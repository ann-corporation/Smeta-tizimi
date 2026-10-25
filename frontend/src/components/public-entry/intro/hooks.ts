import { useEffect, useState, type RefObject } from 'react';

/** matchMedia that survives jsdom/SSR (returns `fallback` when unavailable). */
export function useMedia(query: string, fallback = false): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [query]);
  return match;
}

export const useReducedMotionPref = () => useMedia('(prefers-reduced-motion: reduce)');

/**
 * Scroll-scrubbed storytelling only on roomy screens with motion allowed; everywhere else the same
 * content is shown as a readable static/in-view sequence.
 */
export function useScrollStory(): boolean {
  const wide = useMedia('(min-width: 1024px) and (min-height: 640px)');
  const reduced = useReducedMotionPref();
  return wide && !reduced;
}

/** One-shot "has been seen" flag. Without IntersectionObserver (jsdom, old browsers) content counts as seen. */
export function useSeen(ref: RefObject<Element | null>, amount = 0.35): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold: amount });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, amount, seen]);
  return seen;
}
