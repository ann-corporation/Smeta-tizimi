import { expect, it } from 'vitest';
import { Muhit } from '../../../mcp/smeta-mcp/src/muhit';
import { toolChaqir } from '../../../mcp/smeta-mcp/src/tool';
import { sqlYozish } from '../../../mcp/smeta-mcp/src/tools/yozish';
import { sqlOqish } from '../../../mcp/smeta-mcp/src/tools/oqish';
import { createRequire } from 'node:module';
const pg = createRequire(new URL('../../../mcp/smeta-mcp/package.json', import.meta.url))('pg');

/** No sockets/credentials: a deliberately small ledger models transaction boundaries, not PostgreSQL in general. */
function ledger() {
  let committed = 0, pending = 0, inTransaction = false, readOnly = false;
  const queries: string[] = [];
  const modes: string[] = [];
  const client = {
    async query(input: string | { text: string; queryMode?: string }) {
      const sql = typeof input === 'string' ? input : input.text;
      const mode = typeof input === 'string' ? 'simple' : input.queryMode ?? 'simple';
      queries.push(sql);
      modes.push(mode);
      if (mode === 'extended' && sql.split(';').filter(s => s.trim()).length > 1) throw new Error('cannot insert multiple commands into a prepared statement');
      for (const raw of sql.split(';')) {
        const s = raw.trim();
        if (/^BEGIN\b/i.test(s)) { inTransaction = true; pending = committed; readOnly = /READ ONLY/i.test(s); }
        else if (/^COMMIT\b/i.test(s)) { if (inTransaction) committed = pending; inTransaction = false; readOnly = false; }
        else if (/^ROLLBACK\b/i.test(s)) { pending = committed; inTransaction = false; readOnly = false; }
        else if (/^UPDATE qa_fixture\b/i.test(s)) { if (inTransaction && readOnly) throw new Error('cannot execute UPDATE in a read-only transaction'); if (inTransaction) pending++; else committed++; }
      }
      return { rows: [], rowCount: 0, command: 'UPDATE' };
    },
    release() {},
  };
  // Exercise the production pg.Client path without constructing a connection or socket.
  Object.setPrototypeOf(client, pg.Client.prototype);
  const mu = new Muhit({ dbUrl: null, aktorId: 7, auditFayl: '', dbRol: null, timeoutMs: 5000, sslVerify: true },
    () => ({ connect: async () => client, end: async () => {} }));
  return { mu, queries, modes, committed: () => committed };
}

it('CONTROL MCP: a normal write in dry_run leaves the synthetic committed ledger unchanged', async () => {
  const l = ledger();
  const r = await toolChaqir(sqlYozish, l.mu, { sql: 'UPDATE qa_fixture SET value = value + 1', dry_run: true });
  expect(r.isError).not.toBe(true);
  expect(l.queries.at(-1)).toBe('ROLLBACK');
  expect(l.committed()).toBe(0);
});

it.each(['sql_oqish', 'sql_yozish'])('OPEN MCP-QA-01: %s must reject a boundary hidden after an initial SELECT', async name => {
  const l = ledger();
  const t = name === 'sql_oqish' ? sqlOqish : sqlYozish;
  const r = await toolChaqir(t, l.mu, { sql: 'SELECT 1; COMMIT; UPDATE qa_fixture SET value = value + 1', ...(name === 'sql_yozish' ? {dry_run:true} : {}) });
  expect(l.committed()).toBe(0);
  expect(r.isError).toBe(true);
  expect(l.modes).toContain('extended');
});

it('CONTROL MCP: read-only wrapper rejects DML while its transaction remains active', async () => {
  const l = ledger();
  const r = await toolChaqir(sqlOqish, l.mu, { sql: 'UPDATE qa_fixture SET value = value + 1' });
  expect(r.isError).toBe(true);
  expect(l.committed()).toBe(0);
});

it.each(['COMMIT', 'ROLLBACK'])('OPEN MCP-QA-01: sql_oqish must preserve read-only boundary against %s', async boundary => {
  const l = ledger();
  await toolChaqir(sqlOqish, l.mu, { sql: `${boundary}; UPDATE qa_fixture SET value = value + 1` });
  expect(l.committed()).toBe(0);
});

it('OPEN MCP-QA-01: dry_run must reject transaction escape before any durable effect', async () => {
  const l = ledger();
  await toolChaqir(sqlYozish, l.mu, { sql: 'COMMIT; UPDATE qa_fixture SET value = value + 1', dry_run: true });
  // Forwarding COMMIT unchanged ends the wrapper transaction. A trailing ROLLBACK cannot undo autocommitted work.
  expect(l.committed()).toBe(0);
});
