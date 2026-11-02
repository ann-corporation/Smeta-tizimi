import type { PrixodKitob, PrixodOpsiya } from './turlar';

export async function prixodKitobFonda(bytes: Uint8Array, opsiya: PrixodOpsiya, signal?: AbortSignal): Promise<PrixodKitob> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (typeof Worker === 'undefined') {
    const { prixodKitobOqi } = await import('./kitob');
    const result = await prixodKitobOqi(bytes, opsiya);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return result;
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/ombor-prixod.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = e => { cleanup(); if (e.data.ok) resolve(e.data.kitob); else reject(new Error(String(e.data.code))); };
    worker.onerror = () => { cleanup(); reject(new Error('PRIXOD_READ_FAILED')); };
    worker.postMessage({ bytes, opsiya });
  });
}
