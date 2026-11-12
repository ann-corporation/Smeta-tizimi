/**
 * snapshot.bolak_mazmun sovuq mazmuni R2 ga (saqlash dietasi). Bu modul BITTA joyda yashaydi va ikki joyda ishlatiladi:
 *   - ops/scripts/snapshot-r2-sovut.mjs (ko'chirish: R2 ga yoz → QAYTA O'QI → sha256 → faqat shundan keyin bazada NULL);
 *   - testlar (R2 zaxira o'qish yo'li). MCP repozitoriysida xuddi shu mantiq nusxa (mcp/smeta-mcp/src/snapshot-r2.ts).
 * Erasable TypeScript: node (type stripping) va vitest ikkalasida ishlaydi. Maxfiy qiymatlar hech qachon chop etilmaydi.
 */
import { gunzipSync, gzipSync } from 'fflate';

export type Db = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> };
export type R2 = {
  /** Bayt yozadi (xuddi shu kalit qayta yozilsa — bir xil mazmun, idempotent). */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** Baytni o'qiydi; yo'q bo'lsa null. */
  get(key: string): Promise<Uint8Array | null>;
};
export type Nomzod = { xesh: string; jadval: string; qator_soni: number; bayt: number };
export type Log = (xabar: string) => void;

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true } as unknown as ConstructorParameters<typeof TextDecoder>[1]);
/** SHA-256 (hex) — WebCrypto: node, vitest va brauzerda bir xil. */
export async function sha256Hex(b: Uint8Array | string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', (typeof b === 'string' ? enc.encode(b) : b) as BufferSource);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Obyekt kaliti — mazmun sha256 bilan manzillanadi (bir xil mazmun = bir xil kalit, dublikat yo'q). */
export const sovuqKalit = (sha: string): string => {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('SHA256_NOTOGRI');
  return `snapshot-cold/v1/${sha.slice(0, 2)}/${sha}.json.gz`;
};

const gz = (matn: string): Uint8Array => gzipSync(enc.encode(matn), { level: 9 });
const gunzipMatn = (b: Uint8Array): string => dec.decode(gunzipSync(b));

export type SovutNatija = { xesh: string; holat: 'dry-run' | 'sovutildi' | 'allaqachon'; bayt_bosh: number; r2_bayt: number };

/**
 * Bitta blokni sovutadi. TARTIB (har qadam oldingisi muvaffaqiyatli bo'lsa):
 *   1) matn o'qiladi, sha256 hisoblanadi; 2) gzip R2 ga yoziladi; 3) R2 dan QAYTA o'qiladi, gunzip, sha256 solishtiriladi;
 *   4) sovuq_yoz (DB o'z sha256 ini tekshiradi) → sovuq_tasdiq → sovuq_sovut (DB yana tekshiradi, keyin NULL).
 * Har qanday nomuvofiqlikda xato tashlanadi va bazada mazmun TEGILMAGAN qoladi.
 */
export async function sovutBlok(db: Db, r2: R2, n: Nomzod, opt: { dryRun?: boolean; log?: Log } = {}): Promise<SovutNatija> {
  const log = opt.log ?? (() => undefined);
  const o = (await db.query('select matn, bayt from snapshot.sovuq_oqi($1)', [n.xesh])).rows[0];
  if (!o) return { xesh: n.xesh, holat: 'allaqachon', bayt_bosh: 0, r2_bayt: 0 };
  const matn = String(o.matn);
  const sha = await sha256Hex(matn);
  const kalit = sovuqKalit(sha);
  const bytes = gz(matn);
  if (opt.dryRun) return { xesh: n.xesh, holat: 'dry-run', bayt_bosh: Number(o.bayt), r2_bayt: bytes.length };

  await r2.put(kalit, bytes);
  const qaytdi = await r2.get(kalit);
  if (!qaytdi) throw new Error(`R2_QAYTA_OQILMADI ${n.xesh}`);
  let qaytMatn: string;
  try { qaytMatn = gunzipMatn(qaytdi); } catch { throw new Error(`R2_GUNZIP_XATO ${n.xesh}`); }
  if ((await sha256Hex(qaytMatn)) !== sha) throw new Error(`R2_SHA256_MOS_EMAS ${n.xesh}`);

  await db.query('select snapshot.sovuq_yoz($1, $2, $3, $4)', [n.xesh, kalit, sha, bytes.length]);
  await db.query('select snapshot.sovuq_tasdiq($1, $2)', [n.xesh, sha]);
  const bosh = Number((await db.query('select snapshot.sovuq_sovut($1, $2) as b', [n.xesh, sha])).rows[0]?.b ?? 0);
  log(`sovutildi ${n.xesh.slice(0, 12)} ${n.jadval} ${bosh}B -> R2 ${bytes.length}B`);
  return { xesh: n.xesh, holat: bosh > 0 ? 'sovutildi' : 'allaqachon', bayt_bosh: bosh, r2_bayt: bytes.length };
}

