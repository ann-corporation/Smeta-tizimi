import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDownloads } from './AppDownloads';
import { androidReleaseLinks, macReleaseLinks, parseAndroidRelease, parseIosRelease, parseMacRelease, parseMobileRelease } from './mobile-release';
import { detectPlatform } from './platform';
import { tilQoy } from '../../i18n/til';

const android = {
  version: '1.2.3', generatedAtUtc: '2026-01-02T10:00:00Z', file: 'smeta-1.2.3-debug.apk',
  bytes: 12_345_678, sha256: 'ab'.repeat(32), signed: false, minSdk: 24,
};
const mac = {
  version: '1.2.3', generatedAtUtc: '2026-01-02T10:00:00Z', file: 'Smeta_1.2.3.dmg',
  bytes: 20_000_000, sha256: 'ef'.repeat(32), signed: false, notarized: false,
};
const windows = {
  version: '9.8.7', arch: 'x64', generatedAtUtc: '2026-01-02T10:00:00Z', file: 'App_9.8.7_x64-setup.exe',
  bytes: 7_500_000, sha256: 'cd'.repeat(32), signature: 'NotSigned', signerThumbprint: null,
};

function stubFetch(files: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: URL | string) => {
    const path = new URL(String(input)).pathname;
    return path in files ? Response.json(files[path]) : new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
async function renderSettled() {
  const view = render(<AppDownloads />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return view;
}
const card = (name: string) => screen.getByRole('article', { name });

beforeEach(() => tilQoy('uz'));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); tilQoy('uz'); });

describe('mobile release manifest', () => {
  it.each([
    { version: '1.2' }, { generatedAtUtc: '2026-02-30T10:00:00Z' }, { file: 'https://example.invalid/a.apk' }, { file: '../a.apk' },
    { file: '//example.invalid/a.apk' }, { file: 'a.exe' }, { bytes: 0 }, { sha256: 'abc' }, { sha256: 'zz'.repeat(32) },
    { signed: 'yes' }, { minSdk: 5 }, { minSdk: 24.5 },
  ])('rejects invalid android metadata %j', override => {
    expect(parseAndroidRelease({ ...android, ...override })).toBeNull();
  });

  it('accepts valid android metadata and builds a same-origin path from fields only', () => {
    const release = parseAndroidRelease({ ...android, sha256: 'AB'.repeat(32), url: 'https://example.invalid/x.apk' });
    expect(release?.sha256).toBe('ab'.repeat(32));
    expect(androidReleaseLinks(release!).download).toBe(`/android/1.2.3/${'ab'.repeat(32)}/smeta-1.2.3-debug.apk`);
  });

  it.each([
    { mode: 'testflight' }, { mode: 'testflight', url: 'http://testflight.apple.com/join/x' },
    { mode: 'testflight', url: 'https://example.invalid/join/x' }, { mode: 'appstore', url: 'https://testflight.apple.com/join/x' },
    { mode: 'appstore', url: 'https://apps.apple.com.evil.invalid/app/1' }, { mode: 'appstore', url: 'https://user@apps.apple.com/app/1' },
    { mode: 'appstore', url: 'javascript:alert(1)' }, { mode: 'pwa', url: 'https://apps.apple.com/app/1' }, { mode: 'beta' },
  ])('rejects invalid ios metadata %j', input => {
    expect(parseIosRelease(input)).toBeNull();
  });

  it('accepts pwa and Apple store links', () => {
    expect(parseIosRelease({ mode: 'pwa' })).toEqual({ mode: 'pwa', url: null });
    expect(parseIosRelease({ mode: 'testflight', url: 'https://testflight.apple.com/join/abc' })?.url).toBe('https://testflight.apple.com/join/abc');
    expect(parseIosRelease({ mode: 'appstore', url: 'https://apps.apple.com/uz/app/x/id1' })?.mode).toBe('appstore');
  });

  it('validates each platform independently and tolerates garbage', () => {
    expect(parseMobileRelease({ android: { ...android, sha256: 'bad' }, ios: { mode: 'pwa' } })).toEqual({ android: null, ios: { mode: 'pwa', url: null }, macos: null });
    expect(parseMobileRelease(null)).toEqual({ android: null, ios: null, macos: null });
    expect(parseMobileRelease('<html>')).toEqual({ android: null, ios: null, macos: null });
  });
});

