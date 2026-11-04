export function parseDesktopRelease(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const { version, arch, generatedAtUtc, file, bytes, sha256, signature, signerThumbprint } = input as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) || version !== version.trim()) return null;
  if (arch !== 'x64') return null;
  if (typeof generatedAtUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(generatedAtUtc)) return null;
  const timestamp = new Date(generatedAtUtc);
  if (!Number.isFinite(timestamp.valueOf()) || timestamp.toISOString().slice(0, 19) !== generatedAtUtc.slice(0, 19)) return null;
  if (typeof file !== 'string' || !/^[\w -]+[\w .-]*\.exe$/i.test(file) || file !== file.trim()) return null;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) return null;
  if (typeof sha256 !== 'string' || sha256.length !== 64 || !/^[a-f\d]{64}$/i.test(sha256)) return null;
  if (signature === 'NotSigned' ? signerThumbprint !== null :
    signature !== 'Valid' || typeof signerThumbprint !== 'string' || signerThumbprint.length !== 40 ||
      !/^[a-f\d]{40}$/i.test(signerThumbprint)) return null;

  return { version, arch, generatedAtUtc, file, bytes, sha256: sha256.toLowerCase(), signature, signerThumbprint };
}

export function desktopReleaseLinks(release: NonNullable<ReturnType<typeof parseDesktopRelease>>) {
  const base = `/windows/${release.version}/${release.sha256}/`;
  return { download: base + encodeURIComponent(release.file), guide: base + 'INSTALL_RU.md' };
}
