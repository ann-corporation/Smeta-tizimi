import { expect, it, vi } from 'vitest';
import { jarvisArchiveBatch, jarvisArchiveRead } from './jarvis-conversation-archive';
import { sha256Hex } from './r2-saqlash';

const body = JSON.stringify({ v: 1, row: '90', turns: [{ r: 'user', m: 'Synthetic transcript' }] });
const bytes = new TextEncoder().encode(body);
const fixture = (corrupt: boolean) => {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) =>
    name.endsWith('_pick_v1') ? [{ row: '90', body }] : { ok: true, archived: true });
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
  expect(rpc.mock.calls[1]).toEqual(['t2_jarvis_suhbat_archive_commit_v1', { p_row: '90', p_sha256: sha256, p_bytes: bytes.byteLength }]);
  expect(await jarvisArchiveRead(bucket, { row: '90', sha256, bytes: bytes.byteLength })).toEqual([{ r: 'user', m: 'Synthetic transcript' }]);
  await expect(jarvisArchiveRead(bucket, { row: '91', sha256, bytes: bytes.byteLength })).rejects.toThrow('JARVIS_ARCHIVE_BODY');
});

it('cannot remove the database message content if same-size R2 readback was corrupted', async () => {
  const { rpc, bucket } = fixture(true);
  expect(await jarvisArchiveBatch({ rpc }, bucket)).toMatchObject({ qator: 0, xato: 'JARVIS_ARCHIVE_FAILED' });
  expect(rpc).toHaveBeenCalledTimes(1);
});
