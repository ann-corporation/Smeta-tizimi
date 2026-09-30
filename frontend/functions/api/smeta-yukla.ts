/**
 * smeta-yukla.ts — T2-FINAL-CLEAN-CUTOVER P0.2: native Smeta XLSX upload,
 * off Google Drive/Sheets/GAS entirely.
 *
 * Reuses the exact same file-reading + tree-building code already proven for
 * F2 acts (`f2-import-parse`'s `readXlsx`/`f2FaylOqiCore` — F2 act files and
 * smeta files share the same rz/bl/rs/mat/ob template) via `handleFaylOqi`
 * from `f2-moslash.ts`, so parsing behavior (column auto-detect, marker
 * column, totals-row skipping, etc.) stays byte-for-byte identical between
 * the F2 and Smeta upload paths — one parser, two callers.
 *
 * POST /api/smeta-yukla  { amal: 'fayl_oqi', fileBase64, varaqNom?, colConfig? }
 *   -> delegates to handleFaylOqi (same dual-mode contract as /api/f2-moslash):
 *      no colConfig -> { mode:'config', cols, preview, hasMarker, ... };
 *      colConfig given -> { tree }.
 * POST /api/smeta-yukla  { amal: 'import', kompaniyaId, obyektId, operationId, sourceDocumentId?, tree }
 *   -> flattens the AktNode tree to local_id/parent_local_id rows and calls
 *      t2_smeta_import_bulk_v1 (service role) to write canonical
 *      RZ/BL/RS/resources into Supabase. Refuses (SMETA_ALREADY_EXISTS) if
 *      the object already has any t2_qator rows — this is a first-import-only
 *      path, never a silent replace (see the RPC's own migration comment).
 */
import type { AktNode } from '../../src/lib/f2-match-engine';
import { handleFaylOqi } from './f2-moslash';
import type { F2ColumnConfig } from '../../src/lib/f2-import-parse';
import { smetaDaraxtniYoy, type SmetaFlatQator } from '../../src/lib/smeta-flatten';
import type { SmetaPaketFlatQator, SmetaPaketManbaReja } from '../../src/lib/smeta-package-import';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

const MAX_ROWS = 60000;
/** Bitta bo'lakdagi eng ko'p qator -- `t2_smeta_import_bolak_v1` ning
 *  o'z chegarasi bilan bir xil (undan katta bo'lak BAD_CHUNK_SIZE beradi). */
const MAX_BOLAK_ROWS = 10000;

interface FaylOqiBody {
  amal: 'fayl_oqi';
  fileBase64: string;
  varaqNom?: string;
  colConfig?: Partial<F2ColumnConfig>;
}
interface ImportBody {
  amal: 'import';
  kompaniyaId: number;
  obyektId: number;
  operationId: string;
  sourceDocumentId?: number | null;
  tree: AktNode[];
}
/* ── Bo'lakli import (T2-SMETA-IMPORT-50K-003) ────────────────────────
 * 50 000 qatorli smeta bitta so'rovga sig'maydi: ~10 MB JSON ni Pages
 * Function izolyatida (128 MB xotira) parse qilib, yoyib, qayta
 * stringify qilish xavfli. Shuning uchun klient qatorlarni O'ZI yoyadi
 * va bo'laklab yuboradi; bu yerda har bo'lak to'g'ridan-to'g'ri
 * tegishli RPC ga uzatiladi (Function hech qachon butun smetani
 * xotirada ushlab turmaydi). */
interface ImportBoshlaBody {
  amal: 'import_boshla';
  kompaniyaId: number;
  obyektId: number;
  operationId: string;
  sourceDocumentId?: number | null;
}
interface ImportBolakBody {
  amal: 'import_bolak';
  kompaniyaId: number;
  sessiyaId: number;
  bolak: number;
  qatorlar: SmetaFlatQator[];
}
interface ImportYakunlaBody {
  amal: 'import_yakunla';
  kompaniyaId: number;
  sessiyaId: number;
}
/** T2-PTO-SMETA-PAKET-IMPORT-001: ko‘p mustaqil LRV/RES manbali obyekt
 * uchun alohida sessiya. V1 bitta-fayl yo‘li saqlanadi; bu yo‘l faqat
 * boshlang‘ich paket importida ishlaydi va qatorni o‘z manbasidan ayirmaydi. */
