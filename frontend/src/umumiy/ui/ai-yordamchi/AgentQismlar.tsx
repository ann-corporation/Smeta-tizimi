/**
 * AI agent paneli qismlari — Smeta Studio (SmetaAiChat) va sahifa AI yordamchisi (fakt / F2) uchun BIR xil komponentlar:
 * suhbat pufakchalari, «agent nima qilyapti» qadamlari va «AI taklif qilgan amallar» (belgilash + Bajarish).
 * Agent hech narsani o'zi bajarmaydi: amallar foydalanuvchi «Bajarish» ni bosgandagina ishga tushadi.
 */
import type { ReactNode } from 'react';
import { t } from '../../../i18n/til';

export type AgentQadam = { matn: string; holat: 'ishda' | 'ok' | 'xato' | 'savol' };
export type AgentXabar = { rol: 'user' | 'assistant'; matn: string };

export function AgentXabarlar({ xabarlar }: { xabarlar: readonly AgentXabar[] }) {
  return <>{xabarlar.map((x, i) => <div key={i} className={x.rol === 'user' ? 'ml-8 rounded-lg bg-accent/10 px-2 py-1.5' : 'mr-8 whitespace-pre-line rounded-lg bg-surface-2 px-2 py-1.5'}>{x.matn}</div>)}</>;
}

/** Qadamlar ro'yxati; `sarlavha(n, band)` — sahifaga mos yorliq (masalan «Smetachi ishlayapti — 3 qadam»). */
export function AgentQadamlar({ qadamlar, band, sarlavha }: { qadamlar: readonly AgentQadam[]; band: boolean; sarlavha: (n: number, band: boolean) => string }) {
  if (!qadamlar.length) return null;
  return <details open={band} className="mr-8 rounded-lg border border-border/70 bg-surface-1 px-2 py-1 text-[11.5px]">
    <summary className="cursor-pointer text-text-dim">{sarlavha(qadamlar.length, band)}</summary>
    <ol className="mt-1 space-y-0.5">{qadamlar.map((q, i) => <li key={i} className={`flex gap-1.5 ${q.holat === 'xato' ? 'text-danger' : q.holat === 'savol' ? 'text-warn' : 'text-text-dim'}`}>
      <span className="shrink-0 w-3">{q.holat === 'ishda' && band ? '⏳' : q.holat === 'xato' ? '✗' : q.holat === 'savol' ? '?' : '✓'}</span><span>{q.matn}</span></li>)}</ol>
  </details>;
}

export type AgentAmalQatori = { nom: ReactNode; tafsilot?: string; izoh?: string | null; ogoh?: string | null; tanlangan: boolean };

/** «AI taklif qilgan amallar»: har biri belgilanadi; «Bajarish» faqat tanlanganlarni ishga tushiradi. */
export function AgentAmallar({ amallar, band, onTanla, onBajar, onBekor }: {
  amallar: readonly AgentAmalQatori[]; band: boolean; onTanla: (i: number, v: boolean) => void; onBajar: () => void; onBekor: () => void;
}) {
  if (!amallar.length) return null;
  return <div className="karta space-y-1 p-2 text-[12px]">
    <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('AI taklif qilgan amallar')}</strong>
    {amallar.map((a, i) => <label key={i} className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5" checked={a.tanlangan} onChange={e => onTanla(i, e.target.checked)} />
      <span><b>{a.nom}</b>{a.tafsilot ?? ''}
        {a.izoh && <span className="block text-[11px] text-text-mute">{a.izoh}</span>}
        {a.ogoh && <span className="block text-[11px] text-warn">{a.ogoh}</span>}</span>
    </label>)}
    <div className="flex gap-2">
      <button type="button" className="tugma tugma-asosiy h-8 px-3 text-[12px]" disabled={band || !amallar.some(a => a.tanlangan)} onClick={onBajar}>{t('Bajarish')}</button>
      <button type="button" className="tugma h-8 px-3 text-[12px]" onClick={onBekor}>{t('Bekor qilish')}</button>
    </div>
  </div>;
}
