/* Ota yozuvning (obyekt / loyiha / viborka) kompaniyasi — 60 s kesh (`ota-kesh`), keyin baza.
   `sb.ts` va `obyekt-paket.ts` bir xil tenant tekshiruvini ishlatadi (2026-10-31: sb.ts dan ko'chirildi, xatti-harakat o'zgarmagan). */
import { supabaseBaseUrl } from './supabase-url';
import { otaKeshOl, otaKeshYoz } from './ota-kesh';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string };

export async function otaKompaniyasi(env: Env, jadval: string, id: number): Promise<number | null> {
  const bor = otaKeshOl(jadval, id);
  if (bor != null) return bor;
  const k = await otaKompaniyasiBazadan(env, jadval, id);
  if (k != null) otaKeshYoz(jadval, id, k);
  return k;
}

export async function otaKompaniyasiBazadan(env: Env, jadval: string, id: number): Promise<number | null> {
  const r = await fetch(
    supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/' + jadval + '?select=kompaniya_id&id=eq.' + id + '&limit=1',
    { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY } });
  if (!r.ok) throw new Error('OTA_OQILMADI');
  const rows = await r.json() as Array<{ kompaniya_id?: number | null }>;
  const k = Array.isArray(rows) && rows[0] ? Number(rows[0].kompaniya_id) : NaN;
  return Number.isSafeInteger(k) && k > 0 ? k : null;
}
