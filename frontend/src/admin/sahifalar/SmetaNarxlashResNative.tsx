import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useEffect, useRef, useState } from 'react';
import { type SheetGrid, type XlsxWorkbook } from '../../lib/f2-import-parse';
import { resNarxlashPreview, resQatorlariniOl, resVaraqlariniTop, type ResNarx, type ResPreview, type ResUstunlar } from '../../lib/res-narxlash';
import { sbT2SmetaNarxlaRes } from '../../api/t2-smeta-narxlash';
import { yangiOperationId, sbT2DaraxtOl, sbT2ObyektlarOlKomp, type T2Obyekt, type T2Qator } from '../../api/supabase';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { t } from '../../i18n/til';
import { bolaklar } from '../../lib/narx-korinish';
import { QamrovChizigi } from '../../components/narx/NarxKorinish';
import { OmmaviyNarxlash } from '../../components/narx/OmmaviyNarxlash';

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
  ['kod', 'КОД', 'bg-[var(--info-soft)] text-[var(--info)]'],
  ['nom', 'НАИМЕНОВАНИЕ', 'bg-[var(--ok-soft)] text-ok'],
  ['birlik', 'ЕД.ИЗМ.', 'bg-surface-3 text-text'],
  ['narx', 'НАРХ', 'bg-accent/15 text-[var(--accent-text)]'],
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
    <section className="fz-card">
      <div className="fz-card__head">
        <h3 className="fz-card__title">{t('«{nom}» — tanilgan ustunlar', { nom })}</h3>
        <p className="fz-card__sub">{t('{b}-qatordan boshlab, dastlabki {n} qator', { b: String(bosh + 1), n: String(korinish.length) })}</p>
      </div>
      <div className="fz-card__body">
      <div className="mt-2 flex flex-wrap gap-1.5">
        {USTUN_YORLIQ.map(([kalit, yorliq, rang]) => {
          const i = cols[kalit];
          const bor = typeof i === 'number' && i >= 0;
          return (
            <span key={yorliq} className={`fz-chip ${bor ? rang : 'fz-chip--danger'}`}>
              {yorliq}: {bor ? ustunHarfi(i as number) : t('topilmadi')}
            </span>
          );
        })}
      </div>
      <div className="fz-table-wrap mt-3">
        <table className="fz-table text-[12px]">
          <thead>
            <tr>
              {idx.map((i) => {
                const b = belgi.get(i);
                return (
                  <th key={i} className={b ? b[1] : ''}>
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
                  <td key={i} className={`max-w-[220px] truncate ${belgi.has(i) ? 'font-medium text-text' : 'text-text-mute'}`}
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
    </section>
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
  // JONLI_SINOV_TOPILMALARI #14: narxi aniq 0 bo'lgan qatorlarni ham to'ldirish — faqat foydalanuvchi tanlovi (egasi qoidasi «narx 0 = 0»).
  const [nolHam, setNolHam] = useState(false);
  useEffect(() => {
    if (!reslar.length) return;
    setPreview(resNarxlashPreview(qatorlar, reslar, { nolHam }));
    operationId.current = yangiOperationId();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nolHam]);
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
    setPreview(resNarxlashPreview(tree, prices, { nolHam }));
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
      const r = await sbT2SmetaNarxlaRes({ kompaniyaId: companyId, obyektId: Number(objectId), operationId: operationId.current || yangiOperationId(), narxlar: reslar, nolHam });
      if (!r.ok) throw new Error(r.error || r.code || 'Narxlash bajarilmadi.');
      await obyektniYukla(objectId);
      setNatija(`${r.yozildi ?? 0} qator narxlandi; ${r.narxsiz_qoldi ?? 0} qator narxsiz qoldi.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Narxlash bajarilmadi.'); }
    finally { setBusy(false); }
  }

  const topilgan = book ? resVaraqlariniTop(book) : [];
  const qadamlar = [
    { n: 1, nom: t('Obyekt'), bajarildi: !!objectId && qatorlar.length > 0 },
    { n: 2, nom: t('RES fayli'), bajarildi: !!book },
    { n: 3, nom: t('Oldindan ko‘rish'), bajarildi: !!preview },
    { n: 4, nom: t('Tasdiqlab narxlash'), bajarildi: !!natija },
  ];
  const joriyQadam = qadamlar.findIndex((q) => !q.bajarildi);
  return <div className="flex flex-col gap-3">
    <div className="fz-yol" aria-label={t('Narxlash bosqichlari')}>
      {qadamlar.map((q, i) => <div key={q.n} className={`fz-yol__q ${q.bajarildi ? 'fz-yol__q--done' : i === joriyQadam ? 'fz-yol__q--now' : ''}`}>
        <span className="fz-yol__nuqta" aria-hidden="true" /><span className="fz-yol__nom">{q.n}. {q.nom}</span>
      </div>)}
    </div>
    <p className="fz-note fz-note--info">
      {t('Bu ekran narxi kiritilmagan (bo‘sh) mehnat, mashina va material qatorlariga RES bo‘yicha narx qo‘yadi. Narxi 0 bo‘lgan qatorlar — faqat pastdagi belgini qo‘ysangiz. Mavjud narxlar, F2 va avval tasdiqlangan qiymatlar o‘zgarmaydi.')}
    </p>
    <label className="flex items-start gap-2 text-[12px]">
      <input type="checkbox" className="mt-0.5" checked={nolHam} onChange={(e) => setNolHam(e.target.checked)} />
      <span>{t('0 narxlarni ham to‘ldirish (dastur eksportida RES narxi 0 bo‘lsa). Amal auditga yoziladi.')}
        {preview && preview.nolNarxli !== 0 && !nolHam && <b className="fz-chip fz-chip--warn ml-1">{t('Bu obyektda narxi 0 bo‘lgan {n} ta qator bor.', { n: preview.nolNarxli })}</b>}
      </span>
    </label>

    {/* Obyekt + fayl bir qatorda (keng ekran), tor ekranda ustma-ust. */}
    <div className="fz-card fz-card__body grid gap-3 sm:grid-cols-2">
      {!fixedObjectId && <label className="block text-[12px] font-medium text-text-dim">{t('Obyekt')}
        <select aria-label="Narxlash obyekti" value={objectId} onChange={(e) => void obyektniYukla(e.target.value)}
          className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
          <option value="">{t('Tanlang')}</option><ObyektOptionlari obyektlar={objects} />
        </select>
      </label>}
      {objectId && <label className="block text-[12px] font-medium text-text-dim">{t('RES fayli (XLSX/XLS)')}
        <input aria-label="RES narx fayli" type="file" accept=".xlsx,.xlsm,.xls" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void faylYukla(f); }}
          className="input mt-1.5 block h-9 w-full px-2 py-1.5 text-[12px] file:mr-2 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-[12px] file:text-text" />
      </label>}
    </div>

    {/* Egasi 2026-11-05: RES faylisiz — reestr → katalog → КП → internet bilan barcha narxsiz qatorlar bitta ko'rib chiqishda. */}
    {objectId && qatorlar.length > 0 && <OmmaviyNarxlash key={`${objectId}:${nolHam}`} kompaniyaId={companyId} obyektId={Number(objectId)}
      qatorlar={qatorlar} nolHam={nolHam} onYangilandi={() => obyektniYukla(objectId)} />}

    {busy && <p role="status" className="text-[13px] text-text-dim">{t('Hisoblanmoqda…')}</p>}
    {error && <p role="alert" className="fz-note fz-note--danger">{error}</p>}

    {topilgan.length > 0 && <div className="fz-card fz-card__body">
      <p className="fz-panel__h">{t('RES varaqlari')}</p>
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
    {preview && <section className="fz-doc__sheet fz-doc__sheet--draft" aria-live="polite">
      <div className="fz-doc__top">
        <div><div className="fz-doc__eyebrow">{t('Oldindan ko‘rish')}</div><h3 className="fz-card__title">{t('Hali hech narsa yozilmadi')} <span className="fz-stamp fz-stamp--draft ml-1">{t('Qoralama')}</span></h3></div>
        <div className="grid grid-cols-3 gap-4 text-right">
          {([
            ['Narxsiz qator', preview.narxsiz, 'text-text'],
            ['Narxi topildi', preview.mos, preview.mos ? 'text-ok' : 'text-text'],
            ['Narxsiz qoladi', preview.narxsizQoldi, preview.narxsizQoldi ? 'text-warn' : 'text-text'],
          ] as const).map(([label, value, tone]) => (
            <div key={label}>
              <p className="fz-panel__h justify-end">{t(label)}</p>
              <p className={`font-[family-name:var(--font-display)] text-[20px] font-semibold tabular-nums ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>
      <QamrovChizigi aria={t('Narxsiz qatorlar')} bolaklar={bolaklar([{ kalit: 'mos', soni: preview.mos }, { kalit: 'qoldi', soni: preview.narxsizQoldi }]).bolaklar}
        nomlar={{ mos: t('RESdan narx topildi'), qoldi: t('narxsiz qoladi') }} ranglar={{ mos: 'var(--ok)', qoldi: 'var(--warn)' }} />
      <div className="fz-bars">
        {(['rs', 'mat', 'ob'] as const).map((k) => { const x = preview.turBoyicha[k]; return (
          <div key={k} className="fz-bars__q"><span>{k.toUpperCase()}</span><b>{x.mos} / {x.narxsiz}</b><i style={{ ['--w' as string]: `${x.narxsiz ? (x.mos / x.narxsiz) * 100 : 0}%` }} /></div>); })}
      </div>
      {preview.ziddiyatliManba > 0 && <p className="fz-note fz-note--warn">
        {t('{n} ta RES kalitida turli narx bor — ular avtomatik qo‘llanmaydi (taxmin qilinmaydi).', { n: String(preview.ziddiyatliManba) })}
      </p>}
      {preview.moslashmagan.length > 0 && <details className="rounded-[var(--radius-sm)] border border-border p-2">
        <summary className="cursor-pointer text-[12px] font-medium text-text">
          {t('Narxsiz qoladigan qatorlar sababi ({n})', { n: String(preview.moslashmagan.length) })}
        </summary>
        <ul className="mt-2 max-h-52 space-y-1 overflow-auto text-[11px] text-text-dim">
          {preview.moslashmagan.slice(0, 100).map((q, i) => <li key={`${q.tur}:${q.kod ?? ''}:${q.nom ?? ''}:${i}`}>
            <b>{q.tur.toUpperCase()}</b> · {q.kod || t('kodsiz')} · {q.nom || t('nomsiz')} ({q.birlik || t('birliksiz')}) — {t(RES_SABAB_MATNI[q.sabab])}
          </li>)}
          {preview.moslashmagan.length > 100 && <li>{t('Yana {n} ta qator bor.', { n: String(preview.moslashmagan.length - 100) })}</li>}
        </ul>
      </details>}
      <div className="fz-doc__actions"><button type="button" className="fz-btn fz-btn--primary fz-btn--lg w-full sm:w-auto"
        disabled={busy || preview.mos === 0} onClick={() => void tasdiqla()}>{t('Tasdiqlab narxlash')}</button></div>
    </section>}

    {natija && <p role="status" className="fz-note border-ok/40 bg-[var(--ok-soft)] text-[13px]">{natija}</p>}
  </div>;
}

export default function SmetaNarxlashResNative({ obyektId }: { obyektId?: number } = {}) {
  const { joriy, yuklanmoqda } = useKompaniya();
  const ichki = yuklanmoqda
    ? <p className="text-[13px] text-text-dim">{t('Kompaniya yuklanmoqda…')}</p>
    : !joriy?.id
      ? <p className="fz-note fz-note--info">{t('Kompaniyani tanlang.')}</p>
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
