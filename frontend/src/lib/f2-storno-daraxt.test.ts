import { describe, expect, it } from 'vitest';
import { stornoBelgiHolat, stornoBlokHolati, stornoBlokQur, stornoBolinganIshlar, stornoDaraxtQur, stornoJamlar, stornoQidir, stornoTugunAlmashtir, stornoUmumiy } from './f2-storno-daraxt';
import type { StornoDaraxtTugun, StornoManbaQator } from './f2-storno';

const kalit = (a: number, q: number) => `${a}:${q}`;
/* Sintetik smeta: A (yer ishlari) → ish 1 (rs 2, rs 3); B → B1 (ichki) → ish 4 (o'z summasi yo'q, rs 5); B → mat 6 (narxsiz). */
const daraxt: StornoDaraxtTugun[] = [
  { id: 100, ota_id: null, tur: 'rz', nom: 'Bo‘lim A', tartib: 1 },
  { id: 1, ota_id: 100, tur: 'bl', tartib: 2 }, { id: 2, ota_id: 1, tur: 'rs', tartib: 3 }, { id: 3, ota_id: 1, tur: 'rs', tartib: 4 },
  { id: 200, ota_id: null, tur: 'rz', nom: 'Bo‘lim B', tartib: 5 },
  { id: 210, ota_id: 200, tur: 'rz', nom: 'Bo‘lim B1', tartib: 6 },
  { id: 4, ota_id: 210, tur: 'bl', tartib: 7 }, { id: 5, ota_id: 4, tur: 'rs', tartib: 8 },
  { id: 6, ota_id: 200, tur: 'mat', tartib: 9 },
];
const q = (id: number, summa: number | null, hajm = 1): StornoManbaQator => ({ qator_id: id, certified_quantity: hajm, certified_unit_price: summa == null ? null : summa, certified_amount: summa });
// Akt tartibi smeta tartibidan farq qiladi — daraxt smeta tartibida bo'lishi kerak.
const manba = [q(6, null), q(5, 30), q(4, null), q(3, 20), q(2, 10), q(1, 5)];
const nomlar = new Map([[1, { kod: 'E1', nom: 'Qazish' }], [2, { nom: 'Mehnat' }], [3, { nom: 'Ekskavator' }], [4, { kod: 'F1', nom: 'Beton quyish' }], [5, { nom: 'Beton' }], [6, { nom: 'Armatura' }]]);
const qur = (d: StornoDaraxtTugun[] | null = daraxt) => stornoDaraxtQur({ bloklar: [{ aktId: 7, aktNom: '5', qatorlar: manba }], daraxt: d, nomlar, kalit });
const hammasi = (t: ReturnType<typeof qur>) => new Set(t.ildiz.flatMap((n) => n.barglar));

describe('stornoDaraxtQur', () => {
  it('bo‘lim → ichki bo‘lim → ish → resurs, smeta tartibida', () => {
    const t = qur();
    expect(t.ildiz.map((n) => [n.k, n.nom])).toEqual([['bolim', 'Bo‘lim A'], ['bolim', 'Bo‘lim B']]);
    const [a, b] = t.ildiz;
    expect(a.bolalar.map((n) => [n.k, n.q?.qatorId])).toEqual([['ish', 1]]);
    expect(a.bolalar[0].bolalar.map((n) => n.q?.qatorId)).toEqual([2, 3]);
    expect(b.bolalar.map((n) => [n.k, n.nom])).toEqual([['bolim', 'Bo‘lim B1'], ['qator', 'Armatura']]);
    expect(b.bolalar[0].bolalar[0].bolalar.map((n) => n.q?.qatorId)).toEqual([5]);
    expect(a.barglar.sort()).toEqual(['7:1', '7:2', '7:3']);
  });
  it('smeta daraxti yo‘q — yassi ro‘yxat, hech bir qator yo‘qolmaydi', () => {
    const t = qur(null);
    expect(t.ildiz.every((n) => n.k === 'qator')).toBe(true);
    expect(hammasi(t).size).toBe(6);
  });
});

