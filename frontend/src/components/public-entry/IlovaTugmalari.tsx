import { Monitor, Smartphone } from 'lucide-react';
import { useTil } from '../../i18n/til';
import { useMobileRelease } from './AppDownloads';
import { useDesktopRelease } from './DesktopDownload';
import { desktopReleaseLinks } from './desktop-release';
import { androidReleaseLinks } from './mobile-release';

/**
 * Kirish formasi tagidagi ixcham yuklab olish tugmalari (egasi 2026-11-18: «Windows kirish sahifasida turishi kerak»).
 * Manifest bo'lmasa tugma ko'rinmaydi; to'liq kartalar (SHA-256, yo'riqnoma) pastdagi «Yuklab olish» bo'limida.
 */
export function IlovaTugmalari() {
  const { t } = useTil();
  const desktop = useDesktopRelease();
  const { android } = useMobileRelease();
  if (!desktop && !android) return null;
  return (
    <div className="entry-auth-foot" data-testid="ilova-tugmalari" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <span>{t('Ilovani yuklab oling:')}</span>
      {desktop && (
        <a className="underline" href={desktopReleaseLinks(desktop).download} download>
          <Monitor size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> {t('Windows')} {desktop.version}
        </a>
      )}
      {android && (
        <a className="underline" href={androidReleaseLinks(android).download} download>
          <Smartphone size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> {t('Android')} {android.version}
        </a>
      )}
    </div>
  );
}
