/**
 * QatorTanlagich.tsx — obyekt smetasidan qator tanlash (qidiruv bilan). Yangi qidiruv dvigateli YO'Q: obyekt daraxti mavjud
 * `daraxtVaHolatOl` dan (bir marta, ochilganda), qidiruv — mavjud `qidiruvTayyorla` (lotin/kirill farqsiz). Bo'lim qatorlari tanlanmaydi.
 */
import { useEffect, useMemo, useState } from 'react';
import type { T2Qator } from '../../api/supabase';
import { daraxtVaHolatOl } from '../../lib/oylik-hujjat/ostatka-slichitelniy';
import { qidiruvTayyorla } from '../../lib/qidiruv-normalizatsiya';
import { t } from '../../i18n/til';
import { inp } from '../zakazchik/tomon-yordam';

export type TanlanganQator = { id: number; kod: string | null; nom: string };

export function QatorTanlagich({ obyektId, tanlangan, onTanla }: { obyektId: number; tanlangan: TanlanganQator | null; onTanla: (q: TanlanganQator | null) => void }) {
  const [rows, setRows] = useState<T2Qator[] | null>(null);
  const [xato, setXato] = useState('');
  const [q, setQ] = useState('');
  const [ochiq, setOchiq] = useState(false);
  useEffect(() => {
    if (!ochiq || rows) return;
    let tirik = true;
    void daraxtVaHolatOl(obyektId).then((r) => { if (!tirik) return; if (r.ok) setRows(r.rows); else setXato(r.xato); }).catch(() => { if (tirik) setXato(t('Smeta qatorlari o‘qilmadi')); });
    return () => { tirik = false; };
  }, [ochiq, rows, obyektId]);
  const topilgan = useMemo(() => {
    if (!rows || q.trim().length < 2) return [];
    const mos = qidiruvTayyorla(q);
    return rows.filter((r) => r.tur !== 'rz' && mos(`${r.kod ?? ''} ${r.nom ?? ''}`)).slice(0, 20);
  }, [rows, q]);
  if (tanlangan) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <b>#{tanlangan.id}</b> {tanlangan.kod ?? ''} {tanlangan.nom}
        <button type="button" className="text-accent underline" onClick={() => onTanla(null)}>{t('O‘zgartirish')}</button>
      </span>
    );
  }
  return (
    <div className="relative">
      <input className={`${inp} w-64`} placeholder={t('Smeta qatorini qidiring (shifr yoki nom)')} value={q} onFocus={() => setOchiq(true)} onChange={(e) => { setQ(e.target.value); setOchiq(true); }} />
      {xato && <div className="text-[11px] text-danger">{xato}</div>}
      {ochiq && topilgan.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-96 overflow-auto rounded border border-border bg-surface text-xs shadow-lg">
          {topilgan.map((r) => (
            <li key={r.id}><button type="button" className="block w-full px-2 py-1 text-left hover:bg-surface-2" onClick={() => { onTanla({ id: r.id, kod: r.kod ?? null, nom: r.nom ?? '' }); setQ(''); }}>
              <b>#{r.id}</b> {r.kod ?? ''} {r.nom} <span className="text-text-dim">· {r.birlik ?? '—'}</span></button></li>))}
        </ul>)}
    </div>
  );
}
