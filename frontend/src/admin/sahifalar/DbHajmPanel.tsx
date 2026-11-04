import { useEffect, useState } from 'react';
import { t } from '../../i18n/til';
import { hajmMatni } from '../../lib/fayl-daraxt';

/**
 * Baza hajmi (saqlash dietasi): joriy hajm, chegaraga nisbati va eng katta jadvallar. Faqat platforma superadmini
 * (server har chaqiruvda bazada tekshiradi). 80% — ogohlantirish, 90% — xavf. Faqat o'qiydi.
 */
type Top = { sxema: string; jadval: string; bytes: number; qator: number };
type Hajm = { db_bytes: number; limit_bytes: number; foiz: number; daraja: 'ok' | 'ogoh' | 'xavf'; top: Top[]; snapshot_sovuq: { sovuq_blok?: number; sovuq_bayt?: number; issiq_bayt?: number } | null };

export function DbHajmPanel() {
  const [h, setH] = useState<Hajm | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    let tirik = true;
    fetch('/api/db-hajm').then(async (r) => {
      const j = await r.json().catch(() => null) as ({ ok?: boolean; code?: string } & Partial<Hajm>) | null;
      if (!tirik) return;
      if (!r.ok || !j || j.ok !== true) setXato(String(j?.code ?? r.status)); else setH(j as Hajm);
    }).catch((e: unknown) => { if (tirik) setXato(e instanceof Error ? e.message : String(e)); });
    return () => { tirik = false; };
  }, []);

  if (xato) return <section className="karta p-3 text-[12px]" aria-label={t('Baza hajmi')}><p role="alert" className="text-text-dim">{t('Baza hajmi olinmadi: {x}', { x: xato })}</p></section>;
  if (!h) return null;
  const rang = h.daraja === 'xavf' ? 'text-danger' : h.daraja === 'ogoh' ? 'text-warning' : 'text-text';
  const eng = h.top.length ? h.top[0].bytes : 0;

  return (
    <section className="karta space-y-2 p-3 text-[12px]" aria-label={t('Baza hajmi')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-text">{t('Baza hajmi (superadmin)')}</span>
        <span className={`tabular-nums font-semibold ${rang}`}>{t('{h} / {l} · {f}%', { h: hajmMatni(h.db_bytes), l: hajmMatni(h.limit_bytes), f: String(h.foiz).replace('.', ',') })}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-border/40" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(h.foiz))} aria-label={t('Baza hajmi')}>
        <div className={`h-full ${h.daraja === 'xavf' ? 'bg-danger' : h.daraja === 'ogoh' ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${Math.min(100, h.foiz)}%` }} />
      </div>
      {h.daraja !== 'ok' && (
        <p role="alert" className={rang}>
          {h.daraja === 'xavf'
            ? t('Diqqat: baza 90% dan oshdi — zudlik bilan joy bo‘shating (snapshot sovuq mazmunini R2 ga ko‘chirish).')
            : t('Ogohlantirish: baza 80% dan oshdi — snapshot sovuq mazmunini R2 ga ko‘chirishni rejalashtiring.')}
        </p>
      )}
      <ul className="space-y-0.5">
        {h.top.map((x) => (
          <li key={x.sxema + '.' + x.jadval} className="flex items-center gap-2">
            <span className="w-56 truncate text-text-dim">{x.sxema === 'public' ? x.jadval : `${x.sxema}.${x.jadval}`}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded bg-border/30"><span className="block h-full bg-accent/60" style={{ width: `${eng ? Math.max(2, (x.bytes / eng) * 100) : 0}%` }} /></span>
            <span className="w-20 text-right tabular-nums text-text">{hajmMatni(x.bytes)}</span>
          </li>
        ))}
      </ul>
      {h.snapshot_sovuq && <p className="text-[11px] text-text-mute">{t('Snapshot: bazada {i} · R2 da (sovuq) {s} blok', { i: hajmMatni(Number(h.snapshot_sovuq.issiq_bayt ?? 0)), s: Number(h.snapshot_sovuq.sovuq_blok ?? 0) })}</p>}
    </section>
  );
}
