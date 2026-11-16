import { describe, expect, it } from 'vitest';
import {
  KANON, bolimBelgilari, holatBosh, holatStat, holatlarniBirlashtir, kompaktBirlashtir, kompaktla, matnKalit, normaKodi, obyektQosh, studioQosh, toplamKalit,
  type TajribaQator,
} from './tajriba-indeks';
import { TajribaIndeks, tajribaSabab } from './tajriba-qidir';
import { uzRuIbora, uzRuOrgan, uzRuXarita } from './tajriba-uzru';
import { manifestOqi, paketOch, paketla } from './tajriba-paket';

// ---- tiny SYNTHETIC lines (generic construction words only; no real smeta text, name or sum)
const L = (nom: string, kod: string, birlik: string | null = '100М3', bolim: string[] = ['ОБЪЕКТ А', 'ФУНДАМЕНТЫ']): TajribaQator => ({ nom, kod, birlik, bolim });
const BETON = L('УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', 'Е6-1-1-1');
const SYTKA = L('УСТРОЙСТВО СТЯЖЕК ЦЕМЕНТНЫХ ТОЛЩИНОЙ 20 ММ', 'Е11-1-11-1 ШНК.ДОП.2', '100М2', ['ОБЪЕКТ А', 'ПОЛЫ']);

describe('keys', () => {
  it('normaKodi keeps real norm codes only, annotation stripped', () => {
    expect(normaKodi('E16-2-12-8 ШНК.ДОП.15')).toBe('Е16-2-12-8');
    expect(normaKodi('1')).toBeNull();
    expect(normaKodi('00001')).toBeNull();
    expect(toplamKalit('Е16-2-12-8')).toBe('Е16');
  });
  it('matnKalit drops the estimator comment after #', () => {
    expect(matnKalit('Устройство бетонной подготовки #вручную')).toBe('УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ');
  });
  it('section words leave only as hashes', () => {
    const b = bolimBelgilari(['ОБЪЕКТ Б', 'ФУНДАМЕНТЫ']);
    expect(b.length).toBeGreaterThan(0);
    expect(b.join(' ')).not.toMatch(/ФУНДАМ|ОБЪЕКТ/i);
    expect(bolimBelgilari(['ОБЪЕКТ А', 'ФУНДАМЕНТЫ'])).toContain(b[b.length - 1]);   // same nearest section -> same hash
  });
});

describe('ingestion', () => {
  it('an exemplar collects the codes used under the same wording; re-ingesting an object REPLACES its contribution', () => {
    const h = holatBosh();
    expect(obyektQosh(h, 'k1', 'o1', [BETON, SYTKA, L('Х', 'Е1-1-1')])).toBe(2);   // too short a wording is skipped
    expect(holatStat(h)).toMatchObject({ misol: 2, juft: 2, obyekt: 1, kompaniya: 1 });
    obyektQosh(h, 'k1', 'o1', [{ ...BETON, kod: 'Е6-1-1-2' }]);                       // the estimator corrected the code
    const kk = kompaktla(h, null);
    expect(kk).toHaveLength(1);
    expect(kk[0][2].map(k => k[0])).toEqual(['Е6-1-1-2']);
  });
  it('studio confirmations are a per-company stream: they count as lines and companies, never as objects', () => {
    const h = holatBosh();
    studioQosh(h, 'k1', [{ nom: 'Устройство бетонной подготовки', birlik: '100М3', kod: 'Е6-1-1-1' }, { nom: 'Устройство бетонной подготовки', birlik: '100М3', kod: 'Е6-1-1-1' }]);
    const k = kompaktla(h, null)[0][2][0];
    expect(k).toEqual(['Е6-1-1-1', 2, 0, 1]);
  });
});

