import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { topshirilganPaketOgohi } from '../../lib/f2-oylik-paket/ogoh';
import { TayyorlanganF2lar } from './TayyorlanganF2lar';
import { F2AiYordamchi } from './F2AiYordamchi';
import { tkmBirlikmi, tkmTaklif } from '../../lib/f2-moslash-v3/tkm';
import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { isCompleteMoney, reportMoneyValidity } from '../../lib/money-input';
import { t, tilLocale } from '../../i18n/til';
import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Eye, Save, Search, Sparkles, Zap } from 'lucide-react';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { moslikHisobla, moslikTuzilma } from '../../lib/ish-material-moslik';
import { IshMaterialOgohRoyxat } from '../../components/fakt/IshMaterialOgoh';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { ObyektQadamlari } from '../components/ObyektQadamlari';
import { sbOqi, sbT2AktYaratV2, sbT2F2QoralamaYangila, sbT2DaraxtOl, sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt, type T2Qator } from '../../api/supabase';
import { T2_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import { sbQatorHolatOl, sbF2QoralamaHajmlar, type QatorHolat } from '../../api/t2-fakt';
import { paketdanF2DaraxtHolatOl, paketTezYoliYoqilgan } from '../../api/t2-paket-oqish';

/** Sahifa/f2Qur o'qiydigan holat ustunlari (view ~36 ustun; qolganlari kerak emas — javob ~2-3x kichik). */
const F2_HOLAT_USTUNLAR = 'qator_id,smeta_hajm,smeta_narx,fakt_hajm,f2_hajm,f2_mumkin_hajm,f2_narx,almashtirilgan_hajm,fakt_manbasi';

/** Daraxt + holat: avval obyekt paketi (1 so'rov); har qanday nosozlikda (eski server, 403, tarmoq, shakl) jim eski sahifalab yo'l. */
async function daraxtHolatOl(obyektId: number): Promise<{ ok: true; rows: T2Qator[]; holat: QatorHolat[] } | { ok: false }> {
  if (paketTezYoliYoqilgan()) {
    const p = await paketdanF2DaraxtHolatOl(obyektId);
    if (p) return { ok: true, rows: p.rows, holat: p.f2Holat as unknown as QatorHolat[] };
  }
  const [d, h] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbQatorHolatOl(obyektId, F2_HOLAT_USTUNLAR)]);
  if (!d.ok || !h.ok) return { ok: false };
  return { ok: true, rows: (d.qatorlar || []) as T2Qator[], holat: (h.qatorlar || []) as QatorHolat[] };
}
import { aktdanKiritma } from '../../lib/f2-akt-kiritma';
import { f2VersiyaKochirmaOl } from '../../api/t2-f2-versiya-kochirma';
import { avvalgiF2Xaritasi, type F2VersiyaKochirma } from '../../lib/f2-versiya-kochirma';
import { f2Hujjat } from '../../lib/f2-hujjat';
import { stornoBlokniSaqla, stornoQaytarHajm, stornoQatorimi, type SaqlanganAktQator } from '../../lib/f2-storno';
import { F2StornoBlokTahrir } from './F2StornoBlokTahrir';
import { f2StornoQatorTarixOl, type StornoTarixQator } from '../../api/t2-f2-storno';
import { stornoManbaTasdiqlanmagan, type StornoYukQator } from '../../lib/f2-storno';
import { yigindi2 } from '../../lib/hisob-yadro';
import { f2QatorniOlibTashla, f2SessiyaOqi, f2SessiyaSaqla, f2SessiyaTozala } from '../../lib/f2-tayyor-sessiya';
import { useObyektF2Aktlari } from './F2DublikatPanel';
import { dublikatTekshiruv, pereraschetBelgisi } from '../../lib/f2-dublikat/tekshiruv';
import { shifrKorinish } from '../../lib/f2-resurs-guruh';
import { F2ResursVedomosti } from './F2ResursVedomosti';
import { mazmunXeshi, tokenBilan } from '../../api/t2-token';
import { f2HujjatKaliti, hujjatDizayniniYukla } from '../../api/f2-hujjat-kontekst';
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
import { useAktPodvallar } from '../../umumiy/ui/useAktPodvallar';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { eskiBloklarHujjat, pereraschetBaholash, pereraschetBloklari, type PereraschetSmetaQator as PereraschetSmetaQatorT } from '../../lib/f2-pereraschet';
import { PereraschetPanel } from '../../components/f2-tayyorlash/PereraschetPanel';
import { obyektPodvali } from '../../api/t2-nakrutka-podval';
import { sbAosrCoverageOl, type AosrCoverage } from '../../api/t2-aosr';
import { aosrIshora, AOSR_ISHORA_MATNI, type AosrIshora } from '../../lib/nazorat/aosr-holat';
import { amaldagiProtokolNarxlari, narxProtokolQatorlariOl, type NarxProtokolQator } from '../../api/t2-narx-protokol';
import {
  bosKiritma, f2Jami, f2KatKesim, f2Qatorlar, f2Qur, f2Yacheykalar, f2Yuk, f2ZamenaQolla, ishBirlikNarxi, narxsizNomzodlar, ortiqchaXulosa, smetaNarxXulosa, sonOqi, ulushHajm,
  type F2Bolim, type F2Ish, type F2Kiritma, type F2Manba, type F2Qator, type F2Resurs, type F2ZamenaKontekst, bolimOlRejasi, f2MumkinHajmlarniOl, sonMatn, y6, type BolimOlReja } from '../../lib/f2-tayyor';
