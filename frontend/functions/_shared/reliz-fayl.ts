/**
 * Ochiq reliz fayllari (APK / DMG / Windows installer) — sayt origin'idan berish.
 * URL: /<platforma>/<versiya>/<sha256>/<fayl>  (mijoz tomoni: src/components/public-entry/mobile-release.ts, desktop-release.ts).
 * R2 kaliti prefiksi KODDA qat'iy: foydalanuvchi kirishi hech qachon boshqa prefiksga yetib bormaydi.
 *   windows -> windows/<ver>/<sha>/<fayl>        (desktop-release-r2.ps1 bilan bir xil joy)
 *   android -> reliz/android/<ver>/<sha>/<fayl>
 *   macos   -> reliz/macos/<ver>/<sha>/<fayl>
 */
export type RelizPlatforma = 'windows' | 'android' | 'macos';
type Env = { R2_CANONICAL?: R2Bucket };

const VERSION = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const FILE: Record<RelizPlatforma, RegExp> = {
  windows: /^(?:[\w -]+[\w .-]*\.(?:exe|msi)|INSTALL_RU\.md)$/i,
  android: /^[\w][\w .-]*\.apk$/i,
  macos: /^[\w][\w .-]*\.dmg$/i,
};

export function relizKalit(platforma: RelizPlatforma, pathname: string): { key: string; file: string; sha: string } | null {
  const parts = pathname.split('/');
  // ['', platforma, ver, sha, fayl]
  if (parts.length !== 5 || parts[0] !== '' || parts[1] !== platforma) return null;
  const [, , ver, sha, rawFile] = parts;
  if (!VERSION.test(ver) || !SHA256.test(sha) || !rawFile) return null;
  if (/%(?:2f|5c|00)/i.test(rawFile)) return null;
  let file: string;
  try { file = decodeURIComponent(rawFile); } catch { return null; }
  if (file.includes('/') || file.includes('\\') || file.includes('..') || file !== file.trim() || !FILE[platforma].test(file)) return null;
  if (/\.md$/i.test(file) && file !== 'INSTALL_RU.md') return null;
  const prefix = platforma === 'windows' ? 'windows' : `reliz/${platforma}`;
  return { key: `${prefix}/${ver}/${sha}/${file}`, file, sha };
}

function contentType(file: string): string {
  const f = file.toLowerCase();
  if (f.endsWith('.apk')) return 'application/vnd.android.package-archive';
  if (f.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (f.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  if (f.endsWith('.msi')) return 'application/x-msi';
  if (f.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'application/octet-stream';
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** Bitta "bytes=a-b" diapazoni. null = Range yo'q/qo'llanmaydi (to'liq javob); 'bad' = qoniqtirib bo'lmaydi (416). */
function parseRange(header: string | null, size: number): { offset: number; length: number } | null | 'bad' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n) || n <= 0 || size === 0) return 'bad';
    const length = Math.min(n, size);
    return { offset: size - length, length };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (!Number.isSafeInteger(start) || start >= size || end < start) return 'bad';
  return { offset: start, length: end - start + 1 };
}

export async function relizJavob(platforma: RelizPlatforma, request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const parsed = relizKalit(platforma, new URL(request.url).pathname);
  if (!parsed || !env.R2_CANONICAL) return notFound();
  const { key, file, sha } = parsed;
  const etag = `"${sha}"`;
  const headers = new Headers({
    'Content-Type': contentType(file),
    'Content-Disposition': `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    ETag: etag,
  });
  const shaOk = (o: R2Object) => { const m = o.customMetadata?.sha256; return !m || m.toLowerCase() === sha; };

  const head = await env.R2_CANONICAL.head(key);
  if (!head || !shaOk(head)) return notFound();
  const inm = request.headers.get('If-None-Match');
  if (inm && inm.split(',').some(t => t.trim() === etag || t.trim() === '*')) {
    headers.delete('Content-Disposition'); headers.delete('Content-Type');
    return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') {
    headers.set('Content-Length', String(head.size));
    return new Response(null, { status: 200, headers });
  }
  const range = parseRange(request.headers.get('Range'), head.size);
  if (range === 'bad') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}`, 'Cache-Control': 'no-store' } });
  }
  const obj = await env.R2_CANONICAL.get(key, range ? { range } : undefined);
  if (!obj || !('body' in obj) || !obj.body || !shaOk(obj)) return notFound();
  if (range) {
    headers.set('Content-Length', String(range.length));
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(head.size));
  return new Response(obj.body, { status: 200, headers });
}
