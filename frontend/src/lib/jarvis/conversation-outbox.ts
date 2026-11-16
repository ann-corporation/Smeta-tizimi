import { createStore, get, update } from 'idb-keyval';
import { shifrla, shifrOch } from '../../ombor/ombor-idb';

type Turn = { r: 'user' | 'ai'; m: string };
type Scope = { actor: number; company: number };
export type JarvisQueuedWrite = {
  id: string;
  operation: string;
  preview: Turn[];
  stale?: boolean;
} & ({ kind: 'create'; title: string; turns: Turn[] } | { kind: 'append'; etag: string; turns: Turn[] });

type Slot = { operation: string; bytes: Uint8Array };
const ID = /^[A-Za-z0-9_.-]{1,40}$/;
const VERSION = /^[a-f0-9]{32}$/;
const KEY = 'aes-gcm-v1';
const MAX_BYTES = 240_000;
let disk: ReturnType<typeof createStore> | undefined;
const slotKey = ({ actor, company }: Scope) => `jarvis:pending:v1:${actor}:${company}`;
const storage = () => typeof indexedDB === 'undefined' || !crypto.subtle ? null :
  (disk ??= createStore('qurai-jarvis-outbox', 'v1'));

function decode(value: unknown): JarvisQueuedWrite {
  const x = value as JarvisQueuedWrite | null;
  const turns = (a: unknown, max: number) => Array.isArray(a) && a.length >= 1 && a.length <= 12 &&
    a.every(t => t && ['user', 'ai'].includes(t.r) && typeof t.m === 'string' && t.m.length >= 1 && t.m.length <= max);
  if (!x || typeof x.id !== 'string' || !ID.test(x.id) || typeof x.operation !== 'string' || !ID.test(x.operation) ||
    !turns(x.turns, 800) || !turns(x.preview, 8000) || (x.stale != null && typeof x.stale !== 'boolean') ||
    (x.kind === 'create' ? typeof x.title !== 'string' || !x.title.trim() || x.title.length > 80 || x.operation !== x.id :
      x.kind !== 'append' || typeof x.etag !== 'string' || !VERSION.test(x.etag))) throw new Error('JARVIS_OUTBOX_INVALID');
  return x;
}

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
  if (!slot) return null;
  if (!(slot.bytes instanceof Uint8Array) || slot.bytes.byteLength < 29 || slot.bytes.byteLength > MAX_BYTES) throw new Error('JARVIS_OUTBOX_INVALID');
  const item = decode(await shifrOch(key, slot.bytes, await secret(db)));
  if (item.operation !== slot.operation) throw new Error('JARVIS_OUTBOX_INVALID');
  return item;
}

/** Atomic reservation allocates one durable head per scope, including across tabs. */
export async function jarvisOutboxStore(scope: Scope, item: JarvisQueuedWrite): Promise<boolean> {
  try {
    const db = storage();
    if (!db) return true; // An online save can still proceed with the in-memory retry state.
    const key = slotKey(scope);
    const bytes = await shifrla(key, decode(item), await secret(db));
    if (bytes.byteLength > MAX_BYTES) return false;
    let accepted = false;
    await update<Slot | null>(key, previous => {
      if ((!previous && item.stale) || (previous && previous.operation !== item.operation)) return previous ?? null;
      accepted = true;
      return { operation: item.operation, bytes };
    }, db);
    return accepted;
  } catch { return false; }
}

export async function jarvisOutboxRemove(scope: Scope, operation: string): Promise<boolean> {
  try {
    const db = storage();
    if (!db) return true;
    await update<Slot | null>(slotKey(scope), previous => previous?.operation === operation ? null : previous ?? null, db);
    return true;
  } catch { return false; }
}
