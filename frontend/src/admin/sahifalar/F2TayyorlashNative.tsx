import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { TayyorlanganF2lar } from './TayyorlanganF2lar';
import { F2AiYordamchi } from './F2AiYordamchi';
import { tkmBirlikmi, tkmTaklif } from '../../lib/f2-moslash-v3/tkm';
import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { isCompleteMoney, reportMoneyValidity } from '../../lib/money-input';
import { t, tilLocale } from '../../i18n/til';
import type { KeyboardEvent } from 'react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Eye, Save, Search, Sparkles, Zap } from 'lucide-react';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { sbOqi, sbT2AktYaratV2, sbT2F2QoralamaYangila, sbT2DaraxtOl, sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt, type T2Qator } from '../../api/supabase';
import { T2_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import { sbQatorHolatOl, sbF2QoralamaHajmlar, type QatorHolat } from '../../api/t2-fakt';
import { f2Hujjat } from '../../lib/f2-hujjat';
import { useObyektF2Aktlari } from './F2DublikatPanel';
import { bloklarmi, dublikatTekshiruv, pereraschetBelgisi } from '../../lib/f2-dublikat/tekshiruv';
import { shifrKorinish } from '../../lib/f2-resurs-guruh';
import { F2ResursVedomosti } from './F2ResursVedomosti';
import { mazmunXeshi, tokenBilan } from '../../api/t2-token';
import { f2HujjatKaliti } from '../../api/f2-hujjat-kontekst';
import { shartnomaLiniyaOl } from '../../api/t2-shartnoma-liniya';
import { imzoNomlariTomonlardan } from '../../lib/shartnoma-liniya';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { NDS_SUKUT_FOIZ } from '../../lib/nakopitelniy-vedomost-export';
import { qidiruvTayyorla } from '../../lib/qidiruv-normalizatsiya';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { obyektPodvali } from '../../api/t2-nakrutka-podval';
import { sbAosrCoverageOl, type AosrCoverage } from '../../api/t2-aosr';
import { aosrIshora, AOSR_ISHORA_MATNI, type AosrIshora } from '../../lib/nazorat/aosr-holat';
import { amaldagiProtokolNarxlari, narxProtokolQatorlariOl, type NarxProtokolQator } from '../../api/t2-narx-protokol';
import {
  bosKiritma, f2Jami, f2KatKesim, f2Qatorlar, f2Qur, f2Yacheykalar, f2Yuk, ishBirlikNarxi, narxsizNomzodlar, sonOqi, ulushHajm,
  type F2Bolim, type F2Ish, type F2Kiritma, type F2Manba, type F2Qator, type F2Resurs,
} from '../../lib/f2-tayyor';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { ishMeter, keyingiF2Raqam, qoralamaKatTaqsimot, tekshiruvBandlari, tekshiruvSanoq, type TekshiruvBand } from '../../lib/f2-tayyorlash-korinish';
import { F2KatPanel, F2QoralamaSarlavha, F2TekshiruvPanel, IshMeter, MeterIzohi, NarxManbaChip } from '../../components/f2-tayyorlash/F2TayyorlashKorinish';
import { avlodKalitlari, bolimTuguni, f2BolimIerarxiya, f2Uchastkalar, korinadiganTugunlar } from '../../lib/f2-bolim-daraxti';

const oyBoshlanishi = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
const XATO_MATN: Record<NonNullable<F2Qator['xato']>, string> = { HAJM: 'Hajm 0 dan katta son bo‘lsin', NARX: 'Narx kerak (yoki «narxsiz» belgilang)', SUMMA: 'Summa son emas' };
const OGOH_MATN: Record<NonNullable<F2Qator['ogoh']>, string> = { RESURS_CHEGARA: 'resurs fakt qoldig‘i bilan cheklandi', ARIFMETIKA: 'summa hajm × narxdan farq qiladi — hujjat summasi saqlanadi', SMETADAN_OSHDI: 'smeta hajmidan oshadi (ruxsat, ogohlantirish)', AXBOROT_NARXSIZ: 'axborot qatori: narxsiz (smetada narxi yo‘q)', QOLDIQDAN_OSHDI: 'fakt qoldig‘idan oshadi (ruxsat, ogohlantirish)', QORALAMA_TAKROR: 'qoralamadagi F2 bilan birga ikki marta olinadi — tekshiring' };
/** Hajm qoldiqdan oshgan ogohlantirishlar - maydon sariq (blok emas). */
const OSH_OGOH = new Set<F2Qator['ogoh']>(['SMETADAN_OSHDI', 'QOLDIQDAN_OSHDI', 'QORALAMA_TAKROR']);
/** Tahrirlanayotgan QORALAMA akt (?akt=ID): sarlavha + qatorlar (t2_akt_qator) - kiritmalarga yuklanadi. */
type AktBand = { qator_id: number; hajm: number | string | null; certified_quantity: number | string | null; certified_unit_price: number | string | null; certified_amount: number | string | null; provenance_status: string | null };
type TahrirAkt = { id: number; raqam: string | null; oy: string | null; holat: string; lifecycle_status: string | null; versiya: number; qatorlar: AktBand[] };
const sonQ = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const kirit = 'rounded border border-border bg-bg px-2 py-1 text-right tabular-nums outline-none focus:border-accent';

/**
 * F2 tayyorlash (egasi, 2026-10-01: "fakt kiritishdan ideal F2 gacha").
 * Operator ISH hajmini tanlaydi → resurslari (hajm × norma) avtomatik ergashadi; narx — oldingi F2 → smeta (manba ko'rinadi),
 * summa avtomatik; hujjat raqami bir marta. Server qoidasi o'zgarmaydi: har resursda narx yoki ongli "narxsiz".
 */
export function F2TayyorlashNative() {
  const moneyScope = useRef<HTMLDivElement>(null);
  const { joriy } = useKompaniya();
  const [tomonlar, setTomonlar] = useHujjatTomonlari(joriy?.id);
  const [ndsFoiz, setNdsFoiz] = useState(String(NDS_SUKUT_FOIZ));
  const workspace = usePTOWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [rows, setRows] = useState<T2Qator[]>([]);
  const [holat, setHolat] = useState<QatorHolat[]>([]);
  const [qoralamaHajm, setQoralamaHajm] = useState<ReadonlyMap<number, number>>(new Map());
  /** Протокол согласования цен qatorlari (tasdiqlangan — kuchga kirgan oydan narx ustuvor). */
  const [protokolQ, setProtokolQ] = useState<NarxProtokolQator[]>([]);
  const [k, setK] = useState<F2Kiritma>(bosKiritma);
  /** Hajm manbai: operator tanlamaguncha — obyektda fakt qoldig'i bo'lsa `fakt`, bo'lmasa `smeta` (faktsiz F2). */
  const [manbaTanlov, setManbaTanlov] = useState<F2Manba | null>(null);
  const [oy, setOy] = useState(oyBoshlanishi());
  const [raqam, setRaqam] = useState('');
  const [qidir, setQidir] = useState('');
  /** Bitta almashtirgich: faqat shu davrda hajmi kiritilgan ishlar (hamma bo'limlardan). */
  const [faqatKiritilgan, setFaqatKiritilgan] = useState(false);
  /** Tanlangan razdel kaliti (id; -1 = bo'limsiz). Istalgan daraja: uning barcha avlod ishlari ko'rinadi. */
  const [bolimId, setBolimId] = useState<number | undefined>(undefined);
  /** Chap daraxtda faqat F2 ga olish mumkin ishi bor razdellar. */
  const [faqatMumkin, setFaqatMumkin] = useState(false);
  const [korsatLimit, setKorsatLimit] = useState(300);
  const [ochiq, setOchiq] = useState<Set<number>>(new Set());
  /** Bo'lim daraxti yig'iq: faqat shu kalitli (id ?? -1) bo'limlarning farzandlari ochilgan; tanlangan bo'lim ajdodlari doim ochiq. */
  const [kengaygan, setKengaygan] = useState<Set<number>>(new Set());
  /** Resurs vedomosti (tanlangan ishlar resurslari + narxlash) ochiqmi. */
  const [vedomostOchiq, setVedomostOchiq] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [aosrsiz, setAosrsiz] = useState<AosrCoverage[]>([]);
  const [aosrKoz, setAosrKoz] = useState<Map<number, AosrIshora>>(new Map());
  /** Shartnoma liniyasidan: imzolovchilar (buyurtmachi, pudratchi, subpudratchi, texnadzor) va shartnoma raqami. */
  const [avto, setAvto] = useState<{ imzo: ImzoNomlar; shartnoma: string | null }>({ imzo: {}, shartnoma: null });
  const operationId = useRef(yangiOperationId());
  const obyektId = Number(params.get('obyekt'));
  const validId = Number.isSafeInteger(obyektId) && obyektId > 0;
  const aktParam = Number(params.get('akt'));
  const aktId = Number.isSafeInteger(aktParam) && aktParam > 0 ? aktParam : null;
  const [akt, setAkt] = useState<TahrirAkt | null>(null);
  const [aktXato, setAktXato] = useState('');
  const aktQollandi = useRef<string | null>(null);
  /** Faqat qoralama (draft) akt tahrirlanadi; tasdiqlangan/yuborilgan - faqat ko'rish. */
  const aktKorish = !!akt && (akt.holat !== 'qoralama' || (akt.lifecycle_status ?? 'draft') !== 'draft');

  useEffect(() => {
    if (!joriy?.id) return;
    void sbT2ObyektlarOlKomp(joriy.id).then((result) => setObyektlar((result.ok ? result.qatorlar : []) as T2Obyekt[]));
  }, [joriy?.id]);


  /** Loads are numbered: rows of an object the user already left must never stay under the new object (an F2 act is written from them). */
  const sorov = useRef(0);
  const yuklash = useCallback(async () => {
    const raqam = ++sorov.current;
    const dolzarb = () => raqam === sorov.current;
    if (!validId) { setRows([]); setHolat([]); setProtokolQ([]); setAosrsiz([]); setAosrKoz(new Map()); return; }
    setLoading(true); setError(''); setRows([]); setHolat([]); setAkt(null); setAktXato(''); aktQollandi.current = null;
    try {
      if (aktId != null) {
        void (async () => {
          const [a, q] = await Promise.all([
            sbOqi<{ id: number; raqam: string | null; oy: string | null; holat: string; lifecycle_status: string | null; versiya: number | null }>({ jadval: 't2_akt', filtr: `id=eq.${aktId}&obyekt_id=eq.${obyektId}&tur=eq.f2`, ustunlar: 'id,raqam,oy,holat,lifecycle_status,versiya', limit: 1 }),
            sbOqi<AktBand>({ jadval: 't2_akt_qator', filtr: `akt_id=eq.${aktId}&obyekt_id=eq.${obyektId}`, ustunlar: 'qator_id,hajm,certified_quantity,certified_unit_price,certified_amount,provenance_status', limit: 50000 }),
          ]);
          if (!dolzarb()) return;
          const h0 = a.ok ? a.qatorlar?.[0] : undefined;
          if (!a.ok || !q.ok) { setAktXato(t('F2 akti o‘qilmadi. Qayta urinib ko‘ring.')); return; }
          if (!h0 || h0.versiya == null) { setAktXato(t('Bu obyektda bunday F2 akti topilmadi.')); return; }
          setAkt({ id: h0.id, raqam: h0.raqam, oy: h0.oy, holat: h0.holat, lifecycle_status: h0.lifecycle_status, versiya: Number(h0.versiya), qatorlar: q.qatorlar ?? [] });
        })().catch(() => { if (dolzarb()) setAktXato(t('F2 akti o‘qilmadi. Qayta urinib ko‘ring.')); });
      }
      void Promise.resolve().then(() => narxProtokolQatorlariOl(obyektId)).then((r) => { if (dolzarb()) setProtokolQ(r.ok ? (r.qatorlar || []).filter((x) => x.holat === 'tasdiqlangan') : []); }).catch(() => { if (dolzarb()) setProtokolQ([]); });
      void sbAosrCoverageOl(obyektId).then((c) => { if (dolzarb()) { setAosrsiz(c.ok ? (c.qatorlar || []).filter((x) => x.yashirin && !x.akt_bor) : []); setAosrKoz(new Map(c.ok ? (c.qatorlar || []).map((x) => [x.qator_id, aosrIshora(x)] as const) : [])); } }).catch(() => { if (dolzarb()) setAosrsiz([]); });
      void Promise.resolve().then(() => sbF2QoralamaHajmlar(obyektId, aktId)).then((qh) => { if (dolzarb()) setQoralamaHajm(qh.ok ? qh.hajm : new Map()); }).catch(() => { if (dolzarb()) setQoralamaHajm(new Map()); });
      const [d, h] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbQatorHolatOl(obyektId)]);
      if (!dolzarb()) return;
      if (!d.ok || !h.ok) { setRows([]); setHolat([]); setError('F2 uchun smeta va fakt qoldig‘i o‘qilmadi.'); return; }
      setRows((d.qatorlar || []) as T2Qator[]); setHolat((h.qatorlar || []) as QatorHolat[]);
      setK(bosKiritma()); setBolimId(undefined); setManbaTanlov(null);
      operationId.current = yangiOperationId();
    } catch { if (dolzarb()) { setRows([]); setHolat([]); setError('F2 uchun ma’lumotlar o‘qilmadi. Qayta urinib ko‘ring.'); } }
    finally { if (dolzarb()) setLoading(false); }
  }, [obyektId, validId, aktId]);
  useEffect(() => { void yuklash(); }, [yuklash]);

  /* Egasi (2026-10-02): imzolovchilarni tizim qo'yadi — shartnoma tomonlaridan (yumshoq: panelda qo'lda o'zgartirsa, o'sha ustun). */
  useEffect(() => {
    if (!joriy?.id || !validId) { setAvto({ imzo: {}, shartnoma: null }); return; }
    let bekor = false;
    void shartnomaLiniyaOl(joriy.id).then((r) => {
      if (bekor || !r.ok) return;
      const ob = r.natija.obyektlar.find((o) => o.id === obyektId);
      const asosiy = r.natija.shartnomalar.find((s) => s.id === ob?.asosiy_shartnoma_id);
      const qoshimcha = r.natija.shartnomalar.filter((s) => !s.asosiy && s.obyektlar.includes(obyektId));
      const imzo = imzoNomlariTomonlardan([...(asosiy?.tomonlar ?? []), ...qoshimcha.flatMap((s) => s.tomonlar)]);
      setAvto({ imzo, shartnoma: asosiy ? `№ ${asosiy.raqam}${asosiy.nom ? ` — ${asosiy.nom}` : ''}` : null });
    }).catch(() => undefined);
    return () => { bekor = true; };
  }, [joriy?.id, obyektId, validId]);

  const protokolNarx = useMemo(() => amaldagiProtokolNarxlari(protokolQ, oy), [protokolQ, oy]);
  const manba: F2Manba = manbaTanlov ?? (holat.some((h) => Number(h.f2_mumkin_hajm) > 0) ? 'fakt' : 'smeta');
  const bolimlar = useMemo(() => f2Qur(rows, holat, protokolNarx, manba, qoralamaHajm), [rows, holat, protokolNarx, manba, qoralamaHajm]);
  const qatorlar = useMemo(() => f2Qatorlar(bolimlar, k), [bolimlar, k]);
  const jami = useMemo(() => f2Jami(qatorlar), [qatorlar]);
  const katKesim = useMemo(() => f2KatKesim(qatorlar), [qatorlar]);
  const byId = useMemo(() => new Map(qatorlar.map((x) => [x.id, x])), [qatorlar]);
  const narxsizlar = useMemo(() => narxsizNomzodlar(qatorlar), [qatorlar]);
  const aosrsizId = useMemo(() => new Set(aosrsiz.map((x) => x.qator_id)), [aosrsiz]);
  const resursKodi = useMemo(() => { const m = new Map<number, string | null>(); for (const b of bolimlar) { for (const i of b.ishlar) for (const r of i.resurslar) m.set(r.id, r.kod); for (const r of b.alohida) m.set(r.id, r.kod); } return (id: number) => m.get(id) ?? null; }, [bolimlar]);
  /** Vedomostdan tanlangan taklif narxi: faqat F2 qatoriga (qo'lda narx) yoziladi - asl smetaga emas. */
  const narxniQollash = (ids: number[], narx: number) => setK((o) => { const n = { ...o.narx }; const ns = { ...o.narxsiz }; for (const id of ids) { n[id] = String(narx); delete ns[id]; } return { ...o, narx: n, narxsiz: ns }; });
  const tayyor = qatorlar.length > 0 && jami.xato === 0;
  /** DUBLIKAT HIMOYASI (egasi 2026-10-25): shu obyektda shu raqam bor — BLOK; summasi ±0,5% teng F2 / pereraschet — ogohlantirish. */
  const { aktlar: obyektAktlari } = useObyektF2Aktlari(validId ? obyektId : null, saving ? 1 : 0);
  const dublikatlar = useMemo(() => {
    if (!validId || aktId != null || !qatorlar.length) return [];
    const yuk = f2Yuk(qatorlar, raqam);
    const jamiS = yuk.some((r) => r.certifiedAmount != null) ? yuk.reduce((s, r) => s + (r.certifiedAmount ?? 0), 0) : null;
    return dublikatTekshiruv({ aktlar: obyektAktlari, oy: oy.slice(0, 7), raqam, jami: jamiS, ozAktId: null, manbaAktIdlar: [],
      pereraschet: pereraschetBelgisi(rows, yuk.map((r) => r.qatorId)) });
  }, [validId, aktId, qatorlar, raqam, oy, obyektAktlari, rows]);
  const dublikatBlok = bloklarmi(dublikatlar);
  const saqlashMumkin = tayyor && !dublikatBlok && (aktId == null || (!!akt && !aktKorish));
  const bolimIer = useMemo(() => f2BolimIerarxiya(rows, bolimlar), [rows, bolimlar]);
  const tanlanganBolim: number | null = bolimId !== undefined ? bolimId : bolimlar[0] ? bolimlar[0].id ?? -1 : null;
  const tanlanganAvlod = useMemo(() => (tanlanganBolim == null ? new Set<number>() : avlodKalitlari(bolimIer, tanlanganBolim)), [bolimIer, tanlanganBolim]);
  const qatorBolim = useMemo(() => { const m = new Map<number, number | null>(); for (const b of bolimlar) { for (const i of b.ishlar) m.set(i.id, b.id); for (const r of b.alohida) m.set(r.id, b.id); } return m; }, [bolimlar]);
  const uchastkalar = useMemo(() => f2Uchastkalar(qatorlar, bolimIer, qatorBolim), [qatorlar, bolimIer, qatorBolim]);
  const tanlanganTugun = tanlanganBolim != null ? bolimIer.byKalit.get(tanlanganBolim) : undefined;
  /** Ko'rinish (egasi 2026-10-25: F2 ni tayyorlash paytida hujjat sifatida ko'rish) — faqat ko'rsatish, hisob o'zgarmaydi. */
  const katTaq = useMemo(() => qoralamaKatTaqsimot(qatorlar), [qatorlar]);
  const raqamTaklif = useMemo(() => (aktId == null ? keyingiF2Raqam(obyektAktlari) : null), [aktId, obyektAktlari]);



  /** 30k qatorli smetada har tugma bosishda qayta filtrlamaslik: qidiruv matni kechiktirib qo'llanadi. */
  const qidirKech = useDeferredValue(qidir);
  const korinadi = useMemo((): F2Bolim[] => {
    const s = qidirKech.trim().toLocaleLowerCase('ru'); const qMos = qidiruvTayyorla(s);
    // «Faqat kiritilganlar»: hamma bo'limlardagi shu davrda hajmi kiritilgan ishlar (bo'lim tanlovi e'tiborga olinmaydi).
    const kiritilgan = (id: number) => k.hajm[id] !== undefined;
    if (!s && !faqatKiritilgan) return bolimlar.filter((b) => tanlanganAvlod.has(b.id ?? -1));
    // Shifr/nom bo'yicha: lotin va kirill bir xil ko'rinadi (qidiruv-normalizatsiya).
    const mos = (nom: string, kod: string | null) => !s || qMos(nom) || (kod != null && (qMos(kod) || kod.toLocaleLowerCase('ru').includes(s)));
    return bolimlar.map((b) => ({
      ...b,
      ishlar: b.ishlar.filter((i) => (!faqatKiritilgan || kiritilgan(i.id) || i.resurslar.some((r) => !r.avto && kiritilgan(r.id))) && (mos(i.nom, i.kod) || i.resurslar.some((r) => mos(r.nom, r.kod)))),
      alohida: b.alohida.filter((r) => (!faqatKiritilgan || kiritilgan(r.id)) && mos(r.nom, r.kod)),
    })).filter((b) => b.ishlar.length || b.alohida.length);
  }, [bolimlar, qidirKech, tanlanganAvlod, faqatKiritilgan, k.hajm]);
  const royxatRejimi = !!qidirKech.trim() || faqatKiritilgan;

  const yoz = (maydon: keyof F2Kiritma, id: number, qiymat: string | boolean | undefined) => setK((o) => {
    const m = { ...o[maydon] } as Record<number, string | boolean>;
    if (qiymat === undefined || qiymat === '') delete m[id]; else m[id] = qiymat;
    return { ...o, [maydon]: m };
  });
  const bolimniOl = (bs: F2Bolim[]) => setK((o) => {
    const hajm = { ...o.hajm };
    for (const b of bs) {
      for (const i of b.ishlar) { if (i.mumkin > 0) hajm[i.id] = String(i.mumkin); for (const r of i.resurslar) if (!r.avto && r.mumkin > 0) hajm[r.id] = String(r.mumkin); }
      for (const r of b.alohida) hajm[r.id] = String(r.mumkin);
    }
    return { ...o, hajm };
  });
  /** Tez kiritish: Enter — keyingi ishning hajm maydoniga, Esc — shu maydonni tozalaydi. */
  const hajmKlaviatura = (e: KeyboardEvent<HTMLInputElement>, id: number) => {
    if (e.key === 'Escape') { yoz('hajm', id, undefined); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const hammasi = [...(moneyScope.current?.querySelectorAll<HTMLInputElement>('input[data-ish-hajm]') ?? [])];
    hammasi[hammasi.indexOf(e.currentTarget) + 1]?.focus();
  };
  /** ↑/↓ — oldingi/keyingi ish hajmi maydoniga (hajm maydonida yoki sahifada turganda; boshqa maydonlarda ishlamaydi). */
  const hajmgaOtish = (qadam: 1 | -1) => {
    const hammasi = [...(moneyScope.current?.querySelectorAll<HTMLInputElement>('input[data-ish-hajm]') ?? [])];
    if (!hammasi.length) return false;
    const a = document.activeElement as HTMLElement | null;
    const i = a instanceof HTMLInputElement ? hammasi.indexOf(a) : -1;
    if (i < 0 && a && a !== document.body && a.tagName.toLowerCase() === 'input') return false;
    const keyingi = hammasi[Math.max(0, Math.min(hammasi.length - 1, i < 0 ? 0 : i + qadam))];
    keyingi?.focus(); keyingi?.select?.();
    return true;
  };
  /** Fakt oynasidan «Fakt bo'yicha F2 qoralama» (?avto=1): yuklangach barcha mumkin hajm bir yo'la olinadi; qoralama yaratish operator tasdig'i (Ctrl+Enter) bilan. */
  const avtoQollandi = useRef(false);
  useEffect(() => {
    if (params.get('avto') !== '1' || avtoQollandi.current || loading || !bolimlar.length) return;
    avtoQollandi.current = true;
    bolimniOl(bolimlar);
    const n = bolimlar.reduce((s, b) => s + b.ishlar.filter((i) => i.mumkin > 0).length + b.alohida.filter((r) => r.mumkin > 0).length, 0);
    toast(n > 0 ? t('Fakt bo‘yicha {n} ta ish hajmi olindi. Tekshirib, Ctrl+Enter bilan qoralama yarating.', { n: String(n) }) : t('Fakt qoldig‘i yo‘q - olinadigan hajm topilmadi.'), n > 0 ? 'ok' : 'warn');
    setParams((p) => { const x = new URLSearchParams(p); x.delete('avto'); return x; }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bolimlar, params]);  const narxsizBelgila = () => setK((o) => ({ ...o, narxsiz: { ...o.narxsiz, ...Object.fromEntries(narxsizlar.map((id) => [id, true])) } }));

  /** ?akt=ID: qoralama aktning qatorlari kiritmalarga yuklanadi (ish/mustaqil resurs hajmi, resurs narxi); avtomatik resurs hajmi normadan qayta hisoblanadi. */
  const [korinmaganQator, setKorinmaganQator] = useState(0);
  useEffect(() => {
    if (!akt || loading || !bolimlar.length) return;
    const kalit = `${akt.id}:${akt.versiya}`;
    if (aktQollandi.current === kalit) return;
    aktQollandi.current = kalit;
    const hajmQ = new Set<number>(); const avtoQ = new Set<number>(); const resQ = new Set<number>();
    for (const b of bolimlar) {
      for (const i of b.ishlar) { hajmQ.add(i.id); for (const r of i.resurslar) { resQ.add(r.id); (r.avto ? avtoQ : hajmQ).add(r.id); } }
      for (const r of b.alohida) { hajmQ.add(r.id); resQ.add(r.id); }
    }
    const nk = bosKiritma(); let yoq = 0;
    for (const x of akt.qatorlar) {
      const id = x.qator_id; const qty = sonQ(x.certified_quantity) ?? sonQ(x.hajm);
      if (hajmQ.has(id)) { if (qty != null) nk.hajm[id] = String(qty); } else if (!avtoQ.has(id)) { yoq++; continue; }
      if (!resQ.has(id)) continue;
      const narx = sonQ(x.certified_unit_price); const summa = sonQ(x.certified_amount);
      if (x.provenance_status === 'price_intentionally_absent') nk.narxsiz[id] = true;
      else if (narx != null) {
        nk.narx[id] = String(narx);
        if (qty != null && summa != null && Math.abs(qty * narx - summa) > 0.005) nk.summa[id] = String(summa);
      }
    }
    setK(nk); setKorinmaganQator(yoq);
    if (akt.raqam) setRaqam(akt.raqam);
    if (akt.oy) setOy(String(akt.oy).slice(0, 10));
  }, [akt, loading, bolimlar]);

  /** BITTA tekshiruv ro'yxati: xato, dublikat, oshgan hajm, АОСР, uchastka, narxsiz — hammasi bir joyda (qarorlar o'zgarmaydi). */
  const bandlar = useMemo(() => tekshiruvBandlari({ qatorlar, dublikatlar, aosrsizSoni: aosrsiz.length, uchastkalar, korinmagan: aktId != null ? korinmaganQator : 0, raqam, raqamQulf: aktId != null }),
    [qatorlar, dublikatlar, aosrsiz.length, uchastkalar, aktId, korinmaganQator, raqam]);
  const sanoq = tekshiruvSanoq(bandlar);
  /** Tekshiruvdan qatorga o'tish: bo'limi tanlanadi, ish ochiladi, qator ko'rinishga suriladi va maydoniga fokus. */
  const [sakrash, setSakrash] = useState<number | null>(null);
  const qatorgaOtish = (id: number) => {
    const q = byId.get(id);
    const ish = q?.ishId ?? id;
    setQidir('');
    if (qatorBolim.has(ish)) setBolimId(qatorBolim.get(ish) ?? -1);
    if (q && q.tur !== 'bl' && q.ishId != null) setOchiq((o) => new Set(o).add(q.ishId!));
    setKorsatLimit((n) => Math.max(n, 5000));
    setSakrash(id);
  };
  const tekshiruvgaOtish = () => { const el = document.getElementById('f2-tekshiruv'); el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); el?.focus({ preventScroll: true }); };
  const f2Yacheyka = f2Yacheykalar(f2Yuk(qatorlar, raqam));
  const moneyValid = () => {
    if (!reportMoneyValidity(moneyScope.current)) return false;
    // Collapsed/filtered resource editors are unmounted, but their string drafts
    // still exist. Do not let sonOqi's null fallback silently reuse a source price.
    const invalid = [...Object.entries(k.narx), ...Object.entries(k.summa)]
      .some(([id, value]) => !k.narxsiz[Number(id)] && value !== '' && !isCompleteMoney(value));
    if (invalid) toast(t('Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.'), 'warn');
    return !invalid;
  };
  /** ?akt=ID rejimi: yangi akt yaratilmaydi - mavjud qoralama qatorlari almashtiriladi (akt id/raqam saqlanadi). */
  const aktniYangila = async () => {
    if (!akt || aktKorish || !joriy?.id || saving) return;
    setSaving(true);
    try {
      const r = await sbT2F2QoralamaYangila({ kompaniyaId: joriy.id, aktId: akt.id, kutilganVersiya: akt.versiya, operationId: yangiOperationId(), qatorlar: f2Yuk(qatorlar, akt.raqam ?? raqam) });
      if (!r.ok) {
        if (r.code === 'STALE_VERSION') { toast(t('F2 qoralama boshqa joyda o‘zgargan - yangi holati o‘qildi. Tekshirib, qayta saqlang.'), 'warn'); await yuklash(); }
        else toast(r.xabar || r.error || t('F2 qoralama yangilanmadi.'), 'danger');
        return;
      }
      toast(t('F2 qoralama yangilandi (akt #{id}, {n} qator). Tasdiqlash - F2 tarixida.', { id: String(akt.id), n: String(qatorlar.length) }), 'ok', undefined, 12000, { label: 'Ochish', onClick: () => navigate(`/admin/f2-tarix?obyekt=${obyektId}`) });
      await yuklash();
    } catch { toast(t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); }
    finally { setSaving(false); }
  };
  const saqlash = async () => {
    if (!moneyValid()) return;
    if (!validId || !tayyor || saving) return;
    if (!joriy?.id) return;
    if (aktId != null) { await aktniYangila(); return; }
    const ogoh = dublikatlar.filter((m) => m.daraja === 'ogoh');
    if (ogoh.length && !await tasdiqSora(ogoh.map((m) => m.matn).join('\n\n') + '\n\n' + t('Baribir yozasizmi?'))) return;
    setSaving(true);
    try {
      // Token (egasi 2026-10-02): F2 qoralama — "f2_qoralama"; server xato bersa token avtomatik qaytadi.
      const t = await tokenBilan({ kompaniyaId: joriy.id, amal: 'f2_qoralama', birlikSoni: f2Yacheyka, meta: { obyekt: obyektId, qator: qatorlar.length, yacheyka: f2Yacheyka } }, async () => {
        const result = await sbT2AktYaratV2({ obyektId, oy, operationId: operationId.current, qatorlar: f2Yuk(qatorlar, raqam), raqam: raqam.trim() || undefined });
        if (!result.ok) throw new Error(result.error || result.xabar || 'F2 qoralama yaratilmadi.');
        return result;
      });
      if (!t.ok) { toast(t.xabar, 'danger'); return; }
      toast(`F2 qoralama yaratildi (${t.sarflandi} token). Tasdiqlash — F2 tarixida.`, 'ok', undefined, 12000, { label: 'Ochish', onClick: () => navigate(`/admin/f2-tarix?obyekt=${obyektId}`) });
      await yuklash();
    } catch { toast('Javob olinmadi. Shu amal IDsi bilan qayta urinishingiz mumkin.', 'danger'); }
    finally { setSaving(false); }
  };

  const korinish = useHujjatKorinish();
  const excelYuklash = async (korish = false) => {
    if (!moneyValid()) return;
    if (!validId || !tayyor) return;
    const object = obyektlar.find((item) => item.id === obyektId);
    if (!object) { toast('Obyekt topilmadi.', 'danger'); return; }
    try {
      const stavka = ndsFoiz.trim() === '' ? null : Number(ndsFoiz.replace(',', '.'));
      const nk = await t2ObyektNakrutka(obyektId).catch(() => null);
      const podval = await obyektPodvali(joriy?.id, obyektId, nk?.ok ? nk.shartnoma_id : null);
      // Qo'lda kiritilgan imzo (panel) — shartnomadagidan ustun; bo'sh maydon — shartnomadagi qoladi.
      const qolda = Object.fromEntries(Object.entries(tomonlar).filter(([, x]) => typeof x === 'string' && x.trim())) as ImzoNomlar;
      const h = f2Hujjat(bolimlar, qatorlar, {
        obyektNom: object.nom, davr: oy, raqam, imzo: { ...avto.imzo, ...qolda }, shartnoma: avto.shartnoma,
        ndsFoiz: stavka != null && Number.isFinite(stavka) ? stavka : null,
        nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval, rows,
      });
      // Token (egasi 2026-10-02): hujjat avval yaratiladi (xato bo'lsa token olinmaydi), keyin "f2_hujjat" sarfi bilan beriladi.
      // Mazmun xeshi: aynan shu hujjat qayta ochilsa/yuklansa — qayta to'lov yo'q. Sabab daftarda ko'rinadi.
      if (!joriy?.id) return;
      const xesh = f2HujjatKaliti(obyektId, oy, raqam) ?? await mazmunXeshi(h.bytes);
      const t = await tokenBilan({ kompaniyaId: joriy.id, amal: 'f2_hujjat', birlikSoni: h.yacheykalar,
        meta: { hujjat: 'F2', sabab: `F2 №${raqam || '—'} · ${object.nom} · ${oy}`.slice(0, 200), obyekt: obyektId, yacheyka: h.yacheykalar, xesh } }, async () => {
        if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
        return true;
      });
      if (!t.ok) toast(t.xabar, 'danger');
      else if (t.bepulTakror) toast('Bu hujjat avval to‘langan — qayta yuklash bepul', 'ok');
      else toast(`${t.sarflandi} token · ${Number(t.hisob?.yakuniy_som ?? 0).toLocaleString('ru-RU')} so‘m (${h.yacheykalar} yacheyka)`, 'ok');
    } catch { toast('Forma-2 Excel qoralamasini yaratib bo‘lmadi.', 'danger'); }
  };

  useHotkeys('f2-tayyorlash', t('F2 tayyorlash'), [
    { id: 'hajm-pastga', keys: 'arrowdown', nom: t('Keyingi ish hajmiga'), guruh: t('Tez kiritish'), inInput: true, run: () => hajmgaOtish(1) },
    { id: 'hajm-tepaga', keys: 'arrowup', nom: t('Oldingi ish hajmiga'), guruh: t('Tez kiritish'), inInput: true, run: () => hajmgaOtish(-1) },
    { id: 'qidiruv', keys: '/', nom: t('Qidiruvga o‘tish (shifr yoki nom)'), guruh: t('Tez kiritish'), run: (e) => { const q = moneyScope.current?.querySelector<HTMLInputElement>('input[aria-label="Qidirish"]'); if (!q) return false; e.preventDefault(); q.focus(); q.select(); } },
    { id: 'saqlash', keys: 'ctrl+enter', nom: t('F2 qoralama yaratish'), guruh: t('Tez kiritish'), inInput: true, enabled: () => saqlashMumkin && !saving, run: () => { void saqlash(); } },
  ], validId);

  function resursQatori(r: F2Resurs) {
    const x = byId.get(r.id);
    const taklif = r.taklifNarx != null ? String(Math.round(r.taklifNarx * 1e6) / 1e6) : '';
    const kat = r.tur === 'rs' ? r.kat : r.kat || (r.tur === 'ob' ? 'ОБ' : 'МАТ');
    const katBelgi = kat ? <KatNishon kat={kat} /> : <span className="fz-kat">{'rs'}</span>;
    return (
      <tr key={r.id} data-qator={r.id} className="border-t border-border align-top">
        <td className="py-1.5 pl-9 pr-2">
          <div className="flex items-center gap-1.5">{katBelgi}<span className="truncate text-text">{r.nom}</span></div>
          {r.norma != null && r.avto && <div className="pl-1 text-[11px] text-text-mute">{t('norma')} {r.norma}</div>}
        </td>
        <td className="px-2 py-1.5 text-right text-text-mute">{r.birlik}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {r.avto ? (x ? <FmtN val={x.hajm} /> : <span className="text-text-mute">—</span>)
            : <input aria-label={`F2 hajmi: ${r.nom}`} inputMode="decimal" value={k.hajm[r.id] ?? ''} onChange={(e) => yoz('hajm', r.id, e.target.value)} placeholder={String(r.mumkin)} className={`${kirit} w-24 ${OSH_OGOH.has(x?.ogoh) ? '!border-warn bg-warn/10' : ''}`} />}
          <div className="text-[11px] text-text-mute">{t('mumkin')} <FmtN val={r.mumkin} /></div>
        </td>
        <td className="px-2 py-1.5 text-right">
          <MoneyInput aria-label={`F2 narxi: ${r.nom}`} inputMode="decimal" disabled={k.narxsiz[r.id] === true} value={k.narx[r.id] ?? ''} onValueChange={(moneyValue) => yoz('narx', r.id, moneyValue)} placeholder={taklif || t('narx')} className={`${kirit} w-28 disabled:opacity-40`} />
          {x && <div className="mt-1 flex items-center justify-end gap-1"><NarxManbaChip manba={x.manba} protokol={x.protokol} />{x.protokol && <span className="text-[11px] text-text-mute">{x.protokol}</span>}</div>}
        </td>
        <td className="px-2 py-1.5 text-right">
          <MoneyInput aria-label={`F2 summasi: ${r.nom}`} inputMode="decimal" disabled={k.narxsiz[r.id] === true} value={k.summa[r.id] ?? ''} onValueChange={(moneyValue) => yoz('summa', r.id, moneyValue)} placeholder={x?.summa != null ? x.summa.toFixed(2) : ''} className={`${kirit} w-32 disabled:opacity-40`} />
        </td>
        <td className="w-28 px-2 py-1.5">
          <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-text-dim"><input type="checkbox" aria-label={`Narxsiz: ${r.nom}`} checked={k.narxsiz[r.id] === true} onChange={(e) => yoz('narxsiz', r.id, e.target.checked || undefined)} />{t('narxsiz')}</label>
          {x?.xato && <div className="text-[11px] text-danger">{XATO_MATN[x.xato]}</div>}
          {x?.ogoh && <div className="text-[11px] text-warn">{OSH_OGOH.has(x.ogoh) ? t(OGOH_MATN[x.ogoh]) : OGOH_MATN[x.ogoh]}</div>}
        </td>
      </tr>
    );
  }

  /** ТН·КМ qatori yonida taklif (blok emas): A = shu F2 dagi tonnali mos material Σ tonna × km; B = F2/smeta ulushi × smeta т·км. */
  function tkmTaklifQator(ish: F2Ish) {
    const taklif = (() => {
      const hamma = bolimlar.flatMap((b) => b.ishlar);
      const f2 = hamma.filter((x) => x.id !== ish.id).map((x) => ({ nom: x.nom, birlik: x.birlik, hajm: sonOqi(k.hajm[x.id]) })).map((x) => ({ ...x, hajm: typeof x.hajm === 'number' ? x.hajm : null }));
      const smetaM = hamma.filter((x) => x.id !== ish.id).map((x) => ({ nom: x.nom, birlik: x.birlik, hajm: x.smeta }));
      return tkmTaklif({ nom: ish.nom }, f2, { materiallar: smetaM, tkmHajm: ish.smeta });
    })();
    if (!taklif) return null;
    return <div className="flex flex-wrap items-center gap-2 px-10 pb-2 text-[12px] text-text-dim" aria-label={t('ТН·КМ taklifi')}>
      <span>{t('Taklif')}:</span>
      {([['A', taklif.a], ['B', taklif.b]] as const).map(([nom, v]) => v && <button key={nom} type="button" title={v.izoh} onClick={() => yoz('hajm', ish.id, String(v.qiymat))}
        className="fz-btn fz-btn--sm">{nom}: <FmtN val={v.qiymat} /></button>)}
      <span className="text-text-mute">{[taklif.a?.izoh, taklif.b?.izoh].filter(Boolean).join(' · ')}</span>
    </div>;
  }

  function ishKartasi(i: F2Ish) {
    const x = byId.get(i.id);
    const ochilgan = ochiq.has(i.id) || !!qidir.trim();
    const resSumma = i.resurslar.reduce((s, r) => s + (byId.get(r.id)?.summa ?? 0), 0);
    const meter = ishMeter(i, x && !x.xato ? x.hajm : 0);
    const tg = bolimTuguni(bolimIer, qatorBolim.get(i.id) ?? null);
    const aosr = aosrKoz.get(i.id);
    const aosrBelgi = aosr && aosr !== 'yoq' && aosr !== 'kerak_emas' ? <span className={`fz-chip ${aosr === 'imzolangan' ? 'fz-chip--accent' : 'fz-chip--warn'}`}>{t(AOSR_ISHORA_MATNI[aosr])}</span> : null;
    const bn = ishBirlikNarxi(i);
    const birlikNarx = bn.summa > 0 ? <b className="text-text"><FmtN val={bn.summa} /></b> : '—';
    const birlikNarxsiz = bn.narxsiz > 0 ? <span className="fz-chip fz-chip--warn">{bn.narxsiz} {t('resursda narx yo‘q')}</span> : null;
    const chegaraNom = i.erkin ? t('smeta qoldig‘i') : t('F2 mumkin');
    const holat = x?.xato ? 'border-danger/60' : x ? (OSH_OGOH.has(x.ogoh) || meter.oshish != null ? 'border-warn/60 bg-warn/5' : 'border-accent/50 bg-accent/5') : 'border-border';
    return (
      <div key={i.id} data-qator={i.id} className={`rounded-lg border ${holat}`}>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
          <button type="button" aria-label={`${ochilgan ? t('Yopish') : t('Resurslarni ko‘rish')}: ${i.nom}`} aria-expanded={ochilgan} tabIndex={-1} onClick={() => setOchiq((o) => { const n = new Set(o); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} className="mt-0.5 rounded p-0.5 text-text-mute hover:text-text">
            {ochilgan ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <div className="min-w-[14rem] flex-1">
            {tg && <div className="truncate text-[11px] text-text-mute" title={tg.yol.join(' › ')} data-testid="ish-yol">{tg.yol.join(' › ')}</div>}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="shrink-0 font-mono text-[11px] text-text-mute">{shifrKorinish(i.kod)}</span>
              <span className="min-w-0 truncate text-[13.5px] font-semibold text-text">{i.nom}</span>
              {aosrBelgi}
              {aosrsizId.has(i.id) && <span className="fz-chip fz-chip--warn">{t('yashirin · АОСР yo‘q')}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input aria-label={`F2 hajmi: ${i.nom}`} data-ish-hajm inputMode="decimal" value={k.hajm[i.id] ?? ''} onChange={(e) => yoz('hajm', i.id, e.target.value)} onKeyDown={(e) => hajmKlaviatura(e, i.id)} placeholder={t('hajm')} className={`${kirit} w-24 ${OSH_OGOH.has(x?.ogoh) ? '!border-warn bg-warn/10' : ''}`} />
            <span className="w-10 text-[12px] text-text-mute">{i.birlik}</span>
            {(i.erkin || i.mumkin > 0) && [25, 50, 100].map((f) => <button key={f} type="button" tabIndex={-1} onClick={() => yoz('hajm', i.id, ulushHajm(i.mumkin, f))} className="fz-btn fz-btn--ghost fz-btn--sm">{f}%</button>)}
          </div>
          <span className="w-32 self-center text-right text-[13px] font-semibold tabular-nums text-text">{resSumma ? <FmtN val={resSumma} /> : ''}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pb-2.5 pl-10 text-[12px] text-text-dim">
          <span className="w-56 max-w-full"><IshMeter m={meter} birlik={i.birlik} /></span>
          {meter.oshish != null && <span className="fz-chip fz-chip--warn">{t('smetadan {p}% oshdi', { p: meter.oshish })}</span>}
          <span>{chegaraNom} <b className="text-text"><FmtN val={i.mumkin} /></b></span>
          {i.smeta != null && <span>{t('smeta')} <FmtN val={i.smeta} /></span>}
          {i.olingan > 0 && <span>{t('tasdiqlangan F2')} <FmtN val={i.olingan} /></span>}
          {(i.qoralama ?? 0) > 0 && <span className="text-warn">{t('qoralamada')} <b><FmtN val={i.qoralama ?? 0} /></b></span>}
          {(bn.summa > 0 || bn.narxsiz > 0) && <span className="inline-flex items-center gap-1">{t('narx (1 birlik, NDS siz)')} {birlikNarx}{birlikNarxsiz}</span>}
          <span className="text-text-mute">{t('{n} ta resurs', { n: i.resurslar.length })}</span>
        </div>
        {x?.xato && <div className="px-10 pb-1.5 text-[12px] text-danger">{XATO_MATN[x.xato]}</div>}
        {x?.ogoh && <div className="px-10 pb-1.5 text-[12px] text-warn">{OSH_OGOH.has(x.ogoh) ? t(OGOH_MATN[x.ogoh]) : OGOH_MATN[x.ogoh]}</div>}
        {tkmBirlikmi(i.birlik) && tkmTaklifQator(i)}
        {ochilgan && i.resurslar.length > 0 && (
          <table className="w-full border-t border-border text-[12.5px]">
            <thead><tr className="text-[10.5px] uppercase tracking-wide text-text-mute">
              <th className="py-1 pl-9 pr-2 text-left font-semibold">{t('Resurs')}</th><th className="px-2 text-right font-semibold">{t('Birlik')}</th>
              <th className="px-2 text-right font-semibold">{t('Hajm')}</th><th className="px-2 text-right font-semibold">{t('Narx · manba')}</th>
              <th className="px-2 text-right font-semibold">{t('Summa')}</th><th className="px-2 text-left font-semibold">{t('Holat')}</th>
            </tr></thead>
            <tbody>{i.resurslar.map(resursQatori)}</tbody>
          </table>
        )}
      </div>
    );
  }

  /** Tekshiruvdan o'tish: kerakli qator chizilgach ko'rinishga suriladi. */
  useEffect(() => {
    if (sakrash == null) return;
    const el = moneyScope.current?.querySelector<HTMLElement>(`[data-qator="${sakrash}"]`);
    if (!el) return;
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    el.querySelector<HTMLInputElement>('input:not([disabled]):not([type="checkbox"])')?.focus({ preventScroll: true });
    setSakrash(null);
  }, [sakrash, korinadi, ochiq]);

  const bolimKorinadi = useMemo(() => korinadiganTugunlar(bolimIer, kengaygan, tanlanganBolim, faqatMumkin), [bolimIer, kengaygan, tanlanganBolim, faqatMumkin]);
  const bolimPaneli = bolimlar.length > 0 && <aside className="karta flex max-h-[70vh] min-h-0 flex-col overflow-hidden xl:max-h-none" aria-label={t('Bo‘limlar')}>
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      <span className="fz-panel__h flex-1">{t('Bo‘limlar')}</span>
      <label className="flex items-center gap-1 text-[11.5px] text-text-dim"><input type="checkbox" checked={faqatMumkin} onChange={(e) => setFaqatMumkin(e.target.checked)} />{t('faqat F2 ga olinadiganlar')}</label>
    </div>
    <ul className="min-h-0 flex-1 overflow-auto p-1">
      {bolimKorinadi.map((tg) => { const kalit = tg.kalit; const tanl = kalit === tanlanganBolim && !royxatRejimi; const ochiqmi = kengaygan.has(kalit); const farzand = tg.farzandlar.length > 0; return (
        <li key={kalit} className="flex items-start" style={{ paddingLeft: Math.min(tg.daraja, 5) * 10 }}>
          {farzand ? <button type="button" aria-label={`${ochiqmi ? t('Yopish') : t('Ochish')}: ${tg.nom}`} aria-expanded={ochiqmi} onClick={() => setKengaygan((o) => { const n = new Set(o); if (n.has(kalit)) n.delete(kalit); else n.add(kalit); return n; })} className="mt-1.5 shrink-0 rounded p-0.5 text-text-mute hover:text-text">{ochiqmi ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="w-[17px] shrink-0" />}
          <button type="button" title={tg.yol.join(' › ')} aria-current={tanl ? 'true' : undefined} onClick={() => { setBolimId(kalit); setQidir(''); setKorsatLimit(300); }}
            className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-md border py-1.5 pl-1.5 pr-2 text-left text-[12.5px] ${tanl ? 'border-accent/40 bg-accent/10 text-text' : tg.mumkin > 0 ? 'border-transparent text-text-dim hover:bg-surface-2' : 'border-transparent text-text-mute hover:bg-surface-2'}`}>
            <span className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 break-words">{tg.nom}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-text-mute" title={t('fakt bor / jami')}>{tg.mumkin}/{tg.jami}</span></span>
            {tg.summa > 0 && <SummaJuft obyektId={obyektId} kompaniyaId={joriy?.id} ustamasiz={tg.summa} katKesim={tg.katKesim} kichik />}
          </button></li>); })}
    </ul>
  </aside>;

  const obyektNom = obyektlar.find((o) => o.id === obyektId)?.nom ?? '';
  const olishMatn = royxatRejimi ? t('Topilganlarni to‘liq olish') : t('Bo‘limni to‘liq olish');
  const royxatSarlavha = royxatRejimi
    ? `${faqatKiritilgan && !qidirKech.trim() ? t('Kiritilganlar') : t('Qidiruv')}: ${korinadi.reduce((s, b) => s + b.ishlar.length + b.alohida.length, 0)} ta`
    : null;
  const uchastkaYol = tanlanganTugun && tanlanganTugun.ildizNom !== tanlanganTugun.nom ? <span className="mr-1 font-normal text-text-mute" data-testid="tanlangan-uchastka">{t('Uchastka/fayl')}: {tanlanganTugun.ildizNom} ›</span> : null;
  const bandAmali = (b: TekshiruvBand) => {
    if (b.kod === 'xato_narx' && narxsizlar.length > 0) return <button type="button" onClick={narxsizBelgila} className="fz-btn fz-btn--sm" style={{ height: 'auto', minHeight: 28, whiteSpace: 'normal', padding: '4px 8px', textAlign: 'left' }}>{t('Narxi yo‘q {n} ta resursni «narxsiz» belgilash', { n: narxsizlar.length })}</button>;
    if (b.kod === 'aosr') return <Link to="/admin/aosr" className="fz-btn fz-btn--sm">{t('АОСР yaratish')}</Link>;
    return null;
  };
  const saqlaMatn = aktId != null
    ? (saving ? t('Yangilanmoqda…') : `${t('F2 qoralamani yangilash')} (${qatorlar.length})`)
    : saving ? t('Yaratilmoqda…') : `${t('F2 qoralama yaratish')} (${qatorlar.length})`;
  const holatChip = sanoq.bad > 0
    ? { cls: 'fz-chip--danger', matn: t('{n} ta xato — saqlash yopiq', { n: sanoq.bad }) }
    : sanoq.warn > 0 ? { cls: 'fz-chip--warn', matn: t('{n} ta ogohlantirish', { n: sanoq.warn }) }
    : { cls: 'fz-chip--accent', matn: t('Tekshiruv: toza') };
  const imzoMatn = avto.shartnoma || avto.imzo.zakazchik || avto.imzo.pudratchi
    ? <>{t('Shartnomadan avtomatik')}: <b className="text-text-dim">{[avto.shartnoma, avto.imzo.zakazchik, avto.imzo.pudratchi, avto.imzo.subpudratchi].filter(Boolean).join(' · ')}</b> {t('(panelda qo‘lda yozilgani ustun turadi)')}</>
    : <>{t('Obyekt asosiy shartnomaga biriktirilmagan — imzolovchilarni')} <Link to="/admin/shartnoma-liniya" className="text-accent underline">{t('Shartnoma liniyasi')}</Link>{t('da bog‘lang yoki panelda yozing.')}</>;
  const tahrirHolati = aktXato ? <span className="text-danger">{aktXato}</span>
    : !akt ? <span className="text-text-dim">{t('F2 akti o‘qilmoqda…')}</span>
    : <>
      <b className="text-text">{t('F2 qoralamani tahrirlash')}: № {akt.raqam || '—'} · {akt.oy?.slice(0, 7)} (akt #{akt.id})</b>
      {aktKorish
        ? <span className="text-warn">{t('Bu F2 qoralama emas (tasdiqlangan yoki yuborilgan) - faqat ko‘rish; o‘zgartirib bo‘lmaydi.')}</span>
        : <span className="text-text-dim">{t('Saqlash yangi akt yaratmaydi - shu qoralama yangilanadi (raqami saqlanadi).')}</span>}
    </>;

  return <Sahifa sarlavha="F2 tayyorlash" tavsif="Ishni tanlang — resurslar, narx va summa avtomatik; har narx manbasi ko‘rinadi">
    {korinish.oyna}
    <div ref={moneyScope} className="flex min-h-full flex-col gap-3">
      {validId && <TayyorlanganF2lar kompaniyaId={joriy?.id} obyektId={obyektId} />}
      <section className="fz-card flex flex-wrap items-end gap-3 p-3" aria-label={t('F2 parametrlari')}>
        <label className="min-w-[240px] flex-1 text-[12px] font-medium text-text-dim">{t('Obyekt')}
          <select aria-label={t('Obyekt')} value={validId ? obyektId : ''} onChange={(event) => { const object = obyektlar.find((item) => item.id === Number(event.target.value)); if (workspace.isProvider) workspace.setObjectId(object?.id ?? null); else setParams(object ? { obyekt: String(object.id) } : {}); }} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text">
            <option value="">{t('-- obyektni tanlang --')}</option>{validId && !obyektlar.some((item) => item.id === obyektId) && <option value={obyektId}>{t('Obyekt')} {'#'}{obyektId}</option>}<ObyektOptionlari obyektlar={obyektlar} />
          </select>
        </label>
        <label className="text-[12px] font-medium text-text-dim">{t('Davr')}<input aria-label="F2 davri" type="month" value={oy.slice(0, 7)} onChange={(event) => setOy(`${event.target.value}-01`)} className="mt-1.5 block rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
        <div className="text-[12px] font-medium text-text-dim">
          <label>{t('F2 raqami')}<input aria-label="F2 raqami" value={raqam} disabled={aktId != null} onChange={(e) => setRaqam(e.target.value)} placeholder={raqamTaklif ? t('masalan {r}', { r: raqamTaklif }) : t('masalan 7')} className="mt-1.5 block w-28 rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
          {raqamTaklif && !raqam.trim() && aktId == null && <button type="button" onClick={() => setRaqam(raqamTaklif)} className="fz-btn fz-btn--ghost fz-btn--sm mt-1" title={t('Shu obyektdagi eng katta F2 raqamidan keyingisi')}><Sparkles aria-hidden="true" />{t('Keyingi: № {r}', { r: raqamTaklif })}</button>}
        </div>
        {validId && !loading && holat.length > 0 && <div role="group" aria-label={t('Hajm manbai')} className="text-[12px] font-medium text-text-dim">{t('Hajm manbai')}
          <div className="mt-1.5 flex overflow-hidden rounded-lg border border-border">{(['fakt', 'smeta'] as const).map((m) => <button key={m} type="button" aria-pressed={manba === m} onClick={() => { setManbaTanlov(m); setK(bosKiritma()); }}
            className={`px-3 py-2 ${manba === m ? 'bg-accent/15 font-semibold text-text' : 'bg-surface-2 text-text-dim hover:text-text'}`}>{m === 'fakt' ? t('Fakt') : t('Smeta qoldig‘i')}</button>)}</div></div>}
        {validId && bolimlar.length > 0 && <label className="relative min-w-[200px] flex-1 text-[12px] font-medium text-text-dim">{t('Qidirish')}
          <Search size={14} className="pointer-events-none absolute bottom-2.5 left-2.5 text-text-mute" />
          <input aria-label="Qidirish" value={qidir} onChange={(e) => setQidir(e.target.value)} placeholder={t('ish, resurs, kod…')} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-text" /></label>}
        {validId && bolimlar.length > 0 && <label className="flex items-center gap-1.5 pb-2.5 text-[12px] text-text-dim"><input type="checkbox" checked={faqatKiritilgan} onChange={(e) => setFaqatKiritilgan(e.target.checked)} />{t('Faqat kiritilganlar')}</label>}
      </section>
      {validId && aktId != null && <section role="status" aria-label={t('F2 qoralamani tahrirlash')} className={`fz-note ${aktXato || aktKorish ? 'fz-note--warn' : 'fz-note--info'} flex-wrap`} style={{ alignItems: 'center' }}>
        {tahrirHolati}
        <Link className="ml-auto text-accent underline" to={`/admin/f2-tayyorlash?obyekt=${obyektId}`}>{t('Yangi F2 tayyorlash')}</Link>
      </section>}
      {!validId && <section className="fz-card p-4 text-text-dim">{t('Avval obyektni tanlang.')}</section>}
      {error && validId && <section role="alert" className="fz-note fz-note--danger" style={{ alignItems: 'center' }}><AlertTriangle /><span className="flex-1">{t(error)}</span><button type="button" onClick={() => void yuklash()} className="fz-btn fz-btn--danger fz-btn--sm">{t('Qayta urinib ko‘rish')}</button></section>}
      {loading && <div className="skel min-h-[260px] flex-1 rounded-xl" />}
      {validId && !loading && !error && bolimlar.length === 0 && <section className="fz-card p-8 text-center text-text-dim">{t('F2 ga olish mumkin bo‘lgan fakt qoldig‘i yo‘q — avval Fakt jurnalida bajarilgan ishni kiriting.')}</section>}
      {validId && !loading && !error && bolimlar.length > 0 && <>
        <F2QoralamaSarlavha raqam={aktId != null ? (akt?.raqam ?? raqam) : raqam} muhr={aktKorish ? 'locked' : aktId != null ? 'edit' : 'draft'} davr={davrNomi(oy, tilLocale())} obyekt={obyektNom} manba={manba}
          shartnoma={avto.shartnoma} ishSoni={jami.ish} qatorSoni={jami.qator}
          jami={<SummaJuft obyektId={obyektId} kompaniyaId={joriy?.id} ustamasiz={qatorlar.length ? jami.summa : null} katKesim={katKesim} className="items-end text-right [&_[data-testid=summa-ustamali]]:text-[20px] [&_[data-testid=summa-ustamali]]:font-semibold" />} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] xl:h-[calc(100vh-13rem)] xl:min-h-[30rem] xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
          {bolimPaneli}
          <section className="karta flex max-h-[78vh] min-h-0 flex-col overflow-hidden xl:max-h-none" aria-label={t('F2 ishlari')}>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold text-text">{royxatSarlavha ?? (tanlanganTugun ? <>{uchastkaYol}{tanlanganTugun.nom}</> : korinadi[0]?.nom)}</span>
                <MeterIzohi />
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => bolimniOl(korinadi)} className="fz-btn fz-btn--sm"><Zap aria-hidden="true" />{olishMatn}</button>
                <button type="button" onClick={() => bolimniOl(bolimlar)} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Barcha mumkin hajmni olish')}</button>
                {Object.keys(k.hajm).length > 0 && <button type="button" onClick={() => setK(bosKiritma())} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Tozalash')}</button>}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {(() => { let qolgan = korsatLimit; return korinadi.map((b) => { const kes = b.ishlar.slice(0, Math.max(0, qolgan)); qolgan -= kes.length; return <div key={b.id ?? 'yoq'} className="space-y-2">
                {royxatRejimi && <div className="fz-panel__h pt-1">{b.nom}</div>}
                {kes.map(ishKartasi)}
                {b.alohida.length > 0 && <div className="rounded-lg border border-border"><div className="px-3 py-1.5 text-[12px] font-semibold text-text-dim">{t('Alohida materiallar')}</div><table className="w-full text-[12.5px]"><tbody>{b.alohida.map(resursQatori)}</tbody></table></div>}
              </div>; }); })()}
              {korinadi.reduce((s, b) => s + b.ishlar.length, 0) > korsatLimit && <button type="button" onClick={() => setKorsatLimit((n) => n + 500)} className="fz-btn w-full">{t('Yana ko‘rsatish')}</button>}
            </div>
          </section>
          <div className="order-first grid min-h-0 content-start gap-3 lg:col-span-2 lg:grid-cols-2 xl:order-none xl:col-span-1 xl:grid-cols-1 xl:overflow-auto">
            <F2TekshiruvPanel bandlar={bandlar} onOtish={qatorgaOtish} amal={bandAmali} obyektId={obyektId} yangilaHref={(id) => `/admin/f2-tayyorlash?obyekt=${obyektId}&akt=${id}`} />
            <F2KatPanel kat={katTaq} manba={jami.manba} />
          </div>
        </div>
        <section className="flex flex-wrap items-start gap-3"><div className="min-w-[280px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} />
          <p className="mt-1 text-[12px] text-text-mute">{imzoMatn}</p></div>
          <label className="text-[12px] text-text-dim">{t('QQS (НДС), % — hujjat oxirida')}<input aria-label="QQS stavkasi" value={ndsFoiz} onChange={(event) => setNdsFoiz(event.target.value)} placeholder={t('bo‘sh — QQS yo‘q')} inputMode="decimal" className="ml-2 w-32 rounded border border-border bg-bg px-2 py-1" /></label></section>
        {vedomostOchiq && <section aria-label={t('Resurs vedomosti')} className="karta max-h-[40vh] overflow-auto"><F2ResursVedomosti qatorlar={qatorlar} kodOl={resursKodi} obyektId={obyektId} kompaniyaId={joriy?.id} onQollash={narxniQollash} /></section>}
        <section aria-label="F2 jami" className="fz-card sticky bottom-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5" style={{ boxShadow: 'var(--shadow-pop)', overflow: 'visible' }}>
          <div className="flex flex-col text-[12px] leading-tight text-text-dim">
            <span>{t('Tanlangan qatorlar')}: <b className="text-text">{jami.qator}</b></span>
            <span className="text-text-mute">{t('{n} ta ish', { n: jami.ish })}</span>
          </div>
          <button type="button" onClick={tekshiruvgaOtish} className={`fz-chip ${holatChip.cls} cursor-pointer`} style={{ height: 24, border: 0 }} title={t('Tekshiruv')}>{holatChip.matn}</button>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex flex-col items-end"><small className="text-[11px] font-semibold uppercase tracking-wide text-text-mute">{t('Jami')}</small>
              <SummaJuft obyektId={obyektId} kompaniyaId={joriy?.id} ustamasiz={qatorlar.length ? jami.summa : null} katKesim={katKesim} className="items-end text-right" /></div>
            <div role="group" aria-label={t('Qo‘shimcha amallar')} className="flex items-center gap-1 border-l border-border pl-3">
              <button type="button" aria-pressed={vedomostOchiq} disabled={qatorlar.length === 0} onClick={() => setVedomostOchiq((o) => !o)} className={`fz-btn fz-btn--sm ${vedomostOchiq ? '' : 'fz-btn--ghost'}`}>{t('Resurs vedomosti')}</button>
              <Link to={`/admin/f2-tarix?obyekt=${obyektId}`} className="fz-btn fz-btn--ghost fz-btn--sm">{t('F2 tarixi')}</Link>
              <button type="button" onClick={() => void excelYuklash(false)} disabled={!tayyor || saving} className="fz-btn fz-btn--ghost fz-btn--sm"><Download aria-hidden="true" />{t('Excel')}</button>
              <button type="button" onClick={() => void excelYuklash(true)} disabled={!tayyor || saving} aria-label="Forma-2 qoralama ko‘rish" title={t('Forma-2 qoralama ko‘rish')} className="fz-btn fz-btn--ghost fz-btn--sm fz-btn--icon"><Eye aria-hidden="true" /></button>
            </div>
            <button type="button" onClick={() => void saqlash()} disabled={!saqlashMumkin || saving} className="fz-btn fz-btn--primary"><Save aria-hidden="true" />{saqlaMatn}<kbd className="fz-kbd" aria-hidden="true">{'Ctrl+Enter'}</kbd></button>
          </div>
        </section>
        {joriy?.id && !aktKorish && <F2AiYordamchi kompaniyaId={joriy.id} obyektId={obyektId}
          malumot={{ obyektNomi: obyektlar.find((o) => o.id === obyektId)?.nom, oy, manba, ndsFoiz: ndsFoiz.trim() === '' || !Number.isFinite(Number(ndsFoiz.replace(',', '.'))) ? null : Number(ndsFoiz.replace(',', '.')),
            bolimlar, ier: bolimIer, qatorBolim, qatorlar, jami, katKesim, uchastkalar, k }}
          amallar={{ hajm: (id, v) => yoz('hajm', id, v), narx: (id, v) => { yoz('narxsiz', id, undefined); yoz('narx', id, v); }, narxsiz: (id) => { yoz('narx', id, undefined); yoz('narxsiz', id, true); },
            bolimniOl, korsat: (nom) => setQidir(nom) }} />}
      </>}
    </div>
  </Sahifa>;
}

export default F2TayyorlashNative;
