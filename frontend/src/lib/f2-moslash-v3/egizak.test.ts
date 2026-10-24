import { describe, expect, it } from 'vitest';
import { aslImzo, aslXarita, boglanishKochir, egizakOpId, egizakQoshimchaYoz, f2Mosligi, idXarita, qoshimchaReja, type EgizakQator } from './egizak';
import { BOLIM_ILDIZ, type RejaliYaratish, type YozilganQator } from './rejali';
import type { F2Indeks, IshJoyi } from './ishJoyi';
import type { F2Tugun } from '../smeta-anatomiya/f2';

const q = (id: number, ota: number | null, tur: string, nom: string, x: Partial<EgizakQator> = {}): EgizakQator =>
  ({ id, ota_id: ota, daraja: 0, tartib: id, tur, kod: null, nom, birlik: tur === 'rz' ? null : 'М3', hajm: tur === 'rz' ? null : 1, qoshimcha: false, ...x });

/** Asl smeta (A: 1..6, B: 101..106 — tuzilma bir xil). */
const asl = (d: number) => [
  q(1 + d, null, 'rz', 'Bo‘lim 1', { tartib: 1 }),
  q(2 + d, 1 + d, 'bl', 'Ish 1', { daraja: 1, tartib: 2, kod: 'E1', hajm: 10 }),
  q(3 + d, 2 + d, 'rs', 'Mehnat', { daraja: 2, tartib: 2, birlik: 'ЧЕЛ-Ч', hajm: 5 }),
  q(4 + d, 1 + d, 'mat', 'Beton', { daraja: 1, tartib: 4, hajm: 7 }),
  q(5 + d, null, 'rz', 'Bo‘lim 2', { tartib: 5 }),
  q(6 + d, 5 + d, 'bl', 'Ish 2', { daraja: 1, tartib: 6, hajm: 3 }),
];
const Q = { qoshimcha: true };
/** A da egasi qo'shgan qatorlar (yaratilish tartibi — id). */
const qoshA: EgizakQator[] = [
  q(20, null, 'rz', 'Yer ishlari', { ...Q, tartib: 4 }),
  q(21, 20, 'bl', 'Qazish', { ...Q, tartib: 7, hajm: 2 }),
  q(22, 21, 'rs', 'Mehnat', { ...Q, tartib: 7, birlik: 'ЧЕЛ-Ч', hajm: 4 }),
  q(23, 21, 'mat', 'Shag‘al', { ...Q, tartib: 7, hajm: 9 }),
  q(24, 1, 'bl', 'Ish 1 (zamena)', { ...Q, tartib: 8, hajm: 11, replaces_line_id: 2 }),
  q(25, 24, 'rs', 'Mehnat', { ...Q, tartib: 8, birlik: 'ЧЕЛ-Ч', hajm: 6 }),
  q(26, 1, 'mat', 'Beton B25', { ...Q, tartib: 4, hajm: 7, replaces_line_id: 4 }),
  q(27, 2, 'rs', 'Kran', { ...Q, tartib: 2, birlik: 'МАШ-Ч', hajm: 0.5 }),
  q(28, 5, 'mat', 'Armatura', { ...Q, tartib: 9, birlik: 'Т', hajm: 0.3 }),
  q(29, 1, 'bl', 'Qo‘shimcha A', { ...Q, tartib: 10, hajm: 1 }),
  q(30, 1, 'bl', 'Qo‘shimcha B', { ...Q, tartib: 10, hajm: 1 }),
  q(31, 2, 'rs', 'Noma’lum zamena', { ...Q, tartib: 2, hajm: 1, replaces_line_id: 999 }),
];
const A = [...asl(0), ...qoshA];
const B = asl(100);

async function oplar(rows: EgizakQator[], b: number) {
  return new Map(await Promise.all(rows.filter((x) => x.qoshimcha).map(async (x) => [x.id, await egizakOpId(x.id, b)] as const)));
}

