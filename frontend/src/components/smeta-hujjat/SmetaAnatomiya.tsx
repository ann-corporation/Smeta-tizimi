import { Fragment, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TreeNode } from '../../api/types';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { katKesimYigish } from '../../lib/ustamali-summa';
import { KAT_GURUH_NOMI } from '../../lib/f2-hujjat-korinish';
import { barglar, bolimlarKorinishi, katSmeta, oshganQatorlar, umumiyKesim, type Kesim } from '../../lib/smeta-korinish';

/**
 * SMETA ANATOMIYASI (egasi 2026-10-25: «har bir smetani vizual ko'rib tushunish»): smeta qanday tuzilgan va qancha
 * bajarilganini bir ekranda ko'rsatadi — umumiy holat (smeta = 100%: F2 olingan / fakt bajarilgan / qoldiq),
 * kategoriya taqsimoti, bo'limlar kesimi va smetadan oshgan qatorlar. Manba — `useT2Daraxt().tree`, hisob
 * `lib/smeta-korinish` da. Holat sahifasiga (HolatNative) daraxt ustiga qo'yish uchun mo'ljallangan.
 */
function Chiziq({ k, katta = false }: { k: Kesim; katta?: boolean }) {
  const f2u = k.f2Ulush ?? 0, faktu = k.faktUlush ?? 0;
  const faktOrtiq = Math.max(0, faktu - f2u);
  const foiz = k.faktUlush == null ? null : Math.round(k.faktUlush * 100);
  const ulMatn = (x: number | null) => (x == null ? '—' : Math.round(x * 100) + '%');
  return (
    <span className={`fz-meter ${katta ? 'fz-meter--lg' : ''}`} title={t('F2 olingan: {f2} · bajarilgan: {fakt} · smeta: {s}', { f2: ulMatn(k.f2Ulush), fakt: ulMatn(k.faktUlush), s: '100%' })}>
      <span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${f2u * 100}%` }} /><i className="fz-meter__fakt" style={{ width: `${faktOrtiq * 100}%` }} /></span>
      <span className="fz-meter__f">{foiz == null ? '—' : `${foiz}%`}</span>
    </span>
  );
}

export function SmetaAnatomiya({ tree, obyektId }: { tree: readonly TreeNode[]; obyektId: number | null }) {
  const umumiy = useMemo(() => umumiyKesim(tree), [tree]);
  const bolimlar = useMemo(() => bolimlarKorinishi(tree), [tree]);
  const kat = useMemo(() => katSmeta(tree), [tree]);
  const diqqat = useMemo(() => oshganQatorlar(tree), [tree]);
  const daraxtKesim = useMemo(() => katKesimYigish([...barglar(tree)].filter((b) => b.type !== 'rz' && b.type !== 'bl'), (b) => b.kat, (b) => b.smeta), [tree]);
  // Svod yaxlit belgili obyektda butun smeta ustamalisi — server kesimi (yaxlit bo'limlar ustamasiz, QQS bir marta).
  const kesim = useUstamaliSumma(obyektId).obyektKesim ?? daraxtKesim;
  if (!tree.length) return null;
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const toliqEmas = umumiy.toliq ? null : t('To‘liq emas: {s} bo‘limda smeta, {f} da fakt, {f2} da F2 summasi noma’lum — ko‘rsatilgan qiymat faqat ma’lum qismlar yig‘indisi', { s: umumiy.nomalum.smeta, f: umumiy.nomalum.fakt, f2: umumiy.nomalum.f2 });
  const nomalumBelgi = (soni: number) => (soni > 0 ? <span className="fz-chip fz-chip--warn" title={toliqEmas ?? undefined}>{t('qisman')}</span> : null);

  return (
    <section className="fz-doc" aria-label={t('Smeta anatomiyasi')}>
      <div className="fz-doc__sheet">
        <div className="fz-kpis">
          <div className="fz-kpi"><span className="fz-kpi__label">{t('Smeta qiymati')}</span><SummaJuft obyektId={obyektId} ustamasiz={umumiy.smeta} katKesim={kesim} className="[&_[data-testid=summa-ustamali]]:text-[20px] [&_[data-testid=summa-ustamali]]:font-semibold" />{nomalumBelgi(umumiy.nomalum.smeta)}</div>
          <div className="fz-kpi"><span className="fz-kpi__label"><i className="fz-bg-nomalum" style={{ background: 'var(--info)' }} />{t('Bajarilgan (fakt)')}</span><span className="fz-kpi__value"><FmtN val={umumiy.fakt} kasr={0} />{nomalumBelgi(umumiy.nomalum.fakt)}</span><span className="fz-kpi__sub">{pct(umumiy.faktUlush)} {t('smetadan')}</span></div>
          <div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: 'var(--accent)' }} />{t('F2 bilan topshirilgan')}</span><span className="fz-kpi__value"><FmtN val={umumiy.f2} kasr={0} />{nomalumBelgi(umumiy.nomalum.f2)}</span><span className="fz-kpi__sub">{pct(umumiy.f2Ulush)} {t('smetadan')}</span></div>
          <div className="fz-kpi"><span className="fz-kpi__label"><i style={{ background: 'var(--surface-3)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />{t('Qoldiq')}</span><span className="fz-kpi__value"><FmtN val={umumiy.qoldiq} kasr={0} />{nomalumBelgi(umumiy.nomalum.smeta + umumiy.nomalum.fakt + umumiy.nomalum.f2)}</span><span className="fz-kpi__sub">{t('bajarilmagan qism (ustamasiz)')}</span></div>
        </div>
        <Chiziq k={umumiy} katta />
        {toliqEmas && <p className="fz-note fz-note--warn" role="note"><AlertTriangle aria-hidden="true" />{toliqEmas}</p>}
        <div className="fz-doc__meta"><span>{t('{n} bo‘lim', { n: bolimlar.length })}</span><span>{t('{n} ish', { n: bolimlar.reduce((a, b) => a + b.ishSoni, 0) })}</span><span>{t('{n} resurs', { n: bolimlar.reduce((a, b) => a + b.resursSoni, 0) })}</span>{diqqat.length > 0 && <span className="fz-chip fz-chip--warn">{t('{n} qator smetadan oshgan', { n: bolimlar.reduce((a, b) => a + b.oshgan, 0) })}</span>}</div>
      </div>

      <div className="fz-doc__panels">
        <section className="fz-panel" aria-label={t('Kategoriyalar')}>
          <div className="fz-panel__h"><span>{t('Smeta tarkibi')}</span><span>{t('ustamasiz')}</span></div>
          <div className="fz-split" role="img" aria-label={kat.qismlar.map((k) => `${t(KAT_GURUH_NOMI[k.guruh])} ${pct(k.ulush)}`).join(', ')}>
            {kat.qismlar.map((k) => <i key={k.guruh} className={`fz-bg-${k.guruh}`} style={{ flexGrow: Math.max(k.ulush, 0.002) }} />)}
          </div>
          <div className="fz-legend">
            {kat.qismlar.map((k) => (<Fragment key={k.guruh}>
              <i className={`fz-bg-${k.guruh}`} style={{ width: 10, height: 10, borderRadius: 2, display: 'block' }} />
              <span>{t(KAT_GURUH_NOMI[k.guruh])}</span>
              <span className="fz-c-num"><FmtN val={k.summa} kasr={0} /></span>
              <small>{pct(k.ulush)}</small>
            </Fragment>))}
          </div>
          {kat.summasiz > 0 && <span className="fz-chip fz-chip--warn">{t('{n} resursda summa yo‘q', { n: kat.summasiz })}</span>}
        </section>

        <section className="fz-panel" aria-label={t('Smetadan oshgan qatorlar')}>
          <div className="fz-panel__h"><span>{t('Diqqat: smetadan oshgan')}</span><span>{diqqat.length}</span></div>
          {diqqat.length === 0
            ? <div className="fz-check"><div className="fz-check__q fz-check__q--ok"><AlertTriangle aria-hidden="true" style={{ visibility: 'hidden' }} /><span>{t('Hech bir qator smeta hajmidan oshmagan')}</span></div></div>
            : <div className="fz-bars">{diqqat.map((d, i) => (
              <div key={i} className="fz-bars__q" title={d.bolim}>
                <span>{d.kod && <span className="fz-c-shifr" style={{ marginRight: 6 }}>{d.kod}</span>}{d.nom}</span>
                <b className="text-warn">{Math.round(d.foiz)}%</b>
                <span style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--text-mute)' }}><FmtN val={d.faktHajm} /> / <FmtN val={d.smetaHajm} /> {d.birlik ?? ''}</span>
              </div>))}
            </div>}
        </section>
      </div>

      <section className="fz-panel" aria-label={t('Bo‘limlar')}>
        <div className="fz-panel__h"><span>{t('Bo‘limlar kesimi')}</span><span className="flex gap-3"><span><i className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--accent)' }} /> F2</span><span><i className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--info)' }} /> {t('fakt')}</span></span></div>
        <div>
          {bolimlar.map((b) => (
            <div key={b.id} className="fz-bolim">
              <div className="fz-bolim__nom"><b title={b.nom}>{b.nom || t('Nomsiz bo‘lim')}</b>
                <small>{t('{n} ish', { n: b.ishSoni })} · {t('{n} resurs', { n: b.resursSoni })}{b.oshgan > 0 && <span className="fz-chip fz-chip--warn">{t('{n} oshgan', { n: b.oshgan })}</span>}{b.zamena > 0 && <span className="fz-chip fz-chip--accent">{t('zamena {n}', { n: b.zamena })}</span>}{b.qoshimcha > 0 && <span className="fz-chip fz-chip--accent">{t('qo‘shimcha {n}', { n: b.qoshimcha })}</span>}</small>
              </div>
              <Chiziq k={b} />
              <div className="fz-bolim__sum"><FmtN val={b.smeta} kasr={0} /><small>{t('qoldiq')}: <FmtN val={b.qoldiq} kasr={0} /></small></div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
