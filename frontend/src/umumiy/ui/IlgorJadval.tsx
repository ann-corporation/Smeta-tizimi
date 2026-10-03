import { useState, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Filter, Search, Download, X } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';

export type IlgorUstun<T> = {
  kalit: keyof T & string;
  nom: string;
  raqam?: boolean;
  en?: string;
  chiz: (satr: T, i: number) => ReactNode;
  saralanadigan?: boolean; // Sortable
  filtrlanadigan?: boolean; // Filterable (excel like dropdown)
};

export function IlgorJadval<T extends Record<string, any>>({
  ustunlar,
  satrlar,
  kalit,
  onSatrBos,
  eksportNom = 'Eksport'
}: {
  ustunlar: IlgorUstun<T>[];
  satrlar: T[];
  kalit: (satr: T, i: number) => string;
  onSatrBos?: (satr: T) => void;
  eksportNom?: string;
}) {
  const [sortConf, setSortConf] = useState<{ kalit: keyof T; dir: 'asc' | 'desc' } | null>(null);
  const [filtrlar, setFiltrlar] = useState<Record<string, string[]>>({});
  const [faolFiltUstun, setFaolFiltUstun] = useState<string | null>(null);

  // Apply filters
  const filtrlanganSatrlar = useMemo(() => {
    return satrlar.filter(s => {
      for (const [k, ruxsatEtilganlar] of Object.entries(filtrlar)) {
        if (ruxsatEtilganlar.length === 0) continue;
        const val = String(s[k] ?? '');
        if (!ruxsatEtilganlar.includes(val)) return false;
      }
      return true;
    });
  }, [satrlar, filtrlar]);

  // Apply sorting
  const yakuniySatrlar = useMemo(() => {
    if (!sortConf) return filtrlanganSatrlar;
    return [...filtrlanganSatrlar].sort((a, b) => {
      const aVal = a[sortConf.kalit];
      const bVal = b[sortConf.kalit];
      if (aVal === bVal) return 0;
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      
      let res = 0;
      if (!isNaN(aNum) && !isNaN(bNum) && aVal !== '' && bVal !== '') {
         res = aNum - bNum;
      } else {
         res = String(aVal || '').localeCompare(String(bVal || ''));
      }
      return sortConf.dir === 'asc' ? res : -res;
    });
  }, [filtrlanganSatrlar, sortConf]);

  const handleSort = (k: keyof T) => {
    setSortConf(prev => {
      if (prev?.kalit === k) {
        if (prev.dir === 'asc') return { kalit: k, dir: 'desc' };
        return null;
      }
      return { kalit: k, dir: 'asc' };
    });
  };

  const handleExportCSV = () => {
    const csvRows = [];
    const headers = ustunlar.map(u => `"${t(u.nom)}"`);
    csvRows.push(headers.join(','));

    for (const s of yakuniySatrlar) {
      const row = ustunlar.map(u => {
        let val: any = s[u.kalit];
        if (val === null || val === undefined) val = '';
        /* ⚡ 2026-08-16 (audit M — CSV FORMULA INJECTION).
           Qiymat `=`, `+`, `-` yoki `@` bilan boshlansa Excel uni
           FORMULA deb bajaradi. Resurs nomi «-БЕТОН» bo'lsa bu bezarar,
           lekin ma'lumot tashqaridan (faktura OCR, Telegram) kelsa
           zararli formula ham tushishi mumkin. Qo'shtirnoq bundan
           HIMOYA QILMAYDI — apostrof kerak. */
        const xom = String(val);
        const xavfli = /^[=+@-]/.test(xom);
        return `"${(xavfli ? "'" + xom : xom).replace(/"/g, '""')}"`;
      });
      csvRows.push(row.join(','));
    }

    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${eksportNom}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center bg-[var(--surface-2)] p-2 px-4 rounded-xl border border-border shadow-md">
        <div className="text-text-dim text-sm font-medium">
          {t('Jami:')} <span className="text-white font-bold">{yakuniySatrlar.length}</span> {t("ta qator ko'rsatilmoqda")}
        </div>
        <button 
          onClick={handleExportCSV}
          className="flex items-center gap-2 bg-accent/20 hover:bg-accent/30 text-accent px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border border-accent/20 cursor-pointer"
        >
          <Download size={16} /> {t('Excel (CSV) ga yuklash')}
        </button>
      </div>

      <div className="karta overflow-hidden shadow-xl border border-border bg-[var(--surface-1)]">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-[13px] border-collapse relative">
            <thead>
              <tr className="bg-[var(--surface-2)] shadow-sm">
                {ustunlar.map((u) => {
                  const isActiveSort = sortConf?.kalit === u.kalit;
                  const isFiltered = (filtrlar[u.kalit]?.length || 0) > 0;
                  return (
                    <th
                      key={u.kalit}
                      style={{ width: u.en, minWidth: u.en }}
                      className={`sticky top-0 z-10 bg-[var(--surface-2)] px-4 py-3 font-medium text-[11px] uppercase tracking-[0.04em] border-b border-border select-none ${u.raqam ? 'text-right' : 'text-left'}`}
                    >
                      <div className={`flex items-center gap-1.5 ${u.raqam ? 'justify-end' : 'justify-start'}`}>
                        <div 
                           className={`flex items-center gap-1 ${u.saralanadigan !== false ? 'cursor-pointer hover:text-accent transition-colors' : 'text-text-dim'}`}
                           onClick={() => u.saralanadigan !== false && handleSort(u.kalit)}
                        >
                          <span className={isActiveSort ? 'text-accent font-bold' : ''}>{t(u.nom)}</span>
                          {isActiveSort && sortConf.dir === 'asc' && <ChevronUp size={14} className="text-accent" />}
                          {isActiveSort && sortConf.dir === 'desc' && <ChevronDown size={14} className="text-accent" />}
                        </div>
                        
                        {u.filtrlanadigan !== false && (
                          <div className="relative">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setFaolFiltUstun(faolFiltUstun === u.kalit ? null : u.kalit); }}
                              aria-label={t('{nom} filtri', { nom: t(u.nom) })}
                              title={t('{nom} filtri', { nom: t(u.nom) })}
                              className={`p-1 rounded transition-colors cursor-pointer ${isFiltered ? 'bg-accent text-black' : 'text-text-dim hover:bg-white/10 hover:text-white'}`}
                            >
                              <Filter size={12} />
                            </button>
                            
                            <AnimatePresence>
                              {faolFiltUstun === u.kalit && (
                                <FiltrPopover 
                                  ustun={u} 
                                  satrlar={satrlar} 
                                  joriyFiltr={filtrlar[u.kalit] || []}
                                  onSaqlash={(tanlanganlar) => {
                                    setFiltrlar(p => ({ ...p, [u.kalit]: tanlanganlar }));
                                    setFaolFiltUstun(null);
                                  }}
                                  onYopish={() => setFaolFiltUstun(null)}
                                />
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {yakuniySatrlar.length === 0 ? (
                <tr>
                  <td colSpan={ustunlar.length} className="text-center py-12 text-text-dim">
                    {t("Ma'lumot topilmadi yoki filtrlar juda qattiq")}
                  </td>
                </tr>
              ) : (
                yakuniySatrlar.map((s, i) => (
                  <tr
                    key={kalit(s, i)}
                    onClick={onSatrBos ? () => onSatrBos(s) : undefined}
                    className={`transition-colors duration-[120ms] hover:bg-white/5 ${onSatrBos ? 'cursor-pointer' : ''}`}
                  >
                    {ustunlar.map((u) => (
                      <td
                        key={u.kalit}
                        className={`px-4 py-2.5 align-middle ${u.raqam ? 'text-right tabular-nums' : 'text-left'}`}
                      >
                        {u.chiz(s, i)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FiltrPopover({ 
  ustun, 
  satrlar, 
  joriyFiltr, 
  onSaqlash, 
  onYopish 
}: { 
  ustun: IlgorUstun<any>; 
  satrlar: any[]; 
  joriyFiltr: string[]; 
  onSaqlash: (t: string[]) => void; 
  onYopish: () => void;
}) {
  const [q, setQ] = useState('');
  const [tanlangan, setTanlangan] = useState<Set<string>>(new Set(joriyFiltr));
  
  const noyobQiymatlar = useMemo(() => {
    const s = new Set<string>();
    satrlar.forEach(row => {
      s.add(String(row[ustun.kalit] || ''));
    });
    return Array.from(s).sort((a,b) => String(a).localeCompare(String(b), tilLocale()));
  }, [satrlar, ustun.kalit]);

  const korinadiganlar = useMemo(() => {
    if(!q) return noyobQiymatlar;
    const lq = q.toLowerCase();
    return noyobQiymatlar.filter(v => v.toLowerCase().includes(lq));
  }, [noyobQiymatlar, q]);

  const hammaTanlangan = korinadiganlar.length > 0 && korinadiganlar.every(v => tanlangan.has(v));

  const toggleHammasi = () => {
    const newS = new Set(tanlangan);
    if (hammaTanlangan) {
      korinadiganlar.forEach(v => newS.delete(v));
    } else {
      korinadiganlar.forEach(v => newS.add(v));
    }
    setTanlangan(newS);
  };

  const toggleBiri = (v: string) => {
    const newS = new Set(tanlangan);
    if (newS.has(v)) newS.delete(v);
    else newS.add(v);
    setTanlangan(newS);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full mt-2 left-0 w-64 bg-[#1a1a1e] border border-border shadow-2xl rounded-xl z-50 overflow-hidden flex flex-col font-sans"
      onClick={e => e.stopPropagation()}
    >
      <div className="p-3 border-b border-white/10 flex items-center justify-between bg-black/20">
        <h4 className="text-white font-medium text-[13px] capitalize">{t('{nom} filtri', { nom: t(ustun.nom) })}</h4>
        <button onClick={onYopish} aria-label={t('Yopish')} title={t('Yopish')} className="text-text-dim hover:text-white cursor-pointer"><X size={14}/></button>
      </div>
      
      <div className="p-2 border-b border-white/10">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input 
            value={q} onChange={e => setQ(e.target.value)}
            placeholder={t('Qidirish...')}
            className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto p-2 custom-scrollbar flex flex-col gap-1">
        <label className="flex items-center gap-2 p-1.5 hover:bg-white/5 rounded cursor-pointer">
          <input 
            type="checkbox" 
            checked={hammaTanlangan} 
            onChange={toggleHammasi}
            className="rounded border-white/20 bg-black/50 text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-[13px] text-white font-medium">{t('(Barchasi)')}</span>
        </label>
        
        {korinadiganlar.length === 0 ? (
          <div className="text-text-dim text-center py-4 text-[12px]">{t('Topilmadi')}</div>
        ) : (
          korinadiganlar.map(v => (
            <label key={v} className="flex items-center gap-2 p-1.5 hover:bg-white/5 rounded cursor-pointer">
              <input 
                type="checkbox" 
                checked={tanlangan.has(v)} 
                onChange={() => toggleBiri(v)}
                className="rounded border-white/20 bg-black/50 text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[13px] text-text-dim truncate flex-1" title={v || t('(Bosh)')}>{v || t("(Bo'sh)")}</span>
            </label>
          ))
        )}
      </div>

      <div className="p-2 border-t border-white/10 bg-black/20 flex gap-2">
        <button 
          onClick={() => { setTanlangan(new Set()); onSaqlash([]); }}
          className="flex-1 py-1.5 text-[12px] font-medium text-text-dim hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
        >
          {t('Tozalash')}
        </button>
        <button 
          onClick={() => onSaqlash(Array.from(tanlangan))}
          className="flex-1 py-1.5 text-[12px] font-medium text-black bg-accent hover:bg-accent/90 rounded-lg transition-colors cursor-pointer"
        >
          {t("Qo'llash")}
        </button>
      </div>
    </motion.div>
  );
}
