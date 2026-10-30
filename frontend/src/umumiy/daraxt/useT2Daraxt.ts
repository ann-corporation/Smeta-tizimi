import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T2_DARAXT_USTUNLARI, T2_HOLAT_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import { sbT2DaraxtOl, sbT2QatorHolatOl, sbT2TreeQur, type T2Qator, type T2QatorHolat } from '../../api/supabase';
import { sbT2DaraxtQisman, sbT2QatorHolatQisman } from '../../api/t2-holat-qisman';
import { priceControlOl, type PriceControlLine } from '../../api/t2-price-control';
import { faktTaalluqliIdlar, holatlarniAlmashtir, qatorlarniYamala } from '../../lib/fakt-yangilash';
import type { TreeNode } from '../../api/types';
import { avvalgiVersiyaOl, ozgarishMalumotOl, type AvvalgiVersiya } from '../../api/t2-ozgarish';
import { ozgarishniQosh, type OzgarishMalumot } from '../../lib/lrv-ozgarish';
import { useIxtiyoriyQueryClient } from '../../api/t2-obyektlar-kesh';

/** Sahifalar orasida umumiy daraxt keshi: ochilganda darhol ko'rsatiladi, lekin DOIM fonda serverdan tekshiriladi. */
export const daraxtKaliti = (obyektId: number) => ['daraxt', obyektId] as const;
export type DaraxtKesh = {
  rows: T2Qator[]; states: T2QatorHolat[]; price: PriceControlLine[];
  avvalgi: AvvalgiVersiya | null; oz: OzgarishMalumot | null;
};
/** Qo'shimcha/zamena belgilari va avvalgi versiya: 'xato' — LRV eksporti bloklanadi (belgisiz hujjat chiqmasin). */
export type QoshimchaHolat = 'yuklanmoqda' | 'tayyor' | 'xato';

/** Bir nechta qator uchun taalluqli id lar birlashmasi; chegaradan oshsa null (to'liq o'qiladi). */
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
 *   - kutilayotgan qisman so'rovlar id lari JAMLANADI (ketma-ket ikki tahrir ham yo'qolmaydi);
 *     to'liq yuklash ketayotgan bo'lsa — u bekor qilinmaydi, qisman o'qish undan KEYIN;
 *   - qo'shimcha/zamena belgilari va avvalgi versiya daraxtdan KEYIN (bloklamasdan) qo'shiladi;
 *   - kesh (['daraxt', id]) darhol ko'rsatiladi, lekin har ochilishda fonda qayta tekshiriladi
 *     (`serverTasdiq` — shu ochilishda server bilan tasdiqlangan; eksport shunga qaraydi).
 */
