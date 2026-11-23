import { expect, it, vi } from 'vitest';
import { yuklaGet } from '../src/fayl';
import type { Env } from '../src/env';

it('rejects a ZIP download if one expected R2 object is missing', async () => {
  const env = {
    OAUTH_KV: { get: vi.fn(async () => JSON.stringify({
      zip: true, nom: 'test.zip', fayllar: [{ kalit: 'a', nom: 'a.xlsx' }, { kalit: 'b', nom: 'b.xlsx' }],
    })) },
    SNAPSHOT_R2: { get: vi.fn(async (key: string) => key === 'a' ? { arrayBuffer: async () => new ArrayBuffer(1) } : null) },
  } as unknown as Env;
  const reply = await yuklaGet(new Request('https://example.test/yukla/' + 'a'.repeat(64)), env);
  expect(reply.status).toBe(409);
});
