/**
 * Kunlik snapshot sovutish (Cloudflare cron): snapshot.bolak_mazmun sovuq mazmuni -> R2, noutbuksiz.
 * Mantiq frontend/src/lib/snapshot-r2/sovuq.ts da (yagona nusxa; fork emas): R2 ga yoz -> QAYTA O'QI -> sha256 -> faqat shundan keyin
 * bazada NULL. Nomzodlar snapshot.sovuq_nomzod dan: obyektning ENG SO'NGGI snapshoti bloklari issiq qoladi, N kundan yangilari ham.
 * IDEMPOTENT (sovutilgan blok nomzod bo'lmaydi), partiya chegaralangan, xatoda blok bazada TEGILMAGAN qoladi.
 * Joy VACUUM FULL siz ham qayta ishlatiladi (autovacuum); VACUUM FULL Worker'da mumkin emas (docs/mcp/REMOTE.md).
 */
import { sovutBlok, type Db, type R2 } from '../../../frontend/src/lib/snapshot-r2/sovuq';
import type { Env, R2BucketLike } from './env';
import { hyperdriveHovuz } from './hovuz';

export const STANDART_KUN = 2;
export const STANDART_LIMIT = 200;
export const MAKS_XATO = 5;
/** Cron CPU/vaqt chegarasidan oldin to'xtash (ms, devor soati). */
export const STANDART_BYUDJET_MS = 20_000;
/** Baza hajmi ogohlantirish chegarasi (MB): Supabase Free = 500 MB. */
export const HAJM_OGOHLANTIRISH_MB = 450;
/** Shu hajmdan (MB) boshlab har obyektning so'nggi snapshoti ham (N kundan keyin) R2 ga sovutiladi (SNAPSHOT_SOVUT_SONGGI=auto). */
export const HAJM_SONGGI_MB = 450;

export type SovutishNatija = {
  korildi: number; sovutildi: number; allaqachon: number; xato: number; bosh_bayt: number; r2_bayt: number;
  to_xtadi: 'tugadi' | 'byudjet' | 'xato_chegarasi';
};
export type SovutishOpsiya = { kun?: number; limit?: number; songgiHam?: boolean; byudjetMs?: number; now?: () => number; log?: (m: string) => void };

/** R2 bucket binding -> sovuq.ts R2 interfeysi. */
export function r2Binding(b: R2BucketLike): R2 {
  return {
    async put(key, bytes) { await b.put(key, bytes); },
    async get(key) {
      const o = await b.get(key);
      return o ? new Uint8Array(await o.arrayBuffer()) : null;
    },
  };
}

/** Bitta partiya: eng katta nomzodlardan boshlab. Hech qachon DB ga mazmun yozmaydi (faqat sovuq_* RPC lar). */
export async function sovutishPartiya(db: Db, r2: R2, o: SovutishOpsiya = {}): Promise<SovutishNatija> {
  const kun = Math.max(1, Math.trunc(o.kun ?? STANDART_KUN));
  const songgi = o.songgiHam === true;
  const limit = Math.max(1, Math.min(Math.trunc(o.limit ?? STANDART_LIMIT), 5000));
  const byudjet = o.byudjetMs ?? STANDART_BYUDJET_MS;
  const now = o.now ?? Date.now;
  const log = o.log ?? (() => undefined);
  const boshlandi = now();
  const n: SovutishNatija = { korildi: 0, sovutildi: 0, allaqachon: 0, xato: 0, bosh_bayt: 0, r2_bayt: 0, to_xtadi: 'tugadi' };

  const nomzodlar = (await db.query('select xesh, jadval, qator_soni, bayt from snapshot.sovuq_nomzod($1, $2, $3)', [kun, limit, songgi])).rows;
  for (const r of nomzodlar) {
    if (n.korildi >= limit) break;
    if (now() - boshlandi >= byudjet) { n.to_xtadi = 'byudjet'; break; }
    n.korildi++;
    try {
      const s = await sovutBlok(db, r2, { xesh: String(r.xesh), jadval: String(r.jadval), qator_soni: Number(r.qator_soni), bayt: Number(r.bayt) });
      if (s.holat === 'sovutildi') { n.sovutildi++; n.bosh_bayt += s.bayt_bosh; n.r2_bayt += s.r2_bayt; } else n.allaqachon++;
    } catch (e) {
      n.xato++;
      log(`sovutish XATO ${String(r.xesh).slice(0, 12)}: ${e instanceof Error ? e.message : String(e)} (blok bazada tegilmagan)`);
      if (n.xato >= MAKS_XATO) { n.to_xtadi = 'xato_chegarasi'; break; }
    }
  }
  return n;
}

