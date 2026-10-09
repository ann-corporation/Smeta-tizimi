/**
 * FAYL MENEJERI — saytdagi R2 "xuddi fayl explorer darajasida" (egasi, 2026-10-02).
 *
 * Har kompaniya — o'z qismi (server a'zolikni tekshiradi; NTB hech qachon Discover Invest faylini ko'rmaydi).
 * Papkalar: Loyiha → Obyekt → Hujjat turi → Yil-oy → fayllar (versiya, hajm, sana, kim, SHA-256).
 * Amallar: ko'rish (Excel — saytda aynan hujjatdagiday; PDF/rasm — yangi oynada), yuklab olish, joriy papkaga yuklash,
 * papkani ZIP, "hammasi + ma'lumotlar" ZIP (fayllar papkalari bilan + jadvallar CSV/JSON + manifest).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Eye, FileArchive, FileSpreadsheet, FileText, Folder, FolderOpen, RefreshCw, Search, Upload } from 'lucide-react';
import { zipSync, strToU8, type Zippable } from 'fflate';
import { useTil } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { HujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { hujjatYukla } from '../../api/t2-hujjat-canonical';
import { EKSPORT_JADVALLARI, faylBaytlari, faylExplorerOl, jadvalHammasi, type FaylExplorer } from '../../api/t2-fayl';
import { csv, faylDaraxti, hajmMatni, papkaFayllari, papkaTop, turNomi, xavfsizNom, zipYollari, type Fayl, type Papka } from '../../lib/fayl-daraxt';

const EXCEL = /spreadsheet|excel|\.xlsx?$/i;
const sanaMatni = (s: string) => (s ? new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '');

export function FaylMenejer({ kompaniyaId }: { kompaniyaId: number }) {
  return <CompanyFileManager key={kompaniyaId} kompaniyaId={kompaniyaId} />;
}

function CompanyFileManager({ kompaniyaId }: { kompaniyaId: number }) {
  const { t } = useTil();
  const [storedData, setData] = useState<FaylExplorer | null>(null);
  const data = storedData?.kompaniya_id === kompaniyaId ? storedData : null;
  const companyRef = useRef(kompaniyaId);
  companyRef.current = kompaniyaId;
  const requestRef = useRef(0);
  const [xato, setXato] = useState<string | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [joriyKalit, setJoriyKalit] = useState('');
  const [ochiq, setOchiq] = useState<Set<string>>(new Set());
  const [qidiruv, setQidiruv] = useState('');
  const [band, setBand] = useState<string | null>(null);
  const [korinish, setKorinish] = useState<{ bytes: Uint8Array; nom: string } | null>(null);

  const yukla = useCallback(async () => {
    const request = ++requestRef.current;
    setYuklanmoqda(true); setXato(null);
    try { const result = await faylExplorerOl(kompaniyaId); if (request === requestRef.current && companyRef.current === kompaniyaId) setData(result); }
    catch (e) { if (request === requestRef.current && companyRef.current === kompaniyaId) setXato(e instanceof Error ? e.message : String(e)); }
    finally { if (request === requestRef.current && companyRef.current === kompaniyaId) setYuklanmoqda(false); }
  }, [kompaniyaId]);
  useEffect(() => {
    const requests = requestRef;
    setJoriyKalit(''); setKorinish(null); setOchiq(new Set()); setQidiruv(''); setBand(null);
    void yukla();
    return () => { requests.current++; };
  }, [yukla]);

  const ildiz = useMemo(() => faylDaraxti(data?.fayllar ?? []), [data]);
  const joriy = useMemo(() => papkaTop(ildiz, joriyKalit) ?? ildiz, [ildiz, joriyKalit]);
  const qidiruvNatija = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    if (!q) return null;
    return papkaFayllari(joriy).filter((f) => [f.nom, f.obyekt, f.loyiha, turNomi(f.tur), f.kim].some((x) => (x ?? '').toLowerCase().includes(q)));
  }, [qidiruv, joriy]);
  const yolQismlari = joriyKalit ? joriyKalit.split('/') : [];

  const ochYop = (k: string) => setOchiq((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const tanla = (k: string) => {
    setJoriyKalit(k); setQidiruv('');
    setOchiq((s) => { const n = new Set(s); k.split('/').forEach((_, i, a) => n.add(a.slice(0, i + 1).join('/'))); return n; });
  };

  const korish = async (f: Fayl) => {
    const company = kompaniyaId;
    const generation = requestRef.current;
    setBand(t('Ochilmoqda…'));
    try {
      const b = await faylBaytlari(f.id);
      if (companyRef.current !== company || requestRef.current !== generation) return;
      if (EXCEL.test(f.mime) || EXCEL.test(f.nom)) setKorinish({ bytes: b, nom: f.nom });
      else window.open(URL.createObjectURL(new Blob([b.slice()], { type: f.mime })), '_blank', 'noopener');
    } catch { if (companyRef.current === company && requestRef.current === generation) toast(t('Faylni ochib bo‘lmadi'), 'danger'); }
    finally { if (companyRef.current === company && requestRef.current === generation) setBand(null); }
  };
  const yuklabOl = async (f: Fayl) => {
    const company = kompaniyaId, generation = requestRef.current;
    const current = () => companyRef.current === company && requestRef.current === generation;
    setBand(t('Yuklanmoqda…'));
    try { const bytes = await faylBaytlari(f.id); if (current()) downloadBlob(bytes, f.nom, f.mime); }
    catch { if (current()) toast(t('Faylni yuklab bo‘lmadi'), 'danger'); }
    finally { if (current()) setBand(null); }
  };

  /** ZIP: tanlangan fayllar papkalari bilan (+ ixtiyoriy ma'lumotlar jadvallari). */
  const zip = async (fayllar: Fayl[], malumot: boolean, nom: string) => {
    const company = kompaniyaId, generation = requestRef.current;
    const current = () => companyRef.current === company && requestRef.current === generation;
    if (!fayllar.length && !malumot) { toast(t('Bu papkada fayl yo‘q'), 'warn'); return; }
    const z: Zippable = {};
    const yollar = zipYollari(fayllar);
    const xatolar: string[] = [];
    try {
      for (let i = 0; i < fayllar.length; i++) {
        if (!current()) return;
        const f = fayllar[i];
        setBand(t('ZIP: {i} / {n} fayl', { i: i + 1, n: fayllar.length }));
        try { z[yollar.get(f.id)!] = [await faylBaytlari(f.id), { level: 0 }]; }
        catch { xatolar.push(`#${f.id} ${f.nom}`); }
      }
      if (malumot) {
        for (const j of EKSPORT_JADVALLARI) {
          if (!current()) return;
          setBand(t('Ma’lumotlar: {nom}', { nom: j.nom }));
          try {
            const q = await jadvalHammasi(j.jadval, kompaniyaId, j.ustunlar);
            z[`malumotlar/${j.nom}.csv`] = strToU8(csv(q));
            z[`malumotlar/json/${j.nom}.json`] = strToU8(JSON.stringify(q));
          } catch { xatolar.push(j.nom); }
        }
      }
      if (!current()) return;
      const manifest = {
        kompaniya_id: kompaniyaId, kompaniya: data?.kompaniya ?? null, yaratildi: new Date().toISOString(),
        fayllar: fayllar.map((f) => ({ id: f.id, yol: yollar.get(f.id), nom: f.nom, tur: f.tur, versiya: f.versiya, hajm: f.hajm, sha256: f.sha256, sana: f.sana, kim: f.kim, loyiha: f.loyiha, obyekt: f.obyekt })),
        olinmagan: xatolar,
      };
      z['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1));
      z['manifest.csv'] = strToU8(csv(manifest.fayllar));
      setBand(t('ZIP yig‘ilmoqda…'));
      const bytes = zipSync(z, { level: 6 });
      downloadBlob(bytes, `${xavfsizNom(nom)}_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
      if (xatolar.length) toast(t('ZIP tayyor, lekin {n} ta element olinmadi — manifest.json da ro‘yxat', { n: xatolar.length }), 'warn');
      else toast(t('ZIP tayyor: {n} fayl', { n: fayllar.length }), 'ok');
    } catch { if (current()) toast(t('ZIP yaratib bo‘lmadi'), 'danger'); }
    finally { if (current()) setBand(null); }
  };

  const faylYuklash = async (fl: FileList | null) => {
    if (!fl?.length) return;
    const company = kompaniyaId, generation = requestRef.current;
    const current = () => companyRef.current === company && requestRef.current === generation;
    let ok = 0;
    try {
    for (const file of Array.from(fl)) {
      if (!current()) return;
      setBand(t('Yuklanmoqda: {nom}', { nom: file.name }));
      const r = await hujjatYukla({ file, kompaniyaId, loyihaId: joriy.loyiha_id, obyektId: joriy.obyekt_id, documentType: joriy.tur ?? 'hujjat' });
      if (!current()) return;
      if (r.ok) ok++; else toast(t('{nom} yuklanmadi', { nom: file.name }), 'danger');
    }
    setBand(null);
    if (ok) { toast(t('{n} ta fayl yuklandi', { n: ok }), 'ok'); void yukla(); }
    } catch { if (current()) toast(t('Faylni yuklab bo‘lmadi'), 'danger'); }
    finally { if (current()) setBand(null); }
  };

  const papkaQatori = (p: Papka) => {
    const ochilgan = ochiq.has(p.kalit);
    const tanlangan = p.kalit === joriyKalit;
    return (
      <li key={p.kalit}>
        <div className={`flex items-center gap-1 rounded px-1 py-0.5 text-[12px] ${tanlangan ? 'bg-accent/15 text-text' : 'text-text-dim hover:bg-white/5'}`} style={{ paddingLeft: 4 + p.daraja * 12 }}>
          {p.bolalar.length
            ? <button type="button" onClick={() => ochYop(p.kalit)} aria-label={ochilgan ? t('Papkani yopish') : t('Papkani ochish')} className="shrink-0">{ochilgan ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
            : <span className="w-[13px] shrink-0" />}
          <button type="button" onClick={() => tanla(p.kalit)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {tanlangan ? <FolderOpen size={14} className="shrink-0 text-accent" /> : <Folder size={14} className="shrink-0" />}
            <span className="truncate">{p.nom}</span>
            <span className="ml-auto shrink-0 text-[10px] text-text-mute">{p.soni}</span>
          </button>
        </div>
        {ochilgan && p.bolalar.length > 0 && <ul>{p.bolalar.map(papkaQatori)}</ul>}
      </li>
    );
  };

  const royxat = qidiruvNatija ?? joriy.fayllar;
  const papkalar = qidiruvNatija ? [] : joriy.bolalar;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="karta flex flex-wrap items-center gap-2 p-3">
        <div className="mr-2 min-w-0">
          <div className="truncate text-[14px] font-semibold text-text">{data?.kompaniya ?? '…'}</div>
          <div className="text-[11px] text-text-mute">{t('{n} fayl · {h}', { n: ildiz.soni, h: hajmMatni(ildiz.hajm) })}</div>
        </div>
        <label className="relative ml-auto min-w-[220px] flex-1 sm:flex-none">
          <Search size={13} className="pointer-events-none absolute left-2 top-2.5 text-text-mute" />
          <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Shu papkada qidirish')} aria-label={t('Shu papkada qidirish')} className="input h-8 w-full pl-7 text-[12px]" />
        </label>
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-text ${band ? 'pointer-events-none opacity-50' : ''}`}>
          <Upload size={14} />{t('Shu papkaga yuklash')}
          <input type="file" multiple className="hidden" onChange={(e) => { void faylYuklash(e.target.files); e.target.value = ''; }} />
        </label>
        <button type="button" disabled={!!band} onClick={() => void zip(papkaFayllari(joriy), false, joriy.kalit ? joriy.nom : (data?.kompaniya ?? 'fayllar'))} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-text disabled:opacity-50"><FileArchive size={14} />{t('Papkani ZIP')}</button>
        <button type="button" disabled={!!band} onClick={() => void zip(papkaFayllari(ildiz), true, `${data?.kompaniya ?? 'kompaniya'}_toliq_arxiv`)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"><FileArchive size={14} />{t('Hammasi + ma’lumotlar (ZIP)')}</button>
        <button type="button" onClick={() => void yukla()} aria-label={t('Yangilash')} className="rounded-lg border border-border p-1.5 text-text-dim"><RefreshCw size={14} /></button>
      </section>
      {band && <div role="status" className="karta px-3 py-2 text-[12px] text-text-dim">{band}</div>}
      {xato && <div role="alert" className="karta border-danger/40 px-3 py-2 text-[12px] text-danger">{xato}</div>}

      <div className="flex min-h-0 flex-1 gap-3">
        <nav aria-label={t('Papkalar')} className="karta hidden w-[290px] shrink-0 overflow-auto p-2 md:block">
          <button type="button" onClick={() => tanla('')} className={`mb-1 flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[12px] font-semibold ${joriyKalit === '' ? 'bg-accent/15 text-text' : 'text-text'}`}>
            <FolderOpen size={14} className="text-accent" /><span className="truncate">{data?.kompaniya ?? t('Kompaniya')}</span><span className="ml-auto text-[10px] text-text-mute">{ildiz.soni}</span>
          </button>
          <ul>{ildiz.bolalar.map(papkaQatori)}</ul>
        </nav>

        <section className="karta flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 text-[12px]">
            <button type="button" onClick={() => tanla('')} className="text-accent hover:underline">{data?.kompaniya ?? t('Kompaniya')}</button>
            {yolQismlari.map((q, i) => (
              <span key={i} className="flex items-center gap-1 text-text-dim"><ChevronRight size={12} />
                <button type="button" onClick={() => tanla(yolQismlari.slice(0, i + 1).join('/'))} className="hover:underline">{papkaTop(ildiz, yolQismlari.slice(0, i + 1).join('/'))?.nom ?? q}</button>
              </span>
            ))}
            {qidiruvNatija && <span className="ml-2 text-text-mute">{t('Qidiruv: {n} ta', { n: qidiruvNatija.length })}</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {yuklanmoqda ? <div className="skel m-3 h-40 rounded-lg" /> : (
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-surface text-left text-[11px] text-text-mute">
                  <tr><th className="px-3 py-1.5">{t('Nomi')}</th><th className="px-2">{t('Turi')}</th><th className="px-2">{t('Versiya')}</th><th className="px-2 text-right">{t('Hajmi')}</th><th className="px-2">{t('Sana')}</th><th className="px-2">{t('Kim')}</th><th className="px-2" /></tr>
                </thead>
                <tbody>
                  {papkalar.map((p) => (
                    <tr key={p.kalit} onDoubleClick={() => tanla(p.kalit)} className="cursor-pointer border-t border-border/40 hover:bg-white/5">
                      <td className="px-3 py-1.5"><button type="button" onClick={() => tanla(p.kalit)} className="flex items-center gap-2 text-left text-text"><Folder size={15} className="text-accent" />{p.nom}</button></td>
                      <td className="px-2 text-text-mute">{t('Papka')}</td><td />
                      <td className="px-2 text-right text-text-mute">{hajmMatni(p.hajm)}</td>
                      <td className="px-2 text-text-mute" colSpan={3}>{t('{n} fayl', { n: p.soni })}</td>
                    </tr>
                  ))}
                  {royxat.map((f) => (
                    <tr key={f.id} onDoubleClick={() => void korish(f)} className="border-t border-border/40 hover:bg-white/5">
                      <td className="max-w-[420px] px-3 py-1.5">
                        <span className="flex items-center gap-2 text-text">{EXCEL.test(f.mime) || EXCEL.test(f.nom) ? <FileSpreadsheet size={15} className="shrink-0 text-ok" /> : <FileText size={15} className="shrink-0 text-text-dim" />}<span className="truncate" title={f.nom}>{f.nom}</span></span>
                        {qidiruvNatija && <span className="ml-6 block truncate text-[10px] text-text-mute">{[f.loyiha, f.obyekt].filter(Boolean).join(' / ')}</span>}
                      </td>
                      <td className="px-2 text-text-dim">{turNomi(f.tur)}</td>
                      <td className="px-2 text-text-dim">v{f.versiya}</td>
                      <td className="px-2 text-right tabular-nums text-text-dim">{hajmMatni(f.hajm)}</td>
                      <td className="px-2 text-text-dim">{sanaMatni(f.sana)}</td>
                      <td className="max-w-[140px] truncate px-2 text-text-mute">{f.kim}</td>
                      <td className="whitespace-nowrap px-2 text-right">
                        <button type="button" onClick={() => void korish(f)} aria-label={t('Ko‘rish')} className="rounded p-1 text-text-dim hover:text-text"><Eye size={14} /></button>
                        <button type="button" onClick={() => void yuklabOl(f)} aria-label={t('Yuklab olish')} className="rounded p-1 text-text-dim hover:text-text"><Download size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {!papkalar.length && !royxat.length && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-text-mute">{qidiruvNatija ? t('Hech narsa topilmadi') : t('Bu papka bo‘sh')}</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
      {korinish && <HujjatKorinish bytes={korinish.bytes} faylNomi={korinish.nom} onClose={() => setKorinish(null)} />}
    </div>
  );
}