describe('egizak: asl smeta xaritasi', () => {
  it('tuzilma bir xil — o‘rni bo‘yicha xarita, imzolar teng', () => {
    const x = aslXarita(A, B);
    expect(x.ok).toBe(true);
    if (!x.ok) return;
    expect([...x.map]).toEqual([[1, 101], [2, 102], [3, 103], [4, 104], [5, 105], [6, 106]]);
    expect(aslImzo(A)).toBe(aslImzo(B));
  });
  it('bitta hajm farq qilsa — rad (farq ko‘rsatiladi)', () => {
    const B2 = B.map((r) => (r.id === 104 ? { ...r, hajm: 7.5 } : r));
    const x = aslXarita(A, B2);
    expect(x.ok).toBe(false);
    if (x.ok) return;
    expect(x.farqlar).toEqual([{ orin: 4, aId: 4, bId: 104, maydon: 'hajm' }]);
    expect(x.imzoA).not.toBe(x.imzoB);
  });
  it('qatorlar soni farq qilsa — rad', () => {
    const x = aslXarita(A, B.slice(0, 5));
    expect(x.ok).toBe(false);
    if (!x.ok) expect(x.farqlar[0].maydon).toBe('soni');
  });
  it('ota tuzilmasi boshqa bo‘lsa — rad', () => {
    const B2 = B.map((r) => (r.id === 104 ? { ...r, ota_id: 105 } : r));
    const x = aslXarita(A, B2);
    expect(x.ok).toBe(false);
    if (!x.ok) expect(x.farqlar.map((f) => f.maydon)).toEqual(['ota']);
  });
  it('float shovqini farq emas', () => {
    const B2 = B.map((r) => (r.id === 103 ? { ...r, hajm: '5.0000000000001' } : r));
    expect(aslXarita(A, B2).ok).toBe(true);
  });
});