describe('stornoJamlar: tri-state va pul', () => {
  it('«bitta bo‘limni qoldirish»: bo‘lim belgisini bir bosish — qolgan hammasi stornoda', () => {
    const t = qur();
    let tan: Set<string> = hammasi(t);
    const a = t.ildiz[0];
    tan = stornoTugunAlmashtir(a, stornoJamlar(t.ildiz, tan).get(a.id), tan);
    expect([...tan].sort()).toEqual(['7:4', '7:5', '7:6']);
    const jam = stornoJamlar(t.ildiz, tan);
    expect(stornoBelgiHolat(jam.get(a.id))).toBe('yoq');
    expect(stornoBelgiHolat(jam.get(t.ildiz[1].id))).toBe('bor');
    const u = stornoUmumiy(t.ildiz, jam);
    expect([u.soni, u.jami, u.qolganSoni, u.qolganJami]).toEqual([3, -30, 3, -35]);
  });
  it('NULL ≠ 0: resurslari bor ishning bo‘sh summasi noma‘lum emas; narxsiz material — noma‘lum', () => {
    const t = qur();
    const jam = stornoJamlar(t.ildiz, hammasi(t));
    const b = t.ildiz[1];
    expect(jam.get(b.bolalar[0].id)).toMatchObject({ jami: -30, nomalum: 0 });
    expect(jam.get(b.id)).toMatchObject({ jami: -30, nomalum: 1 });
  });
  it('ishdan bitta resursni olish — qisman holat va «bo‘lingan ish» ogohlantirishi', () => {
    const t = qur();
    const tan = hammasi(t); tan.delete('7:3');
    const jam = stornoJamlar(t.ildiz, tan);
    const ish = t.ildiz[0].bolalar[0];
    expect(stornoBelgiHolat(jam.get(ish.id))).toBe('qisman');
    expect(stornoBelgiHolat(jam.get(t.ildiz[0].id))).toBe('qisman');
    expect(stornoBolinganIshlar(t.byId, jam).map((x) => x.q?.qatorId)).toEqual([1]);
    // Qisman ishni bosish — hammasi belgilanadi; to'liqni bosish — ish resurslari bilan olinadi.
    const n = stornoTugunAlmashtir(ish, jam.get(ish.id), tan);
    expect(n.has('7:3')).toBe(true);
    const n2 = stornoTugunAlmashtir(ish, stornoJamlar(t.ildiz, n).get(ish.id), n);
    expect(['7:1', '7:2', '7:3'].some((k) => n2.has(k))).toBe(false);
  });
});

describe('stornoQidir', () => {
  it('mos qator ajdodlari ko‘rinadi va ochiladi', () => {
    const t = qur();
    const r = stornoQidir(t.ildiz, t.byId, 'beton')!;
    const ish = t.ildiz[1].bolalar[0].bolalar[0];
    expect(r.korinadi.has(ish.id)).toBe(true);
    expect(r.ochiq.has(t.ildiz[1].id) && r.ochiq.has(t.ildiz[1].bolalar[0].id)).toBe(true);
    expect(r.korinadi.has(t.ildiz[0].id)).toBe(false);
    expect(stornoQidir(t.ildiz, t.byId, '  ')).toBeNull();
  });
});

