import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { sbQatorHolatOl, type QatorHolat } from '../../api/t2-fakt';
import { f2QoralamaHujjat } from '../../lib/f2-native-export';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { NDS_SUKUT_FOIZ } from '../../lib/nakopitelniy-vedomost-export';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { obyektPodvali } from '../../api/t2-nakrutka-podval';
import { sbAosrCoverageOl, type AosrCoverage } from '../../api/t2-aosr';
import {
  NARX_MANBA_NOMI, bosKiritma, f2Jami, f2Qatorlar, f2Qur, f2Yuk, narxsizNomzodlar, ulushHajm,
  type F2Bolim, type F2Ish, type F2Kiritma, type F2Qator, type F2Resurs,
} from '../../lib/f2-tayyor';

const oyBoshlanishi = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
const XATO_MATN: Record<NonNullable<F2Qator['xato']>, string> = { HAJM: 'Hajm 0 dan katta son bo‘lsin', OSHDI: 'Fakt qoldig‘idan oshdi', NARX: 'Narx kerak (yoki «narxsiz» belgilang)', SUMMA: 'Summa son emas' };
const OGOH_MATN: Record<NonNullable<F2Qator['ogoh']>, string> = { RESURS_CHEGARA: 'resurs fakt qoldig‘i bilan cheklandi', ARIFMETIKA: 'summa hajm × narxdan farq qiladi — hujjat summasi saqlanadi', SMETADAN_OSHDI: 'smeta hajmidan oshadi (ruxsat, ogohlantirish)' };
const KAT_RANG: Record<string, string> = { ЧЕЛ: 'bg-sky-500/10 text-sky-500', МАШ: 'bg-amber-500/10 text-amber-500', МАТ: 'bg-emerald-500/10 text-emerald-500' };
const kirit = 'rounded border border-border bg-bg px-2 py-1 text-right tabular-nums outline-none focus:border-accent';

/**
 * F2 tayyorlash (egasi, 2026-10-01: "fakt kiritishdan ideal F2 gacha").
 * Operator ISH hajmini tanlaydi → resurslari (hajm × norma) avtomatik ergashadi; narx — oldingi F2 → smeta (manba ko'rinadi),
 * summa avtomatik; hujjat raqami bir marta. Server qoidasi o'zgarmaydi: har resursda narx yoki ongli "narxsiz".
 */