describe('macOS release', () => {
  it.each([
    { file: 'a.exe' }, { file: 'https://example.invalid/a.dmg' }, { file: '../a.dmg' }, { sha256: 'abc' }, { version: '1' },
    { signed: 'yes' }, { notarized: 1 }, { signed: false, notarized: true },
  ])('rejects invalid macos metadata %j', override => {
    expect(parseMacRelease({ ...mac, ...override })).toBeNull();
  });
  it('accepts valid metadata and builds a same-origin path', () => {
    const release = parseMacRelease({ ...mac, signed: true, notarized: true, url: 'https://example.invalid/x.dmg' });
    expect(macReleaseLinks(release!).download).toBe(`/macos/1.2.3/${'ef'.repeat(32)}/Smeta_1.2.3.dmg`);
  });
});

describe('platform detection', () => {
  it.each([
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120', userAgentData: { platform: 'Android' } }, 'android'],
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/120' }, 'android'],
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604' }, 'ios'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', maxTouchPoints: 5 }, 'ios'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', maxTouchPoints: 0 }, 'macos'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605' }, 'macos'],
    [{ userAgent: 'x', userAgentData: { platform: 'macOS' }, maxTouchPoints: 0 }, 'macos'],
    [{ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604' }, 'ios'],
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', userAgentData: { platform: 'Windows' } }, 'windows'],
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120' }, 'windows'],
    [{}, 'other'], [null, 'other'],
  ] as const)('%j -> %s', (nav, expected) => {
    expect(detectPlatform(nav as never)).toBe(expected);
  });
});