interface PaketImportBoshlaBody {
  amal: 'paket_import_boshla';
  kompaniyaId: number;
  obyektId: number;
  operationId: string;
  paketKalit: string;
  paketNom: string;
  manbalar: SmetaPaketManbaReja[];
}
interface PaketImportBolakBody {
  amal: 'paket_import_bolak';
  kompaniyaId: number;
  sessiyaId: number;
  bolak: number;
  qatorlar: SmetaPaketFlatQator[];
}
interface PaketImportYakunlaBody {
  amal: 'paket_import_yakunla';
  kompaniyaId: number;
  sessiyaId: number;
}
/* T2-SMETA-RETRY-CLEAR-001: xato/eskirgan importdan keyin obyektni
 * o'chirib-qayta-yaratmasdan, faqat uning smeta qatorlarini tozalab,
 * darhol qayta import qilish imkonini beradi (t2_smeta_tozalash_v1). */
interface SmetaTozalaBody {
  amal: 'smeta_tozala';
  kompaniyaId: number;
  obyektId: number;
  operationId: string;
}
type SmetaYuklaBody = FaylOqiBody | ImportBody | ImportBoshlaBody | ImportBolakBody | ImportYakunlaBody
  | PaketImportBoshlaBody | PaketImportBolakBody | PaketImportYakunlaBody | SmetaTozalaBody;

type FlatRow = SmetaFlatQator;

async function rpc(env: Env, name: string, args: Record<string, unknown>) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* keep raw */ }
  return { httpOk: r.ok, body: j, raw: text };
}

function importRpcFailure(code = 'IMPORT_RPC_FAILED', status = 502, detail?: string) {
  return Response.json({
    ok: false,
    code,
    xato: 'Kanonik smeta importi bajarilmadi. Birozdan so‘ng qayta urinib ko‘ring.'
      + (detail ? ' (' + detail + ')' : ''),
  }, { status });
}

async function handleImport(env: Env, actorId: number, body: ImportBody) {
  if (!body.kompaniyaId || !body.obyektId || !body.operationId) {
    return Response.json({ ok: false, code: 'MISSING_CONTEXT' }, { status: 400 });
  }
  if (!Array.isArray(body.tree) || body.tree.length === 0) {
    return Response.json({ ok: false, code: 'MISSING_TREE' }, { status: 400 });
  }

  const rows: FlatRow[] = smetaDaraxtniYoy(body.tree, null, []);
  if (rows.length > MAX_ROWS) {
    return Response.json({ ok: false, code: 'TOO_MANY_ROWS', xabar: `${rows.length} qator (limit ${MAX_ROWS})` }, { status: 422 });
  }

  try {
    const guard = await importManbaGuard(env, body.kompaniyaId, actorId, body.obyektId,
      body.sourceDocumentId == null ? [] : [body.sourceDocumentId]);
    if (!guard.ok) return guard.response;
  } catch (err) {
    console.error('[smeta-yukla] source guard unreachable:', err);
    return importRpcFailure('IMPORT_GUARD_UNREACHABLE', 503);
  }

  let res: Awaited<ReturnType<typeof rpc>>;
  try {
    res = await rpc(env, 't2_smeta_import_bulk_v1', {
      p_kompaniya_id: body.kompaniyaId, p_actor_id: actorId, p_obyekt_id: body.obyektId,
      p_operation_id: body.operationId, p_source_document_id: body.sourceDocumentId ?? null,
      p_qatorlar: rows,
    });
  } catch (err) {
    console.error('[smeta-yukla] import RPC unreachable:', err);
    return importRpcFailure('IMPORT_RPC_UNREACHABLE');
  }
  if (!res.httpOk || !res.body) {
    // ⚠️ 2026-09-07: bu shoxcha AVVAL sabab HAQIQATDA nima ekanini butunlay
    // yashirardi -- na foydalanuvchi, na keyinchalik tekshiruvchi (men)
    // buni ko'ra olardi (aynan shu tufayli t2_qator.manba_id/t2_manba FK
    // xatosi haqiqiy foydalanuvchi hujjat yuklaguncha topilmagan edi).
    // Endi: server logiga TO'LIQ xom javob, mijozga esa qisqa Postgres
    // kodi (masalan "23503") -- ichki sxema tafsilotlarisiz, lekin
    // qo'llab-quvvatlashga xabar berish uchun yetarli.
    console.error('[smeta-yukla] import RPC failed:', res.raw.slice(0, 2000));
    const kod = res.body && typeof res.body.code === 'string' ? res.body.code : undefined;
    return importRpcFailure('IMPORT_RPC_FAILED', 502, kod);
  }
  return Response.json(res.body, { status: res.body.ok ? 200 : 409 });
}

/** Bo'lakli oqimning har uch qadami bir xil shaklda: RPC ni chaqir, xom
 *  javobni serverga logla, mijozga esa qisqa kod bilan javob ber. */
