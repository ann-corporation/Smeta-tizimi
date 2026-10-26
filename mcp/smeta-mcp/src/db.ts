/**
 * Postgres ulanishi va tranzaksiya konteksti.
 *
 * Kontekst mavjud Cloudflare API (functions/api/sb-yoz.ts) bilan bir xil: RPC'lar service_role kaliti bilan chaqiriladi,
 * aktor esa parametr sifatida (p_actor_id / p_kim) uzatiladi — prod RPC'larning birortasi auth.uid() ishlatmaydi.
 * Shunga qaramay `request.jwt.claims` service_role bilan o'rnatiladi (auth.role() ga tayanadigan kod uchun), va
 * triggerlar «kim/qayerdan» ni bilishi uchun `t2.manba='mcp'`, `t2.kim='mcp:actor:<id>'`.
 */
import pg from 'pg';
import type { Sozlama } from './config';

export type SorovNatija<T = Record<string, unknown>> = { rows: T[]; rowCount: number | null; fields?: Array<{ name: string }> };

export interface Mijoz {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SorovNatija<T>>;
  release(): void;
}

export interface Hovuz {
  connect(): Promise<Mijoz>;
  end(): Promise<void>;
}

export type Kontekst = { aktorId: number | null };

/** pg.Pool (ulanish satri faqat shu yerda ishlatiladi; hech qayerga yozilmaydi). */
export function pgHovuz(s: Sozlama): Hovuz {
  if (!s.dbUrl) throw new Error('SMETA_DB_URL muhit o\'zgaruvchisi o\'rnatilmagan (README: «Sozlash»).');
  const u = new URL(s.dbUrl);
  // sslmode URL'da bo'lsa pg ssl obyektini bosib ketadi — TLS sozlamasini o'zimiz beramiz.
  for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) u.searchParams.delete(k);
  const lokal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
  const pool = new pg.Pool({
    connectionString: u.toString(),
    ssl: lokal ? false : s.sslVerify ? true : { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
    application_name: 'smeta-mcp',
  });
  // Pool xatosi jarayonni yiqitmasin (xabar maxfiy qiymatsiz — ulanish satri xatoga qo'shilmaydi).
  pool.on('error', () => undefined);
  return pool as unknown as Hovuz;
}

export type TxOpsiya = {
  /** READ ONLY tranzaksiya (o'qish toollari). */
  readOnly?: boolean;
  /** Oxirida ROLLBACK (dry_run). */
  rollback?: boolean;
  kontekst: Kontekst;
  timeoutMs: number;
  dbRol?: string | null;
};

/** Tranzaksiya boshidagi kontekst so'rovlari (testda tekshiriladi). */
export function kontekstSorovlari(o: TxOpsiya): Array<{ sql: string; params: unknown[] }> {
  const aktor = o.kontekst.aktorId;
  const claims = JSON.stringify({ role: 'service_role', ...(aktor ? { t2_actor_id: aktor } : {}) });
  const out: Array<{ sql: string; params: unknown[] }> = [
    { sql: o.readOnly ? 'BEGIN TRANSACTION READ ONLY' : 'BEGIN', params: [] },
    { sql: "select set_config('statement_timeout', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.role', 'service_role', true), set_config('t2.manba', 'mcp', true), set_config('t2.kim', $3, true)",
      params: [String(Math.max(1000, Math.floor(o.timeoutMs))), claims, aktor ? `mcp:actor:${aktor}` : 'mcp'] },
  ];
  if (o.dbRol) out.push({ sql: `set local role "${o.dbRol.replace(/"/g, '')}"`, params: [] });
  return out;
}

/**
 * Kirish SQL'ini BITTA buyruq sifatida bajaradi (MCP-QA-01): haqiqiy pg ulanishida extended protocol — Postgres
 * ko'p buyruqli matnni o'zi rad etadi («cannot insert multiple commands into a prepared statement»), shuning uchun
 * `…; COMMIT; UPDATE …` bilan tranzaksiyadan chiqib bo'lmaydi. Tranzaksiya buyrug'i (COMMIT/BEGIN/…) ham rad etiladi.
 */
export async function bittaSorov<T = Record<string, unknown>>(m: Mijoz, sql: string, params: unknown[] | undefined, tbuyruq: (s: string) => string | null): Promise<SorovNatija<T>> {
  const t = tbuyruq(sql);
  if (t) throw new Error(`Tranzaksiya buyrug'i (${t.toUpperCase()}) ruxsat etilmaydi: MCP har amalni o'zi ochgan tranzaksiyada bajaradi (dry_run/READ ONLY kafolati).`);
  if (m instanceof pg.Client) {
    return (m as unknown as { query: (c: unknown) => Promise<SorovNatija<T>> }).query({ text: sql, values: params ?? [], queryMode: 'extended' });
  }
  return m.query<T>(sql, params ?? []);
}

/** Tranzaksiya belgisi: now() tranzaksiya boshlangan vaqt + backend pid — chegara buzilsa (COMMIT/BEGIN) o'zgaradi. */
const BELGI_SQL = "select now()::text || ':' || pg_backend_pid()::text as b";

/** fn ni bitta tranzaksiyada bajaradi: COMMIT (yoki rollback=true bo'lsa ROLLBACK); xatoda ROLLBACK. */
export async function tranzaksiya<T>(hovuz: Hovuz, o: TxOpsiya, fn: (m: Mijoz) => Promise<T>): Promise<T> {
  const m = await hovuz.connect();
  let ochiq = false;
  try {
    for (const s of kontekstSorovlari(o)) { await m.query(s.sql, s.params); ochiq = true; }
    const oldin = (await m.query<{ b: string }>(BELGI_SQL)).rows?.[0]?.b;
    const natija = await fn(m);
    const keyin = (await m.query<{ b: string }>(BELGI_SQL)).rows?.[0]?.b;
    if (oldin != null && keyin != null && oldin !== keyin) {
      throw new Error('Tranzaksiya chegarasi buzildi: so\'rov ichida COMMIT/ROLLBACK/BEGIN bajarilgan — ba\'zi o\'zgarishlar allaqachon '
        + 'yozilgan bo\'lishi mumkin (snapshot/audit/dry_run kafolati amal qilmaydi). Snapshot ro\'yxatini tekshiring.');
    }
    await m.query(o.rollback || o.readOnly ? 'ROLLBACK' : 'COMMIT');
    ochiq = false;
    return natija;
  } catch (e) {
    if (ochiq) await m.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    m.release();
  }
}

/** Ichki SAVEPOINT: muvaffaqiyatsiz bo'lsa faqat shu qism qaytariladi (masalan ixtiyoriy audit yozuvi). */
export async function savepoint<T>(m: Mijoz, nom: string, fn: () => Promise<T>): Promise<{ ok: true; natija: T } | { ok: false; xato: unknown }> {
  await m.query(`SAVEPOINT ${nom}`);
  try {
    const natija = await fn();
    await m.query(`RELEASE SAVEPOINT ${nom}`);
    return { ok: true, natija };
  } catch (xato) {
    await m.query(`ROLLBACK TO SAVEPOINT ${nom}`);
    return { ok: false, xato };
  }
}
