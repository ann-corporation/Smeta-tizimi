import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import { CONSTRUCT_REFERENCE, constructWorkKey, loadConstructCandidates, type ConstructResult } from '../../lib/smeta-studio/construct-koef';

export function ConstructReference({ works = [] }: { works?: Array<{ id: string; code: string; name: string | null; edition: string }> }) {
  const [key, setKey] = useState(() => constructWorkKey(works[0]?.code ?? '') ?? '');
  const [result, setResult] = useState<ConstructResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search(offset = 0) {
    request.current?.abort();
    const current = new AbortController();request.current = current;
    setBusy(true);setError(false);
    try {
      const response = await loadConstructCandidates(key, offset, fetch, current.signal);
      if (!current.signal.aborted) setResult(response);
    } catch { if (!current.signal.aborted) { setResult(null);setError(true); } }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  return <details className="rounded border border-border p-2">
    <summary className="cursor-pointer font-medium">{t('Yangi manba: Construct koeffitsientlari')}</summary>
    <p>{CONSTRUCT_REFERENCE.edition}</p>
    <p className="text-warn">{t('Ma’lumotnoma: hisoblash uchun tasdiqlanmagan. Bir xil kod boshqa tahrirda teng norma degani emas.')}</p>
    {works.length > 0 && <select className="input mt-2 max-w-full" aria-label={t('Smetadagi ishni manbada tekshirish')} defaultValue=""
      onChange={e => {
        const work = works.find(w => w.id === e.target.value);
        if (!work) return;
        request.current?.abort();setBusy(false);setResult(null);setError(false);setKey(constructWorkKey(work.code) ?? work.code);
      }}>
      <option value="">{t('— ishni tanlang —')}</option>
      {works.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name} · {w.edition}</option>)}
    </select>}
    <form className="my-2 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault();void search(); }}>
      <input className="input" aria-label={t('Manbadagi to‘liq ish kodi')} value={key} placeholder="Е01-01-001-1"
        onChange={e => { request.current?.abort();setBusy(false);setKey(e.target.value);setResult(null);setError(false); }} />
      <button type="submit" className="tugma" disabled={busy || !key.trim()}>{busy ? t('Qidirilmoqda...') : t('Manbada tekshirish')}</button>
    </form>
    {error && <p role="alert">{t('Manba ochilmadi yoki to‘liq ish kodi noto‘g‘ri. Qayta tekshiring.')}</p>}
    {result && <div role="status">
      <p>{result.workKey} · {result.edition}</p>
      <p className="break-all text-xs">{t('Manba SHA-256')}: {result.sourceSha256}</p>
      <p className="break-all text-xs">{t('Paket SHA-256')}: {result.referenceSha256}</p>
      {result.status === 'UNKNOWN_WORK' && <p>{t('Bu ish manba paketida mavjud emas.')}</p>}
      {result.status === 'NO_SOURCE_CANDIDATES' && <p>{t('Ish mavjud, lekin ushbu manbada unga bog‘langan koeffitsient yo‘q.')}</p>}
      {result.candidates.map(({ rule, scopes }) => <article key={rule.rule_id} className="my-2 border-t border-border pt-2">
        <p className="font-medium">{rule.collection_code}-{rule.code} · {rule.title}</p>
        <p>{rule.basis}</p>
        <p>{t('Mehnat')}: ×{rule.labour} · {t('Mashinalar')}: ×{rule.machines} · {t('Materiallar')}: ×{rule.materials}</p>
        <p className="text-text-mute">{t('Moslik asosi')}: {scopes.map(s => `${rule.kind}${rule.collection_code} / ${s.otdel} / ${s.tbl} / ${s.n_from}–${s.n_to}`).join('; ')}</p>
        <p className="text-warn">{t('Obyekt sharoiti, manba tahriri va birga qo‘llanishi ko‘rib chiqilishi kerak. Avtomatik qo‘llanmaydi.')}</p>
      </article>)}
      {result.total > 20 && <div className="flex items-center gap-2">
        <button type="button" className="tugma" disabled={busy || !result.offset} onClick={() => void search(Math.max(0, result.offset - 20))}>{t('Oldingi')}</button>
        <span>{result.offset + 1}–{Math.min(result.offset + result.limit, result.total)} / {result.total}</span>
        <button type="button" className="tugma" disabled={busy || result.offset + result.limit >= result.total} onClick={() => void search(result.offset + 20)}>{t('Keyingi')}</button>
      </div>}
    </div>}
  </details>;
}
