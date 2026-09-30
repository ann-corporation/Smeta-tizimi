import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Database, Eye, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { SmetaTree } from '../../umumiy/daraxt/SmetaTree';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt } from '../../api/supabase';
import { useT2Daraxt } from '../../umumiy/daraxt/useT2Daraxt';
import { lrvPlusEksportGate, lrvPlusFaylBaytlari, lrvPlusFaylNomi, lrvPlusYuklab, type LrvPlusExportContext, type LrvPlusRejim } from '../../lib/lrv-plus-export';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { sbFaktBelgilaV2, sbFaktYoz } from '../../api/t2-fakt';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { obyektPodvali } from '../../api/t2-nakrutka-podval';
import type { TreeNode } from '../../api/types';
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

/**
 * Kundalik ISHCHI SMETA/LRV sahifasi. Bu komponentda Sheet nomi, Drive
 * papkasi, `varaq` yoki `row` biznes identity sifatida ishlatilmaydi.
 * URL va barcha o'qishlar faqat `t2_obyekt.id` hamda `t2_qator.id` bilan.
 */
export function HolatNative() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
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
    loading, yangilanmoqda, error: daraxtXato, yuklash, holatniYangila,
  } = useT2Daraxt(validId ? obyektId : null);
  const error = sahifaXato || daraxtXato;
  const istisno = useOstatkaIstisnolari(validId ? obyektId : null);
  const selected = obyektlar.find((o) => o.id === obyektId) ?? null;
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
    if (!joriy?.id) { setObyektlar([]); return; }
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
    const objectProject = object.loyiha_id ?? null;
    if (workspace.scope.projectId !== objectProject) {
      workspace.setProjectId(objectProject);
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
  const eksportQil = useCallback(async (rejim: LrvPlusRejim, korish = false) => {
    if (!selected || !daraxtXom.length) return;
    if (!exportGate.ok) {
      setError(`Excel eksporti bloklandi: ${exportBlockReason || 'provenance/context yetarli emas'}.`);
      return;
    }
    setEksportBolmoqda(true);
    try {
      const nakr = await t2ObyektNakrutka(obyektId).catch(() => null);
      const bytes = await lrvPlusFaylBaytlari(daraxtXom, selected.nom, holatXom, {
        rejim,
        nakrutka: nakr?.ok ? nakr.koeffitsientlar : undefined,
        imzo: tomonlar,
      }, exportContext);
      if (korish) korinish.ochish(bytes, lrvPlusFaylNomi(selected.nom, rejim) + '.xlsx');
      else lrvPlusYuklab(bytes, selected.nom, rejim);
    } catch {
      setError('Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, daraxtXom, holatXom, obyektId, exportContext, exportGate.ok, exportBlockReason, tomonlar, korinish]);

  /* Egasi (2026-09-23): "tizim ostatka ishlarni ham bittada smeta shaklida bera
     oladigan bo'lishi kerak". Ostatka = smeta − fakt; hujjat — rasmiy
     "ВЕДОМОСТЬ ОСТАТКА РАБОТ" (hujjat standarti H1–H9): ichma-ich RZ, ИТОГО,
     oshib ketgan va noma'lum pozitsiyalar hujjatda ochiq ro'yxatda. */
  const ostatkaEksport = useCallback(async (korish = false) => {
    if (!selected || !daraxtXom.length) return;
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
      if (korish) korinish.ochish(bytes, faylNomi); else downloadBlob(bytes, faylNomi);
      const izoh = [
        model.oshibKetgan.length ? `${model.oshibKetgan.length} ta qatorda fakt smetadan oshgan — alohida ro‘yxatda` : '',
        model.diqqat.length ? `${model.diqqat.length} ta pozitsiya diqqat ro‘yxatida` : '',
        model.chiqarilgan.length ? `${model.chiqarilgan.length} ta ish ostatkadan chiqarilgan (asosi bilan alohida bo‘limda)` : '',
      ].filter(Boolean).join('; ');
      toast(`Ostatka: ${model.barglar} ta pozitsiya${model.jami != null ? `, jami ${model.jami.toLocaleString('ru-RU')} so‘m` : ''}.${izoh ? ' ' + izoh + '.' : ''}`, izoh ? 'warn' : 'ok');
    } catch {
      setError('Ostatka Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, daraxtXom, holatXom, exportGate.ok, exportBlockReason, tomonlar, istisno, obyektId, korinish]);


  /* Egasi (2026-09-25): "slichitelniy vedomost ham yasay oladigan bo'lishi
     kerak". СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ: smeta ↔ fakt (↔ tasdiqlangan Ф-2) har
     pozitsiya bo'yicha, farq (+ ortiq / − kam) summasi bilan. Farqni faqat
     ko'rsatadi — hech narsani o'zgartirmaydi. */
  const slichitelniyEksport = useCallback(async (korish = false) => {
    if (!selected || !daraxtXom.length) return;
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
      if (korish) korinish.ochish(bytes, faylNomi); else downloadBlob(bytes, faylNomi);
      toast(`Slichitelniy: ${model.barglar} ta pozitsiya, ${model.ortiq} tasida smetadan ortiq, ${model.kam} tasida kam bajarilgan${model.diqqat.length ? `; ${model.diqqat.length} ta pozitsiyada ma’lumot yetishmaydi — jami bo‘sh qoldirildi` : ''}.`, model.diqqat.length ? 'warn' : 'ok');
    } catch {
      setError('Slichitelniy Excel fayli tuzilmadi. Qayta urinib ko‘ring.');
    } finally { setEksportBolmoqda(false); }
  }, [selected, daraxtXom, holatXom, exportGate.ok, exportBlockReason, tomonlar, istisno, slichFaqatFarq, obyektId, korinish]);

  const smetaJami = tree.reduce((sum, n) => sum + (n.smeta || 0), 0);
  const faktJami = tree.reduce((sum, n) => sum + (n.stFakt || 0), 0);
  const f2Jami = tree.reduce((sum, n) => sum + (n.stF2 || 0), 0);

  const faktSaqlash = useCallback(async (node: TreeNode, mode: 'qoshish' | 'jami', value: number) => {
    if (!validId || node.id == null) return { ok: false, message: 'Kanonik qator ID topilmadi.' };
    const sana = new Date().toISOString().slice(0, 10);
    const operationId = yangiOperationId();
    if (mode === 'qoshish') {
      const result = await sbFaktYoz({
        obyektId,
        sana,
        operationId,
        qatorlar: [{ qator_id: node.id, hajm: value }],
        izoh: 'LRV ichidan kanonik Fakt qo‘shish',
      });
      if (!result.ok) return { ok: false, message: result.error || result.xabar || 'Fakt qo‘shilmadi.' };
    } else {
      const result = await sbFaktBelgilaV2({
        obyektId,
        qatorId: node.id,
        expectedFaktHajm: Number(node.fakt || 0),
        yangiFaktHajm: value,
        sana,
        operationId,
        izoh: 'LRV ichidan kanonik Fakt jami tahriri',
      });
      if (!result.ok) {
        const conflict = result.code === 'FAKT_CONFLICT';
        return { ok: false, conflict, message: conflict ? 'Qator serverda o‘zgargan. Yangilang va qayta urinib ko‘ring.' : (result.error || result.xabar || 'Fakt saqlanmadi.') };
      }
    }
    // Faqat shu qator, ota-bobolari va bolalari qayta o'qiladi; daraxt ekranda qoladi.
    await holatniYangila(node.id);
    return { ok: true };
  }, [obyektId, validId, holatniYangila]);

  return (
    <Sahifa sarlavha="Ishchi smeta / LRV" tavsif="Supabase kanonik qatorlari va tasdiqlangan F2 tarixi">
      {korinish.oyna}
      <div className="flex h-full min-h-0 flex-col gap-3">
        <section className="karta flex flex-wrap items-end gap-3 p-3">
          <button onClick={() => navigate('/admin/obyektlar')} className="rounded-lg border border-border p-2 text-text-dim hover:text-text" aria-label="Obyektlarga qaytish"><ArrowLeft size={17} /></button>
          <label className="min-w-[260px] flex-1 text-[12px] font-medium text-text">
            Kanonik obyekt
            <select value={validId ? String(obyektId) : ''} onChange={(e) => { const nextId = Number(e.target.value); const object = obyektlar.find((item) => item.id === nextId); if (Number.isSafeInteger(nextId) && nextId > 0) { workspace.setObjectId(nextId); navigate(`/admin/holat/${nextId}?obyekt=${nextId}&obyekt_nomi=${encodeURIComponent(object?.nom || '')}`); } else { workspace.setObjectId(null); navigate('/admin/holat'); } }} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text outline-none focus:border-accent">
              <option value="">-- obyektni tanlang --</option>
              {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
            </select>
          </label>
          <button onClick={() => void yuklash()} disabled={!validId || loading || yangilanmoqda} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-surface-2 disabled:opacity-40"><RefreshCw size={14} className={yangilanmoqda ? 'animate-spin' : undefined} /> Yangilash</button>
          {validId && tree.length > 0 && (<>
            <button onClick={() => void eksportQil('toliq')} disabled={eksportBolmoqda || !exportGate.ok}
              title={exportGate.ok ? "Excel'da: bl ОБЪЁМини o'zgartirsangiz, resurslar va summalar formula orqali avtomatik qayta hisoblanadi. Nakrutka kaskadi ham qo'shiladi." : `Eksport bloklangan: ${exportBlockReason}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-surface-2 disabled:opacity-40">
              <FileSpreadsheet size={14} /> {eksportBolmoqda ? 'Tuzilmoqda…' : 'LRV Excel'}
            </button>
            <button onClick={() => void eksportQil('toliq', true)} disabled={eksportBolmoqda || !exportGate.ok} title="LRV — saytda hujjatdagiday ko‘rish" aria-label="LRV ko‘rish"
              className="inline-flex items-center rounded-lg border border-border px-2 py-2 text-[12px] hover:bg-surface-2 disabled:opacity-40"><Eye size={14} /></button>
            <button onClick={() => void eksportQil('forma2')} disabled={eksportBolmoqda || !exportGate.ok}
              title={exportGate.ok ? "Forma-2 -- LRV'ning O ustunigacha bo'lgan qismi + nakrutka kaskadi. Buyurtmachiga tasdiqlash uchun yuboriladigan shakl." : `Eksport bloklangan: ${exportBlockReason}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-surface-2 disabled:opacity-40">
              <FileSpreadsheet size={14} /> {eksportBolmoqda ? 'Tuzilmoqda…' : 'Forma-2 Excel'}
            </button>
            <button onClick={() => void eksportQil('forma2', true)} disabled={eksportBolmoqda || !exportGate.ok} title="Forma-2 — saytda hujjatdagiday ko‘rish" aria-label="Forma-2 ko‘rish"
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
          {validId && tree.length > 0 && !exportGate.ok && (
            <span role="status" className="max-w-[280px] text-[11px] text-warn">
              Excel eksporti bloklangan: {exportBlockReason}. PTO scope’da loyiha, davr, source hujjat va revisionni tanlang.
            </span>
          )}
          {validId && <button onClick={() => navigate(`/admin/fakt?obyekt=${obyektId}`)} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white">Fakt kiritish</button>}
          {validId && tree.length > 0 && <div className="basis-full"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} /></div>}
        </section>

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
        {/* Ikki xil tahrir bir-birini to'ldiradi: `onFaktSave` — bajarilgan
            hajm (Fakt) uchun, `onQatorTahrirlandi` — smeta qatorining o'z
            maydonlari (nom/hajm/narx/birlik/kat) tahriridan keyin daraxtni
            qayta yuklash uchun. */}
        {tree.length > 0 && <div className="h-[65vh] min-h-[420px] shrink-0"><SmetaTree data={tree} priceControlLines={priceControlLines} onFaktSave={faktSaqlash} onQatorTahrirlandi={yuklash} /></div>}
        {selected && !loading && !error && (
          <div className="shrink-0 space-y-3" aria-label="LRV kundalik boshqaruv panellari">
            <details className="karta group p-3" open={ochiqPanel === 'smeta'} onToggle={(e) => setOchiqPanel(e.currentTarget.open ? 'smeta' : null)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-text">
                <span>Smeta XLSX yuklash</span><span className="text-[11px] font-normal text-text-mute group-open:hidden">ochish ▾</span><span className="hidden text-[11px] font-normal text-text-mute group-open:inline">yopish ▴</span>
              </summary>
              {ochiqPanel === 'smeta' && <div className="mt-3 max-h-[360px] overflow-auto"><SmetaYuklaNative obyektId={obyektId} onImportlandi={yuklash} /></div>}
            </details>
            <details className="karta group p-3" open={ochiqPanel === 'resurs'} onToggle={(e) => setOchiqPanel(e.currentTarget.open ? 'resurs' : null)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-text">
                <span>Resurs vedomosti</span><span className="text-[11px] font-normal text-text-mute group-open:hidden">ochish ▾</span><span className="hidden text-[11px] font-normal text-text-mute group-open:inline">yopish ▴</span>
              </summary>
              {ochiqPanel === 'resurs' && <div className="mt-3 max-h-[520px] overflow-auto"><ResursVedomostNative obyektId={obyektId} /></div>}
            </details>
            <details className="karta group p-3" open={ochiqPanel === 'istisno'} onToggle={(e) => setOchiqPanel(e.currentTarget.open ? 'istisno' : null)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-text">
                <span>Bajarilmaydigan / bekor qilingan ishlar{istisno.royxat.some((o) => o.holat === 'qoralama') ? ' • tasdiq kutilmoqda' : ''}</span><span className="text-[11px] font-normal text-text-mute group-open:hidden">ochish ▾</span><span className="hidden text-[11px] font-normal text-text-mute group-open:inline">yopish ▴</span>
              </summary>
              {ochiqPanel === 'istisno' && <div className="mt-3 max-h-[520px] overflow-auto">
                {istisno.xato && <p role="alert" className="mb-2 text-danger">{istisno.xato}</p>}
                <OstatkaIstisnoPanel obyektId={obyektId} qatorlar={daraxtXom} holatlar={holatXom} royxat={istisno.royxat} yangila={istisno.yangila} onSmetaOzgardi={() => void yuklash()} />
              </div>}
            </details>
            <details className="karta group p-3" open={ochiqPanel === 'narx'} onToggle={(e) => setOchiqPanel(e.currentTarget.open ? 'narx' : null)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-text">
                <span>Narx nazorati</span><span className="text-[11px] font-normal text-text-mute group-open:hidden">ochish ▾</span><span className="hidden text-[11px] font-normal text-text-mute group-open:inline">yopish ▴</span>
              </summary>
              {ochiqPanel === 'narx' && <div className="mt-3 max-h-[520px] overflow-auto"><NarxNazoratNative obyektId={obyektId} /></div>}
            </details>
          </div>
        )}
      </div>
    </Sahifa>
  );
}

export default HolatNative;
