import { useMemo } from 'react';
import { t } from '../../i18n/til';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { oylikNuqtalar, yumaloqMax } from '../../lib/nakopitelniy-grafik';

/**
 * Nakopitelniy grafigi (egasi 2026-10-25: «diagramma, chart, infografika»): ustunlar — har oy tasdiqlangan F2,
 * chiziq — jamlanma (S-egri); gorizontal chiziqlar — smeta jami (100%) va fakt jami. Barcha qiymatlar ustamasiz.
 */
const OY_QISQA = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const qisqa = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${t('mlrd')}`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${t('mln')}`;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

export function NakopitelniyGrafik({ kesim, smeta, fakt }: {
  kesim: { oylar: string[]; qiymat: Map<number, Map<string, { hajm: number; summa: number | null }>> } | null;
  smeta: number | null | undefined; fakt: number | null | undefined;
}) {
  const nuqtalar = useMemo(() => (kesim ? oylikNuqtalar(kesim) : []), [kesim]);
  if (!nuqtalar.length) return null;
  const W = 760, H = 260, L = 64, R = 16, T = 16, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const oxirgi = nuqtalar[nuqtalar.length - 1].jamlanma;
  const max = yumaloqMax(Math.max(smeta ?? 0, fakt ?? 0, oxirgi, ...nuqtalar.map((n) => n.summa)));
  const y = (v: number) => T + ih - (v / max) * ih;
  const bw = iw / nuqtalar.length;
  const x = (i: number) => L + bw * i + bw / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  const foiz = smeta && smeta > 0 ? Math.round((oxirgi / smeta) * 100) : null;
  const yol = nuqtalar.map((n, i) => `${i ? 'L' : 'M'}${x(i)},${y(n.jamlanma)}`).join(' ');

  return (
    <section className="fz-panel" aria-label={t('Nakopitelniy grafigi')}>
      <div className="fz-panel__h">
        <span>{t('Oyma-oy tasdiqlangan F2 va jamlanma')}</span>
        <span>{foiz == null ? t('ustamasiz') : t('smetaning {p}% topshirildi · ustamasiz', { p: foiz })}</span>
      </div>
      <div className="flex flex-wrap gap-4 text-[12px] text-text-dim">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--accent)' }} />{t('oy bo‘yicha F2')}</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: 'var(--accent-text)' }} />{t('jamlanma')}</span>
        {smeta != null && <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: 'var(--text-dim)' }} />{t('smeta = 100%')}</span>}
        {fakt != null && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--info)' }} />{t('bajarilgan fakt')}</span>}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Oyma-oy tasdiqlangan F2 va jamlanma')} style={{ width: '100%', minWidth: 520, height: 'auto', display: 'block' }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-mute)">{qisqa(v)}</text>
            </g>
          ))}
          {nuqtalar.map((n, i) => (
            <g key={n.oy}>
              <rect x={x(i) - Math.min(28, bw * 0.32)} y={y(n.summa)} width={Math.min(56, bw * 0.64)} height={Math.max(0, T + ih - y(n.summa))} rx={2} fill="var(--accent)" opacity={i === nuqtalar.length - 1 ? 1 : 0.55}>
                <title>{`${davrNomi(n.oy, 'uz')}: ${qisqa(n.summa)}${n.nomalum ? ' · ' + t('summasi noma’lum qatorlar bor') : ''}`}</title>
              </rect>
              {n.nomalum && <text x={x(i)} y={y(n.summa) - 6} textAnchor="middle" fontSize={11} fill="var(--warn)">?</text>}
              <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--text-dim)">{OY_QISQA[Number(n.oy.slice(5, 7)) - 1] ?? n.oy.slice(5, 7)} {n.oy.slice(2, 4)}</text>
            </g>
          ))}
          {smeta != null && smeta > 0 && <line x1={L} x2={W - R} y1={y(smeta)} y2={y(smeta)} stroke="var(--text-dim)" strokeWidth={1.5} />}
          {fakt != null && fakt > 0 && <line x1={L} x2={W - R} y1={y(fakt)} y2={y(fakt)} stroke="var(--info)" strokeWidth={1.5} strokeDasharray="5 4" />}
          <path d={yol} fill="none" stroke="var(--accent-text)" strokeWidth={2.5} strokeLinejoin="round" />
          {nuqtalar.map((n, i) => <rect key={n.oy} x={x(i) - 4} y={y(n.jamlanma) - 4} width={8} height={8} transform={`rotate(45 ${x(i)} ${y(n.jamlanma)})`} fill="var(--accent-text)" stroke="var(--surface)" strokeWidth={1.5}><title>{`${t('jamlanma')}: ${qisqa(n.jamlanma)}`}</title></rect>)}
          <text x={x(nuqtalar.length - 1)} y={y(oxirgi) - 12} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text)">{qisqa(oxirgi)}</text>
        </svg>
      </div>
    </section>
  );
}
