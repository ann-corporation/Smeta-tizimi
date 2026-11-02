import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { t } from '../../i18n/til';

/** Mavzu: qorong‘i «Firuza», yorug‘ «Ganch» yoki tizim (OS prefers-color-scheme) bo‘yicha. */
export type Mavzu = 'firuza' | 'ganch' | 'tizim';

const KALIT = 'fz-mavzu';
const THEME_COLOR = { firuza: '#0e1113', ganch: '#f5f4f0' } as const;
const OS_SORO = '(prefers-color-scheme: light)';

function oqi(): Mavzu {
  try {
    const q = localStorage.getItem(KALIT);
    if (q === 'firuza' || q === 'ganch' || q === 'tizim') return q;
  } catch { /* private oyna / bloklangan saqlash */ }
  return 'firuza';
}

function osYorug(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia(OS_SORO).matches; } catch { return false; }
}

function hisobla(m: Mavzu): 'firuza' | 'ganch' {
  return m === 'tizim' ? (osYorug() ? 'ganch' : 'firuza') : m;
}

function qollash(m: Mavzu): void {
  if (typeof document === 'undefined') return;
  const a = hisobla(m);
  if (a === 'ganch') document.documentElement.dataset.mavzu = 'ganch';
  else delete document.documentElement.dataset.mavzu;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[a]);
}

let joriy: Mavzu = oqi();
let osTomosha = 0;
const tinglovchilar = new Set<() => void>();
const xabar = () => tinglovchilar.forEach((f) => f());

function osOzgardi() { if (joriy === 'tizim') { qollash(joriy); xabar(); } }

function obuna(f: () => void): () => void {
  tinglovchilar.add(f);
  let mq: MediaQueryList | null = null;
  try { mq = typeof matchMedia === 'function' ? matchMedia(OS_SORO) : null; } catch { mq = null; }
  if (mq && osTomosha++ === 0) mq.addEventListener?.('change', osOzgardi);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KALIT) { joriy = oqi(); qollash(joriy); xabar(); }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    tinglovchilar.delete(f);
    window.removeEventListener('storage', onStorage);
    if (mq && --osTomosha === 0) mq.removeEventListener?.('change', osOzgardi);
  };
}

/** Saqlangan qiymatni qayta o‘qiydi (testlar va tashqi o‘zgarishlar uchun). */
// oxlint-disable-next-line react/only-export-components
export function _mavzuniQaytaOqi(): void { joriy = oqi(); qollash(joriy); xabar(); }

// oxlint-disable-next-line react/only-export-components
export function useMavzu(): { mavzu: Mavzu; setMavzu: (m: Mavzu) => void; amaldagi: 'firuza' | 'ganch' } {
  const mavzu = useSyncExternalStore(obuna, () => joriy, () => 'firuza' as Mavzu);
  // OS holati 'tizim' da o‘zgarsa, `amaldagi` qayta hisoblanishi uchun render kerak: xabar() shuni ta'minlaydi.
  const amaldagi = hisobla(mavzu);
  useEffect(() => { qollash(mavzu); }, [mavzu, amaldagi]);
  const setMavzu = useCallback((m: Mavzu) => {
    joriy = m;
    try { localStorage.setItem(KALIT, m); } catch { /* saqlanmasa ham amal qiladi */ }
    qollash(m);
    xabar();
  }, []);
  return { mavzu, setMavzu, amaldagi };
}

const VARIANTLAR: { qiymat: Mavzu; Ikon: typeof Moon; yorliq: string; sarlavha: string }[] = [
  { qiymat: 'firuza', Ikon: Moon, yorliq: 'Qorong‘i', sarlavha: 'Qorong‘i «Firuza»' },
  { qiymat: 'ganch', Ikon: Sun, yorliq: 'Yorug‘', sarlavha: 'Yorug‘ «Ganch»' },
  { qiymat: 'tizim', Ikon: Monitor, yorliq: 'Tizim bo‘yicha', sarlavha: 'Tizim bo‘yicha' },
];

/** Ixcham 3 variantli segment tanlagich. */
export function MavzuTanlagich({ className = '' }: { className?: string }) {
  const { mavzu, setMavzu } = useMavzu();
  return (
    <div
      role="radiogroup"
      aria-label={t('Mavzu')}
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-md border border-border-strong bg-surface-2 ${className}`}
    >
      {VARIANTLAR.map(({ qiymat, Ikon, yorliq, sarlavha }) => {
        const faol = mavzu === qiymat;
        return (
          <button
            key={qiymat}
            type="button"
            role="radio"
            aria-checked={faol}
            title={t(sarlavha)}
            onClick={() => setMavzu(qiymat)}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium transition-colors cursor-pointer ${
              faol ? '' : 'text-text-dim hover:bg-surface-3 hover:text-text'
            }`}
            style={faol ? { background: 'var(--accent)', color: 'var(--on-accent)' } : undefined}
          >
            <Ikon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t(yorliq)}</span>
          </button>
        );
      })}
    </div>
  );
}
