import { describe, expect, it } from 'vitest';
import { filtrla, noyobQiymatlar } from '../../umumiy/jadval-filtr/ustunFiltr';
import type { F2Bolim, F2Ish, F2Resurs } from '../../lib/f2-tayyor';
import type { ReestrAkt, ReestrQator, Summa } from '../../lib/f2-reestr/reestr';
import { aktManbaMatni, aktUstunlar, f2ElementUstunlar, f2Elementlar, f2QaytaQur, f2ResursUstunlar, ishSummasi, reestrHolatMatni, reestrUstunlar, shartnomaMatni } from './F2JadvalFiltr';

const S = (malum: number, soni: number, nomalum = 0): Summa => ({ malum, nomalum, soni });
const bos = S(0, 0);
const qator = (id: number, nom: string, p: Partial<ReestrQator> = {}): ReestrQator => ({
  obyekt: { id, nom, loyiha_id: null, jami: 1000, narxsiz: null }, loyiha: null, shartnomalar: [], aktlar: [],
  boyicha: { tasdiqlangan: bos, jarayonda: bos, rad: bos, bekor: bos }, tasdiqImport: bos, tasdiqTizim: bos, oxirgiOy: null, ogohlar: [], ...p,
});

describe('F2 reestri ustunlari', () => {
  const rows = [
    qator(1, 'Maktab', { boyicha: { tasdiqlangan: S(500, 2), jarayonda: S(10, 1), rad: bos, bekor: S(0, 1) }, shartnomalar: [{ id: 1, raqam: '7', nom: 'Asosiy', jami_nds_bilan: null, summa_bez_nds: null }] }),
    qator(2, 'Bog‘cha'),
    qator(3, 'Shifoxona', { boyicha: { tasdiqlangan: S(250, 1), jarayonda: bos, rad: bos, bekor: bos } }),
  ];
  const u = reestrUstunlar((q) => q.obyekt.jami);
  it('katakdagi qiymatlar: holat so‘zlari, shartnoma, akt yo‘q — bo‘sh', () => {
    expect(reestrHolatMatni(rows[0])).toContain(', ');
    expect(reestrHolatMatni(rows[1])).toBeNull();
    expect(shartnomaMatni(rows[0])).toBe('№ 7 · Asosiy');
    expect(shartnomaMatni(rows[1])).toBeNull();
    expect(u.find((x) => x.kalit === 'tasdiq')!.qiymat(rows[1])).toBeNull();
    expect(u.find((x) => x.kalit === 'nisbat')!.qiymat(rows[0])).toBe(50);
  });
  it('son sharti va saralash (tekis jadval)', () => {
    const n = filtrla(rows, u, { tasdiq: { son: { amal: '>=', a: 250 } } }, { kalit: 'tasdiq', yonalish: 'kamayish' });
    expect(n.map((q) => q.obyekt.id)).toEqual([1, 3]);
  });
  it('NULL ≠ 0: F2 si yo‘q obyekt «(bo‘sh)» qiymatida', () => {
    const v = noyobQiymatlar(rows, u, u.find((x) => x.kalit === 'tasdiq')!, {});
    expect(v.map((x) => x.soni)).toEqual([1, 1, 1]);
    expect(v[v.length - 1].v).toBeNull();
  });
});

describe('akt ustunlari', () => {
  const akt = (id: number, p: Partial<ReestrAkt>): ReestrAkt => ({ id, obyekt_id: 1, oy: '2026-09-01', raqam: String(id), holat: 'tasdiqlangan', hujjat_jami: 100, farq: null, qator_soni: 3, narxsiz_qator: 0, manba: 'tizim', ...p });
  it('manba matni katakdagi kabi; filtr ishlaydi', () => {
    const a = [akt(1, {}), akt(2, { manba: 'import', hujjat_id: 9 }), akt(3, { manba: null, hujjat_jami: null })];
    const fayl = (x: ReestrAkt) => (x.hujjat_id === 9 ? 'f2.xlsx' : null);
    expect(aktManbaMatni(a[1], 'f2.xlsx')).toContain('f2.xlsx');
    const u = aktUstunlar(fayl);
    expect(filtrla(a, u, { summa: { tanlangan: ['\u0000bo‘sh'] } }).map((x) => x.id)).toEqual([3]);
    expect(filtrla(a, u, { manba: { matn: { amal: 'ichida', q: 'f2.xlsx' } } }).map((x) => x.id)).toEqual([2]);
  });
});

