import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { catalogQatorlariniApiFormatga, tahlilKatalogXlsx, tahlilMashinaSoatPdf, type CatalogTahlil } from '../../lib/catalog-manba-import';
import { listCatalogReleases, referenceRelease, uploadCatalogRelease, type CatalogRelease, type ReferenceRelease, type ReleaseMeta } from '../../lib/catalog-release/client';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { t } from '../../i18n/til';

export default function CatalogReleasePanel() {
  const { superadmin } = useKompaniya();
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<CatalogTahlil | null>(null);
  const [meta, setMeta] = useState<ReleaseMeta | null>(null);
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [reference, setReference] = useState<ReferenceRelease | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [approved, setApproved] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  async function refresh(next?: string) {
    try { const page = await listCatalogReleases(next); setReleases(old => next ? [...old, ...page.releases] : page.releases); setCursor(page.cursor); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  useEffect(() => { void refresh(); void referenceRelease().then(setReference).catch(e => setError(e instanceof Error ? e.message : String(e))); }, []);
  async function analyze(next: File | null) {
    setFile(next); setAnalysis(null); setMeta(null); setApproved(false); setError(''); setMessage('');
    if (!next) return;
    if (next.size > 25 * 1024 * 1024) { setError(t('Fayl hajmi 25 MB dan oshmasin')); return; }
    setBusy(true);
    try {
      const bytes = await next.arrayBuffer();
      const parsed = /\.pdf$/i.test(next.name) ? await tahlilMashinaSoatPdf(bytes, next.name) : tahlilKatalogXlsx(await readXlsxFonda(bytes), next.name);
      setAnalysis(parsed); setMeta({ nom: next.name, tur: parsed.turi === 'ish_haqi' ? 'chel_chas' : parsed.turi === 'mashina_soat' ? 'kalkulyatsiya_mash' : 'katalog', yil: parsed.davr.yil ?? null, kvartal: parsed.davr.kvartal ?? null, nds_holati: 'nomalum', valyuta: null });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!superadmin || !file || !analysis?.importgaTayyor || !meta || !approved) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const done = await uploadCatalogRelease(file, meta, catalogQatorlariniApiFormatga(analysis.qatorlar), (n, total) => setProgress(Math.floor(n / total * 100)));
      setMessage(t('Umumiy katalog saqlandi') + `: ${done.rows.toLocaleString()} · ${done.revision.slice(0, 16)}`); setApproved(false); await refresh();
    } catch (e) { setError((e instanceof Error ? e.message : String(e)) + '. ' + t('Qayta yuklash yozilgan bo‘laklarni takrorlamaydi')); }
    finally { setBusy(false); setProgress(null); }
  }
  return <section className="karta p-4 space-y-4">
    <h2 className="text-lg font-semibold">{t('Kataloglar va narx manbalari')}</h2>
    {reference && <p className="rounded border border-border p-3 text-sm">{t('Tizim ma’lumotnomalari')}: {reference.counts.resources.toLocaleString()} {t('resurs')}, {reference.counts.price_observations.toLocaleString()} {t('katalog narxi')}, {reference.counts.wages.toLocaleString()} {t('mehnat stavkasi')}. <span className="text-warn">{t('Manba saqlangan; avtomatik narxlashga ulanmagan')}</span></p>}
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded border border-border p-3"><h3 className="font-semibold">{t('Kompaniya katalogi')}</h3><p className="text-sm text-text-dim">{t('O‘zingiz yuklagan narx manbalari faqat kompaniyangizga tegishli.')}</p><Link className="text-accent underline" to="/admin/narx-manbalari">{t('Kompaniya katalogini yuklash')}</Link></div>
      <div className="rounded border border-border p-3"><h3 className="font-semibold">{t('Umumiy platforma katalogi')}</h3><p className="text-sm text-text-dim">{t('Tizim boshqaruvchisi yuklaydi, barcha kompaniyalar foydalanadi.')}</p></div>
    </div>
    {superadmin && <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">{t('Umumiy katalog fayli')}<input type="file" accept=".xls,.xlsx,.xlsm,.pdf" disabled={busy} onChange={e => void analyze(e.target.files?.[0] ?? null)} className="block mt-1" /></label>
      {meta && analysis && <>
        <div className="flex flex-wrap gap-3 text-sm">
          <label>{t('Yil')}<input className="block border rounded p-1 bg-transparent" type="number" value={meta.yil ?? ''} onChange={e => { setApproved(false); setMeta({ ...meta, yil: e.target.value === '' ? null : Number(e.target.value) }); }} /></label>
          <label>{t('Kvartal')}<select className="block border rounded p-1 bg-transparent" value={meta.kvartal ?? ''} onChange={e => { setApproved(false); setMeta({ ...meta, kvartal: e.target.value === '' ? null : Number(e.target.value) }); }}><option value="">{t('Noma’lum')}</option>{[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}</option>)}</select></label>
          <label>{t('QQS holati')}<select className="block border rounded p-1 bg-transparent" value={meta.nds_holati} onChange={e => { setApproved(false); setMeta({ ...meta, nds_holati: e.target.value as ReleaseMeta['nds_holati'] }); }}><option value="nomalum">{t('Noma’lum')}</option><option value="nds_siz">{t('QQS siz')}</option><option value="nds_bilan">{t('QQS bilan')}</option></select></label>
          <label>{t('Valyuta')}<select className="block border rounded p-1 bg-transparent" value={meta.valyuta ?? ''} onChange={e => { setApproved(false); setMeta({ ...meta, valyuta: e.target.value || null }); }}><option value="">{t('Noma’lum')}</option>{['UZS', 'USD', 'EUR'].map(c => <option key={c}>{c}</option>)}</select></label>
        </div>
        <p>{analysis.qatorlar.length.toLocaleString()} {t('qator')} · {analysis.davr.yorliq}</p>
        {analysis.varaqlar.flatMap(v => v.warnings).map((w, i) => <p key={i} className="text-warn text-sm">{w}</p>)}
        {!!analysis.periodNizolari?.length && <p className="text-warn">{t('Fayl va varaq davri farq qiladi — davrni tekshiring')}</p>}
        <div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th>{t('Nomi')}</th><th>{t('Birlik')}</th><th>{t('Narx')}</th></tr></thead><tbody>{analysis.qatorlar.slice(0, 10).map((r, i) => <tr key={i}><td>{String((r as unknown as Record<string, unknown>).nom ?? '')}</td><td>{String((r as unknown as Record<string, unknown>).birlik ?? '')}</td><td>{String((r as unknown as Record<string, unknown>).narx ?? '—')}</td></tr>)}</tbody></table></div>
        {!analysis.importgaTayyor && <p className="text-danger">{t('Fayl tahlili tugallanmagan — yuklash bloklandi')}</p>}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={approved} disabled={busy} onChange={e => setApproved(e.target.checked)} />{t('Manba, davr va qatorlarni tekshirdim; umumiy katalogga yuklayman')}</label>
        <button type="button" className="tugma" disabled={busy || !approved || !analysis.importgaTayyor} onClick={() => void save()}>{t('Umumiy katalogni saqlash')}</button>
      </>}
    </fieldset>}
    {busy && <p role="status">{progress == null ? t('Fayl tahlil qilinmoqda') : `${progress}%`}</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}{message && <p role="status" className="text-ok">{message}</p>}
    <p className="text-sm text-text-dim">{t('Yuklangan manba saqlanadi. Smeta narxi avtomatik o‘zgarmaydi; narxlashga ulanish holati alohida ko‘rsatiladi.')}</p>
    <ul className="space-y-2">{releases.map(r => <li key={r.revision} className="border border-border rounded p-2"><b>{r.metadata.nom}</b> · {r.total_rows.toLocaleString()} {t('qator')} · {r.metadata.yil ?? '—'} / {r.metadata.kvartal ?? '—'}<br /><span className="text-warn text-sm">{t('Manba saqlangan; avtomatik narxlashga ulanmagan')}</span> · <a className="text-accent underline" href={`/api/catalog-release?revision=${r.revision}&file=source`}>{t('Asl fayl')}</a></li>)}</ul>
    {cursor && <button type="button" className="tugma" onClick={() => void refresh(cursor)}>{t('Yana ko‘rsatish')}</button>}
  </section>;
}
