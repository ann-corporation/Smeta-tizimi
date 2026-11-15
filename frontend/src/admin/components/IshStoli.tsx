import { NavLink } from 'react-router-dom';
import { amalYoli, type IshStoliAmal, type IshStoliJavob } from '../../api/t2-ish-stoli';
import { t } from '../../i18n/til';

/**
 * ISH STOLI — serverdan kelgan deklarativ bo'limlarni chizadi (bir ta'rif: veb, Android, Windows, Telegram). Bo'lim turi
 * noma'lum bo'lsa parser uni allaqachon tashlagan; ma'lumot oqimi (royxat/kpi) uchun veb hozircha «Ochish» havolasini ko'rsatadi.
 */
export default function IshStoli({ d, onKabinet }: { d: IshStoliJavob; onKabinet: (id: string) => void }) {
  const amalOl = (id: string): IshStoliAmal | undefined => d.amallar.find((a) => a.id === id);
  return (
    <div className="mt-5 space-y-5" data-testid="ish-stoli" data-tomon={d.tomon} data-rejim={d.rejim}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-surface-2 px-2 py-1 text-[12px] font-semibold text-text" data-testid="ish-stoli-tomon">{t(d.tomon_nom)}</span>
        {d.kabinetlar.length > 1 && (
          <label className="flex items-center gap-2 text-[12px] text-text-dim">
            <span>{t('Kabinet')}</span>
            <select className="rounded-md border border-border bg-transparent px-2 py-1 text-sm text-text" value={d.joriy} onChange={(e) => onKabinet(e.target.value)} aria-label={t('Kabinetni almashtirish')}>
              {d.kabinetlar.map((c) => <option key={c.id} value={c.id}>{c.nom} — {t(c.tomon_nom)}</option>)}
            </select>
          </label>
        )}
      </div>
      {d.bolimlar.map((b) => {
        if (b.tur === 'matn') return <p key={b.id} className="text-sm text-text-dim">{t(b.matn ?? b.nom)}</p>;
        const hammasi = b.amal ? amalOl(b.amal) : undefined;
        const hammasiYol = hammasi ? amalYoli(hammasi) : null;
        return (
          <section key={b.id} data-testid={`ish-stoli-${b.id}`}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[.06em] text-text-mute">{t(b.nom)}</h2>
              {b.tur !== 'amallar' && hammasiYol && <NavLink to={hammasiYol} className="text-[12px] text-accent">{t('Ochish')}</NavLink>}
            </div>
            {b.tur === 'amallar' && (
              <div className={`grid gap-3 ${b.katta ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`} role="list">
                {(b.amallar ?? []).map((id) => amalOl(id)).filter((a): a is IshStoliAmal => !!a).map((a) => {
                  const yol = amalYoli(a);
                  if (!yol) return null;
                  return (
                    <NavLink key={a.id} to={yol} role="listitem" data-amal={a.id}
                      className={`karta flex flex-col justify-between p-4 transition-colors hover:border-accent ${b.katta ? 'min-h-[96px] text-[17px]' : 'min-h-[72px] text-[14px]'} ${a.birlamchi ? 'border-accent' : ''}`}>
                      <span className="font-semibold text-text">{t(a.nom)}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
