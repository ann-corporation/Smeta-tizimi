/**
 * Sahifa amallari reestri (registry hook): sahifa o'zining buyruqlarini yagona yordamchiga (Jarvis) shu orqali beradi
 * (masalan Smeta Studio: «katalogdan ish qo'sh», «serverga saqlash»). Yordamchi ularni tabiiy tilda topadi va bajaradi;
 * `tasdiq: true` amallar avval taklif kartasi («Bajarish») orqali. Sahifa yopilganda amallar o'zi o'chadi.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { SahifaAmalQisqa } from './niyat';

export type SahifaAmalReg = SahifaAmalQisqa & { run: () => void };

type Yozuv = { id: symbol; amallar: () => readonly SahifaAmalReg[] };
const yozuvlar: Yozuv[] = [];
const tinglovchilar = new Set<() => void>();
let versiya = 0;
let kesh: { v: number; l: readonly SahifaAmalQisqa[] } = { v: -1, l: [] };
const bildir = () => { versiya++; tinglovchilar.forEach((f) => f()); };

const BOSH: readonly SahifaAmalQisqa[] = [];
function royxat(): readonly SahifaAmalQisqa[] {
  if (kesh.v === versiya) return kesh.l;
  const l = yozuvlar.flatMap((y) => y.amallar().map(({ run: _r, ...q }) => q));
  kesh = { v: versiya, l: l.length ? l : BOSH };
  return kesh.l;
}

/** Hozir ro'yxatdan o'tgan sahifa amallari (tavsif; `run` yashirin). */
export const sahifaAmallariOl = (): readonly SahifaAmalQisqa[] => royxat();

export function sahifaAmaliniBajar(id: string): boolean {
  for (const y of [...yozuvlar].reverse()) {
    const a = y.amallar().find((x) => x.id === id);
    if (a) { a.run(); return true; }
  }
  return false;
}

export function useSahifaAmallari(): readonly SahifaAmalQisqa[] {
  return useSyncExternalStore((f) => { tinglovchilar.add(f); return () => { tinglovchilar.delete(f); }; }, royxat, () => BOSH);
}

/** Sahifa komponenti chaqiradi: `amallar` har renderda yangilanadi (closure eskirmaydi), nomlar o'zgarsa ro'yxat yangilanadi. */
export function useYordamchiSahifaAmallari(amallar: readonly SahifaAmalReg[]): void {
  const ref = useRef(amallar); ref.current = amallar;
  const imzo = amallar.map((a) => `${a.id}|${a.nom}|${a.tasdiq ? 1 : 0}`).join('\n');
  useEffect(() => {
    const y: Yozuv = { id: Symbol('sahifa-amal'), amallar: () => ref.current };
    yozuvlar.push(y); bildir();
    return () => { const i = yozuvlar.indexOf(y); if (i >= 0) yozuvlar.splice(i, 1); bildir(); };
  }, [imzo]);
}