describe('katta akt (4000 qator)', () => {
  it('daraxt va yig‘indilar tez quriladi', () => {
    const d: StornoDaraxtTugun[] = []; const m: StornoManbaQator[] = [];
    let id = 1;
    for (let r = 0; r < 40; r++) {
      const rz = 100000 + r; d.push({ id: rz, ota_id: null, tur: 'rz', nom: `R${r}`, tartib: id++ });
      for (let w = 0; w < 25; w++) {
        const bl = id++; d.push({ id: bl, ota_id: rz, tur: 'bl', tartib: bl }); m.push(q(bl, null));
        for (let k = 0; k < 3; k++) { const rs = id++; d.push({ id: rs, ota_id: bl, tur: 'rs', tartib: rs }); m.push(q(rs, 1)); }
      }
    }
    const t0 = performance.now();
    const t = stornoDaraxtQur({ bloklar: [{ aktId: 1, aktNom: '1', qatorlar: m }], daraxt: d, nomlar: new Map(), kalit });
    const tan = hammasi(t);
    for (let i = 0; i < 5; i++) stornoJamlar(t.ildiz, tan);
    expect(tan.size).toBe(4000);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
describe('stornoBlokQur — qoralamadagi storno blokini tahrirlash', () => {
  const manba = [{ aktId: 7, qatorlar: [q(1, 50, 5), q(2, 30, 3), q(3, null, 2)] }];
  const saqlangan = [
    { qator_id: 1, hajm: -5, certified_quantity: -5, certified_unit_price: 10, certified_amount: -50, provenance_status: null, raw_snapshot: { source: 'storno', stornoOf: 7, belgi: 'asl' } },
    { qator_id: 2, hajm: -3, certified_quantity: -3, certified_unit_price: 10, certified_amount: -30, provenance_status: null, raw_snapshot: { source: 'storno', stornoOf: 7 } },
    { qator_id: 9, hajm: -1, certified_quantity: -1, certified_unit_price: 1, certified_amount: -1, provenance_status: null, raw_snapshot: { source: 'storno', stornoOf: 8 } },
  ];
  it('holat: saqlangan storno qatorlaridan tanlov va mutlaq hajm', () => {
    const h = stornoBlokHolati(saqlangan, kalit);
    expect([...h.tanlangan]).toEqual(['7:1', '7:2', '8:9']);
    expect(h.hajm.get('7:1')).toBe(5);
    expect(h.manbaAktlar).toEqual([7, 8]);
  });
  it('o‘zgarmagan qator aynan qoladi; olingan qator chiqadi; qayta qo‘shilgani eski F2 qiymatida; manbasi o‘qilmagani yo‘qolmaydi', () => {
    const r = stornoBlokQur(manba, new Set(['7:1', '7:3']), new Map([['7:1', 5]]), saqlangan, kalit);
    expect(r.qatorlar.map((x) => x.qator_id)).toEqual([1, 3, 9]);
    expect(r.qatorlar[0]).toBe(saqlangan[0]);
    expect(r.qatorlar[1]).toMatchObject({ certified_quantity: -2, certified_amount: null, provenance_status: 'price_intentionally_absent' });
    expect(r.qatorlar[2]).toBe(saqlangan[2]);
  });
  it('qisman hajm: summa yadro qatorSumma(−h, narx); |h| eski hajmdan oshmaydi', () => {
    const r = stornoBlokQur(manba, new Set(['7:1', '7:2']), new Map([['7:1', 2], ['7:2', 99]]), saqlangan, kalit);
    expect(r.qisman).toBe(1);
    expect(r.qatorlar[0]).toMatchObject({ certified_quantity: -2, certified_unit_price: 50, certified_amount: -100 });
    expect((r.qatorlar[0].raw_snapshot as Record<string, unknown>).stornoAslHajm).toBe(-5);
    expect(r.qatorlar[1]).toBe(saqlangan[1]);
  });
  it('bir qator ikki eski F2 da — hujjatda bitta storno qatori (toqnashdi)', () => {
    const r = stornoBlokQur([{ aktId: 7, qatorlar: [q(1, 5)] }, { aktId: 8, qatorlar: [q(1, 5)] }], new Set(['7:1', '8:1']), new Map(), [], kalit);
    expect([r.qatorlar.length, r.toqnashdi]).toEqual([1, 1]);
  });
});

describe('M1: ish (bl) va mashinist mehnati «summa noma‘lum» emas', () => {
  it('resurssiz bl ham noma‘lum sanalmaydi', () => {
    const t = stornoDaraxtQur({ bloklar: [{ aktId: 1, aktNom: '1', qatorlar: [q(1, null)] }], daraxt: [{ id: 1, ota_id: null, tur: 'bl', tartib: 1 }], nomlar: new Map(), kalit });
    expect(stornoUmumiy(t.ildiz, stornoJamlar(t.ildiz, hammasi(t))).nomalum).toBe(0);
  });
});