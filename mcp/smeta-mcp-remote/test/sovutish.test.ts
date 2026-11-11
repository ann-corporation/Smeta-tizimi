import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../../frontend/src/lib/snapshot-r2/sovuq';
import { sha256Hex } from '../../../frontend/src/lib/snapshot-r2/sovuq';
import type { Env, R2BucketLike } from '../src/env';
import { _healthKeshniTozala, dbHajmMb, healthDbMb, r2Binding, sovutishCron, sovutishPartiya } from '../src/sovutish';

type Blok = { xesh: string; jadval: string; matn: string | null; r2_key?: string; r2_sha?: string; tasdiq?: boolean };

/** snapshot.sovuq_* RPC larining soxta (xotirada) nusxasi: DB xuddi shu sha256/tasdiq tekshiruvlarini bajaradi. */
function soxtaDb(bloklar: Blok[], hajmBayt = 300 * 1048576) {
  const chaqiruvlar: string[] = [];
  const db: Db = {
    async query(sql, p = []) {
      if (sql.includes('pg_database_size')) return { rows: [{ b: String(hajmBayt) }] };
      if (sql.includes('sovuq_nomzod')) {
        const lim = Number(p[1]);
        return { rows: bloklar.filter((b) => b.matn !== null).sort((a, b) => b.matn!.length - a.matn!.length || a.xesh.localeCompare(b.xesh)).slice(0, lim)
          .map((b) => ({ xesh: b.xesh, jadval: b.jadval, qator_soni: 1, bayt: String(b.matn!.length) })) };
      }
      const b = bloklar.find((x) => x.xesh === p[0]);
      if (sql.includes('sovuq_oqi')) { chaqiruvlar.push('oqi'); return { rows: b?.matn != null ? [{ matn: b.matn, bayt: String(b.matn.length) }] : [] }; }
      if (sql.includes('sovuq_yoz')) {
        chaqiruvlar.push('yoz');
        if ((await sha256Hex(b!.matn!)) !== p[2]) throw new Error('sha256 mos emas (DB)');
        b!.r2_key = String(p[1]); b!.r2_sha = String(p[2]); b!.tasdiq = false; return { rows: [{}] };
      }
      if (sql.includes('sovuq_tasdiq')) { chaqiruvlar.push('tasdiq'); b!.tasdiq = true; return { rows: [{}] }; }
      if (sql.includes('sovuq_sovut')) {
        chaqiruvlar.push('sovut');
        if (!b!.tasdiq || b!.r2_sha !== p[1] || (await sha256Hex(b!.matn!)) !== p[1]) throw new Error('sovut rad etildi (DB)');
        const n = b!.matn!.length; b!.matn = null; return { rows: [{ b: String(n) }] };
      }
      throw new Error('kutilmagan SQL: ' + sql);
    },
  };
  return { db, chaqiruvlar };
}

function soxtaR2(opt: { buzibQaytar?: boolean; putXato?: boolean } = {}) {
  const xarita = new Map<string, Uint8Array>();
  const b: R2BucketLike = {
    async put(k, v) { if (opt.putXato) throw new Error('R2 PUT yiqildi'); xarita.set(k, new Uint8Array(v)); },
    async get(k) {
      const v = xarita.get(k);
      if (!v) return null;
      const o = opt.buzibQaytar ? gzipSync(new TextEncoder().encode('boshqa mazmun')) : v; // to'g'ri gzip, lekin boshqa matn -> sha256 mos emas
      return { arrayBuffer: async () => o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer };
    },
  };
  return { b, xarita };
}

const bloklarYasa = (n: number): Blok[] => Array.from({ length: n }, (_, i) => ({ xesh: `x${String(i).padStart(3, '0')}`, jadval: 't2_qator', matn: JSON.stringify([{ i, s: 'yoq'.repeat(i + 1) }]) }));

