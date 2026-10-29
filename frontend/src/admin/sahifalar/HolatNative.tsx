import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { ContractScopePanel } from '../../components/contract-scope/ContractScopePanel';
import { ObjectMoneySummary } from '../../components/pto-workspace/ObjectMoneySummary';
import { ObjectTrail } from '../../components/pto-workspace/ObjectTrail';
import { MarketPriceComparison } from '../../components/smeta-studio-pro/MarketPriceComparison';
import { marketReadPrice } from '../../lib/smeta-studio/market-comparison';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Ban, ChevronDown, Eye, FileSpreadsheet, Info, Plus, Upload, X } from 'lucide-react';
import { SmetaTree } from '../../umumiy/daraxt/SmetaTree';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { useT2Daraxt } from '../../umumiy/daraxt/useT2Daraxt';
import { lrvPlusEksportGate, type LrvPlusExportContext } from '../../lib/lrv-plus-export';
import { lrvHujjat } from '../../lib/lrv-hujjat';
import { f2HujjatKonteksti } from '../../api/f2-hujjat-kontekst';
import { mazmunXeshi, tokenBilan } from '../../api/t2-token';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { NDS_SUKUT_FOIZ } from '../../lib/nakopitelniy-vedomost-export';
import { t } from '../../i18n/til';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { obyektPodvali } from '../../api/t2-nakrutka-podval';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { ostatkaHujjatModeli, ostatkaHujjatXlsx } from '../../lib/ostatka-export';
import { slichitelniyHujjatXlsx, slichitelniyModeli } from '../../lib/slichitelniy-vedomost';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { toast } from '../../umumiy/ui/Toast';
import SmetaYuklaNative from './SmetaYuklaNative';
import ResursVedomostNative from './ResursVedomostNative';
import NarxNazoratNative from './NarxNazoratNative';
import { OstatkaIstisnoPanel, useOstatkaIstisnolari } from './OstatkaIstisnoPanel';
import { BajarilmadiPanel } from './BajarilmadiPanel';
import { SmetaAnatomiya } from '../../components/smeta-hujjat/SmetaAnatomiya';
import { SmetaVersiyaFarq, VersiyaAlmashtirilganBelgi } from './SmetaVersiyaFarq';
import { yaxlitQatorIdlari } from '../../lib/svod-yaxlit';
import { MuhrFarqXulosa, useMuhrFarq } from '../../umumiy/daraxt/MuhrFarqXulosa';

/**
 * Kundalik ISHCHI SMETA/LRV sahifasi. Bu komponentda Sheet nomi, Drive
 * papkasi, `varaq` yoki `row` biznes identity sifatida ishlatilmaydi.
 * URL va barcha o'qishlar faqat `t2_obyekt.id` hamda `t2_qator.id` bilan.
 */
