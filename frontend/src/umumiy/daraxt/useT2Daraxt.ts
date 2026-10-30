import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { T2_DARAXT_USTUNLARI, T2_HOLAT_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import { sbT2DaraxtOl, sbT2QatorHolatOl, sbT2TreeQur, type T2Qator, type T2QatorHolat } from '../../api/supabase';
import { sbT2DaraxtQisman, sbT2QatorHolatQisman } from '../../api/t2-holat-qisman';
import { priceControlOl, type PriceControlLine } from '../../api/t2-price-control';
import { faktTaalluqliIdlar, holatlarniAlmashtir, qatorlarniYamala } from '../../lib/fakt-yangilash';
import type { TreeNode } from '../../api/types';
import { avvalgiVersiyaOl, ozgarishMalumotOl, type AvvalgiVersiya } from '../../api/t2-ozgarish';
import { ozgarishniQosh, type OzgarishMalumot } from '../../lib/lrv-ozgarish';
import { useIxtiyoriyQueryClient } from '../../api/t2-obyektlar-kesh';

/** Sahifalar orasida umumiy daraxt keshi (Holat → Fakt → qaytish qayta o'qimaydi). */
export const DARAXT_STALE_MS = 60_000;
export const daraxtKaliti = (obyektId: number) => ['daraxt', obyektId] as const;
export type DaraxtKesh = {
  rows: T2Qator[]; states: T2QatorHolat[]; price: PriceControlLine[];
  avvalgi: AvvalgiVersiya | null; oz: OzgarishMalumot | null; qoshimchaTayyor: boolean;
};
/** Boshqa sahifa daraxtni o'zgartirsa (import va h.k.) — keyingi ochilishda qayta o'qiladi. */
export function daraxtKeshiniEskirt(qc: QueryClient | null | undefined, obyektId?: number) {
  void qc?.invalidateQueries({ queryKey: obyektId == null ? ['daraxt'] : daraxtKaliti(obyektId), refetchType: 'none' });
}

/** Bir nechta qator uchun taalluqli id lar birlashmasi; chegaradan oshsa null (to'liq holat o'qiladi). */
function taalluqliBirlashma(rows: ReadonlyArray<Pick<T2Qator, 'id' | 'ota_id'>>, qatorIdlar: readonly number[], chegara = 500): number[] | null {
  if (!qatorIdlar.length) return null;
  const s = new Set<number>();
  for (const id of qatorIdlar) {
    const x = faktTaalluqliIdlar(rows, id, chegara);
    if (!x) return null;
    for (const i of x) s.add(i);
    if (s.size > chegara) return null;
  }
  return [...s];
}

/**
 * LRV (HolatNative) va Fakt (FaktNative) sahifalarining yagona ma'lumot liniyasi.
 *
 * Egasi (2026-09-23): "27000 qatorli smetada sahifada qotishlar". O'lchov
 * (Navoiy STR, 25 037 qator): hisob-kitob kichik (daraxt 31 ms), lekin har
 * fakt saqlanganda butun obyekt (~16 MB) qayta o'qilar va daraxt ekrandan
 * olib tashlanardi — ochilgan shoxlar va skroll yo'qolardi. Endi:
 *   - skeleton faqat birinchi yuklashda; keyingi yangilanishlar jim, daraxt joyida;
 *   - fakt saqlanganda faqat o'zgargan qatorlar holati o'qiladi;
 *   - qator tahriridan keyin faqat o'sha qator, ota-bobolari va bolalari qayta o'qiladi;
 *   - qo'shimcha/zamena belgilari va avvalgi versiya daraxtdan KEYIN (bloklamasdan) qo'shiladi;
 *   - ma'lumot react-query keshida (['daraxt', id]) — sahifa almashganda qayta o'qilmaydi;
 *   - eskirgan javob (obyekt almashgan yoki yangiroq so'rov bor) tashlanadi.
 */
export function useT2Daraxt(obyektId: number | null) {
  const qc = useIxtiyoriyQueryClient();
  const [rows, setRowsS] = useState<T2Qator[]>([]);
  const [states, setStatesS] = useState<T2QatorHolat[]>([]);
  const [price, setPriceS] = useState<PriceControlLine[]>([]);
  const [avvalgi, setAvvalgiS] = useState<AvvalgiVersiya | null>(null);
  const [qoshimchaTayyor, setQoshimchaTayyorS] = useState(false);
  const [loading, setLoading] = useState(false);
  const [yangilanmoqda, setYangilanmoqda] = useState(false);
  const [error, setError] = useState('');
  const navbat = useRef(0);
  /** Faqat to'liq yuklash/obyekt almashishi — ixtiyoriy qo'shimchalar shu bilan tekshiriladi. */
  const toliqNavbat = useRef(0);
  const rowsRef = useRef<T2Qator[]>([]);
  const statesRef = useRef<T2QatorHolat[]>([]);
  const priceRef = useRef<PriceControlLine[]>([]);
  const avvalgiRef = useRef<AvvalgiVersiya | null>(null);
  const ozRef = useRef<OzgarishMalumot | null>(null);
  const qoshTayyorRef = useRef(false);
  /** Kesh yozuvining server o'qilgan vaqti (to'liq yuklash). Yamoqlar uni yangilamaydi. */
  const keshVaqt = useRef(0);

  // Ref va state birga (funksional setState o'rniga — kesh darhol to'g'ri yozilsin).
  const setRows = (v: T2Qator[]) => { rowsRef.current = v; setRowsS(v); };
  const setStates = (v: T2QatorHolat[]) => { statesRef.current = v; setStatesS(v); };
  const setPrice = (v: PriceControlLine[]) => { priceRef.current = v; setPriceS(v); };
  const setAvvalgi = (v: AvvalgiVersiya | null) => { avvalgiRef.current = v; setAvvalgiS(v); };
  const setQoshimchaTayyor = (v: boolean) => { qoshTayyorRef.current = v; setQoshimchaTayyorS(v); };

  const keshgaYoz = useCallback((id: number) => {
    if (!qc || !rowsRef.current.length) return;
    const snap: DaraxtKesh = { rows: rowsRef.current, states: statesRef.current, price: priceRef.current,
      avvalgi: avvalgiRef.current, oz: ozRef.current, qoshimchaTayyor: qoshTayyorRef.current };
    qc.setQueryData(daraxtKaliti(id), snap, { updatedAt: keshVaqt.current || Date.now() });
  }, [qc]);

  const tree: TreeNode[] = useMemo(() => (rows.length ? sbT2TreeQur(rows, states) : []), [rows, states]);
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
    if (raqam === navbat.current) { setPrice(p?.ok ? p.qatorlar : []); keshgaYoz(id); }
  }, [keshgaYoz]);

  /** Qo'shimcha/zamena belgilari va avvalgi versiya — ixtiyoriy, daraxt ekranda bo'lgach qo'shiladi. */
  const qoshimchalarniQosh = useCallback(async (id: number, toliq: number,
    p: Promise<[OzgarishMalumot | null, AvvalgiVersiya | null]>) => {
    const [oz, av] = await p;
    if (toliq !== toliqNavbat.current) return;
    ozRef.current = oz;
    setRows(ozgarishniQosh(rowsRef.current, oz));
    setAvvalgi(av && av.qatorlar.length ? av : null);
    setQoshimchaTayyor(true);
    keshgaYoz(id);
  }, [keshgaYoz]);
  const qoshimchalarniOl = (id: number) => Promise.all([
    ozgarishMalumotOl(id).catch(() => null), avvalgiVersiyaOl(id).catch(() => null),
  ]) as Promise<[OzgarishMalumot | null, AvvalgiVersiya | null]>;

  /** To'liq yuklash. Daraxt bor bo'lsa — jim (ekrandan olinmaydi). */
  const yuklash = useCallback(async () => {
    const raqam = ++navbat.current;
    const toliq = ++toliqNavbat.current;
    if (obyektId == null) { setRows([]); setStates([]); setPrice([]); setError(''); return; }
    const birinchi = rowsRef.current.length === 0;
    if (birinchi) setLoading(true); else setYangilanmoqda(true);
    setError('');
    // Qo'shimchalar parallel boshlanadi, lekin daraxtni kutdirmaydi (xato bo'lsa belgilarsiz).
    const qoshP = qoshimchalarniOl(obyektId);
    let daraxtOk = false;
    try {
      const [d, h] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbT2QatorHolatOl(obyektId, T2_HOLAT_DARAXT_USTUNLARI)]);
      if (raqam !== navbat.current) return;
      if (!d.ok || !h.ok) {
        setError(d.error || h.error || 'Kanonik daraxt o‘qilmadi.');
        if (birinchi) { setRows([]); setStates([]); }
        return;
      }
      // Avvalgi belgilar darhol qo'yiladi (jim yangilashda miltillamasin), yangisi kelganda almashtiriladi.
      setRows(ozgarishniQosh((d.qatorlar || []) as T2Qator[], ozRef.current));
      setStates((h.qatorlar || []) as T2QatorHolat[]);
      keshVaqt.current = Date.now();
      keshgaYoz(obyektId);
      setLoading(false); setYangilanmoqda(false);
      daraxtOk = true;
      void narxNazorati(obyektId, raqam);
    } catch {
      if (raqam === navbat.current) setError('Kanonik daraxt o‘qilmadi. Tarmoq yoki ruxsatni tekshiring.');
    } finally {
      if (raqam === navbat.current) { setLoading(false); setYangilanmoqda(false); }
    }
    if (daraxtOk) await qoshimchalarniQosh(obyektId, toliq, qoshP);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obyektId, narxNazorati, keshgaYoz, qoshimchalarniQosh]);

  /** Faqat holat jadvali (qator tuzilmasi o'zgarmagan: fakt/F2). Bir yoki bir nechta qator id. */
  const holatniYangila = useCallback(async (qatorId?: number | readonly number[]) => {
    if (obyektId == null) return;
    const raqam = ++navbat.current;
    setYangilanmoqda(true);
    try {
      const royxat = qatorId == null ? [] : typeof qatorId === 'number' ? [qatorId] : qatorId;
      const idlar = royxat.length ? taalluqliBirlashma(rowsRef.current, royxat) : null;
      if (idlar) {
        const q = await sbT2QatorHolatQisman(obyektId, idlar);
        if (raqam !== navbat.current) return;
        if (q.ok) {
          setStates(holatlarniAlmashtir(statesRef.current, (q.qatorlar || []) as T2QatorHolat[]));
          keshgaYoz(obyektId);
          void narxNazorati(obyektId, raqam);
          return;
        }
      }
      const h = await sbT2QatorHolatOl(obyektId, T2_HOLAT_DARAXT_USTUNLARI);
      if (raqam !== navbat.current) return;
      if (h.ok) { setStates((h.qatorlar || []) as T2QatorHolat[]); keshgaYoz(obyektId); }
      else setError(h.error || 'Holat yangilanmadi — sahifani yangilang.');
      void narxNazorati(obyektId, raqam);
    } catch {
      if (raqam === navbat.current) setError('Holat yangilanmadi — sahifani yangilang.');
    } finally {
      if (raqam === navbat.current) setYangilanmoqda(false);
    }
  }, [obyektId, narxNazorati, keshgaYoz]);

  /**
   * Qator tahriridan keyin (nom/hajm/narx/birlik/kat): butun smeta (~16 MB) EMAS — faqat shu qator,
   * ota-bobolari (bazadagi t2_rollup yig'indilari) va bolalari (norma kaskadi) `t2_daraxt` + holatdan
   * qayta o'qiladi. RZ/BL jamilari klientda sbT2TreeQur bilan qayta yig'iladi. Biror qator topilmasa
   * yoki o'qish to'liq bo'lmasa — to'liq yuklash.
   */
  const qatorniYangila = useCallback(async (qatorId: number) => {
    if (obyektId == null) return;
    const idlar = faktTaalluqliIdlar(rowsRef.current, qatorId);
    if (!idlar) return yuklash();
    const raqam = ++navbat.current;
    setYangilanmoqda(true);
    let toliqKerak = false;
    try {
      const [d, h] = await Promise.all([sbT2DaraxtQisman(obyektId, idlar), sbT2QatorHolatQisman(obyektId, idlar)]);
      if (raqam !== navbat.current) return;
      const dq = (d.qatorlar || []) as T2Qator[];
      if (!d.ok || !h.ok || d.toliq === false || h.toliq === false || dq.length !== idlar.length) toliqKerak = true;
      else {
        setRows(qatorlarniYamala(rowsRef.current, dq));
        setStates(holatlarniAlmashtir(statesRef.current, (h.qatorlar || []) as T2QatorHolat[]));
        keshgaYoz(obyektId);
        void narxNazorati(obyektId, raqam);
      }
    } catch {
      if (raqam === navbat.current) toliqKerak = true;
    } finally {
      if (raqam === navbat.current && !toliqKerak) setYangilanmoqda(false);
    }
    if (toliqKerak) await yuklash();
  }, [obyektId, narxNazorati, keshgaYoz, yuklash]);

  // Obyekt almashsa — eski daraxt boshqa obyektniki, darhol tozalanadi. Keshda bo'lsa — darhol ko'rsatiladi.
  useEffect(() => {
    const kesh = qc && obyektId != null ? qc.getQueryData<DaraxtKesh>(daraxtKaliti(obyektId)) : undefined;
    if (kesh && obyektId != null && kesh.rows.length) {
      const st = qc!.getQueryState(daraxtKaliti(obyektId));
      ++navbat.current; const toliq = ++toliqNavbat.current;
      keshVaqt.current = st?.dataUpdatedAt ?? 0;
      ozRef.current = kesh.oz;
      setRows(kesh.rows); setStates(kesh.states); setPrice(kesh.price); setAvvalgi(kesh.avvalgi);
      setQoshimchaTayyor(kesh.qoshimchaTayyor); setError(''); setLoading(false); setYangilanmoqda(false);
      const yangi = st != null && !st.isInvalidated && Date.now() - st.dataUpdatedAt < DARAXT_STALE_MS;
      if (!yangi) void yuklash();
      else if (!kesh.qoshimchaTayyor) void qoshimchalarniQosh(obyektId, toliq, qoshimchalarniOl(obyektId));
      return;
    }
    rowsRef.current = []; ozRef.current = null; keshVaqt.current = 0;
    setRows([]); setStates([]); setPrice([]); setAvvalgi(null); setQoshimchaTayyor(false);
    void yuklash();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yuklash]);

  return { rows, states, tree, price, loading, yangilanmoqda, error, yuklash, holatniYangila, qatorniYangila, avvalgi, avvalgiTree, qoshimchaTayyor };
}
