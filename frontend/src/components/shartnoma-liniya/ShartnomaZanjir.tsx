/**
 * SHARTNOMA ZANJIRI — vizual quvur: Shartnoma/DS → F2 (tasdiqlangan) → F3 (sotuv) → To'lov → Akt-sverka.
 * Ma'lumot: /api/sb `shartnoma_svod_v1` + lib/nakopitelniy-svod (hisob o'zgarmaydi). Tafsilot va yozish — Nakopitelniy sahifasida.
 */
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ChevronRight } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { somga, type ShartnomaSvodi, type SvodJami } from '../../lib/nakopitelniy-svod';
import { hisobChizigi, qoldiqMazmuni } from '../../lib/shartnoma-zanjir-korinish';

const Pul = ({ v }: { v: number | null | undefined }) => (v == null ? <span className="text-text-mute">—</span> : <FmtN val={v} kasr={0} />);

/** Kompaniya bo'yicha jami (shartnomalar svodi). */
export function ZanjirKpi({ jami, soni }: { jami: SvodJami; soni: number }) {
  const qoldiq = qoldiqMazmuni(jami.qoldiq);
  const qoldiqIzoh = qoldiq === 'buyurtmachi_qarzi' ? t('buyurtmachi qarzi') : qoldiq === 'avans' ? t('ishlanmagan avans') : t('teng');
  const k = (rang: string | null, label: string, value: ReactNode, sub: ReactNode) => (
    <div className="fz-kpi" key={label}>
      <span className="fz-kpi__label">{rang && <i style={{ background: rang }} />}{label}</span>
      <span className="fz-kpi__value">{value}</span>
      <span className="fz-kpi__sub">{sub}</span>
    </div>
  );
  return (
    <section className="fz-card p-4" aria-label={t('Shartnomalar bo‘yicha jami')}>
      <div className="fz-kpis">
        {k('var(--text-dim)', t('Shartnomalar (DS bilan)'), <Pul v={somga(jami.shartnomaSumma)} />, jami.shartnomaNomalum > 0 ? t('{n} ta shartnoma · {m} tasida summa yo‘q', { n: soni, m: jami.shartnomaNomalum }) : t('{n} ta shartnoma · QQS bilan', { n: soni }))}
        {k('var(--border-strong)', t('F2 tasdiqlangan'), <Pul v={somga(jami.f2)} />, t('ustamasiz — boshqa daraja'))}
        {k('var(--accent)', t('F3 (sotuv)'), <Pul v={somga(jami.f3)} />, t('QQS bilan'))}
        {k('var(--ok)', t('To‘lov'), <Pul v={somga(jami.tolov)} />, t('avans + to‘lov − qaytarim'))}
        {k(qoldiq === 'buyurtmachi_qarzi' ? 'var(--warn)' : 'var(--info)', t('Akt-sverka qoldig‘i'), <Pul v={somga(jami.qoldiq)} />, qoldiqIzoh)}
      </div>
    </section>
  );
}

/** Ro'yxatdagi shartnoma uchun ixcham chiziq: shartnoma = 100%, to'langan + to'lanmagan F3. */
export function HisobMeterIxcham({ sv }: { sv: ShartnomaSvodi }) {
  const c = hisobChizigi(sv);
  if (c.foiz == null) return <span className="text-[11.5px] text-text-mute">{t('F3: {s} · shartnoma summasi yo‘q', { s: c.f3.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) })}</span>;
  return (
    <span className={`fz-meter ${c.oshdi ? 'fz-meter--over' : ''}`} title={t('Shartnoma {sh} · F3 {f3} · to‘lov {tl}', { sh: fmt(c.shartnoma), f3: fmt(c.f3), tl: fmt(c.tolov) })}>
      <span className="fz-meter__t">
        <i style={{ width: `${c.tolovUlush * 100}%`, background: 'var(--ok)' }} />
        <i className="fz-meter__shu" style={{ width: `${c.qarzUlush * 100}%` }} />
      </span>
      <span className="fz-meter__f">{t('F3 {p}%', { p: Math.round(c.foiz) })}</span>
    </span>
  );
}
const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }));

