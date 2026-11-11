/**
 * Ovozli buyruq (Web Speech API). Faqat MATN beradi: natija input'ga tushadi, foydalanuvchi tuzatib o'zi yuboradi.
 * Hech qachon avto-yubormaydi va hech qachon tasdiqlamaydi (noto'g'ri tanish xavfi) — tasdiq faqat klaviatura/sichqoncha.
 * Brauzer qo'llamasa (yoki uz-UZ ishlamasa) — `ovozQollanadimi()` false va mikrofon tugmasi yashiriladi; matn ishlayveradi.
 */
import type { Til } from '../../i18n/til';

export type OvozTil = 'uz-UZ' | 'ru-RU';
export const OVOZ_TILLAR: readonly OvozTil[] = ['uz-UZ', 'ru-RU'];

type TanishNatija = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type TanishEvent = { resultIndex: number; results: ArrayLike<TanishNatija> };
type Tanish = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: TanishEvent) => void) | null; onerror: ((e: { error?: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type TanishKonstruktor = new () => Tanish;

function konstruktor(): TanishKonstruktor | null {
  const w = (typeof window === 'undefined' ? {} : window) as unknown as { SpeechRecognition?: TanishKonstruktor; webkitSpeechRecognition?: TanishKonstruktor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const ovozQollanadimi = (): boolean => konstruktor() != null;

/** Sukut til: interfeys rus bo'lsa — rus, aks holda o'zbek. */
export const ovozSukutTil = (til: Til): OvozTil => (til === 'ru' ? 'ru-RU' : 'uz-UZ');

export type OvozHandler = { natija: (matn: string, yakuniy: boolean) => void; xato: (kod: string) => void; tugadi: () => void };

/** Tinglashni boshlaydi; qaytarilgan `toxtat` — qo'lda to'xtatish. Qo'llanmasa null. */
export function ovozBoshla(til: OvozTil, h: OvozHandler): { toxtat: () => void } | null {
  const K = konstruktor();
  if (!K) return null;
  let r: Tanish;
  try { r = new K(); } catch { return null; }
  r.lang = til; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  r.onresult = (e) => {
    let matn = ''; let yakuniy = true;
    for (let i = 0; i < e.results.length; i++) { const x = e.results[i]; matn += x[0]?.transcript ?? ''; if (!x.isFinal) yakuniy = false; }
    h.natija(matn.trim(), yakuniy);
  };
  r.onerror = (e) => h.xato(e.error ?? 'xato');
  r.onend = () => h.tugadi();
  try { r.start(); } catch { return null; }
  return { toxtat: () => { try { r.stop(); } catch { /* allaqachon to'xtagan */ } } };
}
