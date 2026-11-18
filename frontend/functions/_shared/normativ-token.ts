// Shared by the Worker reader and tools/normativ-ingest/shnk_repack.mjs (Node runs this file directly:
// erasable TypeScript syntax only). Tokenisation must stay identical to the offline index builder
// (shnk_phase2_index.py): lower-case, apostrophes dropped, latin/cyrillic tokens of length >= 2, stop words removed.
const APOSTROPHES = /[‘’ʼʻ`'´]/g;
const TOKEN = /[0-9a-zа-яёўқғҳ]+/g;
const STOP = new Set(['va', 'bilan', 'uchun', 'bu', 'shu', 'ham', 'yoki', 'the', 'and',
  'для', 'что', 'это', 'как', 'или', 'при']);

export function normalise(text: string): string[] {
  const lower = text.toLowerCase().replace(APOSTROPHES, '');
  return (lower.match(TOKEN) ?? []).filter(t => t.length >= 2 && !STOP.has(t));
}

// FNV-1a (32 bit) over UTF-8 bytes; bucket = hash % buckets. The corpus manifest records buckets and hash name.
export function bucketOf(term: string, buckets: number): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(term)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h % buckets;
}

export function bucketName(index: number): string {
  return 'b' + String(index).padStart(3, '0') + '.json.gz';
}
