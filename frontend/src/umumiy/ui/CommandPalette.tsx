import { useState, useEffect, useId, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Building, CornerDownLeft, Sparkles } from 'lucide-react';
import { useKompaniya } from '../kontekst/KompaniyaKontekst';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { t } from '../../i18n/til';
import { qidiruvMos } from './commandPaletteQidiruv';
import { isPtoRoute } from '../kontekst/PTOWorkspaceContext';
import { AI_BUYRUQ_OCH_HODISA } from './aiBuyruqHodisa';

/** Sidebar bilan BIR manba: AdminShell rol/ruxsat/modul filtridan o'tgan bandlarni beradi (qattiq havola yo'q). */
export type PaletteBand = { yol: string; nom: string; guruh: string };

type Natija = { kalit: string; yol: string; nom: string; izoh: string; tur: 'sahifa' | 'obyekt' | 'ai' };

const OBYEKT_CHEGARA = 8;

export function CommandPalette({ bandlar }: { bandlar: PaletteBand[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [faol, setFaol] = useState(0);
  const dialogTitleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const k = useKompaniya();
  const kompaniyaId = k.globalRejim ? null : (k.joriy?.id ?? null);
  /* Obyektlar — kanonik `t2_obyekt` (joriy kompaniya), faqat palitra ochilganda o'qiladi. */
  const obyektlar = useQuery({
    queryKey: ['palitra-obyektlar', kompaniyaId],
    queryFn: async () => {
      const r = await sbT2ObyektlarOlKomp(kompaniyaId as number);
      return r.ok ? ((r.qatorlar || []) as T2Obyekt[]) : [];
    },
    enabled: isOpen && kompaniyaId != null,
    staleTime: 5 * 60 * 1000,
  });

  /* Smeta studiyasining o'z Ctrl+K buyruqlar paneli bor — u yerda ikkinchi oyna ochilmasin. */
  const studiyada = pathname.startsWith('/admin/smeta-studio');
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !studiyada) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [studiyada]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => { setFaol(0); }, [query]);

  if (!isOpen) return null;

  const sahifalar: Natija[] = bandlar
    .filter((b) => !query || qidiruvMos(`${t(b.nom)} ${b.nom} ${t(b.guruh)} ${b.yol}`, query))
    .map((b) => ({ kalit: b.yol, yol: b.yol, nom: t(b.nom), izoh: t(b.guruh), tur: 'sahifa' }));
  const obyektNatija: Natija[] = query
    ? (obyektlar.data || []).filter((o) => qidiruvMos(o.nom || '', query)).slice(0, OBYEKT_CHEGARA)
      .map((o) => ({ kalit: `obyekt-${o.id}`, yol: `/admin/holat/${o.id}`, nom: o.nom, izoh: t('Obyekt'), tur: 'obyekt' }))
    : [];
  /* AI buyruq satri (PTO sahifalarida) — alohida oyna emas, shu palitradagi bitta band (Ctrl+K endi bitta oyna ochadi). */
  const aiBand: Natija[] = query.trim().length >= 3 && isPtoRoute(pathname)
    ? [{ kalit: 'ai-buyruq', yol: 'ai:buyruq', nom: t('AI ga so‘rash: «{q}»', { q: query.trim() }), izoh: t('AI buyruq satri'), tur: 'ai' }] : [];
  const natijalar = [...sahifalar, ...obyektNatija, ...aiBand];

  const handleSelect = (route: string) => {
    if (route === 'ai:buyruq') {
      setIsOpen(false); setQuery('');
      setTimeout(() => window.dispatchEvent(new CustomEvent(AI_BUYRUQ_OCH_HODISA)), 0);
      return;
    }
    navigate(route);
    setIsOpen(false);
    setQuery('');
  };

  const klaviatura = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFaol((i) => Math.min(i + 1, natijalar.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFaol((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && natijalar[faol]) { e.preventDefault(); handleSelect(natijalar[faol].yol); }
  };

  const qator = (n: Natija, i: number) => (
    <button
      key={n.kalit}
      type="button"
      onClick={() => handleSelect(n.yol)}
      onMouseEnter={() => setFaol(i)}
      aria-selected={i === faol}
      role="option"
      className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-[var(--radius-sm)] transition-colors ${i === faol ? 'bg-[var(--accent-soft)] text-text' : 'text-text-dim hover:bg-surface-3 hover:text-text'}`}
    >
      {n.tur === 'ai' ? <Sparkles size={16} className="text-accent flex-shrink-0" /> : n.tur === 'obyekt' ? <Building size={16} className="text-text-dim flex-shrink-0" /> : <Search size={16} className="text-accent flex-shrink-0" />}
      <span className="flex-1 truncate">{n.nom}</span>
      <span className="text-[11px] text-text-dim truncate max-w-[40%]">{n.izoh}</span>
      {i === faol && <CornerDownLeft size={14} className="text-text-dim flex-shrink-0" />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-bg/70 p-4 pt-[12vh]" onMouseDown={() => setIsOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[72vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-center px-4 py-3 border-b border-border gap-3">
          <Search className="text-text-dim" size={20} />
          <span id={dialogTitleId} className="sr-only">{t('Buyruq markazi')}</span>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            className="flex-1 bg-transparent border-none text-[15px] text-text focus:outline-none shadow-none placeholder:text-text-mute"
            aria-label={t('Sahifa yoki obyekt izlash...')}
            placeholder={t('Sahifa yoki obyekt izlash...')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={klaviatura}
          />
          <kbd aria-label={t('Yopish uchun Escape tugmasi')} className="hidden rounded border border-border bg-surface px-2 py-1 font-sans text-xs text-text-dim sm:inline-block">ESC</kbd>
        </div>

        <div className="overflow-y-auto p-2" role="listbox" aria-label={t('Natijalar')}>
          {sahifalar.length > 0 && (
            <div className="px-3 py-2 text-[11px] font-semibold text-text-mute uppercase tracking-[.06em] mb-1">{t('Sahifalar')}</div>
          )}
          {sahifalar.map((n, i) => qator(n, i))}
          {obyektNatija.length > 0 && (
            <div className="px-3 py-2 text-[11px] font-semibold text-text-mute uppercase tracking-[.06em] mb-1 mt-2">{t('Obyektlar')}</div>
          )}
          {obyektNatija.map((n, i) => qator(n, sahifalar.length + i))}
          {aiBand.map((n, i) => qator(n, sahifalar.length + obyektNatija.length + i))}
          {natijalar.length === 0 && (
            <div className="px-4 py-8 text-center text-text-dim">{t('Hech narsa topilmadi')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
