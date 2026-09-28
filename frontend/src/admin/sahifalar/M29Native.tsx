import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Eye, RefreshCw, AlertTriangle } from 'lucide-react';
import { sbOqi, sbT2DaraxtOl, sbT2KompaniyalarOl, sbT2ObyektlarOlKomp, type T2Kompaniya, type T2Obyekt } from '../../api/supabase';
import { sbT2F2TafsilotOl } from '../../api/t2-narx';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { m29Hisobla, type M29Kirish, type M29Material, type M29Natija, type M29SmetaQator, type M29SkladQator } from '../../lib/m29';
import { m29DavrMatni, m29Hujjat } from '../../lib/m29/export';

/**
 * М-29 — материалы: расход по норме ↔ фактически (egasi 2026-09-28).
 * Oylik va boshidan beri; ierarxiya: guruh → material → ishlar, har qavatda
 * o'z jamisi. "Faqat muammolilar" — перерасход, asossiz chiqim, sklad
 * kiritilmagan, smetada yo'q material. Pul ta'siri (tejash / ortiqcha) tepada.
 */
const fmt = (x: number | null | undefined, d = 3) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: d }));
const pul = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Diqqat turlari — muhimlari (pulga bevosita ta'sir, "qayerga ishlatildi?") birinchi. */
const DIQQAT_TURLARI = [
  { tur: 'SMETADA_YOQ', nom: 'Smetada yo‘q material skladdan chiqarilgan — qayerga ishlatildi?', muhim: true },
  { tur: 'ASOSSIZ_CHIQIM', nom: 'Tasdiqlangan F2 da ishi yo‘q, lekin skladdan chiqarilgan — qayerga ishlatildi?', muhim: true },
  { tur: 'PERERASXOD', nom: 'Normadan ortiq sarf', muhim: true },
  { tur: 'SKLAD_KIRITILMAGAN', nom: 'Norma bo‘yicha sarflangan, sklad chiqimi kiritilmagan (haqiqiy sarf noma’lum)', muhim: false },
  { tur: 'NORMA_YOQ', nom: 'Smetada norma yo‘q', muhim: false },
  { tur: 'NARX_FARQLI', nom: 'Smetada narxlar farqli', muhim: false },
] as const;

function muammoli(m: M29Material): boolean {
  return (m.faktJami == null && m.normaJami > 0) || (m.farqJami != null && m.farqJami > 1e-9);
}

function Sessiya({ companyId }: { companyId: number }) {
  const workspace = usePTOWorkspace();
  const korinish = useHujjatKorinish();
  const [tomonlar, setTomonlar] = useHujjatTomonlari(companyId);
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState('');
  const [kirish, setKirish] = useState<M29Kirish | null>(null);
  const [davr, setDavr] = useState('');
  const [busy, setBusy] = useState(false);
  const [xato, setXato] = useState('');
  const [ogoh, setOgoh] = useState('');
  const [ochiq, setOchiq] = useState<Set<string>>(new Set());
  const [faqatMuammo, setFaqatMuammo] = useState(false);
  const [oyna, setOyna] = useState<'jadval' | 'diqqat' | 'yoq'>('jadval');
  const [pudratchi, setPudratchi] = useState<string | null>(null);

  useEffect(() => {
    let a = true;
    void sbT2ObyektlarOlKomp(companyId).then((r) => { if (a && r.ok) setObjects((r.qatorlar || []) as T2Obyekt[]); });
    void sbT2KompaniyalarOl().then((r) => {
      if (!a || !r.ok) return;
      const k = ((r.qatorlar || []) as T2Kompaniya[]).find((x) => x.id === companyId);
      setPudratchi(k?.toliq_nom || k?.nom || null);
    });
    return () => { a = false; };
  }, [companyId]);
  useEffect(() => {
    if (workspace.scope.objectId != null && objects.some((o) => o.id === workspace.scope.objectId)) setObjectId(String(workspace.scope.objectId));
  }, [objects, workspace.scope.objectId]);

  async function yukla(oid: number) {
    setBusy(true); setXato(''); setOgoh(''); setKirish(null);
    try {
      const [d, f, s] = await Promise.all([
        sbT2DaraxtOl(oid),
        sbT2F2TafsilotOl({ obyektId: oid, tur: 'f2' }),
        sbOqi<M29SkladQator>({ jadval: 't2_sklad_harakat', filtr: `obyekt_id=eq.${oid}&holat=eq.faol`, ustunlar: 'operatsiya,sana,nomi,birligi,obyomi', limit: 100000 }),
      ]);
      if (!d.ok) throw new Error('Smeta o‘qilmadi.');
      if (!f.ok || f.toliq === false) throw new Error('F2 qatorlari to‘liq o‘qilmadi — M-29 chala ma’lumot ustida tuzilmaydi.');
      if (!s.ok) setOgoh('Sklad harakatlari o‘qilmadi — «Фактически» ustuni bo‘sh (noma’lum) qoladi.');
      const smeta = (d.qatorlar || []) as unknown as M29SmetaQator[];
      const f2 = (f.qatorlar || []).map((q) => ({ qator_id: q.qator_id, oy: String(q.oy), hajm: q.certified_quantity ?? q.hajm, akt_holat: q.akt_holat }));
      const sklad = s.ok ? (s.qatorlar || []) : [];
      setKirish({ smeta, f2, sklad });
      const oylar = [...new Set([
        ...f2.filter((x) => x.akt_holat === 'tasdiqlangan').map((x) => x.oy.slice(0, 7)),
        ...sklad.map((x) => String(x.sana).slice(0, 7)),
      ])].filter((x) => /^\d{4}-\d{2}$/.test(x)).sort();
      setDavr((old) => (old && oylar.includes(old) ? old : oylar[oylar.length - 1] ?? ''));
      if (!oylar.length) setOgoh('Bu obyektda tasdiqlangan F2 ham, sklad harakati ham yo‘q — M-29 bo‘sh bo‘ladi.');
    } catch (e) { setXato(e instanceof Error ? e.message : 'Yuklanmadi.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (objectId) void yukla(Number(objectId)); }, [objectId]);

  const oylar = useMemo(() => {
    if (!kirish) return [];
    return [...new Set([
      ...kirish.f2.filter((x) => x.akt_holat === 'tasdiqlangan').map((x) => x.oy.slice(0, 7)),
      ...kirish.sklad.map((x) => String(x.sana).slice(0, 7)),
    ])].filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().reverse();
  }, [kirish]);
  const natija: M29Natija | null = useMemo(() => (kirish && davr ? m29Hisobla(kirish, davr) : null), [kirish, davr]);
  useEffect(() => { if (natija) setOchiq(new Set(natija.guruhlar.map((g) => 'g:' + g.kat))); }, [natija]);
  const obyektNom = objects.find((o) => String(o.id) === objectId)?.nom ?? '';

  function eksport(korish: boolean) {
    if (!natija) return;
    try {
      const h = m29Hujjat(natija, { obyektNom, pudratchi, imzo: tomonlar });
      if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
    } catch (e) { setXato(e instanceof Error ? `M-29 tuzilmadi: ${e.message}` : 'M-29 tuzilmadi.'); }
  }
  const almashtir = (k: string) => setOchiq((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const hammasiniOch = (on: boolean) => {
    if (!natija) return;
    if (!on) { setOchiq(new Set()); return; }
    const s = new Set<string>();
    for (const g of natija.guruhlar) { s.add('g:' + g.kat); for (const m of g.materiallar) s.add('m:' + m.kalit); }
    setOchiq(s);
  };

  const materialSoni = natija ? natija.guruhlar.reduce((s, g) => s + g.materiallar.length, 0) : 0;
  const muhimDiqqat = natija ? natija.diqqat.filter((d) => d.tur === 'SMETADA_YOQ' || d.tur === 'ASOSSIZ_CHIQIM' || d.tur === 'PERERASXOD').length : 0;
  const Son = ({ x, d = 3, cls = '' }: { x: number | null | undefined; d?: number; cls?: string }) =>
    x == null ? <span className="text-text-mute">—</span> : <span className={cls}>{fmt(x, d)}</span>;
  const farqCls = (x: number | null | undefined) => (x == null ? '' : x > 1e-9 ? 'text-danger' : x < -1e-9 ? 'text-ok' : '');
  const kodKor = (k: string | null) => (k && k.trim().length > 2 ? k : null);
  /** Uzun material nomi: farqlovchi qism (diametr, sinf, o'lcham) oxirida — bosh + … + oxir. */
  const qisqaNom = (n: string) => (n.length <= 70 ? n : n.slice(0, 28).trimEnd() + ' … ' + n.slice(-40).trimStart());
  const faktBor = !!natija && natija.guruhlar.some((g) => g.materiallar.some((m) => m.faktJami != null));

  return (
    <section className="w-full space-y-4 p-3 sm:p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">М-29 · Материалы: норма ↔ факт</h1>
          <p className="mt-0.5 text-[12px] text-text-dim">Norma — tasdiqlangan F2 bo‘yicha (ish hajmi × norma) · haqiqiy — obyekt skladidan chiqim</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="tugma h-9 px-3" disabled={!natija || busy} onClick={() => eksport(true)} title="Hujjatni saytda ko‘rish"><Eye size={15} /> Ko‘rish</button>
          <button type="button" className="tugma tugma-asosiy h-9 px-3" disabled={!natija || busy} onClick={() => eksport(false)}><Download size={15} /> Excel М-29</button>
        </div>
      </header>

      <div className="karta grid gap-3 p-3 sm:grid-cols-[minmax(220px,2fr)_minmax(160px,1fr)_auto]">
        <label className="text-[12px] font-medium text-text-dim">Obyekt
          <select aria-label="Obyekt" value={objectId} onChange={(e) => { setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); }}
            className="input mt-1 block h-9 w-full px-2 text-[13px] text-text">
            <option value="">Tanlang</option>{objects.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-medium text-text-dim">Hisobot oyi
          <select aria-label="Hisobot oyi" value={davr} onChange={(e) => setDavr(e.target.value)} disabled={!oylar.length}
            className="input mt-1 block h-9 w-full px-2 text-[13px] text-text">
            {!oylar.length && <option value="">—</option>}
            {oylar.map((o) => <option key={o} value={o}>{m29DavrMatni(o)}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" className="tugma h-9 px-3" disabled={!objectId || busy} onClick={() => void yukla(Number(objectId))}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Yangilash</button>
        </div>
        <div className="sm:col-span-3"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} /></div>
      </div>

      {!objectId && <p className="karta p-6 text-center text-[13px] text-text-dim">Obyektni tanlang.</p>}
      {busy && <p className="text-[13px] text-text-dim">Yuklanmoqda…</p>}
      {xato && <p role="alert" className="karta border-danger/40 p-3 text-[13px] text-danger">{xato}</p>}
      {ogoh && <p className="karta border-warn/40 p-3 text-[12px] text-warn">{ogoh}</p>}

      {natija && (
        <>
          <section className="grid grid-cols-2 gap-2 xl:grid-cols-4" aria-label="Ko'rsatkichlar">
            {[
              { t: 'Materiallar', v: String(materialSoni), s: `${m29DavrMatni(natija.davr)} · boshidan beri`, c: '' },
              { t: 'Tejash (normadan kam)', v: faktBor ? pul(natija.jami.tejashSumma) : '—', s: faktBor ? 'сум, smeta narxida' : 'sklad chiqimi kiritilmagan', c: 'text-ok' },
              { t: 'Ortiqcha sarf (normadan ko‘p)', v: faktBor ? pul(natija.jami.ortiqchaSumma) : '—', s: faktBor ? 'сум, smeta narxida' : 'sklad chiqimi kiritilmagan', c: 'text-danger' },
              { t: 'Sof natija', v: faktBor ? pul(natija.jami.farqSummaJami) : '—', s: faktBor ? '+ zarar · − foyda' : 'haqiqiy sarf noma’lum', c: !faktBor ? '' : (natija.jami.farqSummaJami ?? 0) > 0 ? 'text-danger' : 'text-ok' },
            ].map((k) => (
              <div key={k.t} className="karta px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-mute">{k.t}</p>
                <p className={`text-lg font-semibold tabular-nums ${k.c}`}>{k.v}</p>
                <p className="text-[11px] text-text-mute">{k.s}</p>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap items-center gap-2 border-b border-border">
            {([['jadval', 'Jadval'], ['diqqat', `Diqqat (${natija.diqqat.length})`], ['yoq', `Smetada yo‘q (${natija.smetadaYoq.length})`]] as const).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setOyna(k)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${oyna === k ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}>
                {t}{k === 'diqqat' && muhimDiqqat ? <span className="ml-1.5 rounded bg-danger/15 px-1.5 text-[11px] text-danger">{muhimDiqqat}</span> : null}
              </button>
            ))}
            {oyna === 'jadval' && (
              <div className="ml-auto flex items-center gap-2 pb-1 text-[12px]">
                <button type="button" className="tugma h-7 px-2" onClick={() => hammasiniOch(true)}>Hammasini ochish</button>
                <button type="button" className="tugma h-7 px-2" onClick={() => hammasiniOch(false)}>Yopish</button>
                <label className="inline-flex items-center gap-1.5 text-text-dim"><input type="checkbox" checked={faqatMuammo} onChange={(e) => setFaqatMuammo(e.target.checked)} /> faqat muammolilar</label>
              </div>
            )}
          </div>

          {oyna === 'jadval' && (
            <div className="karta max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[1040px] table-fixed text-[12.5px]">
                <colgroup>
                  <col /><col className="w-16" /><col className="w-24" /><col className="w-24" /><col className="w-28" /><col className="w-28" /><col className="w-24" /><col className="w-32" /><col className="w-24" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-surface text-[11px] text-text-dim">
                  <tr className="border-b border-border">
                    <th rowSpan={2} className="px-3 py-2 text-left font-medium">Material / ish</th>
                    <th rowSpan={2} className="px-2 text-left font-medium">Ед.</th>
                    <th colSpan={2} className="border-l border-border px-2 pt-2 text-center font-medium">{m29DavrMatni(natija.davr)}</th>
                    <th colSpan={4} className="border-l border-border px-2 pt-2 text-center font-medium">Boshidan beri</th>
                    <th rowSpan={2} className="border-l border-border px-2 text-right font-medium">Skladda qoldiq</th>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="border-l border-border px-2 py-1 text-right font-normal">Norma</th>
                    <th className="px-2 text-right font-normal">Haqiqiy</th>
                    <th className="border-l border-border px-2 text-right font-normal">Norma</th>
                    <th className="px-2 text-right font-normal">Haqiqiy</th>
                    <th className="px-2 text-right font-normal">Farq</th>
                    <th className="px-2 text-right font-normal">Farq, сум</th>
                  </tr>
                </thead>
                <tbody>
                  {natija.guruhlar.map((g) => {
                    const ms = g.materiallar.filter((m) => !faqatMuammo || muammoli(m));
                    if (!ms.length) return null;
                    const gOchiq = ochiq.has('g:' + g.kat);
                    return [
                      <tr key={'g' + g.kat} className="cursor-pointer border-b border-border bg-surface-2/70 font-semibold hover:bg-surface-2" onClick={() => almashtir('g:' + g.kat)}>
                        <td className="px-3 py-2" colSpan={2}>{gOchiq ? <ChevronDown size={14} className="mr-1 inline" /> : <ChevronRight size={14} className="mr-1 inline" />}{g.nom} <span className="ml-1 font-normal text-text-mute">{ms.length} ta</span></td>
                        <td colSpan={2} className="border-l border-border" />
                        <td colSpan={2} className="border-l border-border px-2 text-right text-[11px] font-normal text-text-dim">{g.normaSummaJami != null ? `norma: ${pul(g.normaSummaJami)} сум` : ''}</td>
                        <td />
                        <td className={`px-2 text-right tabular-nums ${farqCls(g.farqSummaJami)}`}>{g.farqSummaJami == null ? <span className="text-text-mute">—</span> : pul(g.farqSummaJami)}</td>
                        <td className="border-l border-border" />
                      </tr>,
                      ...(gOchiq ? ms.flatMap((m) => {
                        const mOchiq = ochiq.has('m:' + m.kalit);
                        return [
                          <tr key={'m' + m.kalit} className={`border-b border-border/40 hover:bg-surface-2/40 ${m.ishlar.length ? 'cursor-pointer' : ''}`} onClick={() => m.ishlar.length && almashtir('m:' + m.kalit)}>
                            <td className="py-1.5 pl-7 pr-2" title={m.nom}>
                              <div className="flex items-start gap-1">
                                {m.ishlar.length ? (mOchiq ? <ChevronDown size={13} className="mt-0.5 shrink-0 text-text-mute" /> : <ChevronRight size={13} className="mt-0.5 shrink-0 text-text-mute" />) : <span className="w-[13px] shrink-0" />}
                                <span>{kodKor(m.kod) && <span className="mr-1 font-mono text-[11px] text-text-mute">{m.kod}</span>}{qisqaNom(m.nom)}</span>
                              </div>
                            </td>
                            <td className="px-2 text-text-dim">{m.birlik}</td>
                            <td className="border-l border-border/40 px-2 text-right tabular-nums"><Son x={m.normaOy} /></td>
                            <td className="px-2 text-right tabular-nums"><Son x={m.faktOy} /></td>
                            <td className="border-l border-border/40 px-2 text-right tabular-nums"><Son x={m.normaJami} /></td>
                            <td className="px-2 text-right tabular-nums"><Son x={m.faktJami} /></td>
                            <td className="px-2 text-right tabular-nums"><Son x={m.farqJami} cls={farqCls(m.farqJami)} /></td>
                            <td className="px-2 text-right tabular-nums">{m.farqSummaJami == null ? <span className="text-text-mute">—</span> : <span className={farqCls(m.farqSummaJami)}>{pul(m.farqSummaJami)}</span>}</td>
                            <td className="border-l border-border/40 px-2 text-right tabular-nums"><Son x={m.skladQoldiq} /></td>
                          </tr>,
                          ...(mOchiq ? m.ishlar.map((ish) => (
                            <tr key={'i' + m.kalit + ish.blId} className="border-b border-border/20 text-[11.5px] text-text-dim">
                              <td className="py-1 pl-14 pr-2" title={ish.nom}><span className="line-clamp-1">{kodKor(ish.kod) && <span className="mr-1 font-mono">{ish.kod}</span>}{ish.nom}</span></td>
                              <td className="px-2">{ish.birlik}</td>
                              <td className="border-l border-border/30 px-2 text-right tabular-nums"><Son x={ish.normaOy} /></td>
                              <td />
                              <td className="border-l border-border/30 px-2 text-right tabular-nums"><Son x={ish.normaJami} /></td>
                              <td colSpan={3} className="px-2 text-[11px] text-text-mute">
                                {ish.toGridan ? 'miqdor F2 aktidan' : ish.norma != null ? `${fmt(ish.norma, 6)} × ${fmt(ish.hajmJami)} ${ish.birlik ?? ''}` : 'norma noma’lum'}
                              </td>
                              <td className="border-l border-border/30" />
                            </tr>
                          )) : []),
                        ];
                      }) : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}

          {oyna === 'diqqat' && (
            <section className="space-y-2" aria-label="Diqqat">
              {!natija.diqqat.length && <p className="karta p-4 text-[13px] text-ok">Diqqat talab qiladigan holat yo‘q.</p>}
              {DIQQAT_TURLARI.map((t) => {
                const list = natija.diqqat.filter((d) => d.tur === t.tur);
                if (!list.length) return null;
                const summa = list.reduce((s, d) => s + (d.summa ?? 0), 0);
                return (
                  <details key={t.tur} className="karta p-3 text-[12.5px]" open={t.muhim}>
                    <summary className="flex cursor-pointer items-center gap-2">
                      <AlertTriangle size={14} className={t.muhim ? 'text-danger' : 'text-text-mute'} />
                      <span className={t.muhim ? 'font-semibold text-text' : 'text-text-dim'}>{t.nom}</span>
                      <span className="rounded bg-surface-2 px-1.5 text-[11px]">{list.length}</span>
                      {summa ? <span className="ml-auto tabular-nums text-danger">{pul(summa)} сум</span> : null}
                    </summary>
                    <ul className="mt-2 max-h-80 divide-y divide-border/40 overflow-auto">
                      {list.map((d, i) => (
                        <li key={i} className="flex gap-3 py-1.5">
                          <span className="min-w-0 flex-1"><b className="font-medium">{d.nom}</b><span className="block text-[11.5px] text-text-dim">{d.sabab}</span></span>
                          {d.summa != null && <span className="shrink-0 tabular-nums text-danger">{pul(d.summa)}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </section>
          )}

          {oyna === 'yoq' && (
            <section className="karta overflow-auto">
              {!natija.smetadaYoq.length ? <p className="p-4 text-[13px] text-ok">Skladdan chiqarilgan barcha materiallar smetada bor.</p> : (
                <table className="w-full text-[12.5px]">
                  <thead className="bg-surface text-[11px] text-text-dim"><tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium">Material (skladdan) — qayerga ishlatildi?</th><th className="px-2 text-left font-medium">Ед.</th>
                    <th className="px-2 text-right font-medium">Kirim</th><th className="px-2 text-right font-medium">Chiqim (oy)</th><th className="px-2 text-right font-medium">Chiqim (boshidan)</th>
                  </tr></thead>
                  <tbody>{natija.smetadaYoq.map((s, i) => (
                    <tr key={i} className="border-b border-border/40"><td className="px-3 py-1.5">{s.nomi}</td><td className="px-2 text-text-dim">{s.birligi ?? '—'}</td>
                      <td className="px-2 text-right tabular-nums">{fmt(s.kirimJami)}</td><td className="px-2 text-right tabular-nums">{fmt(s.chiqimOy)}</td><td className="px-2 text-right tabular-nums text-danger">{fmt(s.chiqimJami)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </section>
          )}
        </>
      )}
      {korinish.oyna}
    </section>
  );
}


export default function M29Native() {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={joriy.id} companyId={joriy.id} />;
}
