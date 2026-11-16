import { r2Bosh, r2Oqi, r2Yoz, sha256Hex, type R2Bucket } from './r2-saqlash';
import type { ArxivDeps, IshNatija } from './arxiv';
import { JARVIS_MAX_ARCHIVE_BYTES as MAX_BYTES, validJarvisTurns, type JarvisTurn } from '../../src/lib/jarvis/conversation-contract';

type Turn = JarvisTurn;
type ArchiveKey = { row: string; sha256: string };
type ArchivePointer = ArchiveKey & { bytes: number };
const ROW = /^[1-9]\d{0,18}$/;
const SHA = /^[a-f0-9]{64}$/;
const path = (p: ArchiveKey) => `jarvis-history/v1/${p.row}/${p.sha256}.json`;
const archiveKey = (value: unknown): value is ArchiveKey => {
  const p = value as Partial<ArchiveKey> | null;
  return !!p && typeof p.row === 'string' && ROW.test(p.row) && typeof p.sha256 === 'string' && SHA.test(p.sha256);
};
const pointer = (value: unknown): value is ArchivePointer => {
  const p = value as ArchivePointer | null;
  return p !== null && archiveKey(p) &&
    Number.isInteger(p.bytes) && p.bytes >= 1 && p.bytes <= MAX_BYTES;
};

function parse(bytes: Uint8Array, row: string): Turn[] {
  const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as { v?: number; row?: string; turns?: Turn[] } | null;
  const turns = envelope?.turns;
  if (envelope?.v !== 1 || envelope.row !== row || !validJarvisTurns(turns)) {
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
      const reservation = await d.rpc('t2_jarvis_suhbat_archive_stage_v1', { p_row: p.row, p_sha256: p.sha256, p_bytes: p.bytes });
      if (reservation?.ok !== true || typeof reservation.staged !== 'boolean') throw new Error('JARVIS_ARCHIVE_STAGE');
      if (!reservation.staged) continue;
      // A duplicate writer may reuse a verified object. A delayed writer cannot replace a purge marker.
      const uploaded = await r2Yoz(bucket, path(p), bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }), httpMetadata: { contentType: 'application/json' } });
      if (uploaded === null && (await r2Bosh(bucket, path(p)))?.size === 0) continue;
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

export async function jarvisArchivePurge(
  d: Pick<ArxivDeps, 'rpc'>, bucket: R2Bucket, limit = 20,
): Promise<IshNatija> {
  const r: IshNatija = { jadval: 't2_jarvis_suhbat_r2_purge', partiya: 0, qator: 0, bayt: 0, xato: null, qoldi: false };
  try {
    const rows: unknown = await d.rpc('t2_jarvis_suhbat_archive_purge_pick_v1', { p_limit: limit });
    if (!Array.isArray(rows) || rows.length > limit || !rows.every(archiveKey)) throw new Error('JARVIS_PURGE_BATCH');
    for (const row of rows) {
      try {
        const key = path(row);
        // Keep an empty object at this never-reused key so an in-flight conditional PUT cannot resurrect the transcript.
        await r2Yoz(bucket, key, new Uint8Array(0), { httpMetadata: { contentType: 'application/octet-stream' } });
        if ((await r2Bosh(bucket, key))?.size !== 0) throw new Error('JARVIS_PURGE_VERIFY');
        const ack = await d.rpc('t2_jarvis_suhbat_archive_purge_ack_v1', { p_row: row.row, p_sha256: row.sha256 });
        if (ack?.ok !== true || typeof ack.acknowledged !== 'boolean') throw new Error('JARVIS_PURGE_ACK');
        if (ack.acknowledged) r.qator++;
      } catch { r.xato = 'JARVIS_ARCHIVE_PURGE_FAILED'; }
    }
    r.partiya = r.qator ? 1 : 0;
    r.qoldi = rows.length === limit && r.qator > 0;
  } catch { r.xato = 'JARVIS_ARCHIVE_PURGE_FAILED'; }
  return r;
}
