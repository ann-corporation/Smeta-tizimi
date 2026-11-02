/**
 * F2 import uchun Nakopitelniy → (tasdiqlangan hajm, qoldiq) xaritalari.
 *
 * Unumdorlik (prod profil 2026-10-24, Sun'iy ko'l 25k qator): butun Nakopitelniy (faqat_faol=0) 6 sahifa × ~3 MB, har biri
 * 10–13 s. F2 import faqat F2/fakt harakati bor qatorlarni ishlatadi; qolgan qatorlarda tasdiqlangan hajm 0 va qoldiq = smeta
 * hajmi. Shuning uchun server faqat faol qatorlarni beradi (faqat_faol=1), qolganlari smetadan AYNAN shu qiymat bilan to'ldiriladi —
 * natija to'liq Nakopitelniy bilan bir xil (test: nakQoldiq.test.ts).
 *
 * Zamena: server `almashtirilgan_hajm` beradi (aslning zamenalari qoplagan qismi; zamenasi bor asl qatorlar faol hisoblanadi) —
 * qoldiq = smeta − tasdiqlangan − almashtirilgan (lib/zamena-qoldiq: yagona ta'rif).
 */
import { qoldiqHajmi } from '../zamena-qoldiq';

export interface NakQator {
  qator_id: number; jami_hajm?: number | null; oldingi_hajm?: number | null; joriy_hajm?: number | null; smeta_hajm: number | null;
  almashtirilgan_hajm?: number | null;
}

export function nakQoldiqXaritalari(
  nak: readonly NakQator[], smeta: ReadonlyArray<{ id: number; hajm: number | null }> | null,
): { old: Map<number, number>; qol: Map<number, number>; alm: Map<number, number> } {
  const old = new Map<number, number>(), qol = new Map<number, number>(), alm = new Map<number, number>();
  for (const q of nak) {
    const tasd = q.jami_hajm ?? ((q.oldingi_hajm ?? 0) + (q.joriy_hajm ?? 0));
    old.set(q.qator_id, tasd);
    if ((q.almashtirilgan_hajm ?? 0) > 0) alm.set(q.qator_id, q.almashtirilgan_hajm as number);
    const qh = qoldiqHajmi(q.smeta_hajm, tasd, q.almashtirilgan_hajm);
    if (qh != null) qol.set(q.qator_id, qh);
  }
  // Faol bo'lmagan qatorlar: tasdiqlangan F2 hajmi 0, qoldiq = smeta hajmi (to'liq Nakopitelniy bilan aynan bir xil).
  if (smeta) for (const s of smeta) {
    if (old.has(s.id)) continue;
    old.set(s.id, 0);
    if (s.hajm != null) qol.set(s.id, s.hajm - 0);
  }
  return { old, qol, alm };
}
