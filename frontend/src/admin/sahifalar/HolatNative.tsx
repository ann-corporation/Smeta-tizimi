import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { ContractScopePanel } from '../../components/contract-scope/ContractScopePanel';
import { ObjectMoneySummary } from '../../components/pto-workspace/ObjectMoneySummary';
import { ObjectTrail } from '../../components/pto-workspace/ObjectTrail';
import { ObyektQadamlari } from '../components/ObyektQadamlari';
import { ObyektPodvalOgohi } from './SmetaPodvalNakrutka';
import { MarketPriceComparison } from '../../components/smeta-studio-pro/MarketPriceComparison';
import { marketReadPrice } from '../../lib/smeta-studio/market-comparison';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArxivTugma } from '../../components/arxiv/ArxivTugma';
import { AlertTriangle, ArrowLeft, Ban, ChevronDown, Eye, FileSpreadsheet, Info, MoreHorizontal, Plus, Upload, X } from 'lucide-react';
import { SmetaTree } from '../../umumiy/daraxt/SmetaTree';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { useT2ObyektlarRoyxati } from '../../api/t2-obyektlar-kesh';
import { useT2Daraxt } from '../../umumiy/daraxt/useT2Daraxt';
import { lrvPlusEksportGate, type LrvPlusExportContext } from '../../lib/lrv-plus-export';
import { lrvHujjat } from '../../lib/lrv-hujjat';
import { f2HujjatKonteksti } from '../../api/f2-hujjat-kontekst';
import { mazmunXeshi, tokenBilan } from '../../api/t2-token';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { NDS_SUKUT_FOIZ } from '../../lib/nakopitelniy-vedomost-export';
import { t } from '../../i18n/til';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { useQaytaUlanish } from '../../desktop/qayta-ulanish';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { ostatkaHujjatQur, slichitelniyHujjatQur, ustamaManbaOl } from '../../lib/oylik-hujjat/ostatka-slichitelniy';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { toast } from '../../umumiy/ui/Toast';
import SmetaYuklaNative from './SmetaYuklaNative';
import ResursVedomostNative from './ResursVedomostNative';
import NarxNazoratNative from './NarxNazoratNative';
import { OstatkaIstisnoPanel, useOstatkaIstisnolari } from './OstatkaIstisnoPanel';
import { BajarilmadiPanel } from './BajarilmadiPanel';
import { ObosnovaniePanel } from './ObosnovaniePanel';
import { SmetaAnatomiya } from '../../components/smeta-hujjat/SmetaAnatomiya';
import { SmetaVersiyaFarq, VersiyaAlmashtirilganBelgi } from './SmetaVersiyaFarq';
import { yaxlitQatorIdlari } from '../../lib/svod-yaxlit';
import { MuhrFarqXulosa, useMuhrFarq } from '../../umumiy/daraxt/MuhrFarqXulosa';
import { KeyingiQadamPanel } from '../../components/qollanma/KeyingiQadamPanel';
import { IshVaraq } from './IshVaraq';

/**
 * Kundalik ISHCHI SMETA/LRV sahifasi. Bu komponentda Sheet nomi, Drive
 * papkasi, `varaq` yoki `row` biznes identity sifatida ishlatilmaydi.
 * URL va barcha o'qishlar faqat `t2_obyekt.id` hamda `t2_qator.id` bilan.
 */
