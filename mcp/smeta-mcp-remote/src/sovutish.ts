/**
 * Kunlik snapshot sovutish (Cloudflare cron): snapshot.bolak_mazmun sovuq mazmuni -> R2, noutbuksiz.
 * Mantiq frontend/src/lib/snapshot-r2/sovuq.ts da (yagona nusxa; fork emas): R2 ga yoz -> QAYTA O'QI -> sha256 -> faqat shundan keyin
 * bazada NULL. Nomzodlar snapshot.sovuq_nomzod dan: obyektning ENG SO'NGGI snapshoti bloklari issiq qoladi, N kundan yangilari ham.
 * IDEMPOTENT (sovutilgan blok nomzod bo'lmaydi), partiya chegaralangan, xatoda blok bazada TEGILMAGAN qoladi.
 * Joy VACUUM FULL siz ham qayta ishlatiladi (autovacuum); VACUUM FULL Worker'da mumkin emas (docs/mcp/REMOTE.md).
 */
import { sovutBlok, type Db, type R2 } from '../../../frontend/src/lib/snapshot-r2/sovuq';
import { dbAloqa, isitObyekt, sovutMuhrBlok } from '../../../frontend/src/lib/qator-muhr-r2/sovuq';
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

export const MUHR_STANDART_KUN = 2;
export const MUHR_STANDART_BLOK = 20;
/** Muhr sovutish uchun alohida vaqt byudjeti (ms) — snapshot byudjetidan keyin; birgalikda cron chegarasidan oshmasin. */
export const MUHR_STANDART_BYUDJET_MS = 15_000;
export type MuhrSovutishNatija = {
  isitildi_blok: number; isitildi_qator: number; sovutildi_blok: number; sovutildi_qator: number; bosh_bayt: number; r2_bayt: number; xato: number;
  to_xtadi: 'tugadi' | 'byudjet' | 'blok_limiti' | 'xato_chegarasi' | 'migratsiya_yoq';
};
export type MuhrSovutishOpsiya = { kun?: number; blokLimit?: number; byudjetMs?: number; now?: () => number; log?: (m: string) => void };

/**
 * t2_qator_muhr yuklamasi (qator-muhr-r2/sovuq.ts): 1) avval o'zgargan/o'chirilgan sovuq qatorlar ISITILADI (reader to'liq avval/endi ko'rsin),
 * 2) keyin nomzod obyektlar bloklab sovutiladi (R2 ga yoz -> qayta o'qi -> sha256 -> NULL). Partiya: blokLimit, vaqt byudjeti, MAKS_XATO.
 * Migratsiya qo'llanmagan bo'lsa (funksiya yo'q) — jim o'tkazib yuboradi (cron yiqilmaydi). Hech qachon yuklamani o'zi yozmaydi — faqat RPC.
 */
export async function muhrSovutishPartiya(db: Db, r2: R2, o: MuhrSovutishOpsiya = {}): Promise<MuhrSovutishNatija> {
  const kun = Math.max(0, Math.trunc(o.kun ?? MUHR_STANDART_KUN));
  const blokLimit = Math.max(1, Math.min(Math.trunc(o.blokLimit ?? MUHR_STANDART_BLOK), 200));
  const byudjet = o.byudjetMs ?? MUHR_STANDART_BYUDJET_MS;
  const now = o.now ?? Date.now;
  const log = o.log ?? (() => undefined);
  const boshlandi = now();
  const n: MuhrSovutishNatija = { isitildi_blok: 0, isitildi_qator: 0, sovutildi_blok: 0, sovutildi_qator: 0, bosh_bayt: 0, r2_bayt: 0, xato: 0, to_xtadi: 'tugadi' };
  try {
    const it = await isitObyekt(dbAloqa(db), r2, null, { limit: 20, log });
    n.isitildi_blok = it.blok; n.isitildi_qator = it.qator; n.xato += it.xato;
    const obyektlar = (await db.query('select obyekt_id, qator_soni from public.t2_qator_muhr_sovuq_nomzod_v1($1, $2)', [kun, 50])).rows;
    let bloklar = 0;
    for (const ob of obyektlar) {
      for (;;) {
        if (bloklar >= blokLimit) { n.to_xtadi = 'blok_limiti'; return n; }
        if (now() - boshlandi >= byudjet) { n.to_xtadi = 'byudjet'; return n; }
        if (n.xato >= MAKS_XATO) { n.to_xtadi = 'xato_chegarasi'; return n; }
        let s;
        try { s = await sovutMuhrBlok(db, r2, String(ob.obyekt_id), { kun, log }); }
        catch (e) {
          n.xato++;
          log(`muhr sovutish XATO obyekt=${String(ob.obyekt_id)}: ${e instanceof Error ? e.message : String(e)} (bazada tegilmagan)`);
          break; // shu obyekt keyingi kunga; boshqa obyektlar davom etadi
        }
        if (s.holat !== 'sovutildi') break; // obyektda nomzod qolmadi
        bloklar++; n.sovutildi_blok++; n.sovutildi_qator += s.qator_soni; n.bosh_bayt += s.bayt_bosh; n.r2_bayt += s.r2_bayt;
      }
    }
  } catch (e) {
    if (/function .*t2_qator_muhr_\w+.*does not exist/s.test(e instanceof Error ? e.message : String(e))) { n.to_xtadi = 'migratsiya_yoq'; return n; }
    throw e;
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
    // t2_qator_muhr yuklamasi — o'z xato izolyatsiyasi: snapshot natijasiga ta'sir qilmaydi.
    if (env.MUHR_SOVUT_OFF !== '1') {
      try {
        const m = await muhrSovutishPartiya(db, r2Binding(env.SNAPSHOT_R2), {
          kun: env.MUHR_SOVUT_KUN?.trim() && Number.isFinite(Number(env.MUHR_SOVUT_KUN)) ? Number(env.MUHR_SOVUT_KUN) : MUHR_STANDART_KUN,
          blokLimit: raqam(env.MUHR_SOVUT_BLOK, MUHR_STANDART_BLOK), log,
        });
        log(JSON.stringify({ amal: 'muhr_sovutish', ...m }));
      } catch (e) {
        console.error(`muhr sovutish xatosi: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
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
