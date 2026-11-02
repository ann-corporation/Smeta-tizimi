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

  /** Davr (epoch): obyekt almashganda oshadi — eski obyekt amallari yangi obyekt ko'rinishiga/keshiga yozmaydi. */
  const davr = useRef(0);
  const joriyObyekt = useRef<number | null>(obyektId);
  const tirik = (e: number, id: number) => e === davr.current && id === joriyObyekt.current;
  /** To'liq yuklash va narx nazorati navbatlari. */
  const toliqNavbat = useRef(0);
  const narxNavbat = useRef(0);
  /** Ketayotgan to'liq yuklash (qisman o'qishlar uni kutadi, bekor qilmaydi). */
  const toliqJarayon = useRef<Promise<boolean> | null>(null);
  /** Hali o'qilmagan qisman so'rovlar (ildiz qator id lari) va ularni KETMA-KET bajaruvchi yagona ishchi. */
  const qatorKut = useRef(new Set<number>());
  const holatKut = useRef({ ids: new Set<number>(), hammasi: false });
  const ishchi = useRef<Promise<void> | null>(null);
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

  /** Kesh faqat SHU obyekt va SHU davr ma'lumoti bilan yoziladi (boshqa obyekt qatorlari begona kalitga tushmasin). */
  const keshgaYoz = useCallback((id: number, e: number) => {
    if (!qc || !rowsRef.current.length || !tirik(e, id)) return;
    const snap: DaraxtKesh = { rows: rowsRef.current, states: statesRef.current, price: priceRef.current, avvalgi: avvalgiRef.current, oz: ozRef.current };
    qc.setQueryData(daraxtKaliti(id), snap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const narxNazorati = useCallback(async (id: number, e: number) => {
    const raqam = ++narxNavbat.current;
    const p = await priceControlOl(id).catch(() => null);
    if (raqam === narxNavbat.current && tirik(e, id)) { setPrice(p?.ok ? p.qatorlar : []); keshgaYoz(id, e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keshgaYoz]);

  /** Qo'shimcha/zamena belgilari va avvalgi versiya — daraxt ekranda bo'lgach qo'shiladi; o'qilmasa — 'xato'. */
  const qoshimchalarniQosh = useCallback(async (id: number, toliq: number, e: number,
    p: Promise<[OzgarishMalumot | null, AvvalgiVersiya | null]>) => {
    const [oz, av] = await p;
    if (toliq !== toliqNavbat.current || !tirik(e, id)) return;
    if (oz == null || av == null) { setQoshimchaHolat('xato'); return; }
    ozRef.current = oz;
    setRows(ozgarishniQosh(rowsRef.current, oz));
    setAvvalgi(av.qatorlar.length ? av : null);
    setQoshimchaHolat('tayyor');
    keshgaYoz(id, e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keshgaYoz]);
  const qoshimchalarniOl = (id: number) => Promise.all([
    ozgarishMalumotOl(id).catch(() => null), avvalgiVersiyaOl(id).catch(() => null),
  ]) as Promise<[OzgarishMalumot | null, AvvalgiVersiya | null]>;

  /** To'liq yuklash. Daraxt bor bo'lsa — jim (ekrandan olinmaydi). Yangi to'liq yuklash eskisini almashtiradi. */
  const yuklash = useCallback(async () => {
    if (obyektId == null) { ++toliqNavbat.current; setRows([]); setStates([]); setPrice([]); setError(''); return; }
    // Eski obyekt yopilmasidan chaqirilgan (masalan qisman yo'ldan) — yangi obyektni bosib ketmaydi.
    if (obyektId !== joriyObyekt.current) return;
    const e = davr.current;
    const toliq = ++toliqNavbat.current;
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
        if (toliq !== toliqNavbat.current || !tirik(e, obyektId)) return false;
        if (!d.ok || !h.ok) {
          setError(d.error || h.error || 'Kanonik daraxt o‘qilmadi.');
          if (birinchi) { setRows([]); setStates([]); }
          return false;
        }
        // Avvalgi belgilar darhol (miltillamasin); yangisi kelguncha qoshimchaHolat='yuklanmoqda' — eksport kutadi.
        setRows(ozgarishniQosh((d.qatorlar || []) as T2Qator[], ozRef.current));
        setStates((h.qatorlar || []) as T2QatorHolat[]);
        setServerTasdiq(true);
        keshgaYoz(obyektId, e);
        void narxNazorati(obyektId, e);
        return true;
      } catch {
        if (toliq === toliqNavbat.current && tirik(e, obyektId)) setError('Kanonik daraxt o‘qilmadi. Tarmoq yoki ruxsatni tekshiring.');
        return false;
      }
    })();
    toliqJarayon.current = jarayon;
    const ok = await jarayon;
    if (toliqJarayon.current === jarayon) toliqJarayon.current = null;
    const joriy = toliq === toliqNavbat.current && tirik(e, obyektId);
    if (joriy) setLoading(false);
    tugat();
    if (ok) await qoshimchalarniQosh(obyektId, toliq, e, qoshP);
    else if (joriy) setQoshimchaHolat('xato');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obyektId, narxNazorati, keshgaYoz, qoshimchalarniQosh]);

  /**
   * Qisman yangilashlar uchun YAGONA ketma-ket ishchi: har aylanishda kutilayotgan barcha qator (tahrir) va holat
   * (fakt) id lari bitta o'qishda olinadi — holat o'qishi ham qator yamog'ining id larini qamraydi, shuning uchun
   * eski holat javobi yangi qator yamog'ini bosib keta olmaydi. To'liq yuklash ketayotgan bo'lsa — undan keyin.
   * Obyekt almashsa (davr) — ishchi to'xtaydi, hech narsa yozmaydi.
   */
  const ishchiniBoshla = useCallback((): Promise<void> => {
    if (ishchi.current) return ishchi.current;
    if (obyektId == null || obyektId !== joriyObyekt.current) return Promise.resolve();
    const id = obyektId;
    const e = davr.current;
    const qolgan = () => qatorKut.current.size > 0 || holatKut.current.ids.size > 0 || holatKut.current.hammasi;
    boshla();
    // eslint-disable-next-line prefer-const
    let p: Promise<void> | null = null;
    p = (async () => {
      try {
        while (tirik(e, id) && qolgan()) {
          await toliqniKut();
          if (!tirik(e, id)) return;
          const qIldiz = [...qatorKut.current]; qatorKut.current.clear();
          const hk = holatKut.current; holatKut.current = { ids: new Set(), hammasi: false };
          const qIdlar = qIldiz.length ? taalluqliBirlashma(rowsRef.current, qIldiz) : [];
          if (qIdlar == null) { await yuklash(); continue; } // tuzilma kutilmagan — to'liq (u holatni ham o'qiydi)
          const hIdlar = hk.hammasi ? null : taalluqliBirlashma(rowsRef.current, [...qIldiz, ...hk.ids]);
          let toliqKerak = false;
          try {
            const [d, h] = await Promise.all([
              qIdlar.length ? sbT2DaraxtQisman(id, qIdlar) : Promise.resolve(null),
              hIdlar ? sbT2QatorHolatQisman(id, hIdlar) : sbT2QatorHolatOl(id, T2_HOLAT_DARAXT_USTUNLARI),
            ]);
            if (!tirik(e, id)) return;
            const dq = (d?.qatorlar || []) as T2Qator[];
            if (d && (!d.ok || d.toliq === false || dq.length !== qIdlar.length)) toliqKerak = true;
            else {
              let hOk = h.ok && h.toliq !== false;
              let holatlar = (h.qatorlar || []) as T2QatorHolat[];
              let toliqHolat = !hIdlar;
              if (!hOk && hIdlar) { // qisman holat o'qilmadi — butun holat jadvali
                const hh = await sbT2QatorHolatOl(id, T2_HOLAT_DARAXT_USTUNLARI);
                if (!tirik(e, id)) return;
                hOk = hh.ok; holatlar = (hh.qatorlar || []) as T2QatorHolat[]; toliqHolat = true;
              }
              if (d) setRows(qatorlarniYamala(rowsRef.current, dq));
              if (hOk) setStates(toliqHolat ? holatlar : holatlarniAlmashtir(statesRef.current, holatlar));
              else if (d) toliqKerak = true; // qator yamalgan, holati o'qilmadi — mos kelmasin
              else setError(h.error || 'Holat yangilanmadi — sahifani yangilang.');
              keshgaYoz(id, e);
              void narxNazorati(id, e);
            }
          } catch {
            if (!tirik(e, id)) return;
            if (qIdlar.length) toliqKerak = true; else setError('Holat yangilanmadi — sahifani yangilang.');
          }
          if (toliqKerak && tirik(e, id)) await yuklash();
        }
      } finally {
        if (ishchi.current === p) ishchi.current = null;
        tugat();
      }
    })();
    ishchi.current = p;
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obyektId, narxNazorati, keshgaYoz, yuklash]);

  /** Faqat holat jadvali (qator tuzilmasi o'zgarmagan: fakt/F2). Bir yoki bir nechta qator id; id siz — butun holat. */
  const holatniYangila = useCallback(async (qatorId?: number | readonly number[]) => {
    if (obyektId == null || obyektId !== joriyObyekt.current) return;
    const royxat = qatorId == null ? [] : typeof qatorId === 'number' ? [qatorId] : qatorId;
    if (!royxat.length) holatKut.current.hammasi = true; else for (const id of royxat) holatKut.current.ids.add(id);
    await ishchiniBoshla();
    // Ishchi bu so'rovni olishdan oldin ishlayotgan aylanishda bo'lgan bo'lsa — keyingi aylanish ham tugashini kutamiz.
    if (ishchi.current) await ishchi.current;
  }, [obyektId, ishchiniBoshla]);

  /**
   * Qator tahriridan keyin (nom/hajm/narx/birlik/kat): butun smeta (~16 MB) EMAS — faqat shu qator,
   * ota-bobolari (bazadagi t2_rollup yig'indilari) va bolalari (norma kaskadi) `t2_daraxt` + holatdan
   * qayta o'qiladi. RZ/BL jamilari klientda sbT2TreeQur bilan qayta yig'iladi. Biror qator topilmasa
   * yoki o'qish to'liq bo'lmasa — to'liq yuklash. Ketma-ket tahrirlar yo'qolmaydi (navbatda jamlanadi).
   */
  const qatorniYangila = useCallback(async (qatorId: number) => {
    if (obyektId == null || obyektId !== joriyObyekt.current) return;
    qatorKut.current.add(qatorId);
    await ishchiniBoshla();
    if (ishchi.current) await ishchi.current;
  }, [obyektId, ishchiniBoshla]);

  // Obyekt almashsa — yangi davr: eski so'rovlar hech narsa yozmaydi. Keshda bo'lsa darhol ko'rsatiladi; har holda serverdan.
  useEffect(() => {
    davr.current++; joriyObyekt.current = obyektId; narxNavbat.current++;
    qatorKut.current.clear(); holatKut.current = { ids: new Set(), hammasi: false };
    toliqJarayon.current = null; ishchi.current = null;
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
