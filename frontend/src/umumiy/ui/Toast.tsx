import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { t } from '../../i18n/til';
import { izHodisasiYubor } from '../../lib/agent-faoliyat';

/** Dizayn tokenlariga mos: ok=--ok, warn=--warn, danger=--danger.
 *  ⚠️ 'success' YO'Q — 'ok' ishlating (build yiqiladi). */
export type ToastType = 'ok' | 'warn' | 'danger';

interface ToastEvent {
  message: string;
  type: ToastType;
  onUndo?: () => void;
  /** Ko'rinib turish vaqti (ms). Berilmasa: undo bilan 10s, aks holda 3s. */
  davomiylik?: number;
  action?: { label: string; onClick: () => void };
}

let toastListener: ((toast: ToastEvent) => void) | null = null;

export const toast = (
  message: string,
  type: ToastType = 'ok',
  onUndo?: () => void,
  davomiylik?: number,
  action?: { label: string; onClick: () => void },
) => {
  /* AI kuzatuvi uchun: xato bo'ldi (MATNSIZ — faqat tur; foydalanuvchi ma'lumoti AI izga tushmaydi). */
  if (type === 'danger') izHodisasiYubor('xato', 'xato xabari');
  if (toastListener) {
    // Til qoidasi: xabar lug'atda bo'lsa — tanlangan tilda (dinamik xabarlar o'zgarmaydi).
    toastListener({ message: t(message), type, onUndo, davomiylik, action: action && { ...action, label: t(action.label) } });
  }
};

/* Firuza (2026-10-25): toast — tinch panel, rangli belgi + so'z, qolgan vaqt chizig'i, prujinali harakat. */
const RANG: Record<ToastType, string> = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)' };

export function ToastContainer() {
  const [toasts, setToasts] = useState<(ToastEvent & { id: number; ms: number })[]>([]);

  useEffect(() => {
    toastListener = (t) => {
      // Millisecond collision prevent
      const id = Date.now() + Math.random();
      const ms = t.davomiylik ?? (t.onUndo ? 10000 : (t.action ? 10000 : 3000));
      setToasts((prev) => {
        const next = [...prev, { ...t, id, ms }];
        // Maksimal 5 ta toast qolishi kerak (eskilari o'chiriladi)
        if (next.length > 5) return next.slice(next.length - 5);
        return next;
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, ms);
    };
    return () => {
      toastListener = null;
    };
  }, []);

  const yop = (id: number) => setToasts((prev) => prev.filter((toast) => toast.id !== id));

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            layout
            role={item.type === 'danger' ? 'alert' : 'status'}
            initial={{ opacity: 0, x: 24, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative flex max-w-[420px] items-start gap-3 overflow-hidden rounded-[var(--radius-md)] border border-border bg-[var(--surface-3)] py-3 pl-3 pr-2 text-[13px] text-text shadow-[var(--shadow-pop)]"
          >
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ color: RANG[item.type], background: `color-mix(in srgb, ${RANG[item.type]} 16%, transparent)` }}>
              {item.type === 'ok' ? <CheckCircle2 size={15} />
                : item.type === 'warn' ? <AlertTriangle size={15} />
                : <AlertCircle size={15} />}
            </span>
            <span className="min-w-0 flex-1 py-0.5 font-medium leading-5">{item.message}</span>
            {item.onUndo && (
              <button
                onClick={() => { item.onUndo!(); yop(item.id); }}
                className="fz-btn fz-btn--sm shrink-0"
              >
                ↶ {t('Bekor qilish')}
              </button>
            )}
            {item.action && (
              <button
                onClick={() => { item.action!.onClick(); yop(item.id); }}
                className="fz-btn fz-btn--sm fz-btn--primary shrink-0"
              >
                {item.action.label}
              </button>
            )}
            <button
              onClick={() => yop(item.id)}
              aria-label={t('Yopish')}
              title={t('Yopish')}
              className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm shrink-0"
            >
              <X size={15} />
            </button>
            <motion.i
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-[2px]"
              style={{ background: RANG[item.type], width: '100%', transformOrigin: 'left' }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: item.ms / 1000, ease: 'linear' }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
