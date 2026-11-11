import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../../api/supabase';
import { jurnalQur, type JurnalHolat } from '../fakt-jurnal';
import { kataAmali } from './kata-klavish';
import { kirishTartibiOl, qatorSumma, varaqMatnniOqi, varaqMatnQur, varaqSatrlari } from './model';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `n${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

function qur(rows: T2Qator[], states: JurnalHolat[]) { return jurnalQur(rows, states); }
const bosh = { yopiqBolim: new Set<number>(), ochiqIsh: new Set<number>(), hosila: new Map<number, number>(), qidiruv: '' };

describe('katak matni: +5 / =40 / 50%', () => {
  it('oqish', () => {
    expect(varaqMatnniOqi('+5')).toEqual({ rejim: '+', qiymat: '5' });
    expect(varaqMatnniOqi('= 40')).toEqual({ rejim: '=', qiymat: '40' });
    expect(varaqMatnniOqi('50%')).toEqual({ rejim: '=', qiymat: '50%' });
    expect(varaqMatnniOqi('7,5')).toEqual({ rejim: '+', qiymat: '7,5' });
    expect(varaqMatnniOqi('  ')).toBeNull();
  });
  it('teskari (round-trip)', () => {
    for (const s of ['+5', '=40', '50%', '+7,5']) expect(varaqMatnQur(varaqMatnniOqi(s)!)).toBe(s);
    expect(varaqMatnQur(undefined)).toBe('');
  });
});

describe('katak klaviatura xaritasi (Fakt jurnali bilan umumiy)', () => {
  const e = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...o });
  it('amallar', () => {
    expect(kataAmali(e('Enter'), false)).toBe('keyingi');
    expect(kataAmali(e('ArrowDown'), false)).toBe('keyingi');
    expect(kataAmali(e('ArrowUp'), false)).toBe('oldingi');
    expect(kataAmali(e('Tab'), false)).toBe('tab+');
    expect(kataAmali(e('Tab', { shiftKey: true }), false)).toBe('tab-');
    expect(kataAmali(e('Escape'), false)).toBe('bekor');
    expect(kataAmali(e('Enter', { ctrlKey: true }), false)).toBe('otkaz');
    expect(kataAmali(e('z', { ctrlKey: true }), false)).toBeNull();
    expect(kataAmali(e('z', { ctrlKey: true }), true)).toBe('orqaga');
    expect(kataAmali(e('b', { metaKey: true }), false)).toBe('bajarilmadi');
  });
});

describe('varaqSatrlari — tekislash va yig‘ish', () => {
  const rows = [
    q({ id: 1, tur: 'rz', nom: 'A' }), q({ id: 2, tur: 'rz', ota_id: 1, nom: 'A1' }),
    q({ id: 10, tur: 'bl', ota_id: 1, nom: 'ish10', hajm: 5 }), q({ id: 11, tur: 'mat', ota_id: 10, nom: 'mat11', hajm: 1 }), q({ id: 12, tur: 'rs', ota_id: 10, nom: 'rs12', hajm: 1 }),
    q({ id: 20, tur: 'bl', ota_id: 2, nom: 'ish20', hajm: 5 }),
    q({ id: 3, tur: 'rz', nom: 'B' }), q({ id: 30, tur: 'bl', ota_id: 3, nom: 'ish30', hajm: 5 }),
  ];
  const states: JurnalHolat[] = rows.filter((r) => r.hajm != null).map((r) => ({ qator_id: r.id, smeta_hajm: r.hajm as number, fakt_hajm: 0 }));
  const m = qur(rows, states);
  const kalitlar = (o: Partial<typeof bosh>) => varaqSatrlari({ ...m, ...bosh, ...o }).map((s) => s.key);

  it('sukut: resurslar yopiq (DOM da yo‘q), bo‘limlar ochiq, daraxt tartibida', () => {
    expect(kalitlar({})).toEqual(['b-1', 'q-10', 'b-2', 'q-20', 'b-3', 'q-30']);
  });
  it('ish ochilsa — resurslar (kiritiladigan mat, avto rs) ko‘rinadi', () => {
    const s = varaqSatrlari({ ...m, ...bosh, ochiqIsh: new Set([10]) });
    expect(s.map((x) => x.key)).toEqual(['b-1', 'q-10', 'q-11', 'q-12', 'b-2', 'q-20', 'b-3', 'q-30']);
    const r = s.filter((x) => x.tur === 'resurs');
    expect(r.map((x) => (x.tur === 'resurs' ? x.avto : null))).toEqual([false, true]);
    expect(kirishTartibiOl(s)).toEqual([10, 11, 20, 30]); // avto resurs kiritilmaydi
  });
  it('yopiq bo‘lim — o‘zi va ichki bo‘limlari ro‘yxatda yo‘q', () => {
    expect(kalitlar({ yopiqBolim: new Set([1]) })).toEqual(['b-1', 'b-3', 'q-30']);
  });
  it('hosila (tuzatish) qator tahrir qilinmaydi', () => {
    const s = varaqSatrlari({ ...m, ...bosh, hosila: new Map([[20, 10]]) });
    expect(kirishTartibiOl(s)).toEqual([10, 30]);
  });
  it('qidiruv: yig‘ishga qaramay mos ishlar ko‘rinadi; lotin/kirill farqsiz', () => {
    expect(kalitlar({ qidiruv: 'ISH20', yopiqBolim: new Set([1, 2]) })).toEqual(['b-2', 'q-20']);
  });
});

describe('qatorSumma — NULL ≠ 0', () => {
  it('ish: resurslar yig‘indisi; hammasi NULL — NULL', () => {
    const rows = [q({ id: 1, tur: 'rz' }), q({ id: 10, tur: 'bl', ota_id: 1, hajm: 1 }), q({ id: 11, tur: 'mat', ota_id: 10, hajm: 1, kat: 'МАТ' }), q({ id: 12, tur: 'mat', ota_id: 10, hajm: 1, kat: 'МАТ' })];
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const mk = (a: number | null, b: number | null) => new Map<number, JurnalHolat>([
      [11, { qator_id: 11, smeta_hajm: 1, fakt_hajm: 0, smeta_summa: a }], [12, { qator_id: 12, smeta_hajm: 1, fakt_hajm: 0, smeta_summa: b }],
    ]);
    const ish = (h: Map<number, JurnalHolat>) => jurnalQur(rows, [...h.values()]).bolimIshlari.get(1)![0];
    expect(qatorSumma(ish(mk(100, 50)), mk(100, 50), rowById).ustamasiz).toBe(150);
    expect(qatorSumma(ish(mk(100, null)), mk(100, null), rowById).ustamasiz).toBe(100); // noma'lum qator 0 deb olinmaydi, qolgani sanaladi
    expect(qatorSumma(ish(mk(null, null)), mk(null, null), rowById).ustamasiz).toBeNull();
  });
});

describe('o‘lchov: 26 000 qatorli obyekt (sintetik)', () => {
  it('jurnal modeli + tekislash — ochilish ostonasidan ancha past', () => {
    const rows: T2Qator[] = []; const states: JurnalHolat[] = [];
    let id = 1;
    for (let b = 0; b < 100; b++) {
      const bid = id++; rows.push(q({ id: bid, tur: 'rz', nom: `B${b}` }));
      for (let i = 0; i < 40; i++) {
        const iid = id++; rows.push(q({ id: iid, tur: 'bl', ota_id: bid, nom: `I${iid}`, hajm: 10 })); states.push({ qator_id: iid, smeta_hajm: 10, fakt_hajm: 1 });
        for (let r = 0; r < 5; r++) { const rid = id++; rows.push(q({ id: rid, tur: r % 2 ? 'mat' : 'rs', ota_id: iid, nom: `R${rid}`, hajm: 1 })); states.push({ qator_id: rid, smeta_hajm: 1, fakt_hajm: 0 }); }
      }
    }
    expect(rows.length).toBeGreaterThan(20000);
    const t0 = performance.now();
    const model = jurnalQur(rows, states);
    const t1 = performance.now();
    const satrlar = varaqSatrlari({ ...model, ...bosh });
    const t2 = performance.now();
    // eslint-disable-next-line no-console
    console.info(`[ish-varaq perf] ${rows.length} qator: jurnalQur ${(t1 - t0).toFixed(0)} ms, tekislash ${(t2 - t1).toFixed(1)} ms, satrlar ${satrlar.length}`);
    expect(satrlar.length).toBe(100 + 4000); // faqat bo'lim sarlavhalari va ishlar; resurslar yopiq
    expect(t2 - t1).toBeLessThan(500);
    // yig'ilgan hamma bo'lim — ro'yxat deyarli bo'sh (DOM/virtualizatorga kirmaydi)
    const yopiq = varaqSatrlari({ ...model, ...bosh, yopiqBolim: new Set(model.bolimlar.map((b) => b.id)) });
    expect(yopiq.length).toBe(100);
  });
});
