/**
 * YAGONA KLAVIATURA MODULI — sof mantiq (egasi 2026-10-24: «F2 import, F2 yasash, Fakt, Studio da bir xil tizim»).
 *
 * Qoidalar:
 *  - Tugma kaliti normallashadi: `ctrl+shift+arrowdown`, `n`, `?`, `space`, `esc`, `enter` (Cmd = Ctrl).
 *  - Input/textarea/select/contenteditable ichida yozayotganda faqat `inInput: true` belgilangan tugmalar ishlaydi va
 *    qisqa (modifikatorsiz) harf/belgi tugmalar HECH QACHON ishlamaydi (yozishga xalaqit bermaydi).
 *  - IME kompozitsiyasi paytida hech narsa ishlamaydi.
 *  - Bir tugmaga bir nechta qoida bo'lsa — eng yuqori ustuvorlik (oxirgi ro'yxatdan o'tgan, ochiq oyna) birinchi; `run`
 *    `false` qaytarsa tugma "ishlanmadi" hisoblanadi va keyingi qoidaga o'tiladi.
 */
export type HotkeyDef = {
  id: string;
  /** Bitta yoki bir nechta kalit (masalan ['arrowdown', 'j']). */
  keys: string | readonly string[];
  /** Yordam oynasi uchun qisqa tavsif (t() bilan). */
  nom: string;
  guruh?: string;
  run: (e: KeyboardEvent) => boolean | void;
  /** Matn kiritish maydonida ham ishlaydi (faqat modifikatorli yoki Esc/Enter kabi tugmalar uchun). */
  inInput?: boolean;
  enabled?: boolean | (() => boolean);
};

export type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'> & { code?: string };

const NOM: Record<string, string> = { ' ': 'space', spacebar: 'space', escape: 'esc', esc: 'esc', del: 'delete', return: 'enter', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };

/** Kalitni normallashtiradi: modifikatorlar tartibi ctrl, alt, shift, so'ng tugma. */
export function tugmaKaliti(e: KeyLike): string {
  let k = e.key.toLowerCase();
  // Kirill/boshqa klaviatura sxemasida ham jismoniy harf tugmasi (KeyN) lotincha qoidaga mos keladi.
  if (k.length === 1 && !/^[a-z]$/.test(k) && e.code && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3).toLowerCase();
  k = NOM[k] ?? k;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  // Belgi tugmalarda (?, /, +) Shift tugmaning o'zida mujassam: alohida modifikator emas.
  const harfmi = /^[a-zа-яё]$/i.test(k);
  const belgi = k.length === 1 && !harfmi && !/^\d$/.test(k);
  if (e.shiftKey && !belgi) parts.push('shift');
  parts.push(k);
  return parts.join('+');
}

/** Ta'rifdagi kalit satrini ham xuddi shu shaklga keltiradi (`Shift+ArrowDown` → `shift+arrowdown`). */
export function kalitNorm(s: string): string {
  const p = s.toLowerCase().split('+').map((x) => NOM[x] ?? x);
  const tugma = p[p.length - 1];
  const mods = new Set(p.slice(0, -1).map((m) => (m === 'cmd' || m === 'meta' ? 'ctrl' : m)));
  return [...['ctrl', 'alt', 'shift'].filter((m) => mods.has(m)), tugma].join('+');
}

/** Matn kiritiladigan element ichidami (yozish paytida qisqa tugmalar ishlamasligi uchun). */
export function inputdami(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(t);
  }
  return el.isContentEditable === true || el.getAttribute?.('contenteditable') === 'true';
}

/** Qisqa tugma = modifikatorsiz (yoki faqat Shift) harf/raqam/belgi — yozish bilan to'qnashadi. */
export function qisqaTugmami(kalit: string): boolean {
  const p = kalit.split('+');
  const tugma = p[p.length - 1];
  const mods = p.slice(0, -1).filter((m) => m !== 'shift');
  return mods.length === 0 && (tugma.length === 1 || tugma === 'space');
}

const ochiqmi = (d: HotkeyDef) => (typeof d.enabled === 'function' ? d.enabled() : d.enabled ?? true);
export const kalitlar = (d: HotkeyDef): string[] => (Array.isArray(d.keys) ? [...d.keys] : [d.keys as string]).map(kalitNorm);

/**
 * Qoidalar ro'yxatidan hodisaga mosini bajaradi. `ustuvorlik` — eng yuqorisi birinchi. Bajarilgan qoida qaytariladi.
 * `run` false qaytarsa keyingisiga o'tadi; aks holda preventDefault qilinadi.
 */
export function tugmaniBajar(ustuvorlik: readonly (readonly HotkeyDef[])[], e: KeyboardEvent): HotkeyDef | null {
  if (e.isComposing || (e as { keyCode?: number }).keyCode === 229) return null;
  const kalit = tugmaKaliti(e);
  const yozish = inputdami(e.target);
  for (const guruh of ustuvorlik) {
    for (const d of guruh) {
      if (!kalitlar(d).includes(kalit) || !ochiqmi(d)) continue;
      if (yozish && (!d.inInput || qisqaTugmami(kalit))) continue;
      if (d.run(e) === false) continue;
      e.preventDefault();
      return d;
    }
  }
  return null;
}

const BELGI: Record<string, string> = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', enter: 'Enter', esc: 'Esc', space: 'Space', tab: 'Tab', delete: 'Del', backspace: '⌫' };
/** Ko'rinadigan yozuv: `shift+arrowdown` → `Shift+↓`. */
export function tugmaMatni(kalit: string): string {
  return kalitNorm(kalit).split('+').map((x) => BELGI[x] ?? (x.length === 1 ? x.toUpperCase() : x[0].toUpperCase() + x.slice(1))).join('+');
}
/** Tooltip uchun: «Bog‘lash (B)». */
export const sarlavhaBilan = (nom: string, keys: string | readonly string[]): string =>
  `${nom} (${(Array.isArray(keys) ? keys : [keys as string]).slice(0, 2).map(tugmaMatni).join(' / ')})`;
