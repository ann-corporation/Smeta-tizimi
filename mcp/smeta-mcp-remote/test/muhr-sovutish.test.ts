import { describe, expect, it } from 'vitest';
import { soxtaMuhrDb, yasa } from '../../../frontend/src/lib/qator-muhr-r2/soxta.testlib';
import type { Db } from '../../../frontend/src/lib/snapshot-r2/sovuq';
import type { Env, R2BucketLike } from '../src/env';
import { muhrSovutishPartiya, r2Binding, sovutishCron } from '../src/sovutish';

/** nomzod RPC ni soxta DB ga qo'shadi: obyekt bo'yicha issiq qatorlar soni. */
function muhrDb(qator: ReturnType<typeof yasa>, ozgargan: number[] = []) {
  const s = soxtaMuhrDb(qator, { ozgargan });
  const db: Db = {
    async query(sql, p = []) {
      if (sql.includes('t2_qator_muhr_sovuq_nomzod_v1')) {
        const obyektlar = [...new Set(qator.filter((q) => q.yuklama !== null).map((q) => q.obyekt))];
        return { rows: obyektlar.map((o) => ({ obyekt_id: o, qator_soni: qator.filter((q) => q.obyekt === o && q.yuklama !== null).length })) };
      }
      return s.db.query(sql, p);
    },
  };
  return { ...s, db };
}

function r2Soxta(opt: { putXato?: boolean } = {}): { b: R2BucketLike; xarita: Map<string, Uint8Array> } {
  const xarita = new Map<string, Uint8Array>();
  return {
    xarita,
    b: {
      async put(k, v) { if (opt.putXato) throw new Error('R2 PUT yiqildi'); xarita.set(k, new Uint8Array(v)); },
      async get(k) { const v = xarita.get(k); return v ? { arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer } : null; },
    },
  };
}

