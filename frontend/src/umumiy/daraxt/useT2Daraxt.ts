import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T2_DARAXT_USTUNLARI, T2_HOLAT_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import { sbT2DaraxtOl, sbT2QatorHolatOl, sbT2TreeQur, type T2Qator, type T2QatorHolat } from '../../api/supabase';
import { sbT2QatorHolatQisman } from '../../api/t2-holat-qisman';
import { priceControlOl, type PriceControlLine } from '../../api/t2-price-control';
import { faktTaalluqliIdlar, holatlarniAlmashtir } from '../../lib/fakt-yangilash';
import type { TreeNode } from '../../api/types';
import { avvalgiVersiyaOl, ozgarishMalumotOl, type AvvalgiVersiya } from '../../api/t2-ozgarish';
import { ozgarishniQosh } from '../../lib/lrv-ozgarish';

/**
 * LRV (HolatNative) va Fakt (FaktNative) sahifalarining yagona ma'lumot liniyasi.
 *
 * Egasi (2026-09-23): "27000 qatorli smetada sahifada qotishlar". O'lchov
 * (Navoiy STR, 25 037 qator): hisob-kitob kichik (daraxt 31 ms), lekin har
 * fakt saqlanganda butun obyekt (~16 MB) qayta o'qilar va daraxt ekrandan
 * olib tashlanardi — ochilgan shoxlar va skroll yo'qolardi. Endi:
 *   - skeleton faqat birinchi yuklashda; keyingi yangilanishlar jim, daraxt joyida;
 *   - fakt saqlanganda faqat o'zgargan qatorlar holati o'qiladi;
 *   - eskirgan javob (obyekt almashgan yoki yangiroq so'rov bor) tashlanadi.
 */
export function useT2Daraxt(obyektId: number | null) {
  const [rows, setRows] = useState<T2Qator[]>([]);
  const [states, setStates] = useState<T2QatorHolat[]>([]);
  const [price, setPrice] = useState<PriceControlLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [yangilanmoqda, setYangilanmoqda] = useState(false);
  const [error, setError] = useState('');
  const navbat = useRef(0);
  const rowsRef = useRef<T2Qator[]>([]);
  rowsRef.current = rows;

  const tree: TreeNode[] = useMemo(() => (rows.length ? sbT2TreeQur(rows, states) : []), [rows, states]);
  const [avvalgi, setAvvalgi] = useState<AvvalgiVersiya | null>(null);
  /** Avvalgi versiya daraxti (kulrang, faqat ko'rish): holatsiz — fakt/F2 faol versiyada. */
  const avvalgiTree: TreeNode[] = useMemo(() => {
    if (!avvalgi) return [];
    const nomi = new Map(avvalgi.qatorlar.map((q) => [q.id, avvalgi.versiyaNomi.get(q.almashtirgan_versiya_id ?? -1) ?? ''] as const));
    const belgila = (nodes: TreeNode[]) => { for (const n of nodes) { n.avvalgiVersiya = nomi.get(n.id ?? -1) ?? ''; n.versiya = undefined; if (n.children?.length) belgila(n.children); } };
    const t = sbT2TreeQur(avvalgi.qatorlar);
    belgila(t);
    return t;
  }, [avvalgi]);

  const narxNazorati = useCallback(async (id: number, raqam: number) => {
    const p = await priceControlOl(id).catch(() => null);
    if (raqam === navbat.current) setPrice(p?.ok ? p.qatorlar : []);
  }, []);

  /** To'liq yuklash. Daraxt bor bo'lsa — jim (ekrandan olinmaydi). */
  const yuklash = useCallback(async () => {
    const raqam = ++navbat.current;
    if (obyektId == null) { setRows([]); setStates([]); setPrice([]); setError(''); return; }
    const birinchi = rowsRef.current.length === 0;
    if (birinchi) setLoading(true); else setYangilanmoqda(true);
    setError('');
    try {
      // Qo'shimcha/zamena belgilari (change_type, replaces_line_id) — ixtiyoriy: o'qilmasa daraxt belgilarsiz chiqadi.
      // Avvalgi (almashtirilgan) versiya qatorlari — alohida (t2_daraxt faqat faol qatorlarni beradi).
      const [d, h, oz, av] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbT2QatorHolatOl(obyektId, T2_HOLAT_DARAXT_USTUNLARI),
        ozgarishMalumotOl(obyektId).catch(() => null), avvalgiVersiyaOl(obyektId).catch(() => null)]);
      if (raqam !== navbat.current) return;
      if (!d.ok || !h.ok) {
        setError(d.error || h.error || 'Kanonik daraxt o‘qilmadi.');
        if (birinchi) { setRows([]); setStates([]); }
        return;
      }
      setRows(ozgarishniQosh((d.qatorlar || []) as T2Qator[], oz));
      setAvvalgi(av && av.qatorlar.length ? av : null);
      setStates((h.qatorlar || []) as T2QatorHolat[]);
      void narxNazorati(obyektId, raqam);
    } catch {
      if (raqam === navbat.current) setError('Kanonik daraxt o‘qilmadi. Tarmoq yoki ruxsatni tekshiring.');
    } finally {
      if (raqam === navbat.current) { setLoading(false); setYangilanmoqda(false); }
    }
  }, [obyektId, narxNazorati]);

  /** Faqat holat jadvali (qator tuzilmasi o'zgarmagan: fakt/F2). */
  const holatniYangila = useCallback(async (qatorId?: number) => {
    if (obyektId == null) return;
    const raqam = ++navbat.current;
    setYangilanmoqda(true);
    try {
      const idlar = qatorId == null ? null : faktTaalluqliIdlar(rowsRef.current, qatorId);
      if (idlar) {
        const q = await sbT2QatorHolatQisman(obyektId, idlar);
        if (raqam !== navbat.current) return;
        if (q.ok) {
          setStates((eski) => holatlarniAlmashtir(eski, (q.qatorlar || []) as T2QatorHolat[]));
          void narxNazorati(obyektId, raqam);
          return;
        }
      }
      const h = await sbT2QatorHolatOl(obyektId, T2_HOLAT_DARAXT_USTUNLARI);
      if (raqam !== navbat.current) return;
      if (h.ok) setStates((h.qatorlar || []) as T2QatorHolat[]);
      else setError(h.error || 'Holat yangilanmadi — sahifani yangilang.');
      void narxNazorati(obyektId, raqam);
    } catch {
      if (raqam === navbat.current) setError('Holat yangilanmadi — sahifani yangilang.');
    } finally {
      if (raqam === navbat.current) setYangilanmoqda(false);
    }
  }, [obyektId, narxNazorati]);

  // Obyekt almashsa — eski daraxt boshqa obyektniki, darhol tozalanadi.
  useEffect(() => {
    rowsRef.current = [];
    setRows([]); setStates([]); setPrice([]); setAvvalgi(null);
    void yuklash();
  }, [yuklash]);

  return { rows, states, tree, price, loading, yangilanmoqda, error, yuklash, holatniYangila, avvalgi, avvalgiTree };
}
