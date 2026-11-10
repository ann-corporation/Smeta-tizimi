/** Hyperdrive → pg (Workers nodejs_compat). Har so'rovga kichik hovuz; so'rov oxirida yopiladi (Hyperdrive o'zi ulanishlarni saqlaydi). */
import pg from 'pg';
import type { Hovuz } from '../../smeta-mcp/src/db';
import { pgTurlariniOrnat } from '../../smeta-mcp/src/muhit';

export function hyperdriveHovuz(connectionString: string): Hovuz {
  if (!connectionString) throw new Error('HYPERDRIVE binding sozlanmagan (docs/mcp/REMOTE.md).');
  pgTurlariniOrnat();
  const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 10_000, application_name: 'smeta-mcp-remote' });
  pool.on('error', () => undefined);
  return pool as unknown as Hovuz;
}
