import { NativeDesktopCache } from './native-cache';
import { DesktopOfflineRuntime, type NativeSessionInfo } from './offline-runtime';
import type { NativeInvoke } from './fetch-shim';

const KEY = 'desktop-resume-v1';
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const objectFromPath = (path: string) => {
  const match = /^\/admin\/holat\/([1-9]\d*)$/.exec(path);
  return match && positive(Number(match[1])) ? Number(match[1]) : null;
};
const same = (a: NativeSessionInfo, b: NativeSessionInfo) => a.device_id === b.device_id && a.foydalanuvchi_id === b.foydalanuvchi_id && a.generation === b.generation;
type Hint = { actor: number; device: string; company: number; object: number };

/** The browser hint is untrusted navigation metadata, never an authorization or a cached response. */
export function desktopBootstrap(options: {
  invoke: NativeInvoke; request: typeof fetch; publicKey: Uint8Array; kid: string;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; clock?: () => number;
}) {
  let remembered = '';
  const clear = () => { remembered = ''; options.storage.removeItem(KEY); };
  const info = () => options.invoke<NativeSessionInfo>('desktop_session_info');
  const valid = (s: NativeSessionInfo) => positive(s.foydalanuvchi_id) && !!s.device_id && Number.isSafeInteger(s.generation);
  const scopedCache = (s: NativeSessionInfo) => new NativeDesktopCache((command, args) =>
    options.invoke(command, { ...args, expectedGeneration: s.generation }));
  return {
    clear,
    async remember(path: string) {
      const object = objectFromPath(path); if (!object) return;
      try {
        const before = await info(); if (!valid(before)) return;
        const signature = before.device_id + '/' + before.foydalanuvchi_id + path;
        if (remembered === signature) return;
        const keys = (await scopedCache(before).keys()).filter(k => /^packet\/[1-9]\d*\/[1-9]\d*$/.test(k) && Number(k.split('/')[2]) === object);
        if (keys.length !== 1 || !same(before, await info())) return;
        options.storage.setItem(KEY, JSON.stringify({ actor: before.foydalanuvchi_id, device: before.device_id, company: Number(keys[0].split('/')[1]), object }));
        remembered = signature;
      } catch { /* A failed hint write cannot break the current page. */ }
    },
    async restore(): Promise<string | null> {
      let runtime: DesktopOfflineRuntime | undefined;
      try {
        const value = options.storage.getItem(KEY); if (!value || value.length > 512) return null;
        const hint = JSON.parse(value) as Hint, before = await info();
        if (!valid(before) || !positive(hint.actor) || !positive(hint.company) || !positive(hint.object) ||
            hint.actor !== before.foydalanuvchi_id || hint.device !== before.device_id) throw new Error('DESKTOP_RESUME_SCOPE');
        const invoke: NativeInvoke = (command, args) => options.invoke(command,
          command.startsWith('desktop_cache_') ? { ...args, expectedGeneration: before.generation } : args);
        // Require an existing encrypted snapshot, then independently revalidate its signed scope.
        if (!await scopedCache(before).get('packet/' + hint.company + '/' + hint.object)) throw new Error('DESKTOP_RESUME_MISSING');
        runtime = new DesktopOfflineRuntime({ ...options, invoke, onInvalidate() {} });
        const opened = await runtime.open(hint.company, hint.object);
        if (!opened.permissions.includes('company.read') || !same(before, await info())) throw new Error('DESKTOP_RESUME_CHANGED');
        // Cold navigation needs the leased object row even if its first live list preceded the lease.
        // Only identity/name come from the verified snapshot; absent business fields stay absent.
        const cache = scopedCache(before), key = 'pages/' + hint.company + '/' + hint.object;
        const saved = await cache.get<Record<string, unknown>>(key) ?? {};
        await cache.set(key, { ...saved, object: { id: hint.object, kompaniya_id: hint.company, nom: opened.paket.obyekt_nom } });
        if (!same(before, await info())) throw new Error('DESKTOP_RESUME_CHANGED');
        // Existing provider revalidates this UI selection against current membership. It grants no rights.
        options.storage.setItem('t2_kompaniya_kontekst', JSON.stringify({ uid: hint.actor, id: hint.company, global: false }));
        return '/admin/holat/' + hint.object;
      } catch { try { clear(); } catch { /* Storage may be unavailable. */ } return null; }
      finally { runtime?.dispose(); }
    },
  };
}
