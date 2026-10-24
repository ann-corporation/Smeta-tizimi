import { useEffect, useRef, useSyncExternalStore } from 'react';
import { tugmaniBajar, type HotkeyDef } from './core';

/**
 * Yagona dispetcher: bitta `window` keydown tinglovchisi, ro'yxatdan o'tgan sohalar (scope) stekida. Oxirgi ro'yxatdan
 * o'tgan (masalan ochilgan oyna) birinchi navbatda; `?` yordam oynasi hamma sohalarni ko'rsatadi (dublikat yo'q).
 */
type Reg = { id: symbol; scope: string; nom: string; defs: () => readonly HotkeyDef[]; faol: () => boolean };
const regs: Reg[] = [];
const kuzatuvchilar = new Set<() => void>();
let versiya = 0;
let ulangan = false;

const bildir = () => { versiya++; kuzatuvchilar.forEach((f) => f()); };

function keydown(e: KeyboardEvent) {
  const guruhlar = [...regs].reverse().filter((r) => r.faol()).map((r) => r.defs());
  tugmaniBajar(guruhlar, e);
}
function ula() {
  if (ulangan || typeof window === 'undefined') return;
  window.addEventListener('keydown', keydown);
  ulangan = true;
}
function uz() {
  if (!ulangan || regs.length) return;
  window.removeEventListener('keydown', keydown);
  ulangan = false;
}

/** Hozir faol sohalar va ularning qoidalari (yordam oynasi uchun). */
export function faolSohalar(): Array<{ scope: string; nom: string; defs: readonly HotkeyDef[] }> {
  return regs.filter((r) => r.faol()).map((r) => ({ scope: r.scope, nom: r.nom, defs: r.defs() }));
}

/** Sohani ro'yxatdan o'tkazadi. `defs` har renderda yangilanadi (closure eskirmaydi). `faol=false` bo'lsa tugmalar o'tkazib yuboriladi. */
export function useHotkeys(scope: string, nom: string, defs: readonly HotkeyDef[], faol = true): void {
  const defsRef = useRef(defs); defsRef.current = defs;
  const faolRef = useRef(faol); faolRef.current = faol;
  useEffect(() => {
    const reg: Reg = { id: Symbol(scope), scope, nom, defs: () => defsRef.current, faol: () => faolRef.current };
    regs.push(reg); ula(); bildir();
    return () => { const i = regs.findIndex((r) => r.id === reg.id); if (i >= 0) regs.splice(i, 1); uz(); bildir(); };
  }, [scope, nom]);
  // faol/defs o'zgarganda yordam ro'yxati yangilansin
  useEffect(() => { bildir(); }, [faol, defs.length]);
}

/** Yordam oynasi qayta chizilishi uchun. */
export function useHotkeyVersiya(): number {
  return useSyncExternalStore((f) => { kuzatuvchilar.add(f); return () => { kuzatuvchilar.delete(f); }; }, () => versiya, () => 0);
}
