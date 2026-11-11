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
import { avtoNarxsizSoni, f2HolatYorligi, f2KeyingiQadam, f2LifecyclePlan, f2LifecycleError, f2QadamTugmasi, f2RadRejasi, f2TasdiqRejimi, type F2TasdiqRejimi } from '../../lib/f2-lifecycle-workflow';
import { f2Ierarxiya, type F2IerSmeta } from '../../lib/f2-ierarxiya';
import { T2_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import type { T2Qator } from '../../api/supabase';
import { f2Hujjat } from '../../lib/f2-hujjat';
import { aktPodvallariniOl } from '../../api/t2-akt-podval';
import { aktPodvalXaritasi, type AktPodvalQator } from '../../lib/akt-podval';
import { bahoMoliya, f2AktBaho, f2AktTayyorla } from '../../lib/f2-akt-eksport';
import type { AktMoliya } from '../../lib/f2-oylik-paket/oylik';
import { aktQatorlariOl, smetaTarixBilan, type AktQatorXom } from '../../api/f2-oylik-paket';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';
import { serverUchligi } from '../../lib/ustamali-summa';
import { f2HujjatKaliti, f2HujjatKonteksti, type F2HujjatKonteksti } from '../../api/f2-hujjat-kontekst';
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
/** Saqlangan akt → Ф-2 kirishi (yagona `f2AktTayyorla`; F2 portfeli bilan bir xil). */
function aktTayyor(akt: T2AktReestr, smeta: readonly T2Qator[], lines: readonly F2Detail[], aq: readonly AktQatorXom[],
  podvallar: ReadonlyMap<string, Pick<AktPodvalQator, 'nk'>>, ctx: F2HujjatKonteksti, raqamlar: ReadonlyMap<number, string | null>, obyektNom = '') {
  return f2AktTayyorla({ smeta, lines, aktQatorlar: aq, podvallar, kontekst: ctx, akt: { id: akt.id, oy: akt.oy, raqam: akt.raqam, holat: akt.holat }, obyektNom, raqamlar });
}
/** Foydalanuvchiga aynan ko'rsatiladigan yuklash xatosi (audit C M2/B5: smeta yoki F2 qatorlari to'liq o'qilmadi). */
class YuklashXato extends Error {}

const son = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Bekor qilingan akt qatorlari (audit C m8): `t2_f2_tafsilot` bekor aktni ko'rsatmaydi — `t2_akt_qator` + smeta (tarix bilan)
 * dan faqat KO'RISH uchun tafsilot shakli (qiymatlar aynan, qayta hisob yo'q).
 */
