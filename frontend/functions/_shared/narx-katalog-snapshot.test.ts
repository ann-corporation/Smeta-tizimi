// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { katalogSnapshotlari } from './narx-katalog-snapshot';

const REV = 'd'.repeat(16);
const dict = { birlik: ['м3'], hudud: ['г. Ташкент'], zavod: ['ООО Завод'], ndsHolati: ['nds_bilan'], ndsIzoh: ['НДС 12%'], variant: [], guruh: ['Бетон'],
  manba: { id: 5, nom: 'Каталог 1 кв. 2026', tur: 'katalog', sana: '2026-01-01', yil: 2026, kvartal: 1, region: null, nds_holati: 'nomalum' } };
const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => [from + i, i, null, 'Бетон В15 #' + (from + i), 0, '700000.50', 0, 0, 0, 0, null, null, -1, 0]);
const gz = (b: Uint8Array) => new Response(new Blob([b as unknown as ArrayBuffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
function bucket(gzip = true) {
  const asked: string[] = [];
  const obj = (v: unknown) => { const text = JSON.stringify(v); const b = new TextEncoder().encode(text);
    return { text: async () => text, arrayBuffer: async () => gzip ? gz(b) : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, httpMetadata: { contentEncoding: gzip ? 'gzip' : undefined } }; };
  const store: Record<string, unknown> = {
    'narx-katalog/CURRENT.json': { revision: REV },
    [`narx-katalog/${REV}/manifest.json`]: { revision: REV, files: { dict: { path: 'dict.json' }, lookup: [{ path: 'i/0000.json', from: 100, to: 199 }, { path: 'i/0001.json', from: 200, to: 299 }] } },
    [`narx-katalog/${REV}/dict.json`]: dict,
    [`narx-katalog/${REV}/i/0000.json`]: { rows: rows(100, 100) },
    [`narx-katalog/${REV}/i/0001.json`]: { rows: rows(200, 100) },
  };
  return { asked, r2: { get: async (k: string) => { asked.push(k); return k in store ? obj(store[k]) : null; } } };
}

describe('server-side R2 catalogue snapshot', () => {
  it('returns verified snapshots with manba metadata; exact price text kept; only needed lookup files read', async () => {
    const b = bucket();
    const m = await katalogSnapshotlari(b.r2, [150, 151, 999999, 150]);
    expect([...m.keys()]).toEqual([150, 151]);              // unknown id simply absent
    expect(m.get(150)).toMatchObject({ revision: REV, id: 150, manba_id: 5, nom: 'Бетон В15 #150', birlik: 'м3', narx: '700000.50',
      hudud: 'г. Ташкент', ishlab_chiqaruvchi: 'ООО Завод', nds_holati: 'nds_bilan', yil: 2026, kvartal: 1, narx_varianti: null, guruh: 'Бетон' });
    expect(b.asked.filter(k => k.includes('/i/'))).toEqual([`narx-katalog/${REV}/i/0000.json`]);
  });
  it('works with non-gzip objects; empty/invalid ids → no R2 reads', async () => {
    expect((await katalogSnapshotlari(bucket(false).r2, [250])).get(250)?.nom).toBe('Бетон В15 #250');
    const b = bucket();
    expect((await katalogSnapshotlari(b.r2, [0, -1, Number.NaN])).size).toBe(0);
    expect(b.asked).toEqual([]);
  });
  it('missing catalogue fails loudly (caller decides; sb-yoz falls back to no snapshot → RPC fail-closed)', async () => {
    await expect(katalogSnapshotlari({ get: async () => null }, [150])).rejects.toThrow('PRICE_CATALOG_NOT_FOUND');
  });
});
