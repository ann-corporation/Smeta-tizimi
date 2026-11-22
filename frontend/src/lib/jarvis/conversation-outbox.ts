import { createStore, get, update } from 'idb-keyval';
import { shifrla, shifrOch } from '../../ombor/ombor-idb';

type Turn = { r: 'user' | 'ai'; m: string };
type Scope = { actor: number; company: number };
export type JarvisQueuedWrite = {
  id: string;
  operation: string;
  preview: Turn[];
  /** Position after the immutable RPC batch within the complete recovery view. */
  headCount?: number;
  /** Server acknowledgement; retained until an atomic successor reservation. */
  acknowledged?: string;
  stale?: boolean;
} & ({ kind: 'create'; title: string; turns: Turn[] } | { kind: 'append'; etag: string; turns: Turn[] });

type Slot = { operation: string; revision?: string; bytes: Uint8Array; deleted?: false } |
  { operation: string; revision: string; deleted: true };
const ID = /^[A-Za-z0-9_.-]{1,40}$/;
const VERSION = /^[a-f0-9]{32}$/;
const KEY = 'aes-gcm-v1';
const MAX_BYTES = 1_500_000;
let disk: ReturnType<typeof createStore> | undefined;
const slotKey = ({ actor, company }: Scope) => `jarvis:pending:v1:${actor}:${company}`;
const storage = () => typeof indexedDB === 'undefined' || !crypto.subtle ? null :
  (disk ??= createStore('qurai-jarvis-outbox', 'v1'));

function decode(value: unknown): JarvisQueuedWrite {
  const x = value as JarvisQueuedWrite | null;
  const turns = (a: unknown, max: number, count = 12) => Array.isArray(a) && a.length >= 1 && a.length <= count &&
    a.every(t => t && ['user', 'ai'].includes(t.r) && typeof t.m === 'string' && t.m.length >= 1 && t.m.length <= max);
  if (!x || typeof x.id !== 'string' || !ID.test(x.id) || typeof x.operation !== 'string' || !ID.test(x.operation) ||
    !turns(x.turns, 32_000) || !turns(x.preview, 32_000, 200) || (x.stale != null && typeof x.stale !== 'boolean') ||
    (x.acknowledged != null && !VERSION.test(x.acknowledged)) ||
    (x.headCount != null && (!Number.isSafeInteger(x.headCount) || x.headCount < x.turns.length || x.headCount > x.preview.length)) ||
    (x.kind === 'create' ? typeof x.title !== 'string' || !x.title.trim() || x.title.length > 80 || x.operation !== x.id :
      x.kind !== 'append' || typeof x.etag !== 'string' || !VERSION.test(x.etag))) throw new Error('JARVIS_OUTBOX_INVALID');
  return x;
}
const count = (x: JarvisQueuedWrite) => x.headCount ?? x.preview.length;
const prefix = (a: Turn[], b: Turn[]) => a.length <= b.length && a.every((t, i) => t.r === b[i].r && t.m === b[i].m);
const sameHead = (a: JarvisQueuedWrite, b: JarvisQueuedWrite) => a.id === b.id && a.kind === b.kind &&
  count(a) === count(b) && JSON.stringify(a.turns) === JSON.stringify(b.turns) &&
  (a.kind === 'create' && b.kind === 'create' ? a.title === b.title : a.kind === 'append' && b.kind === 'append' && a.etag === b.etag);
const sameSlot = (a: Slot | null | undefined, b: Slot | null | undefined) => !a || !b ? a === b :
  a.operation === b.operation && (a.revision || b.revision ? a.revision === b.revision :
    !a.deleted && !b.deleted && a.bytes.length === b.bytes.length && a.bytes.every((n, i) => n === b.bytes[i]));

async function secret(db: ReturnType<typeof createStore>): Promise<CryptoKey> {
  const saved = await get<CryptoKey>(KEY, db);
  if (saved) return saved;
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await update<CryptoKey>(KEY, current => current ?? candidate, db);
  const persisted = await get<CryptoKey>(KEY, db);
  if (!persisted) throw new Error('JARVIS_OUTBOX_KEY');
  return persisted;
}

