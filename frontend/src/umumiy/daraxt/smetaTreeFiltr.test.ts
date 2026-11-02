import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../api/types';
import { filtrla, noyobQiymatlar, BOSH } from '../jadval-filtr/ustunFiltr';
import { bajarilishFoizi, daraxtniKes, daraxtniYassila, LRV_DARAXT, lrvUstunlar, type LrvUstunKalit } from './smetaTreeFiltr';

const n = (id: number, type: TreeNode['type'], p: Partial<TreeNode> = {}, children?: TreeNode[]): TreeNode =>
  ({ id, type, nom: `N${id}`, varaq: 'v', row: id, smetaHajm: null, smeta: null, narx: null, fakt: null, qoldiq: null, f2ol: 0, f2mum: 0, ...p, children }) as TreeNode;

const data: TreeNode[] = [
  n(1, 'rz', { nom: 'Razdel A' }, [
    n(2, 'rz', { nom: 'Bo‘lim' }, [
      n(3, 'bl', { kod: 'E1', birlik: 'm3', smetaHajm: 10, fakt: 5 }, [
        n(4, 'mat', { kod: 'M1', birlik: 't', smetaHajm: 2, fakt: 0 }),
        n(5, 'rs', { kod: 'R1', birlik: 'kg', smetaHajm: null }),
      ]),
    ]),
    n(6, 'bl', { kod: 'E2', birlik: 'm2', smetaHajm: 4, fakt: 4 }),
  ]),
  n(7, 'rz', { nom: 'Razdel B' }, [n(8, 'bl', { kod: 'E3', birlik: 'm3', smetaHajm: 1, f2ol: 1 })]),
];
const nomlar = new Proxy({}, { get: (_, k) => String(k) }) as Record<LrvUstunKalit, string>;
const ustunlar = lrvUstunlar(nomlar, () => null);
const ids = (nodes: TreeNode[]): number[] => daraxtniYassila(nodes).map((r) => r.node.id!);

describe('LRV smeta daraxti ustun filtri', () => {
  it('yassilash tartibni va ota kalitini saqlaydi', () => {
    const t = daraxtniYassila(data);
    expect(t.map((r) => r.node.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(t[3].ota).toBe('t2:3');
    expect(t[0].ota).toBeNull();
  });

  it('mos ish/resurs qatori ota-bobolari bilan qoladi, boshqa shoxlar kesiladi', () => {
    const t = daraxtniYassila(data);
    const r = filtrla(t, ustunlar, { birlik: { tanlangan: ['kg'] } }, null, LRV_DARAXT);
    const kes = daraxtniKes(data, new Set(r.map((x) => x.key)));
    expect(ids(kes)).toEqual([1, 2, 3, 5]);
    expect(kes[0].children![0].children![0].children!.map((c) => c.id)).toEqual([5]);
  });

  it('razdel nomi filtrlanmaydi (faqat barglar)', () => {
    const r = filtrla(daraxtniYassila(data), ustunlar, { nom: { matn: { amal: 'ichida', q: 'Razdel' } } }, null, LRV_DARAXT);
    expect(r).toEqual([]);
  });

  it('son sharti va NULL ≠ 0: smeta hajmi bo‘sh qator «(bo‘sh)» bo‘lib alohida turadi', () => {
    const t = daraxtniYassila(data);
    const u = ustunlar.find((x) => x.kalit === 'smetaHajm')!;
    const q = noyobQiymatlar(t, ustunlar, u, {}, LRV_DARAXT.barg);
    expect(q.map((x) => x.kalit)).toEqual(['1', '2', '4', '10', BOSH]);
    const r = filtrla(t, ustunlar, { smetaHajm: { son: { amal: '>=', a: 4 } } }, null, LRV_DARAXT);
    expect(ids(daraxtniKes(data, new Set(r.map((x) => x.key))))).toEqual([1, 2, 3, 6]);
  });

  it('bajarilish foizi qator chizig‘i bilan bir xil; smeta noma’lum yoki razdel — bo‘sh', () => {
    expect(bajarilishFoizi(n(1, 'bl', { smetaHajm: 10, fakt: 5, f2ol: 7 }))).toBe(70);
    expect(bajarilishFoizi(n(1, 'bl', { smetaHajm: null, fakt: 5 }))).toBeNull();
    expect(bajarilishFoizi(n(1, 'rz', { smetaHajm: 10, fakt: 5 }))).toBeNull();
  });

  it('25 000 qatorda chiziqli ishlaydi', () => {
    const katta: TreeNode[] = Array.from({ length: 50 }, (_, i) => n(1e6 + i, 'rz', {}, Array.from({ length: 500 }, (_, j) => n(i * 1000 + j, 'bl', { birlik: j % 2 ? 'm3' : 't', smetaHajm: j }))));
    const t0 = performance.now();
    const t = daraxtniYassila(katta);
    const r = filtrla(t, ustunlar, { birlik: { tanlangan: ['m3'] } }, null, LRV_DARAXT);
    const kes = daraxtniKes(katta, new Set(r.map((x) => x.key)));
    expect(t.length).toBe(25050);
    expect(kes.length).toBe(50);
    expect(kes[0].children!.length).toBe(250);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
