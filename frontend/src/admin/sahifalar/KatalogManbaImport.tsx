import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Loader2, UploadCloud } from 'lucide-react';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { catalogQatorlariniApiFormatga, tahlilKatalogXlsx, tahlilMashinaSoatPdf, type CatalogTahlil } from '../../lib/catalog-manba-import';
import { narxManbaniYukla, platformaManbaniYukla, sbNarxManbalarOl, sbPlatformaManbalarOl, type NarxManba } from '../../api/t2-narx-dalil';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { useKompaniya as useKontekst } from '../../umumiy/kontekst/KompaniyaKontekst';
import { t } from '../../i18n/til';

function sha256(bytes: ArrayBuffer) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) return Promise.resolve(null);
  return crypto.subtle.digest('SHA-256', bytes).then(function (hash) {
    return Array.from(new Uint8Array(hash)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  });
}

function opId() {
  return (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2));
}

function manbaTur(turi: CatalogTahlil['turi']) {
  if (turi === 'ish_haqi') return 'chel_chas' as const;
  if (turi === 'material_katalog') return 'katalog' as const;
  return 'kalkulyatsiya_mash' as const;
}

function davrSana(tahlil: CatalogTahlil) {
  if (!tahlil.davr.yil || !tahlil.davr.kvartal) return undefined;
  return String(tahlil.davr.yil) + '-' + String((tahlil.davr.kvartal - 1) * 3 + 1).padStart(2, '0') + '-01';
}

function xatoMatni(error: unknown) {
  return error instanceof Error ? error.message : 'Katalog fayli tahlil qilinmadi';
}

/**
 * Katalog manbasini dalil sifatida yozadi.
 * Smeta narxini, t2_narxni yoki faktni operator tasdig‘isiz almashtirmaydi.
 * Fayl nomi identity emas; bir xil fayl SHA-256 bilan qayta kiritilmaydi.
 */
