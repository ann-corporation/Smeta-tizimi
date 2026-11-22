// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => new Map<string, unknown>());
const fail = vi.hoisted(() => ({ read: '', update: '', afterWrite: '' }));
const writes = vi.hoisted(() => [] as string[]);
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => { if (key === fail.read) throw Error('read'); return db.get(key); },
  update: async (key: string, change: (current: unknown) => unknown) => {
    if (key === fail.update) throw Error('write');
    writes.push(key);
    db.set(key, change(db.get(key)));
    if (key === fail.afterWrite) fail.read = key;
  },
}));

import { openConversationCache } from './conversation-cache';
import { jarvisCacheRead, jarvisCacheUpdate, jarvisOutboxRead } from './conversation-outbox';

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}
const key = (actor: number, company: number, kind: string, tab?: string) =>
  `jarvis:cache:v1:${actor}:${company}:${kind}${tab ? `:${tab}` : ''}`;
const active = [{ id: 's1', rol: 'ai', matn: 'Synthetic cache secret', yakun: 'token-secret', token: 'secret', actions: ['write'] }];
const archive = (id: string, text: string, time = Date.now()) =>
  [{ id, sarlavha: id, yangilandi: time, xabarlar: [{ rol: 'user', matn: text }] }];

beforeEach(() => { db.clear(); writes.length = 0; fail.read = ''; fail.update = ''; fail.afterWrite = ''; vi.stubGlobal('indexedDB', {}); });
afterEach(() => vi.unstubAllGlobals());

it('migrates legacy values only after verified encryption and strips sensitive active fields', async () => {
  const session = storage({ 'jarvis-chat:7:17': JSON.stringify(active), 'jarvis-chat:7:17:id': 's1' });
  const local = storage({ 'jarvis-suhbatlar:7:17': JSON.stringify(archive('old', 'Synthetic archive')) });
  const cache = await openConversationCache(7, 17, () => {}, { session, local });
  expect(session.values.has('jarvis-chat:7:17')).toBe(false);
  expect(session.values.has('jarvis-chat:7:17:id')).toBe(false);
  expect(session.values.has('jarvis-cache-tab:v1')).toBe(true);
  expect(local.values.size).toBe(0);
  expect(JSON.parse(cache.getItem('jarvis-chat:7:17')!)).toEqual([{ id: 's1', rol: 'ai', matn: 'Synthetic cache secret' }]);
  for (const kind of ['active', 'id', 'archive']) {
    const disk = db.get(key(7, 17, kind, kind === 'archive' ? undefined : session.values.get('jarvis-cache-tab:v1')));
    expect((disk as { bytes: Uint8Array }).bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode((disk as { bytes: Uint8Array }).bytes)).not.toContain('Synthetic');
  }
  expect(db.get('aes-gcm-v1')).toMatchObject({ extractable: false });
});

it('rejects copied actor/company ciphertext and keeps per-tab active keys', async () => {
  const a = storage(); a.setItem('jarvis-cache-tab:v1', '11111111-1111-4111-8111-111111111111');
  const b = storage(); b.setItem('jarvis-cache-tab:v1', '22222222-2222-4222-8222-222222222222');
  const one = await openConversationCache(7, 17, () => {}, { session: a, local: null });
  one.setItem('jarvis-chat:7:17', JSON.stringify(active)); await one.flush();
  const slot = db.get(key(7, 17, 'active', '11111111-1111-4111-8111-111111111111'));
  db.set(key(8, 17, 'active', '11111111-1111-4111-8111-111111111111'), slot);
  db.set(key(7, 18, 'active', '11111111-1111-4111-8111-111111111111'), slot);
  await expect(jarvisCacheRead(key(8, 17, 'active', '11111111-1111-4111-8111-111111111111'))).rejects.toThrow();
  await expect(jarvisCacheRead(key(7, 18, 'active', '11111111-1111-4111-8111-111111111111'))).rejects.toThrow();
  expect(db.has(key(7, 17, 'active', '22222222-2222-4222-8222-222222222222'))).toBe(false);
  const other = await openConversationCache(7, 17, () => {}, { session: b, local: null });
  expect(other.getItem('jarvis-chat:7:17')).toBeNull();
});

