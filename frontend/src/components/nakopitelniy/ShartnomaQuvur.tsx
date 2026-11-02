import { Fragment, type CSSProperties } from 'react';
import { ChevronRight } from 'lucide-react';
import { t } from '../../i18n/til';
import { foizOl } from '../../lib/nakopitelniy-korinish';
import { somga } from '../../lib/nakopitelniy-svod';
import { ustamasizUchlik, type QiymatUchlik as Uchlik } from '../../lib/ustamali-summa';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';

/**
 * Shartnoma quvuri: DS (shartnoma summasi) → F2 → F3 (sotuv) → to'lov → qoldiq. Summalar TIYINDA (nakopitelniy-svod bilan bir xil).
 * F2 — nakrutkasiz (to'g'ri xarajat), F3/to'lov esa nakrutka + QQS bilan: shu sabab F2 uchun shartnomaga nisbatan foiz berilmaydi
 * (turli bazani solishtirish yolg'on tasavvur beradi). Noma'lum summa — «—», nol emas.
 * Egasi 2026-10-27 (QQS bilan — asosiy): F2 bosqichi yagona `QiymatUchlik` bilan — svodda kategoriya kesimi yo'q, shuning uchun
 * QQS bilan / ustamali «—» (izohi bilan), to'g'ri xarajat esa ostida.
 */
const QOLDIQ_RANG: Record<string, string> = { '1': 'var(--ok)', '-1': 'var(--danger)' };
const QOLDIQ_IZOH: Record<string, () => string> = { '1': () => t('mijoz qarzi (sotuv − to‘lov)'), '-1': () => t('ishlanmagan avans (to‘lov > sotuv)') };

type Bosqich = { kalit: string; nom: string; tiyin: number | null; izoh?: string; foiz?: number | null; rang: string; qoldiq?: boolean; uchlik?: Uchlik };

export function ShartnomaQuvur({ shartnoma, f2, f3, tolov, qoldiq, pul }: {
  shartnoma: number | null; f2: number; f3: number; tolov: number; qoldiq: number; pul: (x: number | null) => string;
}) {
  const ishora = String(Math.sign(qoldiq));
  const asos = shartnoma != null && shartnoma > 0 ? shartnoma : null;
  const nisbat = (x: number): number | null => (asos == null ? null : foizOl(x, asos));
  const bosqichlar: Bosqich[] = [
    { kalit: 'ds', nom: t('Shartnoma summasi (DS bilan)'), tiyin: shartnoma, rang: 'var(--border-strong)', foiz: asos == null ? null : 100 },
    { kalit: 'f2', nom: t('F2 tasdiqlangan'), tiyin: f2, rang: 'var(--accent)', izoh: t('nakrutkasiz — shartnomaga foiz berilmaydi'), uchlik: ustamasizUchlik(somga(f2)) },
    { kalit: 'f3', nom: t('Sotuv (F3)'), tiyin: f3, rang: 'var(--info)', foiz: nisbat(f3), izoh: t('shartnomaning {p}%', { p: nisbat(f3) ?? '—' }) },
    { kalit: 'tolov', nom: t('To‘lov'), tiyin: tolov, rang: 'var(--ok)', foiz: nisbat(tolov), izoh: t('sotuvning {p}%', { p: foizOl(tolov, f3) ?? '—' }) },
    { kalit: 'qoldiq', nom: t('Qoldiq'), tiyin: qoldiq, rang: QOLDIQ_RANG[ishora] ?? 'var(--border-strong)', qoldiq: true, izoh: QOLDIQ_IZOH[ishora]?.() ?? t('qarz yo‘q') },
  ];
  const chiziq = (b: Bosqich): CSSProperties => ({ width: `${Math.max(0, Math.min(100, b.foiz ?? 0))}%` });
  return (
    <div role="group" aria-label={t('Shartnoma quvuri: DS, F2, F3, to‘lov, qoldiq')} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 6 }}>
      {bosqichlar.map((b, i) => (
        <Fragment key={b.kalit}>
          {i > 0 && <ChevronRight aria-hidden size={18} style={{ alignSelf: 'center', color: 'var(--text-mute)', flexShrink: 0 }} />}
          <div className="fz-panel" style={{ flex: '1 1 150px', gap: 6, borderTop: `3px solid ${b.rang}` }}>
            <span className="fz-panel__h" style={{ justifyContent: 'flex-start' }}>{b.nom}</span>
            {b.uchlik ? <QiymatUchlik q={b.uchlik} yorliq={t('F2, QQS bilan')} />
              : <span className="fz-kpi__value tabular-nums" style={{ fontSize: 17, color: b.qoldiq && b.tiyin != null && b.tiyin !== 0 ? b.rang : undefined }}>{pul(b.tiyin)}</span>}
            {b.foiz != null
              ? <div className="fz-meter"><div className="fz-meter__t"><i style={{ width: chiziq(b).width, background: b.rang }} /></div></div>
              : <div style={{ height: 8 }} />}
            <span className="fz-kpi__sub">{b.izoh ?? ' '}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