async function bolakliRpc(env: Env, nom: string, args: Record<string, unknown>) {
  let res: Awaited<ReturnType<typeof rpc>>;
  try {
    res = await rpc(env, nom, args);
  } catch (err) {
    console.error('[smeta-yukla] ' + nom + ' unreachable:', err);
    return importRpcFailure('IMPORT_RPC_UNREACHABLE');
  }
  if (!res.httpOk || !res.body) {
    console.error('[smeta-yukla] ' + nom + ' failed:', res.raw.slice(0, 2000));
    const kod = res.body && typeof res.body.code === 'string' ? res.body.code : undefined;
    return importRpcFailure('IMPORT_RPC_FAILED', 502, kod);
  }
  return Response.json(res.body, { status: res.body.ok ? 200 : 409 });
}

/**
 * Import boshlanishidan oldingi source/object guard.
 * Yakunlovchi import RPC'lar ham obyektni advisory lock bilan tekshiradi;
 * preflight o'tib ketgan parallel chaqiriq ham ikkinchi smetani yarata olmaydi.
 */
async function importManbaGuard(
  env: Env,
  kompaniyaId: number,
  actorId: number,
  obyektId: number,
  sourceDocumentIds: number[],
) {
  const res = await rpc(env, 't2_smeta_import_source_guard_v1', {
    p_kompaniya_id: kompaniyaId,
    p_actor_id: actorId,
    p_obyekt_id: obyektId,
    p_source_document_ids: sourceDocumentIds.length ? sourceDocumentIds : null,
  });
  if (!res.httpOk || !res.body) {
    console.error('[smeta-yukla] source guard failed:', res.raw.slice(0, 2000));
    return { ok: false as const, response: importRpcFailure('IMPORT_GUARD_UNAVAILABLE', 503) };
  }
  if (res.body.ok !== true) {
    return { ok: false as const, response: Response.json(res.body, { status: 409 }) };
  }
  return { ok: true as const };
}

async function handleImportBoshla(env: Env, actorId: number, body: ImportBoshlaBody) {
  if (!body.kompaniyaId || !body.obyektId || !body.operationId) {
    return Response.json({ ok: false, code: 'MISSING_CONTEXT' }, { status: 400 });
  }
  try {
    const guard = await importManbaGuard(env, body.kompaniyaId, actorId, body.obyektId,
      body.sourceDocumentId == null ? [] : [body.sourceDocumentId]);
    if (!guard.ok) return guard.response;
  } catch (err) {
    console.error('[smeta-yukla] source guard unreachable:', err);
    return importRpcFailure('IMPORT_GUARD_UNREACHABLE', 503);
  }
  return bolakliRpc(env, 't2_smeta_import_boshla_v1', {
    p_kompaniya_id: body.kompaniyaId, p_actor_id: actorId, p_obyekt_id: body.obyektId,
    p_operation_id: body.operationId, p_source_document_id: body.sourceDocumentId ?? null,
  });
}

async function handleImportBolak(env: Env, actorId: number, body: ImportBolakBody) {
  if (!body.kompaniyaId || !body.sessiyaId || !Number.isInteger(body.bolak) || body.bolak < 0) {
    return Response.json({ ok: false, code: 'MISSING_CONTEXT' }, { status: 400 });
  }
  if (!Array.isArray(body.qatorlar) || body.qatorlar.length === 0) {
    return Response.json({ ok: false, code: 'MISSING_ROWS' }, { status: 400 });
  }
  if (body.qatorlar.length > MAX_BOLAK_ROWS) {
    return Response.json({ ok: false, code: 'BAD_CHUNK_SIZE',
      xabar: `${body.qatorlar.length} qator (bo‘lak chegarasi ${MAX_BOLAK_ROWS})` }, { status: 422 });
  }
  return bolakliRpc(env, 't2_smeta_import_bolak_v1', {
    p_kompaniya_id: body.kompaniyaId, p_actor_id: actorId, p_sessiya_id: body.sessiyaId,
    p_bolak: body.bolak, p_qatorlar: body.qatorlar,
  });
}

async function handleImportYakunla(env: Env, actorId: number, body: ImportYakunlaBody) {
  if (!body.kompaniyaId || !body.sessiyaId) {
    return Response.json({ ok: false, code: 'MISSING_CONTEXT' }, { status: 400 });
  }
  return bolakliRpc(env, 't2_smeta_import_yakunla_v1', {
    p_kompaniya_id: body.kompaniyaId, p_actor_id: actorId, p_sessiya_id: body.sessiyaId,
  });
}

