/**
 * Sovuq snapshot bloklari (snapshot.bolak_mazmun.qatorlar IS NULL, mazmun R2 da) — snapshot_farq / snapshot_qaytar oldidan
 * R2 dan bazaga (shu tranzaksiyada) tiklanadi. Mantiq GAS repozitoriysidagi frontend/src/lib/snapshot-r2/sovuq.ts bilan bir xil:
 * R2 matni sha256 ga mos bo'lmasa — xato, bazaga hech narsa yozilmaydi; DB (snapshot.sovuq_tikla) blok xeshini ham tekshiradi.
 * R2: Cloudflare REST (mavjud muhit nomlari CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID; hech qachon chop etilmaydi).
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'fflate';
import type { Mijoz } from './db';

export type R2Oqish = { get(key: string): Promise<Uint8Array | null> };

export function cloudflareR2Oqish(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): R2Oqish {
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !account) {
    throw new Error('Snapshot mazmuni R2 da (sovuq), lekin CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID muhit o\'zgaruvchilari o\'rnatilmagan — tiklab bo\'lmaydi.');
  }
  const baza = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${env.SMETA_R2_BUCKET?.trim() || 'smeta-tizimi-canonical'}/objects/`;
  return {
    async get(key) {
      const r = await fetchFn(baza + key.split('/').map(encodeURIComponent).join('/'), { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`R2 o'qish xatosi: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}

const sha256 = (s: Uint8Array | string) => createHash('sha256').update(s).digest('hex');

/** snapshot.sovuq_bolaklar mavjudmi (migratsiya qo'llanmagan bo'lsa — sovuq blok ham yo'q). */
async function sovuqFunksiyaBor(m: Mijoz): Promise<boolean> {
  const r = await m.query<{ bor: boolean }>(
    "select exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'snapshot' and p.proname = 'sovuq_bolaklar') as bor");
  return !!r.rows[0]?.bor;
}

/**
 * Snapshotning sovuq bloklarini R2 dan tiklaydi (bazada, joriy tranzaksiyada). Qaytaradi: tiklangan bloklar soni.
 * `r2` berilmasa — faqat sovuq blok bo'lsa muhitdan yaratiladi.
 */
export async function snapshotSovuqTikla(m: Mijoz, snapshotId: number, r2?: R2Oqish): Promise<number> {
  if (!(await sovuqFunksiyaBor(m))) return 0;
  const rows = (await m.query<{ xesh: string; r2_key: string; r2_sha256: string }>(
    'select xesh, r2_key, r2_sha256 from snapshot.sovuq_bolaklar($1::bigint)', [snapshotId])).rows;
  if (!rows.length) return 0;
  const oqish = r2 ?? cloudflareR2Oqish();
  let n = 0;
  for (const b of rows) {
    const bytes = await oqish.get(b.r2_key);
    if (!bytes) throw new Error(`R2 obyekti topilmadi: ${b.r2_key} (snapshot #${snapshotId} tiklanmaydi; hech narsa o'zgarmadi)`);
    let matn: string;
    try { matn = new TextDecoder('utf-8', { fatal: true }).decode(gunzipSync(bytes)); } catch { throw new Error(`R2 obyekti gunzip bo'lmadi: ${b.r2_key}`); }
    if (sha256(matn) !== b.r2_sha256) throw new Error(`R2 obyekti sha256 ga mos emas: ${b.r2_key} (buzilgan; hech narsa o'zgarmadi)`);
    const r = await m.query<{ ok: boolean }>('select snapshot.sovuq_tikla($1::text, $2::text, $3::text) as ok', [b.xesh, matn, b.r2_sha256]);
    if (r.rows[0]?.ok === true) n++;
  }
  return n;
}
