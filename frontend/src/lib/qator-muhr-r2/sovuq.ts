/**
 * t2_qator_muhr yuklamasi (tur/kod/nom/birlik/kat/ota/hajm/narx/norma) R2 ga — saqlash dietasi. Dizayn: docs/architecture/ADR_MUHR_R2.md.
 * Mexanizm snapshot sovutish bilan BIR XIL (frontend/src/lib/snapshot-r2/sovuq.ts: sha256Hex, Db, R2, cloudflareR2 — qayta ishlatiladi,
 * ikkinchi saqlash mexanizmi yo'q): R2 ga yoz -> QAYTA O'QI -> gunzip -> sha256 -> faqat shundan keyin bazada NULL (DB yana o'zi tekshiradi).
 * Ikki joyda ishlatiladi: mcp/smeta-mcp-remote/src/sovutish.ts (kunlik cron, SQL orqali) va frontend/functions/api/muhr-isit.ts (so'rov
 * paytida isitish, PostgREST RPC orqali) — shuning uchun isitish `MuhrAloqa` interfeysi orqali.
 * Erasable TypeScript (node type stripping + vitest). Maxfiy qiymatlar hech qachon chop etilmaydi.
 */
import { gunzipSync, gzipSync } from 'fflate';
import { sha256Hex, type Db, type Log, type R2 } from '../snapshot-r2/sovuq';

export type R2Oqish = Pick<R2, 'get'>;

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true } as unknown as ConstructorParameters<typeof TextDecoder>[1]);
const gz = (matn: string): Uint8Array => gzipSync(enc.encode(matn), { level: 9 });
const gunzipMatn = (b: Uint8Array): string => dec.decode(gunzipSync(b));

/** Kalit — mazmun sha256 bilan manzillanadi (bir xil mazmun = bir xil kalit; snapshot-cold/ bilan aralashmaydi). */
export const muhrKalit = (sha: string): string => {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('SHA256_NOTOGRI');
  return `muhr-cold/v1/${sha.slice(0, 2)}/${sha}.json.gz`;
};

const idlarMatn = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

export type MuhrSovutNatija = { holat: 'dry-run' | 'sovutildi' | 'allaqachon'; qator_soni: number; bayt_bosh: number; r2_bayt: number; sovuq_id?: string };

/**
 * Bitta obyektning bitta blokini sovutadi. TARTIB (har qadam oldingisi muvaffaqiyatli bo'lsa):
 *   1) oqi: DB nomzod qatorlar id lari va R2 matnini beradi; 2) sha256, gzip R2 ga; 3) R2 dan QAYTA o'qiladi, gunzip, sha256 solishtiriladi,
 *   JSON qator soni solishtiriladi; 4) yoz (DB matnni o'zi qayta quradi va sha256 ni tekshiradi) -> tasdiq -> sovut (DB yana tekshiradi, keyin NULL).
 * Har qanday nomuvofiqlikda xato tashlanadi, bazada yuklama TEGILMAGAN qoladi. Takror chaqiriq xavfsiz (idempotent).
 */
export async function sovutMuhrBlok(db: Db, r2: R2, obyektId: string | number, opt: { kun?: number; limit?: number; dryRun?: boolean; log?: Log } = {}): Promise<MuhrSovutNatija> {
  const log = opt.log ?? (() => undefined);
  const o = (await db.query('select idlar, qator_soni, bayt, matn from public.t2_qator_muhr_sovuq_oqi_v1($1, $2, $3)', [obyektId, opt.kun ?? 2, opt.limit ?? 3000])).rows[0];
  if (!o || o.matn == null) return { holat: 'allaqachon', qator_soni: 0, bayt_bosh: 0, r2_bayt: 0 };
  const idlar = idlarMatn(o.idlar);
  const matn = String(o.matn);
  const soni = Number(o.qator_soni);
  const sha = await sha256Hex(matn);
  const kalit = muhrKalit(sha);
  const bytes = gz(matn);
  if (opt.dryRun) return { holat: 'dry-run', qator_soni: soni, bayt_bosh: Number(o.bayt), r2_bayt: bytes.length };

  await r2.put(kalit, bytes);
  const qaytdi = await r2.get(kalit);
  if (!qaytdi) throw new Error(`R2_QAYTA_OQILMADI obyekt=${obyektId}`);
  let qaytMatn: string;
  try { qaytMatn = gunzipMatn(qaytdi); } catch { throw new Error(`R2_GUNZIP_XATO obyekt=${obyektId}`); }
  if ((await sha256Hex(qaytMatn)) !== sha) throw new Error(`R2_SHA256_MOS_EMAS obyekt=${obyektId}`);
  let n: number;
  try { n = (JSON.parse(qaytMatn) as unknown[]).length; } catch { throw new Error(`R2_JSON_XATO obyekt=${obyektId}`); }
  if (n !== soni || n !== idlar.length) throw new Error(`R2_QATOR_SONI_MOS_EMAS obyekt=${obyektId}`);

  const id = String((await db.query('select public.t2_qator_muhr_sovuq_yoz_v1($1, $2::bigint[], $3, $4, $5) as id', [obyektId, idlar, sha, kalit, bytes.length])).rows[0]?.id);
  await db.query('select public.t2_qator_muhr_sovuq_tasdiq_v1($1, $2)', [id, sha]);
  const bosh = Number((await db.query('select public.t2_qator_muhr_sovuq_sovut_v1($1, $2) as b', [id, sha])).rows[0]?.b ?? 0);
  log(`muhr sovutildi obyekt=${obyektId} ${soni} qator ${bosh}B -> R2 ${bytes.length}B`);
  return { holat: bosh > 0 ? 'sovutildi' : 'allaqachon', qator_soni: soni, bayt_bosh: bosh, r2_bayt: bytes.length, sovuq_id: id };
}

