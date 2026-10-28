import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Ban, CheckCircle2, ChevronDown, ChevronRight, Cpu, MinusCircle, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Repeat2, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import { chiqarilganmi, chiqarishRuxsat, MEHNAT_ZAMENA_YOQ, mehnatResursmi } from '../../lib/resurs-amal';
import { ResursChiqarishModal, type ChiqarishQator } from './ResursChiqarishModal';
import { sbT2ZamenaAlmashtirishBelgila } from '../../api/t2-additional-replacement';
import { bajarilmadiBekor, bajarilmadiRoyxatOl, bajarilmadiXato, type BajarilmadiQator } from '../../api/t2-bajarilmadi';
import { bajarilmadiHajmlar, faktYigindiHisobla, narxlashMumkin } from '../../lib/fakt-studio';
import { FaktNarxlash, type NarxlashQator } from './FaktNarxlash';
import { FaktBajarilmadiTez, type BajarilmadiQatorInfo } from './FaktBajarilmadiTez';
import { FaktStudioBar } from './FaktStudioBar';
import { FaktAiYordamchi } from './FaktAiYordamchi';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from '../../lib/ustamali-summa';
import { yangiOperationId, type T2Qator } from '../../api/supabase';
import { sbFaktYoz } from '../../api/t2-fakt';
import { bolimIshlariYigish, faktF2Bekor, faktF2Reja, obyektF2Reja, type TenglashKontekst, type TenglashOyna } from '../../lib/fakt-f2-tenglash';
import { sbF2TasdiqNarxlar } from '../../api/t2-f2-narx';
import { FaktF2Tenglash } from './FaktF2Tenglash';
import { FaktQamrov } from './FaktQamrov';
import { faktQamrovBekor } from '../../lib/fakt-qamrov';
import { t } from '../../i18n/til';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { sarlavhaBilan } from '../../lib/hotkeys/core';
import { JURNAL_XATO_MATN, bolimSummalari, bolimTarkibi, jurnalPaket, jurnalQur, ochiqBor, qoldiqUlushi, sonOqi, type BolimSumma, type JurnalBolim, type JurnalHolat, type JurnalIsh, type JurnalQator, type Kiritma, type Rejim, type ZamenaBoglanish } from '../../lib/fakt-jurnal';
import { zamenaBoglanishOl } from '../../lib/fakt-zamena-boglanish';
import { almashtirildiMatn, ochiqdanOrtiqcha, ochiqQoldiq } from '../../lib/zamena-qoldiq';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { ishMateriallari, materialTaklifi } from '../../lib/fakt-material-taklif';
import { toast } from '../../umumiy/ui/Toast';
import { IshAbcModal, type AbcRejim, type AbcTahrir } from './IshAbcModal';
import { abcXato, ishAbcOchir, type NarxManba } from '../../api/t2-ish-abc';
import { katAniqla, type AbcResurs } from '../../lib/ish-abc';
import { HOLAT_MUHR, f2OlishMumkin, faktMeter, jurnalXulosa, obyektUlushi as obyektUlushiHisobla } from '../../lib/fakt-korinish';
import { BolimMeter, FaktXulosaPanel, HolatMuhr, MeterLegenda, QatorMeter } from '../../components/fakt/FaktKorinish';
import type { Daraxt, Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import { useJadvalFiltr } from '../../umumiy/jadval-filtr/useJadvalFiltr';
import { FiltrHolatQatori, UstunFiltrTugma } from '../../umumiy/jadval-filtr/UstunFiltrTugma';
import { FAKT_DARAXT, faktFiltrQatorlar, faktFiltrQoll, type FaktFiltrQator } from './FaktJadvalFiltr';

const MANBALAR: readonly NarxManba[] = ['smeta_obyekt', 'smeta_shartnoma', 'smeta', 'katalog', 'qolda'];

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));

/**
 * Fakt jurnali: chapda bo'limlar (bajarilish foizi), o'ngda tanlangan bo'lim ishlari (resurslari
 * bilan). Har qatorda "+" (bugun) yoki "=" (jami), 25/50/100% tezkor tugmalar; pastda doimiy
 * saqlash paneli — barcha o'zgarishlar BITTA tranzaksiyada (Ctrl+S). Klaviatura: Enter/↓ keyingi,
 * ↑ oldingi, Esc tozalash, "/" qidiruv.
 */
