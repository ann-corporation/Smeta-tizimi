import { memo, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Save, Search } from 'lucide-react';
import type { T2Qator } from '../../api/supabase';
import { bajarilmadiRoyxatOl } from '../../api/t2-bajarilmadi';
import { bajarilmadiHajmlar } from '../../lib/fakt-studio';
import { zamenaBoglanishOl } from '../../lib/fakt-zamena-boglanish';
import { tuzatishBoglanishlari } from '../../lib/smeta-anatomiya/tuzatish';
import { JURNAL_XATO_MATN, bolimSummalari, jurnalQur, kiritmaSoni, qoldiqUlushi, type BolimSumma, type JurnalHolat, type JurnalXato, type Kiritma, type SummaKesim, type ZamenaBoglanish } from '../../lib/fakt-jurnal';
import { ustunJoylash, ustunOqi } from '../../lib/fakt-foiz-grid';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { FaktQoralamaBanner } from '../../components/fakt/FaktQoralamaBanner';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { inputdami } from '../../lib/hotkeys/core';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { tezlikBelgisi } from '../../lib/tezlik-belgi';
import { useKiritmaHolat } from '../../lib/ish-varaq/kiritma-holat';
import { useQoralamaHimoya } from '../../lib/ish-varaq/qoralama-himoya';
import { useKatakFokus, useVirtualSatrlar } from '../../lib/ish-varaq/virtual-satrlar';
import { useFaktSaqlash } from '../../lib/ish-varaq/fakt-saqlash';
import { faktPaketiQur } from '../../lib/ish-varaq/paket';
import { kataAmali } from '../../lib/ish-varaq/kata-klavish';
import { useSahifaTarkHimoyasi, useSaqlanmaganHimoya } from '../../lib/ish-varaq/saqlanmagan-himoya';
import { BOLIMSIZ_ID, chiqarilganlarOl, kirishTartibiOl, qatorSumma, varaqMatnniOqi, varaqMatnQur, varaqSatrlari, type VSatr } from '../../lib/ish-varaq/model';

/**
 * «Ish varag'i» — HolatNative ichidagi rejim (route/menyu emas): ABC/ТН kabi BITTA tekis grid, to'liq klaviatura.
 * Ma'lumot — HolatNative'ning daraxti (paket yo'li `api/t2-paket-oqish`, `useT2Daraxt` keshi) — ikkinchi so'rov yo'q.
 * Fakt tahriri Fakt jurnali bilan BIR XIL mexanika va saqlash yo'li (lib/ish-varaq): `+5` bugun / `=40` jami / `50%`,
 * Ctrl+S — BITTA tranzaksiya (`sbFaktYoz` → `fakt_yoz_v2`), Ctrl+Z, «/» qidiruv, qoralama himoyasi.
 * Virtualizatsiya: yopiq bo'lim/ish ichi ro'yxatda yo'q; ko'rinadigan ~30-40 qator chiziladi.
 */
const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
const USTUN = 'grid grid-cols-[minmax(240px,1fr)_56px_92px_124px_92px_92px_150px] items-center gap-x-2 px-3';
const RAQAMLAR = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

type Lug = { holat: ReadonlyMap<number, JurnalHolat>; rowById: ReadonlyMap<number, T2Qator>; obyektId: number; kompaniyaId: number };
type Amallar = {
  kirit: (id: number, matn: string) => void;
  fokus: (id: number, key: string) => void;
  klav: (e: KeyboardEvent<HTMLInputElement>, id: number) => void;
  joyla: (e: ClipboardEvent<HTMLInputElement>, id: number) => void;
  ref: (id: number, el: HTMLInputElement | null) => void;
  bolimAlmashtir: (id: number) => void;
  ishAlmashtir: (id: number) => void;
  faolQil: (key: string, fokus: boolean) => void;
};