export function HolatNative() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPanel = searchParams.get('panel');
  const [exportsOpen,setExportsOpen] = useState(false);
  const panelTab = requestedPanel === 'smeta' ? 'yuklash' : requestedPanel === 'versiya' ? 'versiya' : 'smeta';
  const [activeTab, setActiveTab] = useState(panelTab);
  const { joriy } = useKompaniya();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  /* Sahifaning o'z xatolari (obyektlar ro'yxati, eksport). Daraxt xatosi hook'dan. */
  const [sahifaXato, setError] = useState('');
  const [ochiqPanel, setOchiqPanel] = useState<string | null>(null);
  const [eksportBolmoqda, setEksportBolmoqda] = useState(false);
  const [slichFaqatFarq, setSlichFaqatFarq] = useState(false);
  /* Egasi: hujjatni saytda aynan hujjatdagiday ko'rish — yuklab olinadigan faylning o'zidan. */
  const korinish = useHujjatKorinish();

  const obyektId = Number(id);
  const validId = Number.isSafeInteger(obyektId) && obyektId > 0;
  const [tomonlar, setTomonlar, imzoTafsilot] = useHujjatTomonlari(joriy?.id, validId ? obyektId : null);
  /* Eksport FAKT/OSTATKA/F2 ustunlarini holatXom dan oladi -- daraxt qurish
     uchun allaqachon o'qilyapti, qayta so'rov yo'q. */
  const {
    rows: daraxtXom, states: holatXom, tree, price: priceControlLines,
    loading, yangilanmoqda, error: daraxtXato, yuklash,
  } = useT2Daraxt(validId ? obyektId : null);
  /* SMETA CONST (egasi 2026-10-27): asl smeta muhridan farq — daraxt qayta yuklanganda yangilanadi. */
  const muhr = useMuhrFarq(validId ? obyektId : null, daraxtXom);
  useEffect(() => { setOchiqPanel(null); setExportsOpen(false); setActiveTab(panelTab); }, [obyektId, joriy?.id, requestedPanel, panelTab]);
  const error = sahifaXato || daraxtXato;
  // Taqqoslash ham aynan to'liq o'qilgan kanonik qatorlardan; ikkinchi 20k cut-off yo'q.
  const marketLines = useMemo(() => activeTab === 'narx' ? daraxtXom
    .filter(r => r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob')
    .map(r => ({ id: String(r.id), name: r.nom, unit: r.birlik, price: marketReadPrice(r.narx) })) : [], [daraxtXom, activeTab]);
  const istisno = useOstatkaIstisnolari(validId ? obyektId : null);
  const selected = obyektlar.find((o) => o.id === obyektId && o.kompaniya_id === joriy?.id) ?? null;
  const workspace = usePTOWorkspace();
  /* 2026-09-11 (egasi: "shu tepadagi belgilanadigan joy naxxuy kerak o'zi?"):
     eksport konteksti endi TEPADAGI PTO scope'ga emas, SAHIFA ochgan obyektga
     tayanadi. Obyekt URL bilan ochilgan va daraxti to'la yuklangan bo'lsa —
     eksport ochiladi, tepadan hech narsa tanlash shart emas. Manba hujjat/
     revision/davr — agar scope'da tanlangan bo'lsa — IXTIYORIY provenance
     sifatida uzatiladi va fayldagi "МАНБА" varag'iga yoziladi. */
  const exportContext = useMemo<Partial<LrvPlusExportContext>>(() => ({
    kompaniyaId: joriy?.id ?? undefined,
    loyihaId: selected?.loyiha_id ?? undefined,
    obyektId: validId ? obyektId : undefined,
    davrId: workspace.scope.periodId ?? undefined,
    periodApplicable: workspace.loading.periods ? undefined : workspace.periods.length > 0,
    sourceDocumentId: workspace.scope.sourceDocumentId ?? undefined,
    revisionId: workspace.scope.revisionId ?? undefined,
    sourceChecksum: workspace.sourceDocuments.find((document) => document.id === workspace.scope.sourceDocumentId)?.sha256 ?? undefined,
    dataComplete: Boolean(validId && daraxtXom.length > 0 && !loading && !error),
  }), [joriy?.id, selected?.loyiha_id, validId, obyektId, daraxtXom.length, error, loading, workspace.loading.periods, workspace.periods.length, workspace.scope, workspace.sourceDocuments]);
  const exportGate = lrvPlusEksportGate(exportContext);
  const exportBlockReason = !exportGate.ok ? exportGate.reasons[0] : null;
  /* Texnik gate kodi (OBJECT_CONTEXT_REQUIRED…) foydalanuvchiga ko'rsatilmaydi — tushunarli sabab. */
  const SABAB_UZ: Record<string, string> = {
    COMPANY_CONTEXT_REQUIRED: 'kompaniya tanlanmagan',
    OBJECT_CONTEXT_REQUIRED: 'obyekt tanlanmagan',
    READ_MODEL_NOT_COMPLETE: 'smeta ma’lumoti hali to‘liq yuklanmadi — yangilab qayta urinib ko‘ring',
  };
  const eksportSababi = t(exportBlockReason ? (SABAB_UZ[exportBlockReason] ?? 'ma’lumot yetarli emas') : 'ma’lumot yetarli emas');

  useEffect(() => {
    let active = true;
    setObyektlar([]);
    if (!joriy?.id) return;
    void sbT2ObyektlarOlKomp(joriy.id).then((r) => {
      if (!active) return;
      if (!r.ok) { setError('Obyektlar kanonik ro‘yxatdan o‘qilmadi.'); return; }
      setObyektlar((r.qatorlar || []) as T2Obyekt[]);
    }).catch(() => { if (active) setError('Obyektlar kanonik ro‘yxatdan o‘qilmadi.'); });
    return () => { active = false; };
  }, [joriy?.id]);

  /* Owner (2026-09-10): "test obyektim stella chiqmayapdi ... exellni yuklab
   * bo'lmas emish". Sahifa obyektni URL orqali ochadi ("Kanonik obyekt"),
   * lekin eksport gate'i TEPADAGI PTO scope'ning obyektiga qaraydi. Ikkisi
   * sinxron bo'lmagani uchun foydalanuvchi ochgan obyektida eksport
   * OBJECT_CONTEXT_REQUIRED bilan bloklanardi va u AYNAN O'SHA obyektni
   * tepadan qo'lda qayta tanlashi kerak edi. Scope setter'larining o'zi
   * kompaniya/loyiha chegarasini tekshiradi -- bu yerda hech qanday
   * ruxsat kengaytirilmaydi, faqat ochilgan obyekt bilan moslashtiriladi. */
  const yangilanganObyekt = useRef<number | null>(null);
  useEffect(() => {
    if (!validId || workspace.loading.hierarchy) return;
    if (workspace.scope.objectId === obyektId) return;
    const object = workspace.objects.find((row) => row.id === obyektId);
    /* Owner (2026-09-10): "nima uchun yuklangan obyekt o'sha tepadagi
       ro'yxatda chiqmayapdi ... u avtomat ishlashi kerak bo'lgan narsada".
       PTO iyerarxiyasi sahifa ochilganda BIR MARTA o'qiladi -- undan keyin
       yaratilgan obyekt (masalan yangi import qilingani) ro'yxatda
       bo'lmaydi, sinxronlash esa jim to'xtardi va eksport
       READ_MODEL_NOT_COMPLETE bilan bloklanardi. Endi ro'yxat bir marta
       qayta o'qiladi; obyekt shundan keyin ham topilmasa, u haqiqatan
       shu kompaniyaga tegishli emas -- hech narsa qilinmaydi. */
    if (!object) {
      if (yangilanganObyekt.current !== obyektId) {
        yangilanganObyekt.current = obyektId;
        workspace.refresh();
      }
      return;
    }
    workspace.setObjectId(obyektId);
  }, [obyektId, validId, workspace]);


  /* T2-LRV-PLUS-EXPORT-001: owner talabi -- T1'ning LRV_PLUS'idagi kabi,
   * lekin Excelning O'ZIDA ishlaydigan formula bilan: bl'ning ОБЪЁМини
   * o'zgartirsa, ostidagi resurslar va summalar Exceldagi SUMIF/formula
   * orqali avtomatik qayta hisoblanadi -- ilovaga qaytmasdan ham.
   *
   * T2-LRV-PLUS-EXPORT-004: owner "bu nakrutka qatorlari aslida lrv
   * plusda ham bo'lishi hisoblanishi kerak, bo'lmasa butun tizimda
   * summalar faqat primoy zatratda hisoblanib qoladi" -- shuning uchun
   * nakrutka koeffitsientlari HAR IKKI rejimda (`toliq`, `forma2`) ham
   * so'raladi va kaskad jadvali qo'shiladi. Nakrutka o'qish muvaffaqiyatsiz
   * bo'lsa (masalan shartnoma sozlanmagan) -- eksport BLOKLANMAYDI, faqat
   * kaskad jadvalisiz chiqadi (best-effort, hujjatning o'zi muhimroq).
   *
   * HERM-001 WP-1C: bundan tashqari, PTO scope (kompaniya/loyiha/obyekt/
   * davr/source hujjat/revision) va read-model to'liqligi ISBOTLANMASA
   * (`exportGate`), eksport butunlay BLOKLANADI -- nakrutka bilan/siz
   * farqi yo'q, provenance hech qachon ixtiyoriy emas. */
  /* Egasi (2026-10-02): LRV — Ф-2 shaklida, lekin butun smeta (lib/lrv-hujjat): guruhlash, muzlatilgan sarlavha va
   * № | Шифр | Наименование, avtofiltr, fakt / F2 / ostatka / "можно предъявить" ustunlari, resurs vedomosti va svod —
   * hammasi formulada. Imzo/shartnoma/nakrutka/podval — Ф-2 bilan bir xil manba. Eski LRV_PLUS va uning "Forma-2"
   * rejimi (F2 dublikati) bu sahifadan olib tashlandi. Token: hujjat narxi, aynan bir xil mazmun qayta — bepul. */
  const eksportQil = useCallback(async (korish = false) => {
    if (!selected || !daraxtXom.length || !joriy?.id) return;
    if (!exportGate.ok) {
      setError(`${t('Excel eksporti hozir mumkin emas')}: ${eksportSababi}.`);
      return;
    }
    setEksportBolmoqda(true);
    try {
      const ctx = await f2HujjatKonteksti(joriy.id, obyektId);
      const qolda = Object.fromEntries(Object.entries(tomonlar).filter(([, x]) => typeof x === 'string' && x.trim()));
      const h = lrvHujjat(daraxtXom, holatXom, {
        obyektNom: selected.nom, davr: new Date().toISOString().slice(0, 10), imzo: { ...ctx.imzo, ...qolda }, shartnoma: ctx.shartnoma,
        ndsFoiz: NDS_SUKUT_FOIZ, nakrutka: ctx.nakrutka, podval: ctx.podval,
        svodYaxlit: ctx.svodYaxlit, yaxlitIdlar: yaxlitQatorIdlari(daraxtXom, ctx.svodYaxlit),
      });
      const xesh = await mazmunXeshi(h.bytes);
      const r = await tokenBilan({ kompaniyaId: joriy.id, amal: 'hujjat', birlikSoni: h.yacheykalar,
        meta: { hujjat: 'LRV', sabab: `ЛРВ · ${selected.nom}`.slice(0, 200), obyekt: obyektId, yacheyka: h.yacheykalar, xesh } }, async () => {
        if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
        return true;
      });
      if (!r.ok) toast(r.xabar, 'danger');
      else if (r.bepulTakror) toast('Bu hujjat avval to‘langan — qayta yuklash bepul', 'ok');
      else if (r.sarflandi) toast(`${r.sarflandi} token · ${Number(r.hisob?.yakuniy_som ?? 0).toLocaleString('ru-RU')} so‘m (${h.yacheykalar} yacheyka)`, 'ok');
    } catch {
      setError('Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, daraxtXom, holatXom, obyektId, joriy?.id, exportGate.ok, eksportSababi, tomonlar, korinish]);

  /* Egasi (2026-09-23): "tizim ostatka ishlarni ham bittada smeta shaklida bera
     oladigan bo'lishi kerak". Ostatka = smeta − fakt; hujjat — rasmiy
     "ВЕДОМОСТЬ ОСТАТКА РАБОТ" (hujjat standarti H1–H9): ichma-ich RZ, ИТОГО,
     oshib ketgan va noma'lum pozitsiyalar hujjatda ochiq ro'yxatda. */
  const ostatkaEksport = useCallback(async (korish = false) => {
    if (!selected || !daraxtXom.length || !joriy?.id) return;
    if (!exportGate.ok) {
      setError(`${t('Excel eksporti hozir mumkin emas')}: ${eksportSababi}.`);
      return;
    }
    // Bajarilmaydigan/bekor qilingan ishlar — eng so'nggi holat bilan (jim yo'qotish yo'q).
    let istisnolar;
    try { istisnolar = await istisno.yangila(); } catch {
      setError('Ostatka: bekor qilingan ishlar ro‘yxati o‘qilmadi — hujjat tuzilmadi. Qayta urinib ko‘ring.');
      return;
    }
    const model = ostatkaHujjatModeli(daraxtXom, holatXom, istisnolar);
    if (!model.barglar) {
      toast(`Ostatka yo‘q: barcha ishlar bajarilgan${model.oshibKetgan.length ? `, ${model.oshibKetgan.length} ta qatorda fakt smetadan oshgan` : ''}.`, 'warn');
      return;
    }
    setEksportBolmoqda(true);
    try {
      const nk = await t2ObyektNakrutka(obyektId).catch(() => null);
      const podval = await obyektPodvali(joriy?.id, obyektId, nk?.ok ? nk.shartnoma_id : null);
      const { bytes, faylNomi } = ostatkaHujjatXlsx(model, { obyektNomi: selected.nom, imzo: tomonlar, nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval,
        yaxlitIdlar: yaxlitQatorIdlari(daraxtXom, nk?.ok ? nk.svod_yaxlit : null) });
      const t = await hujjatTokenBilan({ kompaniyaId: joriy.id, bytes, hujjat: 'OSTATKA', sabab: `Ведомость остатка · ${selected.nom}`, obyekt: obyektId },
        () => { if (korish) korinish.ochish(bytes, faylNomi); else downloadBlob(bytes, faylNomi); });
      if (!t.ok) { toast(t.xabar, 'danger'); return; }
      const izoh = [
        model.oshibKetgan.length ? `${model.oshibKetgan.length} ta qatorda fakt smetadan oshgan — alohida ro‘yxatda` : '',
        model.diqqat.length ? `${model.diqqat.length} ta pozitsiya diqqat ro‘yxatida` : '',
        model.chiqarilgan.length ? `${model.chiqarilgan.length} ta ish ostatkadan chiqarilgan (asosi bilan alohida bo‘limda)` : '',
      ].filter(Boolean).join('; ');
      toast(`Ostatka: ${model.barglar} ta pozitsiya${model.jami != null ? `, jami ${model.jami.toLocaleString('ru-RU')} so‘m` : ''}.${izoh ? ' ' + izoh + '.' : ''}${t.xabar ? ' ' + t.xabar : ''}`, izoh ? 'warn' : 'ok');
    } catch {
      setError('Ostatka Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, daraxtXom, holatXom, exportGate.ok, eksportSababi, tomonlar, istisno, obyektId, korinish, joriy?.id]);


  /* Egasi (2026-09-25): "slichitelniy vedomost ham yasay oladigan bo'lishi
     kerak". СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ: smeta ↔ fakt (↔ tasdiqlangan Ф-2) har
     pozitsiya bo'yicha, farq (+ ortiq / − kam) summasi bilan. Farqni faqat
     ko'rsatadi — hech narsani o'zgartirmaydi. */
  const slichitelniyEksport = useCallback(async (korish = false) => {
    if (!selected || !daraxtXom.length || !joriy?.id) return;
    if (!exportGate.ok) {
      setError(`${t('Excel eksporti hozir mumkin emas')}: ${eksportSababi}.`);
      return;
    }
    let istisnolar;
    try { istisnolar = await istisno.yangila(); } catch {
      setError('Slichitelniy: bekor qilingan ishlar ro‘yxati o‘qilmadi — hujjat tuzilmadi. Qayta urinib ko‘ring.');
      return;
    }
    const model = slichitelniyModeli(daraxtXom, holatXom, { faqatFarq: slichFaqatFarq, istisnolar });
    if (!model.barglar) { toast(slichFaqatFarq ? 'Farq yo‘q: barcha pozitsiyalarda fakt smeta bilan teng.' : 'Solishtiriladigan pozitsiya yo‘q.', 'warn'); return; }
    setEksportBolmoqda(true);
    try {
      const nk = await t2ObyektNakrutka(obyektId).catch(() => null);
      const podval = await obyektPodvali(joriy?.id, obyektId, nk?.ok ? nk.shartnoma_id : null);
      const { bytes, faylNomi } = slichitelniyHujjatXlsx(model, { obyektNomi: selected.nom, imzo: tomonlar, faqatFarq: slichFaqatFarq, istisnolar, nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval,
        svodYaxlit: nk?.ok ? nk.svod_yaxlit ?? null : null, yaxlitIdlar: yaxlitQatorIdlari(daraxtXom, nk?.ok ? nk.svod_yaxlit : null) });
      const t = await hujjatTokenBilan({ kompaniyaId: joriy.id, bytes, hujjat: 'SLICHITELNIY', sabab: `Сличительная ведомость · ${selected.nom}`, obyekt: obyektId },
        () => { if (korish) korinish.ochish(bytes, faylNomi); else downloadBlob(bytes, faylNomi); });
      if (!t.ok) { toast(t.xabar, 'danger'); return; }
      toast(`Slichitelniy: ${model.barglar} ta pozitsiya, ${model.ortiq} tasida smetadan ortiq, ${model.kam} tasida kam bajarilgan${model.diqqat.length ? `; ${model.diqqat.length} ta pozitsiyada ma’lumot yetishmaydi — jami bo‘sh qoldirildi` : ''}.${t.xabar ? ' ' + t.xabar : ''}`, model.diqqat.length ? 'warn' : 'ok');
    } catch {
      setError('Slichitelniy Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, daraxtXom, holatXom, exportGate.ok, eksportSababi, tomonlar, istisno, slichFaqatFarq, obyektId, korinish, joriy?.id]);

  /* Shartnoma bo'yicha ustama (URL `?shartnoma=`) — SmetaAnatomiya umumiy (obyekt) ustamasini ko'rsatadi; aniq
     shartnoma tanlangan bo'lsa, o'sha shartnomaning nakrutkali summasi alohida ixcham qatorda qoladi. */
  const shartnomaTanlangan = searchParams.get('shartnoma') != null;
  const eksportMumkin = validId && tree.length > 0;
  const kutilayotgan = istisno.royxat.filter((o) => o.holat === 'qoralama').length;

  const TABLAR = [
    ['smeta', 'Smeta va bajarilish'], ['resurs', 'Resurslar'], ['narx', 'Narxlar nazorati'], ['yuklash', 'Smeta yuklash'], ['versiya', 'Versiyalar va farq'], ['shartnoma', 'Shartnoma doirasi'],
  ] as const;
  const eksportQator = (nom: string, tavsif: string, tugma: string, korishNomi: string, onExcel: () => void, onKorish: () => void, sarlavhaTitle: string, qoshimcha?: ReactNode) => (
    <div className="grid items-center gap-x-4 gap-y-1 border-b border-border py-2.5 last:border-b-0" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-text" style={{ fontFamily: 'var(--font-display)' }}>{t(nom)}</p>
        <p className="text-[12px] leading-4 text-text-mute">{t(tavsif)}</p>
        {qoshimcha}
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onExcel} disabled={eksportBolmoqda || !exportGate.ok} title={exportGate.ok ? t(sarlavhaTitle) : `${t('Eksport hozir mumkin emas')}: ${eksportSababi}`} className="fz-btn fz-btn--sm">
          <FileSpreadsheet aria-hidden="true" /> {eksportBolmoqda ? t('Tuzilmoqda…') : tugma}
        </button>
        <button type="button" onClick={onKorish} disabled={eksportBolmoqda || !exportGate.ok} title={t(korishNomi)} aria-label={t(korishNomi)} className="fz-btn fz-btn--sm fz-btn--icon"><Eye aria-hidden="true" /></button>
      </div>
    </div>
  );

  return (
    <Sahifa
      sarlavha={selected?.nom ?? 'Obyekt ish joyi'}
      tavsif={selected ? 'Smeta, bajarilgan ishlar va hujjatlar bir joyda' : 'Obyektni tanlang — smeta, bajarilgan ishlar va hujjatlar bir joyda'}
      onYangila={validId ? () => void yuklash() : undefined}
      yangilanmoqda={loading || yangilanmoqda}
      amallar={<>
        {selected && <button type="button" className="fz-btn" aria-expanded={exportsOpen} onClick={() => setExportsOpen(v => !v)}><FileSpreadsheet aria-hidden="true" />{t('Hujjatlar va eksport')}<ChevronDown aria-hidden="true" style={{ transform: exportsOpen ? 'rotate(180deg)' : undefined, transition: 'transform .12s' }} /></button>}
        {validId && <button type="button" onClick={() => navigate(`/admin/fakt?obyekt=${obyektId}`)} className="fz-btn fz-btn--primary"><Plus aria-hidden="true" />{t('Fakt kiritish')}</button>}
      </>}
    >
      {korinish.oyna}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={() => navigate('/admin/obyektlar')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label="Obyektlarga qaytish" title={t('Obyektlarga qaytish')}><ArrowLeft aria-hidden="true" /></button>
          {validId && <div className="min-w-0 flex-1"><ObjectTrail companyId={joriy?.id ?? null} objectId={obyektId} /></div>}
          <label className="ml-auto flex min-w-[240px] max-w-[420px] flex-1 items-center gap-2 text-[12px] font-medium text-text-dim">
            <span className="shrink-0">{t('Obyekt')}</span>
            <select value={validId ? String(obyektId) : ''} onChange={(e) => { const nextId = Number(e.target.value); if (Number.isSafeInteger(nextId) && nextId > 0) navigate(`/admin/holat/${nextId}${workspace.scopeSearch(nextId)}`); else { workspace.setObjectId(null); navigate('/admin/holat'); } }} className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border-strong)] bg-surface-2 px-2 text-[13px] text-text">
              <option value="">{t('-- obyektni tanlang --')}</option>
              <ObyektOptionlari obyektlar={obyektlar} />
            </select>
          </label>
        </div>

        {exportsOpen && selected && <section className="fz-card" aria-label={t('Hujjatlar va eksport')}>
          <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}>
            <div>
              <h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Hujjatlar va eksport')}</h3>
              <p className="fz-card__sub">{t('Excel fayllar shu smetadan tuziladi; formulalar faylning o‘zida hisoblanadi.')}</p>
            </div>
            <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => setExportsOpen(false)} aria-label={t('Yopish')}><X aria-hidden="true" /></button>
          </div>
          <div className="px-4 py-1">
            {validId && tree.length > 0 && !exportGate.ok && (
              <div role="status" className="fz-note fz-note--warn my-2"><AlertTriangle aria-hidden="true" /><span><b>{t('Excel eksporti hozir mumkin emas')}.</b> {eksportSababi}.</span></div>
            )}
            {eksportMumkin ? (<>
              {eksportQator('LRV — butun smeta', 'Ф-2 shaklida: guruhlash, filtr, fakt / F2 / ostatka, resurs vedomosti va svod.', 'LRV Excel', 'LRV ko‘rish', () => void eksportQil(false), () => void eksportQil(true),
                'ЛРВ: butun smeta Ф-2 shaklida — guruhlash, filtr, fakt / F2 / ostatka, resurs vedomosti va svod formulalarda')}
              {eksportQator('Ostatka vedomosti', 'Bajarilmay qolgan ishlar (smeta − fakt), RZ ierarxiyasi, jami va imzolar.', 'Ostatka Excel', 'Ostatka ko‘rish', () => void ostatkaEksport(false), () => void ostatkaEksport(true),
                'ВЕДОМОСТЬ ОСТАТКА РАБОТ: bajarilmay qolgan ishlar (smeta − fakt) smeta shaklida, RZ ierarxiyasi, ИТОГО, imzolar.')}
              {eksportQator('Slichitelniy vedomost', 'Smeta va haqiqatda bajarilgan hajm (va tasdiqlangan F2) har pozitsiya bo‘yicha, farq summasi bilan.', 'Slichitelniy Excel', 'Slichitelniy ko‘rish', () => void slichitelniyEksport(false), () => void slichitelniyEksport(true),
                'СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ: smeta va haqiqatda bajarilgan hajm (va tasdiqlangan Ф-2) har pozitsiya bo\'yicha, farq (+/−) summasi bilan, imzolar.',
                <label className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-text-dim" title={t('Slichitelniy vedomostga faqat fakt smetadan farq qiladigan pozitsiyalar kirsin')}>
                  <input type="checkbox" checked={slichFaqatFarq} onChange={(e) => setSlichFaqatFarq(e.target.checked)} /> {t('faqat farqi borlar')}
                </label>)}
              <details className="border-t border-border py-2.5">
                <summary className="cursor-pointer text-[12.5px] font-medium text-text-dim">{t('Hujjatlardagi imzo va tomonlar')}</summary>
                <div className="mt-2"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} tafsilot={imzoTafsilot} /></div>
              </details>
            </>) : <p className="py-3 text-[12.5px] text-text-mute">{t('Eksport uchun obyektda smeta qatorlari bo‘lishi kerak.')}</p>}
          </div>
        </section>}

        {!validId && (
          <div className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" /><span>{t('Eski matnli obyekt havolasi kanonik identity emas. Yuqoridan obyektni tanlang — sahifa keyin faqat raqamli `t2_obyekt.id` bilan ishlaydi.')}</span></div>
        )}
        {error && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div>}

        {loading && tree.length === 0 && <div className="skel min-h-[280px] flex-1 rounded-xl" />}
        {validId && !loading && !error && tree.length === 0 && (
          <div className="fz-note fz-note--info items-center">
            <Info aria-hidden="true" />
            <span className="flex-1">{t('Bu obyektda kanonik smeta qatorlari yo‘q.')}</span>
            <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" onClick={() => setActiveTab('yuklash')}><Upload aria-hidden="true" />{t('Smeta yuklash')}</button>
          </div>
        )}
        {selected && shartnomaTanlangan && <ObjectMoneySummary object={selected} />}

        {validId && <nav aria-label={t('Obyekt ish bo‘limlari')} className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" className="inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-surface-2 p-0.5" style={{ gap: 2 }}>
            {TABLAR.map(([tab, nom]) => {
              const faol = activeTab === tab;
              return <button type="button" key={tab} aria-pressed={faol} onClick={() => setActiveTab(tab)} className="whitespace-nowrap rounded-[5px] px-3 text-[12.5px]" style={{ height: 28, cursor: 'pointer', fontWeight: faol ? 600 : 500, border: 0,
                background: faol ? 'var(--surface)' : 'transparent', color: faol ? 'var(--accent-text)' : 'var(--text-dim)', boxShadow: faol ? '0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)' : 'none' }}>{t(nom)}</button>;
            })}
          </div>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <VersiyaAlmashtirilganBelgi obyektId={obyektId} onOch={() => setActiveTab('versiya')} />
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => navigate(`/admin/f2?obyekt=${obyektId}`)}>{t('F2 import')}</button>
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => navigate(`/admin/nakopitelniy?obyekt=${obyektId}`)}>{t('Nakopitelniy va F3')}</button>
          </span>
        </nav>}

        {/* Firuza (egasi 2026-10-25): smeta anatomiyasi — daraxt ustida bir qarashda holat (smeta / fakt / F2 / qoldiq — yagona jami). */}
        {selected && tree.length > 0 && activeTab === 'smeta' && <SmetaAnatomiya tree={tree} obyektId={obyektId} />}
        {selected && tree.length > 0 && activeTab === 'smeta' && <MuhrFarqXulosa royxat={muhr.royxat} />}
        {selected && !loading && !error && activeTab === 'smeta' && (
          <details className="fz-card" open={ochiqPanel === 'istisno'} onToggle={(e) => setOchiqPanel(e.currentTarget.open ? 'istisno' : null)}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] font-semibold text-text">
              <Ban size={15} aria-hidden="true" className="text-text-mute" />
              <span>{t('Bajarilmaydigan / bekor qilingan ishlar')}</span>
              {istisno.royxat.length > 0 && <span className="fz-chip">{istisno.royxat.length}</span>}
              {kutilayotgan > 0 && <span className="fz-stamp fz-stamp--warn fz-stamp--draft">{t('tasdiq kutilmoqda')}</span>}
              <span className="ml-auto text-[11.5px] font-normal text-text-mute">{ochiqPanel === 'istisno' ? t('yopish ▴') : t('ochish ▾')}</span>
            </summary>
            {ochiqPanel === 'istisno' && <div className="max-h-[520px] overflow-auto border-t border-border px-4 py-3">
              {istisno.xato && <p role="alert" className="mb-2 text-danger">{istisno.xato}</p>}
              {joriy?.id != null && <div className="mb-4 border-b border-border pb-3"><BajarilmadiPanel kompaniyaId={joriy.id} obyektId={obyektId} obyektNomi={selected?.nom} qatorlar={daraxtXom} holatlar={holatXom} /></div>}
              <OstatkaIstisnoPanel obyektId={obyektId} qatorlar={daraxtXom} holatlar={holatXom} royxat={istisno.royxat} yangila={istisno.yangila} onSmetaOzgardi={() => void yuklash()} />
            </div>}
          </details>
        )}
        {selected && tree.length > 0 && <div hidden={activeTab !== 'smeta'} className="h-[65vh] min-h-[420px] shrink-0"><SmetaTree data={tree} priceControlLines={priceControlLines} muhrFarq={muhr.xarita} onFaktOpen={() => navigate(`/admin/fakt?obyekt=${obyektId}`)} onQatorTahrirlandi={yuklash} /></div>}
        {activeTab === 'shartnoma' && selected && !loading && !error && <ContractScopePanel key={`${joriy?.id}:${obyektId}`} objectId={obyektId} lines={daraxtXom.map(q => ({ id: q.id, ota_id: q.ota_id, tur: q.tur, nom: q.nom ?? '', summa: q.summa, versiya: q.versiya }))} />}
        {activeTab === 'narx' && selected && validId && !loading && !error && <MarketPriceComparison lines={marketLines} objectId={obyektId} companyId={joriy?.id ?? null} />}

        {selected && !loading && !error && (
          <div key={`${joriy?.id}|${obyektId}`} className="shrink-0 space-y-3" aria-label="LRV kundalik boshqaruv panellari">
            <section hidden={activeTab !== 'yuklash'} className="fz-card">
              <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}><h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Smeta XLSX yuklash')}</h3></div>
              {activeTab === 'yuklash' && <div className="p-4"><SmetaYuklaNative obyektId={obyektId} onImportlandi={yuklash} /></div>}
            </section>
            {/* PTO-CORE-001: tashqi smeta versiyasi (ekspertizagacha …) → farq → da'vo; joriy smeta o'zgarmaydi. */}
            {activeTab === 'versiya' && joriy?.id != null && (
              <section className="fz-card">
                <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}><h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Versiyalar va farq')}</h3></div>
                <div className="p-4"><SmetaVersiyaFarq kompaniyaId={joriy.id} obyektId={obyektId} obyektNom={selected.nom} joriyQatorlar={daraxtXom} tomonlar={tomonlar} /></div>
              </section>
            )}
            <section hidden={activeTab !== 'resurs'} className="fz-card">
              <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}><h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Resurs vedomosti')}</h3></div>
              {activeTab === 'resurs' && <div className="p-4"><ResursVedomostNative obyektId={obyektId} /></div>}
            </section>
            <section hidden={activeTab !== 'narx'} className="fz-card">
              <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}><h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Narx nazorati')}</h3></div>
              {activeTab === 'narx' && <div className="p-4"><NarxNazoratNative obyektId={obyektId} /></div>}
            </section>
          </div>
        )}
      </div>
    </Sahifa>
  );
}

export default HolatNative;
