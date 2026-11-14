import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../snapshot-r2/sovuq';
import { soxtaMuhrDb, soxtaR2, yasa } from './soxta.testlib';
import { dbAloqa, isitBarchasi, isitBlok, isitObyekt, muhrKalit, sovutMuhrBlok } from './sovuq';
import { muhrSovuqKerak } from '../qator-muhr/farq';

describe('muhr sovutish (R2 ga yoz -> qayta o\'qi -> sha256 -> NULL)', () => {
  it('tartib oqi,yoz,tasdiq,sovut; R2 kaliti = sha256; yuklama NULL, sovuq_id qo\'yiladi', async () => {
    const q = yasa(4); const asl = q.map((x) => x.yuklama);
    const { db, chaqiruvlar } = soxtaMuhrDb(q); const { r2, x } = soxtaR2();
    const n = await sovutMuhrBlok(db, r2, 1);
    expect(n).toMatchObject({ holat: 'sovutildi', qator_soni: 4 });
    expect(chaqiruvlar).toEqual(['oqi', 'yoz', 'tasdiq', 'sovut']);
    expect(q.every((r) => r.yuklama === null && r.sovuq_id === 1)).toBe(true);
    expect(x.size).toBe(1);
    const sha = await sha256Hex(JSON.stringify(asl.map((y, i) => ({ id: 100 + i, y }))));
    expect([...x.keys()][0]).toBe(muhrKalit(sha));
    expect(n.bayt_bosh).toBe(asl.reduce((s, y) => s + y!.length, 0));
  });

  it('R2 dan qaytgan bayt buzilgan (sha256 mos emas) -> bazaga HECH NARSA yozilmaydi (yoz/tasdiq/sovut chaqirilmaydi)', async () => {
    const q = yasa(3); const asl = q.map((r) => r.yuklama);
    const { db, chaqiruvlar } = soxtaMuhrDb(q); const { r2 } = soxtaR2({ buzib: true });
    await expect(sovutMuhrBlok(db, r2, 1)).rejects.toThrow('R2_SHA256_MOS_EMAS');
    expect(chaqiruvlar).toEqual(['oqi']);
    expect(q.map((r) => r.yuklama)).toEqual(asl);
  });

  it('R2 ga yozib bo\'lmasa yoki qayta o\'qib bo\'lmasa -> yuklama joyida', async () => {
    for (const o of [{ putXato: true }, { yoq: true }]) {
      const q = yasa(2); const asl = q.map((r) => r.yuklama);
      const { db, chaqiruvlar } = soxtaMuhrDb(q);
      await expect(sovutMuhrBlok(db, soxtaR2(o).r2, 1)).rejects.toThrow();
      expect(chaqiruvlar).toEqual(['oqi']);
      expect(q.map((r) => r.yuklama)).toEqual(asl);
    }
  });

  it('idempotent: sovutilgan qator nomzod emas; ikkinchi chaqiruv — allaqachon, R2 ga yozmaydi', async () => {
    const q = yasa(3); const { db } = soxtaMuhrDb(q); const { r2, x } = soxtaR2();
    await sovutMuhrBlok(db, r2, 1);
    const n = await sovutMuhrBlok(db, r2, 1);
    expect(n.holat).toBe('allaqachon');
    expect(x.size).toBe(1);
  });

  it('dry-run: R2 ga ham, bazaga ham yozmaydi', async () => {
    const q = yasa(2); const { db, chaqiruvlar } = soxtaMuhrDb(q); const { r2, x } = soxtaR2();
    expect((await sovutMuhrBlok(db, r2, 1, { dryRun: true })).holat).toBe('dry-run');
    expect(x.size).toBe(0); expect(chaqiruvlar).toEqual(['oqi']);
  });

  it('o\'zgargan qator nomzod emas (issiq qoladi); boshqa obyekt tegilmaydi', async () => {
    const q = [...yasa(3), ...yasa(2, 2).map((r) => ({ ...r, id: r.id + 1000 }))];
    const { db } = soxtaMuhrDb(q, { ozgargan: [101] }); const { r2 } = soxtaR2();
    const n = await sovutMuhrBlok(db, r2, 1);
    expect(n.qator_soni).toBe(2);
    expect(q.find((r) => r.id === 101)!.yuklama).not.toBeNull();
    expect(q.filter((r) => r.obyekt === 2).every((r) => r.yuklama !== null)).toBe(true);
  });
});

