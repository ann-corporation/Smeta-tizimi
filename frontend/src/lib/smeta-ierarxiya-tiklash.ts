/**
 * Bo'lim ierarxiyasini asl fayldan tiklash rejasi (egasi talabi 2026-10-08, PTO_PRO_V1_DIREKTIVA §7a):
 * "Административное здание › КЖ › Земляные работы" o'rniga faqat "Земляные работы" ko'rinishi — rasvo.
 *
 * 2026-09-23 gacha yuklangan smetalar eski tekis o'quvchi bilan saqlangan: har ishli bo'lim (rz) ildizda,
 * ota bo'limlar ("СМЕТА № 01-01…", "КЖ") yo'qolgan. Hozirgi anatomiya o'quvchisi aynan shu fayldan to'liq
 * daraxtni o'qiydi (isbot: obyekt 84 va 91 bir fayl — 91 ichma-ich saqlangan).
 *
 * Reja faqat FAYLDAN quriladi: ishli bo'limlar fayl tartibida (`ishli[i]` — bazadagi i-chi rz qatori) va
 * yo'qolgan ota bo'limlar (`yangi`). Moslikni server (`t2_smeta_ierarxiya_tikla_v1`) o'zi tekshiradi: rz
 * soni, har birining nomi va bevosita ish soni bir xil bo'lmasa — RAD ETADI (taxmin yo'q). Mavjud
 * qatorlarning id/nom/hajm/narx/summa o'zgarmaydi; F2 akt bog'lanishlari (qator_id) saqlanadi.
 */
import type { AktNode } from './f2-match-engine/types';

/** Ota havolasi: null — ildiz; son — `ishli` indeksi; 'yN' — `yangi` kaliti. */
export type OtaRef = number | string | null;
export type IshliBolim = { nom: string; ishSoni: number; ota: OtaRef };
export type YangiBolim = { k: string; nom: string; ota: OtaRef };
export type IerarxiyaRejasi = { ishli: IshliBolim[]; yangi: YangiBolim[]; maxChuqurlik: number; yollar: string[] };

/** Server bilan bir xil normallashtirish: bo'shliqlar yig'iladi, chetlari kesiladi (registr o'zgarmaydi). */
export const bolimNomKalit = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

type Manba = { node: AktNode; ota: Manba | null; ishSoni: number; chuqurlik: number };

export function ierarxiyaTiklashRejasi(tree: readonly AktNode[]): IerarxiyaRejasi {
  const manba: Manba[] = [];
  const yur = (nodes: readonly AktNode[], ota: Manba | null, d: number) => {
    for (const n of nodes) {
      if (n.type !== 'rz') continue;
      const bolalar = n.children ?? [];
      const m: Manba = { node: n, ota, ishSoni: bolalar.filter((c) => c.type !== 'rz').length, chuqurlik: d };
      manba.push(m);
      yur(bolalar, m, d + 1);
    }
  };
  yur(tree, null, 0);
  const ref = new Map<Manba, Exclude<OtaRef, null>>();
  const ishliM = manba.filter((m) => m.ishSoni > 0);
  ishliM.forEach((m, i) => ref.set(m, i));
  const yangi: YangiBolim[] = [];
  let n = 0;
  for (const m of manba) {
    if (ref.has(m)) continue;
    const k = `y${++n}`;
    ref.set(m, k);
    yangi.push({ k, nom: bolimNomKalit(m.node.nom) || 'Раздел', ota: m.ota ? ref.get(m.ota)! : null });
  }
  const yol = (m: Manba): string[] => (m.ota ? [...yol(m.ota), m.node.nom ?? ''] : [m.node.nom ?? '']);
  return {
    ishli: ishliM.map((m) => ({ nom: bolimNomKalit(m.node.nom), ishSoni: m.ishSoni, ota: m.ota ? ref.get(m.ota)! : null })),
    yangi,
    maxChuqurlik: Math.max(0, ...manba.map((m) => m.chuqurlik + 1)),
    yollar: ishliM.map((m) => yol(m).join(' › ')),
  };
}

/** RPC yuki: ixcham massivlar (katta smetada ham kichik). */
export function rejaYuki(r: IerarxiyaRejasi): { ishli: [OtaRef, number, string][]; yangi: [string, OtaRef, string][] } {
  return {
    ishli: r.ishli.map((x) => [x.ota, x.ishSoni, x.nom]),
    yangi: r.yangi.map((x) => [x.k, x.ota, x.nom]),
  };
}
