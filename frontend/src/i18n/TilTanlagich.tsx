import { Fragment, type ReactNode } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { TILLAR, useTil, useTilHolati, type Til } from './til';

/** Til tanlash: UZ (lotin) · ЎЗ (kirill) · RU · EN. Tanlov brauzerda saqlanadi. */
export function TilTanlagich({ ixcham = false }: { ixcham?: boolean }) {
  const { til, tilQoy, t } = useTil();
  const { kutilayotgan } = useTilHolati();
  return (
    <label className="inline-flex items-center gap-1 text-[12px] text-text-dim" title={t('Til')}>
      {/* ru/en lug'ati yuklanayotganda — kichik aylanuvchi belgi, tanlagich vaqtincha band. */}
      {kutilayotgan ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Languages size={14} aria-hidden />}
      <select value={kutilayotgan ?? til} onChange={(e) => tilQoy(e.target.value as Til)} aria-label={t('Til')}
        disabled={kutilayotgan !== null} aria-busy={kutilayotgan !== null}
        className="rounded-md border border-border bg-surface px-1.5 py-1 text-[12px] text-text outline-none focus:border-accent disabled:opacity-60">
        {TILLAR.map((x) => <option key={x.kod} value={x.kod}>{ixcham ? x.qisqa : x.nom}</option>)}
      </select>
    </label>
  );
}

/** Til almashganda (yoki lug'at kech kelganda) butun ichki daraxt qayta chiziladi — oddiy `t()` chaqiruvlari ham yangilanadi. */
export function TilChegarasi({ children }: { children: ReactNode }) {
  const { til } = useTil();
  const { tayyor } = useTilHolati();
  return <Fragment key={`${til}:${tayyor ? 1 : 0}`}>{children}</Fragment>;
}
