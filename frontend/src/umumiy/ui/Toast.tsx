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

const USLUB: Record<ToastType, string> = {
  ok: 'border-ok text-ok',
  warn: 'border-warn text-warn',
  danger: 'border-danger text-danger',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<(ToastEvent & { id: number })[]>([]);

  useEffect(() => {
    toastListener = (t) => {
      // Millisecond collision prevent
      const id = Date.now() + Math.random();
      setToasts((prev) => {
        const next = [...prev, { ...t, id }];
        // Maksimal 5 ta toast qolishi kerak (eskilari o'chiriladi)
        if (next.length > 5) return next.slice(next.length - 5);
        return next;
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, t.davomiylik ?? (t.onUndo ? 10000 : (t.action ? 10000 : 3000)));
    };
    return () => {
      toastListener = null;
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border bg-surface-2 ${USLUB[item.type]}`}
          >
            {item.type === 'ok' ? <CheckCircle2 size={20} />
              : item.type === 'warn' ? <AlertTriangle size={20} />
              : <AlertCircle size={20} />}
            <span className="text-white font-medium text-sm">{item.message}</span>
            {item.onUndo && (
              <button
                onClick={() => {
                  item.onUndo!();
                  setToasts((prev) => prev.filter((toast) => toast.id !== item.id));
                }}
                className="ml-4 px-2 py-1 text-xs font-medium bg-surface rounded border border-border hover:bg-surface-2 transition-colors text-white"
              >
                ↶ {t('Bekor qilish')}
              </button>
            )}
            {item.action && (
              <button
                onClick={() => {
                  item.action!.onClick();
                  setToasts((prev) => prev.filter((toast) => toast.id !== item.id));
                }}
                className="ml-4 px-2 py-1 text-xs font-medium bg-sky-500/20 text-sky-300 rounded border border-sky-500/50 hover:bg-sky-500/30 transition-colors"
              >
                {item.action.label}
              </button>
            )}
            <button
              onClick={() => setToasts((prev) => prev.filter((toast) => toast.id !== item.id))}
              aria-label={t('Yopish')}
              title={t('Yopish')}
              className={`${(item.onUndo || item.action) ? 'ml-2' : 'ml-auto'} p-1 rounded hover:bg-white/10 transition-colors text-text-dim hover:text-white`}
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