export type SaqlashNatija = Promise<boolean>;
export type SaqlashFn = () => SaqlashNatija;
type SaqlashVaqda = SaqlashNatija | null;
export function FaktJurnal({ kompaniyaId, obyektId, rows, states, holatniYangila, tuzilmaniYangila, saqlashRef, f2Otish, boshBolimId = null, boshFaktsizF2 = false }: {
  kompaniyaId: number; obyektId: number;
  /** Boshlang'ich bo'lim (masalan pereraschet ekranidan havola: `?bolim=`). */
  boshBolimId?: number | null;
  /** Boshlang'ich filtr «fakti yo'q, lekin F2 olingan» (pereraschet ekranidan havola: `?filtr=faktsiz_f2`). */
  boshFaktsizF2?: boolean;
  /** Yig'indi paneli «F2 tayyorlash» tugmasi: sahifa avval saqlaydi, so'ng F2 tayyorlashga o'tadi. */
  f2Otish?: (oy: string) => void;
  /** Tashqi sahifa (F2 tayyorlashga o'tish) saqlanmagan kiritmalarni saqlab, natijasini kutishi uchun. */
  saqlashRef?: { current: SaqlashFn | null };
  rows: readonly T2Qator[]; states: readonly JurnalHolat[];
  /** Faqat fakt/F2 holatini qayta o'qish (tez). */
  holatniYangila: () => Promise<void> | void;
  /** Qator qo'shilganda (zamena/qo'shimcha) — to'liq qayta o'qish. */
  tuzilmaniYangila: () => Promise<void> | void;
}) {
  const [sana, setSana] = useState(() => new Date().toISOString().slice(0, 10));
  /* Bo'limlar paneli (egasi 2026-10-27): noutbukda standart yopiq — jadvalga joy; chap chetdagi keng tugma bilan ochiladi.
   * Foydalanuvchi tanlovi shu brauzerda eslab qolinadi. */
  const [panelOchiq, setPanelOchiq] = useState(() => {
    try { const v = localStorage.getItem('fakt:bolim-panel'); if (v) return v === 'ochiq'; } catch { /* saqlanmagan */ }
    return typeof window === 'undefined' || window.innerWidth >= 1600;
  });
  const panelAlmashtir = () => setPanelOchiq((v) => { try { localStorage.setItem('fakt:bolim-panel', v ? 'yopiq' : 'ochiq'); } catch { /* saqlanmasa ham ishlaydi */ } return !v; });
  const [kiritmalar, setKiritmalar] = useState<Record<number, Kiritma>>({});
  const [bolimId, setBolimId] = useState<number | null>(boshBolimId);
  const [qidiruv, setQidiruv] = useState('');
  const [faqatQoldiq, setFaqatQoldiq] = useState(false);
  const [faktsizF2, setFaktsizF2] = useState(boshFaktsizF2);
  /** Ish resurslarini ochish/yopish: `hammaYopiq` — umumiy holat, `teskari` — undan farq qiladigan ishlar. */
  const [hammaYopiq, setHammaYopiq] = useState(false);
  const [teskari, setTeskari] = useState<Set<number>>(new Set());
  const ishOchiq = (id: number) => (hammaYopiq ? teskari.has(id) : !teskari.has(id));
  const ishAlmashtir = (id: number) => setTeskari((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [yopiqBolim, setYopiqBolim] = useState<Set<number>>(new Set());
  const [band, setBand] = useState(false);
  const [saqlangan, setSaqlangan] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<{ rejim: AbcRejim; tahrir?: AbcTahrir | null; normativId?: string | null } | null>(null);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  /**
   * Zamena qator TURIGA qarab (egasi 2026-10-25: «resurs zamenasi ish zamenasiga o'tib ketyapti»):
   * ish (bl) — ish zamenasi; har qanday resurs (rs/mat/ob, ish ichida yoki alohida) — resurs zamenasi.
   * Resurs normasi ota ISH hajmiga ko'paytiriladi (server bilan bir xil: ota t2_qator.hajm); ota ish bo'lmasa — aniq hajm.
   */
  const zamenaOch = (q: JurnalQator, normativId: string | null = null) => {
    if (q.tur === 'bl') { setModal({ rejim: { tur: 'replacement', eski: { id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, otaId: q.otaId, otaVersiya: q.otaVersiya, hajm: q.smeta } }, normativId }); return; }
    // Egasi 2026-10-27: ishchi mehnati (ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ) zamena qilinmaydi (AI yordamchi orqali ham).
    if (mehnatResursmi(q)) { toast(t(MEHNAT_ZAMENA_YOQ), 'warn'); return; }
    const ota = q.otaId != null ? rowById.get(q.otaId) : undefined;
    const ishmi = ota?.tur === 'bl';
    setModal({ rejim: { tur: 'resurs_zamena',
      eski: { id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, kat: q.kat ?? katAniqla(null, q.tur, q.birlik), norma: q.norma, hajm: q.smeta, ishNom: ishmi ? [ota.kod, ota.nom].filter(Boolean).join(' ') || null : null },
      ishHajm: ishmi && ota.hajm != null ? Number(ota.hajm) : null } });
  };

  /** Resurs zamenasi birligi farqli bo'lsa: «aslning qancha hajmini almashtiradi» (mavjud RPC t2_zamena_almashtirish_belgila_v1). */
  const zamenaMiqdorBelgila = (qatorId: number, hajm: number) => sbT2ZamenaAlmashtirishBelgila({ kompaniyaId, qatorId, hajm });

  // ── Qo'shilgan ish/zamena: TAHRIRLASH va O'CHIRISH (asliga qaytarish). Smeta qatorlari — o'zgarmas. ──
  const resursPrefill = (c: T2Qator): AbcResurs => {
    const norma = Number((c as T2Qator & { norma?: number | null }).norma ?? 0);
    const usul = String(c.narx_usul ?? '').toLowerCase() as NarxManba;
    return { kat: katAniqla(c.kat, c.tur, c.birlik), kod: c.kod ?? '', nom: c.nom ?? '', birlik: c.birlik ?? '',
      norma: norma > 0 ? String(norma) : '', hajm: norma > 0 ? '' : String(c.hajm ?? ''),
      narx: c.narx ? String(c.narx) : '', manba: MANBALAR.includes(usul) ? usul : 'qolda' };
  };
  const tahrirOch = (q: JurnalQator) => {
    const r = rowById.get(q.id); if (!r) return;
    if (r.tur === 'bl') {
      const bolalar = rows.filter((c) => c.ota_id === r.id && (c.tur === 'rs' || c.tur === 'mat' || c.tur === 'ob'));
      const fakt = faktlar.get(r.id) ?? 0;
      setModal({
        rejim: q.zamena ? { tur: 'replacement', eski: { id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, otaId: q.otaId, otaVersiya: q.otaVersiya } } : { tur: 'additional' },
        tahrir: { qatorId: r.id, ish: { kod: r.kod ?? '', nom: r.nom ?? '', birlik: r.birlik ?? '', hajm: String(r.hajm ?? '') }, resurslar: bolalar.map(resursPrefill), fakt: fakt > 0 ? String(fakt) : '' },
      });
    } else if (q.zamena) {
      const ota = r.ota_id != null ? rowById.get(r.ota_id) : undefined;
      setModal({ rejim: { tur: 'resurs_zamena', eski: { id: r.id, kod: r.kod, nom: r.nom ?? '', birlik: r.birlik, kat: r.kat, norma: q.norma, hajm: q.smeta, ishNom: ota?.tur === 'bl' ? [ota.kod, ota.nom].filter(Boolean).join(' ') || null : null }, ishHajm: ota?.tur === 'bl' ? ota.hajm ?? null : null },
        tahrir: { qatorId: r.id, resurslar: [resursPrefill(r)] } });
    } else toast('Bu resurs qo‘shilgan ish ichida — ishning o‘zini tahrirlang.', 'warn');
  };
  const ochir = async (q: JurnalQator) => {
    const sabab = window.prompt(`«${q.nom}» o‘chirilsinmi? ${q.zamena ? 'Asl qator qaytadi.' : 'Ish va uning resurslari, fakti o‘chiriladi (arxivda qoladi).'}\nSabab (ixtiyoriy):`, '');
    if (sabab === null) return;
    const r = await ishAbcOchir({ kompaniyaId, obyektId, qatorId: q.id, sabab: sabab || undefined, operationId: yangiOperationId() });
    if (!r.ok) { toast(abcXato(r), 'danger'); return; }
    toast(q.zamena ? 'Zamena bekor qilindi — asl qator qaytdi.' : `O‘chirildi: ${r.ochirildi ?? 1} ta qator.`, 'ok');
    await tuzilmaniYangila();
  };
  // «Bajarilmaydi» qatlami (smeta o'zgarmaydi): ro'yxat, qator bo'yicha belgilangan hajm, yig'indi paneli.
  const [bajarilmadi, setBajarilmadi] = useState<BajarilmadiQator[]>([]);
  const [bajModal, setBajModal] = useState<BajarilmadiQatorInfo | null>(null);
  const bajYangila = useCallback(async () => { const r = await bajarilmadiRoyxatOl(kompaniyaId, obyektId).catch(() => null); if (r?.ok) setBajarilmadi(r.qatorlar); }, [kompaniyaId, obyektId]);
  useEffect(() => { void bajYangila(); }, [bajYangila]);
  const bajHajm = useMemo(() => bajarilmadiHajmlar(bajarilmadi), [bajarilmadi]);
  /** Resurs ishdan chiqarilganmi (faol «bajarilmaydi» butun smeta hajmini qoplaydi) — F2 ga kirmaydi. */
  const chiq = (q: Pick<JurnalQator, 'id' | 'smeta'>) => chiqarilganmi(q.smeta, bajHajm.get(q.id));
  const [chiqModal, setChiqModal] = useState<ChiqarishQator | null>(null);
  const yigindi = useMemo(() => faktYigindiHisobla(rows, states, bajarilmadi), [rows, states, bajarilmadi]);
  const [narxModal, setNarxModal] = useState<NarxlashQator | null>(null);
  const qatorlarRef = useRef(new Map<number, JurnalQator>());
  const bajBekor = async (qatorId: number, nom: string) => {
    const faol = bajarilmadi.filter((b) => b.qator_id === qatorId && b.holat === 'faol').sort((a, b) => b.id - a.id)[0];
    if (!faol) return;
    if (!await tasdiqSora(t('«{nom}»: «bajarilmaydi» belgisi ({hajm}) bekor qilinsinmi?', { nom, hajm: fmt(faol.bajarilmagan_hajm) }))) return;
    const r = await bajarilmadiBekor({ kompaniyaId, id: faol.id, operationId: yangiOperationId() }).catch(() => null);
    if (!r?.ok) { toast(r ? t(bajarilmadiXato(r)) : t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); return; }
    toast(t('Belgi bekor qilindi.'), 'ok'); await bajYangila();
  };
  const bajOch = (q: JurnalQator, boshlangichHajm: number | null = null) => setBajModal({ id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, smeta: q.smeta, fakt: q.fakt, belgilangan: bajHajm.get(q.id) ?? 0, almashtirilgan: q.almashtirilgan, boshlangichHajm });
  const operationId = useRef(yangiOperationId());
  const inputlar = useRef<Array<HTMLInputElement | null>>([]);
  const qidiruvRef = useRef<HTMLInputElement | null>(null);

  // Zamena → asl bog'lanishi va asl qatorning «almashtirildi» hajmi (ixtiyoriy; xato bo'lsa belgilar chiqmaydi).
  const [zb, setZb] = useState<ZamenaBoglanish | null>(null);
  const zamenaBor = useMemo(() => rows.some((r) => r.zamena), [rows]);
  useEffect(() => {
    if (!zamenaBor) { setZb(null); return; }
    let tirik = true;
    void zamenaBoglanishOl(obyektId).then((z) => { if (tirik) setZb(z); }).catch(() => undefined);
    return () => { tirik = false; };
  }, [obyektId, zamenaBor, rows, states]);
  const { bolimlar, bolimIshlari, ildizIshlari } = useMemo(() => jurnalQur(rows, states, zb, bajHajm), [rows, states, zb, bajHajm]);
  /** Ishdan chiqarilgan resurslar to'plami — bo'lim/obyekt fakt jamisiga qo'shilmaydi. */
  const chiqarilganlar = useMemo(() => {
    const sm = new Map(states.map((s) => [s.qator_id, s.smeta_hajm]));
    const s = new Set<number>();
    for (const r of rows) if ((r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob') && bajHajm.has(r.id) && chiqarilganmi(sm.get(r.id) ?? r.hajm, bajHajm.get(r.id))) s.add(r.id);
    return s;
  }, [rows, states, bajHajm]);
  const summalar = useMemo(() => bolimSummalari(rows, states, chiqarilganlar), [rows, states, chiqarilganlar]);
  // Ishdan KEYIN turgan alohida materiallar (ota = bo'lim) — ish ulushida fakt TAKLIFI (avtomatik yozilmaydi).
  // Ish ichidagi mat/ob bolalari va ishdan keyingi alohida mat/ob — ish ulushida TAKLIF (ergashish qoidasi; avtomatik yozilmaydi).
  const keyingiMat = useMemo(() => ishMateriallari(rows), [rows]);
  const matIshi = useMemo(() => { const m = new Map<number, number>(); for (const [ish, ms] of keyingiMat) for (const x of ms) m.set(x, ish); return m; }, [keyingiMat]);
  const jurnalById = useMemo(() => { const m = new Map<number, JurnalQator>(); for (const arr of bolimIshlari.values()) for (const x of arr) m.set(x.id, x); return m; }, [bolimIshlari]);
  /** Barcha jurnal qatorlari (ishlar va ularning resurslari). */
  const barchaById = useMemo(() => { const m = new Map<number, JurnalQator>(); for (const arr of bolimIshlari.values()) for (const x of arr) { m.set(x.id, x); for (const r of x.resurslar) m.set(r.id, r); } return m; }, [bolimIshlari]);
  const faktlar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, Number(x.fakt_hajm ?? 0)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? 0])); }, [rows, states]);
  useEffect(() => { if (bolimId == null && bolimlar.length) setBolimId(bolimlar[0].id); }, [bolimId, bolimlar]);

  const smetalar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, x.smeta_hajm == null ? null : Number(x.smeta_hajm)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? (r.hajm == null ? null : Number(r.hajm))])); }, [rows, states]);
  const paket = useMemo(() => jurnalPaket(kiritmalar, faktlar, smetalar), [kiritmalar, faktlar, smetalar]);
  const ozgarishSoni = Object.values(kiritmalar).filter((k) => k.qiymat.trim()).length;

  // ── «Fakt = F2»: F2 hajmi fakt dan ko'p bo'lgan ishlarga farqni yozish (oldindan ko'rish + bekor qilish). ──
  const [tenglash, setTenglash] = useState<TenglashOyna | null>(null);
  const holatMap = useMemo(() => new Map(states.map((s) => [s.qator_id, s])), [states]);
  /** Ustamali summa (egasi 2026-10-24): resurs kat'i smeta qatoridan (t2_qator.kat) - M/K, КАБ, БЕЗ СКЛАД ham aniq; ish (bl) o'z narxiga ega emas - resurslar yig'indisi. */
  const taxminKesim = (q: JurnalQator): { fakt: KatKesim; smeta: KatKesim; faktSumma: number; smetaSumma: number } | null => {
    const sm = (x: JurnalQator) => Number(holatMap.get(x.id)?.smeta_summa ?? 0);
    const bolalar = 'resurslar' in q ? [...(q as JurnalIsh).resurslar, ...(q as JurnalIsh).avtomatik] : [];
    const qismlar = q.tur === 'bl' ? bolalar : [q];
    const asos = qismlar.reduce((s, x) => s + sm(x), 0);
    if (!(asos > 0) || q.ulush == null) return null;
    const fakt = bosKatKesim(), smeta = bosKatKesim();
    // Ishdan chiqarilgan resurs (F2 ga kirmaydi) fakt summasiga qo'shilmaydi; smeta summasi o'zgarmaydi (asl smeta CONST).
    let faktAsos = 0;
    for (const x of qismlar) { const kat = rowById.get(x.id)?.kat; katKesimgaQosh(smeta, kat, sm(x)); if (q.tur === 'bl' && chiq(x)) continue; katKesimgaQosh(fakt, kat, sm(x) * q.ulush); faktAsos += sm(x); }
    return { fakt, smeta, faktSumma: faktAsos * q.ulush, smetaSumma: asos };
  };
  const bolimBolalari = useMemo(() => { const m = new Map<number, number[]>(); for (const b of bolimlar) if (b.otaId != null) m.set(b.otaId, [...(m.get(b.otaId) ?? []), b.id]); return m; }, [bolimlar]);
  const kiritmaOgoh = () => { if (ozgarishSoni) toast(t('Saqlanmagan kiritmalar bor — qamrov serverdagi faktdan hisoblanadi; avval saqlang yoki tozalang.'), 'warn'); };
  /**
   * «Fakt = F2» konteksti: tasdiqlangan F2 qatorlari narxi (egasi 2026-10-28 — fakt F2 narxi bilan yoziladi) va smeta narxi.
   * F2 narxlari yuklanmasa oyna OCHILMAYDI: aks holda ko'rilgan summa yoziladigandan farq qilardi.
   */
  const [tenglashYuk, setTenglashYuk] = useState(false);
  const tenglashKontekst = async (): Promise<TenglashKontekst | null> => {
    setTenglashYuk(true);
    try {
      const r = await sbF2TasdiqNarxlar(obyektId);
      if (!r.ok) { toast(t('F2 narxlari yuklanmadi — «Fakt = F2» ochilmadi. Qayta urinib ko‘ring.'), 'danger'); return null; }
      return { f2Narx: r.narxlar, smetaNarx: (id) => narxOl(id) };
    } finally { setTenglashYuk(false); }
  };
  const tenglashOch = async (sarlavha: string, ishlar: JurnalIsh[]) => {
    if (tenglashYuk) return;
    kiritmaOgoh();
    const ktx = await tenglashKontekst(); if (!ktx) return;
    setTenglash({ sarlavha, reja: faktF2Reja(ishlar, holatMap, null, ktx) });
  };
  /** «Fakt = F2» BUTUN OBYEKT bo'yicha: har bo'limning o'z ishlari (har ish bir marta) + bo'limsiz ishlar; oldindan ko'rishda bo'lim jamisi. */
  const tenglashObyekt = async () => {
    if (tenglashYuk) return;
    kiritmaOgoh();
    const ktx = await tenglashKontekst(); if (!ktx) return;
    const guruhlar = [...bolimlar.map((b) => ({ nom: b.nom, ishlar: bolimIshlari.get(b.id) ?? [] })), { nom: t('Bo‘limsiz'), ishlar: ildizIshlari }];
    setTenglash({ sarlavha: t('Butun obyekt (barcha bo‘limlar)'), reja: obyektF2Reja(guruhlar, holatMap, ktx) });
  };

  // ── «Qamrov %» (Tiklash rejimi): bo'lim (avlodlari bilan) yoki ish → foiz × ochiq qoldiq; oldindan ko'rish + bitta tranzaksiya + bekor qilish. ──
  const [qamrov, setQamrov] = useState<{ sarlavha: string; ishlar: JurnalIsh[] } | null>(null);
  const qamrovBolim = (b: JurnalBolim) => { kiritmaOgoh(); setQamrov({ sarlavha: b.nom, ishlar: bolimIshlariYigish(b.id, bolimIshlari, bolimBolalari, true) }); };
  const qamrovIsh = (ish: JurnalIsh) => { kiritmaOgoh(); setQamrov({ sarlavha: [ish.kod, ish.nom].filter(Boolean).join(' '), ishlar: [ish] }); };
  const narxOl = useCallback((id: number): number | null => {
    const h = holatMap.get(id); const r = rowById.get(id);
    return h?.smeta_narx != null ? Number(h.smeta_narx) : r?.narx != null ? Number(r.narx) : null;
  }, [holatMap, rowById]);

  // Ko'rinadigan bo'laklar: qidiruv bo'lsa — butun obyekt bo'yicha (har ish o'z bo'lim yo'li bilan);
  // aks holda tanlangan bo'lim va uning BARCHA avlod bo'limlari (egasi 2026-10-25: «ichi bo'sh» chiqmasin).
  type Bolak = { bolim: JurnalBolim | null; nisbiy: number; yol?: string; ishlar: JurnalIsh[] };
  const korinadiAsos = useMemo((): Bolak[] => {
    const q = qidiruv.trim().toLowerCase();
    const mos = (x: JurnalQator) => `${x.kod ?? ''} ${x.nom}`.toLowerCase().includes(q);
    // «Fakti yo'q, lekin F2 olingan» (pereraschet → fakt jurnali): tasdiqlangan F2 bor, fakt 0.
    const faktsiz = (x: JurnalQator) => { const h = holatMap.get(x.id); return Number(h?.f2_hajm ?? 0) > 1e-9 && !(Number(h?.fakt_hajm ?? 0) > 1e-9); };
    const filtr = (ish: JurnalIsh) => (!faqatQoldiq || ochiqBor(ish) || ish.resurslar.some(ochiqBor))
      && (!faktsizF2 || faktsiz(ish) || ish.resurslar.some(faktsiz) || ish.avtomatik.some(faktsiz))
      && (!q || mos(ish) || ish.resurslar.some(mos) || ish.avtomatik.some(mos));
    if (q || faktsizF2) {
      const out: Bolak[] = []; let n = 0;
      for (const b of bolimlar) {
        if (n >= 200) break;
        const ishlar = (bolimIshlari.get(b.id) ?? []).filter(filtr).slice(0, 200 - n);
        if (ishlar.length) { out.push({ bolim: null, nisbiy: 0, yol: b.nom, ishlar }); n += ishlar.length; }
      }
      return out;
    }
    if (bolimId == null) return [];
    const tarkib = bolimTarkibi(bolimId, bolimlar, bolimIshlari).map((x) => ({ ...x, ishlar: x.ishlar.filter(filtr) }));
    // Filtrdan keyin bo'sh qolgan shoxlar tashlanadi (ishli avlodi bor bo'lim sarlavhasi qoladi).
    const toliq = new Set<number>();
    for (let i = tarkib.length - 1; i >= 0; i--) { const x = tarkib[i]; if (x.ishlar.length || toliq.has(x.bolim.id)) { toliq.add(x.bolim.id); if (x.bolim.otaId != null) toliq.add(x.bolim.otaId); } }
    return tarkib.filter((x) => x.nisbiy === 0 || toliq.has(x.bolim.id)).map((x) => ({ bolim: x.nisbiy === 0 ? null : x.bolim, nisbiy: x.nisbiy, ishlar: x.ishlar }));
  }, [qidiruv, faqatQoldiq, faktsizF2, holatMap, bolimId, bolimlar, bolimIshlari]);

  const kirit = (id: number, patch: Partial<Kiritma>) => setKiritmalar((o) => {
    const eski = o[id] ?? { rejim: '+' as Rejim, qiymat: '' };
    const yangi = { ...eski, ...patch };
    const n = { ...o };
    if (!yangi.qiymat.trim() && patch.rejim == null) delete n[id]; else n[id] = yangi;
    return n;
  });

  /** Qatorning (kiritma bilan) fakti: «+» — joriy + bugun; «=» — jami; kiritma yo'q/xato — joriy. */
  const samaraliFakt = (q: JurnalQator) => {
    const k = kiritmalar[q.id]; const n = k ? sonOqi(k.qiymat) : null;
    return n == null || !Number.isFinite(n) ? q.fakt : k!.rejim === '+' ? q.fakt + n : n;
  };
  /** Ishga ergashadigan material (ichki yoki alohida) uchun taklif (ish ulushida; zamena/bajarilmaydi qismi ayrilgan), yoki null. */
  const matTaklifi = (matId: number): { ish: JurnalQator; hajm: number } | null => {
    const ishId = matIshi.get(matId); const ish = ishId != null ? jurnalById.get(ishId) : undefined; const m = barchaById.get(matId);
    if (!ish || !m) return null;
    const h = materialTaklifi(samaraliFakt(ish), ish.smeta, m.smeta, m.fakt, (m.almashtirilgan ?? 0) + (m.bajarilmaydi ?? 0));
    return h == null ? null : { ish, hajm: h };
  };
  /** Ish(lar)ning keyingi alohida materiallariga taklifni KIRITMAGA oladi (saqlash — foydalanuvchi o'zi, Ctrl+S). */
  const materiallarniOl = (ishIdlar: readonly number[]) => {
    const yangi: Record<number, Kiritma> = {};
    for (const ishId of ishIdlar) for (const m of keyingiMat.get(ishId) ?? []) {
      if (kiritmalar[m]?.qiymat.trim()) continue; // qo'lda yozilganiga tegilmaydi
      const tk = matTaklifi(m); if (tk) yangi[m] = { rejim: '+', qiymat: String(tk.hajm) };
    }
    const n = Object.keys(yangi).length;
    if (!n) { toast(t('Olinadigan material taklifi yo‘q.'), 'warn'); return; }
    setKiritmalar((o) => ({ ...o, ...yangi }));
    toast(t('{n} ta material taklifi kiritildi — tekshirib saqlang (Ctrl+S).', { n: String(n) }), 'ok');
  };
  const takliflarSoni = (ishIdlar: readonly number[]) => ishIdlar.reduce((s, id) => s + (keyingiMat.get(id) ?? []).filter((m) => !kiritmalar[m]?.qiymat.trim() && matTaklifi(m)).length, 0);

  const ishdaRef = useRef<SaqlashVaqda>(null);
  const saqla = useCallback((): SaqlashNatija => {
    if (ishdaRef.current) return ishdaRef.current;
    const p = saqlaIchki().finally(() => { ishdaRef.current = null; });
    ishdaRef.current = p; return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paket, band, obyektId, sana, holatniYangila]);
  const saqlaIchki = async (): SaqlashNatija => {
    if (!paket.ok || band) return false;
    setBand(true);
    try {
      const r = await sbFaktYoz({ obyektId, sana, operationId: operationId.current, qatorlar: paket.qatorlar, izoh: `Fakt jurnali: ${paket.qatorlar.length} qator` });
      if (!r.ok) { toast(r.error || r.xabar || 'Fakt saqlanmadi.', 'danger'); return false; }
      const ids = new Set(paket.qatorlar.map((x) => x.qator_id));
      setSaqlangan(ids); setTimeout(() => setSaqlangan(new Set()), 2500);
      setKiritmalar({}); operationId.current = yangiOperationId();
      toast(`${ids.size} ta qator saqlandi — F2 qoldig‘i yangilandi.`, 'ok');
      // Saqlash tugadi — tugma darhol bo'shaydi; holat fonda yangilanadi (sekin o'qish tugmani qotirmasin).
      setBand(false);
      void Promise.resolve(holatniYangila()).catch(() => toast('Saqlandi, lekin jadvalni yangilab bo‘lmadi — sahifani yangilang.', 'warn'));
      return true;
    } catch { toast('Javob olinmadi. Qayta saqlang — takror xavfsiz (bir xil amal ID).', 'danger'); }
    finally { setBand(false); }
    return false;
  };
  useEffect(() => {
    if (!saqlashRef) return;
    saqlashRef.current = async () => (ishdaRef.current ? ishdaRef.current : (ozgarishSoni ? saqla() : true));
    return () => { saqlashRef.current = null; };
  });

  // Yagona klaviatura moduli (lib/hotkeys): Ctrl+S saqlash, / qidiruv, F — Fakt = F2 (tanlangan bo'lim), Esc — kiritmalarni tozalash.
  useHotkeys('fakt', t('Fakt jurnali'), [
    { id: 'fakt.saqla', keys: 'ctrl+s', nom: t('Saqlash'), inInput: true, run: () => { void saqla(); } },
    { id: 'fakt.qidiruv', keys: '/', nom: t('Qidirish'), run: () => { qidiruvRef.current?.focus(); } },
    { id: 'fakt.f2', keys: 'f', nom: t('Fakt = F2 (tanlangan bo‘lim)'), run: () => { const b = bolimlar.find((x) => x.id === bolimId); if (!b) return false; void tenglashOch(b.nom, bolimIshlariYigish(b.id, bolimIshlari, bolimBolalari, true)); } },
    { id: 'fakt.f2.obyekt', keys: 'shift+f', nom: t('Fakt = F2 (butun obyekt)'), run: () => { if (!bolimlar.length && !ildizIshlari.length) return false; void tenglashObyekt(); } },
    { id: 'fakt.tozala', keys: 'esc', nom: t('Kiritilganlarni bekor qilish'), run: () => { if (!ozgarishSoni) return false; setKiritmalar({}); } },
    { id: 'fakt.qamrov', keys: '%', nom: t('Qamrov % (tanlangan bo‘lim)'), run: () => { const b = bolimlar.find((x) => x.id === bolimId); if (!b || qidiruv) return false; qamrovBolim(b); } },
  ], !modal && !tenglash && !bajModal && !narxModal && !qamrov && !chiqModal);
  useEffect(() => {
    if (!ozgarishSoni) return;
    const k = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', k);
    return () => window.removeEventListener('beforeunload', k);
  }, [ozgarishSoni]);

  let tabIndeks = 0;
  inputlar.current = [];
  const klaviatura = (e: KeyboardEvent<HTMLInputElement>, i: number, id: number) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void saqla(); }
    else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); inputlar.current[i + 1]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (inputlar.current[i - 1] ?? qidiruvRef.current)?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); if (kiritmalar[id]?.qiymat) kirit(id, { qiymat: '' }); else qidiruvRef.current?.focus(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); const q = qatorlarRef.current.get(id); if (q) bajOch(q); }
    else if (e.key === '%') { // hajm katagida «%» — shu ish (resurs bo'lsa — uning ishi) uchun Qamrov %
      const ish = jurnalById.get(id) ?? (() => { const q = qatorlarRef.current.get(id); return q?.otaId != null ? jurnalById.get(q.otaId) : undefined; })();
      if (ish && 'resurslar' in ish) { e.preventDefault(); qamrovIsh(ish as JurnalIsh); }
    }
  };

  /** Qidiruv maydonidan: ↓ / Enter — birinchi ko'rinadigan qatorning hajm katagiga; Esc — qidiruvni tozalash. */
  const qidiruvKlav = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') { const el = inputlar.current[0]; if (el) { e.preventDefault(); el.focus(); } }
    else if (e.key === 'Escape' && qidiruv) { e.preventDefault(); setQidiruv(''); }
  };

  // Oddiy render funksiyasi (komponent emas) — input fokusini yo'qotmaslik uchun.
  const kiritish = (q: JurnalQator, kichik?: boolean) => {
    const i = tabIndeks++;
    qatorlarRef.current.set(q.id, q);
    const k = kiritmalar[q.id] ?? { rejim: '+' as Rejim, qiymat: '' };
    const xato = paket.xatolar.get(q.id);
    const yangiFakt = (() => { const n = Number(k.qiymat.replace(',', '.')); if (!k.qiymat.trim() || !Number.isFinite(n)) return null; return k.rejim === '+' ? q.fakt + n : n; })();
    // Ochiq qoldiqdan (smeta − fakt − almashtirilgan − bajarilmaydi; yagona formula) oshsa — faqat ogohlantirish, bloklanmaydi.
    const ortiqcha = xato || yangiFakt == null ? null : ochiqdanOrtiqcha({ smeta: q.smeta, fakt: yangiFakt, almashtirilgan: q.almashtirilgan, bajarilmaydi: q.bajarilmaydi });
    const oshdi = (ortiqcha ?? 0) > 0;
    const izoh = yangiFakt != null && <div className={`absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10.5px] ${oshdi ? 'font-semibold text-warn' : 'text-text-mute'}`} data-testid={oshdi ? 'qoldiqdan-oshdi' : undefined}>→ {fmt(yangiFakt)}{q.smeta ? ` / ${fmt(q.smeta)}` : ''}{oshdi ? ` · ${t('qoldiqdan oshdi')} +${fmt(ortiqcha)}` : ''}</div>;
    return <div className="flex flex-wrap-reverse items-center justify-end gap-1">
      <div className="flex w-full justify-end gap-0.5 empty:hidden">{!kichik && [25, 50, 100].map((p) => { const v = qoldiqUlushi(q, p); return v ? <button key={p} type="button" tabIndex={-1} onClick={() => kirit(q.id, { rejim: '+', qiymat: v })} title={t('Ochiq qoldiqning {p}% i', { p: String(p) })} className="h-6 rounded-[var(--radius-xs)] border border-border px-1 font-mono text-[10.5px] text-text-dim hover:border-accent hover:text-text">{p}%</button> : null; })}</div>
      <div className="inline-flex h-6 overflow-hidden rounded-[var(--radius-xs)] border border-border-strong text-[12px]" role="group" aria-label={t('Kiritish rejimi')}>
        {(['+', '='] as Rejim[]).map((r) => <button key={r} type="button" tabIndex={-1} aria-pressed={k.rejim === r} title={r === '+' ? t('Bugun bajarilgan hajm (qo‘shiladi)') : t('Jami fakt (shu qiymatga tenglashtiriladi)')} onClick={() => kirit(q.id, { rejim: r })} className={`w-6 font-semibold ${k.rejim === r ? 'bg-accent text-[var(--on-accent)]' : 'text-text-dim hover:bg-surface-3'}`}>{r}</button>)}
      </div>
      <div className="relative">
        <input ref={(el) => { inputlar.current[i] = el; }} onFocus={(e) => e.currentTarget.select()} value={k.qiymat} onChange={(e) => kirit(q.id, { qiymat: e.target.value })} onKeyDown={(e) => klaviatura(e, i, q.id)} inputMode="decimal"
          placeholder={k.rejim === '+' ? t('bugun') : t('jami')} aria-label={`${k.rejim === '+' ? 'Bugun bajarildi' : 'Jami fakt'}: ${q.nom}`}
          className={`h-7 w-[80px] rounded-[var(--radius-sm)] border bg-bg px-2 text-right font-mono text-[13px] tabular-nums outline-none focus:border-accent ${xato || oshdi ? 'border-warn' : k.qiymat ? 'border-accent' : 'border-border-strong'}`} />
        {xato ? <div className="absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10.5px] font-semibold text-warn">{t(JURNAL_XATO_MATN[xato])}</div> : izoh}
      </div>
    </div>;
  };

  /**
   * Ustunlar (egasi 2026-10-25: «bir qarashda tushunish», audit: 11 ustun → 8):
   * Ish/resurs (holat muhri + bitta belgi guruhi) | Smeta (hajm, birlik, narx) | Bajarilish (chiziq) | Bu fakt |
   * Ochiq qoldiq | F2 ga olish mumkin | Fakt summasi | amallar.
   */
  const USTUN = 'grid grid-cols-[minmax(220px,1fr)_92px_132px_140px_80px_84px_112px_auto] items-start gap-x-2';
  const sonKatak = 'text-right font-mono text-[12px] tabular-nums';
  /** F2 qoldig'i (smeta − F2 − almashtirilgan) — yagona `ochiqQoldiq` ning F2 rejimi. */
  const f2QoldiqOl = (q: JurnalQator): number | null => ochiqQoldiq({ smeta: q.smeta, f2: Number(holatMap.get(q.id)?.f2_hajm ?? 0), almashtirilgan: q.almashtirilgan }, 'f2');
  /** Narx: resurs — smeta narxi (t2_qator.narx); ish — resurslar summasi / ish hajmi (hisoblangan, o'ylab topilmaydi). */
  const narxKatak = (q: JurnalQator) => {
    const r = rowById.get(q.id); const h = holatMap.get(q.id);
    const narx = h?.smeta_narx != null ? Number(h.smeta_narx) : r?.narx != null ? Number(r.narx) : null;
    if (narx != null) return <span title={t('Birlik narxi (NDS siz)')}>× {fmt(narx)}</span>;
    if (narxlashMumkin(q.tur, narx)) return <button type="button" tabIndex={-1} onClick={() => setNarxModal({ id: q.id, nom: q.nom, birlik: q.birlik, kat: r?.kat ?? null, fakt: q.fakt, smeta: q.smeta })}
      className="fz-chip fz-chip--danger hover:brightness-110" title={t('Narxi noma‘lum - narxlash')} data-testid="narxsiz-belgi">{t('narxsiz')}</button>;
    if (q.tur === 'bl') { const ts = taxminKesim(q); if (ts && q.smeta) return <span title={t('Ish birlik narxi = resurslar summasi / ish hajmi')}>× {fmt(ts.smetaSumma / q.smeta)}</span>; }
    return <span>—</span>;
  };
  const almMatn = (q: JurnalQator) => almashtirildiMatn(q.almashtirilgan, q.smeta, q.birlik, fmt);
  /** Qatorda belgi bormi (ikkinchi satr faqat kerak bo'lsa chiziladi). */
  const belgiBor = (q: JurnalQator) => q.zamena || q.qoshimcha || !!almMatn(q) || saqlangan.has(q.id) || (bajHajm.get(q.id) ?? 0) > 0;
  /**
   * BITTA belgi guruhi: zamena (info) · qo'shimcha (firuza) · almashtirildi (neytral) · bajarilmaydi (qizil, bosilsa bekor).
   * Sariq rang faqat «smetadan/qoldiqdan oshdi» uchun.
   */
  const belgilar = (q: JurnalQator) => {
    const m = almMatn(q);
    return <>
      {q.zamena && <span className="fz-chip bg-[var(--info-soft)] text-[var(--info)]" data-testid="zamena-belgi" title={q.aslNom ? t('Zamena: asl qator — {nom}', { nom: q.aslNom }) : t('Zamena')}>↻ {t('zamena')}{q.aslNom ? `: ${t('asl')} ${q.aslNom}` : ''}</span>}
      {q.qoshimcha && <span className="fz-chip fz-chip--accent" data-testid="qoshimcha-belgi">+ {t('qo‘shimcha')}</span>}
      {m && <span className="fz-chip" data-testid="almashtirildi-belgi" title={t('Shu hajmni zamena qatorlari qoplagan')}>{t('almashtirildi')} {m}</span>}
      {(bajHajm.get(q.id) ?? 0) > 0 && (q.tur !== 'bl' && chiq(q)
        ? <button type="button" tabIndex={-1} onClick={() => void bajBekor(q.id, q.nom)} className="fz-chip fz-chip--danger hover:brightness-110" title={t('Resurs ishdan chiqarilgan — F2 ga kirmaydi (bosing - bekor qilish)')} data-testid="chiqarilgan-belgi"><MinusCircle size={11} aria-hidden="true" />{t('ishdan chiqarilgan')}</button>
        : <button type="button" tabIndex={-1} onClick={() => void bajBekor(q.id, q.nom)} className="fz-chip fz-chip--danger hover:brightness-110" title={t('Bajarilmaydi deb belgilangan hajm (bosing - bekor qilish)')} data-testid="baj-belgi">{t('bajarilmaydi')}: {fmt(bajHajm.get(q.id))}</button>)}
      {saqlangan.has(q.id) && <span className="fz-chip text-ok"><CheckCircle2 size={12} aria-hidden="true" />{t('saqlandi')}</span>}
    </>;
  };
  const tugmaCls = 'rounded-[var(--radius-xs)] p-1 text-text-mute hover:bg-surface-3';
  const zamenaTugma = (q: JurnalQator, kichik?: boolean) => q.otaId != null && !q.qoshimcha && !q.zamena && q.tur !== 'bl' && mehnatResursmi(q)
    ? <span className={`${tugmaCls} cursor-not-allowed opacity-40`} title={t(MEHNAT_ZAMENA_YOQ)} aria-label={t('Zamena yo‘q: {nom}', { nom: q.nom })} data-testid="zamena-yoq"><Repeat2 size={kichik ? 12 : 14} /></span>
    : q.otaId != null && !q.qoshimcha && !q.zamena && !(q.tur !== 'bl' && chiq(q)) // chiqarilgan resurs — avval chiqarishni bekor qiling
    ? <button type="button" tabIndex={-1} onClick={() => zamenaOch(q)} title={q.tur === 'bl' ? t('Ish zamenasi — boshqa ish bilan almashtirish') : t('Resurs zamenasi — shu ish ichida boshqa resurs bilan almashtirish')} aria-label={`Zamena: ${q.nom}`} className={`${tugmaCls} hover:text-[var(--info)]`}><Repeat2 size={kichik ? 12 : 14} /></button> : null;
  /** «Ishdan chiqarish»: ish ichidagi asl resurs (rs/mat/ob) F2 ga kirmaydi — «bajarilmaydi» qatlami, butun smeta hajmi. */
  const chiqarishTugma = (r: JurnalQator) => {
    if (r.tur === 'bl' || r.qoshimcha || r.zamena || chiq(r)) return null;
    const ota = r.otaId != null ? rowById.get(r.otaId) : undefined;
    const h = holatMap.get(r.id) as (JurnalHolat & { fakt_manbasi?: string | null }) | undefined;
    // Resursning O'Z fakti: mat/ob — fakt; rs — faqat to'g'ridan-to'g'ri yozilgani (norma × ish faktidan hosila emas).
    const ozFakt = r.tur === 'rs' ? (h?.fakt_manbasi === 'DIRECT' ? r.fakt : 0) : r.fakt;
    const rux = chiqarishRuxsat({ ...r, ishIchida: ota?.tur === 'bl', ozFakt, belgilangan: bajHajm.get(r.id) ?? 0 });
    if (!rux.mumkin) return <span className={`${tugmaCls} cursor-not-allowed opacity-40`} title={t(rux.sabab)} aria-label={t('Chiqarib bo‘lmaydi: {nom}', { nom: r.nom })} data-testid="chiqarish-yoq"><MinusCircle size={12} /></span>;
    return <button type="button" tabIndex={-1} onClick={() => setChiqModal({ id: r.id, kod: r.kod, nom: r.nom, birlik: r.birlik, smeta: r.smeta, ishNom: ota ? [ota.kod, ota.nom].filter(Boolean).join(' ') || null : null })}
      title={t('Resursni ishdan chiqarish — shu ishda ishlatilmadi, F2 ga kirmaydi')} aria-label={t('Ishdan chiqarish: {nom}', { nom: r.nom })} data-testid="chiqarish-tugma" className={`${tugmaCls} hover:text-danger`}><MinusCircle size={12} /></button>;
  };
  const tahrirTugmalar = (q: JurnalQator) => (q.qoshimcha || q.zamena) ? <>
    <button type="button" tabIndex={-1} onClick={() => tahrirOch(q)} title={t('Tahrirlash')} aria-label={`Tahrirlash: ${q.nom}`} className={`${tugmaCls} hover:text-accent`}><Pencil size={13} /></button>
    <button type="button" tabIndex={-1} onClick={() => void ochir(q)} title={q.zamena ? t('Zamenani bekor qilish (asliga qaytarish)') : t('O‘chirish')} aria-label={`O‘chirish: ${q.nom}`} className={`${tugmaCls} hover:text-danger`}><Trash2 size={13} /></button>
  </> : null;
  /** Raqamli ustunlar (Smeta … Fakt summasi): ish, resurs va avto qatorlarda bir xil. */
  const raqamlar = (q: JurnalQator, kiritma: ReactNode, kichik?: boolean) => {
    const h = holatMap.get(q.id); const f2ql = f2QoldiqOl(q); const ts = taxminKesim(q);
    const chiqRes = q.tur !== 'bl' && chiq(q);
    const f2 = h?.f2_hajm == null ? null : Number(h.f2_hajm);
    const k = kiritmalar[q.id];
    const ef = k?.qiymat.trim() ? samaraliFakt(q) : null;
    const m = faktMeter(q.smeta, q.fakt, f2, ef != null && ef !== q.fakt ? ef : null);
    const qoldiqOshdi = q.qoldiq != null && (q.smeta ?? 0) !== 0 && !ochiqBor(q) && Math.abs(q.qoldiq) > 1e-9;
    const mumkin = f2OlishMumkin(h);
    const f2Oldin = m.f2Oldinda && f2 != null ? f2 - q.fakt : null;
    return <>
      <span className="flex flex-col items-end leading-tight">
        <span className={`${sonKatak} ${kichik ? 'text-text-dim' : 'text-text'}`}>{fmt(q.smeta)} <span className="font-sans text-[11px] text-text-mute">{q.birlik ?? ''}</span></span>
        <span className="mt-0.5 font-mono text-[11px] tabular-nums text-text-mute">{narxKatak(q)}</span>
      </span>
      <QatorMeter m={m} fakt={q.fakt} f2={f2} f2Qoldiq={f2ql} smeta={q.smeta} />
      {kiritma}
      {chiqRes
        ? <span className={`${sonKatak} text-text-mute`} data-testid={`ochiq-${q.id}`} title={t('Resurs ishdan chiqarilgan — F2 ga kirmaydi')}>—</span>
        : <span className={`${sonKatak} ${qoldiqOshdi ? 'font-semibold text-warn' : 'text-text'}`} data-testid={`ochiq-${q.id}`} title={t('Ochiq qoldiq = smeta − fakt − almashtirilgan − bajarilmaydi')}>{fmt(q.qoldiq)}</span>}
      <span className="flex flex-col items-end leading-tight" data-testid={`f2mumkin-${q.id}`} title={t('F2 ga olish mumkin = fakt − tasdiqlangan F2')}>
        <span className={`${sonKatak} ${mumkin != null && mumkin > 1e-9 ? 'font-semibold text-[var(--accent-text)]' : 'text-text-mute'}`}>{fmt(mumkin)}</span>
        {f2Oldin != null && <span className="text-[10.5px] text-[var(--info)]" title={t('Tasdiqlangan F2 hajmi faktdan ko‘p — «Fakt = F2» bilan tenglash mumkin')}>{t('F2 faktdan +{n}', { n: fmt(f2Oldin) })}</span>}
      </span>
      <span className="flex justify-end">{ts && !chiqRes ? <SummaJuft rejim="ustamali" kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={ts.faktSumma} katKesim={ts.fakt} className="items-end" /> : <span className="text-[12px] text-text-mute">—</span>}</span>
    </>;
  };
  /*
   * Excel uslubidagi ustun filtrlari (egasi 2026-10-27): qidiruv va belgilar (faqat bajarilmaganlar, …) bilan VA.
   * Qiymatlar qator chizadigan manbalardan (holatMap, kiritmalar, taxminKesim) — foydalanuvchi ko'rgani bo'yicha.
   * Filtr ish darajasida (FaktJadvalFiltr): resurs mos bo'lsa — ota ishi; bo'lim guruhi saqlanadi.
   */
  type FQ = FaktFiltrQator<JurnalQator>;
  const filtrUstunlar = useMemo((): Ustun<FQ>[] => {
    const f2Ol = (q: JurnalQator) => { const h = holatMap.get(q.id); return h?.f2_hajm == null ? null : Number(h.f2_hajm); };
    const chiqR = (q: JurnalQator) => q.tur !== 'bl' && chiq(q);
    return [
      { kalit: 'kod', nom: t('Kod'), tur: 'matn', qiymat: (r) => r.q.kod },
      { kalit: 'nom', nom: t('Nomi'), tur: 'matn', qiymat: (r) => r.q.nom },
      { kalit: 'tur', nom: t('Kat / tur'), tur: 'matn', qiymat: (r) => (!r.bola && r.q.tur === 'bl' ? t('ISH') : r.q.kat ?? katAniqla(null, r.q.tur, r.q.birlik)) },
      { kalit: 'holat', nom: t('Holat'), tur: 'matn', qiymat: (r) => t(HOLAT_MUHR[r.q.holat].matn) },
      { kalit: 'hajm', nom: t('Smeta hajmi'), tur: 'son', qiymat: (r) => r.q.smeta },
      { kalit: 'birlik', nom: t('Birlik'), tur: 'matn', qiymat: (r) => r.q.birlik },
      { kalit: 'narx', nom: t('Birlik narxi'), tur: 'son', qiymat: (r) => {
        const n = narxOl(r.q.id); if (n != null) return n;
        if (r.q.tur === 'bl') { const ts = taxminKesim(r.q); if (ts && r.q.smeta) return ts.smetaSumma / r.q.smeta; }
        return null;
      } },
      { kalit: 'foiz', nom: t('Bajarilish foizi'), tur: 'son', qiymat: (r) => {
        const f = faktMeter(r.q.smeta, r.q.fakt, f2Ol(r.q)).foiz;
        // Ko'rinishdagi foizMatn bilan bir xil: 99.6% → 99 (tugamagan ish 100 emas), kichik foiz 0.1 aniqlikda.
        return f == null || !Number.isFinite(f) ? null : f > 99 && f < 100 ? 99 : Math.abs(f) < 1 ? Math.round(f * 10) / 10 : Math.round(f);
      } },
      { kalit: 'fakt', nom: t('Fakt hajm'), tur: 'son', qiymat: (r) => r.q.fakt },
      { kalit: 'f2', nom: t('F2 hajmi'), tur: 'son', qiymat: (r) => f2Ol(r.q) },
      { kalit: 'kiritma', nom: t('Bu fakt'), tur: 'son', qiymat: (r) => { const n = sonOqi(kiritmalar[r.q.id]?.qiymat ?? ''); return n != null && Number.isFinite(n) ? n : null; } },
      { kalit: 'ochiq', nom: t('Ochiq qoldiq'), tur: 'son', qiymat: (r) => (chiqR(r.q) ? null : r.q.qoldiq) },
      { kalit: 'f2mumkin', nom: t('F2 ga olish mumkin'), tur: 'son', qiymat: (r) => f2OlishMumkin(holatMap.get(r.q.id)) },
      { kalit: 'summa', nom: t('Fakt summasi'), tur: 'son', qiymat: (r) => { const ts = taxminKesim(r.q); return ts && !chiqR(r.q) ? ts.faktSumma : null; } },
    ];
    // taxminKesim/chiq — holatMap, rowById, bajHajm ga tayanadigan render yopilmalari.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holatMap, rowById, bajHajm, kiritmalar, narxOl]);
  const filtrQatorlar = useMemo(() => faktFiltrQatorlar<JurnalQator>(korinadiAsos), [korinadiAsos]);
  const jf = useJadvalFiltr<FQ>(filtrQatorlar, filtrUstunlar, FAKT_DARAXT as Daraxt<FQ>);
  const { bolaklar: korinadi, bolaKorinadi } = useMemo(() => faktFiltrQoll<JurnalQator, JurnalIsh, Bolak>(korinadiAsos, filtrUstunlar, jf.holat, jf.saralash), [korinadiAsos, filtrUstunlar, jf.holat, jf.saralash]);
  const korinadiIshSoni = korinadi.reduce((s, x) => s + x.ishlar.length, 0);
  const asosIshSoni = korinadiAsos.reduce((s, x) => s + x.ishlar.length, 0);
  /** Sarlavhadagi filtr tugmasi (bo'lim ichida saralash ham mumkin — ierarxiya buzilmaydi). */
  const F = (kalit: string) => <UstunFiltrTugma {...jf.tugma(kalit)} saralashMumkin />;
  /** Izoh satrida: kichik nom + filtr tugmasi (bir ustunda bir nechta maydon). */
  const FN = (nom: string, kalit: string) => <span className="inline-flex items-center whitespace-nowrap">{nom}{F(kalit)}</span>;
  const bolaKor = (ishId: number) => (r: JurnalQator) => !bolaKorinadi || bolaKorinadi(ishId, r.id);

  const satrFon = (q: JurnalQator) => `transition-colors focus-within:bg-accent/[.07] ${saqlangan.has(q.id) ? 'bg-ok/10' : kiritmalar[q.id]?.qiymat ? 'bg-accent/[.05]' : ''} border-l-2 ${q.zamena ? 'border-l-[var(--info)]' : q.qoshimcha ? 'border-l-accent' : 'border-l-transparent'}`;

  /** ISH qatori (yoki ishsiz alohida resurs): 1-satr — nom; 2-satr — holat muhri va bitta belgi guruhi. */
  const ishQatori = (ish: JurnalIsh) => {
    const alohida = ish.tur !== 'bl';
    const bolaSoni = ish.resurslar.length + ish.avtomatik.length;
    const ochiq = ishOchiq(ish.id);
    const f2Bor = !alohida && (holatMap.get(ish.id)?.f2_hajm ?? 0) - ish.fakt > 1e-9;
    const takliflar = !alohida ? takliflarSoni([ish.id]) : 0;
    const tk = alohida && !kiritmalar[ish.id]?.qiymat.trim() ? matTaklifi(ish.id) : null;
    return <div className={`${USTUN} px-3 py-2 ${satrFon(ish)}`} data-testid={`ish-${ish.id}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-start gap-1.5">
          {bolaSoni > 0
            ? <button type="button" tabIndex={-1} onClick={() => ishAlmashtir(ish.id)} aria-expanded={ochiq} aria-label={t('Resurslar: {nom}', { nom: ish.nom })} title={ochiq ? t('Resurslarni yopish') : t('Resurslarni ochish ({n} ta)', { n: String(bolaSoni) })} className="rounded p-0.5 text-text-mute hover:text-text">{ochiq ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
            : <span className="w-[18px] shrink-0" />}
          {alohida ? <KatNishon kat={ish.kat ?? katAniqla(null, ish.tur, ish.birlik)} /> : <span className="fz-kat shrink-0 bg-accent/15 text-[var(--accent-text)]" data-testid="ish-belgi">{t('ISH')}</span>}
          {ish.kod && <span className="shrink-0 font-mono text-[11px] text-text-mute">{ish.kod}</span>}
          <span className="nom-toliq min-w-0 flex-1 text-[13px] font-semibold leading-[17px] text-text" title={`${ish.kod ? ish.kod + ' ' : ''}${ish.nom}`}>{ish.nom}</span>
          {!ochiq && bolaSoni > 0 && <span className="shrink-0 text-[11px] text-text-mute">{t('{n} resurs', { n: String(bolaSoni) })}</span>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1 pl-6">
          <HolatMuhr holat={ish.holat} />
          {alohida && <span className="text-[11px] text-text-mute">{t('alohida resurs')}</span>}
          {belgilar(ish)}
          {takliflar > 0 && <button type="button" tabIndex={-1} onClick={() => materiallarniOl([ish.id])} data-testid="materiallarni-ol"
            title={t('Ish ichidagi va undan keyingi materiallarga ish ulushida taklif (avtomatik yozilmaydi)')} aria-label={t('Materiallarni ham olish: {nom}', { nom: ish.nom })}
            className="fz-chip border border-accent/40 bg-transparent text-[var(--accent-text)] hover:bg-accent/10">{t('Materiallarni ham olish ({n})', { n: String(takliflar) })}</button>}
          {tk && <button type="button" tabIndex={-1} onClick={() => kirit(ish.id, { rejim: '+', qiymat: String(tk.hajm) })} data-testid="material-taklif"
            title={t('«{nom}» ishi ulushida taklif — bosing, kiritmaga olinadi', { nom: tk.ish.nom })}
            className="fz-chip border border-dashed border-border-strong bg-transparent text-text-mute hover:border-accent hover:text-[var(--accent-text)]">{t('taklif')}: +{fmt(tk.hajm)}</button>}
        </div>
      </div>
      {raqamlar(ish, kiritish(ish))}
      <div className="flex items-center justify-end gap-0.5">
        {tahrirTugmalar(ish)}
        <button type="button" tabIndex={-1} onClick={() => bajOch(ish)} title={sarlavhaBilan(t('Bajarilmaydi / qilib bo‘lmaydi'), 'ctrl+b')} aria-label={t('Bajarilmaydi: {nom}', { nom: ish.nom })} className={`${tugmaCls} hover:text-danger`}><Ban size={13} /></button>
        {!alohida && <button type="button" tabIndex={-1} onClick={() => qamrovIsh(ish)} title={t('Qamrov %: shu ish (va ichidagi material/uskuna) — foiz × ochiq qoldiq (katakda «%»)')} aria-label={t('Qamrov %: {nom}', { nom: ish.nom })} data-testid="qamrov-ish"
          className="rounded-[var(--radius-xs)] px-1 font-mono text-[11px] font-semibold text-[var(--accent-text)] hover:bg-surface-3">%</button>}
        {f2Bor && <button type="button" tabIndex={-1} onClick={() => void tenglashOch(ish.nom, [ish])} disabled={tenglashYuk} title={t('Fakt ni F2 ga tenglash')} aria-label={`Fakt = F2: ${ish.nom}`} className="rounded-[var(--radius-xs)] px-1 font-mono text-[10.5px] font-semibold text-[var(--info)] hover:bg-surface-3">{t('=F2')}</button>}
        {zamenaTugma(ish)}
      </div>
    </div>;
  };

  /** Resurs qatori (ish ichida, chekinish bilan): kiritiladigan (mat/ob) yoki avto (rs: norma × ish fakti, xira). */
  const resursQatori = (r: JurnalQator, avto: boolean) => {
    // #144: ish ichidagi mat/ob ham ish ulushida taklif oladi (kiritmasiz qatorda xira «taklif: +X»).
    const tk = !avto && !kiritmalar[r.id]?.qiymat.trim() ? matTaklifi(r.id) : null;
    const ikkinchi = belgiBor(r) || r.holat === 'oshdi' || tk != null;
    return <div key={r.id} className={`${USTUN} py-1 pl-3 pr-3 ${avto ? 'opacity-80' : ''} ${satrFon(r)}`} data-testid={`resurs-${r.id}`}>
      <div className="flex min-w-0 flex-col gap-0.5 pl-9">
        <div className="flex min-w-0 items-start gap-1.5">
          <span className="text-text-mute/60" aria-hidden="true">└</span>
          <KatNishon kat={r.kat ?? katAniqla(null, r.tur, r.birlik)} />
          {avto && <span className="fz-chip shrink-0" title={t('Avtomatik: norma × ish fakti')} data-testid="avto-belgi"><Cpu size={10} aria-hidden="true" />{t('avto')}</span>}
          {r.kod && <span className="shrink-0 font-mono text-[10.5px] text-text-mute">{r.kod}</span>}
          <span className={`nom-toliq min-w-0 flex-1 text-[12px] leading-4 ${avto ? 'text-text-mute' : 'text-text-dim'}`} title={`${r.kod ? r.kod + ' ' : ''}${r.nom}`}>{r.nom}</span>
        </div>
        {ikkinchi && <div className="flex min-w-0 flex-wrap items-center gap-1 pl-4">{r.holat === 'oshdi' && <HolatMuhr holat="oshdi" />}{belgilar(r)}
          {tk && <button type="button" tabIndex={-1} onClick={() => kirit(r.id, { rejim: '+', qiymat: String(tk.hajm) })} data-testid="material-taklif"
            title={t('«{nom}» ishi ulushida taklif — bosing, kiritmaga olinadi', { nom: tk.ish.nom })}
            className="fz-chip border border-dashed border-border-strong bg-transparent text-text-mute hover:border-accent hover:text-[var(--accent-text)]">{t('taklif')}: +{fmt(tk.hajm)}</button>}
        </div>}
      </div>
      {raqamlar(r, avto
        ? <span className="text-right text-[11px] text-text-mute" title={t('Avtomatik: norma × ish fakti')}>{r.norma != null ? `${t('norma')} ${fmt(r.norma)}` : t('avto')}</span>
        : kiritish(r, true), true)}
      <div className="flex items-center justify-end gap-0.5">
        {tahrirTugmalar(r)}
        {!avto && <button type="button" tabIndex={-1} onClick={() => bajOch(r)} title={sarlavhaBilan(t('Bajarilmaydi / qilib bo‘lmaydi'), 'ctrl+b')} aria-label={t('Bajarilmaydi: {nom}', { nom: r.nom })} className={`${tugmaCls} hover:text-danger`}><Ban size={13} /></button>}
        {chiqarishTugma(r)}
        {zamenaTugma(r, true)}
      </div>
    </div>;
  };

  const summaQatori = (s: BolimSumma | undefined) => s ? <div className="flex flex-wrap items-start gap-x-5 gap-y-1 text-[11px] text-text-mute" data-testid="bolim-summalar">
    {([['smeta', t('Smeta')], ['f2', t('F2')], ['fakt', t('Fakt')], ['qoldiq', t('F2 qoldiq')]] as const).map(([k, l]) => <span key={k} className="inline-flex items-start gap-1.5"><span className="pt-0.5 font-semibold uppercase tracking-wide">{l}</span><SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={s[k].ustamasiz} katKesim={s[k].kesim} /></span>)}
  </div> : null;

  const tanlanganBolim = bolimlar.find((b) => b.id === bolimId);
  const obyektUlushi = useMemo(() => obyektUlushiHisobla(bolimlar, (id) => summalar.get(id)?.smeta.ustamasiz), [bolimlar, summalar]);
  const xulosa = useMemo(() => jurnalXulosa(bolimlar, bolimIshlari), [bolimlar, bolimIshlari]);
  const bolimKorinadi = (b: (typeof bolimlar)[number]) => { let p = b.otaId; while (p != null) { if (yopiqBolim.has(p)) return false; p = bolimlar.find((x) => x.id === p)?.otaId ?? null; } return true; };
  const bolaliBolim = useMemo(() => new Set(bolimlar.map((b) => b.otaId).filter((x): x is number => x != null)), [bolimlar]);
  const sarlavha = qidiruv ? t('Qidiruv: «{q}»', { q: qidiruv }) : tanlanganBolim?.nom ?? t('Bo‘limni tanlang');
  const bolimMaterialIdlar = korinadi.flatMap((b) => b.ishlar.map((i) => i.id));
  const bolimTakliflar = takliflarSoni(bolimMaterialIdlar);
  /** `filtr` — nom yonida bitta filtr tugmasi; `maydonlar` — bir nechta maydonli ustunda uchinchi satr (nom + tugma). */
  const ustunSarlavha = (nom: string, izoh: string, o?: { ong?: boolean; title?: string; filtr?: ReactNode; maydonlar?: ReactNode }) => <span className={`flex min-w-0 flex-col ${o?.ong ? 'items-end text-right' : ''}`} title={o?.title}>
    <span className={`flex items-start ${o?.ong ? 'justify-end' : ''}`}><span>{nom}</span>{o?.filtr}</span><span className="text-[10.5px] font-normal normal-case tracking-normal text-text-mute">{izoh}</span>
    {o?.maydonlar && <span className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] font-normal normal-case tracking-normal text-text-mute ${o.ong ? 'justify-end' : ''}`}>{o.maydonlar}</span>}
  </span>;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="fz-card flex flex-wrap items-center gap-3 px-3 py-2">
        <label className="flex items-center gap-2 text-[12px] font-medium text-text-dim">{t('Sana')}<input type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="input h-8 px-2 text-[13px] text-text" aria-label={t('Fakt sanasi')} /></label>
        <div className="relative min-w-[240px] flex-1"><Search size={14} className="absolute left-2.5 top-2 text-text-mute" />
          <input ref={qidiruvRef} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} onKeyDown={qidiruvKlav} placeholder={t('Butun obyekt bo‘yicha qidirish…  ( / )')} aria-label={t('Qidirish')} className="input h-8 w-full pl-8 pr-8 text-[13px]" />
          {qidiruv && <button onClick={() => setQidiruv('')} className="absolute right-2 top-2 text-text-mute" aria-label={t('Qidiruvni tozalash')}><X size={14} /></button>}</div>
        <label className="flex items-center gap-1.5 text-[12px] text-text-dim"><input type="checkbox" checked={faqatQoldiq} onChange={(e) => setFaqatQoldiq(e.target.checked)} /> {t('faqat bajarilmaganlar')}</label>
        <label className="flex items-center gap-1.5 text-[12px] text-text-dim" title={t('Pereraschet uchun: tasdiqlangan F2 olingan, lekin fakt belgilanmagan qatorlar (butun obyekt bo‘yicha)')}><input type="checkbox" checked={faktsizF2} onChange={(e) => setFaktsizF2(e.target.checked)} /> {t('fakti yo‘q, F2 olingan')}</label>
        {tanlanganBolim && <button type="button" onClick={() => void tenglashOch(tanlanganBolim.nom, bolimIshlariYigish(tanlanganBolim.id, bolimIshlari, bolimBolalari, true))} disabled={tenglashYuk}
          title={sarlavhaBilan(t('Shu bo‘lim (ichki bo‘limlari bilan): F2 hajmi fakt dan ko‘p ishlarga farqni yozish'), 'f')} aria-label={t('Fakt = F2: bo‘lim')}
          className="fz-btn">{t('Fakt = F2')} <kbd className="fz-kbd">F</kbd></button>}
        {(bolimlar.length > 0 || ildizIshlari.length > 0) && <button type="button" onClick={() => void tenglashObyekt()} disabled={tenglashYuk} data-testid="f2-tenglash-obyekt"
          title={sarlavhaBilan(t('Butun obyekt (barcha bo‘limlar): F2 hajmi fakt dan ko‘p ishlarga farqni yozish — oldindan ko‘rish, istisno va bekor qilish bilan'), 'shift+f')} aria-label={t('Fakt = F2: butun obyekt')}
          className="fz-btn">{t('Fakt = F2: obyekt')} <kbd className="fz-kbd">{'Shift+F'}</kbd></button>}
        {tanlanganBolim && !qidiruv && <button type="button" onClick={() => qamrovBolim(tanlanganBolim)} data-testid="qamrov-tanlangan"
          title={sarlavhaBilan(t('Tiklash rejimi: shu bo‘lim (ichki bo‘limlari bilan) barcha ishlariga bitta foiz — fakt = foiz × ochiq qoldiq; oldindan ko‘rish va bekor qilish bilan'), '%')} aria-label={t('Qamrov %: bo‘lim')}
          className="fz-btn">{t('Qamrov %')} <kbd className="fz-kbd">%</kbd></button>}
        <button onClick={() => setModal({ rejim: { tur: 'additional', bolimId } })} className="fz-btn"><Plus size={14} className="text-accent" /> {t('Smetadan tashqari ish')}</button>
      </section>

      {bolimlar.length > 0 && <FaktXulosaPanel x={xulosa} obyekt={obyektUlushi} />}

      <FaktStudioBar yigindi={yigindi} obyektId={obyektId} kompaniyaId={kompaniyaId} onF2={f2Otish} band={band} jami={summalar.get(0)} />

      {bolimlar.length === 0
        ? <section className="fz-card flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="max-w-md text-[13px] text-text-dim">{t('Bu obyektda smeta yo‘q. Bajarilgan ishlarni resurslari bilan to‘g‘ridan-to‘g‘ri kiriting — ular faktga yoziladi va F2 ga tayyor bo‘ladi.')}</p>
            <button onClick={() => setModal({ rejim: { tur: 'additional' } })} className="fz-btn fz-btn--primary fz-btn--lg"><Plus size={16} /> {t('Bajarilgan ishni kiritish')}</button>
          </section>
        : <div className={`ish-maydoni grid min-h-0 flex-1 grid-cols-1 gap-2 ${panelOchiq ? 'md:grid-cols-[clamp(220px,20vw,272px)_minmax(0,1fr)]' : 'md:grid-cols-[44px_minmax(0,1fr)]'}`}>
          {!panelOchiq && <button type="button" onClick={panelAlmashtir} data-testid="bolim-panel-och"
            aria-label={t('Bo‘limlar panelini ochish')} title={t('Bo‘limlar panelini ochish')}
            className="fz-card group hidden min-h-0 flex-col items-center gap-3 py-3 text-text-dim transition-colors hover:border-accent hover:bg-accent/10 hover:text-[var(--accent-text)] md:flex">
            <PanelLeftOpen size={20} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] [writing-mode:vertical-rl] rotate-180">{t('Bo‘limlar')} · {t('{a} / {b} tugagan', { a: String(xulosa.bolimTugagan), b: String(xulosa.bolimJami) })}</span>
          </button>}
          <aside className={`fz-card min-h-0 flex-col ${panelOchiq ? 'flex' : 'flex md:hidden'}`} aria-label={t('Bo‘limlar')}>
            <div className="fz-panel__h flex items-center gap-2 border-b border-border py-1.5 pl-3 pr-1.5"><span>{t('Bo‘limlar')}</span><span className="ml-auto tabular-nums">{t('{a} / {b} tugagan', { a: String(xulosa.bolimTugagan), b: String(xulosa.bolimJami) })}</span>
              <button type="button" onClick={panelAlmashtir} data-testid="bolim-panel-yop" aria-label={t('Bo‘limlar panelini yig‘ish')} title={t('Bo‘limlar panelini yig‘ish')}
                className="hidden h-8 w-8 items-center justify-center rounded-md border border-border text-text-dim hover:border-accent hover:bg-accent/10 hover:text-[var(--accent-text)] md:inline-flex"><PanelLeftClose size={16} /></button></div>
            <nav className="min-h-0 flex-1 overflow-auto py-1">
              {bolimlar.filter(bolimKorinadi).map((b) => { const tanlangan = b.id === bolimId && !qidiruv; return <div key={b.id} className={`group flex items-center gap-1 border-l-2 pr-2 ${tanlangan ? 'border-l-accent bg-accent/10' : 'border-l-transparent hover:bg-surface-3'}`} style={{ paddingLeft: 4 + b.daraja * 14 }}>
                {bolaliBolim.has(b.id)
                  ? <button onClick={() => setYopiqBolim((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} className="rounded p-0.5 text-text-mute hover:text-text" aria-label={t('Ichki bo‘limlar')}>{yopiqBolim.has(b.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>
                  : <span className="w-[17px]" />}
                <button onClick={() => { setBolimId(b.id); setQidiruv(''); }} className="min-w-0 flex-1 py-1.5 text-left" aria-current={tanlangan ? 'true' : undefined}>
                  <div className="flex items-baseline justify-between gap-2"><span className={`truncate text-[12.5px] ${tanlangan ? 'font-semibold text-text' : b.daraja === 0 ? 'font-medium text-text' : 'text-text-dim'}`} title={b.nom}>{b.nom}</span><span className="shrink-0 text-[11px] tabular-nums text-text-mute" data-testid={`bolim-soni-${b.id}`} title={t('Ichidagi ishlar (ichki bo‘limlari bilan) va bajarilgani')}>{t('{n} ish', { n: String(b.ishSoni) })}</span></div>
                  <div className="mt-1"><BolimMeter ulush={b.ulush} /></div>
                </button>
              </div>; })}
            </nav>
          </aside>

          <section className="fz-card flex min-h-0 flex-col">
            <header className="flex flex-col gap-2 border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="fz-card__title truncate" title={tanlanganBolim?.nom}>{sarlavha}</h2>
                  {!qidiruv && tanlanganBolim && <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-dim">
                    <span className="tabular-nums">{t('{a} / {b} ish bajarilgan', { a: String(tanlanganBolim.tugaganSoni), b: String(tanlanganBolim.ishSoni) })}</span>
                    <span className="w-[180px]"><BolimMeter ulush={tanlanganBolim.ulush} /></span>
                  </div>}
                  {!qidiruv && tanlanganBolim && summaQatori(summalar.get(tanlanganBolim.id))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {bolimTakliflar > 0 && <button type="button" onClick={() => materiallarniOl(bolimMaterialIdlar)} data-testid="bolim-materiallarni-ol"
                    title={t('Ish ichidagi va undan keyingi materiallarga ish ulushida taklif (avtomatik yozilmaydi)')}
                    className="fz-btn fz-btn--sm border-accent/40 text-[var(--accent-text)]">{t('Bo‘lim: materiallarni ham olish ({n})', { n: String(bolimTakliflar) })}</button>}
                  <button type="button" onClick={() => { setHammaYopiq((v) => !v); setTeskari(new Set()); }} className="fz-btn fz-btn--ghost fz-btn--sm" aria-label={hammaYopiq ? t('Hamma resurslarni ochish') : t('Hamma resurslarni yopish')}>
                    {hammaYopiq ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{hammaYopiq ? t('Hammasini ochish') : t('Hammasini yopish')}</button>
                </div>
              </div>
              <MeterLegenda />
              <FiltrHolatQatori soni={jf.soni} natija={korinadiIshSoni} jami={asosIshSoni} tozala={jf.tozala} />
            </header>
            <div className="min-h-0 flex-1 overflow-auto pb-16" data-testid="fakt-jadval">
              <div className="min-w-[980px]">
                <div className={`${USTUN} sticky top-0 z-10 border-b border-border-strong bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-dim`} role="row">
                  {ustunSarlavha(t('Ish / resurs'), t('holat · belgilar'), { maydonlar: <>{FN(t('kod'), 'kod')}{FN(t('nom'), 'nom')}{FN(t('tur'), 'tur')}{FN(t('holat'), 'holat')}</> })}
                  {ustunSarlavha(t('Smeta'), t('hajm · birlik narxi'), { ong: true, maydonlar: <>{FN(t('hajm'), 'hajm')}{FN(t('birlik'), 'birlik')}{FN(t('narx'), 'narx')}</> })}
                  {ustunSarlavha(t('Bajarilish'), t('fakt va F2, smetaga nisbatan'), { maydonlar: <>{FN(t('foiz'), 'foiz')}{FN(t('fakt'), 'fakt')}{FN(t('F2'), 'f2')}</> })}
                  {ustunSarlavha(t('Bu fakt'), t('+ bugun · = jami'), { ong: true, filtr: F('kiritma') })}
                  {ustunSarlavha(t('Ochiq qoldiq'), t('smeta − fakt'), { ong: true, title: t('Ochiq qoldiq = smeta − fakt − almashtirilgan − bajarilmaydi'), filtr: F('ochiq') })}
                  {ustunSarlavha(t('F2 ga olish mumkin'), t('fakt − F2'), { ong: true, title: t('F2 ga olish mumkin = fakt − tasdiqlangan F2'), filtr: F('f2mumkin') })}
                  {ustunSarlavha(t('Fakt summasi'), t('ustamali · ustamasiz'), { ong: true, filtr: F('summa') })}
                  <span />
                </div>
                {korinadiIshSoni === 0 && <p className="p-6 text-center text-[13px] text-text-mute">{qidiruv || jf.soni ? t('Hech narsa topilmadi.') : t('Bu bo‘limda (ichki bo‘limlari bilan) ish yo‘q.')}</p>}
                {korinadi.map((bk, bi) => <div key={bk.bolim?.id ?? `b${bi}`}>
                  {bk.yol && <div className="border-b border-border bg-surface-2 px-3 py-1 text-[11px] text-text-mute">{bk.yol}</div>}
                  {bk.bolim && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-surface-2 py-2 pr-3" style={{ paddingLeft: 12 + (bk.nisbiy - 1) * 16 }} data-testid={`bolim-sarlavha-${bk.bolim.id}`}>
                    <button type="button" tabIndex={-1} onClick={() => setBolimId(bk.bolim!.id)} className="flex min-w-0 items-center gap-3 text-left" title={t('Shu bo‘limni ochish')}>
                      <span className="text-[12.5px] font-semibold text-[var(--accent-text)]">{bk.bolim.nom}</span>
                      <span className="text-[11px] tabular-nums text-text-mute">{t('{n} ish', { n: String(bk.bolim.ishSoni) })}</span>
                      <span className="w-[140px]"><BolimMeter ulush={bk.bolim.ulush} /></span>
                    </button>
                    <div className="flex flex-wrap items-start gap-2">
                      {summaQatori(summalar.get(bk.bolim.id))}
                      <button type="button" tabIndex={-1} onClick={() => qamrovBolim(bk.bolim!)} aria-label={t('Qamrov %: {nom}', { nom: bk.bolim.nom })} data-testid={`qamrov-bolim-${bk.bolim.id}`}
                        className="rounded border border-accent/40 px-1.5 text-[10px] font-semibold text-accent hover:bg-accent/10">{t('Qamrov %')}</button>
                    </div>
                  </div>}
                  {bk.ishlar.map((ish) => <div key={ish.id} className="border-b border-border">
                    {ishQatori(ish)}
                    {ishOchiq(ish.id) && ish.resurslar.filter(bolaKor(ish.id)).map((r) => resursQatori(r, false))}
                    {ishOchiq(ish.id) && ish.avtomatik.filter(bolaKor(ish.id)).map((a) => resursQatori(a, true))}
                  </div>)}
                </div>)}
              </div>
            </div>
          </section>
        </div>}

      {ozgarishSoni > 0 && <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-accent/50 bg-surface px-4 py-2.5" style={{ boxShadow: 'var(--shadow-pop)' }} role="region" aria-label={t('Saqlash paneli')}>
        <span className="text-[13px] font-semibold text-text">{t('{n} ta o‘zgarish', { n: String(ozgarishSoni) })}</span>
        {paket.xatolar.size > 0 && <span className="fz-chip fz-chip--warn">{t('{n} tasida xato — tuzating', { n: String(paket.xatolar.size) })}</span>}
        <span className="text-[12px] text-text-mute">{t('sana: {s}', { s: sana })}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setKiritmalar({})} className="fz-btn fz-btn--ghost"><RotateCcw size={13} /> {t('Bekor qilish')}</button>
          <button onClick={() => void saqla()} disabled={!paket.ok || band} className="fz-btn fz-btn--primary"><Save size={14} /> {band ? t('Saqlanmoqda…') : t('Saqlash')} <kbd className="fz-kbd">Ctrl+S</kbd></button>
        </div>
      </div>}

      <FaktAiYordamchi kompaniyaId={kompaniyaId} obyektId={obyektId}
        malumot={{ bolimlar, bolimIshlari, holatMap, summalar, bajHajm, materialTakliflari: (id) => takliflarSoni([id]), kiritmaSoni: ozgarishSoni }}
        amallar={{ kirit: (id, k) => kirit(id, k), materiallarniOl, korsat: (q) => setQidiruv(q.kod || q.nom), zamena: (q, n) => zamenaOch(q, n), bajarilmaydi: (q, h) => bajOch(q, h) }} />

      {tenglash && <FaktF2Tenglash sarlavha={tenglash.sarlavha} reja={tenglash.reja} obyektId={obyektId} kompaniyaId={kompaniyaId} sana={sana} holatMap={holatMap}
        onYop={() => setTenglash(null)} onBajarildi={() => holatniYangila()}
        aktBekor={faktF2Bekor} />}

      {qamrov && <FaktQamrov sarlavha={qamrov.sarlavha} ishlar={qamrov.ishlar} holatMap={holatMap} narxOl={narxOl} obyektId={obyektId} kompaniyaId={kompaniyaId} sana={sana}
        onYop={() => setQamrov(null)} onBajarildi={() => holatniYangila()} aktBekor={faktQamrovBekor} />}

      {narxModal && <FaktNarxlash kompaniyaId={kompaniyaId} obyektId={obyektId} qator={narxModal} onYop={() => setNarxModal(null)}
        onSaqlandi={(xabar) => { setNarxModal(null); toast(xabar, 'ok'); void tuzilmaniYangila(); }} />}

      {bajModal && <FaktBajarilmadiTez kompaniyaId={kompaniyaId} obyektId={obyektId} sana={sana} qator={bajModal} onYop={() => setBajModal(null)}
        onSaqlandi={(xabar) => { setBajModal(null); toast(xabar, 'ok'); void bajYangila(); }} />}

      {chiqModal && <ResursChiqarishModal kompaniyaId={kompaniyaId} obyektId={obyektId} sana={sana} qator={chiqModal} onYop={() => setChiqModal(null)}
        onSaqlandi={(xabar) => { setChiqModal(null); toast(xabar, 'ok'); void bajYangila(); }} />}

      {modal && <IshAbcModal kompaniyaId={kompaniyaId} obyektId={obyektId} sana={sana}
        bolimlar={bolimlar.map((b) => ({ id: b.id, versiya: b.versiya, nom: `${'· '.repeat(b.daraja)}${b.nom}` }))}
        rejim={modal.rejim} tahrir={modal.tahrir} normativId={modal.normativId} onYop={() => setModal(null)}
        almashtirishBelgila={modal.rejim.tur === 'resurs_zamena' ? zamenaMiqdorBelgila : undefined}
        onSaqlandi={(xabar) => { setModal(null); toast(xabar, 'ok'); void tuzilmaniYangila(); }} />}
    </div>
  );
}
