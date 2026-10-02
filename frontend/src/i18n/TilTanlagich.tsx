import { Fragment, type ReactNode } from 'react';
import { Languages } from 'lucide-react';
import { TILLAR, useTil, type Til } from './til';

/** Til tanlash: UZ (lotin) · ЎЗ (kirill) · RU · EN. Tanlov brauzerda saqlanadi. */
export function TilTanlagich({ ixcham = false }: { ixcham?: boolean }) {
  const { til, tilQoy, t } = useTil();
  return (
    <label className="inline-flex items-center gap-1 text-[12px] text-text-dim" title={t('Til')}>
      <Languages size={14} aria-hidden />
      <select value={til} onChange={(e) => tilQoy(e.target.value as Til)} aria-label={t('Til')}
        className="rounded-md border border-border bg-surface px-1.5 py-1 text-[12px] text-text outline-none focus:border-accent">
        {TILLAR.map((x) => <option key={x.kod} value={x.kod}>{ixcham ? x.qisqa : x.nom}</option>)}
      </select>
    </label>
  );
}

/** Til almashganda butun ichki daraxt qayta chiziladi — shuning uchun oddiy `t()` chaqiruvlari ham yangilanadi. */
export function TilChegarasi({ children }: { children: ReactNode }) {
  const { til } = useTil();
  return <Fragment key={til}>{children}</Fragment>;
}
