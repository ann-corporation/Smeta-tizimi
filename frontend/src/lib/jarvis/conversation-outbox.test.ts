// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { jarvisOutboxAcknowledge, jarvisOutboxRead, jarvisOutboxRemove, jarvisOutboxStore, type JarvisQueuedWrite } from './conversation-outbox';

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

const turn = (m: string, r: 'user' | 'ai' = 'user') => ({ r, m });
const createHead = (preview = turns, headCount = turns.length): JarvisQueuedWrite => ({
  id: 'chat', kind: 'create', operation: 'chat', title: 'Synthetic chat', turns, preview, headCount,
});

it('keeps a same-operation head immutable while allowing only a compatible full preview', async () => {
  const preview = [...turns, turn('tail')];
  const head: JarvisQueuedWrite = { ...createHead(preview, 1), preview, turns: preview.slice(0, 1) };
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  expect(await jarvisOutboxStore(owner, { ...head, turns: [turn('rewritten')] })).toBe(false);
  expect(await jarvisOutboxStore(owner, { ...head, title: 'Changed title' })).toBe(false);
  expect(await jarvisOutboxStore(owner, { ...head, headCount: 2 })).toBe(false);
  expect(await jarvisOutboxStore(owner, { ...head, headCount: -1 })).toBe(false);
  expect(await jarvisOutboxRead(owner)).toEqual(head);
});

it('retains the longest compatible preview across shorter and stale same-operation writes', async () => {
  const full = [turn('head one'), turn('head two', 'ai'), turn('tail one'), turn('tail two', 'ai')];
  const head = { ...createHead(full, 2), turns: full.slice(0, 2) };
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  expect(await jarvisOutboxStore(owner, { ...head, preview: full.slice(0, 3), stale: true })).toBe(true);
  expect(await jarvisOutboxRead(owner)).toEqual({ ...head, stale: true });
});

it('reopens an acknowledged create tail and reserves a compact successor under the returned etag', async () => {
  const preview = [turn('first'), turn('answer', 'ai'), turn('offline follow-up'), turn('follow-up answer', 'ai')];
  const head: JarvisQueuedWrite = { ...createHead(preview, 2), turns: preview.slice(0, 2) };
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  const etag = 'a'.repeat(32);
  expect(await jarvisOutboxAcknowledge(owner, head.operation, etag)).toBe(true);
  expect(await jarvisOutboxRead(owner)).toEqual({ ...head, acknowledged: etag });

  const next: JarvisQueuedWrite = { id: head.id, kind: 'append', operation: 'append-2', etag,
    turns: preview.slice(2), preview: preview.slice(2), headCount: 2 };
  expect(next.headCount).toBe(next.turns.length);
  expect(await jarvisOutboxStore(owner, next)).toBe(true);
  expect(await jarvisOutboxRead(owner)).toEqual(next);
});

it('rejects foreign and stale acknowledgements without changing the pending record', async () => {
  const head = createHead();
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  expect(await jarvisOutboxAcknowledge(owner, 'other-operation', 'b'.repeat(32))).toBe(false);
  expect(await jarvisOutboxAcknowledge(owner, head.operation, 'not-an-etag')).toBe(false);
  expect(await jarvisOutboxStore(owner, { ...head, stale: true })).toBe(true);
  expect(await jarvisOutboxAcknowledge(owner, head.operation, 'b'.repeat(32))).toBe(false);
  expect(await jarvisOutboxRead(owner)).toEqual({ ...head, stale: true });
});

it('accepts previews over twelve turns, rejects over two hundred, and preserves the stored data', async () => {
  const preview = Array.from({ length: 13 }, (_, i) => turn(`turn ${i}`));
  const head: JarvisQueuedWrite = { ...createHead(preview, 12), turns: preview.slice(0, 12) };
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  expect((await jarvisOutboxRead(owner))?.preview).toHaveLength(13);
  const tooLong = Array.from({ length: 201 }, (_, i) => turn(`turn ${i}`));
  expect(await jarvisOutboxStore(owner, { ...head, preview: tooLong })).toBe(false);
  expect(await jarvisOutboxRead(owner)).toEqual(head);
});

it('does not resurrect a discarded same-operation head', async () => {
  const head = createHead();
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  expect(await jarvisOutboxRemove(owner, head.operation)).toBe(true);
  expect(await jarvisOutboxRead(owner)).toBeNull();
  expect(await jarvisOutboxStore(owner, head)).toBe(false);
  expect(await jarvisOutboxRead(owner)).toBeNull();
});

