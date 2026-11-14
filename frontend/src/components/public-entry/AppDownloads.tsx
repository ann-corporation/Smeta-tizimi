import { useEffect, useState, type ReactNode } from 'react';
import { Apple, Globe2, Monitor, Smartphone, Tablet } from 'lucide-react';
import { tilLocale, useTil } from '../../i18n/til';
import { DesktopDownloadDetails, useDesktopRelease } from './DesktopDownload';
import { androidReleaseLinks, parseMobileRelease, macReleaseLinks, type AndroidRelease, type IosRelease, type MacRelease, type MobileRelease } from './mobile-release';
import { detectPlatform, type Platform } from './platform';

type T = ReturnType<typeof useTil>['t'];

/** `/mobile-release.json` — yo‘q yoki yaroqsiz bo‘lsa har ikki platforma null (kartalar «tez orada»). */
export function useMobileRelease(): MobileRelease {
  const [release, setRelease] = useState<MobileRelease>({ android: null, ios: null, macos: null });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(new URL('/mobile-release.json', window.location.origin), {
      signal: controller.signal, mode: 'same-origin', redirect: 'error', cache: 'no-cache',
    }).then(async response => {
      if (!response.ok) return;
      const data = parseMobileRelease(await response.json());
      if (!controller.signal.aborted) setRelease(data);
    }).catch(() => { /* manifest yo‘q — kartalar «tez orada» holatida qoladi */ });
    return () => controller.abort();
  }, []);
  return release;
}

function Card({ id, platform, current, icon, title, children }: {
  id: string; platform: Platform; current: boolean; icon: ReactNode; title: string; children: ReactNode;
}) {
  const { t } = useTil();
  return <article className="entry-dl-card" data-platform={platform} data-current={current ? 'true' : undefined} aria-labelledby={id}>
    <header>
      <span className="entry-dl-icon" aria-hidden="true">{icon}</span>
      <h3 id={id}>{title}</h3>
      {current && <span className="entry-dl-badge">{t('Sizning qurilmangiz')}</span>}
    </header>
    {children}
  </article>;
}

function Soon({ t, text }: { t: T; text: string }) {
  return <>
    <p className="entry-dl-soon"><span className="entry-dl-pill">{t('Tez orada')}</span></p>
    <p className="entry-dl-note">{text}</p>
  </>;
}

function HashRow({ hash }: { hash: string }) {
  const { t } = useTil();
  const [status, setStatus] = useState<'copied' | 'failed'>();
  async function copy() {
    try { await navigator.clipboard.writeText(hash); setStatus('copied'); } catch { setStatus('failed'); }
  }
  return <>
    <p className="entry-dl-note">{t('SHA-256 nazorat summasi')} <code>{hash}</code></p>
    <button type="button" className="entry-link-button" onClick={() => void copy()}>{t('SHA-256 ni nusxalash')}</button>
    <p role="status" className="entry-dl-note">{status === 'copied' && t('SHA-256 nusxalandi')}{status === 'failed' && t('SHA-256 ni qoʻlda nusxalang')}</p>
  </>;
}

function AndroidBody({ release }: { release: AndroidRelease }) {
  const { t, til } = useTil();
  const size = new Intl.NumberFormat(tilLocale(til), { style: 'unit', unit: 'megabyte', maximumFractionDigits: 2 }).format(release.bytes / 1_000_000);
  return <>
    <a className="entry-primary entry-dl-cta" href={new URL(androidReleaseLinks(release).download, window.location.origin).href} download={release.file}>
      {t('Android uchun APK yuklab olish')}
    </a>
    <p className="entry-dl-note">{t('Versiya {version} · {size}', { version: release.version, size })} · {t('Android API {minSdk} va yuqori', { minSdk: release.minSdk })}</p>
    {!release.signed && <p className="entry-dl-warn" role="note">{t('Bu sinov yigʻmasi (imzolanmagan) — faqat sinash uchun. Oʻrnatishdan oldin SHA-256 ni tekshiring.')}</p>}
    <HashRow hash={release.sha256} />
    <h4>{t('Oʻrnatish')}</h4>
    <ol className="entry-dl-steps">
      <li>{t('APK faylni yuklab oling va oching.')}</li>
      <li>{t('Telefon soʻrasa, «Nomaʼlum manbalarga ruxsat» (Install unknown apps) ni yoqing.')}</li>
      <li>{t('Oʻrnatishni tasdiqlang va ilovani oching.')}</li>
    </ol>
  </>;
}

