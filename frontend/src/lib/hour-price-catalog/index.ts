export const HOUR_CATALOG_REVISION = '16ee27da8700cc28';
export type MachineOffer = { machineKey: string; name: string; unit: 'маш-ч'; price: string;
 sourceKey: string; sourceSha256: string; sourceDate: string; page: number; vat: 'EXCLUDED' };
export type LabourOffer = { id: string; name: string; region: string; aggregate: boolean;
 year: number; quarter: number; unit: 'чел-ч'; price: string; socialInsurance: 'EXCLUDED';
 sourceSha256: string; sheet: string; baseCell: string };
export type HourCatalog = { schema: 'hour-price-catalog-v1'; machineCoverage: 'PARTIAL_VERIFIED_SUBSET';
 machines: MachineOffer[]; labour: LabourOffer[] };
const machineKey = (name: string) => name.normalize('NFC').toLocaleLowerCase('ru')
 .replace(/ё/g, 'е').replace(/\s+/gu, ' ').trim();

/** Suggestions only. No mutation of baseline, actual or certified prices. */
export function machinePrice(catalog: HourCatalog, name: string, unit: string): MachineOffer | null {
 if (unit !== 'маш-ч') return null;
 const matches = catalog.machines.filter(r => r.machineKey === machineKey(name));
 return matches.length === 1 ? matches[0] : null;
}
/** No national-average fallback, no unselected period, no worker→operator assumption. */
export function labourPrice(catalog: HourCatalog, query: {
 region: string; year: number; quarter: number; unit: string; scope: string;
}): LabourOffer | null {
 if (query.unit !== 'чел-ч' || query.scope !== 'CONSTRUCTION_WORKER_REFERENCE') return null;
 const matches = catalog.labour.filter(r => r.region === query.region && r.year === query.year && r.quarter === query.quarter);
 return matches.length === 1 ? matches[0] : null;
}

type Manifest = { revision: string; files: { 'catalog.json': { sha256: string; bytes: number } } };
export async function loadHourCatalog(fetcher: typeof fetch = fetch): Promise<HourCatalog> {
 const get = async (f: string) => {
  const response = await fetcher(`/api/hour-price-catalog?rev=${HOUR_CATALOG_REVISION}&f=${f}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('HOUR_CATALOG_UNAVAILABLE');
  return response;
 };
 const manifest = await (await get('manifest.json')).json() as Manifest;
 if (manifest.revision !== HOUR_CATALOG_REVISION) throw new Error('HOUR_REVISION_MISMATCH');
 const bytes = await (await get('catalog.json')).arrayBuffer();
 const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  .map(v => v.toString(16).padStart(2,'0')).join('');
 if (bytes.byteLength !== manifest.files['catalog.json'].bytes || hash !== manifest.files['catalog.json'].sha256 || !hash.startsWith(HOUR_CATALOG_REVISION))
  throw new Error('HOUR_SOURCE_HASH_MISMATCH');
 const data = JSON.parse(new TextDecoder().decode(bytes)) as HourCatalog;
 if (data.schema !== 'hour-price-catalog-v1' || !Array.isArray(data.machines) || !Array.isArray(data.labour))
  throw new Error('HOUR_SCHEMA_INVALID');
 return data;
}