export type Kolonka = { xesh: string; r2_key: string; r2_sha256: string };

/**
 * Bitta sovuq blokni R2 dan bazaga qaytaradi. R2 matni sha256 ga va (bazada) blok xeshiga mos bo'lmasa — xato (hech narsa yozilmaydi).
 * Qaytaradi: true — tiklandi, false — allaqachon bazada.
 */
export async function tiklaBlok(db: Db, r2: R2, b: Kolonka): Promise<boolean> {
  const bytes = await r2.get(b.r2_key);
  if (!bytes) throw new Error(`R2_OBYEKT_YOQ ${b.r2_key}`);
  let matn: string;
  try { matn = gunzipMatn(bytes); } catch { throw new Error(`R2_GUNZIP_XATO ${b.r2_key}`); }
  if ((await sha256Hex(matn)) !== b.r2_sha256) throw new Error(`R2_SHA256_MOS_EMAS ${b.r2_key}`);
  const r = await db.query('select snapshot.sovuq_tikla($1, $2, $3) as ok', [b.xesh, matn, b.r2_sha256]);
  return r.rows[0]?.ok === true;
}

/** Snapshotning barcha sovuq bloklarini tiklaydi (farq/qaytar oldidan). Qaytaradi: tiklangan bloklar soni. */
export async function tiklaSnapshot(db: Db, r2: R2, snapshotId: number): Promise<number> {
  const rows = (await db.query('select xesh, r2_key, r2_sha256 from snapshot.sovuq_bolaklar($1::bigint)', [snapshotId])).rows;
  let n = 0;
  for (const r of rows) if (await tiklaBlok(db, r2, { xesh: String(r.xesh), r2_key: String(r.r2_key), r2_sha256: String(r.r2_sha256) })) n++;
  return n;
}

/** Cloudflare REST orqali R2 (mavjud upload-price-shards.mjs bilan bir xil yo'l; token faqat muhitdan, chop etilmaydi). */
export function cloudflareR2(env: { token: string; account: string; bucket?: string }, fetchFn: typeof fetch = fetch): R2 {
  const baza = `https://api.cloudflare.com/client/v4/accounts/${env.account}/r2/buckets/${env.bucket ?? 'smeta-tizimi-canonical'}/objects/`;
  const url = (key: string) => baza + key.split('/').map(encodeURIComponent).join('/');
  const sarlavha = { Authorization: 'Bearer ' + env.token };
  return {
    async put(key, bytes) {
      for (let urin = 1; ; urin++) {
        const r = await fetchFn(url(key), { method: 'PUT', body: bytes as BodyInit, headers: { ...sarlavha, 'Content-Type': 'application/octet-stream' } });
        if (r.ok) return;
        if (urin >= 4 || (r.status < 500 && r.status !== 429)) throw new Error(`R2_PUT_${r.status}`);
        await new Promise((ok) => setTimeout(ok, urin * 2000));
      }
    },
    async get(key) {
      const r = await fetchFn(url(key), { headers: sarlavha });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`R2_GET_${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}
