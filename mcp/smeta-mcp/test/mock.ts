/** Haqiqiy ulanishsiz mock pg: har so'rov yoziladi, javob — `javob(sql, params)` dan. */
import type { Hovuz, Mijoz, SorovNatija } from '../src/db';
import type { Sozlama } from '../src/config';
import { Muhit } from '../src/muhit';

export type Sorov = { sql: string; params: unknown[] };
export type Javobchi = (sql: string, params: unknown[]) => Array<Record<string, unknown>> | Error | undefined;

export function mockHovuz(javob: Javobchi): Hovuz & { sorovlar: Sorov[]; ochiq: number } {
  const sorovlar: Sorov[] = [];
  const h = {
    sorovlar, ochiq: 0,
    async connect(): Promise<Mijoz> {
      h.ochiq++;
      return {
        async query<T>(sql: string, params: unknown[] = []): Promise<SorovNatija<T>> {
          sorovlar.push({ sql, params });
          const r = javob(sql, params);
          if (r instanceof Error) throw r;
          const rows = (r ?? []) as T[];
          return { rows, rowCount: rows.length };
        },
        release() { h.ochiq--; },
      };
    },
    async end() { /* */ },
  };
  return h;
}

export function sozlama(qism: Partial<Sozlama> = {}): Sozlama {
  return { dbUrl: 'postgres://u:p@localhost/db', aktorId: 7, auditFayl: '', dbRol: null, timeoutMs: 5000, sslVerify: false, ...qism };
}

export function mockMuhit(javob: Javobchi, qism: Partial<Sozlama> = {}) {
  const h = mockHovuz(javob);
  const mu = new Muhit(sozlama(qism), () => h);
  return { mu, h };
}

/** Kontekst/tranzaksiya so'rovlarini tashlab, faqat «ish» so'rovlari. */
export const ishSorovlari = (s: Sorov[]) => s.filter((x) => !/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/.test(x.sql) && !x.sql.includes("set_config('statement_timeout'"));
