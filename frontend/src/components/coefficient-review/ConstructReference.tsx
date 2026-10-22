import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import { constructWorkKey, loadConstructCandidates, type ConstructResult } from '../../lib/smeta-studio/construct-koef';

/** Normative product language; extraction provenance remains internal. Work-bound, no separate code search. */
export function ConstructReference({ works = [] }: { works?: Array<{ id: string; code: string; name: string | null; edition: string }> }) {
  const code = works[0]?.code ?? '';
  const [result, setResult] = useState<ConstructResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const request = useRef(0);
  useEffect(() => { request.current++; setResult(null); setError(false); setBusy(false); return () => { request.current++; }; }, [code]);
  async function load(offset = 0) {
    const id = ++request.current; setBusy(true); setError(false);
    try { const r = await loadConstructCandidates(code, offset); if (id === request.current) setResult(r); }
    catch { if (id === request.current) setError(true); }
    finally { if (id === request.current) setBusy(false); }
  }
  if (!constructWorkKey(code)) return null;
  return <details className="mt-1 text-xs" onToggle={e => { if (e.currentTarget.open && !result && !busy && !error) void load(); }}>
    <summary className="cursor-pointer text-text-dim">{t('Qo‘shimcha normativ shartlar')}</summary>
    {busy && <p>{t('Qidirilmoqda...')}</p>}
    {error && <p role="alert">{t('Normativ shartlar ochilmadi.')} <button type="button" onClick={() => void load()}>{t('Qayta urinish')}</button></p>}
    {result && <div>
      {result.status !== 'REFERENCE_CANDIDATES' && <p>{t('Bu ish uchun qo‘shimcha normativ shart topilmadi.')}</p>}
      {result.candidates.map(({ rule }) => <article key={rule.rule_id} className="my-2 border-t border-border pt-1">
        <p>{rule.title}</p><p className="font-medium">{rule.basis}</p>
        <p>{t('Mehnat')}: ×{rule.labour} · {t('Mashinalar')}: ×{rule.machines} · {t('Materiallar')}: ×{rule.materials}</p>
        <p className="text-warn">{t('Hisobga qo‘llashdan oldin normativ tahriri va sharti tekshirilishi kerak.')}</p>
      </article>)}
      {result.limit < result.total && <div className="flex gap-2">
        <button type="button" disabled={busy || !result.offset} onClick={() => void load(Math.max(0, result.offset - 20))}>{t('Oldingi')}</button>
        <span>{result.offset + 1}–{Math.min(result.offset + result.limit, result.total)} / {result.total}</span>
        <button type="button" disabled={busy || result.offset + result.limit >= result.total} onClick={() => void load(result.offset + 20)}>{t('Keyingi')}</button>
      </div>}
    </div>}
  </details>;
}
