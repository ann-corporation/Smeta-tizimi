import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '../../i18n/til';

/**
 * Firuza modal oynasi: role="dialog" + aria-modal + aria-labelledby; Esc yopadi; fon bosilsa yopiladi;
 * ochilganda fokus oyna ichiga (birinchi maydon `autoFocus` bo'lsa — o'sha), yopilganda — oldingi elementga qaytadi.
 */
export function ModalOyna({ sarlavha, ikon, yop, kenglik = 520, children }: {
  sarlavha: string; ikon?: ReactNode; yop: () => void; kenglik?: number; children: ReactNode;
}) {
  const id = useId();
  const oyna = useRef<HTMLDivElement>(null);
  const yopRef = useRef(yop);
  yopRef.current = yop;

  useEffect(() => {
    const oldingi = document.activeElement as HTMLElement | null;
    if (oyna.current && !oyna.current.contains(document.activeElement)) oyna.current.focus();
    const tugma = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); yopRef.current(); return; }
      if (e.key !== 'Tab' || !oyna.current) return;
      const fokusli = [...oyna.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!fokusli.length) return;
      const birinchi = fokusli[0], oxirgi = fokusli[fokusli.length - 1];
      if (e.shiftKey && (document.activeElement === birinchi || document.activeElement === oyna.current)) { e.preventDefault(); oxirgi.focus(); }
      else if (!e.shiftKey && document.activeElement === oxirgi) { e.preventDefault(); birinchi.focus(); }
    };
    window.addEventListener('keydown', tugma);
    return () => { window.removeEventListener('keydown', tugma); oldingi?.focus?.(); };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) yop(); }}>
      <div ref={oyna} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} className="fz-card flex max-h-[92vh] w-full flex-col outline-none"
        style={{ maxWidth: kenglik, boxShadow: 'var(--shadow-pop)', overflow: 'auto' }}>
        <div className="fz-card__head">
          <h3 id={id} className="fz-card__title flex items-center gap-2">{ikon}{t(sarlavha)}</h3>
          <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={yop} aria-label={t('Yopish')}><X aria-hidden="true" /></button>
        </div>
        <div className="fz-card__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
