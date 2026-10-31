import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NakopitelniyGrafik } from '../../components/nakopitelniy/NakopitelniyGrafik';
import { Search, Download, RefreshCw, AlertTriangle, Eye, Plus, Trash2, ClipboardPaste, FileSpreadsheet, FileText, History, Settings2 } from 'lucide-react';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { sbT2KompaniyalarOl, yangiOperationId, type T2Kompaniya, type T2Obyekt } from '../../api/supabase';
import { obyektlarKeshdan, useIxtiyoriyQueryClient } from '../../api/t2-obyektlar-kesh';
import { sbT2ShartnomaBogOl, sbT2ShartnomalarOl, zakazchikRekvizit } from '../../api/t2-shartnoma';
import type { Forma3Rekvizit } from '../../lib/forma3-export';
import { shartnomaSvodOl, sverkaXato, sverkaYozuvYoz, t2NakopitelniyToliq, tolovYoz, type NakopitelniyProgress, type NakopitelniyQator, type NakopitelniyDavr, type NakopitelniyJami, type SverkaYozuvTur } from '../../api/t2-nakopitelniy';
import { shartnomaSvodi, somga, sverkaHisobla, sverkaMatniniOqi, tiyin, type F3Holat, type SvodShartnoma, type SverkaImportNatija, type TolovTur } from '../../lib/nakopitelniy-svod';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { HujjatToliqEmasXato, NDS_SUKUT_FOIZ, nakopitelniyVedomostHujjat, shartnomaSvodXlsx, sverkaXlsx } from '../../lib/nakopitelniy-vedomost-export';
import { t } from '../../i18n/til';
import PulTahlil from '../../components/boss-decision/PulTahlil';
import { forma3Hujjat, forma3SotuvdanXlsx, type Forma3ExportOptions } from '../../lib/forma3-export';
import { sbT2F2TafsilotOl } from '../../api/t2-narx';
import { ozgarishRoyxatOl } from '../../api/t2-document-control';
import { t2ObyektNakrutka, type NakrutkaKaskad, type NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { obyektPodvaliOqi } from '../../api/t2-nakrutka-podval';
import type { Podval } from '../../lib/hisob-yadro';
import type { SmetaNakrutka } from '../../api/t2-nakopitelniy';
import { obyektSmetaKOplate } from '../../lib/ustamali-summa';
import type { SvodYaxlit } from '../../lib/svod-yaxlit';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { hujjatArxivla } from '../../api/t2-hujjat-arxiv';
import { toast } from '../../umumiy/ui/Toast';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { ozgarishIzohi, smetaModeliniYukla, tartibla, type SmetaModel } from '../../lib/smeta-model';
import { validatePtoHierarchy, type PtoF3LineageInput, type PtoLineageScope } from '../../lib/pto-document-lineage';
import { f3CertifiedHajm, f3CertifiedSources, f2OyKesimi } from '../../lib/pto-document-lineage/f3-sources';
import { Maydon, Sahifa } from '../../umumiy/ui/Sahifa';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { AmalMenyu } from '../../components/nakopitelniy/AmalMenyu';
import { DavrChiziq } from '../../components/nakopitelniy/DavrChiziq';
import { NakopitelniyKpi } from '../../components/nakopitelniy/NakopitelniyKpi';
import { NakopitelniyJadval } from '../../components/nakopitelniy/NakopitelniyJadval';
import { ShartnomaQuvur } from '../../components/nakopitelniy/ShartnomaQuvur';
import { PereraschetBolimi } from './PereraschetBolimi';
import { SverkaImportPanel } from '../../components/sverka-import/SverkaImportPanel';

/**
 * T2-PTO-OWNER-CRITICAL-CLOSURE P0-3: the real, line-by-line PTO nakopitelniy
 * vedomost -- ISH / SMETA / FAKT / PREV F2 / CURRENT F2 / CUMULATIVE F2 /
 * REMAINING, off t2_nakopitelniy_v2 (canonical; Fakt 20261011100000, barg
 * jami + sahifalash 20261101090000). Replaces the one-line KPI
 * summary that used to stand in for this. Approved-only cumulative: a draft
 * F2 never appears in oldingi/joriy/jami -- only t2_akt.holat='tasdiqlangan'
 * rows are summed there (t2_nakopitelniy_v1's own join condition).
 */

function Sessiya({ companyId }: { companyId: number }) {
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const qc = useIxtiyoriyQueryClient();
  const workspace = usePTOWorkspace();
  const objectId = workspace.scope.objectId ? String(workspace.scope.objectId) : '';
  const setObjectId = (value: string) => workspace.setObjectId(value ? Number(value) : null);
  const requestId = useRef(0);
  /** Yagona smeta modeli (daraxt + zamena bog'lanishi) — to'liq qayta o'qishda ham izohlar uchun. */
  const modelRef = useRef<SmetaModel | null>(null);
  const [davrlar, setDavrlar] = useState<NakopitelniyDavr[]>([]);
  const [davr, setDavr] = useState('');
  const [qatorlar, setQatorlar] = useState<NakopitelniyQator[]>([]);
  const [jami, setJami] = useState<NakopitelniyJami | null>(null);
  const [obyektNom, setObyektNom] = useState('');
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [obyektKompaniyaId, setObyektKompaniyaId] = useState<number | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [busy, setBusy] = useState(false);
  /** Katta obyekt: sahifalab yuklash progressi (prod 2026-10-27 — foydalanuvchi kutayotganini ko'rsin). */
  const [progress, setProgress] = useState<NakopitelniyProgress | null>(null);
  const [xato, setXato] = useState('');
  const [treeMeta, setTreeMeta] = useState<Map<number, { ota_id: number | null; daraja: number | null }>>(new Map());
  /** Egasi 2026-09-30: jadvalda ham har tasdiqlangan F2 oyi alohida ustun (+ ИТОГО). */
  const [oyKesim, setOyKesim] = useState<ReturnType<typeof f2OyKesimi> | null>(null);

  useEffect(() => {
    let active = true;
    // Umumiy kesh (Holat/Fakt/PTO kontekst bilan bitta so'rov).
    void obyektlarKeshdan(qc, companyId).then(r => { if (active && r.ok) setObjects((r.qatorlar || []) as T2Obyekt[]); });
    return () => { active = false; };
  }, [companyId, qc]);

  // Ikki narx (egasi): hujjatda к оплате = прямые × Kf — obyekt/shartnoma nakrutka foizlari.
  const [nakrutka, setNakrutka] = useState<NakrutkaKoeffitsientlar | null>(null);
  const [nakrutkaKaskadi, setNakrutkaKaskadi] = useState<NakrutkaKaskad | null>(null);
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  const [podval, setPodval] = useState<Podval | null>(null);
  /** Server kesimi (cats / cats_kaskad / svod_yaxlit) — obyekt ustamalisi yagona obyektUstamali orqali. */
  const [nakrutkaJavob, setNakrutkaJavob] = useState<Awaited<ReturnType<typeof t2ObyektNakrutka>> | null>(null);
  const svodYaxlit: SvodYaxlit | null = nakrutkaJavob?.svod_yaxlit ?? null;
  /** Podval o'qildi (null — standart kaskad); o'qilmaguncha smeta к оплате hisoblanmaydi (standart bilan «miltillamasin»). */
  const [podvalOqildi, setPodvalOqildi] = useState(false);
  /** Nakrutka o'qish xatosi — jim yutilmaydi, ekranda ko'rsatiladi. */
  const [nakrutkaXato, setNakrutkaXato] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setNakrutka(null);
    setNakrutkaKaskadi(null);
    setPodval(null);
    setPodvalOqildi(false);
    setNakrutkaJavob(null);
    setNakrutkaXato(null);
    if (!objectId) return;
    void t2ObyektNakrutka(Number(objectId)).then(async (r) => {
      if (!active) return;
      if (!r.ok) { setNakrutkaXato(r.error || r.code || 'Nakrutka o‘qilmadi'); return; }
      if (r.koeffitsientlar) setNakrutka(r.koeffitsientlar);
      if (r.nakrutka) setNakrutkaKaskadi(r.nakrutka);
      if (r.cats) setNakrutkaJavob(r);
      // «Podval yo'q» (standart) va «o'qilmadi» farqlanadi; o'qilmasa — xato ko'rsatiladi, eksport bloklanadi.
      const p = await obyektPodvaliOqi(companyId, Number(objectId), r.shartnoma_id ?? null, r.nakrutka_podval_id ?? null);
      if (!active) return;
      if (!p.ok) { setNakrutkaXato(p.xato); return; }
      setPodval(p.podval); setPodvalOqildi(true);
    }).catch(() => { if (active) setNakrutkaXato('Nakrutka o‘qilmadi (tarmoq xatosi)'); });
    return () => { active = false; };
  }, [objectId]);

  /**
   * F3 (СПРАВКА-СЧЕТ-ФАКТУРА) titulidagi TO'LIQ rekvizitlar — egasi
   * (2026-09-28): "har tarafni rekvizitlarini qo'ya oladigan kuchli hujjat".
   * ПОДРЯДЧИК — kompaniyaning o'z profili (t2_kompaniya); ЗАКАЗЧИК —
   * obyektga bog'langan shartnomaning rekviziti. Ikkalasi ham bo'sh bo'lishi
   * mumkin (hali kiritilmagan) — bu holda titulda o'sha qator ko'rinmaydi
   * (`forma3-export.ts` ikkiTomonRekvizit qoidasi), o'ylab to'qilmaydi.
   */
  const [kompaniyalar, setKompaniyalar] = useState<T2Kompaniya[]>([]);
  useEffect(() => {
    let active = true;
    void sbT2KompaniyalarOl().then((r) => { if (active && r.ok) setKompaniyalar((r.qatorlar || []) as T2Kompaniya[]); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const pudratchiRek = useMemo<Forma3Rekvizit | null>(() => {
    const k = kompaniyalar.find((x) => x.id === companyId);
    return k ? { toliqNom: k.toliq_nom, manzil: k.manzil, telefon: k.telefon, hisobRaqam: k.hisob_raqam, bank: k.bank, mfo: k.mfo, inn: k.inn, oked: k.oked } : null;
  }, [kompaniyalar, companyId]);
  const [zakazchikRek, setZakazchikRek] = useState<Forma3Rekvizit | null>(null);
  const [shartnoma, setShartnoma] = useState<{ raqam: string; sana: string | null; summa: number | null } | null>(null);
  const [shartnomaId, setShartnomaId] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setZakazchikRek(null); setShartnoma(null); setShartnomaId(null);
    if (!objectId) return;
    void (async () => {
      const bog = await sbT2ShartnomaBogOl(Number(objectId));
      if (!active || !bog.ok) return;
      const shId = (bog.qatorlar || []).find((x) => x.obyekt_id === Number(objectId))?.shartnoma_id;
      if (shId == null) return;
      setShartnomaId(shId);
      const sh = await sbT2ShartnomalarOl(companyId, false);
      if (!active || !sh.ok) return;
      const s = (sh.qatorlar || []).find((x) => x.id === shId);
      if (!s) return;
      // KANONIK yo'l (egasi 2026-09-28): avval `zakazchik_kompaniya_id`
      // bog'lanishidan (rekvizit bir marta kompaniya profilida kiritiladi);
      // bog'lanmagan bo'lsa shartnomaning o'z zaxira matn maydonlaridan.
      setZakazchikRek(zakazchikRekvizit(s, (id) => kompaniyalar.find((x) => x.id === id)));
      // Shartnoma sanasi bazada alohida saqlanmaydi (faqat yaratildi — texnik
      // sana) — shuning uchun F3 titulidagi "от ..." faqat egasi qo'lda
      // kiritsa chiqadi; hozircha raqam + summa yetarli, sana UNKNOWN.
      setShartnoma({ raqam: s.raqam, sana: null, summa: s.jami_nds_bilan ?? s.summa_bez_nds });
    })().catch(() => undefined);
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, companyId, kompaniyalar]);

  const yukla = async (objId: number, tanlanganDavr: string) => {
    const currentRequest = ++requestId.current;
    setBusy(true); setXato('');
    try {
      // Yagona smeta modeli (lib/smeta-model): daraxt, zamena bog'lanishi va o'zgarish izohlari bir joydan.
      const [r, model, taf] = await Promise.all([
        t2NakopitelniyToliq(objId, tanlanganDavr || null, false, { onProgress: (p) => { if (currentRequest === requestId.current) setProgress(p); } }),
        smetaModeliniYukla(objId),
        sbT2F2TafsilotOl({ obyektId: objId, tur: 'f2' }).catch(() => null),
      ]);
      if (currentRequest !== requestId.current) return;
      if (!r.ok) { setXato(r.xato || r.code || 'Yuklanmadi'); setQatorlar([]); return; }
      const meta = new Map<number, { ota_id: number | null; daraja: number | null }>();
      for (const q of model.byId.values()) meta.set(q.id, { ota_id: q.ota_id, daraja: q.daraja });
      setTreeMeta(meta);
      modelRef.current = model;
      // Egasi 2026-09-29: qo'shimcha/zamena qatorlarining tartib raqami smeta oxirida — hujjatlar
      // ularni oxirgi razdelga yozardi. Barcha hujjatlar shu ro'yxatdan: DARAXT tartibida.
      setQatorlar(tartibla(r.qatorlar.map(q => ({ ...q, ...(meta.get(q.qator_id) ?? {}), ozgarish_izoh: ozgarishIzohi(q, model), norma: model.byId.get(q.qator_id)?.norma ?? null })), model));
      setOyKesim(taf?.ok && taf.toliq !== false && taf.qatorlar && r.davr ? f2OyKesimi(taf.qatorlar, String(r.davr).slice(0, 7)) : null);
      setJami(r.jami); setDavrlar(r.davrlar); setDavr(r.davr); setObyektNom(r.obyekt.nom);
      setLoyihaId(r.obyekt.loyiha_id);
      setObyektKompaniyaId(r.obyekt.kompaniya_id);
      setTruncated(Boolean(r.truncated));
    } catch { if (currentRequest === requestId.current) setXato('Ma’lumotlarni yuklab bo‘lmadi. Yangilab qayta urinib ko‘ring.'); }
    finally { if (currentRequest === requestId.current) { setBusy(false); setProgress(null); } }
  };

  useEffect(() => {
    ++requestId.current;
    setQatorlar([]); setJami(null); setDavrlar([]); setTreeMeta(new Map()); setDavr(''); setXato('');
    if (!objectId) { setBusy(false); return; }
    void yukla(Number(objectId), workspace.scope.periodId || '');
    return () => { ++requestId.current; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, workspace.scope.periodId]);

  const filtr = qidiruv.trim().toLowerCase();
  const korinadigan = useMemo(() => {
    if (!filtr) return qatorlar;
    const byId = new Map(qatorlar.map(q => [q.qator_id, q]));
    const keep = new Set<number>();
    for (const q of qatorlar) {
      if ((q.kod || '').toLowerCase().includes(filtr) || (q.nom || '').toLowerCase().includes(filtr)) {
        let current: NakopitelniyQator | undefined = q;
        while (current) {
          if (keep.has(current.qator_id)) break;
          keep.add(current.qator_id);
          current = current.ota_id == null ? undefined : byId.get(current.ota_id);
        }
      }
    }
    // Eski RPC parent ID bermasa, foydalanuvchi hech bo'lmaganda bo'lim
    // sarlavhasini yo'qotmasin. Yangi canonical oqimda esa faqat haqiqiy
    // ajdodlar ko'rsatiladi.
    if (!qatorlar.some(q => q.ota_id != null)) return qatorlar.filter(q => q.tur === 'rz' || keep.has(q.qator_id));
    return qatorlar.filter(q => keep.has(q.qator_id));
  }, [qatorlar, filtr]);

  // Qator tartibi canonical tartib; ierarxiya esa ota_id/daraja bilan
  // ko'rsatiladi. Keyingi satrga qarab RZ ni o'chirish mumkin emas: ichma-ich
  // RZ bo'limlarida bunday usul bo'limlarni yo'qotadi.
  const gorunumRows = korinadigan;

  const [tomonlar, setTomonlar, imzoTafsilot] = useHujjatTomonlari(companyId, objectId ? Number(objectId) : null);
  const [ndsFoiz, setNdsFoiz] = useState(String(NDS_SUKUT_FOIZ));
  const [truncated, setTruncated] = useState(false);
  /**
   * Smeta «к оплате» — BITTA yadro hisobi (`obyektUstamali`: server kesimi + svod yaxlit + podval/koeffitsientlar), hujjat bilan
   * bir xil. Muqobil manbalar (server kaskadi / jami.smeta_nakrutka) yo'q: kirish yetishmasa — «не определена» va sababi.
   */
  const smetaNakrutkaHisob = useMemo((): { qiymat: SmetaNakrutka | null; sabab: string | null } => {
    if (nakrutkaXato) return { qiymat: null, sabab: nakrutkaXato };
    if (!podvalOqildi) return { qiymat: null, sabab: null }; // hali o'qilmoqda
    // Kategoriyasi ko'rsatilmagan smeta qismi (jami − kesim) tashlanmaydi — ИТОГО-4 ga ustamasiz, taxminiy (≈).
    return obyektSmetaKOplate(nakrutkaJavob, podval, nakrutka, jami?.smeta_summa ?? null);
  }, [nakrutka, podval, podvalOqildi, nakrutkaJavob, nakrutkaXato, jami?.smeta_summa]);
  /** Eksport darvozasi: ustama/podval o'qilmagan yoki xato — hujjat yasalmaydi (sababi bilan). */
  const ustamaTayyorEmas = (): string | null => (nakrutkaXato ? `Hujjat yasalmadi: ${nakrutkaXato}.` : !podvalOqildi ? 'Hujjat yasalmadi: ustama (nakrutka) va podval hali o‘qilmoqda — biroz kuting.' : null);
  const smetaNakrutka = smetaNakrutkaHisob.qiymat;

  /** Hujjat faqat TO'LIQ ro'yxatdan yasaladi: ekrandagi ro'yxat qisqa bo'lsa
   *  (server sukuti 500 qator) — server sahifalari avtomat oxirigacha o'qiladi
   *  (egasi qarori Q4). Baribir to'liq kelmasa — eksport bloklanadi. */
  const [eksportBusy, setEksportBusy] = useState(false);
  const toliqQatorlar = async (): Promise<NakopitelniyQator[] | null> => {
    if (!truncated) return qatorlar;
    setEksportBusy(true);
    try {
      const r = await t2NakopitelniyToliq(Number(objectId), davr || null, false, { onProgress: setProgress });
      if (!r.ok) {
        setXato(r.code === 'NAKOPITELNIY_OZGARDI' ? 'O‘qish paytida smeta qatorlari o‘zgardi — qayta urinib ko‘ring.' : (r.xato || r.code || 'Yuklanmadi'));
        return null;
      }
      if (r.truncated) { setXato('Hujjat yasalmadi: server ro‘yxatni to‘liq bermadi — chala hujjat chiqarilmaydi.'); return null; }
      return tartibla(r.qatorlar.map(q => ({ ...q, ...(treeMeta.get(q.qator_id) ?? {}), ozgarish_izoh: ozgarishIzohi(q, modelRef.current), norma: modelRef.current?.byId.get(q.qator_id)?.norma ?? null })), modelRef.current);
    } finally { setEksportBusy(false); setProgress(null); }
  };
  const stavkaOl = (): number | null => {
    const t = ndsFoiz.trim();
    if (t === '') return null;
    const x = Number(t.replace(',', '.'));
    return Number.isFinite(x) && x >= 0 ? x : null;
  };

  /** Barcha rasmiy exportlar uchun bir xil canonical company/project/object/contract gate. */
  const canonicalScopeOl = async (): Promise<{ scope: PtoLineageScope | null; warning?: string } | null> => {
    if (!objectId || obyektKompaniyaId !== companyId) {
      setXato('Hujjat obyekti tanlangan kompaniyaga tegishli ekanligi tasdiqlanmadi.');
      return null;
    }
    if (!loyihaId) return { scope: null, warning: 'Loyiha rekvizitlari bog‘lanmagan; hujjatda ular bo‘sh qoldiriladi.' };
    const bog = await sbT2ShartnomaBogOl(Number(objectId));
    const boglar = bog.ok ? (bog.qatorlar ?? []) : [];
    if (boglar.length !== 1) return { scope: null, warning: 'Shartnoma tanlanmagan yoki bir nechta bog‘lanish bor; shartnoma rekvizitlari bo‘sh qoldiriladi.' };
    const shartnomalar = await sbT2ShartnomalarOl(companyId, false);
    const shartnoma = shartnomalar.ok ? (shartnomalar.qatorlar ?? []).find((x) => x.id === boglar[0].shartnoma_id) : undefined;
    if (!shartnoma) return { scope: null, warning: 'Shartnoma rekvizitlari o‘qilmadi; hujjatda ular bo‘sh qoldiriladi.' };
    const hierarchy = validatePtoHierarchy({
      companyId, projectId: Number(loyihaId), objectId: Number(objectId), contractId: shartnoma.id,
      projectCompanyId: companyId,
      objectCompanyId: obyektKompaniyaId,
      objectProjectId: Number(loyihaId),
      contractCompanyId: shartnoma.kompaniya_id,
      contractProjectId: shartnoma.loyiha_id,
      linkedContractIds: [shartnoma.id],
    });
    if (!hierarchy.ok) { setXato('Shartnoma tanlangan kompaniya, loyiha va obyektga mos kelmayapti. Bog‘lanishni tekshiring.'); return null; }
    return { scope: { companyId, projectId: Number(loyihaId), objectId: Number(objectId), contractId: shartnoma.id, periodId: davr } };
  };

  /** ФОРМА № 3 — СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ (счет-фактура
   *  к актам формы № 2). Manba: to‘liq nakopitelniy + TASDIQLANGAN F2 oylik
   *  summalari (t2_f2_tafsilot, akt_holat='tasdiqlangan') + tasdiqlangan
   *  olib_tashlash o‘zgarishlari (СМЕТНАЯ dan chiqadi). Egasi qarori (2026-09-26):
   *  jami — nakrutka kaskadi, «за отчетный период» ВСЕГО К ОПЛАТЕ = shu davr
   *  tasdiqlangan F2 к оплате jamisi (tiyingacha); farq — diqqat, yashirilmaydi. */
  const [forma3Busy, setForma3Busy] = useState(false);
  const [forma3Diqqat, setForma3Diqqat] = useState<Array<{ nom: string; sabab: string }>>([]);
  const forma3EksportQil = async (korish = false) => {
    setXato(''); setForma3Diqqat([]);
    const ux = ustamaTayyorEmas(); if (ux) { setXato(ux); return; }
    if (!objectId || !davr) { setXato('F3 uchun tasdiqlangan F2 davri yo‘q — hujjat yasalmadi.'); return; }
    setForma3Busy(true);
    try {
      const context = await canonicalScopeOl();
      if (!context) return;
      const scope = context.scope;
      const rows = await toliqQatorlar();
      if (!rows) return;
      const taf = await sbT2F2TafsilotOl({ obyektId: Number(objectId), tur: 'f2' });
      if (!taf.ok || taf.toliq === false || !taf.qatorlar) {
        setXato('F2 qatorlari to‘liq o‘qilmadi — F3 chala ma’lumot ustida tuzilmaydi.'); return;
      }
      const f2Oylik = f3CertifiedSources(taf.qatorlar, companyId, Number(objectId), davr.slice(0, 7));
      const sourceRows = new Map<string, Set<number>>();
      for (const line of f2Oylik) {
        const key = `${line.akt_id}:${line.oy}`;
        if (!sourceRows.has(key)) sourceRows.set(key, new Set());
        sourceRows.get(key)!.add(line.qator_id);
      }
      const lineage: PtoF3LineageInput | undefined = scope && f2Oylik.length ? {
        scope,
        sources: [...sourceRows].map(([key, ids]) => {
            const split = key.lastIndexOf(':');
            const akt = key.slice(0, split);
            const oy = key.slice(split + 1);
            return { documentId: `F2-AKT:${akt}`, scope: { ...scope, periodId: oy }, approved: true, qatorIds: [...ids] };
          }),
      } : undefined;
      let ozgarishlar: Forma3ExportOptions['ozgarishlar'] = [];
      try {
        const oz = await ozgarishRoyxatOl(Number(objectId), 500);
        ozgarishlar = ((oz?.ozgarishlar ?? []) as Array<{ holat?: string | null; tur?: string | null; qatorlar?: Array<{ qator_id?: number | null; amal?: string | null }> }>)
          .filter((o) => o.tur === 'olib_tashlash' && o.holat === 'tasdiqlangan')
          .map((o) => ({
            holat: String(o.holat), tur: String(o.tur),
            qatorlar: (o.qatorlar ?? []).filter((z) => z.qator_id != null && !!z.amal)
              .map((z) => ({ qator_id: Number(z.qator_id), amal: String(z.amal) })),
          }));
      } catch { /* ro‘yxat o‘qilmasa СМЕТНАЯ o‘zgarmaydi — davom etamiz */ }
      const h = forma3Hujjat(
        { nakopitelniy: [{ obyekt_id: Number(objectId), obyektNom, qatorlar: rows }], f2Oylik, f2Hajm: f3CertifiedHajm(taf.qatorlar, companyId, Number(objectId), davr.slice(0, 7)) },
        {
          obyektNom, davr, asosiyObyektId: Number(objectId), imzo: tomonlar, nakrutka, podval, ndsFoiz: stavkaOl(),
          smetaNakrutka, ozgarishlar, lineage, lineageRequired: Boolean(lineage),
          pudratchi: pudratchiRek, zakazchik: zakazchikRek,
          shartnomaRaqam: shartnoma?.raqam ?? null, shartnomaSana: shartnoma?.sana ?? null, shartnomaSumma: shartnoma?.summa ?? null,
        },
      );
      setForma3Diqqat([...h.diqqat, ...(context.warning ? [{ nom: 'Rekvizitlar', sabab: context.warning }] : []), ...(!f2Oylik.length ? [{ nom: 'F2 manbasi', sabab: 'Bu davrgacha tasdiqlangan F2 yo‘q; bajarilgan ish qiymatlari bo‘sh hisobot sifatida beriladi.' }] : [])]);
      const t = await hujjatTokenBilan({ kompaniyaId: companyId, bytes: h.bytes, hujjat: 'F3', sabab: `Форма №3 · ${obyektNom} · ${davr.slice(0, 7)}`, obyekt: objectId },
        () => { if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi); });
      if (!t.ok) { toast(t.xabar, 'danger'); return; }
      if (t.xabar) toast(t.xabar, 'ok');
      // F3 — rasmiy hujjat: R2 arxivga o'zgarmas versiya (davr bo'yicha; aynan bir xil mazmun qayta saqlanmaydi).
      if (f2Oylik.length) {
        void hujjatArxivla({ kompaniyaId: companyId, loyihaId: loyihaId ?? null, obyektId: Number(objectId), turi: 'f3', faylNomi: h.faylNomi, bytes: h.bytes, davr: davr.slice(0, 7) })
          .then((a) => { if (!a.ok) toast('F3 arxivga saqlanmadi — keyinroq qayta chiqaring.', 'warn'); else if (!a.takror) toast(`F3 arxivga saqlandi (v${a.versiya})`, 'ok'); });
      }
    } catch (e) {
      setXato(e instanceof Error && e.message === 'MISSING_CERTIFIED_AMOUNT'
        ? 'Tasdiqlangan F2 manba summasi yetishmaydi. Manba hujjatni tekshiring; qiymat taxminan hisoblanmaydi.'
        : 'F3 fayli tuzilmadi. Hujjat manbalari va bog‘lanishlarini tekshiring.');
    } finally { setForma3Busy(false); }
  };

  /* F2 tarixidan «Форма №3» havolasi (?f3=1&davr=…): barcha manbalar (nakrutka, podval, shartnoma, rekvizit) yuklanib,
   * 1,5 s o'zgarmay turgach F3 ko'rinishi bir marta o'zi ochiladi. Davr mos kelmasa - noto'g'ri oyga hujjat yasalmaydi. */
  const f3Avto = useRef<{ davr: string } | null>((() => {
    const p = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    return p.get('f3') === '1' ? { davr: (p.get('davr') ?? '').slice(0, 7) } : null;
  })());
  useEffect(() => {
    const a = f3Avto.current;
    if (!a || busy || !objectId || !davr || !qatorlar.length || (!podvalOqildi && !nakrutkaXato)) return;
    if (a.davr && davr.slice(0, 7) !== a.davr) { f3Avto.current = null; toast(t('F3 davri F2 davriga mos kelmadi — kerakli davrni tanlab «Форма № 3» ni bosing.'), 'warn'); return; }
    const timer = window.setTimeout(() => { if (f3Avto.current) { f3Avto.current = null; void forma3EksportQil(true); } }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, objectId, davr, qatorlar.length, nakrutka, podval, podvalOqildi, nakrutkaXato, shartnoma, zakazchikRek, pudratchiRek, tomonlar]);

  const korinish = useHujjatKorinish();
  const eksportQil = async (korish = false) => {
    setXato('');
    const ux = ustamaTayyorEmas(); if (ux) { setXato(ux); return; }
    try {
      const rows = await toliqQatorlar();
      if (!rows) return;
      // Egasi 2026-09-30: har tasdiqlangan F2 oyi alohida ustun + ИТОГО (manba — F3 bilan bir xil certified F2).
      const taf = await sbT2F2TafsilotOl({ obyektId: Number(objectId), tur: 'f2' });
      const oylar = taf.ok && taf.toliq !== false && taf.qatorlar && davr ? f2OyKesimi(taf.qatorlar, davr.slice(0, 7)) : null;
      const h = nakopitelniyVedomostHujjat(rows, { obyektNom, davr, imzo: tomonlar, ndsFoiz: stavkaOl(), smetaNakrutka, nakrutka, podval, oylar, svodYaxlit });
      const t = await hujjatTokenBilan({ kompaniyaId: companyId, bytes: h.bytes, hujjat: 'NAKOPITELNIY', sabab: `Накопительная ведомость · ${obyektNom} · ${davr}`, obyekt: objectId },
        () => { if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi); });
      if (!t.ok) toast(t.xabar, 'danger'); else if (t.xabar) toast(t.xabar, 'ok');
    } catch (e) { setXato(e instanceof HujjatToliqEmasXato ? 'Hujjat to‘liq emas — eksport bloklandi.' : 'Excel fayli tuzilmadi.'); }
  };

  const davrQator = davrlar.find((d) => d.oy === davr);
  const sertifikat = davrQator?.certified === true;
  const tasdiqlanganSoni = davrlar.filter((d) => d.certified).length;
  const davrOzgartir = (oy: string) => { if (objectId) void yukla(Number(objectId), oy); };
  const eksportOchiq = qatorlar.length > 0;

  const amallar = (
    <>
      <button type="button" className="fz-btn fz-btn--ghost" disabled={!objectId || busy} onClick={() => void yukla(Number(objectId), davr)}>
        <RefreshCw className={busy ? 'animate-spin' : ''} /> {t('Yangilash')}
      </button>
      {eksportOchiq && (
        <button type="button" className="fz-btn fz-btn--icon" onClick={() => void eksportQil(true)} disabled={eksportBusy}
          title={t('Накопительная ведомость — saytda hujjatdagiday ko‘rish')} aria-label={t('Nakopitelniy ko‘rish')}><Eye /></button>
      )}
      {eksportOchiq && !!davr && (
        <AmalMenyu matn={t('Форма № 3')} ikonka={<FileText size={16} />} ochirilgan={eksportBusy || forma3Busy} bandlar={[
          { kalit: 'f3-yuklash', belgi: <Download size={16} />, matn: t('Форма № 3 — Excel yuklab olish'), sarlavha: t('СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ (счет-фактура к актам Ф-2)'), onBos: () => void forma3EksportQil(false) },
          { kalit: 'f3-korish', belgi: <Eye size={16} />, matn: t('Форма № 3 — saytda ko‘rish'), aria: t('F3 ko‘rish'), sarlavha: t('Форма № 3 — saytda hujjatdagiday ko‘rish'), onBos: () => void forma3EksportQil(true) },
          ...(objectId ? [{ kalit: 'f2-tarix', belgi: <History size={16} />, matn: t('Ф-2 — F2 tarixida'), sarlavha: t('Ф-2 hujjati yagona shaklda — F2 tarixida (har tasdiqlangan akt uchun)'), href: `/admin/f2-tarix?obyekt=${objectId}`, ajrat: true }] : []),
        ]} />
      )}
      {eksportOchiq && (
        <button type="button" className="fz-btn fz-btn--primary" onClick={() => void eksportQil(false)} disabled={eksportBusy}>
          <Download /> {t('XLSX eksport')}
        </button>
      )}
    </>
  );

  return (
    <Sahifa sarlavha={t('Nakopitelniy vedomost')} tavsif={t('Tasdiqlangan F2 aktlarining oyma-oy kumulyativ reestri: smeta, fakt va topshirilgan ish bir joyda.')} amallar={amallar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {korinish.oyna}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 'var(--space-4)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
            <span className="fz-kpi__label">{t('Obyekt')}</span>
            <select aria-label={t('Obyekt')} className="input" style={{ height: 'var(--control-md)', padding: '0 8px' }}
              value={objectId} onChange={e => setObjectId(e.target.value)}>
              <option value="">{t('Tanlang')}</option>
              <ObyektOptionlari obyektlar={objects} />
            </select>
          </label>
          {!!davrlar.length && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="fz-kpi__label">{t('Davr')}</span>
              <select aria-label={t('Davr')} className="input" style={{ height: 'var(--control-md)', padding: '0 8px' }}
                value={davr} onChange={e => void yukla(Number(objectId), e.target.value)}>
                {davrlar.map(d => <option key={d.oy} value={d.oy}>{d.certified ? d.oy : `${d.oy} (${t('qoralama')})`}</option>)}
              </select>
            </label>
          )}
          {!!davr && !!davrQator && (
            <span className={'fz-stamp ' + (sertifikat ? 'fz-stamp--ok' : 'fz-stamp--warn fz-stamp--draft')} style={{ alignSelf: 'flex-end', marginBottom: 6 }}
              title={sertifikat ? t('Tasdiqlangan F2 — jami hisobiga kiradi') : t('Qoralama F2 — jami hisobiga kirmaydi')}>
              {sertifikat ? t('Tasdiqlangan') : t('Qoralama')}
            </span>
          )}
          {!!davrlar.length && <span style={{ alignSelf: 'flex-end', marginBottom: 6, fontSize: 12, color: 'var(--text-mute)' }}>{t('Tasdiqlangan oylar: {a} / {b}', { a: tasdiqlanganSoni, b: davrlar.length })}</span>}
          {qatorlar.length > 0 && (
            <label style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="fz-kpi__label">{t('Qidirish')}</span>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-mute)' }} />
                <input aria-label={t("Kod yoki nom bo'yicha qidirish")} className="input" style={{ width: '100%', height: 'var(--control-md)', padding: '0 8px 0 28px' }}
                  placeholder={t("Kod yoki nom bo'yicha qidirish…")} value={qidiruv}
                  onChange={e => setQidiruv(e.target.value)} />
              </div>
            </label>
          )}
        </div>
        <DavrChiziq davrlar={davrlar} davr={davr} onTanla={davrOzgartir} band={busy} />

        {!!davrQator && !sertifikat && (
          <div className="fz-note fz-note--warn"><AlertTriangle />
            <span>{t('Tanlangan oy — F2 qoralama. U oldingi / joriy / jami summalarga KIRMAGAN: reestrda faqat tasdiqlangan oylar hisoblanadi.')}</span>
          </div>
        )}
        {!objectId && <div className="fz-note fz-note--info"><span>{t('Reestrni ko‘rish uchun yuqoridan obyektni tanlang.')}</span></div>}

        {busy && <p role="status" style={{ margin: 0 }}>{progress?.jami ? t('Yuklanmoqda… {n} / {jami} qator', { n: progress.yuklandi.toLocaleString('ru-RU'), jami: progress.jami.toLocaleString('ru-RU') }) : t('Yuklanmoqda…')}</p>}
        {eksportBusy && <p role="status" style={{ margin: 0 }}>{t('To‘liq ro‘yxat serverdan sahifalab o‘qilmoqda…')}</p>}
        {forma3Busy && <p role="status" style={{ margin: 0 }}>{t('Форма № 3 manbalari yig‘ilmoqda (nakopitelniy + tasdiqlangan F2)…')}</p>}
        {xato && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle /><span>{xato}</span></div>}
        {forma3Diqqat.length > 0 && (
          <details className="fz-note fz-note--warn" style={{ display: 'block' }}>
            <summary style={{ cursor: 'pointer' }}>{t('Форма № 3 diqqatlar: {n} ta (hujjatda ham yozilgan)', { n: forma3Diqqat.length })}</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20, listStyle: 'disc' }}>
              {forma3Diqqat.slice(0, 12).map((d, i) => <li key={i}><b>{d.nom}</b> — {d.sabab}</li>)}
            </ul>
          </details>
        )}

        {jami && <NakopitelniyKpi jami={jami} qatorlar={qatorlar} truncated={truncated} obyektId={Number(objectId)} kompaniyaId={companyId}
          smetaNakrutka={smetaNakrutka} smetaNakrutkaSabab={smetaNakrutkaHisob.sabab} kaskadBor={!!nakrutkaKaskadi} davr={davrQator} />}

        {/* Firuza (egasi 2026-10-25): oyma-oy F2 va jamlanma grafigi. */}
        {jami && <NakopitelniyGrafik kesim={oyKesim} smeta={jami.smeta_summa} fakt={jami.fakt_summa} />}

        {qatorlar.length > 0 && (
          <NakopitelniyJadval qatorlar={qatorlar} korinadigan={gorunumRows} oyKesim={oyKesim} jami={jami} truncated={truncated} filtrBor={!!filtr} />
        )}

        {qatorlar.length > 0 && (
          <details className="fz-panel" style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <Settings2 size={15} />{t('Hujjat sozlamalari: imzolovchilar va QQS')}
              <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--text-mute)', fontSize: 12 }}>{ndsFoiz.trim() === '' ? t('QQS qo‘shilmaydi') : t('QQS {p}%', { p: ndsFoiz })}</span>
            </summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
              <div style={{ minWidth: 280, flex: 1 }}><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} tafsilot={imzoTafsilot} /></div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-dim)', maxWidth: 260 }} title={t('F2 resurs qatorlari QQS siz; QQS hujjat oxirida bir marta qo‘shiladi')}>
                <span className="fz-kpi__label">{t('QQS (НДС) stavkasi, % — hujjat oxirida bir marta')}</span>
                <input aria-label={t('QQS stavkasi')} value={ndsFoiz} onChange={e => setNdsFoiz(e.target.value)} placeholder={t('bo‘sh — QQS qo‘shilmaydi')}
                  className="input" style={{ width: 120, height: 'var(--control-md)', padding: '0 8px' }} inputMode="decimal" />
              </label>
            </div>
          </details>
        )}

        {objectId && obyektKompaniyaId === companyId && (
          <PereraschetBolimi key={objectId} companyId={companyId} obyektId={Number(objectId)} obyektNom={obyektNom} tomonlar={tomonlar} ndsFoiz={stavkaOl()} />
        )}
        {shartnomaId != null && (
          <ShartnomaSvodBolimi companyId={companyId} shartnomaId={shartnomaId} tashkilot={kompaniyalar.find((x) => x.id === companyId)?.nom ?? null} />
        )}
        {/* Egasi 2026-10-26: 1C akt-sverka importi — kompaniya darajasida (bir faylda bir nechta shartnoma). */}
        <SverkaImportPanel companyId={companyId} />
        {objectId && !busy && !xato && !qatorlar.length && (
          <div className="fz-note fz-note--info"><span>{t('Bu obyektda smeta qatori topilmadi.')}</span></div>
        )}
      </div>
    </Sahifa>
  );
}

