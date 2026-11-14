/**
 * Mobil reliz manifesti (`/mobile-release.json`). Windows manifesti (`/desktop-release.json`) o‘zgarmaydi.
 *
 * {
 *   "android": { "version": "1.2.3", "generatedAtUtc": "...Z", "file": "smeta-1.2.3.apk", "bytes": 12345678,
 *                "sha256": "<64 hex>", "signed": true, "minSdk": 24 },
 *   "macos":   { same fields as android with file *.dmg, plus "notarized": boolean (notarized requires signed) },
 *   "ios":     { "mode": "pwa" | "testflight" | "appstore", "url": "https://testflight.apple.com/..." }
 * }
 *
 * Har platforma alohida tekshiriladi: biri yaroqsiz yoki yo‘q bo‘lsa — o‘sha karta «tez orada» holatida qoladi.
 * Android fayl havolasi manifestdagi maydonlardan yasaladi (tashqi URL qabul qilinmaydi) va faqat shu sayt origin’iga olib boradi.
 * iOS havolasi faqat https va faqat Apple’ning TestFlight / App Store hostlariga ruxsat.
 */
export type AndroidRelease = {
  version: string; generatedAtUtc: string; file: string; bytes: number; sha256: string; signed: boolean; minSdk: number;
};
export type IosMode = 'pwa' | 'testflight' | 'appstore';
export type IosRelease = { mode: IosMode; url: string | null };
export type MacRelease = {
  version: string; generatedAtUtc: string; file: string; bytes: number; sha256: string; signed: boolean; notarized: boolean;
};
export type MobileRelease = { android: AndroidRelease | null; ios: IosRelease | null; macos: MacRelease | null };

const IOS_HOSTS: Record<Exclude<IosMode, 'pwa'>, string> = { testflight: 'testflight.apple.com', appstore: 'apps.apple.com' };

export function parseAndroidRelease(input: unknown): AndroidRelease | null {
  if (!input || typeof input !== 'object') return null;
  const { version, generatedAtUtc, file, bytes, sha256, signed, minSdk } = input as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (typeof generatedAtUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(generatedAtUtc)) return null;
  const timestamp = new Date(generatedAtUtc);
  if (!Number.isFinite(timestamp.valueOf()) || timestamp.toISOString().slice(0, 19) !== generatedAtUtc.slice(0, 19)) return null;
  if (typeof file !== 'string' || !/^[\w][\w .-]*\.apk$/i.test(file) || file.includes('..') || file !== file.trim()) return null;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) return null;
  if (typeof sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(sha256)) return null;
  if (typeof signed !== 'boolean') return null;
  if (typeof minSdk !== 'number' || !Number.isInteger(minSdk) || minSdk < 21 || minSdk > 40) return null;
  return { version, generatedAtUtc, file, bytes, sha256: sha256.toLowerCase(), signed, minSdk };
}

export function parseMacRelease(input: unknown): MacRelease | null {
  if (!input || typeof input !== 'object') return null;
  const { version, generatedAtUtc, file, bytes, sha256, signed, notarized } = input as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (typeof generatedAtUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(generatedAtUtc)) return null;
  const timestamp = new Date(generatedAtUtc);
  if (!Number.isFinite(timestamp.valueOf()) || timestamp.toISOString().slice(0, 19) !== generatedAtUtc.slice(0, 19)) return null;
  if (typeof file !== 'string' || !/^[\w][\w .-]*\.dmg$/i.test(file) || file.includes('..') || file !== file.trim()) return null;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) return null;
  if (typeof sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(sha256)) return null;
  if (typeof signed !== 'boolean' || typeof notarized !== 'boolean' || (notarized && !signed)) return null;
  return { version, generatedAtUtc, file, bytes, sha256: sha256.toLowerCase(), signed, notarized };
}

export function parseIosRelease(input: unknown): IosRelease | null {
  if (!input || typeof input !== 'object') return null;
  const { mode, url } = input as Record<string, unknown>;
  if (mode === 'pwa') return url === undefined || url === null ? { mode, url: null } : null;
  if (mode !== 'testflight' && mode !== 'appstore') return null;
  if (typeof url !== 'string' || url !== url.trim()) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== IOS_HOSTS[mode] || parsed.username || parsed.password || parsed.port) return null;
  return { mode, url: parsed.href };
}

export function parseMobileRelease(input: unknown): MobileRelease {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return { android: parseAndroidRelease(record.android), ios: parseIosRelease(record.ios), macos: parseMacRelease(record.macos) };
}

export function macReleaseLinks(release: MacRelease) {
  return { download: `/macos/${release.version}/${release.sha256}/${encodeURIComponent(release.file)}` };
}

export function androidReleaseLinks(release: AndroidRelease) {
  return { download: `/android/${release.version}/${release.sha256}/${encodeURIComponent(release.file)}` };
}
