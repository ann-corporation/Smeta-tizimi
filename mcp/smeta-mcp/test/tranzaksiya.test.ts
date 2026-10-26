import { describe, expect, it } from 'vitest';
import { kontekstSorovlari } from '../src/db';
import { SNAPSHOT_YOQ } from '../src/snapshot';
import { ishSorovlari, mockMuhit } from './mock';

describe('kontekst', () => {
  it('service_role claims, t2.manba=mcp, t2.kim=mcp:actor:<id>, statement_timeout; READ ONLY', () => {
    const s = kontekstSorovlari({ readOnly: true, kontekst: { aktorId: 42 }, timeoutMs: 9000 });
    expect(s[0].sql).toBe('BEGIN TRANSACTION READ ONLY');
    expect(s[1].sql).toContain("set_config('request.jwt.claims'");
    expect(s[1].sql).toContain("set_config('t2.manba', 'mcp', true)");
    expect(s[1].params).toEqual(['9000', JSON.stringify({ role: 'service_role', t2_actor_id: 42 }), 'mcp:actor:42']);
  });
  it('dbRol — set local role', () => {
    const s = kontekstSorovlari({ kontekst: { aktorId: null }, timeoutMs: 1000, dbRol: 'service_role' });
    expect(s.at(-1)!.sql).toBe('set local role "service_role"');
    expect(s[1].params[2]).toBe('mcp');
  });
});

/** snapshot bor/yo'q, audit funksiyasi bor — mock javobchi. */
function javobchi(o: { snapshotBor: boolean; xato?: boolean }) {
  return (sql: string, params: unknown[]) => {
    if (sql.includes("n.nspname = 'snapshot' and p.proname")) return [{ bor: o.snapshotBor }];
    if (sql.startsWith('select snapshot.ol(')) return [{ id: 901 }];
    if (sql.includes("to_regprocedure('public.t2_audit_yoz")) return [{ bor: true }];
    if (sql.includes('from public.t2_obyekt where id')) return [{ kompaniya_id: 5 }];
    if (sql === 'ISH') return o.xato ? new Error('ish yiqildi') : [{ n: 1 }];
    void params;
    return [];
  };
}

describe('yozish oqimi', () => {
  it('dry_run: ROLLBACK, COMMIT yo\'q, snapshot va baza audit chaqirilmaydi', async () => {
    const { mu, h } = mockMuhit(javobchi({ snapshotBor: true }));
    const r = await mu.yozish({ tool: 't', args: {}, dryRun: true, obyektId: 153 }, async (m) => (await m.query('ISH')).rows);
    const sql = h.sorovlar.map((x) => x.sql);
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
    expect(sql.some((s) => s.startsWith('select snapshot.ol('))).toBe(false);
    expect(sql.some((s) => s.includes('t2_audit_yoz'))).toBe(false);
    expect(r.dry_run).toBe(true);
    expect(r.snapshot_id).toBeNull();
    expect(h.ochiq).toBe(0);
  });
  it('oddiy: snapshot → ish → audit → COMMIT (tartib), snapshot_id qaytadi', async () => {
    const { mu, h } = mockMuhit(javobchi({ snapshotBor: true }));
    const r = await mu.yozish({ tool: 'qator_tahrir', args: { id: 1 }, obyektId: 153 }, async (m) => (await m.query('ISH')).rows);
    const ish = ishSorovlari(h.sorovlar).map((x) => x.sql);
    const iSnap = ish.findIndex((s) => s.startsWith('select snapshot.ol('));
    const iIsh = ish.indexOf('ISH');
    const iAudit = ish.findIndex((s) => s.startsWith('select public.t2_audit_yoz('));
    expect(iSnap).toBeGreaterThanOrEqual(0);
    expect(iSnap).toBeLessThan(iIsh);
    expect(iIsh).toBeLessThan(iAudit);
    expect(h.sorovlar.at(-1)!.sql).toBe('COMMIT');
    expect(r.snapshot_id).toBe(901);
    expect(r.audit_baza).toBe(true);
    const snap = h.sorovlar.find((x) => x.sql.startsWith('select snapshot.ol('))!;
    expect(snap.params.slice(0, 2)).toEqual([153, 'mcp_oldi']);
    const audit = h.sorovlar.find((x) => x.sql.startsWith('select public.t2_audit_yoz('))!;
    expect(audit.params[2]).toBe('mcp');
  });
  it('snapshot sxemasi yo\'q — amal bajariladi, ogohlantirish', async () => {
    const { mu } = mockMuhit(javobchi({ snapshotBor: false }));
    const r = await mu.yozish({ tool: 't', args: {}, obyektId: 153 }, async () => 'ok');
    expect(r.snapshot_id).toBeNull();
    expect(r.ogohlantirishlar).toContain(SNAPSHOT_YOQ);
  });
  it('ish xatosi — ROLLBACK, COMMIT yo\'q, ulanish qaytariladi', async () => {
    const { mu, h } = mockMuhit(javobchi({ snapshotBor: true, xato: true }));
    await expect(mu.yozish({ tool: 't', args: {}, obyektId: 1 }, async (m) => m.query('ISH'))).rejects.toThrow('ish yiqildi');
    const sql = h.sorovlar.map((x) => x.sql);
    expect(sql.at(-1)).toBe('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
    expect(h.ochiq).toBe(0);
  });
  it('o\'qish — READ ONLY va oxirida ROLLBACK', async () => {
    const { mu, h } = mockMuhit(() => [{ x: 1 }]);
    await mu.oqish((m) => m.query('select 1'));
    expect(h.sorovlar[0].sql).toBe('BEGIN TRANSACTION READ ONLY');
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
  });
});