export default function KatalogManbaImport() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [files, setFiles] = useState<File[]>([]);
  const [analyses, setAnalyses] = useState<CatalogTahlil[]>([]);
  const [manbalar, setManbalar] = useState<NarxManba[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [periodChecked, setPeriodChecked] = useState(false);
  /* Egasi 2026-10-02: "katalog hamma foydalanuvchi alohida tashlanmasligi kerak" — superadmin platformaga BIR MARTA
     yuklaydi, hamma kompaniya narx taklifida ko'radi. Server superadminlikni qayta tekshiradi. */
  const superadmin = useKontekst().superadmin;
  const [platforma, setPlatforma] = useState(false);
  const [platformaHash, setPlatformaHash] = useState<Set<string>>(new Set());
  /** Platformadagi manbalar: hash → {id, versiya, qator_soni} — chala qolgan yuklamani aniqlash uchun. */
  const [platformaManba, setPlatformaManba] = useState<Map<string, { id: number; versiya: number; qator_soni: number }>>(new Map());

  const refreshSources = useCallback(async () => {
    if (!kompaniyaId) { setManbalar([]); return; }
    const r = await sbNarxManbalarOl(kompaniyaId);
    if (r.ok) setManbalar(r.qatorlar || []);
    const p = await sbPlatformaManbalarOl();
    if (p.ok) {
      setPlatformaHash(new Set((p.qatorlar || []).map((x) => x.fayl_document_id).filter((x): x is string => !!x)));
      setPlatformaManba(new Map((p.qatorlar || []).filter((x) => !!x.fayl_document_id).map((x) => [x.fayl_document_id as string, { id: x.id, versiya: x.versiya, qator_soni: Number(x.qator_soni) }])));
    }
  }, [kompaniyaId]);
  useEffect(() => { void refreshSources(); }, [refreshSources]);

  // Takror tekshiruvi: platforma rejimida — platforma katalogi; aks holda — kompaniya manbalari + platforma (bir xil fayl ikki marta kerak emas).
  const existingHashes = useMemo(() => new Set([...(platforma ? [] : manbalar.map(function (m) { return m.fayl_document_id; })), ...platformaHash].filter(Boolean)), [manbalar, platformaHash, platforma]);
  const totalRows = analyses.reduce(function (n, a) { return n + a.qatorlar.length; }, 0);
  const unresolved = analyses.filter(function (a) { return !a.importgaTayyor || (!!a.periodNizolari?.length && !periodChecked); });

  async function analyze(nextFiles: File[]) {
    setFiles(nextFiles); setAnalyses([]); setError(''); setMessage(''); setPeriodChecked(false);
    if (!nextFiles.length) return;
    setBusy(true);
    try {
      const next: CatalogTahlil[] = [];
      for (const file of nextFiles) {
        const bytes = await file.arrayBuffer();
        const hash = await sha256(bytes);
        const analysis = /\.pdf$/i.test(file.name)
          ? await tahlilMashinaSoatPdf(bytes, file.name)
          : /\.(xls|xlsx|xlsm)$/i.test(file.name)
            ? tahlilKatalogXlsx(await readXlsxFonda(bytes), file.name)
            : null;
        if (!analysis) throw new Error(file.name + ': faqat XLS/XLSX yoki mashina-soat PDF qabul qilinadi.');
        next.push({ ...analysis, contentHash: hash || undefined });
      }
      setAnalyses(next);
    } catch (e) {
      setError(xatoMatni(e));
    } finally { setBusy(false); }
  }

  async function importSources() {
    if (!kompaniyaId || !analyses.length || unresolved.length) return;
    const batchCounts = new Map<string, number>();
    analyses.forEach(function (a) { if (a.contentHash) batchCounts.set(a.contentHash, (batchCounts.get(a.contentHash) || 0) + 1); });
    // Platformada chala qolgan (uzilgan) manba — takror emas, o'sha manbaga to'liq qayta yoziladi.
    const chala = function (a: CatalogTahlil) { const m = a.contentHash ? platformaManba.get('sha256:' + a.contentHash) : undefined; return platforma && !!m && m.qator_soni < a.qatorlar.length ? m : undefined; };
    const duplicates = analyses.filter(function (a) { return !!a.contentHash && !chala(a) && (existingHashes.has('sha256:' + a.contentHash) || (batchCounts.get(a.contentHash) || 0) > 1); });
    if (duplicates.length) {
      setError('Qayta import bloklandi: ' + duplicates.map(function (x) { return x.faylNomi; }).join(', ') + ' allaqachon shu SHA-256 bilan mavjud.');
      return;
    }
    setBusy(true); setError(''); setMessage(''); setProgress({ done: 0, total: totalRows });
    let done = 0;
    try {
      for (const analysis of analyses) {
        const rows = catalogQatorlariniApiFormatga(analysis.qatorlar);
        const malumot = {
          tur: manbaTur(analysis.turi),
          nom: analysis.faylNomi,
          sana: davrSana(analysis),
          yil: analysis.davr.yil ?? undefined,
          kvartal: analysis.davr.kvartal ?? undefined,
          fayl_document_id: analysis.contentHash ? 'sha256:' + analysis.contentHash : undefined,
          izoh: JSON.stringify({ importer: 'T2_CATALOG_MANBA_IMPORT_V1', tur: analysis.turi, davr: analysis.davr, varaqlar: analysis.varaqlar.map(function (v) { return { nom: v.nom, rol: v.rol, qatorSoni: v.qatorSoni }; }) }),
        };
        const jarayon = function (loaded: number) { setProgress({ done: done + loaded, total: totalRows }); };
        const result = platforma
          ? await platformaManbaniYukla(malumot, rows, opId(), 2000, jarayon, chala(analysis))
          : await narxManbaniYukla(kompaniyaId, malumot, rows, opId(), 5000, jarayon);
        if (!result.ok) throw new Error(analysis.faylNomi + ': ' + (result.error || result.sabab || 'manba saqlanmadi'));
        done += rows.length; setProgress({ done: done, total: totalRows });
      }
      setMessage((platforma ? t('Platforma katalogi (barcha kompaniyalar uchun): ') : '') + String(analyses.length) + ' ta manba, ' + totalRows.toLocaleString('uz-UZ') + ' ta qator source-only dalil sifatida saqlandi. Smeta narxi avtomatik o‘zgartirilmadi.');
      await refreshSources();
    } catch (e) { setError(xatoMatni(e)); }
    finally { setBusy(false); setProgress(null); }
  }

  return <section className="karta p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[14px] font-semibold text-text flex items-center gap-2"><UploadCloud size={16} className="text-accent" /> Katalog manbasini o‘qitish</h2>
        <p className="mt-1 text-[11px] text-text-mute max-w-3xl">Material katalogi, ish haqi va mashina-soat manbalari alohida dalil sifatida saqlanadi. Narx registri yoki smeta narxi operator tasdig‘isiz almashtirilmaydi.</p>
      </div>
      {superadmin && <label className="inline-flex items-center gap-2 text-[12px] text-text"><input type="checkbox" checked={platforma} onChange={function (e) { setPlatforma(e.target.checked); }} />{t('Platforma katalogi — bir marta, barcha kompaniyalar uchun')}</label>}
      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-[12px] cursor-pointer">
        <FileSpreadsheet size={15} /> Fayllarni tahlil qilish
        <input className="hidden" type="file" multiple accept=".xls,.xlsx,.xlsm,.pdf" onChange={function (e) { return void analyze(Array.from(e.target.files || [])); }} />
      </label>
    </div>
    {error && <div className="border border-danger/40 bg-danger/10 text-danger rounded-lg p-3 text-[12px]"><AlertTriangle size={14} className="inline mr-1" />{error}</div>}
    {message && <div className="border border-ok/40 bg-ok/10 text-ok rounded-lg p-3 text-[12px]"><CheckCircle2 size={14} className="inline mr-1" />{message}</div>}
    {busy && <div className="text-[12px] text-text-dim"><Loader2 size={14} className="inline mr-1 animate-spin" />{progress ? String(progress.done.toLocaleString('uz-UZ')) + ' / ' + progress.total.toLocaleString('uz-UZ') + ' qator' : 'Fayllar o‘qilmoqda…'}</div>}
    {!!files.length && !busy && <div className="text-[11px] text-text-mute">Tanlangan fayl: {files.map(function (f) { return f.name; }).join(' · ')}</div>}
    {!!analyses.length && <>
      <div className="grid gap-2 md:grid-cols-3">
        <div className="bg-white/[.03] rounded-lg p-3"><div className="text-[11px] text-text-mute">Fayl/manba</div><div className="text-[18px] font-semibold text-text">{analyses.length}</div></div>
        <div className="bg-white/[.03] rounded-lg p-3"><div className="text-[11px] text-text-mute">O‘qiladigan qator</div><div className="text-[18px] font-semibold text-text">{totalRows.toLocaleString('uz-UZ')}</div></div>
        <div className="bg-white/[.03] rounded-lg p-3"><div className="text-[11px] text-text-mute">Takroriy manbalar</div><div className="text-[18px] font-semibold text-text">{analyses.filter(function (a, _, all) { return !!a.contentHash && (existingHashes.has('sha256:' + a.contentHash) || all.filter(function (b) { return b.contentHash === a.contentHash; }).length > 1); }).length}</div></div>
      </div>
      <div className="overflow-auto border border-border rounded-lg"><table className="w-full text-[12px]"><thead className="bg-white/[.03] text-text-mute"><tr><th className="text-left p-2">Fayl</th><th className="text-left p-2">Turi</th><th className="text-left p-2">Davr</th><th className="text-right p-2">Qator</th><th className="text-left p-2">Holat</th></tr></thead><tbody>{analyses.map(function (a, _, all) { const dup = !!a.contentHash && (existingHashes.has('sha256:' + a.contentHash) || all.filter(function (b) { return b.contentHash === a.contentHash; }).length > 1); return <tr key={a.faylNomi} className="border-t border-border/60"><td className="p-2 max-w-[300px] truncate" title={a.faylNomi}><FileText size={13} className="inline mr-1 text-text-mute" />{a.faylNomi}</td><td className="p-2">{a.turi === 'ish_haqi' ? 'Ish haqi · ЧЕЛ.-Ч' : a.turi === 'material_katalog' ? 'Material katalogi' : a.turi === 'mashina_soat' ? 'Mashina-soat · МАШ.-Ч' : 'Aniqlanmadi'}</td><td className="p-2">{a.davr.yorliq}</td><td className="p-2 text-right tabular-nums">{a.qatorlar.length.toLocaleString('uz-UZ')}</td><td className="p-2">{dup ? <span className="text-warn">Takroriy manba</span> : a.importgaTayyor ? <span className="text-ok">Importga tayyor</span> : <span className="text-danger">Tekshiruv kerak</span>}</td></tr>; })}</tbody></table></div>
      <details className="text-[11px] text-text-mute"><summary className="cursor-pointer">Varaq tahlili va ogohlantirishlar</summary><div className="mt-2 space-y-1">{analyses.flatMap(function (a) { return a.varaqlar.map(function (v) { return <div key={a.faylNomi + '|' + v.nom}>{a.faylNomi} / {v.nom}: {v.rol}, {v.qatorSoni.toLocaleString('uz-UZ')} qator{v.warnings.length ? ' · ' + v.warnings.join('; ') : ''}</div>; }); })}</div></details>
      {!!analyses.some(function (a) { return !!a.periodNizolari?.length; }) && <label className="flex items-start gap-2 text-[11px] text-warn"><input type="checkbox" checked={periodChecked} onChange={function (e) { setPeriodChecked(e.target.checked); }} /> Fayl nomi bilan varaq sarlavhasi davri farq qiladi. Men varaqdagi davrni tekshirib, shuni qabul qilaman.</label>}
      <button type="button" onClick={function () { return void importSources(); }} disabled={busy || !kompaniyaId || !!unresolved.length || !analyses.length} className="px-3 py-2 rounded-lg bg-accent text-white text-[12px] disabled:opacity-50">Tahlilni tasdiqlash va manbalarni saqlash</button>
      {unresolved.length > 0 && <p className="text-[11px] text-warn">Noaniq yoki bo‘sh fayl import qilinmaydi. Avval fayl formatini tekshiring.</p>}
    </>}
  </section>;
}