describe('snapshot sovutish cron', () => {
  it('R2 ga yozadi, qayta o\'qib sha256 ni tekshiradi, keyin NULL qiladi (tartib: oqi, yoz, tasdiq, sovut)', async () => {
    const bl = bloklarYasa(1); const asl = bl[0].matn!;
    const { db, chaqiruvlar } = soxtaDb(bl); const { b, xarita } = soxtaR2();
    const n = await sovutishPartiya(db, r2Binding(b));
    expect(n).toMatchObject({ korildi: 1, sovutildi: 1, xato: 0, to_xtadi: 'tugadi' });
    expect(chaqiruvlar).toEqual(['oqi', 'yoz', 'tasdiq', 'sovut']);
    expect(bl[0].matn).toBeNull();
    expect(xarita.size).toBe(1);
    expect(bl[0].r2_key).toBe(`snapshot-cold/v1/${bl[0].r2_sha!.slice(0, 2)}/${bl[0].r2_sha}.json.gz`);
    expect(bl[0].r2_sha).toBe(await sha256Hex(asl));
  });

  it('R2 dan qaytgan bayt buzilgan bo\'lsa (sha256 mos emas) ? DB mazmuni TEGILMAYDI, yoz/tasdiq/sovut chaqirilmaydi', async () => {
    const bl = bloklarYasa(2); const asl = bl.map((x) => x.matn);
    const { db, chaqiruvlar } = soxtaDb(bl); const { b } = soxtaR2({ buzibQaytar: true });
    const n = await sovutishPartiya(db, r2Binding(b));
    expect(n.sovutildi).toBe(0); expect(n.xato).toBe(2);
    expect(bl.map((x) => x.matn)).toEqual(asl);
    expect(chaqiruvlar.filter((c) => c !== 'oqi')).toEqual([]);
  });

  it('R2 yozish yiqilsa mazmun joyida qoladi', async () => {
    const bl = bloklarYasa(1); const { db, chaqiruvlar } = soxtaDb(bl);
    const n = await sovutishPartiya(db, r2Binding(soxtaR2({ putXato: true }).b));
    expect(n.xato).toBe(1); expect(bl[0].matn).not.toBeNull(); expect(chaqiruvlar).toEqual(['oqi']);
  });

  it('partiya chegarasi: limit=3 bo\'lsa 3 blokdan ortig\'i sovutilmaydi', async () => {
    const bl = bloklarYasa(10); const { db } = soxtaDb(bl);
    const n = await sovutishPartiya(db, r2Binding(soxtaR2().b), { limit: 3 });
    expect(n.korildi).toBe(3); expect(n.sovutildi).toBe(3);
    expect(bl.filter((x) => x.matn === null).length).toBe(3);
  });

  it('idempotent: qayta ishga tushirish yangi ish topmaydi va R2/DB ni o\'zgartirmaydi', async () => {
    const bl = bloklarYasa(4); const { db } = soxtaDb(bl); const { b, xarita } = soxtaR2();
    await sovutishPartiya(db, r2Binding(b));
    const kalitlar = [...xarita.keys()].sort();
    const ikkinchi = await sovutishPartiya(db, r2Binding(b));
    expect(ikkinchi).toMatchObject({ korildi: 0, sovutildi: 0, xato: 0 });
    expect([...xarita.keys()].sort()).toEqual(kalitlar);
  });

  it('5 ta xatodan keyin to\'xtaydi; vaqt byudjeti tugasa to\'xtaydi', async () => {
    const bl = bloklarYasa(8); const { db } = soxtaDb(bl);
    const x = await sovutishPartiya(db, r2Binding(soxtaR2({ putXato: true }).b));
    expect(x).toMatchObject({ xato: 5, to_xtadi: 'xato_chegarasi' });
    let t = 0;
    const bl2 = bloklarYasa(8); const { db: db2 } = soxtaDb(bl2);
    const y = await sovutishPartiya(db2, r2Binding(soxtaR2().b), { byudjetMs: 100, now: () => (t += 60) });
    expect(y.to_xtadi).toBe('byudjet'); expect(y.korildi).toBeLessThan(8);
  });

  it('sovutishCron: binding yo\'q bo\'lsa o\'tkazib yuboradi (tashlamaydi); bor bo\'lsa ishlaydi; 450 MB dan oshsa ogohlantiradi', async () => {
    const loglar: string[] = [];
    const bl = bloklarYasa(2); const { db } = soxtaDb(bl);
    await sovutishCron({} as Env, { db, log: (m) => loglar.push(m) });
    expect(loglar.join('\n')).toContain('SNAPSHOT_R2'); expect(bl.every((x) => x.matn !== null)).toBe(true);

    const ogoh: unknown[] = [];
    const orig = console.warn; console.warn = (...a: unknown[]) => { ogoh.push(a.join(' ')); };
    try {
      const katta = soxtaDb(bloklarYasa(2), 470 * 1048576);
      await sovutishCron({ SNAPSHOT_R2: soxtaR2().b, SNAPSHOT_SOVUT_LIMIT: '1' } as Env, { db: katta.db, log: (m) => loglar.push(m) });
    } finally { console.warn = orig; }
    expect(String(ogoh[0])).toContain('db_mb=470');
    expect(loglar.some((m) => m.includes('"sovutildi":1'))).toBe(true);
  });

  it('DB xatosi cron\'ni yiqitmaydi', async () => {
    const db: Db = { query: async () => { throw new Error('baza yo\'q'); } };
    await expect(sovutishCron({ SNAPSHOT_R2: soxtaR2().b } as Env, { db, log: () => undefined })).resolves.toBeUndefined();
  });

  it('dbHajmMb / healthDbMb: MB, 5 daqiqa kesh, xatoda null', async () => {
    _healthKeshniTozala();
    expect(await dbHajmMb(soxtaDb([], 451 * 1048576).db)).toBe(451);
    expect(await dbHajmMb({ query: async () => { throw new Error('x'); } })).toBeNull();
    expect(await healthDbMb({} as Env, 1000, soxtaDb([], 300 * 1048576).db)).toBe(300);
    expect(await healthDbMb({} as Env, 2000, soxtaDb([], 999 * 1048576).db)).toBe(300); // keshdan
    expect(await healthDbMb({} as Env, 400_000, soxtaDb([], 320 * 1048576).db)).toBe(320);
    _healthKeshniTozala();
  });
});
