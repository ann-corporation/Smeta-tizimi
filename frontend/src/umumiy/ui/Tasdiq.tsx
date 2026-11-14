import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { t } from '../../i18n/til';
import { tinglovchiOrnat, type Ichki, type MatnIchki } from './tasdiq-yadro';

/**
 * TASDIQ OYNASI — brauzerning bloklovchi oynalari (confirm / prompt / alert) o'rniga (egasi 2026-10-25: har amal aniq va tushunarli bo'lsin).
 *   if (!(await tasdiqSora({ matn: 'F2 ni bekor qilasizmi?', xavfli: true }))) return;
 *   const sabab = await matnSora({ matn: 'Rad etish sababi?', majburiy: true });   // null = bekor
 * Esc / fon — bekor; Enter — tasdiq; fokus tasdiq tugmasida (xavfli amalda — bekor tugmasida; kiritish bo'lsa — maydonda).
 * Konteyner o'rnatilmagan bo'lsa (testlar) — `sinovUlagichOrnat` orqali berilgan javob beruvchi; u ham yo'q bo'lsa — bekor (false / null).
 * Bloklovchi brauzer oynalari src ichida taqiqlangan (qo'riqchi test: bloklovchi-oyna.test.ts).
 */
export { tasdiqSora, matnSora, sinovUlagichOrnat } from './tasdiq-yadro';
export type { MatnSorov } from './tasdiq-yadro';

function bekorQil(s: Ichki) { if (s.matnSorovi) s.javob(null); else s.javob(false); }

export function TasdiqContainer() {
  const [navbat, setNavbat] = useState<Ichki[]>([]);
  const joriy = navbat[0];
  const asosiy = useRef<HTMLButtonElement>(null);
  const bekorRef = useRef<HTMLButtonElement>(null);
  const kirishRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [kiritilgan, setKiritilgan] = useState('');

  useEffect(() => {
    tinglovchiOrnat((s) => setNavbat((n) => [...n, s]));
    return () => { tinglovchiOrnat(null); };
  }, []);

  // Konteyner o'chirilsa (marshrut almashishi, qayta o'rnatish) kutayotgan so'rovlar «bekor» bilan yakunlanadi — aks holda
  // ularni kutgan amal (masalan fakt saqlash) abadiy osilib qoladi va keyingi bosishlar jim e'tiborsiz qoladi.
  const navbatRef = useRef<Ichki[]>([]);
  navbatRef.current = navbat;
  useEffect(() => () => { for (const s of navbatRef.current) bekorQil(s); }, []);

  const matnYaroqli = !joriy?.matnSorovi || !joriy.majburiy || kiritilgan.trim().length >= (joriy.minUzunlik ?? 1);
  const yop = (ha: boolean) => {
    if (!joriy) return;
    if (joriy.matnSorovi) {
      if (ha && !matnYaroqli) return;
      joriy.javob(ha ? kiritilgan : null);
    } else joriy.javob(ha);
    setNavbat((n) => n.slice(1));
  };

  useEffect(() => {
    if (!joriy) return;
    setKiritilgan(joriy.matnSorovi ? joriy.boshlangich ?? '' : '');
    if (joriy.matnSorovi) setTimeout(() => kirishRef.current?.focus(), 0);
    else (joriy.xavfli ? bekorRef : asosiy).current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); yop(false); }
      if (e.key === 'Tab') {
        const a = [joriy.matnSorovi ? kirishRef.current : null, bekorRef.current, asosiy.current].filter(Boolean) as HTMLElement[];
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
              <div className="min-w-0 flex-1">
                <h2 id="tasdiq-sarlavha" className="m-0 text-[15px] font-semibold leading-6 text-text" style={{ fontFamily: 'var(--font-display)' }}>{t(joriy.sarlavha ?? (joriy.xavfli ? 'Amalni tasdiqlang' : 'Davom etamizmi?'))}</h2>
                <p id="tasdiq-matn" className="mt-1 whitespace-pre-line text-[13px] leading-5 text-text-dim">{t(joriy.matn)}</p>
                {joriy.matnSorovi ? kirishMaydoni(joriy, kiritilgan, setKiritilgan, kirishRef, () => yop(true)) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
              <button ref={bekorRef} type="button" className="fz-btn" onClick={() => yop(false)}>{t(joriy.bekorMatni ?? 'Bekor qilish')}</button>
              <button ref={asosiy} type="button" disabled={!matnYaroqli} className={`fz-btn ${joriy.xavfli ? 'fz-btn--danger' : 'fz-btn--primary'}`} onClick={() => yop(true)}>{t(joriy.tasdiqMatni ?? 'Tasdiqlash')}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Kiritish maydoni (bir yoki ko'p qator). Bir qatorli maydonda Enter — tasdiq. */
type KirishRef = RefObject<(HTMLTextAreaElement & HTMLInputElement) | null>;
type QiymatBer = (v: string) => void;
type Chaqir = () => void;
function kirishMaydoni(s: MatnIchki, qiymat: string, set: QiymatBer, ref: KirishRef, tasdiq: Chaqir) {
  const umumiy = { 'data-testid': 'matn-sorov', value: qiymat, className: 'input mt-1 w-full px-2 text-[13px]' };
  return (
    <label className="mt-2 block text-[12px] text-text-dim">
      {s.yorliq ? t(s.yorliq) : null}
      {s.kopQator === false
        ? <input {...umumiy} ref={ref} className={`${umumiy.className} h-9`} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tasdiq(); } }} />
        : <textarea {...umumiy} ref={ref} className={`${umumiy.className} h-20 py-1`} onChange={(e) => set(e.target.value)} />}
    </label>
  );
}