describe('F2 tayyorlash ro‘yxati', () => {
  const res = (id: number, nom: string, p: Partial<F2Resurs> = {}): F2Resurs => ({ id, tur: 'mat', kat: null, kod: null, nom, birlik: 'm3', norma: null, mumkin: 1, avto: false, taklifNarx: 10, taklifManba: 'smeta', ...p });
  const ish = (id: number, nom: string, resurslar: F2Resurs[] = [], p: Partial<F2Ish> = {}): F2Ish => ({ id, kod: 'E' + id, nom, birlik: 'm3', mumkin: 5, smeta: 10, olingan: 0, resurslar, ...p });
  const bolimlar: F2Bolim[] = [
    { id: 1, nom: 'Poydevor', daraja: 0, ishlar: [ish(10, 'Beton quyish', [res(100, 'Beton')]), ish(11, 'Armatura', [], { mumkin: 2 })], alohida: [res(12, 'Qum')] },
    { id: 2, nom: 'Devor', daraja: 0, ishlar: [ish(20, 'G‘isht terish', [], { mumkin: 9 })], alohida: [] },
  ];
  const summa = new Map([[100, 40]]);
  const ktx = { hajm: (id: number) => (id === 10 ? 3 : null), summa: (id: number) => summa.get(id) ?? null, holat: (id: number) => (id === 10 ? 'Kiritilgan' : 'Kiritilmagan'), narx: (r: F2Resurs) => r.taklifNarx };
  const u = f2ElementUstunlar(ktx);
  const el = f2Elementlar(bolimlar);
  it('ish va alohida materiallar bitta ro‘yxatda, bo‘lim nomi bilan', () => {
    expect(el.map((e) => e.kalit)).toEqual(['i10', 'i11', 'r12', 'i20']);
    expect(el[3].bolimNom).toBe('Devor');
    expect(ishSummasi(bolimlar[0].ishlar[0], ktx.summa)).toBe(40);
    expect(ishSummasi(bolimlar[0].ishlar[1], ktx.summa)).toBeNull();
  });
  it('filtr + saralash: bo‘lim tartibi saqlanadi, bo‘sh bo‘lim tushadi, ichida — saralangan', () => {
    const n = filtrla(el, u, { mumkin: { son: { amal: '>', a: 1 } } }, { kalit: 'mumkin', yonalish: 'osish' });
    const q = f2QaytaQur(bolimlar, n);
    expect(q.map((b) => [b.id, b.ishlar.map((i) => i.id), b.alohida.map((r) => r.id)])).toEqual([[1, [11, 10], []], [2, [20], []]]);
    const q2 = f2QaytaQur(bolimlar, filtrla(el, u, { holat: { tanlangan: ['Kiritilgan'] } }));
    expect(q2.map((b) => b.id)).toEqual([1]);
    expect(q2[0].ishlar.map((i) => i.id)).toEqual([10]);
  });
  it('resurs ustunlari: ishdan chiqarilgan — holatda', () => {
    const ru = f2ResursUstunlar(ktx);
    const rs = [res(1, 'A'), res(2, 'B', { chiqarilgan: true })];
    expect(filtrla(rs, ru, { holat: { matn: { amal: 'ichida', q: 'chiqarilgan' } } }).map((r) => r.id)).toEqual([2]);
  });
});
