export type ReleaseMeta = { nom: string; tur: 'katalog' | 'chel_chas' | 'kalkulyatsiya_mash'; yil: number | null; kvartal: number | null; nds_holati: 'nomalum' | 'nds_siz' | 'nds_bilan'; valyuta: string | null };
export type CatalogRelease = { revision: string; metadata: ReleaseMeta; total_rows: number; source_sha256: string; stored_at: string; pricing_published: false };
export type ReferenceRelease = { revision: string; counts: { resources: number; price_observations: number; wages: number }; status: string };
type Part = { index: number; sha256: string; rows: number };
async function result(response: Response) {
  const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; [key: string]: unknown } | null;
  if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}
export async function listCatalogReleases(cursor?: string) {
  return await result(await fetch('/api/catalog-release' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { credentials: 'same-origin' })) as unknown as { releases: CatalogRelease[]; cursor: string | null };
}
export async function referenceRelease() {
  const data = await result(await fetch('/api/catalog-release?reference=c5822bb3610312bb', { credentials: 'same-origin' }));
  return data.reference as ReferenceRelease;
}
export async function uploadCatalogRelease(file: File, metadata: ReleaseMeta, rows: Record<string, unknown>[], progress?: (done: number, total: number) => void) {
  if (!rows.length || rows.length > 300000) throw new Error('Qatorlar soni 1–300000 bo‘lishi kerak');
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Fayl hajmi 25 MB dan oshmasin');
  const form = new FormData(); form.set('fayl', file);
  const source = await result(await fetch('/api/catalog-release', { method: 'POST', body: form, credentials: 'same-origin' }));
  const source_sha256 = source.source_sha256;
  const parts: Part[] = []; progress?.(0, rows.length);
  async function send(body: Record<string, unknown>) {
    // Content-addressed chunks can be retried safely. Partial uploads are not listed until finalize succeeds.
    return result(await fetch('/api/catalog-release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ source_sha256, metadata, ...body }) }));
  }
  for (let offset = 0; offset < rows.length; offset += 2000) {
    const data = await send({ action: 'chunk', index: parts.length, rows: rows.slice(offset, offset + 2000) });
    parts.push(data.part as Part); progress?.(Math.min(offset + 2000, rows.length), rows.length);
  }
  const done = await send({ action: 'finalize', parts, total_rows: rows.length });
  return done as unknown as { revision: string; rows: number; duplicate?: boolean };
}
