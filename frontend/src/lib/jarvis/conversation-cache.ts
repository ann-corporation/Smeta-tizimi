import { jarvisCacheRead, jarvisCacheUpdate } from './conversation-outbox';
export type ConversationCache = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { flush(): Promise<void> };
type LegacyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Legacy = { session: LegacyStore | null; local: LegacyStore | null };
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const validId = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(x);
function safe(kind: string, raw: string): string {
  if (raw.length > 1_500_000) throw Error('JARVIS_CACHE_LIMIT');
  if (kind === 'id') { if (!validId(raw)) throw Error('JARVIS_CACHE_INVALID'); return raw; }
  const list: unknown = JSON.parse(raw);
  if (!Array.isArray(list) || list.length > (kind === 'active' ? 30 : 200)) throw Error('JARVIS_CACHE_INVALID');
  const message = (x: unknown) => {
    if (!record(x) || typeof x.rol !== 'string' || !['user', 'ai'].includes(x.rol) || typeof x.matn !== 'string' || x.matn.length > 100_000) throw Error('JARVIS_CACHE_INVALID');
    return { rol: x.rol as 'user' | 'ai', matn: x.matn };
  };
  return JSON.stringify(list.map(x => {
    if (!record(x) || !validId(x.id)) throw Error('JARVIS_CACHE_INVALID');
    if (kind === 'active') return { id: x.id, ...message(x) }; // no yakun, token, actions, cards or tool results
    if (typeof x.sarlavha !== 'string' || x.sarlavha.length > 80 || typeof x.yangilandi !== 'number' ||
        !Number.isFinite(x.yangilandi) || !Array.isArray(x.xabarlar) || x.xabarlar.length > 12) throw Error('JARVIS_CACHE_INVALID');
    return { id: x.id, sarlavha: x.sarlavha, yangilandi: x.yangilandi, xabarlar: x.xabarlar.map(message) };
  }));
}
function mergeArchive(previous: unknown, next: string): string {
  if (previous != null && typeof previous !== 'string') throw Error('JARVIS_CACHE_INVALID');
  const rows = new Map<string, { id: string; yangilandi: number }>();
  for (const raw of [typeof previous === 'string' ? previous : '[]', next]) {
    for (const row of JSON.parse(safe('archive', raw)) as Array<{ id: string; yangilandi: number }>) {
      if (!rows.has(row.id) || row.yangilandi >= rows.get(row.id)!.yangilandi) rows.set(row.id, row);
    }
  }
  return safe('archive', JSON.stringify([...rows.values()].filter(x => Date.now() - x.yangilandi <= 30 * 86400000)));
}
function browserLegacy(): Legacy {
  let session: Storage | null = null, local: Storage | null = null;
  try { session = sessionStorage; } catch { /* restricted browser */ }
  try { local = localStorage; } catch { /* restricted browser */ }
  return { session, local };
}

/** Synchronous UI facade; durable mutations are ordered, encrypted and awaitable. */
export async function openConversationCache(actor: number, company: number, onError: () => void,
  legacy: Legacy = browserLegacy()): Promise<ConversationCache> {
  if (!Number.isSafeInteger(actor) || actor <= 0 || !Number.isSafeInteger(company) || company < 0) throw Error('JARVIS_CACHE_SCOPE');
  let tab = crypto.randomUUID();
  try {
    const saved = legacy.session?.getItem('jarvis-cache-tab:v1');
    if (saved && /^[a-f0-9-]{36}$/.test(saved)) tab = saved as typeof tab;
    else legacy.session?.setItem('jarvis-cache-tab:v1', tab); // random tab metadata, never conversation content
  } catch { onError(); }
  const active = `jarvis-chat:${actor}:${company}`, archive = `jarvis-suhbatlar:${actor}:${company}`;
  const entries = new Map([
    [active, { kind: 'active', disk: `jarvis:cache:v1:${actor}:${company}:active:${tab}`, source: legacy.session }],
    [active + ':id', { kind: 'id', disk: `jarvis:cache:v1:${actor}:${company}:id:${tab}`, source: legacy.session }],
    [archive, { kind: 'archive', disk: `jarvis:cache:v1:${actor}:${company}:archive`, source: legacy.local }],
  ]);
  const values = new Map<string, string>(), disabled = new Set<string>();
  let tail = Promise.resolve();
  for (const [key, item] of entries) {
    let old: string | null = null;
    try {
      old = item.source?.getItem(key) ?? null;
      const stored = await jarvisCacheRead(item.disk);
      if (stored !== undefined && stored !== null && typeof stored !== 'string') throw Error('JARVIS_CACHE_INVALID');
      if (typeof stored === 'string') values.set(key, safe(item.kind, stored));
      if (old !== null) {
        const encoded = safe(item.kind, old);
        const migrated = await jarvisCacheUpdate(item.disk, previous => {
          if (previous === null || (item.kind !== 'archive' && previous !== undefined && previous !== encoded)) throw Error('JARVIS_CACHE_LEGACY_CONFLICT');
          return item.kind === 'archive' ? mergeArchive(previous, encoded) : encoded;
        });
        if (await jarvisCacheRead(item.disk) !== migrated || typeof migrated !== 'string') throw Error('JARVIS_CACHE_VERIFY');
        values.set(key, safe(item.kind, migrated));
        if (item.source?.getItem(key) === old) item.source.removeItem(key); else onError();
      }
    } catch {
      disabled.add(key); onError(); // preserve legacy/corrupt ciphertext; never overwrite unreadable history
    }
  }
  const change = (key: string, raw: string | null) => {
    const item = entries.get(key);
    if (!item) throw Error('JARVIS_CACHE_SCOPE');
    const value = raw === null ? null : safe(item.kind, raw);
    if (value === null) values.delete(key); else values.set(key, value);
    if (disabled.has(key)) { onError(); return; }
    tail = tail.then(async () => {
      await jarvisCacheUpdate(item.disk, previous => item.kind === 'archive' && value !== null ? mergeArchive(previous, value) : value);
    }).catch(() => { onError(); });
  };
  return { getItem: key => values.get(key) ?? null, setItem: (key, raw) => change(key, raw),
    removeItem: key => change(key, null), flush: () => tail };
}
