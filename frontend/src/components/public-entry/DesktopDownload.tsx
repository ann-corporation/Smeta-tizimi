import { useEffect, useState } from 'react';
import { tilLocale, useTil } from '../../i18n/til';
import { desktopReleaseLinks, parseDesktopRelease } from './desktop-release';

export function DesktopDownload() {
  const { t, til } = useTil();
  const [release, setRelease] = useState<ReturnType<typeof parseDesktopRelease>>(null);
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed'>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch(new URL('/desktop-release.json', window.location.origin), {
      signal: controller.signal,
      mode: 'same-origin',
      redirect: 'error',
      cache: 'no-cache',
    }).then(async response => {
      if (!response.ok) return;
      const data = parseDesktopRelease(await response.json());
      if (!controller.signal.aborted) setRelease(data);
    }).catch(() => { /* A missing or unreadable release keeps the block hidden. */ });
    return () => controller.abort();
  }, []);

  if (!release) return null;
  const links = desktopReleaseLinks(release);
  const size = new Intl.NumberFormat(tilLocale(til), {
    style: 'unit', unit: 'megabyte', maximumFractionDigits: 2,
  }).format(release.bytes / 1_000_000);

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return <div style={{ marginBlockStart: '1rem', minWidth: 0, overflowWrap: 'anywhere' }}>
    <a className="entry-secondary" href={new URL(links.download, window.location.origin).href} download={release.file}>
      {t('Windows uchun yuklab olish')}
    </a>
    <p>{t('Versiya {version} · {size}', { version: release.version, size })}</p>
    {release.signature === 'NotSigned' && <p>{t('Oʻrnatish fayli raqamli imzolanmagan. Oʻrnatishdan oldin SHA-256 ni tekshiring.')}</p>}
    <p>{t('SHA-256 nazorat summasi')} <code>{release.sha256}</code></p>
    <button type="button" className="entry-link-button" onClick={() => void copyHash(release.sha256)}>{t('SHA-256 ni nusxalash')}</button>
    <p role="status">{copyStatus === 'copied' && t('SHA-256 nusxalandi')}{copyStatus === 'failed' && t('SHA-256 ni qoʻlda nusxalang')}</p>
    <a href={new URL(links.guide, window.location.origin).href} hrefLang="ru" download>{t('Oʻrnatish yoʻriqnomasi (rus tilida)')}</a>
  </div>;
}
