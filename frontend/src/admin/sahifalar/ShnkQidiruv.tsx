import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/til';

type Citation = {
  sha256: string; norma_kod: string; nom: string; tahrir: string;
  sahifa_pdf: number | null; jadval_kod: string | null; bob_punkt: string | null;
  iqtibos: string; qisqartirilgan: boolean;
};

export function ShnkQidiruv({ kompaniyaId, shifr }: { kompaniyaId: number; shifr?: string }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [reason, setReason] = useState<string>();
  const [edition, setEdition] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const search = async () => {
    const text = (shifr ?? q).trim();
    if (text.length < 2 || text.length > 120) return;
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setState('busy');
    setCitations([]);
    try {
      const params = new URLSearchParams({ kompaniya_id: String(kompaniyaId), q: text });
      if (edition.trim()) params.set('tahrir', edition.trim());
      const response = await fetch('/api/normativ-qidir?' + params, { signal: request.signal });
      const data = await response.json() as { ok?: boolean; natijalar?: Citation[]; sabab?: string };
      if (!response.ok || !data.ok || !Array.isArray(data.natijalar)) throw new Error('NORMATIV_SEARCH_FAILED');
      if (request.signal.aborted) return;
      setReason(data.sabab);
      setCitations(data.natijalar);
      setState('done');
    } catch {
      if (!request.signal.aborted) setState('error');
    }
  };

  const query = (shifr ?? q).trim();
  return <section className="space-y-2">
    {!shifr && <input className="inp w-full" aria-label={t('Normativ shifri yoki nomi')}
      value={q} maxLength={120} onChange={e => setQ(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />}
    {state === 'done' && reason === 'EDITION_REQUIRED' && <input className="inp w-full"
      aria-label={t('Normativ tahriri')} value={edition} maxLength={120} onChange={e => setEdition(e.target.value)} />}
    <button type="button" className="btn btn-ghost" onClick={() => void search()}
      disabled={query.length < 2 || query.length > 120 || state === 'busy'}>
      {shifr ? t('Normani ko‘rish') : t('Qidirish')}
    </button>
    <div aria-live="polite">
      {state === 'busy' && <p>{t('Normativ qidirilmoqda…')}</p>}
      {state === 'error' && <p>{t('Normativ qidiruvini ochib bo‘lmadi.')}</p>}
      {state === 'done' && !citations.length && <p>{reason === 'EDITION_REQUIRED'
        ? t('Bir nechta tahrir topildi. Kerakli tahrirni kiriting va qayta qidiring.')
        : reason === 'REFERENCE_AMBIGUOUS'
          ? t('Shifr bir nechta normativga mos. Hujjatning to‘liq kodini qidiring.')
          : t('Mos nashr qilingan normativ topilmadi.')}</p>}
    </div>
    {citations.map((c, index) => <article className="rounded border border-line p-3" key={c.sha256 + ":" + index}>
      <h4 className="font-medium">{c.norma_kod} · {c.nom} · {c.tahrir}</h4>
      <p>{[c.jadval_kod, c.bob_punkt, c.sahifa_pdf != null ? t('PDF sahifa {n}', { n: c.sahifa_pdf }) : null].filter(Boolean).join(' · ')}</p>
      <blockquote className="whitespace-pre-wrap break-words">{c.iqtibos}{c.qisqartirilgan ? '…' : ''}</blockquote>
    </article>)}
  </section>;
}
