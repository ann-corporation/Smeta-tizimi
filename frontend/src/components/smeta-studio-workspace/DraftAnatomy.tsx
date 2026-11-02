import { useMemo } from 'react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { KAT_GURUH_NOMI } from '../../lib/f2-hujjat-korinish';
import { foiz, qoralamaKesimi } from './draft-kesim';

type UnitText = Parameters<typeof qoralamaKesimi>[2];

/**
 * Qoralama anatomiyasi: smeta ostida nima borligi bir qarashda — kategoriya bo‘yicha taqsimot (fz-split),
 * hisoblangan qatorlar ulushi (fz-meter) va nima yetishmayotgani. Hammasi `calcDoc` natijasidan; yangi formula yo‘q.
 */
export function DraftAnatomy({ doc, calculation, unitText }: { doc: EstimateDoc; calculation: DocCalc; unitText?: UnitText }) {
  const k = useMemo(() => qoralamaKesimi(doc, calculation, unitText), [doc, calculation, unitText]);
  const works = Object.values(doc.occurrences);
  if (!works.length) return null;
  const hajmsiz = works.filter(w => w.quantity == null).length;
  const hisoblangan = k.qator - k.summasiz;
  const tayyor = k.qator > 0 ? hisoblangan / k.qator : 0;
  const bolim = Object.keys(doc.sections).length;
  return <section className="fz-card studio-anatomy" aria-label={t('Qoralama tarkibi')}>
    <div className="studio-anatomy__grid">
      <div className="studio-anatomy__split">
        <span className="fz-panel__h">{t('Kategoriya bo‘yicha taqsimot')}<span>{k.jami > 0 ? <FmtN val={k.jami} kasr={0} /> : '—'} {doc.currency}</span></span>
        {k.qismlar.length ? <>
          <div className="fz-split" role="img" aria-label={k.qismlar.map(q => `${t(KAT_GURUH_NOMI[q.guruh])} ${foiz(q.ulush)}`).join(', ')}>
            {k.qismlar.map(q => <i key={q.guruh} className={`fz-bg-${q.guruh}`} style={{ flexGrow: Math.max(q.ulush, 0.002) }} />)}
          </div>
          <div className="studio-anatomy__legend">
            {k.qismlar.map(q => <span key={q.guruh}><i className={`fz-bg-${q.guruh}`} />{t(KAT_GURUH_NOMI[q.guruh]).split(' — ')[0]} <b><FmtN val={q.summa} kasr={0} /></b> <small>{foiz(q.ulush)}</small></span>)}
          </div>
        </> : <p className="studio-anatomy__empty">{t('Hali birorta qatorning summasi hisoblanmagan — hajm va narxlarni kiriting.')}</p>}
      </div>
      <div className="studio-anatomy__kpi">
        <span className="fz-panel__h">{t('Hisoblash to‘liqligi')}</span>
        <span className="fz-meter" title={t('Summasi hisoblangan resurs qatorlari: {a} / {b}', { a: hisoblangan, b: k.qator })}>
          <span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${tayyor * 100}%` }} /></span>
          <span className="fz-meter__f">{k.qator ? foiz(tayyor) : '—'}</span>
        </span>
        <span className="studio-anatomy__chips">
          <span className="fz-chip">{t('{n} ta ish', { n: works.length })}</span>
          <span className="fz-chip">{t('{n} ta bo‘lim', { n: bolim })}</span>
          {hajmsiz > 0 && <span className="fz-chip fz-chip--warn">{t('hajmsiz: {n}', { n: hajmsiz })}</span>}
          {k.summasiz > 0 && <span className="fz-chip fz-chip--warn">{t('summasi noma’lum qator: {n}', { n: k.summasiz })}</span>}
          {hajmsiz === 0 && k.summasiz === 0 && <span className="fz-chip fz-chip--accent">{t('hammasi hisoblangan')}</span>}
        </span>
      </div>
    </div>
  </section>;
}
