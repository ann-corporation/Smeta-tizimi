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

  return (
    <section className="w-full space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">М-29 — materiallar: norma ↔ haqiqiy sarf</h1>
        <p className="text-[12px] text-text-dim">Norma bo‘yicha — tasdiqlangan F2 (ish hajmi × norma); haqiqiy — sklad chiqimi.</p>
      </div>
      <div className="karta flex flex-wrap items-end gap-3 p-3">
        <label className="text-[12px] font-medium">Obyekt
          <select aria-label="Obyekt" value={objectId} onChange={(e) => { setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); }}
            className="input mt-1 block h-9 min-w-[220px] px-2 text-[13px]">
            <option value="">Tanlang</option>{objects.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-medium">Hisobot oyi
          <select aria-label="Hisobot oyi" value={davr} onChange={(e) => setDavr(e.target.value)} disabled={!oylar.length}
            className="input mt-1 block h-9 px-2 text-[13px]">
            {oylar.map((o) => <option key={o} value={o}>{m29DavrMatni(o)}</option>)}
          </select>
        </label>
        <button type="button" className="tugma h-9" disabled={!objectId || busy} onClick={() => void yukla(Number(objectId))}><RefreshCw size={14} /> Yangilash</button>
        <button type="button" className="tugma tugma-asosiy h-9" disabled={!natija || busy} onClick={() => eksport(false)}><Download size={14} /> Excel (М-29)</button>
        <button type="button" className="tugma h-9" disabled={!natija || busy} onClick={() => eksport(true)} aria-label="M-29 ko‘rish"><Eye size={14} /></button>
        <div className="min-w-[260px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} /></div>
      </div>
      {busy && <p className="text-[13px] text-text-dim">Yuklanmoqda…</p>}
      {xato && <p role="alert" className="text-[13px] text-danger">{xato}</p>}
      {ogoh && <p className="text-[12px] text-warn">{ogoh}</p>}

      {natija && (
        <>
          <section className="grid gap-2 sm:grid-cols-3" aria-label="Pul ta'siri">
            <div className="karta px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-text-mute">Tejash (normadan kam sarf)</p><p className="text-lg font-semibold tabular-nums text-ok">{pul(natija.jami.tejashSumma)}</p></div>
            <div className="karta px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-text-mute">Ortiqcha sarf (normadan ko‘p)</p><p className="text-lg font-semibold tabular-nums text-danger">{pul(natija.jami.ortiqchaSumma)}</p></div>
            <div className="karta px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-text-mute">Sof farq (+ zarar / − foyda)</p><p className="text-lg font-semibold tabular-nums">{pul(natija.jami.farqSummaJami)}</p></div>
          </section>

          {natija.diqqat.length > 0 && (
            <details className="karta p-3" open>
              <summary className="cursor-pointer text-[13px] font-semibold text-warn"><AlertTriangle size={14} className="mr-1 inline" />Diqqat talab qiladi — {natija.diqqat.length}</summary>
              <ul className="mt-2 space-y-1 text-[12px]">
                {natija.diqqat.map((d, i) => (
                  <li key={i}><b>{d.nom}</b> — {d.sabab}{d.summa != null ? <span className="ml-1 tabular-nums text-danger">({pul(d.summa)} сум)</span> : null}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <button type="button" className="tugma h-7 px-2" onClick={() => hammasiniOch(true)}>Hammasini ochish</button>
            <button type="button" className="tugma h-7 px-2" onClick={() => hammasiniOch(false)}>Hammasini yopish</button>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={faqatMuammo} onChange={(e) => setFaqatMuammo(e.target.checked)} /> faqat muammolilar</label>
          </div>

          <div className="karta overflow-auto">
            <table className="w-full min-w-[980px] text-[12px]">
              <thead className="bg-surface-2/60 text-text-dim">
                <tr>
                  <th className="px-2 py-1.5 text-left">Material / ish</th>
                  <th className="px-2 text-left">Ед.</th>
                  <th className="px-2 text-right">Norma (oy)</th>
                  <th className="px-2 text-right">Haqiqiy (oy)</th>
                  <th className="px-2 text-right">Norma (boshidan)</th>
                  <th className="px-2 text-right">Haqiqiy (boshidan)</th>
                  <th className="px-2 text-right">Farq</th>
                  <th className="px-2 text-right">Farq, сум</th>
                  <th className="px-2 text-right">Skladda qoldiq</th>
                </tr>
              </thead>
              <tbody>
                {natija.guruhlar.map((g) => {
                  const ms = g.materiallar.filter((m) => !faqatMuammo || muammoli(m));
                  if (!ms.length) return null;
                  const gOchiq = ochiq.has('g:' + g.kat);
                  return [
                    <tr key={'g' + g.kat} className="cursor-pointer border-t border-border bg-surface-2/40 font-semibold" onClick={() => almashtir('g:' + g.kat)}>
                      <td className="px-2 py-1.5">{gOchiq ? <ChevronDown size={13} className="inline" /> : <ChevronRight size={13} className="inline" />} {g.nom} <span className="font-normal text-text-mute">({ms.length})</span></td>
                      <td /><td /><td /><td className="px-2 text-right tabular-nums text-text-dim">{g.normaSummaJami != null ? `${pul(g.normaSummaJami)} сум` : ''}</td><td /><td />
                      <td className={`px-2 text-right tabular-nums ${(g.farqSummaJami ?? 0) > 0 ? 'text-danger' : 'text-ok'}`}>{pul(g.farqSummaJami)}</td><td />
                    </tr>,
                    ...(gOchiq ? ms.flatMap((m) => {
                      const mOchiq = ochiq.has('m:' + m.kalit);
                      const tone = m.farqJami == null ? 'text-text-mute' : m.farqJami > 1e-9 ? 'text-danger' : 'text-ok';
                      return [
                        <tr key={'m' + m.kalit} className="cursor-pointer border-t border-border/50 hover:bg-surface-2/40" onClick={() => almashtir('m:' + m.kalit)}>
                          <td className="py-1 pl-6 pr-2">{m.ishlar.length ? (mOchiq ? <ChevronDown size={12} className="inline" /> : <ChevronRight size={12} className="inline" />) : <span className="inline-block w-3" />} {m.kod ? <span className="mr-1 font-mono text-text-mute">{m.kod}</span> : null}{m.nom}</td>
                          <td className="px-2">{m.birlik}</td>
                          <td className="px-2 text-right tabular-nums">{fmt(m.normaOy)}</td>
                          <td className="px-2 text-right tabular-nums">{fmt(m.faktOy)}</td>
                          <td className="px-2 text-right tabular-nums">{fmt(m.normaJami)}</td>
                          <td className="px-2 text-right tabular-nums">{fmt(m.faktJami)}</td>
                          <td className={`px-2 text-right tabular-nums ${tone}`}>{fmt(m.farqJami)}</td>
                          <td className={`px-2 text-right tabular-nums ${tone}`}>{pul(m.farqSummaJami)}</td>
                          <td className="px-2 text-right tabular-nums">{fmt(m.skladQoldiq)}</td>
                        </tr>,
                        ...(mOchiq ? m.ishlar.map((ish) => (
                          <tr key={'i' + m.kalit + ish.blId} className="border-t border-border/30 text-text-dim">
                            <td className="py-0.5 pl-12 pr-2">{ish.kod ? <span className="mr-1 font-mono">{ish.kod}</span> : null}{ish.nom}{ish.toGridan ? ' (F2 da resurs miqdori)' : ''}</td>
                            <td className="px-2">{ish.birlik}</td>
                            <td className="px-2 text-right tabular-nums">{fmt(ish.normaOy)}</td>
                            <td />
                            <td className="px-2 text-right tabular-nums">{fmt(ish.normaJami)}</td>
                            <td colSpan={4} className="px-2 text-[11px]">{ish.norma != null ? `norma ${fmt(ish.norma, 6)} × hajm ${fmt(ish.hajmJami)}` : 'norma noma’lum'}</td>
                          </tr>
                        )) : []),
                      ];
                    }) : []),
                  ];
                })}
              </tbody>
            </table>
          </div>

          {natija.smetadaYoq.length > 0 && (
            <section className="karta p-3 text-[12px]">
              <h2 className="mb-1 font-semibold text-warn">Smetada yo‘q, lekin skladdan chiqarilgan materiallar — qayerga ishlatildi?</h2>
              <ul className="space-y-0.5">
                {natija.smetadaYoq.map((s, i) => <li key={i}>{s.nomi} ({s.birligi ?? '—'}): kirim {fmt(s.kirimJami)}, oyda chiqim {fmt(s.chiqimOy)}, boshidan {fmt(s.chiqimJami)}</li>)}
              </ul>
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
