import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import type { F2Baho } from '../../lib/hisob-yadro';
import type { PereraschetBaho } from '../../lib/f2-pereraschet';

/**
 * PERERASCHET jami paneli (egasi 2026-11-03): eski F2 lar (minus) / yangi qatorlar / sof jami — har biri QQS bilan (asosiy),
 * ustamali (QQS siz) va ustamasiz. Hisob yagona yadro (`f2Baholash`), bu yerda arifmetika yo'q. Noma'lum — «noma'lum», 0 emas.
 */
const Son = ({ v }: { v: number | null | undefined }) => (v == null ? <span className="text-warn">{t('noma‘lum')}</span> : <FmtN val={v} />);

function Qator({ nom, b, kuchli = false, testid }: { nom: string; b: F2Baho | null; kuchli?: boolean; testid: string }) {
  return (
    <tr data-testid={testid} className={kuchli ? 'border-t border-border font-semibold' : 'border-t border-border/40'}>
      <td className="p-1.5">{nom}</td>
      <td className="p-1.5 text-right tabular-nums" data-testid={`${testid}-qqs-bilan`}>{b ? <Son v={b.qqsBilan} /> : '—'}</td>
      <td className="p-1.5 text-right tabular-nums text-text-dim" data-testid={`${testid}-ustamali`}>{b ? <Son v={b.ustamali} /> : '—'}</td>
      <td className="p-1.5 text-right tabular-nums text-text-dim" data-testid={`${testid}-ustamasiz`}>{b ? <Son v={b.ustamasiz} /> : '—'}</td>
    </tr>
  );
}

export function PereraschetPanel({ baho }: { baho: PereraschetBaho }) {
  return (
    <section aria-label={t('Pereraschet jami')} data-testid="pereraschet-panel" className="fz-card space-y-2 p-3 text-[12.5px]">
      <h3 className="m-0 text-[13px] font-semibold">{t('Pereraschet: bitta F2 hujjat (yangi − eski)')}</h3>
      <table className="w-full">
        <thead className="text-left text-text-dim">
          <tr><th className="p-1.5" /><th className="p-1.5 text-right">{t('QQS bilan')}</th><th className="p-1.5 text-right">{t('Ustamali (QQS siz)')}</th><th className="p-1.5 text-right">{t('Ustamasiz')}</th></tr>
        </thead>
        <tbody>
          {baho.bloklar.map(({ blok, hujjatPodvali, baho: b }) => (
            <Qator key={blok.manbaAktId} testid={`pereraschet-blok-${blok.manbaAktId}`} b={b}
              nom={`${t('Сторно Ф-2 №{r}', { r: blok.raqam || String(blok.manbaAktId) })} · ${t('{n} qator', { n: blok.qatorlar.length })} · ${hujjatPodvali ? t('hujjat podvali') : t('smeta podvali')}`} />
          ))}
          <Qator testid="pereraschet-eski" nom={t('Eski F2 lar (minus)')} b={baho.eski} kuchli />
          <Qator testid="pereraschet-yangi" nom={t('Yangi qatorlar (smeta podvali)')} b={baho.yangi} kuchli />
          <Qator testid="pereraschet-sof" nom={t('Sof jami (yangi − eski)')} b={baho.sof} kuchli />
        </tbody>
      </table>
      {baho.sof.nomalumBirlik > 0 && <p className="m-0 text-warn">{t('Ba‘zi qismlar uchun ustama foizi noma‘lum — jami hisoblanmadi.')}</p>}
    </section>
  );
}

export default PereraschetPanel;
