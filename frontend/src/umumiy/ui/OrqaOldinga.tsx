/**
 * OrqaOldinga — Provodnik (Explorer) kabi «◀ orqaga / oldinga ▶» tugmalari (egasi 2026-10-26: «hamma joyda kerak»).
 *
 * Brauzer tarixining o'zi ishlatiladi (navigate(-1) / navigate(1)) — alohida ro'yxat yuritilmaydi.
 * React Router `history.state.idx` beradi: idx > 0 — orqaga bor. Oldinga uchun eng uzoq idx kuzatiladi:
 * yangi sahifaga o'tish (PUSH) oldingi «oldinga» zanjirini kesadi — brauzer xulqi bilan bir xil.
 * Klaviatura: Alt+← / Alt+→ brauzerning o'zida ishlaydi (qayta bog'lanmaydi).
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { t } from '../../i18n/til';

const KALIT = 'fz-tarix-max';

function joriyIdx(): number {
  const idx = (globalThis.history?.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' && Number.isFinite(idx) ? idx : 0;
}
function maxOqi(): number {
  try { const n = Number(globalThis.sessionStorage?.getItem(KALIT)); return Number.isFinite(n) ? n : 0; } catch { return 0; }
}
function maxYoz(n: number) {
  try { globalThis.sessionStorage?.setItem(KALIT, String(n)); } catch { /* xotira yopiq — faqat shu sahifa */ }
}

/** Sof hisob (test uchun): yangi o'tish turidan keyingi «eng uzoq» idx. */
export function keyingiMax(tur: 'PUSH' | 'REPLACE' | 'POP', idx: number, oldingiMax: number): number {
  if (tur === 'PUSH') return idx;
  return Math.max(idx, oldingiMax);
}

export function OrqaOldinga() {
  const navigate = useNavigate();
  const location = useLocation();
  const tur = useNavigationType();
  const [holat, setHolat] = useState(() => ({ idx: joriyIdx(), max: Math.max(maxOqi(), joriyIdx()) }));

  useEffect(() => {
    const idx = joriyIdx();
    setHolat((h) => {
      const max = keyingiMax(tur, idx, h.max);
      maxYoz(max);
      return { idx, max };
    });
  }, [location.key, tur]);

  const orqa = holat.idx > 0;
  const oldinga = holat.idx < holat.max;
  const tugma = 'grid h-8 w-8 place-items-center rounded-md border border-border text-text-dim transition-colors hover:bg-bg-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('Sahifalar bo‘ylab yurish')}>
      <button type="button" className={tugma} disabled={!orqa} onClick={() => navigate(-1)}
        aria-label={t('Orqaga')} title={t('Orqaga (Alt+←)')}>
        <ChevronLeft size={17} aria-hidden="true" />
      </button>
      <button type="button" className={tugma} disabled={!oldinga} onClick={() => navigate(1)}
        aria-label={t('Oldinga')} title={t('Oldinga (Alt+→)')}>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