describe('muhr sovutish cron (sovutish.ts)', () => {
  it('partiya: bloklab sovutadi; R2 ga yozadi, tasdiqlaydi, yuklama NULL (obyektlar bo\'yicha)', async () => {
    const q = [...yasa(5, 1), ...yasa(3, 2).map((r) => ({ ...r, id: r.id + 1000 }))];
    const { db } = muhrDb(q); const { b, xarita } = r2Soxta();
    const n = await muhrSovutishPartiya(db, r2Binding(b), { kun: 0 });
    expect(n).toMatchObject({ sovutildi_blok: 2, sovutildi_qator: 8, xato: 0, to_xtadi: 'tugadi' });
    expect(q.every((r) => r.yuklama === null)).toBe(true);
    expect(xarita.size).toBe(2);
    expect([...xarita.keys()].every((k) => /^muhr-cold\/v1\/[0-9a-f]{2}\/[0-9a-f]{64}\.json\.gz$/.test(k))).toBe(true);
  });

  it('blok limiti: limit=1 bo\'lsa bitta blok; qolganlari keyingi kunga', async () => {
    const q = [...yasa(5, 1), ...yasa(3, 2).map((r) => ({ ...r, id: r.id + 1000 }))];
    const { db } = muhrDb(q); const { b } = r2Soxta();
    const n = await muhrSovutishPartiya(db, r2Binding(b), { kun: 0, blokLimit: 1 });
    expect(n).toMatchObject({ sovutildi_blok: 1, to_xtadi: 'blok_limiti' });
    expect(q.filter((r) => r.yuklama !== null).length).toBeGreaterThan(0);
  });

  it('vaqt byudjeti tugasa to\'xtaydi', async () => {
    const q = yasa(6); let t = 0;
    const { db } = muhrDb(q); const { b } = r2Soxta();
    const n = await muhrSovutishPartiya(db, r2Binding(b), { kun: 0, byudjetMs: 100, now: () => (t += 60) });
    expect(n.to_xtadi).toBe('byudjet');
  });

  it('idempotent: ikkinchi ishga tushirish yangi blok topmaydi', async () => {
    const q = yasa(4); const { db } = muhrDb(q); const { b, xarita } = r2Soxta();
    await muhrSovutishPartiya(db, r2Binding(b), { kun: 0 });
    const kalit = [...xarita.keys()].sort();
    const n2 = await muhrSovutishPartiya(db, r2Binding(b), { kun: 0 });
    expect(n2).toMatchObject({ sovutildi_blok: 0, xato: 0 });
    expect([...xarita.keys()].sort()).toEqual(kalit);
  });

  it('R2 yozish yiqilsa yuklama joyida, xato sanaladi; 5 xatodan keyin to\'xtaydi', async () => {
    const q = [...Array.from({ length: 6 }, (_, o) => yasa(2, o + 1).map((r) => ({ ...r, id: r.id + o * 100 }))).flat()];
    const asl = q.map((r) => r.yuklama);
    const { db } = muhrDb(q); const { b } = r2Soxta({ putXato: true });
    const n = await muhrSovutishPartiya(db, r2Binding(b), { kun: 0 });
    expect(n).toMatchObject({ sovutildi_blok: 0, xato: 5, to_xtadi: 'xato_chegarasi' });
    expect(q.map((r) => r.yuklama)).toEqual(asl);
  });

  it('avval isitish: o\'zgargan sovuq qator qaytariladi (reader to\'liq avval/endi ko\'radi)', async () => {
    const q = yasa(3); const ozg: number[] = [];
    const { db } = muhrDb(q, ozg); const { b } = r2Soxta();
    await muhrSovutishPartiya(db, r2Binding(b), { kun: 0 });
    expect(q.every((r) => r.yuklama === null)).toBe(true);
    ozg.push(101);
    const n = await muhrSovutishPartiya(db, r2Binding(b), { kun: 0 });
    expect(n).toMatchObject({ isitildi_blok: 1, isitildi_qator: 1 });
    expect(q[1].yuklama).not.toBeNull(); expect(q[0].yuklama).toBeNull();
  });

  it('migratsiya qo\'llanmagan (funksiya yo\'q) — jim o\'tkazib yuboradi', async () => {
    const db: Db = { query: async () => { throw new Error('function public.t2_qator_muhr_isit_nomzod_v1(bigint, integer) does not exist'); } };
    const n = await muhrSovutishPartiya(db, r2Binding(r2Soxta().b));
    expect(n.to_xtadi).toBe('migratsiya_yoq');
  });

  it('sovutishCron: muhr bosqichi ishlaydi, MUHR_SOVUT_OFF=1 bo\'lsa o\'tkazib yuboradi; muhr xatosi snapshot natijasini buzmaydi', async () => {
    const snapshotDb = (q: ReturnType<typeof yasa>): Db => {
      const m = muhrDb(q);
      return { async query(sql, p) { if (sql.includes('pg_database_size')) return { rows: [{ b: '1000' }] }; if (sql.includes('snapshot.sovuq_nomzod')) return { rows: [] }; return m.db.query(sql, p); } };
    };
    const q = yasa(3); const log: string[] = [];
    await sovutishCron({ SNAPSHOT_R2: r2Soxta().b, MUHR_SOVUT_KUN: '0' } as Env, { db: snapshotDb(q), log: (m) => log.push(m) });
    expect(log.some((m) => m.includes('"amal":"muhr_sovutish"') && m.includes('"sovutildi_blok":1'))).toBe(true);
    expect(q.every((r) => r.yuklama === null)).toBe(true);

    const q2 = yasa(3); const log2: string[] = [];
    await sovutishCron({ SNAPSHOT_R2: r2Soxta().b, MUHR_SOVUT_KUN: '0', MUHR_SOVUT_OFF: '1' } as Env, { db: snapshotDb(q2), log: (m) => log2.push(m) });
    expect(log2.some((m) => m.includes('muhr_sovutish'))).toBe(false);
    expect(q2.every((r) => r.yuklama !== null)).toBe(true);
  });
});
