import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Cpu, Pencil, Plus, Repeat2, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import { yangiOperationId, type T2Qator } from '../../api/supabase';
import { sbFaktYoz } from '../../api/t2-fakt';
import { JURNAL_XATO_MATN, jurnalPaket, jurnalQur, qoldiqUlushi, type JurnalHolat, type JurnalIsh, type JurnalQator, type Kiritma, type Rejim } from '../../lib/fakt-jurnal';
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
export function FaktJurnal({ kompaniyaId, obyektId, rows, states, holatniYangila, tuzilmaniYangila }: {
  kompaniyaId: number; obyektId: number;
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
  const [ochiqAvto, setOchiqAvto] = useState<Set<number>>(new Set());
  const [yopiqBolim, setYopiqBolim] = useState<Set<number>>(new Set());
  const [band, setBand] = useState(false);
  const [saqlangan, setSaqlangan] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<{ rejim: AbcRejim; tahrir?: AbcTahrir | null } | null>(null);
  /** Zamena: ish (yoki mustaqil material) — ish zamenasi; ish ichidagi resurs — resurs zamenasi (ish hajmi bilan). */
  const zamenaOch = (q: JurnalQator, ishHajm?: number | null) => setModal({ rejim: q.tur === 'bl' || ishHajm === undefined
    ? { tur: 'replacement', eski: { id: q.id, kod: q.kod, nom: q.nom, birlik: q.birlik, otaId: q.otaId, otaVersiya: q.otaVersiya } }
    : { tur: 'resurs_zamena', eski: { id: q.id, nom: q.nom, birlik: q.birlik, kat: null, norma: q.norma }, ishHajm: ishHajm ?? null } });

  // ── Qo'shilgan ish/zamena: TAHRIRLASH va O'CHIRISH (asliga qaytarish). Smeta qatorlari — o'zgarmas. ──
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
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
      setModal({ rejim: { tur: 'resurs_zamena', eski: { id: r.id, nom: r.nom ?? '', birlik: r.birlik, kat: r.kat, norma: q.norma }, ishHajm: ota?.hajm ?? null },
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
  const operationId = useRef(yangiOperationId());
  const inputlar = useRef<Array<HTMLInputElement | null>>([]);
  const qidiruvRef = useRef<HTMLInputElement | null>(null);

  const { bolimlar, bolimIshlari } = useMemo(() => jurnalQur(rows, states), [rows, states]);
  const faktlar = useMemo(() => { const h = new Map(states.map((x) => [x.qator_id, Number(x.fakt_hajm ?? 0)])); return new Map(rows.map((r) => [r.id, h.get(r.id) ?? 0])); }, [rows, states]);
  useEffect(() => { if (bolimId == null && bolimlar.length) setBolimId(bolimlar[0].id); }, [bolimId, bolimlar]);

  const paket = useMemo(() => jurnalPaket(kiritmalar, faktlar), [kiritmalar, faktlar]);
  const ozgarishSoni = Object.values(kiritmalar).filter((k) => k.qiymat.trim()).length;

  // Ko'rinadigan ishlar: qidiruv bo'lsa — butun obyekt bo'yicha; aks holda tanlangan bo'lim.
  const korinadi = useMemo((): { bolim: string | null; ish: JurnalIsh }[] => {
    const q = qidiruv.trim().toLowerCase();
    const mos = (x: JurnalQator) => `${x.kod ?? ''} ${x.nom}`.toLowerCase().includes(q);
    const filtr = (ish: JurnalIsh) => (!faqatQoldiq || (ish.qoldiq ?? 1) > 0 || ish.resurslar.some((r) => (r.qoldiq ?? 1) > 0))
      && (!q || mos(ish) || ish.resurslar.some(mos));
    if (q) {
      const out: { bolim: string | null; ish: JurnalIsh }[] = [];
      for (const b of bolimlar) for (const ish of bolimIshlari.get(b.id) ?? []) if (filtr(ish)) out.push({ bolim: b.nom, ish });
      return out.slice(0, 200);
    }
    return (bolimId != null ? bolimIshlari.get(bolimId) ?? [] : []).filter(filtr).map((ish) => ({ bolim: null, ish }));
  }, [qidiruv, faqatQoldiq, bolimId, bolimlar, bolimIshlari]);

  const kirit = (id: number, patch: Partial<Kiritma>) => setKiritmalar((o) => {
    const eski = o[id] ?? { rejim: '+' as Rejim, qiymat: '' };
    const yangi = { ...eski, ...patch };
    const n = { ...o };
    if (!yangi.qiymat.trim() && patch.rejim == null) delete n[id]; else n[id] = yangi;
    return n;
  });

  const saqla = useCallback(async () => {
    if (!paket.ok || band) return;
    setBand(true);
    try {
      const r = await sbFaktYoz({ obyektId, sana, operationId: operationId.current, qatorlar: paket.qatorlar, izoh: `Fakt jurnali: ${paket.qatorlar.length} qator` });
      if (!r.ok) { toast(r.error || r.xabar || 'Fakt saqlanmadi.', 'danger'); return; }
      const ids = new Set(paket.qatorlar.map((x) => x.qator_id));
      setSaqlangan(ids); setTimeout(() => setSaqlangan(new Set()), 2500);
      setKiritmalar({}); operationId.current = yangiOperationId();
      toast(`${ids.size} ta qator saqlandi — F2 qoldig‘i yangilandi.`, 'ok');
      await holatniYangila();
    } catch { toast('Javob olinmadi. Qayta saqlang — takror xavfsiz (bir xil amal ID).', 'danger'); }
    finally { setBand(false); }
  }, [paket, band, obyektId, sana, holatniYangila]);

  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saqla(); }
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); qidiruvRef.current?.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [saqla]);
  useEffect(() => {
    if (!ozgarishSoni) return;
    const k = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', k);
    return () => window.removeEventListener('beforeunload', k);
  }, [ozgarishSoni]);

  let tabIndeks = 0;
  inputlar.current = [];
  const klaviatura = (e: KeyboardEvent<HTMLInputElement>, i: number, id: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); inputlar.current[i + 1]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); inputlar.current[i - 1]?.focus(); }
    else if (e.key === 'Escape') { kirit(id, { qiymat: '' }); }
  };

  // Oddiy render funksiyasi (komponent emas) — input fokusini yo'qotmaslik uchun.
  const kiritish = (q: JurnalQator, kichik?: boolean) => {
    const i = tabIndeks++;
    const k = kiritmalar[q.id] ?? { rejim: '+' as Rejim, qiymat: '' };
    const xato = paket.xatolar.get(q.id);
    const yangiFakt = (() => { const n = Number(k.qiymat.replace(',', '.')); if (!k.qiymat.trim() || !Number.isFinite(n)) return null; return k.rejim === '+' ? q.fakt + n : n; })();
    return <div className="flex items-center justify-end gap-1.5">
      <div className="flex w-[118px] justify-end gap-1">{!kichik && [25, 50, 100].map((p) => { const v = qoldiqUlushi(q, p); return v ? <button key={p} type="button" tabIndex={-1} onClick={() => kirit(q.id, { rejim: '+', qiymat: v })} className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-text-dim hover:border-accent hover:text-text">{p}%</button> : null; })}</div>
      <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px]" role="group" aria-label="Kiritish rejimi">
        {(['+', '='] as Rejim[]).map((r) => <button key={r} type="button" tabIndex={-1} aria-pressed={k.rejim === r} title={r === '+' ? 'Bugun bajarilgan hajm (qo‘shiladi)' : 'Jami fakt (shu qiymatga tenglashtiriladi)'} onClick={() => kirit(q.id, { rejim: r })} className={`w-6 py-0.5 font-semibold ${k.rejim === r ? 'bg-accent text-white' : 'text-text-dim hover:bg-surface-2'}`}>{r}</button>)}
      </div>
      <div className="relative">
        <input ref={(el) => { inputlar.current[i] = el; }} value={k.qiymat} onChange={(e) => kirit(q.id, { qiymat: e.target.value })} onKeyDown={(e) => klaviatura(e, i, q.id)} inputMode="decimal"
          placeholder={k.rejim === '+' ? 'bugun' : 'jami'} aria-label={`${k.rejim === '+' ? 'Bugun bajarildi' : 'Jami fakt'}: ${q.nom}`}
          className={`w-28 rounded-md border bg-bg px-2 py-1 text-right font-mono text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${xato ? 'border-warn' : k.qiymat ? 'border-accent/60' : 'border-border'}`} />
        {xato ? <div className="absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10px] text-warn">{JURNAL_XATO_MATN[xato]}</div>
          : yangiFakt != null && <div className="absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap text-[10px] text-text-mute">→ {fmt(yangiFakt)}{q.smeta ? ` / ${fmt(q.smeta)}` : ''}</div>}
      </div>
    </div>;
  };

  const qator = (q: JurnalQator, resurs?: boolean, children?: ReactNode, ishHajm?: number | null) => {
    const rang = HOLAT_RANG[q.holat];
    return <div key={q.id} className={`grid grid-cols-[minmax(0,1fr)_minmax(150px,220px)_auto] items-center gap-4 px-3 ${resurs ? 'py-1.5 pl-9' : 'py-2.5'} transition-colors ${saqlangan.has(q.id) ? 'bg-ok/10' : kiritmalar[q.id]?.qiymat ? 'bg-accent/[.04]' : ''}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${rang.nuqta}`} title={rang.matn} />
          {q.kod && <span className="shrink-0 font-mono text-[10px] text-text-mute">{q.kod}</span>}
          <span className={`truncate ${resurs ? 'text-[12px] text-text-dim' : 'text-[13px] font-medium text-text'}`} title={q.nom}>{q.nom}</span>
          {q.tur === 'ob' && <span className="shrink-0 rounded bg-surface-2 px-1 text-[10px] text-text-dim">uskuna</span>}
          {q.qoshimcha && <span className="shrink-0 rounded bg-accent/10 px-1 text-[10px] text-accent">qo‘shimcha</span>}
          {q.zamena && <span className="shrink-0 rounded bg-warn/10 px-1 text-[10px] text-warn">zamena</span>}
          {saqlangan.has(q.id) && <CheckCircle2 size={13} className="shrink-0 text-ok" />}
        </div>
        {children}
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums"><span><b className="text-text">{fmt(q.fakt)}</b><span className="text-text-mute"> / {fmt(q.smeta)} {q.birlik}</span></span><span className="text-text-mute">{foiz(q.ulush)}</span></div>
        <Progress ulush={q.ulush} holat={q.holat} ingichka={resurs} />
      </div>
      <div className="flex items-center gap-1.5">
        {kiritish(q, resurs)}
        {(q.qoshimcha || q.zamena) && <>
          <button type="button" tabIndex={-1} onClick={() => tahrirOch(q)} title="Tahrirlash" aria-label={`Tahrirlash: ${q.nom}`} className="rounded-md p-1 text-text-mute hover:bg-accent/10 hover:text-accent"><Pencil size={13} /></button>
          <button type="button" tabIndex={-1} onClick={() => void ochir(q)} title={q.zamena ? 'Zamenani bekor qilish (asliga qaytarish)' : 'O‘chirish'} aria-label={`O‘chirish: ${q.nom}`} className="rounded-md p-1 text-text-mute hover:bg-danger/10 hover:text-danger"><Trash2 size={13} /></button>
        </>}
        {q.otaId != null && !q.qoshimcha && <button type="button" tabIndex={-1} onClick={() => zamenaOch(q, resurs ? ishHajm : undefined)} title="Zamena — boshqa ish/material bilan almashtirish" aria-label={`Zamena: ${q.nom}`} className="rounded-md p-1 text-text-mute hover:bg-warn/10 hover:text-warn"><Repeat2 size={14} /></button>}
      </div>
    </div>;
  };

  const tanlanganBolim = bolimlar.find((b) => b.id === bolimId);
  const obyektUlushi = useMemo(() => { const top = bolimlar.filter((b) => b.otaId == null && b.ulush != null); return top.length ? top.reduce((s, b) => s + (b.ulush ?? 0), 0) / top.length : null; }, [bolimlar]);
  const bolimKorinadi = (b: (typeof bolimlar)[number]) => { let p = b.otaId; while (p != null) { if (yopiqBolim.has(p)) return false; p = bolimlar.find((x) => x.id === p)?.otaId ?? null; } return true; };
  const bolaliBolim = useMemo(() => new Set(bolimlar.map((b) => b.otaId).filter((x): x is number => x != null)), [bolimlar]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="karta flex flex-wrap items-center gap-3 px-3 py-2">
        <label className="flex items-center gap-2 text-[12px] font-medium text-text-dim">Sana<input type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="input h-8 px-2 text-[13px] text-text" aria-label="Fakt sanasi" /></label>
        <div className="relative min-w-[240px] flex-1"><Search size={14} className="absolute left-2.5 top-2 text-text-mute" />
          <input ref={qidiruvRef} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder="Butun obyekt bo‘yicha qidirish…  ( / )" aria-label="Qidirish" className="input h-8 w-full pl-8 pr-8 text-[13px]" />
          {qidiruv && <button onClick={() => setQidiruv('')} className="absolute right-2 top-2 text-text-mute" aria-label="Qidiruvni tozalash"><X size={14} /></button>}</div>
        <label className="flex items-center gap-1.5 text-[12px] text-text-dim"><input type="checkbox" checked={faqatQoldiq} onChange={(e) => setFaqatQoldiq(e.target.checked)} /> faqat bajarilmaganlar</label>
        <button onClick={() => setModal({ rejim: { tur: 'additional', bolimId } })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/40 px-3 text-[12px] font-semibold text-text hover:bg-accent/10"><Plus size={14} className="text-accent" /> Smetadan tashqari ish</button>
      </section>

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
                  <div className="flex items-baseline justify-between gap-2"><span className={`truncate text-[12px] ${b.id === bolimId && !qidiruv ? 'font-semibold text-text' : 'text-text-dim'}`} title={b.nom}>{b.nom}</span><span className="shrink-0 text-[10px] tabular-nums text-text-mute">{foiz(b.ulush)}</span></div>
                  <div className="mt-1"><Progress ulush={b.ulush} holat="bolim" ingichka /></div>
                </button>
              </div>)}
            </nav>
          </aside>

          <section className="karta flex min-h-0 flex-col overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-semibold text-text">{qidiruv ? `Qidiruv: «${qidiruv}»` : tanlanganBolim?.nom ?? 'Bo‘limni tanlang'}</h2>
                {!qidiruv && tanlanganBolim && <p className="text-[11px] text-text-mute">{tanlanganBolim.tugaganSoni} / {tanlanganBolim.ishSoni} ish bajarilgan · {foiz(tanlanganBolim.ulush)}</p>}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-text-mute">{(['yangi', 'qisman', 'tugadi', 'oshdi'] as const).map((h) => <span key={h} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${HOLAT_RANG[h].nuqta}`} />{HOLAT_RANG[h].matn}</span>)}</div>
            </header>
            <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-auto pb-16">
              {korinadi.length === 0 && <p className="p-6 text-center text-[13px] text-text-mute">{qidiruv ? 'Hech narsa topilmadi.' : 'Bu bo‘limda kiritiladigan ish yo‘q — ichki bo‘limni tanlang.'}</p>}
              {korinadi.map(({ bolim, ish }) => <div key={ish.id}>
                {bolim && <div className="bg-surface-2/60 px-3 py-1 text-[10px] text-text-mute">{bolim}</div>}
                {qator(ish, false, ish.avtomatik.length > 0 && <button type="button" tabIndex={-1} onClick={() => setOchiqAvto((s) => { const n = new Set(s); if (n.has(ish.id)) n.delete(ish.id); else n.add(ish.id); return n; })} className="mt-0.5 inline-flex items-center gap-1 pl-4 text-[10px] text-text-mute hover:text-text">
                    <Cpu size={11} /> mehnat va mashina: {ish.avtomatik.length} ta — avtomatik (norma × ish fakti) {ochiqAvto.has(ish.id) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</button>)}
                {ochiqAvto.has(ish.id) && <div className="bg-surface-2/30 py-1 pl-12 pr-3">{ish.avtomatik.map((a) => <div key={a.id} className="flex justify-between gap-3 py-0.5 text-[11px] text-text-mute"><span className="truncate">{a.nom}</span><span className="flex shrink-0 items-center gap-2 tabular-nums">{fmt(a.fakt)} / {fmt(a.smeta)} {a.birlik}{a.norma != null ? ` · norma ${fmt(a.norma)}` : ''}{(a.zamena || a.qoshimcha)
                  ? <><button type="button" tabIndex={-1} onClick={() => tahrirOch(a)} title="Tahrirlash" aria-label={`Tahrirlash: ${a.nom}`} className="rounded p-0.5 hover:bg-accent/10 hover:text-accent"><Pencil size={12} /></button>
                     <button type="button" tabIndex={-1} onClick={() => void ochir(a)} title="O‘chirish / asliga qaytarish" aria-label={`O‘chirish: ${a.nom}`} className="rounded p-0.5 hover:bg-danger/10 hover:text-danger"><Trash2 size={12} /></button></>
                  : <button type="button" tabIndex={-1} onClick={() => zamenaOch(a, ish.smeta)} title="Resurs zamenasi" aria-label={`Zamena: ${a.nom}`} className="rounded p-0.5 hover:bg-warn/10 hover:text-warn"><Repeat2 size={12} /></button>}</span></div>)}</div>}
                {ish.resurslar.map((r) => qator(r, true, undefined, ish.smeta))}
              </div>)}
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

      {modal && <IshAbcModal kompaniyaId={kompaniyaId} obyektId={obyektId} sana={sana}
        bolimlar={bolimlar.map((b) => ({ id: b.id, versiya: b.versiya, nom: `${'· '.repeat(b.daraja)}${b.nom}` }))}
        rejim={modal.rejim} tahrir={modal.tahrir} onYop={() => setModal(null)}
        onSaqlandi={(xabar) => { setModal(null); toast(xabar, 'ok'); void tuzilmaniYangila(); }} />}
    </div>
  );
}
