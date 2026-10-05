import { useRef, useState } from 'react';
import { buildExtractionReview, reviewPage, sourceTablePage, type ExtractionReview } from '../../lib/catalog-extraction';
import { t } from '../../i18n/til';

export default function KatalogExtractionReview() {
  const [review, setReview] = useState<ExtractionReview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [table, setTable] = useState('works');
  const request = useRef(0);
  async function read(file?: File) {
    const token = ++request.current;
    setReview(null); setError(''); setPage(0); setSearch(''); setTable('works'); setBusy(!!file);
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('LARGE_PACKET');
      const parsed = buildExtractionReview(JSON.parse(await file.text()));
      if (request.current === token) setReview(parsed);
    } catch { if (request.current === token) setError(t('Paket o‘qilmadi. Fayl tuzilishi va ish–resurs bog‘lanishlarini tekshiring.')); }
    finally { if (request.current === token) setBusy(false); }
  }
  const result = review ? reviewPage(review, search, page) : null;
  const sourceResult = review && table !== 'works' ? sourceTablePage(review, table, search, page) : null;
  const total = sourceResult?.total ?? result?.total ?? 0;
  const labels: Record<string, string> = { BOOK: 'Katalog daraxti', LIBRARY: 'Sborniklar', NORMATIV: 'Normativ hujjatlar', POPRAV: 'Koeffitsient dalillari', POPRAVBASE: 'Tuzatish bog‘lanishlari', PRICE: 'Narx nomzodlari', RESURS_TIP: 'Resurs turlari' };
  return <details className="border border-border rounded-lg p-3">
    <summary className="cursor-pointer font-semibold">{t('Ish va resurs normalari — manba paketini ko‘rish')}</summary>
    <p className="text-sm text-warn my-2">{t('Faqat tekshiruv uchun. ShNQ tahriri, birlik va resurs nomlari tasdiqlanmaguncha hisobga qo‘llanmaydi. Smeta va F2 o‘zgarmaydi.')}</p>
    <label>{t('Tayyorlangan manba paketi')} <input type="file" accept=".json" disabled={busy} onChange={e => void read(e.target.files?.[0])} /></label>
    {busy && <p role="status">{t('Paket o‘qilmoqda…')}</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {review && result && <>
      <p className="my-2">{t('Ishlar')}: {review.works.length} · {t('Resurs normalari')}: {review.recipeCount}</p>
      <select aria-label={t('Manba bo‘limi')} value={table} onChange={e => { setTable(e.target.value); setPage(0); setSearch(''); }}>
        <option value="works">{t('Ish → resurs → norma')}</option>
        {review.tables.map(v => <option key={v.name} value={v.name}>{t(labels[v.name])} ({v.rows.length})</option>)}
      </select>
      <input aria-label={t('Ishni qidirish')} placeholder={t('Shifr, nom yoki bo‘lim bo‘yicha qidirish')} className="w-full p-2" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
      {table === 'works' && <div className="space-y-2 my-3">{result.rows.map(w => <details key={w.sourceIdentity} className="border border-border p-2 rounded">
        <summary>{w.code} · {w.name ?? t('Nom manbada yo‘q')} · {t('Resurslar')}: {w.recipes.length}</summary>
        <p>{t('Manbadagi sbornik / bo‘lim / bo‘linma kodi')}: {[w.collection, w.section, w.subsection].map(v => v ?? '—').join(' / ')}</p>
        <p>{t('Birlik kodi — ma’nosi tekshiriladi')}: {w.unitCode ?? '—'}</p>
        <table className="w-full text-sm"><thead><tr><th>{t('Resurs kodi')}</th><th>{t('Manbadagi aniq sarf normasi')}</th></tr></thead><tbody>{w.recipes.slice(0, 100).map(r => <tr key={r.sourceIdentity}><td>{r.resourceCode ?? '—'}</td><td>{r.normText ?? t('Noma’lum')}</td></tr>)}</tbody></table>
        {w.recipes.length > 100 && <p>{t('Birinchi 100 resurs ko‘rsatildi. To‘liq ro‘yxat manba paketida saqlangan.')}</p>}
      </details>)}</div>}
      {sourceResult && <div className="overflow-auto max-h-[480px] my-3"><p>{t('Manbaning asl maydonlari. Bu tasdiqlangan hisoblash qoidasi emas.')}</p><table className="text-sm"><thead><tr>{sourceResult.columns.map(c => <th key={c} className="p-2">{c}</th>)}</tr></thead><tbody>{sourceResult.rows.map((r, i) => <tr key={i}>{sourceResult.columns.map(c => <td key={c} className="p-2 min-w-[120px] max-w-[400px] whitespace-pre-wrap">{r[c] ?? '—'}</td>)}</tr>)}</tbody></table></div>}
      <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('Oldingi')}</button>
      <span className="mx-3">{page + 1} / {Math.max(1, Math.ceil(total / 25))} · {total}</span>
      <button type="button" disabled={(page + 1) * 25 >= total} onClick={() => setPage(p => p + 1)}>{t('Keyingi')}</button>
    </>}
  </details>;
}