function bekorQatorlari(akt: T2AktReestr, aq: readonly AktQatorXom[], smeta: ReadonlyMap<number, T2Qator>): F2Detail[] {
  return aq.map((q) => {
    const r = smeta.get(q.qator_id);
    const hajm = son(q.certified_quantity) ?? son(q.hajm);
    const narx = son(q.certified_unit_price) ?? son(q.narx);
    const summa = son(q.certified_amount) ?? son(q.summa);
    return {
      akt_id: akt.id, obyekt_id: akt.obyekt_id, kompaniya_id: akt.kompaniya_id, tur: 'f2', oy: akt.oy, akt_holat: akt.holat, raqam: akt.raqam,
      akt_kim: null, akt_sana: akt.yaratildi, akt_qator_id: q.id, qator_id: q.qator_id, kod: r?.kod ?? null, nom: r?.nom ?? null, birlik: r?.birlik ?? null,
      kat: r?.kat ?? null, qator_tur: r?.tur ?? null, hajm: hajm as number, narx, summa, izoh: null,
      certified_quantity: son(q.certified_quantity), certified_unit_price: son(q.certified_unit_price), certified_amount: son(q.certified_amount),
      gorunish_hajm: hajm, gorunish_narx: narx, gorunish_summa: summa,
    };
  });
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
  // m5: o'qib bo'lmasa — 'xato' (yuborish tugmasi ko'rsatilmaydi; import aktni zakazchikka yuborish xavfi yo'q).
  const [importAkt, setImportAkt] = useState<{ id: number; import: boolean | 'xato' } | null>(null);
  /** Akt id → `t2_akt_qator` (noyob tartib, to'liq; audit C M1) — storno bloklari, avto-narxsiz belgisi, bekor akt ko'rinishi. */
  const [aktQatorlar, setAktQatorlar] = useState<ReadonlyMap<number, AktQatorXom[]>>(new Map());
  /** Ro'yxat summalari (m3): har akt yadro bahosi — QQS bilan, ustamali, ustamasiz (o'z podvali bilan). */
  const [moliya, setMoliya] = useState<ReadonlyMap<number, AktMoliya>>(new Map());
  /** m6: bitta o'tish (akt, bosqich, versiya) uchun BIR operation_id — javob yo'qolib qayta bosilsa server takrorni taniydi. */
  const opIdlar = useRef(new Map<string, string>());
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
    void f2ImportQilinganmi(id).then((v) => { if (faol) setImportAkt({ id, import: v }); }).catch(() => { if (faol) setImportAkt({ id, import: 'xato' }); });
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
  const smetaById = useMemo(() => new Map(smetaRows.map((r) => [r.id, r] as const)), [smetaRows]);
  const selectedLines = useMemo(() => {
    if (!selectedAkt) return [];
    if (selectedAkt.holat === 'bekor') return bekorQatorlari(selectedAkt, aktQatorlar.get(selectedAkt.id) ?? [], smetaById);
    return tafsilot.filter((line) => line.akt_id === selectedAkt.id);
  }, [selectedAkt, tafsilot, aktQatorlar, smetaById]);
  /** NARXSIZ_QATOR_BOR: avtomatik narxsiz qoralama qatorlari — server tasdiqni rad etadi, oldindan sababi va yo'li ko'rsatiladi. */
  const avtoNarxsiz = useMemo(() => (selectedAkt?.holat === 'qoralama' ? avtoNarxsizSoni(aktQatorlar.get(selectedAkt.id) ?? []) : 0), [selectedAkt, aktQatorlar]);
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
    if (!validId) { setReestr([]); setTafsilot([]); setSmeta([]); setSmetaRows([]); setAktQatorlar(new Map()); setMoliya(new Map()); setSelectedAktId(null); return; }
    setLoading(true); setError('');
    const kompaniyaId = workspace.companyId ?? joriy?.id ?? null;
    try {
      const [r, d, tr] = await Promise.all([
        sbT2AktReestrOl(obyektId, 'f2'),
        sbT2F2TafsilotOl({ obyektId, tur: 'f2' }),
        sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI),
      ]);
      if (raqam !== sorov.current) return;
      if (!r.ok) throw new Error(xavfsizXato());
      // B5: F2 qatorlari to'liq bo'lmasa (eski 20000 chegarasi) — ko'rinadigan xato, yarim ro'yxat emas.
      if (!d.ok) throw new YuklashXato(t('F2 qatorlari to‘liq o‘qilmadi — hujjat va summalar ko‘rsatilmaydi. Qayta yangilang.'));
      // M2: smeta daraxti o'qilmasa — jim bo'sh daraxt emas (hujjat/ierarxiya noto'g'ri chiqardi).
      if (!tr.ok || tr.toliq === false) throw new YuklashXato(t('Smeta daraxti o‘qilmadi — F2 ierarxiyasi va hujjati tuzilmaydi. Qayta yangilang.'));
      const akts = ((r.qatorlar || []) as T2AktReestr[]).filter((a) => a.tur === 'f2');
      const lines = (d.qatorlar || []) as F2Detail[];
      // M1: barcha F2 akt qatorlari — noyob tartib, to'liq (storno bloki, avto-narxsiz, bekor akt ko'rinishi).
      const aq = await aktQatorlariOl(obyektId, akts.map((a) => a.id)).catch(() => { throw new YuklashXato(t('F2 akt qatorlari to‘liq o‘qilmadi. Qayta yangilang.')); });
      // B2: eski smeta versiyasidagi qatorlar tarixdan (t2_daraxt faqat faol).
      const ids = [...lines.map((l) => l.qator_id), ...[...aq.values()].flat().map((q) => q.qator_id)];
      const smetaT = await smetaTarixBilan(obyektId, (tr.qatorlar || []) as unknown as T2Qator[], ids).catch(() => { throw new YuklashXato(t('Eski smeta versiyasi qatorlari o‘qilmadi — F2 hujjati tuzilmaydi. Qayta yangilang.')); });
      if (raqam !== sorov.current) return;
      setSmeta(smetaT as unknown as F2IerSmeta[]);
      setSmetaRows(smetaT);
      setReestr(akts);
      setTafsilot(lines);
      setAktQatorlar(aq);
      setSelectedAktId((old) => (old && akts.some((a) => a.id === old) ? old : (akts[0]?.id ?? null)));
      // m3: ro'yxat summalari (QQS bilan → ustamali → ustamasiz) — yadro, o'z podvali bilan. O'qilmasa — faqat ustamasiz (reestr).
      setMoliya(new Map());
      if (kompaniyaId) {
        void (async () => {
          const [ctx, pv] = await Promise.all([f2HujjatKonteksti(kompaniyaId, obyektId), aktPodvallariniOl(obyektId)]);
          if (raqam !== sorov.current || ctx.xato || !pv.ok) return;
          const podvallar = aktPodvalXaritasi(pv.podvallar);
          const raqamlar = new Map(akts.map((a) => [a.id, a.raqam ?? null] as const));
          const m = new Map<number, AktMoliya>();
          for (const a of akts) {
            if (a.holat === 'bekor') continue;
            const k = aktTayyor(a, smetaT, lines.filter((l) => l.akt_id === a.id), aq.get(a.id) ?? [], podvallar, ctx, raqamlar);
            if (k && !k.topilmagan) m.set(a.id, bahoMoliya(f2AktBaho(k, ctx), a.hujjat_jami));
          }
          if (raqam === sorov.current) setMoliya(m);
        })().catch(() => { /* ro'yxatda faqat ustamasiz qoladi */ });
      }
    } catch (e) {
      if (raqam !== sorov.current) return;
      setReestr([]); setTafsilot([]); setAktQatorlar(new Map()); setMoliya(new Map()); setSelectedAktId(null);
      setError(e instanceof YuklashXato ? e.message : xavfsizXato());
    } finally { if (raqam === sorov.current) setLoading(false); }
  }, [obyektId, validId, workspace.companyId, joriy?.id]);

  useEffect(() => { void yuklash(); }, [yuklash]);

  async function holatniOzgartir(akt: T2AktReestr, statuses: readonly ('submitted' | 'checked' | 'approved' | 'rejected' | 'cancelled')[], reason?: string, birQadam = false) {
    if (akt.holat !== 'qoralama' || savingId != null) return;
    if ((statuses.includes('cancelled')&&!mayCancel)||(statuses.some(s=>s==='checked'||s==='approved'||s==='rejected')&&!mayApprove)) {toast('Bu amal uchun individual ruxsatingiz yo‘q.','danger');return;}
    const sabab = reason?.trim() || null;
    if (statuses.includes('rejected') || statuses.includes('cancelled')) {
      if (!sabab) { toast('Rad etish/bekor qilish sababi majburiy.', 'danger'); return; }
    }
    setSavingId(akt.id); setError('');
    let bajarildi = false;
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
        : target === 'rejected' ? f2RadRejasi(rejim, current.lifecycle_status)
        : (target === 'approved' || target === 'cancelled' ? f2LifecyclePlan(current.lifecycle_status, target) : null);
      if (plan === null) { toast('Bu hujjatning joriy holatida ushbu amal bajarilmaydi.', 'danger'); return; }
      let expectedVersion = current.versiya;
      for (const toStatus of plan) {
        // m6: shu (akt, bosqich, versiya) uchun avvalgi urinish operation_id si qayta ishlatiladi (javob yo'qolgan bo'lsa — idempotent).
        const opKalit = `${akt.id}:${toStatus}:${expectedVersion}`;
        const operationId = opIdlar.current.get(opKalit) ?? yangiOperationId();
        opIdlar.current.set(opKalit, operationId);
        const result = await t2AktLifecycleTransition({
          kompaniyaId,
          aktId: akt.id,
          toStatus,
          expectedVersion,
          operationId,
          reason: sabab,
        });
        if (!result.ok) {
          if (result.code !== 'NETWORK' && result.code !== 'TIMEOUT') opIdlar.current.delete(opKalit);
          toast(f2LifecycleError(result.code), 'danger', undefined, 9000);
          return;
        }
        opIdlar.current.delete(opKalit);
        bajarildi = true;
        expectedVersion = result.version ?? expectedVersion + 1;
      }
      toast(statuses.at(-1) === 'approved'
        ? (rejim === 'shaxsiy' ? t('F2 yakunlandi (shaxsiy); LRV va Nakopitelniy yangilanadi.') : t('F2 tasdiqlandi; LRV va Nakopitelniy yangilanadi.'))
        : t('F2 holati saqlandi.'), 'ok');
      setActionReason('');
    } catch {
      toast('F2 tasdiqlash javobi olinmadi. Shu hujjatni qayta yubormang; avval yangilang.', 'danger', undefined, 9000);
    } finally {
      // M6: holat o'zgardi — daraxt (f2_hajm/qoldiq) keshi eskirdi; F2 tayyorlash eski qoldiqdan ikkinchi F2 taklif qilmasin.
      if (bajarildi) { qc?.removeQueries({ queryKey: daraxtKaliti(obyektId) }); void qc?.invalidateQueries({ queryKey: ['t2-obyektlar'] }); }
      await yuklash(); setSavingId(null);
    }
  }

  /* Egasi (2026-10-02): tasdiqlangan F2 ham yangi Ф-2 shablonida chiqadi. Sertifikatlangan raqamlar aynan
   * (lib/f2-akt-hujjat). Token: bitta F2 (obyekt + oy + raqam) uchun bir marta — qayta chiqarish bepul. */
  async function hujjatChiqar(akt: T2AktReestr, korish: boolean) {
    const kompaniyaId = workspace.companyId ?? joriy?.id;
    if (!kompaniyaId || chiqarilmoqda) return;
    const object = obyektlar.find((o) => o.id === obyektId);
    setChiqarilmoqda(true);
    try {
      const ctx = await f2HujjatKonteksti(kompaniyaId, obyektId);
      // Ustama/podval o'qilmasa F2 hujjati jimgina standart podval yoki ustamasiz chiqmaydi.
      if (ctx.xato) { toast(`F2 hujjati tuzilmadi: ${ctx.xato}`, 'danger'); return; }
      // F2 hujjati O'Z podvali bilan (egasi 2026-11-03): podval/qator o'qilmasa jim smeta podvaliga o'tilmaydi.
      // B4: shu aktning qatorlari — akt_id filtri, noyob tartib, to'liq (bekor akt — t2_akt_qator dan ko'rinish).
      const [pv, aqM, d] = await Promise.all([
        aktPodvallariniOl(obyektId),
        aktQatorlariOl(obyektId, [akt.id]).catch(() => null),
        akt.holat === 'bekor' ? Promise.resolve(null) : sbT2F2TafsilotOl({ obyektId, tur: 'f2', aktId: akt.id }),
      ]);
      if (!pv.ok || !aqM) { toast(`F2 hujjati tuzilmadi: ${t('hujjat podvali o‘qilmadi')}`, 'danger'); return; }
      if (d && !d.ok) { toast(t('F2 qatorlari to‘liq o‘qilmadi — hujjat tuzilmadi. Qayta yangilang.'), 'danger'); return; }
      const aq = aqM.get(akt.id) ?? [];
      const lines = d ? ((d.qatorlar ?? []) as F2Detail[]) : bekorQatorlari(akt, aq, smetaById);
      // B2: yangi o'qilgan qatorlar uchun ham eski versiya smeta qatorlari.
      const smeta = await smetaTarixBilan(obyektId, smetaRows, lines.map((l) => l.qator_id));
      // Yagona tayyorlash (lib/f2-akt-eksport): F2 portfeli ham aynan shu yo'ldan foydalanadi.
      const k = aktTayyor(akt, smeta, lines, aq, aktPodvalXaritasi(pv.podvallar), ctx, new Map(f2Reestr.map((a) => [a.id, a.raqam ?? null] as const)), object?.nom || '');
      if (!k) { toast('Bu hujjatda chiqariladigan qator yo‘q.', 'danger'); return; }
      // B2: topilmagan qator bor — hujjat BLOKLANADI (yarim Ф-2 summasi yadro/serverdan farq qiladi).
      if (k.topilmagan) { toast(t('{n} ta qator smetada (eski versiyalarda ham) topilmadi — Ф-2 hujjati tuzilmadi', { n: k.topilmagan }), 'danger', undefined, 9000); return; }
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
                      <span className="fz-list__sum">{(() => {
                        // m3: QQS bilan — asosiy, ostida ustamali va ustamasiz (yadro `f2AktBaho`, aktning o'z podvali bilan).
                        const m = moliya.get(akt.id);
                        return m ? <QiymatUchlik q={serverUchligi({ itogo4: m.ustamali, vsego: m.jami }, m.ustamasiz)} kichik tafsilYoq />
                          : <span title={t('ustamasiz, NDS siz — ustamali summa hujjat ichida')}><FmtN val={akt.hujjat_jami} kasr={0} /></span>;
                      })()}</span>
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
                    {!f2YozishYopiq && selectedAkt.holat === 'qoralama' && tugmaMatni(selectedAkt) && <button type="button" title={avtoNarxsiz > 0 ? t('{n} ta qator narxsiz (avtomatik) — avval narx kiriting yoki «narxsiz» deb belgilang', { n: avtoNarxsiz }) : tugmaRuxsat(selectedAkt) ? (rejim === 'korporativ' ? t('Har bosqichni boshqa xodim bajaradi (tayyorlovchi ≠ tekshiruvchi ≠ tasdiqlovchi)') : '') : t('F2 tasdiqlash ruxsati berilmagan')} onClick={() => void tasdiqlash(selectedAkt)} disabled={savingId != null || !tugmaRuxsat(selectedAkt) || avtoNarxsiz > 0} className="fz-btn fz-btn--primary"><CheckCircle2 />{savingId === selectedAkt.id ? '…' : t(tugmaMatni(selectedAkt) ?? '')}</button>}
                    {tahrirHavolalari(selectedAkt)}
                    {selectedLines.length > 0 && <>
                      <button type="button" onClick={() => void hujjatChiqar(selectedAkt, true)} disabled={chiqarilmoqda} className="fz-btn"><Eye />{t('Koʻrish')}</button>
                      <button type="button" onClick={() => void hujjatChiqar(selectedAkt, false)} disabled={chiqarilmoqda} className="fz-btn"><Download />{t('Ф-2 Excel')}</button>
                    </>}
                    {selectedAkt.holat === 'tasdiqlangan' && selectedAkt.oy && <Link to={`/admin/nakopitelniy?obyekt=${obyektId}&davr=${encodeURIComponent(selectedAkt.oy)}&f3=1`} title={t('Fayl yuklamaydi: Nakopitelniy sahifasida shu davr uchun Forma 3 ochiladi')} className="fz-btn"><FileText />{t('Forma 3 ga o‘tish')}</Link>}
                    {selectedAkt.lifecycle_status === 'approved' && importAkt?.id === selectedAkt.id && importAkt.import === false && <ZakazchigaYuborish kompaniyaId={workspace.companyId ?? joriy?.id} aktId={selectedAkt.id} />}
                    {mayPrepare && stornoQilinadiAkt(selectedAkt) && <button type="button" data-testid="pereraschet-tugma" className="fz-btn fz-btn--primary" title={t('Eski F2 minus (tepada) + yangi hajmlar faktdan (pastda) — bitta hujjat; fakt o‘zgarmaydi')} onClick={() => setPereraschetOyna({ id: selectedAkt.id, raqam: selectedAkt.raqam, oy: selectedAkt.oy, hujjat_jami: selectedAkt.hujjat_jami })} disabled={savingId != null}><Calculator />{t('Pereraschet')}</button>}
                    {mayPrepare && stornoQilinadiAkt(selectedAkt) && <button type="button" className="fz-btn" title={t('Shu F2 qatorlaridan minus (storno) qoralama yaratadi; asl F2 o‘zgarmaydi')} onClick={() => setStornoOyna({ id: selectedAkt.id, raqam: selectedAkt.raqam, oy: selectedAkt.oy, hujjat_jami: selectedAkt.hujjat_jami })} disabled={savingId != null}><RotateCcw />{t('Storno (minus) F2 yaratish')}</button>}
                    {bekorMumkin(selectedAkt) && <button type="button" className="fz-btn fz-btn--danger" onClick={() => setBekorOyna([bekorAkt(selectedAkt)])} disabled={savingId != null}><Ban />{t('Bekor qilish')}</button>}
                  </>}
                  ostida={<>
                    {importAkt?.id === selectedAkt.id && importAkt.import === 'xato' && selectedAkt.lifecycle_status === 'approved' && <p className="fz-note fz-note--warn"><ShieldAlert />{t('Hujjat manbasi (import yoki tizim) o‘qilmadi — zakazchikka yuborish yashirildi. Sahifani yangilang.')}</p>}
                    {avtoNarxsiz > 0 && <p className="fz-note fz-note--danger" data-testid="avto-narxsiz-ogoh"><ShieldAlert />{t('{n} ta qator narxsiz (avtomatik qoralama) — bunday F2 tasdiqlanmaydi. «Tizimda tahrirlash» orqali narx kiriting yoki qatorni ongli «narxsiz» deb belgilang.', { n: avtoNarxsiz })}{' '}<Link to={`/admin/f2-tayyorlash?obyekt=${obyektId}&akt=${selectedAkt.id}`}>{t('Narx kiritish / narxsiz belgilash')}</Link></p>}
                    {importAkt?.id === selectedAkt.id && importAkt.import === true && <p className="fz-note fz-note--info"><FileText />{t('F2 importdan kiritilgan (o‘tgan davr) — zakazchikka yuborilmaydi. Yangi F2 ni «F2 tayyorlash»da yarating va o‘sha yerdan yuboring.')}</p>}
                    {selectedAkt.holat === 'tasdiqlangan' && <p className="fz-note fz-note--info"><ShieldAlert />{t('Tasdiqlangan davr · tarix muzlatilgan')}</p>}
                    {selectedArithmeticIssues.length > 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('{n} ta arifmetik farq', { n: selectedArithmeticIssues.length })}</p>}
                    {selectedLines.length === 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('Bu hujjatda qator tafsiloti yo‘q. Tasdiqlashdan oldin manba va moslashtirishni tekshiring.')}</p>}
                    {selectedAkt.holat === 'qoralama' && !f2YozishYopiq && <>
                      {/* m1: avvalgi matn «tasdiq hajm chegarasini qayta tekshiradi» yolg'on edi — hajm bloklanmaydi (egasi qoidasi). */}
                      <p className="fz-note fz-note--warn"><ShieldAlert />{t('Qoralama hali LRVning tasdiqlangan F2 tarixiga kirmaydi. Tasdiqlash hujjat holati va versiyasini tekshiradi; hajmning qoldiqdan oshishi bloklanmaydi — oshgan qatorlarni tasdiqlashdan oldin o‘zingiz ko‘rib chiqing.')}</p>
                      <div className="fz-panel" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <label className="min-w-[260px] flex-1 text-xs text-text-dim">{t('Rad etish yoki bekor qilish sababi')}
                          <input aria-label="F2 lifecycle sababi" value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder={t('Sababni yozing')} className="mt-1 block w-full" />
                        </label>
                        {/* M5: korporativda rad etish faqat tekshirilgan hujjatda (bitta qadam) — yarim yo'l o'tish yo'q. */}
                        {f2RadRejasi(rejim, statusOf(selectedAkt)) && <button type="button" onClick={() => void holatniOzgartir(selectedAkt, ['rejected'], actionReason)} disabled={savingId != null || !mayApprove} className="fz-btn fz-btn--danger">{t('Rad etish')}</button>}
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
