import { describe, expect, it } from 'vitest';
import { ARXIV_OGOH_STANDART_MB, arxivTickIsh, onRequestPost, oynadaMi } from './arxiv-tick';
import type { ArxivDeps } from '../_shared/arxiv';

const KALIT = 'k'.repeat(32);
const ctx = (headers: Record<string, string>, body: unknown, env: Record<string, unknown> = {}) => ({
  request: new Request('https://x.test/api/arxiv-tick', { method: 'POST', headers, body: JSON.stringify(body) }),
  env: { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_KEY: 's', R2_CANONICAL: {}, BILDIRISHNOMA_CRON_KALIT: KALIT, ...env },
}) as unknown as Parameters<typeof onRequestPost>[0];

describe('POST /api/arxiv-tick', () => {
  it('kalit sozlanmagan 503, noto\'g\'ri 403, R2 binding yo\'q 503', async () => {
    expect((await onRequestPost(ctx({}, {}, { BILDIRISHNOMA_CRON_KALIT: '' }))).status).toBe(503);
    expect((await onRequestPost(ctx({ 'X-Cron-Kalit': 'x'.repeat(32) }, {}))).status).toBe(403);
    expect((await onRequestPost(ctx({ 'X-Cron-Kalit': KALIT }, {}, { R2_CANONICAL: undefined }))).status).toBe(503);
  });
  it('tikla: ruxsatsiz jadval va noto\'g\'ri sha256 rad etiladi', async () => {
    const r = await onRequestPost(ctx({ 'X-Cron-Kalit': KALIT }, { amal: 'tikla', jadval: 't2_qator', r2_key: 'arxiv/t2_qator/2026/01/a.ndjson.gz', sha256: 'a'.repeat(64) }));
    expect(r.status).toBe(400);
  });
  it('oyna 17:00-06:00 UTC: GitHub cron kechikkan vaqtlari (01:16, 04:04, 18:24) oynaga tushadi', () => {
    for (const s of ['21:30', '23:59', '00:00', '01:16', '04:04', '05:59', '17:00', '18:24']) expect(oynadaMi(new Date(`2026-11-15T${s}:00Z`)), s).toBe(true);
    for (const s of ['06:00', '12:00', '14:00', '16:59']) expect(oynadaMi(new Date(`2026-11-15T${s}:00Z`)), s).toBe(false);
  });
  it('majbur:true oynadan tashqarida ham ishlaydi (workflow_dispatch)', async () => {
    const c: string[] = [];
    const d: ArxivDeps = { async rpc(nom) { c.push(nom); return nom === 't2_arxiv_batch_v1' || nom === 't2_arxiv_snap_nomzod_v1' ? [] : { ok: true, db_bytes: 1 }; }, r2: { async put() {}, async get() { return null; }, async boshHajm() { return null; } }, async kut() {} };
    const r = await arxivTickIsh(d, {}, new Date('2026-11-15T12:00:00Z'), { majbur: true, pauzaMs: 0 });
    expect(r.oyna).toBe(true); expect(c).toContain('t2_arxiv_batch_v1');
  });
  it('standart ogohlantirish chegarasi 380 MB', () => { expect(ARXIV_OGOH_STANDART_MB).toBe(380); });
});

describe('arxivTickIsh', () => {
  const bosh = (chaqiruv: string[], extra: Partial<Record<string, unknown>> = {}): ArxivDeps => ({
    async rpc(nom) {
      chaqiruv.push(nom);
      if (nom === 't2_arxiv_batch_v1' || nom === 't2_arxiv_snap_nomzod_v1') return [];
      if (nom === 't2_arxiv_holat_v1') return { db_bytes: (extra.mb as number ?? 100) * 1048576 };
      return { ok: true };
    },
    r2: { async put() {}, async get() { return null; }, async boshHajm() { return null; } },
    async kut() {},
  });

  it('oynadan tashqarida hech narsa qilmaydi', async () => {
    const c: string[] = [];
    const r = await arxivTickIsh(bosh(c), {}, new Date('2026-11-15T12:00:00Z'));
    expect(r.oyna).toBe(false); expect(c).toEqual([]);
  });
  it('oynada barcha jadvallar yuritiladi, jurnal yoziladi, hajm chegaradan past - ogohlantirish yo\'q', async () => {
    const c: string[] = [];
    const r = await arxivTickIsh(bosh(c), {}, new Date('2026-11-15T22:00:00Z'));
    expect(r.ok).toBe(true);
    expect(c.filter((x) => x === 't2_arxiv_batch_v1')).toHaveLength(6);
    expect(c).toContain('t2_arxiv_jurnal_yoz_v1');
    expect(c).not.toContain('t2_arxiv_ogohlantir_v1');
  });
  it('baza hajmi 380 MB dan oshsa superadminga ogohlantirish', async () => {
    const c: string[] = [];
    await arxivTickIsh(bosh(c, { mb: 400 }), {}, new Date('2026-11-15T22:00:00Z'));
    expect(c).toContain('t2_arxiv_ogohlantir_v1');
  });
  it('drains the Jarvis purge queue before staging new archives when enabled', async () => {
    const c: string[] = [];
    const d = bosh(c);
    const rpc = d.rpc;
    d.rpc = async (nom, args) => {
      if (nom.startsWith('t2_jarvis_') && nom.endsWith('_pick_v1')) { c.push(nom); return []; }
      return rpc(nom, args);
    };
    const bucket = { async put() {}, async get() {}, async head() {}, async delete() {} } as unknown as R2Bucket;
    const now = new Date('2026-11-15T22:00:00Z');
    await arxivTickIsh(d, { R2_CANONICAL: bucket }, now);
    expect(c.filter(nom => nom.startsWith('t2_jarvis_'))).toEqual([]);
    const result = await arxivTickIsh(d, { R2_CANONICAL: bucket, JARVIS_ARCHIVE_YOQILGAN: '1' }, now);
    expect(result.ok).toBe(true);
    expect(c.filter(nom => nom.startsWith('t2_jarvis_'))).toEqual([
      't2_jarvis_suhbat_archive_purge_pick_v1', 't2_jarvis_suhbat_archive_pick_v1',
    ]);
  });
  it('xato bo\'lsa ogohlantirish va ok:false', async () => {
    const c: string[] = [];
    const d = bosh(c); const rpc = d.rpc;
    d.rpc = async (nom, a) => { if (nom === 't2_arxiv_batch_v1') throw new Error('RPC_500'); return rpc(nom, a); };
    const r = await arxivTickIsh(d, {}, new Date('2026-11-15T22:00:00Z'));
    expect(r.ok).toBe(false);
    expect(c).toContain('t2_arxiv_ogohlantir_v1');
  });
});
