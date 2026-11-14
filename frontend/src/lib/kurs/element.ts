/** Qadam ko‘rsatkichi -> ekrandagi element (topilmasa null: qadam faqat matn bilan ko‘rsatiladi). */
import { korsatkichAjrat, type Korsatkich } from './model';
import { sahifaYoli } from './yol';

export function korsatkichElementi(k: Korsatkich | undefined, doc: Document = document): HTMLElement | null {
  const a = k ? korsatkichAjrat(k) : null;
  if (!a) return null;
  const sel = a.tur === 'menyu' ? `a[href="${sahifaYoli(a.id) ?? ''}"]` : a.tur === 'kurs' ? `[data-kurs="${a.id}"]` : `[data-testid="${a.id}"]`;
  const el = doc.querySelector<HTMLElement>(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? el : ((el.firstElementChild as HTMLElement | null) ?? el);
}