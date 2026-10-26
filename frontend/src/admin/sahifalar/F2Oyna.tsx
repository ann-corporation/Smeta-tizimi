import { useEffect, useRef, type ReactNode } from 'react';

/**
 * F2 import oynalari uchun yagona qobiq (role="dialog" + aria-modal, Esc, fokus qamrovi, fon bosilsa yopiladi).
 * `onYop` berilmasa (masalan, yozish davom etayotganda) Esc va fon bosish hech narsa qilmaydi.
 * Yopilganda fokus oyna ochilishidan oldingi elementga qaytadi.
 */
const FOKUS = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function F2Oyna(p: { label: string; onYop?: () => void; children: ReactNode; kenglik?: number; className?: string }) {
  const quti = useRef<HTMLDivElement>(null);
  const yopRef = useRef(p.onYop);
  yopRef.current = p.onYop;

  useEffect(() => {
    const oldingi = document.activeElement as HTMLElement | null;
    const q = quti.current;
    if (q && !q.contains(document.activeElement)) {
      const birinchi = (q.querySelector('[data-boshlang-fokus]') ?? q.querySelector(FOKUS)) as HTMLElement | null;
      (birinchi ?? q).focus();
    }
    const tugma = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && yopRef.current) { e.preventDefault(); e.stopPropagation(); yopRef.current(); return; }
      if (e.key !== 'Tab' || !quti.current) return;
      const el = Array.from(quti.current.querySelectorAll(FOKUS)) as HTMLElement[];
      if (!el.length) { e.preventDefault(); return; }
      const i = el.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); el[el.length - 1].focus(); }
      else if (!e.shiftKey && i === el.length - 1) { e.preventDefault(); el[0].focus(); }
    };
    document.addEventListener('keydown', tugma, true);
    return () => { document.removeEventListener('keydown', tugma, true); oldingi?.focus?.(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) p.onYop?.(); }}>
      <div ref={quti} role="dialog" aria-modal="true" aria-label={p.label} tabIndex={-1}
        className={`fz-card w-full ${p.className ?? ''}`} style={{ maxWidth: p.kenglik ?? 480, boxShadow: 'var(--shadow-pop)', maxHeight: '92vh', overflow: 'auto' }}>
        {p.children}
      </div>
    </div>
  );
}
