import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { t } from '../../i18n/til';
import { SahifaYuklanmoqda } from './SahifaYuklanmoqda';

/**
 * Xato chegarasi (tez yuklash / barqarorlik, 2026-10-30): bitta sahifa yoki panel yiqilsa butun ilova
 * oq ekranga aylanmaydi — faqat o'sha joyda qisqa xabar va «Qayta urinish» (chegara qayta o'rnatiladi,
 * sahifa qayta yuklanmaydi). Ildizdagi (main.tsx) chegara — oxirgi himoya qatlami bo'lib qoladi.
 *
 *  • `SahifaChegarasi` — marshrut darajasi (qobiq Outlet'i atrofida): manzil o'zgarsa xato o'zi tozalanadi.
 *  • `PanelXatoChegarasi` — ikkinchi darajali panellar uchun ixcham variant (sahifaning qolgani ishlayveradi).
 */
type Props = {
  children: ReactNode;
  /** Shu qiymat o'zgarsa (masalan, pathname) — xato holati avtomatik tozalanadi. */
  kalit?: unknown;
  /** Ixcham ko'rinish (panel ichida). */
  ixcham?: boolean;
  /** Diagnostika uchun nom (konsolga). */
  nom?: string;
};
type Holat = { xato: Error | null; kalit: unknown };

/** Lazy chunk yuklanmadi (yangi deploy / tarmoq) — bunday holatda faqat sahifani yangilash yordam beradi. */
function chunkXatosimi(e: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|error loading dynamically/i.test(String(e?.message ?? e));
}

export class XatoChegarasi extends Component<Props, Holat> {
  state: Holat = { xato: null, kalit: this.props.kalit };

  static getDerivedStateFromError(xato: Error): Partial<Holat> { return { xato }; }

  static getDerivedStateFromProps(p: Props, s: Holat): Partial<Holat> | null {
    // Boshqa sahifaga o'tildi — eski xato yangi sahifani to'smasin.
    return p.kalit !== s.kalit ? { kalit: p.kalit, xato: null } : null;
  }

  componentDidCatch(xato: Error, info: ErrorInfo) {
    /* Xom texnik tafsilot FAQAT konsolga — ekranga chiqmaydi. */
    console.error(`[XatoChegarasi${this.props.nom ? `:${this.props.nom}` : ''}]`, xato, info.componentStack);
  }

  private qaytaUrin = () => this.setState({ xato: null });

  render() {
    const { xato } = this.state;
    if (!xato) return this.props.children;
    const chunk = chunkXatosimi(xato);
    const ixcham = this.props.ixcham;
    return (
      <div role="alert" className={ixcham ? 'fz-card flex flex-wrap items-center gap-2 p-3 text-[13px]' : 'm-4 fz-card flex flex-col items-start gap-2 p-5 sm:m-6'}>
        <div className="flex items-center gap-2 font-medium text-text">
          <AlertTriangle size={ixcham ? 14 : 16} className="flex-shrink-0 text-warn" aria-hidden="true" />
          <span>{ixcham ? t('Bu bo‘limni ko‘rsatib bo‘lmadi') : t('Sahifani ko‘rsatib bo‘lmadi')}</span>
        </div>
        {!ixcham && <p className="max-w-[460px] text-[13px] text-text-dim">{chunk
          ? t('Sahifa fayli yuklanmadi — ehtimol tizim yangilandi yoki internet uzildi.')
          : t('Kutilmagan nosozlik. Tizimning boshqa qismlari ishlayveradi.')}</p>}
        <div className="flex flex-wrap gap-2">
          {/* Chunk xatosida «Qayta urinish» foydasiz: React.lazy rad etilgan importni keshlaydi — faqat yangilash. */}
          {chunk
            ? <button type="button" onClick={() => location.reload()} className="fz-chip">{t('Sahifani yangilash')}</button>
            : <button type="button" onClick={this.qaytaUrin} className="fz-chip inline-flex items-center gap-1">
                <RotateCcw size={12} aria-hidden="true" />{t('Qayta urinish')}
              </button>}
        </div>
      </div>
    );
  }
}

/** Marshrut darajasi: xato chegarasi + lazy sahifa uchun Suspense (qobiq ko'rinib turadi). */
export function SahifaChegarasi({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <XatoChegarasi kalit={pathname} nom={pathname}>
      <Suspense fallback={<SahifaYuklanmoqda />}>{children}</Suspense>
    </XatoChegarasi>
  );
}

/** Ikkinchi darajali panel uchun ixcham chegara. */
export function PanelXatoChegarasi({ children, nom }: { children: ReactNode; nom?: string }) {
  return <XatoChegarasi ixcham nom={nom}>{children}</XatoChegarasi>;
}
