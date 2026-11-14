import { Link, useLocation } from 'react-router-dom';
import { Bot, Building2, Calculator, ClipboardCheck, FileText, HardHat, Home, Menu, ShieldCheck, Truck, Users } from 'lucide-react';
import { t } from '../../i18n/til';
import { mobilTablar, mobilTabFaol, type MobilTab, type MobilTabIkonka } from '../../lib/mobil/mobilTablar';
import { useMobilEkran } from '../../lib/mobil/useMobilEkran';

const IKONKA: Record<MobilTabIkonka, typeof Home> = { Home, Building2, HardHat, FileText, ClipboardCheck, Calculator, Users, ShieldCheck, Truck, Bot, Menu };

type Props = {
  /** Joriy kompaniyadagi effektiv rol. */
  rol: string;
  /** Menyuda ko'rinadigan yo'llar (rol/ruxsat/modul filtridan o'tgan) — AdminShell beradi. */
  korinadi: ReadonlySet<string>;
  menyuOchiq: boolean;
  onMenyu: () => void;
};

/**
 * Telefon (<768px) pastki tab-paneli: Bosh sahifa · Obyektlar · rol ishi · Jarvis · Menyu (drawer).
 * Keng ekranda HECH NIMA chizmaydi — desktop DOM o'zgarmaydi. Jarvis — `ai:ochish` hodisasi (AiHelper to'liq ekran sheet).
 */
export function MobilTabPanel({ rol, korinadi, menyuOchiq, onMenyu }: Props) {
  const mobil = useMobilEkran();
  const { pathname } = useLocation();
  if (!mobil) return null;
  const tablar = mobilTablar(rol, korinadi);
  const kont = (tab: MobilTab) => {
    const I = IKONKA[tab.ikonka];
    return <><I size={22} strokeWidth={1.75} aria-hidden="true" /><span>{t(tab.nom)}</span></>;
  };
  return (
    <nav className="mobil-tab" aria-label={t('Pastki navigatsiya')} data-testid="mobil-tab">
      {tablar.map((tab) => {
        if (tab.tur === 'yol') {
          const faol = mobilTabFaol(tab, pathname);
          return <Link key={tab.id} to={tab.yol} className={`mobil-tab__item ${faol ? 'mobil-tab__item--faol' : ''}`} aria-current={faol ? 'page' : undefined} data-testid={`mobil-tab-${tab.id}`}>{kont(tab)}</Link>;
        }
        if (tab.tur === 'jarvis') {
          return <button key={tab.id} type="button" className="mobil-tab__item mobil-tab__item--ai" data-testid="mobil-tab-jarvis" aria-label={t('Jarvis AI ni ochish')}
            onClick={() => window.dispatchEvent(new CustomEvent('ai:ochish', { detail: {} }))}>{kont(tab)}</button>;
        }
        return <button key={tab.id} type="button" className={`mobil-tab__item ${menyuOchiq ? 'mobil-tab__item--faol' : ''}`} data-testid="mobil-tab-menyu" aria-expanded={menyuOchiq}
          aria-label={t('Menyuni ochish')} onClick={onMenyu}>{kont(tab)}</button>;
      })}
    </nav>
  );
}