import { useState } from 'react';
import { t } from '../../i18n/til';
import type { Occurrence, WorkCoefficient } from '../../lib/smeta-studio/model';
import { coefficientPreview } from '../../lib/smeta-studio/koef-review';

export function CoefficientPreview({ work, coefficients, evidence, onApply, onClose }: {
  work: Occurrence; coefficients: WorkCoefficient[]; evidence: string;
  onApply: () => void; onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const p = coefficientPreview(work, coefficients);
  const value = (v: string | null) => v ?? t('Noma’lum');
  return <div role="region" aria-label={t('Koeffitsient ta’siri')} className="mt-2 space-y-2 rounded border border-accent/40 p-2">
    <p className="font-medium">{t('Qo‘llashdan oldin tekshiring')}</p>
    <p>{evidence}</p>
    <p className="text-text-mute">{t('Boshqa qabul qilingan koeffitsientlar ham hisobga olingan. Shartlarning birga qo‘llanishini tekshiring.')}</p>
    <p>{t('Jami')}: {value(p.before.amount)} → {value(p.after.amount)}</p>
    {(p.before.unresolved > 0 || p.after.unresolved > 0) && <p className="text-warn">{t('Hisob to‘liq emas: noma’lum qiymatlar saqlanadi.')} {t('Ma’lum qism')}: {p.before.knownAmount} → {p.after.knownAmount}</p>}
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-left text-xs"><thead><tr><th>{t('Resurs')}</th><th>{t('Oldingi hajm')}</th><th>{t('Keyingi hajm')}</th><th>{t('Oldingi summa')}</th><th>{t('Keyingi summa')}</th></tr></thead>
        <tbody>{p.lines.map(l => <tr key={l.id} className={l.changed ? 'text-accent' : 'text-text-mute'}><td>{l.name}</td><td>{value(l.beforeQuantity)}</td><td>{value(l.afterQuantity)}</td><td>{value(l.beforeAmount)}</td><td>{value(l.afterAmount)}</td></tr>)}</tbody>
      </table>
    </div>
    <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('Ushbu shart va boshqa koeffitsientlar bilan birga qo‘llanishini tekshirdim.')}</label>
    <button type="button" className="tugma" disabled={!confirmed} onClick={onApply}>{t('Qoralamaga qo‘llash')}</button>
    <button type="button" className="tugma ml-2" onClick={onClose}>{t('Yopish')}</button>
  </div>;
}
