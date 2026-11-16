// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { jarvisOutboxRead, jarvisOutboxRemove, jarvisOutboxStore, type JarvisQueuedWrite } from './conversation-outbox';

const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => records.get(key),
  update: async (key: string, change: (current: unknown) => unknown) => {
    records.set(key, change(records.get(key)));
  },
}));

const owner = { actor: 7, company: 17 };
const slot = 'jarvis:pending:v1:7:17';
const turns = [{ r: 'user' as const, m: 'Synthetic pending question' }];
const batch: JarvisQueuedWrite = { id: 'example', kind: 'create', operation: 'example', title: 'Synthetic', turns, preview: turns };

beforeEach(() => { records.clear(); vi.stubGlobal('indexedDB', {}); });
afterEach(() => vi.unstubAllGlobals());

it('encrypts the outbox and refuses a copied record in another actor or company scope', async () => {
  expect(await jarvisOutboxStore(owner, batch)).toBe(true);
  expect(records.get('aes-gcm-v1')).toMatchObject({ extractable: false });
  const stored = records.get(slot) as { bytes: Uint8Array };
  expect(new TextDecoder().decode(stored.bytes)).not.toContain('Synthetic pending question');
  expect(await jarvisOutboxRead(owner)).toEqual(batch);
  expect(await jarvisOutboxRead({ actor: 8, company: 17 })).toBeNull();
  records.set('jarvis:pending:v1:8:17', stored);
  records.set('jarvis:pending:v1:7:18', stored);
  await expect(jarvisOutboxRead({ actor: 8, company: 17 })).rejects.toThrow();
  await expect(jarvisOutboxRead({ actor: 7, company: 18 })).rejects.toThrow();
});

it('keeps the durable head until matching acknowledgement and cannot resurrect a removed conflict', async () => {
  expect(await jarvisOutboxStore(owner, batch)).toBe(true);
  expect(await jarvisOutboxStore(owner, { ...batch, id: 'other', operation: 'other' })).toBe(false);
  await jarvisOutboxRemove(owner, 'other');
  expect(await jarvisOutboxRead(owner)).toEqual(batch);
  await jarvisOutboxRemove(owner, batch.operation);
  expect(await jarvisOutboxStore(owner, { ...batch, stale: true })).toBe(false);
  expect(await jarvisOutboxRead(owner)).toBeNull();
});