export function HolatNative() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPanel = searchParams.get('panel');
  const [exportsOpen,setExportsOpen] = useState(false);
  const panelTab = requestedPanel === 'smeta' ? 'yuklash' : requestedPanel === 'versiya' ? 'versiya' : 'smeta';
  const [activeTab, setActiveTab] = useState(panelTab);
  /** Yuklash ustasidan «Yangi versiya sifatida saqlash» — fayl «Versiyalar va farq» formasiga oldindan qo'yiladi. */
  const [versiyaFayli, setVersiyaFayli] = useState<File | null>(null);
  /* Ish varag'i rejimi (egasi 2026-11-11): URL `?rejim=varaq` (route emas); sukut — Daraxt. Og'ir panellar — bitta «Boshqa» tugmasi ortida. */
  const varaq = searchParams.get('rejim') === 'varaq';
  const [boshqaOchiq, setBoshqaOchiq] = useState(false);
  const rejimQoy = (r: 'daraxt' | 'varaq') => setSearchParams((p) => { const n = new URLSearchParams(p); if (r === 'varaq') { n.set('rejim', 'varaq'); n.delete('panel'); setBoshqaOchiq(false); } else n.delete('rejim'); return n; }, { replace: true }); /* panel parametri qolsa (masalan «Smeta va bajarilish» tabi) varaq pastga tushib, tugma «ishlamayotgandek» ko'rinardi */
  /* Daraxt rejimida hamma panel ko'rinadi; varaq rejimida — faqat «Boshqa» ochiq bo'lganda (yoki ?panel= bilan aniq so'ralganda). */
  const panellar = !varaq || boshqaOchiq || requestedPanel != null;
  const { joriy } = useKompaniya();
  /* Obyektlar ro'yxati — umumiy keshdan; uning xatosi faqat obyekt tanlagichga tegishli, daraxtni yashirmaydi. */
  const { obyektlar, xato: obyektXato, yuklanmoqda: obyektYuklanmoqda } = useT2ObyektlarRoyxati(joriy?.id ?? null);
  /* Eksport xatosi — faqat xabar; daraxtni ham, keyingi eksportni ham bloklamaydi. Daraxt xatosi hook'dan. */
  const [eksportXato, setError] = useState('');
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
    loading, yangilanmoqda, error: daraxtXato, yuklash, holatniYangila, qatorniYangila, avvalgi, avvalgiTree, qoshimchaHolat, serverTasdiq,
  } = useT2Daraxt(validId ? obyektId : null);
  /* Tarmoq qaytdi (oflayn boshlangan ilova): eski xato tozalanadi, daraxt qayta o'qiladi (obyektlar/PTO ro'yxati o'zlari yangilanadi). */
  useQaytaUlanish(useCallback(() => { setError(''); if (validId) void yuklash(); }, [validId, yuklash]));
  /* SMETA CONST (egasi 2026-10-27): asl smeta muhridan farq — daraxt qayta yuklanganda yangilanadi. */
  const muhr = useMuhrFarq(validId ? obyektId : null, daraxtXom);
  useEffect(() => { setOchiqPanel(null); setExportsOpen(false); setActiveTab(panelTab); setError(''); }, [obyektId, joriy?.id, requestedPanel, panelTab]);
  /* Panellar faqat DARAXT xatosiga qaraydi (obyektlar ro'yxati yoki eksport xatosi ularni yashirmaydi). */
  const error = daraxtXato;
  // Taqqoslash ham aynan to'liq o'qilgan kanonik qatorlardan; ikkinchi 20k cut-off yo'q.
  const marketLines = useMemo(() => activeTab === 'narx' ? daraxtXom
    .filter(r => r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob')
    .map(r => ({ id: String(r.id), name: r.nom, unit: r.birlik, price: marketReadPrice(r.narx) })) : [], [daraxtXom, activeTab]);
  const istisno = useOstatkaIstisnolari(validId ? obyektId : null);
  const workspace = usePTOWorkspace();
  /* Obyekt yozuvi: sahifa ro'yxatidan, bo'lmasa PTO kontekstidan (ikkalasi ham kanonik t2_obyekt_jami). */
  const selected = obyektlar.find((o) => o.id === obyektId && o.kompaniya_id === joriy?.id)
    ?? workspace.objects.find((o) => o.id === obyektId && o.kompaniya_id === joriy?.id) ?? null;
  /* Hujjat nomi faqat tasdiqlangan obyekt yozuvidan — rasmiy Excel sarlavhasiga «Obyekt #id» yozilmaydi. */
  const obyektNom = selected?.nom ?? '';
  /* Kompaniya chegarasi: ro'yxat (sahifa + PTO kontekst) yuklangan va obyekt unda YO'Q — daraxt ham ko'rsatilmaydi. */
  const obyektBegona = validId && !selected && !obyektYuklanmoqda && !obyektXato && !workspace.loading.hierarchy;
  const daraxtKorinadi = validId && !obyektBegona;
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
    // Faqat SHU ochilishda server tasdiqlagan, hozir yangilanmayotgan ma'lumot (keshdan ko'rsatilgani emas);
    // qo'shimcha/zamena belgilari va avvalgi versiya ham hujjatga kiradi — ular o'qilguncha kutiladi.
    dataComplete: Boolean(validId && daraxtXom.length > 0 && !loading && !yangilanmoqda && serverTasdiq && !daraxtXato && qoshimchaHolat === 'tayyor'),
  }), [joriy?.id, selected?.loyiha_id, validId, obyektId, daraxtXom.length, daraxtXato, qoshimchaHolat, serverTasdiq, yangilanmoqda, loading, workspace.loading.periods, workspace.periods.length, workspace.scope, workspace.sourceDocuments]);
  const exportGate = lrvPlusEksportGate(exportContext);
  const exportBlockReason = !exportGate.ok ? exportGate.reasons[0] : null;
  /* Texnik gate kodi (OBJECT_CONTEXT_REQUIRED…) foydalanuvchiga ko'rsatilmaydi — tushunarli sabab. */
  const SABAB_UZ: Record<string, string> = {
    COMPANY_CONTEXT_REQUIRED: 'kompaniya tanlanmagan',
    OBJECT_CONTEXT_REQUIRED: 'obyekt tanlanmagan',
    READ_MODEL_NOT_COMPLETE: 'smeta ma’lumoti hali to‘liq yuklanmadi — yangilab qayta urinib ko‘ring',
  };
  /* Eksport (va token yechish, f2HujjatKonteksti) faqat joriy kompaniyada TASDIQLANGAN obyekt uchun. */
  const eksportOk = Boolean(selected && obyektNom) && exportGate.ok;
  const eksportSababi = t(!selected || !obyektNom ? 'obyekt joriy kompaniya ro‘yxatida hali tasdiqlanmadi'
    : qoshimchaHolat === 'xato' ? 'qo‘shimcha/zamena belgilari o‘qilmadi — sahifani yangilang'
    : yangilanmoqda || !serverTasdiq || qoshimchaHolat === 'yuklanmoqda' ? 'smeta server bilan tekshirilmoqda — biroz kuting'
    : exportBlockReason ? (SABAB_UZ[exportBlockReason] ?? 'ma’lumot yetarli emas') : 'ma’lumot yetarli emas');

  /* Owner (2026-09-10): "test obyektim stella chiqmayapdi ... exellni yuklab
   * bo'lmas emish". Sahifa obyektni URL orqali ochadi ("Kanonik obyekt"),
   * lekin eksport gate'i TEPADAGI PTO scope'ning obyektiga qaraydi. Ikkisi
   * sinxron bo'lmagani uchun foydalanuvchi ochgan obyektida eksport
   * OBJECT_CONTEXT_REQUIRED bilan bloklanardi va u AYNAN O'SHA obyektni
   * tepadan qo'lda qayta tanlashi kerak edi. Scope setter'larining o'zi
   * kompaniya/loyiha chegarasini tekshiradi -- bu yerda hech qanday
   * ruxsat kengaytirilmaydi, faqat ochilgan obyekt bilan moslashtiriladi. */
  /* Navigatsiya oqimi: yuqoridagi (yagona) tanlovda obyekt bor, lekin sahifa obyektsiz ochilgan (/admin/holat) — sahifa
   * o'sha obyektni o'zi ochadi; «Obyektni tanlang» ikkinchi marta so'ralmaydi. */
  useEffect(() => {
    if (validId || !workspace.isProvider || workspace.scope.objectId == null || workspace.loading.hierarchy) return;
    navigate(`/admin/holat/${workspace.scope.objectId}${workspace.scopeSearch(workspace.scope.objectId)}`, { replace: true });
  }, [validId, workspace, navigate]);
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
    if (!selected || !obyektNom || !daraxtXom.length || !joriy?.id) return;
    if (!eksportOk) {
      setError(`${t('Excel eksporti hozir mumkin emas')}: ${eksportSababi}.`);
      return;
    }
    setEksportBolmoqda(true);
    try {
      const ctx = await f2HujjatKonteksti(joriy.id, obyektId);
      // Ustama/podval o'qilmasa LRV jimgina standart podval yoki ustamasiz chiqmaydi.
      if (ctx.xato) { setError(`LRV: ${ctx.xato} — hujjat tuzilmadi. Qayta urinib ko‘ring.`); return; }
      const qolda = Object.fromEntries(Object.entries(tomonlar).filter(([, x]) => typeof x === 'string' && x.trim()));
      const h = lrvHujjat(daraxtXom, holatXom, {
        obyektNom: obyektNom, davr: new Date().toISOString().slice(0, 10), imzo: { ...ctx.imzo, ...qolda }, shartnoma: ctx.shartnoma,
        ndsFoiz: NDS_SUKUT_FOIZ, nakrutka: ctx.nakrutka, podval: ctx.podval, nkManba: ctx.nkManba ?? null,
        svodYaxlit: ctx.svodYaxlit, yaxlitIdlar: yaxlitQatorIdlari(daraxtXom, ctx.svodYaxlit),
        avvalgiVersiya: avvalgi,
      });
      const xesh = await mazmunXeshi(h.bytes);
      const r = await tokenBilan({ kompaniyaId: joriy.id, amal: 'hujjat', birlikSoni: h.yacheykalar,
        meta: { hujjat: 'LRV', sabab: `ЛРВ · ${obyektNom}`.slice(0, 200), obyekt: obyektId, yacheyka: h.yacheykalar, xesh } }, async () => {
        if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
        return true;
      });
      if (!r.ok) toast(r.xabar, 'danger');
      else if (r.bepulTakror) toast('Bu hujjat avval to‘langan — qayta yuklash bepul', 'ok');
      else if (r.sarflandi) toast(`${r.sarflandi} token · ${Number(r.hisob?.yakuniy_som ?? 0).toLocaleString('ru-RU')} so‘m (${h.yacheykalar} yacheyka)`, 'ok');
    } catch {
      setError('Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, obyektNom, daraxtXom, holatXom, obyektId, joriy?.id, eksportOk, eksportSababi, tomonlar, korinish, avvalgi]);

  /* Egasi (2026-09-23): "tizim ostatka ishlarni ham bittada smeta shaklida bera
     oladigan bo'lishi kerak". Ostatka = smeta − fakt; hujjat — rasmiy
     "ВЕДОМОСТЬ ОСТАТКА РАБОТ" (hujjat standarti H1–H9): ichma-ich RZ, ИТОГО,
     oshib ketgan va noma'lum pozitsiyalar hujjatda ochiq ro'yxatda. */
  const ostatkaEksport = useCallback(async (korish = false) => {
    if (!selected || !obyektNom || !daraxtXom.length || !joriy?.id) return;
    if (!eksportOk) {
      setError(`${t('Excel eksporti hozir mumkin emas')}: ${eksportSababi}.`);
      return;
    }
    // Bajarilmaydigan/bekor qilingan ishlar — eng so'nggi holat bilan (jim yo'qotish yo'q).
    let istisnolar;
    try { istisnolar = await istisno.yangila(); } catch {
      setError('Ostatka: bekor qilingan ishlar ro‘yxati o‘qilmadi — hujjat tuzilmadi. Qayta urinib ko‘ring.');
      return;
    }
    setEksportBolmoqda(true);
    try {
      // Ustama/podval o'qilmasa - jim emas (lib/oylik-hujjat: sahifa va oylik paket bir xil yuklagich va quruvchidan foydalanadi).
      const u = await ustamaManbaOl(joriy.id, obyektId);
      if (!u.ok) { setError(`Ostatka: ${u.xato} — hujjat tuzilmadi. Qayta urinib ko‘ring.`); return; }
      const { model, fayl } = ostatkaHujjatQur({ rows: daraxtXom, states: holatXom, istisnolar, ustama: u.ustama, obyektNom, imzo: tomonlar });
      if (!fayl) {
        toast(`Ostatka yo‘q: barcha ishlar bajarilgan${model.oshibKetgan.length ? `, ${model.oshibKetgan.length} ta qatorda fakt smetadan oshgan` : ''}.`, 'warn');
        return;
      }
      const { bytes, faylNomi } = fayl;
      const t = await hujjatTokenBilan({ kompaniyaId: joriy.id, bytes, hujjat: 'OSTATKA', sabab: `Ведомость остатка · ${obyektNom}`, obyekt: obyektId },
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
  }, [selected, obyektNom, daraxtXom, holatXom, eksportOk, eksportSababi, tomonlar, istisno, obyektId, korinish, joriy?.id]);


  /* Egasi (2026-09-25): "slichitelniy vedomost ham yasay oladigan bo'lishi
     kerak". СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ: smeta ↔ fakt (↔ tasdiqlangan Ф-2) har
     pozitsiya bo'yicha, farq (+ ortiq / − kam) summasi bilan. Farqni faqat
     ko'rsatadi — hech narsani o'zgartirmaydi. */
  const slichitelniyEksport = useCallback(async (korish = false) => {
    if (!selected || !obyektNom || !daraxtXom.length || !joriy?.id) return;
    if (!eksportOk) {
      setError(`${t('Excel eksporti hozir mumkin emas')}: ${eksportSababi}.`);
      return;
    }
    let istisnolar;
    try { istisnolar = await istisno.yangila(); } catch {
      setError('Slichitelniy: bekor qilingan ishlar ro‘yxati o‘qilmadi — hujjat tuzilmadi. Qayta urinib ko‘ring.');
      return;
    }
    setEksportBolmoqda(true);
    try {
      const u = await ustamaManbaOl(joriy.id, obyektId);
      if (!u.ok) { setError(`Slichitelniy: ${u.xato} — hujjat tuzilmadi. Qayta urinib ko‘ring.`); return; }
      const { model, fayl } = slichitelniyHujjatQur({ rows: daraxtXom, states: holatXom, istisnolar, ustama: u.ustama, obyektNom, imzo: tomonlar, faqatFarq: slichFaqatFarq });
      if (!fayl) { toast(slichFaqatFarq ? 'Farq yo‘q: barcha pozitsiyalarda fakt smeta bilan teng.' : 'Solishtiriladigan pozitsiya yo‘q.', 'warn'); return; }
      const { bytes, faylNomi } = fayl;
      const t = await hujjatTokenBilan({ kompaniyaId: joriy.id, bytes, hujjat: 'SLICHITELNIY', sabab: `Сличительная ведомость · ${obyektNom}`, obyekt: obyektId },
        () => { if (korish) korinish.ochish(bytes, faylNomi); else downloadBlob(bytes, faylNomi); });
      if (!t.ok) { toast(t.xabar, 'danger'); return; }
      toast(`Slichitelniy: ${model.barglar} ta pozitsiya, ${model.ortiq} tasida smetadan ortiq, ${model.kam} tasida kam bajarilgan${model.diqqat.length ? `; ${model.diqqat.length} ta pozitsiyada ma’lumot yetishmaydi — jami bo‘sh qoldirildi` : ''}.${t.xabar ? ' ' + t.xabar : ''}`, model.diqqat.length ? 'warn' : 'ok');
    } catch {
      setError('Slichitelniy Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, obyektNom, daraxtXom, holatXom, eksportOk, eksportSababi, tomonlar, istisno, slichFaqatFarq, obyektId, korinish, joriy?.id]);

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
        <button type="button" onClick={onExcel} disabled={eksportBolmoqda || !eksportOk} title={eksportOk ? t(sarlavhaTitle) : `${t('Eksport hozir mumkin emas')}: ${eksportSababi}`} className="fz-btn fz-btn--sm">
          <FileSpreadsheet aria-hidden="true" /> {eksportBolmoqda ? t('Tuzilmoqda…') : tugma}
        </button>
        <button type="button" onClick={onKorish} disabled={eksportBolmoqda || !eksportOk} title={t(korishNomi)} aria-label={t(korishNomi)} className="fz-btn fz-btn--sm fz-btn--icon"><Eye aria-hidden="true" /></button>
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
        {selected && <ArxivTugma tur="obyekt" id={selected.id} nom={selected.nom} kichik={false} onDone={() => { workspace.setObjectId(null); workspace.refresh(); navigate('/admin/obyektlar'); }} />}
        {validId && <button type="button" onClick={() => navigate(`/admin/fakt?obyekt=${obyektId}`)} className="fz-btn fz-btn--primary"><Plus aria-hidden="true" />{t('Fakt kiritish')}</button>}
      </>}
    >
      {korinish.oyna}
      <div className="flex min-h-0 flex-col gap-3">
        {validId && <ObyektQadamlari obyektId={obyektId} />}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={() => navigate('/admin/obyektlar')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label="Obyektlarga qaytish" title={t('Obyektlarga qaytish')}><ArrowLeft aria-hidden="true" /></button>
          {validId && <div className="min-w-0 flex-1"><ObjectTrail companyId={joriy?.id ?? null} objectId={obyektId} /></div>}
          {yangilanmoqda && tree.length > 0 && <span role="status" className="text-[11px] text-text-mute">{t('Yangilanmoqda…')}</span>}
          {validId && selected && <div role="group" aria-label={t('Ko‘rinish rejimi')} data-testid="rejim-kaliti" className="ml-auto inline-flex overflow-hidden rounded-md border border-border bg-surface-2 p-0.5" style={{ gap: 2 }}>
            {([['daraxt', t('Daraxt')], ['varaq', t('Ish varag‘i')]] as const).map(([r, nom]) => <button key={r} type="button" aria-pressed={varaq === (r === 'varaq')} onClick={() => rejimQoy(r)} className="whitespace-nowrap rounded-[5px] px-3 text-[12.5px]"
              style={{ height: 28, cursor: 'pointer', border: 0, fontWeight: varaq === (r === 'varaq') ? 600 : 500, background: varaq === (r === 'varaq') ? 'var(--surface)' : 'transparent', color: varaq === (r === 'varaq') ? 'var(--accent-text)' : 'var(--text-dim)' }}>{nom}</button>)}
          </div>}
          {varaq && validId && <button type="button" className="fz-btn fz-btn--sm" aria-expanded={boshqaOchiq} onClick={() => setBoshqaOchiq((v) => !v)} data-testid="boshqa-tugma"><MoreHorizontal aria-hidden="true" />{t('Boshqa')}</button>}
          {!(workspace.isProvider && workspace.companyId != null) && <label className="ml-auto flex min-w-[240px] max-w-[420px] flex-1 items-center gap-2 text-[12px] font-medium text-text-dim">
            <span className="shrink-0">{t('Obyekt')}</span>
            <select value={validId ? String(obyektId) : ''} onChange={(e) => { const nextId = Number(e.target.value); if (Number.isSafeInteger(nextId) && nextId > 0) navigate(`/admin/holat/${nextId}${workspace.scopeSearch(nextId)}`); else { workspace.setObjectId(null); navigate('/admin/holat'); } }} className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border-strong)] bg-surface-2 px-2 text-[13px] text-text">
              <option value="">{t('-- obyektni tanlang --')}</option>
              <ObyektOptionlari obyektlar={obyektlar} />
            </select>
          </label>}
        </div>

        {/* Egasi (2026-11-05): «Keyingi qadam» murabbiyi — smeta → podval → fakt → F2 → tasdiqlash → portfel. */}
        {validId && selected && !varaq && <KeyingiQadamPanel obyektId={obyektId} smetaBor={loading || daraxtXato ? null : daraxtXom.length > 0} />}

        {exportsOpen && selected && <section className="fz-card" aria-label={t('Hujjatlar va eksport')}>
          <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}>
            <div>
              <h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Hujjatlar va eksport')}</h3>
              <p className="fz-card__sub">{t('Excel fayllar shu smetadan tuziladi; formulalar faylning o‘zida hisoblanadi.')}</p>
            </div>
            <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => setExportsOpen(false)} aria-label={t('Yopish')}><X aria-hidden="true" /></button>
          </div>
          <div className="px-4 py-1">
            {validId && tree.length > 0 && !eksportOk && (
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
                <summary className="cursor-pointer text-[13px] font-semibold text-text">{t('Bajarilgan, lekin F2 ga chiqmagan ish asosi')}</summary>
                <div className="mt-2">{joriy?.id != null && <ObosnovaniePanel kompaniyaId={joriy.id} obyektId={obyektId} obyektNomi={obyektNom} loyihaId={selected?.loyiha_id ?? null} obyektlar={obyektlar} qatorlar={daraxtXom} holatlar={holatXom} tomonlar={tomonlar} />}</div>
              </details>
              <details className="border-t border-border py-2.5">
                <summary className="cursor-pointer text-[12.5px] font-medium text-text-dim">{t('Hujjatlardagi imzo va tomonlar')}</summary>
                <div className="mt-2"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} tafsilot={imzoTafsilot} /></div>
              </details>
            </>) : <p className="py-3 text-[12.5px] text-text-mute">{t('Eksport uchun obyektda smeta qatorlari bo‘lishi kerak.')}</p>}
          </div>
        </section>}

        {!validId && (
          <div className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" /><span>{t('Havoladagi obyekt aniqlanmadi. Yuqoridan obyektni ro‘yxatdan tanlang.')}</span></div>
        )}
        {error && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div>}
        {eksportXato && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{eksportXato}</span></div>}
        {obyektXato && !selected && <div role="status" className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" /><span>{t(obyektXato)}</span></div>}
        {obyektBegona && <div role="status" className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" /><span>{t('Bu obyekt joriy kompaniya ro‘yxatida topilmadi. Yuqoridan obyektni tanlang.')}</span></div>}

        {loading && tree.length === 0 && <div className="skel min-h-[280px] flex-1 rounded-xl" />}
        {daraxtKorinadi && !loading && !error && tree.length === 0 && (
          <div className="fz-note fz-note--info items-center">
            <Info aria-hidden="true" />
            <span className="flex-1">{t('Bu obyektda hali smeta yuklanmagan. Smeta faylini yuklang — qatorlar shu yerda paydo bo‘ladi.')}</span>
            <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" onClick={() => setActiveTab('yuklash')}><Upload aria-hidden="true" />{t('Smeta yuklash')}</button>
          </div>
        )}
        {panellar && selected && (selected.qator_soni ?? 0) > 0 && <ObyektPodvalOgohi obyektId={selected.id} />}
        {panellar && selected && shartnomaTanlangan && <ObjectMoneySummary object={selected} />}

        {validId && panellar && <nav aria-label={t('Obyekt ish bo‘limlari')} className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
        {daraxtKorinadi && tree.length > 0 && activeTab === 'smeta' && panellar && <SmetaAnatomiya tree={tree} obyektId={obyektId} />}
        {daraxtKorinadi && tree.length > 0 && activeTab === 'smeta' && panellar && <MuhrFarqXulosa royxat={muhr.royxat} />}
        {daraxtKorinadi && !loading && !error && activeTab === 'smeta' && panellar && (
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
              {joriy?.id != null && <div className="mb-4 border-b border-border pb-3"><BajarilmadiPanel kompaniyaId={joriy.id} obyektId={obyektId} obyektNomi={obyektNom} qatorlar={daraxtXom} holatlar={holatXom} /></div>}
              <OstatkaIstisnoPanel obyektId={obyektId} qatorlar={daraxtXom} holatlar={holatXom} royxat={istisno.royxat} yangila={istisno.yangila} onSmetaOzgardi={() => void yuklash()} />
            </div>}
          </details>
        )}
        {varaq && daraxtKorinadi && !loading && !error && daraxtXom.length > 0 && joriy?.id != null && <IshVaraq key={`varaq:${joriy.id}|${obyektId}`} kompaniyaId={joriy.id} obyektId={obyektId} rows={daraxtXom} states={holatXom} holatniYangila={holatniYangila} />}
        {!varaq && daraxtKorinadi && tree.length > 0 && <div hidden={activeTab !== 'smeta'} className="h-[65vh] min-h-[420px] shrink-0"><SmetaTree data={tree} avvalgiVersiya={avvalgiTree} priceControlLines={priceControlLines} muhrFarq={muhr.xarita} onFaktOpen={() => navigate(`/admin/fakt?obyekt=${obyektId}`)} onQatorTahrirlandi={(qatorId) => void qatorniYangila(qatorId)} /></div>}
        {panellar && activeTab === 'shartnoma' && daraxtKorinadi && !loading && !error && <ContractScopePanel key={`${joriy?.id}:${obyektId}`} objectId={obyektId} lines={daraxtXom.map(q => ({ id: q.id, ota_id: q.ota_id, tur: q.tur, nom: q.nom ?? '', summa: q.summa, versiya: q.versiya }))} />}
        {panellar && activeTab === 'narx' && daraxtKorinadi && !loading && !error && <MarketPriceComparison lines={marketLines} objectId={obyektId} companyId={joriy?.id ?? null} />}

        {/* Yuklash ustasi import paytida yuklanish (loading) belgisi bilan UNMOUNT bo'lmaydi — aks holda natija ekrani yo'qolib, bo'sh «Fayl» bosqichiga qaytardi. */}
        {panellar && daraxtKorinadi && !error && (
          <div key={`${joriy?.id}|${obyektId}`} className="shrink-0 space-y-3" aria-label="LRV kundalik boshqaruv panellari">
            <section hidden={activeTab !== 'yuklash'} className="fz-card">
              <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}><h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Smeta XLSX yuklash')}</h3></div>
              {activeTab === 'yuklash' && <div className="p-4"><SmetaYuklaNative obyektId={obyektId} onImportlandi={yuklash}
                onSmetaOchish={() => setActiveTab('smeta')}
                onFaktgaOtish={() => navigate(`/admin/fakt?obyekt=${obyektId}`)}
                onVersiyaSaqla={(fayl) => { setVersiyaFayli(fayl); setActiveTab('versiya'); }} /></div>}
            </section>
            {/* PTO-CORE-001: tashqi smeta versiyasi (ekspertizagacha …) → farq → da'vo; joriy smeta o'zgarmaydi. */}
            {activeTab === 'versiya' && !loading && joriy?.id != null && (
              <section className="fz-card">
                <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}><h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Versiyalar va farq')}</h3></div>
                <div className="p-4"><SmetaVersiyaFarq kompaniyaId={joriy.id} obyektId={obyektId} obyektNom={obyektNom} joriyQatorlar={daraxtXom} tomonlar={tomonlar} boshlangichFayl={versiyaFayli} /></div>
              </section>
            )}
            <section hidden={activeTab !== 'resurs'} className="fz-card">
              <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}><h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Resurs vedomosti')}</h3></div>
              {activeTab === 'resurs' && !loading && <div className="p-4"><ResursVedomostNative obyektId={obyektId} /></div>}
            </section>
            <section hidden={activeTab !== 'narx'} className="fz-card">
              <div className="fz-card__head" style={{ minHeight: 44, padding: '8px 16px' }}><h3 className="fz-card__title" style={{ fontSize: 14, lineHeight: '20px' }}>{t('Narx nazorati')}</h3></div>
              {activeTab === 'narx' && !loading && <div className="p-4"><NarxNazoratNative obyektId={obyektId} /></div>}
            </section>
          </div>
        )}
      </div>
    </Sahifa>
  );
}

export default HolatNative;