export function F2TayyorlashNative() {
  const { joriy } = useKompaniya();
  const [tomonlar, setTomonlar] = useHujjatTomonlari(joriy?.id);
  const [ndsFoiz, setNdsFoiz] = useState(String(NDS_SUKUT_FOIZ));
  const workspace = usePTOWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [rows, setRows] = useState<T2Qator[]>([]);
  const [holat, setHolat] = useState<QatorHolat[]>([]);
  const [k, setK] = useState<F2Kiritma>(bosKiritma);
  const [oy, setOy] = useState(oyBoshlanishi());
  const [raqam, setRaqam] = useState('');
  const [qidir, setQidir] = useState('');
  const [bolimId, setBolimId] = useState<number | null | undefined>(undefined);
  const [ochiq, setOchiq] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [aosrsiz, setAosrsiz] = useState<AosrCoverage[]>([]);
  const operationId = useRef(yangiOperationId());
  const obyektId = Number(params.get('obyekt'));
  const validId = Number.isSafeInteger(obyektId) && obyektId > 0;

  useEffect(() => {
    if (!joriy?.id) return;
    void sbT2ObyektlarOlKomp(joriy.id).then((result) => setObyektlar((result.ok ? result.qatorlar : []) as T2Obyekt[]));
  }, [joriy?.id]);

  useEffect(() => {
    if (workspace.scope.objectId == null || !obyektlar.some((object) => object.id === workspace.scope.objectId)) return;
    if (workspace.scope.objectId !== obyektId) {
      setParams((old) => { const next = new URLSearchParams(old); next.set('obyekt', String(workspace.scope.objectId)); next.delete('obyekt_nomi'); return next; });
    }
  }, [obyektId, obyektlar, setParams, workspace.scope.objectId]);

  const yuklash = useCallback(async () => {
    if (!validId) { setRows([]); setHolat([]); return; }
    setLoading(true); setError('');
    try {
      void sbAosrCoverageOl(obyektId).then((c) => setAosrsiz(c.ok ? (c.qatorlar || []).filter((x) => x.yashirin && !x.akt_bor) : [])).catch(() => setAosrsiz([]));
      const [d, h] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbQatorHolatOl(obyektId)]);
      if (!d.ok || !h.ok) { setRows([]); setHolat([]); setError('F2 uchun smeta va fakt qoldig‘i o‘qilmadi.'); return; }
      setRows((d.qatorlar || []) as T2Qator[]); setHolat((h.qatorlar || []) as QatorHolat[]);
      setK(bosKiritma()); setBolimId(undefined);
      operationId.current = yangiOperationId();
    } catch { setRows([]); setHolat([]); setError('F2 uchun ma’lumotlar o‘qilmadi. Qayta urinib ko‘ring.'); }
    finally { setLoading(false); }
  }, [obyektId, validId]);
  useEffect(() => { void yuklash(); }, [yuklash]);

  const bolimlar = useMemo(() => f2Qur(rows, holat), [rows, holat]);
  const qatorlar = useMemo(() => f2Qatorlar(bolimlar, k), [bolimlar, k]);
  const jami = useMemo(() => f2Jami(qatorlar), [qatorlar]);
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

  const korinadi = useMemo((): F2Bolim[] => {
    const s = qidir.trim().toLocaleLowerCase('ru');
    if (!s) return bolimlar.filter((b) => b.id === tanlanganBolim);
    const mos = (nom: string, kod: string | null) => nom.toLocaleLowerCase('ru').includes(s) || (kod ?? '').toLocaleLowerCase('ru').includes(s);
    return bolimlar.map((b) => ({ ...b, ishlar: b.ishlar.filter((i) => mos(i.nom, i.kod) || i.resurslar.some((r) => mos(r.nom, r.kod))), alohida: b.alohida.filter((r) => mos(r.nom, r.kod)) }))
      .filter((b) => b.ishlar.length || b.alohida.length);
  }, [bolimlar, qidir, tanlanganBolim]);

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
  const narxsizBelgila = () => setK((o) => ({ ...o, narxsiz: { ...o.narxsiz, ...Object.fromEntries(narxsizlar.map((id) => [id, true])) } }));

  const saqlash = async () => {
    if (!validId || !tayyor || saving) return;
    setSaving(true);
    try {
      const result = await sbT2AktYaratV2({ obyektId, oy, operationId: operationId.current, qatorlar: f2Yuk(qatorlar, raqam), raqam: raqam.trim() || undefined });
      if (!result.ok) { toast(result.error || result.xabar || 'F2 qoralama yaratilmadi.', 'danger'); return; }
      toast('F2 qoralama yaratildi. Tasdiqlash — F2 tarixida.', 'ok');
      await yuklash();
    } catch { toast('Javob olinmadi. Shu amal IDsi bilan qayta urinishingiz mumkin.', 'danger'); }
    finally { setSaving(false); }
  };

  const korinish = useHujjatKorinish();
  const excelYuklash = async (korish = false) => {
    if (!validId || !tayyor) return;
    const object = obyektlar.find((item) => item.id === obyektId);
    if (!object) { toast('Obyekt topilmadi.', 'danger'); return; }
    try {
      const stavka = ndsFoiz.trim() === '' ? null : Number(ndsFoiz.replace(',', '.'));
      const nk = await t2ObyektNakrutka(obyektId).catch(() => null);
      const podval = await obyektPodvali(joriy?.id, obyektId, nk?.ok ? nk.shartnoma_id : null);
      const h = f2QoralamaHujjat(holat, f2Yuk(qatorlar, raqam), {
        obyektNom: object.nom, davr: oy, imzo: tomonlar, ndsFoiz: stavka != null && Number.isFinite(stavka) ? stavka : null,
        nakrutka: nk?.ok ? nk.koeffitsientlar ?? null : null, podval,
      });
      if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
    } catch { toast('Forma-2 Excel qoralamasini yaratib bo‘lmadi.', 'danger'); }
  };

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
            : <input aria-label={`F2 hajmi: ${r.nom}`} inputMode="decimal" value={k.hajm[r.id] ?? ''} onChange={(e) => yoz('hajm', r.id, e.target.value)} placeholder={String(r.mumkin)} className={`${kirit} w-24`} />}
          <div className="text-[10px] text-text-mute">mumkin <FmtN val={r.mumkin} /></div>
        </td>
        <td className="px-2 py-1 text-right">
          <input aria-label={`F2 narxi: ${r.nom}`} inputMode="decimal" disabled={k.narxsiz[r.id] === true} value={k.narx[r.id] ?? ''} onChange={(e) => yoz('narx', r.id, e.target.value)} placeholder={taklif || 'narx'} className={`${kirit} w-28 disabled:opacity-40`} />
          {x && <div className={`text-[10px] ${x.manba === 'qolda' ? 'text-text-dim' : x.manba === 'yoq' ? 'text-warn' : 'text-accent'}`}>{NARX_MANBA_NOMI[x.manba]}</div>}
        </td>
        <td className="px-2 py-1 text-right">
          <input aria-label={`F2 summasi: ${r.nom}`} inputMode="decimal" disabled={k.narxsiz[r.id] === true} value={k.summa[r.id] ?? ''} onChange={(e) => yoz('summa', r.id, e.target.value)} placeholder={x?.summa != null ? x.summa.toFixed(2) : ''} className={`${kirit} w-32 disabled:opacity-40`} />
        </td>
        <td className="w-24 px-2 py-1">
          <label className="flex items-center gap-1 whitespace-nowrap text-[10px] text-text-dim"><input type="checkbox" aria-label={`Narxsiz: ${r.nom}`} checked={k.narxsiz[r.id] === true} onChange={(e) => yoz('narxsiz', r.id, e.target.checked || undefined)} />narxsiz</label>
          {x?.xato && <div className="text-[10px] text-danger">{XATO_MATN[x.xato]}</div>}
          {x?.ogoh && <div className="text-[10px] text-warn">{OGOH_MATN[x.ogoh]}</div>}
        </td>
      </tr>
    );
  }

  function ishKartasi(i: F2Ish) {
    const x = byId.get(i.id);
    const ochilgan = ochiq.has(i.id) || !!qidir.trim();
    const resSumma = i.resurslar.reduce((s, r) => s + (byId.get(r.id)?.summa ?? 0), 0);
    return (
      <div key={i.id} className={`rounded-lg border ${x && !x.xato ? 'border-accent/50 bg-accent/5' : 'border-border'}`}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <button type="button" aria-label={`${ochilgan ? 'Yopish' : 'Resurslarni ko‘rish'}: ${i.nom}`} onClick={() => setOchiq((o) => { const n = new Set(o); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} className="rounded p-0.5 text-text-mute hover:text-text">
            {ochilgan ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="shrink-0 font-mono text-[10px] text-text-mute">{i.kod}</span><span className="truncate text-[13px] font-semibold text-text">{i.nom}</span>
              {aosrsizId.has(i.id) && <span className="shrink-0 rounded bg-warn/10 px-1 text-[10px] text-warn">yashirin · АОСР yo‘q</span>}</div>
            <div className="text-[11px] text-text-mute">F2 mumkin <b className="text-text-dim"><FmtN val={i.mumkin} /></b> {i.birlik} · oldin olingan <FmtN val={i.olingan} />{i.smeta != null && <> · smeta <FmtN val={i.smeta} /></>} · {i.resurslar.length} resurs</div>
          </div>
          {i.mumkin > 0 && <>
            <input aria-label={`F2 hajmi: ${i.nom}`} inputMode="decimal" value={k.hajm[i.id] ?? ''} onChange={(e) => yoz('hajm', i.id, e.target.value)} placeholder="hajm" className={`${kirit} w-24`} />
            {[25, 50, 100].map((f) => <button key={f} type="button" onClick={() => yoz('hajm', i.id, ulushHajm(i.mumkin, f))} className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-text-dim hover:border-accent hover:text-text">{f}%</button>)}
          </>}
          <span className="w-28 text-right text-[12px] font-semibold tabular-nums text-text">{resSumma ? <FmtN val={resSumma} /> : ''}</span>
        </div>
        {x?.xato && <div className="px-10 pb-1 text-[11px] text-danger">{XATO_MATN[x.xato]}</div>}
        {x?.ogoh && <div className="px-10 pb-1 text-[11px] text-warn">{OGOH_MATN[x.ogoh]}</div>}
        {ochilgan && i.resurslar.length > 0 && (
          <table className="w-full text-[12px]"><tbody>{i.resurslar.map(resursQatori)}</tbody></table>
        )}
      </div>
    );
  }

  const bolimPaneli = bolimlar.length > 0 && <aside className="karta flex min-h-0 flex-col overflow-hidden" aria-label="Bo‘limlar">
    <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-mute">Bo‘limlar</div>
    <ul className="min-h-0 flex-1 overflow-auto p-1">
      {bolimlar.map((b) => { const bj = bolimJami.get(b.id); const tanl = b.id === tanlanganBolim && !qidir.trim(); return (
        <li key={b.id ?? 'yoq'}><button type="button" onClick={() => { setBolimId(b.id); setQidir(''); }} style={{ paddingLeft: 8 + Math.min(b.daraja, 4) * 10 }}
          className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[12px] ${tanl ? 'bg-accent/10 text-text' : 'text-text-dim hover:bg-surface-2'}`}>
          <span className="min-w-0 flex-1 truncate">{b.nom}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-text-mute">{bj?.ish ? `${bj.ish}/` : ''}{b.ishlar.length + b.alohida.length}</span>
        </button></li>); })}
    </ul>
  </aside>;

  return <Sahifa sarlavha="F2 tayyorlash" tavsif="Ishni tanlang — resurslar, narx va summa avtomatik; har narx manbasi ko‘rinadi">
    {korinish.oyna}
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section className="karta flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-[240px] flex-1 text-[12px] font-medium text-text">Obyekt
          <select aria-label="Obyekt" value={validId ? obyektId : ''} onChange={(event) => { const object = obyektlar.find((item) => item.id === Number(event.target.value)); workspace.setObjectId(object?.id ?? null); setParams({ obyekt: event.target.value, obyekt_nomi: object?.nom || '' }); }} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text">
            <option value="">-- obyektni tanlang --</option>{obyektlar.map((object) => <option key={object.id} value={object.id}>{object.nom}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-medium text-text">Davr<input aria-label="F2 davri" type="month" value={oy.slice(0, 7)} onChange={(event) => setOy(`${event.target.value}-01`)} className="mt-1.5 block rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
        <label className="text-[12px] font-medium text-text">F2 raqami<input aria-label="F2 raqami" value={raqam} onChange={(e) => setRaqam(e.target.value)} placeholder="masalan 7" className="mt-1.5 block w-28 rounded-lg border border-border bg-surface-2 px-3 py-2 text-text" /></label>
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
              <span className="text-[13px] font-semibold text-text">{qidir.trim() ? `Qidiruv: ${korinadi.reduce((s, b) => s + b.ishlar.length + b.alohida.length, 0)} ta` : korinadi[0]?.nom}</span>
              <button type="button" onClick={() => bolimniOl(korinadi)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-accent/40 px-2 py-1 text-[11px] font-semibold text-text hover:bg-accent/10"><Zap size={12} className="text-accent" />{qidir.trim() ? 'Topilganlarni' : 'Bo‘limni'} to‘liq olish</button>
              <button type="button" onClick={() => bolimniOl(bolimlar)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-dim hover:border-accent hover:text-text">Barcha mumkin hajmni olish</button>
              {Object.keys(k.hajm).length > 0 && <button type="button" onClick={() => setK(bosKiritma())} className="rounded-md border border-border px-2 py-1 text-[11px] text-text-dim hover:border-danger hover:text-danger">Tozalash</button>}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {korinadi.map((b) => <div key={b.id ?? 'yoq'} className="space-y-2">
                {qidir.trim() && <div className="text-[11px] font-semibold uppercase tracking-wide text-text-mute">{b.nom}</div>}
                {b.ishlar.map(ishKartasi)}
                {b.alohida.length > 0 && <div className="rounded-lg border border-border"><div className="px-3 py-1.5 text-[11px] font-semibold text-text-dim">Alohida materiallar</div><table className="w-full text-[12px]"><tbody>{b.alohida.map(resursQatori)}</tbody></table></div>}
              </div>)}
            </div>
          </section>
        </div>
        <section className="flex flex-wrap items-start gap-3"><div className="min-w-[280px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} /></div><label className="text-[12px] text-text-dim">QQS (НДС), % — hujjat oxirida<input aria-label="QQS stavkasi" value={ndsFoiz} onChange={(event) => setNdsFoiz(event.target.value)} placeholder="bo‘sh — QQS yo‘q" inputMode="decimal" className="ml-2 w-32 rounded border border-border bg-bg px-2 py-1" /></label></section>
        <section aria-label="F2 jami" className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-surface/95 px-4 py-2.5 shadow-2xl backdrop-blur">
          <span className="text-[12px] text-text-dim">Tanlangan qatorlar: <b className="text-text">{jami.qator}</b> ({jami.ish} ish)</span>
          {Object.entries(jami.kat).map(([kat, s]) => <span key={kat} className="text-[11px] text-text-dim">{kat}: <b className="tabular-nums text-text"><FmtN val={s} /></b></span>)}
          <span className="text-[13px] font-semibold text-accent">Jami: <FmtN val={jami.summa} /></span>
          {jami.manba.smeta + jami.manba.oldingi_f2 > 0 && <span className="text-[11px] text-text-mute">taklif narx: smeta {jami.manba.smeta}, oldingi F2 {jami.manba.oldingi_f2}</span>}
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