const BolimQatori = memo(function BolimQatori({ s, summa, faol, amallar, lug }: { s: Extract<VSatr, { tur: 'bolim' }>; summa: SummaKesim | undefined; faol: boolean; amallar: Amallar; lug: Lug }) {
  return <div data-satr={s.key} role="row" aria-selected={faol} aria-level={s.daraja + 1} aria-expanded={!s.yopiq} tabIndex={faol ? 0 : -1}
    onClick={() => amallar.faolQil(s.key, true)}
    className={`${USTUN} bg-surface-2 py-1.5 outline-none aria-selected:shadow-[inset_3px_0_0_var(--accent)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/60`}>
    <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: s.daraja * 14 }}>
      <button type="button" tabIndex={-1} aria-label={s.yopiq ? t('Ochish') : t('Yig‘ish')} aria-expanded={!s.yopiq} onClick={(e) => { e.stopPropagation(); amallar.bolimAlmashtir(s.id); }} className="rounded p-0.5 text-text-mute hover:text-text">
        {s.yopiq ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text" title={s.id === BOLIMSIZ_ID ? t('Bo‘limsiz') : s.nom}>{s.id === BOLIMSIZ_ID ? t('Bo‘limsiz') : s.nom}</span>
      <span className="shrink-0 text-[11px] text-text-mute">{t('{n} ish', { n: String(s.ishSoni) })}</span>
    </div>
    <span /><span /><span /><span /><span />
    <span className="flex justify-end">{summa ? <SummaJuft rejim="ustamali" kichik obyektId={lug.obyektId} kompaniyaId={lug.kompaniyaId} ustamasiz={summa.ustamasiz} katKesim={summa.kesim} className="items-end" /> : <span className="text-[12px] text-text-mute">—</span>}</span>
  </div>;
});

