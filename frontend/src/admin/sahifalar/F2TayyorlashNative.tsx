import { TayyorlanganF2lar } from './TayyorlanganF2lar';
import { tkmBirlikmi, tkmTaklif } from '../../lib/f2-moslash-v3/tkm';
import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { isCompleteMoney, reportMoneyValidity } from '../../lib/money-input';
import { t } from '../../i18n/til';
import type { KeyboardEvent } from 'react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Eye, Save, Search, Zap } from 'lucide-react';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { sbT2AktYaratV2, sbT2DaraxtOl, sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt, type T2Qator } from '../../api/supabase';
import { T2_DARAXT_USTUNLARI } from '../../api/t2-daraxt-ustunlar';
import { sbQatorHolatOl, sbF2QoralamaHajmlar, type QatorHolat } from '../../api/t2-fakt';
import { f2Hujjat } from '../../lib/f2-hujjat';
import { mazmunXeshi, tokenBilan } from '../../api/t2-token';
import { f2HujjatKaliti } from '../../api/f2-hujjat-kontekst';
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
import { obyektPodvali } from '../../api/t2-nakrutka-podval';
import { sbAosrCoverageOl, type AosrCoverage } from '../../api/t2-aosr';
import { amaldagiProtokolNarxlari, narxProtokolQatorlariOl, type NarxProtokolQator } from '../../api/t2-narx-protokol';
import {
  NARX_MANBA_NOMI, bolimDaraxti, bosKiritma, f2Jami, f2KatKesim, f2Qatorlar, f2Qur, f2Yacheykalar, f2Yuk, ishBirlikNarxi, korinadiganBolimlar, narxsizNomzodlar, sonOqi, ulushHajm,
  type F2Bolim, type F2Ish, type F2Kiritma, type F2Manba, type F2Qator, type F2Resurs,
} from '../../lib/f2-tayyor';

const oyBoshlanishi = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
const XATO_MATN: Record<NonNullable<F2Qator['xato']>, string> = { HAJM: 'Hajm 0 dan katta son bo‘lsin', NARX: 'Narx kerak (yoki «narxsiz» belgilang)', SUMMA: 'Summa son emas' };
const OGOH_MATN: Record<NonNullable<F2Qator['ogoh']>, string> = { RESURS_CHEGARA: 'resurs fakt qoldig‘i bilan cheklandi', ARIFMETIKA: 'summa hajm × narxdan farq qiladi — hujjat summasi saqlanadi', SMETADAN_OSHDI: 'smeta hajmidan oshadi (ruxsat, ogohlantirish)', AXBOROT_NARXSIZ: 'axborot qatori: narxsiz (smetada narxi yo‘q)', QOLDIQDAN_OSHDI: 'fakt qoldig‘idan oshadi (ruxsat, ogohlantirish)', QORALAMA_TAKROR: 'qoralamadagi F2 bilan birga ikki marta olinadi — tekshiring' };
/** Hajm qoldiqdan oshgan ogohlantirishlar - maydon sariq (blok emas). */
const OSH_OGOH = new Set<F2Qator['ogoh']>(['SMETADAN_OSHDI', 'QOLDIQDAN_OSHDI', 'QORALAMA_TAKROR']);
const KAT_RANG: Record<string, string> = { ЧЕЛ: 'bg-sky-500/10 text-sky-500', МАШ: 'bg-amber-500/10 text-amber-500', МАТ: 'bg-emerald-500/10 text-emerald-500' };
const kirit = 'rounded border border-border bg-bg px-2 py-1 text-right tabular-nums outline-none focus:border-accent';

/**
 * F2 tayyorlash (egasi, 2026-10-01: "fakt kiritishdan ideal F2 gacha").
 * Operator ISH hajmini tanlaydi → resurslari (hajm × norma) avtomatik ergashadi; narx — oldingi F2 → smeta (manba ko'rinadi),
 * summa avtomatik; hujjat raqami bir marta. Server qoidasi o'zgarmaydi: har resursda narx yoki ongli "narxsiz".
 */