/* ═══════════ Shartnoma darajasi (egasi 2026-10-23): DS → F2 → F3 (sotuv summasidan) → to'lov → akt-sverka ═══════════
 * Shu sahifaning bo'limi (alohida sahifa emas). Hisob — lib/nakopitelniy-svod.ts; Excel — nakopitelniy-vedomost-export.ts
 * (svod, akt-sverka) va forma3-export.ts (F3 sotuvdan). Hujjatlar token orqali beriladi. */
type SvodKiritishTur = 'f3' | 'tolov' | 'ds';
type SvodShakl = { tur: SvodKiritishTur; sana: string; raqam: string; summa: string; tolovTur: TolovTur; izoh: string };
const SVOD_BOSH: SvodShakl = { tur: 'f3', sana: '', raqam: '', summa: '', tolovTur: 'tolov', izoh: '' };
const svodPul = (x: number | null | undefined) => (x == null ? '—' : somga(x).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const svodSana = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('.') : '—');
const svodKirit = 'input w-full h-8 px-2 text-[13px]';

function ShartnomaSvodBolimi({ companyId, shartnomaId, tashkilot }: { companyId: number; shartnomaId: number; tashkilot: string | null }) {
  const [hammasi, setHammasi] = useState<SvodShartnoma[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [dan, setDan] = useState('');
  const [gacha, setGacha] = useState('');
  const [shakl, setShakl] = useState<SvodShakl>(SVOD_BOSH);
  const [joylash, setJoylash] = useState('');
  const [tahlil, setTahlil] = useState<SverkaImportNatija | null>(null);

  const yukla = async () => {
    const r = await shartnomaSvodOl(companyId);
    if (r.ok) { setHammasi(r.natija.shartnomalar); setXato(null); } else setXato(r.error);
  };
  useEffect(() => { void yukla(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, shartnomaId]);

  const sh = hammasi?.find((x) => x.id === shartnomaId) ?? null;
  const sv = useMemo(() => (sh ? shartnomaSvodi(sh) : null), [sh]);
  const sverka = useMemo(() => (sh ? sverkaHisobla(sh, { dan: dan || null, gacha: gacha || null }) : null), [sh, dan, gacha]);

  async function ber(h: { bytes: Uint8Array; faylNomi: string } | null, hujjat: string, sabab: string) {
    if (!h) return;
    const r = await hujjatTokenBilan({ kompaniyaId: companyId, bytes: h.bytes, hujjat, sabab }, () => downloadBlob(h.bytes, h.faylNomi));
    if (!r.ok) { toast(r.xabar, 'danger'); return; }
    if (r.xabar) toast(r.xabar, 'ok');
  }
  async function yoz(tur: SverkaYozuvTur, malumot: Record<string, string | number | null>, yozuvId?: number, versiya?: number) {
    const r = await sverkaYozuvYoz({ kompaniyaId: companyId, shartnomaId, tur, yozuvId, kutilganVersiya: versiya, malumot, operationId: yangiOperationId() });
    if (!r.ok) toast(t(sverkaXato(r)), 'danger');
    return r.ok;
  }
  async function qosh() {
    if (band) return;
    const summa = Number(shakl.summa);
    if (!shakl.sana || !Number.isFinite(summa) || summa === 0) { toast(t('Sana va summani kiriting'), 'danger'); return; }
    setBand(true);
    let ok: boolean;
    if (shakl.tur === 'tolov') {
      const r = await tolovYoz({ kompaniyaId: companyId, shartnomaId, summa: Math.abs(summa), tur: shakl.tolovTur, sana: shakl.sana, izoh: shakl.izoh || null, operationId: yangiOperationId() });
      ok = r.ok; if (!r.ok) toast(t(sverkaXato(r)), 'danger');
    } else if (shakl.tur === 'f3') {
      ok = await yoz('f3_sotuv', { sotuv_sana: shakl.sana, raqam: shakl.raqam || null, sotuv_summa: summa, izoh: shakl.izoh || null });
    } else {
      ok = await yoz('ds', { sana: shakl.sana, raqam: shakl.raqam, jami_nds_bilan: summa, izoh: shakl.izoh || null });
    }
    setBand(false);
    if (ok) { toast(t('Saqlandi'), 'ok'); setShakl({ ...SVOD_BOSH, tur: shakl.tur }); void yukla(); }
  }
  async function joylashniKirit() {
    if (!tahlil || band) return;
    setBand(true);
    let soni = 0, xatoSoni = 0;
    for (const q of tahlil.qatorlar) {
      const r = q.tur === 'sotuv'
        ? await sverkaYozuvYoz({ kompaniyaId: companyId, shartnomaId, tur: 'f3_sotuv', malumot: { sotuv_sana: q.sana, raqam: q.raqam, sotuv_summa: q.summa }, operationId: yangiOperationId() })
        : await tolovYoz({ kompaniyaId: companyId, shartnomaId, summa: q.summa, tur: q.tur, sana: q.sana, izoh: t('Akt-sverkadan'), operationId: yangiOperationId() });
      if (r.ok) soni++; else xatoSoni++;
    }
    setBand(false);
    toast(t('Kiritildi: {soni}; xato yoki takror: {xato}', { soni: String(soni), xato: String(xatoSoni) }), xatoSoni ? 'warn' : 'ok');
    setJoylash(''); setTahlil(null); void yukla();
  }
  async function bekor(tur: SverkaYozuvTur, id: number, versiya: number) {
    if (!(await tasdiqSora({ matn: t('Yozuvni bekor qilasizmi?'), xavfli: true }))) return;
    if (await yoz(tur, { holat: 'bekor' }, id, versiya)) void yukla();
  }

  if (xato) return <div role="alert" className="fz-note fz-note--danger"><AlertTriangle /><span>{t(xato)}</span></div>;
  if (!sh || !sv || !sverka) return null;
  const qoldiqRang = (x: number): CSSProperties | undefined => (x > 0 ? { color: 'var(--ok)' } : x < 0 ? { color: 'var(--danger)' } : undefined);
  const nom0 = t('Boshlang‘ich qoldiq');
  return (
    <section className="fz-card" aria-label={t('Shartnoma bo‘yicha: F3, to‘lov va akt-sverka')}>
      <div className="fz-card__head">
        <div>
          <h2 className="fz-card__title">{t('Shartnoma bo‘yicha: F3, to‘lov va akt-sverka')} — № {sh.raqam}</h2>
          <p className="fz-card__sub">{t('Shartnoma → F2 → F3 → to‘lov → qoldiq: pul oqimi bir qarashda')}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <button type="button" className="fz-btn" onClick={() => void ber(sverkaXlsx(sh, { tashkilot, dan: dan || null, gacha: gacha || null }), 'AKT_SVERKA', `Акт сверки № ${sh.raqam}`)}>
            <Download />{t('Akt-sverka (Excel)')}
          </button>
          <button type="button" className="fz-btn" onClick={() => void ber(hammasi ? shartnomaSvodXlsx(hammasi, { tashkilot }) : null, 'NAKOPITELNIY', 'Накопительная по договорам')}>
            <FileSpreadsheet />{t('Barcha shartnomalar svodi (Excel)')}
          </button>
        </div>
      </div>
      <div className="fz-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <ShartnomaQuvur shartnoma={sv.joriy.summa == null ? null : tiyin(sv.joriy.summa)} f2={sv.f2} f3={sv.f3} tolov={sv.tolov} qoldiq={sv.qoldiq} pul={svodPul} />
        {sv.ogohlantirishlar.map((g) => <div key={g.kod} className="fz-note fz-note--warn"><AlertTriangle />{t(g.matn)}</div>)}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 'var(--space-3)' }}>
          <Maydon nom={t('Dan')}><input type="date" className={svodKirit} value={dan} onChange={(e) => setDan(e.target.value)} /></Maydon>
          <Maydon nom={t('Gacha')}><input type="date" className={svodKirit} value={gacha} onChange={(e) => setGacha(e.target.value)} /></Maydon>
        </div>
        <div className="fz-table-wrap" style={{ maxHeight: 420 }}>
          <table className="fz-table">
            <thead><tr>
              <th>{t('Sana')}</th><th>{t('Hujjat')}</th>
              <th className="fz-c-num" style={{ textAlign: 'right' }}>{t('Debet (sotuv)')}</th><th className="fz-c-num" style={{ textAlign: 'right' }}>{t('Kredit (to‘lov)')}</th><th className="fz-c-num" style={{ textAlign: 'right' }}>{t('Qoldiq')}</th><th />
            </tr></thead>
            <tbody>
              <tr className="fz-row-rz"><td /><td>{nom0}</td><td /><td /><td className="fz-c-num" style={qoldiqRang(sverka.boshlangich)}>{svodPul(sverka.boshlangich)}</td><td /></tr>
              {sverka.qatorlar.map((q) => {
                const f3 = q.tur === 'sotuv' ? sh.f3.find((x) => x.id === q.manbaId) : undefined;
                return (
                  <tr key={`${q.tur}-${q.manbaId}`}>
                    <td className="fz-c-unit">{svodSana(q.sana)}</td><td>{q.hujjat}</td>
                    <td className="fz-c-num">{q.debet ? svodPul(q.debet) : ''}</td>
                    <td className="fz-c-num" style={q.kredit ? { color: 'var(--ok)' } : undefined}>{q.kredit ? svodPul(q.kredit) : ''}</td>
                    <td className="fz-c-num" style={{ fontWeight: 600, ...qoldiqRang(q.qoldiq) }}>{svodPul(q.qoldiq)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {f3 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <select aria-label={t('F3 holati')} className="input" style={{ height: 28, padding: '0 6px', fontSize: 12 }} value={f3.holat}
                            onChange={(e) => void yoz('f3_sotuv', { holat: e.target.value as F3Holat }, f3.id, f3.versiya).then((ok) => { if (ok) void yukla(); })}>
                            <option value="qoralama">{t('tayyorlanmagan')}</option>
                            <option value="tayyor">{t('tayyor (yuborildi)')}</option>
                            <option value="imzolangan">{t('imzolandi')}</option>
                          </select>
                          <button type="button" title={t('F3 (Excel)')} aria-label={t('F3 (Excel)')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"
                            onClick={() => void ber(forma3SotuvdanXlsx(sh, f3.id, { tashkilot }), 'F3', `Форма №3 · № ${sh.raqam} · ${f3.sotuv_sana ?? ''}`)}><Download /></button>
                          <button type="button" title={t('Bekor qilish')} aria-label={t('Bekor qilish')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" style={{ color: 'var(--danger)' }} onClick={() => void bekor('f3_sotuv', f3.id, f3.versiya)}><Trash2 /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="fz-row-total"><td /><td>{t('Aylanma va yakuniy qoldiq')}</td>
                <td className="fz-c-num">{svodPul(sverka.debetJami)}</td><td className="fz-c-num">{svodPul(sverka.kreditJami)}</td>
                <td className="fz-c-num" style={qoldiqRang(sverka.yakuniy)}>{svodPul(sverka.yakuniy)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        {sh.ds.length !== 0 && (
          <div className="fz-panel">
            <div className="fz-panel__h"><span>{t('Qo‘shimcha kelishuvlar (DS)')}</span></div>
            {sh.ds.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{t('DS')} № {d.raqam} · {svodSana(d.sana)}</span><span className="tabular-nums" style={{ marginLeft: 'auto', fontWeight: 600 }}>{svodPul(tiyin(d.jami_nds_bilan))}</span>
                <button type="button" title={t('Bekor qilish')} aria-label={t('Bekor qilish')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" style={{ color: 'var(--danger)' }} onClick={() => void bekor('ds', d.id, d.versiya)}><Trash2 /></button>
              </div>
            ))}
          </div>
        )}

        <div className="fz-panel">
          <div className="fz-panel__h"><span>{t('Yangi yozuv kiritish')}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
            <Maydon nom={t('Yozuv turi')}>
              <select className={svodKirit} value={shakl.tur} onChange={(e) => setShakl({ ...shakl, tur: e.target.value as SvodKiritishTur })}>
                <option value="f3">{t('Sotuv (F3)')}</option><option value="tolov">{t('To‘lov')}</option><option value="ds">{t('Qo‘shimcha kelishuv (DS)')}</option>
              </select></Maydon>
            <Maydon nom={t('Sana')}><input type="date" className={svodKirit} value={shakl.sana} onChange={(e) => setShakl({ ...shakl, sana: e.target.value })} /></Maydon>
            {shakl.tur === 'tolov'
              ? <Maydon nom={t('To‘lov turi')}>
                  <select className={svodKirit} value={shakl.tolovTur} onChange={(e) => setShakl({ ...shakl, tolovTur: e.target.value as TolovTur })}>
                    <option value="tolov">{t('To‘lov')}</option><option value="avans">{t('Avans')}</option><option value="qaytarim">{t('Qaytarim')}</option>
                  </select></Maydon>
              : <Maydon nom={t('Raqam')}><input className={svodKirit} value={shakl.raqam} onChange={(e) => setShakl({ ...shakl, raqam: e.target.value })} /></Maydon>}
            <Maydon nom={shakl.tur === 'ds' ? t('Yangi shartnoma summasi (QQS bilan)') : t('Summa (QQS bilan)')}>
              <MoneyInput aria-label={t('Summa (QQS bilan)')} inputMode="decimal" className={`${svodKirit} tabular-nums`} value={shakl.summa} onValueChange={(v) => setShakl({ ...shakl, summa: v })} /></Maydon>
            <Maydon nom={t('Izoh')}><input className={svodKirit} value={shakl.izoh} onChange={(e) => setShakl({ ...shakl, izoh: e.target.value })} /></Maydon>
            <button type="button" disabled={band} className="fz-btn fz-btn--primary" onClick={() => void qosh()}>
              <Plus />{t('Qo‘shish')}
            </button>
          </div>
        </div>

        <div className="fz-panel">
          <div className="fz-panel__h"><span>{t('Akt-sverkadan joylash')}</span></div>
          <textarea aria-label={t('Akt-sverkadan joylash (Sana · Hujjat · Debet · Kredit)')} placeholder={t('Akt-sverkadan joylash (Sana · Hujjat · Debet · Kredit)')}
            className={`${svodKirit} font-mono`} style={{ height: 72, padding: 8 }} value={joylash} onChange={(e) => { setJoylash(e.target.value); setTahlil(null); }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)', fontSize: 12 }}>
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => setTahlil(sverkaMatniniOqi(joylash))}><ClipboardPaste />{t('Tekshirish')}</button>
            {tahlil && (
              <>
                <span>{t('Sotuv: {s}, to‘lov: {t}, tushunilmagan: {x}', { s: String(tahlil.qatorlar.filter((q) => q.tur === 'sotuv').length), t: String(tahlil.qatorlar.filter((q) => q.tur !== 'sotuv').length), x: String(tahlil.xatolar.length) })}</span>
                <button type="button" disabled={band || !tahlil.qatorlar.length} className="fz-btn fz-btn--sm fz-btn--primary" onClick={() => void joylashniKirit()}>{t('Kiritish')}</button>
              </>
            )}
          </div>
        </div>
        <PulTahlil companyId={companyId} shartnomaId={shartnomaId} obyektlar={sh.obyektlar.map((o) => ({ id: o.id, nom: o.nom }))} />
      </div>
    </section>
  );
}

export default function NakopitelniyVedomost() {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={joriy.id} companyId={joriy.id} />;
}
