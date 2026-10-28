import { prixodKitobOqi } from '../lib/ombor-prixod/kitob';
import type { PrixodOpsiya } from '../lib/ombor-prixod/turlar';
self.onmessage = async (e: MessageEvent<{ bytes: Uint8Array; opsiya: PrixodOpsiya }>) => {
  try { self.postMessage({ ok: true, kitob: await prixodKitobOqi(e.data.bytes, e.data.opsiya) }); }
  catch (err) { self.postMessage({ ok: false, code: err instanceof Error ? err.message : 'PRIXOD_READ_FAILED' }); }
};
