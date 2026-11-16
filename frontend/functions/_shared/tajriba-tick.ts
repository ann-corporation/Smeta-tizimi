/**
 * Nightly job of the experience index (POST /api/tajriba-tick, GitHub Actions .github/workflows/tajriba-tungi.yml).
 *
 * Incremental: a cursor (last object change ingested + last Studio confirmation id) lives in R2 next to the index, so every run only
 * reads what changed in the DB (three READ-ONLY RPCs, supabase/manual/NOT_APPLIED_t2_tajriba_indeks_oqish_v1.sql - designed, not applied):
 *   - changed approved objects  -> their lines (an object is re-ingested as a whole: edits replace the old contribution)
 *   - Studio confirmations      -> existing table t2_smeta_tanlov_tajriba (no new table): compacted into the company's studio stream
 * Per company the private STATE (contribution keys) is kept at <prefix>c/<id>/holat.json.gz; the served layers are derived from it:
 *   company layer (everything the company produced)  and  global layer (k-anonymity: >= 3 objects or >= 2 companies per code).
 * Shards are written first, the manifest LAST (readers verify every shard against it); unchanged shards are not rewritten.
 * The R2 output holds wordings, codes, counts and hashed section words only - no price, name, object or company identity.
 */
import {
  holatBosh, holatStat, holatlarniBirlashtir, kompaktla, normaKodi, obyektQosh, studioQosh, KANON,
  type Holat, type TajribaQator,
} from '../../src/lib/smeta-ai/tajriba-indeks';
import { uzRuOrgan } from '../../src/lib/smeta-ai/tajriba-uzru';
import { gzJson, jsonGz, manifestOqi, paketla, TAJRIBA_PREFIX, type Kursor, type Paket } from '../../src/lib/smeta-ai/tajriba-paket';

export type TajribaDeps = {
  rpc(nom: string, args: Record<string, unknown>): Promise<any>;
  r2: { get(k: string): Promise<Uint8Array | null>; put(k: string, bayt: Uint8Array): Promise<void> };
};
type State = { v: 1; kursor: Kursor; kompaniyalar: number[]; /** ingested, served layers not rebuilt yet */ iflos?: boolean };
const BOSH_KURSOR: Kursor = { obyektVaqt: null, tanlovId: 0 };
const OBYEKT_PARTIYA = 5;
const TANLOV_PARTIYA = 500;
export const OYNA_BOSH_SOAT = 21; // UTC, like arxiv-tungi
export const oynadaMi = (d: Date) => d.getUTCHours() >= OYNA_BOSH_SOAT;

type RpcQator = { kod?: unknown; nom?: unknown; birlik?: unknown; bolim?: unknown };
/** RPC rows (ordered by position) -> index lines; the neighbours of a line are the codes of the lines around it. */
export function qatorlarga(rows: unknown): TajribaQator[] {
  const list = (Array.isArray(rows) ? rows : []) as RpcQator[];
  const ok = list.filter(r => typeof r.kod === 'string' && typeof r.nom === 'string');
  return ok.map((r, i): TajribaQator => ({
    kod: String(r.kod), nom: String(r.nom), birlik: typeof r.birlik === 'string' ? r.birlik : null,
    bolim: Array.isArray(r.bolim) ? r.bolim.filter((x): x is string => typeof x === 'string') : [],
    qoshni: [ok[i - 2]?.kod, ok[i - 1]?.kod, ok[i + 1]?.kod, ok[i + 2]?.kod].filter((x): x is string => typeof x === 'string' && !!normaKodi(x)),
  }));
}

async function oqiJson<T>(d: TajribaDeps, k: string): Promise<T | null> {
  const b = await d.r2.get(k);
  if (!b) return null;
  try { return gzJson<T>(b); } catch { return null; }
}

async function qatlamYoz(d: TajribaDeps, prefix: string, p: Paket): Promise<number> {
  const eski = manifestOqi((await d.r2.get(prefix + 'manifest.json.gz')) ?? new Uint8Array());
  const eskiSha = new Map<string, string>([...(eski?.shardlar ?? []).map(s => [s.k, s.sha256] as const), ...(eski?.uzru ? [[eski.uzru.k, eski.uzru.sha256] as const] : [])]);
  const yangiSha = new Map<string, string>([...p.manifest.shardlar.map(s => [s.k, s.sha256] as const), ...(p.manifest.uzru ? [[p.manifest.uzru.k, p.manifest.uzru.sha256] as const] : [])]);
  let yozildi = 0;
  for (const [k, bytes] of p.fayllar) {
    if (k === 'manifest.json.gz') continue;
    if (eskiSha.get(k) === yangiSha.get(k)) continue;
    await d.r2.put(prefix + k, bytes); yozildi++;
  }
  await d.r2.put(prefix + 'manifest.json.gz', p.fayllar.get('manifest.json.gz')!);   // LAST: readers activate on it
  return yozildi + 1;
}