export async function jarvisOutboxRead(scope: Scope): Promise<JarvisQueuedWrite | null> {
  const db = storage();
  if (!db) return null;
  const key = slotKey(scope);
  const slot = await get<Slot | null>(key, db);
  if (!slot || slot.deleted) return null;
  if (!(slot.bytes instanceof Uint8Array) || slot.bytes.byteLength < 29 || slot.bytes.byteLength > MAX_BYTES) throw new Error('JARVIS_OUTBOX_INVALID');
  const item = decode(await shifrOch(key, slot.bytes, await secret(db)));
  if (item.operation !== slot.operation) throw new Error('JARVIS_OUTBOX_INVALID');
  return item.acknowledged && item.preview.length === count(item) ? null : item;
}

/** Atomic reservation allocates one durable head per scope, including across tabs. */
export async function jarvisOutboxStore(scope: Scope, item: JarvisQueuedWrite): Promise<boolean> {
  try {
    const db = storage();
    if (!db) return true; // An online save can still proceed with the in-memory retry state.
    const key = slotKey(scope);
    decode(item);
    const cryptoKey = await secret(db);
    for (let attempt = 0; attempt < 5; attempt++) {
      const old = await get<Slot | null>(key, db);
      let next: JarvisQueuedWrite = { ...item, acknowledged: undefined };
      if ((!old || old.deleted) && (item.stale || old?.operation === item.operation)) return false;
      if (old && !old.deleted) {
        const saved = decode(await shifrOch(key, old.bytes, cryptoKey));
        if (saved.operation !== old.operation) return false;
        if (old.operation === item.operation) {
          if (!sameHead(saved, item) || (!prefix(saved.preview, item.preview) && !prefix(item.preview, saved.preview))) return false;
          next = { ...item, preview: saved.preview.length > item.preview.length ? saved.preview : item.preview,
            stale: saved.acknowledged ? saved.stale : saved.stale || item.stale, acknowledged: saved.acknowledged };
        } else {
          if (!saved.acknowledged || saved.stale) return false;
          if (saved.preview.length > count(saved)) {
            if (item.kind !== 'append') return false;
            if (item.id !== saved.id || item.etag !== saved.acknowledged || count(item) !== item.turns.length ||
                !prefix(saved.preview.slice(count(saved)), item.preview) || !prefix(item.turns, item.preview)) return false;
          }
        }
      }
      const bytes = await shifrla(key, next, cryptoKey);
      if (bytes.byteLength > MAX_BYTES) return false;
      let accepted = false;
      await update<Slot | null>(key, previous => {
        if (!sameSlot(previous, old)) return previous ?? null;
        accepted = true;
        return { operation: item.operation, revision: crypto.randomUUID(), bytes };
      }, db);
      if (accepted) return true;
    }
    return false;
  } catch { return false; }
}

/** Keep the latest tail with the acknowledgement; a reload must never retry it as part of the old RPC. */
export async function jarvisOutboxAcknowledge(scope: Scope, operation: string, etag: string): Promise<boolean> {
  try {
    if (!VERSION.test(etag)) return false;
    const db = storage(); if (!db) return true;
    const key = slotKey(scope), cryptoKey = await secret(db);
    for (let attempt = 0; attempt < 5; attempt++) {
      const old = await get<Slot | null>(key, db);
      if (!old || old.deleted || old.operation !== operation) return false;
      const item = decode(await shifrOch(key, old.bytes, cryptoKey));
      if (item.operation !== operation || item.stale || (item.acknowledged && item.acknowledged !== etag)) return false;
      const bytes = await shifrla(key, { ...item, acknowledged: etag }, cryptoKey);
      if (bytes.byteLength > MAX_BYTES) return false;
      let accepted = false;
      await update<Slot | null>(key, previous => {
        if (!sameSlot(previous, old)) return previous ?? null;
        accepted = true;
        return { operation, revision: crypto.randomUUID(), bytes };
      }, db);
      if (accepted) return true;
    }
    return false;
  } catch { return false; }
}

export async function jarvisOutboxRemove(scope: Scope, operation: string): Promise<boolean> {
  try {
    const db = storage();
    if (!db) return true;
    await update<Slot | null>(slotKey(scope), previous => previous?.operation === operation ?
      { operation, revision: crypto.randomUUID(), deleted: true } : previous ?? null, db);
    return true;
  } catch { return false; }
}
