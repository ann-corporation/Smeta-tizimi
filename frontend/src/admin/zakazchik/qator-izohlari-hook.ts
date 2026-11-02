import { useCallback, useEffect, useMemo, useState } from 'react';
import { qatorIzohlariOl, type QatorIzoh } from '../../api/t2-tomon';

/** Akt bo'yicha barcha qator izohlari, manba_id (akt_qator id) bo'yicha guruhlangan. */
export function useQatorIzohlari(kompaniyaId: number, aktId: number | null | undefined, aloqaId: number | null | undefined) {
  const [izohlar, setIzohlar] = useState<QatorIzoh[]>([]);
  const [xato, setXato] = useState('');
  const yukla = useCallback(async () => {
    if (!aktId) { setIzohlar([]); return; }
    const r = await qatorIzohlariOl(kompaniyaId, aktId, aloqaId);
    if (r.ok) { setIzohlar(r.natija.izohlar ?? []); setXato(''); } else setXato(r.error);
  }, [kompaniyaId, aktId, aloqaId]);
  useEffect(() => { void yukla(); }, [yukla]);
  const qator = useMemo(() => {
    const m = new Map<number, QatorIzoh[]>();
    for (const i of izohlar) m.set(i.manba_id, [...(m.get(i.manba_id) ?? []), i]);
    return m;
  }, [izohlar]);
  const ochiqSoni = useCallback((id: number | undefined) => (id ? (qator.get(id) ?? []).filter((i) => i.holat === 'faol').length : 0), [qator]);
  return { izohlar, qator, xato, yukla, ochiqSoni };
}
