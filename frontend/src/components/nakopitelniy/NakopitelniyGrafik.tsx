import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { OsuvchiI } from '../f2-hujjat/OsuvchiI';
import { t } from '../../i18n/til';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { oylikNuqtalar, yumaloqMax } from '../../lib/nakopitelniy-grafik';
import { useKenglik } from '../../umumiy/ui/useKenglik';

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
  const kam = useReducedMotion();
  const [quti, kenglik] = useKenglik<HTMLDivElement>();
  const nuqtalar = useMemo(() => (kesim ? oylikNuqtalar(kesim) : []), [kesim]);
  if (!nuqtalar.length) return null;
  // Haqiqiy piksel eni: yozuvlar doim 11–12px, ustunlar cho'zilmaydi; balandlik o'zgarmas.
  const W = Math.max(360, kenglik), H = 260, L = 72, R = 72, T = 22, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const oxirgi = nuqtalar[nuqtalar.length - 1].jamlanma;
  const nomalumBor = nuqtalar.some((n) => n.nomalum);
  // Ikki shkala: chap — jamlanma/smeta/fakt (katta), o'ng — oylik F2 ustunlari (kichik). Bitta shkalada oylik ustunlar
  // jamlanmaning ~1/7 qismi bo'lib, ko'rinmay qolardi.
  const max = yumaloqMax(Math.max(smeta ?? 0, fakt ?? 0, oxirgi));
  const maxOy = yumaloqMax(Math.max(1, ...nuqtalar.map((n) => n.summa)));
  const y = (v: number) => T + ih - (v / max) * ih;
  const yOy = (v: number) => T + ih - (v / maxOy) * ih;
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
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--accent)' }} />{t('oy bo‘yicha F2')} <span className="text-text-mute">({t('o‘ng shkala')})</span></span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: 'var(--accent-text)' }} />{t('jamlanma')}</span>
        {smeta != null && <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: 'var(--text-dim)' }} />{t('smeta = 100%')}</span>}
        {fakt != null && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--info)' }} />{t('bajarilgan fakt')}</span>}
        {nomalumBor && <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--warn)' }} />{t('summasi noma’lum qatorlar bor')}</span>}
      </div>
      <div ref={quti} className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Oyma-oy tasdiqlangan F2 va jamlanma')} style={{ display: 'block' }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-mute)">{qisqa(v)}</text>
              <text x={W - R + 8} y={y(v) + 4} fontSize={11} fill="var(--accent)" opacity={0.85}>{qisqa((v / max) * maxOy)}</text>
            </g>
          ))}
          {nuqtalar.map((n, i) => (
            <g key={n.oy}>
              <motion.rect x={x(i) - Math.min(16, bw * 0.3)} y={yOy(n.summa)} width={Math.min(32, bw * 0.6)} height={Math.max(0, T + ih - yOy(n.summa))} rx={2} fill="var(--accent)" opacity={i === nuqtalar.length - 1 ? 1 : 0.55}
                style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }} initial={kam ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, delay: i * 0.05, ease: [0.2, 0.7, 0.2, 1] }}>
                <title>{`${davrNomi(n.oy, 'uz')}: ${qisqa(n.summa)}${n.nomalum ? ' · ' + t('summasi noma’lum qatorlar bor') : ''}`}</title>
              </motion.rect>
              {n.nomalum && <circle cx={x(i)} cy={yOy(n.summa) - 7} r={3} fill="var(--warn)"><title>{t('summasi noma’lum qatorlar bor')}</title></circle>}
              <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--text-dim)">{OY_QISQA[Number(n.oy.slice(5, 7)) - 1] ?? n.oy.slice(5, 7)} {n.oy.slice(2, 4)}</text>
            </g>
          ))}
          {smeta != null && smeta > 0 && <g>
            <line x1={L} x2={W - R} y1={y(smeta)} y2={y(smeta)} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="2 3" />
            <text x={L + 6} y={y(smeta) - 6} fontSize={11} fill="var(--text-dim)">{t('smeta')} {qisqa(smeta)} · 100%</text>
          </g>}
          {fakt != null && fakt > 0 && <line x1={L} x2={W - R} y1={y(fakt)} y2={y(fakt)} stroke="var(--info)" strokeWidth={1.5} strokeDasharray="5 4" />}
          <motion.path d={yol} fill="none" stroke="var(--accent-text)" strokeWidth={2.5} strokeLinejoin="round" initial={kam ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.25, ease: 'easeOut' }} />
          {nuqtalar.map((n, i) => <rect key={n.oy} x={x(i) - 4} y={y(n.jamlanma) - 4} width={8} height={8} transform={`rotate(45 ${x(i)} ${y(n.jamlanma)})`} fill="var(--accent-text)" stroke="var(--surface)" strokeWidth={1.5}><title>{`${t('jamlanma')}: ${qisqa(n.jamlanma)}`}</title></rect>)}
          <text x={x(nuqtalar.length - 1)} y={y(oxirgi) - 12} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--text)">{qisqa(oxirgi)}{foiz != null ? ` · ${foiz}%` : ''}</text>
        </svg>
      </div>
      {smeta != null && smeta > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="reja-fakt" aria-label={t('Reja va fakt')}>
          {([
            [t('Reja (smeta)'), smeta, 'var(--border-strong)'],
            [t('Tasdiqlangan F2 (jamlanma)'), oxirgi, 'var(--accent)'],
            ...(fakt != null ? [[t('Bajarilgan fakt'), fakt, 'var(--info)'] as const] : []),
          ] as const).map(([nom, v, rang], i) => (
            <div key={nom} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-2 text-[12px]">
              <span className="truncate text-text-dim">{nom}</span>
              <span className="fz-meter__t"><OsuvchiI ulush={v / Math.max(smeta, v)} style={{ background: rang }} kechikish={i * 0.08} /></span>
              <b className="tabular-nums text-text">{Math.round((v / smeta) * 100)}%</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