export function F2TayyorlashNative() {
  const moneyScope = useRef<HTMLDivElement>(null);
  const { joriy } = useKompaniya();
  const [tomonlar, setTomonlar] = useHujjatTomonlari(joriy?.id);
  const [ndsFoiz, setNdsFoiz] = useState(String(NDS_SUKUT_FOIZ));
  const workspace = usePTOWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [rows, setRows] = useState<T2Qator[]>([]);
  const [holat, setHolat] = useState<QatorHolat[]>([]);
  const [qoralamaHajm, setQoralamaHajm] = useState<ReadonlyMap<number, number>>(new Map());
  /** Протокол согласования цен qatorlari (tasdiqlangan — kuchga kirgan oydan narx ustuvor). */
  const [protokolQ, setProtokolQ] = useState<NarxProtokolQator[]>([]);
  const [k, setK] = useState<F2Kiritma>(bosKiritma);
  /** Hajm manbai: operator tanlamaguncha — obyektda fakt qoldig'i bo'lsa `fakt`, bo'lmasa `smeta` (faktsiz F2). */
  const [manbaTanlov, setManbaTanlov] = useState<F2Manba | null>(null);
  const [oy, setOy] = useState(oyBoshlanishi());
  const [raqam, setRaqam] = useState('');
  const [qidir, setQidir] = useState('');
  /** Bitta almashtirgich: faqat shu davrda hajmi kiritilgan ishlar (hamma bo'limlardan). */
  const [faqatKiritilgan, setFaqatKiritilgan] = useState(false);
  const [bolimId, setBolimId] = useState<number | null | undefined>(undefined);
  const [ochiq, setOchiq] = useState<Set<number>>(new Set());
  /** Bo'lim daraxti yig'iq: faqat shu kalitli (id ?? -1) bo'limlarning farzandlari ochilgan; tanlangan bo'lim ajdodlari doim ochiq. */
  const [kengaygan, setKengaygan] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [aosrsiz, setAosrsiz] = useState<AosrCoverage[]>([]);
  /** Shartnoma liniyasidan: imzolovchilar (buyurtmachi, pudratchi, subpudratchi, texnadzor) va shartnoma raqami. */
  const [avto, setAvto] = useState<{ imzo: ImzoNomlar; shartnoma: string | null }>({ imzo: {}, shartnoma: null });
  const operationId = useRef(yangiOperationId());
  const obyektId = Number(params.get('obyekt'));
  const validId = Number.isSafeInteger(obyektId) && obyektId > 0;

  useEffect(() => {
    if (!joriy?.id) return;
    void sbT2ObyektlarOlKomp(joriy.id).then((result) => setObyektlar((result.ok ? result.qatorlar : []) as T2Obyekt[]));
  }, [joriy?.id]);


  /** Loads are numbered: rows of an object the user already left must never stay under the new object (an F2 act is written from them). */
  const sorov = useRef(0);
  const yuklash = useCallback(async () => {
    const raqam = ++sorov.current;
    const dolzarb = () => raqam === sorov.current;
    if (!validId) { setRows([]); setHolat([]); setProtokolQ([]); setAosrsiz([]); return; }
    setLoading(true); setError(''); setRows([]); setHolat([]);
    try {
      void Promise.resolve().then(() => narxProtokolQatorlariOl(obyektId)).then((r) => { if (dolzarb()) setProtokolQ(r.ok ? (r.qatorlar || []).filter((x) => x.holat === 'tasdiqlangan') : []); }).catch(() => { if (dolzarb()) setProtokolQ([]); });
      void sbAosrCoverageOl(obyektId).then((c) => { if (dolzarb()) setAosrsiz(c.ok ? (c.qatorlar || []).filter((x) => x.yashirin && !x.akt_bor) : []); }).catch(() => { if (dolzarb()) setAosrsiz([]); });
      void Promise.resolve().then(() => sbF2QoralamaHajmlar(obyektId)).then((qh) => { if (dolzarb()) setQoralamaHajm(qh.ok ? qh.hajm : new Map()); }).catch(() => { if (dolzarb()) setQoralamaHajm(new Map()); });
      const [d, h] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbQatorHolatOl(obyektId)]);
      if (!dolzarb()) return;
      if (!d.ok || !h.ok) { setRows([]); setHolat([]); setError('F2 uchun smeta va fakt qoldig‘i o‘qilmadi.'); return; }
      setRows((d.qatorlar || []) as T2Qator[]); setHolat((h.qatorlar || []) as QatorHolat[]);
      setK(bosKiritma()); setBolimId(undefined); setManbaTanlov(null);
      operationId.current = yangiOperationId();
    } catch { if (dolzarb()) { setRows([]); setHolat([]); setError('F2 uchun ma’lumotlar o‘qilmadi. Qayta urinib ko‘ring.'); } }
    finally { if (dolzarb()) setLoading(false); }
  }, [obyektId, validId]);
  useEffect(() => { void yuklash(); }, [yuklash]);

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
  const manba: F2Manba = manbaTanlov ?? (holat.some((h) => Number(h.f2_mumkin_hajm) > 0) ? 'fakt' : 'smeta');
  const bolimlar = useMemo(() => f2Qur(rows, holat, protokolNarx, manba, qoralamaHajm), [rows, holat, protokolNarx, manba, qoralamaHajm]);
  const qatorlar = useMemo(() => f2Qatorlar(bolimlar, k), [bolimlar, k]);
  const jami = useMemo(() => f2Jami(qatorlar), [qatorlar]);
  const katKesim = useMemo(() => f2KatKesim(qatorlar), [qatorlar]);
  const byId = useMemo(() => new Map(qatorlar.map((x) => [x.id, x])), [qatorlar]);
  const narxsizlar = useMemo(() => narxsizNomzodlar(qatorlar), [qatorlar]);
  const aosrsizId = useMemo(() => new Set(aosrsiz.map((x) => x.qator_id)), [aosrsiz]);
  const tayyor = qatorlar.length > 0 && jami.xato === 0;
  const tanlanganBolim = bolimId === undefined ? bolimlar[0]?.id ?? null : bolimId;

  const bolimJami = useMemo(() => {
    const ishBolim = new Map<number, F2Bolim['id']>();
    for (const b of bolimlar) { for (const i of b.ishlar) { ishBolim.set(i.id, b.id); for (const r of i.resurslar) ishBolim.set(r.id, b.id); } for (const r of b.alohida) ishBolim.set(r.id, b.id); }
    const m = new Map<F2Bolim['id'], { summa: number; ish: number }>();
    for (const x of qatorlar) { const b = ishBolim.get(x.id) ?? null; const o = m.get(b) ?? { summa: 0, ish: 0 }; if (x.summa != null) o.summa += x.summa; if (x.tur === 'bl' && !x.xato) o.ish++; m.set(b, o); }
    return m;
  }, [bolimlar, qatorlar]);

  /** 30k qatorli smetada har tugma bosishda qayta filtrlamaslik: qidiruv matni kechiktirib qo'llanadi. */
  const qidirKech = useDeferredValue(qidir);
  const korinadi = useMemo((): F2Bolim[] => {
    const s = qidirKech.trim().toLocaleLowerCase('ru'); const qMos = qidiruvTayyorla(s);
    // «Faqat kiritilganlar»: hamma bo'limlardagi shu davrda hajmi kiritilgan ishlar (bo'lim tanlovi e'tiborga olinmaydi).
    const kiritilgan = (id: number) => k.hajm[id] !== undefined;
    if (!s && !faqatKiritilgan) return bolimlar.filter((b) => b.id === tanlanganBolim);
    // Shifr/nom bo'yicha: lotin va kirill bir xil ko'rinadi (qidiruv-normalizatsiya).
    const mos = (nom: string, kod: string | null) => !s || qMos(nom) || (kod != null && (qMos(kod) || kod.toLocaleLowerCase('ru').includes(s)));
    return bolimlar.map((b) => ({
      ...b,
      ishlar: b.ishlar.filter((i) => (!faqatKiritilgan || kiritilgan(i.id) || i.resurslar.some((r) => !r.avto && kiritilgan(r.id))) && (mos(i.nom, i.kod) || i.resurslar.some((r) => mos(r.nom, r.kod)))),
      alohida: b.alohida.filter((r) => (!faqatKiritilgan || kiritilgan(r.id)) && mos(r.nom, r.kod)),
    })).filter((b) => b.ishlar.length || b.alohida.length);
  }, [bolimlar, qidirKech, tanlanganBolim, faqatKiritilgan, k.hajm]);
  const royxatRejimi = !!qidirKech.trim() || faqatKiritilgan;

  const yoz = (maydon: keyof F2Kiritma, id: number, qiymat: string | boolean | undefined) => setK((o) => {
    const m = { ...o[maydon] } as Record<number, string | boolean>;
    if (qiymat === undefined || qiymat === '') delete m[id]; else m[id] = qiymat;
    return { ...o, [maydon]: m };
  });
  const bolimniOl = (bs: F2Bolim[]) => setK((o) => {
    const hajm = { ...o.hajm };
    for (const b of bs) {
      for (const i of b.ishlar) { if (i.mumkin > 0) hajm[i.id] = String(i.mumkin); for (const r of i.resurslar) if (!r.avto && r.mumkin > 0) hajm[r.id] = String(r.mumkin); }
      for (const r of b.alohida) hajm[r.id] = String(r.mumkin);
    }
    return { ...o, hajm };
  });
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
  const narxsizBelgila = () => setK((o) => ({ ...o, narxsiz: { ...o.narxsiz, ...Object.fromEntries(narxsizlar.map((id) => [id, true])) } }));

  const f2Yacheyka = f2Yacheykalar(f2Yuk(qatorlar, raqam));
  const moneyValid = () => {
    if (!reportMoneyValidity(moneyScope.current)) return false;
    // Collapsed/filtered resource editors are unmounted, but their string drafts
    // still exist. Do not let sonOqi's null fallback silently reuse a source price.
    const invalid = [...Object.entries(k.narx), ...Object.entries(k.summa)]
      .some(([id, value]) => !k.narxsiz[Number(id)] && value !== '' && !isCompleteMoney(value));
    if (invalid) toast(t('Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.'), 'warn');
    return !invalid;
  };
  const saqlash = async () => {
    if (!moneyValid()) return;
    if (!validId || !tayyor || saving) return;
    if (!joriy?.id) return;
    setSaving(true);
    try {
      // Token (egasi 2026-10-02): F2 qoralama — "f2_qoralama"; server xato bersa token avtomatik qaytadi.
      const t = await tokenBilan({ kompaniyaId: joriy.id, amal: 'f2_qoralama', birlikSoni: f2Yacheyka, meta: { obyekt: obyektId, qator: qatorlar.length, yacheyka: f2Yacheyka } }, async () => {
        const result = await sbT2AktYaratV2({ obyektId, oy, operationId: operationId.current, qatorlar: f2Yuk(qatorlar, raqam), raqam: raqam.trim() || undefined });
        if (!result.ok) throw new Error(result.error || result.xabar || 'F2 qoralama yaratilmadi.');
        return result;
      });
      if (!t.ok) { toast(t.xabar, 'danger'); return; }
      toast(`F2 qoralama yaratildi (${t.sarflandi} token). Tasdiqlash — F2 tarixida.`, 'ok', undefined, 12000, { label: 'Ochish', onClick: () => navigate(`/admin/f2-tarix?obyekt=${obyektId}`) });
      await yuklash();
    } catch { toast('Javob olinmadi. Shu amal IDsi bilan qayta urinishingiz mumkin.', 'danger'); }
    finally { setSaving(false); }
  };

  const korinish = useHujjatKorinish();
  const excelYuklash = async (korish = false) => {
    if (!moneyValid()) return;
    if (!validId || !tayyor) return;
    const object = obyektlar.find((item) => item.id === obyektId);
    if (!object) { toast('Obyekt topilmadi.', 'danger'); return; }
    try {
      const stavka = ndsFoiz.trim() === '' ? null : Number(ndsFoiz.replace(',', '.'));
      const nk = await t2ObyektNakrutka(obyektId).catch(() => null);
      const podval = await obyektPodvali(joriy?.id, obyektId, nk?.ok ? nk.shartnoma_id : null);
      // Qo'lda kiritilgan imzo (panel) — shartnomadagidan ustun; bo'sh maydon — shartnomadagi qoladi.
      const qolda = Object.fromEntries(Object.entries(tomonlar).filter(([, x]) => typeof x === 'string' && x.trim())) as ImzoNomlar;
      const h = f2Hujjat(bolimlar, qatorlar, {
        obyektNom: object.nom, davr: oy, raqam, imzo: { ...avto.imzo, ...qolda }, shartnoma: avto.shartnoma,
        ndsFoiz: stavka != null && Number.isFinite(stavka) ? stavka : null,
        nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval,
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
    { id: 'saqlash', keys: 'ctrl+enter', nom: t('F2 qoralama yaratish'), guruh: t('Tez kiritish'), inInput: true, enabled: () => tayyor && !saving, run: () => { void saqlash(); } },
  ], validId);

  function resursQatori(r: F2Resurs) {
    const x = byId.get(r.id);
    const taklif = r.taklifNarx != null ? String(Math.round(r.taklifNarx * 1e6) / 1e6) : '';
    return (
      <tr key={r.id} className="border-t border-border/40 align-top">
        <td className="py-1 pl-8 pr-2">
          <div className="flex items-center gap-1.5">
            <span className={`shrink-0 rounded px-1 text-[10px] ${KAT_RANG[r.kat ?? ''] ?? 'bg-surface-2 text-text-dim'}`}>{r.tur === 'rs' ? (r.kat ?? 'rs') : 'материал'}</span>
            <span className="truncate text-text">{r.nom}</span>
          </div>
          {r.norma != null && r.avto && <div className="pl-1 text-[10px] text-text-mute">norma {r.norma}</div>}
        </td>
        <td className="px-2 py-1 text-right text-text-dim">{r.birlik}</td>
        <td className="px-2 py-1 text-right tabular-nums">
          {r.avto ? (x ? <FmtN val={x.hajm} /> : <span className="text-text-mute">—</span>)
            : <input aria-label={`F2 hajmi: ${r.nom}`} inputMode="decimal" value={k.hajm[r.id] ?? ''} onChange={(e) => yoz('hajm', r.id, e.target.value)} placeholder={String(r.mumkin)} className={`${kirit} w-24 ${OSH_OGOH.has(x?.ogoh) ? '!border-warn bg-warn/10' : ''}`} />}
          <div className="text-[10px] text-text-mute">mumkin <FmtN val={r.mumkin} /></div>
        </td>
        <td className="px-2 py-1 text-right">
          <MoneyInput aria-label={`F2 narxi: ${r.nom}`} inputMode="decimal" disabled={k.narxsiz[r.id] === true} value={k.narx[r.id] ?? ''} onValueChange={(moneyValue) => yoz('narx', r.id, moneyValue)} placeholder={taklif || 'narx'} className={`${kirit} w-28 disabled:opacity-40`} />
          {x && <div className={`text-[10px] ${x.manba === 'qolda' ? 'text-text-dim' : x.manba === 'yoq' ? 'text-warn' : 'text-accent'}`}>{NARX_MANBA_NOMI[x.manba]}{x.protokol ? ` ${x.protokol}` : ''}</div>}
        </td>
        <td className="px-2 py-1 text-right">
          <MoneyInput aria-label={`F2 summasi: ${r.nom}`} inputMode="decimal" disabled={k.narxsiz[r.id] === true} value={k.summa[r.id] ?? ''} onValueChange={(moneyValue) => yoz('summa', r.id, moneyValue)} placeholder={x?.summa != null ? x.summa.toFixed(2) : ''} className={`${kirit} w-32 disabled:opacity-40`} />
        </td>
        <td className="w-24 px-2 py-1">
          <label className="flex items-center gap-1 whitespace-nowrap text-[10px] text-text-dim"><input type="checkbox" aria-label={`Narxsiz: ${r.nom}`} checked={k.narxsiz[r.id] === true} onChange={(e) => yoz('narxsiz', r.id, e.target.checked || undefined)} />narxsiz</label>
          {x?.xato && <div className="text-[10px] text-danger">{XATO_MATN[x.xato]}</div>}
          {x?.ogoh && <div className="text-[10px] text-warn">{OSH_OGOH.has(x.ogoh) ? t(OGOH_MATN[x.ogoh]) : OGOH_MATN[x.ogoh]}</div>}
        </td>
      </tr>
    );
  }

  /** ТН·КМ qatori yonida taklif (blok emas): A = shu F2 dagi tonnali mos material Σ tonna × km; B = F2/smeta ulushi × smeta т·км. */
  function tkmTaklifQator(ish: F2Ish) {
    const taklif = (() => {
      const hamma = bolimlar.flatMap((b) => b.ishlar);
      const f2 = hamma.filter((x) => x.id !== ish.id).map((x) => ({ nom: x.nom, birlik: x.birlik, hajm: sonOqi(k.hajm[x.id]) })).map((x) => ({ ...x, hajm: typeof x.hajm === 'number' ? x.hajm : null }));
      const smetaM = hamma.filter((x) => x.id !== ish.id).map((x) => ({ nom: x.nom, birlik: x.birlik, hajm: x.smeta }));
      return tkmTaklif({ nom: ish.nom }, f2, { materiallar: smetaM, tkmHajm: ish.smeta });
    })();
    if (!taklif) return null;
    return <div className="flex flex-wrap items-center gap-2 px-10 pb-2 text-[11px] text-text-dim" aria-label={t('ТН·КМ taklifi')}>
      <span>{t('Taklif')}:</span>
      {([['A', taklif.a], ['B', taklif.b]] as const).map(([nom, v]) => v && <button key={nom} type="button" title={v.izoh} onClick={() => yoz('hajm', ish.id, String(v.qiymat))}
        className="rounded-md border border-border px-1.5 py-0.5 hover:border-accent hover:text-text">{nom}: <FmtN val={v.qiymat} /></button>)}
      <span className="text-text-mute">{[taklif.a?.izoh, taklif.b?.izoh].filter(Boolean).join(' · ')}</span>
    </div>;
  }

  function ishKartasi(i: F2Ish) {
    const x = byId.get(i.id);
    const ochilgan = ochiq.has(i.id) || !!qidir.trim();
    const resSumma = i.resurslar.reduce((s, r) => s + (byId.get(r.id)?.summa ?? 0), 0);
    return (
      <div key={i.id} className={`rounded-lg border ${x && !x.xato ? (OSH_OGOH.has(x.ogoh) ? 'border-warn/60 bg-warn/5' : 'border-accent/50 bg-accent/5') : 'border-border'}`}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <button type="button" aria-label={`${ochilgan ? 'Yopish' : 'Resurslarni ko‘rish'}: ${i.nom}`} tabIndex={-1} onClick={() => setOchiq((o) => { const n = new Set(o); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} className="rounded p-0.5 text-text-mute hover:text-text">
            {ochilgan ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="shrink-0 font-mono text-[10px] text-text-mute">{i.kod}</span><span className="truncate text-[13px] font-semibold text-text">{i.nom}</span>
              {aosrsizId.has(i.id) && <span className="shrink-0 rounded bg-warn/10 px-1 text-[10px] text-warn">yashirin · АОСР yo‘q</span>}</div>
            <div className="text-[11px] text-text-mute">F2 mumkin <b className="text-text-dim"><FmtN val={i.mumkin} /></b> {i.birlik} · {t('tasdiqlangan F2')} <FmtN val={i.olingan} />{(i.qoralama ?? 0) > 0 && <b className="text-warn"> · {t('qoralamada')} <FmtN val={i.qoralama ?? 0} /></b>}{i.smeta != null && <> · {t('smeta')} <FmtN val={i.smeta} /></>}{(() => { const n = ishBirlikNarxi(i); return n.summa > 0 || n.narxsiz > 0 ? <> · {t('narx (1 birlik, NDS siz)')} {n.summa > 0 ? <FmtN val={n.summa} /> : '—'}{n.narxsiz > 0 && <b className="text-warn"> ({n.narxsiz} {t('resursda narx yo‘q')})</b>}</> : null; })()} · {i.resurslar.length} resurs</div>
          </div>
          {<>
            <input aria-label={`F2 hajmi: ${i.nom}`} data-ish-hajm inputMode="decimal" value={k.hajm[i.id] ?? ''} onChange={(e) => yoz('hajm', i.id, e.target.value)} onKeyDown={(e) => hajmKlaviatura(e, i.id)} placeholder="hajm" className={`${kirit} w-24 ${OSH_OGOH.has(x?.ogoh) ? '!border-warn bg-warn/10' : ''}`} />
            {(i.erkin || i.mumkin > 0) && [25, 50, 100].map((f) => <button key={f} type="button" tabIndex={-1} onClick={() => yoz('hajm', i.id, ulushHajm(i.mumkin, f))} className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-text-dim hover:border-accent hover:text-text">{f}%</button>)}
          </>}
          <span className="w-28 text-right text-[12px] font-semibold tabular-nums text-text">{resSumma ? <FmtN val={resSumma} /> : ''}</span>
        </div>
        {x?.xato && <div className="px-10 pb-1 text-[11px] text-danger">{XATO_MATN[x.xato]}</div>}
        {x?.ogoh && <div className="px-10 pb-1 text-[11px] text-warn">{OSH_OGOH.has(x.ogoh) ? t(OGOH_MATN[x.ogoh]) : OGOH_MATN[x.ogoh]}</div>}
        {tkmBirlikmi(i.birlik) && tkmTaklifQator(i)}
        {ochilgan && i.resurslar.length > 0 && (
          <table className="w-full text-[12px]"><tbody>{i.resurslar.map(resursQatori)}</tbody></table>
        )}
      </div>
    );
  }

  const bolimDarax = useMemo(() => bolimDaraxti(bolimlar), [bolimlar]);
  const bolimKorinadi = useMemo(() => korinadiganBolimlar(bolimDarax, kengaygan, tanlanganBolim), [bolimDarax, kengaygan, tanlanganBolim]);
  const bolimPaneli = bolimlar.length > 0 && <aside className="karta flex min-h-0 flex-col overflow-hidden" aria-label="Bo‘limlar">
    <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-mute">Bo‘limlar</div>
    <ul className="min-h-0 flex-1 overflow-auto p-1">
      {bolimKorinadi.map(({ b, kalit, farzand }) => { const bj = bolimJami.get(b.id); const tanl = b.id === tanlanganBolim && !royxatRejimi; const ochiqmi = kengaygan.has(kalit); return (
        <li key={b.id ?? 'yoq'} className="flex items-center" style={{ paddingLeft: Math.min(b.daraja, 4) * 10 }}>
          {farzand ? <button type="button" aria-label={`${ochiqmi ? t('Yopish') : t('Ochish')}: ${b.nom}`} aria-expanded={ochiqmi} onClick={() => setKengaygan((o) => { const n = new Set(o); if (n.has(kalit)) n.delete(kalit); else n.add(kalit); return n; })} className="shrink-0 rounded p-0.5 text-text-mute hover:text-text">{ochiqmi ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="w-[17px] shrink-0" />}
          <button type="button" onClick={() => { setBolimId(b.id); setQidir(''); }}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-left text-[12px] ${tanl ? 'bg-accent/10 text-text' : 'text-text-dim hover:bg-surface-2'}`}>
            <span className="min-w-0 flex-1 truncate">{b.nom}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-text-mute">{bj?.ish ? `${bj.ish}/` : ''}{b.ishlar.length + b.alohida.length}</span>
          </button></li>); })}
    </ul>
  </aside>;

  return <Sahifa sarlavha="F2 tayyorlash" tavsif="Ishni tanlang — resurslar, narx va summa avtomatik; har narx manbasi ko‘rinadi">
    {korinish.oyna}
    <div ref={moneyScope} className="flex h-full min-h-0 flex-col gap-3">
      {validId && <TayyorlanganF2lar kompaniyaId={joriy?.id} obyektId={obyektId} />}
      <section className="karta flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-[240px] flex-1 text-[12px] font-medium text-text">Obyekt
          <select aria-label="Obyekt" value={validId ? obyektId : ''} onChange={(event) => { const object = obyektlar.find((item) => item.id === Number(event.target.value)); if (workspace.isProvider) workspace.setObjectId(object?.id ?? null); else setParams(object ? { obyekt: String(object.id) } : {}); }} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text">
            <option value="">-- obyektni tanlang --</option>{validId && !obyektlar.some((item) => item.id === obyektId) && <option value={obyektId}>{t('Obyekt')} {'#'}{obyektId}</option>}<ObyektOptionlari obyektlar={obyektlar} />
          </select>
        </label>
        <label className="text-[12px] font-medium text-text">Davr<input aria-label="F2 davri" type="month" value={oy.slice(0, 7)} onChange={(event) => setOy(`${event.target.value}-01`)} className="mt-1.5 block rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
        <label className="text-[12px] font-medium text-text">F2 raqami<input aria-label="F2 raqami" value={raqam} onChange={(e) => setRaqam(e.target.value)} placeholder="masalan 7" className="mt-1.5 block w-28 rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
        {validId && !loading && holat.length > 0 && <div role="group" aria-label={t('Hajm manbai')} className="text-[12px] font-medium text-text">{t('Hajm manbai')}
          <div className="mt-1.5 flex overflow-hidden rounded-lg border border-border">{(['fakt', 'smeta'] as const).map((m) => <button key={m} type="button" aria-pressed={manba === m} onClick={() => { setManbaTanlov(m); setK(bosKiritma()); }}
            className={`px-3 py-2 ${manba === m ? 'bg-accent/15 text-text' : 'bg-surface-2 text-text-dim hover:text-text'}`}>{m === 'fakt' ? t('Fakt') : t('Smeta qoldig‘i')}</button>)}</div></div>}
        {validId && bolimlar.length > 0 && <label className="flex items-center gap-1.5 pb-2.5 text-[12px] text-text-dim"><input type="checkbox" checked={faqatKiritilgan} onChange={(e) => setFaqatKiritilgan(e.target.checked)} />{t('Faqat kiritilganlar')}</label>}
        {validId && bolimlar.length > 0 && <label className="relative min-w-[200px] text-[12px] font-medium text-text">Qidirish
          <Search size={14} className="pointer-events-none absolute bottom-2.5 left-2.5 text-text-mute" />
          <input aria-label="Qidirish" value={qidir} onChange={(e) => setQidir(e.target.value)} placeholder="ish, resurs, kod…" className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-text" /></label>}
      </section>
      {!validId && <section className="karta p-4 text-text-dim">Avval obyektni tanlang.</section>}
      {error && validId && <section role="alert" className="karta flex flex-wrap items-center gap-3 border-danger/40 bg-danger/5 p-4 text-[13px] text-danger"><AlertTriangle size={16} /><span className="flex-1">{error}</span><button type="button" onClick={() => void yuklash()} className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold hover:bg-danger/10">Qayta urinib ko‘rish</button></section>}
      {loading && <div className="skel min-h-[260px] flex-1 rounded-xl" />}
      {validId && !loading && !error && bolimlar.length === 0 && <section className="karta p-8 text-center text-text-dim">F2 ga olish mumkin bo‘lgan fakt qoldig‘i yo‘q — avval Fakt jurnalida bajarilgan ishni kiriting.</section>}
      {validId && !loading && !error && bolimlar.length > 0 && <>
        {aosrsiz.length > 0 && <section role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/5 px-4 py-2 text-xs text-text">
          <AlertTriangle size={15} className="shrink-0 text-warn" /><span className="flex-1"><b>АОСР yo‘q yashirin ishlar: {aosrsiz.length} ta.</b> F2 bloklanmaydi — topshirishda АОСР talab qilinadi.</span>
          <button type="button" onClick={() => navigate('/admin/aosr')} className="rounded-lg border border-warn/40 px-3 py-1 font-semibold hover:bg-warn/10">АОСР yaratish</button>
        </section>}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
          {bolimPaneli}
          <section className="karta flex min-h-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-[13px] font-semibold text-text">{royxatRejimi ? `${faqatKiritilgan && !qidirKech.trim() ? t('Kiritilganlar') : t('Qidiruv')}: ${korinadi.reduce((s, b) => s + b.ishlar.length + b.alohida.length, 0)} ta` : korinadi[0]?.nom}</span>
              <button type="button" onClick={() => bolimniOl(korinadi)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-accent/40 px-2 py-1 text-[11px] font-semibold text-text hover:bg-accent/10"><Zap size={12} className="text-accent" />{royxatRejimi ? 'Topilganlarni' : 'Bo‘limni'} to‘liq olish</button>
              <button type="button" onClick={() => bolimniOl(bolimlar)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-dim hover:border-accent hover:text-text">Barcha mumkin hajmni olish</button>
              {Object.keys(k.hajm).length > 0 && <button type="button" onClick={() => setK(bosKiritma())} className="rounded-md border border-border px-2 py-1 text-[11px] text-text-dim hover:border-danger hover:text-danger">Tozalash</button>}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {korinadi.map((b) => <div key={b.id ?? 'yoq'} className="space-y-2">
                {royxatRejimi && <div className="text-[11px] font-semibold uppercase tracking-wide text-text-mute">{b.nom}</div>}
                {b.ishlar.map(ishKartasi)}
                {b.alohida.length > 0 && <div className="rounded-lg border border-border"><div className="px-3 py-1.5 text-[11px] font-semibold text-text-dim">Alohida materiallar</div><table className="w-full text-[12px]"><tbody>{b.alohida.map(resursQatori)}</tbody></table></div>}
              </div>)}
            </div>
          </section>
        </div>
        <section className="flex flex-wrap items-start gap-3"><div className="min-w-[280px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} />
          <p className="mt-1 text-[11px] text-text-mute">{avto.shartnoma || avto.imzo.zakazchik || avto.imzo.pudratchi
            ? <>Shartnomadan avtomatik: <b className="text-text-dim">{[avto.shartnoma, avto.imzo.zakazchik, avto.imzo.pudratchi, avto.imzo.subpudratchi].filter(Boolean).join(' · ')}</b> (panelda qo‘lda yozilgani ustun turadi)</>
            : <>Obyekt asosiy shartnomaga biriktirilmagan — imzolovchilarni <a href="/admin/shartnoma-liniya" className="text-accent underline">Shartnoma liniyasi</a>da bog‘lang yoki panelda yozing.</>}</p></div><label className="text-[12px] text-text-dim">QQS (НДС), % — hujjat oxirida<input aria-label="QQS stavkasi" value={ndsFoiz} onChange={(event) => setNdsFoiz(event.target.value)} placeholder="bo‘sh — QQS yo‘q" inputMode="decimal" className="ml-2 w-32 rounded border border-border bg-bg px-2 py-1" /></label></section>
        <section aria-label="F2 jami" className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-surface/95 px-4 py-2.5 shadow-2xl backdrop-blur">
          <span className="text-[12px] text-text-dim">Tanlangan qatorlar: <b className="text-text">{jami.qator}</b> ({jami.ish} ish)</span>
          {Object.entries(jami.kat).map(([kat, s]) => <span key={kat} className="text-[11px] text-text-dim">{kat}: <b className="tabular-nums text-text"><FmtN val={s} /></b></span>)}
          <span className="text-[13px] font-semibold text-accent">{t('Jami')}: <SummaJuft obyektId={obyektId} kompaniyaId={joriy?.id} ustamasiz={jami.summa} katKesim={katKesim} /></span>
          {jami.manba.smeta + jami.manba.oldingi_f2 + jami.manba.protokol > 0 && <span className="text-[11px] text-text-mute">taklif narx: {jami.manba.protokol ? `protokol ${jami.manba.protokol}, ` : ''}smeta {jami.manba.smeta}, oldingi F2 {jami.manba.oldingi_f2}</span>}
          {jami.narxsiz > 0 && <span className="text-[11px] text-warn">Narx asosi yo‘q: {jami.narxsiz} — ИТОГО bo‘sh chiqadi</span>}
          {jami.ogoh > 0 && <span className="text-[11px] text-warn">Ogohlantirishlar: {jami.ogoh}</span>}
          {jami.xato > 0 && <span className="flex items-center gap-1 text-[12px] text-danger"><AlertTriangle size={13} />{jami.xato} ta xato</span>}
          {narxsizlar.length > 0 && <button type="button" onClick={narxsizBelgila} className="rounded-md border border-warn/40 px-2 py-1 text-[11px] text-warn hover:bg-warn/10">Narxi yo‘q {narxsizlar.length} ta resursni «narxsiz» belgilash</button>}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => navigate(`/admin/f2-tarix?obyekt=${obyektId}`)} className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-text">F2 tarixi</button>
            <button type="button" onClick={() => void excelYuklash(false)} disabled={!tayyor || saving} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-text disabled:opacity-50"><Download size={14} />Excel</button>
            <button type="button" onClick={() => void excelYuklash(true)} disabled={!tayyor || saving} aria-label="Forma-2 qoralama ko‘rish" className="inline-flex items-center rounded-lg border border-border px-2 py-1.5 text-text disabled:opacity-50"><Eye size={14} /></button>
            <button type="button" onClick={() => void saqlash()} disabled={!tayyor || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"><Save size={14} />{saving ? 'Yaratilmoqda…' : `F2 qoralama yaratish (${qatorlar.length})`}</button>
          </div>
        </section>
      </>}
    </div>
  </Sahifa>;
}

export default F2TayyorlashNative;