async function handlePaketImportBoshla(env: Env, actorId: number, body: PaketImportBoshlaBody) {
  if (!body.kompaniyaId || !body.obyektId || !body.operationId || !body.paketKalit || !body.paketNom || !Array.isArray(body.manbalar)) {
    return Response.json({ ok: false, code: 'MISSING_CONTEXT' }, { status: 400 });
  }
  const sourceDocumentIds = body.manbalar
    .map((m) => m.lrvDocumentId)
    .filter((id): id is number => Number.isSafeInteger(id) && id > 0);
  if (sourceDocumentIds.length !== body.manbalar.length) {
    return Response.json({ ok: false, code: 'PACKAGE_SOURCE_INVALID' }, { status: 400 });
  }
  try {
    const guard = await importManbaGuard(env, body.kompaniyaId, actorId, body.obyektId, sourceDocumentIds);
    if (!guard.ok) return guard.response;
  } catch (err) {
    console.error('[smeta-yukla] package source guard unreachable:', err);
    return importRpcFailure('IMPORT_GUARD_UNREACHABLE', 503);
  }
  return bolakliRpc(env, 't2_smeta_paket_import_boshla_v1', {
    p_kompaniya_id: body.kompaniyaId, p_actor_id: actorId, p_obyekt_id: body.obyektId,
    p_operation_id: body.operationId, p_paket_kalit: body.paketKalit, p_paket_nom: body.paketNom,
    p_manbalar: body.manbalar.map((m) => ({
      kalit: m.key, nom: m.nom, lrv_document_id: m.lrvDocumentId, res_document_ids: m.resDocumentIds,
    })),
  });
}

async function handlePaketImportBolak(env: Env, actorId: number, body: PaketImportBolakBody) {
  if (!body.kompaniyaId || !body.sessiyaId || !Number.isInteger(body.bolak) || body.bolak < 0) {
    return Response.json({ ok: false, code: 'MISSING_CONTEXT' }, { status: 400 });
  }
  if (!Array.isArray(body.qatorlar) || body.qatorlar.length === 0) return Response.json({ ok: false, code: 'MISSING_ROWS' }, { status: 400 });
  if (body.qatorlar.length > MAX_BOLAK_ROWS) return Response.json({ ok: false, code: 'BAD_CHUNK_SIZE' }, { status: 422 });
  return bolakliRpc(env, 't2_smeta_paket_import_bolak_v1', {
    p_kompaniya_id: body.kompaniyaId, p_actor_id: actorId, p_sessiya_id: body.sessiyaId,
    p_bolak: body.bolak, p_qatorlar: body.qatorlar,
  });
}

async function handlePaketImportYakunla(env: Env, actorId: number, body: PaketImportYakunlaBody) {
  if (!body.kompaniyaId || !body.sessiyaId) return Response.json({ ok: false, code: 'MISSING_CONTEXT' }, { status: 400 });
  return bolakliRpc(env, 't2_smeta_paket_import_yakunla_v1', {
    p_kompaniya_id: body.kompaniyaId, p_actor_id: actorId, p_sessiya_id: body.sessiyaId,
  });
}

async function handleSmetaTozala(env: Env, actorId: number, body: SmetaTozalaBody) {
  if (!body.kompaniyaId || !body.obyektId || !body.operationId) {
    return Response.json({ ok: false, code: 'MISSING_CONTEXT' }, { status: 400 });
  }
  return bolakliRpc(env, 't2_smeta_tozalash_v1', {
    p_kompaniya_id: body.kompaniyaId, p_actor_id: actorId, p_obyekt_id: body.obyektId,
    p_operation_id: body.operationId,
  });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY || !ctx.env.SESSIYA_KALIT) {
    return Response.json({ ok: false, code: 'CONFIG' }, { status: 500 });
  }
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actorId = sess && (sess as any).foydalanuvchi_id;
  if (actorId == null) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });

  let body: SmetaYuklaBody;
  try { body = await ctx.request.json(); }
  catch { return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 }); }

  if (body.amal === 'fayl_oqi') return handleFaylOqi(body);
  // Tenant membership/role for every import path is enforced inside the RPCs
  // themselves (t2_actor_kompaniya_azo_tekshir + write-role check) — same law
  // as every other canonical write RPC called from a Function via service role.
  if (body.amal === 'import') return handleImport(ctx.env, actorId, body);
  if (body.amal === 'import_boshla') return handleImportBoshla(ctx.env, actorId, body);
  if (body.amal === 'import_bolak') return handleImportBolak(ctx.env, actorId, body);
  if (body.amal === 'import_yakunla') return handleImportYakunla(ctx.env, actorId, body);
  if (body.amal === 'paket_import_boshla') return handlePaketImportBoshla(ctx.env, actorId, body);
  if (body.amal === 'paket_import_bolak') return handlePaketImportBolak(ctx.env, actorId, body);
  if (body.amal === 'paket_import_yakunla') return handlePaketImportYakunla(ctx.env, actorId, body);
  if (body.amal === 'smeta_tozala') return handleSmetaTozala(ctx.env, actorId, body);
  return Response.json({ ok: false, code: 'BAD_AMAL' }, { status: 400 });
};