/** pg_database_size, MB (butun, yuqoriga yaxlitlanmaydi). Xato bo'lsa null. */
export async function dbHajmMb(db: Db): Promise<number | null> {
  try {
    const b = Number((await db.query('select pg_database_size(current_database())::bigint as b')).rows[0]?.b);
    return Number.isFinite(b) ? Math.round(b / 1048576) : null;
  } catch { return null; }
}

/** Hyperdrive hovuzi -> Db (har so'rov alohida ulanish olinib qaytariladi). */
export function hovuzDb(env: Env): { db: Db; yop(): Promise<void> } {
  const h = hyperdriveHovuz(env.HYPERDRIVE?.connectionString);
  const db: Db = {
    async query(sql, params) {
      const m = await h.connect();
      try { return await m.query(sql, params) as { rows: Array<Record<string, unknown>> }; } finally { m.release(); }
    },
  };
  return { db, yop: () => h.end() };
}

/** SNAPSHOT_SOVUT_SONGGI: '1' — doim, '0' — hech qachon, boshqa/bo'sh (auto) — baza HAJM_SONGGI_MB dan oshganda. Hajm noma'lum (null) bo'lsa — yo'q. */
export function songgiQaror(v: string | undefined, dbMb: number | null): boolean {
  const x = (v ?? 'auto').trim().toLowerCase();
  if (x === '1' || x === 'true') return true;
  if (x === '0' || x === 'false') return false;
  return dbMb !== null && dbMb >= HAJM_SONGGI_MB;
}

const raqam = (s: string | undefined, d: number) => { const v = Number(s); return Number.isFinite(v) && v > 0 ? v : d; };

/** Cron kirish nuqtasi. Hech qachon tashlamaydi (cron'ni yiqitmaydi); natija JSON log. */
export async function sovutishCron(env: Env, o: { db?: Db; log?: (m: string) => void } = {}): Promise<void> {
  const log = o.log ?? ((m: string) => console.info(m));
  let yop: (() => Promise<void>) | undefined;
  try {
    let db = o.db;
    if (!db) { const h = hovuzDb(env); db = h.db; yop = h.yop; }
    const oldin = await dbHajmMb(db);
    if (oldin !== null && oldin > HAJM_OGOHLANTIRISH_MB) console.warn(`DB_HAJM_OGOHLANTIRISH db_mb=${oldin} > ${HAJM_OGOHLANTIRISH_MB} (Supabase Free 500 MB)`);
    if (!env.SNAPSHOT_R2) { log('snapshot sovutish o\'tkazib yuborildi: SNAPSHOT_R2 binding yo\'q'); return; }
    const n = await sovutishPartiya(db, r2Binding(env.SNAPSHOT_R2), {
      kun: raqam(env.SNAPSHOT_SOVUT_KUN, STANDART_KUN), songgiHam: songgiQaror(env.SNAPSHOT_SOVUT_SONGGI, oldin), limit: raqam(env.SNAPSHOT_SOVUT_LIMIT, STANDART_LIMIT), log,
    });
    log(JSON.stringify({ amal: 'snapshot_sovutish', db_mb_oldin: oldin, ...n }));
  } catch (e) {
    console.error(`snapshot sovutish xatosi: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    if (yop) await yop().catch(() => undefined);
  }
}

let hajmKesh: { t: number; mb: number | null } | null = null;
/** /health uchun: DB hajmi (MB), 5 daqiqa keshlanadi; xatoda null (health yiqilmaydi). */
export async function healthDbMb(env: Env, now: number = Date.now(), db?: Db): Promise<number | null> {
  if (hajmKesh && now - hajmKesh.t < 300_000) return hajmKesh.mb;
  let yop: (() => Promise<void>) | undefined;
  let mb: number | null = null;
  try {
    if (!db) { const h = hovuzDb(env); db = h.db; yop = h.yop; }
    mb = await Promise.race([dbHajmMb(db), new Promise<null>((ok) => setTimeout(() => ok(null), 3000))]);
  } catch { mb = null; } finally { if (yop) await yop().catch(() => undefined); }
  hajmKesh = { t: now, mb };
  return mb;
}
export function _healthKeshniTozala(): void { hajmKesh = null; }
