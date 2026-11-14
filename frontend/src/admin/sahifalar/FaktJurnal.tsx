import { matnSora, tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Ban, CheckCircle2, ChevronDown, ChevronRight, Cpu, MinusCircle, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Repeat2, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import { chiqarilganmi, chiqarishRuxsat, MEHNAT_ZAMENA_YOQ, mehnatResursmi } from '../../lib/resurs-amal';
import { ResursChiqarishModal, type ChiqarishQator } from './ResursChiqarishModal';
import { sbT2ZamenaAlmashtirishBelgila } from '../../api/t2-additional-replacement';
import { bajarilmadiBekor, bajarilmadiRoyxatOl, bajarilmadiXato, type BajarilmadiQator } from '../../api/t2-bajarilmadi';
import { bajarilmadiHajmlar, faktYigindiHisobla, narxlashMumkin } from '../../lib/fakt-studio';
import { FaktNarxlash, type NarxlashQator } from './FaktNarxlash';
import { FaktBajarilmadiTez, type BajarilmadiQatorInfo } from './FaktBajarilmadiTez';
import { FaktF2Izoh, FaktStudioBar } from './FaktStudioBar';
import { FaktAiYordamchi } from './FaktAiYordamchi';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from '../../lib/ustamali-summa';
import { yaxlit2, yigindi2 } from '../../lib/hisob-yadro';
import { faktSummaF2Narxda } from '../../lib/hisob-yadro/korinish';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { yangiOperationId, type T2Obyekt, type T2Qator } from '../../api/supabase';
import { FaktEgizakOyna } from './FaktEgizakOyna';
import { egizakObyektlar } from '../../lib/f2-moslash-v3/egizak';
import { faktdanKiritmalar } from '../../lib/fakt-egizak';
import { bolimIshlariYigish, faktF2Bekor, faktF2Reja, obyektF2Reja, type EskiF2Akt, type TenglashKontekst, type TenglashOyna } from '../../lib/fakt-f2-tenglash';
import { sbF2TasdiqNarxlar } from '../../api/t2-f2-narx';
import { FaktF2Tenglash } from './FaktF2Tenglash';
import { FaktTiklash } from './FaktTiklash';
import { sbTiklashQoralama } from '../../api/t2-fakt-tiklash';
import { tiklashSatrlar, type TiklashMeta, type TiklashSatr } from '../../lib/fakt-tiklash';
import { FaktQamrov } from './FaktQamrov';
import { faktQamrovBekor } from '../../lib/fakt-qamrov';
import { foizQoll, ustunJoylash, ustunOqi } from '../../lib/fakt-foiz-grid';
import { f2VersiyaKochirmaOl } from '../../api/t2-f2-versiya-kochirma';
import { avvalgiBilanF2Qoldiq, avvalgiF2Xaritasi, kochmaganBor, type F2VersiyaKochirma } from '../../lib/f2-versiya-kochirma';
import { t } from '../../i18n/til';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { useHotkeys, yordamOch } from '../../lib/hotkeys/useHotkeys';
import { inputdami, sarlavhaBilan } from '../../lib/hotkeys/core';
import { HOLAT_FILTRLAR, holatFiltrMos, keyingiMoslik, qoldimOl, qoldimYoz, type HolatFiltr } from '../../lib/fakt-klaviatura';
import { JURNAL_XATO_MATN, bolimMaxraji, bolimSummalari, bolimTarkibi, jurnalQur, kiritmaSoni, ochiqBor, qoldiqUlushi, type BolimSumma, type JurnalBolim, type JurnalHolat, type JurnalIsh, type JurnalQator, type Kiritma, type Rejim, type ZamenaBoglanish } from '../../lib/fakt-jurnal';
import { zamenaBoglanishOl } from '../../lib/fakt-zamena-boglanish';
import { tuzatishBoglanishlari } from '../../lib/smeta-anatomiya/tuzatish';
import { almashtirildiMatn, ochiqdanOrtiqcha, ochiqQoldiq } from '../../lib/zamena-qoldiq';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { ishMateriallari, materialTaklifi } from '../../lib/fakt-material-taklif';
import { moslikHisobla, moslikTuzilma, type MoslikNatija } from '../../lib/ish-material-moslik';
import { IshMaterialOgohBlok } from '../../components/fakt/IshMaterialOgoh';
import { toast } from '../../umumiy/ui/Toast';
import { IshAbcModal, type AbcRejim, type AbcTahrir } from './IshAbcModal';
import { abcXato, ishAbcOchir, type NarxManba } from '../../api/t2-ish-abc';
import { katAniqla, type AbcResurs } from '../../lib/ish-abc';
import { HOLAT_MUHR, f2OlishMumkin, faktMeter, jurnalXulosa, obyektUlushi as obyektUlushiHisobla } from '../../lib/fakt-korinish';
import { BolimMeter, FaktXulosaPanel, HolatMuhr, MeterLegenda, QatorMeter } from '../../components/fakt/FaktKorinish';
import { BirlikOgohBlok } from '../../components/fakt/BirlikOgoh';
import { qiymatBirlikOgohi } from '../../lib/fakt-birlik-ogoh';
import type { Daraxt, Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import { useJadvalFiltr } from '../../umumiy/jadval-filtr/useJadvalFiltr';
import { FiltrHolatQatori, UstunFiltrTugma } from '../../umumiy/jadval-filtr/UstunFiltrTugma';
import { FAKT_DARAXT, faktFiltrQatorlar, faktFiltrQoll, type FaktFiltrQator } from './FaktJadvalFiltr';
import { FaktInlineAmal, ZamenaJuftBelgi } from '../../components/fakt/FaktInlineAmal';
import { useFaktInlineTugmalar } from '../../components/fakt/useFaktInlineTugmalar';
import { bolimTop, ozgarishBor, zamenaJuftlari, zamenaYoqSabab, type InlineKontekst, type InlineTur } from '../../lib/fakt-inline-amal';
import { FaktQoralamaBanner } from '../../components/fakt/FaktQoralamaBanner';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { useKiritmaHolat } from '../../lib/ish-varaq/kiritma-holat';
import { useQoralamaHimoya } from '../../lib/ish-varaq/qoralama-himoya';
import { useKatakFokus, useVirtualSatrlar } from '../../lib/ish-varaq/virtual-satrlar';
import { chiqarilganlarOl } from '../../lib/ish-varaq/model';
import { useFaktSaqlash } from '../../lib/ish-varaq/fakt-saqlash';
import { faktPaketiQur } from '../../lib/ish-varaq/paket';
import { kataAmali } from '../../lib/ish-varaq/kata-klavish';
import { useSahifaTarkHimoyasi, useSaqlanmaganHimoya } from '../../lib/ish-varaq/saqlanmagan-himoya';

const MANBALAR: readonly NarxManba[] = ['smeta_obyekt', 'smeta_shartnoma', 'smeta', 'katalog', 'qolda'];

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));

/**
 * Fakt jurnali: chapda bo'limlar (bajarilish foizi), o'ngda tanlangan bo'lim ishlari (resurslari
 * bilan). Har qatorda "+" (bugun) yoki "=" (jami), 25/50/100% tezkor tugmalar; pastda doimiy
 * saqlash paneli — barcha o'zgarishlar BITTA tranzaksiyada (Ctrl+S). Klaviatura: Enter/↓ keyingi,
 * ↑ oldingi, Esc tozalash, "/" qidiruv.
 */
import type { SaqlashFn } from '../../lib/ish-varaq/fakt-saqlash';
export type { SaqlashFn, SaqlashNatija } from '../../lib/ish-varaq/fakt-saqlash';
// UI-only: null is autoselection; this sentinel never goes to the server.
const BOLIMSIZ = -1;