/* ───────── Isitish (tikla): readerlar uchun shaffof yo'l ───────── */

export type IsitBlok = { sovuq_id: string; r2_key: string; r2_sha256: string; idlar: string[] };
/** Ikki xil bazaga kirish yo'li (cron: SQL; Pages Function: PostgREST RPC) uchun umumiy interfeys. */
export type MuhrAloqa = {
  nomzod(obyektId: string | number | null, limit: number): Promise<IsitBlok[]>;
  isit(sovuqId: string, matn: string, sha256: string, idlar: string[] | null): Promise<number>;
};

export function dbAloqa(db: Db): MuhrAloqa {
  return {
    async nomzod(obyektId, limit) {
      const rows = (await db.query('select sovuq_id, r2_key, r2_sha256, idlar from public.t2_qator_muhr_isit_nomzod_v1($1::bigint, $2)', [obyektId, limit])).rows;
      return rows.map((r) => ({ sovuq_id: String(r.sovuq_id), r2_key: String(r.r2_key), r2_sha256: String(r.r2_sha256), idlar: idlarMatn(r.idlar) }));
    },
    async isit(sovuqId, matn, sha, idlar) {
      return Number((await db.query('select public.t2_qator_muhr_isit_v1($1, $2, $3, $4::bigint[]) as n', [sovuqId, matn, sha, idlar && idlar.length ? idlar : null])).rows[0]?.n ?? 0);
    },
  };
}

/** Bitta blokni R2 dan o'qib (sha256 tekshiruvi bilan) kerakli qatorlarni bazaga qaytaradi. R2 buzilgan/yo'q bo'lsa — xato, DB tegilmaydi. */
export async function isitBlok(aloqa: MuhrAloqa, r2: R2Oqish, b: IsitBlok): Promise<number> {
  const bytes = await r2.get(b.r2_key);
  if (!bytes) throw new Error(`R2_OBYEKT_YOQ ${b.r2_key}`);
  let matn: string;
  try { matn = gunzipMatn(bytes); } catch { throw new Error(`R2_GUNZIP_XATO ${b.r2_key}`); }
  if ((await sha256Hex(matn)) !== b.r2_sha256) throw new Error(`R2_SHA256_MOS_EMAS ${b.r2_key}`);
  return aloqa.isit(b.sovuq_id, matn, b.r2_sha256, b.idlar);
}

export type IsitNatija = { blok: number; qator: number; xato: number };

/** Obyektdagi (yoki obyekt berilmasa — hamma) o'zgargan/o'chirilgan sovuq qatorlarni isitadi. Xato bitta blokni to'xtatadi, qolganlarini emas. */
export async function isitObyekt(aloqa: MuhrAloqa, r2: R2Oqish, obyektId: string | number | null, opt: { limit?: number; log?: Log } = {}): Promise<IsitNatija> {
  const n: IsitNatija = { blok: 0, qator: 0, xato: 0 };
  for (const b of await aloqa.nomzod(obyektId, opt.limit ?? 20)) {
    try { n.qator += await isitBlok(aloqa, r2, b); n.blok++; }
    catch (e) { n.xato++; opt.log?.(`muhr isitish XATO blok=${b.sovuq_id}: ${e instanceof Error ? e.message : String(e)} (bazada tegilmagan)`); }
  }
  return n;
}

/** ROLLBACK oldidan: barcha sovuq qatorlarni qaytaradi (bo'sh idlar -> blokdagi hammasi). Ko'p marta chaqirish xavfsiz. */
export async function isitBarchasi(db: Db, r2: R2Oqish, opt: { log?: Log } = {}): Promise<IsitNatija> {
  const aloqa = dbAloqa(db);
  const n: IsitNatija = { blok: 0, qator: 0, xato: 0 };
  const bloklar = (await db.query('select e.id as sovuq_id, e.r2_key, e.r2_sha256 from public.t2_qator_muhr_sovuq e where exists (select 1 from public.t2_qator_muhr m where m.sovuq_id = e.id) order by e.id')).rows;
  for (const r of bloklar) {
    try { n.qator += await isitBlok(aloqa, r2, { sovuq_id: String(r.sovuq_id), r2_key: String(r.r2_key), r2_sha256: String(r.r2_sha256), idlar: [] }); n.blok++; }
    catch (e) { n.xato++; opt.log?.(`muhr isitish XATO blok=${String(r.sovuq_id)}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return n;
}
