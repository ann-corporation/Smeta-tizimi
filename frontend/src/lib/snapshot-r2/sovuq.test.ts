// @vitest-environment node
import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cloudflareR2, sha256Hex, sovutBlok, sovuqKalit, tiklaBlok, tiklaSnapshot, type Db, type R2 } from './sovuq.ts';

type Blok = { xesh: string; jadval: string; qatorlar: string | null; r2_key?: string; r2_sha256?: string; tasdiq?: boolean };

/** Bazaning sovuq_* funksiyalari semantikasini taqlid qiluvchi xotiradagi soxta DB (haqiqiy SQL acceptance faylida). */
function soxtaDb(bloklar: Blok[], snapshotlar: Record<number, string[]> = {}) {
  const chaqiruv: string[] = [];
  const db: Db = {
    async query(sql, p = []) {
      const nom = /snapshot\.(sovuq_\w+)/.exec(sql)?.[1] ?? '';
      chaqiruv.push(nom);
      const b = bloklar.find((x) => x.xesh === p[0]);
      if (nom === 'sovuq_oqi') return { rows: b && b.qatorlar != null ? [{ matn: b.qatorlar, bayt: b.qatorlar.length }] : [] };
      if (nom === 'sovuq_yoz') { if (!b || b.qatorlar == null || (await sha256Hex(b.qatorlar)) !== p[2]) throw new Error('sha'); b.r2_key = String(p[1]); b.r2_sha256 = String(p[2]); b.tasdiq = false; return { rows: [] }; }
      if (nom === 'sovuq_tasdiq') { if (!b || b.r2_sha256 !== p[1]) throw new Error('yoq'); b.tasdiq = true; return { rows: [] }; }
      if (nom === 'sovuq_sovut') {
        if (!b) throw new Error('yoq');
        if (b.qatorlar == null) return { rows: [{ b: 0 }] };
        if (!b.tasdiq || b.r2_sha256 !== p[1] || (await sha256Hex(b.qatorlar)) !== b.r2_sha256) throw new Error('tasdiqsiz');
        const n = b.qatorlar.length; b.qatorlar = null; return { rows: [{ b: n }] };
      }
      if (nom === 'sovuq_tikla') {
        if (!b || b.r2_sha256 !== p[2] || (await sha256Hex(String(p[1]))) !== p[2]) throw new Error('mos emas');
        if (b.qatorlar != null) return { rows: [{ ok: false }] };
        b.qatorlar = String(p[1]); return { rows: [{ ok: true }] };
      }
      if (nom === 'sovuq_bolaklar') return { rows: (snapshotlar[Number(p[0])] ?? []).map((x) => bloklar.find((y) => y.xesh === x)!).filter((y) => y.qatorlar == null) };
      throw new Error('noma\'lum ' + sql);
    },
  };
  return { db, chaqiruv };
}

function soxtaR2(opts: { yozmaydi?: boolean; buzadi?: boolean } = {}) {
  const xotira = new Map<string, Uint8Array>();
  const r2: R2 = {
    async put(k, b) { if (opts.yozmaydi) return; xotira.set(k, opts.buzadi ? new Uint8Array([1, 2, 3]) : b); },
    async get(k) { return xotira.get(k) ?? null; },
  };
  return { r2, xotira };
}

const MATN = JSON.stringify([{ id: 1, nom: 'A' }, { id: 2, nom: 'B' }]);
const yangi = (xesh: string): Blok => ({ xesh, jadval: 't2_qator', qatorlar: MATN });
const nomzod = (xesh: string) => ({ xesh, jadval: 't2_qator', qator_soni: 2, bayt: MATN.length });

