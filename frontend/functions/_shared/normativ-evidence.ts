export const SHA256 = /^[0-9a-f]{64}$/;
export const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

export type NormativCandidate = {
  hujjat_id: string;
  norma_kod: string;
  tahrir: string;
  nom: string;
  source_sha: string;
  job_sha: string;
  sha256: string;
  r2_key: string;
  bayt: number;
  unit: string;
  sahifa_pdf: number | null;
  sahifa_bosma: string | null;
  bob_punkt: string | null;
  jadval_kod: string | null;
};

export async function normativEvidence(bucket: Pick<R2Bucket, 'get'>, row: NormativCandidate, company: number) {
  if (!DOCUMENT_ID.test(row.hujjat_id) || !SHA256.test(row.sha256) || !SHA256.test(row.source_sha) ||
      !SHA256.test(row.job_sha) || row.r2_key !== 'normativ/chunks/' + row.sha256 + '.json' ||
      !Number.isSafeInteger(row.bayt) || row.bayt < 1 || row.bayt > MAX_CHUNK_BYTES) {
    throw new Error('CHUNK_METADATA_INVALID');
  }
  const object = await bucket.get(row.r2_key);
  if (!object || object.size !== row.bayt) throw new Error('CHUNK_UNAVAILABLE');
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== row.bayt) throw new Error('CHUNK_SIZE_INVALID');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  if (sha !== row.sha256) throw new Error('CHUNK_SHA_INVALID');
  const unit = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as
    { source_sha?: unknown; matn?: unknown } | null;
  if (unit?.source_sha !== row.source_sha || typeof unit.matn !== 'string' || !unit.matn.trim()) {
    throw new Error('CHUNK_TEXT_UNAVAILABLE');
  }
  const params = new URLSearchParams({ kompaniya_id: String(company), hujjat_id: row.hujjat_id, sha256: row.sha256 });
  return {
    hujjat_id: row.hujjat_id,
    norma_kod: row.norma_kod,
    tahrir: row.tahrir,
    nom: row.nom,
    source_sha: row.source_sha,
    job_sha: row.job_sha,
    sha256: row.sha256,
    unit: row.unit,
    sahifa_pdf: row.sahifa_pdf,
    sahifa_bosma: row.sahifa_bosma,
    bob_punkt: row.bob_punkt,
    jadval_kod: row.jadval_kod,
    iqtibos: unit.matn.slice(0, 800),
    qisqartirilgan: unit.matn.length > 800,
    havola: '/api/normativ-qidir?' + params,
  };
}
