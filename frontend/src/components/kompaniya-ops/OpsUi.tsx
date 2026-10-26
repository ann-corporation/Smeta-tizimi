import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { t } from '../../i18n/til';

/**
 * Kompaniya operatsiyalari sahifalari (logistika, moliya, ERP) uchun umumiy Firuza bo'laklari:
 * tablar, KPI qatori, holat taqsimoti chizig'i, qidiruv, modal oyna (role=dialog, Esc, fon — yopadi).
 * Rang faqat tokenlardan (var(--…)); matn chaqiruvchida tarjima qilinadi.
 */

export type TabYozuv<K extends string> = { id: K; nom: string; ikon?: ReactNode; soni?: number | null };

export function OpsTablar<K extends string>({ tablar, joriy, onTanla, yorliq, oxirida }: {
  tablar: readonly TabYozuv<K>[]; joriy: K; onTanla: (k: K) => void; yorliq: string; oxirida?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border" role="tablist" aria-label={yorliq}>
      {tablar.map((tb) => (
        <button key={tb.id} type="button" role="tab" aria-selected={joriy === tb.id} onClick={() => onTanla(tb.id)}
          className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors [&_svg]:h-[15px] [&_svg]:w-[15px] ${joriy === tb.id ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}>
          {tb.ikon}{tb.nom}
          {tb.soni != null && <span className={`fz-chip ${joriy === tb.id ? 'fz-chip--accent' : ''}`}>{tb.soni}</span>}
        </button>
      ))}
      {oxirida && <div className="ml-auto flex items-center gap-2 pb-1">{oxirida}</div>}
    </div>
  );
}

export function OpsKpi({ nom, qiymat, ost, rang }: { nom: string; qiymat: ReactNode; ost?: ReactNode; rang?: string }) {
  return (
    <div className="fz-kpi">
      <span className="fz-kpi__label">{rang && <i style={{ background: rang }} />}{nom}</span>
      <span className="fz-kpi__value">{qiymat}</span>
      {ost != null && <span className="fz-kpi__sub">{ost}</span>}
    </div>
  );
}

export function OpsKpiQator({ children, yorliq }: { children: ReactNode; yorliq: string }) {
  return <section className="fz-card fz-kpis p-4" aria-label={yorliq}>{children}</section>;
}

export type Segment = { kalit: string; nom: string; soni: number; rang: string };

