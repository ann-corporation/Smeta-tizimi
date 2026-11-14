/**
 * Foydalanuvchiga ochiq sahifalar (AdminShell sidebar/Ctrl+K bilan BIR manba: rol/ruxsat/modul filtridan o'tgan) — yordamchi
 * (Jarvis) shu ro'yxat bo'yicha ochadi. AdminShell yozadi, AiHelper o'qiydi (ular bir-biriga to'g'ridan-to'g'ri bog'liq emas).
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { YordamchiSahifa } from './sahifa-qidiruv';

const BOSH: readonly YordamchiSahifa[] = [];
let joriy: readonly YordamchiSahifa[] = BOSH;
let imzo = '';
const tinglovchilar = new Set<() => void>();

export function yordamchiSahifalarniOrnat(royxat: readonly YordamchiSahifa[]): void {
  const yangi = royxat.map((s) => `${s.yol}|${s.nom}`).join('\n');
  if (yangi === imzo) return;
  imzo = yangi; joriy = royxat.length ? royxat.map((s) => ({ yol: s.yol, nom: s.nom, guruh: s.guruh })) : BOSH;
  tinglovchilar.forEach((f) => f());
}

export const yordamchiSahifalarOl = (): readonly YordamchiSahifa[] => joriy;

export function useYordamchiSahifalar(): readonly YordamchiSahifa[] {
  return useSyncExternalStore((f) => { tinglovchilar.add(f); return () => { tinglovchilar.delete(f); }; }, () => joriy, () => BOSH);
}

/** AdminShell ichida render qilinadi: ruxsatli sahifalar ro'yxatini do'konga yozadi (hech narsa chizmaydi). */
export function YordamchiSahifaYozuvchi({ bandlar }: { bandlar: readonly YordamchiSahifa[] }): null {
  useEffect(() => { yordamchiSahifalarniOrnat(bandlar); }, [bandlar]);
  return null;
}