describe('muhr isitish (tikla) — readerlar uchun shaffof yo\'l', () => {
  it('R2 dan o\'qiydi, sha256 ni tekshiradi, faqat so\'ralgan qatorni qaytaradi (qolgani sovuq qoladi)', async () => {
    const q = yasa(4); const asl = q.map((r) => r.yuklama);
    const { db, korsatkichlar } = soxtaMuhrDb(q); const { r2 } = soxtaR2();
    await sovutMuhrBlok(db, r2, 1);
    expect(await dbAloqa(db).nomzod(1, 5)).toEqual([]); // hech narsa o'zgarmagan
    const k = korsatkichlar[0];
    const n = await isitBlok(dbAloqa(db), r2, { sovuq_id: String(k.id), r2_key: k.key, r2_sha256: k.sha, idlar: ['101'] });
    expect(n).toBe(1);
    expect(q[1].yuklama).toBe(asl[1]); expect(q[1].sovuq_id).toBeUndefined();
    expect(q[0].yuklama).toBeNull();
  });
  it('o\'zgargan sovuq qatorlar nomzod; isitObyekt qaytaradi; takror — 0', async () => {
    const q = yasa(3); const o = { ozgargan: [] as number[] };
    const { db } = soxtaMuhrDb(q, o); const { r2 } = soxtaR2();
    await sovutMuhrBlok(db, r2, 1);
    o.ozgargan.push(102);
    const n = await isitObyekt(dbAloqa(db), r2, 1);
    expect(n).toEqual({ blok: 1, qator: 1, xato: 0 });
    expect(q[2].yuklama).not.toBeNull();
    o.ozgargan.length = 0; o.ozgargan.push(102);
    expect(await isitObyekt(dbAloqa(db), r2, 1)).toEqual({ blok: 0, qator: 0, xato: 0 });
  });

  it('R2 buzilgan yoki obyekt yo\'q -> xato sanaladi, DB tegilmaydi (isit chaqirilmaydi)', async () => {
    for (const o of [{ buzib: true }, { yoq: true }]) {
      const q = yasa(2); const ozg = { ozgargan: [] as number[] };
      const { db, chaqiruvlar } = soxtaMuhrDb(q, ozg); const ok = soxtaR2();
      await sovutMuhrBlok(db, ok.r2, 1);
      ozg.ozgargan.push(100);
      const log: string[] = [];
      const n = await isitObyekt(dbAloqa(db), soxtaR2(o).r2, 1, { log: (m) => log.push(m) });
      expect(n).toMatchObject({ blok: 0, qator: 0, xato: 1 });
      expect(chaqiruvlar).not.toContain('isit');
      expect(log[0]).toContain('bazada tegilmagan');
      expect(q[0].yuklama).toBeNull();
    }
  });

  it('isitBarchasi (rollback oldidan): barcha sovuq bloklarni to\'liq qaytaradi', async () => {
    const q = yasa(5); const { db } = soxtaMuhrDb(q); const { r2 } = soxtaR2();
    const asl = q.map((r) => r.yuklama);
    await sovutMuhrBlok(db, r2, 1, { limit: 3 }); await sovutMuhrBlok(db, r2, 1, { limit: 3 });
    expect(q.every((r) => r.yuklama === null)).toBe(true);
    expect(await isitBarchasi(db, r2)).toEqual({ blok: 2, qator: 5, xato: 0 });
    expect(q.map((r) => r.yuklama)).toEqual(asl);
  });
});

describe('muhrSovuqKerak (reader belgisi)', () => {
  it('o\'zgargan + bo\'sh maydonlar yoki o\'chirilgan + nomsiz => true; issiq qator => false', () => {
    expect(muhrSovuqKerak({ holat: 'ozgargan', maydonlar: [], tur: 'bl', kod: 'E1', nom: 'X' })).toBe(true);
    expect(muhrSovuqKerak({ holat: 'ochirilgan', maydonlar: [], tur: null, kod: null, nom: null })).toBe(true);
    expect(muhrSovuqKerak({ holat: 'ozgargan', maydonlar: ['nom'], tur: 'bl', kod: 'E1', nom: 'X' })).toBe(false);
    expect(muhrSovuqKerak({ holat: 'ochirilgan', maydonlar: [], tur: 'bl', kod: 'E1', nom: 'X' })).toBe(false);
    expect(muhrSovuqKerak({ holat: 'qoshilgan', maydonlar: [], tur: null, kod: null, nom: null })).toBe(false);
  });
});

describe('migratsiya 20261212400000 (statik qoidalar)', () => {
  const dir = resolve(__dirname, '../../../../supabase/migrations');
  const nom = '20261212400000_t2_qator_muhr_r2_v1';
  const oqi = (s: string) => readFileSync(resolve(dir, nom + s), 'utf8');
  const fwd = oqi('.sql'); const rb = oqi('.rollback.sql'); const acc = oqi('.acceptance.sql');

  it('forward: begin/commit yo\'q (runner o\'raydi), psql meta-buyruq yo\'q', () => {
    expect(fwd).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
    for (const s of [fwd, rb, acc]) expect(s).not.toMatch(/^\s*\\\w+/m);
  });
  it('acceptance: begin ... rollback, sintetik', () => {
    expect(acc).toMatch(/^begin;/m); expect(acc.trim().endsWith('rollback;')).toBe(true);
    expect(acc).toContain('SINOV muhr-r2');
  });
  it('rollback: sovuq qator bo\'lsa rad etadi; asl const trigger va view tiklanadi; yangi obyektlar o\'chiriladi', () => {
    expect(rb).toMatch(/ROLLBACK RAD ETILDI/);
    expect(rb).toMatch(/drop table if exists public\.t2_qator_muhr_sovuq;/);
    expect(rb).toMatch(/create or replace view public\.t2_qator_muhr_farq/);
    expect(rb).toMatch(/drop column if exists sovuq_id/);
  });
  it('const: DELETE rad, isitish xeshi muhrga teng bo\'lishi shart, sovutish tasdiqlangan ko\'rsatkichsiz mumkin emas', () => {
    expect(fwd).toMatch(/muhr o''chirilmaydi/);
    expect(fwd).toMatch(/isitish rad etildi/);
    expect(fwd).toMatch(/e\.r2_tasdiqlangan is not null/);
    expect(fwd).toMatch(/r2_tasdiqlangan is null or e\.r2_sha256 is distinct from p_sha256/);
  });
  it('RPC lar faqat service_role; jadval RLS + anon/authenticated yo\'q', () => {
    expect(fwd).toMatch(/revoke all on public\.t2_qator_muhr_sovuq from public, anon, authenticated/);
    expect(fwd).toMatch(/to service_role;\s*$/m);
    expect(fwd).not.toMatch(/grant [^;]*to (anon|authenticated|public)/i);
  });
  it('repo ommaviy: real ism/INN/summa yo\'q (faqat sintetik)', () => {
    for (const s of [fwd, rb, acc]) expect(s).not.toMatch(/\b\d{9}\b|\d{1,3}(?: \d{3}){2,}/);
  });
});