/** Holatlar bo'yicha segmentli chiziq + afsona (0 li segmentlar chizilmaydi, afsonada qoladi). */
export function OpsTaqsimot({ sarlavha, segmentlar, ong, onTanla, tanlangan }: {
  sarlavha: string; segmentlar: readonly Segment[]; ong?: ReactNode; onTanla?: (kalit: string) => void; tanlangan?: string | null;
}) {
  const jami = segmentlar.reduce((s, x) => s + x.soni, 0);
  return (
    <section className="fz-panel" aria-label={sarlavha}>
      <div className="fz-panel__h"><span>{sarlavha}</span><span>{ong}</span></div>
      <div className="fz-split" role="img" aria-label={segmentlar.filter((s) => s.soni > 0).map((s) => `${s.nom}: ${s.soni}`).join(', ') || sarlavha}>
        {jami > 0 && segmentlar.filter((s) => s.soni > 0).map((s) => <i key={s.kalit} style={{ background: s.rang, flexGrow: s.soni }} title={`${s.nom}: ${s.soni}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-dim">
        {segmentlar.map((s) => {
          const ichki = <><i className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.rang, opacity: s.soni ? 1 : 0.35 }} />{s.nom}<b className="tabular-nums text-text">{s.soni}</b></>;
          return onTanla
            ? <button key={s.kalit} type="button" onClick={() => onTanla(s.kalit)} aria-pressed={tanlangan === s.kalit}
              className={`inline-flex items-center gap-1.5 rounded px-1 ${tanlangan === s.kalit ? 'bg-surface-3 text-text' : 'hover:text-text'}`}>{ichki}</button>
            : <span key={s.kalit} className="inline-flex items-center gap-1.5">{ichki}</span>;
        })}
      </div>
    </section>
  );
}

export function OpsQidiruv({ qiymat, onChange, placeholder }: { qiymat: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block w-full max-w-sm">
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" aria-hidden="true" />
      <input type="search" value={qiymat} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="h-8 w-full pl-8 pr-2 text-[13px]" />
    </label>
  );
}

/** Kichik chiziq (0..1); null — «—». */
export function OpsChiziq({ ulush, rang = 'var(--accent)', belgi, title }: { ulush: number | null; rang?: string; belgi?: number | null; title?: string }) {
  if (ulush == null) return <span className="text-text-mute" title={title}>—</span>;
  return (
    <span className="relative block h-1.5 w-full min-w-[64px] overflow-hidden rounded-sm" style={{ background: 'var(--surface-3)' }} title={title} aria-hidden="true">
      <i className="absolute inset-y-0 left-0" style={{ width: `${ulush * 100}%`, background: rang }} />
      {belgi != null && <i className="absolute -inset-y-px w-0.5" style={{ left: `calc(${belgi * 100}% - 1px)`, background: 'var(--text-dim)' }} />}
    </span>
  );
}

/** Modal oyna: role=dialog + aria-modal, Esc va fon bosilganda yopiladi, birinchi maydonga fokus. */
export function OpsOyna({ ochiq, sarlavha, onYop, children, amallar, kenglik = 480, band = false, ikon }: {
  ochiq: boolean; sarlavha: ReactNode; onYop: () => void; children: ReactNode; amallar?: ReactNode; kenglik?: number; band?: boolean; ikon?: ReactNode;
}) {
  const id = useId();
  const quti = useRef<HTMLDivElement>(null);
  const yopRef = useRef(onYop);
  const bandRef = useRef(band);
  useEffect(() => { yopRef.current = onYop; bandRef.current = band; });
  useEffect(() => {
    if (!ochiq) return;
    const oldingi = document.activeElement as HTMLElement | null;
    const birinchi = quti.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button:not([data-yop])');
    birinchi?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !bandRef.current) { e.preventDefault(); yopRef.current(); } };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); oldingi?.focus?.(); };
  }, [ochiq]);
  if (!ochiq) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !band) onYop(); }}>
      <div ref={quti} role="dialog" aria-modal="true" aria-labelledby={id} className="fz-card flex max-h-[88vh] w-full flex-col" style={{ maxWidth: kenglik, boxShadow: 'var(--shadow-pop)' }}>
        <div className="fz-card__head">
          <h2 id={id} className="fz-card__title inline-flex items-center gap-2 [&_svg]:h-4 [&_svg]:w-4">{ikon}{sarlavha}</h2>
          <button type="button" data-yop className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={onYop} disabled={band} aria-label={t('Yopish')}><X /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-5">{children}</div>
        {amallar && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{amallar}</div>}
      </div>
    </div>
  );
}

/** Forma maydoni: yorliq + kiritma. */
export function OpsMaydon({ nom, majburiy, children, izoh }: { nom: string; majburiy?: boolean; children: ReactNode; izoh?: string }) {
  return (
    <label className="block text-[12px] font-medium text-text-dim">
      <span>{nom}{majburiy && <span className="ml-0.5 text-danger">*</span>}</span>
      <span className="mt-1 block [&_input]:h-8 [&_input]:w-full [&_input]:px-2 [&_input]:text-[13px] [&_select]:h-8 [&_select]:w-full [&_select]:px-2 [&_select]:text-[13px] [&_textarea]:w-full [&_textarea]:px-2 [&_textarea]:py-1.5 [&_textarea]:text-[13px]">{children}</span>
      {izoh && <span className="mt-0.5 block text-[11px] font-normal text-text-mute">{izoh}</span>}
    </label>
  );
}

/** Jadvaldagi bo'sh holat qatori. */
export function OpsBoshQator({ ustun, matn, izoh }: { ustun: number; matn: string; izoh?: string }) {
  return (
    <tr><td colSpan={ustun} className="py-10 text-center">
      <span className="block text-[13px] text-text-dim">{matn}</span>
      {izoh && <span className="mt-1 block text-[12px] text-text-mute">{izoh}</span>}
    </td></tr>
  );
}
