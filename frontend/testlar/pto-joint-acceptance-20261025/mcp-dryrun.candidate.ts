import { expect, it } from 'vitest';
import { Muhit } from '../../../mcp/smeta-mcp/src/muhit';
import { toolChaqir } from '../../../mcp/smeta-mcp/src/tool';
import { sqlYozish } from '../../../mcp/smeta-mcp/src/tools/yozish';

/** No sockets/credentials: a deliberately small ledger models transaction boundaries, not PostgreSQL in general. */
function ledger() {
  let committed = 0, pending = 0, inTransaction = false;
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      for (const raw of sql.split(';')) {
        const s = raw.trim();
        if (/^BEGIN\b/i.test(s)) { inTransaction = true; pending = committed; }
        else if (/^COMMIT\b/i.test(s)) { if (inTransaction) committed = pending; inTransaction = false; }
        else if (/^ROLLBACK\b/i.test(s)) { pending = committed; inTransaction = false; }
        else if (/^UPDATE qa_fixture\b/i.test(s)) { if (inTransaction) pending++; else committed++; }
      }
      return { rows: [], rowCount: 0, command: 'UPDATE' };
    },
    release() {},
  };
  const mu = new Muhit({ dbUrl: null, aktorId: 7, auditFayl: '', dbRol: null, timeoutMs: 5000, sslVerify: true },
    () => ({ connect: async () => client, end: async () => {} }));
  return { mu, queries, committed: () => committed };
}

it('CONTROL MCP: a normal write in dry_run leaves the synthetic committed ledger unchanged', async () => {
  const l = ledger();
  const r = await toolChaqir(sqlYozish, l.mu, { sql: 'UPDATE qa_fixture SET value = value + 1', dry_run: true });
  expect(r.isError).not.toBe(true);
  expect(l.queries.at(-1)).toBe('ROLLBACK');
  expect(l.committed()).toBe(0);
});

it('OPEN MCP-QA-01: dry_run must reject transaction escape before any durable effect', async () => {
  const l = ledger();
  await toolChaqir(sqlYozish, l.mu, { sql: 'COMMIT; UPDATE qa_fixture SET value = value + 1', dry_run: true });
  // Forwarding COMMIT unchanged ends the wrapper transaction. A trailing ROLLBACK cannot undo autocommitted work.
  expect(l.committed()).toBe(0);
});
