import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Ban, CheckCircle2, ChevronDown, ChevronRight, Cpu, Pencil, Plus, Repeat2, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import { bajarilmadiBekor, bajarilmadiRoyxatOl, bajarilmadiXato, type BajarilmadiQator } from '../../api/t2-bajarilmadi';
import { bajarilmadiHajmlar, faktYigindiHisobla, narxlashMumkin } from '../../lib/fakt-studio';
import { FaktNarxlash, type NarxlashQator } from './FaktNarxlash';
import { FaktBajarilmadiTez, type BajarilmadiQatorInfo } from './FaktBajarilmadiTez';
import { FaktStudioBar } from './FaktStudioBar';
import { FaktAiYordamchi } from './FaktAiYordamchi';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from '../../lib/ustamali-summa';
import { yangiOperationId, type T2Qator } from '../../api/supabase';
import { sbFaktYoz } from '../../api/t2-fakt';
import { bolimIshlariYigish, faktF2Bekor, faktF2Reja, type TenglashOyna } from '../../lib/fakt-f2-tenglash';
import { FaktF2Tenglash } from './FaktF2Tenglash';
import { t } from '../../i18n/til';
import { qidiruvTayyorla } from '../../lib/qidiruv-normalizatsiya';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { sarlavhaBilan } from '../../lib/hotkeys/core';
import { JURNAL_XATO_MATN, bolimSummalari, bolimTarkibi, jurnalPaket, jurnalQur, ochiqBor, qoldiqUlushi, sonOqi, type BolimSumma, type JurnalBolim, type JurnalHolat, type JurnalIsh, type JurnalQator, type Kiritma, type Rejim, type ZamenaBoglanish } from '../../lib/fakt-jurnal';
import { zamenaBoglanishOl } from '../../lib/fakt-zamena-boglanish';
import { almashtirildiMatn, ochiqdanOrtiqcha, ochiqQoldiq } from '../../lib/zamena-qoldiq';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { ishKeyingiMateriallari, materialTaklifi } from '../../lib/fakt-material-taklif';
import { toast } from '../../umumiy/ui/Toast';
import { IshAbcModal, type AbcRejim, type AbcTahrir } from './IshAbcModal';
import { abcXato, ishAbcOchir, type NarxManba } from '../../api/t2-ish-abc';
import { katAniqla, type AbcResurs } from '../../lib/ish-abc';

const MANBALAR: readonly NarxManba[] = ['smeta_obyekt', 'smeta_shartnoma', 'smeta', 'katalog', 'qolda'];

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
const foiz = (u: number | null) => (u == null ? '—' : `${Math.round(u * 100)}%`);

const HOLAT_RANG: Record<JurnalQator['holat'], { bar: string; nuqta: string; matn: string }> = {
  yangi: { bar: 'bg-text-mute/30', nuqta: 'bg-text-mute/50', matn: 'Boshlanmagan' },
  qisman: { bar: 'bg-accent', nuqta: 'bg-accent', matn: 'Jarayonda' },
  tugadi: { bar: 'bg-ok', nuqta: 'bg-ok', matn: 'Bajarildi' },
  oshdi: { bar: 'bg-warn', nuqta: 'bg-warn', matn: 'Smetadan oshdi' },
  smetasiz: { bar: 'bg-accent', nuqta: 'bg-accent', matn: 'Smetasiz' },
};

function Progress({ ulush, holat, ingichka }: { ulush: number | null; holat: JurnalQator['holat'] | 'bolim'; ingichka?: boolean }) {
  const kenglik = Math.max(0, Math.min(1, ulush ?? 0)) * 100;
  const rang = holat === 'bolim' ? (ulush != null && ulush >= 1 ? 'bg-ok' : 'bg-accent') : HOLAT_RANG[holat].bar;
  return <div className={`w-full overflow-hidden rounded-full bg-surface-2 ${ingichka ? 'h-1' : 'h-1.5'}`}><div className={`h-full rounded-full transition-all ${rang}`} style={{ width: `${kenglik}%` }} /></div>;
}

/**
 * Fakt jurnali: chapda bo'limlar (bajarilish foizi), o'ngda tanlangan bo'lim ishlari (resurslari
 * bilan). Har qatorda "+" (bugun) yoki "=" (jami), 25/50/100% tezkor tugmalar; pastda doimiy
 * saqlash paneli — barcha o'zgarishlar BITTA tranzaksiyada (Ctrl+S). Klaviatura: Enter/↓ keyingi,
 * ↑ oldingi, Esc tozalash, "/" qidiruv.
 */