describe('k-anonymity (global layer)', () => {
  const kodlar = (h: ReturnType<typeof holatBosh>) => kompaktla(h, KANON).flatMap(m => m[2].map(k => k[0]));
  it('a pair is global only with >= 3 objects or >= 2 companies', () => {
    const h = holatBosh();
    obyektQosh(h, 'k1', 'o1', [BETON, SYTKA]);
    obyektQosh(h, 'k1', 'o2', [BETON]);
    expect(kodlar(h)).toEqual([]);                          // 2 objects, 1 company: stays in the company layer
    obyektQosh(h, 'k1', 'o3', [BETON]);
    expect(kodlar(h)).toEqual(['Е6-1-1-1']);                // 3 objects
    const a = holatBosh(), b = holatBosh();
    obyektQosh(a, 'k1', 'o1', [SYTKA]); obyektQosh(b, 'k2', 'o9', [SYTKA]);
    expect(kodlar(holatlarniBirlashtir([a, b]))).toEqual(['Е11-1-11-1']);   // 2 companies
  });
  it('the code chosen by one object under a common wording does not leak: the pair is filtered, not the wording', () => {
    const h = holatBosh();
    for (const o of ['o1', 'o2', 'o3']) obyektQosh(h, 'k1', o, [BETON]);
    obyektQosh(h, 'k1', 'o4', [{ ...BETON, kod: 'Е6-1-1-9' }]);
    expect(kodlar(h)).toEqual(['Е6-1-1-1']);
  });
  it('company layer keeps everything', () => {
    const h = holatBosh(); obyektQosh(h, 'k1', 'o1', [BETON]);
    expect(kompaktla(h, null)).toHaveLength(1);
    expect(kompaktla(h, KANON)).toHaveLength(0);
  });
  it('compact union keeps the stronger count', () => {
    const a = holatBosh(), b = holatBosh();
    obyektQosh(a, 'k1', 'o1', [BETON]); for (const o of ['o1', 'o2', 'o3']) obyektQosh(b, 'k1', o, [BETON]);
    const u = kompaktBirlashtir(kompaktla(a, null), kompaktla(b, null));
    expect(u).toHaveLength(1);
    expect(u[0][2][0].slice(1)).toEqual([3, 3, 1]);
  });
});

function korpus() {
  const h = holatBosh();
  for (const o of ['o1', 'o2', 'o3']) {
    obyektQosh(h, 'k1', o, [
      BETON, SYTKA,
      L('ПРОКЛАДКА ТРУБОПРОВОДОВ ОТОПЛЕНИЯ ДИАМЕТРОМ ДО 50 ММ', 'Е16-4-6-5', '100М', ['ОБЪЕКТ А', 'ОТОПЛЕНИЕ']),
      L('ПРОКЛАДКА ТРУБОПРОВОДОВ ОТОПЛЕНИЯ ДИАМЕТРОМ ДО 63 ММ', 'Е16-4-6-6', '100М', ['ОБЪЕКТ А', 'ОТОПЛЕНИЕ']),
    ]);
  }
  return h;
}

describe('TajribaIndeks (exemplar kNN)', () => {
  const idx = new TajribaIndeks(kompaktla(korpus(), KANON));
  it('finds the code used before for the same wording and says why', () => {
    const r = idx.qidir({ nom: 'Устройство бетонной подготовки', birlik: '100М3' });
    expect(r[0].kod).toBe('Е6-1-1-1');
    expect(r[0].sabab).toBe('ilgari 3 ta smetada shu shifr ishlatilgan');
    expect(r[0].obyekt).toBe(3);
  });
  it('numbers decide between size variants', () => {
    expect(idx.qidir({ nom: 'Прокладка трубопроводов отопления диаметром до 63 мм', birlik: 'м' })[0].kod).toBe('Е16-4-6-6');
    expect(idx.qidir({ nom: 'Прокладка трубопроводов отопления диаметром до 50 мм', birlik: 'м' })[0].kod).toBe('Е16-4-6-5');
  });
  it('a differently worded line (word forms, typos) still reaches the exemplar', () => {
    expect(idx.qidir({ nom: 'устройство бетонная подготовка', birlik: '100м3' })[0]?.kod).toBe('Е6-1-1-1');
  });
  it('unrelated lines return nothing', () => {
    expect(idx.qidir({ nom: 'Монтаж лифта пассажирского', birlik: 'шт' })).toEqual([]);
  });
  it('studio-only evidence is worded differently', () => {
    expect(tajribaSabab(0, 4)).toContain('Studio');
  });
});

