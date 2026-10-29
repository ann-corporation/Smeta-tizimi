import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  T2_BRIDGE_SHARED_SECRET?: string;
  T2_BRIDGE_ACTOR_ID?: string;
};

type JsonObject = Record<string, unknown>;

/**
 * Sheets uchun biznes qiymatlarining bitta, tartibli proyeksiya shartnomasi.
 * Texnik identity/version alohida yashirin ustunlarda qaytadi; qator raqami
 * hech qachon identity emas.
 */
export const PROJECTION_FIELDS = [
  'tur', 'kod', 'nom', 'birlik', 'kat',
  'smeta_hajm', 'smeta_narx', 'smeta_summa',
  'fakt_hajm', 'fakt_summa', 'f2_hajm', 'f2_summa',
  'qoldiq_hajm', 'qoldiq_summa', 'f2_mumkin_hajm', 'f2_mumkin_summa',
  'f2_narx', 'fakt_narx', 'f2_narx_farq_foiz',
] as const;

export const PROJECTION_HEADERS = [...PROJECTION_FIELDS];

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

/** Erta qaytmasdan barcha belgilarni solishtiradigan secret taqqoslash. */
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** Bo‘sh katakni 0 ga aylantirmaydi: noma’lum qiymat null sifatida rad etiladi. */
export function parseFiniteBridgeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(',', '.');
  if (!text || !numeric.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

export type FaktWriteValidation =
  | { ok: true; qatorId: number; expected: number; next: number; baseVersion: number; operationId: string }
  | { ok: false; code: string };

export function validateFaktWritePayload(payload: unknown): FaktWriteValidation {
  if (!payload || typeof payload !== 'object') return { ok: false, code: 'FAKT_INPUT_INVALID' };
  const p = payload as JsonObject;
  const qatorId = parseFiniteBridgeNumber(p.qator_id);
  const expected = parseFiniteBridgeNumber(p.base_fakt_hajm);
  const next = parseFiniteBridgeNumber(p.fakt_hajm);
  const baseVersion = parseFiniteBridgeNumber(p.base_entity_version);
  const operationId = String(p.operation_id || '');
  if (!uuid.test(operationId)) return { ok: false, code: 'OPERATION_ID_REQUIRED' };
  if (qatorId == null || !Number.isSafeInteger(qatorId) || qatorId <= 0) {
    return { ok: false, code: 'QATOR_ID_INVALID' };
  }
  if (expected == null || next == null) return { ok: false, code: 'FAKT_VALUE_INVALID' };
  if (baseVersion == null || !Number.isSafeInteger(baseVersion) || baseVersion <= 0) {
    return { ok: false, code: 'ENTITY_VERSION_REQUIRED' };
  }
  return { ok: true, qatorId, expected, next, baseVersion, operationId };
}

/**
 * Hash qator soniga emas, barcha kanonik biznes qiymatlari + qator ID/versioniga
 * bog‘langan. Shu sabab qiymat o‘zgarsa yoki versiya yangilansa echo emas,
 * yangi proyeksiya sifatida ko‘riladi.
 */
export function normalizeProjectionRows(rows: readonly JsonObject[]) {
  return [...rows]
    .sort((a, b) => Number(a.qator_id) - Number(b.qator_id))
    .map((row) => [
      row.qator_id ?? null,
      ...PROJECTION_FIELDS.map((field) => row[field] ?? null),
      row.t2_entity_version ?? row.versiya ?? null,
    ]);
}

export async function projectionHash(rows: readonly JsonObject[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeProjectionRows(rows)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function supabaseHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function jsonResponse(response: Response): Promise<{ parsed: boolean; data: unknown }> {
  try {
    return { parsed: true, data: await response.json() };
  } catch {
    return { parsed: false, data: null };
  }
}

type RpcResult = { httpOk: boolean; status: number; data: unknown };

async function rpc(env: Env, fn: string, body: JsonObject): Promise<RpcResult> {
  const base = supabaseBaseUrl(env.SUPABASE_URL);
  const key = String(env.SUPABASE_KEY || '');
  if (!base || !key) return { httpOk: false, status: 500, data: null };
  const response = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...supabaseHeaders(key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await jsonResponse(response);
  return { httpOk: response.ok && parsed.parsed, status: response.status, data: parsed.data };
}

async function getRows(env: Env, path: string): Promise<{ ok: boolean; status: number; rows: JsonObject[] }> {
  const base = supabaseBaseUrl(env.SUPABASE_URL);
  const key = String(env.SUPABASE_KEY || '');
  if (!base || !key) return { ok: false, status: 500, rows: [] };
  const response = await fetch(`${base}${path}`, { headers: supabaseHeaders(key) });
  const parsed = await jsonResponse(response);
  if (!response.ok || !parsed.parsed || !Array.isArray(parsed.data)) {
    return { ok: false, status: response.status, rows: [] };
  }
  return {
    ok: true,
    status: response.status,
    rows: parsed.data.filter((row): row is JsonObject => !!row && typeof row === 'object'),
  };
}

async function objectForBridge(env: Env, objectId: number) {
  const result = await getRows(env, `/rest/v1/t2_obyekt?id=eq.${objectId}&select=id,kompaniya_id&limit=1`);
  if (!result.ok) return { ok: false as const, code: 'OBJECT_READ_FAILED' };
  const row = result.rows[0];
  const companyId = parseFiniteBridgeNumber(row?.kompaniya_id);
  if (!row || companyId == null || !Number.isSafeInteger(companyId) || companyId <= 0) {
    return { ok: false as const, code: 'OBYEKT_NOT_FOUND' };
  }
  return { ok: true as const, companyId };
}

async function authorizeObject(env: Env, companyId: number, actorId: number) {
  const result = await rpc(env, 't2_actor_kompaniya_azo_tekshir', {
    p_kompaniya_id: companyId,
    p_actor_id: actorId,
  });
  return result.httpOk;
}

async function qatorVersion(env: Env, objectId: number, qatorId: number) {
  const result = await getRows(env, `/rest/v1/t2_qator?id=eq.${qatorId}&obyekt_id=eq.${objectId}&select=id,versiya&limit=1`);
  if (!result.ok) return { ok: false as const, code: 'QATOR_READ_FAILED' };
  const version = parseFiniteBridgeNumber(result.rows[0]?.versiya);
  if (version == null || !Number.isSafeInteger(version) || version <= 0) {
    return { ok: false as const, code: 'QATOR_NOT_FOUND' };
  }
  return { ok: true as const, version };
}

function configReady(env: Env) {
  return Boolean(supabaseBaseUrl(env.SUPABASE_URL) && env.SUPABASE_KEY);
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const secret = String(ctx.env.T2_BRIDGE_SHARED_SECRET || '');
  if (!secret || !equal(String(ctx.request.headers.get('X-T2-Bridge-Secret') || ''), secret)) {
    return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!configReady(ctx.env)) return json({ ok: false, code: 'BRIDGE_CONFIG_REQUIRED' }, { status: 500 });

  const actorId = parseFiniteBridgeNumber(ctx.env.T2_BRIDGE_ACTOR_ID);
  if (actorId == null || !Number.isSafeInteger(actorId) || actorId <= 0) {
    return json({ ok: false, code: 'BRIDGE_ACTOR_CONFIG_REQUIRED' }, { status: 500 });
  }

  try {
    const input = await ctx.request.json<unknown>().catch(() => null);
    if (!input || typeof input !== 'object') return json({ ok: false, code: 'JSON_INVALID' }, { status: 400 });
    const body = input as JsonObject;
    const payload = body.payload;
    if (!payload || typeof payload !== 'object') return json({ ok: false, code: 'PAYLOAD_REQUIRED' }, { status: 400 });
    const payloadObject = payload as JsonObject;
    const objectId = parseFiniteBridgeNumber(payloadObject.obyekt_id);
    if (objectId == null || !Number.isSafeInteger(objectId) || objectId <= 0) {
      return json({ ok: false, code: 'OBYEKT_ID_INVALID' }, { status: 400 });
    }

    const object = await objectForBridge(ctx.env, objectId);
    if (!object.ok) {
      return json({ ok: false, code: object.code }, { status: object.code === 'OBYEKT_NOT_FOUND' ? 404 : 502 });
    }
    if (!(await authorizeObject(ctx.env, object.companyId, actorId))) {
      return json({ ok: false, code: 'BRIDGE_OBJECT_UNAUTHORIZED' }, { status: 403 });
    }

    if (body.action === 'projection.pull') {
      const state = await getRows(ctx.env,
        /* Smeta proyeksiyasi — faqat FAOL versiya (eski qatorlar F2 tarixi uchun bazada qoladi, ko'zguga chiqmaydi). */
        `/rest/v1/t2_qator_holat?obyekt_id=eq.${objectId}&versiya_holat=eq.faol`
        + '&order=qator_id.asc&select=qator_id,tur,kod,nom,birlik,kat,smeta_hajm,smeta_narx,smeta_summa'
        + ',fakt_hajm,fakt_summa,f2_hajm,f2_summa,qoldiq_hajm,qoldiq_summa'
        + ',f2_mumkin_hajm,f2_mumkin_summa,f2_narx,fakt_narx,f2_narx_farq_foiz');
      const versions = await getRows(ctx.env, `/rest/v1/t2_qator?obyekt_id=eq.${objectId}&versiya_holat=eq.faol&select=id,versiya&order=id.asc`);
      if (!state.ok || !versions.ok) return json({ ok: false, code: 'PROJECTION_READ_FAILED' }, { status: 502 });
      const versionById = new Map<number, number>();
      for (const row of versions.rows) {
        const id = parseFiniteBridgeNumber(row.id);
        const version = parseFiniteBridgeNumber(row.versiya);
        if (id != null && version != null) versionById.set(id, version);
      }
      const rows = state.rows.map((row) => {
        const id = parseFiniteBridgeNumber(row.qator_id);
        const version = id == null ? null : versionById.get(id);
        return { ...row, t2_entity_id: id, t2_entity_version: version };
      });
      if (rows.some((row) => row.t2_entity_id == null || row.t2_entity_version == null)) {
        return json({ ok: false, code: 'PROJECTION_VERSION_MISSING' }, { status: 502 });
      }
      const projection_hash = await projectionHash(rows);
      return json({
        ok: true,
        changed: projection_hash !== String(payloadObject.projection_hash || ''),
        projection_hash,
        headers: PROJECTION_HEADERS,
        rows: rows.map((row) => ({ ...row, t2_projection_state: 'ACTIVE' })),
      });
    }

    if (body.action === 'fakt.write') {
      const validated = validateFaktWritePayload(payloadObject);
      if (!validated.ok) return json(validated, { status: 400 });
      const current = await qatorVersion(ctx.env, objectId, validated.qatorId);
      if (!current.ok) return json({ ok: false, code: current.code }, { status: 502 });
      if (current.version !== validated.baseVersion) {
        return json({ ok: false, code: 'ENTITY_VERSION_CONFLICT', current_version: current.version }, { status: 409 });
      }
      const result = await rpc(ctx.env, 't2_fakt_belgila_v2', {
        p_obyekt_id: objectId,
        p_qator_id: validated.qatorId,
        p_expected_fakt_hajm: validated.expected,
        p_yangi_fakt_hajm: validated.next,
        p_sana: new Date().toISOString().slice(0, 10),
        p_actor_id: actorId,
        p_operation_id: validated.operationId,
        p_izoh: 'T2 Google Bridge Fakt',
        p_actor_label: 't2-bridge',
      });
      if (!result.httpOk) return json({ ok: false, code: 'SUPABASE_ERROR' }, { status: 502 });
      return json(result.data);
    }

    return json({ ok: false, code: 'ACTION_NOT_ALLOWED' }, { status: 400 });
  } catch {
    return json({ ok: false, code: 'BRIDGE_INTERNAL_ERROR' }, { status: 500 });
  }
};
