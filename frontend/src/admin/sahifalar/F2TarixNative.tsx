import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { topshirilganPaketOgohi } from '../../lib/f2-oylik-paket/ogoh';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CheckCircle2, Download, Eye, FileText, Pencil, Calculator, RefreshCw, RotateCcw, ShieldAlert, Upload } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { F2HujjatKorinish } from '../../components/f2-hujjat/F2HujjatKorinish';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { rolF2YozishYopiq } from '../../lib/nav/menyuRolYopiq';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import {
  sbT2AktReestrOl, sbT2ObyektlarOlKomp, sbT2DaraxtOl,
  yangiOperationId, sbOqi, type T2AktReestr, type T2Obyekt,
} from '../../api/supabase';
import { sbT2F2TafsilotOl, type F2Tafsilot } from '../../api/t2-narx';
import { t2AktLifecycleTransition, type PtoLifecycleStatus } from '../../api/t2-akt-lifecycle';
import { f2HolatYorligi, f2KeyingiQadam, f2LifecyclePlan, f2LifecycleError, f2QadamTugmasi, f2TasdiqRejimi, type F2TasdiqRejimi } from '../../lib/f2-lifecycle-workflow';
import { f2Ierarxiya, type F2IerSmeta } from '../../lib/f2-ierarxiya';
import { T2_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import type { T2Qator } from '../../api/supabase';
import { f2AktKirish } from '../../lib/f2-akt-hujjat';
import { f2Hujjat } from '../../lib/f2-hujjat';
import { aktPodvallariniOl } from '../../api/t2-akt-podval';
import { aktPodvalXaritasi } from '../../lib/akt-podval';
import { f2AktTayyorla } from '../../lib/f2-akt-eksport';
import { f2HujjatKaliti, f2HujjatKonteksti } from '../../api/f2-hujjat-kontekst';
import { mazmunXeshi, tokenBilan } from '../../api/t2-token';
import { hujjatArxivla } from '../../api/t2-hujjat-arxiv';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { t, tilLocale } from '../../i18n/til';
import { ZakazchigaYuborish } from '../zakazchik/ZakazchigaYuborish';
import { f2ImportAktlari, f2ImportQilinganmi } from '../../lib/f2-manba';
import { f2BekorMumkin } from '../../lib/f2-bekor';
import { F2BekorOyna, type F2BekorOynaAkt } from './F2BekorOyna';
import { F2StornoOyna, type F2StornoAkt } from './F2StornoOyna';
import { stornoQilinadiAkt } from '../../lib/f2-storno';
import { F2PodvalBackfillOyna } from './F2PodvalBackfillOyna';
import { PereraschetOyna } from './PereraschetOyna';
import { useIxtiyoriyQueryClient } from '../../api/t2-obyektlar-kesh';
import { daraxtKaliti } from '../../umumiy/daraxt/useT2Daraxt';

type F2Detail = F2Tafsilot;

const holatMatni: Record<string, string> = {
  qoralama: 'Qoralama',
  tasdiqlangan: 'Tasdiqlangan',
  bekor: 'Bekor qilingan',
};

const pul = (line: F2Detail) => line.gorunish_summa ?? line.certified_amount ?? line.summa;

function xavfsizXato() {
  return 'F2 reestri yoki tafsiloti o‘qilmadi. Birozdan so‘ng qayta urinib ko‘ring.';
}

/**
 * F2 ning kundalik ko‘rib chiqish va tasdiqlash oynasi.
 *
 * Qoralama alohida ko‘rinadi, lekin LRV/Nakopitelniyga faqat tasdiqlangan
 * hujjat ta’sir qiladi. Qator summasi `gorunish_*` orqali read-modeldan
 * olinadi; bu komponentda qty*price hisoblanmaydi.
 */
export function F2TarixNative() {
  const { joriy, superadmin } = useKompaniya();
  /* Egasi (JQA-10): buxgalter F2 ni faqat o'qiydi — yozish tugmalari unga umuman ko'rinmaydi (lib/nav/menyuRolYopiq). */
  const f2YozishYopiq=!superadmin&&rolF2YozishYopiq(joriy?.rol);
  const mayApprove=!f2YozishYopiq&&(superadmin||!!joriy?.permissions?.includes('f2.approve'));
  const mayCancel=!f2YozishYopiq&&(superadmin||!!joriy?.permissions?.includes('f2.cancel'));
  const mayPrepare=!f2YozishYopiq&&(superadmin||!!joriy?.permissions?.includes('f2.prepare'));
  const workspace = usePTOWorkspace();
  /* Tasdiqlash rejimi (ADR-2): shaxsiy — «Yakunlash (shaxsiy)»; korporativ — har bosqich alohida, SoD bazada. */
  const [rejim, setRejim] = useState<F2TasdiqRejimi>('shaxsiy');
  const rejimKompaniya = workspace.companyId ?? joriy?.id ?? null;
  useEffect(() => {
    let faol = true;
    if (!rejimKompaniya) return;
    void (async () => {
      const r = await sbOqi<{ id: number; f2_tasdiq_rejimi?: string }>({ jadval: 't2_kompaniya', filtr: `id=eq.${rejimKompaniya}`, ustunlar: 'id,f2_tasdiq_rejimi', limit: 1 });
      if (faol) setRejim(f2TasdiqRejimi(r.ok ? r.qatorlar?.[0]?.f2_tasdiq_rejimi : null));
    })();
    return () => { faol = false; };
  }, [rejimKompaniya]);
  const [params, setParams] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [reestr, setReestr] = useState<T2AktReestr[]>([]);
  const [tafsilot, setTafsilot] = useState<F2Detail[]>([]);
  // Tanlangan akt F2 importdan (o'tgan davr fayli) kelganmi — unda «Zakazchikka yuborish» bo'lmaydi.
  const [importAkt, setImportAkt] = useState<{ id: number; import: boolean } | null>(null);
  /** Smeta daraxti — F2 qatorlari ierarxiyada (bo'lim → ish → resurs) ko'rsatiladi. */
  const [smeta, setSmeta] = useState<F2IerSmeta[]>([]);
  /** To'liq smeta qatorlari (norma, kat) — Ф-2 hujjatini qayta chiqarish uchun. */
  const [smetaRows, setSmetaRows] = useState<T2Qator[]>([]);
  const [chiqarilmoqda, setChiqarilmoqda] = useState(false);
  const korinish = useHujjatKorinish();
  const [selectedAktId, setSelectedAktId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [error, setError] = useState('');
  /** Bekor qilish uchun belgilangan aktlar (bitta obyekt) va ochiq tasdiq oynasi. */
  const [tanlangan, setTanlangan] = useState<ReadonlySet<number>>(new Set());
  const [bekorOyna, setBekorOyna] = useState<F2BekorOynaAkt[] | null>(null);
  /** Storno (minus) F2 yaratish oynasi: bitta manba akt. */
  const [stornoOyna, setStornoOyna] = useState<F2StornoAkt | null>(null);
  /** Bir tugmali pereraschet (podval → storno qoralama «fakt o'zgartirma» → F2 tayyorlash). */
  const [pereraschetOyna, setPereraschetOyna] = useState<F2StornoAkt | null>(null);
  /** F2 podvalini asl fayldan tiklash (backfill) oynasi. */
  const [podvalOyna, setPodvalOyna] = useState(false);
  const qc = useIxtiyoriyQueryClient();

  const obyektId = Number(params.get('obyekt'));
  const validId = Number.isSafeInteger(obyektId) && obyektId > 0;
  // Obyekt almashsa — belgilar va oyna tozalanadi (bir amal faqat bitta obyekt aktlari).
  useEffect(() => { setTanlangan(new Set()); setBekorOyna(null); setStornoOyna(null); }, [obyektId]);
  const f2Reestr = useMemo(() => reestr.filter((a) => a.tur === 'f2'), [reestr]);
  const selectedAkt = f2Reestr.find((a) => a.id === selectedAktId) ?? f2Reestr[0] ?? null;
  useEffect(() => {
    const id = selectedAkt?.id;
    if (id == null) return;
    let faol = true;
    void f2ImportQilinganmi(id).then((v) => { if (faol) setImportAkt({ id, import: v }); }).catch(() => { if (faol) setImportAkt({ id, import: false }); });
    return () => { faol = false; };
  }, [selectedAkt?.id]);
  /** Qoralama aktlardan qaysilari import orqali yaratilgan: bitta so'rov (null - hali o'qilmagan; xato - eski xulq: import sahifasi). */
  const [importSet, setImportSet] = useState<ReadonlySet<number> | 'xato' | null>(null);
  const qoralamaIdlar = useMemo(() => f2Reestr.filter((a) => a.holat === 'qoralama').map((a) => a.id), [f2Reestr]);
  useEffect(() => {
    if (!qoralamaIdlar.length) { setImportSet(new Set()); return; }
    let faol = true;
    setImportSet(null);
    void f2ImportAktlari(qoralamaIdlar).then((s) => { if (faol) setImportSet(s); }).catch(() => { if (faol) setImportSet('xato'); });
    return () => { faol = false; };
  }, [qoralamaIdlar]);
  const selectedLines = useMemo(
    () => selectedAkt ? tafsilot.filter((line) => line.akt_id === selectedAkt.id) : [],
    [selectedAkt, tafsilot],
  );
  const ierarxiya = useMemo(() => f2Ierarxiya(selectedLines, smeta, pul), [selectedLines, smeta]);
  const selectedArithmeticIssues = useMemo(() => selectedLines.filter((line) => {
    const quantity = line.gorunish_hajm ?? line.certified_quantity ?? line.hajm;
    const unitPrice = line.gorunish_narx ?? line.certified_unit_price ?? line.narx;
    const amount = line.gorunish_summa ?? line.certified_amount ?? line.summa;
    return quantity != null && unitPrice != null && amount != null && Number.isFinite(Number(quantity)) && Number.isFinite(Number(unitPrice)) && Number.isFinite(Number(amount)) && Math.abs(Number(quantity) * Number(unitPrice) - Number(amount)) > 0.005;
  }), [selectedLines]);

  useEffect(() => {
    if (!joriy?.id) { setObyektlar([]); return; }
    void sbT2ObyektlarOlKomp(joriy.id).then((r) => {
      setObyektlar((r.ok ? r.qatorlar : []) as T2Obyekt[]);
    });
  }, [joriy?.id]);

  /** Each load is numbered; a response for an object the user already left is discarded, never shown under the new one. */
  const sorov = useRef(0);
  const yuklash = useCallback(async () => {
    const raqam = ++sorov.current;
    if (!validId) { setReestr([]); setTafsilot([]); setSmeta([]); setSmetaRows([]); setSelectedAktId(null); return; }
    setLoading(true); setError('');
    try {
      const [r, d, t] = await Promise.all([
        sbT2AktReestrOl(obyektId),
        sbT2F2TafsilotOl({ obyektId, tur: 'f2' }),
        sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI),
      ]);
      if (raqam !== sorov.current) return;
      setSmeta(t.ok ? ((t.qatorlar || []) as unknown as F2IerSmeta[]) : []);
      setSmetaRows(t.ok ? ((t.qatorlar || []) as unknown as T2Qator[]) : []);
      if (!r.ok) throw new Error(xavfsizXato());
      setReestr((r.qatorlar || []) as T2AktReestr[]);
      if (!d.ok) throw new Error(xavfsizXato());
      setTafsilot((d.qatorlar || []) as F2Detail[]);
      setSelectedAktId((old) => {
        const available = ((r.qatorlar || []) as T2AktReestr[]).filter((a) => a.tur === 'f2');
        return old && available.some((a) => a.id === old) ? old : (available[0]?.id ?? null);
      });
    } catch (e) {
      if (raqam !== sorov.current) return;
      setReestr([]); setTafsilot([]); setSelectedAktId(null);
      setError(e instanceof Error && e.message === xavfsizXato() ? e.message : xavfsizXato());
    } finally { if (raqam === sorov.current) setLoading(false); }
  }, [obyektId, validId]);

  useEffect(() => { void yuklash(); }, [yuklash]);

  async function holatniOzgartir(akt: T2AktReestr, statuses: readonly ('submitted' | 'checked' | 'approved' | 'rejected' | 'cancelled')[], reason?: string, birQadam = false) {
    if (akt.holat !== 'qoralama' || savingId != null) return;
    if ((statuses.includes('cancelled')&&!mayCancel)||(statuses.some(s=>s==='checked'||s==='approved'||s==='rejected')&&!mayApprove)) {toast('Bu amal uchun individual ruxsatingiz yo‘q.','danger');return;}
    const sabab = reason?.trim() || null;
    if (statuses.includes('rejected') || statuses.includes('cancelled')) {
      if (!sabab) { toast('Rad etish/bekor qilish sababi majburiy.', 'danger'); return; }
    }
    setSavingId(akt.id); setError('');
    try {
      const kompaniyaId = workspace.companyId ?? joriy?.id;
      if (!kompaniyaId) { toast('Faol kompaniya tanlanmagan.', 'danger'); return; }
      const live = await sbOqi<{ id: number; versiya: number; lifecycle_status: PtoLifecycleStatus }>({
        jadval: 't2_akt', filtr: `id=eq.${akt.id}&kompaniya_id=eq.${kompaniyaId}&obyekt_id=eq.${obyektId}`,
        ustunlar: 'id,versiya,lifecycle_status', limit: 1,
      });
      const current = live.ok ? live.qatorlar?.[0] : null;
      if (!current) { toast('Hujjatning joriy holatini tekshirib bo‘lmadi. Sahifani yangilang.', 'danger'); return; }
      const target = statuses.at(-1);
      if (target === 'approved') await topshirilganPaketOgohi(obyektId, String((akt as { oy?: string | null }).oy ?? '')); // tasdiqlash topshirilgan paketga kirmaydi - ogohlantirish
      /* Korporativ rejim: faqat keyingi BITTA bosqich (yuborish / tekshirish / tasdiqlash) — har birini boshqa xodim bajaradi. */
      const plan = birQadam
        ? (target != null && f2KeyingiQadam(current.lifecycle_status) === target ? [target] : null)
        : (target === 'approved' || target === 'rejected' || target === 'cancelled' ? f2LifecyclePlan(current.lifecycle_status, target) : null);
      if (plan === null) { toast('Bu hujjatning joriy holatida ushbu amal bajarilmaydi.', 'danger'); return; }
      let expectedVersion = current.versiya;
      for (const toStatus of plan) {
        const result = await t2AktLifecycleTransition({
          kompaniyaId,
          aktId: akt.id,
          toStatus,
          expectedVersion,
          operationId: yangiOperationId(),
          reason: sabab,
        });
        if (!result.ok) {
          toast(f2LifecycleError(result.code), 'danger', undefined, 9000);
          return;
        }
        expectedVersion = result.version ?? expectedVersion + 1;
      }
      toast(statuses.at(-1) === 'approved'
        ? (rejim === 'shaxsiy' ? t('F2 yakunlandi (shaxsiy); LRV va Nakopitelniy yangilanadi.') : t('F2 tasdiqlandi; LRV va Nakopitelniy yangilanadi.'))
        : t('F2 holati saqlandi.'), 'ok');
      setActionReason('');
    } catch {
      toast('F2 tasdiqlash javobi olinmadi. Shu hujjatni qayta yubormang; avval yangilang.', 'danger', undefined, 9000);
    } finally { await yuklash(); setSavingId(null); }
  }

  /* Egasi (2026-10-02): tasdiqlangan F2 ham yangi Ф-2 shablonida chiqadi. Sertifikatlangan raqamlar aynan
   * (lib/f2-akt-hujjat). Token: bitta F2 (obyekt + oy + raqam) uchun bir marta — qayta chiqarish bepul. */
  async function hujjatChiqar(akt: T2AktReestr, korish: boolean) {
    const kompaniyaId = workspace.companyId ?? joriy?.id;
    if (!kompaniyaId || chiqarilmoqda) return;
    const object = obyektlar.find((o) => o.id === obyektId);
    setChiqarilmoqda(true);
    try {
      if (!f2AktKirish(smetaRows, selectedLines).qatorlar.length) { toast('Bu hujjatda chiqariladigan qator yo‘q.', 'danger'); return; }
      const ctx = await f2HujjatKonteksti(kompaniyaId, obyektId);
      // Ustama/podval o'qilmasa F2 hujjati jimgina standart podval yoki ustamasiz chiqmaydi.
      if (ctx.xato) { toast(`F2 hujjati tuzilmadi: ${ctx.xato}`, 'danger'); return; }
      // F2 hujjati O'Z podvali bilan (egasi 2026-11-03): podval/qator o'qilmasa jim smeta podvaliga o'tilmaydi.
      const [pv, aq] = await Promise.all([
        aktPodvallariniOl(obyektId),
        sbOqi<{ qator_id: number; hajm: number | null; certified_quantity: number | null; certified_unit_price: number | null; certified_amount: number | null; raw_snapshot: unknown }>({
          jadval: 't2_akt_qator', filtr: `akt_id=eq.${akt.id}&obyekt_id=eq.${obyektId}`, ustunlar: 'qator_id,hajm,certified_quantity,certified_unit_price,certified_amount,raw_snapshot', limit: 50000 }),
      ]);
      if (!pv.ok || !aq.ok) { toast(`F2 hujjati tuzilmadi: ${t('hujjat podvali o‘qilmadi')}`, 'danger'); return; }
      // Yagona tayyorlash (lib/f2-akt-eksport): F2 portfeli ham aynan shu yo'ldan foydalanadi.
      const k = f2AktTayyorla({ smeta: smetaRows, lines: selectedLines, aktQatorlar: aq.qatorlar ?? [], podvallar: aktPodvalXaritasi(pv.podvallar), kontekst: ctx,
        akt: { id: akt.id, oy: akt.oy, raqam: akt.raqam }, obyektNom: object?.nom || '', raqamlar: new Map(f2Reestr.map((a) => [a.id, a.raqam ?? null] as const)) });
      if (!k) { toast('Bu hujjatda chiqariladigan qator yo‘q.', 'danger'); return; }
      if (k.topilmagan) toast(t('{n} ta qator smetada topilmadi — hujjatga kirmadi', { n: k.topilmagan }), 'warn');
      const h = f2Hujjat(k.bolimlar, k.qatorlar, k.opsiya);
      const xesh = f2HujjatKaliti(obyektId, akt.oy || '', akt.raqam) ?? `akt:${akt.id}:${await mazmunXeshi(h.bytes)}`;
      const r = await tokenBilan({ kompaniyaId, amal: 'f2_hujjat', birlikSoni: h.yacheykalar,
        meta: { hujjat: 'F2', sabab: `F2 №${akt.raqam || '—'} · ${object?.nom || ''} · ${(akt.oy || '').slice(0, 7)}`.slice(0, 200), obyekt: obyektId, akt: akt.id, yacheyka: h.yacheykalar, xesh } }, async () => {
        if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
        return true;
      });
      if (!r.ok) toast(r.xabar, 'danger');
      else if (r.bepulTakror) toast('Bu hujjat avval to‘langan — qayta yuklash bepul', 'ok');
      else toast(`${r.sarflandi} token · ${Number(r.hisob?.yakuniy_som ?? 0).toLocaleString('ru-RU')} so‘m (${h.yacheykalar} yacheyka)`, 'ok');
      // Tasdiqlangan F2 — R2 arxivga o'zgarmas versiya (bir xil mazmun qayta saqlanmaydi). Hujjat berishni to'xtatmaydi.
      if (r.ok && akt.holat === 'tasdiqlangan') {
        void hujjatArxivla({ kompaniyaId, obyektId, turi: 'f2_hujjat', faylNomi: h.faylNomi, bytes: h.bytes, davr: (akt.oy || '').slice(0, 7) })
          .then((a) => { if (!a.ok) toast('Hujjat arxivga saqlanmadi — keyinroq qayta chiqaring.', 'warn'); else if (!a.takror) toast(`Arxivga saqlandi (v${a.versiya})`, 'ok'); });
      }
    } catch { toast('Ф-2 hujjatini yaratib bo‘lmadi.', 'danger'); }
    finally { setChiqarilmoqda(false); }
  }

  /** Shaxsiy: bitta bosishda yakunlash. Korporativ: faqat keyingi bosqich (SoD bazada tekshiriladi). */
  async function tasdiqlash(akt: T2AktReestr) {
    if (rejim === 'shaxsiy') { await holatniOzgartir(akt, ['submitted', 'checked', 'approved']); return; }
    const q = akt.lifecycle_status ? f2KeyingiQadam(akt.lifecycle_status) : null;
    if (q) await holatniOzgartir(akt, [q], undefined, true);
  }
  /** Ro'yxatdagi tugma: rejim va joriy bosqichga qarab (yo'q bo'lsa — ko'rsatilmaydi). */
  const tugmaMatni = (akt: T2AktReestr) => f2QadamTugmasi(rejim, akt.lifecycle_status ?? 'draft');
  const tugmaRuxsat = (akt: T2AktReestr) => rejim === 'korporativ' && f2KeyingiQadam(akt.lifecycle_status ?? 'draft') === 'submitted' ? true : mayApprove;
  const holatYorligi = (akt: T2AktReestr) => (akt.lifecycle_status ? f2HolatYorligi(akt.lifecycle_status, rejim) : holatMatni[akt.holat]) || 'Noma’lum holat';

  const obyektNom = obyektlar.find((o) => o.id === obyektId)?.nom || '';
  const smetaHajm = useMemo(() => new Map(smetaRows.map((r) => [r.id, r.hajm == null ? null : Number(r.hajm)] as const)), [smetaRows]);
  const statusOf = (akt: T2AktReestr): PtoLifecycleStatus => akt.lifecycle_status ?? (akt.holat === 'tasdiqlangan' ? 'approved' : akt.holat === 'bekor' ? 'cancelled' : 'draft');
  /** Bekor qilish ruxsati: f2.cancel; tasdiqlangan F2 uchun qo'shimcha f2.approve (server ham tekshiradi). */
  const bekorMumkin = (akt: T2AktReestr) => !f2YozishYopiq && f2BekorMumkin(statusOf(akt), { mayCancel, mayApprove });
  const bekorAkt = (akt: T2AktReestr): F2BekorOynaAkt => ({ id: akt.id, versiya: akt.versiya, lifecycle_status: statusOf(akt),
    raqam: akt.raqam, oy: akt.oy, hujjat_jami: akt.hujjat_jami, qator_soni: akt.qator_soni });
  const tanlanganAktlar = f2Reestr.filter((a) => tanlangan.has(a.id) && bekorMumkin(a));
  const belgila = (id: number, on: boolean) => setTanlangan((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  /** Bekor qilingandan keyin: daraxt (LRV/fakt) keshi va obyektlar ro'yxati eskirgan — tashlanadi, reestr qayta o'qiladi. */
  /** Storno yaratilgandan keyin: LRV/qoldiq keshi eskirdi (fakt 0 ga tushdi), reestr qayta o'qiladi, yangi qoralama tanlanadi. */
  async function stornoTugadi(yangiAktId: number) {
    qc?.removeQueries({ queryKey: daraxtKaliti(obyektId) });
    void qc?.invalidateQueries({ queryKey: ['t2-obyektlar'] });
    toast(t('Storno qoralamasi yaratildi. Tasdiqlash — shu sahifada; yangi pozitsiyalarni «F2 tayyorlash»da shu qoralama ostiga qo‘shing.'), 'ok');
    setStornoOyna(null);
    await yuklash();
    setSelectedAktId(yangiAktId);
  }
  async function bekorTugadi(n: { bajarildi: number[]; xato: unknown }) {
    if (n.bajarildi.length) {
      qc?.removeQueries({ queryKey: daraxtKaliti(obyektId) });
      void qc?.invalidateQueries({ queryKey: ['t2-obyektlar'] });
      toast(t('{n} ta F2 bekor qilindi — LRV, qoldiq va Nakopitelniy yangilanadi.', { n: n.bajarildi.length }), 'ok');
      setTanlangan(new Set());
      await yuklash();
    }
    // Xatoda oyna ochiq qoladi (xabar ko'rinadi) — faqat hali bekor qilinmaganlar bilan.
    if (!n.xato) setBekorOyna(null);
    else setBekorOyna((s) => s?.filter((a) => !n.bajarildi.includes(a.id)) ?? null);
  }
  const stampCls = (s: PtoLifecycleStatus) => ({ draft: 'fz-stamp--draft', submitted: 'fz-stamp--info', checked: 'fz-stamp--info', approved: 'fz-stamp--ok', rejected: 'fz-stamp--danger', cancelled: 'fz-stamp--danger', superseded: '' } as const)[s];

  /** Qoralamani tahrirlash havolalari: import orqali yaratilgan — import oynasi; tizimda yaratilgan — F2 tayyorlash. */
  const tahrirHavolalari = (akt: T2AktReestr) => !f2YozishYopiq && akt.holat === 'qoralama' && (akt.lifecycle_status ?? 'draft') === 'draft' && importSet !== null && (importSet === 'xato' || importSet.has(akt.id)
    ? <Link className="fz-btn fz-btn--sm" to={`/admin/f2?obyekt=${obyektId}&akt=${akt.id}`} title={t('Import oynasida qayta ochib, xato joylarini tuzatish')}><Pencil />{t('Tahrirlash')}</Link>
    : <><Link className="fz-btn fz-btn--sm" to={`/admin/f2-tayyorlash?obyekt=${obyektId}&akt=${akt.id}`} title={t('F2 tayyorlashda ochib, hajm va narxni yangilash')}><Pencil />{t('Tizimda tahrirlash')}</Link><Link className="fz-btn fz-btn--sm fz-btn--ghost" to={`/admin/f2?obyekt=${obyektId}&akt=${akt.id}`} title={t('Yangi (tuzatilgan) Excel faylni shu qoralamaga yuklash')}><Upload />{t('Fayldan yangilash')}</Link></>);

  return (
    <>{korinish.oyna}
    {bekorOyna && (workspace.companyId ?? joriy?.id) && <F2BekorOyna kompaniyaId={(workspace.companyId ?? joriy?.id) as number} aktlar={bekorOyna}
      onYop={() => setBekorOyna(null)} onTugadi={(n) => void bekorTugadi(n)} />}
    {podvalOyna && (workspace.companyId ?? joriy?.id) && <F2PodvalBackfillOyna obyektId={obyektId} kompaniyaId={(workspace.companyId ?? joriy?.id) as number} onYop={() => setPodvalOyna(false)} onTugadi={() => void yuklash()} />}
    {pereraschetOyna && <PereraschetOyna obyektId={obyektId} kompaniyaId={workspace.companyId ?? joriy?.id ?? null} akt={pereraschetOyna} reestr={f2Reestr} onYop={() => setPereraschetOyna(null)} />}
      {stornoOyna && <F2StornoOyna obyektId={obyektId} akt={stornoOyna} reestr={f2Reestr} onYop={() => setStornoOyna(null)} onTugadi={(id) => void stornoTugadi(id)} />}
    <Sahifa
      sarlavha="F2 tarixi va tasdiqlash"
      tavsif="Qoralama ko‘rib chiqiladi; faqat tasdiqlangan aniq manba LRV va Nakopitelniyga kiradi"
      amallar={<button type="button" onClick={() => void yuklash()} disabled={!validId || loading} className="fz-btn fz-btn--ghost"><RefreshCw className={loading ? 'animate-spin' : ''} /> {t('Yangilash')}</button>}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <section className="fz-card flex flex-wrap items-end gap-3 p-3">
          <label className="min-w-[280px] flex-1 text-[12px] font-medium text-text-dim">{t('Obyekt')}
            <select aria-label="Kanonik obyekt" value={validId ? String(obyektId) : ''} onChange={(e) => { const nextId = Number(e.target.value); const id = Number.isSafeInteger(nextId) && nextId > 0 ? nextId : null; if (workspace.isProvider) workspace.setObjectId(id); else setParams(id ? { obyekt: String(id) } : {}); }} className="mt-1.5 block w-full">
              <option value="">-- obyektni tanlang --</option>
              <ObyektOptionlari obyektlar={obyektlar} />
            </select>
          </label>
          <div className="flex gap-2 text-[12px] text-text-dim"><span className="fz-chip">{t('{n} ta F2', { n: f2Reestr.length })}</span><span className="fz-chip fz-chip--accent">{t('{n} tasi tasdiqlangan', { n: f2Reestr.filter((a) => a.holat === 'tasdiqlangan').length })}</span></div>
          {validId && mayPrepare && <button type="button" data-testid="podval-backfill-tugma" className="fz-btn fz-btn--ghost" title={t('Tasdiqlangan F2 ning asl faylidan faqat podvalni o‘qib, akt bilan moslaydi')} onClick={() => setPodvalOyna(true)}><Upload />{t('F2 podvalini fayldan tiklash')}</button>}
          {tanlanganAktlar.length > 0 && <button type="button" className="fz-btn fz-btn--danger" onClick={() => setBekorOyna(tanlanganAktlar.map(bekorAkt))}><Ban />{t('Tanlanganlarni bekor qilish ({n})', { n: tanlanganAktlar.length })}</button>}
        </section>

        {!validId && <section className="fz-note fz-note--info"><FileText /> {t('Avval obyektni tanlang — uning barcha F2 hujjatlari shu yerda ko‘rinadi.')}</section>}
        {error && <section role="alert" className="fz-note fz-note--danger"><ShieldAlert /> {error}</section>}
        {loading && <div className="skel min-h-[280px] flex-1 rounded-xl" />}

        {validId && !loading && !error && (
          <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
            <section className="fz-card min-h-0 overflow-auto" aria-label={t('F2 hujjatlari')}>
              <div className="fz-list">
                {f2Reestr.map((akt) => {
                  const active = (selectedAkt?.id ?? null) === akt.id;
                  const st = statusOf(akt);
                  return (
                    <div key={akt.id} className="flex items-start">
                    {bekorMumkin(akt) && <input type="checkbox" className="ml-2 mt-3 shrink-0" aria-label={t('F2 №{r} ni bekor qilish uchun tanlash', { r: akt.raqam || String(akt.id) })}
                      checked={tanlangan.has(akt.id)} onChange={(e) => belgila(akt.id, e.target.checked)} />}
                    <button type="button" className="fz-list__q min-w-0 flex-1" aria-current={active} onClick={() => setSelectedAktId(akt.id)}>
                      <span className="min-w-0">
                        <span className="fz-list__nom block truncate">{davrNomi(akt.oy, tilLocale()) || t('Davr noma’lum')}</span>
                        <span className="fz-list__sub">№ {akt.raqam || '—'} · {t('{n} qator', { n: akt.qator_soni ?? '—' })}</span>
                      </span>
                      <span className="fz-list__sum" title={t('ustamasiz, NDS siz — ustamali summa hujjat ichida')}><FmtN val={akt.hujjat_jami} kasr={0} /></span>
                      <span className="fz-list__sub" style={{ gridColumn: '1 / -1' }}>
                        <span className={`fz-stamp ${stampCls(st)}`}>{t(holatYorligi(akt))}</span>
                        {!!akt.narxsiz_qator && <span className="fz-chip fz-chip--warn">{t('{n} narxsiz', { n: akt.narxsiz_qator })}</span>}
                        {!!akt.manfiy_qator && <span className="fz-chip fz-chip--warn">{t('{n} manfiy', { n: akt.manfiy_qator })}</span>}
                        {akt.reestr_holat === 'farq' && <span className="fz-chip fz-chip--danger">{t('jami farqi')}</span>}
                        {akt.reestr_holat === 'jami_nomalum' && <span className="fz-chip">{t('jami noma’lum')}</span>}
                      </span>
                    </button>
                    </div>
                  );
                })}
                {f2Reestr.length === 0 && <div className="p-5 text-[13px] text-text-dim">{t('Bu obyektda F2 hujjati hali yo‘q.')}</div>}
              </div>
            </section>

            <section className="min-h-0 overflow-auto">
              {selectedAkt ? (
                <F2HujjatKorinish
                  akt={selectedAkt} status={statusOf(selectedAkt)} rejim={rejim} holatYorligi={holatYorligi(selectedAkt)}
                  obyektId={obyektId} obyektNom={obyektNom}
                  lines={selectedLines} barchaQatorlar={tafsilot} aktlar={f2Reestr} ierarxiya={ierarxiya} smetaHajm={smetaHajm}
                  amallar={<>
                    {!f2YozishYopiq && selectedAkt.holat === 'qoralama' && tugmaMatni(selectedAkt) && <button type="button" title={tugmaRuxsat(selectedAkt) ? (rejim === 'korporativ' ? t('Har bosqichni boshqa xodim bajaradi (tayyorlovchi ≠ tekshiruvchi ≠ tasdiqlovchi)') : '') : t('F2 tasdiqlash ruxsati berilmagan')} onClick={() => void tasdiqlash(selectedAkt)} disabled={savingId != null || !tugmaRuxsat(selectedAkt)} className="fz-btn fz-btn--primary"><CheckCircle2 />{savingId === selectedAkt.id ? '…' : t(tugmaMatni(selectedAkt) ?? '')}</button>}
                    {tahrirHavolalari(selectedAkt)}
                    {selectedLines.length > 0 && <>
                      <button type="button" onClick={() => void hujjatChiqar(selectedAkt, true)} disabled={chiqarilmoqda} className="fz-btn"><Eye />{t('Koʻrish')}</button>
                      <button type="button" onClick={() => void hujjatChiqar(selectedAkt, false)} disabled={chiqarilmoqda} className="fz-btn"><Download />{t('Ф-2 Excel')}</button>
                    </>}
                    {selectedAkt.holat === 'tasdiqlangan' && selectedAkt.oy && <Link to={`/admin/nakopitelniy?obyekt=${obyektId}&davr=${encodeURIComponent(selectedAkt.oy)}&f3=1`} title={t('Shu davr uchun СПРАВКА-СЧЕТ-ФАКТУРА (Форма №3) ni ochadi')} className="fz-btn"><FileText />{t('Форма №3 (счёт-фактура)')}</Link>}
                    {selectedAkt.lifecycle_status === 'approved' && importAkt?.id === selectedAkt.id && !importAkt.import && <ZakazchigaYuborish kompaniyaId={workspace.companyId ?? joriy?.id} aktId={selectedAkt.id} />}
                    {mayPrepare && stornoQilinadiAkt(selectedAkt) && <button type="button" data-testid="pereraschet-tugma" className="fz-btn fz-btn--primary" title={t('Eski F2 minus (tepada) + yangi hajmlar faktdan (pastda) — bitta hujjat; fakt o‘zgarmaydi')} onClick={() => setPereraschetOyna({ id: selectedAkt.id, raqam: selectedAkt.raqam, oy: selectedAkt.oy, hujjat_jami: selectedAkt.hujjat_jami })} disabled={savingId != null}><Calculator />{t('Pereraschet')}</button>}
                    {mayPrepare && stornoQilinadiAkt(selectedAkt) && <button type="button" className="fz-btn" title={t('Shu F2 qatorlaridan minus (storno) qoralama yaratadi; asl F2 o‘zgarmaydi')} onClick={() => setStornoOyna({ id: selectedAkt.id, raqam: selectedAkt.raqam, oy: selectedAkt.oy, hujjat_jami: selectedAkt.hujjat_jami })} disabled={savingId != null}><RotateCcw />{t('Storno (minus) F2 yaratish')}</button>}
                    {bekorMumkin(selectedAkt) && <button type="button" className="fz-btn fz-btn--danger" onClick={() => setBekorOyna([bekorAkt(selectedAkt)])} disabled={savingId != null}><Ban />{t('Bekor qilish')}</button>}
                  </>}
                  ostida={<>
                    {importAkt?.id === selectedAkt.id && importAkt.import && <p className="fz-note fz-note--info"><FileText />{t('F2 importdan kiritilgan (o‘tgan davr) — zakazchikka yuborilmaydi. Yangi F2 ni «F2 tayyorlash»da yarating va o‘sha yerdan yuboring.')}</p>}
                    {selectedAkt.holat === 'tasdiqlangan' && <p className="fz-note fz-note--info"><ShieldAlert />{t('Tasdiqlangan davr · tarix muzlatilgan')}</p>}
                    {selectedArithmeticIssues.length > 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('{n} ta arifmetik farq', { n: selectedArithmeticIssues.length })}</p>}
                    {selectedLines.length === 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('Bu hujjatda qator tafsiloti yo‘q. Tasdiqlashdan oldin manba va moslashtirishni tekshiring.')}</p>}
                    {selectedAkt.holat === 'qoralama' && !f2YozishYopiq && <>
                      <p className="fz-note fz-note--warn"><ShieldAlert />{t('Qoralama hali LRVning tasdiqlangan F2 tarixiga kirmaydi. Tasdiqlash amaldagi ma’lumot va hajm chegaralarini qayta tekshiradi.')}</p>
                      <div className="fz-panel" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <label className="min-w-[260px] flex-1 text-xs text-text-dim">{t('Rad etish yoki bekor qilish sababi')}
                          <input aria-label="F2 lifecycle sababi" value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder={t('Sababni yozing')} className="mt-1 block w-full" />
                        </label>
                        <button type="button" onClick={() => void holatniOzgartir(selectedAkt, ['submitted', 'checked', 'rejected'], actionReason)} disabled={savingId != null || !mayApprove} className="fz-btn fz-btn--danger">{t('Rad etish')}</button>
                        <button type="button" onClick={() => void holatniOzgartir(selectedAkt, ['cancelled'], actionReason)} disabled={savingId != null || !mayCancel} className="fz-btn fz-btn--ghost">{t('Bekor qilish')}</button>
                      </div>
                    </>}
                  </>}
                />
              ) : <div className="fz-note fz-note--info"><FileText />{t('Tafsilotlarni ko‘rish uchun F2 hujjatini tanlang.')}</div>}
            </section>
          </div>
        )}
      </div>
    </Sahifa></>
  );
}

export default F2TarixNative;
