import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { BookOpen, Plus, Repeat2, Trash2, X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { abcXato, ishAbcSaqla, ishTuriQidir, narxTakliflari, resursQidir, type IshTuriVariant, type Kat, type NarxManba, type ResursVariant } from '../../api/t2-ish-abc';
import { KATLAR, KAT_NOMI, MANBA_NOMI, abcHisobla, abcTekshir, engYaxshiNarx, katAniqla, son, type AbcResurs } from '../../lib/ish-abc';

export type AbcRejim =
  | { tur: 'additional'; bolimId?: number | null }
  | { tur: 'replacement'; eski: { id: number; kod: string | null; nom: string; birlik: string | null; otaId: number | null; otaVersiya: number | null } }
  | { tur: 'resurs_zamena'; eski: { id: number; nom: string; birlik: string | null; kat: string | null; norma: number | null }; ishHajm: number | null };

const fmt = (v: number | null | undefined, d = 2) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d }));
const MANBA_RANG: Record<NarxManba, string> = { smeta_obyekt: 'bg-ok/15 text-ok', smeta: 'bg-accent/15 text-accent', katalog: 'bg-warn/15 text-warn', qolda: 'bg-surface-2 text-text-dim' };

/** Yozish bilan kutubxonadan taklif beradigan maydon (debounce 300 ms, ↑↓ Enter Esc). */
function Taklifli<T>({ qiymat, onChange, qidir, render, tanla, placeholder, ariaLabel, className }: {
  qiymat: string; onChange: (v: string) => void; qidir: (q: string) => Promise<T[]>;
  render: (x: T) => ReactNode; tanla: (x: T) => void; placeholder?: string; ariaLabel: string; className?: string;
}) {
  const [variantlar, setVariantlar] = useState<T[]>([]);
  const [ochiq, setOchiq] = useState(false);
  const [faol, setFaol] = useState(0);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const navbat = useRef(0);
  useEffect(() => {
    if (!ochiq || qiymat.trim().length < 3) { setVariantlar([]); return; }
    const n = ++navbat.current;
    const t = setTimeout(() => {
      setYuklanmoqda(true);
      void qidir(qiymat).then((v) => { if (n === navbat.current) { setVariantlar(v); setFaol(0); } }).finally(() => { if (n === navbat.current) setYuklanmoqda(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [qiymat, ochiq, qidir]);
  const klav = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!variantlar.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFaol((f) => Math.min(f + 1, variantlar.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFaol((f) => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); tanla(variantlar[faol]); setOchiq(false); }
    else if (e.key === 'Escape') setOchiq(false);
  };
  return <div className="relative">
    <input value={qiymat} onChange={(e) => { onChange(e.target.value); setOchiq(true); }} onFocus={() => setOchiq(true)} onBlur={() => setTimeout(() => setOchiq(false), 150)} onKeyDown={klav}
      placeholder={placeholder} aria-label={ariaLabel} aria-autocomplete="list" className={className} />
    {ochiq && (yuklanmoqda || variantlar.length > 0) && <div role="listbox" className="absolute left-0 top-full z-50 mt-1 max-h-80 w-[min(720px,80vw)] overflow-auto rounded-lg border border-border bg-surface shadow-2xl">
      {yuklanmoqda && !variantlar.length && <div className="px-3 py-2 text-[12px] text-text-mute">Kutubxonadan qidirilmoqda…</div>}
      {variantlar.map((v, i) => <button key={i} type="button" role="option" aria-selected={i === faol} onMouseDown={(e) => { e.preventDefault(); tanla(v); setOchiq(false); }} onMouseEnter={() => setFaol(i)}
        className={`block w-full border-b border-border/50 px-3 py-2 text-left text-[12px] ${i === faol ? 'bg-accent/10' : 'hover:bg-surface-2'}`}>{render(v)}</button>)}
    </div>}
  </div>;
}

/**
 * Kichik ABC (egasi, 2026-10-01): ШНК tuzilishida qo'shimcha ish / ish zamenasi / resurs zamenasi.
 * Ish turi nomini yozganda — kompaniyaning yuklangan smetalaridan variantlar (resurs tarkibi va
 * normalari bilan); resurs narxi — shu smeta (RES) → boshqa smetalar → katalog → qo'lda.
 */
export function IshAbcModal({ kompaniyaId, obyektId, sana, bolimlar, rejim, onYop, onSaqlandi }: {
  kompaniyaId: number; obyektId: number; sana: string;
  bolimlar: Array<{ id: number; nom: string; versiya: number }>;
  rejim: AbcRejim; onYop: () => void; onSaqlandi: (xabar: string) => void;
}) {
  const resursRejim = rejim.tur === 'resurs_zamena';
  const [bolimId, setBolimId] = useState(rejim.tur === 'additional' && rejim.bolimId ? String(rejim.bolimId) : '');
  const [ish, setIsh] = useState({ kod: '', nom: '', birlik: rejim.tur === 'replacement' ? rejim.eski.birlik ?? '' : '', hajm: '' });
  const [resurslar, setResurslar] = useState<AbcResurs[]>(() => rejim.tur === 'resurs_zamena'
    ? [{ kat: katAniqla(rejim.eski.kat, null, rejim.eski.birlik), kod: '', nom: '', birlik: rejim.eski.birlik ?? '', norma: rejim.eski.norma != null ? String(rejim.eski.norma) : '', narx: '', manba: 'qolda' }]
    : []);
  const [fakt, setFakt] = useState('');
  const [sabab, setSabab] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [koldaXato, setKoldaXato] = useState(false);
  const operationId = useRef(yangiOperationId());

  const ishHajm = rejim.tur === 'resurs_zamena' ? (rejim.ishHajm != null ? String(rejim.ishHajm) : '') : ish.hajm;
  const hisob = useMemo(() => abcHisobla(ishHajm, resurslar), [ishHajm, resurslar]);
  const xatolar = useMemo(() => abcTekshir({ rejim: resursRejim ? 'resurs' : 'ish', ish, resurslar, sabab, fakt }), [resursRejim, ish, resurslar, sabab, fakt]);

  const ishTuriQ = useMemo(() => (q: string) => ishTuriQidir(obyektId, q), [obyektId]);
  const resursQ = useMemo(() => (kat: Kat) => (q: string) => resursQidir(obyektId, q, kat), [obyektId]);

  /** Resurslar narxini kutubxonadan to'ldirish (qo'lda kiritilganlarga tegmaydi). */
  const narxlarniOl = async (rs: AbcResurs[], faqat?: number) => {
    const ind = rs.map((_, i) => i).filter((i) => faqat == null || i === faqat);
    const v = await narxTakliflari(obyektId, ind.map((i) => ({ nom: rs[i].nom, birlik: rs[i].birlik })));
    setResurslar((old) => old.map((r, i) => {
      const k = ind.indexOf(i); if (k < 0) return r;
      const variantlar = v[k] ?? [];
      const eng = engYaxshiNarx(variantlar);
      return r.manba === 'qolda' && r.narx.trim() ? { ...r, variantlar } : eng ? { ...r, variantlar, narx: String(eng.narx), manba: eng.manba } : { ...r, variantlar };
    }));
  };

  const ishTuriTanla = (v: IshTuriVariant) => {
    setIsh((o) => ({ ...o, kod: v.kod ?? '', nom: v.nom, birlik: v.birlik ?? o.birlik }));
    const rs: AbcResurs[] = v.sostav.filter((c) => c.norma != null && c.norma > 0).map((c) => ({
      kat: katAniqla(c.kat, c.tur, c.birlik), kod: c.kod ?? '', nom: c.nom, birlik: c.birlik ?? '', norma: String(c.norma),
      narx: c.narx ? String(c.narx) : '', manba: c.narx ? 'smeta' : 'qolda',
    }));
    setResurslar(rs);
    void narxlarniOl(rs);
  };
  const resursTanla = (i: number, v: ResursVariant) => {
    const n = resurslar.map((r, j) => j === i ? { ...r, kat: v.kat ? katAniqla(v.kat) : r.kat, kod: v.kod ?? '', nom: v.nom, birlik: v.birlik ?? r.birlik, narx: v.narx ? String(v.narx) : r.narx, manba: v.narx ? v.narx_manba : r.manba } : r);
    setResurslar(n);
    void narxlarniOl(n, i);
  };
  const yangila = (i: number, patch: Partial<AbcResurs>) => setResurslar((o) => o.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const saqla = async () => {
    if (xatolar.length || band) { setKoldaXato(true); return; }
    setBand(true); setXato('');
    try {
      const bolim = bolimlar.find((b) => String(b.id) === bolimId);
      const res = await ishAbcSaqla({
        kompaniyaId, obyektId, command: rejim.tur, sana, sabab: sabab.trim(), operationId: operationId.current,
        otaQatorId: rejim.tur === 'additional' ? bolim?.id ?? null : rejim.tur === 'replacement' ? rejim.eski.otaId : null,
        kutilganVersiya: rejim.tur === 'additional' ? bolim?.versiya ?? null : rejim.tur === 'replacement' ? rejim.eski.otaVersiya : null,
        almashtirilayotganQatorId: rejim.tur === 'additional' ? null : rejim.eski.id,
        ish: resursRejim ? null : { kod: ish.kod.trim() || null, nom: ish.nom.trim(), birlik: ish.birlik.trim(), hajm: son(ish.hajm)! },
        resurslar: resurslar.map((r) => ({ kat: r.kat, kod: r.kod.trim() || null, nom: r.nom.trim(), birlik: r.birlik.trim(), norma: son(r.norma)!, narx: son(r.narx), narx_manba: r.manba })),
        faktHajm: resursRejim ? null : son(fakt),
      });
      if (!res.ok) { setXato(abcXato(res)); return; }
      onSaqlandi(rejim.tur === 'resurs_zamena' ? `Resurs almashtirildi: «${resurslar[0].nom}».`
        : `${rejim.tur === 'replacement' ? 'Zamena' : 'Qo‘shimcha ish'} saqlandi: ${resurslar.length} resurs, summa ${fmt(hisob.jami)} so‘m${son(fakt) ? `, fakt ${fakt}` : ''}.`);
    } catch { setXato('Javob olinmadi. Qayta bosing — takroriy saqlash xavfsiz.'); }
    finally { setBand(false); }
  };

  const inp = 'w-full rounded-md border border-border bg-bg px-2 py-1 text-[12px] text-text outline-none focus:border-accent';
  const num = `${inp} text-right font-mono`;
  const sarlavha = rejim.tur === 'additional' ? 'Qo‘shimcha ish (smetadan tashqari)' : rejim.tur === 'replacement' ? 'Ish zamenasi' : 'Resurs zamenasi';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={sarlavha}>
      <div className="karta mt-4 w-full max-w-[1180px] space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">{rejim.tur === 'additional' ? <Plus size={16} className="text-accent" /> : <Repeat2 size={16} className="text-warn" />}{sarlavha}</h2>
            <p className="mt-1 flex items-center gap-1 text-[12px] text-text-dim"><BookOpen size={12} /> Nom yozishni boshlang (3+ harf) — yuklangan smetalardagi ish turlari va resurslar taklif qilinadi.</p>
            {rejim.tur !== 'additional' && <p className="mt-1 text-[12px] text-text-dim">Almashtiriladi: <b className="text-text">{rejim.eski.nom}</b>{rejim.eski.birlik ? `, ${rejim.eski.birlik}` : ''} — eski qator o‘zgarmaydi, yangisi unga ishora qiladi.</p>}
          </div>
          <button onClick={onYop} className="rounded p-1 text-text-dim hover:bg-surface-2" aria-label="Yopish"><X size={18} /></button>
        </div>

        {rejim.tur === 'additional' && <label className="block max-w-xl text-[12px] font-medium">Bo‘lim
          <select value={bolimId} onChange={(e) => setBolimId(e.target.value)} className={`${inp} mt-1`} aria-label="Bo‘lim">
            <option value="">«СМЕТАДАН ТАШҚАРИ ИШЛАР» (avtomatik bo‘lim)</option>
            {bolimlar.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select></label>}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[1080px] text-[12px]">
            <thead className="bg-surface-2 text-[11px] text-text-dim"><tr>
              <th className="w-16 p-2 text-left">Kat.</th><th className="w-36 p-2 text-left">Shifr / kod</th><th className="p-2 text-left">Ish turi / resurs nomi</th>
              <th className="w-20 p-2 text-left">Birlik</th><th className="w-24 p-2 text-right">Norma</th><th className="w-28 p-2 text-right">Hajm</th>
              <th className="w-44 p-2 text-right">Birlik narxi</th><th className="w-32 p-2 text-right">Summa</th><th className="w-8" />
            </tr></thead>
            <tbody>
              {!resursRejim && <tr className="border-t border-border bg-accent/[.04] font-medium">
                <td className="p-2 text-[11px] text-text-mute">ISH</td>
                <td className="p-1.5"><input value={ish.kod} onChange={(e) => setIsh((o) => ({ ...o, kod: e.target.value }))} className={inp} placeholder="Е0802-002-03" aria-label="Ish shifri" /></td>
                <td className="p-1.5"><Taklifli qiymat={ish.nom} onChange={(v) => setIsh((o) => ({ ...o, nom: v }))} qidir={ishTuriQ} tanla={ishTuriTanla} ariaLabel="Ish turi nomi" placeholder="masalan: кладка перегородок" className={inp}
                  render={(v: IshTuriVariant) => <div><div className="flex justify-between gap-3"><span className="font-medium text-text">{v.nom}</span><span className="shrink-0 text-text-mute">{v.birlik}</span></div>
                    <div className="mt-0.5 flex gap-3 text-[10px] text-text-mute"><span className="font-mono">{v.kod}</span><span>{v.sostav.length} resurs</span>{v.manba === 'katalog' ? <span className="text-warn">ish turlari katalogi</span> : <span>{v.shu_obyekt ? 'shu obyekt smetasida' : `${v.soni} ta smetada`}</span>}</div></div>} /></td>
                <td className="p-1.5"><input value={ish.birlik} onChange={(e) => setIsh((o) => ({ ...o, birlik: e.target.value }))} className={inp} aria-label="Ish birligi" /></td>
                <td className="p-2 text-right text-text-mute">—</td>
                <td className="p-1.5"><input value={ish.hajm} onChange={(e) => setIsh((o) => ({ ...o, hajm: e.target.value }))} inputMode="decimal" className={num} aria-label="Ish hajmi" /></td>
                <td className="p-2 text-right tabular-nums">{fmt(hisob.ishNarxi)}</td>
                <td className="p-2 text-right font-semibold tabular-nums">{fmt(hisob.jami)}</td><td />
              </tr>}
              {resurslar.map((r, i) => <tr key={i} className={`border-t border-border/60 ${koldaXato && xatolar.some((x) => x.joy === `r${i}`) ? 'bg-danger/5' : ''}`}>
                <td className="p-1.5"><select value={r.kat} onChange={(e) => yangila(i, { kat: e.target.value as Kat })} className={inp} aria-label={`${i + 1}-resurs kategoriyasi`} title={KAT_NOMI[r.kat]}>{KATLAR.map((k) => <option key={k} value={k}>{k}</option>)}</select></td>
                <td className="p-1.5"><input value={r.kod} onChange={(e) => yangila(i, { kod: e.target.value })} className={inp} aria-label={`${i + 1}-resurs kodi`} /></td>
                <td className="p-1.5 pl-4"><Taklifli qiymat={r.nom} onChange={(v) => yangila(i, { nom: v })} qidir={resursQ(r.kat)} tanla={(v: ResursVariant) => resursTanla(i, v)} ariaLabel={`${i + 1}-resurs nomi`} placeholder="resurs nomi" className={inp}
                  render={(v: ResursVariant) => <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-text">{v.nom}</div><div className="text-[10px] text-text-mute">{v.kat ?? '—'} · {v.birlik} {v.kod ? `· ${v.kod}` : ''} {v.manba === 'katalog' ? `· ${v.manba_nom ?? 'katalog'}` : `· ${v.soni} ta smetada`}</div></div>
                    <div className="shrink-0 text-right"><div className="font-mono text-text">{fmt(v.narx)}</div><span className={`rounded px-1 text-[10px] ${MANBA_RANG[v.narx_manba]}`}>{MANBA_NOMI[v.narx_manba]}</span></div></div>} /></td>
                <td className="p-1.5"><input value={r.birlik} onChange={(e) => yangila(i, { birlik: e.target.value })} className={inp} aria-label={`${i + 1}-resurs birligi`} /></td>
                <td className="p-1.5"><input value={r.norma} onChange={(e) => yangila(i, { norma: e.target.value })} inputMode="decimal" className={num} aria-label={`${i + 1}-resurs normasi`} /></td>
                <td className="p-2 text-right tabular-nums text-text-dim">{fmt(hisob.qatorlar[i]?.hajm, 6)}</td>
                <td className="p-1.5"><div className="flex items-center gap-1">
                  <span className={`shrink-0 rounded px-1 text-[10px] ${MANBA_RANG[r.manba]}`} title="Narx manbasi">{MANBA_NOMI[r.manba]}</span>
                  <input value={r.narx} onChange={(e) => yangila(i, { narx: e.target.value, manba: 'qolda' })} inputMode="decimal" className={num} aria-label={`${i + 1}-resurs narxi`} />
                  {!!r.variantlar?.length && <select value="" onChange={(e) => { const v = r.variantlar![Number(e.target.value)]; if (v) yangila(i, { narx: String(v.narx), manba: v.manba }); }} className="w-6 shrink-0 rounded border border-border bg-bg text-[10px]" aria-label={`${i + 1}-resurs narx variantlari`} title="Narx variantlari">
                    <option value="">▾</option>{r.variantlar.map((v, k) => <option key={k} value={k}>{fmt(v.narx)} — {v.izoh}</option>)}</select>}
                </div></td>
                <td className="p-2 text-right tabular-nums">{hisob.qatorlar[i]?.summa == null ? <span className="text-warn" title="Narx yo‘q — summa hisoblanmaydi">narxsiz</span> : fmt(hisob.qatorlar[i].summa)}</td>
                <td className="p-1">{!resursRejim && <button type="button" onClick={() => setResurslar((o) => o.filter((_, j) => j !== i))} className="text-text-mute hover:text-danger" aria-label={`${i + 1}-resursni olib tashlash`}><Trash2 size={13} /></button>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>

        {!resursRejim && <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setResurslar((o) => [...o, { kat: 'МАТ', kod: '', nom: '', birlik: '', norma: '', narx: '', manba: 'qolda' }])} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-surface-2"><Plus size={13} /> Resurs qo‘shish</button>
          <div className="flex flex-wrap gap-3 text-[11px] text-text-dim">{KATLAR.map((k) => <span key={k}>{KAT_NOMI[k]}: <b className="tabular-nums text-text">{fmt(hisob.jamiKat[k])}</b></span>)}<span>Jami: <b className="tabular-nums text-text">{fmt(hisob.jami)}</b></span>{hisob.narxsiz > 0 && <span className="text-warn">{hisob.narxsiz} ta resurs narxsiz</span>}</div>
        </div>}

        <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          {!resursRejim && <label className="text-[12px] font-medium">Bajarilgan hajm (fakt)<input value={fakt} onChange={(e) => setFakt(e.target.value)} inputMode="decimal" placeholder="ixtiyoriy" className={`${num} mt-1`} aria-label="Bajarilgan hajm" /></label>}
          <label className={`text-[12px] font-medium ${resursRejim ? 'sm:col-span-2' : ''}`}>Sabab (majburiy)<input value={sabab} onChange={(e) => setSabab(e.target.value)} placeholder="masalan: loyihachi xati № …, buyurtmachi topshirig‘i" className={`${inp} mt-1`} aria-label="Sabab" /></label>
        </div>

        {koldaXato && xatolar.length > 0 && <ul role="alert" className="list-disc rounded border border-warn/40 bg-warn/5 py-2 pl-6 pr-3 text-[12px] text-warn">{xatolar.map((x, i) => <li key={i}>{x.matn}</li>)}</ul>}
        {xato && <p role="alert" className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">{xato}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onYop} className="rounded-lg border border-border px-3 py-2 text-[12px]">Bekor qilish</button>
          <button onClick={() => void saqla()} disabled={band} className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">{band ? 'Saqlanmoqda…' : 'Saqlash'}</button>
        </div>
      </div>
    </div>
  );
}