export type SaqlashNatija = Promise<boolean>;
export type SaqlashFn = () => SaqlashNatija;
type SaqlashVaqda = SaqlashNatija | null;
export function FaktJurnal({ kompaniyaId, obyektId, rows, states, holatniYangila, tuzilmaniYangila, saqlashRef, f2Otish }: {
  kompaniyaId: number; obyektId: number;
  /** Yig'indi paneli «F2 tayyorlash» tugmasi: sahifa avval saqlaydi, so'ng F2 tayyorlashga o'tadi. */
  f2Otish?: () => void;
  /** Tashqi sahifa (F2 tayyorlashga o'tish) saqlanmagan kiritmalarni saqlab, natijasini kutishi uchun. */
  saqlashRef?: { current: SaqlashFn | null };
  rows: readonly T2Qator[]; states: readonly JurnalHolat[];
  /** Faqat fakt/F2 holatini qayta o'qish (tez). */
  holatniYangila: () => Promise<void> | void;
  /** Qator qo'shilganda (zamena/qo'shimcha) — to'liq qayta o'qish. */
  tuzilmaniYangila: () => Promise<void> | void;
}) {
  const [sana, setSana] = useState(() => new Date().toISOString().slice(0, 10));
  const [kiritmalar, setKiritmalar] = useState<Record<number, Kiritma>>({});
  const [bolimId, setBolimId] = useState<number | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [faqatQoldiq, setFaqatQoldiq] = useState(false);
  /** Ish resurslarini ochish/yopish: `hammaYopiq` — umumiy holat, `teskari` — undan farq qiladigan ishlar. */
  const [hammaYopiq, setHammaYopiq] = useState(false);
  const [teskari, setTeskari] = useState<Set<number>>(new Set());
  const ishOchiq = (id: number) => (hammaYopiq ? teskari.has(id) : !teskari.has(id));
  const ishAlmashtir = (id: number) => setTeskari((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [yopiqBolim, setYopiqBolim] = useState<Set<number>>(new Set());
  const [band, setBand] = useState(false);
  const [saqlangan, setSaqlangan] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<{ rejim: AbcRejim; tahrir?: AbcTahrir | null; normativId?: string | null } | null>(null);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  /**
   * Zamena qator TURIGA qarab (egasi 2026-10-25: «resurs zamenasi ish zamenasiga o'tib ketyapti»):
   * ish (bl) — ish zamenasi; har qanday resurs (rs/mat/ob, ish ichida yoki alohida) — resurs zamenasi.
   * Resurs normasi ota ISH hajmiga ko'paytiriladi (server bilan bir xil: ota t2_qator.hajm); ota ish bo'lmasa — aniq hajm.
   */
  const zamenaOch = (q: JurnalQator, normativId: string | null = null) => {
    if (q.tur === 'bl') { setModal({ rejim: { tur: 'replacement', eski: { id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, otaId: q.otaId, otaVersiya: q.otaVersiya, hajm: q.smeta } }, normativId }); return; }
    const ota = q.otaId != null ? rowById.get(q.otaId) : undefined;
    const ishmi = ota?.tur === 'bl';
    setModal({ rejim: { tur: 'resurs_zamena',
      eski: { id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, kat: q.kat ?? katAniqla(null, q.tur, q.birlik), norma: q.norma, hajm: q.smeta, ishNom: ishmi ? [ota.kod, ota.nom].filter(Boolean).join(' ') || null : null },
      ishHajm: ishmi && ota.hajm != null ? Number(ota.hajm) : null } });
  };

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
    const sabab = window.prompt(`«${q.nom}» o‘chirilsinmi? ${q.zamena ? 'Asl qator qaytadi.' : 'Ish va uning resurslari, fakti o‘chiriladi (arxivda qoladi).'}\nSabab (ixtiyoriy):`, '');
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
  const yigindi = useMemo(() => faktYigindiHisobla(rows, states, bajarilmadi), [rows, states, bajarilmadi]);
  const [narxModal, setNarxModal] = useState<NarxlashQator | null>(null);
  const qatorlarRef = useRef(new Map<number, JurnalQator>());
  const bajBekor = async (qatorId: number, nom: string) => {
    const faol = bajarilmadi.filter((b) => b.qator_id === qatorId && b.holat === 'faol').sort((a, b) => b.id - a.id)[0];
    if (!faol) return;
    if (!window.confirm(t('«{nom}»: «bajarilmaydi» belgisi ({hajm}) bekor qilinsinmi?', { nom, hajm: fmt(faol.bajarilmagan_hajm) }))) return;
    const r = await bajarilmadiBekor({ kompaniyaId, id: faol.id, operationId: yangiOperationId() }).catch(() => null);
    if (!r?.ok) { toast(r ? t(bajarilmadiXato(r)) : t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); return; }
    toast(t('Belgi bekor qilindi.'), 'ok'); await bajYangila();
  };
  const bajOch = (q: JurnalQator, boshlangichHajm: number | null = null) => setBajModal({ id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, smeta: q.smeta, fakt: q.fakt, belgilangan: bajHajm.get(q.id) ?? 0, almashtirilgan: q.almashtirilgan, boshlangichHajm });
  const operationId = useRef(yangiOperationId());
  const inputlar = useRef<Array<HTMLInputElement | null>>([]);
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
  const { bolimlar, bolimIshlari } = useMemo(() => jurnalQur(rows, states, zb, bajHajm), [rows, states, zb, bajHajm]);
  const summalar = useMemo(() => bolimSummalari(rows, states), [rows, states]);
  // Ishdan KEYIN turgan alohida materiallar (ota = bo'lim) — ish ulushida fakt TAKLIFI (avtomatik yozilmaydi).
  const keyingiMat = useMemo(() => ishKeyingiMateriallari(rows), [rows]);
  const matIshi = useMemo(() => { const m = new Map<number, number>(); for (const [ish, ms] of keyingiMat) for (const x of ms) m.set(x, ish); return m; }, [keyingiMat]);
  const jurnalById = useMemo(() => { const m = new Map<number, JurnalQator>(); for (const arr of bolimIshlari.values()) for (const x of arr) m.set(x.id, x); return m; }, [bolimIshlari]);
  const faktlar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, Number(x.fakt_hajm ?? 0)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? 0])); }, [rows, states]);
  useEffect(() => { if (bolimId == null && bolimlar.length) setBolimId(bolimlar[0].id); }, [bolimId, bolimlar]);

  const smetalar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, x.smeta_hajm == null ? null : Number(x.smeta_hajm)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? (r.hajm == null ? null : Number(r.hajm))])); }, [rows, states]);
  const paket = useMemo(() => jurnalPaket(kiritmalar, faktlar, smetalar), [kiritmalar, faktlar, smetalar]);
  const ozgarishSoni = Object.values(kiritmalar).filter((k) => k.qiymat.trim()).length;

  // ── «Fakt = F2»: F2 hajmi fakt dan ko'p bo'lgan ishlarga farqni yozish (oldindan ko'rish + bekor qilish). ──
  const [tenglash, setTenglash] = useState<TenglashOyna | null>(null);
  const holatMap = useMemo(() => new Map(states.map((s) => [s.qator_id, s])), [states]);
  /** Ustamali summa (egasi 2026-10-24): resurs kat'i smeta qatoridan (t2_qator.kat) - M/K, КАБ, БЕЗ СКЛАД ham aniq; ish (bl) o'z narxiga ega emas - resurslar yig'indisi. */
  const taxminKesim = (q: JurnalQator): { fakt: KatKesim; smeta: KatKesim; faktSumma: number; smetaSumma: number } | null => {
    const sm = (x: JurnalQator) => Number(holatMap.get(x.id)?.smeta_summa ?? 0);
    const bolalar = 'resurslar' in q ? [...(q as JurnalIsh).resurslar, ...(q as JurnalIsh).avtomatik] : [];
    const qismlar = q.tur === 'bl' ? bolalar : [q];
    const asos = qismlar.reduce((s, x) => s + sm(x), 0);
    if (!(asos > 0) || q.ulush == null) return null;
    const fakt = bosKatKesim(), smeta = bosKatKesim();
    for (const x of qismlar) { const kat = rowById.get(x.id)?.kat; katKesimgaQosh(smeta, kat, sm(x)); katKesimgaQosh(fakt, kat, sm(x) * q.ulush); }
    return { fakt, smeta, faktSumma: asos * q.ulush, smetaSumma: asos };
  };
  const bolimBolalari = useMemo(() => { const m = new Map<number, number[]>(); for (const b of bolimlar) if (b.otaId != null) m.set(b.otaId, [...(m.get(b.otaId) ?? []), b.id]); return m; }, [bolimlar]);
  const tenglashOch = (sarlavha: string, ishlar: JurnalIsh[]) => setTenglash({ sarlavha, reja: faktF2Reja(ishlar, holatMap) });

  // Ko'rinadigan bo'laklar: qidiruv bo'lsa — butun obyekt bo'yicha (har ish o'z bo'lim yo'li bilan);
  // aks holda tanlangan bo'lim va uning BARCHA avlod bo'limlari (egasi 2026-10-25: «ichi bo'sh» chiqmasin).
  type Bolak = { bolim: JurnalBolim | null; nisbiy: number; yol?: string; ishlar: JurnalIsh[] };
  const korinadi = useMemo((): Bolak[] => {
    const q = qidiruv.trim().toLowerCase();
    const mos = (x: JurnalQator) => `${x.kod ?? ''} ${x.nom}`.toLowerCase().includes(q);
    const filtr = (ish: JurnalIsh) => (!faqatQoldiq || ochiqBor(ish) || ish.resurslar.some(ochiqBor))
      && (!q || mos(ish) || ish.resurslar.some(mos) || ish.avtomatik.some(mos));
    if (q) {
      const out: Bolak[] = []; let n = 0;
      for (const b of bolimlar) {
        if (n >= 200) break;
        const ishlar = (bolimIshlari.get(b.id) ?? []).filter(filtr).slice(0, 200 - n);
        if (ishlar.length) { out.push({ bolim: null, nisbiy: 0, yol: b.nom, ishlar }); n += ishlar.length; }
      }
      return out;
    }
    if (bolimId == null) return [];
    const tarkib = bolimTarkibi(bolimId, bolimlar, bolimIshlari).map((x) => ({ ...x, ishlar: x.ishlar.filter(filtr) }));
    // Filtrdan keyin bo'sh qolgan shoxlar tashlanadi (ishli avlodi bor bo'lim sarlavhasi qoladi).
    const toliq = new Set<number>();
    for (let i = tarkib.length - 1; i >= 0; i--) { const x = tarkib[i]; if (x.ishlar.length || toliq.has(x.bolim.id)) { toliq.add(x.bolim.id); if (x.bolim.otaId != null) toliq.add(x.bolim.otaId); } }
    return tarkib.filter((x) => x.nisbiy === 0 || toliq.has(x.bolim.id)).map((x) => ({ bolim: x.nisbiy === 0 ? null : x.bolim, nisbiy: x.nisbiy, ishlar: x.ishlar }));
  }, [qidiruv, faqatQoldiq, bolimId, bolimlar, bolimIshlari]);
  const korinadiIshSoni = korinadi.reduce((s, x) => s + x.ishlar.length, 0);

  const kirit = (id: number, patch: Partial<Kiritma>) => setKiritmalar((o) => {
    const eski = o[id] ?? { rejim: '+' as Rejim, qiymat: '' };
    const yangi = { ...eski, ...patch };
    const n = { ...o };
    if (!yangi.qiymat.trim() && patch.rejim == null) delete n[id]; else n[id] = yangi;
    return n;
  });

  /** Qatorning (kiritma bilan) fakti: «+» — joriy + bugun; «=» — jami; kiritma yo'q/xato — joriy. */
  const samaraliFakt = (q: JurnalQator) => {
    const k = kiritmalar[q.id]; const n = k ? sonOqi(k.qiymat) : null;
    return n == null || !Number.isFinite(n) ? q.fakt : k!.rejim === '+' ? q.fakt + n : n;
  };
  /** Alohida material uchun taklif (ish ulushida), yoki null. */
  const matTaklifi = (matId: number): { ish: JurnalQator; hajm: number } | null => {
    const ishId = matIshi.get(matId); const ish = ishId != null ? jurnalById.get(ishId) : undefined; const m = jurnalById.get(matId);
    if (!ish || !m) return null;
    const h = materialTaklifi(samaraliFakt(ish), ish.smeta, m.smeta, m.fakt);
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

  const ishdaRef = useRef<SaqlashVaqda>(null);
  const saqla = useCallback((): SaqlashNatija => {
    if (ishdaRef.current) return ishdaRef.current;
    const p = saqlaIchki().finally(() => { ishdaRef.current = null; });
    ishdaRef.current = p; return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paket, band, obyektId, sana, holatniYangila]);
  const saqlaIchki = async (): SaqlashNatija => {
    if (!paket.ok || band) return false;
    setBand(true);
    try {
      const r = await sbFaktYoz({ obyektId, sana, operationId: operationId.current, qatorlar: paket.qatorlar, izoh: `Fakt jurnali: ${paket.qatorlar.length} qator` });
      if (!r.ok) { toast(r.error || r.xabar || 'Fakt saqlanmadi.', 'danger'); return false; }
      const ids = new Set(paket.qatorlar.map((x) => x.qator_id));
      setSaqlangan(ids); setTimeout(() => setSaqlangan(new Set()), 2500);
      setKiritmalar({}); operationId.current = yangiOperationId();
      toast(`${ids.size} ta qator saqlandi — F2 qoldig‘i yangilandi.`, 'ok');
      // Saqlash tugadi — tugma darhol bo'shaydi; holat fonda yangilanadi (sekin o'qish tugmani qotirmasin).
      setBand(false);
      void Promise.resolve(holatniYangila()).catch(() => toast('Saqlandi, lekin jadvalni yangilab bo‘lmadi — sahifani yangilang.', 'warn'));
      return true;
    } catch { toast('Javob olinmadi. Qayta saqlang — takror xavfsiz (bir xil amal ID).', 'danger'); }
    finally { setBand(false); }
    return false;
  };
  useEffect(() => {
    if (!saqlashRef) return;
    saqlashRef.current = async () => (ishdaRef.current ? ishdaRef.current : (ozgarishSoni ? saqla() : true));
    return () => { saqlashRef.current = null; };
  });

  // Yagona klaviatura moduli (lib/hotkeys): Ctrl+S saqlash, / qidiruv, F — Fakt = F2 (tanlangan bo'lim), Esc — kiritmalarni tozalash.
  useHotkeys('fakt', t('Fakt jurnali'), [
    { id: 'fakt.saqla', keys: 'ctrl+s', nom: t('Saqlash'), inInput: true, run: () => { void saqla(); } },
    { id: 'fakt.qidiruv', keys: '/', nom: t('Qidirish'), run: () => { qidiruvRef.current?.focus(); } },
    { id: 'fakt.f2', keys: 'f', nom: t('Fakt = F2 (tanlangan bo‘lim)'), run: () => { const b = bolimlar.find((x) => x.id === bolimId); if (!b) return false; tenglashOch(b.nom, bolimIshlariYigish(b.id, bolimIshlari, bolimBolalari, true)); } },
    { id: 'fakt.tozala', keys: 'esc', nom: t('Kiritilganlarni bekor qilish'), run: () => { if (!ozgarishSoni) return false; setKiritmalar({}); } },
  ], !modal && !tenglash && !bajModal && !narxModal);
  useEffect(() => {
    if (!ozgarishSoni) return;
    const k = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', k);
    return () => window.removeEventListener('beforeunload', k);
  }, [ozgarishSoni]);

  let tabIndeks = 0;
  inputlar.current = [];
  const klaviatura = (e: KeyboardEvent<HTMLInputElement>, i: number, id: number) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void saqla(); }
    else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); inputlar.current[i + 1]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (inputlar.current[i - 1] ?? qidiruvRef.current)?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); if (kiritmalar[id]?.qiymat) kirit(id, { qiymat: '' }); else qidiruvRef.current?.focus(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); const q = qatorlarRef.current.get(id); if (q) bajOch(q); }
  };

  /** Qidiruv maydonidan: ↓ / Enter — birinchi ko'rinadigan qatorning hajm katagiga; Esc — qidiruvni tozalash. */
  const qidiruvKlav = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') { const el = inputlar.current[0]; if (el) { e.preventDefault(); el.focus(); } }
    else if (e.key === 'Escape' && qidiruv) { e.preventDefault(); setQidiruv(''); }
  };

  // Oddiy render funksiyasi (komponent emas) — input fokusini yo'qotmaslik uchun.
  const kiritish = (q: JurnalQator, kichik?: boolean) => {
    const i = tabIndeks++;
    qatorlarRef.current.set(q.id, q);
    const k = kiritmalar[q.id] ?? { rejim: '+' as Rejim, qiymat: '' };
    const xato = paket.xatolar.get(q.id);
    const yangiFakt = (() => { const n = Number(k.qiymat.replace(',', '.')); if (!k.qiymat.trim() || !Number.isFinite(n)) return null; return k.rejim === '+' ? q.fakt + n : n; })();
    // Ochiq qoldiqdan (smeta − fakt − almashtirilgan − bajarilmaydi; yagona formula) oshsa — faqat ogohlantirish, bloklanmaydi.
    const ortiqcha = xato || yangiFakt == null ? null : ochiqdanOrtiqcha({ smeta: q.smeta, fakt: yangiFakt, almashtirilgan: q.almashtirilgan, bajarilmaydi: q.bajarilmaydi });
    const oshdi = (ortiqcha ?? 0) > 0;
    return <div className="flex items-center justify-end gap-1">
      <div className="flex w-[92px] justify-end gap-0.5">{!kichik && [25, 50, 100].map((p) => { const v = qoldiqUlushi(q, p); return v ? <button key={p} type="button" tabIndex={-1} onClick={() => kirit(q.id, { rejim: '+', qiymat: v })} className="rounded border border-border px-1 py-0.5 text-[10px] text-text-dim hover:border-accent hover:text-text">{p}%</button> : null; })}</div>
      <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px]" role="group" aria-label="Kiritish rejimi">
        {(['+', '='] as Rejim[]).map((r) => <button key={r} type="button" tabIndex={-1} aria-pressed={k.rejim === r} title={r === '+' ? 'Bugun bajarilgan hajm (qo‘shiladi)' : 'Jami fakt (shu qiymatga tenglashtiriladi)'} onClick={() => kirit(q.id, { rejim: r })} className={`w-6 py-0.5 font-semibold ${k.rejim === r ? 'bg-accent text-white' : 'text-text-dim hover:bg-surface-2'}`}>{r}</button>)}
      </div>
      <div className="relative">
        <input ref={(el) => { inputlar.current[i] = el; }} onFocus={(e) => e.currentTarget.select()} value={k.qiymat} onChange={(e) => kirit(q.id, { qiymat: e.target.value })} onKeyDown={(e) => klaviatura(e, i, q.id)} inputMode="decimal"
          placeholder={k.rejim === '+' ? 'bugun' : 'jami'} aria-label={`${k.rejim === '+' ? 'Bugun bajarildi' : 'Jami fakt'}: ${q.nom}`}
          className={`w-[104px] rounded-md border bg-bg px-2 py-1 text-right font-mono text-[13px] tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${xato || oshdi ? 'border-warn' : k.qiymat ? 'border-accent/60' : 'border-border'}`} />
        {xato ? <div className="absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10px] text-warn">{JURNAL_XATO_MATN[xato]}</div>
          : yangiFakt != null && <div className={`absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10px] ${oshdi ? 'text-warn' : 'text-text-mute'}`} data-testid={oshdi ? 'qoldiqdan-oshdi' : undefined}>→ {fmt(yangiFakt)}{q.smeta ? ` / ${fmt(q.smeta)}` : ''}{oshdi ? ` · ${t('qoldiqdan oshdi')} +${fmt(ortiqcha)}` : ''}</div>}
      </div>
    </div>;
  };

  /** Ustunlar (egasi 2026-10-25: hajm/summa/narx aniq ko'rinsin): Nom | Birlik | Smeta | F2 | Fakt | Bu fakt | Qoldiq | Narx | Fakt summasi | % | amallar. */
  const USTUN = 'grid grid-cols-[minmax(240px,1fr)_52px_88px_88px_88px_250px_88px_96px_150px_72px_116px] items-center gap-x-2';
  const sonKatak = 'text-right font-mono text-[12px] tabular-nums';
  /** F2 qoldig'i (smeta − F2 − almashtirilgan) — yagona `ochiqQoldiq` ning F2 rejimi. */
  const f2QoldiqOl = (q: JurnalQator): number | null => ochiqQoldiq({ smeta: q.smeta, f2: Number(holatMap.get(q.id)?.f2_hajm ?? 0), almashtirilgan: q.almashtirilgan }, 'f2');
  /** Narx: resurs — smeta narxi (t2_qator.narx); ish — resurslar summasi / ish hajmi (hisoblangan, o'ylab topilmaydi). */
  const narxKatak = (q: JurnalQator) => {
    const r = rowById.get(q.id); const h = holatMap.get(q.id);
    const narx = h?.smeta_narx != null ? Number(h.smeta_narx) : r?.narx != null ? Number(r.narx) : null;
    if (narx != null) return <span title={t('Birlik narxi (NDS siz)')}>{fmt(narx)}</span>;
    if (narxlashMumkin(q.tur, narx)) return <button type="button" tabIndex={-1} onClick={() => setNarxModal({ id: q.id, nom: q.nom, birlik: q.birlik, kat: r?.kat ?? null, fakt: q.fakt, smeta: q.smeta })}
      className="rounded bg-warn/10 px-1 font-sans text-[10px] text-warn hover:bg-warn/20" title={t('Narxi noma‘lum - narxlash')} data-testid="narxsiz-belgi">{t('narxsiz')}</button>;
    if (q.tur === 'bl') { const ts = taxminKesim(q); if (ts && q.smeta) return <span className="text-text-mute" title={t('Ish birlik narxi = resurslar summasi / ish hajmi')}>{fmt(ts.smetaSumma / q.smeta)}</span>; }
    return <span className="text-text-mute">—</span>;
  };
  const belgilar = (q: JurnalQator) => <>
    {q.zamena && <span className="shrink-0 rounded bg-warn/10 px-1 text-[10px] text-warn" data-testid="zamena-belgi" title={q.aslNom ? t('Zamena: asl qator — {nom}', { nom: q.aslNom }) : t('Zamena')}>↻ {t('zamena')}{q.aslNom ? `: ${t('asl')} ${q.aslNom}` : ''}</span>}
    {q.qoshimcha && <span className="shrink-0 rounded bg-accent/10 px-1 text-[10px] text-accent" data-testid="qoshimcha-belgi">+ {t('qo‘shimcha')}</span>}
    {(() => { const m = almashtirildiMatn(q.almashtirilgan, q.smeta, q.birlik, fmt); return m ? <span className="shrink-0 rounded bg-warn/10 px-1 text-[10px] text-warn" data-testid="almashtirildi-belgi">{t('almashtirildi')} {m}</span> : null; })()}
    {saqlangan.has(q.id) && <CheckCircle2 size={13} className="shrink-0 text-ok" />}
    {(bajHajm.get(q.id) ?? 0) > 0 && <button type="button" tabIndex={-1} onClick={() => void bajBekor(q.id, q.nom)} className="shrink-0 rounded bg-danger/10 px-1 text-[10px] text-danger hover:bg-danger/20" title={t('Bajarilmaydi deb belgilangan hajm (bosing - bekor qilish)')} data-testid="baj-belgi">{t('bajarilmaydi')}: {fmt(bajHajm.get(q.id))}</button>}
  </>;
  const zamenaTugma = (q: JurnalQator, kichik?: boolean) => q.otaId != null && !q.qoshimcha && !q.zamena
    ? <button type="button" tabIndex={-1} onClick={() => zamenaOch(q)} title={q.tur === 'bl' ? t('Ish zamenasi — boshqa ish bilan almashtirish') : t('Resurs zamenasi — shu ish ichida boshqa resurs bilan almashtirish')} aria-label={`Zamena: ${q.nom}`} className="rounded-md p-1 text-text-mute hover:bg-warn/10 hover:text-warn"><Repeat2 size={kichik ? 12 : 14} /></button> : null;
  const tahrirTugmalar = (q: JurnalQator) => (q.qoshimcha || q.zamena) ? <>
    <button type="button" tabIndex={-1} onClick={() => tahrirOch(q)} title="Tahrirlash" aria-label={`Tahrirlash: ${q.nom}`} className="rounded-md p-1 text-text-mute hover:bg-accent/10 hover:text-accent"><Pencil size={13} /></button>
    <button type="button" tabIndex={-1} onClick={() => void ochir(q)} title={q.zamena ? 'Zamenani bekor qilish (asliga qaytarish)' : 'O‘chirish'} aria-label={`O‘chirish: ${q.nom}`} className="rounded-md p-1 text-text-mute hover:bg-danger/10 hover:text-danger"><Trash2 size={13} /></button>
  </> : null;
  /** Raqamli ustunlar (Birlik … %): ish, resurs va avto qatorlarda bir xil. */
  const raqamlar = (q: JurnalQator, kiritma: ReactNode) => {
    const h = holatMap.get(q.id); const f2ql = f2QoldiqOl(q); const ts = taxminKesim(q);
    const qoldiqOshdi = q.qoldiq != null && (q.smeta ?? 0) !== 0 && !ochiqBor(q) && Math.abs(q.qoldiq) > 1e-9;
    return <>
      <span className="truncate text-[11px] text-text-dim" title={q.birlik ?? ''}>{q.birlik ?? '—'}</span>
      <span className={`${sonKatak} text-text-dim`}>{fmt(q.smeta)}</span>
      <span className={`${sonKatak} text-text-dim`} title={t('Tasdiqlangan F2 hajmi')}>{fmt(h?.f2_hajm == null ? null : Number(h.f2_hajm))}</span>
      <span className={`${sonKatak} font-semibold text-text`}>{fmt(q.fakt)}</span>
      {kiritma}
      <span className={`${sonKatak} leading-tight`} data-testid={`ochiq-${q.id}`}>
        <span className={`block ${qoldiqOshdi ? 'text-warn' : 'text-text-dim'}`} title={t('Ochiq qoldiq = smeta − fakt − almashtirilgan − bajarilmaydi')}>{fmt(q.qoldiq)}</span>
        {f2ql != null && Math.abs(f2ql - (q.qoldiq ?? Number.NaN)) > 1e-9 && <span className={`block text-[10px] ${f2ql < -1e-9 && (q.smeta ?? 0) >= 0 ? 'text-warn' : 'text-text-mute'}`} title={t('F2 qoldiq = smeta − F2 − almashtirilgan')}>{t('F2')}: {fmt(f2ql)}</span>}
      </span>
      <span className={sonKatak}>{narxKatak(q)}</span>
      <span className="flex justify-end">{ts ? <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={ts.faktSumma} katKesim={ts.fakt} className="items-end" /> : <span className="text-[12px] text-text-mute">—</span>}</span>
      <span className="space-y-0.5"><span className="block text-right text-[11px] tabular-nums text-text-dim">{foiz(q.ulush)}</span><Progress ulush={q.ulush} holat={q.holat} ingichka /></span>
    </>;
  };
  const satrFon = (q: JurnalQator) => `transition-colors focus-within:bg-accent/[.07] ${saqlangan.has(q.id) ? 'bg-ok/10' : kiritmalar[q.id]?.qiymat ? 'bg-accent/[.04]' : ''} ${q.zamena ? 'border-l-2 border-warn/60' : q.qoshimcha ? 'border-l-2 border-accent/50' : 'border-l-2 border-transparent'}`;

  /** ISH qatori (yoki ishsiz alohida resurs): qalin, ISH belgisi, shifr; resurslarini ochish/yopish. */
  const ishQatori = (ish: JurnalIsh) => {
    const rang = HOLAT_RANG[ish.holat];
    const alohida = ish.tur !== 'bl';
    const bolaSoni = ish.resurslar.length + ish.avtomatik.length;
    const ochiq = ishOchiq(ish.id);
    const f2Bor = !alohida && (holatMap.get(ish.id)?.f2_hajm ?? 0) - ish.fakt > 1e-9;
    return <div className={`${USTUN} px-3 py-2 ${satrFon(ish)}`} data-testid={`ish-${ish.id}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        {bolaSoni > 0
          ? <button type="button" tabIndex={-1} onClick={() => ishAlmashtir(ish.id)} aria-expanded={ochiq} aria-label={t('Resurslar: {nom}', { nom: ish.nom })} title={ochiq ? t('Resurslarni yopish') : t('Resurslarni ochish ({n} ta)', { n: String(bolaSoni) })} className="rounded p-0.5 text-text-mute hover:text-text">{ochiq ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          : <span className="w-[18px] shrink-0" />}
        <span className={`h-2 w-2 shrink-0 rounded-full ${rang.nuqta}`} title={rang.matn} />
        {alohida ? <KatNishon kat={ish.kat ?? katAniqla(null, ish.tur, ish.birlik)} /> : <span className="shrink-0 rounded bg-accent/15 px-1 text-[10px] font-bold leading-4 text-accent" data-testid="ish-belgi">{t('ISH')}</span>}
        {ish.kod && <span className="shrink-0 font-mono text-[11px] text-text-mute">{ish.kod}</span>}
        <span className="truncate text-[13px] font-semibold text-text" title={`${ish.kod ? ish.kod + ' ' : ''}${ish.nom}`}>{ish.nom}</span>
        {alohida && <span className="shrink-0 text-[10px] text-text-mute">{t('alohida resurs')}</span>}
        {!ochiq && bolaSoni > 0 && <span className="shrink-0 text-[10px] text-text-mute">{t('{n} resurs', { n: String(bolaSoni) })}</span>}
        {belgilar(ish)}
        {!alohida && (() => { const n = takliflarSoni([ish.id]); return n > 0 ? <button type="button" tabIndex={-1} onClick={() => materiallarniOl([ish.id])} data-testid="materiallarni-ol"
          title={t('Ishdan keyingi alohida materiallarga ish ulushida taklif (avtomatik yozilmaydi)')} aria-label={t('Materiallarni ham olish: {nom}', { nom: ish.nom })}
          className="shrink-0 rounded border border-accent/40 px-1 text-[10px] text-accent hover:bg-accent/10">{t('Materiallarni ham olish ({n})', { n: String(n) })}</button> : null; })()}
        {alohida && !kiritmalar[ish.id]?.qiymat.trim() && (() => { const tk = matTaklifi(ish.id); return tk ? <button type="button" tabIndex={-1} onClick={() => kirit(ish.id, { rejim: '+', qiymat: String(tk.hajm) })} data-testid="material-taklif"
          title={t('«{nom}» ishi ulushida taklif — bosing, kiritmaga olinadi', { nom: tk.ish.nom })}
          className="shrink-0 rounded border border-dashed border-text-mute/40 px-1 text-[10px] text-text-mute opacity-80 hover:border-accent hover:text-accent">{t('taklif')}: +{fmt(tk.hajm)}</button> : null; })()}
      </div>
      {raqamlar(ish, kiritish(ish))}
      <div className="flex items-center justify-end gap-0.5">
        {tahrirTugmalar(ish)}
        <button type="button" tabIndex={-1} onClick={() => bajOch(ish)} title={sarlavhaBilan(t('Bajarilmaydi / qilib bo‘lmaydi'), 'ctrl+b')} aria-label={t('Bajarilmaydi: {nom}', { nom: ish.nom })} className="rounded-md p-1 text-text-mute hover:bg-danger/10 hover:text-danger"><Ban size={13} /></button>
        {f2Bor && <button type="button" tabIndex={-1} onClick={() => tenglashOch(ish.nom, [ish])} title={t('Fakt ni F2 ga tenglash')} aria-label={`Fakt = F2: ${ish.nom}`} className="rounded-md px-1 text-[10px] font-semibold text-text-mute hover:bg-accent/10 hover:text-accent">{t('=F2')}</button>}
        {zamenaTugma(ish)}
      </div>
    </div>;
  };

  /** Resurs qatori (ish ichida, chekinish bilan): kiritiladigan (mat/ob) yoki avto (rs: norma × ish fakti, xira). */
  const resursQatori = (r: JurnalQator, avto: boolean) => <div key={r.id} className={`${USTUN} py-1 pl-3 pr-3 ${avto ? 'opacity-75' : ''} ${satrFon(r)}`} data-testid={`resurs-${r.id}`}>
    <div className="flex min-w-0 items-center gap-1.5 pl-9">
      <span className="text-text-mute/60">└</span>
      <KatNishon kat={r.kat ?? katAniqla(null, r.tur, r.birlik)} />
      {avto && <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-surface-2 px-1 text-[10px] text-text-mute" title={t('Avtomatik: norma × ish fakti')} data-testid="avto-belgi"><Cpu size={10} />{t('avto')}</span>}
      {r.kod && <span className="shrink-0 font-mono text-[10px] text-text-mute">{r.kod}</span>}
      <span className={`truncate text-[12px] ${avto ? 'text-text-mute' : 'text-text-dim'}`} title={`${r.kod ? r.kod + ' ' : ''}${r.nom}`}>{r.nom}</span>
      {belgilar(r)}
    </div>
    {raqamlar(r, avto
      ? <span className="text-right text-[10px] text-text-mute" title={t('Avtomatik: norma × ish fakti')}>{r.norma != null ? `${t('norma')} ${fmt(r.norma)}` : t('avto')}</span>
      : kiritish(r, true))}
    <div className="flex items-center justify-end gap-0.5">
      {tahrirTugmalar(r)}
      {!avto && <button type="button" tabIndex={-1} onClick={() => bajOch(r)} title={sarlavhaBilan(t('Bajarilmaydi / qilib bo‘lmaydi'), 'ctrl+b')} aria-label={t('Bajarilmaydi: {nom}', { nom: r.nom })} className="rounded-md p-1 text-text-mute hover:bg-danger/10 hover:text-danger"><Ban size={13} /></button>}
      {zamenaTugma(r, true)}
    </div>
  </div>;

  const summaQatori = (s: BolimSumma | undefined) => s ? <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-[10px] text-text-mute" data-testid="bolim-summalar">
    {([['smeta', t('Smeta')], ['f2', t('F2')], ['fakt', t('Fakt')], ['qoldiq', t('F2 qoldiq')]] as const).map(([k, l]) => <span key={k} className="inline-flex items-start gap-1"><span className="pt-0.5 uppercase">{l}:</span><SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={s[k].ustamasiz} katKesim={s[k].kesim} /></span>)}
  </div> : null;

  const tanlanganBolim = bolimlar.find((b) => b.id === bolimId);
  const obyektUlushi = useMemo(() => { const top = bolimlar.filter((b) => b.otaId == null && b.ulush != null); return top.length ? top.reduce((s, b) => s + (b.ulush ?? 0), 0) / top.length : null; }, [bolimlar]);
  const bolimKorinadi = (b: (typeof bolimlar)[number]) => { let p = b.otaId; while (p != null) { if (yopiqBolim.has(p)) return false; p = bolimlar.find((x) => x.id === p)?.otaId ?? null; } return true; };
  const bolaliBolim = useMemo(() => new Set(bolimlar.map((b) => b.otaId).filter((x): x is number => x != null)), [bolimlar]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="karta flex flex-wrap items-center gap-3 px-3 py-2">
        <label className="flex items-center gap-2 text-[12px] font-medium text-text-dim">Sana<input type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="input h-8 px-2 text-[13px] text-text" aria-label="Fakt sanasi" /></label>
        <div className="relative min-w-[240px] flex-1"><Search size={14} className="absolute left-2.5 top-2 text-text-mute" />
          <input ref={qidiruvRef} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} onKeyDown={qidiruvKlav} placeholder="Butun obyekt bo‘yicha qidirish…  ( / )" aria-label="Qidirish" className="input h-8 w-full pl-8 pr-8 text-[13px]" />
          {qidiruv && <button onClick={() => setQidiruv('')} className="absolute right-2 top-2 text-text-mute" aria-label="Qidiruvni tozalash"><X size={14} /></button>}</div>
        <label className="flex items-center gap-1.5 text-[12px] text-text-dim"><input type="checkbox" checked={faqatQoldiq} onChange={(e) => setFaqatQoldiq(e.target.checked)} /> faqat bajarilmaganlar</label>
        {tanlanganBolim && <button type="button" onClick={() => tenglashOch(tanlanganBolim.nom, bolimIshlariYigish(tanlanganBolim.id, bolimIshlari, bolimBolalari, true))}
          title={sarlavhaBilan(t('Shu bo‘lim (ichki bo‘limlari bilan): F2 hajmi fakt dan ko‘p ishlarga farqni yozish'), 'f')} aria-label={t('Fakt = F2: bo‘lim')}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-semibold text-text hover:bg-surface-2">{t('Fakt = F2')}</button>}
        <button onClick={() => setModal({ rejim: { tur: 'additional', bolimId } })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/40 px-3 text-[12px] font-semibold text-text hover:bg-accent/10"><Plus size={14} className="text-accent" /> Smetadan tashqari ish</button>
      </section>

      <FaktStudioBar yigindi={yigindi} obyektId={obyektId} kompaniyaId={kompaniyaId} onF2={f2Otish} band={band} jami={summalar.get(0)} />

      {bolimlar.length === 0
        ? <section className="karta flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="max-w-md text-[13px] text-text-dim">Bu obyektda smeta yo‘q. Bajarilgan ishlarni resurslari bilan to‘g‘ridan-to‘g‘ri kiriting — ular faktga yoziladi va <b className="text-text">F2 ga tayyor</b> bo‘ladi.</p>
            <button onClick={() => setModal({ rejim: { tur: 'additional' } })} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"><Plus size={16} /> Bajarilgan ishni kiritish</button>
          </section>
        : <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="karta flex min-h-0 flex-col overflow-hidden" aria-label="Bo‘limlar">
            <div className="border-b border-border px-3 py-2.5">
              <div className="flex items-baseline justify-between text-[12px]"><span className="font-semibold text-text">Obyekt bo‘yicha</span><span className="tabular-nums text-text-dim">{foiz(obyektUlushi)}</span></div>
              <div className="mt-1.5"><Progress ulush={obyektUlushi} holat="bolim" /></div>
            </div>
            <nav className="min-h-0 flex-1 overflow-auto py-1">
              {bolimlar.filter(bolimKorinadi).map((b) => <div key={b.id} className={`group flex items-center gap-1 pr-2 ${b.id === bolimId && !qidiruv ? 'bg-accent/10' : 'hover:bg-surface-2'}`} style={{ paddingLeft: 6 + b.daraja * 14 }}>
                {bolaliBolim.has(b.id)
                  ? <button onClick={() => setYopiqBolim((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} className="rounded p-0.5 text-text-mute hover:text-text" aria-label="Ichki bo‘limlar">{yopiqBolim.has(b.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>
                  : <span className="w-[17px]" />}
                <button onClick={() => { setBolimId(b.id); setQidiruv(''); }} className="min-w-0 flex-1 py-1.5 text-left">
                  <div className="flex items-baseline justify-between gap-2"><span className={`truncate text-[12px] ${b.id === bolimId && !qidiruv ? 'font-semibold text-text' : 'text-text-dim'}`} title={b.nom}>{b.nom}</span><span className="shrink-0 text-[10px] tabular-nums text-text-mute" data-testid={`bolim-soni-${b.id}`} title={t('Ichidagi ishlar (ichki bo‘limlari bilan) va bajarilish')}>{t('{n} ish', { n: String(b.ishSoni) })} · {foiz(b.ulush)}</span></div>
                  <div className="mt-1"><Progress ulush={b.ulush} holat="bolim" ingichka /></div>
                </button>
              </div>)}
            </nav>
          </aside>

          <section className="karta flex min-h-0 flex-col overflow-hidden">
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2.5">
              <div className="min-w-0 space-y-1">
                <h2 className="truncate text-[14px] font-semibold text-text" title={tanlanganBolim?.nom}>{qidiruv ? `Qidiruv: «${qidiruv}»` : tanlanganBolim?.nom ?? 'Bo‘limni tanlang'}</h2>
                {!qidiruv && tanlanganBolim && <p className="text-[11px] text-text-mute">{tanlanganBolim.tugaganSoni} / {tanlanganBolim.ishSoni} ish bajarilgan · {foiz(tanlanganBolim.ulush)}</p>}
                {!qidiruv && tanlanganBolim && summaQatori(summalar.get(tanlanganBolim.id))}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {(() => { const idlar = korinadi.flatMap((b) => b.ishlar.map((i) => i.id)); const n = takliflarSoni(idlar); return n > 0 ? <button type="button" onClick={() => materiallarniOl(idlar)} data-testid="bolim-materiallarni-ol"
                  title={t('Ishdan keyingi alohida materiallarga ish ulushida taklif (avtomatik yozilmaydi)')}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-accent/40 px-2 text-[11px] font-semibold text-accent hover:bg-accent/10">{t('Bo‘lim: materiallarni ham olish ({n})', { n: String(n) })}</button> : null; })()}
                <button type="button" onClick={() => { setHammaYopiq((v) => !v); setTeskari(new Set()); }} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-text-dim hover:bg-surface-2 hover:text-text" aria-label={hammaYopiq ? t('Hamma resurslarni ochish') : t('Hamma resurslarni yopish')}>
                  {hammaYopiq ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{hammaYopiq ? t('Hammasini ochish') : t('Hammasini yopish')}</button>
                <div className="flex items-center gap-3 text-[10px] text-text-mute">{(['yangi', 'qisman', 'tugadi', 'oshdi'] as const).map((h) => <span key={h} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${HOLAT_RANG[h].nuqta}`} />{HOLAT_RANG[h].matn}</span>)}</div>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto pb-16" data-testid="fakt-jadval">
              <div className="min-w-[1340px]">
                <div className={`${USTUN} sticky top-0 z-10 border-b border-border bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-mute`} role="row">
                  <span>{t('Ish / resurs')}</span><span>{t('Birlik')}</span><span className="text-right">{t('Smeta')}</span><span className="text-right">{t('F2')}</span><span className="text-right">{t('Fakt')}</span>
                  <span className="text-right">{t('Bu fakt')}</span><span className="text-right" title={t('Ochiq qoldiq = smeta − fakt − almashtirilgan − bajarilmaydi')}>{t('Ochiq qoldiq')}</span><span className="text-right">{t('Narx')}</span><span className="text-right">{t('Fakt summasi')}</span><span className="text-right">%</span><span />
                </div>
                {korinadiIshSoni === 0 && <p className="p-6 text-center text-[13px] text-text-mute">{qidiruv ? 'Hech narsa topilmadi.' : t('Bu bo‘limda (ichki bo‘limlari bilan) ish yo‘q.')}</p>}
                {korinadi.map((bk, bi) => <div key={bk.bolim?.id ?? `b${bi}`}>
                  {bk.yol && <div className="border-b border-border/60 bg-surface-2/60 px-3 py-1 text-[10px] text-text-mute">{bk.yol}</div>}
                  {bk.bolim && <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border/60 bg-surface-2/50 py-1.5 pr-3" style={{ paddingLeft: 12 + (bk.nisbiy - 1) * 16 }} data-testid={`bolim-sarlavha-${bk.bolim.id}`}>
                    <button type="button" tabIndex={-1} onClick={() => setBolimId(bk.bolim!.id)} className="min-w-0 text-left" title={t('Shu bo‘limni ochish')}>
                      <span className="text-[12px] font-semibold text-text">{bk.bolim.nom}</span>
                      <span className="ml-2 text-[10px] tabular-nums text-text-mute">{t('{n} ish', { n: String(bk.bolim.ishSoni) })} · {foiz(bk.bolim.ulush)}</span>
                    </button>
                    {summaQatori(summalar.get(bk.bolim.id))}
                  </div>}
                  {bk.ishlar.map((ish) => <div key={ish.id} className="border-b border-border/60">
                    {ishQatori(ish)}
                    {ishOchiq(ish.id) && ish.resurslar.map((r) => resursQatori(r, false))}
                    {ishOchiq(ish.id) && ish.avtomatik.map((a) => resursQatori(a, true))}
                  </div>)}
                </div>)}
              </div>
            </div>
          </section>
        </div>}

      {ozgarishSoni > 0 && <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-surface/95 px-4 py-2.5 shadow-2xl backdrop-blur" role="region" aria-label="Saqlash paneli">
        <span className="text-[13px] font-semibold text-text">{ozgarishSoni} ta o‘zgarish</span>
        {paket.xatolar.size > 0 && <span className="text-[12px] text-warn">{paket.xatolar.size} tasida xato — tuzating</span>}
        <span className="text-[11px] text-text-mute">sana: {sana}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setKiritmalar({})} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-dim hover:text-text"><RotateCcw size={13} /> Bekor qilish</button>
          <button onClick={() => void saqla()} disabled={!paket.ok || band} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"><Save size={14} /> {band ? 'Saqlanmoqda…' : 'Saqlash'} <kbd className="ml-1 rounded bg-white/20 px-1 text-[10px]">Ctrl+S</kbd></button>
        </div>
      </div>}

      <FaktAiYordamchi kompaniyaId={kompaniyaId} obyektId={obyektId}
        malumot={{ bolimlar, bolimIshlari, holatMap, summalar, bajHajm, materialTakliflari: (id) => takliflarSoni([id]), kiritmaSoni: ozgarishSoni }}
        amallar={{ kirit: (id, k) => kirit(id, k), materiallarniOl, korsat: (q) => setQidiruv(q.kod || q.nom), zamena: (q, n) => zamenaOch(q, n), bajarilmaydi: (q, h) => bajOch(q, h) }} />

      {tenglash && <FaktF2Tenglash sarlavha={tenglash.sarlavha} reja={tenglash.reja} obyektId={obyektId} sana={sana}
        onYop={() => setTenglash(null)} onBajarildi={() => holatniYangila()}
        aktBekor={faktF2Bekor} />}

      {narxModal && <FaktNarxlash kompaniyaId={kompaniyaId} obyektId={obyektId} qator={narxModal} onYop={() => setNarxModal(null)}
        onSaqlandi={(xabar) => { setNarxModal(null); toast(xabar, 'ok'); void tuzilmaniYangila(); }} />}

      {bajModal && <FaktBajarilmadiTez kompaniyaId={kompaniyaId} obyektId={obyektId} sana={sana} qator={bajModal} onYop={() => setBajModal(null)}
        onSaqlandi={(xabar) => { setBajModal(null); toast(xabar, 'ok'); void bajYangila(); }} />}

      {modal && <IshAbcModal kompaniyaId={kompaniyaId} obyektId={obyektId} sana={sana}
        bolimlar={bolimlar.map((b) => ({ id: b.id, versiya: b.versiya, nom: `${'· '.repeat(b.daraja)}${b.nom}` }))}
        rejim={modal.rejim} tahrir={modal.tahrir} normativId={modal.normativId} onYop={() => setModal(null)}
        onSaqlandi={(xabar) => { setModal(null); toast(xabar, 'ok'); void tuzilmaniYangila(); }} />}
    </div>
  );
}