export async function tajribaTickIsh(d: TajribaDeps, hozir: Date, o: { majbur?: boolean; prefix?: string; obyektPartiya?: number } = {}) {
  if (!o.majbur && !oynadaMi(hozir)) return { ok: true, oyna: false, qoldi: false };
  const prefix = o.prefix ?? TAJRIBA_PREFIX;
  const partiya = o.obyektPartiya ?? OBYEKT_PARTIYA;
  const state: State = (await oqiJson<State>(d, prefix + 'state.json.gz')) ?? { v: 1, kursor: { ...BOSH_KURSOR }, kompaniyalar: [] };
  const holatlar = new Map<number, Holat>();
  const ozgargan = new Set<number>();
  const holatOl = async (k: number): Promise<Holat> => {
    let h = holatlar.get(k);
    if (!h) { const j = await oqiJson<Holat>(d, `${prefix}c/${k}/holat.json.gz`); h = j && j.v === 1 && j.m && j.o ? j : holatBosh(); holatlar.set(k, h); }
    return h;
  };
  let obyektSoni = 0, tanlovSoni = 0, xato: string | null = null;

  const ob = await d.rpc('t2_tajriba_ozgargan_obyektlar_v1', { p_vaqt: state.kursor.obyektVaqt ?? '1970-01-01T00:00:00Z', p_limit: partiya });
  const obList = (Array.isArray(ob) ? ob : []) as Array<{ kompaniya_id: number; obyekt_id: number; yangilandi: string }>;
  for (const r of obList) {
    try {
      const rows = await d.rpc('t2_tajriba_obyekt_qatorlar_v1', { p_obyekt_id: r.obyekt_id });
      const h = await holatOl(r.kompaniya_id);
      obyektQosh(h, String(r.kompaniya_id), String(r.obyekt_id), qatorlarga(rows));
      ozgargan.add(r.kompaniya_id);
      state.kursor.obyektVaqt = r.yangilandi; obyektSoni++;
      if (!state.kompaniyalar.includes(r.kompaniya_id)) state.kompaniyalar.push(r.kompaniya_id);
    } catch (e) { xato = 'OBYEKT_' + (e instanceof Error ? e.message.slice(0, 60) : 'XATO'); break; }   // cursor stays before the failed object
  }

  let tanlovQoldi = false;
  if (!xato) {
    try {
      const tl = await d.rpc('t2_tajriba_tanlovlar_v1', { p_id: state.kursor.tanlovId, p_limit: TANLOV_PARTIYA });
      const list = (Array.isArray(tl) ? tl : []) as Array<{ id: number; kompaniya_id: number; norma_kod: string; tavsif: string | null; birlik: string | null }>;
      const by = new Map<number, typeof list>();
      for (const t of list) { const l = by.get(t.kompaniya_id) ?? []; l.push(t); by.set(t.kompaniya_id, l); }
      for (const [k, l] of by) {
        const h = await holatOl(k);
        tanlovSoni += studioQosh(h, String(k), l.map(t => ({ nom: t.tavsif, birlik: t.birlik, kod: t.norma_kod })));
        ozgargan.add(k);
        if (!state.kompaniyalar.includes(k)) state.kompaniyalar.push(k);
      }
      if (list.length) state.kursor.tanlovId = Math.max(state.kursor.tanlovId, ...list.map(t => t.id));
      tanlovQoldi = list.length >= TANLOV_PARTIYA;
    } catch (e) { xato = 'TANLOV_' + (e instanceof Error ? e.message.slice(0, 60) : 'XATO'); }
  }

  const qoldi = !xato && (obList.length >= partiya || tanlovQoldi);
  for (const k of ozgargan) await d.r2.put(`${prefix}c/${k}/holat.json.gz`, jsonGz(holatlar.get(k)));
  state.kompaniyalar.sort((a, b) => a - b);
  if (ozgargan.size > 0) state.iflos = true;   // ingested but the served layers are not rebuilt yet (backlog still draining)
  await d.r2.put(prefix + 'state.json.gz', jsonGz(state));

  // Served layers are rebuilt when the backlog is drained (or on demand): per company, then the k-anonymous global layer.
  let yozildi = 0, misol = 0, stat: ReturnType<typeof holatStat> | null = null;
  if (!qoldi && !xato && (state.iflos || o.majbur)) {
    const qurildi = hozir.toISOString();
    for (const k of state.kompaniyalar) {
      const h = await holatOl(k);
      const kk = kompaktla(h, null);
      yozildi += await qatlamYoz(d, `${prefix}c/${k}/`, await paketla(kk, uzRuOrgan(kk), { qatlam: 'kompaniya', kompaniya: k, qurildi }));
    }
    const hammasi = holatlarniBirlashtir(await Promise.all(state.kompaniyalar.map(holatOl)));
    const gk = kompaktla(hammasi, KANON);
    misol = gk.length; stat = holatStat(hammasi);
    yozildi += await qatlamYoz(d, prefix, await paketla(gk, uzRuOrgan(gk), { qatlam: 'global', qurildi, kursor: state.kursor, kompaniyalar: state.kompaniyalar }));
    state.iflos = false;
    await d.r2.put(prefix + 'state.json.gz', jsonGz(state));
  }
  return { ok: !xato, oyna: true, qoldi, obyekt: obyektSoni, tanlov: tanlovSoni, yozildi, global_misol: misol, kompaniya: state.kompaniyalar.length, ...(stat ? { indeks: stat } : {}), ...(xato ? { xato } : {}) };
}
