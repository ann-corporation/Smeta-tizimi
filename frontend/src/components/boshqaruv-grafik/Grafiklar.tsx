/**
 * Kichik grafiklar to'plami (platforma boshqaruvi, tizim nazorati) — Firuza tokenlari, ikki mavzuda ham.
 * Qoidalar: bitta shkala (yumaloq maksimum, teng belgilar), noma'lum — «—» (0 emas), har ustunda tooltip.
 */
import type { ReactNode } from 'react';
import { yumaloqMax } from '../../lib/nakopitelniy-grafik';
import { useKenglik } from '../../umumiy/ui/useKenglik';

const sonFmt = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
const foiz = (v: number, max: number) => `${max > 0 ? Math.max(0, Math.min(1, v / max)) * 100 : 0}%`;

export function GrafikPanel({ sarlavha, ong, children, label }: { sarlavha: string; ong?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section className="fz-panel" aria-label={label ?? sarlavha}>
      <div className="fz-panel__h"><span>{sarlavha}</span>{ong != null && <span>{ong}</span>}</div>
      {children}
    </section>
  );
}

export function Legenda({ qatorlar }: { qatorlar: { nom: string; rang: string; qiymat?: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-dim">
      {qatorlar.map((q) => <li key={q.nom} className="inline-flex items-center gap-1.5">
        <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: q.rang }} />{q.nom}{q.qiymat != null && <b className="tabular-nums text-text">{q.qiymat}</b>}
      </li>)}
    </ul>
  );
}

/** Gorizontal ustunlar — barchasi bitta shkalada. `birlik` qiymat yonida yoziladi. */
export function UfqiyUstunlar({ qatorlar, birlik = '', rang = 'var(--accent)' }: { qatorlar: { nom: string; qiymat: number | null; rang?: string; izoh?: string }[]; birlik?: string; rang?: string }) {
  const max = yumaloqMax(Math.max(0, ...qatorlar.map((q) => q.qiymat ?? 0)));
  return (
    <div className="flex flex-col gap-2">
      {qatorlar.map((q) => {
        const matn = q.qiymat == null ? '—' : `${sonFmt(q.qiymat)}${birlik ? ` ${birlik}` : ''}`;
        return <div key={q.nom} className="flex flex-col gap-1" title={`${q.nom}: ${matn}${q.izoh ? ` · ${q.izoh}` : ''}`}>
          <div className="flex justify-between gap-3 text-[12.5px]"><span className="truncate text-text-dim">{q.nom}</span><b className="shrink-0 tabular-nums">{matn}</b></div>
          <div className="relative h-2 rounded-sm" style={{ background: 'var(--surface-3)' }}>
            {q.qiymat != null && <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: foiz(q.qiymat, max), background: q.rang ?? rang }} />}
          </div>
        </div>;
      })}
    </div>
  );
}

/** Bitta tasma — qismlar ulushi (masalan, faol / bloklangan). */
export function Tasma({ qismlar, label }: { qismlar: { nom: string; qiymat: number; rang: string }[]; label: string }) {
  const jami = qismlar.reduce((s, q) => s + Math.max(0, q.qiymat), 0);
  return (
    <div className="flex h-3 gap-0.5 overflow-hidden rounded-sm" style={{ background: 'var(--surface-3)' }} role="img" aria-label={`${label}: ${qismlar.map((q) => `${q.nom} ${q.qiymat}`).join(', ')}`}>
      {jami > 0 && qismlar.filter((q) => q.qiymat > 0).map((q) => <i key={q.nom} title={`${q.nom}: ${sonFmt(q.qiymat)}`} className="block h-full" style={{ flexGrow: q.qiymat, background: q.rang }} />)}
    </div>
  );
}

/** Oylar bo'yicha guruhlangan ustunlar (SVG): Y o'qi bitta shkalada, har ustunda <title>. */
export function OylikUstunlar({ oylar, seriyalar, label }: { oylar: { oy: string; qiymatlar: (number | null)[] }[]; seriyalar: { nom: string; rang: string }[]; label: string }) {
  const [quti, kenglik] = useKenglik<HTMLDivElement>(640);
  const W = Math.max(320, kenglik), H = 220, CHAP = 64, PAST = 26, TEPA = 8;
  const max = yumaloqMax(Math.max(0, ...oylar.flatMap((o) => o.qiymatlar.map((v) => v ?? 0))));
  const ichkiW = W - CHAP - 8, ichkiH = H - PAST - TEPA;
  const gw = oylar.length ? ichkiW / oylar.length : ichkiW;
  const uw = Math.max(3, Math.min(22, (gw * 0.75) / Math.max(1, seriyalar.length)));
  const y = (v: number) => TEPA + ichkiH - (v / max) * ichkiH;
  const belgilar = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  return (
    <div ref={quti} className="flex flex-col gap-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={label}>
        {belgilar.map((b) => <g key={b}>
          <line x1={CHAP} x2={W - 8} y1={y(b)} y2={y(b)} stroke="var(--border)" strokeWidth={1} />
          <text x={CHAP - 6} y={y(b) + 4} textAnchor="end" fontSize={11} fill="var(--text-mute)">{sonFmt(b)}</text>
        </g>)}
        {oylar.map((o, i) => {
          const x0 = CHAP + i * gw + (gw - uw * seriyalar.length) / 2;
          return <g key={o.oy}>
            {o.qiymatlar.map((v, j) => v == null ? null : <rect key={j} x={x0 + j * uw} y={y(Math.max(0, v))} width={uw - 1} height={Math.max(0, TEPA + ichkiH - y(Math.max(0, v)))} rx={1.5} fill={seriyalar[j]?.rang}>
              <title>{`${o.oy} · ${seriyalar[j]?.nom}: ${sonFmt(v)}`}</title>
            </rect>)}
            {(gw >= 48 || i % Math.ceil(48 / Math.max(1, gw)) === 0) && <text x={CHAP + i * gw + gw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-mute)">{o.oy.slice(0, 7)}</text>}
          </g>;
        })}
      </svg>
      <Legenda qatorlar={seriyalar} />
    </div>
  );
}