import { bloklovchi, davomMumkinmi, f2YozishXatoMatni, saqlashSabablari, type SaqlashSabab } from '../../lib/f2-tayyor-sabab';
import { t2ToliqOqi } from '../../api/t2-toliq-oqish';
import { MinusCircle, Repeat2, RotateCcw } from 'lucide-react';
import { rolF2YozishYopiq } from '../../lib/nav/menyuRolYopiq';
import { F2StornoTanlov } from './F2StornoTanlov';
import { bajarilmadiBekor, bajarilmadiRoyxatOl, bajarilmadiXato, type BajarilmadiQator } from '../../api/t2-bajarilmadi';
import { bajarilmadiHajmlar } from '../../lib/fakt-studio';
import { zamenaToliqOqi } from '../../lib/fakt-zamena-boglanish';
import { obyektlarKeshdan, useIxtiyoriyQueryClient } from '../../api/t2-obyektlar-kesh';
import { tezlikBelgisi } from '../../lib/tezlik-belgi';
import { F2_KORSAT_BOSH, F2_KORSAT_QADAM, f2ElementOrni, f2KorinadiQism } from '../../lib/f2-korinadi-qism';
import type { ZamenaBoglanish } from '../../lib/fakt-jurnal';
import { chiqarilganmi, chiqarishRuxsat, zamenaRuxsat } from '../../lib/resurs-amal';
import { IshAbcModal, type AbcRejim } from './IshAbcModal';
import { ResursChiqarishModal, type ChiqarishQator } from './ResursChiqarishModal';
import { sbT2ZamenaAlmashtirishBelgila } from '../../api/t2-additional-replacement';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { ishMeter, keyingiF2Raqam, qoralamaKatTaqsimot, tekshiruvBandlari, tekshiruvSanoq, type TekshiruvBand } from '../../lib/f2-tayyorlash-korinish';
import { F2KatPanel, F2QoralamaSarlavha, F2TekshiruvPanel, IshMeter, MeterIzohi, NarxManbaChip } from '../../components/f2-tayyorlash/F2TayyorlashKorinish';
import { avlodKalitlari, bolimTuguni, f2BolimIerarxiya, f2Uchastkalar, korinadiganTugunlar } from '../../lib/f2-bolim-daraxti';
import type { Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import { useJadvalFiltr } from '../../umumiy/jadval-filtr/useJadvalFiltr';
import { FiltrHolatQatori, UstunFiltrTugma } from '../../umumiy/jadval-filtr/UstunFiltrTugma';
import { f2Elementlar, f2ElementUstunlar, f2QaytaQur, f2ResursUstunlar, type F2FiltrKontekst } from './F2JadvalFiltr';
import { SummaYorliq } from '../../umumiy/ui/QiymatUchlik';

const oyBoshlanishi = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
const XATO_MATN: Record<NonNullable<F2Qator['xato']>, string> = { HAJM: 'Hajm 0 bo‘lmasligi kerak (minus ham mumkin)', NARX: 'Narx noto‘g‘ri (son va manfiy emas bo‘lsin)', SUMMA: 'Summa son emas' };
/** Egasi 2026-11-06: narxi topilmagan resurs qoralamani to'smaydi — ogohlantirish (tasdiqlashda narx yoki ongli «narxsiz» kerak). */
const AVTO_NARXSIZ_MATN = 'narx yo‘q — qoralamada narxsiz (tasdiqlashda narx kerak)';
const OGOH_MATN: Record<NonNullable<F2Qator['ogoh']>, string> = { RESURS_CHEGARA: 'resurs fakt qoldig‘i bilan cheklandi', ARIFMETIKA: 'summa hajm × narxdan farq qiladi — hujjat summasi saqlanadi', SMETADAN_OSHDI: 'smeta hajmidan oshadi (ruxsat, ogohlantirish)', AXBOROT_NARXSIZ: 'axborot qatori: narxsiz (smetada narxi yo‘q)', QOLDIQDAN_OSHDI: 'fakt qoldig‘idan oshadi (ruxsat, ogohlantirish)', QORALAMA_TAKROR: 'qoralamadagi F2 bilan birga ikki marta olinadi — tekshiring' };
/** Hajm qoldiqdan oshgan ogohlantirishlar - maydon sariq (blok emas). */
const OSH_OGOH = new Set<F2Qator['ogoh']>(['SMETADAN_OSHDI', 'QOLDIQDAN_OSHDI', 'QORALAMA_TAKROR']);
/** Tahrirlanayotgan QORALAMA akt (?akt=ID): sarlavha + qatorlar (t2_akt_qator) - kiritmalarga yuklanadi. */
type AktBand = { id?: number; qator_id: number; hajm: number | string | null; certified_quantity: number | string | null; certified_unit_price: number | string | null; certified_amount: number | string | null; provenance_status: string | null; raw_snapshot?: unknown };
type TahrirAkt = { id: number; raqam: string | null; oy: string | null; holat: string; lifecycle_status: string | null; versiya: number; qatorlar: AktBand[] };
const sonQ = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const kirit = 'rounded border border-border bg-bg px-2 py-1 text-right tabular-nums outline-none focus:border-accent';

/** Ish ichidagi resurslar jadvali — Excel uslubidagi ustun filtrlari bilan (har ish kartasida o'z filtri; tekis — saralash mumkin). */
function ResursJadval({ resurslar, ustunlar, qator }: { resurslar: F2Resurs[]; ustunlar: Ustun<F2Resurs>[]; qator: (r: F2Resurs) => ReactNode }) {
  const f = useJadvalFiltr(resurslar, ustunlar);
  const F = (kalit: string) => <UstunFiltrTugma {...f.tugma(kalit)} />;
  const bosh = f.natija.length === 0;
  return <>
    {f.soni > 0 && <div className="border-t border-border px-3 py-1"><FiltrHolatQatori soni={f.soni} natija={f.natija.length} jami={resurslar.length} tozala={f.tozala} /></div>}
    <table className="w-full border-t border-border text-[12.5px]">
      <thead><tr className="text-[10.5px] uppercase tracking-wide text-text-mute">
        <th className="py-1 pl-9 pr-2 text-left font-semibold">{t('Resurs')}{F('nom')}</th><th className="px-2 text-right font-semibold">{t('Birlik')}{F('birlik')}</th>
        <th className="px-2 text-right font-semibold">{t('Hajm')}{F('hajm')}</th><th className="px-2 text-right font-semibold">{t('Narx · manba')}<SummaYorliq tur="narx" />{F('narx')}</th>
        <th className="px-2 text-right font-semibold">{t('Summa')}{F('summa')}</th><th className="px-2 text-left font-semibold">{t('Holat')}{F('holat')}</th>
      </tr></thead>
      <tbody>{f.natija.map(qator)}{bosh && <tr><td colSpan={6} className="py-1.5 pl-9 text-text-mute">{t('Filtr bo‘yicha qator topilmadi.')}</td></tr>}</tbody>
    </table>
  </>;
}

/**
 * F2 tayyorlash (egasi, 2026-10-01: "fakt kiritishdan ideal F2 gacha").
 * Operator ISH hajmini tanlaydi → resurslari (hajm × norma) avtomatik ergashadi; narx — oldingi F2 → smeta (manba ko'rinadi),
 * summa avtomatik; hujjat raqami bir marta. Server qoidasi o'zgarmaydi: har resursda narx yoki ongli "narxsiz".
 */
export function F2TayyorlashNative() {
  const moneyScope = useRef<HTMLDivElement>(null);
  const { joriy, superadmin } = useKompaniya();
  /** «Eski F2 ni storno qilish» ruxsati: F2 tarixidagi storno tugmasi bilan bir xil (f2.prepare, yozish yopiq rol emas). */
  const mayPrepare = !!superadmin || (!rolF2YozishYopiq(joriy?.rol) && !!joriy?.permissions?.includes('f2.prepare'));
  const [stornoTanlovOchiq, setStornoTanlovOchiq] = useState(false);
  const [ndsFoiz, setNdsFoiz] = useState(String(NDS_SUKUT_FOIZ));
  const workspace = usePTOWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [rows, setRows] = useState<T2Qator[]>([]);
  const [holat, setHolat] = useState<QatorHolat[]>([]);
  const [qoralamaHajm, setQoralamaHajm] = useState<ReadonlyMap<number, number>>(new Map());
  /** Smeta versiyasi faollashtirilgan obyekt: eski qatorlardagi tasdiqlangan F2 → yangi qator (faqat belgi; «mumkin» va jamiga kirmaydi). */
  const [kochirma, setKochirma] = useState<F2VersiyaKochirma | null>(null);
  const avvalgiF2 = useMemo(() => avvalgiF2Xaritasi(kochirma), [kochirma]);
  /** Протокол согласования цен qatorlari (tasdiqlangan — kuchga kirgan oydan narx ustuvor). */
  const [protokolQ, setProtokolQ] = useState<NarxProtokolQator[]>([]);
  /** O'qish xatolari — jim bo'sh qiymat emas, `sabablar` da ko'rinadi va saqlashni to'xtatadi (audit 2026-11-06). */
  const [protokolXato, setProtokolXato] = useState(false);
  const [qoralamaXato, setQoralamaXato] = useState(false);
  /** Oxirgi yuborilgan yuk kaliti (A-17): yuk o'zgarsa yangi operationId — server eski aktni «takror» deb qaytarmasin. */
  const yukKalit = useRef('');
  const [k, setK] = useState<F2Kiritma>(bosKiritma);
  /** Hajm manbai: operator tanlamaguncha — obyektda fakt qoldig'i bo'lsa `fakt`, bo'lmasa `smeta` (faktsiz F2). */
  const [manbaTanlov, setManbaTanlov] = useState<F2Manba | null>(null);
  /** Fakt F2 dan kam qatorlarni minus bilan chegirish — ixtiyoriy, sukut o'chiq (F2 faktdan oldinda bo'lishi normal); faqat shu sahifa holati. */
  const [ortiqchaChegir, setOrtiqchaChegir] = useState(false);
  /** «Yangi qatorlar smeta narxida» (pereraschet qoralamasida sukut YOQIQ): null — operator tanlamagan. */
  const [smetaNarxTanlov, setSmetaNarxTanlov] = useState<boolean | null>(null);
  /** «Faktdan F2» (Fakt jurnalidan ?oy=YYYY-MM): davr fakt sahifasida tanlangan bo'lsa — shu oy. */
  const [oy, setOy] = useState(() => { const p = params.get('oy'); return p && /^\d{4}-\d{2}$/.test(p) ? `${p}-01` : oyBoshlanishi(); });
  const [raqam, setRaqam] = useState('');
  const [qidir, setQidir] = useState('');
  /** Bitta almashtirgich: faqat shu davrda hajmi kiritilgan ishlar (hamma bo'limlardan). */
  const [faqatKiritilgan, setFaqatKiritilgan] = useState(false);
  /** Tanlangan razdel kaliti (id; -1 = bo'limsiz). Istalgan daraja: uning barcha avlod ishlari ko'rinadi. */
  const [bolimId, setBolimId] = useState<number | undefined>(undefined);
  /** Chap daraxtda faqat F2 ga olish mumkin ishi bor razdellar. */
  const [faqatMumkin, setFaqatMumkin] = useState(false);
  const [korsatLimit, setKorsatLimit] = useState(F2_KORSAT_BOSH);
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
  const [tomonlar, setTomonlar, imzoTafsilot] = useHujjatTomonlari(joriy?.id, validId ? obyektId : null);
  const aktParam = Number(params.get('akt'));
  const aktId = Number.isSafeInteger(aktParam) && aktParam > 0 ? aktParam : null;
  const [akt, setAkt] = useState<TahrirAkt | null>(null);
  const [aktXato, setAktXato] = useState('');
  const aktQollandi = useRef<string | null>(null);
  /** Faqat qoralama (draft) akt tahrirlanadi; tasdiqlangan/yuborilgan - faqat ko'rish. */
  const aktKorish = !!akt && (akt.holat !== 'qoralama' || (akt.lifecycle_status ?? 'draft') !== 'draft');
  /** Storno bloki tahriri (egasi 2026-11-06): saqlanmagan tahrirlangan storno qatorlari; null — qoralamadagi aynan nusxa. */
  const [stornoTahrir, setStornoTahrir] = useState<SaqlanganAktQator[] | null>(null);
  const [stornoTahrirOchiq, setStornoTahrirOchiq] = useState(false);
  /** Akt qatorlari storno tahriri bilan: tahrirlangan storno bloki + qoralamaning oddiy qatorlari (ular kiritmalardan qayta yoziladi). */
  const aktQatorlar = useMemo<readonly SaqlanganAktQator[]>(() => (!akt ? [] : stornoTahrir ? [...stornoTahrir, ...akt.qatorlar.filter((x) => !stornoQatorimi(x))] : akt.qatorlar), [akt, stornoTahrir]);
  const aslStorno = useMemo(() => (akt?.qatorlar ?? []).filter(stornoQatorimi), [akt]);
  /** «Сторно (eski F2)» bloki: shu qoralamadagi storno qatorlari (hujjat boshida; qoralamada daraxtda tahrirlanadi, saqlashda qayta yoziladi). */
  const stornoBlok = useMemo(() => {
    const qs = aktQatorlar.filter(stornoQatorimi);
    return { soni: qs.length, jami: yigindi2(qs.map((x) => sonQ(x.certified_amount))), nomalum: qs.filter((x) => sonQ(x.certified_amount) == null).length };
  }, [aktQatorlar]);

  const qc = useIxtiyoriyQueryClient();
  useEffect(() => {
    if (!joriy?.id) return;
    // Umumiy kesh (60 s): Holat/Fakt/PTO kontekst bilan bir kalit — sahifaga o'tganda qayta o'qilmaydi.
    void (qc ? obyektlarKeshdan(qc, joriy.id) : sbT2ObyektlarOlKomp(joriy.id)).then((result) => setObyektlar((result.ok ? result.qatorlar : []) as T2Obyekt[]));
  }, [joriy?.id, qc]);


  /** Loads are numbered: rows of an object the user already left must never stay under the new object (an F2 act is written from them). */
  const sorov = useRef(0);
  const sessObyekt = useRef<number | null>(null);
  /** [tezlik] belgisi: yuklash boshidan daraxt ekranga chizilguncha (konsol + Performance panel). */
  const tezlik = useRef<ReturnType<typeof tezlikBelgisi> | null>(null);
  const yuklash = useCallback(async () => {
    sessObyekt.current = null;
    const raqam = ++sorov.current;
    const dolzarb = () => raqam === sorov.current;
    if (!validId) { setRows([]); setHolat([]); setProtokolQ([]); setAosrsiz([]); setAosrKoz(new Map()); return; }
    tezlik.current = tezlikBelgisi('f2-tayyorlash');
    setLoading(true); setError(''); setRows([]); setHolat([]); setAkt(null); setAktXato(''); setStornoTahrir(null); setStornoTahrirOchiq(false); aktQollandi.current = null;
    setProtokolXato(false); setQoralamaXato(false); yukKalit.current = '';
    try {
      if (aktId != null) {
        void (async () => {
          const [a, q] = await Promise.all([
            sbOqi<{ id: number; raqam: string | null; oy: string | null; holat: string; lifecycle_status: string | null; versiya: number | null }>({ jadval: 't2_akt', filtr: `id=eq.${aktId}&obyekt_id=eq.${obyektId}&tur=eq.f2`, ustunlar: 'id,raqam,oy,holat,lifecycle_status,versiya', limit: 1 }),
            // Sahifalab (A-5): shlyuz bir chaqiruvda ~5k qator beradi — qisman qoralama saqlansa qolgan qatorlar o'chib ketardi.
            t2ToliqOqi<AktBand>(sbOqi, { jadval: 't2_akt_qator', filtr: `akt_id=eq.${aktId}&obyekt_id=eq.${obyektId}`, ustunlar: 'id,qator_id,hajm,certified_quantity,certified_unit_price,certified_amount,provenance_status,raw_snapshot', limit: 200000 }, 'id'),
          ]);
          if (!dolzarb()) return;
          const h0 = a.ok ? a.qatorlar?.[0] : undefined;
          if (!a.ok || !q.ok) { setAktXato(t('F2 akti o‘qilmadi. Qayta urinib ko‘ring.')); return; }
          if (q.toliq === false) { setAktXato(t('F2 akti qatorlari to‘liq o‘qilmadi — qisman saqlash qatorlarni o‘chirib yuborardi. Qayta urinib ko‘ring.')); return; }
          if (!h0 || h0.versiya == null) { setAktXato(t('Bu obyektda bunday F2 akti topilmadi.')); return; }
          setAkt({ id: h0.id, raqam: h0.raqam, oy: h0.oy, holat: h0.holat, lifecycle_status: h0.lifecycle_status, versiya: Number(h0.versiya), qatorlar: q.qatorlar ?? [] });
        })().catch(() => { if (dolzarb()) setAktXato(t('F2 akti o‘qilmadi. Qayta urinib ko‘ring.')); });
      }
      // Protokol o'qilmasa jim [] emas (A-13): narx boshqa manbadan olinib ketardi — xato holati saqlashni to'xtatadi.
      void Promise.resolve().then(() => narxProtokolQatorlariOl(obyektId)).then((r) => {
        if (!dolzarb()) return;
        const ok = !!r?.ok && r.toliq !== false;
        setProtokolQ(ok ? (r.qatorlar || []).filter((x) => x.holat === 'tasdiqlangan') : []); setProtokolXato(!ok);
      }).catch(() => { if (dolzarb()) { setProtokolQ([]); setProtokolXato(true); } });
      void sbAosrCoverageOl(obyektId).then((c) => { if (dolzarb()) { setAosrsiz(c.ok ? (c.qatorlar || []).filter((x) => x.yashirin && !x.akt_bor) : []); setAosrKoz(new Map(c.ok ? (c.qatorlar || []).map((x) => [x.qator_id, aosrIshora(x)] as const) : [])); } }).catch(() => { if (dolzarb()) setAosrsiz([]); });
      void Promise.resolve().then(() => f2VersiyaKochirmaOl(obyektId)).then((r) => { if (dolzarb()) setKochirma(r.ok ? r.natija : null); }).catch(() => { if (dolzarb()) setKochirma(null); });
      // Boshqa qoralamalardagi hajm o'qilmasa (A-14) — QORALAMA_TAKROR himoyasi jim o'chmaydi: xato holati.
      void Promise.resolve().then(() => sbF2QoralamaHajmlar(obyektId, aktId)).then((qh) => { if (dolzarb()) { setQoralamaHajm(qh.ok ? qh.hajm : new Map()); setQoralamaXato(!qh.ok); } }).catch(() => { if (dolzarb()) { setQoralamaHajm(new Map()); setQoralamaXato(true); } });
      const dh = await daraxtHolatOl(obyektId);
      if (!dolzarb()) return;
      if (!dh.ok) { setRows([]); setHolat([]); setError('F2 uchun smeta va fakt qoldig‘i o‘qilmadi.'); return; }
      setRows(dh.rows); setHolat(dh.holat);
      sessObyekt.current = aktId == null ? obyektId : null;
      const sess = aktId == null ? f2SessiyaOqi(obyektId) : null; // saqlanmagan kiritmalar (yangilashdan keyin ham)
      // Raqam har yuklashda tiklanadi (A-9): obyekt almashtirilganda eski obyekt raqami yangisiga o'tib qolmasin.
      setK(sess?.k ?? bosKiritma()); setRaqam(sess?.raqam ?? ''); setBolimId(undefined); setManbaTanlov(null); setOrtiqchaChegir(false); setSmetaNarxTanlov(null);
      operationId.current = yangiOperationId();
    } catch { if (dolzarb()) { setRows([]); setHolat([]); setError('F2 uchun ma’lumotlar o‘qilmadi. Qayta urinib ko‘ring.'); } }
    finally { if (dolzarb()) setLoading(false); }
  }, [obyektId, validId, aktId]);
  useEffect(() => { void yuklash(); }, [yuklash]);
  useEffect(() => {
    if (loading || !rows.length || !tezlik.current) return;
    const b = tezlik.current; tezlik.current = null;
    const izoh = `${rows.length} qator (obyekt ${obyektId})`;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(() => b.tugadi(izoh), 0)); else b.tugadi(izoh);
  }, [loading, rows.length, obyektId]);
  /** Saqlanmagan kiritmalar sessionStorage da (faqat shu obyekt yuklangach — eski obyekt kiritmasi yangisiga yozilmasin). */
  useEffect(() => { if (validId && aktId == null && sessObyekt.current === obyektId) f2SessiyaSaqla(obyektId, { k, raqam }); }, [k, raqam, validId, aktId, obyektId]);

  /**
   * Resurs zamenasi/chiqarish qatlami (egasi 2026-10-27): faol «bajarilmaydi» belgilari (chiqarilgan resurslar), zamena → asl
   * bog'lanishi va almashtirish miqdori. Yuklanmaguncha F2 saqlanmaydi (chiqarilgan resurs F2 ga tushib qolmasin).
   */
  const [baj, setBaj] = useState<BajarilmadiQator[]>([]);
  const [zb, setZb] = useState<ZamenaBoglanish | null>(null);
  const [miqdor, setMiqdor] = useState<ReadonlyMap<number, number>>(new Map());
  const [qoshTayyor, setQoshTayyor] = useState(false);
  const [bajXato, setBajXato] = useState(false);
  /** Zamena bog'lanishi o'qilmadi (A-2): bo'sh xarita bilan davom etilsa asl + zamena ikkalasi F2 ga tushardi. */
  const [zamenaXato, setZamenaXato] = useState(false);
  /**
   * O'z hisoblagichi: asosiy `yuklash` (`sorov`) qayta boshlanganda (masalan, qoralamaga avto «davom» o'tishi) bu so'rov
   * tashlab yuborilmasin — aks holda `qoshTayyor` abadiy false qolib, saqlash sababsiz yopiq turardi.
   */
  const qoshSorov = useRef(0);
  const qoshimchaYukla = useCallback(async () => {
    if (!validId || !joriy?.id) { setBaj([]); setZb(null); setMiqdor(new Map()); setBajXato(false); setZamenaXato(false); setQoshTayyor(true); return; }
    const raqam = ++qoshSorov.current;
    setQoshTayyor(false); setBajXato(false); setZamenaXato(false);
    const [b, z] = await Promise.all([
      bajarilmadiRoyxatOl(joriy.id, obyektId).catch(() => null),
      zamenaToliqOqi(obyektId).catch(() => null), // t2_qator (zamena) bir marta — bog'lanish + miqdor
    ]);
    if (raqam !== qoshSorov.current) return;
    const zOk = !!z?.ok;
    setBaj(b?.ok ? b.qatorlar : []); setBajXato(!b?.ok);
    setZb(z?.ok ? z.natija.boglanish : null); setMiqdor(z?.ok ? z.natija.miqdor : new Map()); setZamenaXato(!zOk); setQoshTayyor(true);
  }, [validId, joriy?.id, obyektId]);
  useEffect(() => { void qoshimchaYukla(); }, [qoshimchaYukla]);
  /** Zamena/chiqarishdan keyin: daraxt va holat qayta o'qiladi, operator kiritmalari (hajm/narx) SAQLANADI. */
  const tuzilmaYangila = async () => {
    const raqam = sorov.current;
    const dh = await daraxtHolatOl(obyektId).catch(() => null);
    if (raqam !== sorov.current) return;
    if (dh?.ok) { setRows(dh.rows); setHolat(dh.holat); }
    else toast(t('Saqlandi, lekin jadvalni yangilab bo‘lmadi — sahifani yangilang.'), 'warn');
    await qoshimchaYukla();
  };

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
  /*
   * Sukut manba (A-10): obyektda fakt bor bo'lsa — `fakt` (hamma fakt allaqachon F2 qilingan bo'lsa ham; jim `smeta` ga o'tib,
   * butun smeta qoldig'ini taklif qilmaydi). Fakt umuman yo'q — `smeta` (faktsiz F2). Qoralamada saqlangan manba tiklanadi.
   */
  const faktBor = useMemo(() => holat.some((h) => h.fakt_hajm != null && Number(h.fakt_hajm) !== 0) || holat.some((h) => Number(h.f2_mumkin_hajm) > 0), [holat]);
  const manba: F2Manba = manbaTanlov ?? (faktBor ? 'fakt' : 'smeta');
  const bajHajm = useMemo(() => bajarilmadiHajmlar(baj), [baj]);
  /** Ishdan chiqarilgan resurslar (faol «bajarilmaydi» butun smeta hajmini qoplaydi) — F2 ga kirmaydi. */
  const chiqarilgan = useMemo(() => {
    const sm = new Map(holat.map((h) => [h.qator_id, h.smeta_hajm]));
    const s = new Set<number>();
    for (const r of rows) if ((r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob') && chiqarilganmi(sm.get(r.id) ?? r.hajm, bajHajm.get(r.id))) s.add(r.id);
    return s;
  }, [rows, holat, bajHajm]);
  const zamenaAsl = useMemo<ReadonlyMap<number, number>>(() => zb?.almashtiradi ?? new Map(), [zb]);
  /** Pereraschet: shu qoralamadagi storno bloki qaytaradigan eski F2 hajmi — yangi hajm = fakt − BOSHQA tasdiqlangan F2 (eski F2 sof 0). */
  const stornoQaytar = useMemo(() => stornoQaytarHajm(aktQatorlar), [aktQatorlar]);
  /** Ochilgan qoralamada fakt ≥ 0 qatorga minus hajm bor (oldin ortiqcha F2 chegirilgan) — chegirish yoqiladi, aks holda qator yo'qolib qoladi. */
  const aktdaOrtiqcha = useMemo(() => {
    if (!akt) return false;
    const fakt = new Map(holat.map((h) => [h.qator_id, h.fakt_hajm == null ? null : Number(h.fakt_hajm)]));
    return akt.qatorlar.some((x) => { if (stornoQatorimi(x)) return false; const q = sonQ(x.certified_quantity) ?? sonQ(x.hajm); const f = fakt.get(x.qator_id); return q != null && q < 0 && f != null && f >= 0; });
  }, [akt, holat]);
  useEffect(() => { if (aktdaOrtiqcha) setOrtiqchaChegir(true); }, [aktdaOrtiqcha]);
  /** Pereraschet qoralamasi (storno bloki bor): yangi qatorlar sukut bo'yicha SMETA narxida (eski F2 narxi taklif qilinmaydi). */
  const pereraschetQoralama = aktId != null && stornoBlok.soni > 0;
  const smetaNarxda = pereraschetQoralama && (smetaNarxTanlov ?? true);
  const f2QurOrtiqcha = useCallback((yoq: boolean) => f2Qur(rows, holat, protokolNarx, manba, qoralamaHajm, { chiqarilgan, zamenaAsl, stornoQaytar, ortiqchaChegir: yoq, smetaNarxda }), [rows, holat, protokolNarx, manba, qoralamaHajm, chiqarilgan, zamenaAsl, stornoQaytar, smetaNarxda]);
  const bolimlar = useMemo(() => f2QurOrtiqcha(ortiqchaChegir), [f2QurOrtiqcha, ortiqchaChegir]);
  /** «N ta qatorda F2 faktdan ko'p (≈ X so'm)» — chegirish yoqilgan holatdagi qurilishdan (o'chiq bo'lsa alohida hisoblanadi). Smeta rejimida — yo'q. */
  const ortiqchaX = useMemo(() => (manba !== 'fakt' || !rows.length ? null : ortiqchaXulosa(ortiqchaChegir ? bolimlar : f2QurOrtiqcha(true))), [manba, rows.length, ortiqchaChegir, bolimlar, f2QurOrtiqcha]);
  /** O'chirilganda chegirma qatorlarining kiritmalari tozalanadi (F2 ga tushib qolmasin). */
  const ortiqchaAlmashtir = (yoq: boolean) => {
    if (!yoq) {
      const ids: number[] = [];
      for (const b of bolimlar) { for (const i of b.ishlar) { if (i.ortiqchaF2) ids.push(i.id); for (const r of i.resurslar) if (r.ortiqchaF2 && !r.avto) ids.push(r.id); } for (const r of b.alohida) if (r.ortiqchaF2) ids.push(r.id); }
      if (ids.length) setK((o) => ids.reduce((acc, id) => f2QatorniOlibTashla(acc, id), o));
    }
    setOrtiqchaChegir(yoq);
  };
  /** Hajm manbai almashtirish (A-11): kiritmalar tozalanadi — bor bo'lsa avval so'raladi (tahrirda tugma yopiq). */
  const manbaAlmashtir = async (m: F2Manba) => {
    if (m === manba) return;
    const bor = Object.keys(k.hajm).length + Object.keys(k.narx).length + Object.keys(k.summa).length > 0;
    if (bor && !await tasdiqSora(t('Hajm manbai almashtirilsa kiritilgan hajm va narxlar tozalanadi. Davom etamizmi?'))) return;
    setManbaTanlov(m); setK(bosKiritma());
  };
  /** Zamena qoldig'i: shu F2 dagi zamena hajmi asl resurs/ishning F2 hajmidan ayiriladi (yagona zamena-qoldiq formulasi). */
  const zamenaKtx = useMemo((): F2ZamenaKontekst | null => {
    if (!zamenaAsl.size) return null;
    const oldingi = new Map<number, number>(); const serverAlm = new Map<number, number>();
    for (const h of holat) {
      // Shu qoralamada stornolanayotgan eski F2 chiqariladi (sof F2): stornolangan zamena aslni yopmaydi.
      const f2 = Number(h.f2_hajm ?? 0) - (stornoQaytar.get(h.qator_id) ?? 0); if (Number.isFinite(f2) && f2 !== 0) oldingi.set(h.qator_id, f2);
      const a = Number((h as QatorHolat & { almashtirilgan_hajm?: number | null }).almashtirilgan_hajm ?? 0); if (Number.isFinite(a) && a > 0) serverAlm.set(h.qator_id, a);
    }
    return { rows: rows.map((r) => ({ id: r.id, ota_id: r.ota_id ?? null, tur: r.tur, birlik: r.birlik, hajm: r.hajm == null ? null : Number(r.hajm) })), zamenaAsl, miqdor, oldingi, serverAlm };
  }, [rows, holat, zamenaAsl, miqdor, stornoQaytar]);
  const xomQatorlar = useMemo(() => f2Qatorlar(bolimlar, k), [bolimlar, k]);
  const zamenaNatija = useMemo(() => f2ZamenaQolla(xomQatorlar, bolimlar, k, zamenaKtx), [xomQatorlar, bolimlar, k, zamenaKtx]);
  const qatorlar = zamenaNatija.qatorlar;
  const jami = useMemo(() => f2Jami(qatorlar), [qatorlar]);
  // Ish ↔ material hajm muvofiqligi (egasi 2026-11-11): qoralamadagi ish hajmi materiallar hajmiga mosmi — faqat ogohlantirish (bloklamaydi).
  const moslikTuz = useMemo(() => moslikTuzilma(rows), [rows]);
  const moslikOgoh = useMemo(() => {
    const h = new Map<number, number>();
    for (const x of qatorlar) if ((x.tur === 'bl' || x.tur === 'mat' || x.tur === 'ob') && x.hajm > 0) h.set(x.id, x.hajm);
    return h.size ? moslikHisobla(moslikTuz, h) : [];
  }, [moslikTuz, qatorlar]);
  /** Storno (eski narxda) ↔ yangi (smeta narxida) jamilari va farqi. */
  const smetaX = useMemo(() => (smetaNarxda ? smetaNarxXulosa(qatorlar, bolimlar, stornoBlok.jami) : null), [smetaNarxda, qatorlar, bolimlar, stornoBlok.jami]);
  const katKesim = useMemo(() => f2KatKesim(qatorlar), [qatorlar]);
  const byId = useMemo(() => new Map(qatorlar.map((x) => [x.id, x])), [qatorlar]);
  const narxsizlar = useMemo(() => narxsizNomzodlar(qatorlar), [qatorlar]);
  const aosrsizId = useMemo(() => new Set(aosrsiz.map((x) => x.qator_id)), [aosrsiz]);
  const resursKodi = useMemo(() => { const m = new Map<number, string | null>(); for (const b of bolimlar) { for (const i of b.ishlar) for (const r of i.resurslar) m.set(r.id, r.kod); for (const r of b.alohida) m.set(r.id, r.kod); } return (id: number) => m.get(id) ?? null; }, [bolimlar]);
  const resursNomi = useMemo(() => { const m = new Map<number, string>(); for (const b of bolimlar) { for (const i of b.ishlar) { m.set(i.id, i.nom); for (const r of i.resurslar) m.set(r.id, r.nom); } for (const r of b.alohida) m.set(r.id, r.nom); } return (id: number) => m.get(id) ?? null; }, [bolimlar]);
  /** Vedomostdan tanlangan taklif narxi: faqat F2 qatoriga (qo'lda narx) yoziladi - asl smetaga emas. */
  const narxniQollash = (ids: number[], narx: number) => setK((o) => { const n = { ...o.narx }; const ns = { ...o.narxsiz }; for (const id of ids) { n[id] = sonMatn(narx); delete ns[id]; } return { ...o, narx: n, narxsiz: ns }; });
  const tayyor = qatorlar.length > 0 && jami.xato === 0;
  /** Faqat storno bloki tahrirlangan bo'lsa ham qoralama saqlanadi (yangi plyus qatorlarsiz). */
  const stornoOzgardi = aktId != null && stornoTahrir != null;
  /** DUBLIKAT HIMOYASI (egasi 2026-10-25): shu obyektda shu raqam bor — BLOK; summasi ±0,5% teng F2 / pereraschet — ogohlantirish. */
  const { aktlar: obyektAktlari, yuklandi: obyektAktlariYuklandi, xato: obyektAktlariXato, qayta: obyektAktlariQayta } = useObyektF2Aktlari(validId ? obyektId : null, saving ? 1 : 0);
  /**
   * DAVOM (egasi 2026-11-05): ?akt siz ochilganda shu oy uchun F2 QORALAMA bor bo'lsa — jim yangi akt boshlanmaydi, o'sha qoralama
   * ochiladi (eng yangisi). «Yangi alohida F2 boshlash» — `?yangi=1`. Har obyekt+oy uchun bir marta.
   */
  const davomTekshirildi = useRef<string | null>(null);
  /** Davom tekshiruvi tugagan kalit (obyekt:oy) — ?avto=1 shundan keyingina hajm oladi (A-24: avto + davom poygasi). */
  const [davomTayyor, setDavomTayyor] = useState<string | null>(null);
  const davomKalit = `${obyektId}:${oy.slice(0, 7)}`;
  useEffect(() => {
    if (!validId || aktId != null || params.get('yangi') === '1' || !obyektAktlariYuklandi) return;
    const kalit = davomKalit;
    if (davomTekshirildi.current === kalit) return;
    davomTekshirildi.current = kalit;
    const qoralama = obyektAktlari
      .filter((a) => a.holat === 'qoralama' && ((a as { lifecycle_status?: string | null }).lifecycle_status ?? 'draft') === 'draft' && String(a.oy ?? '').slice(0, 7) === oy.slice(0, 7))
      .sort((a, b) => b.id - a.id)[0];
    if (!qoralama) { setDavomTayyor(kalit); return; }
    let bekor = false; let tugadi = false;
    // A-12: faqat shu sahifada yaratilgan qoralama avtomatik ochiladi; importdan kelgani — yo'q (qatorlari normadan qayta hisoblanib o'chardi).
    void Promise.resolve(sbOqi<{ raw_snapshot?: unknown }>({ jadval: 't2_akt_qator', filtr: `akt_id=eq.${qoralama.id}`, ustunlar: 'raw_snapshot', limit: 200 }))
      .then((r) => r?.ok === true && davomMumkinmi(r.qatorlar ?? []))
      .catch(() => false)
      .then((mumkin) => {
        if (bekor) return;
        tugadi = true;
        if (!mumkin) { setDavomTayyor(kalit); return; }
        avtoQollandi.current = true; // ?avto=1 qoralama ustiga yozilmaydi
        if (params.get('avto') === '1') toast(t('Bu oy uchun F2 qoralama bor — u ochildi; fakt hajmlari avtomatik olinmadi.'), 'warn');
        setParams((p) => { const x = new URLSearchParams(p); x.set('akt', String(qoralama.id)); x.set('davom', '1'); x.delete('avto'); return x; }, { replace: true });
      });
    return () => { bekor = true; if (!tugadi && davomTekshirildi.current === kalit) davomTekshirildi.current = null; };
  }, [validId, aktId, params, obyektAktlariYuklandi, obyektAktlari, obyektId, oy, setParams, davomKalit]);
  const davomOchildi = aktId != null && params.get('davom') === '1';
  /** Storno qoralamasi qaysi eski F2 larni storno qilishi (audit m8: hammasi, faqat birinchisi emas): `raw_snapshot.stornoOf`. */
  const stornoManbaAktlar = useMemo(() => {
    const ids: number[] = [];
    for (const x of aktQatorlar) {
      if (!stornoQatorimi(x)) continue;
      const id = Number((x.raw_snapshot as { stornoOf?: unknown }).stornoOf);
      if (Number.isSafeInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
    }
    return ids.map((id) => ({ id, raqam: obyektAktlari.find((a) => a.id === id)?.raqam ?? null }));
  }, [aktQatorlar, obyektAktlari]);
  /** B1 (audit): storno qatorlari eski smeta versiyasida bo'lishi mumkin — metama'lumoti tarixdan (kat, nom, razdel). */
  const [stornoTarix, setStornoTarix] = useState<StornoTarixQator[]>([]);
  const stornoIdKalit = useMemo(() => aktQatorlar.filter(stornoQatorimi).map((x) => x.qator_id).join(','), [aktQatorlar]);
  useEffect(() => {
    if (!validId || !stornoIdKalit) { setStornoTarix([]); return; }
    const bor = new Set(rows.map((r) => r.id));
    const kerak = stornoIdKalit.split(',').map(Number).filter((id) => !bor.has(id));
    if (!kerak.length) { setStornoTarix([]); return; }
    let jonli = true;
    void f2StornoQatorTarixOl(obyektId, kerak, bor).then((r) => { if (jonli) setStornoTarix(r.qatorlar); }).catch(() => undefined);
    return () => { jonli = false; };
  }, [validId, obyektId, stornoIdKalit, rows]);
  /** Storno bloki manbasi tasdiqlanmagan F2 bo'lsa — saqlash server tomonidan rad etiladi; oldindan aniq sabab bilan bloklanadi. */
  const stornoManbaXato = useMemo(() => (obyektAktlariYuklandi ? stornoManbaTasdiqlanmagan(stornoManbaAktlar.map((a) => a.id), obyektAktlari) : []), [obyektAktlariYuklandi, stornoManbaAktlar, obyektAktlari]);
  const stornoAktRaqami = useCallback((id: number) => obyektAktlari.find((a) => a.id === id)?.raqam ?? null, [obyektAktlari]);
  /* PERERASCHET (egasi 2026-11-03): eski F2 bloklari — har biri O'Z hujjat podvali bilan; yangi qatorlar — smeta podvali bilan. */
  const aktPodval = useAktPodvallar(validId && aktId != null ? obyektId : null);
  const ustama = useUstamaliSumma(validId && aktId != null ? obyektId : null, { kompaniyaId: joriy?.id });
  const eskiBloklar = useMemo(() => {
    const sm = new Map<number, PereraschetSmetaQatorT>(rows.map((r) => [r.id, r] as const));
    for (const x of stornoTarix) if (!sm.has(x.id)) sm.set(x.id, x);
    const raqamlar = new Map(obyektAktlari.map((a) => [a.id, a.raqam ?? null] as const));
    return pereraschetBloklari(aktQatorlar, sm, raqamlar);
  }, [aktQatorlar, rows, stornoTarix, obyektAktlari]);
  /** Haqiqiy noma'lum summa (audit M1): ish (bl) va mashinist mehnati sanalmaydi (f2-pereraschet qoidasi). */
  const stornoNomalum = useMemo(() => eskiBloklar.reduce((n, b) => n + b.nomalum, 0), [eskiBloklar]);
  /** Ochiq qoralamaga tanlov oynasidan storno qatorlari qo'shiladi (audit M8): yangi qoralama yaratilmaydi, kiritmalar saqlanadi. */
  const stornoQoralamagaQosh = useCallback((qs: StornoYukQator[], ogoh?: string) => {
    const mavjud = aktQatorlar.filter(stornoQatorimi);
    const band = new Set(mavjud.map((x) => x.qator_id));
    const yangi: SaqlanganAktQator[] = [];
    let takror = 0;
    for (const q of qs) {
      if (band.has(q.qatorId)) { takror++; continue; }
      band.add(q.qatorId);
      yangi.push({ qator_id: q.qatorId, hajm: q.certifiedQuantity, certified_quantity: q.certifiedQuantity, certified_unit_price: q.certifiedUnitPrice ?? null,
        certified_amount: q.certifiedAmount ?? null, provenance_status: q.priceIntentionallyAbsent ? 'price_intentionally_absent' : null, raw_snapshot: q.rawSnapshot });
    }
    setStornoTahrir([...mavjud, ...yangi]);
    setStornoTanlovOchiq(false);
    toast(t('{n} qator storno blokiga qo‘shildi — «Saqlash» bilan yozing.', { n: String(yangi.length) }), 'ok');
    if (takror) toast(t('{n} qator storno blokida allaqachon bor — qayta qo‘shilmadi.', { n: String(takror) }), 'warn');
    if (ogoh) toast(ogoh, 'warn');
  }, [aktQatorlar]);
  /** Yangi (saqlanmagan) F2 kiritmalari bor bo'lsa — storno yangi qoralama ochadi, kiritmalar yo'qolishi aniq aytiladi (audit M8). */
  const stornoTanlovOch = async () => {
    if (aktId == null && qatorlar.length > 0 && !await tasdiqSora(t('Kiritilgan {n} qator hali saqlanmagan. Storno yangi qoralama ochadi va bu kiritmalar shu sahifada qolmaydi. Avval saqlash tavsiya etiladi. Baribir davom etasizmi?', { n: String(qatorlar.length) }))) return;
    setStornoTanlovOchiq(true);
  };
  /** Pereraschet sarlavhasi: qaysi eski F2 lar minus (storno bloklari) — tepada, yangi hajmlar pastda. */
  const pereraschetSarlavha = aktId != null && eskiBloklar.length > 0
    ? t('Pereraschet: eski F2 №{r} minus (tepada) + yangi hajmlar (pastda)', { r: eskiBloklar.map((b) => b.raqam || String(b.manbaAktId)).join(', №') })
    : null;
  /** Blok foizlari: shu aktdagi blok nusxasi, bo'lmasa manba aktning o'z podvali; yo'q — null (smeta podvali). */
  const blokNk = useCallback((manbaId: number) => aktPodval.nkOl(aktId ?? -1, String(manbaId)) ?? aktPodval.nkOl(manbaId, ''), [aktPodval, aktId]);
  const pereraschetBaho = useMemo(
    () => (eskiBloklar.length > 0 && ustama.holat === 'tayyor' && aktPodval.holat === 'tayyor'
      ? pereraschetBaholash(eskiBloklar, blokNk, katKesim, { podval: ustama.podval, koef: ustama.koef }) : null),
    [eskiBloklar, ustama.holat, ustama.podval, ustama.koef, aktPodval.holat, blokNk, katKesim]);
  const dublikatlar = useMemo(() => {
    if (!validId || aktId != null || !qatorlar.length) return [];
    const yuk = f2Yuk(qatorlar, raqam);
    const jamiS = yuk.some((r) => r.certifiedAmount != null) ? yuk.reduce((s, r) => s + (r.certifiedAmount ?? 0), 0) : null;
    return dublikatTekshiruv({ aktlar: obyektAktlari, oy: oy.slice(0, 7), raqam, jami: jamiS, ozAktId: null, manbaAktIdlar: [],
      pereraschet: pereraschetBelgisi(rows, yuk.map((r) => r.qatorId)) });
  }, [validId, aktId, qatorlar, raqam, oy, obyektAktlari, rows]);
  /** Tugallanmagan narx/summa kiritmalari (yopiq/filtrlangan qatorlarniki ham) — sabablarda qator bilan. */
  const pulXato = useMemo(() => [...Object.entries(k.narx), ...Object.entries(k.summa)]
    .filter(([id, v]) => !k.narxsiz[Number(id)] && v !== '' && !isCompleteMoney(v)).map(([id]) => Number(id)), [k.narx, k.summa, k.narxsiz]);
  /** YAGONA «nega saqlanmaydi» ro'yxati (audit 2026-11-06): har to'siq sababi va amali bilan; saqlash faqat bloklovchi sabab yo'q bo'lsa. */
  const sabablar = useMemo((): SaqlashSabab[] => saqlashSabablari({
    validId, kompaniya: !!joriy?.id, loading, error: !!error,
    tahrir: aktId != null, aktBor: !!akt, aktXato, aktKorish,
    qatorSoni: qatorlar.length,
    xatoHajm: qatorlar.filter((x) => x.xato === 'HAJM').map((x) => x.id),
    xatoNarx: qatorlar.filter((x) => x.xato === 'NARX').map((x) => x.id),
    xatoSumma: qatorlar.filter((x) => x.xato === 'SUMMA').map((x) => x.id),
    pul: pulXato,
    dublikatBlok: dublikatlar.find((m) => m.daraja === 'blok')?.matn ?? null,
    aktlarYuklandi: obyektAktlariYuklandi, aktlarXato: obyektAktlariXato,
    qoshTayyor, bajXato, zamenaXato, protokolXato, qoralamaXato,
    avtoNarxsiz: narxsizlar,
    stornoOzgardi,
    stornoManbaXato: stornoManbaXato.length > 0
      ? t('Storno manbasi F2 №{r} tasdiqlanmagan — avval uni tasdiqlang yoki storno blokini olib tashlang. Bu holatda qoralama saqlanmaydi.', { r: stornoManbaXato.map((a) => a.raqam || String(a.id)).join(', №') })
      : null,
  }), [validId, joriy?.id, loading, error, aktId, akt, aktXato, aktKorish, qatorlar, pulXato, dublikatlar, obyektAktlariYuklandi, obyektAktlariXato, qoshTayyor, bajXato, zamenaXato, protokolXato, qoralamaXato, narxsizlar, stornoOzgardi, stornoManbaXato]);
  const toSiqlar = useMemo(() => bloklovchi(sabablar), [sabablar]);
  const saqlashMumkin = toSiqlar.length === 0;
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

  /* Excel uslubidagi ustun filtrlari (egasi 2026-10-27): ishlar ro'yxati kartalarda — sarlavha o'rnida ixcham filtr qatori.
   * Qidiruv, bo'lim tanlovi va «Faqat kiritilganlar» bilan VA. Saralash — har bo'lim ichida. */
  const filtrKtx = useMemo((): F2FiltrKontekst & { narx: (r: F2Resurs) => number | null } => ({
    hajm: (id) => { const x = byId.get(id); if (x && !x.xato) return x.hajm; const v = sonOqi(k.hajm[id]); return typeof v === 'number' ? v : null; },
    summa: (id) => byId.get(id)?.summa ?? null,
    narx: (r) => byId.get(r.id)?.narx ?? r.taklifNarx ?? null,
    holat: (id) => {
      const x = byId.get(id);
      if (x?.xato) return t(XATO_MATN[x.xato]);
      if (x?.ogoh) return t(OGOH_MATN[x.ogoh]);
      if (k.narxsiz[id] === true) return t('narxsiz');
      return x ? t('Kiritilgan') : t('Kiritilmagan');
    },
  }), [byId, k.hajm, k.narxsiz]);
  const elementlar = useMemo(() => f2Elementlar(korinadi), [korinadi]);
  const elementUstunlar = useMemo(() => f2ElementUstunlar(filtrKtx), [filtrKtx]);
  const resursUstunlar = useMemo(() => f2ResursUstunlar(filtrKtx), [filtrKtx]);
  const uf = useJadvalFiltr(elementlar, elementUstunlar);
  const korinadiF = useMemo(() => (uf.soni ? f2QaytaQur(korinadi, uf.natija) : korinadi), [uf.soni, uf.natija, korinadi]);
  /**
   * ТН·КМ takliflari (tezlik 2026-11-06): avval HAR т·км kartasi HAR renderda barcha ishlarni (Sun'iy ko'l: 2569) qayta yig'ib
   * normalizatsiya qilardi — Chrome qotardi. Endi ro'yxatlar bir marta, taklif faqat ko'rinadigan т·км ishlar uchun.
   * Natija aynan o'sha: т·км ishning o'zi tkmTaklif ichida baribir chiqariladi (т·км birlikli qatorlar hisobga olinmaydi).
   */
  /** Chegaralangan render (tezlik): ish kartalari VA alohida material qatorlari umumiy byudjetga kiradi (avval alohida cheksiz edi). */
  const korinadiQism = useMemo(() => f2KorinadiQism(korinadiF, korsatLimit), [korinadiF, korsatLimit]);
  /** «Yana ko'rsatish» ko'rinishga kelganda keyingi qism o'zi qo'shiladi (lazy render; IntersectionObserver bo'lmasa — tugma). */
  const yanaRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = yanaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setKorsatLimit((n) => n + F2_KORSAT_QADAM); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [korinadiQism]);
  const tkmSmetaM = useMemo(() => bolimlar.flatMap((b) => b.ishlar).map((x) => ({ nom: x.nom, birlik: x.birlik, hajm: x.smeta })), [bolimlar]);
  const tkmTakliflar = useMemo(() => {
    const m = new Map<number, ReturnType<typeof tkmTaklif>>();
    const tkmIshlar = korinadiF.flatMap((b) => b.ishlar).filter((i) => tkmBirlikmi(i.birlik));
    if (!tkmIshlar.length) return m;
    const f2 = bolimlar.flatMap((b) => b.ishlar).map((x) => { const h = sonOqi(k.hajm[x.id]); return { nom: x.nom, birlik: x.birlik, hajm: typeof h === 'number' ? h : null }; });
    for (const i of tkmIshlar) m.set(i.id, tkmTaklif({ nom: i.nom }, f2, { materiallar: tkmSmetaM, tkmHajm: i.smeta }));
    return m;
  }, [korinadiF, bolimlar, k.hajm, tkmSmetaM]);

  const yoz = (maydon: keyof F2Kiritma, id: number, qiymat: string | boolean | undefined) => setK((o) => {
    const m = { ...o[maydon] } as Record<number, string | boolean>;
    if (qiymat === undefined || qiymat === '') delete m[id]; else m[id] = qiymat;
    return { ...o, [maydon]: m };
  });
  /**
   * «Bo'limni / barcha mumkin hajmni olish»: pul changi (< 1 000 so'm) va qoldig'i 0 qatorlar olinmaydi — lekin JIM emas (A-18):
   * natija toast bilan aytiladi (olindi / chang / qoldiq 0). `jim` — chaqiruvchi o'z xabarini beradi (?avto=1).
   */
  const bolimniOl = (bs: F2Bolim[], jim = false): BolimOlReja => {
    const reja = bolimOlRejasi(bs);
    setK((o) => f2MumkinHajmlarniOl(bs, o));
    if (!jim) {
      const qism = [t('{n} ta olindi', { n: reja.olindi })];
      if (reja.chang) qism.push(t('{n} ta qiymati 1 000 so‘mdan kam — olinmadi', { n: reja.chang }));
      if (reja.nol) qism.push(t('{n} ta qoldig‘i yo‘q — olinmadi', { n: reja.nol }));
      toast(qism.join(' · '), reja.olindi > 0 ? (reja.chang || reja.nol ? 'warn' : 'ok') : 'warn');
    }
    return reja;
  };
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
    // A-24: davom tekshiruvi tugamaguncha hajm olinmaydi (qoralama ochilsa, kiritmalar uning ustiga yozilib ketardi).
    if (aktId == null && params.get('yangi') !== '1' && davomTayyor !== davomKalit) return;
    avtoQollandi.current = true;
    const n = bolimniOl(bolimlar, true).olindi;
    // Tez yo'l: faqat olingan ishlar ko'rinadi (bo'limma-bo'lim yurish shart emas), raqam — keyingi bo'sh raqam (pastdagi effekt).
    if (n > 0) { setFaqatKiritilgan(true); avtoRaqam.current = true; }
    toast(n > 0 ? t('Fakt bo‘yicha {n} ta ish hajmi olindi. Tekshirib, Ctrl+Enter bilan qoralama yarating.', { n: String(n) }) : t('Fakt qoldig‘i yo‘q - olinadigan hajm topilmadi.'), n > 0 ? 'ok' : 'warn');
    setParams((p) => { const x = new URLSearchParams(p); x.delete('avto'); x.delete('oy'); return x; }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bolimlar, params, davomTayyor, davomKalit, aktId]);
  /** Tez yo'lda F2 raqami bo'sh bo'lsa — shu obyektdagi keyingi raqam (aktlar keyinroq o'qilishi mumkin; bir marta). */
  const avtoRaqam = useRef(false);
  useEffect(() => {
    if (!avtoRaqam.current || !raqamTaklif || aktId != null) return;
    avtoRaqam.current = false;
    setRaqam((r) => (r.trim() ? r : raqamTaklif));
  }, [raqamTaklif, aktId, faqatKiritilgan]);  const narxsizBelgila = () => setK((o) => ({ ...o, narxsiz: { ...o.narxsiz, ...Object.fromEntries(narxsizlar.map((id) => [id, true])) } }));

  /** ?akt=ID: qoralama aktning qatorlari kiritmalarga yuklanadi (ish/mustaqil resurs hajmi, resurs narxi); avtomatik resurs hajmi normadan qayta hisoblanadi. */
  const [korinmaganQator, setKorinmaganQator] = useState(0);
  useEffect(() => {
    if (!akt || loading) return;
    const kalit = `${akt.id}:${akt.versiya}`;
    if (aktQollandi.current === kalit) return;
    // Qoralamada saqlangan hajm manbai (A-10) avval tiklanadi: bo'limlar shu manba bo'yicha qurilgach kiritmalar yuklanadi.
    const saqlanganManba = akt.qatorlar.map((x) => (x.raw_snapshot as { hajmManba?: unknown } | null | undefined)?.hajmManba).find((m): m is F2Manba => m === 'fakt' || m === 'smeta');
    if (saqlanganManba && manbaTanlov == null && saqlanganManba !== manba) { setManbaTanlov(saqlanganManba); return; }
    if (!bolimlar.length) return;
    if (aktdaOrtiqcha && !ortiqchaChegir) return; // chegirma qatorlari bo'limlarda paydo bo'lishini kutamiz
    aktQollandi.current = kalit;
    const { k: nk, yoq } = aktdanKiritma(akt.qatorlar, bolimlar);
    setK(nk); setKorinmaganQator(yoq);
    setRaqam(akt.raqam ?? ''); // A-22
    if (akt.oy) setOy(String(akt.oy).slice(0, 10));
  }, [akt, loading, bolimlar, aktdaOrtiqcha, ortiqchaChegir, manba, manbaTanlov]);

  /** BITTA tekshiruv ro'yxati: xato, dublikat, oshgan hajm, АОСР, uchastka, narxsiz — hammasi bir joyda (qarorlar o'zgarmaydi). */
  const bandlar = useMemo(() => tekshiruvBandlari({ qatorlar, dublikatlar, aosrsizSoni: aosrsiz.length, uchastkalar, korinmagan: aktId != null ? korinmaganQator : 0, raqam, raqamQulf: aktId != null,
    avvalgiVersiya: manba === 'smeta' ? qatorlar.filter((x) => avvalgiF2.has(x.id)).map((x) => x.id) : [] }),
    [qatorlar, dublikatlar, aosrsiz.length, uchastkalar, aktId, korinmaganQator, raqam, manba, avvalgiF2]);
  const sanoq = tekshiruvSanoq(bandlar);
  /** Tekshiruvdan qatorga o'tish: bo'limi tanlanadi, ish ochiladi, qator ko'rinishga suriladi va maydoniga fokus. */
  const [sakrash, setSakrash] = useState<number | null>(null);
  const qatorgaOtish = (id: number) => {
    const q = byId.get(id);
    const ish = q?.ishId ?? id;
    setQidir(''); uf.tozala();
    if (qatorBolim.has(ish)) setBolimId(qatorBolim.get(ish) ?? -1);
    if (q && q.tur !== 'bl' && q.ishId != null) setOchiq((o) => new Set(o).add(q.ishId!));
    // Faqat maqsad qatorigacha chiziladi (avval 5000 element — katta obyektda qotish).
    const bolimK = qatorBolim.has(ish) ? qatorBolim.get(ish) ?? -1 : tanlanganBolim;
    const avlod = bolimK == null ? new Set<number>() : avlodKalitlari(bolimIer, bolimK);
    setKorsatLimit((n) => Math.max(n, f2ElementOrni(bolimlar.filter((b) => avlod.has(b.id ?? -1)), ish) + F2_KORSAT_QADAM));
    setSakrash(id);
  };
  const tekshiruvgaOtish = () => { const el = document.getElementById('f2-tekshiruv'); el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); el?.focus({ preventScroll: true }); };
  const f2Yacheyka = f2Yacheykalar(f2Yuk(qatorlar, raqam));
  const moneyValid = () => {
    if (!reportMoneyValidity(moneyScope.current)) return false;
    // Collapsed/filtered resource editors are unmounted, but their string drafts
    // still exist. Do not let sonOqi's null fallback silently reuse a source price.
    // A-7: qaysi qator ekani aytiladi va bir bosishda o'shanga o'tiladi.
    if (pulXato.length) {
      const id = pulXato[0]; const nom = byId.get(id)?.nom ?? resursNomi(id) ?? `#${id}`;
      toast(t('«{nom}» qatorida narx/summa to‘liq kiritilmagan ({n} ta maydon).', { nom, n: pulXato.length }), 'warn', undefined, 10000, { label: t('Qatorga o‘tish'), onClick: () => qatorgaOtish(id) });
    }
    return pulXato.length === 0;
  };
  /** Bir vaqtda faqat bitta saqlash (A-16): ogohlantirish oynasi kutilayotganda ikkinchi bosish token/aktni ikki marta olmasin. */
  const saqlashQulf = useRef(false);
  /** Akt id → server qaytargan oxirgi versiya (PR #294). */
  const aktVersiya = useRef(new Map<number, number>());
  /** Yuk o'zgarsa yangi operationId (A-17); aynan shu yuk qayta yuborilsa — eski id (tarmoq uzilishidan keyin idempotent). */
  const operatsiyaYukUchun = (kalit: string) => {
    if (yukKalit.current && yukKalit.current !== kalit) operationId.current = yangiOperationId();
    yukKalit.current = kalit;
    return operationId.current;
  };
  /** Bloklovchi sabab bo'lsa — jim qaytish yo'q: birinchi sabab toast bilan (amali bilan). */
  const sababAyt = (): boolean => {
    if (!toSiqlar.length) return false;
    const s = toSiqlar[0];
    toast(toSiqlar.length > 1 ? `${s.matn} (+${toSiqlar.length - 1})` : s.matn, 'warn', undefined, 10000,
      s.amal ? { label: s.amalMatn ?? t('Tuzatish'), onClick: () => sababAmali(s) } : undefined);
    return true;
  };
  /** ?akt=ID rejimi: yangi akt yaratilmaydi - mavjud qoralama qatorlari almashtiriladi (akt id/raqam saqlanadi). */
  const aktniYangila = async () => {
    if (!akt || aktKorish || !joriy?.id) return;
    try {
      await topshirilganPaketOgohi(obyektId, oy); // topshirilgan oylik paket bo'lsa - ogohlantirish (saqlashni to'smaydi)
      /* Сторно (eski F2) bloki hujjat BOSHIDA aynan o'zi bilan qayta yuboriladi, yangi qatorlar ular ostida (qatorlar to'liq almashtiriladi).
         Bloklar mustaqil: bir smeta qatori storno blokida (minus) va yangi blokda (plyus) bir vaqtda bo'la oladi. */
      const yangiQ = f2Yuk(qatorlar, akt.raqam ?? raqam, manba);
      const yuk = stornoBlokniSaqla(aktQatorlar, yangiQ);
      // PR #294: server har saqlashda versiyani oshiradi va qaytaradi — keyingi chaqiruv shu versiya bilan (eski server: akt.versiya).
      const kutilgan = Math.max(aktVersiya.current.get(akt.id) ?? 0, akt.versiya);
      let r = await sbT2F2QoralamaYangila({ kompaniyaId: joriy.id, aktId: akt.id, kutilganVersiya: kutilgan, operationId: yangiOperationId(), qatorlar: yuk.qatorlar });
      // Server hozircha bir hujjatda bir qatorni ikki marta qabul qilmasa — jim tashlanmaydi: foydalanuvchi ongli tanlaydi.
      if (!r.ok && r.code === 'DUPLICATE_F2_SOURCE_LINE' && yuk.ikkalasida > 0) {
        const rozi = await tasdiqSora(t('{n} ta qator ham storno blokida (minus), ham yangi blokda (plyus). Server hozircha bitta hujjatda bir qatorni ikki marta qabul qilmaydi. Bu qatorlarning yangi plyus hajmisiz saqlaymizmi? (Ular keyingi F2 da olinadi.)', { n: String(yuk.ikkalasida) }));
        if (!rozi) return;
        const yuk2 = stornoBlokniSaqla(aktQatorlar, yangiQ, { birXilQatorTashla: true });
        r = await sbT2F2QoralamaYangila({ kompaniyaId: joriy.id, aktId: akt.id, kutilganVersiya: kutilgan, operationId: yangiOperationId(), qatorlar: yuk2.qatorlar });
        if (r.ok) toast(t('{n} ta qatorning yangi plyus hajmi saqlanmadi (server cheklovi) — storno bloki saqlandi.', { n: String(yuk2.tashlandi) }), 'warn');
      }
      if (!r.ok) {
        // STALE_VERSION: kiritmalar JIM ustidan yozilmaydi va jim qayta yuklanmaydi — operator o'zi qayta yuklaydi.
        if (r.code === 'STALE_VERSION') toast(t('Qoralama boshqa oynada o‘zgargan — qayta yuklang.'), 'warn', undefined, 15000, { label: t('Qayta yuklash'), onClick: () => void yuklash() });
        else toast(f2YozishXatoMatni(r, t('F2 qoralama yangilanmadi.')), 'danger');
        return;
      }
      if (typeof r.versiya === 'number') aktVersiya.current.set(akt.id, r.versiya);
      toast(t('F2 qoralama yangilandi (akt #{id}, {n} qator). Tasdiqlash - F2 tarixida.', { id: String(akt.id), n: String(qatorlar.length) }), 'ok', undefined, 12000, { label: 'Ochish', onClick: () => navigate(`/admin/f2-tarix?obyekt=${obyektId}`) });
      await yuklash();
    } catch { toast(t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); }
  };
  const saqlash = async () => {
    // Qulf eng boshida (A-16) — tasdiq oynalari va paket ogohidan OLDIN.
    if (saqlashQulf.current || saving) return;
    if (sababAyt()) return; // sabab bo'lsa jim qaytmaydi
    if (!moneyValid()) return;
    if (!joriy?.id) return;
    saqlashQulf.current = true; setSaving(true);
    try {
      if (aktId != null) { await aktniYangila(); return; }
      const ogoh = dublikatlar.filter((m) => m.daraja === 'ogoh');
      if (ogoh.length && !await tasdiqSora(ogoh.map((m) => m.matn).join('\n\n') + '\n\n' + t('Baribir yozasizmi?'))) return;
      await topshirilganPaketOgohi(obyektId, oy); // topshirilgan oylik paket bo'lsa - ogohlantirish (saqlashni to'smaydi)
      const yuk = f2Yuk(qatorlar, raqam, manba);
      const opId = operatsiyaYukUchun(JSON.stringify([obyektId, oy, raqam.trim(), yuk]));
      // Token (egasi 2026-10-02): F2 qoralama — "f2_qoralama"; server xato bersa token avtomatik qaytadi.
      const tk = await tokenBilan({ kompaniyaId: joriy.id, amal: 'f2_qoralama', birlikSoni: f2Yacheyka, meta: { obyekt: obyektId, qator: qatorlar.length, yacheyka: f2Yacheyka } }, async () => {
        const result = await sbT2AktYaratV2({ obyektId, oy, operationId: opId, qatorlar: yuk, raqam: raqam.trim() || undefined });
        if (!result.ok) throw new Error(f2YozishXatoMatni(result as typeof result & { code?: string }, t('F2 qoralama yaratilmadi.')));
        return result;
      });
      if (!tk.ok) { toast(tk.xabar, 'danger'); return; }
      f2SessiyaTozala(obyektId); // saqlandi — saqlanmagan kiritma qolmadi
      toast(t('F2 qoralama yaratildi ({n} token). Tasdiqlash — F2 tarixida.', { n: tk.sarflandi }), 'ok', undefined, 12000, { label: 'Ochish', onClick: () => navigate(`/admin/f2-tarix?obyekt=${obyektId}`) });
      await yuklash();
    } catch { toast(t('Javob olinmadi. Shu amal IDsi bilan qayta urinishingiz mumkin.'), 'danger'); }
    finally { saqlashQulf.current = false; setSaving(false); }
  };
  /** Sabab amali — bitta bosish bilan tuzatish/qayta urinish. */
  const sababAmali = (s: SaqlashSabab) => {
    if (s.amal === 'qayta_yuklash') void yuklash();
    else if (s.amal === 'qayta_qosh') void qoshimchaYukla();
    else if (s.amal === 'qayta_aktlar') obyektAktlariQayta();
    else if (s.amal === 'qatorga' && s.id != null) qatorgaOtish(s.id);
    else if (s.amal === 'narxsiz') narxsizBelgila();
  };

  const korinish = useHujjatKorinish();
  const excelYuklash = async (korish = false) => {
    if (!moneyValid()) return;
    if (!validId || !(tayyor || eskiBloklar.length > 0)) return;
    const object = obyektlar.find((item) => item.id === obyektId);
    if (!object) { toast('Obyekt topilmadi.', 'danger'); return; }
    // Eski F2 bloklari o'z hujjat podvali bilan yoziladi: podval o'qilmasa jim smeta podvaliga o'tilmaydi.
    if (eskiBloklar.length > 0 && aktPodval.holat !== 'tayyor') { toast(t('Hujjat podvallari o‘qilmadi — Excel tuzilmadi. Qayta urinib ko‘ring.'), 'danger'); return; }
    try {
      // QQS stavkasi bo'sh qolsa ham tizim stavkasi (NDS_SUKUT_FOIZ) olinadi - hujjat QQS siz chiqmaydi.
      const stavkaXom = ndsFoiz.trim() === '' ? NDS_SUKUT_FOIZ : Number(ndsFoiz.replace(',', '.'));
      const stavka = Number.isFinite(stavkaXom) ? stavkaXom : NDS_SUKUT_FOIZ;
      // Kompaniya «Hujjat dizayni» (qator balandligi, shrift, Тип …) — server qiymati hujjatdan oldin qo'llanadi.
      const [nk] = await Promise.all([t2ObyektNakrutka(obyektId).catch(() => null), hujjatDizayniniYukla(joriy?.id)]);
      const podval = await obyektPodvali(joriy?.id, obyektId, nk?.ok ? nk.shartnoma_id : null);
      // Qo'lda kiritilgan imzo (panel) — shartnomadagidan ustun; bo'sh maydon — shartnomadagi qoladi.
      const qolda = Object.fromEntries(Object.entries(tomonlar).filter(([, x]) => typeof x === 'string' && x.trim())) as ImzoNomlar;
      const h = f2Hujjat(bolimlar, qatorlar, {
        obyektNom: object.nom, davr: oy, raqam, imzo: { ...avto.imzo, ...qolda }, shartnoma: avto.shartnoma,
        ndsFoiz: stavka,
        nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval, nkManba: nk?.ok ? nk.nk_manba ?? null : null, rows,
        eskiBloklar: eskiBloklar.length ? eskiBloklarHujjat(eskiBloklar, blokNk) : undefined,
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

  // ── Faktli ish ichidagi resurs: ZAMENA va ISHDAN CHIQARISH (egasi 2026-10-27). Yozuvlar mavjud RPC'lar orqali. ──
  const [resZamena, setResZamena] = useState<AbcRejim | null>(null);
  const [chiqModal, setChiqModal] = useState<ChiqarishQator | null>(null);
  const bugun = new Date().toISOString().slice(0, 10);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const holatById = useMemo(() => new Map(holat.map((h) => [h.qator_id, h])), [holat]);
  const zamenaOch = (r: F2Resurs, ish: F2Ish | null) => {
    const ota = ish ? rowById.get(ish.id) : undefined;
    setResZamena({ tur: 'resurs_zamena', eski: { id: r.id, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, norma: r.norma, hajm: r.smeta ?? null, ishNom: ish ? [ish.kod, ish.nom].filter(Boolean).join(' ') || null : null },
      ishHajm: ota?.hajm != null ? Number(ota.hajm) : null });
  };
  const chiqarishBekor = async (r: F2Resurs) => {
    const faol = baj.filter((b) => b.qator_id === r.id && b.holat === 'faol').sort((a, b) => b.id - a.id)[0];
    if (!faol || !joriy?.id) return;
    if (!await tasdiqSora(t('«{nom}»: ishdan chiqarish bekor qilinsinmi? Resurs yana F2 ga olinadi.', { nom: r.nom }))) return;
    const res = await bajarilmadiBekor({ kompaniyaId: joriy.id, id: faol.id, operationId: yangiOperationId() }).catch(() => null);
    if (!res?.ok) { toast(res ? t(bajarilmadiXato(res)) : t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); return; }
    toast(t('Belgi bekor qilindi.'), 'ok'); await qoshimchaYukla();
  };
  /** Resurs qatori amallari: zamena (mehnatdan tashqari) va ishdan chiqarish; ruxsat yo'q bo'lsa — xira belgi + sababi. */
  function resursAmallari(r: F2Resurs, ish: F2Ish | null) {
    if (aktKorish || r.qoshimcha || r.zamena) return null;
    if (r.chiqarilgan) return <button type="button" onClick={() => void chiqarishBekor(r)} className="fz-chip fz-chip--danger hover:brightness-110" title={t('Resurs ishdan chiqarilgan — F2 ga kirmaydi (bosing - bekor qilish)')} data-testid="chiqarilgan-belgi"><MinusCircle size={11} aria-hidden="true" />{t('ishdan chiqarilgan')}</button>;
    const hol = holatById.get(r.id) as (QatorHolat & { fakt_manbasi?: string | null }) | undefined;
    const ozFakt = r.tur === 'rs' ? (hol?.fakt_manbasi === 'DIRECT' ? Number(hol.fakt_hajm ?? 0) : 0) : Number(hol?.fakt_hajm ?? 0);
    const holatlar = { tur: r.tur, kat: r.kat, nom: r.nom, birlik: r.birlik, ishIchida: ish != null, smeta: r.smeta ?? null, ozFakt, belgilangan: bajHajm.get(r.id) ?? 0 };
    const z = zamenaRuxsat(holatlar); const c = chiqarishRuxsat(holatlar);
    const xira = 'inline-flex cursor-not-allowed items-center rounded p-1 text-text-mute opacity-40';
    const tugma = 'inline-flex items-center rounded p-1 text-text-mute hover:bg-surface-3';
    return <span className="inline-flex items-center gap-0.5">
      {ish && (z.mumkin
        ? <button type="button" tabIndex={-1} onClick={() => zamenaOch(r, ish)} title={t('Resurs zamenasi — shu ish ichida boshqa resurs bilan almashtirish')} aria-label={`Zamena: ${r.nom}`} data-testid="f2-zamena-tugma" className={`${tugma} hover:text-[var(--info)]`}><Repeat2 size={13} /></button>
        : <span className={xira} title={t(z.sabab)} data-testid="f2-zamena-yoq"><Repeat2 size={13} /></span>)}
      {ish && (c.mumkin
        ? <button type="button" tabIndex={-1} onClick={() => setChiqModal({ id: r.id, kod: r.kod, nom: r.nom, birlik: r.birlik, smeta: r.smeta ?? null, ishNom: [ish.kod, ish.nom].filter(Boolean).join(' ') || null })} title={t('Resursni ishdan chiqarish — shu ishda ishlatilmadi, F2 ga kirmaydi')} aria-label={t('Ishdan chiqarish: {nom}', { nom: r.nom })} data-testid="f2-chiqarish-tugma" className={`${tugma} hover:text-danger`}><MinusCircle size={13} /></button>
        : <span className={xira} title={t(c.sabab)} data-testid="f2-chiqarish-yoq"><MinusCircle size={13} /></span>)}
    </span>;
  }
  /** Zamena belgilari: zamena qatori (asl nomi bilan) va asl qatorning shu F2 da zamena yopgan hajmi. */
  function zamenaBelgi(r: F2Resurs) {
    if (r.zamena) { const asl = r.almashtiradi != null ? rowById.get(r.almashtiradi) : undefined;
      return <span className="fz-chip bg-[var(--info-soft)] text-[var(--info)]" data-testid="f2-zamena-belgi">↻ {t('zamena')}{asl ? `: ${t('asl')} ${[asl.kod, asl.nom].filter(Boolean).join(' ')}` : ''}</span>; }
    const y = zamenaNatija.yopildi.get(r.id);
    if (y == null) return null;
    return zamenaNatija.tashlandi.has(r.id)
      ? <span className="fz-chip" data-testid="f2-zamena-yopdi" title={t('Shu F2 dagi zamena asl hajmni to‘liq qopladi — asl F2 ga kirmaydi')}>{t('zamena qopladi — F2 ga kirmaydi')}</span>
      : <span className="fz-chip" data-testid="f2-zamena-yopdi" title={t('Shu F2 dagi zamena qoplagan hajm (asl birlikda) ayirildi')}>{t('zamena yopdi')}: −<FmtN val={y} /></span>;
  }

  /** «F2 faktdan ko'p — chegirma» belgisi (ixtiyoriy chegirish yoqilganda; operator qatorni odatdagidek tahrirlaydi/olib tashlaydi). */
  function ortiqchaChip(faktNol: boolean) {
    return <span className="fz-chip fz-chip--warn" data-testid="ortiqcha-f2-belgi" title={t('Tasdiqlangan F2 fakt hajmidan ko‘p — ortiqchasi minus qator bilan chegiriladi')}>
      {faktNol ? t('F2 faktdan ko‘p — chegirma (fakt 0)') : t('F2 faktdan ko‘p — chegirma')}</span>;
  }

  function resursQatori(r: F2Resurs, ish: F2Ish | null = null) {
    const x = byId.get(r.id);
    const taklif = r.taklifNarx != null ? sonMatn(y6(r.taklifNarx)) : '';
    const kat = r.tur === 'rs' ? r.kat : r.kat || (r.tur === 'ob' ? 'ОБ' : 'МАТ');
    const katBelgi = kat ? <KatNishon kat={kat} /> : <span className="fz-kat">{'rs'}</span>;
    const amal = resursAmallari(r, ish);
    const zb2 = zamenaBelgi(r);
    const orqBelgi = r.ortiqchaF2 && !r.avto ? ortiqchaChip(!!r.faktNol) : null;
    /* Smeta narxida (pereraschet): eski F2 narxi ↔ yangi narx; smeta narxi NULL — belgi + zaxirani ongli qo'llash (avtomatik emas). */
    const eskiNarxBor = smetaNarxda && r.eskiNarx != null;
    const smetaNarxYoq = smetaNarxda && r.zaxiraNarx !== undefined;
    const zaxiraBor = smetaNarxYoq && r.zaxiraNarx != null && !k.narxsiz[r.id];
    return (
      <tr key={r.id} data-qator={r.id} className={`border-t border-border align-top ${r.chiqarilgan ? 'opacity-60' : ''} ${r.zamena ? 'border-l-2 border-l-[var(--info)]' : ''}`}>
        <td className="py-1.5 pl-9 pr-2">
          <div className="flex items-center gap-1.5">{katBelgi}<span className={`truncate text-text ${r.chiqarilgan ? 'line-through' : ''}`}>{r.nom}</span></div>
          {r.norma != null && r.avto && <div className="pl-1 text-[11px] text-text-mute">{t('norma')} {r.norma}</div>}
          {(amal || zb2 || orqBelgi) && <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-1">{orqBelgi}{zb2}{amal}</div>}
        </td>
        <td className="px-2 py-1.5 text-right text-text-mute">{r.birlik}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {r.avto ? (x ? <FmtN val={x.hajm} /> : <span className="text-text-mute">—</span>)
            : <input aria-label={`F2 hajmi: ${r.nom}`} inputMode="decimal" disabled={r.chiqarilgan} value={k.hajm[r.id] ?? ''} onChange={(e) => yoz('hajm', r.id, e.target.value)} placeholder={sonMatn(r.mumkin)} className={`${kirit} w-24 ${OSH_OGOH.has(x?.ogoh) ? '!border-warn bg-warn/10' : ''}`} />}
          <div className="text-[11px] text-text-mute">{t('mumkin')} <FmtN val={r.mumkin} /></div>
        </td>
        <td className="px-2 py-1.5 text-right">
          <MoneyInput aria-label={`F2 narxi: ${r.nom}`} inputMode="decimal" disabled={k.narxsiz[r.id] === true || !!r.chiqarilgan} value={k.narx[r.id] ?? ''} onValueChange={(moneyValue) => yoz('narx', r.id, moneyValue)} placeholder={taklif || t('narx')} className={`${kirit} w-28 disabled:opacity-40`} />
          {x && <div className="mt-1 flex items-center justify-end gap-1"><NarxManbaChip manba={x.manba} protokol={x.protokol} />{x.protokol && <span className="text-[11px] text-text-mute">{x.protokol}</span>}</div>}
          {eskiNarxBor && <div className="text-[11px] text-text-mute" data-testid="eski-f2-narx">{t('oldingi F2 narxi')} <FmtN val={r.eskiNarx ?? 0} /></div>}
          {smetaNarxYoq && <div className="mt-0.5 flex flex-wrap items-center justify-end gap-1" data-testid="smeta-narx-yoq">
            <span className="fz-chip fz-chip--warn">{t('smeta narxi yo‘q')}</span>
            {zaxiraBor && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => yoz('narx', r.id, sonMatn(r.zaxiraNarx ?? 0))}>{t('oldingi F2 narxini qo‘llash')}</button>}
          </div>}
        </td>
        <td className="px-2 py-1.5 text-right">
          <MoneyInput aria-label={`F2 summasi: ${r.nom}`} inputMode="decimal" disabled={k.narxsiz[r.id] === true || !!r.chiqarilgan} value={k.summa[r.id] ?? ''} onValueChange={(moneyValue) => yoz('summa', r.id, moneyValue)} placeholder={x?.summa != null ? x.summa.toFixed(2) : ''} className={`${kirit} w-32 disabled:opacity-40`} />
        </td>
        <td className="w-28 px-2 py-1.5">
          <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-text-dim"><input type="checkbox" aria-label={`Narxsiz: ${r.nom}`} checked={k.narxsiz[r.id] === true} onChange={(e) => yoz('narxsiz', r.id, e.target.checked || undefined)} />{t('narxsiz')}</label>
          {x?.xato && <div className="text-[11px] text-danger">{t(XATO_MATN[x.xato])}</div>}
          {x?.avtoNarxsiz && <div className="text-[11px] text-warn" data-testid="avto-narxsiz">{t(AVTO_NARXSIZ_MATN)}</div>}
          {x?.ogoh && <div className="text-[11px] text-warn">{OSH_OGOH.has(x.ogoh) ? t(OGOH_MATN[x.ogoh]) : OGOH_MATN[x.ogoh]}</div>}
        </td>
      </tr>
    );
  }

  /** ТН·КМ qatori yonida taklif (blok emas): A = shu F2 dagi tonnali mos material Σ tonna × km; B = F2/smeta ulushi × smeta т·км. */
  function tkmTaklifQator(ish: F2Ish) {
    const taklif = tkmTakliflar.get(ish.id) ?? null;
    if (!taklif) return null;
    return <div className="flex flex-wrap items-center gap-2 px-10 pb-2 text-[12px] text-text-dim" aria-label={t('ТН·КМ taklifi')}>
      <span>{t('Taklif')}:</span>
      {([['A', taklif.a], ['B', taklif.b]] as const).map(([nom, v]) => v && <button key={nom} type="button" title={v.izoh} onClick={() => yoz('hajm', ish.id, sonMatn(v.qiymat))}
        className="fz-btn fz-btn--sm">{nom}: <FmtN val={v.qiymat} /></button>)}
      <span className="text-text-mute">{[taklif.a?.izoh, taklif.b?.izoh].filter(Boolean).join(' · ')}</span>
    </div>;
  }

  function ishKartasi(i: F2Ish) {
    const x = byId.get(i.id);
    const ochilgan = ochiq.has(i.id) || !!qidir.trim();
    // Resurs summasi noma'lum bo'lsa 0 emas: ma'lumlar yig'indisi + noma'lumlar soni.
    const resMalum = i.resurslar.map((r) => byId.get(r.id)?.summa).filter((s): s is number => s != null);
    const resSumma = resMalum.length ? resMalum.reduce((s, v) => s + v, 0) : null;
    const resNomalum = i.resurslar.length - resMalum.length;
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
              {i.ortiqchaF2 && ortiqchaChip(!!i.faktNol)}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input aria-label={`F2 hajmi: ${i.nom}`} data-ish-hajm inputMode="decimal" value={k.hajm[i.id] ?? ''} onChange={(e) => yoz('hajm', i.id, e.target.value)} onKeyDown={(e) => hajmKlaviatura(e, i.id)} placeholder={t('hajm')} className={`${kirit} w-24 ${OSH_OGOH.has(x?.ogoh) ? '!border-warn bg-warn/10' : ''}`} />
            <span className="w-10 text-[12px] text-text-mute">{i.birlik}</span>
            {(k.hajm[i.id] ?? '') !== '' && <button type="button" tabIndex={-1} aria-label={`: ${i.nom}`} title={t('Qatorni F2 dan olib tashlash (kiritmalar tozalanadi)')} onClick={() => setK((o) => f2QatorniOlibTashla(o, i.id))} className="fz-btn fz-btn--ghost fz-btn--sm">✕</button>}
            {i.mumkin !== 0 && [25, 50, 100].map((f) => <button key={f} type="button" tabIndex={-1} onClick={() => yoz('hajm', i.id, ulushHajm(i.mumkin, f))} className="fz-btn fz-btn--ghost fz-btn--sm">{f}%</button>)}
          </div>
          <span className="w-32 self-center text-right text-[13px] font-semibold tabular-nums text-text">{resSumma != null ? <FmtN val={resSumma} /> : ''}{resNomalum > 0 && resSumma !== null ? <span className="ml-1 text-[10px] font-normal text-warn" title={t('Summasi noma‘lum resurslar jamiga kirmagan')}>+{resNomalum}?</span> : null}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pb-2.5 pl-10 text-[12px] text-text-dim">
          <span className="w-56 max-w-full"><IshMeter m={meter} birlik={i.birlik} /></span>
          {meter.oshish != null && <span className="fz-chip fz-chip--warn">{t('smetadan {p}% oshdi', { p: meter.oshish })}</span>}
          <span>{chegaraNom} <b className="text-text"><FmtN val={i.mumkin} /></b></span>
          {i.smeta != null && <span>{t('smeta')} <FmtN val={i.smeta} /></span>}
          {i.storno != null
            ? <span data-testid="ish-storno-olingan">{t('tasdiqlangan F2')} <FmtN val={i.olingan} /> ({t('storno qilingan')}: <FmtN val={i.storno} />)</span>
            : i.olingan > 0 && <span>{t('tasdiqlangan F2')} <FmtN val={i.olingan} /></span>}
          {(() => {
            const av = avvalgiF2.get(i.id); const resSoni = i.resurslar.filter((r) => avvalgiF2.has(r.id)).length;
            if (!av && resSoni === 0) return null;
            return <span className="fz-chip bg-[var(--info-soft)] text-[var(--info)]" data-testid="ish-avvalgi-f2"
              title={t('Tasdiqlangan F2 avvalgi smeta versiyasining qatorida: obyekt jamisida bir marta sanaladi; bu yerdagi «mumkin» hajmiga ta’sir qilmaydi.')}>
              {t('avvalgi versiya F2')}{av ? <>: <FmtN val={av.hajm ?? 0} /> {i.birlik ?? ''}</> : null}
              {resSoni > 0 ? ` · ${t('{n} ta resursda', { n: String(resSoni) })}` : ''}</span>;
          })()}
          {(i.qoralama ?? 0) > 0 && <span className="text-warn">{t('qoralamada')} <b><FmtN val={i.qoralama ?? 0} /></b></span>}
          {(bn.summa > 0 || bn.narxsiz > 0) && <span className="inline-flex items-center gap-1">{t('narx (1 birlik, NDS siz)')} {birlikNarx}{birlikNarxsiz}</span>}
          <span className="text-text-mute">{t('{n} ta resurs', { n: i.resurslar.length })}</span>
        </div>
        {x?.xato && <div className="px-10 pb-1.5 text-[12px] text-danger">{XATO_MATN[x.xato]}</div>}
        {x?.ogoh && <div className="px-10 pb-1.5 text-[12px] text-warn">{OSH_OGOH.has(x.ogoh) ? t(OGOH_MATN[x.ogoh]) : OGOH_MATN[x.ogoh]}</div>}
        {tkmBirlikmi(i.birlik) && tkmTaklifQator(i)}
        {ochilgan && i.resurslar.length > 0 && <ResursJadval resurslar={i.resurslar} ustunlar={resursUstunlar} qator={(r) => resursQatori(r, i)} />}
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
  }, [sakrash, korinadiF, ochiq]);

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
          <button type="button" title={tg.yol.join(' › ')} aria-current={tanl ? 'true' : undefined} onClick={() => { setBolimId(kalit); setQidir(''); setKorsatLimit(F2_KORSAT_BOSH); }}
            className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-md border py-1.5 pl-1.5 pr-2 text-left text-[12.5px] ${tanl ? 'border-accent/40 bg-accent/10 text-text' : tg.mumkin > 0 ? 'border-transparent text-text-dim hover:bg-surface-2' : 'border-transparent text-text-mute hover:bg-surface-2'}`}>
            <span className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 break-words">{tg.nom}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-text-mute" title={t('fakt bor / jami')}>{tg.mumkin}/{tg.jami}</span></span>
            {tg.summa > 0 && <SummaJuft obyektId={obyektId} kompaniyaId={joriy?.id} ustamasiz={tg.summa} katKesim={tg.katKesim} kichik />}
          </button></li>); })}
    </ul>
  </aside>;

  const obyektNom = obyektlar.find((o) => o.id === obyektId)?.nom ?? '';
  const olishMatn = royxatRejimi || uf.soni > 0 ? t('Topilganlarni to‘liq olish') : t('Bo‘limni to‘liq olish');
  const royxatSarlavha = royxatRejimi
    ? `${faqatKiritilgan && !qidirKech.trim() ? t('Kiritilganlar') : t('Qidiruv')}: ${korinadiF.reduce((s, b) => s + b.ishlar.length + b.alohida.length, 0)} ta`
    : null;
  const uchastkaYol = tanlanganTugun && tanlanganTugun.ildizNom !== tanlanganTugun.nom ? <span className="mr-1 font-normal text-text-mute" data-testid="tanlangan-uchastka">{t('Uchastka/fayl')}: {tanlanganTugun.ildizNom} ›</span> : null;
  const bandAmali = (b: TekshiruvBand) => {
    if (b.kod === 'avto_narxsiz' && narxsizlar.length > 0) return <button type="button" onClick={narxsizBelgila} className="fz-btn fz-btn--sm" style={{ height: 'auto', minHeight: 28, whiteSpace: 'normal', padding: '4px 8px', textAlign: 'left' }}>{t('Narxi yo‘q {n} ta resursni «narxsiz» belgilash', { n: narxsizlar.length })}</button>;
    if (b.kod === 'aosr') return <Link to="/admin/aosr" className="fz-btn fz-btn--sm">{t('АОСР yaratish')}</Link>;
    return null;
  };
  /** Chegirish tugmasi: fakt rejimida, ortiqcha F2 li qator bor bo'lsa (yoki allaqachon yoqilgan). */
  const ortiqchaKorinadi = validId && !loading && manba === 'fakt' && ortiqchaX != null && (ortiqchaX.soni > 0 || ortiqchaChegir);
  const ortiqchaNomalum = (ortiqchaX?.nomalum ?? 0) > 0;
  const ortiqchaFaktNol = (ortiqchaX?.faktNol ?? 0) > 0;
  const smetaSolishtirildi = (smetaX?.solishtirildi ?? 0) > 0;
  const smetaNarxsizBor = (smetaX?.smetaNarxsiz ?? 0) > 0;
  const saqlaMatn = aktId != null
    ? (saving ? t('Yangilanmoqda…') : `${t('F2 qoralamani yangilash')} (${qatorlar.length})`)
    : saving ? t('Yaratilmoqda…') : `${t('F2 qoralama yaratish')} (${qatorlar.length})`;
  // «toza» faqat sabablar bo'sh bo'lganda (tizimli tuzatish): yuklash/akt/zamena kutilayotgan bo'lsa ham «toza» demaydi.
  const holatChip = toSiqlar.length > 0
    ? { cls: 'fz-chip--danger', matn: t('Saqlash yopiq: {n} ta sabab', { n: toSiqlar.length }) }
    : sanoq.bad > 0
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
      {validId && <ObyektQadamlari joriy="f2-yasash" obyektId={obyektId} />}
      {validId && <TayyorlanganF2lar kompaniyaId={joriy?.id} obyektId={obyektId} />}
      <section className="fz-card flex flex-wrap items-end gap-3 p-3" aria-label={t('F2 parametrlari')}>
        <label className="min-w-[240px] flex-1 text-[12px] font-medium text-text-dim">{t('Obyekt')}
          <select aria-label={t('Obyekt')} value={validId ? obyektId : ''} onChange={(event) => { const object = obyektlar.find((item) => item.id === Number(event.target.value)); if (workspace.isProvider) workspace.setObjectId(object?.id ?? null); else setParams(object ? { obyekt: String(object.id) } : {}); }} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text">
            <option value="">{t('-- obyektni tanlang --')}</option>{validId && !obyektlar.some((item) => item.id === obyektId) && <option value={obyektId}>{t('Obyekt')} {'#'}{obyektId}</option>}<ObyektOptionlari obyektlar={obyektlar} />
          </select>
        </label>
        <label className="text-[12px] font-medium text-text-dim">{t('Davr')}<input aria-label="F2 davri" type="month" disabled={aktId != null} title={aktId != null ? t('Qoralama davri tahrirda o‘zgarmaydi') : undefined} value={oy.slice(0, 7)} onChange={(event) => setOy(`${event.target.value}-01`)} className="mt-1.5 block rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
        <div className="text-[12px] font-medium text-text-dim">
          <label>{t('F2 raqami')}<input aria-label="F2 raqami" value={raqam} disabled={aktId != null} onChange={(e) => setRaqam(e.target.value)} placeholder={raqamTaklif ? t('masalan {r}', { r: raqamTaklif }) : t('masalan 7')} className="mt-1.5 block w-28 rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
          {raqamTaklif && !raqam.trim() && aktId == null && <button type="button" onClick={() => setRaqam(raqamTaklif)} className="fz-btn fz-btn--ghost fz-btn--sm mt-1" title={t('Shu obyektdagi eng katta F2 raqamidan keyingisi')}><Sparkles aria-hidden="true" />{t('Keyingi: № {r}', { r: raqamTaklif })}</button>}
        </div>
        {validId && !loading && holat.length > 0 && <div role="group" aria-label={t('Hajm manbai')} className="text-[12px] font-medium text-text-dim">{t('Hajm manbai')}
          <div className="mt-1.5 flex overflow-hidden rounded-lg border border-border">{(['fakt', 'smeta'] as const).map((m) => <button key={m} type="button" aria-pressed={manba === m} disabled={aktId != null} title={aktId != null ? t('Qoralama tahririda hajm manbai o‘zgarmaydi') : undefined} onClick={() => void manbaAlmashtir(m)}
            className={`px-3 py-2 ${manba === m ? 'bg-accent/15 font-semibold text-text' : 'bg-surface-2 text-text-dim hover:text-text'}`}>{m === 'fakt' ? t('Fakt') : t('Smeta qoldig‘i')}</button>)}</div></div>}
        {ortiqchaKorinadi && ortiqchaX && <div className="max-w-[22rem] text-[12px] font-medium text-text-dim" data-testid="ortiqcha-chegir">
          <label className="flex items-start gap-1.5"><input type="checkbox" className="mt-0.5" checked={ortiqchaChegir} disabled={aktKorish} onChange={(e) => ortiqchaAlmashtir(e.target.checked)} />{t('Fakt F2 dan kam qatorlarni minus bilan chegirish')}</label>
          <div className="mt-1 text-[11.5px] font-normal text-warn" data-testid="ortiqcha-xulosa">
            {t('{n} ta qatorda F2 faktdan ko‘p — jami ≈', { n: ortiqchaX.soni })} <FmtN val={ortiqchaX.summa} /> {t('so‘m ustamasiz')}
            {ortiqchaNomalum && <> · {t('{n} qatorda narx noma‘lum — summaga kirmagan', { n: ortiqchaX.nomalum })}</>}
            {ortiqchaFaktNol && <> · {t('{n} qatorda fakt 0 — F2 to‘liq chegiriladi', { n: ortiqchaX.faktNol })}</>}
          </div>
          <div className="mt-0.5 text-[11px] font-normal text-text-mute">{t('F2 faktdan oldinda bo‘lishi normal (avans) — faqat ongli ravishda yoqing.')}</div>
        </div>}
        {validId && !loading && pereraschetQoralama && <div className="max-w-[26rem] text-[12px] font-medium text-text-dim" data-testid="smeta-narxda">
          <label className="flex items-start gap-1.5"><input type="checkbox" className="mt-0.5" checked={smetaNarxda} disabled={aktKorish} onChange={(e) => setSmetaNarxTanlov(e.target.checked)} />{t('Yangi qatorlar smeta narxida')}</label>
          <div className="mt-0.5 text-[11px] font-normal text-text-mute">{t('Storno qatorlari eski F2 narxida qoladi; yangi hajmlar smeta narxida taklif qilinadi.')}</div>
          {smetaX && <div className="mt-1 text-[11.5px] font-normal" data-testid="smeta-narx-xulosa">
            <div>{t('Storno (eski narxda)')}: <FmtN val={smetaX.storno} /> · {t('Yangi (smeta narxida)')}: <FmtN val={smetaX.yangi} /></div>
            <div><b>{t('Farq')}: <FmtN val={smetaX.farq} /></b> {t('so‘m ustamasiz')}</div>
            {smetaSolishtirildi && <div className="text-text-mute">{t('Narx farqi ({n} qator, eski narxga nisbatan)', { n: smetaX.solishtirildi })}: <FmtN val={smetaX.narxFarqi} /></div>}
            {smetaNarxsizBor && <div className="text-warn">{t('{n} qatorda smeta narxi yo‘q — summaga kirmagan; narx kiriting, oldingi F2 narxini qo‘llang yoki «narxsiz» belgilang', { n: smetaX.smetaNarxsiz })}</div>}
          </div>}
        </div>}
        {validId && bolimlar.length > 0 && <label className="relative min-w-[200px] flex-1 text-[12px] font-medium text-text-dim">{t('Qidirish')}
          <Search size={14} className="pointer-events-none absolute bottom-2.5 left-2.5 text-text-mute" />
          <input aria-label="Qidirish" value={qidir} onChange={(e) => setQidir(e.target.value)} placeholder={t('ish, resurs, kod…')} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-text" /></label>}
        {validId && bolimlar.length > 0 && <label className="flex items-center gap-1.5 pb-2.5 text-[12px] text-text-dim"><input type="checkbox" checked={faqatKiritilgan} onChange={(e) => setFaqatKiritilgan(e.target.checked)} />{t('Faqat kiritilganlar')}</label>}
        {validId && mayPrepare && <button type="button" data-testid="storno-tanlov-tugma" className="fz-btn" title={t('Eski F2 qatorlaridan minus (storno) qoralama yaratadi; asl F2 o‘zgarmaydi')} onClick={() => void stornoTanlovOch()} disabled={saving}><RotateCcw aria-hidden="true" />{t('Eski F2 ni storno qilish (pereraschet)')}</button>}
      </section>
      {validId && stornoTanlovOchiq && <F2StornoTanlov obyektId={obyektId} faktRejimSukut="ozgartirma" qoralamaga={akt && !aktKorish ? { aktId: akt.id, onQosh: stornoQoralamagaQosh } : undefined} onYop={() => setStornoTanlovOchiq(false)} onYaratildi={(yangiId) => {
        setStornoTanlovOchiq(false);
        toast(t('Storno qoralamasi yaratildi. Yangi smeta qatorlarini pastda qo‘shib, saqlang.'), 'ok');
        navigate(`/admin/f2-tayyorlash?obyekt=${obyektId}&akt=${yangiId}`);
      }} />}
      {validId && aktId != null && <section role="status" aria-label={t('F2 qoralamani tahrirlash')} className={`fz-note ${aktXato || aktKorish ? 'fz-note--warn' : 'fz-note--info'} flex-wrap`} style={{ alignItems: 'center' }}>
        {tahrirHolati}
        <Link className="ml-auto text-accent underline" to={`/admin/f2-tayyorlash?obyekt=${obyektId}&yangi=1`}>{t('Yangi F2 tayyorlash')}</Link>
      </section>}
      {validId && davomOchildi && <section role="status" data-testid="davom-qoralama" className="fz-note fz-note--info flex-wrap" style={{ alignItems: 'center' }}>
        <span className="flex-1">{t('Bu oy uchun F2 qoralama bor — u ochildi, yangi akt yaratilmadi. Qatorlarni shu yerda davom ettiring.')}</span>
        <Link data-testid="yangi-alohida-f2" className="fz-btn fz-btn--sm" to={`/admin/f2-tayyorlash?obyekt=${obyektId}&yangi=1`}>{t('Yangi alohida F2 boshlash')}</Link>
      </section>}
      {validId && pereraschetSarlavha && <section role="status" data-testid="pereraschet-sarlavha" className="fz-note fz-note--info"><b>{pereraschetSarlavha}</b></section>}
      {validId && aktId != null && stornoBlok.soni > 0 && <section aria-label={t('Сторно (eski F2)')} data-testid="storno-blok" className="fz-note fz-note--info flex-wrap" style={{ alignItems: 'center' }}>
        <b>{t('Сторно (eski F2)')}</b>
        <span>{t('{n} qator, Σ (minus):', { n: String(stornoBlok.soni) })} <FmtN val={stornoBlok.jami} /> — {t('hujjat boshida saqlanadi; yangi pozitsiyalar shu blok ostiga qo‘shiladi.')}</span>
        {stornoManbaAktlar.length > 0 && <span data-testid="storno-manba">{t('Storno qilinayotgan F2: №{r}', { r: stornoManbaAktlar.map((a) => a.raqam || String(a.id)).join(', №') })}</span>}
        {stornoNomalum > 0 && <span className="text-warn">{t('{n} qatorda summa noma‘lum', { n: String(stornoNomalum) })}</span>}
        {stornoOzgardi && <span data-testid="storno-blok-saqlanmagan" className="text-warn">{t('Storno bloki o‘zgardi — «Saqlash» bilan yozing.')}</span>}
        {akt && !aktKorish && !stornoTahrirOchiq && <button type="button" data-testid="storno-blok-tahrirla" className="fz-btn fz-btn--sm" onClick={() => setStornoTahrirOchiq(true)}>{t('Storno blokini ko‘rish va tahrirlash')}</button>}
        {stornoOzgardi && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => { setStornoTahrir(null); setStornoTahrirOchiq(false); }}>{t('Storno o‘zgarishlarini bekor qilish')}</button>}
      </section>}
      {validId && akt && !aktKorish && stornoTahrirOchiq && stornoBlok.soni > 0 && (
        <F2StornoBlokTahrir obyektId={obyektId} saqlangan={aktQatorlar.filter(stornoQatorimi)} asl={aslStorno} aktRaqami={stornoAktRaqami}
          onBekor={() => setStornoTahrirOchiq(false)} onOzgar={(q) => { setStornoTahrir(q); setStornoTahrirOchiq(false); }} />
      )}
      {validId && aktId != null && eskiBloklar.length > 0 && aktPodval.holat === 'xato' && <section role="alert" className="fz-note fz-note--warn" style={{ alignItems: 'center' }}><AlertTriangle /><span className="flex-1">{t('Hujjat podvallari o‘qilmadi — pereraschet jami va Excel hisoblanmaydi.')}</span><button type="button" onClick={aktPodval.qayta} className="fz-btn fz-btn--sm">{t('Qayta urinib ko‘rish')}</button></section>}
      {validId && aktId != null && pereraschetBaho && <PereraschetPanel baho={pereraschetBaho} />}
      {!validId && <section className="fz-card p-4 text-text-dim">{t('Avval obyektni tanlang.')}</section>}
      {error && validId && <section role="alert" className="fz-note fz-note--danger" style={{ alignItems: 'center' }}><AlertTriangle /><span className="flex-1">{t(error)}</span><button type="button" onClick={() => void yuklash()} className="fz-btn fz-btn--danger fz-btn--sm">{t('Qayta urinib ko‘rish')}</button></section>}
      {loading && <div className="skel min-h-[260px] flex-1 rounded-xl" />}
      {validId && !loading && !error && bolimlar.length === 0 && <section className="fz-card p-8 text-center text-text-dim">{t('F2 ga olish mumkin bo‘lgan fakt qoldig‘i yo‘q — avval Fakt jurnalida bajarilgan ishni kiriting.')}</section>}
      {validId && !loading && !error && bolimlar.length > 0 && <>
        <F2QoralamaSarlavha raqam={aktId != null ? (akt?.raqam ?? raqam) : raqam} muhr={aktKorish ? 'locked' : aktId != null ? 'edit' : 'draft'} davr={davrNomi(oy, tilLocale())} obyekt={obyektNom} manba={manba}
          shartnoma={avto.shartnoma} ishSoni={jami.ish} qatorSoni={jami.qator}
          jami={<SummaJuft obyektId={obyektId} kompaniyaId={joriy?.id} ustamasiz={qatorlar.length ? jami.summa : null} katKesim={katKesim} className="items-end text-right [&_[data-testid=summa-ustamali]]:text-[20px] [&_[data-testid=summa-ustamali]]:font-semibold" />} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[clamp(12rem,16vw,16rem)_minmax(0,1fr)] xl:h-[max(30rem,calc(100dvh-8rem))] xl:grid-cols-[clamp(12rem,15vw,16rem)_minmax(0,1fr)_clamp(15rem,19vw,20rem)]">
          {bolimPaneli}
          <section className="karta flex max-h-[78vh] min-h-0 flex-col overflow-hidden xl:max-h-none" aria-label={t('F2 ishlari')}>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold text-text">{royxatSarlavha ?? (tanlanganTugun ? <>{uchastkaYol}{tanlanganTugun.nom}</> : korinadi[0]?.nom)}</span>
                <MeterIzohi />
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => bolimniOl(korinadiF)} className="fz-btn fz-btn--sm"><Zap aria-hidden="true" />{olishMatn}</button>
                <button type="button" onClick={() => bolimniOl(bolimlar)} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Barcha mumkin hajmni olish')}</button>
                {Object.keys(k.hajm).length > 0 && <button type="button" onClick={() => setK(bosKiritma())} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Tozalash')}</button>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border px-3 py-1 text-[11px] text-text-mute" role="group" aria-label={t('Ustun filtrlari')}>
              <span className="font-semibold">{t('Ustun filtrlari')}:</span>
              {elementUstunlar.map((u) => <span key={u.kalit} className="inline-flex items-center whitespace-nowrap">{u.nom}<UstunFiltrTugma {...uf.tugma(u.kalit)} /></span>)}
            </div>
            {uf.soni > 0 && <div className="flex flex-col gap-1 border-b border-border px-3 py-1.5">
              <FiltrHolatQatori soni={uf.soni} natija={uf.natija.length} jami={elementlar.length} tozala={uf.tozala} />
              <span className="text-[11px] text-text-mute">{t('Pastdagi «Jami» — butun F2 qoralama bo‘yicha (filtrga bog‘liq emas); «Topilganlarni to‘liq olish» faqat ko‘rinadiganlarga qo‘llanadi.')}</span>
            </div>}
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              <IshMaterialOgohRoyxat natijalar={moslikOgoh} onTuzat={(n) => { if (n.ishId == null) return; yoz('hajm', n.ishId, sonMatn(n.taklif)); toast(t('Ish hajmi {v} qilib qo‘yildi — tekshirib saqlang.', { v: sonMatn(n.taklif) }), 'ok'); }} />
              {uf.soni > 0 && korinadiF.length === 0 && <div className="p-3 text-[12.5px] text-text-mute">{t('Filtr bo‘yicha qator topilmadi.')}</div>}
              {korinadiQism.bolimlar.map((b) => <div key={b.id ?? 'yoq'} className="space-y-2" data-testid="f2-bolim-blok">
                {royxatRejimi && <div className="fz-panel__h pt-1">{b.nom}</div>}
                {b.ishlar.map(ishKartasi)}
                {b.alohida.length > 0 && <div className="rounded-lg border border-border"><div className="px-3 py-1.5 text-[12px] font-semibold text-text-dim">{t('Alohida materiallar')}</div><table className="w-full text-[12.5px]"><tbody>{b.alohida.map((r) => resursQatori(r))}</tbody></table></div>}
              </div>)}
              {korinadiQism.qolgan > 0 && <button ref={yanaRef} type="button" data-testid="f2-yana" onClick={() => setKorsatLimit((n) => n + F2_KORSAT_QADAM)} className="fz-btn w-full">{t('Yana ko‘rsatish')}</button>}
            </div>
          </section>
          <div className="order-first grid min-h-0 content-start gap-3 lg:col-span-2 lg:grid-cols-2 xl:order-none xl:col-span-1 xl:grid-cols-1 xl:overflow-auto">
            <F2TekshiruvPanel sabablar={sabablar} onSababAmal={sababAmali} bandlar={bandlar} onOtish={qatorgaOtish} amal={bandAmali} obyektId={obyektId} yangilaHref={(id) => `/admin/f2-tayyorlash?obyekt=${obyektId}&akt=${id}`} />
            <F2KatPanel kat={katTaq} manba={jami.manba} />
          </div>
        </div>
        <section className="flex flex-wrap items-start gap-3"><div className="min-w-[280px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} tafsilot={imzoTafsilot} />
          <p className="mt-1 text-[12px] text-text-mute">{imzoMatn}</p></div>
          <label className="text-[12px] text-text-dim">{t('QQS (НДС), % — hujjat oxirida')}<input aria-label="QQS stavkasi" value={ndsFoiz} onChange={(event) => setNdsFoiz(event.target.value)} placeholder={t('bo‘sh — QQS yo‘q')} inputMode="decimal" className="ml-2 w-32 rounded border border-border bg-bg px-2 py-1" /></label></section>
        {vedomostOchiq && <section aria-label={t('Resurs vedomosti')} className="karta max-h-[40vh] overflow-auto"><F2ResursVedomosti qatorlar={qatorlar} kodOl={resursKodi} obyektId={obyektId} kompaniyaId={joriy?.id} onQollash={narxniQollash} /></section>}
        <section aria-label="F2 jami" className="fz-card sticky bottom-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5" style={{ boxShadow: 'var(--shadow-pop)', overflow: 'visible' }}>
          <div className="flex flex-col text-[12px] leading-tight text-text-dim">
            <span>{t('Tanlangan qatorlar')}: <b className="text-text">{jami.qator}</b></span>
            <span className="text-text-mute">{t('{n} ta ish', { n: jami.ish })}</span>
            {jami.ogoh > 0 && <span className="text-warn">{t('Ogohlantirishlar')}: {jami.ogoh}</span>}
            {jami.narxsiz > 0 && <span className="text-warn">{t('Narx asosi yo‘q')}: {jami.narxsiz}</span>}
          </div>
          <button type="button" onClick={tekshiruvgaOtish} className={`fz-chip ${holatChip.cls} cursor-pointer`} style={{ height: 24, border: 0 }} title={t('Tekshiruv')}>{holatChip.matn}</button>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex flex-col items-end"><small className="text-[11px] font-semibold uppercase tracking-wide text-text-mute">{t('Jami')}</small>
              <SummaJuft obyektId={obyektId} kompaniyaId={joriy?.id} ustamasiz={qatorlar.length ? jami.summa : null} katKesim={katKesim} className="items-end text-right" /></div>
            <div role="group" aria-label={t('Qo‘shimcha amallar')} className="flex items-center gap-1 border-l border-border pl-3">
              <button type="button" aria-pressed={vedomostOchiq} disabled={qatorlar.length === 0} onClick={() => setVedomostOchiq((o) => !o)} className={`fz-btn fz-btn--sm ${vedomostOchiq ? '' : 'fz-btn--ghost'}`}>{t('Resurs vedomosti')}</button>
              <Link to={`/admin/f2-tarix?obyekt=${obyektId}`} className="fz-btn fz-btn--ghost fz-btn--sm">{t('F2 tarixi')}</Link>
              <button type="button" onClick={() => void excelYuklash(false)} disabled={!(tayyor || eskiBloklar.length > 0) || saving} className="fz-btn fz-btn--ghost fz-btn--sm"><Download aria-hidden="true" />{t('Excel')}</button>
              <button type="button" onClick={() => void excelYuklash(true)} disabled={!(tayyor || eskiBloklar.length > 0) || saving} aria-label="Forma-2 qoralama ko‘rish" title={t('Forma-2 qoralama ko‘rish')} className="fz-btn fz-btn--ghost fz-btn--sm fz-btn--icon"><Eye aria-hidden="true" /></button>
            </div>
            {toSiqlar.length > 0 && <button type="button" data-testid="saqlash-sabab" onClick={tekshiruvgaOtish} className="max-w-[22rem] text-left text-[11.5px] text-danger underline-offset-2 hover:underline" title={toSiqlar.map((x) => x.matn).join('\n')}>
              {toSiqlar[0].matn}{toSiqlar.length > 1 ? ` (+${toSiqlar.length - 1})` : ''}</button>}
            <button type="button" onClick={() => void saqlash()} disabled={!saqlashMumkin || saving} className="fz-btn fz-btn--primary"><Save aria-hidden="true" />{saqlaMatn}<kbd className="fz-kbd" aria-hidden="true">{'Ctrl+Enter'}</kbd></button>
          </div>
        </section>
        {resZamena && joriy?.id && <IshAbcModal kompaniyaId={joriy.id} obyektId={obyektId} sana={bugun} bolimlar={[]} rejim={resZamena} onYop={() => setResZamena(null)}
          almashtirishBelgila={(qatorId, hajm) => sbT2ZamenaAlmashtirishBelgila({ kompaniyaId: joriy.id, qatorId, hajm })}
          onSaqlandi={async (xabar) => { setResZamena(null); toast(xabar, 'ok'); await tuzilmaYangila(); }} />}
        {chiqModal && joriy?.id && <ResursChiqarishModal kompaniyaId={joriy.id} obyektId={obyektId} sana={bugun} qator={chiqModal} onYop={() => setChiqModal(null)}
          onSaqlandi={(xabar) => { setChiqModal(null); toast(xabar, 'ok'); void qoshimchaYukla(); }} />}
        {joriy?.id && !aktKorish && <F2AiYordamchi kompaniyaId={joriy.id} obyektId={obyektId}
          malumot={{ obyektNomi: obyektlar.find((o) => o.id === obyektId)?.nom, oy, manba, ndsFoiz: ndsFoiz.trim() === '' || !Number.isFinite(Number(ndsFoiz.replace(',', '.'))) ? null : Number(ndsFoiz.replace(',', '.')),
            bolimlar, ier: bolimIer, qatorBolim, qatorlar, jami, katKesim, uchastkalar, k }}
          amallar={{ hajm: (id, v) => yoz('hajm', id, v), narx: (id, v) => { yoz('narxsiz', id, undefined); yoz('narx', id, v); }, narxsiz: (id) => { yoz('narx', id, undefined); yoz('narxsiz', id, true); },
            bolimniOl: (bs) => { bolimniOl(bs); }, korsat: (nom) => setQidir(nom) }} />}
      </>}
    </div>
  </Sahifa>;
}

export default F2TayyorlashNative;
