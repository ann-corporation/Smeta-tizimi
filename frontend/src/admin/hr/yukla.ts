import { useCallback, useEffect, useRef, useState } from 'react';

export type Qayta = () => Promise<void>;
export type HrYuklagich<T> = () => Promise<T | { ok: false; error: string }>;
export type YuklaNatija<T> = { data: T | null; xato: string | null; yuk: boolean; qayta: Qayta };

/** Oddiy yuklovchi: `yukla` natijasi `{ ok:false, error }` bo'lsa — xato matni; aks holda ma'lumot. */
export function useHrYukla<T>(yukla: HrYuklagich<T> | null, deps: readonly unknown[]): YuklaNatija<T> {
  const [data, setData] = useState<T | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const soni = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const qayta = useCallback(async () => {
    if (!yukla) { setData(null); setXato(null); return; }
    const n = ++soni.current;
    setYuk(true);
    const r = await yukla();
    if (n !== soni.current) return;
    if (r && typeof r === 'object' && (r as { ok?: boolean }).ok === false) { setXato((r as { error: string }).error); setData(null); }
    else { setData(r as T); setXato(null); }
    setYuk(false);
  }, deps);
  useEffect(() => { void qayta(); }, [qayta]);
  return { data, xato, yuk, qayta };
}
