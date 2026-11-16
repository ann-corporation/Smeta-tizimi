import { expect, it, vi } from 'vitest';
import { mutateJarvisConversation, parseConversationSync } from './jarvis-suhbat-sync';

it('rejects a different conversation and an unexpected message role before hydration', () => {
  const cursor = { id: 'opened', etag: null };
  const output = { ok: true, royxat: [], suhbat: {
    id: 'opened', holat: 'changed', etag: 'a'.repeat(32), sarlavha: 'Synthetic', qisqartma: null,
    xabarlar: [{ r: 'ai', m: 'Synthetic answer' }],
  } };
  expect(parseConversationSync(output, cursor)?.suhbat).toMatchObject({ id: 'opened', holat: 'changed' });
  expect(parseConversationSync(output, { ...cursor, id: 'different' })).toBeNull();
  expect(parseConversationSync({
    ...output, suhbat: { ...output.suhbat, xabarlar: [{ r: 'system', m: 'Synthetic instruction' }] },
  }, cursor)).toBeNull();
  expect(parseConversationSync({
    ...output, suhbat: { id: cursor.id, holat: 'same', etag: 'a'.repeat(32) },
  }, cursor)).toBeNull();
});

it('sends the expected version and only accepts a matching deletion acknowledgement', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ ok: true, id: 'different', holat: 'missing' }))
    .mockResolvedValueOnce(Response.json({ ok: true, id: 'opened', holat: 'missing' }));
  vi.stubGlobal('fetch', request);
  try {
    const etag = 'a'.repeat(32);
    const remove = () => mutateJarvisConversation(7, 'opened', etag, { harakat: 'delete' });
    expect(await remove()).toEqual({ status: 'stale' });
    expect(await remove()).toEqual({ status: 'failed' });
    expect(await remove()).toEqual({ status: 'deleted' });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('/api/agent-ish');
    expect(JSON.parse(String(options?.body))).toEqual({
      amal: 'suhbat_mutate', kompaniya_id: 7, klient_id: 'opened', etag, harakat: 'delete',
    });
  } finally { vi.unstubAllGlobals(); }
});