export function useT2Daraxt(obyektId: number | null) {
  const qc = useIxtiyoriyQueryClient();
  const [rows, setRowsS] = useState<T2Qator[]>([]);
  const [states, setStatesS] = useState<T2QatorHolat[]>([]);
  const [price, setPriceS] = useState<PriceControlLine[]>([]);
  const [avvalgi, setAvvalgiS] = useState<AvvalgiVersiya | null>(null);
  const [qoshimchaHolat, setQoshimchaHolat] = useState<QoshimchaHolat>('yuklanmoqda');
  const [serverTasdiq, setServerTasdiq] = useState(false);
  const [loading, setLoading] = useState(false);
  const [yangilanmoqda, setYangilanmoqda] = useState(false);
  const [error, setError] = useState('');

  /** Navbatlar: to'liq yuklash, qator yamog'i, holat yamog'i, narx nazorati — har biri o'z eskirishi bilan. */
  const toliqNavbat = useRef(0);
  const qatorNavbat = useRef(0);
  const holatNavbat = useRef(0);
  const narxNavbat = useRef(0);
  /** Ketayotgan to'liq yuklash (qisman o'qishlar uni kutadi, bekor qilmaydi). */
  const toliqJarayon = useRef<Promise<boolean> | null>(null);
  /** Hali qo'llanmagan qisman so'rovlar (ildiz qator id lari). */
  const qatorKut = useRef(new Set<number>());
  const holatKut = useRef({ ids: new Set<number>(), hammasi: false });
  const ishlar = useRef(0);

  const rowsRef = useRef<T2Qator[]>([]);
  const statesRef = useRef<T2QatorHolat[]>([]);
  const priceRef = useRef<PriceControlLine[]>([]);
  const avvalgiRef = useRef<AvvalgiVersiya | null>(null);
  const ozRef = useRef<OzgarishMalumot | null>(null);

  // Ref va state birga (kesh darhol to'g'ri yozilsin).
  const setRows = (v: T2Qator[]) => { rowsRef.current = v; setRowsS(v); };
  const setStates = (v: T2QatorHolat[]) => { statesRef.current = v; setStatesS(v); };
  const setPrice = (v: PriceControlLine[]) => { priceRef.current = v; setPriceS(v); };
  const setAvvalgi = (v: AvvalgiVersiya | null) => { avvalgiRef.current = v; setAvvalgiS(v); };
  const boshla = () => { ishlar.current++; setYangilanmoqda(rowsRef.current.length > 0); };
  const tugat = () => { ishlar.current = Math.max(0, ishlar.current - 1); setYangilanmoqda(ishlar.current > 0 && rowsRef.current.length > 0); };
  const toliqniKut = async () => { while (toliqJarayon.current) await toliqJarayon.current.catch(() => false); };

  const keshgaYoz = useCallback((id: number) => {
    if (!qc || !rowsRef.current.length) return;
    const snap: DaraxtKesh = { rows: rowsRef.current, states: statesRef.current, price: priceRef.current, avvalgi: avvalgiRef.current, oz: ozRef.current };
    qc.setQueryData(daraxtKaliti(id), snap);
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

  const narxNazorati = useCallback(async (id: number) => {
    const raqam = ++narxNavbat.current;
    const p = await priceControlOl(id).catch(() => null);
    if (raqam === narxNavbat.current) { setPrice(p?.ok ? p.qatorlar : []); keshgaYoz(id); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keshgaYoz]);

  /** Qo'shimcha/zamena belgilari va avvalgi versiya — daraxt ekranda bo'lgach qo'shiladi; o'qilmasa — 'xato'. */
  const qoshimchalarniQosh = useCallback(async (id: number, toliq: number,
    p: Promise<[OzgarishMalumot | null, AvvalgiVersiya | null]>) => {
    const [oz, av] = await p;
    if (toliq !== toliqNavbat.current) return;
    if (oz == null || av == null) { setQoshimchaHolat('xato'); return; }
    ozRef.current = oz;
    setRows(ozgarishniQosh(rowsRef.current, oz));
    setAvvalgi(av.qatorlar.length ? av : null);
    setQoshimchaHolat('tayyor');
    keshgaYoz(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keshgaYoz]);
  const qoshimchalarniOl = (id: number) => Promise.all([
    ozgarishMalumotOl(id).catch(() => null), avvalgiVersiyaOl(id).catch(() => null),
  ]) as Promise<[OzgarishMalumot | null, AvvalgiVersiya | null]>;

  /** To'liq yuklash. Daraxt bor bo'lsa — jim (ekrandan olinmaydi). Yangi to'liq yuklash eskisini almashtiradi. */
  const yuklash = useCallback(async () => {
    const toliq = ++toliqNavbat.current;
    if (obyektId == null) { setRows([]); setStates([]); setPrice([]); setError(''); return; }
    const birinchi = rowsRef.current.length === 0;
    if (birinchi) setLoading(true);
    boshla();
    setError('');
    setQoshimchaHolat('yuklanmoqda');
    // Qo'shimchalar parallel boshlanadi, lekin daraxtni kutdirmaydi.
    const qoshP = qoshimchalarniOl(obyektId);
    const jarayon = (async (): Promise<boolean> => {
      try {
        const [d, h] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbT2QatorHolatOl(obyektId, T2_HOLAT_DARAXT_USTUNLARI)]);
        if (toliq !== toliqNavbat.current) return false;
        if (!d.ok || !h.ok) {
          setError(d.error || h.error || 'Kanonik daraxt o‘qilmadi.');
          if (birinchi) { setRows([]); setStates([]); }
          return false;
        }
        // Avvalgi belgilar darhol (miltillamasin); yangisi kelguncha qoshimchaHolat='yuklanmoqda' — eksport kutadi.
        setRows(ozgarishniQosh((d.qatorlar || []) as T2Qator[], ozRef.current));
        setStates((h.qatorlar || []) as T2QatorHolat[]);
        setServerTasdiq(true);
        keshgaYoz(obyektId);
        void narxNazorati(obyektId);
        return true;
      } catch {
        if (toliq === toliqNavbat.current) setError('Kanonik daraxt o‘qilmadi. Tarmoq yoki ruxsatni tekshiring.');
        return false;
      }
    })();
    toliqJarayon.current = jarayon;
    const ok = await jarayon;
    if (toliqJarayon.current === jarayon) toliqJarayon.current = null;
    if (toliq === toliqNavbat.current) setLoading(false);
    tugat();
    if (ok) await qoshimchalarniQosh(obyektId, toliq, qoshP);
    else if (toliq === toliqNavbat.current) setQoshimchaHolat('xato');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obyektId, narxNazorati, keshgaYoz, qoshimchalarniQosh]);

  /** Faqat holat jadvali (qator tuzilmasi o'zgarmagan: fakt/F2). Bir yoki bir nechta qator id; id siz — butun holat. */
  const holatniYangila = useCallback(async (qatorId?: number | readonly number[]) => {
    if (obyektId == null) return;
    const royxat = qatorId == null ? [] : typeof qatorId === 'number' ? [qatorId] : qatorId;
    const kut = holatKut.current;
    if (!royxat.length) kut.hammasi = true; else for (const id of royxat) kut.ids.add(id);
    boshla();
    try {
      await toliqniKut();
      const raqam = ++holatNavbat.current;
      const ildizlar = [...kut.ids];
      const hammasi = kut.hammasi;
      const idlar = hammasi ? null : taalluqliBirlashma(rowsRef.current, ildizlar);
      const tozala = () => { for (const id of ildizlar) kut.ids.delete(id); if (hammasi) kut.hammasi = false; };
      if (idlar) {
        const q = await sbT2QatorHolatQisman(obyektId, idlar);
        if (raqam !== holatNavbat.current) return; // yangiroq so'rov bu id larni ham qamragan
        if (q.ok) {
          setStates(holatlarniAlmashtir(statesRef.current, (q.qatorlar || []) as T2QatorHolat[]));
          tozala();
          keshgaYoz(obyektId);
          void narxNazorati(obyektId);
          return;
        }
      }
      const h = await sbT2QatorHolatOl(obyektId, T2_HOLAT_DARAXT_USTUNLARI);
      if (raqam !== holatNavbat.current) return;
      if (h.ok) { setStates((h.qatorlar || []) as T2QatorHolat[]); tozala(); keshgaYoz(obyektId); }
      else setError(h.error || 'Holat yangilanmadi — sahifani yangilang.');
      void narxNazorati(obyektId);
    } catch {
      setError('Holat yangilanmadi — sahifani yangilang.');
    } finally {
      tugat();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obyektId, narxNazorati, keshgaYoz]);

  /**
   * Qator tahriridan keyin (nom/hajm/narx/birlik/kat): butun smeta (~16 MB) EMAS — faqat shu qator,
   * ota-bobolari (bazadagi t2_rollup yig'indilari) va bolalari (norma kaskadi) `t2_daraxt` + holatdan
   * qayta o'qiladi. RZ/BL jamilari klientda sbT2TreeQur bilan qayta yig'iladi. Biror qator topilmasa
   * yoki o'qish to'liq bo'lmasa — to'liq yuklash. Ketma-ket tahrirlar id lari jamlanadi.
   */
  const qatorniYangila = useCallback(async (qatorId: number) => {
    if (obyektId == null) return;
    qatorKut.current.add(qatorId);
    boshla();
    /** true — qisman yo'l yaramadi, to'liq yuklash kerak. */
    const ish = async (): Promise<boolean> => {
      await toliqniKut();
      const raqam = ++qatorNavbat.current;
      const ildizlar = [...qatorKut.current];
      const tozala = () => { for (const id of ildizlar) qatorKut.current.delete(id); };
      const idlar = taalluqliBirlashma(rowsRef.current, ildizlar);
      if (!idlar) { tozala(); return true; }
      const [d, h] = await Promise.all([sbT2DaraxtQisman(obyektId, idlar), sbT2QatorHolatQisman(obyektId, idlar)]);
      if (raqam !== qatorNavbat.current) return false; // yangiroq so'rov bu id larni ham qamragan
      const dq = (d.qatorlar || []) as T2Qator[];
      tozala();
      if (!d.ok || !h.ok || d.toliq === false || h.toliq === false || dq.length !== idlar.length) return true;
      setRows(qatorlarniYamala(rowsRef.current, dq));
      setStates(holatlarniAlmashtir(statesRef.current, (h.qatorlar || []) as T2QatorHolat[]));
      keshgaYoz(obyektId);
      void narxNazorati(obyektId);
      return false;
    };
    let toliqKerak: boolean;
    try { toliqKerak = await ish(); } catch { qatorKut.current.clear(); toliqKerak = true; } finally { tugat(); }
    if (toliqKerak) await yuklash();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obyektId, narxNazorati, keshgaYoz, yuklash]);

  // Obyekt almashsa — eski so'rovlar eskiradi. Keshda bo'lsa darhol ko'rsatiladi; har holda serverdan qayta tekshiriladi.
  useEffect(() => {
    qatorNavbat.current++; holatNavbat.current++; narxNavbat.current++;
    qatorKut.current.clear(); holatKut.current = { ids: new Set(), hammasi: false };
    toliqJarayon.current = null;
    setServerTasdiq(false); setError('');
    const kesh = qc && obyektId != null ? qc.getQueryData<DaraxtKesh>(daraxtKaliti(obyektId)) : undefined;
    if (kesh && kesh.rows.length) {
      ozRef.current = kesh.oz;
      setRows(kesh.rows); setStates(kesh.states); setPrice(kesh.price); setAvvalgi(kesh.avvalgi);
      setLoading(false);
    } else {
      rowsRef.current = []; ozRef.current = null;
      setRows([]); setStates([]); setPrice([]); setAvvalgi(null);
    }
    void yuklash();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yuklash]);

  return {
    rows, states, tree, price, loading, yangilanmoqda, error, yuklash, holatniYangila, qatorniYangila, avvalgi, avvalgiTree,
    qoshimchaHolat, qoshimchaTayyor: qoshimchaHolat === 'tayyor', serverTasdiq,
  };
}
