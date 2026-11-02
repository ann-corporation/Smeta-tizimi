import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Amallar menyusi: bitta tugma + ochiladigan ro'yxat (ikkinchi darajali eksportlar). Esc / tashqariga bosish — yopadi.
 * Menyu elementlari oddiy <button role="menuitem"> (aria-label saqlanadi); bosilganda menyu yopiladi.
 */
export type MenyuBand = { kalit: string; belgi: ReactNode; matn: string; onBos?: () => void; href?: string; sarlavha?: string; aria?: string; ochirilgan?: boolean; ajrat?: boolean };

export function AmalMenyu({ matn, ikonka, bandlar, ochirilgan = false }: { matn: string; ikonka?: ReactNode; bandlar: MenyuBand[]; ochirilgan?: boolean }) {
  const [ochiq, setOchiq] = useState(false);
  const ildiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ochiq) return;
    const tashqari = (e: MouseEvent) => { if (!ildiz.current?.contains(e.target as Node)) setOchiq(false); };
    const tugma = (e: KeyboardEvent) => { if (e.key === 'Escape') setOchiq(false); };
    document.addEventListener('mousedown', tashqari);
    document.addEventListener('keydown', tugma);
    return () => { document.removeEventListener('mousedown', tashqari); document.removeEventListener('keydown', tugma); };
  }, [ochiq]);
  const stil = { width: '100%', justifyContent: 'flex-start', borderRadius: 0, textDecoration: 'none' } as const;
  return (
    <div ref={ildiz} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className="fz-btn" aria-haspopup="menu" aria-expanded={ochiq} disabled={ochirilgan} onClick={() => setOchiq((o) => !o)}>
        {ikonka}{matn}<ChevronDown size={14} />
      </button>
      {ochiq && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, minWidth: 260, padding: '4px 0', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)' }}>
          {bandlar.map((b) => {
            const ichki = <>{b.belgi}<span>{b.matn}</span></>;
            const chiziq = b.ajrat ? { borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 } : undefined;
            return b.href ? (
              <div key={b.kalit} style={chiziq}><a role="menuitem" className="fz-btn fz-btn--ghost" href={b.href} title={b.sarlavha} style={stil} onClick={() => setOchiq(false)}>{ichki}</a></div>
            ) : (
              <div key={b.kalit} style={chiziq}>
                <button type="button" role="menuitem" className="fz-btn fz-btn--ghost" title={b.sarlavha} aria-label={b.aria} disabled={b.ochirilgan} style={stil}
                  onClick={() => { setOchiq(false); b.onBos?.(); }}>{ichki}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