function MacBody({ release }: { release: MacRelease }) {
  const { t, til } = useTil();
  const size = new Intl.NumberFormat(tilLocale(til), { style: 'unit', unit: 'megabyte', maximumFractionDigits: 2 }).format(release.bytes / 1_000_000);
  return <>
    <a className="entry-primary entry-dl-cta" href={new URL(macReleaseLinks(release).download, window.location.origin).href} download={release.file}>
      {t('macOS uchun DMG yuklab olish')}
    </a>
    <p className="entry-dl-note">{t('Versiya {version} · {size}', { version: release.version, size })}</p>
    {!release.notarized && <p className="entry-dl-warn" role="note">{t('Bu yigʻma Apple tomonidan tasdiqlanmagan — birinchi ochishda «Baribir ochish» kerak bo‘ladi. Oldin SHA-256 ni tekshiring.')}</p>}
    <HashRow hash={release.sha256} />
    <h4>{t('Oʻrnatish')}</h4>
    <ol className="entry-dl-steps">
      <li>{t('DMG ni oching va ilovani «Applications» papkasiga suring.')}</li>
      {!release.notarized && <li>{t('Ilovani ochishga urining — macOS bloklasa, «Sozlamalar → Maxfiylik va xavfsizlik» ga kiring.')}</li>}
      {!release.notarized && <li>{t('Pastda «Baribir ochish» (Open Anyway) tugmasini bosib, tasdiqlang.')}</li>}
      {release.notarized && <li>{t('Ilovani oching — qoʻshimcha sozlash kerak emas.')}</li>}
    </ol>
  </>;
}

/** Safari’da «Ulashish» → «Bosh ekranga qo‘shish» — kichik chizma (aria-hidden; matn qadamlarda). */
function IosGuide() {
  return <svg className="entry-dl-ios-art" viewBox="0 0 220 64" width="220" height="64" aria-hidden="true" focusable="false">
    <rect x="1" y="8" width="64" height="48" rx="10" fill="none" stroke="currentColor" strokeWidth="2" opacity=".5" />
    <path d="M33 40V18m0 0-7 7m7-7 7 7M24 32h-3v16h24V32h-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M78 32h22m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
    <rect x="114" y="8" width="64" height="48" rx="10" fill="none" stroke="currentColor" strokeWidth="2" opacity=".5" />
    <rect x="130" y="20" width="32" height="24" rx="6" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path d="M146 26v12m-6-6h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M190 32h22m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
  </svg>;
}

function IosBody({ release }: { release: IosRelease | null }) {
  const { t } = useTil();
  const store = release && release.mode !== 'pwa' && release.url ? release : null;
  return <>
    {store && <a className="entry-primary entry-dl-cta" href={store.url!} rel="noopener noreferrer">
      {store.mode === 'testflight' ? t('TestFlight orqali ochish') : t('App Store’dan yuklab olish')}
    </a>}
    <h4>{t('Safari orqali ilova sifatida oʻrnating')}</h4>
    <IosGuide />
    <ol className="entry-dl-steps">
      <li>{t('Saytni Safari’da oching.')}</li>
      <li>{t('Pastdagi «Ulashish» tugmasini bosing.')}</li>
      <li>{t('«Bosh ekranga qoʻshish» ni tanlang va tasdiqlang.')}</li>
    </ol>
    {!store && <p className="entry-dl-soon"><span className="entry-dl-pill">{t('App Store — tez orada')}</span></p>}
  </>;
}

export function AppDownloads() {
  const { t } = useTil();
  const [current] = useState<Platform>(() => detectPlatform());
  const desktop = useDesktopRelease();
  const mobile = useMobileRelease();

  return <section id="entry-download" className="entry-section entry-dl" aria-labelledby="entry-download-title">
    <div className="entry-section-head">
      <p className="entry-eyebrow"><i className="entry-rhomb" aria-hidden="true" />{t('Yuklab olish')}</p>
      <h2 id="entry-download-title">{t('Ilovani oʻz qurilmangizga oling')}</h2>
      <p className="entry-section-description">{t('Windows, macOS, Android, iPhone va iPad uchun — yoki oʻrnatmasdan, brauzerda.')}</p>
    </div>
    <div className="entry-dl-grid">
      <Card id="entry-dl-windows" platform="windows" current={current === 'windows'} icon={<Monitor size={22} />} title={t('Windows')}>
        {desktop ? <DesktopDownloadDetails release={desktop} /> : <Soon t={t} text={t('Windows oʻrnatuvchisi tez orada chiqadi.')} />}
      </Card>
      <Card id="entry-dl-android" platform="android" current={current === 'android'} icon={<Smartphone size={22} />} title={t('Android')}>
        {mobile.android ? <AndroidBody release={mobile.android} /> : <Soon t={t} text={t('Android ilovasi tez orada chiqadi.')} />}
      </Card>
      <Card id="entry-dl-macos" platform="macos" current={current === 'macos'} icon={<Apple size={22} />} title={t('macOS')}>
        {mobile.macos ? <MacBody release={mobile.macos} /> : <Soon t={t} text={t('macOS ilovasi tez orada chiqadi.')} />}
      </Card>
      <Card id="entry-dl-ios" platform="ios" current={current === 'ios'} icon={<Tablet size={22} />} title={t('iPhone / iPad')}>
        <IosBody release={mobile.ios} />
      </Card>
      <Card id="entry-dl-web" platform="other" current={false} icon={<Globe2 size={22} />} title={t('Brauzer')}>
        <p className="entry-dl-note">{t('Oʻrnatishsiz — hozir kirish uchun.')}</p>
        <a className="entry-secondary entry-dl-web-link" href="#entry-account">{t('Brauzerda ochish')}</a>
      </Card>
    </div>
  </section>;
}
