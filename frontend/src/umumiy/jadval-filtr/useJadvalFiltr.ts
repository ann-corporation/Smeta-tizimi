import { useCallback, useMemo, useState } from 'react';
import { faolSoni, filtrla, type Daraxt, type FiltrHolat, type Saralash, type Ustun, type UstunFiltr } from './ustunFiltr';

/** Jadval uchun Excel uslubidagi filtr holati: natija qatorlar + har ustun tugmasi uchun props. */
export function useJadvalFiltr<R>(rows: readonly R[], ustunlar: readonly Ustun<R>[], daraxt?: Daraxt<R>) {
  const [holat, setHolat] = useState<FiltrHolat>({});
  const [saralash, setSaralash] = useState<Saralash>(null);
  const natija = useMemo(() => filtrla(rows, ustunlar, holat, saralash, daraxt), [rows, ustunlar, holat, saralash, daraxt]);
  const ozgartir = useCallback((kalit: string, f: UstunFiltr | undefined) => setHolat((h) => ({ ...h, [kalit]: f })), []);
  const tozala = useCallback(() => { setHolat({}); setSaralash(null); }, []);
  const soni = faolSoni(holat) + (saralash ? 1 : 0);
  /** Ustun sarlavhasiga qo'yiladigan tugma uchun props. */
  const tugma = useCallback((kalit: string) => ({
    rows, ustunlar, kalit, holat, saralash, barg: daraxt?.barg, saralashMumkin: !daraxt,
    onFiltr: (f: UstunFiltr | undefined) => ozgartir(kalit, f),
    onSaralash: (s: Saralash) => setSaralash(s),
  }), [rows, ustunlar, holat, saralash, daraxt, ozgartir]);
  return { natija, holat, saralash, soni, tozala, tugma };
}
