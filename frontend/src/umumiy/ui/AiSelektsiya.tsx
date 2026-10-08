import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { t } from '../../i18n/til';

type Joy = { x: number; y: number; matn: string };
const MIN = 2; const MAX = 200;

/** Tanlangan matn kiritish maydonida (parol, forma, tahrirlanadigan joy) bo'lsa — HECH QACHON taklif qilinmaydi. */
export function selektsiyaMatni(sel: Selection | null): string | null {
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const matn = sel.toString().replace(/\s+/g, ' ').trim();
  if (matn.length < MIN || matn.length > MAX) return null;
  const tugunlar = [sel.anchorNode, sel.focusNode];
  for (const n of tugunlar) {
    const el = n instanceof Element ? n : n?.parentElement;
    if (!el) return null;
    if (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-ai-yashir], [role="dialog"][aria-label*="Jarvis"]')) return null;
  }
  return matn;
}

/**
 * Ko'rinib turgan istalgan matn yoki raqamni belgilang — yonida «AI: tushuntir» chiqadi. Bosilsa AI shu atama/raqam nimani bildirishini
 * va qanday hisoblanganini (sahifa va lavozim doirasida) tushuntiradi. Faqat foydalanuvchi o'zi belgilagan va «tushuntir» bosgan matn yuboriladi;
 * kiritish maydonlaridagi matn hech qachon o'qilmaydi.
 */
export function AiSelektsiya() {
  const [joy, setJoy] = useState<Joy | null>(null);
  useEffect(() => {
    const korsat = () => {
      const sel = window.getSelection();
      const matn = selektsiyaMatni(sel);
      if (!matn || !sel) { setJoy(null); return; }
      const range = sel.getRangeAt(0);
      const r = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : { left: 24, top: 48, width: 0, height: 0 };
      setJoy({ x: Math.min(window.innerWidth - 140, Math.max(8, r.left + r.width / 2 - 55)), y: Math.max(8, r.top - 34), matn });
    };
    const yop = () => setJoy(null);
    document.addEventListener('mouseup', korsat);
    document.addEventListener('keyup', korsat);
    document.addEventListener('scroll', yop, true);
    return () => { document.removeEventListener('mouseup', korsat); document.removeEventListener('keyup', korsat); document.removeEventListener('scroll', yop, true); };
  }, []);
  if (!joy) return null;
  const sora = () => {
    window.dispatchEvent(new CustomEvent('ai:ochish', { detail: { savol: `${t('Bu nimani bildiradi va qanday hisoblangan?')} «${joy.matn}»` } }));
    window.getSelection()?.removeAllRanges(); setJoy(null);
  };
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={sora} data-testid="ai-selektsiya"
      style={{ position: 'fixed', left: joy.x, top: joy.y, zIndex: 60 }}
      className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-white shadow-lg hover:bg-accent/90">
      <Sparkles size={12} /> {t('AI: tushuntir')}
    </button>
  );
}
