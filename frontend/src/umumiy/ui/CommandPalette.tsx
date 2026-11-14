import { useState, useEffect, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Building, CornerDownLeft, Zap, FileSignature, FileText } from 'lucide-react';
import { useKompaniya } from '../kontekst/KompaniyaKontekst';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { sbT2ShartnomalarOl } from '../../api/t2-shartnoma';
import { hujjatRoyxatOl } from '../../api/t2-hujjat-canonical';
import { t } from '../../i18n/til';
import { AMAL_MAP } from '../../lib/reestr/amal';
import { IJROCHILAR } from '../../lib/reestr/amal-ijro';
import { amalIshga } from '../../lib/reestr/amal-mavzu';
import { sahifaVaAmalQidir, yozuvQidir, type QidiruvNatija } from '../../lib/reestr/qidiruv';

/** Sidebar bilan BIR manba: AdminShell rol/ruxsat/modul filtridan o'tgan bandlarni beradi (qattiq havola yo'q). */
export type PaletteBand = { yol: string; nom: string; guruh: string };

type Natija = QidiruvNatija;

const OBYEKT_CHEGARA = 8;

export function CommandPalette({ bandlar, permissions }: { bandlar: PaletteBand[]; permissions?: readonly string[] | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [faol, setFaol] = useState(0);
  const dialogTitleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
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

  /* Shartnoma va hujjatlar (nom/raqam bo'yicha) — faqat palitra ochilganda, joriy kompaniya. */
  const shartnomalar = useQuery({
    queryKey: ['palitra-shartnomalar', kompaniyaId],
    queryFn: async () => { const r = await sbT2ShartnomalarOl(kompaniyaId as number, false); return r.ok ? ((r.qatorlar || []) as Array<{ id: number; raqam: string; nom: string | null; taraf: string | null }>) : []; },
    enabled: isOpen && kompaniyaId != null,
    staleTime: 5 * 60 * 1000,
  });
  const hujjatlar = useQuery({
    queryKey: ['palitra-hujjatlar', kompaniyaId],
    queryFn: async () => { const r = await hujjatRoyxatOl({ kompaniyaId: kompaniyaId as number, limit: 500 }); return (r.documents || []) as Array<{ id: number | string; filename: string }>; },
    enabled: isOpen && kompaniyaId != null,
    staleTime: 5 * 60 * 1000,
  });

  /* Ctrl+K endi YAGONA yordamchi (Jarvis, AiHelper) ni ochadi; bu qidiruv paneli palitra:och hodisasi bilan ochiladi (ikki oyna chiqmasin). */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const och = () => setIsOpen(true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('palitra:och', och);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('palitra:och', och); };
  }, []);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => { setFaol(0); }, [query]);

  if (!isOpen) return null;

  const reestrNatija = sahifaVaAmalQidir(query, bandlar.map((x) => ({ yol: x.yol, nom: t(x.nom), guruh: t(x.guruh) })), permissions);
  const amalNatija: Natija[] = reestrNatija.filter((n) => n.tur === 'amal');
  const sahifalar: Natija[] = reestrNatija.filter((n) => n.tur === 'sahifa');
  const obyektNatija: Natija[] = yozuvQidir(obyektlar.data || [], query, (o) => o.nom || '', OBYEKT_CHEGARA)
    .map((o) => ({ kalit: `obyekt-${o.id}`, yol: `/admin/holat/${o.id}`, nom: o.nom, izoh: t('Obyekt'), tur: 'obyekt' as const }));
  const shartnomaNatija: Natija[] = yozuvQidir(shartnomalar.data || [], query, (x) => `${x.raqam} ${x.nom ?? ''} ${x.taraf ?? ''}`, OBYEKT_CHEGARA)
    .map((x) => ({ kalit: `shartnoma-${x.id}`, yol: '/admin/shartnoma-liniya', nom: `№ ${x.raqam}${x.nom ? ' — ' + x.nom : ''}`, izoh: t('Shartnoma'), tur: 'shartnoma' as const }));
  const hujjatNatija: Natija[] = yozuvQidir(hujjatlar.data || [], query, (x) => x.filename || '', OBYEKT_CHEGARA)
    .map((x) => ({ kalit: `hujjat-${x.id}`, yol: '/admin/documents', nom: x.filename, izoh: t('Hujjat'), tur: 'hujjat' as const }));
  const natijalar = [...amalNatija, ...sahifalar, ...obyektNatija, ...shartnomaNatija, ...hujjatNatija];

  const handleSelect = (route: string, n?: Natija) => {
    /* Amal reestri: ijrochisi bor amal Jarvis oqimini ochadi (savol -> ko'rinish -> tasdiq); aks holda amal sahifasiga o'tadi. */
    const amalKalit = n?.tur === 'amal' ? n.kalit.replace(/^amal:/, '') : null;
    if (amalKalit && IJROCHILAR[amalKalit]) { const a = AMAL_MAP.get(amalKalit); if (a) { amalIshga(a); setIsOpen(false); setQuery(''); return; } }
    navigate(route);
    setIsOpen(false);
    setQuery('');
  };

  const klaviatura = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFaol((i) => Math.min(i + 1, natijalar.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFaol((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && natijalar[faol]) { e.preventDefault(); handleSelect(natijalar[faol].yol, natijalar[faol]); }
  };

  const qator = (n: Natija, i: number) => (
    <button
      key={n.kalit}
      type="button"
      onClick={() => handleSelect(n.yol, n)}
      onMouseEnter={() => setFaol(i)}
      aria-selected={i === faol}
      role="option"
      className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-[var(--radius-sm)] transition-colors ${i === faol ? 'bg-[var(--accent-soft)] text-text' : 'text-text-dim hover:bg-surface-3 hover:text-text'}`}
    >
      {n.tur === 'obyekt' ? <Building size={16} className="text-text-dim flex-shrink-0" /> : n.tur === 'amal' ? <Zap size={16} className="text-accent flex-shrink-0" /> : n.tur === 'shartnoma' ? <FileSignature size={16} className="text-text-dim flex-shrink-0" /> : n.tur === 'hujjat' ? <FileText size={16} className="text-text-dim flex-shrink-0" /> : <Search size={16} className="text-accent flex-shrink-0" />}
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
          {([
            [t('Amallar'), amalNatija, 0],
            [t('Sahifalar'), sahifalar, amalNatija.length],
            [t('Obyektlar'), obyektNatija, amalNatija.length + sahifalar.length],
            [t('Shartnomalar'), shartnomaNatija, amalNatija.length + sahifalar.length + obyektNatija.length],
            [t('Hujjatlar'), hujjatNatija, amalNatija.length + sahifalar.length + obyektNatija.length + shartnomaNatija.length],
          ] as Array<[string, Natija[], number]>).map(([sarlavha, royxat, boshlanish]) => royxat.length > 0 && (
            <div key={sarlavha}>
              <div className="px-3 py-2 text-[11px] font-semibold text-text-mute uppercase tracking-[.06em] mb-1 mt-1">{sarlavha}</div>
              {royxat.map((n, i) => qator(n, boshlanish + i))}
            </div>
          ))}
          {natijalar.length === 0 && (
            <div className="px-4 py-8 text-center text-text-dim">{t('Hech narsa topilmadi')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
