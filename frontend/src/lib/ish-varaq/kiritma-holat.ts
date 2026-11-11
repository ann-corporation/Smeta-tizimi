/**
 * Ish varag'i / Fakt jurnali: kiritma (qoralama) holati — `+5` / `=40` / `50%` yozuvlari, ommaviy amallar tarixi (Ctrl+Z).
 * FaktJurnal'dan CHIQARILGAN (xulq o'zgarmagan); ikkala ekran bitta mexanikadan foydalanadi.
 */
import { useState } from 'react';
import type { Kiritma, Rejim } from '../fakt-jurnal';
import { tarixgaQosh, type Kiritmalar } from '../fakt-foiz-grid';

export function useKiritmaHolat() {
  const [kiritmalar, setKiritmalar] = useState<Record<number, Kiritma>>({});
  /** Qoralama tarixi (ommaviy amallar: foiz chiplari, ustun joylash) — «Orqaga» / Ctrl+Z. */
  const [tarix, setTarix] = useState<Kiritmalar[]>([]);
  const ommaviy = (yangi: Kiritmalar) => { setTarix((x) => tarixgaQosh(x, kiritmalar)); setKiritmalar(yangi); };
  const orqaga = () => { const oxirgi = tarix[tarix.length - 1]; if (!oxirgi) return false; setTarix((x) => x.slice(0, -1)); setKiritmalar(oxirgi); return true; };
  const tozala = () => { setTarix([]); setKiritmalar({}); };
  const kirit = (id: number, patch: Partial<Kiritma>) => setKiritmalar((o) => {
    const eski = o[id] ?? { rejim: '+' as Rejim, qiymat: '' };
    const yangi = { ...eski, ...patch };
    const n = { ...o };
    if (!yangi.qiymat.trim() && patch.rejim == null) delete n[id]; else n[id] = yangi;
    return n;
  });
  const ozgarishSoni = Object.values(kiritmalar).filter((k) => k.qiymat.trim()).length;
  return { kiritmalar, setKiritmalar, tarix, setTarix, ommaviy, orqaga, tozala, kirit, ozgarishSoni };
}
