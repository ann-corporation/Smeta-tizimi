import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useEffect, useRef, useState } from 'react';
import { type SheetGrid, type XlsxWorkbook } from '../../lib/f2-import-parse';
import { resNarxlashPreview, resQatorlariniOl, resVaraqlariniTop, type ResNarx, type ResPreview, type ResUstunlar } from '../../lib/res-narxlash';
import { sbT2SmetaNarxlaRes } from '../../api/t2-smeta-narxlash';
import { yangiOperationId, sbT2DaraxtOl, sbT2ObyektlarOlKomp, type T2Obyekt, type T2Qator } from '../../api/supabase';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const RES_SABAB_MATNI: Record<NonNullable<ResPreview['moslashmagan']>[number]['sabab'], string> = {
  QATOR_IDENTIYASI_YOQ: 'qator nomi yoki birligi yo‘q',
  RES_MANBASI_TOPILMADI: 'RESda aynan mos qator topilmadi',
  RES_MANBA_ZIDDIYATI: 'bir RES kalitida turli narxlar bor',
  BIR_NECHTA_NARX_VARIANTI: 'bir nechta mos narx varianti bor',
};

/** 0 -> A, 25 -> Z, 26 -> AA — Exceldagi ustun harfi. */
function ustunHarfi(i: number): string {
  let s = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

const USTUN_YORLIQ: Array<[keyof ResUstunlar, string, string]> = [
  ['kod', 'КОД', 'bg-info/15 text-info'],
  ['nom', 'НАИМЕНОВАНИЕ', 'bg-ok/15 text-ok'],
  ['birlik', 'ЕД.ИЗМ.', 'bg-warn/15 text-warn'],
  ['narx', 'НАРХ', 'bg-accent/15 text-accent'],
];

/**
 * Egasi (2026-09-09): «res va lrv yuklanganda belgilangan sahifadan biroz
 * ko'rsatilishi kerak, ustunlarni tushunib aniqlashtirish uchun».
 *
 * Ilgari faqat SONLAR ko'rinardi (nechta narx topildi) — operator qaysi
 * ustun nima deb tanilganini KO'RMASDAN «tasdiqlab narxlash»ni bosardi.
 * Ustun bittaga surilgan bo'lsa, butun narxlash noto'g'ri ketardi va buni
 * faqat keyin bilib olinardi.
 */
function VaraqKorinishi({ nom, rows, cols }: { nom: string; rows: SheetGrid; cols: ResUstunlar }) {
  const belgi = new Map<number, [string, string]>();
  for (const [kalit, yorliq, rang] of USTUN_YORLIQ) {
    const i = cols[kalit];
    if (typeof i === 'number' && i >= 0) belgi.set(i, [yorliq, rang]);
  }
  const bosh = Math.max(0, cols.sarlavha);
  const korinish = rows.slice(bosh, bosh + 7);
  if (!korinish.length) return null;
  const ustunSoni = Math.min(14, Math.max(...korinish.map((r) => r.length), 0));
  const idx = Array.from({ length: ustunSoni }, (_, i) => i);

  return (
    <div className="karta p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-text">«{nom}» — tanilgan ustunlar</p>
        <p className="text-[11px] text-text-mute">{bosh + 1}-qatordan boshlab, dastlabki {korinish.length} qator</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {USTUN_YORLIQ.map(([kalit, yorliq, rang]) => {
          const i = cols[kalit];
          const bor = typeof i === 'number' && i >= 0;
          return (
            <span key={yorliq} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${bor ? rang : 'bg-danger/15 text-danger'}`}>
              {yorliq}: {bor ? ustunHarfi(i as number) : 'topilmadi'}
            </span>
          );
        })}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {idx.map((i) => {
                const b = belgi.get(i);
                return (
                  <th key={i} className={`border border-border px-1.5 py-1 text-left font-semibold ${b ? b[1] : 'text-text-mute'}`}>
                    {ustunHarfi(i)}{b ? ` · ${b[0]}` : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {korinish.map((r, ri) => (
              <tr key={ri}>
                {idx.map((i) => (
                  <td key={i} className={`max-w-[220px] truncate border border-border/60 px-1.5 py-1 ${belgi.has(i) ? 'font-medium text-text' : 'text-text-dim'}`}
                    title={String(r[i] ?? '')}>
                    {String(r[i] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sessiya({ companyId, fixedObjectId }: { companyId: number; fixedObjectId?: number }) {
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState(fixedObjectId ? String(fixedObjectId) : '');
  const [qatorlar, setQatorlar] = useState<T2Qator[]>([]);
  const [book, setBook] = useState<XlsxWorkbook | null>(null);
  const [tanlanganVaraqlar, setTanlanganVaraqlar] = useState<string[]>([]);
  const [preview, setPreview] = useState<ResPreview | null>(null);
  const [reslar, setReslar] = useState<ResNarx[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [natija, setNatija] = useState('');
  const operationId = useRef('');

  useEffect(() => {
    let active = true;
    void sbT2ObyektlarOlKomp(companyId).then((r) => {
      if (active) setObjects(r.ok ? (r.qatorlar || []) as T2Obyekt[] : []);
    });
    return () => { active = false; };
  }, [companyId]);

  async function obyektniYukla(id: string) {
    setObjectId(id); setPreview(null); setNatija(''); setError(''); operationId.current = '';
    if (!id) { setQatorlar([]); return; }
    const r = await sbT2DaraxtOl(Number(id));
    if (!r.ok) { setQatorlar([]); setError('Smeta qatorlari o‘qilmadi.'); return; }
    setQatorlar((r.qatorlar || []) as T2Qator[]);
  }

  useEffect(() => { if (fixedObjectId) void obyektniYukla(String(fixedObjectId)); }, [fixedObjectId]);

  function qaytaHisobla(workbook: XlsxWorkbook, varaqlar: string[], tree: T2Qator[]) {
    const topilgan = resVaraqlariniTop(workbook);
    const prices = topilgan
      .filter((x) => varaqlar.includes(x.nom))
      .flatMap((x) => {
        const sheet = workbook.sheet(x.nom);
        return sheet ? resQatorlariniOl(sheet.rows, x.cols) : [];
      });
    setReslar(prices);
    setPreview(resNarxlashPreview(tree, prices));
    operationId.current = yangiOperationId();
  }

  async function faylYukla(file: File) {
    setError(''); setNatija(''); setPreview(null); setBook(null); setReslar([]);
    if (file.size > MAX_FILE_BYTES) { setError('RES fayli 50 MB dan katta.'); return; }
    if (!objectId || qatorlar.length === 0) { setError('Avval smetasi bor obyektni tanlang.'); return; }
    setBusy(true);
    try {
      const workbook = await readXlsxFonda(await file.arrayBuffer());
      const topilgan = resVaraqlariniTop(workbook);
      if (!topilgan.length) throw new Error('RES ustunlari topilmadi. Kod, nom, birlik va “na. ed. izm.” narx ustuni bo‘lgan varaqni yuklang.');
      const names = topilgan.map((x) => x.nom);
      setBook(workbook); setTanlanganVaraqlar(names); qaytaHisobla(workbook, names, qatorlar);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RES fayli o‘qilmadi.');
    } finally { setBusy(false); }
  }

  function varaqniAlmashtir(name: string, checked: boolean) {
    if (!book) return;
    const next = checked ? [...tanlanganVaraqlar, name] : tanlanganVaraqlar.filter((x) => x !== name);
    setTanlanganVaraqlar(next); qaytaHisobla(book, next, qatorlar);
  }

  async function tasdiqla() {
    if (!preview || !objectId || !reslar.length || preview.mos === 0) return;
    setBusy(true); setError(''); setNatija('');
    try {
      const r = await sbT2SmetaNarxlaRes({ kompaniyaId: companyId, obyektId: Number(objectId), operationId: operationId.current || yangiOperationId(), narxlar: reslar });
      if (!r.ok) throw new Error(r.error || r.code || 'Narxlash bajarilmadi.');
      await obyektniYukla(objectId);
      setNatija(`${r.yozildi ?? 0} qator narxlandi; ${r.narxsiz_qoldi ?? 0} qator narxsiz qoldi.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Narxlash bajarilmadi.'); }
    finally { setBusy(false); }
  }

  const topilgan = book ? resVaraqlariniTop(book) : [];
  return <div className="space-y-3">
    <p className="text-[12px] text-text-mute">
      Bu ekran faqat narxi yo‘q (<code>NULL</code> yoki <code>0</code>) RS/MAT/OB qatorlarini RES bilan to‘ldiradi.
      Mavjud narx, F2 va tarixiy certified qiymatlar o‘zgarmaydi.
    </p>

    {/* Obyekt + fayl bir qatorda (keng ekran), tor ekranda ustma-ust. */}
    <div className="karta grid gap-3 p-3 sm:grid-cols-2">
      {!fixedObjectId && <label className="block text-[12px] font-medium text-text">Obyekt
        <select aria-label="Narxlash obyekti" value={objectId} onChange={(e) => void obyektniYukla(e.target.value)}
          className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
          <option value="">Tanlang</option><ObyektOptionlari obyektlar={objects} />
        </select>
      </label>}
      {objectId && <label className="block text-[12px] font-medium text-text">RES fayli (XLSX/XLS)
        <input aria-label="RES narx fayli" type="file" accept=".xlsx,.xlsm,.xls" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void faylYukla(f); }}
          className="input mt-1.5 block h-9 w-full px-2 py-1.5 text-[12px] file:mr-2 file:rounded file:border-0 file:bg-surface file:px-2 file:py-1 file:text-[12px] file:text-text" />
      </label>}
    </div>

    {busy && <p role="status" className="text-[13px] text-text-dim">Hisoblanmoqda…</p>}
    {error && <p role="alert" className="karta border-danger/40 bg-danger/5 p-3 text-[13px] text-danger">{error}</p>}

    {topilgan.length > 0 && <div className="karta p-3">
      <p className="text-[12px] font-semibold text-text">RES varaqlari</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {topilgan.map((x) => (
          <label key={x.nom} className="inline-flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={tanlanganVaraqlar.includes(x.nom)}
              onChange={(e) => varaqniAlmashtir(x.nom, e.target.checked)} />{x.nom}
          </label>
        ))}
      </div>
    </div>}

    {/* Varaqning O'ZI — operator ustun moslashuvini ko'z bilan tasdiqlashi
        uchun. Faqat TANLANGAN varaqlar ko'rsatiladi. */}
    {book && topilgan.filter((x) => tanlanganVaraqlar.includes(x.nom)).map((x) => {
      const sheet = book.sheet(x.nom);
      return sheet ? <VaraqKorinishi key={x.nom} nom={x.nom} rows={sheet.rows} cols={x.cols} /> : null;
    })}

    {/* Oldindan ko'rish — yozishdan OLDIN ko'riladigan yagona joy,
        shuning uchun raqamlar matn ichida emas, alohida kartochkalarda. */}
    {preview && <div className="karta p-3" aria-live="polite">
      <p className="text-[12px] font-semibold text-text">Oldindan ko‘rish — hali hech narsa yozilmadi</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {([
          ['Narxsiz qator', preview.narxsiz, 'text-text'],
          ['Narxi topildi', preview.mos, preview.mos ? 'text-ok' : 'text-text'],
          ['Narxsiz qoladi', preview.narxsizQoldi, preview.narxsizQoldi ? 'text-warn' : 'text-text'],
        ] as const).map(([label, value, tone]) => (
          <div key={label} className="rounded-lg border border-border px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-mute">{label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      {preview.ziddiyatliManba > 0 && <p className="mt-2 text-[12px] text-warn">
        {preview.ziddiyatliManba} ta RES kalitida turli narx bor — ular avtomatik qo‘llanmaydi (taxmin qilinmaydi).
      </p>}
      <p className="mt-2 text-[11px] text-text-mute">
        RS: {preview.turBoyicha.rs.mos}/{preview.turBoyicha.rs.narxsiz} · MAT: {preview.turBoyicha.mat.mos}/{preview.turBoyicha.mat.narxsiz} · OB: {preview.turBoyicha.ob.mos}/{preview.turBoyicha.ob.narxsiz}
      </p>
      {preview.moslashmagan.length > 0 && <details className="mt-2 rounded-lg border border-border/60 p-2">
        <summary className="cursor-pointer text-[12px] font-medium text-text">
          Narxsiz qoladigan qatorlar sababi ({preview.moslashmagan.length})
        </summary>
        <ul className="mt-2 max-h-52 space-y-1 overflow-auto text-[11px] text-text-dim">
          {preview.moslashmagan.slice(0, 100).map((q, i) => <li key={`${q.tur}:${q.kod ?? ''}:${q.nom ?? ''}:${i}`}>
            <b>{q.tur.toUpperCase()}</b> · {q.kod || 'kodsiz'} · {q.nom || 'nomsiz'} ({q.birlik || 'birliksiz'}) — {RES_SABAB_MATNI[q.sabab]}
          </li>)}
          {preview.moslashmagan.length > 100 && <li>Yana {preview.moslashmagan.length - 100} ta qator bor.</li>}
        </ul>
      </details>}
      <button type="button" className="tugma tugma-asosiy mt-3 w-full sm:w-auto"
        disabled={busy || preview.mos === 0} onClick={() => void tasdiqla()}>Tasdiqlab narxlash</button>
    </div>}

    {natija && <p role="status" className="karta border-ok/40 bg-ok/5 p-3 text-[13px] text-success">{natija}</p>}
  </div>;
}

export default function SmetaNarxlashResNative({ obyektId }: { obyektId?: number } = {}) {
  const { joriy, yuklanmoqda } = useKompaniya();
  const ichki = yuklanmoqda
    ? <p className="text-[13px] text-text-dim">Kompaniya yuklanmoqda…</p>
    : !joriy?.id
      ? <p className="text-[13px] text-text-dim">Kompaniyani tanlang.</p>
      : <Sessiya key={`${joriy.id}:${obyektId ?? 'all'}`} companyId={joriy.id} fixedObjectId={obyektId} />;
  /* `obyektId` berilgan bo'lsa — bu boshqa sahifa ichiga qo'yilgan panel,
     o'z sarlavhasi kerak emas. Mustaqil marshrut sifatida ochilganda esa
     qolgan PTO ekranlari bilan bir xil `Sahifa` karkasida bo'ladi. */
  if (obyektId != null) return ichki;
  return (
    <Sahifa sarlavha="Smetani narxlash (RES)"
      tavsif="Allaqachon import qilingan, narxsiz smetaga RES katalogidan narx qo‘llash">
      {ichki}
    </Sahifa>
  );
}
