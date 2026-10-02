/**
 * HujjatTomonlari — PTO hujjatlari imzo blokidagi tomonlar nomi (H3).
 *
 * Nom saytdan (foydalanuvchi kiritadi) keladi va shu brauzerda kompaniya
 * bo'yicha eslab qolinadi; bo'sh qoldirilsa hujjatda to'ldirish chizig'i
 * chiqadi — nom hech qachon o'ylab topilmaydi. Barcha eksport tugmalari
 * (Ostatka, АКТ Ф-2, Накопительная, Ресурсная ведомость) bir xil qiymatni
 * ishlatadi.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';

const kalit = (kompaniyaId: number | null | undefined) => `hujjat-tomonlari:${kompaniyaId ?? 'umumiy'}`;

function oqi(kompaniyaId: number | null | undefined): ImzoNomlar {
  try {
    const x = JSON.parse(globalThis.localStorage?.getItem(kalit(kompaniyaId)) || '{}');
    return x && typeof x === 'object' ? x as ImzoNomlar : {};
  } catch { return {}; }
}

export function useHujjatTomonlari(kompaniyaId: number | null | undefined): [ImzoNomlar, (next: ImzoNomlar) => void] {
  const [nomlar, setNomlar] = useState<ImzoNomlar>(() => oqi(kompaniyaId));
  useEffect(() => { setNomlar(oqi(kompaniyaId)); }, [kompaniyaId]);
  const saqla = useCallback((next: ImzoNomlar) => {
    setNomlar(next);
    try { globalThis.localStorage?.setItem(kalit(kompaniyaId), JSON.stringify(next)); } catch { /* xotira yopiq — faqat shu sessiya */ }
  }, [kompaniyaId]);
  return [nomlar, saqla];
}

const MAYDONLAR: Array<{ k: keyof ImzoNomlar; yorliq: string }> = [
  { k: 'zakazchik', yorliq: 'Buyurtmachi (ЗАКАЗЧИК)' },
  { k: 'pudratchi', yorliq: 'Pudratchi (ПОДРЯДЧИК)' },
  { k: 'subpudratchi', yorliq: 'Subpudratchi (СУБПОДРЯДЧИК) — 3 tomonlama bo‘lsa' },
  { k: 'texnadzor', yorliq: 'Texnik nazorat (ТЕХНАДЗОР)' },
  { k: 'tuzuvchi', yorliq: 'Tuzuvchi (СОСТАВИЛ)' },
];

/** Yig'iladigan kichik panel: hujjat imzo tomonlari. */
export function HujjatTomonlariPanel({ qiymat, onChange }: { qiymat: ImzoNomlar; onChange: (next: ImzoNomlar) => void }) {
  return (
    <details className="text-[12px] text-text-dim">
      <summary className="cursor-pointer select-none">Hujjat imzolari: {qiymat.zakazchik || qiymat.pudratchi ? [qiymat.zakazchik, qiymat.pudratchi].filter(Boolean).join(' / ') : 'kiritilmagan (hujjatda chiziq)'}</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {MAYDONLAR.map((m) => (
          <label key={m.k} className="block">
            {m.yorliq}
            <input aria-label={m.yorliq} value={qiymat[m.k] ?? ''} onChange={(e) => onChange({ ...qiymat, [m.k]: e.target.value })}
              placeholder="tashkilot, lavozim, F.I.O." className="mt-1 block h-8 w-full rounded border border-border bg-surface-2 px-2 text-text" />
          </label>
        ))}
      </div>
    </details>
  );
}