describe('egizak: deterministik operation_id', () => {
  it('bir xil kirish — bir xil UUID; boshqa obyekt — boshqa', async () => {
    const a = await egizakOpId(21, 164), b = await egizakOpId(21, 164), c = await egizakOpId(21, 165);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('egizak: qo‘shimcha/zamena rejasi', () => {
  it('ierarxiya: bo‘lim avval, ish resurslari bilan birga, zamena almashtirilgandan keyin, ko‘chmaganlar ro‘yxatda', async () => {
    const x = aslXarita(A, B);
    if (!x.ok) throw new Error('xarita');
    const r = qoshimchaReja(A, x.map, await oplar(A, 164), 'egizak');
    const k = r.buyruqlar.map((b) => [b.tempId, b.kind, b.tur, b.otaQatorId, b.almashtirilayotganQatorId ?? null, b.keyinQatorId ?? null, b.resursTempIds]);
    expect(k).toEqual([
      [-20, 'bolim', 'rz', BOLIM_ILDIZ, null, 101, []],
      [-21, 'additional', 'bl', -20, null, null, [-22, -23]],
      [-24, 'replacement', 'bl', 101, 102, 102, [-25]],
      [-26, 'replacement', 'mat', 101, 104, 104, []],
      [-27, 'resource', 'rs', 102, null, 103, []],
      [-28, 'additional', 'mat', 105, null, null, []],
      [-29, 'additional', 'bl', 101, null, null, []],
      [-30, 'additional', 'bl', 101, null, -29, []],
    ]);
    expect(r.buyruqlar[1].resurslar).toEqual([
      { tur: 'rs', nom: 'Mehnat', birlik: 'ЧЕЛ-Ч', hajm: 4, kod: null },
      { tur: 'mat', nom: 'Shag‘al', birlik: 'М3', hajm: 9, kod: null },
    ]);
    expect(r.kochmadi).toEqual([{ id: 31, nom: 'Noma’lum zamena', sabab: 'almashtirilgan' }]);
    expect([r.qatorSoni, r.qoshimchaSoni, r.zamenaSoni, r.bolimSoni]).toEqual([11, 5, 2, 1]);
    expect(new Set(r.buyruqlar.map((b) => b.operationId)).size).toBe(r.buyruqlar.length);
  });
  it('ota ko‘chmasa — bolalari ham ko‘chmaydi', async () => {
    const A2 = [...asl(0), q(40, 999, 'bl', 'Yetim', { ...Q, hajm: 1 }), q(41, 40, 'rs', 'R', { ...Q, hajm: 1 })];
    const x = aslXarita(A2, B);
    if (!x.ok) throw new Error('xarita');
    const r = qoshimchaReja(A2, x.map, await oplar(A2, 164), 's');
    expect(r.buyruqlar).toEqual([]);
    expect(r.kochmadi.map((k) => [k.id, k.sabab])).toEqual([[40, 'ota'], [41, 'ota']]);
  });
});

/** Soxta server: buyruqlarni yaratadi, operation_id ni qatorga yozadi (ish_resurslar_bilan_yarat kabi resurslar ota ostida). */
function soxtaServer(boshId = 1000) {
  const qatorlar: YozilganQator[] = [];
  const chaqiruv: string[] = [];
  let id = boshId;
  const yarat: RejaliYaratish = async (b, real) => {
    if (b.kind !== 'bolim' && real.otaQatorId < 0) throw new Error('ota hali yozilmagan');
    chaqiruv.push(`${b.kind}:${b.nom}`);
    const qid = ++id;
    qatorlar.push({ id: qid, ota_id: real.otaQatorId === BOLIM_ILDIZ ? null : real.otaQatorId, operation_id: b.kind === 'bolim' ? null : b.operationId, tur: b.tur, nom: b.nom, tartib: qid });
    const resursIdlar = b.resurslar.map((r, i) => { const rid = ++id; qatorlar.push({ id: rid, ota_id: qid, operation_id: `${b.operationId.slice(0, 30)}${i}`, tur: r.tur, nom: r.nom, tartib: i }); return rid; });
    return { qatorId: qid, resursIdlar };
  };
  return { qatorlar, chaqiruv, yarat, versiya: async () => 1 };
}

describe('egizak: yozish (ayni rejali yo‘li) va idempotentlik', () => {
  it('ikkinchi marta ishga tushirilsa hech narsa qayta yaratilmaydi, xarita bir xil', async () => {
    const x = aslXarita(A, B);
    if (!x.ok) throw new Error('xarita');
    const reja = qoshimchaReja(A, x.map, await oplar(A, 164), 'egizak');
    const s = soxtaServer();
    const r1 = await egizakQoshimchaYoz(reja, s.qatorlar, s);
    expect(r1.xato).toBeUndefined();
    expect([r1.yozildi, r1.oldin]).toEqual([8, 0]);
    expect(s.chaqiruv[0]).toBe('bolim:Yer ishlari');
    const soni = s.qatorlar.length;
    expect(soni).toBe(11);
    const r2 = await egizakQoshimchaYoz(reja, [...s.qatorlar], s);
    expect([r2.yozildi, r2.oldin]).toEqual([0, 8]);
    expect(s.qatorlar.length).toBe(soni);
    expect([...r2.map].sort()).toEqual([...r1.map].sort());
    // A qo'shimcha → B haqiqiy qator (resurslar ham)
    const ix = idXarita(x.map, r1.map);
    expect(ix(22)).toBe(s.qatorlar.find((z) => z.nom === 'Mehnat' && z.ota_id === ix(21))?.id);
    expect(ix(2)).toBe(102);
  });
  it('yarim yo‘lda to‘xtasa — qayta urinishda faqat qolgani yoziladi', async () => {
    const x = aslXarita(A, B);
    if (!x.ok) throw new Error('xarita');
    const reja = qoshimchaReja(A, x.map, await oplar(A, 164), 'egizak');
    const s = soxtaServer();
    let n = 0;
    const r1 = await egizakQoshimchaYoz(reja, s.qatorlar, { ...s, yarat: async (b, real) => { if (++n === 4) throw new Error('tarmoq'); return s.yarat(b, real); } });
    expect(r1.xato).toMatch(/tarmoq/);
    expect(r1.yozildi).toBe(3);
    const r2 = await egizakQoshimchaYoz(reja, [...s.qatorlar], s);
    expect([r2.yozildi, r2.oldin, r2.xato]).toEqual([5, 3, undefined]);
    expect(s.qatorlar.filter((z) => z.nom === 'Yer ishlari').length).toBe(1);
  });
});

const tugun = (uid: string, kod: string | null, hajm: number): F2Tugun => ({ uid, kod, hajm, nom: uid, birlik: 'М3', tur: 'bl', bolalar: [] } as unknown as F2Tugun);
const ind = (t: F2Tugun[]): F2Indeks => ({ byUid: new Map(t.map((x) => [x.uid, x])), ota: new Map(t.map((x) => [x.uid, null])), qatorlar: t });

describe('egizak: F2 mosligi va bog‘lanish nusxasi', () => {
  const bInd = ind([tugun('u1', 'E1', 10), tugun('u2', null, 2), tugun('u3', null, 1), tugun('u4', null, 3)]);
  it('uid/kod/hajm bir xil — mos; farq bo‘lsa — farqlar', () => {
    const m = [{ uid: 'u1', kod: 'E1', hajm: 10 }, { uid: 'u2', kod: null, hajm: 2 }, { uid: 'u3', hajm: 1 }, { uid: 'u4', hajm: 3 }];
    expect(f2Mosligi(m, bInd).ok).toBe(true);
    const f = f2Mosligi(m.map((r) => (r.uid === 'u2' ? { ...r, hajm: 2.5 } : r)), bInd);
    expect(f).toEqual({ ok: false, farqlar: ['u2'] });
  });
  it('bog‘lanishlar xaritalanadi (asl + qo‘shimcha + taqsim); xaritasizi ro‘yxatda; otkaz ko‘chadi', () => {
    const a: IshJoyi = {
      bog: new Map([
        ['u1', { qatorId: 2, holat: 'aniq', usul: 'kod' }],
        ['u2', { qatorId: 21, holat: 'qolda', usul: 'qolda' }],
        ['u3', { qatorId: 4, holat: 'qolda', usul: 'taqsim', taqsim: [{ qatorId: 4, hajm: 0.5 }, { qatorId: 26, hajm: 0.5 }] }],
        ['u9', { qatorId: 2, holat: 'qolda', usul: 'qolda' }],
      ] as never),
      otkaz: new Set(['u4']),
    };
    const ix = idXarita(new Map([[2, 102], [4, 104]]), new Map([[-21, 5021], [-26, 5026]]));
    const r = boglanishKochir(a, bInd, ix);
    expect([...r.ij.bog]).toEqual([
      ['u1', { qatorId: 102, holat: 'aniq', usul: 'kod' }],
      ['u2', { qatorId: 5021, holat: 'qolda', usul: 'qolda' }],
      ['u3', { qatorId: 104, holat: 'qolda', usul: 'taqsim', taqsim: [{ qatorId: 104, hajm: 0.5 }, { qatorId: 5026, hajm: 0.5 }] }],
    ]);
    expect(r.kochmadi).toEqual(['u9']);
    expect([...r.ij.otkaz]).toEqual(['u4']);
    // qo'shimchalar hali yozilmagan bo'lsa — ularga bog'lanish ko'chmaydi
    const r2 = boglanishKochir(a, bInd, idXarita(new Map([[2, 102], [4, 104]]), new Map()));
    expect(r2.kochmadi).toEqual(['u2', 'u3', 'u9']);
  });
});
