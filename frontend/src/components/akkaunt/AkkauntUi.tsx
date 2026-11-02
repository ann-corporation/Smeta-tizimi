/** Akkaunt markazi uchun umumiy bo‘laklar: karta, qator, skeleton, xato+qayta urinish, forma maydoni. */
import { useId, type ReactNode } from 'react';
import { AlertTriangle, Clock, Info, RefreshCw } from 'lucide-react';
import { t } from '../../i18n/til';

export const INPUT_SINF = 'w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[13px] text-text outline-none focus:border-[var(--accent)] disabled:opacity-60';
export const INPUT_STIL = { height: 'var(--control-md)' } as const;

export function Karta({ sarlavha, tavsif, children, amal }: { sarlavha: string; tavsif?: string; children: ReactNode; amal?: ReactNode }) {
  return (
    <section className="fz-card">
      <header className="px-4 pt-4 pb-2 flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1" style={{ minWidth: 'min(100%, 180px)' }}>
          <h3 className="text-[14px] font-semibold text-text m-0">{t(sarlavha)}</h3>
          {tavsif && <p className="text-[12px] text-text-dim mt-1 mb-0">{t(tavsif)}</p>}
        </div>
        {amal}
      </header>
      <div className="px-4 pb-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Qator({ yorliq, qiymat }: { yorliq: string; qiymat: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] last:border-0 py-2">
      <span className="text-[12px] text-text-dim shrink-0">{t(yorliq)}</span>
      <span className="text-[13px] text-text text-right min-w-0 break-words">{qiymat}</span>
    </div>
  );
}

export function Tezorada({ matn }: { matn: string }) {
  const sarlavha = t('Tez orada');
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-[var(--border-strong)] p-3 text-[12px] text-text-dim">
      <Clock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span><b className="text-text">{sarlavha}</b> — {t(matn)}</span>
    </div>
  );
}

export function Nota({ tur, children }: { tur: 'warn' | 'info' | 'danger'; children: ReactNode }) {
  const Ikon = tur === 'info' ? Info : AlertTriangle;
  return (
    <div role={tur === 'danger' ? 'alert' : 'note'} className={`fz-note fz-note--${tur}`}>
      <Ikon aria-hidden="true" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function Skelet({ qatorlar = 3 }: { qatorlar?: number }) {
  return (
    <div className="fz-card p-4 flex flex-col gap-3" aria-busy="true" aria-label={t('Yuklanmoqda…')} role="status">
      {Array.from({ length: qatorlar }, (_, i) => (
        <div key={i} className="skel rounded-md" style={{ height: i === 0 ? 20 : 14, width: i === 0 ? '40%' : `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function XatoQayta({ matn, onQayta }: { matn: string; onQayta: () => void }) {
  return (
    <div role="alert" className="fz-note fz-note--danger items-center">
      <AlertTriangle aria-hidden="true" />
      <span className="flex-1 min-w-0">{matn}</span>
      <button type="button" className="fz-btn fz-btn--sm" onClick={onQayta}><RefreshCw aria-hidden="true" />{t('Qayta urinish')}</button>
    </div>
  );
}

export function Maydon({ yorliq, xato, yordam, children }: {
  yorliq: string; xato?: string | null; yordam?: string; children: (p: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const izohId = xato || yordam ? `${id}-izoh` : undefined;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="text-[12px] text-text-dim">{yorliq}</label>
      {children({ id, 'aria-invalid': !!xato, 'aria-describedby': izohId })}
      {xato && <span id={izohId} role="alert" className="text-[12px] text-[var(--danger)]">{xato}</span>}
      {!xato && yordam && <span id={izohId} className="text-[11px] text-text-mute">{yordam}</span>}
    </div>
  );
}
