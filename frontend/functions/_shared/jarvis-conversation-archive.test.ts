import { expect, it, vi } from 'vitest';
import { jarvisArchiveBatch, jarvisArchivePurge, jarvisArchiveRead } from './jarvis-conversation-archive';
import { sha256Hex } from './r2-saqlash';

const body = JSON.stringify({ v: 1, row: '90', turns: [{ r: 'user', m: 'Synthetic transcript' }] });
const bytes = new TextEncoder().encode(body);
const fixture = (corrupt: boolean) => {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) =>
    name.endsWith('_pick_v1') ? [{ row: '90', body }] : name.endsWith('_stage_v1') ? { ok: true, staged: true } : { ok: true, archived: true });
  const put = vi.fn(async (_key: string, _bytes: Uint8Array, _options?: unknown) => undefined);
  const read = bytes.slice();
  if (corrupt) read[0] ^= 1;
  const bucket = { put, get: vi.fn(async () => ({ size: read.byteLength, arrayBuffer: async () => read.buffer })),
    head: vi.fn(), delete: vi.fn() };
  return { rpc, bucket };
};

it('archives only after rereading the exact body and returns the scoped transcript', async () => {
  const { rpc, bucket } = fixture(false);
  const sha256 = await sha256Hex(bytes);
  const result = await jarvisArchiveBatch({ rpc }, bucket);
  expect(result).toMatchObject({ qator: 1, bayt: bytes.byteLength, xato: null });
  expect(bucket.put).toHaveBeenCalledWith(`jarvis-history/v1/90/${sha256}.json`, bytes, expect.anything());
  expect(rpc.mock.calls.slice(1)).toEqual([
    ['t2_jarvis_suhbat_archive_stage_v1', { p_row: '90', p_sha256: sha256, p_bytes: bytes.byteLength }],
    ['t2_jarvis_suhbat_archive_commit_v1', { p_row: '90', p_sha256: sha256, p_bytes: bytes.byteLength }],
  ]);
  expect(await jarvisArchiveRead(bucket, { row: '90', sha256, bytes: bytes.byteLength })).toEqual([{ r: 'user', m: 'Synthetic transcript' }]);
  await expect(jarvisArchiveRead(bucket, { row: '91', sha256, bytes: bytes.byteLength })).rejects.toThrow('JARVIS_ARCHIVE_BODY');
});

it('cannot remove the database message content if same-size R2 readback was corrupted', async () => {
  const { rpc, bucket } = fixture(true);
  expect(await jarvisArchiveBatch({ rpc }, bucket)).toMatchObject({ qator: 0, xato: 'JARVIS_ARCHIVE_FAILED' });
  expect(rpc).toHaveBeenCalledTimes(2);
});

it('purges bodies only after reservation and blocks an archive writer delayed past purge', async () => {
  const sha256 = await sha256Hex(bytes);
  const key = `jarvis-history/v1/90/${sha256}.json`;
  const storage = new Map([[key, bytes]]);
  const bucket = {
    async put(k: string, value: Uint8Array, options: { onlyIf?: Headers }) {
      if (options.onlyIf?.get('If-None-Match') === '*' && storage.has(k)) return null;
      storage.set(k, value);
      return { size: value.byteLength };
    },
    async head(k: string) { return { size: storage.get(k)?.byteLength }; },
    get: vi.fn(), delete: vi.fn(),
  };
  const cleanup = vi.fn(async (name: string) => name.endsWith('_pick_v1') ? [{ row: '90', sha256 }] : { ok: true, acknowledged: true });
  const rpc = vi.fn(async (name: string) => {
    if (name.endsWith('_pick_v1')) return [{ row: '90', body }];
    expect(name).toMatch(/_stage_v1$/);
    expect(await jarvisArchivePurge({ rpc: cleanup }, bucket)).toMatchObject({ qator: 1, xato: null });
    return { ok: true, staged: true };
  });
  expect(await jarvisArchiveBatch({ rpc }, bucket)).toMatchObject({ qator: 0, xato: null });
  expect(storage.get(key)?.byteLength).toBe(0);
  expect(bucket.get).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(cleanup).toHaveBeenLastCalledWith('t2_jarvis_suhbat_archive_purge_ack_v1', { p_row: '90', p_sha256: sha256 });
});

it('continues with independent cleanup work and retries an object that was not cleared', async () => {
  const sha256 = 'a'.repeat(64);
  const pick = [{ row: '90', sha256 }, { row: '91', sha256 }];
  const rpc = vi.fn(async (name: string) => name.endsWith('_pick_v1') ? pick : { ok: true, acknowledged: true });
  const bucket = { put: vi.fn(), get: vi.fn(), delete: vi.fn(), head: vi.fn().mockResolvedValueOnce({ size: 99 }).mockResolvedValue({ size: 0 }) };
  expect(await jarvisArchivePurge({ rpc }, bucket, 2)).toMatchObject({ qator: 1, xato: 'JARVIS_ARCHIVE_PURGE_FAILED', qoldi: true });
  expect(rpc.mock.calls).toHaveLength(2);
  expect(rpc).toHaveBeenLastCalledWith('t2_jarvis_suhbat_archive_purge_ack_v1', { p_row: '91', p_sha256: sha256 });
  pick.pop();
  expect(await jarvisArchivePurge({ rpc }, bucket, 2)).toMatchObject({ qator: 1, xato: null });
  expect(rpc).toHaveBeenLastCalledWith('t2_jarvis_suhbat_archive_purge_ack_v1', { p_row: '90', p_sha256: sha256 });
});
