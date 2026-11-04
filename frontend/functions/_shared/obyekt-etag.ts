/** Serverdan kelgan muhr qat'iy tekshiriladi; arbitrary header uzatilmaydi. */
export function paketMuhr(v: unknown): v is string {
  return typeof v === 'string' && /^W\/"t2-paket-1-[a-f0-9]{32}"$/.test(v);
}
/** GET If-None-Match weak comparison. Bizning opaque-tagda vergul yo'q. */
export function muhrMos(header: string | null, etag: string): boolean {
  if (!header || !paketMuhr(etag)) return false;
  const opaque = etag.replace(/^W\//, '');
  return header.split(',').some(v => v.trim() === '*' || v.trim().replace(/^W\//, '') === opaque);
}