describe('sovutBlok — R2 ga ko‘chirish (yo‘qotishsiz)', () => {
  it('dry-run: R2 ham, DB ham o‘zgarmaydi', async () => {
    const { db, chaqiruv } = soxtaDb([yangi('x1')]); const { r2, xotira } = soxtaR2();
    const r = await sovutBlok(db, r2, nomzod('x1'), { dryRun: true });
    expect(r.holat).toBe('dry-run'); expect(xotira.size).toBe(0); expect(chaqiruv).toEqual(['sovuq_oqi']);
  });

  it('to‘liq yo‘l: R2 ga yoziladi, qayta o‘qiladi, keyin DB mazmuni NULL (tartib: yoz → tasdiq → sovut)', async () => {
    const bloklar = [yangi('x1')]; const { db, chaqiruv } = soxtaDb(bloklar); const { r2, xotira } = soxtaR2();
    const r = await sovutBlok(db, r2, nomzod('x1'));
    expect(r.holat).toBe('sovutildi'); expect(bloklar[0].qatorlar).toBeNull();
    const sha = await sha256Hex(MATN);
    expect(bloklar[0].r2_key).toBe(sovuqKalit(sha)); expect(xotira.has(sovuqKalit(sha))).toBe(true);
    expect(chaqiruv).toEqual(['sovuq_oqi', 'sovuq_yoz', 'sovuq_tasdiq', 'sovuq_sovut']);
  });

  it('R2 yozmasa (get null) — DB mazmuni TEGILMAYDI', async () => {
    const bloklar = [yangi('x1')]; const { db, chaqiruv } = soxtaDb(bloklar);
    await expect(sovutBlok(db, soxtaR2({ yozmaydi: true }).r2, nomzod('x1'))).rejects.toThrow('R2_QAYTA_OQILMADI');
    expect(bloklar[0].qatorlar).toBe(MATN); expect(chaqiruv).toEqual(['sovuq_oqi']);
  });

  it('R2 dan qaytgan bayt buzilgan bo‘lsa — DB mazmuni TEGILMAYDI', async () => {
    const bloklar = [yangi('x1')]; const { db, chaqiruv } = soxtaDb(bloklar);
    await expect(sovutBlok(db, soxtaR2({ buzadi: true }).r2, nomzod('x1'))).rejects.toThrow(/R2_GUNZIP_XATO|R2_SHA256_MOS_EMAS/);
    expect(bloklar[0].qatorlar).toBe(MATN); expect(chaqiruv).not.toContain('sovuq_sovut');
  });

  it('idempotent: ikkinchi ishga tushirishda allaqachon sovuq blok tegilmaydi', async () => {
    const bloklar = [yangi('x1')]; const { db } = soxtaDb(bloklar); const { r2 } = soxtaR2();
    await sovutBlok(db, r2, nomzod('x1'));
    const r = await sovutBlok(db, r2, nomzod('x1'));
    expect(r.holat).toBe('allaqachon'); expect(bloklar[0].qatorlar).toBeNull();
  });
});

describe('R2 zaxira o‘qish yo‘li (tiklash)', () => {
  async function sovuq() {
    const bloklar = [yangi('x1'), yangi('x2')]; const s = soxtaDb(bloklar, { 7: ['x1', 'x2'] }); const o = soxtaR2();
    await sovutBlok(s.db, o.r2, nomzod('x1')); await sovutBlok(s.db, o.r2, nomzod('x2'));
    expect(bloklar.every((b) => b.qatorlar === null)).toBe(true);
    return { bloklar, ...s, ...o };
  }

  it('sovuq snapshot bloklari R2 dan aynan asl matn bilan tiklanadi', async () => {
    const { bloklar, db, r2 } = await sovuq();
    expect(await tiklaSnapshot(db, r2, 7)).toBe(2);
    expect(bloklar.map((b) => b.qatorlar)).toEqual([MATN, MATN]);
    expect(await tiklaSnapshot(db, r2, 7)).toBe(0); // issiq bloklar qayta o‘qilmaydi
  });

  it('R2 obyekti yo‘q — aniq xato, bazaga hech narsa yozilmaydi', async () => {
    const { bloklar, db, xotira } = await sovuq();
    xotira.clear();
    await expect(tiklaSnapshot(db, soxtaR2().r2, 7)).rejects.toThrow('R2_OBYEKT_YOQ');
    expect(bloklar.every((b) => b.qatorlar === null)).toBe(true);
  });

  it('R2 obyekti boshqa mazmunli — sha256 rad etadi, bazaga yozilmaydi', async () => {
    const { bloklar, db, r2, xotira } = await sovuq();
    const kalit = bloklar[0].r2_key!;
    xotira.set(kalit, gzipSync(new TextEncoder().encode('[{"id":9}]')));
    await expect(tiklaBlok(db, r2, { xesh: 'x1', r2_key: kalit, r2_sha256: bloklar[0].r2_sha256! })).rejects.toThrow('R2_SHA256_MOS_EMAS');
    expect(bloklar[0].qatorlar).toBeNull();
  });
});

describe('cloudflareR2 — REST mijoz', () => {
  it('PUT/GET kalit URL ga kodlanadi, token faqat sarlavhada; 404 → null', async () => {
    const chaqirildi: Array<{ url: string; init?: RequestInit }> = [];
    const f = (async (url: string, init?: RequestInit) => {
      chaqirildi.push({ url, init });
      if (init?.method === 'PUT') return new Response(null, { status: 200 });
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const r2 = cloudflareR2({ token: 'T0KEN', account: 'ACC' }, f);
    await r2.put('snapshot-cold/v1/ab/' + 'a'.repeat(64) + '.json.gz', new Uint8Array([1]));
    expect(await r2.get('snapshot-cold/v1/ab/zz')).toBeNull();
    expect(chaqirildi[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/ACC/r2/buckets/smeta-tizimi-canonical/objects/snapshot-cold/v1/ab/' + 'a'.repeat(64) + '.json.gz');
    expect((chaqirildi[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer T0KEN');
    expect(chaqirildi[0].url).not.toContain('T0KEN');
  });

  it('sovuqKalit: noto‘g‘ri sha256 rad etiladi', () => {
    expect(() => sovuqKalit('xyz')).toThrow('SHA256_NOTOGRI');
  });
});