describe('uz -> ru pairs', () => {
  // three codes, each used with an Uzbek and a Russian wording -> the word pairs repeat across codes
  const h = holatBosh();
  obyektQosh(h, 'k1', 'o1', [
    L('Бетон тайёрлов қуришда', 'Е6-1-1-1'), L('Устройство бетонной подготовки', 'Е6-1-1-1'),
    L('Бетон пол қуриш', 'Е11-1-1-1'), L('Устройство бетонных полов', 'Е11-1-1-1'),
    L('Бетон девор қуриш', 'Е6-1-2-1'), L('Устройство бетонных стен', 'Е6-1-2-1'),
  ]);
  const kk = kompaktla(h, null);
  it('learns a pair backed by >= 2 codes and nothing from a single code', () => {
    const t = uzRuOrgan(kk);
    expect(t.juftlar.some(([u, r]) => u === 'уриш' && /^устро/.test(r))).toBe(true);   // (the stemmer treats Uzbek-only letters as separators, consistently on both sides)
    const one = holatBosh();
    obyektQosh(one, 'k1', 'o1', [L('Бетон тайёрлов қуришда', 'Е6-1-1-1'), L('Устройство бетонной подготовки', 'Е6-1-1-1')]);
    expect(uzRuOrgan(kompaktla(one, null)).juftlar).toEqual([]);
  });
  it('the alias phrasing carries the Russian word of a learned pair', () => {
    const x = uzRuXarita({ v: 1, juftlar: [['уриш', 'устройство', 3]] });
    expect(uzRuIbora('Бетон девор қуриш', x)).toBe('устройство');
    expect(uzRuIbora('Прокладка', x)).toBe('');
  });
  it('an Uzbek query reaches a Russian exemplar through a learned pair', () => {
    const rus = holatBosh();
    for (const o of ['o1', 'o2', 'o3']) obyektQosh(rus, 'k1', o, [L('Устройство стяжек цементных', 'Е11-1-11-1', '100М2')]);
    const k = kompaktla(rus, null);
    const bez = new TajribaIndeks(k).qidir({ nom: 'Стяжка қуриш цемент', birlik: '100М2' });
    const bilan = new TajribaIndeks(k, { v: 1, juftlar: [['стяжк', 'стяжек', 3], ['уриш', 'устройство', 3]] }).qidir({ nom: 'Стяжка қуриш цемент', birlik: '100М2' });
    expect((bilan[0]?.ball ?? 0)).toBeGreaterThanOrEqual(bez[0]?.ball ?? 0);
    expect(bilan[0]?.kod).toBe('Е11-1-11-1');
  });
});

describe('R2 packing', () => {
  const kk = kompaktla(korpus(), KANON);
  it('round-trips through shards + manifest and is deterministic', async () => {
    const a = await paketla(kk, null, { qatlam: 'global', qurildi: '2026-11-16T00:00:00Z' });
    const b = await paketla(kk, null, { qatlam: 'global', qurildi: '2026-11-16T00:00:00Z' });
    expect(a.manifest.shardlar.map(s => s.sha256)).toEqual(b.manifest.shardlar.map(s => s.sha256));
    const m = manifestOqi(a.fayllar.get('manifest.json.gz')!)!;
    expect(m.misol).toBe(kk.length);
    const r = await paketOch(m, async k => a.fayllar.get(k) ?? null);
    expect(r?.misollar).toHaveLength(kk.length);
  });
  it('a tampered or missing shard yields NO index (never a partial one)', async () => {
    const a = await paketla(kk, null, { qatlam: 'global', qurildi: '2026-11-16T00:00:00Z' });
    const m = manifestOqi(a.fayllar.get('manifest.json.gz')!)!;
    expect(await paketOch(m, async () => new Uint8Array([1, 2, 3]))).toBeNull();
    expect(await paketOch(m, async () => null)).toBeNull();
    expect(manifestOqi(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