const IshQatori = memo(function IshQatori({ s, k, xato, saqlandi, faol, amallar, lug }: {
  s: Extract<VSatr, { tur: 'ish' | 'resurs' }>; k: Kiritma | undefined; xato: JurnalXato | undefined; saqlandi: boolean; faol: boolean; amallar: Amallar; lug: Lug;
}) {
  const q = s.q;
  const sKiritma = varaqMatnQur(k);
  const [matn, setMatn] = useState(sKiritma);
  const fokusda = useRef(false);
  // Tashqi o'zgarish (Esc, Ctrl+Z, qoralama, saqlandi) — katak matni kiritma bilan sinxron (yozish paytida tegilmaydi).
  useEffect(() => { if (!fokusda.current) setMatn(sKiritma); }, [sKiritma]);
  const holat = lug.holat.get(q.id);
  const f2 = holat?.f2_hajm == null ? null : Number(holat.f2_hajm);
  const summa = useMemo(() => qatorSumma(q, lug.holat, lug.rowById), [q, lug.holat, lug.rowById]);
  const yangiFakt = (() => { if (!k) return null; const n = kiritmaSoni(k.qiymat, q.smeta); if (typeof n !== 'number' || !Number.isFinite(n)) return null; return k.rejim === '+' ? q.fakt + n : n; })();
  const qoldiqManfiy = q.qoldiq != null && q.qoldiq < -1e-9 && (q.smeta ?? 0) > 0;
  const ishS = s.tur === 'ish' ? s : null;
  const ish = ishS != null;
  const bolaSoni = ishS ? ishS.bolaSoni : 0;
  const ochiq = ishS ? ishS.ochiq : false;
  return <div data-satr={s.key} data-testid={`varaq-${q.id}`} role="row" aria-selected={faol} aria-level={s.daraja + 1} aria-expanded={bolaSoni > 0 ? ochiq : undefined} tabIndex={faol ? 0 : -1}
    onClick={(e) => { const ichki = (e.target as HTMLElement).closest?.('input,button,a'); amallar.faolQil(s.key, !ichki); }}
    className={`${USTUN} py-1 outline-none transition-colors aria-selected:bg-accent/[.08] aria-selected:shadow-[inset_3px_0_0_var(--accent)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/60 ${saqlandi ? 'bg-ok/10' : k?.qiymat ? 'bg-accent/[.05]' : ''} ${s.tur === 'resurs' && s.avto ? 'opacity-70' : ''}`}>
    <div className="flex min-w-0 items-start gap-1.5" style={{ paddingLeft: s.daraja * 14 }}>
      {bolaSoni > 0
        ? <button type="button" tabIndex={-1} aria-label={t('Resurslar: {nom}', { nom: q.nom })} aria-expanded={ochiq} onClick={(e) => { e.stopPropagation(); amallar.ishAlmashtir(q.id); }} className="rounded p-0.5 text-text-mute hover:text-text">
          {ochiq ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        : <span className="w-[18px] shrink-0" />}
      {q.kod && <span className="shrink-0 font-mono text-[11px] text-text-mute">{q.kod}</span>}
      <span className={`min-w-0 flex-1 text-[13px] leading-[17px] ${ish ? 'font-semibold text-text' : 'text-text-dim'}`} title={`${q.kod ? q.kod + ' ' : ''}${q.nom}`}>{q.nom}</span>
    </div>
    <span className="text-[11.5px] text-text-mute">{q.birlik ?? ''}</span>
    <span className="text-right font-mono text-[12px] tabular-nums text-text-dim" data-testid={`varaq-smeta-${q.id}`}>{fmt(q.smeta)}</span>
    <div className="relative">
      {s.tahrir
        ? <>
          <input ref={(el) => amallar.ref(q.id, el)} value={matn} inputMode="decimal"
            onFocus={(e) => { fokusda.current = true; e.currentTarget.select(); amallar.fokus(q.id, s.key); }}
            onBlur={() => { fokusda.current = false; }}
            onChange={(e) => { setMatn(e.target.value); amallar.kirit(q.id, e.target.value); }}
            onKeyDown={(e) => amallar.klav(e, q.id)} onPaste={(e) => amallar.joyla(e, q.id)}
            placeholder={fmt(q.fakt)} aria-label={`${t('Fakt')}: ${q.nom}`} title={t('+5 — bugun, =40 — jami, 50% — smeta foizi. Enter — pastga, Ctrl+S — saqlash.')}
            className={`h-7 w-full rounded-[var(--radius-sm)] border bg-bg px-2 text-right font-mono text-[13px] tabular-nums outline-none focus:border-accent ${xato ? 'border-warn' : k?.qiymat ? 'border-accent' : 'border-border-strong'}`} />
          {xato
            ? <div className="absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10.5px] font-semibold text-warn">{t(JURNAL_XATO_MATN[xato])}</div>
            : yangiFakt != null && <div className="absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10.5px] text-text-mute">→ {fmt(yangiFakt)}</div>}
        </>
        : <span className="block text-right font-mono text-[12px] tabular-nums text-text-mute" title={t('Avtomatik: norma × ish fakti')}>{fmt(q.fakt)}</span>}
    </div>
    <span className="text-right font-mono text-[12px] tabular-nums text-text-dim" data-testid={`varaq-f2-${q.id}`}>{fmt(f2)}</span>
    <span className={`text-right font-mono text-[12px] tabular-nums ${qoldiqManfiy ? 'font-semibold text-danger' : 'text-text'}`} data-testid={`varaq-qoldiq-${q.id}`}>{fmt(q.qoldiq)}</span>
    <span className="flex justify-end"><SummaJuft rejim="ustamali" kichik obyektId={lug.obyektId} kompaniyaId={lug.kompaniyaId} ustamasiz={summa.ustamasiz} katKesim={summa.kesim} className="items-end" /></span>
  </div>;
});

export function IshVaraq({ kompaniyaId, obyektId, rows, states, holatniYangila }: {
  kompaniyaId: number; obyektId: number;
  rows: readonly T2Qator[]; states: readonly JurnalHolat[];
  /** Saqlangan qator id lari berilsa — faqat ular (va ota/bolalari) holati qayta o'qiladi. */
  holatniYangila: Parameters<typeof useFaktSaqlash>[0]['holatniYangila'];
}) {
  const [sana, setSana] = useState(() => new Date().toISOString().slice(0, 10));
  const { kiritmalar, setKiritmalar, tarix, setTarix, ommaviy, orqaga, tozala, ozgarishSoni } = useKiritmaHolat();
  const [qidiruv, setQidiruv] = useState('');
  const [yopiqBolim, setYopiqBolim] = useState<ReadonlySet<number>>(new Set());
  const [ochiqIsh, setOchiqIsh] = useState<ReadonlySet<number>>(new Set());
  const [saqlangan, setSaqlangan] = useState<ReadonlySet<number>>(new Set());
  const [faolKey, setFaolKey] = useState<string | null>(null);
  const jadvalRef = useRef<HTMLDivElement | null>(null);
  const qidiruvRef = useRef<HTMLInputElement | null>(null);
  const katakFokus = useKatakFokus();
  const { inputlar, setFokusId } = katakFokus;
  const { svodYaxlit } = useUstamaliSumma(obyektId, { kompaniyaId });

  // Qo'shimcha manbalar (Fakt jurnali bilan bir xil): «bajarilmaydi» hajmlari va zamena bog'lanishi — ochiq qoldiq to'g'ri chiqishi uchun.
  const [bajarilmadi, setBajarilmadi] = useState<Awaited<ReturnType<typeof bajarilmadiRoyxatOl>>['qatorlar']>([]);
  useEffect(() => {
    let tirik = true;
    void bajarilmadiRoyxatOl(kompaniyaId, obyektId).then((r) => { if (tirik && r.ok) setBajarilmadi(r.qatorlar); }).catch(() => undefined);
    return () => { tirik = false; };
  }, [kompaniyaId, obyektId]);
  const bajHajm = useMemo(() => bajarilmadiHajmlar(bajarilmadi), [bajarilmadi]);
  const [zb, setZb] = useState<ZamenaBoglanish | null>(null);
  const zamenaBor = useMemo(() => rows.some((r) => r.zamena), [rows]);
  useEffect(() => {
    if (!zamenaBor) { setZb(null); return; }
    let tirik = true;
    void zamenaBoglanishOl(obyektId).then((z) => { if (tirik) setZb(z); }).catch(() => undefined);
    return () => { tirik = false; };
  }, [obyektId, zamenaBor, rows, states]);

  // ── Model ──
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const holatMap = useMemo(() => new Map(states.map((s) => [s.qator_id, s])), [states]);
  const { bolimlar, bolimIshlari, ildizIshlari } = useMemo(() => jurnalQur(rows, states, zb, bajHajm), [rows, states, zb, bajHajm]);
  const tuzatish = useMemo(() => tuzatishBoglanishlari(rows), [rows]);
  const faktlar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, Number(x.fakt_hajm ?? 0)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? 0])); }, [rows, states]);
  const smetalar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, x.smeta_hajm == null ? null : Number(x.smeta_hajm)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? (r.hajm == null ? null : Number(r.hajm))])); }, [rows, states]);
  const qatorMap = useMemo(() => {
    const m = new Map<number, ReturnType<typeof jurnalQur>['ildizIshlari'][number]>();
    for (const arr of [...bolimIshlari.values(), ildizIshlari]) for (const x of arr) { m.set(x.id, x); for (const r of [...x.resurslar, ...x.avtomatik]) m.set(r.id, r as typeof x); }
    return m;
  }, [bolimIshlari, ildizIshlari]);
  const chiqarilganlar = useMemo(() => chiqarilganlarOl(rows, states, bajHajm), [rows, states, bajHajm]);
  const summalar = useMemo(() => bolimSummalari(rows, states, chiqarilganlar, svodYaxlit), [rows, states, chiqarilganlar, svodYaxlit]);
  const jami: BolimSumma | undefined = summalar.get(0);
  const lug = useMemo<Lug>(() => ({ holat: holatMap, rowById, obyektId, kompaniyaId }), [holatMap, rowById, obyektId, kompaniyaId]);

  const satrlar = useMemo(() => varaqSatrlari({ bolimlar, bolimIshlari, ildizIshlari, yopiqBolim, ochiqIsh, hosila: tuzatish.asos, qidiruv }), [bolimlar, bolimIshlari, ildizIshlari, yopiqBolim, ochiqIsh, tuzatish, qidiruv]);
  const satrIndeks = useMemo(() => new Map(satrlar.flatMap((s, i) => (s.tur === 'bolim' ? [] : [[s.q.id, i] as const]))), [satrlar]);
  const keyIndeks = useMemo(() => new Map(satrlar.map((s, i) => [s.key, i])), [satrlar]);
  const kirishTartib = useMemo(() => kirishTartibiOl(satrlar), [satrlar]);
  const kirishIndeks = useMemo(() => new Map(kirishTartib.map((id, i) => [id, i])), [kirishTartib]);
  const kattaJurnal = satrlar.length > 100;
  const { virtual, faolRef, fokusgaOt } = useVirtualSatrlar({
    satrlar, yoqilgan: kattaJurnal, jadvalRef, taxminBalandlik: (s) => (s.tur === 'bolim' ? 34 : 40), keyIndeks, satrIndeks, fokus: katakFokus, scrollMargin: 0,
  });
  useEffect(() => { if (jadvalRef.current) jadvalRef.current.scrollTop = 0; }, [qidiruv]);

  // ── Qoralama (draft himoyasi) va saqlash — Fakt jurnali bilan bir xil yo'l ──
  const foydalanuvchiId = useKompaniya().foydalanuvchi?.id ?? null;
  const { tiklandi, qoralamaYozDarhol, qoralamaBekor, qoralamaTozala } = useQoralamaHimoya({
    kompaniyaId, obyektId, foydalanuvchiId, qatorSoni: rows.length, faktlar, kiritmalar, setKiritmalar, tarixTozala: () => setTarix([]), sana, setSana,
  });
  const paket = useMemo(() => faktPaketiQur(kiritmalar, faktlar, smetalar, tuzatish), [kiritmalar, faktlar, smetalar, tuzatish]);
  const { band, saqla, saqlaKlav } = useFaktSaqlash({
    obyektId, sana, kiritmalar, paket, faktlar, smetalar, ozgarishSoni, holatniYangila, tozala, qoralamaYozDarhol, qoralamaTozala,
    fokusgaOt: (id) => fokusgaOt(id), qatorOl: (id) => qatorMap.get(id), izoh: `Ish varag‘i: ${paket.qatorlar.length} qator`,
    onSaqlandi: (ids) => { setSaqlangan(ids); setTimeout(() => setSaqlangan(new Set()), 2500); },
  });
  useSaqlanmaganHimoya('ish-varaq', ozgarishSoni);
  useSahifaTarkHimoyasi(ozgarishSoni);

  // ── O'lchov: ochilish (paket → birinchi chizish) ──
  const tezlik = useRef<ReturnType<typeof tezlikBelgisi> | null>(null);
  if (tezlik.current == null) tezlik.current = tezlikBelgisi('ish varag‘i');
  useEffect(() => { if (satrlar.length) tezlik.current?.tugadi(`${satrlar.length} satr / ${rows.length} qator`); }, [satrlar.length, rows.length]);

  // ── Klaviatura (Fakt jurnali bilan MOS) ──
  const satrEl = (key: string) => { return jadvalRef.current?.querySelector<HTMLElement>(`[data-satr="${key}"]`) ?? null; };
  const kutishFokus = useRef<string | null>(null);
  const tahrirOldi = useRef<{ id: number; k: Kiritma | null } | null>(null);
  const faolIndeks = () => (faolRef.current == null ? null : keyIndeks.get(faolRef.current) ?? null);
  const faolQil = (key: string | undefined, o: { fokus?: boolean; scroll?: boolean } = {}) => {
    if (key == null) return;
    faolRef.current = key; setFaolKey(key);
    const i = keyIndeks.get(key);
    const el = satrEl(key);
    if (o.scroll !== false) { if (kattaJurnal && i != null) virtual.scrollToIndex(i, { align: 'auto' }); else el?.scrollIntoView?.({ block: 'nearest' }); }
    if (o.fokus) { if (el) el.focus({ preventScroll: true }); else kutishFokus.current = key; }
  };
  useEffect(() => {
    const k = kutishFokus.current;
    if (k) { const el = satrEl(k); if (el) { kutishFokus.current = null; el.focus({ preventScroll: true }); } }
  });
  /** Navigatsiya faqat jadval ichida yoki sahifada fokus yo'q paytda (boshqa maydon ustidagi o'q tugmalariga tegilmaydi). */
  const navMumkin = () => {
    if (!satrlar.length) return false;
    const a = document.activeElement;
    return !a || a === document.body || (!!jadvalRef.current?.contains(a) && !inputdami(a));
  };
  const siljit = (d: number | 'bosh' | 'oxir') => {
    if (!navMumkin()) return false;
    const i = faolIndeks(); const oxir = satrlar.length - 1;
    const n = d === 'bosh' ? 0 : d === 'oxir' ? oxir : i == null ? (d > 0 ? 0 : oxir) : Math.max(0, Math.min(oxir, i + d));
    faolQil(satrlar[n].key, { fokus: true });
  };
  const bolimAlmashtir = (id: number) => setYopiqBolim((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ishAlmashtir = (id: number) => setOchiqIsh((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** ← : ochiq bo'lim/ishni yig'ish, aks holda ota qatorga (resurs → ish → bo'lim sarlavhasi). */
  const chapga = () => {
    if (!navMumkin()) return false;
    const i = faolIndeks(); if (i == null) return siljit(1);
    const s = satrlar[i];
    if (s.tur === 'bolim' && !s.yopiq) { bolimAlmashtir(s.id); return; }
    if (s.tur === 'ish' && s.ochiq) { ishAlmashtir(s.q.id); return; }
    const otaTur = s.tur === 'resurs' ? 'ish' : s.tur === 'ish' ? 'bolim' : null;
    if (!otaTur) return;
    for (let k = i - 1; k >= 0; k--) if (satrlar[k].tur === otaTur) { faolQil(satrlar[k].key, { fokus: true }); return; }
  };
  /** → : yopiq bo'lim/ishni ochish, aks holda ichiga (keyingi qator). */
  const ongga = () => {
    if (!navMumkin()) return false;
    const i = faolIndeks(); if (i == null) return siljit(1);
    const s = satrlar[i];
    if (s.tur === 'bolim' && s.yopiq) { bolimAlmashtir(s.id); return; }
    if (s.tur === 'ish' && s.bolaSoni > 0 && !s.ochiq) { ishAlmashtir(s.q.id); return; }
    if (s.tur !== 'resurs' && i < satrlar.length - 1) faolQil(satrlar[i + 1].key, { fokus: true });
  };
  const kirit = (id: number, matn: string) => {
    const k = varaqMatnniOqi(matn);
    setKiritmalar((o) => { const n = { ...o }; if (k) n[id] = k; else delete n[id]; return n; });
  };
  /** Enter/F2 — faol qatorning fakt katagiga; raqam — katakni shu raqam bilan almashtirib boshlaydi; bo'lim sarlavhasida — yig'ish/yoyish. */
  const tahrirla = (bosh?: string) => {
    if (!navMumkin()) return false;
    const i = faolIndeks(); const s = i == null ? undefined : satrlar[i]; if (!s) return false;
    if (s.tur === 'bolim') { if (bosh != null) return false; bolimAlmashtir(s.id); return; }
    if (!s.tahrir) { if (bosh == null && s.tur === 'ish' && s.bolaSoni > 0) { ishAlmashtir(s.q.id); return; } toast(t('Bu qatorga fakt qo‘lda kiritilmaydi (avtomatik).'), 'warn'); return; }
    tahrirOldi.current = { id: s.q.id, k: kiritmalar[s.q.id] ?? null };
    if (bosh != null) kirit(s.q.id, bosh);
    fokusgaOt(s.q.id);
  };
  const faolQator = () => { if (!navMumkin()) return null; const i = faolIndeks(); const s = i == null ? undefined : satrlar[i]; return s && s.tur !== 'bolim' && s.tahrir ? s.q : null; };
  const qoldiqToldir = () => {
    const q = faolQator(); if (!q) return false;
    const v = qoldiqUlushi(q, 100);
    if (!v) { toast(t('Ochiq qoldiq yo‘q — to‘ldiriladigan hajm yo‘q.'), 'warn'); return; }
    kirit(q.id, `+${v}`);
  };
  const kiritmaTozala = () => { const q = faolQator(); if (!q || !kiritmalar[q.id]) return false; kirit(q.id, ''); };
  const tahrirBekor = (id: number) => {
    const o = tahrirOldi.current; tahrirOldi.current = null;
    if (o?.id === id) setKiritmalar((x) => { const n = { ...x }; if (o.k) n[id] = o.k; else delete n[id]; return n; });
    faolQil(`q-${id}`, { fokus: true, scroll: false });
  };
  const klav = (e: KeyboardEvent<HTMLInputElement>, id: number) => {
    const i = kirishIndeks.get(id) ?? -1;
    switch (kataAmali(e, tarix.length > 0)) {
      case 'keyingi': e.preventDefault(); fokusgaOt(kirishTartib[i + 1]); break; // Enter = keyingi qator (xuddi shu ustun)
      case 'oldingi': e.preventDefault(); if (i > 0) fokusgaOt(kirishTartib[i - 1]); else qidiruvRef.current?.focus(); break;
      case 'tab+': case 'tab-': { const next = kirishTartib[i + (e.shiftKey ? -1 : 1)]; if (next != null) { e.preventDefault(); fokusgaOt(next); } break; }
      case 'bekor': e.preventDefault(); tahrirBekor(id); break;
      case 'orqaga': e.preventDefault(); orqaga(); break;
      default: break; // Ctrl+S / Ctrl+Enter — yagona hotkeys moduli
    }
  };
  /** Excel'dan ustun joylash: bir nechta qator bo'lsa — shu katakdan pastga ketma-ket (qoralamaga; saqlash — bitta). */
  const joyla = (e: ClipboardEvent<HTMLInputElement>, id: number) => {
    const qiymatlar = ustunOqi(e.clipboardData.getData('text'));
    const i = kirishIndeks.get(id);
    if (!qiymatlar || i == null) return;
    e.preventDefault();
    const r = ustunJoylash(kiritmalar, kirishTartib, i, qiymatlar);
    ommaviy(r.kiritmalar);
    toast(t('{n} ta qiymat joylandi — tekshirib saqlang (Ctrl+S).', { n: r.joylandi }), 'ok');
  };
  const qidiruvKlav = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') { const i = satrlar.findIndex((s) => s.tur !== 'bolim'); if (i >= 0) { e.preventDefault(); faolQil(satrlar[i].key, { fokus: true }); } }
    else if (e.key === 'Escape' && qidiruv) { e.preventDefault(); setQidiruv(''); }
  };

  useHotkeys('ish-varaq', t('Ish varag‘i: qatorlar bo‘ylab'), [
    { id: 'iv.saqla', keys: ['ctrl+s', 'ctrl+enter'], nom: t('Saqlash'), inInput: true, run: () => { saqlaKlav(); } },
    { id: 'iv.qidiruv', keys: '/', nom: t('Qidirish'), run: () => { qidiruvRef.current?.focus(); } },
    { id: 'iv.tozala', keys: 'esc', nom: t('Kiritilganlarni bekor qilish'), run: () => { if (!ozgarishSoni) return false; ommaviy({}); } },
    { id: 'iv.orqaga', keys: 'ctrl+z', nom: t('Orqaga (ommaviy kiritma)'), run: () => orqaga() },
    { id: 'iv.past', keys: 'arrowdown', nom: t('Keyingi qator'), run: () => siljit(1) },
    { id: 'iv.tepa', keys: 'arrowup', nom: t('Oldingi qator'), run: () => siljit(-1) },
    { id: 'iv.bosh', keys: 'home', nom: t('Birinchi qator'), run: () => siljit('bosh') },
    { id: 'iv.oxir', keys: 'end', nom: t('Oxirgi qator'), run: () => siljit('oxir') },
    { id: 'iv.yig', keys: 'arrowleft', nom: t('Yig‘ish / ota qatorga'), run: () => chapga() },
    { id: 'iv.och', keys: 'arrowright', nom: t('Ochish / ichiga'), run: () => ongga() },
    { id: 'iv.tahrir', keys: ['enter', 'f2'], nom: t('Faktni tahrirlash (Enter — keyingi qator, Esc — bekor)'), run: () => tahrirla() },
    { id: 'iv.raqam', keys: RAQAMLAR, nom: t('Raqam — faktni yozishni boshlash'), run: (e) => tahrirla(e.key) },
    { id: 'iv.qoldiq', keys: '*', nom: t('Ochiq qoldiqni to‘liq yozish'), run: () => qoldiqToldir() },
    { id: 'iv.ochir', keys: ['delete', 'backspace'], nom: t('Kiritilgan (saqlanmagan) qiymatni o‘chirish'), run: () => kiritmaTozala() },
  ], true);

  // ── Qator amallari (barqaror; memo qatorlar har kiritishda qayta chizilmasin) ──
  const A = useRef<Amallar | null>(null);
  A.current = {
    kirit, klav, joyla, bolimAlmashtir, ishAlmashtir,
    fokus: (id, key) => { setFokusId(id); faolRef.current = key; setFaolKey(key); const o = tahrirOldi.current; if (o?.id !== id) tahrirOldi.current = { id, k: kiritmalar[id] ?? null }; },
    ref: (id, el) => { if (el) inputlar.current.set(id, el); else inputlar.current.delete(id); },
    faolQil: (key, fokus) => faolQil(key, { fokus, scroll: false }),
  };
  const amallar = useMemo<Amallar>(() => ({
    kirit: (id, m) => A.current!.kirit(id, m), fokus: (id, k) => A.current!.fokus(id, k), klav: (e, id) => A.current!.klav(e, id),
    joyla: (e, id) => A.current!.joyla(e, id), ref: (id, el) => A.current!.ref(id, el),
    bolimAlmashtir: (id) => A.current!.bolimAlmashtir(id), ishAlmashtir: (id) => A.current!.ishAlmashtir(id), faolQil: (k, f) => A.current!.faolQil(k, f),
  }), []);

  const satrChiz = (s: VSatr) => s.tur === 'bolim'
    ? <BolimQatori s={s} summa={summalar.get(s.id)?.smeta} faol={faolKey === s.key} amallar={amallar} lug={lug} />
    : <IshQatori s={s} k={kiritmalar[s.q.id]} xato={paket.xatolar.get(s.q.id)} saqlandi={saqlangan.has(s.q.id)} faol={faolKey === s.key} amallar={amallar} lug={lug} />;

  return <section className="fz-card flex min-h-0 flex-col" aria-label={t('Ish varag‘i')} data-testid="ish-varaq">
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <label className="relative flex min-w-[200px] max-w-[360px] flex-1 items-center">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2 text-text-mute" />
        <input ref={qidiruvRef} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} onKeyDown={qidiruvKlav} placeholder={t('Qidirish (shifr yoki nom) — «/»')} aria-label={t('Qidirish')}
          className="h-8 w-full rounded-[var(--radius-sm)] border border-border-strong bg-bg pl-7 pr-2 text-[13px] outline-none focus:border-accent" />
      </label>
      <label className="flex items-center gap-1.5 text-[12px] text-text-dim">
        <span>{t('Sana')}</span>
        <input type="date" value={sana} onChange={(e) => setSana(e.target.value)} aria-label={t('Fakt sanasi')} className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-bg px-2 text-[12.5px]" />
      </label>
      <span className="ml-auto text-[11.5px] text-text-mute" data-testid="ish-varaq-soni">{t('{n} satr', { n: String(satrlar.length) })}</span>
    </div>
    {tiklandi && <div className="px-3 pt-2"><FaktQoralamaBanner soni={Object.keys(tiklandi.kiritmalar).length} ziddiyatlar={tiklandi.ziddiyatlar} band={band}
      nomi={(id) => qatorMap.get(id)?.nom} onSaqla={() => void saqla()} onBekor={qoralamaBekor} /></div>}
    <div className={`${USTUN} border-b border-border bg-surface py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-mute`} role="row">
      <span>{t('Nomi')}</span><span>{t('Birlik')}</span><span className="text-right">{t('Smeta')}</span><span className="text-right">{t('Fakt')}</span><span className="text-right">{t('F2')}</span><span className="text-right">{t('Qoldiq')}</span><span className="text-right">{t('Summa')}</span>
    </div>
    <div ref={jadvalRef} role="grid" aria-label={t('Ish varag‘i')} aria-rowcount={satrlar.length} className="h-[60vh] min-h-[360px] overflow-auto">
      {satrlar.length === 0 && <p className="p-6 text-center text-[13px] text-text-mute">{qidiruv ? t('Hech narsa topilmadi.') : t('Bu obyektda ish yo‘q.')}</p>}
      {kattaJurnal
        ? <div className="relative" style={{ height: virtual.getTotalSize() }} data-testid="ish-varaq-virtual">
          {virtual.getVirtualItems().map((v) => <div key={v.key} data-index={v.index} ref={virtual.measureElement} className="absolute left-0 top-0 w-full border-b border-border" style={{ transform: `translateY(${v.start}px)` }}>{satrChiz(satrlar[v.index])}</div>)}
        </div>
        : satrlar.map((s) => <div key={s.key} className="border-b border-border">{satrChiz(s)}</div>)}
    </div>
    <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-b-[var(--radius-md)] border-t border-border-strong bg-surface px-4 py-2" role="region" aria-label={t('Jami va saqlash')} data-testid="ish-varaq-jami">
      {jami && ([['smeta', t('Smeta')], ['fakt', t('Fakt')], ['f2', t('F2')], ['qoldiq', t('F2 qoldiq')]] as const).map(([kalit, yorliq]) =>
        <span key={kalit} className="inline-flex items-start gap-1.5"><span className="pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-mute">{yorliq}</span><SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={jami[kalit].ustamasiz} katKesim={jami[kalit].kesim} /></span>)}
      <div className="ml-auto flex items-center gap-2">
        {ozgarishSoni > 0 && <span className="text-[12.5px] font-semibold text-text" data-testid="ish-varaq-saqlanmagan">{t('{n} ta o‘zgarish saqlanmagan', { n: String(ozgarishSoni) })}</span>}
        {paket.xatolar.size > 0 && <span className="fz-chip fz-chip--warn">{t('{n} tasida xato — tuzating', { n: String(paket.xatolar.size) })}</span>}
        {ozgarishSoni > 0 && <button type="button" onClick={() => ommaviy({})} className="fz-btn fz-btn--ghost"><RotateCcw size={13} aria-hidden="true" /> {t('Bekor qilish')} <kbd className="fz-kbd">{'Esc'}</kbd></button>}
        <button type="button" onClick={() => void saqla()} disabled={!paket.ok || band} className="fz-btn fz-btn--primary"><Save size={14} aria-hidden="true" /> {band ? t('Saqlanmoqda…') : t('Saqlash')} <kbd className="fz-kbd">{'Ctrl+S'}</kbd></button>
      </div>
    </div>
  </section>;
}

export default IshVaraq;
