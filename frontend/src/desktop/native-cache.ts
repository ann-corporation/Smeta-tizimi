import type { NativeInvoke } from './fetch-shim';

/** Rust encrypts/decrypts at rest with a persistent OS-keychain key. Renderer receives no key. */
export class NativeDesktopCache {
  private readonly invoke: NativeInvoke;
  constructor(invoke: NativeInvoke) { this.invoke = invoke; }
  async get<T>(key: string): Promise<T | undefined> {
    const bytes = await this.invoke<number[] | null>('desktop_cache_read', { key });
    if (bytes === null) return undefined;
    if (!Array.isArray(bytes) || !bytes.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('DESKTOP_CACHE_INVALID');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))) as T;
  }
  set(key: string, value: unknown) {
    return this.invoke<void>('desktop_cache_write', { key, value: Array.from(new TextEncoder().encode(JSON.stringify(value))) });
  }
  delete(key: string) { return this.invoke<void>('desktop_cache_delete', { key }); }
  keys() { return this.invoke<string[]>('desktop_cache_keys'); }
}