export function FaktJurnal({ kompaniyaId, obyektId, objects, rows, states, holatniYangila, tuzilmaniYangila, saqlashRef, f2Otish, boshBolimId = null, boshFaktsizF2 = false }: {
  kompaniyaId: number; obyektId: number;
  /** Kompaniya obyektlari (egizaklarni aniqlash uchun; yo'q bo'lsa «Egizaklarga ham yozish» ko'rinmaydi). */
  objects?: readonly T2Obyekt[];
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
  /** Saqlangan qator id lari berilsa — faqat ular (va ota/bolalari) holati qayta o'qiladi. */
  holatniYangila: (qatorIdlar?: readonly number[]) => Promise<void> | void;
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
  // Kiritma holati, tarix (Ctrl+Z), draft himoyasi, virtualizatsiya, yagona saqlash — lib/ish-varaq (Ish varag'i bilan umumiy).
  const { kiritmalar, setKiritmalar, tarix, setTarix, ommaviy, orqaga, tozala, kirit, ozgarishSoni } = useKiritmaHolat();
  const [bolimId, setBolimId] = useState<number | null>(boshBolimId);
  const [qidiruv, setQidiruv] = useState('');
  const [faqatQoldiq, setFaqatQoldiq] = useState(false);
  const [faktsizF2, setFaktsizF2] = useState(boshFaktsizF2);
  /** Qator ostidagi inline panel (zamena / qo'shimcha ish / material) va «Faqat zamena va qo'shimchalar» filtri. */
  const [inline, setInline] = useState<{ qatorId: number; tur: InlineTur } | null>(null);
  const [faqatOzgarish, setFaqatOzgarish] = useState(false);
  /** Klaviatura filtri (Alt+1…4): hammasi / kiritilganlar (yoqilgan paytdagi qoralama) / boshlanmagan / chala. */
  const [holatFiltr, setHolatFiltr] = useState<HolatFiltr>('hammasi');
  const [kiritilganIdlar, setKiritilganIdlar] = useState<ReadonlySet<number>>(new Set());
  /** Ish resurslarini ochish/yopish: `hammaYopiq` — umumiy holat, `teskari` — undan farq qiladigan ishlar. */
  const [hammaYopiq, setHammaYopiq] = useState(false);
  const [teskari, setTeskari] = useState<Set<number>>(new Set());
  const ishOchiq = (id: number) => (hammaYopiq ? teskari.has(id) : !teskari.has(id));
  const ishAlmashtir = (id: number) => setTeskari((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [yopiqBolim, setYopiqBolim] = useState<Set<number>>(new Set());
  const [saqlangan, setSaqlangan] = useState<Set<number>>(new Set());
  /* «Saqlandi» belgisini olib tashlovchi taymer: unmount da bekor qilinadi (aks holda kech setState teardown dan keyin ishlaydi). */
  const saqlanganTaymer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saqlanganTaymer.current) clearTimeout(saqlanganTaymer.current); }, []);
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
    const sabab = await matnSora({ matn: `«${q.nom}» o‘chirilsinmi? ${q.zamena ? 'Asl qator qaytadi.' : 'Ish va uning resurslari, fakti o‘chiriladi (arxivda qoladi).'}`, yorliq: 'Sabab (ixtiyoriy):', tasdiqMatni: 'O‘chirish', xavfli: true });
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
  // Svod yaxlit (ustama o'qishi bilan bir so'rov, react-query keshi) — bo'lim/obyekt summalari eksport modeli bilan bir xil.
  const { svodYaxlit } = useUstamaliSumma(obyektId, { kompaniyaId });
  const yigindi = useMemo(() => faktYigindiHisobla(rows, states, bajarilmadi, svodYaxlit), [rows, states, bajarilmadi, svodYaxlit]);
  const [narxModal, setNarxModal] = useState<NarxlashQator | null>(null);
  const bajBekor = async (qatorId: number, nom: string) => {
    const faol = bajarilmadi.filter((b) => b.qator_id === qatorId && b.holat === 'faol').sort((a, b) => b.id - a.id)[0];
    if (!faol) return;
    if (!await tasdiqSora(t('«{nom}»: «bajarilmaydi» belgisi ({hajm}) bekor qilinsinmi?', { nom, hajm: fmt(faol.bajarilmagan_hajm) }))) return;
    const r = await bajarilmadiBekor({ kompaniyaId, id: faol.id, operationId: yangiOperationId() }).catch(() => null);
    if (!r?.ok) { toast(r ? t(bajarilmadiXato(r)) : t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); return; }
    toast(t('Belgi bekor qilindi.'), 'ok'); await bajYangila();
  };
  const bajOch = (q: JurnalQator, boshlangichHajm: number | null = null) => setBajModal({ id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, smeta: q.smeta, fakt: q.fakt, belgilangan: bajHajm.get(q.id) ?? 0, almashtirilgan: q.almashtirilgan, boshlangichHajm });
  const katakFokus = useKatakFokus();
  const { inputlar, fokusId, setFokusId } = katakFokus;
  const jadvalRef = useRef<HTMLDivElement | null>(null);
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
  // Smeta versiyasi faollashtirilgan bo'lsa: eski qatorlardagi tasdiqlangan F2 → yangi faol qator (faqat belgi; jamilarga qo'shilmaydi).
  const [kochirma, setKochirma] = useState<F2VersiyaKochirma | null>(null);
  useEffect(() => {
    let tirik = true;
    void f2VersiyaKochirmaOl(obyektId).then((r) => { if (tirik) setKochirma(r.ok ? r.natija : null); }).catch(() => undefined);
    return () => { tirik = false; };
  }, [obyektId]);
  const avvalgiF2 = useMemo(() => avvalgiF2Xaritasi(kochirma), [kochirma]);
  const { bolimlar, bolimIshlari, ildizIshlari } = useMemo(() => jurnalQur(rows, states, zb, bajHajm), [rows, states, zb, bajHajm]);
  /** Zamena juftlari (asl ↔ zamena) — belgilar orqali bir-biriga o'tish. */
  const juftlar = useMemo(() => zamenaJuftlari(zb), [zb]);
  /** Ishdan chiqarilgan resurslar to'plami — bo'lim/obyekt fakt jamisiga qo'shilmaydi. */
  const chiqarilganlar = useMemo(() => chiqarilganlarOl(rows, states, bajHajm), [rows, states, bajHajm]);

  const summalar = useMemo(() => bolimSummalari(rows, states, chiqarilganlar, svodYaxlit), [rows, states, chiqarilganlar, svodYaxlit]);
  // Ishdan KEYIN turgan alohida materiallar (ota = bo'lim) — ish ulushida fakt TAKLIFI (avtomatik yozilmaydi).
  // Ish ichidagi mat/ob bolalari va ishdan keyingi alohida mat/ob — ish ulushida TAKLIF (ergashish qoidasi; avtomatik yozilmaydi).
  const keyingiMat = useMemo(() => ishMateriallari(rows), [rows]);
  const matIshi = useMemo(() => { const m = new Map<number, number>(); for (const [ish, ms] of keyingiMat) for (const x of ms) m.set(x, ish); return m; }, [keyingiMat]);
  const jurnalById = useMemo(() => { const m = new Map<number, JurnalQator>(); for (const arr of [...bolimIshlari.values(), ildizIshlari]) for (const x of arr) m.set(x.id, x); return m; }, [bolimIshlari, ildizIshlari]);
  /** Barcha jurnal qatorlari (ishlar va ularning resurslari). */
  const barchaById = useMemo(() => { const m = new Map<number, JurnalQator>(); for (const arr of [...bolimIshlari.values(), ildizIshlari]) for (const x of arr) { m.set(x.id, x); for (const r of [...x.resurslar, ...x.avtomatik]) m.set(r.id, r); } return m; }, [bolimIshlari, ildizIshlari]);
  const faktlar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, Number(x.fakt_hajm ?? 0)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? 0])); }, [rows, states]);
  useEffect(() => { if (bolimId == null) { if (bolimlar.length) setBolimId(bolimlar[0].id); else if (ildizIshlari.length) setBolimId(BOLIMSIZ); } }, [bolimId, bolimlar, ildizIshlari]);

  // ── Brauzer qoralamasi (draft himoyasi) — lib/ish-varaq/qoralama-himoya (hodisa 2026-11-09). ──
  // Foydalanuvchi id kalitda (bir profilda ikki hisob almashsa, B A ning saqlanmagan qoralamasini ko'rmaydi).
  const foydalanuvchiId = useKompaniya().foydalanuvchi?.id ?? null;
  const { tiklandi, ziddiyatMap, qoralamaYozDarhol, qoralamaBekor, qoralamaTozala } = useQoralamaHimoya({
    kompaniyaId, obyektId, foydalanuvchiId, qatorSoni: rows.length, faktlar, kiritmalar, setKiritmalar,
    tarixTozala: () => setTarix([]), sana, setSana,
  });

  const smetalar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, x.smeta_hajm == null ? null : Number(x.smeta_hajm)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? (r.hajm == null ? null : Number(r.hajm))])); }, [rows, states]);
  // Tuzatish qatorlari (qalinlik/norma tuzatishi) — smeta yadrosi bog'laydi; fakti asosiy ishga ergashadi (hosila, qo'lda kiritilmaydi).
  const tuzatish = useMemo(() => tuzatishBoglanishlari(rows), [rows]);
  const paket = useMemo(() => faktPaketiQur(kiritmalar, faktlar, smetalar, tuzatish), [kiritmalar, faktlar, smetalar, tuzatish]);

  /** Tuzatish qatorining kutilayotgan fakti (asos kiritmasi bilan) — faqat ko'rsatish. */
  const tuzatishKutilgan = (q: JurnalQator): number | null => {
    const asosId = tuzatish.asos.get(q.id); if (asosId == null) return null;
    const x = paket.qatorlar.find((p) => p.qator_id === q.id);
    return x ? Math.round((q.fakt + x.hajm) * 1e6) / 1e6 : null;
  };

  // ── «Fakt = F2»: F2 hajmi fakt dan ko'p bo'lgan ishlarga farqni yozish (oldindan ko'rish + bekor qilish). ──
  const [tenglash, setTenglash] = useState<TenglashOyna | null>(null);
  // Egizak obyektlar (bir loyiha — F2EgizakNusxa qoidasi): «Egizaklarga ham yozish» oynasi.
  const [egizakOyna, setEgizakOyna] = useState(false);
  const egizaklar = useMemo(() => egizakObyektlar(objects ?? [], obyektId), [objects, obyektId]);
  const obyektNom = (objects ?? []).find((o) => o.id === obyektId)?.nom ?? `#${obyektId}`;
  const holatMap = useMemo(() => new Map(states.map((s) => [s.qator_id, s])), [states]);
  /** Ustamali summa (egasi 2026-10-24): resurs kat'i smeta qatoridan (t2_qator.kat) - M/K, КАБ, БЕЗ СКЛАД ham aniq; ish (bl) o'z narxiga ega emas - resurslar yig'indisi. */
  const taxminKesim = (q: JurnalQator): { fakt: KatKesim; smeta: KatKesim; faktSumma: number; smetaSumma: number } | null => {
    // NULL ≠ 0: summasi noma'lum resurs 0 deb olinmaydi — kesimda «summasiz», yig'indiga kirmaydi (yadro yigindi2).
    const sm = (x: JurnalQator): number | null => { const v = holatMap.get(x.id)?.smeta_summa; return v == null || !Number.isFinite(Number(v)) ? null : Number(v); };
    const bolalar = 'resurslar' in q ? [...(q as JurnalIsh).resurslar, ...(q as JurnalIsh).avtomatik] : [];
    const qismlar = q.tur === 'bl' ? bolalar : [q];
    const asos = yigindi2(qismlar.map(sm));
    // Smeta narxi yo'q (F2 importida qo'shilgan resurs) — fakt summasi F2 narxida (yadro faktSummaF2Narxda; bo'lim jami bilan bir xil).
    if (!(asos > 0) && q.tur !== 'bl') {
      const h = holatMap.get(q.id);
      const f = faktSummaF2Narxda(q.fakt, h?.f2_hajm, h?.f2_summa, h?.fakt_summa, h?.f2_summa_yoq).summa;
      if (f == null) return null;
      const fakt = bosKatKesim(), smeta = bosKatKesim();
      katKesimgaQosh(fakt, rowById.get(q.id)?.kat, f);
      return { fakt, smeta, faktSumma: f, smetaSumma: 0 };
    }
    if (!(asos > 0) || q.ulush == null) return null;
    const ulush = q.ulush;
    const fakt = bosKatKesim(), smeta = bosKatKesim();
    // Ishdan chiqarilgan resurs (F2 ga kirmaydi) fakt summasiga qo'shilmaydi; smeta summasi o'zgarmaydi (asl smeta CONST).
    const faktQism: Array<number | null> = [];
    for (const x of qismlar) { const kat = rowById.get(x.id)?.kat; const s = sm(x); katKesimgaQosh(smeta, kat, s); if (q.tur === 'bl' && chiq(x)) continue; const f = s == null ? null : yaxlit2(s * ulush); katKesimgaQosh(fakt, kat, f); faktQism.push(f); }
    return { fakt, smeta, faktSumma: yigindi2(faktQism), smetaSumma: asos };
  };
  const bolimBolalari = useMemo(() => { const m = new Map<number, number[]>(); for (const b of bolimlar) if (b.otaId != null) m.set(b.otaId, [...(m.get(b.otaId) ?? []), b.id]); return m; }, [bolimlar]);
  const kiritmaOgoh = () => { if (ozgarishSoni) toast(t('Saqlanmagan kiritmalar bor — qamrov serverdagi faktdan hisoblanadi; avval saqlang yoki tozalang.'), 'warn'); };
  /**
   * «Fakt = F2» konteksti: tasdiqlangan F2 qatorlari narxi (egasi 2026-10-28 — fakt F2 narxi bilan yoziladi) va smeta narxi.
   * F2 narxlari yuklanmasa oyna OCHILMAYDI: aks holda ko'rilgan summa yoziladigandan farq qilardi.
   */
  const [tenglashYuk, setTenglashYuk] = useState(false);
  const tenglashKontekst = async (): Promise<{ ktx: TenglashKontekst; eskiAktlar: EskiF2Akt[] } | null> => {
    setTenglashYuk(true);
    try {
      const r = await sbF2TasdiqNarxlar(obyektId);
      if (!r.ok) { toast(t('F2 narxlari yuklanmadi — «Fakt = F2» ochilmadi. Qayta urinib ko‘ring.'), 'danger'); return null; }
      return { ktx: { f2Narx: r.narxlar, directFakt: r.directFakt, f2Satrlar: r.f2Satrlar, nusxalangan: r.nusxalangan, qolda: r.qolda, f2Delta: r.f2Delta, smetaNarx: (id) => narxOl(id) }, eskiAktlar: r.eskiAktlar };
    } finally { setTenglashYuk(false); }
  };
  const tenglashOch = async (sarlavha: string, ishlar: JurnalIsh[]) => {
    if (tenglashYuk) return;
    kiritmaOgoh();
    const k = await tenglashKontekst(); if (!k) return;
    setTenglash({ sarlavha, reja: faktF2Reja(ishlar, holatMap, null, k.ktx), eskiAktlar: k.eskiAktlar });
  };
  /** «Fakt = F2» BUTUN OBYEKT bo'yicha: har bo'limning o'z ishlari (har ish bir marta) + bo'limsiz ishlar; oldindan ko'rishda bo'lim jamisi. */
  const tenglashObyekt = async () => {
    if (tenglashYuk) return;
    kiritmaOgoh();
    const k = await tenglashKontekst(); if (!k) return;
    const guruhlar = [...bolimlar.map((b) => ({ nom: b.nom, ishlar: bolimIshlari.get(b.id) ?? [] })), { nom: t('Bo‘limsiz'), ishlar: ildizIshlari }];
    setTenglash({ sarlavha: t('Butun obyekt (barcha bo‘limlar)'), reja: obyektF2Reja(guruhlar, holatMap, k.ktx), eskiAktlar: k.eskiAktlar });
  };

  /** «Fakt tiklash»: dalil (tasdiqlangan + qoralama F2) bo‘yicha butun obyekt takliflari; faqat o‘qish, yozish oynada (bitta tasdiq). */
  const [tiklash, setTiklash] = useState<TiklashSatr[] | null>(null);
  const tiklashOch = async () => {
    if (tenglashYuk) return;
    kiritmaOgoh();
    {
      const [k, q] = await Promise.all([tenglashKontekst(), sbTiklashQoralama(obyektId)]);
      if (!k) return;
      if (!q.ok) { toast(t('Qoralama F2 yuklanmadi — «Fakt tiklash» ochilmadi. Qayta urinib ko‘ring.'), 'danger'); return; }
      const guruhlar = [...bolimlar.map((b) => ({ nom: b.nom, ishlar: bolimIshlari.get(b.id) ?? [] })), { nom: t('Bo‘limsiz'), ishlar: ildizIshlari }];
      const meta: TiklashMeta[] = []; const korildi = new Set<number>();
      for (const g of guruhlar) for (const ish of g.ishlar) for (const x of [ish as JurnalQator, ...ish.resurslar, ...ish.avtomatik]) {
        if (korildi.has(x.id)) continue; korildi.add(x.id);
        meta.push({ id: x.id, tur: x.tur, nom: x.nom, birlik: x.birlik, kat: rowById.get(x.id)?.kat ?? x.kat ?? null, bolim: g.nom });
      }
      setTiklash(tiklashSatrlar({ reja: obyektF2Reja(guruhlar, holatMap, k.ktx), holat: holatMap, meta, qoralama: q.yigma, qoralamaRaqam: q.raqam, smetaNarx: (id) => narxOl(id) }));
    }
  };

  // ── «Qamrov %» (Tiklash rejimi): bo'lim (avlodlari bilan) yoki ish → foiz × ochiq qoldiq; oldindan ko'rish + bitta tranzaksiya + bekor qilish. ──
  const [qamrov, setQamrov] = useState<{ sarlavha: string; ishlar: JurnalIsh[] } | null>(null);
  const qamrovBolim = (b: JurnalBolim) => { kiritmaOgoh(); setQamrov({ sarlavha: b.nom, ishlar: bolimIshlariYigish(b.id, bolimIshlari, bolimBolalari, true) }); };
  const qamrovIsh = (ish: JurnalIsh) => { kiritmaOgoh(); setQamrov({ sarlavha: [ish.kod, ish.nom].filter(Boolean).join(' '), ishlar: [ish] }); };
  const narxOl = useCallback((id: number): number | null => {
    const h = holatMap.get(id); const r = rowById.get(id);
    return h?.smeta_narx != null ? Number(h.smeta_narx) : r?.narx != null ? Number(r.narx) : null;
  }, [holatMap, rowById]);

  // ── Inline zamena / qo'shimcha (egasi 2026-11-07): faol qator OSTIDA panel; yozuv mantiqi — components/fakt/FaktInlineAmal. ──
  const inlineById = useMemo(() => { const m = new Map<number, JurnalQator>(); for (const arr of [...bolimIshlari.values(), ildizIshlari]) for (const x of arr) { m.set(x.id, x); for (const r of [...x.resurslar, ...x.avtomatik]) m.set(r.id, r); } return m; }, [bolimIshlari, ildizIshlari]);
  const inlineQator = inline ? inlineById.get(inline.qatorId) ?? null : null;
  const inlineKontekst = useMemo((): InlineKontekst | null => {
    if (!inlineQator) return null;
    const ota = inlineQator.otaId != null ? rowById.get(inlineQator.otaId) : undefined;
    return {
      otaIshHajm: inlineQator.tur !== 'bl' && ota?.tur === 'bl' && ota.hajm != null ? Number(ota.hajm) : null,
      bolim: bolimTop(inlineQator.otaId, (id) => rowById.get(id)),
      zamenaYoq: zamenaYoqSabab(inlineQator, { mehnat: mehnatResursmi(inlineQator), chiqarilgan: chiq(inlineQator), mehnatMatn: MEHNAT_ZAMENA_YOQ }),
    };
    // chiq — bajHajm dan hosila
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineQator, rowById, bajHajm]);
  const inlineOch = (qatorId: number, tur: InlineTur) => { if (!inlineById.has(qatorId)) return false; setInline({ qatorId, tur }); };
  const inlineYop = () => { const id = inline?.qatorId; setInline(null); if (id != null) fokusgaOt(id); };
  /** Juft qatorga o'tish: ko'rinsa — fokus/ko'rsatish; boshqa bo'limda bo'lsa — qidiruv orqali ko'rsatiladi. */
  const juftgaOt = (id: number) => {
    if (kirishIndeks.has(id)) { fokusgaOt(id); return; }
    const i = satrIndeks.get(id);
    if (i != null) { if (kattaJurnal) virtual.scrollToIndex(i, { align: 'center' }); else document.querySelector(`[data-testid="ish-${id}"],[data-testid="resurs-${id}"]`)?.scrollIntoView?.({ block: 'center' }); return; }
    const q = inlineById.get(id); if (q) setQidiruv(q.kod || q.nom);
  };
  useFaktInlineTugmalar({ faolQatorId: fokusId, och: (tur) => (fokusId == null ? false : inlineOch(fokusId, tur)),
    faol: !modal && !tenglash && !tiklash && !bajModal && !narxModal && !qamrov && !chiqModal && !egizakOyna });

  // Ko'rinadigan bo'laklar: qidiruv bo'lsa — butun obyekt bo'yicha (har ish o'z bo'lim yo'li bilan);
  // aks holda tanlangan bo'lim va uning BARCHA avlod bo'limlari (egasi 2026-10-25: «ichi bo'sh» chiqmasin).
  type Bolak = { bolim: JurnalBolim | null; nisbiy: number; yol?: string; ishlar: JurnalIsh[] };
  const korinadiAsos = useMemo((): Bolak[] => {
    const q = qidiruvKaliti(qidiruv.trim());
    const mos = (x: JurnalQator) => qidiruvKaliti(`${x.kod ?? ''} ${x.nom}`).includes(q);
    // «Fakti yo'q, lekin F2 olingan» (pereraschet → fakt jurnali): tasdiqlangan F2 bor, fakt 0.
    const faktsiz = (x: JurnalQator) => { const h = holatMap.get(x.id); return Number(h?.f2_hajm ?? 0) > 1e-9 && !(Number(h?.fakt_hajm ?? 0) > 1e-9); };
    const hf = (x: JurnalQator) => holatFiltrMos(holatFiltr, x, kiritilganIdlar);
    const filtr = (ish: JurnalIsh) => (!faqatQoldiq || ochiqBor(ish) || ish.resurslar.some(ochiqBor))
      && (holatFiltr === 'hammasi' || hf(ish) || ish.resurslar.some(hf))
      && (!faktsizF2 || faktsiz(ish) || ish.resurslar.some(faktsiz) || ish.avtomatik.some(faktsiz))
      && (!q || mos(ish) || ish.resurslar.some(mos) || ish.avtomatik.some(mos))
      && (!faqatOzgarish || ozgarishBor(ish, juftlar.zamenalar));
    if (q || faktsizF2 || faqatOzgarish) {
      const out: Bolak[] = [];
      for (const b of bolimlar) {
        const ishlar = (bolimIshlari.get(b.id) ?? []).filter(filtr);
        if (ishlar.length) out.push({ bolim: null, nisbiy: 0, yol: b.nom, ishlar });
      }
      const ildiz = ildizIshlari.filter(filtr);
      if (ildiz.length) out.push({ bolim: null, nisbiy: 0, yol: t('Bo‘limsiz'), ishlar: ildiz });
      return out;
    }
    if (bolimId === BOLIMSIZ) return [{ bolim: null, nisbiy: 0, ishlar: ildizIshlari.filter(filtr) }];
    if (bolimId == null) return [];
    const tarkib = bolimTarkibi(bolimId, bolimlar, bolimIshlari).map((x) => ({ ...x, ishlar: x.ishlar.filter(filtr) }));
    // Filtrdan keyin bo'sh qolgan shoxlar tashlanadi (ishli avlodi bor bo'lim sarlavhasi qoladi).
    const toliq = new Set<number>();
    for (let i = tarkib.length - 1; i >= 0; i--) { const x = tarkib[i]; if (x.ishlar.length || toliq.has(x.bolim.id)) { toliq.add(x.bolim.id); if (x.bolim.otaId != null) toliq.add(x.bolim.otaId); } }
    return tarkib.filter((x) => x.nisbiy === 0 || toliq.has(x.bolim.id)).map((x) => ({ bolim: x.nisbiy === 0 ? null : x.bolim, nisbiy: x.nisbiy, ishlar: x.ishlar }));
  }, [qidiruv, faqatQoldiq, faktsizF2, faqatOzgarish, juftlar, holatMap, bolimId, bolimlar, bolimIshlari, ildizIshlari, holatFiltr, kiritilganIdlar]);

  /** Qatorning (kiritma bilan) fakti: «+» — joriy + bugun; «=» — jami; kiritma yo'q/xato — joriy. */
  const samaraliFakt = (q: JurnalQator) => {
    const k = kiritmalar[q.id]; const n = k ? kiritmaSoni(k.qiymat, q.smeta) : null;
    return typeof n !== 'number' || !Number.isFinite(n) ? q.fakt : k!.rejim === '+' ? q.fakt + n : n;
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
  // Ish ↔ material hajm muvofiqligi (egasi 2026-11-11; lib/ish-material-moslik): ish va materiallari shu sessiyada kiritilgan bo'lsa,
  // ish hajmi materiallardan hisoblangandan >3 % farq qilsa — ogohlantirish + «tuzatish taklifi» (bloklamaydi, avtomatik yozilmaydi).
  const moslikTuz = useMemo(() => moslikTuzilma(rows), [rows]);
  const moslikOgoh = useMemo(() => {
    const out = new Map<number, MoslikNatija>();
    const faqat = new Set<number>();
    for (const [id, k] of Object.entries(kiritmalar)) {
      if (!k.qiymat.trim()) continue;
      const q = Number(id); const ish = moslikTuz.has(q) ? q : matIshi.get(q);
      if (ish != null && moslikTuz.has(ish)) faqat.add(ish);
    }
    if (!faqat.size) return out;
    const hajm = new Map<number, number>();
    const qosh = (id: number) => { const q = barchaById.get(id); if (q) hajm.set(id, samaraliFakt(q)); };
    for (const ish of faqat) { qosh(ish); for (const m of moslikTuz.get(ish)?.materiallar ?? []) if (m.id != null) qosh(m.id); }
    for (const n of moslikHisobla(moslikTuz, hajm, { faqat })) if (n.ishId != null) out.set(n.ishId, n);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- samaraliFakt kiritmalar/barchaById ga bog'liq
  }, [moslikTuz, kiritmalar, matIshi, barchaById]);

  const { band, saqla, saqlaKlav, ishda: ishdaRef } = useFaktSaqlash({
    obyektId, sana, kiritmalar, paket, faktlar, smetalar, ozgarishSoni, holatniYangila, tozala, qoralamaYozDarhol, qoralamaTozala, fokusgaOt: (id) => fokusgaOt(id),
    qatorOl: (id) => barchaById.get(id), izoh: `Fakt jurnali: ${paket.qatorlar.length} qator`,
    onSaqlandi: (ids) => { setSaqlangan(ids); if (saqlanganTaymer.current) clearTimeout(saqlanganTaymer.current); saqlanganTaymer.current = setTimeout(() => setSaqlangan(new Set()), 2500); },
  });
  // Saqlanmagan kiritma bor — yangi versiya chiqsa sahifa avtomatik yangilanmaydi (banner qoralama saqlanganini aytadi).
  useSaqlanmaganHimoya('fakt-jurnal', ozgarishSoni);
  useEffect(() => {
    if (!saqlashRef) return;
    saqlashRef.current = async () => (ishdaRef.current ? ishdaRef.current : (ozgarishSoni ? saqla() : true));
    return () => { saqlashRef.current = null; };
  });

  /** Jurnal tugmalari faqat ustida oyna ochiq bo'lmaganda ishlaydi. */
  const jurnalFaol = !modal && !tenglash && !tiklash && !bajModal && !narxModal && !qamrov && !chiqModal && !egizakOyna;
  // Yagona klaviatura moduli (lib/hotkeys): Ctrl+S saqlash, / qidiruv, F — Fakt = F2 (tanlangan bo'lim), Esc — kiritmalarni tozalash.
  useHotkeys('fakt', t('Fakt jurnali'), [
    { id: 'fakt.saqla', keys: ['ctrl+s', 'ctrl+enter'], nom: t('Saqlash'), inInput: true, run: () => { saqlaKlav(); } },
    { id: 'fakt.qidiruv', keys: '/', nom: t('Qidirish'), run: () => { qidiruvRef.current?.focus(); } },
    { id: 'fakt.f2', keys: 'f', nom: t('Fakt = F2 (tanlangan bo‘lim)'), run: () => { const b = bolimlar.find((x) => x.id === bolimId); if (!b) return false; void tenglashOch(b.nom, bolimIshlariYigish(b.id, bolimIshlari, bolimBolalari, true)); } },
    { id: 'fakt.f2.obyekt', keys: 'shift+f', nom: t('Fakt = F2 (butun obyekt)'), run: () => { if (!bolimlar.length && !ildizIshlari.length) return false; void tenglashObyekt(); } },
    { id: 'fakt.tozala', keys: 'esc', nom: t('Kiritilganlarni bekor qilish'), run: () => { if (!ozgarishSoni) return false; ommaviy({}); } },
    { id: 'fakt.orqaga', keys: 'ctrl+z', nom: t('Orqaga (ommaviy kiritma)'), run: () => orqaga() },
    { id: 'fakt.qamrov', keys: '%', nom: t('Qamrov % (tanlangan bo‘lim)'), run: () => { if (faolQamrov() !== false) return; const b = bolimlar.find((x) => x.id === bolimId); if (!b || qidiruv) return false; qamrovBolim(b); } },
  ], jurnalFaol);
  useSahifaTarkHimoyasi(ozgarishSoni);

  const klaviatura = (e: KeyboardEvent<HTMLInputElement>, id: number) => {
    const i = kirishIndeks.get(id) ?? -1;
    // Tugma xaritasi — lib/ish-varaq/kata-klavish (Ish varag'i bilan bir xil). Ctrl+Enter / Ctrl+S — yagona hotkeys moduli ('otkaz'): ikki marta saqlanmasin.
    // Egasi 2026-10-31: katakda «%» endi oyna ochmaydi — «50%» yoziladi (smeta foizi, shu qatorning o'zi; Qamrov % — qator tugmasi).
    switch (kataAmali(e, tarix.length > 0)) {
      case 'keyingi': e.preventDefault(); fokusgaOt(kirishTartib[i + 1]); break;
      case 'oldingi': e.preventDefault(); if (i > 0) fokusgaOt(kirishTartib[i - 1]); else qidiruvRef.current?.focus(); break;
      case 'tab+': case 'tab-': { const next = kirishTartib[i + (e.shiftKey ? -1 : 1)]; if (next != null) { e.preventDefault(); fokusgaOt(next); } break; }
      // Esc — tahrirni bekor qilish: katak kirishdagi qiymatiga qaytadi, fokus qatorning o'ziga (navigatsiya rejimi).
      case 'bekor': e.preventDefault(); tahrirBekor(id); break;
      case 'bajarilmadi': { e.preventDefault(); const q = barchaById.get(id); if (q) bajOch(q); break; }
      case 'orqaga': e.preventDefault(); orqaga(); break;
      default: break;
    }
  };
  /** Excel'dan ustun joylash: bir nechta qator bo'lsa — shu katakdan pastga ketma-ket (qoralamaga; saqlash — bitta). */
  const joyla = (e: ClipboardEvent<HTMLInputElement>, id: number) => {
    const qiymatlar = ustunOqi(e.clipboardData.getData('text'));
    const i = kirishIndeks.get(id);
    if (!qiymatlar || i == null) return;
    e.preventDefault();
    const r = ustunJoylash(kiritmalar, kirishTartib, i, qiymatlar);
    ommaviy(r.kiritmalar);
    toast(t('{n} ta qiymat joylandi — tekshirib saqlang (Ctrl+S).', { n: r.joylandi }), 'ok');
  };

  /** Qidiruv maydonidan: ↓ / Enter — birinchi ko'rinadigan qatorning hajm katagiga; Esc — qidiruvni tozalash. */
  const qidiruvKlav = (e: KeyboardEvent<HTMLInputElement>) => {
    // ↓ / Enter — birinchi mos qatorga (navigatsiya rejimi; Enter yoki raqam — tahrir).
    if (e.key === 'ArrowDown' || e.key === 'Enter') { const i = birinchiMos(); if (i != null) { e.preventDefault(); faolQil(satrlar[i].key, { fokus: true }); } }
    else if (e.key === 'Escape' && qidiruv) { e.preventDefault(); setQidiruv(''); }
  };

  // Oddiy render funksiyasi (komponent emas) — input fokusini yo'qotmaslik uchun.
  const kiritish = (q: JurnalQator, kichik?: boolean) => {
    if (tuzatish.asos.has(q.id)) {
      // Hosila: fakt asosiy ish faktidan (tuzatish.hajm × asos.fakt / asos.hajm), qo'lda kiritilmaydi.
      const kut = tuzatishKutilgan(q);
      return <div className="text-right text-[11px] text-text-mute" data-testid="tuzatish-hosila" title={t('Fakt asosiy ish faktidan avtomatik hisoblanadi')}>
        {kut != null ? <span className="font-mono text-[12px] text-text">→ {fmt(kut)}</span> : t('avtomatik')}
      </div>;
    }
    const k = kiritmalar[q.id] ?? { rejim: '+' as Rejim, qiymat: '' };
    const xato = paket.xatolar.get(q.id);
    const yangiFakt = (() => { const n = kiritmaSoni(k.qiymat, q.smeta); if (typeof n !== 'number' || !Number.isFinite(n)) return null; return k.rejim === '+' ? q.fakt + n : n; })();
    // Ochiq qoldiqdan (smeta − fakt − almashtirilgan − bajarilmaydi; yagona formula) oshsa — faqat ogohlantirish, bloklanmaydi.
    const ortiqcha = xato || yangiFakt == null ? null : ochiqdanOrtiqcha({ smeta: q.smeta, fakt: yangiFakt, almashtirilgan: q.almashtirilgan, bajarilmaydi: q.bajarilmaydi });
    const oshdi = (ortiqcha ?? 0) > 0;
    const izoh = yangiFakt != null && <div className={`absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10.5px] ${oshdi ? 'font-semibold text-warn' : 'text-text-mute'}`} data-testid={oshdi ? 'qoldiqdan-oshdi' : undefined}>→ {fmt(yangiFakt)}{q.smeta ? ` / ${fmt(q.smeta)}` : ''}{oshdi ? ` · ${t('qoldiqdan oshdi')} +${fmt(ortiqcha)}` : ''}</div>;
    // Birlik xatosi gumoni (bloklamaydi): smeta birligi «100М3» bo'lsa 300 → 3,00 taklifi, bir tugmada tuzatiladi.
    const birlikOgoh = xato ? null : qiymatBirlikOgohi(k.qiymat, k.rejim, q.smeta, q.fakt, q.birlik);
    const asosiy = <div className="flex flex-wrap-reverse items-center justify-end gap-1">
      <div className="flex w-full justify-end gap-0.5 empty:hidden">{!kichik && [25, 50, 75, 100].map((p) => { const v = qoldiqUlushi(q, p); return v ? <button key={p} type="button" tabIndex={-1} onClick={() => kirit(q.id, { rejim: '+', qiymat: v })} title={t('Ochiq qoldiqning {p}% i', { p: String(p) })} className="h-6 rounded-[var(--radius-xs)] border border-border px-1 font-mono text-[10.5px] text-text-dim hover:border-accent hover:text-text">{p}%</button> : null; })}</div>
      <div className="inline-flex h-6 overflow-hidden rounded-[var(--radius-xs)] border border-border-strong text-[12px]" role="group" aria-label={t('Kiritish rejimi')}>
        {(['+', '='] as Rejim[]).map((r) => <button key={r} type="button" tabIndex={-1} aria-pressed={k.rejim === r} title={r === '+' ? t('Bugun bajarilgan hajm (qo‘shiladi)') : t('Jami fakt (shu qiymatga tenglashtiriladi)')} onClick={() => kirit(q.id, { rejim: r })} className={`w-6 font-semibold ${k.rejim === r ? 'bg-accent text-[var(--on-accent)]' : 'text-text-dim hover:bg-surface-3'}`}>{r}</button>)}
      </div>
      <div className="relative">
        <input ref={(el) => { if (el) inputlar.current.set(q.id, el); else inputlar.current.delete(q.id); }} onFocus={(e) => { e.currentTarget.select(); setFokusId(q.id); tahrirBosh(q.id); }} value={k.qiymat} onChange={(e) => kirit(q.id, { qiymat: e.target.value })} onKeyDown={(e) => klaviatura(e, q.id)} onPaste={(e) => joyla(e, q.id)} inputMode="decimal"
          placeholder={k.rejim === '+' ? t('bugun') : t('jami')} title={t('Son yoki foiz (masalan 50% — smeta hajmining yarmi). Enter — pastga, Excel ustunini joylash mumkin.')} aria-label={`${k.rejim === '+' ? 'Bugun bajarildi' : 'Jami fakt'}: ${q.nom}`}
          className={`h-7 w-[80px] rounded-[var(--radius-sm)] border bg-bg px-2 text-right font-mono text-[13px] tabular-nums outline-none focus:border-accent ${xato || oshdi ? 'border-warn' : k.qiymat ? 'border-accent' : 'border-border-strong'}`} />
        {xato ? <div className="absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10.5px] font-semibold text-warn">{t(JURNAL_XATO_MATN[xato])}</div> : izoh}
      </div>
    </div>;
    // Doim bir xil o'ram: ogohlantirish paydo bo'lganda input qayta yaratilmaydi (fokus yo'qolmaydi).
    const zd = ziddiyatMap.get(q.id);
    const zdBelgi = zd && <div className="mt-3 self-end text-right text-[10.5px] font-semibold text-warn" data-testid="qoralama-ziddiyat">{t('Qoralama tiklanmadi: fakt boshqa joyda o‘zgargan (qoralama: {q})', { q: `${zd.yozuv.rejim} ${zd.yozuv.qiymat}` })}</div>;
    const moslik = moslikOgoh.get(q.id);
    return <div className="flex flex-col gap-1">{asosiy}{zdBelgi}{birlikOgoh && <BirlikOgohBlok ogoh={birlikOgoh} onTuzat={(v) => kirit(q.id, { qiymat: v })} className="mt-4 w-[300px] self-end" />}{moslik && <IshMaterialOgohBlok natija={moslik} onTuzat={(v) => { kirit(q.id, { rejim: '=', qiymat: v }); toast(t('Ish hajmi {v} (jami fakt) qilib kiritmaga qo‘yildi — tekshirib saqlang (Ctrl+S).', { v }), 'ok'); }} className="mt-4 w-[300px] self-end" />}</div>;
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
    if (narx != null) return <span title={t('Birlik narxi (QQS siz)')}>× {fmt(narx)}</span>;
    // Smeta narxi yo'q, lekin tasdiqlangan F2 narxi bor (F2 importidagi qo'shimcha resurs) — F2 narxi ko'rsatiladi.
    const f2n = h?.f2_narx != null && Number.isFinite(Number(h.f2_narx)) ? Number(h.f2_narx) : null;
    if (f2n != null && q.tur !== 'bl') return <span title={t('F2 narxi (smetada narx yo‘q, QQS siz)')} data-testid="f2-narx-belgi">× {fmt(f2n)} <span className="text-[10px] text-text-mute">{t('F2')}</span></span>;
    if (narxlashMumkin(q.tur, narx)) return <button type="button" tabIndex={-1} onClick={() => setNarxModal({ id: q.id, nom: q.nom, birlik: q.birlik, kat: r?.kat ?? null, fakt: q.fakt, smeta: q.smeta })}
      className="fz-chip fz-chip--danger hover:brightness-110" title={t('Narxi noma‘lum - narxlash')} data-testid="narxsiz-belgi">{t('narxsiz')}</button>;
    if (q.tur === 'bl') { const ts = taxminKesim(q); if (ts && q.smeta) return <span title={t('Ish birlik narxi = resurslar summasi / ish hajmi')}>× {fmt(ts.smetaSumma / q.smeta)}</span>; }
    return <span>—</span>;
  };
  const almMatn = (q: JurnalQator) => almashtirildiMatn(q.almashtirilgan, q.smeta, q.birlik, fmt);
  /** Qatorda belgi bormi (ikkinchi satr faqat kerak bo'lsa chiziladi). */
  const belgiBor = (q: JurnalQator) => tuzatish.asos.has(q.id) || q.zamena || q.qoshimcha || !!almMatn(q) || saqlangan.has(q.id) || (bajHajm.get(q.id) ?? 0) > 0 || avvalgiF2.has(q.id) || juftlar.zamenalar.has(q.id);
  /** Zamena juftligi: asl → «zamena →», zamena → «← o'rniga» (bosilsa/Enter — juftiga o'tadi). */
  const juftBelgi = (q: JurnalQator) => {
    const asl = juftlar.asl.get(q.id); const z = juftlar.zamenalar.get(q.id)?.[0];
    const nom = (id: number) => { const x = inlineById.get(id) ?? rowById.get(id); return x ? [x.kod, x.nom].filter(Boolean).join(' ') || null : null; };
    return <>
      {asl != null && <ZamenaJuftBelgi yonalish="asl" juftId={asl} juftNom={nom(asl)} onOt={juftgaOt} />}
      {z != null && <ZamenaJuftBelgi yonalish="zamena" juftId={z} juftNom={nom(z)} onOt={juftgaOt} />}
    </>;
  };
  /**
   * BITTA belgi guruhi: zamena (info) · qo'shimcha (firuza) · almashtirildi (neytral) · bajarilmaydi (qizil, bosilsa bekor).
   * Sariq rang faqat «smetadan/qoldiqdan oshdi» uchun.
   */
  const belgilar = (q: JurnalQator) => {
    const m = almMatn(q); const av = avvalgiF2.get(q.id);
    return <>
      {tuzatish.asos.has(q.id) && <span className="fz-chip" data-testid="tuzatish-belgi" title={t('Fakt asosiy ish faktidan avtomatik hisoblanadi')}>{t('qalinlik tuzatishi — asosiy ishga bog‘liq')}</span>}
      {q.zamena && <span className="fz-chip bg-[var(--info-soft)] text-[var(--info)]" data-testid="zamena-belgi" title={q.aslNom ? t('Zamena: asl qator — {nom}', { nom: q.aslNom }) : t('Zamena')}>↻ {t('zamena')}{q.aslNom ? `: ${t('asl')} ${q.aslNom}` : ''}</span>}
      {juftBelgi(q)}
      {q.qoshimcha && <span className="fz-chip fz-chip--accent" data-testid="qoshimcha-belgi">+ {t('qo‘shimcha')}</span>}
      {av && <span className="fz-chip bg-[var(--info-soft)] text-[var(--info)]" data-testid="avvalgi-f2-belgi"
        title={t('Tasdiqlangan F2 avvalgi smeta versiyasining qatorida: obyekt jamisida bir marta sanaladi, shu qator ustunlariga qo‘shilmaydi. F2 qoldig‘i avvalgi F2 bilan: {q}', { q: fmt(avvalgiBilanF2Qoldiq({ smeta: q.smeta, ozF2: Number(holatMap.get(q.id)?.f2_hajm ?? 0), avvalgi: av, almashtirilgan: q.almashtirilgan })) })}>
        {t('avvalgi versiya F2')}: {fmt(av.hajm)} {q.birlik ?? ''}</span>}
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
    ? <button type="button" tabIndex={-1} onClick={() => inlineOch(q.id, 'zamena')} title={sarlavhaBilan(q.tur === 'bl' ? t('Ish zamenasi — boshqa ish bilan almashtirish') : t('Resurs zamenasi — shu ish ichida boshqa resurs bilan almashtirish'), 'z')} aria-label={`Zamena: ${q.nom}`} className={`${tugmaCls} hover:text-[var(--info)]`}><Repeat2 size={kichik ? 12 : 14} /></button> : null;
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
      { kalit: 'kiritma', nom: t('Bu fakt'), tur: 'son', qiymat: (r) => { const n = kiritmaSoni(kiritmalar[r.q.id]?.qiymat ?? '', r.q.smeta); return typeof n === 'number' && Number.isFinite(n) ? n : null; } },
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

  // Virtualizatsiya faqat chizishni cheklaydi: barcha qatorlar, kiritmalar va saqlash paketi to'liq qoladi.
  type Satr = { key: string; tur: 'bolim'; bolak: Bolak }
    | { key: string; tur: 'ish'; qator: JurnalIsh }
    | { key: string; tur: 'resurs'; qator: JurnalQator; avto: boolean };
  const satrlar = useMemo(() => {
    const out: Satr[] = [];
    korinadi.forEach((b, i) => {
      if (b.yol || b.bolim) out.push({ key: `bolim-${b.bolim?.id ?? i}`, tur: 'bolim', bolak: b });
      for (const ish of b.ishlar) {
        out.push({ key: `q-${ish.id}`, tur: 'ish', qator: ish });
        if (ishOchiq(ish.id)) {
          for (const r of ish.resurslar.filter(bolaKor(ish.id))) out.push({ key: `q-${r.id}`, tur: 'resurs', qator: r, avto: false });
          for (const r of ish.avtomatik.filter(bolaKor(ish.id))) out.push({ key: `q-${r.id}`, tur: 'resurs', qator: r, avto: true });
        }
      }
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ishOchiq/bolaKor: hammaYopiq, teskari, bolaKorinadi dan hosil
  }, [korinadi, bolaKorinadi, hammaYopiq, teskari]);
  const satrIndeks = useMemo(() => new Map(satrlar.flatMap((s, i) => s.tur === 'bolim' ? [] : [[s.qator.id, i] as const])), [satrlar]);
  const kirishTartib = useMemo(() => satrlar.flatMap(s => (s.tur === 'ish' || s.tur === 'resurs' && !s.avto) && !tuzatish.asos.has(s.qator.id) ? [s.qator.id] : []), [satrlar, tuzatish]);
  const kirishIndeks = useMemo(() => new Map(kirishTartib.map((id, i) => [id, i])), [kirishTartib]);
  const kattaJurnal = satrlar.length > 100;
  /** satr.key → indeks (faol qator ref'da; virtual ro'yxat uni doim chizadi — fokus yo'qolmaydi). */
  const keyIndeks = useMemo(() => new Map(satrlar.map((s, i) => [s.key, i])), [satrlar]);
  const { virtual, faolRef, fokusgaOt } = useVirtualSatrlar({
    satrlar, yoqilgan: kattaJurnal, jadvalRef, taxminBalandlik: (s) => (s.tur === 'ish' ? 84 : 64), keyIndeks, satrIndeks, fokus: katakFokus,
  });
  useEffect(() => {
    if (jadvalRef.current) jadvalRef.current.scrollTop = 0;
  }, [bolimId, qidiruv, faqatQoldiq, holatFiltr]);

  // ══ KLAVIATURA NAVIGATSIYASI (egasi 2026-11-07: «to'liq klaviaturada») — alohida blok. ══
  // Faol qator ref'da (roving tabindex + aria-selected DOM'da almashtiriladi): o'q tugmalari daraxtni qayta chizmaydi.
  // Navigatsiya rejimi — fokus qatorda; tahrir rejimi — fokus hajm katagida (Enter/raqam kiradi, Esc chiqadi).
  const satrEl = (key: string) => jadvalRef.current?.querySelector<HTMLElement>(`[data-satr="${key}"]`) ?? null;
  const kutishFokus = useRef<string | null>(null);
  const kutishJoy = useRef<{ key: string; zaxira: string | null; fokus: boolean; urinish: number } | null>(null);
  const qoldimRef = useRef<number | null>(null);
  const [qoldimXabar, setQoldimXabar] = useState<string | null>(null);
  const gVaqt = useRef(0);
  const tahrirOldi = useRef<{ id: number; k: Kiritma | null; yangi: boolean } | null>(null);
  const satrId = (s: Satr | undefined) => (s && s.tur !== 'bolim' ? s.qator.id : null);
  const faolQil = (key: string | undefined, o: { fokus?: boolean; scroll?: boolean } = {}) => {
    if (key == null) return;
    const eski = faolRef.current; faolRef.current = key;
    if (eski && eski !== key) { const e = satrEl(eski); if (e) { e.setAttribute('aria-selected', 'false'); e.tabIndex = -1; } }
    const el = satrEl(key);
    if (el) { el.setAttribute('aria-selected', 'true'); el.tabIndex = 0; }
    const i = keyIndeks.get(key);
    const id = satrId(i == null ? undefined : satrlar[i]);
    if (id != null) qoldimYoz(kompaniyaId, obyektId, id);
    if (o.scroll !== false) { if (kattaJurnal && i != null) virtual.scrollToIndex(i, { align: 'auto' }); else el?.scrollIntoView?.({ block: 'nearest' }); }
    if (o.fokus) { if (el) el.focus({ preventScroll: true }); else kutishFokus.current = key; }
  };
  const faolIndeks = () => (faolRef.current == null ? null : keyIndeks.get(faolRef.current) ?? null);
  const faolSatr = () => { const i = faolIndeks(); return i == null ? undefined : satrlar[i]; };
  /** Navigatsiya faqat jadval ichida yoki sahifada fokus yo'q paytda (boshqa tugma/maydon ustidagi o'q tugmalariga tegilmaydi). */
  const navMumkin = () => {
    if (!satrlar.length) return false;
    const a = document.activeElement;
    return !a || a === document.body || (!!jadvalRef.current?.contains(a) && !inputdami(a));
  };
  const sahifaQadam = () => { const h = jadvalRef.current?.clientHeight ?? 0; return h > 0 ? Math.max(1, Math.floor(h / 72)) : 10; };
  const siljit = (d: number | 'bosh' | 'oxir') => {
    if (!navMumkin()) return false;
    const i = faolIndeks(); const oxir = satrlar.length - 1;
    const n = d === 'bosh' ? 0 : d === 'oxir' ? oxir : i == null ? (d > 0 ? 0 : oxir) : Math.max(0, Math.min(oxir, i + d));
    if (qoldimXabar) setQoldimXabar(null);
    faolQil(satrlar[n].key, { fokus: true });
  };
  const bolaSoniOl = (s: Satr) => (s.tur === 'ish' ? s.qator.resurslar.length + s.qator.avtomatik.length : 0);
  /** ← : ochiq ishni yig'ish, aks holda ota qatorga (resurs → ish → bo'lim sarlavhasi). */
  const chapga = () => {
    if (!navMumkin()) return false;
    const i = faolIndeks(); if (i == null) return siljit(1);
    const s = satrlar[i];
    if (s.tur === 'ish' && bolaSoniOl(s) > 0 && ishOchiq(s.qator.id)) { ishAlmashtir(s.qator.id); return; }
    const otaTur = s.tur === 'resurs' ? 'ish' : s.tur === 'ish' ? 'bolim' : null;
    if (!otaTur) return;
    for (let k = i - 1; k >= 0; k--) if (satrlar[k].tur === otaTur) { faolQil(satrlar[k].key, { fokus: true }); return; }
  };
  /** → : yopiq ishni ochish, aks holda ichiga (keyingi qator). */
  const ongga = () => {
    if (!navMumkin()) return false;
    const i = faolIndeks(); if (i == null) return siljit(1);
    const s = satrlar[i];
    if (s.tur === 'ish' && bolaSoniOl(s) > 0 && !ishOchiq(s.qator.id)) { ishAlmashtir(s.qator.id); return; }
    if (s.tur !== 'resurs' && i < satrlar.length - 1) faolQil(satrlar[i + 1].key, { fokus: true });
  };
  /** Enter/F2 — faol qatorning hajm katagiga; raqam — katakni shu raqam bilan almashtirib boshlaydi. */
  const tahrirla = (bosh?: string) => {
    if (!navMumkin()) return false;
    const s = faolSatr(); if (!s) return false;
    if (s.tur === 'bolim') { if (bosh != null || !s.bolak.bolim) return false; setBolimId(s.bolak.bolim.id); return; }
    const id = s.qator.id;
    if (!kirishIndeks.has(id)) {
      if (bosh == null && bolaSoniOl(s) > 0) { ishAlmashtir(id); return; }
      toast(t('Bu qatorga fakt qo‘lda kiritilmaydi (avtomatik).'), 'warn'); return;
    }
    tahrirOldi.current = { id, k: kiritmalar[id] ?? null, yangi: true };
    if (bosh != null) kirit(id, { qiymat: bosh });
    fokusgaOt(id);
  };
  /** Katakka kirish: Esc qaytaradigan qiymat eslab qolinadi; qator faol bo'ladi. */
  const tahrirBosh = (id: number) => {
    const o = tahrirOldi.current;
    if (o?.id === id && o.yangi) o.yangi = false;
    else tahrirOldi.current = { id, k: kiritmalar[id] ?? null, yangi: false };
    faolQil(`q-${id}`, { scroll: false });
  };
  const tahrirBekor = (id: number) => {
    const o = tahrirOldi.current; tahrirOldi.current = null;
    if (o?.id === id) setKiritmalar((x) => { const n = { ...x }; if (o.k) n[id] = o.k; else delete n[id]; return n; });
    faolQil(`q-${id}`, { fokus: true, scroll: false });
  };
  const faolQator = () => { if (!navMumkin()) return null; const s = faolSatr(); return s && s.tur !== 'bolim' && kirishIndeks.has(s.qator.id) ? s.qator : null; };
  const qoldiqToldir = () => {
    const q = faolQator(); if (!q) return false;
    const v = qoldiqUlushi(q, 100);
    if (!v) { toast(t('Ochiq qoldiq yo‘q — to‘ldiriladigan hajm yo‘q.'), 'warn'); return; }
    kirit(q.id, { rejim: '+', qiymat: v });
  };
  const kiritmaTozala = () => { const q = faolQator(); if (!q || !kiritmalar[q.id]) return false; kirit(q.id, { qiymat: '' }); };
  const rejimQoy = (r: Rejim) => { const q = faolQator(); if (!q) return false; kirit(q.id, { rejim: r }); };
  /** «%» faol qatorga: bo'lim sarlavhasi — shu bo'lim; ish yoki uning resursi — shu ish. Faol qator yo'q — false (tanlangan bo'lim). */
  const faolQamrov = (): boolean | void => {
    const s = navMumkin() ? faolSatr() : undefined; if (!s) return false;
    if (s.tur === 'bolim') { if (!s.bolak.bolim) return false; qamrovBolim(s.bolak.bolim); return; }
    const ish = s.tur === 'ish' ? s.qator : s.qator.otaId != null ? jurnalById.get(s.qator.otaId) as JurnalIsh | undefined : undefined;
    if (!ish || ish.tur !== 'bl') return false;
    qamrovIsh(ish);
  };

  // Qidiruv mosliklari: ish yoki resursning o'z kodi/nomi (lotin/kirill bir xil).
  const qKalit = qidiruvKaliti(qidiruv.trim());
  const moslar = () => {
    if (!qKalit) return [];
    const out: number[] = [];
    satrlar.forEach((s, i) => { if (s.tur !== 'bolim' && qidiruvKaliti(`${s.qator.kod ?? ''} ${s.qator.nom}`).includes(qKalit)) out.push(i); });
    return out;
  };
  const birinchiMos = (): number | null => { const m = moslar(); if (m.length) return m[0]; const i = satrlar.findIndex((s) => s.tur !== 'bolim'); return i >= 0 ? i : null; };
  const moslikka = (yon: 1 | -1) => {
    if (!qKalit) return false;
    const n = keyingiMoslik(moslar(), faolIndeks(), yon);
    if (n == null) { toast(t('Mos qator topilmadi.'), 'warn'); return; }
    faolQil(satrlar[n].key, { fokus: true });
  };
  const filtrQoy = (f: HolatFiltr) => {
    setHolatFiltr(f);
    setKiritilganIdlar(f === 'kiritilgan' ? new Set(Object.entries(kiritmalar).filter(([, k]) => k.qiymat.trim()).map(([id]) => Number(id))) : new Set());
  };
  /** Qatorga borish: bo'limini ochadi (yopiq ish — ochiladi), chizilgach faol qiladi. */
  const joyga = (id: number, o: { xabar?: boolean; fokus?: boolean }) => {
    const q = barchaById.get(id); if (!q) return false;
    let bolim: number | null = null; let ishId: number | null = null;
    for (const [bid, ishlar] of [...bolimIshlari, [BOLIMSIZ, ildizIshlari] as const]) {
      const ish = ishlar.find((x) => x.id === id || x.resurslar.some((r) => r.id === id) || x.avtomatik.some((r) => r.id === id));
      if (ish) { bolim = bid; ishId = ish.id; break; }
    }
    if (bolim == null) return false;
    setQidiruv(''); setBolimId(bolim);
    if (ishId != null && ishId !== id && !ishOchiq(ishId)) ishAlmashtir(ishId);
    kutishJoy.current = { key: `q-${id}`, zaxira: ishId != null ? `q-${ishId}` : null, fokus: !!o.fokus, urinish: 0 };
    if (o.xabar) setQoldimXabar(q.nom);
    return true;
  };
  const qoldimgaQayt = () => { const id = qoldimRef.current; if (id == null || !joyga(id, { fokus: true })) toast(t('Eslab qolingan joy yo‘q.'), 'warn'); };
  // «Qayerda qoldim»: obyekt ochilganda oxirgi faol qator tiklanadi (URL da aniq bo'lim/filtr bo'lsa — tegilmaydi).
  const tiklanganObyekt = useRef<number | null>(null);
  useEffect(() => {
    if (tiklanganObyekt.current === obyektId || (!bolimlar.length && !ildizIshlari.length)) return;
    tiklanganObyekt.current = obyektId;
    const id = qoldimOl(kompaniyaId, obyektId); qoldimRef.current = id;
    if (id == null || boshBolimId != null || boshFaktsizF2) return;
    joyga(id, { xabar: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat obyekt ochilganda bir marta
  }, [bolimlar, ildizIshlari, obyektId]);
  // Kutilayotgan joy/fokus: virtual qator (yoki yangi bo'lim) chizilgach qo'llanadi.
  useEffect(() => {
    const j = kutishJoy.current;
    if (j) {
      const key = keyIndeks.has(j.key) ? j.key : j.zaxira && keyIndeks.has(j.zaxira) ? j.zaxira : null;
      if (key) { kutishJoy.current = null; faolQil(key, { fokus: j.fokus }); }
      else if (++j.urinish > 3) kutishJoy.current = null;
    }
    const k = kutishFokus.current;
    if (k) { const el = satrEl(k); if (el) { kutishFokus.current = null; el.focus({ preventScroll: true }); } }
  });
  const RAQAMLAR = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
  useHotkeys('fakt-klaviatura', t('Fakt jurnali: qatorlar bo‘ylab'), [
    { id: 'fk.past', keys: 'arrowdown', nom: t('Keyingi qator'), run: () => siljit(1) },
    { id: 'fk.tepa', keys: 'arrowup', nom: t('Oldingi qator'), run: () => siljit(-1) },
    { id: 'fk.sahifa.past', keys: 'pagedown', nom: t('Bir sahifa pastga'), run: () => siljit(sahifaQadam()) },
    { id: 'fk.sahifa.tepa', keys: 'pageup', nom: t('Bir sahifa tepaga'), run: () => siljit(-sahifaQadam()) },
    { id: 'fk.bosh', keys: 'home', nom: t('Birinchi qator'), run: () => siljit('bosh') },
    { id: 'fk.oxir', keys: 'end', nom: t('Oxirgi qator'), run: () => siljit('oxir') },
    { id: 'fk.yig', keys: 'arrowleft', nom: t('Yig‘ish / ota qatorga'), run: () => chapga() },
    { id: 'fk.och', keys: 'arrowright', nom: t('Ochish / ichiga'), run: () => ongga() },
    { id: 'fk.tahrir', keys: ['enter', 'f2'], nom: t('Hajmni tahrirlash (Enter — keyingi qator, Esc — bekor)'), run: () => tahrirla() },
    { id: 'fk.raqam', keys: RAQAMLAR, nom: t('Raqam — hajmni yozishni boshlash'), run: (e) => tahrirla(e.key) },
    { id: 'fk.qoldiq', keys: '*', nom: t('Ochiq qoldiqni to‘liq yozish'), run: () => qoldiqToldir() },
    { id: 'fk.ochir', keys: ['delete', 'backspace'], nom: t('Kiritilgan (saqlanmagan) qiymatni o‘chirish'), run: () => kiritmaTozala() },
    { id: 'fk.plus', keys: '+', nom: t('Rejim «+» (bugun)'), run: () => rejimQoy('+') },
    { id: 'fk.teng', keys: '=', nom: t('Rejim «=» (jami)'), run: () => rejimQoy('=') },
    { id: 'fk.keyingi', keys: ['n', 'f3'], nom: t('Keyingi topilgan qator'), inInput: true, run: () => moslikka(1) },
    { id: 'fk.oldingi', keys: ['shift+n', 'shift+f3'], nom: t('Oldingi topilgan qator'), inInput: true, run: () => moslikka(-1) },
    ...HOLAT_FILTRLAR.map((f) => ({ id: `fk.filtr.${f.kalit}`, keys: f.tugma, nom: t('Filtr: {nom}', { nom: t(f.nom) }), run: () => { filtrQoy(f.kalit); } })),
    { id: 'fk.g', keys: 'g', nom: t('g, keyin l — to‘xtagan joyga qaytish'), run: () => { gVaqt.current = Date.now(); } },
    { id: 'fk.l', keys: 'l', nom: t('l (g dan keyin) — to‘xtagan joy'), run: () => { if (Date.now() - gVaqt.current > 1500) return false; gVaqt.current = 0; qoldimgaQayt(); } },
  ], jurnalFaol);
  /** Qator o'rami atributlari: roving tabindex, aria-selected (faol qator ref'dan), treegrid darajasi. */
  const satrAttr = (s: Satr) => {
    const faol = faolRef.current === s.key;
    const bolalar = bolaSoniOl(s);
    return {
      'data-satr': s.key, role: 'row' as const, 'aria-selected': faol, tabIndex: faol ? 0 : -1,
      'aria-level': s.tur === 'bolim' ? 1 : s.tur === 'ish' ? 2 : 3,
      'aria-expanded': bolalar > 0 && s.tur === 'ish' ? ishOchiq(s.qator.id) : undefined,
      onClick: (e: { target: EventTarget }) => { const ichki = (e.target as HTMLElement).closest?.('input,button,select,textarea,a,summary'); faolQil(s.key, { fokus: !ichki, scroll: false }); },
    };
  };
  const SATR_FAOL = 'outline-none aria-selected:bg-accent/[.08] aria-selected:shadow-[inset_3px_0_0_var(--accent)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/60';


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
    <FaktF2Izoh f2Narxda={s.faktF2.f2Narxda} />
  </div> : null;

  const tanlanganBolim = bolimlar.find((b) => b.id === bolimId);
  const obyektUlushi = useMemo(() => obyektUlushiHisobla(bolimlar, (id) => bolimMaxraji(summalar.get(id))), [bolimlar, summalar]);
  const xulosa = useMemo(() => jurnalXulosa(bolimlar, bolimIshlari), [bolimlar, bolimIshlari]);
  const bolimKorinadi = (b: (typeof bolimlar)[number]) => { let p = b.otaId; while (p != null) { if (yopiqBolim.has(p)) return false; p = bolimlar.find((x) => x.id === p)?.otaId ?? null; } return true; };
  const bolaliBolim = useMemo(() => new Set(bolimlar.map((b) => b.otaId).filter((x): x is number => x != null)), [bolimlar]);
  const sarlavha = qidiruv ? t('Qidiruv: «{q}»', { q: qidiruv }) : tanlanganBolim?.nom ?? (bolimId === BOLIMSIZ ? t('Bo‘limsiz') : t('Bo‘limni tanlang'));
  const bolimMaterialIdlar = korinadi.flatMap((b) => b.ishlar.map((i) => i.id));
  const bolimTakliflar = takliflarSoni(bolimMaterialIdlar);
  /** `filtr` — nom yonida bitta filtr tugmasi; `maydonlar` — bir nechta maydonli ustunda uchinchi satr (nom + tugma). */
  /** Foiz chipi: ko'rinadigan (filtr/bo'lim) ish va ularning resurslariga «jami = p% smeta» — darhol qoralamaga, oynasiz. */
  const foizChip = (p: number) => {
    const qatorlar = korinadi.flatMap((bk) => bk.ishlar.flatMap((ish) => [ish, ...ish.resurslar])).map((q) => ({ id: q.id, smeta: q.smeta }));
    const r = foizQoll(kiritmalar, qatorlar, p);
    if (!r.qollandi) { toast(t('Smeta hajmi bor qator yo‘q — foiz qo‘llanmadi.'), 'warn'); return; }
    ommaviy(r.kiritmalar);
    toast(t('{n} ta qatorga jami {p}% qo‘yildi{s} — tekshirib saqlang (Ctrl+S), orqaga — Ctrl+Z.', { n: r.qollandi, p, s: r.otkazildi ? t(' ({m} tasi smetasiz — o‘tkazildi)', { m: r.otkazildi }) : '' }), 'ok');
  };
  const ustunSarlavha = (nom: string, izoh: string, o?: { ong?: boolean; title?: string; filtr?: ReactNode; maydonlar?: ReactNode }) => <span className={`flex min-w-0 flex-col ${o?.ong ? 'items-end text-right' : ''}`} title={o?.title}>
    <span className={`flex items-start ${o?.ong ? 'justify-end' : ''}`}><span>{nom}</span>{o?.filtr}</span><span className="text-[10.5px] font-normal normal-case tracking-normal text-text-mute">{izoh}</span>
    {o?.maydonlar && <span className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] font-normal normal-case tracking-normal text-text-mute ${o.ong ? 'justify-end' : ''}`}>{o.maydonlar}</span>}
  </span>;
  /** Inline panel faqat faol qator OSTIDA (oyna emas). «Kengaytirilgan oyna» — mavjud IshAbcModal (resurslar, normativ, AI). */
  const inlinePanel = (id: number) => inline?.qatorId === id && inlineQator && inlineKontekst
    ? <FaktInlineAmal kompaniyaId={kompaniyaId} obyektId={obyektId} sana={sana} qator={inlineQator} kontekst={inlineKontekst}
        tur={inline.tur} onTur={(tur) => setInline({ qatorId: id, tur })} onYop={inlineYop}
        almashtirishBelgila={zamenaMiqdorBelgila}
        onKengaytirilgan={(tur) => { setInline(null); if (tur === 'zamena') zamenaOch(inlineQator); else setModal({ rejim: { tur: 'additional', bolimId: inlineKontekst.bolim?.id ?? null } }); }}
        onSaqlandi={(xabar) => { setInline(null); toast(xabar, 'ok'); void tuzilmaniYangila(); }} />
    : null;
  const satrChiz = (satr: Satr) => {
    if (satr.tur === 'ish') return <>{ishQatori(satr.qator)}{inlinePanel(satr.qator.id)}</>;
    if (satr.tur === 'resurs') return <>{resursQatori(satr.qator, satr.avto)}{inlinePanel(satr.qator.id)}</>;
    const bk = satr.bolak;
    return <>
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
    </>;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="fz-card flex shrink-0 flex-wrap items-center gap-3 px-3 py-2">
        <label className="flex items-center gap-2 text-[12px] font-medium text-text-dim">{t('Sana')}<input type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="input h-8 px-2 text-[13px] text-text" aria-label={t('Fakt sanasi')} /></label>
        <div className="relative min-w-[240px] flex-1"><Search size={14} className="absolute left-2.5 top-2 text-text-mute" />
          <input ref={qidiruvRef} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} onKeyDown={qidiruvKlav} placeholder={t('Butun obyekt bo‘yicha qidirish…  ( / )')} aria-label={t('Qidirish')} className="input h-8 w-full pl-8 pr-8 text-[13px]" />
          {qidiruv && <button onClick={() => setQidiruv('')} className="absolute right-2 top-2 text-text-mute" aria-label={t('Qidiruvni tozalash')}><X size={14} /></button>}</div>
        <label className="flex items-center gap-1.5 text-[12px] text-text-dim"><input type="checkbox" checked={faqatQoldiq} onChange={(e) => setFaqatQoldiq(e.target.checked)} /> {t('faqat bajarilmaganlar')}</label>
        <label className="flex items-center gap-1.5 text-[12px] text-text-dim" title={t('Pereraschet uchun: tasdiqlangan F2 olingan, lekin fakt belgilanmagan qatorlar (butun obyekt bo‘yicha)')}><input type="checkbox" checked={faktsizF2} onChange={(e) => setFaktsizF2(e.target.checked)} /> {t('fakti yo‘q, F2 olingan')}</label>
        <label className="flex items-center gap-1.5 text-[12px] text-text-dim" title={t('Butun obyekt bo‘yicha: zamena qilingan, almashtirilgan va qo‘shimcha qatorlar')}><input type="checkbox" checked={faqatOzgarish} onChange={(e) => setFaqatOzgarish(e.target.checked)} data-testid="faqat-ozgarish" /> {t('Faqat zamena va qo‘shimchalar')}</label>
        <span className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5" role="group" aria-label={t('Holat filtri')} data-testid="holat-filtr">
          {HOLAT_FILTRLAR.map((f) => <button key={f.kalit} type="button" aria-pressed={holatFiltr === f.kalit} onClick={() => filtrQoy(f.kalit)} title={sarlavhaBilan(t(f.nom), f.tugma)}
            className={`fz-btn fz-btn--sm ${holatFiltr === f.kalit ? 'border-transparent bg-accent/15 text-text' : 'fz-btn--ghost'}`}>{t(f.nom)}</button>)}
        </span>
        <button type="button" onClick={() => yordamOch()} className="fz-btn fz-btn--ghost fz-btn--sm" title={t('Klaviatura tugmalari')} data-testid="klaviatura-yordam">{t('Klaviatura')} <kbd className="fz-kbd">?</kbd></button>
        {tanlanganBolim && <button type="button" onClick={() => void tenglashOch(tanlanganBolim.nom, bolimIshlariYigish(tanlanganBolim.id, bolimIshlari, bolimBolalari, true))} disabled={tenglashYuk}
          title={sarlavhaBilan(t('Shu bo‘lim (ichki bo‘limlari bilan): F2 hajmi fakt dan ko‘p ishlarga farqni yozish'), 'f')} aria-label={t('Fakt = F2: bo‘lim')}
          className="fz-btn">{t('Fakt = F2')} <kbd className="fz-kbd">F</kbd></button>}
        {(bolimlar.length > 0 || ildizIshlari.length > 0) && <button type="button" onClick={() => void tenglashObyekt()} disabled={tenglashYuk} data-testid="f2-tenglash-obyekt"
          title={sarlavhaBilan(t('Butun obyekt (barcha bo‘limlar): F2 hajmi fakt dan ko‘p ishlarga farqni yozish — oldindan ko‘rish, istisno va bekor qilish bilan'), 'shift+f')} aria-label={t('Fakt = F2: butun obyekt')}
          className="fz-btn">{t('Fakt = F2: obyekt')} <kbd className="fz-kbd">{'Shift+F'}</kbd></button>}
        {(bolimlar.length > 0 || ildizIshlari.length > 0) && <button type="button" onClick={() => void tiklashOch()} disabled={tenglashYuk} data-testid="fakt-tiklash-och"
          title={t('Fakt tiklash: tasdiqlangan va qoralama F2 dalili bo‘yicha yetishmayotgan faktni qatorma-qator taklif qilish — belgilab, bitta tasdiq bilan yozish')}
          className="fz-btn">{t('Fakt tiklash')}</button>}
        {tanlanganBolim && !qidiruv && <button type="button" onClick={() => qamrovBolim(tanlanganBolim)} data-testid="qamrov-tanlangan"
          title={sarlavhaBilan(t('Tiklash rejimi: shu bo‘lim (ichki bo‘limlari bilan) barcha ishlariga bitta foiz — fakt = foiz × ochiq qoldiq; oldindan ko‘rish va bekor qilish bilan'), '%')} aria-label={t('Qamrov %: bo‘lim')}
          className="fz-btn">{t('Qamrov %')} <kbd className="fz-kbd">%</kbd></button>}
        {egizaklar.length > 0 && <button type="button" onClick={() => setEgizakOyna(true)} data-testid="fakt-egizak-och" className="fz-btn"
          title={t('Shu faktni bir loyihadagi egizak obyektlarga ham yozish — oldindan ko‘rish bilan')}>{t('Egizaklarga ham yozish')}</button>}
        <button onClick={() => setModal({ rejim: { tur: 'additional', bolimId: bolimId === BOLIMSIZ ? null : bolimId } })} className="fz-btn"><Plus size={14} className="text-accent" /> {t('Smetadan tashqari ish')}</button>
      </section>

      {bolimlar.length > 0 && <details className="group rounded-[var(--radius-md)] border border-border bg-surface-1" data-testid="fakt-tahlil">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-[12px] text-text-dim">
          <ChevronRight size={13} className="transition-transform group-open:rotate-90" aria-hidden="true" />
          {t('Bajarilish tahlili')}
        </summary>
        <div className="border-t border-border p-2"><FaktXulosaPanel x={xulosa} obyekt={obyektUlushi} /></div>
      </details>}

      {kochmaganBor(kochirma) && <div className="fz-card flex shrink-0 flex-wrap items-center gap-2 px-3 py-1.5 text-[12px] text-warn" data-testid="avvalgi-f2-kochmagan" role="status">
        {t('Avvalgi smeta versiyasidagi tasdiqlangan F2: {k} qator yangi qatorlarga ko‘rsatildi, {w} tasi moslik tasdig‘ini kutmoqda, {n} tasi yangi smetada topilmadi — «Versiyalar va farq» panelida ko‘ring.', { k: String(kochirma!.jami.kochdi_soni), w: String(kochirma!.jami.kutilmoqda_soni), n: String(kochirma!.jami.moslanmagan_soni) })}
      </div>}
      {tiklandi && <FaktQoralamaBanner soni={Object.keys(tiklandi.kiritmalar).length} ziddiyatlar={tiklandi.ziddiyatlar} band={band}
        nomi={(id) => barchaById.get(id)?.nom} onSaqla={() => void saqla()} onBekor={qoralamaBekor} />}
      <FaktStudioBar yigindi={yigindi} obyektId={obyektId} kompaniyaId={kompaniyaId} onF2={f2Otish} band={band} jami={summalar.get(0)} />

      {bolimlar.length === 0 && ildizIshlari.length === 0
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
              {ildizIshlari.length > 0 && <button type="button" data-testid="bolimsiz-node"
                aria-current={bolimId === BOLIMSIZ && !qidiruv ? 'true' : undefined}
                onClick={() => { setBolimId(BOLIMSIZ); setQidiruv(''); }}
                className={`w-full border-l-2 px-6 py-2 text-left text-[12.5px] ${bolimId === BOLIMSIZ && !qidiruv ? 'border-l-accent bg-accent/10 font-semibold text-text' : 'border-l-transparent text-text-dim hover:bg-surface-3'}`}>
                {t('Bo‘limsiz')} · {t('{n} ish', { n: String(ildizIshlari.length) })}
              </button>}
            </nav>
          </aside>

          <section className="fz-card flex min-h-0 flex-col">
            <header className="flex flex-col gap-2 border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="fz-card__title truncate" title={tanlanganBolim?.nom}>{sarlavha}</h2>
                  <span className="text-[11px] tabular-nums text-text-mute" data-testid="fakt-royxat-soni">{t('{n} ish · {q} qator', { n: String(korinadiIshSoni), q: String(satrlar.filter(s => s.tur !== 'bolim').length) })}</span>
                  {!qidiruv && tanlanganBolim && <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-dim">
                    <span className="tabular-nums">{t('{a} / {b} ish bajarilgan', { a: String(tanlanganBolim.tugaganSoni), b: String(tanlanganBolim.ishSoni) })}</span>
                    <span className="w-[180px]"><BolimMeter ulush={tanlanganBolim.ulush} /></span>
                  </div>}
                  {!qidiruv && tanlanganBolim && <details className="text-[11px] text-text-mute">
                    <summary className="cursor-pointer py-0.5">{t('Bo‘lim summalari')}</summary>
                    {summaQatori(summalar.get(tanlanganBolim.id))}
                  </details>}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {korinadiIshSoni > 0 && <span className="flex items-center gap-0.5" role="group" aria-label={t('Ko‘rinadigan ishlarga jami foiz')} data-testid="foiz-chiplar">
                    <span className="mr-1 text-[11px] text-text-mute">{t('Jami %:')}</span>
                    {[25, 50, 75, 100].map((p) => <button key={p} type="button" tabIndex={-1} onClick={() => foizChip(p)} aria-label={t('Ko‘rinadigan ishlar: jami {p}%', { p })}
                      title={t('Ko‘rinadigan barcha ish va resurslar: jami fakt = smetaning {p}% (qoralamaga; saqlash — bitta, orqaga — Ctrl+Z)', { p })}
                      className="h-7 rounded-[var(--radius-xs)] border border-border px-1.5 font-mono text-[11px] text-text-dim hover:border-accent hover:text-text">{p}%</button>)}
                  </span>}
                  {bolimTakliflar > 0 && <button type="button" onClick={() => materiallarniOl(bolimMaterialIdlar)} data-testid="bolim-materiallarni-ol"
                    title={t('Ish ichidagi va undan keyingi materiallarga ish ulushida taklif (avtomatik yozilmaydi)')}
                    className="fz-btn fz-btn--sm border-accent/40 text-[var(--accent-text)]">{t('Bo‘lim: materiallarni ham olish ({n})', { n: String(bolimTakliflar) })}</button>}
                  <button type="button" onClick={() => { setHammaYopiq((v) => !v); setTeskari(new Set()); }} className="fz-btn fz-btn--ghost fz-btn--sm" aria-label={hammaYopiq ? t('Hamma resurslarni ochish') : t('Hamma resurslarni yopish')}>
                    {hammaYopiq ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{hammaYopiq ? t('Hammasini ochish') : t('Hammasini yopish')}</button>
                </div>
              </div>
              <MeterLegenda />
              {qoldimXabar && <div role="status" data-testid="qoldim-xabar" className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--info)]">
                <span>{t('Siz shu yerda to‘xtagansiz: {nom}', { nom: qoldimXabar })}</span>
                <span className="text-text-mute">{t('qaytish: g, keyin l')}</span>
                <button type="button" onClick={() => setQoldimXabar(null)} className="fz-btn fz-btn--ghost fz-btn--sm" aria-label={t('Xabarni yopish')}><X size={12} /></button>
              </div>}
              <FiltrHolatQatori soni={jf.soni} natija={korinadiIshSoni} jami={asosIshSoni} tozala={jf.tozala} />
            </header>
            <div ref={jadvalRef} tabIndex={0} role="region" aria-label={t('Fakt jadvali')} className="min-h-0 flex-1 overflow-auto pb-16 focus-visible:outline focus-visible:outline-accent" data-testid="fakt-jadval">
              <div className="min-w-[980px]" role="treegrid" aria-label={t('Fakt qatorlari')}>
                <div className={`${USTUN} sticky top-0 z-10 h-16 border-b border-border-strong bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-dim`} role="row">
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
                {kattaJurnal ? <div className="relative" style={{ height: virtual.getTotalSize() }} data-testid="fakt-virtual-royxat">
                  {virtual.getVirtualItems().map(v => <div key={v.key} data-index={v.index} ref={virtual.measureElement} {...satrAttr(satrlar[v.index])}
                    className={`absolute left-0 top-0 w-full border-b border-border ${SATR_FAOL}`} style={{ transform: `translateY(${v.start - 64}px)` }}>
                    {satrChiz(satrlar[v.index])}
                  </div>)}
                </div> : satrlar.map(s => <div key={s.key} {...satrAttr(s)} className={`border-b border-border ${SATR_FAOL}`}>{satrChiz(s)}</div>)}
              </div>
            </div>
          </section>
        </div>}

      {ozgarishSoni > 0 && <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-accent/50 bg-surface px-4 py-2.5" style={{ boxShadow: 'var(--shadow-pop)' }} role="region" aria-label={t('Saqlash paneli')}>
        <span className="text-[13px] font-semibold text-text">{t('{n} ta o‘zgarish', { n: String(ozgarishSoni) })}</span>
        {paket.xatolar.size > 0 && <span className="fz-chip fz-chip--warn">{t('{n} tasida xato — tuzating', { n: String(paket.xatolar.size) })}</span>}
        <span className="text-[12px] text-text-mute">{t('sana: {s}', { s: sana })}</span>
        <div className="ml-auto flex items-center gap-2">
          {tarix.length > 0 && <button type="button" onClick={() => orqaga()} className="fz-btn fz-btn--ghost" title={t('Oxirgi ommaviy amalni qaytarish')}>{t('Orqaga')} <kbd className="fz-kbd">Ctrl+Z</kbd></button>}
          <button onClick={() => ommaviy({})} className="fz-btn fz-btn--ghost"><RotateCcw size={13} /> {t('Bekor qilish')}</button>
          <button onClick={() => void saqla()} disabled={!paket.ok || band} className="fz-btn fz-btn--primary"><Save size={14} /> {band ? t('Saqlanmoqda…') : t('Saqlash')} <kbd className="fz-kbd">Ctrl+S</kbd></button>
        </div>
      </div>}

      <FaktAiYordamchi kompaniyaId={kompaniyaId} obyektId={obyektId}
        malumot={{ bolimlar, bolimIshlari, holatMap, summalar, bajHajm, materialTakliflari: (id) => takliflarSoni([id]), kiritmaSoni: ozgarishSoni }}
        amallar={{ kirit: (id, k) => kirit(id, k), materiallarniOl, korsat: (q) => setQidiruv(q.kod || q.nom), zamena: (q, n) => zamenaOch(q, n), bajarilmaydi: (q, h) => bajOch(q, h) }} />

      {tenglash && <FaktF2Tenglash sarlavha={tenglash.sarlavha} reja={tenglash.reja} eskiAktlar={tenglash.eskiAktlar} obyektId={obyektId} kompaniyaId={kompaniyaId} sana={sana} holatMap={holatMap}
        onYop={() => setTenglash(null)} onBajarildi={() => holatniYangila()}
        aktBekor={faktF2Bekor} />}

      {tiklash && <FaktTiklash obyektNom={obyektNom} satrlar={tiklash} fakt={summalar.get(0)?.fakt ?? null} f2={summalar.get(0)?.f2 ?? null}
        obyektId={obyektId} kompaniyaId={kompaniyaId} sana={sana} holatMap={holatMap}
        obyektlar={(objects ?? []).filter((o) => o.kompaniya_id === kompaniyaId).map((o) => ({ id: o.id, nom: o.nom }))}
        onYop={() => setTiklash(null)} onBajarildi={() => holatniYangila()} aktBekor={faktF2Bekor} />}

      {egizakOyna && <FaktEgizakOyna obyektId={obyektId} obyektNom={obyektNom} objects={objects ?? []} sana={sana}
        qoralama={Object.fromEntries(Object.entries(kiritmalar).filter(([, k]) => k.qiymat.trim()))}
        bolimNom={tanlanganBolim?.nom ?? null}
        bolimKiritma={faktdanKiritmalar(tanlanganBolim ? bolimIshlariYigish(tanlanganBolim.id, bolimIshlari, bolimBolalari, true).flatMap((i) => [i, ...i.resurslar]) : [])}
        obyektKiritma={faktdanKiritmalar([...bolimIshlari.values(), ildizIshlari].flat().flatMap((i) => [i, ...i.resurslar]))}
        manbaSaqla={() => (ozgarishSoni ? saqla() : Promise.resolve(true))} onYop={() => setEgizakOyna(false)} onYozildi={() => holatniYangila()} />}

      {qamrov && <FaktQamrov sarlavha={qamrov.sarlavha} ishlar={qamrov.ishlar} holatMap={holatMap} narxOl={narxOl} obyektId={obyektId} kompaniyaId={kompaniyaId} sana={sana}
        onYop={() => { setQamrov(null); kutishFokus.current = faolRef.current; }} onBajarildi={() => holatniYangila()} aktBekor={faktQamrovBekor} />}

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
