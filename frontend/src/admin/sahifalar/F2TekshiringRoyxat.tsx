/**
 * «Tekshiring» — F2 importda avto-moslashdan keyin odam ko'zi kerak bo'lgan QISQA ro'yxat: ◐ taklif (tasdiqlang) va ✕ topilmadi.
 * Ishonchli (✓ aniq / xotira) bog'lanishlar o'zi qabul qilingan; ularni uzish — «Avto bog'lanishlarni uzish» / «Orqaga».
 * Faqat ko'rsatadi: hech narsa yozmaydi.
 */
import { korinish, type IshJoyi } from '../../lib/f2-moslash-v3/ishJoyi';
import type { F2Tugun } from '../../lib/smeta-anatomiya/f2';
import { t } from '../../i18n/til';

const KO_RSAT = 8;

/** Ro'yxatga kiradigan qatorlar: ish (bl) va mustaqil resurslar (ota — razdel yoki yo'q); ish ichidagi resurslar ish bilan birga hal bo'ladi. */
type Tek = { f: F2Tugun; holat: 'taklif' | 'topilmadi' };
export function tekshiringQatorlari(qatorlar: readonly F2Tugun[], ota: ReadonlyMap<string, F2Tugun | null>, ij: IshJoyi): Tek[] {
  const out: Tek[] = [];
  for (const f of qatorlar) {
    const o = ota.get(f.uid) ?? null;
    if (f.tur !== 'bl' && o != null && o.tur !== 'rz') continue;
    const h = korinish(ij, f.uid);
    if (h === 'taklif' || h === 'topilmadi') out.push({ f, holat: h });
  }
  return out;
}

function yana(jami: number) {
  if (jami <= KO_RSAT) return null;
  return <p className="m-0 text-text-mute">{t('Yana {n} ta — pastdagi ro‘yxatda.', { n: jami - KO_RSAT })}</p>;
}

export function F2TekshiringRoyxat({ qatorlar, ota, ij }: { qatorlar: readonly F2Tugun[]; ota: ReadonlyMap<string, F2Tugun | null>; ij: IshJoyi }) {
  const royxat = tekshiringQatorlari(qatorlar, ota, ij);
  const taklif = royxat.filter((x) => x.holat === 'taklif').length;
  const topilmadi = royxat.length - taklif;
  if (royxat.length === 0) {
    return <section className="fz-note" data-testid="f2-tekshiring" aria-label={t('Tekshiring')}><span>{t('Avto-moslash: hamma ish ishonchli bog‘landi (✓). Tekshiradigan qator yo‘q.')}</span></section>;
  }
  const korsat = [...royxat].sort((a, b) => Number(a.holat === 'taklif') - Number(b.holat === 'taklif')).slice(0, KO_RSAT);
  return (
    <section className="karta space-y-1.5 border border-warn/40 p-3 text-[12px]" data-testid="f2-tekshiring" aria-label={t('Tekshiring')}>
      <p className="m-0 font-semibold text-text">{t('Tekshiring: ◐ {a} taklif · ✕ {b} topilmadi', { a: taklif, b: topilmadi })}</p>
      <p className="m-0 text-text-dim">{t('Ishonchli moslar o‘zi bog‘landi (✓). Quyidagilarni pastdagi ro‘yxatda tasdiqlang yoki qo‘lda bog‘lang; yozish faqat siz tasdiqlaganingizda.')}</p>
      <ul className="m-0 list-none space-y-0.5 p-0">
        {korsat.map(({ f, holat }) => (
          <li key={f.uid} className="flex items-baseline gap-2" data-testid="f2-tekshiring-qator">
            <span className={holat === 'taklif' ? 'text-warn' : 'text-danger'} aria-hidden="true">{holat === 'taklif' ? '◐' : '✕'}</span>
            <span className="min-w-0 flex-1 truncate" title={f.nom}>{f.kod ? `${f.kod} ` : ''}{f.nom}</span>
          </li>
        ))}
      </ul>
      {yana(royxat.length)}
    </section>
  );
}
