/**
 * MCP-QA-01 (Codex): dry_run / READ ONLY tranzaksiyasidan kirish SQL'i orqali chiqib bo'lmasligi.
 * Fake pool — tranzaksiya chegarasi modeli (haqiqiy Postgres emas): COMMIT/BEGIN «now()» belgisini o'zgartiradi.
 */
import { describe, expect, it } from 'vitest';
import { bittaSorov, tranzaksiya, type Hovuz, type Mijoz } from '../src/db';
import { tranzaksiyaBuyrugi } from '../src/sql';

function fakeHovuz() {
  let tx = 0;
  let ichida = false;
  const yozuvlar: string[] = [];
  const m = {
    async query(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
      const s = sql.trim().toLowerCase();
      if (s === 'begin' || s.startsWith('begin transaction')) { ichida = true; tx++; return { rows: [], rowCount: 0 }; }
      if (s === 'commit' || s === 'rollback') { ichida = false; return { rows: [], rowCount: 0 }; }
      if (s.startsWith('select now()')) { if (!ichida) tx++; return { rows: [{ b: `t${tx}:1` }], rowCount: 1 }; }
      for (const qism of sql.split(';').map((x) => x.trim().toLowerCase()).filter(Boolean)) {
        if (qism === 'commit') { ichida = false; tx++; continue; }
        if (qism.startsWith('update')) yozuvlar.push(ichida ? 'tx' : 'autocommit');
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  } as unknown as Mijoz;
  const hovuz: Hovuz = { connect: async () => m, end: async () => undefined };
  return { hovuz, yozuvlar };
}

describe('tranzaksiyaBuyrugi', () => {
  it('tranzaksiya buyruqlarini izoh/qavs ortidan ham taniydi', () => {
    for (const s of ['COMMIT', '  commit;', '/* x */ commit', '-- izoh\nROLLBACK', 'begin', 'START TRANSACTION', 'end', 'abort', 'savepoint a', 'release a', 'prepare transaction \'x\'', 'set transaction read write', '(commit)'])
      expect(tranzaksiyaBuyrugi(s), s).not.toBeNull();
  });
  it('oddiy so\'rovlarni o\'tkazadi', () => {
    for (const s of ['select 1', "update t set x = 'commit'", 'with a as (select 1) select * from a', '-- commit\nselect 1', 'insert into end_table values (1)'])
      expect(tranzaksiyaBuyrugi(s), s).toBeNull();
  });
});

describe('bittaSorov', () => {
  it('COMMIT bilan boshlanadigan so\'rovni rad etadi', async () => {
    const { hovuz } = fakeHovuz();
    const m = await hovuz.connect();
    await expect(bittaSorov(m, 'COMMIT; UPDATE t SET v = v + 1', [], tranzaksiyaBuyrugi)).rejects.toThrow(/Tranzaksiya buyrug/);
  });
});

describe('tranzaksiya chegarasi', () => {
  it('fn ichida COMMIT bo\'lsa — xato (dry_run «yozilmadi» deb yolg\'on aytmaydi)', async () => {
    const { hovuz } = fakeHovuz();
    await expect(tranzaksiya(hovuz, { rollback: true, kontekst: { aktorId: null }, timeoutMs: 1000 }, async (m) => {
      await m.query('UPDATE t SET v = 1; COMMIT; UPDATE t SET v = 2');
    })).rejects.toThrow(/chegarasi buzildi/);
  });
  it('oddiy fn — xatosiz', async () => {
    const { hovuz, yozuvlar } = fakeHovuz();
    await tranzaksiya(hovuz, { rollback: true, kontekst: { aktorId: null }, timeoutMs: 1000 }, async (m) => { await m.query('UPDATE t SET v = 1'); });
    expect(yozuvlar).toEqual(['tx']);
  });
});