it('CAS keeps one of two incompatible concurrent preview extensions without corrupting the head', async () => {
  const head = createHead();
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  const [left, right] = await Promise.all([
    jarvisOutboxStore(owner, { ...head, preview: [...turns, turn('left tail')] }),
    jarvisOutboxStore(owner, { ...head, preview: [...turns, turn('right tail')] }),
  ]);
  expect([left, right].filter(Boolean)).toHaveLength(1);
  const saved = await jarvisOutboxRead(owner);
  expect(saved?.turns).toEqual(head.turns);
  expect(saved?.preview).toHaveLength(2);
  expect(['left tail', 'right tail']).toContain(saved?.preview[1].m);
});

it('preserves acknowledgement and the longest tail when ACK races same-head extensions', async () => {
  const head = createHead();
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  const shorter = [...turns, turn('tail one')];
  const longer = [...shorter, turn('tail two', 'ai')];
  const etag = 'c'.repeat(32);
  const [acked, shortWrite, longWrite] = await Promise.all([
    jarvisOutboxAcknowledge(owner, head.operation, etag),
    jarvisOutboxStore(owner, { ...head, preview: shorter }),
    jarvisOutboxStore(owner, { ...head, preview: longer }),
  ]);
  expect([acked, shortWrite, longWrite]).toEqual([true, true, true]);
  expect(await jarvisOutboxRead(owner)).toEqual({ ...head, preview: longer, acknowledged: etag });
});

it('does not clear ACK or shorten recovery tail on a late shorter same-operation write', async () => {
  const head = createHead();
  const etag = 'd'.repeat(32);
  const longer = { ...head, preview: [...turns, turn('persisted tail')] };
  expect(await jarvisOutboxStore(owner, longer)).toBe(true);
  expect(await jarvisOutboxAcknowledge(owner, head.operation, etag)).toBe(true);
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  expect(await jarvisOutboxRead(owner)).toEqual({ ...longer, acknowledged: etag });
});

it('hides an acknowledged head with no tail and allows another conversation to reserve the slot', async () => {
  const completed = createHead();
  expect(await jarvisOutboxStore(owner, completed)).toBe(true);
  expect(await jarvisOutboxAcknowledge(owner, completed.operation, 'e'.repeat(32))).toBe(true);
  expect(await jarvisOutboxRead(owner)).toBeNull();

  const other: JarvisQueuedWrite = { id: 'other-chat', kind: 'create', operation: 'other-chat', title: 'Other synthetic chat',
    turns: [turn('other head')], preview: [turn('other head')] };
  expect(await jarvisOutboxStore(owner, other)).toBe(true);
  expect(await jarvisOutboxRead(owner)).toEqual(other);
});

it('revives a hidden ACK when a compatible late same-operation tail arrives', async () => {
  const head = createHead();
  const etag = 'f'.repeat(32);
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  expect(await jarvisOutboxAcknowledge(owner, head.operation, etag)).toBe(true);
  expect(await jarvisOutboxRead(owner)).toBeNull();

  const withLateTail = { ...head, preview: [...turns, turn('late compatible tail')] };
  expect(await jarvisOutboxStore(owner, withLateTail)).toBe(true);
  expect(await jarvisOutboxRead(owner)).toEqual({ ...withLateTail, acknowledged: etag });
});

it('does not downgrade an acknowledged operation on a late stale response, and keeps the tail actionable', async () => {
  const head = { ...createHead(), preview: [...turns, turn('late tail')] };
  const etag = 'a'.repeat(32);
  expect(await jarvisOutboxStore(owner, head)).toBe(true);
  expect(await jarvisOutboxAcknowledge(owner, head.operation, etag)).toBe(true);
  expect(await jarvisOutboxStore(owner, { ...head, stale: true })).toBe(true);
  expect(await jarvisOutboxRead(owner)).toEqual({ ...head, acknowledged: etag });
  const next: JarvisQueuedWrite = { kind: 'append', id: head.id, operation: 'next-tail', etag,
    turns: head.preview.slice(1), preview: head.preview.slice(1), headCount: 1 };
  expect(await jarvisOutboxStore(owner, next)).toBe(true);
});
