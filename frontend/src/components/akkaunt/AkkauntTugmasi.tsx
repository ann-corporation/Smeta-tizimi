/**
 * AkkauntTugmasi — qobiq burchagidagi akkaunt boshqaruvi (avatar, ism, kompaniya + rol, popover menyu).
 * Klaviatura: Enter/Space ochadi, Esc yopadi (fokus tugmaga qaytadi), ↑/↓ elementlar orasida yuradi, Tab menyudan chiqadi.
 * Chiqish — mavjud `tizimdanChiq` (auth mantig‘i o‘zgarmagan).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, Building2, Check, ChevronDown, CreditCard, Globe, LogOut, Settings, ShieldCheck, UserCog } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { tizimdanChiq } from '../../umumiy/kontekst/chiqish';
import { MavzuTanlagich } from '../../umumiy/ui/Mavzu';
import { useSessiya } from '../../api/hooks';
import { useMen } from '../../api/t2-men';
import { t } from '../../i18n/til';
import { initsiallar, kompaniyaRollari, rolNomi } from './akkaunt-lib';
import { zichlikOqi, zichlikQollash } from './korinish-sozlama';

export function Avatar({ ism, rasm, olcham = 32 }: { ism: string; rasm?: string | null; olcham?: number }) {
  const [xato, setXato] = useState(false);
  const stil = { width: olcham, height: olcham, fontSize: Math.round(olcham * 0.38) };
  if (rasm && !xato) {
    return <img src={rasm} alt="" referrerPolicy="no-referrer" onError={() => setXato(true)} className="rounded-full object-cover shrink-0" style={stil} />;
  }
  return (
    <span aria-hidden="true" className="rounded-full inline-flex items-center justify-center font-semibold shrink-0 select-none"
      style={{ ...stil, background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' }}>
      {ism}
    </span>
  );
}

const HAVOLALAR: Array<{ yol: string; nom: string; Ikon: typeof Settings }> = [
  { yol: '/admin/akkaunt?bolim=profil', nom: 'Akkaunt sozlamalari', Ikon: UserCog },
  { yol: '/admin/kompaniya', nom: 'Kompaniya sozlamalari', Ikon: Building2 },
  { yol: '/admin/akkaunt?bolim=xavfsizlik', nom: 'Xavfsizlik', Ikon: ShieldCheck },
  { yol: '/admin/akkaunt?bolim=bildirishnoma', nom: 'Bildirishnomalar', Ikon: Bell },
  { yol: '/admin/akkaunt?bolim=tarif', nom: 'Tarif va hisob', Ikon: CreditCard },
];

export function AkkauntTugmasi() {
  const k = useKompaniya();
  const men = useMen();
  const sess = useSessiya();
  const kamaytir = useReducedMotion();
  const [ochiq, setOchiq] = useState(false);
  const tugmaRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => { zichlikQollash(zichlikOqi()); }, []);

  const email = k.foydalanuvchi?.email ?? sess.data?.email ?? null;
  const ism = k.foydalanuvchi?.ism || k.foydalanuvchi?.login || email || '';
  const bosh = initsiallar(k.foydalanuvchi?.ism, k.foydalanuvchi?.login, email);

  const rollar = useMemo(() => {
    const m = men.data;
    const royxat = kompaniyaRollari(
      (m?.azoliklar ?? []).map((a) => ({ kompaniya_id: a.kompaniya_id, nom: a.nom, rol: a.rol, faol: a.faol })),
      (m?.context_kompaniyalar ?? []).filter((c) => c.faol).flatMap((c) => [
        { kompaniyaId: c.kompaniya_id, nom: c.nom, rol: c.membership_role },
        { kompaniyaId: c.kompaniya_id, nom: c.nom, rol: c.effective_role },
      ]),
    );
    return royxat;
  }, [men.data]);
  const joriyRollar = k.joriy ? (rollar.find((r) => r.kompaniyaId === k.joriy!.id)?.rollar ?? [k.joriy.rol]) : [];

  const yop = useCallback((fokus = true) => { setOchiq(false); if (fokus) tugmaRef.current?.focus(); }, []);

  useEffect(() => {
    if (!ochiq) return;
    const bosildi = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!panelRef.current?.contains(n) && !tugmaRef.current?.contains(n)) setOchiq(false);
    };
    document.addEventListener('mousedown', bosildi);
    return () => document.removeEventListener('mousedown', bosildi);
  }, [ochiq]);

  useEffect(() => {
    if (ochiq) {
      const birinchi = panelRef.current?.querySelector<HTMLElement>('[data-akkaunt-el]');
      birinchi?.focus();
    }
  }, [ochiq]);

  const klavish = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); yop(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const els = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[data-akkaunt-el]') ?? []);
      if (!els.length) return;
      e.preventDefault();
      const i = els.indexOf(document.activeElement as HTMLElement);
      const yangi = e.key === 'ArrowDown' ? (i + 1) % els.length : (i <= 0 ? els.length - 1 : i - 1);
      els[yangi].focus();
    }
  };

  const kompaniyaNomi = k.globalRejim ? t('Global rejim') : (k.joriy?.nom ?? (k.yuklanmoqda ? '…' : t('Kompaniya tanlanmagan')));
  const rolMatn = k.superadmin ? t('Superadmin') : (k.joriy ? t(rolNomi(k.joriy.rol)) : '—');
  const nomKorinish = ism || t('Foydalanuvchi');
  const panelId = `${id}-menyu`;

  const qator = (children: ReactNode) => <div className="px-3 py-2">{children}</div>;
  const unsur = 'flex w-full items-center gap-2 px-3 py-2 text-[13px] text-text rounded-md hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] cursor-pointer text-left';

  return (
    <div className="relative">
      <button
        ref={tugmaRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={ochiq}
        aria-controls={ochiq ? panelId : undefined}
        aria-label={t('Akkaunt menyusi')}
        onClick={() => setOchiq((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 hover:bg-[var(--surface-3)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--focus)] max-w-[300px]"
      >
        <Avatar ism={bosh} />
        <span className="hidden sm:flex flex-col items-start min-w-0 leading-tight">
          <span className="text-[12px] font-semibold text-text truncate max-w-[150px]">{nomKorinish}</span>
          <span className="flex items-center gap-1 min-w-0">
            <span className="fz-chip fz-chip--accent truncate max-w-[110px]" title={kompaniyaNomi}>{kompaniyaNomi}</span>
            <span className="fz-chip truncate max-w-[90px]">{rolMatn}</span>
          </span>
        </span>
        <ChevronDown size={14} className="text-text-dim hidden sm:block" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {ochiq && (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={t('Akkaunt menyusi')}
            onKeyDown={klavish}
            initial={kamaytir ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={kamaytir ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={kamaytir ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: kamaytir ? 0 : 0.14, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 z-50 w-[min(340px,calc(100vw-24px))] max-h-[min(80vh,640px)] overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface)]"
            style={{ boxShadow: 'var(--shadow-pop, 0 12px 32px rgba(0,0,0,.35))' }}
          >
            <div className="flex items-center gap-3 p-3 border-b border-[var(--border)]">
              <Avatar ism={bosh} olcham={40} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-text truncate">{nomKorinish}</div>
                <div className="text-[12px] text-text-dim truncate">{email ?? '—'}</div>
              </div>
            </div>

            <div className="p-2 border-b border-[var(--border)]">
              <div className="fz-panel__h px-2 pb-1"><span>{t('Ish joyi')}</span></div>
              {k.superadmin && (
                <button type="button" data-akkaunt-el onClick={() => { k.globalGa(); yop(); }} className={unsur} aria-current={k.globalRejim}>
                  <Globe size={14} aria-hidden="true" /><span className="flex-1 truncate">{t('Global rejim')}</span>{k.globalRejim && <Check size={14} aria-hidden="true" />}
                </button>
              )}
              {k.kompaniyalar.map((c) => (
                <button key={c.id} type="button" data-akkaunt-el onClick={() => { k.tanla(c.id); yop(); }} className={unsur} aria-current={!k.globalRejim && k.joriyId === c.id}>
                  <Building2 size={14} aria-hidden="true" /><span className="flex-1 truncate">{c.nom}</span>
                  {!k.globalRejim && k.joriyId === c.id && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
              {!k.kompaniyalar.length && !k.superadmin && <p className="px-3 py-2 text-[12px] text-text-mute">{k.yuklanmoqda ? '…' : t('Hali ish joyingiz yo‘q')}</p>}
            </div>

            <div className="p-2 border-b border-[var(--border)]">
              <div className="fz-panel__h px-2 pb-1"><span>{t('Mening rollarim')}</span></div>
              {k.joriy ? (
                <div className="px-2 flex flex-wrap gap-1">
                  {joriyRollar.map((r) => <span key={r} className="fz-chip fz-chip--accent">{t(rolNomi(r))}</span>)}
                </div>
              ) : <p className="px-2 text-[12px] text-text-mute">{t('Kompaniya tanlanmagan')}</p>}
            </div>

            <div className="p-2 border-b border-[var(--border)]">
              {HAVOLALAR.map(({ yol, nom, Ikon }) => (
                <Link key={yol} to={yol} data-akkaunt-el onClick={() => yop(false)} className={unsur}>
                  <Ikon size={14} aria-hidden="true" /><span>{t(nom)}</span>
                </Link>
              ))}
              <Link to="/admin/akkaunt?bolim=hub" data-akkaunt-el onClick={() => yop(false)} className={unsur}>
                <Settings size={14} aria-hidden="true" /><span>{t('Tizim sozlamalari')}</span>
              </Link>
            </div>

            {qator(
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-text-dim">{t('Mavzu')}</span>
                <MavzuTanlagich />
              </div>,
            )}

            <div className="p-2 border-t border-[var(--border)]">
              <button type="button" data-akkaunt-el onClick={() => { void tizimdanChiq(); }} className={`${unsur} text-[var(--danger)]`}>
                <LogOut size={14} aria-hidden="true" /><span>{t('Chiqish')}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
