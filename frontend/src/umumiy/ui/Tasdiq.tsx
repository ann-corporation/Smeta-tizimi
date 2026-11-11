import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { t } from '../../i18n/til';

/**
 * TASDIQ OYNASI — `window.confirm` o'rniga (egasi 2026-10-25: har amal aniq va tushunarli bo'lsin).
 *   if (!(await tasdiqSora({ matn: 'F2 ni bekor qilasizmi?', xavfli: true }))) return;
 * Esc / fon — bekor; Enter — tasdiq; fokus tasdiq tugmasida (xavfli amalda — bekor tugmasida).
 * Konteyner o'rnatilmagan bo'lsa (testlar) — eski `window.confirm` ga qaytadi, xulq o'zgarmaydi.
 */
type Sorov = { sarlavha?: string; matn: string; tasdiqMatni?: string; bekorMatni?: string; xavfli?: boolean };
type Ichki = Sorov & { id: number; javob: (ha: boolean) => void };

let tinglovchi: ((s: Ichki) => void) | null = null;

export function tasdiqSora(s: Sorov | string): Promise<boolean> {
  const so: Sorov = typeof s === 'string' ? { matn: s } : s;
  if (!tinglovchi) return Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(so.matn) : false);
  return new Promise((javob) => tinglovchi!({ ...so, id: Date.now() + Math.random(), javob }));
}

export function TasdiqContainer() {
  const [navbat, setNavbat] = useState<Ichki[]>([]);
  const joriy = navbat[0];
  const asosiy = useRef<HTMLButtonElement>(null);
  const bekorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    tinglovchi = (s) => setNavbat((n) => [...n, s]);
    return () => { tinglovchi = null; };
  }, []);

  // Konteyner o'chirilsa (marshrut almashishi, qayta o'rnatish) kutayotgan so'rovlar «bekor» bilan yakunlanadi — aks holda
  // ularni kutgan amal (masalan fakt saqlash) abadiy osilib qoladi va keyingi bosishlar jim e'tiborsiz qoladi.
  const navbatRef = useRef<Ichki[]>([]);
  navbatRef.current = navbat;
  useEffect(() => () => { for (const s of navbatRef.current) s.javob(false); }, []);

  const yop = (ha: boolean) => {
    if (!joriy) return;
    joriy.javob(ha);
    setNavbat((n) => n.slice(1));
  };

  useEffect(() => {
    if (!joriy) return;
    (joriy.xavfli ? bekorRef : asosiy).current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); yop(false); }
      if (e.key === 'Tab') {
        const a = [bekorRef.current, asosiy.current].filter(Boolean) as HTMLElement[];
        const i = a.indexOf(document.activeElement as HTMLElement);
        e.preventDefault(); a[(i + (e.shiftKey ? a.length - 1 : 1)) % a.length]?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joriy?.id]);

  return (
    <AnimatePresence>
      {joriy && (
        <motion.div key="fon" className="fixed inset-0 z-[90] grid place-items-center p-4" style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) yop(false); }}>
          <motion.div key={joriy.id} role="alertdialog" aria-modal="true" aria-labelledby="tasdiq-sarlavha" aria-describedby="tasdiq-matn"
            className="w-full max-w-[460px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-pop)]"
            initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}>
            <div className="flex gap-3 p-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ color: joriy.xavfli ? 'var(--danger)' : 'var(--accent-text)', background: joriy.xavfli ? 'var(--danger-soft)' : 'var(--accent-soft)' }}>
                {joriy.xavfli ? <AlertTriangle size={18} /> : <HelpCircle size={18} />}
              </span>
              <div className="min-w-0">
                <h2 id="tasdiq-sarlavha" className="m-0 text-[15px] font-semibold leading-6 text-text" style={{ fontFamily: 'var(--font-display)' }}>{t(joriy.sarlavha ?? (joriy.xavfli ? 'Amalni tasdiqlang' : 'Davom etamizmi?'))}</h2>
                <p id="tasdiq-matn" className="mt-1 whitespace-pre-line text-[13px] leading-5 text-text-dim">{t(joriy.matn)}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
              <button ref={bekorRef} type="button" className="fz-btn" onClick={() => yop(false)}>{t(joriy.bekorMatni ?? 'Bekor qilish')}</button>
              <button ref={asosiy} type="button" className={`fz-btn ${joriy.xavfli ? 'fz-btn--danger' : 'fz-btn--primary'}`} onClick={() => yop(true)}>{t(joriy.tasdiqMatni ?? 'Tasdiqlash')}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
