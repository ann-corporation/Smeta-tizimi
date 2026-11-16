import { r2Oqi, r2Yoz, sha256Hex, type R2Bucket } from './r2-saqlash';
import type { ArxivDeps, IshNatija } from './arxiv';

type Turn = { r: 'user' | 'ai'; m: string };
type ArchivePointer = { row: string; sha256: string; bytes: number };
const ROW = /^[1-9]\d{0,18}$/;
const SHA = /^[a-f0-9]{64}$/;
const MAX_BYTES = 32768;
const path = (p: ArchivePointer) => `jarvis-history/v1/${p.row}/${p.sha256}.json`;
const pointer = (value: unknown): value is ArchivePointer => {
  const p = value as ArchivePointer | null;
  return !!p && typeof p.row === 'string' && ROW.test(p.row) && typeof p.sha256 === 'string' && SHA.test(p.sha256) &&
    Number.isInteger(p.bytes) && p.bytes >= 1 && p.bytes <= MAX_BYTES;
};

function parse(bytes: Uint8Array, row: string): Turn[] {
  const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as { v?: number; row?: string; turns?: Turn[] } | null;
  const turns = envelope?.turns;
  if (envelope?.v !== 1 || envelope.row !== row || !Array.isArray(turns) || turns.length > 12 ||
    !turns.every(x => x && (x.r === 'ai' || x.r === 'user') && typeof x.m === 'string' && x.m.length <= 800 && !!x.m.trim())) {
    throw new Error('JARVIS_ARCHIVE_BODY');
  }
  return turns.map(x => ({ r: x.r, m: x.m }));
}

/** Only use the pointer returned by an authorized conversation RPC. The client never supplies an R2 key. */
export async function jarvisArchiveRead(bucket: R2Bucket | undefined, value: unknown): Promise<Turn[]> {
  if (!bucket || !pointer(value)) throw new Error('JARVIS_ARCHIVE_POINTER');
  const object = await r2Oqi(bucket, path(value));
  if (!object || object.size !== value.bytes) throw new Error('JARVIS_ARCHIVE_SIZE');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== value.bytes || await sha256Hex(bytes) !== value.sha256) throw new Error('JARVIS_ARCHIVE_HASH');
  return parse(bytes, value.row);
}

export async function jarvisArchiveBatch(
  d: Pick<ArxivDeps, 'rpc'>, bucket: R2Bucket, limit = 10,
): Promise<IshNatija> {
  const r: IshNatija = { jadval: 't2_jarvis_suhbat', partiya: 0, qator: 0, bayt: 0, xato: null, qoldi: false };
  try {
    const rows: unknown = await d.rpc('t2_jarvis_suhbat_archive_pick_v1', { p_limit: limit });
    if (!Array.isArray(rows) || rows.length > limit) throw new Error('JARVIS_ARCHIVE_BATCH');
    for (const item of rows) {
      if (!item || typeof item.row !== 'string' || !ROW.test(item.row) ||
        typeof item.body !== 'string' || item.body.length > MAX_BYTES) throw new Error('JARVIS_ARCHIVE_ROW');
      const bytes = new TextEncoder().encode(item.body);
      if (bytes.byteLength > MAX_BYTES) throw new Error('JARVIS_ARCHIVE_SIZE');
      parse(bytes, item.row);
      const p = { row: item.row, sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
      await r2Yoz(bucket, path(p), bytes, { httpMetadata: { contentType: 'application/json' } });
      await jarvisArchiveRead(bucket, p);
      const ack = await d.rpc('t2_jarvis_suhbat_archive_commit_v1', { p_row: p.row, p_sha256: p.sha256, p_bytes: p.bytes });
      if (ack?.ok !== true || typeof ack.archived !== 'boolean') throw new Error('JARVIS_ARCHIVE_COMMIT');
      if (ack.archived) { r.qator++; r.bayt += p.bytes; }
    }
    r.partiya = r.qator ? 1 : 0;
    r.qoldi = rows.length === limit && r.qator > 0;
  } catch { r.xato = 'JARVIS_ARCHIVE_FAILED'; }
  return r;
}