describe('AppDownloads', () => {
  it('without manifests shows 3 platform cards plus browser; windows/android "tez orada", iOS PWA steps', async () => {
    stubFetch({});
    await renderSettled();
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(within(card('Windows')).getByText('Tez orada')).toBeTruthy();
    expect(within(card('Android')).getByText('Tez orada')).toBeTruthy();
    expect(within(card('Android')).queryByRole('link', { name: /APK/ })).toBeNull();
    const ios = card('iPhone / iPad');
    expect(within(ios).getByText(/«Ulashish»/)).toBeTruthy();
    expect(within(ios).getByText(/Bosh ekranga/)).toBeTruthy();
    expect(within(ios).getByText('App Store — tez orada')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Brauzerda ochish' }).getAttribute('href')).toBe('#entry-account');
  });

  it('renders windows and android downloads with warning, hash and same-origin links', async () => {
    const fetchMock = stubFetch({ '/desktop-release.json': windows, '/mobile-release.json': { android, ios: { mode: 'pwa' } } });
    await renderSettled();
    expect(fetchMock).toHaveBeenCalledWith(new URL('/mobile-release.json', window.location.origin), expect.objectContaining({ mode: 'same-origin', redirect: 'error' }));
    const win = card('Windows');
    expect(within(win).getByRole('link', { name: 'Windows uchun yuklab olish' }).getAttribute('href')).toBe(`${window.location.origin}/windows/9.8.7/${'cd'.repeat(32)}/App_9.8.7_x64-setup.exe`);
    const and = card('Android');
    expect(within(and).getByRole('link', { name: 'Android uchun APK yuklab olish' }).getAttribute('href'))
      .toBe(`${window.location.origin}/android/1.2.3/${'ab'.repeat(32)}/smeta-1.2.3-debug.apk`);
    expect(within(and).getByRole('note').textContent).toMatch(/imzolanmagan/);
    expect(within(and).getByText('ab'.repeat(32))).toBeTruthy();
    expect(within(and).getByText(/Nomaʼlum manbalarga ruxsat/)).toBeTruthy();
    expect(within(and).getByRole('button', { name: 'SHA-256 ni nusxalash' })).toBeTruthy();
  });

  it('signed android release has no unsigned warning; invalid android stays "tez orada"', async () => {
    stubFetch({ '/mobile-release.json': { android: { ...android, signed: true } } });
    await renderSettled();
    expect(within(card('Android')).queryByRole('note')).toBeNull();
    cleanup();
    stubFetch({ '/mobile-release.json': { android: { ...android, sha256: 'bad' } } });
    await renderSettled();
    expect(within(card('Android')).getByText('Tez orada')).toBeTruthy();
  });

  it('shows the store link when ios mode is testflight/appstore, only for Apple hosts', async () => {
    stubFetch({ '/mobile-release.json': { ios: { mode: 'testflight', url: 'https://testflight.apple.com/join/abc' } } });
    await renderSettled();
    const link = within(card('iPhone / iPad')).getByRole('link', { name: 'TestFlight orqali ochish' });
    expect(link.getAttribute('href')).toBe('https://testflight.apple.com/join/abc');
    expect(within(card('iPhone / iPad')).queryByText('App Store — tez orada')).toBeNull();
    cleanup();
    stubFetch({ '/mobile-release.json': { ios: { mode: 'appstore', url: 'https://example.invalid/app' } } });
    await renderSettled();
    expect(within(card('iPhone / iPad')).queryByRole('link', { name: /App Store/ })).toBeNull();
    expect(within(card('iPhone / iPad')).getByText('App Store — tez orada')).toBeTruthy();
  });

  it('macOS card: absent -> tez orada; unsigned -> Baribir ochish steps; notarized -> no warning', async () => {
    stubFetch({});
    await renderSettled();
    expect(within(card('macOS')).getByText('Tez orada')).toBeTruthy();
    cleanup();
    stubFetch({ '/mobile-release.json': { macos: mac } });
    await renderSettled();
    const m = card('macOS');
    expect(within(m).getByRole('link', { name: 'macOS uchun DMG yuklab olish' }).getAttribute('href'))
      .toBe(`${window.location.origin}/macos/1.2.3/${'ef'.repeat(32)}/Smeta_1.2.3.dmg`);
    expect(within(m).getByText(/Baribir ochish/, { selector: 'li' })).toBeTruthy();
    expect(within(m).getByRole('note')).toBeTruthy();
    cleanup();
    stubFetch({ '/mobile-release.json': { macos: { ...mac, signed: true, notarized: true } } });
    await renderSettled();
    expect(within(card('macOS')).queryByRole('note')).toBeNull();
    expect(within(card('macOS')).queryByText(/Baribir ochish/)).toBeNull();
  });

  it('highlights macOS on a Mac but iOS on an iPad that reports Macintosh', async () => {
    stubFetch({});
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605';
    let nav = vi.spyOn(window, 'navigator', 'get').mockReturnValue({ userAgent: ua, maxTouchPoints: 0 } as unknown as Navigator);
    await renderSettled();
    expect(card('macOS').getAttribute('data-current')).toBe('true');
    expect(card('iPhone / iPad').getAttribute('data-current')).toBeNull();
    nav.mockRestore(); cleanup();
    nav = vi.spyOn(window, 'navigator', 'get').mockReturnValue({ userAgent: ua, maxTouchPoints: 5 } as unknown as Navigator);
    try {
      await renderSettled();
      expect(card('iPhone / iPad').getAttribute('data-current')).toBe('true');
      expect(card('macOS').getAttribute('data-current')).toBeNull();
    } finally { nav.mockRestore(); }
  });

  it('highlights the visitor platform', async () => {
    stubFetch({});
    const nav = vi.spyOn(window, 'navigator', 'get').mockReturnValue({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome', clipboard: undefined } as unknown as Navigator);
    try {
      await renderSettled();
      expect(card('Android').getAttribute('data-current')).toBe('true');
      expect(within(card('Android')).getByText('Sizning qurilmangiz')).toBeTruthy();
      expect(card('Windows').getAttribute('data-current')).toBeNull();
    } finally { nav.mockRestore(); }
  });
});
