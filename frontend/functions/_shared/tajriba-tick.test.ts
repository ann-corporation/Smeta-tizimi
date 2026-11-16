import { describe, expect, it } from 'vitest';
import { oynadaMi, qatorlarga, tajribaTickIsh, type TajribaDeps } from './tajriba-tick';
import { manifestOqi, gzJson, TAJRIBA_PREFIX } from '../../src/lib/smeta-ai/tajriba-paket';
import { onRequestPost } from '../api/tajriba-tick';
import { tajribaKalit } from '../api/tajriba-indeks';

// ---- fake DB + R2: SYNTHETIC rows only
const SATR = (kod: string, nom: string) => ({ kod, nom, birlik: '100М3', bolim: ['ОБЪЕКТ', 'ФУНДАМЕНТЫ'] });
const OBYEKT: Record<number, unknown[]> = {
  1: [SATR('Е6-1-1-1', 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ'), SATR('Е6-1-1-2', 'УСТРОЙСТВО БЕТОННЫХ ФУНДАМЕНТОВ ПОД КОЛОННЫ')],
  2: [SATR('Е6-1-1-1', 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ')],
  3: [SATR('Е6-1-1-1', 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ')],
};
function fake(opts: { ozgargan?: unknown[]; tanlov?: unknown[]; xato?: string } = {}) {
  const r2 = new Map<string, Uint8Array>(), chaqiruv: string[] = [];
  const d: TajribaDeps = {
    async rpc(nom, args) {
      chaqiruv.push(nom);
      if (opts.xato === nom) throw new Error('RPC_' + nom + '_500');
      if (nom === 't2_tajriba_ozgargan_obyektlar_v1') {
        const t = String(args.p_vaqt);
        return (opts.ozgargan ?? [
          { kompaniya_id: 7, obyekt_id: 1, yangilandi: '2026-11-01T00:00:00Z' },
          { kompaniya_id: 7, obyekt_id: 2, yangilandi: '2026-11-02T00:00:00Z' },
          { kompaniya_id: 7, obyekt_id: 3, yangilandi: '2026-11-03T00:00:00Z' },
        ]).filter((x: any) => x.yangilandi > t).slice(0, Number(args.p_limit));
      }
      if (nom === 't2_tajriba_obyekt_qatorlar_v1') return OBYEKT[Number(args.p_obyekt_id)] ?? [];
      if (nom === 't2_tajriba_tanlovlar_v1') return (opts.tanlov ?? []).filter((x: any) => x.id > Number(args.p_id));
      throw new Error('kutilmagan ' + nom);
    },
    r2: { async get(k) { return r2.get(k) ?? null; }, async put(k, b) { r2.set(k, b); } },
  };
  return { d, r2, chaqiruv };
}
const KUN = new Date('2026-11-16T21:50:00Z');

describe('qatorlarga', () => {
  it('keeps order, the neighbours of a line are the codes around it', () => {
    const q = qatorlarga([SATR('Е6-1-1-1', 'А'), SATR('Е16-2-1-1', 'Б'), { kod: 5 }, SATR('Е11-1-1-1', 'В')]);
    expect(q).toHaveLength(3);
    expect(q[1].qoshni).toEqual(['Е6-1-1-1', 'Е11-1-1-1']);
  });
});

describe('tajribaTickIsh', () => {
  it('window: outside 21:00-24:00 UTC nothing runs unless forced', async () => {
    const f = fake();
    expect(oynadaMi(new Date('2026-11-16T14:00:00Z'))).toBe(false);
    expect(await tajribaTickIsh(f.d, new Date('2026-11-16T14:00:00Z'))).toMatchObject({ oyna: false, qoldi: false });
    expect(f.chaqiruv).toEqual([]);
  });
  it('first run ingests the objects, writes company state + served layers; the global layer is k-anonymous', async () => {
    const f = fake();
    const r = await tajribaTickIsh(f.d, KUN, { obyektPartiya: 5 });
    expect(r).toMatchObject({ ok: true, qoldi: false, obyekt: 3, kompaniya: 1 });
    const g = manifestOqi(f.r2.get(TAJRIBA_PREFIX + 'manifest.json.gz')!)!;
    expect(g.qatlam).toBe('global');
    expect(g.kursor).toEqual({ obyektVaqt: '2026-11-03T00:00:00Z', tanlovId: 0 });
    // Е6-1-1-1 is in 3 objects -> global; Е6-1-1-2 only in one -> company layer only
    const shard = (k: string) => gzJson<{ m: Array<[string, string, Array<[string, number, number, number]>]> }>(f.r2.get(TAJRIBA_PREFIX + k)!).m;
    const globalKodlar = g.shardlar.flatMap(s => shard(s.k)).flatMap(m => m[2].map(k => k[0]));
    expect(globalKodlar).toEqual(['Е6-1-1-1']);
    const c = manifestOqi(f.r2.get(TAJRIBA_PREFIX + 'c/7/manifest.json.gz')!)!;
    expect(c).toMatchObject({ qatlam: 'kompaniya', kompaniya: 7 });
    const kodlar = c.shardlar.flatMap(s => shard('c/7/' + s.k)).flatMap(m => m[2].map(k => k[0])).sort();
    expect(kodlar).toEqual(['Е6-1-1-1', 'Е6-1-1-2']);
    expect(f.r2.has(TAJRIBA_PREFIX + 'c/7/holat.json.gz')).toBe(true);
  });
  it('second run is incremental: nothing new -> no object re-read, cursor kept', async () => {
    const f = fake();
    await tajribaTickIsh(f.d, KUN);
    f.chaqiruv.length = 0;
    const r = await tajribaTickIsh(f.d, KUN);
    expect(r).toMatchObject({ ok: true, obyekt: 0, yozildi: 0 });
    expect(f.chaqiruv).not.toContain('t2_tajriba_obyekt_qatorlar_v1');
  });
  it('backlog is drained in partitions: qoldi:true until the last one, layers rebuilt only then', async () => {
    const f = fake();
    const a = await tajribaTickIsh(f.d, KUN, { obyektPartiya: 2 });
    expect(a).toMatchObject({ qoldi: true, obyekt: 2, yozildi: 0 });
    expect(f.r2.has(TAJRIBA_PREFIX + 'manifest.json.gz')).toBe(false);
    const b = await tajribaTickIsh(f.d, KUN, { obyektPartiya: 2 });
    expect(b).toMatchObject({ qoldi: false, obyekt: 1 });
    expect(f.r2.has(TAJRIBA_PREFIX + 'manifest.json.gz')).toBe(true);
  });
  it('Studio confirmations are compacted in (cursor = last id) and counted as lines, not objects', async () => {
    const f = fake({ tanlov: [
      { id: 5, kompaniya_id: 7, norma_kod: 'Е16-2-1-1', tavsif: 'Монтаж задвижек чугунных', birlik: 'шт' },
      { id: 6, kompaniya_id: 7, norma_kod: 'Е16-2-1-1', tavsif: 'Монтаж задвижек чугунных', birlik: 'шт' },
    ] });
    const r = await tajribaTickIsh(f.d, KUN);
    expect(r).toMatchObject({ ok: true, tanlov: 2 });
    expect(manifestOqi(f.r2.get(TAJRIBA_PREFIX + 'manifest.json.gz')!)!.kursor?.tanlovId).toBe(6);
    expect(r.ok && (r as { obyekt: number }).obyekt).toBe(3);
  });
  it('a failing object stops the run BEFORE its cursor (retried next night); nothing is published half-way', async () => {
    const f = fake({ xato: 't2_tajriba_obyekt_qatorlar_v1' });
    const r = await tajribaTickIsh(f.d, KUN);
    expect(r).toMatchObject({ ok: false, obyekt: 0 });
    expect(f.r2.has(TAJRIBA_PREFIX + 'manifest.json.gz')).toBe(false);
  });
});

describe('endpoints', () => {
  const KALIT = 'k'.repeat(32);
  const ctx = (headers: Record<string, string>, env: Record<string, unknown> = {}) => ({
    request: new Request('https://x.test/api/tajriba-tick', { method: 'POST', headers, body: '{}' }),
    env: { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_KEY: 's', R2_CANONICAL: {}, BILDIRISHNOMA_CRON_KALIT: KALIT, ...env },
  }) as unknown as Parameters<typeof onRequestPost>[0];
  it('tick: unset secret 503, wrong 403, no R2 binding 503', async () => {
    expect((await onRequestPost(ctx({}, { BILDIRISHNOMA_CRON_KALIT: '' }))).status).toBe(503);
    expect((await onRequestPost(ctx({ 'X-Cron-Kalit': 'x'.repeat(32) }))).status).toBe(403);
    expect((await onRequestPost(ctx({ 'X-Cron-Kalit': KALIT }, { R2_CANONICAL: undefined }))).status).toBe(503);
  });
  it('index route serves only index files; the private state and the cursor are never exposed', () => {
    expect(tajribaKalit('manifest.json.gz', null)).toBe(TAJRIBA_PREFIX + 'manifest.json.gz');
    expect(tajribaKalit('e/s03.json.gz', 7)).toBe(TAJRIBA_PREFIX + 'c/7/e/s03.json.gz');
    expect(tajribaKalit('holat.json.gz', 7)).toBeNull();
    expect(tajribaKalit('state.json.gz', null)).toBeNull();
    expect(tajribaKalit('../../x', null)).toBeNull();
    expect(tajribaKalit('manifest.json.gz', -1)).toBeNull();
  });
});