/** To'liq quvur: 5 bosqich, har birida summa va izoh; ostida «hisoblanmagan qoldiq» chizig'i va ogohlantirishlar. */
export function ShartnomaZanjir({ sv }: { sv: ShartnomaSvodi }) {
  const c = hisobChizigi(sv);
  const q = qoldiqMazmuni(sv.qoldiq);
  const dsIzoh = sv.joriy.manba === 'ds' && sv.joriy.ds ? t('DS № {r} dan ({s})', { r: sv.joriy.ds.raqam, s: sv.joriy.ds.sana.slice(0, 10) }) : sv.joriy.manba === 'shartnoma' ? t('asl shartnoma summasi') : t('summa kiritilmagan');
  const bosqichlar: { kalit: string; nom: string; qiymat: number | null; izoh: string; rang: string; holat?: 'warn' }[] = [
    { kalit: 'sh', nom: t('Shartnoma / DS'), qiymat: c.shartnoma, izoh: dsIzoh, rang: 'var(--text-dim)', holat: c.shartnoma == null ? 'warn' : undefined },
    { kalit: 'f2', nom: t('F2 tasdiqlangan'), qiymat: somga(sv.f2), izoh: t('{n} ta akt · ustamasiz', { n: sv.f2Soni }), rang: 'var(--border-strong)', holat: sv.f2SummasizSoni ? 'warn' : undefined },
    { kalit: 'f3', nom: t('F3 (sotuv)'), qiymat: c.f3, izoh: t('{n} ta · {m} tasi imzolangan', { n: sv.f3Soni, m: sv.f3Imzolangan }), rang: 'var(--accent)', holat: sv.f3Soni > sv.f3Imzolangan || c.oshdi ? 'warn' : undefined },
    { kalit: 'tl', nom: t('To‘lov'), qiymat: c.tolov, izoh: t('{n} ta to‘lov yozuvi', { n: sv.shartnoma.tolovlar.length }), rang: 'var(--ok)' },
    { kalit: 'sv', nom: t('Akt-sverka qoldig‘i'), qiymat: somga(sv.qoldiq), izoh: q === 'buyurtmachi_qarzi' ? t('buyurtmachi qarzi') : q === 'avans' ? t('ishlanmagan avans') : t('hisob teng'), rang: q === 'buyurtmachi_qarzi' ? 'var(--warn)' : 'var(--info)' },
  ];
  return (
    <section className="fz-panel" aria-label={t('Shartnoma zanjiri')}>
      <div className="fz-panel__h"><span>{t('Shartnoma zanjiri')}</span><span>{t('QQS bilan, so‘m')}</span></div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(5,minmax(0,1fr))]">
        {bosqichlar.map((b, i) => (
          <Fragment key={b.kalit}>
            <li className="relative flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-surface-2 px-2.5 py-2" style={{ borderTop: `3px solid ${b.rang}` }}>
              <span className="flex items-start gap-1 text-[10.5px] font-semibold uppercase leading-tight tracking-wide text-text-mute"><span className="shrink-0 tabular-nums">{i + 1}</span><span className="min-w-0">{b.nom}</span></span>
              <b className="truncate text-[15px] tabular-nums text-text"><Pul v={b.qiymat} /></b>
              <span className={`text-[11.5px] ${b.holat === 'warn' ? 'text-warn' : 'text-text-mute'}`}>{b.izoh}</span>
              {i < bosqichlar.length - 1 && <ChevronRight aria-hidden="true" size={14} className="absolute -right-[11px] top-1/2 z-10 hidden -translate-y-1/2 text-text-mute sm:block" />}
            </li>
          </Fragment>
        ))}
      </ol>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-text-dim">
          <span>{t('Shartnoma bo‘yicha hisob (F3) holati')}</span>
          <span>{t('Hisoblanmagan qoldiq')}: <b className={c.qolgan != null && c.qolgan < 0 ? 'text-warn' : 'text-text'}><Pul v={c.qolgan} /></b></span>
        </div>
        {c.foiz == null ? <span className="text-[12px] text-text-mute">{t('Shartnoma summasi noma’lum — foiz hisoblanmaydi')}</span> : (
          <span className={`fz-meter fz-meter--lg ${c.oshdi ? 'fz-meter--over' : ''}`}>
            <span className="fz-meter__t">
              <i style={{ width: `${c.tolovUlush * 100}%`, background: 'var(--ok)' }} />
              <i className="fz-meter__shu" style={{ width: `${c.qarzUlush * 100}%` }} />
            </span>
            <span className="fz-meter__f">{Math.round(c.foiz)}%</span>
          </span>
        )}
        <span className="flex flex-wrap gap-x-3 text-[11.5px] text-text-mute">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: 'var(--ok)' }} />{t('to‘langan')}</span>
          <span className="inline-flex items-center gap-1"><i className="fz-meter__shu inline-block h-2 w-3 rounded-sm" />{t('hisoblangan, to‘lanmagan')}</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-surface-3" style={{ background: 'var(--surface-3)' }} />{t('hali hisoblanmagan')}</span>
        </span>
      </div>
      {sv.ogohlantirishlar.length > 0 && <div className="flex flex-col gap-1">
        {sv.ogohlantirishlar.map((o) => <p key={o.kod} className="fz-note fz-note--warn"><AlertTriangle aria-hidden="true" />{t(o.matn)}</p>)}
      </div>}
      <Link to="/admin/nakopitelniy" className="fz-btn fz-btn--ghost fz-btn--sm self-start"><ArrowRight aria-hidden="true" />{t('Nakopitelniy, F3 va akt-sverka — batafsil')}</Link>
    </section>
  );
}
