import type { CSSProperties, ReactNode } from 'react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { ikkiTomon } from '../../lib/nakopitelniy-korinish';

/**
 * Pereraschet uchun ikki tomonlama (plyus/minus) chiziqlar: chap — qaytarish kerak (−, qizil), o'ng — olish mumkin (+, yashil),
 * o'rtada nol o'qi; hammasi bitta qatorda bitta o'lchovda. Summalar ustamasiz (serverdan kelgan natija), yangi hisob yo'q.
 */
const RANG: Record<string, string> = { '1': 'var(--ok)', '-1': 'var(--danger)' };
const BELGI: Record<string, string> = { '1': '+', '-1': '−' };
const rangSof = (x: number) => RANG[String(Math.sign(x))] ?? 'var(--text-dim)';
const belgi = (x: number) => BELGI[String(Math.sign(x))] ?? '';

export function IkkiTomonQator({ nom, sub, plus, minus, max, sof, baland = 14 }: {
  nom: ReactNode; sub?: ReactNode; plus: number; minus: number; max: number; sof: number; baland?: number;
}) {
  const { chap, ong } = ikkiTomon(plus, minus, max);
  const yo: CSSProperties = { height: baland, display: 'flex', background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' };
  const soni = (x: number) => <span className="tabular-nums" style={{ fontSize: 12, whiteSpace: 'nowrap' }}><FmtN val={x} /></span>;
  return (
    <div role="img" aria-label={t('{nom}: plyus {p}, minus {m}, sof {s}', { nom: typeof nom === 'string' ? nom : '', p: plus, m: minus, s: sof })}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1.1fr) minmax(70px, auto) minmax(60px, 2fr) 2px minmax(60px, 2fr) minmax(70px, auto) minmax(86px, auto)', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: '16px', overflowWrap: 'anywhere' }} title={typeof nom === 'string' ? nom : undefined}>{nom}</div>
        {sub ? <div style={{ fontSize: 11, color: 'var(--text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div> : null}
      </div>
      <span style={{ textAlign: 'right', color: minus ? 'var(--danger)' : 'var(--text-mute)' }}>{minus ? <>−{soni(minus)}</> : <span style={{ fontSize: 12 }}>—</span>}</span>
      <div style={{ ...yo, justifyContent: 'flex-end' }}><i style={{ display: 'block', height: '100%', width: `${chap}%`, background: 'var(--danger)' }} /></div>
      <div style={{ height: baland + 6, background: 'var(--border-strong)' }} />
      <div style={yo}><i style={{ display: 'block', height: '100%', width: `${ong}%`, background: 'var(--ok)' }} /></div>
      <span style={{ color: plus ? 'var(--ok)' : 'var(--text-mute)' }}>{plus ? <>+{soni(plus)}</> : <span style={{ fontSize: 12 }}>—</span>}</span>
      <span style={{ textAlign: 'right', fontWeight: 600, color: rangSof(sof), whiteSpace: 'nowrap' }}>{belgi(sof)}<FmtN val={Math.abs(sof)} /></span>
    </div>
  );
}

/** Kichik qator ichidagi bitta summa uchun ikki tomonlama chiziq (jadval katagi). */
export function MiniFarq({ sof, max }: { sof: number; max: number }) {
  const { chap, ong } = ikkiTomon(Math.max(sof, 0), Math.max(-sof, 0), max);
  return (
    <span aria-hidden style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', alignItems: 'center', width: 72, height: 6, gap: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'flex-end', background: 'var(--surface-3)', height: 6 }}><i style={{ display: 'block', width: `${chap}%`, height: '100%', background: 'var(--danger)' }} /></span>
      <i style={{ height: 10, background: 'var(--border-strong)' }} />
      <span style={{ display: 'flex', background: 'var(--surface-3)', height: 6 }}><i style={{ display: 'block', width: `${ong}%`, height: '100%', background: 'var(--ok)' }} /></span>
    </span>
  );
}

export function Eksa({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11.5, color: 'var(--text-mute)', marginBottom: 6 }}>{children}</div>;
}

export function Rang({ rang, matn }: { rang: string; matn: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: rang }} />{matn}</span>;
}
