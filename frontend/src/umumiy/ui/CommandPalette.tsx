import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Calculator, User, Building, FileText } from 'lucide-react';
import { useObyektlar } from '../../api/hooks';
import { t } from '../../i18n/til';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { data: obyektlar } = useObyektlar();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isOpen) return null;

  const filteredObjects = (obyektlar || []).filter(o => o.obyekt.toLowerCase().includes(query.toLowerCase()));

  const handleSelect = (route: string) => {
    navigate(route);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-bg/80 backdrop-blur-sm p-4">
      <div className="bg-surface-2 border border-border w-full max-w-xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center px-4 py-3 border-b border-border gap-3">
          <Search className="text-text-dim" size={20} />
          <input
            autoFocus
            type="text"
            className="flex-1 bg-transparent border-none text-white focus:outline-none placeholder:text-text-dim/50"
            placeholder={t('Obyekt izlash yoki buyruq kiritish...')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="hidden sm:inline-block text-xs font-sans px-2 py-1 bg-surface rounded text-text-dim border border-border">ESC</kbd>
        </div>
        
        <div className="overflow-y-auto p-2">
          {query.length === 0 && (
            <div className="px-3 py-2 text-xs font-semibold text-text-dim uppercase tracking-wider mb-1">
              {t("Asosiy bo'limlar")}
            </div>
          )}
          {query.length === 0 && (
            <>
              <button onClick={() => handleSelect('/admin/obyektlar')} className="w-full flex items-center gap-3 px-3 py-2 text-left text-white hover:bg-surface rounded-lg transition-colors">
                <Building size={18} className="text-accent" /> {t('Obyektlar')}
              </button>
              <button onClick={() => handleSelect('/admin/shartnomalar')} className="w-full flex items-center gap-3 px-3 py-2 text-left text-white hover:bg-surface rounded-lg transition-colors">
                <FileText size={18} className="text-ok" /> {t('Shartnomalar')}
              </button>
              <button onClick={() => handleSelect('/admin/kalkulyator')} className="w-full flex items-center gap-3 px-3 py-2 text-left text-white hover:bg-surface rounded-lg transition-colors">
                <Calculator size={18} className="text-warn" /> {t('Kalkulyator')}
              </button>
              <button onClick={() => handleSelect('/boss')} className="w-full flex items-center gap-3 px-3 py-2 text-left text-white hover:bg-surface rounded-lg transition-colors">
                <User size={18} className="text-t-rs" /> {t('Rahbar paneli')}
              </button>
            </>
          )}

          {query.length > 0 && (
            <div className="px-3 py-2 text-xs font-semibold text-text-dim uppercase tracking-wider mb-1 mt-2">
              {t('Obyektlar')}
            </div>
          )}
          {query.length > 0 && filteredObjects.map(obj => (
            <button 
              key={obj.obyekt}
              onClick={() => {
                // Hozircha obyektlar ro'yxatiga olib boradi. 
                // Kelajakda to'g'ridan to'g'ri obyekt sahifasiga o'tkazish mumkin.
                handleSelect('/admin/holat');
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left text-text hover:text-white hover:bg-surface rounded-lg transition-colors"
            >
              <Building size={16} className="text-text-dim" /> {obj.obyekt}
            </button>
          ))}
          {query.length > 0 && filteredObjects.length === 0 && (
            <div className="px-4 py-8 text-center text-text-dim">
              Hech narsa topilmadi
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
