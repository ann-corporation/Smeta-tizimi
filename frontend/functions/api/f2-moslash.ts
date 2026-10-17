/**
 * f2-moslash.ts — T2-GAS-EXIT-001: F2 file read + auto-match, off GAS.
 * NOT REVIEWED, NOT WIRED into any UI hook yet (no `useF2*` hook or page
 * calls this route). Adding this file is enough for Cloudflare Pages to
 * auto-route `POST /api/f2-moslash` on the NEXT deploy that includes it
 * (Pages Functions route by file path) — review auth/authorization here
 * before that deploy, same as any other endpoint.
 *
 *   POST /api/f2-moslash  { amal: 'fayl_oqi', fileBase64, varaqNom?, colConfig? }
 *     -> mirrors `apiF2FaylOqi`'s own dual-mode return: no colConfig yet ->
 *        { mode:'config', cols, preview, hasMarker, ... } for a column-
 *        mapping confirmation UI; colConfig given -> { tree }.
 *   POST /api/f2-moslash  { amal: 'moslash', aktTree, lrvTree, opts? }
 *     -> runs the ported deterministic matcher, same shape `apiF2AvtoMoslash` returns.
 *
 * Both actions run entirely on Cloudflare/pure-TS — no Drive, no Sheets, no
 * GAS execution — using `frontend/src/lib/f2-import-parse` (file read + tree
 * build) and `frontend/src/lib/f2-match-engine` (matcher).
 *
 * What this does NOT solve yet (see `ops/handoff/T2_GAS_EXIT_001.md` §Remaining):
 *   - `lrvTree` (the smeta/LRV side of a match) still arrives as request-body
 *     JSON, built by whatever the caller already has (today: GAS's
 *     `apiHolatOl`). Sourcing it from a canonical Supabase read model instead
 *     is separate, undesigned work — reading the SMETA side off GAS was never
 *     the owner's stated P0 (the F2 act file + matcher execution was); this
 *     endpoint accepts it as an opaque input either way.
 *   - No job/draft persistence — a request is still one synchronous call.
 *     The resumable job model (owner requirement §5) is drafted
 *     (`supabase/migrations/20260914120000_t2_f2_import_job_v1.*`) but NOT
 *     applied or wired in; this endpoint enforces conservative size ceilings
 *     below instead and is only safe at small/medium scale until the job
 *     model lands.
 *   - No R2 persistence of the uploaded file — it is read in memory and
 *     discarded; canonical file storage (FILE-TRUTH-001's
 *     `Browser -> Cloudflare -> R2` path) is a separate concern from parsing it.
 *
 * Do not add a `useF2*` hook calling this route, and do not remove any
 * existing GAS-backed F2 path, until the remaining scope above is designed
 * and reviewed — this file is evidence the ported logic works end-to-end
 * behind Cloudflare, not a cutover.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { f2MatchEngine } from '../../src/lib/f2-match-engine';
import type { AktNode, F2MatchOptions, LrvNode } from '../../src/lib/f2-match-engine';
import { f2FaylOqiCore, readXlsx } from '../../src/lib/f2-import-parse';
import type { F2ColumnConfig } from '../../src/lib/f2-import-parse';
import { tekshir } from '../_shared/auth';

type Env = { SESSIYA_KALIT: string };

// Placeholder ceilings, NOT measured against real 50k-row files — conservative
// until the job model (§5) lands and real capacity/perf data exists. Reject
// loudly rather than let a Worker run out of memory/CPU silently.
const MAX_FILE_BYTES = 15 * 1024 * 1024; // ~15MB decoded workbook
const MAX_LRV_LEAVES = 20_000;

interface FaylOqiBody {
  amal: 'fayl_oqi';
  fileBase64: string;
  varaqNom?: string;
  colConfig?: Partial<F2ColumnConfig>;
}
interface MoslashBody {
  amal: 'moslash';
  aktTree: AktNode[];
  lrvTree: LrvNode[];
  opts?: F2MatchOptions;
}
type F2MoslashBody = FaylOqiBody | MoslashBody;

function countLeaves(nodes: LrvNode[] | undefined): number {
  let n = 0;
  (nodes || []).forEach((node) => {
    if (node.type !== 'rz') n++;
    n += countLeaves(node.children);
  });
  return n;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]+,/, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function handleFaylOqi(body: FaylOqiBody) {
  if (!body.fileBase64) return Response.json({ ok: false, code: 'MISSING_FILE' }, { status: 400 });

  let bytes: Uint8Array;
  try { bytes = base64ToBytes(body.fileBase64); }
  catch { return Response.json({ ok: false, code: 'BAD_BASE64' }, { status: 400 }); }

  if (bytes.byteLength > MAX_FILE_BYTES) {
    return Response.json({
      ok: false, code: 'FILE_TOO_LARGE',
      xabar: `Fayl ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB (limit ${MAX_FILE_BYTES / 1024 / 1024}MB) — hozircha katta fayllar uchun resumable job modeli yo'q (ops/handoff/T2_GAS_EXIT_001.md §5).`,
    }, { status: 422 });
  }

  let workbook;
  try { workbook = await readXlsx(bytes); }
  catch {
    return Response.json({ ok: false, code: 'FILE_READ_ERROR', xabar: 'XLSX faylni o‘qib bo‘lmadi. Faylni tekshirib qayta urinib ko‘ring.' }, { status: 422 });
  }

  const sheet = body.varaqNom
    ? workbook.sheet(body.varaqNom)
    : workbook.sheets.find((s) => s.rows.length > 1) ?? workbook.sheets[0] ?? null;
  if (!sheet) return Response.json({ ok: false, code: 'SHEET_NOT_FOUND' }, { status: 404 });

  const result = f2FaylOqiCore(sheet.rows, body.colConfig);
  return Response.json({ sheetName: sheet.name, sheetNames: workbook.sheets.map((s) => s.name), ...result });
}

export function handleMoslash(body: MoslashBody) {
  if (!body.aktTree || !body.lrvTree) return Response.json({ ok: false, code: 'MISSING_TREE' }, { status: 400 });

  const leaves = countLeaves(body.lrvTree);
  if (leaves > MAX_LRV_LEAVES) {
    return Response.json({
      ok: false, code: 'TOO_LARGE_FOR_SYNCHRONOUS_PATH',
      xabar: `LRV daraxtida ${leaves} qator (limit ${MAX_LRV_LEAVES}) — bu ko'lamda ishlash uchun hali resumable job modeli yo'q (ops/handoff/T2_GAS_EXIT_001.md §5).`,
    }, { status: 422 });
  }

  const t0 = Date.now();
  const result = f2MatchEngine(body.aktTree, body.lrvTree, body.opts);
  return Response.json({ ok: true, ...result, ms: Date.now() - t0 });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.SESSIYA_KALIT) {
    return Response.json({ ok: false, code: 'CONFIG' }, { status: 500 });
  }
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  const actorId = sess && (sess as unknown as { foydalanuvchi_id?: unknown }).foydalanuvchi_id;
  if (actorId == null) {
    return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  }
  // Membership/tenant scoping note: this endpoint takes no obyekt/kompaniya_id
  // today because it does no Supabase read/write of its own (pure computation
  // over caller-supplied data) — session auth alone is the correct bar here,
  // same as any stateless compute endpoint. If a future revision adds reading
  // `lrvTree` from Supabase instead of the request body, tenant membership
  // MUST be checked then (`t2_actor_kompaniya_azo_tekshir`), same as every
  // other canonical endpoint.

  let body: F2MoslashBody;
  try { body = await ctx.request.json(); }
  catch { return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 }); }

  if (body.amal === 'fayl_oqi') return handleFaylOqi(body);
  if (body.amal === 'moslash') return handleMoslash(body);
  return Response.json({ ok: false, code: 'BAD_AMAL' }, { status: 400 });
};
