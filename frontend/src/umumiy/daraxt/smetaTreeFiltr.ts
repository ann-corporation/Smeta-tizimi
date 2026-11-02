import type { TreeNode } from '../../api/types';
import type { Daraxt, Ustun } from '../jadval-filtr/ustunFiltr';
import { nodeKey } from './utils';

/**
 * LRV smeta daraxti uchun Excel uslubidagi ustun filtrlari (egasi 2026-10-27).
 * Ichma-ich `TreeNode[]` → yassi ro'yxat (umumiy `filtrla` shuni kutadi) → mos kalitlar → daraxtni qayta kesish.
 * Hammasi O(n): har tugun bir marta yuriladi.
 */
export type TekisTugun = { node: TreeNode; key: string; ota: string | null };

/** Daraxtni yassilaydi (yig'ilgan/yoyilganidan qat'i nazar — hamma tugunlar). Iterativ, tartib saqlanadi. */
export function daraxtniYassila(nodes: readonly TreeNode[]): TekisTugun[] {
  const out: TekisTugun[] = [];
  const stack: { n: TreeNode; ota: string | null }[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push({ n: nodes[i], ota: null });
  while (stack.length) {
    const c = stack.pop()!;
    const key = nodeKey(c.n);
    out.push({ node: c.n, key, ota: c.ota });
    const kids = c.n.children;
    if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push({ n: kids[i], ota: key });
  }
  return out;
}

/** Filtr faqat ish/resurs qatorlarida (razdel emas); razdel/bo'lim mos qatorning otasi sifatida ko'rinadi. */
export const LRV_DARAXT: Daraxt<TekisTugun> = { id: (r) => r.key, ota: (r) => r.ota, barg: (r) => r.node.type !== 'rz' };

/**
 * Tezkor filtr «Asl smeta / Qo'shimcha / Zamena» mosligi (egasi 2026-10-29; `t2_qator.change_type`, lib/lrv-ozgarish).
 * Zamena filtrida almashtirilgan asl qatorlar ham ko'rinadi (zamena nimani almashtirgani yonma-yon bo'lsin).
 */
export function ozgarishFiltrMos(n: TreeNode, f: 'asl' | 'qosh' | 'zamena'): boolean {
  if (f === 'asl') return (n.ozgarishGuruh ?? 'asl') === 'asl';
  if (f === 'qosh') return !!n.isQosh;
  return !!n.isZamena || !!n.almashtirganlar?.length;
}

/** Qatordagi «Bajarilish» foizi — qator chizig'i bilan bir xil formula; smeta noma'lum yoki razdel bo'lsa — bo'sh (0 emas). */
export function bajarilishFoizi(n: TreeNode): number | null {
  const sm = n.smetaHajm;
  if (sm == null || !(sm > 0) || n.type === 'rz') return null;
  const fk = Math.max(Number(n.fakt ?? 0), 0), f2 = Math.max(Number(n.f2ol ?? 0), 0);
  return Math.round((Math.max(fk, f2) / sm) * 100);
}

/** Mos kalitlar bo'yicha daraxtni kesadi: faqat `qol` dagi tugunlar qoladi (bolalari ham shu qoida bilan). */
export function daraxtniKes(nodes: readonly TreeNode[], qol: ReadonlySet<string>): TreeNode[] {
  const chiq: TreeNode[] = [];
  for (const n of nodes) {
    if (!qol.has(nodeKey(n))) continue;
    chiq.push(n.children?.length ? { ...n, children: daraxtniKes(n.children, qol) } : n);
  }
  return chiq;
}

/** Ustun ta'riflari: qiymatlar qatorda ko'rsatilgan maydonlarning o'zidan o'qiladi. `nomlar` — t() orqali tarjima qilingan sarlavhalar. */
export function lrvUstunlar(nomlar: Record<LrvUstunKalit, string>, narxHolati: (n: TreeNode) => string | null): Ustun<TekisTugun>[] {
  const u = (kalit: LrvUstunKalit, tur: 'matn' | 'son', qiymat: (n: TreeNode) => string | number | null | undefined): Ustun<TekisTugun> =>
    ({ kalit, nom: nomlar[kalit], tur, qiymat: (r) => qiymat(r.node) });
  return [
    u('kod', 'matn', (n) => n.kod),
    u('nom', 'matn', (n) => n.nom),
    u('birlik', 'matn', (n) => n.birlik),
    u('smetaHajm', 'son', (n) => n.smetaHajm),
    u('fakt', 'son', (n) => n.fakt),
    u('f2ol', 'son', (n) => n.f2ol),
    u('foiz', 'son', bajarilishFoizi),
    u('f2mum', 'son', (n) => n.f2mum),
    u('qoldiq', 'son', (n) => n.qoldiq),
    u('narxHolati', 'matn', narxHolati),
    u('smeta', 'son', (n) => n.smeta),
    u('stFakt', 'son', (n) => n.stFakt),
    u('stF2', 'son', (n) => n.stF2),
    u('stF2Mum', 'son', (n) => n.stF2Mum),
    u('stOst', 'son', (n) => n.stOst),
  ];
}
export type LrvUstunKalit = 'kod' | 'nom' | 'birlik' | 'smetaHajm' | 'fakt' | 'f2ol' | 'foiz' | 'f2mum' | 'qoldiq' | 'narxHolati' | 'smeta' | 'stFakt' | 'stF2' | 'stF2Mum' | 'stOst';
