import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { ContractScopePanel } from '../../components/contract-scope/ContractScopePanel';
import { ObjectMoneySummary } from '../../components/pto-workspace/ObjectMoneySummary';
import { ObjectTrail } from '../../components/pto-workspace/ObjectTrail';
import { MarketPriceComparison } from '../../components/smeta-studio-pro/MarketPriceComparison';
import { marketReadPrice } from '../../lib/smeta-studio/market-comparison';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Database, Eye, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { SmetaTree } from '../../umumiy/daraxt/SmetaTree';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { FmtN } from '../../lib/format';
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
  const [activeTab, setActiveTab] = useState(requestedPanel === 'smeta' ? 'yuklash' : 'smeta');
  const { joriy } = useKompaniya();
  const [tomonlar, setTomonlar] = useHujjatTomonlari(joriy?.id);
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
  /* Eksport FAKT/OSTATKA/F2 ustunlarini holatXom dan oladi -- daraxt qurish
     uchun allaqachon o'qilyapti, qayta so'rov yo'q. */
  const {
    rows: daraxtXom, states: holatXom, tree, price: priceControlLines,
    loading, yangilanmoqda, error: daraxtXato, yuklash,
  } = useT2Daraxt(validId ? obyektId : null);
  useEffect(() => { setOchiqPanel(null); setExportsOpen(false); setActiveTab(requestedPanel === 'smeta' ? 'yuklash' : 'smeta'); }, [obyektId, joriy?.id, requestedPanel]);
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
      setError(`Excel eksporti bloklandi: ${exportBlockReason || 'provenance/context yetarli emas'}.`);
      return;
    }
    setEksportBolmoqda(true);
    try {
      const ctx = await f2HujjatKonteksti(joriy.id, obyektId);
      const qolda = Object.fromEntries(Object.entries(tomonlar).filter(([, x]) => typeof x === 'string' && x.trim()));
      const h = lrvHujjat(daraxtXom, holatXom, {
        obyektNom: selected.nom, davr: new Date().toISOString().slice(0, 10), imzo: { ...ctx.imzo, ...qolda }, shartnoma: ctx.shartnoma,
        ndsFoiz: NDS_SUKUT_FOIZ, nakrutka: ctx.nakrutka, podval: ctx.podval,
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
  }, [selected, daraxtXom, holatXom, obyektId, joriy?.id, exportGate.ok, exportBlockReason, tomonlar, korinish]);

  /* Egasi (2026-09-23): "tizim ostatka ishlarni ham bittada smeta shaklida bera
     oladigan bo'lishi kerak". Ostatka = smeta − fakt; hujjat — rasmiy
     "ВЕДОМОСТЬ ОСТАТКА РАБОТ" (hujjat standarti H1–H9): ichma-ich RZ, ИТОГО,
     oshib ketgan va noma'lum pozitsiyalar hujjatda ochiq ro'yxatda. */
  const ostatkaEksport = useCallback(async (korish = false) => {
    if (!selected || !daraxtXom.length || !joriy?.id) return;
    if (!exportGate.ok) {
      setError(`Excel eksporti bloklandi: ${exportBlockReason || 'provenance/context yetarli emas'}.`);
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
      const { bytes, faylNomi } = ostatkaHujjatXlsx(model, { obyektNomi: selected.nom, imzo: tomonlar, nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval });
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
  }, [selected, daraxtXom, holatXom, exportGate.ok, exportBlockReason, tomonlar, istisno, obyektId, korinish, joriy?.id]);


  /* Egasi (2026-09-25): "slichitelniy vedomost ham yasay oladigan bo'lishi
     kerak". СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ: smeta ↔ fakt (↔ tasdiqlangan Ф-2) har
     pozitsiya bo'yicha, farq (+ ortiq / − kam) summasi bilan. Farqni faqat
     ko'rsatadi — hech narsani o'zgartirmaydi. */
  const slichitelniyEksport = useCallback(async (korish = false) => {
    if (!selected || !daraxtXom.length || !joriy?.id) return;
    if (!exportGate.ok) {
      setError(`Excel eksporti bloklandi: ${exportBlockReason || 'provenance/context yetarli emas'}.`);
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
      const { bytes, faylNomi } = slichitelniyHujjatXlsx(model, { obyektNomi: selected.nom, imzo: tomonlar, faqatFarq: slichFaqatFarq, istisnolar, nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval });
      const t = await hujjatTokenBilan({ kompaniyaId: joriy.id, bytes, hujjat: 'SLICHITELNIY', sabab: `Сличительная ведомость · ${selected.nom}`, obyekt: obyektId },
        () => { if (korish) korinish.ochish(bytes, faylNomi); else downloadBlob(bytes, faylNomi); });
      if (!t.ok) { toast(t.xabar, 'danger'); return; }
      toast(`Slichitelniy: ${model.barglar} ta pozitsiya, ${model.ortiq} tasida smetadan ortiq, ${model.kam} tasida kam bajarilgan${model.diqqat.length ? `; ${model.diqqat.length} ta pozitsiyada ma’lumot yetishmaydi — jami bo‘sh qoldirildi` : ''}.${t.xabar ? ' ' + t.xabar : ''}`, model.diqqat.length ? 'warn' : 'ok');
    } catch {
      setError('Slichitelniy Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, daraxtXom, holatXom, exportGate.ok, exportBlockReason, tomonlar, istisno, slichFaqatFarq, obyektId, korinish, joriy?.id]);

  const smetaJami = tree.reduce((sum, n) => sum + (n.smeta || 0), 0);
  const faktJami = tree.reduce((sum, n) => sum + (n.stFakt || 0), 0);
  const f2Jami = tree.reduce((sum, n) => sum + (n.stF2 || 0), 0);


  return (
    <Sahifa sarlavha="Obyekt ish joyi" tavsif="Smeta, bajarilgan ishlar va hujjatlar bir joyda">
      {korinish.oyna}
      <div className="flex min-h-0 flex-col gap-3">
        {validId && <ObjectTrail companyId={joriy?.id ?? null} objectId={obyektId} />}
        <section className="karta flex flex-wrap items-end gap-3 p-3">
          <button onClick={() => navigate('/admin/obyektlar')} className="rounded-lg border border-border p-2 text-text-dim hover:text-text" aria-label="Obyektlarga qaytish"><ArrowLeft size={17} /></button>
          <label className="min-w-[260px] flex-1 text-[12px] font-medium text-text">
            {t('Obyekt')}
            <select value={validId ? String(obyektId) : ''} onChange={(e) => { const nextId = Number(e.target.value); if (Number.isSafeInteger(nextId) && nextId > 0) navigate(`/admin/holat/${nextId}${workspace.scopeSearch(nextId)}`); else { workspace.setObjectId(null); navigate('/admin/holat'); } }} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text outline-none focus:border-accent">
              <option value="">-- obyektni tanlang --</option>
              <ObyektOptionlari obyektlar={obyektlar} />
            </select>
          </label>
          <button onClick={() => void yuklash()} disabled={!validId || loading || yangilanmoqda} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-surface-2 disabled:opacity-40"><RefreshCw size={14} className={yangilanmoqda ? 'animate-spin' : undefined} /> Yangilash</button>
          {validId && tree.length > 0 && !exportGate.ok && (
            <span role="status" className="max-w-[280px] text-[11px] text-warn">
              Excel eksporti bloklangan: {exportBlockReason}. PTO scope’da loyiha, davr, source hujjat va revisionni tanlang.
            </span>
          )}
          {selected && <button type="button" className="tugma" aria-expanded={exportsOpen} onClick={() => setExportsOpen(v => !v)}><FileSpreadsheet size={14}/>{t('Hujjatlar va eksport')}</button>}
          {validId && <button onClick={() => navigate(`/admin/fakt?obyekt=${obyektId}`)} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white">Fakt kiritish</button>}

        </section>

        {exportsOpen && selected && <section className="karta flex flex-wrap items-center gap-2 p-3" aria-label={t('Hujjatlar va eksport')}>
          {validId && tree.length > 0 && (<>
            <button onClick={() => void eksportQil(false)} disabled={eksportBolmoqda || !exportGate.ok}
              title={exportGate.ok ? t('ЛРВ: butun smeta Ф-2 shaklida — guruhlash, filtr, fakt / F2 / ostatka, resurs vedomosti va svod formulalarda') : `Eksport bloklangan: ${exportBlockReason}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-surface-2 disabled:opacity-40">
              <FileSpreadsheet size={14} /> {eksportBolmoqda ? 'Tuzilmoqda…' : 'LRV Excel'}
            </button>
            <button onClick={() => void eksportQil(true)} disabled={eksportBolmoqda || !exportGate.ok} title="LRV — saytda hujjatdagiday ko‘rish" aria-label="LRV ko‘rish"
              className="inline-flex items-center rounded-lg border border-border px-2 py-2 text-[12px] hover:bg-surface-2 disabled:opacity-40"><Eye size={14} /></button>
            <button onClick={() => void ostatkaEksport(false)} disabled={eksportBolmoqda || !exportGate.ok}
              title={exportGate.ok ? "ВЕДОМОСТЬ ОСТАТКА РАБОТ: bajarilmay qolgan ishlar (smeta − fakt) smeta shaklida, RZ ierarxiyasi, ИТОГО, imzolar." : `Eksport bloklangan: ${exportBlockReason}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-surface-2 disabled:opacity-40">
              <FileSpreadsheet size={14} /> {eksportBolmoqda ? 'Tuzilmoqda…' : 'Ostatka Excel'}
            </button>
            <button onClick={() => void ostatkaEksport(true)} disabled={eksportBolmoqda || !exportGate.ok} title="Ostatka — saytda hujjatdagiday ko‘rish" aria-label="Ostatka ko‘rish"
              className="inline-flex items-center rounded-lg border border-border px-2 py-2 text-[12px] hover:bg-surface-2 disabled:opacity-40"><Eye size={14} /></button>
            <button onClick={() => void slichitelniyEksport(false)} disabled={eksportBolmoqda || !exportGate.ok}
              title={exportGate.ok ? "СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ: smeta va haqiqatda bajarilgan hajm (va tasdiqlangan Ф-2) har pozitsiya bo'yicha, farq (+/−) summasi bilan, imzolar." : `Eksport bloklangan: ${exportBlockReason}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-surface-2 disabled:opacity-40">
              <FileSpreadsheet size={14} /> {eksportBolmoqda ? 'Tuzilmoqda…' : 'Slichitelniy Excel'}
            </button>
            <button onClick={() => void slichitelniyEksport(true)} disabled={eksportBolmoqda || !exportGate.ok} title="Slichitelniy — saytda hujjatdagiday ko‘rish" aria-label="Slichitelniy ko‘rish"
              className="inline-flex items-center rounded-lg border border-border px-2 py-2 text-[12px] hover:bg-surface-2 disabled:opacity-40"><Eye size={14} /></button>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-text-dim" title="Slichitelniy vedomostga faqat fakt smetadan farq qiladigan pozitsiyalar kirsin">
              <input type="checkbox" checked={slichFaqatFarq} onChange={(e) => setSlichFaqatFarq(e.target.checked)} /> faqat farqi borlar
            </label>
          </>)}
          {validId && tree.length > 0 && <div className="basis-full"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} /></div>}
        </section>}

        {!validId && (
          <section className="karta border-warn/40 bg-warn/5 p-4 text-[13px] text-text-dim">
            Eski matnli obyekt havolasi kanonik identity emas. Yuqoridan obyektni tanlang — sahifa keyin faqat raqamli `t2_obyekt.id` bilan ishlaydi.
          </section>
        )}
        {error && <section className="karta flex items-center gap-2 border-danger/40 bg-danger/5 p-4 text-[13px] text-danger"><AlertTriangle size={16} />{error}</section>}

        {loading && tree.length === 0 && <div className="skel min-h-[280px] flex-1 rounded-xl" />}
        {selected && !loading && !error && (
          <section className="karta flex flex-wrap gap-x-6 gap-y-1 p-3 text-[12px]">
            <span><Database size={13} className="mr-1 inline text-accent" />{selected.nom}</span>
            <span className="text-text-dim">Smeta: <b className="text-text"><FmtN val={smetaJami} /></b></span>
            <span className="text-text-dim">Fakt: <b className="text-text"><FmtN val={faktJami} /></b></span>
            <span className="text-text-dim">Tasdiqlangan F2: <b className="text-text"><FmtN val={f2Jami} /></b></span>
          </section>
        )}
        {validId && !loading && !error && tree.length === 0 && <section className="karta p-5 text-[13px] text-text-dim">Bu obyektda kanonik smeta qatorlari yo‘q.</section>}
        {selected && <ObjectMoneySummary object={selected} />}
        {validId && <nav aria-label={t('Obyekt ish bo‘limlari')} className="karta flex flex-wrap gap-2 p-2">
          {(['smeta', 'resurs', 'narx', 'yuklash', 'shartnoma'] as const).map(tab => <button type="button" key={tab} aria-pressed={activeTab === tab} className={`tugma ${activeTab === tab ? 'tugma-asosiy' : ''}`} onClick={() => setActiveTab(tab)}>{t(({smeta:'Smeta va bajarilish',resurs:'Resurslar',narx:'Narxlar nazorati',yuklash:'Smeta yuklash',shartnoma:'Shartnoma doirasi'})[tab])}</button>)}
          <button className="tugma ml-auto" onClick={() => navigate(`/admin/f2?obyekt=${obyektId}`)}>{t('F2 import')}</button>
          <button className="tugma" onClick={() => navigate(`/admin/nakopitelniy?obyekt=${obyektId}`)}>{t('Nakopitelniy va F3')}</button>
        </nav>}
        {selected && tree.length > 0 && <div hidden={activeTab !== 'smeta'} className="h-[65vh] min-h-[420px] shrink-0"><SmetaTree data={tree} priceControlLines={priceControlLines} onFaktOpen={() => navigate(`/admin/fakt?obyekt=${obyektId}`)} onQatorTahrirlandi={yuklash} /></div>}
        {activeTab === 'shartnoma' && selected && !loading && !error && <ContractScopePanel key={`${joriy?.id}:${obyektId}`} objectId={obyektId} lines={daraxtXom.map(q => ({ id: q.id, ota_id: q.ota_id, tur: q.tur, nom: q.nom ?? '', summa: q.summa, versiya: q.versiya }))} />}
        {activeTab === 'narx' && selected && validId && !loading && !error && <MarketPriceComparison lines={marketLines} objectId={obyektId} companyId={joriy?.id ?? null} />}


        {selected && !loading && !error && (
          <div key={`${joriy?.id}|${obyektId}`} className="shrink-0 space-y-3" aria-label="LRV kundalik boshqaruv panellari">
            <section hidden={activeTab !== 'yuklash'} className="karta group p-3">
              <h3 className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-text">
                <span>Smeta XLSX yuklash</span>
              </h3>
              {activeTab === 'yuklash' && <div className="mt-3 "><SmetaYuklaNative obyektId={obyektId} onImportlandi={yuklash} /></div>}
            </section>
            <section hidden={activeTab !== 'resurs'} className="karta group p-3">
              <h3 className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-text">
                <span>Resurs vedomosti</span>
              </h3>
              {activeTab === 'resurs' && <div className="mt-3 "><ResursVedomostNative obyektId={obyektId} /></div>}
            </section>
            <details hidden={activeTab !== 'smeta'} className="karta group p-3" open={ochiqPanel === 'istisno'} onToggle={(e) => setOchiqPanel(e.currentTarget.open ? 'istisno' : null)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-text">
                <span>Bajarilmaydigan / bekor qilingan ishlar{istisno.royxat.some((o) => o.holat === 'qoralama') ? ' • tasdiq kutilmoqda' : ''}</span><span className="text-[11px] font-normal text-text-mute group-open:hidden">ochish ▾</span><span className="hidden text-[11px] font-normal text-text-mute group-open:inline">yopish ▴</span>
              </summary>
              {ochiqPanel === 'istisno' && <div className="mt-3 max-h-[520px] overflow-auto">
                {istisno.xato && <p role="alert" className="mb-2 text-danger">{istisno.xato}</p>}
                {joriy?.id != null && <div className="mb-4 border-b border-border pb-3"><BajarilmadiPanel kompaniyaId={joriy.id} obyektId={obyektId} qatorlar={daraxtXom} holatlar={holatXom} /></div>}
                <OstatkaIstisnoPanel obyektId={obyektId} qatorlar={daraxtXom} holatlar={holatXom} royxat={istisno.royxat} yangila={istisno.yangila} onSmetaOzgardi={() => void yuklash()} />
              </div>}
            </details>
            <section hidden={activeTab !== 'narx'} className="karta group p-3">
              <h3 className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-text">
                <span>Narx nazorati</span>
              </h3>
              {activeTab === 'narx' && <div className="mt-3 "><NarxNazoratNative obyektId={obyektId} /></div>}
            </section>
          </div>
        )}
      </div>
    </Sahifa>
  );
}

export default HolatNative;
