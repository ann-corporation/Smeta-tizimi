import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopDownload } from './DesktopDownload';
import { parseDesktopRelease } from './desktop-release';

const manifest = {
  version: '9.8.7', arch: 'x64', generatedAtUtc: '2026-01-02T10:00:00.1234567Z', file: 'Example App_9.8.7_x64-setup.exe',
  bytes: 7_500_000, sha256: 'ab'.repeat(32), signature: 'NotSigned', signerThumbprint: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('desktop release', () => {
  it.each([
    { version: '../x' }, { arch: 'arm64' }, { generatedAtUtc: '2026-02-30T10:00:00Z' }, { bytes: 0 }, { sha256: 'invalid' },
    { file: '//example.invalid/setup.exe' }, { file: '..\\setup.exe' },
    { file: '%2fsetup.exe' }, { file: 'https://example.invalid/setup.exe' },
    { signature: 'HashMismatch' }, { signature: 'Valid' }, { signerThumbprint: 'a'.repeat(40) },
  ])('rejects invalid metadata %j', override => {
    expect(parseDesktopRelease({ ...manifest, ...override })).toBeNull();
  });

  it('accepts valid signed metadata', () => {
    expect(parseDesktopRelease({ ...manifest, signature: 'Valid', signerThumbprint: 'A'.repeat(40) })).not.toBeNull();
  });

  it.each([
    () => new Response(null, { status: 404 }),
    () => new Response('<html>fallback</html>'),
    () => Response.json({ ...manifest, generatedAtUtc: undefined }),
  ])('keeps the CTA hidden without a valid release', async response => {
    const fetchRelease = vi.fn(async () => response());
    vi.stubGlobal('fetch', fetchRelease);
    const { container } = render(<DesktopDownload />);
    await act(async () => { await fetchRelease.mock.results[0].value; });
    expect(container.childElementCount).toBe(0);
  });

  it('shows unsigned metadata, confines links to this origin and copies the hash', async () => {
    const fetchRelease = vi.fn(async () => Response.json({
      ...manifest, downloadUrl: 'https://example.invalid/setup.exe', guideUrl: '//example.invalid/guide',
    }));
    vi.stubGlobal('fetch', fetchRelease);
    const writeText = vi.fn(async () => {});
    const clipboard = vi.spyOn(window, 'navigator', 'get').mockReturnValue({ clipboard: { writeText } } as unknown as Navigator);
    try {
      render(<DesktopDownload />);
      const download = await screen.findByRole('link', { name: 'Windows uchun yuklab olish' });
      const base = `${window.location.origin}/windows/9.8.7/${manifest.sha256}/`;
      expect(download.getAttribute('href')).toBe(base + 'Example%20App_9.8.7_x64-setup.exe');
      expect(screen.getByRole('link', { name: /yoʻriqnomasi/ }).getAttribute('href')).toBe(base + 'INSTALL_RU.md');
      expect(screen.getByText(/raqamli imzolanmagan/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'SHA-256 ni nusxalash' }));
      await screen.findByText('SHA-256 nusxalandi');
      expect(writeText).toHaveBeenCalledWith(manifest.sha256);
      expect(fetchRelease).toHaveBeenCalledWith(new URL('/desktop-release.json', window.location.origin),
        expect.objectContaining({ mode: 'same-origin', redirect: 'error' }));
    } finally {
      clipboard.mockRestore();
    }
  });
});
