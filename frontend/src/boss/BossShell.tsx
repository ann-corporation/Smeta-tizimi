import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSessiya } from '../api/hooks';
import { gas } from '../api/client';
import ReactMarkdown from 'react-markdown';
import { LogOut, LayoutDashboard, HardHat, Truck, ShoppingCart, ShieldAlert, Bot, X, Send, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { tizimdanChiq } from '../umumiy/kontekst/chiqish';
import { t } from '../i18n/til';

/* ⚠️ 2026-08-17 (audit): bu darcha AVVAL SOXTA MAKET edi — ichida qo'lda
   yozilgan «Toshkent City - Lot 4», «Sement M400: 45 000 000 so'm» kabi
   TO'QILGAN raqamlar turardi va rahbar ularni bugungi haqiqiy xarajat deb
   o'qishi mumkin edi. Kiritish maydoni ham hech narsaga ulanmagan edi.
   Endi darcha AiHelper bilan bir xil `apiTitanAi` ga ulangan — javoblar
   faqat tizimdagi haqiqiy ma'lumotdan keladi.
   (AiHelper `/boss` da o'zini yashiradi, shuning uchun rahbarga faqat
   shu darcha qoladi — u ishlashi SHART.)
   2026-10-25 (Firuza): yon panel admin YonPanel bilan bir xil — fz-sidebar / fz-nav, faqat token ranglari. */
type BossAiXabar = { role: 'user' | 'ai'; text: string; salom?: boolean };

const salomXabari = (): BossAiXabar => ({
  role: 'ai', salom: true,
  text: t('Assalomu alaykum, Rahbar! Tizimdagi haqiqiy ma’lumot bo‘yicha javob beraman.') + '\n\n' + t('Masalan:') + '\n\n' +
    '- ' + t('Qaysi obyektda F2 orqada qolgan?') + '\n' +
    '- ' + t('Amfiteatrda bu oy qancha fakt bajarildi?') + '\n' +
    '- ' + t('Umumiy qoldiq qancha?'),
});

const NAV = [
  { yol: '/boss', end: true, nom: 'Umumiy tahlil', Ikon: LayoutDashboard },
  { yol: '/boss/kadrlar', nom: 'Kadrlar (tabel)', Ikon: HardHat },
  { yol: '/boss/texnika', nom: 'Texnika va logistika', Ikon: Truck },
  { yol: '/boss/taminot', nom: 'Ta’minot va sklad', Ikon: ShoppingCart },
  { yol: '/boss/sifat', nom: 'Sifat nazorati (QA)', Ikon: ShieldAlert },
];

export default function BossShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [mobil, setMobil] = useState(false);
  const [aiMatn, setAiMatn] = useState('');
  const [aiXabarlar, setAiXabarlar] = useState<BossAiXabar[]>(() => [salomXabari()]);
  const [aiYuklanmoqda, setAiYuklanmoqda] = useState(false);
  const aiOxiriRef = useRef<HTMLDivElement>(null);
  const sess = useSessiya();

  useEffect(() => { setMobil(false); }, [pathname]);

  useEffect(() => {
    if (isAiOpen) aiOxiriRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiXabarlar, aiYuklanmoqda, isAiOpen]);

  const aiYubor = async () => {
    const savol = aiMatn.trim();
    if (!savol || aiYuklanmoqda) return;
    setAiMatn('');
    setAiXabarlar((p) => [...p, { role: 'user', text: savol }]);
    setAiYuklanmoqda(true);
    try {
      /* Tarix: salomlashish yuborilmaydi (u AI javobi emas, UI matni) */
      const tarix = aiXabarlar
        .filter((m) => !m.salom)
        .map((m) => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text }] }));
      const res = await gas<any>('apiTitanAi', { obyekt: '', text: savol, history: tarix, mode: 'auto' });
      const javob = typeof res === 'string'
        ? res
        : (res?.text || res?.reply || res?.javob || res?.error || t('Javob bo‘sh keldi'));
      setAiXabarlar((p) => [...p, { role: 'ai', text: javob }]);
    } catch (e: any) {
      setAiXabarlar((p) => [...p, { role: 'ai', text: t('Xatolik yuz berdi: {x}', { x: e?.message || String(e) }) }]);
    } finally {
      setAiYuklanmoqda(false);
    }
  };

  useEffect(() => {
    if (sess.isError && sess.error?.message === "Sessiya yo'q") {
      document.cookie = 'sess=; Max-Age=0; path=/';
      navigate('/');
    }
  }, [sess.isError, sess.error, navigate]);

  return (
    <div className="os-app-shell relative flex h-screen overflow-hidden text-text">
      {/* YON PANEL — admin YonPanel bilan bir xil ko'rinish (doim ochiq; telefonda — tortma) */}
      <div className="fz-shell-rail fz-shell-rail--pinned">
        <aside className={`fz-sidebar fz-sidebar--open ${mobil ? 'fz-sidebar--mobile' : ''}`} aria-label={t('Rahbar ish joyi')}>
          <div className="fz-sidebar__brand">
            <span className="fz-sidebar__mark" aria-hidden="true">S</span>
            <span className="min-w-0">
              <span className="fz-sidebar__name">{t('Smeta tizimi')}</span>
              <span className="fz-sidebar__role">{t('Rahbar ish joyi')}</span>
            </span>
          </div>
          <div className="fz-sidebar__scroll">
            <nav className="fz-nav">
              <div className="fz-nav__group" role="presentation">{t('Boshqaruv')}</div>
              {NAV.map(({ yol, end, nom, Ikon }) => (
                <NavLink key={yol} to={yol} end={end} className={({ isActive }) => `fz-nav__item ${isActive ? 'fz-nav__item--active' : ''}`}>
                  <Ikon aria-hidden="true" /><span>{t(nom)}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="fz-sidebar__foot">
            <button type="button" onClick={tizimdanChiq} className="fz-nav__item fz-nav__item--danger">
              <LogOut aria-hidden="true" /><span>{t('Tizimdan chiqish')}</span>
            </button>
          </div>
        </aside>
      </div>
      {mobil && <button type="button" aria-label={t('Yopish')} className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobil(false)} />}

      {/* ISH MAYDONI */}
      <main className="os-workspace relative z-10 flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 lg:hidden">
          <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon" aria-label={t('Menyu')} aria-expanded={mobil} onClick={() => setMobil(true)}><Menu aria-hidden="true" /></button>
          <span className="font-semibold">{t('Rahbar ish joyi')}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden"><Outlet /></div>
      </main>

      {/* TITAN AI — tugma */}
      <button type="button" onClick={() => setIsAiOpen(true)} aria-label={t('Titan AI ni ochish')} title={t('Titan AI ni ochish')}
        className="fz-btn fz-btn--primary fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full p-0 shadow-[var(--shadow-pop)]">
        <Bot aria-hidden="true" style={{ width: 26, height: 26 }} />
      </button>

      {/* TITAN AI — tortma */}
      <AnimatePresence>
        {isAiOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            role="dialog" aria-label={t('Titan AI')}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[450px] flex-col border-l border-border bg-surface shadow-[var(--shadow-pop)]"
          >
            <div className="fz-card__head shrink-0">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]"><Bot size={18} aria-hidden="true" /></span>
                <div>
                  <h2 className="fz-card__title">{t('Titan AI')}</h2>
                  <div className="fz-card__sub inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />{t('Ulangan')}</div>
                </div>
              </div>
              <button type="button" onClick={() => setIsAiOpen(false)} aria-label={t('Yopish')} className="fz-btn fz-btn--ghost fz-btn--icon"><X aria-hidden="true" /></button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              {aiXabarlar.map((m, i) => (
                <div key={i}
                  className={m.role === 'user'
                    ? 'w-[85%] self-end rounded-lg rounded-tr-sm bg-[var(--accent-soft)] p-3'
                    : 'w-[85%] rounded-lg rounded-tl-sm border border-border bg-surface-2 p-3'}>
                  <div className="prose prose-sm max-w-none text-[13px] text-text [&_*]:text-inherit">
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {aiYuklanmoqda && (
                <div className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 py-3" aria-label={t('Javob kutilmoqda')}>
                  {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-mute/60" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              )}
              <div ref={aiOxiriRef} />
            </div>

            <div className="border-t border-border p-4">
              <div className="relative">
                <input
                  type="text"
                  value={aiMatn}
                  onChange={(e) => setAiMatn(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void aiYubor(); }}
                  placeholder={t('AI ga savol bering...')}
                  aria-label={t('AI ga savol bering...')}
                  className="input h-10 w-full pl-3 pr-12"
                />
                <button type="button" onClick={() => void aiYubor()} disabled={!aiMatn.trim() || aiYuklanmoqda}
                  aria-label={t('Yuborish')} title={t('Yuborish')}
                  className="fz-btn fz-btn--primary fz-btn--icon fz-btn--sm absolute right-1.5 top-1/2 -translate-y-1/2">
                  <Send aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-text-mute">{t('AI xato qilishi mumkin. Moliya qarorlarida e’tiborli bo‘ling.')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
