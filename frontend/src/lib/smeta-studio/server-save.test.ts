import { expect, it } from 'vitest';
import { emptyDoc } from './model';
import { saveToServer } from './server-save';

const doc = emptyDoc('3f2c1a9e-5b7d-4c1e-9a2b-1c3d5e7f9a0b');
const run = (res: () => Promise<Response>) => saveToServer({ kompaniyaId: 17, obyektId: null, doc, expectedVersion: 2, operationId: 'op-1' }, async () => res());

it('success returns the new server version', async () => {
  expect(await run(async () => Response.json({ ok: true, versiya: 3, yangilandi: 't' }))).toEqual({ ok: true, versiya: 3, yangilandi: 't' });
});
it('conflict carries the current server version', async () => {
  expect(await run(async () => Response.json({ ok: false, code: 'VERSION_CONFLICT', versiya: 5 }, { status: 409 }))).toEqual({ ok: false, code: 'VERSION_CONFLICT', versiya: 5 });
});
it('network failure is distinguishable (caller keeps the same operation_id)', async () => {
  expect(await run(async () => { throw new TypeError('offline'); })).toEqual({ ok: false, code: 'NETWORK' });
});
it('missing endpoint / RPC is reported, not treated as saved', async () => {
  expect(await run(async () => new Response('', { status: 404 }))).toEqual({ ok: false, code: 'SERVER_NOT_ACTIVATED' });
  expect(await run(async () => Response.json({ ok: false, code: 'SAVE_FAILED' }, { status: 502 }))).toEqual({ ok: false, code: 'SAVE_FAILED' });
});
it('body sends the full document with the expected version', async () => {
  let sent: Record<string, unknown> = {};
  await saveToServer({ kompaniyaId: 17, obyektId: 9, doc, expectedVersion: 2, operationId: 'op-1' }, async (_u, i) => { sent = JSON.parse(String(i.body)); return Response.json({ ok: true, versiya: 3 }); });
  expect(sent).toMatchObject({ amal: 'saqla', kompaniya_id: 17, obyekt_id: 9, expected_version: 2, operation_id: 'op-1', draft_uid: doc.draftId });
  expect((sent.hujjat as { schema: string }).schema).toBe('smeta-studio-v1');
});