it('orders writes, retains legacy on IDB/readback failure and leaves pending outbox untouched', async () => {
  const session = storage({ 'jarvis-chat:7:17': JSON.stringify(active) });
  const errors = vi.fn();
  fail.read = key(7, 17, 'active', '33333333-3333-4333-8333-333333333333');
  session.setItem('jarvis-cache-tab:v1', '33333333-3333-4333-8333-333333333333');
  const unreadable = await openConversationCache(7, 17, errors, { session, local: null });
  expect(session.values.has('jarvis-chat:7:17')).toBe(true);
  expect(unreadable.getItem('jarvis-chat:7:17')).toBeNull();
  fail.read = '';
  fail.update = key(7, 17, 'active', '33333333-3333-4333-8333-333333333333');
  const failed = await openConversationCache(7, 17, errors, { session, local: null });
  expect(session.values.has('jarvis-chat:7:17')).toBe(true);
  expect(failed.getItem('jarvis-chat:7:17')).toBeNull();
  expect(errors).toHaveBeenCalled();
  fail.update = '';
  db.set('jarvis:pending:v1:7:17', { operation: 'pending sentinel' });
  const cache = await openConversationCache(7, 17, errors, { session: storage(), local: null });
  cache.setItem('jarvis-chat:7:17:id', 's2'); cache.setItem('jarvis-chat:7:17', JSON.stringify([{ id: 's2', rol: 'user', matn: 'second' }]));
  await cache.flush();
  expect(writes.filter(item => item.startsWith('jarvis:cache:'))).toHaveLength(2);
  expect(writes.findIndex(item => item.includes(':id:'))).toBeLessThan(writes.findIndex(item => item.includes(':active:')));
  expect(db.get('jarvis:pending:v1:7:17')).toEqual({ operation: 'pending sentinel' });
  expect(db.has(key(7, 17, 'id', ''))).toBe(false);
});

it('treats encrypted null as a tombstone and refuses to resurrect conflicting active/id history', async () => {
  const tab = '44444444-4444-4444-8444-444444444444';
  const activeKey = key(7, 17, 'active', tab), idKey = key(7, 17, 'id', tab);
  expect(await jarvisCacheRead(activeKey)).toBeUndefined();
  expect(await jarvisOutboxRead({ actor: 7, company: 17 })).toBeNull();
  await jarvisCacheUpdate(activeKey, () => null);
  const tombstone = storage({ 'jarvis-cache-tab:v1': tab, 'jarvis-chat:7:17': JSON.stringify(active) });
  const warn = vi.fn();
  const cleared = await openConversationCache(7, 17, warn, { session: tombstone, local: null });
  expect(await jarvisCacheRead(activeKey)).toBeNull();
  expect(cleared.getItem('jarvis-chat:7:17')).toBeNull();
  expect(tombstone.values.has('jarvis-chat:7:17')).toBe(true);
  expect(warn).toHaveBeenCalled();

  await jarvisCacheUpdate(activeKey, () => JSON.stringify([{ id: 'new', rol: 'user', matn: 'encrypted newer' }]));
  await jarvisCacheUpdate(idKey, () => 'new');
  const legacy = storage({ 'jarvis-cache-tab:v1': tab, 'jarvis-chat:7:17': JSON.stringify(active), 'jarvis-chat:7:17:id': 'old' });
  const conflict = await openConversationCache(7, 17, warn, { session: legacy, local: null });
  expect(conflict.getItem('jarvis-chat:7:17')).toContain('encrypted newer');
  expect(conflict.getItem('jarvis-chat:7:17:id')).toBe('new');
  expect(legacy.values.get('jarvis-chat:7:17')).toBe(JSON.stringify(active));
  expect(legacy.values.get('jarvis-chat:7:17:id')).toBe('old');
});

it('merges concurrent archive additions without losing either history', async () => {
  const a = storage({ 'jarvis-cache-tab:v1': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  const b = storage({ 'jarvis-cache-tab:v1': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  const left = await openConversationCache(7, 17, () => {}, { session: a, local: null });
  const right = await openConversationCache(7, 17, () => {}, { session: b, local: null });
  left.setItem('jarvis-suhbatlar:7:17', JSON.stringify(archive('left', 'left history')));
  right.setItem('jarvis-suhbatlar:7:17', JSON.stringify(archive('right', 'right history')));
  await Promise.all([left.flush(), right.flush()]);
  const saved = await openConversationCache(7, 17, () => {}, { session: storage(), local: null });
  expect(JSON.parse(saved.getItem('jarvis-suhbatlar:7:17')!).map((row: { id: string }) => row.id).sort()).toEqual(['left', 'right']);
});

it('retains plaintext when verification fails AFTER a ciphertext commit, then resumes migration safely', async () => {
 const tab='55555555-5555-4555-8555-555555555555'; const disk=key(7,17,'active',tab);
 const source=JSON.stringify(active); const session=storage({'jarvis-cache-tab:v1':tab,'jarvis-chat:7:17':source});
 const warn=vi.fn();fail.afterWrite=disk;
 await openConversationCache(7,17,warn,{session,local:null});
 expect(db.has(disk)).toBe(true);expect(session.getItem('jarvis-chat:7:17')).toBe(source);expect(warn).toHaveBeenCalled();
 fail.read='';fail.afterWrite='';
 const recovered=await openConversationCache(7,17,vi.fn(),{session,local:null});
 expect(recovered.getItem('jarvis-chat:7:17')).toContain('Synthetic cache secret');
 expect(session.getItem('jarvis-chat:7:17')).toBeNull();
});
