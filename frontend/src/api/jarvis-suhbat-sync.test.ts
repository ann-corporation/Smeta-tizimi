import { expect, it } from 'vitest';
import { parseConversationSync } from './jarvis-suhbat-sync';

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
