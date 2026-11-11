/**
 * Virtualizatsiya + katak fokusi (id bo'yicha, indeks bo'yicha emas) — Fakt jurnali va Ish varag'i uchun yagona mexanika.
 * FaktJurnal'dan CHIQARILGAN (xulq o'zgarmagan). Virtualizatsiya faqat chizishni cheklaydi: barcha qatorlar,
 * kiritmalar va saqlash paketi to'liq qoladi; faol va fokusdagi qator doim chiziladi (fokus yo'qolmaydi).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';

/** Katak (input) ro'yxati va fokus holati. Virtualizer hali yo'q joyda (komponent tepasida) chaqiriladi. */
export function useKatakFokus() {
  const inputlar = useRef(new Map<number, HTMLInputElement>());
  const fokusSorov = useRef<number | null>(null);
  const [fokusId, setFokusId] = useState<number | null>(null);
  return { inputlar, fokusSorov, fokusId, setFokusId };
}

export function useVirtualSatrlar<S extends { key: string }>(o: {
  satrlar: readonly S[];
  /** Virtualizatsiya yoqilgan (kichik ro'yxatda o'chiq — to'liq chiziladi). */
  yoqilgan: boolean;
  jadvalRef: { current: HTMLDivElement | null };
  taxminBalandlik: (s: S) => number;
  /** satr.key → indeks. */
  keyIndeks: ReadonlyMap<string, number>;
  /** qator id → indeks (fokusga o'tish uchun). */
  satrIndeks: ReadonlyMap<number, number>;
  fokus: ReturnType<typeof useKatakFokus>;
  scrollMargin?: number;
}) {
  const { satrlar, yoqilgan, jadvalRef, taxminBalandlik, keyIndeks, satrIndeks, fokus, scrollMargin = 64 } = o;
  const { inputlar, fokusSorov, fokusId, setFokusId } = fokus;
  const fokusSatr = fokusId == null ? undefined : satrIndeks.get(fokusId);
  /** satr.key → indeks (faol qator ref'da; virtual ro'yxat uni doim chizadi — fokus yo'qolmaydi). */
  const keyIndeksRef = useRef(keyIndeks); keyIndeksRef.current = keyIndeks;
  const faolRef = useRef<string | null>(null);
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const indices = defaultRangeExtractor(range);
    const faolI = faolRef.current == null ? undefined : keyIndeksRef.current.get(faolRef.current);
    const qosh = [fokusSatr, faolI].filter((x): x is number => x != null && !indices.includes(x));
    return qosh.length ? [...new Set([...indices, ...qosh])].sort((a, b) => a - b) : indices;
  }, [fokusSatr]);
  const virtual = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: satrlar.length, enabled: yoqilgan, getScrollElement: () => jadvalRef.current,
    getItemKey: i => satrlar[i].key, estimateSize: i => taxminBalandlik(satrlar[i]),
    overscan: 8, scrollMargin, scrollPaddingStart: scrollMargin, rangeExtractor,
  });
  useEffect(() => {
    const id = fokusSorov.current;
    if (id != null && inputlar.current.has(id)) { fokusSorov.current = null; inputlar.current.get(id)!.focus(); }
  });
  const fokusgaOt = (id: number | undefined) => {
    if (id == null) return;
    const el = inputlar.current.get(id);
    if (el) { el.focus(); return; }
    const index = satrIndeks.get(id);
    if (index == null) return;
    fokusSorov.current = id;
    virtual.scrollToIndex(index, { align: 'auto' });
    setFokusId(id);
  };
  return { virtual, faolRef, fokusgaOt };
}
